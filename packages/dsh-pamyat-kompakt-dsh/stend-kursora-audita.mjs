// RU: СТЕНД КУРСОРА АУДИТА (A-N-1671). Проверяет, что аудит журнала при старте не перечитывает 7 суток каждый раз:
//     после успешного аудита курсор конца журнала службы сохраняется в <DSH_HOME>/kompakt-dsh/zhurnal-kursor-<агент>.json,
//     следующий старт ищет --after-cursor; курсор старше 7 сут или из будущего, испорченный файл, файл чужой службы — поиск за 7 сут;
//     курсор, который journalctl не принял, — один повтор за 7 сут; провал аудита курсор не сдвигает; отказ «No journal
//     files were found» повторяется через sudo -n. Пробы S1–S3 — на НАСТОЯЩЕМ journalctl и настоящем большом журнале
//     (STEND_BOLSHOJ_UNIT; не меньше 72 000 записей в ДОСТУПНОЙ глубине журнала, ≤ 7 сут — иначе СЛЕПОТА с глубиной и числом,
//     код 2; с 17.10.2026 журнал 2G ≈ 1,5 сут — нужна плотная служба, iskra.service её уже не даёт; в обходе с 3.1.4 —
//     a2a-owner-copy-watch.service, ≈ 157 тыс. записей, S1 там два прохода по ~19 с под таймаутом 30 с каждый), прочие —
//     с подменным journalctl. Реестр и тревога подменены; DSH_HOME — временный каталог стенда, удаляется в конце.
//     Чего не ловит: настоящие правила sudo (их проверяет отдельная проба с подставным /etc/sudoers), ротацию,
//     сделанную во время самого поиска. Код выхода: 0 — сошлось, 1 — расхождение, 2 — слепота.
// EN: AUDIT CURSOR STAND (A-N-1671). Checks that the start-up journal audit does not re-read 7 days every time: after a
//     successful audit the cursor of the service journal's end is saved to <DSH_HOME>/kompakt-dsh/zhurnal-kursor-<agent>.json,
//     the next start searches --after-cursor; a cursor older than 7 days or from the future, a corrupt file, a file of another service — a
//     7-day search; a cursor journalctl rejects — one 7-day retry; a failed audit does not move the cursor; the "No journal
//     files were found" failure is retried via sudo -n. Probes S1–S3 run on the REAL journalctl and a real large journal
//     (STEND_BOLSHOJ_UNIT; at least 72,000 entries within the AVAILABLE journal depth, ≤ 7 days — otherwise BLINDNESS naming
//     depth and count, code 2; since 17.10.2026 the 2G journal holds ≈ 1.5 days — a dense service is needed), the rest
//     on a replacement journalctl. Registry and alert are replaced; DSH_HOME is the stand's temp directory, removed at the
//     end. Not caught: real sudo rules (a separate probe with a substitute /etc/sudoers), rotation during the search
//     itself. Exit code: 0 — passed, 1 — mismatch, 2 — blindness.
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
if (!process.env.DSH_TEST_APP) { console.log('СЛЕПОТА стенда: не задан DSH_TEST_APP — каталог установки платформы'); process.exit(2); }
process.argv[1] = `${process.env.DSH_TEST_APP}/node_modules/@deepseek-ai/dsh/lib/bin.js`;
const BIG=process.env.STEND_BOLSHOJ_UNIT;
if(!/^[a-z][a-z0-9_-]*\.service$/.test(BIG??'')){console.log('СЛЕПОТА стенда: не задан STEND_BOLSHOJ_UNIT — служба с большим журналом');process.exit(2);}
const original=cp.execFile;const JC='/usr/bin/journalctl';
// RU: Глубина журнала службы — её первая видимая запись (журнал 2G с 17.10 ≈ 1,5 сут, не 7); окно счёта — не длиннее 7 сут.
//     Порог — ОБЪЁМ, не сутки: на малом журнале быстрый поиск S1–S3 неотличим от исправного курсора.
// EN: Journal depth of the service — its first visible entry (2G journal since 17.10 ≈ 1.5 days, not 7); the count window is
//     at most 7 days. The threshold is VOLUME, not days: on a small journal a fast S1–S3 search is indistinguishable from a
//     correct cursor.
const pervaya=await new Promise((ok,no)=>{let buf='';const p=cp.spawn(JC,['-u',BIG,'-o','short-unix','-q','--no-pager']);
  p.stdout.on('data',b=>{buf+=b;const i=buf.indexOf('\n');if(i>=0){ok(parseFloat(buf.slice(0,i)));p.kill();}});p.on('error',no);p.on('close',()=>ok(parseFloat(buf)));});
