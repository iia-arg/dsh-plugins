// RU: Проверяем ходовой зов без сжатия: одна дистилляция на агента при двух экземплярах пакета; числовой предел повторов и одна тревога; состояние по DSH_HOME, а не учётке; настоящий turn/end через session/event; маска среза до модели и записи; одно окно на turn/end. Журнал из STEND_ZHURNAL_KODERA допускает .jsonl/.zstd, без него проверка формы события слепа с кодом 2. Число включённых рабочих профилей, цена и качество живого провайдера не проверяются.
// EN: Test turn-based invocation without compaction: one distillation per agent with two package instances; a numeric retry limit and one alert; state keyed by DSH_HOME rather than account; real turn/end through session/event; slice masking before model calls and writes; one window per turn/end. STEND_ZHURNAL_KODERA accepts .jsonl/.zstd; without it, the event-shape test is unobservable with code 2. Enabled production profile counts, live provider cost, and quality are outside coverage.
import { createServer } from 'node:http';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sozdatHodovojZov, vybratOkno } from '../src/hodovoj-zov.js';
// RU: Убираем временное на всех перехватываемых путях выхода; SIGKILL уборку не выполняет.
// EN: Clean temporary files on every interceptable exit path; SIGKILL cannot run cleanup.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, vsego = 0, slep = 0;
const proba = async (imya, f) => {
  vsego++;
  try { const v = await f(); if (v === 'SLEP') { slep++; console.log('  ⚠️ ' + imya + ' — СЛЕПА (предмета нет)'); return; }
        if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением');
        ok++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 300)); }
};
const kat = vremennyj(join(tmpdir(), 'stend-hodovogo-zova-'));

// RU: События повторяют форму платформы: user/message содержит массив content, assistant/message — message.content.
// EN: Events follow platform shapes: user/message has a content array, assistant/message has message.content.
const um = (seq, text) => ({ type: 'user/message', seq, time: 1e12 + seq, data: { content: [{ type: 'text', text }] } });
const am = (seq, text) => ({ type: 'assistant/message', seq, time: 1e12 + seq, data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } });
const te = (seq) => ({ type: 'turn/end', seq, time: 1e12 + seq, data: {} });
// RU: Создаём n ходов с речью длиной razmer: user, assistant и turn/end на ход, seq начинается с нуля.
// EN: Create n turns with speech length razmer: user, assistant, and turn/end per turn, with seq starting at zero.
function sessiya(n, razmer, id = 'sess-1') {
  const ev = []; for (let i = 0; i < n; i++) { ev.push(um(ev.length, 'З'.repeat(razmer))); ev.push(am(ev.length, 'О')); ev.push(te(ev.length)); }
  return { id, events: ev };
}
const konecHoda = (s, i) => s.events.filter((e) => e.type === 'turn/end')[i];

function zov({ dshHome, putOtkl, zapustit, nastrojka = {}, krik = [], trevogi = [], zhiv, sejchas }) {
  return sozdatHodovojZov({ nastrojka: { vkl: true, porogZnakov: 100, neudachPodryad: 3, pauzaMinut: 60, ...nastrojka },
    dshHome, putOtklonennyh: putOtkl, krik: (m) => krik.push(String(m)), trevoga: (t) => trevogi.push(t), zapustit,
    ...(zhiv ? { zhiv } : {}), ...(sejchas ? { sejchas } : {}) });
}
// RU: Заглушка синхронно ставит razbor-idet, как настоящий заход; исход задаётся сценарием.
// EN: The stub sets razbor-idet synchronously like the real run; the scenario selects the outcome.
function zaglushka(putOtkl, { vechno = false, isxod = { ishod: 'ok', okon: 1, okonOk: 1 } } = {}) {
  const vyzovy = [];
  const f = (session, dannye) => {
    vyzovy.push(dannye.shadowedSeqs.slice());
    mkdirSync(putOtkl, { recursive: true });
    const metka = join(putOtkl, `razbor-idet-${Date.now()}-${vyzovy.length}.txt`);
    writeFileSync(metka, JSON.stringify({ pid: process.pid }));
    if (vechno) return new Promise(() => {});
    return Promise.resolve(isxod).finally(() => rmSync_(metka, { force: true }));
  };
  f.vyzovy = vyzovy; return f;
}

