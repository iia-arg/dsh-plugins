/**
 * Стенд документации: оба README растут вместе.
 *
 * ЗАЧЕМ. Правило «ru+en пишутся вместе» сломалось в первом же цикле правок:
 * русский ушёл вперёд на три природы, английский остался на старом. Правило,
 * которое некому проверить, держится на памяти автора — а она подводит ровно
 * тогда, когда правок много. Поэтому проверка, а не намерение.
 *
 * ЧТО ЭТО НЕ ЛОВИТ: смысловое расхождение при совпадении имён. Стенд следит за
 * тем, что перечни сходятся, но не читает текст вместо человека.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
const ru = readFileSync(join(koren, 'README.md'), 'utf8');
const en = readFileSync(join(koren, 'README.en.md'), 'utf8');

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try {
    const vernulos = f();
    // 🔴 ПРИРОДА ТЕЛА ПРОВЕРЯЕТСЯ, А НЕ ПОДРАЗУМЕВАЕТСЯ (05.09.2026). Прогонщик синхронный —
    // ждать не умеет. Ожидающее тело вернёт промис, try его НЕ поймает, проба зачтётся
    // мгновенно, а брошенное внутри уйдёт в никуда. Такая проба не краснеет НИКОГДА, ни на
    // каких данных: это не ложно-зелёное, а отсутствие проверки под видом проверки.
    // Замер 05.09: семь стендов ядра из десяти зеленели на подложенном падении в ожидающем
    // теле. Действующих async-тел не было ни одного — беда была впереди, и закрыта устройством.
    if (vernulos && typeof vernulos.then === 'function') {
      throw new Error('тело пробы ОЖИДАЮЩЕЕ, а прогонщик синхронный: вынеси ожидание наружу');
    }
    proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

const PRIRODY = ['otkazano-chelovekom', 'otmeneno', 'net-kanala', 'net-sluzhby', 'net-agenta', 'ne-predyavleno'];
const KLYUCHI = ['putBazy', 'agent', 'sprashivat', 'chtenieSkolko', 'zhurnalSkolko', 'otvechayushchegoNet'];

proba('🔴 ЧЕТЫРЕ ПРИРОДЫ ОЧЕРЕДИ НАЗВАНЫ В ОБОИХ README', () => {
  // По природе читающий решает, можно ли повторять записью. Пропусти одну — и он
  // повторит вслепую там, где повтор заводит второй экземпляр знания.
  for (const n of ['ne-otpravleno', 'ne-najdeno', 'moglo-dojti-id-est', 'moglo-dojti-bez-id']) {
    if (!ru.includes(n)) throw new Error('в русском нет ' + n);
    if (!en.includes(n)) throw new Error('в английском нет ' + n);
  }
});

proba('неразрешимость «без опознавателя» ОБЪЯСНЕНА, а не просто объявлена', () => {
  // Без объяснения следующий увидит «ничего не делаем» и прочтёт как недоделку,
  // а первым же «улучшением» заведёт автоповтор и с ним невидимый дубль.
  // 🔴 Ищем по СКЛЕЕННОМУ тексту: в README строки переносятся по ширине, и фраза
  // из двух слов рвётся переносом. Проба, ищущая в сыром тексте, краснела бы на
  // верной правке — то есть стерегла бы РАСКЛАДКУ СТРОК вместо смысла.
  const slitno = (x) => x.replace(/\s+/g, ' ');
  if (!/неразрешим/.test(slitno(ru))) throw new Error('в русском нет объяснения неразрешимости');
  if (!/not decidable by machine/.test(slitno(en))) throw new Error('в английском нет объяснения');
});

proba('стенд годен: оба README на месте и непусты', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error('README подозрительно короткие');
});

proba('все природы отказа названы в ОБОИХ README', () => {
  for (const p of PRIRODY) {
    if (!ru.includes(p)) throw new Error('в русском нет природы ' + p);
    if (!en.includes(p)) throw new Error('в английском нет природы ' + p);
  }
});

proba('все ключи настройки описаны в ОБОИХ README', () => {
  for (const k of KLYUCHI) {
    if (!ru.includes(k)) throw new Error('в русском нет ключа ' + k);
    if (!en.includes(k)) throw new Error('в английском нет ключа ' + k);
  }
});

proba('в обоих README есть ЖИВЫЕ примеры вызова, а не только описания', () => {
  const blokovRu = (ru.match(/```js/g) || []).length;
  const blokovEn = (en.match(/```js/g) || []).length;
  if (blokovRu === 0) throw new Error('в русском ни одного примера кода');
  if (blokovEn === 0) throw new Error('в английском ни одного примера кода');
  for (const f of ['zapisat', 'prochitat', 'svodka', 'reshit', 'otmetitOtkaz', 'dostupna']) {
    if (!ru.includes(f + '(')) throw new Error('в русском не показан вызов ' + f);
    if (!en.includes(f + '(')) throw new Error('в английском не показан вызов ' + f);
  }
});
proba('поле веры и различение «пусто ≠ ноль» названы в обоих README', () => {
  if (!/vera/.test(ru) || !/пустота — не ноль|пустоту намеренно/i.test(ru)) throw new Error('русский неполон');
  if (!/vera/.test(en) || !/empty is not zero|never measured/i.test(en)) throw new Error('английский неполон');
});
proba('оба README называют знаемое про логгер — и называют СПОСОБ замера', () => {
  // 🔴 03.09: прежде проба искала слова «не даёт плагину» / «does not give
  // plugins» — то есть требовала от README ЛОЖНОГО утверждения и держала его
  // на месте. Теперь требуем верное: логгер есть, но немой, и указан способ,
  // которым это установлено (иначе следующий читатель поверит на слово).
  if (!/логгер ЕСТЬ|`ctx\.logger`\s*\*\*создаётся/.test(ru)) throw new Error('русский не называет');
  if (!/буфер/.test(ru)) throw new Error('русский не объясняет, почему логгер немой');
  if (!/stend-krik-zvuchit/.test(ru)) throw new Error('русский не называет способ проверки');
  if (!/is created for every Context/.test(en)) throw new Error('английский не называет');
  if (!/ring\s*\n?buffer|ring buffer/.test(en)) throw new Error('английский не объясняет немоту');
  if (!/stend-krik-zvuchit/.test(en)) throw new Error('английский не называет способ проверки');
});
proba('раздел «что настройкой не является» есть в обоих', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
  if (!/NOT configurable/i.test(en)) throw new Error('нет в английском');
});

proba('оба README предупреждают, что часть имён — НАШИ, а не ядра', () => {
  if (!ru.includes('НАШИ')) throw new Error('русский не предупреждает');
  if (!en.includes('OURS')) throw new Error('английский не предупреждает');
});


// ─────────────────────────────────────────────────────────────────────────────
// 🔴 СОСТАВ ПУБЛИКАЦИИ СПРАШИВАЕМ У npm, А НЕ ЧИТАЕМ `files` ГЛАЗАМИ.
// 03.09: у трёх пакетов `files` перечислял стенды ПОФАЙЛОВО, новый стенд в
// перечень не попал — и не уехал бы в публикацию, хотя README на него ссылался.
// Перечень устарел молча. Считать состав по тому же перечню — мерить предмет
// прибором, который и дал сбой; ответ npm честнее, он и уедет к получателю.
function sostavPublikacii() {
  const vyvod = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: koren, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(vyvod)[0].files.map((f) => f.path);
}

proba('🔴 ВСЁ, НА ЧТО ССЫЛАЕТСЯ README, ЛЕЖИТ В СОСТАВЕ ПУБЛИКАЦИИ', () => {
  const sostav = sostavPublikacii();
  const ssylki = new Set();
  for (const t of [ru, en]) {
    for (const m of t.matchAll(/(?:src|test)\/[\w.-]+\.m?js/g)) ssylki.add(m[0]);
    for (const m of t.matchAll(/\bstend-[\w-]+/g)) ssylki.add('test/' + m[0] + '.mjs');
  }
  const poteryany = [...ssylki].filter((f) => !sostav.includes(f));
  if (poteryany.length) {
    throw new Error('README обещает, а в публикации НЕТ: ' + poteryany.join(', ') +
                    ' | состав: ' + sostav.length + ' файлов');
  }
});

proba('🔴 ОБА README НАЗЫВАЮТ ОДИН И ТОТ ЖЕ СПОСОБ ПЕРЕПРОВЕРКИ', () => {
  // 03.09 у нуджа README.md про стенд звука говорил, а README.en.md молчал:
  // два описания одного предмета разошлись, и проба на ссылки этого не ловит —
  // английский просто не ссылался. Ловится только сверкой пары между собой.
  const stendy = (t) => new Set([...t.matchAll(/\bstend-[\w-]+/g)].map((m) => m[0]));
  const a = stendy(ru), b = stendy(en);
  const tolkoRu = [...a].filter((x) => !b.has(x));
  const tolkoEn = [...b].filter((x) => !a.has(x));
  if (tolkoRu.length || tolkoEn.length) {
    throw new Error('README разошлись: только в русском [' + tolkoRu.join(', ') +
                    '], только в английском [' + tolkoEn.join(', ') + ']');
  }
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
