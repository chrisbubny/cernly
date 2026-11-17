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

const { buildPriorityTasks, getImpact }     = require(path.join(ROOT, 'lib/priority-tasks.js'));
const { filterAssessmentForDisplay }        = require(path.join(ROOT, 'lib/assessment-filter.js'));
const { resolvePageSize }                   = require(path.join(ROOT, 'app/api/report/[slug]/pdf/page-size.js'));

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

const CAT_ACCENT = { Performance: '#DC6B4A', SEO: '#D97706', Accessibility: '#6D3FD0', Security: '#19B987' };
function catAccent_(cat) { return CAT_ACCENT[cat] ?? C.muted; }
function normalizeCat_(area) {
  if (!area) return null;
  const a = area.toLowerCase();
  if (a === 'performance') return 'Performance';
  if (a === 'seo') return 'SEO';
  if (a === 'security' || a === 'ssl') return 'Security';
  if (a === 'accessibility' || a === 'a11y') return 'Accessibility';
  return null;
}
function truncateUrl_(url, maxLen = 70) {
  if (!url || url.length <= maxLen) return url;
  return url.slice(0, 32) + '…' + url.slice(-(maxLen - 33));
}
function formatBytes_(bytes) {
  if (bytes == null) return null;
  if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(1)} MB`;
  if (bytes >= 1000)    return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

// ── Additional styles for findings / next steps / methodology ─────────────────
const S2 = StyleSheet.create({
  // Findings
  catSection:        { marginTop: 16 },
  catHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  catHeaderName:     { fontSize: 11, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  catHeaderScore:    { fontSize: 9, color: C.muted, fontFamily: 'Inter-Medium' },
  catHeaderMeta:     { fontSize: 8, color: C.muted, marginBottom: 6 },
  catDivider:        { borderTopWidth: 1.5, marginBottom: 2 },
  findingItem:       { paddingTop: 8, paddingBottom: 8, borderBottomWidth: 0.75, borderBottomColor: C.border },
  findingTopRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 2 },
  findingSevDot:     { width: 6, height: 6, borderRadius: 3, marginTop: 3, flexShrink: 0 },
  findingTitleBlock: { flex: 1 },
  findingTitle:      { fontSize: 9.5, fontFamily: 'Inter-SemiBold', color: C.ink, lineHeight: 1.4 },
  findingMetaRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' },
  findingRecRef:     { fontSize: 7.5, color: C.summaryAccent, fontFamily: 'Inter-Medium' },
  findingBody:       { paddingLeft: 13, marginTop: 4 },
  findingDesc:       { fontSize: 8.5, color: C.inkSub, lineHeight: 1.6, marginBottom: 5 },
  evidenceHeader:    { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  evidenceItem:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, gap: 5 },
  evidenceBullet:    { fontSize: 8, color: C.teal, flexShrink: 0, marginTop: 1, fontFamily: 'Inter-SemiBold' },
  evidenceUrl:       { fontSize: 8, color: C.inkSub, flex: 1, lineHeight: 1.4 },
  evidenceSize:      { fontSize: 7.5, color: C.muted, flexShrink: 0, marginLeft: 4 },
  evidenceMore:      { fontSize: 7.5, color: C.muted, marginLeft: 13, marginTop: 1 },
  findingMetaDot:    { fontSize: 7.5, color: C.mutedLight },
  findingSevLabel:   { fontSize: 7.5, fontFamily: 'Inter-Medium' },
  // Next Steps
  nsIntro:           { fontSize: 9.5, color: C.inkSub, lineHeight: 1.65, marginBottom: 16 },
  nsStep:            { flexDirection: 'row', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  nsStepNum:         { width: 20, height: 20, borderRadius: 10, backgroundColor: C.tileBg, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  nsStepNumText:     { fontSize: 8, fontFamily: 'Inter-Bold', color: C.inkSub },
  nsStepBody:        { flex: 1 },
  nsStepTitle:       { fontSize: 10.5, fontFamily: 'Inter-SemiBold', color: C.ink, marginBottom: 4, lineHeight: 1.4 },
  nsStepRationale:   { fontSize: 8.5, color: C.inkSub, lineHeight: 1.6, marginBottom: 6 },
  nsStepItem:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 },
  nsStepBullet:      { fontSize: 8, color: C.teal, flexShrink: 0, marginTop: 1, fontFamily: 'Inter-SemiBold' },
  nsStepItemText:    { fontSize: 8.5, color: C.inkSub, lineHeight: 1.5, flex: 1 },
  // Methodology
  methodBlock:       { marginBottom: 12 },
  methodBlockLabel:  { fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: C.summaryAccent, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  methodRow:         { flexDirection: 'row', marginBottom: 5, alignItems: 'flex-start' },
  methodLabel:       { fontSize: 8.5, fontFamily: 'Inter-SemiBold', color: C.ink, width: 90, flexShrink: 0 },
  methodValue:       { fontSize: 8.5, color: C.inkSub, flex: 1, lineHeight: 1.5 },
  analyzerRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 0.75, borderBottomColor: C.border, gap: 8 },
  analyzerName:      { fontSize: 8.5, fontFamily: 'Inter-SemiBold', color: C.ink, width: 82, flexShrink: 0 },
  analyzerStatus:    { flexDirection: 'row', alignItems: 'center', gap: 4, width: 76, flexShrink: 0 },
  analyzerStatusDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  analyzerStatusTxt: { fontSize: 7.5, fontFamily: 'Inter-Medium' },
  analyzerDuration:  { fontSize: 7.5, color: C.muted, width: 40, flexShrink: 0 },
  analyzerDesc:      { fontSize: 7.5, color: C.inkSub, flex: 1, lineHeight: 1.5 },
  defRow:            { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 10 },
  defTerm:           { fontSize: 8.5, fontFamily: 'Inter-SemiBold', color: C.ink, width: 80, flexShrink: 0 },
  defDesc:           { fontSize: 8.5, color: C.inkSub, flex: 1, lineHeight: 1.55 },
  limitationItem:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, gap: 7 },
  limitationBullet:  { fontSize: 8, color: C.muted, flexShrink: 0, marginTop: 1 },
  limitationText:    { fontSize: 8.5, color: C.inkSub, flex: 1, lineHeight: 1.55 },
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
  const {
    url, scores = {}, aiSummary, assessment: rawAssessment,
    analyzerStatuses = {}, recommendations = [], createdAt,
  } = report;
  const domain  = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Filter assessment content to remove claims from failed/unavailable analyzers
  const assessment = filterAssessmentForDisplay(rawAssessment, scores, analyzerStatuses, recommendations);

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
      actions.length > 0
        ? e(View, null,
            e(Text, { style: S.taskActLbl }, 'Recommended actions'),
            ...actions.map((action, i) => {
              const text = typeof action === 'string' ? action : (action?.action || action?.text || String(action));
              return e(View, { key: i, style: S.taskActRow },
                e(Text, { style: S.taskActBullet }, '›'),
                e(Text, { style: S.taskActText }, text)
              );
            })
          )
        : e(Text, { style: { fontSize: 8, color: C.muted, marginTop: 5, lineHeight: 1.5 } },
            'Refer to the Detailed Findings section for context. Consult your development team for a specific remediation plan for this issue.'
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

// ── Findings page ─────────────────────────────────────────────────────────────
function FindingsRunningHeader({ domain, label }) {
  return e(View, { style: S.runningHeader, fixed: true },
    e(View, { style: S.rhLeft },
      e(View, { style: S.rhDot }),
      e(Text, { style: S.rhText }, label || 'Detailed Findings')
    ),
    e(Text, { style: S.rhUrl }, domain)
  );
}

function EvidenceList_({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return e(View, { style: { marginBottom: 4 } },
    e(Text, { style: S2.evidenceHeader },
      `${items.length} affected resource${items.length !== 1 ? 's' : ''}`
    ),
    ...items.map((item, i) => {
      const url   = item?.url   || null;
      const label = item?.label || null;
      const bytes = item?.bytes != null ? formatBytes_(item.bytes) : null;
      const display = url ? truncateUrl_(url) : (label || null);
      if (!display) return null;
      return e(View, { key: i, style: S2.evidenceItem },
        e(Text, { style: S2.evidenceBullet }, '›'),
        e(Text, { style: S2.evidenceUrl }, display),
        bytes ? e(Text, { style: S2.evidenceSize }, `(${bytes})`) : null
      );
    })
  );
}

function FindingItem_({ finding, apRef }) {
  const sc = sevColor_(finding.severity);
  const sl = sevLabel_(finding.severity);
  const hasDesc  = !!finding.description;
  const hasItems = Array.isArray(finding.items) && finding.items.length > 0;
  return e(View, { style: S2.findingItem },
    // Title + description kept together — wrap:false prevents an orphaned header
    e(View, { wrap: false },
      e(View, { style: S2.findingTopRow },
        e(View, { style: [S2.findingSevDot, { backgroundColor: sc }] }),
        e(View, { style: S2.findingTitleBlock },
          e(Text, { style: S2.findingTitle }, finding.message || finding.title || '—'),
          e(View, { style: S2.findingMetaRow },
            e(Text, { style: [S2.findingSevLabel, { color: sc }] }, sl),
            apRef
              ? e(React.Fragment, null,
                  e(Text, { style: S2.findingMetaDot }, '·'),
                  e(Text, { style: S2.findingRecRef }, `Action Plan #${apRef}`)
                )
              : null
          )
        )
      ),
      hasDesc ? e(View, { style: S2.findingBody },
        e(Text, { style: S2.findingDesc }, finding.description)
      ) : null
    ),
    // Evidence items — free to paginate across pages
    hasItems
      ? e(View, { style: S2.findingBody },
          e(EvidenceList_, { items: finding.items })
        )
      : null
  );
}

