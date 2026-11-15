/**
 * Tests for Action Plan category pills and conditional explanation banner.
 *
 * Covers:
 *   - allCatPills derivation from _categories (multi-category and single-category tasks)
 *   - Primary pill is always first; secondaries follow in order
 *   - Only known catColor categories are included
 *   - Explanation banner visibility: shown when any task has >1 category, hidden otherwise
 *   - Explanation banner is not shown when all tasks are single-category
 *   - Integration with buildPriorityTasks: _categories populated correctly
 *
 * Run: node __tests__/action-plan-category-pills.mjs
 */

import assert from 'node:assert/strict';

// ─── Inline helpers (match production logic exactly) ─────────────────────────

const catColor = { Performance: '#7948f6', SEO: '#3687fa', Security: '#19b987', Accessibility: '#efa642' };
const catBg    = { Performance: '#f4f0ff', SEO: '#eef4ff', Security: '#edfaf5', Accessibility: '#fff8ed' };

/**
 * Derives the ordered category pills for a FixCard task.
 * Matches the production logic in FixCard.
 */
function deriveAllCatPills(issue) {
  if (Array.isArray(issue._categories) && issue._categories.length > 1) {
    return issue._categories.filter(c => catColor[c]);
  }
  const cat = (issue.area || 'Performance').replace(/best.practices?/i, 'Performance');
  return [cat].filter(c => catColor[c]);
}

/**
 * Returns true if the explanation banner should be shown for a given priorities array.
 * Matches the production condition.
 */
function shouldShowExplanation(priorities) {
  return priorities.some(t => Array.isArray(t._categories) && t._categories.length > 1);
}

// ─── Inline buildPriorityTasks (matches production) ──────────────────────────

