// RU: Проверяем задание на повтор при отказе модели без текста: сохраняются тема и точные seqs, поскольку спасать текст нечего, а повтор того же среза защитой пропускается. Этот стенд проверяет создание задания и диагностику, а не исполнение повтора.
// EN: Test creation of a retry task after a model failure without text: retain the topic and exact seq values because there is no text to save and duplicate protection skips the same slice. This suite tests task creation and diagnostics, not retry execution.
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

let distillirovat, sozdatZadanie;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ sozdatZadanie } = await import('../src/index.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140));
  process.exit(2);
}

let ok = 0, bed = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const imena = [];
const proba = (imya, f) => {
  imena.push(imya);
  try {
    // RU: sud() принимает только undefined или true; нижние проверки остальных значений недостижимы.
    // EN: sud() accepts only undefined or true; lower checks of other values are unreachable.
    sud(f());
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-zadaniya-'));
const otklonennye = join(kat, 'otklonennye');
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Речь про предмет замера.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ числом.' } })].join('\n') + '\n', 'utf-8')));

// RU: Сначала сервер отдаёт темы, затем ответ без блока text.
// EN: The server first returns topics, then a response without a text block.
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
const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
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

// RU: Задание должно содержать точный список seqs: неупорядоченные края среза могут идти от большего к меньшему, и диапазон по названию не восстанавливает события.
// EN: The task must contain the exact seq list: unordered slice endpoints may descend, and a range inferred from the name cannot reconstruct events.
proba('🔴 в задании лежит ПОЛНЫЙ список seqs, а не только края — иначе повтор невозможен', () => {
  const z = fajly().filter((f) => f.startsWith('zadanie-'))[0];
  if (!z) return 'задания нет';
  const d = JSON.parse(readFileSync(join(otklonennye, z), 'utf8'));
  if (!Array.isArray(d.seqs)) return 'seqs не массив: ' + JSON.stringify(d.seqs);
  if (d.seqs.length === 0) return 'seqs пуст';
  if (d.seqs_shtuk !== d.seqs.length) return `seqs_shtuk ${d.seqs_shtuk} ≠ длины списка ${d.seqs.length}`;
  if (!/собрать транскрипт по ЭТИМ seqs/.test(String(d.kak))) return 'строка «как» обещает не то: ' + d.kak;
});

proba('порча: seqs не переданы → задание ГОВОРИТ об этом, а не молчит', () => {
  const kriki2 = [];
  const put = sozdatZadanie({ putOtklonennyh: otklonennye }, (s) => kriki2.push(s))
    ({ tema: 'без списка', kluchSreza: 'x#1-2', prichina: 'проба', ishod: 'ne-dochitala' });
  const d = JSON.parse(readFileSync(put, 'utf8'));
  if (d.seqs !== null) return 'seqs должен быть null, а он ' + JSON.stringify(d.seqs);
  if (!/seqs НЕ ПОЛОЖЕНЫ/.test(String(d.kak))) return 'молчит о том, что списка нет: ' + d.kak;
});

proba('🔴 без seqs задание называет ИСПОЛНИМЫЙ путь, а не «невозможно» [с живого: два задания 06.09 исполнены по диапазону 07.09]', () => {
  const kr = [];
  const put = sozdatZadanie({ putOtklonennyh: otklonennye }, (m) => kr.push(m))
    ({ tema: 'без списка', kluchSreza: 'x#89377-85086', prichina: 'проба', ishod: 'ne-dochitala' });
  if (!put) throw new Error('задание не сохранено, крики: ' + kr.join(' | ').slice(0, 300));
  const kak = String(JSON.parse(readFileSync(put, 'utf8')).kak);
  // RU: Образец воспроизводит убывающий порядок краёв из сохранённого задания.
  // EN: The sample reproduces descending endpoints from a recorded task.
  if (/невозмож/i.test(kak)) return 'вернулось ложное «невозможно»: ' + kak.slice(0, 120);
  if (!/ВОЗМОЖЕН/.test(kak)) return 'не сказано, что повтор возможен: ' + kak.slice(0, 120);
  if (!/min\.\.max/.test(kak)) return 'не назван способ (диапазон краёв): ' + kak.slice(0, 120);
  if (!/НАДМНОЖЕСТВО/.test(kak)) return 'не названа цена способа — знание выйдет шире среза';
});

proba('число заданий названо в сводке захода', () => {
  const stroka = kriki.find((s) => /дистилляция: знаний/.test(s)) ?? '';
  if (!/заданий на повтор 1/.test(stroka)) return 'в сводке нет числа заданий: ' + stroka.slice(0, 160);
});

proba('строка о сохранении задания напечатана', () => {
  // RU: Без обработчика задания файл не создаётся; диагностика должна отличать это от отсутствия заданий. Заход проверен отдельной пробой.
  // EN: Without a task handler, no file is created; diagnostics must distinguish this from having no tasks. A separate probe tests the run.
  const est = kriki.some((s) => /задание на повтор сохранено/.test(s));
  if (!est) return 'нет строки о сохранении задания';
});

// RU: В имени пробы отмечаем происхождение образца «с живого». Синтетические формы полезны, но их покрытие нельзя выдавать за наблюдённое; перечень и происхождение проверяются отдельно.
// EN: Mark sample provenance as “с живого” in the probe name. Synthetic shapes are useful, but their coverage cannot be presented as observed; inventory and provenance are checked separately.
const zhivyh = imena.filter((i) => i.includes('[с живого')).length;
console.log(`итог: ${ok} из ${ok + bed}`);
console.log(`доказанность: проб ${ok + bed}, из них форма снята С ЖИЗНИ — ${zhivyh}; остальные предусмотрительность (не хуже, но это другое утверждение)`);
process.exit(bed === 0 ? 0 : 1);
