/**
 * finding-rec-architecture.mjs
 *
 * Tests for the finding-level recommendation architecture:
 *
 * 1. Canonical fingerprint identity — multiple scan entries sharing one audit
 *    collapse to a single finding rec.
 * 2. Group recs continue to work; finding recs are emitted only for unmatched
 *    critical/warning issues.
 * 3. Guidance cache isolation — getGuidancePlan/setGuidancePlan scope to report_id.
 * 4. compareRecommendations currFingerprintSet includes canonical IDs (suffix-mismatch fix).
 * 5. Verification with fewer affected resources still resolves correctly.
 * 6. rec_type is persisted in saveRecommendations INSERT.
 * 7. enrichRecommendationsWithAI excludes finding recs from AI batch.
 * 8. guide-plan fallback includes evidence for honest unavailable state.
 *
 * Run with: node __tests__/finding-rec-architecture.mjs
 */

import assert       from 'assert/strict';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { resolve }  from 'path';

// Modules that can be directly imported (no @/ alias resolution needed)
import { assignIssueFingerprintIds } from '../lib/scoring.js';
import { compareRecommendations }    from '../lib/comparison.js';

const __dir = fileURLToPath(new URL('..', import.meta.url));
const src   = (rel) => readFile(resolve(__dir, rel), 'utf-8');

let passed = 0, failed = 0;

function test(description, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => {
        console.log(`  ✓ ${description}`);
        passed++;
      }).catch(e => {
        console.error(`  ✗ FAIL: ${description}`);
        console.error(`         ${e.message}`);
        failed++;
      });
    }
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`         ${e.message}`);
    failed++;
  }
  return Promise.resolve();
}

