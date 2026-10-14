// RU: Связывает ledger с реальными сессиями DSH: enqueue, flush, observe, wake и hooks отмены. Один DSH message ID — одна доказанная постановка; неизвестное исполнение удерживается.
// EN: Connects the ledger to native DSH sessions through enqueue, flush, observe, wake, and cancellation hooks. Each DSH message ID has one evidenced dispatch; uncertain execution is held.
import {queuePauseNotice} from './pause-notice.js';
export {CodexTaskControl} from './codex-task-control.js';
import {acceptTaskControl} from './task-control.js';
import {WakeGate} from './wake-gate.js';
import {receiptFacts, sobytiyaSessii, nasledovanoSessii} from './message-receipts.js';

export class ReceiptRuntime {
  // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(ledger, sessions, log = console.log, hookOwner) { this.hookOwner=hookOwner;this.installedContexts=new WeakSet();this.log=log;this.ledger=ledger;this.sessions=sessions;this.wakeGate=new WakeGate(ledger); }
  // RU: acceptTaskControl: Обрабатывает адресный control-конверт только после проверки identity и полномочия.
// EN: acceptTaskControl: Handles targeted control only after identity and authority validation.
acceptTaskControl(id, envelope, receiver, agent, options) {
    return acceptTaskControl(this,id,envelope,receiver,agent,options);
  }
  // RU: holdCancellation: Удерживает неопределённую отмену с сохранённым планом и читателем.
// EN: holdCancellation: Holds uncertain cancellation with its saved plan and review owner.
holdCancellation(id, reason, phase = null) {
    const l=this.ledger;
    l.tx(()=>{
      l.db.prepare('UPDATE protocol_envelopes SET reason=?,cancel_phase=? WHERE receipt_id=?').run(reason,phase,id);
      const target=l.db.prepare('SELECT target_decision,target_recipient FROM protocol_envelopes WHERE receipt_id=?').get(id);
      l.addOutbox(id+':cancel:'+reason,id,'a2a',`УДЕРЖАНО ${id}, цель ${target.target_recipient}/${target.target_decision}: ${reason}. Отмена не подтверждена, новое распоряжение не исполняется; нужен разбор координатора.`);
      l.audit(id,'cancellation_held',reason);
    });
    this.log(`[supersedes] held receipt=${id} reason=${reason}`);
    return {action:'held',reason};
  }
  // RU: lateCancellation: Сопоставляет поздний контроль с уже наблюдённым claim/концом хода.
// EN: lateCancellation: Reconciles late control with observed claim/turn completion.
lateCancellation(id, a) {
    const l=this.ledger;
    l.tx(()=>{
      const b=l.get(id);l.protocolExit(b,'rejected','target_finished');
      l.db.prepare('UPDATE protocol_envelopes SET cancel_phase=NULL WHERE receipt_id=?').run(id);
      l.completeRow({...b,expects_reply:1},'supersedes_too_late',{target:a.id},`ПОЗДНО: A ${a.id} завершено; совершённые действия не отменены. B ${id} не исполнено.`);
    });
    return {action:'terminal'};
  }
  // RU: cancelPending: Отменяет только доказанно pending ввод по адресной идентичности; unknown outcome удерживается.
// EN: cancelPending: Cancels only evidenced pending input by exact identity and holds uncertain outcomes.
async cancelPending(id, agent) {
    const l=this.ledger;
    let e=l.db.prepare('SELECT * FROM protocol_envelopes WHERE receipt_id=?').get(id);
    let b=l.get(id);
    if(!e || !b) throw Error('Конверт отмены отсутствует');
    if(b.finished_at!==null)return {action:'terminal'};
    if(e.state==='released_text')return {action:'text',text:e.body_text};
    if(e.state!=='held' || !['cancellation_not_enabled_K1','awaiting_cancellation'].includes(e.reason))return {action:'held',reason:e.reason};
    if(e.cancel_phase)return this.holdCancellation(id,'cancellation_unknown','unknown');
    if(l.now()>=e.deadline_at){l.holdTick();return {action:'terminal'};}
    const target=l.db.prepare('SELECT receipt_id FROM decision_index WHERE recipient=? AND decision_id=?').get(e.target_recipient,e.target_decision);


    if(!target) {
      const why=e.target_decision===null ? 'no_target_released' : 'target_absent_released';
      l.tx(()=>{
        const bf=l.get(id);
        if(bf.finished_at!==null) throw Error('Решение уже имеет исход');
        l.protocolExit(bf,'released_text',why);
        l.db.prepare('UPDATE protocol_envelopes SET reason=?,cancel_phase=NULL WHERE receipt_id=?').run(why,id);
        l.audit(id,'decision_released',why);
      });
      this.log(`[a2a-envelope] released receipt=${id} reason=${why} target=${e.target_decision??'—'}`);
      return {action:'text',text:e.body_text};
    }
    if(target.receipt_id===id)return this.holdCancellation(id,'self_reference');
    let a=l.get(target.receipt_id);const session=agent?.session;

    // B-N-1662: a received voice-held target has never acquired a platform message or dispatch intent.
    // Cancel that exact ledger target atomically; queued/unknown targets retain the native proof path below.
    if(a && session && this.voiceOrder && a.route==='a2a' && a.session_id===null && a.message_json===null
      && !a.dispatch_started && a.claimed_turn===null && !a.blocked && a.finished_at===null
      && e.target_ledger===l.protocolIdentity() && e.target_recipient===e.recipient
      && l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='voice_order_held'").get(a.id)) {
      l.tx(()=>{
        const af=l.get(a.id),bf=l.get(id),ef=l.db.prepare('SELECT * FROM protocol_envelopes WHERE receipt_id=?').get(id);
        if(af.finished_at!==null || af.blocked || af.session_id!==null || af.message_json!==null || af.dispatch_started || af.claimed_turn!==null
          || bf.finished_at!==null || ef.state!=='held' || ef.cancel_phase || l.now()>=ef.deadline_at)throw Error('Voice-held cancellation state changed');
        l.completeRow(af,'canceled_before_run',{superseded_by:id,before_prepare:true},`A ${a.id} снято до подачи по B ${id}.`);
        l.protocolExit(bf,'released_text','target_canceled');
        l.db.prepare("UPDATE protocol_envelopes SET reason='target_canceled',cancel_phase=NULL WHERE receipt_id=?").run(id);
        l.audit(id,'cancellation_committed',a.id);
        l.addOutbox(id+':cancel-committed',id,'a2a',`A ${a.id} снято до подачи; B ${id} разрешено, но ещё не исполнено.`);
      });
      return {action:'text',text:e.body_text};
    }

    if(!a || !session || a.session_id!==session.id || a.session_created!==session.header.createdAt)
      return this.holdCancellation(id,'target_session_mismatch');
    if(e.target_ledger!==l.protocolIdentity() || e.target_recipient!==e.recipient)
      return this.holdCancellation(id,'target_scope_mismatch');
    if(!a.dsh_id || typeof agent.inbox?.remove!=='function')return this.holdCancellation(id,'target_not_addressable');
    try { await this.observe(session); }
    catch { return this.holdCancellation(id,'target_observation_failed'); }
    a=l.get(a.id);b=l.get(id);
    if(a.finished_at!==null) {
      if(a.outcome==='canceled_before_run')return this.holdCancellation(id,'target_already_canceled');
      if(a.outcome!=='turn_completed')return this.holdCancellation(id,'target_outcome_unknown');
      return this.lateCancellation(id,a);
    }
    const before=receiptFacts(session,[a.dsh_id]).get(a.dsh_id);
    if(before?.claims.length || a.claimed_turn!==null)return this.holdCancellation(id,a.blocked==='interrupted_unknown'?'target_outcome_unknown':'target_running');
    if(a.blocked)return this.holdCancellation(id,'target_blocked');


    l.tx(()=>{
      const fresh=l.get(a.id);const be=l.get(id);
      if(fresh.blocked || fresh.finished_at!==null || be.finished_at!==null || l.now()>=e.deadline_at)throw Error('Состояние отмены изменилось');
      l.db.prepare("UPDATE receipts SET blocked='cancel_pending' WHERE id=?").run(a.id);
      l.db.prepare(`UPDATE protocol_envelopes SET cancel_phase='intent',target_receipt=?,target_dsh_id=?,target_session_id=?,target_session_created=?,cancel_requested_at=? WHERE receipt_id=?`)
        .run(a.id,a.dsh_id,session.id,session.header.createdAt,l.now(),id);
      l.audit(id,'cancellation_intent',a.id);
    });
    let removed;
    try { removed=agent.inbox.remove(a.dsh_id); }
    catch { return this.holdCancellation(id,'cancellation_unknown','unknown'); }
    if(!removed) {
      l.tx(()=>l.db.prepare("UPDATE receipts SET blocked=NULL WHERE id=? AND blocked='cancel_pending'").run(a.id));
      try { await this.observe(session); } catch { return this.holdCancellation(id,'cancellation_unknown','unknown'); }
      a=l.get(a.id);
      if(a.outcome==='turn_completed')return this.lateCancellation(id,a);

      if(a.finished_at!==null || a.blocked==='interrupted_unknown')return this.holdCancellation(id,'target_outcome_unknown');
      return this.holdCancellation(id,a.claimed_turn!==null?'target_running':'cancellation_unknown',a.claimed_turn===null?'unknown':null);
    }
    try {
      l.tx(()=>l.db.prepare("UPDATE protocol_envelopes SET cancel_phase='removed' WHERE receipt_id=?").run(id));
    if(await this.sessions.flush(session)!==true)throw Error('Flush not confirmed');
      const facts=receiptFacts(session,[a.dsh_id]).get(a.dsh_id);
      if(!facts?.canceled || facts.claims.length)throw Error('Cancellation not established');
      l.tx(()=>{
        const af=l.get(a.id),bf=l.get(id);
        if(af.finished_at!==null || af.blocked!=='cancel_pending' || bf.finished_at!==null)throw Error('Cancellation state changed');
        l.db.prepare('UPDATE receipts SET blocked=NULL WHERE id=?').run(a.id);
        l.completeRow(af,'canceled_before_run',{superseded_by:id},`A ${a.id} снято до исполнения по B ${id}.`);


        l.protocolExit(bf,'released_text','target_canceled');
        l.db.prepare("UPDATE protocol_envelopes SET reason='target_canceled',cancel_phase=NULL,cancel_flushed_at=? WHERE receipt_id=?").run(l.now(),id);
        l.audit(id,'cancellation_committed',a.id);
        l.addOutbox(id+':cancel-committed',id,'a2a',`A ${a.id} снято до исполнения; B ${id} разрешено, но ещё не исполнено.`);
      });
      this.log(`[supersedes] canceled target=${a.id} replacement=${id}`);
      return {action:'text',text:e.body_text};
    } catch { return this.holdCancellation(id,'cancellation_unknown','unknown'); }
  }
  // RU: wake: Вызывает единственные допустимые wake-ворота по конкретной квитанции.
// EN: wake: Invokes the permitted wake gate for an exact receipt.
async wake(agent,id) {
    await this.observe(agent.session);
    if(this.conversationSessions?.holdsSession(agent.session.id))throw Error('Сессия удержана отменой /new');
    const pause=this.conversationPause?.state(agent.session.header);
    if(pause&&(pause.state==='paused'||this.ledger.get(id)?.dsh_id!==pause.owner_id))return false;
    return this.wakeGate.request(agent,id);
  }
  // RU: contains: Ищет конкретный message ID, а не похожий текст, в наблюдаемой сессии.
// EN: contains: Looks for an exact message identity rather than similar text in the observed session.
contains(session,id) {
    return sobytiyaSessii(session).slice(nasledovanoSessii(session)).some(e=>e.type==='agent/inbox/spliced' && e.data.inserted?.some(m=>m.id===id));
  }
  // RU: observe: Сверяет ledger с реальными событиями сессии; missing event не считается completed.
// EN: observe: Reconciles ledger state with real session events; missing events do not imply completion.
async observe(session,turn=null,recovering=false) {
    if(this.conversationSessions?.holdsSession(session.id))throw Error('Сессия удержана отменой /new');
    if(recovering) {
      for(const e of this.ledger.db.prepare("SELECT receipt_id FROM protocol_envelopes WHERE target_session_id=? AND cancel_phase IS NOT NULL").all(session.id))
        this.holdCancellation(e.receipt_id,'cancellation_unknown','unknown');
    }
    if(await this.sessions.flush(session)!==true) throw Error('Receipt barrier: persistence did not confirm flush');
    if(this.conversationSessions?.holdsSession(session.id))throw Error('Сессия удержана отменой /new');
    const claimed = this.ledger.reconcile(session,turn,recovering);

    for (const fact of claimed) {
      this.log(`[receipt] entered_turn ${JSON.stringify({ ...fact, observed_at: this.ledger.now() })}`);
    }
  }
  // RU: install: Подключает scoped hooks/регистрацию с проверкой повторного подключения и владения.
// EN: install: Attaches scoped hooks/registrations with repeat-installation and ownership checks.
install(agentCtx) {
    const identity=agentCtx.fiber ?? agentCtx;
    if(this.installedContexts.has(identity))return;
    const remove = agentCtx.on('agent/pre-step',async ({agent,turn},next)=>{
      await this.observe(agent.session,turn);
      if(this.conversationSessions?.holdsSession(agent.session.id))throw Error('Сессия удержана отменой /new');
      const targets=this.ledger.db.prepare("SELECT dsh_id FROM receipts WHERE session_id=? AND blocked='cancel_pending'").all(agent.session.id);
      const facts=receiptFacts(agent.session,targets.map(r=>r.dsh_id));
      if([...facts.values()].some(f=>f.claims.some(c=>c.turn===turn)))throw Error('Отмена не подтверждена: исполнение цели удержано');
      return next();
    });
    if (this.hookOwner) {
      try { this.hookOwner.effect(() => () => { remove(); this.installedContexts.delete(identity); }); }
      catch (error) { remove(); throw error; }
    }
    this.installedContexts.add(identity);
  }
  // RU: enqueue: Сначала prepare/queue/flush, затем wake; owner-resume и source release имеют отдельные условия.
// EN: enqueue: Performs prepare/queue/flush before wake; owner resume and source release have independent conditions.
async enqueue(receipt,agent,makeMessage,routeKey,sourceKey=null,{ownerResume=false}={}) {
    const l=this.ledger;
    // B-N-1662: hold only later ordinary mail in the merged conversation, before send/flush/release/wake.
    const order=this.voiceOrder;
    if(order && receipt.route==='a2a' && String(routeKey)===order.routeKey && !l.get(receipt.id).dispatch_started) {
      const voices=l.db.prepare(`SELECT id,received_at,raw,session_id FROM receipts
        WHERE route='tg' AND route_key=? AND flushed_at IS NULL AND finished_at IS NULL
          AND (received_at<? OR (received_at=? AND rowid<(SELECT rowid FROM receipts WHERE id=?)))
        ORDER BY received_at,rowid`).all(order.chatId,receipt.received_at,receipt.received_at,receipt.id);
      for(const voice of voices) {
        let msg;try {msg=JSON.parse(Buffer.from(voice.raw).toString('utf8')).message;}catch {continue;}
        if(!msg || !(msg.voice||msg.audio) || String(msg.chat?.id)!==order.chatId || !order.isAllowed(msg.from?.id))continue;
        if(voice.session_id!==null && voice.session_id!==agent.session.id)continue;
        const expired=l.now()>=voice.received_at+order.waitMs;
        const kind=expired?'voice_order_expired':'voice_order_held';
        if(!l.db.prepare('SELECT 1 FROM audit WHERE receipt_id=? AND kind=? AND detail=?').get(receipt.id,kind,voice.id)) {
          l.audit(receipt.id,kind,voice.id);
          this.log(`[voice-order] ${kind}: mail=${receipt.id} voice=${voice.id} route=${order.routeKey}; limit=${order.waitMs} ms; ${expired?'предел исчерпан, удержание снято; порядок после срока не гарантируется':'ждёт подачи более раннего голоса'}`);
        }
        if(!expired)return false;
      }
    }

    l.prepare(receipt.id,makeMessage,agent.session,routeKey);
    await l.queue(receipt.id,{
      contains:id=>this.contains(agent.session,id),
      send:message=>{if(this.conversationSessions?.holdsSession(agent.session.id))throw Error('Сессия удержана отменой /new');return agent.send(message,'next-turn',false);},
      flush:()=>this.sessions.flush(agent.session),
    });
    if(sourceKey) l.release(receipt.id,sourceKey);
    queuePauseNotice(l,l.get(receipt.id),this.conversationPause?.status(agent.session.id),this.returnPaths);
    if(ownerResume&&this.conversationPause)this.conversationPause.resumeOwner(agent,receipt.id,l.get(receipt.id).dsh_id);
    this.sdkInputs?.schedule(agent,receipt.id);
    await this.wake(agent,receipt.id);
    return true;
  }
}
