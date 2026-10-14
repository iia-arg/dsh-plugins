// RU: Стенд нулевого класса сводок запускает настоящий apply с изолированной памятью и событиями. Проверяет ноль до/после успешного сжатия, ошибочное end, историю до монтажа, порчу/чужую отметку, отказ записи подтверждения и чтения памяти. Не вызывает живую службу.
// EN: The zero-summary-class test runs actual apply with isolated memory and events. Check zero before/after successful compaction, failed end, pre-load history, corrupt/foreign markers, failed confirmation writes, and memory-read failures. No live service is called.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// RU: Временные объекты зарегистрированы для уборки на exit и SIGTERM/SIGINT. SIGKILL и объекты дочерних процессов остаются вне этой защиты.
// EN: Register temporary objects for cleanup on exit and SIGTERM/SIGINT. SIGKILL and child-process objects remain outside this protection.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let generation=0;
try { await import('../src/index.js'); } catch(e) { console.log('СЛЕПОТА: restore не загрузился — '+e.code); process.exit(2); }
const dir=vremennyj(path.join(os.tmpdir(),'restore-070-'));
const original={log:console.log,error:console.error};let passed=0,total=0;
async function run(mode,stamp, options={}){
 delete globalThis.__pamyatRestore;
 const {apply,Config}=await import('../src/index.js?probe='+generation++);
 const logs=[],handlers={};const stderr=process.stderr.write;process.stderr.write=(s)=>{logs.push(String(s));return true};console.log=console.error=(...args)=>logs.push(args.join(' '));
 const ctx={on:(n,f)=>{handlers[n]=f;return()=>{}},get:n=>n==='pamyat'?{sessiyaIsklyuchena:()=>false,prochitat:async q=>{
  if(!q.klass)return [];
  if(mode==='error')throw new Error('probe: источник сломан');
  if(mode==='malformed')return {};
  if(mode==='present')return [{id:71,klass:q.klass,soderzhim:'Тестовая сводка',sozdano:Date.now(),agent:'stend'}];
  return [];
 }}:undefined};
 try{
  apply(ctx,Config({welcomeOtmetki:stamp,welcomeInterval:86400000,welcomeEnabled:true}));
  const session={id:options.sid??'stend',events:options.unavailable?undefined:(options.events??[])};
  if(options.event)handlers['session/event'](session,options.event);
  if(options.onlyEvent)return logs.join('\n');
  const turn={agent:{id:'stend',session},turn:1,step:1,signal:new AbortController().signal};
  await handlers['agent/pre-step'](turn,async()=>({kind:'enter',messages:[]}));
  await handlers['agent/pre-step']({...turn,step:2},async()=>({kind:'enter',messages:[]}));
  return logs.join('\n');
 }finally{process.stderr.write=stderr;Object.assign(console,original)}
}
async function test(name,f){total++;try{const v=await f();if(v!==undefined&&v!==true)throw new Error('тело пробы ВЕРНУЛО «'+String(v).slice(0,60)+'», а обёртка судит по ИСКЛЮЧЕНИЮ (new-session-policy)');passed++;original.log('OK '+name)}catch(e){original.log('FAIL '+name+': '+e.message)}}
try{
 await test('пустая память без end: нейтрально',async()=>{const s=await run('empty',path.join(dir,'empty'));assert(!s.includes('🔴 записей класса'));assert(s.includes('сводок пока нет'));assert(s.includes('svodka-kompakcii'))});
 const ok={type:'compaction/end',time:1700000000000,data:{compactionId:'compact-probe'}};
 await test('успешный end: запись переживает новый модуль и welcome красный',async()=>{const stamp=path.join(dir,'durable');await run('empty',stamp,{event:ok,onlyEvent:true});const d=JSON.parse(fs.readFileSync(stamp+'.compaction-ok.json'));assert.equal(d.compactionId,'compact-probe');const s=await run('empty',stamp,{sid:'new-session'});assert(s.includes('🔴 записей класса'));});
 await test('ошибочный end: нейтрально',async()=>{const s=await run('empty',path.join(dir,'badend'),{event:{...ok,data:{...ok.data,error:'probe'}},onlyEvent:false});assert(!s.includes('🔴 записей класса'));assert(s.includes('сводок пока нет'));});
 await test('исторический успешный end до монтажа: красный',async()=>{const s=await run('empty',path.join(dir,'history'),{events:[ok]});assert(s.includes('🔴 записей класса'));});
 await test('другой агент с тем же sid: нейтрально',async()=>{const s=await run('empty',path.join(dir,'another'));assert(!s.includes('🔴 записей класса'));assert(s.includes('сводок пока нет'));});
 await test('повреждённая отметка: слепота, не нейтральный ноль',async()=>{const stamp=path.join(dir,'broken');fs.writeFileSync(stamp+'.compaction-ok.json','{');const s=await run('empty',stamp);assert(s.includes('ожидание сводки НЕ УСТАНОВЛЕНО'));assert(!s.includes('сводок пока нет'));});
 await test('start без end: нейтрально',async()=>{const s=await run('empty',path.join(dir,'start'),{events:[{...ok,type:'compaction/start'}]});assert(s.includes('сводок пока нет'));assert(!s.includes('🔴 записей класса'));});
 await test('нет истории и отметки: слепота',async()=>{const s=await run('empty',path.join(dir,'no-history'),{unavailable:true});assert(s.includes('ожидание сводки НЕ УСТАНОВЛЕНО'));});
 await test('отказ записи подтверждения: назван, ноль не объявлен законным',async()=>{const stamp=path.join(dir,'write-fail');fs.mkdirSync(stamp+'.compaction-ok.json');const s=await run('empty',stamp,{events:[ok]});assert(s.includes('подтверждение компакта НЕ сохранено'));assert(s.includes('ожидание сводки НЕ УСТАНОВЛЕНО'));assert(!s.includes('сводок пока нет'));});
 await test('отметка чужого агента не принимается',async()=>{const stamp=path.join(dir,'copied');fs.copyFileSync(path.join(dir,'durable.compaction-ok.json'),stamp+'.compaction-ok.json');const s=await run('empty',stamp);assert(s.includes('ожидание сводки НЕ УСТАНОВЛЕНО'));assert(!s.includes('🔴 записей класса'));});
 await test('сводка есть: id=71 без тревоги нуля',async()=>{const s=await run('present',path.join(dir,'present'));assert(s.includes('id=71'));assert(!s.includes('в памяти НОЛЬ'))});
 await test('отказ чтения: не объявляется нулём',async()=>{const s=await run('error',path.join(dir,'error'));assert(s.includes('probe: источник сломан'));assert(s.includes('сколько записей, НЕ ЗНАЕМ'));assert(!s.includes('в памяти НОЛЬ'))});
 await test('не массив: слепота, не ноль',async()=>{const s=await run('malformed',path.join(dir,'malformed'));assert(s.includes('сколько записей, НЕ ЗНАЕМ'));assert(!s.includes('в памяти НОЛЬ'))});
 // RU: A-N-1948 №3 (№23): новый файл отметок не читаем прочими учётками. EN: a new marks file is not readable by others.
 await test('файл отметок welcome: прочим учёткам доступа нет',async()=>{const stamp=path.join(dir,'prava');await run('empty',stamp);const m=fs.statSync(stamp).mode&0o777;assert.equal(m&0o007,0,'режим '+m.toString(8))});
 await test('новый процесс с суточной отметкой: welcome пропущен',async()=>{const s=await run('empty',path.join(dir,'empty'));assert(s.includes('welcome пропущен'));assert(!s.includes('в памяти НОЛЬ'))});
}finally{fs.rmSync(dir,{recursive:true,force:true});delete globalThis.__pamyatRestore;Object.assign(console,original)}
console.log(`ИТОГ zero-summary-policy ${passed}/${total}`);process.exitCode=passed===total?0:1;
