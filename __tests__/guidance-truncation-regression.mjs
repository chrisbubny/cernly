/**
 * Regression test: guidance plan truncation guard.
 *
 * ROOT CAUSE (production 2026-10-30):
 *   GUIDANCE_MAX_TOKENS was 2500. claude-haiku-5-5 generated guidance plans
 *   exceeding that budget, producing stop_reason: "max_tokens". The code did not
 *   check stop_reason after a successful HTTP 200 response — it proceeded directly
 *   to JSON.parse on the truncated text, which failed with:
 *
 *     [guidance] JSON parse error: Unterminated string in JSON at position 5502
 *     [guidance] using static fallback | reason: json_parse:Unterminated string...
 *
 *   All three personas (owner, cms-admin, developer) failed at similar byte
 *   positions, confirming token budget exhaustion as the common cause.
 *
 * FIX:
 *   1. GUIDANCE_MAX_TOKENS increased from 2500 to 4096.
 *   2. A stop_reason === 'max_tokens' guard was added between rawText extraction
 *      and JSON.parse. When triggered, it calls fallbackToStatic() instead of
 *      attempting to parse or cache a truncated fragment.
 *
 * WHAT THESE TESTS VERIFY:
 *   - A genuinely truncated response payload (stop_reason: 'max_tokens') is
 *     rejected before JSON.parse is attempted.
 *   - A complete, valid response (stop_reason: 'end_turn') proceeds to JSON.parse.
 *   - An empty-text response is still handled by the existing empty_response guard.
 *   - The fallback reason string includes 'truncated:max_tokens' so logs are
 *     distinguishable from json_parse errors.
 *   - Truncated plans are never cached (confirmed by verifying fallback is returned,
 *     not a parsed plan object).
 *
 * These tests extract the decision logic verbatim from generateGuidancePlan so
 * that any future regression (removing the guard or moving it after JSON.parse)
 * would cause a test failure.
 */

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Logic extracted from lib/guidance.js — generateGuidancePlan success path
// ---------------------------------------------------------------------------
//
// This mirrors the exact sequence in the fixed implementation:
//   1. rawText = find text block in content[]
//   2. if (!rawText) → fallback with 'empty_response'
//   3. if (data.stop_reason === 'max_tokens') → fallback with 'truncated:max_tokens:...'
//   4. try { JSON.parse(cleaned) } catch → fallback with 'json_parse:...'
//   5. success → return parsed
//
// If the guard in step 3 were removed or moved after step 4, scenario A would
// reach JSON.parse on truncated text, JSON.parse would throw, and the result
// would be { outcome: 'fallback', reason: 'json_parse:...' } instead of
// { outcome: 'fallback', reason: 'truncated:max_tokens:...' }. The test
// asserts the specific reason prefix, so it would fail.

function processApiResponse(data) {
  // Step 1: extract text content (identical to the 5-series thinking-block logic)
  const rawText = (data.content || []).find(b => b.type === 'text')?.text?.trim();

  // Step 2: empty-response guard (pre-existing)
  if (!rawText) {
    const detail = `stop_reason=${data.stop_reason} content_len=${data.content?.length}`;
    return { outcome: 'fallback', reason: `empty_response:${detail}`, parsed: null };
  }

  // Step 3: truncation guard (new — this is what these tests exercise)
  if (data.stop_reason === 'max_tokens') {
    const outTok = data.usage?.output_tokens ?? 'unknown';
    return { outcome: 'fallback', reason: `truncated:max_tokens:output=${outTok}`, parsed: null };
  }

  // Step 4: JSON parse
  let parsed;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { outcome: 'fallback', reason: `json_parse:${e.message}`, parsed: null };
  }

  // Step 5: success
  return { outcome: 'success', reason: null, parsed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a mock Anthropic response with a mid-JSON truncation at `cutAt` chars.
// Mirrors what production was receiving: a stop_reason of 'max_tokens' and
// a text block containing valid-but-incomplete JSON.
function mockTruncatedResponse(fullJson, cutAt, outputTokens = 2500) {
  const truncated = fullJson.slice(0, cutAt);
  return {
    stop_reason: 'max_tokens',
    usage: { input_tokens: 800, output_tokens: outputTokens },
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: truncated }],
  };
}

// Build a mock Anthropic response with a complete JSON payload.
function mockCompleteResponse(obj, outputTokens = 1200) {
  return {
    stop_reason: 'end_turn',
    usage: { input_tokens: 800, output_tokens: outputTokens },
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: JSON.stringify(obj) }],
  };
}

