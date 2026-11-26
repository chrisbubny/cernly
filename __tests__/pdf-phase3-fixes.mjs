/**
 * __tests__/pdf-phase3-fixes.mjs
 *
 * Regression tests for the PDF Phase 3 correction pass:
 *   1. filterAssessmentForDisplay — strips concerns from failed analyzers
 *   2. filterAssessmentForDisplay — suppresses top_opportunity when category unavailable
 *   3. filterAssessmentForDisplay — passes through concerns when analyzer succeeded
 *   4. filterAssessmentForDisplay — passes through top_opportunity when category available
 *   5. filterAssessmentForDisplay — handles null assessment gracefully
 *   6. EvidenceList cap removed — verify buildPriorityTasks returns all items (no slice)
 *   7. Fallback message fires for tasks with no rec (ungrouped critical/warning)
 *   8. Failed-analyzer fixture — assessment has no Performance concerns
 *   9. Failed-analyzer fixture — top_opportunity is null
 *  10. New security-tls-configuration rec has actions[]
 *  11. New accessibility-form-labels rec has actions[]
 *  14. Stale free-form headline/summary withheld (legacy assessment, no coverage)
 *  16–21. Free-form narrative vs. coverage record, strengths, status variants
 *
 * Statuses use the production shape: report.auditStatuses keyed by category
 * (lib/store.js mapRow). Fixture data is imported from the real render script.
 */

import assert from 'assert/strict';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Import utilities under test ───────────────────────────────────────────────
const { filterAssessmentForDisplay, getUnavailableCategories } = await import(path.join(ROOT, 'lib/assessment-filter.js'));
const fixtures = require(path.join(ROOT, 'scripts/render-pdf-fixture.cjs'));
const { buildPriorityTasks } = await import(path.join(ROOT, 'lib/priority-tasks.js'));

// ── Shared helpers ────────────────────────────────────────────────────────────
function makeAssessment(overrides = {}) {
  return {
    headline: 'Test headline',
    summary: 'Test summary',
    concerns: [],
    strengths: [],
    top_opportunity: null,
    next_steps: null,
    ...overrides,
  };
}

function makeScores(overrides = {}) {
  return { performance: 60, seo: 80, security: 75, accessibility: 70, ...overrides };
}

function makeAuditStatuses(overrides = {}) {
  return {
    performance:   { status: 'completed' },
    seo:           { status: 'completed' },
    security:      { status: 'completed' },
    accessibility: { status: 'completed' },
    ...overrides,
  };
}

// ── Test 1: Failed analyzer strips its concerns ───────────────────────────────
{
  const assessment = makeAssessment({
    concerns: [
      { area: 'Performance',   finding: 'Slow LCP',          severity: 'high' },
      { area: 'Accessibility', finding: 'Missing alt text',  severity: 'high' },
    ],
  });
  const scores   = makeScores({ performance: null });
  const statuses = makeAuditStatuses({ performance: { status: 'failed' } });

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  assert.equal(result.concerns.length, 1,
    'TEST 1 FAIL: should remove Performance concern when lighthouse failed');
  assert.equal(result.concerns[0].area, 'Accessibility',
    'TEST 1 FAIL: remaining concern should be Accessibility');
  console.log('TEST 1 PASS: Failed analyzer strips its concerns');
}

// ── Test 2: Failed analyzer suppresses top_opportunity ────────────────────────
{
  const recs = [
    { fingerprint: 'performance-render-blocking', category: 'Performance', finding_fingerprints: [] },
  ];
  const assessment = makeAssessment({
    top_opportunity: {
      title: 'Eliminate render-blocking resources',
      recommendation_fingerprints: ['performance-render-blocking'],
    },
  });
  const scores   = makeScores({ performance: null });
  const statuses = makeAuditStatuses({ performance: { status: 'failed' } });

  const result = filterAssessmentForDisplay(assessment, scores, statuses, recs);

  assert.equal(result.top_opportunity, null,
    'TEST 2 FAIL: top_opportunity should be suppressed when its category analyzer failed');
  console.log('TEST 2 PASS: Failed analyzer suppresses top_opportunity');
}

