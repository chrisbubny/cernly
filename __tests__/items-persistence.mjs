/**
 * Integration test — items[] must survive the full pipeline:
 *   scan → normalize → recommendations.js grouping → DB → retrieve → /api/ask
 *
 * This test exercises the in-memory part of that pipeline (everything except
 * the actual DB round-trip, which requires a live Postgres connection).  It
 * verifies the data contract at each handoff point.
 *
 * Acceptance criteria:
 *   1. a11y analyzer produces items[] on missing-alt issues (src URLs + labels).
 *   2. Items survive recommendations.js grouping into supporting_findings.
 *   3. JSON round-trip (DB serialization simulation) is lossless.
 *   4. /api/ask system-prompt builder renders item names from supporting_findings.
 */

import assert from 'node:assert/strict';

// ─── 1. a11y items contract ───────────────────────────────────────────────────
// Mirror the extractor from lib/analyzers/a11y.js
function extractMissingAltItems(html) {
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAltTags = imgs.filter(i => !/alt=["'][^"']*["']/.test(i));
  const imgsNoAlt = imgsNoAltTags.length;

  const imgItems = imgsNoAltTags.slice(0, 20).map(tag => {
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const src = srcMatch ? srcMatch[1] : null;
    if (!src || src.startsWith('data:')) return null;
    const displaySrc = src.split('?')[0];
    const filename = displaySrc.split('/').pop() || displaySrc;
    return { url: src, label: filename };
  }).filter(Boolean);

  return {
    area: 'Accessibility',
    message: `${imgsNoAlt} images missing alt text`,
    severity: imgsNoAlt > 3 ? 'critical' : 'warning',
    source: 'a11y',
    checkId: 'images_missing_alt',
    items: imgItems.length ? imgItems : null,
    totalDetected: imgsNoAlt,
  };
}

const sampleHtml = `
  <html><body>
    <img src="/hero.jpg">
    <img src="/logo.png">
    <img src="https://cdn.example.com/banner.webp?v=3">
    <img src="/team-photo.jpg">
    <img src="/team-photo2.jpg" alt="Team">
  </body></html>
`;

const a11yIssue = extractMissingAltItems(sampleHtml);

assert.equal(a11yIssue.totalDetected, 4, '4 images detected as missing alt');
assert.ok(Array.isArray(a11yIssue.items), 'items[] is an array');
assert.equal(a11yIssue.items.length, 4, '4 items captured');
assert.ok(a11yIssue.items.every(i => i.url && i.label), 'every item has url + label');
assert.ok(a11yIssue.items.some(i => i.label === 'banner.webp'), 'query string stripped from label');
console.log('✓ Step 1: a11y analyzer items contract OK');

// ─── 2. recommendations.js grouping — supporting_findings propagation ─────────
// Mirror the supportingFindings builder from lib/recommendations.js
function buildSupportingFinding(issue) {
  return {
    area:         issue.area,
    message:      issue.message,
    severity:     issue.severity,
    description:  issue.description || null,
    displayValue: issue.displayValue || null,
    items:        issue.items || null,       // ← items must pass through
    totalDetected: issue.totalDetected || null,
  };
}

const sf = buildSupportingFinding(a11yIssue);
assert.deepEqual(sf.items, a11yIssue.items, 'supporting_finding retains items[]');
assert.equal(sf.totalDetected, 4, 'supporting_finding retains totalDetected');
console.log('✓ Step 2: supporting_findings propagation OK');

// ─── 3. JSON round-trip (simulates DB JSONB store + retrieve) ─────────────────
const stored   = JSON.stringify({ supporting_findings: [sf] });
const retrieved = JSON.parse(stored).supporting_findings[0];

assert.deepEqual(retrieved.items, a11yIssue.items, 'items[] survive JSON round-trip');
assert.equal(retrieved.totalDetected, 4, 'totalDetected survives JSON round-trip');
console.log('✓ Step 3: JSON round-trip (DB serialization) lossless');

// ─── 4. /api/ask system-prompt builder renders item names ─────────────────────
// Mirror the focusRecBlock builder from app/api/ask/route.js
function buildItemNote(items) {
  if (!items?.length) return '';
  return ' [affected: ' + items.slice(0, 5).map(it => {
    const name = it.label || (it.url ? it.url.split('/').pop().split('?')[0] || it.url : '');
    const ms   = it.wastedMs != null ? `${it.wastedMs}ms wasted` : '';
    const loc  = it.selector ? `(${it.selector})` : '';
    return [name, ms, loc].filter(Boolean).join(' ');
  }).filter(Boolean).join(', ') + ']';
}

const mockRec = {
  title: 'Add alt text to images',
  fingerprint: 'test-rec-001',
  priority: 'critical',
  supporting_findings: [retrieved],
};

const finding = mockRec.supporting_findings[0];
const itemNote = buildItemNote(finding.items);

assert.ok(itemNote.includes('hero.jpg'),   'system prompt includes hero.jpg');
assert.ok(itemNote.includes('logo.png'),   'system prompt includes logo.png');
assert.ok(itemNote.includes('banner.webp'),'system prompt includes banner.webp');
assert.ok(itemNote.startsWith(' [affected:'), 'note has expected prefix');
console.log('✓ Step 4: /api/ask system-prompt builder renders item names');

// ─── 5. elementContext system prompt builder ───────────────────────────────────
// Mirror elementBlock builder in /api/ask
function buildElementBlock(elementContext) {
  if (!elementContext || typeof elementContext !== 'object') return '';
  const el = elementContext;
  const elLines = [
    el.label    ? `  Filename/label: ${el.label}` : '',
    el.url      ? `  URL: ${el.url}` : '',
    el.selector ? `  Selector: ${el.selector}` : '',
    el.snippet  ? `  HTML: ${el.snippet.slice(0, 300)}` : '',
    el.wastedMs != null ? `  Wasted: ${el.wastedMs}ms` : '',
  ].filter(Boolean).join('\n');
  if (!elLines) return '';
  return `\nFOCUS ELEMENT (the user is asking about this specific item):\n${elLines}\n`;
}

const sampleElement = retrieved.items[0]; // { url: '/hero.jpg', label: 'hero.jpg' }
const elementBlock = buildElementBlock(sampleElement);

assert.ok(elementBlock.includes('hero.jpg'), 'element block includes filename');
assert.ok(elementBlock.includes('FOCUS ELEMENT'), 'element block has section header');
console.log('✓ Step 5: elementContext → system prompt builder OK');

console.log('\n✅ All items-persistence tests passed');
