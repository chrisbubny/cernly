/**
 * Tests for static-guidance.js — evidence-aware TTFB branching and request-chain plan.
 *
 * Run: node __tests__/static-guidance-evidence.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mod = await import(path.resolve(__dirname, '../lib/static-guidance.js'));
const { getStaticGuidance, getSupportedGroupKeys } = mod;

assert.ok(typeof getStaticGuidance === 'function', 'getStaticGuidance must be exported');
assert.ok(typeof getSupportedGroupKeys === 'function', 'getSupportedGroupKeys must be exported');

// Adapter: getStaticGuidance(rec, persona) → plan object matching test expectations
function buildStaticPlan(groupKey, rec, persona = 'developer') {
  return getStaticGuidance({ ...rec, fingerprint: groupKey, group_key: groupKey }, persona);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRec(fingerprint, evidence = {}) {
  return {
    fingerprint,
    evidence,
    supporting_findings: [],
    finding_fingerprints: [],
  };
}

function getStep1Text(plan) {
  const step = plan.steps[0];
  return JSON.stringify({
    ownerAction:     step.owner?.action     || '',
    ownerWhy:        step.owner?.why        || '',
    ownerDelegation: step.owner?.delegation || '',
    devNotes:        step.developer?.notes  || '',
    devAction:       step.developer?.action || '',
    cmsAction:       step['cms-admin']?.action || null,
  });
}

// ─── server-performance: fast TTFB (< 600 ms) ────────────────────────────────

{
  const plan = buildStaticPlan('server-performance', makeRec('server-performance', { ttfb: 320 }));
  assert.ok(plan, 'server-performance plan should exist');
  assert.ok(plan.steps.length >= 2, 'should have at least 2 steps');

  const text = getStep1Text(plan);

  // Must acknowledge fast TTFB — not assert slowness
  assert.ok(text.includes('320') || text.includes('good') || text.includes('fast') || text.includes('within'),
    'fast TTFB: step 1 should acknowledge measured fast TTFB, not claim slowness');

  // Must NOT assert the server is slow
  assert.ok(!text.toLowerCase().includes('slow server') && !text.toLowerCase().includes('investigate why the server is slow'),
    'fast TTFB: step 1 must not claim server is slow');

  // action field must be evidence-aware
  assert.ok(!plan.steps[0].owner.action.includes('[not measured'),
    'fast TTFB: action must not contain [not measured] token');

  // delegation must not assert slow server
  assert.ok(!plan.steps[0].owner.delegation.toLowerCase().includes('slow'),
    'fast TTFB: delegation must not assert slowness');

  console.log('✓ server-performance fast TTFB (320 ms)');
}

// ─── server-performance: slow TTFB (≥ 600 ms) ────────────────────────────────

{
  const plan = buildStaticPlan('server-performance', makeRec('server-performance', { ttfb: 1800 }));
  const text = getStep1Text(plan);

  // Must mention slow/improvement
  assert.ok(
    text.includes('1800') || text.includes('1,800') || text.includes('above') || text.includes('improvement'),
    'slow TTFB: step 1 should reference measured TTFB or note it needs improvement'
  );

  // Must NOT tell user to merely measure — it should give actionable advice
  assert.ok(
    !plan.steps[0].owner.action.includes('was not measured') &&
    !plan.steps[0].owner.action.includes('not captured'),
    'slow TTFB: should not say TTFB was not measured'
  );

  console.log('✓ server-performance slow TTFB (1800 ms)');
}

// ─── server-performance: unknown TTFB (null) ─────────────────────────────────

{
  const plan = buildStaticPlan('server-performance', makeRec('server-performance', {}));
  const step = plan.steps[0];
  const text = getStep1Text(plan);

  // Must NOT assert slow server for unknown TTFB
  assert.ok(
    !text.toLowerCase().includes('slow server') &&
    !text.toLowerCase().includes('investigate why the server is slow') &&
    !text.toLowerCase().includes('server is slow to respond'),
    'unknown TTFB: step 1 must not assert slow server when TTFB is unknown'
  );

  // action must acknowledge the measurement is missing
  assert.ok(
    step.owner.action.includes('not measured') || step.owner.action.includes('not captured') ||
    step.owner.action.includes('manual test') || step.owner.action.includes('not been measured'),
    'unknown TTFB: owner action should acknowledge missing measurement'
  );

  // developer action must NOT contain [not measured] as a token substitution (should use prose)
  assert.ok(
    !step.developer.action.includes('[not measured in this scan]'),
    'unknown TTFB: developer action must not fall through to raw {{token}} substitution'
  );

  // why field must not assert slow server
  const ownerWhy = step.owner?.why || '';
  assert.ok(
    !ownerWhy.toLowerCase().includes('slow server') && !ownerWhy.toLowerCase().includes('a slow server delays'),
    'unknown TTFB: why field must not assert slow server'
  );

  console.log('✓ server-performance unknown TTFB (null)');
}

// ─── server-performance: TTFB exactly at 600 ms boundary ─────────────────────

{
  const plan600 = buildStaticPlan('server-performance', makeRec('server-performance', { ttfb: 600 }));
  const text600 = getStep1Text(plan600);
  // 600 ms is "slow" (needs improvement per Lighthouse threshold)
  assert.ok(
    !text600.toLowerCase().includes('good range') && !text600.toLowerCase().includes('within the'),
    'TTFB=600: should not be classified as fast (600 is at the threshold, treated as slow)'
  );
  console.log('✓ server-performance TTFB boundary (600 ms → slow)');
}

// ─── server-performance: plan() backward compat — steps array still works ────

{
  // The plan() helper was changed from steps[] to stepsOrFn.
  // Confirm existing array-based plans still work by checking a different group.
  const plan = buildStaticPlan('resource-efficiency', makeRec('resource-efficiency', { totalByteWeightKib: 2048 }));
  assert.ok(plan, 'resource-efficiency plan should exist');
  assert.ok(Array.isArray(plan.steps) && plan.steps.length > 0, 'resource-efficiency should have steps');
  assert.ok(plan.evidenceSummary.includes('2048') || plan.evidenceSummary.includes('KiB'),
    'resource-efficiency evidenceSummary should reference measured values');
  console.log('✓ plan() backward compatibility (array steps)');
}

// ─── request-chain plan exists ────────────────────────────────────────────────

{
  const plan = buildStaticPlan('request-chain', makeRec('request-chain', {}));
  assert.ok(plan, 'request-chain plan must exist');
  assert.ok(Array.isArray(plan.steps) && plan.steps.length >= 2, 'request-chain should have at least 2 steps');
  // All steps must have owner and developer
  for (const step of plan.steps) {
    assert.ok(step.owner?.action, `request-chain step "${step.title}" must have owner.action`);
    assert.ok(step.developer?.action, `request-chain step "${step.title}" must have developer.action`);
  }
  console.log('✓ request-chain plan exists with owner + developer for all steps');
}

// ─── request-chain: no server latency assertions ──────────────────────────────

{
  const plan = buildStaticPlan('request-chain', makeRec('request-chain', {}));
  const allText = JSON.stringify(plan);
  const badPhrases = [
    'ttfb', 'time to first byte', 'server response time', 'slow server',
    'slow to respond', 'server is slow', 'investigate why the server',
  ];
  for (const phrase of badPhrases) {
    assert.ok(
      !allText.toLowerCase().includes(phrase),
      `request-chain plan must not contain server latency assertion: "${phrase}"`
    );
  }
  console.log('✓ request-chain plan: no server latency assertions');
}

// ─── request-chain: evidence tokens substituted ───────────────────────────────

{
  const plan = buildStaticPlan('request-chain', makeRec('request-chain', {
    criticalChainRequests: 7,
    criticalChainDepth: 3,
  }));
  assert.ok(
    plan.evidenceSummary.includes('7') || plan.evidenceSummary.includes('request'),
    'request-chain evidenceSummary should include chain request count'
  );
  console.log('✓ request-chain evidence substitution');
}

// ─── request-chain: unknown evidence graceful ─────────────────────────────────

{
  const plan = buildStaticPlan('request-chain', makeRec('request-chain', {}));
  // Should not expose raw {{token}} strings
  assert.ok(!JSON.stringify(plan).includes('{{'), 'no unresolved {{token}} in request-chain plan');
  console.log('✓ request-chain unknown evidence: no raw tokens');
}

// ─── server-performance: no raw {{token}} in unknown case ─────────────────────

{
  const plan = buildStaticPlan('server-performance', makeRec('server-performance', {}));
  assert.ok(!JSON.stringify(plan).includes('{{'), 'no unresolved {{token}} in server-performance unknown TTFB plan');
  console.log('✓ server-performance unknown TTFB: no raw {{token}} strings');
}

// ─── server-performance: cms-admin step in all TTFB cases ─────────────────────

{
  for (const [label, ttfb] of [['fast', 300], ['slow', 900], ['unknown', null]]) {
    const ev = ttfb !== null ? { ttfb } : {};
    const plan = buildStaticPlan('server-performance', makeRec('server-performance', ev));
    // cms-admin is optional on step 1 (fast/unknown) but must exist on steps 2+
    const step2 = plan.steps[1];
    assert.ok(step2?.['cms-admin']?.action, `server-performance ${label}: step 2 must have cms-admin`);
    console.log(`✓ server-performance ${label} TTFB: cms-admin present on step 2`);
  }
}

console.log('\n✅ All static-guidance-evidence tests passed.');
