/**
 * PDF Cover Page (Page 1)
 *
 * Contains:
 *   - Cernly brand header with scan URL and date
 *   - Four canonical score tiles: Performance / SEO / Security / Accessibility
 *   - AI executive summary (headline + summary text) when assessment is available
 *   - Top opportunity callout when assessment provides one
 *   - Graceful fallback to aiSummary string when no structured assessment
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import {
  S,
  COLORS,
  scoreColor,
  catAccent,
} from './styles.js';

/** Four canonical score categories — matches CLAUDE.md specification */
const SCORE_ENTRIES = [
  { key: 'performance',   label: 'Performance'   },
  { key: 'seo',           label: 'SEO'            },
  { key: 'security',      label: 'Security'       },
  { key: 'accessibility', label: 'Accessibility'  },
];

function ScoreTile({ label, value }) {
  const color = scoreColor(value);
  return (
    <View style={S.scoreTile}>
      <Text style={[S.scoreNum, { color }]}>
        {value != null ? String(value) : '—'}
      </Text>
      <Text style={S.scoreLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

export default function CoverPage({ report, pageSize }) {
  const { url, scores = {}, aiSummary, assessment, createdAt } = report;

  const domain = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Structured assessment fields (null-safe throughout)
  const headline      = assessment?.headline ?? null;
  const summary       = assessment?.summary  ?? null;
  const topOpp        = assessment?.top_opportunity ?? null;

  // Fall back to flat aiSummary string when no structured assessment
  const summaryText   = summary ?? aiSummary ?? null;
  const summaryHeader = headline ?? 'AI Executive Summary';
  const hasAssessment = !!(headline || summary || topOpp);

  return (
    <Page size={pageSize} style={S.page}>

      {/* ── Brand header ── */}
      <View style={S.header}>
        <View style={S.brandRow}>
          <View style={S.brandDot} />
          <Text style={S.brandName}>Cernly</Text>
        </View>
        <Text style={S.reportTitle}>Website Analysis Report</Text>
        <Text style={S.reportUrl}>{url}</Text>
        {domain !== url && (
          <Text style={{ fontSize: 9.5, color: COLORS.muted, marginTop: 1 }}>{domain}</Text>
        )}
        {dateStr ? <Text style={S.reportDate}>Generated {dateStr}</Text> : null}
      </View>

      {/* ── Score tiles ── */}
      <View style={S.scoresRow}>
        {SCORE_ENTRIES.map(({ key, label }) => (
          <ScoreTile key={key} label={label} value={scores[key] ?? null} />
        ))}
      </View>

      {/* ── Executive summary ── */}
      {summaryText || hasAssessment ? (
        <View style={S.summaryBox}>
          <Text style={S.summaryLabel}>✦ AI Analysis</Text>
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

      {/* ── Page footer ── */}
      <View style={S.footer} fixed>
        <Text style={S.footerText}>cernly.ai — Website Analysis Report</Text>
        <Text
          style={S.footerText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  );
}
