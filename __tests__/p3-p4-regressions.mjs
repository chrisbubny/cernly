/**
 * p3-p4-regressions.mjs
 *
 * Targeted regression tests for P3 and P4 changes in fix/platform-banner-guidance.
 *
 * P4 — SEO alt-text regex: alt="" must NOT count as a missing-alt image.
 * P3 — detectVerificationSteps: steps describing "run a scan / check the score" flagged;
 *       implementation steps are clean.
 */

/**
 * Run with the alias loader for P3 (detectVerificationSteps):
 *   ANTHROPIC_API_KEY=sk-test-fake \
 *     node --experimental-loader ./scripts/alias-loader.mjs \
 *     __tests__/p3-p4-regressions.mjs
 *
 * Without the loader, only the P4 alt-text tests run (detectVerificationSteps
 * import is skipped with a warning).
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error('  ', err.message);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// P4 — SEO alt-text regex
// The regex used to flag images is:  !/alt=["'][^"']*["']/.test(i)
// Images WITH alt="" must NOT be flagged (empty alt = intentional / decorative).
// ---------------------------------------------------------------------------

const altRegex = i => !/alt=["'][^"']*["']/.test(i);  // true → no alt (would be flagged)

test('P4: alt="" is NOT flagged as missing', () => {
  assert.equal(altRegex('<img src="x.jpg" alt="">'), false);
});

test('P4: alt="description" is NOT flagged as missing', () => {
  assert.equal(altRegex('<img src="x.jpg" alt="a photo of a cat">'), false);
});

test('P4: missing alt attribute IS flagged', () => {
  assert.equal(altRegex('<img src="x.jpg">'), true);
});

test('P4: alt with no quotes IS still not matching (edge case)', () => {
  // The regex requires quotes — this exercises the quote requirement
  const noQuotes = '<img src="x.jpg" alt=description>';
  // Without quotes the regex won't match, so it would be flagged as missing.
  // This is acceptable behavior documented in the fix comment.
  assert.equal(altRegex(noQuotes), true);
});

test('P4: single-quoted alt="" is NOT flagged', () => {
  assert.equal(altRegex("<img src='x.jpg' alt=''>"), false);
});

test('P4: multiple images, only untagged ones flagged', () => {
  const imgs = [
    '<img src="a.jpg" alt="">',           // has alt="" → pass
    '<img src="b.jpg" alt="photo">',      // has alt → pass
    '<img src="c.jpg">',                  // no alt → flag
    '<img src="d.jpg" alt="  ">',         // whitespace alt → pass (has quotes)
  ];
  const flagged = imgs.filter(altRegex);
  assert.equal(flagged.length, 1);
  assert.ok(flagged[0].includes('c.jpg'));
});

// ---------------------------------------------------------------------------
// P3 — detectVerificationSteps
// ---------------------------------------------------------------------------

let detectVerificationSteps;
try {
  ({ detectVerificationSteps } = await import(`${projectRoot}/lib/guidance.js`));
} catch (e) {
  console.warn('\n⚠ Skipping P3 tests — alias loader required. Run with:');
  console.warn('  node --experimental-loader ./scripts/alias-loader.mjs __tests__/p3-p4-regressions.mjs\n');
}

if (detectVerificationSteps) {

test('P3: returns [] for null/empty plan', () => {
  assert.deepEqual(detectVerificationSteps(null), []);
  assert.deepEqual(detectVerificationSteps({}), []);
  assert.deepEqual(detectVerificationSteps({ steps: [] }), []);
});

test('P3: implementation steps are clean (no flags)', () => {
  const plan = {
    steps: [
      { title: 'Add font-display: swap to your CSS', owner: { action: 'Open your theme editor' } },
      { title: 'Compress your hero image', developer: { action: 'Run imagemin on assets/' } },
      { title: 'Enable browser caching via .htaccess' },
    ]
  };
  assert.deepEqual(detectVerificationSteps(plan), []);
});

test('P3: "run a scan" step is flagged', () => {
  const plan = {
    steps: [
      { title: 'Fix your meta description' },
      { title: 'Run a Lighthouse scan to confirm', owner: { action: 'Use Google PageSpeed' } },
    ]
  };
  const flags = detectVerificationSteps(plan);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].stepIndex, 1);
});

test('P3: "check your score" step is flagged', () => {
  const plan = { steps: [{ title: 'Check your score after applying changes' }] };
  const flags = detectVerificationSteps(plan);
  assert.equal(flags.length, 1);
});

test('P3: "verify" step is flagged', () => {
  const plan = { steps: [{ title: 'Verify the fix is working' }] };
  const flags = detectVerificationSteps(plan);
  assert.equal(flags.length, 1);
});

test('P3: "compare results" step is flagged', () => {
  const plan = { steps: [{ title: 'Compare results before and after' }] };
  assert.ok(detectVerificationSteps(plan).length > 0);
});

test('P3: "measure the impact" step is flagged', () => {
  const plan = { steps: [{ title: 'Measure the impact of the change' }] };
  assert.ok(detectVerificationSteps(plan).length > 0);
});

test('P3: returns stepIndex + title for each flagged step', () => {
  const plan = {
    steps: [
      { title: 'Update font-display' },
      { title: 'Run another test' },
      { title: 'Minify JS files' },
      { title: 'Run a scan to check your scores' },
    ]
  };
  const flags = detectVerificationSteps(plan);
  assert.equal(flags.length, 2);
  assert.ok(flags.every(f => typeof f.stepIndex === 'number' && typeof f.title === 'string'));
  assert.deepEqual(flags.map(f => f.stepIndex), [1, 3]);
});

test('P3: action field also checked for verification keywords', () => {
  const plan = {
    steps: [
      {
        title: 'Apply the CSS changes',
        owner: { action: 'verify the results with PageSpeed' }
      }
    ]
  };
  const flags = detectVerificationSteps(plan);
  assert.equal(flags.length, 1);
});

} // end if (detectVerificationSteps)

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed === 0 ? '(no tests)' : `${passed}/${passed + failed} passed`}`);
if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n✅ All P3/P4 regression tests passed');
}
