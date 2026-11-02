// Real scan route: verifies analyzer coverage enters the persisted JSON contract.
// Mock all external analyzers/services and persistence; never connect to a DB.
import {test,mock,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
let lighthouse, saved;
const check={status:'passed',category:'accessibility'};
mock.module('@clerk/nextjs/server',{namedExports:{auth:async()=>({userId:'owner'})}});
mock.module(new URL('../lib/analyzers/lighthouse.js',import.meta.url).href,{namedExports:{runLighthouse:async()=>lighthouse}});
mock.module(new URL('../lib/analyzers/seo.js',import.meta.url).href,{namedExports:{runSeoAudit:async()=>({score:90,issues:[],auditResults:{'seo:title_missing':{status:'passed'}}})}});
mock.module(new URL('../lib/analyzers/a11y.js',import.meta.url).href,{namedExports:{runA11yCheck:async()=>({score:null,issues:[],status:'fetch_failed'})}});
mock.module(new URL('../lib/analyzers/ssl.js',import.meta.url).href,{namedExports:{runSslCheck:async()=>({score:80,issues:[],auditResults:{'ssl:http_no_redirect':{status:'unavailable'}}})}});
mock.module(new URL('../lib/analyzers/ai.js',import.meta.url).href,{namedExports:{runAiSummary:async()=>null,runAssessment:async()=>null}});
mock.module(new URL('../lib/recommendations.js',import.meta.url).href,{namedExports:{generateRecommendations:async()=>[]}});
mock.module(new URL('../lib/store.js',import.meta.url).href,{namedExports:{
  getUserSubscription:async()=>null,getMonthlyScansCount:async()=>0,tryScanLock:async()=>({release:async()=>{}}),
  saveReport:async report=>{saved=structuredClone(report);return {id:1,slug:'slug'}},
  saveRecommendations:async()=>{},ensureRecommendationsTable:async()=>{},ensureAssessmentColumns:async()=>{},
  updateReportAssessment:async()=>{},FREE_SCAN_LIMIT:3,PRO_SCAN_LIMIT:15,
}});
const {POST}=await import('../app/api/analyze/route.js');
const request=()=>new Request('https://cernly.test/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://site.test'})});
beforeEach(()=>{lighthouse={performance:80,issues:[],auditResults:{'lh:image-alt':check}};saved=null;});
test('Scan response and saveReport retain per-source coverage in existing scores JSON',async()=>{
  const r=await POST(request());assert.equal(r.status,200);
  const body=await r.json();
  assert.deepEqual(saved.scores.auditStatuses.performance.findingResults,{'lh:image-alt':check});
  assert.equal(saved.scores.auditStatuses.seo.findingResults['seo:title_missing'].status,'passed');
  assert.equal(saved.scores.auditStatuses.accessibility.status,'blocked');
  assert.deepEqual(saved.scores.auditStatuses.accessibility.findingResults,{});
  assert.deepEqual(body.auditStatuses,saved.scores.auditStatuses);
});
test('Null-score Lighthouse result cannot claim completed coverage',async()=>{
  lighthouse={performance:null,issues:[],auditResults:{}};
  const r=await POST(request());assert.equal(r.status,200);
  assert.equal(saved.scores.auditStatuses.performance.status,'unavailable');
});
