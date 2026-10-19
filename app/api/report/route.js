import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReport, getReportBySlug } from '@/lib/store';

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
  const isStripeSession = !!sessionId;

  // Access gate: owner, or report is marked public, or Stripe just completed
  if (!isOwner && !report.isPublic && !isStripeSession) {
    return NextResponse.json({ error: 'This report is private.' }, { status: 403 });
  }

  return NextResponse.json({ ...report, isOwner });
}
