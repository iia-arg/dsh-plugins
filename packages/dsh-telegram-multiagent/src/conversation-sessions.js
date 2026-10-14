// RU: Хранит устойчивую привязку route к session ID/createdAt/revision и попытки ротации со сроком60с. Prepared отменяется после рестарта; commit требует неизменной старой привязки. Архивная сессия не подменяет текущую.
// EN: Persists route-to-session ID/createdAt/revision bindings and rotation attempts with60-second deadlines. Restart aborts prepared attempts; commit requires the original binding unchanged. Archived sessions cannot replace the current one.
import {whenText} from './cancellation-description.js';
import {randomUUID} from 'node:crypto';


export class ConversationSessions {
  // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(ledger,log=()=>{}) {
    this.ledger=ledger;this.log=log;
    ledger.db.exec(`CREATE TABLE IF NOT EXISTS channel_sessions(
      route_key TEXT PRIMARY KEY,session_id TEXT NOT NULL UNIQUE,session_created INTEGER NOT NULL,revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS session_rotations(
      receipt_id TEXT PRIMARY KEY,route_key TEXT NOT NULL,old_id TEXT NOT NULL,old_created INTEGER NOT NULL,
      old_revision INTEGER NOT NULL,new_id TEXT NOT NULL UNIQUE,deadline INTEGER NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('prepared','committed','aborted')));
      CREATE UNIQUE INDEX IF NOT EXISTS one_prepared_rotation ON session_rotations(route_key) WHERE phase='prepared';
      CREATE TABLE IF NOT EXISTS rotation_items(receipt_id TEXT,kind TEXT,item_id TEXT,detail TEXT NOT NULL,state TEXT NOT NULL,
        PRIMARY KEY(receipt_id,kind,item_id));`);
  }
  // RU: current: Возвращает текущую привязку, а не последнее попавшееся имя; потерянная durable-история не восстанавливается догадкой.
// EN: current: Resolves the current binding rather than the latest arbitrary name; missing durable history is not guessed.
current(key) {
    if(typeof key!=='string'||!key)throw Error('Пустой маршрут сессии');
    const row=this.ledger.db.prepare('SELECT * FROM channel_sessions WHERE route_key=?').get(key);
    if(row)return row;
    if(this.ledger.db.prepare('SELECT 1 FROM session_rotations WHERE route_key=?').get(key))throw Error('Привязка сессии утрачена; возврат к старому ID запрещён');
    return {route_key:key,session_id:`telegram-${key}`,session_created:null,revision:0};
  }
  // RU: holdsSession: Проверяет durable-удержание поколения незавершённой отменой.
// EN: holdsSession: Checks durable generation holds caused by unfinished cancellation.
holdsSession(sessionId) {
    return !!this.ledger.db.prepare("SELECT 1 FROM session_rotations r WHERE r.old_id=? AND (r.phase='prepared' OR (r.phase='aborted' AND EXISTS(SELECT 1 FROM rotation_items i WHERE i.receipt_id=r.receipt_id AND i.state IN ('planned','started','restored'))))").get(sessionId);
  }
  // RU: rotating: Проверяет prepared-ротацию этой session identity.
// EN: rotating: Checks prepared rotation for this session identity.
rotating(sessionId) {
    return !!this.ledger.db.prepare("SELECT 1 FROM session_rotations WHERE old_id=? AND phase='prepared'").get(sessionId);
  }
  // RU: items: Читает поимённый план действий cancellation, не выполняет его.
// EN: items: Reads the named cancellation plan without executing it.
items(receiptId) { return this.ledger.db.prepare('SELECT * FROM rotation_items WHERE receipt_id=? ORDER BY rowid').all(receiptId); }
  // RU: planItems: Сохраняет план отмены до изменения внешних объектов.
// EN: planItems: Persists cancellation plans before mutating external objects.
planItems(receiptId,items) {
    return this.ledger.tx(()=>{for(const item of items)this.ledger.db.prepare("INSERT INTO rotation_items VALUES(?,?,?,?,'planned')").run(receiptId,item.kind,item.id,JSON.stringify(item.detail??{}));});
  }
  // RU: itemState: Записывает исход конкретного пункта плана и аудит.
// EN: itemState: Persists a specific plan item's state and audit trail.
itemState(receiptId,kind,id,state) {
    this.ledger.tx(()=>{
      this.ledger.db.prepare('UPDATE rotation_items SET state=? WHERE receipt_id=? AND kind=? AND item_id=?').run(state,receiptId,kind,id);
      this.ledger.audit(receiptId,'new_'+kind+'_'+state,id);
    });
    this.log(`[/new] ${kind} id=${id}; ${state==='done'?'cancelled_by_new':state}; at=${whenText(this.ledger.now())}; command=${receiptId}`);
  }
  // RU: cancellationReport: Составляет отчёт по именам/исходам, различая unknown и подтверждённую отмену.
