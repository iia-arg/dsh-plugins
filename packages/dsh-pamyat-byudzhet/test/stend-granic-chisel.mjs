/**
 * RU: Стенд границ чисел: негодный предел или порог веры ОТКЛОНЯЕТСЯ и при старте, и при горячей загрузке;
 *     действует прежнее годное (при старте — умолчание); годная смена принимается.
 *     Горячая загрузка здесь — fiber.update(настройка) на настоящем Context: тот же путь, что у загрузчика
 *     платформы при правке настройки без смены имени (перезапуск apply, модуль тот же).
 *     Граница: cordis здесь — тот, что рядом с пакетом; у живой платформы свой экземпляр.
 *     ПОРЯДОК ПРОБ ВАЖЕН: прежнее годное живёт на уровне модуля, поэтому проба «старт с негодным → умолчание»
 *     обязана идти ПЕРВОЙ в процессе.
 *     Чего не проверяет: настройку poryadok — она при монтаже не проверяется вовсе.
 *     Запуск: node test/stend-granic-chisel.mjs; код 0 — всё зелёное, 1 — красные.
 * EN: Number bounds stand: an invalid limit or confidence threshold is REJECTED both at start-up and on hot
 *     reload; the previous valid value stays in force (the default at start-up); a valid change is accepted.
 *     Hot reload here is fiber.update(settings) on a real Context: the same path the platform loader takes when
 *     settings are edited without a name change (apply re-runs, the module stays).
 *     Boundary: cordis here is the one next to the package; the live platform has its own instance.
 *     PROBE ORDER MATTERS: the previous valid value lives at module level, so the "start with an invalid value
 *     → default" probe must run FIRST in the process.
 *     What it does not check: the poryadok setting — it is not validated at mount at all.
 *     Run: node test/stend-granic-chisel.mjs; exit 0 — all green, 1 — red.
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
    //     молчания, — ошибка обёртки, а не зелёное.
    // EN: The body's return value is taken into account, not discarded: the probe judges by exceptions, and any
    //     return other than silence is a wrapper error, not green.
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
const podyom = (t) => (t.match(/подъём: предел (\S+) ед\., порядок «\S+», порог веры (\S+)\. Тепло/) ?? []).slice(1).join(' ');

const k = new Context();
let fiber;

await proba('старт с негодным порогом веры → ОТКЛОНЕНО, действует умолчание 0.5', async () => {
  const t = await slushaya(() => { fiber = k.plugin({ name, Config, apply }, { predel: 300, porogVery: 3 }); });
  if (!/ОТКЛОНЕНО: porogVery = 3 — вне допуска \[0, 1\]; действует 0\.5 \(умолчание\)/.test(t)) throw new Error('нет отказа: ' + t.slice(0, 160));
  if (podyom(t) !== '300 0.5') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('горячая годная смена → принята, отказа нет', async () => {
  const t = await slushaya(() => fiber.update({ predel: 100, porogVery: 0.7 }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('годное отклонено: ' + t.slice(0, 160));
  if (podyom(t) !== '100 0.7') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('горячая негодная смена → ОТКЛОНЕНО, прежнее годное живо (предел и порог)', async () => {
  const t = await slushaya(() => fiber.update({ predel: -5, porogVery: -0.1 }));
  if (!/ОТКЛОНЕНО: predel = -5 — вне допуска \[0, ∞\); действует 100 \(прежнее годное\)/.test(t)) throw new Error('предел: ' + t.slice(0, 200));
  if (!/ОТКЛОНЕНО: porogVery = -0\.1 — вне допуска \[0, 1\]; действует 0\.7 \(прежнее годное\)/.test(t)) throw new Error('порог: ' + t.slice(0, 200));
  if (podyom(t) !== '100 0.7') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('прежнее годное ДЕЙСТВУЕТ, а не только печатается: отбор идёт под пределом 100', async () => {
  let itog;
  await slushaya(() => { itog = k.byudzhetPamyati.otobrat({ zapisi: [] }); });
  if (itog?.svodka?.predel !== 100) throw new Error('отбор под пределом ' + itog?.svodka?.predel);
});

await proba('не число (NaN) → ОТКЛОНЕНО', async () => {
  const t = await slushaya(() => fiber.update({ predel: NaN, porogVery: 0.7 }));
  if (!/ОТКЛОНЕНО: predel = NaN/.test(t)) throw new Error('принято: ' + t.slice(0, 160));
});

await proba('возврат: годная смена после отказа → принята, отказа нет', async () => {
  const t = await slushaya(() => fiber.update({ predel: 2000, porogVery: 1 }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('годное отклонено: ' + t.slice(0, 160));
  if (podyom(t) !== '2000 1') throw new Error('в силе не то: «' + podyom(t) + '»');
});

await proba('predel 0 по-прежнему законен («не поднимать ничего») — не отклоняется', async () => {
  const t = await slushaya(() => fiber.update({ predel: 0 }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('ноль отклонён: ' + t.slice(0, 160));
  if (!/предел равен нулю/.test(t)) throw new Error('нет строки про нулевой предел');
});

// RU: ПОРЯДОК ПРОВЕРЯЕТСЯ ПРИ МОНТАЖЕ (04.10.2026). Прежде неизвестная строка принималась, и КАЖДЫЙ отбор бросал.
// EN: THE ORDER IS CHECKED AT MOUNT TIME (04.10.2026). Previously an unknown string was accepted, and EVERY selection threw.
await proba('неизвестный порядок → ОТКЛОНЕНО, действует прежний годный', async () => {
  const t = await slushaya(() => fiber.update({ predel: 2000, poryadok: 'novizna' }));
  if (!/ОТКЛОНЕНО: poryadok = "novizna" — есть только svezhest, vera; действует «svezhest» \(прежний годный\)/.test(t)) throw new Error('нет отказа: ' + t.slice(0, 200));
});
await proba('после отказа отбор работает, а не бросает', async () => {
  let itog;
  await slushaya(() => { itog = k.byudzhetPamyati.otobrat({ zapisi: [] }); });
  if (itog?.svodka?.poryadok !== 'svezhest') throw new Error('отбор под порядком ' + itog?.svodka?.poryadok);
});
await proba('возврат: годный порядок vera → принят, отказа нет', async () => {
  const t = await slushaya(() => fiber.update({ predel: 2000, poryadok: 'vera' }));
  if (/ОТКЛОНЕНО/.test(t)) throw new Error('годное отклонено: ' + t.slice(0, 160));
  if (!/порядок «vera»/.test(t)) throw new Error('в силе не vera: ' + t.slice(0, 160));
});

console.log(`\nИтог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
