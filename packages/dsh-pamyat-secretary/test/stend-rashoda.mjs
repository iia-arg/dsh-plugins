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
const server = createServer((req, res) => {
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
t('расход НЕ переводится в деньги внутри пакета', () => {
  // Ставка живёт у провайдера и меняется без нас: зашитая цена устареет молча и будет
  // выглядеть замером. Пакет печатает токены, деньги считает тот, кто берёт прайс.
  const kod = readFileSync(new URL('../src/distill-shov.js', import.meta.url), 'utf-8');
  if (/\$\s*0\.\d|цена в рубл|rubl|USD/i.test(kod)) {
    throw new Error('в шве найдена ставка или валюта — цена зашита в код и устареет молча');
  }
});
rmSync(kat, { recursive: true, force: true });
console.log('ИТОГО: сошлось ' + ok + ', расхождений ' + bed);
process.exit(bed ? 1 : 0);
