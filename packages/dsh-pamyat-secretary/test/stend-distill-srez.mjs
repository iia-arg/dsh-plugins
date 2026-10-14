// RU: Проверяем /distill-srez через настоящий parseCommand платформы из DSH_TEST_APP и файл session.v4.jsonl.zstd во временном DSH_HOME. Заход подставной и записывает вызовы; модель не вызывается. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test /distill-srez through the real platform parseCommand from DSH_TEST_APP and a session.v4.jsonl.zstd file in temporary DSH_HOME. The fake run records calls; no model is invoked. Codes: 0 success, 1 mismatch, 2 unobservable.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
const APP = process.env.DSH_TEST_APP ?? process.env.STEND_APP;
if (!APP) { console.log('СЛЕПОТА: задайте DSH_TEST_APP или STEND_APP — SDK-путь не назван'); process.exit(2); }
const KOM = join(APP, 'node_modules/@deepseek-ai/dsh-commands/lib/index.js');
if (!existsSync(KOM)) { console.log('СЛЕПОТА: нет платформы (DSH_TEST_APP) — разбор команды взять неоткуда'); process.exit(2); }
const { parseCommand } = await import(KOM);
let mod, app;
try { mod = await import('../src/distill-srez.js'); app = await import('../src/index.js'); }
catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
const T = mkdtempSync(join(tmpdir(), 'stend-distill-srez-')); process.on('exit', () => rmSync(T, { recursive: true, force: true }));
let vsego = 0, proshlo = 0;
const proba = (imya, u, p) => { vsego++; if (u) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (p ? ' — ' + String(p).slice(0, 200) : '')); };
// RU: Журнал содержит 10 реплик, compaction/start seq 10 и compaction/summary seq 11; затенены seq 0–5.
// EN: The journal contains 10 utterances, compaction/start seq 10, and compaction/summary seq 11; seq 0–5 are shadowed.
const sob = Array.from({ length: 10 }, (_, i) => ({ seq: i, type: i % 2 ? 'assistant/message' : 'user/message', data: { content: 'реплика про замер номер ' + i + ' с длинными словами' } }));
sob.push({ seq: 10, type: 'compaction/start', data: { compactionId: 'c1', turn: 1 } });
sob.push({ seq: 11, type: 'compaction/summary', data: { compactionId: 'c1', shadowedSeqs: [0, 1, 2, 3, 4, 5], shadowedTokenCount: 900, summary: [] } });
const dom = join(T, 'dsh'); mkdirSync(join(dom, 'sessions', '--w--', 'sess-A'), { recursive: true });
// RU: Заголовок и каждое событие находятся в отдельных кадрах zstd, как в многокадровом журнале платформы.
// EN: The header and each event occupy separate zstd frames, matching the platform’s multi-frame journal.
const kadr = (s) => zstdCompressSync(Buffer.from(s + '\n'));
writeFileSync(join(dom, 'sessions', '--w--', 'sess-A', 'session.v4.jsonl.zstd'), Buffer.concat([kadr(JSON.stringify({ id: 'sess-A', version: 4 })), ...sob.map((e) => kadr(JSON.stringify(e)))]));
const zh = mod.chitatZhurnalSessii(dom, 'sess-A');
proba('журнал с диска: многокадровый v4 прочитан ЦЕЛИКОМ — 12 событий из 13 кадров', !zh.otkaz && zh.sobytiya.length === 12, JSON.stringify(zh).slice(0, 120));
proba('чужой сессии нет → отказ, не пустой список', !!mod.chitatZhurnalSessii(dom, 'net-takoj').otkaz);
const ZAHODY = ['[dsh-pamyat-secretary 0.1.0-alpha.90 2026-09-29T11:47:37.098Z] расход захода: вызовов 88, вход 455571, выход 299177, кеш чтение 8459136, кеш запись 0 — токенами',
  '[dsh-pamyat-secretary 0.1.0-alpha.92 2026-09-29T18:12:24.719Z] расход захода: вызовов 1, вход 115309, выход 32000, кеш чтение 512, кеш запись 0 — токенами',
  '[dsh-pamyat-secretary 0.1.0-alpha.92 2026-09-29T20:39:35.513Z] расход захода: вызовов 52, вход 296698, выход 191921, кеш чтение 3847552, кеш запись 0 — токенами',
  'посторонняя строка про расход захода без чисел', ''];
