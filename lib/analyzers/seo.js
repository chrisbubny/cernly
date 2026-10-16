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
    issues.push({ area: 'SEO', message: 'Missing page title tag', severity: 'critical', source: 'seo',
      description: 'The <title> tag is one of the most important on-page SEO signals. Search engines display it as the blue link in search results.',
      fix: 'Add a <title> tag inside your <head> section with a unique, descriptive 50–60 character title that includes your primary keyword.' });
  } else if (title.length < 30) {
    issues.push({ area: 'SEO', message: `Title too short (${title.length} chars) — aim for 50–60`, severity: 'warning', source: 'seo',
      description: `Your title "${title}" is only ${title.length} characters. Short titles waste valuable keyword real estate and may signal thin content.`,
      fix: 'Expand your title to 50–60 characters. Include your primary keyword near the beginning and your brand name at the end.' });
  } else if (title.length > 60) {
    issues.push({ area: 'SEO', message: `Title too long (${title.length} chars) — will be truncated in SERPs`, severity: 'warning', source: 'seo',
      description: `Your title is ${title.length} characters. Google typically displays only the first ~60 characters; the rest gets cut off with an ellipsis.`,
      fix: 'Shorten your title to under 60 characters. Keep the most important keywords and brand name, and cut filler words.' });
  }

  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)
    || html.match(/<meta[^>]+content=["']([^"']*)[^>]+name=["']description["']/i);
  const metaDesc = descMatch ? descMatch[1].trim() : '';
  checks.metaDesc = metaDesc;
  if (!metaDesc) {
    issues.push({ area: 'SEO', message: 'Missing meta description', severity: 'critical', source: 'seo',
      description: 'The meta description is the snippet of text shown under your title in search results. While not a direct ranking factor, a compelling description significantly improves click-through rate.',
      fix: 'Add <meta name="description" content="..."> to your <head>. Write 140–155 characters that summarize the page and include a call to action.' });
  } else if (metaDesc.length < 100) {
    issues.push({ area: 'SEO', message: `Meta description too short (${metaDesc.length} chars) — aim for 140–155`, severity: 'warning', source: 'seo',
      description: `Your meta description is only ${metaDesc.length} characters. This leaves unused space that could be persuading searchers to click.`,
      fix: 'Expand your meta description to 140–155 characters. Describe what the page offers and include a clear call to action.' });
  } else if (metaDesc.length > 160) {
    issues.push({ area: 'SEO', message: `Meta description too long (${metaDesc.length} chars) — will be truncated`, severity: 'warning', source: 'seo',
      description: `At ${metaDesc.length} characters, your meta description exceeds Google's ~160 character display limit and will be cut off in search results.`,
      fix: 'Trim your meta description to under 160 characters while keeping the most important information and CTA.' });
  }

  // H1
  const h1s = [...(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  checks.h1Count = h1s.length;
  if (h1s.length === 0) {
    issues.push({ area: 'SEO', message: 'No H1 heading found', severity: 'critical', source: 'seo',
      description: 'The H1 tag is the main heading of your page and a strong relevance signal for search engines. Every page should have exactly one.',
      fix: 'Add a single <h1> tag near the top of your page content. It should describe the page\'s topic and ideally include your primary keyword.' });
  } else if (h1s.length > 1) {
    issues.push({ area: 'SEO', message: `Multiple H1 tags (${h1s.length}) — use only one per page`, severity: 'warning', source: 'seo',
      description: `This page has ${h1s.length} H1 tags, which can dilute your keyword focus and confuse search engines about the page\'s primary topic.`,
      fix: 'Keep only one H1 tag per page. Convert additional H1s to H2 or H3 to maintain a clear heading hierarchy.' });
  }

  // Canonical
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || '';
  checks.canonical = canonical;
  if (!canonical) {
    issues.push({ area: 'SEO', message: 'No canonical URL tag', severity: 'warning', source: 'seo',
      description: 'A canonical tag tells search engines which version of a URL is the "master" copy, preventing duplicate content penalties when the same content is accessible via multiple URLs.',
      fix: 'Add <link rel="canonical" href="https://yourdomain.com/page-url"> to your <head>. The href should be the preferred, authoritative URL for this page.' });
  }

  // Open Graph
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  const ogDesc  = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  checks.ogTitle = ogTitle;
  checks.ogDesc  = ogDesc;
  checks.ogImage = ogImage;
  if (!ogTitle || !ogDesc || !ogImage) {
    const missing = [!ogTitle && 'og:title', !ogDesc && 'og:description', !ogImage && 'og:image'].filter(Boolean).join(', ');
    issues.push({ area: 'SEO', message: 'Incomplete Open Graph tags — affects link sharing previews', severity: 'warning', source: 'seo',
      description: `Missing Open Graph tags: ${missing}. When someone shares your page on social media or messaging apps, these tags control the title, description, and preview image shown.`,
      fix: `Add the missing Open Graph meta tags to your <head>: ${missing}. Use og:title (60 chars), og:description (155 chars), and og:image (1200×630px recommended).` });
  }

  // Images without alt
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter(i => !/alt=["'][^"']+["']/.test(i)).length;
  checks.imgsTotal   = imgs.length;
  checks.imgsNoAlt   = imgsNoAlt;
  if (imgsNoAlt > 0) {
    issues.push({ area: 'SEO', message: `${imgsNoAlt} image${imgsNoAlt > 1 ? 's' : ''} missing alt text`, severity: imgsNoAlt > 3 ? 'critical' : 'warning', source: 'seo',
      description: `${imgsNoAlt} of your images have no alt attribute. Alt text helps search engines understand image content and is indexed for image search. It also serves as fallback text when images don't load.`,
      fix: 'Add descriptive alt attributes to all content images: <img src="..." alt="description of image">. For purely decorative images, use alt="" to tell screen readers to skip them.' });
  }

  // Schema markup
  const schemas = [...(html.matchAll(/"@type"\s*:\s*"([^"]+)"/g))].map(m => m[1]);
  checks.schemas = [...new Set(schemas)];
  if (schemas.length === 0) {
    issues.push({ area: 'SEO', message: 'No structured data (Schema.org) found', severity: 'info', source: 'seo',
      description: 'Structured data (JSON-LD markup) helps search engines understand your content and can unlock rich results like star ratings, FAQs, breadcrumbs, and event info in search results.',
      fix: 'Add JSON-LD structured data appropriate for your site type (e.g. Organization, LocalBusiness, Article, Product). Place it in a <script type="application/ld+json"> tag in your <head>.' });
  }

  // robots meta
  const robotsMeta = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i)?.[1] || '';
  checks.robotsMeta = robotsMeta;
  if (/noindex/i.test(robotsMeta)) {
    issues.push({ area: 'SEO', message: 'Page has noindex meta tag — search engines will not index it', severity: 'critical', source: 'seo',
      description: 'The meta robots tag contains "noindex", which instructs all search engines not to include this page in their index. This page will not appear in search results.',
      fix: 'If this page should be indexed, remove the noindex directive from your <meta name="robots"> tag or change it to <meta name="robots" content="index, follow">.' });
  }

  // Viewport
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  checks.viewport = hasViewport;
  if (!hasViewport) {
    issues.push({ area: 'SEO', message: 'No viewport meta tag — page may not be mobile-friendly', severity: 'critical', source: 'seo',
      description: 'Without a viewport meta tag, mobile browsers render the page at desktop width and scale it down, making it very hard to read on phones. Google uses mobile-first indexing, so this directly impacts rankings.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to your <head>. This is required for a responsive, mobile-friendly design.' });
  }

  // Score: start at 100, deduct per issue
  const deductions = { critical: 15, warning: 7, info: 2 };
  let score = 100;
  for (const i of issues) score -= deductions[i.severity] || 0;
  score = Math.max(0, Math.min(100, score));

  return { score, issues, checks };
}
