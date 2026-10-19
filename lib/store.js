// Database store — PostgreSQL via pg
// Tables: reports, purchases, subscriptions

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { normalizeScore } from '@/lib/scoring';

let pool;
function getPool() {
  if (!pool) {
    // Strip sslmode; replace any injected DB name with the one we actually use
    const dbUrl = (process.env.DATABASE_URL || '')
      .replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
      .replace(/\/[^/?]+$/, '/defaultdb');
    pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, options: '--search_path=app' });
  }
  return pool;
}

// Ensure the slug column exists (idempotent — safe to call on every boot)
export async function ensureSlugColumn() {
  const db = getPool();
  try {
    await db.query(`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS slug TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS reports_slug_idx ON reports (slug) WHERE slug IS NOT NULL;
    `);
    // Backfill any rows that are missing a slug
    await db.query(`
      UPDATE reports SET slug = gen_random_uuid()::text WHERE slug IS NULL;
    `);
  } catch (e) {
    console.error('[store] ensureSlugColumn error:', e.message);
  }
}

// Ensure the is_public column exists (idempotent — safe to call on every boot)
export async function ensurePublicColumn() {
  const db = getPool();
  try {
    await db.query(`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
    `);
  } catch (e) {
    console.error('[store] ensurePublicColumn error:', e.message);
  }
}

// Toggle (or set) the is_public flag on a report — only if owned by userId
export async function setReportPublic(reportId, userId, isPublic) {
  const db = getPool();
  const result = await db.query(
    'UPDATE reports SET is_public = $3 WHERE id = $1 AND user_id = $2 RETURNING id, is_public',
    [reportId, userId, isPublic]
  );
  return result.rows[0] || null;
}

const parseJ = (v) => {
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v;
};

function mapRow(r) {
  // Separate auditStatuses from numeric scores so consumers always receive
  // a clean scores object and auditStatuses as a top-level field.
  // auditStatuses is nested inside the scores JSONB for backward compat
  // (no DB migration required); we extract it here on read.
  const rawScores = parseJ(r.scores) || {};
  const { auditStatuses: extractedStatuses, ...numericScores } = rawScores;

  return {
    id: r.id,
    slug: r.slug,
    url: r.url,
    scores: numericScores,
    auditStatuses: extractedStatuses || {},
    issues: parseJ(r.issues) || [],
    aiSummary: r.ai_summary,
    siteType: r.site_type || null,
    uxScore: r.ux_score ?? null,
    uxInsights:    parseJ(r.ux_insights)    || null,
    uxAnnotations: parseJ(r.ux_annotations) || null,
    // ai_insights may be: null | discoveries[] (legacy) | { discoveries, sectionSummaries } (new)
    aiInsights:       (() => { const d = parseJ(r.ai_insights); if (!d) return null; return Array.isArray(d) ? d : (d.discoveries || null); })(),
    sectionSummaries: (() => { const d = parseJ(r.ai_insights); if (!d || Array.isArray(d)) return null; return d.sectionSummaries || null; })(),
    lhData: parseJ(r.lh_data),
    seoData: parseJ(r.seo_data),
    sslData: parseJ(r.ssl_data),
    a11yData: parseJ(r.a11y_data),
    createdAt: r.created_at,
    paid: r.paid,
    userId: r.user_id,
    isPublic: !!r.is_public,
  };
}

// ---------------------------------------------------------------------------
// Scan limit helpers
// ---------------------------------------------------------------------------

const FREE_SCAN_LIMIT = 3;
export { FREE_SCAN_LIMIT };

/**
 * Count how many reports this user has saved in the current calendar month (UTC).
 * Used for the pre-flight check in analyze/route.js before starting analyzers.
 * Not atomic — use saveReport's scanLimit parameter for the authoritative check.
 */
