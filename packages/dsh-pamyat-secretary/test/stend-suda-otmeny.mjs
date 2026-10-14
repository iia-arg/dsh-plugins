// RU: Проверяем суд отмены после статьи отменяемого класса через настоящий distillirovat. Сервер подставной: темы → статья → вердикт; кандидаты, запись отношения и сохранение устаревшего тоже подставные. Время источника 3000, кандидат 65 старше с 1000, кандидат 200 новее с 5000. Верность суждения живой модели не проверяется.
// EN: Test revocation judgment after a revocable-class article through real distillirovat. The fake server returns topics → article → verdict; candidates, relation writing, and obsolete-text saving are also fake. Source time is 3000, candidate 65 is older at 1000, and candidate 200 newer at 5000. Live-model judgment correctness is untested.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat, KANDIDATOV_SUDA, PREDEL_KANDIDATA, stroka_razneseno } from '../src/distill-shov.js';
import { vyborTem, STATYA, SUD_OTMENY, KONEC_SUDA } from '../src/promty.js';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
// RU: Без метода маски входа тело дистилляции отказывает. Здесь маска-пустышка намеренно пропускает текст, чтобы изолировать другой предмет; маску проверяет stend-maski-vhoda-sekretarya.
// EN: The distillation body rejects without the input-mask method. Here an identity fake deliberately passes text through to isolate another subject; stend-maski-vhoda-sekretarya tests masking.
const MASKA_PUSTYSHKA_STENDA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, vsego = 0;
// RU: Тело должно бросить или вернуть undefined; любое другое значение означает отказ. Игнорирование возврата скрывает причину ошибки.
// EN: The body must throw or return undefined; any other value means failure. Ignoring returns hides the error reason.
const proba = (imya, f) => { vsego++; try { const vernulos = f(); if (vernulos !== undefined) throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) + '» — тело обязано бросить или промолчать'); ok++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
const kat = vremennyj(join(tmpdir(), 'stend-suda-otmeny-'));
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
const KAND = [{ id: 65, klass: 'reshenie', blizost: 0.6, sozdano: 1000, soderzhim: 'предел сводки 8000 знаков' },
              { id: 200, klass: 'reshenie', blizost: 0.5, sozdano: 5000, soderzhim: 'предел сводки снят' }];
