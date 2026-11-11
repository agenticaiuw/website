import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mentionBits, mentionPermissionTools, mentionPermissionStatus } from '../src/mention-permissions.ts';
import { PERMISSIONS as P } from '../src/discord.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const g='1496046349894811758', actor='111111111111111111', bot='222222222222222222';
const exec='333333333333333333', br='444444444444444444', member='555555555555555555', ch='666666666666666666';
const env={CLUB_GUILD_ID:g,EXEC_ROLES:'exec',DISCORD_BOT_TOKEN:Buffer.from(bot).toString('base64')+'.fake.fake'};
const message={id:'777777777777777777',guild_id:g,channel_id:ch,content:'Make mass pings exec-only',author:{id:actor,username:'exec'},member:{roles:[exec]}};
function fixture() {
 const state={
  roles:[{id:g,name:'@everyone',position:0,permissions:String(P.VIEW_CHANNEL|P.SEND_MESSAGES|P.MENTION_EVERYONE)},
   {id:exec,name:'Exec',position:10,permissions:String(P.ADMINISTRATOR)},
   {id:br,name:'Badger',position:20,permissions:String(P.ADMINISTRATOR),managed:true},
   {id:member,name:'Member',position:1,permissions:String(P.MENTION_EVERYONE|P.SEND_MESSAGES)}],
  channels:[{id:ch,type:0,name:'general',permission_overwrites:[{id:member,type:0,allow:String(P.MENTION_EVERYONE|P.VIEW_CHANNEL),deny:String(P.SEND_MESSAGES)}]}],
  actorRoles:[exec], writes:[], owner:'999999999999999999', failWrite:false, disagree:false,
 };
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname.replace('/api/v10',''); const method=options.method??'GET';
  if(method!=='GET') {
   state.writes.push({path,method,body:JSON.parse(options.body),reason:options.headers['X-Audit-Log-Reason']});
   if(state.failWrite) return Response.json({message:'Missing Permissions'},{status:403});
   if(method==='PATCH') { const role=state.roles.find(r=>path.endsWith('/'+r.id)); if(!state.disagree) role.permissions=JSON.parse(options.body).permissions; return Response.json(role); }
   const body=JSON.parse(options.body), id=path.split('/').at(-1);
   if(!state.disagree) { const list=state.channels[0].permission_overwrites; const index=list.findIndex(o=>o.id===id); const value={id,...body}; if(index<0) list.push(value); else list[index]=value; }
   return new Response(null,{status:204});
  }
  if(path===`/guilds/${g}/roles`) return Response.json(state.roles);
  if(path===`/guilds/${g}`) return Response.json({owner_id:state.owner});
  if(path===`/guilds/${g}/members/${actor}`) return Response.json({roles:state.actorRoles});
  if(path===`/guilds/${g}/members/${bot}`) return Response.json({roles:[br]});
  if(path===`/guilds/${g}/channels`) return Response.json(state.channels);
  if(path===`/channels/${ch}`) return Response.json(state.channels[0]);
  if(path===`/guilds/${g}/members`) return Response.json([{user:{id:actor,username:'exec'},roles:state.actorRoles},{user:{id:bot,username:'bot',bot:true},roles:[br]}]);
  throw new Error('Unexpected request '+path);
 };
 return state;
}
const edit=(args,m=message)=>mentionPermissionTools(env,m,'Exec')[1].run(args);
const roleArgs={target_id:member,target_type:'role',state:'deny'};

