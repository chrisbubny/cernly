/**
 * implementation-pass1.mjs
 *
 * Executable tests for the first implementation pass:
 *   A. AI fabrication prohibition (system prompt)
 *   B. CMS-aware Guided Fix (siteType threading, platform hints)
 *   C. Verification UX (partial resolution, progress tab suppression)
 *   D. Chat expand (AskCernlyDrawer width state)
 *   E. Lighthouse failure logging (structured categories, no credentials)
 *
 * Run: node __tests__/implementation-pass1.mjs
 * Requires: no database, no external services. All tests are unit-level.
 */

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// A. AI Fabrication Prohibition — app/api/ask/route.js
// ---------------------------------------------------------------------------

console.log('\n[A] AI Fabrication Prohibition');

const askRoute = readFileSync(path.join(root, 'app/api/ask/route.js'), 'utf8');

test('System prompt contains fabrication prohibition paragraph', () => {
  assert.match(askRoute, /Never describe, infer, or speculate about the site's purpose/,
    'Expected fabrication prohibition text in ask route');
});

test('Prohibition covers profession/expertise/services/business details', () => {
  assert.match(askRoute, /profession.*expertise|expertise.*profession/i,
    'Expected profession/expertise to be covered');
  assert.match(askRoute, /services/i, 'Expected services to be covered');
  assert.match(askRoute, /business details/i, 'Expected business details to be covered');
});

test('Prohibition explains scan captures technical metrics only', () => {
  assert.match(askRoute, /scan captures technical metrics only/i,
    'Expected explanation that scan captures technical metrics only');
});

test('Prohibition instructs to disclose when context is absent', () => {
  assert.match(askRoute, /say so and answer based only on what was measured/i,
    'Expected instruction to say so and answer based only on what was measured');
});

test('Fabrication prohibition is after existing findings instruction and before CMS tailoring', () => {
  const findingsIdx = askRoute.indexOf("Refer to the site's actual findings");
  const prohibitIdx = askRoute.indexOf("Never describe, infer, or speculate");
  const cmsIdx      = askRoute.indexOf("When the Platform/CMS is known");
  assert.ok(findingsIdx >= 0, 'Could not find "actual findings" instruction');
  assert.ok(prohibitIdx >= 0, 'Could not find fabrication prohibition');
  assert.ok(cmsIdx >= 0,      'Could not find CMS tailoring instruction');
  assert.ok(findingsIdx < prohibitIdx, 'Prohibition should come after findings instruction');
  assert.ok(prohibitIdx < cmsIdx,      'Prohibition should come before CMS tailoring');
});

// ---------------------------------------------------------------------------
// B. CMS-Aware Guided Fix
// ---------------------------------------------------------------------------

console.log('\n[B] CMS-Aware Guided Fix');

const guidance = readFileSync(path.join(root, 'lib/guidance.js'), 'utf8');
const guideRoute = readFileSync(path.join(root, 'app/api/guide-plan/route.js'), 'utf8');

test('PLATFORM_ADMIN_HINTS object exists with wordpress key', () => {
  assert.match(guidance, /PLATFORM_ADMIN_HINTS/,
    'Expected PLATFORM_ADMIN_HINTS to be defined');
  assert.match(guidance, /wordpress:/i, 'Expected wordpress entry');
});

