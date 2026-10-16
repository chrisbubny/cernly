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
    // Free preview:
    // - AI summaries + scores + UX insights are always free
    // - Return all critical issues (so every failing category shows its problems)
    // - Plus up to 2 warnings per category (detail/fix copy stays locked in UI)
    const allIssues = report.issues || [];
    const criticals = allIssues.filter(i => i.severity === 'critical');
    const warnings  = allIssues.filter(i => i.severity === 'warning');

    // Sample: up to 2 warnings per area so no category is blank
    const areasSeen = {};
    const sampledWarnings = warnings.filter(i => {
      const key = i.area || i.source || 'other';
      areasSeen[key] = (areasSeen[key] || 0) + 1;
      return areasSeen[key] <= 2;
    });

    const freeIssues = [...criticals, ...sampledWarnings];

    return NextResponse.json({
      id: report.id,
      url: report.url,
      scores: report.scores,
      aiSummary: report.aiSummary,
      siteType: report.siteType,
      uxScore: report.uxScore,
      uxInsights: report.uxInsights,
      aiInsights: report.aiInsights,
      issues: freeIssues,
      issueCount: allIssues.length,
      paid: false,
    });
  }

  return NextResponse.json({
    ...report,
    paid: true,
  });
}
