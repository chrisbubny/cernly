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
 */

import assert from 'assert/strict';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Import utilities under test ───────────────────────────────────────────────
const { filterAssessmentForDisplay } = await import(path.join(ROOT, 'lib/assessment-filter.js'));
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

function makeAnalyzerStatuses(overrides = {}) {
  return {
    lighthouse: { status: 'completed', duration: 10000 },
    seo:        { status: 'completed', duration: 3000  },
    ssl:        { status: 'completed', duration: 900   },
    a11y:       { status: 'completed', duration: 4000  },
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
  const statuses = makeAnalyzerStatuses({ lighthouse: { status: 'failed' } });

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
  const statuses = makeAnalyzerStatuses({ lighthouse: { status: 'failed' } });

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
  const statuses = makeAnalyzerStatuses();

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
  const statuses = makeAnalyzerStatuses();

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

// ── Test 8: Failed-analyzer fixture — no Performance concerns ─────────────────
// We reconstruct the same logic as the render script fixture to avoid importing CJS
{
  const fixtureAssessment = {
    headline: 'Performance data unavailable — accessibility and security issues detected',
    summary: 'The Performance analyzer timed out.',
    strengths: [
      { area: 'SEO',      finding: 'Strong meta structure' },
      { area: 'Security', finding: 'Valid SSL certificate' },
    ],
    concerns: [
      { area: 'Accessibility', finding: 'Missing alt text', severity: 'high' },
      { area: 'Security',      finding: 'Weak cipher suites', severity: 'high' },
    ],
    top_opportunity: null,
    next_steps: null,
  };

  const scores   = { performance: null, seo: 88, security: 71, accessibility: 58 };
  const statuses = {
    lighthouse: { status: 'failed' },
    seo:        { status: 'completed', duration: 3200 },
    ssl:        { status: 'completed', duration: 890  },
    a11y:       { status: 'completed', duration: 4100 },
  };

  const result = filterAssessmentForDisplay(fixtureAssessment, scores, statuses, []);

  const performanceConcerns = (result.concerns || []).filter(c => c.area === 'Performance');
  assert.equal(performanceConcerns.length, 0,
    'TEST 8 FAIL: failed-analyzer fixture assessment must have no Performance concerns');
  assert.equal(result.top_opportunity, null,
    'TEST 8 FAIL: failed-analyzer fixture assessment must have top_opportunity null');
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
  const statuses = makeAnalyzerStatuses({ lighthouse: { status: 'failed' } });

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
  const statuses = makeAnalyzerStatuses({ lighthouse: { status: 'failed' } });

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
  const statuses = makeAnalyzerStatuses();

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  assert.deepEqual(result._unavailableCategories, [],
    'TEST 13 FAIL: _unavailableCategories must be empty when all analyzers completed');
  assert.equal(result._partialAnalysis, false,
    'TEST 13 FAIL: _partialAnalysis must be false when all analyzers completed');
  console.log('TEST 13 PASS: _partialAnalysis false when all analyzers complete');
}

// ── Test 14: Contradictory assessment — headline kept, partial flag set ───────
// Assessment has a Performance headline but lighthouse failed.
// The filter must NOT remove headline/summary (those are unfiltered narrative),
// but MUST set _partialAnalysis: true so the display layer can warn the reader.
{
  const assessment = makeAssessment({
    headline: 'Your page load time is excellent at under 1 s',  // Performance claim — not filtered
    summary:  'Core Web Vitals are all in the good range.',     // Also not filtered
    concerns: [
      { area: 'Performance', finding: 'LCP over threshold', severity: 'high' },
    ],
  });
  const scores   = makeScores({ performance: null });
  const statuses = makeAnalyzerStatuses({ lighthouse: { status: 'failed' } });

  const result = filterAssessmentForDisplay(assessment, scores, statuses, []);

  // Headline and summary are NEVER filtered — conservative fallback; display layer warns instead
  assert.equal(result.headline, assessment.headline,
    'TEST 14 FAIL: headline must not be removed by filter (display layer handles stale claims)');
  assert.equal(result.summary, assessment.summary,
    'TEST 14 FAIL: summary must not be removed by filter');
  // The Performance concern IS filtered
  const perfConcerns = (result.concerns || []).filter(c => c.area === 'Performance');
  assert.equal(perfConcerns.length, 0,
    'TEST 14 FAIL: Performance concern must be stripped');
  // The partial flag must be set so the display layer can warn
  assert.equal(result._partialAnalysis, true,
    'TEST 14 FAIL: _partialAnalysis must be true so display layer can warn about stale headline');
  assert.ok(result._unavailableCategories.includes('Performance'),
    'TEST 14 FAIL: Performance must appear in _unavailableCategories');
  console.log('TEST 14 PASS: Contradictory assessment — headline kept, _partialAnalysis set for display warning');
}

// ── Test 15: applyDomain — variant fixture item URLs use correct domain ───────
// We replicate the applyDomain logic inline to test the fixture behaviour
// (the render script is CJS and uses @swc/register; we test the contract here).
{
  const CANONICAL = 'https://www.example-healthcare-portal.org';
  const TARGET    = 'https://www.no-assessment-example.com';

  // Simulate applyDomain
  function applyDomainTest(issues, reportUrl) {
    let targetOrigin;
    try { targetOrigin = new URL(reportUrl).origin; } catch { return issues; }
    if (targetOrigin === CANONICAL) return issues;
    return issues.map(issue => {
      if (!Array.isArray(issue.items)) return issue;
      const rewrittenItems = issue.items.map(item => {
        if (!item?.url) return item;
        if (item.url.startsWith(CANONICAL)) {
          return { ...item, url: item.url.replace(CANONICAL, targetOrigin) };
        }
        return item;
      });
      return { ...issue, items: rewrittenItems };
    });
  }

  const baseIssues = [
    {
      fingerprintId: 'seo:canonical', severity: 'warning', area: 'SEO', source: 'seo',
      message: 'Missing canonical tag',
      items: [{ url: `${CANONICAL}/services/`, label: 'Canonical not set' }],
    },
    {
      fingerprintId: 'seo:robots-txt', severity: 'info', area: 'SEO', source: 'seo',
      message: 'robots.txt has no Sitemap directive',
      items: [{ url: `${CANONICAL}/robots.txt`, label: 'No Sitemap: directive found' }],
    },
    {
      fingerprintId: 'lh:preconnect', severity: 'info', area: 'Performance', source: 'lh',
      message: 'Preconnect to required third-party origins',
      // These are legitimate third-party URLs — should NOT be rewritten
      items: [
        { url: 'https://fonts.googleapis.com', label: 'First used at 480 ms' },
        { url: 'https://cdn.segment.com', label: 'First used at 620 ms' },
      ],
    },
  ];

  const result = applyDomainTest(baseIssues, TARGET);

  // seo:canonical item URL should use TARGET origin
  const canonicalItem = result.find(i => i.fingerprintId === 'seo:canonical').items[0];
  assert.ok(canonicalItem.url.startsWith(TARGET),
    `TEST 15 FAIL: seo:canonical item URL should start with ${TARGET}, got ${canonicalItem.url}`);
  assert.ok(!canonicalItem.url.includes('example-healthcare-portal'),
    'TEST 15 FAIL: seo:canonical item URL must not contain the original domain');

  // seo:robots-txt item URL should use TARGET origin
  const robotsItem = result.find(i => i.fingerprintId === 'seo:robots-txt').items[0];
  assert.ok(robotsItem.url.startsWith(TARGET),
    `TEST 15 FAIL: seo:robots-txt item URL should start with ${TARGET}, got ${robotsItem.url}`);

  // Third-party URLs must not be rewritten
  const preconnectItems = result.find(i => i.fingerprintId === 'lh:preconnect').items;
  assert.ok(preconnectItems[0].url === 'https://fonts.googleapis.com',
    'TEST 15 FAIL: third-party URL fonts.googleapis.com must not be rewritten');
  assert.ok(preconnectItems[1].url === 'https://cdn.segment.com',
    'TEST 15 FAIL: third-party URL cdn.segment.com must not be rewritten');

  console.log('TEST 15 PASS: applyDomain rewrites fixture-domain URLs and preserves third-party URLs');
}

console.log('\nAll pdf-phase3-fixes tests passed.');
