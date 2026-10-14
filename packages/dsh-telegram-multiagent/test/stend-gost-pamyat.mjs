// RU: B-N-1644: гость (сайт и открытый Telegram-бот) может видеть второй инструмент — pamyat_dlya_gostej (чтение СВОЕЙ
//     памяти, только помеченное «для гостей»). Обязателен по-прежнему pismo_rukovoditelyu; pamyat_dlya_gostej — допустим,
//     но не обязателен (у агента без настройки dsh-pamyat-omega gostyam его нет). Иные инструменты памяти
//     (pamyat_po_smyslu, omega_query/omega_store) и всё прочее гостю закрыты.
//     1 naborGostyaGoden: обязательный ⊆ имена ⊆ разрешённые; 2 проверка моста (descriptor) по тому же правилу;
//     3 платформа: с зарегистрированным pamyat_dlya_gostej гость сайта и гость Telegram видят ровно два имени, вызов
//     pamyat_dlya_gostej проходит, pamyat_po_smyslu/omega_query/omega_store/bash — отказ без следа; владелец не тронут;
//     4 платформа: без pamyat_dlya_gostej набор гостя ровно pismo_rukovoditelyu и проверка набора не падает.
//     Корень пакета — STEND_KOREN. Нужны DSH_TEST_APP и соседнее ядро (platforma-02.mjs); без них 3–4 — СЛЕПОТА, код 2.
// EN: B-N-1644 harness: the guest may additionally see pamyat_dlya_gostej; pismo_rukovoditelyu stays mandatory.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const koren = process.env.STEND_KOREN ? path.resolve(process.env.STEND_KOREN) : fileURLToPath(new URL('..', import.meta.url));
const sp = await import(pathToFileURL(path.join(koren, 'src', 'site-policy.js')).href);
console.log('стенд памяти гостя в канале (B-N-1644): корень ' + koren);
let ok = 0, fail = 0, slepota = false;
const proba = async (imya, f) => { try { await f(); ok++; console.log('  ✅ ' + imya); } catch (e) { fail++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).split('\n')[0].slice(0, 220)); } };
const P = 'pismo_rukovoditelyu', M = 'pamyat_dlya_gostej';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-gost-pamyat-'));
const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
process.once('exit', cleanup); // Helpers can exit(2) before our finally. Only our own fixture.
let p;
try {
  await proba('1 naborGostyaGoden: [pismo], [pismo, pamyat] — да; [pamyat], [pismo, bash], [pismo, pamyat_po_smyslu], [] — нет', () => {
    assert.equal(typeof sp.naborGostyaGoden, 'function', 'нет naborGostyaGoden');
    const g = sp.naborGostyaGoden;
    assert.equal(g([P]), true); assert.equal(g([M, P]), true);
    for (const x of [[M], ['bash', P], [P, 'pamyat_po_smyslu'], [P, 'omega_query'], []]) assert.equal(g(x), false, JSON.stringify(x));
  });
  await proba('2 проверка моста: descriptor [pismo, pamyat] — проходит; [pismo, omega_query] и [pamyat] — отказ', async () => {
    const ag = { id: 'a' };
    const ctxMost = (names) => ({ get: (i) => (i === 'mcpBridge' ? { descriptor: () => ({ tools: names.map((name) => ({ name })) }) } : undefined) });
    const sk = sp.checkSiteBridge;
    assert.equal(typeof sk, 'function', 'checkSiteBridge не экспортирован — проба слепа');
    sk(ctxMost([P, M]), ag); sk(ctxMost([P]), ag);
    assert.throws(() => sk(ctxMost([P, 'omega_query']), ag)); assert.throws(() => sk(ctxMost([M]), ag));
  });
  try { const { podnyatPlatformu02 } = await import(pathToFileURL(path.join(fileURLToPath(new URL('.', import.meta.url)), 'platforma-02.mjs')).href); p = await podnyatPlatformu02({ root: path.join(root, 'pl') }); }
  catch (e) { slepota = true; console.log('  СЛЕПОТА 3–4: платформа не поднята — ' + String(e?.message ?? e).slice(0, 160)); }
  if (p) {
    const tools = p.ctx.get('tools'), calls = [];
    const reg = (name) => tools.register({ name, description: name, parameters: {}, output: { schema: { type: 'object', properties: {}, additionalProperties: true }, render: () => [] }, execute: async () => { calls.push(name); return {}; } });
    const imena = (a) => tools.wireSchemas(a).schemas.map((x) => x.name).sort();
    const vyzov = async (a, name) => (await tools.execute({ name, arguments: {}, agent: a, callId: name, signal: new AbortController().signal })).isError;
    await proba('4 без pamyat_dlya_gostej: набор гостя ровно [pismo], проверка набора не падает', async () => {
      reg(P); reg('bash');
      const g = (await p.agents.create({ sessionId: 'telegram-site-41', setup: async (ctx, agent) => sp.installSitePolicy(ctx, agent, { closed: () => false }) })).agent;
      assert.deepEqual(imena(g), [P]);
      const st = g[Symbol.for('dsh-telegram-multiagent.site-policy')]; assert.doesNotThrow(() => st.check());
    });
    await proba('3 с pamyat_dlya_gostej: гость сайта и гость Telegram видят ровно [pamyat, pismo]; вызов pamyat — да; pamyat_po_smyslu/omega_*/bash — отказ без следа; владелец не тронут', async () => {
      for (const n of [M, 'pamyat_po_smyslu', 'omega_query', 'omega_store']) reg(n);
      const sajt = (await p.agents.create({ sessionId: 'telegram-site-42', setup: async (ctx, agent) => sp.installSitePolicy(ctx, agent, { closed: () => false }) })).agent;
      const gost = (await p.agents.create({ sessionId: 'telegram-gost-777', setup: async (ctx, agent) => sp.installSitePolicy(ctx, agent, { closed: () => false }) })).agent;
      const vlad = (await p.agents.create({ sessionId: 'telegram-158' })).agent;
      assert.deepEqual(imena(sajt), [M, P]); assert.deepEqual(imena(gost), [M, P]);
      for (const a of [sajt, gost]) assert.doesNotThrow(() => a[Symbol.for('dsh-telegram-multiagent.site-policy')].check());
      calls.length = 0;
      assert.equal(await vyzov(gost, M), false, 'pamyat_dlya_gostej отказан');
      for (const n of ['pamyat_po_smyslu', 'omega_query', 'omega_store', 'bash']) assert.equal(await vyzov(gost, n), true, n);
      assert.deepEqual(calls, [M], 'вызовы: ' + calls.join(','));
      for (const n of ['pamyat_po_smyslu', 'omega_query', 'bash', M, P]) assert.ok(imena(vlad).includes(n), 'у владельца нет ' + n);
    });
  }
} finally { try { await p?.ctx.fiber.dispose(); } finally { cleanup(); } }
console.log(`итог: ok=${ok} FAIL=${fail}${slepota ? ' СЛЕПОТА=1' : ''}`);
// Run cleanup after exit writers registered during the fixture lifecycle.
process.removeListener('exit', cleanup);
process.once('exit', cleanup);
process.exit(fail ? 1 : slepota ? 2 : 0);
