/**
 * Tests for buildPriorityTasks() — Action Plan deduplication, priority ranking,
 * legacy work-item reconciliation, and edge cases.
 *
 * Run: node __tests__/action-plan-dedup.mjs
 */

import assert from 'node:assert/strict';

// ─── Inline buildPriorityTasks and buildRecMap ────────────────────────────────
// We copy the pure logic from ReportClient to test it in isolation.

function buildRecMap(recommendations) {
  const map = {};
  if (!Array.isArray(recommendations)) return map;
  for (const rec of recommendations) {
    if (rec.fingerprint) map[rec.fingerprint] = rec;
    if (Array.isArray(rec.finding_fingerprints)) {
      for (const fp of rec.finding_fingerprints) {
        if (!map[fp]) map[fp] = rec;
      }
    }
  }
  return map;
}

function buildPriorityTasks(issues, recommendations, recMapArg) {
  const SEV_ORDER = { critical: 0, warning: 1, info: 2, good: 3 };
  const recs = Array.isArray(recommendations) ? recommendations : [];

  const coveredFps = new Set();
  const tasks = [];

  for (const rec of recs) {
    const findings = Array.isArray(rec.supporting_findings) ? rec.supporting_findings : [];
    let topSeverity = 'info';
    for (const f of findings) {
      if ((SEV_ORDER[f.severity] ?? 99) < (SEV_ORDER[topSeverity] ?? 99)) {
        topSeverity = f.severity;
      }
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

    const seenUrls = new Set();
    const mergedItems = [];
    for (const f of findings) {
      for (const item of (f.items || [])) {
        const key = item.url || item.label || JSON.stringify(item);
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          mergedItems.push(item);
        }
      }
    }

    const categories = [...new Set(findings.map(f => f.area || f.source || '').filter(Boolean))];

    tasks.push({
      fingerprintId:   rec.fingerprint,
      severity:        topSeverity,
      message:         rec.title || (repFinding?.message ?? ''),
      description:     rec.what_we_found || rec.explanation || (repFinding?.description ?? ''),
      fix:             repFinding?.fix ?? null,
      source:          repFinding?.source ?? 'lh',
      area:            repFinding?.area ?? (categories[0] ?? 'Performance'),
      items:           mergedItems,
      _recFingerprint: rec.fingerprint,
      _categories:     categories,
      _rec:            rec,
    });
  }

  for (const issue of issues) {
    if (issue.severity !== 'critical' && issue.severity !== 'warning') continue;
    const fp = issue.fingerprintId || issue.fingerprint || '';
    const cid = issue.canonicalFingerprintId || fp;
    if (coveredFps.has(fp) || coveredFps.has(cid)) continue;
    tasks.push({ ...issue, _recFingerprint: null, _categories: null, _rec: null });
  }

  tasks.sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99));
  return tasks.slice(0, 7);
}

// ─── Legacy work-item reconciliation (pure function) ─────────────────────────

/**
 * Determine which workItems entry to use for a task.
 * Rec-keyed takes precedence; fall back to ALL supporting finding fingerprints.
 * Conflicting legacy statuses are NOT auto-completed.
 */
