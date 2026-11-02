// __tests__/chain-audit-extraction.mjs
//
// Unit tests for chain audit evidence extraction in lib/analyzers/lighthouse.js.
//
// Fixtures are sanitized from real PageSpeed Insights responses.
// Modern format structure (Pattern B) was verified against an actual PSI gist
// showing the network-dependency-tree-insight audit emitted by Lighthouse 13.
//
// Run: node __tests__/chain-audit-extraction.mjs

import assert from 'assert/strict';
import { extractAuditItems } from '../lib/analyzers/lighthouse.js';

// ---------------------------------------------------------------------------
// Sanitized real PSI fixtures
// ---------------------------------------------------------------------------

// Legacy format: Lighthouse ≤12, details.type === 'criticalrequestchain'
// Keys are hash strings (verified format from real PSI response).
// startTime/endTime are wall-clock seconds; longestChain.duration is in ms.
const LEGACY_FIXTURE = {
  type: 'criticalrequestchain',
  chains: {
    'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4': {
      request: {
        url: 'https://example.com/',
        startTime: 1000000.100,
        endTime:   1000000.350,
        responseReceivedTime: 1000000.349,
        transferSize: 2048,
      },
      children: {
        'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4:redirect': {
          request: {
            url: 'https://example.com/styles/main.css',
            startTime: 1000000.351,
            endTime:   1000000.420,
            responseReceivedTime: 1000000.419,
            transferSize: 15360,
          },
          children: {
            'B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5': {
              request: {
                url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw.woff2',
                startTime: 1000000.421,
                endTime:   1000000.488,
                responseReceivedTime: 1000000.487,
                transferSize: 31744,
              },
              children: {},
            },
          },
        },
      },
    },
  },
  longestChain: {
    duration: 388.2,   // ms
    length: 3,         // hop count
    transferSize: 49152,
  },
};

