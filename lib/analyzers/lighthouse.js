// Lighthouse analyzer — uses Google PageSpeed Insights API
// Returns performance, accessibility, seo, best-practices scores + metrics + issues

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runLighthouse(url) {
  const apiKey = process.env.PAGESPEED_API_KEY || '';
  const params = new URLSearchParams({ url, strategy: 'mobile' });
  if (apiKey) params.set('key', apiKey);

  const res = await fetch(`${PSI_API}?${params}`, {
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[Lighthouse] PSI error ${res.status}:`, errText.slice(0, 300));
    throw new Error(`PageSpeed API error: ${res.status}`);
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
    issues.push({
      area,
      message: audit.title,
      description: audit.description,
      severity,
      source: 'lighthouse',
      displayValue: audit.displayValue || null,
    });
    if (issues.length >= 30) break;
  }

  // PSI includes a mobile full-page screenshot — extract it for vision analysis.
  // This avoids any dependency on Microlink server-side (which is rate-limited from DO).
  const screenshotDataUrl = audits['full-page-screenshot']?.details?.data || null;
  if (screenshotDataUrl) {
    console.log(`[Lighthouse] PSI screenshot captured (${Math.round(screenshotDataUrl.length * 0.75 / 1024)}KB)`);
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
