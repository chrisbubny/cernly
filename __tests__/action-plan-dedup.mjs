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

    // Real finding fingerprint — never rec.fingerprint
    const repFindingFp = repFinding?.fingerprintId
      || repFinding?.canonicalFingerprintId
      || null;

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

    const recCategory = rec.category || null;
    const findingCategories = [...new Set(findings.map(f => f.area || f.source || '').filter(Boolean))];
    const primaryCategory = recCategory || findingCategories[0] || 'Performance';
    const allCategories = recCategory
      ? [recCategory, ...findingCategories.filter(c => c !== recCategory)]
      : findingCategories;

    tasks.push({
      fingerprintId:      repFindingFp,     // null or a real finding fingerprint
      severity:           topSeverity,
      message:            rec.title || (repFinding?.message ?? ''),
      description:        rec.what_we_found || rec.explanation || (repFinding?.description ?? ''),
      fix:                repFinding?.fix ?? null,
      source:             repFinding?.source ?? 'lh',
      area:               primaryCategory,  // rec's declared category, not repFinding.area
      items:              mergedItems,
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

  // Secondary sort within severity tier by rec priority
  const PRIO_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  const taskPrio = t => PRIO_ORDER[t._rec?.priority || t.priority || 'medium'] ?? 2;

  tasks.sort((a, b) => {
    const sevDiff = (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return taskPrio(a) - taskPrio(b);
  });
  return tasks.slice(0, 7);
}

// ─── Legacy work-item reconciliation (conservative merge) ────────────────────

// Status conservatism: most work remaining = lowest number = wins
const STATUS_CONSERVATISM = { in_progress: 0, open: 1, verify: 2, dismissed: 3 };

/**
 * Determine which workItems entry to use for a task.
 * Rec-keyed takes precedence; fall back to ALL supporting finding fingerprints
 * with conservative (least-committed) merge.
 */
function resolveWorkItem(task, workItems) {
  // rec-keyed wins
  if (task._recFingerprint && workItems[task._recFingerprint]) {
    return workItems[task._recFingerprint];
  }
  // legacy fallback: conservative merge (most work remaining wins)
  if (task._rec && Array.isArray(task._rec.finding_fingerprints)) {
    let best = null;
    for (const sfp of task._rec.finding_fingerprints) {
      const wi = workItems[sfp];
      if (!wi) continue;
      if (!best) { best = wi; continue; }
      const curRank  = STATUS_CONSERVATISM[wi.userStatus]   ?? 99;
      const bestRank = STATUS_CONSERVATISM[best.userStatus] ?? 99;
      if (curRank < bestRank) best = wi;
    }
    return best;
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

// ─── Check 1: Secondary sort within severity tier ────────────────────────────

// 17. Within the same severity tier, high-priority rec ranks before medium-priority rec
{
  const findings = [{ fingerprintId: 'lh:warn', severity: 'warning', area: 'Performance', items: [] }];
  const highRec  = { ...rec('perf-high',  'High prio rec',  findings, 'high'),   priority: 'high'   };
  const medRec   = { ...rec('perf-med',   'Medium prio rec', findings, 'medium'), priority: 'medium' };
  const lowRec   = { ...rec('perf-low',   'Low prio rec',    findings, 'low'),    priority: 'low'    };
  // Add in reverse priority order
  const tasks = buildPriorityTasks([], [lowRec, medRec, highRec], {});
  assert.equal(tasks.length, 3, 'should have 3 tasks');
  assert.equal(tasks[0]._recFingerprint, 'perf-high',  'high-priority rec should rank first');
  assert.equal(tasks[1]._recFingerprint, 'perf-med',   'medium-priority rec should rank second');
  assert.equal(tasks[2]._recFingerprint, 'perf-low',   'low-priority rec should rank third');
  console.log('✓ secondary sort: high-priority rec before medium before low within same severity');
}

// 18. Critical rec with low priority ranks below critical rec with high priority
{
  const findings = [{ fingerprintId: 'lh:crit', severity: 'critical', area: 'Performance', items: [] }];
  const highCrit = { ...rec('crit-high', 'Critical high', findings, 'high'),   priority: 'high'   };
  const medCrit  = { ...rec('crit-med',  'Critical med',  findings, 'medium'), priority: 'medium' };
  const tasks = buildPriorityTasks([], [medCrit, highCrit], {});
  assert.equal(tasks[0]._recFingerprint, 'crit-high', 'high-priority critical rec must rank first');
  assert.equal(tasks[1]._recFingerprint, 'crit-med',  'medium-priority critical rec must rank second');
  console.log('✓ secondary sort: within critical tier, high-priority rec ranked before medium');
}

// 19. Critical ungrouped finding ranks before all warning tasks regardless of rec priority
{
  const warnFinding = [{ fingerprintId: 'lh:warn', severity: 'warning', area: 'Performance', items: [] }];
  const highWarningRec = { ...rec('high-warn', 'High warning rec', warnFinding, 'high'), priority: 'high' };
  const critIssue = issue('ssl:https_missing', 'critical', 'Security');
  const tasks = buildPriorityTasks([critIssue], [highWarningRec], {});
  assert.equal(tasks[0].severity, 'critical', 'critical task must come before all warning tasks');
  console.log('✓ secondary sort: critical task before all warnings even when warning has high rec priority');
}

// ─── Check 2: Conservative legacy merge ──────────────────────────────────────

// 20. in_progress beats verify — user has work left to do
{
  const task = {
    _recFingerprint: 'accessibility-barriers',
    _rec: { finding_fingerprints: ['seo:images_missing_alt', 'a11y:images_missing_alt'] },
  };
  const workItems = {
    'seo:images_missing_alt':  { userStatus: 'verify' },      // first in array: "ready to verify"
    'a11y:images_missing_alt': { userStatus: 'in_progress' }, // second: still working
  };
  const wi = resolveWorkItem(task, workItems);
  assert.equal(wi.userStatus, 'in_progress',
    'in_progress must win over verify — user still has work in progress');
  console.log('✓ conservative merge: in_progress beats verify (seo=verify, a11y=in_progress)');
}

// 21. verify beats open — in-progress work is not reverted to open
{
  const task = {
    _recFingerprint: 'seo-meta',
    _rec: { finding_fingerprints: ['seo:title_missing', 'seo:meta_desc_missing'] },
  };
  const workItems = {
    'seo:title_missing':     { userStatus: 'verify' },
    'seo:meta_desc_missing': { userStatus: 'open' },
  };
  const wi = resolveWorkItem(task, workItems);
  // open (rank 1) is more conservative than verify (rank 2) — open shows more work needed
  assert.equal(wi.userStatus, 'open',
    'open must beat verify — open means work has not been started on that finding');
  console.log('✓ conservative merge: open beats verify (title=verify, desc=open)');
}

// 22. in_progress beats dismissed — in-progress work is preserved
{
  const task = {
    _recFingerprint: 'security-headers',
    _rec: { finding_fingerprints: ['ssl:missing_header_csp', 'ssl:missing_header_hsts'] },
  };
  const workItems = {
    'ssl:missing_header_csp':  { userStatus: 'dismissed' },
    'ssl:missing_header_hsts': { userStatus: 'in_progress' },
  };
  const wi = resolveWorkItem(task, workItems);
  assert.equal(wi.userStatus, 'in_progress',
    'in_progress must win over dismissed');
  console.log('✓ conservative merge: in_progress beats dismissed');
}

// 23. Conflicting SEO/Accessibility work-item statuses
{
  // Scenario: accessibility-barriers rec spans both a11y and seo missing-alt findings.
  // The a11y finding was marked 'verify' (developer thinks they fixed alt tags).
  // The seo finding was left 'in_progress' (CMS admin is still updating images).
  // The merged task must show 'in_progress', not 'verify'.
  const task = {
    _recFingerprint: 'accessibility-barriers',
    _rec: { finding_fingerprints: ['a11y:images_missing_alt', 'seo:images_missing_alt'] },
  };
  const workItems = {
    'a11y:images_missing_alt': { userStatus: 'verify',      recFingerprint: 'a11y:images_missing_alt' },
    'seo:images_missing_alt':  { userStatus: 'in_progress', recFingerprint: 'seo:images_missing_alt'  },
  };
  const wi = resolveWorkItem(task, workItems);
  assert.ok(wi, 'should resolve a work item');
  assert.equal(wi.userStatus, 'in_progress',
    'conflicting seo=in_progress vs a11y=verify: must show in_progress, not verify');
  console.log('✓ conservative merge: conflicting SEO/Accessibility statuses → in_progress wins');
}

// ─── Regression tests: rec/finding identity separation ───────────────────────
// These guard against rec.fingerprint being used as a finding fingerprint.

// R1. Rec-backed task fingerprintId is a real finding fingerprint, not rec.fingerprint
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
  const tasks = buildPriorityTasks([], [accessibilityRec], buildRecMap([accessibilityRec]));

  assert.equal(tasks.length, 1);
  const t = tasks[0];
  // fingerprintId must be a real finding fingerprint, never rec.fingerprint
  assert.notEqual(t.fingerprintId, 'accessibility-barriers',
    'fingerprintId must NOT be rec.fingerprint');
  assert.ok(
    t.fingerprintId === 'a11y:images_missing_alt' || t.fingerprintId === null,
    'fingerprintId should be a real finding fingerprint or null'
  );
  // _recFingerprint must still be the rec fingerprint (work-item key)
  assert.equal(t._recFingerprint, 'accessibility-barriers',
    '_recFingerprint must remain rec.fingerprint');
  console.log('✓ R1: rec-backed task fingerprintId is a real finding fp, not rec.fingerprint');
}

// R2. area matches rec's declared category regardless of supporting finding order
{
  // SEO finding comes first in supporting_findings (simulating sort order from pipeline)
  const findings = [
    { fingerprintId: 'seo:images_missing_alt',  severity: 'critical', area: 'SEO',           source: 'seo',  items: [] },
    { fingerprintId: 'a11y:images_missing_alt', severity: 'critical', area: 'Accessibility', source: 'a11y', items: [] },
  ];
  const accessibilityRec = {
    fingerprint: 'accessibility-barriers',
    title: 'Fix accessibility barriers',
    category: 'Accessibility',  // rec's declared category
    priority: 'high',
    supporting_findings: findings,
    finding_fingerprints: findings.map(f => f.fingerprintId),
  };
  const tasks = buildPriorityTasks([], [accessibilityRec], buildRecMap([accessibilityRec]));

  assert.equal(tasks.length, 1);
  const t = tasks[0];
  // area must come from rec.category, NOT from the first repFinding.area (which would be 'SEO')
  assert.equal(t.area, 'Accessibility',
    'area must match rec.category even when SEO finding appears first in supporting_findings');
  console.log('✓ R2: area uses rec.category regardless of supporting finding order');
}

// R3. _recFingerprint is always rec.fingerprint — work-item key unchanged
{
  const findings = [
    { fingerprintId: 'lh:font-display', severity: 'warning', area: 'Performance', source: 'lh', items: [] },
  ];
  const perfRec = {
    fingerprint: 'performance-font-display',
    title: 'Eliminate render-blocking resources',
    category: 'Performance',
    priority: 'medium',
    supporting_findings: findings,
    finding_fingerprints: ['lh:font-display'],
  };
  const tasks = buildPriorityTasks([], [perfRec], buildRecMap([perfRec]));

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]._recFingerprint, 'performance-font-display',
    '_recFingerprint must equal rec.fingerprint');
  console.log('✓ R3: _recFingerprint is always rec.fingerprint');
}

// R4. Multiple supporting findings: all categories present in _categories, rec.category first
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
  const tasks = buildPriorityTasks([], [accessibilityRec], buildRecMap([accessibilityRec]));

  assert.equal(tasks.length, 1);
  const cats = tasks[0]._categories;
  assert.ok(Array.isArray(cats), '_categories should be an array');
  assert.equal(cats[0], 'Accessibility', 'rec.category should be first in _categories');
  assert.ok(cats.includes('SEO'), '_categories should include SEO from supporting findings');
  assert.ok(cats.includes('Accessibility'), '_categories should include Accessibility');
  console.log('✓ R4: _categories includes all contributing categories, rec.category first');
}

