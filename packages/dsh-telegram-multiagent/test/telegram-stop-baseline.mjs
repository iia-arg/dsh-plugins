// RU: Прерывает текущий ход разрешённого человека, сохраняя claimed контекст и следующую очередь. Native и удалённый движок имеют разные механизмы stop; подтверждение окончания требует отдельного наблюдения.
// EN: Interrupts an authorized human caller's current turn while preserving claimed context and the next inbox. Native and remote engines use different stop paths; termination needs separate evidence.

import {sobytiyaSessii,receiptFacts} from '../src/message-receipts.js';


export // RU: preserveClaimedInput: Сохраняет уже подхваченный pre-step ввод как контекст после отмены, не исполняет его снова.
// EN: preserveClaimedInput: Retains already claimed pre-step input as context after cancellation rather than executing it again.
function preserveClaimedInput(session,turn) {
 const events=sobytiyaSessii(session),messages=new Map(),admitted=new Set();
 for(const e of events){
  if(e.type==='agent/inbox/spliced')for(const m of e.data?.inserted??[])messages.set(m.id,m);
  if(e.type==='user/message')admitted.add(e.data?.id);
 }
 const facts=receiptFacts(session,[...messages.keys()]);
 for(const [id,fact] of facts)if(!admitted.has(id)&&fact.claims.some(c=>c.turn===turn)){
  const message=messages.get(id);
  session.append('user/message',message,{surfaceOp:'append'});
 }
}


// RU: cancelKeepingContext: Прерывает native ход, сохраняя claimed ввод как контекст без повторного исполнения.
// EN: cancelKeepingContext: Cancels a native turn while retaining claimed input as context without replay.
function cancelKeepingContext(agent,session,turn) {
 let failure,remove;
 if(typeof agent.ctx?.on==='function')remove=agent.ctx.on('session/event',(current,event)=>{
  if(current!==session||event.type!=='turn/end'||event.data?.turn!==turn)return;
  remove();

  queueMicrotask(()=>{try{preserveClaimedInput(session,turn);}catch(error){failure=error;console.error(`/stop: не сохранён контекст ${session.id}, ход ${turn}`);}});
 });
 try{agent.cancel({kind:'user'},{keepInbox:true});}catch(error){remove?.();throw error;}
 return ()=>{if(failure)throw failure;};
}
export // RU: runningTurn: Находит текущий turn/start без соответствующего turn/end.
// EN: runningTurn: Finds a current turn/start lacking its matching turn/end.
function runningTurn(agent){
 if(!agent?.session||agent.status!=='running')return null;
 const e=sobytiyaSessii(agent.session).findLast(e=>e.type==='turn/start'||e.type==='turn/end');
 return e?.type==='turn/start'?e.data?.turn??null:null;
}
export // RU: handleTelegramStop: Прерывает текущий ход разрешённого человека, сохраняя claimed контекст и следующую очередь. Native и удалённый движок имеют разные механизмы stop; подтверждение окончания требует отдельного наблюдения.
// EN: handleTelegramStop: Interrupts an authorized human caller's current turn while preserving claimed context and the next inbox. Native and remote engines use different stop paths; termination needs separate evidence.
async function handleTelegramStop(message,{allowed,findAgent,stopRemote,settleMs=0,pause}={}){
 if(typeof message?.text!=='string'||!/^\s*\/stop\b/i.test(message.text))return null;
 const tail=message.text.trim().replace(/^\/stop(@\S+)?/i,'').trim()!=='';
 let evidence={};const result=(state,text)=>({state,text,...evidence});
 if(message.from?.is_bot||!Number.isSafeInteger(message.from?.id)||!allowed?.has(message.from.id))return result('denied','Нет разрешения на /stop: нужен человек из allowedUsers.');
 try{
  const agent=findAgent(),session=agent?.session,turn=runningTurn(agent);
  if(pause)await pause(agent);
  if(turn===null&&pause)return result('idle','⏸ Пауза включена; текущего хода нет. Обычное сообщение владельца продолжит работу; /new начнёт новый разговор.');
  if(turn===null)return result('idle','⏹ /stop: сейчас нечего прерывать — хода нет.'+(tail?' Адресация по номеру ещё не поддержана.':''));
  evidence={target:{session_id:session.id,session_created:session.header.createdAt,turn}};
  const settle=async()=>{
   if(!Number.isSafeInteger(settleMs)||settleMs<=0||typeof agent.whenIdle!=='function')return false;
   let timer;try{await Promise.race([agent.whenIdle(),new Promise(resolve=>{timer=setTimeout(resolve,settleMs)})]);}
   finally{clearTimeout(timer)}
   return agent.session===session&&agent.status==='idle';
  };
  const header=session.requestHeader?.();


  const route=header?.config??(header===undefined&&typeof session.snapshotEvents==='function'?{provider:'pre-admission'}:undefined);
  if(!route?.provider)return result('unknown','Не удалось определить путь текущего хода; прерывание не подтверждено.');
  let checkPreserved=()=>{};
  if(route.provider==='claude-oauth'){


   if(!route.model?.startsWith('gpt-')&&!route.model?.startsWith('claude-'))return result('unsupported','/stop: неизвестный путь шлюза; прерывание не выполнено.');
   const reply=await stopRemote(agent);
   if(!['idle','interrupting'].includes(reply?.state))return result('unknown','/stop: прерывание текущего хода не подтверждено; автоматического повтора нет.');
   evidence={...evidence,binding:reply.binding,codex:reply.codex};
   if(agent.session!==session || (runningTurn(agent)!==null&&runningTurn(agent)!==turn))return result('unknown','/stop: ход сменился; новый ход не тронут.');

   if(runningTurn(agent)===turn)checkPreserved=cancelKeepingContext(agent,session,turn);
  }else{
   if(typeof agent.cancel!=='function')return result('unsupported','/stop: управление текущим агентом недоступно.');
   checkPreserved=cancelKeepingContext(agent,session,turn);
  }
  if(await settle()){checkPreserved();preserveClaimedInput(session,turn);return result('stopped','⏹ /stop: ход платформы завершён; очередь и контекст сохранены. Напиши уточнения и «продолжай», либо /new для чистого листа.'+(tail?' Адресация по номеру ещё не поддержана.':''));}
  return result('interrupting','⏹ /stop: текущий ход прерывается.'+(tail?' Адресация по номеру ещё не поддержана — прерван текущий ход.':'')+' Окончание исполнения не подтверждено.');
 }catch{return result('unknown','/stop: исход прерывания неизвестен; автоматического повтора нет.');}
}
