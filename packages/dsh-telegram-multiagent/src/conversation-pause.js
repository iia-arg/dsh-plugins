// RU: Пауза является durable-состоянием поколения, сохраняет queued/claimed ввод и не будит восстановленную сессию. Owner resume отдельно допускается и сохраняется; unknown отмена не выдаётся за завершённую. Не отзывает уже выполненную внешнюю работу.
// EN: Pause is durable generation state that preserves queued/claimed input and does not wake a restored session. Owner resume is separately admitted and persisted; uncertain cancellation is not completion. Already executed external work is not recalled.
import path from 'node:path';
import {PauseVisibility} from './pause-visibility.js';
import {WakeGate} from './wake-gate.js';
import {receiptFacts} from './message-receipts.js';
import {preserveClaimedInput} from './telegram-stop.js';
const installed=Symbol.for('dsh-telegram-multiagent.conversation-pause');


export class ConversationPause {
 // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(ledger,cwd,log=console.error,visibilityOptions={}){
  this.ledger=ledger;this.cwd=path.resolve(cwd);this.log=log;this.closed=false;this.restoring=new WeakSet();this.wakeGate=new WakeGate(ledger);this.visibilityOptions=visibilityOptions;
  ledger.db.exec(`CREATE TABLE IF NOT EXISTS conversation_pauses(
   session_id TEXT PRIMARY KEY, session_created INTEGER, cwd TEXT NOT NULL,
   command_id TEXT NOT NULL, command_order INTEGER NOT NULL, paused_at INTEGER NOT NULL,
   state TEXT NOT NULL CHECK(state IN ('paused','resuming')), owner_id TEXT, owner_turn INTEGER, backlog_json TEXT NOT NULL)`);
 }
 // RU: state: Читает состояние паузы конкретного поколения.
// EN: state: Reads pause state for one exact generation.
state(header){
  if(this.closed)throw Error('Служба паузы выгружена');
  const row=this.ledger.db.prepare('SELECT * FROM conversation_pauses WHERE session_id=?').get(header.id);
  if(!row)return null;
  if(row.cwd!==path.resolve(header.cwd??this.cwd)||(row.session_created!==null&&row.session_created!==header.createdAt))throw Error('Не совпало поколение паузы');
  return row;
 }
 // RU: pause: Сохраняет паузу и контекст поколения до сообщения о её включении.
// EN: pause: Persists generation pause/context before reporting activation.
pause(header,commandId){
  if(path.resolve(header.cwd??this.cwd)!==this.cwd)throw Error('Нельзя ставить чужой cwd на паузу');
  const l=this.ledger,order=l.db.prepare('SELECT rowid AS n FROM receipts WHERE id=?').get(commandId)?.n;
  if(!order)throw Error('Нет квитанции /stop');
  l.tx(()=>{
   l.db.prepare("INSERT OR REPLACE INTO conversation_pauses VALUES(?,?,?,?,?,?,'paused',NULL,NULL,'[]')").run(header.id,header.createdAt??null,this.cwd,commandId,order,l.now());
   l.audit(commandId,'conversation_paused',JSON.stringify({session:header.id,created:header.createdAt??null}));
  });
  this.visibility?.changed(header.id);
 }
 // RU: resumeOwner: Снимает паузу разрешённым обычным owner input и сохраняет этот intent до побудки.
// EN: resumeOwner: Releases pause for admitted ordinary owner input and persists intent before wakeup.
resumeOwner(agent,receiptId,messageId){
  if(this.mailControls?.deferOwner(agent,receiptId,messageId))return false;
  const row=this.state(agent.session.header);if(!row||row.state==='resuming')return false;
  const l=this.ledger,order=l.db.prepare('SELECT rowid AS n FROM receipts WHERE id=?').get(receiptId)?.n;
  if(!order||order<=row.command_order)throw Error('Сообщение владельца принято раньше /stop');
  if(![...agent.inbox.nextTurn,...agent.inbox.nextStep].some(m=>m.id===messageId))throw Error('Сообщение владельца не сохранено в очереди');
  l.tx(()=>{
   l.db.prepare("UPDATE conversation_pauses SET state='resuming',owner_id=?,owner_turn=NULL,backlog_json=? WHERE session_id=?").run(messageId,JSON.stringify([...agent.inbox.nextTurn,...agent.inbox.nextStep].filter(m=>m.id!==messageId).map(m=>m.id)),agent.session.id);
   l.audit(receiptId,'conversation_resume_requested',JSON.stringify({session:agent.session.id,message:messageId}));
  });this.visibility?.request();return true;
 }
 // RU: attach: Подключает компонент к конкретному агенту/сессии с проверкой повторного монтажа.
