// Lighthouse analyzer — uses Google PageSpeed Insights API
// Returns performance, accessibility, seo, best-practices scores + metrics + issues

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runLighthouse(url) {
  const apiKey = process.env.PAGESPEED_API_KEY || '';
  const params = new URLSearchParams({ url, strategy: 'mobile' });
  if (apiKey) params.set('key', apiKey);

  const res = await fetch(`${PSI_API}?${params}`, {
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`PageSpeed API error: ${res.status}`);
  const data = await res.json();

  const cats = data.lighthouseResult?.categories || {};
  const audits = data.lighthouseResult?.audits || {};

  const score = (key) => cats[key]?.score != null ? Math.round(cats[key].score * 100) : null;
  const metricVal = (key) => audits[key]?.displayValue || null;
  const metricNum = (key) => audits[key]?.numericValue || null;

  // Extract issues from failing audits
  const issues = [];
  const failedAudits = Object.values(audits).filter(a =>
    a.score != null && a.score < 0.9 && a.details?.type !== 'debugdata'
  );

  for (const audit of failedAudits.slice(0, 20)) {
    const severity = audit.score === 0 ? 'critical' : audit.score < 0.5 ? 'warning' : 'info';
    issues.push({
      area: 'Performance',
      message: audit.title,
      description: audit.description,
      severity,
      source: 'lighthouse',
    });
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
    raw: {
      categories: cats,
      // Don't store entire audits object to save space
    },
  };
}
