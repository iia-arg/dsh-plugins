/**
 * Стенд сборки пакета: проверяет ФУНКЦИЮ целиком — плагин объявляет сервис,
 * сервис пишет, читает и объясняет отказы. Поддельный ctx намеренно минимален:
 * он повторяет ровно то, чем пакет пользуется (provide, on, logger), и ничего
 * больше — иначе стенд начнёт проверять выдуманное ядро вместо настоящего.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let apply, name
try {
  ;({ apply, name } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// Перехват настоящего вывода пакета: console.error — единственный его путь.
const nastoyashchiyKrik = [];
const iznachalnyj = console.error;
console.error = (...a) => { nastoyashchiyKrik.push(a.join(' ')); };
process.on('exit', () => { console.error = iznachalnyj; });

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};

function podelnyjCtx() {
  const servisy = {};
  const oshibki = [];
  return {
    provide(imya, obj) { servisy[imya] = obj; },
    on() {},
    // 🔴 03.09: раньше здесь стоял самодельный logger и пробы читали ЕГО —
    // то есть проверяли путь, который в бою НЕМОЙ (буфер cordis никто не
    // читает). Теперь ловим тот же поток, в который пакет пишет на самом деле.
    // Конечный звук проверяет отдельный стенд stend-krik-zvuchit.
    logger: { error(m) { oshibki.push('ЧЕРЕЗ-ЛОГГЕР:' + m); } },
    servisy, oshibki,
  };
}

const katalog = mkdtempSync(join(tmpdir(), 'pamyat-sb-'));

proba('стенд годен: плагин объявляет сервис pamyat', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'a.db'), agent: 'stend' });
  if (!ctx.servisy.pamyat) throw new Error('сервис не объявлен');
  if (name !== 'dsh-pamyat-core') throw new Error('имя пакета не то');
});

proba('память доступна и пишет, журнал видит запись', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'b.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  if (!p.dostupna()) throw new Error('память недоступна: ' + p.pochemuNedostupna());
  const id = p.zapisat({ klass: 'zametka', soderzhim: 'знание', istochnik: 'session#3' });
  if (!(id > 0)) throw new Error('нет id');
  const s = p.svodka();
  if (s.zapisano !== 1) throw new Error('журнал не увидел запись: ' + JSON.stringify(s));
});

proba('ГЛАВНОЕ: отказ различает решение человека и поломку установки', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'c.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  p.otmetitOtkaz({ klass: 'navyk', priroda: 'otkazano', pochemu: 'решение человека' });
  p.otmetitOtkaz({ klass: 'navyk', priroda: 'net-kanala', pochemu: 'поломка установки' });
  const s = p.svodka();
  if (s.poPrirode['otkazano'] !== 1 || s.poPrirode['net-kanala'] !== 1) {
    throw new Error('природы не разделились: ' + JSON.stringify(s.poPrirode));
  }
});

proba('ПОРЧА: база не открылась → сервис ЕСТЬ, но каждый вызов отказывает словами', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: '/proc/net/dev/nel.db', agent: 'stend' });
  const p = ctx.servisy.pamyat;
  if (!ctx.servisy.pamyat) throw new Error('сервис должен существовать даже при отказе');
  if (p.dostupna()) throw new Error('память объявлена доступной, а база не открылась');
  if (!p.pochemuNedostupna()?.includes('не открылась')) throw new Error('причина не объяснена');
  let upalo = false;
  try { p.zapisat({ klass: 'zametka', soderzhim: 'x' }); } catch { upalo = true; }
  if (!upalo) throw new Error('запись при недоступной памяти прошла молча — это тихая потеря');
  if (nastoyashchiyKrik.length === 0) throw new Error('при старте не было ни одного громкого сообщения');
  if (ctx.oshibki.length !== 0) throw new Error('пакет писал в ctx.logger — это НЕМОЙ путь, развилка вернулась');
});

proba('ВОРОТА ВНУТРИ: класс ask без подтверждения НЕ пишется в обход', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'd.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  let upalo = null;
  try { p.zapisat({ klass: 'navyk', soderzhim: 'общефермовый навык' }); }
  catch (e) { upalo = e; }
  if (!upalo) throw new Error('запись прошла в обход политики — ворота не работают');
  if (upalo.code !== 'PAMYAT_TREBUET_PODTVERZHDENIYA') throw new Error('не тот код: ' + upalo.code);
  if (upalo.priroda !== 'ne-predyavleno') throw new Error('«не спросили» подано как ' + upalo.priroda + ' — схлопывание');
  const s = p.svodka();
  if (s.poPrirode['ne-predyavleno'] !== 1) throw new Error('отказ не попал в журнал: ' + JSON.stringify(s));
  if (p.prochitat({ klass: 'navyk' }).length !== 0) throw new Error('знание всё-таки записалось');
});

proba('РАЗЛИЧЕНИЕ: «не спросили» НЕ равно «канала нет» — разные коды и природы', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'i.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  let neSprosili = null, netKanala = null;
  try { p.zapisat({ klass: 'navyk', soderzhim: 'a' }); } catch (e) { neSprosili = e; }
  try { p.zapisat({ klass: 'navyk', soderzhim: 'b', podtverzhdenie: 'unavailable' }); } catch (e) { netKanala = e; }
  if (neSprosili.code === netKanala.code) throw new Error('коды совпали: ' + neSprosili.code);
  if (neSprosili.priroda === netKanala.priroda) throw new Error('природы совпали');
  if (neSprosili.code !== 'PAMYAT_TREBUET_PODTVERZHDENIYA') throw new Error('не тот код у «не спросили»');
  const s = p.svodka();
  if (s.poPrirode['ne-predyavleno'] !== 1 || s.poPrirode['net-kanala'] !== 1) {
    throw new Error('журнал не разделил: ' + JSON.stringify(s.poPrirode));
  }
});

proba('ВОРОТА ВНУТРИ: с подтверждением ядра класс ask пишется', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'e.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  const id = p.zapisat({ klass: 'navyk', soderzhim: 'разрешённый навык', podtverzhdenie: 'allowed-once' });
  if (!(id > 0)) throw new Error('не записалось при разрешении');
  if (p.svodka().zapisano !== 1) throw new Error('журнал не увидел запись');
});

proba('ВОРОТА ВНУТРИ: отказ человека отличается от поломки и в сервисе', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'f.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  let chelovek = null, polomka = null;
  try { p.zapisat({ klass: 'navyk', soderzhim: 'x', podtverzhdenie: 'rejected' }); } catch (e) { chelovek = e; }
  try { p.zapisat({ klass: 'navyk', soderzhim: 'y', podtverzhdenie: 'unavailable' }); } catch (e) { polomka = e; }
  if (chelovek.priroda === polomka.priroda) throw new Error('природы совпали — схлопывание в сервисе');
  const s = p.svodka();
  if (s.poPrirode['otkazano-chelovekom'] !== 1 || s.poPrirode['net-kanala'] !== 1) {
    throw new Error('журнал не разделил: ' + JSON.stringify(s.poPrirode));
  }
});

proba('НАСТРОЙКА ДЕЙСТВУЕТ: предел чтения берётся из конфига, а не из литерала', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'g.db'), agent: 'stend', chtenieSkolko: 2 });
  const p = ctx.servisy.pamyat;
  for (let i = 0; i < 5; i++) p.zapisat({ klass: 'zametka', soderzhim: 'запись ' + i });
  const skolko = p.prochitat().length;
  if (skolko !== 2) throw new Error('предел из настройки не подействовал: получено ' + skolko + ' вместо 2');
});

proba('НАСТРОЙКА: без ключа работает умолчание схемы', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'h.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  for (let i = 0; i < 25; i++) p.zapisat({ klass: 'zametka', soderzhim: 'з' + i });
  const skolko = p.prochitat().length;
  if (skolko !== 20) throw new Error('умолчание не 20, а ' + skolko);
});

proba('УЗЕЛ БЕЗ ОТВЕЧАЮЩЕГО, срез 1: при подъёме есть громкая строка', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'j.db'), agent: 'stend', otvechayushchegoNet: true });
  if (nastoyashchiyKrik.length === 0) throw new Error('узел без отвечающего поднялся молча');
  if (!nastoyashchiyKrik.some(m => /спрашивать некого/.test(m))) throw new Error('строка не объясняет состояние');
  if (ctx.oshibki.length !== 0) throw new Error('пакет писал в ctx.logger — это НЕМОЙ путь, развилка вернулась');
});

proba('УЗЕЛ БЕЗ ОТВЕЧАЮЩЕГО, срез 2: класс ask СОХРАНЯЕТСЯ, а не отвергается', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'k.db'), agent: 'stend', otvechayushchegoNet: true });
  const p = ctx.servisy.pamyat;
  const id = p.zapisat({ klass: 'navyk', soderzhim: 'навык на узле без отвечающего' });
  if (!(id > 0)) throw new Error('запись не сохранилась');
  if (p.prochitat({ klass: 'navyk' }).length !== 1) throw new Error('знания нет в памяти');
});

proba('УЗЕЛ БЕЗ ОТВЕЧАЮЩЕГО, срез 3: отметка стоит В САМОЙ ЗАПИСИ, не только в журнале', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'l.db'), agent: 'stend', otvechayushchegoNet: true });
  const p = ctx.servisy.pamyat;
  p.zapisat({ klass: 'navyk', soderzhim: 'знание без подтверждения' });
  const zapis = p.prochitat({ klass: 'navyk' })[0];
  if (zapis.bez_podtverzhdeniya !== 1) {
    throw new Error('в строке знания отметки нет: ' + JSON.stringify(zapis));
  }
});

proba('ЗЕРКАЛЬНО (важнее прочего): на узле С отвечающим отметки НЕТ', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { putBazy: join(katalog, 'm.db'), agent: 'stend' });
  const p = ctx.servisy.pamyat;
  p.zapisat({ klass: 'navyk', soderzhim: 'подтверждённое', podtverzhdenie: 'allowed-once' });
  p.zapisat({ klass: 'zametka', soderzhim: 'обычная заметка' });
  for (const z of p.prochitat({})) {
    if (z.bez_podtverzhdeniya !== 0) {
      throw new Error('отметка приклеилась к записи, принятой нормально: ' + z.soderzhim);
    }
  }
});

proba('ЕДИНСТВЕННЫЙ ПУТЬ: даже когда логгер ЕСТЬ, крик идёт в консоль, а не в него', () => {
  const vyzovy = [];
  const ctx = {
    provide() {}, on() {},
    logger: { error: (m) => { vyzovy.push('logger:' + m); return undefined; } },
  };
  const prezhnij = console.error;
  console.error = (m) => vyzovy.push('console:' + m);
  try {
    apply(ctx, { putBazy: join(katalog, 'n.db'), agent: 'stend', otvechayushchegoNet: true });
  } finally { console.error = prezhnij; }
  const cherez = vyzovy.filter((v) => v.startsWith('logger:')).length;
  const konsol = vyzovy.filter((v) => v.startsWith('console:')).length;
  // 🔴 03.09 ожидание ПЕРЕВЁРНУТО. Прежде здесь требовалось «через логгер 1,
  // в консоль 0» — то есть проба закрепляла НЕМОЙ путь как правильный и была
  // зелёной весь вечер. Логгер cordis 4.0.1 существует, но его сообщения
  // уходят в буфер, который никто не читает. Верное ожидание обратное.
  if (cherez !== 0) throw new Error('пакет писал в ctx.logger (' + cherez + ') — это НЕМОЙ путь, развилка вернулась');
  // 🔴 Проверяем НАПРАВЛЕНИЕ вывода, а не число строк. Прежде здесь стояло «ровно одна»,
  // и правка 03.09.2026 (безусловный след подъёма) честно её сломала: строк стало две.
  // Число строк — деталь поведения, а требование пробы — «голос идёт в консоль, а не в
  // немой логгер». Закрепив число, проба охраняла бы не смысл, а свою редакцию предмета.
  if (konsol < 1) throw new Error('в консоли пусто — голос модуля не слышен вовсе');
  // И отдельно: имя И версия в каждой строке (правило фермы 03.09.2026).
  const bezVersii = vyzovy.filter((v) => v.startsWith('console:') && !/\[dsh-pamyat-core \S+\]/.test(v));
  if (bezVersii.length) {
    throw new Error('строк без версии в имени: ' + bezVersii.length + ' — например ' + bezVersii[0].slice(0, 90));
  }
});

rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
