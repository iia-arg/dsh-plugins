// RU: B-N-1642: подставной гость открытого Telegram-бота получает гостевой пресет и набор сайта, а не основной.
//     Корень пакета — STEND_KOREN (по умолчанию этот пакет): так тот же стенд гоняется на основе и на порче.
//     1 gostevojChat — кто гость; 2–4 решения marshrutyGostya (guest-channel.js; ими же пользуется index.js):
//     ключ беседы, пресет, «ограниченный ключ», закрытый бот; 5 все места выбора ключа и пресета в index.js переведены;
//     6 ротация /new сохраняет префикс гостя (настоящие MessageReceipts + ConversationSessions);
//     7 настоящая платформа: сессия telegram-gost-* под site-policy видит только pismo_rukovoditelyu, в том числе
//     после поздней регистрации, прямой вызов чужого инструмента отказан; сессия владельца не тронута.
//     8 письмо руководителю от гостя Telegram помечено «источник не удостоверен» (B-N-1642 r2);
//     9 telegram_send_file не регистрируется гостю Telegram (B-N-1642 r2).
//     Нужны DSH_TEST_APP и соседнее ядро (см. platforma-02.mjs); без них пробы 7 и 9 — СЛЕПОТА, код 2.
// EN: B-N-1642 harness: a fake open-bot Telegram guest gets the guest preset and site tool set, not the main one.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; 
import { fileURLToPath, pathToFileURL } from 'node:url';
const koren = process.env.STEND_KOREN ? path.resolve(process.env.STEND_KOREN) : fileURLToPath(new URL('..', import.meta.url));
const src = f => pathToFileURL(path.join(koren, 'src', f)).href;
const gc = await import(src('guest-channel.js')), sp = await import(src('site-policy.js'));
const { ConversationSessions } = await import(src('conversation-sessions.js')); const { MessageReceipts } = await import(src('message-receipts.js'));
const index = fs.readFileSync(path.join(koren, 'src', 'index.js'), 'utf8');
console.log('стенд гостя Telegram (B-N-1642): корень ' + koren);
let ok = 0, fail = 0, slepota = false;
const proba = async (imya, f) => { try { await f(); ok++; console.log('  ✅ ' + imya); } catch (e) { fail++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).split('\n')[0].slice(0, 220)); } };
const blok = (cfg, groups = { '-100111': { mode: 'mention' } }) => {
  if (typeof gc.marshrutyGostya !== 'function') throw Error('нет marshrutyGostya в guest-channel.js');
  return gc.marshrutyGostya(cfg, { allowed: new Set([158]), groups: () => groups, mergeChat: () => '-100999', a2aChat: () => 'a2a' });
};
const CFG = { openBot: true, preset: 'varvara', site: { preset: 'varvara-site' } };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-tg-gost-'));
const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
process.once('exit', cleanup); // Helpers can exit(2) before our finally. Only our own fixture.
let p;
try {
  await proba('1 gostevojChat: чужой личный и незаведённая группа — гость; свой личный, заведённая группа, закрытый бот — нет; непонятный id при открытом боте — гость (в закрытую)', () => {
    assert.equal(typeof gc.gostevojChat, 'function', 'нет gostevojChat');
    const s = { openBot: true, allowed: new Set([158]), groups: { '-100111': {} } };
    assert.equal(gc.gostevojChat(s, 777), true); assert.equal(gc.gostevojChat(s, '777'), true); assert.equal(gc.gostevojChat(s, -100222), true);
    assert.equal(gc.gostevojChat(s, 158), false); assert.equal(gc.gostevojChat(s, -100111), false);
    assert.equal(gc.gostevojChat({ ...s, openBot: false }, 777), false); for (const x of [0, 'abc', 'a2a', NaN]) { assert.equal(gc.gostevojChat(s, x), true, String(x)); assert.equal(gc.gostevojChat({ ...s, openBot: false }, x), false, 'закрытый ' + String(x)); }
  });
  await proba('2 ключ беседы (marshrutyGostya): владелец 158 → 158; чужой 777 → gost-777; заведённая группа → она же; чужая группа → gost-…; MERGE → a2a', () => {
    const f = blok(CFG);
    assert.equal(String(f.marshrutChata(158)), '158'); assert.equal(f.marshrutChata(777), 'gost-777'); assert.equal(String(f.marshrutChata(-100111)), '-100111');
    assert.equal(f.marshrutChata(-100222), 'gost--100222'); assert.equal(f.marshrutChata('-100999'), 'a2a'); assert.equal(f.chatIzKlyucha('gost--100222'), '-100222');
  });
  await proba('3 пресет: гость → site.preset (guestPreset главнее), свой → основной, site-N → site.preset; без гостевого пресета гостю — отказ', () => {
    const f = blok(CFG);
    assert.equal(f.presetDlya('gost-777'), 'varvara-site'); assert.equal(f.presetDlya('158'), 'varvara'); assert.equal(f.presetDlya('site-5'), 'varvara-site');
    assert.equal(blok({ ...CFG, guestPreset: 'varvara-gost' }).presetDlya('gost-777'), 'varvara-gost');
    assert.throws(() => blok({ openBot: true, preset: 'varvara' }).presetDlya('gost-777'), /Гостевой пресет не задан/);
    assert.equal(f.ogranichennyjKlyuch('gost-777'), true); assert.equal(f.ogranichennyjKlyuch('site-5'), true); assert.equal(f.ogranichennyjKlyuch('158'), false);
  });
  await proba('2б непонятный id чата при открытом боте: маршрут не строится (отказ), а не ключ, который выдал бы основной пресет; MERGE и свои — как прежде', () => {
    const b = blok(CFG);
    for (const x of [0, 'abc', NaN, '']) assert.throws(() => b.marshrutChata(x), /маршрут гостя не строится/, String(x));
    assert.equal(b.marshrutChata(158), 158); assert.equal(b.marshrutChata('-100999'), 'a2a'); assert.equal(b.marshrutChata(777), 'gost-777');
  });
  await proba('4 закрытый бот: ключ чужого не гостевой (его не пустит допуск канала)', () => { assert.equal(String(blok({ ...CFG, openBot: false }).marshrutChata(777)), '777'); });
  await proba('5 index.js: все выборы ключа и пресета переведены — нет site-only protectSite, нет resolve(config.preset), ключ чата только через marshrutChata', () => {
    assert.equal((index.match(/config\.site&&key\.startsWith\('site-'\)\)protectSite/g) ?? []).length, 0, 'site-only protectSite остался');
    assert.equal((index.match(/presets\.resolve\(config\.preset\)/g) ?? []).length, 0, 'resolve(config.preset) остался');
    assert.equal((index.match(/MERGE_CHAT\s*&&\s*String\(\s*chatId\s*\)\s*===\s*MERGE_CHAT/g) ?? []).length, 0, 'ключ чата считается мимо marshrutChata');
    assert.equal((index.match(/marshrutyGostya\(config,/g) ?? []).length, 1, 'index.js не берёт решения из marshrutyGostya');
    assert.equal((index.match(/marshrutChata\(chatId\)/g) ?? []).length, 7, 'вызовов marshrutChata не 7');
    const rot = fs.readFileSync(path.join(koren, 'src', 'rotate-conversation.js'), 'utf8');
    assert.ok(rot.includes("'gost-'+String(value)===key"), 'rotate-conversation: вложения гостевой беседы не находятся по ключу gost-');
    assert.equal((index.match(/presets\.resolve\(presetDlya\(key\)\)/g) ?? []).length, 3, 'resolve(presetDlya(key)) не в трёх местах');
  });
  await proba('6 ротация /new: гость telegram-gost-777 → telegram-gost-777-v2-…, группа → telegram-gost--100222-v2-…, свой → telegram-v2-…', () => {
    const l = new MessageReceipts(path.join(root, 'kniga'));
    try {
      const cs = new ConversationSessions(l);
    const novyj = (key, n) => { cs.pin(key, { id: `telegram-${key}`, createdAt: 1000 + n });
      const r = l.receive('s' + n, 'x' + n, { logicalKey: 'k' + n, route: 'tg', routeKey: key, expectsReply: false, hold: false }); return cs.begin(key, r.id).new_id; };
    assert.match(novyj('gost-777', 1), /^telegram-gost-777-v2-/); assert.match(novyj('gost--100222', 2), /^telegram-gost--100222-v2-/); assert.match(novyj('158', 3), /^telegram-v2-/);
    } finally { l.close(); }
  });
  await proba('8 письмо руководителю от гостя Telegram помечено «источник не удостоверен» (личный, группа, ротация); сайт — прежняя метка; свой — без метки', async () => {
    const pisma = [], t = gc.supervisorTool({ recipient: 'marc', agentName: 'varvara', send: async (r, body) => { pisma.push(body); return { status: 'placed', recipient: r }; } });
    const shlyu = async sid => { await t.execute({ text: 'проба' }, { agent: { session: { header: { id: sid } } } }); return pisma.at(-1).split('\n')[0]; };
    assert.equal(await shlyu('telegram-gost-777'), '[источник не удостоверен; гость Telegram, чат 777]');
    assert.equal(await shlyu('telegram-gost--100222-v2-ab12'), '[источник не удостоверен; гость Telegram, чат -100222]');
    assert.equal(await shlyu('telegram-site-5'), '[источник не удостоверен; посетитель сайта, разговор 5]');
    assert.match(await shlyu('telegram-158'), /^\[письмо руководителю от агента varvara; сессия telegram-158\]$/);
  });
  if (!process.env.DSH_TEST_APP) { slepota = true; console.log('  СЛЕПОТА 9: нет DSH_TEST_APP — dsh-tools не разрешить'); }
  else await proba('9 файл/PDF регистрируются TG-гостю и своему; сайт не получает их', async () => {
    const { installFileTools } = await import(src('outgoing-files.js')), zareg = [], zhurnal = [], ws = path.join(root, 'ws9');
    const agent = id => ({ session: { id, header: { cwd: ws } }, ctx: { get: () => ({ register: t => { zareg.push(id+':'+t.name); return () => {}; } }) } });
    const roots = ['telegram-gost-777', 'telegram-gost--100222-v2-ab12', 'telegram-site-5', 'telegram-158'].map(agent);
    installFileTools({ on() {}, effect() {}, agents: { roots: () => roots } }, { workspace: ws, config: {openBot:true}, appDir: process.env.DSH_TEST_APP, log: s => zhurnal.push(s) });
    assert.ok(!zhurnal.some(s => /не подключён/.test(s)), 'прибор слеп: ' + zhurnal.join(' | '));
    assert.deepEqual(zareg, ['telegram-gost-777','telegram-gost--100222-v2-ab12','telegram-158'].flatMap(id=>['telegram_send_file','telegram_make_pdf'].map(name=>id+':'+name)));
  });
  try { const { podnyatPlatformu02 } = await import('./platforma-02.mjs'); p = await podnyatPlatformu02({ root: path.join(root, 'pl') }); }
  catch (e) { slepota = true; console.log('  СЛЕПОТА 7: платформа не поднята — ' + String(e?.message ?? e).slice(0, 160)); }
  if (p) {
    await proba('7 платформа: гость видит только pismo_rukovoditelyu (и после поздней регистрации), чужой вызов отказан без следа; владелец и «gostx» не тронуты', async () => {
      const tools = p.ctx.get('tools'), calls = [];
      for (const name of ['pismo_rukovoditelyu', 'omega_query', 'bash', 'read'])
        tools.register({ name, description: name, parameters: {}, output: { schema: { type: 'object', properties: {}, additionalProperties: true }, render: () => [] }, execute: async () => { calls.push(name); return {}; } });
      const gost = (await p.agents.create({ sessionId: 'telegram-gost-777', setup: async (ctx, agent) => sp.installSitePolicy(ctx, agent, { closed: () => false }) })).agent;
      const vlad = (await p.agents.create({ sessionId: 'telegram-158' })).agent, rjadom = (await p.agents.create({ sessionId: 'telegram-gostx-1' })).agent;
      const imena = a => tools.wireSchemas(a).schemas.map(x => x.name).sort();
      assert.deepEqual(imena(gost), ['pismo_rukovoditelyu']); assert.ok(imena(vlad).includes('bash')); assert.ok(imena(rjadom).includes('bash'));
      gost.ctx.get('tools').register({ name: 'pozdnij', description: 'x', parameters: {}, output: { schema: { type: 'object', properties: {} }, render: () => [] }, execute: async () => { calls.push('pozdnij'); return {}; } });
      assert.deepEqual(imena(gost), ['pismo_rukovoditelyu'], 'поздний инструмент виден гостю');
      for (const name of ['bash', 'read', 'pozdnij']) assert.ok((await tools.execute({ name, arguments: {}, agent: gost, callId: name, signal: new AbortController().signal })).isError, name);
      assert.equal(calls.length, 0, 'вызовы: ' + calls.join(','));
      assert.ok(!(await tools.execute({ name: 'pismo_rukovoditelyu', arguments: {}, agent: gost, callId: 'ok', signal: new AbortController().signal })).isError);
    });
  }
} finally { try { await p?.ctx.fiber.dispose(); } finally { cleanup(); } }
console.log(`итог: ok=${ok} FAIL=${fail}${slepota ? ' СЛЕПОТА=1' : ''}`);
// Run cleanup after exit writers registered during the fixture lifecycle.
process.removeListener('exit', cleanup);
process.once('exit', cleanup);
process.exit(fail ? 1 : slepota ? 2 : 0);
