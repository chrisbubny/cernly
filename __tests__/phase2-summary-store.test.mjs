import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
let row={id:1,slug:'slug',scores:{},issues:[]},lastInsert;
mock.module('pg',{namedExports:{Pool:class {async query(sql,params){
  if(sql.includes('INSERT INTO reports')){lastInsert={sql,params};row.ai_insights=params[8];return {rows:[{id:1,slug:'slug'}]}}
  return {rows:[row]};
}}}});
const {saveReport,getReportBySlug}=await import('../lib/store.js');
test('Summary provenance survives real store save/read via existing JSONB',async()=>{
  const meta={status:'fallback',reason:'timeout',durationMs:20};
  await saveReport({url:'https://site.test',scores:{performance:50},issues:[],aiSummary:'Measured summary',aiSummaryMeta:meta});
  assert.deepEqual(JSON.parse(lastInsert.params[8]).summaryMeta,meta);
  assert.deepEqual((await getReportBySlug('slug')).aiSummaryMeta,meta);
  assert.ok(!/ALTER|CREATE/.test(lastInsert.sql));
});
test('Legacy arrays and rows without provenance remain readable',async()=>{
  for(const old of [null,[],{discoveries:[]}]){row.ai_insights=old;assert.equal((await getReportBySlug('slug')).aiSummaryMeta,null)}
});
