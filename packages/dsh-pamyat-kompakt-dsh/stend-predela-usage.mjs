// RU: СТЕНД ПРЕДЕЛА ОЖИДАНИЯ USAGE: на маршруте Codex после успешного сжатия ровно ОДНА тревога после трёх
//     ЗАВЕРШЁННЫХ ходов без свежего usage; перезапуск не дублирует; свежий usage до предела — тревоги нет;
//     новый эпизод считается с нуля; маршрут Claude не затронут; отказ канала записан; бюджет времени команды
//     покрывает бюджет канала. Код выхода: 0 — все пробы сошлись, 1 — расхождение (или исключение assert).
// EN: USAGE WAIT LIMIT STAND: on the Codex route after a successful compaction exactly ONE alert after three
//     COMPLETED turns without fresh usage; a restart does not duplicate it; fresh usage before the limit — no
//     alert; a new episode counts from zero; the Claude route is untouched; a channel failure is recorded; the
//     command time budget covers the channel budget. Exit code: 0 — all probes passed, 1 — a mismatch (or an
//     assert exception).
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
// RU: Платформа для резолвера: DSH_TEST_APP или путь установки, заданный в коде стенда.
// EN: Platform for the resolver: DSH_TEST_APP or an installation path hard-coded in the stand.
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const m=await import('./index.mjs');
assert.equal(typeof m.storozhUsage,'function','missing completed-turn usage watchdog');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-deadline-'));
try{
 let sent=[],logs=[];const callbacks=new Map();
 const ctx={on:(n,f)=>callbacks.set(n,f),tokenMeter:{measure:()=>({baseline:{kind:'usage'}})}};
 const attach=()=>m.storozhUsage(ctx,{directory:dir,send:async text=>{sent.push(text)},log:s=>logs.push(s)});
 const s={id:'fixture',header:{createdAt:123},events:[],requestHeader:()=>({config:{provider:'claude-oauth',model:'gpt-6-astra'}})};
 let turn=0;
 function event(type,data={}){const e={seq:s.events.length,type,data};s.events.push(e);return callbacks.get('session/event')(s,e);}
 const compact=async id=>{await event('compaction/summary',{compactionId:id});await event('compaction/end',{compactionId:id});};
 const end=()=>event('turn/end',{turn:++turn});
 attach();await compact('one');await end();await end();assert.equal(sent.length,0);await end();assert.equal(sent.length,1);assert.match(sent[0],/ожидание usage затянулось/);assert.match(sent[0],/страхует только Codex/);
 await end();attach();await end();assert.equal(sent.length,1,'one attempt after repeat events/restart');
 console.log('PASS K3 completed turns -> one alert, restart does not duplicate');
 await event('assistant/message',{usage:{inputTokens:9}});await compact('two');await end();await event('assistant/message',{usage:{inputTokens:9}});await end();await end();assert.equal(sent.length,1);
 console.log('PASS fresh usage before K -> no alert');
 await compact('three');await end();await end();assert.equal(sent.length,1);await end();assert.equal(sent.length,2);
 console.log('PASS new compaction episode counts from zero');
 // RU: Лишние шаги, повторный turn/end того же хода и чужой агент не расходуют счёт.
 // EN: Extra steps, a repeated turn/end of the same turn and another agent cannot consume the count.
 await event('assistant/message',{usage:{inputTokens:9}});await compact('four');await event('step/end',{turn:turn+1});await end();await event('turn/end',{turn});await end();assert.equal(sent.length,2);await end();assert.equal(sent.length,3);
 console.log('PASS unique turns, not step/event count');
 const before=sent.length;s.requestHeader=()=>({config:{provider:'claude-oauth',model:'claude-opus-5-5'}});await compact('claude');await end();await end();await end();assert.equal(sent.length,before);
 console.log('PASS Claude route unchanged');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
// RU: Отказ канала записан и назван, не повторяется ни на каждом ходе, ни после перезапуска.
// EN: A channel failure is recorded and named, never retried on every turn or restart.
const failureDir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-alert-failure-'));
try{
 const handlers=new Map();let calls=0;const logs=[];
 const ctx={on:(n,h)=>handlers.set(n,h),tokenMeter:{measure:()=>({baseline:{kind:'usage'}})}};
 const s={id:'failed-alert',header:{createdAt:1},requestHeader:()=>({config:{provider:'claude-oauth',model:'gpt-6-astra'}}),events:[{seq:0,type:'compaction/summary',data:{compactionId:'c'}},{seq:1,type:'compaction/end',data:{compactionId:'c'}},...[1,2,3].map((turn,i)=>({seq:i+2,type:'turn/end',data:{turn}}))]};
 const attach=()=>m.storozhUsage(ctx,{directory:failureDir,send:async()=>{calls++;throw Object.assign(new Error('fixture'),{code:'FIXTURE_FAIL'});},log:s=>logs.push(s)});
 attach();await handlers.get('session/event')(s,s.events.at(-1));attach();await handlers.get('session/event')(s,s.events.at(-1));
 assert.equal(calls,1);assert.ok(logs.some(s=>s.includes('agent-alert отказал')));
 assert.equal(JSON.parse(fs.readFileSync(path.join(failureDir,fs.readdirSync(failureDir)[0]))).status,'command_failed');
 console.log('PASS channel error named and persisted, no repeat after restart');
}finally{fs.rmSync(failureDir,{recursive:true,force:true});}
// RU: Контракт настоящей команды обязан вмещать три попытки по 20 секунд и паузы 5/15 секунд.
// EN: The real command contract must allow all three 20-second attempts plus 5/15-second pauses.
const child=await import('node:child_process');const builtin=child.default;const oldExec=builtin.execFile;
const {syncBuiltinESMExports}=await import('node:module');const contractDir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-alert-budget-'));
try{
 let captured=null;builtin.execFile=(command,args,options,callback)=>{captured={command,args,options};queueMicrotask(()=>callback(null));};syncBuiltinESMExports();
 const handlers=new Map();const ctx={on:(n,h)=>handlers.set(n,h),tokenMeter:{measure:()=>({baseline:{kind:'usage'}})}};
 const s={id:'budget',header:{createdAt:2},requestHeader:()=>({config:{provider:'claude-oauth',model:'gpt-6-astra'}}),events:[{seq:0,type:'compaction/summary',data:{compactionId:'b'}},{seq:1,type:'compaction/end',data:{compactionId:'b'}},...[1,2,3].map((turn,i)=>({seq:i+2,type:'turn/end',data:{turn}}))]};
 m.storozhUsage(ctx,{directory:contractDir,log:()=>{}});await handlers.get('session/event')(s,s.events.at(-1));
 assert.equal(captured.command,'/usr/local/bin/agent-alert');assert.ok(captured.options.timeout>80000);
 assert.equal(captured.options.env.AGENT_ALERT_POPYTOK,'3');assert.equal(captured.options.env.AGENT_ALERT_TAJMAUT,'20');assert.equal(captured.options.env.AGENT_ALERT_PAUZY,'5 15');
 console.log('PASS sender budget covers the fixed 80-second channel retry budget');
}finally{builtin.execFile=oldExec;syncBuiltinESMExports();fs.rmSync(contractDir,{recursive:true,force:true});}