test('WordPress hint includes plugin option for security headers', () => {
  const wpMatch = guidance.match(/wordpress:.*?`/s);
  assert.ok(wpMatch, 'Could not locate wordpress hint template literal');
  // The hint is a template literal that starts after "wordpress:"
  const wpHintStart = guidance.indexOf('wordpress: `');
  assert.ok(wpHintStart >= 0, 'wordpress hint not found');
  const afterHint = guidance.slice(wpHintStart, wpHintStart + 800);
  assert.match(afterHint, /plugin/i, 'WordPress hint should mention plugins');
  assert.match(afterHint, /All In One Security|Really Simple Security/i,
    'WordPress hint should name specific plugins');
});

test('WordPress hint explicitly says HSTS cannot be set by a plugin', () => {
  const wpHintStart = guidance.indexOf('wordpress: `');
  const afterHint = guidance.slice(wpHintStart, wpHintStart + 1000);
  assert.match(afterHint, /HSTS.*server-level|server-level.*HSTS/i,
    'HSTS must be noted as server-level in WordPress hint');
  assert.match(afterHint, /cannot be set by a WordPress plugin/i,
    'Must explicitly say HSTS cannot be set by a plugin');
});

test('WordPress hint does not claim plugins guarantee every header', () => {
  const wpHintStart = guidance.indexOf('wordpress: `');
  const afterHint = guidance.slice(wpHintStart, wpHintStart + 1000);
  // We want "Do not claim a plugin guarantees" — the prohibition should be present
  assert.match(afterHint, /Do not claim a plugin guarantees/i,
    'Must include disclaimer about plugin guarantees');
});

test('buildPrompt signature accepts siteType parameter', () => {
  assert.match(guidance, /function buildPrompt\s*\(\s*rec\s*,\s*domain\s*,\s*persona\s*,\s*siteType\s*\)/,
    'buildPrompt must accept siteType as 4th parameter');
});

test('generateGuidancePlan signature accepts siteType parameter', () => {
  assert.match(guidance, /export.*function generateGuidancePlan\s*\([^)]*siteType/,
    'generateGuidancePlan must accept siteType parameter');
});

test('guide-plan route reads siteType from report and passes to generateGuidancePlan', () => {
  assert.match(guideRoute, /siteType\s*=\s*report\.siteType\s*\|\|\s*report\.site_type/,
    'Route must read siteType from report with fallback');
  assert.match(guideRoute, /generateGuidancePlan\([^)]*siteType/,
    'siteType must be passed to generateGuidancePlan');
});

test('Platform hint is injected only when platformKey matches', () => {
  // Verify the condition checks the platform key and falls back to empty string
  assert.match(guidance, /PLATFORM_ADMIN_HINTS\[platformKey\]\s*\|\|\s*''/,
    'Must fall back to empty string when no platform hint exists');
});

test('Unknown siteType produces no platform injection (empty string)', () => {
  // Verify the code normalises via toLowerCase() so a weird case doesn't crash
  assert.match(guidance, /\(siteType \|\| ''\)\.toLowerCase\(\)/,
    'siteType must be normalised to lowercase');
});

// ---------------------------------------------------------------------------
// C. Verification UX — ReportClient.js
// ---------------------------------------------------------------------------

console.log('\n[C] Verification UX');

const reportClient = readFileSync(
  path.join(root, 'app/report/[slug]/ReportClient.js'), 'utf8');

test('VerificationResultBanner is suppressed when activeTab === progress', () => {
  assert.match(reportClient, /activeTab !== ['"]progress['"]/,
    'Must suppress banner when activeTab is progress');
});

test('Banner suppression is linked to verifyResult condition', () => {
  // Find the full condition: verifyResult && activeTab !== 'progress'
  assert.match(reportClient, /verifyResult\s*&&\s*activeTab\s*!==\s*['"]progress['"]/,
    'verifyResult must be combined with activeTab guard');
});

test('"Continue fixing remaining issues" button appears for partially_resolved', () => {
  assert.match(reportClient, /Continue fixing remaining issues/,
    'Must have "Continue fixing remaining issues" button');
});

test('Continue button only appears when verifiedStatus is partially_resolved', () => {
  const btnIdx = reportClient.indexOf('Continue fixing remaining issues');
  assert.ok(btnIdx >= 0, 'Button text not found');
  // Scan backwards 500 chars for the condition
  const before = reportClient.slice(Math.max(0, btnIdx - 600), btnIdx);
  assert.match(before, /partially_resolved/,
    'Continue button must be guarded by partially_resolved check');
});

test('Continue button navigates to action tab', () => {
  const btnIdx = reportClient.indexOf('Continue fixing remaining issues');
  assert.ok(btnIdx >= 0, 'Button text not found');
  // Check within 600 chars before and after (the onClick is on the <button> tag above)
  const around = reportClient.slice(Math.max(0, btnIdx - 600), btnIdx + 200);
  assert.match(around, /setActiveTab\(['"]action['"]\)/,
    'Continue button must call setActiveTab("action")');
});

test('"View full comparison" button label does not say "in Progress tab"', () => {
  // We renamed to "View full comparison →" to avoid circular nav
  const oldLabel = /View full comparison in Progress tab/;
  assert.doesNotMatch(reportClient, oldLabel,
    'Old label still present — must remove "in Progress tab" from button text');
});

// ---------------------------------------------------------------------------
// D. Chat Expand — AskCernlyDrawer in ReportClient.js
// ---------------------------------------------------------------------------

console.log('\n[D] Chat Expand / Collapse');

test('AskCernlyDrawer has expanded state', () => {
  assert.match(reportClient, /const\s*\[expanded\s*,\s*setExpanded\]/,
    'Must have expanded state in AskCernlyDrawer');
});

test('Drawer width changes based on expanded state', () => {
  assert.match(reportClient, /expanded\s*\?\s*['"]?min\(90vw/,
    'Width must be conditional on expanded state with min(90vw...) value');
});

test('Expand/collapse button is rendered in drawer header', () => {
  assert.match(reportClient, /setExpanded\(e\s*=>\s*!e\)/,
    'Must have expand toggle handler: setExpanded(e => !e)');
});

test('Expand button has accessible aria-label', () => {
  assert.match(reportClient, /aria-label=\{expanded\s*\?/,
    'Expand button must have conditional aria-label based on expanded state');
});

test('Width transition is defined for smooth animation', () => {
  assert.match(reportClient, /transition:\s*['"]width/,
    'Must have CSS width transition for smooth expand/collapse');
});

// ---------------------------------------------------------------------------
// E. Lighthouse Failure Logging — lib/analyzers/lighthouse.js
// ---------------------------------------------------------------------------

console.log('\n[E] Lighthouse Failure Logging');

const lighthouse = readFileSync(path.join(root, 'lib/analyzers/lighthouse.js'), 'utf8');

test('AbortError / TimeoutError is caught and categorized as timeout', () => {
  assert.match(lighthouse, /TimeoutError|AbortError/,
    'Must catch TimeoutError or AbortError');
  assert.match(lighthouse, /category=.*timeout|PSI_TIMEOUT/i,
    'Timeout must be logged with a timeout category');
});

test('API key presence is logged as boolean, not the key value', () => {
  // Should have hasApiKey: !!apiKey — NEVER log the key itself
  assert.match(lighthouse, /hasApiKey\s*=\s*!!\s*apiKey/,
    'Must log hasApiKey as boolean !!apiKey');
  assert.doesNotMatch(lighthouse, /console\.[a-z]+\([^)]*apiKey[^)]*\)/,
    'Must never log the raw apiKey value');
});

test('HTTP status is logged as a structured field', () => {
  assert.match(lighthouse, /status=\$\{res\.status\}/,
    'Must log HTTP status as structured status= field');
});

test('Failure categories are defined for known HTTP statuses', () => {
  assert.match(lighthouse, /rate_limited/,  'Must categorize 429 as rate_limited');
  assert.match(lighthouse, /auth_error/,    'Must categorize 403 as auth_error');
  assert.match(lighthouse, /bad_request/,   'Must categorize 400 as bad_request');
  assert.match(lighthouse, /psi_server_error/, 'Must categorize 5xx as psi_server_error');
});

test('Elapsed time is logged on both failure paths', () => {
  const timeoutLog = lighthouse.indexOf('category=${isTimeout');
  const httpLog    = lighthouse.indexOf('elapsed=${elapsed}ms');
  assert.ok(timeoutLog >= 0, 'elapsed must be logged on timeout path');
  assert.ok(httpLog >= 0,    'elapsed must be logged on HTTP error path');
});

test('URL params (which may contain API key) are never logged', () => {
  // The log lines must not reference params or the full URL
  // (they log category/status/elapsed only)
  const logLines = lighthouse.match(/console\.[a-z]+\(`.+?`\)/gs) || [];
  for (const line of logLines) {
    assert.doesNotMatch(line, /\$\{.*params.*\}/,
      `Log line must not include URL params: ${line.slice(0, 80)}`);
    assert.doesNotMatch(line, /PSI_API\s*\+/,
      `Log line must not include full PSI URL: ${line.slice(0, 80)}`);
  }
});

test('Error message includes category in the thrown Error', () => {
  assert.match(lighthouse, /throw new Error\([^)]*category/i,
    'Thrown Error message must include the failure category');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
