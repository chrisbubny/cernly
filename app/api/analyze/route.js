import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runLighthouse } from '@/lib/analyzers/lighthouse';
import { runSeoAudit } from '@/lib/analyzers/seo';
import { runSslCheck } from '@/lib/analyzers/ssl';
import { runA11yCheck } from '@/lib/analyzers/a11y';
import { runAiSummary, runAssessment } from '@/lib/analyzers/ai';
import { saveReport, saveRecommendations, ensureRecommendationsTable, ensureAssessmentColumns, updateReportAssessment, getUserSubscription, getMonthlyScansCount, tryScanLock, FREE_SCAN_LIMIT } from '@/lib/store';
import { normalizeScore, assignIssueFingerprintIds } from '@/lib/scoring';
import { generateRecommendations } from '@/lib/recommendations';

// POST /api/analyze
// Body: { url: string }
// Returns: { scores, aiSummary, issues, reportId }
export async function POST(request) {
  // Authentication required — anonymous scans are not permitted.
  // Returning 401 before any URL validation so unauthenticated callers
  // cannot probe the analyzer at all.
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required. Please sign in to scan a website.' },
      { status: 401 }
    );
  }

  let body = {};
  try { body = await request.json(); } catch {}

  let url = (body.url || '').trim();
  if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }

  // ── Scan limit enforcement ────────────────────────────────────────────────────
  // Free plan: FREE_SCAN_LIMIT scans per calendar month (UTC).
  // Checked here (pre-flight) to fail fast before running analyzers (~15s).
  // A second atomic check happens inside saveReport to handle concurrent requests
  // where two tabs both pass this pre-check before either one saves.
  //
  // Failed/errored scans do NOT count — the limit only increments on a successful
  // report save. Partially completed scans (some analyzers failed, report saved) DO count.
  //
  // userId is guaranteed non-null here (auth check above returns 401 before this).
  let scanLimit = null; // null = no limit (Pro or admin)

  if (userId) {
    const [subResult, countResult] = await Promise.allSettled([
      getUserSubscription(userId),
      getMonthlyScansCount(userId),
    ]);
    const subscription = subResult.status === 'fulfilled' ? subResult.value : null;
    const monthlyCount = countResult.status === 'fulfilled' ? countResult.value : 0;
    const isPro = !!subscription;

    // BYPASS_SCAN_LIMIT=true in .env.local skips enforcement for local/staging dev.
    // Never set this in production.
    const bypassLimit = process.env.BYPASS_SCAN_LIMIT === 'true';

    if (!isPro && !bypassLimit && monthlyCount >= FREE_SCAN_LIMIT) {
      return NextResponse.json(
        {
          error: 'scan_limit_reached',
          message: `Free plan includes ${FREE_SCAN_LIMIT} scans per month. Upgrade to Pro for unlimited scans.`,
          used: monthlyCount,
          limit: FREE_SCAN_LIMIT,
        },
        { status: 429 }
      );
    }

    // Non-Pro authenticated users get limit enforcement at save time too
    if (!isPro && !bypassLimit) scanLimit = FREE_SCAN_LIMIT;
  }
  // ── End scan limit pre-check ─────────────────────────────────────────────────

  // ── Concurrent scan serialization (free-plan users only) ────────────────────
  // Acquire a session-level advisory lock *before* running analyzers so that a
  // second simultaneous request for this user fails fast (immediate 429) instead
  // of wasting ~15 s of Lighthouse / SEO / AI resources it cannot save anyway.
  //
  // pg_advisory_try_lock is non-blocking: it returns false immediately if the
  // lock is already held, rather than waiting. We release the lock explicitly
  // before saveReport (which uses a separate transaction-level lock, different
  // key namespace — no conflict) and the finally block handles error paths.
  let scanLock = null;
  if (scanLimit != null) {
    scanLock = await tryScanLock(userId).catch(() => null);
    if (!scanLock) {
      return NextResponse.json(
        {
          error: 'scan_in_progress',
          message: 'A scan is already running for your account. Please wait for it to complete before starting another.',
        },
        { status: 429 },
      );
    }
  }
  // ── End concurrent scan serialization ────────────────────────────────────────

  try {

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

  // Release scan-serialization lock before saveReport — the expensive analyzer
  // work is done; saveReport handles its own atomic counting with a separate
  // transaction-level advisory lock (key namespace 0, vs our namespace 1 above).
  // Releasing early shortens how long the DB connection is held.
  if (scanLock) { await scanLock.release().catch(() => {}); scanLock = null; }

  // Save report for potential purchase (attach userId so it appears in scan history).
  // scanLimit triggers an atomic advisory-lock check inside saveReport to prevent
  // two concurrent free-plan scans from both slipping through the pre-flight check.
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
    scanLimit,
  }).catch(err => { console.error('[analyze] saveReport error:', err.message); return null; });

  // Handle concurrent race: a second simultaneous scan slipped through the pre-check
  // but lost the advisory lock to the first one. Return results (user waited ~15s),
  // but without a saved report so this scan doesn't count against future months.
  if (!saved && scanLimit != null) {
    return NextResponse.json(
      {
        error: 'scan_limit_reached',
        message: `Your monthly scan limit was reached by a simultaneous request. Your analysis is shown below but wasn't saved.`,
        used: FREE_SCAN_LIMIT,
        limit: FREE_SCAN_LIMIT,
        // Include analysis so the user isn't left with nothing after waiting
        url, scores, auditStatuses, aiSummary,
        siteType: siteType || null, uxInsights: uxInsights || null,
        aiInsights: aiInsights || null, sectionSummaries: sectionSummaries || null,
        issues, recommendations: recommendations || [],
        reportId: null, reportSlug: null,
        analyzedAt: new Date().toISOString(),
      },
      { status: 429 }
    );
  }

  // Persist recommendations if the report was saved successfully
  if (saved?.id && recommendations.length) {
    await ensureRecommendationsTable().catch(() => {});
    await saveRecommendations(saved.id, userId, recommendations).catch(err => {
      console.error('[analyze] saveRecommendations error:', err.message);
    });
  }

  // ── Stage 2: structured assessment ──────────────────────────────────────────
  // Runs AFTER saveRecommendations so top_opportunity fingerprints reference
  // confirmed DB entries. Validated before saving. Adds ~4-6s to user-visible
  // latency (total ~25-30s, within 60s serverless budget).
  //
  // assessment_status values:
  //   'completed' — assessment generated and validated
  //   'failed'    — AI call failed, timed out, or validation rejected the output
  //   null        — not attempted (no saved report, no recommendations, or no API key)
  let assessment = null;
  let assessmentStatus = null;

  if (saved?.id) {
    await ensureAssessmentColumns().catch(() => {});
    try {
      assessment = await runAssessment({
        url, recommendations, scores, auditStatuses, issues,
        lhData, seoData, sslData, a11yData,
      });
      assessmentStatus = assessment ? 'completed' : 'failed';
      await updateReportAssessment(saved.id, assessment, assessmentStatus).catch(err => {
        console.error('[analyze] updateReportAssessment error:', err.message);
      });
    } catch (err) {
      console.error('[analyze] runAssessment error:', err.message);
      assessmentStatus = 'failed';
      await updateReportAssessment(saved.id, null, 'failed').catch(() => {});
    }
  }
  // ── End Stage 2 ──────────────────────────────────────────────────────────────

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
    assessment:       assessment       || null,
    assessmentStatus: assessmentStatus || null,
    issues,
    recommendations: recommendations || [],
    reportId: saved?.id   ?? null,  // integer — kept for internal API use
    reportSlug: saved?.slug ?? null, // UUID — used in public URLs
    analyzedAt: new Date().toISOString(),
  });

  } finally {
    // Safety net: release the scan-serialization lock if an unhandled error
    // fired before the explicit release above (e.g. analyzer crash, AI failure).
    if (scanLock) await scanLock.release().catch(() => {});
  }
}
