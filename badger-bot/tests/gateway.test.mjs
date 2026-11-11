import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){if(s==='cloudflare:workers')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}')};return next(s,c);}});
const {DiscordGateway,gatewayHealth}=await import('../src/gateway.ts');
const now=1000000;
const state={wsUrl:'wss://gateway.example',sessionId:'test',heartbeatIntervalMs:41250,lastHeartbeatAck:now-5000,connectedAt:new Date(now-10000).toISOString(),reconnectDisabled:false};
test('socket reference alone is not a healthy connection',()=>{
 assert.equal(gatewayHealth({...state,heartbeatIntervalMs:null,connectedAt:new Date(now-60000).toISOString()},1,now).stale,true);
 assert.equal(gatewayHealth({...state,lastHeartbeatAck:now-100000},1,now).healthy,false);
 for(const socket of [null,2,3])assert.equal(gatewayHealth(state,socket,now).healthy,false);
 assert.equal(gatewayHealth(state,1,now).healthy,true);
});
test('fresh handshake is allowed time to complete',()=>{
 const health=gatewayHealth({...state,heartbeatIntervalMs:null},1,now);
 assert.equal(health.healthy,false);assert.equal(health.stale,false);
});
function fixture(value){let alarm=null;const data=new Map([['gateway_state',value]]);const storage={get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),getAlarm:async()=>alarm,setAlarm:async t=>{alarm=t;}};return{gateway:new DiscordGateway({storage},{}),getAlarm:()=>alarm};}
test('missing watchdog is restored for an existing connection',async()=>{
 const {gateway,getAlarm}=fixture({...state,lastHeartbeatAck:Date.now(),connectedAt:new Date().toISOString()});gateway.upstream={readyState:1};
 const result=await gateway.ensureHealthy();assert.equal(result.health.healthy,true);assert.ok(getAlarm()>Date.now());
});
test('stale connection schedules recovery once and does not erase backoff',async()=>{
 const {gateway}=fixture({...state,lastHeartbeatAck:1});gateway.upstream={readyState:1};let calls=0;
 gateway.reconnectWithBackoff=async()=>{calls++;};
 const result=await gateway.ensureHealthy();assert.equal(result.recoveryScheduled,true);assert.equal(calls,1);
});
test('terminal gateway errors do not trigger repeated automatic reconnects',async()=>{
 const {gateway,getAlarm}=fixture({...state,reconnectDisabled:true});gateway.upstream={readyState:3};gateway.reconnectWithBackoff=async()=>{throw Error('must not reconnect');};
 await gateway.ensureHealthy();assert.equal(getAlarm(),null);
});
