// RU: Проверяем ustanovitOtnoshenie по договору отношений памяти через службу ядра с подставным ctx. Читатели statusOtnosheniya/ktoOtmenil используют второе соединение. Каждая проба имеет свою базу, чтобы журнал не зависел от соседних проб. Коды: 0 — успех, 1 — расхождение, 2 — предмет не загрузился.
// EN: Test ustanovitOtnoshenie against the memory-relation contract through the core service with a fake ctx. statusOtnosheniya/ktoOtmenil readers use a second connection. Each probe has its own database so journal counts do not depend on other probes. Codes: 0 success, 1 mismatch, 2 subject failed to load.
import { DatabaseSync } from 'node:sqlite';
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

let apply, otkrytHranilishche;
try {
  ;({ apply } = await import('../src/index.js'));
  ;({ otkrytHranilishche } = await import('../src/hranilishche.js'));
} catch (e) {
  console.log(`СЛЕПОТА: предмет не загрузился — ${String(e?.message ?? e).slice(0, 160)}`);
  process.exit(2);
}

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const v = f();
    if (v !== true) throw new Error(v === undefined ? 'проба ничего не вернула' : String(v));
    proshlo++; console.log('  ok   ' + imya);
  } catch (e) { console.log('  FAIL ' + imya + '\n       ' + String(e?.message ?? e)); }
};
const kodOtkaza = (f) => { try { f(); return null; } catch (e) { return e?.code ?? ('без кода: ' + e?.message); } };

const katalog = vremennyj(join(tmpdir(), 'otnosheniya-'));
let nomerBazy = 0;
const sobrat = () => {
  const put = join(katalog, `b${nomerBazy++}.db`);
  const servisy = {};
  const ctx = { provide(imya, obj) { servisy[imya] = obj; }, on() {}, logger: { error() {} } };
  apply(ctx, { putBazy: put, agent: 'stend' });
  if (!servisy.pamyat) throw new Error('стенд негоден: сервис pamyat не объявлен');
  if (typeof servisy.pamyat.ustanovitOtnoshenie !== 'function') {
    throw new Error('в службе ядра НЕТ ustanovitOtnoshenie — писателя отношения нет');
  }
  const h = otkrytHranilishche(put);
  // RU: Записи создаём через ядро с отметкой журнала; хранилище читаем независимо.
  // EN: Create records through the core with journal marks; inspect storage independently.
  const zap = (klass, t) => {
    const id = servisy.pamyat.zapisat({ klass, soderzhim: t, podtverzhdenie: 'allowed-once' });
    if (servisy.pamyat.svodka().novayaRaznica !== 0) throw new Error('пробная запись и журнал разошлись');
    return id;
  };
  const otmetok = () => Number(new DatabaseSync(put, { readOnly: true })
    .prepare("SELECT count(*) AS n FROM zhurnal WHERE priroda = 'otnoshenie'").get().n);
  return { p: servisy.pamyat, h, zap, otmetok };
};

