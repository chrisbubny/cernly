/**
 * scripts/render-pdf-fixture.cjs
 *
 * Renders a PDF from the fixture report using the production utilities
 * (buildPriorityTasks, getImpact, styles tokens, page-size) and
 * @react-pdf/renderer directly via React.createElement — no JSX compilation.
 *
 * Run from project root:
 *   node scripts/render-pdf-fixture.cjs
 *
 * Outputs:
 *   /tmp/cernly-preview/fixture-report.pdf
 *   /tmp/cernly-preview/fixture-report-page-NNN.png  (150 DPI)
 *   /tmp/cernly-preview/fixture-no-assessment.pdf
 *   /tmp/cernly-preview/fixture-no-assessment-page-NNN.png
 *
 * DATA NOTE: Constructed fixture — not production data. See inline comment.
 */

'use strict';

require('@swc/register')({
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'classic' } },
  },
  module: { type: 'commonjs' },
});

const path       = require('path');
const fs         = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const { buildPriorityTasks, getImpact } = require(path.join(ROOT, 'lib/priority-tasks.js'));
const { resolvePageSize }               = require(path.join(ROOT, 'app/api/report/[slug]/pdf/page-size.js'));

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

// ── Color tokens (mirrors styles.js) ─────────────────────────────────────────
const C = {
  teal:          '#00D4AA',
  ink:           '#151621',
  inkSub:        '#4B5168',
  muted:         '#83899C',
  mutedLight:    '#B8BFCC',
  border:        '#E9EAF2',
  borderStrong:  '#D0D5E2',
  pageBg:        '#FFFFFF',
  tileBg:        '#FAFAFF',
  summaryAccent: '#6D3FD0',
  scoreGood:     '#19B987',
  scoreWarn:     '#D97706',
  scoreBad:      '#DC3545',
  scoreMissing:  '#B0B4C8',
  strengthBg:    '#F0FDF9',
  strengthBorder:'#A7F3D0',
  concernBg:     '#FFF8F0',
  concernBorder: '#FDD8A5',
};

function scoreColor(s)        { return s == null ? C.scoreMissing : s >= 80 ? C.scoreGood : s >= 60 ? C.scoreWarn : C.scoreBad; }
function scoreInterp(s)       { return s == null ? 'Not scored' : s >= 90 ? 'Excellent' : s >= 80 ? 'Good' : s >= 60 ? 'Needs work' : s >= 40 ? 'Poor' : 'Critical'; }
function sevColor_(sev)       { return ({ critical: C.scoreBad, warning: C.scoreWarn, good: C.scoreGood, info: C.muted })[sev] ?? C.muted; }
function sevLabel_(sev)       { return ({ critical: 'Critical', warning: 'Warning', good: 'Passed', info: 'Info' })[sev] ?? 'Info'; }
function impactColor_(impact) { return ({ high: C.scoreBad, medium: C.scoreWarn, low: C.scoreGood })[impact] ?? C.muted; }
function impactLabel_(impact) { return ({ high: 'High impact', medium: 'Medium impact', low: 'Low impact' })[impact] ?? impact; }

const KNOWN_CATS = new Set(['Performance', 'SEO', 'Security', 'Accessibility']);
function catText(task) {
  const primary = task.area || 'Performance';
  if (Array.isArray(task._categories) && task._categories.length > 1) {
    const labels = task._categories.filter(c => KNOWN_CATS.has(c));
    return labels.length > 0 ? labels.join(' · ') : primary;
  }
  return KNOWN_CATS.has(primary) ? primary : 'Performance';
}

