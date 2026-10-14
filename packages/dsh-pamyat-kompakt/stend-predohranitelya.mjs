// RU: Стенд предохранителя «не навреди» и порога «нечего сжимать». Зачем отдельно: пять из десяти проб
//     самопроверки слепы без ключа, потому что идут через живой вызов модели. Решение «что отдать» вынесено
//     функцией chtoOtdat — она не ходит в сеть, поэтому эти пробы зрячи всегда.
//     Коды: 0 чисто · 1 расхождение · 2 слепота. Знаменатель — из объявленного списка.
// EN: Stand for the "do no harm" fuse and the "nothing to compress" threshold. Why separate: five of ten
//     self-check probes are blind without a key because they go through a live model call. The "what to return"
//     decision is the function chtoOtdat — it makes no network calls, so these probes always see.
//     Exit codes: 0 clean · 1 mismatch · 2 blind. The denominator comes from the declared list.
import { chtoOtdat } from './index.mjs';

const OBYAVLENO = [
  'svodka-koroche-otdayotsya-svodka',
  'svodka-dlinnee-otdayotsya-proza',      // RU: реальный случай: 9108 ← 8833 · EN: real case: 9108 ← 8833
  'svodka-ravna-proze-otdayotsya-proza',  // RU: граница: строго «короче», а не «не длиннее» · EN: boundary: strictly "shorter", not "not longer"
  'porog-vyklyuchen-model-zovyotsya',
  'porog-vklyuchen-malyy-vhod-model-ne-zovyotsya',
  'porog-vklyuchen-bolshoy-vhod-model-zovyotsya',
  'RAZLICHAET-novoe-ustrojstvo-ot-starogo',
];
const itogi = new Map();
const ok = (imya, horosho, chto) => itogi.set(imya, [horosho, chto]);

// RU: Пробы 1–3: предохранитель.
// EN: Probes 1–3: the fuse.
{ const r = chtoOtdat(5000, 20000, 0);
  ok('svodka-koroche-otdayotsya-svodka', r.otdano === 'svodka', `otdano=${r.otdano}`); }
{ const r = chtoOtdat(9108, 8833, 0);   // RU: ровно реальные числа, не выдуманные · EN: exactly the real numbers, not invented
  ok('svodka-dlinnee-otdayotsya-proza', r.otdano === 'proza-predohranitel', `otdano=${r.otdano} · ${r.pochemu}`); }
{ const r = chtoOtdat(8000, 8000, 0);
  ok('svodka-ravna-proze-otdayotsya-proza', r.otdano === 'proza-predohranitel', `otdano=${r.otdano}`); }

// RU: Пробы 4–6: порог.
// EN: Probes 4–6: the threshold.
{ const r = chtoOtdat(Infinity, 3000, 0);   // RU: порог 0 = выключен · EN: threshold 0 = off
  ok('porog-vyklyuchen-model-zovyotsya', r.otdano !== 'proza-porog', `otdano=${r.otdano}`); }
{ const r = chtoOtdat(Infinity, 8833, 12000);
  ok('porog-vklyuchen-malyy-vhod-model-ne-zovyotsya', r.otdano === 'proza-porog', `otdano=${r.otdano}`); }
{ const r = chtoOtdat(Infinity, 20000, 12000);
  ok('porog-vklyuchen-bolshoy-vhod-model-zovyotsya', r.otdano !== 'proza-porog', `otdano=${r.otdano}`); }

// RU: Проба 7: различает ли проба новое устройство от старого. Вопрос к всякой новой пробе не «проходит ли
//     она», а «покраснеет ли на СТАРОМ коде». Старое устройство отдавало сводку всегда, значит на нём исход был
//     бы 'svodka' при любых длинах — и проба 2 покраснела бы. Проверяем это явно подставным старым.
// EN: Probe 7: does the probe tell the new design from the old one. The question for any new probe is not "does
//     it pass" but "would it turn red on the OLD code". The old design always returned the summary, so it would
//     give 'svodka' for any lengths — and probe 2 would turn red. We check this explicitly with a substituted
//     old version.
{ const staroe = () => ({ otdano: 'svodka' });               // RU: как было до правки · EN: as it was before the fix
  const r = staroe();
  ok('RAZLICHAET-novoe-ustrojstvo-ot-starogo',
     r.otdano === 'svodka' && chtoOtdat(9108, 8833, 0).otdano !== 'svodka',
     'старое отдало svodka, новое — прозу ⇒ пробы различают устройства'); }

let krasnyh = 0, slepyh = 0;
for (const imya of OBYAVLENO) {
  if (!itogi.has(imya)) { console.log(`  ⚪ СЛЕПОТА ${imya}`); slepyh++; continue; }
  const [horosho, chto] = itogi.get(imya);
  console.log(`  ${horosho ? '✅' : '🔴'} ${imya} — ${chto}`);
  if (!horosho) krasnyh++;
}
console.log(`[стенд предохранителя] объявлено: ${OBYAVLENO.length} · прогнано: ${itogi.size} · зелёных: ${itogi.size - krasnyh} · красных: ${krasnyh} · слепых: ${slepyh}`);
process.exit(krasnyh ? 1 : slepyh ? 2 : 0);
