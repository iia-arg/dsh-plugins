// RU: Проверяем повтор пустого ответа: ne-dochitala с max_tokens повторяется с удвоенным бюджетом; pusto при обычном завершении — тем же запросом. Проверяются поведение и счёт повтора, а не качество статьи или успех живой модели.
// EN: Test empty-response retries: ne-dochitala with max_tokens retries with double the budget; pusto after normal termination repeats the same request. Test retry behavior and accounting, not article quality or live-model success.
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

let distillirovat;
try {
  ;({ distillirovat } = await import('../src/distill-shov.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140));
  process.exit(2);
}

let ok = 0, bed = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const proba = (imya, f) => {
  try {
    // RU: sud() принимает только undefined или true; нижние проверки остальных видов не исполнялись бы.
    // EN: sud() accepts only undefined or true; lower checks of other types would never run.
    sud(f());
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 200)); }
};

const kat = vremennyj(join(tmpdir(), 'stend-povtora-'));
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  Array.from({ length: 20 }, (_, i) => JSON.stringify({
    seq: 10 + i,
    type: i % 2 ? 'assistant/message' : 'user/message',
    data: { content: 'Обсуждение предмета замера номер ' + i + ' и объявленные границы.' },
  })).join('\n') + '\n', 'utf-8')));
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

// RU: Подставной провайдер сначала отдаёт темы, затем ответы сценария и сохраняет maxTokens каждого запроса для проверки бюджета повторов.
// EN: The fake provider returns topics first, then scenario responses, and records every request’s maxTokens to verify retry budgets.
function podnyat(scenarij) {
  const budgety = [];
  let n = 0;
  const s = createServer((req, res) => {
    let telo = '';
    req.on('data', (c) => { telo += c; });
    req.on('end', () => {
      n++;
      try { budgety.push(JSON.parse(telo).max_tokens); } catch { budgety.push(null); }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (n === 1) {
        res.end(JSON.stringify({ content: [{ type: 'text', text: '[{"theme":"единственная тема","kind":"urok"}]' }],
                                 stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }));
        return;
      }
      res.end(JSON.stringify(scenarij(n - 1)));   /* RU: Первый ответ статьи и ответ повтора.
 * EN: Initial article response and retry response.
 */
    });
  });
  return { server: s, budgety };
}

const PUSTO = { content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 0 } };
const NE_DOCHITALA = { content: [], stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 900 } };
const STATYA = { content: [{ type: 'text', text: 'Статья с длинными словами для проверки записи знания.' }],
                 stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 30 } };
// RU: Текст с stop_reason=max_tokens означает оборванную статью, а не успех. От ne-dochitala отличается наличием неполного text.
// EN: Text with stop_reason=max_tokens is a truncated article, not success. It differs from ne-dochitala by containing incomplete text.
const OBORVANA = { content: [{ type: 'text', text: 'Статья с длинными словами, которая обрывается на полусл' }],
                   stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 900 } };

let srez = 10;
async function zahod(scenarij) {
  const { server, budgety } = podnyat(scenarij);
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
  const kriki = [];
  const zapisano = [];
  const seqs = [srez, srez + 1]; srez += 2;
  const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    putZhurnala: zhurnal,
    dannye: { shadowedSeqs: seqs, shadowedTokenCount: 5000 },
    seansId: 'proba-povtora',
    nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
                 maxTokenovTem: 100, maxTokenovStati: 1000, predelTem: 5, minTokenovSreza: 1 },
    krik: (s) => kriki.push(s),
    zapisat: (z) => zapisano.push(z),
  });
  server.close();
  return { itog, kriki, budgety, zapisano };
}

// RU: ne-dochitala повторяется с удвоенным бюджетом.
// EN: Retry ne-dochitala with double the budget.
const dochitala = await zahod((k) => (k === 1 ? NE_DOCHITALA : STATYA));

proba('«не дочитала» → повтор с УДВОЕННЫМ бюджетом (1000 → 2000)', () => {
  if (dochitala.budgety.length < 3) return 'вызовов всего ' + dochitala.budgety.length + ' — повтора не было';
  const [, pervyj, povtor] = dochitala.budgety;
  if (pervyj !== 1000) return 'первый запрос ушёл с бюджетом ' + pervyj;
  if (povtor !== 2000) return 'повтор ушёл с бюджетом ' + povtor + ', ожидалось 2000';
});

proba('удавшийся повтор ЗАПИСЫВАЕТ знание и говорит об этом', () => {
  if (dochitala.itog.zapisano !== 1) return 'записано ' + dochitala.itog.zapisano + ' вместо 1';
  if (dochitala.zapisano.length !== 1) return 'записыватель позван ' + dochitala.zapisano.length + ' раз';
  if (!dochitala.kriki.some((s) => /повтор .* УДАЛСЯ/.test(s))) return 'об удавшемся повторе не сказано';
  if (dochitala.itog.povtorov !== 1) return 'повторов сосчитано ' + dochitala.itog.povtorov;
  if (dochitala.itog.povtorov_udalos !== 1) return 'удачных повторов ' + dochitala.itog.povtorov_udalos;
});

