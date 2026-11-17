/**
 * PDF Action Plan Page (Page 2+)
 *
 * Renders up to 7 prioritized remediation tasks built by buildPriorityTasks().
 * Each task card shows:
 *   - Severity dot + title + impact badge
 *   - Category metadata (· separated)
 *   - What we found (description)
 *   - Fix instruction when available
 *   - Recommended actions from rec.actions[] (NOT assessment.next_steps)
 *
 * react-pdf breaks content across pages automatically. We render one continuous
 * <Page> for the action plan; react-pdf handles page breaks.
 */
import React from 'react';
import { Page, View, Text } from '@react-pdf/renderer';
import {
  S,
  COLORS,
  sevColor,
  sevBg,
  impactLabel,
  impactColor,
  catAccent,
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

function TaskCard({ task, idx }) {
  const impact  = getImpact(task, idx);
  const cats    = catText(task);
  const color   = sevColor(task.severity);
  const bg      = sevBg(task.severity);
  const iColor  = impactColor(impact);
  const iLabel  = impactLabel(impact);

  // Actions from rec.actions[] — explicitly not assessment.next_steps
  const actions = Array.isArray(task._rec?.actions) ? task._rec.actions : [];

  return (
    <View style={S.taskCard} wrap={false}>
      {/* Header row: dot + title + impact badge */}
      <View style={S.taskHeader}>
        <View style={[S.taskSevDot, { backgroundColor: color }]} />
        <Text style={S.taskTitle}>{task.message || ''}</Text>
        <View style={[S.taskImpactBadge, { backgroundColor: bg, color: iColor }]}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Inter-SemiBold', color: iColor }}>{iLabel}</Text>
        </View>
      </View>

      {/* Category metadata */}
      {cats ? (
        <View style={S.taskMeta}>
          <Text style={S.taskCatPill}>{cats}</Text>
        </View>
      ) : null}

      {/* What we found */}
      {task.description ? (
        <Text style={S.taskDescription}>{task.description}</Text>
      ) : null}

      {/* Fix instruction */}
      {task.fix ? (
        <View style={{ marginBottom: 5 }}>
          <Text style={S.taskFixLabel}>How to fix</Text>
          <Text style={S.taskFixText}>{task.fix}</Text>
        </View>
      ) : null}

      {/* Recommended actions (from rec.actions) */}
      {actions.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          <Text style={[S.taskFixLabel, { marginBottom: 4 }]}>Recommended actions</Text>
          {actions.slice(0, 4).map((action, i) => {
            const text = typeof action === 'string' ? action : (action?.action || action?.text || String(action));
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
  );
}

export default function ActionPlanPage({ report, pageSize }) {
  const tasks = buildPriorityTasks(report.issues || [], report.recommendations || []);

  if (tasks.length === 0) return null;

  return (
    <Page size={pageSize} style={S.page}>
      <Text style={S.sectionTitle}>Action Plan</Text>
      <View style={S.sectionDivider} />

      <Text style={{ fontSize: 9, color: COLORS.muted, marginBottom: 14 }}>
        {tasks.length} prioritized remediation task{tasks.length !== 1 ? 's' : ''}
        {' '}ranked by severity and impact
      </Text>

      {tasks.map((task, idx) => (
        <TaskCard key={task._recFingerprint || task.fingerprintId || idx} task={task} idx={idx} />
      ))}

      {/* Footer */}
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
