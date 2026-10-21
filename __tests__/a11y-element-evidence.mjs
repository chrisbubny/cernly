/**
 * Regression test — a11y analyzer must capture element-level evidence
 * for images missing alt text, not just the count.
 *
 * Tests the fix for: "Cernly reported 4 images missing alt attributes
 * but couldn't identify which images."
 */

import assert from 'node:assert/strict';

// ─── Inline the logic under test (avoids Next.js import resolution) ───────────
// This mirrors the exact filter in lib/analyzers/a11y.js

const ITEM_CAP = 20; // keep in sync with lib/analyzers/a11y.js

function extractMissingAltItems(html) {
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsNoAltTags = imgs.filter(i => !/alt=["'][^"']*["']/.test(i));
  const imgsNoAlt = imgsNoAltTags.length;

  const imgItems = imgsNoAltTags.slice(0, ITEM_CAP).map(tag => {
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const src = srcMatch ? srcMatch[1] : null;
    if (!src || src.startsWith('data:')) return null;
    const displaySrc = src.split('?')[0];
    const filename = displaySrc.split('/').pop() || displaySrc;
    return { url: src, label: filename };
  }).filter(Boolean);

  return { imgsNoAlt, imgItems };
}

// ─── Test 1: images with and without alt — only missing ones captured ─────────
{
  const html = `
    <html>
      <body>
        <img src="/hero.jpg" alt="Hero image">
        <img src="/logo.png">
        <img src="https://cdn.example.com/banner.webp?v=2" class="banner">
        <img src="/icons/arrow.svg" alt="">
        <img src="/product-photo.jpg">
      </body>
    </html>
  `;

  const { imgsNoAlt, imgItems } = extractMissingAltItems(html);

  assert.equal(imgsNoAlt, 3, 'Should count 3 images missing alt (empty alt="" is fine)');
  assert.equal(imgItems.length, 3, 'Should capture 3 item objects');

  const urls = imgItems.map(i => i.url);
  assert.ok(urls.includes('/logo.png'), 'Should include /logo.png');
  assert.ok(urls.includes('https://cdn.example.com/banner.webp?v=2'), 'Should include CDN banner URL');
  assert.ok(urls.includes('/product-photo.jpg'), 'Should include /product-photo.jpg');

  const labels = imgItems.map(i => i.label);
  assert.ok(labels.includes('logo.png'), 'Label should be filename without query string');
  assert.ok(labels.includes('banner.webp'), 'Label should strip query string from CDN URL');

  console.log('✓ Test 1 passed: only images missing alt captured, specific URLs preserved');
}

// ─── Test 2: data: URIs excluded from items ───────────────────────────────────
{
  const html = `
    <img src="data:image/png;base64,abc123">
    <img src="/real-image.jpg">
  `;

  const { imgsNoAlt, imgItems } = extractMissingAltItems(html);

  assert.equal(imgsNoAlt, 2, 'Both images counted as missing alt');
  assert.equal(imgItems.length, 1, 'data: URI excluded from items');
  assert.equal(imgItems[0].url, '/real-image.jpg', 'Real URL included');

  console.log('✓ Test 2 passed: data: URIs excluded from items');
}

// ─── Test 3: no images missing alt — no items ─────────────────────────────────
{
  const html = `
    <img src="/logo.png" alt="Company logo">
    <img src="/hero.jpg" alt="Hero">
  `;

  const { imgsNoAlt, imgItems } = extractMissingAltItems(html);

  assert.equal(imgsNoAlt, 0, 'Zero images missing alt');
  assert.equal(imgItems.length, 0, 'No items when none missing');

  console.log('✓ Test 3 passed: no false positives');
}

// ─── Test 4: capped at ITEM_CAP items ────────────────────────────────────────
{
  const total = ITEM_CAP + 5; // generate more than the cap
  const imgs = Array.from({ length: total }, (_, i) => `<img src="/img${i}.jpg">`).join('\n');
  const html = `<html><body>${imgs}</body></html>`;

  const { imgsNoAlt, imgItems } = extractMissingAltItems(html);

  assert.equal(imgsNoAlt, total, `Count all ${total} missing`);
  assert.equal(imgItems.length, ITEM_CAP, `Items capped at ${ITEM_CAP}`);

  console.log(`✓ Test 4 passed: items capped at ${ITEM_CAP}`);
}

console.log('\n✅ All a11y element evidence tests passed');
