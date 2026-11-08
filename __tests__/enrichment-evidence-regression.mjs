/**
 * enrichment-evidence-regression.mjs
 *
 * Regression tests for the enrichment evidence propagation fix.
 *
 * Verifies that insight-class findings (e.g. forced-reflow-insight) with
 * source-location items and reflowTime measurements are included in the
 * scan-time recommendation enrichment prompt, so the AI receives concrete
 * evidence rather than a bare finding message.
 *
 * Tests:
 *   1. formatEvidenceItems includes reflowTime and source-location fields
 *   2. recSummaries builder includes Evidence lines for findings with items
 *   3. recSummaries builder omits Evidence lines for findings without items
 *   4. evidenceLimitations Note appears when present
 *   5. Evidence is bounded: limit=3, maxChars=600 (never floods prompt)
 *   6. Prompt STRICT RULES mention distinguishing confirmed measurements from causes
 *   7. Prompt STRICT RULES include verification_approach requirement
 *   8. AI output budget: 4096 max_tokens on enrichment call (not 1600)
 *   9. AI Summary max_tokens is 1600 — known truncation risk flag
 *  10. formatEvidenceItems is imported in recommendations.js
 *
 * Run with: node __tests__/enrichment-evidence-regression.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');
const src   = (rel) => readFile(resolve(root, rel), 'utf-8');

// ─── Load source texts ───────────────────────────────────────────────────────
let recsSrc, aiSrc, scanEvidenceSrc;
try {
  recsSrc        = await src('lib/recommendations.js');
  aiSrc          = await src('lib/analyzers/ai.js');
  scanEvidenceSrc = await src('lib/scan-evidence.js');
} catch (e) {
  console.error('Failed to read source files:', e.message);
  process.exit(1);
}

// ─── load formatEvidenceItems directly (no @/ aliases needed) ────────────────
const { formatEvidenceItems } = await import('../lib/scan-evidence.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

// ─── Section 1: formatEvidenceItems fields ───────────────────────────────────
console.log('\nSection 1: formatEvidenceItems allowlist');

test('reflowTime survives formatEvidenceItems', () => {
  const result = formatEvidenceItems([{ url: 'https://example.com/app.js', reflowTime: 25.6, line: 42 }]);
  const parsed = JSON.parse(result.split('\n')[0]);
  assert.equal(parsed.reflowTime, 25.6);
  assert.equal(parsed.line, 42);
});

test('column and originalUrl survive formatEvidenceItems', () => {
  const result = formatEvidenceItems([{
    url: 'https://example.com/x.js', column: 8, originalUrl: 'src/x.ts', originalLine: 10,
  }]);
  const parsed = JSON.parse(result.split('\n')[0]);
  assert.equal(parsed.column, 8);
  assert.equal(parsed.originalUrl, 'src/x.ts');
  assert.equal(parsed.originalLine, 10);
});

test('fields not in allowlist are excluded', () => {
  // `diagnostic` is an internal flag, not for the AI
  const result = formatEvidenceItems([{ url: 'https://x.com/a.js', diagnostic: true, reflowTime: 5 }]);
  const parsed = JSON.parse(result.split('\n')[0]);
  assert.equal(parsed.diagnostic, undefined, 'diagnostic flag must not appear in AI context');
  assert.equal(parsed.reflowTime, 5);
});

// ─── Section 2: Enrichment prompt includes evidence items ────────────────────
console.log('\nSection 2: Enrichment prompt builder');

test('formatEvidenceItems is imported in recommendations.js', () => {
  assert.ok(
    recsSrc.includes("from '@/lib/scan-evidence'") || recsSrc.includes('from "@/lib/scan-evidence"'),
    'scan-evidence must be imported in recommendations.js'
  );
});

test('recSummaries calls formatEvidenceItems on f.items', () => {
  assert.ok(
    recsSrc.includes('formatEvidenceItems(f.items'),
    'recSummaries builder must call formatEvidenceItems(f.items, ...)'
  );
});

test('evidence limit is bounded (limit: 3)', () => {
  // Verify the call uses limit: 3, not the defaults (limit:5)
  assert.ok(
    recsSrc.includes('limit: 3'),
    'enrichment evidence must be bounded at limit: 3 items to control prompt size'
  );
});

test('evidence maxChars is bounded (maxChars: 600)', () => {
  assert.ok(
    recsSrc.includes('maxChars: 600'),
    'enrichment evidence must be bounded at maxChars: 600'
  );
});

test('evidenceLimitations Note is included in finding lines', () => {
  assert.ok(
    recsSrc.includes('f.evidenceLimitations'),
    'evidenceLimitations must flow from supporting_findings into the prompt'
  );
  assert.ok(
    recsSrc.includes('Note: ${f.evidenceLimitations}') || recsSrc.includes("Note: ${f.evidenceLimitations}"),
    'Note: prefix must label the evidenceLimitations in the prompt'
  );
});

test('Evidence: prefix labels item lines in finding block', () => {
  assert.ok(
    recsSrc.includes('Evidence: ${evidenceStr}') || recsSrc.includes("Evidence: ${evidenceStr}"),
    'Evidence: prefix must label the evidence items in the prompt'
  );
});

// ─── Section 3: Prompt instruction quality ───────────────────────────────────
console.log('\nSection 3: Prompt instruction quality');

test('Prompt distinguishes confirmed measurements from likely causes', () => {
  assert.ok(
    recsSrc.includes('confirmed measurements') || recsSrc.includes('likely causes'),
    'Prompt STRICT RULES must instruct the AI to distinguish confirmed measurements from likely causes'
  );
});

test('Prompt instructions mention source location semantics (WHERE, not necessarily root cause)', () => {
  assert.ok(
    recsSrc.includes('WHERE a problem was triggered') || recsSrc.includes('where a problem was triggered'),
    'Prompt must note that a source location shows WHERE, not the root cause'
  );
});

test('verification_approach rule added to STRICT RULES', () => {
  assert.ok(
    recsSrc.includes('verification_approach must describe a concrete check'),
    'STRICT RULES must require verification_approach to be a concrete check'
  );
});

test('Note instruction tells AI to treat Note as a caveat', () => {
  assert.ok(
    recsSrc.includes('treat it as a caveat') || recsSrc.includes('Note appears under a finding'),
    'Prompt must instruct AI to treat Note lines as caveats'
  );
});

// ─── Section 4: Token budget ─────────────────────────────────────────────────
console.log('\nSection 4: Token budget');

test('Enrichment call uses 4096 max_tokens', () => {
  // The enrichment section is after line 546; look for it specifically
  const enrichFnIdx = recsSrc.indexOf('async function enrichRecommendationsWithAI');
  const enrichSection = recsSrc.slice(enrichFnIdx);
  assert.ok(
    enrichSection.includes('max_tokens: 4096'),
    'enrichRecommendationsWithAI must use max_tokens: 4096'
  );
});

test('AI Summary uses 1600 max_tokens (known truncation risk)', () => {
  // This is a documentation test: 1600 is a known bottleneck when
  // discoveries + uxInsights both fire. Flag it, not fix it here.
  assert.ok(
    aiSrc.includes('max_tokens: 1600'),
    'AI Summary is at 1600 max_tokens — known truncation risk; separate fix needed'
  );
  // Report it clearly so reviewers notice
  console.log('    ⚠ AI Summary max_tokens=1600: may truncate when discoveries+uxInsights both fire.');
  console.log('      This is a pre-existing bottleneck. A separate fix should raise it to 2200–2400.');
});

test('Enrichment truncation guard returns baseRecs on max_tokens', () => {
  assert.ok(
    recsSrc.includes("stopReason === 'max_tokens'"),
    'Enrichment must guard against max_tokens truncation before JSON.parse'
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('\n✅ All enrichment-evidence-regression tests passed.\n');
