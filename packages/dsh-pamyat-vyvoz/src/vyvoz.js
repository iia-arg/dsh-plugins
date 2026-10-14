/**
 * RU: ВЫВОЗ ПАМЯТИ — ПЕРЕНОС СМЫСЛА, А НЕ КОПИЯ ФАЙЛА.
 * EN: MEMORY EXPORT — TRANSFER OF MEANING, NOT A COPY OF THE FILE.
 *
 * RU: Что делает модуль: читает таблицу `zapisi` базы памяти SQLite (только на чтение),
 * RU: пропускает каждую запись через фильтр секретов ядра (см. yadro.js) и пишет файл JSONL:
 * RU: первая строка — заголовок (схема, источник, узел, счётчики, сумма содержимого, отбор,
 * RU: редакция пакета), дальше — по строке JSON на каждую вывезенную запись.
 * EN: What the module does: reads the `zapisi` table of an SQLite memory database (read-only),
 * EN: passes every record through the core secret filter (see yadro.js) and writes a JSONL file:
 * EN: the first line is a header (schema, source, host, counters, content checksum, selection,
 * EN: package version), followed by one JSON line per exported record.
 *
 * RU: 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ КОПИЙ. Копия базы у нас уже есть — ночной архив. Она отвечает на
 * RU: вопрос «вернуть эту машину в прежнее состояние». Вывоз отвечает на другой: «перенести
 * RU: знание туда, где схема другая, номера свои и правил доверия нет». Копию нельзя влить
 * RU: в живую базу, вывоз — можно.
 * EN: 🔴 WHY SEPARATE FROM BACKUPS. A database backup already exists — the nightly archive. It
 * EN: answers "restore this machine to its previous state". Export answers a different question:
 * EN: "move the knowledge to a place where the schema differs, ids are local and there are no
 * EN: trust rules". A backup cannot be merged into a live database; an export can.
 *
 * RU: 🔴 ВЫВОЗ ФИЛЬТРУЕТ. Фильтр стоит на ВХОДЕ, значит всё, что легло в базу до его появления,
 * RU: никем не проверено. Замер 04.09.2026: из 42 записей базы 31 легла ДО фильтра — вывоз без
 * RU: проверки вынес бы их наружу целиком, обойдя защиту, которую строили. И доля здесь врёт:
 * RU: число невыверенных не уменьшается со временем, его лишь разбавляют новые записи
 * RU: (условие приёмки В13 — числа абсолютные, доля только рядом с числом).
 * EN: 🔴 EXPORT FILTERS. The filter sits on INPUT, so everything stored before the filter existed
 * EN: was never checked. Measured 04.09.2026: 31 of 42 records in the database predate the
 * EN: filter — an unchecked export would have shipped them out whole, bypassing the protection
 * EN: that was built. A percentage is misleading here: the count of unchecked records never
 * EN: shrinks, it only gets diluted by new ones (acceptance condition V13: absolute numbers,
 * EN: a percentage only next to a number).
 *
 * RU: ГДЕ ЭТОТ МЕХАНИЗМ НЕ ПРИМЕНЯЕТСЯ И ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ:
 * RU:   · он НЕ судит о правдивости записи — только о том, нет ли в ней секрета;
 * RU:   · «задержано 0» значит «фильтр не нашёл ничего запирающего», а НЕ «секретов нет»:
 * RU:     фильтр знает свой перечень форм и чужую форму пропустит;
 * RU:   · он не вывозит журнал и очередь (см. NE_VYVOZITSYA в shema.js) — это решение, не забывчивость.
 * EN: WHERE THIS MECHANISM DOES NOT APPLY AND WHAT ITS SILENCE MEANS:
 * EN:   · it does NOT judge whether a record is true — only whether it contains a secret;
 * EN:   · "withheld 0" means "the filter found nothing blocking", NOT "there are no secrets":
 * EN:     the filter knows its own list of shapes and lets an unknown shape through;
 * EN:   · it does not export the log or the queue (see NE_VYVOZITSYA in shema.js) — by decision,
 * EN:     not by oversight.
 *
 * RU: Экспорты: VERSIYA_PAKETA (редакция из package.json), vyvezti() (вывоз), otchyot() (отчёт словами).
 * EN: Exports: VERSIYA_PAKETA (version from package.json), vyvezti() (export), otchyot() (text report).
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { vzyat_filtr, reshenie } from './yadro.js';
import { POLYA, zagolovok, neznakomye_polya, summa_soderzhimogo, proverit_klyuchi } from './shema.js';
import { zapisat_v_zhurnal } from './zhurnal.js';

// RU: 🔴 ВЕРСИЯ ЧИТАЕТСЯ ИЗ СВОЕГО МАНИФЕСТА, А НЕ ПИШЕТСЯ КОНСТАНТОЙ. Отчёт о вывозе
// RU: уезжает к тому, кто будет ввозить, и без редакции он не отвечает на вопрос «чем
// RU: вывезли»: правила фильтра и состав полей у соседней редакции могут быть другими.
// RU: Константа в коде разошлась бы с манифестом при первом же выпуске — молча.
// RU: Не прочли манифест — значение «неизвестна», а не отказ: вывоз от этого не опаснее.
// EN: 🔴 THE VERSION IS READ FROM OUR OWN MANIFEST, NOT HARD-CODED. The export report travels
// EN: to whoever will import it, and without a version it cannot answer "what exported this":
// EN: filter rules and the field set may differ in another release. A constant in the code
// EN: would drift from the manifest at the very first release — silently.
// EN: If the manifest cannot be read the value is 'неизвестна' ("unknown"), not a failure:
// EN: the export is no less safe because of it.
export const VERSIYA_PAKETA = (() => {
  try {
    const put = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return JSON.parse(readFileSync(put, 'utf8')).version;
  } catch { return 'неизвестна'; }
})();

/**
 * RU: Параметры vyvezti() (ниже); KLYUCHI_VYVOZA — полный перечень допустимых ключей.
 * EN: Parameters of vyvezti() (below); KLYUCHI_VYVOZA is the full list of allowed keys.
 * @param {object} o
 * @param {string} o.baza      RU: путь к базе памяти (открывается ТОЛЬКО на чтение)
 *                             EN: path to the memory database (opened READ-ONLY)
 * @param {string} [o.fajl]    RU: куда писать; без него файл не создаётся — только отчёт
 *                             EN: output path; without it no file is created — report only
 * @param {string} o.otkuda    RU: как назвать источник в заголовке — ОБЯЗАТЕЛЕН, умолчания нет
 *                             EN: source name for the header — REQUIRED, no default
 * @param {string} [o.yadro]   RU: путь к модулю фильтра (для стендов)
 *                             EN: path to the filter module (for test stands)
 * @param {object} [o.otbor]   RU: что брать: {agent, klass, s, po} — время в мс epoch
 *                             EN: selection: {agent, klass, s, po} — time in epoch ms
 */
