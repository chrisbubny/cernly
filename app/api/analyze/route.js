import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runLighthouse } from '@/lib/analyzers/lighthouse';
import { runSeoAudit } from '@/lib/analyzers/seo';
import { runSslCheck } from '@/lib/analyzers/ssl';
import { runA11yCheck } from '@/lib/analyzers/a11y';
import { runAiSummary } from '@/lib/analyzers/ai';
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

  const now = new Date().toISOString();

  // Helper: classify a settled result into a structured audit status
  function classifyResult(settled, getValue) {
    if (settled.status === 'rejected') {
      return { status: 'failed', score: null, error: { code: 'ANALYZER_ERROR', message: settled.reason?.message || 'Unknown error', retryable: true }, attemptedAt: now };
    }
    const val = settled.value;
    if (!val) {
      return { status: 'failed', score: null, error: { code: 'NULL_RESULT', message: 'Analyzer returned no result.', retryable: true }, attemptedAt: now };
    }
    if (val.status === 'fetch_failed') {
      return { status: 'blocked', score: null, error: { code: 'FETCH_FAILED', message: 'The page could not be fetched. The site may be blocking automated requests.', retryable: true }, attemptedAt: now };
    }
    const score = getValue(val);
    return { status: score != null ? 'completed' : 'unavailable', score, attemptedAt: now };
  }

  const lhData  = lh.status  === 'fulfilled' ? lh.value  : null;
  const seoData = seo.status === 'fulfilled' ? seo.value : null;
  const sslData = ssl.status === 'fulfilled' ? ssl.value : null;
  const a11yData = a11y.status === 'fulfilled' ? a11y.value : null;

  const auditStatuses = {
    performance:   lh.status === 'rejected'
      ? { status: 'failed', score: null, error: { code: 'LIGHTHOUSE_ERROR', message: lh.reason?.message || 'Lighthouse failed to run.', retryable: true }, attemptedAt: now }
      : lhData
        ? { status: 'completed', score: lhData.performance ?? null, attemptedAt: now }
        : { status: 'failed', score: null, error: { code: 'NULL_RESULT', message: 'Lighthouse returned no data.', retryable: true }, attemptedAt: now },
    seo:           classifyResult(seo,  v => v.score ?? null),
    security:      classifyResult(ssl,  v => v.score ?? null),
    accessibility: classifyResult(a11y, v => v.score ?? lhData?.accessibility ?? null),
  };

  // Compute scores (0-100)
  const scores = {
    performance:   auditStatuses.performance.score,
    seo:           auditStatuses.seo.score,
    security:      auditStatuses.security.score,
    accessibility: auditStatuses.accessibility.score,
    auditStatuses,
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

  // AI summary (vision runs separately via /api/vision after the report is saved)
  const aiResult = await runAiSummary({ url, scores, issues }).catch(() => null);

  const { aiSummary, siteType, uxScore, uxInsights, aiInsights } =
    aiResult || { aiSummary: null, siteType: null, uxScore: null, uxInsights: null, aiInsights: null };

  // Merge UX score into scores
  if (uxScore !== null && uxScore !== undefined) scores.ux = uxScore;

  // Save report for potential purchase (attach userId so it appears in scan history)
  const saved = await saveReport({
    url,
    scores,
    issues,
    aiSummary,
    siteType,
    uxScore,
    uxInsights,
    uxAnnotations: null,
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
    auditStatuses,
    aiSummary,
    siteType:      siteType      || null,
    uxInsights:    uxInsights    || null,
    uxAnnotations: null,
    aiInsights:    aiInsights    || null,
    issues,
    reportId: saved?.id   ?? null,  // integer — kept for internal API use
    reportSlug: saved?.slug ?? null, // UUID — used in public URLs
    analyzedAt: new Date().toISOString(),
  });
}
