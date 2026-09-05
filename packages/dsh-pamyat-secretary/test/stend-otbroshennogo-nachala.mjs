/**
 * Стенд ОТБРОШЕННОГО НАЧАЛА ТРАНСКРИПТА (долг 87) — предмет: обрезка по predelZnakov.
 *
 * 🔴 ЧЕМ ЭТА ПОТЕРЯ ОТЛИЧАЕТСЯ ОТ ДВУХ ПРЕЖНИХ. При отказе фильтра текст отклонён, при
 * отказе модели текста нет вовсе. Здесь текст ЕСТЬ и он законен — он просто НЕ ВЛЕЗ:
 * slice(-predelZnakov) берёт хвост, начало уходит совсем. Замер по журналу за неделю
 * (06.09.2026): обрезка сработала 3 раза, наибольшая потеря 412897 → 200000, то есть 52%.
 * Повтор по срезу не даётся, событие компакта одноразово, журнал ротируется — значит
 * отброшенное исчезало насовсем.
 *
 * ЧЕГО НЕ ЛОВИТ: правильность выбора «хвост против начала». Это гипотеза долга 87, и
 * проверяется она двумя платными заходами по одному срезу, а не стендом. Здесь только то,
 * что отброшенное не пропадает без следа — что бы мы ни выбрали.
 */
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';

let distillirovat, sozdatOtbroshennoe;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ sozdatOtbroshennoe } = await import('../src/index.js'));
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

const kat = mkdtempSync(join(tmpdir(), 'stend-otbrosh-'));
const otklonennye = join(kat, 'otklonennye');
const zhurnal = join(kat, 's.jsonl.zstd');

// Метки-опознаватели: НАЧАЛО и КОНЕЦ должны попасть в разные половины.
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
  maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenovSreza: 1, predelZnakov: predel });

const kriki = [];
await distillirovat({
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-otbrosh',
  nastrojka: nastrojka(1000),
  krik: (s) => kriki.push(s),
  zapisat: () => {},
  otbroshennoe: sozdatOtbroshennoe({ putOtklonennyh: otklonennye }, (s) => kriki.push(s)),
});

// Второй заход — БЕЗ обработчика, чтобы проверить, что молчания не будет.
const kriki2 = [];
await distillirovat({
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-otbrosh-bez',
  nastrojka: nastrojka(1000),
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
  if (!/# было знаков: \d+, взято хвостом: 1000/.test(t)) return 'чисел «было/взято» в шапке нет';
  if (!/в память НЕ попало/.test(t)) return 'не сказано, что знание отсюда в память не попало';
});

proba('крик называет ДОЛЮ отброшенного, а не только факт обрезки', () => {
  const s = kriki.find((x) => /транскрипт обрезан/.test(x)) ?? '';
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