// EN: attach: Attaches a component to an exact agent/session with repeat-mount checks.
attach(agent){
  if(agent.session.header.origin==='subagent'||path.resolve(agent.session.header.cwd??'')!==this.cwd)return;
  if(agent[installed]?.owner===this)return;
  const previous=agent[installed],wake=previous?.wake??agent.wakeDriver,claim=previous?.claim??agent.inbox.claim,turnDriver=previous?.turnDriver??agent.turn,cancel=previous?.cancel??agent.cancel,maintenance=previous?.maintenance??agent.runMaintenance;
  if(typeof maintenance!=='function'||typeof turnDriver!=='function'||typeof wake!=='function'||typeof claim!=='function'||typeof agent.inbox.mutate!=='function'||typeof agent.inbox.dispatch?.emit!=='function')throw Error('Нет native admission API для паузы');
  previous?.remove?.();
  const header=agent.session.header,l=this.ledger;

  const blocked=()=>{try{return this.restoring.has(agent)||this.state(header)?.state==='paused'||this.mailControls?.nativeBlocked(agent)===true;}catch(error){this.log(`Пауза ${header.id}: запуск удержан (${error.message})`);return true;}};
  agent.wakeDriver=(...args)=>{if(blocked())return;return wake.apply(agent,args);};
  agent.turn=(...args)=>blocked()?Promise.resolve(false):turnDriver.apply(agent,args);
  agent.runMaintenance=(...args)=>blocked()?Promise.reject(Error('Работа запрещена паузой')):maintenance.apply(agent,args);
  agent.cancel=(cause,options={})=>{
   let keep=false;
   if(cause?.kind==='disposed'){try{keep=!!this.state(header)||this.sdkInputs?.heldIds(header).size>0;}catch{keep=true;}}
   return cancel.call(agent,cause,keep?{...options,keepInbox:true}:options);
  };


  const inputAllowed=message=>!this.sdkInputs?.heldIds(header).has(message.id)&&!this.mailControls?.store.backlogIds(header).has(message.id);
  const claimEligible=(target,turn)=>{
    if(!this.sdkInputs?.heldIds(header).size&&!this.mailControls?.store.backlogIds(header).size)return claim.call(agent.inbox,target,turn);
    const batch=agent.inbox.nextStep.filter(inputAllowed);
    if(target==='next-turn'){const candidate=agent.inbox.nextTurn.find(inputAllowed);if(candidate)batch.push(candidate);}
    const result=[];for(const message of batch){const t=agent.inbox.nextStep.some(m=>m.id===message.id)?'next-step':'next-turn';const q=t==='next-step'?agent.inbox.nextStep:agent.inbox.nextTurn;result.push(...agent.inbox.mutate(t,q.findIndex(m=>m.id===message.id),1,[],false));}
    for(const message of result)agent.inbox.dispatch.emit('agent/inbox/claimed',{message,turn});return result;
  };
  agent.inbox.claim=(target,turn)=>{
   if(this.mailControls?.nativeBlocked(agent))throw Error('Начало хода удержано fence подписанного стопа');
   const row=this.state(header);
   if(row?.state==='paused')throw Error('Начало хода запрещено паузой');
   if(row?.state==='resuming'){
    if(row.owner_turn===turn){
     const backlog=new Set(JSON.parse(row.backlog_json)),fresh=agent.inbox.nextStep.filter(m=>!backlog.has(m.id)&&inputAllowed(m)),claimed=[];
     for(const message of fresh){const index=agent.inbox.nextStep.findIndex(m=>m.id===message.id);claimed.push(...agent.inbox.mutate('next-step',index,1,[],false));}
     for(const message of claimed)agent.inbox.dispatch.emit('agent/inbox/claimed',{message,turn});
     return claimed;
    }
    if(row.owner_turn!==null)throw Error('Не завершён ход снятия паузы');
    const queue=['next-turn','next-step'].find(t=>(t==='next-turn'?agent.inbox.nextTurn:agent.inbox.nextStep).some(m=>m.id===row.owner_id));
    if(!queue)throw Error('Сообщение снятия паузы отсутствует; запуск удержан');
    const list=queue==='next-turn'?agent.inbox.nextTurn:agent.inbox.nextStep,index=list.findIndex(m=>m.id===row.owner_id);
    if(!inputAllowed(list[index]))throw Error('Вход владельца удержан неизвестной SDK-передачей');
    const messages=agent.inbox.mutate(queue,index,1,[],false);
    l.db.prepare('UPDATE conversation_pauses SET owner_turn=? WHERE session_id=?').run(turn,header.id);
    for(const message of messages)agent.inbox.dispatch.emit('agent/inbox/claimed',{message,turn});
    return messages;
   }
   return claimEligible(target,turn);
  };
  const remove=agent.ctx.on('session/event',(session,event)=>{
   if(session!==agent.session||event.type!=='turn/end')return;
   const row=this.state(header);if(row?.state!=='resuming')return;
   // A-N-1881: owner input released the pause while the interrupted turn was still running — wake-gate refuses a running agent
   // (wake-gate.js:17/23), and nothing woke it afterwards. One wake by the recorded intent once idle; re-checked at wake time.
   if(row.owner_turn===null){
    if(typeof agent.whenIdle!=='function'){this.log(`Пауза ${header.id}: нет agent.whenIdle — побудка после хода не выполнена`);return;}
    agent.whenIdle().then(()=>this.wakeGate.resumeAfterOwner(agent,()=>{const c=this.state(header);return c?.state==='resuming'&&c.owner_turn===null;})).catch(error=>this.log(`Пауза ${header.id}: побудка после хода не выполнена (${error.message})`));
    return;
   }
   if(row.owner_turn!==event.data?.turn)return;
   l.db.prepare('DELETE FROM conversation_pauses WHERE session_id=?').run(header.id);
  });
  agent[installed]={owner:this,wake,claim,turnDriver,cancel,maintenance,remove};
  this.visibility?.changed(header.id);
  this.log(`[pause] admission installed: session=${header.id}, created=${header.createdAt}`);
 }
 // RU: restore: Восстанавливает сохранённое состояние соответствующего поколения без самовольной новой работы.
