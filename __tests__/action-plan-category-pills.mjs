/**
 * Tests for Action Plan category display (plain-text, simplified).
 *
 * Covers:
 *   - catText derivation: categories joined with · for multi-category tasks
 *   - isMultiCat flag: true only when >1 known category
 *   - Only known categories (KNOWN_CATS) are included
 *   - Primary category (rec.category / _categories[0]) is always first
 *   - Single-category tasks: catText equals that one category, isMultiCat false
 *   - Unknown categories filtered out
 *   - best-practices normalisation → Performance
 *   - Integration with buildPriorityTasks: _categories populated correctly
 *
 * Run: node __tests__/action-plan-category-pills.mjs
 */

import assert from 'node:assert/strict';

// ─── Inline helpers (match production logic exactly) ─────────────────────────

const KNOWN_CATS = new Set(['Performance', 'SEO', 'Security', 'Accessibility']);

/**
 * Derives catText and isMultiCat for a FixCard task.
 * Matches the production logic in FixCard.
 */
function deriveCatDisplay(issue) {
  const cat = (issue.area || 'Performance').replace(/best.practices?/i, 'Performance');
  const catLabels = Array.isArray(issue._categories) && issue._categories.length > 1
    ? issue._categories.filter(c => KNOWN_CATS.has(c))
    : [cat].filter(c => KNOWN_CATS.has(c));
  return {
    catText:    catLabels.join(' · '),
    isMultiCat: catLabels.length > 1,
  };
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

// 1. Multi-category task: catText joined with ·, primary first
{
  const { catText, isMultiCat } = deriveCatDisplay({
    area: 'Accessibility',
    _categories: ['Accessibility', 'SEO'],
  });
  assert.equal(catText, 'Accessibility · SEO');
  assert.equal(isMultiCat, true);
  console.log('✓ 1: multi-category — catText joined with ·, isMultiCat true');
}

// 2. Single-category task: catText is just that category, no dot, isMultiCat false
{
  const { catText, isMultiCat } = deriveCatDisplay({ area: 'Performance', _categories: null });
  assert.equal(catText, 'Performance');
  assert.equal(isMultiCat, false);
  console.log('✓ 2: single-category — catText is plain name, isMultiCat false');
}

// 3. _categories of length 1: still a single pill, isMultiCat false
{
  const { catText, isMultiCat } = deriveCatDisplay({ area: 'SEO', _categories: ['SEO'] });
  assert.equal(catText, 'SEO');
  assert.equal(isMultiCat, false);
  console.log('✓ 3: _categories length 1 — single text, isMultiCat false');
}

// 4. Unknown categories are filtered out of catText
{
  const { catText, isMultiCat } = deriveCatDisplay({
    area: 'Accessibility',
    _categories: ['Accessibility', 'UnknownCategory', 'SEO'],
  });
  assert.equal(catText, 'Accessibility · SEO');
  assert.equal(isMultiCat, true);
  console.log('✓ 4: unknown categories filtered from catText');
}

// 5. All unknown categories → catText falls back to area, isMultiCat false
{
  const { catText, isMultiCat } = deriveCatDisplay({
    area: 'Performance',
    _categories: ['UnknownA', 'UnknownB'],
  });
  // _categories has length > 1 but all filtered → catLabels.length 0
  // then join of empty array is ''
  assert.equal(catText, '');
  assert.equal(isMultiCat, false);
  console.log('✓ 5: all-unknown _categories → empty catText, isMultiCat false');
}

// 6. best-practices area normalised to Performance
{
  const { catText } = deriveCatDisplay({ area: 'best-practices', _categories: null });
  assert.equal(catText, 'Performance');
  console.log('✓ 6: best-practices area → normalised to Performance');
}

// 7. Ordering: rec.category (_categories[0]) is always first in catText
{
  const { catText } = deriveCatDisplay({
    area: 'Accessibility',
    _categories: ['Accessibility', 'SEO'],
  });
  assert.equal(catText.startsWith('Accessibility'), true,
    'primary (rec.category) must come first');
  console.log('✓ 7: rec.category is first in catText');
}

// 8. No explanation banner logic — banner removed; only isMultiCat drives info icon
{
  // isMultiCat is per-task; there is no priorities-level banner check any more.
  // Verify the per-task flag is independently accurate.
  const tasks = [
    { area: 'Performance', _categories: ['Performance'] },
    { area: 'Accessibility', _categories: ['Accessibility', 'SEO'] },
  ];
  const flags = tasks.map(t => deriveCatDisplay(t).isMultiCat);
  assert.deepEqual(flags, [false, true]);
  console.log('✓ 8: isMultiCat correct per-task; no priorities-level banner');
}

// 9. Ungrouped findings (_categories: null) → isMultiCat false
{
  const { isMultiCat } = deriveCatDisplay({ area: 'Security', _categories: null });
  assert.equal(isMultiCat, false);
  console.log('✓ 9: ungrouped finding (_categories: null) → isMultiCat false');
}

// 10. Integration: mixed-source rec produces correct catText via buildPriorityTasks
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

  const { catText, isMultiCat } = deriveCatDisplay(tasks[0]);
  assert.equal(catText, 'Accessibility · SEO');
  assert.equal(isMultiCat, true);
  console.log('✓ 10: integration — mixed-source rec → catText "Accessibility · SEO", isMultiCat true');
}

// 11. Integration: single-source rec → plain catText, isMultiCat false
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
  const { catText, isMultiCat } = deriveCatDisplay(tasks[0]);
  assert.equal(catText, 'Performance');
  assert.equal(isMultiCat, false);
  console.log('✓ 11: single-source rec → "Performance", isMultiCat false');
}

// 12. Three-category rec: catText includes all three in order
{
  const findings = [
    { fingerprintId: 'lh:render-blocking', severity: 'critical', area: 'Performance',   source: 'lh',   items: [] },
    { fingerprintId: 'a11y:contrast',      severity: 'warning',  area: 'Accessibility', source: 'a11y', items: [] },
    { fingerprintId: 'seo:meta',           severity: 'warning',  area: 'SEO',           source: 'seo',  items: [] },
  ];
  const rec = {
    fingerprint: 'cross-category',
    title: 'Cross-category fix',
    category: 'Performance',
    priority: 'high',
    supporting_findings: findings,
    finding_fingerprints: findings.map(f => f.fingerprintId),
  };
  const tasks = buildPriorityTasks([], [rec]);
  const { catText, isMultiCat } = deriveCatDisplay(tasks[0]);
  assert.equal(catText, 'Performance · Accessibility · SEO');
  assert.equal(isMultiCat, true);
  console.log('✓ 12: three-category rec → "Performance · Accessibility · SEO"');
}

console.log('\n✅ All action-plan-category-pills tests passed.');
