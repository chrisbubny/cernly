/**
 * Deterministic before/after comparison for fix/insight-evidence-extraction.
 *
 * This script exercises the pure processing logic inside runLighthouse() —
 * the issue-extraction loop, severity assignment, and evidence collection —
 * WITHOUT making any PSI network call. It does so by calling the same
 * helpers that lighthouse.js calls, with a representative fixture that
 * includes:
 *   A) A normal scan mix: critical, warning, info, and passing scored audits
 *   B) A forced-reflow-insight audit (insight-class, score:null, list type)
 *
 * On main: forced-reflow-insight is filtered out (score==null guard).
 * On branch: it passes through as severity 'info'.
 *
 * Both runs use the SAME fixture. The comparison checks that:
 *   - All normal finding severities are identical
 *   - Score counts for critical/warning/info are correct (no inflation)
 *   - Recommendation fingerprints are identical for scored findings
 *   - Insight findings appear only on branch, only as 'info'
 */

import assert from 'node:assert/strict';
import { INSIGHT_LIST_AUDITS, INSIGHT_TABLE_AUDITS, extractInsightEvidence } from '../lib/insight-evidence.js';
import { DEPENDENCY_AUDITS, extractDependencyEvidence } from '../lib/lighthouse-evidence.js';
import { RECOMMENDATION_GROUPS } from '../lib/recommendations.js';

// ─── Shared fixture: representative PSI audit set ────────────────────────────
// Covers: critical (score 0), warning (score 0.4), info (score 0.75), passing
// (score 1.0), null-scored ordinary (would be filtered), and insight-class.
const FIXTURE_AUDITS = {
  // --- Normal scored failing audits ---
  'render-blocking-resources': {
    title: 'Eliminate render-blocking resources',
    description: 'Resources are blocking the first paint of your page.',
    score: 0,
    scoreDisplayMode: 'numeric',
    displayValue: '510 ms',
    details: {
      type: 'opportunity',
      items: [
        { url: 'https://example.com/style.css', wastedMs: 350 },
        { url: 'https://example.com/font.css',  wastedMs: 160 },
      ],
    },
  },
  'uses-optimized-images': {
    title: 'Efficiently encode images',
    description: 'Optimized images load faster and consume less cellular data.',
    score: 0.3,
    scoreDisplayMode: 'numeric',
    displayValue: '125 KiB',
    details: {
      type: 'opportunity',
      items: [
        { url: 'https://example.com/hero.jpg', wastedBytes: 128000 },
      ],
    },
  },
  'uses-text-compression': {
    title: 'Enable text compression',
    description: 'Text-based resources should be served with compression.',
    score: 0.75,
    scoreDisplayMode: 'numeric',
    displayValue: '20 KiB',
    details: {
      type: 'opportunity',
      items: [
        { url: 'https://example.com/app.js', wastedBytes: 20480 },
      ],
    },
  },
  // --- Null-score ordinary audit (should stay filtered) ---
  'unused-javascript': {
    title: 'Remove unused JavaScript',
    description: 'Remove unused JavaScript to reduce bytes consumed by network activity.',
    score: null,
    scoreDisplayMode: 'numeric',
    displayValue: '45 KiB',
    details: { type: 'opportunity', items: [] },
  },
  // --- Passing audit (score 1.0) ---
  'uses-long-cache-ttl': {
    title: 'Serve static assets with an efficient cache policy',
    description: 'A long cache lifetime can speed up repeat visits.',
    score: 1.0,
    scoreDisplayMode: 'numeric',
  },
  // --- Accessibility failing audits ---
  'image-alt': {
    title: 'Image elements do not have [alt] attributes',
    description: 'Informative elements should aim for short, descriptive alternate text.',
    score: 0,
    scoreDisplayMode: 'numeric',
    details: {
      type: 'table',
      items: [
        { node: { snippet: '<img src="banner.png">', selector: '.hero img', nodeLabel: 'banner.png' } },
        { node: { snippet: '<img src="icon.svg">',  selector: '.icon', nodeLabel: 'icon.svg' } },
      ],
    },
  },
  // --- SEO failing audit ---
  'meta-description': {
    title: 'Document does not have a meta description',
    description: 'Meta descriptions may be included in search results.',
    score: 0,
    scoreDisplayMode: 'binary',
  },
  // --- Insight-class audit: forced-reflow-insight (score:null, list type) ---
  'forced-reflow-insight': {
    title: 'Avoid forced layout/reflow',
    description: 'Elements are considered offscreen if they have `display: none` or ...',
    score: null,
    scoreDisplayMode: 'informative',
    displayValue: '3 forced reflows',
    details: {
      type: 'list',
      items: [
        {
          type: 'table',
          headings: [
            { key: 'source', valueType: 'source-location', label: 'Function' },
            { key: 'reflowTime', valueType: 'ms', label: 'Time' },
          ],
          items: [
            { source: { type: 'source-location', url: 'https://example.com/app.js',    line: 42, column: 8  }, reflowTime: 25.6 },
            { source: { type: 'source-location', url: 'https://example.com/vendor.js', line: 100, column: 0 }, reflowTime: 12.3 },
          ],
        },
        {
          type: 'table',
          headings: [
            { key: 'source', valueType: 'source-location', label: 'Function' },
            { key: 'reflowTime', valueType: 'ms', label: 'Time' },
          ],
          items: [
            { source: { type: 'source-location', url: 'https://example.com/theme.js', line: 7, column: 2 }, reflowTime: 5.0 },
          ],
        },
      ],
    },
  },
};

