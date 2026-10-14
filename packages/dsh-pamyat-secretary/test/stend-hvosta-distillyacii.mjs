// RU: Проверяем настоящий distillirovat на подставных событиях и сервере модели: хвост только контекст, его место, istochnik и режимы hvost=vse/temy/net. Послушание модели правилу «темы только из разговора» здесь не проверяется.
// EN: Test real distillirovat with fake events and a model server: the tail is context only, including placement, istochnik, and hvost=vse/temy/net modes. Model compliance with “topics only from the conversation” is not tested here.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat, hvostSessii } from '../src/distill-shov.js';
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
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ok   ' + imya); } catch (e) { console.log('  FAIL ' + imya + ' — ' + e.message); } };
const kat = vremennyj(join(tmpdir(), 'stend-hvosta-dist-'));
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
const GOLOVA = 'ГОЛОВА-разговор-про-предмет-А';
const HVOST = 'ХВОСТ-продолжение-про-предмет-Б';
const POSLE = 'ПОСЛЕ-СЖАТИЯ-новый-ход';
const SOB = (id = 'c1') => [
  { seq: 10, type: 'user/message', data: { content: GOLOVA + ' вопрос' } },
  { seq: 11, type: 'assistant/message', data: { content: GOLOVA + ' ответ' } },
  { seq: 12, type: 'user/message', data: { content: HVOST + ' вопрос' } },
  { seq: 13, type: 'assistant/message', data: { content: HVOST + ' ответ' } },
  { seq: 14, type: 'compaction/start', data: { compactionId: id } },
  { seq: 15, type: 'compaction/summary', data: { compactionId: id } },
  { seq: 16, type: 'user/message', data: { content: POSLE } },
];
// RU: Каждый заход имеет свой seansId: повтор того же среза отбрасывается защитой от удвоения.
// EN: Each run has its own seansId: duplicate protection skips a repeated slice.
let nomerZahoda = 0;
async function zahod({ hvost, sobytiya = SOB(), compactionId = 'c1' }) {
  const seansId = 'proba' + (++nomerZahoda);
  const zaprosy = []; let vyzov = 0; const krik = []; const zapisano = [];
  const otvety = [{ content: [{ type: 'text', text: '[{"theme":"тема-А","kind":"urok"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'СТАТЬЯ про предмет А' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { zaprosy.push(JSON.parse(s)); } catch { zaprosy.push(null); } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
  const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    sobytiyaSessii: sobytiya, dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId }, seansId,
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres, maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 5, minTokenov: 1, ...(hvost ? { hvost } : {}) },
    krik: (m) => krik.push(String(m)), zapisat: (z) => { zapisano.push(z); return { id: 1, ishod: 'zapisano' }; },
    blizhajshaya: () => ({ ishod: 'sravneno', id: 7, blizost: 0.8 }),
  });
  server.close();
  const tekst = (z) => JSON.stringify(z?.messages ?? z ?? '');
  return { seansId, itog, krik, zapisano, tem: tekst(zaprosy[0]), stati: zaprosy.slice(1).map(tekst), sisTem: JSON.stringify(zaprosy[0]?.system ?? ''), sisStat: JSON.stringify(zaprosy[1]?.system ?? '') };
}
const bloki = (t) => t.includes('=== РАЗГОВОР') && t.includes('=== ПРОДОЛЖЕНИЕ') && t.indexOf('=== РАЗГОВОР') < t.indexOf(GOLOVA) && t.indexOf(GOLOVA) < t.indexOf('=== ПРОДОЛЖЕНИЕ') && t.indexOf('=== ПРОДОЛЖЕНИЕ') < t.indexOf(HVOST);

