// RU: B-N-1619 (1): статус прерывания отправителю. Настоящий MessageReceipts и completeRow во временном каталоге; модуль — STEND_MR
//     (по умолчанию ../src/message-receipts.js; порча — копия модуля). Пробы: обычное → 1 статус; пачка одной причины → 1 свёрнутый
//     с перечнем; другая причина → отдельный; машинное (ответ по receipt, сам статус, task-control) → 0; ждал ответа → 0 статусов
//     (есть :result); сброс лимита в тексте; после отправки — новое окно; tg → copy-tg; site → 0. Повтор письма не проверяется: его нет.
// EN: B-N-1619 (1) interruption status harness on the real ledger; module from STEND_MR.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = process.env.STEND_MR ? pathToFileURL(path.resolve(process.env.STEND_MR)).href : new URL('../src/message-receipts.js', import.meta.url).href;
const { MessageReceipts, PRERYV_METKA } = await import(mod);
if (typeof PRERYV_METKA !== 'string') { console.error('СЛЕПОТА: модуль без PRERYV_METKA — статус прерывания не заведён'); process.exit(2); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-interrupt-status-'));
let ok = 0, fail = 0;
const proba = (imya, f) => { try { f(); ok++; console.log('  ✅ ' + imya); } catch (e) { fail++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).split('\n')[0].slice(0, 200)); } };
try {
  const l = new MessageReceipts(root);
  let n = 0;
  const pismo = (tekst, o = {}) => l.receive('k' + (++n), tekst, { logicalKey: 'k' + n, expectsReply: false, ...o });
  const end = msg => ({ reason: { kind: 'error', error: { message: msg } } });
  const prervat = (r, msg) => l.tx(() => l.completeRow(l.get(r.id), 'interrupted_unknown', { end: end(msg), outputs: [] }, 'x'));
  const statusy = () => l.db.prepare("SELECT * FROM outbox WHERE id LIKE 'interrupt-status:%' ORDER BY created_at,id").all();
  const otpravit = () => l.db.prepare("UPDATE outbox SET sent_at=?,attempts=1 WHERE id LIKE 'interrupt-status:%' AND sent_at IS NULL").run(l.now());

  console.log('стенд статуса прерывания (B-N-1619): модуль ' + mod.replace('file://', ''));
  const a = pismo('Забава → Заре · сделай метку');
  prervat(a, 'API Error: safeguards flagged this session');
  proba('1 обычное прерванное (ответа не ждали) → один статус a2a, с меткой, классом и id', () => {
    const s = statusy(); assert.equal(s.length, 1); assert.equal(s[0].route, 'a2a');
    assert.ok(s[0].body.includes(PRERYV_METKA)); assert.ok(s[0].body.includes('отказ защиты API')); assert.ok(s[0].body.includes(a.id));
    assert.ok(s[0].next_at >= s[0].created_at + 60000, 'отправка не отложена — свёртке некуда лечь');
  });
  otpravit();
  const pachka = [1, 2, 3, 4, 5].map(i => pismo('поручение ' + i));
  for (const r of pachka) prervat(r, "You've hit your session limit · resets 5:50pm (Europe/Moscow)");
  proba('2 пачка из 5 по одной причине → ОДИН свёрнутый статус со всеми 5 id', () => {
    const s = statusy().filter(x => !x.sent_at); assert.equal(s.length, 1, 'статусов ' + s.length);
    for (const r of pachka) assert.ok(s[0].body.includes(r.id), 'нет ' + r.id);
  });
  proba('3 в статусе лимита — время сброса из текста ошибки', () => {
    const s = statusy().filter(x => !x.sent_at); assert.ok(s[0].body.includes('лимит сессии подписки')); assert.ok(s[0].body.includes('5:50pm'));
  });
  const drugoe = pismo('поручение 6'); prervat(drugoe, 'fetch failed');
  proba('4 другая причина в том же окне → отдельный статус', () => { assert.equal(statusy().filter(x => !x.sent_at).length, 2); });
  otpravit();
  const pered = statusy().length;
  const m1 = pismo('[ответ по receipt 1111; turn_completed]\n\nготово'); prervat(m1, 'quota');
  const m2 = pismo('[delivery-v1 id=ab reply=no]\n[агент zarya; ledger /x]\n[ответ по receipt 2222; no_result]\n\nx'); prervat(m2, 'quota');
  const m3 = pismo(PRERYV_METKA + '\nПисьмо не исполнено до конца'); prervat(m3, 'quota');
  const m4 = pismo('{"protocol":{"metadata":{"kind":"task-control/stop"}}}'); prervat(m4, 'quota');
  proba('5 машинные (ответ по receipt ×2, сам статус, task-control) → 0 статусов, audit «machine»', () => {
    assert.equal(statusy().length, pered);
    for (const r of [m1, m2, m3, m4]) assert.ok(l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='interrupt_status_skipped' AND detail='machine'").get(r.id), 'нет audit ' + r.id);
  });
  const zhdal = pismo('поручение с ответом', { expectsReply: true }); prervat(zhdal, 'quota');
  proba('6 отправитель ждал ответа → статуса нет, есть :result', () => {
    assert.equal(statusy().length, pered); assert.ok(l.db.prepare("SELECT 1 FROM outbox WHERE id=?").get(zhdal.id + ':result'));
  });
  const posle = pismo('поручение 7'); prervat(posle, "You've hit your session limit · resets 7pm");
  proba('7 после отправки статуса — новое окно: новый статус, а не дописка в ушедший', () => {
    const s = statusy().filter(x => !x.sent_at); assert.equal(s.length, 1); assert.ok(s[0].body.includes(posle.id)); assert.ok(!s[0].body.includes(pachka[0].id));
  });
  otpravit();
  const tg = pismo('владелец: сделай', { route: 'tg', routeKey: '158901453' }); prervat(tg, 'quota');
  const site = pismo('гость: вопрос', { route: 'site', routeKey: 'g1' }); prervat(site, 'quota');
  proba('8 tg → статус в copy-tg (туда же, где копия); site → 0 (audit route)', () => {
    const s = statusy().filter(x => !x.sent_at); assert.equal(s.length, 1); assert.equal(s[0].route, 'copy-tg'); assert.ok(s[0].body.includes(tg.id));
    assert.ok(l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='interrupt_status_skipped' AND detail='route site'").get(site.id));
  });
  l.close();
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`итог: ok=${ok} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
