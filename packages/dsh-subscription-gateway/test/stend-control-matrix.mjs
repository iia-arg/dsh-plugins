// RU: Проверка stend-control-matrix: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-control-matrix verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.


import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {progonAppServer} from '../codex-app-server.mjs';
const cases=[["fixture-chat-a","fixture-case-1","file"],["fixture-chat-a","fixture-case-2","counter"],["fixture-code-a","fixture-case-3","queue"],["fixture-code-a","fixture-case-4","queue"],["fixture-chat-b","fixture-case-5","ipv6"],["fixture-chat-b","fixture-case-6","file"],["fixture-chat-b","fixture-case-7","file"],["fixture-chat-b","fixture-case-8","queue"],["fixture-chat-b","fixture-case-9","queue"],["fixture-chat-c","fixture-case-10","remove"],["fixture-chat-c","fixture-case-11","file"],["fixture-chat-c","fixture-case-12","file"],["fixture-chat-c","fixture-case-13","file"],["fixture-chat-c","fixture-case-14","mode-restart"],["fixture-chat-c","fixture-case-15","file"],["fixture-chat-c","fixture-case-16","file"],["fixture-chat-d","fixture-case-17","queue"]];
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-matrix-'));const rows=[];
try{
 for(const [agent,pair,kind] of cases)for(const phase of ['before','during','after'])for(let repeat=1;repeat<=3;repeat++){
  const key=agent+'-'+pair+'-'+phase+'-'+repeat;const dir=path.join(root,key);fs.mkdirSync(dir);for(const f of ['one','two','three'])fs.writeFileSync(path.join(dir,f),'initial');const trace=[];let notify,handle,ready,dead;const begun=new Promise(r=>ready=r);const died=new Promise(r=>dead=r);
  const client={slushat:f=>notify=f,umer:died,uvedomit(){},async zakryt(){dead({code:0});},async zapros(method,params){if(method==='thread/start')return {thread:{id:'thread-'+key}};if(method==='turn/start')return {turn:{id:'turn-'+key}};if(method==='turn/steer'){trace.push('B');assert.equal(params.expectedTurnId,'turn-'+key);assert.ok(params.input[0].text.includes(key));return {turnId:'turn-'+key};}return {};}};
  const events=[];const run=(async()=>{for await(const e of progonAppServer({klientImpl:()=>client,log(){},zapros:'fixture',registerTaskControl:f=>{handle=f;ready();return ()=>{};}}))events.push(e);})();await begun;
  const send=async()=>{const r=await handle({op:'cancel',binding:{control_id:key,target_receipt:'A-'+pair},body:'Отмена '+key});assert.equal(r.accepted,true);assert.equal(r.model_response,'unknown');};
  const start=()=>{trace.push('start');notify('item/started',{threadId:'thread-'+key,turnId:'turn-'+key,item:{id:'tool',type:'commandExecution'}});};
  const effect=()=>{if(kind==='remove'){for(const f of ['one','two','three'])fs.unlinkSync(path.join(dir,f));}else fs.writeFileSync(path.join(dir,'effect'),JSON.stringify({kind,pair,value:kind==='counter'?1:kind==='mode-restart'?{mode:'750',restart:true}:kind==='ipv6'?'disable_ipv6=1':kind==='queue'?{id:'A-'+pair,revision:1}:'candidate'}));trace.push('effect');};
  const finish=()=>{trace.push('end');notify('item/completed',{threadId:'thread-'+key,turnId:'turn-'+key,item:{id:'tool',type:'commandExecution'}});};
  if(phase==='before')await send();start();if(phase==='during')await send();effect();finish();if(phase==='after')await send();
  assert.deepEqual(trace,phase==='before'?['B','start','effect','end']:phase==='during'?['start','B','effect','end']:['start','effect','end','B']);
  notify('turn/completed',{threadId:'thread-'+key,turn:{id:'turn-'+key,status:'completed'}});await run;assert.equal(events.at(-1).ostanovlenShlyuzom,false);
  const state=kind==='remove'?fs.readdirSync(dir):fs.readFileSync(path.join(dir,'effect'),'utf8');if(kind==='remove')assert.deepEqual(state,[]);else assert.ok(state.includes(pair));
  rows.push({agent,pair,kind,phase,repeat,trace,effect_sha256:createHash('sha256').update(JSON.stringify(state)).digest('hex'),adapter:'accepted',model_response:'unknown'});
 }
 assert.equal(rows.length,153);console.log(JSON.stringify({scope:'Codex transport only; model ACK/dispatch barrier NOT tested',rows},null,2));
}finally{fs.rmSync(root,{recursive:true,force:true});}
