// RU: Стенд stend-pdn-maska.mjs: маска ПДн гостя pdn-maska.mjs на синтетических значениях и подставном поставщике на 127.0.0.1.
//     Проверяет формы телефона и почты, реестр гостей, публичный список, непрозрачные поля, обратную подстановку,
//     отказы посредника (не JSON, сжатое тело, нечитаемый реестр) и отказ шлюза при старте с неверной настройкой.
//     Не проверяет: настоящий SDK и поставщика, носители рамки SDK (это проба proba_maski.py), склонённые имена (не ловятся — граница).
// EN: Stand for the guest PII mask on synthetic values and a fake provider on 127.0.0.1; real SDK carriers are covered by the frame probe.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import http from 'node:http'; import { spawnSync } from 'node:child_process'; import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const kat = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(kat, 'pdn-maska.mjs'))) { console.log(`СЛЕПОТА: предмета нет: ${path.join(kat, 'pdn-maska.mjs')}`); process.exit(2); }
const M = await import(path.join(kat, 'pdn-maska.mjs'));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'stend-pdn-')); process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch {} }); // r6: шлюз пробы конвертов дописывает после SIGTERM — ENOTEMPTY не должен ронять итог
const R = path.join(T, 'reestr'); fs.mkdirSync(R);
const imya = 'Евлампия-' + Math.random().toString(36).slice(2, 8), tel = '+7 (912) 345-67-89', pochta = 'gost-' + Math.random().toString(36).slice(2, 8) + '@example.invalid';
fs.writeFileSync(path.join(R, 'g1.json'), JSON.stringify({ imya, telefony: [tel], pochty: [pochta] }));
// RU: Белый список r6 — текстовый файл «вид: значение» (B-N-1547 r6); номера и имена в стенде вымышленные.
// EN: r6 whitelist — a text file «kind: value»; numbers and names in the harness are fictional.
fs.writeFileSync(path.join(T, 'belyj.txt'), '# проба\nтел: +7 495 000-00-01\nпочта: info@kompaniya.invalid\n');
const r = M.prochestReestr(R, path.join(T, 'belyj.txt'));
let bed = 0, vsego = 0; const proba = async (imya_, fn) => { vsego++; try { await fn(); console.log('  ✅ ' + imya_); } catch (e) { bed++; console.log('  🔴 ' + imya_ + ' — ' + String(e?.message ?? e).slice(0, 200)); } };
const est = (s, v) => s.includes(v);

await proba('реестр: имя, телефон и почта гостя заменены заглушками', () => {
  const s = M.maskirovatTekst(`Я ${imya}, тел ${tel}, почта ${pochta}`, r);
  for (const v of [imya, tel, pochta]) assert.ok(!est(s, v), 'осталось значение'); assert.equal((s.match(/⟦/g) ?? []).length, 3); });
await proba('реестр: имя без учёта регистра, телефон реестра в иной записи (8…, слитно)', () => {
  const s = M.maskirovatTekst(`${imya.toUpperCase()} 89123456789`, r); assert.ok(!est(s, imya.toUpperCase())); assert.ok(!est(s, '9123456789')); });
await proba('образцы без реестра: +7, 8 с разделителями, 7 слитно, почта', () => {
  for (const v of ['+7 999 111-22-33', '8 (999) 111-22-34', '79991112235', '+44 20 7946 0958', 'x.y+z@mail.example.org'])
    assert.ok(!est(M.maskirovatTekst(`контакт: ${v}.`, M.PUSTOJ_REESTR), v), v); });
await proba('не трогает: даты, время, метку эпохи 13 цифр, номер заказа, uuid', () => {
  for (const v of ['2026-10-04 12:34', '1791156880161', 'заказ № 12345', '3f2b8c1e-9d4a-4b7e-8f00-123456789abc', 'цена 1 200 000 руб'])
    assert.equal(M.maskirovatTekst(v, M.PUSTOJ_REESTR), v, v); });
// B-N-1676: слитные международные номера («+» и 8–15 цифр, E.164) — и вплотную за латиницей.
await proba('B-N-1676: слитные +цифры 8–15 и номер вплотную за латиницей → маска', () => {
  for (const v of ['+79991112233', '+447946095812', '+12025550123', '+49301234', '+493012345', '+493012345678901'])
    for (const s of [`тел ${v}`, `WhatsApp${v}`, `tel:${v}.`, `(${v})`]) assert.ok(!est(M.maskirovatTekst(s, M.PUSTOJ_REESTR), v.slice(1)), 'без маски: ' + s); });
