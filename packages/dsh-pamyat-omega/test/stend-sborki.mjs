/**
 * RU: Стенд проверяет провайдер целиком с подставной связью, не вызывая общую живую службу. Он проверяет договор сборки, а не состояние внешнего хранилища.
 * EN: Test the complete provider with a fake connection, without calling the shared live service. This checks the integration contract, not external store health.
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

// RU: Перехватить настоящий console.error пакета для проверки слышимого следа.
// EN: Capture the actual console.error output from the package to check an observable trace.
const nastoyashchiyKrik = [];
const iznachalnyj = console.error;
console.error = (...a) => { nastoyashchiyKrik.push(a.join(' ')); };
process.on('exit', () => { console.error = iznachalnyj; });

let vsego = 0, proshlo = 0;
const proba = async (imya, f) => {
  vsego++;
  try {
    const vernulos = await f();
    // RU: Обёртка учитывает и исключение, и возвращённое значение тела. Любой результат кроме undefined обозначает расхождение; перечень только string/false оставил бы 0/null/объект невидимыми.
    // EN: The wrapper checks both exceptions and returned body values. Any result other than undefined denotes a mismatch; checking only string/false would miss 0/null/objects.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судила по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
};
// RU: В пробах используется loopback-порт 9 с формами адреса со слэшем и без. Изоляция не должна зависеть от того, что проверяемый модуль сам отвергнет неверную форму живого адреса. Отсутствие слушателя — отдельная посылка этого стенда.
// EN: Tests use loopback port 9 with both slash and no-slash address forms. Isolation must not depend on the subject rejecting an invalid form of a live address. No listener is a separate assumption of this test.
const MERTVYJ = 'http://127.0.0.1:9/mcp';
function podelnyjCtx() {
  // RU: Подставной logger оставлен, но его буфер не используется как доказательство вывода. Попадание в него выявляет возврат немой ветки; настоящий след ловится в console.error.
  // EN: Retain the fake logger but do not use its buffer as output evidence. A write to it exposes a restored silent branch; capture the actual trace from console.error.
  const servisy = {}, oshibki = [];
  return { provide: (i, o) => { servisy[i] = o; }, on() {}, logger: { error: (m) => oshibki.push(m) }, servisy, oshibki };
}

await proba('стенд годен: пакет объявляет сервис', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: MERTVYJ + '/' });
  if (!ctx.servisy.pamyatDolgovremennaya) throw new Error('сервис не объявлен');
  if (name !== 'dsh-pamyat-omega') throw new Error('имя пакета не то');
});

await proba('ПОРЧА: адрес без слэша → сервис ЕСТЬ, но объявляет себя недоступным', () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: MERTVYJ });
  const p = ctx.servisy.pamyatDolgovremennaya;
  if (p.dostupna()) throw new Error('недоступный слой объявлен доступным');
  if (!/слэша/.test(p.pochemuNedostupna())) throw new Error('причина не объяснена');
  if (nastoyashchiyKrik.length === 0) throw new Error('при старте не было громкого сообщения');
  if (ctx.oshibki.length !== 0) throw new Error('пакет писал в ctx.logger — это НЕМОЙ путь, развилка вернулась');
});

await proba('ГЛАВНОЕ: недоступный слой → «не отправлено», а не «не доставлено»', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: MERTVYJ });
  const r = await ctx.servisy.pamyatDolgovremennaya.sohranit({ soderzhim: 'знание' });
  // RU: Связи не было до вызова: требуется ne-otpravleno, разрешающий безопасный повтор. Общее незнание этого не доказывает.
  // EN: No connection existed before the call: require ne-otpravleno, which permits a safe retry. A generic unknown result does not prove this.
  if (r.sostoyanie !== 'ne-otpravleno') throw new Error('получено ' + r.sostoyanie);
  if (r.id !== null) throw new Error('опознаватель взялся ниоткуда: ' + r.id);
});

await proba('ПРОВЕРКА без образца содержимого НЕ МОЖЕТ сказать «есть» — и говорит это вслух', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: MERTVYJ });
  const r = await ctx.servisy.pamyatDolgovremennaya.proverit({ id: 'mem-dfc9d0754cc9' });
  if (r.sostoyanie !== 'ne-proveryali') throw new Error('получено ' + r.sostoyanie);
  if (!/образца содержимого/.test(r.pochemu)) throw new Error('причина не называет нехватку образца: ' + r.pochemu);
});

await proba('ПРОВЕРКА при мёртвой связи → «не спрашивали», а не «нет записи»', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: MERTVYJ });
  const r = await ctx.servisy.pamyatDolgovremennaya.proverit({ id: 'mem-dfc9d0754cc9', obrazec: 'знание' });
  // RU: Недоступность проверки не должна превращаться в net: потребитель прочёл бы отсутствие записи и создал дубль повтором.
  // EN: An unavailable check must not become net: consumers would read it as an absent record and create a duplicate by retrying.
  if (r.sostoyanie !== 'ne-proveryali') throw new Error('получено ' + r.sostoyanie);
});

await proba('🔴 СТРОКА ПОДЪЁМА НЕСЁТ ИМЯ И ВЕРСИЮ, версия — ИЗ МАНИФЕСТА', async () => {
  const ctx = podelnyjCtx();
  apply(ctx, { adres: MERTVYJ });
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  const podyom = nastoyashchiyKrik.filter((s) => /подъ[её]м/.test(s));
  if (!podyom.length) throw new Error('безусловной строки подъёма нет — при исправной работе пакет неотличим от несмонтированного');
  // RU: Строка версии сверяется с манифестом, не только с формой: константа могла бы выглядеть правильной и назвать другую редакцию.
  // EN: Compare the version message with the manifest, not merely its shape: a constant could look valid while naming a different revision.
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
