// RU: СТЕНД СВЕЖЕГО USAGE: настоящие Session, TokenMeter и родные выбор/фиксация сжатия платформы. Подставные
//     только текст сводки (вызов провайдера) и контекст служб; сети и модели нет.
//     ⚠️ Зависит от соседства пакетов в общем каталоге node_modules: функцию ядра sobytiyaSessii берёт по
//     относительному пути ../dsh-pamyat-core/src/ (проба на НАСТОЯЩЕЙ функции ядра). Вне такого соседства стенд
//     не соберётся.
// EN: FRESH USAGE STAND: the real Session, TokenMeter and the platform's native compaction selection/commit.
//     Only the summary text (provider call) and the service context are fakes; no network, no model.
//     ⚠️ Depends on package neighbourhood in the shared node_modules directory: it takes the core function
//     sobytiyaSessii by the relative path ../dsh-pamyat-core/src/ (a probe on the REAL core function). Outside
//     such a neighbourhood the stand will not load.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
// RU: Платформа для стенда — DSH_TEST_APP (каталог установки); не задан — СЛЕПОТА стенда, код 2. Прежде здесь был прибит путь
//     к установке одного из агентов фермы. EN: The platform for the stand is DSH_TEST_APP (installation directory); unset —
//     stand BLINDNESS, exit 2. Previously a path to one farm agent's installation was hard-coded here.
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const require=createRequire(process.argv[1]);
const {Session}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')));
const {TokenMeter}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-token-meter')));
// RU: DSH 0.2: модуль берёт журнал сессии у службы ядра ctx.pamyat (в живом процессе она есть) — здесь та же
//     функция ядра-соседа.
// EN: DSH 0.2: the module takes the session journal from the core service ctx.pamyat (present in a live
//     process) — here the same function of the sibling core.
// RU: Нет соседа-ядра — названная СЛЕПОТА стенда, код 2, а не трассировка ERR_MODULE_NOT_FOUND.
// EN: No sibling core — a named stand BLINDNESS, code 2, not an ERR_MODULE_NOT_FOUND stack trace.
const putYadra=new URL('../dsh-pamyat-core/src/sobytiya-sessii.js',import.meta.url);
let sobytiyaSessii;
try { ({sobytiyaSessii}=await import(putYadra.href)); }
catch (e) { console.log('СЛЕПОТА стенда: нет соседа-ядра dsh-pamyat-core — '+putYadra.pathname+' ('+(e?.code||e?.name)+'); стенд гонять в общем node_modules рядом с ядром'); process.exit(2); }
const {NashaSvodka}=await import('./index.mjs');
function fixture(model='gpt-6-astra',provider='claude-oauth'){
 const s=Session.create('stend1172');
 s.append('request/header',{header:{config:{provider,model}},reason:'initial'});   // RU: DSH 0.2: засеянный request/header обязан нести reason. EN: DSH 0.2: a seeded request/header must carry reason.
 s.append('turn/start',{turn:1});
 for(let i=0;i<12;i++)s.append('user/message',{id:'user'+i,source:{kind:'fixture'},role:'user',content:[{type:'text',text:'history '+i+' '+ 'x'.repeat(4000)}]},{surfaceOp:'append'});
 s.append('step/start',{turn:1,step:0});
 s.append('assistant/message',{turn:1,step:0,message:{id:'a0',source:{kind:'model',provider,model},role:'assistant',content:[{type:'text',text:'done'}]},stream:[{type:'text-chunks',index:0,texts:['done']}],usage:   /* RU: DSH 0.2: ответ несёт свой поток. EN: DSH 0.2: the response carries its own stream. */{inputTokens:660490,outputTokens:0}},{surfaceOp:'append'});
 s.append('step/end',{turn:1,step:0});
 const meter=Object.create(TokenMeter.prototype);meter.states=new WeakMap();meter.ctx={get:()=>undefined};   // RU: DSH 0.2: замер спрашивает у ctx сервис llm. EN: DSH 0.2: the meter asks ctx for the llm service.
 const logs=[];const e=Object.create(NashaSvodka.prototype);
 e.ctx={tokenMeter:meter,llm:{resolveModelInfo:async()=>({context:{contextWindow:921818}})},get:(n)=>n==='pamyat'?{sobytiyaSessii}:undefined,waterfall:(n,v,zapas)=>zapas(),logger:{info:x=>logs.push(x),warn:x=>logs.push(x)}};
 e.config={thresholdRatio:.7,retainRatio:.001,compactionRetries:1,maxOverflowRetries:1,modelPolicies:[],auto:false};
 let calls=0;e.summarize=async()=>{calls++;return {summary:[{type:'text',text:'own summary '+ 'y'.repeat(100)}],provider:'fixture',model:'fixture',llmStreamCall:false};};
 return {s,meter,e,logs,calls:()=>calls};
}
const count=(s,t)=>s.snapshotEvents().filter(e=>e.type===t).length;   // RU: DSH 0.2: поля events нет. EN: DSH 0.2: there is no events field.
const run=f=>f.e.compactIfNeeded({session:f.s},'pressure',new AbortController().signal);
const f=fixture();const before=f.meter.measure(f.s);let error=null,result;
try{result=await run(f);}catch(e){error=e;}
console.log(JSON.stringify({before:before.totalTokens,after:f.meter.measure(f.s).totalTokens,summaries:f.calls(),error:error?.message??null}));
assert.equal(error,null,'successful compaction must not retry using stale provider basis');
assert.equal(f.calls(),1);assert.ok(result);assert.equal(count(f.s,'compaction/start'),1);
assert.equal(f.meter.measure(f.s).baseline.tokens,before.baseline.tokens,'usage must not be zeroed');
assert.ok(f.meter.measure(f.s).totalTokens>645272,'stale estimate remains high, not pretended empty');
assert.equal(await run(f),null);assert.equal(f.calls(),1,'next pre-step must wait for fresh usage');
console.log('PASS successful commit -> single summary with retries1; stale basis unchanged; next pre-step held');
// RU: Повторное открытие сессии не стирает удержание: флага только в памяти процесса мало.
// EN: Reopening the session must not erase the hold. No process-only flag is sufficient.
const restored=fixture();restored.s=Session.create(f.s.id,[...f.s.snapshotEvents()],f.s.header);
assert.equal(await run(restored),null);assert.equal(restored.calls(),0);
console.log('PASS hold reconstructed from durable session after restore');
// RU: Новый ответ с ТЕМИ ЖЕ числами usage обязан снять удержание — по тождеству события, а не по числам.
// EN: A new response with IDENTICAL numeric usage must release the hold by event identity.
f.s.append('step/start',{turn:1,step:1});
f.s.append('assistant/message',{turn:1,step:1,message:{id:'a1',source:{kind:'model',provider:'claude-oauth',model:'gpt-6-astra'},role:'assistant',content:[{type:'text',text:'new reply '+ 'z'.repeat(8000)}]},stream:[{type:'text-chunks',index:0,texts:['new reply '+ 'z'.repeat(8000)]}],usage:{inputTokens:660490,outputTokens:0}},{surfaceOp:'append'});
f.s.append('step/end',{turn:1,step:1});
assert.ok(await run(f));assert.equal(f.calls(),2);
assert.equal(count(f.s,'compaction/start'),2);
assert.equal(await run(f),null);assert.equal(f.calls(),2);
console.log('PASS fresh high usage with identical numbers allows next compaction once');
// RU: Отказ — не успешное сжатие; вторая попытка обязана вести себя по-прежнему.
// EN: Failure is not a successful compaction; a second attempt must retain original behavior.
const failed=fixture();const failure=new Error('fixture summary refused');let attempts=0;
failed.e.summarize=async()=>{attempts++;throw failure;};
await assert.rejects(run(failed),e=>e===failure);await assert.rejects(run(failed),e=>e===failure);
assert.equal(attempts,2);assert.equal(count(failed.s,'compaction/summary'),0);
assert.equal(count(failed.s,'compaction/end'),2);
console.log('PASS failed summary does not install hold; original error propagated twice');
// RU: Нет фиксации: слишком большая сводка отвергается ровно как в родном коде.
// EN: No commit: a too-large summary still fails exactly as native code does.
const large=fixture();large.e.summarize=async()=>({summary:[{type:'text',text:'q'.repeat(120000)}]});
await assert.rejects(run(large),/summary is not smaller/);assert.equal(count(large.s,'compaction/summary'),0);
console.log('PASS oversized summary rejected, no successful hold');
// RU: Обычный маршрут Claude и прямые провайдеры сохраняют родные повтор и ошибку без изменений.
// EN: Ordinary Claude route and direct provider keep the native retry + error, unchanged.
for(const [model,provider] of [['claude-opus-5-5','claude-oauth'],['deepseek-flash','deepseek'],['gpt-6-astra','openai']]){
 const normal=fixture(model,provider);
 await assert.rejects(run(normal),/summary is not smaller/);assert.equal(normal.calls(),2);
 console.log('PASS unchanged route '+provider+'/'+model);
}
// RU: Явная политика модели и retries 0 тоже обязаны вернуть успех, а не вводящую в заблуждение ошибку «still
//     above».
// EN: Explicit model policy and retries0 must also return success, not the misleading still-above error.
for(const retries of [0,1,3]){
 const configured=fixture();configured.e.config.modelPolicies=[{provider:'claude-oauth',model:'gpt-6-astra',compactionRetries:retries}];
 assert.ok(await run(configured));assert.equal(configured.calls(),1);
 console.log('PASS modelPolicies with compactionRetries='+retries);
}
// RU: Восстановление после переполнения подтверждается провайдером, а не оценкой давления.
// EN: Context-overflow recovery is provider-confirmed, not a reuse of the pressure estimate.
const overflow=fixture();await run(overflow);let recoveries=0;
overflow.e.compactRegion=async()=>{recoveries++;throw new Error('overflow still invokes native recovery');};
await assert.rejects(overflow.e.compactIfNeeded({session:overflow.s},'context-overflow',new AbortController().signal),/overflow still invokes/);
assert.equal(recoveries,1);console.log('PASS context-overflow route untouched');
console.log('ALL fresh-usage scenarios passed');
// RU: Настоящий автоматический вызов через pre-step: продолжение один раз, без ложного предупреждения «still
//     above».
// EN: Real automatic pre-step caller must continue once, with no misleading still-above warning.
const automatic=fixture();const handlers=new Map();automatic.e.ctx.on=(n,fn)=>handlers.set(n,fn);
automatic.e._registerAutomaticCompaction();let next=0;
await handlers.get('agent/pre-step')({agent:{session:automatic.s},signal:new AbortController().signal},()=>{next++;});
assert.equal(next,1);assert.equal(automatic.calls(),1);
assert.ok(!automatic.logs.some(x=>x.includes('still above threshold')));
assert.ok(automatic.logs.some(x=>x.includes('step pressure')));
console.log('PASS real agent/pre-step emits success and continues once, no still-above warning');
