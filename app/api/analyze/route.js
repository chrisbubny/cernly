import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runLighthouse } from '@/lib/analyzers/lighthouse';
import { runSeoAudit } from '@/lib/analyzers/seo';
import { runSslCheck } from '@/lib/analyzers/ssl';
import { runA11yCheck } from '@/lib/analyzers/a11y';
import { runAiSummary } from '@/lib/analyzers/ai';
import { runVisionAnalysis } from '@/lib/analyzers/vision';
import { saveReport } from '@/lib/store';

// POST /api/analyze
// Body: { url: string }
// Returns: { scores, aiSummary, issues, reportId }
export async function POST(request) {
  // Get auth'd user if signed in (optional — anonymous scans allowed)
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}

  let body = {};
  try { body = await request.json(); } catch {}

  let url = (body.url || '').trim();
  if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }

  // Run all checks in parallel (lighthouse is slowest at ~15s)
  const [lh, seo, ssl, a11y] = await Promise.allSettled([
    runLighthouse(url),
    runSeoAudit(url),
    runSslCheck(url),
    runA11yCheck(url),
  ]);

  const lhData  = lh.status  === 'fulfilled' ? lh.value  : null;
  const seoData = seo.status === 'fulfilled' ? seo.value : null;
  const sslData = ssl.status === 'fulfilled' ? ssl.value : null;
  const a11yData = a11y.status === 'fulfilled' ? a11y.value : null;

  // Compute scores (0-100)
  const scores = {
    performance:   lhData?.performance  ?? null,
    seo:           seoData?.score       ?? null,
    security:      sslData?.score       ?? null,
    accessibility: a11yData?.score      ?? lhData?.accessibility ?? null,
  };

  // Collect issues from all sources
  const issues = [
    ...(lhData?.issues  || []),
    ...(seoData?.issues || []),
    ...(sslData?.issues || []),
    ...(a11yData?.issues || []),
  ].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2, good: 3 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  // AI summary + vision analysis run in parallel (vision needs screenshot fetch + Claude vision)
  const [aiResult, visionResult] = await Promise.allSettled([
    runAiSummary({ url, scores, issues }),
    runVisionAnalysis({ url }),
  ]);

  const { aiSummary, siteType, uxScore, uxInsights, aiInsights } =
    aiResult.status === 'fulfilled' ? aiResult.value : { aiSummary: null, siteType: null, uxScore: null, uxInsights: null, aiInsights: null };

  const uxAnnotations = visionResult.status === 'fulfilled' ? visionResult.value : null;

  // Merge UX score into scores
  if (uxScore !== null && uxScore !== undefined) scores.ux = uxScore;

  // Save report for potential purchase (attach userId so it appears in scan history)
  const reportId = await saveReport({
    url,
    scores,
    issues,
    aiSummary,
    siteType,
    uxScore,
    uxInsights,
    uxAnnotations,
    aiInsights,
    lhData,
    seoData,
    sslData,
    a11yData,
    userId,
  }).catch(() => null);

  return NextResponse.json({
    url,
    scores,
    aiSummary,
    siteType:      siteType      || null,
    uxInsights:    uxInsights    || null,
    uxAnnotations: uxAnnotations || null,
    aiInsights:    aiInsights    || null,
    issues,
    reportId,
    analyzedAt: new Date().toISOString(),
  });
}
