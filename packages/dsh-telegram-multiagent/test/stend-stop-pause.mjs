// RU: Изолированный стенд stend-stop-pause.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-stop-pause.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.
import { sGostem } from './gost-kontekst.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {podnyatPlatformu02} from './platforma-02.mjs';
import {handleTelegramStop as candidateStop} from '../src/telegram-stop.js';
import vm from 'node:vm';import {extractFunction} from './extract.mjs';
import {MessageReceipts} from '../src/message-receipts.js';import {ReceiptRuntime} from '../src/receipt-runtime.js';
const handleSource=extractFunction(fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),'handleUpdate');
const results=[];
for(const [version,route,remote] of [['direct','fixture',null],['codex','gpt-fixture','interrupting'],['claude','claude-fixture','interrupting'],['codex-idle','gpt-fixture','idle'],['slow-abort','fixture',null]])for(const boundary of ['pre-step','model']){
 const stop=candidateStop;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workertwo-stop-pause-'));let p,ledger;
 try{
  p=await podnyatPlatformu02({root:path.join(root,'sessions')});
  p.ctx.on('agent/request',()=>({provider:'fixture',model:'fixture'}));
  p.ctx.on('agent/error',e=>console.error('AGENT_ERROR',e.error));
  const h=await p.agents.create({sessionId:'telegram-a2a',provider:'fixture',model:'fixture',meta:{cwd:root}}),a=h.agent;
  a.session.requestHeader=()=>({config:{provider:route==='fixture'?'fixture':'claude-oauth',model:route}});
  let entered;const gate=new Promise(r=>entered=r);let first=true;const requests=[];
  const waitAbort=async signal=>{entered();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));if(version==='slow-abort')await new Promise(r=>setTimeout(r,80));signal.throwIfAborted()};
  p.ctx.on('agent/pre-step',async(args,next)=>{if(boundary==='pre-step'&&first){first=false;await waitAbort(args.signal)}return next()});
  p.ctx.get('llm').stream=async function*(request){requests.push(JSON.parse(JSON.stringify(request.messages)));if(boundary==='model'&&first){first=false;yield {type:'text-delta',index:0,text:'PARTIAL_WORK_1462'};await waitAbort(request.signal)}yield {type:'text-delta',index:0,text:'fixture response'};yield {type:'finish',reason:{kind:'stop'}};};
  const msg=text=>p.llm.createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});
  a.send(msg('ORIGINAL_TASK_1462'),'next-turn',true);await Promise.race([gate,new Promise((_,reject)=>setTimeout(()=>reject(Error('gate timeout')),2000))]);
  const queued=msg('PENDING_MAIL_1462');a.send(queued,'next-turn',false);
  ledger=new MessageReceipts(path.join(root,'ledger'));
  const pendingReceipt=ledger.receive('pending-receipt',Buffer.from('PENDING_LETTER_BODY'),{sender:'workerthree'});
  const receiptBefore=JSON.stringify(ledger.get(pendingReceipt.id));
  const reply=await stop({text:'/stop',from:{id:7}},{allowed:new Set([7]),findAgent:()=>a,stopRemote:async()=>({state:remote}),settleMs:50});assert.equal(reply.state,version==='slow-abort'?'interrupting':'stopped','/stop must settle the outer loop even if remote is idle');await a.whenIdle();
  const pendingAfterStop=a.inbox.nextTurn.map(m=>m.id),historyAfterStop=JSON.stringify(a.session.deriveMessages());
  assert.equal(JSON.stringify(ledger.get(pendingReceipt.id)),receiptBefore,'/stop must not finish pending receipts');
  const runtime=new ReceiptRuntime(ledger,p.sessions,()=>{});runtime.install(p.ctx);
  const env={handleTelegramStop:stop,nastrojkaGruppy:()=>null,settings:()=>({}),config:{},isAllowed:()=>true,allowed:new Set([7]),MERGE_CHAT:'7',A2A_CHAT:'a2a',
    conversations:{current:()=>({session_id:a.session.id,session_created:a.session.header.createdAt})},ctx:p.ctx,chats:new Map(),tgChatFor:new Map(),lastOrigin:new Map(),
    pushAsk(){},copyAsk(){},stripMark:x=>x,platform:{createUserMessage:p.llm.createUserMessage},receiptRuntime:()=>runtime,nudgeUntilClaimed(){},oborvalsyaOshibkoj:new Map(),log(){},tg:{send:async()=>{}},
    agentFor:async()=>({handle:h,sessionId:a.session.id}),setTimeout:(fn,ms)=>setTimeout(fn,ms).unref()};
  vm.createContext(sGostem(env));vm.runInContext(handleSource,env);
  const continuation=ledger.receive('continuation',Buffer.from('продолжай, учти X_CANARY_1462'),{route:'tg',routeKey:7});
  await env.handleUpdate({message:{text:'продолжай, учти X_CANARY_1462',chat:{id:7},from:{id:7}}},continuation);await a.whenIdle();await p.sessions.flush(a.session);
  const resumed=requests.at(-1),result={version,boundary,reply:reply.state,session:a.session.id,pendingPreserved:pendingAfterStop.includes(queued.id),originalInHistory:historyAfterStop.includes('ORIGINAL_TASK_1462'),partialInHistory:historyAfterStop.includes('PARTIAL_WORK_1462'),originalInResumed:JSON.stringify(resumed??[]).includes('ORIGINAL_TASK_1462'),XInResumed:JSON.stringify(resumed??[]).includes('X_CANARY_1462')};results.push(result);console.log(JSON.stringify(result));assert(result.pendingPreserved);assert(result.originalInResumed,'claimed input must survive /stop before model admission');assert(result.XInResumed);assert.equal((JSON.stringify(resumed).match(/ORIGINAL_TASK_1462/g)??[]).length,1,'original must not duplicate');if(boundary==='model')assert(result.partialInHistory);
 }finally{for(const a of p?.agents.roots()??[])a.cancel?.({kind:'user'},{keepInbox:true});await p?.ctx.fiber.dispose();ledger?.close();fs.rmSync(root,{recursive:true,force:true})}
}
console.log('stop-pause 10/10');
