import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts,receiptFacts,sobytiyaSessii} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {SdkInbox} from '../src/sdk-inbox.js';
let count=0;
async function fixture(mode){const root=fs.mkdtempSync(path.join(os.tmpdir(),'beta-sdk-input-'));let p,l,inputs,release;
 try{p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const h=await p.agents.create({sessionId:'fixture-inbox',agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}}),a=h.agent;
  p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));let entered;const first=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let calls=0;
  p.ctx.get('llm').stream=async function*(request){calls++;if(calls===1){entered();await gate;}yield {type:'text-delta',index:0,text:'fixture answer'};yield {type:'finish',reason:{kind:'stop'}}};
  const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});
  a.followup(msg('FIRST'));await first;const turn=sobytiyaSessii(a.session).findLast(e=>e.type==='turn/start').data.turn;
  const binding={generation:l.owner,recipient:'fixture',ledger_uuid:l.protocolIdentity(),session_id:a.session.id,session_created:a.session.header.createdAt,turn};
  const lease={agent:a,session:a.session,descriptor:{binding,request_id:'fixture-lease'},sdkIdentity:{thread_id:'fixture-thread',turn_id:'fixture-turn'}};let captured,dispatches=0;
  const control={inputLease:()=>lease,inputAlive:()=>a.status==='running',sendInput:async(_lease,packet)=>{captured=packet;dispatches++;if(mode==='reject')return{accepted:false,input_state:'not-offered'};if(mode==='lost')throw Error('lost ACK');return{accepted:true,binding:packet.binding,input_state:'pending',model_response:'unknown',codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'}}}};
  inputs=new SdkInbox(l,p.sessions,control,undefined,process.env.DSH_TEST_APP);inputs.dopusk=()=>true;/* стенд механизма живого ввода: допуск выдан явно — B-N-1600 шаг 0 закрыл его для писем без метки, этап 1 выдаст его метке refines */const pauses=new ConversationPause(l,root,()=>{});pauses.sdkInputs=inputs;pauses.attach(a);
  const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.conversationPause=pauses;runtime.sdkInputs=inputs;
  const receipt=l.receive('mail',Buffer.from('MAIL'),{sender:'fixture'});await runtime.enqueue(receipt,a,()=>msg('MAIL'),'a2a');await inputs.work.get(a);
  assert.equal(dispatches,1);assert.equal(inputs.row(receipt.id).state,mode==='lost'?'unknown':mode==='reject'?'not_offered':'accepted');
  if(mode==='offer'){
   await inputs.event(lease,{state:'offered',binding:captured.binding,method:'codex-steer',codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'}});
   assert.equal(inputs.row(receipt.id).state,'admitted');assert(!a.inbox.nextTurn.some(m=>m.id===l.get(receipt.id).dsh_id));
   assert(sobytiyaSessii(a.session).some(e=>e.type==='user/message'&&e.data.id===l.get(receipt.id).dsh_id));
   release();await a.whenIdle();await runtime.observe(a.session);assert.equal(l.get(receipt.id).outcome,'sdk_input_response');assert.equal(l.get(receipt.id).claimed_turn,turn);
  }else if(mode==='reject'){
   release();await a.whenIdle();await runtime.observe(a.session);assert.equal(l.get(receipt.id).outcome,'turn_completed');assert(l.get(receipt.id).claimed_turn>turn);
  }else if(mode==='corrupt-admission'){
   const id=l.get(receipt.id).dsh_id;const i=a.inbox.nextTurn.findIndex(m=>m.id===id);a.inbox.mutate('next-turn',i,1,[],false);
   release();await a.whenIdle();await runtime.observe(a.session);assert.equal(l.get(receipt.id).finished_at,null,'synthetic removal + unrelated end cannot complete SDK input');
  }else{
   release();await a.whenIdle();await runtime.observe(a.session);assert.equal(l.get(receipt.id).finished_at,null);assert(a.inbox.nextTurn.some(m=>m.id===l.get(receipt.id).dsh_id));
   await inputs.forward(a,receipt.id);assert.equal(dispatches,1,'unknown must not replay');
  }
  console.log('PASS',mode,'dispatches',dispatches);count++;
 }finally{release?.();inputs?.dispose();await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true});}
}
for(const mode of ['offer','reject','lost','corrupt-admission'])await fixture(mode);
console.log('PASSED',count,'native production SDK inbox cases');
