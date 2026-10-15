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
  const dbUrl = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
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
      );

      CREATE INDEX IF NOT EXISTS idx_reports_user    ON reports(user_id) WHERE user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);

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
      );

      CREATE INDEX IF NOT EXISTS idx_subs_user   ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subs_stripe ON subscriptions(stripe_sub_id) WHERE stripe_sub_id IS NOT NULL;
    `);

    await pool.end();
    return NextResponse.json({ ok: true, message: 'Schema initialized successfully' });
  } catch (err) {
    await pool.end().catch(() => {});
    console.error('[init-db]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
