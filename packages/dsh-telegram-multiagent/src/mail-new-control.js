import {evaluateSignedStop} from './mail-stop-protocol.js';

const WINDOW=600000,LIMIT=3;
function ownerCopy(receiver,receipt,auth,state,reason,extra){
 if(state!=='unknown'&&receiver.ownerCopies?.()===false)return;
 receiver.l.addOutbox('mail-new-owner:'+receipt.id+':'+state+':'+reason,receipt.id,'copy-tg',
  `/new по почте от ${auth.principal}: ${state}/${reason}. ${extra.detail??''}${extra.held?' Сессия удержана: нужен повторный /new, обычная почта не подаётся.':''}`);
}
async function report(receiver,receipt,auth,state,reason,extra={}){
 ownerCopy(receiver,receipt,auth,state,reason,extra);
 await receiver.status(receipt,auth,state,reason,extra);
 if(receipt.finished_at===null)receiver.l.completeLocal(receipt.id,'mail_new_'+state,reason);
 const row=receiver.store.row(auth.meta.delivery_id);
 if(row)receiver.l.db.prepare('UPDATE mail_stop_controls SET state=?,reason=? WHERE control_id=?').run(state==='unknown'?'unknown':'complete',reason,row.control_id);
 return{state,reason,receipt_id:receipt.id,...extra};
}

export async function handleMailNew(receiver,receipt,auth){
 const l=receiver.l,c=receiver.conversations;
 let target,row;
 try{
  if(!c||typeof receiver.rotateNew!=='function'||typeof receiver.resolveNewTarget!=='function'||typeof receiver.bootstrapNew!=='function')return await report(receiver,receipt,auth,'refused','capability_missing');
  if(receiver.newEnabled?.()!==true)return await report(receiver,receipt,auth,'refused','disabled');
  target=await receiver.resolveNewTarget(auth.control.selector);
  if(!target?.key||!target.header||c.current(target.key).session_id!==target.header.id||target.header.cwd!==receiver.pause.cwd)return await report(receiver,receipt,auth,'refused','target_none');
  const agent=target.agent??target.entry?.handle?.agent;
  if(agent?.status==='running')return await report(receiver,receipt,auth,'refused','turn_running');
  if(agent&&agent.status!=='idle')return await report(receiver,receipt,auth,'refused','state_unknown');
  if(c.rotating(target.header.id))return await report(receiver,receipt,auth,'refused','rotation_busy');
  if(l.now()>=auth.meta.expires_at)return await report(receiver,receipt,auth,'refused','expired');
  if(auth.control.expected&&(auth.control.expected.session_id!==target.header.id||auth.control.expected.session_created!==target.header.createdAt))return await report(receiver,receipt,auth,'refused','binding_changed');
  const pinned=c.current(target.key),originalAgent=agent;
  if(pinned.session_created!==target.header.createdAt)return await report(receiver,receipt,auth,'refused','binding_changed');
  const checkTarget=()=>{
   const current=c.current(target.key);
   if(current.session_id!==pinned.session_id||current.session_created!==pinned.session_created||current.revision!==pinned.revision)throw Object.assign(Error('Привязка выбранного поколения изменилась до /new'),{reason:'binding_changed'});
   const live=typeof receiver.currentNewAgent==='function'?receiver.currentNewAgent(pinned.session_id):originalAgent;
   if(originalAgent&&live!==originalAgent)throw Object.assign(Error('Живой экземпляр выбранного поколения изменился'),{reason:'binding_changed'});
   if(live?.status==='running')throw Object.assign(Error('Выбранная сессия начала ход до /new'),{reason:'turn_running'});
   if(live&&live.status!=='idle')throw Object.assign(Error('Состояние выбранной сессии не подтверждено'),{reason:'state_unknown'});
   if(c.rotating(pinned.session_id))throw Object.assign(Error('Для выбранной сессии уже идёт /new'),{reason:'rotation_busy'});
  };
  const oldPaused=!!receiver.pause.state(target.header);
  row=receiver.store.admit(auth,receipt.id,{session_id:target.header.id,session_created:target.header.createdAt,turn:null},{new_route:target.key,auth,old_paused:oldPaused});
  if(!row.fresh)return{state:row.state,receipt_id:receipt.id};
  await receiver.status(receipt,auth,'admitted','new_admitted',{old_session:target.header.id,old_paused:oldPaused});
  checkTarget();
  const beforeBegin=()=>{
   if(receiver.closed||l.now()>=auth.meta.expires_at)throw Object.assign(Error('Control expired or receiver closed before begin'),{reason:'expired'});
   checkTarget();
   if(!c.holdsSession(pinned.session_id)){
    const n=l.db.prepare("SELECT count(*) AS n FROM audit WHERE kind='mail_new_rate_debit' AND at>? AND detail=?").get(l.now()-WINDOW,receiver.recipient).n;
    if(n>=LIMIT)throw Object.assign(Error('Предел /new: 3 begin за 10 минут'),{reason:'rate'});
    l.audit(receipt.id,'mail_new_rate_debit',receiver.recipient);
   }
   const won=l.db.prepare("UPDATE receipts SET blocked=NULL WHERE id=? AND blocked='mail_stop_intake' AND finished_at IS NULL").run(receipt.id).changes;
   if(won!==1)throw Error('Intake изменился перед begin');
   l.audit(receipt.id,'mail_new_intake_released',row.control_id);
  };
  const fresh=await receiver.rotateNew({receipt,auth,target,beforeBegin});
  const intent=l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receipt.id);
  if(intent?.phase!=='committed'||c.current(target.key).session_id!==fresh.sessionId)throw Error('Commit нового поколения не подтверждён');
  const introduction=auth.control.replacement.trim()?auth.control.replacement:
   `[новый разговор: /new по почте от ${auth.principal}; прежняя сессия ${intent.old_id}]. Перед работой перечитай файл уроков и правила фермы; ответы координатору — письмом (FARM-RULES п.12).`;
  const intro=await receiver.bootstrapNew(fresh,introduction);
  if(!intro)throw Error('Вводная нового поколения не сохранена');
  l.audit(receipt.id,'mail_new_bootstrap',intro);
  return await report(receiver,l.get(receipt.id),auth,'complete','new_committed',{old_session:intent.old_id,new_session:intent.new_id,old_paused:oldPaused,intro_receipt:intro});
 }catch(error){
  const intent=l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receipt.id);
  const held=!!intent&&c.holdsSession(intent.old_id);
  const reason=intent?.phase==='committed'?'new_committed_bootstrap_unknown':intent?'rotation_aborted_'+(held?'held':'clean'):(error.reason??'rotation_refused');
  return await report(receiver,l.get(receipt.id),auth,intent?'unknown':'refused',reason,{old_session:intent?.old_id??target?.header?.id??null,held,detail:String(error.message??error).slice(0,1000)});
 }
}

