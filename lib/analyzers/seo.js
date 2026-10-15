// SEO analyzer — fetches the page and audits on-page SEO signals
import { proxyFetch } from '@/lib/proxy-fetch';

export async function runSeoAudit(url) {
  let html = '';
  try {
    const res = await proxyFetch(url, { timeout: 12000 });
    if (res.ok) html = await res.text();
  } catch {}

  if (!html) return { score: null, issues: [], checks: {} };

  const issues = [];
  const checks = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  checks.title = title;
  if (!title) {
    issues.push({ area: 'SEO', message: 'Missing page title tag', severity: 'critical', source: 'seo' });
  } else if (title.length < 30) {
    issues.push({ area: 'SEO', message: `Title too short (${title.length} chars) — aim for 50–60`, severity: 'warning', source: 'seo' });
  } else if (title.length > 60) {
    issues.push({ area: 'SEO', message: `Title too long (${title.length} chars) — will be truncated in SERPs`, severity: 'warning', source: 'seo' });
  }

  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)
    || html.match(/<meta[^>]+content=["']([^"']*)[^>]+name=["']description["']/i);
  const metaDesc = descMatch ? descMatch[1].trim() : '';
  checks.metaDesc = metaDesc;
  if (!metaDesc) {
    issues.push({ area: 'SEO', message: 'Missing meta description', severity: 'critical', source: 'seo' });
  } else if (metaDesc.length < 100) {
    issues.push({ area: 'SEO', message: `Meta description too short (${metaDesc.length} chars) — aim for 140–155`, severity: 'warning', source: 'seo' });
  } else if (metaDesc.length > 160) {
    issues.push({ area: 'SEO', message: `Meta description too long (${metaDesc.length} chars) — will be truncated`, severity: 'warning', source: 'seo' });
  }

  // H1
  const h1s = [...(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  checks.h1Count = h1s.length;
  if (h1s.length === 0) {
    issues.push({ area: 'SEO', message: 'No H1 heading found', severity: 'critical', source: 'seo' });
  } else if (h1s.length > 1) {
    issues.push({ area: 'SEO', message: `Multiple H1 tags (${h1s.length}) — use only one per page`, severity: 'warning', source: 'seo' });
  }

  // Canonical
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || '';
  checks.canonical = canonical;
  if (!canonical) {
    issues.push({ area: 'SEO', message: 'No canonical URL tag', severity: 'warning', source: 'seo' });
  }

  // Open Graph
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  const ogDesc  = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  checks.ogTitle = ogTitle;
  checks.ogDesc  = ogDesc;
  checks.ogImage = ogImage;
  if (!ogTitle || !ogDesc || !ogImage) {
    issues.push({ area: 'SEO', message: 'Incomplete Open Graph tags — affects link sharing previews', severity: 'warning', source: 'seo' });
  }

  // Images without alt
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter(i => !/alt=["'][^"']+["']/.test(i)).length;
  checks.imgsTotal   = imgs.length;
  checks.imgsNoAlt   = imgsNoAlt;
  if (imgsNoAlt > 0) {
    issues.push({ area: 'SEO', message: `${imgsNoAlt} image${imgsNoAlt > 1 ? 's' : ''} missing alt text`, severity: imgsNoAlt > 3 ? 'critical' : 'warning', source: 'seo' });
  }

  // Schema markup
  const schemas = [...(html.matchAll(/"@type"\s*:\s*"([^"]+)"/g))].map(m => m[1]);
  checks.schemas = [...new Set(schemas)];
  if (schemas.length === 0) {
    issues.push({ area: 'SEO', message: 'No structured data (Schema.org) found', severity: 'info', source: 'seo' });
  }

  // robots meta
  const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  checks.robotsMeta = robotsMeta;
  if (/noindex/i.test(robotsMeta)) {
    issues.push({ area: 'SEO', message: 'Page has noindex meta tag — search engines will not index it', severity: 'critical', source: 'seo' });
  }

  // Viewport
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  checks.viewport = hasViewport;
  if (!hasViewport) {
    issues.push({ area: 'SEO', message: 'No viewport meta tag — page may not be mobile-friendly', severity: 'critical', source: 'seo' });
  }

  // Score: start at 100, deduct per issue
  const deductions = { critical: 15, warning: 7, info: 2 };
  let score = 100;
  for (const i of issues) score -= deductions[i.severity] || 0;
  score = Math.max(0, Math.min(100, score));

  return { score, issues, checks };
}
