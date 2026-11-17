/**
 * PDF Detailed Findings Page
 *
 * Renders all actionable findings (critical/warning/info) grouped by the four
 * canonical categories: Performance, SEO, Security, Accessibility.
 *
 * Design principles:
 *   - Each finding shows severity, title, description, and evidence (URLs/items)
 *   - Cross-category findings display their primary area and cross-reference
 *   - Findings covered by an Action Plan recommendation show which one
 *   - Missing evidence or failed analyzers are handled gracefully
 *   - "good" (passed) audit results are excluded — only actionable items shown
 *   - No data is fabricated; evidence items come directly from report.issues[].items
 *
 * Data flow:
 *   report.issues[]       → flat list of all scan findings (all categories)
 *   report.recommendations[] → used to map finding fingerprints → AP task numbers
 *   buildPriorityTasks()  → used to derive Action Plan task numbers for cross-ref
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import {
  S,
  COLORS,
  scoreColor,
  scoreInterpretation,
  sevColor,
  sevLabel,
  catAccent,
} from './styles.js';
import { buildPriorityTasks } from '../../../../../../lib/priority-tasks.js';

// Canonical category display order and normalization
const CATEGORIES = ['Performance', 'SEO', 'Security', 'Accessibility'];

const ANALYZER_DESC = {
  Performance: 'Google PageSpeed Insights (mobile)',
  SEO:         'Meta tags, structure, crawlability',
  Security:    'TLS/SSL, security response headers',
  Accessibility: 'WCAG 2.1 automated element checks',
};

function normalizeCat(area) {
  if (!area) return null;
  const a = area.toLowerCase();
  if (a === 'performance')                    return 'Performance';
  if (a === 'seo')                            return 'SEO';
  if (a === 'security' || a === 'ssl')        return 'Security';
  if (a === 'accessibility' || a === 'a11y')  return 'Accessibility';
  return null;
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url || ''; }
}

function truncateUrl(url, maxLen = 70) {
  if (!url || url.length <= maxLen) return url;
  return url.slice(0, 32) + '…' + url.slice(-(maxLen - 33));
}

function formatBytes(bytes) {
  if (bytes == null) return null;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000)     return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

/** Fixed running header */
function RunningHeader({ domain, label }) {
  return (
    <View style={S.runningHeader} fixed>
      <View style={S.runningHeaderLeft}>
        <View style={S.runningHeaderDot} />
        <Text style={S.runningHeaderText}>{label}</Text>
      </View>
      <Text style={S.runningHeaderUrl}>{domain}</Text>
    </View>
  );
}

