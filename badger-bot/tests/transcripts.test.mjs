import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx,env) { this.ctx=ctx; this.env=env; } }') };
  return next(specifier, context);
}});
const { fetchTranscript, describeTranscript } = await import('../src/youtube.ts');
const { TranscriptCache } = await import('../src/transcript-cache.ts');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const id = '-7eLTR5N7D8';
const success = { ok:true, videoId:id, language:'English', generated:false, text:'Test caption.', truncated:false };
function cache(state) {
  const storage = { state, alarm:0, async get() { return this.state; }, async put(_,v) { this.state=structuredClone(v); }, async setAlarm(t) { this.alarm=t; }, async deleteAll() { this.state=undefined; } };
  return { storage, object:new TranscriptCache({storage}, {PUBLIC_URL:'https://example.test', DISCORD_BOT_TOKEN:'test-only'}) };
}

test('questions and prefetch respect existing scheduled cooldown', async () => {
  const next=Date.now()+60_000;
  const {object,storage}=cache({readerVersion:'modern-panel-v1',videoId:id,attempts:3,lastFailure:'blocked by YouTube (rate limited)',settledAt:Date.now(),nextAttemptAt:next});
  globalThis.fetch=async()=>{throw new Error('must not fetch during cooldown');};
  const result=await object.get(id); await object.prefetch(id); await object.alarm();
  assert.equal(result.retryAt,next); assert.equal(storage.state.attempts,3); assert.equal(storage.alarm,next);
});
test('current-reader failures without nextAttemptAt retain cooldown', async()=>{
  const now=Date.now();const {object}=cache({readerVersion:'modern-panel-v1',videoId:id,attempts:3,lastFailure:'rate limited',settledAt:now});
  globalThis.fetch=async()=>{throw new Error('unexpected fetch');};
  assert.equal((await object.get(id)).retryAt,now+3600000);
});
test('concurrent prefetch and questions perform one fetch and reuse success',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json(success);};
  const {object,storage}=cache();
  const [a,b]=await Promise.all([object.get(id),object.get(id),object.prefetch(id)]);
  assert.deepEqual(a,success);assert.deepEqual(b,success);assert.equal(calls,1);
  assert.deepEqual(await object.get(id),success);assert.equal(calls,1);assert.equal(storage.state.attempts,1);
});
test('expired cache is refreshed even when its cleanup alarm has not fired',async()=>{
  globalThis.fetch=async()=>Response.json(success);
  const {object,storage}=cache({videoId:id,transcript:{...success,text:'Old'},settledAt:Date.now()-31*86400000,attempts:5});
  assert.equal((await object.get(id)).text,'Test caption.');assert.equal(storage.state.attempts,1);
});
test('failures schedule a retry and repeated requests do not reset it',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:false,videoId:id,reason:'blocked by YouTube (rate limited)'});};
  const {object,storage}=cache();const a=await object.get(id);const b=await object.get(id);
  assert.equal(calls,1);assert.equal(a.retryAt,b.retryAt);assert.equal(storage.alarm,a.retryAt);
  assert.match(describeTranscript(b),/retry scheduled/);
});

const { messageVideoIds, videosToRead } = await import('../src/youtube.ts');
const forwardedVideo = 'es4FfRU8saQ';
const forward = { id:'123',content:'',embeds:[],message_snapshots:[{message:{content:'https://m.youtube.com/watch?v=es4FfRU8saQ&ra=m',embeds:[{url:'https://www.youtube.com/watch?v=es4FfRU8saQ'}]}}] };
test('the forwarded mobile link from the screenshot reaches the transcript loader',()=>{
 assert.deepEqual(messageVideoIds(forward),[forwardedVideo]);
 assert.deepEqual(videosToRead([forward,{id:'124',content:'@Badger what is this video about?'}],'124','',2),[{messageId:'123',id:forwardedVideo}]);
});
test('embed-only forwards are supported and completed transcripts stay skipped',()=>{
 const embedded={...forward,message_snapshots:[{message:{content:'',embeds:[{url:'https://youtu.be/es4FfRU8saQ'}]}}]};
 assert.deepEqual(messageVideoIds(embedded),[forwardedVideo]);
 assert.deepEqual(videosToRead([embedded],'124',`[Transcript of YouTube video https://youtu.be/${forwardedVideo} (en): text]`,2),[]);
});

const { panelParams, parsePanelTranscript } = await import('../src/youtube-panel.ts');
const panel = { content: { items: [
 { transcriptSegmentViewModel: { timestamp:'0:02',simpleText:'Second sentence.' } },
 { transcriptSegmentViewModel: { timestamp:'0:00',simpleText:'First sentence.' } },
 { transcriptSegmentViewModel: { timestamp:'0:02',simpleText:'Second sentence.' } },
 { transcriptSegmentRenderer: {startMs:'3000',snippet:{runs:[{text:'Legacy '},{text:'segment.'}]}} }
] } };
test('modern panel parser orders segments, accepts legacy segments, and removes only exact duplicates',()=>{
 const result=parsePanelTranscript(id,panel);
 assert.equal(result.ok,true);assert.equal(result.text,'First sentence. Second sentence. Legacy segment.');
 assert.equal(result.generated,undefined);assert.match(result.language,/not specified/);
});
test('modern panel success is not inferred from metadata or an empty response',()=>{
 assert.equal(parsePanelTranscript(id,{title:'Video title',description:'Not a transcript'}).ok,false);
 assert.equal(parsePanelTranscript(id,{error:{message:'unavailable'}}).ok,false);
});
test('panel params encode the actual video and reject arbitrary input',()=>{
 const raw=Buffer.from(panelParams(forwardedVideo),'base64url');
 assert.equal(raw.subarray(5,16).toString(),forwardedVideo);
 assert.deepEqual([...raw.subarray(0,5)],[170,9,15,10,11]);
 assert.throws(()=>panelParams('../not-a-video'));
});
test('production fetch uses the modern panel directly, without a watch page or browser',async()=>{
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(new URL(url).pathname,'/youtubei/v1/get_panel');
  const request=JSON.parse(options.body);
  assert.equal(request.panelId,'PAmodern_transcript_view');
  assert.equal(request.params,panelParams(id));assert.equal(request.context.client.clientName,'WEB');
  assert.equal(options.method,'POST');assert.equal(options.headers.Cookie,undefined);
  return Response.json(panel);
 };
 const result=await fetchTranscript(id);assert.equal(result.ok,true);assert.equal(calls,1);
});
test('invalid IDs do not call YouTube and HTTP failures remain failures',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429});};
 assert.equal((await fetchTranscript('invalid')).ok,false);assert.equal(calls,0);
 assert.match((await fetchTranscript(id)).reason,/HTTP 429/);assert.equal(calls,1);
});
test('long transcripts are explicitly marked as truncated',()=>{
 const result=parsePanelTranscript(id,{transcriptSegmentViewModel:{simpleText:'x'.repeat(120001),timestamp:'0:00'}});
 assert.equal(result.text.length,120000);assert.equal(result.truncated,true);
});
test('failures saved by the obsolete reader are retried immediately once',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(success);};
 const {object,storage}=cache({videoId:id,attempts:8,lasting:true,lastFailure:'no captions',settledAt:Date.now(),nextAttemptAt:Date.now()+86400000});
 assert.equal((await object.get(id)).ok,true);assert.equal(calls,1);
 assert.equal(storage.state.readerVersion,'modern-panel-v1');
 assert.equal((await object.get(id)).ok,true);assert.equal(calls,1);
});