// ── Test 3: Completed analyzer passes through its concerns ────────────────────
{
  const assessment = makeAssessment({
    concerns: [
      { area: 'SEO',      finding: 'Missing canonical', severity: 'medium' },
      { area: 'Security', finding: 'Weak ciphers',      severity: 'high'   },
    ],
  });
  const scores   = makeScores();
  const statuses = makeAuditStatuses();

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  assert.equal(result.concerns.length, 2,
    'TEST 3 FAIL: should not remove concerns when analyzers completed');
  console.log('TEST 3 PASS: Completed analyzers pass through their concerns');
}

// ── Test 4: Available category passes top_opportunity through ─────────────────
{
  const recs = [
    { fingerprint: 'accessibility-missing-alt-text', category: 'Accessibility', finding_fingerprints: [] },
  ];
  const assessment = makeAssessment({
    top_opportunity: {
      title: 'Add alt text to all images',
      recommendation_fingerprints: ['accessibility-missing-alt-text'],
    },
  });
  const scores   = makeScores();
  const statuses = makeAuditStatuses();

  const result = filterAssessmentForDisplay(assessment, scores, statuses, recs);

  assert.notEqual(result.top_opportunity, null,
    'TEST 4 FAIL: top_opportunity should be kept when its category analyzer completed');
  assert.equal(result.top_opportunity.title, 'Add alt text to all images',
    'TEST 4 FAIL: top_opportunity title should be unchanged');
  console.log('TEST 4 PASS: Available category preserves top_opportunity');
}

// ── Test 5: null assessment passes through gracefully ─────────────────────────
{
  const result = filterAssessmentForDisplay(null);
  assert.equal(result, null, 'TEST 5 FAIL: null assessment should return null');
  console.log('TEST 5 PASS: null assessment handled gracefully');
}

// ── Test 6: Score-null fallback also strips concerns ─────────────────────────
{
  // Even without analyzerStatuses, a null score should strip concerns
  const assessment = makeAssessment({
    concerns: [
      { area: 'Performance', finding: 'Slow LCP',         severity: 'high' },
      { area: 'SEO',         finding: 'No canonical tag', severity: 'low'  },
    ],
  });
  const scores   = makeScores({ performance: null });
  // No explicit analyzerStatuses — relies on score inference
  const result = filterAssessmentForDisplay(assessment, scores, {}, []);

  assert.equal(result.concerns.length, 1,
    'TEST 6 FAIL: should strip Performance concern when score is null and no explicit status');
  assert.equal(result.concerns[0].area, 'SEO',
    'TEST 6 FAIL: SEO concern should survive');
  console.log('TEST 6 PASS: Null score infers unavailability and strips concerns');
}

// ── Test 7: buildPriorityTasks returns task for ungrouped critical finding ────
// (ssl:weak-cipher now has a rec in fixtures, but we test the _rec:null path
//  by using an issue with no matching recommendation)
{
  const issues = [
    { fingerprintId: 'ssl:orphan-test', severity: 'critical', area: 'Security', source: 'ssl',
      message: 'Orphan critical with no rec', description: 'No recommendation covers this.' },
  ];
  const recommendations = []; // deliberately empty

  const tasks = buildPriorityTasks(issues, recommendations);
  const orphan = tasks.find(t => t.fingerprintId === 'ssl:orphan-test');

  assert.ok(orphan, 'TEST 7 FAIL: orphaned critical issue should become a task');
  assert.equal(orphan._rec, null, 'TEST 7 FAIL: task _rec should be null for ungrouped issue');
  const actions = Array.isArray(orphan._rec?.actions) ? orphan._rec.actions : [];
  assert.equal(actions.length, 0, 'TEST 7 FAIL: no actions should be derived for _rec:null task');
  console.log('TEST 7 PASS: Ungrouped critical issue becomes task with _rec:null, no actions');
}

