import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {detectPlatform,getDetectedPlatform,formatPlatformContext,normalizeSitePurpose} from '../lib/platform.js';
import {runAiSummary} from '../lib/analyzers/ai.js';
import {derivePlanFingerprint,generateGuidancePlan} from '../lib/guidance.js';
const html=value=>`<head><meta content="${value}" name="generator"></head><body></body>`;
beforeEach(()=>{process.env.ANTHROPIC_API_KEY='phase2-fake'});
for(const name of ['WordPress','Shopify','Wix','Webflow','Squarespace','Drupal','Joomla','Ghost'])test(`${name} requires an explicit observed generator`,()=>{
  const r=detectPlatform(html(name+' 1.0'));assert.equal(r.name,name);assert.equal(r.source,'html-generator');
});
test('Case, attribute order and unquoted attributes are supported',()=>{
  assert.equal(detectPlatform('<HEAD><META NAME=generator CONTENT=WordPress></HEAD>').name,'WordPress');
});
for(const input of [
  '<head><!-- <meta name="generator" content="WordPress"> --></head>',
  '<head><script>const x=\'<meta name="generator" content="WordPress">\';</script></head>',
  '<head><script>const x=\'<meta name="generator" content="WordPress">',
  '<head><template><meta name="generator" content="WordPress"></template></head>',
  '<head></head><body><meta name="generator" content="WordPress"></body>',
  '<head><title>WordPress consulting</title></head><body><img src="https://elsewhere.test/wp-content/logo.png"></body>',
  html('Marketing'),html('SaaS'),html('Unknown builder'),
])test('Purpose, mentions, assets and non-page metadata do not identify a CMS: '+input.slice(0,55),()=>{
  assert.equal(detectPlatform(input),null);
});
test('Conflicting generator evidence stays unknown',()=>{
  assert.equal(detectPlatform('<head><meta name="generator" content="WordPress"><meta name="generator" content="Drupal"></head>'),null);
});
test('Failed scans and unsupported legacy siteType fields cannot become platform evidence',()=>{
  const platform=detectPlatform(html('WordPress'));
  assert.equal(getDetectedPlatform({status:'fetch_failed',platform}),null);
  assert.equal(getDetectedPlatform({status:'completed',platform:{name:'WordPress'}}),null);
  assert.equal(getDetectedPlatform({status:'completed',siteType:'WordPress'}),null);
  assert.equal(normalizeSitePurpose('WordPress'),null);assert.equal(normalizeSitePurpose('SaaS'),'SaaS');
});
test('Platform context distinguishes observed evidence from server/installed-version guarantees',()=>{
  const context=formatPlatformContext(detectPlatform(html('WordPress 6.7')));
  assert.match(context,/OBSERVED PLATFORM: WordPress/);assert.match(context,/not proof/);
  assert.match(formatPlatformContext(null),/platform-neutral/);
});
test('Summary separates a purpose category from measured platform evidence',async()=>{
  let prompt;
  global.fetch=async(u,o)=>{prompt=JSON.parse(o.body).messages[0].content;return Response.json({content:[{type:'text',text:'{"summary":"Measured scan summary","siteType":"WordPress"}'}]})};
  const r=await runAiSummary({url:'https://site.test',scores:{},issues:[],seoData:{status:'completed',checks:{},platform:detectPlatform(html('WordPress'))}});
  assert.equal(r.siteType,null);assert.match(prompt,/Observed CMS\/platform: WordPress/);
});
test('Guidance rejects a bare legacy platform/purpose string and invalidates old prompt-version plans',async()=>{
  const rec={fingerprint:'js-overhead',evidence:{tbt:'120 ms'},actions:[]};
  assert.notEqual(derivePlanFingerprint(rec),'b9dce397'); // Exact fingerprint produced by the audited prior implementation for this fixture.
  let prompt;global.fetch=async(u,o)=>{prompt=JSON.parse(o.body).messages[0].content;return Response.json({content:[{type:'text',text:'{"evidenceSummary":"Measured blocking time.","steps":[{"title":"Review scripts","owner":{"action":"Review"},"developer":{"action":"Review"}}]}'}]})};
  await generateGuidancePlan(rec,'site.test','cms-admin','WordPress');
  assert.match(prompt,/PLATFORM: Not identified/);assert.ok(!prompt.includes('OBSERVED PLATFORM: WordPress'));
  assert.ok(!prompt.includes('120 ms ms'));
});
