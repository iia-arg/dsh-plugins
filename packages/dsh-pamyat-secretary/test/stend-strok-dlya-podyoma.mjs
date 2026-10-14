// RU: Проверяем три строки, читаемые внешними проверками подъёма: «] дистилляция: ПОЗВАНА —», «] дистилляция: ЗАКОНЧЕНА —», «] дистилляция НЕ СОБРАЛАСЬ:». Менять их нужно вместе с читателями. Первые две проверяем по настоящему выводу apply без модели; третью — по литералу исходника и префиксу krik, поскольку синхронный отказ сборки через apply здесь не вызывается. Коды: 0 — успех, 1 — расхождение, 2 — предмет не загрузился.
// EN: Test three lines consumed by external startup checks: “] дистилляция: ПОЗВАНА —”, “] дистилляция: ЗАКОНЧЕНА —”, and “] дистилляция НЕ СОБРАЛАСЬ:”. Update them together with consumers. Check the first two through real apply output without a model; check the third through its source literal and krik prefix because synchronous assembly failure is not induced through apply here. Codes: 0 success, 1 mismatch, 2 subject failed to load.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHITAYUT = { pozvana: '] дистилляция: ПОЗВАНА —', zakonchena: '] дистилляция: ЗАКОНЧЕНА —', neSobralas: '] дистилляция НЕ СОБРАЛАСЬ:' };
const dir = mkdtempSync(join(tmpdir(), 'stend-strok-dlya-podyoma-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));
const stderr = console.error;
let ok = 0, bed = 0;
const proba = (imya, v) => { if (v === true) { ok++; console.log('  ✅ ' + imya); } else { bed++; console.log('  ❌ ' + imya + ' — ' + String(v).slice(0, 220)); } };
let apply, Config;
process.env.DSH_HOME = dir; process.env.HOME = dir; process.env.PAMYAT_DISTILLYACIYA_VYKL = join(dir, 'net');
writeFileSync(join(dir, 'key'), 'synthetic-test-key');
try { ({ apply, Config } = await import('../src/index.js')); }
catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

const lines = []; console.error = (...a) => lines.push(a.join(' ')); let handler;
try {
  const ctx = { plugin: () => {}, on: (name, f) => { if (name === 'session/event') handler = f; }, pamyat: { zapisat: () => ({ ishod: 'zapisano', id: 1 }), poIstochniku: () => [] } };
  apply(ctx, Config({ distillyaciya: true, klyuchFajl: join(dir, 'key'), putOtklonennyh: join(dir, 'otkl'), komandaTrevogi: '', hodovojZov: { vkl: true, porogZnakov: 1 } }));
  lines.length = 0;
  const session = { id: 'test-podyom', events: [{ type: 'user/message', seq: 0, data: { content: [{ type: 'text', text: 'Обычная речь для пробы.' }] } }, { type: 'turn/end', seq: 1, data: {} }] };
  handler(session, { type: 'turn/end', seq: 1, data: {} });
  for (let i = 0; i < 200 && !lines.some((l) => l.includes('ЗАКОНЧЕНА')); i++) await new Promise((r) => setTimeout(r, 5));
} finally { console.error = stderr; }
const nPoz = lines.filter((l) => l.includes(CHITAYUT.pozvana)).length;
const nZak = lines.filter((l) => l.includes(CHITAYUT.zakonchena)).length;
proba(`«${CHITAYUT.pozvana}» печатается дословно (подстрока читателей) — ровно раз на заход`, nPoz === 1 || `найдено ${nPoz}; строки: ${lines.filter((l) => /дистилляция/.test(l)).join(' | ')}`);
proba(`«${CHITAYUT.zakonchena}» печатается дословно — ровно раз на заход`, nZak === 1 || `найдено ${nZak}; строки: ${lines.filter((l) => /дистилляция/.test(l)).join(' | ')}`);
const prefiks = lines.find((l) => l.startsWith('[dsh-pamyat-secretary '));
proba('префикс krik на настоящем выводе оканчивается «] » (конец префикса входит в подстроки читателей)', (!!prefiks && /^\[dsh-pamyat-secretary [^\]]+\] /.test(prefiks)) || `строка: ${prefiks}`);
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const lit = "krik('" + CHITAYUT.neSobralas.slice(2) + " '";
proba(`«${CHITAYUT.neSobralas}» — литерал вызова krik в исходнике (по исходнику: синхронный сбой сборки через apply не вызвать)`, src.split(lit).length - 1 === 1 || `вхождений «${lit}»: ${src.split(lit).length - 1}`);
console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
