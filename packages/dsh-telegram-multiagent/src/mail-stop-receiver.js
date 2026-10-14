import crypto from 'node:crypto';
import path from 'node:path';
import {evaluateSignedStop,UNSIGNED_LIMIT,UNSIGNED_WINDOW_MS} from './mail-stop-protocol.js';
import {MailStopLedger} from './mail-stop-ledger.js';
import {looksLikeStop} from './mail-stop-arrival.js';
import {stopKeepingContext,runningTurn} from './telegram-stop.js';
import {sobytiyaSessii,receiptFacts} from './message-receipts.js';
import {handleMailNew,recoverMailNew} from './mail-new-control.js';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),Math.max(0,ms))})])}finally{clearTimeout(timer)}}

export class MailStopReceiver{
 constructor(options){
  Object.assign(this,options);this.l=options.ledger;this.store=new MailStopLedger(this.l);this.jobs=new Map();this.completions=new Map();this.pause.mailControls=this;
  this.l.db.exec(`CREATE TABLE IF NOT EXISTS mail_stop_unsigned(recipient TEXT PRIMARY KEY,started_at INTEGER NOT NULL,count INTEGER NOT NULL,alerted INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS mail_stop_status_routes(outbox_id TEXT PRIMARY KEY,route_json TEXT NOT NULL);`);
 }
 ingest(raw,options){
  if(!looksLikeStop(raw))return false;
  const key=String(options.sourceKey)+'\0'+hash(raw);
  if(this.jobs.has(key)||this.closed)return true;
  const job=this.handle(raw,options).then(result=>{
   if(!options.sourcePath||!result?.receipt_id||this.l.get(result.receipt_id)?.finished_at===null)return;
   for(const source of this.l.db.prepare('SELECT source_key FROM sources WHERE receipt_id=? AND path=? AND source_released=0').all(result.receipt_id,path.resolve(options.sourcePath)))this.l.release(result.receipt_id,source.source_key);
  }).catch(error=>this.log?.('Стоп-почта: исход удержан ('+(error.code??error.message??'unknown')+')')).finally(()=>this.jobs.delete(key));
  this.jobs.set(key,job);return true;
 }
 replay(receiptId,key,raw,sourcePath,state,reason){
  const r=this.l.get(receiptId);
  const existing=sourcePath&&this.l.db.prepare('SELECT 1 FROM sources WHERE receipt_id=? AND path=? AND raw_sha=? AND source_released=0').get(receiptId,path.resolve(sourcePath),hash(raw));
  if(!existing)this.receive('replay:'+key,raw,{sourcePath,logicalKey:r.logical_key,expectsReply:false});
  return{state,reason,receipt_id:receiptId};
 }
 async status(receipt,auth,state,reason,extra={}){
  if(!auth.verified||!auth.returnRoute)return;
  if(typeof this.signStatus!=='function')throw Error('status_signing_unavailable');
  const now=this.l.now(),status={control_id:auth.meta.delivery_id,server_id:receipt.id,receiver:this.recipient,
   recipient:auth.returnRoute.recipient,ledger_uuid:auth.returnRoute.ledger_uuid,state,reason,
   wire_sha:auth.wire_sha,delivered_at:auth.delivered_at,processed_at:auth.processed_at,delay_ms:auth.delay_ms,
   control_issued_at:Number.isSafeInteger(auth.meta.issued_at)?auth.meta.issued_at:null,
   control_expires_at:Number.isSafeInteger(auth.meta.expires_at)?auth.meta.expires_at:null,
   issued_at:now,expires_at:now+900000,...extra};
  const wire=this.signStatus(status);
  if(this.publishStatus){await this.publishStatus(wire,auth.returnRoute,status);return;}
  const id='mail-stop-status:'+receipt.id+':'+state+':'+reason;
  this.l.tx(()=>{
   this.l.db.prepare('INSERT OR IGNORE INTO mail_stop_status_routes VALUES(?,?)').run(id,JSON.stringify(auth.returnRoute));
   this.l.addOutbox(id,receipt.id,'mail-stop-status',Buffer.from(wire).toString('base64'));
  });
 }
 async unsigned(receipt,reason){
  const now=this.l.now();let notify=false;
  this.l.tx(()=>{
   const old=this.l.db.prepare('SELECT * FROM mail_stop_unsigned WHERE recipient=?').get(this.recipient);
   const row=!old||now-old.started_at>=UNSIGNED_WINDOW_MS?{started_at:now,count:0,alerted:0}:old;
   row.count++;if(row.count>=UNSIGNED_LIMIT&&!row.alerted){row.alerted=1;notify=true;}
   this.l.db.prepare('INSERT OR REPLACE INTO mail_stop_unsigned VALUES(?,?,?,?)').run(this.recipient,row.started_at,row.count,row.alerted);
   this.l.audit(receipt.id,'mail_stop_unsigned_refused',reason);
  });
  if(notify&&this.alert)await bounded(Promise.resolve(this.alert(`Стоп-почта ${this.recipient}: ${UNSIGNED_LIMIT} неподтверждённых controls за ${UNSIGNED_WINDOW_MS/1000} с; управления не было.`)),4000);
 }
 async handle(raw,{sourceKey,sourcePath=null,channel='a2a'}={}){
  raw=Buffer.from(raw);if(!looksLikeStop(raw))return null;
  // The independent watcher may run after the mailbox poll callback. Retain the source while it records this publication.
  let arrival=this.getArrival?.(sourcePath,raw)??null;
  if(sourcePath&&this.getArrival&&!arrival){
   const deadline=Date.now()+1000;
   while(!arrival&&!this.closed&&Date.now()<deadline){await new Promise(r=>setTimeout(r,20));arrival=this.getArrival(sourcePath,raw);}
  }
  const auth=evaluateSignedStop(raw,{trust:this.getTrust(),recipient:this.recipient,ledger:this.l.protocolIdentity(),now:this.l.now(),delivery:arrival});
  if(channel!=='a2a'){auth.allowed=false;auth.reason='wrong_channel';}
  const key='stop-source:'+hash(Buffer.from(String(sourceKey??sourcePath)+'\0'+hash(raw)));
  if(auth.verified&&channel==='a2a'&&auth.meta.recipient===this.recipient&&auth.meta.ledger_uuid===this.l.protocolIdentity()){
   const known=this.store.row(auth.meta.delivery_id);
   if(known&&known.wire_sha===auth.wire_sha&&known.key_id===auth.meta.key_id)return this.replay(known.receipt_id,key,raw,sourcePath,known.state);
  }
  if(auth.verified){
   const decided=this.l.db.prepare('SELECT * FROM receipts WHERE logical_key=?').get('signed:'+auth.meta.delivery_id);
   if(decided&&decided.payload_sha!==hash(raw)){
    const r=this.receive('conflict:'+key,raw,{sourcePath,logicalKey:'stop-conflict:'+key,expectsReply:false});
    await this.status(r,auth,'denied','identity_conflict');this.l.completeLocal(r.id,'mail_stop_denied','identity_conflict');return{state:'denied',reason:'identity_conflict',receipt_id:r.id};
   }
   if(decided&&decided.finished_at!==null)return this.replay(decided.id,key,raw,sourcePath,'recorded',decided.outcome);
   if(decided?.blocked==='mail_stop_intake')return this.replay(decided.id,key,raw,sourcePath,'unknown','intake_already_reserved');
  }
  if(!auth.allowed){
   const receipt=this.receive('denied:'+key,raw,{sourcePath,logicalKey:auth.verified?'signed:'+auth.meta.delivery_id:'stop-denied:'+key,expectsReply:false});
   if(receipt.fresh){
    if(auth.verified&&this.l.db.prepare("UPDATE receipts SET blocked='mail_stop_intake' WHERE id=? AND blocked IS NULL AND finished_at IS NULL").run(receipt.id).changes!==1)return{state:'unknown',reason:'intake_already_reserved',receipt_id:receipt.id};
    if(auth.verified)await this.status(receipt,auth,'denied',auth.reason);
    else await this.unsigned(receipt,auth.reason);
    this.l.completeLocal(receipt.id,'mail_stop_denied',auth.reason);
   }
   return {state:'denied',reason:auth.reason,receipt_id:receipt.id};
  }
  const old=this.store.row(auth.meta.delivery_id);
  if(old){
   if(old.wire_sha!==auth.wire_sha||old.key_id!==auth.meta.key_id){
    const receipt=this.receive('conflict:'+key,raw,{sourcePath,logicalKey:'stop-conflict:'+key,expectsReply:false});await this.status(receipt,auth,'denied','identity_conflict');this.l.completeLocal(receipt.id,'mail_stop_denied','identity_conflict');return{state:'denied',reason:'identity_conflict',receipt_id:receipt.id};
   }
   return {state:old.state,receipt_id:old.receipt_id};
  }
  const receipt=this.receive(key,raw,{sourcePath,logicalKey:'signed:'+auth.meta.delivery_id,sender:auth.principal,expectsReply:false});
  if(receipt.finished_at!==null)return{state:'recorded',reason:receipt.outcome,receipt_id:receipt.id};
  // One intake intent before the first await, also covering concurrent publications and a crash before target selection.
  if(this.l.db.prepare("UPDATE receipts SET blocked='mail_stop_intake' WHERE id=? AND blocked IS NULL AND finished_at IS NULL").run(receipt.id).changes!==1)return{state:'unknown',reason:'intake_already_reserved',receipt_id:receipt.id};
  // Signability and a fixed reply route are checked before selecting or pausing any target.
  await this.status(receipt,auth,'received','authenticated');
  if(this.closed)return{state:'unknown',reason:'receiver_closed',receipt_id:receipt.id};
  const rechecked=evaluateSignedStop(raw,{trust:this.getTrust(),recipient:this.recipient,ledger:this.l.protocolIdentity(),now:this.l.now(),delivery:this.getArrival?.(sourcePath,raw)??null});
  if(!rechecked.allowed){await this.status(receipt,rechecked,'denied',rechecked.reason);this.l.completeLocal(receipt.id,'mail_stop_denied',rechecked.reason);return{state:'denied',reason:rechecked.reason,receipt_id:receipt.id};}
  if(auth.control.mode==='new')return handleMailNew(this,receipt,auth);
  // B-N-1596: the resolver may resume an unloaded primary conversation; the intake is rechecked after that await.
  const resolved=await this.resolveTarget(auth.control.selector),agent=resolved&&!resolved.none?resolved:null,header=agent?.session?.header;
  if(this.l.get(receipt.id).finished_at!==null||this.l.get(receipt.id).blocked!=='mail_stop_intake')return{state:'unknown',reason:'intake_changed',receipt_id:receipt.id};
  const cause=resolved?.none??(!agent||!header?'no_live_agent':header.origin==='subagent'?'subagent':path.resolve(header.cwd??'')!==this.pause.cwd?'cwd':null);
  if(cause){await this.status(receipt,auth,'denied','target_none',{target_cause:cause});this.l.completeLocal(receipt.id,'mail_stop_denied','target_none:'+cause);return {state:'denied',reason:'target_none',cause,receipt_id:receipt.id};}
  const target={session_id:agent.session.id,session_created:header.createdAt,turn:runningTurn(agent)};
  if(auth.control.expected&&Object.entries(auth.control.expected).some(([k,v])=>target[k]!==v)){await this.status(receipt,auth,'denied','target_changed');this.l.completeLocal(receipt.id,'mail_stop_denied','target_changed');return{state:'denied',reason:'target_changed',receipt_id:receipt.id};}
  const remote=agent.session.requestHeader?.()?.config?.provider==='claude-oauth';
  const binding=remote?this.remote?.capture?.(agent):{};
  // B-N-1596 r2: an unproved remote absence is refused before the fence and the pause (2.5.73 admitted, paused and then left both behind).
  if(target.turn===null&&remote&&!this.remote?.absent?.(agent)){await this.status(receipt,auth,'denied','remote_absence_unproved');this.l.completeLocal(receipt.id,'mail_stop_denied','remote_absence_unproved');return{state:'denied',reason:'remote_absence_unproved',receipt_id:receipt.id};}
  // B-N-1603: the resolver may await (agentFor since 2.5.73); a control that expired meanwhile is refused before the fence and the pause.
  if(this.l.now()>=auth.meta.expires_at){await this.status(receipt,auth,'denied','expired');this.l.completeLocal(receipt.id,'mail_stop_denied','expired');return{state:'denied',reason:'expired',receipt_id:receipt.id};}
  let row;try{row=this.store.admit(auth,receipt.id,target,binding??{})}catch(error){await this.status(receipt,auth,'denied',error.message);this.l.completeLocal(receipt.id,'mail_stop_denied',error.message);return{state:'denied',reason:error.message,receipt_id:receipt.id};}
  if(!row.fresh)return{state:row.state,receipt_id:row.receipt_id};
  // B-N-1596 r2: an unknown outcome names whether the pause left behind is this control's own (then mail-stop-hold snyat-pauzu releases it).
  const prior=this.pause.state(header),own=!prior;
  if(own||prior.state==='resuming')this.pause.pause(header,receipt.id);
  if(row.mode==='replace')this.store.holdBacklog(row.control_id,[...agent.inbox.nextTurn,...agent.inbox.nextStep]);
  this.pause.visibility?.changed(header.id);
  if(target.turn===null){
   this.store.terminal(row.control_id,{platform:true,sdk:true});
   if(row.mode==='replace')return this.replace(row,agent,auth,own);
   this.store.complete(row.control_id);await this.status(receipt,auth,'paused','idle_existing_session');this.l.completeLocal(receipt.id,'mail_stop_paused','idle_existing_session');this.resumeDeferredOwner(row,agent,own);return{state:'paused',receipt_id:receipt.id};
  }
  if(remote&&!binding){this.store.unknown(row.control_id,'no_exact_sdk_lease');await this.status(receipt,auth,'unknown','no_exact_sdk_lease',{own_pause:own});return{state:'unknown',receipt_id:receipt.id};}
  const terminal=remote?this.remote.waitTerminal(binding):null;
  // B-N-1603: a refused dispatch must not leave the row 'admitted' holding the fence: unknown, signed, own pause named.
  if(!this.store.beginDispatch(row.control_id)){this.store.unknown(row.control_id,'dispatch_not_started');await this.status(receipt,auth,'unknown','dispatch_not_started',{own_pause:own});return{state:'unknown',receipt_id:receipt.id};}
  const result=await stopKeepingContext({findAgent:()=>agent,pause:()=>{},boundTarget:target,settleMs:Math.max(0,row.deadline_at-this.l.now()),
   stopRemote:()=>this.remote.stopExact(agent,row.control_id,binding),
   ...(remote?{waitTerminal:async()=>{const ok=await bounded(terminal,row.deadline_at-this.l.now());if(ok===true)this.store.terminal(row.control_id,{sdk:true});return ok===true}}:{})});
  const end=sobytiyaSessii(agent.session).findLast(e=>e.type==='turn/end'&&e.data?.turn===target.turn);
  if(agent.session.id!==target.session_id||agent.session.header.createdAt!==target.session_created||!end||remote&&!result.remote_terminal){this.store.unknown(row.control_id,'terminal_unconfirmed');await this.status(receipt,auth,'unknown','terminal_unconfirmed',{own_pause:own});return{state:'unknown',receipt_id:receipt.id};}
  this.store.terminal(row.control_id,{platform:true,sdk:!remote});
  if(row.mode==='replace')return this.replace(row,agent,auth,own);
  this.store.complete(row.control_id);await this.status(receipt,auth,'paused','terminal_confirmed');this.l.completeLocal(receipt.id,'mail_stop_paused','terminal_confirmed');this.resumeDeferredOwner(row,agent,own);return{state:'paused',receipt_id:receipt.id};
 }
 resumeDeferredOwner(row,agent,own){
  const after=this.store.row(row.control_id),p=this.pause.state(agent.session.header),r=after.owner_receipt&&this.l.get(after.owner_receipt);
  if(!own||p?.command_id!==row.receipt_id||!r?.flushed_at||r.dsh_id!==after.owner_message)return;
  if(this.pause.resumeOwner(agent,r.id,r.dsh_id))this.pause.wakeGate.resumeAfterOwner(agent,()=>this.pause.state(agent.session.header)?.owner_id===r.dsh_id&&!this.nativeBlocked(agent));
 }
 async replace(row,agent,auth,own){
  if(!own){this.l.db.prepare("UPDATE mail_stop_controls SET state='blocked_prior_pause',reason='prior_pause' WHERE control_id=?").run(row.control_id);await this.status(this.l.get(row.receipt_id),auth,'blocked_prior_pause','prior_pause');this.l.completeLocal(row.receipt_id,'mail_stop_prior_pause','prior_pause');return{state:'blocked_prior_pause',receipt_id:row.receipt_id};}
  const receipt=this.l.get(row.receipt_id);
  if(!this.makeMessage||!this.sessions?.flush||!this.store.permitReplacement(row.control_id)){this.store.unknown(row.control_id,'replacement_permit_unavailable');await this.status(receipt,auth,'unknown','replacement_permit_unavailable',{own_pause:own});return{state:'unknown',receipt_id:row.receipt_id};}
  try{
   const deferred=this.store.row(row.control_id);let replacement;
   if(deferred.owner_receipt&&deferred.owner_message){
    replacement=this.l.get(deferred.owner_receipt);
    if(!replacement?.flushed_at||replacement.dsh_id!==deferred.owner_message)throw Error('owner_input_not_durable');
   }else{
    replacement=this.receive('replacement:'+row.control_id,Buffer.from(auth.control.replacement),{logicalKey:'stop-replacement:'+row.control_id,expectsReply:false,sender:auth.principal});
    this.l.prepare(replacement.id,()=>this.makeMessage(auth.control.replacement),agent.session,'a2a');
    await this.l.queue(replacement.id,{contains:id=>[...agent.inbox.nextTurn,...agent.inbox.nextStep].some(m=>m.id===id),send:message=>agent.send(message,'next-turn',false),flush:()=>this.sessions.flush(agent.session)});
    replacement=this.l.get(replacement.id);
   }
   if(agent.session.id!==row.session_id||agent.session.header.createdAt!==row.session_created||this.l.now()>=row.deadline_at)throw Error('replacement_binding_or_deadline_changed');
   this.l.db.prepare('UPDATE mail_stop_controls SET replacement_receipt=? WHERE control_id=?').run(replacement.id,row.control_id);
   this.pause.resumeControlled(agent,row.control_id,replacement.dsh_id);
   if(await this.sessions.flush(agent.session)!==true)throw Error('replacement_resume_flush_unknown');
   this.pause.wakeGate.resumeAfterOwner(agent,()=>this.store.row(row.control_id)?.state==='resuming'&&!this.nativeBlocked(agent));
   this.completions.set(row.control_id,auth);
   await this.status(receipt,auth,'replacement_queued','terminal_confirmed');return{state:'replacement_queued',receipt_id:row.receipt_id};
  }catch(error){this.completions.delete(row.control_id);this.store.unknown(row.control_id,'replacement_admission_unknown');await this.status(receipt,auth,'unknown','replacement_admission_unknown',{own_pause:own});return{state:'unknown',receipt_id:row.receipt_id};}
 }
 deferOwner(agent,receiptId,messageId){
  const row=this.store.active(agent.session.header);if(!row)return false;
  if(row.state==='unknown')return true;
  this.l.db.prepare('UPDATE mail_stop_controls SET owner_receipt=?,owner_message=? WHERE control_id=?').run(receiptId,messageId,row.control_id);return true;
 }
 nativeBlocked(agent){
  const header=agent.session.header,row=this.store.active(header);
  if(row){const pause=this.pause.state(header);return !(row.state==='resuming'&&row.resume_proven&&pause?.state==='resuming'&&pause.command_id===row.receipt_id&&pause.owner_id===row.replacement_message);}
  const held=this.store.backlogIds(header),pending=[...agent.inbox.nextTurn,...agent.inbox.nextStep];return held.size>0&&pending.length>0&&pending.every(m=>held.has(m.id));
 }
 sdkAllowed(binding){
  const row=this.store.active({id:binding.session_id,createdAt:binding.session_created});
  if(!row)return true;
  return row.state==='resuming'&&row.target_turn!==binding.turn&&this.pause.state({id:binding.session_id,createdAt:binding.session_created,cwd:this.pause.cwd})?.owner_turn===binding.turn;
 }
 inputAllowed(header,messageId){return !this.store.backlogIds(header).has(messageId)}
 async observe(session,event){
  if(event.type!=='user/message')return;
  const row=this.store.active(session.header);if(!row||row.state!=='resuming'||event.data?.id!==row.replacement_message)return;
  const receipt=this.l.get(row.replacement_receipt);if(!receipt?.message_json)return;
  if(JSON.stringify(event.data)!==receipt.message_json)return;
  const ownerTurn=this.pause.state(session.header)?.owner_turn;
  if(!Number.isSafeInteger(ownerTurn)||ownerTurn===row.target_turn||!receiptFacts(session,[row.replacement_message]).get(row.replacement_message)?.claims.some(c=>c.turn===ownerTurn))return;
  if(await this.sessions.flush(session)!==true)return;
  if(session.id!==row.session_id||session.header.createdAt!==row.session_created)return;
  if(this.store.complete(row.control_id,'replacement_admitted',{session_id:session.id,session_created:session.header.createdAt,message_id:row.replacement_message,turn:ownerTurn,user_seq:event.seq,body_sha:hash(Buffer.from(receipt.message_json))})){
   this.l.completeLocal(row.receipt_id,'mail_stop_replaced','replacement_admitted');
   // B-N-1596: the signed final state for replace; the authentication of this process is held in memory only (a restart turns the control unknown anyway).
   const auth=this.completions.get(row.control_id);this.completions.delete(row.control_id);
   if(auth)try{await this.status(this.l.get(row.receipt_id),auth,'complete','replacement_admitted',{admitted_turn:ownerTurn})}catch{this.log?.('[mail-stop] подписанный complete не опубликован')}
  }
 }
 // B-N-1595: owner copies of stop outcomes and of the answer to replace are one setting, read when the stop path creates its receipt;
 // prepareReceiptCopies already skips receipts marked owner_copy_disabled. The signed status is not a copy and is never affected.
 receive(key,raw,options){
  const r=this.l.receive(key,raw,options);
  if(this.ownerCopies?.()===false)this.l.tx(()=>this.l.audit(r.id,'owner_copy_disabled','mailStopOwnerCopies=false'));
  return r;
 }
 recoverNew(){return recoverMailNew(this);}
}
