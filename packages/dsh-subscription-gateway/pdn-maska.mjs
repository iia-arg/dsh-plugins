// RU: Маска ПДн гостя до модели. Известные хосту значения (реестр гостей) и образцы телефона/почты заменяются заглушками ⟦вид:id⟧; обратная подстановка — только на стороне хоста, после модели.
// EN: Guest PII mask before the model. Host-known values (guest registry) and phone/email patterns become ⟦kind:id⟧ placeholders; reverse substitution happens host-side only, after the model.
// RU: Чего НЕ ловит: имя, которого нет в реестре; склонённые формы имени; контакты в иных записях (словами, по буквам, в картинке).
// EN: Does NOT catch: names absent from the registry; inflected name forms; contacts written otherwise (in words, spelled out, inside images).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const SOL = crypto.randomBytes(16);
const PREDEL_KARTY = 10000;
// RU: Карты заглушек — по одной на ход (токен в пути посредника); общей карты процесса нет.
// EN: Placeholder maps — one per turn (token in the intermediary path); there is no process-wide map.
const karty = new Map();
const MIN_IMYA = 3;
// RU: Непрозрачные поля тела поставщика не трогаем: подписи thinking и сам текст thinking (правка ломает подпись; модель писала его по уже маскированному входу), base64 картинок, идентификаторы вызовов.
// EN: Opaque provider body fields stay untouched: thinking signatures and thinking text itself (editing breaks the signature; the model wrote it from already masked input), image base64, call identifiers.
const NE_TROGAT = new Set(['signature', 'thinking', 'data', 'id', 'tool_use_id', 'model', 'type', 'media_type']);

