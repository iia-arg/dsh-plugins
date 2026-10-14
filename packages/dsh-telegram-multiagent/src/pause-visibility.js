// RU: Публикует атомарный статус паузы по единому снимку очереди и каталога. Считает ожидающие сущности, ограничивает частоту и не печатает секретные тела. Отсутствие cursor/проекции обозначает слепоту, а не нулевую очередь.
// EN: Publishes atomic pause status from a consistent inbox/catalog snapshot. Counts pending entities, bounds publication frequency, and avoids secret bodies. Missing cursors/projections indicate an unavailable measurement rather than an empty queue.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {inspectColdConversation} from './cold-conversation.js';import {describeInbox} from './cancellation-description.js';
// RU: bounded: Связывает асинхронный снимок с AbortSignal; отмена отклоняет ожидание и снимает listener.
// EN: bounded: Binds asynchronous snapshot work to an AbortSignal; cancellation rejects the wait and removes its listener.
async function bounded(work,signal){
 signal.throwIfAborted();let stop;try{return await Promise.race([work(),new Promise((_,reject)=>{stop=()=>reject(Error('Срез паузы не получен за 20000 мс'));signal.addEventListener('abort',stop,{once:true});})]);}finally{if(stop)signal.removeEventListener('abort',stop);}
}
export // RU: pauseText: Форматирует видимость paused состояния и ожидающих объектов.
// EN: pauseText: Formats paused-state visibility and pending items.
function pauseText(row,queued){return `на паузе с ${new Date(row.paused_at).toISOString()} по /stop, в очереди ${queued===null?'не измерено':queued}`;}
export class PauseVisibility {
 // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(pause,ctx,{file=null,agent=null}={}){
  this.pause=pause;this.ctx=ctx;this.l=pause.ledger;this.file=file;this.agent=agent;this.pending=null;this.timer=null;this.cache=new Map();this.error=null;
  ctx.on('session/event',(session,event)=>{if(event.type==='agent/inbox/spliced'||event.type==='turn/end')this.changed(session.id);});
  ctx.on('agent/status',({agent})=>this.changed(agent.session.id));
  ctx.on('agent/disposed',({agent})=>{this.cache.delete(agent.session.id);this.request();});
  ctx.effect(()=>{const timer=setInterval(()=>this.refresh(),60000);timer.unref();return()=>{clearInterval(timer);clearTimeout(this.timer);};});
 }
 // RU: rows: Читает строки каталога/учёта для ограниченного снимка.
// EN: rows: Reads catalog/accounting rows for a bounded snapshot.
rows(){
  const hasRotations=!!this.l.db.prepare("SELECT 1 FROM sqlite_master WHERE name='session_rotations'").get();
  return this.l.db.prepare("SELECT * FROM conversation_pauses p WHERE state='paused'"+(hasRotations?" AND NOT EXISTS(SELECT 1 FROM session_rotations r WHERE r.old_id=p.session_id AND r.phase='committed')":'')).all();
 }
 // RU: live: Получает наблюдаемое состояние живого агента без создания нового.
// EN: live: Obtains observed live-agent state without creating another agent.
live(sid){
  const a=this.ctx.get('agents')?.get(sid);if(!a||a.session.header.origin==='subagent'||path.resolve(a.session.header.cwd??'')!==this.pause.cwd)return null;
  return {header:a.session.header,messages:[...a.inbox.nextTurn,...a.inbox.nextStep],agent_status:a.status,observed_at:this.l.now()};
 }
 // RU: publish: Атомарно публикует snapshot; не подтверждает исполнение ожидающих объектов.
// EN: publish: Atomically publishes a snapshot without claiming pending work completed.
publish(sid){const value=this.live(sid);if(value)this.cache.set(sid,value);return value;}
 // RU: changed: Ставит признак изменения для ограниченного обновления статуса.
// EN: changed: Marks changes for bounded status refresh.
changed(sid){if(this.pause.closed)return;this.publish(sid);this.request();}
 // RU: status: Возвращает измеренный snapshot состояния; не обещает внешнего получения сообщения.
