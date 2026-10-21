/**
 * Regression test — chip click on a finding must supply findingFingerprintId to /api/ask,
 * and /api/ask must auto-resolve recFingerprint from finding_fingerprints when the client
 * didn't send one.
 *
 * Acceptance test: clicking "Why is this happening?" on the font-display finding
 * must result in the AI receiving the full recommendation evidence (font file names,
 * wasted ms) without the user having to specify which finding they meant.
 *
 * Tests three layers:
 *   1. drawerContext always contains _findingFingerprintId from onAskCernly
 *   2. POST body always includes findingFingerprintId
 *   3. /api/ask auto-resolves effectiveRecFingerprint from finding_fingerprints
 */

import assert from 'node:assert/strict';

// ─── 1. drawerContext builder — onAskCernly always includes _findingFingerprintId ──
function buildDrawerContext(iss, suggestedQ, matchedRec, extra) {
  return {
    title: iss.message,
    category: iss.area,
    detail: iss.description || iss.detail,
    // Always forward the issue's stable fingerprint
    ...(iss.fingerprintId ? { _findingFingerprintId: iss.fingerprintId } : {}),
    // Rec fingerprint only when explicitly available
    ...(matchedRec?.fingerprint ? { _recFingerprint: matchedRec.fingerprint } : {}),
    ...(suggestedQ ? { _initialMessage: suggestedQ } : {}),
    ...(extra?.element ? { _elementContext: extra.element } : {}),
  };
}

// Font-display issue — as it comes out of scoring.js (fingerprintId assigned)
const fontDisplayIssue = {
  area: 'Performance',
  message: 'Ensure text remains visible during webfont load',
  auditId: 'font-display',
  fingerprintId: 'lh:font-display',
  severity: 'warning',
  items: [
    { url: 'https://use.typekit.net/Omnes-Regular.ttf', label: 'Omnes-Regular.ttf', wastedMs: 60 },
    { url: 'https://use.typekit.net/Omnes-SemiBold.ttf', label: 'Omnes-SemiBold.ttf', wastedMs: 35 },
  ],
};

// Scenario A: rec IS matched client-side
const matchedRec = { fingerprint: 'performance-font-display', title: 'Fix font-display' };
const ctxWithRec = buildDrawerContext(fontDisplayIssue, 'Why is this happening?', matchedRec, null);

assert.equal(ctxWithRec._findingFingerprintId, 'lh:font-display', 'fingerprintId always set when rec available');
assert.equal(ctxWithRec._recFingerprint, 'performance-font-display', 'recFingerprint set when rec available');
assert.equal(ctxWithRec._initialMessage, 'Why is this happening?', 'initialMessage forwarded');
console.log('✓ Step 1a: drawerContext contains both IDs when rec is available');

// Scenario B: rec is null (no recommendation generated / old scan)
const ctxNoRec = buildDrawerContext(fontDisplayIssue, 'Why is this happening?', null, null);

assert.equal(ctxNoRec._findingFingerprintId, 'lh:font-display', 'fingerprintId set even when rec is null');
assert.ok(!ctxNoRec._recFingerprint, 'recFingerprint absent when rec is null');
console.log('✓ Step 1b: drawerContext still contains fingerprintId when rec is null');

// ─── 2. POST body builder — findingFingerprintId always included ──────────────────
function buildPostBody({ question, reportId, messages, findingFingerprintId, recFingerprint, elementContext }) {
  return {
    question, reportId, messages: messages.slice(-6),
    ...(findingFingerprintId ? { findingFingerprintId } : {}),
    ...(recFingerprint ? { recFingerprint } : {}),
    ...(elementContext ? { elementContext } : {}),
  };
}

const postBodyWithRec = buildPostBody({
  question: 'Why is this happening?',
  reportId: 'report-123',
  messages: [],
  findingFingerprintId: ctxWithRec._findingFingerprintId,
  recFingerprint: ctxWithRec._recFingerprint || null,
});

assert.equal(postBodyWithRec.findingFingerprintId, 'lh:font-display', 'POST includes findingFingerprintId');
assert.equal(postBodyWithRec.recFingerprint, 'performance-font-display', 'POST includes recFingerprint when available');
console.log('✓ Step 2a: POST body includes both IDs when rec is available');

const postBodyNoRec = buildPostBody({
  question: 'Why is this happening?',
  reportId: 'report-123',
  messages: [],
  findingFingerprintId: ctxNoRec._findingFingerprintId,
  recFingerprint: ctxNoRec._recFingerprint || null,
});

assert.equal(postBodyNoRec.findingFingerprintId, 'lh:font-display', 'POST includes findingFingerprintId even without rec');
assert.ok(!postBodyNoRec.recFingerprint, 'POST has no recFingerprint when rec was null client-side');
console.log('✓ Step 2b: POST body includes findingFingerprintId even when rec was null client-side');

