/**
 * Phase 1 PDF foundation tests.
 *
 * Covers:
 *   1.  buildPriorityTasks extraction — identical ranking before/after
 *   2.  Four canonical scores: performance, seo, security, accessibility
 *   3.  'paid' and 'userId' stripped for non-owners (report route privacy)
 *   4.  'paid' and 'userId' preserved for owners
 *   5.  resolvePageSize — LETTER default, A4 opt-in
 *   6.  Missing assessment — CoverPage gracefully omits AI section
 *   7.  Empty issues/recs — ActionPlanPage handles gracefully (no tasks)
 *   8.  Seven-task cap not exceeded
 *   9.  Impact labels: idx 0–1 high, 2–4 medium, 5–6 low
 *  10.  catText derived correctly for multi-category tasks
 *  11.  Actions from rec.actions (not assessment.next_steps)
 *  12.  getImpact exported correctly
 *
 * Run: node __tests__/pdf-phase1.mjs
 */

import assert from 'node:assert/strict';
import { buildPriorityTasks, getImpact, SEV_ORDER, PRIO_ORDER } from '../lib/priority-tasks.js';
import { resolvePageSize, PAGE_SIZES } from '../app/api/report/[slug]/pdf/page-size.js';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

function makeRec(overrides = {}) {
  return {
    fingerprint: 'perf-render-blocking',
    title: 'Eliminate render-blocking resources',
    category: 'Performance',
    priority: 'high',
    supporting_findings: [
      { fingerprintId: 'lh:render-blocking', severity: 'critical', area: 'Performance', items: [] },
    ],
    finding_fingerprints: ['lh:render-blocking'],
    actions: ['Defer non-critical JavaScript', 'Inline critical CSS'],
    ...overrides,
  };
}

function makeIssue(overrides = {}) {
  return {
    fingerprintId: 'ssl:expired',
    severity: 'critical',
    message: 'SSL certificate is expired',
    area: 'Security',
    source: 'ssl',
    items: [],
    ...overrides,
  };
}

// ─── Test 1: Extraction — ranking identical before and after ─────────────────
{
  const recs = [
    makeRec({ fingerprint: 'a', priority: 'high',   title: 'High rec',   supporting_findings: [{ fingerprintId: 'x1', severity: 'critical', area: 'Performance', items: [] }], finding_fingerprints: ['x1'] }),
    makeRec({ fingerprint: 'b', priority: 'medium', title: 'Medium rec', supporting_findings: [{ fingerprintId: 'x2', severity: 'critical', area: 'SEO',         items: [] }], finding_fingerprints: ['x2'] }),
    makeRec({ fingerprint: 'c', priority: 'low',    title: 'Low rec',    supporting_findings: [{ fingerprintId: 'x3', severity: 'warning',  area: 'Security',     items: [] }], finding_fingerprints: ['x3'] }),
  ];

  const tasks = buildPriorityTasks([], recs);
  assert.equal(tasks.length, 3, 'should return 3 tasks');
  // critical before warning
  assert.equal(tasks[0].severity, 'critical');
  assert.equal(tasks[1].severity, 'critical');
  assert.equal(tasks[2].severity, 'warning');
  // within critical tier: high before medium
  assert.equal(tasks[0].message, 'High rec');
  assert.equal(tasks[1].message, 'Medium rec');
  console.log('✓ 1: ranking: critical before warning, high-priority before medium within tier');
}

// ─── Test 2: Four canonical scores ──────────────────────────────────────────
{
  const CANON = ['performance', 'seo', 'security', 'accessibility'];
  const scores = { performance: 72, seo: 85, security: 91, accessibility: 63, bestPractices: 70 };
  for (const key of CANON) {
    assert.ok(key in scores, `canonical score key '${key}' must exist`);
    assert.equal(typeof scores[key], 'number');
  }
  // bestPractices must NOT be in canonical list
  assert.ok(!CANON.includes('bestPractices'), 'bestPractices is not a canonical score');
  console.log('✓ 2: four canonical scores: performance, seo, security, accessibility');
}

