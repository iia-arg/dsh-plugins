// RU: СТЕНД ОТМЕТКИ ПРОДОЛЖЕНИЯ: переходы фаз и гонки настоящего installMarker на подставном ctx (события
//     сессии, pre-step, статус агента, flush, dispose). Сценарии: успех и принятие; ошибка сжатия; эпизод без
//     end; внешний вход первым; отказ шага; «/stop» человека; DIALOG; Codex выключен и включён; отмена и
//     dispose во время отложенного flush; срок ожидания только при простое; неизвестный MODE без тревоги;
//     принятое старое письмо шлюза; прерывание во время ожидания готовности.
//     Код выхода: 0 — все пробы сошлись, 1 — расхождение (или исключение assert).
// EN: CONTINUATION MARKER STAND: phase transitions and races of the real installMarker on a fake ctx (session
//     events, pre-step, agent status, flush, dispose). Scenarios: success and acceptance; failed compaction;
//     episode without end; external input first; rejected step; human "/stop"; DIALOG; Codex disabled and
//     enabled; cancel and dispose during a delayed flush; deadline only while idle; unknown MODE without alert;
//     admitted legacy gateway letter; abort while waiting for readiness.
//     Exit code: 0 — all probes passed, 1 — a mismatch (or an assert exception).
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createRequire} from 'node:module';
// RU: Предмет marker-step.mjs берёт @deepseek-ai/dsh-llm/message из установки платформы; нет её рядом — СЛЕПОТА стенда, код 2, а не трасса с кодом 1 (аудит A-N-1948 №5).
// EN: marker-step.mjs takes @deepseek-ai/dsh-llm/message from the platform installation; if it is absent here — stand BLINDNESS, exit 2, not a stack trace with exit 1.
try{createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/message');}catch(e){console.log('СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не разрешается рядом со стендом (нужна установка платформы в node_modules) — '+String(e?.message??e).split('\n')[0].slice(0,160));process.exit(2);}
const url=new URL('./marker-step.mjs',import.meta.url);
// RU: Нет модуля — заглушка без отметок: первая же проба покраснеет (стенд не зеленеет вслепую).
// EN: No module — a stub without markers: the very first probe turns red (the stand never goes green blindly).
const mod=fs.existsSync(url)?await import(url):{installMarker:()=>({state:()=>null,dispose(){}})};
let seq=0;
// RU: Подставные сессия, агент и ctx; end() пишет пару summary/checkpoint/end одного compactionId.
// EN: Fake session, agent and ctx; end() writes a summary/checkpoint/end triple of one compactionId.
function fixture(options={}){const handlers={};const events=[];const logs=[],alerts=[];let wakes=0;const session={id:'s'+(++seq),header:{createdAt:seq},snapshotEvents:()=>events,requestHeader:()=>({config:{provider:'claude-oauth',model:'claude-opus-5-5'}})};
 let flushImpl=async()=>true;
 const agent={id:session.id,session,status:'running',inbox:{nextTurn:[],nextStep:[]},wakeDriver(){wakes++}};
 const ctx={on(n,f){(handlers[n]??=[]).push(f);return()=>{}},get(n){return n==='sessions'?{flush:()=>flushImpl()}:n==='agents'?{get:()=>agent}:n==='pamyat'?{sobytiyaSessii:()=>events}:undefined}};
 const api=mod.installMarker(ctx,{name:'fixture',log:s=>logs.push(s),alert:async s=>alerts.push(s),audit:async()=>[],mode:()=>false,waitMs:1000,...options});
 async function event(type,data={},meta={}){const e={type,seq:events.length,time:Date.now(),data,...meta};events.push(e);for(const fn of handlers['session/event']??[])await fn(session,e);return e}
 async function step(next=async()=>({kind:'enter',messages:[]}),messages=[],signal=new AbortController().signal){const fn=handlers['agent/pre-step']?.[0];return fn?fn({agent,turn:1,step:1,messages,signal},next):next()}
 return{events,logs,alerts,agent,api,event,step,setFlush(fn){flushImpl=fn},async status(status){agent.status=status;for(const fn of handlers['agent/status']??[])await fn({agent,status})},async disposeEvent(){for(const fn of handlers.dispose??[])await fn()},wakes:()=>wakes,async end(mode='ACTIVE',error){const sm=await event('compaction/summary',{compactionId:'c',summary:[{type:'text',text:`[MODE=${mode}]\ncheckpoint`}]});await event('user/message',{id:'cp',source:{kind:'compact-checkpoint'}},{sourceEventSeqs:[sm.seq]});return event('compaction/end',{compactionId:'c',...(error?{error}: {})})}};
}
const all=[];try{
 // RU: Успех: вставка с id continuation-… → offered; принятие этого id → consumed; второй вставки нет.
 // EN: Success: insertion with id continuation-… → offered; acceptance of that id → consumed; no second
 //     insertion.
 const f=fixture();all.push(f);await f.end();const d=await f.step();assert.equal(d.messages.length,1,'marker after success');const id=d.messages[0].id;assert.match(id,/^continuation-/);assert.equal(f.api.state(f.agent.session).phase,'offered');await f.event('user/message',d.messages[0]);assert.equal(f.api.state(f.agent.session).phase,'consumed');assert.equal((await f.step()).messages.length,0);
 // RU: Сжатие с ошибкой и эпизод без end — отметки нет.
 // EN: Failed compaction and an episode without end — no marker.
 const bad=fixture();all.push(bad);await bad.end('ACTIVE','failed');assert.equal((await bad.step()).messages.length,0);
 const missing=fixture();all.push(missing);await missing.event('compaction/summary',{compactionId:'c',summary:[{type:'text',text:'[MODE=ACTIVE]\nx'}]});assert.equal((await missing.step()).messages.length,0);
 // RU: Внешний вход в ящике — сначала он (held_external), отметка — после завершения его хода.
 // EN: External input in the inbox goes first (held_external); the marker comes after its turn completes.
 const held=fixture();all.push(held);await held.end();held.agent.inbox.nextTurn.push({id:'mail'});assert.equal((await held.step()).messages.length,0);assert.equal(held.api.state(held.agent.session).phase,'held_external');held.agent.inbox.nextTurn=[];assert.equal((await held.step(async()=>({kind:'enter',messages:[{id:'mail',content:[{type:'text',text:'ordinary update'}]}]}),[{id:'mail',content:[{type:'text',text:'ordinary update'}]}])).messages.length,1);await held.event('turn/end',{turn:1,reason:{kind:'completed'}});const hd=await held.step();assert.equal(hd.messages.length,1);await held.event('user/message',hd.messages[0]);assert.equal((await held.step()).messages.length,0);
 // RU: Отказ шага, «/stop» человека, DIALOG и Codex по умолчанию — отметки нет.
 // EN: Rejected step, human "/stop", DIALOG and Codex by default — no marker.
 const abort=fixture();all.push(abort);await abort.end();assert.equal((await abort.step(async()=>({kind:'reject'}))).kind,'reject');assert.notEqual(abort.api.state(abort.agent.session).phase,'ready');
 const stop=fixture();all.push(stop);await stop.end();const stopMail={source:{kind:'user'},content:[{type:'text',text:'[личный чат, от Человек]\n/stop'}]};await stop.step(async()=>({kind:'enter',messages:[stopMail]}),[stopMail]);await stop.event('turn/end',{turn:1,reason:{kind:'completed'}});assert.equal((await stop.step()).messages.length,0);
 const dialog=fixture();all.push(dialog);await dialog.end('DIALOG');assert.equal((await dialog.step()).messages.length,0);
 const codex=fixture();all.push(codex);codex.agent.session.requestHeader=()=>({config:{provider:'claude-oauth',model:'gpt-6-astra'}});await codex.end();assert.equal((await codex.step()).messages.length,0);
 // RU: Гонка: отмена или dispose, пока flush принятия ещё не вернулся, — поздний flush не воскрешает отметку.
 // EN: Race: cancel or dispose while the acceptance flush is still pending — a late flush does not revive the
 //     marker.
 for(const ending of ['cancel','dispose']){
  const race=fixture({waitMs:30});all.push(race);await race.end();const offer=await race.step();
  let release;race.setFlush(()=>new Promise(ok=>{release=ok}));
  const accepting=race.event('user/message',offer.messages[0]);
  if(ending==='cancel')await race.event('turn/end',{turn:1,reason:{kind:'aborted'}});
  if(ending==='dispose')await race.disposeEvent();
  const phase=race.api.state(race.agent.session).phase;
  release(true);await accepting;
  assert.equal(race.api.state(race.agent.session).phase,phase,'late flush must preserve '+ending);
  assert.equal((await race.step()).messages.length,0);
 }
 // RU: Длинный внешний ход не тратит срок ожидания; offered останавливает срок.
 // EN: A long external turn does not consume the deadline; offered stops the deadline.
 const long=fixture({waitMs:20});all.push(long);await long.end();await long.status('idle');await new Promise(ok=>setImmediate(ok));
 await long.step(async()=>({kind:'enter',messages:[]}),[{content:'ordinary update'}]);await long.status('running');
 await new Promise(ok=>setTimeout(ok,60));assert.equal(long.alerts.length,0,'long external turn must not consume idle deadline');
 await long.event('turn/end',{turn:1,reason:{kind:'completed'}});await long.status('idle');await new Promise(ok=>setImmediate(ok));
 const once=await long.step();assert.equal(once.messages.length,1);let finish;long.setFlush(()=>new Promise(ok=>{finish=ok}));const accepting=long.event('user/message',once.messages[0]);
 await new Promise(ok=>setTimeout(ok,60));assert.equal(long.alerts.length,0,'offered must stop idle deadline');finish(true);await accepting;
 assert.equal((await long.step()).messages.length,0);assert.equal(long.api.state(long.agent.session).phase,'consumed');
 // RU: Простой в ready без принятия — по сроку held_error и одна тревога.
 // EN: Idle in ready without acceptance — held_error by deadline and one alert.
 const idle=fixture({waitMs:20});all.push(idle);await idle.end();await idle.status('idle');await new Promise(ok=>setTimeout(ok,60));assert.equal(idle.alerts.length,1,'idle ready still has a deadline');assert.equal((await idle.step()).messages.length,0);
 // RU: Неизвестный MODE — только строка журнала, тревоги нет даже при dispose.
 // EN: Unknown MODE — only a log line, no alert even on dispose.
 const unknown=fixture();all.push(unknown);await unknown.end('UNKNOWN');await new Promise(ok=>setImmediate(ok));assert.equal(unknown.alerts.length,0,'missing MODE only logs');assert.ok(unknown.logs.some(x=>x.includes('MODE unknown')));assert.equal((await unknown.step()).messages.length,0);await unknown.disposeEvent();assert.equal(unknown.alerts.length,0);
 // RU: Codex включён режимом — отметка есть; принятое старое письмо шлюза её отменяет.
 // EN: Codex enabled by mode — a marker exists; an admitted legacy gateway letter cancels it.
 const enabled=fixture({mode:()=>true});all.push(enabled);enabled.agent.session.requestHeader=()=>({config:{provider:'claude-oauth',model:'gpt-6-astra'}});await enabled.end();assert.equal((await enabled.step()).messages.length,1,'Codex opt-in produces marker');
 const legacy=fixture({mode:()=>true});all.push(legacy);legacy.agent.session.requestHeader=enabled.agent.session.requestHeader;await legacy.end();await legacy.step(async()=>({kind:'enter',messages:[]}),[{content:'[шлюз Codex · продолжение после стопа]'}]);assert.equal((await legacy.step()).messages.length,0,'admitted old letter cancels marker');
 // RU: Прерывание шага, пока ждём готовности отметки, — вставки нет.
 // EN: Step aborted while waiting for marker readiness — no insertion.
 const midAbort=fixture();all.push(midAbort);let readyRelease;
 midAbort.setFlush(()=>new Promise(ok=>{readyRelease=ok}));const preparing=midAbort.end();
 while(!readyRelease)await new Promise(ok=>setImmediate(ok));
 const ac=new AbortController();const waiting=midAbort.step(async()=>({kind:'enter',messages:[]}),[],ac.signal);
 await new Promise(ok=>setImmediate(ok));ac.abort();readyRelease(true);await preparing;
 assert.equal((await waiting).messages.length,0,'abort while awaiting readiness must prevent marker');
 console.log('PASS success/ack, error/no-end, held→processed→once, rejection/STOP, DIALOG, Codex default off');
}finally{for(const f of all)f.api.dispose()}