const zahodyOk = () => Promise.resolve({ stroki: ZAHODY, istochnik: 'журнал x.service' });
function stend({ yadro = {}, zapisano = [], zhiva = false, vykl = null, proshlye = zahodyOk, putOtkl = join(T, 'net-zadanij'), padaet = false, itogZahoda = { ishod: 'ok', zapisano: 3 }, schet = true } = {}) {
  const kriki = [], vyzovy = [];
  const pm = { zamaskirovatVhod: (t) => ({ tekst: t }), poIstochniku: (ist) => zapisano.filter((z) => z === ist).map((z, i) => ({ id: i })), ...yadro };
  const h = mod.sozdatDistillSrez({ config: { predelTem: 0, maxTokenovTem: 32000, hvost: 'vse', putOtklonennyh: putOtkl }, krik: (s) => kriki.push(s), pm: () => pm,
    zapustit: (s, d) => { vyzovy.push({ id: s.id, n: s.snapshotEvents().length, c: d.compactionId });
      return padaet ? Promise.reject(new Error('сеть')) : Promise.resolve(itogZahoda); },
    chitat: (s) => mod.chitatZhurnalSessii(dom, s), vyklyuchena: () => vykl, metkaZhiva: () => zhiva, proshlye,
    zapisanoSreza: schet ? (srez) => zapisano.filter((z) => z.startsWith(srez + '#okno')).length : null });
  const pozvat = (stroka) => h(Object.freeze({ commandId: 'c', agent: { session: { id: 'web' } }, rawInput: parseCommand(stroka).rawInput, attachments: [], signal: new AbortController().signal }));
  return { pozvat, kriki, vyzovy };
}
const tik = () => new Promise((r) => setTimeout(r, 20));
let s = stend(); let r = await s.pozvat('/distill-srez sess-A 11');
proba('без «da» — только ЦЕНА: success, знаки и токены названы, заход НЕ позван', r.kind === 'success' && /ЦЕНА до запуска/.test(r.text) && /ток\. входа НА КАЖДЫЙ вызов/.test(r.text) && s.vyzovy.length === 0, r.text);
r = await s.pozvat('/distill-srez sess-A 11 da'); await tik();
proba('после цены «da» — запуск: заход позван РОВНО раз, со срезом этой сессии и данными сжатия', r.kind === 'success' && /НАЧАТ/.test(r.text) && s.vyzovy.length === 1 && s.vyzovy[0].id === 'sess-A' && s.vyzovy[0].n === 12 && s.vyzovy[0].c === 'c1', JSON.stringify(s.vyzovy));
r = await s.pozvat('/distill-srez sess-A 11 da'); await tik();
proba('(3) повторное «da» без новой цены — отказ, второго запуска нет', r.kind === 'error' && /цена не названа/.test(r.text) && s.vyzovy.length === 1, r.text);
s = stend(); r = await s.pozvat('/distill-srez sess-A 11 da');
proba('(3) «da» без названной цены — отказ, заход не позван', r.kind === 'error' && /цена не названа/.test(r.text) && s.vyzovy.length === 0, r.text);
s = stend({ zapisano: ['sess-A#0-5#okno1'] }); r = await s.pozvat('/distill-srez sess-A 11');
proba('(1) срез уже разобран (в памяти есть записи его источника) — отказ «уже разобран» уже на цене', r.kind === 'error' && /уже разобран/.test(r.text) && s.vyzovy.length === 0, r.text);
s = stend({ yadro: { zamaskirovatVhod: undefined } }); r = await s.pozvat('/distill-srez sess-A 11');
proba('(2) маски ядра нет — отказ, сырой вход не подаётся', r.kind === 'error' && /маски ядра нет/.test(r.text), r.text);
s = stend({ yadro: { poIstochniku: undefined } }); r = await s.pozvat('/distill-srez sess-A 11');
proba('ядро без poIstochniku — отказ (дубль не исключить)', r.kind === 'error' && /poIstochniku/.test(r.text), r.text);
s = stend(); r = await s.pozvat('/distill-srez sess-A 11 go');
proba('неизвестное слово вместо «da» — отказ формата', r.kind === 'error' && /Формат/.test(r.text), r.text);
r = await s.pozvat('/distill-srez sess-A 11 12');
proba('(3) два среза в одном вызове — отказ формата', r.kind === 'error' && /Формат/.test(r.text), r.text);
r = await s.pozvat('/distill-srez sess-A 10');
proba('seq не compaction/summary — отказ', r.kind === 'error' && /нет compaction\/summary с seq 10/.test(r.text), r.text);
s = stend({ zhiva: true }); r = await s.pozvat('/distill-srez sess-A 11');
proba('живая метка другого разбора — отказ', r.kind === 'error' && /идёт другой разбор/.test(r.text), r.text);
s = stend({ vykl: 'выключена файлом /x' }); r = await s.pozvat('/distill-srez sess-A 11');
proba('дистилляция выключена — отказ с причиной', r.kind === 'error' && /выключена файлом/.test(r.text), r.text);
proba('каждый отказ — строка секретаря в журнале', s.kriki.some((k) => k.startsWith('команда /distill-srez: ОТКАЗ')), s.kriki.join(' | '));
// RU: apply регистрирует команду при distillyaciya=true и не регистрирует при false.
// EN: apply registers the command when distillyaciya=true and omits it when false.
function reg(distillyaciya) {
  const imena = []; const bylo = console.error; console.error = () => {};
  try { app.apply({ pamyat: {}, logger: { info() {}, warn() {} }, on: () => () => {}, get: () => undefined,
    plugin: (fn) => fn({ get: (i) => (i === 'commands' ? { register: (d) => imena.push(d.name) } : undefined) }) },
    { klass: 'svodka-kompakcii', distillyaciya, putOtklonennyh: join(T, 'otkl'), hodovojZov: { vkl: false } }); } catch (e) { imena.push('ИСКЛЮЧЕНИЕ ' + e.message); }
  finally { console.error = bylo; }
  return imena;
}
const s1 = reg(true), s0 = reg(false);
// RU: Проверяем масштаб по прошлым полным заходам из журнала службы.
// EN: Test scope using previous complete runs from the service journal.
const sv = mod.svodkaZahodov(ZAHODY);
proba('масштаб: полных 2 (вызовов ≥2), неполный 1 (вызовов 1), посторонние строки не считаются', sv.polnye.length === 2 && sv.nepolnye.length === 1, JSON.stringify(sv));
s = stend(); r = await s.pozvat('/distill-srez sess-A 11');
proba('масштаб в цене: диапазоны по полным заходам, неполный назван отдельно', r.kind === 'success'
  && r.text.includes('прошлые полные заходы этого агента (журнал x.service, 2 шт., 2026-09-29…2026-09-29): вызовов 52–88, вход 296698–455571, выход 191921–299177, кеш чтение 3847552–8459136; неполных (вызовов < 2 — сорвавшийся выбор тем) 1'), r.text);
