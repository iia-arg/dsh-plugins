/**
 * Стенд: модель на ВЫБОРЕ ТЕМ вернула ПРОЗУ вместо массива JSON.
 *
 * 🔴 ПЯТАЯ ПРИЧИНА ПОТЕРИ ЗНАНИЯ, и лечится она иначе четырёх прежних. У беды одно имя —
 * «знание не дошло до памяти», а причин уже пять, и каждая со своим лечением:
 *   1. текст отклонён фильтром        → текст ЕСТЬ, спасать в файл
 *   2. модель вернула пустоту         → спасать нечего, нужен ПОВТОР (задание)
 *   3. текст не влез в предел обрезки → спасать отброшенное начало
 *   4. бюджет ответа съеден рассуждением → лечится ЧИСЛОМ (maxTokens)
 *   5. ответ не разобрался как JSON   → текст ЕСТЬ и он ОСМЫСЛЕН, но темы не извлечены:
 *      сохранить сырой ответ, чтобы разобрать рукой, и не выдавать это за «тем нет»
 *
 * ГДЕ НЕ ПРИМЕНЯЕТСЯ: стенд не проверяет, что модель ДЕЙСТВИТЕЛЬНО реже отвечает прозой
 * после повтора указания в конце — это замер на живой модели, здесь только НАШЕ поведение.
 */
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

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ, а прогонщик синхронный');
    if (typeof v === 'string') throw new Error(v);
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = mkdtempSync(join(tmpdir(), 'stend-prozy-'));
const otklonennye = join(kat, 'otklonennye');
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про предмет замера.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ числом.' } })].join('\n') + '\n', 'utf-8')));

// ПРОЗА ВМЕСТО МАССИВА — ровно то, что даёт живая модель, когда указание формата теряется
// в начале запроса перед сотнями тысяч знаков транскрипта.
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
const itog = await distillirovat({
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
  // повтор обязан стоять именно В КОНЦЕ: модель слушает конец, а начало тонет в транскрипте
  const hvost = soob.slice(-260);
  if (!/массив JSON/.test(hvost)) return 'указание есть, но НЕ в конце — оно утонет перед транскриптом';
});

proba('⚠️ сохранение прозы НЕ ОБЯЗАТЕЛЬНО: без него заход не падает', () => {
  // Признак «правка не сделала старый вызов непригодным»: у пакета есть читатели,
  // которые про сохранение прозы не знают и не передадут его.
  const est = readFileSync(new URL('../src/distill-shov.js', import.meta.url), 'utf-8');
  if (!/typeof sohranitProzu === 'function'/.test(est)) {
    return 'вызов не защищён проверкой типа — старый вызывающий получит падение вместо исхода';
  }
});

console.log(`\nитог: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
