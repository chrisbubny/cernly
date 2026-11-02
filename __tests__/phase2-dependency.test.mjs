import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {extractDependencyEvidence} from '../lib/lighthouse-evidence.js';
import {formatEvidenceItems} from '../lib/scan-evidence.js';
import {runLighthouse} from '../lib/analyzers/lighthouse.js';
import {assignIssueFingerprintIds} from '../lib/scoring.js';
import {buildBaseRecommendations} from '../lib/recommendations.js';
import {generateGuidancePlan} from '../lib/guidance.js';
const tree={type:'network-tree',longestChain:{duration:812},chains:{root:{url:'https://site.test/',navStartToEndTime:100,transferSize:1000,children:{script:{url:'https://cdn.test/app.js?v=1',navStartToEndTime:812,transferSize:5000,isLongest:true}}}}};
beforeEach(()=>{process.env.ANTHROPIC_API_KEY='phase2-fake';});
test('Current nested Lighthouse tree preserves measured timing, bytes and parent relationships',()=>{
  const r=extractDependencyEvidence({type:'list',items:[tree]});
  assert.equal(r.totalDetected,2);assert.equal(r.longestChainMs,812);
  assert.deepEqual(r.items[1],{url:'https://cdn.test/app.js?v=1',requestId:'script',parentRequestId:'root',parentUrl:'https://site.test/',depth:1,chainDurationMs:812,transferSize:5000,isLongest:true});
  assert.equal(r.items[1].wastedMs,undefined);assert.equal(r.evidenceTruncated,false);
});
test('Legacy request timing seconds are converted to duration ms without fabricating path timing',()=>{
  const r=extractDependencyEvidence({type:'criticalrequestchain',chains:{a:{request:{url:'https://site.test/a',startTime:1,endTime:1.25,transferSize:0}}}});
  assert.equal(r.items[0].requestDurationMs,250);assert.equal(r.items[0].transferSize,0);assert.equal(r.items[0].chainDurationMs,undefined);
});
test('Item caps keep an honest total and explicit partial evidence',()=>{
  const chains=Object.fromEntries(Array.from({length:25},(_,i)=>[String(i),{url:`https://site.test/${i}`} ]));
  const r=extractDependencyEvidence({type:'network-tree',chains});
  assert.equal(r.items.length,20);assert.equal(r.totalDetected,25);assert.equal(r.evidenceTruncated,true);
  assert.match(r.evidenceLimitations,/partial/);
});
test('Traversal/depth caps and cycles terminate without inventing a total count',()=>{
  const node={url:'https://site.test/'};node.children={cycle:node};
  const r=extractDependencyEvidence({type:'network-tree',chains:{root:node}});
  assert.equal(r.evidenceTruncated,true);assert.equal(r.totalDetected,null);
  const capped=extractDependencyEvidence({type:'list',items:[tree]},{maxVisited:2});
  assert.equal(capped.totalDetected,null);assert.equal(capped.evidenceTruncated,true);
});
test('Actual Lighthouse output keeps an informative tree after 30 other issues; recommendations preserve its scored evidence',async()=>{
  const failures=Object.fromEntries(Array.from({length:30},(_,i)=>['other-'+i,{score:0,title:'Other issue'}]));
  global.fetch=async()=>Response.json({lighthouseResult:{categories:{performance:{score:.5}},audits:{...failures,
    'network-dependency-tree-insight':{score:0,title:'Network dependency tree',details:{type:'list',items:[tree]}}
  }}});
  const r=await runLighthouse('https://site.test');const found=r.issues.find(i=>i.auditId==='network-dependency-tree-insight');
  assert.equal(found.items.length,2);
  const rec=buildBaseRecommendations(assignIssueFingerprintIds(r.issues),{lhData:r}).find(r=>r.fingerprint==='lh:network-dependency-tree-insight');
  assert.equal(rec.supporting_findings[0].items[1].parentRequestId,'root');
  assert.equal(rec.supporting_findings[0].totalDetected,2);
});
test('Informative null-score dependency audit is evidence, not a critical failure',async()=>{
  global.fetch=async()=>Response.json({lighthouseResult:{categories:{performance:{score:.8}},audits:{'critical-request-chains':{score:null,title:'Request chains',details:tree}}}});
  const r=await runLighthouse('https://site.test');assert.equal(r.issues[0].severity,'info');assert.ok(r.issues[0].items.length);
  assert.equal(r.auditResults['lh:critical-request-chains'].status,'unavailable');
});
test('Guidance receives exact dependency URLs, relationships and measured units from real recommendations',async()=>{
  const ev=extractDependencyEvidence(tree);const issue=assignIssueFingerprintIds([{source:'lighthouse',auditId:'network-dependency-tree-insight',severity:'critical',area:'Performance',message:'Network dependency tree',...ev}]);
  const rec=buildBaseRecommendations(issue,{})[0];let prompt;
  global.fetch=async(u,o)=>{prompt=JSON.parse(o.body).messages[0].content;return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({evidenceSummary:'The measured dependency chain includes app.js.',steps:[{title:'Review dependencies',owner:{action:'Review'},developer:{action:'Review'}}]})}]})};
  await generateGuidancePlan(rec,'site.test','developer',null,{fingerprintId:issue[0].fingerprintId,message:issue[0].message});
  assert.match(prompt,/https:\/\/cdn.test\/app.js\?v=1/);assert.match(prompt,/parentRequestId/);assert.match(prompt,/chainDurationMs/);assert.ok(!prompt.includes('[object Object]'));
});
test('Evidence formatter preserves zero values and explicitly bounds the captured list',()=>{
  const items=extractDependencyEvidence(tree).items;
  const text=formatEvidenceItems(items,{limit:1});assert.match(text,/"depth":0/);assert.match(text,/partial evidence/);
});