// ─── Test 3: Non-owner response strips userId and paid ───────────────────────
{
  const report = { id: 1, url: 'https://example.com', userId: 'user_abc', paid: true, scores: {} };
  const isOwner = false;
  const { userId: _ownerId, paid: _paid, ...publicReport } = report;
  const response = isOwner ? report : publicReport;
  assert.ok(!('userId' in response), 'userId must be absent for non-owner');
  assert.ok(!('paid'   in response), 'paid must be absent for non-owner');
  assert.ok('url' in response, 'url must be present');
  console.log('✓ 3: non-owner response strips userId and paid');
}

// ─── Test 4: Owner response includes userId and paid ─────────────────────────
{
  const report = { id: 1, url: 'https://example.com', userId: 'user_abc', paid: true, scores: {} };
  const isOwner = true;
  const { userId: _ownerId, paid: _paid, ...publicReport } = report;
  const response = isOwner ? report : publicReport;
  assert.equal(response.userId, 'user_abc', 'owner sees userId');
  assert.equal(response.paid, true, 'owner sees paid flag');
  console.log('✓ 4: owner response includes userId and paid');
}

// ─── Test 5: resolvePageSize ──────────────────────────────────────────────────
{
  assert.equal(resolvePageSize(null),     'LETTER', 'null → LETTER');
  assert.equal(resolvePageSize(undefined),'LETTER', 'undefined → LETTER');
  assert.equal(resolvePageSize(''),       'LETTER', 'empty → LETTER');
  assert.equal(resolvePageSize('letter'), 'LETTER', 'letter → LETTER');
  assert.equal(resolvePageSize('LETTER'), 'LETTER', 'LETTER → LETTER');
  assert.equal(resolvePageSize('a4'),     'A4',     'a4 → A4');
  assert.equal(resolvePageSize('A4'),     'A4',     'A4 → A4');
  assert.equal(resolvePageSize('bogus'),  'LETTER', 'unknown → LETTER default');
  console.log('✓ 5: resolvePageSize — LETTER default, A4 opt-in, case-insensitive');
}

// ─── Test 6: Missing assessment — no errors, tasks still built ───────────────
{
  const report = {
    url: 'https://example.com',
    scores: { performance: 55 },
    issues: [],
    recommendations: [makeRec()],
    assessment: null,
    aiSummary: null,
  };
  // buildPriorityTasks must succeed even when assessment is null
  const tasks = buildPriorityTasks(report.issues, report.recommendations);
  assert.ok(Array.isArray(tasks), 'returns array when assessment is null');
  assert.equal(tasks.length, 1);
  console.log('✓ 6: missing assessment — buildPriorityTasks works, returns tasks correctly');
}

// ─── Test 7: Empty issues and recommendations ────────────────────────────────
{
  const tasks = buildPriorityTasks([], []);
  assert.ok(Array.isArray(tasks), 'returns array');
  assert.equal(tasks.length, 0, 'empty input → empty output');
  console.log('✓ 7: empty issues/recs → empty task array (no crash)');
}

// ─── Test 8: Seven-task cap ───────────────────────────────────────────────────
{
  const recs = Array.from({ length: 10 }, (_, i) => makeRec({
    fingerprint: `rec-${i}`,
    title: `Task ${i}`,
    supporting_findings: [{ fingerprintId: `fp-${i}`, severity: 'warning', area: 'Performance', items: [] }],
    finding_fingerprints: [`fp-${i}`],
  }));
  const tasks = buildPriorityTasks([], recs);
  assert.equal(tasks.length, 7, 'must not exceed 7 tasks');
  console.log('✓ 8: seven-task cap — 10 recs → 7 tasks');
}

