/**
 * PDF style tokens — shared across all PDF page components.
 * Imported by ReportPDF.js and each page component.
 */
import { StyleSheet } from '@react-pdf/renderer';

// ── Color palette ──────────────────────────────────────────────────────────────
export const COLORS = {
  teal:          '#00D4AA',
  purple:        '#A78BFA',
  ink:           '#151621',
  inkSub:        '#4B5168',
  muted:         '#83899C',
  mutedLight:    '#B8BFCC',
  border:        '#E9EAF2',
  borderStrong:  '#D0D5E2',
  pageBg:        '#FFFFFF',
  tileBg:        '#FAFAFF',
  summaryBg:     '#F5F3FF',
  summaryAccent: '#6D3FD0',
  scoreGood:     '#19B987',
  scoreWarn:     '#D97706',
  scoreBad:      '#DC3545',
  scoreMissing:  '#B0B4C8',
  strengthBg:    '#F0FDF9',
  strengthBorder:'#A7F3D0',
  concernBg:     '#FFF8F0',
  concernBorder: '#FDD8A5',
  oppBg:         '#FAFFFE',
  oppBorder:     '#00D4AA',
};

// ── Category accent map — four canonical categories ───────────────────────────
export const CAT_ACCENT = {
  Performance:   '#DC6B4A',
  SEO:           '#D97706',
  Accessibility: '#6D3FD0',
  Security:      '#19B987',
};

// ── Helper functions ───────────────────────────────────────────────────────────
export function scoreColor(s) {
  if (s == null) return COLORS.scoreMissing;
  if (s >= 80)   return COLORS.scoreGood;
  if (s >= 60)   return COLORS.scoreWarn;
  return COLORS.scoreBad;
}

export function scoreInterpretation(s) {
  if (s == null) return 'Not scored';
  if (s >= 90)   return 'Excellent';
  if (s >= 80)   return 'Good';
  if (s >= 60)   return 'Needs work';
  if (s >= 40)   return 'Poor';
  return 'Critical';
}

export function sevColor(sev) {
  return {
    critical: COLORS.scoreBad,
    warning:  COLORS.scoreWarn,
    good:     COLORS.scoreGood,
    info:     COLORS.muted,
  }[sev] ?? COLORS.muted;
}

export function sevLabel(sev) {
  return { critical: 'Critical', warning: 'Warning', good: 'Passed', info: 'Info' }[sev] ?? 'Info';
}

export function impactLabel(impact) {
  return { high: 'High impact', medium: 'Medium impact', low: 'Low impact' }[impact] ?? impact;
}

export function impactColor(impact) {
  return { high: COLORS.scoreBad, medium: COLORS.scoreWarn, low: COLORS.scoreGood }[impact] ?? COLORS.muted;
}

export function catAccent(cat) {
  return CAT_ACCENT[cat] ?? COLORS.purple;
}

