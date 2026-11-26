/**
 * scripts/render-pdf-fixture.cjs
 *
 * Renders fixture reports through the PRODUCTION PDF component tree
 * (app/api/report/[slug]/pdf/ReportPDF.js) — the same module and the same
 * renderToBuffer(React.createElement(ReportPDF, { report, size })) call the
 * GET /api/report/[slug]/pdf route uses. Nothing here re-implements layout.
 *
 * What the fixture does NOT exercise: the route's DB loading and access gate.
 * Fixture reports therefore mirror what the route passes to ReportPDF:
 * lib/store.js mapRow() output plus `recommendations` from
 * getRecommendationsByReport().
 *
 * Run from project root:
 *   node scripts/render-pdf-fixture.cjs
 *
 * Outputs (PDF + 150 DPI PNG per page) in /tmp/cernly-preview/.
 *
 * DATA NOTE: Constructed fixture — not production data.
 */

'use strict';

require('@swc/register')({
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'classic' } },
  },
  module: { type: 'commonjs' },
});

const path         = require('path');
const fs           = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
process.chdir(ROOT); // ReportPDF resolves fonts from process.cwd()/public/fonts, as in production

const { buildPriorityTasks, getImpact } = require(path.join(ROOT, 'lib/priority-tasks.js'));
const { renderToBuffer }                = require('@react-pdf/renderer');
const React                             = require('react');
const ReportPDFModule                   = require(path.join(ROOT, 'app/api/report/[slug]/pdf/ReportPDF.js'));
const ReportPDF                         = ReportPDFModule.default;
const { resolvePageSize }               = ReportPDFModule;

/**
 * Returns a copy of `issues` where any item URL whose origin matches the
 * canonical fixture domain (example-healthcare-portal.org) is rewritten to
 * use the origin of `reportUrl`. Label-only items (no `url`) are unchanged.
 *
 * This keeps the seo:canonical and seo:robots-txt absolute URLs accurate when
 * those issues are carried over to variant fixtures with different domains.
 */
const CANONICAL_FIXTURE_ORIGIN = 'https://www.example-healthcare-portal.org';
function applyDomain(issues, reportUrl) {
  let targetOrigin;
  try { targetOrigin = new URL(reportUrl).origin; } catch { return issues; }
  if (targetOrigin === CANONICAL_FIXTURE_ORIGIN) return issues; // unchanged for primary fixture
  return issues.map(issue => {
    if (!Array.isArray(issue.items)) return issue;
    const rewrittenItems = issue.items.map(item => {
      if (!item?.url) return item;
      if (item.url.startsWith(CANONICAL_FIXTURE_ORIGIN)) {
        return { ...item, url: item.url.replace(CANONICAL_FIXTURE_ORIGIN, targetOrigin) };
      }
      return item;
    });
    return { ...issue, items: rewrittenItems };
  });
}

