// RU: npm test обоих пакетов сверяет локальные prichina_stroka побайтно. Нет соседа/определения — код 2, различие — 1, равенство — тихий 0. Проверяются исходники, не корректность функции и не версия загруженного процесса.
// EN: npm test in both packages compares their local prichina_stroka definitions byte for byte. Missing neighbor/definition returns 2, a difference 1, and equality silent 0. This checks source, not function correctness or the loaded process version.
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
    // RU: Экстрактор допускает одно объявление и закрывающую скобку в начале строки. Иная форма даёт отказ проверки, не ложное совпадение.
    // EN: The extractor accepts one declaration and a closing brace at line start. Any other shape fails the check rather than reporting a false match.
    const declarations = [...source.matchAll(/^function prichina_stroka\(e\) \{/gm)];
    if (declarations.length !== 1) throw Error(`${path}: объявлений ${declarations.length}, требуется одно`);
    const start = declarations[0].index;
    const end = source.indexOf('\n}', start);
    if (end < 0) throw Error(`${path}: конец функции не найден`);
    const part = source.slice(start, end + 2);
    new Script(`(${part})`); // RU: Только синтаксическая проверка: код функции не исполняется.
    // EN: Check syntax only; do not execute the function code.
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
