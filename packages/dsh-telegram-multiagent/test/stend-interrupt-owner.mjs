// RU: B-N-1619 остаток: красная строка владельцу об оборванном ходе. Настоящий MessageReceipts и completeRow во временном каталоге;
//     модуль — STEND_MR (по умолчанию ../src/message-receipts.js; порча — копия модуля). Пробы: оборванный ход → одна строка
//     «🔴 ход оборван» в copy-tg; пачка одной причины (разные маршруты и отправители) → одна свёрнутая; другая причина → отдельная;
//     после отправки — новое окно; машинные письма → 0; обычный ход и no_result → 0; ждал ответа, tg, site — строка есть; «прочее» —
//     без сырого текста ошибки; статус отправителю 2.5.83 не тронут; r2: лавина 30 обрывов → потолок 20 id и «… и ещё N». Доставку (пропуск в режиме без копий) стенд не видит — она в index.js.
// EN: B-N-1619 remainder harness for the red owner line on the real ledger; module from STEND_MR.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mod = process.env.STEND_MR ? pathToFileURL(path.resolve(process.env.STEND_MR)).href : new URL('../src/message-receipts.js', import.meta.url).href;
const { MessageReceipts, PRERYV_METKA, OBORVAN_METKA } = await import(mod);
if (typeof OBORVAN_METKA !== 'string') { console.log('СЛЕПОТА: модуль без OBORVAN_METKA — красная строка владельцу не заведена'); process.exit(2); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-interrupt-owner-'));
let ok = 0, fail = 0;
const proba = (imya, f) => { try { f(); ok++; console.log('  ✅ ' + imya); } catch (e) { fail++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).split('\n')[0].slice(0, 200)); } };
try {
  const l = new MessageReceipts(root);
  let n = 0;
  const pismo = (tekst, o = {}) => l.receive('k' + (++n), tekst, { logicalKey: 'k' + n, expectsReply: false, ...o });
  const end = (msg, kind = 'error') => ({ reason: { kind, error: { message: msg } } });
  const zavershit = (r, outcome, msg, kind) => l.tx(() => l.completeRow(l.get(r.id), outcome, { end: end(msg, kind), outputs: [] }, 'x'));
  const prervat = (r, msg, kind) => zavershit(r, 'interrupted_unknown', msg, kind);
  const stroki = () => l.db.prepare("SELECT * FROM outbox WHERE id LIKE 'interrupt-owner:%' ORDER BY created_at,id").all();
  const otkrytye = () => stroki().filter(x => !x.sent_at);
  const otpravit = () => l.db.prepare("UPDATE outbox SET sent_at=?,attempts=1 WHERE id LIKE 'interrupt-owner:%' AND sent_at IS NULL").run(l.now());

  console.log('стенд красной строки владельцу (B-N-1619 остаток): модуль ' + mod.replace('file://', ''));
  const a = pismo('Забава → Заре · сделай метку', { sender: 'zabava' });
  prervat(a, 'API Error: safeguards flagged this session');
  proba('1 оборванный ход → одна строка в copy-tg: «🔴 ход оборван», класс, id, «повтора нет»; отправка отложена под свёртку', () => {
    const s = stroki(); assert.equal(s.length, 1); assert.equal(s[0].route, 'copy-tg');
    assert.ok(s[0].body.startsWith(OBORVAN_METKA + ': отказ защиты API'), s[0].body.slice(0, 80)); assert.ok(s[0].body.includes(a.id));
    assert.ok(s[0].body.includes('повтора нет')); assert.ok(s[0].next_at >= s[0].created_at + 60000);
  });
  otpravit();
  const pachka = [pismo('п1', { sender: 'zabava' }), pismo('п2', { sender: 'iskra' }), pismo('п3', { route: 'tg', routeKey: '1' }), pismo('п4', { route: 'site', routeKey: 'g1' }), pismo('п5', { sender: 'zabava' })];
  for (const r of pachka) prervat(r, "You've hit your session limit · resets 5:50pm (Europe/Moscow)");
  proba('2 пачка из 5 одной причины (разные маршруты и отправители) → ОДНА строка со всеми 5 id и сбросом', () => {
    const s = otkrytye(); assert.equal(s.length, 1, 'строк ' + s.length);
    for (const r of pachka) assert.ok(s[0].body.includes(r.id), 'нет ' + r.id); assert.ok(s[0].body.includes('сброс: 5:50pm'));
  });
  const drugoe = pismo('п6'); prervat(drugoe, 'fetch failed');
  proba('3 другая причина в том же окне → отдельная строка', () => { assert.equal(otkrytye().length, 2); });
  otpravit();
  const posle = pismo('п7'); prervat(posle, "You've hit your session limit · resets 7pm");
  proba('4 после отправки — новое окно: новая строка, а не дописка в ушедшую', () => {
    const s = otkrytye(); assert.equal(s.length, 1); assert.ok(s[0].body.includes(posle.id)); assert.ok(!s[0].body.includes(pachka[0].id));
  });
  otpravit();
  const pered = stroki().length;
  const m1 = pismo('[ответ по receipt 1111; turn_completed]\n\nготово'); prervat(m1, 'quota');
  const m2 = pismo(PRERYV_METKA + '\nПисьмо не исполнено до конца'); prervat(m2, 'quota');
  const m3 = pismo('{"protocol":{"metadata":{"kind":"mail-stop/status"}}}'); prervat(m3, 'quota');
  proba('5 машинные письма (квитанция, статус прерывания, стоп-статус) → 0 строк, audit «machine»', () => {
    assert.equal(stroki().length, pered);
    for (const r of [m1, m2, m3]) assert.ok(l.db.prepare("SELECT 1 FROM audit WHERE receipt_id=? AND kind='interrupt_owner_skipped' AND detail='machine'").get(r.id), 'нет audit ' + r.id);
  });
  const g1 = pismo('обычное'); zavershit(g1, 'turn_completed', '');
  const g2 = pismo('пустое'); zavershit(g2, 'no_result', '');
  proba('6 обычный ход и no_result → 0 строк', () => { assert.equal(stroki().length, pered); });
  const zhdal = pismo('поручение с ответом', { expectsReply: true }); prervat(zhdal, 'quota exceeded at capacity');
  proba('7 отправитель ждал ответа и ход оборван → строка ЕСТЬ (обрыв — событие хода), :result тоже есть', () => {
    const s = otkrytye(); assert.equal(s.length, 1); assert.ok(s[0].body.includes(zhdal.id)); assert.ok(l.db.prepare('SELECT 1 FROM outbox WHERE id=?').get(zhdal.id + ':result'));
  });
  otpravit();
  const syroj = 'внутренний сбой: token=sk-ant-' + 'x'.repeat(40) + ' путь /opt/секрет ' + 'хвост '.repeat(40);
  const p9 = pismo('п9'); prervat(p9, syroj, 'error');
  proba('8 «прочее» с длинной сырой ошибкой → в строке только вид, без сырого текста', () => {
    const s = otkrytye(); assert.equal(s.length, 1); assert.ok(s[0].body.startsWith(OBORVAN_METKA + ': прочее (error)'), s[0].body.slice(0, 60));
    assert.ok(!s[0].body.includes('sk-ant') && !s[0].body.includes('/opt/секрет'), 'сырой текст в строке'); assert.ok(s[0].body.length < 200, 'длина ' + s[0].body.length);
  });
  proba('9 статус отправителю 2.5.83 не тронут: на a2a-обрыв без ожидания ответа — свой interrupt-status', () => {
    assert.ok(l.db.prepare("SELECT 1 FROM outbox WHERE id LIKE 'interrupt-status:a2a:%' AND body LIKE ?").get('%' + a.id + '%'));
  });
  otpravit();
  const lavina = Array.from({ length: 30 }, (_, i) => pismo('лавина ' + i, { sender: 'отправитель-с-длинным-именем-ровно-сорок-' + i }));
  for (const r of lavina) prervat(r, 'fetch failed');
  proba('10 лавина 30 обрывов одной причины в окне → одна строка: первые 20 id, «… и ещё 10», тело < 4000 знаков; audit на все 30', () => {
    const s = otkrytye(); assert.equal(s.length, 1, 'строк ' + s.length); const b = s[0].body;
    for (const r of lavina.slice(0, 20)) assert.ok(b.includes(r.id), 'нет ' + r.id);
    for (const r of lavina.slice(20)) assert.ok(!b.includes(r.id), 'лишний ' + r.id);
    assert.ok(b.endsWith('\n… и ещё 10 (все id — в журнале квитанций)'), 'хвост: ' + b.slice(-60));
    assert.ok(b.length < 4000, 'длина ' + b.length); console.log('     длина строки ' + b.length + ' знаков');
    const au = l.db.prepare("SELECT count(*) c FROM audit WHERE kind IN ('interrupt_owner_queued','interrupt_owner_folded') AND receipt_id IN (" + lavina.map(() => '?').join(',') + ')').get(...lavina.map(r => r.id)).c;
    assert.equal(au, 30, 'audit ' + au);
  });
  l.close();
  // B-N-1619 (2.5.97, Искра): имя агента, число неисполненных, «переподать», чистый «сброс»; отдельный журнал.
  const l2 = new MessageReceipts(path.join(root, 'r97'), { agentName: 'заря' });
  const l3 = new MessageReceipts(path.join(root, 'r97bez'));
  let n2 = 0; const p2 = (lx, o = {}) => lx.receive('z' + (++n2), 'поручение ' + n2, { logicalKey: 'z' + n2, expectsReply: false, sender: 'zabava', ...o });
  const prerv2 = (lx, r, msg) => lx.tx(() => lx.completeRow(lx.get(r.id), 'interrupted_unknown', { end: end(msg) , outputs: [] }, 'x'));
  const str2 = lx => lx.db.prepare("SELECT * FROM outbox WHERE id LIKE 'interrupt-owner:%' AND sent_at IS NULL ORDER BY created_at,id").all();
  const LIMIT = "You've hit your session limit · resets 1:50pm (UTC) (лимит ходов исключён: записи max_turns_reached 3)";
  const o1 = p2(l2); prerv2(l2, o1, LIMIT);
  proba('11 имя агента в первой строке («; агент: заря»), без имени в настройке — части «агент:» нет', () => {
    const s = str2(l2); assert.equal(s.length, 1); assert.ok(s[0].body.split('\n')[0].endsWith('; агент: заря'), s[0].body.split('\n')[0]);
    const o0 = p2(l3); prerv2(l3, o0, LIMIT); assert.ok(!str2(l3)[0].body.includes('агент:'), str2(l3)[0].body.split('\n')[0]);
  });
  proba('12 «сброс» без приписки шлюза: «сброс: 1:50pm (UTC)», «лимит ходов исключён» в строке нет', () => {
    const b = str2(l2)[0].body; assert.ok(b.includes('; сброс: 1:50pm (UTC); агент:'), b.split('\n')[0]); assert.ok(!b.includes('лимит ходов исключён'), b);
  });
  proba('13 число и «переподать»: «Не исполнено писем: 1 — повтора нет; переподать, если поручение в силе:»', () => {
    assert.equal(str2(l2)[0].body.split('\n')[1], 'Не исполнено писем: 1 — повтора нет; переподать, если поручение в силе:');
  });
  for (let i = 0; i < 4; i++) prerv2(l2, p2(l2), LIMIT);
  proba('14 свёртка 5 → «Не исполнено писем: 5», перечень 5 id', () => {
    const b = str2(l2)[0].body; assert.ok(b.includes('\nНе исполнено писем: 5 —'), b.split('\n')[1]); assert.equal(b.split('\n').filter(x => x.startsWith('- ')).length, 5);
  });
  for (let i = 0; i < 25; i++) prerv2(l2, p2(l2), LIMIT);
  proba('15 лавина до 30 → «Не исполнено писем: 30», id 20, «… и ещё 10»', () => {
    const b = str2(l2)[0].body; assert.ok(b.includes('\nНе исполнено писем: 30 —'), b.split('\n')[1]);
    assert.equal(b.split('\n').filter(x => x.startsWith('- ')).length, 20); assert.ok(b.endsWith('\n… и ещё 10 (все id — в журнале квитанций)'), b.slice(-60));
  });
  l2.db.prepare("UPDATE outbox SET sent_at=?,attempts=1 WHERE id LIKE 'interrupt-owner:%'").run(l2.now());
  l2.db.prepare("INSERT INTO outbox(id,receipt_id,route,body,created_at,next_at) VALUES(?,?,?,?,?,?)").run('interrupt-owner:limit-sessii:1', 'staroe', 'copy-tg', OBORVAN_METKA + ': лимит сессии подписки\nПисьма не исполнены (повтора нет):\n- staroe (a2a)', l2.now(), l2.now() + 120000);
  prerv2(l2, p2(l2), LIMIT);
  proba('16 открытая строка старого вида (до 2.5.97) при свёртке не ломается: id дописан, числа не появилось', () => {
    const b = l2.db.prepare("SELECT body FROM outbox WHERE id='interrupt-owner:limit-sessii:1'").get().body;
    assert.equal(b.split('\n').filter(x => x.startsWith('- ')).length, 2); assert.ok(!b.includes('Не исполнено писем'), b);
  });
  // Сведение 93→96→97 (условие Вениамина): свёртка под ключом с суффиксом режима копий 2.5.93 вместе со счётом 2.5.97.
  let rezhim = 'owner-all';
  const l4 = new MessageReceipts(path.join(root, 'r97mode'), { agentName: 'заря', ownerCopyMode: () => rezhim });
  prerv2(l4, p2(l4), LIMIT); prerv2(l4, p2(l4), LIMIT);
  proba('17 режим owner-all: 2 обрыва одной причины → одна строка под ключом «interrupt-owner:limit-sessii:owner-all:», «Не исполнено писем: 2», 2 id, owner_copy_mode=owner-all', () => {
    const s = str2(l4); assert.equal(s.length, 1, 'строк ' + s.length); assert.ok(s[0].id.startsWith('interrupt-owner:limit-sessii:owner-all:'), s[0].id);
    assert.ok(s[0].body.includes('\nНе исполнено писем: 2 —'), s[0].body.split('\n')[1]); assert.equal(s[0].body.split('\n').filter(x => x.startsWith('- ')).length, 2);
    assert.equal(s[0].owner_copy_mode, 'owner-all');
  });
  rezhim = 'personal'; prerv2(l4, p2(l4), LIMIT);
  proba('18 смена режима на personal в том же окне → отдельная строка под своим суффиксом, в строку owner-all не дописано', () => {
    const s = str2(l4); assert.equal(s.length, 2, 'строк ' + s.length);
    const own = s.find(x => x.id.startsWith('interrupt-owner:limit-sessii:owner-all:')), per = s.find(x => x.id.startsWith('interrupt-owner:limit-sessii:personal:'));
    assert.ok(own && per, s.map(x => x.id).join(' ')); assert.ok(own.body.includes('\nНе исполнено писем: 2 —')); assert.ok(per.body.includes('\nНе исполнено писем: 1 —'));
  });
  l2.close(); l3.close(); l4.close();
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`итог: ok=${ok} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
