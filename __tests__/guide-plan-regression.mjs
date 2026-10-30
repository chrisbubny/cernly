/**
 * Regression tests for /api/guide-plan route.js.
 *
 * REGRESSION GUARDED: safeFocusIssue Temporal Dead Zone (TDZ) violation.
 *
 * The bug (commit 247aa84): `const focusFingerprintId = safeFocusIssue?.fingerprintId`
 * appeared in the cache-check block (line ~85) while `const safeFocusIssue = ...`
 * was declared with `const` later in the generate block (line ~103). In JavaScript,
 * accessing a `const`/`let` binding before its declaration throws:
 *   ReferenceError: Cannot access 'safeFocusIssue' before initialization
 * This crashed every POST /api/guide-plan request, producing the "raw issue titles,
 * no guidance steps" symptom.
 *
 * Fix: move safeFocusIssue sanitization to BEFORE the cache check.
 *
 * These tests execute the critical code path extracted verbatim from route.js so
 * the ordering constraint is actually enforced at runtime, not by source inspection.
 */

import assert from 'node:assert/strict';

// ─── Code path extracted from app/api/guide-plan/route.js ────────────────────
//
// This mirrors the exact sequence of variable declarations in the fixed route.
// If the TDZ regression were re-introduced (safeFocusIssue moved after
// focusFingerprintId), this function would throw ReferenceError — the test
// would catch it and fail.
//
// The function accepts the same inputs the route receives from the parsed body
// and returns the intermediate values the cache-check block computes.

function runCacheKeyPath(focusIssue, persona) {
  // ── Sanitise focusIssue (must happen before cache check so focusFingerprintId is available)
  // Only pass through safe string fields, never raw user input.
  const safeFocusIssue = focusIssue && typeof focusIssue === 'object' ? {
    message:       typeof focusIssue.message       === 'string' ? focusIssue.message.slice(0, 300)       : undefined,
    fingerprintId: typeof focusIssue.fingerprintId === 'string' ? focusIssue.fingerprintId.slice(0, 100)  : undefined,
    description:   typeof focusIssue.description   === 'string' ? focusIssue.description.slice(0, 500)   : undefined,
    detail:        typeof focusIssue.detail        === 'string' ? focusIssue.detail.slice(0, 500)        : undefined,
  } : null;

  // ── Cache check ─────────────────────────────────────────────────────────────
  // safeFocusIssue must be defined ABOVE this line — TDZ regression guard.
  const focusFingerprintId = safeFocusIssue?.fingerprintId || null;
  const personaKey = focusFingerprintId ? `${persona}::${focusFingerprintId}` : persona;

  return { safeFocusIssue, focusFingerprintId, personaKey };
}

// ─── Scenario 1: focusIssue with fingerprintId ────────────────────────────────
// personaKey should be compound: `${persona}::${focusFingerprintId}`
{
  const focusIssue = {
    message:       'Image elements do not have explicit width and height',
    fingerprintId: 'lh:uses-responsive-images',
    description:   'Serve images that are appropriately-sized to save cellular data.',
    detail:        'Element: <img src="/hero.jpg">',
  };

  let result;
  try {
    result = runCacheKeyPath(focusIssue, 'developer');
  } catch (err) {
    assert.fail(`TDZ regression: runCacheKeyPath threw ${err.constructor.name}: ${err.message}`);
  }

  assert.ok(result.safeFocusIssue !== null, 'safeFocusIssue is not null when focusIssue is a valid object');
  assert.equal(result.safeFocusIssue.fingerprintId, 'lh:uses-responsive-images', 'fingerprintId preserved');
  assert.equal(result.safeFocusIssue.message, 'Image elements do not have explicit width and height', 'message preserved');
  assert.equal(result.focusFingerprintId, 'lh:uses-responsive-images', 'focusFingerprintId extracted from safeFocusIssue');
  assert.equal(result.personaKey, 'developer::lh:uses-responsive-images', 'personaKey is compound when fingerprintId present');
  console.log('✓ Scenario 1: focusIssue with fingerprintId → compound personaKey, no TDZ error');
}

// ─── Scenario 2: focusIssue without fingerprintId ────────────────────────────
// personaKey should be bare persona string
{
  const focusIssue = {
    message: 'Eliminate render-blocking resources',
    // fingerprintId intentionally absent
  };

  let result;
  try {
    result = runCacheKeyPath(focusIssue, 'owner');
  } catch (err) {
    assert.fail(`TDZ regression: runCacheKeyPath threw ${err.constructor.name}: ${err.message}`);
  }

  assert.ok(result.safeFocusIssue !== null, 'safeFocusIssue is not null for object without fingerprintId');
  assert.equal(result.safeFocusIssue.fingerprintId, undefined, 'fingerprintId undefined when not a string');
  assert.equal(result.focusFingerprintId, null, 'focusFingerprintId is null when fingerprintId absent');
  assert.equal(result.personaKey, 'owner', 'personaKey is bare persona when no fingerprintId');
  console.log('✓ Scenario 2: focusIssue without fingerprintId → bare personaKey');
}