// Map audits to their categories (matches PSI category auditRefs structure)
const AUDIT_TO_CATEGORY = {
  'render-blocking-resources': 'performance',
  'uses-optimized-images':     'performance',
  'uses-text-compression':     'performance',
  'unused-javascript':         'performance',
  'uses-long-cache-ttl':       'performance',
  'image-alt':                 'accessibility',
  'meta-description':          'seo',
  'forced-reflow-insight':     'performance',
};

const CAT_AREA_MAP = {
  'performance':    'Performance',
  'seo':            'SEO',
  'accessibility':  'Accessibility',
  'best-practices': 'Performance',
};

// ─── Replicate the extraction loop from lighthouse.js ───────────────────────
// Two modes: 'main' simulates the unmodified main branch behaviour
// (insight audits filtered by score==null); 'branch' simulates the branch.
function extractIssues(audits, mode) {
  const issues = [];

  for (const [auditId, audit] of Object.entries(audits)) {
    const isDependency = DEPENDENCY_AUDITS.has(auditId);
    const dependencyEvidence = isDependency ? extractDependencyEvidence(audit.details) : null;

    const isInsightList  = INSIGHT_LIST_AUDITS.has(auditId);
    const isInsightTable = INSIGHT_TABLE_AUDITS.has(auditId);
    const isInsight = isInsightList || isInsightTable;

    const insightEvidence = (mode === 'branch' && isInsightList)
      ? extractInsightEvidence(auditId, audit.details)
      : null;

    const hasInsightListItems  = !!(insightEvidence?.items?.length);
    const hasInsightTableItems = (mode === 'branch') && isInsightTable
      && audit.details?.type === 'table'
      && Array.isArray(audit.details?.items)
      && audit.details.items.length > 0;

    // Admission gate — replicates lighthouse.js line 151-154
    if (mode === 'main') {
      // main: insight audits filtered by score==null regardless
      if ((!isDependency || !dependencyEvidence?.items)
          && (audit.score == null || audit.score >= 0.9 || audit.details?.type === 'debugdata')) continue;
    } else {
      // branch: insight audits allowed through when they have extractable evidence
      if ((!isDependency || !dependencyEvidence?.items)
          && !hasInsightListItems
          && !hasInsightTableItems
          && (audit.score == null || audit.score >= 0.9 || audit.details?.type === 'debugdata')) continue;
    }

    // 30-issue cap — insight audits exempt on branch
    if (issues.length >= 30 && !isDependency && !(mode === 'branch' && isInsight)) continue;
    if (isDependency && audit.score === 1) continue;

    const catId = AUDIT_TO_CATEGORY[auditId] || 'performance';
    const area  = CAT_AREA_MAP[catId] || 'Performance';

    // Severity — branch invariant: insight => always 'info'
    const effectiveIsInsight = mode === 'branch' && isInsight;
    const severity = (effectiveIsInsight || audit.score == null) ? 'info'
      : audit.score === 0 ? 'critical'
      : audit.score < 0.5 ? 'warning'
      : 'info';

    // Items
    let items = null;
    let totalDetected = null;
    let insightMeta = {};

    if (hasInsightListItems) {
      items         = insightEvidence.items;
      totalDetected = insightEvidence.totalDetected;
      insightMeta   = {
        diagnostic: true,
        ...(insightEvidence.evidenceLimitations ? { evidenceLimitations: insightEvidence.evidenceLimitations } : {}),
      };
    } else {
      const d = audit.details;
      if (d && (d.type === 'opportunity' || d.type === 'table') && Array.isArray(d.items) && d.items.length) {
        const extracted = d.items.slice(0, 20).map(item => {
          const out = {};
          if (item.url)              out.url          = item.url;
          if (item.wastedMs   != null) out.wastedMs   = Math.round(item.wastedMs);
          if (item.totalBytes != null) out.totalBytes = item.totalBytes;
          if (item.wastedBytes!= null) out.wastedBytes = item.wastedBytes;
          if (item.node && typeof item.node === 'object') {
            if (item.node.snippet)  out.snippet  = item.node.snippet.slice(0, 200);
            if (item.node.selector) out.selector = item.node.selector;
            if (item.node.nodeLabel && !out.label) out.label = item.node.nodeLabel;
          }
          return Object.keys(out).length ? out : null;
        }).filter(Boolean);
        if (extracted.length) items = extracted;
      }
      totalDetected = Array.isArray(audit.details?.items) ? audit.details.items.length : null;
      if (mode === 'branch' && isInsightTable) insightMeta = { diagnostic: true };
    }

    issues.push({
      area, severity, source: 'lighthouse', auditId,
      message: audit.title,
      displayValue: audit.displayValue || null,
      items, totalDetected,
      ...insightMeta,
    });
  }
  return issues;
}