// ── Fixture report ────────────────────────────────────────────────────────────
// CONSTRUCTED FIXTURE — not production data.
// Expanded to 31 findings across all 4 canonical categories for Phase 3 testing.
const fixtureReport = {
  id: 9999,
  slug: 'fixture-preview-9999',
  url: 'https://www.example-healthcare-portal.org',
  userId: 'user_fixture_owner',
  paid: true,
  createdAt: new Date('2026-11-17T14:00:00Z').toISOString(),
  scores: { performance: 42, seo: 88, security: 71, accessibility: 58 },
  // Production shape: lib/store.js mapRow() → auditStatuses keyed by category.
  auditStatuses: {
    performance:   { status: 'completed', score: 42 },
    seo:           { status: 'completed', score: 88 },
    security:      { status: 'completed', score: 71 },
    accessibility: { status: 'completed', score: 58 },
  },
  assessment: {
    headline: 'Critical performance and accessibility barriers are limiting reach',
    summary: 'Your site scores well on SEO and security fundamentals, but render-blocking resources and unoptimised images are causing significant load delays that hurt user retention and conversion. Fourteen accessibility violations are preventing users with assistive technologies from completing key workflows.',
    strengths: [
      { area: 'SEO',      finding: 'Strong meta structure and semantic headings', evidence: 'All pages have unique title tags and meta descriptions' },
      { area: 'Security', finding: 'Valid SSL certificate with HSTS header present', evidence: 'TLS 1.3, HSTS max-age 31536000' },
    ],
    concerns: [
      { area: 'Performance',   finding: 'Render-blocking JavaScript delays first contentful paint by ~2.4 s', severity: 'high',   evidence: 'Three synchronous scripts in <head>' },
      { area: 'Accessibility', finding: 'Missing alt text on 11 images fails WCAG 2.1 AA 1.1.1',              severity: 'high',   evidence: 'WCAG 2.1 AA 1.1.1' },
      { area: 'Performance',   finding: 'Largest Contentful Paint 4.8 s exceeds 2.5 s target',                severity: 'medium', evidence: 'Mobile PSI test' },
    ],
    top_opportunity: {
      title: 'Eliminate render-blocking resources to cut page load by ~40%',
      rationale: 'Moving three synchronous scripts to deferred loading would shave approximately 2.4 seconds from the initial page render on mobile, improving both user experience and Core Web Vitals ranking signals.',
      recommendation_fingerprints: ['performance-render-blocking'],
    },
    next_steps: null,
    // Deterministic coverage block attached by runAssessment (lib/analyzers/ai.js)
    coverage: { audits_ran: ['performance', 'seo', 'security', 'accessibility'], audits_failed: [], limitations: null },
  },
  aiSummary: null,
  issues: [
    // ── Performance: 10 findings ──────────────────────────────────────────
    { fingerprintId: 'lh:render-blocking',          severity: 'critical', area: 'Performance', source: 'lighthouse',
      message: 'Eliminate render-blocking resources',
      description: 'Three synchronous scripts in the <head> are delaying the first meaningful paint by approximately 2.4 seconds on a mobile connection.',
      items: [{ url: '/vendor/jquery.min.js', totalBytes: 87432 }, { url: '/js/app.bundle.js', totalBytes: 142800 }, { url: '/vendor/analytics-bundle.js', totalBytes: 54200 }] },
    { fingerprintId: 'lh:uses-optimized-images',    severity: 'critical', area: 'Performance', source: 'lighthouse',
      message: 'Serve images in next-gen formats',
      description: 'Hero and team images are served as unoptimised JPEG files. Converting to WebP would reduce transfer size by approximately 60%.',
      items: [{ url: '/images/hero-banner.jpg', totalBytes: 892000 }, { url: '/images/team-photo.jpg', totalBytes: 540000 }, { url: '/images/services-bg.jpg', totalBytes: 328000 }, { url: '/images/testimonial-1.jpg', totalBytes: 214000 }, { url: '/images/testimonial-2.jpg', totalBytes: 198000 }, { url: '/images/testimonial-3.jpg', totalBytes: 176000 }] },
    { fingerprintId: 'lh:font-display',             severity: 'warning',  area: 'Performance', source: 'lighthouse',
      message: 'Ensure text remains visible during webfont load',
      description: 'Google Fonts are loaded without font-display: swap, causing the browser to show invisible text until the font downloads.',
      items: [] },
    { fingerprintId: 'lh:unused-javascript',        severity: 'warning',  area: 'Performance', source: 'lighthouse',
      message: 'Remove unused JavaScript — potential savings: 148 KiB',
      description: '148 KiB of JavaScript is downloaded on every page load but never executed. This represents dead code from retired features.',
      items: [{ url: '/js/app.bundle.js', totalBytes: 97000, label: 'app.bundle.js — 97 KiB unused' }, { url: '/vendor/legacy-polyfills.js', totalBytes: 51000, label: 'legacy-polyfills.js — 51 KiB unused' }] },
    { fingerprintId: 'lh:largest-contentful-paint', severity: 'warning',  area: 'Performance', source: 'lighthouse',
      message: 'Largest Contentful Paint — 4.8 s (target < 2.5 s)',
      description: 'The LCP element is the hero banner image at /images/hero-banner.jpg. It is not preloaded and must wait for render-blocking scripts to complete before it begins loading.',
      items: [] },
    { fingerprintId: 'lh:total-blocking-time',      severity: 'warning',  area: 'Performance', source: 'lighthouse',
      message: 'Reduce Total Blocking Time — 1,240 ms (target < 200 ms)',
      description: 'The main thread is blocked for over 1.2 seconds during page load, primarily by long-running JavaScript tasks from the analytics bundle and app initialisation.',
      items: [] },
    { fingerprintId: 'lh:cumulative-layout-shift',  severity: 'warning',  area: 'Performance', source: 'lighthouse',
      message: 'Avoid large layout shifts — CLS: 0.28 (target < 0.1)',
      description: 'Images without explicit width/height attributes cause visible layout shifts as they load. The hero image is the primary contributor (CLS contribution: 0.19).',
      items: [{ url: '/images/hero-banner.jpg', label: 'No width/height set, CLS 0.19' }, { url: '/images/team-photo.jpg', label: 'No width/height set, CLS 0.09' }] },
    { fingerprintId: 'lh:uses-long-cache-ttl',      severity: 'info',     area: 'Performance', source: 'lighthouse',
      message: 'Serve static assets with an efficient cache policy — 14 resources found',
      description: 'Many static assets have no cache-control header or a very short TTL, forcing the browser to re-download unchanged files on every visit.',
      items: [{ url: '/css/main.css', label: 'Cache-Control: max-age=300 (5 min)' }, { url: '/js/app.bundle.js', label: 'Cache-Control: no-cache' }, { url: '/images/logo.svg', label: 'No Cache-Control header' }] },
    { fingerprintId: 'lh:efficient-animated-content', severity: 'info',   area: 'Performance', source: 'lighthouse',
      message: 'Use video formats for animated content',
      description: 'Two animated GIF files are used for feature demonstrations. Converting to MP4 or WebM would reduce their combined size from 3.4 MB to approximately 0.6 MB.',
      items: [{ url: '/images/demo-recording.gif', totalBytes: 2200000 }, { url: '/images/feature-tour.gif', totalBytes: 1200000 }] },
    { fingerprintId: 'lh:preconnect',               severity: 'info',     area: 'Performance', source: 'lighthouse',
      message: 'Preconnect to required third-party origins',
      description: 'DNS resolution and connection establishment for fonts.googleapis.com and cdn.segment.com could be initiated earlier with rel="preconnect" link tags.',
      items: [{ url: 'https://fonts.googleapis.com', label: 'First used at 480 ms' }, { url: 'https://cdn.segment.com', label: 'First used at 620 ms' }] },

    // ── SEO: 6 findings ───────────────────────────────────────────────────
    { fingerprintId: 'seo:canonical',               severity: 'warning',  area: 'SEO', source: 'seo',
      message: 'Missing canonical tag — duplicate content risk',
      description: 'The page at /services/ is accessible via three different URLs (/services, /services/, and /services/index.html) without a canonical tag to consolidate link equity.',
      items: [{ url: 'https://www.example-healthcare-portal.org/services/', label: 'Canonical not set' }] },
    { fingerprintId: 'seo:link-text',               severity: 'warning',  area: 'SEO', source: 'seo',
      message: 'Links do not have descriptive text — 8 "click here" and "read more" links found',
      description: 'Generic link text provides no context to screen readers or search engines about the destination of the link.',
      items: [] },
    { fingerprintId: 'seo:structured-data',         severity: 'info',     area: 'SEO', source: 'seo',
      message: 'No structured data markup detected',
      description: 'Adding Schema.org markup (HealthcareOrganization, MedicalBusiness, FAQPage) would improve how the site appears in search results with rich snippets.',
      items: [] },
    { fingerprintId: 'seo:robots-txt',              severity: 'info',     area: 'SEO', source: 'seo',
      message: 'robots.txt does not reference an XML sitemap',
      description: 'Adding a Sitemap: directive to /robots.txt helps search engines discover all pages more efficiently.',
      items: [{ url: 'https://www.example-healthcare-portal.org/robots.txt', label: 'No Sitemap: directive found' }] },
    { fingerprintId: 'seo:hreflang',               severity: 'info',     area: 'SEO', source: 'seo',
      message: 'No hreflang attributes found',
      description: 'If the site serves content to users in multiple regions or languages, hreflang attributes should be added to prevent duplicate content issues in international search.',
      items: [] },
    { fingerprintId: 'seo:crawlable-anchors',       severity: 'info',     area: 'SEO', source: 'seo',
      message: 'Links are not crawlable — 3 JavaScript-only click handlers found',
      description: 'Three navigation items rely on JavaScript onclick handlers with no href attribute, making them invisible to search engine crawlers.',
      items: [{ url: '/contact', label: '<a onclick="navigate()"> — no href' }, { url: '/portal', label: '<a onclick="openPortal()"> — no href' }] },

    // ── Security: 5 findings ──────────────────────────────────────────────
    { fingerprintId: 'ssl:weak-cipher',             severity: 'critical', area: 'Security', source: 'ssl',
      message: 'Weak cipher suites enabled (RC4, 3DES)',
      description: 'The server accepts connections using RC4 and 3DES cipher suites, which are considered cryptographically weak by modern standards and are prohibited by PCI DSS.',
      items: [] },
    { fingerprintId: 'ssl:tls-version',             severity: 'warning',  area: 'Security', source: 'ssl',
      message: 'TLS 1.0 and TLS 1.1 are still supported',
      description: 'TLS 1.0 and 1.1 are deprecated protocols with known vulnerabilities (POODLE, BEAST). Both are prohibited by PCI DSS 3.2.1 and should be disabled.',
      items: [] },
    { fingerprintId: 'ssl:hsts-subdomains',         severity: 'warning',  area: 'Security', source: 'ssl',
      message: 'HSTS header does not include subdomains',
      description: 'The Strict-Transport-Security header is present but does not include the includeSubDomains directive, leaving subdomains vulnerable to protocol downgrade attacks.',
      items: [] },
    { fingerprintId: 'ssl:csp-missing',             severity: 'warning',  area: 'Security', source: 'ssl',
      message: 'Content-Security-Policy header is absent',
      description: 'No Content-Security-Policy header was found. A CSP restricts what resources the browser can load, providing important protection against cross-site scripting (XSS) attacks.',
      items: [] },
    { fingerprintId: 'ssl:x-frame-options',         severity: 'info',     area: 'Security', source: 'ssl',
      message: 'X-Frame-Options header present but should be replaced by CSP frame-ancestors',
      description: 'The X-Frame-Options header is set to DENY, which is good, but the preferred modern approach is to use the Content-Security-Policy frame-ancestors directive instead.',
      items: [] },

    // ── Accessibility: 10 findings ────────────────────────────────────────
    { fingerprintId: 'a11y:image-alt',              severity: 'critical', area: 'Accessibility', source: 'a11y',
      message: 'Image elements do not have alt attributes — 11 images affected',
      description: 'Eleven images across the page have no alt attribute, making them invisible to screen readers and failing WCAG 2.1 AA Success Criterion 1.1.1 Non-text Content.',
      // Production shape (lib/analyzers/a11y.js): one item per <img> with a
      // recoverable src; totalDetected counts every missing-alt <img>. Here 5 of
      // the 11 are inline data: URIs, which the analyzer cannot list by path.
      items: [
        { url: '/images/hero-banner.jpg',   label: 'hero-banner.jpg' },
        { url: '/images/services-bg.jpg',   label: 'services-bg.jpg' },
        { url: '/images/team-photo.jpg',    label: 'team-photo.jpg' },
        { url: '/images/testimonial-1.jpg', label: 'testimonial-1.jpg' },
        { url: '/images/testimonial-2.jpg', label: 'testimonial-2.jpg' },
        { url: '/images/testimonial-3.jpg', label: 'testimonial-3.jpg' },
      ],
      totalDetected: 11 },
    { fingerprintId: 'a11y:label',                  severity: 'critical', area: 'Accessibility', source: 'a11y',
      message: 'Form elements do not have associated labels — 4 inputs affected',
      description: 'Four form inputs in the contact and appointment booking forms have no programmatically associated label, making them inaccessible to screen reader users. Fails WCAG 2.1 AA 1.3.1 Info and Relationships.',
      items: [
        { label: '<input type="text" name="patient_dob"> — no label' },
        { label: '<input type="tel" name="contact_phone"> — no label' },
        { label: '<select name="appointment_type"> — no label' },
        { label: '<textarea name="medical_notes"> — no label' },
      ] },
    { fingerprintId: 'a11y:color-contrast',         severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'Background and foreground colours do not have sufficient contrast ratio',
      description: 'Several text/background colour combinations fail the WCAG 2.1 AA minimum contrast ratio of 4.5:1, including the primary body text (#6B7280 on white, ratio: 4.1:1).',
      items: [
        { label: 'Body text: #6B7280 on #FFFFFF — ratio 4.1:1 (required: 4.5:1)' },
        { label: 'Button text: #FFFFFF on #3B82F6 — ratio 3.4:1 (required: 4.5:1)' },
        { label: 'Footer links: #9CA3AF on #1F2937 — ratio 4.0:1 (required: 4.5:1)' },
      ] },
    { fingerprintId: 'a11y:aria-labels',            severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'Interactive elements missing accessible names — 3 icon buttons',
      description: 'Three icon-only buttons in the main navigation have no accessible label, making them inoperable for screen reader users. Fails WCAG 2.1 AA 4.1.2 Name, Role, Value.',
      items: [
        { label: 'Mobile menu toggle — icon only, no aria-label' },
        { label: 'Search button — icon only, no aria-label' },
        { label: 'User account button — icon only, no aria-label' },
      ] },
    { fingerprintId: 'a11y:landmark-one-main',      severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'Page does not have a <main> landmark region',
      description: 'The page content is wrapped in a generic <div> rather than a <main> element. Screen reader users rely on landmark regions to skip to the main content of a page.',
      items: [] },
    { fingerprintId: 'a11y:skip-link',              severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'No skip navigation link provided',
      description: 'Keyboard users must tab through all navigation links on every page before reaching the main content. A "Skip to main content" link at the top of the page would address this. Relates to WCAG 2.1 AA 2.4.1 Bypass Blocks.',
      items: [] },
    { fingerprintId: 'a11y:focus-visible',          severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'Focus indicator is not visible on interactive elements',
      description: 'The CSS `outline: none` rule suppresses the default focus ring on all interactive elements, making keyboard navigation impossible for sighted keyboard users. Fails WCAG 2.1 AA 2.4.7 Focus Visible.',
      items: [{ label: 'All <a>, <button>, <input> elements: outline: none applied globally' }] },
    { fingerprintId: 'a11y:heading-order',          severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'Heading levels are not in a sequentially-descending order',
      description: 'The page skips from h1 to h3 in the services section, with no h2. Assistive technologies use heading structure to build a document outline for navigation.',
      items: [{ label: 'Services section: h1 → h3 (h2 skipped)' }, { label: 'Footer: h4 without parent h3' }] },
    { fingerprintId: 'a11y:duplicate-id-active',    severity: 'warning',  area: 'Accessibility', source: 'a11y',
      message: 'Active, focusable elements have duplicate IDs',
      description: 'Two modal dialogs and a form use the same id="close-btn", which is invalid HTML and causes screen readers to associate ARIA attributes with the wrong elements.',
      items: [
        { label: 'id="close-btn" duplicated on 3 modal elements' },
        { label: 'id="email-input" duplicated in newsletter and contact forms' },
      ] },
    { fingerprintId: 'a11y:tabindex',               severity: 'info',     area: 'Accessibility', source: 'a11y',
      message: 'Some elements have tabindex > 0 — disrupts natural tab order',
      description: 'Using tabindex values greater than 0 overrides the natural DOM order for keyboard navigation, which can be disorienting for keyboard-only users.',
      items: [
        { label: '<button tabindex="5"> in appointment widget' },
        { label: '<a tabindex="3"> in hero section' },
      ] },
  ],
  recommendations: [
    {
      fingerprint: 'performance-render-blocking', title: 'Eliminate render-blocking resources',
      category: 'Performance', priority: 'critical',
      what_we_found: 'Three synchronous scripts in the <head> are delaying the first meaningful paint by approximately 2.4 seconds on a mobile connection.',
      actions: ['Add defer or async attribute to non-critical <script> tags', 'Move scripts that manipulate DOM to end of <body>', 'Audit third-party tags — remove any no longer in use', 'Consider a tag manager to control script loading order'],
      supporting_findings: [{ fingerprintId: 'lh:render-blocking', severity: 'critical', area: 'Performance', source: 'lighthouse', items: [], message: 'Render-blocking resources', description: 'Three synchronous scripts block first paint.' }, { fingerprintId: 'lh:largest-contentful-paint', severity: 'warning', area: 'Performance', source: 'lighthouse', items: [], message: 'LCP 4.8 s', description: 'Largest Contentful Paint exceeds recommended threshold.' }],
      finding_fingerprints: ['lh:render-blocking', 'lh:largest-contentful-paint'],
    },
    {
      fingerprint: 'performance-image-optimization', title: 'Optimise images — convert to WebP/AVIF and compress',
      category: 'Performance', priority: 'critical',
      what_we_found: 'Hero and team images are served as unoptimised JPEG files totalling 1.4 MB. Converting to WebP would reduce transfer size by approximately 60%.',
      actions: ['Convert JPEG/PNG images to WebP using Squoosh or sharp', 'Set explicit width and height attributes to prevent layout shift', 'Add loading="lazy" to below-fold images', 'Use srcset for responsive image delivery'],
      supporting_findings: [{ fingerprintId: 'lh:uses-optimized-images', severity: 'critical', area: 'Performance', source: 'lighthouse', items: [{ url: '/images/hero-banner.jpg', totalBytes: 892000 }], message: 'Serve images in next-gen formats', description: 'Potential savings: ~855 KB' }],
      finding_fingerprints: ['lh:uses-optimized-images'],
    },
    {
      fingerprint: 'accessibility-missing-alt-text', title: 'Add alt text to all informative images — 11 images affected',
      category: 'Accessibility', priority: 'critical',
      what_we_found: '11 images across the site have no alt attribute, making them invisible to screen readers and failing WCAG 2.1 AA Success Criterion 1.1.1.',
      actions: ['Add descriptive alt text to all informative images', 'Use alt="" for purely decorative images', 'Avoid redundant phrases like "image of" or "photo of"', 'Review and update CMS media library alt text fields'],
      supporting_findings: [{ fingerprintId: 'a11y:image-alt', severity: 'critical', area: 'Accessibility', source: 'a11y', items: [], message: 'Images missing alt attributes', description: 'WCAG 2.1 AA 1.1.1 Non-text Content' }, { fingerprintId: 'seo:meta-alt', severity: 'warning', area: 'SEO', source: 'seo', items: [], message: 'Missing image alt text affects SEO', description: 'Alt text contributes to image indexing.' }],
      finding_fingerprints: ['a11y:image-alt', 'seo:meta-alt'],
    },
    {
      fingerprint: 'performance-font-display', title: 'Prevent invisible text during web font loading',
      category: 'Performance', priority: 'high',
      what_we_found: 'Google Fonts are loaded without font-display: swap, causing the browser to show invisible text until the font downloads.',
      actions: ['Add &display=swap to the Google Fonts URL query string', 'Consider self-hosting fonts to eliminate the third-party DNS lookup'],
      supporting_findings: [{ fingerprintId: 'lh:font-display', severity: 'warning', area: 'Performance', source: 'lighthouse', items: [], message: 'Font display swap missing', description: 'Web fonts block text rendering.' }],
      finding_fingerprints: ['lh:font-display'],
    },
    {
      fingerprint: 'performance-javascript-unused', title: 'Remove or defer unused JavaScript (148 KiB savings)',
      category: 'Performance', priority: 'high',
      what_we_found: '148 KiB of JavaScript is downloaded on every page load but never executed. This represents dead code from retired features.',
      actions: ['Run a coverage audit in Chrome DevTools to identify unused code', 'Enable tree shaking in your bundler configuration', 'Split large bundles with dynamic import() for route-level code splitting'],
      supporting_findings: [{ fingerprintId: 'lh:unused-javascript', severity: 'warning', area: 'Performance', source: 'lighthouse', items: [], message: 'Remove unused JavaScript', description: 'Potential savings: 148 KiB' }],
      finding_fingerprints: ['lh:unused-javascript'],
    },
    {
      fingerprint: 'accessibility-color-contrast', title: 'Fix insufficient colour contrast on body text and UI controls',
      category: 'Accessibility', priority: 'medium',
      what_we_found: 'Several text/background colour combinations fail the WCAG 2.1 AA minimum contrast ratio of 4.5:1, including the primary body text colour (#6B7280 on white).',
      actions: ['Use the WebAIM Contrast Checker to verify colour pairs', 'Update body text colour from #6B7280 to #595F6B or darker', 'Review all UI states: hover, focus, disabled'],
      supporting_findings: [{ fingerprintId: 'a11y:color-contrast', severity: 'warning', area: 'Accessibility', source: 'a11y', items: [], message: 'Colour contrast failures', description: 'WCAG 2.1 AA 1.4.3' }],
      finding_fingerprints: ['a11y:color-contrast'],
    },
    {
      fingerprint: 'accessibility-aria-interactive', title: 'Add accessible labels to interactive controls — buttons and links without discernible text',
      category: 'Accessibility', priority: 'medium',
      what_we_found: 'Three icon buttons in the main navigation have no accessible label, making them inoperable for screen reader users who cannot see the icons.',
      actions: ['Add aria-label="Menu" (or appropriate description) to icon-only buttons', 'Use visually-hidden span text as an alternative to aria-label', 'Verify with VoiceOver or NVDA that all controls are announced correctly'],
      supporting_findings: [{ fingerprintId: 'a11y:aria-labels', severity: 'warning', area: 'Accessibility', source: 'a11y', items: [], message: 'Interactive elements missing accessible names', description: 'WCAG 2.1 AA 4.1.2' }],
      finding_fingerprints: ['a11y:aria-labels'],
    },
    {
      fingerprint: 'security-tls-configuration', title: 'Disable weak cipher suites and legacy TLS versions',
      category: 'Security', priority: 'critical',
      what_we_found: 'The server accepts connections using RC4 and 3DES cipher suites and supports TLS 1.0 and 1.1 — all deprecated and prohibited by PCI DSS.',
      actions: [
        'Disable RC4 and 3DES cipher suites in your server\'s TLS configuration (nginx: ssl_ciphers; Apache: SSLCipherSuite)',
        'Disable TLS 1.0 and TLS 1.1 — accept only TLS 1.2 and 1.3',
        'Use Mozilla SSL Configuration Generator (ssl-config.mozilla.org) for a production-safe cipher list',
        'Retest with SSL Labs (ssllabs.com/ssltest) to verify an A or A+ rating after changes',
      ],
      supporting_findings: [
        { fingerprintId: 'ssl:weak-cipher', severity: 'critical', area: 'Security', source: 'ssl', items: [], message: 'Weak cipher suites enabled (RC4, 3DES)', description: 'Cryptographically weak ciphers accepted.' },
        { fingerprintId: 'ssl:tls-version', severity: 'warning',  area: 'Security', source: 'ssl', items: [], message: 'TLS 1.0 and TLS 1.1 still supported', description: 'Deprecated protocols with known vulnerabilities.' },
      ],
      finding_fingerprints: ['ssl:weak-cipher', 'ssl:tls-version'],
    },
    {
      fingerprint: 'accessibility-form-labels', title: 'Associate labels with all form inputs — 4 unlabelled inputs',
      category: 'Accessibility', priority: 'critical',
      what_we_found: 'Four form inputs in the contact and appointment booking forms have no programmatically associated label, making them inaccessible to screen reader users. Fails WCAG 2.1 AA 1.3.1.',
      actions: [
        'Add a <label for="id"> element for each input, or use aria-label / aria-labelledby on the input itself',
        'Never rely on placeholder text alone — it disappears when the user starts typing',
        'Test with VoiceOver (macOS/iOS) or NVDA (Windows) to confirm labels are announced on focus',
        'Run axe DevTools browser extension to verify no remaining label violations',
      ],
      supporting_findings: [
        { fingerprintId: 'a11y:label', severity: 'critical', area: 'Accessibility', source: 'a11y', items: [], message: 'Form elements do not have associated labels', description: 'WCAG 2.1 AA 1.3.1 Info and Relationships.' },
      ],
      finding_fingerprints: ['a11y:label'],
    },
  ],
};

