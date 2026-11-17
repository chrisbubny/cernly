/**
 * scripts/render-pdf-fixture.cjs
 *
 * Renders a PDF from the fixture report using the production utilities
 * (buildPriorityTasks, getImpact, styles, page-size) and @react-pdf/renderer
 * directly via React.createElement — no JSX compilation needed.
 *
 * Run from project root:
 *   node scripts/render-pdf-fixture.cjs
 *
 * Outputs:
 *   /tmp/cernly-preview/fixture-report.pdf
 *   /tmp/cernly-preview/page-NNN.png  (one per page, 150 DPI)
 *
 * DATA NOTE: Uses a constructed fixture (not production DB data).
 * Values are realistic and exercise all code paths: 4 canonical scores,
 * structured assessment, 7 recs, ungrouped critical finding, multi-category
 * rec, long title, missing assessment fallback, empty-rec edge case.
 */

'use strict';

// ── @swc/register must be first so JSX in transitively-loaded files compiles ─
// (Our util files don't use JSX, but keeping it for safety.)
require('@swc/register')({
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'classic' } },
  },
  module: { type: 'commonjs' },
});

const path  = require('path');
const fs    = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// ── Pure utilities (ESM via createRequire workaround: use dynamic require) ─────
// Since these are ESM files and @swc/register converts to CJS via interop,
// we can require() them after the hook.
const { buildPriorityTasks, getImpact } = require(path.join(ROOT, 'lib/priority-tasks.js'));
const { resolvePageSize }               = require(path.join(ROOT, 'app/api/report/[slug]/pdf/page-size.js'));

// ── @react-pdf/renderer ───────────────────────────────────────────────────────
const PDF = require(path.join(ROOT, 'node_modules/@react-pdf/renderer/lib/react-pdf.js'));
const { Document, Page, View, Text, Font, StyleSheet, renderToBuffer } = PDF;

const React = require(path.join(ROOT, 'node_modules/react/index.js'));
const e = React.createElement;

// ── Font registration ─────────────────────────────────────────────────────────
const FONTS_DIR = path.join(ROOT, 'public/fonts');

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(FONTS_DIR, 'Inter-Regular.woff'),  fontWeight: 400 },
    { src: path.join(FONTS_DIR, 'Inter-Medium.woff'),   fontWeight: 500 },
    { src: path.join(FONTS_DIR, 'Inter-SemiBold.woff'), fontWeight: 600 },
    { src: path.join(FONTS_DIR, 'Inter-Bold.woff'),     fontWeight: 700 },
  ],
});
Font.register({ family: 'Inter-Medium',   src: path.join(FONTS_DIR, 'Inter-Medium.woff') });
Font.register({ family: 'Inter-SemiBold', src: path.join(FONTS_DIR, 'Inter-SemiBold.woff') });
Font.register({ family: 'Inter-Bold',     src: path.join(FONTS_DIR, 'Inter-Bold.woff') });
Font.registerHyphenationCallback(w => [w]);

// ── Color tokens ───────────────────────────────────────────────────────────────
const C = {
  teal: '#00D4AA', purple: '#A78BFA', ink: '#151621', inkSub: '#4B5168',
  muted: '#83899C', border: '#E9EAF2', pageBg: '#FFFFFF', tileBg: '#FAFAFF',
  summaryBg: '#F7F4FF', summaryAccent: '#7948F6',
  scoreGood: '#19B987', scoreWarn: '#EFA642', scoreBad: '#EF6473', scoreMissing: '#B0B4C8',
  sevCritBg: '#FFF0F2', sevWarnBg: '#FFF8ED', sevGoodBg: '#EDF9F4', sevInfoBg: '#F4F5FB',
  oppBg: '#F0FDF9',
};

function scoreColor(s) { return s == null ? C.scoreMissing : s >= 80 ? C.scoreGood : s >= 60 ? C.scoreWarn : C.scoreBad; }
function sevColor(sev)  { return ({ critical: C.scoreBad, warning: C.scoreWarn, good: C.scoreGood, info: C.scoreMissing })[sev] ?? C.scoreMissing; }
function sevBg(sev)     { return ({ critical: C.sevCritBg, warning: C.sevWarnBg, good: C.sevGoodBg, info: C.sevInfoBg })[sev] ?? C.sevInfoBg; }
function impactColor(i) { return ({ high: C.scoreBad, medium: C.scoreWarn, low: C.scoreGood })[i] ?? C.muted; }
function impactLabel(i) { return ({ high: 'High Impact', medium: 'Medium Impact', low: 'Low Impact' })[i] ?? i; }

