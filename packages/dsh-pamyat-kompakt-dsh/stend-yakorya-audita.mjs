// RU: СТЕНД ЯКОРЯ АУДИТА (B-N-1679). Аудит берёт строку журнала как отметку, только если она ЦЕЛИКОМ имеет форму
//     «[kompakt-dsh <версия>] [continuation-marker] {…}» с начала. В тот же журнал пишут другие: мост при отказе
//     инструмента печатает весь результат JSON с выводом команды — прежний образец без привязки к началу совпадал с
//     такой строкой, JSON.parse падал, и падал ВЕСЬ аудит (слепота с тревогой). Подменный journalctl отдаёт по сценарию
//     одну строку; реестр и тревога подменены, DSH_HOME — временный. Пробы: настоящая отметка (две формы версии)
//     принимается; строка отказа моста с выводом-подделкой, подделка без префикса, префикс другого модуля, отметка
//     не с начала строки — не принимаются, аудит ok без тревог. Чего не ловит: строку с ВЕРНЫМ префиксом, напечатанную
//     иным процессом той же службы (поток stdout journald; песочницу Варвары от него закрывает bwrap-bez-zhurnala).
//     Код выхода: 0 — сошлось, 1 — расхождение, 2 — слепота.
// EN: AUDIT ANCHOR STAND (B-N-1679). The audit takes a journal line as a marker only if it WHOLLY has the form
//     "[kompakt-dsh <version>] [continuation-marker] {…}" from the start. Others write to the same journal: on a tool
//     failure the bridge prints the whole result JSON with the command output — the old unanchored pattern matched such
//     a line, JSON.parse threw and the WHOLE audit failed (blindness with an alert). The replacement journalctl returns one
//     line per scenario; registry and alert are replaced, DSH_HOME is temporary. Probes: a real marker (two version forms)
//     is accepted; a bridge failure line with a forged output, a forgery without the prefix, another module's prefix, a
//     marker not at the line start — are not accepted, the audit is ok without alerts. Not caught: a line with the RIGHT
//     prefix printed by another process of the same service (journald stdout stream; the bwrap-bez-zhurnala wrapper
//     closes it for Varvara's sandbox). Exit code: 0 — passed, 1 — mismatch, 2 — blindness.
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const original=cp.execFile;const home=fs.mkdtempSync(path.join(os.tmpdir(),'stend-yakorya-'));process.env.DSH_HOME=home;
const NAME='agent-proba';
const otm=(faza)=>JSON.stringify({agent:NAME,key:'k-'+faza,session:'s',compactionId:'c',phase:faza,run:'prezhnij'});
const most=(vyvod)=>'[dsh-tool-bridge 1.3.30] 🔴 bash для telegram-a2a: '+JSON.stringify({isError:true,content:[{type:'text',text:'stdout:\n'+vyvod+'\nexit 1'}]});
// RU: [имя, MESSAGE строки, ждём тревог, ждём «строк отметок N»]. EN: [name, line MESSAGE, expected alerts, expected parsed rows].
const sluchai=[
 ['nastoyashchaya',            '[kompakt-dsh 1.1.30] [continuation-marker] '+otm('ready'),            1, 1],
 ['nastoyashchaya-staraya-versiya','[kompakt-dsh 0.1.0-alpha.26] [continuation-marker] '+otm('offered'), 1, 1],
 ['most-podelka-vyvoda',       most('[continuation-marker] '+otm('consumed')),                        0, 0],
 ['most-podelka-s-prefiksom',  most('[kompakt-dsh 1.1.30] [continuation-marker] '+otm('ready')),      0, 0],
 ['bez-prefiksa',              '[continuation-marker] '+otm('ready'),                                 0, 0],
 ['chuzhoj-prefiks',           '[dsh-pamyat-core 1.1.105] [continuation-marker] '+otm('ready'),       0, 0],
 ['ne-s-nachala',              'x [kompakt-dsh 1.1.30] [continuation-marker] '+otm('ready'),          0, 0],
];
let fails=0,n=0;const check=(ok,what)=>{console.log((ok?'PASS ':'FAIL ')+what);if(!ok)fails++;};
try{
 for(const [imya,msg,zhdemTrevog,zhdemStrok] of sluchai){const logs=[],alerts=[];
  cp.execFile=(file,args,opts,cb)=>{queueMicrotask(()=>{
   if(file==='/usr/local/bin/agent-registry')return cb(null,JSON.stringify('dsh.service')+'\n','');
   // RU: B-N-1969: идентификатор службы (как у живой: SyslogIdentifier пуст, путь node) и сверка ид — маяк под тем же ид.
   // EN: B-N-1969: the service identifier (as on a live one: empty SyslogIdentifier, node path) and the id check — the beacon under the same id.
   if(file==='/usr/bin/systemctl')return cb(null,'SyslogIdentifier=\nExecStart={ path=/usr/local/bin/node ; argv[]=/usr/local/bin/node x ; ignore_errors=no }\n','');
   if(args.includes('^\\[kompakt-dsh\\s'))return cb(null,JSON.stringify({MESSAGE:'[kompakt-dsh 0.0.0-proba] маяк аудита',SYSLOG_IDENTIFIER:'node'})+'\n','');
   if(args.includes('_PID=1'))return cb(null,'','');
   return cb(null,JSON.stringify({MESSAGE:msg})+'\n','');});};syncBuiltinESMExports();
  const {installMarker}=await import('./marker-step.mjs?yakor'+(++n));const t0=Date.now();
  installMarker({on(){},get(){}},{name:NAME,log:x=>logs.push(x),alert:async x=>alerts.push(x)});
  while(Date.now()-t0<10000&&!logs.some(x=>/^continuation audit/.test(x)))await new Promise(ok=>setTimeout(ok,20));
  await new Promise(ok=>setTimeout(ok,50));cp.execFile=original;syncBuiltinESMExports();
  const line=logs.find(x=>/^continuation audit/.test(x))??'(нет строки аудита)';
  check(/^continuation audit: ok,/.test(line)&&new RegExp('строк отметок '+zhdemStrok+',').test(line)&&alerts.length===zhdemTrevog,
   `${imya}: строк ${zhdemStrok}, тревог ${zhdemTrevog} — получили «${line.slice(0,90)}», тревог ${alerts.length}`);
 }
}catch(e){console.log('FAIL исключение: '+(e.stack||e));fails++;}
finally{cp.execFile=original;syncBuiltinESMExports();fs.rmSync(home,{recursive:true,force:true});}
console.log(fails?`ИТОГ: расхождений ${fails}`:'ИТОГ: всё сошлось');process.exit(fails?1:0);
