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
    // Stage 2: structured assessment (canonical website-level interpretation)
    assessment:       parseJ(r.assessment)       || null,
    assessmentStatus: r.assessment_status        || null,
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

/**
 * Atomically reserve a scan slot for a free-plan user before running analyzers.
 *
 * Uses a session-level advisory lock (key namespace 1) so that a second
 * simultaneous request for the same userId fails immediately rather than running
 * ~15 s of Lighthouse / SEO / AI work that cannot be saved anyway.
 *
 * Distinct from the transaction-level lock inside saveReport (namespace 0) —
 * different lock IDs, no cross-conflict, no deadlock risk.
 *
 * @param {string} userId
 * @returns {Promise<{release(): Promise<void>}|null>}
 *   An object with release() on success, or null if another scan is already running.
 */
export async function tryScanLock(userId) {
  const db = getPool();
  const client = await db.connect();
  try {
    const row = await client.query(
      'SELECT pg_advisory_try_lock(1, hashtext($1::text)) AS acquired',
      [userId],
    );
    if (!row.rows[0]?.acquired) {
      client.release();
      return null; // another scan is already in progress for this user
    }
    return {
      release: async () => {
        try {
          await client.query(
            'SELECT pg_advisory_unlock(1, hashtext($1::text))',
            [userId],
          );
        } catch (e) {
          console.error('[store] scan lock unlock error:', e.message);
        } finally {
          client.release();
        }
      },
    };
  } catch (e) {
    client.release();
    throw e;
  }
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

// ---------------------------------------------------------------------------
// Stage 2: assessment columns + update helper
// ---------------------------------------------------------------------------

/**
 * Ensure the assessment and assessment_status columns exist on the reports table.
 * Idempotent — safe to call on every boot.
 *
 * assessment        JSONB  — structured website-level interpretation (Stage 2 canonical)
 * assessment_status TEXT   — 'completed' | 'failed' | null (not yet attempted)
 */
export async function ensureAssessmentColumns() {
  const db = getPool();
  try {
    await db.query(`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS assessment        JSONB;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS assessment_status TEXT;
    `);
  } catch (e) {
    console.error('[store] ensureAssessmentColumns error:', e.message);
  }
}

/**
 * Persist (or record failure of) a structured assessment on an existing report.
 * Called after saveRecommendations so fingerprint references are confirmed in DB.
 *
 * @param {number}      reportId
 * @param {object|null} assessment  — validated assessment object, or null on failure
 * @param {'completed'|'failed'} status
 */
export async function updateReportAssessment(reportId, assessment, status) {
  const db = getPool();
  await db.query(
    'UPDATE reports SET assessment = $2, assessment_status = $3 WHERE id = $1',
    [reportId, assessment ? JSON.stringify(assessment) : null, status]
  );
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
// Stage 4: enriched scan history for comparison
// ---------------------------------------------------------------------------

/**
 * Return up to 5 most recent scans for the exact same URL (normalized),
 * including issues (fingerprints + severity) and slim recommendation data.
 *
 * Authorization: caller must supply userId. Returns only reports where
 * user_id matches OR is_public = TRUE. Callers should not expose raw data
 * to users who did not own the report.
 *
 * Returns an empty array when userId is absent or no matching reports found.
 * Payload is intentionally bounded: issues carry fingerprintId + severity + category
 * only; recommendations carry group fingerprint + finding fingerprints + title/priority.
 */
export async function getReportsByDomainFull(url, userId) {
  if (!url || !userId) return [];
  const db = getPool();

  // Match the exact stored URL plus the same URL with/without a trailing slash,
  // since the canonical form may differ slightly from what was saved.
  // The comparison engine (lib/comparison.js) does a final strict URL check.
  const urlNoSlash = url.replace(/\/$/, '');
  const urlSlash   = urlNoSlash + '/';

  let rows;
  try {
    const result = await db.query(
      `SELECT id, slug, url, scores, issues, created_at
       FROM reports
       WHERE url IN ($1, $2)
         AND (user_id = $3 OR is_public = TRUE)
       ORDER BY created_at DESC
       LIMIT 5`,
      [urlNoSlash, urlSlash, userId],
    );
    rows = result.rows;
  } catch (e) {
    console.error('[store] getReportsByDomainFull error:', e.message);
    return [];
  }

  if (!rows.length) return [];

  // Fetch recommendations for each returned report in one query
  const reportIds = rows.map(r => r.id);
  let recsByReport = {};
  try {
    const recsResult = await db.query(
      `SELECT report_id, fingerprint, title, priority, category,
              finding_fingerprints, supporting_findings
       FROM recommendations
       WHERE report_id = ANY($1)
       ORDER BY CASE priority
         WHEN 'critical' THEN 0 WHEN 'high' THEN 1
         WHEN 'medium'   THEN 2 WHEN 'low'  THEN 3 ELSE 4 END,
         created_at ASC`,
      [reportIds],
    );
    for (const row of recsResult.rows) {
      if (!recsByReport[row.report_id]) recsByReport[row.report_id] = [];
      recsByReport[row.report_id].push(row);
    }
  } catch (e) {
    console.error('[store] getReportsByDomainFull recs error:', e.message);
    // Non-fatal — return scans without rec data
  }

  const parseJ = v => { try { return typeof v === 'string' ? JSON.parse(v) : (v || null); } catch { return null; } };

  return rows.map(r => {
    const rawScores = parseJ(r.scores) || {};
    const { auditStatuses = {}, ...scoresRest } = rawScores;

    // Issues: keep only fields required for comparison (bounded payload)
    const rawIssues = parseJ(r.issues) || [];
    const issues = rawIssues
      .filter(i => i?.fingerprintId)
      .map(i => ({
        fingerprintId: i.fingerprintId,
        severity:      i.severity   || null,
        category:      i.category   || i.area || null,
        source:        i.source     || null,
        message:       i.message    || null,
      }));

    // Recs: only fields needed by the comparison engine
    const recs = (recsByReport[r.id] || []).map(rec => {
      const findingFps = parseJ(rec.finding_fingerprints) || [];
      // Also extract fingerprintIds from supporting_findings for older recs
      const supportFps = (parseJ(rec.supporting_findings) || [])
        .map(f => f?.fingerprintId).filter(Boolean);
      return {
        fingerprint:        rec.fingerprint,
        title:              rec.title,
        priority:           rec.priority,
        category:           rec.category,
        finding_fingerprints: [...new Set([...findingFps, ...supportFps])],
      };
    });

    return {
      id:        r.id,
      slug:      r.slug,
      url:       r.url,
      scores: {
        performance:   normalizeScore(scoresRest.performance),
        seo:           normalizeScore(scoresRest.seo),
        security:      normalizeScore(scoresRest.security),
        accessibility: normalizeScore(scoresRest.accessibility),
        ux:            normalizeScore(scoresRest.ux),
      },
      auditStatuses,
      issues,
      recommendations: recs,
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
        supporting_findings  JSONB,
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
      -- Stage 1 migration: add supporting_findings column to existing tables
      ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS supporting_findings JSONB;
      -- Stage 6 migration: add group_key for guided-fix routing
      ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS group_key TEXT;
      -- Backfill: for all existing rows fingerprint = groupKey, so group_key = fingerprint is safe
      UPDATE recommendations SET group_key = fingerprint WHERE group_key IS NULL;
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
           (report_id, user_id, fingerprint, group_key, title, explanation, why_it_matters,
            category, priority, finding_fingerprints, supporting_findings, evidence, actions,
            effort, confidence, verification_approach, status, ai_enriched)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'open',$17)`,
        [
          reportId,
          userId || null,
          rec.fingerprint,
          // group_key: explicit if provided, otherwise falls back to fingerprint
          // (they are identical for all 14 RECOMMENDATION_GROUPS)
          rec.group_key || rec.fingerprint || null,
          rec.title,
          // Stage 1: what_we_found is stored in the 'explanation' column for
          // backward compat. Consumers read it as rec.what_we_found (alias).
          rec.what_we_found  || rec.explanation || null,
          rec.why_it_matters || null,
          rec.category,
          rec.priority,
          rec.finding_fingerprints ? JSON.stringify(rec.finding_fingerprints) : null,
          rec.supporting_findings  ? JSON.stringify(rec.supporting_findings)  : null,
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
    // Stage 1: what_we_found is the canonical field name; explanation is the DB
    // column (kept for backward compat). Both are exposed so existing consumers
    // (DashboardClient fallback: explanation || why_it_matters) keep working
    // while new consumers can reference what_we_found directly.
    what_we_found:        r.explanation  || null,
    explanation:          r.explanation  || null,
    why_it_matters:       r.why_it_matters,
    category:             r.category,
    priority:             r.priority,
    finding_fingerprints: parseJ(r.finding_fingerprints) || [],
    supporting_findings:  parseJ(r.supporting_findings)  || null,
    evidence:             parseJ(r.evidence)  || null,
    actions:              parseJ(r.actions)   || null,
    effort:               r.effort,
    confidence:           r.confidence,
    verification_approach:r.verification_approach,
    status:               r.status,
    aiEnriched:           !!r.ai_enriched,
    group_key:            r.group_key    || null,
    createdAt:            r.created_at,
    updated_at:           r.updated_at   || r.created_at || null,
    guidance_plan:        parseJ(r.guidance_plan) || null,
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

// ---------------------------------------------------------------------------
// Work Items — user workflow status for recommendations (Stage 5)
//
// Identity model:
//   scope_key = normalized domain     for site-wide fingerprints (security-headers, https-enforcement)
//   scope_key = normalized page URL   for all other (page-scoped) fingerprints
//
// This ensures two different pages with the same recommendation fingerprint
// each maintain their own independent workflow status.
// ---------------------------------------------------------------------------

/** Fingerprints that apply to the whole domain, not a specific page. */
const SITE_WIDE_FINGERPRINTS = ['security-headers', 'https-enforcement'];

/**
 * Derive the scope_key for a work item.
 * @param {string} fingerprint  - recommendation fingerprint
 * @param {string} pageUrl      - the scanned page URL
 * @returns {string|null}       - normalized scope key or null on parse error
 */
export function deriveWorkItemScopeKey(fingerprint, pageUrl) {
  if (!pageUrl) return null;
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    if (SITE_WIDE_FINGERPRINTS.includes(fingerprint)) {
      // Site-wide: key by normalized domain (scheme+host+port)
      return `${u.protocol.toLowerCase()}//${host}${port}`;
    }
    // Page-scoped: key by normalized URL (no query, no hash, no trailing slash)
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${u.protocol.toLowerCase()}//${host}${port}${path}`;
  } catch {
    return null;
  }
}

/** Create the work_items table if it does not exist (idempotent). */
export async function ensureWorkItemsTable() {
  const db = getPool();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS work_items (
        id                SERIAL       PRIMARY KEY,
        user_id           TEXT         NOT NULL,
        rec_fingerprint   TEXT         NOT NULL,
        scope_key         TEXT         NOT NULL,
        user_status       TEXT         NOT NULL DEFAULT 'open'
                          CHECK (user_status IN ('open','in_progress','verify','dismissed')),
        verified_status   TEXT         CHECK (verified_status IN
                            ('still_detected','likely_resolved','partially_resolved','unable_to_verify')),
        verified_report_id INTEGER     REFERENCES reports(id) ON DELETE SET NULL,
        verified_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, rec_fingerprint, scope_key)
      );
      CREATE INDEX IF NOT EXISTS work_items_user_idx ON work_items (user_id);
      CREATE INDEX IF NOT EXISTS work_items_scope_idx ON work_items (user_id, scope_key);
    `);
  } catch (e) {
    console.error('[store] ensureWorkItemsTable error:', e.message);
  }
}

/**
 * Upsert a work item's user_status.
 * Creates the row if it doesn't exist; updates user_status and updated_at if it does.
 * Returns the updated row.
 */
export async function upsertWorkItem(userId, { recFingerprint, scopeKey, userStatus }) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO work_items (user_id, rec_fingerprint, scope_key, user_status, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, rec_fingerprint, scope_key)
     DO UPDATE SET user_status = EXCLUDED.user_status, updated_at = NOW()
     RETURNING *`,
    [userId, recFingerprint, scopeKey, userStatus]
  );
  return result.rows[0] || null;
}

