// RU: Настоящие session/event и loop в одном контексте; только внешние IO заменены.
// EN: Real session/event and loop share one binding; only external IO is stubbed.
// Возврат прежнего присваивания за managed/chatId return обязан краснить этот стенд.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {extractFunction} from './extract.mjs';
import os from 'node:os';import path from 'node:path';import {ClaudeTurnUsage} from '../src/claude-turn-usage.js';
const usageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'prostoya-usage-')),claudeTurnUsage=new ClaudeTurnUsage(usageRoot,'fixture');
process.on('exit',()=>{claudeTurnUsage.close();fs.rmSync(usageRoot,{recursive:true,force:true})});

const source = fs.readFileSync(process.argv[2] ?? new URL('../src/index.js', import.meta.url), 'utf8');
const registration = "ctx.on('session/event', (session, event) => {";
const start = source.indexOf(registration), end = source.indexOf('\n  });', start);
assert(start >= 0 && end > start, 'СЛЕПОТА: не найден обработчик session/event');
const declarations = ['let momentPoslednegoHoda', 'const PROSTOJ_MIN'].map(name => {
  const at = source.indexOf(name);
  assert(at >= 0, `СЛЕПОТА: ${name}`);
  return source.slice(at, source.indexOf(';', at) + 1);
}).join('\n');

function fixture({managed = true, chat = '42'} = {}) {
  const logs = [];
  let now = 1_800_000_000_000, handler, polls = 0, run;
  const scope = vm.createContext({autopilot:null,usageRuntime:null,apNotices:null,claudeTurnUsage,
    ctx: {on: (name, fn) => {assert.equal(name, 'session/event'); handler = fn;}},
    Date: {now: () => now}, log: x => logs.push(x),
    receipts: {managed: () => managed ? [{claimed_turn: 7}] : [], db: {prepare: () => ({all: () => []})}},
    receiptRuntime: () => ({observe: async () => {}}),
    attachmentStore: {confirm: async () => [], tick: async () => {}},
    tg: {send: async () => {}, typing: async () => {}, poll: async () => {
      assert(++polls <= 20, 'СЛЕПОТА: более 20 циклов');
      if (polls === 20) run.alive = false;
      return [];
    }},
    receiptTick: async () => {}, pollA2A: async () => {}, pollSpool: async () => {},
    botKto: async () => ({id: 1}), a2aReported: new Set(), A2A_IN: '', SPOOL_IN: '', A2A_CHAT: 'a2a',
    sessionToChat: new Map(chat === null ? [] : [['s', chat]]), tgChatFor: new Map(),
    oborvalsyaOshibkoj: new Map(), goalOrigin: new Map(), pendingAsk: new Map(), turnAsk: new Map(), lastOrigin: new Map(),
    stripGoalMarker: x => x, stripFileAck: x => x,
    setTimeout: () => {throw Error('СЛЕПОТА: loop попал в ошибку: ' + logs.join('\n'));},
    errDetail: e => String(e),
  });
  vm.runInContext(declarations + '\n' + source.slice(start, end + '\n  });'.length) + '\n' + extractFunction(source, 'loop'), scope);
  return {
    event(type, data = {turn: 7}) {handler({id: 's'}, {type, data});},
    advance(minutes) {now += minutes * 60000;},
    async poll() {
      logs.length = 0; polls = 0; run = {alive: true}; scope.run = run;
      await vm.runInContext('loop(run)', scope, {timeout: 1000});
      assert.equal(run.finished, true); assert.equal(polls, 20);
      const lines = logs.filter(x => x.includes('опрос жив'));
      assert.equal(lines.length, 1, logs.join('\n'));
      assert(!logs.some(x => x.includes('ошибка обработки')), logs.join('\n'));
      return lines[0];
    },
  };
}
let passed = 0, failed = 0;
async function test(name, fn) {
  try {await fn(); passed++; console.log('PASS ' + name);}
  catch (e) {failed++; console.error('FAIL ' + name + ': ' + e.message);}
}
await test('без завершённых ходов — НЕ БЫЛО', async () => {
  const f = fixture(); assert.match(await f.poll(), /ходов с подъёма НЕ БЫЛО/);
});
for (const [name, options] of [
  ['managed Telegram', {}], ['managed A2A', {chat: 'a2a'}],
  ['managed без chatId', {chat: null}], ['legacy Telegram', {managed: false}],
  ['legacy без chatId', {managed: false, chat: null}],
]) {
  await test(name + ': turn/end → последний ход 5 мин', async () => {
    const f = fixture(options);
    f.event('turn/end'); f.advance(5);
    assert.match(await f.poll(), /последний ход 5 мин назад/);
  });
}
await test('порог 30 мин и свежий ход снимает простой', async () => {
  const f = fixture(); f.event('turn/end'); f.advance(29);
  assert.doesNotMatch(await f.poll(), /ПРОСТОЙ/);
  f.advance(1); assert.match(await f.poll(), /🔴 ПРОСТОЙ: последний ход 30 мин назад \(порог 30\)/);
  f.event('turn/end', {turn: 8}); assert.match(await f.poll(), /последний ход 0 мин назад/);
  assert.doesNotMatch(await f.poll(), /ПРОСТОЙ|НЕ БЫЛО/);
});
await test('chunk/message/start не сбрасывают давность', async () => {
  const f = fixture(); f.event('turn/end'); f.advance(31);
  f.event('assistant/chunk'); f.event('assistant/message', {turn: 7, message: {content: []}}); f.event('turn/start');
  assert.match(await f.poll(), /🔴 ПРОСТОЙ: последний ход 31 мин назад/);
});
await test('завершение с ошибкой тоже завершённый ход', async () => {
  const f = fixture(); f.event('turn/end', {turn: 7, reason: {kind: 'error', error: {message: 'fixture'}}}); f.advance(2);
  assert.match(await f.poll(), /последний ход 2 мин назад/);
});
console.log(`ИТОГ: ${passed}/${passed + failed}`);
process.exitCode = failed ? 1 : 0;
