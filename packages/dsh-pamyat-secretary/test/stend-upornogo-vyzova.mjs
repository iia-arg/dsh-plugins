// RU: Проверяем упорный вызов по числу обращений: временный отказ повторяется не более трёх попыток, постоянный не повторяется. Текст диагностики не подменяет проверку поведения.
// EN: Test persistent calls by request count: retry temporary failures for at most three attempts; do not retry permanent failures. Diagnostic wording does not replace behavioral verification.
import { sprositUporno } from '../src/distillyaciya.js';

let vsego = 0, proshlo = 0;
const proba = (imya, uslovie) => { vsego++; if (uslovie) { proshlo++; console.log('  ok   ' + imya); }
                                   else console.log('  ПЛОХО ' + imya); };

function podmena(otvety) {
  let i = 0;
  const schet = { obrashchenij: 0 };
  globalThis.fetch = async () => {
    const o = otvety[Math.min(i, otvety.length - 1)]; i++; schet.obrashchenij++;
    if (o === 'ok') return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'статья' }], stop_reason: 'end_turn' }) };
    return { ok: false, status: o, text: async () => 'подставной отказ ' + o };
  };
  return schet;
}
const zvat = (o) => sprositUporno({ klyuch: 'x', tekst: 'проба', tajmautMs: 1000 },
                                  { popytok: 3, pauzy: [1, 1] });

const staryjFetch = globalThis.fetch;

// RU: Исправный ответ: один вызов без повторов.
// EN: Healthy response: one call with no retry.
let s = podmena(['ok']);
let r = await zvat();
proba('исправное: исход ok', r.ishod === 'ok');
proba('исправное: обращений РОВНО 1 (повтора нет)', s.obrashchenij === 1);

// RU: Временный 529 повторяется до предела трёх обращений.
// EN: Retry temporary 529 up to three calls.
s = podmena([529]);
r = await zvat();
proba('временный 529: обращений 3 (повторяли)', s.obrashchenij === 3);
proba('временный 529: сказано про исчерпание', /ПОВТОРЫ ИСЧЕРПАНЫ/.test(r.pochemu || ''));

// RU: При восстановлении на второй попытке всего два обращения.
// EN: Recovery on the second attempt requires two calls in total.
s = podmena([503, 'ok']);
r = await zvat();
proba('529 -> ok: исход ok', r.ishod === 'ok');
proba('529 -> ok: обращений 2', s.obrashchenij === 2);

// RU: Постоянный отказ не повторяется.
// EN: Do not retry a permanent failure.
s = podmena([402]);
r = await zvat();
proba('деньги 402: обращений РОВНО 1 (не повторяем)', s.obrashchenij === 1);
proba('деньги 402: признан окончательным', r.okonchatelno === true);

// RU: Непринятый ключ не повторяется.
// EN: Do not retry a rejected key.
s = podmena([401]);
r = await zvat();
proba('ключ 401: обращений РОВНО 1', s.obrashchenij === 1);

globalThis.fetch = staryjFetch;
console.log(`итог: ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
