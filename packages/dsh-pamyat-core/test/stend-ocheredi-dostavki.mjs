// RU: Проверяем очередь недоставленного и ночной повтор без дублей. Неподтверждённый вызов мог успеть записать знание: причина в очереди выбирает повтор записью, проверку чтением или ручной разбор. Отсутствие платформы — слепота, а не код дефекта 1.
// EN: Test undelivered queue processing and nightly retries without duplicates. An unconfirmed call may already have stored the knowledge: its queue cause selects a write retry, read verification, or manual investigation. Missing platform means the subject is unobservable, not defect code 1.
let Context, apply, name, Config;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import('../src/index.js'));
} catch (e) {
  const net = e?.code === 'ERR_MODULE_NOT_FOUND';
  console.log(`СЛЕПОТА: предмет не загрузился — ${net ? 'платформа (@deepseek-ai/cordis) не установлена' : String(e?.message ?? e).slice(0, 160)}`);
  if (net) console.log('  Выполните `npm install` в каталоге пакета и повторите.');
  process.exit(2);
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// RU: Каждый mkdtemp создаём через vremennyj(): уборка выполняется при обычном выходе, исключении, process.exit и SIGTERM/SIGINT, включая timeout 120. SIGKILL не перехватывается; временные файлы дочернего процесса убирает сам дочерний процесс.
// EN: Create every mkdtemp through vremennyj(): cleanup runs on normal exit, exceptions, process.exit, and SIGTERM/SIGINT, including timeout 120. SIGKILL cannot be intercepted; a child process must clean up its own temporary files.
import { mkdtempSync as mkdtempSync_, rmSync as rmSync_ } from 'node:fs'
const VREMENNYE = []
const vremennyj = (...a) => { const k = mkdtempSync_(...a); VREMENNYE.push(k); return k }
process.on('exit', () => { for (const k of VREMENNYE) rmSync_(k, { recursive: true, force: true }) })
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130))

let ok = 0, bed = 0;
// RU: Прогонщик синхронный и не ждёт промис: async-тело могло бы зачесть успех до исключения внутри. Возвращённый промис означает отказ пробы.
// EN: The runner is synchronous and does not await promises: an async body could record success before an inner exception. A returned promise fails the probe.
const proba = (imya, f) => { try {
    const vernulos = f();
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный — ждать не умеет. ' +
                      'Вынеси ожидание наружу либо сделай прогонщик ожидающим');
    }
    // RU: Тело пробы должно бросить ошибку или вернуть undefined. Любое другое значение, включая строку, false, 0, null и объект, означает отказ: игнорирование возврата даёт ложный успех.
    // EN: The probe body must throw an error or return undefined. Any other value, including a string, false, 0, null, or an object, means failure: ignoring returns produces false success.
    if (vernulos !== undefined && vernulos !== true) {
      throw new Error('тело пробы ВЕРНУЛО «' + String(vernulos).slice(0, 60) +
                      '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы. ' +
                      'Бросай ошибку либо ничего не возвращай');
    }
    ok++; console.log('  ok   ' + imya) }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) } };

const kat = vremennyj(join(tmpdir(), 'stend-ocheredi-'));
let putBazy = '';

async function podnyat({ dolgo = null, nastrojka = {} } = {}) {
  const koren = new Context();
  koren.provide('logger'); koren.logger = { error: () => {} };
  if (dolgo) { koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = dolgo; }
  putBazy = join(kat, 'p-' + Math.random().toString(36).slice(2) + '.db');
  const cfg = new Config({ putBazy, otvechayushchegoNet: true, agent: 'proba-uzel', ...nastrojka });
  koren.plugin({ name, apply }, cfg);
  await new Promise((r) => setTimeout(r, 40));
  return koren;
}

// RU: Читаем очередь прямо из базы независимо от службы записи.
// EN: Read the queue directly from the database independently of the write service.
const ocheredIzBazy = () => {
  const db = new DatabaseSync(putBazy, { readOnly: true });
  const r = db.prepare('SELECT * FROM ochered_dolgovremennogo ORDER BY zapis_id').all();
  db.close();
  return r;
};