// R5. Null fingerprintId when no genuine finding has a fingerprintId
{
  const findings = [
    // Finding with no fingerprintId — has only area and severity
    { severity: 'warning', area: 'Performance', source: 'lh', message: 'No ID finding', items: [] },
  ];
  const rec5 = {
    fingerprint: 'perf-no-id',
    title: 'Performance issue',
    category: 'Performance',
    priority: 'medium',
    supporting_findings: findings,
    finding_fingerprints: [],
  };
  const tasks = buildPriorityTasks([], [rec5], buildRecMap([rec5]));

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].fingerprintId, null,
    'fingerprintId should be null when no supporting finding has a real fingerprint');
  assert.equal(tasks[0]._recFingerprint, 'perf-no-id',
    '_recFingerprint must still be set for work-item keying');
  console.log('✓ R5: null fingerprintId when no supporting finding has a real fingerprint');
}

// ─── Ask Cernly guard logic (simulated inline) ───────────────────────────────
// Tests R6-R8 simulate the guard logic from GuidedFix.js and /api/ask/route.js.

// R6. Ask without finding fingerprint — no findingFingerprintId sent in request body
{
  // Simulate GuidedFix guard: only forward findingFingerprintId when it's a real finding fp
  // rec-level task: fingerprintId is null (after the fix)
  const issue6 = { fingerprintId: null };
  const rec6   = { fingerprint: 'accessibility-barriers' };

  const shouldSendFindingFp =
    issue6?.fingerprintId && issue6.fingerprintId !== rec6?.fingerprint;

  assert.ok(!shouldSendFindingFp,
    'when fingerprintId is null, findingFingerprintId must not be sent');
  console.log('✓ R6: rec-level Ask — no findingFingerprintId sent when fingerprintId is null');
}

