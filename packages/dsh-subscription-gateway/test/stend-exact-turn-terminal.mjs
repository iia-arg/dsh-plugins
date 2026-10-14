// B-N-1536 r2 (У1 Вениамина): закрытие хода и доказательство terminal разведены.
// (а) любое turn/completed СВОЕЙ нити закрывает ход (как 1.4.36); (б) terminal для stop/replace — только точный id хода.
// Прежняя редакция (r1) требовала, чтобы turn/completed с иным id ход НЕ закрывал, — закрепляла зависание; переписано.
import assert from 'node:assert/strict';
import {progonAppServer} from '../codex-app-server.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(name,early,send){
 let notify,start,dead,registered=false,finished=false;const terminal=[],events=[];
 const register=()=>{registered=true;return()=>{}};register.terminal=e=>terminal.push(e);
 const client={slushat:f=>notify=f,umer:new Promise(r=>dead=r),uvedomit(){},async zakryt(){dead({code:0})},
  async zapros(method){if(method==='thread/start')return{thread:{id:'thread-fixture'}};if(method==='turn/start'){if(early)return await new Promise(r=>start=r);return{turn:{id:'turn-fixture'}};}return{}}};
 const running=(async()=>{for await(const event of progonAppServer({klientImpl:()=>client,log(){},zapros:'fixture',porog:{},registerTaskControl:register}))events.push(event)})().catch(()=>{}).finally(()=>{finished=true});
 for(let n=0;n<100&&(!notify||early&&!start||!early&&!registered);n++)await tick();
 await send(notify,start);
 for(let n=0;n<200&&!finished;n++)await tick();
 return {finished,terminal};
}
const c=(t,id,st='completed')=>['turn/completed',{threadId:t,turn:{id,status:st}}];
let r;
r=await fixture('a',false,async n=>{n(...c('thread-fixture','other-turn'));});
assert.equal(r.finished,true,'1: иной id в СВОЕЙ нити закрывает ход (как 1.4.36) — не виснет');
assert.equal(r.terminal.length,0,'1: доказательства terminal при ином id нет (unknown → HOLD)');
r=await fixture('b',false,async n=>{n(...c('other-thread','turn-fixture'));await tick();await tick();n(...c('thread-fixture','turn-fixture','interrupted'));});
assert.equal(r.finished,true,'2: точный terminal своей нити закрывает ход');
assert.equal(r.terminal.length,1,'2: чужая нить terminal не даёт, точный своей — даёт ровно один');
assert.equal(r.terminal[0].thread_id,'thread-fixture');assert.equal(r.terminal[0].turn_id,'turn-fixture');assert.equal(r.terminal[0].status,'interrupted');
r=await fixture('c',true,async (n,s)=>{n(...c('thread-fixture','turn-fixture'));s({turn:{id:'turn-fixture'}});});
assert.equal(r.finished,true,'3: ранний точный закрывает ход');assert.equal(r.terminal.length,1,'3: ранний точный — доказательство после привязки turn/start');
r=await fixture('d',true,async (n,s)=>{n(...c('thread-fixture','other-turn'));s({turn:{id:'turn-fixture'}});});
assert.equal(r.finished,true,'4: ранний с иным id закрывает ход');assert.equal(r.terminal.length,0,'4: ранний с иным id доказательством не становится');
r=await fixture('e',true,async (n,s)=>{for(let i=0;i<8;i++)n(...c('thread-fixture','other-'+i));n(...c('thread-fixture','turn-fixture'));s({turn:{id:'turn-fixture'}});});
assert.equal(r.finished,true,'5: при полном буфере ранних ход всё равно закрыт');assert.equal(r.terminal.length,0,'5: девятый ранний (буфер ≤ 8) доказательством не становится');
console.log('PASS 5/5: closing by own-thread turn/completed; terminal proof only for exact turn id (incl. early ≤8)');
