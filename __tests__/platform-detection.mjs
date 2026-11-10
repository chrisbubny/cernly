/**
 * platform-detection.mjs
 *
 * Regression tests for the multi-signal platform detection added in
 * fix/platform-banner-guidance (P1).
 *
 * Covers:
 * - meta[name=generator] detection (original behavior preserved)
 * - Asset URL signals (WordPress /wp-content/, Next.js /_next/static/, etc.)
 * - CSS class / attribute signals (Webflow w-container, Shopify shopify-section, etc.)
 * - Conflict resolution (conflicting platforms → null)
 * - Multi-signal consolidation (same platform multiple signals → confidence upgrade)
 * - normalizeObservedPlatform accepts new source values
 * - formatPlatformContext handles user override
 * - KNOWN_PLATFORMS export is present
 */

import assert from 'node:assert/strict';
import { detectPlatform, normalizeObservedPlatform, formatPlatformContext, KNOWN_PLATFORMS } from '../lib/platform.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error('  ', err.message);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Generator detection (backward compat)
// ---------------------------------------------------------------------------

test('generator: WordPress detected', () => {
  const html = '<head><meta name="generator" content="WordPress 6.5"></head>';
  const result = detectPlatform(html);
  assert.equal(result?.name, 'WordPress');
  assert.equal(result?.confidence, 'definitive');
  assert.equal(result?.source, 'html-generator');
  assert.ok(result?.evidence?.length > 0);
});

test('generator: Ghost detected', () => {
  const html = '<head><meta name="generator" content="Ghost 5.100.1"></head>';
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Ghost');
  assert.equal(result?.category, 'cms');
});

test('generator: null for unknown generator', () => {
  const html = '<head><meta name="generator" content="SomeUnknownThing 1.0"></head>';
  const result = detectPlatform(html);
  assert.equal(result, null);
});

test('generator: null for conflicting generators', () => {
  const html = `<head>
    <meta name="generator" content="WordPress 6.5">
    <meta name="generator" content="Joomla 4.0">
  </head>`;
  const result = detectPlatform(html);
  assert.equal(result, null);
});

test('generator: null for empty html', () => {
  assert.equal(detectPlatform(''), null);
  assert.equal(detectPlatform(null), null);
});

// ---------------------------------------------------------------------------
// Asset URL signals
// ---------------------------------------------------------------------------

test('asset-url: WordPress /wp-content/', () => {
  const html = `<head></head><body>
    <script src="/wp-content/themes/mytheme/js/main.js"></script>
  </body>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'WordPress');
  assert.equal(result?.confidence, 'high');
  assert.equal(result?.source, 'asset-url');
});

test('asset-url: Next.js /_next/static/', () => {
  const html = `<head>
    <script src="/_next/static/chunks/main.js"></script>
  </head>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Next.js');
  assert.equal(result?.category, 'framework');
  assert.equal(result?.confidence, 'high');
});

test('asset-url: Shopify CDN', () => {
  const html = `<head>
    <link rel="stylesheet" href="//cdn.shopifycdn.com/s/files/1/theme.css">
  </head>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Shopify');
  assert.equal(result?.confidence, 'high');
});

test('asset-url: Nuxt /_nuxt/', () => {
  const html = `<script src="/_nuxt/runtime.js"></script>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Nuxt');
});

// ---------------------------------------------------------------------------
// Class / attribute signals
// ---------------------------------------------------------------------------

test('class: Webflow w-container', () => {
  const html = `<div class="w-container"><div class="w-row"></div></div>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Webflow');
  assert.equal(result?.confidence, 'medium');
  assert.equal(result?.source, 'class-pattern');
});

test('class: Shopify shopify-section', () => {
  const html = `<div class="shopify-section header-section"></div>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Shopify');
  assert.equal(result?.confidence, 'medium');
});

test('class: Wix wixui-image', () => {
  const html = `<div class="wixui-image wixui-image--stretch"></div>`;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'Wix');
});

// ---------------------------------------------------------------------------
// Multi-signal consolidation
// ---------------------------------------------------------------------------

