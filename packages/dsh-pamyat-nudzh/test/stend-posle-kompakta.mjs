/**
 * RU: Стенд поведения после компакта и по сессиям: давление после успешного сжатия неизвестно, напоминание не
 *     повторяется, расход сохраняется.
 *     Проверяет на подставном ctx (не на cordis): успешный компакт гасит взведённое напоминание и делает
 *     занятость неизвестной (null) при сохранённой сумме; пустой шаг, событие без usage и сводка компакта
 *     давления не восстанавливают; новый usage основной модели взводит снова; низкий usage после компакта — без
 *     вставки; неудачный компакт (error) и компакт без сводки напоминание сохраняют; разные сессии независимы;
 *     перезапуск восстанавливает неизвестность из журнала и печатает строку «восстановлено из журнала» ровно
 *     один раз; негодное событие usage учитывается как вызов без числа; унаследованная часть журнала дочерней
 *     сессии не считается; уже записанное в журнал напоминание не повторяется; слепая сессия (без журнала) даёт
 *     «неизвестно»; отсутствие службы pamyat не мешает чтению журнала.
 *     Восемнадцать проб, по одной на сценарий (04.10.2026): прежде все 31 утверждение шли в ОДНОЙ функции —
 *     первое упавшее обрывало остальные, итога не было, слепота давала код 1. Пробы 1–5 — одна сессия по шагам и
 *     зависят друг от друга по порядку; пробы 14 и 15 берут журнал, собранный в пробе 10.
 *     Запуск: node test/stend-posle-kompakta.mjs из каталога пакета; код 0 — все пробы зелёные, 1 — есть
 *     красные, 2 — СЛЕПОТА (предмет не загрузился) или число проб не то (канарейка).
 * EN: Stand for behaviour after compaction and per session: after a successful compaction pressure is unknown,
 *     the reminder is not repeated, spend is kept.
 *     Uses a fake ctx (not cordis) to check: a successful compaction clears an armed reminder and makes
 *     occupancy unknown (null) while keeping the sum; an empty step, an event without usage and a compaction
 *     summary do not restore pressure; a new main-model usage re-arms; a low usage after compaction gives no
 *     insertion; a failed compaction (error) and a compaction without a summary keep the reminder; different
 *     sessions are independent; a restart rebuilds the unknown state from the journal and prints the
 *     "восстановлено из журнала" line exactly once; an invalid usage event counts as a call without a number;
 *     the inherited part of a child session's journal is not counted; a reminder already in the journal is not
 *     repeated; a blind session (no journal) gives "unknown"; a missing pamyat service does not prevent reading
 *     the journal.
 *     Eighteen probes, one per scenario (04.10.2026): previously all 31 assertions ran in ONE function — the
 *     first failing one cut off the rest, there was no total, and blindness gave exit 1. Probes 1–5 are one
 *     session step by step and depend on each other in order; probes 14 and 15 use the journal built in probe 10.
 *     Run: node test/stend-posle-kompakta.mjs from the package directory; exit 0 — all probes green, 1 — some are
 *     red, 2 — BLINDNESS (the subject did not load) or a wrong number of probes (canary).
 */
import assert from 'node:assert/strict';
let apply,Config;
try{({apply,Config}=await import('../src/index.js'))}
catch(e){console.log('СЛЕПОТА: предмет не загрузился — '+String(e?.message??e).slice(0,160));process.exit(2)}
const logs=[];const stderr=console.error;console.error=(...a)=>logs.push(a.join(' '));
/**
 * RU: boot() — подставной ctx: собирает обработчики событий в h, принимает службу через provide и отдаёт журнал
 *     сессии через службу pamyat; пакет поднимается с predel 921818 и dolyaTrevogi 0.7.
 * EN: boot() — a fake ctx: collects event handlers into h, receives the service through provide and serves the
 *     session journal through the pamyat service; the package starts with predel 921818 and dolyaTrevogi 0.7.
 */
function boot(){const h={};const ctx={on(n,f){h[n]=f;return()=>{}},provide(k,v){this[k]=v},get(n){return n==='pamyat'?{sobytiyaSessii(s){return s.snapshotEvents()}}:null}};apply(ctx,Config({predel:921818,dolyaTrevogi:.7}));return {ctx,h}}
function sess(events=[]){return {id:'test',events_:events,snapshotEvents(){return this.events_}}}
const usage={inputTokens:657345,outputTokens:10};
/**
 * RU: event() дописывает событие в журнал сессии и подаёт его обработчику session/event; compact() — сводка и
 *     конец компакта (error — неудачный); step() — один шаг agent/pre-step.
 * EN: event() appends an event to the session journal and feeds it to the session/event handler; compact() —
 *     summary and end of a compaction (error — a failed one); step() — one agent/pre-step step.
 */
