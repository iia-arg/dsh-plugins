// RU: СТЕНД ДОСТУПА АУДИТА ОТМЕТКИ. Проверяет, КАК marker-step.mjs читает журнал своей службы при старте: имя
//     службы — из реестра агентов (без подстановки «<имя>.service»), прямой journalctl первым, sudo -n — ровно
//     один раз и только при отказе по правам; таймаут, сигнал, переполнение, неизвестная ошибка — тревога
//     слепоты без повтора. Внешние команды (agent-registry, journalctl, sudo) подменены: настоящие не
//     вызываются. Проба: у агента-образца служба названа не по его имени — подстановки быть не должно.
//     Чего не ловит: настоящие права на этой машине (их проверяет stend-pustogo-audita на настоящем
//     journalctl). Код выхода: 0 — все пробы сошлись, 1 — расхождение (или исключение assert).
// EN: AUDIT ACCESS STAND for the continuation marker. Checks HOW marker-step.mjs reads its own service journal
//     at start-up: the service name comes from the agent registry (no "<name>.service" guessing), direct
//     journalctl first, sudo -n exactly once and only on a permission failure; timeout, signal, overflow,
//     unknown error — a blindness alert without retry. External commands (agent-registry, journalctl, sudo) are
//     replaced: the real ones are not called. Probe: the sample agent's service is not named after the agent —
//     no guessing must happen.
//     Not caught: the real permissions on this machine (checked by stend-pustogo-audita against the real
//     journalctl). Exit code: 0 — all probes passed, 1 — a mismatch (or an assert exception).
import cp from 'node:child_process';import {syncBuiltinESMExports,createRequire} from 'node:module';import assert from 'node:assert/strict';
// RU: Предмет marker-step.mjs берёт @deepseek-ai/dsh-llm/message из установки платформы; нет её рядом — СЛЕПОТА стенда, код 2, а не трасса с кодом 1 (аудит A-N-1948 №5).
// EN: marker-step.mjs takes @deepseek-ai/dsh-llm/message from the platform installation; if it is absent here — stand BLINDNESS, exit 2, not a stack trace with exit 1.
try{createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/message');}catch(e){console.log('СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не разрешается рядом со стендом (нужна установка платформы в node_modules) — '+String(e?.message??e).split('\n')[0].slice(0,160));process.exit(2);}
const original=cp.execFile;
// RU: Сценарии: [имя, сколько ждём тревог, сколько ждём вызовов sudo]. С 1.1.30 вызовов journalctl два (запрос прошлого
//     старта и поиск), подменный journalctl отказывает обоим — при отказе по правам sudo зовётся по разу на каждый.
// EN: Scenarios: [name, expected alerts, expected sudo calls]. Since 1.1.30 there are two journalctl calls (previous-start
//     query and search), the replacement journalctl refuses both — on a permission failure sudo is called once for each.
// RU: B-N-1969: при пустой выборке отметок есть третий запрос — сверка ид (маяк); при отказе по правам sudo и для него.
// EN: B-N-1969: with an empty marker selection there is a third query — the id check (beacon); on a permission failure sudo for it too.
const scenarios=[['direct',0,0],['direct-rows',0,0],['empty',0,0],['permission',0,3],['permission-empty',0,3],['both-denied',1,2],['registry-bad',1,0],['registry-denied',1,0],['unknown-error',1,0],['no-journal-io',1,0],['timeout',1,0],['signal',1,0],['overflow',1,0]];
try{
 for(const [scenario,wantAlerts,wantSudo] of scenarios){const seen=[],alerts=[],logs=[];
  // RU: Подменный execFile: отвечает за реестр, journalctl и sudo по сценарию и запоминает все вызовы.
  // EN: Replacement execFile: answers for the registry, journalctl and sudo per scenario and records every
  //     call.
  cp.execFile=(file,args,opts,cb)=>{seen.push([file,args]);queueMicrotask(()=>{
   const fail=(code,err,extra={})=>cb(Object.assign(Error('probe'),{code,killed:false,signal:null,...extra}),'',err);
   if(file==='/usr/local/bin/agent-registry'){
    if(scenario==='registry-denied')return fail(1,'registry denied');
    return cb(null,JSON.stringify(scenario==='registry-bad'?'--all':'dsh.service')+'\n','');
   }
   if(file==='/usr/bin/systemctl')return cb(null,'SyslogIdentifier=\nExecStart={ path=/usr/local/bin/node ; argv[]=/usr/local/bin/node x ; ignore_errors=no }\n','');
   if(file==='/usr/bin/journalctl'){
    assert.deepEqual(args.slice(0,2),['-u','dsh.service']);
    if(scenario==='direct-rows')return cb(null,[{MESSAGE:'[kompakt-dsh 0.0.0-proba] [continuation-marker] '+JSON.stringify({agent:'agent-proba',key:'done',phase:'consumed',run:'old'})},{MESSAGE:'continuation audit: ok, путь direct, строк отметок 99, unit dsh.service'},{MESSAGE:'ordinary journal entry'}].map(x=>JSON.stringify(x)).join('\n')+'\n','');
    if(scenario.startsWith('permission')||scenario==='both-denied')return fail(1,'No journal files were opened due to insufficient permissions.');
    if(scenario==='empty')return fail(1,'');
    if(scenario==='no-journal-io')return fail(1,'No journal files were opened due to I/O error.');
    if(scenario==='unknown-error')return fail(1,'unrecognized failure');
    if(scenario==='timeout')return fail(null,'',{killed:true,signal:'SIGTERM'});
    if(scenario==='signal')return fail(1,'insufficient permissions',{signal:'SIGTERM'});
    if(scenario==='overflow')return fail('ERR_CHILD_PROCESS_STDIO_MAXBUFFER','insufficient permissions');
    return cb(null,'','');
   }
   assert.equal(file,'/usr/bin/sudo');assert.deepEqual(args.slice(0,5),['-n','--','/usr/bin/journalctl','-u','dsh.service']);
   if(scenario==='both-denied'||scenario==='direct')return fail(1,'sudo: user is not allowed');
   if(scenario==='permission-empty')return fail(1,'');
   return cb(null,'','');
  })};syncBuiltinESMExports();
  // RU: Свежий экземпляр модуля на каждый сценарий (строка запроса в URL): аудит выполняется раз на имя в
  //     процессе.
  // EN: A fresh module instance per scenario (query string in the URL): the audit runs once per name per
  //     process.
  const {installMarker}=await import('./marker-step.mjs?'+scenario);
  installMarker({on(){},get(){}},{name:'agent-proba',log:x=>logs.push(x),alert:async x=>alerts.push(x)});await new Promise(ok=>setImmediate(ok));
  assert.equal(alerts.length,wantAlerts,scenario);assert.equal(seen.filter(x=>x[0]==='/usr/bin/sudo').length,wantSudo,scenario+' sudo');
  const success=logs.filter(x=>x.startsWith('continuation audit: ok,'));assert.equal(success.length,wantAlerts?0:1,scenario+' audit success');
  if(!wantAlerts){assert.match(success[0],new RegExp('путь '+(wantSudo?'sudo':'direct')));assert.match(success[0],new RegExp('строк отметок '+(scenario==='direct-rows'?1:0)+', unit dsh.service'));}
  // RU: Повторное подключение с тем же именем не запускает второй аудит и не печатает вторую строку успеха.
  // EN: Re-attaching with the same name starts no second audit and prints no second success line.
  const before=seen.length;installMarker({on(){},get(){}},{name:'agent-proba',log:x=>logs.push(x),alert:async x=>alerts.push(x)});await new Promise(ok=>setImmediate(ok));assert.equal(seen.length,before,'audit only once per process/name');assert.equal(logs.filter(x=>x.startsWith('continuation audit: ok,')).length,success.length);
  if(scenario==='both-denied'){assert.match(alerts[0],/direct:.*insufficient permissions.*sudo:.*not allowed/s);assert.ok(logs.some(x=>x.includes('insufficient permissions')&&x.includes('not allowed')));}
  if(scenario.startsWith('registry'))assert.equal(seen.length,1);
  console.log('PASS',scenario,'alerts',alerts.length,'sudo',wantSudo);
 }
}finally{cp.execFile=original;syncBuiltinESMExports()}
