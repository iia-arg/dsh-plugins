/**
 * Стенд звука: доказывает, что громкий отказ РЕАЛЬНО СЛЫШЕН.
 *
 * Зачем отдельный стенд, если крик проверяют и другие. Потому что до 03.09 его
 * проверяли ПОДДЕЛЬНЫМ ctx с самодельным `logger`, и три пробы были зелёными,
 * подтверждая громкость, которой в бою НЕ БЫЛО: настоящий `ctx.logger` cordis
 * 4.0.1 существует, вызов проходит, а сообщение ложится в кольцевой буфер,
 * который никто не читает.
 *
 * Поэтому здесь мерится не «вызвалась ли функция вывода», а КОНЕЧНЫЙ результат:
 * строка в `stderr` ОТДЕЛЬНОГО процесса, поднявшего пакет под НАСТОЯЩИМ
 * Context. Между вызовом и этой проверкой не остаётся ни одной нашей подделки.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const zdes = dirname(fileURLToPath(import.meta.url));
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 200)); }
};

// Поднимает пакет под настоящим Context в ОТДЕЛЬНОМ процессе и отдаёт его потоки.
function podnyat(kod) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '', kod: r.status };
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


proba('стенд годен: под настоящим Context пакет вообще поднимается', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    import { apply } from './src/index.js';
    const k = new Context();
    k.plugin({ apply }, { putBazy: '/tmp/pamyat-zvuk-ok.db', agent: 'stend' });
    console.log('PODNYALSYA', typeof k.logger?.error === 'function');
  `);
  if (!/PODNYALSYA/.test(r.stdout)) throw new Error('не поднялся: ' + r.stderr.slice(0, 160));
});

proba('ПРЕДПОСЫЛКА: настоящий ctx.logger ЕСТЬ (иначе стенд проверяет не тот мир)', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    console.log('LOGGER', typeof k.logger?.error === 'function');
  `);
  if (!/LOGGER true/.test(r.stdout)) {
    throw new Error('логгера нет — платформа сменилась, весь этот стенд надо перечитать: ' + r.stdout);
  }
});

proba('ГЛАВНОЕ: отказ открытия базы СЛЫШЕН в stderr настоящего процесса', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    import { apply } from './src/index.js';
    const k = new Context();
    k.plugin({ apply }, { putBazy: '/proc/net/dev/nekuda.db', agent: 'stend' });
  `);
  if (!/dsh-pamyat-core/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
  if (!/не открылась|НЕ РАБОТАЕТ/.test(r.stderr)) {
    throw new Error('строка есть, но не про отказ базы: ' + r.stderr.slice(0, 160));
  }
});

proba('ПОРЧА ЗВУКА: через ctx.logger строка НЕ слышна — путь, который мы убрали', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    k.logger.error('ETU-STROKU-NIKTO-NE-USLYSHIT');
  `);
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) {
    throw new Error('логгер СТАЛ звучать: платформа обновилась — вернуть развилку нельзя, будет двойная печать; перечитать README раздел «Знаемое про вывод»');
  }
});

proba('УЗЕЛ БЕЗ ОТВЕЧАЮЩЕГО: предупреждение тоже слышно, а не только отказ', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    import { apply } from './src/index.js';
    const k = new Context();
    k.plugin({ apply }, { putBazy: '/tmp/pamyat-zvuk-uzel.db', agent: 'stend', otvechayushchegoNet: true });
  `);
  if (!/спрашивать некого/.test(r.stderr)) {
    throw new Error('узел без отвечающего поднялся молча в настоящем процессе');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
