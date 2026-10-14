// RU: Подаёт контрольную операцию удалённому движку для конкретной session/task identity. Проверка ответа не приравнивает request accepted к завершению исполнения.
// EN: Submits remote engine control operations for a specific session/task identity. Request acceptance is distinguished from completed execution.

import {randomBytes,randomUUID} from 'node:crypto';
import {sobytiyaSessii,stableJson} from './message-receipts.js';
const keys=['generation','recipient','ledger_uuid','session_id','session_created','turn'];
// RU: current: Возвращает текущую привязку, а не последнее попавшееся имя; потерянная durable-история не восстанавливается догадкой.
// EN: current: Resolves the current binding rather than the latest arbitrary name; missing durable history is not guessed.
function current(agent){const e=sobytiyaSessii(agent.session).findLast(e=>e.type==='turn/start'||e.type==='turn/end');return agent.status==='running'&&e?.type==='turn/start'?e.data.turn:null;}
export class CodexTaskControl {
  // RU: constructor: Инициализирует состояние и схему этого компонента; не выполняет завершённую доставку автоматически.
// EN: constructor: Initializes component state/schema without claiming completed delivery.
constructor(ledger,recipient){this.ledger=ledger;this.recipient=recipient;this.requests=new Set();this.telegramStopVersion=1;this.sdkInputVersion=1;
    this.mailStopVersion=typeof ledger.db?.exec==='function'?1:0;
    if(this.mailStopVersion){ledger.db.exec(`CREATE TABLE IF NOT EXISTS mail_sdk_requests(request_id TEXT PRIMARY KEY,generation TEXT,session_id TEXT,session_created INTEGER,turn INTEGER,binding_json TEXT,state TEXT,started_at INTEGER,terminal_at INTEGER,reason TEXT)`);
      ledger.db.prepare("UPDATE mail_sdk_requests SET state='unknown',reason='process_changed' WHERE generation<>? AND state IN ('registered','ready')").run(ledger.owner);}
  }
  // RU: attach: Подключает компонент к конкретному агенту/сессии с проверкой повторного монтажа.
// EN: attach: Attaches a component to an exact agent/session with repeat-mount checks.
attach(agent,baseURL,{allowCancel=true,allowMessage=false,terminal=false}={}){
    const url=new URL(baseURL);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('task-control: loopback gateway required');
    if(!agent?.session||!this.recipient)return undefined;
    const turn=current(agent);if(turn===null)return undefined;
    if(this.requests.size>=64)throw Error('task-control: request limit 64');
    const session=agent.session;
    const binding={generation:this.ledger.owner,recipient:this.recipient,ledger_uuid:this.ledger.protocolIdentity(),session_id:session.id,session_created:session.header.createdAt,turn};
    const messageEnabled=allowMessage===true&&this.sdkInputs?.compatible(agent)===true;
    const telemetry=terminal===true&&this.mailStopVersion===1;
    const descriptor={binding,...(messageEnabled||telemetry?{request_id:randomUUID()}:{}),...(telemetry?{terminal:1}:{}),ticket:randomBytes(32).toString('hex'),operations:[...(allowCancel?['cancel']:[]),'stop',...(messageEnabled?['message']:[]),...(telemetry?['stop-exact']:[])]};
    let terminalResolve;const terminalPromise=new Promise(resolve=>{terminalResolve=resolve});
    const lifecycleId=descriptor.request_id??randomUUID();
    const lease={agent,session,descriptor,lifecycleId,url:url.origin,allowCancel,allowMessage:messageEnabled,ready:false,telemetry,terminalPromise,terminalResolve,terminalSeen:false};this.requests.add(lease);
    if(this.mailStopVersion)this.ledger.db.prepare("INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?, ?,NULL,?)").run(lifecycleId,this.ledger.owner,session.id,session.header.createdAt,turn,stableJson({...binding,request_id:lifecycleId}),telemetry?'registered':'unknown',this.ledger.now(),telemetry?null:'no_telemetry');
    return {descriptor:structuredClone(descriptor),taskEvent:async event=>{
      if(!telemetry||stableJson(event.binding)!==stableJson(binding)||event.request_id!==descriptor.request_id||!['generation','thread_id','turn_id'].every(k=>typeof event.codex?.[k]==='string'&&event.codex[k].length))throw Error('stop: invalid_terminal_binding');
      if(event.state==='ready'){
        if(lease.stopIdentity&&stableJson(lease.stopIdentity)!==stableJson(event.codex)&&(lease.terminalSeen||this.mailControls?.store.active(session.header)))throw Error('stop: invalid_terminal_ready');
        lease.stopIdentity=structuredClone(event.codex);
        this.ledger.db.prepare("UPDATE mail_sdk_requests SET state='ready',binding_json=? WHERE request_id=? AND state IN ('registered','ready')").run(stableJson({...binding,request_id:descriptor.request_id,sdk_thread_id:event.codex.thread_id,sdk_turn_id:event.codex.turn_id,sdk_generation:event.codex.generation}),descriptor.request_id);
      }else if(event.state==='terminal'){
        if(!lease.stopIdentity||!['generation','thread_id','turn_id'].every(k=>event.codex[k]===lease.stopIdentity[k])||!['completed','interrupted','failed'].includes(event.codex.status))throw Error('stop: invalid_terminal_event');
        lease.terminalSeen=true;this.ledger.db.prepare("UPDATE mail_sdk_requests SET state='terminal',terminal_at=?,reason=? WHERE request_id=?").run(this.ledger.now(),event.codex.status,descriptor.request_id);lease.terminalResolve(true);
      }else throw Error('stop: invalid_terminal_state');
    },inputEvent:async event=>{
      if(!lease.allowMessage)return;
      if(event.state==='ready'){
        if(stableJson(event.binding)!==stableJson(binding)||event.request_id!==descriptor.request_id||!['thread_id','turn_id'].every(k=>typeof event.codex?.[k]==='string'&&event.codex[k].length>0)||!this.inputAlive(lease))throw Error('inbox: invalid ready binding');lease.ready=true;lease.sdkIdentity=structuredClone(event.codex);
      }else if(event.binding?.request_id!==descriptor.request_id||!keys.every(k=>event.binding?.[k]===binding[k]))throw Error('inbox: foreign input event');
      await this.sdkInputs?.event(lease,event);
    },close:()=>{this.requests.delete(lease);if(this.mailStopVersion&&!lease.terminalSeen)this.ledger.db.prepare("UPDATE mail_sdk_requests SET state='unknown',reason='transport_closed' WHERE request_id=? AND state IN ('registered','ready')").run(lifecycleId);if(!lease.terminalSeen)lease.terminalResolve(false);this.sdkInputs?.closed(lease)}};
  }
  capture(agent){
    const found=[...this.requests].filter(r=>r.agent===agent&&!r.terminalSeen&&r.telemetry&&r.stopIdentity&&r.agent.session===r.session&&r.session.header.createdAt===r.descriptor.binding.session_created&&current(agent)===r.descriptor.binding.turn&&r.descriptor.binding.generation===this.ledger.owner);
    if(found.length!==1)return null;const r=found[0];return {...r.descriptor.binding,request_id:r.descriptor.request_id,sdk_thread_id:r.stopIdentity.thread_id,sdk_turn_id:r.stopIdentity.turn_id,sdk_generation:r.stopIdentity.generation};
  }
  async waitTerminal(binding){
    const r=[...this.requests].find(r=>r.descriptor.request_id===binding.request_id);
    if(r){const expected={...r.descriptor.binding,request_id:r.descriptor.request_id,sdk_thread_id:r.stopIdentity?.thread_id,sdk_turn_id:r.stopIdentity?.turn_id,sdk_generation:r.stopIdentity?.generation};return stableJson(expected)===stableJson(binding)&&r.descriptor.binding.generation===this.ledger.owner?r.terminalPromise:false;}
    const row=this.ledger.db.prepare('SELECT * FROM mail_sdk_requests WHERE request_id=?').get(binding.request_id);
    return row?.state==='terminal'&&row.binding_json===stableJson(binding);
  }
  absent(agent){
    const s=agent.session,id=s.id,created=s.header.createdAt,db=this.ledger.db;
    if([...this.requests].some(r=>r.session===s))return false;
    const events=sobytiyaSessii(s),start=events.findLast(e=>e.type==='turn/start'),turn=start?.data?.turn??-1;
    // B-N-1608: a row whose lease never asked for SDK terminal telemetry (adapter before mail-stop telemetry) proves nothing either way, like a
    // missing row: it stops blocking only when the native journal shows that same turn completed. Any other unresolved row still blocks.
    const zavershen=t=>{const st=events.findLast(e=>e.type==='turn/start'&&e.data?.turn===t),end=events.findLast(e=>e.type==='turn/end'&&e.data?.turn===t);return !!st&&!!end&&end.seq>st.seq&&end.data?.reason?.kind==='completed';};
    const bezTelemetrii=new Set();
    for(const r of db.prepare("SELECT request_id,generation,turn,reason FROM mail_sdk_requests WHERE session_id=? AND session_created=? AND state<>'terminal'").all(id,created)){
      if(!this.bezTelemetrii(r)||!zavershen(r.turn))return false;
      bezTelemetrii.add(r.request_id);
    }
    if(db.prepare("SELECT 1 FROM mail_sdk_requests WHERE session_id=? AND session_created=? AND turn=? AND state='terminal'").get(id,created,turn))return true;
    // B-N-1596 r2: no telemetry row for the last turn (it ran in an earlier process or before mail-stop telemetry). The adapter finishes a step
    // only after the gateway 'done', which follows the end of the gateway SDK loop: a completed turn/end of that turn proves its request ended.
    // An aborted or failed last turn proves nothing (the gateway keeps running after the client leaves) and stays unproved.
    if(db.prepare('SELECT request_id FROM mail_sdk_requests WHERE session_id=? AND session_created=? AND turn=?').all(id,created,turn).some(r=>!bezTelemetrii.has(r.request_id)))return false;
    if(!start)return true;
    const end=events.findLast(e=>e.type==='turn/end'&&e.data?.turn===turn);
    return !!end&&end.seq>start.seq&&end.data?.reason?.kind==='completed';
  }
  // RU: bezTelemetrii: Строка, чей lease не просил SDK terminal: с 2.5.91 помечена 'no_telemetry'; прежние — по истории их процесса: ни одной
  //     строки того generation с телеметрией (terminal/registered/ready, process_changed, sdk_thread_id в привязке). Текущий процесс сам помечает.
  // EN: bezTelemetrii: A row whose lease never requested SDK terminal telemetry: marked since 2.5.91; older rows judged by their process history.
  bezTelemetrii(r){
    if(r.reason==='no_telemetry')return true;
    if((r.reason!=='transport_closed'&&r.reason!==null)||r.generation===this.ledger.owner)return false;
    return !this.ledger.db.prepare("SELECT 1 FROM mail_sdk_requests WHERE generation=? AND (state<>'unknown' OR reason='process_changed' OR binding_json LIKE '%\"sdk_thread_id\"%')").get(r.generation);
  }
  async stopExact(agent,controlId,binding){
    const r=[...this.requests].find(r=>r.agent===agent&&r.telemetry&&r.descriptor.request_id===binding.request_id);
    if(!r||stableJson(this.capture(agent))!==stableJson(binding))return {state:'unknown',reason:'exact_lease_missing'};
    if(r.terminalSeen)return{state:'idle',binding,codex:r.stopIdentity};
    const packet={op:'stop-exact',body:'',binding:{...r.descriptor.binding,control_id:controlId,request_id:binding.request_id,sdk_thread_id:binding.sdk_thread_id,sdk_turn_id:binding.sdk_turn_id}};
    try{
      const response=await fetch(r.url+'/v1/task-control',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+r.descriptor.ticket},body:JSON.stringify(packet),signal:AbortSignal.timeout(4000)});
      if(!response.ok)return{state:'unknown',reason:'gateway_error'};const text=await response.text();if(Buffer.byteLength(text)>8192)return{state:'unknown',reason:'oversized_ack'};const reply=JSON.parse(text);
      if(reply.accepted!==true||reply.operation!=='stop-exact'||stableJson(reply.binding)!==stableJson(packet.binding)||!['generation','thread_id','turn_id'].every(k=>reply.codex?.[k]===r.stopIdentity[k]))return{state:'unknown',reason:'invalid_exact_ack'};
      return{state:'interrupting',binding:packet.binding,codex:reply.codex};
    }catch{return{state:'unknown',reason:'request_failed'}}
  }
  // RU: Живой ввод допускается только после SDK-ready в исходном exact lease.
  // EN: Live input is allowed only after SDK-ready on the original exact lease.
  inputAlive(r){const b=r.descriptor.binding;return !r.terminalSeen&&this.requests.has(r)&&this.ledger.owner===b.generation&&r.agent.session===r.session&&r.session.header.createdAt===b.session_created&&current(r.agent)===b.turn&&this.mailControls?.sdkAllowed(b)!==false;}
  inputLease(agent){const matches=[...this.requests].filter(r=>r.agent===agent&&r.allowMessage&&r.ready&&this.inputAlive(r));return matches.length===1?matches[0]:null;}
  async sendInput(r,packet){
    if(!this.inputAlive(r))return {accepted:false,input_state:'not-offered'};
    const response=await fetch(r.url+'/v1/task-control',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+r.descriptor.ticket},body:JSON.stringify(packet),signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Error('inbox: unknown gateway outcome');const raw=await response.text();if(Buffer.byteLength(raw)>8192)throw Error('inbox: oversized ACK');
    const reply=JSON.parse(raw);if(reply.accepted===false&&reply.input_state==='not-offered')return reply;
    if(reply.accepted!==true||!this.inputAlive(r)||stableJson(reply.binding)!==stableJson(packet.binding)||reply.model_response!=='unknown'||!['thread_id','turn_id'].every(k=>reply.codex?.[k]===packet.binding[k==='thread_id'?'sdk_thread_id':'sdk_turn_id'])||!['pending','offered'].includes(reply.input_state))throw Error('inbox: invalid ACK');return reply;
  }
  // RU: stop: Адресует остановку текущему удалённому ходу и сохраняет неизвестный исход явно.
