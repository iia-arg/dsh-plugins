// RU: Durable вход обычной текстовой почты в один активный SDK lease. Unknown сохраняется между поколениями и не повторяется автоматически.
// EN: Durable ordinary text input for one active SDK lease. Unknown survives process generations and is never replayed automatically.
import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {sobytiyaSessii,receiptFacts,stableJson} from './message-receipts.js';
const hash=x=>createHash('sha256').update(stableJson(x)).digest('hex');
const heldStates=['dispatching','accepted','offered','unknown'];
const current=a=>{const e=sobytiyaSessii(a.session).findLast(e=>e.type==='turn/start'||e.type==='turn/end');return a.status==='running'&&e?.type==='turn/start'?e.data.turn:null};
// B-N-1600 шаг 0 (слово владельца 05.10): посреди хода — только уточнение к письму, которое агент исполняет сейчас.
// Письмо без метки — всегда next-turn: «срочно» ход не рвёт, для остановки есть /stop. Метки до этапа 1 нет,
// поэтому допуска нет ни у одного письма; этап 1 заменит dopusk проверкой метки refines.
const bezMetkiVOchered=()=>false;
// B-N-1600: ABI приёма rc.2 принадлежит ПЛАТФОРМЕ агента — dsh-agent-loop разрешается от appDir платформы (тот же якорь, что
// platformOf в index.js: config.appDir || DSH_APP_DIR), а не от каталога плагина: в /opt/agent-plugins пакета нет, и родной путь молча выключался.
const nativeCache=new Map();
function nativeOf(appDir){
 if(!appDir)return {version:null,reason:'не задан appDir платформы'};
 if(!nativeCache.has(appDir)){try{const req=createRequire(path.join(appDir,'package.json'));const main=req.resolve('@deepseek-ai/dsh-agent-loop');nativeCache.set(appDir,{version:JSON.parse(fs.readFileSync(path.join(path.dirname(main),'..','package.json'),'utf8')).version,reason:null});}
  catch(e){nativeCache.set(appDir,{version:null,reason:`@deepseek-ai/dsh-agent-loop не разрешился от ${appDir}: ${e?.code??e?.message??e}`});}}
 return nativeCache.get(appDir);
}
function supported(agent,appDir){
 try{const n=nativeOf(appDir);if(n.version!=='0.2.0-rc.2')return {ok:false,reason:n.reason??`dsh-agent-loop ${n.version} от ${appDir}, нужен 0.2.0-rc.2`};
  const abi=typeof agent.inbox?.mutate==='function'&&typeof agent.inbox?.claim==='function'&&typeof agent.inbox?.dispatch?.emit==='function'&&typeof agent.session?.append==='function';
  return abi?{ok:true,reason:null}:{ok:false,reason:'у агента нет inbox ABI rc.2'};
 }catch(e){return {ok:false,reason:String(e?.message??e)}}
}
export class SdkInbox{
 constructor(ledger,sessions,control,log=()=>{},appDir){this.appDir=appDir;this.l=ledger;this.sessions=sessions;this.control=control;this.log=log;this.timers=new Map();this.work=new WeakMap();this.warned=false;this.dopusk=bezMetkiVOchered;
  ledger.db.exec(`CREATE TABLE IF NOT EXISTS sdk_inputs(receipt_id TEXT PRIMARY KEY,message_id TEXT NOT NULL,session_id TEXT NOT NULL,session_created,
   turn INTEGER NOT NULL,generation TEXT NOT NULL,body_sha TEXT NOT NULL,binding_json TEXT NOT NULL,state TEXT NOT NULL,
   started_at INTEGER NOT NULL,offered_at INTEGER,admitted_at INTEGER,admission_json TEXT,reason TEXT)`);
  ledger.db.prepare("UPDATE sdk_inputs SET state='unknown',reason='process_changed' WHERE generation<>? AND state IN ('dispatching','accepted','offered')").run(ledger.owner);
 }
 compatible(agent){const r=supported(agent,this.appDir);if(!r.ok&&!this.warned){this.warned=true;this.log(`inbox: native rc.2 admission ABI unavailable (${r.reason}); ordinary input stays in next-turn`);}return r.ok}
 heldIds(header){return new Set(this.l.db.prepare("SELECT message_id FROM sdk_inputs WHERE session_id=? AND session_created=? AND state IN ('dispatching','accepted','offered','unknown')").all(header.id,header.createdAt).map(x=>x.message_id))}
 row(id){return this.l.db.prepare('SELECT * FROM sdk_inputs WHERE receipt_id=?').get(id)}
 notify(id,reason){this.l.addOutbox('sdk-input:'+id+':'+reason,id,'a2a',`SDK-вход ${id}: ${reason}. Это состояние доставки, не подтверждение исполнения. Unknown не повторяется автоматически.`)}
 unknown(id,reason){this.l.tx(()=>{const r=this.row(id);if(!r||['admitted','not_offered'].includes(r.state))return;this.l.db.prepare("UPDATE sdk_inputs SET state='unknown',reason=? WHERE receipt_id=?").run(reason,id);this.l.db.prepare("UPDATE receipts SET blocked='sdk_input_unknown' WHERE id=? AND finished_at IS NULL").run(id);this.notify(id,reason)});this.clearTimer(id)}
 notOffered(id,reason){this.l.tx(()=>{const r=this.row(id);if(!r||r.offered_at!==null||['admitted','offered'].includes(r.state))return;this.l.db.prepare("UPDATE sdk_inputs SET state='not_offered',reason=? WHERE receipt_id=?").run(reason,id);this.l.db.prepare("UPDATE receipts SET blocked=NULL WHERE id=? AND blocked IN ('sdk_input','sdk_input_unknown')").run(id)});this.clearTimer(id)}
 clearTimer(id){const t=this.timers.get(id);if(t)clearTimeout(t);this.timers.delete(id)}
 schedule(agent,id){const previous=this.work.get(agent)??Promise.resolve();const next=previous.catch(()=>{}).then(()=>this.forward(agent,id));this.work.set(agent,next);next.catch(()=>this.log(`inbox: forwarding failed for receipt ${id}`));return next}
 ready(lease){for(const r of this.l.pending())if(r.session_id===lease.session.id&&r.session_created===lease.session.header.createdAt&&!r.blocked&&!this.row(r.id))this.schedule(lease.agent,r.id)}
 async forward(agent,id){
  const l=this.l,r=l.get(id);if(!r||r.blocked||r.finished_at!==null||this.row(id))return;
  if(!this.dopusk(r)){if(!this.zakrytoSkazano){this.zakrytoSkazano=true;this.log('inbox: живой ввод письма без метки закрыт (B-N-1600 шаг 0) — письма идут в next-turn');}return;}
  if(!this.compatible(agent))return;
  const lease=this.control.inputLease(agent);if(!lease)return;
  const message=JSON.parse(r.message_json??'null');if(message?.source?.kind!=='agent-message'||message.source.form!=='relay'||!message.content?.length||message.content.some(b=>b.type!=='text'||typeof b.text!=='string'))return;
  if(this.control.mailControls?.inputAllowed(agent.session.header,message.id)===false)return;
  if(r.session_id!==agent.session.id||r.session_created!==agent.session.header.createdAt||current(agent)!==lease.descriptor.binding.turn)return;
  if(![...agent.inbox.nextTurn,...agent.inbox.nextStep].some(m=>m.id===message.id)||receiptFacts(agent.session,[message.id]).get(message.id).claims.length)return;
  const body=JSON.stringify({receipt_id:id,message,provenance:{sender:r.sender??'',verified:!!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='coordinator_signature_verified'").get(id)}});
  if(Buffer.byteLength(body)>65536)return;
  const binding={...lease.descriptor.binding,request_id:lease.descriptor.request_id,sdk_thread_id:lease.sdkIdentity.thread_id,sdk_turn_id:lease.sdkIdentity.turn_id,control_id:id,target_receipt:id};const packet={binding,op:'message',body};if(Buffer.byteLength(JSON.stringify(packet))>131072)return;
  const won=l.tx(()=>{if(this.row(id))return false;l.db.prepare("INSERT INTO sdk_inputs(receipt_id,message_id,session_id,session_created,turn,generation,body_sha,binding_json,state,started_at) VALUES(?,?,?,?,?,?,?,?,'dispatching',?)").run(id,message.id,r.session_id,r.session_created,binding.turn,l.owner,hash(message),stableJson(binding),l.now());l.db.prepare("UPDATE receipts SET blocked='sdk_input' WHERE id=?").run(id);l.audit(id,'sdk_input_dispatch_intent',stableJson(binding));return true});if(!won)return;
  try{
   const reply=await this.control.sendInput(lease,packet);
   const state=this.row(id)?.state;if(['admitted','offered','not_offered'].includes(state))return;
   if(reply?.accepted===false&&reply.input_state==='not-offered'){this.notOffered(id,'gateway_not_offered');return;}
   if(reply?.accepted!==true||stableJson(reply.binding)!==stableJson(binding))throw Error('invalid_input_ack');
   l.tx(()=>{
    if(reply.input_state==='offered')l.db.prepare("UPDATE sdk_inputs SET offered_at=COALESCE(offered_at,?) WHERE receipt_id=? AND state IN ('dispatching','accepted','offered','unknown')").run(l.now(),id);
    l.db.prepare("UPDATE sdk_inputs SET state='accepted',reason='transport_accepted' WHERE receipt_id=? AND state='dispatching'").run(id);
   });
   const timer=setTimeout(()=>this.unknown(id,'offer_deadline'),300000);timer.unref?.();this.timers.set(id,timer);
  }catch{this.unknown(id,'dispatch_outcome_unknown')}
 }
 async event(lease,event){
  if(event.state==='ready'){this.ready(lease);return}
  const id=event.binding?.control_id,row=this.row(id);if(!row||stableJson(event.binding)!==row.binding_json)return;
  if(event.state==='not-offered'){this.notOffered(id,event.reason??'gateway_not_offered');return}
  if(event.state!=='offered'||row.state==='admitted')return;
  if(!['codex-steer','claude-hook'].includes(event.method)||!['thread_id','turn_id'].every(k=>typeof event.codex?.[k]==='string'&&event.codex[k].length>0&&event.codex[k]===lease.sdkIdentity?.[k]&&event.codex[k]===JSON.parse(row.binding_json)[k==='thread_id'?'sdk_thread_id':'sdk_turn_id'])){this.unknown(id,'invalid_engine_offer');return;}
  if(!this.control.inputAlive(lease)||current(lease.agent)!==row.turn||row.generation!==this.l.owner){this.unknown(id,'offer_binding_changed');return}
  const l=this.l,a=lease.agent,message=JSON.parse(l.get(id).message_json);if(hash(message)!==row.body_sha){this.unknown(id,'body_changed');return}
  const target=['next-turn','next-step'].find(t=>(t==='next-turn'?a.inbox.nextTurn:a.inbox.nextStep).some(m=>m.id===message.id));
  if(!target){this.unknown(id,'admission_input_missing');return}
  l.db.prepare("UPDATE sdk_inputs SET state='offered',offered_at=?,reason='engine_input_offered' WHERE receipt_id=?").run(l.now(),id);
  try{
   const q=target==='next-turn'?a.inbox.nextTurn:a.inbox.nextStep,index=q.findIndex(m=>m.id===message.id);
   a.inbox.mutate(target,index,1,[],false);const removed=sobytiyaSessii(a.session).at(-1);const user=a.session.append('user/message',message,{surfaceOp:'append'});
   const admission={turn:row.turn,removed_seq:removed.seq,user_seq:user.seq,message_id:message.id,body_sha:row.body_sha,method:event.method,codex:event.codex};
   l.db.prepare('UPDATE sdk_inputs SET admission_json=? WHERE receipt_id=?').run(JSON.stringify(admission),id);
   if(await this.sessions.flush(a.session)!==true)throw Error('input_flush_unconfirmed');
   if(!this.control.inputAlive(lease)||current(a)!==row.turn){this.unknown(id,'admission_binding_changed');return;}
   l.tx(()=>{const changed=l.db.prepare("UPDATE sdk_inputs SET state='admitted',admitted_at=?,reason='durable_input_admitted' WHERE receipt_id=? AND state='offered' AND generation=?").run(l.now(),id,l.owner).changes;if(changed===1){l.db.prepare("UPDATE receipts SET blocked=NULL WHERE id=? AND blocked IN ('sdk_input','sdk_input_unknown')").run(id);l.audit(id,'sdk_input_admitted',JSON.stringify(admission))}});this.clearTimer(id);
  }catch{this.unknown(id,'admission_outcome_unknown')}
 }
 closed(lease){for(const r of this.l.db.prepare("SELECT receipt_id FROM sdk_inputs WHERE session_id=? AND session_created=? AND turn=? AND generation=? AND state IN ('dispatching','accepted','offered')").all(lease.session.id,lease.session.header.createdAt,lease.descriptor.binding.turn,lease.descriptor.binding.generation)){const row=this.row(r.receipt_id),b=JSON.parse(row.binding_json);if(b.request_id===lease.descriptor.request_id&&Object.entries(lease.descriptor.binding).every(([k,v])=>b[k]===v))this.unknown(r.receipt_id,'lease_closed_before_admission')}}
 dispose(){for(const t of this.timers.values())clearTimeout(t);this.timers.clear()}
}
