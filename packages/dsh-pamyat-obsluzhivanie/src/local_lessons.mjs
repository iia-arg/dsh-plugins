// RU: local_lessons.mjs — мост ступени уроков к ЛОКАЛЬНОЙ памяти агента (ядро dsh-pamyat-core).
// EN: local_lessons.mjs — bridge from the lessons stage to the agent's LOCAL memory (dsh-pamyat-core).
// RU: Кто зовёт: lessons.py (функция local), отдельным процессом node на каждый блок урока; работает под той же
// RU: учётной записью, что ночная служба обслуживания (omega). Протокол: один JSON-запрос на stdin, один JSON-ответ
// RU: на stdout; при отказе — {"error": "<код>"} и код возврата 1.
// EN: Caller: lessons.py (function local), as a separate node process per lesson block; runs under the same account
// EN: as the nightly maintenance service (omega). Protocol: one JSON request on stdin, one JSON reply on stdout;
// EN: on refusal — {"error": "<code>"} and exit code 1.
// RU: Операции (q.op):
// RU:   prepare — прогнать тело через настоящее ядро в базе ':memory:' и вернуть канонический текст и его sha256
// RU:             (та же маска/фильтр, что при настоящей записи); на диск НЕ пишет;
// RU:   get     — найти уже сохранённую запись агента по источнику (только чтение), {id:null} если нет;
// RU:   save    — если записи по источнику нет — записать урок через ядро и перечитать; если есть — вернуть её, второй
// RU:             записи не делает (восстановление после обрыва между локальной записью и квитанцией);
// RU:   link    — после подтверждения OMEGA (lessons_store: корень, точный текст, ключ источника) записать связь
// RU:             svyaz_omega штатным hranilishche.svyazat ядра и исход в журнал ядра: dostavleno/dolgovremennyj-sloj
// RU:             (урок записан этим проходом) или dostavleno/podtverzhdeno-chteniem (найден в OMEGA); legacy-запись
// RU:             (без source_key) — связь kak=vosstanovleno-tekstom. Связь с другим mem — не меняется: отметка
// RU:             svyaz-omega-konflikt и отказ link_conflict. Повтор той же связи — без второй отметки.
// EN: Operations (q.op):
// EN:   prepare — run the body through the real core in an ':memory:' database and return the canonical text and its
// EN:             sha256 (same masking/filter as a real write); writes NOTHING to disk;
// EN:   get     — look up the agent's stored record by source (read-only), {id:null} if absent;
// EN:   save    — if no record exists for the source, write the lesson via the core and re-read it; if one exists,
// EN:             return it without a second write (recovery after a break between local write and receipt);
// EN:   link    — after OMEGA confirmation write the svyaz_omega link via the core's hranilishche.svyazat and the
// EN:             outcome into the core journal; a link to another mem is never changed (link_conflict).
// RU: Только локальный API: ни прежнего адаптера OMEGA, ни прежней очереди доставки — запись в OMEGA делает
// RU: lessons_store.py отдельно и точно.
// EN: Local API only: no legacy OMEGA adapter or legacy delivery queue — OMEGA is written separately and exactly
// EN: by lessons_store.py.
// RU: НЕ предотвращает: гонку двух писателей между чтением и записью (замка между ними здесь нет) — второй увидит
// RU: дубль только перечитыванием после своей записи (local_not_verified), запись к тому моменту уже сделана.
// RU: Ступень уроков от этого защищена своим замком писателя в lessons.py, посторонние писатели — нет.
// EN: Does NOT prevent: a race of two writers between read and write (no lock between them here) — the second one
// EN: sees the duplicate only when re-reading after its own write (local_not_verified); the write is already done.
// EN: The lessons stage is protected by its own writer lock in lessons.py; foreign writers are not.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
// RU: stdout — канал протокола; диагностику ядра в stderr глушим, чтобы ответом была одна строка JSON.
// EN: stdout is the protocol channel; core diagnostics on stderr are silenced so the reply is a single JSON line.
console.error=()=>{};
// RU: Ядро грузится динамическим импортом по имени пакета (по обычным правилам разрешения модулей Node).
// EN: The core is loaded by dynamic import by package name (standard Node module resolution).
const {apply,Config}=await import('dsh-pamyat-core/src/index.js');
// RU: Фильтр входа ядра: поиск секретов и служебных меток — им же проверяется строка источника.
// EN: The core's input filter: secret and service-marker detection — used here to check the source string.
const {najti_sekret,proverit_sluzhebnoe}=await import('dsh-pamyat-core/src/filtr-vhoda.js');
const sha=s=>createHash('sha256').update(s).digest('hex');
// RU: Предел входа — 1 000 000 знаков JS (UTF-16), считается по ходу чтения.
// EN: Input limit — 1,000,000 JS (UTF-16) characters, counted while reading.
// RU: 🔴 stdin читается как UTF-8 через setEncoding: декодер держит неполный многобайтный знак до следующего куска.
// RU: Прежде куски-Buffer склеивались в строку по одному, и кириллический знак на границе куска (~64 КиБ) становился
// RU: U+FFFD — prepare и save получали разный текст. Превышение предела не бросается здесь, а отмечается и бросается
// RU: внутри try ниже: вызывающий получает JSON {"error":"input_limit"}, а не пустой stdout.
// RU: Чего НЕ ловит: вход, который не является UTF-8, — неверные байты по-прежнему станут U+FFFD.
// EN: 🔴 stdin is read as UTF-8 via setEncoding: the decoder holds an incomplete multi-byte character until the next
// EN: chunk. Before, Buffer chunks were joined into the string one by one, and a Cyrillic character on a chunk boundary
// EN: (~64 KiB) became U+FFFD — prepare and save got different text. Exceeding the limit is not thrown here but flagged
// EN: and thrown inside the try below: the caller gets JSON {"error":"input_limit"}, not an empty stdout.
// EN: Does NOT catch: input that is not UTF-8 — invalid bytes still become U+FFFD.
process.stdin.setEncoding('utf8');
let input='',tooLong=false;for await(const chunk of process.stdin){input+=chunk;if(input.length>1000000){tooLong=true;break;}}
// RU: Функции уборки, возвращённые эффектами ядра; вызываются в finally.
// EN: Cleanup functions returned by core effects; called in finally.
let clean=[];
try {
 if(tooLong)throw Error('input_limit');
 const q=JSON.parse(input);
 // RU: Проверка запроса: известная операция, имя агента по маске [-a-z0-9_], источник — строка не длиннее 2000.
 // EN: Request check: known operation, agent name matching [-a-z0-9_], source is a string of at most 2000 chars.
 if(!['prepare','get','save','link'].includes(q.op)||!/^[-a-z0-9_]+$/.test(q.agent)||typeof q.source!=='string'||q.source.length>2000)throw Error('input');
 // RU: Источник (путь файла уроков и заголовок) сам попадает в память — он не должен нести секрет или служебную метку.
 // EN: The source (lesson file path and heading) is itself stored — it must not carry a secret or a service marker.
 if(najti_sekret(q.source)||proverit_sluzhebnoe('istochnik',q.source))throw Error('unsafe_source');
 // RU: prepare работает только в памяти процесса; get/save — по настоящей базе агента.
 // EN: prepare works only in process memory; get/save use the agent's real database.
 const db=q.op==='prepare'?':memory:':q.db;
 // RU: База обязана существовать по абсолютному пути: ступень уроков не создаёт локальную память агента.
 // EN: The database must exist at an absolute path: the lessons stage does not create the agent's local memory.
 if(db!==':memory:'&&(!isAbsolute(db)||!existsSync(db)))throw Error('local_db_absent');
 // RU: Ни одно звено пути не должно быть символической ссылкой (realpath обязан совпасть с лексическим путём).
 // EN: No path component may be a symbolic link (realpath must equal the lexical path).
 if(db!==':memory:'&&realpathSync(db)!==resolve(db))throw Error('local_db_symlink');
 let found=[];
 if(q.op!=='prepare'){
  // RU: Отдельное соединение только на чтение: ищем записи агента с тем же источником.
  // EN: Separate read-only connection: look for the agent's records with the same source.
  const read=new DatabaseSync(db,{readOnly:true});
  try {found=read.prepare('select id,klass,soderzhim from zapisi where agent=? and istochnik=?').all(q.agent,q.source);}finally{read.close();}
  // RU: Источник — ключ идентичности урока в локальной памяти: больше одной записи — отказ, не выбор.
  // EN: The source is the lesson's identity key in local memory: more than one record is a refusal, not a choice.
  if(found.length>1)throw Error('local_duplicate_source');
  // RU: Запись с тем же источником, но не класса urok или с иным текстом, чем ожидает вызывающий, — конфликт.
  // EN: A record with the same source but not of class urok, or with a different text than the caller expects, is a conflict.
  if(found.length&&(found[0].klass!=='urok'||(q.expected!==undefined&&found[0].soderzhim!==q.expected)))throw Error('local_source_conflict');
 }
 if(q.op==='link'){
  // RU: Связь ставится только к той самой локальной записи урока, что вернул save/get этого блока.
  // EN: The link goes only to the very local lesson record returned by save/get for this block.
  if(!Number.isSafeInteger(q.local_id)||typeof q.mem_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(q.mem_id)
     ||!['put','lookup'].includes(q.sposob)||typeof q.legacy!=='boolean')throw Error('input');
  if(found.length!==1||found[0].id!==q.local_id)throw Error('local_link_mismatch');
  const {otkrytHranilishche}=await import('dsh-pamyat-core/src/hranilishche.js');
  const {zavestiZhurnal}=await import('dsh-pamyat-core/src/zhurnal.js');
  const h=otkrytHranilishche(db);clean.push(()=>h.zakryt());
  const kak=q.legacy?'vosstanovleno-tekstom':'dostavka';
  const r=h.svyazat({zapis_id:q.local_id,mem_id:q.mem_id,kak});
  const zh=zavestiZhurnal(h.baza);
  if(r.ishod==='konflikt'){
   zh.otmetit({agent:q.agent,klass:'urok',ishod:'ne-udalos-proverit',priroda:'svyaz-omega-konflikt',
    pochemu:'урок в OMEGA '+q.mem_id+', но запись '+q.local_id+' уже связана с '+r.byla.mem_id+' — связь не меняю',istochnik:q.source});
   throw Error('link_conflict');
  }
  if(r.ishod==='svyazano')zh.otmetit({agent:q.agent,klass:'urok',ishod:'dostavleno',
   priroda:q.sposob==='put'?'dolgovremennyj-sloj':'podtverzhdeno-chteniem',
   pochemu:'урок в OMEGA '+q.mem_id+(q.sposob==='put'?' записан':' найден')+' службой обслуживания: корень, текст'+(q.legacy?'':' и ключ источника')
    +' сверены чтением; связь записана ('+kak+'). Отметка «не смонтирован» при save — про процесс службы, где слоя OMEGA нет по устройству',
   istochnik:q.source});
  console.log(JSON.stringify({linked:r.ishod,kak}));
 }else if(q.op==='get'||found.length){
  // RU: get, или save при уже существующей записи: вернуть найденное без записи.
  // EN: get, or save when the record already exists: return what was found, no write.
  console.log(JSON.stringify(found.length?{id:found[0].id,text:found[0].soderzhim,sha:sha(found[0].soderzhim)}:{id:null}));
 }else{
  // RU: prepare или save новой записи. Предел тела — 200 000 знаков JS; пустое тело — отказ.
  // EN: prepare, or save of a new record. Body limit — 200,000 JS characters; an empty body is a refusal.
  if(typeof q.body!=='string'||!q.body||q.body.length>200000)throw Error('body_limit');
  // RU: Поднимаем настоящее ядро с минимальным подставным контекстом платформы: services собирает то, что ядро
  // RU: предоставляет, эффекты исполняются сразу, их уборка копится в clean. Вопрос разрешения отключён.
  // EN: Bring up the real core with a minimal stub platform context: services collects what the core provides,
  // EN: effects run immediately and their cleanups accumulate in clean. Permission prompting is disabled.
  const services={};
  apply({on(){},provide:(k,v)=>services[k]=v,get:k=>services[k],effect:f=>clean.push(f())},Config({agent:q.agent,putBazy:db,otvechatNaSprosRazresheniya:false}));
  services.pamyat.zapisat({klass:'urok',soderzhim:q.body,istochnik:q.source,otvechayushchegoNetVVyzove:true});
  // RU: Перечитывание после записи: ровно одна запись класса urok по источнику. Ответ «записано» не доказательство.
  // EN: Re-read after the write: exactly one record of class urok for the source. A "written" reply is not proof.
  const rows=services.pamyat.poIstochniku(q.source);
  if(rows.length!==1||rows[0].klass!=='urok')throw Error('local_not_verified');
  // RU: Текст записи обязан совпасть с каноническим текстом из prepare (передан как expected).
  // RU: Граница: эта проверка идёт ПОСЛЕ записи — при несовпадении запись в базе уже есть.
  // EN: The stored text must equal the canonical text from prepare (passed as expected).
  // EN: Boundary: this check runs AFTER the write — on mismatch the record is already in the database.
  if(q.expected!==undefined&&rows[0].soderzhim!==q.expected)throw Error('local_content_changed');
  console.log(JSON.stringify({id:rows[0].id,text:rows[0].soderzhim,sha:sha(rows[0].soderzhim)}));
 }
// RU: Наружу уходит только код отказа: сообщение вида [a-z_]+, иначе e.code, иначе 'local_refused' — без текста урока.
// RU: B-N-1831: для кодов ERR_SQLITE_* — ещё detail, текст ошибки (до 300 знаков): сообщения SQLite не несут данных
// RU: записи, а без текста «database is locked» неотличим от любой иной ошибки SQLite. Для прочих кодов — только код.
// EN: Only a refusal code leaves the process: a [a-z_]+ message, else e.code, else 'local_refused' — no lesson text.
// EN: B-N-1831: for ERR_SQLITE_* codes also detail, the error text (up to 300 chars): SQLite messages carry no record data.
}catch(e){const code=/^[a-z_]+$/.test(e.message)?e.message:(e.code||'local_refused');
 console.log(JSON.stringify({error:code,...(/^ERR_SQLITE/.test(code)?{detail:String(e.message).slice(0,300)}:{})}));process.exitCode=1;}
finally{for(const f of clean)if(typeof f==='function')f();}
