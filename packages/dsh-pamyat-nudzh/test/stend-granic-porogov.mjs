/**
 * RU: Стенд границ порогов: негодный порог ОТКЛОНЯЕТСЯ и при старте, и при горячей загрузке; действует прежнее
 *     годное (при старте — умолчание); годная смена принимается. Десять проб: старт с негодной долей, годная
 *     горячая смена, негодная горячая смена (предел и доля), действие прежнего годного (тревога по нему),
 *     бесконечность, возврат после отказа, законность predel 0; отметки пути [0.5, 1.5] и опечатка [50] —
 *     строка «ОТКЛОНЕНО», возврат к годным отметкам — без неё.
 *     Горячая загрузка здесь — fiber.update(настройка) на настоящем Context: тот же путь, что у загрузчика
 *     платформы при правке настройки без смены имени (перезапуск apply, модуль тот же).
 *     ⚠️ ГРАНИЦА: cordis здесь — тот, что рядом с пакетом; у живой платформы свой экземпляр.
 *     🔴 ПОРЯДОК ПРОБ ВАЖЕН: прежнее годное живёт на уровне модуля, поэтому проба «старт с негодным → умолчание»
 *     обязана идти ПЕРВОЙ в процессе.
 *     Чего не проверяет: отметки пути нечислового вида — их отсекает схема (z.number()) до apply.
 *     Запуск: node test/stend-granic-porogov.mjs из каталога пакета; код 0 — все пробы зелёные, 1 — есть
 *     красные, 2 — СЛЕПОТА (предмет не загрузился, обычно не установлены зависимости: npm install).
 * EN: Threshold bounds stand: an invalid threshold is REJECTED both at start-up and on hot reload; the previous
 *     valid value stays in force (the default at start-up); a valid change is accepted. Ten probes: start
 *     with an invalid fraction, a valid hot change, an invalid hot change (limit and fraction), the previous
 *     valid value actually acting (alarm by it), infinity, return after a rejection, predel 0 being legal;
 *     path marks [0.5, 1.5] and a typo [50] — an "ОТКЛОНЕНО" line, a return to valid marks — without it.
 *     Hot reload here is fiber.update(settings) on a real Context: the same path the platform loader takes when
 *     settings are edited without a name change (apply re-runs, the module stays).
 *     ⚠️ BOUNDARY: cordis here is the one next to the package; the live platform has its own instance.
 *     🔴 PROBE ORDER MATTERS: the previous valid value lives at module level, so the "start with an invalid
 *     value → default" probe must run FIRST in the process.
 *     Not checked: non-numeric path marks — the schema (z.number()) cuts them off before apply.
 *     Run: node test/stend-granic-porogov.mjs from the package directory; exit 0 — all probes green, 1 — some
 *     are red, 2 — BLINDNESS (the subject did not load, usually dependencies are missing: npm install).
 */
