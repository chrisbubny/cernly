/**
 * Regression tests for RescanBanner visibility fix.
 *
 * The banner was previously gated on `fromRescan` (derived from
 * `?from=rescan` in the URL), which caused it to disappear on navigation,
 * refresh, or direct URL access even when valid comparison data existed.
 *
 * Fix: banner visibility now derives solely from `liveComparison &&
 * hasMultiScans`, mirroring the identical condition already used by
 * FixVerification / NextAction.
 *
 * These tests exercise `selectComparisonPair` and `compareScans` — the
 * two functions whose output drives `liveComparison` — to confirm that
 * banner eligibility is determined by report data, not URL parameters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectComparisonPair, compareScans } from '../lib/comparison.js';

// ---------------------------------------------------------------------------
// Minimal scan fixture helpers
// ---------------------------------------------------------------------------

function makeScan(id, url, createdAt, scores = {}) {
  return {
    id,
    url,
    createdAt,
    scores: { performance: 80, seo: 75, security: 90, accessibility: 70, ux: 65, ...scores },
    issues: [],
    auditStatuses: {},
  };
}

const BASE_URL = 'https://example.com';
const OLDER    = '2024-01-01T00:00:00Z';
const NEWER    = '2024-01-02T00:00:00Z';

// ---------------------------------------------------------------------------
// selectComparisonPair — the gateway to liveComparison
// ---------------------------------------------------------------------------

test('selectComparisonPair: returns current and previous when both found', () => {
  const prev = makeScan(1, BASE_URL, OLDER);
  const curr = makeScan(2, BASE_URL, NEWER);
  const scans = [curr, prev]; // most-recent first, matching DB ORDER BY desc

  const { current, previous } = selectComparisonPair(scans, 2 /* reportId */, undefined);
  assert.equal(current?.id, 2, 'current should be the scan matching reportId');
  assert.equal(previous?.id, 1, 'previous should be the older scan');
});

test('selectComparisonPair: current is null when reportId not in scans (historical report outside LIMIT-5 window)', () => {
  const s1 = makeScan(1, BASE_URL, OLDER);
  const s2 = makeScan(2, BASE_URL, NEWER);
  const scans = [s2, s1]; // reportId 99 is not present

  const { current, previous } = selectComparisonPair(scans, 99, undefined);
  assert.equal(current, null, 'current must be null when reportId is absent from scans');
  // previous may be non-null (isOlder returns false when current is null),
  // but liveComparison cannot be built without current — null current → banner off.
  // Simulate the ProgressTab guard: if current is null, liveComparison = null.
  const liveComparison = (current && previous) ? 'would-compare' : null;
  assert.equal(liveComparison, null, 'liveComparison should be null when current is null');
});

test('selectComparisonPair: previous is null when only one scan exists', () => {
  const curr = makeScan(7, BASE_URL, NEWER);
  const scans = [curr]; // only one scan

  const { current, previous } = selectComparisonPair(scans, 7, undefined);
  assert.equal(current?.id, 7);
  assert.equal(previous, null, 'no previous scan should exist with only one entry');

  const hasMultiScans = scans.length >= 2;
  assert.equal(hasMultiScans, false, 'hasMultiScans must be false with a single scan');
  // Banner condition: liveComparison && hasMultiScans — both conditions needed
  const bannerShown = !!(current && previous) && hasMultiScans;
  assert.equal(bannerShown, false, 'banner must not show when hasMultiScans is false');
});

// ---------------------------------------------------------------------------
// compareScans — produces the liveComparison object
// ---------------------------------------------------------------------------

test('compareScans: isComparable is true for same-URL scans', () => {
  const prev = makeScan(1, BASE_URL, OLDER);
  const curr = makeScan(2, BASE_URL, NEWER);

  const result = compareScans(prev, curr);
  assert.equal(result.isComparable, true, 'same-URL scans should be comparable');
  assert.ok(result.scoreDelta, 'scoreDelta should be present');
});

test('compareScans: isComparable is false for different-URL scans', () => {
  const prev = makeScan(1, 'https://example.com/page-a', OLDER);
  const curr = makeScan(2, 'https://example.com/page-b', NEWER);

  const result = compareScans(prev, curr);
  assert.equal(result.isComparable, false, 'different-URL scans must not be comparable');
  assert.ok(result.incompatibilityReason, 'incompatibilityReason should explain the mismatch');
});

// ---------------------------------------------------------------------------
// Banner condition: liveComparison && hasMultiScans
// (mirrors the exact condition now used in ProgressTab.js)
// ---------------------------------------------------------------------------

test('banner condition: shown when valid comparison exists and multiple scans present', () => {
  const prev = makeScan(1, BASE_URL, OLDER);
  const curr = makeScan(2, BASE_URL, NEWER);
  const scans = [curr, prev];

  const { current, previous } = selectComparisonPair(scans, 2, undefined);
  const hasMultiScans  = scans.length >= 2;
  const liveComparison = (current && previous) ? compareScans(previous, current) : null;

  assert.ok(liveComparison, 'liveComparison should be non-null');
  assert.equal(liveComparison.isComparable, true);
  assert.equal(hasMultiScans, true);

  const bannerShown = !!(liveComparison && hasMultiScans);
  assert.equal(bannerShown, true, 'banner should show with valid comparison data');
});