function event(b,s,type,data={}){const e={type,seq:s.events_.length,time:Date.now(),data};s.events_.push(e);b.h['session/event'](s,e)}
function compact(b,s,error){event(b,s,'compaction/summary',{compactionId:'c',usage:{inputTokens:1200,outputTokens:30}});event(b,s,'compaction/end',{compactionId:'c',...(error?{error}: {})})}
async function step(b,s,next=async()=>{}){return b.h['agent/pre-step']({agent:{session:s},signal:{},turn:1,step:1},async()=>{await next();return {kind:'enter',messages:[]}})}
let vsego=0,proshlo=0;
async function proba(imya,f){vsego++;try{const v=await f();if(v!==undefined&&v!==true)throw new Error('тело пробы ВЕРНУЛО «'+String(v).slice(0,60)+'»');proshlo++;console.log('  ✅ '+imya)}
  catch(e){console.log('  ❌ '+imya+' — '+String(e?.message??e).slice(0,200))}}
const b=boot(),s=sess();let history;
await proba('1 успешный компакт гасит напоминание; занятость неизвестна, сумма сохранена',async()=>{event(b,s,'assistant/message',{usage});
 const d=await step(b,s,()=>compact(b,s));assert.equal(d.messages.length,0,'stale reminder after successful compaction');assert.ok(logs.some(x=>x.includes('после сжатия давление неизвестно')));
 assert.equal(b.ctx.nudzhPamyati.itog(s).zanyato,null);assert.equal(b.ctx.nudzhPamyati.itog(s).neMenshe,658585)});
await proba('2 пустой шаг неизвестность не снимает',async()=>{assert.equal((await step(b,s)).messages.length,0,'empty step must keep unknown')});
await proba('3 событие без usage давления не восстанавливает',async()=>{event(b,s,'assistant/message',{});assert.equal((await step(b,s)).messages.length,0,'missing usage does not restore pressure')});
await proba('4 сводка компакта — расход, а не свежее давление',async()=>{event(b,s,'compaction/summary',{compactionId:'other',usage});assert.equal((await step(b,s)).messages.length,0,'summary is expense, not fresh pressure')});
await proba('5 новый высокий usage взводит снова',async()=>{event(b,s,'assistant/message',{usage});assert.equal((await step(b,s)).messages.length,1,'new high usage (same number) rearms')});
await proba('6 низкий usage после компакта — без вставки',async()=>{const low=boot(),ls=sess();event(low,ls,'assistant/message',{usage});compact(low,ls);event(low,ls,'assistant/message',{usage:{inputTokens:10,outputTokens:2}});assert.equal((await step(low,ls)).messages.length,0);assert.equal(low.ctx.nudzhPamyati.itog(ls).zanyato,10)});
await proba('7 неудачный компакт напоминание сохраняет',async()=>{const fail=boot(),fs=sess();event(fail,fs,'assistant/message',{usage});assert.equal((await step(fail,fs,()=>compact(fail,fs,'aborted'))).messages.length,1,'failed compaction keeps reminder')});
await proba('8 компакт без сводки напоминание сохраняет',async()=>{const end=boot(),es=sess();event(end,es,'assistant/message',{usage});event(end,es,'compaction/end',{compactionId:'no-summary'});assert.equal((await step(end,es)).messages.length,1)});
await proba('9 разные сессии независимы',async()=>{const pairs=boot(),one=sess(),two=sess();two.id='other';event(pairs,one,'assistant/message',{usage});event(pairs,two,'assistant/message',{usage});compact(pairs,one);assert.equal((await step(pairs,one)).messages.length,0);assert.equal((await step(pairs,two)).messages.length,1,'different sessions independent')});
await proba('10 перезапуск восстанавливает неизвестность из журнала',async()=>{const restored=boot();history=sess();event(restored,history,'assistant/message',{usage});compact(restored,history);
 const restarted=boot(),copy=sess(structuredClone(history.events_));assert.equal((await step(restarted,copy)).messages.length,0,'restart reconstructs unknown');assert.equal(restarted.ctx.nudzhPamyati.itog(copy).zanyato,null);assert.equal(restarted.ctx.nudzhPamyati.itog(copy).neMenshe,658585);
 event(restarted,copy,'assistant/message',{usage});assert.equal((await step(restarted,copy)).messages.length,1)});
