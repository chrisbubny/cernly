// One-time migration endpoint — add ai_insights column
// DELETE THIS FILE after running once
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
  try {
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_insights JSONB`);
    return NextResponse.json({ ok: true, message: 'ai_insights column added (or already existed)' });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
