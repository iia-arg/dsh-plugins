// RU: СТЕНД ИДЕНТИФИКАТОРА АУДИТА (B-N-1969, №7-В1). Поиск отметок сужается полем SYSLOG_IDENTIFIER, и значение НЕ
//     зашито: берётся у службы (systemctl show -p SyslogIdentifier, пусто — basename пути ExecStart). Отметок с полем 0 —
//     сверка: последняя строка «[kompakt-dsh» без поля в том же окне (её даёт маяк) подписана другим идентификатором —
//     слепота с тревогой, а не «ok, отметок 0»; курсор при этом не двигается. Внешние команды (agent-registry, systemctl,
//     journalctl) подменены, тревога подменена, DSH_HOME — временный. Чего не ловит: настоящий журнал и настоящее правило
//     sudo (журнал — stend-kursora-audita S1–S3 на большой службе, правило — проба `sudo -l -U varvara` после монтажа).
//     Код выхода: 0 — сошлось, 1 — расхождение, 2 — слепота.
// EN: AUDIT IDENTIFIER STAND (B-N-1969, №7-В1). The marker search is narrowed by the SYSLOG_IDENTIFIER field and the value is
//     NOT hard-coded: it comes from the service (systemctl show -p SyslogIdentifier, empty — basename of the ExecStart path).
//     Zero markers with the field — a check: the latest "[kompakt-dsh" line without the field in the same window (the beacon
//     provides it) labelled with another identifier — blindness with an alert, not "ok, markers 0"; the cursor does not move.
//     External commands (agent-registry, systemctl, journalctl) are replaced, the alert is replaced, DSH_HOME is temporary.
//     Not caught: the real journal and the real sudo rule (journal — stend-kursora-audita S1–S3 on a large service, rule — a
//     `sudo -l -U varvara` probe after installation). Exit code: 0 — passed, 1 — mismatch, 2 — blindness.
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const original=cp.execFile;const home=fs.mkdtempSync(path.join(os.tmpdir(),'stend-identifikatora-'));process.env.DSH_HOME=home;
const NAME='agent-proba';const FILE=path.join(home,'kompakt-dsh','zhurnal-kursor-'+NAME+'.json');
const SVERKA=a=>a.includes('^\\[kompakt-dsh\\s');
const pokaz=(sid,put)=>`SyslogIdentifier=${sid}\nExecStart=${put?`{ path=${put} ; argv[]=${put} x ; ignore_errors=no }`:''}\n`;
const stroka=(msg,id)=>JSON.stringify({MESSAGE:msg,SYSLOG_IDENTIFIER:id})+'\n';
const otm=JSON.stringify({agent:NAME,key:'k',session:'s',compactionId:'c',phase:'consumed',run:'prezhnij'});
// RU: [имя, ответ systemctl (строка | 'fail'), строки поиска с полем: {ид: MESSAGE[]}, ответ сверки (строка | ''), ждём:
//     ok?, тревог, ид в поле, сверка вызвана?, образец строки исхода].
// EN: [name, systemctl answer (string | 'fail'), field search lines: {id: MESSAGE[]}, check answer (string | ''), expected:
//     ok?, alerts, field id, check called?, outcome line pattern].
const MAYAK='[kompakt-dsh 0.0.0-proba] маяк аудита';
const sluchai=[
 ['pustoj-sid-put-node', pokaz('','/usr/local/bin/node'), {}, stroka(MAYAK,'node'), true,0,'node',true,/сверка: последняя строка kompakt-dsh под node/],
 ['sid-zadan',           pokaz('agent-svoj','/usr/local/bin/node'), {}, stroka(MAYAK,'agent-svoj'), true,0,'agent-svoj',true,/ид agent-svoj/],
 ['drugoj-ident',        pokaz('agent-svoj','/usr/local/bin/node'), {node:['[kompakt-dsh 1.1.34] [continuation-marker] '+otm]}, stroka(MAYAK,'node'), false,1,'agent-svoj',true,/подписаны SYSLOG_IDENTIFIER=node, а поиск отметок шёл по agent-svoj/],
 ['strok-kompakt-net',   pokaz('','/usr/local/bin/node'), {}, '', true,0,'node',true,/сверка: строк kompakt-dsh в окне нет/],
 ['otmetki-est',         pokaz('','/usr/local/bin/node'), {node:['[kompakt-dsh 1.1.34] [continuation-marker] '+otm]}, '', true,0,'node',false,/строк отметок 1, .*сверка: по отметкам/],
 ['systemctl-otkaz',     'fail', {}, '', false,1,null,false,/systemctl show: code=1/],
 ['ident-ne-ustanovlen', pokaz('',''), {}, '', false,1,null,false,/идентификатор службы не установлен/],
 ['ident-negodnyj',      pokaz('a b;c','/usr/local/bin/node'), {}, '', false,1,null,false,/идентификатор службы не установлен/],
];
let fails=0,n=0;const check=(ok,what)=>{console.log((ok?'PASS ':'FAIL ')+what);if(!ok)fails++;};
try{
 for(const [imya,sc,poisk,sverka,zhdemOk,zhdemTrevog,zhdemId,zhdemSverku,obrazec] of sluchai){const logs=[],alerts=[],calls=[];
  // RU: Курсор лежит до прогона — у отказа он обязан остаться прежним (проба 3 наряда).
  // EN: A cursor exists before the run — on a failure it must stay unchanged (order probe 3).
  fs.mkdirSync(path.dirname(FILE),{recursive:true});const keep=JSON.stringify({unit:'dsh.service',cursor:'s=1;i=1;b=1;m=1;t='+(Date.now()*1000-60e6).toString(16)+';x=1'});fs.writeFileSync(FILE,keep);
  cp.execFile=(file,args,opts,cb)=>{calls.push([file,args]);queueMicrotask(()=>{
   if(file==='/usr/local/bin/agent-registry')return cb(null,JSON.stringify('dsh.service')+'\n','');
   if(file==='/usr/bin/systemctl')return sc==='fail'?cb(Object.assign(Error('probe'),{code:1,killed:false,signal:null}),'','Failed to connect to bus'):cb(null,sc,'');
   if(args.includes('_PID=1'))return cb(null,'','');
   if(SVERKA(args))return sverka?cb(null,sverka,''):cb(Object.assign(Error('probe'),{code:1,killed:false,signal:null}),'','');
   // RU: Поиск отметок: отдаются только строки, подписанные идентификатором из поля запроса — как отдал бы journald.
   // EN: Marker search: only lines labelled with the identifier from the query field are returned — as journald would.
   const pole=(args.find(x=>x.startsWith('SYSLOG_IDENTIFIER='))??'').slice(18);
   const out=(poisk[pole]??[]).map(m=>stroka(m,pole)).join('')+'-- cursor: s=2;i=2;b=2;m=2;t='+(Date.now()*1000).toString(16)+';x=2\n';
   return (poisk[pole]??[]).length?cb(null,out,''):cb(Object.assign(Error('probe'),{code:1,killed:false,signal:null}),out,'');
  });};syncBuiltinESMExports();
  const {installMarker}=await import('./marker-step.mjs?ident'+(++n));const t0=Date.now();
  installMarker({on(){},get(){}},{name:NAME,log:x=>logs.push(x),alert:async x=>alerts.push(x)});
  while(Date.now()-t0<10000&&!logs.some(x=>/^continuation audit/.test(x)))await new Promise(ok=>setTimeout(ok,20));
  await new Promise(ok=>setTimeout(ok,50));cp.execFile=original;syncBuiltinESMExports();
  const line=logs.find(x=>/^continuation audit/.test(x))??'(нет строки аудита)';
  const poiski=calls.filter(c=>c[1].includes('--show-cursor'));const pole=poiski[0]?.[1][2];
  const ok=/^continuation audit: ok,/.test(line)===zhdemOk&&alerts.length===zhdemTrevog&&obrazec.test(line+' '+alerts.join(' '))
   &&(zhdemId===null?poiski.length===0:pole==='SYSLOG_IDENTIFIER='+zhdemId&&poiski[0][1][1]==='dsh.service')
   &&calls.some(c=>SVERKA(c[1]))===zhdemSverku&&(zhdemOk||fs.readFileSync(FILE,'utf8')===keep)
   &&(zhdemId===null||logs.some(x=>x==='маяк аудита: unit dsh.service, ид '+zhdemId));
  check(ok,`${imya}: ${zhdemOk?'ok':'слепота'}, тревог ${zhdemTrevog}, поле ${zhdemId??'—'}${zhdemOk?'':', курсор прежний'} — получили «${line.slice(0,150)}», тревог ${alerts.length}, поле ${pole??'—'}`);
 }
}catch(e){console.log('FAIL исключение: '+(e.stack||e));fails++;}
finally{cp.execFile=original;syncBuiltinESMExports();fs.rmSync(home,{recursive:true,force:true});}
console.log(fails?`ИТОГ: расхождений ${fails}`:'ИТОГ: всё сошлось');process.exit(fails?1:0);