async function run() {

// ─── 1. Canonical fingerprint identity ───────────────────────────────────────

console.log('\n1. assignIssueFingerprintIds — canonical identity');

await test('first occurrence: fingerprintId === canonicalFingerprintId', () => {
  const [issue] = assignIssueFingerprintIds([
    { source: 'lh', auditId: 'render-blocking-resources', message: 'Render-blocking resources', severity: 'warning' },
  ]);
  assert.equal(issue.fingerprintId, 'lh:render-blocking-resources');
  assert.equal(issue.canonicalFingerprintId, 'lh:render-blocking-resources');
});

await test('second occurrence: fingerprintId gets :2 suffix; canonicalFingerprintId unchanged', () => {
  const issues = assignIssueFingerprintIds([
    { source: 'lh', auditId: 'render-blocking-resources', message: 'First',  severity: 'warning' },
    { source: 'lh', auditId: 'render-blocking-resources', message: 'Second', severity: 'warning' },
  ]);
  assert.equal(issues[0].fingerprintId, 'lh:render-blocking-resources');
  assert.equal(issues[0].canonicalFingerprintId, 'lh:render-blocking-resources');
  assert.equal(issues[1].fingerprintId, 'lh:render-blocking-resources:2');
  assert.equal(issues[1].canonicalFingerprintId, 'lh:render-blocking-resources');
});

await test('third occurrence: :3 suffix; canonical unchanged', () => {
  const issues = assignIssueFingerprintIds([
    { source: 'lh', auditId: 'render-blocking-resources', message: 'A', severity: 'warning' },
    { source: 'lh', auditId: 'render-blocking-resources', message: 'B', severity: 'warning' },
    { source: 'lh', auditId: 'render-blocking-resources', message: 'C', severity: 'warning' },
  ]);
  assert.equal(issues[2].fingerprintId, 'lh:render-blocking-resources:3');
  assert.equal(issues[2].canonicalFingerprintId, 'lh:render-blocking-resources');
});

await test('different audits get independent counters (no cross-audit suffix bleed)', () => {
  const issues = assignIssueFingerprintIds([
    { source: 'lh', auditId: 'unused-javascript', message: 'JS',  severity: 'warning' },
    { source: 'lh', auditId: 'render-blocking-resources', message: 'Render', severity: 'warning' },
    { source: 'lh', auditId: 'unused-javascript', message: 'JS2', severity: 'warning' },
  ]);
  assert.equal(issues[0].fingerprintId, 'lh:unused-javascript');
  assert.equal(issues[1].fingerprintId, 'lh:render-blocking-resources');
  assert.equal(issues[2].fingerprintId, 'lh:unused-javascript:2');
  assert.equal(issues[2].canonicalFingerprintId, 'lh:unused-javascript');
});

// ─── 2. buildBaseRecommendations — source code verification ──────────────────
// (Cannot import recommendations.js directly due to @/ aliases; verify via source)

console.log('\n2. buildBaseRecommendations — source verification');

await test('finding recs emitted for unmatched critical/warning issues', async () => {
  const code = await src('lib/recommendations.js');
  assert.ok(code.includes("rec_type:             'finding'"), "rec_type: 'finding' emitted");
  assert.ok(code.includes('unmatchedByCanonical'), 'unmatchedByCanonical map used to collapse duplicates');
  assert.ok(code.includes('coveredCanonicalIds'), 'coveredCanonicalIds tracks group-matched issues');
  // Source uses a destructured `severity` variable, not `issue.severity`
  assert.ok(code.includes("severity !== 'critical' && severity !== 'warning'"),
    'info/good issues excluded from finding recs');
});

await test('group recs carry rec_type = "group"', async () => {
  const code = await src('lib/recommendations.js');
  assert.ok(code.includes("rec_type:            'group'"), "rec_type: 'group' on group recs");
});

await test('finding_fingerprints uses canonical IDs (deduped) for group recs', async () => {
  const code = await src('lib/recommendations.js');
  assert.ok(code.includes('canonicalFingerprintId || i.fingerprintId') &&
            code.includes('uniqueFindingFingerprints'),
    'group recs deduplicate canonical fingerprints in finding_fingerprints[]');
});

await test('multiple entries sharing one canonical fingerprint share one finding rec', async () => {
  const code = await src('lib/recommendations.js');
  // The code iterates unmatchedByCanonical (Map keyed by canonicalId),
  // so each canonical ID produces exactly one finding rec regardless of entry count.
  assert.ok(code.includes('for (const [canonicalId, entries] of unmatchedByCanonical.entries())'),
    'finding rec loop is keyed by canonical ID → one rec per canonical fingerprint');
  assert.ok(code.includes('supporting_findings:  supportingFindings'),
    'all entries preserved in supporting_findings');
});

// ─── 3. Guidance cache isolation ─────────────────────────────────────────────

console.log('\n3. Guidance cache isolation');

await test('getGuidancePlan query includes report_id = $3', async () => {
  const code = await src('lib/store.js');
  // Extract the getGuidancePlan function body
  const fn = code.slice(code.indexOf('export async function getGuidancePlan'));
  const firstBrace = fn.indexOf('{');
  // Find the closing brace (rough)
  const queryPart = fn.slice(firstBrace, fn.indexOf('}\n', firstBrace + 1) + 500);
  assert.ok(queryPart.includes('report_id') && queryPart.includes('$3'),
    'getGuidancePlan query filters by report_id ($3)');
});

await test('setGuidancePlan query includes report_id = $3', async () => {
  const code = await src('lib/store.js');
  const fn = code.slice(code.indexOf('export async function setGuidancePlan'));
  const firstBrace = fn.indexOf('{');
  const queryPart = fn.slice(firstBrace, fn.indexOf('}\n', firstBrace + 1) + 500);
  assert.ok(queryPart.includes('report_id') && queryPart.includes('$3'),
    'setGuidancePlan query filters by report_id ($3)');
});

await test('guide-plan route passes report.id (integer PK) to both cache functions', async () => {
  const code = await src('app/api/guide-plan/route.js');
  assert.ok(/getGuidancePlan\([^)]*report\.id[^)]*\)/.test(code),
    'getGuidancePlan called with report.id');
  assert.ok(/setGuidancePlan\([^)]*report\.id[^)]*\)/.test(code),
    'setGuidancePlan called with report.id');
});