const CAT_ACCENT = { Performance: '#EF6473', SEO: '#EFA642', Accessibility: '#7948F6', Security: '#19B987' };
const KNOWN_CATS = new Set(['Performance', 'SEO', 'Security', 'Accessibility']);

// ── StyleSheet ────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:          { fontFamily: 'Inter', fontSize: 10, color: C.ink, paddingTop: 44, paddingBottom: 52, paddingHorizontal: 44, backgroundColor: C.pageBg },
  footer:        { position: 'absolute', bottom: 20, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 7 },
  footerText:    { fontSize: 8, color: C.muted },
  header:        { marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  brandRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  brandDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: C.teal, marginRight: 5 },
  brandName:     { fontSize: 12, fontFamily: 'Inter-SemiBold', color: C.ink, letterSpacing: 0.4 },
  reportTitle:   { fontSize: 20, fontFamily: 'Inter-Bold', color: C.ink, marginBottom: 4 },
  reportUrl:     { fontSize: 11, color: C.summaryAccent },
  reportDate:    { fontSize: 9, color: C.muted, marginTop: 3 },
  scoresRow:     { flexDirection: 'row', gap: 10, marginBottom: 20 },
  scoreTile:     { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: C.tileBg },
  scoreNum:      { fontSize: 26, fontFamily: 'Inter-Bold', lineHeight: 1.1, marginBottom: 4 },
  scoreLabel:    { fontSize: 7.5, color: C.muted, fontFamily: 'Inter-SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle:  { fontSize: 12, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 8, marginTop: 18 },
  sectionDiv:    { borderTopWidth: 1, borderTopColor: C.border, marginTop: 3, marginBottom: 14 },
  summaryBox:    { backgroundColor: C.summaryBg, borderRadius: 8, padding: 14, marginBottom: 18 },
  summaryLabel:  { fontSize: 8.5, fontFamily: 'Inter-SemiBold', color: C.summaryAccent, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 },
  summaryHead:   { fontSize: 13, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 6, lineHeight: 1.4 },
  summaryText:   { fontSize: 10, color: C.inkSub, lineHeight: 1.65 },
  oppBox:        { borderLeftWidth: 3, borderLeftColor: C.teal, backgroundColor: C.oppBg, borderRadius: 6, padding: 12, marginBottom: 18 },
  oppLabel:      { fontSize: 8, fontFamily: 'Inter-SemiBold', color: C.teal, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },
  oppTitle:      { fontSize: 11, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 4 },
  oppRationale:  { fontSize: 9.5, color: C.inkSub, lineHeight: 1.55 },
  taskCard:      { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: C.pageBg },
  taskHeader:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  taskSevDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 2, flexShrink: 0 },
  taskTitle:     { flex: 1, fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: C.ink, lineHeight: 1.4 },
  taskBadge:     { fontSize: 7.5, fontFamily: 'Inter-SemiBold', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, flexShrink: 0 },
  taskMeta:      { flexDirection: 'row', marginBottom: 6 },
  taskCat:       { fontSize: 7.5, fontFamily: 'Inter-Medium', color: C.muted },
  taskDesc:      { fontSize: 9, color: C.inkSub, lineHeight: 1.6, marginBottom: 5 },
  taskFixLbl:    { fontSize: 8.5, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 3 },
  taskFixTxt:    { fontSize: 9, color: C.inkSub, lineHeight: 1.55 },
  taskActRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3, gap: 5 },
  taskActBullet: { fontSize: 9, color: C.teal, marginTop: 1, flexShrink: 0 },
  taskActTxt:    { fontSize: 9, color: C.inkSub, lineHeight: 1.5, flex: 1 },
});

