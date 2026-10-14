// RU: Стенд наставления оценки проверяет настоящий текст podatWelcome: удаление инструкции, повтор на каждую запись и инструкция без поданных знаний должны отказать. Поведение модели не измеряется, оно требует отдельной пробы.
// EN: The rating-instruction test inspects actual podatWelcome output: removing the instruction, repeating it per record, or showing it without delivered knowledge must fail. Model behavior is not measured and requires a separate experiment.
import assert from 'node:assert/strict';
let podatWelcome;
try { ({ podatWelcome } = await import('../src/index.js')); }
catch (e) { console.error('СЛЕПОТА: restore не загрузился', e.message); process.exit(2); }
const cfg = { welcomeBudget: 15200, ignoreAfterMs: 7 * 86400000, useVeraThreshold: .7, ignoreVeraThreshold: .3 };
const rec = (id, extra = {}) => ({ id, kogda: Date.now(), vera: null, vid: 'urok', avtor: 'stend', soderzhim: 'Проверяемое правило 🧪', ...extra });
const count = (text) => (text ?? '').split('pamyat_ocenit').length - 1;
let failed = 0;
const probe = (name, fn) => { try { fn(); console.log('ok', name); } catch (e) { failed++; console.error('FAIL', name, e.message); } };
probe('одна verify-запись: наставление ровно один раз, договор не противоречит оценщику', () => {
 const r = podatWelcome([rec(1)], cfg);
 assert.equal(count(r.tekst), 1); assert.deepEqual(r.podany.map(x => x.id), [1]);
 for (const text of ['После применения записи #N из этого приветствия', 'pomoglo, podvelo или ustarelo', '20–400 знаков', 'Простое чтение не оценивай.', 'Нет проверки результата — оценки нет.', 'Одну выдачу оценивай один раз;', 'после отказа не повторяй вызов без новой выдачи.']) assert.ok(r.tekst.includes(text), text);
});
probe('две законные записи: одна рамка, а не наставление на каждую', () => {
 const r = podatWelcome([rec(1), rec(2, { vera: .9 })], cfg);
 assert.equal(count(r.tekst), 1); assert.deepEqual(r.podany.map(x => x.id), [1, 2]);
});
probe('пустой вход: нет рамки и наставления', () => {
 const r = podatWelcome([], cfg); assert.equal(r.tekst, null); assert.equal(count(r.tekst), 0); assert.deepEqual(r.podany, []);
});
probe('только слишком старая запись: нет наставления', () => {
 const r = podatWelcome([rec(1, { kogda: Date.now() - 8 * 86400000 })], cfg); assert.equal(r.tekst, null); assert.equal(count(r.tekst), 0);
});
probe('только отменённая: предупреждение остаётся, наставления нет', () => {
 const r = podatWelcome([rec(1, { doverie: { sostoyanie: 'otmenena', stroka: 'отменена #2' } })], cfg);
 assert.ok(r.tekst.includes('⛔ #1')); assert.equal(count(r.tekst), 0); assert.deepEqual(r.podany, []);
});
probe('законная и отменённая: одна инструкция, отменённая не становится поданной', () => {
 const r = podatWelcome([rec(1), rec(2, { doverie: { sostoyanie: 'otmenena', stroka: 'отменена #3' } })], cfg);
 assert.equal(count(r.tekst), 1); assert.deepEqual(r.podany.map(x => x.id), [1]); assert.ok(r.tekst.includes('⛔ #2'));
});
console.log(`integration-note: ${6 - failed}/6`); process.exit(failed ? 1 : 0);