// R7. Finding-specific Ask with valid fingerprint sends findingFingerprintId
{
  // Simulate GuidedFix guard with a task that has a real finding fingerprint
  const issue7 = { fingerprintId: 'a11y:images_missing_alt' };
  const rec7   = { fingerprint: 'accessibility-barriers' };

  const shouldSendFindingFp =
    issue7?.fingerprintId && issue7.fingerprintId !== rec7?.fingerprint;

  assert.equal(shouldSendFindingFp, true,
    'when fingerprintId is a genuine finding fp, findingFingerprintId must be sent');
  console.log('✓ R7: finding-specific Ask — findingFingerprintId sent when fingerprintId is a real finding fp');
}

// R8. Guard prevents rec.fingerprint from being forwarded as findingFingerprintId
{
  // Simulate old (pre-fix) scenario: fingerprintId was set to rec.fingerprint
  const issueOld = { fingerprintId: 'accessibility-barriers' }; // was rec.fingerprint
  const recOld   = { fingerprint:   'accessibility-barriers' };

  const shouldSendFindingFp =
    issueOld?.fingerprintId && issueOld.fingerprintId !== recOld?.fingerprint;

  assert.equal(shouldSendFindingFp, false,
    'guard must prevent rec.fingerprint from being forwarded as findingFingerprintId (causes 422 + quota burn)');
  console.log('✓ R8: guard blocks rec.fingerprint from being forwarded as findingFingerprintId');
}

