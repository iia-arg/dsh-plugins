#!/usr/bin/env node
/**
 * Проверка опоры: у каждой записи памяти есть `istochnik` вида «<сессия>#<от>-<до>» (у дистилляции по окнам — с хвостом «#oknoN»).
 * Инструмент спрашивает у ЖУРНАЛА СЕССИИ, existуют ли эти seq на самом деле.
 *
 * 🔴 ЧТО ЭТОТ ИНСТРУМЕНТ ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ — первым, до всего остального.
 * Он отвечает на вопрос «есть ли у записи свидетель», и НЕ отвечает на вопрос
 * «говорит ли свидетель то же самое». Сверка ТЕКСТА с источником — отдельная работа
 * (Э8.1), и она требует различать дословные записи от пересказов; пересказ с источником
 * не совпадает по построению, и сравнивать их текстами значит красить исправное.
 * Здесь проверяется ТОЛЬКО существование опоры.
 *
 * 🔴 ПОЧЕМУ ЧИТАЕМ ВНЕШНИМ zstd, А НЕ ВСТРОЕННЫМ. Замер 04.09.2026, Node v24.19.0,
 * боевой журнал 7,2 МБ / 9635 кадров:
 *     zlib.zstdDecompressSync(весь файл)  → 126 БАЙТ из 32 306 092, БЕЗ ОШИБКИ
 *     createZstdDecompress через pipeline → падает ZSTD_error_prefix_unknown
 *     /usr/bin/zstd -dc                   → целиком, 0,08 с, 5,9 МБ памяти
 * Первый путь ложно-зелёный: он отдаёт первый кадр и молчит, а инструмент на нём
 * объявил бы «опора утрачена» почти для КАЖДОЙ записи — то есть сам сфабриковал бы
 * ту беду, которую ищет.
 * ⚠️ И покадровая распаковка ПОИСКОМ MAGIC 28B52FFD тоже негодна: последовательность
 * встречается внутри сжатых данных (скан дал 9631 кадр против 9635 у самого zstd,
 * склейка разошлась с эталоном на 205 байт). Маркер — не адрес.
 *
 * КОДЫ: 0 — все опоры на месте · 1 — есть утраченные · 2 — проверить нечем (слепота).
 * Расхождение проверяется РАНЬШЕ слепоты: «нашли потерю» важнее «часть не смотрели».
 */