let nomer = 0;
const KANDf = () => KAND;
async function zahod({ sud = 'НЕТ', kind = 'reshenie', yadro = true, kand = KANDf, sudOtvet = null, sud2 = null } = {}) {
  const zaprosy = []; let vyzov = 0; const krik = []; const zapisi = []; const otnosheniya = []; const ustarevshie = []; const voprosy = [];
  const otvety = [{ content: [{ type: 'text', text: `[{"theme":"предел сводки","kind":"${kind}"}]` }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'СТАТЬЯ: предел сводки 8000 знаков' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  sudOtvet ?? { content: [{ type: 'text', text: sud }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  // RU: Второе мнение — четвёртый вызов; без sud2 сервер повторяет последний ответ, и мнения совпадают.
  // EN: The second opinion is the fourth call; without sud2, the server repeats its last response and the opinions agree.
  if (sud2 !== null) otvety.push({ content: [{ type: 'text', text: sud2 }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
  const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { zaprosy.push(JSON.parse(s)); } catch { zaprosy.push(null); } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    sobytiyaSessii: [{ seq: 10, time: 2000, type: 'user/message', data: { content: 'STENOGRAMMA-vopros' } }, { seq: 11, time: 3000, type: 'assistant/message', data: { content: 'STENOGRAMMA-otvet' } },
                     { seq: 12, time: 3100, type: 'compaction/start', data: { compactionId: 'c1' } }],
    dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'sud' + (++nomer),
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: `http://127.0.0.1:${server.address().port}/v1/messages`, maxTokenovTem: 1000, maxTokenovStati: 0, predelTem: 5, minTokenov: 1, hvost: 'net' },
    krik: (m) => krik.push(String(m)), zapisat: (z) => { zapisi.push(z); return 3310; }, blizhajshaya: () => ({ ishod: 'ne-s-chem', sravneno_s: 0 }),
    dejstvuyushchie: yadro ? (q) => { voprosy.push(q); return { ishod: 'sravneno', spisok: kand(nomer), sravneno_s: 2 }; } : null,
    otnoshenie: yadro ? (q) => { otnosheniya.push(q); return { ishod: 'ustanovleno' }; } : null,
    ustarevshee: (u) => { ustarevshie.push(u); return '/tmp/ustarela-proba'; },
  });
  server.close();
  return { itog, krik, zaprosy, zapisi, otnosheniya, ustarevshie, voprosy };
}
const a = await zahod({ sud: 'ОТМЕНЯЕТ: 65' });
const b = await zahod({ sud: 'НЕТ' });
const c = await zahod({ sud: 'УСТАРЕЛА: 200' });
const d = await zahod({ sud: 'ОТМЕНЯЕТ: 200' });
const e = await zahod({ kind: 'fakt' });
const f = await zahod({ yadro: false });
// RU: Кандидат из того же среза статьи исключается; кандидат 65 остаётся.
// EN: Exclude a candidate from the article’s own slice; candidate 65 remains.
const g = await zahod({ sud: 'УСТАРЕЛА: 300', kand: (n) => [{ id: 300, klass: 'reshenie', blizost: 0.9, sozdano: 9000, istochnik: `sud${n}#10-11#okno1`, soderzhim: 'брат из этого же разбора' }, ...KAND] });
// RU: Новизна определяется источником и временем: кандидат 400 из seq 1–5 старше статьи 10–11, хотя записан в 9000 после её 3000; 500 из seq 20–30 и времени 5000 новее; 600 из seq 9000–9999, но времени 1000 моделирует пересозданную сессию с обнулёнными seq.
// EN: Recency depends on source and time: candidate 400 from seq 1–5 precedes article 10–11 despite being written at 9000 after its 3000; candidate 500 from seq 20–30 at time 5000 is newer; candidate 600 from seq 9000–9999 at time 1000 models a recreated session with reset seq values.
const h = await zahod({ sud: 'УСТАРЕЛА: 400', kand: (n) => [{ id: 400, klass: 'reshenie', blizost: 0.7, sozdano: 9000, istochnik: `sud${n}#1-5#okno1`, soderzhim: 'прошлый разбор' }] });
const i2 = await zahod({ sud: 'УСТАРЕЛА: 500', kand: (n) => [{ id: 500, klass: 'reshenie', blizost: 0.7, sozdano: 5000, istochnik: `sud${n}#20-30#okno1`, soderzhim: 'позднейший отрезок' }] });
const i3 = await zahod({ sud: 'УСТАРЕЛА: 600', kand: (n) => [{ id: 600, klass: 'reshenie', blizost: 0.7, sozdano: 1000, istochnik: `sud${n}#9000-9999#okno1`, soderzhim: 'прежняя сессия того же имени' }] });
const j = await zahod({ sudOtvet: { content: [{ type: 'thinking', thinking: 'думаю' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 32768 } } });
const r1 = await zahod({ sud: 'ОТМЕНЯЕТ: 65', sud2: 'НЕТ' });
const r2 = await zahod({ sud: 'УСТАРЕЛА: 200', sud2: 'НЕТ' });
// RU: Проверяем «уточняет» и обрезанный кандидат: 700 длиннее предела, 701 ровно на пределе и виден целиком.
// EN: Test “ уточняет” and a truncated candidate: 700 exceeds the limit; 701 equals it and is fully visible.
const u1 = await zahod({ sud: 'УТОЧНЯЕТ: 65' });
const DLINNYJ = [{ id: 700, klass: 'reshenie', blizost: 0.7, sozdano: 1000, soderzhim: 'предел сводки ' + 'ж'.repeat(PREDEL_KANDIDATA + 1000) }];
const ROVNO = [{ id: 701, klass: 'reshenie', blizost: 0.7, sozdano: 1000, soderzhim: 'предел сводки ' + 'ж'.repeat(PREDEL_KANDIDATA - 14) }];
const p1 = await zahod({ sud: 'ОТМЕНЯЕТ: 700', kand: () => DLINNYJ });
const p2 = await zahod({ sud: 'ОТМЕНЯЕТ: 701', kand: () => ROVNO });
// RU: Каждая форма второго мнения должна называться в строке расхождения без undefined.
// EN: Every second-opinion shape must be named in the disagreement line without undefined.
const v1 = await zahod({ sud: 'ОТМЕНЯЕТ: 65', sud2: 'УТОЧНЯЕТ: 65' });
const v2 = await zahod({ sud: 'ОТМЕНЯЕТ: 65', sud2: '' });
const v3 = await zahod({ sud: 'ОТМЕНЯЕТ: 65', sud2: 'мусор без формы' });
const v4 = await zahod({ sud: 'ОТМЕНЯЕТ: 65', sud2: 'ОТМЕНЯ' });
const v5 = await zahod({ sud: 'ОТМЕНЯЕТ: 65', sud2: 'ОТМЕНЯЕТ: 65' });
const tekstSudaIz = (x) => { const m = x.zaprosy[2]?.messages?.at(-1); return Array.isArray(m?.content) ? m.content.map((y) => y.text ?? '').join('') : String(m?.content ?? ''); };
const itogStroka = (x) => x.krik.find((k) => k.startsWith('отмены ('));

proba('1 ОТМЕНЯЕТ: 65 (старше источника) → статья записана, отношение 3310 otmenyaet 65 от «суда модели», строка и счёт', () => {
  if (a.zapisi.length !== 1) throw new Error('записей ' + a.zapisi.length);
  const o = a.otnosheniya[0]; if (!o || o.id !== 3310 || o.vid !== 'otmenyaet' || o.k !== 65 || !/суд модели/.test(o.kto)) throw new Error(JSON.stringify(a.otnosheniya));
  if (!a.krik.some((k) => k.startsWith('отменяет id 65 (модель): запись 3310') && k.includes('UPDATE zapisi SET otnoshenie=NULL'))) throw new Error('строки отмены нет');
  if (!/отмен 1,/.test(itogStroka(a) ?? '')) throw new Error('итог: ' + itogStroka(a));
});
proba('2 НЕТ → статья записана, отношения нет', () => {
  if (b.zapisi.length !== 1 || b.otnosheniya.length) throw new Error(`записей ${b.zapisi.length}, отношений ${b.otnosheniya.length}`);
});
proba('3 УСТАРЕЛА: 200 (новее источника) → в память НЕ пишется, текст в файл, строка и счёт', () => {
  if (c.zapisi.length || c.otnosheniya.length) throw new Error(`записей ${c.zapisi.length}, отношений ${c.otnosheniya.length}`);
  if (c.ustarevshie.length !== 1 || c.ustarevshie[0].k !== 200) throw new Error('устаревшее не сохранено');
  if (!c.krik.some((k) => k.includes('УСТАРЕЛА (модель): действующая запись 200'))) throw new Error('строки нет');
  if (!/устаревших не записано 1/.test(itogStroka(c) ?? '')) throw new Error('итог: ' + itogStroka(c));
});
proba('4 ОТМЕНЯЕТ: 200 (НОВЕЕ источника) → отношения нет, статья записана, «не разобрано»', () => {
  if (d.zapisi.length !== 1 || d.otnosheniya.length) throw new Error(`записей ${d.zapisi.length}, отношений ${d.otnosheniya.length}`);
  if (!/не разобрано 1/.test(itogStroka(d) ?? '')) throw new Error('итог: ' + itogStroka(d));
});
proba('5 КЛАСС fakt → суд не зовётся (два вызова модели, не три)', () => {
  if (e.zaprosy.length !== 2 || e.otnosheniya.length) throw new Error('вызовов ' + e.zaprosy.length);
});
proba('6 ЯДРО без методов → суд не зовётся, строка «суд НЕ звался»', () => {
  if (f.zaprosy.length !== 2) throw new Error('вызовов ' + f.zaprosy.length);
  if (!f.krik.some((k) => k.includes('суд НЕ звался'))) throw new Error('строки нет');
});
proba('7 ВХОД СУДА: system = SUD_OTMENY, последняя строка user = KONEC_SUDA, стенограммы нет, кандидаты с id и «НОВЕЕ источника»', () => {
  const z = a.zaprosy[2]; const sys = typeof z?.system === 'string' ? z.system : JSON.stringify(z?.system);
  if (!sys.includes('Ложная отмена хуже пропущенной')) throw new Error('system не суда');
  const m = z.messages.at(-1); const t = Array.isArray(m.content) ? m.content.map((x) => x.text ?? '').join('') : String(m.content);
  if (t.trimEnd().split('\n').at(-1) !== KONEC_SUDA) throw new Error('последняя строка: ' + t.split('\n').at(-1));
  if (t.includes('STENOGRAMMA')) throw new Error('стенограмма ушла в суд');
  if (!t.includes('[id 65]') || !/\[id 200\][^\n]*НОВЕЕ источника/.test(t)) throw new Error('кандидаты не по форме');
});
proba('8 (В) ПРОМТЫ: «отменяю / меняю / снимаю» → отдельная тема-решение; в статье «было … — стало …»', () => {
  if (!vyborTem(['reshenie']).includes('«отменяю», «меняю», «снимаю»')) throw new Error('в выборе тем нет');
  if (!STATYA.includes('«было … — стало …»')) throw new Error('в статье нет');
  if (!SUD_OTMENY.includes('Сомневаешься — НЕТ')) throw new Error('суд без осторожности');
});
proba('9 КАНДИДАТОВ СУДА — 5 (дельта 01:41; живой случай исполнитель: отменяемая запись 65 — четвёртая по близости)', () => {
  if (KANDIDATOV_SUDA !== 5) throw new Error('KANDIDATOV_SUDA ' + KANDIDATOV_SUDA);
  if (!(a.voprosy[0]?.skolko >= 5)) throw new Error('ядро спрошено о ' + a.voprosy[0]?.skolko + ' кандидатах (a76: с запасом под отсечение своего среза)');
});
proba('10 БЮДЖЕТ СУДА ≥ 16384 (a77: живой максимум рассуждения суда 12716 ток.; при 8192 у исполнитель 3 из 29 [ne-dochitala])', () => {
  const mt = a.zaprosy[2]?.max_tokens; if (!(mt >= 16384)) throw new Error('max_tokens суда ' + mt);
  if (a.zaprosy[2]?.thinking !== undefined) throw new Error('рассуждение суда тронуто: ' + JSON.stringify(a.zaprosy[2].thinking));
});
proba('11 КАНДИДАТ ИЗ ЭТОГО ЖЕ РАЗБОРА отсечён: в суд не ушёл, «УСТАРЕЛА: 300» не принят, статья записана', () => {
  const m = g.zaprosy[2]?.messages?.at(-1); const t = Array.isArray(m?.content) ? m.content.map((x) => x.text ?? '').join('') : String(m?.content ?? '');
  if (t.includes('[id 300]')) throw new Error('брат из своего среза ушёл в суд');
  if (g.zapisi.length !== 1 || g.ustarevshie.length) throw new Error(`записей ${g.zapisi.length}, устаревших ${g.ustarevshie.length}`);
});
proba('12 a77: запись ПРОШЛОГО разбора (отрезок раньше, записана позже) — НЕ «НОВЕЕ»: пометки нет, «УСТАРЕЛА» не принят, статья записана', () => {
  const t = tekstSudaIz(h); if (!t.includes('[id 400]')) throw new Error('кандидат 400 не ушёл в суд');
  if (/\[id 400\][^\n]*НОВЕЕ/.test(t)) throw new Error('ложная пометка «НОВЕЕ» у 400');
  if (h.zapisi.length !== 1 || h.ustarevshie.length) throw new Error(`записей ${h.zapisi.length}, устаревших ${h.ustarevshie.length}`);
});
proba('13 a77: запись ПОЗДНЕЙШЕГО отрезка той же сессии, записанная позже — «НОВЕЕ»: пометка есть, «УСТАРЕЛА: 500» принят', () => {
  if (!/\[id 500\][^\n]*НОВЕЕ источника/.test(tekstSudaIz(i2))) throw new Error('пометки «НОВЕЕ» у 500 нет');
  if (i2.zapisi.length || i2.ustarevshie.length !== 1) throw new Error(`записей ${i2.zapisi.length}, устаревших ${i2.ustarevshie.length}`);
});
proba('14 a77: суд не дочитал → строка называет выход и бюджет, статья записана', () => {
  if (!j.krik.some((k) => /суд не состоялся \[ne-dochitala\], выход 32768 ток\. при бюджете \d+/.test(k))) throw new Error(j.krik.filter((k) => k.includes('суд')).join(' | '));
  if (j.zapisi.length !== 1) throw new Error('записей ' + j.zapisi.length);
});
proba('15 a77 ВТОРОЕ МНЕНИЕ совпало → принято: ОТМЕНЯЕТ — 4 вызова, второй суд тем же входом; итог «вторых мнений 1, из них разошлись 0»', () => {
  if (a.zaprosy.length !== 4) throw new Error('вызовов ' + a.zaprosy.length);
  if (JSON.stringify(a.zaprosy[3]) !== JSON.stringify(a.zaprosy[2])) throw new Error('второй суд не тем же запросом');
  if (a.otnosheniya.length !== 1 || !/вторых мнений 1, из них разошлись 0/.test(itogStroka(a) ?? '')) throw new Error('итог: ' + itogStroka(a));
  if (c.zaprosy.length !== 4 || c.ustarevshie.length !== 1) throw new Error(`УСТАРЕЛА: вызовов ${c.zaprosy.length}, устаревших ${c.ustarevshie.length}`);
});
proba('16 a77 «НЕТ» → второго вызова нет (3 вызова), «вторых мнений 0»', () => {
  if (b.zaprosy.length !== 3) throw new Error('вызовов ' + b.zaprosy.length);
  if (!/вторых мнений 0,/.test(itogStroka(b) ?? '')) throw new Error('итог: ' + itogStroka(b));
});
proba('17 a77 мнения РАЗОШЛИСЬ (ОТМЕНЯЕТ: 65 / НЕТ) → отношения нет, статья записана, «не разобрано», строка называет оба мнения', () => {
  if (r1.zaprosy.length !== 4 || r1.otnosheniya.length || r1.zapisi.length !== 1) throw new Error(`вызовов ${r1.zaprosy.length}, отношений ${r1.otnosheniya.length}, записей ${r1.zapisi.length}`);
  if (!r1.krik.some((k) => k.includes('мнения разошлись: первое «ОТМЕНЯЕТ: 65», второе «НЕТ»'))) throw new Error('строки нет');
  if (!/не разобрано 1, вторых мнений 1, из них разошлись 1/.test(itogStroka(r1) ?? '')) throw new Error('итог: ' + itogStroka(r1));
});
proba('18 a77 мнения РАЗОШЛИСЬ (УСТАРЕЛА: 200 / НЕТ) → статья записана, в «устаревшие» не ушла', () => {
  if (r2.zapisi.length !== 1 || r2.ustarevshie.length) throw new Error(`записей ${r2.zapisi.length}, устаревших ${r2.ustarevshie.length}`);
  if (!r2.krik.some((k) => k.includes('мнения разошлись: первое «УСТАРЕЛА: 200», второе «НЕТ»'))) throw new Error('строки нет');
});
proba('19 a77: отрезок «позже», но записан ДАВНО (сессия пересоздана под тем же именем) — НЕ «НОВЕЕ», «УСТАРЕЛА» не принят', () => {
  const t = tekstSudaIz(i3); if (!t.includes('[id 600]')) throw new Error('кандидат 600 не ушёл в суд');
  if (/\[id 600\][^\n]*НОВЕЕ/.test(t)) throw new Error('ложная пометка «НОВЕЕ» у 600');
  if (i3.zapisi.length !== 1 || i3.ustarevshie.length) throw new Error(`записей ${i3.zapisi.length}, устаревших ${i3.ustarevshie.length}`);
});
proba('20 integration-note «УТОЧНЯЕТ: 65» → статья записана, отношение 3310 utochnyaet 65 через ядро; второго мнения нет (3 вызова); итог «уточнений 1»', () => {
  if (u1.zapisi.length !== 1) throw new Error('записей ' + u1.zapisi.length);
  const o = u1.otnosheniya[0]; if (u1.otnosheniya.length !== 1 || o.id !== 3310 || o.vid !== 'utochnyaet' || o.k !== 65) throw new Error(JSON.stringify(u1.otnosheniya));
  if (u1.zaprosy.length !== 3) throw new Error('вызовов ' + u1.zaprosy.length + ' — второе мнение спрошено для «уточняет»');
  if (!/уточнений 1 \(из них понижено с «отменяет» 0\)/.test(itogStroka(u1) ?? '')) throw new Error('итог: ' + itogStroka(u1));
});
proba('21 integration-note ОТМЕНЯЕТ ОБРЕЗАННОГО (700, длиннее предела) → понижено до utochnyaet 700, строка «понижено», итог «понижено 1»', () => {
  const o = p1.otnosheniya[0]; if (p1.otnosheniya.length !== 1 || o.vid !== 'utochnyaet' || o.k !== 700 || !/понижено/.test(o.kto)) throw new Error(JSON.stringify(p1.otnosheniya));
  if (!p1.krik.some((k) => k.startsWith('уточняет id 700 (модель; «ОТМЕНЯЕТ» понижено'))) throw new Error('строки понижения нет');
  if (!/уточнений 1 \(из них понижено с «отменяет» 1\)/.test(itogStroka(p1) ?? '') || !/отмен 0,/.test(itogStroka(p1) ?? '')) throw new Error('итог: ' + itogStroka(p1));
});
proba('22 integration-note ЗАКОННАЯ ПОЛНАЯ ОТМЕНА длинной, но видной целиком записи (701, ровно предел) → otmenyaet 701, не понижено', () => {
  const o = p2.otnosheniya[0]; if (p2.otnosheniya.length !== 1 || o.vid !== 'otmenyaet' || o.k !== 701) throw new Error(JSON.stringify(p2.otnosheniya));
  if (!/отмен 1,/.test(itogStroka(p2) ?? '')) throw new Error('итог: ' + itogStroka(p2));
});
proba('23 integration-note ВХОД СУДА: обрезанный — «[показано N из M знаков — запись ОБРЕЗАНА»; видный целиком — без пометки и без потери конца', () => {
  const t1 = tekstSudaIz(p1), t2 = tekstSudaIz(p2), dl = DLINNYJ[0].soderzhim.length;
  if (!t1.includes(`[показано ${PREDEL_KANDIDATA} из ${dl} знаков — запись ОБРЕЗАНА`)) throw new Error('пометки обреза нет');
  if (t2.includes('ОБРЕЗАНА') || !t2.includes(ROVNO[0].soderzhim)) throw new Error('видный целиком показан не целиком или помечен');
});
proba('24 integration-note ПРОМТ СУДА: четыре ответа в KONEC_SUDA; «ЦЕЛИКОМ» и «ОБРЕЗАНА» в SUD_OTMENY', () => {
  for (const w of ['«ОТМЕНЯЕТ: <id>»', '«УТОЧНЯЕТ: <id>»', '«УСТАРЕЛА: <id>»', '«НЕТ»']) if (!KONEC_SUDA.includes(w)) throw new Error('в KONEC_SUDA нет ' + w);
  if (!SUD_OTMENY.includes('ЦЕЛИКОМ') || !SUD_OTMENY.includes('ОБРЕЗАНА')) throw new Error('в SUD_OTMENY нет правила полного покрытия/обреза');
});
const razoshlis = (x) => x.krik.find((k) => k.includes('мнения разошлись')) ?? '';
proba('25 integration-note второе «УТОЧНЯЕТ: 65» → строка называет «УТОЧНЯЕТ: 65», без undefined; отношения нет', () => {
  const t = razoshlis(v1); if (!t.includes('второе «УТОЧНЯЕТ: 65»') || t.includes('undefined')) throw new Error('строка: ' + t);
  if (v1.otnosheniya.length) throw new Error('отношение поставлено: ' + JSON.stringify(v1.otnosheniya));
});
proba('26 integration-note второе ПУСТОЕ → «суд не состоялся [pusto], выход N ток. при бюджете …» — код исхода и выход названы', () => { const t = razoshlis(v2); if (!/второе «не разобрано \(суд не состоялся \[pusto\], выход \d+ ток\. при бюджете \d+\)»/.test(t) || t.includes('undefined')) throw new Error('строка: ' + t); });
proba('27 integration-note второе МУСОР → начало ответа в строке', () => { const t = razoshlis(v3); if (!t.includes('мусор без формы')) throw new Error('строка: ' + t); });
proba('28 integration-note второе ОБРЕЗАННОЕ «ОТМЕНЯ» → начало ответа в строке', () => { const t = razoshlis(v4); if (!t.includes('не по форме: «ОТМЕНЯ»')) throw new Error('строка: ' + t); });
proba('29 integration-note второе НОРМАЛЬНОЕ (совпало) → принято, строки «разошлись» нет', () => {
  if (razoshlis(v5) || v5.otnosheniya.length !== 1 || v5.otnosheniya[0].vid !== 'otmenyaet') throw new Error(JSON.stringify(v5.otnosheniya) + ' ' + razoshlis(v5));
});
// RU: УСТАРЕЛА для k, не более нового чем источник, понижается охраной до справочной связи «уточняет k» с отдельным счётом. Более новый k проходит прежний путь второго мнения.
// EN: УСТАРЕЛА for k no newer than the source is downgraded by the guard to an informational “уточняет k” link with a separate count. A newer k follows the existing second-opinion path.
const w1 = await zahod({ sud: 'УСТАРЕЛА: 65' });
proba('31 integration-note (б) «УСТАРЕЛА: 65» при 65 СТАРШЕ источника → уточняет 65, строка «понижено из УСТАРЕЛА», итог «понижено до уточняет 1», «не разобрано 0», 3 вызова', () => {
  if (w1.zapisi.length !== 1 || w1.ustarevshie.length) throw new Error(`записей ${w1.zapisi.length}, устаревших ${w1.ustarevshie.length}`);
  if (w1.otnosheniya.length !== 1 || w1.otnosheniya[0].vid !== 'utochnyaet' || w1.otnosheniya[0].k !== 65 || w1.otnosheniya[0].id !== 3310) throw new Error(JSON.stringify(w1.otnosheniya));
  if (!w1.otnosheniya[0].kto.includes('понижено из «УСТАРЕЛА»')) throw new Error('kto: ' + w1.otnosheniya[0].kto);
  if (!w1.krik.some((k) => k.includes('понижено из «УСТАРЕЛА: 65» охраной по времени'))) throw new Error('строки «понижено из УСТАРЕЛА» нет');
  if (!/«устарела» понижено до уточняет 1, не разобрано 0,/.test(itogStroka(w1) ?? '')) throw new Error('итог: ' + itogStroka(w1));
  if (w1.zaprosy.length !== 3) throw new Error('вызовов ' + w1.zaprosy.length + ' (второго мнения быть не должно)');
});
proba('32 integration-note (б) запись ПРОШЛОГО разбора 400 («УСТАРЕЛА: 400», не новее) → уточняет 400, «не разобрано 0»', () => {
  if (h.otnosheniya.length !== 1 || h.otnosheniya[0].vid !== 'utochnyaet' || h.otnosheniya[0].k !== 400) throw new Error(JSON.stringify(h.otnosheniya));
  if (!/«устарела» понижено до уточняет 1, не разобрано 0,/.test(itogStroka(h) ?? '')) throw new Error('итог: ' + itogStroka(h));
});
proba('33 integration-note k НОВЕЕ + «УСТАРЕЛА: 200» → прежний путь не задет: второе мнение (4 вызова), в устаревшие, отношения нет, «понижено до уточняет 0»', () => {
  if (c.zaprosy.length !== 4 || c.ustarevshie.length !== 1 || c.otnosheniya.length || c.zapisi.length) throw new Error(`вызовов ${c.zaprosy.length}, устаревших ${c.ustarevshie.length}, отношений ${c.otnosheniya.length}, записей ${c.zapisi.length}`);
  if (!/«устарела» понижено до уточняет 0,/.test(itogStroka(c) ?? '')) throw new Error('итог: ' + itogStroka(c));
});
// RU: При чужой теме и УСТАРЕЛА старшей записи возможная ложная связь «уточняет» должна иметь пометку.
// EN: With an unrelated topic and УСТАРЕЛА for an older record, a potentially false “уточняет” link must be annotated.
const w2 = await zahod({ sud: 'УСТАРЕЛА: 900', kand: () => [{ id: 900, klass: 'reshenie', blizost: 0.2, sozdano: 1000, soderzhim: 'порядок бэкапа OMEGA: ночной снимок в 03:00' }] });
proba('35 integration-note (б) ЧУЖАЯ тема + «УСТАРЕЛА: 900» (старшая) → «уточняет 900» ложится С ПОМЕТКОЙ в kto и строке журнала, счёт «понижено 1», «ponizheno» (обрезанных) 0', () => {
  if (w2.otnosheniya.length !== 1 || w2.otnosheniya[0].vid !== 'utochnyaet' || w2.otnosheniya[0].k !== 900) throw new Error(JSON.stringify(w2.otnosheniya));
  if (!w2.otnosheniya[0].kto.includes('понижено из «УСТАРЕЛА»')) throw new Error('kto без пометки: ' + w2.otnosheniya[0].kto);
  if (!w2.krik.some((k) => k.startsWith('уточняет id 900') && k.includes('понижено из «УСТАРЕЛА: 900»'))) throw new Error('строка уточнения без пометки');
  if (!/уточнений 1 \(из них понижено с «отменяет» 0\), устаревших не записано 0, «устарела» понижено до уточняет 1, не разобрано 0,/.test(itogStroka(w2) ?? '')) throw new Error('итог: ' + itogStroka(w2));
});
proba('34 integration-note (а) ПРОМТ СУДА: повтор без нового — «УТОЧНЯЕТ»; «УСТАРЕЛА» — ТОЛЬКО при пометке «НОВЕЕ источника статьи» (отдельной строкой)', () => {
  if (!SUD_OTMENY.includes('повторяет уже записанное БЕЗ нового — это тоже УТОЧНЯЕТ')) throw new Error('нет правила повтора');
  if (!SUD_OTMENY.split('\n').some((l) => l.startsWith('«УСТАРЕЛА» — ТОЛЬКО если у действующей записи стоит пометка «НОВЕЕ источника статьи»'))) throw new Error('нет отдельной строки «ТОЛЬКО при пометке»');
});
proba('35 integration-note ИТОГОВАЯ строка дистилляции называет «устарело N»: 1 при «УСТАРЕЛА: 200» принятом, 0 при «НЕТ»', () => {
  const it = (x) => x.krik.find((k) => k.startsWith('дистилляция: знаний записано')) ?? '';
  if (!/ устарело 1 \(/.test(it(c))) throw new Error('c: ' + it(c).slice(0, 160));
  if (!/ устарело 0 \(/.test(it(b))) throw new Error('b: ' + it(b).slice(0, 160));
});
proba('36 integration-note ОХВАТ СХОДИТСЯ: итоговая строка «разнесено M из M тем — сходится» у каждого захода стенда', () => {
  const vse = [a, b, c, d, e, f, g, h, i2, i3, j, r1, r2, u1, p1, p2, v1, v2, v3, v4, v5, w1, w2];
  const plohie = vse.map((x) => x.krik.find((k) => k.startsWith('дистилляция: знаний записано')) ?? '').filter((s) => !/разнесено (\d+) из \1 тем — сходится/.test(s));
  if (plohie.length) throw new Error(plohie.length + ': ' + plohie[0].slice(0, 220));
});
proba('37 integration-note НЕ СХОДИТСЯ названо громко: тема без исхода и тема дважды', () => {
  const x = { tem: 3, zapisano: 1, ustarelo: 1 }; const y = { tem: 1, zapisano: 1, pusto: 1 };
  if (!/🔴 разнесено 2 из 3 тем — НЕ СХОДИТСЯ \(тема без исхода/.test(stroka_razneseno(x))) throw new Error(stroka_razneseno(x));
  if (!/НЕ СХОДИТСЯ \(тема посчитана дважды/.test(stroka_razneseno(y))) throw new Error(stroka_razneseno(y));
  if (stroka_razneseno({ tem: 2, zapisano: 1, povtorovSuda: 1 }) !== 'разнесено 2 из 2 тем — сходится') throw new Error('повторяет не входит в сумму');
});
proba('30 integration-note ни в одной строке ни одного захода нет «undefined»', () => {
  const vse = [a, b, c, d, e, f, g, h, i2, i3, j, r1, r2, u1, p1, p2, v1, v2, v3, v4, v5, w1, w2].flatMap((x) => x.krik).filter((k) => k.includes('undefined'));
  if (vse.length) throw new Error(vse.length + ': ' + vse[0].slice(0, 160));
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд суда отмены: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
