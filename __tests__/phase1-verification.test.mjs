// Real comparison, verification helpers and verify route. Only I/O is mocked.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compareScans, compareRecommendations, compareFindings, selectComparisonPair } from '../lib/comparison.js';
import { canonicalFindingId } from '../lib/finding-audits.js';
import { deriveVerifiedStatus, extractFindingOutcomes } from '../lib/verification.js';
let viewer, rows, writes;
mock.module('@clerk/nextjs/server', { namedExports: { auth: async () => ({ userId: viewer }) } });
mock.module(new URL('../lib/store.js', import.meta.url).href, { namedExports: {
  getReportWithData: async (id, userId) => {
    const r = rows[id]; return r && (r.userId === userId || r.isPublic) ? structuredClone(r) : null;
  },
  ensureWorkItemsTable: async () => {}, upsertWorkItem: async () => {},
  setVerifiedStatus: async (userId, data) => { writes.push({ userId, ...data }); },
  deriveWorkItemScopeKey: () => 'https://site.test/',
} });
const { POST } = await import('../app/api/work-items/verify/route.js');
const statuses = (results = {}) => Object.fromEntries(['performance','seo','security','accessibility'].map(cat => [cat, {
  status: 'completed', findingResults: results[cat] || {},
}]));
const issue = (id, canonical) => ({ fingerprintId: id, canonicalFingerprintId: canonical,
  area: 'Performance', severity: 'warning', message: id });
const rec = (ids, fingerprint = 'js-overhead') => ({ fingerprint, finding_fingerprints: ids,
  priority: 'high', supporting_findings: ids.map(id => issue(id)) });
