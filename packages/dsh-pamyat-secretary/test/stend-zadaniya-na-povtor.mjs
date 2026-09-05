/**
 * Стенд ЗАДАНИЯ НА ПОВТОР (долг 119) — предмет: отказ модели БЕЗ текста.
 *
 * 🔴 ЧЕМ ЭТОТ ОТКАЗ ОТЛИЧАЕТСЯ ОТ ОТКАЗА ФИЛЬТРА. При отказе фильтра текст ЕСТЬ, его надо
 * спасти. Здесь текста нет вовсе — спасать нечего, надо ПОВТОРИТЬ. А повтор по тому же
 * срезу не даётся: заход по срезу пропускается один раз, событие компакта одноразово.
 * Значит знание по теме не появится никогда, если не сходить рукой, — и единственное, что
 * можно сделать честно, это не потерять тему из виду.
 *
 * ЧЕГО НЕ ЛОВИТ: сам повтор здесь не проверяется — его не делает никто, и это названо
 * решением, а не пропуском.
 */
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';

let distillirovat, sozdatZadanie;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ sozdatZadanie } = await import('../src/index.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140));
  process.exit(2);
}

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ, а прогонщик синхронный');
    if (typeof v === 'string') throw new Error(v);
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = mkdtempSync(join(tmpdir(), 'stend-zadaniya-'));
const otklonennye = join(kat, 'otklonennye');
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про предмет замера.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ числом.' } })].join('\n') + '\n', 'utf-8')));

// Первый вызов — список тем; второй — ответ БЕЗ блока text (ровно живой случай 05.09.2026).
let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (vyzovov === 1) {
    res.end(JSON.stringify({ content: [{ type: 'text', text: '[{"theme":"Отвергнутый файл называется вслух","kind":"urok"}]' }],
                             stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  } else {
    res.end(JSON.stringify({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 0 } }));
  }
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

const kriki = [];
const itog = await distillirovat({
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-zadaniya',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenovSreza: 1 },
  krik: (s) => kriki.push(s),
  zapisat: () => {},
  zadanie: sozdatZadanie({ putOtklonennyh: otklonennye }, (s) => kriki.push(s)),
});
server.close();

const fajly = () => { try { return readdirSync(otklonennye); } catch { return []; } };

proba('отказ без текста сосчитан как отказ, а не как «пусто по теме»', () => {
  if (itog.otkazov < 1) return 'отказов ' + itog.otkazov + ', ожидался хотя бы один';
});

proba('ГЛАВНОЕ: задание на повтор ПОЛОЖЕНО файлом', () => {
  const z = fajly().filter((f) => f.startsWith('zadanie-'));
  if (z.length !== 1) return 'файлов задания ' + z.length + ' (' + fajly().join(',') + ')';
});

proba('в задании названы ТЕМА и СРЕЗ — иначе повтор рукой невозможен', () => {
  const z = fajly().filter((f) => f.startsWith('zadanie-'))[0];
  if (!z) return 'задания нет';
  const d = JSON.parse(readFileSync(join(otklonennye, z), 'utf8'));
  if (!d.tema) return 'темы в задании нет';
  if (!d.srez || !/#10-11$/.test(String(d.srez))) return 'срез не назван или не тот: ' + d.srez;
  if (!d.prichina) return 'причина не названа';
});

proba('число заданий названо в сводке захода', () => {
  const stroka = kriki.find((s) => /дистилляция: тем/.test(s)) ?? '';
  if (!/заданий на повтор 1/.test(stroka)) return 'в сводке нет числа заданий: ' + stroka.slice(0, 160);
});

proba('строка о сохранении задания напечатана', () => {
  // Проверяется отдельно: без функции задание не кладётся, и это НЕ должно выглядеть как
  // «заданий не было». Здесь только форма строки — сам заход уже прогнан выше.
  const est = kriki.some((s) => /задание на повтор сохранено/.test(s));
  if (!est) return 'нет строки о сохранении задания';
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
