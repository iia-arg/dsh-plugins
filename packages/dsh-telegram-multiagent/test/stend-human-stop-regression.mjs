import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts,ustanovitIstochnikPomoshchnika} from '../src/message-receipts.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {handleTelegramStop as current} from '../src/telegram-stop.js';
import {handleTelegramStop as original} from './telegram-stop-baseline.mjs';
ustanovitIstochnikPomoshchnika(()=>({sobytiyaSessii:s=>s.events,nasledovano:()=>0}));
const cases=[
 ['running-exact',{}],['idle',{idle:true}],['prior-pause',{prior:true}],['not-allowed',{sender:9}],['bot',{bot:true}],
 ['codex',{remote:true}],['claude',{remote:true,model:'claude-fixture'}],['remote-unknown',{remote:true,ack:'unknown'}],
 ['unsupported-model',{remote:true,model:'unknown-fixture'}],['changed-session',{remote:true,changed:true}],['ordinary',{text:'ordinary /stop'}],['tail',{text:'/stop extra'}]
];
async function run(handler,options){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'human-stop-diff-'));let l;
 try{
  l=new MessageReceipts(path.join(root,'ledger'),{now:()=>1000});const p=new ConversationPause(l,'/fixture-cwd',()=>{});
  const prior=l.receive('prior',Buffer.from('/stop prior')),receipt=l.receive('stop',Buffer.from('/stop'));
  const claimed={id:'claimed-message',role:'user',content:[{type:'text',text:'claimed context'}]},backlog={id:'backlog-message',role:'user',content:[{type:'text',text:'next input'}]};
  const events=[{seq:0,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:0,inserted:[claimed]}}];
  if(!options.idle)events.push({seq:1,type:'turn/start',data:{turn:3}},{seq:2,type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount:1,inserted:[]}});
  const session={id:'fixture-session',header:{id:'fixture-session',createdAt:10,cwd:'/fixture-cwd'},events,requestHeader:()=>({config:{provider:options.remote?'claude-oauth':'deepseek-direct',model:options.model??'gpt-fixture'}}),append(type,data){const event={seq:events.length,type,data};events.push(event);return event;}};
  const calls=[],listeners=new Set();const agent={session,status:options.idle?'idle':'running',inbox:{nextTurn:[backlog],nextStep:[]},ctx:{on:(_,fn)=>{listeners.add(fn);return()=>listeners.delete(fn)}},
   cancel(cause,policy){calls.push(['cancel',cause,policy]);agent.status='idle';const end=session.append('turn/end',{turn:3,reason:{kind:'aborted'}});for(const fn of [...listeners])fn(session,end);},whenIdle:async()=>{}};
  if(options.prior)p.pause(session.header,prior.id);
  const reply=await handler({text:options.text??'/stop',from:{id:options.sender??7,is_bot:options.bot??false}},{allowed:new Set([7]),findAgent:()=>agent,settleMs:5,
   pause:a=>{calls.push(['pause']);p.pause(a.session.header,receipt.id)},stopRemote:async()=>{calls.push(['remote']);if(options.changed)agent.session={...session,id:'changed-session'};return {state:options.ack??'interrupting',binding:{control_id:'fixture-control'},codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'}}}});
  await Promise.resolve();
  const value={reply,calls,pause:l.db.prepare('SELECT * FROM conversation_pauses').all(),events,inbox:agent.inbox,status:agent.status};
  return JSON.parse(JSON.stringify(value).replaceAll(prior.id,'prior-command').replaceAll(receipt.id,'current-command'));
 }finally{l?.close();fs.rmSync(root,{recursive:true,force:true})}
}
for(const [name,options] of cases){const old=await run(original,options),now=await run(current,options);assert.deepEqual(now,old,name+' old/new human contract differs');console.log('PASS old=new',name)}
console.log('VERIFIED human /stop state, text, pause row, queue and claimed context on 12 named inputs');
