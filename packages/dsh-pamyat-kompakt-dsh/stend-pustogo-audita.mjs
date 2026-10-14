// RU: СТЕНД ПУСТОГО АУДИТА: на НАСТОЯЩЕМ journalctl пустая история отметок (grep без совпадений: код 1, пустые
//     stdout и stderr) — не тревога; одна строка успешного чтения. Служба — уникальное имя без записей (сама
//     служба не создаётся), ответ реестра подставлен, тревога подставлена. Затем подменные отказы: права,
//     таймаут, сигнал, убитый процесс, переполнение, битый JSON, незакрытая отметка — каждый даёт тревогу.
//     Граница: стенду нужно право читать журнал напрямую или через sudo -n; пустой grep не доказывает доступа к
//     чужим журналам. Код выхода: 0 — все пробы сошлись, 1 — расхождение (или исключение assert).
// EN: EMPTY AUDIT STAND: on the REAL journalctl an empty marker history (grep without matches: code 1, empty
//     stdout and stderr) is not an alert; one successful-read line. The unit is a unique name without records
//     (no unit is created), the registry answer and the alert are fakes. Then replaced failures: permissions,
//     timeout, signal, killed process, overflow, broken JSON, an open marker — each gives an alert.
//     Boundary: the stand needs permission to read the journal directly or via sudo -n; an empty grep does not
//     prove access to other units' journals. Exit code: 0 — all probes passed, 1 — a mismatch (or an assert
//     exception).
import cp from 'node:child_process';import {syncBuiltinESMExports,createRequire} from 'node:module';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
// RU: Предмет marker-step.mjs берёт @deepseek-ai/dsh-llm/message из установки платформы; нет её рядом — СЛЕПОТА стенда, код 2, а не трасса с кодом 1 (аудит A-N-1948 №5).
// EN: marker-step.mjs takes @deepseek-ai/dsh-llm/message from the platform installation; if it is absent here — stand BLINDNESS, exit 2, not a stack trace with exit 1.
try{createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm/message');}catch(e){console.log('СЛЕПОТА стенда: @deepseek-ai/dsh-llm/message не разрешается рядом со стендом (нужна установка платформы в node_modules) — '+String(e?.message??e).split('\n')[0].slice(0,160));process.exit(2);}
// RU: Подменные исходы чтения: имя, код, stdout/stderr, сколько тревог ждём.
// EN: Replaced read outcomes: name, code, stdout/stderr, expected alerts.
const original=cp.execFile;const cases=[
 {name:'empty',code:1,out:'',err:'',want:0},
 {name:'denied',code:1,out:'',err:'Permission denied',want:1},
 {name:'timeout',code:null,killed:true,signal:'SIGTERM',out:'',err:'',want:1},
 {name:'signal',code:1,killed:false,signal:'SIGTERM',out:'',err:'',want:1},
 {name:'killed',code:1,killed:true,signal:null,out:'',err:'',want:1},
 {name:'overflow',code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',out:'',err:'',want:1},
 {name:'badjson',code:0,out:'not json\n',err:'',want:1},
 {name:'lost',code:0,out:JSON.stringify({MESSAGE:'[kompakt-dsh 0.0.0-proba] [continuation-marker] '+JSON.stringify({agent:'lost',key:'k',session:'s',compactionId:'c',phase:'ready',run:'old'})})+'\n',err:'',want:1}
];
try{

 // RU: Независимое чтение БЕЗ фильтра доказывает, что у этой уникальной службы действительно нет записей.
 // EN: An independent unfiltered read proves this unique unit really has no records.
 const name='stendaudit-'+randomUUID();const args=['-u',name+'.service','--since','-7 days','-o','json','--no-pager'];
 const denied=(e,err)=>e?.code===1&&!e.killed&&!e.signal&&/insufficient permissions|Permission denied/i.test(err??'');
 const read=(file,query)=>new Promise(ok=>original(file,query,{timeout:10000,maxBuffer:4*1024*1024,env:{...process.env,LC_ALL:'C'}},(e,out,err)=>ok({e,out,err})));
 let raw=await read('/usr/bin/journalctl',args);
 if(denied(raw.e,raw.err))raw=await read('/usr/bin/sudo',['-n','--','/usr/bin/journalctl',...args]);
 assert.equal(raw.e,null,'unfiltered journal must be readable');assert.equal(raw.out,'');assert.equal(raw.err,'');
 const alerts=[],logs=[];let readDone;const done=new Promise(ok=>{readDone=ok});
 cp.execFile=(file,query,opts,cb)=>{if(file==='/usr/local/bin/agent-registry'){queueMicrotask(()=>cb(null,JSON.stringify(name+'.service'),''));return;}if(file==='/usr/bin/systemctl'){queueMicrotask(()=>cb(null,'SyslogIdentifier=\nExecStart={ path=/usr/local/bin/node ; argv[]=/usr/local/bin/node x ; ignore_errors=no }\n',''));return;}assert.ok(['/usr/bin/journalctl','/usr/bin/sudo'].includes(file));return original(file,query,opts,(e,out,err)=>{cb(e,out,err);if(!(file==='/usr/bin/journalctl'&&denied(e,err))&&query.includes('--show-cursor'))readDone({e,out,err})})};syncBuiltinESMExports();
 const {installMarker}=await import('./marker-step.mjs?real-empty-'+name);
 installMarker({on(){},get(){}},{name,log:x=>logs.push(x),alert:async x=>alerts.push(x)});
 // RU: B-N-1969: после поиска идёт сверка ид (настоящий journalctl) — строку исхода ждать по её появлению, до 10 с.
 // EN: B-N-1969: the id check (real journalctl) follows the search — wait for the outcome line itself, up to 10 s.
 const result=await done;for(const t0=Date.now();Date.now()-t0<10000&&!logs.some(x=>/^continuation audit/.test(x));)await new Promise(ok=>setTimeout(ok,20));
 assert.equal(result.e?.code,1);assert.equal(result.e.killed,false);assert.equal(result.e.signal,null);assert.equal(result.out,'');assert.equal(result.err,'');
 console.log('REAL journalctl:',name+'.service','unfiltered rows=0 rc=0; grep rows=0 rc=1; stdout/stderr empty');
 assert.equal(alerts.length,0,'real empty journal must not alert');assert.equal(logs.filter(x=>x.startsWith('continuation audit: ok,')).length,1,'one successful read trace');
 console.log('PASS real empty journal → no alert');
 // RU: Каждый подменный исход — через свежий экземпляр модуля.
 // EN: Each replaced outcome goes through a fresh module instance.
 for(const c of cases){const alerts=[],logs=[];cp.execFile=(file,args,opts,cb)=>{if(file==='/usr/local/bin/agent-registry'){queueMicrotask(()=>cb(null,JSON.stringify(c.name+'.service'),''));return;}if(file==='/usr/bin/systemctl'){queueMicrotask(()=>cb(null,'SyslogIdentifier=\nExecStart={ path=/usr/local/bin/node ; argv[]=/usr/local/bin/node x ; ignore_errors=no }\n',''));return;}assert.ok(['/usr/bin/journalctl','/usr/bin/sudo'].includes(file));queueMicrotask(()=>cb(c.code===0?null:Object.assign(new Error('probe'),{code:c.code,killed:c.killed||false,signal:c.signal||null}),c.out,c.err))};syncBuiltinESMExports();
 const {installMarker}=await import('./marker-step.mjs?'+c.name);
 installMarker({on(){},get(){}},{name:c.name,log:x=>logs.push(x),alert:async x=>alerts.push(x)});await new Promise(ok=>setImmediate(ok));assert.equal(alerts.length,c.want,c.name);assert.equal(logs.filter(x=>x.startsWith('continuation audit: ok,')).length,(c.name==='empty'||c.name==='lost')?1:0,c.name+' read trace');console.log('PASS',c.name,'alerts',alerts.length);
 }
}finally{cp.execFile=original;syncBuiltinESMExports()}
