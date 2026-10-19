/**
 * Stage 1 acceptance tests — Evidence-Rich Recommendations
 *
 * Verifies the following without requiring a live database or AI API:
 *
 *  1. supporting_findings: full issue objects are stored (not just IDs)
 *  2. finding_fingerprints: ID-only array still populated (backward compat)
 *  3. Field contracts: what_we_found / explanation / why_it_matters are
 *     distinct and serve separate purposes
 *  4. AI prompt construction: actual finding messages and displayValues
 *     are present in the prompt string — not just fingerprint IDs
 *  5. mapRecommendation: exposes both what_we_found and explanation aliases
 *  6. Before-and-after comparison using representative fixture data
 *     (omniinteractions.com-style evidence)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// ── Fixture: representative issues (omniinteractions.com-style) ──────────────
// Mirrors what assignIssueFingerprintIds produces for a real scan.

const FIXTURE_ISSUES = [
  {
    fingerprintId: 'lh:unused-javascript',
    message: 'Remove unused JavaScript',
    description: 'Remove dead code and defer loading of JavaScript that is not needed for the initial page load.',
    displayValue: '1.35 s potential savings',
    severity: 'warning',
    area: 'Performance',
    source: 'lighthouse',
    fix: 'Use code splitting or tree-shaking to eliminate unused JS bundles.',
  },
  {
    fingerprintId: 'lh:total-blocking-time',
    message: 'Reduce Total Blocking Time',
    description: 'The sum of all time periods between FCP and Time to Interactive, where task length exceeded 50ms.',
    displayValue: '450 ms',
    severity: 'critical',
    area: 'Performance',
    source: 'lighthouse',
    fix: 'Break up long tasks and defer non-critical JavaScript.',
  },
  {
    fingerprintId: 'lh:bootup-time',
    message: 'Reduce JavaScript execution time',
    description: 'Consider reducing the time spent parsing, compiling, and executing JS.',
    displayValue: '3.2 s',
    severity: 'warning',
    area: 'Performance',
    source: 'lighthouse',
    fix: 'Defer non-critical scripts and minimize main-thread work.',
  },
  {
    fingerprintId: 'seo:meta_desc_missing',
    message: 'Meta description is missing',
    description: 'Add a unique meta description for this page to improve search snippet quality.',
    displayValue: null,
    severity: 'critical',
    area: 'SEO',
    source: 'seo',
    fix: 'Add a <meta name="description"> tag between 120–155 characters.',
  },
  {
    fingerprintId: 'seo:h1_missing',
    message: 'H1 heading is missing',
    description: 'Every page should have exactly one H1 heading that describes its main topic.',
    displayValue: null,
    severity: 'warning',
    area: 'SEO',
    source: 'seo',
    fix: 'Add a single <h1> tag to the page with a descriptive phrase.',
  },
  {
    fingerprintId: 'a11y:images_missing_alt',
    message: '3 images are missing alt text',
    description: 'Screen readers skip images without alt text, making content inaccessible to visually impaired users.',
    displayValue: '3 images',
    severity: 'critical',
    area: 'Accessibility',
    source: 'a11y',
    fix: 'Add descriptive alt="" attributes to each <img> element.',
  },
  {
    fingerprintId: 'ssl:missing_header_content_security_policy',
    message: 'Content-Security-Policy header is missing',
    description: 'CSP mitigates XSS and data-injection attacks by restricting resource origins.',
    displayValue: null,
    severity: 'warning',
    area: 'Security',
    source: 'ssl',
    fix: 'Configure a Content-Security-Policy header in your web server.',
  },
];

const FIXTURE_ANALYZER_DATA = {
  lhData: { metrics: { lcp: 4800, tbt: 450, cls: 0.12, fcp: 2100, ttfb: 380 } },
  seoData: { checks: { title: 'Home Page', metaDesc: null, h1Count: 0, canonical: null } },
  sslData: { checks: { isHttps: true, content_security_policy: false, x_frame_options: false } },
  a11yData: { checks: { imgsNoAlt: 3, hasLang: true } },
};

// ── Import helpers ───────────────────────────────────────────────────────────

// We test the module source structure (prompt construction) without executing
// the full async AI call; the structural assertions mirror Stage 0's approach.

async function readSrc(relPath) {
  return fs.readFile(new URL(relPath, import.meta.url), 'utf8');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Stage 1 — supporting_findings: full issue objects', () => {

  test('buildBaseRecommendations stores full issue objects, not just IDs', async () => {
    // Dynamically import to verify the module exports the function correctly.
    // If the import fails the test will throw a clear error.
    const { buildBaseRecommendations } = await import('../recommendations.js');

    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    // At least one recommendation should have been produced
    assert.ok(recs.length > 0, 'should produce at least one recommendation');

    // Every recommendation must have supporting_findings (array)
    for (const rec of recs) {
      assert.ok(
        Array.isArray(rec.supporting_findings),
        `rec "${rec.title}" should have supporting_findings array`,
      );
    }

    // The js-overhead group should contain the TBT/unused-js/bootup-time issues
    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.ok(jsRec, 'js-overhead group should be produced');
    assert.ok(jsRec.supporting_findings.length >= 1, 'js-overhead should have at least one finding');

    // Each supporting finding must include the full fields (not just ID)
    for (const f of jsRec.supporting_findings) {
      assert.ok(f.fingerprintId,              'finding should have fingerprintId');
      assert.ok(f.message,                     'finding should have message');
      assert.ok(typeof f.severity === 'string','finding should have severity');
      assert.ok(f.source,                      'finding should have source');
    }
  });

  test('supporting_findings includes displayValue when present', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.ok(jsRec, 'js-overhead group should be produced');

    const tbtFinding = jsRec.supporting_findings.find(f => f.fingerprintId === 'lh:total-blocking-time');
    assert.ok(tbtFinding, 'TBT finding should be in js-overhead supporting_findings');
    assert.equal(tbtFinding.displayValue, '450 ms', 'displayValue should be preserved');
    assert.equal(tbtFinding.message, 'Reduce Total Blocking Time');
  });

  test('supporting_findings includes description when present', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    const a11yRec = recs.find(r => r.fingerprint === 'accessibility-barriers');
    assert.ok(a11yRec, 'accessibility-barriers group should be produced');

    const altFinding = a11yRec.supporting_findings.find(f => f.fingerprintId === 'a11y:images_missing_alt');
    assert.ok(altFinding, 'alt-text finding should be in accessibility-barriers');
    assert.ok(altFinding.description, 'description should be preserved');
    assert.ok(altFinding.description.length > 10, 'description should be non-trivial');
  });
});


describe('Stage 1 — finding_fingerprints: backward compat', () => {

  test('finding_fingerprints (ID array) is still populated alongside supporting_findings', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    for (const rec of recs) {
      assert.ok(
        Array.isArray(rec.finding_fingerprints),
        `rec "${rec.title}" should still have finding_fingerprints array`,
      );
      // Each entry should be a string ID
      for (const fid of rec.finding_fingerprints) {
        assert.equal(typeof fid, 'string', `finding_fingerprint entry should be a string, got ${fid}`);
      }
    }
  });

  test('finding_fingerprints contains only IDs, not objects', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.ok(jsRec);

    for (const fid of jsRec.finding_fingerprints) {
      assert.notEqual(typeof fid, 'object', 'finding_fingerprints must contain strings, not objects');
      assert.ok(fid.includes(':'), `fingerprint ID "${fid}" should be in "source:key" format`);
    }
  });
});


describe('Stage 1 — field contracts: what_we_found / why_it_matters', () => {

  test('base recommendations have what_we_found null before AI enrichment', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    for (const rec of recs) {
      // what_we_found starts null; AI enrichment fills it
      assert.equal(
        rec.what_we_found,
        null,
        `rec "${rec.title}" what_we_found should be null before enrichment`,
      );
    }
  });

  test('base recommendations have why_it_matters null before AI enrichment', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    for (const rec of recs) {
      assert.equal(
        rec.why_it_matters,
        null,
        `rec "${rec.title}" why_it_matters should be null before AI enrichment`,
      );
    }
  });

  test('mapRecommendation exposes both what_we_found and explanation (DB alias)', async () => {
    const src = await readSrc('../store.js');

    // what_we_found must be mapped from r.explanation
    assert.ok(
      src.includes("what_we_found:        r.explanation  || null"),
      'mapRecommendation should expose what_we_found as alias for r.explanation',
    );

    // explanation (backward compat) must also be present
    assert.ok(
      src.includes("explanation:          r.explanation  || null"),
      'mapRecommendation should also expose explanation for backward compat',
    );
  });

  test('saveRecommendations stores what_we_found in the explanation column', async () => {
    const src = await readSrc('../store.js');
    assert.ok(
      src.includes("rec.what_we_found  || rec.explanation || null"),
      'saveRecommendations should write what_we_found to the explanation column',
    );
  });

  test('supporting_findings column is added by ALTER TABLE IF NOT EXISTS', async () => {
    const src = await readSrc('../store.js');
    assert.ok(
      src.includes('ADD COLUMN IF NOT EXISTS supporting_findings JSONB'),
      'ensureRecommendationsTable should add supporting_findings column idempotently',
    );
  });
});


describe('Stage 1 — AI prompt: actual finding messages and displayValues', () => {

  test('enrichRecommendationsWithAI prompt construction uses supporting_findings messages (not just IDs)', async () => {
    const src = await readSrc('../recommendations.js');

    // The prompt must use supporting_findings, not finding_fingerprints, for finding text
    assert.ok(
      src.includes('rec.supporting_findings'),
      'enrichRecommendationsWithAI should reference rec.supporting_findings',
    );

    // Should NOT build a simple join of IDs as the finding text
    assert.ok(
      !src.includes("rec.finding_fingerprints.slice(0, 6).join(', ')"),
      'enrichRecommendationsWithAI should NOT join finding_fingerprints as the finding list sent to AI',
    );
  });

  test('AI prompt includes displayValue formatting (measured evidence)', async () => {
    const src = await readSrc('../recommendations.js');

    // The prompt construction should include displayValue
    assert.ok(
      src.includes('f.displayValue'),
      'AI prompt construction should reference f.displayValue from supporting_findings',
    );
  });

  test('AI prompt includes finding message', async () => {
    const src = await readSrc('../recommendations.js');

    assert.ok(
      src.includes('f.message'),
      'AI prompt construction should reference f.message from supporting_findings',
    );
  });

  test('AI response schema requests what_we_found field', async () => {
    const src = await readSrc('../recommendations.js');

    assert.ok(
      src.includes('"what_we_found"'),
      'AI prompt should ask for what_we_found in the JSON schema',
    );
  });

  test('enrichRecommendationsWithAI maps what_we_found to the returned rec', async () => {
    const src = await readSrc('../recommendations.js');

    assert.ok(
      src.includes('what_we_found:'),
      'enrichRecommendationsWithAI return should include what_we_found field',
    );
    // Should reference e.what_we_found from the AI response
    assert.ok(
      src.includes('e.what_we_found'),
      'should map AI response e.what_we_found to the rec',
    );
  });

  test('AI prompt instructs against inventing numbers not in evidence', async () => {
    const src = await readSrc('../recommendations.js');

    assert.ok(
      src.includes('do NOT invent') || src.includes('Do NOT invent'),
      'AI prompt should explicitly prohibit inventing numbers',
    );
  });
});


describe('Stage 1 — before-and-after: evidence specificity comparison', () => {

  // This test verifies the structural improvement: before Stage 1, the prompt
  // received only IDs; after Stage 1, it receives human-readable messages
  // with measured values.

  test('before Stage 1: finding_fingerprints only contain opaque IDs', () => {
    // Simulate the old prompt construction (what we're replacing)
    const mockRec = {
      finding_fingerprints: ['lh:unused-javascript', 'lh:total-blocking-time', 'lh:bootup-time'],
      evidence: { tbt: 450, lcp: 4800 },
    };

    // Old approach: join IDs
    const oldFindingList = mockRec.finding_fingerprints.slice(0, 6).join(', ');

    // This is opaque — no human-readable context, no displayValues
    assert.ok(
      !oldFindingList.includes('Reduce Total Blocking Time'),
      'old approach: finding list does not contain human-readable messages',
    );
    assert.ok(
      !oldFindingList.includes('450 ms'),
      'old approach: finding list does not contain measured displayValues',
    );
    assert.equal(oldFindingList, 'lh:unused-javascript, lh:total-blocking-time, lh:bootup-time');
  });

  test('after Stage 1: supporting_findings contain human-readable messages and displayValues', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.ok(jsRec);

    // New approach: format supporting_findings
    const newFindingLines = (jsRec.supporting_findings || []).slice(0, 6).map(f => {
      const sev = f.severity ? `[${f.severity.toUpperCase()}]` : '';
      const dv  = f.displayValue ? ` — ${f.displayValue}` : '';
      return `${sev} ${f.message}${dv}`;
    }).join('\n');

    // Must contain human-readable messages
    assert.ok(
      newFindingLines.includes('Reduce Total Blocking Time'),
      'new approach: finding lines should contain human-readable message',
    );

    // Must contain measured displayValues
    assert.ok(
      newFindingLines.includes('450 ms'),
      'new approach: finding lines should contain measured displayValue',
    );

    // Must contain severity labels
    assert.ok(
      newFindingLines.includes('[CRITICAL]') || newFindingLines.includes('[WARNING]'),
      'new approach: finding lines should include severity labels',
    );
  });

  test('definition of done: rec can answer all 5 questions after enrichment', async () => {
    const { buildBaseRecommendations } = await import('../recommendations.js');
    const recs = buildBaseRecommendations(FIXTURE_ISSUES, FIXTURE_ANALYZER_DATA);

    const jsRec = recs.find(r => r.fingerprint === 'js-overhead');
    assert.ok(jsRec, 'js-overhead recommendation was produced');

    // Q1: What exactly did Cernly detect?
    //   → supporting_findings contains specific findings with messages
    const q1 = jsRec.supporting_findings.some(f => f.message && f.message.length > 5);
    assert.ok(q1, 'Q1: specific detected findings are present in supporting_findings');

    // Q2: What evidence supports that conclusion?
    //   → evidence contains measured metric values
    assert.ok(jsRec.evidence, 'Q2: evidence object is present');
    const q2 = Object.values(jsRec.evidence).some(v => v != null);
    assert.ok(q2, 'Q2: evidence contains at least one measured value');

    // Q3: Why should the owner care?
    //   → why_it_matters will be filled by AI; finding_fingerprints are non-empty
    assert.ok(jsRec.finding_fingerprints.length > 0, 'Q3: finding_fingerprints (for AI context) are non-empty');

    // Q4: What specific action should they take?
    //   → actions array exists (may be null before AI enrichment for some recs)
    //   → supporting_findings have fix fields
    const q4 = jsRec.supporting_findings.some(f => f.fix);
    assert.ok(q4, 'Q4: at least one finding has a fix suggestion');

    // Q5: How will they know whether the action worked?
    //   → verification_approach will be filled by AI; the field is present
    assert.equal(
      jsRec.verification_approach,
      null,
      'Q5: verification_approach starts null (AI enrichment fills it)',
    );
    // Confirm the field key exists on the object
    assert.ok(
      'verification_approach' in jsRec,
      'Q5: verification_approach field key exists on the rec object',
    );
  });
});


describe('Stage 1 — consumer components: correct field precedence', () => {

  test('DashboardClient uses why_it_matters as primary body, falling back to what_we_found', async () => {
    const src = await readSrc('../../app/dashboard/DashboardClient.js');
    assert.ok(
      src.includes('topRec.why_it_matters || topRec.what_we_found || topRec.explanation'),
      'DashboardClient should prefer why_it_matters, then what_we_found, then explanation',
    );
  });

  test('ReportClient recommendation card uses what_we_found with explanation fallback', async () => {
    const src = await readSrc('../../app/report/[slug]/ReportClient.js');
    assert.ok(
      src.includes('d.what_we_found || d.explanation'),
      'ReportClient recommendation card should use what_we_found with explanation fallback',
    );
  });

  test('ReportClient renders supporting_findings as detected issues', async () => {
    const src = await readSrc('../../app/report/[slug]/ReportClient.js');
    assert.ok(
      src.includes('d.supporting_findings'),
      'ReportClient should render d.supporting_findings',
    );
    assert.ok(
      src.includes('DETECTED ISSUES'),
      'ReportClient should show a "DETECTED ISSUES" heading for supporting_findings',
    );
  });
});