function CategorySection_({ cat, score, findings, taskIndex, recCoverage }) {
  const accent   = catAccent_(cat);
  const sc       = scoreColor(score);
  const si       = scoreInterp(score);
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warning  = findings.filter(f => f.severity === 'warning').length;
  const info     = findings.filter(f => f.severity === 'info').length;
  const metaParts = [];
  if (critical > 0) metaParts.push(`${critical} critical`);
  if (warning  > 0) metaParts.push(`${warning} warning`);
  if (info     > 0) metaParts.push(`${info} info`);

  const getApRef = (finding) => {
    const fp    = finding.fingerprintId;
    const recFp = fp ? recCoverage.get(fp) : null;
    return recFp ? (taskIndex.get(recFp) ?? null) : null;
  };

  return e(View, { style: S2.catSection },
    // header + first finding — wrap=false to avoid orphaned header
    e(View, { wrap: false },
      e(View, { style: S2.catHeader },
        e(Text, { style: [S2.catHeaderName, { color: accent }] }, cat),
        score != null
          ? e(Text, { style: [S2.catHeaderScore, { color: sc }] }, `${score} — ${si}`)
          : e(Text, { style: [S2.catHeaderScore, { color: C.scoreMissing }] }, 'Score unavailable')
      ),
      e(View, { style: [S2.catDivider, { borderTopColor: accent, opacity: 0.4 }] }),
      metaParts.length > 0
        ? e(Text, { style: S2.catHeaderMeta },
            `${findings.length} finding${findings.length !== 1 ? 's' : ''} · ${metaParts.join(' · ')}`)
        : null,
      findings.length > 0
        ? e(FindingItem_, { finding: findings[0], apRef: getApRef(findings[0]) })
        : null
    ),
    ...findings.slice(1).map((finding, i) =>
      e(FindingItem_, { key: finding.fingerprintId || `${cat}-${i+1}`, finding, apRef: getApRef(finding) })
    )
  );
}

