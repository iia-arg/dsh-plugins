/**
 * Стенд сборки провайдера: связь подменена, проверяется поведение пакета целиком.
 * Живая служба намеренно не трогается — это общая машина, а не наш стенд.
 */
let apply, name, Config
try {
  ;({ apply, name, Config } = await import('../src/index.js'))
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

await proba('ГЛАВНОЕ: недоступный слой возвращает «не знаю», а не «не доставлено»', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: 'http://127.0.0.1:8377/mcp' });
  const r = await ctx.servisy.pamyatDolgovremennaya.sohranit({ soderzhim: 'знание' });
  if (r.sostoyanie !== 'ne-udalos-proverit') throw new Error('получено ' + r.sostoyanie);
});

await proba('схема настройки объявлена и содержит адрес', () => {
  if (!Config) throw new Error('схемы нет');
  const opisanie = JSON.stringify(Config);
  if (!/adres/.test(opisanie)) throw new Error('в схеме нет адреса');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
