// RU: СТЕНД ВРЕМЕНИ АУДИТА ((71)+(72), kompakt-dsh 3.1.4, наряд Забавы 06:13Z 18.10.2026). Ночная строка: сколько стоит аудит
//     журнала продукта формы S1 (нет прошлого старта, окно 7 сут: поиск отметок + сверка ид) на САМОЙ ПЛОТНОЙ службе агента
//     машины. Продукт читает журнал только своей службы агента (marker-step.mjs, agent-registry pole <агент> sluzhba), поэтому
//     плотная служба не агента (a2a-owner-copy-watch) здесь не предмет. Службы — из «agent-registry list» (строки «sluzhba»);
//     плотность — записей за видимую глубину журнала, не больше 7 сут. Аудит — настоящий модуль marker-step.mjs рядом со стендом
//     на настоящих systemctl и journalctl; подменены реестр (имя службы), запрос прошлого старта (пусто → окно 7 сут) и тревога;
//     DSH_HOME — временный каталог, удаляется в конце.
//     Исход: ЗЕЛЁНОЕ — аудит ok быстрее 20 с (код 0); ЖЁЛТОЕ — ok, но 20 с и дольше (код 1); КРАСНОЕ — аудит не ok, тревога или
//     нет строки аудита за 70 с (код 1); СЛЕПОТА (код 2) — нет DSH_TEST_APP, служб агентов не найдено, у всех 0 записей.
//     Порча для проб (печатается строкой «ПОДМЕНА»): STEND_PORCHA=zaderzhka:<мс> — задержка перед каждым вызовом journalctl
//     поиска; STEND_PORCHA=otkaz — вызов поиска отвечает как убитый по таймауту. Иное значение — СЛЕПОТА, не догадка.
//     Чего не ловит: время на других службах, кроме самой плотной; рост журнала между ночами; задержку sudo -n у агента без
//     прав на журнал (стенд читает журнал прямо, учётка обхода в systemd-journal); путь курсора и путь от прошлого старта
//     (их меряет stend-kursora-audita.mjs).
// EN: AUDIT TIME STAND ((71)+(72), kompakt-dsh 3.1.4). Nightly line: the cost of the product's S1-form journal audit (no previous
//     start, 7-day window: marker search + id check) on the DENSEST agent service of the machine. Services come from
//     "agent-registry list" ("sluzhba" lines); density is entries within the visible journal depth, at most 7 days. The audit is
//     the real marker-step.mjs next to the stand on real systemctl and journalctl; the registry, the previous-start query (empty →
//     7-day window) and the alert are replaced; DSH_HOME is a temp dir removed at the end.
//     Outcome: GREEN — audit ok under 20 s (code 0); YELLOW — ok but 20 s or more (code 1); RED — audit not ok, an alert or no
//     audit line within 70 s (code 1); BLINDNESS (code 2) — no DSH_TEST_APP, no agent services found, all have 0 entries.
//     Corruption for probes (printed as "ПОДМЕНА"): STEND_PORCHA=zaderzhka:<ms> delays every search journalctl call;
//     STEND_PORCHA=otkaz makes the search answer as killed by timeout. Any other value is BLINDNESS, not a guess.
//     Not caught: time on services other than the densest; journal growth between nights; sudo -n delay for an agent without
//     journal access; the cursor and previous-start paths (stend-kursora-audita.mjs measures them).
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const JC='/usr/bin/journalctl',ZHELTOE=20000,ZHDAT=70000;
const porcha=process.env.STEND_PORCHA??'';
const zaderzhka=/^zaderzhka:(\d{1,6})$/.exec(porcha);
if(porcha&&!zaderzhka&&porcha!=='otkaz'){console.log(`СЛЕПОТА стенда: STEND_PORCHA="${porcha.slice(0,40)}" — не zaderzhka:<мс> и не otkaz`);process.exit(2);}
if(porcha)console.log(`ПОДМЕНА (порча стенда): ${zaderzhka?'задержка '+zaderzhka[1]+' мс перед каждым поиском journalctl':'поиск journalctl отвечает как убитый по таймауту'}`);
// RU: Службы агентов — строки «sluzhba <имя>.service» вывода agent-registry list.
// EN: Agent services — the "sluzhba <name>.service" lines of agent-registry list output.
let spisok='';
try{spisok=cp.execFileSync('/usr/local/bin/agent-registry',['list'],{encoding:'utf8',timeout:10000});}
catch(e){console.log('СЛЕПОТА стенда: agent-registry list не ответил — '+(e.code||e.message));process.exit(2);}
const sluzhby=[...new Set([...spisok.matchAll(/^\s+sluzhba\s+([a-z][a-z0-9_-]*\.service)\s*$/gm)].map(m=>m[1]))];
if(!sluzhby.length){console.log('СЛЕПОТА стенда: в выводе agent-registry list нет ни одной строки «sluzhba <служба>.service»');process.exit(2);}
// RU: Плотность — записей службы за последние ≤ 7 сут (потоком, без буфера).
// EN: Density — service entries over the last ≤ 7 days (streamed).
const schet=u=>new Promise((ok,no)=>{let n=0;const p=cp.spawn(JC,['-u',u,'--since','-7 days','-o','cat','-q','--no-pager']);
  p.stdout.on('data',b=>{for(const c of b)if(c===10)n++;});p.on('error',no);p.on('close',()=>ok(n));});
