// RU: Проверяем токенный расход платных вызовов по usage, включая max_tokens без статьи. Учёт только успешных ответов занижает цену отказов и повторов.
// EN: Test paid-call token consumption from usage, including max_tokens without an article. Counting successful responses alone understates failure and retry costs.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { distillirovat } from '../src/distill-shov.js';
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
// RU: Синхронная обёртка учитывает возврат тела и отвергает промис: иначе возвращённая причина или async-ошибка не уронит пробу.
// EN: The synchronous wrapper inspects body returns and rejects promises; otherwise a returned reason or async error cannot fail the probe.
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. Проверка ПО УСТРОЙСТВУ, а не по перечню значений (06.09.2026)'); };
const t = (imya, f) => {
  try {
    // RU: sud() принимает только undefined или true; нижний разбор других значений недостижим.
    // EN: sud() accepts only undefined or true; lower inspection of other values is unreachable.
    sud(f());
    ok++; console.log('  ok   ' + imya);
  } catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) }
};

// RU: Подставной журнал содержит две речевые записи с нужными seq.
// EN: The fake journal contains two speech records with the required seq values.
const kat = vremennyj(join(tmpdir(), 'stend-rashoda-'));
const zhurnal = join(kat, 'sessiya.jsonl.zstd');
const stroki = [
  JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Человек говорит нечто содержательное про предмет.' } }),
  JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Агент отвечает замером, а не мнением.' } }),
].join('\n') + '\n';
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(stroki, 'utf-8')));

// RU: Сервер отдаёт темы, успешную статью и отказ по бюджету с разными usage.
// EN: The server returns topics, a successful article, and a budget failure with different usage values.
let vyzov = 0;
const otvety = [
  { content: [{ type: 'text', text: '[{"theme":"первая","target":"uzel-obrazec","kind":"urok"},{"theme":"вторая","target":"uzel-obrazec","kind":"urok"}]' }],
    stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 } },
  { content: [{ type: 'thinking', thinking: 'ду́маю' }, { type: 'text', text: 'СТАТЬЯ ПЕРВАЯ' }],
    stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 200 } },
  { content: [{ type: 'thinking', thinking: 'думаю слишком долго' }],
    stop_reason: 'max_tokens', usage: { input_tokens: 3000, output_tokens: 300 } },
];
const zaprosy = [];
const server = createServer((req, res) => {
  let syroe = '';
  req.on('data', (c) => { syroe += c; });
  req.on('end', () => { try { zaprosy.push(JSON.parse(syroe)); } catch { zaprosy.push(null); } });
  const telo = otvety[Math.min(vyzov++, otvety.length - 1)];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(telo));
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;

const klyuchFajl = join(kat, 'klyuch');
writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });

const zapisano = [];
const itog = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: [10, 11], shadowedTokenCount: 5000 },
  seansId: 'proba',
  nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres,
               maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 5, minTokenovSreza: 1 },
  krik: () => {},
  zapisat: (z) => zapisano.push(z),
});
server.close();