if(!Number.isFinite(pervaya)){console.log(`СЛЕПОТА стенда: в журнале ${BIG} нет ни одной видимой записи — глубину не измерить`);process.exit(2);}
const glub=Math.min(7*86400,Date.now()/1000-pervaya),s_=new Date(pervaya*1000).toISOString().slice(0,16)+'Z',ch=(glub/3600).toFixed(1);
// RU: Счёт записей большого журнала за доступную глубину (≤ 7 сут) — зрячесть подставы (потоком, без буфера).
// EN: Entry count of the large journal over the available depth (≤ 7 days) — the substitute's sightedness (streamed).
const zapisej=await new Promise((ok,no)=>{let n=0;const p=cp.spawn(JC,['-u',BIG,'--since','-7 days','-o','cat','-q','--no-pager']);
  p.stdout.on('data',b=>{for(const c of b)if(c===10)n++;});p.on('error',no);p.on('close',()=>ok(n));});
if(zapisej<72000){console.log(`СЛЕПОТА стенда: журнал ${BIG} виден с ${s_} — глубина ${ch} ч из 168; записей в ней ${zapisej}, нужно не меньше 72000 (объём для S1–S3) — взять службу плотнее (STEND_BOLSHOJ_UNIT)`);process.exit(2);}
console.log(`подстава: ${BIG}, журнал с ${s_} (глубина ${ch} ч из 168), записей ${zapisej}`);
const home=fs.mkdtempSync(path.join(os.tmpdir(),'stend-kursora-'));process.env.DSH_HOME=home;
const NAME='agent-proba';const FILE=path.join(home,'kompakt-dsh','zhurnal-kursor-'+NAME+'.json');
const hex=ms=>(ms*1000).toString(16);
let fails=0;const check=(ok,what)=>{console.log((ok?'PASS ':'FAIL ')+what);if(!ok)fails++;};
// RU: Свой INVOCATION_ID процесса стенда — «наш запуск»: его «Started» аудит обязан отбросить (S12).
// EN: The stand process's own INVOCATION_ID is "our run": the audit must drop its "Started" (S12).
process.env.INVOCATION_ID='stend-nash-zapusk';
// RU: Один старт: свежий экземпляр модуля; запрос прошлого старта (_PID=1) отвечает starty (строки «Started») или,
//     при starty==='real', настоящий journalctl; поиск отвечает poisk (функция) или настоящий journalctl. Ждём строку
//     аудита до 70 с.
// EN: One start: a fresh module instance; the previous-start query (_PID=1) is answered by starty ("Started" lines)
//     or, with starty==='real', by the real journalctl; the search is answered by poisk (a function) or the real
//     journalctl. Waits up to 70 s for the audit line.
let n=0;
// RU: Сверка ид (B-N-1969) — запрос с образцом «^\[kompakt-dsh\s»; в счёт вызовов journalctl/поисков не входит.
// EN: The id check (B-N-1969) — the query with the "^\[kompakt-dsh\s" pattern; not counted as a journalctl call/search.
const SVERKA=a=>a.includes('^\\[kompakt-dsh\\s');
const ST=(ms,inv='prev',pid='1')=>JSON.stringify({__REALTIME_TIMESTAMP:String(ms*1000),_PID:pid,INVOCATION_ID:inv,MESSAGE_ID:'39f53479d3a045ac8e11786248231fbf'});
const start=async (unit,{starty=[],poisk=null}={})=>{const logs=[],alerts=[],calls=[];
  cp.execFile=(file,args,opts,cb)=>{calls.push([file,args]);
    if(file==='/usr/local/bin/agent-registry'){queueMicrotask(()=>cb(null,JSON.stringify(unit)+'\n',''));return;}
    // RU: B-N-1969: при подменном поиске — подменные идентификатор службы (node) и сверка ид (маяк под node); на настоящем
    //     (S1–S3) — настоящие systemctl и journalctl.
    // EN: B-N-1969: with a replaced search — a replaced service identifier (node) and id check (beacon under node); on the real
    //     one (S1–S3) — the real systemctl and journalctl.
    if(file==='/usr/bin/systemctl'&&poisk)return queueMicrotask(()=>cb(null,'SyslogIdentifier=\nExecStart={ path=/usr/local/bin/node ; argv[]=/usr/local/bin/node x ; ignore_errors=no }\n',''));
    if(SVERKA(args)&&poisk)return queueMicrotask(()=>cb(null,JSON.stringify({MESSAGE:'[kompakt-dsh 0.0.0-proba] маяк аудита',SYSLOG_IDENTIFIER:'node'})+'\n',''));
    if(args.includes('_PID=1')&&starty!=='real'){
      if(typeof starty==='function')return queueMicrotask(()=>starty(file,args,cb));
      return queueMicrotask(()=>cb(null,starty.map(x=>x+'\n').join(''),''));}
    if(poisk&&!args.includes('_PID=1'))return queueMicrotask(()=>poisk(file,args,cb));
    return original(file,args,opts,cb);};syncBuiltinESMExports();
  const {installMarker}=await import('./marker-step.mjs?kursor'+(++n));const t0=Date.now();
  installMarker({on(){},get(){}},{name:NAME,log:x=>logs.push(x),alert:async x=>alerts.push(x)});
  while(Date.now()-t0<70000&&!logs.some(x=>/^continuation audit/.test(x)))await new Promise(ok=>setTimeout(ok,50));
  await new Promise(ok=>setTimeout(ok,50));cp.execFile=original;syncBuiltinESMExports();
  const line=logs.find(x=>/^continuation audit/.test(x))??'(нет строки аудита)';
  const jcalls=calls.filter(c=>c[0]!=='/usr/local/bin/agent-registry'&&c[0]!=='/usr/bin/systemctl'&&!SVERKA(c[1]));
  return {line,alerts,calls,ms:Date.now()-t0,jcalls,poiski:jcalls.filter(c=>c[1].includes('--grep')),sverki:calls.filter(c=>SVERKA(c[1]))};};
