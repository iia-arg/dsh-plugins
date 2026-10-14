// RU: Проверяем факт вызова через настоящий apply/session-event без модели и рабочей памяти. Печать ПОЗВАНА до callback в razvestiFazy должна нарушить баланс строк.
// EN: Test actual invocation through real apply/session-event without a model or production memory. Printing ПОЗВАНА before the razvestiFazy callback must break the line balance.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
const dir = mkdtempSync(join(tmpdir(), 'stend-fakta-zova-'));
const old = { ...process.env }; const stderr = console.error;
let passed = 0, failed = 0;
async function test(name, f) { try { await f(); passed++; console.log('OK '+name); } catch(e) { failed++; console.log('FAIL '+name+': '+e.message); } }
try {
 process.env.DSH_HOME = dir; process.env.HOME = dir;
 process.env.PAMYAT_DISTILLYACIYA_VYKL = join(dir,'net');
 writeFileSync(join(dir,'key'), 'synthetic-test-key');
 const { apply, Config } = await import('../src/index.js');
 for (const variant of ['blocked', 'compaction', 'turn']) await test('session/event '+variant, async () => {
  const vkl=variant!=='compaction'; const blocked=variant==='blocked';
  const lines=[]; console.error=(...a)=>lines.push(a.join(' ')); let handler;
  const ctx={plugin:()=>{},on:(name,f)=>{if(name==='session/event')handler=f;},pamyat:{zapisat:()=>({ishod:'zapisano',id:1}),poIstochniku:()=>[]}};
  apply(ctx,Config({distillyaciya:true,klyuchFajl:join(dir,'key'),putOtklonennyh:join(dir,'otkl-'+vkl),komandaTrevogi:'',hodovojZov:{vkl,porogZnakov:1}}));
  lines.length=0;
  const session={id:'test-'+vkl,events:[{type:'user/message',seq:0,data:{content:[{type:'text',text:'Обычная речь для пробы.'}]}}]};
  if(variant==='turn')session.events.push({type:'turn/end',seq:1,data:{}});
  handler(session,variant==='turn'?{type:'turn/end',seq:1,data:{}}:{type:'compaction/summary',seq:1,data:{compactionId:'test',shadowedSeqs:[0],summary:[{type:'text',text:'Сводка пробы.'}]}});
  for(let i=0;i<100&&!lines.some(l=>l.includes('ЗАКОНЧЕНА')||l.includes('ОТКАЗ'));i++)await new Promise(r=>setTimeout(r,5));
  const starts=lines.filter(l=>l.includes('ПОЗВАНА'));
  const ends=lines.filter(l=>/дистилляция: (ЗАКОНЧЕНА|ОТКАЗ)/u.test(l));
  assert.equal(starts.length,blocked?0:1,lines.join('\n'));
  assert.equal(ends.length,blocked?0:1,lines.join('\n'));
  if(blocked)assert.equal(lines.filter(l=>l.includes('дистилляция по сжатию НЕ зовётся')).length,1);
  else assert.ok(lines.some(l=>l.includes('net-maski')), 'настоящий заход должен дойти до отказа маски без запроса модели');
  console.error=stderr;
 });
 // RU: Извлекаем полное тело настоящего захода; подменяем только внешний исполнитель и службы.
 // EN: Extract the complete real run body; replace only the external executor and services.
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const body=src.slice(src.indexOf('  function zapustitZahod('),src.indexOf('\n  const hodovoj ='));
 for(const mode of ['ok','reject','sync','post-throw','summary'])await test('исход '+mode,async()=>{
  const lines=[]; let calls=0;
  const env={config:{},ctx:{pamyat:{}},krik:m=>lines.push(m),
   propustitSrezSvodki:(_s,_d,k)=>{if(mode!=='summary')return false;k('дистилляция: ЗАКОНЧЕНА — пропуск');return true;},
   metki:{postavit:()=>{if(mode==='sync')throw Error('sync');return 'm';},snyat:()=>{if(mode==='post-throw')throw Error('post');}},
   zatenennye:()=>({seqs:[]}),zabytZahodPoSrezu:()=>{},chitatSobytiya:(s)=>s?.events,/* RU: Свободное имя тела: zapustitZahod.
 * EN: Free name in the body: zapustitZahod.
 */prichinaBezRassuzhdenij:()=>null,/* RU: Свободное имя тела: заслон сессии вне памяти.
 * EN: Free name in the body: the guard for a session outside memory.
 */vneSessii:()=>false,
   sozdatZapisatel:()=>()=>{},sozdatSverkuNovizny:()=>()=>{},sozdatZadanie:()=>()=>{},sozdatOtbroshennoe:()=>()=>{},sozdatSohranenieProzy:()=>()=>{},
   uspehZahoda:()=>true,distillirovat:()=>{calls++;return mode==='reject'?Promise.reject(Error('model')):Promise.resolve({ishod:'ok',zapisano:0});}};
  vm.createContext(env);vm.runInContext(body+'\nthis.run=zapustitZahod;',env);
  try {await env.run({id:'s'},{});}catch{}
  assert.equal(lines.filter(l=>l.includes('ПОЗВАНА')).length,1);
  assert.equal(lines.filter(l=>/дистилляция: (ЗАКОНЧЕНА|ОТКАЗ)/u.test(l)).length,1,lines.join('\n'));
  assert.equal(calls,['sync','summary'].includes(mode)?0:1);
 });
} finally { console.error=stderr; for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);rmSync(dir,{recursive:true,force:true}); }
console.log(`${passed}/${passed+failed}`);process.exitCode=failed?1:0;