/** Evidence list — all items, no cap; paginates naturally */
function EvidenceList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={S.evidenceHeader}>
        {items.length} affected resource{items.length !== 1 ? 's' : ''}
      </Text>
      {items.map((item, i) => {
        const url   = item?.url   || null;
        const label = item?.label || null;
        const bytes = item?.bytes != null ? formatBytes(item.bytes) : null;
        const display = url ? truncateUrl(url) : (label || null);
        if (!display) return null;
        return (
          <View key={i} style={S.evidenceItem}>
            <Text style={S.evidenceBullet}>›</Text>
            <Text style={S.evidenceUrl}>{display}</Text>
            {bytes ? <Text style={S.evidenceSize}>({bytes})</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Single finding entry */
function FindingItem({ finding, apRef }) {
  const sevClr  = sevColor(finding.severity);
  const sevLbl  = sevLabel(finding.severity);
  const hasDesc = !!finding.description;
  const hasItems = Array.isArray(finding.items) && finding.items.length > 0;

  return (
    <View style={S.findingItem}>
      {/* Title + description kept together — wrap={false} prevents an orphaned header */}
      <View wrap={false}>
        <View style={S.findingTopRow}>
          <View style={[S.findingSevDot, { backgroundColor: sevClr }]} />
          <View style={S.findingTitleBlock}>
            <Text style={S.findingTitle}>{finding.message || finding.title || '—'}</Text>
            <View style={S.findingMetaRow}>
              <Text style={[S.findingSevLabel, { color: sevClr }]}>{sevLbl}</Text>
              {apRef ? (
                <>
                  <Text style={S.findingMetaDot}>·</Text>
                  <Text style={S.findingRecRef}>Action Plan #{apRef}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        {hasDesc ? (
          <View style={S.findingBody}>
            <Text style={S.findingDesc}>{finding.description}</Text>
          </View>
        ) : null}
      </View>

      {/* Evidence items — free to paginate across pages */}
      {hasItems ? (
        <View style={S.findingBody}>
          <EvidenceList items={finding.items} />
        </View>
      ) : null}
    </View>
  );
}

/** Category section with header and all its findings */
function CategorySection({ cat, score, findings, taskIndex, recCoverage }) {
  const accent   = catAccent(cat);
  const sColor   = scoreColor(score);
  const sInterp  = scoreInterpretation(score);
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warning  = findings.filter(f => f.severity === 'warning').length;
  const info     = findings.filter(f => f.severity === 'info').length;

  const metaParts = [];
  if (critical > 0) metaParts.push(`${critical} critical`);
  if (warning  > 0) metaParts.push(`${warning} warning`);
  if (info     > 0) metaParts.push(`${info} info`);

  return (
    <View style={S.catSection}>
      {/* Category header — keep with first finding using wrap={false} on header */}
      <View wrap={false}>
        <View style={[S.catHeader]}>
          <Text style={[S.catHeaderName, { color: accent }]}>{cat}</Text>
          {score != null ? (
            <Text style={[S.catHeaderScore, { color: sColor }]}>
              {score} — {sInterp}
            </Text>
          ) : (
            <Text style={[S.catHeaderScore, { color: COLORS.scoreMissing }]}>
              Score unavailable
            </Text>
          )}
        </View>
        <View style={[S.catDivider, { borderTopColor: accent, opacity: 0.4 }]} />
        {metaParts.length > 0 ? (
          <Text style={S.catHeaderMeta}>
            {findings.length} finding{findings.length !== 1 ? 's' : ''} · {metaParts.join(' · ')}
          </Text>
        ) : null}

        {/* First finding — bundled in the wrap={false} to prevent orphaned header */}
        {findings.length > 0 ? (
          <FindingItem
            finding={findings[0]}
            apRef={(() => {
              const fp = findings[0].fingerprintId;
              const recFp = fp ? recCoverage.get(fp) : null;
              return recFp ? (taskIndex.get(recFp) ?? null) : null;
            })()}
          />
        ) : null}
      </View>

      {/* Remaining findings — can break across pages */}
      {findings.slice(1).map((finding, i) => {
        const fp    = finding.fingerprintId;
        const recFp = fp ? recCoverage.get(fp) : null;
        const apRef = recFp ? (taskIndex.get(recFp) ?? null) : null;
        return (
          <FindingItem
            key={finding.fingerprintId || `${cat}-${i + 1}`}
            finding={finding}
            apRef={apRef}
          />
        );
      })}
    </View>
  );
}

export default function FindingsPage({ report, pageSize }) {
  const { issues = [], recommendations = [], scores = {}, url } = report;
  const domain = getDomain(url);

  // Build Action Plan task index: recFingerprint → task number (1-based)
  const tasks = buildPriorityTasks(issues, recommendations);
  const taskIndex = new Map();
  tasks.forEach((task, idx) => {
    if (task._recFingerprint) taskIndex.set(task._recFingerprint, idx + 1);
  });

  // Build rec coverage map: findingFingerprintId → recFingerprint
  const recCoverage = new Map();
  for (const rec of recommendations) {
    for (const fp of rec.finding_fingerprints || []) {
      recCoverage.set(fp, rec.fingerprint);
    }
  }

  // Group actionable findings by category (exclude 'good' — not actionable)
  const grouped = {};
  for (const cat of CATEGORIES) grouped[cat] = [];

  for (const issue of issues) {
    if (issue.severity === 'good') continue;
    const cat = normalizeCat(issue.area);
    if (cat) grouped[cat].push(issue);
  }

  // Sort each category: critical first, then warning, then info
  const SEV_ORDER = { critical: 0, warning: 1, info: 2 };
  for (const cat of CATEGORIES) {
    grouped[cat].sort((a, b) =>
      (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
    );
  }

  const activeCats = CATEGORIES.filter(c => grouped[c].length > 0);
  const totalCount = activeCats.reduce((n, c) => n + grouped[c].length, 0);

  if (totalCount === 0) return null;

  return (
    <Page size={pageSize} style={[S.page, { paddingTop: 56 }]}>
      <RunningHeader domain={domain} label="Detailed Findings" />

      {/* Section header */}
      <Text style={S.apSectionTitle}>Detailed Findings</Text>
      <Text style={S.apSectionSub}>
        {totalCount} finding{totalCount !== 1 ? 's' : ''} across {activeCats.length} categor{activeCats.length !== 1 ? 'ies' : 'y'} · severity-ordered within each category
      </Text>

      {/* Category sections */}
      {CATEGORIES.map(cat => {
        const findings = grouped[cat];
        if (findings.length === 0) return null;
        return (
          <CategorySection
            key={cat}
            cat={cat}
            score={scores[cat.toLowerCase()] ?? null}
            findings={findings}
            taskIndex={taskIndex}
            recCoverage={recCoverage}
          />
        );
      })}

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