await proba('11 негодное событие usage — вызов без числа',async()=>{const malformed=boot(),ms=sess([{type:'assistant/message',seq:0,data:{usage:{inputTokens:800,outputTokens:0}}},{type:'assistant/message',seq:1,data:{usage:{inputTokens:-1}}},{type:'assistant/message',seq:2,data:{usage:{inputTokens:20,outputTokens:0}}}]);
 assert.equal(malformed.ctx.nudzhPamyati.itog(ms).neMenshe,820);assert.equal(malformed.ctx.nudzhPamyati.itog(ms).neMenshe,820);assert.equal(malformed.ctx.nudzhPamyati.itog(ms).zanyato,20);assert.equal(malformed.ctx.nudzhPamyati.itog(ms).bezChisla,1)});
await proba('12 унаследованная часть журнала дочерней сессии не считается',async()=>{const forks=boot(),parent=sess([{type:'assistant/message',seq:0,data:{usage}}]);forks.ctx.nudzhPamyati.itog(parent);const child=sess(structuredClone(parent.events_));child.id='child';child.inheritedEventCount=1;assert.equal(forks.ctx.nudzhPamyati.itog(child).neMenshe,0);assert.equal(forks.ctx.nudzhPamyati.itog().neMenshe,657355)});
await proba('13 записанное в журнал напоминание не повторяется после перезапуска',async()=>{const consumed=boot(),cs=sess([{type:'assistant/message',seq:0,data:{usage}},{type:'user/message',seq:1,data:{source:{kind:'plugin:dsh-pamyat-nudzh'}}}]);assert.equal((await step(consumed,cs)).messages.length,0,'restart must not repeat durable reminder')});
await proba('14 строка «восстановлено из журнала» — ровно один раз',async()=>{if(!history)throw new Error('журнал пробы 10 не собран');const startLogs=logs.length;const once=boot(),os=sess(structuredClone(history.events_));for(let i=0;i<50;i++)os.events_.push({type:'user/message',seq:os.events_.length,data:{}});await step(once,os);await step(once,os);assert.equal(logs.slice(startLogs).filter(x=>x.includes('восстановлено из журнала')).length,1)});
await proba('15 пустой usage после восстановления — занятость неизвестна',async()=>{if(!history)throw new Error('журнал пробы 10 не собран');const noUsage=boot(),ns=sess(structuredClone(history.events_));await step(noUsage,ns);event(noUsage,ns,'assistant/message',{usage:{}});assert.equal(noUsage.ctx.nudzhPamyati.itog(ns).zanyato,null)});
await proba('16 слепая сессия (без журнала) — «неизвестно»',async()=>{const blind=boot(),bs={id:'blind'};blind.h['session/event'](bs,{type:'assistant/message',data:{usage}});assert.equal(blind.ctx.nudzhPamyati.itog().zanyato,null);assert.equal(blind.ctx.nudzhPamyati.hvatitLi().sostoyanie,'neizvestno')});
await proba('17 повторное открытие той же сессии не удваивает сумму',async()=>{const reopen=boot(),rs=sess([{type:'assistant/message',seq:0,data:{usage}}]);reopen.ctx.nudzhPamyati.itog(rs);reopen.ctx.nudzhPamyati.itog(sess(structuredClone(rs.events_)));assert.equal(reopen.ctx.nudzhPamyati.itog().neMenshe,657355)});
await proba('18 отсутствие службы pamyat не мешает чтению журнала',async()=>{const optional=boot(),ops=sess([{type:'assistant/message',seq:0,data:{usage}}]);optional.ctx.get=()=>{throw Error('service absent')};assert.equal(optional.ctx.nudzhPamyati.itog(ops).zanyato,657345)});
// RU: A-N-1948 №3 (№3): uchest(usage, session) — учёт через журнал сессии; событие, уже лежащее в журнале, не прибавляется второй раз.
// EN: A-N-1948 №3 (№3): uchest(usage, session) counts through the session journal; an event already in the journal is not added twice.
await proba('19 uchest(usage, session) не удваивает событие журнала',async()=>{const b2=boot(),rs=sess([{type:'assistant/message',seq:0,data:{usage}}]);b2.ctx.nudzhPamyati.uchest(usage,rs);const it=b2.ctx.nudzhPamyati.itog(rs);assert.equal(it.uchtenoVyzovov,1,'вызовов '+it.uchtenoVyzovov);assert.equal(it.neMenshe,657355,'neMenshe '+it.neMenshe)});
console.error=stderr;
const ZHDYOM=19;
if(vsego!==ZHDYOM){console.log('🔴 КАНАРЕЙКА: проб '+vsego+', ЖДЁМ '+ZHDYOM);process.exit(2)}
console.log('  итог: '+proshlo+' из '+vsego);
process.exit(proshlo===vsego?0:1);