function buildPriorityTasks(issues, recommendations) {
  const SEV_ORDER = { critical: 0, warning: 1, info: 2, good: 3 };
  const recs = Array.isArray(recommendations) ? recommendations : [];
  const coveredFps = new Set();
  const tasks = [];

  for (const rec of recs) {
    const findings = Array.isArray(rec.supporting_findings) ? rec.supporting_findings : [];
    let topSeverity = 'info';
    for (const f of findings) {
      if ((SEV_ORDER[f.severity] ?? 99) < (SEV_ORDER[topSeverity] ?? 99)) topSeverity = f.severity;
    }
    if (topSeverity !== 'critical' && topSeverity !== 'warning') continue;

    if (Array.isArray(rec.finding_fingerprints)) {
      for (const fp of rec.finding_fingerprints) coveredFps.add(fp);
    }
    for (const f of findings) {
      const fp = f.fingerprintId || f.fingerprint || '';
      if (fp) coveredFps.add(fp);
    }

    const repFinding = findings
      .filter(f => f.severity === 'critical' || f.severity === 'warning')
      .sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99))[0]
      || findings[0] || null;

    const repFindingFp = repFinding?.fingerprintId || repFinding?.canonicalFingerprintId || null;

    const recCategory = rec.category || null;
    const findingCategories = [...new Set(findings.map(f => f.area || f.source || '').filter(Boolean))];
    const primaryCategory = recCategory || findingCategories[0] || 'Performance';
    const allCategories = recCategory
      ? [recCategory, ...findingCategories.filter(c => c !== recCategory)]
      : findingCategories;

    tasks.push({
      fingerprintId:      repFindingFp,
      severity:           topSeverity,
      message:            rec.title || (repFinding?.message ?? ''),
      area:               primaryCategory,
      _recFingerprint:    rec.fingerprint,
      _categories:        allCategories,
      _rec:               rec,
      _isRecLevelContext: true,
    });
  }

  for (const issue of issues) {
    if (issue.severity !== 'critical' && issue.severity !== 'warning') continue;
    const fp = issue.fingerprintId || issue.fingerprint || '';
    const cid = issue.canonicalFingerprintId || fp;
    if (coveredFps.has(fp) || coveredFps.has(cid)) continue;
    tasks.push({ ...issue, _recFingerprint: null, _categories: null, _rec: null });
  }

  tasks.sort((a, b) => {
    const sevDiff = (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    const PRIO = { critical: 0, high: 1, medium: 2, low: 3 };
    return (PRIO[a._rec?.priority || 'medium'] ?? 2) - (PRIO[b._rec?.priority || 'medium'] ?? 2);
  });
  return tasks.slice(0, 7);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// 1. Multi-category task: pills derived from _categories, primary first
{
  const task = {
    area: 'Accessibility',
    _categories: ['Accessibility', 'SEO'],
  };
  const pills = deriveAllCatPills(task);
  assert.deepEqual(pills, ['Accessibility', 'SEO'],
    'multi-category task: Accessibility should be first (rec.category), SEO second');
  console.log('✓ 1: multi-category pills — primary first, secondary after');
}

// 2. Single-category task: only one pill, derived from area
{
  const task = { area: 'Performance', _categories: null };
  const pills = deriveAllCatPills(task);
  assert.deepEqual(pills, ['Performance'],
    'single-category task: only the primary area pill');
  console.log('✓ 2: single-category task — one pill');
}

// 3. Single-category with _categories of length 1: still one pill
{
  const task = { area: 'SEO', _categories: ['SEO'] };
  const pills = deriveAllCatPills(task);
  assert.deepEqual(pills, ['SEO'],
    '_categories.length === 1 → single pill');
  console.log('✓ 3: _categories length 1 — one pill, not duplicated');
}

// 4. Unknown/unmapped categories are filtered out
{
  const task = {
    area: 'Accessibility',
    _categories: ['Accessibility', 'UnknownCategory', 'SEO'],
  };
  const pills = deriveAllCatPills(task);
  assert.deepEqual(pills, ['Accessibility', 'SEO'],
    'unknown categories not in catColor must be filtered out');
  console.log('✓ 4: unknown categories filtered from pills');
}

// 5. Ordering: rec.category is always first regardless of _categories array order
{
  // Simulate a case where SEO would appear first if we just took _categories[0]
  // but rec.category is Accessibility — buildPriorityTasks puts rec.category first.
  const task = {
    area: 'Accessibility',          // area = primaryCategory = rec.category
    _categories: ['Accessibility', 'SEO'],
  };
  const pills = deriveAllCatPills(task);
  assert.equal(pills[0], 'Accessibility', 'primary (rec.category) must be pills[0]');
  assert.equal(pills[1], 'SEO',           'secondary must be pills[1]');
  console.log('✓ 5: rec.category is always pills[0]');
}

// 6. Explanation banner shown when any task has multiple categories
{
  const priorities = [
    { area: 'Performance', _categories: ['Performance'] },
    { area: 'Accessibility', _categories: ['Accessibility', 'SEO'] },
  ];
  assert.equal(shouldShowExplanation(priorities), true,
    'banner should show when at least one task has >1 category');
  console.log('✓ 6: banner shown when at least one multi-category task present');
}

// 7. Explanation banner hidden when all tasks are single-category
{
  const priorities = [
    { area: 'Performance', _categories: ['Performance'] },
    { area: 'SEO', _categories: ['SEO'] },
    { area: 'Security', _categories: null },   // ungrouped (no _categories)
  ];
  assert.equal(shouldShowExplanation(priorities), false,
    'banner should NOT show when all tasks are single-category or ungrouped');
  console.log('✓ 7: banner hidden when all tasks are single-category or ungrouped');
}

// 8. Explanation banner hidden when priorities is empty
{
  assert.equal(shouldShowExplanation([]), false,
    'banner should NOT show when priorities is empty');
  console.log('✓ 8: banner hidden when priorities is empty');
}

// 9. Ungrouped findings have no _categories — not counted for banner
{
  const priorities = [
    { area: 'Security', _categories: null, _recFingerprint: null },
    { area: 'Performance', _categories: null, _recFingerprint: null },
  ];
  assert.equal(shouldShowExplanation(priorities), false,
    'ungrouped findings with _categories: null must not trigger banner');
  console.log('✓ 9: ungrouped findings (_categories: null) do not trigger banner');
}

// 10. Integration: buildPriorityTasks produces correct _categories for mixed-source rec
{
  const findings = [
    { fingerprintId: 'a11y:images_missing_alt', severity: 'critical', area: 'Accessibility', source: 'a11y', items: [] },
    { fingerprintId: 'seo:images_missing_alt',  severity: 'critical', area: 'SEO',           source: 'seo',  items: [] },
  ];
  const accessibilityRec = {
    fingerprint: 'accessibility-barriers',
    title: 'Fix accessibility barriers',
    category: 'Accessibility',
    priority: 'high',
    supporting_findings: findings,
    finding_fingerprints: findings.map(f => f.fingerprintId),
  };
  const tasks = buildPriorityTasks([], [accessibilityRec]);
  assert.equal(tasks.length, 1);
  const t = tasks[0];

  const pills = deriveAllCatPills(t);
  assert.equal(pills[0], 'Accessibility', 'primary pill must be Accessibility (rec.category)');
  assert.equal(pills[1], 'SEO',           'secondary pill must be SEO');
  assert.equal(shouldShowExplanation(tasks), true,
    'banner should be shown for this report (has multi-category task)');
  console.log('✓ 10: integration — accessibility-barriers rec produces correct pills and triggers banner');
}

// 11. Integration: single-source rec does NOT trigger banner
{
  const findings = [
    { fingerprintId: 'lh:render-blocking', severity: 'critical', area: 'Performance', source: 'lh', items: [] },
    { fingerprintId: 'lh:font-display',    severity: 'warning',  area: 'Performance', source: 'lh', items: [] },
  ];
  const perfRec = {
    fingerprint: 'js-overhead',
    title: 'Reduce JavaScript overhead',
    category: 'Performance',
    priority: 'medium',
    supporting_findings: findings,
    finding_fingerprints: findings.map(f => f.fingerprintId),
  };
  const tasks = buildPriorityTasks([], [perfRec]);
  assert.equal(tasks.length, 1);
  const pills = deriveAllCatPills(tasks[0]);
  assert.deepEqual(pills, ['Performance'], 'single-source Performance rec: one pill only');
  assert.equal(shouldShowExplanation(tasks), false,
    'single-source rec should NOT trigger banner');
  console.log('✓ 11: single-source rec — one pill, no banner');
}

// 12. catBg values are defined for all catColor keys
{
  for (const cat of Object.keys(catColor)) {
    assert.ok(catBg[cat], `catBg must define a background for category: ${cat}`);
  }
  console.log('✓ 12: catBg defined for all catColor keys');
}

console.log('\n✅ All action-plan-category-pills tests passed.');
