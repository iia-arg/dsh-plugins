// Стенд очереди недоставленного и ночного повтора (Э3.2).
//
// 🔴 ГЛАВНОЕ ЗДЕСЬ — ЧТО ПОВТОР НЕ СОЗДАЁТ ДУБЛЬ ЗНАНИЯ. «Не удалось проверить» значит
// «МОГЛО ДОЙТИ»: связь могла оборваться ПОСЛЕ того, как запись легла. Слепой повтор в этом
// случае заводит второй экземпляр — и он хуже недоставки: недоставку видно по очереди и по
// числу в отчёте, а дубль растворяется в поиске и выглядит знанием.
// Поэтому природа отказа хранится в очереди и решает, что делать: повторять записью,
// спрашивать чтением или ждать руки.
import { Context } from '@deepseek-ai/cordis';
import { apply, name, Config } from '../src/index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let ok = 0, bed = 0;
const t = (imya, f) => { try { f(); ok++; console.log('  ok   ' + imya) }
  catch (e) { bed++; console.log('  FAIL ' + imya + ' — ' + e.message) } };

const kat = mkdtempSync(join(tmpdir(), 'stend-ocheredi-'));
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

// Очередь читаем ПРЯМО ИЗ БАЗЫ, а не через ту же службу, которой писали: тем же путём туда
// и обратно мы перенесли бы слепое пятно из работы в проверку.
const ocheredIzBazy = () => {
  const db = new DatabaseSync(putBazy, { readOnly: true });
  const r = db.prepare('SELECT * FROM ochered_dolgovremennogo ORDER BY zapis_id').all();
  db.close();
  return r;
};

/** Подставной слой, считающий вызовы: он и есть свидетель дубля. */
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

// ─── [0] КОНТРОЛЬ НА ИСПРАВНОМ: доставилось — очередь пуста ───
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-aaaa1111bbbb' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[0] доставленное в очередь НЕ попадает', () => {
    const o = ocheredIzBazy();
    if (o.length !== 0) throw new Error('в очереди ' + o.length + ', ждали 0');
  });
  t('[0] отчёт о пустой очереди — ЧИСЛО, а не молчание', async () => {
    if (typeof k.pamyat.dostavitOtlozhennoe !== 'function') throw new Error('метода нет');
  });
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  t('[0] прогон по пустой очереди: vsego 0, слой доступен', () => {
    if (otchet.vsego !== 0) throw new Error('vsego ' + otchet.vsego);
    if (otchet.sloyDostupen !== true) throw new Error('слой объявлен недоступным');
  });
}

// ─── [A] связи нет → природа ne-otpravleno, попыток 0 ───
{
  const sloj = podstavnojSloj({ sohranitOtvet: null, dostupen: false });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание А', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[A] недоступный слой ставит в очередь с природой ne-otpravleno, попыток 0', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length);
    if (o[0].priroda !== 'ne-otpravleno') throw new Error('природа ' + o[0].priroda);
    if (Number(o[0].popytok) !== 0) throw new Error('попыток ' + o[0].popytok);
  });
  t('[A] запись НЕ звала слой: sohranit не вызывался', () => {
    if (sloj.schet.sohranit !== 0) throw new Error('звали ' + sloj.schet.sohranit + ' раз');
  });

  // ─── [B] проход при недоступном слое: попытки НЕ тратим ───
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  t('[B] проход при недоступном слое: попыток не прибавилось, причина названа', () => {
    const o = ocheredIzBazy();
    if (Number(o[0].popytok) !== 0) throw new Error('попыток стало ' + o[0].popytok);
    if (otchet.sloyDostupen !== false) throw new Error('слой объявлен доступным');
    if (!otchet.pochemuNet) throw new Error('причина недоступности не названа');
    if (otchet.ostalos !== 1) throw new Error('ostalos ' + otchet.ostalos);
  });
}

// ─── [C] проход при доступном слое: ne-otpravleno повторяется ЗАПИСЬЮ ───
{
  const sloj = podstavnojSloj({ sohranitOtvet: null, dostupen: false });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание C', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  // слой «поднялся»
  const zhivoj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-cccc2222dddd' } });
  k.pamyatDolgovremennaya = zhivoj;
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  t('[C] ne-otpravleno → ЗАПИСАНО и снято с очереди', () => {
    if (zhivoj.schet.sohranit !== 1) throw new Error('sohranit звали ' + zhivoj.schet.sohranit + ' раз, ждали 1');
    if (otchet.dostavleno !== 1) throw new Error('dostavleno ' + otchet.dostavleno);
    const o = ocheredIzBazy();
    if (o.length !== 0) throw new Error('в очереди осталось ' + o.length);
  });
}

