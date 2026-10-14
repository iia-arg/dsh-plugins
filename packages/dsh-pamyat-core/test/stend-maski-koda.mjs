// RU: Проверяем исключение языкового синтаксиса из маски и сохранение отметки ochistka в базе. key=lambda не должен терять слово синтаксиса. Предел: key=sortkeyfn и key=itemgetter(1) продолжают маскироваться, поскольку их форма неотличима от слабого секрета. Все значения синтетические.
// EN: Test the language-syntax masking exemption and persistence of the ochistka mark. key=lambda must retain the syntax word. Limit: key=sortkeyfn and key=itemgetter(1) remain masked because their shape is indistinguishable from a weak secret. All values are synthetic.
import { najti_sekret, zamaskirovat } from '../src/filtr-vhoda.js';
import { DatabaseSync } from 'node:sqlite';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ');
    }
    ok++; console.log('  ok   ' + imya);
  } catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message); }
};

// RU: Проверяем фильтр.
// EN: Test the filter.
proba('А1 живой случай исполнителя: «key=lambda f: f.name» — не секрет, маска текст не меняет', () => {
  const t = 'files.sort(key=lambda f: f.name)';
  const r = najti_sekret(t);
  if (r) throw new Error('ЛОЖНОЕ (' + r.klass + ' @' + r.pozicia + ') на коде');
  const m = zamaskirovat(t);
  if (m.zameneno !== 0 || m.tekst !== t) throw new Error('маска правит код: ' + m.tekst);
});

proba('А2 прочие слова синтаксиса: lambda: · function( со списком параметров · undefined', () => {
  for (const t of ['sorted(a, key=lambda: 0)', 'key=function(a,', 'key=function()', 'key=function(a,b)', 'key=undefined']) {
    const r = najti_sekret(t);
    if (r) throw new Error('ЛОЖНОЕ (' + r.klass + ') на: ' + t);
  }
});

proba('А3 фиктивные секреты тех же форм по-прежнему ловятся как объявленные', () => {
  for (const t of ['key=abcdefghijkl', 'key=weakpasswd', 'password: Xy7Qm2Vt', 'pwd=Hunter22xy',
                   'key=lambdaXy7Q', 'key=lambda1234', 'token: function9Q#x']) {
    const r = najti_sekret(t);
    if (!r || r.klass !== 'obyavlennyj') throw new Error('ПРОПУЩЕН: ' + t + ' → ' + JSON.stringify(r));
  }
});

proba('А4 граница названа: key=sortkeyfn и key=itemgetter(1) маскируются (неотличимы от слабого секрета)', () => {
  for (const t of ['key=sortkeyfn', 'key=itemgetter(1)']) {
    const r = najti_sekret(t);
    if (!r) throw new Error('граница сдвинулась молча: ' + t + ' больше не ловится — переписать пробу осознанно');
  }
});

// RU: После function( требуется список простых имён параметров.
// EN: function( must be followed by a list of simple parameter names.
proba('А6 «function(» с секретом внутри или с телом — снова ловится (ворота аудитора 12:30)', () => {
  for (const t of ['password=function(Zq8xK2mP9vL4)', 'token=function(){return 1}', 'key=function(arg1)']) {
    const r = najti_sekret(t);
    if (!r || r.klass !== 'obyavlennyj') throw new Error('ПРОПУЩЕН: ' + t + ' → ' + JSON.stringify(r));
  }
});

proba('А5 зрячесть: та же форма со словом НЕ синтаксиса («lambdb») ловится — правило видит место', () => {
  const r = najti_sekret('files.sort(key=lambdb f: f.name)');
  if (!r || r.klass !== 'obyavlennyj') throw new Error('правило не видит позицию вовсе — А1 зеленел бы и без правки');
});

// RU: Проверяем отметку настоящего ядра по следу в базе.
// EN: Test the real core’s annotation through its database trace.
let Context, apply, name, Config, mkdtempSync, tmpdir, join;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
  ;({ mkdtempSync } = await import('node:fs'));
  ;({ tmpdir } = await import('node:os'));
  ;({ join } = await import('node:path'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`\nСЛЕПОТА на поведенческой части: ${net ? 'платформа (@deepseek-ai/cordis) не установлена' : String(e?.message ?? e).slice(0, 160)}`);
  console.log(`  До этой точки пройдено проб: ${ok} из ${ok + bed}.`);
  process.exit(bed === 0 ? 2 : 1);
}

const kat = vremennyj(join(tmpdir(), 'stend-maski-koda-'));
const koren = new Context();
koren.provide('logger'); koren.logger = { error: () => {} };
koren.plugin({ name, apply }, new Config({ putBazy: join(kat, 'p.db'), otvechayushchegoNet: true, agent: 'proba' }));
await new Promise((r) => setTimeout(r, 70));

// RU: Читаем след из базы независимо от ответа ядра.
// EN: Read the database trace independently of the core’s response.
const iz_bazy = (id) => {
  const db = new DatabaseSync(join(kat, 'p.db'), { readOnly: true });
  try { return db.prepare('SELECT soderzhim, ochistka FROM zapisi WHERE id = ?').get(id); } finally { db.close(); }
};
const zapisat = (soderzhim) => {
  const id = koren.pamyat.zapisat({ klass: 'urok', soderzhim });
  if (!Number.isInteger(Number(id))) throw new Error('запись не вернула id: ' + id);
  const z = iz_bazy(id);
  if (!z) throw new Error('записи ' + id + ' в базе нет — проба не управляет предметом');
  return z;
};

proba('Б1 маска сработала → ochistka НЕ пуста: раздел maska с числом замен, значения нет', () => {
  const z = zapisat('урок: в конфиге стояло password: Xy7Qm2Vt и это плохо');
  if (!z.soderzhim.includes('[скрыто obyavlennyj')) throw new Error('маска не сработала — проба не про то: ' + z.soderzhim);
  if (z.ochistka === null) throw new Error('🔴 текст правлен маской, а ochistka = NULL (беда syntax-mask)');
  const o = JSON.parse(z.ochistka);
  if (!(o.maska?.zameneno >= 1)) throw new Error('в отметке нет maska.zameneno: ' + z.ochistka);
  if (z.ochistka.includes('Xy7Qm2Vt') || z.soderzhim.includes('Xy7Qm2Vt')) throw new Error('🔴 значение осталось в записи');
});

proba('Б2 код без секрета записан как есть, ochistka = NULL (править было нечего)', () => {
  const t = 'урок: сортировка files.sort(key=lambda f: f.name) по имени';
  const z = zapisat(t);
  if (z.soderzhim !== t) throw new Error('код в записи изменён: ' + z.soderzhim);
  if (z.ochistka !== null) throw new Error('отметка на нетронутом тексте: ' + z.ochistka);
});

proba('Б3 маска + невидимые знаки → в отметке ОБА раздела, один не затирает другой', () => {
  const z = zapisat('урок \u{E0041}\u{E0042}: pwd=Hunter22xy в заметке');
  const o = JSON.parse(z.ochistka ?? 'null');
  if (!(o?.maska?.zameneno >= 1)) throw new Error('раздел maska потерян при чистке невидимого: ' + z.ochistka);
  if (!o?.klassy?.includes('tag')) throw new Error('чистка невидимого не отмечена: ' + z.ochistka);
});

proba('Б4 чистый текст → ochistka = NULL', () => {
  const z = zapisat('урок: обычная статья про замер и числа');
  if (z.ochistka !== null) throw new Error('отметка на чистом тексте: ' + z.ochistka);
});

console.log(`\nИТОГО: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