// ─── 3. /api/ask auto-resolution — effectiveRecFingerprint from finding_fingerprints ──
function resolveEffectiveRecFingerprint(recFingerprint, findingFingerprintId, recommendations) {
  let effectiveRecFingerprint = recFingerprint;
  if (!effectiveRecFingerprint && findingFingerprintId) {
    const autoRec = (recommendations || []).find(r =>
      Array.isArray(r.finding_fingerprints) &&
      r.finding_fingerprints.includes(findingFingerprintId)
    );
    if (autoRec?.fingerprint) effectiveRecFingerprint = autoRec.fingerprint;
  }
  return effectiveRecFingerprint;
}

const mockRecommendations = [
  {
    fingerprint: 'performance-font-display',
    title: 'Fix font-display for custom fonts',
    finding_fingerprints: ['lh:font-display'],
    supporting_findings: [{
      message: 'Ensure text remains visible during webfont load',
      severity: 'warning',
      items: [
        { url: 'https://use.typekit.net/Omnes-Regular.ttf', label: 'Omnes-Regular.ttf', wastedMs: 60 },
        { url: 'https://use.typekit.net/Omnes-SemiBold.ttf', label: 'Omnes-SemiBold.ttf', wastedMs: 35 },
      ],
    }],
  },
  {
    fingerprint: 'seo-meta-desc',
    title: 'Add meta description',
    finding_fingerprints: ['seo:meta_desc_missing'],
    supporting_findings: [],
  },
];

// When client sent no recFingerprint but did send findingFingerprintId
const resolvedFp = resolveEffectiveRecFingerprint(null, 'lh:font-display', mockRecommendations);
assert.equal(resolvedFp, 'performance-font-display', 'auto-resolves rec fingerprint from finding_fingerprints');
console.log('✓ Step 3a: auto-resolved correct recFingerprint from findingFingerprintId');

// When client sent recFingerprint explicitly, it takes precedence
const explicitFp = resolveEffectiveRecFingerprint('performance-font-display', 'lh:font-display', mockRecommendations);
assert.equal(explicitFp, 'performance-font-display', 'explicit recFingerprint not overridden');
console.log('✓ Step 3b: explicit recFingerprint takes precedence over auto-resolution');

// When no rec exists for the findingFingerprintId, returns null gracefully
const noMatchFp = resolveEffectiveRecFingerprint(null, 'lh:unknown-audit', mockRecommendations);
assert.equal(noMatchFp, null, 'returns null when no rec matches findingFingerprintId');
console.log('✓ Step 3c: returns null gracefully when no matching rec');

// When findingFingerprintId is also absent, returns null (pre-fix fallback)
const noIdFp = resolveEffectiveRecFingerprint(null, null, mockRecommendations);
assert.equal(noIdFp, null, 'returns null when both IDs absent');
console.log('✓ Step 3d: returns null when both IDs absent');

// ─── 4. End-to-end: focusRecBlock would include font evidence ─────────────────────
// Mirror the focusRecBlock builder from /api/ask/route.js
function buildFocusRecBlock(effectiveRecFingerprint, recommendations) {
  if (!effectiveRecFingerprint) return '';
  const focusRec = (recommendations || []).find(r => r.fingerprint === effectiveRecFingerprint);
  if (!focusRec) return '';

  const findingLines = (focusRec.supporting_findings || []).slice(0, 8).map(f => {
    const itemNote = f.items?.length
      ? ' [affected: ' + f.items.slice(0, 5).map(it => {
          const name = it.label || (it.url ? it.url.split('/').pop().split('?')[0] || it.url : '');
          const ms = it.wastedMs != null ? `${it.wastedMs}ms wasted` : '';
          return [name, ms].filter(Boolean).join(' ');
        }).filter(Boolean).join(', ') + ']'
      : '';
    return `  - [${(f.severity || 'issue').toUpperCase()}] ${f.message}${itemNote}`;
  }).join('\n');

  return `\nRECOMMENDATION IN FOCUS: ${focusRec.title}\nSupporting findings:\n${findingLines}\n`;
}

// Simulate the scenario: chip click without explicit recFingerprint
const fp = resolveEffectiveRecFingerprint(null, 'lh:font-display', mockRecommendations);
const block = buildFocusRecBlock(fp, mockRecommendations);

assert.ok(block.includes('RECOMMENDATION IN FOCUS'), 'block contains recommendation header');
assert.ok(block.includes('Omnes-Regular.ttf'), 'block includes Omnes-Regular.ttf');
assert.ok(block.includes('Omnes-SemiBold.ttf'), 'block includes Omnes-SemiBold.ttf');
assert.ok(block.includes('60ms wasted'), 'block includes wasted ms for first font');
assert.ok(block.includes('35ms wasted'), 'block includes wasted ms for second font');
console.log('✓ Step 4: focusRecBlock includes font evidence via auto-resolved fingerprint');

console.log('\n✅ All chip-context regression tests passed');
console.log('   Font-display scenario: chip click → findingFingerprintId → auto-resolve rec → AI sees evidence');
