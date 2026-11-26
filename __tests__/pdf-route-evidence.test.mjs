// Real PDF route handler and real accessibility analyzer; mock only Clerk,
// persistence, Stripe, network fetch, and the JSX render boundary.
// node --experimental-test-module-mocks --import ./lib/__tests__/alias-loader.mjs --test __tests__/pdf-route-evidence.test.mjs
import { mock, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let report, recs, recsError, rendered, html, errors;

mock.module('@clerk/nextjs/server', { namedExports: { auth: async () => ({ userId: null }) } });
mock.module(new URL('../lib/store.js', import.meta.url).href, { namedExports: {
  getReport: async () => structuredClone(report),
  getReportBySlug: async () => structuredClone(report),
  getUserSubscription: async () => null,
  getRecommendationsByReport: async () => { if (recsError) throw new Error('db down'); return structuredClone(recs); },
} });
mock.module(new URL('../lib/stripe-session.js', import.meta.url).href, { namedExports: {
  isValidPaidStripeSession: async () => false,
} });
// ReportPDF.js is JSX; replace it with a stub that records the props the route
// would render with. renderToBuffer returns bytes without running layout.
function ReportPDFStub(props) { rendered = props; return null; }
mock.module(new URL('../app/api/report/[slug]/pdf/ReportPDF.js', import.meta.url).href, {
  defaultExport: ReportPDFStub,
  namedExports: { resolvePageSize: s => (s === 'a4' ? 'A4' : 'LETTER') },
});
mock.module('@react-pdf/renderer', { namedExports: {
  renderToBuffer: async el => { el.type(el.props); return Buffer.from('%PDF-stub'); },
} });
mock.module(new URL('../lib/proxy-fetch.js', import.meta.url).href, { namedExports: {
  proxyFetch: async () => ({ ok: true, text: async () => html }),
} });

const route = await import('../app/api/report/[slug]/pdf/route.js');
const { runA11yCheck } = await import('../lib/analyzers/a11y.js');
const { buildEvidence, evidenceDisplay } = await import('../app/api/report/[slug]/pdf/evidence.js');

const call = () => route.GET(new Request('https://cernly.test/api/report/abc/pdf'), { params: { slug: 'abc' } });

beforeEach(() => {
  report = {
    id: 7, slug: 'abc', url: 'https://site.test', paid: true, userId: 'u1',
    scores: { performance: null, seo: 80, security: 70, accessibility: 60 },
    auditStatuses: { performance: { status: 'failed' }, seo: { status: 'completed' } },
    issues: [], assessment: null,
  };
  recs = [{ fingerprint: 'accessibility-missing-alt-text', category: 'Accessibility', actions: ['Add alt'], finding_fingerprints: ['a11y:images_missing_alt'] }];
  recsError = false; rendered = null; html = '';
  errors = [];
  mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
});

test('PDF route renders ReportPDF with the stored report plus its recommendations', async () => {
  const res = await call();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(rendered.report.recommendations, recs, 'recommendations from getRecommendationsByReport reach the PDF');
  assert.deepEqual(rendered.report.auditStatuses, report.auditStatuses, 'production auditStatuses reach the PDF unchanged');
  assert.equal(rendered.size, 'LETTER');
});

test('PDF route still renders, and logs, when the recommendations lookup fails', async () => {
  recsError = true;
  const res = await call();
  assert.equal(res.status, 200);
  assert.deepEqual(rendered.report.recommendations, []);
  assert.ok(errors.some(e => e.includes('[PDF] Recommendations lookup failed')), 'failure is logged, not silent');
});

test('PDF route access gate is unchanged: unpaid, anonymous, no session → 403 and no render', async () => {
  report.paid = false;
  const res = await call();
  assert.equal(res.status, 403);
  assert.equal(rendered, null);
});

const img = src => `<img src="${src}">`;
const dataUri = 'data:image/png;base64,iVBORw0KGgo=';

test('11 missing-alt images (6 with paths, 5 inline): analyzer keeps all 6 paths, PDF lists all 6 and discloses 6 of 11', async () => {
  const paths = ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg', '/f.jpg?v=2'];
  html = `<html lang="en"><body>${paths.map(img).join('')}${Array(5).fill(dataUri).map(img).join('')}<img src="/ok.jpg" alt="ok"></body></html>`;
  const { issues } = await runA11yCheck('https://site.test');
  const finding = issues.find(i => i.checkId === 'images_missing_alt');
  assert.equal(finding.totalDetected, 11);
  assert.deepEqual(finding.items.map(i => i.url), paths, 'every recoverable path is preserved, in page order');

  const { rows, note } = buildEvidence(finding);
  assert.deepEqual(rows.map(r => r.text), paths, 'PDF lists every stored path — no presentation cap');
  assert.match(note, /^6 of 11 detected elements listed\./);
  assert.ok(!rows.some(r => /more/i.test(r.text)), 'no fabricated "N more" row');
});

test('Above the analyzer cap: 25 images → 20 stored, PDF lists 20 and discloses 20 of 25', async () => {
  html = `<html lang="en"><body>${Array.from({ length: 25 }, (_, i) => img(`/img-${i}.jpg`)).join('')}</body></html>`;
  const { issues } = await runA11yCheck('https://site.test');
  const finding = issues.find(i => i.checkId === 'images_missing_alt');
  assert.equal(finding.items.length, 20, 'documents the existing analyzer storage cap (lib/analyzers/a11y.js)');
  assert.equal(finding.totalDetected, 25);
  const { rows, note } = buildEvidence(finding);
  assert.equal(rows.length, 20);
  assert.match(note, /^20 of 25 detected elements listed\./);
});

test('All missing-alt images inline: no rows invented, count disclosed', async () => {
  html = `<html lang="en"><body>${Array(3).fill(dataUri).map(img).join('')}</body></html>`;
  const { issues } = await runA11yCheck('https://site.test');
  const finding = issues.find(i => i.checkId === 'images_missing_alt');
  assert.equal(finding.items, null);
  const { rows, note } = buildEvidence(finding);
  assert.equal(rows.length, 0);
  assert.equal(note, '3 elements detected; no source paths were recorded for them.');
});

test('Production item shapes are all displayable; nothing is silently dropped', () => {
  assert.equal(evidenceDisplay({ selector: 'nav > button.menu' }).text, 'nav > button.menu', 'Lighthouse node item without url/label');
  assert.equal(evidenceDisplay({ snippet: '<button class="x">' }).text, '<button class="x">');
  assert.equal(evidenceDisplay({ url: '/app.js', totalBytes: 142800 }).size, '143 KB', 'Lighthouse totalBytes');
  assert.equal(evidenceDisplay({ url: '/font.woff2', transferSize: 2_400_000 }).size, '2.4 MB', 'dependency-tree transferSize');
  assert.equal(evidenceDisplay({ wastedMs: 30 }), null, 'item with no identifying field is the only kind skipped');
  const { note } = buildEvidence({ items: [{ url: '/x.js' }], evidenceTruncated: true, evidenceLimitations: 'Dependency evidence is partial: request count, depth, or field length was capped.' });
  assert.equal(note, 'Dependency evidence is partial: request count, depth, or field length was capped.');
  assert.equal(buildEvidence({ items: [{ url: '/x' }], totalDetected: 1 }).note, null, 'no note when everything detected is listed');
});
