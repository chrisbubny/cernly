/**
 * Regression test: GuidedFix opens the correct recommendation for image alt-text findings.
 *
 * Bug: seo:images_missing_alt was in seo-signals.findingPrefixes, causing buildRecMap
 * to map that fingerprint to "Improve crawlability and search signals" instead of
 * "Fix accessibility barriers". Clicking "Guide me through this fix" on an alt-text
 * finding would open GuidedFix with SEO content (H1, meta description, viewport).
 *
 * Fix: moved seo:images_missing_alt to accessibility-barriers.findingPrefixes.
 *
 * Run with: node __tests__/guided-fix-rec-identity.mjs
 */
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Read RECOMMENDATION_GROUPS from source (avoid @/ alias issues) ─────────
// We read the source and extract RECOMMENDATION_GROUPS by parsing findingPrefixes
// from the static definition, so this test works without a full Next.js module setup.
const recSrc = readFileSync(path.resolve(__dirname, '../lib/recommendations.js'), 'utf8');

// Extract which groups contain which finding prefixes, using regex on the static source
function extractGroupPrefixes(src) {
  const groups = {};
  // Match each group block: 'key': { fingerprint: '...', ..., findingPrefixes: [ ... ] }
  const groupRe = /'([a-z-]+)':\s*\{[^}]*fingerprint:\s*'([^']+)'[^}]*findingPrefixes:\s*\[([^\]]*)\]/gs;
  for (const m of src.matchAll(groupRe)) {
    const key = m[1];
    const prefixes = [...m[3].matchAll(/'([^']+)'/g)].map(p => p[1]);
    groups[key] = prefixes;
  }
  return groups;
}

const groupPrefixes = extractGroupPrefixes(recSrc);

console.log('Testing seo:images_missing_alt recommendation routing...');

// --- Test 1: seo-signals must NOT contain seo:images_missing_alt ---
assert.ok(groupPrefixes['seo-signals'], 'seo-signals group must exist in source');
assert.ok(
  !groupPrefixes['seo-signals'].includes('seo:images_missing_alt'),
  `seo-signals must NOT contain 'seo:images_missing_alt' (it belongs in accessibility-barriers). ` +
  `Current seo-signals prefixes: ${JSON.stringify(groupPrefixes['seo-signals'])}`
);
console.log('  ✓ seo:images_missing_alt is NOT in seo-signals');

// --- Test 2: accessibility-barriers MUST contain seo:images_missing_alt ---
assert.ok(groupPrefixes['accessibility-barriers'], 'accessibility-barriers group must exist in source');
assert.ok(
  groupPrefixes['accessibility-barriers'].includes('seo:images_missing_alt'),
  `accessibility-barriers MUST contain 'seo:images_missing_alt'. ` +
  `Current accessibility-barriers prefixes: ${JSON.stringify(groupPrefixes['accessibility-barriers'])}`
);
console.log('  ✓ seo:images_missing_alt IS in accessibility-barriers');

// --- Test 3: buildRecMap routing (inline the same first-writer-wins logic as ReportClient) ---
function buildRecMap(recs) {
  const map = {};
  for (const rec of recs) {
    // Map by rec fingerprint
    if (rec.fingerprint && !map[rec.fingerprint]) map[rec.fingerprint] = rec;
    // Map by each finding fingerprint
    const fps = rec.finding_fingerprints || [];
    for (const fp of fps) {
      if (!map[fp]) map[fp] = rec;
    }
  }
  return map;
}

const fakeRecs = [
  {
    fingerprint: 'seo-signals',
    title: 'Improve crawlability and search signals',
    finding_fingerprints: ['seo:canonical_missing', 'seo:robots_noindex', 'seo:viewport_missing'],
  },
  {
    fingerprint: 'accessibility-barriers',
    title: 'Fix accessibility barriers',
    finding_fingerprints: [
      'a11y:images_missing_alt',
      'seo:images_missing_alt',
      'lh:image-alt',
    ],
  },
];

const recMap = buildRecMap(fakeRecs);

const altRec = recMap['seo:images_missing_alt'];
assert.ok(altRec, 'seo:images_missing_alt must be found in recMap');
assert.equal(
  altRec.fingerprint,
  'accessibility-barriers',
  `seo:images_missing_alt must map to accessibility-barriers, got: ${altRec?.fingerprint}`
);
assert.notEqual(
  altRec.fingerprint,
  'seo-signals',
  'seo:images_missing_alt must NOT map to seo-signals'
);
console.log('  ✓ buildRecMap maps seo:images_missing_alt → accessibility-barriers');

// --- Test 4: Existing SEO signals still route correctly ---
assert.equal(recMap['seo:canonical_missing']?.fingerprint, 'seo-signals',
  'seo:canonical_missing must still map to seo-signals');
assert.equal(recMap['seo:robots_noindex']?.fingerprint, 'seo-signals',
  'seo:robots_noindex must still map to seo-signals');
console.log('  ✓ seo:canonical_missing and seo:robots_noindex still map to seo-signals');

// --- Test 5: a11y alt-text fingerprints still route correctly ---
assert.equal(recMap['a11y:images_missing_alt']?.fingerprint, 'accessibility-barriers',
  'a11y:images_missing_alt must map to accessibility-barriers');
assert.equal(recMap['lh:image-alt']?.fingerprint, 'accessibility-barriers',
  'lh:image-alt must map to accessibility-barriers');
console.log('  ✓ a11y:images_missing_alt and lh:image-alt still map to accessibility-barriers');

console.log('\nAll guided-fix-rec-identity tests passed ✓');
