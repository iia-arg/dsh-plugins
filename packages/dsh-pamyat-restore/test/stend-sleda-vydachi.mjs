/**
 * RU: Стенд следа выдачи проверяет счёт решений и сумму охвата podatWelcome. use/verify относятся только к реально поданному тексту; бюджетный отказ считается отдельно, ignore — по причине. След идёт в журнал, а не меняет текст модели.
 * EN: The delivery-trace test checks podatWelcome decision counts and coverage totals. use/verify refer only to actually delivered text; count budget omissions separately and ignore by cause. The trace belongs to the journal and does not change model text.
 */
let restore;
try { restore = await import('../src/index.js'); }
catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
let vsego = 0, proshlo = 0;
const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело вернуло значение'); proshlo++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 220)); } };
const CFG = { ignoreAfterMs: 7 * 86400000, useVeraThreshold: 0.7, ignoreVeraThreshold: 0.3, welcomeBudget: 4000 };
const sej = Date.now();
const rec = (id, extra = {}) => ({ id, vid: 'reshenie', avtor: 'stend', kogda: sej - 3600000, vera: null, soderzhim: 'СОДЕРЖИМОЕ-' + id,
  bezPodtverzhdeniya: false, podtverzhdenie: null, otnosheniya: null, doverie: null, ...extra });
const dv = (sostoyanie, stroka) => ({ sostoyanie, stroka, ssylki: [] });
const NABOR = [
  rec(1, { doverie: dv('podtverzhdena', 'подтверждена: владелец') }),        // RU: use с основанием именованного подтверждения.
  // EN: use based on named approval.
  rec(2, { vera: 1 }),                                                         // RU: use с достаточной числовой верой.
  // EN: use based on sufficient numeric trust.
  rec(3),                                                                      // RU: verify, поскольку вера не измерялась.
  // EN: verify because trust was not measured.
  rec(4, { vera: 0.45 }),                                                      // RU: verify при вере ниже порога use.
  // EN: verify for trust below the use threshold.
  rec(5, { doverie: dv('utochnena', 'уточнена #9') }),                        // RU: verify для уточнённого знания.
  // EN: verify for refined knowledge.
  rec(6, { vera: 0.1 }),                                                       // RU: ignore при вере ниже нижнего порога.
  // EN: ignore for trust below the lower threshold.
  rec(7, { kogda: sej - 8 * 86400000, vera: 1 }),                             // RU: ignore по возрасту старше 7 суток даже при helped.
  // EN: ignore for age above 7 days even with helped.
  rec(8, { doverie: dv('otmenena', 'отменена #10') }),                        // RU: Видимый ignore для отмены без передачи содержимого.
  // EN: Visible ignore for cancellation without delivering content.
  rec(9, { kogda: null }),                                                     // RU: verify при неизвестном времени записи.
  // EN: verify for an unknown record timestamp.
];
const o = restore.podatWelcome(NABOR, CFG);
const s = restore.strokaVydachi(o.schet);
console.log('   ' + s);
proba('счёт use поимённо: #1 chelovek, #2 vera', () => { const u = o.schet.use.map((x) => x.id + ':' + x.prichina).join(','); if (u !== '1:chelovek,2:vera') throw new Error(u); });
proba('verify по причинам: vera-ne-merilas 1, vera-nizhe-use 1, utochnena 1, vremya-neizvestno 1', () => {
  const v = o.schet.verify; if (v['vera-ne-merilas'] !== 1 || v['vera-nizhe-use'] !== 1 || v.utochnena !== 1 || v['vremya-neizvestno'] !== 1) throw new Error(JSON.stringify(v)); });
proba('ignore по причинам: vera-nizhe-ignore 1, starshe-sroka 1, otmenena 1', () => {
  const i = o.schet.ignore; if (i['vera-nizhe-ignore'] !== 1 || i['starshe-sroka'] !== 1 || i.otmenena !== 1) throw new Error(JSON.stringify(i)); });
proba('строка: «отобрано 9 · use 2 [#1 chelovek, #2 vera] · verify 4 … · ignore 3 … · не влезло 0 — сходится»', () => {
  if (!s.startsWith('выдача: отобрано 9 · use 2 [#1 chelovek, #2 vera] · verify 4 (') || !/ignore 3 \(/.test(s) || !s.endsWith('не влезло в бюджет 0 — сходится')) throw new Error(s); });
proba('П9-граница: #7 helped (vera 1), но 8 сут — ignore «старше 7 сут», в use НЕ попал', () => { if (o.schet.use.some((x) => x.id === 7)) throw new Error('#7 в use'); });
proba('след в текст модели НЕ идёт: в брифинге нет «выдача:»', () => { if (/выдача:/.test(o.tekst)) throw new Error('утекло в текст'); });
// RU: После заполнения бюджета остальные идут в neVlezlo, не use/verify.
// EN: After the budget fills, count later records as neVlezlo rather than use/verify.
const m = restore.podatWelcome([rec(11, { vera: 1, soderzhim: 'x'.repeat(300) }), rec(12, { vera: 1, soderzhim: 'y'.repeat(300) }), rec(13, { soderzhim: 'z'.repeat(300) })], { ...CFG, welcomeBudget: 400 });
const sm = restore.strokaVydachi(m.schet); console.log('   ' + sm);
proba('бюджет: подана 1, не влезло 2; use только #11 (#12 решён use, но модель его НЕ видела)', () => {
  if (m.podany.length !== 1 || m.schet.neVlezlo !== 2 || m.schet.use.map((x) => x.id).join() !== '11') throw new Error(sm); });
proba('бюджет: сумма сходится (1 + 0 + 0 + 2 = 3)', () => { if (!sm.endsWith('— сходится')) throw new Error(sm); });
proba('пустой набор: «отобрано 0 · use 0 · verify 0 · ignore 0 · не влезло 0 — сходится»', () => {
  const p = restore.strokaVydachi(restore.podatWelcome([], CFG).schet); if (p !== 'выдача: отобрано 0 · use 0 · verify 0 · ignore 0 · не влезло в бюджет 0 — сходится') throw new Error(p); });
proba('НЕ СХОДИТСЯ названо: подставной счёт с потерянной записью', () => {
  const p = restore.strokaVydachi({ vsego: 3, use: [{ id: 1, prichina: 'vera' }], verify: {}, ignore: {}, neVlezlo: 1 }); if (!/🔴 НЕ СХОДИТСЯ: разнесено 2 из 3/.test(p)) throw new Error(p); });
proba('счёта нет — строка «счёта нет», не исключение', () => { if (restore.strokaVydachi(undefined) !== 'выдача: счёта нет') throw new Error('?'); });
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