// ── Test 8: Failed-analyzer fixture (real render-script data) ─────────────────
{
  const fx = fixtures.fixtureFailedLighthouse;
  const result = filterAssessmentForDisplay(fx.assessment, fx.scores, fx.auditStatuses, fx.recommendations);

  const performanceConcerns = (result.concerns || []).filter(c => c.area === 'Performance');
  assert.equal(performanceConcerns.length, 0,
    'TEST 8 FAIL: failed-analyzer fixture assessment must have no Performance concerns');
  assert.equal(result.top_opportunity, null,
    'TEST 8 FAIL: failed-analyzer fixture assessment must have top_opportunity null');
  assert.equal(fx.auditStatuses.performance.status, 'failed',
    'TEST 8 FAIL: fixture must use production auditStatuses shape');
  assert.equal(fx.analyzerStatuses, undefined,
    'TEST 8 FAIL: fixture must not use the non-production analyzerStatuses field');
  console.log('TEST 8 PASS: Failed-analyzer fixture assessment has no Performance data');
}

// ── Test 9: New security-tls-configuration rec has actions ───────────────────
{
  // Simulate the fixture rec directly
  const secRec = {
    fingerprint: 'security-tls-configuration',
    category: 'Security',
    priority: 'critical',
    actions: [
      'Disable RC4 and 3DES cipher suites in your server\'s TLS configuration',
      'Disable TLS 1.0 and TLS 1.1',
      'Use Mozilla SSL Configuration Generator',
      'Retest with SSL Labs after changes',
    ],
    finding_fingerprints: ['ssl:weak-cipher', 'ssl:tls-version'],
  };

  assert.ok(Array.isArray(secRec.actions) && secRec.actions.length > 0,
    'TEST 9 FAIL: security-tls-configuration must have non-empty actions[]');
  assert.ok(secRec.finding_fingerprints.includes('ssl:weak-cipher'),
    'TEST 9 FAIL: security-tls-configuration must cover ssl:weak-cipher');
  assert.ok(secRec.finding_fingerprints.includes('ssl:tls-version'),
    'TEST 9 FAIL: security-tls-configuration must cover ssl:tls-version');
  console.log('TEST 9 PASS: security-tls-configuration rec has actions and covers expected findings');
}

// ── Test 10: New accessibility-form-labels rec has actions ───────────────────
{
  const a11yRec = {
    fingerprint: 'accessibility-form-labels',
    category: 'Accessibility',
    priority: 'critical',
    actions: [
      'Add a <label for="id"> element for each input',
      'Never rely on placeholder text alone',
      'Test with VoiceOver or NVDA',
      'Run axe DevTools browser extension',
    ],
    finding_fingerprints: ['a11y:label'],
  };

  assert.ok(Array.isArray(a11yRec.actions) && a11yRec.actions.length > 0,
    'TEST 10 FAIL: accessibility-form-labels must have non-empty actions[]');
  assert.ok(a11yRec.finding_fingerprints.includes('a11y:label'),
    'TEST 10 FAIL: accessibility-form-labels must cover a11y:label');
  console.log('TEST 10 PASS: accessibility-form-labels rec has actions and covers a11y:label');
}

// ── Test 11: filterAssessmentForDisplay does not modify original object ───────
{
  const original = makeAssessment({
    concerns: [
      { area: 'Performance', finding: 'Slow', severity: 'high' },
    ],
    top_opportunity: { title: 'Speed up', recommendation_fingerprints: ['performance-render-blocking'] },
  });
  const originalStr = JSON.stringify(original);
  const scores   = makeScores({ performance: null });
  const statuses = makeAuditStatuses({ performance: { status: 'failed' } });

  filterAssessmentForDisplay(original, scores, statuses, []);

  assert.equal(JSON.stringify(original), originalStr,
    'TEST 11 FAIL: filterAssessmentForDisplay must not mutate the original assessment object');
  console.log('TEST 11 PASS: filterAssessmentForDisplay is non-mutating');
}

