#!/usr/bin/env node
/**
 * RU: ВЫВОЗ ПАМЯТИ — ОБЁРТКА ПОД РУКУ. Не плагин и не команда платформы.
 * EN: MEMORY EXPORT — A COMMAND-LINE WRAPPER. Not a plugin and not a platform command.
 *
 * RU: Что делает: разбирает ключи командной строки, превращает --s/--po во время в мс,
 * RU: зовёт vyvezti() из src/vyvoz.js и печатает otchyot() в stdout; отказы — в stderr.
 * RU: Без --fajl это проба: отчёт печатается, файл не создаётся (строка журнала в базе
 * RU: при этом всё равно пишется — с исходом «tolko-otchyot»).
 * EN: What it does: parses command-line keys, turns --s/--po into epoch ms, calls vyvezti() from
 * EN: src/vyvoz.js and prints otchyot() to stdout; failures go to stderr.
 * EN: Without --fajl it is a dry run: the report is printed, no file is created (a log row is
 * EN: still written to the database — with outcome "tolko-otchyot").
 *
 * RU: 🔴 ПОЧЕМУ СКРИПТ, А НЕ ПЛАГИН (решение координатора 05.09.2026, п.1).
 * RU: Довод — цена против частоты, а не вкус: вывоз нужен РЕДКО (перенос между агентами,
 * RU: восстановление, переезд машины), а команда платформы монтируется в КАЖДЫЙ ход агента —
 * RU: цена постоянная, польза редкая, и каждый смонтированный механизм это ещё одно место
 * RU: отказа. Скрипт зовётся тогда, когда нужен, и в ходах не участвует вовсе.
 * EN: 🔴 WHY A SCRIPT AND NOT A PLUGIN (coordinator decision 05.09.2026, item 1).
 * EN: The reason is cost versus frequency, not taste: export is needed RARELY (moving between
 * EN: agents, recovery, machine migration), while a platform command is mounted into EVERY agent
 * EN: turn — a constant cost for a rare benefit, and every mounted mechanism is one more place to
 * EN: fail. The script runs when needed and takes no part in turns at all.
 *
 * RU: ⚠️ ГРАНИЦА РЕШЕНИЯ, названа там же: понадобится вывоз ПО РАСПИСАНИЮ или из самого
 * RU: агента — это ДРУГОЙ предмет, и решать его надо отдельно, а не расширять этот молча.
 * EN: ⚠️ THE BOUNDARY OF THAT DECISION, stated in the same place: if export is ever needed ON A
 * EN: SCHEDULE or from inside the agent, that is a DIFFERENT subject, to be decided separately
 * EN: rather than by silently extending this one.
 *
 * RU: ЧЕГО ЭТА ОБЁРТКА НЕ ДЕЛАЕТ:
 * RU:   · не решает, куда девать файл, — путь называет вызывающий;
 * RU:   · не переносит файл на другую машину: это отдельное действие и отдельная ответственность;
 * RU:   · не молчит ни об одном отказе — коды разведены, см. ниже.
 * EN: WHAT THIS WRAPPER DOES NOT DO:
 * EN:   · it does not decide where the file goes — the caller names the path;
 * EN:   · it does not move the file to another machine: that is a separate action and a
 * EN:     separate responsibility;
 * EN:   · it does not stay silent about any failure — exit codes are distinct, see below.
 *
 * RU: КОДЫ ВОЗВРАТА (разведены намеренно, чтобы вызывающий различал причины):
 * RU:   0  вывоз состоялся
 * RU:   1  вывоз ОТКАЗАН по предмету (незнакомый класс, отбор по несуществующему полю)
 * RU:   2  СЛЕПОТА: не смогли посмотреть (нет ядра, база не открылась, аргументы не поняты)
 * EN: EXIT CODES (kept distinct on purpose so the caller can tell causes apart):
 * EN:   0  export completed
 * EN:   1  export REFUSED on the merits (unknown class, selection by a non-existent field)
 * EN:   2  BLINDNESS: could not look (no core, database did not open, arguments not understood)
 * RU: ⚠️ Вызов без аргументов и --pomoshch/--help печатают справку и тоже выходят с кодом 2.
 * EN: ⚠️ Running with no arguments or with --pomoshch/--help prints help and also exits with 2.
 */
import { vyvezti, otchyot } from '../src/vyvoz.js';

// RU: Текст справки (на русском) — строковый литерал, печатается как есть.
// EN: Help text (in Russian) — a string literal, printed as is.

const SPRAVKA = `вывоз памяти агента в файл

  vyvoz-pamyati --baza <путь> [--fajl <путь>] [ключи]

  --baza <путь>     база памяти (открывается ТОЛЬКО на чтение)          обязателен
  --fajl <путь>     куда писать; БЕЗ него файл не создаётся — только отчёт
  --otkuda <имя>    как назвать источник в заголовке                        обязателен
  --yadro <путь>    путь к фильтру ядра; без него ищется цепочкой
  --agent <имя>     вывезти только записи этого агента
  --klass <имя>     вывезти только этот класс
  --s <время>       записи не раньше (мс epoch либо ISO-дата)
  --po <время>      записи не позже

Без --fajl это ПРОБА: покажет, что уехало бы, и не создаст ничего.`;

