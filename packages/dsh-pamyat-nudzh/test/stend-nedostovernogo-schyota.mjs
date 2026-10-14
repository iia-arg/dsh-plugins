/**
 * RU: Стенд защиты «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН» (17.09.2026).
 *     🔴 ЗАЧЕМ ОН ЗАВЕДЁН. Защита пришла в работу 16.09 и НЕ БЫЛА ПОКРЫТА НИЧЕМ: замер по пяти прежним стендам
 *     дал «НЕДОСТОВЕРЕН» 0 вхождений, а порча — снятие строки `if (nedostoverno) return;` — оставила все 56
 *     проб зелёными. То есть предмета в области стендов НЕ БЫЛО ВОВСЕ, и снести защиту можно было одной
 *     строкой, ничего не уронив.
 *     ЧТО ИМЕННО ПРОВЕРЯЕТСЯ — тремя разными вопросами, а не одним. ОБЛАСТЬ — настоящий предмет: плагин
 *     поднимается на живом Context в отдельном процессе, дёргается его РЕАЛЬНЫЙ сервис nudzhPamyati.uchest;
 *     копии логики в стенде нет ни одной. МАСКА — ищем не «assert прошёл», а ДВЕ строки в настоящем stderr:
 *     «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН» (должна быть) и «пора подтолкнуть к компакту» (должна ОТСУТСТВОВАТЬ);
 *     вторая половина несущая: цель защиты — не «сказать», а НЕ ТОЛКНУТЬ. ЕДИНИЦА — токены одного вызова:
 *     занятость = вход ПОСЛЕДНЕГО вызова (input + cacheRead + cacheWrite), а не сумма за сессию.
 *     ПОДСТАВНОЙ ВХОД НЕСЁТ ТО СВОЙСТВО, РАДИ КОТОРОГО ЗАЩИТА СУЩЕСТВУЕТ: занятость СТРОГО БОЛЬШЕ окна. Числа
 *     взяты из настоящего повода (16.09): занято 9594222 при окне 1000000 — 959 %.
 *     ⚠️ ЧЕГО ЭТОТ СТЕНД НЕ ЛОВИТ: занижение счёта и любое неверное число В ПРЕДЕЛАХ окна; накопительный счёт между
 *     1 и 1,5 окна защита тоже не ловит — стенд проверяет только, что тревога в этой полосе несёт пометку «выше
 *     объявленного окна», а текст защиты называет полосу.
 *     Запуск: node test/stend-nedostovernogo-schyota.mjs из каталога пакета; код 0 — все пробы зелёные, 1 —
 *     есть красные, 2 — СЛЕПОТА (предмет не загрузился, обычно не установлены зависимости: npm install).
 * EN: Stand for the "OCCUPANCY COUNT NOT CREDIBLE" guard (17.09.2026).
 *     🔴 WHY IT EXISTS. The guard went into operation on 16.09 and WAS COVERED BY NOTHING: a measurement over
 *     the five earlier stands found "НЕДОСТОВЕРЕН" 0 times, and a corruption — removing the line `if
 *     (nedostoverno) return;` — left all 56 probes green. So the subject was NOT IN THE STANDS' SCOPE AT ALL,
 *     and the guard could be removed with one line without breaking anything.
 *     WHAT EXACTLY IS CHECKED — with three different questions, not one. SCOPE — the real subject: the plugin
 *     starts on a live Context in a separate process, its REAL service nudzhPamyati.uchest is called; there is
 *     no copy of the logic in the stand. MASK — we look not for "the assert passed" but for TWO lines in the
 *     real stderr: "СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН" (must be there) and "пора подтолкнуть к компакту" (must be
 *     ABSENT); the second half carries the weight: the guard's purpose is not to "say" but NOT TO PUSH. UNIT —
 *     tokens of one call: occupancy = input of the LAST call (input + cacheRead + cacheWrite), not the session
 *     sum.
 *     THE FAKE INPUT CARRIES THE PROPERTY THE GUARD EXISTS FOR: occupancy STRICTLY ABOVE the window. The
 *     numbers come from the real occasion (16.09): occupied 9594222 with a window of 1000000 — 959 %.
 *     ⚠️ WHAT THIS STAND DOES NOT CATCH: under-counting and any wrong number WITHIN the window; a cumulative
 *     count between 1 and 1.5 windows is not caught by the guard either — the stand only checks that the alarm in
 *     this band carries the "above the declared window" mark and that the guard's text names the band.
 *     Run: node test/stend-nedostovernogo-schyota.mjs from the package directory; exit 0 — all probes green, 1
 *     — some are red, 2 — BLINDNESS (the subject did not load, usually dependencies are missing: npm install).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
const OKNO = 1000000;          // RU: объявленное окно модели · EN: the model's declared window
const NEVOZMOZHNO = 1.5;       // RU: тот же запас, что в предмете · EN: the same margin as in the subject
const POVOD = 9594222;         // RU: число из настоящего повода (959 % окна) · EN: the number from the real occasion (959 % of the window)

let vsego = 0, proshlo = 0;
// RU: Обёртка судит по ИСКЛЮЧЕНИЮ: возврат `false` молча зеленел бы.
// EN: The wrapper judges by EXCEPTION: returning `false` would silently turn green.
const sud = (v) => { if (v !== undefined && v !== true) throw new Error(
  'тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ'); };
const proba = (imya, f) => { vsego++; try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + '\n       ' + e.message.slice(0, 400)); } };

// RU: podnyat(telo) — поднять пакет на настоящем Context в отдельном процессе node, выполнить telo и вернуть
//     stdout и stderr процесса.
// EN: podnyat(telo) — start the package on a real Context in a separate node process, run telo and return the
//     process's stdout and stderr.
function podnyat(telo) {
  const kod = `
    import { Context } from '@deepseek-ai/cordis';
    import { name, Config, apply } from './src/index.js';
    const k = new Context();
    k.plugin({ name, Config, apply }, { predel: ${OKNO} });
    setTimeout(() => { ${telo} }, 50);
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

// RU: 🔴 СЛЕПОТА, А НЕ РАСХОЖДЕНИЕ. Без зависимостей дочерний процесс не поднимется, и «предмет сломан» было бы
//     неправдой: проверить не удалось. Код 2, словами.
// EN: 🔴 BLINDNESS, NOT A MISMATCH. Without dependencies the child process does not start, and "the subject is
//     broken" would be false: checking was impossible. Exit 2, in words.
{
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "import '@deepseek-ai/cordis';"],
    { cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000 });
  if (/ERR_MODULE_NOT_FOUND/.test(r.stderr ?? '')) {
    console.log('СЛЕПОТА: предмет не загрузился — не установлены зависимости пакета');
    console.log('  Выполните `npm install` в каталоге пакета и повторите.');
    process.exit(2);
  }
}

const KRIK = /СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН/;
const TREVOGA = /пора подтолкнуть к компакту/;
const skolko = (s, re) => (s.match(new RegExp(re.source, 'g')) ?? []).length;

proba('стенд годен: предмет поднимается и его сервис жив (контроль зрячести стола)', () => {
  const r = podnyat("console.log('EST', typeof k.nudzhPamyati?.uchest);");
  if (!/EST function/.test(r.stdout)) throw new Error(
    'ПРЕДМЕТ НЕ ПОДНЯЛСЯ, и тогда все прочие пробы этого стенда ничего не значат: '
    + r.stderr.slice(0, 250));
});

proba('НЕДОСТОВЕРНО: занято ' + POVOD + ' при окне ' + OKNO + ' → защита ГОВОРИТ и называет ЧИСЛА', () => {
  const r = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${POVOD} });`);
  if (!KRIK.test(r.stderr)) throw new Error(
    'ЗАЩИТА НЕ СРАБОТАЛА. Предмет: src/index.js, ветка `i.zanyato > predel * NEVOZMOZHNO`. '
    + 'Цель: при занятости выше окна НЕ верить прибору. Занятость ' + POVOD + ' при окне '
    + OKNO + ' (959%) обязана дать строку «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН». stderr: '
    + r.stderr.slice(0, 250));
  if (!r.stderr.includes(String(POVOD)) || !r.stderr.includes(String(OKNO))) throw new Error(
    'Строка есть, а ЧИСЕЛ в ней нет. Предмет: текст крика. Цель: по строке должно быть видно, '
    + 'ЧТО именно сочли недостоверным — иначе её нечем проверить задним числом.');
});

proba('ЦЕЛЬ ЗАЩИТЫ: при недостоверном счёте тревога переполнения НЕ подана', () => {
  const r = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${POVOD} });`);
  if (TREVOGA.test(r.stderr)) throw new Error(
    'ЗАЩИТА ГОВОРИТ, НО НЕ ДЕЙСТВУЕТ: тревога «пора подтолкнуть к компакту» всё равно подана. '
    + 'Предмет: строка `if (nedostoverno) return;` в src/index.js. Цель защиты — не «сказать», '
    + 'а НЕ ТОЛКАТЬ к компакту по ложному основанию: именно от этого было семь ложных тревог '
    + 'за неделю у одного из агентов. Крик без выхода из ветки цели не достигает.');
});

proba('КРАЕВОЕ РАВЕНСТВО: занято РОВНО ' + OKNO + ' (= окну) → защита МОЛЧИТ, тревога подана', () => {
  const r = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${OKNO} });`);
  if (KRIK.test(r.stderr)) throw new Error(
    'ЛОЖНАЯ ТРЕВОГА ЗАЩИТЫ: занятость, равная окну, объявлена недостоверной. Предмет: сравнение '
    + '`>` в ветке недостоверности. Цель: полное окно — законное состояние, а не поломка прибора.');
  if (!TREVOGA.test(r.stderr)) throw new Error(
    'Защита промолчала верно, но обычная работа сломана: при занятости ' + OKNO + ' из ' + OKNO
    + ' тревога переполнения обязана прозвучать. Предмет: ветка `perejden`.');
});

proba('ГРАНИЦА СТРОГАЯ: ровно ' + OKNO * NEVOZMOZHNO + ' молчит, на единицу больше — говорит', () => {
  const rovno = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${OKNO * NEVOZMOZHNO} });`);
  if (KRIK.test(rovno.stderr)) throw new Error(
    'Граница нестрогая: ровно предел*' + NEVOZMOZHNO + ' сочтён недостоверным. Предмет: `>` против `>=`. '
    + 'Цель: запас 1.5 взят потому, что объявленное окно бывает МЕНЬШЕ настоящего — значит '
    + 'ровно на границе прибору ещё верим.');
  const bolshe = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${OKNO * NEVOZMOZHNO + 1} });`);
  if (!KRIK.test(bolshe.stderr)) throw new Error(
    'Граница не действует: превышение предела*' + NEVOZMOZHNO + ' на ЕДИНИЦУ не поймано. '
    + 'Предмет: та же ветка. Проба на большом числе одна этого не различает.');
});

proba('ОДИН РАЗ ЗА ЦИКЛ: три недостоверных вызова подряд → крик ровно ОДИН', () => {
  const r = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${POVOD} });`
    + `k.nudzhPamyati.uchest({ inputTokens: ${POVOD + 1} });`
    + `k.nudzhPamyati.uchest({ inputTokens: ${POVOD + 2} });`);
  const n = skolko(r.stderr, KRIK);
  if (n !== 1) throw new Error(
    'Крик прозвучал ' + n + ' раз вместо одного. Предмет: флаг `schetNedostoveren`. Цель: строка, '
    + 'повторяющаяся на каждом вызове, превращает защиту в шум, и её перестают читать.');
});

proba('ОБЫЧНОЕ: 800000 из ' + OKNO + ' (80%) → защита молчит, тревога подана', () => {
  const r = podnyat('k.nudzhPamyati.uchest({ inputTokens: 800000 });');
  if (KRIK.test(r.stderr)) throw new Error(
    'Защита сработала на ЗАКОННОМ числе — 80% окна. Предмет: порог недостоверности.');
  if (!TREVOGA.test(r.stderr)) throw new Error(
    'Обычная работа сломана: на пороге 80% тревога обязана прозвучать.');
});

proba('ГРАНИЧНЫЕ ВХОДЫ: не задан · пустой · ноль · мусор · пробелы — ни падения, ни ложного крика', () => {
  const sluchai = [
    ['usage не задан', 'undefined'],
    ['usage пустой объект', '{}'],
    ['ноль', '{ inputTokens: 0 }'],
    ['мусор в поле', "{ inputTokens: 'abc' }"],
    ['пробелы в поле', "{ inputTokens: '   ' }"],
  ];
  const bedy = [];
  for (const [imya, vyrazhenie] of sluchai) {
    const r = podnyat(`try { k.nudzhPamyati.uchest(${vyrazhenie}); console.log('PROSHLO'); }`
      + ` catch (e) { console.log('OTKAZ', e.message.slice(0, 70)); }`);
    if (KRIK.test(r.stderr)) bedy.push(imya + ': ЛОЖНЫЙ крик недостоверности');
    if (!/PROSHLO|OTKAZ/.test(r.stdout)) bedy.push(imya + ': предмет УПАЛ без именованного отказа — '
      + (r.stderr.split('\n').find((s) => /Error/.test(s)) ?? '').slice(0, 90));
  }
  if (bedy.length) throw new Error(
    'Предмет: путь usage → schet.uchest → i.zanyato. Цель: негодный вход обязан вести в ОТКАЗ '
    + 'или в тихий пропуск, но НИКОГДА в ложное обвинение прибора. Беды: ' + bedy.join(' | '));
});

// RU: ПОЛОСА МЕЖДУ 1 И 1,5 ОКНА (04.10.2026). Накопительный счёт, не переросший полтора окна, защита не ловит по
//     построению — по одному числу он неотличим от честного, когда настоящее окно больше объявленного. Поэтому
//     тревога в этой полосе подаётся, но с пометкой, а текст защиты называет полосу среди того, чего не ловит.
// EN: THE BAND BETWEEN 1 AND 1.5 WINDOWS (04.10.2026). A cumulative count that has not outgrown one and a half
//     windows is not caught by the guard by construction — from one number it is indistinguishable from an
//     honest one when the real window is larger than declared. So the alarm in this band is raised, but marked,
//     and the guard's text names the band among what it does not catch.
const POMETKA = /ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА \((\d+)%\)/;
proba('ПОЛОСА: занято 1200000 при окне ' + OKNO + ' → тревога С ПОМЕТКОЙ «выше объявленного окна (120%)»', () => {
  const r = podnyat("k.nudzhPamyati.uchest({ inputTokens: 1200000 });");
  if (!TREVOGA.test(r.stderr)) throw new Error('тревоги нет: ' + r.stderr.slice(0, 200));
  if (r.stderr.match(POMETKA)?.[1] !== '120') throw new Error('нет пометки (или не 120%): ' + r.stderr.slice(0, 300));
});
proba('ВОЗВРАТ: занято 900000 из ' + OKNO + ' → тревога БЕЗ пометки', () => {
  const r = podnyat("k.nudzhPamyati.uchest({ inputTokens: 900000 });");
  if (!TREVOGA.test(r.stderr)) throw new Error('тревоги нет: ' + r.stderr.slice(0, 200));
  if (POMETKA.test(r.stderr)) throw new Error('пометка в пределах окна: ' + r.stderr.slice(0, 300));
});
proba('ТЕКСТ ЗАЩИТЫ называет полосу среди того, чего не ловит', () => {
  const r = podnyat(`k.nudzhPamyati.uchest({ inputTokens: ${POVOD} });`);
  if (!/ЧЕГО ЭТА ЗАЩИТА НЕ ЛОВИТ:[^\n]*накопительный счёт, пока он не перерос полтора окна/.test(r.stderr))
    throw new Error('граница описана неполно: ' + (r.stderr.match(/ЧЕГО ЭТА ЗАЩИТА НЕ ЛОВИТ:[^\n]*/)?.[0] ?? r.stderr).slice(0, 300));
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