// RU: pusto повторяется с прежним бюджетом.
// EN: Retry pusto with the original budget.
const pusto = await zahod((k) => (k === 1 ? PUSTO : STATYA));

proba('«пусто» → повтор ТЕМ ЖЕ бюджетом, а не удвоенным', () => {
  if (pusto.budgety.length < 3) return 'повтора не было';
  const [, pervyj, povtor] = pusto.budgety;
  if (povtor !== pervyj) return 'бюджет повтора ' + povtor + ' против первого ' + pervyj + ' — удвоили там, где причина другая';
});

// RU: Разрешён ровно один повтор; дальнейший отказ создаёт задание по теме.
// EN: Allow exactly one retry; another failure creates a topic task.
const upryamoe = await zahod(() => NE_DOCHITALA);

proba('ГЛАВНОЕ: повтор ровно ОДИН — вызовов 3, а не больше', () => {
  if (upryamoe.budgety.length !== 3) return 'вызовов ' + upryamoe.budgety.length + ' (темы + статья + один повтор = 3)';
  if (upryamoe.itog.povtorov !== 1) return 'повторов ' + upryamoe.itog.povtorov;
  if (upryamoe.itog.povtorov_udalos !== 0) return 'неудавшийся повтор зачтён удачным';
});

proba('не помогло → тема названа заданием, а не растворилась', () => {
  if (upryamoe.itog.otkazov !== 1) return 'отказов ' + upryamoe.itog.otkazov;
  if (!upryamoe.kriki.some((s) => /повтор .* не помог/.test(s))) return 'о неудаче повтора не сказано';
  const svodka = upryamoe.kriki.find((s) => /повторов при пустом ответе/.test(s)) ?? '';
  if (!/повторов при пустом ответе: 1, из них удались 0/.test(svodka)) return 'числа повторов нет в сводке: ' + svodka.slice(0, 160);
});

// RU: Успешная статья не требует повтора.
// EN: A successful article requires no retry.
const srazu = await zahod(() => STATYA);

const oborvano = await zahod((n) => (n === 1 ? OBORVANA : STATYA));

proba('ПЯТАЯ ПРИЧИНА: текст есть + max_tokens → ОБРЫВ назван, статья НЕ сохранена', () => {
  const itog = oborvano.itog, stroki = oborvano.kriki;
  if (itog.zapisano !== 0 || oborvano.zapisano.length !== 0) return 'оборванная статья записана: ' + JSON.stringify(itog);
  if (itog.ishod !== 'statya-oborvana') return 'обрыв не делает заход неуспешным';
  if ((itog.oborvannyh ?? 0) !== 1) return 'обрыв не сосчитан: oborvannyh=' + (itog.oborvannyh ?? 0);
  const s = stroki.join(' | ');
  if (!/ОБОРВАНА бюджетом/.test(s)) return 'обрыв не назван в журнале: ' + s.slice(0, 200);
  if (!/в память НЕ записана/.test(s)) return 'не сказано, что запись запрещена: ' + s.slice(0, 200);
  if (!/ОБОРВАНО бюджетом 1/.test(s)) return 'обрыв не попал в ИТОГ захода: ' + s.slice(0, 200);
});

proba('ПАРА: обычная статья — об обрыве НИ СЛОВА, в итоге ноль', () => {
  const itog = srazu.itog, stroki = srazu.kriki;
  if ((itog.oborvannyh ?? 0) !== 0) return 'ложный обрыв на целой статье';
  const s = stroki.join(' | ');
  if (/ОБОРВАНА бюджетом/.test(s)) return 'ложная тревога об обрыве: ' + s.slice(0, 160);
  if (!/ОБОРВАНО бюджетом 0/.test(s)) return 'ноль обрывов НЕ напечатан — «не было» неотличимо от «не считали»';
});

proba('ВТОРАЯ ПОЛОВИНА: удачная статья — повтора НЕТ и о нём не говорится', () => {
  if (srazu.budgety.length !== 2) return 'вызовов ' + srazu.budgety.length + ', ожидалось 2 (темы + статья)';
  if (srazu.itog.povtorov !== 0) return 'повторов ' + srazu.itog.povtorov + ' на успешной статье';
  if (srazu.kriki.some((s) => /повторов при пустом ответе/.test(s))) return 'строка о повторах печатается при нуле повторов';
});

console.log('  итог: ' + ok + ' из ' + (ok + bed));
process.exit(bed === 0 ? 0 : 1);
