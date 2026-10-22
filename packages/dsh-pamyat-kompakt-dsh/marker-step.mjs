// RU: ОТМЕТКА ПРОДОЛЖЕНИЯ после сжатия (шаг «а»: только память процесса). После успешного платформенного
//     сжатия, чья сводка начинается с [MODE=ACTIVE], агент мог быть посреди задачи. Модуль один раз будит
//     простаивающего агента и вставляет в его следующий шаг короткое сообщение «продолжи с сохранённого места,
//     если это не отменено». Журнал службы — только диагностика, НЕ очередь восстановления: после перезапуска
//     процесса отметка не восстанавливается, о потерянной отметке лишь сообщается тревогой.
//     Фазы отметки: preparing → ready → offered → consumed; плюс held_external (сначала внешний вход),
//     canceled, superseded (вытеснена новым эпизодом сжатия), held_error (сбой + тревога), lost_on_dispose
//     (процесс завершается раньше принятия). Конечные фазы — в terminal().
// EN: CONTINUATION MARKER after compaction (step "a": process memory only). After a successful platform
//     compaction whose summary starts with [MODE=ACTIVE] the agent may have been in the middle of a task. The
//     module wakes an idle agent once and inserts into its next step a short message "continue from the saved
//     point unless cancelled". The service journal is diagnostics only, NOT a recovery queue: after a process
//     restart the marker is not restored; a lost marker is only reported by an alert.
//     Marker phases: preparing → ready → offered → consumed; plus held_external (external input first),
//     canceled, superseded (displaced by a new compaction episode), held_error (fault + alert),
//     lost_on_dispose (process ends before acceptance). Terminal phases are listed in terminal().
// RU: Зависимости: crypto (ключ отметки), child_process (agent-alert, agent-registry, journalctl, sudo),
//     сообщение платформы, режим Codex.
// EN: Dependencies: crypto (marker key), child_process (agent-alert, agent-registry, journalctl, sudo), the
//     platform message API, the Codex mode.
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
// RU: Сообщения платформы берутся у ТОЙ ЖЕ установки, что и движок в index.mjs: резолвер от зовущего
//     (process.argv[1] — исполняемый файл платформы; запасной — этот модуль). Прежде здесь стоял голый импорт от
//     своих node_modules — два правила на один пакет: при разных версиях платформы и копии плагинов отметка
//     собирала бы сообщение не тем модулем.
// EN: Platform messages come from THE SAME installation as the engine in index.mjs: the resolver from the caller
//     (process.argv[1] is the platform executable; fallback — this module). Previously a bare import from our own
//     node_modules stood here — two rules for one package: with different platform and plugin-copy versions the
//     marker would build a message with the wrong module.
// RU: Резолв пакета платформы в два шага: от зовущего (process.argv[1] — исполняемый файл платформы), при ЛЮБОЙ
//     ошибке — от этого модуля (import.meta.url); не вышло ни так, ни так — громкий отказ с обеими причинами.
//     Прежде запасной путь брался только при ПУСТОМ argv[1]: argv[1], который не путь или не платформа (другая
//     форма запуска), ронял загрузку плагина у всех агентов, хотя пакет разрешался от модуля.
// EN: Two-step resolution of a platform package: from the caller (process.argv[1] is the platform executable), on
//     ANY error — from this module (import.meta.url); neither works — a loud refusal naming both causes.
//     Previously the fallback was used only with an EMPTY argv[1]: an argv[1] that is not a path or not the
//     platform (another launch form) broke plugin loading for every agent, although the package resolved from
//     the module.
const razreshitPlatformy = (imya) => {
  let otZovushchego;
  try { return createRequire(process.argv[1]).resolve(imya); } catch (e) { otZovushchego = String(e?.message ?? e).split("\n")[0]; }
  try { return createRequire(import.meta.url).resolve(imya); }
  catch (e) {
    throw new Error("dsh-pamyat-kompakt-dsh: " + imya + " не разрешается ни от зовущего (" + (process.argv[1] || "argv[1] пуст") +
                    ": " + otZovushchego + "), ни от модуля (" + import.meta.url + ": " + String(e?.message ?? e).split("\n")[0] + ")");
  }
};
const {createUserMessage,freezeMessage}=await import(pathToFileURL(razreshitPlatformy('@deepseek-ai/dsh-llm/message')).href);
import {codexMarkerEnabled,AGENT_ALERT,AGENT_REGISTRY,JOURNALCTL} from './continuation-mode.mjs';
// RU: systemctl — путь в коде, как у sudo (B-N-1969): спрашивается только идентификатор своей службы.
// EN: systemctl — path in code, like sudo (B-N-1969): only the own service's identifier is asked.
const SYSTEMCTL='/usr/bin/systemctl';
// RU: RUN — опознаватель запуска процесса (INVOCATION_ID systemd или случайный): строки прежних запусков в
//     журнале отличаются от строк этого.
// EN: RUN — the process run id (systemd INVOCATION_ID or random): journal lines of earlier runs are told apart
//     from this run's.
const RUN=process.env.INVOCATION_ID||randomUUID();
// RU: slots — по одной отметке на сессию (последний эпизод); audited — имена агентов, для которых аудит журнала
//     уже выполнен в этом процессе.
// EN: slots — one marker per session (the latest episode); audited — agent names whose journal audit already
//     ran in this process.
const slots=new Map(), audited=new Set();
// RU: call — execFile в обещании; ошибка несёт stderr; emptyGrep превращает «нет совпадений» journalctl в
//     пустой ответ.
// EN: call — execFile as a promise; the error carries stderr; emptyGrep turns journalctl "no matches" into an
//     empty answer.
const call=(file,args,opts={},emptyGrep=false)=>new Promise((ok,no)=>execFile(file,args,opts,(e,out,err)=>{
  // RU: journalctl --grep отдаёт код 1, когда совпадений нет: это пустая история, а не недоступный журнал.
  // EN: journalctl --grep returns 1 for no matches: that is an empty history, not an unavailable journal.
  // RU: С --show-cursor пустая выборка печатает одну строку «-- cursor: …» — это тоже пустая история.
  // EN: With --show-cursor an empty selection prints a single "-- cursor: …" line — still an empty history.
  if(emptyGrep&&e?.code===1&&!e.killed&&!e.signal&&err===''&&/^(-- cursor: [^\n]*\n?)?$/.test(out))return ok(out);
  return e?no(Object.assign(e,{stderr:err})):ok(out);
}));
// RU: Тревога владельцу — внешней командой agent-alert (путь задан в коде): 3 попытки по 20 с, паузы 5 и 15 с,
//     весь процесс не дольше 100 с.
// EN: Alert to the owner — external command agent-alert (path set in code): 3 attempts of 20 s, pauses of 5 and
//     15 s, the whole process at most 100 s.
const sendAlert=text=>call(AGENT_ALERT,[text],{timeout:100000,env:{...process.env,AGENT_ALERT_POPYTOK:'3',AGENT_ALERT_TAJMAUT:'20',AGENT_ALERT_PAUZY:'5 15'}});
// RU: Аудит журнала при старте: найти отметки прежних запусков, оставшиеся незакрытыми (процесс умер раньше
//     принятия), и сообщить о них тревогой.
//     Имя СВОЕЙ системной службы берётся из реестра агентов (agent-registry pole <агент> sluzhba --json; 2 с,
//     4096 байт) — угадывать «<имя>.service» нельзя: у части агентов служба называется иначе. Затем journalctl
//     -u <служба>, до 4 МиБ и 30 с на путь.
//     КУРСОР (A-N-1671): поиск по журналу линеен по числу записей службы в окне (iskra 05.10: 7 сут — 110 тыс.
//     записей, 17 с; сутки — 62 тыс., 8,4 с; 6 ч — 9 тыс., 1,8 с). Поэтому после УСПЕШНОГО аудита курсор конца
//     журнала службы (его печатает тот же поиск, --show-cursor) сохраняется в <DSH_HOME или ~/.dsh>/kompakt-dsh/
//     zhurnal-kursor-<агент>.json, и следующий старт ищет только --after-cursor. Окно — не больше 7 сут: курсор
//     старше или из будущего (по его времени t=, запас 5 мин) или испорченный файл — поиск --since -7 days. Курсор, который journalctl не
//     принял («Failed to seek to cursor»), — ОДИН повтор тем же путём за 7 сут. Курсор чужого файла журнала
//     (после ротации) journalctl ищет по времени — это не ошибка. Провал аудита курсор НЕ сдвигает.
//     Чего курсор не лечит: процесс, проживший долго, оставляет к следующему старту столько записей, сколько
//     набралось за его жизнь; первый проход без курсора — все 7 сут. Отсюда предел 30 с на путь (прежде 10).
//     ПРОШЛЫЙ СТАРТ (A-N-1677): курсор лежит в доме агента, и агент может поставить его «минуту назад» — аудит
//     не увидел бы отметок прежнего запуска. Поэтому граница сверяется с меткой, которую агент не ставит: время
//     прошлого запуска службы из сообщения systemd «Started» (_PID=1, MESSAGE_ID 39f53479…, INVOCATION_ID не
//     нашего запуска; поле _PID journald берёт из учётных данных сокета). Курсор не позже прошлого старта —
//     --after-cursor; позже (так и у свежего курсора, снятого при прошлом старте) или негоден — --since
//     @<прошлый старт>; прошлого старта нет в журнале или запрос не удался — --since -7 days.
// EN: Journal audit at start: find markers of earlier runs that stayed open (the process died before
//     acceptance) and report them with an alert.
//     The name of OUR OWN system service comes from the agent registry (agent-registry pole <agent> sluzhba
//     --json; 2 s, 4096 bytes) — guessing "<name>.service" is not allowed: some agents' services have different
//     names. Then journalctl -u <service>, up to 4 MiB and 30 s per path.
//     CURSOR (A-N-1671): the journal search is linear in the number of the service's entries in the window
//     (iskra 05.10: 7 days — 110k entries, 17 s; a day — 62k, 8.4 s; 6 h — 9k, 1.8 s). So after a SUCCESSFUL
//     audit the cursor of the service journal's end (printed by the same search, --show-cursor) is saved to
//     <DSH_HOME or ~/.dsh>/kompakt-dsh/zhurnal-kursor-<agent>.json, and the next start searches --after-cursor
//     only. The window is at most 7 days: a cursor older than that or from the future (by its t=, 5 min margin) or a corrupt file — search
//     --since -7 days. A cursor journalctl rejects ("Failed to seek to cursor") — ONE retry on the same path for
//     7 days. A cursor of another journal file (after rotation) is sought by time — not an error. A failed audit
//     does NOT move the cursor.
//     What the cursor does not fix: a long-lived process leaves as many entries for the next start as it
//     accumulated; the first pass without a cursor covers all 7 days. Hence the 30 s limit per path (was 10).
//     PREVIOUS START (A-N-1677): the cursor lies in the agent's home, and the agent could set it to "a minute
//     ago" — the audit would miss the previous run's markers. So the boundary is checked against a mark the agent
//     does not set: the previous service start from the systemd "Started" message (_PID=1, MESSAGE_ID 39f53479…,
//     INVOCATION_ID not ours; journald takes _PID from the socket credentials). A cursor not later than the
//     previous start — --after-cursor; later (as is a fresh cursor taken at the previous start) or unusable —
//     --since @<previous start>; no previous start in the journal or the query failed — --since -7 days.
const OKNO_MKS=7*24*3600*1e6;
const STARTED='MESSAGE_ID=39f53479d3a045ac8e11786248231fbf';
const kursorFajl=name=>{const home=process.env.DSH_HOME||(process.env.HOME&&path.join(process.env.HOME,'.dsh'));
  return home&&path.join(home,'kompakt-dsh','zhurnal-kursor-'+name+'.json');};
