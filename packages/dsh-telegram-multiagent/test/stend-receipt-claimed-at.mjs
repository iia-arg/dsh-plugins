// RU: Изолированный стенд stend-receipt-claimed-at.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness stend-receipt-claimed-at.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MessageReceipts, migrateClaimedAt } from '../src/message-receipts.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claimed-at-'));
const opened = [];
const ledger = (home, opts) => { const l = new MessageReceipts(home, opts); opened.push(l); return l; };
const col = db => !!db.prepare("SELECT 1 FROM pragma_table_info('receipts') WHERE name='claimed_at'").get();


async function vzyatie(home, takenTime) {
  let clock = 1000;
  const l = ledger(home, { now: () => clock, owner: 'first' });
  const session = { id: 'probe', header: { createdAt: 42 }, events: [] };
  const append = (type, data, time) => session.events.push({ type, data, time, seq: session.events.length });
  const source = path.join(home + '-letter'); fs.writeFileSync(source, 'probe');
  const r = l.receive('file', 'probe', { logicalKey: 'probe', sourcePath: source });
  const msg = { id: 'msg', role: 'user', content: [] }; l.prepare(r.id, () => msg, session, 'a2a');
  clock = 1100;
  await l.queue(r.id, { contains: () => session.events.length > 0,
    send: async m => append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 0, inserted: [m] }, 1100),
    flush: async () => true });
  clock = 1110; l.release(r.id, 'file');
  append('turn/start', { turn: 7 }, 1200);
  append('agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] }, takenTime);
  clock = 2000; l.reconcile(session, null);
  return { l, id: r.id };
}

try {

  const A = path.join(root, 'a');
  const { l: la, id } = await vzyatie(A, 1250);
  const row = la.get(id);
  assert.equal(row.claimed_turn, 7);
  assert.equal(row.claimed_at, 1250, 'claimed_at = время события взятия, не момент сверки');
  assert.equal(row.received_at, 1000);
  const aud = la.db.prepare("SELECT at,detail FROM audit WHERE receipt_id=? AND kind='claimed'").all(id);
  assert.equal(aud.length, 1, 'ровно одна строка audit «взято»');
  assert.deepEqual(JSON.parse(aud[0].detail), { turn: 7, taken_at: 1250, recovered: false });
  la.reconcile({ id: 'probe', header: { createdAt: 42 }, events: [] }, null);
  assert.equal(la.db.prepare("SELECT count(*) AS n FROM audit WHERE receipt_id=? AND kind='claimed'").get(id).n, 1, 'повторная сверка второго «взято» не пишет');
  assert.equal(la.status().find(s => s.id === id).claimed_at, 1250, 'status() отдаёт claimed_at');


  const B = path.join(root, 'b');
  const { l: lb, id: idb } = await vzyatie(B, undefined);
  const rb = lb.db.prepare('SELECT claimed_turn, claimed_at, typeof(claimed_at) AS t FROM receipts WHERE id=?').get(idb);
  assert.equal(rb.claimed_turn, 7); assert.equal(rb.t, 'null', 'нет времени у события — NULL, не 0');
  assert.equal(JSON.parse(lb.db.prepare("SELECT detail FROM audit WHERE receipt_id=? AND kind='claimed'").get(idb).detail).taken_at, null);


  la.db.close(); opened.splice(opened.indexOf(la), 1);
  const file = path.join(A, 'receipts.sqlite');
  let db = new DatabaseSync(file);
  db.exec("ALTER TABLE receipts DROP COLUMN claimed_at; DELETE FROM audit WHERE kind='claimed';");
  const do_ = { rows: db.prepare('SELECT count(*) AS n FROM receipts').get().n, audit: db.prepare('SELECT count(*) AS n FROM audit').get().n,
    uv: db.prepare('PRAGMA user_version').get().user_version, col: col(db) };
  db.close();
  assert.equal(do_.col, false, 'подстава «база 1.5.37» внесена: столбца нет');

  const adm = ledger(A, { migrate: false });
  assert.equal(col(adm.db), false, 'админка столбец не добавила');
  assert.equal(adm.status().find(s => s.id === id).claimed_at, null, 'status() без столбца отдаёт NULL');
  adm.db.close(); opened.splice(opened.indexOf(adm), 1);

  const lm = ledger(A, { now: () => 3000, owner: 'restarted' });
  const posle = { rows: lm.db.prepare('SELECT count(*) AS n FROM receipts').get().n, uv: lm.db.prepare('PRAGMA user_version').get().user_version };
  assert.equal(col(lm.db), true, 'столбец добавлен');
  assert.equal(posle.rows, do_.rows, 'строк receipts столько же'); assert.equal(posle.uv, do_.uv, 'user_version не менялся');
  const star = lm.db.prepare('SELECT claimed_turn, typeof(claimed_at) AS t FROM receipts WHERE id=?').get(id);
  assert.equal(star.claimed_turn, 7); assert.equal(star.t, 'null', 'старое взятие: NULL = «не записано», не 0');
  assert.equal(lm.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

  assert.equal(migrateClaimedAt(lm.db), false, 'повторная миграция — пустая');
  lm.db.close(); opened.splice(opened.indexOf(lm), 1);
  db = new DatabaseSync(file);
  assert.equal(db.prepare("SELECT count(*) AS n FROM pragma_table_info('receipts') WHERE name='claimed_at'").get().n, 1, 'столбец ровно один');
  db.close();

  console.log(`PASS claimed_at=событие(1250, сверка 2000); audit claimed 1 (повтор 0); без времени NULL; миграция: строк ${do_.rows}→${posle.rows}, user_version ${do_.uv}→${posle.uv}, старое NULL; админка схему не трогает; повтор пустой`);
} finally {
  for (const l of opened) { try { l.db.close(); } catch {} }
  fs.rmSync(root, { recursive: true, force: true });
}
