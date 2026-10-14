// RU: Проверяем обрамление на глубинах 0 и 7000: закрывающие ` и ** не входят в значение обоих проходов najti_sekret. Обращение к полю проходит; настоящий секрет, lowerCamelCase и однородный пароль в обрамлении остаются заперты. Коды: 0 — успех, 1 — расхождение.
// EN: Test wrappers at depths 0 and 7000: closing ` and ** are excluded from values in both najti_sekret passes. Field access passes; actual secrets, lowerCamelCase, and homogeneous wrapped passwords remain rejected. Codes: 0 success, 1 mismatch.
import { najti_sekret, zapiraet } from '../src/filtr-vhoda.js';

const GLUBINY = [0, 7000];
const DOLZHNO_PROHODIT = ['`token: process.env.MY_TOKEN`', '**`token: process.env.MY_TOKEN`**',
  '`key: config.token`**', 'token: **process.env.MY_TOKEN**'];
const DOLZHNO_ZAPIRATSYA = ['`pwd: Hunter22xy`', 'api_key: `sk-ant-oat01-AbCdEf123456`', // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
  '**password = Xk9#mQ2$vL8p**', '`password: Xk9#mQ2$vL8p`', 'key: `lastTouchedAt`',
  // RU: Пороговый случай: одноалфавитное значение запирает второй проход без кавычек; обрамление не должно его освобождать.
  // EN: Boundary case: the second pass rejects a single-alphabet value without quotes; wrapping must not exempt it.
  'password: `abcdefgh`', 'пароль: `qwertyuiop`', '**token: abcdefghijk**'];
let ok = 0, bed = 0;
const proba = (imya, beda) => { if (beda) { bed++; console.log('  ❌ ' + imya + ' — ' + beda); } else { ok++; console.log('  ✅ ' + imya); } };
const nabivka = (n) => 'текст про другое '.repeat(Math.ceil(n / 17)).slice(0, n);

for (const g of GLUBINY) {
  for (const s of DOLZHNO_PROHODIT) {
    const r = najti_sekret(nabivka(g) + ' ' + s);
    proba(`глубина ${g}: проходит ${s}`, r ? `заперто ${r.klass} @${r.pozicia}` : '');
  }
  for (const s of DOLZHNO_ZAPIRATSYA) {
    const r = najti_sekret(nabivka(g) + ' ' + s);
    proba(`глубина ${g}: запирается ${s.replace(/[A-Za-z0-9]{4,}$|[A-Za-z0-9#$-]{6,}/g, '…')}`,
      r && zapiraet(r.klass) ? '' : 'не заперто' + (r ? ` (${r.klass})` : ''));
  }
}
console.log(`  итог: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
