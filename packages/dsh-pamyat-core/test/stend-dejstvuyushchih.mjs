// RU: Проверяем blizhajshieDejstvuyushchie настоящего ядра на временной базе: только отменяемые классы, без отменённых, по близости, не более трёх. Агент берётся из настройки ядра, вопрос его не меняет. Мера общих слов не ловит смысловой перефраз.
// EN: Test the real core’s blizhajshieDejstvuyushchie against a temporary database: revocable classes only, excluding revoked records, ranked by proximity, at most three. The core configuration supplies the agent; the query cannot override it. Shared-word proximity does not detect semantic paraphrases.
let Context, apply, name, Config;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 120));
  process.exit(2);
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, vsego = 0;
const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло значение'); ok++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
const kat = vremennyj(join(tmpdir(), 'stend-dejstvuyushchih-'));
const koren = new Context();
koren.provide('logger'); koren.logger = { error: () => {}, warn: () => {}, info: () => {} };
koren.plugin({ name, apply }, new Config({ putBazy: join(kat, 'p.db'), otvechayushchegoNet: true, agent: 'proba-uzel' }));
await new Promise((r) => setTimeout(r, 60));
const p = koren.pamyat;
const id = (klass, t) => { const v = p.zapisat({ klass, soderzhim: t, istochnik: 'proba#1-2' }); return Number(typeof v === 'object' ? v.id : v); };
const staroe = id('reshenie', 'предел сводки восемь тысяч знаков для компакта агента');
const drugoe = id('poryadok', 'порядок подъёма службы через ворота подъёма узла');
const otmenennoe = id('reshenie', 'предел сводки двенадцать тысяч знаков для компакта агента');
const fakt = id('fakt', 'предел сводки восемь тысяч знаков был замерен для компакта агента');
const otmenyayushchee = id('reshenie', 'снят прежний порядок подъёма службы');
p.ustanovitOtnoshenie({ id: otmenyayushchee, vid: 'otmenyaet', k: otmenennoe, kto: 'стенд' });
const r = p.blizhajshieDejstvuyushchie({ soderzhim: 'предел сводки для компакта агента снят' });
const ids = r.spisok.map((x) => x.id);

proba('1 ОТМЕНЁННАЯ запись исключена, fakt (не отменяемый класс) исключён, ближайшая — первой', () => {
  if (r.ishod !== 'sravneno') throw new Error('исход ' + r.ishod);
  if (ids.includes(otmenennoe)) throw new Error('отменённая попала в кандидаты');
  if (ids.includes(fakt)) throw new Error('fakt попал в кандидаты');
  if (ids[0] !== staroe) throw new Error('первым не ближайшее: ' + ids.join(','));
});
proba('2 У кандидата есть класс, время и текст; не больше трёх; по убыванию близости', () => {
  const x = r.spisok[0];
  if (x.klass !== 'reshenie' || !(x.sozdano > 0) || !x.soderzhim.includes('восемь тысяч')) throw new Error(JSON.stringify(x).slice(0, 120));
  if (r.spisok.length > 3) throw new Error('кандидатов ' + r.spisok.length);
  for (let i = 1; i < r.spisok.length; i++) if (r.spisok[i].blizost > r.spisok[i - 1].blizost) throw new Error('порядок нарушен');
});
proba('3 АГЕНТ из настройки ядра: вопрос с чужим agent видит те же записи, а не пустоту чужого', () => {
  const r2 = p.blizhajshieDejstvuyushchie({ agent: 'chuzhoj', soderzhim: 'предел сводки для компакта агента снят' });
  if (JSON.stringify(r2.spisok.map((x) => x.id)) !== JSON.stringify(ids)) throw new Error('агент переопределён вопросом');
});
proba('4 Классы только неотменяемые → «не с чем», пусто', () => {
  const r3 = p.blizhajshieDejstvuyushchie({ klassy: ['fakt', 'nablyudenie'], soderzhim: 'предел сводки' });
  if (r3.ishod !== 'ne-s-chem' || r3.spisok.length) throw new Error(JSON.stringify(r3));
});
rmSync(kat, { recursive: true, force: true });
console.log(`стенд действующих: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
