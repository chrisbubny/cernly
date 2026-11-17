/**
 * PDF Action Plan Page (Page 2+) — Editorial treatment
 *
 * Renders up to 7 prioritized remediation tasks built by buildPriorityTasks().
 * Each task uses a numbered editorial style with dividers (not dashboard cards):
 *
 *   1  Recommendation title
 *      Category · Severity label · Impact label
 *      What we found...
 *      How to fix: ...
 *      Actions: › item 1  › item 2  ...
 *   ────────────────────────────────────────
 *   2  ...
 *
 * Severity and impact are both labeled in text, not color alone.
 * A legend at the top defines both dimensions for readers unfamiliar with the terms.
 * A fixed running header identifies the section and the assessed URL on every page.
 * Actions come from rec.actions[] — not assessment.next_steps (unvalidated shape).
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import {
  S,
  COLORS,
  sevColor,
  sevLabel,
  impactLabel,
  impactColor,
} from './styles.js';
import { buildPriorityTasks, getImpact } from '../../../../../../lib/priority-tasks.js';

const KNOWN_CATS = new Set(['Performance', 'SEO', 'Security', 'Accessibility']);

function catText(task) {
  const primary = task.area || 'Performance';
  if (Array.isArray(task._categories) && task._categories.length > 1) {
    const labels = task._categories.filter(c => KNOWN_CATS.has(c));
    return labels.length > 0 ? labels.join(' · ') : primary;
  }
  return KNOWN_CATS.has(primary) ? primary : 'Performance';
}

/** Legend row explaining Severity and Impact dimensions */
function Legend() {
  return (
    <View style={S.legendRow}>
      {/* Severity group */}
      <View style={S.legendGroup}>
        <Text style={S.legendGroupLabel}>Severity</Text>
        <View style={S.legendItem}>
          <View style={[S.legendDot, { backgroundColor: COLORS.scoreBad }]} />
          <Text style={S.legendText}>Critical — immediate action needed</Text>
        </View>
        <View style={S.legendItem}>
          <View style={[S.legendDot, { backgroundColor: COLORS.scoreWarn }]} />
          <Text style={S.legendText}>Warning — should be addressed</Text>
        </View>
      </View>
      {/* Separator */}
      <Text style={{ fontSize: 7.5, color: COLORS.mutedLight, alignSelf: 'center' }}>|</Text>
      {/* Impact group */}
      <View style={S.legendGroup}>
        <Text style={S.legendGroupLabel}>Impact</Text>
        <Text style={[S.legendText, { color: COLORS.scoreBad }]}>High</Text>
        <Text style={{ fontSize: 7.5, color: COLORS.mutedLight }}>·</Text>
        <Text style={[S.legendText, { color: COLORS.scoreWarn }]}>Medium</Text>
        <Text style={{ fontSize: 7.5, color: COLORS.mutedLight }}>·</Text>
        <Text style={[S.legendText, { color: COLORS.scoreGood }]}>Low</Text>
        <Text style={[S.legendText, { color: COLORS.muted, marginLeft: 2 }]}>— business value of fixing it</Text>
      </View>
    </View>
  );
}

/** Running header fixed to top of every action-plan page */
function RunningHeader({ domain }) {
  return (
    <View style={S.runningHeader} fixed>
      <View style={S.runningHeaderLeft}>
        <View style={S.runningHeaderDot} />
        <Text style={S.runningHeaderText}>Action Plan</Text>
      </View>
      <Text style={S.runningHeaderUrl}>{domain}</Text>
    </View>
  );
}

/** Single numbered editorial task */
function TaskItem({ task, idx }) {
  const impact   = getImpact(task, idx);
  const cats     = catText(task);
  const sevColor_ = sevColor(task.severity);
  const sevLbl   = sevLabel(task.severity);
  const iColor   = impactColor(impact);
  const iLbl     = impactLabel(impact);

  // Actions from rec.actions[] — explicitly not assessment.next_steps
  const actions = Array.isArray(task._rec?.actions) ? task._rec.actions : [];

  return (
    <View style={S.taskItem} wrap={false}>
      {/* Number + title row */}
      <View style={S.taskNumRow}>
        <Text style={S.taskNum}>{idx + 1}</Text>
        <View style={S.taskTitleBlock}>
          <Text style={S.taskTitle}>{task.message || ''}</Text>
          {/* Meta: severity · impact · category */}
          <View style={S.taskMetaRow}>
            <View style={S.taskSevBadge}>
              <View style={[S.taskSevDot, { backgroundColor: sevColor_ }]} />
              <Text style={[S.taskSevText, { color: sevColor_ }]}>{sevLbl}</Text>
            </View>
            <Text style={S.taskMetaDivider}>·</Text>
            <Text style={[S.taskImpactText, { color: iColor }]}>{iLbl}</Text>
            {cats ? (
              <>
                <Text style={S.taskMetaDivider}>·</Text>
                <Text style={S.taskCatText}>{cats}</Text>
              </>
            ) : null}
          </View>
        </View>
      </View>

      {/* Body: description + fix + actions */}
      <View style={S.taskBody}>
        {task.description ? (
          <Text style={S.taskDescription}>{task.description}</Text>
        ) : null}

        {task.fix ? (
          <View style={{ marginBottom: 7 }}>
            <Text style={S.taskFixLabel}>How to fix</Text>
            <Text style={S.taskFixText}>{task.fix}</Text>
          </View>
        ) : null}

        {actions.length > 0 ? (
          <View>
            <Text style={S.taskActionsLabel}>Recommended actions</Text>
            {actions.slice(0, 4).map((action, i) => {
              const text = typeof action === 'string'
                ? action
                : (action?.action || action?.text || String(action));
              return (
                <View key={i} style={S.taskActionItem}>
                  <Text style={S.taskActionBullet}>›</Text>
                  <Text style={S.taskActionText}>{text}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function ActionPlanPage({ report, pageSize }) {
  const tasks = buildPriorityTasks(report.issues || [], report.recommendations || []);

  if (tasks.length === 0) return null;

  const domain = (() => {
    try { return new URL(report.url).hostname; } catch { return report.url; }
  })();

  return (
    <Page size={pageSize} style={[S.page, { paddingTop: 56 }]}>

      {/* Running header — fixed, appears on every continuation page */}
      <RunningHeader domain={domain} />

      {/* Section heading */}
      <Text style={S.apSectionTitle}>Action Plan</Text>
      <Text style={S.apSectionSub}>
        {tasks.length} prioritized recommendation{tasks.length !== 1 ? 's' : ''}, ranked by severity then business impact
      </Text>

      {/* Legend */}
      <Legend />

      {/* Task list */}
      {tasks.map((task, idx) => (
        <TaskItem
          key={task._recFingerprint || task.fingerprintId || idx}
          task={task}
          idx={idx}
        />
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
