// RU: Проверяем запись числа тем в метку: distillirovat вызывает temyOkna({okno, tem}) сразу после выбора и до первой статьи; index.js передаёт его в metki.dopisatTemy. Подставной сервер даёт две темы и короткие статьи. Коды: 0 — успех, 1 — расхождение, 2 — предмет не загрузился.
// EN: Test topic-count persistence in the marker: distillirovat calls temyOkna({okno, tem}) immediately after selection and before the first article; index.js forwards it to metki.dopisatTemy. The fake server returns two topics and short articles. Codes: 0 success, 1 mismatch, 2 subject failed to load.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs';
const MASKA_PUSTYSHKA_STENDA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
const VREMENNYE = [];
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k; };
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }); });
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));

const ISHODNIK_INDEX = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js'), 'utf8');
let distillirovat;
try { ({ distillirovat } = await import('../src/distill-shov.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try { const v = f(); if (v !== undefined && v !== true) throw new Error('тело вернуло «' + String(v).slice(0, 80) + '»');
    ok++; console.log('  ✅ ' + imya); }
  catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-tem-v-metke-'));
const zhurnal = join(kat, 's.jsonl.zstd');
const rech = 'Речь про число тем в метке. '.repeat(3);
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: rech } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: rech } })].join('\n') + '\n', 'utf-8')));
const sobytiya = [];   /* RU: В последовательности tem означает крючок тем, stat — запрос статьи.
 * EN: In the sequence, tem denotes the topic hook and stat an article request.
 */
let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (vyzovov === 1) {
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ theme: 'тема один', kind: 'urok' }, { theme: 'тема два', kind: 'urok' }]) }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  } else {
    sobytiya.push('stat');
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'Знание про тему.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  }
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });
const vyzovyTem = [];
const kriki = [];
await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA, putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 }, seansId: 'proba-tem',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres, maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 0, minTokenov: 0 },
  krik: (s) => kriki.push(s), zapisat: () => {},
  temyOkna: (x) => { vyzovyTem.push(x); sobytiya.push('tem'); } });
server.close();

proba('temyOkna позван РОВНО раз на окно: { okno: 1, tem: 2 }', () =>
  (vyzovyTem.length === 1 && vyzovyTem[0].okno === 1 && vyzovyTem[0].tem === 2) || JSON.stringify(vyzovyTem) + ' | ' + kriki.slice(-2).join(' | '));
proba('temyOkna позван ДО первой статьи (обрыв посреди статей застанет число в метке)', () =>
  (sobytiya[0] === 'tem' && sobytiya.includes('stat')) || JSON.stringify(sobytiya));
proba('проброс ЦЕЛ: index.js передаёт temyOkna в metki.dopisatTemy(metka, …)', () =>
  /temyOkna:\s*\(\{\s*okno,\s*tem\s*\}\)\s*=>\s*metki\.dopisatTemy\(metka,\s*okno,\s*tem\)/.test(ISHODNIK_INDEX) || 'проброса нет — число тем не дойдёт до метки');
console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
