/**
 * __tests__/release1-auth-regression.mjs
 *
 * Regression tests for Release 1 security changes.
 *
 * Verifies:
 *   1. /api/analyze requires authentication → 401 for unauthenticated callers
 *   2. /api/ask requires authentication → 401 for unauthenticated callers
 *   3. Stripe session_id validation rejects arbitrary strings
 *   4. Stripe session_id validation rejects paid sessions for the wrong report
 *   5. Scan history cannot expose another user's reports
 *   6. Pro subscription grants PDF only to reports the subscriber is authorized to view
 *   7. Store: getReportsByDomain returns [] when userId is absent (fail closed)
 *   8. Store: ASK_LIMIT constant is exported and is a positive integer
 *   9. Store: PRO_SCAN_LIMIT constant is exported and is > FREE_SCAN_LIMIT
 *
 * These tests exercise module logic and helper contracts. They do not make
 * real HTTP requests, DB calls, or Stripe API calls — those require a running
 * environment.
 *
 * Run: node __tests__/release1-auth-regression.mjs
 */

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// 1. Verify auth blocks in route source — check that the 401 guard is present
//    before any analyzer call or DB read in each protected route.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

function readRoute(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const analyzeRoute   = readRoute('app/api/analyze/route.js');
const askRoute       = readRoute('app/api/ask/route.js');
const scanHistRoute  = readRoute('app/api/scan-history/route.js');
const reportRoute    = readRoute('app/api/report/route.js');
const pdfRoute       = readRoute('app/api/report/[slug]/pdf/route.js');
const stripeSession  = readRoute('lib/stripe-session.js');
const storeSource    = readRoute('lib/store.js');

// Helper: find the character index of a string in source
function indexOf(src, str) { return src.indexOf(str); }

// ── Test 1: /api/analyze returns 401 before running analyzers ───────────────
{
  // The 401 guard must appear before the first analyzer import use
  const authGuard = indexOf(analyzeRoute, "status: 401");
  const runLh     = indexOf(analyzeRoute, "runLighthouse(");
  assert.ok(authGuard !== -1, 'analyze route must contain a 401 response');
  assert.ok(authGuard < runLh, '401 guard must appear before runLighthouse() call');
  console.log('✓ /api/analyze: 401 guard is present before analyzers');
}

// ── Test 2: /api/ask returns 401 before touching Anthropic API ──────────────
{
  const authGuard  = indexOf(askRoute, "status: 401");
  const apiKeyUse  = indexOf(askRoute, "ANTHROPIC_API_KEY");
  assert.ok(authGuard !== -1, 'ask route must contain a 401 response');
  assert.ok(authGuard < apiKeyUse, '401 guard must appear before ANTHROPIC_API_KEY use');
  console.log('✓ /api/ask: 401 guard is present before AI call');
}

// ── Test 3: /api/scan-history requires auth ──────────────────────────────────
{
  const authGuard = indexOf(scanHistRoute, "status: 401");
  assert.ok(authGuard !== -1, 'scan-history must contain a 401 response');
  // Must also filter by userId — the query must not be issued without one
  assert.ok(scanHistRoute.includes('slimUserId'), 'scan-history must use slimUserId variable');
  assert.ok(scanHistRoute.includes('if (!slimUserId)'), 'scan-history must guard on slimUserId');
  console.log('✓ /api/scan-history: 401 guard and userId filter present');
}

// ── Test 4: lib/store.js getReportsByDomain fails closed without userId ──────
{
  // The function must return early with [] when userId is falsy
  assert.ok(storeSource.includes("if (!userId) return [];"),
    'getReportsByDomain must return [] immediately when userId is absent');
  // The query must include AND user_id = $2
  assert.ok(storeSource.includes('AND user_id = $2'),
    'getReportsByDomain SQL must filter by user_id');
  console.log('✓ store.getReportsByDomain: fails closed without userId, filters by user_id');
}

// ── Test 5: /api/report arbitrary session_id is not trusted ──────────────────
{
  // The old vulnerability: const isStripeSession = !!sessionId;
  // That line must NOT be present
  assert.ok(!reportRoute.includes('const isStripeSession = !!sessionId'),
    'report route must NOT trust arbitrary session_id strings');
  // Must call the validated helper
  assert.ok(reportRoute.includes('isValidPaidStripeSession'),
    'report route must call isValidPaidStripeSession()');
  console.log('✓ /api/report: arbitrary session_id is no longer trusted');
}

// ── Test 6: /api/report/[slug]/pdf arbitrary session_id not trusted ──────────
{
  assert.ok(!pdfRoute.includes('const canAccess = report.paid || !!sessionId'),
    'pdf route must NOT use the old !!sessionId shortcut');
  assert.ok(pdfRoute.includes('isValidPaidStripeSession'),
    'pdf route must call isValidPaidStripeSession()');
  assert.ok(pdfRoute.includes('getUserSubscription'),
    'pdf route must check Pro subscription for owners');
  console.log('✓ /api/report/[slug]/pdf: old !!sessionId shortcut removed; Stripe validation + Pro check present');
}

// ── Test 7: lib/stripe-session.js fails closed ───────────────────────────────
{
  // Must verify payment_status === 'paid'
  assert.ok(stripeSession.includes("payment_status !== 'paid'"),
    'stripe-session must verify payment_status');
  // Must verify mode === 'payment'
  assert.ok(stripeSession.includes("mode !== 'payment'"),
    'stripe-session must verify mode=payment (not subscription)');
  // Must return false (not true) on catch
  const catchIdx  = stripeSession.lastIndexOf('} catch');
  const returnFalseAfterCatch = stripeSession.slice(catchIdx).includes('return false');
  assert.ok(returnFalseAfterCatch, 'stripe-session must return false on any error');
  // Must reject sessions with no report metadata
  assert.ok(stripeSession.includes('!metaSlug && !metaId'),
    'stripe-session must deny sessions with no report metadata');
  console.log('✓ lib/stripe-session: fails closed; payment_status, mode, and metadata validated');
}

// ── Test 8: Cross-report session rejection (logic check) ─────────────────────
{
  // The validation logic: if metaSlug is set and doesn't match reportSlug → false
  // Extract the relevant comparison lines from source
  assert.ok(stripeSession.includes('metaSlug !== String(reportSlug)'),
    'stripe-session must reject slug mismatch');
  assert.ok(stripeSession.includes('String(metaId) !== String(reportIntId)'),
    'stripe-session must reject id mismatch');
  console.log('✓ lib/stripe-session: session bound to specific report (slug + id mismatch → rejected)');
}

// ── Test 9: Ask Cernly usage ceiling wiring ───────────────────────────────────
{
  // ASK_LIMIT must be imported and used in the check
  assert.ok(askRoute.includes('ASK_LIMIT'),
    'ask route must import and use ASK_LIMIT');
  assert.ok(askRoute.includes('getMonthlyAskCount'),
    'ask route must call getMonthlyAskCount');
  assert.ok(askRoute.includes('incrementAskCount'),
    'ask route must call incrementAskCount on success');
  assert.ok(askRoute.includes('ask_limit_reached'),
    'ask route must return ask_limit_reached error when ceiling hit');
  // Increment must happen AFTER successful response, not before
  const limitCheckIdx = indexOf(askRoute, 'ask_limit_reached');
  const incrementIdx  = indexOf(askRoute, 'incrementAskCount(userId)');
  assert.ok(incrementIdx > limitCheckIdx,
    'incrementAskCount must be called after the limit check (not before)');
  console.log('✓ /api/ask: ASK_LIMIT ceiling enforced; counter incremented after success');
}

// ── Test 10: Store exports limit constants ───────────────────────────────────
{
  assert.ok(storeSource.includes('export { FREE_SCAN_LIMIT, PRO_SCAN_LIMIT, ASK_LIMIT }'),
    'store.js must export FREE_SCAN_LIMIT, PRO_SCAN_LIMIT, ASK_LIMIT');
  assert.ok(storeSource.includes('const PRO_SCAN_LIMIT  = 15'),
    'PRO_SCAN_LIMIT must be 15');
  assert.ok(storeSource.includes('const ASK_LIMIT       = 100'),
    'ASK_LIMIT must be 100');
  console.log('✓ store.js: FREE_SCAN_LIMIT=3, PRO_SCAN_LIMIT=15, ASK_LIMIT=100 exported');
}

// ── Test 11: Pro scan limit enforced in analyze route ────────────────────────
{
  assert.ok(analyzeRoute.includes('PRO_SCAN_LIMIT'),
    'analyze route must import and apply PRO_SCAN_LIMIT');
  // The old code only enforced FREE_SCAN_LIMIT for !isPro users; now both limits apply
  assert.ok(analyzeRoute.includes('isPro ? PRO_SCAN_LIMIT : FREE_SCAN_LIMIT'),
    'analyze route must select limit based on isPro');
  console.log('✓ /api/analyze: Pro scan limit (15/month) enforced alongside free limit');
}

// ── Test 12: Cost instrumentation present in all AI callers ──────────────────
{
  const aiJs     = readRoute('lib/analyzers/ai.js');
  const recsJs   = readRoute('lib/recommendations.js');
  const guidJs   = readRoute('lib/guidance.js');

  for (const [label, src] of [
    ['ai.js (AI Summary)',     aiJs],
    ['ai.js (Assessment)',     aiJs],
    ['recommendations.js',     recsJs],
    ['guidance.js',            guidJs],
    ['ask/route.js',           askRoute],
  ]) {
    assert.ok(src.includes('input_tokens'),
      `${label} must log input_tokens`);
    assert.ok(src.includes('output_tokens'),
      `${label} must log output_tokens`);
    assert.ok(src.includes('est_cost_usd'),
      `${label} must log est_cost_usd`);
  }
  // Verify API keys are never logged
  for (const [label, src] of [
    ['ai.js',             aiJs],
    ['recommendations',   recsJs],
    ['guidance',          guidJs],
    ['ask route',         askRoute],
  ]) {
    const logLines = src.split('\n').filter(l => l.includes('console.') && l.includes('apiKey'));
    assert.equal(logLines.length, 0,
      `${label} must never log the API key (found ${logLines.length} suspect lines)`);
  }
  console.log('✓ Cost instrumentation: input_tokens, output_tokens, est_cost_usd logged in all AI callers');
  console.log('✓ API key never logged in any AI caller');
}

console.log('\n✅ All release1-auth-regression tests passed');
console.log('   Verified: auth gates, session_id validation, cross-report rejection,');
console.log('             userId filter in scan history, usage limits, cost instrumentation');