const KLYUCHI_VYVOZA = ['baza', 'fajl', 'otkuda', 'yadro', 'otbor', 'krik'];

/**
 * RU: Вывезти память из базы в файл JSONL (или только посчитать — без `fajl`).
 * RU: Вход: объект `o` (см. блок выше) плюс `krik` — функция для громких сообщений журнала
 * RU: (по умолчанию console.error).
 * RU: Порядок: ключи → договор с ядром → «откуда» → чтение базы с отбором → фильтр по
 * RU: каждой записи → заголовок → атомарная запись файла → строка в журнал базы.
 * RU: Выход: объект-итог {sled_v_zhurnale, vsego, vyvezeno, zaderzhano, zaderzhannye (без
 * RU: содержимого), polya_kotoryh_net, polya_neizvestnye_vyvozu, otbor, filtr_otkuda, uzel,
 * RU: summa, fajl}; его словами печатает otchyot().
 * RU: Отказы (исключение с полем code; файла вывоза при отказе нет):
 * RU:   VYVOZ_NEIZVESTNYJ_KLYUCH — неизвестный ключ в `o`;
 * RU:   VYVOZ_DOGOVOR_YADRA      — ядро не загрузилось или отвечает вне договора (yadro.js);
 * RU:   VYVOZ_NET_OTKUDA         — не назван источник;
 * RU:   VYVOZ_OTBOR_NET_POLYA    — отбор по полю, которого в базе нет;
 * RU:   VYVOZ_NEZNAKOMYJ_KLASS   — ядро вернуло режим «neizvesten» хоть для одной записи;
 * RU:   ошибки SQLite и файловой системы проходят как есть.
 * RU: Чего НЕ ловит: секреты в формах, неизвестных фильтру ядра (в том числе закодированные внутри
 * RU: поля, например base64 в BLOB); правдивость записей; доставку файла адресату.
 * EN: Export memory from the database into a JSONL file (or just count — without `fajl`).
 * EN: Input: object `o` (see the block above) plus `krik` — a function for loud log messages
 * EN: (console.error by default).
 * EN: Order: keys → core contract → "otkuda" → read the database with selection → filter each
 * EN: record → header → atomic file write → log line in the database.
 * EN: Output: a result object {sled_v_zhurnale, vsego, vyvezeno, zaderzhano, zaderzhannye
 * EN: (without content), polya_kotoryh_net, polya_neizvestnye_vyvozu, otbor, filtr_otkuda, uzel,
 * EN: summa, fajl}; otchyot() renders it as text.
 * EN: Failures (an exception with a `code` field; no export file is produced on failure):
 * EN:   VYVOZ_NEIZVESTNYJ_KLYUCH — unknown key in `o`;
 * EN:   VYVOZ_DOGOVOR_YADRA      — the core did not load or answers outside the contract (yadro.js);
 * EN:   VYVOZ_NET_OTKUDA         — the source is not named;
 * EN:   VYVOZ_OTBOR_NET_POLYA    — selection by a field the database does not have;
 * EN:   VYVOZ_NEZNAKOMYJ_KLASS   — the core returned mode "neizvesten" for any record;
 * EN:   SQLite and filesystem errors pass through unchanged.
 * EN: Does NOT catch: secrets in shapes unknown to the core filter (including ones encoded inside
 * EN: a field, e.g. base64 in a BLOB); truthfulness of records; delivery of the file to its recipient.
 */
