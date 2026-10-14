// RU: Проверяем передачу razmerOkna через Config → index.js → distill-shov. Потерянное значение даёт Infinity и одно окно, поэтому одного объявления ключа в схеме недостаточно: нужно проверить поведение нестандартного окна.
// EN: Test razmerOkna forwarding through Config → index.js → distill-shov. A lost value becomes Infinity and one window, so a schema declaration alone is insufficient: test a nondefault window’s behavior.
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
const ISHODNIK_SHOV = readFileSync(putJoin(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'distill-shov.js'), 'utf8');

let distillirovat;
try { ({ distillirovat } = await import('../src/distill-shov.js')); }
catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '», а обёртка судит по исключению: возврат молча зеленел бы');
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-razmer-'));
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про размер окна.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ числом.' } })].join('\n') + '\n', 'utf-8')));

let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (vyzovov === 1) {
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{ theme: 'размер окна', kind: 'urok' }]) }],
      stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  } else {
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'Знание про размер окна.' }],
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
  seansId: 'proba-razmera',
  // RU: Задаём нестандартное окно и проверяем доставленное значение.
  // EN: Set a nondefault window and check the forwarded value.
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 9, minTokenov: 0,
               razmerOkna: 500000 },
  krik: (s) => kriki.push(s),
  zapisat: () => {},
});
server.close();

// RU: Читаем только строку ОКНА:; тема статьи с теми же словами не должна стать свидетельством размера окна.
// EN: Read only the ОКНА: line; an article topic using the same words must not serve as evidence of window size.
const strokaOkon = () => kriki.find((s) => s.startsWith('ОКНА:') && /размер окна/.test(s)) ?? '';

proba('ГЛАВНОЕ: заданное окно 500000 ДОШЛО — строка печатает «размер окна 500000», а не тихий 300000', () => {
  const s = strokaOkon();
  if (!s) return 'строки «размер окна» нет вовсе';
  if (!/размер окна 500000/.test(s)) return 'окно не дошло (тихий откат 300000?): ' + s.slice(0, 160);
});

proba('звено (2) ЦЕЛО: index.js пробрасывает config.razmerOkna в nastrojka', () => {
  if (!/razmerOkna:\s*config\.razmerOkna/.test(ISHODNIK_INDEX)) return 'проброса нет — значение из конфига до distillirovat НЕ доходит';
});

proba('звено (3) ЦЕЛО: distill-shov потребляет nastrojka.razmerOkna с порогом > 0 и запасом Infinity (пусто = одно окно)', () => {
  if (!/Number\(nastrojka\.razmerOkna\)\s*>\s*0/.test(ISHODNIK_SHOV)) return 'потребление не через «> 0»';
  if (!/:\s*Infinity/.test(ISHODNIK_SHOV)) return 'запас падения не Infinity (пусто = одно окно)';
});

proba('звено (1) ЦЕЛО: ключ объявлен в схеме', () => {
  if (!/razmerOkna:\s*z\.number\(\)/.test(ISHODNIK_INDEX)) return 'razmerOkna в схеме нет — профиль его задать не сможет';
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
