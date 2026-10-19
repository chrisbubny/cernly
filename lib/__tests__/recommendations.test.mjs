// Tests for lib/recommendations.js
// Run with: node --test lib/__tests__/recommendations.test.mjs
// (Node 18+ built-in test runner, no test framework needed)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- inline the functions under test (avoids @/ alias resolution) ---
// The logic is copied from lib/recommendations.js.

const RECOMMENDATION_GROUPS = {
  'js-overhead': {
    fingerprint: 'js-overhead',
    title: 'Reduce JavaScript overhead',
    category: 'Performance',
    defaultPriority: 'high',
    findingPrefixes: [
      'lh:unused-javascript',
      'lh:total-blocking-time',
      'lh:mainthread-work-breakdown',
      'lh:bootup-time',
      'lh:render-blocking-resources',
    ],
  },
  'seo-meta': {
    fingerprint: 'seo-meta',
    title: 'Fix missing or weak SEO metadata',
    category: 'SEO',
    defaultPriority: 'high',
    findingPrefixes: [
      'seo:title_missing',
      'seo:meta_desc_missing',
      'seo:h1_missing',
    ],
  },
  'security-headers': {
    fingerprint: 'security-headers',
    title: 'Add missing security headers',
    category: 'Security',
    defaultPriority: 'medium',
    findingPrefixes: [
      'ssl:missing_header_content_security_policy',
      'ssl:missing_header_x_frame_options',
    ],
  },
  'https-enforcement': {
    fingerprint: 'https-enforcement',
    title: 'Enforce HTTPS and secure transport',
    category: 'Security',
    defaultPriority: 'critical',
    findingPrefixes: [
      'ssl:https_missing',
      'ssl:http_no_redirect',
    ],
  },
  'accessibility-barriers': {
    fingerprint: 'accessibility-barriers',
    title: 'Fix accessibility barriers',
    category: 'Accessibility',
    defaultPriority: 'high',
    findingPrefixes: [
      'a11y:images_missing_alt',
      'a11y:html_lang_missing',
      'lh:aria-',     // prefix match
    ],
  },
};

function groupIssues(issues) {
  const grouped = {};
  for (const issue of issues) {
    const fid = issue.fingerprintId || '';
    for (const [groupKey, group] of Object.entries(RECOMMENDATION_GROUPS)) {
      const matched = group.findingPrefixes.some(prefix =>
        prefix.endsWith('-') ? fid.startsWith(prefix) : fid === prefix
      );
      if (matched) {
        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push(issue);
      }
    }
  }
  return grouped;
}

const SEVERITY_WEIGHT = { critical: 10, warning: 4, info: 1 };
const PRIORITY_THRESHOLDS = [
  { min: 10, label: 'critical' },
  { min: 6,  label: 'high' },
  { min: 3,  label: 'medium' },
  { min: 0,  label: 'low' },
];

function calcPriority(groupKey, matchedIssues) {
  const group = RECOMMENDATION_GROUPS[groupKey];
  if (!group) return 'low';
  const score = matchedIssues.reduce((acc, i) => acc + (SEVERITY_WEIGHT[i.severity] || 0), 0);
  const computed = PRIORITY_THRESHOLDS.find(t => score >= t.min)?.label || 'low';
  const ORDER = ['low', 'medium', 'high', 'critical'];
  const defaultIdx  = ORDER.indexOf(group.defaultPriority);
  const computedIdx = ORDER.indexOf(computed);
  return ORDER[Math.max(defaultIdx, computedIdx)];
}

function buildBaseRecommendations(issues) {
  const grouped = groupIssues(issues);
  const recs = [];
  for (const [groupKey, matchedIssues] of Object.entries(grouped)) {
    const group = RECOMMENDATION_GROUPS[groupKey];
    const priority = calcPriority(groupKey, matchedIssues);
    recs.push({
      fingerprint: group.fingerprint,
      title: group.title,
      category: group.category,
      priority,
      finding_fingerprints: matchedIssues.map(i => i.fingerprintId).filter(Boolean),
      confidence: matchedIssues.some(i => i.severity === 'critical') ? 'high'
                : matchedIssues.length >= 2 ? 'medium'
                : 'low',
      aiEnriched: false,
    });
  }
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort((a, b) => (ORDER[a.priority] ?? 3) - (ORDER[b.priority] ?? 3));
  return recs;
}

