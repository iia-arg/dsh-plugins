/**
 * RU: Стенд pometkaOtnosheniya проверяет форматирование полей ядра и #id для ссылки через pamyat_otnoshenie. Сам helper помечает, не решает судьбу записи; исключение отменённого содержимого проверяет отдельный стенд доверия. Коды 0 — совпало, 1 — есть отказ, 2 — предмет не загрузился.
 * EN: Test pometkaOtnosheniya formatting of core fields and #id references for pamyat_otnoshenie. The helper annotates without deciding a record fate; the separate trust test checks exclusion of cancelled content. Exit codes: 0 matches, 1 failure exists, 2 the subject failed to load.
 */
let Config, perevesti, renderWelcome, pometkaOtnosheniya;
try {
  ;({ Config, perevesti, renderWelcome, pometkaOtnosheniya } = await import('../src/index.js'));
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

const syraya = (id, klass, soderzhim, otnosheniya) => ({
  id, agent: 'stend', klass, soderzhim, sozdano: Date.now(), vera: 0.9, istochnik: 'стенд',
  bez_podtverzhdeniya: 0, podtverzhdenie: null, ...(otnosheniya === undefined ? {} : { otnosheniya }),
});
const c = Config({ welcomeBudget: 5000 });

proba('perevesti переносит otnosheniya как есть; нет поля — null, а не пустые перечни', () => {
  const o = { sama: null, otmenena: [7], utochnena: [] };
  const a = perevesti(syraya(5, 'reshenie', 'x', o)), b = perevesti(syraya(6, 'reshenie', 'y'));
  return (a.otnosheniya === o && b.otnosheniya === null) || `${JSON.stringify(a.otnosheniya)} / ${JSON.stringify(b.otnosheniya)}`;
});
proba('брифинг ПОМЕЧАЕТ, НЕ СКРЫВАЕТ: отменённая на месте с «⛔ ОТМЕНЕНА записью #7», у отменяющей «(отменяет #5)»', () => {
  const zapisi = [
    perevesti(syraya(7, 'reshenie', 'новое решение', { sama: { vid: 'otmenyaet', k: 5 }, otmenena: [], utochnena: [] })),
    perevesti(syraya(5, 'reshenie', 'старое решение', { sama: null, otmenena: [7], utochnena: [] })),
  ];
  const t = renderWelcome(zapisi, c) ?? '';
  const s5 = t.split('\n').find((l) => l.includes('старое решение')) ?? '';
  const s7 = t.split('\n').find((l) => l.includes('новое решение')) ?? '';
  return (s5.includes('#5') && s5.includes('⛔ ОТМЕНЕНА записью #7') && s7.includes('#7') && s7.includes('(отменяет #5)'))
    || 'брифинг:\n' + t;
});
proba('уточнённая помечается «уточнена записью #N»; без отношений — пометки нет, но #id есть', () => {
  const t = renderWelcome([
    perevesti(syraya(3, 'fakt', 'случилось', { sama: null, otmenena: [], utochnena: [4] })),
    perevesti(syraya(9, 'fakt', 'просто факт', { sama: null, otmenena: [], utochnena: [] })),
  ], c) ?? '';
  const s3 = t.split('\n').find((l) => l.includes('случилось')) ?? '';
  const s9 = t.split('\n').find((l) => l.includes('просто факт')) ?? '';
  return (s3.includes('уточнена записью #4') && s9.includes('#9') && !/ОТМЕНЕНА|уточнена|отменяет|уточняет/.test(s9))
    || 'брифинг:\n' + t;
});
proba('старое ядро (otnosheniya нет) — пометки нет, строка не ломается', () => {
  return pometkaOtnosheniya({ otnosheniya: null }) === '' && pometkaOtnosheniya({}) === '' || 'пометка без данных';
});
console.log(`ИТОГ: прошло ${proshlo} из ${vsego}`);
process.exit(proshlo === vsego ? 0 : 1);
