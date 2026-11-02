import {test,mock,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {detectPlatform} from '../lib/platform.js';
let report,prompt,cached,aiCalls,save;
const rec={fingerprint:'js-overhead',evidence:{tbt:'120 ms'},actions:[]};
mock.module('@clerk/nextjs/server',{namedExports:{auth:async()=>({userId:'owner'})}});
mock.module(new URL('../lib/store.js',import.meta.url).href,{namedExports:{
  getReport:async()=>structuredClone(report),getReportBySlug:async()=>structuredClone(report),
  getRecommendationsByReport:async()=>[rec],reserveAskSlot:async()=>({allowed:true}),
  ensureGuidanceColumns:async()=>{},getGuidancePlan:async()=>cached,
  setGuidancePlan:async(a,b,c,plans)=>{save=plans},
}});
const ask=await import('../app/api/ask/route.js');
const guide=await import('../app/api/guide-plan/route.js');
const request=(body)=>new Request('https://cernly.test/api/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reportId:'slug',...body})});
beforeEach(()=>{
  process.env.ANTHROPIC_API_KEY='phase2-fake';cached=null;aiCalls=0;save=null;
  report={id:1,userId:'owner',url:'https://site.test',siteType:'Marketing',issues:[],scores:{},seoData:{status:'completed'}};
  global.fetch=async(u,o)=>{aiCalls++;const body=JSON.parse(o.body);prompt=body.system||body.messages[0].content;
    return Response.json({content:[{type:'text',text:body.system?'Measured response':'{"evidenceSummary":"Measured blocking time.","steps":[{"title":"Review scripts","owner":{"action":"Review"},"developer":{"action":"Review"}}]}'}]})};
});
for(const legacy of ['Marketing','SaaS','WordPress'])test(`Ask does not treat legacy ${legacy} as a platform`,async()=>{
  report.siteType=legacy;
  assert.equal((await ask.POST(request({question:'Which platform is this?'}))).status,200);
  assert.match(prompt,/PLATFORM: Not identified/);assert.ok(!prompt.includes('confirmed platform'));assert.ok(!prompt.includes('running '+legacy));
});
test('Ask receives the measured CMS declaration independently of site purpose',async()=>{
  report.seoData.platform=detectPlatform('<head><meta name="generator" content="WordPress 6.7"></head>');
  assert.equal((await ask.POST(request({question:'How do I do this in my CMS?'}))).status,200);
  assert.match(prompt,/OBSERVED PLATFORM: WordPress/);assert.match(prompt,/WordPress 6.7/);
  assert.match(prompt,/Site purpose category \(AI estimate\): Marketing/);
});
test('Guided Fix uses observed CMS evidence and refreshes old prompt-version cache entries',async()=>{
  report.seoData.platform=detectPlatform('<head><meta name="generator" content="WordPress 6.7"></head>');
  cached={plan:{'cms-admin':{planFingerprint:'b9dce397',evidenceSummary:'Old unsupported assumptions',steps:[]}}};
  const r=await guide.POST(request({recFingerprint:rec.fingerprint,persona:'cms-admin'}));
  assert.equal(r.status,200);assert.equal((await r.json()).cached,false);assert.equal(aiCalls,1);
  assert.match(prompt,/OBSERVED PLATFORM: WordPress/);assert.match(prompt,/WordPress admin guidance/);
  assert.ok(!prompt.includes('cannot be set by a WordPress plugin'));
  cached={plan:save};
  assert.equal((await (await guide.POST(request({recFingerprint:rec.fingerprint,persona:'cms-admin'}))).json()).cached,true);
  assert.equal(aiCalls,1);
});
test('Guided Fix without observed CMS evidence remains platform-neutral',async()=>{
  assert.equal((await guide.POST(request({recFingerprint:rec.fingerprint,persona:'cms-admin'}))).status,200);
  assert.match(prompt,/PLATFORM: Not identified/);assert.ok(!prompt.includes('WordPress admin guidance'));
});
