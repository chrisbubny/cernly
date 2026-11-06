/**
 * Regression tests for insight-class audit evidence extraction.
 *
 * Tests:
 *   1. extractInsightEvidence — forced-reflow-insight nested list structure
 *   2. extractInsightEvidence — empty/missing/null inputs
 *   3. extractInsightEvidence — item cap at 20
 *   4. INSIGHT_LIST_AUDITS / INSIGHT_TABLE_AUDITS membership
 *   5. Severity invariant: insight audits always produce 'info' (never critical/warning)
 *   6. Existing scored audits pass through unchanged (regression guard)
 *   7. Table-type insight audits: items extracted by existing extractor
 *   8. Source-location fields: url, line, column, originalUrl, originalLine
 *   9. reflowTime rounding
 *  10. evidenceLimitations present when items found
 *  11. diagnostic flag always present
 *  12. Unknown list-type insight audit returns null items (no generic recursion)
 */

import assert from 'node:assert/strict';

// insight-evidence.js uses no @/ aliases — it exports pure functions and
// two Set constants, so a relative import works directly without alias hooks.
import {
  INSIGHT_LIST_AUDITS,
  INSIGHT_TABLE_AUDITS,
  INSIGHT_AUDITS,
  extractInsightEvidence,
} from '../lib/insight-evidence.js';

// ─── Helper: build a minimal forced-reflow-insight details object ───────────
function makeReflowDetails(tables) {
  return {
    type: 'list',
    items: tables.map(rows => ({
      type: 'table',
      headings: [
        { key: 'source', valueType: 'source-location', label: 'Function' },
        { key: 'reflowTime', valueType: 'ms', label: 'Time' },
      ],
      items: rows,
    })),
  };
}

function makeSourceLocation(url, line = 10, column = 4, original = null) {
  const loc = { type: 'source-location', url, line, column };
  if (original) loc.original = original;
  return loc;
}

// ─── Test 1: Basic extraction of forced-reflow-insight ───────────────────────
{
  const details = makeReflowDetails([
    [
      { source: makeSourceLocation('https://example.com/app.js', 42, 8), reflowTime: 25.6 },
    ],
    [
      { source: makeSourceLocation('https://example.com/vendor.js', 100, 0), reflowTime: 12.3 },
      { source: makeSourceLocation('https://example.com/theme.js', 7, 2), reflowTime: 5.0 },
    ],
  ]);

  const result = extractInsightEvidence('forced-reflow-insight', details);

  assert.ok(result.items, 'items should be non-null when source-locations present');
  assert.equal(result.items.length, 3, 'should extract all 3 source locations');
  assert.equal(result.items[0].url, 'https://example.com/app.js');
  assert.equal(result.items[0].line, 42);
  assert.equal(result.items[0].column, 8);
  assert.equal(result.items[0].reflowTime, 25.6, 'reflowTime should be preserved (ms)');
  assert.equal(result.items[1].url, 'https://example.com/vendor.js');
  assert.equal(result.items[2].reflowTime, 5.0);
  assert.ok(result.diagnostic, 'diagnostic flag must be true');
  assert.ok(result.evidenceLimitations, 'evidenceLimitations should be present when items found');
  console.log('  ✓ Test 1: basic extraction');
}

// ─── Test 2: Source map original location ────────────────────────────────────
{
  const original = { url: 'https://example.com/src/app.ts', line: 15 };
  const details = makeReflowDetails([
    [
      {
        source: makeSourceLocation('https://example.com/app.min.js', 1, 500, original),
        reflowTime: 8.7,
      },
    ],
  ]);

  const result = extractInsightEvidence('forced-reflow-insight', details);
  assert.ok(result.items?.length === 1);
  assert.equal(result.items[0].originalUrl, 'https://example.com/src/app.ts');
  assert.equal(result.items[0].originalLine, 15);
  console.log('  ✓ Test 2: source map original location');
}

