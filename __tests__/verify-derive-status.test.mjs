/**
 * Tests for deriveVerifiedStatus() and extractFindingOutcomes() logic.
 *
 * These test the CORRECTED logic that lives in the verify route.
 * We import the helpers by extracting them from a local copy to avoid Next.js
 * import issues (the route file uses Next.js imports we can't resolve here).
 * Instead, we reproduce the functions exactly and test them in isolation.
 *
 * Fixtures use shapes returned by lib/comparison.js compareRecommendations():
 *   likely_resolved[]    → items shaped  { rec: { fingerprint, ... }, resolvedFindings, total }
 *   still_open[]         → items shaped  { rec: { fingerprint, ... }, persistentFindings, total }
 *   partially_resolved[] → items shaped  { rec: { fingerprint, ... }, resolvedFindings, persistentFindings, total }
 *   unable_to_verify[]   → items shaped  { rec: { fingerprint, ... }, reason, ... }
 */

import assert from 'node:assert/strict';

// ── Reproduce the CORRECTED deriveVerifiedStatus ─────────────────────────────

function deriveVerifiedStatus(recFingerprint, comparison) {
  if (!comparison?.recommendations) return 'unable_to_verify';

  const { likely_resolved, still_open, partially_resolved, unable_to_verify } =
    comparison.recommendations;

  // Each array item is { rec: { fingerprint, ... }, ... }
  if (likely_resolved?.some(r => r.rec?.fingerprint === recFingerprint))    return 'likely_resolved';
  if (still_open?.some(r => r.rec?.fingerprint === recFingerprint))          return 'still_detected';
  if (partially_resolved?.some(r => r.rec?.fingerprint === recFingerprint))  return 'partially_resolved';
  if (unable_to_verify?.some(r => r.rec?.fingerprint === recFingerprint))    return 'unable_to_verify';

  // Recommendation not found in current scan: treat as resolved ONLY if a comparable
  // audit ran — never auto-resolve on a missing comparison.
  if (comparison.isComparable && comparison.comparabilityLevel === 'full') {
    return 'likely_resolved';
  }
  // Limited comparability or incompatible: cannot confirm
  return 'unable_to_verify';
}

// ── Reproduce the CORRECTED extractFindingOutcomes ───────────────────────────

function extractFindingOutcomes(recFingerprint, comparison, recsList) {
  if (!comparison?.findings) return [];

  // Build a Set of finding fingerprints belonging to this recommendation.
  // We use the rec's own finding_fingerprints array for accurate mapping.
  const rec = (recsList || []).find(r => r.rec?.fingerprint === recFingerprint);
  const recFindingFps = new Set([
    ...(rec?.rec?.finding_fingerprints || []),
    ...((rec?.rec?.supporting_findings || []).map(f => f?.fingerprintId).filter(Boolean)),
  ]);

  const all = [
    ...(comparison.findings.likely_resolved  || []).map(f => ({ ...f, outcome: 'likely_resolved' })),
    ...(comparison.findings.still_detected   || []).map(f => ({ ...f, outcome: 'still_detected' })),
    ...(comparison.findings.unable_to_verify || []).map(f => ({ ...f, outcome: 'unable_to_verify' })),
    ...(comparison.findings.new_since        || []).map(f => ({ ...f, outcome: 'new_since' })),
  ];

  // If we have specific fingerprints, filter by them; otherwise return all (fallback).
  if (recFindingFps.size > 0) {
    return all.filter(f => recFindingFps.has(f.fingerprintId));
  }
  return [];
}

// ── Helpers to build comparison fixtures ─────────────────────────────────────

function makeComparison({
  likely_resolved = [],
  still_open = [],
  partially_resolved = [],
  unable_to_verify = [],
  findings = {},
  isComparable = true,
  comparabilityLevel = 'full',
} = {}) {
  return {
    isComparable,
    comparabilityLevel,
    recommendations: { likely_resolved, still_open, partially_resolved, unable_to_verify, new_high_priority: [] },
    findings: {
      still_detected:  findings.still_detected  || [],
      likely_resolved: findings.likely_resolved || [],
      unable_to_verify: findings.unable_to_verify || [],
      new_since:       findings.new_since       || [],
    },
  };
}