const plotnost=[];for(const u of sluzhby)plotnost.push([u,await schet(u)]);
plotnost.sort((a,b)=>b[1]-a[1]);
const [BIG,zapisej]=plotnost[0];
if(!zapisej){console.log(`СЛЕПОТА стенда: у всех ${sluzhby.length} служб агентов 0 записей за 7 сут — журнал не виден учётке ${os.userInfo().username}`);process.exit(2);}
console.log(`служб агентов ${sluzhby.length}; самая плотная ${BIG} — записей ${zapisej}; следом ${plotnost.slice(1,3).map(([u,n])=>u+' '+n).join(', ')}`);
const home=fs.mkdtempSync(path.join(os.tmpdir(),'stend-vremeni-audita-'));process.env.DSH_HOME=home;
process.env.INVOCATION_ID='stend-vremeni-audita';
const original=cp.execFile;const logs=[],alerts=[];
cp.execFile=(file,args,opts,cb)=>{
  if(file==='/usr/local/bin/agent-registry')return queueMicrotask(()=>cb(null,JSON.stringify(BIG)+'\n',''));
  if(args.includes('_PID=1'))return queueMicrotask(()=>cb(null,'',''));
  if(file===JC&&args.includes('--grep')){
    if(porcha==='otkaz')return queueMicrotask(()=>cb(Object.assign(Error('stend: killed'),{code:null,killed:true,signal:'SIGTERM',stderr:''}),'',''));
    if(zaderzhka){setTimeout(()=>original(file,args,opts,cb),+zaderzhka[1]);return;}
  }
  return original(file,args,opts,cb);};
syncBuiltinESMExports();
let kod=0;
try{
  const {installMarker}=await import('./marker-step.mjs');const t0=Date.now();
  installMarker({on(){},get(){}},{name:'stend-vremeni',log:x=>logs.push(x),alert:async x=>alerts.push(x)});
  while(Date.now()-t0<ZHDAT&&!logs.some(x=>/^continuation audit/.test(x)))await new Promise(ok=>setTimeout(ok,50));
  const ms=Date.now()-t0;const line=logs.find(x=>/^continuation audit/.test(x));
  if(!line){console.log(`КРАСНОЕ: ${BIG} — строки аудита нет за ${ZHDAT/1000} с`);kod=1;}
  else if(!/: ok,/.test(line)||alerts.length){console.log(`КРАСНОЕ: ${BIG} — аудит не ok за ${ms} мс (тревог ${alerts.length}): ${line.slice(0,300)}`);kod=1;}
  else if(ms>=ZHELTOE){console.log(`ЖЁЛТОЕ: ${BIG} — аудит S1 ${ms} мс ≥ ${ZHELTOE} (записей ${zapisej}; таймаут продукта 30 с на каждый вызов): ${line.slice(0,200)}`);kod=1;}
  else console.log(`ЗЕЛЁНОЕ: ${BIG} — аудит S1 ${ms} мс < ${ZHELTOE} (записей ${zapisej}): ${line.slice(0,200)}`);
}catch(e){console.log('СЛЕПОТА стенда: '+(e.stack||e).toString().slice(0,400));kod=2;}
finally{cp.execFile=original;syncBuiltinESMExports();fs.rmSync(home,{recursive:true,force:true});}
process.exit(kod);
