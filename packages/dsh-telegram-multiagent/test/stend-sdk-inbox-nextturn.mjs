// RU: Реальные native inbox/receipts; SDK RPC подставной. Д2:2 и30000ms; Д4:not-offered→next-turn.
// EN: Actual native inbox/receipts with fixture SDK RPC. D2:2 and30000ms; D4:not-offered→next-turn.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts,sobytiyaSessii,receiptFacts} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {SdkInbox} from '../src/sdk-inbox.js';
import {gatewayDir,adapterDir,iz} from './sosedi.mjs';
const gw=gatewayDir();
const {TurnInboxQueue,STOP_WINDOW_MS,MAX_STOP_CONTINUATIONS}=await (process.env.REVIEW_QUEUE_MODULE?import(process.env.REVIEW_QUEUE_MODULE):iz(gw,'inbox-input.mjs'));
const {TaskControlRouter}=await iz(gw,'task-control.mjs');
const {progonAppServer}=await iz(gw,'codex-app-server.mjs');
const results=[];
assert.equal(STOP_WINDOW_MS,30000);assert.equal(MAX_STOP_CONTINUATIONS,2);
for(const mode of ['stop-count','stop-time','codex-change']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'beta-gateway-nextturn-r2-'));let p,l,inputs,releaseNative,releaseCancel,output,listener,queue;
 try{
  p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));
  const {agent:a}=await p.agents.create({sessionId:'fixture-'+mode,agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}});
  p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));let enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>releaseNative=r);let llmCalls=0;
  p.ctx.get('llm').stream=async function*(){if(++llmCalls===1){enter();await gate}yield{type:'text-delta',index:0,text:'fixture reply'};yield{type:'finish',reason:{kind:'stop'}}};
  const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});
  a.followup(msg('FIRST'));await entered;const originalTurn=sobytiyaSessii(a.session).findLast(x=>x.type==='turn/start').data.turn;
  const binding={generation:l.owner,recipient:'fixture',ledger_uuid:l.protocolIdentity(),session_id:a.session.id,session_created:a.session.header.createdAt,turn:originalTurn};
  const descriptor={binding,request_id:'request-'+mode,ticket:'b'.repeat(64),operations:['cancel','message']};const lease={agent:a,session:a.session,descriptor,sdkIdentity:{thread_id:'thread-original',turn_id:'turn-original'}};
  const router=new TaskControlRouter(),response=new EventEmitter();let transportReply,dispatches=0,now=1000;
  if(mode.startsWith('stop-')){
   queue=new TurnInboxQueue({now:()=>now,notOffered:async(packet,reason)=>{await inputs.event(lease,{state:'not-offered',binding:packet.binding,method:'claude-hook',reason,codex:lease.sdkIdentity})}});
   const dummy=n=>({op:'message',binding:{control_id:'dummy-'+n,target_receipt:'dummy-'+n},body:JSON.stringify({receipt_id:'dummy-'+n,message:{id:'dummy-'+n,role:'user',source:{kind:'user'},content:[{type:'text',text:'dummy'}]},provenance:{sender:'fixture',verified:false}})});
   const count=mode==='stop-count'?MAX_STOP_CONTINUATIONS:1;
   for(let n=0;n<count;n++){assert(queue.enqueue(dummy(n)));assert(queue.take('Stop').commit())}
   if(mode==='stop-time')now+=STOP_WINDOW_MS;
   router.forResponse(descriptor,response)(packet=>{assert(queue.enqueue(packet));return{accepted:true,input_state:'pending',codex:lease.sdkIdentity}},lease.sdkIdentity);
  }else{
   let enteredCancel,ready;const readyPromise=new Promise(r=>ready=r),cancelEntered=new Promise(r=>enteredCancel=r),cancelGate=new Promise(r=>releaseCancel=r);let steerCalls=0;
   const fake={slushat:f=>listener=f,uvedomit(){},umer:new Promise(()=>{}),zakryt:async()=>{},zapros:async(method)=>{if(method==='initialize')return{};if(method==='thread/start')return{thread:{id:'thread-original'}};if(method==='turn/start')return{turn:{id:'turn-original'}};if(method==='turn/steer'){steerCalls++;enteredCancel();await cancelGate;return{turnId:'turn-original'}};throw Error(method)}};
   const register=router.forResponse(descriptor,response,()=>ready());output=(async()=>{for await(const e of progonAppServer({klientImpl:()=>fake,log(){},zapros:'fixture',porog:{},registerTaskControl:register})){if(e.type==='input-status')await inputs.event(lease,e)}})();await readyPromise;
   const cancel=router.dispatch(descriptor.ticket,{binding:{...binding,control_id:'cancel',target_receipt:'cancel-target'},op:'cancel',body:'cancel original'});await cancelEntered;
   lease.cancel=cancel;lease.steerCalls=()=>steerCalls;
  }
  const control={inputLease:()=>lease,inputAlive:()=>a.status==='running',sendInput:async(_lease,packet)=>{
   dispatches++;const promise=router.dispatch(descriptor.ticket,packet);
   if(mode==='codex-change'){await new Promise(r=>setImmediate(r));await listener('turn/started',{threadId:'thread-original',turn:{id:'turn-new'}});releaseCancel();await lease.cancel}
   transportReply=await promise;return transportReply;
  }};
  inputs=new SdkInbox(l,p.sessions,control,undefined,process.env.DSH_TEST_APP);inputs.dopusk=()=>true;/* стенд механизма живого ввода: допуск выдан явно — B-N-1600 шаг 0 закрыл его для писем без метки, этап 1 выдаст его метке refines */const pauses=new ConversationPause(l,root,()=>{});pauses.sdkInputs=inputs;pauses.attach(a);
  const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.conversationPause=pauses;runtime.sdkInputs=inputs;
  const receipt=l.receive('ordinary-'+mode,Buffer.from('MAIL'),{sender:'fixture'});await runtime.enqueue(receipt,a,()=>msg('MAIL'),'a2a');await inputs.work.get(a);
  if(mode.startsWith('stop-')){assert.equal(inputs.row(receipt.id).state,'accepted');assert.equal(queue.take('Stop'),null)}
  assert.equal(inputs.row(receipt.id).state,'not_offered');assert.equal(l.get(receipt.id).blocked,null);assert(a.inbox.nextTurn.some(x=>x.id===l.get(receipt.id).dsh_id));
  if(mode==='codex-change'){assert.equal(transportReply.input_state,'not-offered');assert.equal(lease.steerCalls(),1);await listener('turn/completed',{threadId:'thread-original',turn:{id:'turn-original',status:'completed'}});await output;output=null}
  releaseNative();await a.whenIdle();await runtime.observe(a.session);const row=l.get(receipt.id),facts=receiptFacts(a.session,[row.dsh_id]).get(row.dsh_id);
  assert.equal(row.outcome,'turn_completed');assert(row.claimed_turn>originalTurn);assert.equal(facts.claims.length,1);assert.equal(dispatches,1);
  const proof={mode,originalTurn,claimedTurn:row.claimed_turn,state:inputs.row(receipt.id).state,outcome:row.outcome,nativeClaims:facts.claims.length,transportDispatches:dispatches,stopCount:queue?.stopCount,elapsedMs:queue?now-queue.stopFirstAt:undefined};results.push(proof);console.log('PASS',JSON.stringify(proof));
 }finally{releaseCancel?.();releaseNative?.();if(output){await listener('turn/completed',{threadId:'thread-original',turn:{id:'turn-original',status:'completed'}});await output}inputs?.dispose();await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}
}
if(process.env.REVIEW_EVIDENCE_FILE)fs.writeFileSync(process.env.REVIEW_EVIDENCE_FILE,JSON.stringify({time:new Date().toISOString(),results},null,2)+'\n');