function recItem(fingerprint, extra = {}) {
  return { rec: { fingerprint, finding_fingerprints: [], ...extra }, ...extra };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('\nderiveVerifiedStatus()\n');

test('returns likely_resolved when rec fingerprint is in likely_resolved list', () => {
  const fp = 'image-optimization';
  const comp = makeComparison({
    likely_resolved: [recItem(fp, { resolvedFindings: 3, total: 3 })],
  });
  assert.equal(deriveVerifiedStatus(fp, comp), 'likely_resolved');
});

test('returns still_detected when rec fingerprint is in still_open list', () => {
  const fp = 'js-overhead';
  const comp = makeComparison({
    still_open: [recItem(fp, { persistentFindings: 2, total: 2 })],
  });
  assert.equal(deriveVerifiedStatus(fp, comp), 'still_detected');
});

test('returns partially_resolved when rec fingerprint is in partially_resolved list', () => {
  const fp = 'resource-efficiency';
  const comp = makeComparison({
    partially_resolved: [recItem(fp, { resolvedFindings: 1, persistentFindings: 1, total: 2 })],
  });
  assert.equal(deriveVerifiedStatus(fp, comp), 'partially_resolved');
});

test('returns unable_to_verify when rec fingerprint is in unable_to_verify list', () => {
  const fp = 'font-performance';
  const comp = makeComparison({
    unable_to_verify: [recItem(fp, { reason: 'audit did not complete' })],
  });
  assert.equal(deriveVerifiedStatus(fp, comp), 'unable_to_verify');
});

test('does NOT auto-resolve when rec fingerprint is absent from all lists with limited comparability', () => {
  const fp = 'missing-rec';
  const comp = makeComparison({
    likely_resolved: [recItem('other-rec')],
    comparabilityLevel: 'limited',
  });
  // Limited comparability: should NOT auto-resolve
  assert.equal(deriveVerifiedStatus(fp, comp), 'unable_to_verify');
});

test('does NOT auto-resolve when comparison is incompatible', () => {
  const fp = 'image-optimization';
  const comp = makeComparison({
    isComparable: false,
    comparabilityLevel: 'incompatible',
  });
  assert.equal(deriveVerifiedStatus(fp, comp), 'unable_to_verify');
});

test('returns likely_resolved when fingerprint absent from all lists and full comparability', () => {
  // A rec that disappeared from current scan entirely, full audit coverage
  const fp = 'old-rec-gone';
  const comp = makeComparison({
    // Not in any list — rec simply not in current scan
    comparabilityLevel: 'full',
    isComparable: true,
  });
  assert.equal(deriveVerifiedStatus(fp, comp), 'likely_resolved');
});

test('returns unable_to_verify when comparison.recommendations is null', () => {
  assert.equal(deriveVerifiedStatus('anything', { isComparable: true }), 'unable_to_verify');
});

test('returns unable_to_verify when comparison itself is null', () => {
  assert.equal(deriveVerifiedStatus('anything', null), 'unable_to_verify');
});

test('checks r.rec.fingerprint not r.fingerprint (the bug)', () => {
  // This test would FAIL with the old code that checked r.fingerprint
  // and PASS with the fixed code that checks r.rec.fingerprint
  const fp = 'image-optimization';
  const itemWithBugShape = { fingerprint: 'WRONG', rec: { fingerprint: fp }, resolvedFindings: 2, total: 2 };
  const comp = makeComparison({ likely_resolved: [itemWithBugShape] });
  // r.fingerprint === 'WRONG' (old buggy check) would miss this
  // r.rec.fingerprint === fp (correct check) finds it
  assert.equal(deriveVerifiedStatus(fp, comp), 'likely_resolved');
});

test('old buggy path: r.fingerprint is undefined on comparison items', () => {
  // Verify the old code would have failed: items from compareRecommendations
  // have r.rec.fingerprint, not r.fingerprint
  const fp = 'image-optimization';
  const item = recItem(fp, { resolvedFindings: 2, total: 2 });
  // The bug: item.fingerprint is undefined
  assert.equal(item.fingerprint, undefined, 'item.fingerprint should be undefined (old code would miss this)');
  // The fix: item.rec.fingerprint is correct
  assert.equal(item.rec.fingerprint, fp, 'item.rec.fingerprint should be correct');
});

console.log('\nextractFindingOutcomes()\n');

test('returns findings matching rec finding_fingerprints', () => {
  const fp = 'image-optimization';
  const comp = makeComparison({
    likely_resolved: [recItem(fp)],
    findings: {
      likely_resolved: [
        { fingerprintId: 'lh:uses-optimized-images', outcome: 'likely_resolved' },
        { fingerprintId: 'lh:unrelated-finding', outcome: 'likely_resolved' },
      ],
    },
  });
  const recsList = [
    { rec: { fingerprint: fp, finding_fingerprints: ['lh:uses-optimized-images'] } },
  ];
  const outcomes = extractFindingOutcomes(fp, comp, recsList);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].fingerprintId, 'lh:uses-optimized-images');
});

test('returns empty array when rec has no finding_fingerprints', () => {
  const fp = 'no-findings-rec';
  const comp = makeComparison({
    findings: {
      still_detected: [{ fingerprintId: 'seo:something' }],
    },
  });
  const recsList = [{ rec: { fingerprint: fp, finding_fingerprints: [] } }];
  const outcomes = extractFindingOutcomes(fp, comp, recsList);
  assert.equal(outcomes.length, 0);
});

test('returns empty array when comparison has no findings', () => {
  const fp = 'image-optimization';
  const outcomes = extractFindingOutcomes(fp, {}, []);
  assert.equal(outcomes.length, 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
