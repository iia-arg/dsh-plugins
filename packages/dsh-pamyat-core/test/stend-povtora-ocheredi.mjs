// RU: A-N-1718 (Искра, 07.10.2026): стенд ЗОВУЩЕГО отложенной доставки. Очередь, набранная живым путём записи, должна
//     убывать сама после следующей подтверждённой доставки — без ручного вызова — и не бить записью в уже дошедшее.
//     Подставная OMEGA повторяет склейку настоящей (omega/sqlite_store/_store.py:225: точное совпадение content_hash
//     в пределах корня возвращает прежний id, новой строки нет) и считает строки и записи по уже лежащему.
//     Очередь стенда — формы, замеренные 07.10 на sadik: ne-najdeno, чьё знание лежит под тем же id (23 из 35 боевых);
//     ne-najdeno, чей id указывает на чужую запись, а точное знание лежит под другим (2 из 35); moglo-dojti-bez-id (10 из 35);
//     плюс ne-otpravleno и действительно недошедшее ne-najdeno — чтобы проход не прошёл, ничего не записывая.
//     Коды: 0 — годно; 1 — расхождение (очередь не убыла, дубль, запись по дошедшему); 2 — слепота (предмет не загрузился).
//     ЧЕГО НЕ ЛОВИТ: настоящую OMEGA и её ответы (подставная повторяет только склейку по точному тексту, не Reconfirmed/
//     Evolved); разбор moglo-dojti-bez-id — по устройству он за рукой; предел «раз в час» под нагрузкой.
// EN: A-N-1718 stand for the deferred-delivery caller: a queue filled by the live write path must drain by itself after the
//     next confirmed delivery, without hitting already-delivered knowledge with a write.
let Context, apply, name, Config;
const YADRO = process.env.STEND_YADRO ?? new URL('../src/index.js', import.meta.url).pathname;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import(YADRO));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160));
  process.exit(2);
}
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const kat = mkdtempSync(join(tmpdir(), 'stend-povtora-'));
process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));
const zhdat = (ms) => new Promise((r) => setTimeout(r, ms));
const h = (t) => createHash('sha256').update(t).digest('hex');
const rovno = (t) => String(t).replace(/\s+/g, ' ').trim();

// RU: Подставная OMEGA: строки по id, склейка по точному тексту в корне, счёт записей по уже лежащему.
function faksimile() {
  const stroki = new Map();          // id → { tekst, koren }
  const schet = { sohranit: 0, proverit: 0, poDoshedshemu: [], novyh: 0 };
  let faza = 1, scenarij = () => null, dostupen = true;
  let nomer = 0;
  const najtiTochno = (tekst, koren) => [...stroki].find(([, v]) => v.koren === koren && h(v.tekst) === h(tekst))?.[0];
  return {
    schet, stroki,
    polozhit(id, tekst, koren) { stroki.set(id, { tekst, koren }); },
    faza1(f) { faza = 1; scenarij = f; }, faza2() { faza = 2; },
    nedostupen(v) { dostupen = !v; },
    dostupna: () => dostupen,
    pochemuNedostupna: () => (dostupen ? null : 'подставная OMEGA не отвечает'),
    async sohranit({ soderzhim, kto }) {
      schet.sohranit += 1;
      if (faza === 1) return scenarij(soderzhim);
      const est = najtiTochno(soderzhim, kto);
      if (est) { schet.poDoshedshemu.push(est); return { sostoyanie: 'dostavleno', id: est, sozdana: false }; }
      const id = 'mem-' + String(++nomer).padStart(12, '0');
      stroki.set(id, { tekst: soderzhim, koren: kto }); schet.novyh += 1;
      return { sostoyanie: 'dostavleno', id, sozdana: true };
    },
    async proverit({ id, obrazec }) {
      schet.proverit += 1;
      const v = stroki.get(id);
      if (!v) return { sostoyanie: 'net', pochemu: 'нет такой' };
      return rovno(v.tekst).includes(rovno(obrazec).slice(0, 40)) ? { sostoyanie: 'est', pochemu: 'сошлось' } : { sostoyanie: 'net', pochemu: 'чужое' };
    },
  };
}

let ok = 0, bed = 0;
// RU: A-N-1884 (находка ворот vypusk-tegom 08.10, тот же договор, что в stend-klyuchej-a1870 cd5085f0): ВОЗВРАТ ТЕЛА — ТОЖЕ ИСХОД.
//     Прежде обёртка судила только по исключению и выбрасывала возврат (obyortka-krasneet: ГЛУХОЙ). Любой возврат, кроме
//     undefined и true, — красное с текстом возврата.
// EN: A-N-1884: a body's return value is an outcome too; any return other than undefined/true is red (same contract as cd5085f0).
const proba = (imya, f) => {
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы');
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + e.message); }
};

const AGENT = 'proba-uzel';
const om = faksimile();
const putBazy = join(kat, 'p.db');
const koren = new Context();
koren.provide('logger'); koren.logger = { error: () => {} };
koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = om;
koren.plugin({ name, apply }, new Config({ putBazy, otvechayushchegoNet: true, agent: AGENT }));
await zhdat(60);
const pam = koren.pamyat;
if (!pam?.zapisat) { console.log('СЛЕПОТА: служба pamyat не поднялась'); process.exit(2); }

