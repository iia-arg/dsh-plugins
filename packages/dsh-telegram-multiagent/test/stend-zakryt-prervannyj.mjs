// RU: Стенд stend-zakryt-prervannyj.mjs (B-N-1814): операторское закрытие удержания channel_interrupted — приём оборван перезапуском
//     службы до выдачи агенту. Запись доводится до удержания НАСТОЯЩИМ запросом receiptTick из ../src/index.js; закрывает НАСТОЯЩИЙ
//     receipt-admin. Коды: 0 — все пробы; 1 — красные; 2 — слепота (нет запроса в index.js). Живую доставку не проверяет.
// EN: Harness for B-N-1814: operator discard of a channel_interrupted hold (intake cut by a service restart before dispatch).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MessageReceipts } from '../src/message-receipts.js';

const index = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const m = /receipts\.db\.prepare\("(UPDATE receipts SET blocked='channel_interrupted'[^"]*)"\)\.run\(receipts\.owner\)/.exec(index);
if (!m) { console.log('СЛЕПОТА: запрос channel_interrupted в index.js не найден'); process.exit(2); }
const ADMIN = new URL('../src/receipt-admin.mjs', import.meta.url).pathname;
const admin = (...a) => { try { return { kod: 0, out: execFileSync(process.execPath, [ADMIN, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { kod: e.status, out: String(e.stderr ?? '') + String(e.stdout ?? '') }; } };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b1814-')); const ledger = path.join(root, 'ledger');
let T = Date.UTC(2026, 9, 7, 23, 3, 49);
const otkryt = owner => { const l = new MessageReceipts(ledger, { owner, now: () => T }); return l; };
// Приём начат старым процессом службы (beginChannel), процесс убит до prepare; новый процесс помечает запись своим receiptTick.
function zavesti(kluch, pravka = '') {
  const l = otkryt('pid:1:staryj'); const r = l.receive('tg:' + kluch, Buffer.from('{"voice":1}'), { route: 'tg', routeKey: '1', logicalKey: 'tg:' + kluch });
  assert.equal(l.beginChannel(r.id), true, 'beginChannel не взял запись');
  if (pravka) l.db.prepare(`UPDATE receipts SET ${pravka} WHERE id=?`).run(r.id);
  l.close(); const n = otkryt('pid:2:novyj'); n.db.prepare(m[1]).run(n.owner); n.close(); return r.id;
}
const zapis = id => { const l = otkryt('pid:3:chtenie'); try { return l.get(id); } finally { l.close(); } };
let ok = 0, krasnyh = 0;
const proba = (imya, fn) => { try { fn(); ok++; console.log('  ok   ' + imya); } catch (e) { krasnyh++; console.log('  FAIL ' + imya + ': ' + String(e.message).split('\n')[0]); } };
try {
  const id = zavesti('golos');
  const r0 = zapis(id);
  proba('П1 исходно: channel_interrupted, dispatch_started=0, не выдано в сессию, без исхода', () => {
    assert.equal(r0.blocked, 'channel_interrupted'); assert.equal(r0.dispatch_started, 0); assert.equal(r0.session_id, null); assert.equal(r0.finished_at, null); });
  { const l = otkryt('pid:2:novyj'); T += 3 * 3600000; l.holdTick(); const t = l.db.prepare("SELECT body FROM outbox WHERE id LIKE ? AND id LIKE '%:held:%'").all(id + '%').map(x => x.body).join('\n'); l.close();
    proba('П7 напоминание «УДЕРЖАНО» называет путь: discard через receipt-admin', () => assert.match(t, /channel_interrupted.*discard через receipt-admin/s, t.slice(0, 200))); }
  const ot = admin('discard', ledger, id, 'Забава', 'B-N-1814 проба');
  proba('П2 receipt-admin discard ROOT ID ОПЕРАТОР ССЫЛКА — код 0', () => assert.equal(ot.kod, 0, ot.out.split('\n')[0]));
  proba('П3 запись закрыта: operator_discarded, исход и аудит с оператором и ссылкой, ответ владельцу один — «пришлите ещё раз»', () => {
    const r = zapis(id); assert.equal(r.outcome, 'operator_discarded'); assert.notEqual(r.finished_at, null); assert.equal(r.blocked, null);
    const l = otkryt('pid:3:chtenie'); try {
      const a = l.db.prepare("SELECT detail FROM audit WHERE receipt_id=? AND kind='operator_discard'").all(id); assert.equal(a.length, 1); assert.match(a[0].detail, /Забава.*B-N-1814 проба/);
      const otv = l.db.prepare("SELECT body FROM outbox WHERE id=?").all(id + ':result'); assert.equal(otv.length, 1);
      assert.match(otv[0].body, /Сообщение не было принято из-за перезапуска агента — пришлите, пожалуйста, ещё раз/);
    } finally { l.close(); } });
  proba('П4 повторной выдачи нет: не в pending, второй discard — отказ, через сутки «УДЕРЖАНО» не растёт', () => {
    const l = otkryt('pid:2:novyj'); try {
      assert(!l.pending().some(x => x.id === id), 'запись в pending');
      const do_ = l.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE ?").get(id + ':held:%').n; T += 25 * 3600000; l.holdTick();
      assert.equal(l.db.prepare("SELECT count(*) n FROM outbox WHERE id LIKE ?").get(id + ':held:%').n, do_, 'новое УДЕРЖАНО после закрытия');
    } finally { l.close(); }
    assert.equal(admin('discard', ledger, id, 'Забава', 'повтор').kod, 2); });
  const idD = zavesti('vydano', 'dispatch_started=1'), idS = zavesti('sessiya', "session_id='s1'");
  proba('П5 запись, выданная агенту (dispatch_started=1) или уже в сессии, — отказ, запись не тронута', () => {
    for (const x of [idD, idS]) { const o = admin('discard', ledger, x, 'Забава', 'B-N-1814'); assert.equal(o.kod, 2, x + ': ' + o.out.slice(0, 80));
      const r = zapis(x); assert.equal(r.blocked, 'channel_interrupted'); assert.equal(r.finished_at, null); } });
  const idA = zavesti('approve');
  proba('П6 approve-new для channel_interrupted — отказ (повторной выдачи нет); без оператора — отказ', () => {
    assert.equal(admin('approve-new', ledger, idA, 'Забава', 'B-N-1814').kod, 2); assert.equal(zapis(idA).blocked, 'channel_interrupted');
    assert.equal(admin('discard', ledger, idA, 'Забава').kod, 2); assert.equal(zapis(idA).finished_at, null); });
  const idU = zavesti('bityj', "blocked='invalid_utf8'");
  proba('П8 прочие discard (invalid_utf8) — прежний текст «Отменено оператором, не исполнялось.»', () => {
    assert.equal(admin('discard', ledger, idU, 'Забава', 'B-N-1814').kod, 0);
    const l = otkryt('pid:3:chtenie'); try { const b = l.db.prepare("SELECT body FROM outbox WHERE id=?").get(idU + ':result').body;
      assert.match(b, /Отменено оператором, не исполнялось\./); assert.doesNotMatch(b, /перезапуска агента/); } finally { l.close(); } });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`итог: ${ok} из ${ok + krasnyh}`); process.exit(krasnyh ? 1 : 0);