await proba('1 «temy»: хвост в выборе тем блоком ПРОДОЛЖЕНИЕ, в статье — нет; новое после сжатия не попало', async () => {
  const x = await zahod({ hvost: 'temy' });
  if (!bloki(x.tem)) throw new Error('в выборе тем нет блоков РАЗГОВОР → голова, ПРОДОЛЖЕНИЕ → хвост');
  if (!x.stati.length || x.stati.some((s) => s.includes(HVOST) || s.includes('=== ПРОДОЛЖЕНИЕ'))) throw new Error('хвост попал в статью при «temy»');
  if ([x.tem, ...x.stati].some((s) => s.includes(POSLE))) throw new Error('ход после сжатия попал в запрос');
  if (!x.krik.some((k) => k.includes('хвост дистиллятору: seq 12–13') && k.includes('«temy»'))) throw new Error('строки о хвосте нет');
});
await proba('1б УМОЛЧАНИЕ — «vse» (слово владельца 22:35): без ключа хвост и в выборе тем, и в статье', async () => {
  const x = await zahod({});
  if (!bloki(x.tem) || !x.stati.length || !x.stati.every(bloki)) throw new Error('умолчание не «vse»');
  if (!x.krik.some((k) => k.includes('режим «vse»'))) throw new Error('строка не называет режим «vse»');
});
await proba('2 ИСТОЧНИК — ДИАПАЗОН ГОЛОВЫ (<seans>#10-11#okno1), не хвоста', async () => {
  const x = await zahod({ hvost: 'vse' });
  if (x.zapisano.length !== 1 || x.zapisano[0].istochnik !== x.seansId + '#10-11#okno1') throw new Error('istochnik ' + JSON.stringify(x.zapisano.map((z) => z.istochnik)));
});
await proba('3 «vse»: хвост и в выборе тем, и в статье', async () => {
  const x = await zahod({ hvost: 'vse' });
  if (!bloki(x.tem) || !x.stati.length || !x.stati.every(bloki)) throw new Error('при «vse» хвоста нет в статье');
});
await proba('4 «net»: хвоста нет нигде, блоков нет — как до a67', async () => {
  const x = await zahod({ hvost: 'net' });
  if ([x.tem, ...x.stati].some((s) => s.includes(HVOST) || s.includes('=== РАЗГОВОР'))) throw new Error('хвост/блоки при «net»');
  if (!x.tem.includes(GOLOVA)) throw new Error('головы нет');
});
await proba('5 НЕТ НАЧАЛА ЭТОГО СЖАТИЯ: хвост не подан, строка с причиной, разбор по голове', async () => {
  const x = await zahod({ compactionId: 'drugoe' });
  if (x.tem.includes(HVOST) || x.tem.includes('=== РАЗГОВОР')) throw new Error('хвост подан без начала сжатия');
  if (!x.krik.some((k) => k.includes('хвост дистиллятору НЕ подан (не найдено compaction/start этого сжатия)'))) throw new Error('строки с причиной нет');
});
await proba('6 ПРОМТЫ: выбор тем и статья велят брать ТОЛЬКО из РАЗГОВОРА', async () => {
  const x = await zahod({ hvost: 'vse' });
  if (!x.sisTem.includes('темы выбирай ТОЛЬКО из блока РАЗГОВОР')) throw new Error('в промте выбора тем нет правила');
  if (!x.sisStat.includes('знание пиши ТОЛЬКО из блока РАЗГОВОР')) throw new Error('в промте статьи нет правила');
});
await proba('7 ЗАМЕР БЛИЗОСТИ ПЕЧАТАЕТСЯ (не фильтр): ≥0.5 у 1, ≥0.7 у 1, ≥0.9 у 0; знание записано', async () => {
  const x = await zahod({});
  if (!x.krik.some((k) => k.includes('близость к уже записанному ≥0.5 у 1, ≥0.7 у 1, ≥0.9 у 0 знаний (замер, не фильтр)'))) throw new Error('строки замера нет: ' + x.krik.filter((k) => k.includes('новизна')).join(' | ').slice(0, 160));
  if (x.zapisano.length !== 1) throw new Error('замер стал фильтром: записано ' + x.zapisano.length);
});
await proba('8 ЗАТЕНЁННОЕ ВРАЗБРОС (integration-note): незатенённое между головой — в хвосте; затенённое прошлым сжатием и новое после — нет', async () => {
  const sob = [
    { seq: 10, type: 'user/message', data: { content: GOLOVA + ' 1' } },
    { seq: 11, type: 'user/message', data: { content: 'OSTALSYA-u-agenta-mezhdu-golovoj' } },
    { seq: 12, type: 'assistant/message', data: { content: GOLOVA + ' 2' } },
    { seq: 13, type: 'user/message', data: { content: 'PROSHLAYA-SVODKA-zatenena-proshlym' } },
    { seq: 14, type: 'compaction/summary', data: { compactionId: 'c0', shadowedSeqs: [13] } },
    { seq: 15, type: 'assistant/message', data: { content: [{ type: 'thinking', text: 'RASSUZHDENIE-v-hvoste' }, { type: 'text', text: HVOST }] } },
    { seq: 16, type: 'compaction/start', data: { compactionId: 'c1' } },
    { seq: 17, type: 'compaction/summary', data: { compactionId: 'c1', shadowedSeqs: [10, 12] } },
    { seq: 18, type: 'user/message', data: { content: POSLE } },
  ];
  const h = hvostSessii(sob, [10, 12], { compactionId: 'c1', shadowedSeqs: [10, 12] });
  if (h.pochemu) throw new Error('хвост не подан: ' + h.pochemu);
  if (!h.tekst.includes('OSTALSYA-u-agenta-mezhdu-golovoj')) throw new Error('незатенённое между головой потеряно (граница «seq > последнего затенённого»)');
  if (!h.tekst.includes(HVOST) || !h.tekst.includes('RASSUZHDENIE-v-hvoste')) throw new Error('нет хвоста или рассуждения в нём');
  for (const ne of [GOLOVA, 'PROSHLAYA-SVODKA', POSLE]) if (h.tekst.includes(ne)) throw new Error('в хвост попало ' + ne);
  if (h.soobshchenij !== 2 || h.ot !== 11 || h.do !== 15) throw new Error(`счёт ${h.soobshchenij}, seq ${h.ot}–${h.do}, ждали 2, 11–15`);
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд хвоста дистиллятора: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
