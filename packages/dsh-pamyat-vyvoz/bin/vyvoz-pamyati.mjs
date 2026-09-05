#!/usr/bin/env node
/**
 * ВЫВОЗ ПАМЯТИ — ОБЁРТКА ПОД РУКУ. Не плагин и не команда платформы.
 *
 * 🔴 ПОЧЕМУ СКРИПТ, А НЕ ПЛАГИН (решение координатора 05.09.2026, п.1).
 * Довод — цена против частоты, а не вкус: вывоз нужен РЕДКО (перенос между агентами,
 * восстановление, переезд машины), а команда платформы монтируется в КАЖДЫЙ ход агента —
 * цена постоянная, польза редкая, и каждый смонтированный механизм это ещё одно место
 * отказа. Скрипт зовётся тогда, когда нужен, и в ходах не участвует вовсе.
 *
 * ⚠️ ГРАНИЦА РЕШЕНИЯ, названа там же: понадобится вывоз ПО РАСПИСАНИЮ или из самого
 * агента — это ДРУГОЙ предмет, и решать его надо отдельно, а не расширять этот молча.
 *
 * ЧЕГО ЭТА ОБЁРТКА НЕ ДЕЛАЕТ:
 *   · не решает, куда девать файл, — путь называет вызывающий;
 *   · не переносит файл на другую машину: это отдельное действие и отдельная ответственность;
 *   · не молчит ни об одном отказе — коды разведены, см. ниже.
 *
 * КОДЫ ВОЗВРАТА (разведены намеренно, чтобы вызывающий различал причины):
 *   0  вывоз состоялся
 *   1  вывоз ОТКАЗАН по предмету (незнакомый класс, отбор по несуществующему полю)
 *   2  СЛЕПОТА: не смогли посмотреть (нет ядра, база не открылась, аргументы не поняты)
 */
import { vyvezti, otchyot } from '../src/vyvoz.js';

const SPRAVKA = `вывоз памяти агента в файл

  vyvoz-pamyati --baza <путь> [--fajl <путь>] [ключи]

  --baza <путь>     база памяти (открывается ТОЛЬКО на чтение)          обязателен
  --fajl <путь>     куда писать; БЕЗ него файл не создаётся — только отчёт
  --otkuda <имя>    как назвать источник в заголовке (умолчание «неизвестно»)
  --yadro <путь>    путь к фильтру ядра; без него ищется цепочкой
  --agent <имя>     вывезти только записи этого агента
  --klass <имя>     вывезти только этот класс
  --s <время>       записи не раньше (мс epoch либо ISO-дата)
  --po <время>      записи не позже

Без --fajl это ПРОБА: покажет, что уехало бы, и не создаст ничего.`;

function razobrat(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`не понял аргумент «${a}» — ключи начинаются с --`);
    const imya = a.slice(2);
    const znach = argv[i + 1];
    if (znach === undefined || znach.startsWith('--')) throw new Error(`у ключа --${imya} нет значения`);
    if (o[imya] !== undefined) throw new Error(`ключ --${imya} задан дважды: ${o[imya]} и ${znach}`);
    o[imya] = znach; i++;
  }
  return o;
}

// 🔴 ВРЕМЯ РАЗБИРАЕТСЯ СТРОГО. Строка, которую Date не понял, даёт NaN, а NaN в сравнении
// SQL молча не совпадает ни с чем — отбор вернул бы ноль записей и выглядел бы как
// «подходящего нет». Это отказ по НАШЕМУ вводу, и он обязан быть громким.
function vremya(v, imya) {
  if (v === undefined) return undefined;
  const chislo = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(chislo)) {
    throw new Error(`--${imya}: «${v}» не разбирается ни как мс epoch, ни как дата. `
      + 'Неразобранное время дало бы ПУСТОЙ отбор, неотличимый от «подходящего нет»');
  }
  return chislo;
}

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
    baza: o.baza, fajl: o.fajl, otkuda: o.otkuda ?? 'неизвестно',
    yadro: o.yadro, otbor, krik: (x) => console.error(x),
  });
  console.log(otchyot(it));
  if (!o.fajl) console.log('  ⚠️ --fajl не задан: это была ПРОБА, файл НЕ создан');
  process.exit(0);
} catch (e) {
  // Отказ по ПРЕДМЕТУ (1) и слепота инструмента (2) — разные новости, и вызывающий
  // должен различать их кодом, а не разбором прозы.
  const po_predmetu = ['VYVOZ_NEZNAKOMYJ_KLASS', 'VYVOZ_OTBOR_NET_POLYA'].includes(e.code);
  console.error(`${po_predmetu ? 'ОТКАЗ' : 'СЛЕПОТА'} (${e.code || 'без кода'}): ${e.message}`);
  process.exit(po_predmetu ? 1 : 2);
}
