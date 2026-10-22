// RU: B-N-1662: настоящие handleUpdate/pollReceiptDirectory/ReceiptRuntime и durable native inbox.
// EN: Received voice must precede later merged-chat mail; transcription alone is an external deferred fixture.
import crypto from 'node:crypto';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {MessageReceipts,mailEnvelope,sobytiyaSessii} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';import {AttachmentStore} from '../src/attachments.js';import {rotateConversation} from '../src/rotate-conversation.js';import {coordinatorFixture} from './coordinator-fixture.mjs';
import {ReceiptRuntime} from '../src/receipt-runtime.js';import {handleTelegramStop} from '../src/telegram-stop.js';
import {extractFunction} from './extract.mjs';import {sGostem} from './gost-kontekst.mjs';import {podnyatPlatformu02} from './platforma-02.mjs';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const factoryStart=source.indexOf('  const receiptRuntime = () => {'),factoryEnd=source.indexOf('  let ownerCopyDelivery',factoryStart);
assert(factoryStart>=0&&factoryEnd>factoryStart,'runtime factory unavailable');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-a2a-order-'));const p=await podnyatPlatformu02({root:path.join(root,'sessions')});
const cases=[];let seq=0;
async function fixture(config={mergeChatIntoA2A:100,a2aSession:'a2a'},sessionId=null){
 const dir=path.join(root,String(++seq));fs.mkdirSync(dir);const input=path.join(dir,'in');fs.mkdirSync(input);let now=2e12;
 const receipts=new MessageReceipts(path.join(dir,'ledger'),{now:()=>now});const nativeHandle=await p.agents.create({sessionId:sessionId??'order-'+seq,meta:{cwd:dir}});const real=nativeHandle.agent;
 const agent={session:real.session,inbox:real.inbox,status:'idle',whenIdle:async()=>{},send:(...args)=>real.send(...args),wakeDriver(){}};
 const logs=[],log=x=>logs.push(x),isAllowed=id=>id===100,allowed=new Set([100]);const ctx={get:name=>name==='sessions'?p.sessions:undefined};
 const scope={ReceiptRuntime,receipts,ctx,log,conversations:{holdsSession:()=>false},conversationPause:null,deployment:{},codexControl:{adapter:()=>({})},sdkInputs:{schedule(){}},config,isAllowed};
 vm.createContext(scope);const runtimeFactory=vm.runInContext('let sharedReceiptRuntime;'+source.slice(factoryStart,factoryEnd)+'receiptRuntime;',scope);
 const platform={createUserMessage:p.llm.createUserMessage};
 const common={...scope,receiptRuntime:runtimeFactory,platform,Buffer,crypto,fs,path,os,process,mailEnvelope,config,allowed,isAllowed,
  A2A_CHAT:config.a2aSession||'a2a',MERGE_CHAT:config.mergeChatIntoA2A?String(config.mergeChatIntoA2A):null,
  agentFor:async()=>({handle:{agent},sessionId:agent.session.id}),lastOrigin:new Map(),tgChatFor:new Map(),
  copyAsk(){},pushAsk(){},stripMark:x=>x,ownerChatId:()=>100,settings:()=>({}),nastrojkaGruppy:()=>null,handleTelegramStop,
  tg:{typing:async()=>{},send:async()=>{}},who_:'fixture',nudgeUntilClaimed(){},oborvalsyaOshibkoj:new Map(),
  setTimeout:(f,ms)=>{const timer=setTimeout(f,ms);timer.unref();return timer;},
  mailStops:{ingest:()=>false},A2A_EXT:['.md','.txt'],a2aReported:new Set(),A2A_TREVOG_PREDEL:5,trevogOtkaza:0,
  splitSender:text=>({text}),spoolSender:()=> 'peer',spoolAgeHours:()=>0,SPOOL_STALE_HOURS:12,spoolPokazanPochtalonom:()=>false};
 let complete,start;const transcribed=new Promise(r=>complete=r),started=new Promise(r=>start=r);
 common.transcribeVoice=async()=>{start();return transcribed;};
 const context=vm.createContext(sGostem(common));const handle=vm.runInContext('('+extractFunction(source,'handleUpdate')+')',context);
 const poll=vm.runInContext('('+extractFunction(source,'pollReceiptDirectory')+')',context);context.handleUpdate=handle;
 const receiveVoice=(chat=100,user=100,kind='voice')=>{const update={update_id:seq,message:{chat:{id:chat,type:'private'},from:{id:user,first_name:'fixture'},[kind]:{file_id:'fixture',duration:1}}};const row=receipts.receive('telegram:'+seq,JSON.stringify(update),{route:'tg',routeKey:chat,hold:false});return {update,row};};
 const mail=()=>{const file=path.join(input,'peer.md');fs.writeFileSync(file,'ПИСЬМО 🙂 '+seq);return file;};
 const texts=()=>sobytiyaSessii(agent.session).filter(e=>e.type==='agent/inbox/spliced').flatMap(e=>e.data.inserted??[]).map(m=>m.content[0].text);
 return{dir,nativeHandle,context,receipts,agent,logs,input,poll,handle,receiveVoice,mail,texts,runtime:runtimeFactory,started,complete,advance:ms=>now+=ms,close:()=>receipts.close()};
}
async function check(name,fn){try{await fn();cases.push({name,code:0});console.log('PASS',name);}catch(e){cases.push({name,code:1,error:e.message});console.error('FAIL',name,e.message);}}
try{
 await check('voice then a2a during transcription: native order is voice, mail; durable source held',async()=>{
  const f=await fixture();let task;
  try{const v=f.receiveVoice();task=f.handle(v.update,v.row);await f.started;f.advance(20);const file=f.mail();await f.poll(f.input,'a2a');
   const whileTranscribing={inbox:f.texts(),sourcePresent:fs.existsSync(file)};console.log('DURING',JSON.stringify(whileTranscribing));
   assert.equal(whileTranscribing.inbox.length,0,'later a2a overtook pending voice');assert(whileTranscribing.sourcePresent);
   const mail=f.receipts.source('file:'+path.resolve(file));assert(mail);assert.equal(f.receipts.get(mail.receipt_id).message_json,null,'held mail must remain unprepared until voice is flushed');
   f.complete('ПЕРВЫЙ ГОЛОС 🙂');await task;task=null;await f.poll(f.input,'a2a');
   assert.equal(f.texts().length,2);assert(f.texts()[0].includes('ПЕРВЫЙ ГОЛОС'));assert(f.texts()[1].includes('ПИСЬМО'));assert(!fs.existsSync(file));
   await f.poll(f.input,'a2a');assert.equal(f.texts().length,2,'no replay');
  }finally{f.complete('ПЕРВЫЙ ГОЛОС 🙂');if(task)await task;f.close();}
 });
 await check('actual polling loop after persistence: pending voice before a2a intake',async()=>{
  const f=await fixture();try{f.receiveVoice();f.advance(1);const file=f.mail();f.complete('ГОЛОС ИЗ ОЧЕРЕДИ');const run={alive:true};
   Object.assign(f.context,{apNotices:null,A2A_IN:f.input,SPOOL_IN:null,attachmentStore:{tick:async()=>{}},receiptTick:async()=>{},
    pollA2A:()=>f.poll(f.input,'a2a'),pollSpool:async()=>{},errDetail:e=>e.message,botKto:async()=>f.context.tg.whoAmI()});
   f.context.tg.whoAmI=async()=>({id:777});f.context.tg.poll=async()=>{run.alive=false;return[];};
   const loop=vm.runInContext('('+extractFunction(source,'loop')+')',f.context);let watchdog;try{await Promise.race([loop(run),new Promise((_,reject)=>watchdog=setTimeout(()=>{run.alive=false;reject(Error('loop timeout: '+f.logs.join(' | ')));},5000))]);}finally{clearTimeout(watchdog);}
   assert(!f.logs.some(x=>x.includes('опрос не удался')),f.logs.join('\n'));
   assert.equal(f.texts().length,1);assert(f.texts()[0].includes('ГОЛОС ИЗ ОЧЕРЕДИ'));assert(fs.existsSync(file));
   await f.poll(f.input,'a2a');assert.equal(f.texts().length,2);assert(f.texts()[1].includes('ПИСЬМО'));assert(!fs.existsSync(file));
  }finally{f.close();}
 });
 await check('earlier mail keeps its place, later voice does not receive priority',async()=>{
  const f=await fixture();try{const file=f.mail();await f.poll(f.input,'a2a');f.advance(10);const v=f.receiveVoice();f.complete('ГОЛОС');await f.handle(v.update,v.row);assert(f.texts()[0].includes('ПИСЬМО'));assert(f.texts()[1].includes('ГОЛОС'));assert(!fs.existsSync(file));}finally{f.close();}
 });
 await check('received-at tie uses receipt insertion order',async()=>{
  const f=await fixture();try{const v=f.receiveVoice(),file=f.mail();await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);f.complete('ГОЛОС');await f.handle(v.update,v.row);await f.poll(f.input,'a2a');assert(f.texts()[0].includes('ГОЛОС'));assert(f.texts()[1].includes('ПИСЬМО'));}finally{f.close();}
 });
 await check('recreated runtime and preserved source retry mail only after earlier voice flush',async()=>{
  const f=await fixture();try{const v=f.receiveVoice();f.advance(1);const file=f.mail();await f.poll(f.input,'a2a');const row=f.receipts.get(f.receipts.source('file:'+path.resolve(file)).receipt_id);
   const fresh=new ReceiptRuntime(f.receipts,p.sessions);fresh.voiceOrder=f.runtime().voiceOrder;
   await fresh.enqueue(row,f.agent,()=>p.llm.createUserMessage({content:[{type:'text',text:'ПИСЬМО'}]}),'a2a');assert.equal(f.texts().length,0);
   f.complete('ГОЛОС');await f.handle(v.update,v.row);await fresh.enqueue(f.receipts.get(row.id),f.agent,()=>p.llm.createUserMessage({content:[{type:'text',text:'ПИСЬМО'}]}),'a2a');assert(f.texts()[0].includes('ГОЛОС'));assert(f.texts()[1].includes('ПИСЬМО'));
  }finally{f.close();}
 });
 await check('deadline: held at 354999 ms, released at 355000 ms with one named audit',async()=>{
  const f=await fixture();try{f.receiveVoice();f.advance(1);const file=f.mail();await f.poll(f.input,'a2a');f.advance(354998);await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);assert(fs.existsSync(file));f.advance(1);await f.poll(f.input,'a2a');assert.equal(f.texts().length,1);assert(!fs.existsSync(file));assert.equal(f.receipts.db.prepare("SELECT count(*) n FROM audit WHERE kind='voice_order_expired'").get().n,1);assert(f.logs.some(x=>x.includes('355000')));}finally{f.close();}
 });
 await check('transcription failure and terminal voice release mail immediately',async()=>{
  const f=await fixture();let task;try{const v=f.receiveVoice();task=f.handle(v.update,v.row);await f.started;f.advance(1);const file=f.mail();await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);f.complete(null);await task;task=null;f.receipts.completeLocal(v.row.id,'channel_returned','transcription failed');await f.poll(f.input,'a2a');assert.equal(f.texts().length,1);assert(!fs.existsSync(file));}finally{f.complete(null);if(task)await task;f.close();}
 });
 for(const [name,config,chat,user] of [
  ['merge off',{a2aSession:'a2a'},100,100],['other chat',{mergeChatIntoA2A:100,a2aSession:'a2a'},200,100],['unauthorized voice',{mergeChatIntoA2A:100,a2aSession:'a2a'},100,999]]){
  await check(name+' does not hold a2a',async()=>{const f=await fixture(config);try{f.receiveVoice(chat,user);f.advance(1);const file=f.mail();await f.poll(f.input,'a2a');assert.equal(f.texts().length,1);assert(!fs.existsSync(file));}finally{f.close();}});
 }
 await check('spool mail targeting same conversation waits too; audio included',async()=>{
  const f=await fixture();try{const v=f.receiveVoice(100,100,'audio');f.advance(1);const file=f.mail();await f.poll(f.input,'spool');assert.equal(f.texts().length,0);assert(fs.existsSync(file));f.complete('AUDIO');await f.handle(v.update,v.row);await f.poll(f.input,'spool');assert(f.texts()[0].includes('AUDIO'));assert(f.texts()[1].includes('ПИСЬМО'));}finally{f.close();}
 });
 await check('custom pipeline limit and two earlier voices: each flush or deadline releases its place',async()=>{
  const f=await fixture({mergeChatIntoA2A:100,a2aSession:'a2a',transcribeTimeoutMs:20,telegramFileTimeoutMs:10});
  try{const first=f.receiveVoice();f.advance(1);const second={update_id:990,message:{chat:{id:100,type:'private'},from:{id:100},voice:{file_id:'second'}}};
   const row=f.receipts.receive('telegram:second',JSON.stringify(second),{route:'tg',routeKey:100,hold:false});f.advance(1);const file=f.mail();await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);
   f.complete('ГОЛОС 1');await f.handle(first.update,first.row);await f.poll(f.input,'a2a');assert.equal(f.texts().length,1);assert(fs.existsSync(file));
   await f.handle(second,row);await f.poll(f.input,'a2a');assert.equal(f.texts().length,3);assert(f.texts()[2].includes('ПИСЬМО'));
  }finally{f.close();}
 });
 await check('other conversation and site input are not held by owner voice',async()=>{
  const f=await fixture();try{f.receiveVoice();f.advance(1);const row=f.receipts.receive('other-route','other');
   await f.runtime().enqueue(row,f.agent,()=>p.llm.createUserMessage({content:[{type:'text',text:'OTHER'}]}),'different');
   const site=f.receipts.receive('site','site',{route:'site'});await f.runtime().enqueue(site,f.agent,()=>p.llm.createUserMessage({content:[{type:'text',text:'SITE'}]}),'a2a');
   assert.deepEqual(f.texts(),['OTHER','SITE']);
  }finally{f.close();}
 });
 await check('held mail then native /new: cancellation releases original file without a fake flush',async()=>{
  const f=await fixture(undefined,'telegram-a2a');try{f.receiveVoice();f.advance(1);const file=f.mail();await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);
   const receipt=f.receipts.source('file:'+path.resolve(file)).receipt_id;
   await p.sessions.flush(f.agent.session);const conversations=new ConversationSessions(f.receipts);conversations.pin('a2a',f.agent.session.header);
   const cmd=f.receipts.receive('new-command','/new',{route:'tg',routeKey:100,hold:false});
   const ctx={agents:p.agents,get:name=>name==='schedule'?{catalog:async()=>[],delete:async()=>({deleted:true})}:p.ctx.get(name)};
   await rotateConversation({conversations,ledger:f.receipts,attachments:new AttachmentStore({workspace:f.dir}),ctx,key:'a2a',receiptId:cmd.id,cwd:f.dir,
    createAgent:id=>p.agents.create({sessionId:id,meta:{cwd:f.dir}}),checkCapability:async()=>{},mergeChat:'100',a2aChat:'a2a',enabled:true,
    entry:{handle:f.nativeHandle,sessionId:f.agent.session.id},observe:s=>p.sessions.flush(s)});
   assert.equal(f.receipts.get(receipt).outcome,'cancelled_by_new');f.receipts.release(receipt,'file:'+path.resolve(file));assert(!fs.existsSync(file));
  }finally{f.close();}
 });
 await check('signed supersedes cancels received-held A before dispatch; voice then B only',async()=>{
  const f=await fixture();try{f.context.SPOOL_IN=path.join(f.dir,'fixture-agent');const sign=coordinatorFixture(f.receipts,'fixture-agent'),uuid=f.receipts.protocolIdentity();f.receiveVoice();f.advance(1);
   const envelope=(id,target)=>'[a2a-envelope version=2]\n'+JSON.stringify({kind:'decision',delivery_id:id,decision_id:id,recipient:{id:'fixture-agent',ledger_uuid:uuid},supersedes:target?{recipient:'fixture-agent',ledger_uuid:uuid,decision_id:target}:null})+'\nTASK_'+id;
   fs.writeFileSync(path.join(f.input,'a.md'),sign(envelope('A',null),'A','decision'));await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);
   fs.writeFileSync(path.join(f.input,'b.md'),sign(envelope('B','A'),'B','supersede'));await f.poll(f.input,'a2a');
   const a=f.receipts.db.prepare('SELECT receipt_id FROM decision_index WHERE decision_id=?').get('A');assert(a);assert.equal(f.receipts.get(a.receipt_id).outcome,'canceled_before_run');assert.equal(f.texts().length,0);
   const voice=f.receipts.db.prepare("SELECT * FROM receipts WHERE route='tg'").get();f.complete('ГОЛОС');await f.handle(JSON.parse(Buffer.from(voice.raw)),voice);await f.poll(f.input,'a2a');
   assert.equal(f.texts().length,2);assert(f.texts()[0].includes('ГОЛОС'));assert(f.texts()[1].includes('TASK_B'));assert(!f.texts().some(x=>x.includes('TASK_A')));
  }finally{f.close();}
 });
 await check('signed held admission resumes after expiry, changed bytes and new-path replay stay refused',async()=>{
  const f=await fixture();try{f.context.SPOOL_IN=path.join(f.dir,'fixture-agent');const sign=coordinatorFixture(f.receipts,'fixture-agent');const voice=f.receiveVoice();f.advance(1);
   const file=path.join(f.input,'a.md'),bytes=sign('SIGNED_TASK 🙂','signed-once','message');fs.writeFileSync(file,bytes);await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);
   const replay=path.join(f.input,'z.md');fs.writeFileSync(replay,bytes);await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);assert(f.logs.some(x=>x.includes('replay')));
   assert.equal(f.receipts.db.prepare("SELECT count(*) n FROM audit WHERE kind='coordinator_signature_verified'").get().n,1,'resume is not a new verified admission');
   f.advance(900001);f.complete('ГОЛОС');await f.handle(voice.update,voice.row);
   const forged=JSON.parse(bytes.toString().slice(bytes.indexOf(10)+1));forged.payload=Buffer.from('FORGED_TASK').toString('base64');
   fs.writeFileSync(file,'[coordinator-signature version=1]\n'+JSON.stringify(forged));await f.poll(f.input,'a2a');assert.equal(f.texts().length,1,'changed valid-shaped wire must not be admitted after voice flush');
   fs.writeFileSync(file,bytes);await f.poll(f.input,'a2a');assert.equal(f.texts().length,2);assert(f.texts()[0].includes('ГОЛОС'));assert(f.texts()[1].includes('SIGNED_TASK'));
   fs.writeFileSync(file,bytes);await f.poll(f.input,'a2a');assert.equal(f.texts().length,2);assert(f.logs.some(x=>x.includes('expired')),'released path cannot gain continued admission');
  }finally{f.close();}
 });
 await check('signed held receipt cannot resume through spool channel',async()=>{
  const f=await fixture();try{f.context.SPOOL_IN=path.join(f.dir,'fixture-agent');const base=coordinatorFixture(f.receipts,'fixture-agent'),verify=f.receipts.coordinator;f.receipts.coordinator=(raw,receiver,channel)=>channel==='spool'?{signed:true,trusted:false,reason:'wrong_channel'}:verify(raw,receiver,channel);
   f.receiveVoice();f.advance(1);const file=path.join(f.input,'a.md');fs.writeFileSync(file,base('SIGNED_TASK','only-a2a','message'));await f.poll(f.input,'a2a');assert.equal(f.texts().length,0);await f.poll(f.input,'spool');assert.equal(f.texts().length,0);assert(f.logs.some(x=>x.includes('wrong_channel')));
  }finally{f.close();}
 });
 if(process.env.REVIEW_EVIDENCE_FILE)fs.writeFileSync(process.env.REVIEW_EVIDENCE_FILE,JSON.stringify({at:new Date().toISOString(),cases},null,2)+'\n');
 console.log('SUMMARY',cases.filter(x=>!x.code).length+'/'+cases.length);process.exitCode=cases.some(x=>x.code)?1:0;
}finally{await p.ctx.fiber.dispose();fs.rmSync(root,{recursive:true,force:true});}
