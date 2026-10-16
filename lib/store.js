// Database store — PostgreSQL via pg
// Tables: reports, purchases, subscriptions

import { Pool } from 'pg';

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

// Save an analysis result, return a reportId
// uxInsights and siteType are folded into the scores JSONB so no migration needed
export async function saveReport({ url, scores, issues, aiSummary, siteType, uxInsights, lhData, seoData, sslData, a11yData, userId = null }) {
  const db = getPool();
  // Embed ux metadata into the scores object so it round-trips without a schema change
  const scoresWithMeta = { ...scores };
  if (siteType) scoresWithMeta._siteType = siteType;
  if (uxInsights) scoresWithMeta._uxInsights = uxInsights;

  const result = await db.query(
    `INSERT INTO reports (url, scores, issues, ai_summary, lh_data, seo_data, ssl_data, a11y_data, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING id`,
    [
      url,
      JSON.stringify(scoresWithMeta),
      JSON.stringify(issues),
      aiSummary,
      JSON.stringify(lhData),
      JSON.stringify(seoData),
      JSON.stringify(sslData),
      JSON.stringify(a11yData),
      userId,
    ]
  );
  return result.rows[0].id;
}

// Get a report by id
export async function getReport(reportId) {
  const db = getPool();
  const result = await db.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!result.rows[0]) return null;
  const r = result.rows[0];
  // Extract ux metadata folded into scores (backward-compat with old reports that don't have them)
  const rawScores = r.scores || {};
  const { _siteType, _uxInsights, ...scores } = rawScores;
  return {
    id: r.id,
    url: r.url,
    scores,
    issues: r.issues,
    aiSummary: r.ai_summary,
    siteType: _siteType || null,
    uxInsights: _uxInsights || null,
    lhData: r.lh_data,
    seoData: r.seo_data,
    sslData: r.ssl_data,
    a11yData: r.a11y_data,
    createdAt: r.created_at,
    paid: r.paid,
    userId: r.user_id,
  };
}

// Mark a report as paid (after Stripe webhook)
export async function markReportPaid(reportId, userId = null) {
  const db = getPool();
  await db.query(
    'UPDATE reports SET paid = true, user_id = $2 WHERE id = $1',
    [reportId, userId]
  );
}

// Get user's reports
export async function getUserReports(userId) {
  const db = getPool();
  const result = await db.query(
    'SELECT id, url, scores, ai_summary, created_at, paid FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  return result.rows;
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