const fixtureNoAssessment = {
  ...fixtureReport,
  url: 'https://www.no-assessment-example.com',
  issues: applyDomain(fixtureReport.issues, 'https://www.no-assessment-example.com'),
  assessment: null,
  aiSummary: 'Automated summary: performance is below average with significant optimisation opportunities across image delivery, JavaScript loading, and font rendering.',
};

// Failed Lighthouse analyzer — performance score null, no Lighthouse issues
const fixtureFailedLighthouse = {
  ...fixtureReport,
  url: 'https://www.failed-analyzer-example.com',
  scores: { performance: null, seo: 88, security: 71, accessibility: 58 },
  auditStatuses: {
    performance:   { status: 'failed', score: null, error: { code: 'LIGHTHOUSE_ERROR', message: 'Lighthouse failed to run.', retryable: true } },
    seo:           { status: 'completed', score: 88 },
    security:      { status: 'completed', score: 71 },
    accessibility: { status: 'completed', score: 58 },
  },
  issues: applyDomain(
    fixtureReport.issues.filter(i => i.source !== 'lighthouse'),
    'https://www.failed-analyzer-example.com',
  ),
  recommendations: fixtureReport.recommendations.filter(r => r.category !== 'Performance'),
  assessment: {
    headline: 'Performance data unavailable — accessibility and security issues detected',
    summary: 'The Performance analyzer timed out during this scan and could not collect Core Web Vitals data. The SEO, Security, and Accessibility analyzers completed successfully. Address the security cipher suite vulnerabilities and accessibility form-label issues as a priority while the performance analysis is retried.',
    // Strengths from analyzers that completed — no Performance claims
    strengths: [
      { area: 'SEO',      finding: 'Strong meta structure and semantic headings', evidence: 'All pages have unique title tags and meta descriptions' },
      { area: 'Security', finding: 'Valid SSL certificate with HSTS header present', evidence: 'TLS 1.3, HSTS max-age 31536000' },
    ],
    // Only concerns from analyzers that completed (SEO, Security, Accessibility)
    concerns: [
      { area: 'Accessibility', finding: 'Missing alt text on 11 images fails WCAG 2.1 AA 1.1.1', severity: 'high', evidence: 'WCAG 2.1 AA 1.1.1' },
      { area: 'Security',      finding: 'Weak cipher suites (RC4, 3DES) accepted by server',      severity: 'high', evidence: 'PCI DSS prohibition' },
    ],
    // top_opportunity was performance-related — suppress it since Performance analyzer failed
    top_opportunity: null,
    next_steps: null,
    coverage: { audits_ran: ['seo', 'security', 'accessibility'], audits_failed: ['performance'], limitations: 'Performance data was unavailable for this scan — treat any conclusions about that area with caution.' },
  },
};

