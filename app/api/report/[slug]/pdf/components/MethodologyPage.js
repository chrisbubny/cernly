/**
 * PDF Methodology & Limitations Page
 *
 * Documents the scan configuration, analyzer results, score definitions,
 * severity/impact distinction, and important limitations of automated scanning.
 *
 * Content rules:
 *   - Only factual claims about what the tool does/measures
 *   - Does NOT claim comprehensive security audit or WCAG compliance certification
 *   - analyzer status comes from report.analyzerStatuses (if present) or falls back
 *     to inferring from scores (null score = likely failed)
 *   - No data is fabricated
 *
 * Analyzer status shape (optional in report):
 *   report.analyzerStatuses = {
 *     lighthouse: { status: 'completed' | 'failed' | 'skipped', duration: <ms> },
 *     seo:        { ... },
 *     ssl:        { ... },
 *     a11y:       { ... },
 *   }
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import { S, COLORS, scoreColor } from './styles.js';

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url || ''; }
}

/** Fixed running header */
function RunningHeader({ domain }) {
  return (
    <View style={S.runningHeader} fixed>
      <View style={S.runningHeaderLeft}>
        <View style={S.runningHeaderDot} />
        <Text style={S.runningHeaderText}>Methodology</Text>
      </View>
      <Text style={S.runningHeaderUrl}>{domain}</Text>
    </View>
  );
}

/** Two-column info row */
function InfoRow({ label, value }) {
  return (
    <View style={S.methodRow}>
      <Text style={S.methodLabel}>{label}</Text>
      <Text style={S.methodValue}>{value}</Text>
    </View>
  );
}

/** Analyzer configuration */
const ANALYZER_CONFIG = [
  {
    key:      'lighthouse',
    scoreKey: 'performance',
    name:     'Performance',
    desc:     'Google PageSpeed Insights API (mobile simulation), Core Web Vitals, resource loading, rendering performance',
  },
  {
    key:      'seo',
    scoreKey: 'seo',
    name:     'SEO',
    desc:     'Meta tags, page title, headings, structured data, canonical URLs, crawlability',
  },
  {
    key:      'ssl',
    scoreKey: 'security',
    name:     'Security',
    desc:     'TLS/SSL certificate validity and configuration, security response headers (CSP, HSTS, X-Frame-Options)',
  },
  {
    key:      'a11y',
    scoreKey: 'accessibility',
    name:     'Accessibility',
    desc:     'Automated WCAG 2.1 element-level checks (image alt text, colour contrast, ARIA labels, form labels)',
  },
];

function formatDuration(ms) {
  if (ms == null) return null;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

function AnalyzerRow({ config, statusInfo, scores }) {
  // Determine status: explicit > infer from score
  let status   = statusInfo?.status ?? null;
  const duration = statusInfo?.duration ? formatDuration(statusInfo.duration) : null;

  if (!status) {
    // Infer: if score is null, likely failed; if score present, likely completed
    status = scores[config.scoreKey] != null ? 'completed' : 'unknown';
  }

  const isCompleted = status === 'completed';
  const isFailed    = status === 'failed' || status === 'error';
  const statusColor = isCompleted ? COLORS.scoreGood : isFailed ? COLORS.scoreBad : COLORS.muted;
  const statusText  = isCompleted ? 'Completed' : isFailed ? 'Failed' : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <View style={S.analyzerRow}>
      <Text style={S.analyzerName}>{config.name}</Text>
      <View style={S.analyzerStatusBadge}>
        <View style={[S.analyzerStatusDot, { backgroundColor: statusColor }]} />
        <Text style={[S.analyzerStatusText, { color: statusColor }]}>{statusText}</Text>
      </View>
      {duration ? (
        <Text style={S.analyzerDuration}>{duration}</Text>
      ) : (
        <Text style={S.analyzerDuration} />
      )}
      <Text style={S.analyzerDesc}>{config.desc}</Text>
    </View>
  );
}

/** Score definition rows */
const SCORE_DEFS = [
  {
    name:  'Performance',
    range: '0 – 100',
    desc:  'Composite of Core Web Vitals (LCP, TBT, CLS), time-to-interactive, and resource efficiency. Scored by Google PageSpeed Insights on a mobile device simulation.',
  },
  {
    name:  'SEO',
    range: '0 – 100',
    desc:  'Checks for meta description, page title, heading structure, canonical tag, structured data markup, and crawl directives. Does not evaluate off-page factors such as backlinks or domain authority.',
  },
  {
    name:  'Security',
    range: '0 – 100',
    desc:  'Evaluates TLS certificate validity, protocol version, cipher strength, and presence of key HTTP security headers. This is a surface-level automated check and is not a substitute for a full security audit or penetration test.',
  },
  {
    name:  'Accessibility',
    range: '0 – 100',
    desc:  'Automated element-level checks for common WCAG 2.1 success criteria. Automated tools can detect approximately 30–40% of accessibility issues; a full audit requires manual review and user testing. This report does not constitute a WCAG compliance certification.',
  },
];