export async function vyvezti(o = {}) {
  // RU: Ключи проверяются ПЕРВЫМИ: опечатка в имени ключа уводит файл по умолчанию, и никакая
  // RU: проверка ниже этого не заметит — отчёт будет честен про НЕ ТОТ путь.
  // EN: Keys are checked FIRST: a typo in a key name silently falls back to defaults, and no
  // EN: check below would notice — the report would be honest about the WRONG path.
  proverit_klyuchi(o, KLYUCHI_VYVOZA, 'вывоз', 'VYVOZ_NEIZVESTNYJ_KLYUCH');
  const { baza, fajl, otkuda, yadro, otbor = {}, krik = console.error } = o;
  // RU: Вложенный отбор проверяется до загрузки ядра/чтения базы: опечатка не означает «всё».
  // EN: Validate nested selection before loading the core/reading the DB: a typo never means "all".
  if (otbor === null || typeof otbor !== 'object' || Array.isArray(otbor)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(otbor))) {
    const e = new Error('отбор: ожидается обычный объект {agent, klass, s, po}');
    e.code = 'VYVOZ_OTBOR_TYPE'; throw e;
  }
  proverit_klyuchi(otbor, ['agent', 'klass', 's', 'po'], 'отбор', 'VYVOZ_NEIZVESTNYJ_KLYUCH');
  for (const p of ['s', 'po']) {
    if (otbor[p] !== undefined && !Number.isFinite(otbor[p])) {
      const e = new Error(`отбор.${p}: ожидается конечное число миллисекунд epoch; API не разбирает строки дат`);
      e.code = 'VYVOZ_OTBOR_TYPE'; throw e;
    }
  }

  // RU: Договор проверяется ДО открытия базы: не смогли — файла не будет вовсе.
  // EN: The contract is checked BEFORE opening the database: if it fails, no file at all.
  const filtr = await vzyat_filtr(yadro);

  // RU: 🔴 «ОТКУДА» ОБЯЗАТЕЛЕН, УМОЛЧАНИЯ НЕТ (решение координатора 06.09.2026, условие
  // RU: автора предмета там же). Прежнее умолчание «неизвестно» вписывало в файл значение,
  // RU: за которое никто не отвечал, — и на той стороне оно бесполезно ровно тому, ради кого
  // RU: поле заведено: принимающий не знает, чья это память, а спросить уже некого.
  // RU: Отказ стоит ЗДЕСЬ, а не в скрипте: библиотеку зовут программы, и файл от этого
  // RU: уезжает так же. Проверка в одном месте на оба входа.
  // RU: ⚠️ ПОРЯДОК НАМЕРЕННЫЙ: договор ядра проверяется РАНЬШЕ. Договор ядра — про
  // RU: безопасность (нечем отличить секрет), «откуда» — про пригодность файла на той
  // RU: стороне. Безопасность вперёд; и заодно пробы на отказ ядра продолжают мерить
  // RU: отказ ядра, а не отсутствие «откуда».
  // EN: 🔴 "OTKUDA" IS REQUIRED, THERE IS NO DEFAULT (coordinator decision 06.09.2026, with the
  // EN: subject owner's condition). The former default "unknown" wrote into the file a value
  // EN: nobody was accountable for — useless on the other side to exactly the person the field
  // EN: exists for: the recipient does not know whose memory it is, and there is no one to ask.
  // EN: The refusal lives HERE, not in the script: programs call the library, and the file
  // EN: leaves just the same. One check for both entry points.
  // EN: ⚠️ THE ORDER IS DELIBERATE: the core contract is checked EARLIER. The core contract is
  // EN: about safety (no way to tell a secret), "otkuda" is about usability of the file on the
  // EN: other side. Safety first; and core-failure probes keep measuring core failure, not a
  // EN: missing "otkuda".
  if (typeof otkuda !== 'string' || !otkuda.trim()) {
    const e = new Error(
      'не назван источник: «откуда». Умолчания нет намеренно — подставленное значение '
      + 'уехало бы в файл как названное, и принимающая сторона прочла бы его как данные. '
      + 'Назовите источник явно (в скрипте: --otkuda <имя>)');
    e.code = 'VYVOZ_NET_OTKUDA';
    throw e;
  }

  // RU: База открывается только на чтение; набор полей берётся из самой базы (PRAGMA), а не
  // RU: предполагается. ⚠️ На базе без таблицы zapisi PRAGMA отвечает пусто, и отказ придёт
  // RU: ошибкой SQL из запроса ниже, а не отдельным понятным сообщением.
  // EN: The database is opened read-only; the field set is read from the database itself
  // EN: (PRAGMA), not assumed. ⚠️ On a database without a zapisi table PRAGMA returns nothing, and
  // EN: the failure arrives as an SQL error from the query below, not as a dedicated message.
  const db = new DatabaseSync(baza, { readOnly: true });
  let zapisi;
  try {
    const est = db.prepare("PRAGMA table_info(zapisi)").all().map((r) => r.name);
    const berem = POLYA.filter((p) => est.includes(p));
    // RU: Поля, которых в этой базе нет, называются вслух: молчаливая потеря при переносе
    // RU: неотличима от «этого поля и не было».
    // EN: Fields missing from this database are named out loud: a silent loss in transfer
    // EN: is indistinguishable from "this field never existed".
    const net = POLYA.filter((p) => !est.includes(p));
    // RU: 🔴 ОТБОР — ЧАСТЬ ВЫВОЗА, А НЕ ДЕЛО ВЫЗЫВАЮЩЕГО. Отобрать «потом, в отчёте» нельзя:
    // RU: фильтр секретов и сумма содержимого считаются по ТОМУ ЖЕ набору, что уезжает,
    // RU: и отбор после них сделал бы сумму ложной, а число задержанных — не про этот файл.
    // RU: Пустой отбор значит «всё», и это НЕ то же самое, что «отбор не сработал»:
    // RU: применённые условия печатаются в отчёте и кладутся в заголовок файла.
    // EN: 🔴 SELECTION IS PART OF THE EXPORT, NOT THE CALLER'S JOB. Selecting "later, in the
    // EN: report" is impossible: the secret filter and the content checksum are computed over the
    // EN: SAME set that leaves, and selecting afterwards would make the checksum false and the
    // EN: withheld count unrelated to this file. An empty selection means "everything", which is
    // EN: NOT the same as "selection did not apply": applied conditions are printed in the report
    // EN: and stored in the file header.
    // RU: Значения подставляются параметрами (?), а не вклеиваются в текст SQL.
    // EN: Values are bound as parameters (?), not spliced into the SQL text.
    const uslov = [], znach = [];
    if (otbor.agent != null)  { uslov.push('agent IS ?');    znach.push(otbor.agent); }
    if (otbor.klass != null)  { uslov.push('klass IS ?');    znach.push(otbor.klass); }
    if (otbor.s != null)      { uslov.push('sozdano >= ?');  znach.push(otbor.s); }
    if (otbor.po != null)     { uslov.push('sozdano <= ?');  znach.push(otbor.po); }
    // RU: Условие по полю, которого в базе нет, — ОТКАЗ, а не молчаливый пропуск условия:
    // RU: «отобрал по агенту» и «взял всё, потому что поля agent нет» дают разные файлы.
    // EN: A condition on a field the database lacks is a REFUSAL, not a silently skipped
    // EN: condition: "selected by agent" and "took everything because there is no agent field"
    // EN: produce different files.
    for (const [pole, zadano] of [['agent', otbor.agent], ['klass', otbor.klass],
                                  ['sozdano', otbor.s ?? otbor.po]]) {
      if (zadano != null && !est.includes(pole)) {
        const e = new Error(`отбор задан по полю «${pole}», которого в этой базе НЕТ. `
          + 'Пропустить условие молча нельзя: вывезлось бы больше, чем просили');
        e.code = 'VYVOZ_OTBOR_NET_POLYA';
        throw e;
      }
    }
    const gde = uslov.length ? ` WHERE ${uslov.join(' AND ')}` : '';
    zapisi = db.prepare(`SELECT id, ${berem.join(', ')} FROM zapisi${gde} ORDER BY id`).all(...znach);
    // RU: Списки полей вешаются свойствами прямо на массив строк — так они доезжают до итога.
    // EN: Field lists are attached as properties of the row array — that is how they reach the result.
    zapisi.nety_polya = net;
    // RU: Зеркальная проверка: поля, которые в базе ЕСТЬ, а вывоз о них не знает вовсе.
    // EN: Mirror check: fields that DO exist in the database but the export knows nothing about.
    zapisi.neznakomye_polya = neznakomye_polya(est);
  } finally {
    db.close();
  }

  const vyvezennye = [];
  const zaderzhannye = [];
  // RU: 🔴 Фильтр ядра судит КАЖДОЕ поле договора, которое уйдёт в файл, ровно в том виде, в каком уйдёт
  //     (объект — строкой JSON, прочее — String). Прежде фильтр видел только soderzhim, а поля istochnik,
  //     ocenki, podtverzhdenie и прочие уходили наружу без фильтра. soderzhim проверяется первым.
  //     Незнакомый класс в ЛЮБОМ поле останавливает весь вывоз, поэтому найденное запирающее поле не
  //     обрывает просмотр записи: остальные поля всё равно проверяются на незнакомый класс. Задержку
  //     называет первое запирающее поле; помечающий класс берётся из первого поля, где он найден.
  //     Чего НЕ ловит: секрет, которого фильтр ядра не узнаёт в тексте; поля вне POLYA (в файл не идут).
  // EN: 🔴 The core filter judges EVERY contract field that goes into the file, exactly as it goes there
  //     (an object as a JSON string, anything else via String). Before, the filter saw only soderzhim,
  //     while istochnik, ocenki, podtverzhdenie and the rest left unfiltered. soderzhim is checked first.
  //     An unknown class in ANY field stops the whole export, so a locking field found does not end the
  //     record's scan: the remaining fields are still checked for an unknown class. The hold is named by
  //     the first locking field; a marking class comes from the first field where it is found.
  //     Does NOT catch: a secret the core filter does not recognise; fields outside POLYA (not exported).
  const poryadok_polej = ['soderzhim', ...POLYA.filter((p) => p !== 'soderzhim')];
  for (const z of zapisi) {
    let r = { vyvozit: true }, tekst = '', pole = null;
    for (const p of poryadok_polej) {
      if (!(p in z) || z[p] === null || z[p] === undefined) continue;
      // RU: Поле-BLOB (Uint8Array из SQLite) в файл уходит массивом байтов — в нём фильтр секрета не увидит;
      //     поэтому байты проверяются ещё и как текст UTF-8.
      // EN: A BLOB field (Uint8Array from SQLite) goes to the file as a byte array where the filter cannot see a
      //     secret; so the bytes are also checked as UTF-8 text.
      const formy = [typeof z[p] === 'object' ? JSON.stringify(z[p]) : String(z[p])];
      if (z[p] instanceof Uint8Array) formy.push(Buffer.from(z[p]).toString('utf8'));
      for (const v of formy) {
        const rp = reshenie(filtr, v);
        if (rp.rezhim === 'neizvesten') { r = rp; break; }
        if (!rp.vyvozit) { if (r.vyvozit) { r = rp; tekst = v; pole = p; } continue; }
        if (rp.pometka && r.vyvozit && !r.pometka) r = rp;
      }
      if (r.rezhim === 'neizvesten') break;
    }
    // RU: 🔴 НЕЗНАКОМЫЙ КЛАСС ОСТАНАВЛИВАЕТ ВЕСЬ ВЫВОЗ, А НЕ ОДНУ ЗАПИСЬ (решение автора
    // RU: предмета, 05.09.2026). Довод: незнакомый класс значит, что ядро ушло вперёд, а мы
    // RU: о нём не знаем — под вопросом ВСЯ раскладка, а не одна строка. Пропустить остальное
    // RU: значило бы выпустить наружу набор, про который уже известно, что наше представление
    // RU: о нём неполно.
    // RU: ⚠️ ЦЕНА НАЗВАНА: один новый класс в фильтре останавливает вывоз до правки вывоза.
    // RU: Дороже, чем пропустить одну запись, и дешевле утечки. Обратимо: правится строкой.
    // EN: 🔴 AN UNKNOWN CLASS STOPS THE WHOLE EXPORT, NOT ONE RECORD (subject owner's decision,
    // EN: 05.09.2026). Reason: an unknown class means the core has moved ahead without us — the
    // EN: WHOLE classification is in question, not one line. Skipping the rest would ship out a
    // EN: set about which we already know our picture is incomplete.
    // EN: ⚠️ THE PRICE IS STATED: one new class in the filter stops the export until the export
    // EN: is updated. Costlier than skipping one record, cheaper than a leak. Reversible: a
    // EN: one-line change.
    if (r.rezhim === 'neizvesten') {
      const e = new Error(
        `вывоз ОСТАНОВЛЕН: класс «${r.klass}» ядру известен, а нам нет — режим «neizvesten». ` +
        'Это не одна запись: раз ядро ушло вперёд, под вопросом вся раскладка. ' +
        'Файла вывоза нет. Обновите вывоз под новый класс и повторите.');
      e.code = 'VYVOZ_NEZNAKOMYJ_KLASS';
      e.klass = r.klass;
      throw e;
    }
    if (!r.vyvozit) {
      // RU: 🔴 БЕЗ СОДЕРЖИМОГО. Отчёт о задержке не должен выносить то, ради чего задержка.
      // EN: 🔴 WITHOUT CONTENT. A report about withholding must not leak what was withheld.
      zaderzhannye.push({ id: z.id, pole, klass: r.klass, rezhim: r.rezhim, znakov: tekst.length });
      continue;
    }
    // RU: В файл идут только поля из POLYA (id базы не вывозится: номера на той стороне свои);
    // RU: класс «помечающего» секрета добавляется полем pometka_filtra.
    // EN: Only POLYA fields go into the file (the database id is not exported: the other side
    // EN: has its own ids); the class of a "marking" secret is added as pometka_filtra.
    const stroka = {};
    for (const p of POLYA) if (p in z) stroka[p] = z[p];
    if (r.pometka) stroka.pometka_filtra = r.pometka;
    vyvezennye.push(stroka);
  }

  // RU: Сумма содержимого считается по тем же строкам JSON, что лягут в файл, — побайтно.
  // EN: The content checksum is computed over the same JSON lines that go into the file — byte for byte.
  const neizvestnye = zapisi.neznakomye_polya ?? [];
  const stroki_zapisej = vyvezennye.map((s) => JSON.stringify(s));
  const shapka = {
    ...zagolovok({
      otkuda,
      // RU: 🔴 ЗДЕСЬ ЗАМЕР, А НЕ УМОЛЧАНИЕ — И РАЗНИЦУ НАДО ДЕРЖАТЬ, ЧТОБЫ СЛЕДУЮЩИЙ НЕ
      // RU: «ПОЧИНИЛ» ЭТУ СТРОКУ (внутренний долг №128, 06.09.2026).
      // RU:   УМОЛЧАНИЕ — подставить значение, которого НЕ ЗНАЕШЬ, чтобы поле не пустовало.
      // RU:   ЗАМЕР     — снять факт командой в момент действия.
      // RU: Признак различения: можно ли снять значение командой в этот самый миг. `otkuda`
      // RU: снять нечем — его знает только вызывающий, поэтому там отказ. `uzel` снимается
      // RU: ОС здесь и сейчас, и это факт о том, ГДЕ файл сделан.
      // RU: ⚠️ И сторона операции важна не меньше (поправка автора предмета): замер на
      // RU: ЧИТАЮЩЕЙ стороне вёл бы себя как умолчание — он отвечал бы про чужой узел при
      // RU: каждом чтении. Здесь сторона ПИШУЩАЯ, значение снимается ОДИН раз и переносом
      // RU: файла не переписывается.
      // RU: ⚠️ ЧЕГО ЭТО НЕ ЗАКРЫВАЕТ: в контейнере имя узла может быть не тем, что ожидает
      // RU: читающий. Отдельный вопрос, здесь не решается.
      // EN: 🔴 THIS IS A MEASUREMENT, NOT A DEFAULT — KEEP THE DISTINCTION SO THE NEXT PERSON DOES
      // EN: NOT "FIX" THIS LINE (internal debt #128, 06.09.2026).
      // EN:   DEFAULT     — substitute a value you DO NOT KNOW so the field is not empty.
      // EN:   MEASUREMENT — capture a fact with a command at the moment of the action.
      // EN: The test: can the value be captured by a command right now? `otkuda` cannot — only
      // EN: the caller knows it, hence the refusal there. `uzel` is reported by the OS here and
      // EN: now, and it is a fact about WHERE the file was made.
      // EN: ⚠️ The side of the operation matters as much (subject owner's correction): measuring
      // EN: on the READING side would behave like a default — it would report someone else's host
      // EN: on every read. Here it is the WRITING side; the value is captured ONCE and is not
      // EN: rewritten when the file is moved.
      // EN: ⚠️ WHAT THIS DOES NOT COVER: inside a container the host name may differ from what
      // EN: the reader expects. A separate question, not solved here.
      uzel: hostname(),
      zapisej: vyvezennye.length,
      zaderzhano: zaderzhannye.length,
      summa: summa_soderzhimogo(stroki_zapisej),
      neizvestnye,
    }),
    ...(Object.keys(otbor).length ? { otbor } : {}),
    chem_vyvezeno: `dsh-pamyat-vyvoz ${VERSIYA_PAKETA}`,
  };
  if (fajl) {
    const telo = [JSON.stringify(shapka), ...stroki_zapisej].join('\n') + '\n';
    // RU: 🔴 ЗАПИСЬ АТОМАРНАЯ: ВРЕМЕННЫЙ ФАЙЛ РЯДОМ, ЗАТЕМ ПЕРЕИМЕНОВАНИЕ (условие приёмки В6).
    // RU: Прямая запись оставляла бы при обрыве ПОЛУФАЙЛ С ПРАВИЛЬНЫМ ЗАГОЛОВКОМ — то есть
    // RU: предмет, который выглядит целым и читается как целый. Ввоз откажет по битой
    // RU: строке, но это смягчение, а не защита: обрыв мог прийтись на границу строки,
    // RU: и тогда файл разберётся молча и не полностью.
    // RU: Временный файл — РЯДОМ, в том же каталоге: перенос через границу разделов
    // RU: атомарным не является. Права 0600: в файле память агента.
    // RU: ⚠️ Стенд пакета ищет в ТЕКСТЕ этого файла вызов переименования и первый вызов
    // RU: записи файла (ждёт аргумент vrem) — в комментариях здесь их имена пишутся без скобки.
    // RU: Чего НЕ ловит: fsync не делается — при сбое питания файл может оказаться пустым или
    // RU: старым; одноимённый файл назначения заменяется без спроса.
    // EN: 🔴 THE WRITE IS ATOMIC: A TEMPORARY FILE NEXT TO IT, THEN A RENAME (acceptance
    // EN: condition V6). A direct write would leave, on interruption, a HALF-FILE WITH A VALID
    // EN: HEADER — something that looks whole and reads as whole. Import would reject a broken
    // EN: line, but that is mitigation, not protection: the cut could fall on a line boundary,
    // EN: and then the file would parse silently and incompletely.
    // EN: The temporary file is NEXT TO the target, in the same directory: a move across
    // EN: filesystem boundaries is not atomic. Mode 0600: the file holds agent memory.
    // EN: ⚠️ The package test stand searches the TEXT of this file for the rename call and the
    // EN: first file-write call (expects the argument vrem) — comments here name them without
    // EN: a parenthesis.
    // EN: Does NOT catch: no fsync is done — after a power loss the file may be empty or stale;
    // EN: an existing target file of the same name is replaced without asking.
    const vrem = `${fajl}.chastichnyj-${process.pid}`;
    try {
      writeFileSync(vrem, telo, { mode: 0o600 });
      renameSync(vrem, fajl);
    } catch (e) {
      try { unlinkSync(vrem); } catch { /* RU: нечего убирать / EN: nothing to clean up */ }
      throw e;
    }
  }

  // RU: 🔴 СЛЕД В ЖУРНАЛЕ — ПОСЛЕ ФАКТА, А НЕ ВМЕСТО НЕГО (условие приёмки В8). Пишем, когда
  // RU: файл уже лёг: строка «вывезено» до записи означала бы «собирались вывезти».
  // RU: Журнал — в той же базе (см. zhurnal.js), хотя саму базу вывоз открывал только на чтение.
  // EN: 🔴 THE LOG ENTRY COMES AFTER THE FACT, NOT INSTEAD OF IT (acceptance condition V8). It is
  // EN: written once the file is in place: an "exported" line before the write would mean
  // EN: "intended to export".
  // EN: The log lives in the same database (see zhurnal.js), even though the export itself
  // EN: opened the database read-only.
  const sled = zapisat_v_zhurnal({
    baza, agent: 'dsh-pamyat-vyvoz', klass: 'vyvoz-pamyati',
    ishod: fajl ? 'vypolneno' : 'tolko-otchyot',
    priroda: 'vynos-naruzhu',
    pochemu: `вывезено ${vyvezennye.length}, задержано ${zaderzhannye.length} из ${zapisi.length}; `
      + `узел ${hostname()}; фильтр из «${filtr.otkuda}»; сумма ${shapka.summa}`
      + (fajl ? `; файл ${fajl}` : '; файла нет — только отчёт'),
    istochnik: fajl ?? null,
    krik,
  });

  return {
    sled_v_zhurnale: sled,
    vsego: zapisi.length,
    vyvezeno: vyvezennye.length,
    zaderzhano: zaderzhannye.length,
    zaderzhannye,
    polya_kotoryh_net: zapisi.nety_polya ?? [],
    polya_neizvestnye_vyvozu: neizvestnye,
    otbor,
    filtr_otkuda: filtr.otkuda,
    // RU: Из ШАПКИ, а не вторым вызовом hostname(): отчёт остаётся у вывозящего, файл уезжает,
    // RU: и два вычисления одной величины разошлись бы молча. Одно значение — один источник.
    // EN: Taken from the HEADER, not from a second hostname() call: the report stays with the
    // EN: exporter, the file travels, and two computations of one value could silently diverge.
    // EN: One value — one source.
    uzel: shapka.uzel,
    summa: shapka.summa,
    fajl: fajl ?? null,
  };
}

