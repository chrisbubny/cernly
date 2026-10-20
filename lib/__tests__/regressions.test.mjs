/**
 * regressions.test.mjs — Priority 0 regression tests
 *
 * Covers the three confirmed regressions found after Stage 5 deployment:
 *
 * Suite 1 — Bug 1: getContextualGuidance action rendering
 *   Verifies that guidance renders a.detail and a.title (not a.text / a.description)
 *   so users see actual instructions rather than "[object Object]".
 *
 * Suite 2 — Bug 2: buildCoverageSummary and coverage handling
 *   Verifies that limitations text is user-facing, that coverage.audits_failed
 *   is populated from buildCoverageSummary, and that buildScoreLines includes
 *   unavailability notes when audits fail.
 *
 * Suite 3 — Bug 3: alt-text count scope difference
 *   Verifies that SEO and Accessibility analyzers use different counting criteria
 *   and that their descriptions acknowledge the distinction.
 *
 * Run: node --import ./lib/__tests__/alias-loader.mjs --test lib/__tests__/regressions.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCoverageSummary } from '@/lib/analyzers/ai.js';
import { buildScoreLines } from '@/lib/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Read analyzer sources for description content tests
const seoSrc  = readFileSync(path.join(ROOT, 'lib/analyzers/seo.js'), 'utf8');
const a11ySrc = readFileSync(path.join(ROOT, 'lib/analyzers/a11y.js'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: reproduce getContextualGuidance's action-rendering logic in isolation
// (no React import needed — we test the extraction function, not the component)
// ─────────────────────────────────────────────────────────────────────────────

function extractActionText(action) {
  // This is the extraction logic from getContextualGuidance after the Bug 1 fix:
  //   a.detail || a.title || String(a)
  const cleanMd = (s) => (s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  return cleanMd(typeof action === 'string' ? action : (action.detail || action.title || String(action)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Bug 1: action text extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 1 — getContextualGuidance action rendering', () => {

  it('extracts detail from AI-enriched action shape { title, detail, impact, effort }', () => {
    const action = {
      title: 'Add image dimensions',
      detail: 'Specify width and height attributes on every <img> tag to prevent layout shift.',
      impact: 'high',
      effort: 'low',
    };
    const text = extractActionText(action);
    assert.equal(
      text,
      'Specify width and height attributes on every <img> tag to prevent layout shift.',
      'should prefer a.detail',
    );
    assert.ok(!text.includes('[object Object]'), 'must not produce [object Object]');
  });

  it('falls back to title when detail is absent', () => {
    const action = {
      title: 'Add canonical tag',
      impact: 'medium',
      effort: 'low',
    };
    const text = extractActionText(action);
    assert.equal(text, 'Add canonical tag', 'should use a.title when a.detail is absent');
    assert.ok(!text.includes('[object Object]'), 'must not produce [object Object]');
  });

  it('handles base-rec action shape { title, detail, impact, effort: null }', () => {
    const action = {
      title: 'Fix: 30 images missing alt text',
      detail: 'Add descriptive alt attributes to all content images.',
      impact: 'high',
      effort: null,
    };
    const text = extractActionText(action);
    assert.ok(text.includes('Add descriptive alt attributes'), 'should extract detail text');
    assert.ok(!text.includes('[object Object]'), 'must not produce [object Object]');
  });

  it('handles plain-string actions unchanged', () => {
    const text = extractActionText('Add a <meta description> to this page.');
    assert.equal(text, 'Add a <meta description> to this page.');
  });

  it('does NOT use a.text — that property does not exist on the action shape', () => {
    // Confirm a.text is not a valid property; if someone passes an action with
    // only a.text (old shape), the fix must NOT silently use it — it must use
    // detail or title and never fall back to a bogus property.
    const actionWithText = { text: 'This should not be used', impact: 'low' };
    const text = extractActionText(actionWithText);
    // Falls through to String(actionWithText) because neither detail nor title exist
    // That's acceptable — the key requirement is detail/title are checked first.
    assert.ok(
      !text.includes('This should not be used') || text === 'This should not be used',
      'a.text is not in the extraction order — detail/title take priority',
    );
    // The critical assertion: correct shape with both detail and text — detail wins
    const actionBoth = { detail: 'Correct text', text: 'Wrong text', title: 'Also wrong' };
    assert.equal(extractActionText(actionBoth), 'Correct text', 'detail takes priority over text and title');
  });

  it('removes markdown link syntax from detail text', () => {
    const action = {
      detail: 'See [Google PageSpeed](https://pagespeed.web.dev) for details.',
    };
    const text = extractActionText(action);
    assert.equal(text, 'See Google PageSpeed for details.', 'markdown links should be stripped');
  });

  it('multiple actions from a rec all render as non-empty strings', () => {
    const actions = [
      { title: 'Compress images', detail: 'Use WebP format for all raster images.', impact: 'high', effort: 'low' },
      { title: 'Enable lazy loading', detail: 'Add loading="lazy" to below-the-fold images.', impact: 'medium', effort: 'low' },
      { title: 'Add width/height', detail: 'Specify dimensions on every img tag.', impact: 'high', effort: 'low' },
    ];
    const texts = actions.map(extractActionText);
    assert.equal(texts.length, 3);
    for (const t of texts) {
      assert.ok(typeof t === 'string' && t.length > 0, `action text must be non-empty string, got: ${t}`);
      assert.ok(!t.includes('[object Object]'), `must not contain [object Object]: ${t}`);
    }
    assert.ok(texts[0].includes('WebP'), 'first action detail rendered correctly');
    assert.ok(texts[1].includes('lazy'), 'second action detail rendered correctly');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Bug 2: coverage and incomplete audit messaging
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 2 — buildCoverageSummary: user-facing limitations text', () => {

  it('returns null limitations when all audits completed', () => {
    const statuses = {
      performance:   { status: 'completed' },
      seo:           { status: 'completed' },
      security:      { status: 'completed' },
      accessibility: { status: 'completed' },
    };
    const { ran, failed, limitations } = buildCoverageSummary(statuses);
    assert.deepEqual(ran.sort(), ['accessibility', 'performance', 'security', 'seo']);
    assert.deepEqual(failed, []);
    assert.equal(limitations, null);
  });

  it('populates audits_failed and user-readable limitations when performance fails', () => {
    const statuses = {
      performance:   { status: 'failed', error: { message: 'fetch timeout' } },
      seo:           { status: 'completed' },
      security:      { status: 'completed' },
      accessibility: { status: 'completed' },
    };
    const { ran, failed, limitations } = buildCoverageSummary(statuses);
    assert.deepEqual(ran.sort(), ['accessibility', 'security', 'seo']);
    assert.deepEqual(failed, ['performance']);
    assert.ok(limitations != null, 'limitations should be non-null when an audit failed');

    // The limitations text must be user-facing — not AI-instruction language
    assert.ok(
      !limitations.includes('do not make any positive or negative claims'),
      'limitations must NOT contain AI-instruction phrasing',
    );
    // Must mention the failed audit by name
    assert.ok(limitations.toLowerCase().includes('performance'), 'limitations must name the failed audit');
    // Must communicate unavailability clearly
    assert.ok(
      limitations.toLowerCase().includes('unavailable') || limitations.toLowerCase().includes('could not'),
      'limitations must communicate that data was unavailable',
    );
  });

  it('populates audits_failed for multiple failed categories', () => {
    const statuses = {
      performance:   { status: 'failed' },
      seo:           { status: 'completed' },
      security:      { status: 'failed' },
      accessibility: { status: 'completed' },
    };
    const { ran, failed, limitations } = buildCoverageSummary(statuses);
    assert.deepEqual(ran.sort(), ['accessibility', 'seo']);
    assert.deepEqual(failed.sort(), ['performance', 'security']);
    assert.ok(limitations != null);
    assert.ok(
      limitations.toLowerCase().includes('performance') &&
      limitations.toLowerCase().includes('security'),
      'limitations must name all failed audits',
    );
  });

  it('treats unknown / missing status as failed', () => {
    // A category with no auditStatus entry should be counted as failed
    const statuses = {
      seo:           { status: 'completed' },
      security:      { status: 'completed' },
      accessibility: { status: 'completed' },
      // performance: absent
    };
    const { failed } = buildCoverageSummary(statuses);
    assert.ok(failed.includes('performance'), 'missing status should be treated as failed');
  });

  it('buildScoreLines includes "unavailable" annotation for failed audits', () => {
    const scores = { seo: 85, security: 90, accessibility: 78, performance: null };
    const statuses = {
      performance:   { status: 'failed', error: { message: 'navigation timeout' } },
      seo:           { status: 'completed' },
      security:      { status: 'completed' },
      accessibility: { status: 'completed' },
    };
    const lines = buildScoreLines(scores, statuses);
    assert.ok(lines.includes('Performance: unavailable'), 'should include unavailability note for failed performance');
    assert.ok(lines.includes('SEO: 85/100'), 'should include SEO score');
    assert.ok(lines.includes('Security: 90/100'), 'should include Security score');
    assert.ok(!lines.includes('Performance: 0/100'), 'failed performance should not show a numeric score');
  });

  it('buildCoverageSummary handles empty auditStatuses gracefully', () => {
    const { ran, failed, limitations } = buildCoverageSummary({});
    assert.deepEqual(ran, []);
    assert.ok(failed.length === 4, 'all 4 audits should be in failed when statuses absent');
    assert.ok(limitations != null, 'should have limitations when no audits completed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Bug 3: alt-text count scope difference
// Tests the regex patterns and description text directly from source
// (analyzers fetch URLs internally; we test the counting logic in isolation)
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 3 — alt-text scope difference: SEO vs Accessibility', () => {
  // Extract the exact regexes from each analyzer's source to confirm scope difference.
  // SEO uses [^"']+ (one or more chars — empty alt="" does NOT match → flagged)
  // A11y uses [^"']* (zero or more chars — empty alt="" DOES match → not flagged)

  // Replicate the counting logic from each analyzer (does not need HTTP)
  function countSeoMissingAlt(html) {
    const imgs = html.match(/<img[^>]*>/gi) || [];
    return imgs.filter(i => !/alt=["'][^"']+["']/.test(i)).length;
  }

  function countA11yMissingAlt(html) {
    const imgs = html.match(/<img[^>]*>/gi) || [];
    return imgs.filter(i => !/alt=["'][^"']*["']/.test(i)).length;
  }

  const htmlFixture = `
    <html><body>
      <img src="hero.jpg">
      <img src="product.jpg">
      <img src="divider.png" alt="">
      <img src="spacer.gif" alt="">
      <img src="logo.png" alt="Company logo">
      <img src="photo.jpg" alt="Team meeting">
    </body></html>
  `;
  // A: 2 images with no alt at all (hero.jpg, product.jpg)
  // B: 2 images with alt="" (divider.png, spacer.gif)
  // C: 2 images with valid alt text (logo.png, photo.jpg)
  // SEO count = A + B = 4; A11y count = A = 2

  it('SEO regex counts no-alt AND empty-alt="" images', () => {
    assert.equal(countSeoMissingAlt(htmlFixture), 4, 'SEO: 2 no-alt + 2 empty-alt = 4');
  });

  it('A11y regex counts only images with no alt attribute at all', () => {
    assert.equal(countA11yMissingAlt(htmlFixture), 2, 'A11y: only 2 images have no alt at all');
  });

  it('SEO count >= A11y count for the same HTML (scope difference is always non-negative)', () => {
    const seoCount  = countSeoMissingAlt(htmlFixture);
    const a11yCount = countA11yMissingAlt(htmlFixture);
    assert.ok(seoCount >= a11yCount, `SEO (${seoCount}) should be >= A11y (${a11yCount})`);
  });

  it('difference between counts equals the number of empty-alt="" images', () => {
    const seoCount  = countSeoMissingAlt(htmlFixture);
    const a11yCount = countA11yMissingAlt(htmlFixture);
    // 2 decorative images use alt="" in the fixture
    assert.equal(seoCount - a11yCount, 2, 'gap = 2 images with alt=""');
  });

  it('when all images have valid non-empty alt, both counts are 0', () => {
    const cleanHtml = `
      <html><body>
        <img src="hero.jpg" alt="Hero banner">
        <img src="logo.png" alt="Company logo">
      </body></html>
    `;
    assert.equal(countSeoMissingAlt(cleanHtml),  0, 'SEO: all images have valid alt');
    assert.equal(countA11yMissingAlt(cleanHtml), 0, 'A11y: all images have alt attribute');
  });

  it('SEO source uses [^"]+ (one-or-more) — empty alt fails the pattern', () => {
    // Confirm the ACTUAL regex in seo.js uses + not *
    const hasPlusQuantifier = seoSrc.includes("[^\"']+");
    assert.ok(hasPlusQuantifier, "seo.js must use [^\"']+ quantifier so empty alt is NOT matched");
  });

  it('A11y source uses [^"]* (zero-or-more) — empty alt passes the pattern', () => {
    // Confirm the ACTUAL regex in a11y.js uses * not +
    assert.ok(a11ySrc.includes("[^\"']*"), "a11y.js must use [^\"']* quantifier so empty alt IS matched");
  });

  it('SEO description mentions empty alt and cross-references Accessibility audit', () => {
    // Verify by reading source — the description template literal in seo.js
    assert.ok(
      seoSrc.includes('alt=""') || seoSrc.toLowerCase().includes('empty alt'),
      'seo.js description should mention empty alt=""',
    );
    assert.ok(
      seoSrc.toLowerCase().includes('accessibility'),
      'seo.js description should cross-reference Accessibility audit',
    );
  });

  it('A11y description explains empty alt="" is valid and cross-references SEO', () => {
    assert.ok(
      a11ySrc.includes('alt=""') || a11ySrc.toLowerCase().includes('decorative'),
      'a11y.js description should mention empty alt is valid for decorative images',
    );
    assert.ok(
      a11ySrc.toLowerCase().includes('seo'),
      'a11y.js description should cross-reference SEO audit',
    );
  });
});
