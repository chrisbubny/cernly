// Accessibility analyzer — lightweight HTML-based checks
// (Lighthouse also returns an a11y score; this supplements with specific checks)
import { proxyFetch } from '@/lib/proxy-fetch';

export async function runA11yCheck(url) {
  let html = '';
  try {
    const res = await proxyFetch(url, { timeout: 12000 });
    if (res.ok) html = await res.text();
  } catch {}

  if (!html) return { score: null, issues: [], checks: {} };

  const issues = [];
  const checks = {};

  // Images without alt
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter(i => !/alt=["'][^"']*["']/.test(i)).length;
  checks.imgsNoAlt = imgsNoAlt;
  if (imgsNoAlt > 0) {
    issues.push({ area: 'Accessibility', message: `${imgsNoAlt} image${imgsNoAlt > 1 ? 's' : ''} missing alt text`, severity: imgsNoAlt > 3 ? 'critical' : 'warning', source: 'a11y' });
  }

  // Buttons without accessible labels
  const buttons = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const emptyButtons = buttons.filter(b => !b.replace(/<[^>]+>/g, '').trim() && !/aria-label/i.test(b)).length;
  checks.emptyButtons = emptyButtons;
  if (emptyButtons > 0) {
    issues.push({ area: 'Accessibility', message: `${emptyButtons} button${emptyButtons > 1 ? 's' : ''} missing accessible label`, severity: 'warning', source: 'a11y' });
  }

  // Links with generic text
  const links = html.match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const genericLinks = links.filter(l => {
    const text = l.replace(/<[^>]+>/g, '').trim().toLowerCase();
    return ['click here', 'read more', 'learn more', 'here', 'more'].includes(text);
  }).length;
  checks.genericLinks = genericLinks;
  if (genericLinks > 0) {
    issues.push({ area: 'Accessibility', message: `${genericLinks} link${genericLinks > 1 ? 's' : ''} with non-descriptive text (e.g. "click here")`, severity: 'info', source: 'a11y' });
  }

  // Form inputs without labels
  const inputs = html.match(/<input[^>]*type=["'](?:text|email|password|tel|number|search)['"]/gi) || [];
  const labels = (html.match(/<label[^>]*>/gi) || []).length;
  checks.inputCount = inputs.length;
  checks.labelCount = labels;
  if (inputs.length > 0 && labels < inputs.length) {
    issues.push({ area: 'Accessibility', message: 'Some form inputs may be missing associated labels', severity: 'warning', source: 'a11y' });
  }

  // Language attribute
  const hasLang = /<html[^>]+lang=["'][^"']+["']/i.test(html);
  checks.hasLang = hasLang;
  if (!hasLang) {
    issues.push({ area: 'Accessibility', message: 'Missing lang attribute on <html> tag', severity: 'warning', source: 'a11y' });
  }

  // Skip nav link
  const hasSkipNav = /skip[\s-]*(to[\s-]*)?(main|content|nav)/i.test(html);
  checks.hasSkipNav = hasSkipNav;
  if (!hasSkipNav) {
    issues.push({ area: 'Accessibility', message: 'No skip navigation link found', severity: 'info', source: 'a11y' });
  }

  // Score
  const deductions = { critical: 15, warning: 8, info: 3 };
  let score = 100;
  for (const i of issues) score -= deductions[i.severity] || 0;
  score = Math.max(0, Math.min(100, score));

  return { score, issues, checks };
}