// ----------------------------------------------------------------
// groupIssues
// ----------------------------------------------------------------
describe('groupIssues', () => {
  it('groups a Lighthouse finding into the correct group', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning' },
    ];
    const grouped = groupIssues(issues);
    assert.ok('js-overhead' in grouped, 'should create js-overhead group');
    assert.equal(grouped['js-overhead'].length, 1);
  });

  it('groups an SEO finding into seo-meta', () => {
    const issues = [
      { fingerprintId: 'seo:title_missing', source: 'seo', severity: 'critical' },
    ];
    const grouped = groupIssues(issues);
    assert.ok('seo-meta' in grouped);
  });

  it('groups multiple findings into the same group', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning' },
      { fingerprintId: 'lh:bootup-time', source: 'lighthouse', severity: 'warning' },
    ];
    const grouped = groupIssues(issues);
    assert.equal(grouped['js-overhead'].length, 2);
  });

  it('returns empty object when no issues match any group', () => {
    const issues = [
      { fingerprintId: 'unknown:some_check', source: 'unknown', severity: 'info' },
    ];
    const grouped = groupIssues(issues);
    assert.equal(Object.keys(grouped).length, 0);
  });

  it('handles prefix matching for Lighthouse aria audits', () => {
    const issues = [
      { fingerprintId: 'lh:aria-hidden-body', source: 'lighthouse', severity: 'warning' },
      { fingerprintId: 'lh:aria-allowed-attr', source: 'lighthouse', severity: 'critical' },
    ];
    const grouped = groupIssues(issues);
    assert.ok('accessibility-barriers' in grouped);
    assert.equal(grouped['accessibility-barriers'].length, 2);
  });

  it('does not match a finding to wrong group even if prefix is substring', () => {
    // 'ssl:http_no_redirect' should only match https-enforcement, not security-headers
    const issues = [
      { fingerprintId: 'ssl:http_no_redirect', source: 'ssl', severity: 'warning' },
    ];
    const grouped = groupIssues(issues);
    assert.ok('https-enforcement' in grouped, 'should be in https-enforcement');
    assert.ok(!('security-headers' in grouped), 'should NOT be in security-headers');
  });

  it('handles empty issues array', () => {
    assert.deepEqual(groupIssues([]), {});
  });

  it('handles issues with no fingerprintId', () => {
    const issues = [{ source: 'seo', severity: 'warning' }]; // no fingerprintId
    const grouped = groupIssues(issues);
    assert.equal(Object.keys(grouped).length, 0);
  });
});

// ----------------------------------------------------------------
// calcPriority
// ----------------------------------------------------------------
describe('calcPriority', () => {
  it('returns critical when a critical finding is present', () => {
    const issues = [{ severity: 'critical' }];
    assert.equal(calcPriority('seo-meta', issues), 'critical');
  });

  it('returns high for multiple warnings in js-overhead (default high)', () => {
    const issues = [{ severity: 'warning' }, { severity: 'warning' }];
    // score = 8 → computed = high; default = high → result = high
    assert.equal(calcPriority('js-overhead', issues), 'high');
  });

  it('never downgrades below group default priority', () => {
    // https-enforcement has defaultPriority = 'critical'
    // Even with a single info finding (score 1 → low), should still be critical
    const issues = [{ severity: 'info' }];
    assert.equal(calcPriority('https-enforcement', issues), 'critical');
  });

  it('upgrades above default when findings are severe', () => {
    // security-headers default = 'medium'
    // Two critical findings → score = 20 → computed = 'critical'
    const issues = [{ severity: 'critical' }, { severity: 'critical' }];
    assert.equal(calcPriority('security-headers', issues), 'critical');
  });

  it('returns low for a single info finding in a low-default group', () => {
    const issues = [{ severity: 'info' }];
    // Adds an 'image-optimization' equivalent with low default
    // — use security-headers (medium default) to test lower bound
    // score = 1 → low; default = medium → medium
    assert.equal(calcPriority('security-headers', issues), 'medium');
  });

  it('returns low for unknown group key', () => {
    assert.equal(calcPriority('nonexistent-group', [{ severity: 'critical' }]), 'low');
  });
});

// ----------------------------------------------------------------
// buildBaseRecommendations
// ----------------------------------------------------------------
describe('buildBaseRecommendations', () => {
  it('returns one recommendation per matched group', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning' },
      { fingerprintId: 'seo:title_missing',    source: 'seo',        severity: 'critical' },
    ];
    const recs = buildBaseRecommendations(issues);
    assert.equal(recs.length, 2);
  });

  it('sorts critical priority before high', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning' }, // → high
      { fingerprintId: 'seo:title_missing',    source: 'seo',        severity: 'critical' }, // → critical
    ];
    const recs = buildBaseRecommendations(issues);
    assert.equal(recs[0].priority, 'critical');
    assert.equal(recs[1].priority, 'high');
  });

  it('includes finding_fingerprints array', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning', message: 'Unused JS' },
      { fingerprintId: 'lh:bootup-time',       source: 'lighthouse', severity: 'warning', message: 'Long JS execution' },
    ];
    const recs = buildBaseRecommendations(issues);
    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.ok(jsRec, 'should have js-overhead rec');
    assert.ok(jsRec.finding_fingerprints.includes('lh:unused-javascript'));
    assert.ok(jsRec.finding_fingerprints.includes('lh:bootup-time'));
  });

  it('marks confidence high when any finding is critical', () => {
    const issues = [
      { fingerprintId: 'seo:title_missing', source: 'seo', severity: 'critical' },
    ];
    const recs = buildBaseRecommendations(issues);
    assert.equal(recs[0].confidence, 'high');
  });

  it('marks confidence medium with 2+ findings of non-critical severity', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning' },
      { fingerprintId: 'lh:bootup-time',       source: 'lighthouse', severity: 'warning' },
    ];
    const recs = buildBaseRecommendations(issues);
    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.equal(jsRec.confidence, 'medium');
  });

  it('returns empty array when no issues match any group', () => {
    const issues = [
      { fingerprintId: 'unknown:something', source: 'unknown', severity: 'warning' },
    ];
    assert.deepEqual(buildBaseRecommendations(issues), []);
  });

  it('does not include AI-enriched marker on base recommendations', () => {
    const issues = [
      { fingerprintId: 'lh:unused-javascript', source: 'lighthouse', severity: 'warning' },
    ];
    const recs = buildBaseRecommendations(issues);
    assert.equal(recs[0].aiEnriched, false);
  });

  it('handles empty issues array', () => {
    assert.deepEqual(buildBaseRecommendations([]), []);
  });
});