// RU: Проверяем единственность захода на агента.
// EN: Test one run per agent.
await proba('1 одна дистилляция на агента: два экземпляра пакета, два переполненных turn/end при идущем заходе → заход 1; '
          + 'порча (метку не смотреть) → 2', async () => {
  const progon = (porcha) => {
    const d = vremennyj(join(kat, 'u1-')); const otkl = join(d, 'otkl'); const zap = zaglushka(otkl, { vechno: true });
    const A = zov({ dshHome: d, putOtkl: otkl, zapustit: zap });
    const B = zov({ dshHome: d, putOtkl: otkl, zapustit: zap, ...(porcha ? { zhiv: () => false } : {}) });
    const s = sessiya(6, 60);
    for (const i of [1, 3]) { const e = konecHoda(s, i); A.naSobytie(s, e); B.naSobytie(s, e); }
    return zap.vyzovy.length;
  };
  const n = progon(false), p = progon(true);
  if (n !== 1) throw new Error(`заходов ${n}, ждали 1`);
  if (p !== 2) throw new Error(`порча не видна: заходов ${p}, ждали 2 — проба не различает`);
});

// RU: Проверяем предел повторов и единственную тревогу.
// EN: Test the retry limit and a single alert.
await proba('2 граница повторов: отказ API × 10 ходов → заходов 3 (K), тревога 1; после паузы — снова; порча (K=1000) → 10', async () => {
  const progon = (K) => {
    const d = vremennyj(join(kat, 'u2-')); const otkl = join(d, 'otkl'); let t = 0; const trevogi = []; const vyzovy = [];
    const zapustit = () => { vyzovy.push(1); return Promise.reject(new Error('HTTP 503 подставной')); };
    const Z = zov({ dshHome: d, putOtkl: otkl, zapustit, nastrojka: { neudachPodryad: K }, trevogi, sejchas: () => t });
    const s = sessiya(12, 60);
    return { Z, s, vyzovy, trevogi, sdvig: (ms) => { t += ms; } };
  };
  const hody = async (x, ot, doo) => { for (let i = ot; i < doo; i++) { const p = x.Z.naSobytie(x.s, konecHoda(x.s, i)); if (p) await p; } };
  const x = progon(3); await hody(x, 1, 11);
  if (x.vyzovy.length !== 3 || x.trevogi.length !== 1) throw new Error(`заходов ${x.vyzovy.length} (ждали 3), тревог ${x.trevogi.length} (ждали 1)`);
  x.sdvig(61 * 60000); await hody(x, 11, 12);
  if (x.vyzovy.length !== 4 || x.trevogi.length !== 1) throw new Error(`после паузы: заходов ${x.vyzovy.length} (ждали 4), тревог ${x.trevogi.length} (ждали 1)`);
  const y = progon(1000); await hody(y, 1, 11);
  if (y.vyzovy.length !== 10) throw new Error(`порча не видна: заходов ${y.vyzovy.length}, ждали 10`);
});

// RU: Проверяем разделение состояния по DSH_HOME.
// EN: Test state separation by DSH_HOME.
await proba('3 вода по DSH_HOME: два кодера одной учётки — у каждого своя; без DSH_HOME — отказ вслух, зов не заведён', async () => {
  const dA = vremennyj(join(kat, 'fixture_agent-')), dB = vremennyj(join(kat, 'beta-'));
  const zA = zaglushka(join(dA, 'otkl')), zB = zaglushka(join(dB, 'otkl'));
  const A = zov({ dshHome: dA, putOtkl: join(dA, 'otkl'), zapustit: zA }), B = zov({ dshHome: dB, putOtkl: join(dB, 'otkl'), zapustit: zB });
  const s = sessiya(6, 60, 'telegram-a2a');   /* RU: Оба экземпляра используют одинаковое имя сессии.
 * EN: Both instances use the same session name.
 */
  await A.naSobytie(s, konecHoda(s, 1));
  const vA = JSON.parse(readFileSync(join(dA, 'pamyat-secretary', 'vysokaya-voda.json'), 'utf8'));
  if (vA['telegram-a2a']?.voda !== konecHoda(s, 1).seq) throw new Error('вода A не сдвинулась до конца окна: ' + JSON.stringify(vA));
  if (existsSync(join(dB, 'pamyat-secretary', 'vysokaya-voda.json'))) throw new Error('у B появилась вода от захода A');
  await B.naSobytie(s, konecHoda(s, 1));
  if (zB.vyzovy.length !== 1 || zB.vyzovy[0][0] !== 0) throw new Error('B не начал со своей воды (с нуля): ' + JSON.stringify(zB.vyzovy[0]?.slice(0, 3)));
  const krik = []; const N = zov({ dshHome: null, putOtkl: join(dA, 'otkl'), zapustit: zA, krik });
  if (N.vkl !== false || !krik.some((k) => k.includes('DSH_HOME не задан'))) throw new Error('без DSH_HOME зов заведён или молча');
});

