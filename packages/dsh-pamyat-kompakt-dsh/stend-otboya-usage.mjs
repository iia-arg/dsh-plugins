// RU: СТЕНД ОТБОЯ ОЖИДАНИЯ USAGE: отбой — ОДИН, только после ДОСТАВЛЕННОЙ тревоги, без повтора после
//     перезапуска. Предмет — настоящий storozhUsage из ./index.mjs; сессия, канал и метки — подставные
//     (временный каталог). Коды: 0 — сошлось, 1 — расхождение, 2 — слепота (предмет не загрузился).
// EN: STAND FOR THE USAGE-WAIT ALL-CLEAR: exactly ONE all-clear, only after a DELIVERED alert, no repeat after
//     restart. Subject — the real storozhUsage from ./index.mjs; session, channel and marks are fakes
//     (temporary directory). Codes: 0 — passed, 1 — mismatch, 2 — blindness (subject did not load).
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
// RU: Платформа для резолвера: DSH_TEST_APP или путь установки, заданный в коде стенда.
// EN: Platform for the resolver: DSH_TEST_APP or an installation path hard-coded in the stand.
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
let m;try{m=await import('./index.mjs');}catch(e){console.log('СЛЕПОТА: предмет не загрузился',e.code||e.message);process.exit(2);}
if(typeof m.storozhUsage!=='function'){console.log('СЛЕПОТА: нет storozhUsage');process.exit(2);}
let ok=0,bad=0;const proba=(imya,pol,zh)=>{const r=JSON.stringify(pol)===JSON.stringify(zh);r?ok++:bad++;console.log(`${r?'ок ':'КРАСНОЕ'} ${imya}: получили ${JSON.stringify(pol)}, ждали ${JSON.stringify(zh)}`);};
// RU: Фабрика стенда: свой временный каталог меток, подставной канал (может падать по условию), сессия маршрута
//     Codex или Claude.
// EN: Stand factory: its own temporary mark directory, a fake channel (can fail on demand), a session on the
//     Codex or Claude route.
function stend(model,{padaet=()=>false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'otboj-usage-'));const sent=[],logs=[];const cb=new Map();
  const ctx={on:(n,f)=>cb.set(n,f),tokenMeter:{measure:()=>({baseline:{kind:'usage'}})}};
  const attach=()=>m.storozhUsage(ctx,{directory:dir,send:async t=>{if(padaet(t))throw Object.assign(new Error('fixture'),{code:'FIXTURE_FAIL'});sent.push(t);},log:s=>logs.push(s)});
  const s={id:'fx-'+model,header:{createdAt:7},events:[],requestHeader:()=>({config:{provider:'claude-oauth',model}})};let turn=0;
  const event=(type,data={})=>{const e={seq:s.events.length,type,data};s.events.push(e);return cb.get('session/event')(s,e);};
  const compact=async id=>{await event('compaction/summary',{compactionId:id});await event('compaction/end',{compactionId:id});};
  const end=()=>event('turn/end',{turn:++turn});const usage=()=>event('assistant/message',{usage:{inputTokens:5}});
  const trevog=()=>sent.filter(x=>x.includes('ожидание usage затянулось')).length, otboev=()=>sent.filter(x=>x.includes('отбой')).length;
  attach();return {dir,sent,logs,attach,compact,end,usage,trevog,otboev,metka:()=>fs.readdirSync(dir).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f))))};
}
const tmp=[];
try{
  // RU: О1–О3: тревога после трёх ходов без usage, затем ровно один отбой; перезапуск не повторяет; новый
  //     эпизод считается заново.
  // EN: O1–O3: alert after three turns without usage, then exactly one all-clear; a restart does not repeat it;
  //     a new episode counts afresh.
  let t=stend('gpt-6-astra');tmp.push(t.dir);
  await t.compact('one');await t.end();await t.end();await t.end();
  await t.usage();await t.end();
  proba('О1 тревога доставлена (K=3), затем свежий usage → ОДИН отбой',[t.trevog(),t.otboev()],[1,1]);
  await t.end();await t.end();t.attach();await t.end();
  proba('О2 ещё ходы и перезапуск → отбой не повторяется; метка otboj=command_ok',[t.otboev(),t.metka()[0]?.otboj],[1,'command_ok']);
  await t.compact('two');await t.end();await t.usage();await t.end();await t.end();await t.end();
  proba('О3 usage раньше K → ни тревоги, ни отбоя по новому эпизоду',[t.trevog(),t.otboev()],[1,1]);
  // RU: О4: тревога не дошла — отбоя нет.
  // EN: O4: the alert was not delivered — no all-clear.
  let f=stend('gpt-6-astra',{padaet:x=>x.includes('затянулось')});tmp.push(f.dir);
  await f.compact('c');await f.end();await f.end();await f.end();await f.usage();await f.end();
  proba('О4 тревога НЕ дошла (command_failed) → отбоя нет',[f.metka()[0]?.status,f.otboev()],['command_failed',0]);
  // RU: О5: маршрут Claude — сторож молчит.
  // EN: O5: Claude route — the watchdog is silent.
  let c=stend('claude-opus-5-5');tmp.push(c.dir);
  await c.compact('k');await c.end();await c.end();await c.end();await c.usage();await c.end();
  proba('О5 маршрут Claude → ни тревоги, ни отбоя',c.sent.length,0);
  // RU: О6: канал упал на отбое — назван в журнале, записан в метке, не повторяется после перезапуска.
  // EN: O6: the channel failed on the all-clear — named in the log, recorded in the mark, not repeated after
  //     restart.
  let o=stend('gpt-6-astra',{padaet:x=>x.includes('отбой')});tmp.push(o.dir);
  await o.compact('d');await o.end();await o.end();await o.end();await o.usage();await o.end();o.attach();await o.end();
  proba('О6 канал упал на отбое → назван, записан otboj=command_failed, без повтора после перезапуска',
    [o.logs.filter(x=>x.includes('agent-alert отказал для отбоя')).length,o.metka()[0]?.otboj],[1,'command_failed']);
}finally{for(const d of tmp)fs.rmSync(d,{recursive:true,force:true});}
console.log(`\nstend-otboya-usage: ok=${ok} FAIL=${bad}`);process.exit(bad?1:0);
