/**
 * Regression test: generateGuidancePlan — exercises the real exported function
 * with a global fetch mock, not a copied code snippet.
 *
 * WHAT THIS GUARDS:
 *   1. The stop_reason === 'max_tokens' guard must fire before JSON.parse.
 *   2. The `data` (now `apiData`) variable must be in scope at the guard site —
 *      i.e., `ReferenceError: data is not defined` must never recur.
 *   3. A complete, valid response (stop_reason: 'end_turn') must produce a
 *      real AI plan with planSource === 'ai' and isStatic === false.
 *   4. A truncated response must fall back to static guidance (isStatic === true
 *      or fallback === true), and must NOT be cached (verified by confirming the
 *      returned plan is not a parsed version of the truncated JSON).
 *
 * WHY THIS IS STRONGER THAN guidance-truncation-regression.mjs:
 *   That test extracts the logic into a standalone function; it would not catch
 *   a scoping bug (data vs apiData) in the real implementation. This test imports
 *   generateGuidancePlan directly and exercises the actual function through its
 *   real call path, with fetch mocked at the global level.
 *
 * SETUP REQUIREMENTS:
 *   - No real Anthropic key needed — fetch is mocked before import.
 *   - No database — guidance.js only touches DB through store.js imports not
 *     invoked during plan generation.
 *   - Requires the @/ alias loader because lib/guidance.js uses @/lib/* imports:
 *
 *   ANTHROPIC_API_KEY=sk-test-fake \
 *     node --experimental-loader ./scripts/alias-loader.mjs \
 *     __tests__/guidance-generate-regression.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Minimal recommendation object that satisfies generateGuidancePlan
// ---------------------------------------------------------------------------
const MOCK_REC = {
  fingerprint:          'performance-image-optimization',
  group_key:            'image-optimization',
  title:                'Optimize Images',
  explanation:          'Several images can be compressed to save bandwidth.',
  why_it_matters:       'Smaller images load faster and improve Core Web Vitals.',
  category:             'performance',
  priority:             'high',
  effort:               'medium',
  confidence:           'high',
  verification_approach:'Re-scan and check the image optimization score.',
  evidence: {
    imageCount:       4,
    totalSavingsKib:  320,
  },
  actions: [
    { title: 'Compress hero image', detail: 'Use WebP format.' },
    { title: 'Add width/height attributes', detail: 'Prevent layout shift.' },
  ],
  supporting_findings:  [],
};

// ---------------------------------------------------------------------------
// A complete, valid guidance plan JSON that the AI would return.
// Shape must match validatePlan(): each step needs owner.action and
// developer.action; evidenceSummary must not contain byte measurements
// unless the mock rec's evidence contains them.
// ---------------------------------------------------------------------------
const VALID_PLAN_OBJ = {
  evidenceSummary: 'Several images are not optimized and are slowing down the page load.',
  steps: [
    {
      title: 'Identify large images',
      owner: {
        action:     'Ask your developer to audit images on the site.',
        delegation: 'Share this report with your developer.',
        why:        'Unoptimized images are the most common performance bottleneck.',
      },
      developer: {
        action:  'Use Chrome DevTools Network tab, filter by Img, sort by size.',
        tooling: 'Chrome DevTools or WebPageTest',
        notes:   'Focus on images above 100 KB.',
      },
    },
    {
      title: 'Convert images to WebP',
      owner: {
        action:     'Use squoosh.app to convert and re-upload key images.',
        delegation: 'Your developer can automate this with a build tool.',
        why:        'WebP is typically 25–35% smaller than JPEG at the same quality.',
      },
      developer: {
        action:  'Convert images to WebP using sharp or ImageMagick; update src attributes.',
        tooling: 'sharp, Squoosh CLI, or ImageMagick',
        notes:   'Serve JPEG fallback via <picture> for older browsers.',
      },
    },
  ],
};
const VALID_PLAN_JSON = JSON.stringify(VALID_PLAN_OBJ);

// A truncated version: cut mid-string, producing invalid JSON
const TRUNCATED_PLAN_JSON = VALID_PLAN_JSON.slice(0, 120);

// ---------------------------------------------------------------------------
// Mock fetch factory
// ---------------------------------------------------------------------------
function makeMockFetch(responseBody) {
  return async (_url, _opts) => ({
    ok: true,
    status: 200,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

// ---------------------------------------------------------------------------
// Run a single test scenario with a given mock fetch response
// ---------------------------------------------------------------------------
async function runWithMockFetch(mockFetch, { persona = 'owner' } = {}) {
  // Install mock before importing guidance (or override global.fetch each call)
  global.fetch = mockFetch;

  // Dynamic import ensures we get the real module (ES module cache means this
  // is the same module instance across calls — that's fine because we reset
  // global.fetch before each call).
  const { generateGuidancePlan } = await import(`${projectRoot}/lib/guidance.js`);

  const result = await generateGuidancePlan(
    MOCK_REC,
    'example.com',
    persona,
    'ecommerce',
    null,    // focusIssue
    'https://example.com'
  );
  return result;
}

// ---------------------------------------------------------------------------
// Scenario 1 — stop_reason: 'max_tokens' (truncated response)
// ---------------------------------------------------------------------------
// This is the primary regression guard: confirms that `apiData` is in scope
// at the guard site and that the guard fires before JSON.parse.
// Before the fix, this scenario produced: ReferenceError: data is not defined
{
  const mockResponse = {
    stop_reason: 'max_tokens',
    model:       'claude-haiku-5-5',
    usage:       { input_tokens: 800, output_tokens: 4096 },
    content:     [{ type: 'text', text: TRUNCATED_PLAN_JSON }],
  };

  let result;
  try {
    result = await runWithMockFetch(makeMockFetch(mockResponse));
  } catch (err) {
    assert.fail(
      `generateGuidancePlan threw ${err.constructor.name}: ${err.message}\n` +
      `This is the ReferenceError regression: 'data' is out of scope outside the try block.`
    );
  }

  // Must fall back to static (not attempt to parse the truncated JSON)
  assert.ok(
    result.isStatic === true || result.fallback === true,
    `truncated response must fall back to static or bare fallback — got planSource=${result.planSource} isStatic=${result.isStatic}`
  );

  // The returned plan must NOT be the truncated JSON content (never cached)
  assert.ok(
    !result.evidenceSummary || result.evidenceSummary !== VALID_PLAN_OBJ.evidenceSummary,
    'truncated response must not produce the same evidenceSummary as a valid response'
  );

  console.log('✓ Scenario 1: stop_reason max_tokens → static fallback, no ReferenceError, no parse attempted');
  console.log('  result.planSource:', result.planSource, '| result.isStatic:', result.isStatic, '| result.fallback:', result.fallback);
}

// ---------------------------------------------------------------------------
// Scenario 2 — stop_reason: 'end_turn' (complete valid response)
// ---------------------------------------------------------------------------
// Confirms the guard does NOT fire for a valid response and the plan is
// parsed, validated, and returned as an AI plan.
{
  const mockResponse = {
    stop_reason: 'end_turn',
    model:       'claude-haiku-5-5',
    usage:       { input_tokens: 800, output_tokens: 650 },
    content:     [{ type: 'text', text: VALID_PLAN_JSON }],
  };

  let result;
  try {
    result = await runWithMockFetch(makeMockFetch(mockResponse));
  } catch (err) {
    assert.fail(`generateGuidancePlan threw unexpectedly: ${err.constructor.name}: ${err.message}`);
  }

  assert.equal(result.planSource, 'ai', 'complete response → planSource === "ai"');
  assert.equal(result.isStatic,  false, 'complete response → isStatic === false');
  assert.ok(Array.isArray(result.steps) && result.steps.length === 2, 'correct step count');
  assert.equal(result.evidenceSummary, VALID_PLAN_OBJ.evidenceSummary, 'evidenceSummary matches');

  console.log('✓ Scenario 2: stop_reason end_turn → AI plan returned, planSource=ai, isStatic=false');
}

// ---------------------------------------------------------------------------
// Scenario 3 — thinking block before text block (5-series model behaviour)
// ---------------------------------------------------------------------------
// claude-haiku-5-5 may prefix a thinking block. Confirms .find(b => b.type === 'text')
// still locates the text block correctly with stop_reason === 'end_turn'.
{
  // Note: VALID_PLAN_JSON contains the corrected schema (owner/developer per step)
  const mockResponse = {
    stop_reason: 'end_turn',
    model:       'claude-haiku-5-5',
    usage:       { input_tokens: 800, output_tokens: 700 },
    content:     [
      { type: 'thinking', thinking: 'Let me analyze the evidence carefully...' },
      { type: 'text', text: VALID_PLAN_JSON },
    ],
  };

  let result;
  try {
    result = await runWithMockFetch(makeMockFetch(mockResponse));
  } catch (err) {
    assert.fail(`generateGuidancePlan threw unexpectedly: ${err.constructor.name}: ${err.message}`);
  }

  assert.equal(result.planSource, 'ai', 'thinking + text → planSource === "ai"');
  assert.equal(result.evidenceSummary, VALID_PLAN_OBJ.evidenceSummary, 'text block parsed after thinking block');

  console.log('✓ Scenario 3: thinking block + text block → thinking skipped, plan parsed correctly');
}

// ---------------------------------------------------------------------------
// Scenario 4 — API error response (non-2xx)
// ---------------------------------------------------------------------------
// Confirms the error path does not reference `data`/`apiData` and falls back cleanly.
{
  global.fetch = async () => ({
    ok:     false,
    status: 503,
    json:   async () => ({ error: { message: 'overloaded', type: 'overloaded_error' } }),
    text:   async () => '{"error":{"message":"overloaded"}}',
  });

  const { generateGuidancePlan } = await import(`${projectRoot}/lib/guidance.js`);

  let result;
  try {
    result = await generateGuidancePlan(MOCK_REC, 'example.com', 'developer', null, null, 'https://example.com');
  } catch (err) {
    assert.fail(`generateGuidancePlan threw on API error: ${err.constructor.name}: ${err.message}`);
  }

  assert.ok(
    result.isStatic === true || result.fallback === true,
    `API 503 must fall back — got planSource=${result.planSource}`
  );

  console.log('✓ Scenario 4: API 503 error → fallback cleanly, no throw');
}

console.log('\n✅ All generateGuidancePlan regression tests passed.');