export async function getMonthlyScansCount(userId) {
  const db = getPool();
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM reports
     WHERE user_id = $1
       AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// INSERT SQL and params — shared by both saveReport paths
// ---------------------------------------------------------------------------

const REPORT_INSERT_SQL = `
  INSERT INTO reports
    (url, scores, issues, ai_summary, site_type, ux_score, ux_insights,
     ux_annotations, ai_insights, lh_data, seo_data, ssl_data, a11y_data,
     user_id, slug, created_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
  RETURNING id, slug
`;

function buildReportParams({ url, scores, issues, aiSummary, siteType, uxScore, uxInsights, uxAnnotations, aiInsights, sectionSummaries, lhData, seoData, sslData, a11yData, userId, slug }) {
  return [
    url,
    JSON.stringify(scores),
    JSON.stringify(issues),
    aiSummary,
    siteType || null,
    uxScore ?? null,
    uxInsights    ? JSON.stringify(uxInsights)    : null,
    uxAnnotations ? JSON.stringify(uxAnnotations) : null,
    // Pack discoveries + sectionSummaries into ai_insights as one JSONB object
    (aiInsights || sectionSummaries)
      ? JSON.stringify({ discoveries: aiInsights || null, sectionSummaries: sectionSummaries || null })
      : null,
    JSON.stringify(lhData),
    JSON.stringify(seoData),
    JSON.stringify(sslData),
    JSON.stringify(a11yData),
    userId,
    slug,
  ];
}

/**
 * Save an analysis result.
 *
 * @param {object} opts
 * @param {number|null} [opts.scanLimit] — when set (free-plan users only), enforces the
 *   monthly scan limit atomically using a PostgreSQL advisory lock so concurrent
 *   requests cannot both slip through a pre-check. Returns null when the limit
 *   is reached at save time; caller should surface this to the user.
 *
 * Decision: a report only counts toward the limit when it is *successfully saved*.
 * Failed/errored scans (where no report is persisted) do not consume allowance.
 * Partially completed scans (some analyzers failed but a report was saved) do count.
 *
 * @returns {{ id: number, slug: string } | null}  null = limit hit or DB error
 */
export async function saveReport({
  url, scores, issues, aiSummary, siteType, uxScore, uxInsights, uxAnnotations,
  aiInsights, sectionSummaries, lhData, seoData, sslData, a11yData,
  userId = null,
  scanLimit = null,
}) {
  const db = getPool();
  const slug = randomUUID();
  const params = buildReportParams({
    url, scores, issues, aiSummary, siteType, uxScore, uxInsights,
    uxAnnotations, aiInsights, sectionSummaries, lhData, seoData, sslData,
    a11yData, userId, slug,
  });

  // Atomic enforcement path — only for authenticated, non-Pro users
  if (scanLimit != null && userId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // pg_advisory_xact_lock(int4, int4): blocks until acquired, auto-released on COMMIT/ROLLBACK.
      // This serializes concurrent saves for the same userId so the count stays accurate.
      // hashtext() returns int4; using 0 as the first int4 namespaces our locks.
      await client.query(
        'SELECT pg_advisory_xact_lock(0, hashtext($1::text))',
        [userId]
      );

      const countRow = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM reports
         WHERE user_id = $1
           AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')`,
        [userId]
      );
      const used = countRow.rows[0]?.cnt ?? 0;

      if (used >= scanLimit) {
        await client.query('ROLLBACK');
        return null; // Caller interprets null + scanLimit set = limit exceeded
      }

      const result = await client.query(REPORT_INSERT_SQL, params);
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  // Direct insert — Pro users, anonymous scans, or no limit enforcement
  const result = await db.query(REPORT_INSERT_SQL, params);
  return result.rows[0] || null; // { id, slug }
}

// Get a report by integer id (internal use only)
export async function getReport(reportId) {
  const db = getPool();
  const result = await db.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0]);
}

// Get a report by slug (public-facing URL)
export async function getReportBySlug(slug) {
  const db = getPool();
  const result = await db.query('SELECT * FROM reports WHERE slug = $1', [slug]);
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0]);
}