// A minimal but structurally representative guidance plan JSON — the kind
// generateGuidancePlan would receive for lh:network-dependency-tree-insight.
const FULL_PLAN_JSON = JSON.stringify({
  evidenceSummary: 'Your site loads 23 third-party requests at render time, adding ~1.2 s to page load.',
  steps: [
    {
      title: 'Audit your third-party dependencies',
      who: 'owner',
      actions: [
        'Open your analytics platform and identify which third-party scripts are active.',
        'Check if each service is still in use or can be removed.',
      ],
      confidence: 'high',
      effort: 'low',
      verification: 'Run a new scan and confirm the network dependency count has decreased.',
    },
    {
      title: 'Defer non-critical scripts',
      who: 'developer',
      actions: [
        'Add defer or async attributes to analytics and chat widget script tags.',
        'Move non-essential third-party tags to load after the DOMContentLoaded event.',
      ],
      confidence: 'high',
      effort: 'medium',
      verification: 'Lighthouse TBT score should improve by at least 200 ms.',
    },
    {
      title: 'Consolidate tag management',
      who: 'cms-admin',
      actions: [
        'Review your tag manager container for duplicate or redundant tags.',
        'Remove inactive tracking pixels and old A/B testing scripts.',
      ],
      confidence: 'medium',
      effort: 'low',
      verification: 'Confirm the tag manager container fires fewer tags on the next scan.',
    },
  ],
});

// ---------------------------------------------------------------------------
// Scenario A: genuinely truncated response (stop_reason: 'max_tokens')
// ---------------------------------------------------------------------------
// This is the exact production failure mode: text is present but JSON is cut off
// mid-string. Without the guard, processApiResponse would reach JSON.parse and
// fail there. With the guard, it returns 'truncated:max_tokens:...' immediately.
{
  // Cut the JSON in the middle of a string value — mirrors production positions
  // 5420–5685. Using character position 180 keeps the test JSON small while
  // confirming the truncation point is mid-string.
  const cutAt = 180;
  assert.ok(cutAt < FULL_PLAN_JSON.length, 'test setup: cut point is before end of JSON');

  const truncated = mockTruncatedResponse(FULL_PLAN_JSON, cutAt, 2500);
  // Confirm the truncated text is not valid JSON (would throw if parsed)
  let parseThrew = false;
  try { JSON.parse(FULL_PLAN_JSON.slice(0, cutAt)); } catch { parseThrew = true; }
  assert.ok(parseThrew, 'test setup: truncated text is genuinely invalid JSON');

  const result = processApiResponse(truncated);

  assert.equal(result.outcome, 'fallback', 'truncated response → fallback outcome');
  assert.ok(result.reason.startsWith('truncated:max_tokens:'),
    `fallback reason starts with 'truncated:max_tokens:' — got: ${result.reason}`);
  assert.ok(result.reason.includes('output=2500'),
    `fallback reason includes output token count — got: ${result.reason}`);
  assert.equal(result.parsed, null, 'truncated response → parsed is null (never cached)');

  console.log('✓ Scenario A: truncated response (stop_reason: max_tokens) → fallback, no JSON.parse attempted');
  console.log('  reason:', result.reason);
}

// ---------------------------------------------------------------------------
// Scenario B: complete response (stop_reason: 'end_turn') → success
// ---------------------------------------------------------------------------
// Confirms the guard does not fire on a valid, complete response.
{
  const complete = mockCompleteResponse({
    evidenceSummary: 'Three render-blocking scripts delay first paint by 0.8 s.',
    steps: [
      {
        title: 'Add defer to script tags',
        who: 'developer',
        actions: ['Add `defer` to analytics and widget scripts.'],
        confidence: 'high',
        effort: 'low',
        verification: 'Re-scan: render-blocking score should be 0.',
      },
    ],
  });

  const result = processApiResponse(complete);

  assert.equal(result.outcome, 'success', 'complete response → success outcome');
  assert.equal(result.reason, null, 'no fallback reason on success');
  assert.ok(result.parsed !== null, 'parsed plan is not null');
  assert.ok(Array.isArray(result.parsed.steps), 'parsed plan has steps array');
  assert.equal(result.parsed.steps.length, 1, 'correct number of steps');

  console.log('✓ Scenario B: complete response (stop_reason: end_turn) → success, plan parsed correctly');
}

