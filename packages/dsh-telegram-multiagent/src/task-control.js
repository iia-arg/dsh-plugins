// RU: Обрабатывает адресные управляющие конверты для конкретной квитанции и поколения: dedup, фазы отмены и устойчивое решение. Протокол неизвестного вида удерживается; неизвестный remote исход не исполняется повторно.
// EN: Handles targeted control envelopes for an exact receipt/generation with deduplication, cancellation phases, and durable decisions. Unknown protocol forms are held; uncertain remote outcomes are not replayed.


import {mailEnvelope,stableJson,receiptFacts,sobytiyaSessii} from './message-receipts.js';
const idOK=x=>typeof x==='string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(x);
const exact=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const labels={persisted:'ЗАПИСАНО',no_adapter:'НЕТ АДАПТЕРА',adapter_accepted:'АДАПТЕР ПРИНЯЛ',adapter_rejected:'АДАПТЕР ОТКАЗАЛ',adapter_unknown:'ИСХОД АДАПТЕРА НЕИЗВЕСТЕН',rejected:'ОТКАЗ'};
// RU: migrate: Подготавливает совместимую схему состояния, не сбрасывает неизвестное.
// EN: migrate: Prepares compatible state schema without resetting unknown state.
function migrate(l) {
  l.db.exec(`CREATE TABLE IF NOT EXISTS task_controls(
    receipt_id TEXT PRIMARY KEY,control_id TEXT NOT NULL,metadata_json TEXT NOT NULL,body_text TEXT NOT NULL,
    state TEXT NOT NULL,reason TEXT NOT NULL,recorded_at INTEGER NOT NULL,accepted_at INTEGER,
    binding_json TEXT,attempt_owner TEXT,attempted_at INTEGER,adapter_evidence_json TEXT);`);
  if(!l.db.prepare('PRAGMA table_info(task_controls)').all().some(c=>c.name==='adapter_evidence_json'))l.db.exec('ALTER TABLE task_controls ADD COLUMN adapter_evidence_json TEXT');
}
// RU: get: Читает сущность по точному ID без изменения её состояния.
// EN: get: Reads an entity by exact identity without altering its state.
function get(l,id){return l.db.prepare('SELECT * FROM task_controls WHERE receipt_id=?').get(id);}
// RU: activeTurn: Находит незакрытый текущий ход по событиям, не по давности процесса.
// EN: activeTurn: Finds an unclosed active turn from events rather than process age.
function activeTurn(session) {
  const last=sobytiyaSessii(session).findLast(e=>e.type==='turn/start'||e.type==='turn/end');
  return last?.type==='turn/start' ? last.data?.turn : null;
}
// RU: answer: Сохраняет конечный результат контрольной операции до уведомления.
// EN: answer: Persists control-operation outcomes before notification.
function answer(row){return {action:'control',receipt_id:row.receipt_id,control_id:row.control_id,state:row.state,reason:row.reason};}
// RU: notice: Ставит устойчивую служебную квитанцию, не повторяет основной ход.
// EN: notice: Queues a durable service notice without replaying the primary turn.
function notice(l,row,stage,reason) {
  l.addOutbox(row.receipt_id+':task-control:'+stage,row.receipt_id,'a2a',JSON.stringify({
    protocol:'task-control/1',control_id:row.control_id,receipt_id:row.receipt_id,observed_at:l.now(),stage,label:labels[stage],reason,
    binding:row.binding_json ? JSON.parse(row.binding_json) : null,
    adapter_evidence:row.adapter_evidence_json ? JSON.parse(row.adapter_evidence_json) : null,
    limitation:'Не подтверждает показ модели, отмену инструмента или откат совершённых действий.'}));
  l.audit(row.receipt_id,'task_control_'+stage,reason);
}
// RU: uncertainDispatch: Фиксирует неизвестный remote исход и запрещает слепой повтор.
// EN: uncertainDispatch: Records uncertain remote dispatch and prohibits blind replay.
function uncertainDispatch(l,row) {
  let current;
  l.tx(()=>{current=get(l,row.receipt_id);if(current.state==='dispatching')notice(l,current,'adapter_unknown','dispatch_in_flight_or_unknown');});
  return current.state==='dispatching' ? {...answer(current),state:'adapter_unknown',reason:'dispatch_in_flight_or_unknown'} : answer(current);
}