// ─── 4. compareRecommendations — suffix-mismatch fix ─────────────────────────

console.log('\n4. compareRecommendations — canonical fingerprint in currFingerprintSet');

await test('currFingerprintSet uses flatMap to include both fingerprintId and canonicalFingerprintId', async () => {
  const code = await src('lib/comparison.js');
  assert.ok(
    code.includes('flatMap(i => [i.fingerprintId, i.canonicalFingerprintId]'),
    'comparison.js flatMaps both IDs into currFingerprintSet'
  );
});

await test('finding rec classified as still_open when canonical variant present in curr scan', () => {
  // Previous rec has finding_fingerprints = ['lh:render-blocking-resources'] (canonical)
  // Current scan has the same audit with ordinal suffix (:2); flatMap fix ensures it matches.
  const prevRecs = [
    {
      fingerprint:          'lh:render-blocking-resources',
      rec_type:             'finding',
      group_key:            null,
      priority:             'high',
      finding_fingerprints: ['lh:render-blocking-resources'],
    },
  ];
  const currRecs    = [];
  const currIssues  = [
    {
      fingerprintId:          'lh:render-blocking-resources:2',
      canonicalFingerprintId: 'lh:render-blocking-resources',
      severity: 'warning',
    },
  ];
  const comparison = compareRecommendations(prevRecs, currRecs, currIssues, {});
  // compareRecommendations returns { rec, currentRec, ... } objects — fingerprint is on .rec
  const stillOpen = comparison.still_open.find(r => r.rec?.fingerprint === 'lh:render-blocking-resources');
  assert.ok(stillOpen,
    'finding rec is still_open when canonical variant appears in curr scan with ordinal suffix');
});

await test('finding rec classified as likely_resolved when audit absent and audit completed', () => {
  const prevRecs = [
    {
      fingerprint:          'lh:critical-request-chains',
      rec_type:             'finding',
      group_key:            null,
      priority:             'high',
      finding_fingerprints: ['lh:critical-request-chains'],
    },
  ];
  const comparison = compareRecommendations(
    prevRecs, [], [], { performance: { status: 'completed' } }
  );
  // compareRecommendations returns { rec, ... } objects — fingerprint is on .rec
  const resolved = comparison.likely_resolved.find(r => r.rec?.fingerprint === 'lh:critical-request-chains');
  assert.ok(resolved, 'finding rec is likely_resolved when absent and audit completed');
});

await test('finding rec stays still_open when audit present with fewer resources (partially improved)', () => {
  const prevRecs = [
    {
      fingerprint:          'lh:render-blocking-resources',
      rec_type:             'finding',
      group_key:            null,
      priority:             'high',
      finding_fingerprints: ['lh:render-blocking-resources'],
    },
  ];
  const currIssues = [
    {
      fingerprintId:          'lh:render-blocking-resources',
      canonicalFingerprintId: 'lh:render-blocking-resources',
      severity: 'warning',
      items: [{ url: 'https://example.com/one.js' }],
    },
  ];
  const comparison = compareRecommendations(
    prevRecs, [], currIssues, { performance: { status: 'completed' } }
  );
  // Even with audit_status = completed, finding is still_open because the issue is present
  const stillOpen = comparison.still_open.find(r => r.rec?.fingerprint === 'lh:render-blocking-resources');
  assert.ok(stillOpen, 'finding rec stays still_open when audit still present (fewer resources)');
});

// ─── 5. saveRecommendations — rec_type in INSERT ─────────────────────────────

console.log('\n5. saveRecommendations — rec_type in INSERT');

await test('INSERT statement includes rec_type column', async () => {
  const code = await src('lib/store.js');
  const insertIdx = code.indexOf('INSERT INTO recommendations');
  assert.ok(insertIdx !== -1, 'INSERT statement found in store.js');
  const insertSlice = code.slice(insertIdx, insertIdx + 400);
  assert.ok(insertSlice.includes('rec_type'), 'rec_type column in INSERT');
});