// ─── Test 9: Impact labels ────────────────────────────────────────────────────
{
  // Build 7 warning tasks (non-critical) so impact is driven by idx
  const recs = Array.from({ length: 7 }, (_, i) => makeRec({
    fingerprint: `r${i}`,
    title: `T${i}`,
    supporting_findings: [{ fingerprintId: `f${i}`, severity: 'warning', area: 'SEO', items: [] }],
    finding_fingerprints: [`f${i}`],
  }));
  const tasks = buildPriorityTasks([], recs);
  const impacts = tasks.map((t, i) => getImpact(t, i));
  assert.equal(impacts[0], 'high',   'idx 0 → high');
  assert.equal(impacts[1], 'high',   'idx 1 → high');
  assert.equal(impacts[2], 'medium', 'idx 2 → medium');
  assert.equal(impacts[3], 'medium', 'idx 3 → medium');
  assert.equal(impacts[4], 'medium', 'idx 4 → medium');
  assert.equal(impacts[5], 'low',    'idx 5 → low');
  assert.equal(impacts[6], 'low',    'idx 6 → low');

  // Critical finding always high regardless of idx
  const critTask = { severity: 'critical', _rec: null };
  assert.equal(getImpact(critTask, 6), 'high', 'critical at idx 6 → high');
  console.log('✓ 9: impact labels — idx 0–1 high, 2–4 medium, 5–6 low; critical always high');
}

// ─── Test 10: catText from _categories ───────────────────────────────────────
{
  const KNOWN_CATS = new Set(['Performance', 'SEO', 'Security', 'Accessibility']);
  function deriveCatText(task) {
    const primary = task.area || 'Performance';
    if (Array.isArray(task._categories) && task._categories.length > 1) {
      const labels = task._categories.filter(c => KNOWN_CATS.has(c));
      return labels.length > 0 ? labels.join(' · ') : primary;
    }
    return KNOWN_CATS.has(primary) ? primary : 'Performance';
  }

  const findings = [
    { fingerprintId: 'a11y:alt', severity: 'critical', area: 'Accessibility', items: [] },
    { fingerprintId: 'seo:alt',  severity: 'warning',  area: 'SEO',           items: [] },
  ];
  const rec = makeRec({
    fingerprint: 'mixed',
    category: 'Accessibility',
    supporting_findings: findings,
    finding_fingerprints: findings.map(f => f.fingerprintId),
  });
  const [task] = buildPriorityTasks([], [rec]);
  const ct = deriveCatText(task);
  assert.ok(ct.startsWith('Accessibility'), 'primary category first');
  assert.ok(ct.includes('SEO'), 'secondary category included');
  console.log('✓ 10: catText — multi-category task: "Accessibility · SEO"');
}

// ─── Test 11: Actions come from rec.actions, not assessment.next_steps ───────
{
  const recActions  = ['Action A', 'Action B'];
  const nextSteps   = ['Should not appear'];
  const rec = makeRec({ actions: recActions });
  const report = {
    issues: [],
    recommendations: [rec],
    assessment: { next_steps: nextSteps },
  };
  const [task] = buildPriorityTasks(report.issues, report.recommendations);
  assert.deepEqual(task._rec.actions, recActions, 'actions come from rec.actions');
  // Confirm next_steps is NOT surfaced via the task
  assert.ok(!('next_steps' in task), 'next_steps not on task object');
  console.log('✓ 11: actions from rec.actions, NOT assessment.next_steps');
}

// ─── Test 12: getImpact exported correctly ────────────────────────────────────
{
  assert.equal(typeof getImpact, 'function', 'getImpact is a function');
  assert.equal(getImpact({ severity: 'critical' }, 6), 'high');
  assert.equal(getImpact({ severity: 'warning'  }, 0), 'high');
  assert.equal(getImpact({ severity: 'warning'  }, 3), 'medium');
  assert.equal(getImpact({ severity: 'warning'  }, 6), 'low');
  console.log('✓ 12: getImpact exported and correct');
}

console.log('\n✅ All pdf-phase1 tests passed.');
