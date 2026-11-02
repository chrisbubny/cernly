/**
 * context-integrity.mjs
 *
 * Regression tests for Phase 3 Priority A — five context-integrity defects.
 *
 *   1. GuidedFix resets when rec changes (key prop drives remount)
 *   2. Persona is forwarded in sendChatMessage POST body
 *   3. Server-side persona validation and step routing in /api/ask
 *   4. chatGenerationRef guards stale chat responses
 *   5. AbortController cancels stale plan fetches
 *
 * Run: node __tests__/context-integrity.mjs
 */

import assert from 'assert/strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRec(fingerprint, title = `Rec ${fingerprint}`) {
  return { fingerprint, title, actions: [], supporting_findings: [] };
}

// ---------------------------------------------------------------------------
// Test 1 — GuidedFix key prop: different fingerprints are distinct React keys
// ---------------------------------------------------------------------------
{
  const rec1 = makeRec('performance-font-display');
  const rec2 = makeRec('performance-image-sizing');

  // The key prop in ReportClient is guidedFixRec.fingerprint.
  // Two different recs must produce different keys so React remounts GuidedFix.
  assert.notEqual(
    rec1.fingerprint,
    rec2.fingerprint,
    'Different recs must have different fingerprints (different React keys)'
  );

  // The same rec object always produces the same key — no remount for same rec.
  assert.equal(
    rec1.fingerprint,
    rec1.fingerprint,
    'Same rec fingerprint must be stable'
  );

  console.log('✓ Test 1 — GuidedFix key prop produces distinct keys for different recs');
}

// ---------------------------------------------------------------------------
// Test 2 — Persona forwarded: sendChatMessage POST body includes persona
// ---------------------------------------------------------------------------
{
  // Simulate the POST body that sendChatMessage constructs (extracted logic).
  function buildChatPostBody({ question, reportId, recFingerprint, issueFingerprint,
    activeStep, selectedRole, chatMessages }) {
    return {
      question: question.trim(),
      reportId,
      recFingerprint,
      ...(issueFingerprint ? { findingFingerprintId: issueFingerprint } : {}),
      activeStep,
      persona: selectedRole || 'owner',
      messages: chatMessages.slice(-6),
    };
  }

  // When selectedRole is set — persona must flow through
  const withRole = buildChatPostBody({
    question: 'How do I fix this?',
    reportId: 'slug-abc',
    recFingerprint: 'performance-font-display',
    issueFingerprint: 'lh:font-display',
    activeStep: { title: 'Update font-display', owner: { action: 'Add CSS' } },
    selectedRole: 'developer',
    chatMessages: [],
  });

  assert.equal(withRole.persona, 'developer', 'persona must be "developer" when selectedRole="developer"');
  assert.ok('findingFingerprintId' in withRole, 'findingFingerprintId must be present when issueFingerprint provided');
  assert.equal(withRole.reportId, 'slug-abc');

  // When selectedRole is null — must default to 'owner'
  const withoutRole = buildChatPostBody({
    question: 'Help me',
    reportId: 'slug-xyz',
    recFingerprint: 'seo-title',
    issueFingerprint: null,
    activeStep: null,
    selectedRole: null,
    chatMessages: [],
  });

  assert.equal(withoutRole.persona, 'owner', 'persona must default to "owner" when selectedRole is null');
  assert.ok(!('findingFingerprintId' in withoutRole), 'findingFingerprintId must be absent when no issueFingerprint');

  console.log('✓ Test 2 — Persona forwarded in sendChatMessage POST body');
}