/**
 * RU: Отчёт словами. Числа АБСОЛЮТНЫЕ (условие приёмки В13): доля описывала бы рост базы,
 * RU: а не состояние опасности — те же тридцать невыверенных записей через месяц читались бы
 * RU: как «почти всё чисто».
 * RU: Вход: итог vyvezti(). Выход: многострочный текст (без перевода строки в конце).
 * RU: Задержанные записи перечисляются по id, классу и длине — содержимое не печатается.
 * RU: Отказы: своих нет; объект не той формы (нет zaderzhannye или polya_kotoryh_net) даст
 * RU: TypeError. Чего НЕ ловит: не печатает путь файла, сумму и узел — они есть в итоге и
 * RU: в заголовке файла, но не в этом тексте.
 * EN: Text report. Numbers are ABSOLUTE (acceptance condition V13): a percentage would describe
 * EN: database growth, not the state of risk — the same thirty unchecked records would read a
 * EN: month later as "almost everything is clean".
 * EN: Input: the result of vyvezti(). Output: multi-line text (no trailing newline).
 * EN: Withheld records are listed by id, class and length — content is never printed.
 * EN: Failures: none of its own; an object of the wrong shape (no zaderzhannye or
 * EN: polya_kotoryh_net) raises a TypeError. Does NOT catch: it does not print the file path,
 * EN: checksum or host — they are in the result and in the file header, not in this text.
 */
