// RU: Проверяем сохранение отброшенного начала транскрипта: predelOkon ограничивает число последних окон по razmerOkna, а не число символов predelZnakov. Допустимый текст вне хвоста не должен исчезать без следа. Предпочтение хвоста началу и качество извлечения не проверяются; для них нужен сравнительный разбор одного среза.
// EN: Test preservation of the discarded transcript prefix: predelOkon limits the number of final windows by razmerOkna, not the predelZnakov character count. Valid text outside the tail must not disappear without a trace. Tail-versus-prefix preference and extraction quality are untested; they require comparative processing of one slice.
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
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

let distillirovat, sozdatOtbroshennoe;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ sozdatOtbroshennoe } = await import('../src/index.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140));
  process.exit(2);
}

let ok = 0, bed = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  try {
    // RU: sud() принимает только undefined или true; дополнительные проверки остальных значений ниже были бы недостижимы.
    // EN: sud() accepts only undefined or true; additional checks of other values below would be unreachable.
    sud(f());
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-otbrosh-'));
const otklonennye = join(kat, 'otklonennye');
const zhurnal = join(kat, 's.jsonl.zstd');

// RU: Метки НАЧАЛО и КОНЕЦ должны попасть в разные половины.
// EN: НАЧАЛО and КОНЕЦ markers must land in different halves.
const METKA_NACHALA = 'МЕТКА-НАЧАЛА-СРЕЗА';
const METKA_KONCA = 'МЕТКА-КОНЦА-СРЕЗА';
const nabivka = 'слово '.repeat(400);
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: METKA_NACHALA + ' ' + nabivka } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: nabivka + ' ' + METKA_KONCA } })].join('\n') + '\n', 'utf-8')));

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ content: [{ type: 'text', text: '[]' }],
                           stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

const nastrojka = (predel) => ({ klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
  maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenovSreza: 1, razmerOkna: 1000, predelOkon: predel });

const kriki = [];
await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-otbrosh',
  nastrojka: nastrojka(1),
  krik: (s) => kriki.push(s),
  zapisat: () => {},
  otbroshennoe: sozdatOtbroshennoe({ putOtklonennyh: otklonennye }, (s) => kriki.push(s)),
});

// RU: Повторяем без обработчика сохранения: отсутствие обработчика должно быть названо.
// EN: Repeat without the saving handler: its absence must be reported.
const kriki2 = [];
await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-otbrosh-bez',
  nastrojka: nastrojka(1),
  krik: (s) => kriki2.push(s),
  zapisat: () => {},
});
server.close();

const fajly = () => { try { return readdirSync(otklonennye); } catch { return []; } };
const nash = () => fajly().filter((f) => f.startsWith('nachalo-sreza-'));

proba('ГЛАВНОЕ: отброшенное начало ПОЛОЖЕНО файлом', () => {
  if (nash().length !== 1) return 'файлов начала ' + nash().length + ' (' + fajly().join(',') + ')';
});

proba('в файле лежит НАЧАЛО, а не второй раз хвост', () => {
  const f = nash()[0];
  if (!f) return 'файла нет';
  const t = readFileSync(join(otklonennye, f), 'utf8');
  if (!t.includes(METKA_NACHALA)) return 'метки начала в файле нет — сохранили не тот кусок';
  if (t.includes(METKA_KONCA)) return 'в файле метка КОНЦА: сохранён хвост, а он и так уехал в модель';
});

proba('шапка называет срез и оба числа — иначе разобрать рукой нечем', () => {
  const f = nash()[0];
  if (!f) return 'файла нет';
  const t = readFileSync(join(otklonennye, f), 'utf8');
  if (!/# срез: proba-otbrosh#10-11/.test(t)) return 'срез не назван или не тот';
  if (!/# было знаков: \d+, взято хвостом: \d+/.test(t)) return 'чисел «было/взято» в шапке нет';
  if (!/в память НЕ попало/.test(t)) return 'не сказано, что знание отсюда в память не попало';
});

proba('крик называет ДОЛЮ отброшенного, а не только факт обрезки', () => {
  const s = kriki.find((x) => /ОХВАТ НЕ ПОЛНЫЙ/.test(x)) ?? '';
  if (!/отброшено с НАЧАЛА \d+ \(\d+%\)/.test(s)) return 'доли в крике нет: ' + s.slice(0, 160);
});

proba('строка о сохранении напечатана и говорит, что в память это НЕ попало', () => {
  const s = kriki.find((x) => /отброшенное начало сохранено/.test(x)) ?? '';
  if (!s) return 'нет строки о сохранении';
  if (!/в память НЕ попали/.test(s)) return 'строка не предупреждает, что знание не в памяти: ' + s.slice(0, 160);
});

proba('БЕЗ обработчика — сказано вслух, а не молчание («старый монтаж»)', () => {
  const s = kriki2.find((x) => /отброшенное начало НЕ сохранено/.test(x)) ?? '';
  if (!s) return 'при отсутствии обработчика нет ни строки — потеря выглядела бы как её отсутствие';
  if (!/текст есть, и он потерян/.test(s)) return 'не сказано, что текст БЫЛ: ' + s.slice(0, 160);
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
