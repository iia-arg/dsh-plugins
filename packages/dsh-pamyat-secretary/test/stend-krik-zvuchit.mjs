/**
 * Стенд звука: вести секретаря должны быть СЛЫШНЫ, а не только «сказаны».
 *
 * Почему отдельно от stend-shva. Тот ловит `console.error` ВНУТРИ своего же
 * процесса — то есть проверяет, что функция вывода вызвана, а не что строка
 * куда-то дошла. Ровно на этой разнице 03.09 в ядре нашлись три ЗЕЛЁНЫЕ пробы,
 * подтверждавшие громкость, которой в бою не было: они читали самодельный
 * logger поддельного ctx, а настоящий logger cordis 4.0.1 нем (его сообщения
 * ложатся в кольцевой буфер, который никто не читает).
 *
 * Здесь между вызовом и проверкой не остаётся ни одной нашей подделки: пакет
 * поднимается в ОТДЕЛЬНОМ процессе под настоящим Context, и строку мы ждём в
 * реальном `stderr` этого процесса.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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


// Общая часть: настоящий Context со службой памяти, какую попросят.
const OSNOVA = (telo) => `
  import { Context } from '@deepseek-ai/cordis';
  import { name, inject, apply } from './src/index.js';
  const k = new Context();
  ${telo}
`;

proba('стенд годен: секретарь поднимается на настоящем Context', () => {
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => console.log('PODNYALSYA'), 30);
  `));
  if (!/PODNYALSYA/.test(r.stdout)) throw new Error('не поднялся: ' + r.stderr.slice(0, 160));
});

proba('🔴 КАЖДАЯ строка несёт ИМЯ И ВЕРСИЮ, и версия взята ИЗ МАНИФЕСТА', () => {
  // По журналу должно быть видно не только кто сказал, но и КАКАЯ редакция: за 03.09.2026
  // мы трижды получали в процессе не тот код, что лежит на диске, и строка без номера
  // этого не различала. Версия читается из своего package.json, а не пишется константой:
  // константа при следующем выпуске утверждала бы номер, которому предмет не соответствует.
  const nastoyashchaya = JSON.parse(readFileSync(join(zdes, '..', 'package.json'), 'utf-8')).version;
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => {}, 30);
  `));
  const stroka = (r.stderr.split('\n').find((x) => x.includes('подъём:')) ?? '');
  if (!stroka) throw new Error('следа подъёма нет вовсе: ' + r.stderr.slice(0, 160));
  if (!stroka.includes('[dsh-pamyat-secretary ' + nastoyashchaya + ']')) {
    throw new Error('в строке нет версии из манифеста (' + nastoyashchaya + '): ' + stroka.slice(0, 120));
  }
});

proba('ПРЕДПОСЫЛКА: настоящий ctx.logger ЕСТЬ и НЕМ (иначе стенд про другой мир)', () => {
  const r = podnyat(`
    import { Context } from '@deepseek-ai/cordis';
    const k = new Context();
    if (typeof k.logger?.error !== 'function') { console.log('NET-LOGGERA'); process.exit(0); }
    k.logger.error('ETU-STROKU-NIKTO-NE-USLYSHIT');
    console.log('EST-I-NEM');
  `);
  if (/NET-LOGGERA/.test(r.stdout)) throw new Error('логгера нет — платформа сменилась, перечитать вместе с krik');
  if (/ETU-STROKU-NIKTO-NE-USLYSHIT/.test(r.stderr + r.stdout)) {
    throw new Error('логгер СТАЛ звучать: платформа обновилась, вернуть развилку нельзя — будет двойная печать');
  }
});

proba('ГЛАВНОЕ: «сводка ПОТЕРЯНА» слышна в stderr настоящего процесса', () => {
  // Самая важная весть пакета: знание сняли, а записать некуда. Если она нема,
  // потеря знания выглядит снаружи ровно как отсутствие знания.
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => {
      k.pamyat = undefined;            // служба пропала между событиями
      k.emit('session/event', { id: 'sess-1' }, {
        type: 'compaction/summary',
        data: { summary: [{ type: 'text', text: 'знание' }], shadowedSeqs: [21, 22] },
      });
    }, 30);
  `));
  if (!/dsh-pamyat-secretary/.test(r.stderr)) throw new Error('в stderr нет строки пакета');
  if (!/ПОТЕРЯНА/.test(r.stderr)) throw new Error('строка есть, но не про потерю: ' + r.stderr.slice(0, 200));
});

proba('негодная сводка: отказ записи тоже слышен, а не только потеря', () => {
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, {});
    setTimeout(() => k.emit('session/event', { id: 'sess-1' }, {
      type: 'compaction/summary', data: { summary: [], shadowedSeqs: [] },
    }), 30);
  `));
  if (!/НЕ записана/.test(r.stderr)) throw new Error('пропуск прошёл молча: ' + r.stderr.slice(0, 200));
});

proba('ВЫКЛЮЧЕН НАСТРОЙКОЙ: молчаливого выключения не бывает', () => {
  const r = podnyat(OSNOVA(`
    k.provide('pamyat');
    k.pamyat = { zapisat: () => 1 };
    k.plugin({ name, inject, apply }, { vklyuchen: false });
  `));
  if (!/ВЫКЛЮЧЕН/.test(r.stderr)) throw new Error('выключение прошло молча — снаружи неотличимо от поломки');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
