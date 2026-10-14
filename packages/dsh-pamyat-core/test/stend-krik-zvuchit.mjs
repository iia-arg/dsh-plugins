// RU: Проверяем слышимость отказа по stderr отдельного процесса с настоящим Context. Подставной logger не доказывает вывод: logger cordis 4.0.1 может писать только в непрочитанный кольцевой буфер.
// EN: Test audible rejection through stderr of a separate process using a real Context. A fake logger cannot prove output: the cordis 4.0.1 logger may write only to an unread ring buffer.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
// RU: Базы создаём в отдельном mkdtemp и убираем на путях выхода. Общий фиксированный путь может остаться чужой учётке и превратить исправный контроль в проверку отказа доступа.
// EN: Create databases in a separate mkdtemp and clean them on exit paths. A shared fixed path may remain owned by another account and turn the healthy control into an access-denial test.
const KAT = mkdtempSync(join(tmpdir(), '.proba-krik-zvuchit-core-'));
process.on('exit', () => rmSync(KAT, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));

const zdes = dirname(fileURLToPath(import.meta.url));
let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    // RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
    // EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 200)); }
};

// RU: Поднимаем пакет с настоящим Context в отдельном процессе и возвращаем его потоки.
// EN: Start the package with a real Context in a separate process and return its streams.
function podnyat(kod) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', kod], {
    cwd: join(zdes, '..'), encoding: 'utf8', timeout: 20000,
  });
  return { stderr: r.stderr ?? '', stdout: r.stdout ?? '', kod: r.status };
}

// RU: Один раз проверяем зависимости. Если дочерний процесс нельзя поднять из-за их отсутствия, возвращаем слепоту с кодом 2, а не дефект с кодом 1.
// EN: Check dependencies once. If missing dependencies prevent child startup, report an unobservable test with code 2 rather than a defect with code 1.
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
    k.plugin({ apply }, { putBazy: ${JSON.stringify(join(KAT, 'zvuk-ok.db'))}, agent: 'stend' });
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
    k.plugin({ apply }, { putBazy: ${JSON.stringify(join(KAT, 'zvuk-uzel.db'))}, agent: 'stend', otvechayushchegoNet: true });
  `);
  if (!/спрашивать некого/.test(r.stderr)) {
    throw new Error('узел без отвечающего поднялся молча в настоящем процессе');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
