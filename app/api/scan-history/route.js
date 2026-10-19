import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReportsByDomain, getReportsByDomainFull } from '@/lib/store';

// GET /api/scan-history?domain=example.com
//   Returns a slim scan list (existing behaviour — backward compatible).
//
// GET /api/scan-history?url=https://example.com/page&full=true
//   Returns enriched comparison data (issues + recs) for the exact URL.
//   Requires authentication; only returns the requesting user's reports.
//   Limited to 5 most recent scans. Payload is intentionally bounded.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const full   = searchParams.get('full') === 'true';
  const domain = (searchParams.get('domain') || '').trim();
  const url    = (searchParams.get('url')    || '').trim();

  // ── Full comparison endpoint (authenticated) ────────────────────────────
  if (full) {
    if (!url) {
      return NextResponse.json({ error: 'url is required for full comparison data' }, { status: 400 });
    }

    // Auth required — only return data belonging to the requesting user
    let userId = null;
    try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    try {
      const scans = await getReportsByDomainFull(url, userId);
      return NextResponse.json({ scans });
    } catch (e) {
      console.error('[scan-history full]', e.message);
      return NextResponse.json({ error: 'Failed to load comparison data' }, { status: 500 });
    }
  }

  // ── Slim domain-level list (existing, backward compatible) ──────────────
  if (!domain) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400 });
  }

  try {
    const reports = await getReportsByDomain(domain);
    return NextResponse.json({ reports });
  } catch (e) {
    console.error('[scan-history]', e.message);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}