function FindingsPage({ report, size }) {
  const { issues = [], recommendations = [], scores = {}, url } = report;
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const tasks = buildPriorityTasks(issues, recommendations);
  const taskIndex = new Map();
  tasks.forEach((task, idx) => {
    if (task._recFingerprint) taskIndex.set(task._recFingerprint, idx + 1);
  });
  const recCoverage = new Map();
  for (const rec of recommendations) {
    for (const fp of rec.finding_fingerprints || []) recCoverage.set(fp, rec.fingerprint);
  }

  const CATS = ['Performance', 'SEO', 'Security', 'Accessibility'];
  const SEV_ORDER = { critical: 0, warning: 1, info: 2 };
  const grouped = {};
  for (const cat of CATS) grouped[cat] = [];
  for (const issue of issues) {
    if (issue.severity === 'good') continue;
    const cat = normalizeCat_(issue.area);
    if (cat) grouped[cat].push(issue);
  }
  for (const cat of CATS) {
    grouped[cat].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  }

  const activeCats  = CATS.filter(c => grouped[c].length > 0);
  const totalCount  = activeCats.reduce((n, c) => n + grouped[c].length, 0);
  if (totalCount === 0) return null;

  return e(Page, { size, style: S.pageAP },
    e(FindingsRunningHeader, { domain, label: 'Detailed Findings' }),
    e(Text, { style: S.apTitle }, 'Detailed Findings'),
    e(Text, { style: S.apSub },
      `${totalCount} finding${totalCount !== 1 ? 's' : ''} across ${activeCats.length} categor${activeCats.length !== 1 ? 'ies' : 'y'} · severity-ordered within each category`
    ),
    ...CATS.map(cat => {
      if (!grouped[cat].length) return null;
      return e(CategorySection_, { key: cat, cat, score: scores[cat.toLowerCase()] ?? null, findings: grouped[cat], taskIndex, recCoverage });
    }),
    e(Footer, { domain })
  );
}