const scan = (issues = [], recommendations = [], auditStatuses = statuses()) => ({
  id: 1, userId: 'owner', isPublic: false, url: 'https://site.test/', createdAt: '2026-11-01T00:00:00Z',
  scores: { performance: 80 }, issues, recommendations, auditStatuses,
});
const passed = id => statuses({ performance: { [id]: { status: 'passed', category: 'performance' } } });
const request = (recFingerprint, other = {}) => new Request('https://cernly.test/api/work-items/verify', {
  method:'POST', headers:{'content-type':'application/json'},
  body:JSON.stringify({recFingerprint,previousReportId:1,currentReportId:2,...other}),
});
beforeEach(() => {
  viewer='owner'; writes=[];
  rows={ 1: scan([issue('lh:unused-javascript')], [rec(['lh:unused-javascript'])]),
    2: {...scan([], [], passed('lh:unused-javascript')), id:2,createdAt:'2026-11-02T00:00:00Z'} };
});
test('Unknown finding and recommendation never resolve, including fully completed scans', () => {
  const comp=compareScans(rows[1],rows[2]);
  for (const target of ['unknown-rec','lh:unknown','seo:unknown']) {
    assert.equal(deriveVerifiedStatus(target,comp),'unable_to_verify');
    assert.deepEqual(extractFindingOutcomes(target,comp),[]);
  }
});
for (const status of ['failed','blocked','unavailable',undefined]) {
  test(`Missing finding with ${status || 'missing'} relevant analyzer status cannot resolve`, () => {
    const current=passed('lh:unused-javascript');
    if (status) current.performance.status=status; else delete current.performance;
    const comp=compareScans(rows[1],{...rows[2],auditStatuses:current});
    assert.equal(deriveVerifiedStatus('js-overhead',comp),'unable_to_verify');
    assert.equal(deriveVerifiedStatus('lh:unused-javascript',comp),'unable_to_verify');
  });
}
test('Broad completion without a per-check result cannot resolve a historical finding', () => {
  const comp=compareScans(rows[1],{...rows[2],auditStatuses:statuses()});
  assert.equal(comp.findings.likely_resolved.length,0);
  assert.equal(deriveVerifiedStatus('js-overhead',comp),'unable_to_verify');
});
test('Missing, manual and errored per-check results cannot resolve', () => {
  for(const result of [undefined,{status:'unavailable'},{status:'manual'},{status:'error'}]) {
    const coverage=statuses({performance:{'lh:unused-javascript':result}});
    assert.equal(compareRecommendations(rows[1].recommendations,[],[],coverage).unable_to_verify.length,1);
  }
});
test('Recorded failing check beyond an issue cap remains detected', () => {
  const coverage=statuses({performance:{'lh:unused-javascript':{status:'failed'}}});
  const comp=compareScans(rows[1],{...rows[2],auditStatuses:coverage});
  assert.equal(deriveVerifiedStatus('lh:unused-javascript',comp),'still_detected');
  assert.equal(deriveVerifiedStatus('js-overhead',comp),'still_detected');
});
test('Known finding and recommendation resolve only with their explicit passing check', () => {
  const comp=compareScans(rows[1],rows[2]);
  for(const fp of ['lh:unused-javascript','js-overhead']) {
    assert.equal(deriveVerifiedStatus(fp,comp),'likely_resolved');
    assert.deepEqual(extractFindingOutcomes(fp,comp).map(f=>f.fingerprintId),['lh:unused-javascript']);
  }
});
test('HTML accessibility completion cannot verify missing Lighthouse accessibility evidence', () => {
  const comp=compareScans(scan([issue('lh:image-alt')],[rec(['lh:image-alt'],'accessibility-barriers')]),scan());
  assert.equal(deriveVerifiedStatus('lh:image-alt',comp),'unable_to_verify');
});
test('Explicit Lighthouse accessibility pass is independent of the HTML analyzer', () => {
  const coverage=statuses({performance:{'lh:image-alt':{status:'passed',category:'accessibility'}}});
  coverage.accessibility.status='failed';
  const c=compareScans(scan([issue('lh:image-alt')]),scan([],[],coverage));
  assert.equal(deriveVerifiedStatus('lh:image-alt',c),'likely_resolved');
});
test('An unrelated audit pass cannot resolve a finding', () => {
  const c=compareScans(rows[1],{...rows[2],auditStatuses:passed('lh:image-alt')});
  assert.equal(deriveVerifiedStatus('lh:unused-javascript',c),'unable_to_verify');
});
test('Canonical duplicates do not create false resolved or new findings', () => {
  const prev=[issue('lh:unused-javascript'),issue('lh:unused-javascript:2','lh:unused-javascript')];
  const curr=[issue('lh:unused-javascript:3','lh:unused-javascript')];
  const result=compareFindings(prev,curr,statuses(),statuses());
  assert.equal(result.still_detected.length,1);assert.equal(result.likely_resolved.length,0);assert.equal(result.new_since.length,0);
  assert.equal(canonicalFindingId('lh:unused-javascript:2'),'lh:unused-javascript');
  const r=compareRecommendations([rec(['lh:unused-javascript','lh:unused-javascript:2'])],[],curr,statuses());
  assert.equal(r.still_open[0].total,1);
});
test('Ordinal target resolves by canonical finding identity', () => {
  const c=compareScans(rows[1],rows[2]);
  assert.equal(deriveVerifiedStatus('lh:unused-javascript:2',c),'likely_resolved');
  assert.equal(extractFindingOutcomes('lh:unused-javascript:2',c).length,1);
});
test('Mixed recommendation with an unverified part cannot claim partial resolution', () => {
  const previous=scan([issue('lh:unused-javascript'),issue('seo:title_missing')],
    [rec(['lh:unused-javascript','seo:title_missing'])]);
  const c=compareScans(previous,rows[2]);
  assert.equal(deriveVerifiedStatus('js-overhead',c),'unable_to_verify');
});
test('Known passed and still-present checks give partial resolution', () => {
  const previous=scan([issue('lh:unused-javascript'),issue('seo:title_missing')],
    [rec(['lh:unused-javascript','seo:title_missing'])]);
  const c=compareScans(previous,{...rows[2],issues:[issue('seo:title_missing')]});
  assert.equal(deriveVerifiedStatus('js-overhead',c),'partially_resolved');
});
test('All failed scans are limited and cannot resolve unknown targets', () => {
  const coverage=statuses();for(const entry of Object.values(coverage))entry.status='failed';
  const c=compareScans(scan([],[],coverage),scan([],[],coverage));
  assert.equal(c.comparabilityLevel,'limited');
  assert.equal(deriveVerifiedStatus('unknown-rec',c),'unable_to_verify');
});
test('Incompatible pages cannot verify even a known target', () => {
  const c=compareScans(rows[1],{...rows[2],url:'https://site.test/other'});
  assert.equal(deriveVerifiedStatus('js-overhead',c),'unable_to_verify');
});
for(const fp of ['js-overhead','lh:unused-javascript','lh:unused-javascript:2']) {
  test(`Verify route persists evidence-backed outcome for ${fp}`,async()=>{
    const r=await POST(request(fp));assert.equal(r.status,200);
    const body=await r.json();assert.equal(body.verifiedStatus,'likely_resolved');
    assert.equal(body.findingOutcomes.length,1);assert.equal(writes[0].verifiedStatus,'likely_resolved');
  });
}
test('Verify route persists unable_to_verify for unknown target',async()=>{
  const r=await POST(request('unknown'));assert.equal(r.status,200);
  assert.equal((await r.json()).verifiedStatus,'unable_to_verify');assert.equal(writes[0].verifiedStatus,'unable_to_verify');
});
test('Verify route cannot resolve from failed relevant scan',async()=>{
  rows[2].auditStatuses.performance.status='failed';
  assert.equal((await (await POST(request('js-overhead'))).json()).verifiedStatus,'unable_to_verify');
});
test('Verify route rejects anonymous and cross-user private access without persistence',async()=>{
  for(viewer of [null,'other']) { assert.ok([401,403].includes((await POST(request('js-overhead'))).status)); }
  assert.equal(writes.length,0);
});
test('Verify route preserves signed-in access to public report pairs',async()=>{
  viewer='other';rows[1].isPublic=true;rows[2].isPublic=true;
  assert.equal((await POST(request('js-overhead'))).status,200);
});
test('Verify route rejects reversed, same-date and unknown-date comparisons',async()=>{
  for(const createdAt of ['2026-10-01T00:00:00Z',rows[1].createdAt,undefined,null]) {
    rows[2].createdAt=createdAt;const r=await POST(request('js-overhead'));assert.equal(r.status,422);
    assert.equal((await r.json()).verifiedStatus,'unable_to_verify');
  }assert.equal(writes.length,0);
});