export function otchyot(it) {
  const s = [];
  s.push(`[dsh-pamyat-vyvoz ${VERSIYA_PAKETA}] всего ${it.vsego}, вывезено ${it.vyvezeno}, задержано ${it.zaderzhano}`);
  s.push(`  фильтр взят из: ${it.filtr_otkuda}`);
  // RU: 🔴 ОТБОР ПЕЧАТАЕТСЯ ВСЕГДА, В ТОМ ЧИСЛЕ ПУСТОЙ. «Взято всё» и «отбор не применился»
  // RU: дают одинаковый файл и разные новости; молчание здесь читалось бы как первое.
  // EN: 🔴 THE SELECTION IS ALWAYS PRINTED, EVEN WHEN EMPTY. "Took everything" and "selection
  // EN: did not apply" give the same file and different news; silence here would read as the first.
  const usloviya = Object.entries(it.otbor ?? {}).filter(([, v]) => v != null);
  s.push(usloviya.length
    ? `  отбор: ${usloviya.map(([k, v]) => `${k}=${v}`).join(', ')} — вывезено ТОЛЬКО подходящее`
    : '  отбор: НЕ ЗАДАН — вывезена вся база (за вычетом задержанного фильтром)');
  if (it.polya_kotoryh_net.length) {
    s.push(`  ⚠️ полей нет в этой базе: ${it.polya_kotoryh_net.join(', ')} — они не перенесены`);
  }
  if ((it.polya_neizvestnye_vyvozu ?? []).length) {
    // RU: 🔴 ГРОМКО: это не «поля нет», это «поле ЕСТЬ, а мы о нём не знаем». Схема ушла
    // RU: вперёд, и без этой строки знание уехало бы молча: на той стороне поля просто не
    // RU: будет, и «не переносили» станет неотличимо от «не было».
    // EN: 🔴 LOUD: this is not "the field is missing", it is "the field EXISTS and we do not know
    // EN: it". The schema has moved ahead, and without this line knowledge would be lost silently:
    // EN: the field would simply be absent on the other side, and "not transferred" would become
    // EN: indistinguishable from "never existed".
    s.push(`  🔴 полей в базе, о которых вывоз НЕ ЗНАЕТ: ${it.polya_neizvestnye_vyvozu.join(', ')}`);
    s.push('     Они НЕ перенесены и не объявлены непереносимыми — схема базы ушла вперёд');
    s.push('     вывоза. Решите про каждое: вывозить (в POLYA) либо не вывозить с причиной');
    s.push('     (в NE_VYVOZITSYA). Список полей записан и в шапку файла вывоза.');
  }
  for (const z of it.zaderzhannye) {
    s.push(`  пропущена: запись ${z.id}${z.pole ? `, поле ${z.pole}` : ''} — ${z.klass} (${z.rezhim}), ${z.znakov} знаков, содержимое НЕ показано`);
  }
  if (!it.zaderzhano) {
    s.push('  задержано 0 — это «фильтр не нашёл запирающего», а НЕ «секретов нет»');
  }
  return s.join('\n');
}