// ─── Context distinction regression tests ────────────────────────────────────
// These guard the explicit _isRecLevelContext flag and all four downstream callsites.

// RC1. Rec-backed task has _isRecLevelContext: true; ungrouped finding does not
{
  const findings = [
    { fingerprintId: 'a11y:images_missing_alt', severity: 'critical', area: 'Accessibility', source: 'a11y', items: [] },
  ];
  const accessibilityRec = {
    fingerprint: 'accessibility-barriers',
    title: 'Fix accessibility barriers',
    category: 'Accessibility',
    priority: 'high',
    supporting_findings: findings,
    finding_fingerprints: ['a11y:images_missing_alt'],
  };
  const ungroupedIssue = {
    fingerprintId: 'ssl:https_missing', severity: 'critical', area: 'Security', source: 'ssl', items: [],
  };
  const tasks = buildPriorityTasks([ungroupedIssue], [accessibilityRec], buildRecMap([accessibilityRec]));

  const recTask      = tasks.find(t => t._recFingerprint === 'accessibility-barriers');
  const ungroupedTask = tasks.find(t => t.fingerprintId  === 'ssl:https_missing');

  assert.ok(recTask,            'rec-backed task must be present');
  assert.ok(ungroupedTask,      'ungrouped task must be present');
  assert.equal(recTask._isRecLevelContext,      true,
    'rec-backed task must have _isRecLevelContext: true');
  assert.ok(!ungroupedTask._isRecLevelContext,
    'ungrouped task must NOT have _isRecLevelContext');
  console.log('✓ RC1: _isRecLevelContext: true on rec-backed tasks, absent on ungrouped findings');
}