// ── StyleSheet ────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:              { fontFamily: 'Inter', fontSize: 10, color: C.ink, paddingTop: 44, paddingBottom: 52, paddingHorizontal: 48, backgroundColor: C.pageBg },
  pageAP:            { fontFamily: 'Inter', fontSize: 10, color: C.ink, paddingTop: 56, paddingBottom: 52, paddingHorizontal: 48, backgroundColor: C.pageBg },
  footer:            { position: 'absolute', bottom: 18, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.75, borderTopColor: C.border, paddingTop: 7 },
  footerText:        { fontSize: 7.5, color: C.mutedLight, letterSpacing: 0.1 },
  // Cover header
  coverHeader:       { marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  brandRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  brandDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: C.teal, marginRight: 5 },
  brandName:         { fontSize: 9, fontFamily: 'Inter-SemiBold', color: C.muted, letterSpacing: 1.2 },
  reportTitle:       { fontSize: 22, fontFamily: 'Inter-Bold', color: C.ink, lineHeight: 1.2, marginBottom: 10 },
  urlBlock:          { backgroundColor: C.tileBg, borderWidth: 1, borderColor: C.border, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start', marginBottom: 6 },
  urlText:           { fontSize: 11, fontFamily: 'Inter-Medium', color: C.summaryAccent, letterSpacing: 0.1 },
  reportDate:        { fontSize: 8.5, color: C.muted, marginBottom: 18 },
  // Score tiles
  scoresRow:         { flexDirection: 'row', gap: 8, marginBottom: 18 },
  scoreTile:         { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', backgroundColor: C.tileBg },
  scoreNum:          { fontSize: 28, fontFamily: 'Inter-Bold', lineHeight: 1.1, marginBottom: 2 },
  scoreCatLabel:     { fontSize: 7, color: C.muted, fontFamily: 'Inter-SemiBold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  scoreInterpText:   { fontSize: 7.5, fontFamily: 'Inter-Medium', letterSpacing: 0.1 },
  // Executive summary
  summarySection:    { marginBottom: 14 },
  sectionLabel:      { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.summaryAccent, textTransform: 'uppercase', letterSpacing: 1.0, marginBottom: 5 },
  summaryHeadline:   { fontSize: 13, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 6, lineHeight: 1.4 },
  summaryText:       { fontSize: 9.5, color: C.inkSub, lineHeight: 1.7 },
  // Top opportunity
  oppBox:            { borderLeftWidth: 2.5, borderLeftColor: C.teal, backgroundColor: '#FAFFFE', borderRadius: 5, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14 },
  oppLabel:          { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.teal, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  oppTitle:          { fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 4, lineHeight: 1.4 },
  oppRationale:      { fontSize: 9, color: C.inkSub, lineHeight: 1.6 },
  // Strengths/Concerns
  scRow:             { flexDirection: 'row', gap: 10, marginBottom: 10 },
  strengthsCol:      { flex: 1, backgroundColor: C.strengthBg, borderWidth: 1, borderColor: C.strengthBorder, borderRadius: 5, padding: 10 },
  concernsCol:       { flex: 1, backgroundColor: C.concernBg, borderWidth: 1, borderColor: C.concernBorder, borderRadius: 5, padding: 10 },
  strengthLabel:     { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.scoreGood, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  concernLabel:      { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.scoreWarn, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  bulletRow:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, gap: 5 },
  bulletText:        { fontSize: 8.5, color: C.inkSub, lineHeight: 1.5, flex: 1 },
  // Running header (action plan)
  runningHeader:     { position: 'absolute', top: 18, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 0.75, borderBottomColor: C.border, paddingBottom: 7 },
  rhLeft:            { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rhDot:             { width: 5, height: 5, borderRadius: 3, backgroundColor: C.teal },
  rhText:            { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  rhUrl:             { fontSize: 7.5, color: C.muted },
  // AP section
  apTitle:           { fontSize: 15, fontFamily: 'Inter-Bold', color: C.ink, marginBottom: 3 },
  apSub:             { fontSize: 9, color: C.muted, marginBottom: 10, lineHeight: 1.5 },
  apDivider:         { borderTopWidth: 1, borderTopColor: C.border, marginBottom: 14 },
  // Legend
  legendRow:         { flexDirection: 'row', gap: 16, marginBottom: 14, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: C.tileBg, borderRadius: 5, borderWidth: 1, borderColor: C.border, flexWrap: 'wrap' },
  legendGroup:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendGroupLabel:  { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.ink, textTransform: 'uppercase', letterSpacing: 0.6 },
  legendItem:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:         { width: 6, height: 6, borderRadius: 3 },
  legendText:        { fontSize: 7.5, color: C.inkSub },
  // Task item
  taskItem:          { marginBottom: 0, paddingBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  taskNumRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 5 },
  taskNum:           { fontSize: 9, fontFamily: 'Inter-Bold', color: C.mutedLight, width: 16, flexShrink: 0, marginTop: 1 },
  taskTitleBlock:    { flex: 1 },
  taskTitle:         { fontSize: 11, fontFamily: 'Inter-SemiBold', color: C.ink, lineHeight: 1.4, marginBottom: 4 },
  taskMetaRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  taskSevBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskSevDot:        { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  taskMetaDivider:   { fontSize: 7.5, color: C.mutedLight },
  taskBody:          { paddingLeft: 26 },
  taskDesc:          { fontSize: 9, color: C.inkSub, lineHeight: 1.65, marginBottom: 7 },
  taskFixLbl:        { fontSize: 8, fontFamily: 'Inter-SemiBold', color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  taskFixTxt:        { fontSize: 9, color: C.inkSub, lineHeight: 1.6, marginBottom: 7 },
  taskActLbl:        { fontSize: 8, fontFamily: 'Inter-SemiBold', color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  taskActRow:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 7 },
  taskActBullet:     { fontSize: 8, color: C.teal, marginTop: 2, flexShrink: 0, fontFamily: 'Inter-SemiBold' },
  taskActText:       { fontSize: 9, color: C.inkSub, lineHeight: 1.55, flex: 1 },
});

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer({ domain }) {
  return e(View, { style: S.footer, fixed: true },
    e(Text, { style: S.footerText }, `Website Assessment Report — ${domain}`),
    e(Text, { style: S.footerText,
      render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` })
  );
}

// ── Score tile ────────────────────────────────────────────────────────────────
function ScoreTile({ label, value }) {
  const color  = scoreColor(value);
  const interp = scoreInterp(value);
  return e(View, { style: S.scoreTile },
    e(Text, { style: [S.scoreNum, { color }] }, value != null ? String(value) : '—'),
    e(Text, { style: S.scoreCatLabel }, label.toUpperCase()),
    e(Text, { style: [S.scoreInterpText, { color }] }, interp)
  );
}

// ── Strengths/Concerns ────────────────────────────────────────────────────────
function strengthText(item) {
  if (typeof item === 'string') return item;
  if (item?.finding && item?.area) return `${item.area}: ${item.finding}`;
  return item?.finding || item?.text || String(item);
}
function concernText(item) {
  if (typeof item === 'string') return item;
  if (item?.finding && item?.area) return `${item.area}: ${item.finding}`;
  return item?.finding || item?.text || String(item);
}

// ── Cover page ────────────────────────────────────────────────────────────────
function CoverPage({ report, size }) {
  const { url, scores = {}, aiSummary, assessment, createdAt } = report;
  const domain  = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const headline  = assessment?.headline ?? null;
  const summary   = assessment?.summary  ?? null;
  const topOpp    = assessment?.top_opportunity ?? null;
  const strengths = (assessment?.strengths ?? []).slice(0, 4);
  const concerns  = (assessment?.concerns  ?? []).slice(0, 4);
  const summaryText = summary ?? aiSummary ?? null;
  const hasSC = strengths.length > 0 || concerns.length > 0;

  const SCORE_ENTRIES = [
    { key: 'performance',   label: 'Performance'   },
    { key: 'seo',           label: 'SEO'            },
    { key: 'security',      label: 'Security'       },
    { key: 'accessibility', label: 'Accessibility'  },
  ];

  return e(Page, { size, style: S.page },
    // Header
    e(View, { style: S.coverHeader },
      e(View, { style: S.brandRow },
        e(View, { style: S.brandDot }),
        e(Text, { style: S.brandName }, 'CERNLY')
      ),
      e(Text, { style: S.reportTitle }, `Website Assessment\nReport`)
    ),
    // URL block
    e(View, { style: S.urlBlock },
      e(Text, { style: S.urlText }, url)
    ),
    dateStr
      ? e(Text, { style: S.reportDate }, `Assessment generated ${dateStr}`)
      : e(View, { style: { marginBottom: 18 } }),
    // Score tiles
    e(View, { style: S.scoresRow },
      ...SCORE_ENTRIES.map(({ key, label }) =>
        e(ScoreTile, { key, label, value: scores[key] ?? null })
      )
    ),
    // Executive summary
    (headline || summaryText) && e(View, { style: S.summarySection },
      e(Text, { style: S.sectionLabel }, 'Executive Summary'),
      headline && e(Text, { style: S.summaryHeadline }, headline),
      summaryText && e(Text, { style: S.summaryText }, summaryText)
    ),
    // Top opportunity
    topOpp?.title && e(View, { style: S.oppBox },
      e(Text, { style: S.oppLabel }, 'Top Opportunity'),
      e(Text, { style: S.oppTitle }, topOpp.title),
      topOpp.rationale && e(Text, { style: S.oppRationale }, topOpp.rationale)
    ),
    // Strengths & Concerns
    hasSC && e(View, { style: S.scRow },
      strengths.length > 0 && e(View, { style: S.strengthsCol },
        e(Text, { style: S.strengthLabel }, 'Key Strengths'),
        ...strengths.map((item, i) =>
          e(View, { key: i, style: S.bulletRow },
            e(Text, { style: { fontSize: 8, color: C.scoreGood, marginTop: 1, flexShrink: 0 } }, '✓'),
            e(Text, { style: S.bulletText }, strengthText(item))
          )
        )
      ),
      concerns.length > 0 && e(View, { style: S.concernsCol },
        e(Text, { style: S.concernLabel }, 'Areas of Concern'),
        ...concerns.map((item, i) =>
          e(View, { key: i, style: S.bulletRow },
            e(Text, { style: { fontSize: 8, color: C.scoreWarn, marginTop: 1, flexShrink: 0 } }, '!'),
            e(Text, { style: S.bulletText }, concernText(item))
          )
        )
      )
    ),
    e(Footer, { domain })
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return e(View, { style: S.legendRow },
    e(View, { style: S.legendGroup },
      e(Text, { style: S.legendGroupLabel }, 'Severity'),
      e(View, { style: S.legendItem },
        e(View, { style: [S.legendDot, { backgroundColor: C.scoreBad }] }),
        e(Text, { style: S.legendText }, 'Critical — immediate action needed')
      ),
      e(View, { style: S.legendItem },
        e(View, { style: [S.legendDot, { backgroundColor: C.scoreWarn }] }),
        e(Text, { style: S.legendText }, 'Warning — should be addressed')
      )
    ),
    e(Text, { style: { fontSize: 7.5, color: C.mutedLight, alignSelf: 'center' } }, '|'),
    e(View, { style: S.legendGroup },
      e(Text, { style: S.legendGroupLabel }, 'Impact'),
      e(Text, { style: [S.legendText, { color: C.scoreBad }] }, 'High'),
      e(Text, { style: { fontSize: 7.5, color: C.mutedLight } }, '·'),
      e(Text, { style: [S.legendText, { color: C.scoreWarn }] }, 'Medium'),
      e(Text, { style: { fontSize: 7.5, color: C.mutedLight } }, '·'),
      e(Text, { style: [S.legendText, { color: C.scoreGood }] }, 'Low'),
      e(Text, { style: [S.legendText, { color: C.muted, marginLeft: 2 }] }, '— business value of fixing it')
    )
  );
}

// ── Running header ────────────────────────────────────────────────────────────
function RunningHeader({ domain }) {
  return e(View, { style: S.runningHeader, fixed: true },
    e(View, { style: S.rhLeft },
      e(View, { style: S.rhDot }),
      e(Text, { style: S.rhText }, 'Action Plan')
    ),
    e(Text, { style: S.rhUrl }, domain)
  );
}

// ── Task item ─────────────────────────────────────────────────────────────────
function TaskItem({ task, idx }) {
  const impact  = getImpact(task, idx);
  const cats    = catText(task);
  const sc      = sevColor_(task.severity);
  const sl      = sevLabel_(task.severity);
  const ic      = impactColor_(impact);
  const il      = impactLabel_(impact);
  const actions = Array.isArray(task._rec?.actions) ? task._rec.actions.slice(0, 4) : [];

  return e(View, { style: S.taskItem, wrap: false },
    e(View, { style: S.taskNumRow },
      e(Text, { style: S.taskNum }, String(idx + 1)),
      e(View, { style: S.taskTitleBlock },
        e(Text, { style: S.taskTitle }, task.message || ''),
        e(View, { style: S.taskMetaRow },
          e(View, { style: S.taskSevBadge },
            e(View, { style: [S.taskSevDot, { backgroundColor: sc }] }),
            e(Text, { style: { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: sc } }, sl)
          ),
          e(Text, { style: S.taskMetaDivider }, '·'),
          e(Text, { style: { fontSize: 7.5, fontFamily: 'Inter-Medium', color: ic } }, il),
          cats && e(Text, { style: S.taskMetaDivider }, '·'),
          cats && e(Text, { style: { fontSize: 7.5, color: C.muted, fontFamily: 'Inter-Medium' } }, cats)
        )
      )
    ),
    e(View, { style: S.taskBody },
      task.description && e(Text, { style: S.taskDesc }, task.description),
      task.fix && e(View, { style: { marginBottom: 7 } },
        e(Text, { style: S.taskFixLbl }, 'How to fix'),
        e(Text, { style: S.taskFixTxt }, task.fix)
      ),
      actions.length > 0 && e(View, null,
        e(Text, { style: S.taskActLbl }, 'Recommended actions'),
        ...actions.map((action, i) => {
          const text = typeof action === 'string' ? action : (action?.action || action?.text || String(action));
          return e(View, { key: i, style: S.taskActRow },
            e(Text, { style: S.taskActBullet }, '›'),
            e(Text, { style: S.taskActText }, text)
          );
        })
      )
    )
  );
}

// ── Action plan page ──────────────────────────────────────────────────────────
function ActionPlanPage({ report, size }) {
  const tasks = buildPriorityTasks(report.issues || [], report.recommendations || []);
  if (tasks.length === 0) return null;
  const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();

  return e(Page, { size, style: S.pageAP },
    e(RunningHeader, { domain }),
    e(Text, { style: S.apTitle }, 'Action Plan'),
    e(Text, { style: S.apSub },
      `${tasks.length} prioritized recommendation${tasks.length !== 1 ? 's' : ''}, ranked by severity then business impact`
    ),
    e(Legend),
    ...tasks.map((task, idx) =>
      e(TaskItem, { key: task._recFingerprint || task.fingerprintId || idx, task, idx })
    ),
    e(Footer, { domain })
  );
}

// ── Document ──────────────────────────────────────────────────────────────────
function ReportPDF({ report, size }) {
  const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();
  return e(Document,
    { title: `Website Assessment Report — ${domain}`, author: 'Cernly.ai', creator: 'Cernly', producer: 'Cernly / @react-pdf/renderer' },
    e(CoverPage,     { report, size }),
    e(ActionPlanPage, { report, size })
  );
}

// ── Fixture report ────────────────────────────────────────────────────────────
// CONSTRUCTED FIXTURE — not production data. See previous session for full notes.
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
  },
  aiSummary: null,
  issues: [
    { fingerprintId: 'ssl:weak-cipher',              severity: 'critical', message: 'Weak cipher suites enabled (RC4, 3DES)', description: 'The server accepts connections using cipher suites considered cryptographically weak by modern standards.', fix: 'Disable RC4 and 3DES cipher suites in your server\'s TLS configuration.', area: 'Security', source: 'ssl', items: [] },
    { fingerprintId: 'lh:render-blocking',           severity: 'critical', message: 'Eliminate render-blocking resources',    area: 'Performance', source: 'lh', items: [{ url: '/vendor/jquery.min.js', bytes: 87432 }, { url: '/js/app.bundle.js', bytes: 142800 }] },
    { fingerprintId: 'lh:uses-optimized-images',     severity: 'critical', message: 'Serve images in next-gen formats',       area: 'Performance', source: 'lh', items: [{ url: '/images/hero-banner.jpg', bytes: 892000 }] },
    { fingerprintId: 'a11y:image-alt',               severity: 'critical', message: 'Image elements do not have alt attributes', area: 'Accessibility', source: 'a11y', items: [] },
    { fingerprintId: 'lh:font-display',              severity: 'warning',  message: 'Ensure text remains visible during webfont load', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'a11y:color-contrast',          severity: 'warning',  message: 'Background and foreground colors do not have sufficient contrast ratio', area: 'Accessibility', source: 'a11y', items: [] },
    { fingerprintId: 'lh:unused-javascript',         severity: 'warning',  message: 'Remove unused JavaScript (potential savings: 148 KiB)', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'lh:largest-contentful-paint',  severity: 'warning',  message: 'Largest Contentful Paint — 4.8 s (target < 2.5 s)', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'a11y:aria-labels',             severity: 'warning',  message: 'Interactive elements must be accessible to assistive technology: 3 buttons missing accessible labels', area: 'Accessibility', source: 'a11y', items: [] },
  ],
  recommendations: [
    {
      fingerprint: 'performance-render-blocking', title: 'Eliminate render-blocking resources',
      category: 'Performance', priority: 'critical',
      what_we_found: 'Three synchronous scripts in the <head> are delaying the first meaningful paint by approximately 2.4 seconds on a mobile connection.',
      actions: ['Add defer or async attribute to non-critical <script> tags', 'Move scripts that manipulate DOM to end of <body>', 'Audit third-party tags — remove any no longer in use', 'Consider a tag manager to control script loading order'],
      supporting_findings: [{ fingerprintId: 'lh:render-blocking', severity: 'critical', area: 'Performance', source: 'lh', items: [], message: 'Render-blocking resources', description: 'Three synchronous scripts block first paint.' }, { fingerprintId: 'lh:largest-contentful-paint', severity: 'warning', area: 'Performance', source: 'lh', items: [], message: 'LCP 4.8 s', description: 'Largest Contentful Paint exceeds recommended threshold.' }],
      finding_fingerprints: ['lh:render-blocking', 'lh:largest-contentful-paint'],
    },
    {
      fingerprint: 'performance-image-optimization', title: 'Optimise images — convert to WebP/AVIF and compress',
      category: 'Performance', priority: 'critical',
      what_we_found: 'Hero and team images are served as unoptimised JPEG files totalling 1.4 MB. Converting to WebP would reduce transfer size by approximately 60%.',
      actions: ['Convert JPEG/PNG images to WebP using Squoosh or sharp', 'Set explicit width and height attributes to prevent layout shift', 'Add loading="lazy" to below-fold images', 'Use srcset for responsive image delivery'],
      supporting_findings: [{ fingerprintId: 'lh:uses-optimized-images', severity: 'critical', area: 'Performance', source: 'lh', items: [{ url: '/images/hero-banner.jpg', bytes: 892000 }], message: 'Serve images in next-gen formats', description: 'Potential savings: ~855 KB' }],
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
      supporting_findings: [{ fingerprintId: 'lh:font-display', severity: 'warning', area: 'Performance', source: 'lh', items: [], message: 'Font display swap missing', description: 'Web fonts block text rendering.' }],
      finding_fingerprints: ['lh:font-display'],
    },
    {
      fingerprint: 'performance-javascript-unused', title: 'Remove or defer unused JavaScript (148 KiB savings)',
      category: 'Performance', priority: 'high',
      what_we_found: '148 KiB of JavaScript is downloaded on every page load but never executed. This represents dead code from retired features.',
      actions: ['Run a coverage audit in Chrome DevTools to identify unused code', 'Enable tree shaking in your bundler configuration', 'Split large bundles with dynamic import() for route-level code splitting'],
      supporting_findings: [{ fingerprintId: 'lh:unused-javascript', severity: 'warning', area: 'Performance', source: 'lh', items: [], message: 'Remove unused JavaScript', description: 'Potential savings: 148 KiB' }],
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
  ],
};

const fixtureNoAssessment = {
  ...fixtureReport,
  url: 'https://www.no-assessment-example.com',
  assessment: null,
  aiSummary: 'Automated summary: performance is below average with significant optimisation opportunities across image delivery, JavaScript loading, and font rendering.',
};

// ── Main render ───────────────────────────────────────────────────────────────
async function main() {
  const OUT_DIR = '/tmp/cernly-preview';
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cases = [
    { name: 'fixture-report',        report: fixtureReport,       size: 'LETTER', label: 'Main fixture (LETTER, full assessment)' },
    { name: 'fixture-no-assessment', report: fixtureNoAssessment, size: 'LETTER', label: 'No-assessment fallback (aiSummary string)' },
  ];

  for (const { name, report, size, label } of cases) {
    console.log(`\n[render] ── ${label} ──`);
    console.log('[render] URL:', report.url);
    console.log('[render] Scores:', report.scores);
    console.log('[render] Assessment headline:', report.assessment?.headline ?? '(none)');

    const tasks = buildPriorityTasks(report.issues, report.recommendations);
    console.log('[render] Tasks:', tasks.length);
    tasks.forEach((t, i) => {
      const impact = getImpact(t, i);
      const cats   = Array.isArray(t._categories) ? t._categories.join(' + ') : t.area;
      console.log(`  [${i+1}] [${t.severity}] [${impact}] ${t.message.slice(0, 60)} | ${cats}`);
    });

    const resolvedSize = resolvePageSize(size.toLowerCase());
    try {
      const pdfBuffer = await renderToBuffer(e(ReportPDF, { report, size: resolvedSize }));
      const pdfPath   = path.join(OUT_DIR, `${name}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      console.log(`[render] PDF → ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

      const pagePrefix = path.join(OUT_DIR, `${name}-page`);
      execSync(`pdftoppm -r 150 -png "${pdfPath}" "${pagePrefix}"`, { stdio: 'pipe' });
      const pngs = fs.readdirSync(OUT_DIR).filter(f => f.startsWith(`${name}-page`) && f.endsWith('.png')).sort();
      console.log(`[render] Pages: ${pngs.length} (${pngs.join(', ')})`);
    } catch (err) {
      console.error(`[render] FAILED for ${name}:`, err.message);
      console.error(err.stack?.split('\n').slice(0, 15).join('\n'));
    }
  }

  console.log('\n[render] Done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
