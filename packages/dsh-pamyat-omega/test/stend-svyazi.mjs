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
const proba = async (imya, f) => {
  vsego++;
  try { await f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 140)); }
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

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