test('tri-state channel changes preserve unrelated bits, including high bits',()=>{
 const high=1n<<48n;
 assert.deepEqual(mentionBits(String(high|P.MENTION_EVERYONE),String(P.SEND_MESSAGES),'inherit'),{allow:String(high),deny:String(P.SEND_MESSAGES)});
 assert.deepEqual(mentionBits(String(high),String(P.MENTION_EVERYONE),'allow'),{allow:String(high|P.MENTION_EVERYONE),deny:'0'});
 assert.deepEqual(mentionBits(String(P.MENTION_EVERYONE),String(high),'deny'),{allow:'0',deny:String(high|P.MENTION_EVERYONE)});
});
test('role update preserves every other permission and supplies audit reason',async()=>{
 const s=fixture(); assert.match(await edit(roleArgs),/^Verified:/);
 assert.equal(s.roles.find(r=>r.id===member).permissions,String(P.SEND_MESSAGES));
 assert.equal(s.writes.length,1); assert.match(decodeURIComponent(s.writes[0].reason),new RegExp(actor));
});
test('channel allow removal preserves access and unrelated deny',async()=>{
 const s=fixture(); assert.match(await edit({...roleArgs,channel_id:ch,state:'inherit'}),/^Verified:/);
 assert.deepEqual(s.channels[0].permission_overwrites[0],{id:member,type:0,allow:String(P.VIEW_CHANNEL),deny:String(P.SEND_MESSAGES)});
});
test('live membership rejects revoked exec even with stale gateway role',async()=>{
 const s=fixture(); s.actorRoles=[member]; assert.match(await edit(roleArgs),/no longer has an executive/); assert.equal(s.writes.length,0);
});
test('different guild and bot requesters cannot mutate',async()=>{
 const s=fixture(); assert.match(await edit(roleArgs,{...message,guild_id:ch}),/Only executives/);
 assert.match(await edit(roleArgs,{...message,author:{...message.author,bot:true}}),/Only executives/); assert.equal(s.writes.length,0);
});
test('an executive without Manage Roles cannot borrow bot authority',async()=>{
 const s=fixture(); s.roles.find(r=>r.id===exec).permissions='0'; assert.match(await edit(roleArgs),/you need Manage Roles/); assert.equal(s.writes.length,0);
});
test('administrator does not bypass role hierarchy for actor or bot',async()=>{
 const s=fixture(); s.roles.find(r=>r.id===member).position=10; assert.match(await edit(roleArgs),/highest role/); assert.equal(s.writes.length,0);
 s.owner=actor; s.roles.find(r=>r.id===member).position=20; assert.match(await edit(roleArgs),/highest role/); assert.equal(s.writes.length,0);
});
test('managed roles cannot be modified',async()=>{
 const s=fixture(); assert.match(await edit({...roleArgs,target_id:br}),/Discord manages/); assert.equal(s.writes.length,0);
});
test('foreign channels and arbitrary permission states are rejected',async()=>{
 const s=fixture(); assert.match(await edit({...roleArgs,channel_id:'888888888888888888'}),/not in the club server/);
 assert.match(await edit({...roleArgs,state:'administrator'}),/invalid/); assert.equal(s.writes.length,0);
});
test('repeat requests are idempotent and do not write',async()=>{
 const s=fixture(); await edit(roleArgs); assert.match(await edit(roleArgs),/Already set/); assert.equal(s.writes.length,1);
});
test('Discord refusal and read-back mismatch are never reported as success',async()=>{
 const s=fixture(); s.failWrite=true; assert.match(await edit(roleArgs),/edit failed/);
 s.failWrite=false; s.disagree=true; assert.match(await edit(roleArgs),/read-back differs/);
});
test('audit includes overrides, admin bypass and has no mutations',async()=>{
 const s=fixture(); const result=JSON.parse(await mentionPermissionTools(env,message,'Exec')[0].run({}));
 assert.equal(result.overrides[0].state,'allow'); assert.equal(result.bot.manageRoles,true);
 assert.ok(result.roles.find(r=>r.id===exec).administrator); assert.equal(s.writes.length,0);
});
test('health checks runtime bot permissions without exposing credentials',async()=>{
 fixture(); const status=await mentionPermissionStatus(env); assert.equal(status.administrator,true); assert.equal(status.manageRoles,true); assert.equal(status.highestRolePosition,20);
 assert.ok(!JSON.stringify(status).includes(env.DISCORD_BOT_TOKEN));
});
