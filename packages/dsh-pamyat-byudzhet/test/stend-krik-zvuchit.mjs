/**
 * Стенд звука: отказ бюджета должен быть СЛЫШЕН в реальном потоке.
 *
 * Проверяется КОНЕЧНЫЙ результат — строка в `stderr` отдельного процесса под
 * настоящим Context, а не факт вызова функции вывода. Причина в src/index.js,
 * раздел «Знаемое про вывод»: `ctx.logger` cordis 4.0.1 есть, вызов проходит,
 * а сообщение ложится в кольцевой буфер внутри процесса и наружу не выходит.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
const NAZVANIE = 'dsh-pamyat-byudzhet';
let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 200)); } };

function podnyat(kod) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '' };
}

// 🔴 СЛЕПОТА, А НЕ РАСХОЖДЕНИЕ (03.09.2026). Без установленных зависимостей
// дочерний процесс не поднимется вовсе, и первая же проба сообщила бы
// «не поднялся» — код 1, то есть «предмет сломан». Это неправда: проверить
// не удалось. Спрашиваем ОДИН раз и отвечаем словами с кодом 2.
{
  const rProba = podnyat("import '@deepseek-ai/cordis';")
  if (/ERR_MODULE_NOT_FOUND/.test(rProba.stderr)) {
    console.log('СЛЕПОТА: предмет не загрузился — не установлены зависимости пакета')
    console.log('  Выполните `npm install` в каталоге пакета и повторите.')
    process.exit(2)
  }
}

// 🔴 Служба появляется НЕ СРАЗУ: cordis применяет плагин асинхронно, и сразу
// после `k.plugin(...)` контекст её ещё не знает. Первая редакция стенда
// спрашивала синхронно и красила ИСПРАВНЫЙ пакет — стенд был негоден, а
// выглядело это как «пакет не публикует службу». Поймала проба-на-исправном.
const OSNOVA = (telo) => `
  import { Context } from '@deepseek-ai/cordis';
  import { name, Config, apply } from './src/index.js';
  const k = new Context();
  const kogdaGotovo = (f) => setTimeout(f, 50);
  ${telo}
`;

proba('стенд годен: бюджет поднимается на настоящем Context', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 100 });
    kogdaGotovo(() => console.log('PODNYALSYA', typeof k.byudzhetPamyati?.otobrat));
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
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) throw new Error('логгер СТАЛ звучать — перечитать вместе с krik');
});

proba('ГЛАВНОЕ: «поднято НЕ ВСЁ» слышно в stderr настоящего процесса', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 20 });
    kogdaGotovo(() => k.byudzhetPamyati.otobrat({ zapisi: [
      { soderzhim: 'а'.repeat(300), sozdano: 2, vera: null },
      { soderzhim: 'б'.repeat(300), sozdano: 1, vera: 0.1 },
    ] }));
  `));
  if (!/dsh-pamyat-byudzhet/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
  if (!/поднято НЕ ВСЁ/.test(r.stderr)) throw new Error('отброс прошёл молча: ' + r.stderr.slice(0, 200));
});

proba('в громком отказе НАЗВАНЫ причины и сказано, что единицы НЕ токены', () => {
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 20 });
    kogdaGotovo(() => k.byudzhetPamyati.otobrat({ zapisi: [{ soderzhim: 'а'.repeat(300), sozdano: 1, vera: null }] }));
  `));
  if (!/НЕИЗМЕРЕННОЙ верой/.test(r.stderr)) throw new Error('причина не названа: ' + r.stderr.slice(0, 200));
  if (!/НЕ токены/.test(r.stderr)) throw new Error('не сказано, что единицы свои: ' + r.stderr.slice(0, 200));
});

proba('НУЛЕВОЙ ПРЕДЕЛ: молчаливого «памяти нет» не бывает', () => {
  const r = podnyat(OSNOVA(`k.plugin({ name, Config, apply }, { predel: 0 });`));
  if (!/НЕ БУДЕТ подниматься/.test(r.stderr)) throw new Error('нулевой предел поднялся молча');
});

// 🔴 ВЕРСИЯ В СТРОКЕ ПОДЪЁМА СВЕРЯЕТСЯ С МАНИФЕСТОМ, А НЕ С ШАБЛОНОМ.
// Правило фермы 03.09.2026: по журналу должно быть видно, какую редакцию держит процесс.
// Проба сравнивает напечатанное с package.json — иначе версия-константа прошла бы её,
// а при следующем выпуске строка утверждала бы номер, которому предмет не соответствует.
// ⚠️ Где НЕ работает: проба не проверяет, что строка подъёма безусловна — это соседняя
// проба; и не заметит, если манифест сам врёт про свою версию.
proba('версия в строке подъёма взята из СВОЕГО манифеста', () => {
  const { version } = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf8'));
  // Плагин надо ПОДНЯТЬ: пустое тело даёт процесс, который ничего не монтирует,
  // и «своих строк нет» означало бы «мы его не звали», а не «он молчит».
  const r = podnyat(OSNOVA(`
    k.plugin({ name, Config, apply }, { predel: 2000 });
    kogdaGotovo(() => {});
  `));
  if (!r.stderr.includes('[' + NAZVANIE + ' ' + version + ']'))
    throw new Error(`в stderr нет «[${NAZVANIE} ${version}]»; напечатано: ` +
      (r.stderr.split('\n').find((l) => l.includes(NAZVANIE)) ?? '(ни одной своей строки)'));
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