try {
  proba('запись → читатели видят: B отменяет A, ktoOtmenil(A) = [B], статус B «est»', () => {
    const { p, h, zap, otmetok } = sobrat();
    const a = zap('reshenie', 'старое решение'), b = zap('reshenie', 'новое решение');
    const r = p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: a, kto: 'стенд' });
    if (r.ishod !== 'ustanovleno') return 'исход ' + r.ishod;
    const kto = h.ktoOtmenil(a);
    if (kto.status !== 'otmenena' || kto.kem.join() !== String(b)) return 'ktoOtmenil: ' + JSON.stringify(kto);
    const zB = h.baza.prepare('SELECT * FROM zapisi WHERE id = ?').get(b);
    const st = h.statusOtnosheniya(zB);
    if (st.status !== 'est' || st.vid !== 'otmenyaet' || st.k !== a) return 'statusOtnosheniya: ' + JSON.stringify(st);
    return otmetok() === 1 || 'отметок журнала ' + otmetok() + ', ждали 1';
  });
  proba('повтор того же отношения — без дубля: «uzhe-bylo», отметок журнала по-прежнему 1', () => {
    const { p, zap, otmetok } = sobrat();
    const a = zap('poryadok', 'a'), b = zap('poryadok', 'b');
    p.ustanovitOtnoshenie({ id: b, vid: 'utochnyaet', k: a, kto: 'стенд' });
    const r = p.ustanovitOtnoshenie({ id: b, vid: 'utochnyaet', k: a, kto: 'стенд' });
    return (r.ishod === 'uzhe-bylo' && otmetok() === 1) || `исход ${r.ishod}, отметок ${otmetok()}`;
  });
  proba('ссылка на несуществующую запись — громкий отказ PAMYAT_ZAPIS_NE_NAJDENA (цели нет · новой нет), поле не тронуто', () => {
    const { p, h, zap, otmetok } = sobrat();
    const b = zap('reshenie', 'b');   /* RU: Первая запись имеет id 1; id 0 не существует.
 * EN: The first record has id 1; id 0 does not exist.
 */
    const k1 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: 0, kto: 'стенд' }));
    const k2 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b + 5, vid: 'utochnyaet', k: b, kto: 'стенд' }));
    const pole = h.baza.prepare('SELECT otnoshenie FROM zapisi WHERE id = ?').get(b).otnoshenie;
    return (k1 === 'PAMYAT_ZAPIS_NE_NAJDENA' && k2 === 'PAMYAT_ZAPIS_NE_NAJDENA' && pole === null && otmetok() === 0)
      || `цели нет: ${k1} · новой нет: ${k2} · поле ${pole} · отметок ${otmetok()}`;
  });
  proba('отменить завершённое нельзя: otmenyaet к fakt — PAMYAT_OTMENA_ZAVERSHENNOGO; utochnyaet — можно', () => {
    const { p, zap } = sobrat();
    const a = zap('fakt', 'случилось X'), b = zap('fakt', 'на деле случилось Y');
    const kod = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: a, kto: 'стенд' }));
    if (kod !== 'PAMYAT_OTMENA_ZAVERSHENNOGO') return 'отмена факта: код ' + kod;
    return p.ustanovitOtnoshenie({ id: b, vid: 'utochnyaet', k: a, kto: 'стенд' }).ishod === 'ustanovleno' || 'уточнение факта не прошло';
  });
  proba('vyvod и urok — основание, не событие: otmenyaet к ним принят (решение 23.09)', () => {
    const { p, h, zap } = sobrat();
    const v1 = zap('vyvod', 'X следует из Y'), v2 = zap('vyvod', 'X из Y не следует');
    const u1 = zap('urok', 'делать так'), u2 = zap('urok', 'практика опровергла');
    const r1 = p.ustanovitOtnoshenie({ id: v2, vid: 'otmenyaet', k: v1, kto: 'стенд' });
    const r2 = p.ustanovitOtnoshenie({ id: u2, vid: 'otmenyaet', k: u1, kto: 'стенд' });
    if (r1.ishod !== 'ustanovleno' || r2.ishod !== 'ustanovleno') return `исходы ${r1.ishod} / ${r2.ishod}`;
    const kv = h.ktoOtmenil(v1), ku = h.ktoOtmenil(u1);
    return (kv.status === 'otmenena' && ku.status === 'otmenena') || `читатель: ${kv.status} / ${ku.status}`;
  });
  proba('другое отношение поверх стоящего — PAMYAT_OTNOSHENIE_KONFLIKT, стоящее не переписано', () => {
    const { p, h, zap } = sobrat();
    const a = zap('reshenie', 'a'), b = zap('reshenie', 'b');
    p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: a, kto: 'стенд' });
    const kod = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b, vid: 'utochnyaet', k: a, kto: 'стенд' }));
    const pole = h.baza.prepare('SELECT otnoshenie FROM zapisi WHERE id = ?').get(b).otnoshenie;
    return (kod === 'PAMYAT_OTNOSHENIE_KONFLIKT' && pole === 'otmenyaet') || `код ${kod}, поле ${pole}`;
  });
  proba('порядок: старая к новой и запись к самой себе — PAMYAT_OTNOSHENIE_PORYADOK', () => {
    const { p, zap } = sobrat();
    const a = zap('reshenie', 'a'), b = zap('reshenie', 'b');
    const k1 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: a, vid: 'utochnyaet', k: b, kto: 'стенд' }));
    const k2 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b, vid: 'utochnyaet', k: b, kto: 'стенд' }));
    return (k1 === 'PAMYAT_OTNOSHENIE_PORYADOK' && k2 === 'PAMYAT_OTNOSHENIE_PORYADOK') || `${k1} / ${k2}`;
  });
  proba('неизвестный вид, пустой kto, класс не-знание — каждый свой отказ', () => {
    const { p, zap } = sobrat();
    const a = zap('reshenie', 'a'), b = zap('reshenie', 'b'), s = zap('svodka-kompakcii', 'сводка');
    const k1 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b, vid: 'otmenit', k: a, kto: 'стенд' }));
    const k2 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: a, kto: '  ' }));
    const k3 = kodOtkaza(() => p.ustanovitOtnoshenie({ id: s, vid: 'utochnyaet', k: a, kto: 'стенд' }));
    return (k1 === 'PAMYAT_OTNOSHENIE_VID' && k2 === 'PAMYAT_OTNOSHENIE_BEZ_KTO' && k3 === 'PAMYAT_OTNOSHENIE_KLASS') || `${k1} / ${k2} / ${k3}`;
  });
  proba('след отношения не раздувает «отклонено» в сводке журнала', () => {
    const { p, zap } = sobrat();
    const a = zap('reshenie', 'a'), b = zap('reshenie', 'b');
    const do_ = p.svodka().otkloneno;
    p.ustanovitOtnoshenie({ id: b, vid: 'otmenyaet', k: a, kto: 'стенд' });
    const posle = p.svodka().otkloneno;
    return do_ === posle || `отклонено ${do_} → ${posle}`;
  });
} finally {
  rmSync(katalog, { recursive: true, force: true });
}
console.log(`ИТОГ: прошло ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
