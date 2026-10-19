import { NextResponse } from 'next/server';
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

  // Report is accessible if paid, or if Stripe session just completed (session_id present)
  const canAccess = report.paid || !!sessionId;

  if (!canAccess) {
    // TODO: gate content once features are finalized — for now return everything
    return NextResponse.json({ ...report, paid: false });
  }

  return NextResponse.json({ ...report, paid: true });
}
