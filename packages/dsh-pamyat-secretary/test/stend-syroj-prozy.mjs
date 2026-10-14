// RU: Проверяем прозу вместо JSON-массива при выборе тем: содержательный сырой ответ сохраняется для ручного разбора и не называется отсутствием тем. Это отличается от отказа фильтра с текстом, пустоты без текста, отброшенного начала и бюджета, съеденного рассуждением. Частота прозы у живой модели после изменения промпта не проверяется.
// EN: Test prose instead of a JSON array during topic selection: preserve the meaningful raw response for manual processing rather than call it no topics. This differs from filter rejection with text, an empty response, discarded prefixes, and reasoning exhausting the budget. Live-model prose frequency after prompt changes is untested.
let distillirovat, sozdatSohranenieProzy;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ sozdatSohranenieProzy } = await import('../src/index.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160));
  process.exit(2);
}
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

let ok = 0, bed = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  try {
    // RU: sud() принимает только undefined или true; нижние проверки остальных значений недостижимы.
    // EN: sud() accepts only undefined or true; lower checks of other values are unreachable.
    sud(f());
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-prozy-'));
const otklonennye = join(kat, 'otklonennye');
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про предмет замера.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ числом.' } })].join('\n') + '\n', 'utf-8')));

// RU: Ответ прозой моделирует потерю указания JSON-формата перед длинным транскриптом.
// EN: A prose response models losing the JSON-format instruction before a long transcript.
const PROZA = 'В этом отрезке обсуждались три темы: во-первых, метки реестра; во-вторых, '
  + 'область поиска по мейнтейнеру; в-третьих, потеря знания при отказе разбора.';
let poslednijZapros = null;
const server = createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    try { poslednijZapros = JSON.parse(b); } catch { poslednijZapros = null; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: PROZA }],
                             stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 30 } }));
  });
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

const kriki = [];
const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-prozy',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenovSreza: 1 },
  krik: (s) => kriki.push(s),
  zapisat: () => {},
  sohranitProzu: sozdatSohranenieProzy({ putOtklonennyh: otklonennye }, (s) => kriki.push(s)),
});
server.close();
const fajly = () => { try { return readdirSync(otklonennye); } catch { return []; } };

proba('исход назван СВОИМ словом: proza, а не «тем нет»', () => {
  if (itog.ishod !== 'proza') return 'исход «' + itog.ishod + '», ожидался proza — иначе осмысленный ответ выдан за пустоту';
});

proba('🔴 ГЛАВНОЕ: сырой ответ СОХРАНЁН файлом — знание не исчезает', () => {
  const f = fajly().filter((x) => x.startsWith('proza-'));
  if (!f.length) return 'файла нет: ' + JSON.stringify(fajly());
  const t = readFileSync(join(otklonennye, f[0]), 'utf-8');
  if (!t.includes(PROZA)) return 'в файле нет самого ответа модели';
  if (!/причина:/.test(t)) return 'в шапке не названа причина, по которой разбор не удался';
});

proba('крик называет, что темы НЕ разобраны, а не что их нет', () => {
  const k = kriki.filter((s) => s.includes('[proza]'));
  if (!k.length) return 'ни одной строки [proza]: ' + kriki.join(' | ').slice(0, 140);
  if (!k.some((s) => /не разобраны/.test(s))) return 'крик не различает «не разобрано» и «нет тем»: ' + k[0];
});

proba('🔴 указание формата ПОВТОРЕНО В КОНЦЕ запроса, а не только в system', () => {
  if (!poslednijZapros) return 'запрос не разобран';
  const soob = JSON.stringify(poslednijZapros.messages ?? poslednijZapros);
  const i = soob.lastIndexOf('массив JSON');
  if (i < 0) return 'указания о формате в теле сообщения нет вовсе';
  // RU: Повтор указания формата должен стоять в конце после транскрипта.
  // EN: The repeated format instruction must appear at the end after the transcript.
  const hvost = soob.slice(-260);
  if (!/массив JSON/.test(hvost)) return 'указание есть, но НЕ в конце — оно утонет перед транскриптом';
});

proba('⚠️ сохранение прозы НЕ ОБЯЗАТЕЛЬНО: без него заход не падает', () => {
  // RU: Отсутствие нового обработчика сохранения прозы не должно ломать прежних вызывающих.
  // EN: Omitting the new prose-saving handler must not break existing callers.
  const est = readFileSync(new URL('../src/distill-shov.js', import.meta.url), 'utf-8');
  if (!/typeof sohranitProzu === 'function'/.test(est)) {
    return 'вызов не защищён проверкой типа — старый вызывающий получит падение вместо исхода';
  }
});

console.log(`\nитог: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