// RU: Окно последнего поиска: after-cursor | since-7 | since-@<сек>.
// EN: Window of the last search: after-cursor | since-7 | since-@<sec>.
const okno=c=>{const a=c.poiski.at(-1)?.[1]??[];const i=a.indexOf('--since');return a.includes('--after-cursor')?'after-cursor':i>=0?(a[i+1]==='-7 days'?'since-7':'since-'+a[i+1]):'?';};
const saved=()=>{try{return JSON.parse(fs.readFileSync(FILE,'utf8'));}catch{return null;}};
const fail=(code,err)=>Object.assign(Error('probe'),{code,killed:false,signal:null,stderr:err});
const CUR=t=>`s=458598d9f5c24d1b8975591ccacd1819;i=1;b=7bda0ee3ac074f7792c5a434300b5c36;m=1;t=${t};x=1`;
const at=ms=>'since-@'+Math.floor(ms/1000);
const pusto=(f,a,cb)=>cb(null,'','');
try{
 // S1: нет прошлого старта — 7 сут на настоящем большом журнале, укладывается в предел, курсор сохранён.
 let r=await start(BIG,{starty:[]});console.log(`  S1 ${r.ms} мс: ${r.line}`);
 check(r.alerts.length===0&&/: ok,/.test(r.line)&&/окно 7 сут \(нет прошлого старта\)/.test(r.line)&&okno(r)==='since-7','S1 нет старта: 7 сут, без тревоги');
 check(/курсор сохранён/.test(r.line)&&saved()?.unit===BIG&&/;t=[0-9a-f]+;/.test(saved()?.cursor??''),'S1 курсор сохранён в файл');
 const st=fs.existsSync(FILE)&&fs.statSync(FILE);check(st&&(st.mode&0o777)===0o600,'S1 файл курсора 0600');
 // S2: прошлый старт ПОСЛЕ курсора (курсор снят до него) — только после курсора, быстро; вызовов journalctl два.
 r=await start(BIG,{starty:[ST(Date.now()+1000)]});console.log(`  S2 ${r.ms} мс: ${r.line}`);
 check(r.alerts.length===0&&/окно курсор,/.test(r.line)&&okno(r)==='after-cursor'&&r.jcalls.length===2,'S2 курсор не позже старта: --after-cursor, вызовов 2');
 check(r.ms<3000,`S2 укладывается: ${r.ms} мс < 3000`);
 // S2б (kompakt-dsh 3.1.4): сверка ид на пути курсора — окно «--since @<секунда курсора>», не «--after-cursor»: с -n 1 journalctl
 //     курсор не соблюдает и проходит весь журнал службы (так S2 на a2a-owner-copy-watch стоил 20 с при поиске 20 мс).
 const sv2=r.sverki.at(-1)?.[1]??[];
 check(r.sverki.length===0||(sv2.includes('--since')&&!sv2.includes('--after-cursor')),'S2б окно сверки ид на пути курсора — --since, не --after-cursor ('+(r.sverki.length?sv2.slice(2,4).join(' '):'сверки не было: отметки найдены')+')');
 // S3: курсор «после ротации» (нулевые s/b, t = −1 ч), старт позже — journalctl ищет по времени, строк как в контроле.
 const t1=Date.now()-3600e3;const ctrl=since=>new Promise(ok=>original(JC,['-u',BIG,'--since',since,'--grep','\\[continuation-marker\\]','-o','cat','--no-pager'],{maxBuffer:64<<20},(e,o)=>ok(o.split('\n').filter(Boolean).length)));
 fs.mkdirSync(path.dirname(FILE),{recursive:true});fs.writeFileSync(FILE,JSON.stringify({unit:BIG,cursor:'s=00000000000000000000000000000000;i=0;b=00000000000000000000000000000000;m=0;t='+hex(t1)+';x=0'}));
 let c0=await ctrl('@'+Math.floor(t1/1000));r=await start(BIG,{starty:[ST(Date.now())]});let c1=await ctrl('@'+Math.floor(t1/1000));let m=/строк отметок (\d+)/.exec(r.line);console.log(`  S3 ${r.ms} мс: ${r.line}; контроль ${c0}..${c1}`);
 check(r.alerts.length===0&&/окно курсор,/.test(r.line)&&m&&+m[1]>=c0-1&&+m[1]<=c1+1,'S3 курсор чужого файла журнала: поиск по времени, строк как в контроле');
 // S3б: НАСТОЯЩИЙ прошлый старт службы и свежий курсор (позже старта) — окно от прошлого старта, строк как в контроле.
 fs.writeFileSync(FILE,JSON.stringify({unit:BIG,cursor:CUR(hex(Date.now()-5000))}));
 r=await start(BIG,{starty:'real'});const ws=okno(r);console.log(`  S3б ${r.ms} мс: ${r.line}; окно ${ws}`);
 const sinceArg=(r.poiski.at(-1)?.[1]??[])[(r.poiski.at(-1)?.[1]??[]).indexOf('--since')+1];
 c0=await ctrl(sinceArg??'-0s');m=/строк отметок (\d+)/.exec(r.line);
 check(r.alerts.length<=1&&/окно от прошлого старта \(курсор позже прошлого старта\)/.test(r.line)&&/^@\d+$/.test(sinceArg??'')&&m&&Math.abs(+m[1]-c0)<=1,`S3б настоящий старт ${BIG}: окно ${sinceArg}, строк ${m?.[1]} ~ контроль ${c0}`);
 // S11 (подделка, поправка ворот): курсор t = now−60 с, отметка прежнего запуска РАНЬШЕ него, прошлый старт now−10 мин —
 //     аудит обязан искать от прошлого старта и найти отметку (тревога 1).
 const mark=JSON.stringify({MESSAGE:'[kompakt-dsh 0.0.0-proba] [continuation-marker] '+JSON.stringify({agent:NAME,key:'skryto',session:'s',compactionId:'c',phase:'ready',run:'prezhnij'})});
 // B-N-1826 (08.10, Аврора): момент прошлого старта снимается ОДИН раз — прежде at(Date.now()-600e3) считался заново ПОСЛЕ start()
 //   (до 70 с ожидания): при смене секунды Math.floor давал другое число и S11 краснела на исправном курсоре (обход 08.10).
 const t11=Date.now()-600e3;
 fs.writeFileSync(FILE,JSON.stringify({unit:'dsh.service',cursor:CUR(hex(Date.now()-60e3))}));
 r=await start('dsh.service',{starty:[ST(t11)],poisk:(f,a,cb)=>a.includes('--after-cursor')?cb(fail(1,''),'-- cursor: '+CUR(hex(Date.now()))+'\n',''):cb(null,mark+'\n-- cursor: '+CUR(hex(Date.now()))+'\n','')});
 check(r.alerts.length===1&&okno(r)===at(t11)&&/курсор позже прошлого старта/.test(r.line),'S11 курсор «минуту назад»: поиск от прошлого старта, скрытая отметка найдена');
 // S12: «Started» НАШЕГО запуска (INVOCATION_ID процесса) отбрасывается — берётся предыдущий.
 const tPrev=Date.now()-3*3600e3;fs.rmSync(FILE,{force:true});
 r=await start('dsh.service',{starty:[ST(Date.now()-1000,'stend-nash-zapusk'),ST(tPrev)],poisk:pusto});
 check(okno(r)===at(tPrev)&&/окно от прошлого старта,/.test(r.line),'S12 свой запуск отброшен, окно от предыдущего старта');
 // S13: запрос старта не удался / старт старше 7 сут / строка не от PID 1 — 7 сут с причиной.
 r=await start('dsh.service',{starty:(f,a,cb)=>cb(fail(1,'unrecognized failure'),'','unrecognized failure'),poisk:pusto});
 check(okno(r)==='since-7'&&/7 сут \(запрос старта: /.test(r.line)&&r.alerts.length===0,'S13 запрос старта отказал: 7 сут, без тревоги');
 r=await start('dsh.service',{starty:[ST(Date.now()-8*86400e3)],poisk:pusto});check(okno(r)==='since-7'&&/прошлый старт старше 7 сут/.test(r.line),'S13 прошлый старт старше 7 сут: 7 сут');
 r=await start('dsh.service',{starty:[ST(Date.now()-3600e3,'prev','4242')],poisk:pusto});check(okno(r)==='since-7'&&/нет прошлого старта/.test(r.line),'S13 строка не от PID 1 не считается стартом');
 const tS=Date.now()-3600e3;
 // S4: курсор не позже старта, но journalctl его не принял — один повтор от прошлого старта.
 fs.writeFileSync(FILE,JSON.stringify({unit:'dsh.service',cursor:'s=zz;t='+hex(tS-60e3)}));
 r=await start('dsh.service',{starty:[ST(tS)],poisk:(f,a,cb)=>a.includes('--after-cursor')?cb(fail(1,'Failed to seek to cursor: Invalid argument'),'','Failed to seek to cursor: Invalid argument\n'):cb(null,'-- cursor: '+CUR(hex(Date.now()))+'\n','')});
 check(r.alerts.length===0&&r.poiski.length===2&&okno(r)===at(tS)&&/journalctl не принял курсор/.test(r.line)&&/курсор сохранён/.test(r.line),'S4 негодный для journalctl курсор: один повтор от прошлого старта, новый курсор');
 // S5: курсор старше 7 сут / из будущего — негоден, окно от прошлого старта.
 fs.writeFileSync(FILE,JSON.stringify({unit:'dsh.service',cursor:CUR(hex(Date.now()-8*86400e3))}));
 r=await start('dsh.service',{starty:[ST(tS)],poisk:pusto});check(okno(r)===at(tS)&&/курсор негоден: курсор старше 7 сут/.test(r.line)&&r.alerts.length===0,'S5 курсор старше 7 сут: окно от прошлого старта');
 fs.writeFileSync(FILE,JSON.stringify({unit:'dsh.service',cursor:CUR(hex(Date.now()+86400e3))}));
 r=await start('dsh.service',{starty:[ST(tS)],poisk:pusto});check(okno(r)===at(tS)&&/курсор негоден: курсор из будущего/.test(r.line)&&r.alerts.length===0,'S5б курсор из будущего: окно от прошлого старта');
 // S6: файл испорчен / файл чужой службы / файла нет.
 fs.writeFileSync(FILE,'{не json');r=await start('dsh.service',{starty:[ST(tS)],poisk:pusto});check(okno(r)===at(tS)&&/не JSON/.test(r.line),'S6 испорченный файл: окно от прошлого старта');
 fs.writeFileSync(FILE,JSON.stringify({unit:'other.service',cursor:CUR(hex(tS-60e3))}));r=await start('dsh.service',{starty:[ST(tS)],poisk:pusto});check(okno(r)===at(tS)&&/другая служба/.test(r.line),'S6 курсор чужой службы: окно от прошлого старта');
 fs.rmSync(FILE,{force:true});r=await start('dsh.service',{starty:[ST(tS)],poisk:pusto});check(okno(r)===at(tS)&&/окно от прошлого старта, курсор не изменён/.test(r.line)&&!fs.existsSync(FILE),'S6 файла нет, записей нет: от прошлого старта, файл не появился');
 // S7: провал аудита курсор не сдвигает.
 const keep=JSON.stringify({unit:'dsh.service',cursor:CUR(hex(tS-60e3))});fs.writeFileSync(FILE,keep);
 r=await start('dsh.service',{starty:[ST(tS)],poisk:(f,a,cb)=>cb(Object.assign(fail(null,''),{killed:true,signal:'SIGTERM'}),'-- cursor: '+CUR(hex(Date.now()))+'\n','')});
 check(r.alerts.length===1&&fs.readFileSync(FILE,'utf8')===keep,'S7 таймаут: тревога, файл курсора прежний');
 // S8: «No journal files were found» на обоих вызовах — по одному повтору sudo -n на каждый, успех путём sudo.
 fs.rmSync(FILE,{force:true});
 const nf=(f,a,cb,ok)=>f===JC?cb(fail(1,'No journal files were found.\n'),'','No journal files were found.\n'):cb(null,ok,'');
 r=await start('dsh.service',{starty:(f,a,cb)=>nf(f,a,cb,ST(tS)+'\n'),poisk:(f,a,cb)=>nf(f,a,cb,'-- cursor: '+CUR(hex(Date.now()))+'\n')});
 check(r.alerts.length===0&&r.jcalls.filter(c=>c[0]==='/usr/bin/sudo').length===2&&/путь sudo/.test(r.line)&&okno(r)===at(tS),'S8 No journal files were found: sudo на старт и на поиск, успех');
 // S9: форма аргументов sudo — ровно та, что повторяет правило (B-N-1969: поле SYSLOG_IDENTIFIER=<ид> после службы —
 //     правило sudo Варвары меняется тем же окном, 63-varvara-kompakt-audit).
 const sa=r.jcalls.filter(c=>c[0]==='/usr/bin/sudo').map(c=>c[1]);
 check(JSON.stringify(sa[0])===JSON.stringify(['-n','--',JC,'-u','dsh.service','_PID=1','MESSAGE_ID=39f53479d3a045ac8e11786248231fbf','-n','3','-o','json','--no-pager'])
   &&JSON.stringify(sa[1])===JSON.stringify(['-n','--',JC,'-u','dsh.service','SYSLOG_IDENTIFIER=node','--since','@'+Math.floor(tS/1000),'--grep','\\[continuation-marker\\]','-o','json','--no-pager','--show-cursor']),'S9 форма аргументов sudo: запрос старта и поиск');
 // S10: пустая выборка с --show-cursor (код 1, одна строка курсора) — пустая история, курсор сдвинут.
 fs.writeFileSync(FILE,JSON.stringify({unit:'dsh.service',cursor:CUR(hex(tS-60e3))}));const nc=CUR(hex(Date.now()));
 r=await start('dsh.service',{starty:[ST(tS)],poisk:(f,a,cb)=>cb(fail(1,''),'-- cursor: '+nc+'\n','')});
 check(r.alerts.length===0&&okno(r)==='after-cursor'&&/строк отметок 0/.test(r.line)&&saved()?.cursor===nc,'S10 пустая выборка со строкой курсора: ok, курсор сдвинут');
 // S10б (kompakt-dsh 3.1.4): та же пустая выборка по курсору — сверка ид ищет с секунды курсора (t = tS−60 с), без --after-cursor.
 const sv10=r.sverki.at(-1)?.[1]??[];const t10='@'+Math.floor((tS-60e3)/1000);
 check(r.sverki.length===1&&sv10[sv10.indexOf('--since')+1]===t10&&!sv10.includes('--after-cursor'),`S10б сверка ид на пути курсора: --since ${t10}, не --after-cursor (${sv10.join(' ').slice(0,120)})`);
}catch(e){console.log('FAIL исключение: '+(e.stack||e));fails++;}
finally{fs.rmSync(home,{recursive:true,force:true});}
console.log(fails?`ИТОГ: расхождений ${fails}`:'ИТОГ: всё сошлось');process.exit(fails?1:0);
