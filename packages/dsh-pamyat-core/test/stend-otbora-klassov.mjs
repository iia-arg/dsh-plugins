// RU: Проверяем отбор знаний при запросе без класса: svodka-kompakcii не должна выдаваться как знание. Без tolkoKlassy главная проба должна краснеть. Границы: явный класс не ограничивается этим отбором; null и пустой перечень сохраняют прежний запрос без отбора.
// EN: Test knowledge selection for a query without a class: svodka-kompakcii must not be served as knowledge. The main probe must fail without tolkoKlassy. Limits: an explicit class bypasses this selection; null and an empty list preserve the previous unrestricted query.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))
let otkrytHranilishche;
try { ({ otkrytHranilishche } = await import('../src/hranilishche.js')); }
catch (e) { console.log('СЛЕПОТА: ' + String(e?.message ?? e).slice(0, 140)); process.exit(2); }

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v && typeof v.then === 'function') throw new Error('тело ОЖИДАЮЩЕЕ — прогонщик синхронный');
    if (v !== undefined && v !== true) throw new Error('тело ВЕРНУЛО «' + String(v).slice(0, 50) + '»');
    proshlo++; console.log('  ✅ ' + imya);
  } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

const ZNANIYA = ['urok', 'reshenie', 'oshibka'];
const katalog = vremennyj(join(tmpdir(), 'otbor-klassov-'));
let nomer = 0;
const svezhee = () => {
  const h = otkrytHranilishche(join(katalog, 'p' + (++nomer) + '.db'));
  h.zapisat({ agent: 'a', klass: 'urok', soderzhim: 'знание', istochnik: 'session#1' });
  h.zapisat({ agent: 'a', klass: 'svodka-kompakcii', soderzhim: 'служебное', istochnik: 'session#1' });
  return h;
};
const klassy = (z) => z.map((r) => r.klass).sort();

proba('стенд годен: обе записи легли и читаются без отбора', () => {
  const z = svezhee().prochitat({ agent: 'a' });
  if (z.length !== 2) throw new Error('ожидали 2 записи, получили ' + z.length + ' — пробник негоден');
});

proba('ГЛАВНОЕ: спрос БЕЗ класса со списком знаний НЕ отдаёт служебную запись', () => {
  const z = svezhee().prochitat({ agent: 'a', tolkoKlassy: ZNANIYA });
  const k = klassy(z);
  if (k.includes('svodka-kompakcii')) throw new Error('служебное выпало как знание: ' + k.join(','));
  if (!k.includes('urok')) throw new Error('знание пропало вместе со служебным: ' + k.join(','));
});

proba('Г1: спрос С УКАЗАННЫМ классом отбор НЕ трогает (restore берёт сводку по классу)', () => {
  const z = svezhee().prochitat({ agent: 'a', klass: 'svodka-kompakcii', tolkoKlassy: ZNANIYA });
  if (z.length !== 1 || z[0].klass !== 'svodka-kompakcii') {
    throw new Error('спрос по классу урезан отбором: ' + JSON.stringify(klassy(z)));
  }
});

proba('Г2: tolkoKlassy не задан — ведём себя как прежде, служебное приходит', () => {
  const k = klassy(svezhee().prochitat({ agent: 'a', tolkoKlassy: null }));
  if (k.length !== 2) throw new Error('без перечня выдача урезана молча: ' + k.join(','));
});

proba('Г3: пустой перечень — как прежде, а НЕ «отобрать ничего»', () => {
  const k = klassy(svezhee().prochitat({ agent: 'a', tolkoKlassy: [] }));
  if (k.length !== 2) throw new Error('пустой перечень съел выдачу: ' + k.join(','));
});

proba('отбор не ломает предел выдачи: skolko считается ПОСЛЕ отбора', () => {
  const h = svezhee();
  h.zapisat({ agent: 'a', klass: 'urok', soderzhim: 'второе знание', istochnik: 'session#1' });
  const z = h.prochitat({ agent: 'a', skolko: 1, tolkoKlassy: ZNANIYA });
  if (z.length !== 1) throw new Error('ожидали 1 запись по пределу, получили ' + z.length);
  if (z[0].klass !== 'urok') throw new Error('предел отдал служебное: ' + z[0].klass);
});

proba('чужой агент отбором не затрагивается', () => {
  const h = svezhee();
  h.zapisat({ agent: 'b', klass: 'urok', soderzhim: 'чужое', istochnik: 'session#1' });
  const z = h.prochitat({ agent: 'a', tolkoKlassy: ZNANIYA });
  if (z.some((r) => r.agent !== 'a')) throw new Error('чужая запись попала в выдачу');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
