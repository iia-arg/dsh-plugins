/**
 * RU: ВВОЗ ПАМЯТИ. Читает файл вывоза (JSONL: первая строка — заголовок со схемой,
 *     дальше по одной записи на строку), проверяет его целиком и вставляет записи
 *     в базу-получатель SQLite одной транзакцией.
 * EN: MEMORY IMPORT. Reads an export file (JSONL: the first line is a header with the schema,
 *     then one record per line), validates it as a whole and inserts the records into the
 *     receiving SQLite database in a single transaction.
 *
 * RU: Условия приёмки обозначены В1…В13 (буква кириллицей); по-английски — V1…V13.
 * EN: Acceptance conditions are labelled В1…В13 (Cyrillic letter); in English they are V1…V13.
 *
 * RU: 🔴 ВВОЗ ТОЖЕ ФИЛЬТРУЕТ, И ЭТО НЕ ДУБЛИРОВАНИЕ ВЫВОЗА. Файл мог прийти с машины, где
 *     фильтра не было вовсе, либо где он был другой редакции. Проверять надо на той стороне,
 *     которая отвечает за свою базу, — то есть здесь.
 * EN: 🔴 IMPORT FILTERS TOO, AND THIS DOES NOT DUPLICATE EXPORT. The file may have come from a
 *     machine with no filter at all, or with a different revision of it. The check belongs to the
 *     side responsible for its own database — that is, here.
 *
 * RU: 🔴 СВОИ НОМЕРА, ЧУЖИЕ НЕ ПЕРЕНОСЯТСЯ. У ядра статус записи определяется рубежом по id.
 *     Чужая запись с малым номером легла бы ниже нашего рубежа и получила бы привилегию нашей
 *     старой памяти — отмывание доверия через ввоз. Здесь это ОТКАЗ, а не предупреждение.
 * EN: 🔴 OWN IDS ONLY; FOREIGN IDS ARE NOT CARRIED OVER. The core derives a record's status from
 *     an id boundary. A foreign record with a small id would land below our boundary and inherit
 *     the privilege of our old memory — trust laundering through import. Here that is a REFUSAL,
 *     not a warning.
 *
 * RU: 🔴 АТОМАРНОСТЬ (условие приёмки В6). Битая пятидесятая строка обязана дать НОЛЬ новых
 *     записей, а не сорок девять. Половина ввоза хуже отказа: она выглядит как успех, и никто
 *     не идёт доввозить остаток.
 * EN: 🔴 ATOMICITY (acceptance condition V6). A broken fiftieth line must yield ZERO new records,
 *     not forty-nine. A half import is worse than a refusal: it looks like success, and nobody
 *     comes back to import the rest.
 *
 * RU: ГДЕ НЕ ПРИМЕНЯЕТСЯ: ввоз не сливает знания и не разрешает противоречий. Две записи об
 *     одном предмете с разных машин останутся двумя записями — разбор смысла не его работа.
 * EN: OUT OF SCOPE: import does not merge knowledge or resolve contradictions. Two records about
 *     the same subject from different machines remain two records — reconciling meaning is not
 *     its job.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { vzyat_filtr, reshenie } from './yadro.js';
import { POLYA, proverit_zagolovok, OtkazShemy, summa_soderzhimogo, proverit_klyuchi } from './shema.js';
import { zapisat_v_zhurnal } from './zhurnal.js';
import { VERSIYA_PAKETA } from './vyvoz.js';

/**
 * RU: Класс, чьи записи с чужой машины ВСЕГДА ложатся неподтверждёнными (условие В5).
 * EN: Class whose records from a foreign machine ALWAYS land as unconfirmed (condition V5).
 */
const TREBUET_PODTVERZHDENIYA = 'ogranichenie';