// Caller: startup after ConversationSessions.abortPrepared; never repeat effects.
export async function recoverMailNew(receiver){
 const l=receiver.l,c=receiver.conversations;if(!c)return;
 // One status-recovery attempt per pending control at startup. Effects are never retried here.
 for(const row of l.db.prepare("SELECT * FROM mail_stop_controls WHERE mode='new' AND generation<>? AND state<>'complete'").all(l.owner)){
  const receipt=l.get(row.receipt_id);if(!receipt?.raw)continue;
  const intent=l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receipt.id);
  const oldSession=intent?.old_id??row.session_id,held=c.holdsSession(oldSession);
  try{
   const stored=JSON.parse(row.binding_json);
   const verified=evaluateSignedStop(receipt.raw,{trust:receiver.getTrust(),recipient:receiver.recipient,ledger:l.protocolIdentity(),now:l.now(),delivery:{delivered_at:stored.auth.delivered_at,event_id:stored.auth.arrival_event}});
   if(!verified.verified||!verified.returnRoute)throw Object.assign(Error('Recovery return trust unavailable'),{reason:'return_trust_unavailable'});
   const auth={...stored.auth,...verified,principal:row.principal},committed=intent?.phase==='committed';
   const bootstrapped=!!l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='mail_new_bootstrap'").get(receipt.id);
   const state=committed&&bootstrapped?'complete':'unknown',reason=committed?(bootstrapped?'new_committed':'new_committed_bootstrap_unknown'):intent?'rotation_aborted_'+(held?'held':'clean'):'rotation_not_started';
   await report(receiver,receipt,auth,state,reason,{old_session:oldSession,new_session:committed?intent.new_id:null,held,detail:'Процесс перезапущен; внешние действия не повторялись. Проверь вводную нового поколения.'});
   l.db.prepare("UPDATE mail_stop_controls SET state='complete',reason=? WHERE control_id=?").run(reason,row.control_id);
  }catch(error){
   const cause=typeof error.reason==='string'&&/^[a-z_]{1,80}$/.test(error.reason)?error.reason:error.message==='status_signing_unavailable'?'status_signing_unavailable':error.name??'Error';
   ownerCopy(receiver,receipt,{principal:row.principal},'unknown','recovery_status_unavailable',{held,detail:'Статус отправителю не подтверждён: '+cause+'. После восстановления подписывающего слоя нужен повторный запуск; действия /new не повторялись.'});
   l.audit(receipt.id,'mail_new_recovery_status_unavailable',cause);
   receiver.log?.('[mail-new] recovery status unavailable; owner copy queued; polling continues; control='+row.control_id+' reason='+cause);
  }
 }
}
