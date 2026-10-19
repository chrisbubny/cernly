// Database store — PostgreSQL via pg
// Tables: reports, purchases, subscriptions

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

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

// Save an analysis result, return { id, slug }
export async function saveReport({ url, scores, issues, aiSummary, siteType, uxScore, uxInsights, uxAnnotations, aiInsights, sectionSummaries, lhData, seoData, sslData, a11yData, userId = null }) {
  const db = getPool();
  const slug = randomUUID();
  const result = await db.query(
    `INSERT INTO reports (url, scores, issues, ai_summary, site_type, ux_score, ux_insights, ux_annotations, ai_insights, lh_data, seo_data, ssl_data, a11y_data, user_id, slug, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     RETURNING id, slug`,
    [
      url,
      JSON.stringify(scores),
      JSON.stringify(issues),
      aiSummary,
      siteType || null,
      uxScore ?? null,
      uxInsights      ? JSON.stringify(uxInsights)      : null,
      uxAnnotations   ? JSON.stringify(uxAnnotations)   : null,
      // Pack discoveries + sectionSummaries into ai_insights as one object
      (aiInsights || sectionSummaries)
        ? JSON.stringify({ discoveries: aiInsights || null, sectionSummaries: sectionSummaries || null })
        : null,
      JSON.stringify(lhData),
      JSON.stringify(seoData),
      JSON.stringify(sslData),
      JSON.stringify(a11yData),
      userId,
      slug,
    ]
  );
  return result.rows[0]; // { id, slug }
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
  return result.rows.map(r => ({
    id: r.id,
    slug: r.slug,
    url: r.url,
    scores: (() => { try { return typeof r.scores === 'string' ? JSON.parse(r.scores) : r.scores; } catch { return {}; } })(),
    aiSummary: r.ai_summary,
    createdAt: r.created_at,
  }));
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