/**
 * RU: Параметры vvezti. Блок стоит над перечнем допустимых ключей вызова: любой ключ вне
 *     KLYUCHI_VVOZA — отказ VYVOZ_NEIZVESTNYJ_KLYUCH, а не молчаливое умолчание.
 * EN: Options of vvezti. The block sits above the list of allowed call keys: any key outside
 *     KLYUCHI_VVOZA is a VYVOZ_NEIZVESTNYJ_KLYUCH refusal, not a silent default.
 * @param {object} o
 * @param {string} o.baza    RU: путь к базе-получателю (открывается на запись)
 *                           EN: path to the receiving database (opened for writing)
 * @param {string} o.fajl    RU: файл вывоза
 *                           EN: the export file
 * @param {string} [o.yadro] RU: путь к модулю фильтра (для стендов)
 *                           EN: path to the filter module (for test stands)
 * @param {function} [o.krik] RU: куда печатать предупреждения; по умолчанию console.error
 *                            EN: where warnings are printed; console.error by default
 */
const KLYUCHI_VVOZA = ['baza', 'fajl', 'yadro', 'krik'];

// RU: Значение поля в том виде, в каком оно ложится в столбец базы: объект (не null) — строкой JSON,
//     прочее — как есть. Одна функция и для фильтра, и для вставки: фильтр обязан видеть ровно
//     те байты, которые будут записаны.
// EN: A field value as it is stored in the database column: an object (non-null) as a JSON string,
//     anything else as is. One function for both the filter and the insert: the filter must see
//     exactly the bytes that will be written.
const kak_v_baze = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v);

/**
 * RU: Ввозит записи из файла вывоза в базу-получатель.
 * EN: Imports records from an export file into the receiving database.
 *
 * RU: Вход: { baza, fajl, yadro?, krik? } — см. блок параметров выше.
 * EN: Input: { baza, fajl, yadro?, krik? } — see the options block above.
 *
 * RU: Выход: итог с абсолютными числами (vsego, vstavleno, uzhe_bylo, otkloneno_filtrom),
 *     списком отклонённых строк без содержимого, признаками «сумма сверена» и «тождество»,
 *     поимённым списком потерянных полей (prinyato_s_poterey) и признаком следа в журнале.
 * EN: Output: a summary with absolute counts (vsego, vstavleno, uzhe_bylo, otkloneno_filtrom),
 *     the list of rejected lines without their content, the "checksum verified" and "identity"
 *     flags, a by-name list of lost fields (prinyato_s_poterey) and the journal-entry flag.
 *
 * RU: Отказы — OtkazShemy с кодом, все ДО первой записи в базу (база НЕ тронута):
 *     VYVOZ_NEIZVESTNYJ_KLYUCH, VYVOZ_PUSTOJ_FAJL, VYVOZ_NET_ZAGOLOVKA, VYVOZ_NE_NASH_FAJL,
 *     VYVOZ_CHUZHAYA_SHEMA, VYVOZ_ZAGOLOVOK_BEZ_OTKUDA, VYVOZ_BITAYA_STROKA, VYVOZ_CHUZHIE_ID,
 *     VYVOZ_SUMMA_NE_SOSHLAS; несостоявшийся договор с ядром — VYVOZ_DOGOVOR_YADRA (yadro.js).
 *     Ошибка базы во время вставки откатывает транзакцию целиком и пробрасывается как есть.
 * EN: Refusals — OtkazShemy with a code, all BEFORE the first database write (database NOT touched):
 *     VYVOZ_NEIZVESTNYJ_KLYUCH, VYVOZ_PUSTOJ_FAJL, VYVOZ_NET_ZAGOLOVKA, VYVOZ_NE_NASH_FAJL,
 *     VYVOZ_CHUZHAYA_SHEMA, VYVOZ_ZAGOLOVOK_BEZ_OTKUDA, VYVOZ_BITAYA_STROKA, VYVOZ_CHUZHIE_ID,
 *     VYVOZ_SUMMA_NE_SOSHLAS; a failed contract with the core is VYVOZ_DOGOVOR_YADRA (yadro.js).
 *     A database error during insertion rolls the whole transaction back and is rethrown as is.
 *
 * RU: Чего НЕ ловит: без суммы в заголовке (файл старого вывоза) обрыв на границе строки
 *     не виден — об этом говорится в итоге, а не молчится; фильтр ядра судит каждое поле
 *     договора POLYA в том виде, в каком оно записывается; смысловые дубли с разным
 *     тождеством и противоречия между записями не разбираются.
 * EN: What it does NOT catch: without a checksum in the header (an old-export file) truncation
 *     at a line boundary is invisible — the summary says so instead of staying silent; the core
 *     filter judges every POLYA field in its stored form; semantic duplicates with a different
 *     identity and contradictions between records are
 *     not resolved.
 */
