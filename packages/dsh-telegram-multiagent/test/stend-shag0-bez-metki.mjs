// RU: B-N-1600 шаг 0 (условие У1 ворот): письмо БЕЗ метки посреди хода не подаётся — одно ожидание для Claude и Codex.
//     Claude — ПОДПИСАННОЕ письмо координатора через настоящий callback шлюза (gateway.mjs, op 'message'): неподписанное
//     шлюз отверг бы и без фильтра (signature-unverified), и проба была бы зелёной вслепую.
//     Codex — НЕподписанное письмо; приём шлюза здесь — модель steer, принимающая verified=false, как настоящий
//     (stend-claude-input-signature-native, случай «Codex-unverified-user-steer-preserved»). Код кандидата настоящий:
//     платформа 0.2, ReceiptRuntime, SdkInbox, ledger.
//     Ожидание: отправок в шлюз 0, строки sdk_inputs нет, письмо исполнено СЛЕДУЮЩИМ ходом.
//     Порча «снять фильтр» (bezMetkiVOchered → true в src/sdk-inbox.js) обязана покраснеть в ОБОИХ случаях.
// EN: B-N-1600 step 0: unmarked mail never enters a running turn — same expectation for Claude (signed) and Codex (unsigned).
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import http from 'node:http';import {EventEmitter} from 'node:events';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts,sobytiyaSessii} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {SdkInbox} from '../src/sdk-inbox.js';
import {CodexTaskControl} from '../src/codex-task-control.js';
import {verifyCoordinator,signCoordinator} from '../src/coordinator-signature.js';
import {gatewayDir,iz} from './sosedi.mjs';
const gw=gatewayDir();const {TurnInboxQueue,parseInboxPayload}=await iz(gw,'inbox-input.mjs');const {TaskControlRouter}=await iz(gw,'task-control.mjs');
const source=fs.readFileSync(path.join(gw,'gateway.mjs'),'utf8');
const start=source.indexOf("if(packet.op==='message'){"),end=source.indexOf("if (packet.op !== 'cancel'",start);assert(start>=0&&end>start);
const claudeCallback=new Function('packet','inputStatus','inputQueue','ack','parseInboxPayload','bZakryt','signalDan','prervanPoStop','rezultatPrishyol','explicitMailStop','explicitMailStop??=false;'+source.slice(start,end));
const index=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const pubStart=index.indexOf('        if(auth.trusted&&r.fresh)receipts.audit('),pubEnd=index.indexOf('\n\n',pubStart);assert(pubStart>=0&&pubEnd>pubStart);
const publish=new Function('auth','r','receipts',index.slice(pubStart,pubEnd));