// RU: Подставной слой считает вызовы, чтобы обнаружить повторную запись.
// EN: The fake layer counts calls to detect duplicate writes.
function podstavnojSloj({ sohranitOtvet, proveritOtvet = null, dostupen = true }) {
  const schet = { sohranit: 0, proverit: 0 };
  return {
    schet,
    dostupna: () => dostupen,
    pochemuNedostupna: () => (dostupen ? null : 'служба OMEGA не отвечает'),
    async sohranit() { schet.sohranit += 1; return typeof sohranitOtvet === 'function' ? sohranitOtvet(schet) : sohranitOtvet; },
    async proverit() { schet.proverit += 1; return typeof proveritOtvet === 'function' ? proveritOtvet(schet) : proveritOtvet; },
  };
}

// RU: Исправный контроль: подтверждённая доставка оставляет очередь пустой.
// EN: Healthy control: confirmed delivery leaves the queue empty.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-aaaa1111bbbb' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[0] доставленное в очередь НЕ попадает', () => {
    const o = ocheredIzBazy();
    if (o.length !== 0) throw new Error('в очереди ' + o.length + ', ждали 0');
  });
  // RU: Тело намеренно синхронное: t не ждёт промис, поэтому async мог бы зачесть успех до исключения внутри.
  // EN: The body is deliberately synchronous: t does not await a promise, so async could record success before an inner exception.
  proba('[0] отчёт о пустой очереди — ЧИСЛО, а не молчание', () => {
    if (typeof k.pamyat.dostavitOtlozhennoe !== 'function') throw new Error('метода нет');
  });
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  proba('[0] прогон по пустой очереди: vsego 0, слой доступен', () => {
    if (otchet.vsego !== 0) throw new Error('vsego ' + otchet.vsego);
    if (otchet.sloyDostupen !== true) throw new Error('слой объявлен недоступным');
  });
}

// RU: Нет связи: ne-otpravleno и ноль попыток.
// EN: No connection: ne-otpravleno and zero attempts.
{
  const sloj = podstavnojSloj({ sohranitOtvet: null, dostupen: false });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание А', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[A] недоступный слой ставит в очередь с природой ne-otpravleno, попыток 0', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length);
    if (o[0].priroda !== 'ne-otpravleno') throw new Error('природа ' + o[0].priroda);
    if (Number(o[0].popytok) !== 0) throw new Error('попыток ' + o[0].popytok);
  });
  proba('[A] запись НЕ звала слой: sohranit не вызывался', () => {
    if (sloj.schet.sohranit !== 0) throw new Error('звали ' + sloj.schet.sohranit + ' раз');
  });

  // RU: Недоступный слой не расходует попытки.
  // EN: An unavailable layer does not consume attempts.
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  proba('[B] проход при недоступном слое: попыток не прибавилось, причина названа', () => {
    const o = ocheredIzBazy();
    if (Number(o[0].popytok) !== 0) throw new Error('попыток стало ' + o[0].popytok);
    if (otchet.sloyDostupen !== false) throw new Error('слой объявлен доступным');
    if (!otchet.pochemuNet) throw new Error('причина недоступности не названа');
    if (otchet.ostalos !== 1) throw new Error('ostalos ' + otchet.ostalos);
  });
}

// RU: При доступном слое ne-otpravleno повторяется записью.
// EN: With an available layer, retry ne-otpravleno by writing.
{
  const sloj = podstavnojSloj({ sohranitOtvet: null, dostupen: false });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание C', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  // RU: Делаем слой доступным.
  // EN: Make the layer available.
  const zhivoj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-cccc2222dddd' } });
  k.pamyatDolgovremennaya = zhivoj;
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  proba('[C] ne-otpravleno → ЗАПИСАНО и снято с очереди', () => {
    if (zhivoj.schet.sohranit !== 1) throw new Error('sohranit звали ' + zhivoj.schet.sohranit + ' раз, ждали 1');
    if (otchet.dostavleno !== 1) throw new Error('dostavleno ' + otchet.dostavleno);
    const o = ocheredIzBazy();
    if (o.length !== 0) throw new Error('в очереди осталось ' + o.length);
  });
}