export async function vvezti(o = {}) {
  proverit_klyuchi(o, KLYUCHI_VVOZA, 'ввоз', 'VYVOZ_NEIZVESTNYJ_KLYUCH');
  const { baza, fajl, yadro, krik = console.error } = o;
  const filtr = await vzyat_filtr(yadro);

  // RU: Пустые строки (и строки из одних пробелов) отбрасываются до разбора — поэтому номера
  //     строк в отказах ниже считаются среди непустых строк файла.
  // EN: Empty (and whitespace-only) lines are dropped before parsing — so line numbers in the
  //     refusals below are counted among the non-empty lines of the file.
  const stroki = readFileSync(fajl, 'utf8').split('\n').filter((s) => s.trim() !== '');
  if (!stroki.length) throw new OtkazShemy('файл пуст — ввозить нечего', 'VYVOZ_PUSTOJ_FAJL');

  let shapka;
  try {
    shapka = proverit_zagolovok(JSON.parse(stroki[0]));
  } catch (e) {
    if (e instanceof OtkazShemy) throw e;
    throw new OtkazShemy(`первая строка не разбирается как JSON: ${e.message}`, 'VYVOZ_NET_ZAGOLOVKA');
  }

  // RU: 🔴 ВЕСЬ ФАЙЛ РАЗБИРАЕТСЯ ДО ПЕРВОЙ ЗАПИСИ В БАЗУ. Разбор в одном проходе со вставкой
  //     означал бы, что битая строка застаёт нас с половиной уже вставленного.
  // EN: 🔴 THE WHOLE FILE IS PARSED BEFORE THE FIRST DATABASE WRITE. Parsing in the same pass as
  //     insertion would mean a broken line catches us with half of the data already inserted.
  const kandidaty = [];
  for (let i = 1; i < stroki.length; i++) {
    let z;
    try {
      z = JSON.parse(stroki[i]);
    } catch (e) {
      throw new OtkazShemy(`строка ${i + 1} не разбирается как JSON: ${e.message}. База НЕ тронута`, 'VYVOZ_BITAYA_STROKA');
    }
    if ('id' in z) {
      throw new OtkazShemy(
        `строка ${i + 1} несёт чужой id=${z.id}. Ввоз С СОХРАНЕНИЕМ чужих номеров ЗАПРЕЩЁН: `
        + 'чужая запись с малым номером легла бы ниже нашего рубежа происхождения и получила бы '
        + 'привилегию нашей старой памяти. База НЕ тронута',
        'VYVOZ_CHUZHIE_ID',
      );
    }
    kandidaty.push(z);
  }

  // RU: 🔴 СУММА СОДЕРЖИМОГО СВЕРЯЕТСЯ ДО ПЕРВОЙ ЗАПИСИ В БАЗУ (ворота В1).
  //     Разбор всех строк говорит «файл читается», но не говорит «файл дошёл ЦЕЛИКОМ»:
  //     обрыв на границе строки даёт файл, который разбирается молча и не полностью.
  //     Суммы нет — это НЕ «сошлось»: файл старого вывоза, и сказать об этом надо вслух,
  //     иначе отсутствие проверки неотличимо от пройденной проверки.
  // EN: 🔴 THE CONTENT CHECKSUM IS VERIFIED BEFORE THE FIRST DATABASE WRITE (gate V1).
  //     Parsing every line says "the file is readable", not "the file arrived WHOLE":
  //     truncation at a line boundary yields a file that parses silently and incompletely.
  //     No checksum is NOT "it matched": it is an old-export file, and that must be said aloud,
  //     otherwise a missing check is indistinguishable from a passed one.
  const stroki_zapisej = stroki.slice(1);
  if (shapka.summa) {
    const nasha = summa_soderzhimogo(stroki_zapisej);
    if (nasha !== shapka.summa) {
      throw new OtkazShemy(
        `сумма содержимого не сошлась: в заголовке ${shapka.summa}, посчитано ${nasha}. `
        + `Записей в файле ${stroki_zapisej.length}, заголовок обещает ${shapka.zapisej}. `
        + 'Файл дошёл не целиком либо правлен после вывоза. База НЕ тронута',
        'VYVOZ_SUMMA_NE_SOSHLAS',
      );
    }
  }

  // RU: 🔴 Фильтр ядра судит КАЖДОЕ поле договора, которое запись несёт, и ровно в том виде,
  //     в каком оно ляжет в базу (kak_v_baze: объект — JSON-строкой). Прежде фильтр видел только
  //     String(soderzhim): поле-объект превращалось в «[object Object]», а в базу ложился весь
  //     объект JSON-ом — секрет внутри него и в любом другом поле проходил мимо фильтра.
  //     soderzhim проверяется первым. Отклонённая запись в базу не идёт; в итог попадают номер
  //     строки, поле, класс и режим — без содержимого. stroka = i + 2: +1 за строку заголовка,
  //     +1 за счёт строк с единицы.
  //     Чего НЕ ловит: поля вне договора (POLYA) — их вставка и так не берёт; секрет, который
  //     фильтр ядра не узнаёт в тексте.
  // EN: 🔴 The core filter judges EVERY contract field the record carries, exactly as it will be
  //     stored (kak_v_baze: an object as a JSON string). Before, the filter saw only
  //     String(soderzhim): an object field became "[object Object]" while the whole object went
  //     into the database as JSON — a secret inside it, or in any other field, bypassed the filter.
  //     soderzhim is checked first. A rejected record does not reach the database; the summary
  //     gets the line number, field, class and mode — without the content. stroka = i + 2: +1 for
  //     the header line, +1 because lines are counted from one.
  //     Does NOT catch: fields outside the contract (POLYA) — insertion does not take them anyway;
  //     a secret the core filter does not recognise in the text.
  const otkloneno = [];
  const k_vstavke = [];
  const poryadok_polej = ['soderzhim', ...POLYA.filter((p) => p !== 'soderzhim')];
  for (const [i, z] of kandidaty.entries()) {
    let otkaz = null;
    for (const p of poryadok_polej) {
      const v = kak_v_baze(z[p]);
      if (v === undefined || v === null) continue;
      const r = reshenie(filtr, String(v));
      if (!r.vyvozit) { otkaz = { stroka: i + 2, pole: p, klass: r.klass, rezhim: r.rezhim }; break; }
    }
    if (otkaz) {
      otkloneno.push(otkaz);
      continue;
    }
    k_vstavke.push(z);
  }

  // RU: 🔴 (25.09.2026) ПОЛЕ ЗАПИСИ ВНЕ ДОГОВОРА ВВОЗА НАЗЫВАЕТСЯ ПОИМЁННО.
  //     Предыдущая правка (о неразмещённых полях, ниже) назвала поля договора, которых нет
  //     в схеме базы; а поле, которого нет в САМОМ договоре (POLYA), ввоз глотал МОЛЧА:
  //     вставка берёт только POLYA, отчёт — «вставлено N». Зеркало вывоза
  //     (polya_neizvestnye_vyvozu). НЕ отказ: запись законна, теряется лишь поле.
  // EN: 🔴 (2026-09-25) A RECORD FIELD OUTSIDE THE IMPORT CONTRACT IS NAMED EXPLICITLY.
  //     The earlier fix (about unplaced fields, below) named contract fields missing from the
  //     database schema; but a field missing from the contract ITSELF (POLYA) was swallowed
  //     SILENTLY: insertion takes only POLYA, the report says "inserted N". Mirrors export
  //     (polya_neizvestnye_vyvozu). NOT a refusal: the record is legitimate, only the field is lost.
  // RU: pometka_filtra — известные метаданные транспорта; решение фильтра получателя они не меняют.
  // EN: pometka_filtra is known transport metadata; it cannot override the receiver filter.
  const neizvestnye_nesli = {};
  for (const z of k_vstavke) {
    for (const k of Object.keys(z)) {
      if (!POLYA.includes(k) && k !== 'pometka_filtra') neizvestnye_nesli[k] = (neizvestnye_nesli[k] ?? 0) + 1;
    }
  }
  const neizvestnye = Object.keys(neizvestnye_nesli).sort();
  if (neizvestnye.length) {
    krik('⚠️ ВВОЗ НЕ ЗНАЕТ ПОЛЕЙ записи: '
      + neizvestnye.map((p) => p + ' (несли ' + neizvestnye_nesli[p] + ' записей)').join(', ')
      + '. Поле вне договора ввоза (POLYA) — значения НЕ размещены, значения остаются в исходном JSONL: '
      + 'функция ввоза файл не удаляет. Это не «их не было» — они приехали и отброшены.');
  }

  // RU: База открывается только здесь — после всех проверок файла, поэтому отказы выше её
  //     не трогают вовсе. Несуществующий приёмник отказывает до открытия SQLite.
  // EN: The database is opened only here — after all file checks, so the refusals above do not
  //     touch it at all. A missing receiver is refused before SQLite opens it.
  if (!existsSync(baza)) throw new OtkazShemy('приёмная база не существует; создайте её ядром до ввоза', 'VYVOZ_BAZA_NE_SUSHHESTVUET');
  const db = new DatabaseSync(baza);
  let vstavleno = 0;
  // RU: Правка о неразмещённых полях: объявлены СНАРУЖИ try — отчёт собирается после него,
  //     а считаются они внутри.
  // EN: Unplaced-fields fix: declared OUTSIDE the try — the report is built after it, while
  //     they are computed inside.
  let teryaem = [];
  let nesli_pole = {};
  let uzhe_bylo = 0;
  let tozhdestvo_bylo = 'agent+istochnik+sozdano';
  try {
    // RU: Набор столбцов снимается с живой базы. Пустой ответ PRAGMA означает и «таблицы zapisi
    //     нет» — тогда откажет следующий запрос к ней, а не эта строка.
    // EN: The column set is read from the live database. An empty PRAGMA answer also means "there
    //     is no zapisi table" — the next query against it fails then, not this line.
    const est = db.prepare('PRAGMA table_info(zapisi)').all().map((rr) => rr.name);
    const polya = POLYA.filter((p) => est.includes(p));
    // RU: 🔴 НЕРАЗМЕЩЁННЫЕ ПОЛЯ НАЗЫВАЮТСЯ ПОИМЁННО (07.09.2026).
    //     ЗАЧЕМ. Ввоз на ядро, где столбца нет, отбрасывал поле МОЛЧА: отчёт давал
    //     «215/215, отклонено 0», а два поля (ocenki, podtverzhdenie) не доезжали.
    //     Асимметрия с вывозом: тот при незнакомом поле говорит, ввоз — глотал,
    //     значения в БД не размещаются; исходный JSONL функция не удаляет.
    //     ЧТО ЭТО НЕ ДЕЛАЕТ: не отказывает. Отказ целиком означал бы, что ввоз на
    //     ядро старее отправителя невозможен вовсе — а он законен, схема догоняет.
    //     Принимаем С ОБЪЯВЛЕННОЙ ПОТЕРЕЙ: имена полей и сколько записей их несли.
    // EN: 🔴 UNPLACED FIELDS ARE NAMED EXPLICITLY (2026-09-07).
    //     WHY. Importing into a core without the column dropped the field SILENTLY: the report said
    //     "215/215, rejected 0", while two fields (ocenki, podtverzhdenie) never arrived.
    //     Asymmetry with export: export speaks up about an unknown field, import swallowed it,
    //     the values are not stored in the DB; the import function does not delete the source JSONL.
    //     WHAT THIS DOES NOT DO: it does not refuse. Refusing outright would make import into a core
    //     older than the sender impossible — yet that is legitimate, the schema catches up later.
    //     We accept WITH A DECLARED LOSS: field names and how many records carried them.
    const ne_razmeshcheny = POLYA.filter((p) => !est.includes(p));
    nesli_pole = {};
    for (const p of ne_razmeshcheny) {
      nesli_pole[p] = k_vstavke.filter((z) => z[p] !== undefined && z[p] !== null).length;
    }
    teryaem = ne_razmeshcheny.filter((p) => nesli_pole[p] > 0);
    if (teryaem.length) {
      krik('⚠️ ПРИНЯТО С ПОТЕРЕЙ ПОЛЕЙ: в схеме принимающей базы нет столбцов '
        + teryaem.map((p) => p + ' (несли ' + nesli_pole[p] + ' записей)').join(', ')
        + '. Значения НЕ размещены, значения остаются в исходном JSONL: функция ввоза файл не удаляет. '
        + 'Это не «их не было» — они приехали и отброшены схемой.');
    }
    const est_bp = est.includes('bez_podtverzhdeniya');
    // RU: 🔴 ТОЖДЕСТВО ЗАПИСИ — ТРОЙКА «агент + источник + время создания», а не номер:
    //     номер у нас свой, и двойной ввоз без такой тройки удвоил бы память молча.
    //     Агент добавлен по воротам В2: без него две записи РАЗНЫХ агентов с одним источником
    //     и одним временем схлопнулись бы в дубликат — редко, но это тождество памяти, и
    //     ошибка здесь необратима (вторая запись просто не ввозится и об этом молчат).
    //     Поля agent в принимающей базе может не быть — тогда тождество остаётся парой,
    //     и это ГОВОРИТСЯ ВСЛУХ ниже, а не подразумевается.
    // EN: 🔴 RECORD IDENTITY IS THE TRIPLE "agent + source + creation time", not the id:
    //     ids are our own, and without this triple a repeated import would silently double memory.
    //     The agent was added per gate V2: without it, two records of DIFFERENT agents with the same
    //     source and time would collapse into a duplicate — rare, but this is memory identity, and
    //     a mistake here is irreversible (the second record is simply not imported, silently).
    //     The receiving database may lack the agent column — then identity stays a pair,
    //     and that is STATED ALOUD below rather than implied.
    const est_agent = est.includes('agent');
    if (!est_agent) tozhdestvo_bylo = 'istochnik+sozdano (поля agent в базе нет)';
    const najti = est_agent
      ? db.prepare('SELECT COUNT(*) c FROM zapisi WHERE agent IS ? AND istochnik IS ? AND sozdano IS ?')
      : db.prepare('SELECT COUNT(*) c FROM zapisi WHERE istochnik IS ? AND sozdano IS ?');
    const est_li = (z) => (est_agent
      ? najti.get(z.agent ?? null, z.istochnik ?? null, z.sozdano ?? null)
      : najti.get(z.istochnik ?? null, z.sozdano ?? null)).c > 0;
    // RU: 🔴 ВСТАВЛЯЮТСЯ ТОЛЬКО ТЕ ПОЛЯ, КОТОРЫЕ В ЗАПИСИ ЕСТЬ. Первая редакция подставляла
    //     NULL за отсутствующее — и ввоз падал на «NOT NULL constraint failed» ровно там, где
    //     он и нужен: файл с ЧУЖОЙ машины, где поле не заполнялось. Отсутствующее поле — это
    //     «значения не было», а не «значение равно ничему»; за первое отвечает умолчание схемы
    //     принимающей базы, и подменять его нашей догадкой нельзя.
    // EN: 🔴 ONLY THE FIELDS PRESENT IN THE RECORD ARE INSERTED. The first revision substituted
    //     NULL for missing ones — and import failed with "NOT NULL constraint failed" exactly where
    //     it is needed: a file from a FOREIGN machine where the field was never filled. A missing
    //     field means "there was no value", not "the value is nothing"; the former is covered by the
    //     receiving schema's default, and our guess must not replace it.
    // RU: BEGIN IMMEDIATE берёт замок записи сразу: проверка тождества и вставки идут под одним
    //     замком, и параллельная запись в базу не вклинится между ними.
    // EN: BEGIN IMMEDIATE takes the write lock at once: the identity checks and the inserts run under
    //     one lock, so a concurrent writer cannot squeeze in between them.
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const z of k_vstavke) {
        // RU: Проверка видит и вставленное в этой же транзакции: повтор записи внутри одного
        //     файла тоже считается «уже было».
        // EN: The check also sees rows inserted earlier in this same transaction: a record repeated
        //     within one file is counted as "already present" too.
        if (est_li(z)) { uzhe_bylo++; continue; }
        const berem = polya.filter((p) => z[p] !== undefined || (p === 'bez_podtverzhdeniya' && z.klass === TREBUET_PODTVERZHDENIYA));
        const zn = berem.map((p) => {
          // RU: Условие В5: чужое ограничение НЕ начинает действовать молча.
          // EN: Condition V5: a foreign restriction does NOT take effect silently.
          if (p === 'bez_podtverzhdeniya' && z.klass === TREBUET_PODTVERZHDENIYA) return 1;
          // RU: Поле-объект (не null) кладётся в столбец текстом JSON — той же kak_v_baze, что видит фильтр.
          // EN: An object-valued (non-null) field is stored as JSON text — by the same kak_v_baze the filter sees.
          return kak_v_baze(z[p]);
        });
        db.prepare(`INSERT INTO zapisi (${berem.join(', ')}) VALUES (${berem.map(() => '?').join(', ')})`).run(...zn);
        vstavleno++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    if (!est_bp && k_vstavke.some((z) => z.klass === TREBUET_PODTVERZHDENIYA)) {
      // RU: Поля нет — значит требование В5 исполнить нечем. Молчать об этом нельзя.
      // EN: No such column — condition V5 cannot be enforced. This must not go unsaid.
      otkloneno.push({ stroka: 0, klass: TREBUET_PODTVERZHDENIYA, rezhim: 'поля bez_podtverzhdeniya нет в базе — ограничения ввезены БЕЗ пометки' });
    }
  } finally {
    db.close();
  }

  // RU: 🔴 СЛЕД В ЖУРНАЛЕ (В8). Ввоз меняет базу — без строки в журнале через неделю нечем
  //     будет ответить, пришла запись извне или родилась здесь.
  // EN: 🔴 JOURNAL ENTRY (V8). Import changes the database — without a journal line, a week later
  //     there is nothing to tell whether a record came from outside or was born here.
  const sled = zapisat_v_zhurnal({
    baza, agent: 'dsh-pamyat-vyvoz', klass: 'vvoz-pamyati', ishod: 'vypolneno',
    priroda: 'priyom-izvne',
    pochemu: `из «${shapka.otkuda}»${shapka.uzel ? ` (узел ${shapka.uzel})` : ''}: `
      + `вставлено ${vstavleno}, уже было ${uzhe_bylo}, отклонено фильтром ${otkloneno.length} `
      + `из ${kandidaty.length}; тождество ${tozhdestvo_bylo}; `
      + (shapka.summa ? 'сумма содержимого сверена' : 'суммы в заголовке НЕТ — целостность не проверена'),
    istochnik: fajl,
    krik,
  });

  return {
    sled_v_zhurnale: sled,
    iz: shapka.otkuda,
    uzel_istochnika: shapka.uzel ?? null,
    summa_sverena: Boolean(shapka.summa),
    tozhdestvo: tozhdestvo_bylo,
    vsego: kandidaty.length, vstavleno, uzhe_bylo,
    otkloneno_filtrom: otkloneno.length, otkloneno,
    // RU: Правка о неразмещённых полях: потеря полей объявляется В ОТЧЁТЕ, а не только
    //     в крике — зовущий может не читать крик, но итог он читает всегда.
    // EN: Unplaced-fields fix: the field loss is declared IN THE REPORT, not only in the warning —
    //     the caller may not read the warning, but always reads the summary.
    polya_ne_razmeshcheny: teryaem,
    polya_ne_razmeshcheny_nesli: Object.fromEntries(teryaem.map((p) => [p, nesli_pole[p]])),
    // RU: Поля вне договора ввоза — отдельно от полей, которых нет в схеме базы.
    // EN: Fields outside the import contract — kept apart from fields missing in the database schema.
    polya_neizvestnye_vvozu: neizvestnye,
    polya_neizvestnye_vvozu_nesli: neizvestnye_nesli,
    prinyato_s_poterey: teryaem.length > 0 || neizvestnye.length > 0,
  };
}

