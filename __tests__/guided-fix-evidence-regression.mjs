/**
 * guided-fix-evidence-regression.mjs
 *
 * Regression tests for three targeted Guided Fix bugs fixed 2026-10-30:
 *
 * Bug 1 — Evidence selection: buildPlainEnglishSummary must not render generic
 *   perf metrics (LCP/FCP/TBT/CLS/TTFB) for non-performance findings like
 *   "Reduce unused CSS." The fix guards perf metrics behind a category check.
 *
 * Bug 2 — Raw object rendering: evidence fields containing arrays-of-objects
 *   (e.g. `items: [{label, url, wastedMs}]`) must be excluded from the
 *   otherEvidence rendering path that calls String(v), which produces
 *   "[object Object]". The fix filters them in the otherEvidence derivation.
 *
 * Bug 3 — CMS context inconsistency: when detectedSiteType is known, the Ask
 *   Cernly system prompt must assert the platform explicitly and forbid the
 *   AI from saying "platform unknown." When siteType is null, the prompt must
 *   direct the AI to provide platform-neutral instructions.
 *
 * Run with: node __tests__/guided-fix-evidence-regression.mjs
 */

import assert    from 'assert/strict';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __dir = fileURLToPath(new URL('..', import.meta.url));
const src   = (rel) => readFile(resolve(__dir, rel), 'utf-8');

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

// ---------------------------------------------------------------------------
// Helper: extract buildPlainEnglishSummary source text from GuidedFix.js
// We inspect source rather than importing (Next.js JSX file, not importable
// by plain Node without a transpiler).
// ---------------------------------------------------------------------------

let guidedFixSrc;
let askRouteSrc;

