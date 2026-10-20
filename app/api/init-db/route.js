import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// GET /api/init-db
// Called on first deploy to initialize the database schema.
// Safe to call multiple times (uses CREATE TABLE IF NOT EXISTS).
// Secured by INIT_DB_SECRET env var — set it in DO dashboard.
export async function GET(request) {
  const secret = process.env.INIT_DB_SECRET;
  const provided = new URL(request.url).searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
  }

  // Strip sslmode from URL so the pg driver doesn't override our ssl config
  const dbUrl = process.env.DATABASE_URL
    .replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
    .replace(/\/[^/?]+$/, '/defaultdb');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    const whoami = await client.query(`SELECT current_user, current_database()`);
    const currentUser = whoami.rows[0].current_user;

    // Create app schema owned by current user — avoids PostgreSQL 17 public schema restrictions
    await client.query(`CREATE SCHEMA IF NOT EXISTS app`);
    await client.query(`SET search_path TO app`);

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id           SERIAL PRIMARY KEY,
        url          TEXT NOT NULL,
        scores       JSONB,
        issues       JSONB,
        ai_summary   TEXT,
        lh_data      JSONB,
        seo_data     JSONB,
        ssl_data     JSONB,
        a11y_data    JSONB,
        paid         BOOLEAN NOT NULL DEFAULT false,
        user_id      TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at   TIMESTAMPTZ
      )
    `);
    // Safe migration: add user_id column if table was created before it existed
    await client.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_user    ON reports(user_id) WHERE user_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id                   SERIAL PRIMARY KEY,
        user_id              TEXT NOT NULL,
        stripe_customer_id   TEXT,
        stripe_sub_id        TEXT UNIQUE,
        status               TEXT NOT NULL DEFAULT 'active',
        plan                 TEXT NOT NULL DEFAULT 'pro',
        current_period_end   TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_subs_user   ON subscriptions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_subs_stripe ON subscriptions(stripe_sub_id) WHERE stripe_sub_id IS NOT NULL`);

    // Stage 5: work_items table for user workflow status
    await client.query(`
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
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS work_items_user_idx  ON work_items (user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS work_items_scope_idx ON work_items (user_id, scope_key)`);

    client.release();
    await pool.end();
    return NextResponse.json({ ok: true, message: 'Schema initialized successfully', currentUser });
  } catch (err) {
    client.release();
    await pool.end().catch(() => {});
    console.error('[init-db]', err);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