// ─── Map finding fingerprints to recommendation groups ───────────────────────
function findingToRec(auditId) {
  const fp = `lh:${auditId}`;
  for (const [recFp, group] of Object.entries(RECOMMENDATION_GROUPS)) {
    if (group.findings?.includes(fp)) return recFp;
  }
  return null;
}

// ─── Run both modes ───────────────────────────────────────────────────────────
const mainIssues   = extractIssues(FIXTURE_AUDITS, 'main');
const branchIssues = extractIssues(FIXTURE_AUDITS, 'branch');

// ─── Analysis helpers ─────────────────────────────────────────────────────────
function countBySeverity(issues) {
  const c = { critical: 0, warning: 0, info: 0 };
  for (const i of issues) c[i.severity] = (c[i.severity] || 0) + 1;
  return c;
}

function summaryRow(issues) {
  return issues.map(i => ({
    auditId:   i.auditId,
    severity:  i.severity,
    rec:       findingToRec(i.auditId) || '(none)',
    hasItems:  !!i.items,
    diagnostic: i.diagnostic || false,
  }));
}

const mainRows   = summaryRow(mainIssues);
const branchRows = summaryRow(branchIssues);

// ─── Print comparison table ───────────────────────────────────────────────────
const FMT = (s, w) => s.slice(0, w).padEnd(w);
const HDR = `${'auditId'.padEnd(36)} ${'sev'.padEnd(8)} ${'diagnostic'.padEnd(10)} ${'rec fingerprint'.padEnd(36)} items`;
const SEP = '-'.repeat(HDR.length);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  FIXTURE COMPARISON: main vs fix/insight-evidence-extraction');
console.log('══════════════════════════════════════════════════════════════\n');

