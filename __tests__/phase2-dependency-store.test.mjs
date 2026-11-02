import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {extractDependencyEvidence} from '../lib/lighthouse-evidence.js';
import {buildBaseRecommendations} from '../lib/recommendations.js';
let reportRow,recRow;
async function query(sql,p){
  if(sql.includes('INSERT INTO reports')){reportRow={id:1,slug:'slug',url:p[0],scores:p[1],issues:p[2]};return {rows:[{id:1,slug:'slug'}]}}
  if(sql.includes('INSERT INTO recommendations')){recRow={id:1,report_id:p[0],user_id:p[1],fingerprint:p[2],group_key:p[3],rec_type:p[4],title:p[5],category:p[8],priority:p[9],finding_fingerprints:p[10],supporting_findings:p[11],evidence:p[12]}}
  if(sql.includes('SELECT * FROM reports'))return {rows:[reportRow]};
  if(sql.includes('SELECT * FROM recommendations'))return {rows:[recRow]};
  return {rows:[]};
}
mock.module('pg',{namedExports:{Pool:class {query=query;async connect(){return {query,release(){}}}}}});
const {saveReport,getReportBySlug,saveRecommendations,getRecommendationsByReport}=await import('../lib/store.js');
test('Actual report and recommendation serialization preserve dependency relationships and partial flags',async()=>{
  const ev=extractDependencyEvidence({type:'network-tree',chains:{a:{url:'https://site.test/',children:{b:{url:'https://cdn.test/app.js',navStartToEndTime:90}}}}},{maxItems:1});
  const issue={fingerprintId:'lh:network-dependency-tree-insight',severity:'critical',message:'Network dependency tree',...ev};
  const recs=buildBaseRecommendations([issue],{});
  await saveReport({url:'https://site.test/',scores:{},issues:[issue]});
  await saveRecommendations(1,'owner',recs);
  const loaded=await getReportBySlug('slug');
  assert.deepEqual(loaded.issues[0].items,issue.items);assert.equal(loaded.issues[0].evidenceTruncated,true);
  const rows=await getRecommendationsByReport(1);
  assert.deepEqual(rows[0].supporting_findings[0].items,issue.items);
  assert.equal(rows[0].supporting_findings[0].evidenceTruncated,true);
  assert.equal(rows[0].supporting_findings[0].totalDetected,2);
});