// ── Shared stylesheet ─────────────────────────────────────────────────────────
export const S = StyleSheet.create({
  // ── Page base ──────────────────────────────────────────────────────────────
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: COLORS.ink,
    paddingTop: 44,
    paddingBottom: 52,
    paddingHorizontal: 48,
    backgroundColor: COLORS.pageBg,
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.75,
    borderTopColor: COLORS.border,
    paddingTop: 7,
  },
  footerText: {
    fontSize: 7.5,
    color: COLORS.mutedLight,
    letterSpacing: 0.1,
  },

  // ── Cover: brand header ────────────────────────────────────────────────────
  coverHeader: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  coverHeaderLeft: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.teal,
    marginRight: 5,
  },
  brandName: {
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  reportTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    color: COLORS.ink,
    lineHeight: 1.2,
    marginBottom: 10,
  },
  reportUrlBlock: {
    backgroundColor: COLORS.tileBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  reportUrl: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: COLORS.summaryAccent,
    letterSpacing: 0.1,
  },
  reportDate: {
    fontSize: 8.5,
    color: COLORS.muted,
  },

  // ── Score tiles ────────────────────────────────────────────────────────────
  scoresRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  scoreTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    backgroundColor: COLORS.tileBg,
  },
  scoreNum: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    lineHeight: 1.1,
    marginBottom: 2,
  },
  scoreCatLabel: {
    fontSize: 7,
    color: COLORS.muted,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  scoreInterpText: {
    fontSize: 7.5,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.1,
  },

  // ── Executive summary ──────────────────────────────────────────────────────
  summarySection: {
    marginBottom: 14,
  },
  coverSectionLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.summaryAccent,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    marginBottom: 5,
  },
  summaryHeadline: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  summaryText: {
    fontSize: 9.5,
    color: COLORS.inkSub,
    lineHeight: 1.7,
  },

  // ── Top opportunity ────────────────────────────────────────────────────────
  opportunityBox: {
    borderLeftWidth: 2.5,
    borderLeftColor: COLORS.teal,
    backgroundColor: COLORS.oppBg,
    borderRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  opportunityLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  opportunityTitle: {
    fontSize: 10.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  opportunityRationale: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.6,
  },

  // ── Strengths / Concerns two-column ───────────────────────────────────────
  strengthsConcernsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  strengthsCol: {
    flex: 1,
    backgroundColor: COLORS.strengthBg,
    borderWidth: 1,
    borderColor: COLORS.strengthBorder,
    borderRadius: 5,
    padding: 10,
  },
  concernsCol: {
    flex: 1,
    backgroundColor: COLORS.concernBg,
    borderWidth: 1,
    borderColor: COLORS.concernBorder,
    borderRadius: 5,
    padding: 10,
  },
  strengthLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.scoreGood,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  concernLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.scoreWarn,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  strengthItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
    gap: 5,
  },
  strengthBullet: {
    fontSize: 8,
    color: COLORS.scoreGood,
    marginTop: 1,
    flexShrink: 0,
  },
  concernBullet: {
    fontSize: 8,
    color: COLORS.scoreWarn,
    marginTop: 1,
    flexShrink: 0,
  },
  strengthItemText: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    lineHeight: 1.5,
    flex: 1,
  },

  // ── Action Plan: running header ────────────────────────────────────────────
  runningHeader: {
    position: 'absolute',
    top: 18,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.border,
    paddingBottom: 7,
  },
  runningHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  runningHeaderDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.teal,
  },
  runningHeaderText: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  runningHeaderUrl: {
    fontSize: 7.5,
    color: COLORS.muted,
  },

  // ── Action Plan: section header ────────────────────────────────────────────
  apSectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
    color: COLORS.ink,
    marginBottom: 3,
  },
  apSectionSub: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 10,
    lineHeight: 1.5,
  },
  apDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginBottom: 14,
  },

  // ── Action Plan: legend ────────────────────────────────────────────────────
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: COLORS.tileBg,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexWrap: 'wrap',
  },
  legendGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendGroupLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 7.5,
    color: COLORS.inkSub,
  },

  // ── Action Plan: editorial task item ──────────────────────────────────────
  taskItem: {
    marginBottom: 0,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  taskNumRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 5,
  },
  taskNum: {
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    color: COLORS.mutedLight,
    width: 16,
    flexShrink: 0,
    marginTop: 1,
  },
  taskTitleBlock: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    lineHeight: 1.4,
    marginBottom: 4,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  taskSevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskSevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  taskSevText: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
  },
  taskMetaDivider: {
    fontSize: 7.5,
    color: COLORS.mutedLight,
  },
  taskImpactText: {
    fontSize: 7.5,
    fontFamily: 'Inter-Medium',
  },
  taskCatText: {
    fontSize: 7.5,
    color: COLORS.muted,
    fontFamily: 'Inter-Medium',
  },
  taskBody: {
    paddingLeft: 26,
  },
  taskDescription: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.65,
    marginBottom: 7,
  },
  taskFixLabel: {
    fontSize: 8,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  taskFixText: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.6,
    marginBottom: 7,
  },
  taskActionsLabel: {
    fontSize: 8,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  taskActionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 7,
  },
  taskActionBullet: {
    fontSize: 8,
    color: COLORS.teal,
    marginTop: 2,
    flexShrink: 0,
    fontFamily: 'Inter-SemiBold',
  },
  taskActionText: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.55,
    flex: 1,
  },
  taskNoActions: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 5,
    lineHeight: 1.5,
  },

  // ── Findings: category section ────────────────────────────────────────────
  catSection: {
    marginTop: 16,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 3,
  },
  catHeaderName: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    color: COLORS.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  catHeaderScore: {
    fontSize: 9,
    color: COLORS.muted,
    fontFamily: 'Inter-Medium',
  },
  catHeaderMeta: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 6,
  },
  catDivider: {
    borderTopWidth: 1.5,
    borderTopColor: COLORS.border,
    marginBottom: 2,
  },

  // ── Findings: individual finding item ─────────────────────────────────────
  findingItem: {
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.border,
  },
  findingTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginBottom: 2,
  },
  findingSevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
    flexShrink: 0,
  },
  findingTitleBlock: {
    flex: 1,
  },
  findingTitle: {
    fontSize: 9.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    lineHeight: 1.4,
  },
  findingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  findingSevLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-Medium',
  },
  findingMetaDot: {
    fontSize: 7.5,
    color: COLORS.mutedLight,
  },
  findingRecRef: {
    fontSize: 7.5,
    color: COLORS.summaryAccent,
    fontFamily: 'Inter-Medium',
  },
  findingBody: {
    paddingLeft: 13,
    marginTop: 4,
  },
  findingDesc: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    lineHeight: 1.6,
    marginBottom: 5,
  },
  evidenceHeader: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    gap: 5,
  },
  evidenceBullet: {
    fontSize: 8,
    color: COLORS.teal,
    flexShrink: 0,
    marginTop: 1,
    fontFamily: 'Inter-SemiBold',
  },
  evidenceUrl: {
    fontSize: 8,
    color: COLORS.inkSub,
    flex: 1,
    lineHeight: 1.4,
  },
  evidenceSize: {
    fontSize: 7.5,
    color: COLORS.muted,
    flexShrink: 0,
    marginLeft: 4,
  },
  evidenceMore: {
    fontSize: 7.5,
    color: COLORS.muted,
    marginLeft: 13,
    marginTop: 1,
  },

  // ── Next Steps ────────────────────────────────────────────────────────────
  nsIntro: {
    fontSize: 9.5,
    color: COLORS.inkSub,
    lineHeight: 1.65,
    marginBottom: 16,
  },
  nsStep: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  nsStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.tileBg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  nsStepNumText: {
    fontSize: 8,
    fontFamily: 'Inter-Bold',
    color: COLORS.inkSub,
  },
  nsStepBody: {
    flex: 1,
  },
  nsStepTitle: {
    fontSize: 10.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  nsStepRationale: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    lineHeight: 1.6,
    marginBottom: 6,
  },
  nsStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 3,
  },
  nsStepBullet: {
    fontSize: 8,
    color: COLORS.teal,
    flexShrink: 0,
    marginTop: 1,
    fontFamily: 'Inter-SemiBold',
  },
  nsStepItemText: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    lineHeight: 1.5,
    flex: 1,
  },

  // ── Methodology ───────────────────────────────────────────────────────────
  methodBlock: {
    marginBottom: 12,
  },
  methodBlockLabel: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.summaryAccent,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  methodRow: {
    flexDirection: 'row',
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  methodLabel: {
    fontSize: 8.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    width: 90,
    flexShrink: 0,
  },
  methodValue: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    flex: 1,
    lineHeight: 1.5,
  },

  // Analyzer status table
  analyzerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  analyzerName: {
    fontSize: 8.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    width: 82,
    flexShrink: 0,
  },
  analyzerStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 76,
    flexShrink: 0,
  },
  analyzerStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  analyzerStatusText: {
    fontSize: 7.5,
    fontFamily: 'Inter-Medium',
  },
  analyzerDuration: {
    fontSize: 7.5,
    color: COLORS.muted,
    width: 40,
    flexShrink: 0,
  },
  analyzerDesc: {
    fontSize: 7.5,
    color: COLORS.inkSub,
    flex: 1,
    lineHeight: 1.5,
  },

  // Score/definition rows
  defRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 10,
  },
  defTerm: {
    fontSize: 8.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    width: 80,
    flexShrink: 0,
  },
  defDesc: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    flex: 1,
    lineHeight: 1.55,
  },

  // Limitations list
  limitationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
    gap: 7,
  },
  limitationBullet: {
    fontSize: 8,
    color: COLORS.muted,
    flexShrink: 0,
    marginTop: 1,
  },
  limitationText: {
    fontSize: 8.5,
    color: COLORS.inkSub,
    flex: 1,
    lineHeight: 1.55,
  },
});
