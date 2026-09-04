/**
 * Стенд связи. Транспорт подменяется намеренно: ветки отказа обязаны
 * проверяться порчей, а не отключением живой службы на общей машине.
 * Живой ответ проверен отдельно (см. стенд подтверждения — образцы оттуда сняты
 * с работающего хранилища).
 */
let sozdatSvyaz, razobratPotok
try {
  ;({ sozdatSvyaz, razobratPotok } = await import('../src/svyaz.js'))
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND'
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'не установлены зависимости пакета' : String(e?.message ?? e).slice(0, 160)}`)
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.')
  process.exit(2)
}

// 🔴 ПЕЧАТЬ СИЛЬНЕЕ СПРАВКИ (03.09.2026). Справка в README верна на день, когда её
// писали; эта строка верна всегда, потому что снимается с дерева в момент прогона.
// Довод: «число в тексте — перечень из одного элемента, и он устаревает молча».
{
  const { createRequire } = await import('node:module')
  const trebovat = createRequire(import.meta.url)
  const versiya = (imya) => {
    try { return trebovat(`@deepseek-ai/${imya}/package.json`).version } catch { return 'НЕ НАЙДЕНА' }
  }
  console.log(`платформа: cordis ${versiya('cordis')} · schemastery ${versiya('schemastery')} · Node ${process.version}`)
}

let vsego = 0, proshlo = 0;
// 🔴 ХОДЫ КОПЯТСЯ И ДОЖИДАЮТСЯ ПЕРЕД ИТОГОМ (04.09.2026). Прежде пробы запускались и не
// ожидались: `vsego` рос сразу, а тело выполнялось потом. Пока каждая проба разрешалась в
// микрозадаче, итог случайно совпадал; первая же проба, уходящая за макрозадачу, не успевала
// напечататься вовсе — ни ✅, ни ❌, только «7 из 8». Стенд, печатающий итог раньше своих
// проб, показывает НЕ результат, а то, что успело.
const hody = [];
const proba = (imya, f) => {
  vsego++;
  hody.push((async () => {
    try { await f(); proshlo++; console.log('  ✅ ' + imya); }
    catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
  })());
};
const ZHIVOJ = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Stored mem-abc123def456"}]}}';

await proba('стенд годен: живой поток событий разбирается', () => {
  const d = razobratPotok(ZHIVOJ);
  if (!d?.result) throw new Error('поток не разобран');
});

await proba('ПОРЧА: адрес без завершающего слэша → отказ с объяснением', () => {
  try { sozdatSvyaz({ adres: 'http://127.0.0.1:8377/mcp' }); throw new Error('не упало'); }
  catch (e) {
    if (e.code !== 'OMEGA_ADRES_BEZ_SLESHA') throw new Error('не тот код: ' + e.code);
    if (!/перенаправлением/.test(e.message)) throw new Error('причина не объяснена');
  }
});

await proba('ПОРЧА: адрес не задан → отказ', () => {
  try { sozdatSvyaz({}); throw new Error('не упало'); }
  catch (e) { if (e.code !== 'OMEGA_NET_ADRESA') throw new Error('не тот код: ' + e.code); }
});

await proba('нормальный вызов отдаёт текст ответа', async () => {
  const s = sozdatSvyaz({ adres: 'http://x/', otpravka: async () => ZHIVOJ });
  const r = await s.pozvat('omega_store', {});
  if (!r.udalos) throw new Error('не удалось: ' + r.pochemu);
  if (!r.tekst.includes('mem-abc123def456')) throw new Error('текст потерян');
});

await proba('ГЛАВНОЕ: обрыв связи → «неизвестно», а НЕ отрицательный ответ', async () => {
  const s = sozdatSvyaz({ adres: 'http://x/', otpravka: async () => { throw new Error('сеть недоступна'); } });
  const r = await s.pozvat('omega_store', {});
  if (r.udalos !== false) throw new Error('обрыв принят за успех');
  if (!/НЕИЗВЕСТЕН/.test(r.pochemu)) throw new Error('обрыв подан как отрицательный ответ: ' + r.pochemu);
});

await proba('ПОРЧА: пустой ответ → «неизвестно», а не «нет»', async () => {
  const s = sozdatSvyaz({ adres: 'http://x/', otpravka: async () => '' });
  const r = await s.pozvat('omega_store', {});
  if (r.udalos !== false) throw new Error('пустота принята за ответ');
  if (!/НЕИЗВЕСТЕН/.test(r.pochemu)) throw new Error('пустота подана как отрицательный факт');
});

await proba('ПОРЧА: отказ службы отличается от обрыва связи', async () => {
  const s = sozdatSvyaz({ adres: 'http://x/', otpravka: async () => 'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"boom"}}' });
  const r = await s.pozvat('omega_store', {});
  if (r.udalos !== false) throw new Error('отказ принят за успех');
  if (!/отказало/.test(r.pochemu)) throw new Error('отказ службы не назван: ' + r.pochemu);
});

// 🔴 ПРИЧИНА ОТКАЗА НЕ ДОЛЖНА БЫТЬ ПУСТОЙ, даже когда у ошибки пустой message (долг 100).
// Этот модуль ходит по сети: AggregateError с пустым собственным message — обычный исход
// fetch, перебравшего адреса, а не редкость. `??` его не спасает: пустая строка для него —
// найденное значение, и строка «связь не состоялась: » печаталась с пустотой.
proba('причина отказа непуста при пустом message (AggregateError от сети)', async () => {
  const s = sozdatSvyaz({
    adres: 'http://x/',
    otpravka: async () => { throw new AggregateError([new Error('ECONNREFUSED на всех адресах')], ''); },
  });
  const r = await s.pozvat('omega_store', {});
  if (r.udalos !== false) throw new Error('отказ принят за успех');
  const hvost = String(r.pochemu).split('не состоялась:')[1] ?? '';
  if (!hvost.replace(/^[\s.]+|Результат[\s\S]*$/g, '').trim())
    throw new Error('причина пуста — нулевое слияние вернулось: ' + r.pochemu);
  if (!/AggregateError/.test(r.pochemu)) throw new Error('класс ошибки потерян: ' + r.pochemu);
  if (!/ECONNREFUSED/.test(r.pochemu)) throw new Error('внутренняя причина потеряна: ' + r.pochemu);
});

await Promise.all(hody);
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
