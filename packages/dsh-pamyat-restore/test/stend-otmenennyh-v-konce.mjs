/**
 * RU: Стенд проверяет, что отмены не вытесняют знания: видимые строки идут в конце вне welcomeBudget, первые 3 поимённо, остальные сводкой. Проверяет чистый podatWelcome без временных файлов. Дата записи сверяется независимым UTC-сдвигом +3 часа, не тем же Intl Europe/Moscow. Коды 0 — совпало, 1 — расхождение, 2 — предмет не загрузился.
 * EN: Test that cancellations do not displace knowledge: visible lines go last outside welcomeBudget, the first 3 by name and the remainder summarized. Exercise pure podatWelcome with no temporary files. Check the record date through an independent UTC +3-hour offset, not the same Intl Europe/Moscow method. Exit codes: 0 matches, 1 mismatch, 2 the subject failed to load.
 */
let restore;
try {
  restore = await import('../src/index.js');
} catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();   // RU: Возвращённое значение тела означает расхождение; успех — undefined без исключения.
    // EN: A returned body value means mismatch; success is undefined without an exception.
    if (v !== undefined) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '» — тело обязано бросить или промолчать');
    proshlo++; console.log('  ✅ ' + imya);
  }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 220)); }
};

const sejchas = Date.now();
const CFG = { ignoreAfterMs: 7 * 86400000, useVeraThreshold: 0.7, ignoreVeraThreshold: 0.3, welcomeBudget: 800 };
const znanie = (id, dlina = 150) => ({ id, vid: 'reshenie', avtor: 'stend', kogda: sejchas - 3600000, vera: null,
  soderzhim: 'ЗНАНИЕ-' + id + '-' + 'з'.repeat(dlina), bezPodtverzhdeniya: false, podtverzhdenie: null, otnosheniya: null, doverie: null });
const otmenennaya = (id, k) => ({ ...znanie(id, 150), soderzhim: 'ОТМЕНЁННОЕ-СОДЕРЖИМОЕ-' + id,
  doverie: { sostoyanie: 'otmenena', stroka: `⛔ ОТМЕНЕНА записью #${k} (кем: stend-sud, когда: 2026-09-26 00:00Z)`, ssylki: [k] } });
const brif = (zapisi, cfg = CFG) => restore.podatWelcome(zapisi, cfg);
const stroki = (t) => (t ?? '').split('\n');
const strokiOtmeny = (t) => stroki(t).filter((l) => l.includes('⛔ #'));

