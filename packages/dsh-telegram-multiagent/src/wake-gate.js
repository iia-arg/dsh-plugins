// RU: Единственная автоматическая побудка пакета с durable-бюджетом3 на неизменную ошибку. Проверяет конкретное pending сообщение и поколение до wakeDriver; после исчерпания не будит вслепую. Внешние ручные wake не контролирует.
// EN: The package's automatic wake gate keeps a durable budget of3 for an unchanged refusal. Checks the exact pending message and generation before wakeDriver and stops blind wakeups when exhausted. Does not govern external manual wakeups.
import crypto from 'node:crypto';
import {receiptFacts, sobytiyaSessii, nasledovanoSessii} from './message-receipts.js';

// RU: wakeNative: Вызывает native wakeDriver только после проверок вышестоящих ворот.
// EN: wakeNative: Calls native wakeDriver only after caller-side gate checks.
function wakeNative(agent) { agent.wakeDriver(); }


export const MAX_WAKE_ATTEMPTS = 3;

export class WakeGate {
  // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(ledger,{log=()=>{}}={}) {
    this.ledger=ledger;this.log=log;
  }

  // RU: resumeAfterOwner: Одна побудка по durable owner-release intent, без нового бюджета повторов.
// EN: resumeAfterOwner: One wake follows durable owner-release intent without a new retry budget.
resumeAfterOwner(agent,stillAllowed) {
    if(agent.status==='running'||stillAllowed()!==true)return false;
    wakeNative(agent);return true;
  }
  // RU: refusal: Читает реальный последний отказ хода и формирует его стабильную подпись.
// EN: refusal: Reads the last evidenced turn refusal and derives its stable signature.
refusal(session) {

    const end=sobytiyaSessii(session).findLast(e=>e.type==='turn/end');
    const reason=end?.data?.reason;
    return reason?.kind==='error'
      ? JSON.stringify({kind:reason.kind,code:reason.error?.code??null,message:reason.error?.message??'без описания'})
      : 'нет зарегистрированного отказа';
  }
  // RU: request: Запрашивает ограниченную операцию компонента с проверкой состояния/бюджета.
// EN: request: Requests a bounded component operation under state/budget checks.
request(agent,id) {
    const l=this.ledger,session=agent?.session;
    if(!session || agent.status==='running' || typeof agent.wakeDriver!=='function')return false;
    const r=l.get(id);


    if(l.db.prepare("SELECT receipt_id FROM protocol_envelopes WHERE (target_receipt=? OR receipt_id=?) AND cancel_phase IS NOT NULL LIMIT 1").get(id,id))return false;
    if(!r || r.blocked || r.finished_at!==null || r.claimed_turn!==null || !r.dispatch_started || r.flushed_at===null)return false;
    if(r.session_id!==session.id || r.session_created!==session.header.createdAt)return false;
    const facts=receiptFacts(session,[r.dsh_id]).get(r.dsh_id);
    if(!facts || facts.claims.length || facts.canceled)return false;

    const q=new Map();
    for(const e of sobytiyaSessii(session).slice(nasledovanoSessii(session))) {
      const d=e.data??{};
      if(e.type==='agent/inbox/spliced') {const a=q.get(d.target)??[];a.splice(d.start,d.removedCount??0,...(d.inserted??[]));q.set(d.target,a);}

    }
    if(![...q.values()].some(a=>a.some(m=>m.id===r.dsh_id)))return false;
    const signature=crypto.createHash('sha256').update(this.refusal(session)).digest('hex');
    const key='wake:'+r.id;let stopped=false;
    const allowed=l.tx(()=>{
      const raw=l.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
      let state=raw?JSON.parse(raw.value):null;
      if(state && (!Number.isSafeInteger(state.count)||state.count<0||typeof state.signature!=='string'))throw Error('Некорректное состояние побудок');
      if(!state || state.signature!==signature)state={signature,count:0,alerted:false,episode:(state?.episode??0)+1};
      if(state.count>=MAX_WAKE_ATTEMPTS) {
        if(!state.alerted) {
          const body=`СТОП ПОБУДОК: receipt ${r.id}, session ${session.id}, попыток ${state.count}; отказ ${this.refusal(session)}. Главная: проверь удержанную очередь; автоповтор исполнения запрещён.`;
          l.addOutbox('wake-stop:'+r.id+':'+state.episode,r.id,'a2a',body);
          state.alerted=true;stopped=true;
        }
      } else state.count++;
      l.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(key,JSON.stringify(state));
      return state.count<=MAX_WAKE_ATTEMPTS && !state.alerted;
    });
    if(stopped)this.log(`[wake] СТОП: receipt ${r.id}; ${MAX_WAKE_ATTEMPTS} побудки, тревога поставлена Главной`);
    if(!allowed)return false;

    wakeNative(agent);
    return true;
  }
}
