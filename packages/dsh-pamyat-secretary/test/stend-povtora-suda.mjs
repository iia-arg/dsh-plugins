// RU: Проверяем вердикт ПОВТОРЯЕТ через настоящий distillirovat, sohranitPovtor/sozdatPovtor и скрипт pamyat-vernut-povtor на настоящей базе ядра. Подставной сервер отдаёт темы, статью, суд и второе мнение; видимость и касание подставные, их проверяет ядро. Верность суждения модели не проверяется. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test the ПОВТОРЯЕТ verdict through real distillirovat, sohranitPovtor/sozdatPovtor, and pamyat-vernut-povtor against a real core database. A fake server supplies topics, article, judgment, and second opinion; visibility and touches are fake and tested by the core. Model judgment correctness is not tested. Codes: 0 success, 1 mismatch, 2 unobservable.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync, readdirSync, readFileSync, utimesSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
let distillirovat, SUD_OTMENY, KONEC_SUDA, SUD_OTMENY_POVTOR, sohranitPovtor, sozdatPovtor, PREDEL_POVTORA, otkrytHranilishche;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ SUD_OTMENY, KONEC_SUDA, SUD_OTMENY_POVTOR } = await import('../src/promty.js'));
  ;({ sohranitPovtor, sozdatPovtor, PREDEL_POVTORA } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('dsh-pamyat-core/src/hranilishche.js'));
} catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
if (typeof sohranitPovtor !== 'function' || !SUD_OTMENY_POVTOR) { console.log('СЛЕПОТА: исхода «ПОВТОРЯЕТ» нет (так в бою до правки)'); process.exit(2); }
// RU: Скрипт возврата установлен вне пакета в системном каталоге; импорт ядра из секретаря запрещён. Другой предмет задаётся явно через STEND_VERNUT. Отсутствующий файл означает слепоту, а не дефект пакета.
// EN: The restore script is installed outside the package in the system executable directory; core imports from the secretary are forbidden. Set another subject explicitly through STEND_VERNUT. A missing file means an unobservable test, not a package defect.
const VERNUT = process.env.STEND_VERNUT || '/usr/local/bin/pamyat-vernut-povtor';
if (!existsSync(VERNUT)) { console.log(`СЛЕПОТА: скрипта возврата нет: ${VERNUT} (${process.env.STEND_VERNUT ? 'из STEND_VERNUT' : 'умолчание'})`); process.exit(2); }
console.log(`скрипт возврата: ${VERNUT} (${process.env.STEND_VERNUT ? 'из STEND_VERNUT' : 'умолчание'})`);
const kat = mkdtempSync(join(tmpdir(), 'stend-povtora-')); process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
const MASKA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
let ok = 0, bad = 0;
const proba = (imya, pol, zh) => { const r = JSON.stringify(pol) === JSON.stringify(zh); r ? ok++ : bad++;
  console.log(`  ${r ? 'ok  ' : 'FAIL'} ${imya}: получили ${JSON.stringify(pol)}, ждали ${JSON.stringify(zh)}`); };