// RU: Сохранённый курсор: null — нет файла; {bad} — файл есть, но негоден (причина в строку журнала).
// EN: Saved cursor: null — no file; {bad} — a file exists but is unusable (the reason goes to the log line).
const prochitatKursor=(file,unit)=>{
  if(!file)return null;
  let raw;try{raw=fs.readFileSync(file,'utf8');}catch(e){return e.code==='ENOENT'?null:{bad:'чтение '+e.code};}
  let v;try{v=JSON.parse(raw);}catch{return {bad:'не JSON'};}
  if(v?.unit!==unit)return {bad:'другая служба'};
  if(typeof v.cursor!=='string'||v.cursor.length>512||!/^[A-Za-z0-9=;]+$/.test(v.cursor))return {bad:'формат курсора'};
  const t=/(?:^|;)t=([0-9a-f]{1,16})(?:;|$)/.exec(v.cursor);if(!t)return {bad:'в курсоре нет t='};
  const vozrast=Date.now()*1000-parseInt(t[1],16);
  if(!(vozrast<=OKNO_MKS))return {bad:'курсор старше 7 сут'};
  // RU: Курсор из будущего (запас 5 мин на часы) негоден: иначе испорченный файл в доме агента навсегда скрыл бы
  //     от аудита всё, что пишется до этого времени.
  // EN: A cursor from the future (5 min clock margin) is unusable: otherwise a corrupted file in the agent's home
  //     would hide everything written before that time from the audit forever.
  if(vozrast< -300e6)return {bad:'курсор из будущего'};
  return {cursor:v.cursor,t:parseInt(t[1],16)};
};
// RU: Запись курсора атомарно (временный файл + rename), каталог 0700, файл 0600 — своей учёткой процесса, не
//     через sudo (файл не меняет хозяина).
// EN: Cursor write is atomic (temp file + rename), directory 0700, file 0600 — by the process's own account, not
//     via sudo (the file does not change owner).
const zapisatKursor=(file,unit,cursor)=>{
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({unit,cursor,saved:new Date().toISOString()})+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
};
const scanJournal=async (name,log)=>{
  const unit=JSON.parse(await call(AGENT_REGISTRY,['pole',name,'sluzhba','--json'],{timeout:2000,maxBuffer:4096}));
  // RU: Ответ реестра проверяется образцом имени службы; иное — отказ (дальше — тревога слепоты).
  // EN: The registry answer is validated against a service-name pattern; anything else is a failure (then a
  //     blindness alert).
  if(typeof unit!=='string'||!/^[a-z][a-z0-9_-]*\.service$/.test(unit))throw Error('invalid own service from registry');
  // RU: ИДЕНТИФИКАТОР (B-N-1969, №7-В1): поиск сужается полем SYSLOG_IDENTIFIER — без него journalctl -u перебирает ВСЕ
  //     записи службы, а у части агентов в том же юните идёт поток чужих строк (zarya 10.10: поток sudo до 121 695 строк/ч,
  //     поиск 42–44 с при пределе 30 с → SIGTERM → тревога на каждом подъёме; с полем — 1,9 с, те же отметки). Значение НЕ
  //     зашито: берётся у службы — systemctl show -p SyslogIdentifier, пусто — basename пути ExecStart (так journald
  //     подписывает вывод службы). Не установлен — отказ (дальше тревога слепоты), а не поиск без поля.
  // EN: IDENTIFIER (B-N-1969, №7-В1): the search is narrowed by the SYSLOG_IDENTIFIER field — without it journalctl -u walks
  //     ALL the service's entries, and some agents have a stream of foreign lines in the same unit (zarya 10.10: a sudo stream of
  //     up to 121,695 lines/h, a 42–44 s search with a 30 s limit → SIGTERM → an alert on every start; with the field — 1.9 s,
  //     the same markers). The value is NOT hard-coded: it comes from the service — systemctl show -p SyslogIdentifier, empty —
  //     basename of the ExecStart path (that is how journald labels the service's output). Not established — a failure (then a
  //     blindness alert), not a search without the field.
  let pokaz;
  try { pokaz=await call(SYSTEMCTL,['show',unit,'-p','SyslogIdentifier','-p','ExecStart','--no-pager'],{timeout:2000,maxBuffer:65536,env:{...process.env,LC_ALL:'C'}}); }
  catch(e) { throw Object.assign(e,{auditReason:'systemctl show: code='+(e.code??e.name)+', signal='+(e.signal??'none')}); }
  const sid=/^SyslogIdentifier=(.*)$/m.exec(pokaz)?.[1]??'',put0=/^ExecStart=\{ path=([^ ;]+) ;/m.exec(pokaz)?.[1]??'';
  const ident=sid||path.basename(put0);
  if(!/^[A-Za-z0-9_.@+-]{1,64}$/.test(ident))throw Object.assign(Error('identifier'),{auditReason:'идентификатор службы не установлен: SyslogIdentifier «'+sid.slice(0,80)+'», путь ExecStart «'+put0.slice(0,120)+'»'});
  // RU: МАЯК: строка «[kompakt-dsh …] маяк аудита: …» пишется ДО поиска (не «continuation audit…» — по этому началу стенды ищут исход аудита). Сверка ниже ищет последнюю строку
  //     «[kompakt-dsh» без поля назад от конца журнала (-n 1) и находит маяк сразу (zarya: 81 мс против 44 с без -n).
  //     Строка не содержит «[continuation-marker]» и в выборку отметок не попадает.
  // EN: BEACON: the line "[kompakt-dsh …] маяк аудита: …" is written BEFORE the search (not "continuation audit…" — the stands look for the audit outcome by that start). The check below looks for
  //     the latest "[kompakt-dsh" line without the field backwards from the journal end (-n 1) and finds the beacon at once
  //     (zarya: 81 ms vs 44 s without -n). The line does not contain "[continuation-marker]" and never enters the marker selection.
  log(`маяк аудита: unit ${unit}, ид ${ident}`);
  // RU: Форма аргументов неизменна (её дословно повторяет правило sudo для агентов без чтения журнала): окно —
  //     ровно «--since -7 days», «--since @<секунды>» или «--after-cursor <курсор>», перед ним «SYSLOG_IDENTIFIER=<ид>»; сверка ид — «-u <служба> <окно> --grep ^\\[kompakt-dsh\\s -n 1 -o json --no-pager»; запрос прошлого старта — ровно
  //     «-u <служба> _PID=1 MESSAGE_ID=39f53479… -n 3 -o json --no-pager».
  // EN: The argument form is fixed (a sudo rule for agents without journal access repeats it verbatim): the
  //     window is exactly "--since -7 days", "--since @<seconds>" or "--after-cursor <cursor>", preceded by "SYSLOG_IDENTIFIER=<id>";
  //     the id check is "-u <service> <window> --grep ^\\[kompakt-dsh\\s -n 1 -o json --no-pager"; the previous-start
  //     query is exactly "-u <service> _PID=1 MESSAGE_ID=39f53479… -n 3 -o json --no-pager".
  const argsFor=okno=>['-u',unit,'SYSLOG_IDENTIFIER='+ident,...okno,'--grep','\\[continuation-marker\\]','-o','json','--no-pager','--show-cursor'];
  const opts={timeout:30000,maxBuffer:4*1024*1024,env:{...process.env,LC_ALL:'C'}};
  const detail=e=>`code=${e.code??e.name}, signal=${e.signal??'none'}, stderr=${String(e.stderr??'').replace(/\s+/g,' ').slice(0,500)}`;
  // RU: Сначала прямое чтение журнала. Только если оно отказало ПО ПРАВАМ (код 1 без сигнала/таймаута и stderr
  //     «insufficient permissions», «Permission denied» или «No journal files were found» — так journalctl
  //     отвечает учётке, которой не видно ни одного файла журнала) — ОДИН повтор через sudo -n с теми же
  //     аргументами. Неизвестная ошибка, таймаут, сигнал, переполнение — не повторяются. LC_ALL=C — чтобы текст
  //     отказа был английским и распознавался.
  // EN: Direct journal read first. Only if it failed ON PERMISSIONS (code 1 without signal/timeout and stderr
  //     "insufficient permissions", "Permission denied" or "No journal files were found" — journalctl's answer
  //     to an account that sees no journal file at all) — ONE retry via sudo -n with the same arguments.
  //     Unknown errors, timeouts, signals and overflow are not retried. LC_ALL=C keeps the failure text in
  //     English so it can be recognised.
  const chitat=async args=>{
    try { return {out:await call(JOURNALCTL,args,opts,true),via:'direct'}; }
    catch(direct) {
      const denied=direct.code===1&&!direct.killed&&!direct.signal&&/insufficient permissions|Permission denied|No journal files were found/i.test(direct.stderr??'');
      if(!denied)throw Object.assign(direct,{auditReason:'journal direct: '+detail(direct)});
      try { return {out:await call('/usr/bin/sudo',['-n','--',JOURNALCTL,...args],opts,true),via:'sudo'}; }
      catch(e) { throw Object.assign(e,{auditReason:'journal direct: '+detail(direct)+'; sudo: '+detail(e)}); }
    }
  };
  // RU: Прошлый старт: последнее «Started» службы с INVOCATION_ID не нашего запуска; старше 7 сут — не берётся.
  // EN: Previous start: the latest "Started" of the service whose INVOCATION_ID is not ours; older than 7 days — ignored.
  let start=null,bezStarta='';
  try {
    const r=await chitat(['-u',unit,'_PID=1',STARTED,'-n','3','-o','json','--no-pager']);
    for(const line of r.out.split('\n').filter(Boolean)){const e=JSON.parse(line);const t=Number(e.__REALTIME_TIMESTAMP);
      if(e._PID==='1'&&e.INVOCATION_ID!==RUN&&Number.isFinite(t)&&(start===null||t>start))start=t;}
    if(start===null)bezStarta='нет прошлого старта';
    else if(Date.now()*1000-start>OKNO_MKS){start=null;bezStarta='прошлый старт старше 7 сут';}
  } catch(e) { bezStarta='запрос старта: '+(e.auditReason||e.code||e.name); }
  const file=kursorFajl(name);const k=prochitatKursor(file,unit);
  const otStarta=prichina=>start===null?{args:['--since','-7 days'],okno:'7 сут ('+bezStarta+(prichina?'; '+prichina:'')+')'}
    :{args:['--since','@'+Math.floor(start/1e6)],okno:'от прошлого старта'+(prichina?' ('+prichina+')':'')};
  let put=k?.cursor&&start!==null&&k.t<=start?{args:['--after-cursor',k.cursor],okno:'курсор'}
    :otStarta(k?.cursor?(start===null?'курсор не сверить':'курсор позже прошлого старта'):k?.bad?'курсор негоден: '+k.bad:'');
  let res;
  try { res=await chitat(argsFor(put.args)); }
  catch(e) {
    if(!(put.args[0]==='--after-cursor'&&e.code===1&&!e.killed&&!e.signal&&/Failed to seek to cursor/i.test(e.stderr??'')))throw e;
    put=otStarta('journalctl не принял курсор');res=await chitat(argsFor(put.args));
  }
  const okno=put.okno;
  // RU: Разбор: строка «-- cursor: …» — курсор конца выборки; из остальных строк journalctl -o json берём MESSAGE
  //     и вынимаем JSON после «[continuation-marker] ». Строка берётся, только если ЦЕЛИКОМ имеет нашу форму
  //     «[kompakt-dsh <версия>] [continuation-marker] {…}» с НАЧАЛА (B-N-1679): в тот же журнал пишут и другие — мост
  //     при отказе инструмента печатает весь результат JSON с выводом команды; прежний образец «…[continuation-marker]
  //     {…}$» без привязки к началу совпадал с такой строкой, JSON.parse падал — и падал весь аудит.
  // EN: Parsing: the "-- cursor: …" line is the cursor of the selection's end; from the other journalctl -o json
  //     lines take MESSAGE and extract the JSON after "[continuation-marker] ". A line is taken only if it WHOLLY has our
  //     form "[kompakt-dsh <version>] [continuation-marker] {…}" from the START (B-N-1679): others write to the same
  //     journal — on a tool failure the bridge prints the whole result JSON with the command output; the old
  //     unanchored pattern "…[continuation-marker] {…}$" matched such a line, JSON.parse threw — and the whole audit failed.
  let novyj=null;
  const rows=res.out.split('\n').filter(Boolean).flatMap(line=>{
    if(line.startsWith('-- cursor: ')){novyj=line.slice(11);return [];}
    const row=JSON.parse(line);const match=/^\[kompakt-dsh [0-9A-Za-z.+-]+\] \[continuation-marker\] (\{[^\n]+\})$/.exec(row.MESSAGE||'');return match?[JSON.parse(match[1])]:[]});
  // RU: Курсор сдвигается только после успешного разбора. Нет строки курсора (в окне нет записей) — прежний файл
  //     остаётся. Не записался — аудит всё равно успешен, причина в строке успеха.
  // EN: The cursor moves only after a successful parse. No cursor line (no entries in the window) — the old file
  //     stays. Write failed — the audit still succeeds, the reason is in the success line.
  // RU: СВЕРКА ИД (признак Вениамина): отметок с полем 0 — это либо их правда нет, либо поле не то. Различает последняя
  //     строка «[kompakt-dsh» без поля в том же окне (её найдёт маяк): подписана другим идентификатором — отказ (тревога
  //     слепоты), курсор не двигается; подписана нашим — «0» честный; строк нет вовсе — сверять нечего, это в строке успеха.
  // EN: ID CHECK (Veniamin's criterion): zero markers with the field means either there really are none or the field is wrong.
  //     The latest "[kompakt-dsh" line without the field in the same window (the beacon finds it) tells them apart: labelled
  //     with another identifier — a failure (blindness alert), the cursor does not move; labelled with ours — the "0" is honest;
  //     no such lines at all — nothing to check, said in the success line.
  // RU: ОКНО СВЕРКИ НА ПУТИ КУРСОРА (kompakt-dsh 3.1.4, (71)+(72), замер Искры 18.10): journalctl systemd 255 при -n 1
  //     НЕ соблюдает --after-cursor — идёт от хвоста назад по всему журналу службы (a2a-owner-copy-watch: поиск по курсору
  //     20 мс, сверка 22 с; на avrora сверка вернула строку раньше курсора). --since границу соблюдает, поэтому на пути
  //     курсора сверка ищет с секунды курсора (t= в мкс): захват до секунды раньше курсора сверке безвреден — она смотрит
  //     только ид последней строки. Форма «--since @<секунды>» уже разрешена правилом sudo (63-varvara-kompakt-audit).
  // EN: ID-CHECK WINDOW ON THE CURSOR PATH (kompakt-dsh 3.1.4): journalctl (systemd 255) with -n 1 does NOT honour
  //     --after-cursor and walks the whole service journal backwards from the tail; --since is honoured, so on the cursor
  //     path the check searches from the cursor's second (t= in µs). Up to one second before the cursor is harmless here.
  //     The "--since @<seconds>" form is already allowed by the sudo rule.
  const oknoSverki=put.args[0]==='--after-cursor'?['--since','@'+Math.floor(k.t/1e6)]:put.args;
  let sverka='по отметкам';
  if(rows.length===0){
    const g=await chitat(['-u',unit,...oknoSverki,'--grep','^\\[kompakt-dsh\\s','-n','1','-o','json','--no-pager']);
    const last=g.out.split('\n').filter(Boolean).map(x=>JSON.parse(x)).pop();
    if(!last)sverka='строк kompakt-dsh в окне нет';
    else if(last.SYSLOG_IDENTIFIER!==ident)throw Object.assign(Error('identifier mismatch'),{auditReason:'строки kompakt-dsh в журнале службы подписаны SYSLOG_IDENTIFIER='+String(last.SYSLOG_IDENTIFIER).slice(0,64)+', а поиск отметок шёл по '+ident+' — «0 отметок» недостоверно'});
    else sverka='последняя строка kompakt-dsh под '+ident;
  }
  let kursor='не изменён';
  if(novyj&&/^[A-Za-z0-9=;]+$/.test(novyj)&&file){try{zapisatKursor(file,unit,novyj);kursor='сохранён';}catch(e){kursor='не сохранён: '+(e.code||e.name);}}
  // RU: След успешного чтения: путь (direct|sudo), окно, число разобранных строк отметок, служба, курсор. N —
  //     записи, а не задачи; строка не содержит «[continuation-marker]» и не попадает в свою же выборку.
  // EN: Trace of a successful read: path (direct|sudo), window, number of parsed marker lines, service, cursor.
  //     N counts records, not tasks; the line does not contain "[continuation-marker]" and never matches its own
  //     query.
  log(`continuation audit: ok, путь ${res.via}, строк отметок ${rows.length}, unit ${unit}, ид ${ident} (сверка: ${sverka}), окно ${okno}, курсор ${kursor}`);
  return rows;
};
// RU: Текст сообщения: строка или текстовые блоки.
// EN: Message text: a string or text blocks.
const textOf=m=>typeof m?.content==='string'?m.content:(m?.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
// RU: Телеграм-плагин сам проверяет отправителя (разрешённые пользователи) ДО того, как кладёт сообщение в эту
//     рамку. Письма агентов приходят как agent-message; подписи к вложениям от плагина — в другой рамке.
//     Неизвестные виды входа отметку НЕ отменяют.
// EN: The Telegram plugin authorizes the sender (allowed users) BEFORE wrapping the message in this envelope.
//     Agent letters arrive as agent-message; plugin attachment captions use a different envelope. Unknown input
//     kinds CANNOT cancel the marker.
// RU: Отмена человеком: ТОЛЬКО команда «/stop» (без учёта регистра; дальше пробел, перевод строки или конец) в
//     НАЧАЛЕ тела личного сообщения Telegram: source.kind = user и рамка «[личный чат, от …]». Обычные слова
//     («стоп», «отмена», STOP), письма агентов, вебхуки и вставки плагинов отметку НЕ отменяют. Не
//     распознаётся: команда в цитате, «/stop!», «/stop@bot», иной транспорт. Подделку source+рамки доверенным
//     плагином эта проверка не обнаруживает.
// EN: Human cancellation: ONLY the command "/stop" (case-insensitive; followed by a space, a newline or the
//     end) at the START of a private Telegram message body: source.kind = user and the envelope "[личный чат,
//     от …]" ("[private chat, from …]"). Ordinary words ("стоп", "отмена", STOP), agent letters, webhooks and
//     plugin insertions do NOT cancel the marker. Not recognised: the command inside a quote, "/stop!",
//     "/stop@bot", another transport. A forged source+envelope by a trusted plugin is not detected by this
//     check.
const stopEvidence=messages=>messages.some(m=>m?.source?.kind==='user'&&/^\[личный чат, от [^\r\n]+\]\r?\n\/stop(?:\s|$)/iu.test(textOf(m)));
// RU: Прежнее письмо-продолжение от шлюза подписки (Codex или Claude) уже принято — отметка не нужна, иначе
//     агента разбудили бы второй раз.
// EN: A legacy continuation letter from the subscription gateway (Codex or Claude) has already been admitted —
//     the marker is not needed, otherwise the agent would be woken twice.
const legacyLetter=messages=>messages.some(m=>/\[шлюз (Codex|Claude) · продолжение после стопа\]/.test(textOf(m)));
// RU: Конечные фазы: из них отметка уже не выходит.
// EN: Terminal phases: the marker never leaves them.
const terminal=s=>['consumed','canceled','superseded','lost_on_dispose','held_error'].includes(s.phase);

// RU: Подключение отметки к движку. Всё, что трогает внешний мир, подаётся параметрами (для стендов): name —
//     имя агента (KOMPAKT_AGENT), log, alert, audit, mode (включён ли Codex), waitMs — срок ожидания принятия
//     при простое (120 с), flushMs — срок записи сессии на диск (30 с).
// EN: Attaching the marker to the engine. Everything that touches the outside world is a parameter (for
//     stands): name — agent name (KOMPAKT_AGENT), log, alert, audit, mode (is Codex enabled), waitMs —
//     acceptance deadline while idle (120 s), flushMs — session flush deadline (30 s).
export function installMarker(ctx,{name=process.env.KOMPAKT_AGENT,log=console.error,alert=sendAlert,audit=scanJournal,
 mode=codexMarkerEnabled,waitMs=120000,flushMs=30000}={}) {
  // RU: local — отметки этого подключения (для dispose); keyOf — ключ слота: агент + сессия + время её
  //     создания.
  // EN: local — markers of this attachment (for dispose); keyOf — slot key: agent + session + its creation
  //     time.
  const local=new Set();
  const keyOf=session=>JSON.stringify([name,session.id,session.header?.createdAt]);
  // RU: record — сменить фазу и написать строку «[continuation-marker] {json}» в журнал службы (её же читает
  //     аудит при следующем старте).
  // EN: record — change the phase and write a "[continuation-marker] {json}" line to the service journal (the
  //     same line the audit reads at the next start).
  const record=(s,phase,reason)=>{if(phase!=='ready'){clearTimeout(s.timer);s.timer=null;}s.phase=phase;log('[continuation-marker] '+JSON.stringify({agent:name,key:s.key,session:s.sid,compactionId:s.cid,phase,reason,run:RUN}));};
  // RU: alarm — одна попытка тревоги на отметку; строка alert-attempt пишется ДО вызова (попытка ≠ доставка),
  //     исход — отдельной строкой.
  // EN: alarm — one alert attempt per marker; the alert-attempt line is written BEFORE the call (attempt ≠
  //     delivery), the outcome — a separate line.
  const alarm=(s,reason)=>{
    if(s.alerted)return;s.alerted=true;
    log('[continuation-marker] '+JSON.stringify({agent:name,key:s.key,session:s.sid,compactionId:s.cid,phase:'alert-attempt',reason,run:RUN}));
    Promise.resolve().then(()=>alert(`отметка продолжения: ${reason}; агент=${name} session=${s.sid} compact=${s.cid}; автоматический повтор запрещён`))
      .then(()=>log(`continuation alert: command_ok key=${s.key}`),e=>log(`continuation alert: command_failed key=${s.key} code=${e.code||e.name}`));
  };
  // RU: cancel — тихая отмена (без тревоги); hold — отказ со сбоем: фаза held_error и тревога.
  // EN: cancel — quiet cancellation (no alert); hold — failure: phase held_error and an alert.
  const cancel=(s,reason)=>{if(terminal(s))return;clearTimeout(s.timer);record(s,'canceled',reason);s.session=null;};
  // RU: supersede — вытеснение новым эпизодом: своя конечная фаза superseded (прежде писалась canceled).
  // EN: supersede — displacement by a new episode: its own terminal phase superseded (previously written as canceled).
  const supersede=s=>{if(terminal(s))return;clearTimeout(s.timer);record(s,'superseded','superseded by next compaction');s.session=null;};
  const hold=(s,reason)=>{if(terminal(s))return;clearTimeout(s.timer);record(s,'held_error',reason);alarm(s,reason);s.session=null;};
  // RU: history — журнал сессии: через службу ядра памяти (pamyat.sobytiyaSessii), иначе snapshotEvents() или
  //     events; нет — исключение.
  // EN: history — the session journal: via the memory core service (pamyat.sobytiyaSessii), otherwise
  //     snapshotEvents() or events; none — an exception.
  const history=session=>{let pm;try{pm=ctx.get?.('pamyat')}catch{};const es=pm?.sobytiyaSessii?pm.sobytiyaSessii(session):session.snapshotEvents?.()??session.events;if(!Array.isArray(es))throw Error('history unavailable');return es;};
  // RU: flush — дождаться записи сессии на диск (служба sessions.flush) не дольше flushMs; ответ обязан быть
  //     ровно true.
  // EN: flush — wait for the session to be written to disk (service sessions.flush) for at most flushMs; the
  //     answer must be exactly true.
  const flush=async session=>{let timer;try{const store=ctx.get?.('sessions');if(typeof store?.flush!=='function')throw Error('sessions.flush absent');const done=await Promise.race([store.flush(session),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('flush timeout')),flushMs)})]);if(done!==true)throw Error('flush unconfirmed');}finally{clearTimeout(timer)}};
  // RU: agentFor — живой агент сессии; pending — есть ли в его ящике входящие на следующий ход или шаг.
  // EN: agentFor — the live agent of the session; pending — whether its inbox holds input for the next turn or
  //     step.
  const agentFor=session=>{try{return ctx.get?.('agents')?.get(session.id)}catch{return undefined}};
  const pending=agent=>((agent?.inbox?.nextTurn?.length??0)+(agent?.inbox?.nextStep?.length??0))>0;
  // RU: allowed — маршрут, на котором отметка разрешена: provider claude-oauth и модель claude-* всегда; модель
  //     gpt-* (Codex) — только если агент включён в файле режима (continuation-mode.mjs).
  // EN: allowed — routes where the marker is allowed: provider claude-oauth with model claude-* always; model
  //     gpt-* (Codex) only if the agent is enabled in the mode file (continuation-mode.mjs).
  const allowed=session=>{const c=session.requestHeader?.()?.config;if(c?.provider!=='claude-oauth')return false;return c.model?.startsWith('claude-')||(c.model?.startsWith('gpt-')&&mode(name));};
  // RU: wake — разбудить простаивающего агента (в микрозадаче). Отказы по порядку: агента нет → held_error;
  //     есть входящие → held_external; агент занят → ждём следующего idle; последний ход не completed → отмена;
  //     уже 2 побудки → held_error; нет wakeDriver → held_error. Срок waitMs заводится только при idle + ready
  //     и пустом ящике: не принято за срок → held_error и тревога.
  // EN: wake — wake an idle agent (in a microtask). Refusals in order: no agent → held_error; pending input →
  //     held_external; agent busy → wait for the next idle; last turn not completed → cancel; already 2 wakes →
  //     held_error; no wakeDriver → held_error. The waitMs deadline is armed only at idle + ready with an empty
  //     inbox: not accepted in time → held_error and an alert.
  function wake(s){queueMicrotask(()=>{ try {
    if(s.phase!=='ready'||!s.session)return;const agent=agentFor(s.session);
    if(!agent){hold(s,'live agent unavailable');return;}
    if(pending(agent)){record(s,'held_external','pending input');return;}
    if(agent.status!=='idle')return;
    const last=history(s.session).findLast(e=>e.type==='turn/end')?.data?.reason?.kind;
    if(last&&last!=='completed'){cancel(s,'last turn '+last);return;}
    if(s.wakes>=2){hold(s,'wake limit 2');return;}
    if(typeof agent.wakeDriver!=='function'){hold(s,'wakeDriver unavailable');return;}
    if(!s.timer){s.timer=setTimeout(()=>{s.timer=null;if(s.phase==='ready'&&agent.status==='idle'&&!pending(agent))hold(s,'idle ready not accepted in '+waitMs+' ms');},waitMs);s.timer.unref?.();}
    s.wakes++;record(s,'ready','wake '+s.wakes);agent.wakeDriver();
  } catch(e) { hold(s,'wake '+e.message); } });}
  // RU: Пресет платформы активируется сразу при старте процесса, поэтому разрешён ОДИН диагностический просмотр
  //     журнала при запуске. Задачи не восстанавливаются, состояние не переносится, таймер опроса не заводится.
  // EN: The platform preset is activated eagerly at process start, so ONE diagnostic journal scan at start-up
  //     is allowed. No task is reconstructed, no state is migrated, no polling timer is started.
  // RU: Аудит — один раз на имя агента в процессе. Незакрытая отметка прежнего запуска, о которой ещё не было
  //     alert-attempt, → тревога. Аудит недоступен → строка с пределами и тревога слепоты.
  // EN: Audit — once per agent name per process. An open marker of an earlier run without an alert-attempt →
  //     alert. Audit unavailable → a line with the limits and a blindness alert.
  if(/^[a-z][a-z0-9_-]*$/.test(name??'')&&!audited.has(name)){
    audited.add(name);
    Promise.resolve().then(()=>audit(name,log)).then(rows=>{
      const last=new Map(),warned=new Set();
      for(const r of rows){if(r.agent!==name||r.run===RUN)continue;if(r.phase==='alert-attempt')warned.add(r.key);else last.set(r.key,r)}
      for(const s of last.values())if(!['consumed','canceled','superseded'].includes(s.phase)&&!warned.has(s.key))alarm({...s,sid:s.session,cid:s.compactionId},'restart: прежняя отметка не закрыта в журнале, в памяти она потеряна');
    }).catch(e=>{const reason=e.auditReason||e.code||e.name;log(`continuation audit unavailable: ${reason}; предел: реестр 2 с, systemctl 2 с; журнал 7 дней/4 МиБ/30 с на путь, до 184 с всего (запрос старта, поиск, сверка ид), до 244 с при повторе за негодный курсор`);alarm({key:'audit-'+name+'-'+RUN,sid:'?',cid:'?'},'restart audit unavailable: '+reason);});
  }
  // RU: Событие сессии: успешный compaction/end на разрешённом маршруте создаёт отметку; прочие события двигают
  //     уже созданную.
  // EN: Session event: a successful compaction/end on an allowed route creates a marker; other events advance
  //     an existing one.
  ctx.on('session/event',async(session,event)=>{
    let s=slots.get(keyOf(session));
    try{
      if(event.type==='compaction/end'&&event.data?.error===undefined&&allowed(session)){
        // RU: Отметка создаётся только по ДОЛГОВЕЧНЫМ следам: своя compaction/summary этого compactionId (после
        //     унаследованной части журнала), compaction/end без error и сообщение-замена compact-checkpoint,
        //     ссылающееся на эту summary. error: null успехом НЕ считается.
        // EN: A marker is created only from DURABLE traces: our own compaction/summary of this compactionId
        //     (after the inherited part of the journal), compaction/end without error, and the
        //     compact-checkpoint replacement message referring to that summary. error: null is NOT success.
        const es=history(session),inherited=session.inheritedEventCount??session.header?.seedLength??0;
        const summary=es.find(e=>e.type==='compaction/summary'&&e.seq>=inherited&&e.seq<event.seq&&e.data?.compactionId===event.data?.compactionId);
        if(!summary||!event.data?.compactionId||!es.some(e=>e.type==='compaction/end'&&e.seq===event.seq&&e.data?.compactionId===event.data.compactionId&&e.data?.error===undefined))return;
        const checkpoint=es.find(e=>e.type==='user/message'&&e.seq>summary.seq&&e.seq<event.seq&&e.data?.source?.kind==='compact-checkpoint'&&e.sourceEventSeqs?.includes(summary.seq));
        if(!checkpoint){log('continuation marker refused: checkpoint replacement absent');return;}
        // RU: Тот же эпизод или более старый — ничего не делаем; новый эпизод вытесняет прежнюю отметку (фаза
        //     superseded, причина «superseded by next compaction»).
        // EN: The same or an older episode — do nothing; a new episode supersedes the previous marker (phase
        //     superseded, reason «superseded by next compaction»).
        if(s&&(s.cid===event.data.compactionId||s.endSeq>=event.seq))return;
        if(!/^[a-z][a-z0-9_-]*$/.test(name??'')||!session.id||session.header?.createdAt==null||!Number.isSafeInteger(event.seq))throw Error('marker identity absent');
        if(s){if(!terminal(s))supersede(s);local.delete(s);}
        // RU: Режим из первой строки сводки: DIALOG — отмена; нет метки или иная — отмена со строкой журнала,
        //     без тревоги; ACTIVE — дальше.
        // EN: Mode from the first summary line: DIALOG — cancel; missing or other — cancel with a log line, no
        //     alert; ACTIVE — continue.
        const text=(summary.data.summary??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');const m=/^\[MODE=(ACTIVE|DIALOG)\][ \t]*(?:\r?\n|$)/u.exec(text)?.[1];
        const key=createHash('sha256').update(JSON.stringify([name,session.id,session.header.createdAt,event.data.compactionId])).digest('hex');
        s={key,sid:session.id,cid:event.data.compactionId,endSeq:event.seq,summarySeq:summary.seq,checkpointId:checkpoint.data.id,session,phase:'preparing',wakes:0,alerted:false,messageId:'continuation-'+key};slots.set(keyOf(session),s);local.add(s);
        record(s,'preparing');
        if(m==='DIALOG'){cancel(s,'MODE=DIALOG');return;}if(m!=='ACTIVE'){cancel(s,'MODE unknown: continuation skipped, log only');return;}
        // RU: ACTIVE: дождаться записи сессии на диск, затем ready и побудка; сбой записи — held_error.
        // EN: ACTIVE: wait for the session flush, then ready and wake; a flush failure — held_error.
        const own=s;s.ready=flush(session).then(()=>{if(own.phase!=='preparing')return;record(own,'ready');wake(own);}).catch(e=>hold(own,'compaction '+e.message));await s.ready;
      } else if(s&&!terminal(s)){
        // RU: Принятие: пришло user/message с НАШИМ id в фазе offered — ещё раз flush, и только тогда consumed.
        //     Это принятие входа, а не доказательство, что модель задачу выполнила.
        // EN: Acceptance: a user/message with OUR id arrived in phase offered — flush again, and only then
        //     consumed. This is acceptance of the input, not proof that the model completed the task.
        if(event.type==='user/message'&&event.data?.id===s.messageId&&s.phase==='offered'&&!s.accepting){
          s.accepting=true;await flush(session);if(s.phase!=='offered')return;clearTimeout(s.timer);record(s,'consumed','id+flush confirmed');s.session=null;
        }
        // RU: Конец хода: не completed — отмена; завершён внешний ход, ради которого ждали (held_external), —
        //     снова ready и побудка.
        // EN: Turn end: not completed — cancel; the external turn we were waiting for has finished
        //     (held_external) — ready again and wake.
        if(event.type==='turn/end'){
          const reason=event.data?.reason?.kind;
          if(reason&&reason!=='completed'){cancel(s,'turn '+reason);return;}
          if(s.phase==='held_external'&&s.externalTurn===event.data?.turn){record(s,'ready','external input processed');wake(s);}
        }
      }
    }catch(e){if(s)hold(s,'event '+e.message);else log(`continuation marker refused: ${e.code||e.name}: ${String(e?.message??'').slice(0,200)}`)}
  });
  // RU: Статус агента: idle — попытка побудки; любой другой — срок ожидания снимается.
  // EN: Agent status: idle — try to wake; anything else — the deadline is cleared.
  ctx.on('agent/status',({agent,status})=>{const s=agent?.session&&slots.get(keyOf(agent.session));if(s){if(status==='idle')wake(s);else{clearTimeout(s.timer);s.timer=null;}}});
  // RU: Читатель отметки — agent/pre-step. Сначала await next(): приоритет остаётся у шлюзов приёма/отмены
  //     платформы. Затем по порядку: отказ/прерывание — отмена; маршрут больше не разрешён — отмена; принятое
  //     письмо шлюза — отмена; «/stop» человека — отмена; есть внешний вход — held_external (сначала он); иначе
  //     — вставляем наше сообщение ПЕРВЫМ и переходим в offered.
  // EN: The marker reader is agent/pre-step. First await next(): the platform's receipt/cancel gates keep
  //     priority. Then in order: rejected/aborted — cancel; route no longer allowed — cancel; gateway letter
  //     admitted — cancel; human "/stop" — cancel; external input present — held_external (it goes first);
  //     otherwise insert our message FIRST and switch to offered.
  ctx.on('agent/pre-step',async({agent,messages=[],turn,signal},next)=>{
    let decision;
    try{decision=await next();}catch(e){const s=slots.get(keyOf(agent.session));if(s)cancel(s,'pre-step gate threw');throw e;}
    const s=slots.get(keyOf(agent.session));if(!s||terminal(s))return decision;
    if(decision.kind!=='enter'||signal?.aborted){cancel(s,'pre-step rejected/aborted');return decision;}
    await s.ready;
    if(signal?.aborted){cancel(s,'pre-step aborted while awaiting readiness');return decision;}
    if(terminal(s)||!['ready','held_external'].includes(s.phase))return decision;
    try { if(!allowed(agent.session)){cancel(s,'route/mode changed');return decision;} }
    catch(e) { hold(s,'route/mode unreadable');return decision; }
    if(legacyLetter(messages)){cancel(s,'legacy Codex letter already admitted');return decision;}
    if(stopEvidence(messages)){cancel(s,'explicit /stop in Telegram user input');return decision;}
    if(messages.length||pending(agent)){s.externalTurn=turn;record(s,'held_external','external input first');return decision;}
    if(s.phase==='held_external')return decision;
    // RU: Текст вставки: указание продолжить незавершённую задачу, только если она не отменена; действующие
    //     STOP и отмены сильнее отметки.
    // EN: Insertion text: an instruction to continue the unfinished task only if it was not cancelled; active
    //     STOPs and cancellations override the marker.
    const text=`После успешного платформенного сжатия есть незавершённая задача: checkpoint ${s.cid}, summary seq ${s.summarySeq}. Продолжи с сохранённого места, только если это не отменено текущими указаниями. Действующие STOP и отмены сильнее этой отметки. Если задача уже закончена, новых дел не начинай.`;
    // RU: createUserMessage заменяет любой переданный id; поэтому замораживаем копию с НАШИМ id
    //     (continuation-<sha256>) — по нему потом узнаём принятие.
    // EN: createUserMessage replaces any supplied id; so we freeze a copy with OUR id (continuation-<sha256>) —
    //     it is how acceptance is recognised later.
    const message=freezeMessage({...createUserMessage({content:[{type:'text',text}],source:{kind:'plugin:dsh-pamyat-kompakt-dsh',form:'snapshot',sections:[{name:'continuation',text}]}}),id:s.messageId});
    record(s,'offered','awaiting durable user/message');return{...decision,messages:[message,...decision.messages]};
  });
  // RU: Завершение области/процесса: незакрытая отметка → lost_on_dispose и одна попытка тревоги.
  // EN: Scope/process disposal: an open marker → lost_on_dispose and one alert attempt.
  ctx.on('dispose',()=>{for(const s of local)if(!terminal(s)){clearTimeout(s.timer);record(s,'lost_on_dispose','process/scope ending before acceptance');alarm(s,'process/scope ending before acceptance');s.session=null;}});
  // RU: Наружу: state(сессия) — текущая отметка (для стендов); dispose() — снять таймеры.
  // EN: Exported: state(session) — the current marker (for stands); dispose() — clear timers.
  return {state:session=>slots.get(keyOf(session)),dispose(){for(const s of local)clearTimeout(s.timer)}};
}