// RU: Проверяем одно окно на ход.
// EN: Test one window per turn.
await proba('7 долг: один turn/end при долге на 5 окон → заход ровно 1, окно — до первого конца хода после порога; вода двигается по окну', async () => {
  const d = vremennyj(join(kat, 'u7-')); const otkl = join(d, 'otkl'); const zap = zaglushka(otkl);
  const Z = zov({ dshHome: d, putOtkl: otkl, zapustit: zap, nastrojka: { porogZnakov: 250 } });
  const s = sessiya(20, 60);             /* RU: Около 62 символов речи на ход: окно примерно четыре хода, долг примерно пять окон.
 * EN: About 62 speech characters per turn: roughly four turns per window and five pending windows.
 */
  const posled = s.events.at(-1);
  await Z.naSobytie(s, posled);
  if (zap.vyzovy.length !== 1) throw new Error(`заходов ${zap.vyzovy.length}, ждали 1`);
  const okno = zap.vyzovy[0], konec = okno.at(-1);
  if (okno[0] !== 0 || s.events[konec].type !== 'turn/end' || konec >= posled.seq) throw new Error(`окно ${okno[0]}–${konec}: не с начала долга или не до конца хода`);
  const { znakov } = vybratOkno(s.events, -1, konec, Infinity);
  const prezhnij = s.events.filter((e) => e.type === 'turn/end' && e.seq < konec).at(-1).seq;
  const bez = vybratOkno(s.events, -1, prezhnij, Infinity).znakov;
  if (znakov < 250 || bez >= 250) throw new Error(`окно не минимальное: речи ${znakov}, без последнего хода ${bez}, порог 250`);
  await Z.naSobytie(s, posled);
  if (zap.vyzovy.length !== 2 || zap.vyzovy[1][0] !== konec + 1) throw new Error('второй ход не взял СЛЕДУЮЩЕЕ окно от воды');
});

