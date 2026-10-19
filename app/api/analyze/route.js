import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runLighthouse } from '@/lib/analyzers/lighthouse';
import { runSeoAudit } from '@/lib/analyzers/seo';
import { runSslCheck } from '@/lib/analyzers/ssl';
import { runA11yCheck } from '@/lib/analyzers/a11y';
import { runAiSummary } from '@/lib/analyzers/ai';
import { saveReport, saveRecommendations, ensureRecommendationsTable } from '@/lib/store';
import { normalizeScore, assignIssueFingerprintIds } from '@/lib/scoring';
import { generateRecommendations } from '@/lib/recommendations';

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

  // Compute scores — normalize to finite integers in [0,100] or null.
  // auditStatuses is stored separately; scores contains only numeric values.
  const scores = {
    performance:   normalizeScore(auditStatuses.performance.score),
    seo:           normalizeScore(auditStatuses.seo.score),
    security:      normalizeScore(auditStatuses.security.score),
    accessibility: normalizeScore(auditStatuses.accessibility.score),
    // auditStatuses is intentionally NOT included here — it is stored in the
    // scores column as a separate key for backward compat but exposed as
    // report.auditStatuses by mapRow. Keeping it here avoids a schema migration.
    auditStatuses,
  };

  // Collect issues from all sources, sort by severity, assign stable fingerprint IDs
  const rawIssues = [
    ...(lhData?.issues  || []),
    ...(seoData?.issues || []),
    ...(sslData?.issues || []),
    ...(a11yData?.issues || []),
  ].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2, good: 3 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });
  const issues = assignIssueFingerprintIds(rawIssues);

  // AI summary (vision runs separately via /api/vision after the report is saved)
  // Pass auditStatuses and raw analyzer data so the AI gets structured evidence
  // and safe score formatting via buildScoreLines.
  const aiResult = await runAiSummary({ url, scores, auditStatuses, issues, lhData, seoData, sslData, a11yData }).catch(() => null);

  const { aiSummary, siteType, uxScore, uxInsights, aiInsights, sectionSummaries } =
    aiResult || { aiSummary: null, siteType: null, uxScore: null, uxInsights: null, aiInsights: null, sectionSummaries: null };

  // Merge UX score into scores (normalized)
  if (uxScore !== null && uxScore !== undefined) scores.ux = normalizeScore(uxScore);

  // Generate structured recommendations from the fingerprinted issues.
  // This runs after AI summary to avoid blocking the core report.
  // Runs best-effort: failures do not prevent the report from being saved.
  const recommendations = await generateRecommendations(
    issues,
    scores,
    url,
    { lhData, seoData, sslData, a11yData },
    auditStatuses,
  ).catch(err => { console.error('[analyze] recommendations error:', err.message); return []; });

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
    sectionSummaries,
    lhData,
    seoData,
    sslData,
    a11yData,
    userId,
  }).catch(() => null);

  // Persist recommendations if the report was saved successfully
  if (saved?.id && recommendations.length) {
    await ensureRecommendationsTable().catch(() => {});
    await saveRecommendations(saved.id, userId, recommendations).catch(err => {
      console.error('[analyze] saveRecommendations error:', err.message);
    });
  }

  return NextResponse.json({
    url,
    scores,
    auditStatuses,
    aiSummary,
    siteType:      siteType      || null,
    uxInsights:    uxInsights    || null,
    uxAnnotations: null,
    aiInsights:       aiInsights       || null,
    sectionSummaries: sectionSummaries || null,
    issues,
    recommendations: recommendations || [],
    reportId: saved?.id   ?? null,  // integer — kept for internal API use
    reportSlug: saved?.slug ?? null, // UUID — used in public URLs
    analyzedAt: new Date().toISOString(),
  });
}
