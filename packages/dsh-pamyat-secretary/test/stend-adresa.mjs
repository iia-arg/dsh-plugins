// RU: Проверяем передачу adres из Config в sprosit: вызов должен идти на адрес подставного провайдера, а не на рабочий адрес.
// EN: Test adres forwarding from Config to sprosit: the call must reach the fake provider’s address rather than the production address.
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

const kat = vremennyj(join(tmpdir(), 'stend-adres-'));
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про адрес.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ.' } })].join('\n') + '\n', 'utf-8')));

let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (vyzovov === 1) {
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ theme: 'адрес', kind: 'urok' }]) }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  } else {
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'Знание про адрес.' }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  }
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-adres',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 9, minTokenov: 0,
               },
  krik: () => {},
  zapisat: () => {},
});
server.close();

proba('ГЛАВНОЕ: adres ДОШЁЛ — вызов ушёл на подменённый стенд (обращений ≥ 2, не на боевой)', () => {
  if (vyzovov < 2) return 'стенд не получил вызовов (было ' + vyzovov + ') — adres потерян, ушло на боевой';
});

proba('проброс ЦЕЛ: index.js передаёт config.adres в nastrojka', () => {
  if (!/adres:\s*config\.adres/.test(ISHODNIK_INDEX)) return 'проброса нет — значение из конфига не доходит';
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