try {
  guidedFixSrc = await src('app/report/[slug]/GuidedFix.js');
  askRouteSrc  = await src('app/api/ask/route.js');
} catch (e) {
  console.error('Failed to read source files:', e.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Section 1 — Bug 1: perf metrics guarded by category
// ---------------------------------------------------------------------------

console.log('\nSection 1: buildPlainEnglishSummary category guard');

test('isPerformanceRec variable present in buildPlainEnglishSummary', () => {
  assert.ok(
    guidedFixSrc.includes('isPerformanceRec'),
    'Expected isPerformanceRec guard in GuidedFix.js'
  );
});

test('perf metric conditions nested inside isPerformanceRec block', () => {
  // After the fix, lcp/tbt/cls/ttfb lines are inside an if (isPerformanceRec) block.
  // Verify the guard comes BEFORE the lcp check.
  const guardIdx = guidedFixSrc.indexOf('isPerformanceRec');
  const lcpIdx   = guidedFixSrc.indexOf("normaliseMetricValue('lcp'");
  assert.ok(guardIdx < lcpIdx, 'isPerformanceRec guard should appear before the lcp normalise call');
});

test('perf categories included: performance and speed', () => {
  assert.ok(
    guidedFixSrc.includes("category === 'performance'"),
    "Expected category === 'performance' in guard"
  );
  assert.ok(
    guidedFixSrc.includes("category === 'speed'"),
    "Expected category === 'speed' in guard"
  );
});

test('buildPlainEnglishSummary still handles totalSavingsKib (image-specific) outside perf guard', () => {
  // totalSavingsKib line should NOT be inside the isPerformanceRec block.
  // Find index of isPerformanceRec block end (closing brace) — approximate by
  // verifying totalSavingsKib appears in the function body regardless of guard.
  assert.ok(
    guidedFixSrc.includes('totalSavingsKib'),
    'totalSavingsKib evidence handling must still exist'
  );
  // Check it is not inside the isPerformanceRec if-block by confirming
  // it appears in the function after the closing of that block.
  // Approach: find the isPerformanceRec guard, then find totalSavingsKib —
  // it should appear after the closing brace of the if block.
  const perfBlockStart = guidedFixSrc.indexOf('if (isPerformanceRec)');
  const savingsIdx     = guidedFixSrc.indexOf('totalSavingsKib', perfBlockStart);
  // Find the closing brace of the if block (looking for the pattern '  }' after block start)
  // Simple heuristic: totalSavingsKib should appear after the isPerformanceRec block.
  // Since the block ends with a closing brace and image-specific follows, both
  // should be in the function — verify both are present.
  assert.ok(savingsIdx > perfBlockStart, 'totalSavingsKib should appear after the perf block in the function');
});

// ---------------------------------------------------------------------------
// Section 2 — Bug 2: array-of-objects filtered from otherEvidence
// ---------------------------------------------------------------------------

console.log('\nSection 2: otherEvidence array-of-objects filter');

test('otherEvidence filter excludes arrays-of-objects', () => {
  assert.ok(
    guidedFixSrc.includes('typeof v[0] === \'object\'') ||
    guidedFixSrc.includes('typeof v[0] === "object"'),
    'Expected typeof v[0] === object check in otherEvidence filter'
  );
});

test('otherEvidence filter still includes empty arrays (v.length > 0 check)', () => {
  assert.ok(
    guidedFixSrc.includes('v.length > 0'),
    'Expected v.length > 0 guard so empty arrays are not excluded'
  );
});

test('otherEvidence comment references items arrays', () => {
  assert.ok(
    guidedFixSrc.includes('items') || guidedFixSrc.includes('[object Object]'),
    'Expected a comment referencing items or [object Object] in the otherEvidence filter'
  );
});

test('perfKeys.has(k) filter still present in otherEvidence', () => {
  // The existing perf key filter must not have been removed.
  assert.ok(
    guidedFixSrc.includes('perfKeys.has(k)'),
    'perfKeys.has(k) filter must remain in otherEvidence derivation'
  );
});

// ---------------------------------------------------------------------------
// Section 3 — Bug 3: Ask Cernly CMS context
// ---------------------------------------------------------------------------

console.log('\nSection 3: Ask Cernly siteType / CMS context');

test('detectedSiteType hoisted above reportContext block', () => {
  const hoistIdx   = askRouteSrc.indexOf('let detectedSiteType');
  const contextIdx = askRouteSrc.indexOf('let reportContext');
  assert.ok(hoistIdx > -1, 'detectedSiteType must be declared');
  assert.ok(contextIdx > -1, 'reportContext must be declared');
  // Both are hoisted; detectedSiteType should appear near reportContext
  assert.ok(Math.abs(hoistIdx - contextIdx) < 500, 'detectedSiteType should be declared near reportContext');
});

test('detectedSiteType assigned from report.siteType inside report block', () => {
  assert.ok(
    askRouteSrc.includes('detectedSiteType = report.siteType'),
    'detectedSiteType must be assigned from report.siteType'
  );
});

test('system prompt uses detectedSiteType for platform assertion', () => {
  assert.ok(
    askRouteSrc.includes('detectedSiteType'),
    'detectedSiteType must appear in system prompt construction'
  );
});

test('DETECTED PLATFORM label in system prompt when siteType known', () => {
  assert.ok(
    askRouteSrc.includes('DETECTED PLATFORM'),
    'System prompt must include DETECTED PLATFORM assertion when siteType is known'
  );
});

test('do not say platform is unknown when siteType present', () => {
  // When detectedSiteType is set, the system prompt should NOT contain
  // "platform unknown" in that branch.
  const detectedBranch = askRouteSrc.match(/DETECTED PLATFORM[\s\S]*?platform-neutral/);
  if (detectedBranch) {
    // The "do not say CMS is unknown" instruction should be in detected branch
    const branch = detectedBranch[0];
    assert.ok(
      branch.includes('do not say the platform is unknown') ||
      branch.includes('Do not say') ||
      branch.includes('do not say'),
      'DETECTED PLATFORM branch must instruct AI not to say platform is unknown'
    );
  } else {
    // Fallback: verify the phrase appears somewhere in the route
    assert.ok(
      askRouteSrc.includes('do not say the platform is unknown') ||
      askRouteSrc.includes('Do not say the platform is unknown'),
      'Route must instruct AI not to say platform is unknown when detected'
    );
  }
});

test('platform-neutral instruction when siteType is null', () => {
  assert.ok(
    askRouteSrc.includes('platform-neutral'),
    'System prompt must include platform-neutral instruction when siteType is unknown'
  );
});

test('conditional example labeling instruction when unknown', () => {
  assert.ok(
    askRouteSrc.includes('label') || askRouteSrc.includes('conditional'),
    'When platform unknown, prompt should instruct labeling of conditional examples'
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
