// RU: Ставит одну обратную квитанцию о паузе без завершения исходного поручения. Использует устойчивый ключ и маршрут возврата; неопределённый адрес удерживается для оператора.
// EN: Queues one pause return notice without completing the original task. Uses a durable key and validated return route; uncertain destinations are held for operator review.
import {cancellationReturn} from './cancellation-return.js';
export // RU: queuePauseNotice: Ставит однократное уведомление отправителю о durable-паузе.
// EN: queuePauseNotice: Queues a one-time durable-pause notice to the sender.
function queuePauseNotice(ledger,row,status,paths){
 if(!status||row.route!=='a2a')return false;
 const destination=cancellationReturn(row,ledger,paths);if(!destination||destination.kind==='none')return false;
 const pause=ledger.db.prepare("SELECT command_id FROM conversation_pauses WHERE session_id=? AND state='paused'").get(status.session_id);if(!pause)return false;
 const id=row.id+':pause-notice',data={kind:'pause',destination,command:pause.command_id,text:`агент на паузе по /stop с ${new Date(status.paused_at).toISOString()}, письмо ${row.id} в очереди (срез ${new Date(status.observed_at??ledger.now()).toISOString()}).`};
 return ledger.tx(()=>{
  const inserted=ledger.addOutbox(id,row.id,'new-return',JSON.stringify(data)).changes===1;
  if(inserted){if(destination.kind==='unknown')ledger.db.prepare("UPDATE outbox SET error=? WHERE id=?").run('HOLD: '+destination.reason,id);ledger.audit(row.id,'pause_notice_queued',JSON.stringify({id,destination}));}
  return inserted;
 });
}
