// RU: Настоящие najti_sekret и zamaskirovat должны найти объявление в ` ` или ** **, заменить его один раз и не ловить метку снова. Повторная замена раньше доходила до предела 200 и отвергала запись. Кавычки-ёлочки и HTML не проверяются и детектором не снимаются.
// EN: The real najti_sekret and zamaskirovat must find declarations inside ` ` or ** **, replace them once, and not rematch the marker. Repeated replacement previously reached the 200 limit and rejected the record. Guillemets and HTML are untested and are not stripped by the detector.
import { najti_sekret, zamaskirovat } from '../src/filtr-vhoda.js';
let ok = 0, vsego = 0;
const proba = (imya, f) => { vsego++; try { const v = f(); if (v !== undefined) throw new Error('тело пробы вернуло «' + String(v).slice(0, 60) + '» — пробы говорят только исключением'); ok++; console.log('  ✅ ' + imya); } catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message); } };
const sluchai = ['пример: password: `abcdefgh` — учебный', 'api_key: `Abc123xyz`', 'пример: password: **abcdefgh** — учебный'];
proba('1 ДЕТЕКТОР НЕ ОСЛАБ: объявленное значение в обрамлении — находка obyavlennyj', () => {
  for (const t of sluchai) { const r = najti_sekret(t); if (r?.klass !== 'obyavlennyj') throw new Error(t + ' → ' + JSON.stringify(r)); }
});
proba('2 МАСКА за один раз: 1 замена, не упёрлась, после маски чисто, значения в тексте нет', () => {
  for (const t of sluchai) {
    const m = zamaskirovat(t);
    if (m.zameneno !== 1 || m.upyorsya) throw new Error(`${t}: замен ${m.zameneno}, упёрлась ${m.upyorsya}`);
    if (najti_sekret(m.tekst)) throw new Error(t + ': после маски снова находка');
    if (/abcdefgh|Abc123xyz/.test(m.tekst)) throw new Error(t + ': значение осталось');
  }
});
proba('3 МЕТКА В ОБРАМЛЕНИИ — не секрет: «password: `[скрыто obyavlennyj @19]`» чисто', () => {
  const r = najti_sekret('пример: password: `[скрыто obyavlennyj @19]` — учебный'); if (r) throw new Error(JSON.stringify(r));
});
proba('4 КОРОТКОЕ в обрамлении (меньше 8 после снятия) — не находка, как без обрамления', () => {
  if (najti_sekret('пароль: `abcdefg`')) throw new Error('7 знаков в обрамлении пойманы');
});
console.log(`стенд маски обрамления: ${ok} из ${vsego}`);
process.exit(ok === vsego ? 0 : 1);
