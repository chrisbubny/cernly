// Accessibility analyzer — lightweight HTML-based checks
// (Lighthouse also returns an a11y score; this supplements with specific checks)
import { proxyFetch } from '@/lib/proxy-fetch';

export async function runA11yCheck(url) {
  let html = '';
  try {
    const res = await proxyFetch(url, { timeout: 12000 });
    if (res.ok) html = await res.text();
  } catch {}

  if (!html) return { score: null, issues: [], checks: {}, status: 'fetch_failed' };

  const issues = [];
  const checks = {};

  // Images without alt
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter(i => !/alt=["'][^"']*["']/.test(i)).length;
  checks.imgsNoAlt = imgsNoAlt;
  if (imgsNoAlt > 0) {
    issues.push({ area: 'Accessibility', message: `${imgsNoAlt} image${imgsNoAlt > 1 ? 's' : ''} missing alt text`, severity: imgsNoAlt > 3 ? 'critical' : 'warning', source: 'a11y',
      description: `${imgsNoAlt} image${imgsNoAlt > 1 ? 's' : ''} on this page ${imgsNoAlt > 1 ? 'have' : 'has'} no alt attribute. Screen readers announce images by their alt text — without it, blind and low-vision users get no information about the image. Search engines also use alt text to understand images.`,
      fix: 'Add descriptive alt attributes to all meaningful images: <img src="..." alt="A short description of what the image shows">. For purely decorative images (backgrounds, dividers), use alt="" to tell screen readers to ignore them.' });
  }

  // Buttons without accessible labels
  const buttons = html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) || [];
  const emptyButtons = buttons.filter(b => !b.replace(/<[^>]+>/g, '').trim() && !/aria-label/i.test(b)).length;
  checks.emptyButtons = emptyButtons;
  if (emptyButtons > 0) {
    issues.push({ area: 'Accessibility', message: `${emptyButtons} button${emptyButtons > 1 ? 's' : ''} missing accessible label`, severity: 'warning', source: 'a11y',
      description: `${emptyButtons} button${emptyButtons > 1 ? 's have' : ' has'} no visible text or aria-label. Screen readers will announce these as "button" with no context, making them impossible to use for visually impaired users.`,
      fix: 'Add descriptive text inside buttons, or use aria-label for icon-only buttons: <button aria-label="Close dialog"><svg>...</svg></button>. The label should clearly describe the button\'s action.' });
  }

  // Links with generic text
  const links = html.match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || [];
  const genericLinks = links.filter(l => {
    const text = l.replace(/<[^>]+>/g, '').trim().toLowerCase();
    return ['click here', 'read more', 'learn more', 'here', 'more'].includes(text);
  }).length;
  checks.genericLinks = genericLinks;
  if (genericLinks > 0) {
    issues.push({ area: 'Accessibility', message: `${genericLinks} link${genericLinks > 1 ? 's' : ''} with non-descriptive text (e.g. "click here")`, severity: 'info', source: 'a11y',
      description: `${genericLinks} link${genericLinks > 1 ? 's use' : ' uses'} generic text like "click here" or "read more". Screen reader users often navigate by listing all links on a page — generic text gives no indication of where the link goes.`,
      fix: 'Replace generic link text with descriptive text that makes sense out of context. Instead of "click here", write "Download the 2024 Annual Report". Instead of "read more", write "Read more about our pricing".' });
  }

  // Form inputs without labels
  const inputs = html.match(/<input[^>]*type=["'](?:text|email|password|tel|number|search)['"]/gi) || [];
  const labels = (html.match(/<label[^>]*>/gi) || []).length;
  checks.inputCount = inputs.length;
  checks.labelCount = labels;
  if (inputs.length > 0 && labels < inputs.length) {
    issues.push({ area: 'Accessibility', message: 'Some form inputs may be missing associated labels', severity: 'warning', source: 'a11y',
      description: 'Form inputs without associated labels are not identifiable by screen readers. Users relying on assistive technology may not know what information a field expects, making forms inaccessible.',
      fix: 'Associate a <label> with every input using the "for" attribute matching the input\'s "id": <label for="email">Email address</label><input id="email" type="email">. Alternatively, use aria-label or aria-labelledby on the input.' });
  }

  // Language attribute
  const hasLang = /<html[^>]+lang=["'][^"']+["']/i.test(html);
  checks.hasLang = hasLang;
  if (!hasLang) {
    issues.push({ area: 'Accessibility', message: 'Missing lang attribute on <html> tag', severity: 'warning', source: 'a11y',
      description: 'Without a lang attribute on the <html> element, screen readers cannot determine the page\'s language and may use the wrong voice or pronunciation rules. It also affects browser translation features.',
      fix: 'Add a lang attribute to your <html> tag with the appropriate BCP 47 language tag: <html lang="en"> for English, <html lang="es"> for Spanish, etc.' });
  }

  // Skip nav link
  const hasSkipNav = /skip[\s-]*(to[\s-]*)?(main|content|nav)/i.test(html);
  checks.hasSkipNav = hasSkipNav;
  if (!hasSkipNav) {
    issues.push({ area: 'Accessibility', message: 'No skip navigation link found', severity: 'info', source: 'a11y',
      description: 'A "skip to main content" link lets keyboard and screen reader users bypass repetitive navigation menus. Without it, users must tab through every nav item on every page before reaching the main content.',
      fix: 'Add a visually hidden skip link as the very first element in your <body>: <a class="skip-link" href="#main-content">Skip to main content</a>. Style it to appear on focus only, and give your main content area id="main-content".' });
  }

  // Score
  const deductions = { critical: 15, warning: 8, info: 3 };
  let score = 100;
  for (const i of issues) score -= deductions[i.severity] || 0;
  score = Math.max(0, Math.min(100, score));

  return { score, issues, checks, status: 'completed' };
}
