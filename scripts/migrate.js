#!/usr/bin/env node
// Migration runner — run with: DATABASE_URL=... node scripts/migrate.js
// Or: npx dotenv -e .env.local -- node scripts/migrate.js

import { Pool } from 'pg';

const dbUrl = (process.env.DATABASE_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  .replace(/\/[^/?]+$/, '/defaultdb');

if (!dbUrl || dbUrl.includes('password@host')) {
  console.error('❌  Set DATABASE_URL before running this script.');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, options: '--search_path=app' });

const migrations = [
  {
    name: '001_add_site_type_ux_columns',
    sql: `
      -- Add dedicated columns for site_type and ux_insights
      ALTER TABLE reports
        ADD COLUMN IF NOT EXISTS site_type  TEXT,
        ADD COLUMN IF NOT EXISTS ux_score   INTEGER,
        ADD COLUMN IF NOT EXISTS ux_insights JSONB;

      -- Back-fill from the JSONB hack (_siteType / _uxInsights folded into scores)
      UPDATE reports
      SET
        site_type   = scores->>'_siteType',
        ux_insights = scores->'_uxInsights'
      WHERE scores ? '_siteType' OR scores ? '_uxInsights';

      -- Strip the temp keys from scores so scores stays clean
      UPDATE reports
      SET scores = scores - '_siteType' - '_uxInsights'
      WHERE scores ? '_siteType' OR scores ? '_uxInsights';
    `,
  },
  {
    name: '002_create_ask_usage',
    sql: `
      -- Ask Cernly per-user monthly quota tracking.
      -- month stores the first day of the UTC month (truncated with date_trunc).
      -- ask_count is incremented atomically via INSERT … ON CONFLICT DO UPDATE.
      CREATE TABLE IF NOT EXISTS ask_usage (
        user_id    TEXT  NOT NULL,
        month      DATE  NOT NULL,
        ask_count  INT   NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, month)
      );

      -- Index supporting the monthly count lookup by user_id + month.
      -- The primary key already covers (user_id, month) exactly, so a separate
      -- index is redundant on the PK columns; this is here for documentation
      -- purposes and future partial-index use.
      -- The unique constraint is the PK itself.
    `,
  },
  {
    name: '003_add_rec_type_column',
    sql: `
      -- Distinguish group-level recommendations (one rec covering multiple related
      -- findings) from finding-level recommendations (one rec per unmatched finding).
      --
      -- 'group'   — existing behavior: fingerprint = RECOMMENDATION_GROUP key
      --             (e.g. 'js-overhead'), may cover multiple findings.
      -- 'finding' — new: fingerprint = canonicalFingerprintId of the finding
      --             (e.g. 'lh:critical-request-chains'), covers exactly one audit.
      --
      -- All existing rows are 'group' (correct; default handles backfill).
      ALTER TABLE recommendations
        ADD COLUMN IF NOT EXISTS rec_type TEXT NOT NULL DEFAULT 'group'
          CHECK (rec_type IN ('group', 'finding'));
    `,
  },
];

async function run() {
  const db = await pool.connect();
  try {
    // Create migrations table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        run_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    for (const m of migrations) {
      const existing = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [m.name]);
      if (existing.rows.length > 0) {
        console.log(`⏭  ${m.name} — already applied`);
        continue;
      }

      console.log(`⚙️  Running ${m.name}…`);
      await db.query('BEGIN');
      try {
        await db.query(m.sql);
        await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
        await db.query('COMMIT');
        console.log(`✅  ${m.name} — done`);
      } catch (err) {
        await db.query('ROLLBACK');
        console.error(`❌  ${m.name} failed:`, err.message);
        process.exit(1);
      }
    }
    console.log('\nAll migrations applied.');
  } finally {
    db.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