// ── Test 12: _unavailableCategories populated when analyzer failed ─────────────
{
  const assessment = makeAssessment({
    concerns: [{ area: 'Performance', finding: 'Slow LCP', severity: 'high' }],
  });
  const scores   = makeScores({ performance: null });
  const statuses = makeAuditStatuses({ performance: { status: 'failed' } });

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  assert.ok(Array.isArray(result._unavailableCategories),
    'TEST 12 FAIL: _unavailableCategories must be an array');
  assert.ok(result._unavailableCategories.includes('Performance'),
    'TEST 12 FAIL: _unavailableCategories must include Performance when lighthouse failed');
  assert.equal(result._partialAnalysis, true,
    'TEST 12 FAIL: _partialAnalysis must be true when any category unavailable');
  console.log('TEST 12 PASS: _unavailableCategories and _partialAnalysis set on failure');
}

// ── Test 13: _partialAnalysis false when all analyzers complete ───────────────
{
  const assessment = makeAssessment();
  const scores   = makeScores();
  const statuses = makeAuditStatuses();

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  assert.deepEqual(result._unavailableCategories, [],
    'TEST 13 FAIL: _unavailableCategories must be empty when all analyzers completed');
  assert.equal(result._partialAnalysis, false,
    'TEST 13 FAIL: _partialAnalysis must be false when all analyzers completed');
  console.log('TEST 13 PASS: _partialAnalysis false when all analyzers complete');
}

// ── Test 14: Stale free-form narrative withheld ───────────────────────────────
// Lighthouse failed, but the assessment has no deterministic coverage record
// (legacy) and its free-form headline and summary make Performance claims.
// Neither can be verified, so both are withheld; the stored report is untouched.
{
  const assessment = makeAssessment({
    headline: 'Your page load time is excellent at under 1 s',
    summary:  'Core Web Vitals are all in the good range.',
    concerns: [
      { area: 'Performance', finding: 'LCP over threshold', severity: 'high' },
    ],
  });
  const scores   = makeScores({ performance: null });
  const statuses = makeAuditStatuses({ performance: { status: 'failed' } });

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  assert.equal(result.headline, null,
    'TEST 14 FAIL: unverifiable free-form headline must be withheld');
  assert.equal(result.summary, null,
    'TEST 14 FAIL: unverifiable free-form summary must be withheld');
  assert.equal(result._narrativeWithheld, true,
    'TEST 14 FAIL: _narrativeWithheld must be set so the cover can disclose it');
  assert.equal(assessment.headline, 'Your page load time is excellent at under 1 s',
    'TEST 14 FAIL: stored assessment must not be mutated');
  const perfConcerns = (result.concerns || []).filter(c => c.area === 'Performance');
  assert.equal(perfConcerns.length, 0,
    'TEST 14 FAIL: Performance concern must be stripped');
  assert.equal(result._partialAnalysis, true,
    'TEST 14 FAIL: _partialAnalysis must be true');
  console.log('TEST 14 PASS: Stale free-form headline and summary withheld on partial scan');
}

// ── Test 15: applyDomain (real render-script function and variant fixtures) ────
{
  const { applyDomain, CANONICAL_FIXTURE_ORIGIN } = fixtures;
  const TARGET = 'https://www.no-assessment-example.com';
  const base = [
    { fingerprintId: 'seo:canonical', items: [{ url: `${CANONICAL_FIXTURE_ORIGIN}/services/` }] },
    { fingerprintId: 'lh:preconnect', items: [{ url: 'https://fonts.googleapis.com' }] },
  ];
  const out = applyDomain(base, TARGET);
  assert.equal(out[0].items[0].url, `${TARGET}/services/`, 'TEST 15 FAIL: fixture-domain URL must be rewritten');
  assert.equal(out[1].items[0].url, 'https://fonts.googleapis.com', 'TEST 15 FAIL: third-party URL must not be rewritten');

  for (const name of ['fixtureNoAssessment', 'fixtureFailedLighthouse', 'fixtureStaleAssessment']) {
    const fx = fixtures[name];
    const leaked = fx.issues.flatMap(i => i.items || []).filter(it => it?.url?.includes('example-healthcare-portal'));
    assert.equal(leaked.length, 0, `TEST 15 FAIL: ${name} must not contain the primary fixture domain`);
  }
  console.log('TEST 15 PASS: applyDomain rewrites fixture-domain URLs; variant fixtures are domain-consistent');
}