// Stale assessment on a partial scan: Lighthouse failed, but the stored
// assessment has no coverage record (legacy) and its narrative makes
// performance claims. Headline and summary must be withheld.
const fixtureStaleAssessment = {
  ...fixtureFailedLighthouse,
  url: 'https://www.stale-assessment-example.com',
  issues: applyDomain(
    fixtureReport.issues.filter(i => i.source !== 'lighthouse'),
    'https://www.stale-assessment-example.com',
  ),
  assessment: {
    headline: 'Your page load time is excellent at under 1 s',
    summary:  'Core Web Vitals are all in the good range, and SEO fundamentals are strong.',
    strengths: [
      { area: 'Performance', finding: 'Fast first contentful paint' },
      { area: 'SEO',         finding: 'Strong meta structure and semantic headings' },
    ],
    concerns: [
      { area: 'Accessibility', finding: 'Missing alt text on 11 images fails WCAG 2.1 AA 1.1.1', severity: 'high' },
    ],
    top_opportunity: null,
    next_steps: null,
  },
};

// A4 variant of the main fixture
const fixtureA4 = { ...fixtureReport, url: 'https://www.example-healthcare-portal.org' };

// ── Main render ───────────────────────────────────────────────────────────────
async function main() {
  const OUT_DIR = '/tmp/cernly-preview';
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cases = [
    { name: 'fixture-report',           report: fixtureReport,           size: 'letter', label: 'Main fixture (LETTER, full assessment, 31 findings)' },
    { name: 'fixture-report-a4',        report: fixtureA4,               size: 'a4',     label: 'Main fixture (A4)' },
    { name: 'fixture-no-assessment',    report: fixtureNoAssessment,     size: 'letter', label: 'No-assessment fallback (aiSummary string)' },
    { name: 'fixture-failed-analyzer',  report: fixtureFailedLighthouse, size: 'letter', label: 'Failed Lighthouse analyzer (Performance null)' },
    { name: 'fixture-stale-assessment', report: fixtureStaleAssessment,  size: 'letter', label: 'Stale legacy assessment on partial scan (narrative withheld)' },
  ];

  for (const { name, report, size, label } of cases) {
    console.log(`\n[render] ── ${label} ──`);
    console.log('[render] URL:', report.url);
    const tasks = buildPriorityTasks(report.issues, report.recommendations);
    console.log('[render] Tasks:', tasks.length);
    tasks.forEach((t, i) => console.log(`  [${i + 1}] [${t.severity}] [${getImpact(t, i)}] ${t.message.slice(0, 60)}`));

    // Identical to route.js: resolvePageSize(query param) → ReportPDF
    const pdfBuffer = await renderToBuffer(React.createElement(ReportPDF, { report, size: resolvePageSize(size) }));
    const pdfPath   = path.join(OUT_DIR, `${name}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`[render] PDF → ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

    for (const f of fs.readdirSync(OUT_DIR)) if (f.startsWith(`${name}-page`)) fs.unlinkSync(path.join(OUT_DIR, f));
    execSync(`pdftoppm -r 150 -png "${pdfPath}" "${path.join(OUT_DIR, `${name}-page`)}"`, { stdio: 'pipe' });
    const pngs = fs.readdirSync(OUT_DIR).filter(f => f.startsWith(`${name}-page`) && f.endsWith('.png'));
    console.log(`[render] Pages: ${pngs.length}`);
  }
  console.log('\n[render] Done.');
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { applyDomain, CANONICAL_FIXTURE_ORIGIN, fixtureReport, fixtureA4, fixtureNoAssessment, fixtureFailedLighthouse, fixtureStaleAssessment };