// ── Next Steps page ───────────────────────────────────────────────────────────
function deriveNextSteps_(tasks) {
  const critical = tasks.filter(t => t.severity === 'critical');
  const warning  = tasks.filter(t => t.severity === 'warning');
  const info     = tasks.filter(t => t.severity === 'info');
  const steps = [];
  if (critical.length > 0) steps.push({
    title: `Resolve ${critical.length} critical issue${critical.length > 1 ? 's' : ''}`,
    rationale: 'Critical findings pose an immediate risk to performance, security, or user access. Address these before any other improvements.',
    items: critical.map(t => t.message || '—'),
  });
  const highWarnings = warning.slice(0, 4);
  if (highWarnings.length > 0) steps.push({
    title: 'Address high-priority warnings',
    rationale: 'These improvements offer meaningful gains in performance and accessibility with manageable implementation effort.',
    items: highWarnings.map(t => t.message || '—'),
  });
  const remaining = warning.slice(4);
  if (remaining.length > 0) steps.push({
    title: `Schedule remaining ${remaining.length} warning${remaining.length > 1 ? 's' : ''}`,
    rationale: 'Lower-priority issues to plan into a future sprint once critical and high-priority items are resolved.',
    items: remaining.map(t => t.message || '—'),
  });
  if (info.length > 0) steps.push({
    title: `Review ${info.length} informational finding${info.length > 1 ? 's' : ''}`,
    rationale: 'These do not require immediate action but represent opportunities for incremental improvement.',
    items: info.slice(0, 3).map(t => t.message || '—'),
  });
  steps.push({
    title: 'Rescan to verify improvements',
    rationale: 'Run a new Cernly scan after completing each phase of remediation to confirm fixes are effective and to track score improvements over time.',
    items: ['Submit the same URL to Cernly after each remediation phase'],
    isRescan: true,
  });
  return steps;
}

