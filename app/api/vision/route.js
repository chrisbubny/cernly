import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runVisionAnalysis } from '@/lib/analyzers/vision';
import { updateReportAnnotations } from '@/lib/store';
import { authorizeReport } from '@/lib/report-access';

// Allow up to 60 s — vision takes image prep (~1s) + Claude vision (~30s)
export const maxDuration = 60;

// POST /api/vision
// Body: { reportId }
// Runs screenshot → Claude vision pipeline and patches the report row.
// Called from the report page after the main scan completes.
export async function POST(request) {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}

  const { reportId } = body;
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

  // Load the report to get the URL and lhData
  const access = await authorizeReport({ id: reportId }, userId);
  if (!access.report) return NextResponse.json({ error: access.error }, { status: access.status });
  const report = access.report;

  // Only the report owner may trigger AI vision generation.
  // Authenticated viewers of public reports cannot initiate new AI calls.
  if (report.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  // Recheck access at the write in case sharing was revoked during generation.
  let saved;
  try {
    saved = await updateReportAnnotations(report.id, uxAnnotations, userId);
  } catch (e) {
    console.error('[/api/vision] DB update failed:', e.message);
    return NextResponse.json({ error: 'Annotations could not be saved. Please try again.' }, { status: 503 });
  }
  if (!saved) return NextResponse.json({ error: 'Report access is no longer available.' }, { status: 403 });

  return NextResponse.json({ uxAnnotations });
}
