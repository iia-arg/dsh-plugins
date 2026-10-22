// Exercises the real handleUpdate body, with Telegram/model boundaries kept offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {extractFunction} from './extract.mjs';
import {sGostem} from './gost-kontekst.mjs';
import {channelAdmission} from '../src/guest-channel.js';
import {handleTelegramStop} from '../src/telegram-stop.js';
const sourceFile=process.argv[2]??new URL('../src/index.js',import.meta.url);
const source=fs.readFileSync(sourceFile,'utf8');
function fixture({open=false,social=false}={}) {
 const queued=[],logs=[],sent=[],io=[],routed=[];
 const config={workspace:'/fixture-workspace',openBot:open,allowedUsers:[7,99],...(social?{social:{}}:{})};
 const {allowed,isAllowed}=channelAdmission(config);
 const c={autopilot:null,config,allowed,isAllowed,handleTelegramStop,settings:()=>({}),nastrojkaGruppy:()=>null,
  botKto:async()=>({id:8899,username:'fixture_bot'}),log:x=>logs.push(x),
  tg:{send:async(...x)=>sent.push(x),typing:async()=>io.push('typing'),call:async()=>true},
  ctx:{get:()=>null},ownerChatId:()=>7,who_:'fixture',
  transcribeVoice:async()=>{io.push('voice');return 'fixture voice';},
  ensureGuestDirectory:async()=>{},guestCopies:{capture:()=>io.push('guest-copy')},
  tgChatFor:new Map(),lastOrigin:new Map(),pushAsk:()=>{},copyAsk:()=>{},stripMark:x=>x,
  agentFor:async()=>({sessionId:'fixture-session',handle:{agent:{whenIdle:async()=>{}}}}),
  platform:{createUserMessage:x=>x},
  receiptRuntime:()=>({enqueue:async(receipt,agent,makeMessage,chat,...rest)=>queued.push({receipt:receipt.id,message:makeMessage(),chat,rest})}),
  nudgeUntilClaimed:()=>{},oborvalsyaOshibkoj:new Map(),setTimeout:()=>0,
  ...(social?{socialIngress:{handles:u=>Boolean(u.channel_post||u.callback_query||u.message?.chat?.id===-1002103269359),handle:async u=>routed.push(u)}}:{})};
 return {run:vm.runInNewContext('('+extractFunction(source,'handleUpdate')+')',sGostem(c)),queued,logs,sent,io,routed};
}
function message(from,chat=7,extra={}) {return {update_id:1,message:{message_id:1,chat:{id:chat,type:chat<0?'group':'private'},from,text:'ordinary fixture message',...extra}};}
const human={id:7,is_bot:false,first_name:'Human'},bot={id:99,is_bot:true,first_name:'FixtureBot'};
for(const [name,update] of [
 ['human private',message(human)],['human group',message(human,-5388098055)],
 ['human legacy missing flag',message({id:7})],
 ['human forwarded bot text',message(human,7,{forward_origin:{type:'user',sender_user:bot}})],
 ['human replying to bot',message(human,7,{reply_to_message:{from:bot,text:'copied bot text'}})]
])test(name+' reaches the agent queue',async()=>{
 const f=fixture();await f.run(update,{id:'fixture-receipt'});
 assert.equal(f.queued.length,1);assert.equal(f.queued[0].chat,update.message.chat.id);
 assert.ok(f.queued[0].message.content[0].text.includes('ordinary fixture message'));
 assert.equal(f.logs.filter(x=>x.startsWith('отброшено: сообщение бота ')).length,0);
});
for(const [name,update,options] of [
 ['allowed bot private',message(bot)],['allowed bot traffic group',message(bot,-5388098055)],
 ['unlisted bot open channel',message({...bot,id:12345},-555),{open:true}],
 ['bot voice',message(bot,7,{text:undefined,voice:{file_id:'fixture',duration:1}})],
 ['bot command',message(bot,7,{text:'/start'})],
 ['bot sticker',message(bot,7,{text:undefined,sticker:{file_id:'fixture'}})],
 ['bot without supported body',message(bot,7,{text:undefined})]
])test(name+' is discarded once without queue, reply, or media processing',async()=>{
 const f=fixture(options);await f.run(update,{id:'fixture-receipt'});
 assert.equal(f.queued.length,0,'bot reached actual enqueue call');
 assert.deepEqual(f.logs,[`отброшено: сообщение бота ${update.message.from.id} в чате ${update.message.chat.id}`]);
 assert.equal(f.sent.length,0);assert.equal(f.io.length,0);
});
for(const [name,update] of [
 ['configured social discussion data',message(bot,-1002103269359)],
 ['channel post',{update_id:2,channel_post:{message_id:3,chat:{id:-1001925584120},from:bot,text:'post'}}],
 ['human callback on bot card',{update_id:3,callback_query:{id:'fixture-cb',from:human,message:{chat:{id:-1001659691422},from:bot}}}]
])test(name+' retains its separate SocialIngress route',async()=>{
 const f=fixture({social:true});await f.run(update,{id:'fixture-receipt'});
 assert.equal(f.routed.length,1);assert.equal(f.queued.length,0);assert.equal(f.logs.length,0);
});
