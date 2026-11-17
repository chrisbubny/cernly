/**
 * PDF style tokens — shared across all PDF page components.
 * Imported by ReportPDF.js and each page component.
 */
import { StyleSheet } from '@react-pdf/renderer';

// ── Color palette ──────────────────────────────────────────────────────────────
export const COLORS = {
  teal:        '#00D4AA',
  purple:      '#A78BFA',
  ink:         '#151621',
  inkSub:      '#4B5168',
  muted:       '#83899C',
  border:      '#E9EAF2',
  pageBg:      '#FFFFFF',
  tileBg:      '#FAFAFF',
  summaryBg:   '#F7F4FF',
  summaryAccent: '#7948F6',
  scoreGood:   '#19B987',
  scoreWarn:   '#EFA642',
  scoreBad:    '#EF6473',
  scoreMissing:'#B0B4C8',
  sevCritBg:   '#FFF0F2',
  sevWarnBg:   '#FFF8ED',
  sevGoodBg:   '#EDF9F4',
  sevInfoBg:   '#F4F5FB',
};

// ── Category accent map — four canonical categories ───────────────────────────
export const CAT_ACCENT = {
  Performance:   '#EF6473',
  SEO:           '#EFA642',
  Accessibility: '#7948F6',
  Security:      '#19B987',
};

// ── Helper functions ───────────────────────────────────────────────────────────
export function scoreColor(s) {
  if (s == null) return COLORS.scoreMissing;
  if (s >= 80)   return COLORS.scoreGood;
  if (s >= 60)   return COLORS.scoreWarn;
  return COLORS.scoreBad;
}

export function sevColor(sev) {
  return { critical: COLORS.scoreBad, warning: COLORS.scoreWarn, good: COLORS.scoreGood, info: COLORS.scoreMissing }[sev] ?? COLORS.scoreMissing;
}

export function sevBg(sev) {
  return { critical: COLORS.sevCritBg, warning: COLORS.sevWarnBg, good: COLORS.sevGoodBg, info: COLORS.sevInfoBg }[sev] ?? COLORS.sevInfoBg;
}

export function sevLabel(sev) {
  return { critical: 'Critical', warning: 'Warning', good: 'Passed', info: 'Info' }[sev] ?? 'Info';
}

export function impactLabel(impact) {
  return { high: 'High Impact', medium: 'Medium Impact', low: 'Low Impact' }[impact] ?? impact;
}

export function impactColor(impact) {
  return { high: COLORS.scoreBad, medium: COLORS.scoreWarn, low: COLORS.scoreGood }[impact] ?? COLORS.muted;
}

export function catAccent(cat) {
  return CAT_ACCENT[cat] ?? COLORS.purple;
}

// ── Shared stylesheet ─────────────────────────────────────────────────────────
export const S = StyleSheet.create({
  // Page base
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: COLORS.ink,
    paddingTop: 44,
    paddingBottom: 52,
    paddingHorizontal: 44,
    backgroundColor: COLORS.pageBg,
  },

  // Footer (fixed — appears on every page)
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 7,
  },
  footerText: {
    fontSize: 8,
    color: COLORS.muted,
  },

  // Header (cover page)
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.teal,
    marginRight: 5,
  },
  brandName: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    letterSpacing: 0.4,
  },
  reportTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: COLORS.ink,
    marginBottom: 4,
  },
  reportUrl: {
    fontSize: 11,
    color: COLORS.summaryAccent,
  },
  reportDate: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 3,
  },

  // Scores row
  scoresRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  scoreTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    backgroundColor: COLORS.tileBg,
  },
  scoreNum: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    lineHeight: 1.1,
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 7.5,
    color: COLORS.muted,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Section header
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    marginBottom: 8,
    marginTop: 18,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 3,
    marginBottom: 14,
  },

  // AI summary box
  summaryBox: {
    backgroundColor: COLORS.summaryBg,
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
  },
  summaryLabel: {
    fontSize: 8.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.summaryAccent,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
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
    fontSize: 10,
    color: COLORS.inkSub,
    lineHeight: 1.65,
  },

  // Top opportunity box
  opportunityBox: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.teal,
    backgroundColor: '#F0FDF9',
    borderRadius: 6,
    padding: 12,
    marginBottom: 18,
  },
  opportunityLabel: {
    fontSize: 8,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  opportunityTitle: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    marginBottom: 4,
  },
  opportunityRationale: {
    fontSize: 9.5,
    color: COLORS.inkSub,
    lineHeight: 1.55,
  },

  // Action plan task card
  taskCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.pageBg,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  taskSevDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
    flexShrink: 0,
  },
  taskTitle: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    lineHeight: 1.4,
  },
  taskImpactBadge: {
    fontSize: 7.5,
    fontFamily: 'Inter-SemiBold',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    flexShrink: 0,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  taskCatPill: {
    fontSize: 7.5,
    fontFamily: 'Inter-Medium',
    color: COLORS.muted,
    marginRight: 4,
  },
  taskDescription: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.6,
    marginBottom: 5,
  },
  taskFixLabel: {
    fontSize: 8.5,
    fontFamily: 'Inter-SemiBold',
    color: COLORS.ink,
    marginBottom: 3,
  },
  taskFixText: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.55,
  },
  taskActionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
    gap: 5,
  },
  taskActionBullet: {
    fontSize: 9,
    color: COLORS.teal,
    marginTop: 1,
    flexShrink: 0,
  },
  taskActionText: {
    fontSize: 9,
    color: COLORS.inkSub,
    lineHeight: 1.5,
    flex: 1,
  },
});
