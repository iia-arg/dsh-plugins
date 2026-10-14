// RU: Проверяем онлайн-выключатель по поведению prichinaVyklyucheniya. Вторым срезом читаем порядок исходника: обработчик компакта должен получить решение до запуска дистилляции.
// EN: Test the online switch through prichinaVyklyucheniya behavior. Independently inspect source order: the compaction handler must obtain the decision before starting distillation.
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временное дочернего процесса убирает сам процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process cleans its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
const kat = vremennyj(join(tmpdir(), 'stend-vykl-')); const FAJL = join(kat, 'distillyaciya-vyklyuchena');
process.env.PAMYAT_DISTILLYACIYA_VYKL = FAJL;
let prichinaVyklyucheniya;
try { ({ prichinaVyklyucheniya } = await import(new URL('../src/index.js', import.meta.url).href)); }
catch (e) { console.log('СЛЕПОТА: модуль не импортировался — ' + String(e?.message ?? e).slice(0, 120)); process.exit(2); }
let ok = 0, vsego = 0; const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
proba('1 ВКЛ: настройка true, файла нет → дистилляция идёт (причины нет)', () => { if (prichinaVyklyucheniya({ distillyaciya: true }) !== null) throw new Error('выключено без причины'); });
proba('2 ВЫКЛ ФАЙЛОМ: файл появился → пропуск сразу, причина называет файл', () => { writeFileSync(FAJL, ''); const p = prichinaVyklyucheniya({ distillyaciya: true }); if (!p || !p.includes('выключена файлом ' + FAJL)) throw new Error('причина: ' + p); });
proba('3 СНЯТО: файл убран → снова идёт, без подъёма (то же значение настройки)', () => { rmSync(FAJL); if (prichinaVyklyucheniya({ distillyaciya: true }) !== null) throw new Error('не включилась'); });
proba('4 СТАРШИНСТВО: настройка false выключает и без файла', () => { const p = prichinaVyklyucheniya({ distillyaciya: false }); if (!p || !p.includes('настройкой distillyaciya')) throw new Error('причина: ' + p); });
proba('5 ОБРАБОТЧИК: решение берётся из prichinaVyklyucheniya ДО запуска distillirovat, при причине — возврат svodka-tolko со строкой', () => {
  const t = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8'); const i = t.indexOf('const prichinaVykl = prichinaVyklyucheniya(config);'), j = t.indexOf('distillirovat({');
  if (i < 0 || j < 0 || i > j) throw new Error('проверка выключателя не стоит перед distillirovat');
  const kusok = t.slice(i, j); if (!/if \(prichinaVykl\) \{[\s\S]*ПРОПУЩЕНА[\s\S]*return 'svodka-tolko';/.test(kusok)) throw new Error('при причине нет строки ПРОПУЩЕНА и возврата');
});
rmSync(kat, { recursive: true, force: true }); console.log(`стенд выключателя: ${ok} из ${vsego}`); process.exit(ok === vsego ? 0 : 1);
