import { DEPENDENCY_AUDITS, extractDependencyEvidence } from '@/lib/lighthouse-evidence';
import { INSIGHT_LIST_AUDITS, INSIGHT_TABLE_AUDITS, extractInsightEvidence } from '@/lib/insight-evidence';

// Lighthouse analyzer — uses Google PageSpeed Insights API
// Returns performance, accessibility, seo, best-practices scores + metrics + issues

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runLighthouse(url) {
  const apiKey = process.env.PAGESPEED_API_KEY || '';
  const params = new URLSearchParams({ url, strategy: 'mobile' });
  if (apiKey) params.set('key', apiKey);

  const fetchStart = Date.now();
  let res;
  try {
    res = await fetch(`${PSI_API}?${params}`, {
      signal: AbortSignal.timeout(45000),
    });
  } catch (fetchErr) {
    const elapsed = Date.now() - fetchStart;
    const isTimeout = fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError';
    // Log category and duration; never log the URL params (may contain API key)
    console.error(`[Lighthouse] fetch failed | category=${isTimeout ? 'timeout' : 'network_error'} | elapsed=${elapsed}ms | error=${fetchErr.name}: ${fetchErr.message}`);
    throw new Error(`PageSpeed API ${isTimeout ? 'timeout' : 'network error'} after ${elapsed}ms`);
  }

  const elapsed = Date.now() - fetchStart;

  if (!res.ok) {
    let errorType = 'unknown';
    let errorMessage = '';
    try {
      const errBody = await res.json();
      // PSI wraps errors in { error: { code, message, status } }
      errorType    = errBody?.error?.status || `http_${res.status}`;
      errorMessage = errBody?.error?.message?.slice(0, 200) || '';
    } catch {
      // JSON parse failed — log only status
    }
    // Categorize for actionable triage:
    // 429 → rate limit (no API key or quota exhausted)
    // 400 → bad request (malformed URL passed to PSI)
    // 403 → API key invalid or disabled
    // 5xx → PSI server-side failure
    const category = res.status === 429 ? 'rate_limited'
      : res.status === 403 ? 'auth_error'
      : res.status === 400 ? 'bad_request'
      : res.status >= 500 ? 'psi_server_error'
      : `http_${res.status}`;
    const hasApiKey = !!apiKey;
    console.error(`[Lighthouse] PSI error | status=${res.status} | category=${category} | hasApiKey=${hasApiKey} | elapsed=${elapsed}ms | errorType=${errorType} | message=${errorMessage}`);
    throw new Error(`PageSpeed API error: ${res.status} (${category})`);
  }
  const data = await res.json();

  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};

  const score = (key) => cats[key]?.score != null ? Math.round(cats[key].score * 100) : null;
  const metricVal = (key) => audits[key]?.displayValue || null;
  const metricNum = (key) => audits[key]?.numericValue || null;

  // Build a map from audit ID → Lighthouse category
  const auditToCategory = {};
  for (const [catId, cat] of Object.entries(cats)) {
    for (const ref of (cat.auditRefs || [])) {
      auditToCategory[ref.id] = catId;
    }
  }
  const catAreaMap = {
    'performance':    'Performance',
    'seo':            'SEO',
    'accessibility':  'Accessibility',
    'best-practices': 'Performance',
  };

  // Record each audit before issue filtering/capping. Missing, manual, errored,
  // or not-applicable audits are never positive evidence of a fix.
  const auditResults = Object.fromEntries(Object.entries(audits).map(([id, audit]) => [
    `lh:${id}`, {
      category: auditToCategory[id] || null,
      status: audit.errorMessage || ['error', 'manual', 'notApplicable', 'informative'].includes(audit.scoreDisplayMode) ||
        typeof audit.score !== 'number' || !Number.isFinite(audit.score)
        ? 'unavailable' : audit.score === 1 ? 'passed' : 'failed',
    },
  ]));

  // Extract issues from failing audits, labeled by their real category
  const issues = [];
  for (const [auditId, audit] of Object.entries(audits)) {
    const isDependency = DEPENDENCY_AUDITS.has(auditId);
    const dependencyEvidence = isDependency ? extractDependencyEvidence(audit.details) : null;

    // Insight-class audits (scoreDisplayMode: 'informative', score: null) are
    // normally filtered by the score==null check below. We allow them through
    // when they carry extractable diagnostic evidence, but their severity is
    // ALWAYS 'info' — insight audits never become critical or warning findings.
    const isInsightList  = INSIGHT_LIST_AUDITS.has(auditId);
    const isInsightTable = INSIGHT_TABLE_AUDITS.has(auditId);
    const isInsight = isInsightList || isInsightTable;

    // For list-type insight audits (e.g. forced-reflow-insight), extract evidence
    // using the dedicated extractor before the filter so we can gate on it.
    const insightEvidence = isInsightList ? extractInsightEvidence(auditId, audit.details) : null;

    // Diagnostic log: capture actual PSI detail structure for insight audits on the
    // first scan after deploy. Remove after confirming the structure in DO Runtime Logs.
    // DIAGNOSTIC_LOG_INSIGHT=true must be set in DO App Settings (never in production .env).
    if (process.env.DIAGNOSTIC_LOG_INSIGHT === 'true' && isInsight && audit.details) {
      const detailSample = JSON.stringify(audit.details).slice(0, 2000);
      console.log(`[Lighthouse][DIAGNOSTIC] insight audit=${auditId} scoreDisplayMode=${audit.scoreDisplayMode} score=${audit.score} details=${detailSample}`);
    }

    // Allow through if:
    //   - dependency audit with evidence, OR
    //   - insight list audit with extracted items, OR
    //   - insight table audit with items in details (existing extractor will handle them), OR
    //   - normal scored audit that is failing (score < 0.9 and not null)
    const hasInsightListItems  = !!(insightEvidence?.items?.length);
    const hasInsightTableItems = isInsightTable
      && audit.details?.type === 'table'
      && Array.isArray(audit.details?.items)
      && audit.details.items.length > 0;

    if ((!isDependency || !dependencyEvidence.items)
        && !hasInsightListItems
        && !hasInsightTableItems
        && (audit.score == null || audit.score >= 0.9 || audit.details?.type === 'debugdata')) continue;

    if (issues.length >= 30 && !isDependency && !isInsight) continue;
    if (isDependency && audit.score === 1) continue;
    const catId = auditToCategory[auditId] || 'performance';
    const area = catAreaMap[catId] || 'Performance';
    // Insight audits always get severity 'info' — their score is null but that
    // must NOT be treated as a critical/warning finding.
    const severity = (isInsight || audit.score == null) ? 'info'
      : audit.score === 0 ? 'critical'
      : audit.score < 0.5 ? 'warning'
      : 'info';

    // Capture affected resource items from opportunity/table audits.
    // These provide specific evidence (URLs, wasted ms, byte sizes) that
    // ground AI responses in actual findings rather than generic advice.
    // Also handles node-list audits (e.g. image-alt, label) where each item
    // contains a `node` object with HTML snippet and CSS selector.
    // For list-type insight audits, use the dedicated extractor result.
    let items = null;
    let totalDetected = null;
    let insightMeta = {};

    if (hasInsightListItems) {
      // Use pre-extracted insight evidence (e.g. forced-reflow-insight)
      items         = insightEvidence.items;
      totalDetected = insightEvidence.totalDetected;
      insightMeta   = {
        diagnostic: true,
        ...(insightEvidence.evidenceLimitations ? { evidenceLimitations: insightEvidence.evidenceLimitations } : {}),
      };
    } else {
      // Existing extractor for opportunity/table audits (including table-type insight audits)
      const d = audit.details;
      if (d && (d.type === 'opportunity' || d.type === 'table') && Array.isArray(d.items) && d.items.length) {
        const extracted = d.items.slice(0, 20).map(item => {
          const out = {};
          // Resource-based items (render-blocking, unused JS, etc.)
          if (item.url)                out.url          = item.url;
          if (item.wastedMs   != null) out.wastedMs     = Math.round(item.wastedMs);
          if (item.totalBytes != null) out.totalBytes   = item.totalBytes;
          if (item.wastedBytes!= null) out.wastedBytes  = item.wastedBytes;
          if (item.blockingTime != null) out.blockingTime = Math.round(item.blockingTime);
          if (item.label)              out.label        = item.label;
          // Node-based items (image-alt, button-name, label, etc.)
          // Each item has a `node` property with snippet and selector.
          if (item.node && typeof item.node === 'object') {
            if (item.node.snippet)   out.snippet  = item.node.snippet.slice(0, 200);
            if (item.node.selector)  out.selector = item.node.selector;
            if (item.node.nodeLabel && !out.label) out.label = item.node.nodeLabel;
            // Extract src from snippet for image audits
            const srcMatch = (item.node.snippet || '').match(/src=["']([^"']+)["']/i);
            if (srcMatch) out.url = srcMatch[1];
          }
          return Object.keys(out).length ? out : null;
        }).filter(Boolean);
        if (extracted.length) items = extracted;
      }
      totalDetected = (audit.details && Array.isArray(audit.details.items)) ? audit.details.items.length : null;
      if (isInsightTable) insightMeta = { diagnostic: true };
    }

    issues.push({
      area,
      message: audit.title,
      description: audit.description,
      severity,
      source: 'lighthouse',
      auditId: auditId,        // stable Lighthouse audit key for cross-scan fingerprinting
      displayValue: audit.displayValue || null,
      items,                   // specific affected resources; null when audit has no items
      totalDetected,           // total raw item count before cap; null when no item list
      ...insightMeta,          // diagnostic: true + evidenceLimitations for insight audits
      ...(dependencyEvidence?.items ? dependencyEvidence : {}),
    });

  }

  // PSI includes a mobile full-page screenshot — extract it for vision analysis.
  // This avoids any dependency on Microlink server-side (which is rate-limited from DO).
  // PSI stores screenshot at details.screenshot.data (not details.data)
  const screenshotDataUrl = audits['full-page-screenshot']?.details?.screenshot?.data || null;
  if (screenshotDataUrl) {
    const kb = Math.round(screenshotDataUrl.length * 0.75 / 1024);
    console.log(`[Lighthouse] PSI screenshot captured: ${kb} KB`);
  } else {
    // Log what keys are actually present so we can debug if PSI changes its shape
    const fpsKeys = Object.keys(audits['full-page-screenshot']?.details || {}).join(', ');
    console.log(`[Lighthouse] No PSI screenshot — full-page-screenshot detail keys: [${fpsKeys}]`);
  }

  return {
    performance:   score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seoScore:      score('seo'),
    metrics: {
      lcp:  metricVal('largest-contentful-paint'),
      fid:  metricVal('max-potential-fid'),
      cls:  metricVal('cumulative-layout-shift'),
      fcp:  metricVal('first-contentful-paint'),
      ttfb: metricVal('server-response-time'),
      tbt:  metricVal('total-blocking-time'),
      si:   metricVal('speed-index'),
      lcpMs:  metricNum('largest-contentful-paint'),
      clsNum: metricNum('cumulative-layout-shift'),
    },
    issues,
    auditResults,
    screenshotDataUrl,
    raw: {
      categories: cats,
      // Don't store entire audits object to save space
    },
  };
}
