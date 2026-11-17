/**
 * PDF Cover Page (Page 1) — Executive Assessment
 *
 * Contains:
 *   - Cernly brand header with document title, prominent URL, and date
 *   - Four canonical score tiles with score interpretations
 *   - Executive Summary (headline + summary text)
 *   - Top Opportunity callout
 *   - Key Strengths and Areas of Concern (from assessment.strengths[] / .concerns[])
 *   - Graceful fallback to aiSummary string when no structured assessment
 *   - All sections are null-safe; missing data is omitted cleanly
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import {
  S,
  COLORS,
  scoreColor,
  scoreInterpretation,
} from './styles.js';
import { filterAssessmentForDisplay } from '../../../../../../lib/assessment-filter.js';

/** Four canonical score categories — matches CLAUDE.md specification */
const SCORE_ENTRIES = [
  { key: 'performance',   label: 'Performance'   },
  { key: 'seo',           label: 'SEO'            },
  { key: 'security',      label: 'Security'       },
  { key: 'accessibility', label: 'Accessibility'  },
];

function ScoreTile({ label, value }) {
  const color  = scoreColor(value);
  const interp = scoreInterpretation(value);
  return (
    <View style={S.scoreTile}>
      <Text style={[S.scoreNum, { color }]}>
        {value != null ? String(value) : '—'}
      </Text>
      <Text style={S.scoreCatLabel}>{label.toUpperCase()}</Text>
      <Text style={[S.scoreInterpText, { color }]}>{interp}</Text>
    </View>
  );
}

/** Renders up to `limit` items from an array with a colored bullet. */
function BulletList({ items, bulletStyle, textStyle, limit = 3 }) {
  const visible = (items || []).slice(0, limit);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((item, i) => {
        const text = typeof item === 'string'
          ? item
          : (item?.finding || item?.area && item?.finding
              ? `${item.area}: ${item.finding}`
              : item?.finding || item?.text || String(item));
        return (
          <View key={i} style={S.strengthItem}>
            <Text style={bulletStyle}>✓</Text>
            <Text style={S.strengthItemText}>{text}</Text>
          </View>
        );
      })}
    </>
  );
}

function ConcernList({ items, limit = 3 }) {
  const visible = (items || []).slice(0, limit);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((item, i) => {
        const text = typeof item === 'string'
          ? item
          : (item?.finding
              ? (item.area ? `${item.area}: ${item.finding}` : item.finding)
              : item?.text || String(item));
        return (
          <View key={i} style={S.strengthItem}>
            <Text style={S.concernBullet}>!</Text>
            <Text style={S.strengthItemText}>{text}</Text>
          </View>
        );
      })}
    </>
  );
}

export default function CoverPage({ report, pageSize }) {
  const {
    url,
    scores = {},
    aiSummary,
    assessment: rawAssessment,
    analyzerStatuses = {},
    recommendations  = [],
    createdAt,
  } = report;

  const domain = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Filter assessment content to remove claims from failed/unavailable analyzers
  // before surfacing them on the cover page. Never modifies the stored report.
  const assessment = filterAssessmentForDisplay(
    rawAssessment, scores, analyzerStatuses, recommendations,
  );

  // Structured assessment fields (null-safe)
  const headline   = assessment?.headline ?? null;
  const summary    = assessment?.summary  ?? null;
  const topOpp     = assessment?.top_opportunity ?? null;
  const strengths  = assessment?.strengths ?? [];
  const concerns   = assessment?.concerns  ?? [];

  // Fallback to flat aiSummary when no structured assessment
  const summaryText = summary ?? aiSummary ?? null;

  const hasStrengthsConcerns = strengths.length > 0 || concerns.length > 0;

  return (
    <Page size={pageSize} style={S.page}>

      {/* ── Brand header ── */}
      <View style={S.coverHeader}>
        <View style={S.coverHeaderLeft}>
          <View style={S.brandRow}>
            <View style={S.brandDot} />
            <Text style={S.brandName}>Cernly</Text>
          </View>
          <Text style={S.reportTitle}>Website Assessment{'\n'}Report</Text>
        </View>
      </View>

      {/* ── Assessed URL ── */}
      <View style={S.reportUrlBlock}>
        <Text style={S.reportUrl}>{url}</Text>
      </View>
      {dateStr ? (
        <Text style={[S.reportDate, { marginBottom: 18 }]}>Assessment generated {dateStr}</Text>
      ) : (
        <View style={{ marginBottom: 18 }} />
      )}

      {/* ── Score tiles ── */}
      <View style={S.scoresRow}>
        {SCORE_ENTRIES.map(({ key, label }) => (
          <ScoreTile key={key} label={label} value={scores[key] ?? null} />
        ))}
      </View>

      {/* ── Executive summary ── */}
      {(headline || summaryText) ? (
        <View style={S.summarySection}>
          <Text style={S.coverSectionLabel}>Executive Summary</Text>
          {headline ? (
            <Text style={S.summaryHeadline}>{headline}</Text>
          ) : null}
          {summaryText ? (
            <Text style={S.summaryText}>{summaryText}</Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Top opportunity ── */}
      {topOpp?.title ? (
        <View style={S.opportunityBox}>
          <Text style={S.opportunityLabel}>Top Opportunity</Text>
          <Text style={S.opportunityTitle}>{topOpp.title}</Text>
          {topOpp.rationale ? (
            <Text style={S.opportunityRationale}>{topOpp.rationale}</Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Key Strengths & Areas of Concern ── */}
      {hasStrengthsConcerns ? (
        <View style={S.strengthsConcernsRow}>
          {strengths.length > 0 ? (
            <View style={S.strengthsCol}>
              <Text style={S.strengthLabel}>Key Strengths</Text>
              <BulletList items={strengths} bulletStyle={S.strengthBullet} limit={4} />
            </View>
          ) : null}
          {concerns.length > 0 ? (
            <View style={S.concernsCol}>
              <Text style={S.concernLabel}>Areas of Concern</Text>
              <ConcernList items={concerns} limit={4} />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Page footer ── */}
      <View style={S.footer} fixed>
        <Text style={S.footerText}>Website Assessment Report — {domain}</Text>
        <Text
          style={S.footerText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  );
}