await proba('B-N-1676: не трогает суммы, номера заказов, id, арифметику, 7 цифр', () => {
  for (const v of ['+1 250,50 ₽', '+12500000 ₽', '+125000000руб', 'итого +99999999 USD', 'заказ №123456789', 'order-12345678', 'id_+12345678', '5+12345678', 'код +4930123'])
    assert.equal(M.maskirovatTekst(v, M.PUSTOJ_REESTR), v, 'задето: ' + v); });
// B-N-1736: суммы после плюса с валютой — не телефон; телефон с разделителями маскируется как прежде.
await proba('B-N-1736: суммы с валютой (< 10 цифр; разделители, копейки, слитно, склонения) не трогаются', () => {
  for (const v of ['+12 500 000 ₽', '+12 500 000,50 ₽', '+12500000,50 ₽', '+125 000 000 ₽', '+12 500 000 руб.', '+12 500 000 рублей', '+12 500 000 рубля', '+12 500 000 р.', '+12 500 000 р',
    '+12 500 000 $', '+12 500 000 евро', '+12 500 000 долларов', '+12 500 000 долл.', '+12 500 000 USD', 'итого: +12 500 000 ₽.'])
    assert.equal(M.maskirovatTekst(v, M.PUSTOJ_REESTR), v, 'задета сумма: ' + v); });
await proba('B-N-1736: телефоны — маска и перед валютой: дефис/скобки или 10+ цифр (решение Забавы)', () => {
  for (const v of ['+7 921 952-91-20', '+44 20 7946 0958', '+7 (921) 952-91-20', '+1 202 555 0123', '+7 921 952-91-20 руб', '+7 (921) 9529120 ₽',
    '+7 999 111 22 33 руб', '8 999 111 22 33 руб', '+44 20 7946 0958 €', '+79991112233 ₽'])
    assert.ok(!est(M.maskirovatTekst(`тел ${v}`, M.PUSTOJ_REESTR), v.replace(/ (руб|₽|€)$/, '')), 'без маски: ' + v); });
await proba('B-N-1736 r2: слово, начинающееся с валюты, — не валюта (номер 8–9 цифр перед ним — маска)', () => {
  for (const v of ['+49301234 Рублёвка', '+49301234 Рублёвское шоссе', '+493012345 Европейская 5', '+12 500 000 евродвор', '+493012345 Eurostar', '+49301234 р.Москва', '+49301234 руб.Москва'])
    assert.ok(!est(M.maskirovatTekst(v, M.PUSTOJ_REESTR), v.match(/^\+[\d ]*\d/)[0]), 'без маски: ' + v); });
await proba('B-N-1736 r2: края порога — 9 цифр + ₽ сумма, 10 цифр + ₽ маска; «+12 500 000» без валюты — маска', () => {
  assert.equal(M.maskirovatTekst('+125 000 000 ₽', M.PUSTOJ_REESTR), '+125 000 000 ₽', 'задета сумма: +125 000 000 ₽');
  assert.ok(!est(M.maskirovatTekst('+1 250 000 000 ₽', M.PUSTOJ_REESTR), '1 250 000 000'), 'без маски: +1 250 000 000 ₽');
  assert.ok(!est(M.maskirovatTekst('+12 500 000', M.PUSTOJ_REESTR), '12 500 000'), 'без маски: +12 500 000'); });
await proba('B-N-1676: слитный номер из белого списка проходит как есть (и за латиницей)', () => {
  for (const v of ['звоните +74950000001', 'WhatsApp+74950000001']) assert.equal(M.maskirovatTekst(v, r), v, 'замаскирован номер списка: ' + v); });
await proba('публичный список: телефон и почта компании не маскируются', () => {
  const s = M.maskirovatTekst('звоните +7 495 000-00-01, пишите INFO@kompaniya.invalid', r); assert.ok(est(s, '+7 495 000-00-01')); assert.ok(est(s, 'INFO@kompaniya.invalid')); });
