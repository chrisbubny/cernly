// Actual route handlers and access helper; mock only Clerk, persistence, and AI boundaries.
// node --experimental-test-module-mocks --import ./lib/__tests__/alias-loader.mjs --test __tests__/phase1-access.test.mjs
import { mock, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let viewer, authError, report, lookupError, calls, cached, paidSession, annotationSaved, annotationError;
const record = (key, value) => { calls[key] = (calls[key] || 0) + 1; return value; };
const recommendation = { fingerprint: 'js-overhead', evidence: {}, actions: [] };
const storedReport = () => {
  record('lookup');
  if (lookupError) throw new Error('private database detail');
  return report ? structuredClone(report) : null;
};
mock.module('@clerk/nextjs/server', { namedExports: { auth: async () => {
  if (authError) throw new Error('auth unavailable');
  return { userId: viewer };
} } });
mock.module(new URL('../lib/store.js', import.meta.url).href, { namedExports: {
  getReport: async () => storedReport(), getReportBySlug: async () => storedReport(),
  getRecommendationsByReport: async () => record('recommendations', [recommendation]),
  reserveAskSlot: async () => record('quota', { allowed: true, count: 1, limit: 100 }),
  ensureGuidanceColumns: async () => record('schema'),
  getGuidancePlan: async () => record('cacheRead', cached),
  setGuidancePlan: async () => record('cacheWrite'),
  updateReportAnnotations: async () => { record('annotationsWrite'); if (annotationError) throw Error('mock write failure'); return annotationSaved; },
} });
mock.module(new URL('../lib/guidance.js', import.meta.url).href, { namedExports: {
  generateGuidancePlan: async () => record('guidanceAI', { steps: [], planFingerprint: 'fp' }),
  derivePlanFingerprint: () => 'fp',
} });
mock.module(new URL('../lib/analyzers/vision.js', import.meta.url).href, { namedExports: {
  runVisionAnalysis: async () => record('visionAI', { annotations: [] }),
} });
mock.module(new URL('../lib/stripe-session.js', import.meta.url).href, { namedExports: {
  isValidPaidStripeSession: async () => record('stripe', paidSession),
} });
const ask = await import('../app/api/ask/route.js');
const guide = await import('../app/api/guide-plan/route.js');
const vision = await import('../app/api/vision/route.js');
const diagnostic = await import('../app/api/vision-debug/route.js');
const read = await import('../app/api/report/route.js');
const { canReadReport } = await import('../lib/report-access.js');
const request = body => new Request('https://cernly.test/api/test', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const routes = [
  ['Ask', ask.POST, { question: 'What should I fix?', reportId: 'slug' }],
  ['Guided Fix', guide.POST, { recFingerprint: 'js-overhead', reportId: 'slug' }],
  ['Vision', vision.POST, { reportId: 1 }],
];
beforeEach(() => {
  viewer = 'owner'; annotationSaved = true; annotationError = false; authError = false; lookupError = false; calls = {}; cached = null; paidSession = false;
  report = { id: 1, slug: 'slug', userId: 'owner', isPublic: false, url: 'https://private.test', scores: {}, issues: [] };
  process.env.ANTHROPIC_API_KEY = 'phase1-fake';
  delete process.env.BYPASS_SCAN_LIMIT;
  global.fetch = async () => {
    record('askAI');
    return Response.json({ model: 'mock', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Evidence-based answer' }] });
  };
});
const assertNoEffects = () => {
  for (const key of ['quota', 'schema', 'recommendations', 'cacheRead', 'cacheWrite', 'annotationsWrite', 'askAI', 'guidanceAI', 'visionAI']) {
    assert.equal(calls[key] || 0, 0, `${key} must not be reached`);
  }
};
for (const [name, handler, body] of routes) {
  for (const isPublic of [false, true]) {
    test(`${name}: anonymous ${isPublic ? 'public' : 'private'} request cannot generate or write`, async () => {
      viewer = null; report.isPublic = isPublic;
      assert.equal((await handler(request(body))).status, 401);
      assertNoEffects(); assert.equal(calls.lookup || 0, 0);
    });
  }
  test(`${name}: cross-user private report denied before evidence, cache, AI or writes`, async () => {
    viewer = 'other'; report.uxAnnotations = { annotations: [{ label: 'PRIVATE SECRET' }] };
    cached = { plan: { owner: { planFingerprint: 'fp', evidenceSummary: 'PRIVATE SECRET' } } };
    const response = await handler(request(body));
    assert.equal(response.status, 403);
    assert.ok(!(await response.text()).includes('PRIVATE SECRET'));
    assertNoEffects();
  });
  test(`${name}: owner is allowed`, async () => {
    assert.equal((await handler(request(body))).status, 200);
    assert.equal(calls.lookup, 1);
    assert.equal(calls.askAI || calls.guidanceAI || calls.visionAI, 1);
  });
  test(`${name}: signed-in public-report viewer is allowed`, async () => {
    viewer = 'other'; report.isPublic = true;
    assert.equal((await handler(request(body))).status, 200);
  });
  test(`${name}: auth provider errors fail closed`, async () => {
    authError = true;
    assert.equal((await handler(request(body))).status, 401); assertNoEffects();
  });
  test(`${name}: failed lookup fails closed without quota or AI`, async () => {
    lookupError = true;
    const r = await handler(request(body));
    assert.equal(r.status, 503); assertNoEffects();
    assert.ok(!(await r.text()).includes('database detail'));
  });
  test(`${name}: missing report does not call AI`, async () => {
    report = null;
    assert.equal((await handler(request(body))).status, 404); assertNoEffects();
  });
}
test('Vision: authorized cached annotations avoid generation and writes', async () => {
  report.uxAnnotations = { annotations: [{ label: 'Cached' }] };
  const r = await vision.POST(request({ reportId: 1 }));
  assert.equal(r.status, 200); assert.equal((await r.json()).uxAnnotations.annotations[0].label, 'Cached');
  assert.equal(calls.visionAI || 0, 0); assert.equal(calls.annotationsWrite || 0, 0);
});
test('Diagnostic endpoint is disabled even with a report ID', async () => {
  const r = await diagnostic.GET(new Request('https://cernly.test/api/vision-debug?reportId=1'));
  assert.equal(r.status, 404); assert.deepEqual(await r.json(), { error: 'Not found' });
  assertNoEffects(); assert.equal(calls.lookup || 0, 0);
});
test('Public report GET remains available anonymously, including stored annotations', async () => {
  viewer = null; report.isPublic = true; report.uxAnnotations = { annotations: [] };
  const r = await read.GET(new Request('https://cernly.test/api/report?slug=slug'));
  assert.equal(r.status, 200); assert.equal((await r.json()).isOwner, false);
});
test('Private report GET denies cross-user and anonymous access', async () => {
  for (viewer of ['other', null]) {
    assert.equal((await read.GET(new Request('https://cernly.test/api/report?slug=slug'))).status, 403);
  }
  assert.equal(calls.recommendations || 0, 0);
});
test('Existing validated checkout read exception remains intact', async () => {
  viewer = null; paidSession = true;
  assert.equal((await read.GET(new Request('https://cernly.test/api/report?slug=slug&session_id=paid'))).status, 200);
  paidSession = false;
  assert.equal((await read.GET(new Request('https://cernly.test/api/report?slug=slug&session_id=invalid'))).status, 403);
});
test('Report policy does not confuse anonymous viewer with missing owner', () => {
  assert.equal(canReadReport({ userId: null, isPublic: false }, null), false);
});

test('Vision: revoked access during AI generation cannot return or save new annotations', async () => {
  annotationSaved = false;
  const r = await vision.POST(request({ reportId: 1 }));
  assert.equal(r.status, 403); assert.equal(calls.annotationsWrite, 1);
  assert.equal((await r.json()).uxAnnotations, undefined);
});
test('Vision: persistence failure is an honest unavailable response', async () => {
  annotationError = true;
  const r = await vision.POST(request({ reportId: 1 }));
  assert.equal(r.status, 503); assert.equal((await r.json()).uxAnnotations, undefined);
});