// EN: stop: Targets the current remote turn and explicitly records uncertain outcomes.
async stop(agent,controlId){
    const turn=agent?.session?current(agent):null;if(turn===null)return {state:'idle'};
    const session=agent.session;
    const matches=[...this.requests].filter(r=>r.descriptor.binding.session_id===session.id&&r.descriptor.binding.session_created===session.header.createdAt&&r.agent.session===r.session&&current(r.agent)===turn&&r.descriptor.binding.generation===this.ledger.owner&&r.descriptor.binding.turn===turn);
    if(matches.length!==1)return {state:'unknown',reason:'no_unique_request'};
    const r=matches[0],binding={...r.descriptor.binding,control_id:controlId};
    try{
      const response=await fetch(r.url+'/v1/task-control',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+r.descriptor.ticket},body:JSON.stringify({binding,op:'stop',body:''}),signal:AbortSignal.timeout(4000)});
      if(!response.ok)return {state:'unknown',reason:'gateway_error'};
      const text=await response.text();if(Buffer.byteLength(text)>8192)return {state:'unknown',reason:'oversized_ack'};
      const reply=JSON.parse(text);

      const latest=sobytiyaSessii(session).findLast(e=>e.type==='turn/start')?.data?.turn;
      if(agent.session!==session||session.header.createdAt!==binding.session_created||this.ledger.owner!==binding.generation||latest!==turn)return {state:'unknown',reason:'binding_changed'};
      if(reply.accepted!==true||reply.operation!=='stop'||stableJson(reply.binding)!==stableJson(binding)||!['generation','thread_id','turn_id'].every(k=>typeof reply.codex?.[k]==='string'&&reply.codex[k].length>0))return {state:'unknown',reason:'invalid_ack'};
      return {state:'interrupting',binding,codex:reply.codex};
    }catch{return {state:'unknown',reason:'request_failed'};}
  }
  // RU: adapter: Возвращает доступный control-adapter, а не обещание поддержки любого движка.
