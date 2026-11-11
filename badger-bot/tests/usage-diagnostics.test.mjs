import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {inspectProvider} from '../src/usage-diagnostics.ts';
const original=globalThis.fetch;afterEach(()=>{globalThis.fetch=original;});
test('fixed probe captures provider request ID and full quota error without exposing credentials',async()=>{
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(options.headers.Authorization,'Bearer test-secret');
  if(url.endsWith('/models')) return Response.json({models:[{slug:'test',display_name:'Test',visibility:'list'}]});
  const request=JSON.parse(options.body);assert.equal(request.stream,true);assert.equal(request.store,false);assert.equal(request.tools,undefined);
  return new Response('data: '+JSON.stringify({type:'error',error:{code:'subscription_sharing_usage_limit_exceeded',message:'test quota'}})+'\n\n',{headers:{'x-request-id':'req-test','set-cookie':'secret-cookie','x-codex-turn-state':'opaque-session-state','retry-after':'60'}});
 };
 const result=await inspectProvider('test-secret','test');assert.equal(calls,2);assert.equal(result.headers['x-request-id'],'req-test');assert.equal(result.headers['retry-after'],'60');assert.match(result.responseBody,/test quota/);assert.doesNotMatch(JSON.stringify(result),/test-secret|secret-cookie|opaque-session-state/);
});
