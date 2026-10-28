/**
 * Regression tests: GuidedFix issue identity threading.
 *
 * These tests verify the structural fix that ensures the selected issue remains
 * the authoritative context throughout the GuidedFix workflow.
 *
 * Run with: node __tests__/guided-fix-rec-identity.mjs
 */
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const recClientSrc  = readFileSync(path.resolve(__dirname, '../app/report/[slug]/ReportClient.js'), 'utf8');
const guidedFixSrc  = readFileSync(path.resolve(__dirname, '../app/report/[slug]/GuidedFix.js'), 'utf8');
const guidePlanSrc  = readFileSync(path.resolve(__dirname, '../app/api/guide-plan/route.js'), 'utf8');
const guidanceSrc   = readFileSync(path.resolve(__dirname, '../lib/guidance.js'), 'utf8');

console.log('Running guided-fix-rec-identity regression tests...\n');

// ---------------------------------------------------------------------------
// Test 1: buildRecMap does NOT contain FINGERPRINT_GROUP_CORRECTIONS
// The workaround table must be removed — issue identity must be preserved
// via the issue prop, not by remapping fingerprints.
// ---------------------------------------------------------------------------
assert.ok(
  !recClientSrc.includes('FINGERPRINT_GROUP_CORRECTIONS'),
  'MUST remove FINGERPRINT_GROUP_CORRECTIONS — workaround remaps fingerprints and loses issue identity'
);
console.log('  ✓ FINGERPRINT_GROUP_CORRECTIONS removed from ReportClient.js');

// ---------------------------------------------------------------------------
// Test 2: guidedFixIssue state exists and onGuide passes issue at all call sites
// ---------------------------------------------------------------------------
assert.ok(
  recClientSrc.includes('guidedFixIssue'),
  'ReportClient.js must have guidedFixIssue state for the selected issue'
);
assert.ok(
  recClientSrc.includes("setGuidedFixIssue"),
  'ReportClient.js must call setGuidedFixIssue when opening GuidedFix'
);

// Count how many times onGuide(rec, issue) or onGuide(rec, iss) is called vs onGuide(rec) alone
const onGuideWithIssueMatches = [...recClientSrc.matchAll(/onGuide\s*\([^)]*,\s*iss/g)];
const onGuideRecOnly = [...recClientSrc.matchAll(/onGuide\s*\(\s*(?:rec|r)\s*\)/g)];
assert.ok(
  onGuideWithIssueMatches.length >= 2,
  `onGuide must be called with (rec, issue) at multiple call sites; found ${onGuideWithIssueMatches.length}`
);
assert.equal(
  onGuideRecOnly.length, 0,
  `All onGuide call sites must pass issue; found ${onGuideRecOnly.length} call(s) with rec only:\n` +
  onGuideRecOnly.map(m => m[0]).join('\n')
);
console.log('  ✓ guidedFixIssue state added; all onGuide call sites pass issue');

// ---------------------------------------------------------------------------
// Test 3: GuidedFix accepts issue prop and uses it for heading and chat context
// ---------------------------------------------------------------------------
assert.ok(
  guidedFixSrc.includes('issue,') || guidedFixSrc.includes('issue\n') || guidedFixSrc.match(/\{\s*rec,\s*issue/),
  'GuidedFix must accept an `issue` prop in its function signature'
);
assert.ok(
  guidedFixSrc.includes('issue?.message'),
  'GuidedFix heading must use issue?.message when available'
);
assert.ok(
  guidedFixSrc.includes('issue?.fingerprintId') || guidedFixSrc.includes("issue.fingerprintId"),
  'GuidedFix sendChatMessage must forward issue.fingerprintId as findingFingerprintId'
);
assert.ok(
  guidedFixSrc.includes('findingFingerprintId'),
  'GuidedFix must pass findingFingerprintId to /api/ask'
);
console.log('  ✓ GuidedFix accepts issue prop; heading uses issue.message; chat uses issue.fingerprintId');

// ---------------------------------------------------------------------------
// Test 4: Expanding GuidedFix only changes width — no drawer opened, no state reset
// The old onExpandChat approach must be removed.
// ---------------------------------------------------------------------------
assert.ok(
  !guidedFixSrc.includes('onExpandChat'),
  'GuidedFix must NOT have onExpandChat prop — expansion must only change sidebar width'
);
assert.ok(
  guidedFixSrc.includes('expanded') && guidedFixSrc.includes('setExpanded'),
  'GuidedFix must have expanded state for panel width control'
);
assert.ok(
  guidedFixSrc.includes('maxWidth: expanded ?') || guidedFixSrc.includes('maxWidth:expanded ?'),
  'GuidedFix panel maxWidth must respond to expanded state'
);
// Expand button must be in the header, not in InlineChatPanel
const inlineChatPanelFn = guidedFixSrc.match(/function InlineChatPanel\s*\([^)]*\)[^}]+(?:\{[^}]*\}[^}]*)*}/s)?.[0] || '';
assert.ok(
  !inlineChatPanelFn.includes('onExpand') || !inlineChatPanelFn.includes('Open in Ask Cernly'),
  'InlineChatPanel must NOT have an expand button'
);
console.log('  ✓ Expansion handled by expanded state in GuidedFix header; onExpandChat removed');

