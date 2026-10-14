#!/usr/bin/env node
/**
 * RU: Команда подсчёта состояний доверия для внешнего периодического сторожа. Вызов: node
 *    src/schet-doveriya.mjs <agent>=<absolute-path-to-pamyat.db> [...]. На каждую базу печатается отдельная
 *    строка; внешняя служба сохраняет её в журнал и может обнаруживать новые отмены. Сам скрипт не планирует
 *    запуски и не отправляет тревоги.
 * EN: Trust-state counting command for an external periodic watcher. Invoke: node src/schet-doveriya.mjs
 *    <agent>=<absolute-path-to-pamyat.db> [...]. It prints one line per database; an external service stores
 *    that line in its journal and can detect new revocations. The script itself neither schedules runs nor
 *    sends alerts.
 *
 * RU: База открывается через node:sqlite DatabaseSync с readOnly:true, без otkrytHranilishche: открытие
 *    хранилища может мигрировать схему, а привилегированный читатель мог бы создать файлы с неподходящим
 *    владельцем. Формула берётся из src/doverie.js, как при выдаче; считаются классы
 *    KLASSY_ZNANIY_UMOLCHANIE, а не все произвольные классы базы.
 * EN: The database is opened through node:sqlite DatabaseSync with readOnly:true, without
 *    otkrytHranilishche: opening storage can migrate the schema, and a privileged reader could create files
 *    owned by the wrong account. The formula comes from src/doverie.js, as in retrieval; only
 *    KLASSY_ZNANIY_UMOLCHANIE classes are counted, not every arbitrary class in the database.
 *
 * RU: Код 0 означает, что все указанные базы сосчитаны; код 2 — неверный формат аргументов или ошибка хотя
 *    бы одной базы. Неудавшееся чтение помечается «СЛЕПОТА», а не нулём, после чего обработка остальных баз
 *    продолжается. Состояние доверия не является проверкой истинности знания.
 * EN: Exit code 0 means all supplied databases were counted; code 2 means invalid argument format or failure
 *    for at least one database. A read failure is marked “СЛЕПОТА” (“unable to observe”), not zero, and
 *    processing continues for the remaining databases. Trust state is not a test of knowledge truth.
 */
import { DatabaseSync } from 'node:sqlite';
import { schetDoveriya } from './doverie.js';
import { KLASSY_ZNANIY_UMOLCHANIE } from './index.js';

const dovody = process.argv.slice(2);
if (!dovody.length || dovody.some((d) => !/^[a-z][a-z0-9_-]*=\/./.test(d))) {
  console.error('ОТКАЗ: формат — schet-doveriya.mjs <агент>=<путь pamyat.db> [...]; получено: ' + JSON.stringify(dovody));
  process.exit(2);
}
let kod = 0;
for (const d of dovody) {
  const [agent, put] = [d.slice(0, d.indexOf('=')), d.slice(d.indexOf('=') + 1)];
  let baza;
  try {
    baza = new DatabaseSync(put, { readOnly: true });
    const { vsego, schet, otmenena } = schetDoveriya(baza, [...KLASSY_ZNANIY_UMOLCHANIE]);
    console.log(`доверие ${agent}: знаний ${vsego} · ` + Object.entries(schet).map(([s, n]) => `${s} ${n}`).join(' · ')
      + ` · otmenena_id [${otmenena.join(',')}]`);
  } catch (e) {
    kod = 2;
    console.log(`доверие ${agent}: СЛЕПОТА — база ${put} не прочиталась (${String(e?.message ?? e).slice(0, 120)}); это «не измерено», не ноль`);
  } finally {
    try { baza?.close(); } catch {}
  }
}
process.exit(kod);