/**
 * Load all work items for a user scoped to a particular page URL.
 * For site-wide recs the scope_key will be the domain, so they are included
 * when the domain matches the given URL.
 */
export async function getWorkItemsByUrl(userId, pageUrl) {
  const db = getPool();
  // Derive scope keys: page URL and its domain (for site-wide recs)
  let pageScopeKey = null;
  let domainScopeKey = null;
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    const scheme = u.protocol.toLowerCase();
    domainScopeKey = `${scheme}//${host}${port}`;
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    pageScopeKey = `${scheme}//${host}${port}${path}`;
  } catch {
    return [];
  }
  const result = await db.query(
    `SELECT * FROM work_items
     WHERE user_id = $1 AND scope_key IN ($2, $3)
     ORDER BY updated_at DESC`,
    [userId, pageScopeKey, domainScopeKey]
  );
  return result.rows;
}

/**
 * Persist the outcome of a server-side verification.
 * Only updates verified_status, verified_report_id, and verified_at.
 * The user_status is NOT changed here — that is the user's own field.
 */
export async function setVerifiedStatus(userId, { recFingerprint, scopeKey, verifiedStatus, verifiedReportId }) {
  const db = getPool();
  const result = await db.query(
    `UPDATE work_items
     SET verified_status    = $4,
         verified_report_id = $5,
         verified_at        = NOW(),
         updated_at         = NOW()
     WHERE user_id = $1 AND rec_fingerprint = $2 AND scope_key = $3
     RETURNING *`,
    [userId, recFingerprint, scopeKey, verifiedStatus, verifiedReportId || null]
  );
  return result.rows[0] || null;
}

