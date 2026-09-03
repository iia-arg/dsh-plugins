/**
 * Стенд звука: подталкивание должно быть СЛЫШНО в реальном потоке.
 *
 * Стенд порогов ловит `console.error` внутри своего процесса — то есть
 * спрашивает «ушло ли в консоль». Здесь спрашивается строже: дошло ли до
 * настоящего `stderr` отдельного процесса под живым Context. Между вызовом и
 * проверкой не остаётся ни одной нашей подделки.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
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

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