let name, Config, apply, Context
try {
  ;({ Context } = await import('@deepseek-ai/cordis'))
  ;({ name, Config, apply } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const vernulos = await f();
    // RU: Возврат тела учитывается, а не выбрасывается: проба судит по исключению, и любой возврат, кроме
    //     молчания, — это ошибка обёртки, а не зелёное.
    // EN: The body's return value is checked, not discarded: the probe judges by exception, and any return
    //     other than silence is a wrapper error, not green.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 180)); } };

const pauza = () => new Promise((r) => setTimeout(r, 50));
async function slushaya(f) {
  const kriki = []; const prezhnij = console.error;
  console.error = (...a) => kriki.push(a.join(' '));
  try { await f(); await pauza(); } finally { console.error = prezhnij; }
  return kriki.join('\n');
}
const podyom = (t) => (t.match(/подъём: предел (\S+) ток\., доля тревоги (\S+)/) ?? []).slice(1).join(' ');

const k = new Context();
let fiber;

await proba('старт с негодной долей → ОТКЛОНЕНО, действует умолчание 0.8', async () => {
  const t = await slushaya(() => { fiber = k.plugin({ name, Config, apply }, { predel: 1000, dolyaTrevogi: 7 }); });
  if (!/ОТКЛОНЕНО: dolyaTrevogi = 7 — вне допуска \(0, 1\]; действует 0\.8 \(умолчание\)/.test(t)) throw new Error('нет отказа: ' + t.slice(0, 160));
  if (podyom(t) !== '1000 0.8') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('горячая годная смена → принята, отказа нет', async () => {
  const t = await slushaya(() => fiber.update({ predel: 2000, dolyaTrevogi: 0.6 }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('годное отклонено: ' + t.slice(0, 160));
  if (podyom(t) !== '2000 0.6') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('горячая негодная смена → ОТКЛОНЕНО, прежнее годное живо (доля и предел)', async () => {
  const t = await slushaya(() => fiber.update({ predel: -1, dolyaTrevogi: 0 }));
  if (!/ОТКЛОНЕНО: predel = -1 — вне допуска \[0, ∞\); действует 2000 \(прежнее годное\)/.test(t)) throw new Error('предел: ' + t.slice(0, 200));
  if (!/ОТКЛОНЕНО: dolyaTrevogi = 0 — вне допуска \(0, 1\]; действует 0\.6 \(прежнее годное\)/.test(t)) throw new Error('доля: ' + t.slice(0, 200));
  if (podyom(t) !== '2000 0.6') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('прежнее годное ДЕЙСТВУЕТ, а не только печатается: тревога по порогу 2000×0.6', async () => {
  const t = await slushaya(() => k.nudzhPamyati.uchest({ inputTokens: 1300, outputTokens: 0 }));
  if (!/пора подтолкнуть/.test(t)) throw new Error('при занятости 1300 из 2000 (порог 1200) молчит: ' + t.slice(0, 160));
});

await proba('бесконечность — не число предела → ОТКЛОНЕНО', async () => {
  const t = await slushaya(() => fiber.update({ predel: Infinity, dolyaTrevogi: 0.6 }));
  if (!/ОТКЛОНЕНО: predel = Infinity/.test(t)) throw new Error('принята: ' + t.slice(0, 160));
});

await proba('возврат: годная смена после отказа → принята, отказа нет', async () => {
  const t = await slushaya(() => fiber.update({ predel: 1000, dolyaTrevogi: 1 }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('годное отклонено: ' + t.slice(0, 160));
  if (podyom(t) !== '1000 1') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('predel 0 по-прежнему законен (предел неизвестен) — не отклоняется', async () => {
  const t = await slushaya(() => fiber.update({ predel: 0 }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('ноль отклонён: ' + t.slice(0, 160));
  if (!/предел контекста НЕ ЗАДАН/.test(t)) throw new Error('нет строки про незаданный предел');
});

// RU: ОТМЕТКИ ПУТИ ВНЕ (0, 1) ОТКЛОНЯЮТСЯ СТРОКОЙ (04.10.2026). Прежде фильтр в apply выбрасывал их молча: [0.5, 1.5]
//     давал строку только для 50 %, а опечатка [50] вместо [0.5] выглядела как пустой список.
// EN: PATH MARKS OUTSIDE (0, 1) ARE REJECTED WITH A LINE (04.10.2026). Previously the filter in apply dropped them
//     silently: [0.5, 1.5] gave a line only for 50 %, and a typo [50] instead of [0.5] looked like an empty list.
await proba('отметки [0.5, 1.5] → ОТКЛОНЕНО называет 1.5, отметка 50% действует', async () => {
  const t = await slushaya(() => fiber.update({ predel: 1000, dolyaTrevogi: 0.9, otmetkiPuti: [0.5, 1.5] }));
  if (!/ОТКЛОНЕНО: otmetkiPuti — вне допуска \(0, 1\) отброшены 1\.5; действуют 0\.5\./.test(t)) throw new Error('нет отказа: ' + t.slice(0, 200));
  const t2 = await slushaya(() => k.nudzhPamyati.uchest({ inputTokens: 600, outputTokens: 0 }));
  if (!/отметка пути 50%/.test(t2)) throw new Error('годная отметка 50% не действует: ' + t2.slice(0, 160));
});

await proba('опечатка [50] → ОТКЛОНЕНО, «действуют никакие»', async () => {
  const t = await slushaya(() => fiber.update({ predel: 1000, dolyaTrevogi: 0.9, otmetkiPuti: [50] }));
  if (!/ОТКЛОНЕНО: otmetkiPuti — вне допуска \(0, 1\) отброшены 50; действуют никакие/.test(t)) throw new Error('нет отказа: ' + t.slice(0, 200));
});

await proba('возврат: годные отметки [0.3, 0.6] → ОТКЛОНЕНО нет', async () => {
  const t = await slushaya(() => fiber.update({ predel: 1000, dolyaTrevogi: 0.9, otmetkiPuti: [0.3, 0.6] }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('годное отклонено: ' + t.slice(0, 160));
});

console.log(`\nИтог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
