/** Стенд документации: оба README растут вместе. Правило без проверки держится
 *  на памяти автора и ломается в первом же цикле правок — проверено на соседях. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
const ru = readFileSync(join(koren, 'README.md'), 'utf8');
const en = readFileSync(join(koren, 'README.en.md'), 'utf8');
let vsego = 0, proshlo = 0;
const proba = (i, f) => { vsego++; try { f(); proshlo++; console.log('  ✅ ' + i); } catch (e) { console.log('  ❌ ' + i + ' — ' + e.message.slice(0,120)); } };

proba('стенд годен: оба README непусты', () => {
  if (ru.length < 1000 || en.length < 1000) throw new Error('слишком короткие');
});
proba('ключи настройки описаны в обоих', () => {
  for (const k of ['klass', 'vklyuchen']) {
    if (!ru.includes(k) || !en.includes(k)) throw new Error('нет ключа ' + k);
  }
});
proba('оба говорят, что пакет НЕ пишет в сессию', () => {
  if (!/не пишет в сессию/i.test(ru)) throw new Error('русский не говорит');
  if (!/does not write into the session/i.test(en)) throw new Error('английский не говорит');
});
proba('оба разделяют «доказан механизм» и «содержание не доказано»', () => {
  if (!/МЕХАНИЗМ/.test(ru) || !/СОДЕРЖАНИЕ не доказано/.test(ru)) throw new Error('русский неполон');
  if (!/MECHANISM proven/.test(en) || !/CONTENT is not proven/.test(en)) throw new Error('английский неполон');
});
proba('оба называют обязательность inject', () => {
  if (!/inject/.test(ru) || !/inject/.test(en)) throw new Error('inject не назван');
});
proba('оба объясняют, почему вывод идёт не через службу логгера', () => {
  if (!/свой транспорт/.test(ru)) throw new Error('русский не объясняет');
  if (!/own transport/.test(en)) throw new Error('английский не объясняет');
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
