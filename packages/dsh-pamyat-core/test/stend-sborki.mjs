// RU: Проверяем сборку целиком: плагин объявляет службу, она пишет, читает и объясняет отказы. Минимальный подставной ctx содержит только используемые provide, on и logger, чтобы не моделировать лишнюю платформу.
// EN: Test the complete assembly: the plugin exposes a service that writes, reads, and explains rejections. The minimal fake ctx contains only the used provide, on, and logger methods to avoid inventing extra platform behavior.
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let apply, name
try {
  ;({ apply, name } = await import('../src/index.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// RU: Перехватываем console.error, фактический поток вывода пакета.
// EN: Capture console.error, the package’s actual output stream.
const nastoyashchiyKrik = [];
const iznachalnyj = console.error;
console.error = (...a) => { nastoyashchiyKrik.push(a.join(' ')); };
process.on('exit', () => { console.error = iznachalnyj; });

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
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. ' +
                      'Бросай ошибку либо ничего не возвращай');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};

function podelnyjCtx() {
  const servisy = {};
  const oshibki = [];
  return {
    provide(imya, obj) { servisy[imya] = obj; },
    on() {},
    // RU: Ловим фактический поток вместо подставного logger; конечную слышимость отдельно проверяет stend-krik-zvuchit.
    // EN: Capture the actual stream rather than a fake logger; stend-krik-zvuchit separately tests final audibility.
    logger: { error(m) { oshibki.push('ЧЕРЕЗ-ЛОГГЕР:' + m); } },
    servisy, oshibki,
  };
}

const katalog = vremennyj(join(tmpdir(), 'pamyat-sb-'));

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
  // RU: klassyZnaniy задан явно, чтобы отбор по классу не подменил проверку предела чтения.
  // EN: Set klassyZnaniy explicitly so class selection does not replace the read-limit test.
  apply(ctx, { putBazy: join(katalog, 'g.db'), agent: 'stend', chtenieSkolko: 2, klassyZnaniy: ['zametka'] });
  const p = ctx.servisy.pamyat;
  for (let i = 0; i < 5; i++) p.zapisat({ klass: 'zametka', soderzhim: 'запись ' + i });
  const skolko = p.prochitat().length;
  if (skolko !== 2) throw new Error('предел из настройки не подействовал: получено ' + skolko + ' вместо 2');
});

proba('НАСТРОЙКА: без ключа работает умолчание схемы', () => {
  const ctx = podelnyjCtx();
  // RU: Явный перечень изолирует умолчание chtenieSkolko от отбора по классам.
  // EN: An explicit list isolates the chtenieSkolko default from class selection.
  apply(ctx, { putBazy: join(katalog, 'h.db'), agent: 'stend', klassyZnaniy: ['zametka'] });
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
  // RU: Ожидаем вывод в консоль, а не в logger cordis 4.0.1 с непрочитанным буфером.
  // EN: Expect console output rather than the cordis 4.0.1 logger’s unread buffer.
  if (cherez !== 0) throw new Error('пакет писал в ctx.logger (' + cherez + ') — это НЕМОЙ путь, развилка вернулась');
  // RU: Проверяем направление вывода, а не точное число строк: дополнительный след подъёма не должен ломать требование слышимости.
  // EN: Check output destination rather than exact line count: an additional startup trace must not break the audibility requirement.
  if (konsol < 1) throw new Error('в консоли пусто — голос модуля не слышен вовсе');
  // RU: Каждая строка должна содержать имя пакета и версию.
  // EN: Each line must contain the package name and version.
  const bezVersii = vyzovy.filter((v) => v.startsWith('console:') && !/\[dsh-pamyat-core \S+\]/.test(v));
  if (bezVersii.length) {
    throw new Error('строк без версии в имени: ' + bezVersii.length + ' — например ' + bezVersii[0].slice(0, 90));
  }
});

// RU: npm test должен перечислять стенды с диска через test/vse-stendy.mjs и продолжать после ненулевого кода. Ручной список забывает новые файлы, цепочка && пропускает всё после слепого стенда. Проверяем устройство обхода; пустой stend-*.mjs он тоже зачтёт успешным, содержимое проб здесь не проверяется.
// EN: npm test must discover suites on disk through test/vse-stendy.mjs and continue after nonzero exit codes. Manual lists omit new files; && chains skip everything after an unobservable suite. Check discovery structure; it also counts an empty stend-*.mjs as successful, so probe contents are outside this check.
proba('🔴 npm test зовёт ПРОГОНЩИКА, а не список имён рукой', () => {
  const komanda = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts?.test ?? '';
  if (!komanda.includes('vse-stendy.mjs')) {
    throw new Error('scripts.test не зовёт test/vse-stendy.mjs: «' + komanda.slice(0, 90)
      + '» — перечень стендов снова ведётся рукой');
  }
});

proba('🔴 ПРОГОНЩИК берёт перечень С ДИСКА (обходом), а не из записанного списка', () => {
  const src = readFileSync(new URL('./vse-stendy.mjs', import.meta.url), 'utf8');
  if (!/readdirSync\(/.test(src)) {
    throw new Error('в прогонщике нет обхода каталога — перечень стендов стал записанным,'
      + ' и новый стенд снова можно забыть');
  }
  // RU: Сверяем число обнаруженных стендов с обходом каталога.
  // EN: Compare discovered suite count with directory traversal.
  const naDiske = readdirSync(new URL('.', import.meta.url))
    .filter((f) => f.startsWith('stend-') && f.endsWith('.mjs')).sort();
  if (naDiske.length < 2) {
    throw new Error('СЛЕПОТА: стендов на диске ' + naDiske.length
      + ' — проверять нечего, проба смотрит не туда');
  }
});

rmSync(katalog, { recursive: true, force: true });
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
