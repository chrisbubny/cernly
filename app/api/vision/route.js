import { NextResponse } from 'next/server';
import { runVisionAnalysis } from '@/lib/analyzers/vision';
import { getReport, updateReportAnnotations } from '@/lib/store';

// Allow up to 60 s — vision takes Microlink (~5s) + image download (~3s) + Claude vision (~30s)
export const maxDuration = 60;

// POST /api/vision
// Body: { reportId }
// Runs screenshot → Claude vision pipeline and patches the report row.
// Called from the report page after the main scan completes.
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  const { reportId } = body;
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

  // Load the report to get the URL (and check it exists)
  const report = await getReport(reportId).catch(() => null);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  // If annotations already exist, return them immediately — no re-run needed
  if (report.uxAnnotations) {
    return NextResponse.json({ uxAnnotations: report.uxAnnotations });
  }

  // Run vision analysis (Microlink screenshot → Claude vision)
  const uxAnnotations = await runVisionAnalysis({ url: report.url }).catch((e) => {
    console.error('[/api/vision] runVisionAnalysis threw:', e.message);
    return null;
  });

  if (!uxAnnotations) {
    return NextResponse.json({ error: 'Vision analysis failed' }, { status: 500 });
  }

  // Persist to DB
  await updateReportAnnotations(reportId, uxAnnotations).catch((e) => {
    console.error('[/api/vision] DB update failed:', e.message);
  });

  return NextResponse.json({ uxAnnotations });
}
