import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class DurableObject { constructor(ctx,env) { this.ctx=ctx; this.env=env; } }')};
 return next(specifier,context);
}});
const { dmMembersTool } = await import('../src/member-dms.ts');
const { replyMentionTool, withRequestedMentions } = await import('../src/reply-mentions.ts');
const { ChannelMemory } = await import('../src/memory.ts');
const { reply, sendDirectMessage, displayName } = await import('../src/discord.ts');
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const g='1496046349894811758', actor='111111111111111111', exec='222222222222222222', a='333333333333333333', b='444444444444444444', c='555555555555555555', ch='666666666666666666';
const env={CLUB_GUILD_ID:g,EXEC_ROLES:'exec',DISCORD_BOT_TOKEN:'test-only'};
const message={id:'777777777777777777',guild_id:g,channel_id:ch,content:'Please message these people',author:{id:actor,username:'exec'},member:{roles:[exec]}};
function storage(){
 const rows=new Map(); let alarm=null, tail=Promise.resolve();
 const api={rows,async get(k){return rows.get(k);},async put(k,v){rows.set(k,structuredClone(v));},async list({prefix}){return new Map([...rows].filter(([k])=>k.startsWith(prefix)));},async getAlarm(){return alarm;},async setAlarm(v){alarm=v;},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])rows.delete(k);},async deleteAll(){rows.clear();},transaction(fn){const p=tail.then(()=>fn(api));tail=p.catch(()=>{});return p;}};
 return api;
}
function fixture(){
 const s={requests:[],sent:[],actorExec:true,blocked:new Set(),outsiders:new Set(),bots:new Set(),unknown:new Set(),channelType:0};
 globalThis.fetch=async(url,opts={})=>{
  const u=new URL(url),path=u.pathname.replace('/api/v10',''); const body=opts.body?JSON.parse(opts.body):undefined;
  s.requests.push({path,body,method:opts.method});
  if(path===`/guilds/${g}/roles`) return Response.json([{id:g,name:'@everyone',permissions:'1024'},{id:exec,name:'Exec',permissions:'8'}]);
  if(path.startsWith(`/guilds/${g}/members/`)) {
   const id=path.split('/').at(-1); if(s.outsiders.has(id)) return Response.json({}, {status:404});
   return Response.json({roles:id===actor&&s.actorExec?[exec]:[],nick:id===a?'Bala Shukla':null,user:{id,username:'discord_handle',global_name:'Global Name',bot:s.bots.has(id)}});
  }
  if(path==='/users/@me/channels') {if(s.blocked.has(body.recipient_id))return Response.json({code:50007},{status:403});return Response.json({id:'dm-'+body.recipient_id});}
  if(path.endsWith('/messages')) {const id=path.split('/')[2].replace('dm-','');if(s.unknown.has(id))throw new Error('network disconnected');s.sent.push({id,body});return Response.json({id:'888888888888888888'});}
  if(path===`/channels/${ch}`) return Response.json({id:ch,type:s.channelType,permission_overwrites:[]});
  throw new Error('unexpected '+path);
 };
 const st=storage(); const memory=new ChannelMemory({storage:st},env);
 return {s,st,memory,tool:dmMembersTool(env,message,'Evan Liu',memory)};
}
test('screenshot case sends three individual DMs with exact form link and attribution',async()=>{
 const {tool,s}=fixture(); const url='https://forms.gle/A7bWN3BpHXfoek9b7';
 const result=JSON.parse(await tool.run({recipients:[a,`<@${b}>`,`<@!${c}>`],text:`Please fill out the membership form after your office hours meeting: ${url}`}));
 assert.deepEqual(result.results.map(r=>r.status),['sent','sent','sent']);assert.equal(s.sent.length,3);
 for(const sent of s.sent){assert.ok(sent.body.content.includes(url));assert.match(sent.body.content,/on behalf of Evan Liu/);assert.deepEqual(sent.body.allowed_mentions,{parse:[],replied_user:false});assert.equal(sent.body.enforce_nonce,true);assert.equal(sent.body.nonce.length,24);}
 assert.equal(new Set(s.sent.map(x=>x.body.nonce)).size,3);
});
test('duplicate recipients and repeated tool invocations do not resend',async()=>{
 const {tool,s}=fixture();await tool.run({recipients:[a,a],text:'Reminder'});
 const result=JSON.parse(await tool.run({recipients:[a],text:'A rewritten reminder'}));
 assert.equal(result.results[0].status,'already_sent');assert.equal(s.sent.length,1);
});
test('closed DMs fail per recipient without stopping delivery to others',async()=>{
 const {tool,s}=fixture();s.blocked.add(b);
 const result=JSON.parse(await tool.run({recipients:[a,b,c],text:'Reminder'}));
 assert.deepEqual(result.results.map(r=>r.status),['sent','failed','sent']);assert.match(result.results[1].detail,/privacy settings or blocking/);assert.equal(s.sent.length,2);
});
test('network ambiguity is not called success or retried',async()=>{
 const {tool,s}=fixture();s.unknown.add(a);
 assert.equal(JSON.parse(await tool.run({recipients:[a],text:'Reminder'})).results[0].status,'unknown');
 await tool.run({recipients:[a],text:'Reminder'});
 assert.equal(s.requests.filter(r=>r.path.endsWith('/messages')).length,1);
});
test('live revoked exec, foreign guild and bot author cannot send',async()=>{
 const {tool,s,memory}=fixture();s.actorExec=false;
 assert.match(await tool.run({recipients:[a],text:'Reminder'}),/does not currently/);
 for(const m of [{...message,guild_id:ch},{...message,author:{...message.author,bot:true}}])assert.match(await dmMembersTool(env,m,'test',memory).run({recipients:[a],text:'Reminder'}),/Nothing sent/);
 assert.equal(s.sent.length,0);
});
test('nonmembers and bots receive no DM',async()=>{
 const {tool,s}=fixture();s.outsiders.add(a);s.bots.add(b);
 const result=JSON.parse(await tool.run({recipients:[a,b],text:'Reminder'}));assert.ok(result.results.every(r=>r.status==='not_sent'));assert.equal(s.requests.filter(r=>r.path==='/users/@me/channels').length,0);
});
test('malformed recipient, excessive length and oversized batch fail before any send',async()=>{
 const {tool,s}=fixture();
 for(const recipient of ['Bala',`<@&${a}>`,`${a}>`,`<@${a}`]) assert.match(await tool.run({recipients:[recipient],text:'Hi'}),/Nothing sent/);
 assert.match(await tool.run({recipients:[a],text:'x'.repeat(1801)}),/Nothing sent/);
 assert.match(await tool.run({recipients:Array.from({length:21},(_,i)=>String(BigInt(a)+BigInt(i))),text:'Hi'}),/Nothing sent/);assert.equal(s.sent.length,0);
});
test('atomic claims prevent concurrent duplicate deliveries and survive object recreation',async()=>{
 const {st,memory}=fixture();const results=await Promise.all([memory.claimDmDelivery(message.id,a),memory.claimDmDelivery(message.id,a)]);assert.equal(results.filter(r=>r.claimed).length,1);
 const restored=new ChannelMemory({storage:st},env);assert.equal((await restored.claimDmDelivery(message.id,a)).claimed,false);
});
test('20-recipient request limit persists across separate tool calls',async()=>{
 const {memory}=fixture();for(let i=0;i<20;i++)assert.equal((await memory.claimDmDelivery(message.id,String(BigInt(a)+BigInt(i)))).claimed,true);
 assert.equal((await memory.claimDmDelivery(message.id,b)).claimed,false);
});
test('receipt cleanup keeps recent deliveries and removes week-old metadata',async()=>{
 const {st,memory}=fixture();await memory.finishDmDelivery(message.id,a,{status:'sent',at:Date.now(),messageId:'receipt'});await memory.finishDmDelivery(message.id,b,{status:'sent',at:Date.now()-8*86400000});await memory.alarm();assert.ok(st.rows.has(`dm:${message.id}:${a}`));assert.ok(!st.rows.has(`dm:${message.id}:${b}`));
});
test('explicit ping resolves server nickname and permits only resolved user',async()=>{
 fixture();const allowed=new Set();const result=await replyMentionTool(env,message,allowed).run({members:[a]});assert.match(result,/Bala Shukla/);assert.deepEqual([...allowed],[a]);assert.equal(withRequestedMentions('Here is the sheet.',allowed),`<@${a}> Here is the sheet.`);assert.equal(withRequestedMentions(`<@${a}> Here it is.`,allowed),`<@${a}> Here it is.`);
});
test('normal reply suppresses all pings; authorized reply allows only exact user IDs',async()=>{
 const {s}=fixture();await reply(env.DISCORD_BOT_TOKEN,message,`<@${a}> @everyone <@&${exec}>`);
 assert.deepEqual(s.sent[0].body.allowed_mentions,{parse:[],replied_user:false,users:[]});
 await reply(env.DISCORD_BOT_TOKEN,message,`<@${a}> <@${b}> @everyone <@&${exec}>`,[],[a]);
 assert.deepEqual(s.sent[1].body.allowed_mentions,{parse:[],replied_user:false,users:[a]});
});
test('revoked exec and private thread cannot enable pings',async()=>{
 const {s}=fixture();const allowed=new Set();s.actorExec=false;assert.match(await replyMentionTool(env,message,allowed).run({members:[a]}),/no longer/);s.actorExec=true;s.channelType=12;assert.match(await replyMentionTool(env,message,allowed).run({members:[a]}),/private-thread/);assert.equal(allowed.size,0);
});
test('display name prefers server nickname over global name or username',()=>{
 assert.equal(displayName({...message,member:{nick:'Server Name'},author:{username:'handle',global_name:'Global'}}),'Server Name');
});
test('low-level DM sender validates size and receipt',async()=>{
 fixture();await assert.rejects(sendDirectMessage('test','dm','x'.repeat(2001),'nonce'),/2000/);
 globalThis.fetch=async()=>Response.json({});await assert.rejects(sendDirectMessage('test','dm','Hi','nonce'),/receipt/);
});