t('заход состоялся: одна статья записана, один отказ', () => {
  if (itog.ishod !== 'ok') throw new Error('исход ' + itog.ishod);
  if (itog.zapisano !== 1) throw new Error('записано ' + itog.zapisano + ', ждали 1');
  if (itog.otkazov !== 1) throw new Error('отказов ' + itog.otkazov + ', ждали 1');
});
t('расход посчитан, а не оценён', () => {
  const r = itog.rashod;
  if (!r) throw new Error('поля rashod нет вовсе — расход не считается');
  // RU: Считаем четыре вызова: выбор тем, две статьи и один повтор недочитанной темы. Повтор также расходует токены.
  // EN: Count four calls: topic selection, two articles, and one retry of the unfinished topic. The retry also consumes tokens.
  if (r.vyzovov !== 4) throw new Error('вызовов ' + r.vyzovov + ', ждали 4 (выбор тем + две статьи + один повтор)');
  if (itog.povtorov !== 1) throw new Error('повторов ' + itog.povtorov + ', ждали 1');
});
t('🔴 ОТКАЗ И ПОВТОР ВХОДЯТ В РАСХОД: вход 1000+2000+3000+3000', () => {
  const r = itog.rashod;
  // RU: После сценария сервер повторяет последний max_tokens-ответ: ещё 3000 входных и 300 выходных токенов. Неудачный повтор тоже учитывается.
  // EN: After the scenario, the server repeats its last max_tokens response: another 3000 input and 300 output tokens. The failed retry is also counted.
  if (r.vhod !== 9000) throw new Error('вход ' + r.vhod + ', ждали 9000; ' +
    (r.vhod === 6000 ? 'повтор не учтён — он оплачен, а не бесплатен' :
     r.vhod === 3000 ? 'посчитаны только удавшиеся — отказ оплачен, а не учтён' : ''));
  if (r.vyhod !== 900) throw new Error('выход ' + r.vyhod + ', ждали 900');
});
t('кеш считается отдельно от свежего входа', () => {
  const r = itog.rashod;
  if (r.keshChtenie !== 7 || r.keshZapis !== 3) {
    throw new Error('кеш чтение ' + r.keshChtenie + ', запись ' + r.keshZapis + ' — ждали 7 и 3');
  }
});
t('🔴 ТЕМА СТОИТ ПОСЛЕ ТРАНСКРИПТА — иначе кэш провайдера не работает', () => {
  // RU: Тема должна идти после общего транскрипта, чтобы разные темы сохраняли общий кэшируемый префикс запросов.
  // EN: Place the topic after the shared transcript so different topics retain a common cacheable request prefix.
  const stati = zaprosy.filter((z) => z && /ТЕМА:/.test(z.messages?.[0]?.content ?? ''));
  if (stati.length === 0) throw new Error('запросов со статьями не видно — проба слепа');
  for (const z of stati) {
    const t = z.messages[0].content;
    const gde = t.indexOf('ТЕМА:');
    // RU: Признак порядка — ТЕМА после последней реплики, а не во второй половине: последующее KONEC_STATI меняет долю текста, не общий префикс.
    // EN: The order condition is ТЕМА after the last utterance, not in the second half: a following KONEC_STATI changes text proportions, not the common prefix.
    const konecTranskripta = Math.max(t.lastIndexOf('ЧЕЛОВЕК:'), t.lastIndexOf('АГЕНТ:'));
    if (konecTranskripta < 0) throw new Error('в запросе статьи нет реплик транскрипта — проба слепа');
    if (gde < konecTranskripta) {
      throw new Error('ТЕМА на позиции ' + gde + ', последняя реплика транскрипта на ' + konecTranskripta + ' — тема впереди транскрипта, кэш не сработает');
    }
  }
});
t('расход НЕ переводится в деньги внутри пакета', () => {
  // RU: Печатаем токены, а не зашитую стоимость: тариф провайдера меняется независимо, деньги считает потребитель текущего прайса.
  // EN: Print tokens rather than a hardcoded price: provider rates change independently, and the consumer calculates money from the current price list.
  const kod = readFileSync(new URL('../src/distill-shov.js', import.meta.url), 'utf-8');
  // RU: Историческое число в комментарии не является действующим тарифом кода.
  // EN: A historical number in a comment is not an active price in code.
  const kodBezKommentariev = kod.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\$\s*0\.\d|цена в рубл|rubl|USD/i.test(kodBezKommentariev)) {
    throw new Error('в шве найдена ставка или валюта — цена зашита в код и устареет молча');
  }
});
// RU: Проверяем 401/402 на первой ступени полного шва, а не только sprosit. Ветка отказа должна вернуть причину и расход без ReferenceError из обращения к ещё не объявленному rashod.
// EN: Test first-stage 401/402 failures across the complete boundary, not just sprosit. The failure branch must return cause and consumption without a ReferenceError from accessing rashod before declaration.
async function zahodSOtkazom(kod, telo) {
  let vyzovov = 0;
  const srv = createServer((req, res) => {
    req.on('data', () => {}); req.on('end', () => {});
    vyzovov++;
    res.writeHead(kod, { 'content-type': 'application/json' });
    res.end(JSON.stringify(telo));
  });
  await new Promise((g) => srv.listen(0, '127.0.0.1', g));
  const a = `http://127.0.0.1:${srv.address().port}/v1/messages`;
  const zapisi = [];
  let brosil = null, r = null;
  try {
    r = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
      putZhurnala: zhurnal,
      // RU: Каждый сценарий использует свой срез, чтобы защита повторного захода не подменила проверку отказа.
      // EN: Each scenario uses its own slice so duplicate-run protection cannot replace the failure test.
      dannye: { shadowedSeqs: [10, 11, kod], shadowedTokenCount: 5000 },
      seansId: 'proba',
      nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: a,
                   maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 5, minTokenovSreza: 1 },
      krik: () => {},
      zapisat: (z) => zapisi.push(z),
    });
  } catch (e) { brosil = e; }
  srv.close();
  return { r, brosil, zapisi, vyzovov };
}