/**
 * RU: Отчёт о ввозе словами; числа абсолютные (условие В13).
 * EN: Human-readable import report; counts are absolute (condition V13).
 *
 * RU: Вход: итог vvezti. Выход: многострочный текст. Содержимое отклонённых записей
 *     НЕ показывается — только номер строки, класс и режим.
 * EN: Input: the summary returned by vvezti. Output: multi-line text. The content of rejected
 *     records is NOT shown — only the line number, class and mode.
 *
 * RU: Отказов своих нет. Отсутствующие сведения о потерях полей называются строкой
 *     «НЕ подтверждено», а не читаются как «потерь нет». Чего НЕ ловит: числа итога
 *     не перепроверяются — отчёт верит итогу; поле otkloneno обязано быть массивом.
 * EN: It has no refusals of its own. Missing field-loss data is reported as "NOT confirmed"
 *     rather than read as "no losses". What it does NOT catch: summary counts are not
 *     re-checked — the report trusts the summary; the otkloneno field must be an array.
 */
export function otchyot_vvoza(it) {
  const s = [];
  s.push(`[dsh-pamyat-vyvoz ${VERSIYA_PAKETA}] ввоз из «${it.iz}»${it.uzel_istochnika ? ` (узел ${it.uzel_istochnika})` : ''}: в файле ${it.vsego}, вставлено ${it.vstavleno}, уже было ${it.uzhe_bylo}, отклонено фильтром ${it.otkloneno_filtrom}`);
  // RU: 🔴 НЕПРОВЕРЕННОЕ НАЗЫВАЕТСЯ ВСЛУХ. Молчание о том, что суммы не было, читается как
  //     «сумма сошлась» — а это разные вещи: первое про наш инструмент, второе про предмет.
  // EN: 🔴 WHAT WAS NOT CHECKED IS SAID ALOUD. Silence about a missing checksum reads as
  //     "the checksum matched" — and those differ: the first is about our tool, the second
  //     about the subject.
  s.push(it.summa_sverena
    ? '  сумма содержимого СВЕРЕНА — файл дошёл целиком'
    : '  ⚠️ суммы в заголовке НЕТ (файл старого вывоза): целостность НЕ проверена, а не «сошлась»');
  s.push(`  тождество записи: ${it.tozhdestvo}`);
  // RU: Это потери известных полей при размещении, не оценка всех возможных потерь.
  // EN: These are losses of known fields on placement, not an estimate of every possible loss.
  const polya = it.polya_ne_razmeshcheny;
  if (!Array.isArray(polya)) {
    s.push('  ⚠️ сведения о потерях полей отсутствуют — отсутствие потерь НЕ подтверждено');
  } else if (polya.length) {
    s.push(`  🔴 ПОТЕРЯНО полей: ${polya.length} — ПОИМЁННО: `
      + polya.map((p) => `${p} (записей: ${it.polya_ne_razmeshcheny_nesli?.[p] ?? 'неизвестно'})`).join(', '));
  } else {
    s.push('  потерь полей нет (среди проверенных полей договора ввоза)');
  }
  // RU: Поле вне договора ввоза — второй вид потери, называется отдельной строкой.
  // EN: A field outside the import contract is the second kind of loss, named on its own line.
  const neizv = it.polya_neizvestnye_vvozu;
  if (!Array.isArray(neizv)) {
    s.push('  ⚠️ сведения о полях вне договора ввоза отсутствуют — отсутствие таких потерь НЕ подтверждено');
  } else if (neizv.length) {
    s.push(`  🔴 ВВОЗ НЕ ЗНАЕТ полей: ${neizv.length} — ПОИМЁННО: `
      + neizv.map((p) => `${p} (записей: ${it.polya_neizvestnye_vvozu_nesli?.[p] ?? 'неизвестно'})`).join(', '));
  }
  for (const o of it.otkloneno) {
    s.push(`  отклонена: строка ${o.stroka}${o.pole ? `, поле ${o.pole}` : ''} — ${o.klass} (${o.rezhim}), содержимое НЕ показано`);
  }
  return s.join('\n');
}
