import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeVisionImage,decodeScreenshotBase64,readScreenshotResponse,MAX_IMAGE_INPUT_BYTES,MAX_IMAGE_OUTPUT_BYTES,MAX_VISION_EDGE} from '../lib/vision-image.js';
import {runVisionAnalysis} from '../lib/analyzers/vision.js';
const image=(width,height)=>sharp({create:{width,height,channels:3,background:'#336699'}}).png().toBuffer();
beforeEach(()=>{process.env.ANTHROPIC_API_KEY='phase2-fake';});
test('Tall Lighthouse screenshot becomes a bounded image with disclosed coverage',async()=>{
  const r=await normalizeVisionImage(await image(412,12000));
  const m=await sharp(r.data).metadata();
  assert.equal(m.format,'jpeg');assert.ok(m.width<=MAX_VISION_EDGE&&m.height<=MAX_VISION_EDGE);
  assert.ok(r.data.length<=MAX_IMAGE_OUTPUT_BYTES);assert.equal(r.image.coverage,'top-of-page');
  assert.equal(r.image.originalHeight,12000);assert.ok(m.width>=300);
});
test('Normal screenshot preserves full-image coverage and aspect ratio without enlargement',async()=>{
  const r=await normalizeVisionImage(await image(400,800));
  assert.equal(r.image.coverage,'full-image');assert.equal(r.image.width,400);assert.equal(r.image.height,800);
});
test('Huge width is normalized, not sent as-is',async()=>{
  const r=await normalizeVisionImage(await image(9000,500));
  assert.ok(r.image.width<=MAX_VISION_EDGE);assert.equal(r.image.coverage,'full-image');
});
test('Malformed, non-image, and oversized base64 is rejected before AI',async()=>{
  for(const value of ['!bad','',Buffer.from('<svg/>').toString('base64')]){
    let calls=0;global.fetch=async()=>{calls++;throw Error('must not call AI')};
    assert.equal(await runVisionAnalysis({url:'https://site.test',imageBase64:value,imageMediaType:'image/png'}),null);
    // Empty input uses the existing capture fallback; malformed supplied input does not.
    if(value)assert.equal(calls,0);
  }
  assert.throws(()=>decodeScreenshotBase64('A'.repeat(Math.ceil(MAX_IMAGE_INPUT_BYTES/3)*4+4)));
});
test('Bounded screenshot downloads reject both declared and streamed oversize bodies',async()=>{
  await assert.rejects(readScreenshotResponse(new Response('x',{headers:{'content-length':String(MAX_IMAGE_INPUT_BYTES+1)}})),/input limit/);
  const chunk=new Uint8Array(1024*1024);let sent=0,cancelled=false;
  const stream=new ReadableStream({pull(controller){sent++;controller.enqueue(chunk)},cancel(){cancelled=true}});
  await assert.rejects(readScreenshotResponse(new Response(stream)),/input limit/);assert.ok(cancelled);assert.ok(sent<25);
});
test('Vision uploads the exact normalized image returned for the annotation overlay',async()=>{
  const original=await image(412,12000);let request;
  global.fetch=async(u,o)=>{request=JSON.parse(o.body);return Response.json({stop_reason:'end_turn',content:[{type:'thinking'},{type:'text',text:'{"annotations":[{"x":0.5,"y":0.5,"label":"Visible item"}]}'}]})};
  const r=await runVisionAnalysis({url:'https://site.test',imageBase64:original.toString('base64'),imageMediaType:'image/png'});
  const uploaded=request.messages[0].content[0].source;
  assert.equal(uploaded.media_type,'image/jpeg');assert.equal(r.screenshotUrl,'data:image/jpeg;base64,'+uploaded.data);
  assert.equal(r.annotations[0].y,.5);assert.equal(r.image.coverage,'top-of-page');
  assert.match(request.messages[0].content[1].text,/Only the top portion/);
});
test('Microlink fallback uses the same image normalization path',async()=>{
  const original=await image(9000,500);let calls=0,source;
  global.fetch=async(u,o)=>{
    calls++;if(calls===1)return Response.json({data:{screenshot:{url:'https://image.test/screenshot.png'}}});
    if(calls===2)return new Response(original,{headers:{'content-type':'image/png'}});
    source=JSON.parse(o.body).messages[0].content[0].source;
    return Response.json({content:[{type:'text',text:'{"annotations":[]}'}]});
  };
  const r=await runVisionAnalysis({url:'https://site.test'});assert.equal(calls,3);
  assert.equal(source.media_type,'image/jpeg');assert.ok(r.image.width<=MAX_VISION_EDGE);
});

test('EXIF orientation is applied before dimensions/overlay image are finalized',async()=>{
  const bytes=await sharp({create:{width:400,height:800,channels:3,background:'#336699'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const r=await normalizeVisionImage(bytes);
  assert.equal(r.image.originalWidth,800);assert.equal(r.image.originalHeight,400);
  assert.equal(r.image.width,800);assert.equal(r.image.height,400);
  assert.equal((await sharp(r.data).metadata()).orientation,undefined);
});
