// RU: Управлять только конкретным живым request через64hex capability и точный binding. ACK accepted подтверждает передачу управления, не понимание моделью; ответ остаётся unknown.
// EN: Control only a specific live request through a64hex capability and exact binding. An accepted ACK confirms control transport, not model understanding; model response remains unknown.

import {randomUUID} from 'node:crypto';
const scope=['generation','recipient','ledger_uuid','session_id','session_created','turn'];
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const id=x=>typeof x==='string'&&x.length>0&&x.length<=256;
// RU: validBinding: Управлять только конкретным живым request через64hex capability и точный binding. ACK accepted подтверждает передачу управления, не понимание моделью; ответ остаётся unknown.
// EN: validBinding: Control only a specific live request through a64hex capability and exact binding. An accepted ACK confirms control transport, not model understanding; model response remains unknown.
function validBinding(b){return exact(b,scope)&&scope.filter(k=>!['turn','session_created'].includes(k)).every(k=>id(b[k]))&&Number.isSafeInteger(b.turn)&&b.turn>=0&&(id(b.session_created)||Number.isFinite(b.session_created));}
export class TaskControlRouter {
  constructor(){this.generation=randomUUID();this.routes=new Map();}
  // RU: Закрытие исходного HTTP ответа удаляет все его registrations; команды не переезжают на новый response.
  // EN: Closing the original HTTP response removes all its registrations; controls never migrate to a new response.
  forResponse(descriptor,response,onReady=()=>{},onTerminal=()=>{},{deferTerminal=false}={}){
    let closed=response.destroyed===true||response.writableEnded===true;const registrations=new Set(),engines=new Map(),completed=new Set();
    let pendingTerminal=null,publishedTerminal=false;const registeredEngines=new Set();
    response.once('close',()=>{closed=true;for(const close of registrations)close();registrations.clear();});
    const register=(send,engine={})=>{
      if(closed)throw Error('task-control: original HTTP request closed');
      registeredEngines.add(JSON.stringify([engine.thread_id,engine.turn_id]));
      const close=this.register(descriptor,send,engine);registrations.add(close);engines.set(close,structuredClone(engine));if(descriptor.operations?.includes('message')||descriptor.terminal===1)onReady(structuredClone(descriptor.binding),structuredClone(engine),descriptor.request_id);
      return ()=>{registrations.delete(close);engines.delete(close);close();};
    };
    register.terminal=engine=>{
      if(descriptor.terminal!==1||closed||response.destroyed||response.writableEnded||!['completed','interrupted','failed'].includes(engine?.status))return false;
      const active=[...engines.values()].some(e=>e.thread_id===engine.thread_id&&e.turn_id===engine.turn_id);
      const key=JSON.stringify([engine.thread_id,engine.turn_id]);
      if(!active||completed.has(key))return false;
      completed.add(key);
      const record=this.routes.get(descriptor.ticket);if(record)record.terminal=true;
      const frame=[structuredClone(descriptor.binding),{...structuredClone(engine),generation:this.generation},descriptor.request_id];
      if(deferTerminal)pendingTerminal=frame;else onTerminal(...frame);
      return true;
    };
    register.publishTerminal=()=>{
      if(!deferTerminal||!pendingTerminal||publishedTerminal||closed||response.destroyed||response.writableEnded||[...registeredEngines].some(key=>!completed.has(key)))return false;
      publishedTerminal=true;onTerminal(...pendingTerminal);return true;
    };
    register.closed=()=>closed;return register;
  }
  // RU: Проверить exact binding и уникальный capability до регистрации; ограничить64живыми маршрутами и только cancel/stop.
  // EN: Validate exact binding and unique capability before registration; cap at64live routes with cancel/stop only.
  register(descriptor,send,engine={}){
    if(!(exact(descriptor,['binding','ticket'])||exact(descriptor,['binding','ticket','operations'])||exact(descriptor,['binding','ticket','operations','request_id'])||exact(descriptor,['binding','ticket','operations','request_id','terminal']))||!validBinding(descriptor.binding)||!(/^[a-f0-9]{64}$/.test(descriptor.ticket))||this.routes.has(descriptor.ticket)||this.routes.size>=64)throw Error('task-control: invalid or duplicate request binding');
    const operations=descriptor.operations??['cancel'];
    if(!Array.isArray(operations)||!operations.length||operations.length>4||new Set(operations).size!==operations.length||operations.some(op=>!['cancel','stop','stop-exact','message'].includes(op)))throw Error('task-control: invalid operations');
    if(operations.includes('message')&&!id(descriptor.request_id))throw Error('inbox: request identity required');
    if(Object.hasOwn(descriptor,'terminal')&&(descriptor.terminal!==1||!operations.some(op=>['stop','stop-exact'].includes(op))||!id(descriptor.request_id)))throw Error('stop: terminal request identity required');
    if(operations.includes('stop-exact')&&descriptor.terminal!==1)throw Error('stop: exact operation needs terminal capability');
    if(descriptor.terminal===1&&!['thread_id','turn_id'].every(k=>id(engine[k])))throw Error('stop: exact engine tuple required');
    const record={engine:structuredClone(engine),request_id:descriptor.request_id,binding:structuredClone(descriptor.binding),operations,send,controls:new Map()};const ticket=descriptor.ticket;this.routes.set(ticket,record);
    return ()=>{if(this.routes.get(ticket)===record)this.routes.delete(ticket);};
  }
  // RU: Завести promise по control_id до await; тот же packet разделяет исход, изменённый replay отказывает. SDK ACK сохраняет model_response unknown.
  // EN: Store the promise under control_id before awaiting; identical packets share its result and altered replays fail. SDK ACK keeps model_response unknown.
  async dispatch(ticket,packet){
    const refused=()=>packet?.op==='message'?{accepted:false,input_state:'not-offered'}:{accepted:false};
    const r=this.routes.get(ticket);if(!r||r.terminal)return refused();
    const exactSdk=packet?.op==='message'||packet?.op==='stop-exact';
    if(!exact(packet,['binding','op','body'])||!r.operations.includes(packet.op)||typeof packet.body!=='string'||(['cancel','message'].includes(packet.op)&&!packet.body.trim())||Buffer.byteLength(packet.body)>65536||!exact(packet.binding,[...scope,'control_id',...(['cancel','message'].includes(packet.op)?['target_receipt']:[]),...(exactSdk?['request_id','sdk_thread_id','sdk_turn_id']:[])])||!id(packet.binding.control_id)||(['cancel','message'].includes(packet.op)&&!id(packet.binding.target_receipt))||(exactSdk&&(packet.binding.request_id!==r.request_id||packet.binding.sdk_thread_id!==r.engine.thread_id||packet.binding.sdk_turn_id!==r.engine.turn_id))||!scope.every(k=>packet.binding[k]===r.binding[k]))return refused();
    const key=packet.binding.control_id,raw=JSON.stringify(packet);const old=r.controls.get(key);
    if(old)return old.raw===raw?old.result:refused();
    if(r.controls.size>=256)return refused();
    const result=Promise.resolve().then(()=>this.routes.get(ticket)===r&&!r.terminal?r.send(packet):refused()).then(reply=>{
      if(this.routes.get(ticket)!==r&&!['stop','stop-exact'].includes(packet.op))throw Error('task-control: request ended');
      if(reply?.accepted===false)return {accepted:false,...(packet.op==='message'?{input_state:'not-offered'}:{})};
      if(reply?.accepted!==true||!id(reply.codex?.thread_id)||!id(reply.codex?.turn_id)||(exactSdk&&['thread_id','turn_id'].some(k=>reply.codex[k]!==r.engine[k])))throw Error('task-control: invalid app-server ACK');
      if(['stop','stop-exact'].includes(packet.op)&&reply.operation!==packet.op)throw Error('stop: wrong operation ACK');
      return {accepted:true,...(['stop','stop-exact'].includes(packet.op)?{operation:packet.op}:{}),...(packet.op==='message'?{input_state:reply.input_state??'pending'}:{}),binding:packet.binding,codex:{...reply.codex,generation:this.generation},model_response:'unknown'};
    });
    r.controls.set(key,{raw,result});return result;
  }
  // RU: Авторизовать capability до body. Читать не больше131072байт/4000мс; deadline dispatch3500мс не отменяет продолжающийся SDK action.
  // EN: Authorize the capability before body. Read at most131072bytes/4000ms; the3500ms dispatch deadline does not cancel an ongoing SDK action.
  async handle(req,res){
    const answer=(status,value)=>{if(!res.destroyed){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));}};
    if(req.method!=='POST'||req.url!=='/v1/task-control'){answer(404,{accepted:false});return;}
    const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'')?.[1];
    if(!token||!this.routes.has(token)){req.resume();answer(200,{accepted:false});return;}
    const timer=setTimeout(()=>{answer(408,{accepted:false});req.destroy();},4000);
    try{
      const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>131072){answer(413,{accepted:false});req.destroy();return;}chunks.push(part);}
      clearTimeout(timer);
      // RU: Негодный JSON — детерминированная ошибка клиента: известный отказ 400 accepted:false, а не 503 unknown (вечный HOLD) (аудит №13).
      // EN: Invalid JSON is a deterministic client error: a known refusal 400 accepted:false, not 503 unknown (endless HOLD) (audit #13).
      let packet;try{packet=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{answer(400,{accepted:false});return;}
      let timeout;
      try{const result=await Promise.race([this.dispatch(token,packet),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),3500);})]);answer(200,result);}
      finally{clearTimeout(timeout);}
    }catch{answer(503,{accepted:null,model_response:'unknown'});}
    finally{clearTimeout(timer);}
  }
}