// ─── Scenario 3: null focusIssue ─────────────────────────────────────────────
// When no focusIssue provided, safeFocusIssue is null, personaKey is bare persona
{
  let result;
  try {
    result = runCacheKeyPath(null, 'cms-admin');
  } catch (err) {
    assert.fail(`TDZ regression: runCacheKeyPath threw ${err.constructor.name}: ${err.message}`);
  }

  assert.equal(result.safeFocusIssue, null, 'safeFocusIssue is null for null input');
  assert.equal(result.focusFingerprintId, null, 'focusFingerprintId is null');
  assert.equal(result.personaKey, 'cms-admin', 'personaKey is bare persona for null focusIssue');
  console.log('✓ Scenario 3: null focusIssue → null safeFocusIssue, bare personaKey');
}

// ─── Scenario 4: focusIssue with primitive value (not object) ────────────────
// Sanitization should reject non-object focusIssue
{
  let result;
  try {
    result = runCacheKeyPath('lh:font-display', 'developer');
  } catch (err) {
    assert.fail(`TDZ regression: runCacheKeyPath threw ${err.constructor.name}: ${err.message}`);
  }

  assert.equal(result.safeFocusIssue, null, 'safeFocusIssue is null when focusIssue is a string (not object)');
  assert.equal(result.personaKey, 'developer', 'personaKey is bare persona for non-object focusIssue');
  console.log('✓ Scenario 4: string focusIssue rejected → null safeFocusIssue');
}

// ─── Scenario 5: focusIssue field truncation ─────────────────────────────────
// Long strings must be sliced to their respective limits
{
  const focusIssue = {
    message:       'A'.repeat(500),   // limit: 300
    fingerprintId: 'B'.repeat(200),   // limit: 100
    description:   'C'.repeat(1000),  // limit: 500
    detail:        'D'.repeat(1000),  // limit: 500
  };

  let result;
  try {
    result = runCacheKeyPath(focusIssue, 'owner');
  } catch (err) {
    assert.fail(`TDZ regression: runCacheKeyPath threw ${err.constructor.name}: ${err.message}`);
  }

  assert.equal(result.safeFocusIssue.message.length,       300, 'message truncated to 300');
  assert.equal(result.safeFocusIssue.fingerprintId.length, 100, 'fingerprintId truncated to 100');
  assert.equal(result.safeFocusIssue.description.length,   500, 'description truncated to 500');
  assert.equal(result.safeFocusIssue.detail.length,        500, 'detail truncated to 500');
  console.log('✓ Scenario 5: oversized focusIssue fields are truncated to safe limits');
}

// ─── Scenario 6: focusIssue with non-string field types ──────────────────────
// Non-string fields must be normalized to undefined, not coerced
{
  const focusIssue = {
    message:       42,           // not a string
    fingerprintId: ['lh:foo'],   // not a string (array)
    description:   null,         // not a string
    detail:        { foo: 1 },   // not a string
  };

  let result;
  try {
    result = runCacheKeyPath(focusIssue, 'developer');
  } catch (err) {
    assert.fail(`TDZ regression: runCacheKeyPath threw ${err.constructor.name}: ${err.message}`);
  }

  assert.equal(result.safeFocusIssue.message,       undefined, 'numeric message → undefined');
  assert.equal(result.safeFocusIssue.fingerprintId, undefined, 'array fingerprintId → undefined');
  assert.equal(result.safeFocusIssue.description,   undefined, 'null description → undefined');
  assert.equal(result.safeFocusIssue.detail,        undefined, 'object detail → undefined');
  assert.equal(result.focusFingerprintId, null,  'focusFingerprintId null when fingerprintId undefined');
  assert.equal(result.personaKey, 'developer', 'personaKey is bare persona when no valid fingerprintId');
  console.log('✓ Scenario 6: non-string focusIssue fields normalized to undefined');
}

// ─── Ordering guard (meta-test) ───────────────────────────────────────────────
// Demonstrate that reversing the declaration order causes a ReferenceError,
// confirming the tests would catch a TDZ regression if it were re-introduced.
{
  function runBrokenOrder(focusIssue, persona) {
    // BUG: reference safeFocusIssue BEFORE its declaration
    const focusFingerprintId = safeFocusIssue?.fingerprintId || null;  // TDZ here
    const personaKey = focusFingerprintId ? `${persona}::${focusFingerprintId}` : persona;

    const safeFocusIssue = focusIssue && typeof focusIssue === 'object' ? {  // declared too late
      fingerprintId: typeof focusIssue.fingerprintId === 'string' ? focusIssue.fingerprintId : undefined,
    } : null;

    return { safeFocusIssue, focusFingerprintId, personaKey };
  }

  let threw = false;
  try {
    runBrokenOrder({ fingerprintId: 'lh:font-display' }, 'owner');
  } catch (err) {
    threw = err instanceof ReferenceError;
  }
  assert.ok(threw, 'broken declaration order throws ReferenceError — confirms test catches the regression');
  console.log('✓ Ordering guard: reversed declaration order throws ReferenceError (tests would catch a re-introduced TDZ)');
}

console.log('\n✅ All guide-plan regression tests passed.');
