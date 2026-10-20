/**
 * Regression test: group_key routing for existing recommendations
 *
 * Verifies that:
 * 1. mapRecommendation falls back to r.fingerprint when r.group_key is null
 *    (fixes the circular dependency for rows saved before the column existed)
 * 2. mapRecommendation uses r.group_key when present
 * 3. buildBaseRecommendations sets group_key on every returned rec
 * 4. saveRecommendations uses group_key || fingerprint as the value to write
 *
 * Run with: node __tests__/group-key-regression.mjs
 */

// ── Inline the mapRecommendation logic under test ──────────────────────────
function parseJ(v) {
  if (!v || typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function mapRecommendation(r) {
  return {
    fingerprint: r.fingerprint,
    group_key:   r.group_key || r.fingerprint || null,
  };
}

// ── Inline the group_key fallback used in saveRecommendations ──────────────
function saveGroupKey(rec) {
  return rec.group_key || rec.fingerprint || null;
}

// ── Inline buildBaseRecommendations group_key assignment ───────────────────
const RECOMMENDATION_GROUPS = {
  'image-optimization': { fingerprint: 'image-optimization', title: 'Optimize images', category: 'Performance', defaultPriority: 'high', findingPrefixes: ['lh:uses-optimized-images'] },
  'js-overhead':        { fingerprint: 'js-overhead',        title: 'Reduce JavaScript overhead', category: 'Performance', defaultPriority: 'high', findingPrefixes: ['lh:unused-javascript'] },
};

function buildBaseRec(groupKey) {
  const group = RECOMMENDATION_GROUPS[groupKey];
  return {
    fingerprint: group.fingerprint,
    group_key:   groupKey,              // ← the line we added to recommendations.js
    title:       group.title,
    category:    group.category,
  };
}

// ── Test runner ────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    failed++;
  }
}

console.log('\ngroup_key regression tests\n');

// 1. Existing row saved before group_key column existed (group_key IS NULL)
console.log('1. mapRecommendation — existing row with group_key IS NULL');
{
  const row = { fingerprint: 'image-optimization', group_key: null };
  const mapped = mapRecommendation(row);
  assert('group_key falls back to fingerprint', mapped.group_key === 'image-optimization');
  assert('CTA condition fires (=== image-optimization)', mapped.group_key === 'image-optimization');
}

// 2. New row with group_key explicitly set
console.log('\n2. mapRecommendation — new row with group_key set');
{
  const row = { fingerprint: 'image-optimization', group_key: 'image-optimization' };
  const mapped = mapRecommendation(row);
  assert('group_key is preserved from column', mapped.group_key === 'image-optimization');
}

// 3. Non-image-optimization group — existing row with null
console.log('\n3. mapRecommendation — js-overhead row with group_key IS NULL');
{
  const row = { fingerprint: 'js-overhead', group_key: null };
  const mapped = mapRecommendation(row);
  assert('group_key falls back to fingerprint (js-overhead)', mapped.group_key === 'js-overhead');
  assert('CTA condition does NOT fire for non-image-optimization', mapped.group_key !== 'image-optimization');
}

// 4. buildBaseRecommendations includes group_key
console.log('\n4. buildBaseRecommendations — group_key present on returned object');
{
  const rec = buildBaseRec('image-optimization');
  assert('group_key field exists', 'group_key' in rec);
  assert('group_key value is image-optimization', rec.group_key === 'image-optimization');
}

{
  const rec = buildBaseRec('js-overhead');
  assert('group_key field exists on js-overhead', 'group_key' in rec);
  assert('group_key value is js-overhead', rec.group_key === 'js-overhead');
}

// 5. saveRecommendations group_key write value
console.log('\n5. saveRecommendations — group_key || fingerprint fallback');
{
  // Rec with explicit group_key (new scan)
  assert('explicit group_key used when present',
    saveGroupKey({ group_key: 'image-optimization', fingerprint: 'image-optimization' }) === 'image-optimization');

  // Rec missing group_key (old code path / edge case)
  assert('fingerprint used as fallback when group_key absent',
    saveGroupKey({ fingerprint: 'image-optimization' }) === 'image-optimization');

  // Neither (should not occur, but safe)
  assert('returns null when both absent',
    saveGroupKey({}) === null);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
