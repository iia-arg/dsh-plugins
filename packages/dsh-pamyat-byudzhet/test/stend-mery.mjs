/**
 * RU: Стенд меры: цена записи и сверка с числом платформы (src/mera.js). Запуск: node test/stend-mery.mjs; код
 *     0 — всё зелёное, 1 — красные.
 * EN: Measure stand: record cost and reconciliation with the platform number (src/mera.js). Run: node
 *     test/stend-mery.mjs; exit 0 — all green, 1 — red.
 */
let ocenit, sverit, SIMVOLOV_NA_EDINICU
try {
  ;({ ocenit, sverit, SIMVOLOV_NA_EDINICU } = await import('../src/mera.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// RU: ПЕЧАТЬ СИЛЬНЕЕ СПРАВКИ. Справка в README верна на день, когда её писали; эта строка верна всегда, потому
//     что снимается с дерева в момент прогона. Число в тексте — перечень из одного элемента, и он устаревает
//     молча.
// EN: PRINTING BEATS A REFERENCE. A note in the README is true on the day it was written; this line is always
//     true because it is taken from the tree at run time. A number in text is a one-element list, and it goes
//     stale silently.
{
  const { createRequire } = await import('node:module')
  const trebovat = createRequire(import.meta.url)
  const versiya = (imya) => {
    try { return trebovat(`@deepseek-ai/${imya}/package.json`).version } catch { return 'НЕ НАЙДЕНА' }
  }
  console.log(`платформа: cordis ${versiya('cordis')} · schemastery ${versiya('schemastery')} · Node ${process.version}`)
}

let vsego = 0, proshlo = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => { vsego++; try { sud(f()); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 160)); } };

proba('стенд годен: цена растёт с длиной содержимого', () => {
  const malo = ocenit({ soderzhim: 'а'.repeat(40) });
  const mnogo = ocenit({ soderzhim: 'а'.repeat(400) });
  if (!(mnogo > malo)) throw new Error('длинная запись не дороже короткой');
});

proba('пустая запись стоит не ноль, а единицу — поднять её тоже стоит места', () => {
  if (ocenit({ soderzhim: '' }) !== 1) throw new Error('цена пустой ' + ocenit({ soderzhim: '' }));
});

proba('служебные поля входят в цену: они поедут вместе с содержимым', () => {
  const bez = ocenit({ soderzhim: 'текст' });
  const s = ocenit({ soderzhim: 'текст', klass: 'длинный-класс', istochnik: 'sess-1#1-9' });
  if (!(s > bez)) throw new Error('класс и источник не учтены');
});

proba('ПОРЧА: не объект → отказ словами, а не тихий ноль', () => {
  let upalo = false;
  try { ocenit('строка'); } catch (e) { upalo = /оценивать нечего/.test(e.message); }
  if (!upalo) throw new Error('приняло не-объект молча');
});

proba('СВЕРКА даёт расхождение в процентах, а не правит нашу меру', () => {
  const r = sverit({ nashe: 120, platformennoe: 100 });
  if (r.rashozhdenieProcentov !== 20) throw new Error('расхождение ' + r.rashozhdenieProcentov);
});

proba('СВЕРКА с нулём платформы: объясняет, а не делит на ноль', () => {
  const r = sverit({ nashe: 5, platformennoe: 0 });
  if (r.otnoshenie !== null || !r.pochemu) throw new Error('нет объяснения при нуле');
});

proba('единица меры объявлена ЧИСЛОМ, а не спрятана в код', () => {
  if (typeof SIMVOLOV_NA_EDINICU !== 'number') throw new Error('порог не число');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