{
  const { r, brosil, zapisi } = await zahodSOtkazom(402, { error: { message: 'Insufficient Balance' } });
  t('🔴 402 НА ПЕРВОЙ СТУПЕНИ: шов НЕ БРОСАЕТ, а возвращает исход', () => {
    if (brosil) throw new Error('шов бросил: ' + brosil.message +
      (/before initialization/.test(brosil.message) ? ' — расход объявлен ниже своей ветки' : ''));
    if (!r) throw new Error('шов вернул пустоту');
  });
  t('402 → исход net-deneg и он ОКОНЧАТЕЛЬНЫЙ', () => {
    if (r?.ishod !== 'net-deneg') throw new Error('исход ' + r?.ishod);
    if (r?.okonchatelno !== true) throw new Error('окончательность не объявлена: заход бился бы о 402 на каждой теме');
  });
  t('402 → расход ВЕРНУЛСЯ: вызов был и оплачен, показывать заход бесплатным нельзя', () => {
    if (!r?.rashod) throw new Error('поля rashod нет — заход выглядит бесплатным');
    if (r.rashod.vyzovov !== 1) throw new Error('вызовов ' + r.rashod.vyzovov + ', ждали 1');
  });
  t('402 → знания НЕ потеряны молча: записей ноль, причина названа исходом', () => {
    if (zapisi.length !== 0) throw new Error('записано ' + zapisi.length + ' при отказе провайдера');
  });
}

{
  const { r, brosil } = await zahodSOtkazom(401, { error: { message: 'Authentication Fails' } });
  t('🔴 401 И 402 НЕ СХЛОПЫВАЮТСЯ: неверный ключ — не «не заплатили»', () => {
    if (brosil) throw new Error('шов бросил: ' + brosil.message);
    if (r?.ishod !== 'klyuch-ne-prinyat') throw new Error('исход ' + r?.ishod +
      ' — лечится другим: 402 пополнением счёта, 401 заменой ключа');
  });
}

// RU: Ограничиваем последовательные неокончательные отказы, чтобы не платить за каждую тему при общей неисправности провайдера. Одиночный сбой не должен обрывать весь заход.
// EN: Limit consecutive nonterminal failures to avoid paying for every topic during a provider-wide failure. An isolated failure must not stop the whole run.
{
  // RU: Выбор тем проходит, затем сервер всегда отвечает 500.
  // EN: Topic selection succeeds; the server then always returns 500.
  let n = 0;
  const srv = createServer((req, res) => {
    req.on('data', () => {}); req.on('end', () => {});
    n++;
    if (n === 1) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(
        Array.from({ length: 8 }, (_, i) => ({ theme: 'тема' + i, target: 'u', kind: 'urok' }))) }],
        stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 1 } }));
      return;
    }
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'сторона провайдера' } }));
  });
  await new Promise((g) => srv.listen(0, '127.0.0.1', g));
  const a = `http://127.0.0.1:${srv.address().port}/v1/messages`;
  const zapisi = [];
  const r = await distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
    putZhurnala: zhurnal,
    dannye: { shadowedSeqs: [10, 11, 13], shadowedTokenCount: 5000 },
    seansId: 'proba',
    nastrojka: { klyuch: { fajlKlyucha: klyuchFajl }, model: 'proba-model', adres: a,
                 maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 8, minTokenovSreza: 1 },
    krik: () => {},
    zapisat: (z) => zapisi.push(z),
  });
  srv.close();
  t('🔴 три неокончательных отказа подряд ОБРЫВАЮТ заход, а не бьются о все темы', () => {
    if (r?.ishod !== 'podryad-otkazov') throw new Error('исход ' + r?.ishod +
      ' — заход прошёл по всем восьми темам и оплатил каждую');
    // RU: Один выбор тем и три темы по три попытки при 500 дают 10 вызовов. Обрыв определяется последовательностью отказов, а не общим счётом.
    // EN: One topic selection and three topics with three attempts each on 500 give 10 calls. Consecutive failures determine termination, not the total count.
    if (n !== 10) throw new Error('вызовов к провайдеру ' + n + ', ждали 10 (выбор тем + 3 темы × 3 попытки)');
  });
  t('обрыв НАЗЫВАЕТ, сколько тем не обработано', () => {
    if (r?.oborvano !== 5) throw new Error('oborvano ' + r?.oborvano + ', ждали 5 из 8');
  });
  t('расход отказов посчитан, записей ноль', () => {
    if (!r?.rashod || r.rashod.vyzovov !== 4) throw new Error('вызовов в расходе ' + r?.rashod?.vyzovov);
    if (zapisi.length !== 0) throw new Error('записано ' + zapisi.length);
  });
}

rmSync(kat, { recursive: true, force: true });
console.log('ИТОГО: сошлось ' + ok + ', расхождений ' + bed);
process.exit(bed ? 1 : 0);
