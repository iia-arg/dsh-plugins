// RU: Стенд stend-zakryt-neizvestnyj.mjs (A-N-1948 №2, находка №1): операторское закрытие удержаний channel_unknown/dispatch_unknown
//     до выдачи агенту. Запись доводится до удержания НАСТОЯЩИМ запросом из ../src/index.js (catch обработчика обновления);
//     закрывает НАСТОЯЩИЙ receipt-admin. Коды: 0 — все пробы; 1 — красные; 2 — слепота (нет запроса в index.js). Живую доставку не проверяет.
// EN: Harness for A-N-1948 №2 finding 1: operator discard of channel_unknown/dispatch_unknown holds before dispatch.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MessageReceipts } from '../src/message-receipts.js';

const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const m = /receipts\.db\.prepare\("(UPDATE receipts SET blocked='channel_unknown' WHERE id=\?)"\)\.run\(receipt\.id\)/.exec(index);
if (!m) { console.log('СЛЕПОТА: запрос channel_unknown в index.js не найден'); process.exit(2); }
const ADMIN = new URL('../src/receipt-admin.mjs', import.meta.url).pathname;
const admin = (...a) => { try { return { kod: 0, out: execFileSync(process.execPath, [ADMIN, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { kod: e.status, out: String(e.stderr ?? '') + String(e.stdout ?? '') }; } };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1948-02-n1-')); const ledger = path.join(root, 'ledger');
let T = Date.UTC(2026, 9, 10, 5, 10, 0);
const otkryt = () => new MessageReceipts(ledger, { owner: 'pid:1:stend', now: () => T });
// Обработчик обновления бросил после beginChannel (403 «bot was blocked», нет guestPreset…) — catch ставит channel_unknown.
function zavesti(kluch, pravka = '') {
  const l = otkryt(); const r = l.receive('tg:' + kluch, Buffer.from('{"text":"x"}'), { route: 'tg', routeKey: '1', logicalKey: 'tg:' + kluch });
  assert.equal(l.beginChannel(r.id), true, 'beginChannel не взял запись');
  l.db.prepare(m[1]).run(r.id);
  if (pravka) l.db.prepare(`UPDATE receipts SET ${pravka} WHERE id=?`).run(r.id);
  l.close(); return r.id;
}
const zapis = id => { const l = otkryt(); try { return l.get(id); } finally { l.close(); } };
let ok = 0, krasnyh = 0;
const proba = (imya, fn) => { try { const r = fn(); if (r !== undefined && r !== true) throw Error(typeof r === 'string' ? r : 'тело пробы вернуло ' + JSON.stringify(r)); ok++; console.log('  ok   ' + imya); } catch (e) { krasnyh++; console.log('  FAIL ' + imya + ': ' + String(e.message).split('\n')[0]); } };
try {
  const id = zavesti('blok');
  proba('П1 исходно: channel_unknown, dispatch_started=0, без сессии, без исхода', () => {
    const r = zapis(id); assert.equal(r.blocked, 'channel_unknown'); assert.equal(r.dispatch_started, 0); assert.equal(r.session_id, null); assert.equal(r.finished_at, null); });
  { const l = otkryt(); T += 3 * 3600000; l.holdTick(); const t = l.db.prepare("SELECT body FROM outbox WHERE id LIKE ? AND id LIKE '%:held:%'").all(id + '%').map(x => x.body).join('\n'); l.close();
    proba('П2 напоминание «УДЕРЖАНО» называет путь: discard через receipt-admin', () => assert.match(t, /channel_unknown.*discard через receipt-admin/s, t.slice(0, 200))); }
  const ot = admin('discard', ledger, id, 'Забава', 'A-N-1948 №2 проба');
  proba('П3 receipt-admin discard channel_unknown до выдачи — код 0', () => assert.equal(ot.kod, 0, ot.out.split('\n')[0]));
  proba('П4 запись закрыта: operator_discarded, аудит с оператором и ссылкой; второй discard — отказ; «УДЕРЖАНО» не растёт', () => {
    const r = zapis(id); assert.equal(r.outcome, 'operator_discarded'); assert.notEqual(r.finished_at, null); assert.equal(r.blocked, null);
    const l = otkryt(); try {
      const a = l.db.prepare("SELECT detail FROM audit WHERE receipt_id=? AND kind='operator_discard'").all(id); assert.equal(a.length, 1); assert.match(a[0].detail, /Забава.*A-N-1948 №2 проба/);
      const do_ = l.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE ?").get(id + ':held:%').n; T += 25 * 3600000; l.holdTick();
      assert.equal(l.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE ?").get(id + ':held:%').n, do_, 'новое УДЕРЖАНО после закрытия');
    } finally { l.close(); }
    assert.equal(admin('discard', ledger, id, 'Забава', 'повтор').kod, 2); });
  const idD = zavesti('dispatch', "blocked='dispatch_unknown'");
  proba('П5 dispatch_unknown до выдачи (dispatch_started=0) — discard код 0', () => {
    const o = admin('discard', ledger, idD, 'Забава', 'A-N-1948 №2'); assert.equal(o.kod, 0, o.out.split('\n')[0]); assert.equal(zapis(idD).outcome, 'operator_discarded'); });
  const idV = zavesti('vydano', "blocked='dispatch_unknown', dispatch_started=1"), idS = zavesti('sessiya', "session_id='s1'");
  proba('П6 выданное агенту (dispatch_started=1) или уже в сессии — отказ, запись не тронута', () => {
    for (const x of [idV, idS]) { const o = admin('discard', ledger, x, 'Забава', 'A-N-1948 №2'); assert.equal(o.kod, 2, x + ': ' + o.out.slice(0, 80));
      assert.equal(zapis(x).finished_at, null); assert.notEqual(zapis(x).blocked, null); } });
  const idA = zavesti('approve');
  proba('П7 approve-new для channel_unknown — отказ (повторной выдачи нет); без ссылки — отказ', () => {
    assert.equal(admin('approve-new', ledger, idA, 'Забава', 'A-N-1948 №2').kod, 2); assert.equal(zapis(idA).blocked, 'channel_unknown');
    assert.equal(admin('discard', ledger, idA, 'Забава').kod, 2); assert.equal(zapis(idA).finished_at, null); });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`итог: ${ok} из ${ok + krasnyh}`); process.exit(krasnyh ? 1 : 0);