// EN: adapter: Returns an available control adapter rather than promising every engine is supported.
adapter(){
    if(![...this.requests].some(r=>r.allowCancel))return undefined;
    return async packet=>{
      const matches=[...this.requests].filter(r=>r.allowCancel&&keys.every(k=>packet.binding?.[k]===r.descriptor.binding[k]));
      if(matches.length!==1)return {accepted:false};
      const r=matches[0],b=r.descriptor.binding;
      const alive=()=>this.requests.has(r)&&this.ledger.owner===b.generation&&r.agent.session===r.session&&r.session.id===b.session_id&&r.session.header.createdAt===b.session_created&&current(r.agent)===b.turn;
      if(!alive())return {accepted:false};
      const response=await fetch(r.url+'/v1/task-control',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+r.descriptor.ticket},body:JSON.stringify(packet),signal:AbortSignal.timeout(4000)});
      if(!response.ok)throw Error('task-control: gateway response unknown');
      const text=await response.text();if(Buffer.byteLength(text)>8192)throw Error('task-control: oversized reply');
      const reply=JSON.parse(text);
      if(!alive())throw Error('task-control: binding changed');
      if(reply.accepted===false)return {accepted:false};
      if(reply.accepted!==true||stableJson(reply.binding)!==stableJson(packet.binding)||reply.model_response!=='unknown'||!['generation','thread_id','turn_id'].every(k=>typeof reply.codex?.[k]==='string'&&reply.codex[k].length>0))throw Error('task-control: invalid gateway ACK');
      return reply;
    };
  }
}