// EN: cancellationReport: Reports named outcomes, distinguishing uncertainty from confirmed cancellation.
cancellationReport(receiptId) {
    const rows=this.items(receiptId);
    const lines=rows.map(r=>{
      const d=JSON.parse(r.detail),result=r.state==='done'?'отменено':r.state==='started'?'исход неизвестен':r.state==='skipped'?'уже завершено':r.state==='restored'?'сохранено в старой очереди; переход остановлен':'не отменено';
      return r.kind==='schedule'?`Задание ${r.item_id}: ${d.kind}, ${d.scheduledAt}, ${JSON.stringify(d.title)} — ${result}`
        : `${r.kind==='receipt'?'Письмо':r.kind==='attachment'?'Вложение':'Сообщение inbox'} ${r.item_id} — ${result}; от ${JSON.stringify(d.sender??'не указан')}; принято ${whenText(d.receivedAt)}; первые слова: ${JSON.stringify(d.preview??'неизвестны')}`
          + (r.state==='done'&&d.returnRoute?.kind==='unknown'?`; отправитель не уведомлён: адрес неизвестен; обратная квитанция УДЕРЖАНА: ${d.returnRoute.reason}`:r.state==='done'&&d.returnRoute&&d.returnRoute.kind!=='none'?'; обратная квитанция поставлена в очередь':'')
          + (d.deliveredSchedules?.length?'\n'+d.deliveredSchedules.map(t=>`  Уже доставленное задание ${t.id}: ${t.kind}, ${t.scheduledAt}, ${JSON.stringify(t.title)}; исход сообщения inbox: ${result}`).join('\n'):'');
    });
    return (lines.length?lines.join('\n'):'Заданий, писем и вложений для отмены не было.')+
      '\nУдаление задания расписателя не отзывает уже поставленное в inbox сообщение. Очередь старой сессии отменяется отдельно. Прямое Web/API может создать новое задание старого ID после последней проверки.';
  }
  // RU: routeFor: Выводит route из закреплённого текущего/архивного поколения; несовпадение createdAt отвергается.
// EN: routeFor: Derives routing from the pinned current/archive generation and rejects creation-time mismatches.
routeFor(sessionId,createdAt) {
    if(typeof sessionId!=='string'||!Number.isSafeInteger(createdAt))throw Error('Поколение receipt неизвестно');
    const db=this.ledger.db;
    const current=db.prepare('SELECT route_key FROM channel_sessions WHERE session_id=? AND session_created=?').get(sessionId,createdAt);
    if(current)return current.route_key;
    const archived=db.prepare("SELECT route_key FROM session_rotations WHERE old_id=? AND old_created=? AND phase='committed'").get(sessionId,createdAt);
    if(archived)return archived.route_key;
    if(sessionId.startsWith('telegram-v2-'))throw Error('Маршрут нового поколения receipt неизвестен');
    if(db.prepare('SELECT 1 FROM channel_sessions WHERE session_id=?').get(sessionId))throw Error('Не совпало поколение receipt');
    return sessionId.startsWith('telegram-')?sessionId.slice('telegram-'.length):sessionId;
  }
  // RU: pin: Сравнивает ID и createdAt до записи привязки; несовпадение поколения запрещает действие.
// EN: pin: Checks ID and createdAt before persisting the binding; generation mismatch refuses the action.
pin(key,header) {
    return this.ledger.tx(()=>{
      const current=this.current(key);
      if(header?.id!==current.session_id||!Number.isSafeInteger(header.createdAt)
        || (current.session_created!==null&&current.session_created!==header.createdAt))throw Object.assign(Error('Не совпало поколение текущей сессии'),{code:'conversation_mapping_error'});
      if(current.session_created===null)this.ledger.db.prepare('INSERT INTO channel_sessions VALUES(?,?,?,0)').run(key,header.id,header.createdAt);
      return this.current(key);
    });
  }
  // RU: begin: Записывает prepared-попытку и deadline до переключения; конкурентная или занятая операция отвергается.