const KAND = [{ id: 65, klass: 'reshenie', blizost: 0.6, sozdano: 1000, soderzhim: 'предел сводки 8000 знаков' }];
let nomer = 0;
const otv = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
async function zahod({ sud, sud2 = null, povtor = null }) {
  const zaprosy = [], krik = [], zapisi = [], otnosheniya = [];
  const otvety = [otv('[{"theme":"предел сводки","kind":"reshenie"}]'), otv('СТАТЬЯ: предел сводки 8000 знаков'), otv(sud)];
  if (sud2 !== null) otvety.push(otv(sud2));
  let vyzov = 0;
  const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => {
    try { zaprosy.push(JSON.parse(s)); } catch { zaprosy.push(null); }
    const o = otvety[Math.min(vyzov++, otvety.length - 1)]; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const itog = await distillirovat({ maska: MASKA, povtor,
    sobytiyaSessii: [{ seq: 10, time: 2000, type: 'user/message', data: { content: 'вопрос' } }, { seq: 11, time: 3000, type: 'assistant/message', data: { content: 'ответ' } },
                     { seq: 12, time: 3100, type: 'compaction/start', data: { compactionId: 'c1' } }],
    dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'pv' + (++nomer),
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: `http://127.0.0.1:${server.address().port}/v1/messages`, maxTokenovTem: 1000, maxTokenovStati: 0 },
    krik: (m) => krik.push(String(m)), zapisat: (z) => { zapisi.push(z); return 3310; }, blizhajshaya: () => ({ ishod: 'ne-s-chem', sravneno_s: 0 }),
    dejstvuyushchie: () => ({ ishod: 'sravneno', spisok: KAND, sravneno_s: 1 }),
    otnoshenie: (q) => { otnosheniya.push(q); return { ishod: 'ustanovleno' }; },
    ustarevshee: () => '/tmp/ustarela-proba' });
  server.close();
  const sudZapros = zaprosy.find((z) => JSON.stringify(z ?? '').includes('ДЕЙСТВУЮЩИЕ ЗАПИСИ'));
  return { itog, krik, zapisi, otnosheniya, zaprosy, sudZapros };
}
const katPr = join(kat, 'otklonennoe'); mkdirSync(katPr, { mode: 0o700 });
const kasaniya = [];
const pv = (vidna) => ({ vidna: typeof vidna === 'function' ? vidna : async () => vidna, kasanie: (k) => { kasaniya.push(k); return { otmecheno: 1 }; },
  sohranit: (q) => sohranitPovtor(katPr, q, { baza: join(kat, 'pamyat.db') }) });
const fajly = () => readdirSync(katPr).filter((f) => /^povtoryaet-.*\.txt$/.test(f) && !f.includes('vozvrashcheno'));
// RU: Исправный пропуск не пишет запись и сохраняет файл повтора.
// EN: A healthy skip writes no record and retains the repeat file.
const p1 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: pv(true) });
if (p1.zapisi.length !== 0 || fajly().length !== 1) { console.log('СЛЕПОТА: исправный пропуск не состоялся — ' + p1.krik.slice(-3).join(' | ')); process.exit(2); }
const f1 = join(katPr, fajly()[0]); const sh1 = readFileSync(f1, 'utf8');
if (process.env.STEND_OTLADKA) console.log(p1.krik.map((x) => '    · ' + x.slice(0, 230)).join('\n'));
proba('П1 «ПОВТОРЯЕТ» ×2, двойник виден → не записано, касание k, файл с k и командой возврата, «повторяет 1 из 1»',
  [p1.zapisi.length, kasaniya, sh1.includes('# повторяет действующую запись: 65'), sh1.includes('pamyat-vernut-povtor'), p1.krik.some((s) => s.includes('повторяет 1 из 1 судимых'))],
  [0, [65], true, true, true]);
const p2 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', sud2: 'УТОЧНЯЕТ: 65', povtor: pv(true) });
proba('П2 мнения «ПОВТОРЯЕТ»/«УТОЧНЯЕТ» о k → записано «уточняет», пометка', [p2.zapisi.length, p2.otnosheniya[0]?.vid, p2.otnosheniya[0]?.k, /мнения разошлись/.test(p2.otnosheniya[0]?.kto)], [1, 'utochnyaet', 65, true]);
const p3 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: pv(false) });
proba('П3 двойник НЕ виден (superseded / k отменён) → записано «уточняет»', [p3.zapisi.length, p3.otnosheniya[0]?.vid, /не виден/.test(p3.otnosheniya[0]?.kto)], [1, 'utochnyaet', true]);
const p4 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: pv(null) });
proba('П4 видимость «не знаю» (null) → записано «уточняет»', [p4.zapisi.length, /не проверена/.test(p4.otnosheniya[0]?.kto)], [1, true]);
const p5 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: pv(async () => { throw new Error('слой упал'); }) });
proba('П5 проверка видимости бросила → записано', p5.zapisi.length, 1);
const katPolnyj = join(kat, 'polnyj'); mkdirSync(katPolnyj, { mode: 0o700 });
for (let i = 0; i < PREDEL_POVTORA; i++) writeFileSync(join(katPolnyj, `povtoryaet-1-${i}.txt`), 'x');
const p6 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: { ...pv(true), sohranit: (q) => sohranitPovtor(katPolnyj, q) } });
proba('П6 предел файлов достигнут → пропуска нет, записано «уточняет» с причиной', [p6.zapisi.length, /предел/.test(p6.otnosheniya[0]?.kto)], [1, true]);
const p7 = await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: null });
proba('П7 ключ ВЫКЛ: запрос суда = SUD_OTMENY a90 + KONEC_SUDA, «ПОВТОРЯЕТ» не разобран, записано без отношения',
  [JSON.stringify(p7.sudZapros ?? '').includes(JSON.stringify(SUD_OTMENY).slice(1, -1)), JSON.stringify(p7.sudZapros ?? '').includes('Повторяет — новая статья'),
   JSON.stringify(p7.sudZapros ?? '').includes(JSON.stringify(KONEC_SUDA).slice(1, -1)), p7.zapisi.length, p7.otnosheniya.length, p7.itog.sudNerazobran], [true, false, true, 1, 0, 1]);
