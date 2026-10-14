// RU: Координирует /new: допуск, снимок старого поколения, план отмены, сохранение исходов и commit нового поколения. Не смешивает удаление schedule с отзывом доставленного inbox; неопределённость останавливает переход.
// EN: Coordinates /new admission, original-generation snapshot, cancellation planning, outcome persistence, and replacement commit. Schedule deletion is separate from recalling delivered inbox items; uncertainty halts the transition.
import {cancellationReturn,cancellationNotice,verifiedCoordinator} from './cancellation-return.js';
import {describeReceipt,describeAttachment,describeInbox} from './cancellation-description.js';
import path from 'node:path';
import {readColdHandle} from './cold-conversation.js';
import {newSessionRefusal} from './new-session-refusal.js';

// RU: userInterrupted: Различает пользовательское прерывание от иного конца хода.
// EN: userInterrupted: Distinguishes user interruption from other turn outcomes.
function userInterrupted(row) {
 if(row.outcome!=='interrupted_unknown'||row.finished_at===null||row.claimed_turn===null)return false;
 try{const end=JSON.parse(row.result_json).end;return end?.turn===row.claimed_turn&&end.reason?.kind==='aborted'&&end.reason.reason?.kind==='user';}catch{return false;}
}
// B-N-1642: чат гостя открытого бота живёт под ключом 'gost-<chat>'.
const sameRoute=(value,key,merge,a2a)=> (merge&&String(value)===String(merge)?a2a:String(value))===key || 'gost-'+String(value)===key;
export // RU: rotateConversation: Координирует /new: допуск, снимок старого поколения, план отмены, сохранение исходов и commit нового поколения. Не смешивает удаление schedule с отзывом доставленного inbox; неопределённость останавливает переход.
// EN: rotateConversation: Coordinates /new admission, original-generation snapshot, cancellation planning, outcome persistence, and replacement commit. Schedule deletion is separate from recalling delivered inbox items; uncertainty halts the transition.
async function rotateConversation(o) {
  const {conversations:c,ledger:l,attachments,ctx,key,receiptId,cwd,createAgent,checkCapability,mergeChat,a2aChat}=o;
  if(o.enabled!==true)throw Error('Новые ротации выключены; текущая сессия сохранена');
  let old=o.entry,writer,fresh,intent,committed=false,bootstrap=false;
  const current=c.current(key),sid=current.session_id;
  if(c.rotating(sid))throw Error('Для этой сессии уже идёт /new');
  const live=ctx.agents.get(sid);
  if(old?.handle.borrowed||(live&&live!==old?.handle.agent))throw Object.assign(Error('Этой живой сессией владеет платформа; чужой writer не освобождается'),{reason:'session_owned_by_platform'});
  if(old){const refusal=newSessionRefusal({agent:old.handle.agent});if(refusal)throw Error(refusal);}
  const signal=AbortSignal.timeout(o.timeoutMs??60000);
  const check=()=>{signal.throwIfAborted();if(intent&&l.now()>=intent.deadline)throw Error('Истёк срок /new');};
  const bounded=(work,late)=>new Promise((resolve,reject)=>{
    check();let settled=false;
    const abort=()=>{if(!settled){settled=true;reject(Error('Истёк срок /new; исход незавершённого действия неизвестен'));}};
    signal.addEventListener('abort',abort,{once:true});
    let task;try{task=work();}catch(error){signal.removeEventListener('abort',abort);reject(error);return;}
    Promise.resolve(task).then(value=>{signal.removeEventListener('abort',abort);if(settled){Promise.resolve(late?.(value)).catch(()=>{});return;}settled=true;resolve(value);},error=>{signal.removeEventListener('abort',abort);if(!settled){settled=true;reject(error);}});
  });
  await bounded(()=>checkCapability(signal));
  const schedule=ctx.get('schedule'),persistence=ctx.get('sessionPersistence'),projections=ctx.get('sessionProjections');
  if(!schedule?.catalog||!schedule?.delete||!persistence?.open||!projections?.restore)throw Object.assign(Error('Нет служб проверки расписания/сессии; /new не выполнялся'),{reason:'capability_missing'});
  if(old&&!c.holdsSession(sid))await bounded(()=>o.observe(old.handle.agent.session));
  const commandOrder=l.db.prepare('SELECT rowid AS n FROM receipts WHERE id=?').get(receiptId)?.n;
  if(!commandOrder)throw Error('Нет квитанции команды /new');
  const pending=l.db.prepare('SELECT rowid AS received_order,* FROM receipts WHERE (finished_at IS NULL OR outcome=?) AND id<>?').all('interrupted_unknown',receiptId).filter(r=>r.finished_at===null||userInterrupted(r)).filter(r=>r.session_id?r.session_id===sid:r.received_order<commandOrder&&(r.route==='a2a'?key===a2aChat:r.route==='tg'&&sameRoute(r.route_key,key,mergeChat,a2aChat)));
  if(pending.some(r=>r.claimed_turn!==null&&!userInterrupted(r)))throw Object.assign(Error('Исход ранее начатого письма не подтверждён; требуется сверка до /new'),{reason:'prior_outcome_unknown'});
  const catalog=await bounded(()=>schedule.catalog());
  const schedules=catalog.filter(t=>t.sessionId===sid&&t.status==='active');
  const files=Object.values(attachments.load().requests).filter(r=>(r.sessionId?r.sessionId===sid:sameRoute(r.chat,key,mergeChat,a2aChat))&&!['confirmed','skipped','cancelled_by_new'].includes(r.status));
  if(files.some(r=>!['saved','dispatching','queued'].includes(r.status)))throw Object.assign(Error('Неизвестное состояние вложения; /new не выполнялся'),{reason:'attachment_state_unknown'});
  try {
    if(!old){
      const stat=await bounded(()=>persistence.stat(sid));
      if(!stat){
        if(current.session_created!==null)throw Error('Сохранённая сессия исчезла');
        old={sessionId:sid,handle:await bounded(()=>createAgent(sid),h=>h.dispose())};
        bootstrap=true;o.onBootstrap?.(old);
        if(await bounded(()=>ctx.get('sessions').flush(old.handle.agent.session))!==true)throw Error('Начальная сессия не сохранена');
      } else {
        writer=await bounded(()=>persistence.open(sid,'write',{signal}),h=>h.close());
      }
    }
    const state=writer?await readColdHandle(writer,projections,current,cwd,signal):{
      header:old.handle.agent.session.header,
      inbox:{'next-turn':old.handle.agent.inbox.nextTurn,'next-step':old.handle.agent.inbox.nextStep},
      openTurn:false,events:old.handle.agent.session.snapshotEvents(),
    };
    if(state.header.origin==='subagent'||typeof state.header.cwd!=='string'||path.resolve(state.header.cwd)!==path.resolve(cwd))throw Error('Нельзя менять чужую сессию/cwd');
    if(state.openTurn)throw Error('Холодная сессия имеет незавершённый ход; остановка внешнего исполнения не подтверждена — сначала восстановление и /stop');
    c.pin(key,state.header);
    const inbox=[...state.inbox['next-turn'],...state.inbox['next-step']];
    intent=c.begin(key,receiptId,{beforeBegin:o.beforeBegin});
    if(intent.phase!=='prepared')throw Error('Эта команда /new уже имеет исход');
    c.planItems(receiptId,[...schedules.map(t=>({kind:'schedule',id:t.id,detail:{kind:t.kind,scheduledAt:t.scheduledAt,title:t.title}})),
      ...pending.map(r=>({kind:'receipt',id:r.id,detail:{blocked:r.blocked,interrupted:userInterrupted(r),...describeReceipt(r,verifiedCoordinator(r,l)),returnRoute:cancellationReturn(r,l,o.returnPaths)}})),...files.map(r=>({kind:'attachment',id:r.id,detail:{chat:r.chat,sessionId:r.sessionId,...describeAttachment(r,pending)}})),
      ...inbox.map(m=>({kind:'inbox',id:m.id,detail:describeInbox(m,state.events,catalog)}))]);
    l.tx(()=>{for(const r of pending){l.db.prepare("UPDATE receipts SET blocked='new_cancel_pending' WHERE id=? AND finished_at IS NULL").run(r.id);l.audit(r.id,'new_cancellation_planned',receiptId);}});
    const step=async(kind,id,action)=>{
      check();c.itemState(receiptId,kind,id,'started');
      const result=await bounded(action,()=>{l.audit(receiptId,'new_late_result',kind+':'+id);l.notice(receiptId,'late:'+kind+':'+id,`Поздно завершилось действие /new над ${kind} ${id}; переключение не продолжалось, нужна сверка.`);});
      check();c.itemState(receiptId,kind,id,result===false?'skipped':'done');
    };
    for(const t of schedules)await step('schedule',t.id,async()=>{
      const actual=(await schedule.catalog()).find(x=>x.id===t.id);
      if(!actual||actual.sessionId!==sid||actual.status!=='active'||['kind','scheduledAt','title'].some(k=>actual[k]!==t[k]))throw Error('Задание '+t.id+' изменилось после плана');
      const reply=await schedule.delete({sessionId:sid,id:t.id},signal);
      if(reply.deleted!==true)throw Error('Удаление задания '+t.id+' не подтверждено');
    });
    check();
    if(old){
      const refusal=newSessionRefusal({agent:old.handle.agent});if(refusal)throw Error(refusal);
      if(ctx.agents.get(sid)!==old.handle.agent)throw Error('Владелец сессии сменился');
      const actual=[...old.handle.agent.inbox.nextTurn,...old.handle.agent.inbox.nextStep];
      if(actual.length!==inbox.length||actual.some(m=>!inbox.some(p=>p.id===m.id)))throw Error('Очередь изменилась после плана; новое сообщение не отменено');
      for(const m of inbox){
        c.itemState(receiptId,'inbox',m.id,'started');
        if(!old.handle.agent.inbox.remove(m.id))throw Error('Письмо inbox исчезло при отмене');
      }
      if(old.handle.agent.inbox.hasPending)throw Error('В очереди появилось новое сообщение; оно не отменено');
      if(await bounded(()=>ctx.get('sessions').flush(old.handle.agent.session))!==true)throw Error('Отмена inbox не сохранена');
      check();if(old.handle.agent.status!=='idle')throw Error('Начался ход при отмене очереди');
      if(old.handle.agent.inbox.hasPending)throw Error('После flush появилось новое сообщение; оно не отменено');
      await bounded(()=>old.handle.dispose());o.onOldDisposed?.();
      writer=await bounded(()=>persistence.open(sid,'write',{signal}),h=>h.close());
    }
    const cut=await readColdHandle(writer,projections,{session_id:sid,session_created:state.header.createdAt},cwd,signal);
    if(cut.openTurn)throw Error('Незавершённый ход появился при /new; исполнение неизвестно');
    const since=cut.events.slice(state.events.length),late=[];
    for(const e of since)if(e.type==='agent/inbox/spliced')for(const message of e.data.inserted??[])
      if(!inbox.some(m=>m.id===message.id)&&!late.some(m=>m.message.id===message.id))late.push({message,target:e.data.target});
    if(late.length){
      c.planItems(receiptId,late.map(x=>({kind:'inbox',id:x.message.id,detail:{late:true}})));
      const executionUnknown=since.some(e=>e.type==='turn/start'||e.type==='agent/inbox/claimed');
      if(executionUnknown){for(const x of late)c.itemState(receiptId,'inbox',x.message.id,'started');throw Error('Позднее сообщение могло начать исполнение; исход неизвестен');}
      let seq=cut.events.length;const events=[];
      for(const target of ['next-turn','next-step']){
        const pending=cut.inbox[target],restored=late.filter(x=>x.target===target&&!pending.some(m=>m.id===x.message.id)).map(x=>x.message);
        if(restored.length)events.push({seq:seq++,time:Date.now(),type:'agent/inbox/spliced',data:{target,start:pending.length,inserted:restored}});
      }
      if(events.length)await writer.append(events);
      for(const x of late)c.itemState(receiptId,'inbox',x.message.id,'restored');
      throw Error('Позднее сообщение сохранено в старой очереди; переход остановлен');
    }
    let seq=cut.events.length;
    const removals=[];
    for(const target of ['next-step','next-turn'])if(cut.inbox[target].length){
      const ids=cut.inbox[target].map(m=>m.id);
      if(ids.some(id=>!inbox.some(m=>m.id===id)))throw Error('В старый inbox пришло новое сообщение; повтори /new после сверки');
      for(const id of ids)c.itemState(receiptId,'inbox',id,'started');
      removals.push({seq:seq++,time:Date.now(),type:'agent/inbox/spliced',data:{target,start:0,removedCount:ids.length,inserted:[],outcome:'canceled'}});
    }
    if(removals.length)await bounded(()=>writer.append(removals,{signal}));
    const cleared=await readColdHandle(writer,projections,{session_id:sid,session_created:state.header.createdAt},cwd,signal);
    if(cleared.pendingCount||cleared.openTurn)throw Error('Старая очередь не подтверждена пустой');
    for(const m of inbox)c.itemState(receiptId,'inbox',m.id,'done');
    for(const r of pending)await step('receipt',r.id,()=>l.tx(()=>{
      const row=l.get(r.id),interrupted=userInterrupted(row);if(row.finished_at!==null&&!interrupted)return false;
      if(row.claimed_turn!==null&&!interrupted)throw Error('Письмо начало исполнение при /new');
      l.protocolExit(row,'rejected','cancelled_by_new');
      const destination=cancellationReturn(row,l,o.returnPaths);
      l.completeRow(interrupted||destination?{...row,expects_reply:0}:row,'cancelled_by_new',{command:receiptId,...(interrupted?{previous:{outcome:row.outcome,finished_at:row.finished_at,evidence:JSON.parse(row.result_json)}}:{})},`Отменено командой /new ${receiptId}; дальнейшее исполнение не выполнялось.`);
      if(destination&&destination.kind!=='none'){
        l.addOutbox(row.id+':new-return',row.id,'new-return',JSON.stringify({destination,text:cancellationNotice(row,o.principal),command:receiptId}));
        l.audit(row.id,destination.kind==='unknown'?'cancellation_return_held':'cancellation_return_queued',JSON.stringify(destination));
      }
      l.audit(row.id,'cancelled_by_new',receiptId);
    }));
    for(const r of files)await step('attachment',r.id,()=>attachments.cancelForNew(r,receiptId));
    check();
    if((await bounded(()=>schedule.catalog())).some(t=>t.sessionId===sid&&t.status==='active'))throw Error('Появилось новое active-задание старой сессии; переход не выполнен');
    fresh=await bounded(()=>createAgent(intent.new_id),h=>h.dispose());
    if(await bounded(()=>ctx.get('sessions').flush(fresh.agent.session))!==true)throw Error('Новая сессия не сохранена');
    check();c.commit(receiptId,fresh.agent.session.header,{reply:o.suppressReply!==true});committed=true;ctx.get('conversationPause')?.refreshStatus?.();
    return {handle:fresh,sessionId:intent.new_id};
  } catch(error) {
    if(intent&&!committed)c.abort(receiptId,error.message);
    if(fresh&&!committed)await fresh.dispose();
    if(bootstrap&&!o.onBootstrap&&!committed)await old.handle.dispose();
    throw error;
  } finally { if(writer)try{await writer.close();}catch(error){
    if(!committed)throw error;
    l.audit(receiptId,'new_cleanup_failed',String(error.message));
    l.notice(receiptId,'cleanup','Новая сессия уже выбрана; освобождение старого writer не подтверждено. Нужна проверка.');
  } }
}