// ---------------------------------------------------------------------------
// Test 5: Closing GuidedFix clears both rec and issue state (no stale issue on reopen)
// ---------------------------------------------------------------------------
const onCloseClearsBoth = recClientSrc.includes('setGuidedFixRec(null)') &&
  recClientSrc.includes('setGuidedFixIssue(null)');
assert.ok(
  onCloseClearsBoth,
  'onClose handler must clear both guidedFixRec and guidedFixIssue to prevent stale issue on reopen'
);
// Also verify they appear together in the same onClose context (arrow with braces)
const onClosePattern = /onClose\s*=\s*\{[^}]*setGuidedFixRec\(null\)[^}]*setGuidedFixIssue\(null\)[^}]*\}|onClose\s*=>\s*\([^)]*\)[^}]*setGuidedFixRec\(null\)[^)]*setGuidedFixIssue\(null\)|onClose\s*=>\s*\{[^}]*setGuidedFixRec[^}]*setGuidedFixIssue[^}]*\}/;
assert.ok(
  onClosePattern.test(recClientSrc),
  'onClose must clear guidedFixRec and guidedFixIssue in the same handler'
);
console.log('  ✓ onClose clears both guidedFixRec and guidedFixIssue — no stale issue on reopen');

// ---------------------------------------------------------------------------
// Test 6 (bonus): guide-plan API accepts focusIssue and sanitises it
// ---------------------------------------------------------------------------
assert.ok(
  guidePlanSrc.includes('focusIssue'),
  'guide-plan route must accept focusIssue from request body'
);
assert.ok(
  guidePlanSrc.includes('safeFocusIssue'),
  'guide-plan route must sanitise focusIssue before passing to generateGuidancePlan'
);
assert.ok(
  guidanceSrc.includes('focusIssue') && guidanceSrc.includes('SELECTED FINDING'),
  'guidance.js buildPrompt must inject a SELECTED FINDING block when focusIssue is present'
);
console.log('  ✓ guide-plan API accepts and sanitises focusIssue; guidance.js injects it into prompt');

// ---------------------------------------------------------------------------
// Test 7 (bonus): guidedFixHidden and all visibility:hidden workarounds removed
// ---------------------------------------------------------------------------
assert.ok(
  !recClientSrc.includes('guidedFixHidden'),
  'guidedFixHidden state must be removed from ReportClient.js'
);
assert.ok(
  !recClientSrc.includes('visibility: \'hidden\'') && !recClientSrc.includes('visibility:\'hidden\''),
  'visibility:hidden wrapper around GuidedFix must be removed'
);
assert.ok(
  !recClientSrc.includes('_fromGuidedFix'),
  '_fromGuidedFix drawer context flag must be removed'
);
assert.ok(
  !recClientSrc.includes('_seedMessages'),
  '_seedMessages drawer context flag must be removed'
);
assert.ok(
  !recClientSrc.includes('_initialExpanded'),
  '_initialExpanded drawer context flag must be removed'
);
console.log('  ✓ All visibility:hidden / drawer-seeding workarounds removed');

console.log('\nAll guided-fix-rec-identity tests passed ✓');