proba('П8 ключ ВКЛ: запрос суда = SUD_OTMENY_POVTOR (с «ПОВТОРЯЕТ»)', JSON.stringify(p1.sudZapros ?? '').includes('Повторяет — новая статья'), true);
const star = join(katPr, 'povtoryaet-1000-1.txt'); writeFileSync(star, 'старый'); const davno = (Date.now() - 31 * 86400e3) / 1000; utimesSync(star, davno, davno);
await zahod({ sud: 'ПОВТОРЯЕТ: 65', povtor: pv(true) });
proba('П9 срок: файл старше 30 сут. удалён при следующем пропуске', existsSync(star), false);
// RU: Запись 65 проходит настоящий скрипт: создаётся связь «уточняет 65», файл помечается; второй возврат отвергается.
// EN: Record 65 passes through the real script: create an “ уточняет 65” link and mark the file; reject a second restore.
const baza = join(kat, 'pamyat.db'); const h = otkrytHranilishche(baza);
for (let i = 1; i < 65; i++) h.zapisat({ agent: 'proba', klass: 'reshenie', soderzhim: 'заполнитель ' + i });
const id65 = h.zapisat({ agent: 'proba', klass: 'reshenie', soderzhim: 'предел сводки 8000 знаков' });
let v1, v2 = 0;
const coreSrc = dirname(fileURLToPath(import.meta.resolve('dsh-pamyat-core/src/hranilishche.js'))) + '/';
try { v1 = execFileSync(process.execPath, [VERNUT, f1, baza], { env: { ...process.env, PAMYAT_VERNUT_CORE: coreSrc }, encoding: 'utf8' }); } catch (e) { v1 = 'ОТКАЗ ' + e.status + ' ' + e.stderr; }
const vozvr = h.baza.prepare("SELECT id, klass, otnoshenie, otnositsya_k FROM zapisi WHERE soderzhim LIKE 'СТАТЬЯ%' OR soderzhim LIKE 'предел сводки 8000%' ORDER BY id DESC LIMIT 1").get();
try { execFileSync(process.execPath, [VERNUT, f1, baza], { env: { ...process.env, PAMYAT_VERNUT_CORE: coreSrc }, stdio: 'pipe' }); } catch (e) { v2 = e.status; }
proba('П10 возврат: запись «уточняет 65», файл помечен vozvrashcheno; повтор того же файла → отказ 2',
  [Number(id65) === 65, vozvr?.otnoshenie, Number(vozvr?.otnositsya_k), existsSync(f1), readdirSync(katPr).some((f) => f.includes('vozvrashcheno')), v2],
  [true, 'utochnyaet', 65, false, true, 2]);
if (!/возвращено/.test(String(v1))) console.log('  (вывод возврата: ' + String(v1).slice(0, 200) + ')');
const p11 = await zahod({ sud: 'ПОВТОРЯЕТ: 999', povtor: pv(true) });
proba('П11 «ПОВТОРЯЕТ» с id не из предложенных → не разобрано, записано', [p11.itog.sudNerazobran, p11.zapisi.length], [1, 1]);
console.log(`\nstend-povtora-suda: ok=${ok} FAIL=${bad}`);
process.exit(bad ? 1 : 0);
