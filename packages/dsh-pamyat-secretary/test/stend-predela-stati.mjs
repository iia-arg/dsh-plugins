/**
 * Стенд ЗАМЕРА ПРЕДЕЛА ДЛИНЫ СТАТЬИ (долг 92) — предмет: счёт превышений на ВЫХОДЕ.
 *
 * 🔴 ЗАЧЕМ. Промпт говорит «ПРЕДЕЛ: не длиннее 1000 знаков. Это не совет, а требование».
 * Замер по живой базе 06.09.2026: 45 из 92 записей длиннее — 49%, та же доля, что 04.09
 * (6 из 12). Требование, написанное заглавными, требованием не является: его исполнение —
 * свойство чужой модели. Единственная власть у нас — проверка на выходе.
 *
 * ЧЕГО НЕ ЛОВИТ: этот замер НЕ защита. Он не режет статью, не переспрашивает и не меняет
 * промпт — выбор лечения предмет автора замысла. Здесь только число, чтобы решать было по чему.
 * И он не видит записей, легших в память МИМО дистилляции (сводки, ручные) — предмет замера
 * ровно статьи этого захода.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { zstdCompressSync } from 'node:zlib';

let distillirovat, STATYA;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ STATYA } = await import('../src/promty.js'));
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

// Предел берём ИЗ ТОГО ЖЕ ИСТОЧНИКА, что и предмет: своё число в стенде разошлось бы с
// промптом молча, и проба стала бы про мою память о пределе, а не про предмет.
const m = /не длиннее (\d+) знаков/.exec(STATYA);
if (!m) { console.log('СЛЕПОТА: предел не вынимается из промпта — стенду не с чем сверять'); process.exit(2); }
const PREDEL = Number(m[1]);

const kat = mkdtempSync(join(tmpdir(), 'stend-predel-'));
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про предмет замера.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ числом.' } })].join('\n') + '\n', 'utf-8')));

// Три темы: короткая, ровно по пределу и длиннее. Границу проверяем СТРОГО: ровно предел
// превышением НЕ считается, иначе счёт завышался бы на каждой статье, попавшей в мишень.
const KOROTKAYA = 'к'.repeat(100);
const ROVNO = 'р'.repeat(PREDEL);
const DLINNAYA = 'д'.repeat(PREDEL + 350);
const OCHEN_DLINNAYA = 'о'.repeat(PREDEL + 700);

let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  const otdat = (t) => res.end(JSON.stringify({ content: [{ type: 'text', text: t }],
    stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
  if (vyzovov === 1) {
    otdat(JSON.stringify([{ theme: 'к', kind: 'urok' }, { theme: 'р', kind: 'urok' },
                          { theme: 'д', kind: 'urok' }, { theme: 'о', kind: 'urok' }]));
  } else if (vyzovov === 2) otdat(KOROTKAYA);
  else if (vyzovov === 3) otdat(ROVNO);
  else if (vyzovov === 4) otdat(DLINNAYA);
  else otdat(OCHEN_DLINNAYA);
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

const kriki = [];
const zapisano = [];
const itog = await distillirovat({
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba-predela',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 9, minTokenovSreza: 1 },
  krik: (s) => kriki.push(s),
  zapisat: (z) => zapisano.push(z),
});
server.close();

const stroka = () => kriki.find((s) => /предел статьи/.test(s)) ?? '';

proba('все четыре статьи ЗАПИСАНЫ: замер ничего не режет', () => {
  if (itog.zapisano !== 4) return 'записано ' + itog.zapisano + ', ожидалось 4';
  if (zapisano.length !== 4) return 'в память ушло ' + zapisano.length;
});

proba('ГЛАВНОЕ: превышений сосчитано ровно 2 из 4', () => {
  if (itog.dlinnyh !== 2) return 'превышений ' + itog.dlinnyh + ', ожидалось 2';
});

proba('статья РОВНО по пределу превышением НЕ считается', () => {
  // Если бы граница стояла как >=, счёт стал бы 3: ровная попала бы в превышения.
  // 🔴 Причину называем ТОЧНО. Первая редакция этой пробы на любое несовпадение счёта
  // писала «ровная сосчитана как превышение» — и при порче «предел зашит 1500» отправила
  // бы чинить границу вместо источника числа. Отказ, не называющий своей причины, ведёт
  // чинить не то.
  const est = zapisano.some((z) => z.soderzhim.length === PREDEL);
  if (!est) return 'ровной статьи в записанных нет — проба измеряет не то';
  if (itog.predelStati !== PREDEL) return 'предел захода ' + itog.predelStati + ' ≠ ' + PREDEL + ': эта проба про ГРАНИЦУ, а сбит ИСТОЧНИК числа';
  if (itog.dlinnyh === 3) return 'ровная сосчитана как превышение (граница >= вместо >)';
  if (itog.dlinnyh !== 2) return 'превышений ' + itog.dlinnyh + ' при ожидаемых 2 — причина не в границе';
});

proba('строка называет предел, счёт и НАИБОЛЬШУЮ длину', () => {
  const s = stroka();
  if (!s) return 'строки о пределе нет вовсе';
  if (!new RegExp('предел статьи ' + PREDEL + ' знаков: превысили 2 из 4').test(s)) return 'счёт не тот: ' + s.slice(0, 160);
  if (!new RegExp('наибольшая ' + (PREDEL + 700)).test(s)) return 'наибольшая длина не названа: ' + s.slice(0, 160);
});

proba('сказано, что это ЗАМЕР, а не защита — иначе прочтут как «предел соблюдён»', () => {
  const s = stroka();
  if (!/это замер, не защита/.test(s)) return 'не сказано, что предел не режет: ' + s.slice(0, 160);
});

proba('предел взят ИЗ ПРОМПТА, а не зашит рядом', () => {
  if (itog.predelStati !== PREDEL) return 'предел захода ' + itog.predelStati + ', в промпте ' + PREDEL;
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
