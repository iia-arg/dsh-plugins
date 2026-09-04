/** Стенд: повторный заход по ТОМУ ЖЕ срезу не делается.
 *
 *  🔴 ЗАЧЕМ. Пакет монтируется в одном процессе несколько раз (замер 04.09.2026: трижды
 *  на одном узле, дважды на другом — записи журнала различны по монотонному времени).
 *  Обработка события пока одинарная, но ПОЧЕМУ — не установлено. Если платформа сменит
 *  доставку, заходы удвоятся МОЛЧА, а механизм ходит к платному API: узнали бы по счёту.
 *  Стенд стережёт не причину, а ГРОМКОСТЬ: повтор обязан быть назван и не оплачен.
 */
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { distillirovat } from '../src/distill-shov.js';

let ok = 0, bed = 0;
const t = (imya, f) => { try { f(); ok++; console.log('  ok   ' + imya); }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message); } };

const kat = mkdtempSync(join(tmpdir(), 'stend-povtora-'));
const zhurnal = join(kat, 's.jsonl.zstd');
writeFileSync(zhurnal, zstdCompressSync(Buffer.from(
  [JSON.stringify({ seq: 10, type: 'user/message', data: { content: 'Содержательная речь про предмет.' } }),
   JSON.stringify({ seq: 11, type: 'assistant/message', data: { content: 'Ответ замером.' } })].join('\n') + '\n', 'utf-8')));

let vyzovov = 0;
const server = createServer((req, res) => {
  vyzovov++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ content: [{ type: 'text', text: '[]' }], stop_reason: 'end_turn',
                           usage: { input_tokens: 10, output_tokens: 1 } }));
});
await new Promise((g) => server.listen(0, '127.0.0.1', g));
const adres = `http://127.0.0.1:${server.address().port}/v1/messages`;
const klyuch = join(kat, 'k'); writeFileSync(klyuch, 'proba\n', { mode: 0o600 });

const kriki = [];
const zahod = (seqs) => distillirovat({
  putZhurnala: zhurnal,
  dannye: { shadowedSeqs: seqs, shadowedTokenCount: 5000 },
  seansId: 'proba-povtora',
  nastrojka: { klyuch: { fajlKlyucha: klyuch }, model: 'm', adres,
               maxTokenovTem: 100, maxTokenovStati: 100, predelTem: 5, minTokenovSreza: 1 },
  krik: (s) => kriki.push(s),
  zapisat: () => {},
});

const pervyj = await zahod([10, 11]);
const vyzovov_posle_pervogo = vyzovov;
const vtoroj = await zahod([10, 11]);
const vyzovov_posle_vtorogo = vyzovov;
const drugoj = await zahod([10]);
server.close();

t('первый заход по срезу состоялся', () => {
  if (pervyj.ishod === 'zahod-uzhe-byl') throw new Error('первый принят за повтор');
  if (vyzovov_posle_pervogo === 0) throw new Error('к провайдеру не ходили вовсе');
});

t('ПОВТОР по тому же срезу НЕ состоялся и назван', () => {
  if (vtoroj.ishod !== 'zahod-uzhe-byl') throw new Error('исход ' + vtoroj.ishod + ' — повтор прошёл как обычный заход');
  if (vtoroj.zahodov !== 2) throw new Error('заходов ' + vtoroj.zahodov + ', ждали 2');
});

// 🔴 Главная проба: повтор НЕ ОПЛАЧЕН. Названный, но состоявшийся повтор стоил бы денег —
// а вся защита ради того, чтобы платный вызов не удваивался молча.
t('повтор НЕ дошёл до провайдера: вызовов не прибавилось', () => {
  if (vyzovov_posle_vtorogo !== vyzovov_posle_pervogo) {
    throw new Error(`вызовов было ${vyzovov_posle_pervogo}, стало ${vyzovov_posle_vtorogo} — повтор оплачен`);
  }
});

t('крик называет число заходов и причину, а не просто «повтор»', () => {
  const k = kriki.join(' | ');
  if (!/УЖЕ БЫЛ/.test(k)) throw new Error('повтор не назван: ' + k.slice(0, 120));
  if (!/смонтирован/.test(k)) throw new Error('причина не названа: ' + k.slice(0, 120));
  if (!/НЕ повторяю/.test(k)) throw new Error('не сказано, что заход не сделан: ' + k.slice(0, 120));
});

t('ДРУГОЙ срез повтором не считается', () => {
  if (drugoj.ishod === 'zahod-uzhe-byl') throw new Error('другой срез принят за повтор — счёт идёт не по срезу');
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