/**
 * Get a single report row including recommendations and issues — used by
 * the verify endpoint to assemble scan objects for compareScans().
 */
export async function getReportWithData(reportId, userId) {
  const db = getPool();
  const repResult = await db.query(
    `SELECT * FROM reports WHERE id = $1 AND (user_id = $2 OR is_public = TRUE)`,
    [reportId, userId]
  );
  const rep = repResult.rows[0];
  if (!rep) return null;
  const recs = await getRecommendationsByReport(reportId);
  const row = mapRow(rep);
  return { ...row, recommendations: recs };
}

// Create or update a subscription row (called from Stripe webhook)
// ---------------------------------------------------------------------------
// Guidance — plan caching + per-user step progress (Stage 6 / PoC)
// ---------------------------------------------------------------------------

/**
 * Idempotent migration: add guidance columns if they do not yet exist.
 * Call once at boot from /api/guide-plan before any write.
 */
export async function ensureGuidanceColumns() {
  const db = getPool();
  try {
    await db.query(`
      ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS guidance_plan JSONB DEFAULT NULL;
      ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS group_key TEXT;
      ALTER TABLE work_items      ADD COLUMN IF NOT EXISTS guide_progress JSONB DEFAULT NULL;
      -- Backfill group_key from fingerprint (they are identical for all 14 groups)
      UPDATE recommendations SET group_key = fingerprint WHERE group_key IS NULL;
    `);
  } catch (e) {
    console.error('[store] ensureGuidanceColumns error:', e.message);
  }
}

