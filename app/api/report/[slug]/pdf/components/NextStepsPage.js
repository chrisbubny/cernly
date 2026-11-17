/**
 * PDF Recommended Next Steps Page
 *
 * Derives a concise action sequence (3–5 steps) from the highest-priority
 * recommendations and their supporting issues.
 *
 * Data rules:
 *   - Steps are derived from buildPriorityTasks() output — same logic as the
 *     interactive Action Plan
 *   - assessment.next_steps is explicitly NOT used (unvalidated shape per CLAUDE.md)
 *   - No content is fabricated; every step title and item references actual data
 *   - The final step ("Rescan") is always appended as a process recommendation
 *   - Page is omitted entirely if the report has no recommendations or issues
 *
 * Intent: provide a brief "where to start" guide rather than repeating
 * the full 7-item Action Plan list.
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import { S, COLORS, sevColor, sevLabel } from './styles.js';
import { buildPriorityTasks, getImpact } from '../../../../../../lib/priority-tasks.js';

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url || ''; }
}

/** Fixed running header */
function RunningHeader({ domain }) {
  return (
    <View style={S.runningHeader} fixed>
      <View style={S.runningHeaderLeft}>
        <View style={S.runningHeaderDot} />
        <Text style={S.runningHeaderText}>Next Steps</Text>
      </View>
      <Text style={S.runningHeaderUrl}>{domain}</Text>
    </View>
  );
}

/**
 * Derive a 3–5 step sequence from priority tasks.
 * Groups tasks by severity phase, then appends a rescan step.
 */
function deriveNextSteps(tasks) {
  const steps = [];

  const critical = tasks.filter(t => t.severity === 'critical');
  const warning  = tasks.filter(t => t.severity === 'warning');
  const info     = tasks.filter(t => t.severity === 'info');

  // Step 1: Address all critical issues
  if (critical.length > 0) {
    steps.push({
      title: `Resolve ${critical.length} critical issue${critical.length > 1 ? 's' : ''}`,
      rationale:
        'Critical findings pose an immediate risk to performance, security, or user access. ' +
        'Address these before any other improvements.',
      items: critical.map(t => t.message || t.title || '—'),
    });
  }

  // Step 2: High-impact warnings (up to 4)
  const highWarnings = warning.slice(0, 4);
  if (highWarnings.length > 0) {
    steps.push({
      title: `Address high-priority warnings`,
      rationale:
        'These improvements offer meaningful gains in performance and accessibility ' +
        'with manageable implementation effort.',
      items: highWarnings.map(t => t.message || t.title || '—'),
    });
  }

  // Step 3: Remaining warnings (if any)
  const remaining = warning.slice(4);
  if (remaining.length > 0) {
    steps.push({
      title: `Schedule remaining ${remaining.length} warning${remaining.length > 1 ? 's' : ''}`,
      rationale:
        'Lower-priority issues that should be planned into a future sprint once critical ' +
        'and high-priority items are resolved.',
      items: remaining.map(t => t.message || t.title || '—'),
    });
  }

  // Step 4: Info items (if any, collapsed into one step)
  if (info.length > 0) {
    steps.push({
      title: `Review ${info.length} informational finding${info.length > 1 ? 's' : ''}`,
      rationale:
        'These do not require immediate action but represent opportunities for incremental improvement.',
      items: info.map(t => t.message || t.title || '—').slice(0, 3),
    });
  }

  // Always last: rescan
  steps.push({
    title: 'Rescan to verify improvements',
    rationale:
      'Run a new Cernly scan after completing each phase of remediation to confirm ' +
      'fixes are effective and to track score improvements over time.',
    items: ['Submit the same URL to Cernly after each remediation phase'],
    isRescan: true,
  });

  return steps;
}

/** Single numbered step */
function NextStep({ step, num }) {
  return (
    <View style={[S.nsStep, step.isRescan ? { borderBottomWidth: 0 } : {}]} wrap={false}>
      {/* Circle number */}
      <View style={S.nsStepNum}>
        <Text style={S.nsStepNumText}>{num}</Text>
      </View>

      <View style={S.nsStepBody}>
        <Text style={S.nsStepTitle}>{step.title}</Text>
        <Text style={S.nsStepRationale}>{step.rationale}</Text>
        {(step.items || []).map((item, i) => (
          <View key={i} style={S.nsStepItem}>
            <Text style={S.nsStepBullet}>›</Text>
            <Text style={S.nsStepItemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function NextStepsPage({ report, pageSize }) {
  const { issues = [], recommendations = [], url } = report;
  const domain = getDomain(url);

  const tasks = buildPriorityTasks(issues, recommendations);
  if (tasks.length === 0) return null;

  const steps = deriveNextSteps(tasks);

  return (
    <Page size={pageSize} style={[S.page, { paddingTop: 56 }]}>
      <RunningHeader domain={domain} />

      {/* Section header */}
      <Text style={S.apSectionTitle}>Recommended Next Steps</Text>
      <Text style={[S.nsIntro]}>
        The following sequence is derived from the highest-priority findings in this report.
        Work through these phases in order — completing earlier phases first maximises the
        benefit of later improvements and avoids rework.
      </Text>

      {/* Step list */}
      {steps.map((step, i) => (
        <NextStep key={i} step={step} num={i + 1} />
      ))}

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