// EN: restore: Restores state for the matching generation without launching unauthorized fresh work.
async restore(agent){
  this.restoring.add(agent);this.attach(agent);
  const header=agent.session.header,row=this.state(header);let wake=false;
  if(this.mailControls?.store.fence(header)){this.restoring.delete(agent);this.log(`Пауза ${header.id}: control fence сохранён после restore`);return;}
  if(row){
   if(row.session_created===null)this.ledger.db.prepare('UPDATE conversation_pauses SET session_created=? WHERE session_id=?').run(header.createdAt,header.id);
   if(row.state==='resuming'&&agent.status!=='running'){
    const pending=[...agent.inbox.nextTurn,...agent.inbox.nextStep].some(m=>m.id===row.owner_id);
    if(pending){this.ledger.db.prepare('UPDATE conversation_pauses SET owner_turn=NULL WHERE session_id=?').run(header.id);wake=true;}
    else{
     const facts=receiptFacts(agent.session,[row.owner_id]).get(row.owner_id);
     if(facts?.claims.length){
      for(const claim of facts.claims)preserveClaimedInput(agent.session,claim.turn);
      if(await agent.ctx.get('sessions').flush(agent.session)!==true)throw Error('Восстановленный контекст владельца не сохранён');
      wake=this.ledger.db.prepare("DELETE FROM conversation_pauses WHERE session_id=? AND state='resuming' AND command_id=? AND owner_id=?").run(header.id,row.command_id,row.owner_id).changes===1;
     }else{
      this.ledger.db.prepare("UPDATE conversation_pauses SET state='paused',owner_id=NULL,owner_turn=NULL WHERE session_id=?").run(header.id);
      this.log(`Пауза ${header.id}: исход сообщения владельца неизвестен; требуется новый ввод`);
     }
    }
   }
  }
  this.restoring.delete(agent);if(wake||this.state(header)?.state==='resuming')this.wakeGate.resumeAfterOwner(agent,()=>{const current=this.state(header);return !current||current.state==='resuming';});
 }
 resumeControlled(agent,commandId,messageId){
  const row=this.state(agent.session.header),control=this.mailControls?.store.row(commandId);
  if(!row||!control||row.command_id!==control.receipt_id||control.state!=='replacement_permitted'||!control.resume_proven||!control.native_terminal||!control.sdk_terminal)throw Error('Нет собственного подтверждённого replacement permit');
  if(![...agent.inbox.nextTurn,...agent.inbox.nextStep].some(m=>m.id===messageId))throw Error('Replacement не сохранён в native очереди');
  this.ledger.tx(()=>{
   const changed=this.ledger.db.prepare("UPDATE conversation_pauses SET state='resuming',owner_id=?,owner_turn=NULL,backlog_json=? WHERE session_id=? AND command_id=? AND state='paused'").run(messageId,JSON.stringify([...agent.inbox.nextTurn,...agent.inbox.nextStep].filter(m=>m.id!==messageId).map(m=>m.id)),agent.session.id,control.receipt_id).changes;
   if(changed!==1)throw Error('Власть паузы изменилась до replacement');
   this.ledger.db.prepare("UPDATE mail_stop_controls SET state='resuming',replacement_message=? WHERE control_id=? AND state='replacement_permitted'").run(messageId,commandId);
  });
  this.visibility?.request();
 }
 // RU: status: Возвращает измеренный snapshot состояния; не обещает внешнего получения сообщения.
// EN: status: Returns an observed state snapshot rather than promising external receipt.
status(sid){return this.visibility?.status(sid)??null;}
 // RU: refreshStatus: Пересчитывает видимость очереди после изменения фактов.
// EN: refreshStatus: Refreshes queue visibility after observed changes.
refreshStatus(){this.visibility?.refresh();}
 // RU: mount: Подключает компонент к жизненному циклу сервисов и существующим агентам.
// EN: mount: Attaches the component to service lifecycle and existing agents.
mount(ctx){
  this.visibility=new PauseVisibility(this,ctx,this.visibilityOptions);
  ctx.on('agent/created',({agent})=>this.restore(agent),true);
  for(const agent of ctx.get('agents')?.roots()??[])this.restore(agent).catch(error=>this.log(`Пауза: восстановление удержано (${error.message})`));
  ctx.effect(()=>()=>{this.closed=true;});
  if(ctx.get('sessionPersistence')&&ctx.get('sessionProjections')&&ctx.get('schedule'))this.visibility.refresh();
 }
}
