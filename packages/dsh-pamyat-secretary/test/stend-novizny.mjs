// RU: Проверяем сверку новизны на шве: ядро вызывается, исходы считаются раздельно и печатаются числом. Качество меры близости проверяется в ядре; общие слова не ловят смысловой перефраз. Успех не доказывает отсутствие дублей в живой базе.
// EN: Test novelty checking at the boundary: call the core, count outcomes separately, and print counts. Proximity quality is tested in the core; shared words do not detect semantic paraphrases. Success does not prove that the live database has no duplicates.
import { mkdtempSync, writeFileSync } from 'node:fs';
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

let distillirovat, sozdatSverkuNovizny;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
  ;({ sozdatSverkuNovizny } = await import('../src/index.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140));
  process.exit(2);
}

let ok = 0, bed = 0;
// RU: Синхронная обёртка должна учитывать возврат тела и отвергать промис: иначе строка причины или async-исключение даст ложный успех.
// EN: The synchronous wrapper must inspect body returns and reject promises; otherwise a returned reason or async exception can produce false success.
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  try {
    // RU: sud() принимает только undefined или true и бросает раньше разбора остальных видов; нижние проверки значений были бы недостижимыми.
    // EN: sud() accepts only undefined or true and throws before inspecting other types; lower value checks would be unreachable.
    sud(f());
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-novizny-'));
const zhurnal = join(kat, 's.jsonl.zstd');
// RU: Каждый заход использует отдельный срез: повтор уже пройденного среза проверил бы защитный пропуск вместо новизны.
// EN: Each run uses a distinct slice; repeating a processed slice would test duplicate skipping rather than novelty.
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  Array.from({ length: 20 }, (_, i) => JSON.stringify({
    seq: 10 + i,
    type: i % 2 ? 'assistant/message' : 'user/message',
    data: { content: 'Обсуждение предмета замера номер ' + i + ' и его объявленные границы.' },
  })).join('\n') + '\n', 'utf-8')));

// RU: Подставной провайдер сначала отдаёт темы, затем статьи.
// EN: The fake provider returns topics first, then articles.
function podnyatServer(statej = 2) {
  let vyzovov = 0;
  const s = createServer((req, res) => {
    vyzovov++;
    res.writeHead(200, { 'content-type': 'application/json' });
    if (vyzovov === 1) {
      const temy = Array.from({ length: statej }, (_, i) => ({ theme: 'тема номер ' + (i + 1), kind: 'urok' }));
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(temy) }],
                               stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
    } else {
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'Статья номер ' + (vyzovov - 1)
                               + ': длинные слова обязательно нужны тексту для сравнения словами.' }],
                               stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
    }
  });
  return s;
}

const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

// RU: Выполняем один заход с заданной сверкой новизны.
// EN: Run one distillation with the selected novelty check.
let sledushchij_srez = 10;
async function zahod({ blizhajshaya, statej = 2 }) {
  const seqs = [sledushchij_srez, sledushchij_srez + 1];
  sledushchij_srez += 2;
  const server = podnyatServer(statej);
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
  const kriki = [];
  const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    putZhurnala: zhurnal,
    dannye: { shadowedSeqs: seqs, shadowedTokenCount: 5000 },
    seansId: 'proba-novizny',
    nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
                 maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenovSreza: 1 },
    krik: (s) => kriki.push(s),
    zapisat: () => {},
    ...(blizhajshaya === undefined ? {} : { blizhajshaya }),
  });
  server.close();
  return { itog, kriki, stroka: kriki.find((s) => /новизна знаний/.test(s)) ?? '' };
}

// RU: Парно проверяем наличие и отсутствие сверки: «не сверялась» нельзя печатать как «дублей нет».
// EN: Test presence and absence of checking in pairs: “not checked” must not be reported as “no duplicates.”
const est = await zahod({
  blizhajshaya: ({ klass, soderzhim }) => ({ ishod: 'sravneno', id: 173, blizost: 0.44, sravneno_s: 12 }),
});
const netSverki = await zahod({ blizhajshaya: undefined });

