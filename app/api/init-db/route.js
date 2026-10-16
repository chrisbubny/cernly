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
    .replace(/\/defaultdb(\b|$)/, '/cernly');
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