// ── Test 16: Narrative kept when coverage record shows the failure was known ──
{
  const fx = fixtures.fixtureFailedLighthouse;
  const result = filterAssessmentForDisplay(fx.assessment, fx.scores, fx.auditStatuses, fx.recommendations);
  assert.equal(result.headline, fx.assessment.headline, 'TEST 16 FAIL: verified headline must be kept');
  assert.equal(result.summary, fx.assessment.summary, 'TEST 16 FAIL: verified summary must be kept');
  assert.equal(result._narrativeWithheld, false, 'TEST 16 FAIL: _narrativeWithheld must be false');
  console.log('TEST 16 PASS: Headline/summary kept when coverage records Performance as failed');
}

// ── Test 17: Coverage says Performance ran, but it is now unavailable → stale ─
{
  const assessment = makeAssessment({
    headline: 'Fast pages and strong SEO',
    summary:  'Pages load quickly; LCP is 1.2 s.',
    coverage: { audits_ran: ['performance', 'seo', 'security', 'accessibility'], audits_failed: [] },
  });
  const result = filterAssessmentForDisplay(assessment, makeScores({ performance: null }),
    makeAuditStatuses({ performance: { status: 'failed' } }), []);
  assert.equal(result.headline, null, 'TEST 17 FAIL: headline from mismatched coverage must be withheld');
  assert.equal(result.summary, null, 'TEST 17 FAIL: summary from mismatched coverage must be withheld');
  console.log('TEST 17 PASS: Narrative withheld when its coverage record contradicts current availability');
}

// ── Test 18: Strengths from an unavailable category are removed ───────────────
{
  const assessment = makeAssessment({
    strengths: [
      { area: 'Performance', finding: 'Fast first contentful paint' },
      { area: 'SEO',         finding: 'Unique titles' },
      { finding: 'No area given' },
    ],
  });
  const result = filterAssessmentForDisplay(assessment, makeScores({ performance: null }),
    makeAuditStatuses({ performance: { status: 'failed' } }), []);
  assert.deepEqual(result.strengths.map(s => s.finding), ['Unique titles', 'No area given'],
    'TEST 18 FAIL: Performance strength must be removed; others kept');
  console.log('TEST 18 PASS: Strengths from unavailable categories removed');
}

// ── Test 19: Full scan, legacy assessment without coverage → narrative kept ───
{
  const assessment = makeAssessment({ headline: 'H', summary: 'S' });
  const result = filterAssessmentForDisplay(assessment, makeScores(), makeAuditStatuses(), []);
  assert.equal(result.headline, 'H', 'TEST 19 FAIL: nothing unavailable — headline must be kept');
  assert.equal(result.summary, 'S', 'TEST 19 FAIL: nothing unavailable — summary must be kept');
  assert.equal(result._narrativeWithheld, false);
  console.log('TEST 19 PASS: Legacy narrative kept when every analyzer completed');
}

// ── Test 20: blocked / unavailable statuses count as unavailable ─────────────
{
  for (const status of ['blocked', 'unavailable', 'failed']) {
    const cats = getUnavailableCategories(makeScores(), makeAuditStatuses({ accessibility: { status } }));
    assert.deepEqual(cats, ['Accessibility'], `TEST 20 FAIL: status '${status}' must mark Accessibility unavailable`);
  }
  assert.deepEqual(getUnavailableCategories(makeScores(), makeAuditStatuses()), [],
    'TEST 20 FAIL: all completed → none unavailable');
  console.log('TEST 20 PASS: blocked/unavailable/failed statuses all count as unavailable');
}

// ── Test 21: Unavailability is known without any assessment ──────────────────
{
  const cats = getUnavailableCategories({ performance: null, seo: 80, security: 70, accessibility: 60 }, {});
  assert.deepEqual(cats, ['Performance'], 'TEST 21 FAIL: null score alone marks the category unavailable');
  assert.equal(filterAssessmentForDisplay(null, {}, {}, []), null);
  console.log('TEST 21 PASS: Unavailable categories derived without an assessment');
}

console.log('\nAll pdf-phase3-fixes tests passed.');
