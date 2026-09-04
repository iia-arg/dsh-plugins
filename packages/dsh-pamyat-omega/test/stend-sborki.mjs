/**
 * Стенд сборки провайдера: связь подменена, проверяется поведение пакета целиком.
 * Живая служба намеренно не трогается — это общая машина, а не наш стенд.
 */
let apply, name, Config, readFileSync
try {
  ;({ apply, name, Config } = await import('../src/index.js'))
  ;({ readFileSync } = await import('node:fs'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// Перехват настоящего вывода пакета.
const nastoyashchiyKrik = [];
const iznachalnyj = console.error;
console.error = (...a) => { nastoyashchiyKrik.push(a.join(' ')); };
process.on('exit', () => { console.error = iznachalnyj; });

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try { await f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};
function podelnyjCtx() {
  // 🔴 03.09: логгер оставлен НАРОЧНО, но читать его пробам нельзя — он немой
  // (буфер cordis никто не читает). Если сюда что-то попало, значит развилка
  // вернулась в код. Настоящий вывод пакета — console.error, его и ловим.
  const servisy = {}, oshibki = [];
  return { provide: (i, o) => { servisy[i] = o; }, on() {}, logger: { error: (m) => oshibki.push(m) }, servisy, oshibki };
}

await proba('стенд годен: пакет объявляет сервис', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp/' });
  if (!ctx.servisy.pamyatDolgovremennaya) throw new Error('сервис не объявлен');
  if (name !== 'dsh-pamyat-omega') throw new Error('имя пакета не то');
});

await proba('ПОРЧА: адрес без слэша → сервис ЕСТЬ, но объявляет себя недоступным', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp' });
  const p = ctx.servisy.pamyatDolgovremennaya;
  if (p.dostupna()) throw new Error('недоступный слой объявлен доступным');
  if (!/слэша/.test(p.pochemuNedostupna())) throw new Error('причина не объяснена');
  if (nastoyashchiyKrik.length === 0) throw new Error('при старте не было громкого сообщения');
  if (ctx.oshibki.length !== 0) throw new Error('пакет писал в ctx.logger — это НЕМОЙ путь, развилка вернулась');
});

await proba('ГЛАВНОЕ: недоступный слой → «не отправлено», а не «не доставлено»', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp' });
  const r = await ctx.servisy.pamyatDolgovremennaya.sohranit({ soderzhim: 'знание' });
  // 🔴 04.09.2026: было `ne-udalos-proverit`. Требование не изменилось — незнание
  // по-прежнему нельзя подавать отрицательным фактом, — но ответ стал точнее:
  // связи не было ДО вызова, значит отправки не случилось вовсе, и повтор
  // записью безопасен. Прежнее состояние этого не говорило, и потребитель не
  // мог отличить безопасный повтор от такого, что заведёт дубль.
  if (r.sostoyanie !== 'ne-otpravleno') throw new Error('получено ' + r.sostoyanie);
  if (r.id !== null) throw new Error('опознаватель взялся ниоткуда: ' + r.id);
});

await proba('ПРОВЕРКА без образца содержимого НЕ МОЖЕТ сказать «есть» — и говорит это вслух', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp' });
  const r = await ctx.servisy.pamyatDolgovremennaya.proverit({ id: 'mem-dfc9d0754cc9' });
  if (r.sostoyanie !== 'ne-proveryali') throw new Error('получено ' + r.sostoyanie);
  if (!/образца содержимого/.test(r.pochemu)) throw new Error('причина не называет нехватку образца: ' + r.pochemu);
});

await proba('ПРОВЕРКА при мёртвой связи → «не спрашивали», а не «нет записи»', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp' });
  const r = await ctx.servisy.pamyatDolgovremennaya.proverit({ id: 'mem-dfc9d0754cc9', obrazec: 'знание' });
  // Схлопни это в «net» — и недоступность хранилища начала бы молча плодить
  // дубли: потребитель прочёл бы «записи нет» и повторил запись.
  if (r.sostoyanie !== 'ne-proveryali') throw new Error('получено ' + r.sostoyanie);
});

await proba('🔴 СТРОКА ПОДЪЁМА НЕСЁТ ИМЯ И ВЕРСИЮ, версия — ИЗ МАНИФЕСТА', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp' });
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  const podyom = nastoyashchiyKrik.filter((s) => /подъ[её]м/.test(s));
  if (!podyom.length) throw new Error('безусловной строки подъёма нет — при исправной работе пакет неотличим от несмонтированного');
  // Сверяем С МАНИФЕСТОМ, а не с образцом текста: иначе проба стережёт форму строки,
  // а порча «версия константой» пройдёт мимо неё незамеченной.
  for (const s of nastoyashchiyKrik) {
    if (!s.includes(version)) throw new Error('строка без версии из манифеста: ' + s.slice(0, 90));
  }
});

await proba('схема настройки объявлена и содержит адрес', () => {
  if (!Config) throw new Error('схемы нет');
  const opisanie = JSON.stringify(Config);
  if (!/adres/.test(opisanie)) throw new Error('в схеме нет адреса');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
