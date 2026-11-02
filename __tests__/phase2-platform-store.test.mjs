import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {detectPlatform} from '../lib/platform.js';
let row={id:1,slug:'slug',scores:{},issues:[]};
mock.module('pg',{namedExports:{Pool:class {async query(sql,p){
  if(sql.includes('INSERT INTO reports')){row={...row,site_type:p[4],seo_data:p[10]};return {rows:[{id:1,slug:'slug'}]}}
  return {rows:[row]};
}}}});
const {saveReport,getReportBySlug}=await import('../lib/store.js');
test('Observed platform and site purpose persist independently in existing columns/JSON',async()=>{
  const platform=detectPlatform('<head><meta name="generator" content="WordPress 6.7"></head>');
  await saveReport({url:'https://site.test',scores:{},issues:[],siteType:'Marketing',seoData:{status:'completed',platform}});
  const r=await getReportBySlug('slug');assert.equal(r.siteType,'Marketing');assert.deepEqual(r.platform,platform);
});
test('Legacy CMS-shaped siteType values are not accepted as purpose or platform evidence',async()=>{
  row={...row,site_type:'WordPress',seo_data:null};
  const r=await getReportBySlug('slug');assert.equal(r.siteType,null);assert.equal(r.platform,null);
});