// EN: begin: Persists the prepared attempt/deadline before switching; concurrent or busy operations are rejected.
begin(key,receiptId,{beforeBegin}={}) {
    const l=this.ledger;
    return l.tx(()=>{
      const previous=l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receiptId);
      if(previous){
        if(previous.route_key!==key)throw Error('Маршрут перехода изменился');
        if(previous.phase==='prepared'&&l.now()>=previous.deadline)this.abortRow(previous,'истёк срок перехода');
        return l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receiptId);
      }
      beforeBegin?.();
      const current=this.current(key),receipt=l.get(receiptId);
      if(current.session_created===null)throw Error('Поколение старой сессии не проверено');
      if(!receipt||receipt.finished_at!==null||receipt.message_json!==null||receipt.dispatch_started||receipt.blocked)throw Error('Команда /new недоступна для перехода');
      const pending=l.db.prepare("SELECT * FROM session_rotations WHERE route_key=? AND phase='prepared'").get(key);
      if(pending){
        if(l.now()<pending.deadline)throw Error('Для чата уже готовится переход');
        this.abortRow(pending,'истёк срок перехода');
      }
      const next=/^(?:site-[1-9][0-9]*|gost--?[1-9][0-9]*)$/.test(key)?`telegram-${key}-v2-${randomUUID()}`:`telegram-v2-${randomUUID()}`;
      l.db.prepare("INSERT INTO session_rotations VALUES(?,?,?,?,?,?,?,'prepared')").run(receiptId,key,current.session_id,current.session_created,current.revision,next,l.now()+60000);
      l.audit(receiptId,'session_rotation_prepared',next);
      return l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receiptId);
    });
  }
  // RU: commit: Фиксирует переход одной транзакцией только при прежней revision и доказанном новом поколении.
// EN: commit: Commits the transition atomically only with the original revision and verified replacement generation.
commit(receiptId,header,{reply=true}={}) {
    const l=this.ledger;
    try { return l.tx(()=>{
      const intent=l.db.prepare('SELECT * FROM session_rotations WHERE receipt_id=?').get(receiptId);
      if(!intent||intent.phase!=='prepared')throw Error('Переход не ожидает фиксации');
      if(l.now()>=intent.deadline)throw Object.assign(Error('Истёк срок перехода /new'),{code:'rotation_expired'});
      if(header?.id!==intent.new_id||!Number.isSafeInteger(header.createdAt))throw Error('Не совпало поколение новой сессии');
      const receipt=l.get(receiptId);
      if(!receipt||receipt.finished_at!==null||receipt.blocked||receipt.dispatch_started||receipt.message_json!==null)throw Error('Команда /new изменилась до фиксации');
      const changed=l.db.prepare('UPDATE channel_sessions SET session_id=?,session_created=?,revision=revision+1 WHERE route_key=? AND session_id=? AND session_created=? AND revision=?')
        .run(header.id,header.createdAt,intent.route_key,intent.old_id,intent.old_created,intent.old_revision).changes;
      if(changed!==1)throw Error('Текущая сессия сменилась до фиксации /new');
      l.db.prepare("UPDATE session_rotations SET phase='committed' WHERE receipt_id=?").run(receiptId);
      l.completeRow({...receipt,expects_reply:reply?1:0},'session_rotated',{oldSession:intent.old_id,newSession:header.id},'Начал новый разговор. Прежняя история сохранена.\n\n'+this.cancellationReport(receiptId));
      l.audit(receiptId,'session_rotation_committed',JSON.stringify({old:intent.old_id,next:header.id}));
      return this.current(intent.route_key);
    }); } catch(error) {
      if(error.code==='rotation_expired')this.abort(receiptId,'истёк срок перехода');
      throw error;
    }
  }
  // RU: abortRow: Сохраняет aborted для prepared-попытки и удерживает неясные пункты.
// EN: abortRow: Persists aborted rotation and holds uncertain cancellation items.
abortRow(row,reason) {
    const l=this.ledger;
    l.db.prepare("UPDATE session_rotations SET phase='aborted' WHERE receipt_id=?").run(row.receipt_id);
    const receipt=l.get(row.receipt_id);
    if(receipt&&receipt.finished_at===null)l.completeRow(receipt,'session_rotation_aborted',{newSession:row.new_id},`Отказ /new: ${reason}. Текущая сессия не переключена. Отменённое не восстанавливалось.\n\n${this.cancellationReport(row.receipt_id)}`);
    l.db.prepare("UPDATE receipts SET blocked='new_cancel_unknown' WHERE id IN (SELECT item_id FROM rotation_items WHERE receipt_id=? AND kind='receipt' AND state<>'done') AND finished_at IS NULL AND blocked='new_cancel_pending'").run(row.receipt_id);
    l.audit(row.receipt_id,'session_rotation_aborted',reason);
  }
  // RU: abort: Прекращает только адресную prepared-попытку.
// EN: abort: Aborts only the targeted prepared attempt.
abort(receiptId,reason) {
    return this.ledger.tx(()=>{
      const row=this.ledger.db.prepare("SELECT * FROM session_rotations WHERE receipt_id=? AND phase='prepared'").get(receiptId);
      if(!row)return false;
      this.abortRow(row,reason);return true;
    });
  }

  // RU: abortPrepared: После рестарта прекращает незаконченные попытки; не повторяет их внешние эффекты.
// EN: abortPrepared: Aborts unfinished attempts after restart without replaying their external effects.
abortPrepared(reason) {
    const l=this.ledger;
    return l.tx(()=>{
      const rows=l.db.prepare("SELECT * FROM session_rotations WHERE phase='prepared'").all();
      for(const row of rows)this.abortRow(row,reason);
      return rows.length;
    });
  }
}
