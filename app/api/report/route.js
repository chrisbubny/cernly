import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReport, getReportBySlug, getRecommendationsByReport } from '@/lib/store';
import { isValidPaidStripeSession } from '@/lib/stripe-session';
import { canReadReport } from '@/lib/report-access';

// GET /api/report?slug=xxx  (preferred — public UUID)
// GET /api/report?id=xxx    (legacy integer ID — kept for backward compat)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug     = searchParams.get('slug');
  const reportId = searchParams.get('id');
  const sessionId = searchParams.get('session_id'); // Stripe checkout session

  if (!slug && !reportId) {
    return NextResponse.json({ error: 'slug or id required' }, { status: 400 });
  }

  const report = slug
    ? await getReportBySlug(slug)
    : await getReport(reportId);

  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  // Determine viewer identity
  let viewerUserId = null;
  try { const { userId } = await auth(); viewerUserId = userId || null; } catch {}

  const isOwner = !!(viewerUserId && report.userId && viewerUserId === report.userId);

  // Access gate: owner, or report is marked public, or Stripe just completed.
  // session_id is validated against Stripe — any arbitrary string is rejected.
  // report.paid is checked first to avoid the Stripe API call on normal owner access.
  let isStripeSession = false;
  if (!isOwner && !report.isPublic && sessionId) {
    isStripeSession = await isValidPaidStripeSession(sessionId, report.slug, report.id);
  }

  if (!canReadReport(report, viewerUserId) && !isStripeSession) {
    return NextResponse.json({ error: 'This report is private.' }, { status: 403 });
  }

  // Fetch persisted recommendations (best-effort — empty array on failure)
  const recommendations = await getRecommendationsByReport(report.id).catch(() => []);

  // ── Diagnostic: log enrichment field presence per rec ────────────────────────
  // Surfaces whether what_we_found / why_it_matters are null in DB for each rec.
  // Remove after enrichment root cause is confirmed.
  if (recommendations.length > 0) {
    console.info('[report:diag] recommendations enrichment state | report:', slug || reportId,
      '| count:', recommendations.length);
    for (const rec of recommendations) {
      console.info('[report:diag] rec |',
        'fingerprint:', rec.fingerprint,
        '| rec_type:', rec.rec_type || 'group',
        '| group_key:', rec.group_key || 'null',
        '| what_we_found:', rec.what_we_found != null ? `present(${String(rec.what_we_found).length}ch)` : 'NULL',
        '| why_it_matters:', rec.why_it_matters != null ? `present(${String(rec.why_it_matters).length}ch)` : 'NULL',
        '| actions:', Array.isArray(rec.actions) ? `${rec.actions.length} items` : 'NULL/not-array',
        '| priority:', rec.priority || 'none');
    }
  } else {
    console.info('[report:diag] no recommendations for report:', slug || reportId);
  }

  return NextResponse.json({ ...report, recommendations, isOwner });
}
