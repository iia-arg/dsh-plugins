// RU: Повтор того же среза не должен запускать дистилляцию или оплачивать провайдера и обязан называться в журнале. Проверяем защиту даже при нескольких монтажах пакета; причину текущей однократной доставки платформы здесь не устанавливаем.
// EN: Repeating the same slice must not run distillation or incur a provider call and must be reported. Test protection even with multiple package mounts; this does not establish why the platform currently delivers once.
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { distillirovat, kluchSreza, zabytZahodPoSrezu } from '../src/distill-shov.js';
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
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы (правка 06.09.2026)'); };
const t = (imya, f) => { try { sud(f()); ok++; console.log('  ok   ' + imya); }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message); } };

const kat = vremennyj(join(tmpdir(), 'stend-povtora-'));
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
const zahod = (seqs) => distillirovat({ maska: MASKA_PUSTYSHKA_STENDA,
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
// RU: Тот же набор seqs в другом порядке остаётся повтором; забывание проверяется ключом из третьего порядка.
// EN: The same seq set in another order remains a duplicate; test forgetting with a key from a third ordering.
const inojPoryadok = await zahod([11, 10]);
const vyzovov_posle_inogo = vyzovov;
zabytZahodPoSrezu(kluchSreza('proba-povtora', [11, 10]));
const posleZabyt = await zahod([10, 11]);
server.close();

t('первый заход по срезу состоялся', () => {
  if (pervyj.ishod === 'zahod-uzhe-byl') throw new Error('первый принят за повтор');
  if (vyzovov_posle_pervogo === 0) throw new Error('к провайдеру не ходили вовсе');
});

t('ПОВТОР по тому же срезу НЕ состоялся и назван', () => {
  if (vtoroj.ishod !== 'zahod-uzhe-byl') throw new Error('исход ' + vtoroj.ishod + ' — повтор прошёл как обычный заход');
  if (vtoroj.zahodov !== 2) throw new Error('заходов ' + vtoroj.zahodov + ', ждали 2');
});

// RU: Проверяем отсутствие оплаченного повторного вызова, а не только сообщение о пропуске.
// EN: Verify that no paid duplicate call occurred, not merely that skipping was reported.
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

t('integration-note ключ по краям: kluchSreza(s,[35844,35753,35800]) = s#35753-35844, пустой → null', () => {
  if (kluchSreza('s', [35844, 35753, 35800]) !== 's#35753-35844') throw new Error(kluchSreza('s', [35844, 35753, 35800]));
  if (kluchSreza('s', []) !== null) throw new Error('пустой не null');
});
t('integration-note тот же срез в ИНОМ порядке seqs — повтор назван и НЕ оплачен', () => {
  if (inojPoryadok.ishod !== 'zahod-uzhe-byl') throw new Error('исход ' + inojPoryadok.ishod + ' — порядок seqs дал второй заход');
  if (inojPoryadok.srez !== 'proba-povtora#10-11') throw new Error('srez ' + inojPoryadok.srez);
});
t('integration-note «забыть срез» по ключу из другого порядка — снимает защиту (как index.js zabytSrez)', () => {
  if (posleZabyt.ishod === 'zahod-uzhe-byl') throw new Error('не забылся: ключи зова и забывания разошлись');
  if (vyzovov <= vyzovov_posle_inogo) throw new Error('заход после забывания к провайдеру не ходил');
});
t('integration-note (low аудитор) в src НЕТ своей формулы ключа: «seqs[0]}-» и «sq[0]}-» — 0 вхождений (иначе ключи зова и забывания разойдутся)', () => {
  const pap = new URL('../src/', import.meta.url);
  const naideno = readdirSync(pap).filter((f) => f.endsWith('.js')).flatMap((f) => {
    const s = readFileSync(new URL(f, pap), 'utf-8');
    return ['seqs[0]}-', 'sq[0]}-'].filter((o) => s.includes(o)).map((o) => f + ': ' + o);
  });
  if (naideno.length) throw new Error(naideno.join(', '));
});
t('ДРУГОЙ срез повтором не считается', () => {
  if (drugoj.ishod === 'zahod-uzhe-byl') throw new Error('другой срез принят за повтор — счёт идёт не по срезу');
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