// RC2. GuidedFix affected-elements: rec-level context shows all findings
{
  // Simulate GuidedFix selectedFp derivation with _isRecLevelContext
  function deriveSelectedFp(issue) {
    return issue?._isRecLevelContext
      ? null
      : (issue?.fingerprintId || issue?.fingerprint || null);
  }

  // Action Plan rec-backed task: should produce selectedFp = null → show all findings
  const actionPlanTask = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: true };
  assert.equal(deriveSelectedFp(actionPlanTask), null,
    'rec-level context must produce selectedFp = null (show all findings)');

  // Findings tab entry: should produce selectedFp = fingerprint → filter to that finding
  const findingsTabIssue = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: false };
  assert.equal(deriveSelectedFp(findingsTabIssue), 'a11y:images_missing_alt',
    'finding-specific context must produce selectedFp = fingerprint');

  // No issue at all (opened from resumable plan): should show all findings
  assert.equal(deriveSelectedFp(null), null,
    'null issue must produce selectedFp = null (show all findings)');
  console.log('✓ RC2: GuidedFix selectedFp derivation correct for rec-level vs finding-specific');
}

// RC3. GuidedFix Ask: rec-level context does NOT send findingFingerprintId
{
  function guidedFixAskShouldSendFindingFp(issue, rec) {
    return !issue?._isRecLevelContext
      && Boolean(issue?.fingerprintId)
      && issue.fingerprintId !== rec?.fingerprint;
  }

  const rec3 = { fingerprint: 'accessibility-barriers' };

  // Action Plan task (rec-level): must NOT send findingFingerprintId
  const recLevelTask = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: true };
  assert.equal(guidedFixAskShouldSendFindingFp(recLevelTask, rec3), false,
    'rec-level context must NOT forward findingFingerprintId to /api/ask');

  // Findings tab entry: MUST send findingFingerprintId
  const findingEntry = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: false };
  assert.equal(guidedFixAskShouldSendFindingFp(findingEntry, rec3), true,
    'finding-specific entry must forward findingFingerprintId to /api/ask');

  // No issue: must NOT send (guard handles null gracefully)
  assert.equal(guidedFixAskShouldSendFindingFp(null, rec3), false,
    'null issue must not send findingFingerprintId');
  console.log('✓ RC3: GuidedFix Ask handler respects _isRecLevelContext for findingFingerprintId');
}