// RU: moglo-dojti-id-est при подтверждённом наличии снимается с очереди без повторной записи.
// EN: When existence is confirmed, remove moglo-dojti-id-est from the queue without rewriting.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-id-est', id: 'mem-eeee3333ffff' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание G', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  proba('[G] природа moglo-dojti-id-est попала в очередь вместе с опознавателем', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length);
    if (o[0].priroda !== 'moglo-dojti-id-est') throw new Error('природа ' + o[0].priroda);
    if (o[0].mem_id !== 'mem-eeee3333ffff') throw new Error('опознаватель ' + o[0].mem_id);
  });
  const zhivoj = podstavnojSloj({
    sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-xxxx' },
    proveritOtvet: { sostoyanie: 'est', pochemu: 'нашлась' },
  });
  k.pamyatDolgovremennaya = zhivoj;
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  proba('[G] 🔴 ДУБЛЯ НЕТ: спросили чтением, записи НЕ делали', () => {
    if (zhivoj.schet.proverit !== 1) throw new Error('proverit звали ' + zhivoj.schet.proverit + ' раз');
    if (zhivoj.schet.sohranit !== 0) throw new Error('ВТОРАЯ ЗАПИСЬ: sohranit звали ' + zhivoj.schet.sohranit + ' раз');
    if (otchet.podtverzhdeno !== 1) throw new Error('podtverzhdeno ' + otchet.podtverzhdeno);
    if (ocheredIzBazy().length !== 0) throw new Error('с очереди не снято');
  });
}

// RU: Непроведённая проверка не расходует попытку и сохраняет запись в очереди.
// EN: A skipped check does not consume an attempt and leaves the item queued.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-id-est', id: 'mem-1111aaaa2222' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание H', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  const zhivoj = podstavnojSloj({
    sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-yyyy' },
    proveritOtvet: { sostoyanie: 'ne-proveryali', pochemu: 'хранилище молчит' },
  });
  k.pamyatDolgovremennaya = zhivoj;
  await k.pamyat.dostavitOtlozhennoe();
  proba('[H] 🔴 «не проверяли» НЕ съедает предел и НЕ пишет вслепую', () => {
    if (zhivoj.schet.sohranit !== 0) throw new Error('писали вслепую: sohranit ' + zhivoj.schet.sohranit);
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('запись пропала из очереди');
    if (Number(o[0].popytok) !== 0) throw new Error('попытка засчитана: ' + o[0].popytok);
  });
}

// RU: moglo-dojti-bez-id не повторяется автоматически и считается отдельно.
// EN: moglo-dojti-bez-id is not retried automatically and is counted separately.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-bez-id', id: null } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание F', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  const zhivoj = podstavnojSloj({
    sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-zzzz' },
    proveritOtvet: { sostoyanie: 'est', pochemu: 'нашлась' },
  });
  k.pamyatDolgovremennaya = zhivoj;
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  proba('[F] 🔴 без опознавателя НЕ трогаем: ни записи, ни проверки', () => {
    if (zhivoj.schet.sohranit !== 0) throw new Error('была запись: ' + zhivoj.schet.sohranit);
    if (zhivoj.schet.proverit !== 0) throw new Error('была проверка: ' + zhivoj.schet.proverit);
  });
  proba('[F] такие записи СЧИТАЮТСЯ ОТДЕЛЬНО — иначе «ничего не делаем» читается как недоделка', () => {
    if (otchet.zhdutRuki !== 1) throw new Error('zhdutRuki ' + otchet.zhdutRuki);
  });
}

// RU: На пределе попыток запись остаётся, тревога звучит один раз.
// EN: At the attempt limit, retain the item and alert once.
{
  const sloj = podstavnojSloj({ sohranitOtvet: null, dostupen: false });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание D', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  const upryamyj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'ne-najdeno', pochemu: 'не легло' } });
  k.pamyatDolgovremennaya = upryamyj;
  let ischerpanij = 0;
  for (let i = 0; i < 4; i++) {
    const o = await k.pamyat.dostavitOtlozhennoe({ predelPopytok: 2 });
    ischerpanij += o.novyhIscherpanij;
  }
  proba('[D] 🔴 исчерпание объявляется ОДИН раз, а не на каждом проходе', () => {
    if (ischerpanij !== 1) throw new Error('новых исчерпаний ' + ischerpanij + ', ждали 1');
  });
  proba('[D] исчерпанная запись ОСТАЁТСЯ в очереди — молча терять знание нельзя', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('записей ' + o.length);
    if (Number(o[0].ischerpano) !== 1) throw new Error('флаг исчерпания не выставлен');
  });
  proba('[D] после исчерпания повторов больше НЕТ', () => {
    const bylo = upryamyj.schet.sohranit;
    if (bylo !== 2) throw new Error('записей было ' + bylo + ', ждали ровно 2 (предел)');
  });
}