await test('mapRecommendation exposes rec_type field', async () => {
  const code = await src('lib/store.js');
  assert.ok(code.includes("rec_type:             r.rec_type"),
    'mapRecommendation maps r.rec_type');
});

await test('mapRecommendation defaults to "group" for rows without rec_type column', async () => {
  const code = await src('lib/store.js');
  assert.ok(code.includes("r.rec_type     || 'group'"),
    "mapRecommendation falls back to 'group' for old rows");
});

// ─── 6. migration 003 ────────────────────────────────────────────────────────

console.log('\n6. Migration 003 — rec_type column');

await test('scripts/migrate.js includes 003_add_rec_type_column', async () => {
  const code = await src('scripts/migrate.js');
  assert.ok(code.includes('003_add_rec_type_column'), 'migration 003 present');
  assert.ok(code.includes("rec_type TEXT NOT NULL DEFAULT 'group'"), 'column definition correct');
  assert.ok(code.includes("CHECK (rec_type IN ('group', 'finding'))"), 'CHECK constraint present');
  assert.ok(code.includes('ADD COLUMN IF NOT EXISTS'), 'migration is idempotent');
});

// ─── 7. enrichRecommendationsWithAI excludes finding recs ────────────────────

console.log('\n7. enrichRecommendationsWithAI — finding recs excluded from batch');

await test('groupRecs and findingRecs filtered before building prompt', async () => {
  const code = await src('lib/recommendations.js');
  assert.ok(code.includes("filter(r => (r.rec_type || 'group') === 'group')"),
    'groupRecs filter is present');
  assert.ok(code.includes("filter(r => r.rec_type === 'finding')"),
    'findingRecs filter is present');
});

await test('finding recs are merged back in after enrichment', async () => {
  const code = await src('lib/recommendations.js');
  assert.ok(code.includes('[...enrichedGroupRecs, ...findingRecs]'),
    'finding recs merged back into return value');
});

await test('prompt length calculation uses groupRecs.length not baseRecs.length', async () => {
  const code = await src('lib/recommendations.js');
  assert.ok(code.includes('groupRecs.length - 1}'),
    'prompt index range uses groupRecs.length');
  // enrichments.length is compared against groupRecs.length
  assert.ok(code.includes('enrichments.length !== groupRecs.length'),
    'length mismatch check uses groupRecs.length');
});

// ─── 8. guide-plan fallback evidence ─────────────────────────────────────────

console.log('\n8. guide-plan fallback — honest unavailable state');

await test('fallback response includes supporting_findings from rec', async () => {
  const code = await src('app/api/guide-plan/route.js');
  assert.ok(code.includes('supporting_findings: rec.supporting_findings'),
    'fallback includes rec.supporting_findings');
});

await test('fallback response includes evidence from rec', async () => {
  const code = await src('app/api/guide-plan/route.js');
  assert.ok(code.includes('evidence: rec.evidence'), 'fallback includes rec.evidence');
});

await test('fallback response includes what_we_found from rec', async () => {
  const code = await src('app/api/guide-plan/route.js');
  assert.ok(code.includes('what_we_found: rec.what_we_found'), 'fallback includes what_we_found');
});

// ─── 9. ReportClient.js canonical ID fallback lookup ─────────────────────────

console.log('\n9. ReportClient.js — canonical ID fallback lookup');

await test('FixCard lookup falls back to canonicalFingerprintId for finding recs', async () => {
  const code = await src('app/report/[slug]/ReportClient.js');
  const matches = (code.match(/recMap\[fp\] \|\| recMap\[cid\]/g) || []).length;
  assert.ok(matches >= 2,
    `at least 2 canonical fallback lookups in ReportClient.js (found: ${matches})`);
});

await test('cid is derived from canonicalFingerprintId in ReportClient.js', async () => {
  const code = await src('app/report/[slug]/ReportClient.js');
  assert.ok(code.includes('issue.canonicalFingerprintId || fp'),
    'cid falls back to fp when canonicalFingerprintId absent');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────────────────────`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);
if (failed > 0) process.exit(1);

} // end run()

run().catch(e => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});
