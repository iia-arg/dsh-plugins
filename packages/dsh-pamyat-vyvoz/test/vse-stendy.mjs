/**
 * RU: Прогон ВСЕХ стендов пакета одной командой.
 * EN: Runs ALL test stands of the package with one command.
 *
 * RU: Вход: аргументов нет; стенды — файлы stend-*.mjs в каталоге этого файла, перечень
 *     снимается с диска. Выход: код 0 — все зелёные; 1 — хоть один разошёлся; 2 — расхождений
 *     нет, но есть слепота (стенд вернул код вне 0/1, убит сигналом, либо стендов нет вовсе).
 * EN: Input: no arguments; the stands are stend-*.mjs files in this file's directory, the list
 *     is read from disk. Output: exit 0 — all green; 1 — at least one diverged; 2 — no divergence
 *     but blindness (a stand exited outside 0/1, was killed by a signal, or there are no stands).
 *
 * RU: 🔴 ЗАВЕДЁН 04.09.2026 ПО ЗАМЕРУ У ПОЛУЧАТЕЛЯ, а не по вкусу. Прежде `scripts.test`
 *     был цепочкой `node A && node B && …`, и у неё два порока, каждый измерен:
 *       1. ПЕРЕЧЕНЬ ВЁЛСЯ РУКОЙ. Он называл шесть стендов из девяти: не звались
 *          stend-filtra-vhoda (31 проба), stend-dolgovremennoj (10), stend-ocheredi-dostavki
 *          (19) — шестьдесят проб самой свежей работы. Здесь перечень СНИМАЕТСЯ С ДИСКА,
 *          поэтому «забыли вписать новый стенд» невозможно по устройству, а не по памяти.
 *       2. `&&` ОБРЫВАЕТ ЦЕПЬ НА ПЕРВОМ НЕНУЛЕВОМ КОДЕ. В чистой установке одного лишь
 *          ядра stend-dolgovremennoj законно слепнет (нет пакета секретаря рядом) и отдаёт
 *          2 — и получатель видел ОДИН стенд из девяти вместо всех. Слепота одной пробы
 *          не повод не проверять остальное.
 * EN: 🔴 INTRODUCED 2026-09-04 BASED ON A MEASUREMENT AT THE RECEIVING SIDE, not taste. Previously
 *     `scripts.test` was a chain `node A && node B && …`, with two flaws, each measured:
 *       1. THE LIST WAS KEPT BY HAND. It named six stands out of nine: stend-filtra-vhoda
 *          (31 probes), stend-dolgovremennoj (10) and stend-ocheredi-dostavki (19) were never
 *          run — sixty probes of the most recent work. Here the list IS READ FROM DISK, so
 *          "forgot to add a new stand" is impossible by design, not by memory.
 *       2. `&&` BREAKS THE CHAIN ON THE FIRST NON-ZERO CODE. In a clean install of the core alone,
 *          stend-dolgovremennoj is legitimately blind (no secretary package nearby) and exits
 *          2 — and the receiver saw ONE stand out of nine instead of all. Blindness of one
 *          probe is no reason to skip checking the rest.
 *
 * RU: ИСХОД: расхождение (1) важнее слепоты (2) — так же, как во всех наших стендах.
 *     Слепота отдельного стенда НЕ гасится: она названа в сводке и уходит в код возврата,
 *     иначе «проверить нечем» стало бы неотличимо от «проверено».
 * EN: OUTCOME: divergence (1) outranks blindness (2) — as in all our stands.
 *     Blindness of a single stand is NOT suppressed: it is named in the summary and goes into
 *     the exit code, otherwise "nothing to check with" would be indistinguishable from "checked".
 *
 * RU: Чего НЕ ловит: файл, названный не по образцу stend-*.mjs, не гоняется — только
 *     называется; вывод стендов не разбирается — судится лишь код возврата.
 * EN: What it does NOT catch: a file not named stend-*.mjs is not run — only named;
 *     the stands' output is not parsed — only the exit code is judged.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const katalog = dirname(fileURLToPath(import.meta.url));
const svoyo = 'vse-stendy.mjs';
const stendy = readdirSync(katalog)
  .filter((f) => f.startsWith('stend-') && f.endsWith('.mjs') && f !== svoyo)
  .sort();

// RU: 🔴 ФАЙЛЫ, КОТОРЫЕ НЕ ПОПАЛИ ПОД МАСКУ, — НАЗЫВАЕМ ВСЛУХ (05.09.2026).
//     Обход каталога снял беду «забыли вписать стенд в перечень», но оставил соседнюю:
//     стенд, названный не по образцу (`dogovor.mjs` вместо `stend-dogovora.mjs`), не гоняется
//     и МОЛЧИТ. Замер: у пакета с прогоном через маску оболочки такой файл возвращал код 1,
//     а итог выходил 0 — красный стенд не гонялся, и никто не узнал.
//     Здесь не отказ и не догадка: просто список того, что рядом и мимо. Судить человеку.
// EN: 🔴 FILES THAT MISSED THE PATTERN ARE NAMED ALOUD (2026-09-05).
//     Walking the directory removed the "forgot to list the stand" problem but left a neighbour:
//     a stand named off-pattern (`dogovor.mjs` instead of `stend-dogovora.mjs`) is not run
//     and stays SILENT. Measured: in a package that ran stands via a shell glob, such a file
//     exited 1 while the total came out 0 — a red stand was never run, and nobody knew.
//     This is neither a refusal nor a guess: just a list of what lies nearby and is skipped.
//     A human decides.
const mimo = readdirSync(katalog)
  .filter((f) => f.endsWith('.mjs') && f !== svoyo && !f.startsWith('stend-'));
if (mimo.length) {
  console.log(`⚠️  рядом лежат .mjs НЕ по образцу «stend-*» и потому не гоняются: ${mimo.join(', ')}`);
  console.log('   Это не отказ: переименуйте, если это стенд, либо не обращайте внимания.');
}

// RU: Ни одного стенда — это слепота (код 2), а не «всё зелёное».
// EN: No stands at all is blindness (exit 2), not "all green".
if (!stendy.length) {
  console.log('СЛЕПОТА: стендов рядом не найдено вовсе — прогонять нечего');
  console.log(`  область обхода: ${katalog}, шаблон stend-*.mjs`);
  process.exit(2);
}

// RU: Каждый стенд — отдельный процесс тем же node (process.execPath), вывод идёт насквозь.
//     status равен null, если стенд убит сигналом, — такой исход считается слепотой (2).
// EN: Each stand runs as a separate process with the same node (process.execPath), output
//     passes through. status is null when a stand is killed by a signal — counted as blindness (2).
const ishody = [];
for (const s of stendy) {
  const r = spawnSync(process.execPath, [join(katalog, s)], { stdio: 'inherit' });
  ishody.push({ stend: s, kod: r.status ?? 2 });
}

const razoshlis = ishody.filter((i) => i.kod === 1);
const slepye    = ishody.filter((i) => i.kod !== 0 && i.kod !== 1);
// RU: 🔴 ЧИСЛО СОСЕДЕЙ — В ИТОГОВУЮ СТРОКУ, А НЕ ТОЛЬКО В ТЕЛО ВЫВОДА (05.09.2026).
//     Строка «рядом лежат .mjs не по образцу» печаталась выше, среди прогона, — то есть там,
//     где её никто не читает: читают ИТОГ. Положи кто-то стенд с опечаткой в имени — итог
//     зелёный, «52/52», и предупреждение уедет туда же, куда уезжают все строки, на которые
//     не смотрят. Кода 1 при этом НЕ ставим: рядом законно лежат вспомогательные модули,
//     и красное на них обесценило бы сигнал. Число в итоге — достаточно и постоянного
//     красного не создаёт.
// EN: 🔴 THE NUMBER OF NEIGHBOURS GOES INTO THE SUMMARY LINE, NOT ONLY THE BODY (2026-09-05).
//     The "off-pattern .mjs nearby" line used to be printed above, amid the run — where nobody
//     reads it: people read the SUMMARY. If someone drops a stand with a typo in its name, the
//     summary is green, "52/52", and the warning scrolls away with every other unread line.
//     We do NOT set exit 1 for it: helper modules legitimately live nearby, and red on them
//     would devalue the signal. A count in the summary is enough and creates no permanent red.
const hvost_mimo = mimo.length ? ` · ${mimo.length} ${mimo.length === 1 ? 'файл' : 'файлов'} рядом НЕ гонялся` : '';
console.log(`\n═══ стендов ${stendy.length} · зелёных ${ishody.length - razoshlis.length - slepye.length}`
  + ` · расхождений ${razoshlis.length} · слепота ${slepye.length}${hvost_mimo}`);
if (mimo.length) console.log(`    рядом мимо образца: ${mimo.join(', ')} — переименуйте, если это стенды`);
console.log(`    область обхода: ${katalog}, шаблон stend-*.mjs — перечень СНЯТ С ДИСКА, не записан`);
for (const i of [...razoshlis, ...slepye]) console.log(`    ${i.kod === 1 ? '🔴 разошёлся' : '⚠️  слепота'}: ${i.stend}`);

// RU: Расхождение важнее слепоты: «нашли беду» сильнее, чем «проверить нечем».
// EN: Divergence outranks blindness: "found a defect" is stronger than "nothing to check with".
process.exit(razoshlis.length ? 1 : (slepye.length ? 2 : 0));
