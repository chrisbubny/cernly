// Real AI Summary; only Anthropic transport is mocked.
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {runAiSummary,SUMMARY_TIMEOUT_MS} from '../lib/analyzers/ai.js';
const input={url:'https://site.test',scores:{performance:55,seo:90},issues:[]};
beforeEach(()=>{process.env.ANTHROPIC_API_KEY='phase2-fake';});
const response=(text,stop_reason='end_turn')=>Response.json({model:'mock',stop_reason,
  content:[{type:'thinking',thinking:'hidden'},{type:'text',text}]});
test('Compact Summary request uses the longer bounded deadline and smaller output budget',async()=>{
  let request;
  global.fetch=async(u,o)=>{request=JSON.parse(o.body);return response(JSON.stringify({summary:'Measured performance needs work.',discoveries:[]}))};
  const r=await runAiSummary(input);
  assert.equal(r.aiSummaryMeta.status,'completed');assert.equal(r.aiSummaryMeta.reason,null);
  assert.equal(SUMMARY_TIMEOUT_MS,20000);assert.equal(request.max_tokens,2000); // raised from 1600 — verbose worst-case headroom
  assert.match(request.messages[0].content,/Do not invent/);
  assert.ok(r.aiSummaryMeta.durationMs>=0);
});
for(const stage of ['headers','body'])test(`Summary ${stage} stalls stop at the request deadline with a labeled fallback`,async()=>{
  const keepAlive=setTimeout(()=>{},500);
  global.fetch=async(u,o)=>{
    const wait=()=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));
    return stage==='headers'?wait():{ok:true,json:wait};
  };
  try {
    const r=await runAiSummary({...input,timeoutMs:15});
    assert.equal(r.aiSummaryMeta.status,'fallback');assert.equal(r.aiSummaryMeta.reason,'timeout');
    assert.ok(r.aiSummary);assert.equal(r.aiInsights,null);
  }finally{clearTimeout(keepAlive)}
});
for(const [name,fetch,reason] of [
  ['API rejection',async()=>Response.json({error:'no'}, {status:503}),'api_error'],
  ['truncation',async()=>response('{"summary":"partial','max_tokens'),'truncated'],
  ['bad JSON',async()=>response('invalid'),'invalid_json'],
  ['empty output',async()=>response('{}'),'invalid_output'],
  ['null output',async()=>response('null'),'invalid_output'],
])test(`${name} is persisted as fallback provenance, never generated success`,async()=>{
  global.fetch=fetch;const r=await runAiSummary(input);
  assert.deepEqual([r.aiSummaryMeta.status,r.aiSummaryMeta.reason],['fallback',reason]);
});
test('Missing key returns a labeled deterministic summary without external calls',async()=>{
  delete process.env.ANTHROPIC_API_KEY;global.fetch=async()=>{throw Error('must not fetch')};
  const r=await runAiSummary(input);assert.equal(r.aiSummaryMeta.reason,'no_api_key');
});
