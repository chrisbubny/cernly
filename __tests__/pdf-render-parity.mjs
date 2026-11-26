/**
 * __tests__/pdf-render-parity.mjs
 *
 * Verifies the fixture generator and the production PDF route share one
 * rendering path, then renders fixtures through the production ReportPDF and
 * checks the extracted text.
 *
 * Run: node __tests__/pdf-render-parity.mjs   (requires pdftotext / poppler-utils)
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0;
const ok = msg => { passed++; console.log(`  ✓ ${msg}`); };

// ── 1. Static: one rendering path ─────────────────────────────────────────────
const routeSrc   = fs.readFileSync(path.join(ROOT, 'app/api/report/[slug]/pdf/route.js'), 'utf8');
const fixtureSrc = fs.readFileSync(path.join(ROOT, 'scripts/render-pdf-fixture.cjs'), 'utf8');

assert.match(routeSrc, /import ReportPDF, \{ resolvePageSize \} from '\.\/ReportPDF\.js'/);
assert.match(routeSrc, /renderToBuffer\(\s*React\.createElement\(ReportPDF, \{ report: \{ \.\.\.report, recommendations \}, size: pageSize \}\)/);
ok('route renders production ReportPDF with report + recommendations');

assert.match(fixtureSrc, /require\(path\.join\(ROOT, 'app\/api\/report\/\[slug\]\/pdf\/ReportPDF\.js'\)\)/);
assert.match(fixtureSrc, /renderToBuffer\(React\.createElement\(ReportPDF, \{ report, size: resolvePageSize\(size\) \}\)\)/);
for (const forbidden of [/StyleSheet\.create/, /\bDocument\b,/, /e\(Page\b/, /function CoverPage/, /function FindingsPage/]) {
  assert.doesNotMatch(fixtureSrc, forbidden, `fixture must not re-implement layout (${forbidden})`);
}
ok('fixture generator requires the same ReportPDF module and re-implements no components');

assert.doesNotMatch(fixtureSrc, /analyzerStatuses/, 'fixture must use production auditStatuses');
assert.doesNotMatch(fixtureSrc, /more images also missing/i, 'fixture must not contain fabricated evidence rows');
assert.doesNotMatch(fixtureSrc, /\bbytes: \d/, 'fixture must use production totalBytes field');
ok('fixture data uses production field shapes (auditStatuses, totalBytes, totalDetected)');

// ── 2. Runtime: render fixtures through production ReportPDF ─────────────────
const fixtures            = require(path.join(ROOT, 'scripts/render-pdf-fixture.cjs')); // registers @swc/register
const { default: ReportPDF, resolvePageSize } = require(path.join(ROOT, 'app/api/report/[slug]/pdf/ReportPDF.js'));
const { renderToBuffer }  = require('@react-pdf/renderer');
const React               = require('react');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cernly-pdf-parity-'));
async function pages(report) {
  const buf  = await renderToBuffer(React.createElement(ReportPDF, { report, size: resolvePageSize('letter') }));
  const file = path.join(tmp, `${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, buf);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  return text.split('\f').map(p => p.replace(/\s+/g, ' '));
}

{
  const p = await pages(fixtures.fixtureFailedLighthouse);
  assert.match(p[0], /PARTIAL ANALYSIS/);
  assert.match(p[0], /The executive summary reflects only analyzers that produced data/);
  assert.match(p[0], /Performance data unavailable — accessibility and security issues detected/);
  const all = p.join(' ');
  assert.match(all, /Performance Failed/, 'Methodology reads auditStatuses');
  assert.match(all, /Disable TLS 1\.0 and TLS 1\.1/, 'Action Plan uses recommendation actions');
  assert.match(all, /6 of 11 detected elements listed/);
  ok('failed-analyzer fixture: verified narrative shown, status Failed, evidence disclosure present');
}
{
  const p = await pages(fixtures.fixtureStaleAssessment);
  assert.match(p[0], /The automated summary is not shown because it could not be verified/);
  assert.doesNotMatch(p[0], /excellent at under 1 s/, 'stale headline must not render');
  assert.doesNotMatch(p[0], /Core Web Vitals are all in the good range/, 'stale summary must not render');
  assert.doesNotMatch(p[0], /Fast first contentful paint/, 'strength from failed category must not render');
  assert.doesNotMatch(p[0], /EXECUTIVE SUMMARY/);
  ok('stale legacy assessment: free-form headline, summary and Performance strength withheld and disclosed');
}
{
  const p = await pages(fixtures.fixtureReport);
  assert.doesNotMatch(p[0], /PARTIAL ANALYSIS/);
  assert.match(p[0], /Critical performance and accessibility barriers are limiting reach/);
  const all = p.join(' ');
  for (const img of ['hero-banner.jpg', 'services-bg.jpg', 'team-photo.jpg', 'testimonial-1.jpg', 'testimonial-2.jpg', 'testimonial-3.jpg']) {
    assert.ok(all.includes(`/images/${img}`), `alt-text evidence must list ${img}`);
  }
  assert.match(all, /\(892 KB\)/, 'Lighthouse totalBytes rendered');
  assert.match(all, /Analyzer Status Coverage/, 'Methodology table header present');
  assert.doesNotMatch(all, /Status Time Coverage/, 'no Time column when no durations are recorded');
  ok('main fixture: full narrative, every stored image path listed, byte sizes rendered');
}
{
  const unpartialNoAssess = await pages(fixtures.fixtureNoAssessment);
  assert.match(unpartialNoAssess[0], /Automated summary: performance is below average/, 'aiSummary fallback on a full scan');
  const partialNoAssess = await pages({ ...fixtures.fixtureFailedLighthouse, assessment: null,
    aiSummary: 'Your site is fast and well optimised.' });
  assert.doesNotMatch(partialNoAssess[0], /fast and well optimised/, 'unverifiable aiSummary withheld on partial scan');
  assert.match(partialNoAssess[0], /PARTIAL ANALYSIS/, 'partial notice shown even without an assessment');
  ok('aiSummary fallback: shown on full scans, withheld and disclosed on partial scans');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\npdf-render-parity: ${passed} checks passed.`);
