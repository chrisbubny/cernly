/**
 * Stage 2 tests — structured assessment
 *
 * Covers:
 *   1. buildCoverageSummary — deterministic, all audit combinations
 *   2. computeConfidenceLevel — evidence quality rubric (not severity)
 *   3. validateAssessment — schema enforcement, fingerprint references
 *   4. runAssessment — AI call mocking, field enforcement, validation gate
 *
 * Run: node --import ./lib/__tests__/alias-loader.mjs --test lib/__tests__/stage2.test.mjs
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCoverageSummary,
  computeConfidenceLevel,
  validateAssessment,
  runAssessment,
} from '../analyzers/ai.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUDIT_STATUSES_ALL_PASS = {
  performance:   { status: 'completed', score: 85 },
  seo:           { status: 'completed', score: 92 },
  security:      { status: 'completed', score: 78 },
  accessibility: { status: 'completed', score: 88 },
};

const AUDIT_STATUSES_TWO_FAIL = {
  performance:   { status: 'completed', score: 72 },
  seo:           { status: 'completed', score: 88 },
  security:      { status: 'failed',   score: null, error: { code: 'FETCH_FAILED' } },
  accessibility: { status: 'failed',   score: null, error: { code: 'ANALYZER_ERROR' } },
};

const AUDIT_STATUSES_ALL_FAIL = {
  performance:   { status: 'failed', score: null },
  seo:           { status: 'failed', score: null },
  security:      { status: 'failed', score: null },
  accessibility: { status: 'failed', score: null },
};

const AUDIT_STATUSES_ONE_PASS = {
  performance:   { status: 'completed', score: 55 },
  seo:           { status: 'failed', score: null },
  security:      { status: 'failed', score: null },
  accessibility: { status: 'failed', score: null },
};

const LH_DATA_WITH_METRICS = {
  metrics: { lcp: '3.2s', fcp: '1.1s', tbt: '420ms', ttfb: '580ms', si: '2.4s', cls: '0.02' },
};

const RECS_WITH_FINDINGS = [
  {
    fingerprint: 'js-overhead',
    title: 'Reduce JavaScript execution time',
    priority: 'critical',
    supporting_findings: [
      { fingerprintId: 'lh-js-execution', message: 'JavaScript execution time', displayValue: '4.1 s', severity: 'critical' },
    ],
  },
  {
    fingerprint: 'seo-meta',
    title: 'Add missing meta descriptions',
    priority: 'high',
    supporting_findings: [
      { fingerprintId: 'seo-metadesc', message: 'Document does not have a meta description', severity: 'warning' },
    ],
  },
];

const RECS_NO_FINDINGS = [
  { fingerprint: 'render-block', title: 'Eliminate render-blocking resources', priority: 'high', supporting_findings: [] },
];

const VALID_ASSESSMENT = {
  headline: 'JavaScript execution is blocking your page render significantly',
  summary: 'The site scores well on SEO and security but has critical performance bottlenecks. JavaScript execution takes over 4 seconds, directly delaying when visitors can interact with the page.',
  strengths: [
    { area: 'SEO', finding: 'Strong metadata structure across all pages.', evidence: 'seo score: 92' },
  ],
  concerns: [
    { area: 'Performance', finding: 'JavaScript execution blocks main thread.', severity: 'high', evidence: 'lh-js-execution' },
  ],
  top_opportunity: {
    title: 'Reduce JavaScript execution time',
    rationale: 'With a 4.1s main thread block, fixing JS execution unlocks the largest single improvement available. Resolving this is a prerequisite to addressing all other interaction latency.',
    recommendation_fingerprints: ['js-overhead'],
  },
  next_steps: ['Audit and defer non-critical JavaScript bundles', 'Remove unused dependencies'],
  confidence: {
    level: 'high',
    explanation: 'All 4 audits completed with measured LCP, FCP, and TBT values providing direct evidence.',
  },
  coverage: {
    audits_ran: ['performance', 'seo', 'security', 'accessibility'],
    audits_failed: [],
    limitations: null,
  },
};

// ── 1. buildCoverageSummary ───────────────────────────────────────────────────

describe('buildCoverageSummary', () => {
  test('all 4 audits completed → ran=4, failed=[], limitations=null', () => {
    const result = buildCoverageSummary(AUDIT_STATUSES_ALL_PASS);
    assert.equal(result.ran.length, 4);
    assert.ok(result.ran.includes('performance'));
    assert.ok(result.ran.includes('accessibility'));
    assert.equal(result.failed.length, 0);
    assert.equal(result.limitations, null);
  });

  test('2 failed audits → correct ran/failed lists and a non-null limitations message', () => {
    const result = buildCoverageSummary(AUDIT_STATUSES_TWO_FAIL);
    assert.ok(result.ran.includes('performance'));
    assert.ok(result.ran.includes('seo'));
    assert.ok(result.failed.includes('security'));
    assert.ok(result.failed.includes('accessibility'));
    assert.ok(result.limitations.includes('security'));
    assert.ok(result.limitations.includes('accessibility'));
    assert.ok(/do not/i.test(result.limitations));
  });

  test('all audits failed → ran=[], failed=4, limitations present', () => {
    const result = buildCoverageSummary(AUDIT_STATUSES_ALL_FAIL);
    assert.equal(result.ran.length, 0);
    assert.equal(result.failed.length, 4);
    assert.ok(result.limitations);
  });

  test('empty auditStatuses → treats all as failed', () => {
    const result = buildCoverageSummary({});
    assert.equal(result.ran.length, 0);
    assert.equal(result.failed.length, 4);
  });

  test('single failed audit uses singular grammar in limitations', () => {
    const result = buildCoverageSummary({
      performance:   { status: 'completed', score: 80 },
      seo:           { status: 'completed', score: 85 },
      security:      { status: 'completed', score: 70 },
      accessibility: { status: 'failed', score: null },
    });
    assert.deepEqual(result.failed, ['accessibility']);
    // Should say "audit could" (singular) not "audits could" (plural)
    assert.ok(!/audits could/.test(result.limitations), `Expected singular grammar, got: ${result.limitations}`);
    assert.ok(/audit could/.test(result.limitations), `Expected "audit could", got: ${result.limitations}`);
  });
});

// ── 2. computeConfidenceLevel ─────────────────────────────────────────────────

describe('computeConfidenceLevel', () => {
  test('4 audits + measured metrics + traceable recs → high', () => {
    const level = computeConfidenceLevel(AUDIT_STATUSES_ALL_PASS, RECS_WITH_FINDINGS, LH_DATA_WITH_METRICS);
    assert.equal(level, 'high');
  });

  test('healthy site: 4 audits + no issues + no metrics → high (evidence = completeness)', () => {
    // A healthy site with all audits complete should still earn high confidence.
    // Confidence measures evidence quality, not problem severity.
    const level = computeConfidenceLevel(AUDIT_STATUSES_ALL_PASS, [], null);
    assert.equal(level, 'high');
  });

  test('4 audits + traceable recs (no metrics) → high', () => {
    const level = computeConfidenceLevel(AUDIT_STATUSES_ALL_PASS, RECS_WITH_FINDINGS, null);
    assert.equal(level, 'high');
  });

  test('3 audits complete + measured metrics → high', () => {
    const threePass = {
      ...AUDIT_STATUSES_ALL_PASS,
      accessibility: { status: 'failed', score: null },
    };
    const level = computeConfidenceLevel(threePass, RECS_WITH_FINDINGS, LH_DATA_WITH_METRICS);
    assert.equal(level, 'high');
  });

  test('2 audits complete + measured metrics → medium (not high — only 2 audits)', () => {
    const level = computeConfidenceLevel(AUDIT_STATUSES_TWO_FAIL, RECS_WITH_FINDINGS, LH_DATA_WITH_METRICS);
    assert.equal(level, 'medium');
  });

  test('2 audits complete + no metrics + no traceable recs → low', () => {
    const level = computeConfidenceLevel(AUDIT_STATUSES_TWO_FAIL, RECS_NO_FINDINGS, null);
    assert.equal(level, 'low');
  });

  test('1 audit complete → low regardless of evidence quality', () => {
    const level = computeConfidenceLevel(AUDIT_STATUSES_ONE_PASS, RECS_WITH_FINDINGS, LH_DATA_WITH_METRICS);
    assert.equal(level, 'low');
  });

  test('0 audits complete → low', () => {
    const level = computeConfidenceLevel(AUDIT_STATUSES_ALL_FAIL, [], LH_DATA_WITH_METRICS);
    assert.equal(level, 'low');
  });

  test('an unrelated audit failing does not reduce confidence of a well-supported recommendation category', () => {
    // security failed, but performance + seo + a11y completed with measured metrics
    // confidence should reflect the 3 completed audits, not be reduced by the unrelated failure
    const mixed = {
      performance:   { status: 'completed', score: 60 },
      seo:           { status: 'completed', score: 75 },
      security:      { status: 'failed',   score: null },
      accessibility: { status: 'completed', score: 70 },
    };
    const level = computeConfidenceLevel(mixed, RECS_WITH_FINDINGS, LH_DATA_WITH_METRICS);
    assert.equal(level, 'high'); // 3 complete + measured metrics + traceable recs
  });
});

// ── 3. validateAssessment ─────────────────────────────────────────────────────

describe('validateAssessment', () => {
  test('valid complete assessment → passes', () => {
    const allowed = new Set(['js-overhead', 'seo-meta']);
    const result = validateAssessment(VALID_ASSESSMENT, allowed);
    assert.equal(result.valid, true);
  });

  test('null input → fails', () => {
    const result = validateAssessment(null, new Set());
    assert.equal(result.valid, false);
  });

  test('missing headline → fails with reason', () => {
    const { headline: _, ...noHeadline } = VALID_ASSESSMENT;
    const result = validateAssessment(noHeadline, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('headline'), `Expected reason to mention 'headline', got: ${result.reason}`);
  });

  test('missing summary → fails with reason', () => {
    const { summary: _, ...noSummary } = VALID_ASSESSMENT;
    const result = validateAssessment(noSummary, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('summary'), `Expected reason to mention 'summary', got: ${result.reason}`);
  });

  test('invalid confidence level → fails with reason', () => {
    const bad = { ...VALID_ASSESSMENT, confidence: { level: 'very-high', explanation: 'x' } };
    const result = validateAssessment(bad, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('confidence.level'), `Expected reason to mention 'confidence.level', got: ${result.reason}`);
  });

  test('top_opportunity null → passes (healthy site)', () => {
    const healthy = { ...VALID_ASSESSMENT, top_opportunity: null, concerns: [], next_steps: [] };
    const result = validateAssessment(healthy, new Set());
    assert.equal(result.valid, true);
  });

  test('top_opportunity references unknown fingerprint → fails', () => {
    const allowed = new Set(['seo-meta']); // 'js-overhead' is NOT allowed
    const result = validateAssessment(VALID_ASSESSMENT, allowed);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('js-overhead'), `Expected reason to mention 'js-overhead', got: ${result.reason}`);
  });

  test('top_opportunity with empty fingerprints array → fails', () => {
    const bad = {
      ...VALID_ASSESSMENT,
      top_opportunity: { ...VALID_ASSESSMENT.top_opportunity, recommendation_fingerprints: [] },
    };
    const result = validateAssessment(bad, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('non-empty array'), `Expected reason about non-empty array, got: ${result.reason}`);
  });

  test('top_opportunity missing rationale → fails', () => {
    const bad = {
      ...VALID_ASSESSMENT,
      top_opportunity: { title: 'x', recommendation_fingerprints: ['js-overhead'] },
    };
    const result = validateAssessment(bad, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('rationale'), `Expected reason to mention 'rationale', got: ${result.reason}`);
  });

  test('strengths not an array → fails', () => {
    const bad = { ...VALID_ASSESSMENT, strengths: 'good' };
    const result = validateAssessment(bad, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('strengths'), `Expected reason to mention 'strengths', got: ${result.reason}`);
  });

  test('concerns not an array → fails', () => {
    const bad = { ...VALID_ASSESSMENT, concerns: null };
    const result = validateAssessment(bad, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('concerns'), `Expected reason to mention 'concerns', got: ${result.reason}`);
  });

  test('empty next_steps array → passes (no actions needed for healthy site)', () => {
    const healthy = { ...VALID_ASSESSMENT, top_opportunity: null, next_steps: [] };
    const allowed = new Set(['js-overhead']);
    const result = validateAssessment(healthy, allowed);
    assert.equal(result.valid, true);
  });

  test('next_steps not an array → fails', () => {
    const bad = { ...VALID_ASSESSMENT, next_steps: 'fix it' };
    const result = validateAssessment(bad, new Set(['js-overhead']));
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('next_steps'), `Expected reason to mention 'next_steps', got: ${result.reason}`);
  });
});

// ── 4. runAssessment — AI call mocking ────────────────────────────────────────
// We replace global.fetch before each test and restore it after.

describe('runAssessment (mocked fetch)', () => {
  let savedFetch;
  let savedApiKey;

  beforeEach(() => {
    savedFetch  = global.fetch;
    savedApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = savedFetch;
    if (savedApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
  });

  function mockFetchWithAssessment(assessment) {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify(assessment) }],
      }),
    });
  }

  test('returns validated assessment on success', async () => {
    const { coverage: _, ...withoutCoverage } = VALID_ASSESSMENT;
    mockFetchWithAssessment(withoutCoverage);

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: RECS_WITH_FINDINGS,
      scores: { performance: 62, seo: 92, security: 78, accessibility: 88 },
      auditStatuses: AUDIT_STATUSES_ALL_PASS,
      issues: [],
      lhData: LH_DATA_WITH_METRICS,
    });

    assert.ok(result !== null, 'Expected non-null assessment');
    assert.equal(result.headline, VALID_ASSESSMENT.headline);
    assert.ok(result.summary, 'Expected non-empty summary');
    // confidence.level must match pre-computed level (all 4 pass + metrics = 'high')
    assert.equal(result.confidence.level, 'high');
    // coverage must be attached deterministically (not from AI)
    assert.equal(result.coverage.audits_ran.length, 4);
    assert.equal(result.coverage.audits_failed.length, 0);
    assert.equal(result.coverage.limitations, null);
  });

  test('enforces pre-computed confidence even if AI tries to change it', async () => {
    const tampered = { ...VALID_ASSESSMENT, confidence: { level: 'low', explanation: 'AI tried to override' } };
    const { coverage: _, ...withoutCoverage } = tampered;
    mockFetchWithAssessment(withoutCoverage);

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: RECS_WITH_FINDINGS,
      scores: { performance: 62 },
      auditStatuses: AUDIT_STATUSES_ALL_PASS,
      issues: [],
      lhData: LH_DATA_WITH_METRICS,
    });

    // Should be overridden to 'high' (4 complete + metrics)
    assert.equal(result?.confidence?.level, 'high');
  });

  test('returns null when AI response fails validation (bad fingerprint)', async () => {
    const badRef = {
      ...VALID_ASSESSMENT,
      top_opportunity: {
        title: 'Fix something',
        rationale: 'Because reasons',
        recommendation_fingerprints: ['nonexistent-fingerprint'],
      },
    };
    const { coverage: _, ...withoutCoverage } = badRef;
    mockFetchWithAssessment(withoutCoverage);

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: RECS_WITH_FINDINGS, // only 'js-overhead' and 'seo-meta' exist
      scores: {},
      auditStatuses: AUDIT_STATUSES_ALL_PASS,
      issues: [],
    });

    assert.equal(result, null);
  });

  test('returns null when AI returns malformed JSON', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: 'This is not JSON at all {broken' }],
      }),
    });

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: [],
      scores: {},
      auditStatuses: {},
      issues: [],
    });

    assert.equal(result, null);
  });

  test('returns null when API returns non-ok status', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 529,
      text: async () => 'Overloaded',
    });

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: [],
      scores: {},
      auditStatuses: {},
      issues: [],
    });

    assert.equal(result, null);
  });

  test('returns null when no ANTHROPIC_API_KEY is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: RECS_WITH_FINDINGS,
      scores: {},
      auditStatuses: AUDIT_STATUSES_ALL_PASS,
      issues: [],
    });

    assert.equal(result, null);
    assert.equal(fetchCalled, false, 'fetch should not have been called without API key');
  });

  test('top_opportunity null is accepted for a healthy site', async () => {
    const healthyAssessment = {
      headline: 'This site is well-optimized across all measured areas',
      summary: 'All four audits completed with strong scores. Performance metrics are within acceptable ranges.',
      strengths: [
        { area: 'SEO', finding: 'Strong metadata and structured data.', evidence: 'seo score: 92' },
      ],
      concerns: [],
      top_opportunity: null,
      next_steps: [],
      confidence: { level: 'high', explanation: 'All 4 audits completed with measured values.' },
    };
    mockFetchWithAssessment(healthyAssessment);

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: [],
      scores: { performance: 88, seo: 92, security: 85, accessibility: 91 },
      auditStatuses: AUDIT_STATUSES_ALL_PASS,
      issues: [],
      lhData: LH_DATA_WITH_METRICS,
    });

    assert.ok(result !== null, 'Expected non-null result for healthy site');
    assert.equal(result.top_opportunity, null);
    assert.deepEqual(result.next_steps, []);
    assert.deepEqual(result.concerns, []);
    assert.equal(result.confidence.level, 'high');
  });

  test('coverage block is always deterministic regardless of AI output', async () => {
    // AI produces an assessment without coverage; runAssessment must attach deterministic coverage
    const { coverage: _, ...withoutCoverage } = VALID_ASSESSMENT;
    mockFetchWithAssessment(withoutCoverage);

    const result = await runAssessment({
      url: 'https://example.com',
      recommendations: RECS_WITH_FINDINGS,
      scores: {},
      auditStatuses: AUDIT_STATUSES_TWO_FAIL, // performance + seo ran; security + a11y failed
      issues: [],
    });

    assert.ok(result !== null, 'Expected non-null assessment');
    assert.ok(result.coverage.audits_ran.includes('performance'));
    assert.ok(result.coverage.audits_ran.includes('seo'));
    assert.ok(result.coverage.audits_failed.includes('security'));
    assert.ok(result.coverage.audits_failed.includes('accessibility'));
    assert.ok(result.coverage.limitations, 'Expected non-null limitations for two failed audits');
  });
});
