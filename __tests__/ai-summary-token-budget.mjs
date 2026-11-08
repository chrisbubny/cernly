/**
 * ai-summary-token-budget.mjs
 *
 * Regression tests for AI Summary token-budget and truncation prevention.
 *
 * Background:
 *   runAiSummary() calls claude-haiku-5-5 with max_tokens. The output schema
 *   includes optional fields that, when the AI is verbose, can exceed the limit:
 *
 *     Field                           Verbose worst case
 *     summary (70-word limit)          ~115 tokens
 *     uxInsights (2 observations)      ~484 tokens (no prior word limits)
 *     discoveries × 2 (explanation)   ~700 tokens (no prior word limits)
 *     sectionSummaries × 5            ~370 tokens (no prior word limits)
 *     JSON structure                    ~40 tokens
 *     ──────────────────────────────────────────────────────────
 *     Verbose total                   ~1,710 tokens  > 1,600 limit
 *
 *   Fix: per-field word limits added to the prompt; max_tokens raised to 2,000.
 *   With limits enforced, worst-case output is ~700 tokens.
 *
 * Token estimation: 3.5 chars/token (conservative for JSON/English).
 *
 * Tests:
 *   1.  max_tokens is 2000 (raised from 1600)
 *   2.  Prompt includes word limits for sectionSummaries
 *   3.  Prompt includes word limits for discoveries explanation
 *   4.  Prompt includes word limits for uxInsights observations
 *   5.  Prompt includes word limits for discoveries action detail
 *   6.  Concise output (~700 tokens) fits within 2000 max_tokens
 *   7.  Verbose output (~1710 tokens) would have exceeded old 1600 limit
 *   8.  Verbose output (~1710 tokens) fits within new 2000 max_tokens
 *   9.  Truncation guard is still present (stop_reason === 'max_tokens')
 *  10.  Fallback reason 'truncated' is returned on max_tokens stop
 *
 * Run with: node __tests__/ai-summary-token-budget.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');
const src   = (rel) => readFile(resolve(root, rel), 'utf-8');

// ─── Load source ─────────────────────────────────────────────────────────────
let aiSrc;
try {
  aiSrc = await src('lib/analyzers/ai.js');
} catch (e) {
  console.error('Failed to read lib/analyzers/ai.js:', e.message);
  process.exit(1);
}

// ─── Token estimator ─────────────────────────────────────────────────────────
function estimateTokens(text) {
  // 3.5 chars/token is conservative for JSON/English; real BPE is ~4 for prose
  return Math.ceil(text.length / 3.5);
}

// ─── Maximal concise output (AI follows all word limits) ─────────────────────
// Worst case with per-field limits obeyed. This is the EXPECTED upper bound
// once the prompt tightening is in place.
const conciseMaxOutput = JSON.stringify({
  summary: "example.com scored 42/100 on performance with LCP of 4.8s and TBT of 680ms, indicating significant render-blocking and image issues. Accessibility scored 65/100 with 7 missing alt attributes. Priority action: defer non-critical JavaScript.",
  siteType: "other",
  uxInsights: {
    conversion_focus: null,
    top_recommendation: "Reduce TBT from 680ms to under 200ms by deferring non-critical JavaScript",
    observations: [
      { area: "Performance", verdict: "critical", finding: "LCP of 4.8s far exceeds 2.5s threshold due to render-blocking", fix: "Defer third-party scripts and compress hero images to WebP" },
      { area: "Accessibility", verdict: "warning", finding: "7 images missing alt text, violating WCAG 2.1 Level A", fix: "Add descriptive alt attributes to content images" }
    ]
  },
  discoveries: [
    {
      title: "Render-blocking JS delays page load",
      explanation: "TBT of 680ms and LCP of 4.8s indicate synchronous scripts block rendering. Deferring them would likely reduce both metrics significantly.",
      confidence: "high",
      category: "performance",
      actions: [{ title: "Defer non-critical scripts", detail: "Add defer or async to third-party scripts in page head", impact: "high", effort: "medium" }]
    },
    {
      title: "Missing Content Security Policy",
      explanation: "No CSP header detected. This leaves the site without browser-enforced protection against script injection attacks.",
      confidence: "medium",
      category: "security",
      actions: [{ title: "Implement CSP header", detail: "Start with report-only mode to audit violations before enforcing", impact: "medium", effort: "high" }]
    }
  ],
  sectionSummaries: {
    performance: "42/100 — LCP 4.8s and TBT 680ms indicate render-blocking JavaScript.",
    seo: "78/100 — title, meta description, H1, canonical all present.",
    security: "HTTPS and HSTS enabled; CSP header absent.",
    accessibility: "65/100 — 7 images missing alt text; html[lang] set.",
    bestPractices: "83/100 — no critical violations detected."
  }
}, null, 0);

// ─── Verbose output (AI ignores all word limits) ─────────────────────────────
// This is the PATHOLOGICAL case that caused the original truncation.
// Every field is written at the verbosity level of an AI that ignores the
// "concise sentences" instruction. Measured at ~1,710 tokens (5,985 chars).
// This fixture demonstrates why per-field word limits are necessary.
const verboseMaxOutput = JSON.stringify({
  summary: "example.com is performing poorly across multiple dimensions with a Lighthouse performance score of 42/100. The Largest Contentful Paint metric of 4.8 seconds significantly exceeds Google's recommended 2.5 second threshold, while the Total Blocking Time of 680ms further degrades the user experience by keeping the main thread occupied during page load, preventing user interaction and likely contributing to higher bounce rates across all device types.",
  siteType: "other",
  uxInsights: {
    conversion_focus: null,
    top_recommendation: "Reduce Total Blocking Time from 680ms to under 200ms by auditing and deferring non-critical third-party JavaScript, as this is the single most impactful change for both user experience and Core Web Vitals compliance",
    observations: [
      {
        area: "Performance",
        verdict: "critical",
        finding: "The measured LCP of 4.8 seconds is nearly double Google's 'Poor' threshold of 2.5 seconds for desktop. Combined with a TBT of 680ms indicating significant main-thread blocking, users on slower connections will experience substantial delays before the page becomes interactive, which research consistently correlates with increased abandonment rates for transactional pages.",
        fix: "Prioritize eliminating render-blocking scripts by auditing all synchronously-loaded JavaScript in the page head, moving non-critical scripts to the footer with async or defer attributes, and compressing hero images to WebP format with explicit width and height attributes to prevent layout shift during load."
      },
      {
        area: "Accessibility",
        verdict: "warning",
        finding: "Seven images on the page are missing alt text attributes according to the Lighthouse accessibility audit. This prevents screen reader users from understanding visual content, violates WCAG 2.1 Success Criterion 1.1.1 at Level A, and may expose the site operator to accessibility-related legal risk in jurisdictions with applicable legislation.",
        fix: "Add descriptive alt attributes to all img elements that convey meaning, using empty alt='' for purely decorative images so screen readers skip them. Prioritize images in the main content area and navigation before addressing decorative background images."
      }
    ]
  },
  discoveries: [
    {
      title: "Render-blocking JavaScript is the primary driver of poor performance metrics",
      explanation: "The Total Blocking Time of 680ms and Largest Contentful Paint of 4.8s are consistent with synchronously-loaded JavaScript executing during the critical rendering path. When scripts are loaded without async or defer attributes, the browser cannot proceed with rendering until each script has been downloaded, parsed, and executed, which delays both First Contentful Paint and the point at which the page becomes fully interactive. Third-party analytics, chat widgets, and marketing pixels are common contributors to this pattern.",
      confidence: "high",
      category: "performance",
      actions: [
        {
          title: "Audit and defer non-critical JavaScript in the page head",
          detail: "Open Chrome DevTools, navigate to the Network tab, filter by JS, and identify scripts loaded in the page head without async or defer attributes. For each script, determine whether it needs to run before first paint — typically only critical rendering logic does. Add defer to scripts that can run after HTML parsing, and async to independent scripts like analytics that do not depend on DOM readiness.",
          impact: "high",
          effort: "medium"
        }
      ]
    },
    {
      title: "Missing Content Security Policy leaves the site exposed to injection attacks",
      explanation: "The security audit confirmed that no Content-Security-Policy header is present in the HTTP response. CSP is a defense-in-depth browser mechanism that specifies which sources of scripts, styles, images, and other resources are trusted, instructing the browser to block anything from unauthorized sources. Without CSP, the site has no browser-enforced protection against Cross-Site Scripting attacks that inject malicious scripts through user-generated content, third-party services, or compromised CDN resources.",
      confidence: "medium",
      category: "security",
      actions: [
        {
          title: "Implement a Content Security Policy header starting with report-only mode",
          detail: "Begin by setting a Content-Security-Policy-Report-Only header with a report-uri or report-to directive pointing to a logging endpoint such as report-uri.com or a self-hosted collector. This allows you to observe what a strict policy would block without actually breaking the site. After reviewing reports for two weeks and iterating the policy to allow legitimate resources, switch to enforcement mode by changing the header to Content-Security-Policy.",
          impact: "medium",
          effort: "high"
        }
      ]
    }
  ],
  sectionSummaries: {
    performance: "Performance scored 42/100 with LCP of 4.8 seconds and TBT of 680ms, both significantly exceeding Google's recommended thresholds and indicating render-blocking JavaScript and unoptimized images as the primary contributing factors requiring immediate attention.",
    seo: "SEO scored 78/100 with a correctly formatted title tag of 20 characters, a meta description within the recommended 120-158 character range at 142 characters, one H1 tag, a canonical URL, and two structured data types detected, leaving room for improvement in schema coverage and internal linking.",
    security: "Security shows HTTPS and HSTS properly configured, but the absence of a Content-Security-Policy header represents a meaningful gap in the site's defense-in-depth posture against Cross-Site Scripting and data injection attacks.",
    accessibility: "Accessibility scored 65/100 with the html[lang] attribute correctly set to assist screen readers with language detection, but seven images are missing alt text attributes in violation of WCAG 2.1 Level A requirements.",
    bestPractices: "Best practices scored 83/100 with no critical violations detected in this audit category, though a full manual review of image formats, caching headers, and deprecated API usage would provide a more complete picture."
  }
}, null, 0);

// ─── Test runner ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

// ─── Section 1: max_tokens configuration ─────────────────────────────────────
console.log('\nSection 1: max_tokens configuration');

test('AI Summary max_tokens is 2000', () => {
  assert.ok(
    aiSrc.includes('max_tokens: 2000'),
    'max_tokens must be 2000 — raised from 1600 to handle verbose worst-case responses'
  );
});

test('Old 1600 limit is no longer active', () => {
  // The comment explaining the raise is acceptable; an active 1600 setting is not.
  // We allow '1600' to appear in comments but not as an active max_tokens value.
  const activeLimit = aiSrc.match(/max_tokens:\s*1600(?!\s*\/\/)(?!\s*,\s*\/\/)/);
  assert.ok(!activeLimit, 'max_tokens: 1600 must not be an active setting — it has been raised to 2000');
});

// ─── Section 2: Prompt word limits ───────────────────────────────────────────
console.log('\nSection 2: Per-field word limits in prompt');

test('Prompt includes word limit for sectionSummaries (under 20 words)', () => {
  assert.ok(
    aiSrc.includes('under 20 words'),
    'Prompt must include "under 20 words" for sectionSummaries to prevent verbose overflow'
  );
});

test('Prompt includes word limit for discoveries explanation (under 40 words)', () => {
  assert.ok(
    aiSrc.includes('under 40 words'),
    'Prompt must include "under 40 words" for discoveries.explanation'
  );
});

test('Prompt includes word limit for uxInsights observations (under 25 words)', () => {
  assert.ok(
    aiSrc.includes('under 25 words'),
    'Prompt must include "under 25 words" for uxInsights observation finding/fix'
  );
});

test('Prompt includes word limit for discoveries action detail (under 25 words)', () => {
  // The discoveries action detail uses "under 25 words" shared with uxInsights observation
  assert.ok(
    aiSrc.includes('under 25 words'),
    'Prompt must include "under 25 words" for discoveries action detail'
  );
});

test('Prompt mentions token budget constraint', () => {
  assert.ok(
    aiSrc.includes('token budget') || aiSrc.includes('word limits'),
    'Prompt must reference the word limits as being critical for the token budget'
  );
});

// ─── Section 3: Token budget measurements ────────────────────────────────────
console.log('\nSection 3: Token budget measurements');

const conciseTokens = estimateTokens(conciseMaxOutput);
const verboseTokens = estimateTokens(verboseMaxOutput);

test('Concise output (word limits obeyed) fits within 2000 max_tokens', () => {
  assert.ok(
    conciseTokens <= 2000,
    `Concise worst-case output is ~${conciseTokens} tokens, must be ≤ 2000`
  );
  console.log(`    Concise worst-case: ${conciseMaxOutput.length} chars  ~${conciseTokens} tokens`);
});

test('Concise output fits within old 1600 limit (bonus margin)', () => {
  assert.ok(
    conciseTokens <= 1600,
    `Concise output (~${conciseTokens} tokens) should fit within 1600 — if not, word limits need tightening`
  );
});

test('Verbose output (ignoring limits) would have exceeded old 1600 limit', () => {
  // This is a documentation test — it verifies the original problem was real.
  assert.ok(
    verboseTokens > 1600,
    `Verbose output must demonstrate the old overflow (expected >1600, got ~${verboseTokens})`
  );
  console.log(`    Verbose worst-case: ${verboseMaxOutput.length} chars  ~${verboseTokens} tokens (old 1600 limit: would truncate)`);
});

test('Verbose output fits within new 2000 max_tokens', () => {
  assert.ok(
    verboseTokens <= 2000,
    `Verbose worst-case output is ~${verboseTokens} tokens, must be ≤ 2000. If > 2000, raise max_tokens further or tighten prompt.`
  );
  console.log(`    Verbose worst-case: ~${verboseTokens} tokens — fits within 2000`);
});

// ─── Section 4: Truncation guard still present ───────────────────────────────
console.log('\nSection 4: Truncation guard');

test('Truncation guard still checks stop_reason === max_tokens', () => {
  assert.ok(
    aiSrc.includes("stopReason === 'max_tokens'"),
    "Truncation guard must still be present: if (stopReason === 'max_tokens') { return fallback('truncated') }"
  );
});

test('Truncation guard precedes JSON.parse (checked in source order)', () => {
  const truncIdx = aiSrc.indexOf("stopReason === 'max_tokens'");
  const parseIdx = aiSrc.indexOf('JSON.parse(text)');
  assert.ok(
    truncIdx > 0 && parseIdx > 0 && truncIdx < parseIdx,
    'Truncation guard must appear before JSON.parse to prevent misleading parse errors'
  );
});

test("Fallback reason 'truncated' is returned on max_tokens", () => {
  assert.ok(
    aiSrc.includes("fallback('truncated')"),
    "fallback('truncated') must be called when stop_reason is max_tokens"
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('\n✅ All AI Summary token-budget tests passed.\n');