// RU: Собираем настоящий apply с подставным ctx для события и маски. Без метода маски заход даёт net-maski; обычная подстава пропускает текст, а проба маски использует ядро.
// EN: Assemble real apply with a fake ctx for event and masking tests. Missing masking gives net-maski; the ordinary fake passes text through, while the masking probe uses the core.
const MASKA_PUSTYSHKA = (t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false });
async function podnyat(config, env = {}, maska = MASKA_PUSTYSHKA) {
  const krik = []; const perehvat = console.error;
  console.error = (...a) => krik.push(a.map(String).join(' '));
  const staroe = {}; for (const [k, v] of Object.entries(env)) { staroe[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const { apply } = await import('../src/index.js?' + Math.random());
  let handler = null; const zapisano = [];
  const ctx = {
    on: (imya, f) => { if (imya === 'session/event') handler = f; },
    plugin: () => {},
    pamyat: { zapisat: (z) => { zapisano.push(z); return { ishod: 'zapisano', id: zapisano.length }; }, zapishet: () => true,
              blizhajshaya: () => null, poIstochniku: () => [], zamaskirovatVhod: maska },
  };
  apply(ctx, config);
  return { handler, krik, zapisano, vernut: () => { console.error = perehvat; for (const [k, v] of Object.entries(staroe)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}
const zhdat = async (uslovie, ms = 20000) => { const t0 = Date.now(); while (!uslovie()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)); } return true; };

// RU: Проверяем доставку настоящей формы turn/end.
// EN: Test delivery of the actual turn/end shape.
await proba('5 настоящая форма: события журнала кодера (копия), по одному через session/event НАСТОЯЩЕГО apply → '
          + 'turn/end доходит, окно ≥ порога и кончается на turn/end, тело зовётся (без ключа — отказ net-klyucha, в сеть не ходит)', async () => {
  const put = process.env.STEND_ZHURNAL_KODERA;
  if (!put || !existsSync(put)) return 'SLEP';
  const tekst = put.endsWith('.zstd') ? execFileSync('zstdcat', [put], { maxBuffer: 1 << 30 }).toString('utf8') : readFileSync(put, 'utf8');
  const vse = tekst.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const d = vremennyj(join(kat, 'u5-')); const otkl = join(d, 'otkl');
  const P = await podnyat({ distillyaciya: true, putOtklonennyh: otkl, komandaTrevogi: '', klyuchOkruzhenie: 'NET_KLYUCHA_STEND_1107',
    hodovojZov: { vkl: true, porogZnakov: 160000 } }, { DSH_HOME: d, NET_KLYUCHA_STEND_1107: undefined, PAMYAT_DISTILLYACIYA_VYKL: join(d, 'net-vyklyuchatelya') });
  try {
    if (typeof P.handler !== 'function') throw new Error('apply не подписался на session/event');
    const session = { id: 'kopiya-zhurnala', events: [] };
    let pervyj = null;
    for (const e of vse) {
      session.events.push(e); P.handler(session, e);
      if (!pervyj && P.krik.some((k) => k.includes('ходовой зов: передаю окно дистилляции'))) pervyj = e;
      if (pervyj) break;   /* RU: Достаточно одного захода для стыка события; дальнейшие повторы проверяются отдельными пробами.
 * EN: One run suffices for the event boundary; further retries have separate probes.
 */
    }
    if (!pervyj) throw new Error(`зов не сработал ни разу на ${vse.length} событиях (turn/end ${vse.filter((e) => e.type === 'turn/end').length})`);
    if (pervyj.type !== 'turn/end') throw new Error('зов сработал не на turn/end, а на ' + pervyj.type);
    if (!await zhdat(() => P.krik.some((k) => k.includes('ходовой зов: неудача 1 из 3')))) throw new Error('исход захода не пришёл');
    const pozvana = P.krik.find((k) => k.includes('передаю окно дистилляции'));
    const m = /окно seq (\d+)–(\d+) \((\d+) событий, (\d+) знаков/.exec(pozvana);
    if (!m || Number(m[4]) < 160000 || Number(m[2]) !== pervyj.seq) throw new Error('окно не по порогу или не до этого хода: ' + pozvana);
    if (!P.krik.some((k) => k.includes('net-klyucha') || k.includes('дистилляция не начата'))) throw new Error('тело не звалось (нет строки отказа ключа)');
    console.log('     ' + pozvana.replace(/^.*ходовой зов: /, ''));
  } finally { P.vernut(); }
});

// RU: Проверяем секрет в срезе перед моделью и записью.
// EN: Test a secret in the slice before model calls and writes.
await proba('6 секрет в срезе: с маской ядра (a89) образец НЕ уходит модели и не идёт в память (подставной сервер модели)', async () => {
  const { zamaskirovatVhod } = await import('dsh-pamyat-core/src/filtr-vhoda.js').catch(() => ({}));
  if (typeof zamaskirovatVhod !== 'function') return 'SLEP';   /* RU: Имитируем старое ядро без метода маски.
 * EN: Simulate an older core without the masking method.
 */
  const d = vremennyj(join(kat, 'u6-')); const otkl = join(d, 'otkl');
  const klyuchFajl = join(d, 'klyuch'); writeFileSync(klyuchFajl, 'proba-klyuch\n', { mode: 0o600 });
  const OBRAZEC = 'sk-STENDaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1107'; // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
  const zaprosy = []; let vyzov = 0;
  const otvety = [{ content: [{ type: 'text', text: '[{"theme":"ключ провайдера","kind":"fakt"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'Ключ провайдера для пробы лежит в хранилище; в разговоре был [СЕКРЕТ strukturnyj:sk-].' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  const server = createServer((req, res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { zaprosy.push(s); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => server.listen(0, '127.0.0.1', g));
  const P = await podnyat({ distillyaciya: true, putOtklonennyh: otkl, komandaTrevogi: '', klyuchFajl, model: 'proba-model',
    adres: `http://127.0.0.1:${server.address().port}/v1/messages`, maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 5, minTokenov: 1,
    hodovojZov: { vkl: true, porogZnakov: 50 } }, { DSH_HOME: d, PAMYAT_DISTILLYACIYA_VYKL: join(d, 'net-vyklyuchatelya') }, zamaskirovatVhod);
  try {
    const session = { id: 's6', events: [um(0, 'Вот ключ провайдера для пробы: ' + OBRAZEC + ' — запомни, где он лежит.'), am(1, 'Понял, записал.'), te(2)] };
    P.handler(session, session.events[2]);
    if (!await zhdat(() => P.krik.some((k) => k.includes('ходовой зов: вода сдвинута') || k.includes('ходовой зов: неудача')))) throw new Error('заход не закончился');
    const vVhode = zaprosy.some((z) => z.includes(OBRAZEC));
    const vPamyat = P.zapisano.some((z) => JSON.stringify(z).includes(OBRAZEC));
    console.log(`     ВХОД модели: образец ${vVhode ? 'УШЁЛ в запрос' : 'не ушёл (замаскирован)'}; в память ушло статей ${P.zapisano.length}, образец ${vPamyat ? 'В НИХ ЕСТЬ' : 'нет'}`);
    if (!zaprosy.length) throw new Error('запросов к модели нет — проба не видит вход');
    if (vVhode) throw new Error('образец ушёл внешней модели при маске ядра');
    if (!zaprosy.some((z) => z.includes('[СЕКРЕТ strukturnyj:sk-]'))) throw new Error('метки маски в запросе нет');
    if (vPamyat) throw new Error('образец пошёл в память');
  } finally { P.vernut(); server.close(); }
});

console.log(`стенд ходового зова: ${ok} из ${vsego}` + (slep ? ` (слепых ${slep})` : ''));
process.exit(ok === vsego ? 0 : (ok + slep === vsego ? 2 : 1));
