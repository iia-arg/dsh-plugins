// RU: Изолированный стенд stend-mail-stop-absent-legacy.mjs (B-N-1608): строки mail_sdk_requests, чей lease не просил SDK terminal
//     (адаптер до телеметрии стоп-почты), не мешают absent(), если журнал сессии показывает completed turn/end того же хода; настоящая
//     потеря terminal (телеметрию просили) и незавершённый ход по-прежнему блокируют. Ledger — настоящий MessageReceipts, CodexTaskControl
//     — настоящий; журнал сессии — подставные события. Случай Варвары — метаданные 18 строк из разбора Беты (без текстов).
// EN: Isolated harness (B-N-1608): rows whose lease never requested SDK terminal telemetry stop blocking absent() only when the native
//     journal shows that same turn completed; a lost terminal of a telemetry lease and an unfinished turn still block.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {MessageReceipts} from '../src/message-receipts.js';import {CodexTaskControl} from '../src/codex-task-control.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'absent-legacy-'));let ok=0,bad=0,n=0;
const p=(i,u,w)=>{u?ok++:bad++;console.log(`${u?'ЗЕЛЁНОЕ':'КРАСНОЕ'}  ${i}${u?'':' — '+w}`);};
const SID='telegram-a2a',CREATED=1791035866825,OLD1='pid:2700859:5c205534',OLD2='pid:3062506:aaaa',NEW='pid:3501807:bbbb';
// Журнал сессии: ходы from..to, у каждого start и end с указанным исходом (по умолчанию completed).
function zhurnal(from,to,iskhod={}){const ev=[];let seq=0;for(let t=from;t<=to;t++){ev.push({type:'turn/start',seq:++seq,data:{turn:t}});
  if(iskhod[t]!=='net')ev.push({type:'turn/end',seq:++seq,data:{turn:t,reason:{kind:iskhod[t]??'completed'}}});}return ev;}