await proba('непрозрачные поля (signature, thinking, data, id, tool_use_id, model) не меняются, text — маскируется', () => {
  const v = `${tel} ${pochta}`; const o = { model: v, content: [{ type: 'thinking', thinking: v, signature: v }, { type: 'image', source: { data: v } }, { type: 'tool_use', id: v }, { type: 'tool_result', tool_use_id: v, content: v }, { type: 'text', text: v }] };
  const m = M.maskirovatZnachenie(o, r, '');
  for (const p of [m.model, m.content[0].thinking, m.content[0].signature, m.content[1].source.data, m.content[2].id, m.content[3].tool_use_id]) assert.equal(p, v);
  assert.ok(!est(m.content[3].content, tel) && !est(m.content[4].text, pochta)); });
await proba('обратная подстановка: имя возвращается, в JSON — с экранированием кавычки', () => {
  const k = new Map(); const s = M.maskirovatTekst(`Здравствуйте, ${imya}!`, r, k); assert.equal(M.raskrytTekst(s, k), `Здравствуйте, ${imya}!`);
  const R2 = path.join(T, 'r2'); fs.mkdirSync(R2); fs.writeFileSync(path.join(R2, 'k.json'), JSON.stringify({ imya: 'О"Нил Пэт' }));
  const k2 = new Map(); const z = M.maskirovatTekst('для О"Нил Пэт', M.prochestReestr(R2), k2); assert.deepEqual(M.raskrytZnachenie({ text: z }, k2), { text: 'для О"Нил Пэт' }); });
await proba('карта хода: заглушка ДРУГОГО хода не раскрывается — гость видит заглушку, не чужой номер', () => {
  const kB = new Map(), kC = new Map(); const zB = M.maskirovatTekst(`тел ${tel}`, r, kB).match(/⟦тел:[0-9a-f]{8}⟧/)[0];
  const otvetC = M.raskrytTekst(`Из заметки: ${zB}`, kC); assert.ok(otvetC.includes(zB) && !otvetC.includes(tel), 'в ходе C раскрылся номер B');
  assert.ok(M.raskrytTekst(`Из заметки: ${zB}`, kB).includes(tel), 'в своём ходе B не раскрылся'); assert.equal(M.raskrytTekst(zB), zB, 'без карты раскрылся'); });
await proba('граница: склонённое имя и имя вне реестра НЕ маскируются (стенд держит границу видимой)', () => {
  assert.ok(est(M.maskirovatTekst('Евлампию', M.prochestReestr(R)), 'Евлампию')); assert.ok(est(M.maskirovatTekst('Пётр', r), 'Пётр')); });

// RU: B-N-1547 r6 — белый список владельца: формы телефона, домен, главенство над реестром гостя, битые строки, нечитаемый файл.
// EN: B-N-1547 r6 — owner whitelist: phone forms, domain, precedence over a guest record, broken lines, unreadable file.
const FORMY = (a, b, c, d) => [`+7 ${a} ${b}-${c}-${d}`, `+7${a}${b}${c}${d}`, `8 (${a}) ${b}-${c}-${d}`, `8-${a}-${b}-${c}-${d}`, `8 ${a} ${b} ${c} ${d}`,
  `+7 (${a}) ${b} ${c} ${d}`, `8${a}${b}${c}${d}`, `7${a}${b}${c}${d}`, `+7-${a}-${b}-${c}-${d}`,
  `7 ${a} ${b} ${c} ${d}`, `7 (${a}) ${b}-${c}-${d}`, `${a} ${b} ${c} ${d}`, `(${a}) ${b}-${c}-${d}`, `${a}-${b}-${c}-${d}`];
const belyjPut = path.join(T, 'belyj-r6.txt');
fs.writeFileSync(belyjPut, '# белый список пробы\nдомен: primer-centr.invalid\nимя: Аркадий Пробный\nтел: 8 (900) 111-22-33\nпочта: Svoj@Primer.Invalid\n');
const zapisi = []; const rb = M.prochestReestr(R, belyjPut, m => zapisi.push(m));
await proba('r6: номер из списка проходит во ВСЕХ формах записи (+7/8, слитно, пробелы, дефисы, скобки)', () => {
  for (const v of FORMY('900', '111', '22', '33')) assert.ok(est(M.maskirovatTekst(`звоните ${v}.`, rb), v), v); });