function NextStepsPage({ report, size }) {
  const { issues = [], recommendations = [], url } = report;
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const tasks  = buildPriorityTasks(issues, recommendations);
  if (tasks.length === 0) return null;
  const steps  = deriveNextSteps_(tasks);

  return e(Page, { size, style: S.pageAP },
    e(FindingsRunningHeader, { domain, label: 'Next Steps' }),
    e(Text, { style: S.apTitle }, 'Recommended Next Steps'),
    e(Text, { style: S2.nsIntro },
      'The following sequence is derived from the highest-priority findings in this report. ' +
      'Work through these phases in order — completing earlier phases first maximises the benefit of later improvements and avoids rework.'
    ),
    ...steps.map((step, i) =>
      e(View, { key: i, style: [S2.nsStep, step.isRescan ? { borderBottomWidth: 0 } : {}], wrap: false },
        e(View, { style: S2.nsStepNum },
          e(Text, { style: S2.nsStepNumText }, String(i + 1))
        ),
        e(View, { style: S2.nsStepBody },
          e(Text, { style: S2.nsStepTitle }, step.title),
          e(Text, { style: S2.nsStepRationale }, step.rationale),
          ...(step.items || []).map((item, j) =>
            e(View, { key: j, style: S2.nsStepItem },
              e(Text, { style: S2.nsStepBullet }, '›'),
              e(Text, { style: S2.nsStepItemText }, item)
            )
          )
        )
      )
    ),
    e(Footer, { domain })
  );
}

// ── Methodology page ──────────────────────────────────────────────────────────
const ANALYZER_CFG = [
  { key: 'lighthouse', scoreKey: 'performance', name: 'Performance', desc: 'Google PageSpeed Insights API (mobile), Core Web Vitals, resource loading, rendering performance' },
  { key: 'seo',        scoreKey: 'seo',         name: 'SEO',         desc: 'Meta tags, page title, headings, structured data, canonical URLs, crawlability' },
  { key: 'ssl',        scoreKey: 'security',    name: 'Security',    desc: 'TLS/SSL certificate validity, cipher strength, security response headers (CSP, HSTS)' },
  { key: 'a11y',       scoreKey: 'accessibility', name: 'Accessibility', desc: 'Automated WCAG 2.1 element-level checks (alt text, colour contrast, ARIA labels, form labels)' },
];

