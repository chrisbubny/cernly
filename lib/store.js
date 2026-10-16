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
export async function saveReport({ url, scores, issues, aiSummary, siteType, uxScore, uxInsights, uxAnnotations, aiInsights, lhData, seoData, sslData, a11yData, userId = null }) {
  const db = getPool();
  const result = await db.query(
    `INSERT INTO reports (url, scores, issues, ai_summary, site_type, ux_score, ux_insights, ux_annotations, ai_insights, lh_data, seo_data, ssl_data, a11y_data, user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
     RETURNING id`,
    [
      url,
      JSON.stringify(scores),
      JSON.stringify(issues),
      aiSummary,
      siteType || null,
      uxScore ?? null,
      uxInsights      ? JSON.stringify(uxInsights)      : null,
      uxAnnotations   ? JSON.stringify(uxAnnotations)   : null,
      aiInsights      ? JSON.stringify(aiInsights)      : null,
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

  // pg auto-parses JSONB but returns TEXT columns as strings — handle both
  const parseJ = (v) => {
    if (!v) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
  };

  return {
    id: r.id,
    url: r.url,
    scores: parseJ(r.scores) || {},
    issues: parseJ(r.issues) || [],
    aiSummary: r.ai_summary,
    siteType: r.site_type || null,
    uxScore: r.ux_score ?? null,
    uxInsights:    parseJ(r.ux_insights)    || null,
    uxAnnotations: parseJ(r.ux_annotations) || null,
    aiInsights:    parseJ(r.ai_insights)    || null,
    lhData: parseJ(r.lh_data),
    seoData: parseJ(r.seo_data),
    sslData: parseJ(r.ssl_data),
    a11yData: parseJ(r.a11y_data),
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
