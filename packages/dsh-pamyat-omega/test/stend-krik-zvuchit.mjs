/**
 * Стенд звука: отказ провайдера должен быть СЛЫШЕН, а не только «доложен».
 *
 * Мерится конечный результат — строка в `stderr` отдельного процесса под
 * настоящим Context, а не факт вызова функции вывода. Причина в README,
 * раздел «Знаемое про вывод»: `ctx.logger` cordis 4.0.1 существует и вызов
 * проходит, но его сообщения ложатся в буфер, который никто не читает.
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


proba('стенд годен: под настоящим Context провайдер поднимается на годном адресе', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    import { apply } from './src/index.js';
    const k = new Context();
    k.plugin({ apply }, { adres: 'http://127.0.0.1:9/' });
    console.log('PODNYALSYA', typeof k.pamyatDolgovremennaya?.dostupna);
  `);
  if (!/PODNYALSYA/.test(r.stdout)) throw new Error('не поднялся: ' + r.stderr.slice(0, 160));
});

proba('ГЛАВНОЕ: негодный адрес → отказ СЛЫШЕН в stderr настоящего процесса', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    import { apply } from './src/index.js';
    const k = new Context();
    k.plugin({ apply }, { adres: 'ne-adres-vovse' });
  `);
  if (!/dsh-pamyat-omega/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
});

proba('ПОРЧА ЗВУКА: через ctx.logger строка НЕ слышна — путь, который мы убрали', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    k.logger.error('ETU-STROKU-NIKTO-NE-USLYSHIT');
  `);
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) {
    throw new Error('логгер СТАЛ звучать: платформа обновилась, README и krik перечитать вместе');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