await proba('r6: номер ВНЕ списка маскируется во всех тех же формах', () => {
  for (const v of FORMY('900', '444', '55', '66')) assert.ok(!est(M.maskirovatTekst(`звоните ${v}.`, rb), v), v); });
await proba('r6: домен из списка — любой адрес проходит (регистр не важен); чужой домен и похожие — маскируются', () => {
  for (const v of ['kto-ugodno@primer-centr.invalid', 'A@PRIMER-CENTR.INVALID']) assert.ok(est(M.maskirovatTekst(`пишите ${v}`, rb), v), v);
  for (const v of ['primer.centr@gmail.invalid', 'x@primer-centr.invalid.zloj.invalid', 'x@pod.primer-centr.invalid']) assert.ok(!est(M.maskirovatTekst(`пишите ${v}`, rb), v), v); });
await proba('r6: почта из списка проходит без учёта регистра', () => { assert.ok(est(M.maskirovatTekst('svoj@primer.invalid', rb), 'svoj@primer.invalid')); });
await proba('r6: список главнее реестра гостя — имя и номер владельца в записи гостя не маскируются, остальное гостя — да', () => {
  const R6 = path.join(T, 'reestr-r6'); fs.mkdirSync(R6);
  fs.writeFileSync(path.join(R6, 'g.json'), JSON.stringify({ imya: 'Аркадий Пробный', telefony: ['+79001112233', '+7 900 777-88-99'], pochty: ['gost@ne-spisok.invalid'] }));
  const t = M.maskirovatTekst('Аркадий Пробный, 8 900 111 22 33; гость: +7 900 777-88-99, gost@ne-spisok.invalid', M.prochestReestr(R6, belyjPut));
  assert.ok(est(t, 'Аркадий Пробный') && est(t, '8 900 111 22 33'), t); assert.ok(!est(t, '777-88-99') && !est(t, 'gost@ne-spisok.invalid'), t); });
await proba('r6: битая строка и неизвестный вид НЕ пропускают значение и называются в журнале номерами строк', () => {
  const put = path.join(T, 'belyj-bityj.txt'); fs.writeFileSync(put, 'тел: 12-34\nтелефон: +7 900 222-33-44\nимя: Ан\n'); const z = [];
  const rr = M.prochestReestr(R, put, m => z.push(m)); assert.ok(!est(M.maskirovatTekst('+7 900 222-33-44', rr), '222-33-44'));
  assert.ok(z.some(m => /строки 1, 2, 3 не разобраны/.test(m)), z.join(' | ')); });
await proba('r6: нечитаемый файл списка — не отказ, а пустой список: всё маскируется, в журнале «не прочитан»', () => {
  const z = []; const rr = M.prochestReestr(R, path.join(T, 'net-takogo.txt'), m => z.push(m));
  assert.ok(!est(M.maskirovatTekst('8 (900) 111-22-33', rr), '111-22-33')); assert.ok(z.some(m => /не прочитан \(ENOENT\)/.test(m)), z.join(' | ')); });
// RU: B-N-1739 — международный номер в белом списке: E.164 любой страны с пробелами/дефисами/скобками; сверка по цифрам как есть
//     (номер в списке не открывает российский с теми же цифрами); мусор не разобран и назван номером строки, без содержимого.
// EN: B-N-1739 — international numbers in the whitelist: any-country E.164 with separators; compared by digits as is; junk named by line only.
await proba('B-N-1739: международный номер с разделителями разобран и проходит в любой записи; «+7» и «8» — как было', () => {
  const put = path.join(T, 'belyj-1739.txt'); const z = [];
  fs.writeFileSync(put, 'тел: +381 64 555 0102\nтел: +44 (20) 7946-0958\nтел: +373-22-123-456\nтел: 8 (900) 111-22-33\n');
  const rr = M.prochestReestr(R, put, m => z.push(m));
  assert.ok(z.some(m => /телефонов 4, /.test(m)) && !z.some(m => /не разобраны/.test(m)), z.join(' | '));
  for (const v of ['+381 64 555 0102', '+381645550102', '+381 (64) 555-01-02', '+44 20 7946 0958', '+442079460958', '+373 22 123 456', '+37322123456', '+7 900 111-22-33', '8 900 111 22 33'])
    assert.ok(est(M.maskirovatTekst(`звоните ${v}.`, rr), v), v);
  for (const v of ['+381 64 555 0199', '+44 20 7946 0959', '+373 22 123 457']) assert.ok(!est(M.maskirovatTekst(`звоните ${v}.`, rr), v), v); });