// ─── [G] moglo-dojti-id-est при «есть» → ТОЛЬКО снятие, записи НЕТ ───
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-id-est', id: 'mem-eeee3333ffff' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание G', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  t('[G] природа moglo-dojti-id-est попала в очередь вместе с опознавателем', () => {
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
  t('[G] 🔴 ДУБЛЯ НЕТ: спросили чтением, записи НЕ делали', () => {
    if (zhivoj.schet.proverit !== 1) throw new Error('proverit звали ' + zhivoj.schet.proverit + ' раз');
    if (zhivoj.schet.sohranit !== 0) throw new Error('ВТОРАЯ ЗАПИСЬ: sohranit звали ' + zhivoj.schet.sohranit + ' раз');
    if (otchet.podtverzhdeno !== 1) throw new Error('podtverzhdeno ' + otchet.podtverzhdeno);
    if (ocheredIzBazy().length !== 0) throw new Error('с очереди не снято');
  });
}

// ─── [H] «не проверяли» → попытка НЕ засчитана, запись осталась ───
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
  t('[H] 🔴 «не проверяли» НЕ съедает предел и НЕ пишет вслепую', () => {
    if (zhivoj.schet.sohranit !== 0) throw new Error('писали вслепую: sohranit ' + zhivoj.schet.sohranit);
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('запись пропала из очереди');
    if (Number(o[0].popytok) !== 0) throw new Error('попытка засчитана: ' + o[0].popytok);
  });
}

// ─── [F] moglo-dojti-bez-id повтором НЕ берётся и считается отдельно ───
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
  t('[F] 🔴 без опознавателя НЕ трогаем: ни записи, ни проверки', () => {
    if (zhivoj.schet.sohranit !== 0) throw new Error('была запись: ' + zhivoj.schet.sohranit);
    if (zhivoj.schet.proverit !== 0) throw new Error('была проверка: ' + zhivoj.schet.proverit);
  });
  t('[F] такие записи СЧИТАЮТСЯ ОТДЕЛЬНО — иначе «ничего не делаем» читается как недоделка', () => {
    if (otchet.zhdutRuki !== 1) throw new Error('zhdutRuki ' + otchet.zhdutRuki);
  });
}

// ─── [D] предел попыток: запись ОСТАЁТСЯ, крик ОДИН раз ───
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
  t('[D] 🔴 исчерпание объявляется ОДИН раз, а не на каждом проходе', () => {
    if (ischerpanij !== 1) throw new Error('новых исчерпаний ' + ischerpanij + ', ждали 1');
  });
  t('[D] исчерпанная запись ОСТАЁТСЯ в очереди — молча терять знание нельзя', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('записей ' + o.length);
    if (Number(o[0].ischerpano) !== 1) throw new Error('флаг исчерпания не выставлен');
  });
  t('[D] после исчерпания повторов больше НЕТ', () => {
    const bylo = upryamyj.schet.sohranit;
    if (bylo !== 2) throw new Error('записей было ' + bylo + ', ждали ровно 2 (предел)');
  });
}

// ─── [I] СОСЕД СТАРШЕ НАС: слой без proverit → сказать, а не упасть ───
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'moglo-dojti-id-est', id: 'mem-3333cccc4444' } });
  const k = await podnyat({ dolgo: sloj });
  k.pamyat.zapisat({ klass: 'urok', soderzhim: 'знание I', istochnik: 's#1-2' });
  await new Promise((r) => setTimeout(r, 40));
  // 🔴 Версии пакетов независимы: ядро новое, слой прежний — законное состояние узла,
  // а не поломка. Без ветки вызов бросил бы TypeError, и механизм против тихой потери
  // сам упал бы вместо того, чтобы назвать причину и лечение.
  const staryj = {
    dostupna: () => true, pochemuNedostupna: () => null,
    sohranit: async () => { throw new Error('не должны были писать вслепую'); },
    // proverit НЕТ ВОВСЕ — так выглядит dsh-pamyat-omega до alpha.9
  };
  k.pamyatDolgovremennaya = staryj;
  let brosil = null, otchet = null;
  try { otchet = await k.pamyat.dostavitOtlozhennoe(); } catch (e) { brosil = e; }
  t('[I] 🔴 слой без proverit → НЕ падаем', () => {
    if (brosil) throw new Error('бросило: ' + brosil.message +
      (/not a function/.test(brosil.message) ? ' — ветки «сосед старше» нет' : ''));
  });
  t('[I] запись осталась в очереди и вслепую НЕ переписана', () => {
    const o = ocheredIzBazy();
    if (o.length !== 1) throw new Error('в очереди ' + o.length);
    if (otchet?.ostalos !== 1) throw new Error('ostalos ' + otchet?.ostalos);
  });
}

// ─── [E] очередь пуста → это СОСТОЯНИЕ, а не тишина ───
{
  const sloj = podstavnojSloj({ sohranitOtvet: { sostoyanie: 'dostavleno', id: 'mem-0000' } });
  const k = await podnyat({ dolgo: sloj });
  const otchet = await k.pamyat.dostavitOtlozhennoe();
  t('[E] пустая очередь отвечает числами, а не молчанием', () => {
    if (otchet.vsego !== 0) throw new Error('vsego ' + otchet.vsego);
    if (otchet.zhdutRuki !== 0) throw new Error('zhdutRuki ' + otchet.zhdutRuki);
    if (typeof otchet.ostalos !== 'number') throw new Error('ostalos не число');
  });
  t('[E] очередь видна снаружи отдельным вызовом', () => {
    if (!Array.isArray(k.pamyat.ocheredDostavki())) throw new Error('ocheredDostavki не отдаёт список');
  });
}

rmSync(kat, { recursive: true, force: true });
console.log('ИТОГО: сошлось ' + ok + ', расхождений ' + bed);
if (bed) process.exit(1);
process.exit(0);