proba('сверка есть: числа названы — сколько сравнено, наибольшая близость и с какой записью', () => {
  if (!/сравнено 2 из 2/.test(est.stroka)) return 'нет числа сравнённых: ' + est.stroka.slice(0, 200);
  if (!/наибольшая близость 0\.44/.test(est.stroka)) return 'нет наибольшей близости: ' + est.stroka.slice(0, 200);
  if (!/запись 173/.test(est.stroka)) return 'не названа запись, с которой сравнили: ' + est.stroka.slice(0, 200);
  if (est.itog.novizna?.sravneno !== 2) return 'в итоге сравнено ' + est.itog.novizna?.sravneno;
});

proba('ГЛАВНОЕ: сверки нет → «НЕ СВЕРЯЛАСЬ», а не «дублей нет»', () => {
  if (!/НЕ СВЕРЯЛАСЬ/.test(netSverki.stroka)) return 'нет строки о несверке: ' + netSverki.stroka.slice(0, 200);
  if (!/не смотрели/.test(netSverki.stroka)) return 'не сказано, что это про прибор: ' + netSverki.stroka.slice(0, 200);
  if (/сравнено/.test(netSverki.stroka)) return 'печатается число сравнённых при отсутствии сверки';
});

// RU: Ошибка сверки не препятствует записи знания: учёт вторичен.
// EN: A checking error must not prevent writing knowledge; accounting is secondary.
const zapisannye = [];
const sorvalos = await zahod({
  blizhajshaya: () => { throw new Error('база занята'); },
});

proba('сверка сорвалась → срыв сосчитан ОТДЕЛЬНО и назван вслух', () => {
  if (sorvalos.itog.novizna?.sorvalos !== 2) return 'срывов сосчитано ' + sorvalos.itog.novizna?.sorvalos;
  if (!/сверка сорвалась 2/.test(sorvalos.stroka)) return 'срыв не назван числом: ' + sorvalos.stroka.slice(0, 200);
  const otdelno = sorvalos.kriki.find((s) => /сверка новизны сорвалась/.test(s));
  if (!otdelno) return 'нет отдельной строки о срыве с причиной';
  if (!/база занята/.test(otdelno)) return 'причина срыва потеряна: ' + otdelno.slice(0, 160);
});

proba('срыв сверки НЕ отменяет запись знания — учёт вторичен', () => {
  if (sorvalos.itog.zapisano !== 2) return 'записано ' + sorvalos.itog.zapisano + ' вместо 2';
});

// RU: Неизвестный исход не считается новым знанием.
// EN: An unknown outcome does not count as new knowledge.
const chuzhoj = await zahod({ blizhajshaya: () => ({ ishod: 'нечто-незнакомое' }) });
proba('незнакомый исход сверки считается СРЫВОМ, а не тихой новизной', () => {
  if (chuzhoj.itog.novizna?.sorvalos !== 2) return 'незнакомый исход не зачтён срывом: '
    + JSON.stringify(chuzhoj.itog.novizna);
});

// RU: Создание сверки зависит от наличия метода, а не номера версии.
// EN: Check availability depends on the method’s presence rather than a version number.
proba('sozdatSverkuNovizny: у службы без метода → null (проверяем предмет, а не номер версии)', () => {
  if (sozdatSverkuNovizny({ zapisat() {} }) !== null) return 'вернулась функция при отсутствии метода';
  if (sozdatSverkuNovizny(null) !== null) return 'пустая служба не дала null';
  const f = sozdatSverkuNovizny({ blizhajshaya: () => ({ ishod: 'ne-s-chem', sravneno_s: 0 }) });
  if (typeof f !== 'function') return 'при наличии метода функция не создана';
  const r = f({ klass: 'urok', soderzhim: 'текст' });
  if (r.ishod !== 'ne-s-chem') return 'вызов не дошёл до службы: ' + JSON.stringify(r);
});

console.log('  итог: ' + ok + ' из ' + (ok + bed));
process.exit(bed === 0 ? 0 : 1);
