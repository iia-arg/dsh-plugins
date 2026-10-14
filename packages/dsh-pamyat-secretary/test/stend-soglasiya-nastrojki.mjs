// RU: Сверяем каждый ключ nastrojka, читаемый в distill-shov.js, со схемой Config: необъявленная настройка может потеряться при профиле. Функции и объекты, задаваемые в index.js, исключаются по форме определения, а не ручному белому списку. Это текстовая проверка известных форм, а не выполнение платформы.
// EN: Compare every nastrojka key read in distill-shov.js against the Config schema: an undeclared setting may be lost through profile parsing. Functions and objects supplied in index.js are excluded by definition shape rather than a manual allowlist. This is a text check of recognized shapes, not platform execution.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join as putJoin } from 'node:path';

const SHOV = readFileSync(putJoin(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'distill-shov.js'), 'utf8');
const INDEX = readFileSync(putJoin(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js'), 'utf8');

// RU: Собираем все обращения nastrojka.X из distill-shov.js.
// EN: Collect all nastrojka.X accesses from distill-shov.js.
const potrebiteli = new Set([...SHOV.matchAll(/nastrojka\.([a-zA-Z]+)/g)].map((m) => m[1]));

// RU: Собираем ключи схемы формы X: z. в index.js.
// EN: Collect schema keys shaped X: z. in index.js.
const skhema = new Set([...INDEX.matchAll(/^\s{2}([a-zA-Z]+):\s*z\./gm)].map((m) => m[1]));

// RU: Исключаем неконфигурационные функции и объекты по формам имя: () =>, имя: function и имя: {; ручного перечня нет.
// EN: Exclude nonconfiguration functions and objects shaped name: () =>, name: function, and name: {; no manual list is used.
const nekonfig = new Set([...INDEX.matchAll(/^\s*([a-zA-Z]+):\s*(?:\(\s*\)|\bfunction\b|\{)/gm)].map((m) => m[1]));

let ok = 0, bed = 0;
const proba = (imya, f) => {
  try {
    const v = f();
    if (v !== undefined && v !== true) throw new Error('тело вернуло «' + String(v).slice(0, 60) + '»');
    ok++; console.log('  ✅ ' + imya);
  } catch (e) { bed++; console.log('  ❌ ' + imya + ' — ' + String(e.message).slice(0, 180)); }
};

proba('каждый потребитель nastrojka.X объявлен в схеме ЛИБО распознан как не-конфиг по природе', () => {
  const net = [...potrebiteli].filter((x) => !skhema.has(x) && !nekonfig.has(x));
  if (net.length) return 'читаются из nastrojka, но не в схеме и не функция/объект: ' + net.join(', ');
});

proba('различение по природе: godnyeKlasses распознан как ФУНКЦИЯ (не краснеет)', () => {
  if (!potrebiteli.has('godnyeKlassy')) return 'godnyeKlasses не найден среди потребителей';
  if (!nekonfig.has('godnyeKlassy')) return 'godnyeKlasses не распознан функцией — краснел бы на исправном';
  if (skhema.has('godnyeKlassy')) return 'godnyeKlasses попал в схему — он функция, а не ключ';
});

proba('различение по природе: klyuch распознан как ОБЪЕКТ (не краснеет)', () => {
  if (!potrebiteli.has('klyuch')) return 'klyuch не найден среди потребителей';
  if (!nekonfig.has('klyuch')) return 'klyuch не распознан объектом';
});

proba('регулятор глубины razmerOkna и adres в схеме', () => {
  if (!skhema.has('razmerOkna')) return 'razmerOkna не в схеме — регулятор глубины не задать';
  if (!skhema.has('adres')) return 'adres не в схеме';
});

console.log(`итог: ${ok} из ${ok + bed}`);
process.exit(bed === 0 ? 0 : 1);
