#!/usr/bin/env node
/**
 * scripts/check-models.mjs
 *
 * Diagnostic: verify which Anthropic models are accessible for the configured
 * API key, and confirm each model in the Ask Cernly fallback chain responds.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/check-models.mjs
 *
 * What it does:
 *   1. GET /v1/models  — lists every model ID available to this account
 *   2. For each model in MODEL_PREFERENCE, sends a minimal messages request
 *      (user: "ping", max_tokens: 5) and reports the outcome
 *
 * Security:
 *   - Never logs the API key value
 *   - Never logs request/response body beyond sanitized error type and status
 *   - Safe to run in a terminal; output contains no secrets
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_VERSION = '2023-06-01';
const BASE_URL = 'https://api.anthropic.com';

// Must match MODEL_PREFERENCE in app/api/ask/route.js exactly
const MODEL_PREFERENCE = [
  'claude-haiku-5-5',
  'claude-sonnet-5-5',
  'claude-3-5-sonnet-20241022',
];

if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/check-models.mjs');
  process.exit(1);
}

const headers = {
  'x-api-key': API_KEY,
  'anthropic-version': ANTHROPIC_VERSION,
  'content-type': 'application/json',
};

// ── 1. List available models ──────────────────────────────────────────────────
console.log('\n=== Step 1: List models available to this API key ===\n');

let availableModelIds = [];
try {
  const res = await fetch(`${BASE_URL}/v1/models`, { headers });
  const status = res.status;
  if (!res.ok) {
    const body = await res.text();
    // Sanitize: only log status code and first 200 chars (no secrets)
    console.error(`  GET /v1/models → ${status}`);
    console.error(`  Error body (truncated): ${body.slice(0, 200)}`);
  } else {
    const data = await res.json();
    availableModelIds = (data.data || []).map(m => m.id);
    console.log(`  Found ${availableModelIds.length} model(s):`);
    for (const id of availableModelIds) {
      const inChain = MODEL_PREFERENCE.includes(id) ? ' ← in MODEL_PREFERENCE' : '';
      console.log(`    ${id}${inChain}`);
    }
  }
} catch (err) {
  console.error('  Network error calling /v1/models:', err.message);
}

// Cross-reference MODEL_PREFERENCE against available list
console.log('\n  MODEL_PREFERENCE cross-reference:');
for (const model of MODEL_PREFERENCE) {
  const listed = availableModelIds.includes(model);
  console.log(`    ${model}: ${listed ? '✓ listed' : '✗ NOT in /v1/models response'}`);
}

// ── 2. Test each model in MODEL_PREFERENCE ────────────────────────────────────
console.log('\n=== Step 2: Test minimal request to each model in MODEL_PREFERENCE ===\n');

const results = [];

for (const model of MODEL_PREFERENCE) {
  process.stdout.write(`  Testing ${model} ... `);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const elapsed = Date.now() - start;
    const status = res.status;

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.[0]?.text ?? '(no text)';
      const usedModel = data.model ?? model;
      console.log(`✓ ${status} OK (${elapsed}ms) — responded: "${text.trim()}" [model=${usedModel}]`);
      results.push({ model, status, ok: true, elapsed });
    } else {
      // Sanitize: extract errorType only (safe; no prompt/key data)
      let errorType = 'unknown';
      try {
        const body = await res.json();
        errorType = body?.error?.type ?? 'unknown';
      } catch (_) { /* non-JSON body */ }
      console.log(`✗ ${status} (${errorType}) in ${elapsed}ms`);
      results.push({ model, status, ok: false, errorType, elapsed });
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.name === 'TimeoutError') {
      console.log(`✗ TIMEOUT after ${elapsed}ms`);
      results.push({ model, status: 'timeout', ok: false, elapsed });
    } else {
      console.log(`✗ NETWORK ERROR: ${err.message} (${elapsed}ms)`);
      results.push({ model, status: 'network_error', ok: false, elapsed });
    }
  }
}

// ── 3. Summary ────────────────────────────────────────────────────────────────
console.log('\n=== Summary ===\n');

const working = results.filter(r => r.ok);
const failing = results.filter(r => !r.ok);

if (working.length > 0) {
  console.log(`  Working models (${working.length}):`);
  for (const r of working) {
    console.log(`    ✓ ${r.model} (${r.elapsed}ms)`);
  }
} else {
  console.log('  ✗ No models in MODEL_PREFERENCE responded successfully.');
}

if (failing.length > 0) {
  console.log(`\n  Failing models (${failing.length}):`);
  for (const r of failing) {
    const detail = r.errorType ? ` — ${r.errorType}` : '';
    console.log(`    ✗ ${r.model} → ${r.status}${detail}`);
  }
}

console.log('');
if (working.length === 0) {
  console.log('  ACTION REQUIRED: No model is reachable. Check that:');
  console.log('    1. ANTHROPIC_API_KEY is valid and matches the production secret');
  console.log('    2. The account has access to at least one of the listed models');
  console.log('    3. Step 1 above shows any model IDs at all');
  process.exit(1);
} else if (working[0].model !== MODEL_PREFERENCE[0]) {
  console.log(`  NOTE: Primary model (${MODEL_PREFERENCE[0]}) is not working.`);
  console.log(`        First working model: ${working[0].model}`);
  console.log(`        Consider promoting it to position 0 in MODEL_PREFERENCE.`);
}