// EN: status: Returns an observed state snapshot rather than promising external receipt.
status(sid){
  const row=this.l.db.prepare("SELECT * FROM conversation_pauses WHERE session_id=? AND state='paused'").get(sid);if(!row)return null;
  const cut=this.publish(sid)??this.cache.get(sid),valid=cut&&(row.session_created===null||row.session_created===cut.header.createdAt);
  const queued=valid?cut.messages.length:null;
  return {session_id:sid,session_created:row.session_created,paused_at:row.paused_at,queued,agent_status:valid?cut.agent_status:'unknown',observed_at:valid?cut.observed_at:null,text:pauseText(row,queued)};
 }
 // RU: fileSafe: Проверяет тип/доступ файлового объекта перед использованием.
// EN: fileSafe: Checks filesystem-object type/access before use.
fileSafe(){
  const d=fs.lstatSync(path.dirname(this.file));if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==process.getuid()||(d.mode&0o022))throw Error('Недоверенный каталог файла паузы');if(!(d.mode&0o200))throw Error('Нет права записи в каталог файла паузы');
  try{const f=fs.lstatSync(this.file);if(!f.isFile()||f.isSymbolicLink()||(f.uid!==process.getuid()&&f.uid!==0)||(f.mode&0o022))throw Error('Недоверенный файл паузы');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 // RU: remove: Снимает принадлежащую компоненту публикацию, не удаляет очередь исполнения.
// EN: remove: Removes component-owned publication without deleting execution queues.
remove(){if(!this.file)return;this.fileSafe();try{fs.unlinkSync(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}}
 // RU: eligible: Проверяет пригодность объекта для публикации по доступным фактам.
// EN: eligible: Checks snapshot eligibility from available evidence.
eligible(rows){
  const ids=new Set(rows.map(r=>r.session_id));
  return rows.length>0&&!(this.ctx.get('agents')?.roots()??[]).some(a=>!ids.has(a.session.id)&&(a.status==='running'||a.inbox.hasPending));
 }
 // RU: request: Запрашивает ограниченную операцию компонента с проверкой состояния/бюджета.
// EN: request: Requests a bounded component operation under state/budget checks.
request(){
  if(!this.file||this.pause.closed)return;
  try{if(!this.eligible(this.rows())){this.remove();return;}}catch(e){this.failed(e);return;}
  if(!this.timer){this.timer=setTimeout(()=>{this.timer=null;void this.flush();},0);this.timer.unref();}
 }
 // RU: refresh: Перечитывает наблюдаемое состояние и публикует целый результат.
// EN: refresh: Refreshes observed state and publishes a complete result.
refresh(){if(!this.pause.closed)this.request();}
 // RU: failed: Фиксирует отсутствие достоверного snapshot вместо нулевых чисел.
// EN: failed: Records an unavailable snapshot rather than zero counts.
failed(error){
  if(this.pause.closed)return;const text=String(error?.message??error);if(this.error===text)return;this.error=text;this.pause.log(`[pause] ОТКАЗ публикации: ${text}`);
  try{for(const row of this.rows()){const command=this.l.get(row.command_id);if(command?.route==='tg')this.l.addOutbox('pause-export-failed:'+row.command_id,row.command_id,'tg',`Пауза сохранена, но внешний файл состояния не опубликован: ${text}. Нужна проверка каталога состояния.`);}}catch{this.pause.log('[pause] уведомление об отказе публикации не записано');}
 }
 // RU: flush: Подтверждает сохранение целого состояния перед продолжением.
// EN: flush: Confirms complete persistence before proceeding.
async flush(){
  if(!this.file||this.pause.closed)return;if(this.pending)return this.pending;
  this.pending=this.export().catch(e=>this.failed(e)).finally(()=>{this.pending=null;});return this.pending;
 }
 // RU: export: Возвращает ограниченный snapshot без передачи права исполнять задачи.
// EN: export: Exports a bounded snapshot without granting task execution authority.
async export(){
  const signal=AbortSignal.timeout(20000),deadline=performance.now()+20000;
  const rows=this.rows();if(!this.eligible(rows)){this.remove();return;}
  const fingerprint=JSON.stringify(rows.map(r=>[r.session_id,r.session_created,r.command_id]));
  const cuts=[];
  for(const row of rows){
   let cut=this.publish(row.session_id);
   if(!cut){
    const backend=this.ctx.get('sessionPersistence');const stat=await bounded(()=>backend.stat(row.session_id,{signal}),signal);
    const cached=this.cache.get(row.session_id);if(stat&&cached?.native_revision===stat.revision)cut=cached;
    if(!stat&&row.session_created!==null)throw Error('Известная сессия паузы исчезла; очередь не измерена');
    if(!cut&&!stat)cut={header:{id:row.session_id,createdAt:row.session_created},messages:[],agent_status:'not-loaded',observed_at:this.l.now()};
    else if(!cut){const cold=await bounded(()=>inspectColdConversation(backend,this.ctx.get('sessionProjections'),{session_id:row.session_id,session_created:row.session_created},row.cwd),signal);cut={header:cold.header,messages:[...cold.inbox['next-turn'],...cold.inbox['next-step']],agent_status:cold.openTurn?'unknown-turn':'not-loaded',observed_at:this.l.now()};const live=this.live(row.session_id);if(live)cut=live;else{const after=await bounded(()=>backend.stat(row.session_id,{signal}),signal);if(!after||after.revision!==stat.revision)throw Error('Журнал очереди изменился во время чтения');cut.native_revision=after.revision;}}
    if(!this.pause.closed&&!this.live(row.session_id))this.cache.set(row.session_id,cut);
   }
   if(row.session_created!==null&&row.session_created!==cut.header.createdAt)throw Error('Поколение среза очереди не совпало');
   if(cut.agent_status==='running'){this.remove();return;}
   if(!['idle','not-loaded'].includes(cut.agent_status))throw Error('Завершение хода для публикации паузы ещё не подтверждено');
   cuts.push(cut);
  }
  const schedule=this.ctx.get('schedule');if(typeof schedule?.catalog!=='function')throw Error('Счёт расписания не измерен: нет catalog');
  let timer;const catalog=await bounded(()=>Promise.race([schedule.catalog(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Счёт расписания не получен за 5000 мс')),5000);})]),signal).finally(()=>clearTimeout(timer));
  if(this.pause.closed)return;
  const current=this.rows();if(JSON.stringify(current.map(r=>[r.session_id,r.session_created,r.command_id]))!==fingerprint){this.request();return;}
  if(!this.eligible(current)){this.remove();return;}
  let letters=0;const tasks=new Set();const ids=new Set(rows.map(r=>r.session_id));
  for(const task of catalog)if(ids.has(task.sessionId)&&task.status==='active')tasks.add(task.id+'@'+task.scheduledAt);
  for(const saved of cuts){const cut=this.live(saved.header.id)??saved;for(const message of cut.messages){
   if(message.source?.kind!=='schedule'){letters++;continue;}
   const delivered=describeInbox(message,[],catalog).deliveredSchedules;if(!delivered.length)throw Error('Не удалось определить ожидающее задание inbox');
   for(const item of delivered)tasks.add(item.id+'@'+item.scheduledAt);
  }}
  const data={agent:this.agent,paused:true,since:new Date(Math.min(...rows.map(r=>r.paused_at))).toISOString(),by:'stop-owner',command_id:rows.reduce((a,b)=>a.paused_at>b.paused_at?a:b).command_id,queue:{letters,tasks:tasks.size},updated:new Date(this.l.now()).toISOString()};
  signal.throwIfAborted();if(performance.now()>deadline)throw Error('Срок публикации паузы истёк');this.fileSafe();const temp=this.file+'.tmp-'+process.pid+'-'+randomUUID();
  try{fs.writeFileSync(temp,JSON.stringify(data)+'\n',{flag:'wx',mode:0o644});fs.chmodSync(temp,0o644);fs.renameSync(temp,this.file);}finally{try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
  this.error=null;this.pause.log(`[pause] опубликовано: ${this.file}; на паузе с ${data.since} по /stop, в очереди писем ${letters}, заданий ${tasks.size}`);
 }
}
