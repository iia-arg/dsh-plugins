// RU: Проверяем парный договор: исходные тела prichina_stroka двух пакетов, включая комментарии и пробелы, должны совпадать побайтно. Зовущий — npm test каждого пакета через stend-*.mjs. Коды: 0 — равны, 1 — различие, 2 — нет соседа или известной формы определения. Пригодность функции и код загруженного процесса не проверяются.
// EN: Test the paired contract: both packages’ prichina_stroka source bodies, including comments and whitespace, must be byte-identical. Each package’s npm test invokes it through stend-*.mjs. Codes: 0 equal, 1 different, 2 neighbor or recognized definition shape missing. Function correctness and loaded-process code are not tested.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parent = dirname(packageRoot);
const paths = [resolve(parent, 'dsh-pamyat-omega/src/svyaz.js'),
               resolve(parent, 'dsh-pamyat-secretary/src/distillyaciya.js')];
try {
  if (process.argv.length !== 2) throw Error('аргументы не поддерживаются');
  const parts = paths.map((path) => {
    const source = readFileSync(path, 'utf8');
    // RU: Извлекаем одно объявление с начала строки и закрывающую скобку с начала строки. Незнакомая форма не сравнивается и означает отказ проверки.
    // EN: Extract one declaration at line start and a closing brace at line start. An unknown shape cannot be compared and makes the check unavailable.
    const declarations = [...source.matchAll(/^function prichina_stroka\(e\) \{/gm)];
    if (declarations.length !== 1) throw Error(`${path}: объявлений ${declarations.length}, требуется одно`);
    const start = declarations[0].index;
    const end = source.indexOf('\n}', start);
    if (end < 0) throw Error(`${path}: конец функции не найден`);
    const part = source.slice(start, end + 2);
    new Script(`(${part})`); /* RU: Разбираем синтаксис без исполнения функции.
 * EN: Parse syntax without executing the function.
 */
    return Buffer.from(part, 'utf8');
  });
  if (!parts[0].equals(parts[1])) {
    console.error('РАСХОЖДЕНИЕ prichina_stroka:');
    paths.forEach((p, i) => console.error(`${p}: ${parts[i].length} байт, sha256 ${createHash('sha256').update(parts[i]).digest('hex')}`));
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`СЛЕПОТА prichina_stroka: ${e.message}\nПара: ${paths.join(' ↔ ')}`);
  process.exitCode = 2;
}
