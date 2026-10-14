// RU: Проверяем число уже записанных статей в строке ПРЕРВАНА. Метки — настоящие файлы во временном каталоге, poIstochniku подставной; записанное нельзя объявлять незаписанным. Коды: 0 — успех, 1 — расхождение, 2 — слепота.
// EN: Test the count of articles already written in the ПРЕРВАНА line. Markers are real files in a temporary directory, and poIstochniku is fake; written records must not be reported as unwritten. Codes: 0 success, 1 mismatch, 2 unobservable.
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let app;
try { app = await import('../src/index.js'); } catch (e) { console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160)); process.exit(2); }
if (typeof app.najtiPrervannye !== 'function') { console.log('СЛЕПОТА: нет najtiPrervannye'); process.exit(2); }
const T = mkdtempSync(join(tmpdir(), 'stend-prervannogo-')); process.on('exit', () => rmSync(T, { recursive: true, force: true }));
let vsego = 0, proshlo = 0;
const proba = (imya, u, p) => { vsego++; if (u) { proshlo++; console.log('  ✅ ' + imya); } else console.log('  ❌ ' + imya + (p ? ' — ' + String(p).slice(0, 220) : '')); };
function sluchaj(poIstochniku, srez = 'sess#1201-1813') {
  const kat = mkdtempSync(join(T, 'k-'));
  writeFileSync(join(kat, 'razbor-idet-1790778103616-3159388.txt'), JSON.stringify({ chto: 'povtorit-distillyaciyu-po-srezu', srez, pozvana: '2026-09-30T14:21:43.616Z', pid: 3159388 }));
  const kriki = [];
  const itog = app.najtiPrervannye({ putOtklonennyh: kat }, (s) => kriki.push(s), { pid: 1, nachaloProcessa: Date.now(), poIstochniku });
  return { itog, kriki, fajly: readdirSync(kat) };
}
const baza = { 'sess#1201-1813#okno1': 51, 'sess#1201-1813#okno3': 2, 'sess#1201-1813': 1 };   /* RU: Источник без #okno означает сводку компакции, а не статью.
 * EN: A source without #okno denotes a compaction summary rather than an article.
 */
const pi = (ist) => Array.from({ length: baza[ist] ?? 0 }, (_, i) => ({ id: i }));
let r = sluchaj(pi);
const stroka = r.kriki.find((k) => k.startsWith('дистилляция ПРЕРВАНА')) ?? '';
proba('записано 51+2 по окнам 1 и 3 — строка называет 53, а не «НЕ записаны»', /записано статей 53 /.test(stroka) && !/НЕ записаны/.test(stroka), stroka);
proba('сводка компакции (источник без #okno) в счёт статей НЕ входит', !/записано статей 54/.test(stroka), stroka);
proba('итог несёт число записанного (для тревоги)', r.itog.length === 1 && r.itog[0].zapisano === 53, JSON.stringify(r.itog));
proba('метка переименована в задание, как прежде', r.fajly.length === 1 && r.fajly[0].startsWith('zadanie-prervan-'), JSON.stringify(r.fajly));
proba('в строке: остаток тем НЕ записан и /distill-srez не доберёт', /остаток тем НЕ записан/.test(stroka) && /не доберёт/.test(stroka), stroka);
r = sluchaj(() => []);
proba('записано 0 — «НЕ записаны (записей источника 0)»', (r.kriki.find((k) => k.startsWith('дистилляция ПРЕРВАНА')) ?? '').includes('знания среза НЕ записаны (записей источника 0)') && r.itog[0].zapisano === 0, r.kriki.join(' | '));
r = sluchaj(null);
proba('ядра нет — «НЕ ИЗВЕСТНО», а не ноль', (r.kriki.find((k) => k.startsWith('дистилляция ПРЕРВАНА')) ?? '').includes('НЕ ИЗВЕСТНО') && r.itog[0].zapisano === null, r.kriki.join(' | '));
r = sluchaj(() => { throw new Error('база занята'); });
proba('ядро бросило — «НЕ ИЗВЕСТНО», разбор меток не упал', (r.kriki.find((k) => k.startsWith('дистилляция ПРЕРВАНА')) ?? '').includes('НЕ ИЗВЕСТНО') && r.fajly[0]?.startsWith('zadanie-prervan-'), r.kriki.join(' | '));
proba('tekstZapisannogo: предел окон назван числом', app.tekstZapisannogo(5).includes(`окна 1–${app.PREDEL_OKON_SCHETA}`), app.tekstZapisannogo(5));
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
