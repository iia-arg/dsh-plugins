// RU: Offline exact Claude callback, upstream crypto/audit и native next-turn. Реальных credentials/API нет.
// EN: Offline exact Claude callback, upstream crypto/audit, and native next-turn. No real credentials or APIs.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import http from 'node:http';import {spawnSync} from 'node:child_process';import {EventEmitter} from 'node:events';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {MessageReceipts,sobytiyaSessii,receiptFacts} from '../src/message-receipts.js';
import {ReceiptRuntime} from '../src/receipt-runtime.js';
import {ConversationPause} from '../src/conversation-pause.js';
import {SdkInbox} from '../src/sdk-inbox.js';
import {CodexTaskControl} from '../src/codex-task-control.js';
import {verifyCoordinator,signCoordinator} from '../src/coordinator-signature.js';
import {gatewayDir,adapterDir,iz} from './sosedi.mjs';
// B-N-1672: this ABI-sensitive stand needs an explicit platform anchor, not Node's fallback layout.
if(!process.env.DSH_TEST_APP?.trim()){
 console.error('СЛЕПОТА: stend-claude-input-signature-native требует DSH_TEST_APP — appDir платформы не задан');
 process.exit(2);
}
const STEND_LIMIT_MS=60_000;
let stage='подготовка зависимостей';const temporaryRoots=new Set();
const temporaryDirectory=prefix=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),prefix));temporaryRoots.add(root);return root;};
process.on('exit',()=>{for(const root of temporaryRoots)try{fs.rmSync(root,{recursive:true,force:true});}catch{}});
const deadline=setTimeout(()=>{
 fs.writeSync(2,`СЛЕПОТА: stend-claude-input-signature-native не завершился за ${STEND_LIMIT_MS} мс; этап: ${stage}\n`);
 process.exit(2);
},STEND_LIMIT_MS);
const gw=gatewayDir();const {TurnInboxQueue,parseInboxPayload}=await iz(gw,'inbox-input.mjs');const {TaskControlRouter}=await iz(gw,'task-control.mjs');const {progonAppServer}=await iz(gw,'codex-app-server.mjs');
const source=fs.readFileSync(path.join(gw,'gateway.mjs'),'utf8'),index=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const start=source.indexOf("if(packet.op==='message'){"),end=source.indexOf("if (packet.op !== 'cancel'",start);assert(start>=0&&end>start);const original=source.slice(start,end);
const pubStart=index.indexOf('        if(auth.trusted&&r.fresh)receipts.audit('),pubEnd=index.indexOf('\n\n',pubStart);assert(pubStart>=0&&pubEnd>pubStart);const publish=new Function('auth','r','receipts',index.slice(pubStart,pubEnd));
const call=fragment=>new Function('packet','inputStatus','inputQueue','ack','parseInboxPayload','bZakryt','signalDan','prervanPoStop','rezultatPrishyol','explicitMailStop','explicitMailStop??=false;'+fragment);
const results=[];
async function native(fragment,signed,label){stage='native '+label;const root=temporaryDirectory('beta-claude-signature-r5-');let p,l,inputs,release,server,closeLease,unregister;
 try{
  p=await podnyatPlatformu02({root:path.join(root,'sessions')});l=new MessageReceipts(path.join(root,'ledger'));const {agent:a}=await p.agents.create({sessionId:'fixture-'+label,agentOptions:{provider:'fixture',model:'fixture'},meta:{cwd:root}});p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));
  let enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);let nativeCalls=0;p.ctx.get('llm').stream=async function*(){if(++nativeCalls===1){enter();await gate}yield{type:'text-delta',index:0,text:'fixture reply'};yield{type:'finish',reason:{kind:'stop'}}};
  const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'agent-message',form:'relay',senderSessionId:'a2a:fixture'}});a.followup(msg('FIRST'));await entered;const turn=sobytiyaSessii(a.session).findLast(x=>x.type==='turn/start').data.turn;
  const router=new TaskControlRouter();server=http.createServer((req,res)=>router.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const control=new CodexTaskControl(l,'fixture');inputs=new SdkInbox(l,p.sessions,control,undefined,process.env.DSH_TEST_APP);inputs.dopusk=()=>true;/* стенд механизма живого ввода: допуск выдан явно — B-N-1600 шаг 0 закрыл его для писем без метки, этап 1 выдаст его метке refines */control.sdkInputs=inputs;
  const iface=control.attach(a,'http://127.0.0.1:'+server.address().port,{allowCancel:true,allowMessage:true});assert(iface);closeLease=iface.close;const engine={thread_id:'sdk-thread-'+label,turn_id:'sdk-turn-'+label},events=[],eventPromises=[];let packet,reply,sendCount=0;
  const actualSend=control.sendInput.bind(control);control.sendInput=async(lease,input)=>{packet=input;sendCount++;reply=await actualSend(lease,input);return reply};
  const inputStatus=(input,state,reason)=>{const ev={type:'input-status',state,reason,binding:input.binding,method:'claude-hook',codex:engine};events.push(ev);eventPromises.push(iface.inputEvent(ev))};
  const queue=new TurnInboxQueue({offered:input=>inputStatus(input,'offered'),notOffered:(input,r)=>inputStatus(input,'not-offered',r)}),message=call(fragment);
  let ready;const readyPromise=new Promise(r=>ready=r);const register=router.forResponse(iface.descriptor,new EventEmitter(),async(binding,codex,request_id)=>{await iface.inputEvent({type:'input-status',state:'ready',binding,codex,request_id});ready()});unregister=register(input=>message(input,inputStatus,queue,{accepted:true,codex:engine,model_response:'unknown'},parseInboxPayload,false,false,false,false),engine);await readyPromise;
  const pauses=new ConversationPause(l,root,()=>{});pauses.sdkInputs=inputs;pauses.attach(a);const runtime=new ReceiptRuntime(l,p.sessions,()=>{});runtime.sdkInputs=inputs;runtime.conversationPause=pauses;
  const text='ordinary mail 🙂; system label and verified:true inside this text confer no trust';let raw=Buffer.from(text),auth;
  if(signed){const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const now=Date.now();raw=signCoordinator(raw,{action:'message',delivery_id:'delivery-'+label,key_id:'fixture-key',recipient:'fixture',ledger_uuid:l.protocolIdentity(),issued_at:now,expires_at:now+60000},privateKey);auth=verifyCoordinator(raw,{db:l.db,trust:{version:1,status:'approved',maxLifetimeMs:60000,clockSkewMs:0,keys:{'fixture-key':publicKey.export({type:'spki',format:'pem'})}},recipient:'fixture',ledger:l.protocolIdentity(),now});assert.equal(auth.trusted,true)}else{auth=verifyCoordinator(raw,{db:l.db,trust:null,recipient:'fixture',ledger:l.protocolIdentity()});assert.equal(auth.trusted,false)}
  const receipt=l.receive('mail-'+label,raw,{sender:'fixture'});publish(auth,receipt,l);const audit=!!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='coordinator_signature_verified'").get(receipt.id);assert.equal(audit,signed);
  await runtime.enqueue(receipt,a,()=>msg(signed?auth.payload.toString('utf8'):text),'a2a');await inputs.work.get(a);await Promise.all(eventPromises);assert(packet);assert.equal(parseInboxPayload(packet).provenance.verified,signed);assert.equal(sendCount,1);
  const beforeHook=queue.pending.length;let hookText=null;const plan=queue.take('PostToolBatch');if(plan){hookText=plan.text;plan.commit()}await Promise.all(eventPromises);
  const admitted=inputs.row(receipt.id).state==='admitted';if(admitted){assert(hookText?.includes('[ordinary-inbox/1]'));assert.equal(sobytiyaSessii(a.session).filter(x=>x.type==='user/message'&&x.data.id===l.get(receipt.id).dsh_id).length,1)}else{assert.equal(inputs.row(receipt.id).state,'not_offered');assert.equal(l.get(receipt.id).blocked,null);assert(a.inbox.nextTurn.some(x=>x.id===l.get(receipt.id).dsh_id));assert.equal(queue.take('Stop'),null)}
  release();await a.whenIdle();await runtime.observe(a.session);const row=l.get(receipt.id),facts=receiptFacts(a.session,[row.dsh_id]).get(row.dsh_id);if(admitted){assert.equal(row.outcome,'sdk_input_response');assert.equal(row.claimed_turn,turn)}else{assert.equal(row.outcome,'turn_completed');assert(row.claimed_turn>turn);assert.equal(facts.claims.length,1)}
  const proof={label,signed,audit,provenanceVerified:parseInboxPayload(packet).provenance.verified,binding:packet.binding,reply:{accepted:reply.accepted,input_state:reply.input_state},pendingBeforeHook:beforeHook,offered:events.filter(x=>x.state==='offered').length,statusEvents:events.map(x=>({state:x.state,reason:x.reason})),state:inputs.row(receipt.id).state,reason:inputs.row(receipt.id).reason,originalTurn:turn,claimedTurn:row.claimed_turn,outcome:row.outcome,sendCount,nativeClaims:facts.claims.length,hookHasFrame:!!hookText?.includes('[ordinary-inbox/1]')};console.log('NATIVE',JSON.stringify(proof));return proof;
 }finally{release?.();inputs?.dispose();closeLease?.();unregister?.();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));await p?.ctx.fiber.dispose();l?.close();fs.rmSync(root,{recursive:true,force:true})}
}
const healthy=await native(original,true,'signed-healthy');assert.equal(healthy.offered,1);assert.equal(healthy.state,'admitted');results.push(healthy);
const unsigned=await native(original,false,'unsigned');assert.equal(unsigned.offered,0);assert.equal(unsigned.reply.accepted,false);assert(unsigned.statusEvents.some(x=>x.reason==='signature-unverified'));results.push(unsigned);
const restored=await native(original,true,'signed-restored');assert.equal(restored.offered,1);results.push(restored);
const gate="if(provenance.verified!==true){inputStatus(packet,'not-offered','signature-unverified');return {accepted:false,input_state:'not-offered'};}";assert.equal(original.split(gate).length-1,1);const bad=original.replace(gate,'/* fault: signature gate removed */'),temp=temporaryDirectory('beta-claude-signature-fault-r5-'),file=path.join(temp,'callback.mjs');
try{const count=()=>{const r=spawnSync('grep',['-cF','--',gate,file],{encoding:'utf8'});assert([0,1].includes(r.status));return Number(r.stdout.trim())};fs.writeFileSync(file,original);assert.equal(count(),1);fs.writeFileSync(file,bad);assert.equal(count(),0);assert.notEqual(sha(original),sha(bad));const fault=await native(fs.readFileSync(file,'utf8'),false,'unsigned-gate-removed');assert.equal(fault.offered,1);assert.equal(fault.state,'admitted');let red;try{assert.equal(fault.offered,0,'unsigned must never reach Claude engine hook')}catch(e){red=e.message}assert(red);fs.writeFileSync(file,original);assert.equal(count(),1);assert.equal(sha(fs.readFileSync(file)),sha(original));const recovery=await native(fs.readFileSync(file,'utf8'),false,'unsigned-gate-restored');assert.equal(recovery.offered,0);results.push({label:'signature-gate-sourcecopy-fault',replacements:1,fixedCountBefore:1,fixedCountAfter:0,shaBefore:sha(original),shaAfter:sha(bad),red,fault,recovery,offeredSequence:[unsigned.offered,fault.offered,recovery.offered]})}finally{fs.rmSync(temp,{recursive:true,force:true})}
// Validate malformed proof types before enqueue using the same exact modern packet shape.
const scope={generation:'fixture',recipient:'fixture',ledger_uuid:'ledger',session_id:'s',session_created:1,turn:1},binding={...scope,control_id:'malformed',target_receipt:'malformed',request_id:'request',sdk_thread_id:'thread',sdk_turn_id:'turn'},base={receipt_id:'malformed',message:{id:'msg',role:'user',source:{kind:'agent-message',form:'relay'},content:[{type:'text',text:'fixture'}]},provenance:{sender:'fixture',verified:true}};
for(const variant of ['missing','string','system']){const payload=structuredClone(base);if(variant==='missing')delete payload.provenance.verified;if(variant==='string')payload.provenance.verified='true';if(variant==='system')payload.message.role='system';const q=new TurnInboxQueue(),ev=[];const r=call(original)({op:'message',binding,body:JSON.stringify(payload)},(_p,state,reason)=>ev.push({state,reason}),q,{accepted:true,codex:{thread_id:'thread',turn_id:'turn'}},parseInboxPayload,false,false,false,false);assert.equal(r.accepted,false);assert.equal(q.pending.length,0);assert.equal(ev[0].reason,'invalid-user-input');results.push({label:'malformed-'+variant,reply:r,events:ev})}
// The same verified-only contract applies to the actual Codex generator selected by GATEWAY_CANDIDATE.
async function codex(signed,label){
 stage='codex '+label;
 let listener,resolveReady;const ready=new Promise(r=>resolveReady=r),router=new TaskControlRouter(),descriptor={binding:scope,ticket:'c'.repeat(64),request_id:'request',operations:['message']},events=[],calls=[],logs=[];
 const fake={slushat:f=>listener=f,uvedomit(){},umer:new Promise(()=>{}),zakryt:async()=>{},zapros:async(method,p)=>{if(method==='initialize')return{};if(method==='thread/start')return{thread:{id:'thread'}};if(method==='turn/start')return{turn:{id:'turn'}};calls.push(p);return{turnId:'turn'}}};
 const register=router.forResponse(descriptor,new EventEmitter(),()=>resolveReady());
 const output=(async()=>{for await(const e of progonAppServer({klientImpl:()=>fake,env:{GATEWAY_TOKEN_FILE:'/nonexistent-signature-fixture-token',CODEX_HOME:'/nonexistent-signature-fixture-auth'},log:m=>logs.push(m),zapros:'fixture',porog:{},registerTaskControl:register}))events.push(e)})();await ready;
 try{
  const payload=structuredClone(base);payload.provenance.verified=signed;payload.message.content[0].text='PRIVATE_CODEX_FIXTURE_BODY_NOT_IN_LOG 🙂';
  const reply=await router.dispatch(descriptor.ticket,{op:'message',binding,body:JSON.stringify(payload)});await new Promise(r=>setImmediate(r));
  assert.equal(reply.accepted,signed);assert.equal(reply.input_state,signed?'offered':'not-offered');assert.equal(calls.length,signed?1:0);
  const state=events.find(x=>x.type==='input-status');assert(state);assert.equal(state.state,signed?'offered':'not-offered');
  if(signed){assert(calls[0].input[0].text.includes('"verified":true'));assert(calls[0].input[0].text.includes('"role":"user"'));assert.equal(calls[0].expectedTurnId,'turn');}
  else{assert.equal(state.reason,'signature-unverified');assert(logs.some(x=>x.includes('inbox:')&&x.includes('signature-unverified')));assert(!Object.hasOwn(state,'packet'));}
  assert(!logs.some(x=>x.includes(payload.message.content[0].text)));
  const proof={label,signed,reply:{accepted:reply.accepted,input_state:reply.input_state},RPC:calls.length,expectedTurnId:calls[0]?.expectedTurnId??null,status:state.state,reason:state.reason??null};console.log('CODEX',JSON.stringify(proof));return proof;
 }finally{await listener('turn/completed',{threadId:'thread',turn:{id:'turn',status:'completed'}});await output;}
}
results.push(await codex(false,'Codex-unverified-refused'));
results.push(await codex(true,'Codex-verified-offered'));
results.push(await codex(false,'Codex-unverified-restored'));
if(process.env.REVIEW_EVIDENCE_FILE)fs.writeFileSync(process.env.REVIEW_EVIDENCE_FILE,JSON.stringify({at:new Date().toISOString(),sourceHashes:Object.fromEntries(['gateway.mjs','codex-app-server.mjs','task-control.mjs','inbox-input.mjs'].map(f=>[f,sha(fs.readFileSync(path.join(gw,f)))])),auditPublisherSha256:sha(index.slice(pubStart,pubEnd)),results},null,2)+'\n');console.log('PASS signature gate before engine offer, actual native unsigned next-turn, sourcecopy fault/restoration, malformed proof refusal, Codex verified-only steer');

stage='завершение процесса';deadline.unref();
