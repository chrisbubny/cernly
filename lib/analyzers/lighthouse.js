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

  // Extract issues from failing audits, labeled by their real category
  const issues = [];
  for (const [auditId, audit] of Object.entries(audits)) {
    if (audit.score == null || audit.score >= 0.9 || audit.details?.type === 'debugdata') continue;
    const catId = auditToCategory[auditId] || 'performance';
    const area = catAreaMap[catId] || 'Performance';
    const severity = audit.score === 0 ? 'critical' : audit.score < 0.5 ? 'warning' : 'info';

    // Capture affected resource items from opportunity/table audits.
    // These provide specific evidence (URLs, wasted ms, byte sizes) that
    // ground AI responses in actual findings rather than generic advice.
    // Also handles node-list audits (e.g. image-alt, label) where each item
    // contains a `node` object with HTML snippet and CSS selector.
    let items = null;
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
      if (extracted.length) {
        items = extracted;
      }
    }

    const totalDetected = (d && Array.isArray(d.items)) ? d.items.length : null;

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
    });
    if (issues.length >= 30) break;
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
    screenshotDataUrl,
    raw: {
      categories: cats,
      // Don't store entire audits object to save space
    },
  };
}