// Patch ux_annotations onto an existing report (called from /api/vision)
export async function updateReportAnnotations(reportId, uxAnnotations) {
  const db = getPool();
  await db.query(
    'UPDATE reports SET ux_annotations = $2 WHERE id = $1',
    [reportId, JSON.stringify(uxAnnotations)]
  );
}

// Mark a report as paid (after Stripe webhook)
export async function markReportPaid(reportId, userId = null) {
  const db = getPool();
  await db.query(
    'UPDATE reports SET paid = true, user_id = $2 WHERE id = $1',
    [reportId, userId]
  );
}

// Get user's reports (returns id + slug so dashboard can build URLs)
export async function getUserReports(userId) {
  const db = getPool();
  const result = await db.query(
    'SELECT id, slug, url, scores, ai_summary, created_at, paid, is_public FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  return result.rows;
}

// Delete a report (only if owned by userId)
export async function deleteReport(reportId, userId) {
  const db = getPool();
  const result = await db.query(
    'DELETE FROM reports WHERE id = $1 AND user_id = $2 RETURNING id',
    [reportId, userId]
  );
  return result.rowCount > 0;
}

// Check if user has active subscription
export async function getUserSubscription(userId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
    [userId, 'active']
  );
  return result.rows[0] || null;
}

// Get all scans for a given domain (hostname), most recent first
export async function getReportsByDomain(domain) {
  const db = getPool();
  // Match by hostname — strip protocol, www, trailing slash
  const pattern = `%${domain.replace(/^www\./, '')}%`;
  const result = await db.query(
    `SELECT id, slug, url, scores, ai_summary, created_at FROM reports
     WHERE url ILIKE $1
     ORDER BY created_at DESC LIMIT 20`,
    [pattern]
  );
  return result.rows.map(r => {
    // Parse and normalize scores — mirrors what mapRow() does, preventing NaN
    // from reaching any consumer doing arithmetic on the returned values.
    // auditStatuses is extracted and discarded here (scan-history consumers don't need it).
    const rawScores = (() => { try { return typeof r.scores === 'string' ? JSON.parse(r.scores) : (r.scores || {}); } catch { return {}; } })();
    const { auditStatuses: _ignored, ...rest } = rawScores;
    return {
      id: r.id,
      slug: r.slug,
      url: r.url,
      scores: {
        performance:   normalizeScore(rest.performance),
        seo:           normalizeScore(rest.seo),
        security:      normalizeScore(rest.security),
        accessibility: normalizeScore(rest.accessibility),
        ux:            normalizeScore(rest.ux),
      },
      aiSummary: r.ai_summary,
      createdAt: r.created_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Recommendations — persistent storage for Phase 2+
// ---------------------------------------------------------------------------

// Ensure recommendations table exists (idempotent — safe to call on every boot)
export async function ensureRecommendationsTable() {
  const db = getPool();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS recommendations (
        id                   SERIAL PRIMARY KEY,
        report_id            INTEGER REFERENCES reports(id) ON DELETE CASCADE,
        user_id              TEXT,
        fingerprint          TEXT NOT NULL,
        title                TEXT NOT NULL,
        explanation          TEXT,
        why_it_matters       TEXT,
        category             TEXT NOT NULL,
        priority             TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
        finding_fingerprints JSONB,
        evidence             JSONB,
        actions              JSONB,
        effort               TEXT CHECK (effort IN ('low','medium','high') OR effort IS NULL),
        confidence           TEXT CHECK (confidence IN ('high','medium','low') OR confidence IS NULL),
        verification_approach TEXT,
        status               TEXT NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','in_progress','dismissed','verified')),
        ai_enriched          BOOLEAN NOT NULL DEFAULT FALSE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS recommendations_report_id_idx ON recommendations (report_id);
      CREATE INDEX IF NOT EXISTS recommendations_user_id_idx   ON recommendations (user_id)
        WHERE user_id IS NOT NULL;
    `);
  } catch (e) {
    console.error('[store] ensureRecommendationsTable error:', e.message);
  }
}

/**
 * Persist an array of recommendation objects for a report.
 * Safe to call multiple times — existing rows for the report are deleted
 * and replaced (scan results are immutable; recommendations are regenerated
 * fresh on each scan).
 */
export async function saveRecommendations(reportId, userId, recommendations) {
  if (!reportId || !recommendations?.length) return;
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Remove any stale recommendations for this report (idempotent re-run)
    await client.query('DELETE FROM recommendations WHERE report_id = $1', [reportId]);
    for (const rec of recommendations) {
      await client.query(
        `INSERT INTO recommendations
           (report_id, user_id, fingerprint, title, explanation, why_it_matters,
            category, priority, finding_fingerprints, evidence, actions,
            effort, confidence, verification_approach, status, ai_enriched)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',$15)`,
        [
          reportId,
          userId || null,
          rec.fingerprint,
          rec.title,
          rec.explanation   || null,
          rec.why_it_matters|| null,
          rec.category,
          rec.priority,
          rec.finding_fingerprints ? JSON.stringify(rec.finding_fingerprints) : null,
          rec.evidence   ? JSON.stringify(rec.evidence)   : null,
          rec.actions    ? JSON.stringify(rec.actions)    : null,
          rec.effort     || null,
          rec.confidence || null,
          rec.verification_approach || null,
          rec.aiEnriched ? true : false,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[store] saveRecommendations error:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

function mapRecommendation(r) {
  return {
    id:                   r.id,
    reportId:             r.report_id,
    reportUrl:            r.report_url   || null,
    reportSlug:           r.report_slug  || null,
    userId:               r.user_id,
    fingerprint:          r.fingerprint,
    title:                r.title,
    explanation:          r.explanation,
    why_it_matters:       r.why_it_matters,
    category:             r.category,
    priority:             r.priority,
    finding_fingerprints: parseJ(r.finding_fingerprints) || [],
    evidence:             parseJ(r.evidence)  || null,
    actions:              parseJ(r.actions)   || null,
    effort:               r.effort,
    confidence:           r.confidence,
    verification_approach:r.verification_approach,
    status:               r.status,
    aiEnriched:           !!r.ai_enriched,
    createdAt:            r.created_at,
  };
}

/** Get all recommendations for a specific report */
export async function getRecommendationsByReport(reportId) {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM recommendations WHERE report_id = $1
     ORDER BY
       CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       id`,
    [reportId]
  );
  return result.rows.map(mapRecommendation);
}

/**
 * Get the most recent recommendations across a user's scans.
 * Returns at most one recommendation per (user, fingerprint) — the most recent.
 * This prevents the fix queue from showing duplicate recommendation types
 * across multiple scans of the same site.
 * Includes report_url and report_slug from the joined reports table.
 * Results are sorted by priority (critical → high → medium → low).
 */
export async function getRecommendationsByUser(userId, limit = 20) {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (r.fingerprint, r.user_id)
              r.*,
              rp.url  AS report_url,
              rp.slug AS report_slug
       FROM recommendations r
       JOIN reports rp ON rp.id = r.report_id
       WHERE r.user_id = $1 AND r.status = 'open'
       ORDER BY r.fingerprint, r.user_id, r.created_at DESC
     ) deduped
     ORDER BY
       CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(mapRecommendation);
}

// Create or update a subscription row (called from Stripe webhook)
export async function upsertSubscription({ userId, stripeCustomerId, stripeSubscriptionId, plan, status }) {
  const db = getPool();
  await db.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_sub_id, plan, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (stripe_sub_id)
     DO UPDATE SET status = EXCLUDED.status, plan = EXCLUDED.plan, updated_at = NOW()`,
    [userId, stripeCustomerId, stripeSubscriptionId, plan, status]
  );
}