async function stend(put){const root=fs.mkdtempSync(path.join(os.tmpdir(),'shag0-'+put+'-'));let p,l,inputs,release,server,closeLease,unregister;
 try{
  p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));
  const {agent:a}=await p.agents.create({sessionId:'fixture-'+put,agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}});p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));
  let enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);let calls=0;
  p.ctx.get('llm').stream=async function*(){if(++calls===1){enter();await gate}yield{type:'text-delta',index:0,text:'fixture reply'};yield{type:'finish',reason:{kind:'stop'}}};
  const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});
  a.followup(msg('FIRST'));await entered;const turn=sobytiyaSessii(a.session).findLast(x=>x.type==='turn/start').data.turn;
  let sendCount=0,hookText=null,raw,auth,text='обычное письмо без метки 🙂';
  if(put==='claude'){
   const router=new TaskControlRouter();server=http.createServer((req,res)=>router.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
   const control=new CodexTaskControl(l,'fixture');inputs=new SdkInbox(l,p.sessions,control,undefined,process.env.DSH_TEST_APP);control.sdkInputs=inputs;
   const iface=control.attach(a,'http://127.0.0.1:'+server.address().port,{allowCancel:true,allowMessage:true});assert(iface);closeLease=iface.close;
   const engine={thread_id:'sdk-thread-claude',turn_id:'sdk-turn-claude'},events=[];const eventPromises=[];
   const actualSend=control.sendInput.bind(control);control.sendInput=async(lease,input)=>{sendCount++;return actualSend(lease,input)};
   const inputStatus=(input,state,reason)=>{const ev={type:'input-status',state,reason,binding:input.binding,method:'claude-hook',codex:engine};events.push(ev);eventPromises.push(iface.inputEvent(ev))};
   const queue=new TurnInboxQueue({offered:input=>inputStatus(input,'offered'),notOffered:(input,r)=>inputStatus(input,'not-offered',r)});
   let ready;const readyPromise=new Promise(r=>ready=r);
   const register=router.forResponse(iface.descriptor,new EventEmitter(),async(binding,codex,request_id)=>{await iface.inputEvent({type:'input-status',state:'ready',binding,codex,request_id});ready()});
   unregister=register(input=>claudeCallback(input,inputStatus,queue,{accepted:true,codex:engine,model_response:'unknown'},parseInboxPayload,false,false,false,false),engine);await readyPromise;
   const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const now=Date.now();
   raw=signCoordinator(Buffer.from(text),{action:'message',delivery_id:'delivery-shag0',key_id:'fixture-key',recipient:'fixture',ledger_uuid:l.protocolIdentity(),issued_at:now,expires_at:now+60000},privateKey);
   auth=verifyCoordinator(raw,{db:l.db,trust:{version:1,status:'approved',maxLifetimeMs:60000,clockSkewMs:0,keys:{'fixture-key':publicKey.export({type:'spki',format:'pem'})}},recipient:'fixture',ledger:l.protocolIdentity(),now});assert.equal(auth.trusted,true);
   const pauses=new ConversationPause(l,root,()=>{});pauses.sdkInputs=inputs;pauses.attach(a);const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.sdkInputs=inputs;runtime.conversationPause=pauses;
   const receipt=l.receive('mail-claude',raw,{sender:'fixture'});publish(auth,receipt,l);
   assert(l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='coordinator_signature_verified'").get(receipt.id),'письмо обязано быть подписанным — иначе проба слепа');
   await runtime.enqueue(receipt,a,()=>msg(auth.payload.toString('utf8')),'a2a');await inputs.work.get(a);await Promise.all(eventPromises);
   const plan=queue.take('PostToolBatch');if(plan){hookText=plan.text;plan.commit()}await Promise.all(eventPromises);
   return await itog(put,a,l,inputs,receipt,turn,sendCount,hookText,release,runtime);
  }
  const binding={generation:l.owner,recipient:'fixture',ledger_uuid:l.protocolIdentity(),session_id:a.session.id,session_created:a.session.header.createdAt,turn};
  const lease={agent:a,session:a.session,descriptor:{binding,request_id:'fixture-lease'},sdkIdentity:{thread_id:'fixture-thread',turn_id:'fixture-turn'}};let captured;
  const control={inputLease:()=>lease,inputAlive:()=>a.status==='running',sendInput:async(_lease,packet)=>{captured=packet;sendCount++;
   assert.equal(parseInboxPayload(packet).provenance.verified,false,'Codex-письмо в пробе неподписанное');
   return{accepted:true,binding:packet.binding,input_state:'pending',model_response:'unknown',codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'}}}};
  inputs=new SdkInbox(l,p.sessions,control,undefined,process.env.DSH_TEST_APP);const pauses=new ConversationPause(l,root,()=>{});pauses.sdkInputs=inputs;pauses.attach(a);
  const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.conversationPause=pauses;runtime.sdkInputs=inputs;
  const receipt=l.receive('mail-codex',Buffer.from(text),{sender:'fixture'});
  assert(!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='coordinator_signature_verified'").get(receipt.id));
  await runtime.enqueue(receipt,a,()=>msg(text),'a2a');await inputs.work.get(a);
  if(captured)await inputs.event(lease,{state:'offered',binding:captured.binding,method:'codex-steer',codex:{thread_id:'fixture-thread',turn_id:'fixture-turn'}});
  return await itog(put,a,l,inputs,receipt,turn,sendCount,null,release,runtime);
 }finally{release?.();inputs?.dispose();closeLease?.();unregister?.();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}
}
async function itog(put,a,l,inputs,receipt,turn,sendCount,hookText,release,runtime){
 const sdkRow=inputs.row(receipt.id)??null;release();await a.whenIdle();await runtime.observe(a.session);const row=l.get(receipt.id);
 const fakt={put,sendCount,sdkInput:sdkRow?.state??null,hookFrame:!!hookText?.includes('[ordinary-inbox/1]'),turnPrishlo:turn,claimedTurn:row.claimed_turn,outcome:row.outcome};
 const oshibki=[];
 if(sendCount!==0)oshibki.push(`отправок в шлюз ${sendCount}, ожидалось 0`);
 if(sdkRow!==null)oshibki.push(`строка sdk_inputs ${sdkRow.state}, ожидалось нет`);
 if(fakt.hookFrame)oshibki.push('письмо попало в hook текущего хода');
 if(!(row.claimed_turn>turn))oshibki.push(`исполнено в ходе ${row.claimed_turn}, ожидался следующий после ${turn}`);
 if(row.outcome!=='turn_completed')oshibki.push(`исход ${row.outcome}, ожидался turn_completed`);
 console.log(oshibki.length?'FAIL':'PASS',put,JSON.stringify(fakt),oshibki.join('; '));return oshibki.length===0;
}
const claude=await stend('claude'),codex=await stend('codex');
if(!(claude&&codex)){console.log('КРАСНО: письмо без метки вошло посреди хода хотя бы на одном пути');process.exit(1)}
console.log('PASS шаг 0: письмо без метки — следующим ходом, одинаково на Claude (подписанное) и Codex (неподписанное)');
