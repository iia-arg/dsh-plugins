import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-bityj-utf8.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-bityj-utf8.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm';
import { extractFunction } from './extract.mjs';
import { MessageReceipts, mailEnvelope, celyjUtf8 } from '../src/message-receipts.js';
import { ReceiptRuntime } from '../src/receipt-runtime.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bityj-utf8-')); const input = path.join(root, 'in'); fs.mkdirSync(input);
const receipts = new MessageReceipts(path.join(root, 'ledger')); let T = Date.UTC(2026, 8, 24, 10, 0, 0); receipts.now = () => T;
const session = { id: 's', header: { createdAt: 1 }, events: [] }; let sent = 0; const logs = [];
const agent = { session, send(m, target) { sent++; session.events.push({ type: 'agent/inbox/spliced', data: { target, start: 0, inserted: [m] } }); }, wakeDriver() {} };
const runtime = new ReceiptRuntime(receipts, { flush: async () => true });
const context = {mailStops:ordinaryMailControl, copyAsk: () => {}, fs, path, mailEnvelope, receipts, log: m => logs.push(m), A2A_EXT: ['.md', '.txt'], a2aReported: new Set(),
  A2A_TREVOG_PREDEL: 5, trevogOtkaza: 0, who_: 'проба', allowed: new Set(), tg: { send: async () => {} }, splitSender: text => ({ text }),
  spoolSender: () => 'sender', goalA2ASenders: new Set(), A2A_CHAT: 'a2a', agentFor: async () => ({ handle: { agent }, sessionId: 's' }),
  spoolAgeHours: () => 0, SPOOL_STALE_HOURS: 24, stripMark: x => x, lastOrigin: new Map(), receiptRuntime: () => runtime,
  platform: { createUserMessage: x => ({ id: 'message-' + sent, ...x }) }, quote: x => x };
const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const poll = vm.runInNewContext('(' + extractFunction(source, 'pollReceiptDirectory') + ')', context);
const header = vm.runInNewContext('(' + extractFunction(source, 'receiptReplyHeader') + ')', context);

let ok = 0; const proba = (imya, fn) => { const v = fn(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ok   ' + imya); };
const outbox = () => receipts.db.prepare("SELECT id, body FROM outbox ORDER BY id").all();
try {
  const bityj = Buffer.concat([Buffer.from('Задание Агенту: проверь ящик\n'), Buffer.from('Г').subarray(0, 1)]);
  assert.equal(celyjUtf8(bityj), false, 'подстава обязана быть битой');
  fs.writeFileSync(path.join(input, 'bad.txt'), bityj);
  for (let i = 0; i < 3; i++) await poll(input, 'a2a');
  const r = receipts.db.prepare("SELECT * FROM receipts WHERE blocked='invalid_utf8'").get();
  proba('битое письмо лежит в ledger удержанным (blocked=invalid_utf8), не исполнено, файл в ящике', () => {
    assert(r, 'строки invalid_utf8 нет'); assert.equal(sent, 0); assert(fs.existsSync(path.join(input, 'bad.txt')));
  });
  proba('строка журнала про него одна за три круга', () => {
    assert.equal(logs.filter(l => l.includes('bad.txt') && l.includes('UTF-8')).length, 1, JSON.stringify(logs));
  });
  proba('отправителю сразу «УДЕРЖАНО» маршрутом a2a (ступень 0) и суточная сводка', () => {
    const o = outbox(); assert(o.some(x => x.id === r.id + ':held:0' && x.body.includes('УДЕРЖАНО') && x.body.includes('invalid_utf8')), JSON.stringify(o));
    assert(o.some(x => x.id.startsWith('held-summary:') && x.body.includes(r.id)));
  });
  T += 3600001; await poll(input, 'a2a');
  proba('через час — вторая ступень лестницы', () => assert(outbox().some(x => x.id === r.id + ':held:1')));

  fs.writeFileSync(path.join(input, 'ok.txt'), 'целое письмо'); await poll(input, 'a2a');
  proba('целое письмо исполняется как раньше', () => assert.equal(sent, 1));

  fs.symlinkSync(path.join(input, 'nety'), path.join(input, 'ssylka.txt'));
  for (let i = 0; i < 3; i++) await poll(input, 'a2a');
  proba('прочая причина удержания — тоже одна строка журнала на письмо', () => {
    assert.equal(logs.filter(l => l.includes('ssylka.txt')).length, 1, JSON.stringify(logs.filter(l => l.includes('ssylka'))));
  });
  proba('шапка ответа на битое письмо не бросает', () => {
    const h = header({ raw: bityj, message_json: null, sender: '' }); assert(h.includes('не является целым UTF-8'), h);
  });
  console.log(`ИТОГО: ${ok} из 7`);
} catch (e) { console.log(`ИТОГО: ${ok} из 7 · КРАСНО: ${e.message}`); process.exitCode = 1; }
finally { receipts.close(); fs.rmSync(root, { recursive: true, force: true }); }
