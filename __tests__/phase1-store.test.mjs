// Real store mapping and SQL invocation, fake pg transport (no database connection).
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
let queries=[]; let updateAllowed=true;
const coverage={performance:{status:'completed',findingResults:{'lh:image-alt':{status:'passed',category:'accessibility'}}}};
const row={id:1,slug:'slug',url:'https://site.test',user_id:'owner',is_public:false,
  scores:JSON.stringify({performance:80,auditStatuses:coverage}),
  issues:JSON.stringify([{fingerprintId:'lh:image-alt:2',canonicalFingerprintId:'lh:image-alt',area:'Accessibility'}])};
mock.module('pg',{namedExports:{Pool:class {async query(sql,params){queries.push({sql,params});return {rows:sql.includes('FROM recommendations') || (sql.startsWith('UPDATE') && !updateAllowed)?[]:[row]}}}}});
const {getReportBySlug,getReportsByDomainFull,updateReportAnnotations}=await import('../lib/store.js');
test('Full report mapping preserves per-check coverage from scores JSON',async()=>{
  const r=await getReportBySlug('slug');assert.deepEqual(r.auditStatuses,coverage);
  assert.equal(r.issues[0].canonicalFingerprintId,'lh:image-alt');
  assert.equal(r.scores.auditStatuses,undefined);
});
test('Slim comparison history preserves coverage and canonical identity without schema changes',async()=>{
  queries=[];const r=await getReportsByDomainFull('https://site.test','owner');
  assert.deepEqual(r[0].auditStatuses,coverage);
  assert.equal(r[0].issues[0].canonicalFingerprintId,'lh:image-alt');
  assert.ok(queries.every(q=>!/(ALTER|CREATE|UPDATE|INSERT|DELETE)/.test(q.sql)));
});

test('Annotation writes atomically require owner or currently public sharing', async()=>{
  queries=[]; updateAllowed=true;
  assert.equal(await updateReportAnnotations(1,{annotations:[]},'viewer'),true);
  assert.match(queries[0].sql,/user_id = \$3 OR is_public = TRUE/);
  assert.equal(queries[0].params[2],'viewer');
  updateAllowed=false;
  assert.equal(await updateReportAnnotations(1,{annotations:[]},'viewer'),false);
});
test('Anonymous annotation writes do not reach persistence', async()=>{
  queries=[];
  assert.equal(await updateReportAnnotations(1,{annotations:[]},null),false);
  assert.equal(queries.length,0);
});