function MethodologyPage({ report, size }) {
  const { url, createdAt, id, analyzerStatuses = {}, scores = {} } = report;
  const domain  = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not recorded';

  function formatDur(ms) { if (!ms) return null; return ms >= 1000 ? `${(ms/1000).toFixed(1)} s` : `${ms} ms`; }

  function AnalyzerRow({ cfg }) {
    const info     = analyzerStatuses[cfg.key] ?? null;
    let status     = info?.status ?? null;
    const duration = info?.duration ? formatDur(info.duration) : null;
    if (!status) status = scores[cfg.scoreKey] != null ? 'completed' : 'unknown';
    const isOk     = status === 'completed';
    const isFail   = status === 'failed' || status === 'error';
    const sc       = isOk ? C.scoreGood : isFail ? C.scoreBad : C.muted;
    const sl       = isOk ? 'Completed' : isFail ? 'Failed' : status.charAt(0).toUpperCase() + status.slice(1);
    return e(View, { style: S2.analyzerRow },
      e(Text, { style: S2.analyzerName }, cfg.name),
      e(View, { style: S2.analyzerStatus },
        e(View, { style: [S2.analyzerStatusDot, { backgroundColor: sc }] }),
        e(Text, { style: [S2.analyzerStatusTxt, { color: sc }] }, sl)
      ),
      duration ? e(Text, { style: S2.analyzerDuration }, duration) : e(Text, { style: S2.analyzerDuration }),
      e(Text, { style: S2.analyzerDesc }, cfg.desc)
    );
  }

  const SCORE_DEFS = [
    { name: 'Performance', desc: 'Composite of Core Web Vitals (LCP, TBT, CLS), time-to-interactive, and resource efficiency. Scored by Google PageSpeed Insights on a mobile device simulation.' },
    { name: 'SEO',         desc: 'Checks for meta description, page title, heading structure, canonical tag, structured data, and crawl directives. Does not evaluate off-page factors such as backlinks.' },
    { name: 'Security',    desc: 'Evaluates TLS certificate validity, protocol version, cipher strength, and presence of key HTTP security headers. Not a substitute for a full security audit or penetration test.' },
    { name: 'Accessibility', desc: 'Automated WCAG 2.1 element-level checks. Automated tools detect approximately 30–40% of accessibility issues. This report does not constitute a WCAG compliance certification.' },
  ];

  const LIMITATIONS = [
    'This scan checked a single URL at one point in time. Dynamic content, authenticated pages, and other URLs on the same domain were not evaluated.',
    'Automated tools cannot detect all accessibility issues. This report does not constitute a WCAG compliance certification or legal accessibility assessment.',
    'The Security score reflects surface-level header and certificate checks only. This is not a comprehensive security audit, vulnerability assessment, or penetration test.',
    'Performance results are based on a simulated mobile network and device. Real-user performance varies by device, location, and network conditions.',
    'Some findings may not apply if content, server configuration, or third-party dependencies have changed since the scan was run.',
    "A finding's severity reflects technical risk, not necessarily the effort required to fix it. Consult your development team for accurate remediation estimates.",
  ];

  return e(Page, { size, style: S.pageAP },
    e(FindingsRunningHeader, { domain, label: 'Methodology' }),
    e(Text, { style: S.apTitle }, 'Methodology & Limitations'),
    e(Text, { style: [S.apSub, { marginBottom: 16 }] }, 'How this report was produced and what its findings do and do not establish.'),
    // Scan overview
    e(View, { style: S2.methodBlock },
      e(Text, { style: S2.methodBlockLabel }, 'Scan Overview'),
      e(View, { style: S2.methodRow }, e(Text, { style: S2.methodLabel }, 'URL'),       e(Text, { style: S2.methodValue }, url || '—')),
      e(View, { style: S2.methodRow }, e(Text, { style: S2.methodLabel }, 'Scan date'), e(Text, { style: S2.methodValue }, dateStr)),
      id ? e(View, { style: S2.methodRow }, e(Text, { style: S2.methodLabel }, 'Report ID'), e(Text, { style: S2.methodValue }, String(id))) : null
    ),
    // Analyzers
    e(View, { style: S2.methodBlock },
      e(Text, { style: S2.methodBlockLabel }, 'Analyzers'),
      ...ANALYZER_CFG.map(cfg => e(AnalyzerRow, { key: cfg.key, cfg }))
    ),
    // Score definitions
    e(View, { style: [S2.methodBlock], wrap: false },
      e(Text, { style: S2.methodBlockLabel }, 'What These Scores Represent'),
      ...SCORE_DEFS.map(def =>
        e(View, { key: def.name, style: S2.defRow },
          e(Text, { style: S2.defTerm }, def.name),
          e(Text, { style: S2.defDesc  }, def.desc)
        )
      )
    ),
    // Severity vs Impact
    e(View, { style: [S2.methodBlock], wrap: false },
      e(Text, { style: S2.methodBlockLabel }, 'Severity vs. Impact'),
      e(View, { style: S2.defRow },
        e(Text, { style: S2.defTerm }, 'Severity'),
        e(Text, { style: S2.defDesc  }, 'How serious the technical problem is. Critical means the issue is broken or causes direct harm; Warning means it is suboptimal but functioning; Info means it is worth noting but minor.')
      ),
      e(View, { style: S2.defRow },
        e(Text, { style: S2.defTerm }, 'Impact'),
        e(Text, { style: S2.defDesc  }, 'The estimated business and user value of fixing this issue. Impact is independent of severity — an info-level finding may still have high business impact if it affects a key user journey.')
      )
    ),
    // Limitations
    e(View, { style: S2.methodBlock },
      e(Text, { style: S2.methodBlockLabel }, 'Important Limitations'),
      ...LIMITATIONS.map((text, i) =>
        e(View, { key: i, style: S2.limitationItem },
          e(Text, { style: S2.limitationBullet }, '–'),
          e(Text, { style: S2.limitationText }, text)
        )
      )
    ),
    e(Footer, { domain })
  );
}

