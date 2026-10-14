// RU: Проверка stend-task-control: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-task-control verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.

import assert from 'node:assert/strict';
import {progonAppServer} from '../codex-app-server.mjs';
const binding={generation:'platform-1',recipient:'beta',ledger_uuid:'ledger-1',session_id:'session-1',session_created:123,turn:7};
const packet=()=>({binding:{...binding,control_id:'B',target_receipt:'A'},op:'cancel',body:'Отменить A'});
const pause=()=>new Promise(r=>setImmediate(r));
async function fixture({ack='ok',pressure=false}={}){
 let notify,handler,closed=0; const calls=[],logs=[];let end;
 const died=new Promise(r=>end=r);
 const client={slushat:f=>notify=f,umer:died,uvedomit(){},async zakryt(){closed++;end({code:0});},async zapros(method,params){calls.push({method,params});if(method==='thread/start')return {thread:{id:'thread-1'}};if(method==='turn/start')return {turn:{id:'codex-turn-9'}};if(method==='turn/steer'){if(ack==='error')throw Error('refused');if(ack==='wrong')return {turnId:'other'};if(ack==='missing')return {};if(ack==='end')notify('turn/completed',{threadId:'thread-1',turn:{id:'codex-turn-9',status:'completed'}});return {turnId:'codex-turn-9'};}return {};}};
 const events=[];const run=(async()=>{for await(const e of progonAppServer({klientImpl:()=>client,log:s=>logs.push(s),zapros:'A',porog:pressure?{porog:10}:{},tekstSignala:'PRESSURE',registerTaskControl:fn=>{handler=fn;return ()=>{handler=null;};}}))events.push(e);})();
 for(let i=0;i<10&&!handler;i++)await pause();
 if(!handler){notify('turn/completed',{threadId:'thread-1',turn:{id:'codex-turn-9',status:'completed'}});await run;}
 assert.equal(typeof handler,'function','active turn must register independent control entrypoint');
 const saved=handler;
 return {calls,events,logs,control:p=>saved(p),emit:(m,p)=>notify(m,{threadId:'thread-1',turnId:'codex-turn-9',...p}),async finish(){notify('turn/completed',{threadId:'thread-1',turn:{id:'codex-turn-9',status:'completed'}});await run;assert.equal(handler,null);assert.equal(closed,1);}};
}
const passed=[];async function test(name,fn){await fn();passed.push(name);console.log('PASS',name);}
for(const phase of ['before-tool','during-tool','after-tool'])await test(phase,async()=>{
 const f=await fixture();if(phase!=='before-tool')f.emit('item/started',{item:{id:'tool-1',type:'commandExecution'}});if(phase==='after-tool')f.emit('item/completed',{item:{id:'tool-1',type:'commandExecution'}});
 const r=await f.control(packet());assert.equal(r.accepted,true);assert.equal(r.codex.turn_id,'codex-turn-9');assert.equal(r.model_response,'unknown');const steer=f.calls.find(c=>c.method==='turn/steer');assert.equal(steer.params.expectedTurnId,'codex-turn-9');assert.match(steer.params.input[0].text,/Отменить A/);assert.match(steer.params.input[0].text,/B/);assert.equal(f.calls.some(c=>c.method==='turn/interrupt'),false);await f.finish();assert.equal(f.events.at(-1).ostanovlenShlyuzom,false);assert.equal((await f.control(packet())).accepted,false);
});
for(const order of ['pressure-first','control-first'])await test(order,async()=>{
 const f=await fixture({pressure:true});const pressure=async()=>{f.emit('thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:11}}});f.emit('item/completed',{item:{id:'tool',type:'commandExecution'}});await pause();};
 if(order==='pressure-first')await pressure();assert.equal((await f.control(packet())).accepted,true);if(order==='control-first')await pressure();await pressure();assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,2);await f.finish();assert.equal(f.events.at(-1).ostanovlenShlyuzom,true);
});
for(const ack of ['wrong','missing','error','end'])await test('ACK '+ack,async()=>{const f=await fixture({ack});await assert.rejects(()=>f.control(packet()));await f.finish();});
await test('two controls independent of pressure one-shot',async()=>{const f=await fixture();await f.control(packet());const p=packet();p.binding.control_id='B2';await f.control(p);assert.equal(f.calls.filter(c=>c.method==='turn/steer').length,2);await f.finish();});
console.log('TOTAL',passed.length);
