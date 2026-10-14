// RU: Проверяем передачу перечня из index.js в hranilishche.js через службу на подставном ctx и объект ctx.provide(pamyat). Стенд одного хранилища не ловит потерю аргумента на этом шве. С той же стороны проверяем запрос с классом и перекрытие перечня своим значением.
// EN: Test class-list forwarding from index.js to hranilishche.js through a service on a fake ctx and its ctx.provide(pamyat) object. A storage-only suite cannot detect a missing argument at this boundary. From the same side, test explicit-class queries and caller list overrides.
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
let apply;
try { ({ apply } = await import('../src/index.js')); }
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
const katalog = vremennyj(join(tmpdir(), 'podacha-perechnya-'));
let nomer = 0;

// RU: Поднимаем службу с подставным ctx и возвращаем опубликованный объект.
// EN: Start the service with a fake ctx and return its exposed object.
const podnyat = (config = {}) => {
  let vydano = null;
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    provide(imya, obj) { if (imya === 'pamyat') vydano = obj; },
    get() { return undefined },
    on() {},
  };
  apply(ctx, { agent: 'a', putBazy: join(katalog, 'p' + (++nomer) + '.db'), klassyZnaniy: ZNANIYA, ...config });
  if (!vydano) throw new Error('служба не отдала «pamyat» — стенд негоден, судить не о чем');
  return vydano;
};
const zapolnit = (p) => {
  p.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 'session#1' });
  p.zapisat({ klass: 'svodka-kompakcii', soderzhim: 'служебное', istochnik: 'session#1' });
  return p;
};
const klassy = (z) => z.map((r) => r.klass).sort();

proba('стенд годен: служба поднялась, память доступна, обе записи легли', () => {
  const p = podnyat();
  if (!p.dostupna()) throw new Error('память недоступна: ' + p.pochemuNedostupna());
  zapolnit(p);
  if (p.prochitat({ tolkoKlassy: null }).length !== 2) throw new Error('записалось не 2 — пробник негоден');
});

proba('ГЛАВНОЕ: служба САМА подаёт перечень — спрос без класса не отдаёт служебную запись', () => {
  const k = klassy(zapolnit(podnyat()).prochitat({}));
  if (k.includes('svodka-kompakcii')) throw new Error('подача перечня потеряна: ' + k.join(','));
  if (!k.includes('urok')) throw new Error('знание пропало вместе со служебным: ' + k.join(','));
});

proba('перечень берётся ИЗ НАСТРОЙКИ, а не прибит: свой перечень меняет выдачу', () => {
  const k = klassy(zapolnit(podnyat({ klassyZnaniy: ['svodka-kompakcii'] })).prochitat({}));
  if (k.length !== 1 || k[0] !== 'svodka-kompakcii') {
    throw new Error('настройка не доехала до хранилища: ' + k.join(','));
  }
});

proba('Г1: спрос С УКАЗАННЫМ классом подача не трогает (restore берёт сводку по классу)', () => {
  const z = zapolnit(podnyat()).prochitat({ klass: 'svodka-kompakcii' });
  if (z.length !== 1 || z[0].klass !== 'svodka-kompakcii') {
    throw new Error('спрос по классу урезан отбором: ' + JSON.stringify(klassy(z)));
  }
});

proba('Г2: спрашивающий вправе перекрыть отбор своим значением (умолчание, не «нельзя»)', () => {
  const k = klassy(zapolnit(podnyat()).prochitat({ tolkoKlassy: null }));
  if (k.length !== 2) throw new Error('перекрыть умолчание не вышло: ' + k.join(','));
});

proba('пустой перечень в настройке — ведём себя как прежде, а не «отобрать ничего»', () => {
  const k = klassy(zapolnit(podnyat({ klassyZnaniy: [] })).prochitat({}));
  if (k.length !== 2) throw new Error('пустой перечень съел выдачу: ' + k.join(','));
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
