import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next) {
  if(specifier==='cloudflare:workers') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class DurableObject { constructor(ctx,env) {this.ctx=ctx;this.env=env;} }')};
  return next(specifier,context);
}});
const {askChatGPT, ChatGPTError}=await import('../src/openai.ts');
const {failureReply}=await import('../src/model-failure.ts');
const {ChatGPTPlan}=await import('../src/chatgpt-plan.ts');
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const code='subscription_sharing_usage_limit_exceeded';
const options={accessToken:'test-only',model:'test',reasoningEffort:'low',instructions:'test',turns:[{role:'user',text:'test'}],webSearch:false,timeoutMs:1000};
function gate() {
 const data=new Map();
 const storage={async get(k){return data.get(k);},async put(k,v){data.set(k,v);}};
 return {data,storage,plan:new ChatGPTPlan({storage},{})};
}
function events(...values) {return new Response(values.map(v=>'data: '+JSON.stringify(v)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});}
test('HTTP quota failure pauses all callers without retrying or claiming a reset time',async()=>{
 const {plan,storage}=gate(); let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({error:{code}},{status:429});};
 await assert.rejects(askChatGPT({...options,usageGate:plan}),e=>e.code===code&&e.status===429);
 const paused=await plan.usagePausedUntil();assert.ok(paused>Date.now());assert.ok(paused<=Date.now()+15*60000);
 const restarted=new ChatGPTPlan({storage},{});
 await assert.rejects(askChatGPT({...options,usageGate:restarted}),e=>e.code==='usage_backoff');
 assert.equal(calls,1);assert.equal(await restarted.usagePausedUntil(),paused);
 const message=failureReply(new ChatGPTError(code));
 assert.match(message,/limit for Badger/);assert.match(message,/https:\/\/chatgpt.com\/settings\/usage/);
 assert.doesNotMatch(message,/used up|few hours/);assert.match(message,/hasn't provided a reset time/);
});
for(const type of ['error','response.failed']) test(type+' quota after streaming discards partial answer and records pause',async()=>{
 const {plan}=gate();let calls=0;
 globalThis.fetch=async()=>{calls++;return events({type:'response.output_text.delta',delta:'misleading partial answer'},type==='error'?{type,error:{code}}:{type,response:{error:{code}}});};
 await assert.rejects(askChatGPT({...options,usageGate:plan}),e=>e.code===code);
 assert.equal(calls,1);assert.ok(await plan.usagePausedUntil()>Date.now());
});
test('after local backoff expires a completed response can succeed',async()=>{
 const {plan,data}=gate();data.set('usagePausedUntil',Date.now()-1);let calls=0;
 globalThis.fetch=async()=>{calls++;return events({type:'response.output_text.delta',delta:'OK'},{type:'response.completed'});};
 assert.equal(await askChatGPT({...options,usageGate:plan}),'OK');assert.equal(calls,1);
});
test('non-quota authentication errors do not pause plan usage',async()=>{
 const {plan}=gate();globalThis.fetch=async()=>Response.json({error:{code:'subscription_sharing_invalid_user'}},{status:401});
 await assert.rejects(askChatGPT({...options,usageGate:plan}),e=>e.code==='subscription_sharing_invalid_user');
 assert.equal(await plan.usagePausedUntil(),0);
});
test('incomplete streams are not reported as successful inference',async()=>{
 globalThis.fetch=async()=>events({type:'response.output_text.delta',delta:'partial'},{type:'response.incomplete'});
 await assert.rejects(askChatGPT(options),e=>e.code==='response_incomplete');
});
test('successful tool rounds retain function output and complete normally',async()=>{
 const {plan}=gate();let calls=0,runs=0;
 globalThis.fetch=async(_,init)=>{
  calls++;
  if(calls===1) return events({type:'response.output_item.done',item:{type:'function_call',call_id:'c1',name:'lookup',arguments:'{}'}},{type:'response.completed'});
  assert.ok(JSON.parse(init.body).input.some(i=>i.type==='function_call_output'&&i.output==='found'));
  return events({type:'response.output_text.delta',delta:'Done'},{type:'response.completed'});
 };
 const result=await askChatGPT({...options,usageGate:plan,functions:[{name:'lookup',description:'test',parameters:{type:'object'},async run(){runs++;return 'found';}}]});
 assert.equal(result,'Done');assert.equal(calls,2);assert.equal(runs,1);
});
test('a pause from another caller stops the next tool round',async()=>{
 const {plan}=gate();let calls=0;
 globalThis.fetch=async()=>{calls++;return events({type:'response.output_item.done',item:{type:'function_call',call_id:'c1',name:'lookup',arguments:'{}'}},{type:'response.completed'});};
 await assert.rejects(askChatGPT({...options,usageGate:plan,functions:[{name:'lookup',description:'test',parameters:{type:'object'},async run(){await plan.recordUsageLimit();return 'found';}}]}),e=>e.code==='usage_backoff');
 assert.equal(calls,1);
});

const {checkModel}=await import('../src/model-check.ts');
test('local pause is labelled separately from an upstream rejection',()=>{
 assert.match(failureReply(new ChatGPTError('usage_backoff')),/have not checked OpenAI again/);
});
test('explicit fresh check reaches OpenAI during pause and clears it on success',async()=>{
 const {plan}=gate();await plan.recordUsageLimit();plan.getAccessToken=async()=>'test';let calls=0;
 globalThis.fetch=async()=>{calls++;return events({type:'response.output_text.delta',delta:'OK'},{type:'response.completed'});};
 assert.equal(await checkModel(plan,'test','low',true),'OK');
 assert.equal(calls,1);assert.equal(await plan.usagePausedUntil(),0);
});
test('ordinary check respects a pause while a failed fresh check retains it',async()=>{
 const {plan}=gate();await plan.recordUsageLimit();plan.getAccessToken=async()=>'test';let calls=0;
 globalThis.fetch=async()=>{calls++;return events({type:'error',error:{code}});};
 await assert.rejects(checkModel(plan,'test','low',false),e=>e.code==='usage_backoff');assert.equal(calls,0);
 await assert.rejects(checkModel(plan,'test','low',true),e=>e.code===code);assert.equal(calls,1);assert.ok(await plan.usagePausedUntil()>Date.now());
});
test('successful check cannot clear a newer quota pause from another request',async()=>{
 const {plan,data}=gate();data.set('usagePausedUntil',100);await plan.clearUsagePause(99);assert.equal(await plan.usagePausedUntil(),100);
});