test('multi: WordPress generator + wp-content = multi, high confidence', () => {
  const html = `<head>
    <meta name="generator" content="WordPress 6.5">
    <script src="/wp-content/plugins/myplugin/script.js"></script>
  </head>`;
  // Generator alone is definitive, returns early — still WordPress
  const result = detectPlatform(html);
  assert.equal(result?.name, 'WordPress');
  // Generator exit fires first (definitive), returns before asset scan
  assert.equal(result?.confidence, 'definitive');
});

test('multi: Next.js from asset + data-reactroot class → both Next/React', () => {
  // Next.js from asset URL, React from class — React is "exempt" from conflict
  const html = `
    <script src="/_next/static/chunks/app.js"></script>
    <div id="root" data-reactroot></div>
  `;
  const result = detectPlatform(html);
  // Next.js detected from asset-url; React class is exempt from conflict resolution
  assert.equal(result?.name, 'Next.js');
});

test('multi: same platform from multiple asset patterns → confidence high', () => {
  const html = `
    <script src="/wp-content/themes/mytheme/js/app.js"></script>
    <link href="/wp-includes/css/dist/block-library.css" rel="stylesheet">
  `;
  const result = detectPlatform(html);
  assert.equal(result?.name, 'WordPress');
  assert.equal(result?.confidence, 'high'); // multi-signal from asset-url sources
});

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

test('conflict: Shopify CDN + Next.js /_next/ = Shopify primary + Next.js secondary', () => {
  const html = `
    <link href="//cdn.shopifycdn.com/s/files/1/theme.css" rel="stylesheet">
    <script src="/_next/static/chunks/main.js"></script>
  `;
  const result = detectPlatform(html);
  // CMS (Shopify) + framework (Next.js) — valid headless architecture, e.g. Shopify Hydrogen
  assert.equal(result?.name, 'Shopify');
  assert.ok(Array.isArray(result?.additionalTechnologies), 'additionalTechnologies should be an array');
  assert.equal(result?.additionalTechnologies?.[0]?.name, 'Next.js');
});

test('conflict: WordPress + Next.js returns WordPress primary + Next.js secondary', () => {
  const html = `
    <script src="/wp-content/themes/mytheme/js/app.js"></script>
    <script src="/_next/static/chunks/main.js"></script>
  `;
  const result = detectPlatform(html);
  // Headless WordPress with Next.js frontend — valid co-existence
  assert.equal(result?.name, 'WordPress');
  assert.ok(Array.isArray(result?.additionalTechnologies));
  assert.equal(result?.additionalTechnologies?.[0]?.name, 'Next.js');
});

test('conflict: two high-confidence CMSes returns null', () => {
  const html = `
    <script src="/wp-content/themes/x/app.js"></script>
    <link href="//cdn.shopifycdn.com/s/files/1/theme.css" rel="stylesheet">
  `;
  const result = detectPlatform(html);
  // Two different CMSes detected at high confidence — genuinely conflicting
  assert.equal(result, null);
});