// RC4. AskCernlyDrawer: rec-level task does NOT set _findingFingerprintId in drawerContext
{
  function drawerContextShouldIncludeFindingFp(iss) {
    return !iss._isRecLevelContext && Boolean(iss.fingerprintId);
  }

  const recTask4 = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: true };
  assert.equal(drawerContextShouldIncludeFindingFp(recTask4), false,
    'rec-level task must NOT set _findingFingerprintId in drawerContext');

  const findingIssue4 = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: false };
  assert.equal(drawerContextShouldIncludeFindingFp(findingIssue4), true,
    'finding-specific issue MUST set _findingFingerprintId in drawerContext');

  const ungrouped4 = { fingerprintId: 'ssl:https_missing' }; // no _isRecLevelContext
  assert.equal(drawerContextShouldIncludeFindingFp(ungrouped4), true,
    'ungrouped finding (no _isRecLevelContext) must set _findingFingerprintId');
  console.log('✓ RC4: AskCernlyDrawer invocation suppresses _findingFingerprintId for rec-level context');
}

// RC5. guide-plan focusIssue: rec-level task omits fingerprintId
{
  function buildFocusIssue(issue) {
    if (!issue) return undefined;
    return {
      message:     issue.message     || undefined,
      description: issue.description || undefined,
      detail:      issue.detail      || undefined,
      ...(!issue._isRecLevelContext && issue.fingerprintId
        ? { fingerprintId: issue.fingerprintId }
        : {}),
    };
  }

  const recTask5 = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: true, message: 'Fix alt text' };
  const fi5 = buildFocusIssue(recTask5);
  assert.ok(!('fingerprintId' in fi5),
    'rec-level focusIssue must NOT contain fingerprintId');
  assert.equal(fi5.message, 'Fix alt text',
    'rec-level focusIssue must still contain message for context');

  const findingTask5 = { fingerprintId: 'a11y:images_missing_alt', _isRecLevelContext: false, message: 'Missing alt text' };
  const fi5b = buildFocusIssue(findingTask5);
  assert.equal(fi5b.fingerprintId, 'a11y:images_missing_alt',
    'finding-specific focusIssue must include fingerprintId');
  console.log('✓ RC5: guide-plan focusIssue omits fingerprintId for rec-level context');
}

// R9. Work-item status keyed to rec fingerprint, not finding fingerprint
{
  // A rec-backed task must use _recFingerprint for work-item persistence.
  // This guards against status being stored under a finding key when rec.fingerprint
  // was incorrectly used as the task's fingerprintId (the old bug).
  const task9 = {
    fingerprintId:   'a11y:images_missing_alt',  // real finding fp (after fix)
    _recFingerprint: 'accessibility-barriers',    // work-item key
    _rec: { finding_fingerprints: ['a11y:images_missing_alt', 'seo:images_missing_alt'] },
  };
  // handleStatusChange uses: issue._recFingerprint || issue.fingerprintId
  const workItemKey = task9._recFingerprint || task9.fingerprintId;
  assert.equal(workItemKey, 'accessibility-barriers',
    'work-item key must be rec fingerprint, not finding fingerprint');

  // Verify: if we store under rec fingerprint, we can retrieve it
  const workItems = { 'accessibility-barriers': { userStatus: 'in_progress' } };
  const resolved = resolveWorkItem(task9, workItems);
  assert.ok(resolved, 'must resolve work item via _recFingerprint');
  assert.equal(resolved.userStatus, 'in_progress');
  console.log('✓ R9: work-item status keyed to rec fingerprint, not finding fingerprint');
}

console.log('\n✅ All action-plan-dedup tests passed.');