// Новый ledger с текущим процессом NEW; строки кладутся как их оставили прежние процессы.
function stend(rows,events,owner=NEW){
  const l=new MessageReceipts(path.join(root,'l'+(++n)),{owner});const c=new CodexTaskControl(l,'fixture');
  const ins=l.db.prepare('INSERT INTO mail_sdk_requests VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(const r of rows)ins.run(r.id??`r${n}-${r.turn}-${Math.random()}`,r.gen,SID,CREATED,r.turn,r.binding??'{}',r.state,1,r.state==='terminal'?2:null,r.reason??null);
  const agent={session:{id:SID,header:{createdAt:CREATED},events},status:'idle'};return {l,c,agent};
}
const staryeVarvary=()=>[...Array(16)].map((_,i)=>({turn:32+i,gen:i<8?OLD1:OLD2,state:'unknown',reason:'transport_closed'}));
const novyeVarvary=()=>[48,49].map(t=>({turn:t,gen:NEW,state:'terminal',reason:'completed',binding:'{"sdk_thread_id":"th","sdk_turn_id":"tu"}'}));

// П1 (наряд 1): случай Варвары — 16 старых unknown/transport_closed (ходы 32–47, native completed) + 2 новых terminal → допускается
{const {l,c,agent}=stend([...staryeVarvary(),...novyeVarvary()],zhurnal(32,49));
 p('П1 Варвара: 16 старых без телеметрии + 2 terminal, все ходы completed → absent=true',c.absent(agent)===true,'false');
 p('П1 строки не тронуты: 16 unknown остались',l.db.prepare("SELECT count(*) n FROM mail_sdk_requests WHERE state='unknown'").get().n===16,'изменены');l.close();}
// П2 (наряд 2): настоящая потеря terminal — строка процесса с телеметрией (его же ход 48 terminal), ход 50 закрыт без terminal → отказ
{const {l,c,agent}=stend([...staryeVarvary(),...novyeVarvary(),{turn:50,gen:NEW,state:'unknown',reason:'transport_closed'}],zhurnal(32,50));
 p('П2 потеря terminal у процесса с телеметрией (native completed) → absent=false',c.absent(agent)===false,'true');l.close();}
// П3: старая строка без телеметрии, но её ход в журнале не completed (aborted) → отказ
{const {l,c,agent}=stend([...staryeVarvary(),...novyeVarvary()],zhurnal(32,49,{40:'aborted'}));
 p('П3 старая строка, её ход aborted → absent=false',c.absent(agent)===false,'true');l.close();}
// П4: старая строка, конца её хода в журнале нет → отказ
{const {l,c,agent}=stend([...staryeVarvary(),...novyeVarvary()],zhurnal(32,49,{45:'net'}));
 p('П4 старая строка, turn/end нет → absent=false',c.absent(agent)===false,'true');l.close();}
// П5: последний ход сам старый (новых terminal нет), completed → допускается, как «строки нет» (B-N-1596 r2)
{const {l,c,agent}=stend(staryeVarvary(),zhurnal(32,47));
 p('П5 последний ход старый без телеметрии, completed → absent=true',c.absent(agent)===true,'false');l.close();}
// П6: старый процесс со следом телеметрии (ready-привязка с sdk_thread_id) — его unknown не «без телеметрии» → отказ
{const {l,c,agent}=stend([{turn:30,gen:OLD1,state:'unknown',reason:'transport_closed',binding:'{"sdk_thread_id":"x"}'},...staryeVarvary()],zhurnal(30,47));
 p('П6 у поколения есть sdk_thread_id → его unknown блокирует',c.absent(agent)===false,'true');l.close();}
// П7: старый процесс с process_changed (телеметрия была, процесс умер на ходу) → отказ
{const {l,c,agent}=stend([{turn:47,gen:OLD2,state:'unknown',reason:'process_changed'},...staryeVarvary().filter(r=>r.turn<47)],zhurnal(32,47));
 p('П7 строка process_changed → absent=false',c.absent(agent)===false,'true');l.close();}
// П8: процесс умер на ходу без телеметрии (reason NULL), ход completed → допускается; тот же ход без end → отказ
{let s=stend([{turn:47,gen:OLD2,state:'unknown',reason:null}],zhurnal(47,47));p('П8 reason NULL старого процесса, completed → absent=true',s.c.absent(s.agent)===true,'false');s.l.close();
 s=stend([{turn:47,gen:OLD2,state:'unknown',reason:null}],zhurnal(47,47,{47:'net'}));p('П8 reason NULL, конца хода нет → absent=false',s.c.absent(s.agent)===false,'true');s.l.close();}
// П9: unknown/transport_closed текущего процесса (не помечен no_telemetry) → отказ: текущий процесс помечает сам
{const {l,c,agent}=stend([{turn:47,gen:NEW,state:'unknown',reason:'transport_closed'}],zhurnal(47,47));
 p('П9 transport_closed текущего процесса → absent=false',c.absent(agent)===false,'true');l.close();}
// П10: новый признак — lease без terminal в этом процессе: строка 'no_telemetry'; пока lease открыт — отказ; после close — пропуск при completed
{const {l,c,agent}=stend([],zhurnal(1,1));agent.status='running';agent.session.events=[{type:'turn/start',seq:1,data:{turn:1}}];
 const lease=c.attach(agent,'http://127.0.0.1:1',{allowCancel:true,allowMessage:false,terminal:false});
 const row=()=>l.db.prepare('SELECT state,reason FROM mail_sdk_requests').get();
 p('П10 строка без телеметрии рождается unknown/no_telemetry',row()?.state==='unknown'&&row()?.reason==='no_telemetry',JSON.stringify(row()));
 p('П10 пока lease открыт → absent=false',c.absent(agent)===false,'true');
 lease.close();agent.status='idle';agent.session.events.push({type:'turn/end',seq:2,data:{turn:1,reason:{kind:'completed'}}});
 p('П10 close не затирает признак (no_telemetry остался)',row()?.reason==='no_telemetry',JSON.stringify(row()));
 p('П10 после close и completed → absent=true',c.absent(agent)===true,'false');l.close();}
// П11: lease с телеметрией закрыт без terminal → transport_closed (как прежде) и блокирует даже при completed
{const {l,c,agent}=stend([],[]);agent.status='running';agent.session.events=[{type:'turn/start',seq:1,data:{turn:1}}];
 const lease=c.attach(agent,'http://127.0.0.1:1',{allowCancel:false,allowMessage:false,terminal:true});lease.close();agent.status='idle';
 agent.session.events.push({type:'turn/end',seq:2,data:{turn:1,reason:{kind:'completed'}}});
 const r=l.db.prepare('SELECT state,reason FROM mail_sdk_requests').get();
 p('П11 телеметрия без terminal: unknown/transport_closed',r?.state==='unknown'&&r?.reason==='transport_closed',JSON.stringify(r));
 p('П11 и блокирует при completed → absent=false',c.absent(agent)===false,'true');l.close();}
fs.rmSync(root,{recursive:true,force:true});
console.log(`ИТОГ: ${ok} из ${ok+bad}`);process.exit(bad?1:0);
