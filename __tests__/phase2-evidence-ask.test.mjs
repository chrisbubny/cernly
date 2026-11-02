import {test,mock,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {buildBaseRecommendations} from '../lib/recommendations.js';
let report,recs,request,apiCalls;
const item={url:'https://cdn.test/app.js?v=1',requestId:'child',parentRequestId:'root',parentUrl:'https://site.test/',depth:1,chainDurationMs:812,transferSize:1024};
mock.module('@clerk/nextjs/server',{namedExports:{auth:async()=>({userId:'owner'})}});
mock.module(new URL('../lib/store.js',import.meta.url).href,{namedExports:{
  getReportBySlug:async()=>structuredClone(report),getReport:async()=>structuredClone(report),
  getRecommendationsByReport:async()=>recs,reserveAskSlot:async()=>({allowed:true}),
}});
const {POST}=await import('../app/api/ask/route.js');
beforeEach(()=>{
  process.env.ANTHROPIC_API_KEY='phase2-fake';apiCalls=0;request=null;
  report={id:1,userId:'owner',url:'https://site.test',scores:{},issues:[{fingerprintId:'lh:network-dependency-tree-insight',canonicalFingerprintId:'lh:network-dependency-tree-insight',severity:'critical',source:'lighthouse',area:'Performance',message:'Network dependency tree',items:[item],evidenceLimitations:'Partial capture fixture'}]};
  recs=buildBaseRecommendations(report.issues,{});
  global.fetch=async(u,o)=>{apiCalls++;request=JSON.parse(o.body);return Response.json({content:[{type:'text',text:'Measured answer'}]})};
});
const ask=extra=>POST(new Request('https://cernly.test/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'Explain this dependency',reportId:'slug',...extra})}));
test('Finding focus reaches actual Ask transport with resource URLs, path timing and partial-capture disclosure',async()=>{
  assert.equal((await ask({findingFingerprintId:report.issues[0].fingerprintId})).status,200);
  assert.match(request.system,/https:\/\/cdn.test\/app.js\?v=1/);assert.match(request.system,/"chainDurationMs":812/);
  assert.match(request.system,/"parentRequestId":"root"/);assert.match(request.system,/Partial capture/);
  assert.ok(!request.system.includes('[object Object]'));assert.ok(!request.system.includes('812ms wasted'));
});
test('Informational finding without a recommendation still supplies its own evidence',async()=>{
  recs=[];report.issues[0].severity='info';
  assert.equal((await ask({findingFingerprintId:report.issues[0].fingerprintId})).status,200);
  assert.match(request.system,/"chainDurationMs":812/);
});
test('An element question keeps the selected dependency parent and timing',async()=>{
  assert.equal((await ask({elementContext:item})).status,200);
  assert.match(request.system,/FOCUS ELEMENT/);assert.match(request.system,/"parentRequestId":"root"/);
});
test('Unknown selected finding or unavailable recommendation is disclosed before AI',async()=>{
  assert.equal((await ask({findingFingerprintId:'lh:not-recorded'})).status,422);
  assert.equal(apiCalls,0);recs=[];
  assert.equal((await ask({recFingerprint:'missing-rec'})).status,503);assert.equal(apiCalls,0);
});