// RU: Слой без proverit должен дать диагностику вместо падения.
// EN: A layer without proverit must report diagnostics instead of crashing.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-id-est', id: 'mem-3333cccc4444' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание I', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  // RU: Версии ядра и слоя независимы. Отсутствующий proverit требует объяснения и лечения вместо TypeError механизма повтора.
  // EN: Core and layer versions are independent. A missing proverit requires an explanation and remedy rather than a TypeError from the retry mechanism.
  const staryj = {
    dostupna: () => true, pochemuNedostupna: () => null,
    sohranit: async () => { throw new Error('не должны были писать вслепую'); },
    // RU: Имитируем старый слой без proverit.
    // EN: Simulate an older layer without proverit.
  };
  k.pamyatDolgovremennaya = staryj;
  let brosil = null, otchet = null;
  try { otchet = await k.pamyat.dostavitOtlozhennoe(); } catch (e) { brosil = e; }
  proba('[I] 🔴 слой без proverit → НЕ падаем', () => {
    if (brosil) throw new Error('бросило: ' + brosil.message +
      (/not a function/.test(brosil.message) ? ' — ветки «сосед старше» нет' : ''));
  });
  proba('[I] запись осталась в очереди и вслепую НЕ переписана', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length);
    if (otchet?.ostalos !== 1) throw new Error('ostalos ' + otchet?.ostalos);
  });
}

// RU: Пустая очередь должна называться состоянием, а не оставаться тишиной.
// EN: An empty queue must be reported as a state rather than silence.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-0000' } });
  const k = await podnyat({ dolgo: sloj });
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  proba('[E] пустая очередь отвечает числами, а не молчанием', () => {
    if (otchet.vsego !== 0) throw new Error('vsego ' + otchet.vsego);
    if (otchet.zhdutRuki !== 0) throw new Error('zhdutRuki ' + otchet.zhdutRuki);
    if (typeof otchet.ostalos !== 'number') throw new Error('ostalos не число');
  });
  proba('[E] очередь видна снаружи отдельным вызовом', () => {
    if (!Array.isArray(k.pamyat.ocheredDostavki())) throw new Error('ocheredDostavki не отдаёт список');
  });
}