// RU: B-N-1547 r6 (п.5 владельца — все формы): «7» с разделителями и скобками — как ветка «8»; десять цифр с ведущей 9 — только
//     с разделителями между группами (911 781 15 15, (911) 781-15-15). Слитные десять цифр без кода — граница: их не отличить от
//     номера заказа.
// EN: r6: «7» with separators/brackets like the «8» branch; ten digits starting with 9 only with separators between groups.
const TELEFON = /(?<![\w+])(?:\+\d[\d\s\-().]{8,18}\d|[78][\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\(?9\d{2}\)?[\s\-]+\d{3}[\s\-]+\d{2}[\s\-]+\d{2}|\(9\d{2}\)\d{3}[\s\-]*\d{2}[\s\-]*\d{2})(?!\d)/g;
// RU: B-N-1676 (находка Беты, ворота Вениамина): слитный международный номер «+» и 8–15 цифр (E.164) без разделителей.
//     Ветка выше требует ≥10 цифр и не берёт номер вплотную за латиницей («WhatsApp+7999…», «tel+44…»): эта ветка слева
//     отсекает только цифру, «_» и «+» (часть числа или идентификатора), справа — цифру; сумму отсекает SUMMA_POSLE.
// EN: B-N-1676: fused international number, «+» and 8–15 digits (E.164); not after a digit/underscore/plus; a sum is cut by SUMMA_POSLE.
const TELEFON_SLITNYJ = /(?<![\d_+])\+\d{8,15}(?!\d)/g;
// RU: B-N-1736: за совпадением — копейки и знак валюты ⇒ это сумма, не телефон («+12 500 000 ₽», «+12500000,50 ₽»). Одно ограждение
//     для ОБЕИХ веток; проверяется в обработчике замены над всем совпадением — регулярка не может откатиться к короткому куску суммы.
//     Дефис и скобки сумму не пишут: такое совпадение — телефон при любой валюте следом («+7 921 952-91-20 руб»).
//     r2 (ворота Вениамина 05:57Z, HIGH): у буквенной валюты правая граница (?!\.?\p{L}) (и «р.Москва» — не «р»), склонения явно — иначе «Рублёвка»,
//     «Европейская», «Eurostar» читались валютой и открывали телефон. Решение Забавы: сумма — только при числе цифр < 10;
//     10 и больше цифр перед валютой — телефон («+7 999 111 22 33 руб»). Цена: сумма от миллиарда с валютой маскируется.
// EN: B-N-1736: optional decimals and a currency sign right after the match ⇒ a sum, not a phone; one guard for both branches.
//     r2: letter currencies need a right word boundary, inflections listed; a sum only below 10 digits.
const SUMMA_POSLE = /^(?:[.,]\d{1,2})?\s*(?:[₽$€£¥]|(?:руб(?:\.|л(?:ь|я|ей|ях|ям|ю))?|р\.?|долл(?:\.|ар(?:а|ов|ах|ам|ы)?)?|евро|usd|eur|rub|gbp)(?!\.?\p{L}))/iu;
const summa = (m, str, konec) => cifry(m).length < 10 && !/[-()]/.test(m) && SUMMA_POSLE.test(str.slice(konec, konec + 24));
const POCHTA = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ZAGLUSHKA = /⟦(имя|тел|почта):([0-9a-f]{8})⟧/g;

const cifry = s => String(s).replace(/\D/g, '');
// RU: Телефон в нормальной форме: только цифры, 8XXXXXXXXXX и 10 цифр без кода → 7XXXXXXXXXX (B-N-1547 r6: +7/8, пробелы, дефисы, скобки — одна форма).
// EN: Phone normal form: digits only, 8XXXXXXXXXX and bare 10 digits → 7XXXXXXXXXX.
const normTel = v => { const c = cifry(v); return c.length === 11 && c[0] === '8' ? '7' + c.slice(1) : c.length === 10 ? '7' + c : c; };
const normal = (vid, v) => vid === 'тел' ? normTel(v) : String(v).trim().toLowerCase();
// RU: B-N-1739: сверка с белым списком. Номер, записанный с «+», — E.164 любой страны: цифры как есть, без правил «8→7» и «10 цифр→7»
//     из normTel (иначе «+49 30 123456» из списка открывал бы российский «+7 493 012-34-56»). Без «+» — normTel, как прежде.
// EN: B-N-1739: whitelist comparison. A number written with «+» is any-country E.164: digits as is; without «+» — normTel as before.
const normBelyj = v => /^\s*\+/.test(String(v)) ? cifry(v) : normTel(v);
const ekran = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function zaglushka(vid, znachenie, karta) {
  const id = crypto.createHmac('sha256', SOL).update(vid + '\0' + normal(vid, znachenie)).digest('hex').slice(0, 8);
  if (karta && !karta.has(id)) {
    if (karta.size >= PREDEL_KARTY) karta.delete(karta.keys().next().value);
    karta.set(id, String(znachenie));
  }
  return `⟦${vid}:${id}⟧`;
}

// RU: Белый список (решение владельца 05.10 09:37 МСК): отдельный текстовый файл, который владелец правит сам; читается на каждый
//     запрос вместе с реестром — правка действует со следующего обращения к модели, без перезапуска. Строка — «имя: …», «тел: …»,
//     «почта: …» или «домен: …» (все адреса домена); «#» — комментарий. Значение из списка уходит в модель как есть, сверка — по
//     нормальной форме (телефон — normTel, почта и домен — без регистра). Строка, которую не разобрать, НЕ пропускается (значение
//     маскируется) и называется в журнале номером; нечитаемый файл — пустой список (маскируется всё), тоже с записью в журнале.
//     Журнал пишется при смене содержимого, а не на каждый запрос.
// EN: Whitelist (owner decision 05.10): a separate text file the owner edits; read per request with the registry — an edit
//     applies from the next model call without a restart. Lines «имя: …», «тел: …», «почта: …», «домен: …»; «#» comments.
//     Listed values reach the model as is, compared in normal form. An unparsable line is NOT whitelisted (masked) and is named
//     in the log; an unreadable file is an empty list (everything masked). Logged on content change, not per request.
let belyjSled = '';
export function prochestBelyjSpisok(put, zapis = () => {}) {
  const b = { imena: new Set(), telefony: new Set(), pochty: new Set(), domeny: new Set() };
  if (!put) return b;
  let tekst;
  try { tekst = fs.readFileSync(put, 'utf8'); }
  catch (e) {
    const sled = 'нечитаем:' + String(e?.code ?? 'ошибка');
    if (sled !== belyjSled) { belyjSled = sled; zapis(`🔴 белый список ${put} не прочитан (${String(e?.code ?? 'ошибка')}) — пропускать нечего, маскируется всё`); }
    return b;
  }
  const propusk = [];
  tekst.split('\n').forEach((stroka, i) => {
    const t = stroka.trim();
    if (!t || t.startsWith('#')) return;
    const m = /^(имя|тел|почта|домен)\s*:\s*(.+)$/u.exec(t);
    if (!m) return void propusk.push(i + 1);
    const v = m[2].trim();
    if (m[1] === 'тел') { const n = normBelyj(v); return void (/^7\d{10}$/.test(n) || /^\+\d[\d\s\-().]*\d$/.test(v) && /^\d{8,15}$/.test(n) ? b.telefony.add(n) : propusk.push(i + 1)); }
    if (m[1] === 'почта') return void (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? b.pochty.add(v.toLowerCase()) : propusk.push(i + 1));
    if (m[1] === 'домен') { const d = v.replace(/^@/, '').toLowerCase(); return void (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? b.domeny.add(d) : propusk.push(i + 1)); }
    return void (v.length >= MIN_IMYA ? b.imena.add(v.toLowerCase()) : propusk.push(i + 1));
  });
  const sled = crypto.createHash('sha256').update(tekst).digest('hex');
  if (sled !== belyjSled) {
    belyjSled = sled;
    zapis(`белый список ${put}: имён ${b.imena.size}, телефонов ${b.telefony.size}, почт ${b.pochty.size}, доменов ${b.domeny.size}` +
      (propusk.length ? `; 🔴 строки ${propusk.join(', ')} не разобраны — НЕ пропускаются` : ''));
  }
  return b;
}
const vBelomPochta = (b, p) => { const l = String(p).toLowerCase(); return b.pochty.has(l) || b.domeny.has(l.slice(l.lastIndexOf('@') + 1)); };

// RU: Реестр читается на каждый запрос: каталог *.json вида {imya, telefony[], pochty[]}. Нечитаемый реестр — исключение (вызывающий отказывает).
// EN: The registry is read per request: a directory of *.json {imya, telefony[], pochty[]}. An unreadable registry throws (the caller refuses).
export function prochestReestr(katalog, belyjFajl, zapis) {
  const belyj = prochestBelyjSpisok(belyjFajl, zapis);
  const imena = [], telefony = [], pochty = [];
  for (const f of fs.readdirSync(katalog).filter(f => f.endsWith('.json')).sort()) {
    const k = JSON.parse(fs.readFileSync(path.join(katalog, f), 'utf8'));
    // RU: Значение из белого списка в реестре гостя не маскируется (список главнее записи гостя).
    // EN: A whitelisted value in a guest record is not masked (the list wins over the guest record).
    if (typeof k.imya === 'string' && k.imya.trim().length >= MIN_IMYA && !belyj.imena.has(k.imya.trim().toLowerCase())) imena.push(k.imya.trim());
    for (const t of k.telefony ?? []) if (cifry(t).length >= 10 && !belyj.telefony.has(normBelyj(t))) telefony.push(String(t));
    for (const p of k.pochty ?? []) if (String(p).includes('@') && !vBelomPochta(belyj, String(p).trim())) pochty.push(String(p).trim());
  }
  // RU: Телефон реестра ищется по цифрам с любыми разделителями между ними.
  // EN: A registry phone is matched by its digits with any separators in between.
  const telReg = telefony.map(t => {
    const c = normal('тел', t).slice(1);
    return new RegExp(`(?:\\+?7|8)?[\\s\\-().]*${c.split('').map(ekran).join('[\\s\\-().]*')}(?!\\d)`, 'g');
  });
  const imyaReg = imena.length ? new RegExp(imena.sort((a, b) => b.length - a.length).map(ekran).join('|'), 'giu') : null;
  const pochtaReg = pochty.length ? new RegExp(pochty.map(ekran).join('|'), 'gi') : null;
  return { imyaReg, pochtaReg, telReg, belyj, gostej: imena.length + telefony.length + pochty.length };
}

// RU: Реестр без гостей: остаются только образцы телефона и почты.
// EN: Registry without guests: only phone and email patterns remain.
export const PUSTOJ_REESTR = { imyaReg: null, pochtaReg: null, telReg: [], belyj: { imena: new Set(), telefony: new Set(), pochty: new Set(), domeny: new Set() }, gostej: 0 };

export function maskirovatTekst(s, r, karta) {
  if (typeof s !== 'string' || !s) return s;
  let t = s;
  if (r.imyaReg) t = t.replace(r.imyaReg, m => zaglushka('имя', m, karta));
  if (r.pochtaReg) t = t.replace(r.pochtaReg, m => zaglushka('почта', m, karta));
  for (const re of r.telReg) t = t.replace(re, m => zaglushka('тел', m.trim(), karta));
  t = t.replace(POCHTA, m => vBelomPochta(r.belyj, m) ? m : zaglushka('почта', m, karta));
  t = t.replace(TELEFON, (m, i, str) => r.belyj.telefony.has(normBelyj(m)) || summa(m, str, i + m.length) ? m : zaglushka('тел', m.trim(), karta));
  t = t.replace(TELEFON_SLITNYJ, (m, i, str) => r.belyj.telefony.has(normBelyj(m)) || summa(m, str, i + m.length) ? m : zaglushka('тел', m, karta));
  return t;
}

export function maskirovatZnachenie(v, r, kluch, karta) {
  if (typeof v === 'string') return NE_TROGAT.has(kluch) ? v : maskirovatTekst(v, r, karta);
  if (Array.isArray(v)) return v.map(x => maskirovatZnachenie(x, r, kluch, karta));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskirovatZnachenie(x, r, k, karta)]));
  return v;
}

