import { NextResponse } from 'next/server';
import { getReport } from '@/lib/store';

// GET /api/report?id=xxx&session_id=yyy
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportId  = searchParams.get('id');
  const sessionId = searchParams.get('session_id'); // Stripe checkout session

  if (!reportId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const report = await getReport(reportId);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  // Report is accessible if paid, or if Stripe session just completed (session_id present)
  const canAccess = report.paid || !!sessionId;

  if (!canAccess) {
    // TODO: gate content once features are finalized — for now return everything
    return NextResponse.json({ ...report, paid: false });
  }

  return NextResponse.json({
    ...report,
    paid: true,
  });
}