console.log('── MAIN BRANCH ─────────────────────────────────────────────');
console.log(HDR); console.log(SEP);
for (const r of mainRows) {
  console.log(`${FMT(r.auditId,36)} ${FMT(r.severity,8)} ${String(r.diagnostic).padEnd(10)} ${FMT(r.rec,36)} ${r.hasItems}`);
}
const mainCounts = countBySeverity(mainIssues);
console.log(`\ntotal=${mainIssues.length}  critical=${mainCounts.critical}  warning=${mainCounts.warning}  info=${mainCounts.info}`);

console.log('\n── BRANCH fix/insight-evidence-extraction ──────────────────');
console.log(HDR); console.log(SEP);
for (const r of branchRows) {
  console.log(`${FMT(r.auditId,36)} ${FMT(r.severity,8)} ${String(r.diagnostic).padEnd(10)} ${FMT(r.rec,36)} ${r.hasItems}`);
}
const branchCounts = countBySeverity(branchIssues);
console.log(`\ntotal=${branchIssues.length}  critical=${branchCounts.critical}  warning=${branchCounts.warning}  info=${branchCounts.info}`);

// ─── Assertions ───────────────────────────────────────────────────────────────
console.log('\n── ASSERTIONS ──────────────────────────────────────────────');
let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}`); fail++; }
}

// 1. Scored findings identical between main and branch
const mainScored   = mainRows.filter(r => !r.diagnostic);
const branchScored = branchRows.filter(r => !r.diagnostic);
check('Same number of scored findings on both branches',
  mainScored.length === branchScored.length);
for (const mr of mainScored) {
  const br = branchScored.find(r => r.auditId === mr.auditId);
  check(`  ${mr.auditId}: severity unchanged (${mr.severity})`,
    br && br.severity === mr.severity);
  check(`  ${mr.auditId}: recommendation fingerprint unchanged (${mr.rec})`,
    br && br.rec === mr.rec);
  check(`  ${mr.auditId}: items presence unchanged`,
    br && br.hasItems === mr.hasItems);
}

// 2. Critical/warning counts unchanged
check('critical count unchanged',   mainCounts.critical === branchCounts.critical);
check('warning count unchanged',    mainCounts.warning  === branchCounts.warning);

// 3. Branch has exactly one more issue (the insight audit)
check('Branch has exactly 1 additional issue (insight)',
  branchIssues.length === mainIssues.length + 1);

// 4. Insight finding appears only on branch, as 'info', as diagnostic
const insightOnBranch = branchIssues.find(i => i.auditId === 'forced-reflow-insight');
const insightOnMain   = mainIssues.find(i => i.auditId === 'forced-reflow-insight');
check('forced-reflow-insight absent from main', !insightOnMain);
check('forced-reflow-insight present on branch', !!insightOnBranch);
check('forced-reflow-insight severity is info', insightOnBranch?.severity === 'info');
check('forced-reflow-insight is marked diagnostic', insightOnBranch?.diagnostic === true);
check('forced-reflow-insight has evidence items', Array.isArray(insightOnBranch?.items) && insightOnBranch.items.length > 0);

// 5. Null-scored ordinary audit still filtered on both
const unusedOnMain   = mainIssues.find(i => i.auditId === 'unused-javascript');
const unusedOnBranch = branchIssues.find(i => i.auditId === 'unused-javascript');
check('unused-javascript (null score, no items) filtered on main',   !unusedOnMain);
check('unused-javascript (null score, no items) filtered on branch', !unusedOnBranch);

// 6. Passing audit filtered on both
const cacheOnMain   = mainIssues.find(i => i.auditId === 'uses-long-cache-ttl');
const cacheOnBranch = branchIssues.find(i => i.auditId === 'uses-long-cache-ttl');
check('uses-long-cache-ttl (passing) filtered on main',   !cacheOnMain);
check('uses-long-cache-ttl (passing) filtered on branch', !cacheOnBranch);

// 7. Insight finding items contain source-location fields
const item0 = insightOnBranch?.items?.[0];
check('insight items have url field',        typeof item0?.url === 'string');
check('insight items have line field',       typeof item0?.line === 'number');
check('insight items have reflowTime field', typeof item0?.reflowTime === 'number');

console.log(`\n${ fail === 0 ? '✅' : '❌' } ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
