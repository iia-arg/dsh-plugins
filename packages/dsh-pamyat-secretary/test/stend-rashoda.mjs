// Стенд учёта расхода: заход к платному API обязан СЧИТАТЬ, сколько потратил.
//
// 🔴 ЗАЧЕМ. До 03.09.2026 механизм ходил к чужому платному API и расход не считал:
// цену приходилось прикидывать по знакам транскрипта. Прикидка расходится с настоящим
// счётом молча, и владелец решал бы про деньги по оценке, а не по замеру.
//
// 🔴 ГЛАВНАЯ ПРОБА ЗДЕСЬ — ОТКАЗ ТОЖЕ ОПЛАЧЕН. Вызов, кончившийся на max_tokens,
// статьи не дал и деньги стоил. Счёт, берущий только удавшиеся, занижает цену ровно
// на ту часть, которая и есть беда.
import { createServer } from 'node:http';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { distillirovat } from '../src/distill-shov.js';

let ok = 0, bed = 0;
const t = (imya, f) => { try { f(); ok++; console.log('  ok   ' + imya) }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) } };

// подставной журнал: две записи речи под нужными seq
const kat = mkdtempSync(join(tmpdir(), 'stend-rashoda-'));
const zhurnal = join(kat, 'sessiya.jsonl.zstd');
const stroki = [
  JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Человек говорит нечто содержательное про предмет.' } }),
  JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Агент отвечает замером, а не мнением.' } }),
].join('\n') + '\n';
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(stroki, 'utf-8')));

// подставной сервер: выбор тем, затем удача и отказ по бюджету — с разными usage
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
const itog = await distillirovat({
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
  if (r.vyzovov !== 3) throw new Error('вызовов ' + r.vyzovov + ', ждали 3 (выбор тем + две статьи)');
});
t('🔴 ОТКАЗ ВХОДИТ В РАСХОД: вход 1000+2000+3000', () => {
  const r = itog.rashod;
  if (r.vhod !== 6000) throw new Error('вход ' + r.vhod + ', ждали 6000; ' +
    (r.vhod === 3000 ? 'посчитаны только удавшиеся — отказ оплачен, а не учтён' : ''));
  if (r.vyhod !== 600) throw new Error('выход ' + r.vyhod + ', ждали 600');
});
t('кеш считается отдельно от свежего входа', () => {
  const r = itog.rashod;
  if (r.keshChtenie !== 7 || r.keshZapis !== 3) {
    throw new Error('кеш чтение ' + r.keshChtenie + ', запись ' + r.keshZapis + ' — ждали 7 и 3');
  }
});
t('🔴 ТЕМА СТОИТ ПОСЛЕ ТРАНСКРИПТА — иначе кэш провайдера не работает', () => {
  // Замер 03.09.2026: тема впереди → префикс у каждого вызова свой → попаданий в кэш
  // 0,37% входа. Тема в конце → 84,7%. Транскрипт один и тот же, экономия кратная.
  // Проба стоит здесь, чтобы «наведение порядка» не вернуло тему вперёд молча.
  const stati = zaprosy.filter((z) => z && /ТЕМА:/.test(z.messages?.[0]?.content ?? ''));
  if (stati.length === 0) throw new Error('запросов со статьями не видно — проба слепа');
  for (const z of stati) {
    const t = z.messages[0].content;
    const gde = t.indexOf('ТЕМА:');
    if (gde < t.length / 2) {
      throw new Error('ТЕМА на позиции ' + gde + ' из ' + t.length + ' — она впереди транскрипта, кэш не сработает');
    }
  }
});
t('расход НЕ переводится в деньги внутри пакета', () => {
  // Ставка живёт у провайдера и меняется без нас: зашитая цена устареет молча и будет
  // выглядеть замером. Пакет печатает токены, деньги считает тот, кто берёт прайс.
  const kod = readFileSync(new URL('../src/distill-shov.js', import.meta.url), 'utf-8');
  if (/\$\s*0\.\d|цена в рубл|rubl|USD/i.test(kod)) {
    throw new Error('в шве найдена ставка или валюта — цена зашита в код и устареет молча');
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ОТКАЗ ПРОВАЙДЕРА НА ПЕРВОЙ СТУПЕНИ — ШОВ ЦЕЛИКОМ, А НЕ ОДНА ФУНКЦИЯ.
// Пробы на 401/402 были и в стенде дистилляции — но они проверяют `sprosit`,
// то есть ЗВЕНО. Дефект 04.09.2026 сидел в СОЕДИНЕНИИ звеньев: ветка отказа
// возвращала `rashod`, объявленный ниже по телу, и шов падал с ReferenceError
// вместо того, чтобы назвать причину. Пока у провайдера были деньги, эта ветка
// не исполнялась ни разу — нашлась только на живом пустом балансе.
// Отсюда правило пробы: проверять ту единицу, которая уезжает к получателю.
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
    r = await distillirovat({
      putZhurnala: zhurnal,
      // Срез СВОЙ у каждого сценария — код отказа и различает: повтор ОДНОГО среза
      // защита от двойного захода отвергает намеренно, а здесь проверяется другое.
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ПРЕДЕЛ НЕОКОНЧАТЕЛЬНЫХ ОТКАЗОВ ПОДРЯД (долг, названный воротами 04.09.2026).
// Окончательный отказ заход обрывал, а неокончательный — нет: при сбое на стороне
// провайдера мы делали вызов на КАЖДУЮ тему, оплачивали все и не получали ни одной
// статьи. Считаем ПОДРЯД: один сбой в середине — не повод рвать заход.
{
  // сервер: выбор тем удачен, дальше 500 на всё
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
  const r = await distillirovat({
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
    // 1 вызов выбора тем + ровно 3 отказа = 4
    if (n !== 4) throw new Error('вызовов к провайдеру ' + n + ', ждали 4 (выбор тем + предел 3)');
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
