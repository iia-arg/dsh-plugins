// RU: Проверяем настоящую zamaskirovatVhod ядра внутри общего тела дистилляции для сжатия и ходового зова, включая хвост. Структурные и объявленные синтетические секреты исчезают из запросов, метки [СЕКРЕТ <класс>] остаются. Порча маски возвращает образец в запрос; без метода заход не идёт. Сжатия дают одну тревогу, ходовой путь — одну по своей K-границе. Нет метода в ядре — пробы маски слепы с кодом 2; проба отсутствующего метода остаётся выполнимой.
// EN: Test the core’s real zamaskirovatVhod inside the shared distillation body for compaction and turn-based calls, including the tail. Synthetic structural and declared secrets disappear from requests while [СЕКРЕТ <class>] markers remain. Mutating the mask restores the sample in a request; a missing method prevents the run. Compactions produce one alert; the turn path produces one at its K boundary. A missing core method makes mask probes unobservable with code 2; the missing-method probe remains executable.
import { createServer } from 'node:http';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0, slep = 0;
const proba = async (imya, f) => {
  try { const v = await f(); if (v === 'SLEP') { slep++; console.log('  ⚠️ ' + imya + ' — СЛЕПА'); return; }
        if (v !== undefined) throw new Error('тело пробы вернуло значение'); ok++; console.log('  ✅ ' + imya); }
  catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e?.message ?? e).slice(0, 300)); }
};
let MASKA = null;
try { ({ zamaskirovatVhod: MASKA } = await import('dsh-pamyat-core/src/filtr-vhoda.js')); } catch { MASKA = null; }
if (typeof MASKA !== 'function') MASKA = null;