test('Verify route preserves sub-second database Date ordering', async()=>{
  rows[1].createdAt=new Date('2026-11-02T00:00:00.100Z');
  rows[2].createdAt=new Date('2026-11-02T00:00:00.200Z');
  assert.equal((await POST(request('js-overhead'))).status,200);
});

test('Progress comparison uses the viewed report and an older scan, not the newest report',()=>{
  const scans=[{id:3,createdAt:'2026-11-03'}, {id:2,createdAt:'2026-11-02'}, {id:1,createdAt:'2026-11-01'}];
  assert.deepEqual(selectComparisonPair(scans,2,1),{current:scans[1],previous:scans[2]});
  assert.deepEqual(selectComparisonPair(scans,2,0),{current:scans[1],previous:scans[2]});
  assert.deepEqual(selectComparisonPair(scans,999,1),{current:null,previous:null});
  assert.deepEqual(selectComparisonPair(scans,1,0),{current:scans[2],previous:null});
});
test('A recommendation with replacement failing findings is not marked fully resolved',()=>{
  const currentRec=rec(['lh:render-blocking-resources']);
  const c=compareScans(rows[1],{...rows[2],issues:[issue('lh:render-blocking-resources')],recommendations:[currentRec]});
  assert.equal(deriveVerifiedStatus('js-overhead',c),'partially_resolved');
  assert.equal(deriveVerifiedStatus('lh:unused-javascript',c),'likely_resolved');
});
test('A still-present recommendation with untraceable current evidence cannot resolve',()=>{
  const c=compareScans(rows[1],{...rows[2],recommendations:[rec([])]});
  assert.equal(deriveVerifiedStatus('js-overhead',c),'unable_to_verify');
});