export default function MethodologyPage({ report, pageSize }) {
  const {
    url,
    createdAt,
    id,
    analyzerStatuses = {},
    scores = {},
  } = report;

  const domain  = getDomain(url);
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'Not recorded';

  return (
    <Page size={pageSize} style={[S.page, { paddingTop: 56 }]}>
      <RunningHeader domain={domain} />

      <Text style={S.apSectionTitle}>Methodology &amp; Limitations</Text>
      <Text style={[S.apSectionSub, { marginBottom: 12 }]}>
        How this report was produced and what its findings do and do not establish.
      </Text>

      {/* ── Scan overview ── */}
      <View style={S.methodBlock}>
        <Text style={S.methodBlockLabel}>Scan Overview</Text>
        <InfoRow label="URL" value={url || '—'} />
        <InfoRow label="Scan date" value={dateStr} />
        {id ? <InfoRow label="Report ID" value={String(id)} /> : null}
      </View>

      {/* ── Analyzer results ── */}
      <View style={S.methodBlock}>
        <Text style={S.methodBlockLabel}>Analyzers</Text>
        {/* Table header row */}
        <View style={[S.analyzerRow, { borderBottomWidth: 1, borderBottomColor: COLORS.borderStrong }]}>
          <Text style={[S.analyzerName,       { color: COLORS.muted, fontFamily: 'Inter' }]}>Analyzer</Text>
          <Text style={[S.analyzerStatusBadge,{ color: COLORS.muted, fontFamily: 'Inter', flexDirection: 'row' }]}><Text style={S.analyzerDesc}>Status</Text></Text>
          <Text style={[S.analyzerDuration,   { color: COLORS.muted, fontFamily: 'Inter' }]}>Time</Text>
          <Text style={[S.analyzerDesc,       { color: COLORS.muted, fontFamily: 'Inter' }]}>Coverage</Text>
        </View>
        {ANALYZER_CONFIG.map(config => (
          <AnalyzerRow
            key={config.key}
            config={config}
            statusInfo={analyzerStatuses[config.key] ?? null}
            scores={scores}
          />
        ))}
      </View>

      {/* ── Score definitions — force page break so Limitations lands with these sections
           rather than alone on a near-empty page ── */}
      <View style={S.methodBlock} break>
        <Text style={S.methodBlockLabel}>What These Scores Represent</Text>
        {SCORE_DEFS.map(def => (
          <View key={def.name} style={S.defRow}>
            <Text style={S.defTerm}>{def.name}</Text>
            <Text style={S.defDesc}>{def.desc}</Text>
          </View>
        ))}
      </View>

      {/* ── Severity vs impact ── */}
      <View style={S.methodBlock} wrap={false}>
        <Text style={S.methodBlockLabel}>Severity vs. Impact</Text>
        <View style={S.defRow}>
          <Text style={S.defTerm}>Severity</Text>
          <Text style={S.defDesc}>
            How serious the technical problem is. Critical means the issue is broken or causes direct harm;
            Warning means it is suboptimal but functioning; Info means it is worth noting but minor.
          </Text>
        </View>
        <View style={S.defRow}>
          <Text style={S.defTerm}>Impact</Text>
          <Text style={S.defDesc}>
            The estimated business and user value of fixing this issue. High-impact fixes deliver
            the most measurable improvement. Impact is independent of severity — an info-level
            finding may still have high business impact.
          </Text>
        </View>
      </View>

      {/* ── Limitations ── */}
      <View style={S.methodBlock}>
        <Text style={S.methodBlockLabel}>Important Limitations</Text>

        {[
          'This scan checked a single URL at one point in time. Dynamic content, authenticated pages, and other URLs on the same domain were not evaluated.',
          'Automated tools cannot detect all accessibility issues. This report does not constitute a WCAG compliance certification or legal accessibility assessment.',
          'The Security score reflects surface-level header and certificate checks only. This is not a comprehensive security audit, vulnerability assessment, or penetration test.',
          'Performance results are based on a simulated mobile network and device. Real-user performance varies by device, location, and network conditions.',
          'Some findings may not apply if content, server configuration, or third-party dependencies have changed since the scan was run.',
          'A finding\'s severity reflects technical risk, not necessarily the effort required to fix it. Consult your development team for accurate remediation estimates.',
        ].map((text, i) => (
          <View key={i} style={S.limitationItem}>
            <Text style={S.limitationBullet}>–</Text>
            <Text style={S.limitationText}>{text}</Text>
          </View>
        ))}
      </View>

      {/* Footer */}
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