import { execFileSync } from 'node:child_process';
import { existsSync, accessSync, constants, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
// Файл настройки пакета dsh-pamyat-storozha: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение ключа.
// Путь меняет переменная DSH_PAMYAT_STOROZHA_CONF. Порядок: довод/переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
// EN: Settings file of the dsh-pamyat-storozha package: "KEY=value" lines, a line starting with "#" is a
//     comment; the last occurrence of a key wins.
//     The DSH_PAMYAT_STOROZHA_CONF variable changes the path. Order: argument/variable → file → neutral
//     default; nothing at all — BLINDNESS, code 2.
const KONF = process.env.DSH_PAMYAT_STOROZHA_CONF || '/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf';
// « #» в значении — громкий отказ (код 2), а не склеивание пояснения со значением: комментарий только с начала строки.
// EN: " #" in a value is a loud refusal (code 2), not gluing the note into the value: a comment only from the line start.
const konf = (k) => { let z = ''; try { for (const s of readFileSync(KONF, 'utf8').split('\n')) { const t = s.trim(), i = t.indexOf('='); if (t && !t.startsWith('#') && i > 0 && t.slice(0, i).trim() === k) z = t.slice(i + 1); } } catch {} if (/\s#/.test(z)) { console.log('ОТКАЗ: значение ключа ' + k + ' в ' + KONF + ' содержит « #» — комментарий допускается только с начала строки'); process.exit(2); } return z.trim(); };

const dovody = process.argv.slice(2);
const kontrol = dovody.includes('--kontrol');
const BAZA = dovody.find((d) => d.endsWith('.db')) ?? konf('PAMYAT_BAZA');
const KATALOG_SESSIJ = konf('DSH_SESSII');

function slepota(pochemu) {
  console.log('СЛЕПОТА: ' + pochemu);
  console.log('  Это НЕ «опора утрачена»: первое про нас, второе про данные, и лечатся разным.');
  process.exit(2);
}

// Внешний zstd — предпосылка. Спрашиваем ОДИН раз и до работы: отсутствие инструмента
// это слепота, а не находка.
let zstdEst = false;
try { execFileSync('zstd', ['--version'], { stdio: 'ignore' }); zstdEst = true; } catch { /* ниже */ }
if (!zstdEst) slepota('внешнего zstd нет; встроенный в Node молча отдаёт первый кадр из 9635');
if (!KATALOG_SESSIJ) slepota('каталог сессий агента не задан — ключ DSH_SESSII в ' + KONF);

// 🔴 ДВА ЖУРНАЛА НА СЕССИЮ, И НОМЕРА В НИХ РАЗНЫЕ. DSH 0.2 пишет session.v4.jsonl.zstd; переводя историю из
// старого session.jsonl.zstd, миграция v3→v4 перенумеровывает события плотно и карту старых номеров не хранит
// (README dsh-session-format-v3-to-v4, «Sequence references»). Замер 04.10.2026, telegram-a2a: старый — 222189
// событий, последнее 30.09 00:00:11Z; v4 — 46595, seq 0 с тем же временем. Запись, сделанная до перехода,
// ссылается на СТАРЫЕ номера, и сверять её с v4 значит сверять с чужими событиями. Поэтому журнал выбирается
// по времени записи: не позже последнего события старого журнала — старый, позже — v4. Есть только один — он.
// Каждый журнал читается ОДИН раз за проход: журнал живой, и обход, распаковывающий на каждую запись, мерил бы
// каждую по своему журналу.
const zhurnaly = new Map();
function prochitat(put) {
  if (zhurnaly.has(put)) return zhurnaly.get(put);
  let tekst = null;
  if (existsSync(put)) {
    try { tekst = execFileSync('zstd', ['-dc', put], { maxBuffer: 1 << 30, encoding: 'utf8' }); } catch { tekst = null; }
  }
  if (tekst === null) { zhurnaly.set(put, null); return null; }
  const seqs = new Set(); let posled = -Infinity;
  for (const stroka of tekst.split('\n')) {
    if (!stroka) continue;
    try {
      const d = JSON.parse(stroka);
      if (typeof d.seq === 'number') { seqs.add(d.seq); if (typeof d.time === 'number' && d.time > posled) posled = d.time; }
    } catch { /* строка не наша */ }
  }
  const z = { seqs, posled };
  zhurnaly.set(put, z);
  return z;
}
/** Журнал для записи: { seqs, kakoj } или { pochemu }. sozdano — время записи, мс. */
function zhurnalDlya(sessiya, sozdano) {
  const v4 = prochitat(`${KATALOG_SESSIJ}/${sessiya}/session.v4.jsonl.zstd`);
  const star = prochitat(`${KATALOG_SESSIJ}/${sessiya}/session.jsonl.zstd`);
  if (v4 && star) {
    if (typeof sozdano !== 'number') return { pochemu: `у записи нет времени — журнал сессии «${sessiya}» (старый или v4) не выбрать` };
    return sozdano <= star.posled ? { seqs: star.seqs, kakoj: 'старый (запись до перехода на v4)' } : { seqs: v4.seqs, kakoj: 'v4' };
  }
  if (v4) return { seqs: v4.seqs, kakoj: 'v4' };
  if (star) return { seqs: star.seqs, kakoj: 'старый (v4 нет)' };
  return { pochemu: `журнал сессии «${sessiya}» не прочитан (нет ни v4, ни старого)` };
}

// Форма — та, что пишет секретарь: «сессия#от-до» с хвостом «#oknoN» у дистилляции по окнам (distill-shov.js:83 и
// :289; хвост — номер окна, диапазон — весь срез, при сверке он не участвует) и «сессия#N» у сводки компакции из
// одного события (razbor-sobytiya.js:66: «-до» пишется, только когда первый и последний seq разные).
function razobrat(istochnik) {
  const m = /^(.+)#(\d+)(?:-(\d+))?(?:#okno\d+)?$/.exec(istochnik ?? '');
  return m ? { sessiya: m[1], ot: Number(m[2]), do: Number(m[3] ?? m[2]) } : null;
}
// Источник, не разобранный как срез, примеряется к трём свидетелям вне журнала сессии; не подошёл ни один —
// «негодная форма» (расхождение, код 1): неизвестная форма не бывает «есть».
//   урок «путь:заголовок [N]» — dsh-pamyat-obsluzhivanie src/lessons.py:197; свидетель — заголовок «### …» в файле
//     уроков вне ограды кода, повторённый не меньше N раз (правило разбора — lessons.py:161–169);
//   файл + sha256 (ручная запись, A-H-040) — свидетель: файл, чья сумма начинается с указанной;
//   SDK-журнал Claude «SDK: путь.jsonl#uuid» — свидетель: строка журнала с этим uuid.
// Файла нет (ENOENT) — опора утрачена: это про данные. Не прочитался иначе — проверить нечем: это про нас.
// Каждый файл читается один раз за проход, как и журнал сессии.
const fajly = new Map();
function fajl(put) {
  if (!fajly.has(put)) {
    try { fajly.set(put, { buf: readFileSync(put) }); }
    catch (e) { fajly.set(put, e.code === 'ENOENT' ? { net: true } : { oshibka: e.code ?? e.message }); }
  }
  return fajly.get(put);
}
const razobrannoe = new Map();
function zagolovkiUrokov(put, buf) {
  if (!razobrannoe.has(put)) {
    const c = new Map(); let ograda = null;
    for (const stroka of buf.toString('utf8').split(/(?<=\n)/)) {
      const s = stroka.trimStart();
      if (s.startsWith('```') || s.startsWith('~~~')) { const m = s.slice(0, 3); ograda = ograda === m ? null : (ograda ?? m); }
      else if (ograda === null && stroka.startsWith('### ')) { const h = stroka.slice(4).trim().normalize('NFC'); c.set(h, (c.get(h) ?? 0) + 1); }
    }
    razobrannoe.set(put, c);
  }
  return razobrannoe.get(put);
}
function uuidyJsonl(put, buf) {
  if (!razobrannoe.has(put)) {
    const u = new Set();
    for (const stroka of buf.toString('utf8').split('\n')) {
      if (!stroka) continue;
      try { const d = JSON.parse(stroka); if (typeof d.uuid === 'string') u.add(d.uuid); } catch { /* строка не наша */ }
    }
    razobrannoe.set(put, u);
  }
  return razobrannoe.get(put);
}
/** Свидетель вне журнала сессии: { kakoj, est, pochemu } | { nechem } | null — форма не опознана. */
function svidetel(ist) {
  let m;
  if ((m = /^(\/[^:]+\.md):(.+) \[(\d+)\]$/.exec(ist))) {
    const [, put, zag, n] = m; const f = fajl(put); const kakoj = 'файл уроков';
    if (f.net) return { kakoj, est: false, pochemu: `файла уроков ${put} нет` };
    if (f.oshibka) return { nechem: `файл уроков ${put} не прочитан (${f.oshibka})` };
    const est = zagolovkiUrokov(put, f.buf).get(zag.normalize('NFC')) ?? 0;
    return est >= Number(n) ? { kakoj, est: true } : { kakoj, est: false, pochemu: `заголовок «${zag}» в файле ${est} раз, нужно не меньше ${n}` };
  }
  if ((m = /^(\/\S+) sha256:([0-9a-f]{8,64})(?:\s|$)/.exec(ist))) {
    const [, put, sha] = m; const f = fajl(put); const kakoj = 'файл + sha256';
    if (f.net) return { kakoj, est: false, pochemu: `файла ${put} нет` };
    if (f.oshibka) return { nechem: `файл ${put} не прочитан (${f.oshibka})` };
    const fakt = createHash('sha256').update(f.buf).digest('hex');
    return fakt.startsWith(sha) ? { kakoj, est: true } : { kakoj, est: false, pochemu: `сумма файла ${fakt.slice(0, 16)}, в источнике ${sha}` };
  }
  if ((m = /^SDK: (\/\S+?\.jsonl)#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s|$)/.exec(ist))) {
    const [, put, uuid] = m; const f = fajl(put); const kakoj = 'SDK-журнал Claude';
    if (f.net) return { kakoj, est: false, pochemu: `журнала ${put} нет` };
    if (f.oshibka) return { nechem: `журнал ${put} не прочитан (${f.oshibka})` };
    return uuidyJsonl(put, f.buf).has(uuid) ? { kakoj, est: true } : { kakoj, est: false, pochemu: `строки с uuid ${uuid} в журнале нет` };
  }
  return null;
}
// Не подошёл ни один свидетель: часть до «#» — каталог существующей сессии — значит, форму среза испортили;
// иначе форма просто неизвестна. Оба — «негодная форма», различие только в словах причины.
function sessiyaLi(istochnik) {
  const i = istochnik.indexOf('#');
  if (i <= 0) return false;
  const imya = istochnik.slice(0, i);
  return !imya.includes('/') && existsSync(`${KATALOG_SESSIJ}/${imya}`);
}

function proverit(zapisi) {
  const itog = { sошлось: 0, utracheno: [], nechem: [], bez_istochnika: 0, forma: [], est_id: [], utracheno_id: [], po_zhurnalu: {}, chem: new Map() };
  for (const z of zapisi) {
    if (!z.istochnik) { itog.bez_istochnika++; continue; }
    const r = razobrat(z.istochnik);
    if (!r) {
      const sv = svidetel(z.istochnik);
      if (!sv) {
        itog.forma.push(`#${z.id}: «${z.istochnik}» — ` + (sessiyaLi(z.istochnik)
          ? 'ссылка на сессию, но не форма «сессия#от[-до][#oknoN]»' : 'неизвестная форма источника'));
        continue;
      }
      if (sv.nechem) { itog.nechem.push(`#${z.id}: ${sv.nechem}`); continue; }
      itog.po_zhurnalu[sv.kakoj] = (itog.po_zhurnalu[sv.kakoj] ?? 0) + 1;
      itog.chem.set(z.id, `proverka-opory.mjs/${sv.kakoj}`);
      if (sv.est) { itog.sошлось++; itog.est_id.push(z.id); }
      else { itog.utracheno.push(`#${z.id} ${z.klass} ${z.istochnik}: ${sv.pochemu}`); itog.utracheno_id.push(z.id); }
      continue;
    }
    const zh = zhurnalDlya(r.sessiya, z.sozdano);
    if (!zh.seqs) { itog.nechem.push(`#${z.id}: ${zh.pochemu}`); continue; }
    const seqs = zh.seqs;
    itog.po_zhurnalu[zh.kakoj] = (itog.po_zhurnalu[zh.kakoj] ?? 0) + 1;
    let net = 0;
    for (let s = r.ot; s <= r.do; s++) if (!seqs.has(s)) net++;
    if (net === 0) { itog.sошлось++; itog.est_id.push(z.id); }
    else {
      itog.utracheno.push(`#${z.id} ${z.klass} ${z.istochnik}: нет ${net} seq из ${r.do - r.ot + 1}`);
      itog.utracheno_id.push(z.id);
    }
  }
  return itog;
}

if (kontrol) {
  // 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ ВСТРОЕН КЛЮЧОМ, А НЕ СДЕЛАН ОДНАЖДЫ РУКОЙ: разовая проверка
  // живёт в отчёте, встроенная переживает правку чужой рукой.
  // Три случая, и они ОБЯЗАНЫ дать разные ответы — иначе прибор различает не то.
  const sessiya = 'telegram-a2a';
  const sejchas = Date.now();
  const seqs = zhurnalDlya(sessiya, sejchas).seqs;
  if (!seqs) slepota(`журнал сессии «${sessiya}» не прочитан — контроль провести не на чем`);
  let max = -Infinity;
  for (const seq of seqs) if (seq > max) max = seq;
  const podstavnye = [
    { id: 'K1', klass: 'проба', istochnik: `${sessiya}#0-10`,                    sozdano: sejchas, zhdem: 'сошлось' },
    { id: 'K2', klass: 'проба', istochnik: `${sessiya}#${max + 5000}-${max + 5010}`, sozdano: sejchas, zhdem: 'утрачено' },
    { id: 'K3', klass: 'проба', istochnik: 'такой-сессии-нет#1-2',              sozdano: sejchas, zhdem: 'нечем' },
  ];
  const r = proverit(podstavnye);
  const bedy = [];
  if (r.sошлось !== 1) bedy.push(`здоровая опора: ждали 1 «сошлось», получили ${r.sошлось}`);
  if (r.utracheno.length !== 1) bedy.push(`заведомо утраченная: ждали 1, получили ${r.utracheno.length}`);
  if (r.nechem.length !== 1) bedy.push(`нечитаемая сессия: ждали 1 «нечем», получили ${r.nechem.length}`);
  if (bedy.length) { console.log('🔴 контроль зрячести НЕ ПРОЙДЕН: ' + bedy.join('; ')); process.exit(1); }
  console.log('контроль зрячести: ПРОЙДЕН — здоровая опора, заведомо утраченная и нечитаемая сессия дали ТРИ РАЗНЫХ ответа');
  process.exit(0);
}

// 🔴 «НЕТ» И «НЕ МОГУ ПРОЧИТАТЬ» — РАЗНЫЕ ОТВЕТЫ, И existsSync ИХ НЕ РАЗЛИЧАЕТ.
// Найдено прогоном по ЧУЖОМУ предмету 04.09.2026: на базе соседа инструмент сказал
// «базы нет», хотя база есть и он её читает своей рукой — не пускал каталог ВЫШЕ
// по цепочке (0750 у чужого дома). Отказ называл последний путь, а причина лежала выше.
// Проходим цепочку и называем ПЕРВОЕ закрытое звено: чинить надо его, а не последнее.
if (!BAZA) slepota('база памяти не задана — довод *.db или ключ PAMYAT_BAZA в ' + KONF);
if (!existsSync(BAZA)) {
  const zvenya = [];
  const chasti = BAZA.split('/').filter(Boolean);
  let put = '';
  for (const ch of chasti) {
    put += '/' + ch;
    try { accessSync(put, constants.F_OK); }
    catch (e) {
      if (e.code === 'EACCES') zvenya.push(`${put} — прохода нет (EACCES)`);
      else zvenya.push(`${put} — не существует`);
      break;
    }
  }
  slepota(`базу ${BAZA} прочитать не удалось. Первое закрытое звено цепочки: ` +
          (zvenya[0] ?? 'цепочка пройдена целиком, но файл не открылся'));
}
const db = new DatabaseSync(BAZA, { readOnly: true });
const zapisi = db.prepare('SELECT id, klass, istochnik, sozdano FROM zapisi ORDER BY id').all();
const r = proverit(zapisi);

console.log(`обход: база ${BAZA}, записей ${zapisi.length}; журналы сессий из ${KATALOG_SESSIJ}`);
console.log(`  опора на месте:      ${r.sошлось}`);
console.log(`  опора УТРАЧЕНА:      ${r.utracheno.length}`);
console.log(`  проверить нечем:     ${r.nechem.length}`);
console.log(`  без istochnik:       ${r.bez_istochnika} (это законно: ручная запись свидетеля не имеет)`);
if (r.forma.length) console.log(`  негодная форма:      ${r.forma.length}`);
// 🔴 ПОКРЫТИЕ — ЧИСЛОМ СО ЗНАМЕНАТЕЛЕМ. «На месте 301» без «из скольких» читается как «всё на месте», а
// 04.10.2026 прибор молча не трогал 5190 записей из 5492 (4887 — новой формы «#oknoN»). Части обязаны
// сложиться во все записи; не сложились — прибор считает не то, и это слепота ДО всякой записи в базу.
const proveryeno = r.sошлось + r.utracheno.length;
const vne = r.nechem.length + r.bez_istochnika + r.forma.length;
console.log(`покрытие: проверено ${proveryeno} из ${zapisi.length}; вне проверки ${vne}: проверить нечем ${r.nechem.length}, без istochnik ${r.bez_istochnika}, негодная форма ${r.forma.length}`);
console.log('  сверено по свидетелю: ' + (Object.entries(r.po_zhurnalu).map(([k, n]) => `${k} — ${n}`).join('; ') || 'ни по одному'));
if (proveryeno + vne !== zapisi.length) slepota(`счёт не сходится: проверено ${proveryeno} + вне проверки ${vne} ≠ записей ${zapisi.length}`);
for (const s of [...r.utracheno, ...r.forma, ...r.nechem]) console.log('    ' + s);
console.log('границы: проверено СУЩЕСТВОВАНИЕ опоры, НЕ совпадение текста с ней;');
console.log('         журнал распакован по одному разу на сессию внешним zstd.');

// ═══ ОТМЕТКА В БАЗУ — ТОЛЬКО ПО ЯВНОМУ КЛЮЧУ ═══
//
// 🔴 ПО УМОЛЧАНИЮ ПРИБОР НЕ ПИШЕТ. Прибор, который правит базу при каждом запуске, однажды
// запишется по расписанию, пока никто не смотрит, — и объявит опору утраченной там, где
// сам не смог прочитать журнал. Запись включается ключом --zapisat, а до тех пор прибор
// говорит числами и оставляет решение человеку.
//
// 🔴 ПИШЕМ ТОЛЬКО ДВА ИСХОДА. «Проверить нечем» (слепота) в базу НЕ ложится вовсе:
// отсутствие отметки и означает «не проверялось», а записать туда слепоту значило бы
// выдать отказ ИНСТРУМЕНТА за суждение о ПРЕДМЕТЕ. Это ровно тот случай, ради которого
// у поля три состояния, а не два.
//
// ГДЕ НЕ ПРИМЕНЯЕТСЯ: прибор не трогает записи без istochnik и с негодной формой — про них
// он ничего не выяснил, и отметка была бы выдумкой.
if (process.argv.includes('--zapisat')) {
  // RU: Ядро берётся из того же ключа PAMYAT_CORE, что у стенда и соседних модулей: второй ключ
  //     под тот же предмет однажды разошёлся с первым, и ветка записи умерла, пока стенд был зелёным.
  //     Нет файла ядра — названная СЛЕПОТА (код 2), а не трассировка импорта.
  // EN: The core comes from the same PAMYAT_CORE key the test and sibling modules use: a second key
  //     for the same subject once drifted from the first, and the write branch died while the test stayed green.
  //     A missing core file is a named BLINDNESS (exit 2), not an import stack trace.
  const CORE = konf('PAMYAT_CORE').replace(/\/$/, '');
  if (!CORE) slepota('путь ядра памяти для --zapisat не задан — ключ PAMYAT_CORE в ' + KONF);
  const HRAN = CORE + '/src/hranilishche.js';
  if (!existsSync(HRAN)) slepota('ядра памяти для --zapisat нет: ' + HRAN + ' (ключ PAMYAT_CORE в ' + KONF + ')');
  const { otkrytHranilishche } = await import(HRAN);
  const h = otkrytHranilishche(BAZA);
  const chem = (id) => r.chem.get(id) ?? 'proverka-opory.mjs/внешний zstd';
  let leglo = 0, ne_leglo = 0;
  try {
    for (const id of r.est_id) (h.otmetitProverku({ id, ishod: 'est', chem: chem(id) }) ? leglo++ : ne_leglo++);
    for (const id of r.utracheno_id) (h.otmetitProverku({ id, ishod: 'utrachena', chem: chem(id) }) ? leglo++ : ne_leglo++);
  } finally { h.zakryt(); }
  console.log(`отметки в базе: легло ${leglo}, не легло ${ne_leglo} (записи с таким номером не нашлось)`);
  console.log(`  слепота (${r.nechem.length}) в базу НЕ писалась: отказ прибора — не суждение о предмете`);
} else {
  console.log('запись отметок ВЫКЛЮЧЕНА (нет --zapisat): прибор только смотрит.');
}

// Расхождение раньше слепоты.
if (r.utracheno.length || r.forma.length) process.exit(1);
if (r.nechem.length) process.exit(2);
process.exit(0);