test('conflict: medium-only conflicting signals = null', () => {
  const html = `
    <div class="w-container"></div>
    <div class="shopify-section"></div>
  `;
  const result = detectPlatform(html);
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// normalizeObservedPlatform
// ---------------------------------------------------------------------------

// ── Asset URL origin classification ──────────────────────────────────────────

test('asset-origin: relative /wp-content/ path always matches WordPress', () => {
  const html = `<link href="/wp-content/themes/x/style.css" rel="stylesheet">`;
  const result = detectPlatform(html, 'https://example.com');
  assert.equal(result?.name, 'WordPress', `expected WordPress, got ${result?.name}`);
});

test('asset-origin: same-origin absolute URL matches WordPress when pageUrl provided', () => {
  const html = `<link href="https://example.com/wp-content/themes/x/style.css" rel="stylesheet">`;
  const result = detectPlatform(html, 'https://example.com');
  assert.equal(result?.name, 'WordPress', `expected WordPress, got ${result?.name}`);
});

test('asset-origin: cross-origin /wp-content/ URL does NOT match WordPress', () => {
  const html = `<img src="https://elsewhere.test/wp-content/logo.png">`;
  const result = detectPlatform(html, 'https://example.com');
  assert.equal(result, null, `expected null for cross-origin wp-content, got ${result?.name}`);
});

test('asset-origin: cross-origin /wp-content/ URL does NOT match without pageUrl', () => {
  // No pageUrl supplied — absolute URLs for path-based signals must be rejected
  // to avoid false positives from cross-origin links
  const html = `<img src="https://elsewhere.test/wp-content/logo.png">`;
  const result = detectPlatform(html);
  assert.equal(result, null, `expected null when no pageUrl and absolute URL, got ${result?.name}`);
});

test('asset-origin: protocol-relative same-origin matches', () => {
  const html = `<script src="//example.com/wp-content/themes/x/app.js"></script>`;
  const result = detectPlatform(html, 'https://example.com');
  assert.equal(result?.name, 'WordPress', `expected WordPress for same-origin //, got ${result?.name}`);
});

test('asset-origin: protocol-relative cross-origin does NOT match path-based signal', () => {
  const html = `<script src="//other-site.com/_next/static/chunks/main.js"></script>`;
  const result = detectPlatform(html, 'https://example.com');
  assert.equal(result, null, `expected null for cross-origin //_next/, got ${result?.name}`);
});

test('asset-origin: Shopify CDN matches even though it is cross-origin (domain-based signal)', () => {
  const html = `<link href="https://cdn.shopifycdn.com/s/files/1/theme.css" rel="stylesheet">`;
  const result = detectPlatform(html, 'https://my-store.com');
  assert.equal(result?.name, 'Shopify', `expected Shopify for domain-based CDN signal, got ${result?.name}`);
});

test('asset-origin: same-origin /wp-content/ + cross-origin /_next/ returns WordPress only', () => {
  // WordPress is same-origin; Next.js reference is cross-origin — should not trigger
  const html = `
    <link href="/wp-content/themes/x/style.css" rel="stylesheet">
    <script src="https://other.com/_next/static/chunks/main.js"></script>
  `;
  const result = detectPlatform(html, 'https://example.com');
  assert.equal(result?.name, 'WordPress', `expected only WordPress, got ${result?.name}`);
  assert.equal(result?.additionalTechnologies, undefined, 'should have no additionalTechnologies');
});

test('normalize: accepts html-generator source', () => {
  const p = { name: 'WordPress', category: 'cms', confidence: 'definitive',
    source: 'html-generator', evidence: [{ type: 'meta-generator', value: 'WordPress 6.5' }] };
  assert.ok(normalizeObservedPlatform(p) !== null);
});

test('normalize: accepts asset-url source (new)', () => {
  const p = { name: 'WordPress', category: 'cms', confidence: 'high',
    source: 'asset-url', evidence: [{ type: 'asset-url', value: '/wp-content/themes/t/app.js' }] };
  assert.ok(normalizeObservedPlatform(p) !== null);
});

test('normalize: accepts multi source (new)', () => {
  const p = { name: 'WordPress', category: 'cms', confidence: 'high',
    source: 'multi', evidence: [{ type: 'asset-url', value: '/wp-content/x.js' }] };
  assert.ok(normalizeObservedPlatform(p) !== null);
});

test('normalize: rejects unknown source', () => {
  const p = { name: 'WordPress', category: 'cms', confidence: 'high',
    source: 'unknown-new-source', evidence: [{ type: 'x', value: 'y' }] };
  assert.equal(normalizeObservedPlatform(p), null);
});

test('normalize: rejects null', () => {
  assert.equal(normalizeObservedPlatform(null), null);
  assert.equal(normalizeObservedPlatform(undefined), null);
});

test('normalize: rejects missing evidence', () => {
  const p = { name: 'WordPress', category: 'cms', confidence: 'high', source: 'asset-url', evidence: [] };
  assert.equal(normalizeObservedPlatform(p), null);
});

test('normalize: preserves additionalTechnologies when present', () => {
  const p = {
    name: 'WordPress', category: 'cms', confidence: 'high', source: 'asset-url',
    evidence: [{ type: 'asset-url', value: '/wp-content/x.js' }],
    additionalTechnologies: [{ name: 'Next.js', category: 'framework', confidence: 'high' }],
  };
  const result = normalizeObservedPlatform(p);
  assert.ok(Array.isArray(result?.additionalTechnologies));
  assert.equal(result?.additionalTechnologies?.[0]?.name, 'Next.js');
  assert.equal(result?.additionalTechnologies?.[0]?.category, 'framework');
});

test('normalize: omits additionalTechnologies when absent', () => {
  const p = {
    name: 'WordPress', category: 'cms', confidence: 'high', source: 'asset-url',
    evidence: [{ type: 'asset-url', value: '/wp-content/x.js' }],
  };
  const result = normalizeObservedPlatform(p);
  assert.equal(result?.additionalTechnologies, undefined);
});

// ---------------------------------------------------------------------------
// formatPlatformContext
// ---------------------------------------------------------------------------

test('formatPlatformContext: observed platform shown', () => {
  const p = { name: 'WordPress', category: 'cms', confidence: 'definitive',
    source: 'html-generator', evidence: [{ type: 'meta-generator', value: 'WordPress 6.5' }] };
  const ctx = formatPlatformContext(p);
  assert.ok(ctx.includes('OBSERVED PLATFORM'));
  assert.ok(ctx.includes('WordPress'));
});

test('formatPlatformContext: user platform shown when detected null', () => {
  const ctx = formatPlatformContext(null, { name: 'Squarespace', category: 'page-builder' });
  assert.ok(ctx.includes('user-identified'));
  assert.ok(ctx.includes('Squarespace'));
});

test('formatPlatformContext: not-identified when both null', () => {
  const ctx = formatPlatformContext(null, null);
  assert.ok(ctx.includes('Not identified'));
});

test('formatPlatformContext: medium confidence includes note', () => {
  const p = { name: 'Webflow', category: 'page-builder', confidence: 'medium',
    source: 'class-pattern', evidence: [{ type: 'class-pattern', value: 'w-container' }] };
  const ctx = formatPlatformContext(p);
  assert.ok(ctx.includes('medium-confidence'));
});

test('formatPlatformContext: includes additional technologies when present', () => {
  const p = {
    name: 'WordPress', category: 'cms', confidence: 'high', source: 'asset-url',
    evidence: [{ type: 'asset-url', value: '/wp-content/x.js' }],
    additionalTechnologies: [{ name: 'Next.js', category: 'framework', confidence: 'high' }],
  };
  const ctx = formatPlatformContext(p);
  assert.ok(ctx.includes('Additionally detected'), `expected "Additionally detected" in: ${ctx}`);
  assert.ok(ctx.includes('Next.js'), `expected "Next.js" in: ${ctx}`);
  assert.ok(ctx.includes('headless') || ctx.includes('decoupled'), `expected headless/decoupled note in: ${ctx}`);
});

test('formatPlatformContext: no additional technologies note when absent', () => {
  const p = {
    name: 'WordPress', category: 'cms', confidence: 'high', source: 'asset-url',
    evidence: [{ type: 'asset-url', value: '/wp-content/x.js' }],
  };
  const ctx = formatPlatformContext(p);
  assert.ok(!ctx.includes('Additionally detected'), `should not include "Additionally detected" when none present`);
});

// ---------------------------------------------------------------------------
// KNOWN_PLATFORMS export
// ---------------------------------------------------------------------------

test('KNOWN_PLATFORMS: exported array with known entries', () => {
  assert.ok(Array.isArray(KNOWN_PLATFORMS));
  assert.ok(KNOWN_PLATFORMS.length > 0);
  const names = KNOWN_PLATFORMS.map(p => p.name);
  assert.ok(names.includes('WordPress'));
  assert.ok(names.includes('Shopify'));
  assert.ok(names.includes('Next.js'));
  assert.ok(names.includes('Other'));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed === 0 ? '(no tests)' : `${passed}/${passed + failed} passed`}`);
if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n✅ All platform detection tests passed');
}
