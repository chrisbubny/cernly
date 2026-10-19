/**
 * Stage 4 — Deterministic comparison engine tests
 *
 * Framework: node:test + node:assert/strict
 * Run: node --import ./alias-hooks.mjs lib/__tests__/stage4.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUrlForComparison,
  checkUrlCompatibility,
  auditCompleted,
  auditFailed,
  categoryForFingerprint,
  analyzeScoreDelta,
  compareFindings,
  compareRecommendations,
  buildProgressSummary,
  compareScans,
} from '@/lib/comparison.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeAudit = (status) => ({
  performance:   { status },
  seo:           { status },
  security:      { status },
  accessibility: { status },
});

const completedAudit = makeAudit('completed');
const failedAudit    = makeAudit('failed');
const emptyAudit     = {};

const makeIssue = (fingerprintId, severity = 'warning', category = null) => ({
  fingerprintId,
  severity,
  category: category ?? categoryForFingerprint(fingerprintId) ?? 'seo',
  message: `Issue for ${fingerprintId}`,
  source: 'test',
});

const makeRec = (fingerprint, priority = 'high', findingFps = []) => ({
  fingerprint,
  title: `Rec for ${fingerprint}`,
  priority,
  category: 'seo',
  finding_fingerprints: findingFps,
  supporting_findings: [],
});

const baseScan = (url, scores, issues = [], recs = [], auditStatuses = completedAudit) => ({
  id: Math.random().toString(36).slice(2),
  slug: Math.random().toString(36).slice(2),
  url,
  scores,
  auditStatuses,
  issues,
  recommendations: recs,
  createdAt: new Date().toISOString(),
});

// ---------------------------------------------------------------------------
// 1. normalizeUrlForComparison
// ---------------------------------------------------------------------------

describe('normalizeUrlForComparison', () => {
  it('lowercases scheme and host', () => {
    assert.equal(
      normalizeUrlForComparison('HTTPS://Example.COM/path'),
      'https://example.com/path',
    );
  });

  it('preserves path casing', () => {
    assert.equal(
      normalizeUrlForComparison('https://example.com/About-Us'),
      'https://example.com/About-Us',
    );
  });

  it('strips trailing slash from non-root paths', () => {
    assert.equal(
      normalizeUrlForComparison('https://example.com/page/'),
      'https://example.com/page',
    );
  });

  it('keeps trailing slash on root path', () => {
    assert.equal(
      normalizeUrlForComparison('https://example.com/'),
      'https://example.com/',
    );
  });

  it('strips query string and fragment', () => {
    assert.equal(
      normalizeUrlForComparison('https://example.com/page?foo=1#section'),
      'https://example.com/page',
    );
  });

  it('does NOT strip www prefix', () => {
    assert.notEqual(
      normalizeUrlForComparison('https://www.example.com/'),
      normalizeUrlForComparison('https://example.com/'),
    );
  });

  it('returns null for unparsable URL', () => {
    assert.equal(normalizeUrlForComparison('not-a-url'), null);
    assert.equal(normalizeUrlForComparison(null), null);
    assert.equal(normalizeUrlForComparison(''), null);
  });
});

// ---------------------------------------------------------------------------
// 2. checkUrlCompatibility
// ---------------------------------------------------------------------------

describe('checkUrlCompatibility', () => {
  it('returns compatible:true for same URL', () => {
    const r = checkUrlCompatibility('https://example.com/page', 'https://example.com/page');
    assert.ok(r.compatible);
  });

  it('returns compatible:false for different paths', () => {
    const r = checkUrlCompatibility('https://example.com/about', 'https://example.com/contact');
    assert.ok(!r.compatible);
    assert.ok(r.reason.includes('different pages'));
  });

  it('returns compatible:false when www vs non-www', () => {
    const r = checkUrlCompatibility('https://example.com/', 'https://www.example.com/');
    assert.ok(!r.compatible);
  });

  it('handles trailing-slash normalization consistently', () => {
    const r = checkUrlCompatibility('https://example.com/page/', 'https://example.com/page');
    assert.ok(r.compatible);
  });
});

// ---------------------------------------------------------------------------
// 3. Audit helpers
// ---------------------------------------------------------------------------

describe('auditCompleted / auditFailed', () => {
  const statuses = {
    performance: { status: 'completed' },
    seo:         { status: 'failed' },
    security:    { status: 'blocked' },
  };

  it('auditCompleted returns true only for completed', () => {
    assert.ok(auditCompleted(statuses, 'performance'));
    assert.ok(!auditCompleted(statuses, 'seo'));
    assert.ok(!auditCompleted(statuses, 'security'));
    assert.ok(!auditCompleted(statuses, 'accessibility'));
  });

  it('auditFailed returns true for failed and blocked', () => {
    assert.ok(!auditFailed(statuses, 'performance'));
    assert.ok(auditFailed(statuses, 'seo'));
    assert.ok(auditFailed(statuses, 'security'));
    assert.ok(!auditFailed(statuses, 'accessibility'));
  });
});

describe('categoryForFingerprint', () => {
  it('maps lh: to performance', () => assert.equal(categoryForFingerprint('lh:first-contentful-paint'), 'performance'));
  it('maps seo: to seo',        () => assert.equal(categoryForFingerprint('seo:missing-title'), 'seo'));
  it('maps ssl: to security',   () => assert.equal(categoryForFingerprint('ssl:expired-cert'), 'security'));
  it('maps a11y: to accessibility', () => assert.equal(categoryForFingerprint('a11y:color-contrast'), 'accessibility'));
  it('returns null for unknown prefix', () => assert.equal(categoryForFingerprint('unknown:thing'), null));
  it('returns null for null input', () => assert.equal(categoryForFingerprint(null), null));
});

// ---------------------------------------------------------------------------
// 4. analyzeScoreDelta
// ---------------------------------------------------------------------------

describe('analyzeScoreDelta', () => {
  it('classifies delta within noise band as noise/unchanged', () => {
    const r = analyzeScoreDelta(75, 80, 'performance'); // delta=5, noise=8
    assert.equal(r.significance, 'noise');
    assert.equal(r.direction, 'unchanged');
    assert.equal(r.delta, 5);
  });

  it('classifies delta outside noise as observed improvement', () => {
    const r = analyzeScoreDelta(70, 82, 'performance'); // delta=12, noise=8, notable=15
    assert.equal(r.significance, 'observed');
    assert.equal(r.direction, 'improved');
  });

  it('classifies large delta as notable', () => {
    const r = analyzeScoreDelta(50, 80, 'seo'); // delta=30, notable=8
    assert.equal(r.significance, 'notable');
    assert.equal(r.direction, 'improved');
  });

  it('classifies regression correctly', () => {
    const r = analyzeScoreDelta(90, 70, 'seo'); // delta=-20
    assert.equal(r.direction, 'regressed');
    assert.equal(r.delta, -20);
    assert.ok(r.significance !== 'noise');
  });

  it('returns unknown direction when either score is null', () => {
    const r = analyzeScoreDelta(null, 80, 'performance');
    assert.equal(r.direction, 'unknown');
    assert.equal(r.delta, null);
  });

  it('uses tight noise band for SEO (3pts)', () => {
    const r = analyzeScoreDelta(90, 92, 'seo'); // delta=2 ≤ 3 → noise
    assert.equal(r.significance, 'noise');
    const r2 = analyzeScoreDelta(90, 94, 'seo'); // delta=4 > 3 → observed
    assert.equal(r2.significance, 'observed');
  });
});

// ---------------------------------------------------------------------------
// 5. compareFindings
// ---------------------------------------------------------------------------

describe('compareFindings — still_detected', () => {
  it('puts fingerprint in still_detected when present in both scans', () => {
    const issue = makeIssue('seo:missing-title');
    const result = compareFindings([issue], [issue], completedAudit, completedAudit);
    assert.equal(result.still_detected.length, 1);
    assert.equal(result.still_detected[0].fingerprintId, 'seo:missing-title');
    assert.equal(result.likely_resolved.length, 0);
    assert.equal(result.unable_to_verify.length, 0);
  });
});

describe('compareFindings — likely_resolved', () => {
  it('classifies absent finding as likely_resolved when audit completed', () => {
    const issue = makeIssue('seo:missing-title');
    const result = compareFindings([issue], [], completedAudit, completedAudit);
    assert.equal(result.likely_resolved.length, 1);
    assert.equal(result.likely_resolved[0].fingerprintId, 'seo:missing-title');
    assert.equal(result.likely_resolved[0].verifiedBy, 'seo');
  });
});

describe('compareFindings — unable_to_verify', () => {
  it('classifies absent finding as unable_to_verify when audit failed', () => {
    const issue = makeIssue('seo:missing-title');
    const result = compareFindings([issue], [], completedAudit, failedAudit);
    assert.equal(result.unable_to_verify.length, 1);
    assert.ok(result.unable_to_verify[0].reason.includes('failed or was blocked'));
    assert.equal(result.likely_resolved.length, 0);
  });

  it('classifies absent finding as unable_to_verify when audit status absent', () => {
    const issue = makeIssue('seo:missing-title');
    const result = compareFindings([issue], [], completedAudit, emptyAudit);
    assert.equal(result.unable_to_verify.length, 1);
    assert.ok(result.unable_to_verify[0].reason.includes('did not complete'));
  });
});

describe('compareFindings — new_since', () => {
  it('surfaces new critical findings as new_since', () => {
    const newIssue = makeIssue('ssl:expired-cert', 'critical');
    const result = compareFindings([], [newIssue], completedAudit, completedAudit);
    assert.equal(result.new_since.length, 1);
    assert.equal(result.new_since[0].fingerprintId, 'ssl:expired-cert');
  });

  it('does not surface new info-severity findings as new_since', () => {
    const newIssue = makeIssue('seo:minor-thing', 'info');
    const result = compareFindings([], [newIssue], completedAudit, completedAudit);
    assert.equal(result.new_since.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. compareRecommendations
// ---------------------------------------------------------------------------

describe('compareRecommendations — likely_resolved', () => {
  it('marks rec as likely_resolved when all finding fingerprints are gone and audit completed', () => {
    const fp  = 'seo:missing-title';
    const rec = makeRec('rec:seo-basics', 'high', [fp]);
    const result = compareRecommendations([rec], [], [], completedAudit);
    assert.equal(result.likely_resolved.length, 1);
    assert.equal(result.still_open.length, 0);
  });
});

describe('compareRecommendations — still_open', () => {
  it('marks rec as still_open when all its finding fingerprints still present', () => {
    const fp    = 'seo:missing-title';
    const rec   = makeRec('rec:seo-basics', 'high', [fp]);
    const issue = makeIssue(fp);
    const result = compareRecommendations([rec], [rec], [issue], completedAudit);
    assert.equal(result.still_open.length, 1);
    assert.equal(result.likely_resolved.length, 0);
  });
});

describe('compareRecommendations — partially_resolved', () => {
  it('marks rec as partially_resolved when some findings gone and some still present', () => {
    const fp1 = 'seo:missing-title';
    const fp2 = 'seo:duplicate-title';
    const rec = makeRec('rec:seo-titles', 'high', [fp1, fp2]);
    const remainingIssue = makeIssue(fp2); // fp1 gone, fp2 still present
    const result = compareRecommendations([rec], [rec], [remainingIssue], completedAudit);
    assert.equal(result.partially_resolved.length, 1);
    const p = result.partially_resolved[0];
    assert.equal(p.resolvedFindings, 1);
    assert.equal(p.persistentFindings, 1);
  });
});

describe('compareRecommendations — unable_to_verify', () => {
  it('marks rec as unable_to_verify when no finding fingerprints available', () => {
    const rec = makeRec('rec:old-style', 'high', []); // legacy rec with no finding fps
    const result = compareRecommendations([rec], [], [], completedAudit);
    assert.equal(result.unable_to_verify.length, 1);
    assert.ok(result.unable_to_verify[0].reason.includes('No supporting finding fingerprints'));
  });

  it('marks rec unable_to_verify when findings absent but audit did not complete', () => {
    const fp  = 'seo:missing-title';
    const rec = makeRec('rec:seo-basics', 'high', [fp]);
    const result = compareRecommendations([rec], [], [], emptyAudit);
    assert.equal(result.unable_to_verify.length, 1);
  });
});

describe('compareRecommendations — new_high_priority', () => {
  it('flags critical recs that are new in current scan', () => {
    const newRec = makeRec('rec:new-critical', 'critical');
    const result = compareRecommendations([], [newRec], [], completedAudit);
    assert.equal(result.new_high_priority.length, 1);
    assert.equal(result.new_high_priority[0].rec.fingerprint, 'rec:new-critical');
  });

  it('does not flag low-priority new recs as new_high_priority', () => {
    const newRec = makeRec('rec:low-prio', 'low');
    const result = compareRecommendations([], [newRec], [], completedAudit);
    assert.equal(result.new_high_priority.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. compareScans (integration-level)
// ---------------------------------------------------------------------------

describe('compareScans — incompatible URLs', () => {
  it('returns isComparable:false for different page URLs', () => {
    const prev = baseScan('https://example.com/about', { performance: 70 });
    const curr = baseScan('https://example.com/contact', { performance: 80 });
    const r = compareScans(prev, curr);
    assert.ok(!r.isComparable);
    assert.ok(r.summary.includes('cannot be compared'));
  });

  it('returns isComparable:false when www vs non-www', () => {
    const prev = baseScan('https://www.example.com/', { performance: 70 });
    const curr = baseScan('https://example.com/',     { performance: 80 });
    const r = compareScans(prev, curr);
    assert.ok(!r.isComparable);
  });
});

describe('compareScans — comparable scans', () => {
  const URL = 'https://example.com/page';

  it('produces scoreDelta for each category', () => {
    const prev = baseScan(URL, { performance: 60, seo: 80, security: 90, accessibility: 70 });
    const curr = baseScan(URL, { performance: 80, seo: 85, security: 90, accessibility: 72 });
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.ok('performance' in r.scoreDelta);
    assert.ok('seo' in r.scoreDelta);
    assert.ok('security' in r.scoreDelta);
    assert.ok('accessibility' in r.scoreDelta);
  });

  it('notes notable performance improvement in summary', () => {
    const prev = baseScan(URL, { performance: 50 });
    const curr = baseScan(URL, { performance: 80 }); // +30 — notable
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.ok(r.summary.toLowerCase().includes('performance'));
  });

  it('notes regression in summary', () => {
    const prev = baseScan(URL, { seo: 90 });
    const curr = baseScan(URL, { seo: 70 }); // -20 — notable regression
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.ok(r.summary.toLowerCase().includes('seo'));
    assert.ok(r.summary.toLowerCase().includes('declin') || r.summary.toLowerCase().includes('seo'));
  });

  it('carries finding-level resolution into result', () => {
    const issue = makeIssue('seo:missing-title');
    const prev  = baseScan(URL, { seo: 70 }, [issue]);
    const curr  = baseScan(URL, { seo: 85 }, []);           // finding gone, audit completed
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.equal(r.findings.likely_resolved.length, 1);
    assert.equal(r.findings.still_detected.length, 0);
  });

  it('marks finding unable_to_verify when audit failed', () => {
    const issue = makeIssue('seo:missing-title');
    const prev  = baseScan(URL, { seo: 70 }, [issue]);
    const curr  = baseScan(URL, { seo: 85 }, [], [], failedAudit);
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.equal(r.findings.unable_to_verify.length, 1);
    assert.equal(r.findings.likely_resolved.length, 0);
  });

  it('reports limited comparability when auditStatuses absent', () => {
    const prev = baseScan(URL, { seo: 70 }, [], [], emptyAudit);
    const curr = baseScan(URL, { seo: 85 }, [], [], emptyAudit);
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.equal(r.comparabilityLevel, 'limited');
    assert.ok(r.verificationLimitations.some(l => l.includes('metadata is absent')));
  });

  it('surfaces new high-priority rec in recommendations', () => {
    const newRec = makeRec('rec:new-critical', 'critical');
    const prev   = baseScan(URL, { seo: 85 }, [], []);
    const curr   = baseScan(URL, { seo: 85 }, [], [newRec]);
    const r = compareScans(prev, curr);
    assert.ok(r.isComparable);
    assert.equal(r.recommendations.new_high_priority.length, 1);
    assert.ok(r.summary.includes('new high-priority'));
  });
});

// ---------------------------------------------------------------------------
// 8. buildProgressSummary edge cases
// ---------------------------------------------------------------------------

describe('buildProgressSummary', () => {
  it('returns a no-change message when nothing is meaningful', () => {
    const base = {
      scoreDelta: {
        performance: { direction: 'unchanged', significance: 'noise' },
        seo:         { direction: 'unchanged', significance: 'noise' },
      },
      findings: { likely_resolved: [], still_detected: [], unable_to_verify: [], new_since: [] },
      recommendations: {
        likely_resolved: [], still_open: [], partially_resolved: [],
        unable_to_verify: [], new_high_priority: [],
      },
      verificationLimitations: [],
      comparabilityLevel: 'full',
    };
    const s = buildProgressSummary(base);
    assert.ok(s.includes('No meaningful changes'));
  });

  it('includes limitation note when comparabilityLevel is limited', () => {
    const base = {
      scoreDelta: {},
      findings: { likely_resolved: [], still_detected: [], unable_to_verify: [], new_since: [] },
      recommendations: {
        likely_resolved: [], still_open: [], partially_resolved: [],
        unable_to_verify: [], new_high_priority: [],
      },
      verificationLimitations: [],
      comparabilityLevel: 'limited',
    };
    const s = buildProgressSummary(base);
    assert.ok(s.includes('Audit status metadata was incomplete'));
  });

  it('pluralizes "fixes" correctly for multiple resolved recs', () => {
    const base = {
      scoreDelta: {},
      findings: { likely_resolved: [], still_detected: [], unable_to_verify: [], new_since: [] },
      recommendations: {
        likely_resolved: [{ rec: {} }, { rec: {} }],
        still_open: [], partially_resolved: [],
        unable_to_verify: [], new_high_priority: [],
      },
      verificationLimitations: [],
      comparabilityLevel: 'full',
    };
    const s = buildProgressSummary(base);
    assert.ok(s.includes('2 previously recommended fixes appear'));
  });
});