await proba('B-N-1739: номер другой страны в списке НЕ открывает российский с теми же цифрами (10 цифр; 11 с ведущей 8)', () => {
  const put = path.join(T, 'belyj-1739-kollizii.txt'); const z = [];
  fs.writeFileSync(put, 'тел: +49 30 123456\nтел: +81 3 1234 5678\n');
  const rr = M.prochestReestr(R, put, m => z.push(m));
  assert.ok(z.some(m => /телефонов 2, /.test(m)) && !z.some(m => /не разобраны/.test(m)), z.join(' | '));
  for (const v of ['+49 30 123456', '+81 3 1234 5678']) assert.ok(est(M.maskirovatTekst(`звоните ${v}.`, rr), v), v);
  for (const v of ['+7 (493) 012-34-56', '8 493 012 34 56', '+7 131 234 56 78', '8 (131) 234-56-78']) assert.ok(!est(M.maskirovatTekst(`звоните ${v}.`, rr), v), v); });
await proba('B-N-1739: мусор в «тел:» не разобран, назван номерами строк, содержимого строк в журнале нет', () => {
  const put = path.join(T, 'belyj-1739-musor.txt'); const z = [];
  fs.writeFileSync(put, 'тел: +12 34\nтел: +44 20 79x6 0958\nтел: +1234567890123456\nтел: ++44 20 7946 0958\n');
  const rr = M.prochestReestr(R, put, m => z.push(m)); const zh = z.join(' | ').split(put).join('');
  assert.ok(/строки 1, 2, 3, 4 не разобраны/.test(zh), zh); for (const v of ['34', '79', '0958', '123456']) assert.ok(!est(zh, v), `в журнале «${v}»: ${zh}`);
  assert.ok(!est(M.maskirovatTekst('звоните +44 20 7946 0958.', rr), '7946 0958')); });

