import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {MessageReceipts} from '../src/message-receipts.js';
import {ConversationSessions} from '../src/conversation-sessions.js';
import {MailStopReceiver} from '../src/mail-stop-receiver.js';
import {signCoordinator} from '../src/coordinator-signature.js';
import {signStopStatus,verifyStopStatus} from '../src/mail-stop-protocol.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mail-new-receiver-'));
const coordinator=generateKeyPairSync('ed25519'),signer=generateKeyPairSync('ed25519');
let now=1000000,l,c,processor,statuses=[],rotations=0,mode='idle',failure=null;
const statusesDecoded=()=>statuses.map(raw=>{const parsed=verifyStopStatus(raw,{keys:{status:signer.publicKey.export({type:'spki',format:'pem'})},receivers:{status:'alfa'},recipient:'zabava',ledger:'reply',now});assert(parsed.verified);return parsed.status});
try{
 l=new MessageReceipts(dir,{owner:'generation1',now:()=>now});c=new ConversationSessions(l);
 c.pin('a2a',{id:'telegram-a2a',createdAt:10});
 const agent={status:'idle',session:{id:'telegram-a2a',events:[{type:'turn/start',data:{turn:7}}],header:{id:'telegram-a2a',createdAt:10,cwd:'/fixture'}},inbox:{nextTurn:[],nextStep:[]}};
 const trust={version:1,status:'approved',maxLifetimeMs:120000,clockSkewMs:0,controlKeys:{coord:coordinator.publicKey.export({type:'spki',format:'pem'})},controlPermissions:{coord:{principal:'zabava',recipients:['*'],modes:['new']}},returnRoutes:{coord:{recipient:'zabava',ledger_uuid:'reply',directory:'/fixture/in'}}};
 const wire=(id,body='')=>signCoordinator(Buffer.from('[a2a-envelope version=2]\n'+JSON.stringify({kind:'task-stop/1',delivery_id:id,recipient:'alfa',ledger_uuid:l.protocolIdentity(),mode:'new',selector:{kind:'primary-a2a'}})+'\n'+body),{action:'stop',delivery_id:id,recipient:'alfa',ledger_uuid:l.protocolIdentity(),key_id:'coord',issued_at:now,expires_at:now+120000},coordinator.privateKey);
 const options={ledger:l,pause:{cwd:'/fixture',state:()=>null},recipient:'alfa',getTrust:()=>trust,getArrival:()=>({delivered_at:now,event_id:'arrival'}),signStatus:s=>signStopStatus(s,'status',signer.privateKey),publishStatus:s=>statuses.push(s),conversations:c,
  resolveTarget:()=>agent,newEnabled:()=>true,resolveNewTarget:()=>{agent.status=mode;return{key:'a2a',entry:{handle:{agent}},header:agent.session.header};},
  rotateNew:async({receipt,auth,target,beforeBegin})=>{
   if(failure?.before)throw Error(failure.before);
   const attempt=c.begin(target.key,receipt.id,{beforeBegin});rotations++;
   if(failure?.after){c.planItems(receipt.id,[{kind:'attachment',id:'broken'}]);c.abort(receipt.id,failure.after);throw Error(failure.after)}
   c.commit(receipt.id,{id:attempt.new_id,createdAt:now+rotations},{reply:false});agent.session={id:attempt.new_id,header:{id:attempt.new_id,createdAt:now+rotations,cwd:'/fixture'}};
   return {sessionId:attempt.new_id,handle:{agent}};
  },bootstrapNew:async(fresh,text)=>{if(failure?.bootstrap)throw Error(failure.bootstrap);const row=l.receive('intro:'+fresh.sessionId,Buffer.from(text),{route:'a2a',expectsReply:true});l.db.prepare('UPDATE receipts SET session_id=?,session_created=? WHERE id=?').run(fresh.sessionId,agent.session.header.createdAt,row.id);return row.id;}};
 processor=new MailStopReceiver(options);
 const call=id=>{agent.status=mode;return processor.handle(wire(id),{sourceKey:id});};
 mode='running';const running=await call('running');assert.equal(running.reason,'turn_running','mode new must name running refusal, not invalid_control');assert.equal(rotations,0);
 mode='idle';const first=await call('new1');assert.equal(first.reason,'new_committed',JSON.stringify(first));assert.equal(rotations,1);assert(!l.db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL').all().some(r=>r.id.endsWith(':result')),'mail new has signed status instead of unsigned result');
 assert(l.db.prepare('SELECT raw FROM receipts WHERE session_id=?').all(agent.session.id).some(r=>Buffer.from(r.raw).toString().includes('FARM-RULES')),'standard introductory letter in new generation');
 await call('new2');await call('new3');assert.equal((await call('fourth')).reason,'rate');assert.equal(rotations,3);
 now+=600000;for(const message of ['Исход ранее начатого письма не подтверждён; требуется сверка до /new','Этой живой сессией владеет платформа; чужой writer не освобождается','Нет служб проверки расписания/сессии; /new не выполнялся','Неизвестное состояние вложения; /new не выполнялся']){
  failure={before:message};const r=await call('error-'+statuses.length);assert.equal(r.state,'refused');assert.equal(statusesDecoded().at(-1).detail,message);assert.equal(r.reason,'rotation_refused');
 }
 failure={after:'forced_after_begin'};const held=await call('held');assert.equal(held.reason,'rotation_aborted_held');assert(c.holdsSession(agent.session.id));
 assert(!l.db.prepare('SELECT id FROM outbox WHERE id=?').get(held.receipt_id+':result'),'mail new abort must not create an unsigned ordinary result');
 assert(l.db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL').all().some(r=>r.route==='copy-tg'&&r.id.startsWith('mail-new-owner:')&&r.body.includes('rotation_aborted_held')),'held owner status belongs to independent copy queue');
 failure=null;assert.equal((await call('held-retry')).reason,'new_committed');assert(!c.holdsSession(c.current('a2a').session_id));
 // K3: held retry bypasses normal rate budget, pre-begin refusals never debit it.
 const debit=l.db.prepare("SELECT count(*) AS n FROM audit WHERE kind='mail_new_rate_debit' AND at>?").get(now-600000).n;assert.equal(debit,1);
 failure={bootstrap:'synthetic bootstrap failure'};const noIntro=await call('committed-no-intro');assert.equal(noIntro.reason,'new_committed_bootstrap_unknown');failure=null;l.close();l=new MessageReceipts(dir,{owner:'generation2',now:()=>now});c=new ConversationSessions(l);processor=new MailStopReceiver({...options,ledger:l,conversations:c});await processor.recoverNew();assert.equal(statusesDecoded().at(-1).state,'unknown','restart must not claim success when committed generation has no evidenced bootstrap');assert.equal(statusesDecoded().at(-1).reason,'new_committed_bootstrap_unknown');
 // K1: actual durable begin without completion, then instantiate a new receiver generation.
 const raw=wire('crash'),auth={};const receipt=l.receive('crash',raw,{route:'a2a',logicalKey:'signed:crash',expectsReply:false});
 const {evaluateSignedStop}=await import('../src/mail-stop-protocol.js');Object.assign(auth,evaluateSignedStop(raw,{trust,recipient:'alfa',ledger:l.protocolIdentity(),now,delivery:{delivered_at:now,event_id:'arrival'}}));
 processor.store.admit(auth,receipt.id,{session_id:agent.session.id,session_created:agent.session.header.createdAt,turn:null},{new_route:'a2a',auth});
 c.begin('a2a',receipt.id);c.planItems(receipt.id,[{kind:'inbox',id:'crash-item'}]);l.close();
 l=new MessageReceipts(dir,{owner:'generation3',now:()=>now});c=new ConversationSessions(l);c.abortPrepared('restart');
 processor=new MailStopReceiver({...options,ledger:l,conversations:c});await processor.recoverNew();
 assert.equal(statusesDecoded().at(-1).reason,'rotation_aborted_held');assert(l.db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL').all().some(r=>r.route==='copy-tg'&&r.id.startsWith('mail-new-owner:')&&r.receipt_id===receipt.id));
 console.log('PASS mail new: idle/introduction, running refusal, typed exception detail, quota begin-only/held exemption, held retry and restart recovery');
}finally{l?.close();fs.rmSync(dir,{recursive:true,force:true})}