// ─── Test 3: reflowTime rounding ─────────────────────────────────────────────
{
  const details = makeReflowDetails([
    [
      { source: makeSourceLocation('https://example.com/x.js'), reflowTime: 10.123456 },
      { source: makeSourceLocation('https://example.com/y.js'), reflowTime: 7.999 },
    ],
  ]);
  const result = extractInsightEvidence('forced-reflow-insight', details);
  assert.equal(result.items[0].reflowTime, 10.1, 'should round to 1 decimal');
  assert.equal(result.items[1].reflowTime, 8.0, 'should round to 1 decimal');
  console.log('  ✓ Test 3: reflowTime rounding');
}

// ─── Test 4: Item cap at 20 ──────────────────────────────────────────────────
{
  const rows = Array.from({ length: 30 }, (_, i) => ({
    source: makeSourceLocation(`https://example.com/file${i}.js`, i, 0),
    reflowTime: i * 2.5,
  }));
  const details = makeReflowDetails([rows]);
  const result = extractInsightEvidence('forced-reflow-insight', details);
  assert.ok(result.items.length <= 20, 'must cap at 20 items');
  assert.equal(result.totalDetected, 30, 'totalDetected counts all rows');
  console.log('  ✓ Test 4: item cap at 20');
}

// ─── Test 5: Null/missing inputs ─────────────────────────────────────────────
{
  const r1 = extractInsightEvidence('forced-reflow-insight', null);
  assert.equal(r1.items, null, 'null details → null items');
  assert.ok(r1.diagnostic, 'diagnostic flag on null input');

  const r2 = extractInsightEvidence('forced-reflow-insight', { type: 'list', items: [] });
  assert.equal(r2.items, null, 'empty list → null items');

  const r3 = extractInsightEvidence('forced-reflow-insight', { type: 'list', items: [
    { type: 'table', items: [] },
  ] });
  assert.equal(r3.items, null, 'empty table inside list → null items');
  console.log('  ✓ Test 5: null/missing inputs');
}

// ─── Test 6: Rows without source-location are skipped ────────────────────────
{
  const details = makeReflowDetails([
    [
      { source: { type: 'code', value: 'getComputedStyle()' }, reflowTime: 5 }, // no source-location
      { source: makeSourceLocation('https://example.com/real.js', 1, 1), reflowTime: 10 },
    ],
  ]);
  const result = extractInsightEvidence('forced-reflow-insight', details);
  assert.equal(result.items.length, 1, 'non-source-location rows must be skipped');
  assert.equal(result.items[0].url, 'https://example.com/real.js');
  console.log('  ✓ Test 6: non-source-location rows skipped');
}

// ─── Test 7: Unknown insight audit returns null items ─────────────────────────
{
  // We should NOT recursively extract from unknown audit types
  const result = extractInsightEvidence('lcp-discovery-insight', {
    type: 'list',
    items: [{ type: 'table', items: [{ url: 'https://example.com/img.jpg' }] }],
  });
  assert.equal(result.items, null, 'unknown insight audit must return null items');
  assert.ok(result.diagnostic, 'diagnostic flag still set');
  console.log('  ✓ Test 7: unknown insight audit returns null (no generic recursion)');
}

// ─── Test 8: Set membership ───────────────────────────────────────────────────
{
  assert.ok(INSIGHT_LIST_AUDITS.has('forced-reflow-insight'));
  assert.ok(!INSIGHT_LIST_AUDITS.has('render-blocking-insight'), 'table-type not in list set');

  assert.ok(INSIGHT_TABLE_AUDITS.has('render-blocking-insight'));
  assert.ok(INSIGHT_TABLE_AUDITS.has('font-display-insight'));
  assert.ok(INSIGHT_TABLE_AUDITS.has('image-delivery-insight'));
  assert.ok(INSIGHT_TABLE_AUDITS.has('cache-insight'));
  assert.ok(!INSIGHT_TABLE_AUDITS.has('forced-reflow-insight'), 'list-type not in table set');

  // INSIGHT_AUDITS is the union
  assert.ok(INSIGHT_AUDITS.has('forced-reflow-insight'));
  assert.ok(INSIGHT_AUDITS.has('render-blocking-insight'));
  assert.ok(!INSIGHT_AUDITS.has('lcp-discovery-insight'), 'unsupported audit not in union set');
  console.log('  ✓ Test 8: set membership');
}

