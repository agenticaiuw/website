import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { addressesBadgerByName, decideReadMode, isListeningChannel } from '../src/listening.ts';
import { instructions, NO_REPLY } from '../src/prompt.ts';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const base={listening:false,direct:false,hasContent:true,addressedElsewhere:false,coolingDown:false,recentlyTalking:async()=>false};
test('plain-name questions use direct handling in ask-badger, including during cooldown',async()=>{
 for(const content of ["badger what's the chance of the dodgers winning this game rn",'Badger try again','Hey, Badger, help me','Badger Bot: help']) {
  assert.equal(addressesBadgerByName(content),true);
  assert.equal(await decideReadMode({...base,listening:true,namedAddress:addressesBadgerByName(content),coolingDown:true}),'direct');
 }
});
test('name detection does not promote quotes or ordinary conversation, or opt other channels in',async()=>{
 for(const content of ['badgers are great','I asked Badger yesterday','> Badger help','`Badger help`'])assert.equal(addressesBadgerByName(content),false);
 assert.equal(await decideReadMode({...base,namedAddress:true}),null);
 assert.equal(await decideReadMode({...base,listening:true,namedAddress:false}),'listening');
});
test('Badger try again is read in dedicated channel after follow-up window expires',async()=>{
 assert.equal(await decideReadMode({...base,listening:true,recentlyTalking:async()=>false}),'listening');
});
test('active conversations retain visible follow-up handling inside ask-badger',async()=>{
 assert.equal(await decideReadMode({...base,listening:true,coolingDown:true,recentlyTalking:async()=>true}),'follow-up');
 assert.equal(await decideReadMode({...base,listening:true,addressedElsewhere:true,recentlyTalking:async()=>true}),'listening');
 assert.equal(await decideReadMode({...base,listening:true,hasContent:false,recentlyTalking:async()=>true}),'listening');
});
test('rapid messages and messages aimed at other people are still read there',async()=>{
 assert.equal(await decideReadMode({...base,listening:true,addressedElsewhere:true,coolingDown:true}),'listening');
 assert.equal(await decideReadMode({...base,listening:true,direct:true,coolingDown:true}),'direct');
});
test('attachment or contentless human events in dedicated channel reach evaluation',async()=>{
 assert.equal(await decideReadMode({...base,listening:true,hasContent:false}),'listening');
});
test('ordinary channels retain mention/follow-up/cooldown behavior',async()=>{
 assert.equal(await decideReadMode(base),null);
 assert.equal(await decideReadMode({...base,direct:true}),'direct');
 assert.equal(await decideReadMode({...base,recentlyTalking:async()=>true}),'follow-up');
 assert.equal(await decideReadMode({...base,addressedElsewhere:true,recentlyTalking:async()=>true}),null);
 assert.equal(await decideReadMode({...base,direct:true,coolingDown:true}),null);
});
test('only actual ask-badger channel in club guild opts in; bot messages excluded',async()=>{
 const env={CLUB_GUILD_ID:'club-listening-test',DISCORD_BOT_TOKEN:'test'};
 globalThis.fetch=async()=>Response.json([{id:'ask',name:'ask-badger',type:0},{id:'other',name:'general',type:0},{id:'cat',name:'ask-badger',type:4}]);
 const message={guild_id:env.CLUB_GUILD_ID,channel_id:'ask',author:{id:'human'}};
 assert.equal(await isListeningChannel(message,env),true);
 assert.equal(await isListeningChannel({...message,channel_id:'other'},env),false);
 assert.equal(await isListeningChannel({...message,guild_id:'another-server'},env),false);
 assert.equal(await isListeningChannel({...message,author:{id:'bot',bot:true}},env),false);
 assert.equal(await isListeningChannel({...message,channel_id:'cat'},env),false);
});
test('ambient prompt permits silence and does not pretend user is a recent follow-up',()=>{
 const prompt=instructions('Badger',{webSearch:false,followUp:true,ambient:true,access:'member',asker:'Student',rules:'',agentSkills:''});
 assert.ok(prompt.includes('#ask-badger'));assert.ok(prompt.includes(NO_REPLY));assert.ok(prompt.includes('Badger try again'));assert.ok(!prompt.includes("someone you were just talking with"));
});
test('ordinary follow-up prompt remains unchanged',()=>{
 const prompt=instructions('Badger',{webSearch:false,followUp:true,access:'member',asker:'Student',rules:'',agentSkills:''});
 assert.ok(prompt.includes('someone you were just talking with'));
});