// RU: Посредник на подставном поставщике: что дошло наверх — то и сверяем.
const prishlo = []; const verh = http.createServer((q, s) => { const c = []; q.on('data', x => c.push(x)); q.on('end', () => { prishlo.push(Buffer.concat(c).toString()); s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"ok":true}'); }); });
await new Promise(ok => verh.listen(0, '127.0.0.1', ok));
const zhurnal = []; let reestrOk = true;
const P = await M.podnyatPosrednika({ vverh: `http://127.0.0.1:${verh.address().port}/base`, reestr: () => { if (!reestrOk) throw Object.assign(new Error('x'), { code: 'EACCES' }); return r; }, log: m => zhurnal.push(m) });
const H = P.otkrytKartu();
const zapros = (telo, zag = {}, adres = H.url) => new Promise((ok, no) => { const q = http.request(`${adres}/v1/messages?beta=true`, { method: 'POST', headers: { 'content-type': 'application/json', ...zag } }, s => { const c = []; s.on('data', x => c.push(x)); s.on('end', () => ok({ kod: s.statusCode, telo: Buffer.concat(c).toString() })); }); q.on('error', no); q.end(telo); });
await proba('посредник: тело JSON маскируется до поставщика, путь и запрос сохранены', async () => {
  const n = prishlo.length; const o = await zapros(JSON.stringify({ messages: [{ role: 'user', content: `я ${imya}, ${tel}` }] }));
  assert.equal(o.kod, 200); assert.equal(prishlo.length, n + 1); assert.ok(!est(prishlo[n], imya) && !est(prishlo[n], '345-67-89')); assert.ok(est(prishlo[n], '⟦имя:')); });
await proba('посредник: не JSON — отказ 502, наверх не ушло', async () => {
  const n = prishlo.length; const o = await zapros(`не json ${tel}`); assert.equal(o.kod, 502); assert.equal(prishlo.length, n); });
await proba('посредник: сжатое тело — отказ 502, наверх не ушло', async () => {
  const n = prishlo.length; const o = await zapros(zlib.gzipSync(JSON.stringify({ t: tel })), { 'content-encoding': 'gzip' }); assert.equal(o.kod, 502); assert.equal(prishlo.length, n); });
await proba('посредник: реестр не прочитан — отказ 502, наверх не ушло, в журнале без значений', async () => {
  reestrOk = false; const n = prishlo.length; const o = await zapros(JSON.stringify({ t: imya })); reestrOk = true;
  assert.equal(o.kod, 502); assert.equal(prishlo.length, n); assert.ok(zhurnal.some(z => z.includes('EACCES'))); assert.ok(!zhurnal.some(z => est(z, imya))); });
await proba('посредник: запрос без карты хода (голый адрес) — отказ 502, наверх не ушло', async () => {
  const n = prishlo.length; const o = await zapros(JSON.stringify({ t: tel }), {}, P.url); assert.equal(o.kod, 502); assert.equal(prishlo.length, n); });
await proba('посредник: карта закрыта — её адрес больше не принимается (502), наверх не ушло', async () => {
  const H2 = P.otkrytKartu(); assert.equal((await zapros(JSON.stringify({ t: 'x' }), {}, H2.url)).kod, 200); H2.zakryt();
  const n = prishlo.length; const o = await zapros(JSON.stringify({ t: tel }), {}, H2.url); assert.equal(o.kod, 502); assert.equal(prishlo.length, n); });
await proba('посредник: заглушки запроса легли в карту ЕГО хода, не в карту соседнего', async () => {
  const Ha = P.otkrytKartu(), Hb = P.otkrytKartu(); await zapros(JSON.stringify({ t: `я ${imya}` }), {}, Ha.url);
  assert.ok(Ha.karta.size >= 1 && Hb.karta.size === 0, `a=${Ha.karta.size} b=${Hb.karta.size}`); Ha.zakryt(); Hb.zakryt(); });
// RU: r6 — правка файла списка без перезапуска: посредник читает список на каждый запрос.
// EN: r6 — whitelist edit without a restart: the intermediary reads the list per request.
await proba('r6: правка списка без перезапуска — дописанный номер со следующего запроса уходит как есть, вычеркнутый снова маскируется', async () => {
  const put = path.join(T, 'belyj-zhivoj.txt'); fs.writeFileSync(put, 'тел: +7 900 111-22-33\n');
  const P2 = await M.podnyatPosrednika({ vverh: `http://127.0.0.1:${verh.address().port}/base`, reestr: () => M.prochestReestr(R, put), log: () => {} }); const H2 = P2.otkrytKartu();
  const telo = JSON.stringify({ messages: [{ role: 'user', content: 'номер +7 900 555-66-77' }] }); const n = prishlo.length;
  await zapros(telo, {}, H2.url); assert.ok(!est(prishlo[n], '555-66-77'), 'до правки ушёл как есть');
  fs.appendFileSync(put, 'тел: 8 900 555 66 77\n'); await zapros(telo, {}, H2.url); assert.ok(est(prishlo[n + 1], '555-66-77'), 'после дописки замаскирован');
  fs.writeFileSync(put, 'тел: +7 900 111-22-33\n'); await zapros(telo, {}, H2.url); assert.ok(!est(prishlo[n + 2], '555-66-77'), 'после вычёркивания ушёл как есть');
  H2.zakryt(); P2.server.close(); });
H.zakryt(); P.server.close(); verh.close();

// RU: Отказ шлюза при старте: неизвестное значение и неполная настройка.
const zapusk = env => spawnSync(process.execPath, [path.join(kat, 'gateway.mjs')], { env: { PATH: process.env.PATH, HOME: T, ...env }, encoding: 'utf8', timeout: 15000 });
{ const p = zapusk({ GATEWAY_MASKA_PDN: 'yes' }); if (/ERR_MODULE_NOT_FOUND/.test(p.stderr ?? '')) { console.log(`СЛЕПОТА: шлюз не импортируется (нет зависимостей рядом с ${kat}) — пробы старта не исполнены; итог до них: ${vsego - bed} из ${vsego}`); process.exit(2); } }
await proba('шлюз: GATEWAY_MASKA_PDN=yes — отказ при старте, код 2', () => { const p = zapusk({ GATEWAY_MASKA_PDN: 'yes' }); assert.equal(p.status, 2); assert.match(p.stderr, /знает только значение 1/); });
await proba('шлюз: маска без реестра и моделей — отказ при старте, код 2', () => { const p = zapusk({ GATEWAY_MASKA_PDN: '1' }); assert.equal(p.status, 2); assert.match(p.stderr, /требует GATEWAY_GOST_REESTR/); });
await proba('r6 шлюз: прежняя GATEWAY_GOST_PUBLICHNYE — отказ при старте, код 2, с именем новой переменной', () => {
  const p = zapusk({ GATEWAY_MASKA_PDN: '1', GATEWAY_GOST_REESTR: R, GATEWAY_GOST_MODELI: 'm', GATEWAY_GOST_PUBLICHNYE: path.join(T, 'x.json') });
  assert.equal(p.status, 2); assert.match(p.stderr, /GATEWAY_GOST_BELYJ_SPISOK/); });
await proba('шлюз: нечитаемый реестр при старте — отказ, код 2', () => { const p = zapusk({ GATEWAY_MASKA_PDN: '1', GATEWAY_GOST_REESTR: path.join(T, 'net'), GATEWAY_GOST_MODELI: 'm' }); assert.equal(p.status, 2); assert.match(p.stderr, /реестр гостей не прочитан при старте \(ENOENT\)/); });
// RU: Маска и шлюзовой компакт: модуль сжатия шлёт стенограмму мимо посредника — с маской допустим только выключенный (false).
// EN: Mask and gateway compaction: the compaction module bypasses the intermediary — with the mask only an explicitly disabled one (false) is allowed.
{
  const stub = path.join(T, 'stub-kompakt.mjs');
  fs.writeFileSync(stub, `const v = process.env.STUB_SHL; export const KOMPAKT_SHLYUZOVOJ = v === undefined ? undefined : v === 'true';
export const KOMPAKT_PLATFORMENNYJ = true; export const KOMPAKT_POROG = 1000; export const KOMPAKT_STUPENI = [0.5]; export const STUPEN_SESSII = new Map();
export const porogIzPreseta = () => ({ porog: 1000 }); const n = () => null; export const stupenZanjatosti = () => -1; export const putSessii = n; export const polnayaZanyatost = n;
export const zanyatostIzZhurnala = n; export const vedraPoImeni = () => ({}); export const reshitKompakt = () => 'net'; export const fizicheskiyKompakt = async () => { throw Error('stub'); };\n`);
  fs.mkdirSync(path.join(T, 'reestr-k'), { recursive: true });
  const env = (shl) => ({ GATEWAY_MASKA_PDN: '1', GATEWAY_GOST_REESTR: path.join(T, 'reestr-k'), GATEWAY_GOST_MODELI: 'm', GATEWAY_POSTAVSHIK: 'anthropic', GATEWAY_COMPACTION_MODULE: stub, ...(shl === undefined ? {} : { STUB_SHL: shl }) });
  await proba('маска + шлюзовой компакт ВКЛ — отказ при старте, код 2', () => { const p = zapusk(env('true')); assert.equal(p.status, 2); assert.match(p.stderr, /требует выключенного шлюзового компакта \(сейчас: вкл\)/); });
  await proba('маска + шлюзовой компакт НЕ ОБЪЯВЛЕН — отказ при старте, код 2', () => { const p = zapusk(env(undefined)); assert.equal(p.status, 2); assert.match(p.stderr, /\(сейчас: не объявлен\)/); });
  await proba('маска + шлюзовой компакт ВЫКЛ — отказа компакта нет (шлюз идёт дальше, до своего таймаута пробы)', () => {
    const p = spawnSync(process.execPath, [path.join(kat, 'gateway.mjs')], { env: { PATH: process.env.PATH, HOME: T, GATEWAY_PORT: '0', ...env('false') }, encoding: 'utf8', timeout: 4000, killSignal: 'SIGKILL' });
    assert.ok(!/шлюзового компакта/.test(p.stderr ?? ''), 'отказ компакта при выключенном'); assert.notEqual(p.status, 2, 'код 2 при выключенном');
    assert.match(p.stderr ?? '', /маска ПДн: ВКЛ/, 'шлюз не дошёл до подъёма'); });
  await proba('r6 шлюз: при старте в журнале сводка белого списка (счёт, без значений)', () => {
    const p = spawnSync(process.execPath, [path.join(kat, 'gateway.mjs')], { env: { PATH: process.env.PATH, HOME: T, GATEWAY_PORT: '0', ...env('false'), GATEWAY_GOST_BELYJ_SPISOK: belyjPut }, encoding: 'utf8', timeout: 4000, killSignal: 'SIGKILL' });
    assert.match(p.stderr ?? '', /белый список .*: имён 1, телефонов 1, почт 1, доменов 1/); assert.ok(!est(p.stderr ?? '', '111-22-33'), 'значение в журнале'); });
}
// RU: Конверты беседы под маской: stateless (живой путь Варвары) и telegram-v2 с cwd сессии ≠ GATEWAY_WORK_DIR — оба приняты (не 400).
// EN: Conversation envelopes under the mask: stateless (Varvara's live path) and telegram-v2 with a session cwd ≠ GATEWAY_WORK_DIR — both admitted (not 400).
{
  const net = await import('node:net'); const crypto = await import('node:crypto');
  const port = await new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const kl = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(path.join(T, 'ingress'), kl, { mode: 0o600 }); fs.writeFileSync(path.join(T, 'token'), crypto.randomBytes(30).toString('base64'), { mode: 0o600 });
  fs.mkdirSync(path.join(T, 'work')); fs.mkdirSync(path.join(T, 'reestr-pust'));
  const { spawn } = await import('node:child_process');
  const g = spawn(process.execPath, [path.join(kat, 'gateway.mjs')], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, HOME: T, GATEWAY_PORT: String(port),
    GATEWAY_TOKEN_FILE: path.join(T, 'token'), GATEWAY_INGRESS_KEY_FILE: path.join(T, 'ingress'), GATEWAY_WORK_DIR: path.join(T, 'work'), GATEWAY_BAZA_SESSIJ: path.join(T, 's.db'),
    GATEWAY_POSTAVSHIK: 'anthropic', GATEWAY_INSTRUMENTY_DVIZHKA: 'net', ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', GATEWAY_MASKA_PDN: '1',
    GATEWAY_GOST_REESTR: path.join(T, 'reestr-pust'), GATEWAY_GOST_MODELI: 'claude-opus-5-5' } });
  process.on('exit', () => { try { process.kill(-g.pid, 'SIGKILL'); } catch {} });
  let gotov = false; for (let i = 0; i < 80 && !gotov; i++) { try { gotov = (await fetch(`http://127.0.0.1:${port}/health`)).status === 200; } catch {} if (!gotov) await new Promise(r => setTimeout(r, 100)); }
  if (!gotov) { try { process.kill(-g.pid, 'SIGTERM'); } catch {} console.log(`СЛЕПОТА: копия шлюза с маской не поднялась (/health не 200 за 8 с) — пробы конвертов не исполнены; итог до них: ${vsego - bed} из ${vsego}`); process.exit(2); }
  // RU: Отказ конверта (400) шлюз пишет сразу, до SDK; принятый ход ждёт поставщика — поэтому «нет ответа за 3 с» = принят.
  // EN: An envelope refusal (400) is written immediately, before the SDK; an admitted turn waits for the provider — so «no answer within 3 s» = admitted.
  const kod = (conversation) => new Promise((ok) => { const t = setTimeout(() => { q.destroy(); ok(200); }, 3000); const q = http.request(`http://127.0.0.1:${port}/v2/agent-stream`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + kl } },
    s => { clearTimeout(t); ok(s.statusCode); s.destroy(); q.destroy(); }); q.on('error', () => { clearTimeout(t); ok(null); }); q.end(JSON.stringify({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'проба' }], conversation })); });
  await proba('конверты под маской: stateless — принят (не 400)', async () => { assert.ok(gotov, 'шлюз не поднялся'); assert.equal(await kod({ version: 2, mode: 'stateless' }), 200); });
  await proba('конверты под маской: telegram-v2 с cwd сессии ≠ GATEWAY_WORK_DIR — принят (не 400)', async () => { assert.ok(gotov, 'шлюз не поднялся');
    assert.equal(await kod({ version: 2, id: 'telegram-v2-' + crypto.randomUUID(), createdAt: Date.now(), cwd: '/opt/chuzhoj-katalog' }), 200); });
  try { process.kill(-g.pid, 'SIGTERM'); } catch {}
}
console.log(`итог: ${vsego - bed} из ${vsego}`); process.exit(bed ? 1 : 0);
