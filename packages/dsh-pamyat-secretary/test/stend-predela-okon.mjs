// RU: Проверяем передачу predelOkon из Config в distillirovat: потеря настройки не должна незаметно отключить предел числом ноль.
// EN: Test predelOkon forwarding from Config to distillirovat: losing the setting must not silently disable the limit as zero.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join as putJoin } from 'node:path';
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

const ISHODNIK_INDEX = readFileSync(putJoin(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js'), 'utf8');

let distillirovat;
try { ({ distillirovat } = await import('../src/distill-shov.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело вернуло «' + String(v).slice(0, 60) + '»');
    ok++; console.log('  ✅ ' + imya); }
  catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-okon-'));
const zhurnal = join(kat, 's.jsonl.zstd');
// RU: Два сообщения примерно по 90 символов при окне 50 создают больше двух окон; предел 1 должен обрезать.
// EN: Two messages of roughly 90 characters with window size 50 produce more than two windows; limit 1 must truncate.
const rech = 'Речь про предел окон. '.repeat(4);
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: rech } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: rech } })].join('\n') + '\n', 'utf-8')));

let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (vyzovov === 1) {
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ theme: 'предел окон', kind: 'urok' }]) }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  } else {
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'Знание про предел окон.' }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  }
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

const kriki = [];
await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-okon',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 9, minTokenov: 0,
               razmerOkna: 50, predelOkon: 1 },
  krik: (s) => kriki.push(s),
  zapisat: () => {},
});
server.close();

proba('ГЛАВНОЕ: predelOkon=1 ДОШЁЛ — обрезка сработала и кричит «ОХВАТ НЕ ПОЛНЫЙ»', () => {
  const s = kriki.find((x) => /ОХВАТ НЕ ПОЛНЫЙ/.test(x));
  if (!s) return 'строки обрезки нет — predelOkon тихо потерян (0): ' + kriki.join(' | ').slice(0, 200);
});

proba('проброс ЦЕЛ: index.js передаёт config.predelOkon в nastrojka', () => {
  if (!/predelOkon:\s*config\.predelOkon/.test(ISHODNIK_INDEX)) return 'проброса нет — значение из конфига не доходит';
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