const TG = '1234567890:' + 'AAH' + 'x9Kq2Zm4Lp7Wn3Tb8Vc5Rd1Yf6Gh0Js';
const OBR = [ /* RU: Пара: текст образца и его часть, запрещённая в запросе.
 * EN: Pair: sample text and the fragment forbidden in requests.
 */
  ['-----BEGIN OPENSSH ' + 'PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXkt'],
  ['eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'dBjftJeZ4CVPmB92'],
  ['sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', 'a1B2c3D4e5F6'], ['ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'A1b2C3d4E5f6G7'],
  ['AKIA' + 'ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'], ['xoxb-' + '1234567890-abcdefghij', '1234567890-abc'],
  ['postgres://user:' + 's3cretPw@db.local/x', 's3cretPw'], [TG, 'x9Kq2Zm4Lp7Wn3'],
  ['https://api.telegram.org/bot' + TG + '/getMe', 'x9Kq2Zm4Lp7Wn3'], ['pwd: ' + 'Hunter22xy', 'Hunter22xy'],
  ['api_key=' + 'abc123XY', 'abc123XY'], ['token: ' + '3f2504e0-4f89-11d3-9a0c-0305e82c3301', '3f2504e0-4f89'],
];
const HVOST_OBR = ['ghp_' + 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2', 'Z9y8X7w6V5u4T3'];
const um = (seq, text) => ({ type: 'user/message', seq, time: 1e12 + seq, data: { content: [{ type: 'text', text }] } });
const am = (seq, text) => ({ type: 'assistant/message', seq, time: 1e12 + seq, data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } });
const te = (seq) => ({ type: 'turn/end', seq, time: 1e12 + seq, data: {} });

async function server() {
  const zaprosy = []; let vyzov = 0;
  const otvety = [{ content: [{ type: 'text', text: '[{"theme":"ключи и доступы","kind":"fakt"}]' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
                  { content: [{ type: 'text', text: 'Статья: ключи лежат в хранилище, значения не приводятся.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }];
  const s = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { zaprosy.push(b); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(otvety[Math.min(vyzov++, otvety.length - 1)])); }); });
  await new Promise((g) => s.listen(0, '127.0.0.1', g));
  return { adres: `http://127.0.0.1:${s.address().port}/v1/messages`, zaprosy, zakryt: () => s.close() };
}
async function podnyat(config, env, pamyatDop = {}) {
  const krik = []; const perehvat = console.error; console.error = (...a) => krik.push(a.map(String).join(' '));
  const staroe = {}; for (const [k, v] of Object.entries(env)) { staroe[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const { apply } = await import('../src/index.js?' + Math.random());
  let handler = null;
  const ctx = { on: (i, f) => { if (i === 'session/event') handler = f; }, plugin: () => {},
    pamyat: { zapisat: () => ({ ishod: 'zapisano', id: 1 }), zapishet: () => true, blizhajshaya: () => null, poIstochniku: () => [], ...pamyatDop } };
  apply(ctx, config);
  return { handler, krik, vernut: () => { console.error = perehvat; for (const [k, v] of Object.entries(staroe)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}
const zhdat = async (f, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)); } return true; };
const kat = vremennyj(join(tmpdir(), 'stend-maski-sekr-'));
const baza = (d, sv = {}) => ({ distillyaciya: true, putOtklonennyh: join(d, 'otkl'), komandaTrevogi: join(d, 'trevoga'), klyuchFajl: join(d, 'klyuch'),
  model: 'proba', maxTokenovTem: 1000, maxTokenovStati: 1000, predelTem: 5, minTokenov: 1, ...sv });
function dom(imya) {
  const d = vremennyj(join(kat, imya + '-')); writeFileSync(join(d, 'klyuch'), 'proba-klyuch\n', { mode: 0o600 });
  writeFileSync(join(d, 'trevoga'), `#!/bin/sh\necho "$1" >> ${d}/trevogi.txt\n`, { mode: 0o755 }); return d;
}
const trevog = (d) => existsSync(join(d, 'trevogi.txt')) ? readFileSync(join(d, 'trevogi.txt'), 'utf8').split('\n').filter(Boolean).length : 0;
const golova = () => OBR.map((o) => o[0]).join(' | проза | ');

// RU: Сжатие: срез 0–1 содержит образцы, хвост 2–3 — ещё образец, затем compaction/start и compaction/summary.
// EN: Compaction: slice 0–1 contains samples, tail 2–3 another sample, followed by compaction/start and compaction/summary.
function sessiyaSzhatiya(id = 'c1') {
  return { id: 's-szh', events: [um(0, 'Вот доступы: ' + golova()), am(1, 'Понял.'), um(2, 'И ещё ' + HVOST_OBR[0]), am(3, 'Принято.'),
    { type: 'compaction/start', seq: 4, time: 1e12 + 4, data: { compactionId: id } },
    { type: 'compaction/summary', seq: 5, time: 1e12 + 5, data: { compactionId: id, shadowedSeqs: [0, 1], shadowedTokenCount: 5000, summary: 'сводка' } }] };
}
async function progonSzhatie(maska, n = 1) {
  const d = dom('szh'); const S = await server();
  const P = await podnyat(baza(d, { adres: S.adres }), { DSH_HOME: d, PAMYAT_DISTILLYACIYA_VYKL: join(d, 'net') }, maska === undefined ? {} : { zamaskirovatVhod: maska });
  try {
    for (let i = 0; i < n; i++) {
      const s = sessiyaSzhatiya('c' + i); s.id = 's-szh-' + (++NOMER);
      P.handler(s, s.events[5]);
      if (!await zhdat(() => P.krik.filter((k) => k.includes('дистилляция: ЗАКОНЧЕНА')).length >= i + 1)) throw new Error('заход сжатия не закончился');
    }
    await new Promise((r) => setTimeout(r, 300));
    return { zaprosy: S.zaprosy, krik: P.krik, trevog: trevog(d) };
  } finally { P.vernut(); S.zakryt(); }
}
async function progonHod(maska, hodov = 1) {
  const d = dom('hod'); const S = await server();
  const P = await podnyat(baza(d, { adres: S.adres, hodovojZov: { vkl: true, porogZnakov: 50 } }), { DSH_HOME: d, PAMYAT_DISTILLYACIYA_VYKL: join(d, 'net') }, maska === undefined ? {} : { zamaskirovatVhod: maska });
  try {
    const s = { id: 's-hod-' + (++NOMER), events: [] };
    for (let i = 0; i < hodov; i++) {
      const b = s.events.length; s.events.push(um(b, 'Вот доступы: ' + golova()), am(b + 1, 'Понял.'), te(b + 2));
      P.handler(s, s.events[b + 2]);
      await zhdat(() => P.krik.some((k) => /ходовой зов: (вода сдвинута|неудача|снова отказ|ТРЕВОГА)/.test(k) && k.includes('')) , 3000);
      await new Promise((r) => setTimeout(r, 200));
    }
    await new Promise((r) => setTimeout(r, 300));
    return { zaprosy: S.zaprosy, krik: P.krik, trevog: trevog(d) };
  } finally { P.vernut(); S.zakryt(); }
}
// RU: Для каждого прогона своё имя сессии: distill-shov помнит обработанные срезы на модуль и иначе пропустит проверку до маски.
// EN: Use a distinct session name per run: distill-shov remembers processed slices per module and otherwise skips before masking.
let NOMER = 0;
const utechki = (zaprosy, obr) => obr.filter((o) => zaprosy.some((z) => z.includes(o[1]))).map((o) => o[1]);

await proba('1+5 СЖАТИЕ: образцы головы и хвоста → в запросах 0 ядер, метки есть', async () => {
  if (!MASKA) return 'SLEP';
  const r = await progonSzhatie(MASKA);
  if (!r.zaprosy.length) throw new Error('запросов к модели нет — заход не дошёл до модели');
  const ut = utechki(r.zaprosy, [...OBR, HVOST_OBR]); if (ut.length) throw new Error('ушли модели: ' + ut.join(', '));
  if (!r.zaprosy.some((z) => z.includes('[СЕКРЕТ strukturnyj:telegram]') && z.includes('[СЕКРЕТ obyavlennyj]'))) throw new Error('меток в запросе нет');
  if (!r.krik.some((k) => k.includes('вход модели замаскирован (хвост)'))) throw new Error('хвост не прошёл маску (строки нет)');
});
await proba('1+5 ХОДОВОЙ ЗОВ: образцы → в запросах 0 ядер, метки есть', async () => {
  if (!MASKA) return 'SLEP';
  const r = await progonHod(MASKA);
  if (!r.zaprosy.length) throw new Error('запросов к модели нет');
  const ut = utechki(r.zaprosy, OBR); if (ut.length) throw new Error('ушли модели: ' + ut.join(', '));
  if (!r.zaprosy.some((z) => z.includes('[СЕКРЕТ strukturnyj:telegram]'))) throw new Error('меток нет');
});
await proba('3 ПОРЧА: маска-пустышка (текст как есть) → образцы в запросе видны — проба различает', async () => {
  const r = await progonSzhatie((t) => ({ tekst: t, zameneno: 0, klassy: [], predelDostignut: false }));
  if (utechki(r.zaprosy, OBR).length < OBR.length - 1) throw new Error('при порче образцы не дошли до запроса — проба слепа');
});
await proba('4 СТАРОЕ ЯДРО (метода нет): СЖАТИЕ ×3 → запросов 0, исход net-maski, тревога ОДНА', async () => {
  const r = await progonSzhatie(undefined, 3);
  if (r.zaprosy.length) throw new Error('запросы ушли без маски: ' + r.zaprosy.length);
  if (r.krik.filter((k) => k.includes('исход net-maski')).length !== 3) throw new Error('не три отказа net-maski');
  if (r.trevog !== 1) throw new Error(`тревог ${r.trevog}, ждали 1`);
});
await proba('4 СТАРОЕ ЯДРО: ХОДОВОЙ ЗОВ ×5 → запросов 0, заходов 3 (K), тревога ОДНА (K-граница, без второй от пути сжатия)', async () => {
  const r = await progonHod(undefined, 5);
  if (r.zaprosy.length) throw new Error('запросы ушли без маски');
  const zahodov = r.krik.filter((k) => k.includes('ходовой зов: передаю окно дистилляции')).length;
  if (zahodov !== 3) throw new Error(`заходов ${zahodov}, ждали 3`);
  if (r.trevog !== 1) throw new Error(`тревог ${r.trevog}, ждали 1`);
});
console.log(`стенд маски входа секретаря: ${ok} из ${ok + bed + slep}` + (slep ? ` (слепых ${slep} — у ядра нет zamaskirovatVhod)` : ''));
process.exit(bed ? 1 : slep ? 2 : 0);
