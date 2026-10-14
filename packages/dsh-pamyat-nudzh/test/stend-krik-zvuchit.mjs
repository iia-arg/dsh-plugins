/**
 * RU: Стенд звука: подталкивание должно быть СЛЫШНО в реальном потоке.
 *     Стенд порогов ловит console.error внутри своего процесса — то есть спрашивает «ушло ли в консоль». Здесь
 *     спрашивается строже: дошло ли до настоящего stderr отдельного процесса под живым Context. Между вызовом и
 *     проверкой не остаётся ни одной нашей подделки.
 *     Шесть проб: стенд годен (нудж поднимается), ctx.logger есть и нем (предпосылка выбора console.error),
 *     подталкивание слышно, в нём названа полнота учёта, незаданный предел сказан вслух, версия в строке
 *     подъёма взята из своего package.json.
 *     Запуск: node test/stend-krik-zvuchit.mjs из каталога пакета; код 0 — все пробы зелёные, 1 — есть красные,
 *     2 — СЛЕПОТА (предмет не загрузился, обычно не установлены зависимости: npm install).
 * EN: Sound stand: the nudge must be AUDIBLE in a real stream.
 *     The thresholds stand catches console.error inside its own process — it asks "did it go to the console".
 *     This one asks more strictly: did it reach the real stderr of a separate process under a live Context. Not
 *     a single fake of ours remains between the call and the check.
 *     Six probes: the stand is valid (the package starts), ctx.logger exists and is mute (the premise for
 *     choosing console.error), the nudge is audible, it names the completeness of counting, an unset limit is
 *     said aloud, the version in the start-up line comes from our own package.json.
 *     Run: node test/stend-krik-zvuchit.mjs from the package directory; exit 0 — all probes green, 1 — some are
 *     red, 2 — BLINDNESS (the subject did not load, usually dependencies are missing: npm install).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
const NAZVANIE = 'dsh-pamyat-nudzh';
let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => { vsego++; try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 200)); } };

// RU: podnyat(kod) — запустить код отдельным процессом node (ESM из строки) в каталоге пакета и вернуть его
//     stdout и stderr; предел 20 секунд.
// EN: podnyat(kod) — run code in a separate node process (ESM from a string) in the package directory and
//     return its stdout and stderr; 20-second limit.
function podnyat(kod) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

// RU: 🔴 СЛЕПОТА, А НЕ РАСХОЖДЕНИЕ (03.09.2026). Без установленных зависимостей дочерний процесс не поднимется
//     вовсе, и первая же проба сообщила бы «не поднялся» — код 1, то есть «предмет сломан». Это неправда:
//     проверить не удалось. Спрашиваем ОДИН раз и отвечаем словами с кодом 2.
// EN: 🔴 BLINDNESS, NOT A MISMATCH (03.09.2026). Without installed dependencies the child process does not start
//     at all, and the very first probe would report "did not start" — exit 1, i.e. "the subject is broken".
//     That is false: checking was impossible. We ask ONCE and answer in words with exit 2.
{
  const rProba = podnyat("import '@deepseek-ai/cordis';")
  if (/ERR_MODULE_NOT_FOUND/.test(rProba.stderr)) {
    console.log('СЛЕПОТА: предмет не загрузился — не установлены зависимости пакета')
    console.log('  Выполните `npm install` в каталоге пакета и повторите.')
    process.exit(2)
  }
}

// RU: OSNOVA(telo) — общий пролог дочернего процесса: настоящий Context, пакет из src/index.js и ожидание
//     применения плагина (50 мс).
// EN: OSNOVA(telo) — the common prologue of the child process: a real Context, the package from src/index.js
//     and a wait for the plugin to apply (50 ms).
const OSNOVA = (telo) => `
  import { Context } from '@deepseek-ai/cordis';
  import { name, Config, apply } from './src/index.js';
  const k = new Context();
  const kogdaGotovo = (f) => setTimeout(f, 50);
  ${telo}
`;

proba('стенд годен: нудж поднимается на настоящем Context', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 1000 });
    kogdaGotovo(() => console.log('PODNYALSYA', typeof k.nudzhPamyati?.uchest));
  `));
  if (!/PODNYALSYA function/.test(r.stdout)) throw new Error('не поднялся: ' + r.stderr.slice(0, 200));
});

proba('ПРЕДПОСЫЛКА: настоящий ctx.logger ЕСТЬ и НЕМ', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    if (typeof k.logger?.error !== 'function') { console.log('NET-LOGGERA'); process.exit(0); }
    k.logger.error('ETU-STROKU-NIKTO-NE-USLYSHIT');
    console.log('EST-I-NEM');
  `);
  if (/NET-LOGGERA/.test(r.stdout)) throw new Error('логгера нет — платформа сменилась');
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) throw new Error('логгер СТАЛ звучать');
});

proba('ГЛАВНОЕ: подталкивание слышно в stderr настоящего процесса', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 1000, dolyaTrevogi: 0.8 });
    kogdaGotovo(() => k.nudzhPamyati.uchest({ inputTokens: 900, outputTokens: 0 }));
  `));
  if (!/dsh-pamyat-nudzh/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
  if (!/пора подтолкнуть/.test(r.stderr)) throw new Error('порог перешли молча: ' + r.stderr.slice(0, 200));
});

proba('в громком подталкивании названа ПОЛНОТА учёта', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 100, dolyaTrevogi: 0.5 });
    kogdaGotovo(() => { k.nudzhPamyati.uchest(undefined); k.nudzhPamyati.uchest({ inputTokens: 60, outputTokens: 0 }); });
  `));
  if (!/БЕЗ ЧИСЛА/.test(r.stderr)) throw new Error('пропуски не названы: ' + r.stderr.slice(0, 200));
});

proba('ПРЕДЕЛ НЕ ЗАДАН: молчаливой бесполезности не бывает', () => {
  const r = podnyat(OSNOVA(`k.plugin({ name, Config, apply }, { predel: 0 });`));
  if (!/НЕ ЗАДАН/.test(r.stderr)) throw new Error('поднялся молча при нулевом пределе');
});

// RU: 🔴 ВЕРСИЯ В СТРОКЕ ПОДЪЁМА СВЕРЯЕТСЯ С МАНИФЕСТОМ, А НЕ С ШАБЛОНОМ. Правило 03.09.2026: по журналу должно
//     быть видно, какую редакцию держит процесс. Проба сравнивает напечатанное с package.json — иначе
//     версия-константа прошла бы её, а при следующем выпуске строка утверждала бы номер, которому код не
//     соответствует.
//     ⚠️ Где НЕ работает: проба не проверяет, что строка подъёма безусловна — это соседняя проба; и не заметит,
//     если манифест сам врёт про свою версию.
// EN: 🔴 THE VERSION IN THE START-UP LINE IS CHECKED AGAINST THE MANIFEST, NOT A PATTERN. Rule of 03.09.2026:
//     the log must show which revision the process holds. The probe compares what was printed with package.json
//     — otherwise a constant version would pass it, and at the next release the line would assert a number the
//     code does not match.
//     ⚠️ Where it does NOT work: the probe does not check that the start-up line is unconditional — that is the
//     neighbouring probe; and it will not notice if the manifest itself lies about its version.
proba('версия в строке подъёма взята из СВОЕГО манифеста', () => {
  const { version } = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf8'));
  // RU: Плагин надо ПОДНЯТЬ: пустое тело даёт процесс, который ничего не монтирует, и «своих строк нет»
  //     означало бы «мы его не звали», а не «он молчит».
  // EN: The plugin must be STARTED: an empty body gives a process that mounts nothing, and "no lines of ours"
  //     would mean "we did not call it", not "it is silent".
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 1000 });
    kogdaGotovo(() => {});
  `));
  if (!r.stderr.includes('[' + NAZVANIE + ' ' + version + ']'))
    throw new Error(`в stderr нет «[${NAZVANIE} ${version}]»; напечатано: ` +
      (r.stderr.split('\n').find((l) => l.includes(NAZVANIE)) ?? '(ни одной своей строки)'));
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
