// RU: Проверяем настоящий distillirovat: рассуждения подаются отдельным блоком как черновик, в голове и хвосте, для выбора тем и статьи. Настройка rassuzhdeniya и онлайн-файл проверяются поведением prichinaBezRassuzhdenij и порядком обработчика. Послушание модели требованию использовать только подтверждённое не проверяется.
// EN: Test real distillirovat: reasoning appears in a separate draft block in the head and tail for topic selection and articles. Test the rassuzhdeniya setting and online file through prichinaBezRassuzhdenij behavior and handler order. Model compliance with using only confirmed information is untested.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distillirovat } from '../src/distill-shov.js';
import { CHERNOVIK_NACHALO, CHERNOVIK_KONEC } from '../src/chtenie-zhurnala.js';
import { vyborTem, STATYA } from '../src/promty.js';
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

const kat = vremennyj(join(tmpdir(), 'stend-rassuzhdenij-'));
const FAJL = join(kat, 'rassuzhdeniya-vyklyucheny');
process.env.PAMYAT_RASSUZHDENIYA_VYKL = FAJL;
let prichinaBezRassuzhdenij;
try { ({ prichinaBezRassuzhdenij } = await import(new URL('../src/index.js', import.meta.url).href)); }
catch (e) { console.log('СЛЕПОТА: модуль не импортировался — ' + String(e?.message ?? e).slice(0, 120)); process.exit(2); }

let ok = 0, vsego = 0;
const proba = async (imya, f) => { vsego++; try { const v = await f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
const klyuchFajl = join(kat, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
const DUMA_G = 'DUMA-v-golove-dogadka', OTVET_G = 'OTVET-v-golove';
const DUMA_H = 'DUMA-v-hvoste-dogadka', OTVET_H = 'OTVET-v-hvoste';
const SOB = () => [
  { seq: 10, type: 'user/message', data: { content: 'вопрос про предмет' } },
  { seq: 11, type: 'assistant/message', data: { message: { content: [{ type: 'thinking', text: DUMA_G }, { type: 'text', text: OTVET_G }] } } },
  { seq: 12, type: 'assistant/message', data: { message: { content: [{ type: 'thinking', text: DUMA_H }, { type: 'text', text: OTVET_H }] } } },
  { seq: 13, type: 'compaction/start', data: { compactionId: 'c1' } },
  { seq: 14, type: 'compaction/summary', data: { compactionId: 'c1', shadowedSeqs: [10, 11] } },
];
let nomer = 0;
async function zahod(nastr = {}) {
  const zaprosy = []; let vyzov = 0; const krik = [];
  const otvety = [{ content: [{ type: 'text', text: '[{"theme":"тема-А","kind":"urok"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'СТАТЬЯ про предмет' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { zaprosy.push(JSON.parse(s)); } catch { zaprosy.push(null); } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
  await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    sobytiyaSessii: SOB(), dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000, compactionId: 'c1' }, seansId: 'rass' + (++nomer),
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres, maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 5, minTokenov: 1, hvost: 'vse', ...nastr },
    krik: (m) => krik.push(String(m)), zapisat: () => ({ id: 1, ishod: 'zapisano' }), blizhajshaya: () => ({ ishod: 'sravneno', id: 7, blizost: 0.1 }),
  });
  server.close();
  const t = (z) => JSON.stringify(z?.messages ?? '');
  return { krik, tem: t(zaprosy[0]), stati: zaprosy.slice(1).map(t) };
}
const obyornuto = (t, duma) => { const i = t.indexOf(duma); return i > 0 && t.lastIndexOf(CHERNOVIK_NACHALO, i) >= 0 && t.indexOf(CHERNOVIK_KONEC, i) > i; };

await proba('1 УМОЛЧАНИЕ (ключа нет): рассуждения головы и хвоста — черновиком с пометкой и в выборе тем, и в статье', async () => {
  const x = await zahod();
  if (!x.stati.length) throw new Error('статьи не было');
  for (const [imya, t] of [['выбор тем', x.tem], ['статья', x.stati[0]]]) {
    for (const d of [DUMA_G, DUMA_H]) if (!obyornuto(t, d)) throw new Error(`${imya}: ${d} не обёрнут пометкой черновика`);
    for (const o of [OTVET_G, OTVET_H]) if (!t.includes(o)) throw new Error(`${imya}: пропал ответ ${o}`);
  }
  if (!x.krik.some((k) => k.includes('рассуждения черновиком'))) throw new Error('строка хвоста не называет рассуждения');
});
await proba('2 rassuzhdeniya: false — рассуждений и пометки нет нигде, ответы на месте', async () => {
  const x = await zahod({ rassuzhdeniya: false });
  for (const t of [x.tem, ...x.stati]) {
    if (t.includes(DUMA_G) || t.includes(DUMA_H) || t.includes(CHERNOVIK_NACHALO)) throw new Error('рассуждения ушли при выключенных');
    if (!t.includes(OTVET_G) || !t.includes(OTVET_H)) throw new Error('пропали ответы');
  }
  if (!x.krik.some((k) => k.includes('рассуждения нет'))) throw new Error('строка хвоста не называет, что рассуждений нет');
});
await proba('3 ПРОМТЫ: выбор тем и статья объясняют черновик — «только подтверждённое/подтверждено», «понимание ПОЧЕМУ»', () => {
  for (const [imya, p] of [['выбор тем', vyborTem(['urok'])], ['статья', STATYA]]) {
    if (!p.includes(CHERNOVIK_NACHALO) || !p.includes('подтвержд') || !p.includes('понимание ПОЧЕМУ')) throw new Error(imya + ': правила черновика нет');
  }
});
await proba('4 ВЫКЛЮЧАТЕЛЬ: вкл → null; файл → «выключены файлом»; снят → null; настройка false старше — и при файле', () => {
  if (prichinaBezRassuzhdenij({ rassuzhdeniya: true }) !== null) throw new Error('выключено без причины');
  if (prichinaBezRassuzhdenij({}) !== null) throw new Error('умолчание (ключа нет) не «вкл»');
  writeFileSync(FAJL, '');
  const p = prichinaBezRassuzhdenij({ rassuzhdeniya: true }); if (!p || !p.includes('выключены файлом ' + FAJL)) throw new Error('файл: ' + p);
  const q = prichinaBezRassuzhdenij({ rassuzhdeniya: false }); if (!q || !q.includes('настройкой rassuzhdeniya')) throw new Error('старшинство: ' + q);
  rmSync(FAJL);
  if (prichinaBezRassuzhdenij({ rassuzhdeniya: true }) !== null) throw new Error('не включились после снятия файла');
});
await proba('5 ОБРАБОТЧИК: решение из prichinaBezRassuzhdenij на КАЖДОМ компакте, строкой в журнал, и оно же уходит в distillirovat', () => {
  const t = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const i = t.indexOf('const bezRassuzhdenij = prichinaBezRassuzhdenij(config);'), k = t.indexOf("krik('рассуждения агента дистиллятору: '"), j = t.indexOf('distillirovat({'), r = t.indexOf('rassuzhdeniya: !bezRassuzhdenij');
  if (i < 0 || k < i || j < k || r < j) throw new Error(`порядок: решение ${i}, строка ${k}, вызов ${j}, передача ${r}`);
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд рассуждений: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
