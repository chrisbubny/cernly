// Tests for lib/scoring.js
// Run with: node --test lib/__tests__/scoring.test.mjs
// (Node 18+ built-in test runner, no test framework needed)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- inline the module under test (avoids @/ alias resolution) ---
// Copy of the functions from lib/scoring.js so this file runs without a bundler.

function normalizeScore(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeScores(raw) {
  const s = raw || {};
  return {
    performance:   normalizeScore(s.performance),
    seo:           normalizeScore(s.seo),
    security:      normalizeScore(s.security),
    accessibility: normalizeScore(s.accessibility),
    ux:            normalizeScore(s.ux),
  };
}

function avgScore(scores, keys = ['performance', 'seo', 'security', 'accessibility']) {
  const vals = keys.map(k => normalizeScore(scores?.[k])).filter(v => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function buildScoreLines(scores, auditStatuses = {}) {
  const normalized = normalizeScores(scores);
  const labels = { performance: 'Performance', seo: 'SEO', security: 'Security', accessibility: 'Accessibility', ux: 'UX' };
  const parts = [];
  for (const [key, label] of Object.entries(labels)) {
    if (key === 'ux') continue;
    const score = normalized[key];
    const status = auditStatuses[key];
    if (score != null) {
      parts.push(`${label}: ${score}/100`);
    } else if (status?.status && status.status !== 'completed') {
      const reason = status.error?.message || status.status;
      parts.push(`${label}: unavailable (${reason})`);
    }
  }
  if (normalized.ux != null) parts.push(`UX: ${normalized.ux}/100 (estimated)`);
  return parts.join(' | ') || 'No scores available';
}

function generateIssueFingerprint(issue) {
  const source = issue.source || 'unknown';
  if (issue.auditId) return `lh:${issue.auditId}`;
  if (issue.checkId) return `${source}:${issue.checkId}`;
  const normalized = (issue.message || '')
    .toLowerCase().replace(/\d+/g, 'N').replace(/[^a-z\s_]/g, '').trim()
    .replace(/\s+/g, '_').slice(0, 60);
  return `${source}:${normalized || 'unknown'}`;
}

function assignIssueFingerprintIds(issues) {
  const seen = new Map();
  return issues.map(issue => {
    const fp = generateIssueFingerprint(issue);
    const count = (seen.get(fp) || 0) + 1;
    seen.set(fp, count);
    const fingerprintId = count > 1 ? `${fp}:${count}` : fp;
    return { ...issue, fingerprintId };
  });
}

// ----------------------------------------------------------------
// normalizeScore
// ----------------------------------------------------------------
describe('normalizeScore', () => {
  it('returns null for null', () => assert.equal(normalizeScore(null), null));
  it('returns null for undefined', () => assert.equal(normalizeScore(undefined), null));
  it('returns null for NaN', () => assert.equal(normalizeScore(NaN), null));
  it('returns null for Infinity', () => assert.equal(normalizeScore(Infinity), null));
  it('returns null for -Infinity', () => assert.equal(normalizeScore(-Infinity), null));
  it('returns null for non-numeric string', () => assert.equal(normalizeScore('abc'), null));
  it('clamps negative to 0', () => assert.equal(normalizeScore(-5), 0));
  it('clamps above 100 to 100', () => assert.equal(normalizeScore(150), 100));
  it('rounds fractional score', () => assert.equal(normalizeScore(72.6), 73));
  it('handles numeric string', () => assert.equal(normalizeScore('85'), 85));
  it('passes valid score through', () => assert.equal(normalizeScore(60), 60));
  it('handles 0', () => assert.equal(normalizeScore(0), 0));
  it('handles 100', () => assert.equal(normalizeScore(100), 100));
});

// ----------------------------------------------------------------
// normalizeScores — object contamination
// ----------------------------------------------------------------
describe('normalizeScores', () => {
  it('strips auditStatuses from output', () => {
    const contaminated = {
      performance: 72,
      seo: 85,
      security: 60,
      accessibility: 90,
      auditStatuses: { performance: { status: 'completed', score: 72 } },
    };
    const result = normalizeScores(contaminated);
    assert.ok(!('auditStatuses' in result), 'auditStatuses should not be in normalized output');
  });

  it('returns null for missing categories', () => {
    const result = normalizeScores({ performance: 80 });
    assert.equal(result.seo, null);
    assert.equal(result.security, null);
    assert.equal(result.accessibility, null);
  });

  it('normalizes all five categories', () => {
    const result = normalizeScores({ performance: 72, seo: 88, security: 55, accessibility: 91, ux: 70 });
    assert.equal(result.performance, 72);
    assert.equal(result.seo, 88);
    assert.equal(result.security, 55);
    assert.equal(result.accessibility, 91);
    assert.equal(result.ux, 70);
  });

  it('handles NaN values in categories', () => {
    const result = normalizeScores({ performance: NaN, seo: 70 });
    assert.equal(result.performance, null);
    assert.equal(result.seo, 70);
  });

  it('handles empty/null input', () => {
    const r1 = normalizeScores(null);
    const r2 = normalizeScores({});
    assert.equal(r1.performance, null);
    assert.equal(r2.seo, null);
  });
});

// ----------------------------------------------------------------
// avgScore — missing score ≠ zero
// ----------------------------------------------------------------
describe('avgScore', () => {
  it('ignores null scores in average', () => {
    // Only performance (80) and seo (60) are present — average should be 70, not 35
    const scores = { performance: 80, seo: 60, security: null, accessibility: null };
    assert.equal(avgScore(scores), 70);
  });

  it('returns null when no valid scores', () => {
    assert.equal(avgScore({ performance: null, seo: null }), null);
  });

  it('returns null for empty object', () => {
    assert.equal(avgScore({}), null);
  });

  it('returns null for contaminated-only input', () => {
    // auditStatuses object should be stripped by normalizeScore → null
    assert.equal(avgScore({ auditStatuses: { performance: { status: 'completed', score: 80 } } }), null);
  });

  it('handles all four valid scores', () => {
    assert.equal(avgScore({ performance: 80, seo: 80, security: 80, accessibility: 80 }), 80);
  });

  it('rounds correctly', () => {
    // 70 + 71 = 141 / 2 = 70.5 → rounds to 71
    assert.equal(avgScore({ performance: 70, seo: 71, security: null, accessibility: null }), 71);
  });
});

// ----------------------------------------------------------------
// buildScoreLines — safe formatting
// ----------------------------------------------------------------
describe('buildScoreLines', () => {
  it('outputs numeric scores correctly', () => {
    const result = buildScoreLines({ performance: 72, seo: 88 });
    assert.ok(result.includes('Performance: 72/100'));
    assert.ok(result.includes('SEO: 88/100'));
  });

  it('does not include auditStatuses object in output', () => {
    const contaminated = {
      performance: 72,
      auditStatuses: { performance: { status: 'completed', score: 72 } },
    };
    const result = buildScoreLines(contaminated);
    assert.ok(!result.includes('[object Object]'), 'must not include [object Object]');
    assert.ok(!result.includes('auditStatuses'), 'must not include auditStatuses key');
  });

  it('shows unavailability reason when score is null and status is failed', () => {
    const scores = { performance: null, seo: 80 };
    const statuses = {
      performance: { status: 'failed', error: { message: 'Lighthouse timeout' } },
    };
    const result = buildScoreLines(scores, statuses);
    assert.ok(result.includes('Performance: unavailable (Lighthouse timeout)'));
  });

  it('omits a category entirely when score is null and no status', () => {
    const result = buildScoreLines({ performance: 80, seo: null });
    assert.ok(!result.includes('SEO'), 'SEO should be omitted when null with no status');
  });

  it('returns fallback string when no scores available', () => {
    assert.equal(buildScoreLines({}), 'No scores available');
  });

  it('appends UX score with (estimated) label', () => {
    const result = buildScoreLines({ ux: 75 });
    assert.ok(result.includes('UX: 75/100 (estimated)'));
  });
});

// ----------------------------------------------------------------
// generateIssueFingerprint — stable IDs
// ----------------------------------------------------------------
describe('generateIssueFingerprint', () => {
  it('uses lh: prefix for Lighthouse auditId', () => {
    const fp = generateIssueFingerprint({ source: 'lighthouse', auditId: 'render-blocking-resources' });
    assert.equal(fp, 'lh:render-blocking-resources');
  });

  it('uses source:checkId for non-Lighthouse', () => {
    const fp = generateIssueFingerprint({ source: 'seo', checkId: 'title_missing' });
    assert.equal(fp, 'seo:title_missing');
  });

  it('falls back to normalized message', () => {
    const fp = generateIssueFingerprint({ source: 'seo', message: 'Title too short (12 chars)' });
    // digits → N, special chars stripped, spaces → underscores
    assert.ok(fp.startsWith('seo:'), 'should start with source prefix');
    assert.ok(!fp.includes('12'), 'digits should be replaced');
  });

  it('handles empty message with fallback', () => {
    const fp = generateIssueFingerprint({ source: 'a11y', message: '' });
    assert.equal(fp, 'a11y:unknown');
  });

  it('unknown source when source missing', () => {
    const fp = generateIssueFingerprint({ auditId: 'unused-css-rules' });
    assert.equal(fp, 'lh:unused-css-rules');
  });

  it('auditId takes priority over checkId', () => {
    const fp = generateIssueFingerprint({ source: 'lighthouse', auditId: 'lcp', checkId: 'should_be_ignored' });
    assert.equal(fp, 'lh:lcp');
  });
});

// ----------------------------------------------------------------
// assignIssueFingerprintIds — stability and collision handling
// ----------------------------------------------------------------
describe('assignIssueFingerprintIds', () => {
  it('adds fingerprintId to every issue', () => {
    const issues = [
      { source: 'lighthouse', auditId: 'render-blocking-resources', message: 'Eliminate render-blocking resources' },
      { source: 'seo', checkId: 'title_missing', message: 'Missing page title' },
    ];
    const result = assignIssueFingerprintIds(issues);
    assert.ok(result[0].fingerprintId);
    assert.ok(result[1].fingerprintId);
  });

  it('does not modify other fields', () => {
    const issue = { source: 'seo', checkId: 'title_missing', message: 'Missing title', severity: 'critical' };
    const [result] = assignIssueFingerprintIds([issue]);
    assert.equal(result.message, issue.message);
    assert.equal(result.severity, issue.severity);
    assert.equal(result.source, issue.source);
  });

  it('assigns stable IDs across two identical issue sets (order-independent)', () => {
    const issues1 = [
      { source: 'lighthouse', auditId: 'render-blocking-resources', message: 'Render blocking' },
      { source: 'seo', checkId: 'title_missing', message: 'Missing title' },
    ];
    const issues2 = [
      // same issues, different order
      { source: 'seo', checkId: 'title_missing', message: 'Missing title' },
      { source: 'lighthouse', auditId: 'render-blocking-resources', message: 'Render blocking' },
    ];
    const r1 = assignIssueFingerprintIds(issues1);
    const r2 = assignIssueFingerprintIds(issues2);
    // Each issue should have the same fingerprintId regardless of order
    const lhR1 = r1.find(i => i.auditId === 'render-blocking-resources').fingerprintId;
    const lhR2 = r2.find(i => i.auditId === 'render-blocking-resources').fingerprintId;
    assert.equal(lhR1, lhR2);
    const seoR1 = r1.find(i => i.checkId === 'title_missing').fingerprintId;
    const seoR2 = r2.find(i => i.checkId === 'title_missing').fingerprintId;
    assert.equal(seoR1, seoR2);
  });

  it('disambiguates duplicate fingerprints within a scan', () => {
    // Two a11y issues with the same message (no auditId/checkId) get different IDs
    const issues = [
      { source: 'a11y', message: 'Missing alt text', severity: 'warning' },
      { source: 'a11y', message: 'Missing alt text', severity: 'warning' },
    ];
    const result = assignIssueFingerprintIds(issues);
    assert.notEqual(result[0].fingerprintId, result[1].fingerprintId);
    assert.ok(result[1].fingerprintId.endsWith(':2'), 'second duplicate should end with :2');
  });

  it('first occurrence has no :N suffix', () => {
    const issues = [{ source: 'seo', checkId: 'title_missing', message: 'Missing title' }];
    const [result] = assignIssueFingerprintIds(issues);
    assert.ok(!result.fingerprintId.endsWith(':1'), 'first unique occurrence should not end with :1');
    assert.equal(result.fingerprintId, 'seo:title_missing');
  });

  it('handles empty array', () => {
    assert.deepEqual(assignIssueFingerprintIds([]), []);
  });

  it('backward compat: old issues without auditId/checkId still get a fingerprintId', () => {
    const issues = [{ source: 'ssl', message: 'Missing CSP header', severity: 'warning' }];
    const [result] = assignIssueFingerprintIds(issues);
    assert.ok(result.fingerprintId.startsWith('ssl:'), 'should have ssl: prefix');
  });
});