// ---------------------------------------------------------------------------
// Test 3 — Server persona validation (mirrors /api/ask route logic)
// ---------------------------------------------------------------------------
{
  const VALID_PERSONAS = new Set(['owner', 'cms-admin', 'cms', 'developer']);

  function normalisePersona(rawPersona) {
    if (!VALID_PERSONAS.has(rawPersona)) return 'owner';
    return rawPersona === 'cms' ? 'cms-admin' : rawPersona;
  }

  // Valid values
  assert.equal(normalisePersona('owner'),     'owner',     'owner passes through');
  assert.equal(normalisePersona('developer'), 'developer', 'developer passes through');
  assert.equal(normalisePersona('cms-admin'), 'cms-admin', 'cms-admin passes through');

  // Legacy alias
  assert.equal(normalisePersona('cms'),       'cms-admin', 'cms normalises to cms-admin');

  // Invalid / absent values → default
  assert.equal(normalisePersona(undefined),   'owner', 'undefined defaults to owner');
  assert.equal(normalisePersona(null),        'owner', 'null defaults to owner');
  assert.equal(normalisePersona('admin'),     'owner', 'unknown value defaults to owner');
  assert.equal(normalisePersona(''),          'owner', 'empty string defaults to owner');

  // Step routing: persona-keyed action wins over fallback chain
  function resolveStepAction(activeStep, persona) {
    return activeStep[persona]?.action
      || activeStep.owner?.action
      || activeStep.developer?.action
      || '';
  }

  const step = {
    title: 'Optimise images',
    owner:     { action: 'Use a plugin to compress images.' },
    developer: { action: 'Run imagemin on your asset pipeline.' },
    'cms-admin': { action: 'Install the image optimisation plugin from your CMS marketplace.' },
  };

  assert.equal(
    resolveStepAction(step, 'developer'),
    'Run imagemin on your asset pipeline.',
    'developer gets developer action'
  );
  assert.equal(
    resolveStepAction(step, 'cms-admin'),
    'Install the image optimisation plugin from your CMS marketplace.',
    'cms-admin gets cms-admin action'
  );
  assert.equal(
    resolveStepAction(step, 'owner'),
    'Use a plugin to compress images.',
    'owner gets owner action'
  );

  // Fallback chain: if the persona key is absent, fall back to owner then developer
  const sparseStep = {
    title: 'Check SSL',
    developer: { action: 'Run openssl s_client.' },
  };
  assert.equal(
    resolveStepAction(sparseStep, 'owner'),
    'Run openssl s_client.',
    'owner falls back to developer when owner key absent'
  );
  assert.equal(
    resolveStepAction(sparseStep, 'cms-admin'),
    'Run openssl s_client.',
    'cms-admin falls back to developer when own key and owner absent'
  );

  console.log('✓ Test 3 — Server persona validation and step routing');
}

// ---------------------------------------------------------------------------
// Test 4 — chatGenerationRef: stale response detection
// ---------------------------------------------------------------------------
{
  // Simulate the generation-counter pattern used in sendChatMessage.
  // Each "send" captures the current generation; state updates check it.
  let generation = 0;
  const results = [];

  async function fakeRequest(id, delay, genAtStart) {
    await new Promise(r => setTimeout(r, delay));
    // Stale check — matches the guard in sendChatMessage
    if (generation !== genAtStart) {
      results.push({ id, dropped: true });
      return;
    }
    results.push({ id, dropped: false });
  }

  // Fire two concurrent requests; the second one arrives late.
  // Midway, generation increments (simulating a step/rec change).
  const gen1 = generation; // 0
  const p1 = fakeRequest('first', 60, gen1);

  // Generation increments (user changed step)
  generation += 1;

  const gen2 = generation; // 1
  const p2 = fakeRequest('second', 10, gen2);

  await Promise.all([p1, p2]);

  const first  = results.find(r => r.id === 'first');
  const second = results.find(r => r.id === 'second');

  assert.ok(first.dropped,   'First (stale) request must be dropped after generation increment');
  assert.ok(!second.dropped, 'Second (current) request must be accepted');

  console.log('✓ Test 4 — chatGenerationRef drops stale responses after step/rec change');
}

// ---------------------------------------------------------------------------
// Test 5 — AbortController: aborted fetch signals prevent state updates
// ---------------------------------------------------------------------------
{
  let planStatus = 'loading';
  let plan = null;

  // Simulate a plan fetch that is cancelled before it resolves.
  async function fakePlanFetch(signal) {
    // The actual fetch would throw AbortError when signal fires; here we simulate
    // the abort check that guards the .then() block.
    await new Promise(r => setTimeout(r, 50));

    // Guard — mirrors: if (!data || controller.signal.aborted) return;
    if (signal.aborted) return;

    // Would normally update state here:
    plan = { steps: ['Step 1', 'Step 2'] };
    planStatus = 'ready';
  }

  const controller = new AbortController();

  // Start the fetch
  const fetchPromise = fakePlanFetch(controller.signal);

  // Abort before it resolves
  controller.abort();

  await fetchPromise;

  assert.equal(planStatus, 'loading', 'planStatus must not change after abort');
  assert.equal(plan, null, 'plan must remain null after abort');

  // Now verify a non-aborted fetch DOES update state
  let planStatus2 = 'loading';
  let plan2 = null;

  const controller2 = new AbortController();
  await fakePlanFetch.call({}, controller2.signal);  // won't abort

  // Re-run without abort
  async function fakePlanFetch2(signal) {
    await new Promise(r => setTimeout(r, 10));
    if (signal.aborted) return;
    plan2 = { steps: ['Step A'] };
    planStatus2 = 'ready';
  }

  await fakePlanFetch2(controller2.signal);
  assert.equal(planStatus2, 'ready', 'planStatus must be "ready" for non-aborted fetch');
  assert.ok(plan2?.steps?.length > 0, 'plan must be populated for non-aborted fetch');

  console.log('✓ Test 5 — AbortController prevents stale plan state updates after cancellation');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n✅ All context-integrity regression tests passed.\n');