export // RU: acceptTaskControl: Обрабатывает адресный control-конверт только после проверки identity и полномочия.
// EN: acceptTaskControl: Handles targeted control only after identity and authority validation.
async function acceptTaskControl(runtime,id,envelope,receiver,agent,{authorized=false}={}) {
  const l=runtime.ledger;migrate(l);const receipt=l.get(id);
  if(!receipt?.raw)throw Error('task-control: receipt/raw missing');
  const actual=mailEnvelope(receipt.raw).protocol;
  const m=actual?.metadata;let reason=null;
  if(authorized!==true)reason='unauthorized';
  else if(!actual || stableJson(actual)!==stableJson(envelope) || actual.reason || actual.version!=='2')reason='invalid_control';
  else if(m?.kind!=='task-control/1')reason='unsupported_control_version';
  else if(m.op!=='cancel')reason='unsupported_operation';
  else if(!exact(m,['kind','op','delivery_id','recipient','target']) || !idOK(m.delivery_id) ||
    !exact(m.recipient,['id','ledger_uuid']) || !exact(m.target,['decision_id','recipient','ledger_uuid']) ||
    !idOK(m.target.decision_id) || !actual.body?.trim() || mailEnvelope.payloadBytes(receipt.raw)>65536)reason='invalid_control';
  else if(!idOK(receiver) || m.recipient.id!==receiver || m.target.recipient!==receiver ||
    m.recipient.ledger_uuid!==l.protocolIdentity() || m.target.ledger_uuid!==l.protocolIdentity())reason='target_scope_mismatch';
  let old=get(l,id);
  if(old && reason)return {action:'control',state:'rejected',reason,receipt_id:id};
  if(old && !['persisted','no_adapter'].includes(old.state)) {

    if(old.state==='dispatching')return uncertainDispatch(l,old);
    return answer(old);
  }
  let target=null,binding=null;const session=agent?.session;
  if(!reason) {
    const ref=l.db.prepare('SELECT receipt_id FROM decision_index WHERE recipient=? AND decision_id=?').get(receiver,m.target.decision_id);
    target=ref && l.get(ref.receipt_id);
    if(!target || target.id===id)reason='target_not_found';
    else if(!session || target.session_id!==session.id || target.session_created!==session.header.createdAt)reason='target_session_mismatch';
    else {
      try {await runtime.observe(session);} catch {reason='target_observation_failed';}
      target=l.get(target.id);
      if(!reason && (agent.session!==session || target.session_id!==session.id || target.session_created!==session.header.createdAt))reason='target_session_mismatch';
      if(!reason) {
        const facts=receiptFacts(session,[target.dsh_id]).get(target.dsh_id);
        if(target.blocked || target.finished_at!==null || target.claimed_turn===null || activeTurn(session)!==target.claimed_turn || agent.status!=='running' ||
          !facts?.claims.length || facts.end || facts.claims.some(c=>c.turn!==target.claimed_turn))reason='target_not_running';
        else binding={control_id:m.delivery_id,generation:l.owner,recipient:receiver,ledger_uuid:l.protocolIdentity(),target_receipt:target.id,
          session_id:session.id,session_created:session.header.createdAt,turn:target.claimed_turn};
      }
    }
  }
  old=get(l,id);
  if(old && !['persisted','no_adapter'].includes(old.state))return old.state==='dispatching'
    ? uncertainDispatch(l,old) : answer(old);
  l.tx(()=>{
    if(!get(l,id)) {
      const currentReceipt=l.get(id);
      const previouslyHandled=currentReceipt.dispatch_started || currentReceipt.channel_started || currentReceipt.message_json!==null || currentReceipt.finished_at!==null;
      if(previouslyHandled)reason='control_already_dispatched';
      const state=reason?'rejected':'persisted';
      l.db.prepare('INSERT INTO task_controls(receipt_id,control_id,metadata_json,body_text,state,reason,recorded_at,binding_json) VALUES(?,?,?,?,?,?,?,?)')
        .run(id,idOK(m?.delivery_id)?m.delivery_id:id,stableJson(m??null),actual?.body??'',state,reason??'running_control_recorded',l.now(),binding?JSON.stringify(binding):null);

      if(!previouslyHandled) {
        l.db.prepare("UPDATE receipts SET blocked='task_control' WHERE id=?").run(id);
        l.completeRow({...l.get(id),expects_reply:0},'task_control_recorded',{control_state:state},'Управляющий ввод сохранён отдельно; исполнения поручения этим не подтверждено.',true);
      }
      notice(l,get(l,id),state,reason??'running_control_recorded');
    }
  });
  if(reason) {
    if(get(l,id).state!=='rejected')l.tx(()=>{l.db.prepare("UPDATE task_controls SET state='rejected',reason=? WHERE receipt_id=?").run(reason,id);notice(l,get(l,id),'rejected',reason);});
    return answer(get(l,id));
  }
  const adapter=runtime.taskControlAdapter;
  if(typeof adapter!=='function') {
    l.tx(()=>{l.db.prepare("UPDATE task_controls SET state='no_adapter',reason='no_adapter' WHERE receipt_id=? AND state IN ('persisted','no_adapter')").run(id);notice(l,get(l,id),'no_adapter','no_adapter');});
    return answer(get(l,id));
  }
  const won=l.tx(()=>l.db.prepare("UPDATE task_controls SET state='dispatching',reason='dispatch_intent',attempt_owner=?,attempted_at=?,binding_json=? WHERE receipt_id=? AND state IN ('persisted','no_adapter')")
    .run(l.owner,l.now(),JSON.stringify(binding),id).changes===1);
  if(!won)return uncertainDispatch(l,get(l,id));
  const expected=stableJson(binding);let state='adapter_unknown',why='adapter_error',timer,evidence=null;
  try {
    const reply=await Promise.race([
      Promise.resolve().then(()=>adapter({binding:structuredClone(binding),op:'cancel',body:actual.body})),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);}),
    ]);
    const current=l.get(binding.target_receipt);
    if(l.owner!==binding.generation || agent.session!==session || session.id!==binding.session_id || session.header.createdAt!==binding.session_created || current?.claimed_turn!==binding.turn || current.finished_at!==null || current.blocked || agent.status!=='running' || activeTurn(session)!==binding.turn)why='binding_changed';
    else if(reply?.accepted===true && stableJson(reply.binding)===expected){state='adapter_accepted';why='adapter_ack';if(reply.codex)evidence=JSON.stringify({codex:reply.codex,model_response:'unknown'});}
    else if(reply?.accepted===false){state='adapter_rejected';why='adapter_refused';}
    else why=reply===null?'adapter_timeout':'invalid_adapter_ack';
  } catch {                                                                }
  finally {clearTimeout(timer);}
  l.tx(()=>{
    const changed=l.db.prepare("UPDATE task_controls SET state=?,reason=?,accepted_at=?,adapter_evidence_json=? WHERE receipt_id=? AND state='dispatching' AND attempt_owner=?")
      .run(state,why,state==='adapter_accepted'?l.now():null,evidence,id,l.owner).changes;
    if(changed)notice(l,get(l,id),state,why);
  });
  return answer(get(l,id));
}