// ── Footer component ──────────────────────────────────────────────────────────
function Footer() {
  return e(View, { style: S.footer, fixed: true },
    e(Text, { style: S.footerText }, 'cernly.ai — Website Analysis Report'),
    e(Text, { style: S.footerText,
      render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` })
  );
}

// ── Score tile ────────────────────────────────────────────────────────────────
function ScoreTile({ label, value }) {
  return e(View, { style: S.scoreTile },
    e(Text, { style: [S.scoreNum, { color: scoreColor(value) }] }, value != null ? String(value) : '—'),
    e(Text, { style: S.scoreLabel }, label.toUpperCase())
  );
}

// ── Cover page ────────────────────────────────────────────────────────────────
function CoverPage({ report, pageSize }) {
  const { url, scores = {}, aiSummary, assessment, createdAt } = report;
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const dateStr = createdAt ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  const headline  = assessment?.headline ?? null;
  const summary   = assessment?.summary  ?? aiSummary ?? null;
  const topOpp    = assessment?.top_opportunity ?? null;

  const SCORE_ENTRIES = [
    { key: 'performance',   label: 'Performance'   },
    { key: 'seo',           label: 'SEO'            },
    { key: 'security',      label: 'Security'       },
    { key: 'accessibility', label: 'Accessibility'  },
  ];

  return e(Page, { size: pageSize, style: S.page },
    // Header
    e(View, { style: S.header },
      e(View, { style: S.brandRow },
        e(View, { style: S.brandDot }),
        e(Text, { style: S.brandName }, 'Cernly')
      ),
      e(Text, { style: S.reportTitle }, 'Website Analysis Report'),
      e(Text, { style: S.reportUrl }, url),
      dateStr && e(Text, { style: S.reportDate }, `Generated ${dateStr}`)
    ),
    // Scores
    e(View, { style: S.scoresRow },
      ...SCORE_ENTRIES.map(({ key, label }) =>
        e(ScoreTile, { key, label, value: scores[key] ?? null })
      )
    ),
    // Executive summary
    (headline || summary) && e(View, { style: S.summaryBox },
      e(Text, { style: S.summaryLabel }, '✦ AI Analysis'),
      headline && e(Text, { style: S.summaryHead }, headline),
      summary  && e(Text, { style: S.summaryText }, summary)
    ),
    // Top opportunity
    topOpp?.title && e(View, { style: S.oppBox },
      e(Text, { style: S.oppLabel }, 'Top Opportunity'),
      e(Text, { style: S.oppTitle }, topOpp.title),
      topOpp.rationale && e(Text, { style: S.oppRationale }, topOpp.rationale)
    ),
    e(Footer)
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function catText(task) {
  const primary = task.area || 'Performance';
  if (Array.isArray(task._categories) && task._categories.length > 1) {
    const labels = task._categories.filter(c => KNOWN_CATS.has(c));
    if (labels.length > 0) return labels.join(' · ');
  }
  return KNOWN_CATS.has(primary) ? primary : 'Performance';
}

function TaskCard({ task, idx }) {
  const impact  = getImpact(task, idx);
  const cats    = catText(task);
  const color   = sevColor(task.severity);
  const bg      = sevBg(task.severity);
  const iColor  = impactColor(impact);
  const iLabel  = impactLabel(impact);
  const actions = Array.isArray(task._rec?.actions) ? task._rec.actions.slice(0, 4) : [];

  return e(View, { style: S.taskCard, wrap: false },
    // Header: dot + title + badge
    e(View, { style: S.taskHeader },
      e(View, { style: [S.taskSevDot, { backgroundColor: color }] }),
      e(Text, { style: S.taskTitle }, task.message || ''),
      e(View, { style: [S.taskBadge, { backgroundColor: bg }] },
        e(Text, { style: { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: iColor } }, iLabel)
      )
    ),
    // Category
    cats && e(View, { style: S.taskMeta },
      e(Text, { style: S.taskCat }, cats)
    ),
    // Description
    task.description && e(Text, { style: S.taskDesc }, task.description),
    // Fix
    task.fix && e(View, { style: { marginBottom: 5 } },
      e(Text, { style: S.taskFixLbl }, 'How to fix'),
      e(Text, { style: S.taskFixTxt }, task.fix)
    ),
    // Actions
    actions.length > 0 && e(View, { style: { marginTop: 4 } },
      e(Text, { style: [S.taskFixLbl, { marginBottom: 4 }] }, 'Recommended actions'),
      ...actions.map((action, i) => {
        const text = typeof action === 'string' ? action : (action?.action || action?.text || String(action));
        return e(View, { key: i, style: S.taskActRow },
          e(Text, { style: S.taskActBullet }, '›'),
          e(Text, { style: S.taskActTxt }, text)
        );
      })
    )
  );
}

// ── Action Plan page ──────────────────────────────────────────────────────────
function ActionPlanPage({ report, pageSize }) {
  const tasks = buildPriorityTasks(report.issues || [], report.recommendations || []);
  if (tasks.length === 0) return null;

  return e(Page, { size: pageSize, style: S.page },
    e(Text, { style: S.sectionTitle }, 'Action Plan'),
    e(View, { style: S.sectionDiv }),
    e(Text, { style: { fontSize: 9, color: C.muted, marginBottom: 14 } },
      `${tasks.length} prioritized remediation task${tasks.length !== 1 ? 's' : ''} ranked by severity and impact`
    ),
    ...tasks.map((task, idx) =>
      e(TaskCard, { key: task._recFingerprint || task.fingerprintId || idx, task, idx })
    ),
    e(Footer)
  );
}

// ── Document ──────────────────────────────────────────────────────────────────
function ReportPDF({ report, size }) {
  const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();
  return e(Document,
    { title: `Cernly Report — ${domain}`, author: 'Cernly.ai', creator: 'Cernly', producer: 'Cernly / @react-pdf/renderer' },
    e(CoverPage,     { report, pageSize: size }),
    e(ActionPlanPage, { report, pageSize: size })
  );
}

// ── Fixture report ─────────────────────────────────────────────────────────────
const fixtureReport = {
  id: 9999,
  slug: 'fixture-preview-9999',
  url: 'https://www.example-healthcare-portal.org',
  userId: 'user_fixture_owner',
  paid: true,
  createdAt: new Date('2026-11-17T14:00:00Z').toISOString(),
  scores: { performance: 42, seo: 88, security: 71, accessibility: 58 },
  assessment: {
    headline: 'Critical performance and accessibility barriers are limiting reach',
    summary: 'Your site scores well on SEO and security fundamentals, but render-blocking resources and unoptimised images are causing significant load delays that hurt user retention and conversion. Fourteen accessibility violations are preventing users with assistive technologies from completing key workflows.',
    top_opportunity: {
      title: 'Eliminate render-blocking resources to cut page load by ~40%',
      rationale: 'Moving three synchronous scripts to deferred loading would shave approximately 2.4 seconds from the initial page render on mobile, improving both user experience and Core Web Vitals ranking signals.',
      recommendation_fingerprints: ['performance-render-blocking'],
    },
    next_steps: null,
  },
  aiSummary: null,
  issues: [
    // Ungrouped critical — no matching recommendation (exercises non-rec code path)
    { fingerprintId: 'ssl:weak-cipher', severity: 'critical', message: 'Weak cipher suites enabled (RC4, 3DES)', description: 'The server accepts connections using cipher suites considered cryptographically weak by modern standards.', fix: 'Disable RC4 and 3DES cipher suites in your server\'s TLS configuration.', area: 'Security', source: 'ssl', items: [] },
    // Covered by recs (will be deduplicated)
    { fingerprintId: 'lh:render-blocking',       severity: 'critical', message: 'Eliminate render-blocking resources', area: 'Performance', source: 'lh', items: [{ url: '/vendor/jquery.min.js', bytes: 87432 }, { url: '/js/app.bundle.js', bytes: 142800 }] },
    { fingerprintId: 'lh:uses-optimized-images', severity: 'critical', message: 'Serve images in next-gen formats',   area: 'Performance', source: 'lh', items: [{ url: '/images/hero-banner.jpg', bytes: 892000 }] },
    { fingerprintId: 'a11y:image-alt',           severity: 'critical', message: 'Image elements do not have alt attributes', area: 'Accessibility', source: 'a11y', items: [{ url: '/images/hero-banner.jpg' }] },
    { fingerprintId: 'lh:font-display',          severity: 'warning',  message: 'Ensure text remains visible during webfont load', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'a11y:color-contrast',      severity: 'warning',  message: 'Background and foreground colors do not have sufficient contrast ratio', area: 'Accessibility', source: 'a11y', items: [] },
    { fingerprintId: 'lh:unused-javascript',     severity: 'warning',  message: 'Remove unused JavaScript (potential savings: 148 KiB)', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'lh:largest-contentful-paint', severity: 'warning', message: 'Largest Contentful Paint — 4.8 s (target < 2.5 s)', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'a11y:aria-labels',         severity: 'warning',  message: 'Interactive elements must be accessible to assistive technology: 3 buttons missing accessible labels', area: 'Accessibility', source: 'a11y', items: [] },
  ],
  recommendations: [
    {
      fingerprint: 'performance-render-blocking', title: 'Eliminate render-blocking resources',
      category: 'Performance', priority: 'critical',
      what_we_found: 'Three synchronous scripts in the <head> are delaying the first meaningful paint by approximately 2.4 seconds on a mobile connection.',
      actions: ['Add defer or async attribute to non-critical <script> tags', 'Move scripts that manipulate DOM to end of <body>', 'Audit third-party tags — remove any no longer in use', 'Consider a tag manager to control script loading order'],
      supporting_findings: [
        { fingerprintId: 'lh:render-blocking', severity: 'critical', area: 'Performance', source: 'lh', items: [{ url: '/vendor/jquery.min.js', bytes: 87432 }], message: 'Eliminate render-blocking resources', description: 'Three synchronous scripts block first paint.' },
        { fingerprintId: 'lh:largest-contentful-paint', severity: 'warning', area: 'Performance', source: 'lh', items: [], message: 'LCP 4.8 s', description: 'Largest Contentful Paint exceeds recommended threshold.' },
      ],
      finding_fingerprints: ['lh:render-blocking', 'lh:largest-contentful-paint'],
    },
    {
      fingerprint: 'performance-image-optimization', title: 'Optimise images — convert to WebP/AVIF and compress',
      category: 'Performance', priority: 'critical',
      what_we_found: 'Hero and team images are served as unoptimised JPEG files totalling 1.4 MB. Converting to WebP would reduce transfer size by approximately 60%.',
      actions: ['Convert JPEG/PNG images to WebP using Squoosh or sharp', 'Set explicit width and height attributes to prevent layout shift', 'Add loading="lazy" to below-fold images', 'Use srcset for responsive image delivery'],
      supporting_findings: [
        { fingerprintId: 'lh:uses-optimized-images', severity: 'critical', area: 'Performance', source: 'lh', items: [{ url: '/images/hero-banner.jpg', bytes: 892000 }], message: 'Serve images in next-gen formats', description: 'Potential savings: ~855 KB' },
      ],
      finding_fingerprints: ['lh:uses-optimized-images'],
    },
    {
      // Multi-category: Accessibility + SEO (exercises multi-cat catText path)
      fingerprint: 'accessibility-missing-alt-text', title: 'Add alt text to all informative images — 11 images affected',
      category: 'Accessibility', priority: 'critical',
      what_we_found: '11 images across the site have no alt attribute, making them invisible to screen readers and failing WCAG 2.1 AA Success Criterion 1.1.1.',
      actions: ['Add descriptive alt text to all informative images', 'Use alt="" for purely decorative images', 'Avoid redundant phrases like "image of" or "photo of"', 'Review and update CMS media library alt text fields'],
      supporting_findings: [
        { fingerprintId: 'a11y:image-alt', severity: 'critical', area: 'Accessibility', source: 'a11y', items: [{ url: '/images/hero-banner.jpg' }], message: 'Images missing alt attributes', description: 'WCAG 2.1 AA 1.1.1 Non-text Content' },
        { fingerprintId: 'seo:image-alt-seo', severity: 'warning', area: 'SEO', source: 'seo', items: [], message: 'Missing image alt text affects SEO', description: 'Alt text contributes to image search indexing.' },
      ],
      finding_fingerprints: ['a11y:image-alt', 'seo:image-alt-seo'],
    },
    {
      fingerprint: 'performance-font-display', title: 'Prevent invisible text during web font loading',
      category: 'Performance', priority: 'high',
      what_we_found: 'Google Fonts are loaded without font-display: swap, causing the browser to show invisible text until the font downloads.',
      actions: ['Add &display=swap to the Google Fonts URL query string', 'Consider self-hosting fonts to eliminate the third-party DNS lookup'],
      supporting_findings: [
        { fingerprintId: 'lh:font-display', severity: 'warning', area: 'Performance', source: 'lh', items: [], message: 'Font display swap missing', description: 'Web fonts block text rendering.' },
      ],
      finding_fingerprints: ['lh:font-display'],
    },
    {
      fingerprint: 'performance-javascript-unused', title: 'Remove or defer unused JavaScript (148 KiB savings)',
      category: 'Performance', priority: 'high',
      what_we_found: '148 KiB of JavaScript is downloaded on every page load but never executed. This represents dead code from retired features.',
      actions: ['Run a coverage audit in Chrome DevTools to identify unused code', 'Enable tree shaking in your bundler configuration', 'Split large bundles with dynamic import() for route-level code splitting'],
      supporting_findings: [
        { fingerprintId: 'lh:unused-javascript', severity: 'warning', area: 'Performance', source: 'lh', items: [], message: 'Remove unused JavaScript', description: 'Potential savings: 148 KiB' },
      ],
      finding_fingerprints: ['lh:unused-javascript'],
    },
    {
      fingerprint: 'accessibility-color-contrast', title: 'Fix insufficient colour contrast on body text and UI controls',
      category: 'Accessibility', priority: 'medium',
      what_we_found: 'Several text/background colour combinations fail the WCAG 2.1 AA minimum contrast ratio of 4.5:1, including the primary body text colour (#6B7280 on white).',
      actions: ['Use the WebAIM Contrast Checker to verify colour pairs', 'Update body text colour from #6B7280 to #595F6B or darker', 'Review all UI states: hover, focus, disabled'],
      supporting_findings: [
        { fingerprintId: 'a11y:color-contrast', severity: 'warning', area: 'Accessibility', source: 'a11y', items: [], message: 'Colour contrast failures', description: 'WCAG 2.1 AA 1.4.3' },
      ],
      finding_fingerprints: ['a11y:color-contrast'],
    },
    {
      fingerprint: 'accessibility-aria-interactive', title: 'Add accessible labels to interactive controls — buttons and links without discernible text',
      category: 'Accessibility', priority: 'medium',
      what_we_found: 'Three icon buttons in the main navigation have no accessible label, making them unoperabale for screen reader users who cannot see the icons.',
      actions: ['Add aria-label="Menu" (or appropriate description) to icon-only buttons', 'Use visually-hidden span text as an alternative to aria-label', 'Verify with VoiceOver or NVDA that all controls are announced correctly'],
      supporting_findings: [
        { fingerprintId: 'a11y:aria-labels', severity: 'warning', area: 'Accessibility', source: 'a11y', items: [], message: 'Interactive elements missing accessible names', description: 'WCAG 2.1 AA 4.1.2' },
      ],
      finding_fingerprints: ['a11y:aria-labels'],
    },
  ],
};

// ── Additional edge-case fixtures ─────────────────────────────────────────────
const fixtureNoAssessment = {
  ...fixtureReport,
  url: 'https://www.no-assessment-example.com',
  assessment: null,
  aiSummary: 'Automated summary: performance is below average with significant optimisation opportunities.',
};

// ── Main render ───────────────────────────────────────────────────────────────
async function main() {
  const OUT_DIR = '/tmp/cernly-preview';
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cases = [
    { name: 'fixture-report',         report: fixtureReport,       size: 'LETTER', label: 'Main fixture (LETTER, full assessment)' },
    { name: 'fixture-report-a4',      report: fixtureReport,       size: 'A4',     label: 'Main fixture (A4)' },
    { name: 'fixture-no-assessment',  report: fixtureNoAssessment, size: 'LETTER', label: 'No assessment — fallback aiSummary string' },
  ];

  for (const { name, report, size, label } of cases) {
    console.log(`\n[render] ── ${label} ──`);
    console.log('[render] URL:', report.url);
    console.log('[render] Scores:', report.scores);
    console.log('[render] Assessment headline:', report.assessment?.headline ?? '(none)');
    console.log('[render] Recs:', report.recommendations.length, '| Issues:', report.issues.length);

    const tasks = buildPriorityTasks(report.issues, report.recommendations);
    console.log('[render] buildPriorityTasks →', tasks.length, 'tasks:');
    tasks.forEach((t, i) => {
      const impact = getImpact(t, i);
      const cats = Array.isArray(t._categories) ? t._categories.join(' + ') : t.area;
      console.log(`  [${i+1}] [${t.severity.toUpperCase()}] [${impact}] ${t.message.slice(0,60)} | cats: ${cats}`);
    });

    const resolvedSize = resolvePageSize(size.toLowerCase());

    try {
      const pdfBuffer = await renderToBuffer(
        e(ReportPDF, { report, size: resolvedSize })
      );
      const pdfPath = path.join(OUT_DIR, `${name}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      console.log(`[render] PDF → ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

      // Rasterise to PNG
      const pagePrefix = path.join(OUT_DIR, `${name}-page`);
      execSync(`pdftoppm -r 150 -png "${pdfPath}" "${pagePrefix}"`, { stdio: 'pipe' });
      const pngs = fs.readdirSync(OUT_DIR).filter(f => f.startsWith(`${name}-page`) && f.endsWith('.png')).sort();
      console.log(`[render] Pages: ${pngs.length} (${pngs.join(', ')})`);
    } catch (err) {
      console.error(`[render] FAILED for ${name}:`, err.message);
      console.error(err.stack?.split('\n').slice(0, 10).join('\n'));
    }
  }

  console.log('\n[render] Done. Files in', OUT_DIR);
  console.log('[render] PDFs:', fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.pdf')));
  console.log('[render] PNGs:', fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png')).length, 'total');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
