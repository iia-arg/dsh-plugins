// RU: Проверка stend-telegram-stop: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-telegram-stop verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.
import assert from 'node:assert/strict';import {progonAppServer} from '../codex-app-server.mjs';import {TaskControlRouter} from '../task-control.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture({endBeforeAck=false}={}){
 let emit,control,dead;const died=new Promise(r=>dead=r);const calls=[],events=[];
 const k={slushat:f=>emit=f,umer:died,uvedomit(){},async zakryt(){dead({code:0});},async zapros(method,params){calls.push({method,params});if(method==='thread/start')return {thread:{id:'thread-1'}};if(method==='turn/start')return {turn:{id:'turn-7'}};if(method==='turn/steer')return {turnId:'turn-7'};if(method==='turn/interrupt'&&endBeforeAck)emit('turn/completed',{threadId:'thread-1',turn:{id:'turn-7',status:'interrupted'}});return {};}};
 const run=(async()=>{for await(const e of progonAppServer({klientImpl:()=>k,log(){},zapros:'A',porog:{porog:10},tekstSignala:'PRESSURE',registerTaskControl:f=>{control=f;return ()=>{};}}))events.push(e);})();while(!control)await tick();
 return{calls,events,control,emit:(m,p)=>emit(m,{threadId:'thread-1',turnId:'turn-7',...p}),async finish(status='interrupted'){emit('turn/completed',{threadId:'thread-1',turn:{id:'turn-7',status}});await run;}};
}
for(const phase of ['before','during','after']){
 const f=await fixture();if(phase!=='before')f.emit('item/started',{item:{id:'tool',type:'commandExecution'}});if(phase==='after')f.emit('item/completed',{item:{id:'tool',type:'commandExecution'}});
 const ack=await f.control({op:'stop',binding:{control_id:'telegram-1'},body:''});assert.equal(f.calls.filter(x=>x.method==='turn/interrupt').length,1,'/stop must call interrupt');assert.equal(f.calls.filter(x=>x.method==='turn/steer').length,0,'command must not become model input');assert.deepEqual(f.calls.find(x=>x.method==='turn/interrupt').params,{threadId:'thread-1',turnId:'turn-7'});assert.equal(ack.operation,'stop');await f.finish();assert.equal(f.events.at(-1).ostanovlenShlyuzom,false);console.log('PASS stop',phase);
}
for(const order of ['pressure-first','stop-first']){
 const f=await fixture();const pressure=async()=>{f.emit('thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:11}}});f.emit('item/completed',{item:{id:'tool',type:'commandExecution'}});await tick();};
 if(order==='pressure-first')await pressure();await f.control({op:'stop',binding:{control_id:'T'},body:''});if(order==='stop-first')await pressure();await f.finish('completed');assert.equal(f.events.at(-1).ostanovlenShlyuzom,false,'/stop must not cause pressure auto-continuation');console.log('PASS',order);
}
const race=await fixture({endBeforeAck:true});assert.equal((await race.control({op:'stop',binding:{control_id:'T'},body:''})).accepted,true);await race.finish();console.log('PASS interrupt completion before ACK');
const router=new TaskControlRouter();const b={generation:'p',recipient:'beta',ledger_uuid:'l',session_id:'s',session_created:1,turn:1};let n=0;const ticket='a'.repeat(64);const close=router.register({binding:b,ticket,operations:['stop']},async p=>{n++;return {accepted:true,operation:p.op,codex:{thread_id:'t',turn_id:'u'}};});
const stop={binding:{...b,control_id:'T'},op:'stop',body:''};assert.equal((await router.dispatch(ticket,stop)).accepted,true);assert.equal((await router.dispatch(ticket,stop)).accepted,true);assert.equal(n,1);assert.equal((await router.dispatch(ticket,{binding:{...b,control_id:'C',target_receipt:'A'},op:'cancel',body:'text'})).accepted,false);close();assert.equal((await router.dispatch(ticket,stop)).accepted,false);console.log('PASS stop-only capability, duplicate and closed route');