s = stend({ proshlye: () => Promise.resolve({ otkaz: 'нет прав' }) }); r = await s.pozvat('/distill-srez sess-A 11');
proba('журнал не прочитан — цена всё равно названа, масштаб «НЕ прочитаны — причина»', r.kind === 'success' && /ЦЕНА до запуска/.test(r.text) && r.text.includes('НЕ прочитаны — нет прав'), r.text);
s = stend({ proshlye: () => { throw new Error('упал'); } }); r = await s.pozvat('/distill-srez sess-A 11');
proba('чтение журнала бросило — цена названа, масштаб «НЕ прочитаны»', r.kind === 'success' && r.text.includes('НЕ прочитаны — упал'), r.text);
// RU: Настоящий chitatProshlyeZahody читает подставные cgroup и команду вместо journalctl.
// EN: The real chitatProshlyeZahody reads a fake cgroup and command replacing journalctl.
const cg = join(T, 'cgroup'); writeFileSync(cg, '0::/system.slice/proba.service\n');
const kom = (imya, telo) => { const f = join(T, imya); writeFileSync(f, '#!/bin/sh\n' + telo + '\n', { mode: 0o755 }); return f; };
let pz = await mod.chitatProshlyeZahody({ cgroup: cg, komanda: kom('j-ok', 'echo "$2|$6"; printf "%s\\n" "' + ZAHODY[0].replace(/"/g, '') + '"') });
proba('чтение: юнит из cgroup, строки взяты', !pz.otkaz && pz.istochnik === 'журнал proba.service' && pz.stroki[0] === 'proba.service|-g' && mod.svodkaZahodov(pz.stroki).polnye.length === 1, JSON.stringify(pz));
pz = await mod.chitatProshlyeZahody({ cgroup: cg, komanda: kom('j-pusto', 'exit 1') });
proba('чтение: rc 1 без вывода — «совпадений нет», не отказ', !pz.otkaz && mod.svodkaZahodov(pz.stroki).polnye.length === 0, JSON.stringify(pz));
pz = await mod.chitatProshlyeZahody({ cgroup: cg, komanda: kom('j-prava', 'echo "No journal files were opened due to insufficient permissions." >&2; exit 0') });
proba('чтение: текст в stderr (нет прав) — ОТКАЗ, не ноль', !!pz.otkaz && /insufficient permissions/.test(pz.otkaz), JSON.stringify(pz));
writeFileSync(cg, '0::/user.slice/user-986.slice/session-1.scope\n');
pz = await mod.chitatProshlyeZahody({ cgroup: cg, komanda: kom('j-ok2', 'exit 0') });
proba('чтение: процесс не в .service — отказ', !!pz.otkaz && /не в юните/.test(pz.otkaz), JSON.stringify(pz));
// RU: Проверяем закрытие zadanie-prervan-* для этого среза.
// EN: Test closing zadanie-prervan-* for this slice.
const KAT = join(T, 'zadaniya'); mkdirSync(KAT, { recursive: true });
const zad = (imya, srez) => writeFileSync(join(KAT, imya), JSON.stringify({ chto: 'povtorit-distillyaciyu-po-srezu', srez, pid: 7 }));
const fajly = () => readdirSync(KAT).sort();
{ /* RU: При неизвестном числе тем задание этого среза не закрывается и даёт НЕ ИЗВЕСТНО; чужие и повреждённые задания сохраняются.
 * EN: With an unknown topic count, keep this slice’s task open and report НЕ ИЗВЕСТНО; unrelated and corrupt tasks remain untouched.
 */
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT);
  zad('zadanie-prervan-1-7.txt', 'sess-A#0-5'); zad('zadanie-prervan-2-8.txt', 'sess-B#0-5'); writeFileSync(join(KAT, 'zadanie-prervan-3-9.txt'), '{битый');
  const st = stend({ zapisano: ['sess-A#0-5#okno1'], putOtkl: KAT }); const r2 = await st.pozvat('/distill-srez sess-A 11');
  const f = fajly();
  proba('(б′) integration-note: срез с записями, но заход прерван и число тем НЕ сохранено — задание НЕ закрыто, отказ «НЕ ИЗВЕСТНО», чужое и битое не тронуты',
    r2.kind === 'error' && /НЕ ИЗВЕСТНО/.test(r2.text) && /Задание НЕ закрыто/.test(r2.text) && f.includes('zadanie-prervan-1-7.txt') && f.includes('zadanie-prervan-2-8.txt') && f.includes('zadanie-prervan-3-9.txt') && !f.some((x) => x.startsWith('zadanie-zakryto-')), r2.text + ' | ' + JSON.stringify(f));
}
const zadT = (imya, srez, t) => writeFileSync(join(KAT, imya), JSON.stringify({ chto: 'povtorit-distillyaciyu-po-srezu', srez, pid: 7, temy_po_oknam: t }));
{ /* RU: Частичный разбор: записаны две темы из пяти, задание остаётся открытым.
 * EN: Partial processing: two of five topics were written, so keep the task open.
 */
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zadT('zadanie-prervan-1-7.txt', 'sess-A#0-5', { 1: 5 });
  const st = stend({ zapisano: ['sess-A#0-5#okno1', 'sess-A#0-5#okno1'], putOtkl: KAT }); const r2 = await st.pozvat('/distill-srez sess-A 11');
  proba('integration-note: ЧАСТИЧНЫЙ разбор (записано 2 из 5 тем) — отказ «частично: записано 2 из 5», задание ЖИВО, zakryto нет',
    r2.kind === 'error' && /частично: записано 2 из 5 тем/.test(r2.text) && fajly().includes('zadanie-prervan-1-7.txt') && !fajly().some((x) => x.startsWith('zadanie-zakryto-')), r2.text);
}
{ /* RU: Полный разбор: три темы из трёх в двух окнах 2+1 означают «уже разобран» и закрывают задание.
 * EN: Complete processing: three of three topics across two windows, 2+1, means already processed and closes the task.
 */
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zadT('zadanie-prervan-1-7.txt', 'sess-A#0-5', { 1: 2, 2: 1 });
  const st = stend({ zapisano: ['sess-A#0-5#okno1', 'sess-A#0-5#okno1', 'sess-A#0-5#okno2'], putOtkl: KAT }); const r2 = await st.pozvat('/distill-srez sess-A 11');
  const f = fajly(); const z = f.includes('zadanie-zakryto-1-7.txt') ? JSON.parse(readFileSync(join(KAT, 'zadanie-zakryto-1-7.txt'), 'utf8')) : null;
  proba('integration-note: ПОЛНЫЙ разбор (записано 3 из 3 по двум окнам) — «уже разобран», задание своего среза ЗАКРЫТО',
    r2.kind === 'error' && /уже разобран/.test(r2.text) && z?.zakryto?.prichina?.startsWith('уже разобран') && !f.includes('zadanie-prervan-1-7.txt'), r2.text + ' | ' + JSON.stringify(f));
}
{ /* RU: Без счёта записанного задание не закрывается.
 * EN: Without a write count, do not close the task.
 */
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zadT('zadanie-prervan-1-7.txt', 'sess-A#0-5', { 1: 3 });
  const st = stend({ zapisano: ['sess-A#0-5#okno1'], putOtkl: KAT, schet: false }); const r2 = await st.pozvat('/distill-srez sess-A 11');
  proba('integration-note: счёт записанного не передан — задание НЕ закрыто, отказ «записано — НЕ ИЗВЕСТНО»',
    r2.kind === 'error' && /записано — НЕ ИЗВЕСТНО/.test(r2.text) && fajly().includes('zadanie-prervan-1-7.txt'), r2.text);
}
{ /* RU: Проверяем настоящую метку: postavit → dopisatTemy → обрыв → zadanie-prervan; zadanieSreza должен увидеть число тем.
 * EN: Test the real marker path: postavit → dopisatTemy → interruption → zadanie-prervan; zadanieSreza must read the topic count.
 */
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT);
  const kr = []; const mk = app.sozdatMetkiRazbora({ putOtklonennyh: KAT }, (x) => kr.push(x));
  const imya = mk.postavit('sess-A', { shadowedSeqs: [0, 1, 2, 3, 4, 5] }); mk.dopisatTemy(imya, 1, 4); mk.dopisatTemy(imya, 2, 3);
  const prerv = imya ? join(KAT, imya.split('/').pop().replace('razbor-idet', 'zadanie-prervan')) : null; if (prerv) renameSync(imya, prerv);
  const zs = mod.zadanieSreza(KAT, 'sess-A#0-5');
  proba('integration-note: метка разбора несёт temy_po_oknam после dopisatTemy; после обрыва zadanieSreza даёт tem = 7 (4 + 3)',
    !!imya && zs?.tem === 7 && zs?.imya === prerv, JSON.stringify({ imya, zs, kr: kr.slice(-2) }));
}
{ /* RU: Успешный повтор закрывает задание с исходом; упавший заход оставляет его открытым.
 * EN: A successful retry closes the task with its outcome; a failed run leaves it open.
 */
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zad('zadanie-prervan-1-7.txt', 'sess-A#0-5');
  let st = stend({ putOtkl: KAT }); await st.pozvat('/distill-srez sess-A 11'); await st.pozvat('/distill-srez sess-A 11 da'); await tik();
  const z = fajly().includes('zadanie-zakryto-1-7.txt') ? JSON.parse(readFileSync(join(KAT, 'zadanie-zakryto-1-7.txt'), 'utf8')) : null;
  proba('(б) повтор выполнен — задание закрыто с исходом захода', /повтор \/distill-srez выполнен: исход ok, записано 3/.test(z?.zakryto?.prichina ?? ''), JSON.stringify(fajly()));
  // RU: Настоящий zapustitZahod при отказе разрешает промис с ishod=otkaz-zahoda, а не бросает исключение.
  // EN: On rejection, the real zapustitZahod resolves its promise with ishod=otkaz-zahoda rather than throwing.
  for (const it of [{ ishod: 'otkaz-zahoda', pochemu: 'сеть' }, { ishod: 'net-maski' }, { ishod: 'ok' }]) {
    rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zad('zadanie-prervan-1-7.txt', 'sess-A#0-5');
    const st2 = stend({ putOtkl: KAT, itogZahoda: it }); await st2.pozvat('/distill-srez sess-A 11'); await st2.pozvat('/distill-srez sess-A 11 da'); await tik();
    proba(`(б) заход РАЗРЕШИЛСЯ ${JSON.stringify(it)} — задание НЕ закрыто (остаётся zadanie-prervan-*), строка с исходом`,
      fajly().includes('zadanie-prervan-1-7.txt') && !fajly().some((f) => f.startsWith('zadanie-zakryto-')) && st2.kriki.some((k) => /задание на повтор НЕ закрыто: исход/.test(k)),
      JSON.stringify(fajly()) + ' | ' + st2.kriki.slice(-1));
  }
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zad('zadanie-prervan-1-7.txt', 'sess-A#0-5');
  st = stend({ putOtkl: KAT, padaet: true }); await st.pozvat('/distill-srez sess-A 11'); await st.pozvat('/distill-srez sess-A 11 da'); await tik();
  proba('(б) заход упал — задание НЕ закрыто, строка это говорит', fajly().includes('zadanie-prervan-1-7.txt') && st.kriki.some((k) => /задание на повтор НЕ закрыто/.test(k)), JSON.stringify(fajly()) + ' | ' + st.kriki.slice(-1));
  rmSync(KAT, { recursive: true, force: true }); mkdirSync(KAT); zad('zadanie-prervan-1-7.txt', 'sess-A#0-5');
  st = stend({ putOtkl: KAT, zhiva: true }); await st.pozvat('/distill-srez sess-A 11');
  proba('(б) иной отказ (живая метка) — задание НЕ закрыто', fajly().includes('zadanie-prervan-1-7.txt'), JSON.stringify(fajly()));
}
proba('apply: дистилляция вкл — зарегистрированы svodka-prinyat и distill-srez', s1.includes('distill-srez') && s1.includes('svodka-prinyat'), JSON.stringify(s1));
proba('apply: дистилляция выкл — distill-srez НЕТ (только svodka-prinyat)', !s0.includes('distill-srez') && s0.includes('svodka-prinyat'), JSON.stringify(s0));
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