// RU: Обратная подстановка только из карты ЭТОГО хода; заглушки других ходов и неизвестные остаются как есть (гость видит заглушку, а не чужое значение).
// EN: Reverse substitution only from THIS turn's map; placeholders of other turns and unknown ones stay as they are (the guest sees a placeholder, not another guest's value).
export function raskrytTekst(s, karta, vJson = false) {
  if (!karta) return String(s);
  return String(s).replace(ZAGLUSHKA, (m, vid, id) => {
    const v = karta.get(id);
    return v === undefined ? m : vJson ? JSON.stringify(v).slice(1, -1) : v;
  });
}

// RU: Раскрыть заглушки во всех строках объекта события (ответ клиенту хоста).
// EN: Reveal placeholders in every string of an event object (host client reply).
export function raskrytZnachenie(v, karta) {
  if (!karta?.size) return v;
  return JSON.parse(raskrytTekst(JSON.stringify(v), karta, true));
}

// RU: Посредник SDK → поставщик: тело JSON маскируется целиком; непарсимое или сжатое тело — отказ 502, наружу не уходит.
// EN: SDK → provider intermediary: the JSON body is masked whole; an unparsable or compressed body is refused with 502 and never forwarded.
export async function podnyatPosrednika({ vverh, reestr, log }) {
  const cel = new URL(vverh);
  const klient = cel.protocol === 'https:' ? https : http;
  const otkaz = (res, prichina) => { log(`🔴 маска ПДн: ${prichina} — запрос к модели НЕ отправлен`); res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'pdn mask refused' } })); };
  const server = http.createServer((req, res) => {
    // RU: Путь /h/<токен хода>/…: токен выбирает карту хода; запрос без открытой карты — отказ, наружу не уходит.
    // EN: Path /h/<turn token>/…: the token selects the turn map; a request without an open map is refused and never forwarded.
    const put = /^\/h\/([0-9a-f]{32})(\/[^?]*)?(\?.*)?$/.exec(req.url ?? '');
    const karta = put && karty.get(put[1]);
    if (!karta) { req.resume(); return otkaz(res, 'запрос без открытой карты хода'); }
    const ostatok = (put[2] ?? '/') + (put[3] ?? '');
    const chasti = [];
    req.on('data', c => chasti.push(c));
    req.on('end', () => {
      let telo = Buffer.concat(chasti);
      if (telo.length) {
        const enc = String(req.headers['content-encoding'] ?? 'identity').toLowerCase();
        if (enc !== 'identity') return otkaz(res, `сжатое тело (${enc.slice(0, 20)})`);
        let r, obj;
        try { r = reestr(); } catch (e) { return otkaz(res, `реестр гостей не прочитан (${String(e?.code ?? e?.name ?? 'ошибка')})`); }
        try { obj = JSON.parse(telo.toString('utf8')); } catch { return otkaz(res, 'тело не JSON'); }
        telo = Buffer.from(JSON.stringify(maskirovatZnachenie(obj, r, '', karta)), 'utf8');
      }
      const zagolovki = { ...req.headers, host: cel.host, 'content-length': String(telo.length) };
      delete zagolovki['transfer-encoding'];
      const baza = cel.pathname.replace(/\/$/, '');
      const vyhod = klient.request({ protocol: cel.protocol, hostname: cel.hostname, port: cel.port || undefined, method: req.method, path: baza + ostatok, headers: zagolovki }, otvet => {
        res.writeHead(otvet.statusCode ?? 502, otvet.headers);
        otvet.pipe(res);
      });
      vyhod.on('error', e => { if (!res.headersSent) otkaz(res, `поставщик недоступен (${String(e?.code ?? 'ошибка')})`); else res.destroy(); });
      vyhod.end(telo);
    });
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  const adres = `http://127.0.0.1:${server.address().port}`;
  // RU: Открыть карту хода: свой адрес для SDK этого хода; zakryt() снимает карту (зовёт шлюз по закрытию ответа).
  // EN: Open a turn map: a dedicated SDK address for this turn; zakryt() drops the map (the gateway calls it when the response closes).
  const otkrytKartu = () => {
    const token = crypto.randomBytes(16).toString('hex'); const karta = new Map(); karty.set(token, karta);
    return { url: `${adres}/h/${token}`, karta, zakryt: () => { karty.delete(token); } };
  };
  return { url: adres, server, otkrytKartu };
}
