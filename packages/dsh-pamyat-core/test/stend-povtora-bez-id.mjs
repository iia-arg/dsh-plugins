// RU: A-N-1718 (а2, Искра, 07.10.2026): стенд разбора moglo-dojti-bez-id по ТЕЛУ. Очередь только из записей без id
//     (как на sadik: iskra 5, petrovich 5) должна будить проход после подтверждённой доставки, и проход решает по числу
//     записей корня, содержащих тело целиком (слой poTelu): 1 — снять как подтверждённое; 0 — ждёт руки; >1 — ждёт руки
//     с причиной «дубль»; отказ поиска — ждёт руки и назван в строке итога. Повтора ЗАПИСЬЮ для них нет никогда.
//     Подставная OMEGA ищет вхождение тела в корне, как phrase в omega-memory 1.5.19 (SQL LIKE «содержит»).
//     Коды: 0 — годно; 1 — расхождение; 2 — слепота (предмет не загрузился).
//     r2 (условие Вениамина 11:24Z): тело короче 80 знаков после trim по телу не сверяется (Б5).
//     ЧЕГО НЕ ЛОВИТ: настоящий формат ответа OMEGA (его держит стенд слоя stend-po-telu); предел «раз в час» под нагрузкой.
// EN: A-N-1718 (a2) stand: id-less queue entries are resolved by body search — 1 removes, 0 and >1 wait for a human.
let Context, apply, name, Config;
const YADRO = process.env.STEND_YADRO ?? new URL('../src/index.js', import.meta.url).pathname;
try {
  ;({ Context } = await import('@deepseek-ai/cordis'));
  ;({ apply, name, Config } = await import(YADRO));
} catch (e) {
  console.log('СЛЕПОТА: предмет не загрузился — ' + String(e?.message ?? e).slice(0, 160));
  process.exit(2);
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const kat = mkdtempSync(join(tmpdir(), 'stend-bez-id-'));
process.on('exit', () => rmSync(kat, { recursive: true, force: true }));
process.on('SIGTERM', () => process.exit(143)); process.on('SIGINT', () => process.exit(130));
const zhdat = (ms) => new Promise((r) => setTimeout(r, ms));

const PAD = ' — тело стенда длиннее порога сверки по телу (80 знаков), как у настоящих знаний.';
const OTKAZ = 'Б4 тело, на котором поиск не состоялся' + PAD;
function faksimile() {
  const stroki = new Map();          // id → { tekst, koren }
  const schet = { sohranit: 0, poTelu: 0, poTeluTela: [] };
  let faza = 1, nomer = 0;
  return {
    schet, stroki,
    polozhit(id, tekst, koren) { stroki.set(id, { tekst, koren }); },
    faza2() { faza = 2; },
    dostupna: () => true, pochemuNedostupna: () => null,
    async sohranit({ soderzhim, kto }) {
      schet.sohranit += 1;
      if (faza === 1) return { sostoyanie: 'moglo-dojti-bez-id', id: null, pochemu: 'обрыв' };
      const id = 'mem-' + String(++nomer).padStart(12, '0');
      stroki.set(id, { tekst: soderzhim, koren: kto });
      return { sostoyanie: 'dostavleno', id, sozdana: true };
    },
    async proverit() { return { sostoyanie: 'ne-proveryali', pochemu: 'не нужен' }; },
    async poTelu({ tekst, koren }) {
      schet.poTelu += 1; schet.poTeluTela.push(tekst);
      if (tekst === OTKAZ) return { otkaz: 'поиск не состоялся: подставной обрыв' };
      return { ids: [...stroki].filter(([, v]) => v.koren === koren && v.tekst.includes(tekst.trim())).map(([id]) => id).slice(0, 3) };
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
const kriki = [];
const prezhnij = console.error; console.error = (...a) => kriki.push(a.join(' '));
const koren = new Context();
koren.provide('logger'); koren.logger = { error: () => {} };
koren.provide('pamyatDolgovremennaya'); koren.pamyatDolgovremennaya = om;
koren.plugin({ name, apply }, new Config({ putBazy, otvechayushchegoNet: true, agent: AGENT }));
await zhdat(60);
const pam = koren.pamyat;
if (!pam?.zapisat) { console.error = prezhnij; console.log('СЛЕПОТА: служба pamyat не поднялась'); process.exit(2); }

// RU: Фаза 1 — очередь только из записей без id, набранная живым путём записи.
const B = { odna: 'Б1 тело лежит в корне ровно один раз' + PAD, nol: 'Б2 тело не дошло никуда' + PAD, dubl: 'Б3 тело лежит в корне дважды' + PAD,
  // RU: r2 (условие Вениамина): короткое тело, целиком входящее в ЧУЖУЮ запись корня, — ложное «1» без порога · EN: short body inside another record
  korotkoe: 'Б5 короткое тело' };
for (const t of [B.odna, B.nol, B.dubl, OTKAZ, B.korotkoe]) pam.zapisat({ klass: 'urok', soderzhim: t, istochnik: 'stend#bez-id' });
await zhdat(80);
om.polozhit('mem-b10000000001', B.odna, AGENT);
om.polozhit('mem-b30000000001', B.dubl, AGENT);
om.polozhit('mem-b30000000002', 'склейка: ' + B.dubl + ' и ещё абзац', AGENT);
om.polozhit('mem-c00000000001', B.nol, 'chuzhoj-koren');
om.polozhit('mem-e50000000001', 'чужая запись корня, в которой есть фраза «' + B.korotkoe + '» и ещё много своего текста', AGENT);   // RU: то же тело в ЧУЖОМ корне не считается · EN: another root does not count
const ochered = () => { const db = new DatabaseSync(putBazy, { readOnly: true }); const r = db.prepare('SELECT zapis_id, priroda FROM ochered_dolgovremennogo ORDER BY zapis_id').all(); db.close(); return r; };
const zhurnal = (priroda) => { const db = new DatabaseSync(putBazy, { readOnly: true }); const r = db.prepare('SELECT pochemu FROM zhurnal WHERE priroda = ?').all(priroda); db.close(); return r; };
const doPovtora = ochered();
proba('набор: в очереди 5 записей, все moglo-dojti-bez-id', () => {
  if (doPovtora.length !== 5 || doPovtora.some((z) => z.priroda !== 'moglo-dojti-bez-id')) throw new Error(JSON.stringify(doPovtora));
});

// RU: Фаза 2 — новая запись доставлена; очередь из одних «без id» должна разбудить проход.
om.faza2();
const sohranitDo = om.schet.sohranit;
pam.zapisat({ klass: 'urok', soderzhim: 'Т1 свежее знание, доставка которого будит повтор', istochnik: 'stend#bez-id' });
let posle = ochered();
for (let i = 0; i < 40 && om.schet.poTelu < 4; i++) { await zhdat(50); posle = ochered(); }
await zhdat(50); posle = ochered();
console.error = prezhnij;

proba('проход разбужен очередью из одних «без id»: poTelu спрошен 4 раза', () => {
  if (om.schet.poTelu !== 4) throw new Error('poTelu спрошен ' + om.schet.poTelu + ' раз');
});
proba('1 → снята: в очереди остались 4 (ноль, дубль, отказ, короткое)', () => {
  if (posle.length !== 4) throw new Error('в очереди ' + posle.length + ': ' + JSON.stringify(posle));
});
proba('журнал: ровно одна строка podtverzhdeno-po-telu с id mem-b10000000001', () => {
  const z = zhurnal('podtverzhdeno-po-telu');
  if (z.length !== 1 || !z[0].pochemu.includes('mem-b10000000001')) throw new Error(JSON.stringify(z));
});
proba('>1 → ждёт руки с причиной «дубль», оба id названы', () => {
  const z = zhurnal('dubl');
  if (z.length !== 1 || !z[0].pochemu.includes('mem-b30000000001') || !z[0].pochemu.includes('mem-b30000000002')) throw new Error(JSON.stringify(z));
});
proba('повтора записью для «без id» нет: sohranit только для Т1', () => {
  if (om.schet.sohranit - sohranitDo !== 1) throw new Error('sohranit в фазе 2: ' + (om.schet.sohranit - sohranitDo));
});
proba('r2: короткое тело (<80) не сверяется по телу — poTelu не спрошен, запись ждёт руки, а не снята по чужой записи', () => {
  if (om.schet.poTeluTela.includes(B.korotkoe)) throw new Error('poTelu спрошен по короткому телу');
  if (!posle.some((z) => z.zapis_id === 5)) throw new Error('короткая запись снята из очереди: ' + JSON.stringify(posle));
});
proba('строка итога: ждут руки 4, дубль 1, коротко 1, проверка по телу не состоялась 1', () => {
  const s = kriki.find((k) => k.includes('повтор доставки (A-N-1718)')) ?? '';
  if (!/ждут руки \(moglo-dojti-bez-id\) 4 \(из них дубль 1\) \(тело коротко для сверки по телу 1\)/.test(s) || !/проверка по телу не состоялась 1/.test(s)) throw new Error('строка: ' + (s || 'нет'));
});
console.log(`итог: ${ok} из ${ok + bed}` + (bed ? ' — РАСХОЖДЕНИЕ' : ''));
process.exit(bed ? 1 : 0);
