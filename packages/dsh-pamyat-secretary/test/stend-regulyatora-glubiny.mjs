// RU: Проверяем регулятор глубины: отсутствие razmerOkna или ноль означает одно цельное окно по умолчанию, положительное число — дробление.
// EN: Test the depth controller: absent razmerOkna or zero means one complete window by default; a positive value enables splitting.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';
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

let distillirovat;
try { ({ distillirovat } = await import('../src/distill-shov.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело вернуло «' + String(v).slice(0, 60) + '»');
    ok++; console.log('  ✅ ' + imya); }
  catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-glubina-'));
const zhurnal = join(kat, 's.jsonl.zstd');
const rech = 'Речь про глубину. '.repeat(12);   /* RU: Речь длиной примерно 240 символов.
 * EN: Speech of roughly 240 characters.
 */
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: rech } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: rech } })].join('\n') + '\n', 'utf-8')));

function server() {
  let n = 0;
  const srv = createServer((req, res) => {
    req.on('data', () => {}); req.on('end', () => {
      n++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([]) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  });
  return srv;
}
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

async function gon(kriki, razmerOkna) {
  const srv = server();
  await new Promise((g) => srv.listen(0, '127.0.0.1', g));
  const adres = `http://127.0.0.1:${srv.address().port}/v1/messages`;
  const nastrojka = { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
    maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenov: 0 };
  if (razmerOkna !== undefined) nastrojka.razmerOkna = razmerOkna;
  await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA, putZhurnala: zhurnal, dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
    seansId: 'proba-glubina-' + (razmerOkna === undefined ? 'odno' : razmerOkna), nastrojka, krik: (s) => kriki.push(s), zapisat: () => {} });
  srv.close();
}

const k1 = [];
await gon(k1, undefined);
proba('пусто/0 = ОДНО окно: «размер окна не задан (одно окно)» и «1 из 1»', () => {
  const s = k1.find((x) => /ОКНА:/.test(x)) ?? '';
  if (!/1 из 1 окон/.test(s)) return 'не «1 из 1»: ' + s.slice(0, 120);
  if (!/размер окна не задан \(одно окно\)/.test(s)) return 'нет «не задан (одно окно)»: ' + s.slice(0, 120);
});

const k2 = [];
await gon(k2, 50);
proba('число = дробление: «размер окна 50» и окон больше одного', () => {
  const s = k2.find((x) => /ОКНА:/.test(x)) ?? '';
  if (!/размер окна 50/.test(s)) return 'нет «размер окна 50»: ' + s.slice(0, 120);
  if (/1 из 1 окон/.test(s)) return 'при заданном размере окно не раздробилось: ' + s.slice(0, 120);
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