proba('отменённая ПЕРВОЙ в десятке: знание подано, «⛔» — после него', () => {
  const { tekst, podany } = brif([otmenennaya(1, 90), znanie(2), znanie(3)]);
  if (!podany.some((r) => r.id === 2)) throw new Error('знание #2 не подано: ' + tekst);
  const s = stroki(tekst), iZn = s.findIndex((l) => l.includes('#2 ')), iOt = s.findIndex((l) => l.includes('⛔ #1'));
  if (iOt < 0) throw new Error('строки об отмене нет');
  if (!(iZn >= 0 && iZn < iOt)) throw new Error(`порядок: знание ${iZn}, отмена ${iOt}`);
});
proba('«⛔» НЕ тратит бюджет: бюджет на два знания, отменённая между ними — поданы оба', () => {
  const zapisi = [znanie(2), otmenennaya(1, 90), znanie(3)];
  const odna = brif([znanie(2)], { ...CFG, welcomeBudget: 100000 }).tekst.split('\n')[1].length - 2;
  const { tekst, podany } = brif(zapisi, { ...CFG, welcomeBudget: odna * 2 });
  if (podany.length !== 2) throw new Error(`подано ${podany.length} из 2 при бюджете ${odna * 2}: ` + tekst);
});
proba('много отменённых (5) — ОДНА сводная строка: трое поимённо прежней формой, «ещё 2 отменено: #14, #15»', () => {
  const { tekst } = brif([otmenennaya(11, 90), znanie(2), otmenennaya(12, 90), otmenennaya(13, 90), otmenennaya(14, 91), otmenennaya(15, 92)],
    { ...CFG, welcomeBudget: 100000 });
  const so = strokiOtmeny(tekst);
  if (so.length !== 1) throw new Error('строк с «⛔ #»: ' + so.length);
  for (const id of [11, 12, 13]) if (!so[0].includes(`⛔ #${id} не подаётся — ⛔ ОТМЕНЕНА записью #90`)) throw new Error('нет поимённо #' + id + ': ' + so[0]);
  if (!so[0].includes('ещё 2 отменено: #14, #15')) throw new Error('нет хвоста: ' + so[0]);
  if (so[0].includes('⛔ #14')) throw new Error('#14 назван поимённо сверх трёх');
  if (so[0] !== stroki(tekst).at(-1)) throw new Error('сводная строка не последняя');
});
proba('только отменённые — брифинг есть, строка видна (условие аудитор integration-note), подано 0', () => {
  const { tekst, podany } = brif([otmenennaya(1, 90)]);
  if (!tekst || !tekst.includes('⛔ #1 не подаётся — ⛔ ОТМЕНЕНА записью #90 (кем: stend-sud, когда: ')) throw new Error('строки нет: ' + tekst);
  if (podany.length) throw new Error('подано ' + podany.length);
});
proba('отменённых нет — строки «⛔» нет, брифинг прежний', () => {
  const { tekst } = brif([znanie(2), znanie(3)], { ...CFG, welcomeBudget: 100000 });
  if (tekst.includes('⛔')) throw new Error('лишняя «⛔»: ' + tekst);
  if (!tekst.startsWith('Память (welcome-брифинг, первые 2 записи')) throw new Error('заголовок: ' + stroki(tekst)[0]);
});
proba('отменённая ЗА пределом бюджета всё равно названа (бюджет — на одно знание, отмена восьмой)', () => {
  const zapisi = [znanie(2), znanie(3), znanie(4), znanie(5), znanie(6), znanie(7), znanie(8), otmenennaya(9, 90)];
  const { tekst, podany } = brif(zapisi, { ...CFG, welcomeBudget: 10 });
  if (podany.length !== 1) throw new Error('подано ' + podany.length + ' (ждали 1 — первая сверх бюджета, как прежде)');
  if (!tekst.includes('⛔ #9 не подаётся')) throw new Error('#9 не назван: ' + tekst);
});
proba('содержимое отменённых не подано, в podany их нет (касание — только поданному, integration-note)', () => {
  const { tekst, podany } = brif([otmenennaya(1, 90), znanie(2), otmenennaya(3, 90)], { ...CFG, welcomeBudget: 100000 });
  if (tekst.includes('ОТМЕНЁННОЕ-СОДЕРЖИМОЕ')) throw new Error('содержимое подано');
  if (podany.some((r) => r.id === 1 || r.id === 3)) throw new Error('отменённая в podany');
});
proba('заголовок считает ТОЛЬКО знания: 1 знание + 2 отменённые → «первые 1 записи»', () => {
  const { tekst } = brif([otmenennaya(1, 90), znanie(2), otmenennaya(3, 90)], { ...CFG, welcomeBudget: 100000 });
  if (!stroki(tekst)[0].includes('первые 1 записи')) throw new Error('заголовок: ' + stroki(tekst)[0]);
});

// RU: Проверки даты записи внутри строки знания, отдельно от даты запуска стенда.
// EN: Check the record date inside the knowledge line separately from the test run date.
const denMsk = (ms) => { const d = new Date(ms + 3 * 3600000); return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
const strokaZnaniya = (zap) => stroki(brif([zap], { ...CFG, welcomeBudget: 100000 }).tekst).find((l) => l.includes('#' + zap.id + ' ')) ?? '';
proba('integration-note: вчерашняя запись — дата записи в строке «(вид от автора, ДД.ММ)»', () => {
  const kogda = sejchas - 86400000, s = strokaZnaniya({ ...znanie(21), kogda });
  if (!s.includes(`(reshenie от stend, ${denMsk(kogda)})`)) throw new Error(`ждали «, ${denMsk(kogda)})»: ` + s);
});
proba('integration-note: 6-суточная запись подана и несёт СВОЮ дату, не сегодняшнюю', () => {
  const kogda = sejchas - 6 * 86400000, s = strokaZnaniya({ ...znanie(22), kogda });
  if (!s.includes(`(reshenie от stend, ${denMsk(kogda)})`)) throw new Error(`ждали «, ${denMsk(kogda)})»: ` + s);
  if (s.includes(', ' + denMsk(sejchas) + ')')) throw new Error('дата сегодняшняя: ' + s);
});
proba('integration-note: граница суток по МСК — запись 21:30Z несёт СЛЕДУЮЩИЙ день, не день UTC', () => {
  const d = new Date(sejchas - 2 * 86400000); d.setUTCHours(21, 30, 0, 0);
  const kogda = d.getTime(), s = strokaZnaniya({ ...znanie(23), kogda });
  const utc = String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0');
  if (denMsk(kogda) === utc) throw new Error('стенд: МСК и UTC совпали — проба не различает');
  if (!s.includes(`, ${denMsk(kogda)})`) || s.includes(`, ${utc})`)) throw new Error(`ждали МСК ${denMsk(kogda)}, не UTC ${utc}: ` + s);
});
proba('integration-note: время записи неизвестно — даты нет, строка прежней формы', () => {
  const s = strokaZnaniya({ ...znanie(24), kogda: null });
  if (!s.includes('(reshenie от stend) ')) throw new Error('ждали «(reshenie от stend) »: ' + s);
});

console.log(`  итог integration-note: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
