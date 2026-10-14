import {ordinaryMailControl} from './ordinary-mail-control-fixture.mjs';
// RU: Изолированный стенд stend-zakryt-bityj-utf8.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-zakryt-bityj-utf8.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm';
import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
import { extractFunction } from './extract.mjs';
import { MessageReceipts, mailEnvelope, celyjUtf8 } from '../src/message-receipts.js';
import { ReceiptRuntime } from '../src/receipt-runtime.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zakryt-bityj-')); const input = path.join(root, 'in'); fs.mkdirSync(input);
const ledger = path.join(root, 'ledger');
const receipts = new MessageReceipts(ledger); let T = Date.now(); receipts.now = () => T;
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
const ADMIN = new URL('../src/receipt-admin.mjs', import.meta.url).pathname;
const admin = (...a) => { try { return { kod: 0, out: execFileSync(process.execPath, [ADMIN, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { kod: e.status, out: String(e.stderr ?? '') + String(e.stdout ?? '') }; } };
const ochered = () => receipts.db.prepare('SELECT count(*) AS n FROM receipts WHERE finished_at IS NULL AND claimed_turn IS NULL').get().n;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

let ok = 0; const ZHDYOM = 8;
const proba = (imya, fn) => { const v = fn(); if (v !== undefined) throw new Error('тело пробы вернуло значение — пробы говорят только исключением'); ok++; console.log('  ok   ' + imya); };
try {
  const bityj = Buffer.concat([Buffer.from('Ревизия пунктов A\n'), Buffer.from('Г').subarray(0, 1)]);
  assert.equal(celyjUtf8(bityj), false, 'подстава обязана быть битой');
  const fajl = path.join(input, 'coordinator-1790628839697210616.txt'); fs.writeFileSync(fajl, bityj);
  for (let i = 0; i < 2; i++) await poll(input, 'a2a');
  const r = receipts.db.prepare("SELECT * FROM receipts WHERE blocked='invalid_utf8'").get();
  proba('исходно: удержано invalid_utf8, файл в ящике, «в очереди» 1 (агент «занят» для smontirovat-fajly)', () => {
    assert(r, 'строки invalid_utf8 нет'); assert(fs.existsSync(fajl)); assert.equal(ochered(), 1); assert.equal(sent, 0);
  });
  proba('approve-new на invalid_utf8 — ОТКАЗ (код 2), запись не тронута', () => {
    const a = admin('approve-new', ledger, r.id, 'Координатор', 'regression-case'); assert.equal(a.kod, 2, a.out);
    assert.match(a.out, /не допускает такого разрешения/); assert.equal(receipts.get(r.id).blocked, 'invalid_utf8'); assert.equal(ochered(), 1);
  });
  proba('discard без ссылки — ОТКАЗ, запись не тронута', () => {
    const a = admin('discard', ledger, r.id, 'Координатор'); assert.notEqual(a.kod, 0, a.out); assert.equal(receipts.get(r.id).finished_at, null);
  });
  const a = admin('discard', ledger, r.id, 'Координатор', 'regression-case: заменено переподачей, исход сверен вручную');
  proba('discard с оператором и ссылкой — код 0: завершено operator_discarded, в audit оператор и ссылка', () => {
    assert.equal(a.kod, 0, a.out); const z = receipts.get(r.id);
    assert.notEqual(z.finished_at, null); assert.equal(z.outcome, 'operator_discarded'); assert.equal(z.blocked, null);
    const au = receipts.db.prepare("SELECT detail FROM audit WHERE receipt_id=? AND kind='operator_discard'").get(r.id);
    assert(au && au.detail.includes('Координатор') && au.detail.includes('заменено переподачей'), JSON.stringify(au));
  });
  proba('после discard «в очереди» 0 — агент для smontirovat-fajly свободен; отправителю ответ «не исполнялось»', () => {
    assert.equal(ochered(), 0);
    const o = receipts.db.prepare('SELECT body FROM outbox WHERE id=?').get(r.id + ':result');
    assert(o && o.body.includes('operator_discarded') && o.body.includes('не исполнялось'), JSON.stringify(o));
  });
  await poll(input, 'a2a');
  proba('следующий круг опроса: исходник ушёл из ящика в released/ байт в байт, source_released=1', () => {
    assert(!fs.existsSync(fajl), 'файл остался в ящике');
    const s = receipts.db.prepare('SELECT * FROM sources WHERE receipt_id=?').get(r.id);
    assert.equal(s.source_released, 1); assert(s.archive_path && fs.existsSync(s.archive_path)); assert.equal(sha(fs.readFileSync(s.archive_path)), sha(bityj));
    assert.equal(sent, 0, 'закрытое не исполнялось');
  });
  T += 25 * 3600 * 1000; await poll(input, 'a2a');
  proba('через 25 ч — ни ступени «24 часа истёк», ни строки в сводке УДЕРЖАНО', () => {
    const o = receipts.db.prepare('SELECT id, body FROM outbox').all();
    assert(!o.some(x => x.id === r.id + ':held:2'), 'ступень 2 после закрытия');
    const den = 'held-summary:' + String(Math.floor(T / 86400000));
    assert(!o.some(x => x.id === den && x.body.includes(r.id)), 'закрытое в сводке новых суток');
  });
  proba('повторный discard закрытого — ОТКАЗ', () => {
    const b = admin('discard', ledger, r.id, 'Координатор', 'повтор'); assert.equal(b.kod, 2, b.out);
  });
} catch (e) { console.log(`  КРАСНО: ${e.message}`); process.exitCode = 1; }
finally {
  console.log(`итог: ${ok} из ${ZHDYOM}`);
  if (ok !== ZHDYOM && !process.exitCode) process.exitCode = 1;
  receipts.close(); fs.rmSync(root, { recursive: true, force: true });
}
