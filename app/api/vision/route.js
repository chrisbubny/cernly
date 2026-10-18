import { NextResponse } from 'next/server';
import { runVisionAnalysis } from '@/lib/analyzers/vision';
import { getReport, updateReportAnnotations } from '@/lib/store';

// Allow up to 60 s — vision takes image prep (~1s) + Claude vision (~30s)
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

  // Load the report to get the URL and lhData
  const report = await getReport(reportId).catch(() => null);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  // If annotations already exist, return them immediately — no re-run needed
  if (report.uxAnnotations) {
    return NextResponse.json({ uxAnnotations: report.uxAnnotations });
  }

  // Try to use the PSI screenshot already captured during the Lighthouse run.
  // This avoids any server-side Microlink call (rate-limited from DO datacenter IPs).
  let imageBase64    = null;
  let imageMediaType = null;

  const screenshotDataUrl = report.lhData?.screenshotDataUrl || null;
  if (screenshotDataUrl) {
    const commaIdx = screenshotDataUrl.indexOf(',');
    if (commaIdx !== -1) {
      const header   = screenshotDataUrl.slice(0, commaIdx); // e.g. 'data:image/webp;base64'
      imageBase64    = screenshotDataUrl.slice(commaIdx + 1);
      imageMediaType = header.match(/:(.*?);/)?.[1] || 'image/webp';
      const kb       = Math.round(imageBase64.length * 0.75 / 1024);
      console.log(`[/api/vision] PSI screenshot found in lhData: ${imageMediaType}, ${kb} KB`);
    }
  } else {
    console.log('[/api/vision] No PSI screenshot in lhData — will use Microlink fallback');
  }

  // Run vision analysis
  const uxAnnotations = await runVisionAnalysis({
    url: report.url,
    imageBase64,
    imageMediaType,
  }).catch((e) => {
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