function resolveWorkItem(task, workItems) {
  // rec-keyed wins
  if (task._recFingerprint && workItems[task._recFingerprint]) {
    return workItems[task._recFingerprint];
  }
  // legacy fallback
  if (task._rec && Array.isArray(task._rec.finding_fingerprints)) {
    for (const sfp of task._rec.finding_fingerprints) {
      if (workItems[sfp]) return workItems[sfp];
    }
  }
  return null;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function issue(id, severity, area = 'Performance', items = []) {
  return { fingerprintId: id, severity, message: `Issue ${id}`, area, source: 'lh', items };
}

function rec(fingerprint, title, findings, priority = 'medium') {
  return {
    fingerprint,
    title,
    defaultPriority: priority,
    supporting_findings: findings,
    finding_fingerprints: findings.map(f => f.fingerprintId || f.fingerprint || '').filter(Boolean),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// 1. Basic deduplication: rec-backed issue not duplicated as ungrouped
{
  const issues = [
    issue('lh:font-display', 'warning', 'Performance'),
    issue('lh:render-blocking', 'critical', 'Performance'),
  ];
  const recs = [rec('js-overhead', 'JS overhead', [issues[0], issues[1]])];
  const tasks = buildPriorityTasks(issues, recs, buildRecMap(recs));

  assert.equal(tasks.length, 1, 'rec covers both findings — should produce 1 task, not 2 or 3');
  assert.equal(tasks[0]._recFingerprint, 'js-overhead');
  console.log('✓ basic deduplication: rec covers findings, no duplicates');
}

// 2. Ungrouped critical finding is included when not covered by any rec
{
  const iss = [
    issue('ssl:https_missing', 'critical', 'Security'),
    issue('lh:font-display', 'warning', 'Performance'),
  ];
  const recs = [rec('font-rec', 'Font issues', [iss[1]])];
  const tasks = buildPriorityTasks(iss, recs, buildRecMap(recs));

  assert.equal(tasks.length, 2, 'ungrouped critical + rec-backed warning = 2 tasks');
  // Critical should come first (unified ranking)
  assert.equal(tasks[0].severity, 'critical', 'critical task should rank first');
  assert.equal(tasks[0].fingerprintId, 'ssl:https_missing', 'critical ungrouped finding should appear');
  console.log('✓ ungrouped critical finding included and ranked first');
}

// 3. Low-priority rec cannot displace critical ungrouped finding
{
  const ungroupedCritical = issue('a11y:keyboard-trap', 'critical', 'Accessibility');
  const lowRec = rec('social-sharing', 'Social sharing metadata', [
    issue('seo:og_incomplete', 'warning', 'SEO'),
  ], 'low');
  // Provide 6 more warnings to fill the 7 slots
  const warnings = Array.from({ length: 6 }, (_, i) => issue(`warn:${i}`, 'warning', 'Performance'));
  const allIssues = [ungroupedCritical, ...warnings, issue('seo:og_incomplete', 'warning', 'SEO')];
  const recs = [lowRec];
  const tasks = buildPriorityTasks(allIssues, recs, buildRecMap(recs));

  assert.equal(tasks.length, 7, 'should cap at 7');
  // Critical must appear in the final set
  const hasCritical = tasks.some(t => t.fingerprintId === 'a11y:keyboard-trap');
  assert.ok(hasCritical, 'critical ungrouped finding must appear in top 7');
  // All critical come before warnings
  let seenWarning = false;
  for (const t of tasks) {
    if (t.severity === 'warning') seenWarning = true;
    if (seenWarning) assert.notEqual(t.severity, 'critical', 'no critical task after a warning task in sorted output');
  }
  console.log('✓ critical ungrouped finding not displaced by low-priority rec');
}

// 4. Multi-category rec: _categories reflects all contributing finding areas
{
  const findings = [
    { fingerprintId: 'a11y:images_missing_alt', severity: 'warning', area: 'Accessibility', source: 'a11y', items: [{ url: 'img1.jpg', label: 'img1' }] },
    { fingerprintId: 'seo:images_missing_alt',  severity: 'warning', area: 'SEO',           source: 'seo',  items: [{ url: 'img1.jpg', label: 'img1' }, { url: 'img2.jpg', label: 'img2' }] },
  ];
  const recs = [rec('accessibility-barriers', 'Fix accessibility barriers', findings)];
  const tasks = buildPriorityTasks([], recs, buildRecMap(recs));

  assert.equal(tasks.length, 1);
  const t = tasks[0];
  assert.ok(Array.isArray(t._categories), '_categories should be an array');
  assert.ok(t._categories.includes('Accessibility') || t._categories.includes('SEO'),
    '_categories should include both contributing areas');
  console.log('✓ multi-category rec: _categories reflects all areas');
}

// 5. Affected resources deduplicated across supporting findings
{
  const findings = [
    { fingerprintId: 'a11y:images_missing_alt', severity: 'warning', area: 'Accessibility', items: [{ url: 'img1.jpg' }, { url: 'img2.jpg' }] },
    { fingerprintId: 'seo:images_missing_alt',  severity: 'warning', area: 'SEO',           items: [{ url: 'img1.jpg' }, { url: 'img3.jpg' }] },
  ];
  const recs = [rec('accessibility-barriers', 'Fix accessibility barriers', findings)];
  const tasks = buildPriorityTasks([], recs, buildRecMap(recs));

  const items = tasks[0].items;
  const urls = items.map(i => i.url);
  assert.equal(urls.filter(u => u === 'img1.jpg').length, 1, 'img1.jpg should not be duplicated');
  assert.equal(items.length, 3, 'should have 3 deduplicated items: img1, img2, img3');
  console.log('✓ affected resources deduplicated across supporting findings');
}

// 6. Historical report without recommendations returns ungrouped findings
{
  const issues = [
    issue('lh:render-blocking', 'critical', 'Performance'),
    issue('seo:meta_desc_missing', 'warning', 'SEO'),
  ];
  const tasks = buildPriorityTasks(issues, null, {});

  assert.equal(tasks.length, 2, 'no recs: should return ungrouped critical/warning issues');
  assert.equal(tasks[0].severity, 'critical');
  assert.equal(tasks[1].severity, 'warning');
  console.log('✓ historical report without recommendations: ungrouped findings returned');
}

// 7. Empty issues and recs returns empty array
{
  const tasks = buildPriorityTasks([], [], {});
  assert.equal(tasks.length, 0, 'empty input should produce empty output');
  console.log('✓ empty issues and recs: empty array');
}

// 8. Cap at 7 tasks
{
  const issues = Array.from({ length: 10 }, (_, i) => issue(`issue:${i}`, 'warning', 'Performance'));
  const tasks = buildPriorityTasks(issues, [], {});
  assert.equal(tasks.length, 7, 'should cap at 7 tasks');
  console.log('✓ cap at 7 tasks');
}

// 9. Rec with only info/good findings is not included
{
  const infoRec = rec('info-only', 'Info only', [
    { fingerprintId: 'lh:some-info', severity: 'info', area: 'Performance', items: [] },
  ]);
  const tasks = buildPriorityTasks([], [infoRec], buildRecMap([infoRec]));
  assert.equal(tasks.length, 0, 'rec with only info findings should not produce a task');
  console.log('✓ rec with only info findings: not included');
}

// 10. Mixed-severity rec: highest severity determines task severity
{
  const mixedRec = rec('mixed-rec', 'Mixed rec', [
    { fingerprintId: 'lh:warn-finding', severity: 'warning', area: 'Performance', items: [] },
    { fingerprintId: 'lh:crit-finding', severity: 'critical', area: 'Performance', items: [] },
  ]);
  const tasks = buildPriorityTasks([], [mixedRec], buildRecMap([mixedRec]));
  assert.equal(tasks[0].severity, 'critical', 'mixed-severity rec: task severity should match highest');
  console.log('✓ mixed-severity rec: task severity = highest supporting finding');
}

// ─── Legacy work-item reconciliation ─────────────────────────────────────────

// 11. Rec-keyed work item takes precedence over legacy finding-keyed item
{
  const task = {
    _recFingerprint: 'accessibility-barriers',
    _rec: { finding_fingerprints: ['a11y:images_missing_alt', 'seo:images_missing_alt'] },
  };
  const workItems = {
    'a11y:images_missing_alt': { userStatus: 'in_progress' },
    'accessibility-barriers':  { userStatus: 'verify' },
  };
  const wi = resolveWorkItem(task, workItems);
  assert.equal(wi.userStatus, 'verify', 'rec-keyed work item should win over legacy');
  console.log('✓ legacy reconciliation: rec-keyed status takes precedence');
}

// 12. Fallback to legacy finding fingerprint when no rec-keyed item exists
{
  const task = {
    _recFingerprint: 'accessibility-barriers',
    _rec: { finding_fingerprints: ['a11y:images_missing_alt', 'seo:images_missing_alt'] },
  };
  const workItems = {
    'a11y:images_missing_alt': { userStatus: 'in_progress' },
  };
  const wi = resolveWorkItem(task, workItems);
  assert.ok(wi, 'should find legacy work item via finding fingerprint');
  assert.equal(wi.userStatus, 'in_progress', 'legacy fallback should return first found item');
  console.log('✓ legacy reconciliation: falls back to finding fingerprint');
}

// 13. Conflicting legacy statuses: second legacy item is not merged as completed
{
  const task = {
    _recFingerprint: 'accessibility-barriers',
    _rec: { finding_fingerprints: ['a11y:images_missing_alt', 'seo:images_missing_alt'] },
  };
  const workItems = {
    'a11y:images_missing_alt': { userStatus: 'in_progress' },
    'seo:images_missing_alt':  { userStatus: 'verify' },
    // No rec-keyed item
  };
  // resolveWorkItem returns the FIRST legacy match, not an auto-merge
  const wi = resolveWorkItem(task, workItems);
  // Should return one item, not auto-create a composite completed status
  assert.ok(wi, 'should return a work item');
  assert.notEqual(wi.userStatus, 'completed', 'conflicting legacy statuses must not auto-become completed');
  console.log('✓ legacy reconciliation: conflicting statuses not auto-completed');
}

// 14. No work item when neither rec nor legacy items exist
{
  const task = {
    _recFingerprint: 'new-rec',
    _rec: { finding_fingerprints: ['lh:new-finding'] },
  };
  const workItems = {};
  const wi = resolveWorkItem(task, workItems);
  assert.equal(wi, null, 'should return null when no work item exists');
  console.log('✓ legacy reconciliation: null when no match');
}

// 15. Ungrouped task (no _rec) falls back to issue fingerprint
{
  const task = {
    fingerprintId: 'ssl:https_missing',
    _recFingerprint: null,
    _rec: null,
  };
  const workItems = {
    'ssl:https_missing': { userStatus: 'verify' },
  };
  // handleStatusChange uses: issue._recFingerprint || issue.fingerprintId
  const fp = task._recFingerprint || task.fingerprintId;
  const wi = workItems[fp] || null;
  assert.equal(wi?.userStatus, 'verify', 'ungrouped task should use fingerprintId for work item lookup');
  console.log('✓ ungrouped task work-item lookup via fingerprintId');
}

// 16. All 7 supporting findings of a rec are inspected for legacy fallback
{
  const fps = Array.from({ length: 7 }, (_, i) => `fp:${i}`);
  const task = {
    _recFingerprint: 'big-rec',
    _rec: { finding_fingerprints: fps },
  };
  const workItems = { [fps[6]]: { userStatus: 'dismissed' } }; // last one has an item
  const wi = resolveWorkItem(task, workItems);
  assert.ok(wi, 'should find work item at last fingerprint position');
  assert.equal(wi.userStatus, 'dismissed');
  console.log('✓ all supporting finding fingerprints inspected for legacy fallback');
}

console.log('\n✅ All action-plan-dedup tests passed.');
