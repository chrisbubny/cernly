// Real analyzers, with only network transport replaced. No database or live AI.
import {test,mock,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
let html,blocked;
mock.module(new URL('../lib/proxy-fetch.js',import.meta.url).href,{namedExports:{
  proxyFetch:async()=>new Response(blocked?'':html,{status:blocked?403:200}),
}});
const {runSeoAudit}=await import('../lib/analyzers/seo.js');
const {runA11yCheck}=await import('../lib/analyzers/a11y.js');
const {runSslCheck}=await import('../lib/analyzers/ssl.js');
const {runLighthouse}=await import('../lib/analyzers/lighthouse.js');
const {compareScans}=await import('../lib/comparison.js');
beforeEach(()=>{html='<html lang="en"><head><title>A sufficiently descriptive page title</title><meta name="viewport" content="width=device-width"></head><body></body></html>';blocked=false;});
test('SEO records actual checked passes and failures',async()=>{
  const r=await runSeoAudit('https://site.test');
  assert.equal(r.auditResults['seo:title_missing'].status,'passed');
  assert.equal(r.auditResults['seo:meta_desc_missing'].status,'failed');
  assert.equal(r.auditResults['seo:robots_noindex'].status,'passed');
  assert.equal(r.auditResults['seo:imaginary'],undefined);
});
test('Accessibility records actual checked passes and failures',async()=>{
  html='<html><body><img src="/no-alt.png"></body></html>';
  const r=await runA11yCheck('https://site.test');
  assert.equal(r.auditResults['a11y:images_missing_alt'].status,'failed');
  assert.equal(r.auditResults['a11y:html_lang_missing'].status,'failed');
  assert.equal(r.auditResults['a11y:buttons_missing_label'].status,'passed');
});
test('Blocked HTML analyzers have no positive per-check evidence',async()=>{
  blocked=true;
  for(const run of [runSeoAudit,runA11yCheck]) {
    const r=await run('https://site.test');assert.equal(r.status,'fetch_failed');assert.equal(r.auditResults,undefined);
  }
});
test('Security header fetch failure does not pass header or redirect checks',async()=>{
  global.fetch=async()=>{throw Error('mock timeout')};
  const r=await runSslCheck('https://site.test');
  assert.equal(r.auditResults['ssl:https_missing'].status,'passed');
  assert.equal(r.auditResults['ssl:missing_header_content_security_policy'],undefined);
  assert.equal(r.auditResults['ssl:http_no_redirect'],undefined);
});
test('Security redirect timeout leaves that specific check unverifiable',async()=>{
  global.fetch=async url=>{if(url.startsWith('http:'))throw Error('timeout');return new Response(null,{status:200,headers:{'content-security-policy':"default-src 'self'"}})};
  const r=await runSslCheck('https://site.test');
  assert.equal(r.auditResults['ssl:missing_header_content_security_policy'].status,'passed');
  assert.equal(r.auditResults['ssl:missing_header_x_frame_options'].status,'failed');
  assert.equal(r.auditResults['ssl:http_no_redirect'],undefined);
});
test('An HTTP-to-HTTP redirect is not positive HTTPS redirect evidence',async()=>{
  global.fetch=async url=>new Response(null,{status:url.startsWith('http:')?301:200,headers:{location:'http://site.test/elsewhere'}});
  assert.equal((await runSslCheck('https://site.test')).auditResults['ssl:http_no_redirect'].status,'failed');
});
test('HTTP-only early exit cannot pass checks that did not run',async()=>{
  global.fetch=async()=>{throw Error('must not fetch')};
  const r=await runSslCheck('http://site.test');assert.deepEqual(Object.keys(r.auditResults),['ssl:https_missing']);
  assert.equal(r.auditResults['ssl:https_missing'].status,'failed');
});
test('HTTP error pages do not provide positive security-header evidence',async()=>{
  global.fetch=async()=>new Response(null,{status:503,headers:{'content-security-policy':"default-src 'self'"}});
  assert.equal((await runSslCheck('https://site.test')).auditResults['ssl:missing_header_content_security_policy'].status,'unavailable');
});
test('Lighthouse retains per-audit outcomes beyond issue cap, including manual/error states',async()=>{
  const audits=Object.fromEntries(Array.from({length:32},(_,i)=>['failing-'+i,{score:0,title:'Failure '+i}]));
  Object.assign(audits,{'image-alt':{score:1},manual:{score:null,scoreDisplayMode:'manual'},broken:{score:1,errorMessage:'failed'},approximate:{score:.95}});
  global.fetch=async()=>Response.json({lighthouseResult:{categories:{performance:{score:.6,auditRefs:[]},accessibility:{score:1,auditRefs:[{id:'image-alt'}]}},audits}});
  const r=await runLighthouse('https://site.test');
  assert.equal(r.issues.length,30);assert.equal(r.auditResults['lh:failing-31'].status,'failed');
  assert.deepEqual(r.auditResults['lh:image-alt'],{status:'passed',category:'accessibility'});
  assert.equal(r.auditResults['lh:manual'].status,'unavailable');assert.equal(r.auditResults['lh:broken'].status,'unavailable');
  assert.equal(r.auditResults['lh:approximate'].status,'failed');
  const prior={url:'https://site.test',issues:[{fingerprintId:'lh:failing-31'}]};
  const c=compareScans(prior,{url:prior.url,issues:r.issues,auditStatuses:{performance:{status:'completed',findingResults:r.auditResults}}});
  assert.equal(c.findings.likely_resolved.length,0);assert.equal(c.findings.still_detected.length,1);
});