// RU: Разбор ключей: только пары «--имя значение». Отказ (исключение) на аргумент без --,
// RU: на ключ без значения, повтор или неизвестное имя. Неизвестное имя отказывает ДО вывоза.
// EN: Key parsing: only "--name value" pairs. Throws on an argument without --, on a key with
// EN: no value, a repeated key or an unknown name. An unknown name is refused BEFORE export.
const KLYUCHI_CLI = ['baza', 'fajl', 'otkuda', 'yadro', 'agent', 'klass', 's', 'po'];
function razobrat(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`не понял аргумент «${a}» — ключи начинаются с --`);
    const imya = a.slice(2);
    if (!KLYUCHI_CLI.includes(imya)) throw new Error(`неизвестный ключ --${imya}; известны: ${KLYUCHI_CLI.map(k => '--' + k).join(', ')}`);
    const znach = argv[i + 1];
    if (znach === undefined || znach.startsWith('--')) throw new Error(`у ключа --${imya} нет значения`);
    if (o[imya] !== undefined) throw new Error(`ключ --${imya} задан дважды: ${o[imya]} и ${znach}`);
    o[imya] = znach; i++;
  }
  return o;
}

// RU: 🔴 ВРЕМЯ РАЗБИРАЕТСЯ СТРОГО. Строка, которую Date не понял, даёт NaN, а NaN в сравнении
// RU: SQL молча не совпадает ни с чем — отбор вернул бы ноль записей и выглядел бы как
// RU: «подходящего нет». Это отказ по НАШЕМУ вводу, и он обязан быть громким.
// RU: Вход: строка или undefined. Выход: мс epoch либо undefined. Только цифры — это мс;
// RU: остальное отдаётся Date.parse (дата ISO без пояса трактуется по правилам JS).
// EN: 🔴 TIME IS PARSED STRICTLY. A string Date does not understand gives NaN, and NaN in an SQL
// EN: comparison silently matches nothing — the selection would return zero records and look
// EN: like "nothing matches". This is a failure of OUR input, and it must be loud.
// EN: Input: a string or undefined. Output: epoch ms or undefined. Digits only means ms;
// EN: anything else goes to Date.parse (an ISO date without a zone follows JS rules).
function vremya(v, imya) {
  if (v === undefined) return undefined;
  const chislo = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(chislo)) {
    throw new Error(`--${imya}: «${v}» не разбирается ни как мс epoch, ни как дата. `
      + 'Неразобранное время дало бы ПУСТОЙ отбор, неотличимый от «подходящего нет»');
  }
  return chislo;
}

// RU: Справка выходит с кодом 2: вывоза не было, и вызывающий не должен прочесть это как успех.
// EN: Help exits with code 2: no export happened, and the caller must not read it as success.
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--pomoshch') || argv.includes('--help')) {
  console.log(SPRAVKA); process.exit(2);
}

let o;
try { o = razobrat(argv); } catch (e) { console.error(`СЛЕПОТА: ${e.message}\n\n${SPRAVKA}`); process.exit(2); }
if (!o.baza) { console.error(`СЛЕПОТА: не задан --baza\n\n${SPRAVKA}`); process.exit(2); }

let otbor;
try {
  otbor = { agent: o.agent, klass: o.klass, s: vremya(o.s, 's'), po: vremya(o.po, 'po') };
} catch (e) { console.error(`СЛЕПОТА: ${e.message}`); process.exit(2); }

try {
  const it = await vyvezti({
    // RU: 🔴 УМОЛЧАНИЯ ЗДЕСЬ НЕТ: `?? 'неизвестно'` убрано 06.09.2026. Отказ даёт библиотека —
    // RU: один предикат на оба входа, чтобы скрипт и программа не разошлись молча.
    // EN: 🔴 THERE IS NO DEFAULT HERE: `?? 'неизвестно'` ("unknown") was removed on 06.09.2026.
    // EN: The library does the refusing — one predicate for both entry points, so the script and
    // EN: programmatic callers cannot silently diverge.
    baza: o.baza, fajl: o.fajl, otkuda: o.otkuda,
    yadro: o.yadro, otbor, krik: (x) => console.error(x),
  });
  console.log(otchyot(it));
  if (!o.fajl) console.log('  ⚠️ --fajl не задан: это была ПРОБА, файл НЕ создан');
  process.exit(0);
} catch (e) {
  // RU: Отказ по ПРЕДМЕТУ (1) и слепота инструмента (2) — разные новости, и вызывающий
  // RU: должен различать их кодом, а не разбором прозы.
  // RU: ⚠️ Всё, что не в списке двух кодов ниже, считается слепотой — в том числе
  // RU: VYVOZ_NET_OTKUDA, VYVOZ_NEIZVESTNYJ_KLYUCH и ошибки записи файла.
  // EN: A refusal ON THE MERITS (1) and tool blindness (2) are different news, and the caller
  // EN: must tell them apart by exit code, not by parsing prose.
  // EN: ⚠️ Anything not in the two-code list below counts as blindness — including
  // EN: VYVOZ_NET_OTKUDA, VYVOZ_NEIZVESTNYJ_KLYUCH and file write errors.
  const po_predmetu = ['VYVOZ_NEZNAKOMYJ_KLASS', 'VYVOZ_OTBOR_NET_POLYA'].includes(e.code);
  console.error(`${po_predmetu ? 'ОТКАЗ' : 'СЛЕПОТА'} (${e.code || 'без кода'}): ${e.message}`);
  process.exit(po_predmetu ? 1 : 2);
}