/**
 * Return the cached guidance_plan for a recommendation row.
 * Returns null when the column doesn't exist yet or is empty.
 */
export async function getGuidancePlan(recFingerprint, userId) {
  const db = getPool();
  try {
    const result = await db.query(
      `SELECT guidance_plan, updated_at FROM recommendations
       WHERE fingerprint = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [recFingerprint, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      plan: parseJ(row.guidance_plan),
      recUpdatedAt: row.updated_at,
    };
  } catch (e) {
    console.error('[store] getGuidancePlan error:', e.message);
    return null;
  }
}

/**
 * Persist an AI-generated guidance plan to the recommendation row.
 */
export async function setGuidancePlan(recFingerprint, userId, plan) {
  const db = getPool();
  try {
    await db.query(
      `UPDATE recommendations
       SET guidance_plan = $3
       WHERE fingerprint = $1 AND user_id = $2`,
      [recFingerprint, userId, JSON.stringify(plan)]
    );
  } catch (e) {
    console.error('[store] setGuidancePlan error:', e.message);
    throw e;
  }
}

/**
 * Upsert guide_progress for a work item.
 * guide_progress is merged (JSONB || $4) so only supplied keys are changed.
 */
export async function updateGuideProgress(userId, { recFingerprint, scopeKey, guideProgress }) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO work_items (user_id, rec_fingerprint, scope_key, user_status, guide_progress, updated_at)
     VALUES ($1, $2, $3, 'in_progress', $4, NOW())
     ON CONFLICT (user_id, rec_fingerprint, scope_key)
     DO UPDATE SET
       guide_progress = COALESCE(work_items.guide_progress, '{}'::jsonb) || $4::jsonb,
       user_status    = CASE WHEN work_items.user_status = 'open' THEN 'in_progress' ELSE work_items.user_status END,
       updated_at     = NOW()
     RETURNING *`,
    [userId, recFingerprint, scopeKey, JSON.stringify(guideProgress)]
  );
  return result.rows[0] || null;
}

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