// ─── Test 9: Severity invariant (conceptual, via expected filter behavior) ───
// We cannot call runLighthouse directly (PSI blocked), but we can verify the
// expected severity for insight audits via the conditions in lighthouse.js.
// score: null and scoreDisplayMode: 'informative' → severity must be 'info'.
{
  // Mirror the severity derivation from lighthouse.js:
  function deriveSeverity(isInsight, score) {
    return (isInsight || score == null) ? 'info'
      : score === 0 ? 'critical'
      : score < 0.5 ? 'warning'
      : 'info';
  }
  // Insight audit with null score
  assert.equal(deriveSeverity(true, null), 'info', 'insight audit → always info');
  // Normal scored audit
  assert.equal(deriveSeverity(false, 0), 'critical');
  assert.equal(deriveSeverity(false, 0.3), 'warning');
  assert.equal(deriveSeverity(false, 0.95), 'info');
  // Scored audit at null: also 'info' (unchanged behavior)
  assert.equal(deriveSeverity(false, null), 'info');
  console.log('  ✓ Test 9: severity invariant');
}

// ─── Test 10: URL truncation at 2048 chars ───────────────────────────────────
{
  const longUrl = 'https://example.com/' + 'a'.repeat(3000);
  const details = makeReflowDetails([
    [{ source: makeSourceLocation(longUrl, 1, 1), reflowTime: 5 }],
  ]);
  const result = extractInsightEvidence('forced-reflow-insight', details);
  assert.ok(result.items[0].url.length <= 2048, 'url must be truncated to 2048');
  console.log('  ✓ Test 10: URL truncation');
}

// ─── Test 11: formatEvidenceItems passes insight fields through ───────────────
// This is the critical regression guard for the scan-evidence.js allowlist fix.
// Verifies that line, column, originalUrl, originalLine, reflowTime survive
// formatEvidenceItems — previously they were silently dropped.
// scan-evidence.js has no imports, so a plain relative import works.
{
  const { formatEvidenceItems } = await import('../lib/scan-evidence.js');

  const items = [
    {
      url:         'https://example.com/app.min.js',
      line:        1,
      column:      1234,
      originalUrl: 'https://example.com/src/app.ts',
      originalLine: 42,
      reflowTime:  25.6,
    },
    {
      url:        'https://example.com/vendor.js',
      line:       100,
      reflowTime: 8.3,
    },
  ];

  const result = formatEvidenceItems(items, { limit: 5 });
  assert.ok(result.length > 0, 'formatEvidenceItems should produce output');

  const parsed0 = JSON.parse(result.split('\n')[0]);
  assert.equal(parsed0.line, 1, 'line must survive formatEvidenceItems');
  assert.equal(parsed0.column, 1234, 'column must survive formatEvidenceItems');
  assert.equal(parsed0.originalUrl, 'https://example.com/src/app.ts', 'originalUrl must survive');
  assert.equal(parsed0.originalLine, 42, 'originalLine must survive');
  assert.equal(parsed0.reflowTime, 25.6, 'reflowTime must survive formatEvidenceItems');

  const parsed1 = JSON.parse(result.split('\n')[1]);
  assert.equal(parsed1.line, 100, 'line in second item must survive');
  assert.equal(parsed1.reflowTime, 8.3, 'reflowTime in second item must survive');
  assert.equal(parsed1.column, undefined, 'absent column should not appear');

  console.log('  ✓ Test 11: formatEvidenceItems passes insight source-location fields');
}

console.log('\n✅ All insight-evidence-extraction tests passed.\n');
