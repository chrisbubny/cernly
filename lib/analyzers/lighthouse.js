// Lighthouse analyzer — uses Google PageSpeed Insights API
// Returns performance, accessibility, seo, best-practices scores + metrics + issues

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/**
 * Walk a legacy criticalrequestchain tree recursively (Lighthouse ≤12).
 * Each node: { request: { url, transferSize, startTime, endTime }, children: { ... } }
 * @param {Object} chains - map of chainId → chain node
 * @param {number} depth - current recursion depth (0 = root)
 * @param {number} maxDepth - hard depth limit
 * @param {number[]} counter - [current, max] node counter shared across all levels
 * @returns {string[]} lines of text representing the dependency path
 */
function _walkLegacyChainTree(chains, depth, maxDepth, counter) {
  const lines = [];
  if (!chains || typeof chains !== 'object' || depth > maxDepth) return lines;
  for (const node of Object.values(chains)) {
    if (!node || counter[0] >= counter[1]) break;
    counter[0]++;
    const req = node.request || {};
    const url = req.url
      ? (req.url.length > 80 ? req.url.slice(0, 77) + '...' : req.url)
      : null;
    const kb = req.transferSize != null
      ? ` (${Math.round(req.transferSize / 1024)} KiB)`
      : '';
    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '' : '→ ';
    if (url) lines.push(`${indent}${prefix}${url}${kb}`);
    if (node.children && typeof node.children === 'object') {
      lines.push(..._walkLegacyChainTree(node.children, depth + 1, maxDepth, counter));
    }
  }
  return lines;
}

/**
 * Walk a modern network-dependency-tree-insight chain tree recursively (Lighthouse 13+).
 * Each node: { url, navStartToEndTime, transferSize, isLongest, children: { ... } }
 */
function _walkNewChainTree(chains, depth, maxDepth, counter) {
  const lines = [];
  if (!chains || typeof chains !== 'object' || depth > maxDepth) return lines;
  for (const node of Object.values(chains)) {
    if (!node || counter[0] >= counter[1]) break;
    counter[0]++;
    const url = node.url
      ? (node.url.length > 80 ? node.url.slice(0, 77) + '...' : node.url)
      : null;
    const kb = node.transferSize != null
      ? ` (${Math.round(node.transferSize / 1024)} KiB)`
      : '';
    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '' : '→ ';
    if (url) lines.push(`${indent}${prefix}${url}${kb}`);
    if (node.children && typeof node.children === 'object') {
      lines.push(..._walkNewChainTree(node.children, depth + 1, maxDepth, counter));
    }
  }
  return lines;
}

/**
 * Extract audit items and chain metadata from a Lighthouse audit's details object.
 *
 * Named export so unit tests can import and exercise it directly against
 * real PSI response fixtures without making live API calls.
 *
 * Handles four detail types:
 *   opportunity / table           — resource items with URLs and wasted bytes
 *   criticalrequestchain          — legacy Lighthouse ≤12 chain format
 *   list (network-dependency-tree-insight) — Lighthouse 13+ chain format
 *
 * Returns { items, chainMeta } or null.
 *   items     — array of resource evidence objects (opportunity/table audits), or null
 *   chainMeta — scalar chain summary + pre-formatted tree string (chain audits), or null
 */