// Modern format Pattern B (verified from real PSI gist):
// details.type === 'list'; chain data is wrapped under section.value.
// This pattern was observed in actual Lighthouse 13 / PSI responses.
const MODERN_FIXTURE_PATTERN_B = {
  type: 'list',
  items: [
    {
      // No explicit type field needed — detected by presence of .value.chains
      value: {
        longestChain: { duration: 516 },
        chains: {
          '944F62704FE02863EE5CD6C6AE506765': {
            url: 'https://example.com/',
            navStartToEndTime: 200,
            transferSize: 6326,
            isLongest: false,
            children: {
              'C1D2E3F4A5B6C1D2E3F4A5B6C1D2E3F4': {
                url: 'https://example.com/styles.css',
                navStartToEndTime: 400,
                transferSize: 12288,
                isLongest: false,
                children: {
                  'D1E2F3A4B5C6D1E2F3A4B5C6D1E2F3A4': {
                    url: 'https://fonts.gstatic.com/s/inter/font.woff2',
                    navStartToEndTime: 516,
                    transferSize: 31744,
                    isLongest: true,
                    children: {},
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      type: 'list-section',
      title: 'Preconnected origins',
      value: { type: 'text', value: 'no origins were preconnected' },
    },
  ],
};

// Modern format Pattern A: chains directly on the section item (type === 'network-tree').
const MODERN_FIXTURE_PATTERN_A = {
  type: 'list',
  items: [
    {
      type: 'network-tree',
      longestChain: { duration: 300 },
      chains: {
        'AAAA1111BBBB2222CCCC3333DDDD4444': {
          url: 'https://example.org/',
          navStartToEndTime: 150,
          transferSize: 1024,
          isLongest: false,
          children: {
            'EEEE5555FFFF6666AAAA7777BBBB8888': {
              url: 'https://example.org/app.js',
              navStartToEndTime: 300,
              transferSize: 51200,
              isLongest: true,
              children: {},
            },
          },
        },
      },
    },
  ],
};

// A list-type audit that has no network-tree section — should not false-positive.
const LIST_NO_CHAIN_FIXTURE = {
  type: 'list',
  items: [
    {
      type: 'list-section',
      title: 'Some other section',
      value: { type: 'text', value: 'some unrelated text' },
    },
  ],
};

// Opportunity fixture — regression guard for existing behavior.
const OPPORTUNITY_FIXTURE = {
  type: 'opportunity',
  items: [
    { url: 'https://example.com/large.js',   wastedBytes: 51200, wastedMs: 800 },
    { url: 'https://example.com/unused.css', wastedBytes: 10240, wastedMs: 120 },
  ],
};

// Empty chains map — should return null.
const EMPTY_CHAINS_FIXTURE = {
  type: 'criticalrequestchain',
  chains: {},
  longestChain: { duration: 0, length: 0, transferSize: 0 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let passed = 0;

// Test 1: Legacy chain extraction — returns items:null with chainMeta present
{
  const result = extractAuditItems('critical-request-chains', LEGACY_FIXTURE);
  assert.ok(result !== null, 'legacy: should return non-null result');
  assert.equal(result.items, null, 'legacy: items should be null (chain audits use chainMeta)');
  assert.ok(result.chainMeta !== null && typeof result.chainMeta === 'object',
    'legacy: chainMeta should be a non-null object');
  assert.equal(result.chainMeta.chainCount, 1,
    'legacy: chainCount should be 1 (one top-level root chain)');
  console.log('✓ Test 1 — legacy chain extraction returns chainMeta, items:null');
  passed++;
}

// Test 2: Legacy chain chainMeta scalars and tree string
{
  const result = extractAuditItems('critical-request-chains', LEGACY_FIXTURE);
  const m = result.chainMeta;
  assert.equal(m.longestChainDurationMs, 388,
    'legacy: longestChainDurationMs = Math.round(388.2)');
  assert.equal(m.longestChainTransferKib, 48,
    'legacy: longestChainTransferKib = Math.round(49152 / 1024)');
  assert.ok(typeof m.chainTree === 'string' && m.chainTree.length > 0,
    'legacy: chainTree should be a non-empty string');
  assert.ok(m.chainTree.includes('example.com'),
    'legacy: chainTree should include the root URL');
  assert.ok(m.chainTree.includes('→'),
    'legacy: chainTree should use → to show child relationships');
  assert.ok(m.chainTree.includes('fonts.gstatic.com'),
    'legacy: chainTree should include nested child URLs');
  console.log('✓ Test 2 — legacy chainMeta scalars and tree string correct');
  passed++;
}

// Test 3: Modern chain extraction Pattern B (value-wrapped — verified from real PSI gist)
{
  const result = extractAuditItems('network-dependency-tree-insight', MODERN_FIXTURE_PATTERN_B);
  assert.ok(result !== null, 'modern B: should return non-null result');
  assert.equal(result.items, null, 'modern B: items should be null');
  assert.ok(result.chainMeta !== null, 'modern B: chainMeta should be present');
  assert.equal(result.chainMeta.chainCount, 1,
    'modern B: chainCount should be 1 (one top-level root)');
  console.log('✓ Test 3 — modern chain extraction (Pattern B / value-wrapped) returns chainMeta');
  passed++;
}

// Test 4: Modern chain chainMeta scalars and tree (Pattern B)
{
  const result = extractAuditItems('network-dependency-tree-insight', MODERN_FIXTURE_PATTERN_B);
  const m = result.chainMeta;
  assert.equal(m.longestChainDurationMs, 516,
    'modern B: longestChainDurationMs from value.longestChain.duration');
  assert.ok(typeof m.chainTree === 'string' && m.chainTree.length > 0,
    'modern B: chainTree should be a non-empty string');
  assert.ok(m.chainTree.includes('example.com'),
    'modern B: chainTree should include root URL');
  assert.ok(m.chainTree.includes('→'),
    'modern B: chainTree should show child relationships');
  assert.ok(m.chainTree.includes('fonts.gstatic.com'),
    'modern B: chainTree should include nested child URLs');
  console.log('✓ Test 4 — modern chainMeta scalars and tree correct (Pattern B)');
  passed++;
}

// Test 5: Modern chain extraction Pattern A (direct chains on section, type === 'network-tree')
{
  const result = extractAuditItems('network-dependency-tree-insight', MODERN_FIXTURE_PATTERN_A);
  assert.ok(result !== null, 'modern A: should return non-null result');
  assert.equal(result.chainMeta.chainCount, 1,
    'modern A: chainCount should be 1');
  assert.equal(result.chainMeta.longestChainDurationMs, 300,
    'modern A: longestChainDurationMs from direct longestChain.duration');
  assert.ok(result.chainMeta.chainTree.includes('example.org'),
    'modern A: chainTree should include URL');
  assert.ok(result.chainMeta.chainTree.includes('app.js'),
    'modern A: chainTree should include child URL');
  console.log('✓ Test 5 — modern chain extraction (Pattern A / direct) correct');
  passed++;
}

// Test 6: No false positive for list-type audit with no network-tree section
{
  const result = extractAuditItems('some-list-audit', LIST_NO_CHAIN_FIXTURE);
  assert.equal(result, null,
    'list without chain section: should return null (no false positive)');
  console.log('✓ Test 6 — list-type audit without chain section returns null');
  passed++;
}

// Test 7: Opportunity/table audit regression guard — existing item extraction unchanged
{
  const result = extractAuditItems('render-blocking-resources', OPPORTUNITY_FIXTURE);
  assert.ok(result !== null, 'opportunity: should return non-null result');
  assert.ok(Array.isArray(result.items), 'opportunity: items should be an array');
  assert.equal(result.items.length, 2, 'opportunity: should extract 2 items');
  assert.equal(result.items[0].url, 'https://example.com/large.js',
    'opportunity: first item url correct');
  assert.equal(result.items[0].wastedBytes, 51200,
    'opportunity: wastedBytes preserved');
  assert.equal(result.chainMeta, null,
    'opportunity: chainMeta should be null for non-chain audits');
  console.log('✓ Test 7 — opportunity/table extraction regression guard (items preserved)');
  passed++;
}

// Test 8: Empty chains map returns null
{
  const result = extractAuditItems('critical-request-chains', EMPTY_CHAINS_FIXTURE);
  assert.equal(result, null,
    'empty chains: should return null when chainCount === 0');
  console.log('✓ Test 8 — empty chains map returns null');
  passed++;
}

console.log(`\n${passed}/8 tests passed`);
if (passed < 8) process.exit(1);
