// RU: stend-usage-hoda: итог usage хода из thread/tokenUsage/updated (codex-app-server.mjs schetUsageHoda) — строка журнала и строка
// RU: $CODEX_HOME/dsh-usage-hodov.jsonl на подставном потоке app-server; порча (без turnId, негодные числа, недоступный дом) не роняет ход.
// EN: stend-usage-hoda: per-turn usage from thread/tokenUsage/updated — log line and $CODEX_HOME/dsh-usage-hodov.jsonl on a fake app-server
// EN: stream; corruption (no turnId, bad numbers, unwritable home) does not break the turn. Fixture, not a live subscription.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { progonAppServer } from '../codex-app-server.mjs';
const tick = () => new Promise((r) => setImmediate(r));
const u = (i, c, o, r) => ({ totalTokens: i + o, inputTokens: i, cachedInputTokens: c, cacheWriteInputTokens: 0, outputTokens: o, reasoningOutputTokens: r });
let proshlo = 0, vsego = 0;
const proba = (imya, f) => { vsego++; try { f(); proshlo++; console.log('✅ ' + imya); } catch (e) { console.log('❌ ' + imya + ' — ' + e.message); } };

async function hod(uvedomleniya, dom) {
  let emit, started = false, dead; const died = new Promise((r) => { dead = r; }); const logi = [];
  const k = { slushat: (f) => { emit = f; }, umer: died, uvedomit() {}, async zakryt() { dead({ code: 0 }); },
    async zapros(m) { if (m === 'thread/start') return { thread: { id: 'thread-1' } }; if (m === 'turn/start') { started = true; return { turn: { id: 'turn-7' } }; } return {}; } };
  const sobytiya = [];
  const run = (async () => { for await (const e of progonAppServer({ klientImpl: () => k, log: (t) => logi.push(t), zapros: 'A', porog: { porog: 10 ** 9 },
    tekstSignala: 'P', env: { CODEX_HOME: dom } })) sobytiya.push(e); })();
  while (!started) await tick(); await tick();
  for (const p of uvedomleniya) emit('thread/tokenUsage/updated', { threadId: 'thread-1', ...p });
  emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-7', status: 'completed' } });
  await run;
  const f = path.join(dom, 'dsh-usage-hodov.jsonl');
  const stroki = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { logi, stroki, sobytiya, zhurnal: logi.find((l) => l.startsWith('usage хода:')) ?? '' };
}
const vrem = () => fs.mkdtempSync(path.join(os.tmpdir(), 'stend-usage-hoda-'));

{ // 1) обычный ход: 2 вызова, второй пришёл дважды (повтор), основа 0
  const d = vrem();
  const r = await hod([
    { turnId: 'turn-7', tokenUsage: { last: u(100, 40, 5, 1), total: u(100, 40, 5, 1) } },
    { turnId: 'turn-7', tokenUsage: { last: u(150, 90, 7, 2), total: u(250, 130, 12, 3) } },
    { turnId: 'turn-7', tokenUsage: { last: u(150, 90, 7, 2), total: u(250, 130, 12, 3) } }], d);
  proba('строка журнала: вызовов=2 input=250 cached=130 output=12 reasoning=3 полнота=ok', () => assert.match(r.zhurnal,
    /turn=turn-7 thread=thread-1 статус=completed вызовов=2 input=250 cached=130 cache_write=0 output=12 reasoning=3 полнота=ok без_turn=0 негодных=0/));
  proba('файл: одна строка, те же числа, режим 0600', () => { assert.equal(r.stroki.length, 1); const s = r.stroki[0];
    assert.deepEqual([s.thread, s.turn, s.vyzovov, s.input, s.cached, s.output, s.reasoning, s.polnota], ['thread-1', 'turn-7', 2, 250, 130, 12, 3, 'ok']);
    assert.equal(fs.statSync(path.join(d, 'dsh-usage-hodov.jsonl')).mode & 0o777, 0o600); });
  proba('ход прежний: usage и itog-app-server выданы', () => assert.deepEqual(r.sobytiya.map((e) => e.type), ['usage', 'itog-app-server']));
  proba('в строке нет текста хода и запроса', () => { assert.ok(!JSON.stringify(r.stroki).includes('"A"')); assert.ok(!r.zhurnal.includes(' A ')); });
}
{ // 2) продолжение нити: основа не ноль (total первого уведомления больше last)
  const r = await hod([{ turnId: 'turn-7', tokenUsage: { last: u(10, 0, 1, 0), total: u(1010, 500, 51, 4) } },
    { turnId: 'turn-7', tokenUsage: { last: u(20, 5, 2, 0), total: u(1030, 505, 53, 4) } }], vrem());
  proba('продолжение нити: итог хода = 30/5/3, не нарастающий итог нити', () => assert.match(r.zhurnal, /вызовов=2 input=30 cached=5 cache_write=0 output=3 reasoning=0 полнота=ok/));
}
{ // 3) порча: уведомление без turnId и с негодным числом — ход не падает, оба учтены отдельно
  const r = await hod([{ tokenUsage: { last: u(1, 0, 1, 0), total: u(1, 0, 1, 0) } },
    { turnId: 'turn-7', tokenUsage: { last: { inputTokens: 'x' }, total: null } }], vrem());
  proba('порча: ход закончен, строка «полнота=net_uvedomlenij без_turn=1 негодных=1»', () => {
    assert.deepEqual(r.sobytiya.map((e) => e.type), ['usage', 'itog-app-server']);
    assert.match(r.zhurnal, /вызовов=0 input=нет .* полнота=net_uvedomlenij без_turn=1 негодных=1/); });
}
{ // 4) дом недоступен для записи — ход не падает, в журнале «не записано»
  const r = await hod([{ turnId: 'turn-7', tokenUsage: { last: u(5, 0, 1, 0), total: u(5, 0, 1, 0) } }], '/proc/net-takogo-doma');
  proba('недоступный CODEX_HOME: ход закончен, «usage хода: не записано»', () => {
    assert.deepEqual(r.sobytiya.map((e) => e.type), ['usage', 'itog-app-server']);
    assert.ok(r.logi.some((l) => l.startsWith('usage хода: не записано')), r.logi.join(' | ')); });
}
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