export function extractAuditItems(auditId, details) {
  if (!details) return null;
  const d = details;

  // --- opportunity / table (existing behavior, unchanged) ---
  if ((d.type === 'opportunity' || d.type === 'table') && Array.isArray(d.items) && d.items.length) {
    const extracted = d.items.slice(0, 20).map(item => {
      const out = {};
      // Resource-based items (render-blocking, unused JS, etc.)
      if (item.url)                 out.url           = item.url;
      if (item.wastedMs    != null) out.wastedMs      = Math.round(item.wastedMs);
      if (item.totalBytes  != null) out.totalBytes    = item.totalBytes;
      if (item.wastedBytes != null) out.wastedBytes   = item.wastedBytes;
      if (item.blockingTime != null) out.blockingTime = Math.round(item.blockingTime);
      if (item.label)               out.label         = item.label;
      // Node-based items (image-alt, button-name, label, etc.)
      if (item.node && typeof item.node === 'object') {
        if (item.node.snippet)   out.snippet  = item.node.snippet.slice(0, 200);
        if (item.node.selector)  out.selector = item.node.selector;
        if (item.node.nodeLabel && !out.label) out.label = item.node.nodeLabel;
        const srcMatch = (item.node.snippet || '').match(/src=["']([^"']+)["']/i);
        if (srcMatch) out.url = srcMatch[1];
      }
      return Object.keys(out).length ? out : null;
    }).filter(Boolean);
    return extracted.length ? { items: extracted, chainMeta: null } : null;
  }

  // --- criticalrequestchain (Lighthouse ≤12 legacy format) ---
  // details.type === 'criticalrequestchain'; chains map keyed by hash strings.
  // longestChain has { duration (ms), length (hops), transferSize (bytes) }.
  if (d.type === 'criticalrequestchain' && d.chains && typeof d.chains === 'object') {
    const chains = d.chains;
    const lc = d.longestChain || {};
    // chainCount is the number of top-level (root) chains, not total hop count
    const chainCount = Object.keys(chains).length;
    if (chainCount === 0) return null;

    // Build bounded recursive tree representation (max depth 4, max 20 total nodes)
    const counter = [0, 20];
    const treeLines = _walkLegacyChainTree(chains, 0, 4, counter);
    const treeText  = treeLines.join('\n');

    const chainMeta = {
      chainCount,
      longestChainDurationMs: lc.duration != null ? Math.round(lc.duration) : null,
    };
    if (lc.transferSize != null) {
      chainMeta.longestChainTransferKib = Math.round(lc.transferSize / 1024);
    }
    if (treeText) chainMeta.chainTree = treeText;

    return { items: null, chainMeta };
  }

  // --- network-dependency-tree-insight (Lighthouse 13+ modern format) ---
  // details.type === 'list'; the dependency tree section is one of the items.
  //
  // The exact shape of the section item has varied between Lighthouse minor versions:
  //   Pattern A: { type: 'network-tree', chains, longestChain }   (fields directly on section)
  //   Pattern B: { value: { chains, longestChain } }              (fields wrapped in .value — observed in real PSI)
  //
  // Both patterns are handled: check for chains on the item directly or under item.value.
  if (d.type === 'list' && Array.isArray(d.items)) {
    const treeSection = d.items.find(s =>
      (s && s.type === 'network-tree' && s.chains && typeof s.chains === 'object') ||
      (s && s.value && typeof s.value.chains === 'object')
    );
    if (!treeSection) return null;

    // Resolve chain data from whichever pattern is present
    const treeData = (treeSection.chains) ? treeSection : treeSection.value;
    if (!treeData || typeof treeData.chains !== 'object') return null;

    const chains = treeData.chains;
    const lc = treeData.longestChain || {};
    const chainCount = Object.keys(chains).length;
    if (chainCount === 0) return null;

    const counter = [0, 20];
    const treeLines = _walkNewChainTree(chains, 0, 4, counter);
    const treeText  = treeLines.join('\n');

    const chainMeta = {
      chainCount,
      longestChainDurationMs: lc.duration != null ? Math.round(lc.duration) : null,
    };
    // Modern longestChain typically has only { duration }; transferSize only present in some versions
    if (lc.transferSize != null) {
      chainMeta.longestChainTransferKib = Math.round(lc.transferSize / 1024);
    }
    if (treeText) chainMeta.chainTree = treeText;

    return { items: null, chainMeta };
  }

  return null;
}

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

    // Capture affected resource items and chain metadata from audit details.
    // extractAuditItems handles opportunity, table, criticalrequestchain, and
    // network-dependency-tree-insight (Lighthouse 13+) detail types.
    let items = null;
    let chainMeta = null;
    const d = audit.details;
    const extraction = extractAuditItems(auditId, d);
    if (extraction) {
      items     = extraction.items;
      chainMeta = extraction.chainMeta;
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
      ...(chainMeta ? { chainMeta } : {}),
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
