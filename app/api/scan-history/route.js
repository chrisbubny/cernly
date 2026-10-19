import { NextResponse } from 'next/server';
import { getReportsByDomain } from '@/lib/store';

// GET /api/scan-history?domain=example.com
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim();
  if (!domain) return NextResponse.json({ error: 'domain is required' }, { status: 400 });

  try {
    const reports = await getReportsByDomain(domain);
    return NextResponse.json({ reports });
  } catch (e) {
    console.error('[scan-history]', e.message);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}