// RU: A-N-1948 №3 (№1): исключение слоя на повторе не обрывает проход. Повторная запись бросила — знание могло дойти:
//     строка → moglo-dojti-bez-id (как на первичном пути), остальные строки обрабатываются. Бросила проверка чтением —
//     записи не было: строка остаётся, попытка не расходуется.
// EN: A-N-1948 №3 (№1): a layer exception during a retry does not abort the pass.
{
  const sloj = podstavnojSloj({ sohranitOtvet: null, dostupen: false });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание I1', istochnik: 's#1-2' });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание I2', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  const padayushchij = podstavnojSloj({ sohranitOtvet: (s) => {
    if (s.sohranit === 1) throw new Error('обрыв сети (проба)');
    return { sostoyanie: 'dostavleno', id: 'mem-1111aaaa2222' };
  } });
  k.pamyatDolgovremennaya = padayushchij;
  let otchet = null, otkaz = null;
  try { otchet = await k.pamyat.dostavitOtlozhennoe(); } catch (e) { otkaz = e; }
  proba('[K] исключение sohranit на повторе: проход НЕ отвергнут', () => {
    if (otkaz) throw new Error('проход отвергнут: ' + otkaz.message);
  });
  proba('[K] вторая строка очереди обработана после исключения первой', () => {
    if (padayushchij.schet.sohranit !== 2) throw new Error('sohranit звали ' + padayushchij.schet.sohranit + ' раз, ждали 2');
    if (otchet?.dostavleno !== 1) throw new Error('dostavleno ' + otchet?.dostavleno);
  });
  proba('[K] строка с исключением записи → moglo-dojti-bez-id, ждёт руки', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length + ', ждали 1');
    if (o[0].priroda !== 'moglo-dojti-bez-id') throw new Error('природа ' + o[0].priroda);
    if (otchet?.zhdutRuki !== 1) throw new Error('zhdutRuki ' + otchet?.zhdutRuki);
  });
}
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-id-est', id: 'mem-3333cccc4444' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание J', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  const zhivoj = podstavnojSloj({
    sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-dubl' },
    proveritOtvet: () => { throw new Error('обрыв сети при чтении (проба)'); },
  });
  k.pamyatDolgovremennaya = zhivoj;
  let otchet = null, otkaz = null;
  try { otchet = await k.pamyat.dostavitOtlozhennoe(); } catch (e) { otkaz = e; }
  proba('[L] исключение proverit: проход НЕ отвергнут, повторной записи нет', () => {
    if (otkaz) throw new Error('проход отвергнут: ' + otkaz.message);
    if (zhivoj.schet.sohranit !== 0) throw new Error('sohranit звали ' + zhivoj.schet.sohranit + ' раз — дубль');
  });
  proba('[L] строка осталась прежней природы, попытка не израсходована', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length);
    if (o[0].priroda !== 'moglo-dojti-id-est') throw new Error('природа ' + o[0].priroda);
    if (Number(o[0].popytok) !== 0) throw new Error('попыток ' + o[0].popytok);
    if (otchet?.ostalos !== 1) throw new Error('ostalos ' + otchet?.ostalos);
  });
}
// RU: A-N-1948 №3 (№1, условие Вениамина): исключение поиска по телу (poTelu) на строке moglo-dojti-bez-id — то же, что
//     неудачный поиск: проход не отвергнут, строка не тронута, следующая строка разобрана. Тела длиннее порога (80 знаков).
// EN: A-N-1948 №3 (№1, Veniamin's condition): a poTelu exception equals a failed body search; the pass goes on.
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-bez-id', id: null, pochemu: 'обрыв (проба)' } });
  const k = await podnyat({ dolgo: sloj });
  const telo = (n) => 'знание M' + n + ': тело нарочно длиннее порога сверки по телу, чтобы поиск по телу был вызван на повторе';
  k.pamyat.zapisat({ klass: 'urok', soderzhim: telo(1), istochnik: 's#1-2' });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: telo(2), istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  const do_ = ocheredIzBazy();
  const iskatel = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-dubl' } });
  iskatel.schet.poTelu = 0;
  iskatel.poTelu = async () => {
    iskatel.schet.poTelu += 1;
    if (iskatel.schet.poTelu === 1) throw new Error('обрыв сети при поиске по телу (проба)');
    return { ids: ['mem-5555eeee6666'] };
  };
  k.pamyatDolgovremennaya = iskatel;
  let otchet = null, otkaz = null;
  try { otchet = await k.pamyat.dostavitOtlozhennoe(); } catch (e) { otkaz = e; }
  proba('[M] набор: в очереди 2 строки moglo-dojti-bez-id', () => {
    if (do_.length !== 2 || do_.some((z) => z.priroda !== 'moglo-dojti-bez-id')) throw new Error(JSON.stringify(do_.map((z) => z.priroda)));
  });
  proba('[M] исключение poTelu: проход НЕ отвергнут, повторной записи нет', () => {
    if (otkaz) throw new Error('проход отвергнут: ' + otkaz.message);
    if (iskatel.schet.sohranit !== 0) throw new Error('sohranit звали ' + iskatel.schet.sohranit + ' раз — дубль');
  });
  proba('[M] строка с исключением поиска не тронута, вторая снята по телу', () => {
    if (iskatel.schet.poTelu !== 2) throw new Error('poTelu звали ' + iskatel.schet.poTelu + ' раз, ждали 2');
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length + ', ждали 1');
    const bylo = do_.find((z) => z.zapis_id === o[0].zapis_id);
    if (!bylo || JSON.stringify(bylo) !== JSON.stringify(o[0])) throw new Error('строка изменилась: ' + JSON.stringify(o[0]));
    if (otchet?.podtverzhdeno !== 1) throw new Error('podtverzhdeno ' + otchet?.podtverzhdeno);
    if (otchet?.poTeluNeVyshlo !== 1) throw new Error('poTeluNeVyshlo ' + otchet?.poTeluNeVyshlo);
  });
}

rmSync(kat, { recursive: true, force: true });
console.log('ИТОГО: сошлось ' + ok + ', расхождений ' + bed);
if (bed) process.exit(1);
process.exit(0);
