// RU: Проверяем повтор выбора тем: ne-dochitala без text повторяется один раз с удвоенным бюджетом, pusto — с прежним. После отказа сохраняется задание окна со всеми seqs и красная строка охвата вместо «тем нет». Успех живой модели на увеличенном бюджете не проверяется. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test topic-selection retries: ne-dochitala without text retries once with double the budget; pusto uses the same budget. After failure, save a window task with all seqs and an alerting coverage line rather than “no topics.” Live-model success with a larger budget is untested. Codes: 0 success, 1 mismatch, 2 unobservable.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs';
const MASKA_PUSTYSHKA_STENDA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const VREMENNYE = [];
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k; };
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }); });
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));
let distillirovat;
try { ({ distillirovat } = await import('../src/distill-shov.js')); }
catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }
let ok = 0, bed = 0;
const proba = (imya, f) => { let v; try { v = f(); } catch (e) { v = 'исключение: ' + e.message; }
  if (v === undefined || v === true) { ok++; console.log('  ✅ ' + imya); } else { bed++; console.log('  ❌ ' + imya + ' — ' + String(v).slice(0, 220)); } };
const kat = vremennyj(join(tmpdir(), 'stend-vybora-tem-'));
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(Array.from({ length: 20 }, (_, i) => JSON.stringify({
  seq: 10 + i, type: i % 2 ? 'assistant/message' : 'user/message', data: { content: 'Обсуждение предмета замера номер ' + i + ' и объявленные границы.' } })).join('\n') + '\n', 'utf-8')));
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });
const TEMY = { content: [{ type: 'text', text: '[{"theme":"единственная тема","kind":"urok"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
const TEM_NET = { content: [{ type: 'text', text: '[]' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 2 } };
const PUSTO = { content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 0 } };
const NE_DOCHITALA = { content: [], stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 100 } };
const STATYA = { content: [{ type: 'text', text: 'Статья с длинными словами для проверки записи знания.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 30 } };
let srez = 10;
async function zahod(otvety) {   /* RU: otvety[n] задаёт n-й ответ; индекс 0 — первый выбор тем.
 * EN: otvety[n] selects response n; index 0 is the first topic-selection call.
 */
  const budgety = []; let n = 0;
  const server = createServer((req, res) => { let telo = ''; req.on('data', (c) => { telo += c; });
    req.on('end', () => { try { budgety.push(JSON.parse(telo).max_tokens); } catch { budgety.push(null); }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(n++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
  const kriki = [], zapisano = [], zadaniya = [];
  const seqs = [srez, srez + 1, srez + 2]; srez += 3;
  const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA, putZhurnala: zhurnal, dannye: { shadowedSeqs: seqs, shadowedTokenCount: 5000 },
    seansId: 'proba-vybora', nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres, maxTokenovTem: 100, maxTokenovStati: 1000, predelTem: 5, minTokenovSreza: 1 },
    krik: (s) => kriki.push(s), zapisat: (z) => zapisano.push(z), zadanie: (z) => zadaniya.push(z) });
  server.close();
  return { itog, kriki, budgety, zapisano, zadaniya, seqs };
}
const nd = await zahod([NE_DOCHITALA, TEMY, STATYA]);
proba('«не дочитала» на выборе тем → повтор с УДВОЕННЫМ бюджетом (100 → 200)', () => nd.budgety[0] === 100 && nd.budgety[1] === 200 || 'бюджеты ' + JSON.stringify(nd.budgety));
proba('удавшийся повтор: темы разобраны, знание записано, сказано «УДАЛСЯ»', () => (nd.zapisano.length === 1 && nd.kriki.some((s) => /повтор выбора тем .* УДАЛСЯ/.test(s)) && nd.itog.povtorov === 1 && nd.itog.povtorov_udalos === 1) || JSON.stringify({ z: nd.zapisano.length, p: nd.itog.povtorov, u: nd.itog.povtorov_udalos }));
const pu = await zahod([PUSTO, TEMY, STATYA]);
proba('«пусто» на выборе тем → повтор ТЕМ ЖЕ бюджетом', () => (pu.budgety[0] === 100 && pu.budgety[1] === 100 && pu.zapisano.length === 1) || 'бюджеты ' + JSON.stringify(pu.budgety));
const up = await zahod([NE_DOCHITALA, NE_DOCHITALA]);
proba('ГЛАВНОЕ: повтор ровно ОДИН — вызовов 2', () => up.budgety.length === 2 || 'вызовов ' + up.budgety.length);
proba('не помогло → задание на повтор ОКНА со ВСЕМИ seqs, в итоге заданий 1', () => {
  const z = up.zadaniya[0];
  if (up.zadaniya.length !== 1) return 'заданий ' + up.zadaniya.length;
  if (JSON.stringify(z.seqs) !== JSON.stringify(up.seqs)) return 'seqs задания ' + JSON.stringify(z.seqs) + ' ≠ среза ' + JSON.stringify(up.seqs);
  if (z.ishod !== 'vybor-tem-ne-dochitala' || !/выбор тем окна 1\/1/.test(z.tema)) return 'задание не про окно: ' + JSON.stringify(z);
  return (up.itog.zadanij ?? 0) === 1 || 'itog.zadanij ' + up.itog.zadanij;
});
proba('не помогло → охват по темам КРАСНЫЙ «выбор тем НЕ состоялся», а не «нечего брать»', () => {
  const s = up.kriki.join(' | ');
  if (/нечего брать», а не «взято всё/.test(s)) return 'ложное «нечего брать»';
  return /🔴 ОХВАТ ПО ТЕМАМ: выбор тем НЕ состоялся/.test(s) && /заданий на повтор 1/.test(s) || s.slice(-300);
});
const srazu = await zahod([TEMY, STATYA]);
proba('ВТОРАЯ ПОЛОВИНА: выбор тем с первого раза — повтора нет, вызовов 2, заданий 0', () => (srazu.budgety.length === 2 && srazu.itog.povtorov === 0 && srazu.zadaniya.length === 0) || JSON.stringify({ v: srazu.budgety.length, p: srazu.itog.povtorov }));
const net = await zahod([TEM_NET]);
proba('ПАРА: модель назвала НОЛЬ тем (ответ есть) — прежнее «нечего брать», без задания и без 🔴', () => {
  const s = net.kriki.join(' | ');
  return (/нечего брать», а не «взято всё/.test(s) && !/🔴 ОХВАТ ПО ТЕМАМ/.test(s) && net.zadaniya.length === 0) || s.slice(-300);
});
console.log('  итог: ' + ok + ' из ' + (ok + bed));
process.exit(bed === 0 ? 0 : 1);