// ── Document ──────────────────────────────────────────────────────────────────
function ReportPDF({ report, size }) {
  const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();
  return e(Document,
    { title: `Website Assessment Report — ${domain}`, author: 'Cernly.ai', creator: 'Cernly', producer: 'Cernly / @react-pdf/renderer' },
    e(CoverPage,       { report, size }),
    e(ActionPlanPage,  { report, size }),
    e(FindingsPage,    { report, size }),
    e(NextStepsPage,   { report, size }),
    e(MethodologyPage, { report, size })
  );
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
  analyzerStatuses: {
    lighthouse: { status: 'completed', duration: 12400 },
    seo:        { status: 'completed', duration: 3200  },
    ssl:        { status: 'completed', duration: 890   },
    a11y:       { status: 'completed', duration: 4100  },
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
  },
  aiSummary: null,
  issues: [
    // ── Performance: 10 findings ──────────────────────────────────────────
    { fingerprintId: 'lh:render-blocking',          severity: 'critical', area: 'Performance', source: 'lh',
      message: 'Eliminate render-blocking resources',
      description: 'Three synchronous scripts in the <head> are delaying the first meaningful paint by approximately 2.4 seconds on a mobile connection.',
      items: [{ url: '/vendor/jquery.min.js', bytes: 87432 }, { url: '/js/app.bundle.js', bytes: 142800 }, { url: '/vendor/analytics-bundle.js', bytes: 54200 }] },
    { fingerprintId: 'lh:uses-optimized-images',    severity: 'critical', area: 'Performance', source: 'lh',
      message: 'Serve images in next-gen formats',
      description: 'Hero and team images are served as unoptimised JPEG files. Converting to WebP would reduce transfer size by approximately 60%.',
      items: [{ url: '/images/hero-banner.jpg', bytes: 892000 }, { url: '/images/team-photo.jpg', bytes: 540000 }, { url: '/images/services-bg.jpg', bytes: 328000 }, { url: '/images/testimonial-1.jpg', bytes: 214000 }, { url: '/images/testimonial-2.jpg', bytes: 198000 }, { url: '/images/testimonial-3.jpg', bytes: 176000 }] },
    { fingerprintId: 'lh:font-display',             severity: 'warning',  area: 'Performance', source: 'lh',
      message: 'Ensure text remains visible during webfont load',
      description: 'Google Fonts are loaded without font-display: swap, causing the browser to show invisible text until the font downloads.',
      items: [] },
    { fingerprintId: 'lh:unused-javascript',        severity: 'warning',  area: 'Performance', source: 'lh',
      message: 'Remove unused JavaScript — potential savings: 148 KiB',
      description: '148 KiB of JavaScript is downloaded on every page load but never executed. This represents dead code from retired features.',
      items: [{ url: '/js/app.bundle.js', bytes: 97000, label: 'app.bundle.js — 97 KiB unused' }, { url: '/vendor/legacy-polyfills.js', bytes: 51000, label: 'legacy-polyfills.js — 51 KiB unused' }] },
    { fingerprintId: 'lh:largest-contentful-paint', severity: 'warning',  area: 'Performance', source: 'lh',
      message: 'Largest Contentful Paint — 4.8 s (target < 2.5 s)',
      description: 'The LCP element is the hero banner image at /images/hero-banner.jpg. It is not preloaded and must wait for render-blocking scripts to complete before it begins loading.',
      items: [] },
    { fingerprintId: 'lh:total-blocking-time',      severity: 'warning',  area: 'Performance', source: 'lh',
      message: 'Reduce Total Blocking Time — 1,240 ms (target < 200 ms)',
      description: 'The main thread is blocked for over 1.2 seconds during page load, primarily by long-running JavaScript tasks from the analytics bundle and app initialisation.',
      items: [] },
    { fingerprintId: 'lh:cumulative-layout-shift',  severity: 'warning',  area: 'Performance', source: 'lh',
      message: 'Avoid large layout shifts — CLS: 0.28 (target < 0.1)',
      description: 'Images without explicit width/height attributes cause visible layout shifts as they load. The hero image is the primary contributor (CLS contribution: 0.19).',
      items: [{ url: '/images/hero-banner.jpg', label: 'No width/height set, CLS 0.19' }, { url: '/images/team-photo.jpg', label: 'No width/height set, CLS 0.09' }] },
    { fingerprintId: 'lh:uses-long-cache-ttl',      severity: 'info',     area: 'Performance', source: 'lh',
      message: 'Serve static assets with an efficient cache policy — 14 resources found',
      description: 'Many static assets have no cache-control header or a very short TTL, forcing the browser to re-download unchanged files on every visit.',
      items: [{ url: '/css/main.css', label: 'Cache-Control: max-age=300 (5 min)' }, { url: '/js/app.bundle.js', label: 'Cache-Control: no-cache' }, { url: '/images/logo.svg', label: 'No Cache-Control header' }] },
    { fingerprintId: 'lh:efficient-animated-content', severity: 'info',   area: 'Performance', source: 'lh',
      message: 'Use video formats for animated content',
      description: 'Two animated GIF files are used for feature demonstrations. Converting to MP4 or WebM would reduce their combined size from 3.4 MB to approximately 0.6 MB.',
      items: [{ url: '/images/demo-recording.gif', bytes: 2200000 }, { url: '/images/feature-tour.gif', bytes: 1200000 }] },
    { fingerprintId: 'lh:preconnect',               severity: 'info',     area: 'Performance', source: 'lh',
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
      items: [
        { url: '/images/hero-banner.jpg', label: 'hero-banner.jpg — missing alt' },
        { url: '/images/services-bg.jpg', label: 'services-bg.jpg — missing alt' },
        { url: '/images/team-photo.jpg',  label: 'team-photo.jpg — missing alt' },
        { url: '/images/testimonial-1.jpg', label: 'testimonial-1.jpg — missing alt' },
        { url: '/images/testimonial-2.jpg', label: 'testimonial-2.jpg — missing alt' },
        { url: '/images/testimonial-3.jpg', label: 'testimonial-3.jpg — missing alt' },
        { label: '5 more images also missing alt text' },
      ] },
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
  assessment: null,
  aiSummary: 'Automated summary: performance is below average with significant optimisation opportunities across image delivery, JavaScript loading, and font rendering.',
};

// Failed Lighthouse analyzer — performance score null, no Lighthouse issues
const fixtureFailedLighthouse = {
  ...fixtureReport,
  url: 'https://www.failed-analyzer-example.com',
  scores: { performance: null, seo: 88, security: 71, accessibility: 58 },
  analyzerStatuses: {
    lighthouse: { status: 'failed', error: 'Request timeout after 45 s' },
    seo:        { status: 'completed', duration: 3200 },
    ssl:        { status: 'completed', duration: 890  },
    a11y:       { status: 'completed', duration: 4100 },
  },
  issues: fixtureReport.issues.filter(i => i.source !== 'lh'),
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
  },
};

// A4 variant of the main fixture
const fixtureA4 = { ...fixtureReport, url: 'https://www.example-healthcare-portal.org' };

// ── Main render ───────────────────────────────────────────────────────────────
async function main() {
  const OUT_DIR = '/tmp/cernly-preview';
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cases = [
    { name: 'fixture-report',          report: fixtureReport,          size: 'LETTER', label: 'Main fixture (LETTER, full assessment, 31 findings)' },
    { name: 'fixture-report-a4',       report: fixtureA4,              size: 'A4',     label: 'Main fixture (A4)' },
    { name: 'fixture-no-assessment',   report: fixtureNoAssessment,    size: 'LETTER', label: 'No-assessment fallback (aiSummary string)' },
    { name: 'fixture-failed-analyzer', report: fixtureFailedLighthouse,size: 'LETTER', label: 'Failed Lighthouse analyzer (Performance null)' },
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