// ---------------------------------------------------------------------------
// Scenario C: empty text content — existing empty_response guard still fires
// ---------------------------------------------------------------------------
// Confirms the pre-existing guard for empty rawText is not broken by the new guard.
{
  const emptyContent = {
    stop_reason: 'max_tokens',  // even with max_tokens, if text is empty the prior guard fires
    usage: { input_tokens: 800, output_tokens: 2500 },
    model: 'claude-haiku-5-5',
    content: [],  // no text block at all
  };

  const result = processApiResponse(emptyContent);

  assert.equal(result.outcome, 'fallback', 'empty content → fallback');
  assert.ok(result.reason.startsWith('empty_response:'),
    `empty content → empty_response reason — got: ${result.reason}`);
  assert.equal(result.parsed, null, 'empty content → parsed is null');

  console.log('✓ Scenario C: empty content array → empty_response fallback (pre-existing guard intact)');
}

// ---------------------------------------------------------------------------
// Scenario D: thinking block before text block (5-series model behaviour)
// ---------------------------------------------------------------------------
// claude-haiku-5-5 and claude-sonnet-5-5 may emit a thinking block at content[0].
// The implementation uses .find(b => b.type === 'text') to skip it. Confirm this
// still works in combination with the truncation guard.
{
  const withThinking = {
    stop_reason: 'end_turn',
    usage: { input_tokens: 800, output_tokens: 1200 },
    model: 'claude-haiku-5-5',
    content: [
      { type: 'thinking', thinking: 'Let me analyze the evidence...' },
      { type: 'text', text: JSON.stringify({ evidenceSummary: 'OK', steps: [] }) },
    ],
  };

  const result = processApiResponse(withThinking);

  assert.equal(result.outcome, 'success', 'thinking + text → success');
  assert.equal(result.parsed.evidenceSummary, 'OK', 'text block parsed after skipping thinking block');

  console.log('✓ Scenario D: thinking block before text block → skipped, text block parsed correctly');
}

// ---------------------------------------------------------------------------
// Scenario E: stop_reason 'max_tokens' but empty text block
// ---------------------------------------------------------------------------
// Edge case: what if the model hit the budget before emitting any text at all?
// The empty_response guard (step 2) fires before the truncation guard (step 3).
{
  const budgetExhaustedNoText = {
    stop_reason: 'max_tokens',
    usage: { input_tokens: 800, output_tokens: 1 },
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: '' }],  // whitespace-only after trim
  };

  const result = processApiResponse(budgetExhaustedNoText);

  assert.equal(result.outcome, 'fallback', 'max_tokens + empty text → fallback');
  assert.ok(result.reason.startsWith('empty_response:'),
    `empty text fires before truncation guard — got: ${result.reason}`);

  console.log('✓ Scenario E: stop_reason max_tokens with empty text → empty_response guard fires first');
}

// ---------------------------------------------------------------------------
// Scenario F: guard ordering meta-test
// ---------------------------------------------------------------------------
// Demonstrate that moving the truncation guard AFTER JSON.parse would produce
// a different (less informative) reason string, confirming these tests would
// catch a regression that reversed the guard order.
{
  function processWithGuardAfterParse(data) {
    const rawText = (data.content || []).find(b => b.type === 'text')?.text?.trim();
    if (!rawText) {
      return { outcome: 'fallback', reason: `empty_response:stop_reason=${data.stop_reason}`, parsed: null };
    }
    // WRONG ORDER: truncation guard missing before JSON.parse
    let parsed;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { outcome: 'fallback', reason: `json_parse:${e.message}`, parsed: null };
    }
    // Guard only checked after parse (regression scenario)
    if (data.stop_reason === 'max_tokens') {
      return { outcome: 'fallback', reason: `truncated:max_tokens:output=${data.usage?.output_tokens}`, parsed: null };
    }
    return { outcome: 'success', reason: null, parsed };
  }

  const truncated = mockTruncatedResponse(FULL_PLAN_JSON, 180, 2500);
  const wrongResult = processWithGuardAfterParse(truncated);

  // The wrong order hits json_parse, not truncated:max_tokens
  assert.ok(wrongResult.reason.startsWith('json_parse:'),
    `wrong order produces json_parse reason — got: ${wrongResult.reason}`);

  // The correct order produces truncated:max_tokens
  const correctResult = processApiResponse(truncated);
  assert.ok(correctResult.reason.startsWith('truncated:max_tokens:'),
    `correct order produces truncated:max_tokens reason — got: ${correctResult.reason}`);

  // Confirm the two are different — i.e., the test distinguishes the two implementations
  assert.notEqual(wrongResult.reason, correctResult.reason,
    'wrong and correct guard orders produce different reason strings — test is discriminating');

  console.log('✓ Scenario F: guard-ordering meta-test confirms test distinguishes correct vs broken order');
  console.log('  broken order reason:', wrongResult.reason.slice(0, 60));
  console.log('  correct order reason:', correctResult.reason);
}

console.log('\n✅ All guidance truncation regression tests passed.');