test('banner condition: not shown when reportId outside comparison window (historical report)', () => {
  const s1 = makeScan(1, BASE_URL, OLDER);
  const s2 = makeScan(2, BASE_URL, NEWER);
  const scans = [s2, s1]; // newest 5 scans; reportId 42 is an older historical report

  const { current, previous } = selectComparisonPair(scans, 42, undefined);
  const hasMultiScans  = scans.length >= 2; // still true — we have 2 scans in state
  const liveComparison = (current && previous) ? compareScans(previous, current) : null;

  assert.equal(current, null, 'historical report not in window → current is null');
  assert.equal(liveComparison, null, 'liveComparison must be null for historical report');
  assert.equal(hasMultiScans, true, 'hasMultiScans is still true (scans array has entries)');

  const bannerShown = !!(liveComparison && hasMultiScans);
  assert.equal(bannerShown, false, 'banner must not show for reports outside comparison window');
});

test('banner condition: not shown when only one scan (first scan, nothing to compare)', () => {
  const curr = makeScan(5, BASE_URL, NEWER);
  const scans = [curr];

  const { current, previous } = selectComparisonPair(scans, 5, undefined);
  const hasMultiScans  = scans.length >= 2;
  const liveComparison = (current && previous) ? compareScans(previous, current) : null;

  assert.equal(liveComparison, null, 'no previous scan → liveComparison is null');
  assert.equal(hasMultiScans, false);

  const bannerShown = !!(liveComparison && hasMultiScans);
  assert.equal(bannerShown, false, 'banner must not show on first scan');
});

test('banner condition: shown consistently regardless of URL query parameters (fromRescan removed)', () => {
  // Simulate the same report viewed via three different navigation paths.
  // Under the old implementation, only path A would show the banner.
  // Under the fix, all three should produce identical banner eligibility.

  const prev = makeScan(3, BASE_URL, OLDER);
  const curr = makeScan(4, BASE_URL, NEWER);
  const scans = [curr, prev];

  const paths = [
    '/report/abc123?from=rescan',   // A — arrived from rescan button
    '/report/abc123',               // B — direct URL / refreshed
    '/report/abc123?verify=lh%3Afont-display', // C — arrived via verify link
  ];

  for (const path of paths) {
    // Old behavior: fromRescan derived from URL
    const fromRescanOld = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '').get('from') === 'rescan';

    // New behavior: derived from data
    const { current, previous } = selectComparisonPair(scans, 4, undefined);
    const hasMultiScans  = scans.length >= 2;
    const liveComparison = (current && previous) ? compareScans(previous, current) : null;
    const bannerShownNew = !!(liveComparison && hasMultiScans);

    assert.equal(bannerShownNew, true, `banner must show for path: ${path}`);

    // Demonstrate the regression: old condition was fromRescan && liveComparison && hasMultiScans
    const bannerShownOld = fromRescanOld && !!(liveComparison && hasMultiScans);
    if (path === paths[0]) {
      assert.equal(bannerShownOld, true,  'old behavior: banner shows on path A (?from=rescan)');
    } else {
      assert.equal(bannerShownOld, false, `old behavior: banner incorrectly hidden on path: ${path}`);
    }
  }
});

test('OverviewSection condition: shown when no valid comparison exists', () => {
  // OverviewSection guard: !(liveComparison && hasMultiScans)
  // This is the inverse of the banner condition — they are mutually exclusive.

  const singleScan = [makeScan(1, BASE_URL, NEWER)];
  const { current, previous } = selectComparisonPair(singleScan, 1, undefined);
  const hasMultiScans  = singleScan.length >= 2;
  const liveComparison = (current && previous) ? compareScans(previous, current) : null;

  const overviewShown = !(liveComparison && hasMultiScans);
  assert.equal(overviewShown, true, 'OverviewSection should show when no valid comparison exists');
});

test('OverviewSection condition: hidden when valid comparison exists (banner takes over)', () => {
  const prev = makeScan(1, BASE_URL, OLDER);
  const curr = makeScan(2, BASE_URL, NEWER);
  const scans = [curr, prev];

  const { current, previous } = selectComparisonPair(scans, 2, undefined);
  const hasMultiScans  = scans.length >= 2;
  const liveComparison = (current && previous) ? compareScans(previous, current) : null;

  const overviewShown = !(liveComparison && hasMultiScans);
  const bannerShown   = !!(liveComparison && hasMultiScans);

  assert.equal(bannerShown,   true,  'banner should show with valid comparison');
  assert.equal(overviewShown, false, 'OverviewSection must be hidden when banner is shown');
  // Mutual exclusion
  assert.notEqual(bannerShown, overviewShown, 'banner and OverviewSection must be mutually exclusive');
});
