/**
 * RU: Подставной транспорт проверяет отказы связи без отключения общей службы. Протокол ответа основан на эталонах стенда подтверждения; этот прогон не проверяет состояние живого провайдера.
 * EN: A fake transport tests connection failures without disabling the shared service. The response protocol comes from confirmation-test fixtures; this run does not check the live provider state.
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

// RU: Фактическое число проб печатается из текущего прогона, а не устаревающей константой документации.
// EN: Print the actual test count from the current run rather than a stale documentation constant.
{
  const { createRequire } = await import('node:module')
  const trebovat = createRequire(import.meta.url)
  const versiya = (imya) => {
    try { return trebovat(`@deepseek-ai/${imya}/package.json`).version } catch { return 'НЕ НАЙДЕНА' }
  }
  console.log(`платформа: cordis ${versiya('cordis')} · schemastery ${versiya('schemastery')} · Node ${process.version}`)
}

let vsego = 0, proshlo = 0;
// RU: Асинхронные пробы сохраняются и ожидаются перед итогом. Иначе поздний результат после макрозадачи не попал бы в отчёт, а счёт запусков выглядел бы числом завершённых проверок.
// EN: Collect asynchronous tests and await them before summarizing. Otherwise a late result after a macrotask would be absent from the report, and started tests would look like completed checks.
const hody = [];
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  vsego++;
  hody.push((async () => {
    try { sud(await f()); proshlo++; console.log('  ✅ ' + imya); }
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

// RU: Пустой AggregateError.message не должен оставлять пустую причину отказа; nullish-подстановка одна этого не исправляет.
// EN: An empty AggregateError.message must not leave a blank failure reason; nullish fallback alone does not fix it.
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

// RU: Ключ OMEGA >= 1.5.19 проверяется настоящим HTTP на случайном локальном порту: без подмены fetch проверяются Authorization и отдельный отказ 401.
// EN: Test the OMEGA >= 1.5.19 key with real HTTP on a random local port: without replacing fetch, check Authorization and the distinct 401 refusal.
{
  const http = await import('node:http');
  const prishlo = {};   // RU: Заголовки сопоставляются по пути запроса, а не порядку прихода параллельных проб.
  // EN: Match headers by request path, not the arrival order of concurrent tests.
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      prishlo[req.url] = req.headers.authorization ?? null;
      if (req.headers.authorization !== 'Bearer k1') { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"unauthorized"}'); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(ZHIVOJ);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const baza = 'http://127.0.0.1:' + srv.address().port;
  const adres = baza + '/mcp/';
  await proba('КЛЮЧ: передан → заголовок Bearer ушёл, ответ разобран', async () => {
    const r = await sozdatSvyaz({ adres: baza + '/k1/', klyuch: 'k1' }).pozvat('omega_store', {});
    if (prishlo['/k1/'] !== 'Bearer k1') throw new Error('заголовок не ушёл: ' + prishlo['/k1/']);
    if (!r.udalos || !/Stored/.test(r.tekst)) throw new Error('ответ не разобран: ' + JSON.stringify(r).slice(0, 120));
  });
  await proba('КЛЮЧ: не задан → заголовка НЕТ (поведение до 1.5.19)', async () => {
    await sozdatSvyaz({ adres: baza + '/bez/' }).pozvat('omega_store', {});
    if (!('/bez/' in prishlo)) throw new Error('запрос не дошёл — проба слепа');
    if (prishlo['/bez/'] !== null) throw new Error('ушёл заголовок без ключа: ' + prishlo['/bez/']);
  });
  await proba('ПОРЧА: ключ задан пустым → отказ при создании связи', () => {
    try { sozdatSvyaz({ adres, klyuch: '  ' }); } catch (e) { if (e.code === 'OMEGA_KLYUCH_PUST') return; throw e; }
    throw new Error('пустой ключ принят');
  });
  await proba('ПОРЧА: неверный ключ → «отказала в доступе (401): ключ не принят», не «не разобрано»', async () => {
    const r = await sozdatSvyaz({ adres, klyuch: 'chuzhoj' }).pozvat('omega_store', {});
    if (r.udalos !== false || !/отказала в доступе \(401\): ключ не принят/.test(r.pochemu)) throw new Error('отказ 401 не назван: ' + r.pochemu);
  });
  await proba('ПОРЧА: служба требует ключ, а он не передан → «ключ не передан»', async () => {
    const r = await sozdatSvyaz({ adres }).pozvat('omega_store', {});
    if (r.udalos !== false || !/ключ не передан/.test(r.pochemu)) throw new Error('причина не названа: ' + r.pochemu);
  });
  await Promise.all(hody);
  srv.close();
}

await Promise.all(hody);
console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
