import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
let resolveSummary,summaryStarted=false,enrichmentStarted=false,saved;
mock.module('@clerk/nextjs/server',{namedExports:{auth:async()=>({userId:'owner'})}});
for(const [name,fn] of [['lighthouse','runLighthouse'],['seo','runSeoAudit'],['ssl','runSslCheck'],['a11y','runA11yCheck']]) {
  mock.module(new URL(`../lib/analyzers/${name}.js`,import.meta.url).href,{namedExports:{[fn]:async()=>({performance:80,score:80,issues:[]})}});
}
mock.module(new URL('../lib/analyzers/ai.js',import.meta.url).href,{namedExports:{
  runAiSummary:async()=>{summaryStarted=true;return new Promise(resolve=>{resolveSummary=resolve})},runAssessment:async()=>null,
}});
mock.module(new URL('../lib/recommendations.js',import.meta.url).href,{namedExports:{
  generateRecommendations:async()=>{enrichmentStarted=true;assert.ok(summaryStarted);resolveSummary({aiSummary:'Fallback',aiSummaryMeta:{status:'fallback',reason:'timeout'}});return []},
}});
mock.module(new URL('../lib/store.js',import.meta.url).href,{namedExports:{
  getUserSubscription:async()=>null,getMonthlyScansCount:async()=>0,tryScanLock:async()=>({release:async()=>{}}),
  saveReport:async report=>{saved=report;return {id:1,slug:'slug'}},saveRecommendations:async()=>{},
  ensureRecommendationsTable:async()=>{},ensureAssessmentColumns:async()=>{},updateReportAssessment:async()=>{},FREE_SCAN_LIMIT:3,PRO_SCAN_LIMIT:15,
}});
const {POST}=await import('../app/api/analyze/route.js');
test('Enrichment starts before Summary completes; fallback does not discard or block measured report',{timeout:1000},async()=>{
  const r=await POST(new Request('https://cernly.test/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://site.test'})}));
  assert.equal(r.status,200);assert.ok(enrichmentStarted);
  assert.equal(saved.scores.performance,80);assert.equal(saved.aiSummaryMeta.reason,'timeout');
  assert.equal((await r.json()).aiSummaryMeta.status,'fallback');
});
