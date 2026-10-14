// RU: Исключения обращения к полю и слова синтаксиса во втором проходе najti_sekret действуют на любой глубине, включая позиции за OKNO_OBYAVLENIYA. Индекс разделителя в окне нельзя применять к полному тексту. На каждой глубине разрешённая форма парна с настоящим секретом. Коды: 0 — успех, 1 — расхождение.
// EN: Field-access and syntax-word exemptions in najti_sekret’s second pass apply at any depth, including beyond OKNO_OBYAVLENIYA. A separator index within a window cannot index the full text. At each depth, pair an allowed form with an actual secret. Codes: 0 success, 1 mismatch.
import { najti_sekret } from '../src/filtr-vhoda.js';

const GLUBINY = [0, 30, 200, 7000];
const DOLZHNO_PROHODIT = ['token: process.env.MY_TOKEN', 'key: config.token', 'key=lambda f: f.name'];
const DOLZHNO_ZAPIRATSYA = ['pwd: Hunter22xy', 'api_key=sk-ant-oat01-AbCdEf123456', 'password = Xk9#mQ2$vL8p']; // RU: Синтетический образец · EN: Synthetic sample; vorota-ob:dopusk=TOKEN
let ok = 0, bed = 0;
const proba = (imya, beda) => { if (beda) { bed++; console.log('  ❌ ' + imya + ' — ' + beda); } else { ok++; console.log('  ✅ ' + imya); } };
const nabivka = (n) => 'текст про другое '.repeat(Math.ceil(n / 17)).slice(0, n);

for (const g of GLUBINY) {
  const lozhnye = DOLZHNO_PROHODIT.filter((s) => najti_sekret(nabivka(g) + ' ' + s) !== null);
  proba(`глубина ${g}: обращение к полю и слово синтаксиса проходят (${DOLZHNO_PROHODIT.length})`,
    lozhnye.length ? 'заперто: ' + lozhnye.join(' · ') : '');
  const propushcheny = DOLZHNO_ZAPIRATSYA.filter((s) => najti_sekret(nabivka(g) + ' ' + s)?.klass !== 'obyavlennyj');
  proba(`глубина ${g}: настоящие секреты запираются obyavlennyj (${DOLZHNO_ZAPIRATSYA.length})`,
    propushcheny.length ? 'не заперто: ' + propushcheny.length + ' из ' + DOLZHNO_ZAPIRATSYA.length : '');
}
console.log(`  итог: ${ok} из ${ok + bed}`);
process.exit(bed ? 1 : 0);
