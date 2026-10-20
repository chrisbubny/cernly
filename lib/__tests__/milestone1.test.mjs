/**
 * milestone1.test.mjs — Guided Product Experience Milestone 1 tests
 *
 * Covers:
 *   Suite 1 — FIX_STATUSES labels and completeness
 *   Suite 2 — effectiveStatusKey logic (including unable_to_verify)
 *   Suite 3 — work-item status tally logic
 *   Suite 4 — URL param ?rec= parsing produces correct intent
 *   Suite 5 — Cernly's Take next-step impact field priority chain
 *
 * Run: node --import ./lib/__tests__/alias-loader.mjs --test lib/__tests__/milestone1.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');
const clientSrc = readFileSync(path.join(ROOT, 'app/report/[slug]/ReportClient.js'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: extract FIX_STATUSES from source (no React, no DOM needed)
// ─────────────────────────────────────────────────────────────────────────────

function parseFIX_STATUSES(src) {
  // Pull out the object literal that follows `const FIX_STATUSES = {`
  const start = src.indexOf('const FIX_STATUSES = {');
  assert.ok(start !== -1, 'FIX_STATUSES must exist in ReportClient.js');
  const block = src.slice(start);
  const end   = block.indexOf('};') + 2;
  // Evaluate safely by extracting key/label pairs via regex
  const re = /(\w+)\s*:\s*\{[^}]*label:\s*'([^']+)'/g;
  const statuses = {};
  let m;
  while ((m = re.exec(block.slice(0, end))) !== null) {
    statuses[m[1]] = m[2];
  }
  return statuses;
}

// Mirror of effectiveStatusKey logic from ReportClient.js
function deriveEffectiveKey(verifiedStatus, userStatus) {
  if (verifiedStatus === 'likely_resolved')    return 'fixed';
  if (verifiedStatus === 'still_detected')     return 'still_open';
  if (verifiedStatus === 'partially_resolved') return 'still_open';
  if (verifiedStatus === 'unable_to_verify')   return 'unable_verify';
  return userStatus || 'open';
}

// Mirror of work-item tally logic from renderActionPlan
function tallyStatuses(priorities, workItems) {
  const counts = { open: 0, in_progress: 0, verify: 0, fixed: 0, still_open: 0, unable_verify: 0 };
  priorities.forEach(issue => {
    const fp = issue.fingerprintId || issue.fingerprint || '';
    const wi = workItems[fp];
    const vs = wi?.verifiedStatus;
    const us = wi?.userStatus || 'open';
    const key = deriveEffectiveKey(vs, us);
    if (counts[key] !== undefined) counts[key]++;
  });
  return counts;
}

// Mirror of the impact field priority chain for Cernly's Take
function pickImpactText(rec) {
  return rec?.why_it_matters || rec?.what_we_found || rec?.explanation || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — FIX_STATUSES labels and completeness
// ─────────────────────────────────────────────────────────────────────────────

describe('Milestone 1 — FIX_STATUSES labels', () => {

  it('FIX_STATUSES contains all seven required keys', () => {
    const st = parseFIX_STATUSES(clientSrc);
    const required = ['open', 'in_progress', 'verify', 'fixed', 'still_open', 'dismissed', 'unable_verify'];
    for (const key of required) {
      assert.ok(key in st, `FIX_STATUSES must include "${key}" key`);
    }
  });

  it('"verify" label is "Awaiting verification" (not "Ready to verify")', () => {
    const st = parseFIX_STATUSES(clientSrc);
    assert.equal(
      st.verify,
      'Awaiting verification',
      '"verify" state must be labelled "Awaiting verification" to match the six-state spec',
    );
    assert.notEqual(st.verify, 'Ready to verify', 'Old label "Ready to verify" must be removed');
  });

  it('"unable_verify" label exists and is user-readable', () => {
    const st = parseFIX_STATUSES(clientSrc);
    assert.ok(st.unable_verify, '"unable_verify" must have a non-empty label');
    assert.ok(
      st.unable_verify.toLowerCase().includes('unable') || st.unable_verify.toLowerCase().includes('verify'),
      '"unable_verify" label must convey inability to verify',
    );
  });

  it('"fixed" label reflects verification language ("likely" or "verified")', () => {
    const st = parseFIX_STATUSES(clientSrc);
    assert.ok(
      st.fixed.toLowerCase().includes('likely') || st.fixed.toLowerCase().includes('verified'),
      '"fixed" label should convey server-side verification semantics',
    );
  });

  it('none of the seven keys are missing a label', () => {
    const st = parseFIX_STATUSES(clientSrc);
    for (const [key, label] of Object.entries(st)) {
      assert.ok(typeof label === 'string' && label.length > 0, `FIX_STATUSES.${key} label must be a non-empty string`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — effectiveStatusKey logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Milestone 1 — effectiveStatusKey mapping', () => {

  it('likely_resolved → "fixed"', () => {
    assert.equal(deriveEffectiveKey('likely_resolved', 'verify'), 'fixed');
  });

  it('still_detected → "still_open"', () => {
    assert.equal(deriveEffectiveKey('still_detected', 'verify'), 'still_open');
  });

  it('partially_resolved → "still_open"', () => {
    assert.equal(deriveEffectiveKey('partially_resolved', 'verify'), 'still_open');
  });

  it('unable_to_verify → "unable_verify" (new in Milestone 1)', () => {
    assert.equal(deriveEffectiveKey('unable_to_verify', 'verify'), 'unable_verify',
      'unable_to_verify must map to its own display state, not fall through to user status');
  });

  it('null verifiedStatus preserves userStatus "in_progress"', () => {
    assert.equal(deriveEffectiveKey(null, 'in_progress'), 'in_progress');
  });

  it('null verifiedStatus + null userStatus → "open" (default)', () => {
    assert.equal(deriveEffectiveKey(null, null), 'open');
  });

  it('clicking "Mark complete" → userStatus "verify" does NOT become "fixed" on its own', () => {
    // "fixed" requires verifiedStatus from the server, not just userStatus
    const key = deriveEffectiveKey(null, 'verify');
    assert.equal(key, 'verify',
      '"verify" userStatus must stay "verify" — server scan is needed to produce "fixed"');
    assert.notEqual(key, 'fixed', 'clicking Mark complete alone must NOT show "Likely resolved"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — work-item status tally (renderActionPlan summary bar)
// ─────────────────────────────────────────────────────────────────────────────

describe('Milestone 1 — work-item status tally', () => {

  const priorities = [
    { fingerprintId: 'fp-a' },
    { fingerprintId: 'fp-b' },
    { fingerprintId: 'fp-c' },
    { fingerprintId: 'fp-d' },
    { fingerprintId: 'fp-e' },
  ];

  it('all-open when no workItems tracked', () => {
    const counts = tallyStatuses(priorities, {});
    assert.equal(counts.open, 5);
    assert.equal(counts.in_progress, 0);
    assert.equal(counts.fixed, 0);
  });

  it('counts mix of user statuses correctly', () => {
    const workItems = {
      'fp-a': { userStatus: 'in_progress', verifiedStatus: null },
      'fp-b': { userStatus: 'verify',      verifiedStatus: null },
      'fp-c': { userStatus: 'open',        verifiedStatus: null },
    };
    const counts = tallyStatuses(priorities, workItems);
    assert.equal(counts.open,        3); // fp-c, fp-d, fp-e (no workItem → open)
    assert.equal(counts.in_progress, 1);
    assert.equal(counts.verify,      1);
  });

  it('server verifiedStatus overrides userStatus for tally', () => {
    const workItems = {
      'fp-a': { userStatus: 'verify', verifiedStatus: 'likely_resolved' },
      'fp-b': { userStatus: 'verify', verifiedStatus: 'still_detected' },
      'fp-c': { userStatus: 'verify', verifiedStatus: 'unable_to_verify' },
    };
    const counts = tallyStatuses(priorities, workItems);
    assert.equal(counts.fixed,         1, 'likely_resolved → fixed');
    assert.equal(counts.still_open,    1, 'still_detected → still_open');
    assert.equal(counts.unable_verify, 1, 'unable_to_verify → unable_verify');
    assert.equal(counts.verify,        0, 'userStatus "verify" should be superseded by verifiedStatus');
  });

  it('partially_resolved adds to still_open not its own bucket', () => {
    const workItems = {
      'fp-a': { userStatus: 'verify', verifiedStatus: 'partially_resolved' },
    };
    const counts = tallyStatuses(priorities, workItems);
    assert.equal(counts.still_open, 1);
  });

  it('total tally always equals priorities.length', () => {
    const workItems = {
      'fp-a': { userStatus: 'in_progress', verifiedStatus: null },
      'fp-b': { userStatus: 'verify',      verifiedStatus: 'likely_resolved' },
    };
    const counts = tallyStatuses(priorities, workItems);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    assert.equal(total, priorities.length, 'tally must account for every priority item exactly once');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — URL param ?rec= in source
// ─────────────────────────────────────────────────────────────────────────────

describe('Milestone 1 — ?rec= URL param handling in source', () => {

  it('source reads params.get("rec") to set the highlighted fingerprint', () => {
    assert.ok(
      clientSrc.includes('params.get(\'rec\')') || clientSrc.includes('params.get("rec")'),
      'ReportClient.js must read the ?rec= URL param',
    );
  });

  it('source calls setHighlightedFp when rec param is present', () => {
    assert.ok(
      clientSrc.includes('setHighlightedFp'),
      'setHighlightedFp must be called in ReportClient.js',
    );
  });

  it('source switches to action tab when ?rec= is present', () => {
    // Both setActiveTab('action') and setHighlightedFp must appear in the same URL-param effect
    const recParamIdx   = clientSrc.indexOf("params.get('rec')") !== -1
      ? clientSrc.indexOf("params.get('rec')")
      : clientSrc.indexOf('params.get("rec")');
    const context = clientSrc.slice(recParamIdx - 50, recParamIdx + 300);
    assert.ok(
      context.includes("setActiveTab('action')"),
      'switching to the action tab must happen in the same effect as reading ?rec=',
    );
  });

  it('highlighted prop is passed to FixCard', () => {
    assert.ok(
      clientSrc.includes('highlighted={') || clientSrc.includes('highlighted ='),
      'FixCard must receive a highlighted prop from renderActionPlan',
    );
  });

  it('FixCard uses a ref for scroll-into-view', () => {
    assert.ok(
      clientSrc.includes('scrollIntoView'),
      'FixCard must call scrollIntoView when highlighted',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — impact field priority chain (why_it_matters → what_we_found → explanation)
// ─────────────────────────────────────────────────────────────────────────────

describe('Milestone 1 — Cernly\'s Take impact field priority chain', () => {

  it('returns why_it_matters when present', () => {
    const rec = { why_it_matters: 'Slow LCP loses 40% of visitors', what_we_found: 'LCP is 4.1s', explanation: 'old' };
    assert.equal(pickImpactText(rec), 'Slow LCP loses 40% of visitors');
  });

  it('falls back to what_we_found when why_it_matters is absent', () => {
    const rec = { what_we_found: 'LCP is 4.1s, above the 2.5s threshold', explanation: 'old' };
    assert.equal(pickImpactText(rec), 'LCP is 4.1s, above the 2.5s threshold');
  });

  it('falls back to explanation when why_it_matters and what_we_found are absent', () => {
    const rec = { explanation: 'Your Largest Contentful Paint is slow.' };
    assert.equal(pickImpactText(rec), 'Your Largest Contentful Paint is slow.');
  });

  it('returns null when all three fields are absent', () => {
    const rec = { title: 'Fix LCP', actions: [] };
    assert.equal(pickImpactText(rec), null);
  });

  it('never uses actions[0].detail as impact text', () => {
    // This validates the approved spec: "Do not assume actions[0].detail describes impact"
    const rec = {
      actions: [{ title: 'Compress images', detail: 'Use WebP format.', impact: 'high', effort: 'low' }],
    };
    const text = pickImpactText(rec);
    assert.notEqual(text, 'Use WebP format.',
      'impact text must not be sourced from actions[0].detail');
    assert.equal(text, null, 'no impact fields present → pickImpactText returns null');
  });

  it('source uses the correct priority chain in the fallback topRec box', () => {
    // Confirm the actual source code uses the right priority order
    assert.ok(
      clientSrc.includes('topRec.why_it_matters || topRec.what_we_found || topRec.explanation'),
      'fallback path must use why_it_matters → what_we_found → explanation chain',
    );
  });

  it('source uses the priority chain in the assessment linkedRec display', () => {
    assert.ok(
      clientSrc.includes('linkedRec?.why_it_matters || linkedRec?.what_we_found'),
      'assessment path top opportunity must use linkedRec why_it_matters chain',
    );
  });
});
