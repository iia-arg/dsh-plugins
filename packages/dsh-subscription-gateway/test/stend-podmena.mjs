// RU: Проверка stend-podmena: работает с контролируемыми запросами/процессами; реальные SDK нужны только явно интеграционным сценариям. Фикстуры API не доказывают живую подписку или production rollout.
// EN: stend-podmena verification uses controlled requests/processes; actual SDKs are required only by explicit integration cases. API fixtures do not prove a live subscription or production rollout.


import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { existsSync as est } from 'node:fs';
const kat = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const STUB = join(dirname(fileURLToPath(import.meta.url)), 'zaglushka-app-server.mjs');
if (!est(join(kat, 'codex-app-server.mjs'))) { console.log(`СЛЕПОТА: предмета нет: ${join(kat, 'codex-app-server.mjs')}`); process.exit(2); }
if (!est(STUB)) { console.log(`СЛЕПОТА: заглушки нет: ${STUB} — настоящий codex не зову`); process.exit(2); }
const M = await import(join(kat, 'codex-app-server.mjs'));
if (typeof M.sozdatKlienta !== 'function') { console.log('СЛЕПОТА: у предмета нет sozdatKlienta — заглушку не подставить'); process.exit(2); }
const klientImpl = (o) => M.sozdatKlienta({ ...o, bin: process.execPath, args: [STUB, 'app-server', '--listen', 'stdio://'] });
console.log(`предмет: ${join(kat, 'codex-app-server.mjs')}`);
const T = mkdtempSync(join(tmpdir(), 'stend-podmena-')); process.on('exit', () => rmSync(T, { recursive: true, force: true }));
let ok = 0, vs = 0, nz = 0; const proba = (i, u, p) => { vs++; if (u) { ok++; console.log('  ✅ ' + i); } else console.log('  ❌ ' + i + (p ? ' — ' + String(p).slice(0, 300) : '')); };
const P = { porog: 645272, okno: 921818, dolya: 0.7 };
async function hod(sc) {
  const zh = join(T, 'zh-' + (++nz)); const L = [], E = []; let err = null; const t0 = Date.now();
  const env = { ...process.env, STUB_SCENARIJ: sc, STUB_ZHURNAL: zh, STUB_ZANYATO: '100000,110000,120000,130000,140000' };
  try { for await (const e of M.progonAppServer({ bin: '/nonexistent/codex-ne-zvat', klientImpl, env, log: (s) => L.push(s), zapros: 'задача', cwd: T, model: 'gpt-6-astra', porog: P, tekstSignala: 'сигнал' })) E.push(e); }
  catch (e) { err = e.message; }
  const Z = existsSync(zh) ? readFileSync(zh, 'utf8') : '';
  return { L, E, Z, err, ms: Date.now() - t0, itog: E.find((e) => e.type === 'itog-app-server') };
}
const chuzhih = (h) => h.E.filter((e) => e.type === 'text' && /ОТВЕТ ЧУЖОЙ МОДЕЛИ/.test(e.text)).length;
const intr = (h) => (h.Z.match(/!!! INTERRUPT/g) ?? []).length;
const STROKA = /🔴 МОДЕЛЬ ПОДМЕНЕНА СЕРВЕРОМ: model\/rerouted gpt-6-astra → gpt-6-mini \(highRiskCyberActivity\)/;
for (const sc of ['podmena', 'podmena-rano', 'podmena-otkaz']) {
  const h = await hod(sc); const s = h.L.join('\n');
  console.log(`— ${sc}: ${h.ms} мс, событий ${h.E.length}, interrupt ${intr(h)}, чужих ответов ${chuzhih(h)}, ошибка: ${h.err ?? 'НЕТ'}`);
  proba(`${sc}: ход кончился исключением с именами моделей`, /модель подменена сервером: gpt-6-astra → gpt-6-mini/.test(h.err ?? ''), h.err);
  proba(`${sc}: строка журнала «🔴 МОДЕЛЬ ПОДМЕНЕНА СЕРВЕРОМ … from → to (reason)»`, STROKA.test(s), s);
  proba(`${sc}: turn/interrupt ровно 1, с threadId и turnId хода`, intr(h) === 1 && /"turnId":"hod-1"/.test(h.Z) && /"threadId":"nit-/.test(h.Z), h.Z);
  proba(`${sc}: наружу ни одного ответа чужой модели и нет itog`, chuzhih(h) === 0 && !h.itog, JSON.stringify(h.E).slice(0, 300));
  if (sc === 'podmena-otkaz') proba(`${sc}: отказ interrupt назван строкой`, /🔴 turn\/interrupt ОТКАЗАН/.test(s), s);
}
const r = await hod('rastet');
proba('РЕГРЕСС без подмены: ход штатный, ошибки нет, interrupt 0, итог отдан', !r.err && intr(r) === 0 && !!r.itog && r.itog.status === 'completed', r.err ?? r.Z);
console.log(`итог: ${ok} из ${vs}`); process.exit(ok === vs ? 0 : 1);