// RU: Фаза 1 — набрать очередь живым путём записи, исходами, замеренными на sadik.
const ZNANIYA = {
  lezhit: ['Л1 знание лежит под тем же id', 'Л2 знание лежит под тем же id', 'Л3 знание лежит под тем же id'],
  chuzhoj: 'Ч1 знание лежит под другим id, а очередь держит чужой',
  nedoshlo: 'Н1 знание действительно не дошло',
  bezId: ['Б1 вызов оборвался без id', 'Б2 вызов оборвался без id'],
  neOtpr: 'О1 слой был недоступен до вызова',
};
const idLezhit = ZNANIYA.lezhit.map((_, i) => 'mem-aaaa0000000' + i);
om.faza1((t) => {
  const i = ZNANIYA.lezhit.indexOf(t);
  if (i >= 0) return { sostoyanie: 'ne-najdeno', id: idLezhit[i], pochemu: 'ложное «не найдено» прежней сверки' };
  if (t === ZNANIYA.chuzhoj) return { sostoyanie: 'ne-najdeno', id: 'mem-cccc00000001', pochemu: 'id чужой записи' };
  if (t === ZNANIYA.nedoshlo) return { sostoyanie: 'ne-najdeno', id: 'mem-dddd00000001', pochemu: 'нет' };
  if (ZNANIYA.bezId.includes(t)) return { sostoyanie: 'moglo-dojti-bez-id', id: null, pochemu: 'обрыв' };
  return { sostoyanie: 'dostavleno', id: 'mem-ffff00000000', sozdana: true };
});
for (const t of [...ZNANIYA.lezhit, ZNANIYA.chuzhoj, ZNANIYA.nedoshlo, ...ZNANIYA.bezId]) pam.zapisat({ klass: 'urok', soderzhim: t, istochnik: 'stend#povtor' });
om.nedostupen(true); pam.zapisat({ klass: 'urok', soderzhim: ZNANIYA.neOtpr, istochnik: 'stend#povtor' }); om.nedostupen(false);
await zhdat(80);

// RU: Что фактически лежит в OMEGA к фазе 2 (как замерено на sadik): Л — под своим id; Ч — точный текст под ДРУГИМ id,
//     а под id из очереди — чужое знание; Б — дошли (без id); Н и О — нет.
ZNANIYA.lezhit.forEach((t, i) => om.polozhit(idLezhit[i], t, AGENT));
om.polozhit('mem-cccc00000001', 'совсем другое знание того же корня', AGENT);
om.polozhit('mem-eeee00000001', ZNANIYA.chuzhoj, AGENT);
ZNANIYA.bezId.forEach((t, i) => om.polozhit('mem-bbbb0000000' + i, t, AGENT));
const strokDo = om.stroki.size;

const ochered = () => { const db = new DatabaseSync(putBazy, { readOnly: true }); const r = db.prepare('SELECT zapis_id, priroda FROM ochered_dolgovremennogo ORDER BY zapis_id').all(); db.close(); return r; };
const doPovtora = ochered();
proba('набор: в очереди 8 записей живым путём (3 лежат, 1 чужой id, 1 не дошло, 2 без id, 1 не отправлено)', () => {
  if (doPovtora.length !== 8) throw new Error('в очереди ' + doPovtora.length + ': ' + JSON.stringify(doPovtora));
});

// RU: Фаза 2 — новая запись доставлена; дальше никто очередь руками не зовёт.
om.faza2();
pam.zapisat({ klass: 'urok', soderzhim: 'Т1 свежее знание, доставка которого будит повтор', istochnik: 'stend#povtor' });
let posle = ochered();
for (let i = 0; i < 40 && posle.length > 2; i++) { await zhdat(50); posle = ochered(); }

proba('очередь убыла сама: остались только 2 moglo-dojti-bez-id (за рукой)', () => {
  const nebez = posle.filter((z) => z.priroda !== 'moglo-dojti-bez-id');
  if (nebez.length) throw new Error('очередь НЕ убыла: осталось ' + posle.length + ' — ' + nebez.map((z) => 'запись ' + z.zapis_id + ' (' + z.priroda + ')').join(', '));
  if (posle.length !== 2) throw new Error('без id осталось ' + posle.length + ', ждали 2');
});
proba('повтор не писал по уже дошедшему под своим id (Л1–Л3)', () => {
  const bili = om.schet.poDoshedshemu.filter((id) => idLezhit.includes(id));
  if (bili.length) throw new Error('запись по дошедшему: ' + bili.join(', '));
});
proba('дублей 0: в подставной OMEGA нет двух строк одного текста в корне', () => {
  const vidano = new Map();
  for (const [id, v] of om.stroki) { const k = v.koren + '|' + h(v.tekst); vidano.set(k, [...(vidano.get(k) ?? []), id]); }
  const dubli = [...vidano.values()].filter((x) => x.length > 1);
  if (dubli.length) throw new Error('дубли: ' + dubli.map((x) => x.join('=')).join('; '));
});
proba('новых строк ровно 3: свежее Т1, недошедшее Н1, неотправленное О1', () => {
  if (om.stroki.size - strokDo !== 3) throw new Error('строк было ' + strokDo + ', стало ' + om.stroki.size);
});
console.log(`итог: ${ok} из ${ok + bed}` + (bed ? ' — РАСХОЖДЕНИЕ' : ''));
process.exit(bed ? 1 : 0);
