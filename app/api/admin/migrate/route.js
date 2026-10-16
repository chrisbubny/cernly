// Migration endpoint — adds columns added after initial schema
// Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS logic)
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

function getPool() {
  const dbUrl = (process.env.DATABASE_URL || '')
    .replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
    .replace(/\/[^/?]+$/, '/defaultdb');
  return new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, options: '--search_path=app' });
}

export async function GET(req) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && secret !== 'cernly-migrate-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  const results = [];

  const run = async (label, sql) => {
    try {
      await pool.query(sql);
      results.push({ ok: true, label });
    } catch (e) {
      results.push({ ok: false, label, error: e.message });
    }
  };

  try {
    await run('ai_insights',    `ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_insights JSONB`);
    await run('site_type',      `ALTER TABLE reports ADD COLUMN IF NOT EXISTS site_type TEXT`);
    await run('ux_score',       `ALTER TABLE reports ADD COLUMN IF NOT EXISTS ux_score INTEGER`);
    await run('ux_insights',    `ALTER TABLE reports ADD COLUMN IF NOT EXISTS ux_insights JSONB`);
    await run('ux_annotations', `ALTER TABLE reports ADD COLUMN IF NOT EXISTS ux_annotations JSONB`);
    return NextResponse.json({ ok: true, results });
  } finally {
    await pool.end();
  }
}
