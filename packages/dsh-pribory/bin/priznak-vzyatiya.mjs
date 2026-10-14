// Признак взятия: что РАЗРЕШИТСЯ по имени из заданного корня, и какая там версия.
// 🔴 Резолвим ГЛАВНЫЙ ВХОД, а не '<имя>/package.json': у пакетов с полем exports
// подпуть ./package.json закрыт, и запрос к нему даёт ложное «не разрешается» —
// ответ про запрос, а не про предмет. Проверено 04.09.2026 на nudzh и byudzhet.
//
// ГРАНИЦА ЧИСЛОМ (05.09.2026, сверено двумя руками, у соседа — в двух корнях):
// поле exports объявлено РОВНО У ДВУХ пакетов из одиннадцати с манифестом —
// dsh-pamyat-byudzhet и dsh-pamyat-nudzh, у обоих exports = { ".": "./src/index.js" }.
// У остальных девяти манифест разрешается свободно, и прежний способ на них НЕ врал.
// Число здесь не украшение: без него читатель решит, что все прежние замеры версий
// негодны, и перемеряет девять пакетов зря. Формулировка соседа, принята.
//
// ⚠️ Число проверять, а не помнить: появится exports у третьего пакета — граница сместится
// молча. Снять заново:
//   for d in <репозиторий>/packages/*/; do node -p "JSON.stringify(require('./$d/package.json').exports ?? null)"; done
// EN: Resolution sign: what WILL RESOLVE by name from the given root, and which version is there.
//     🔴 We resolve the MAIN ENTRY, not '<name>/package.json': for packages with an exports field the
//     ./package.json subpath is closed, and a request for it gives a false "does not resolve" — an answer about
//     the request, not about the subject. Checked 04.09.2026 on nudzh and byudzhet.
//     A BOUNDARY AS A NUMBER (05.09.2026, cross-checked by two hands, at the neighbour's — in two roots): the
//     exports field is declared by EXACTLY TWO of the eleven packages with a manifest — dsh-pamyat-byudzhet and
//     dsh-pamyat-nudzh, both with exports = { ".": "./src/index.js" }. For the other nine the manifest resolves
//     freely, and the previous method did NOT lie on them. The number here is not decoration: without it the
//     reader decides that all previous version measurements are invalid and re-measures nine packages for
//     nothing. The neighbour's wording, accepted.
//     ⚠️ Check the number, do not remember it: if a third package gets exports, the boundary shifts silently.
//     To re-take it:
//     for d in <repository>/packages/*/; do node -p "JSON.stringify(require('./$d/package.json').exports ??
//     null)"; done
import { createRequire } from 'node:module';
import { readFileSync, statSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const koren = process.argv[2];
const imena = process.argv.slice(3);

// 🔴 БЕЗ АРГУМЕНТОВ — ОТКАЗ С ПОДСКАЗКОЙ, А НЕ ПАДЕНИЕ (05.09.2026). Прежде прибор падал
// стектрейсом «path must be of type string», и это читалось как поломка ПРЕДМЕТА, а не как
// «меня позвали не так». Поймано перед раздачей соседям: они получили бы падение первым же
// запуском и решили бы, что сломан их узел.
// Умолчания НЕТ намеренно: корень разрешения — главное, что этот прибор измеряет, и
// подставить его молча значило бы ответить про чужой корень с уверенным видом. У нас это
// уже случилось сегодня: срез сняли из каталога соседа и назвали составом своего узла.
// EN: 🔴 WITHOUT ARGUMENTS — A REFUSAL WITH A HINT, NOT A CRASH (05.09.2026). Previously the tool crashed with
//     the stack trace "path must be of type string", and that read as a breakage of the SUBJECT, not as "I was
//     called wrongly". Caught before handing it out to neighbours: they would have got a crash on the very
//     first run and decided their node was broken.
//     There is NO default on purpose: the resolution root is the main thing this tool measures, and filling it
//     in silently would answer about someone else's root with a confident look. That already happened to us
//     today: a snapshot was taken from the neighbour's directory and called the composition of our own node.
if (!koren || imena.length === 0) {
  console.log('признак взятия: что РАЗРЕШИТСЯ по имени из заданного корня и какая там версия.');
  console.log('');
  console.log('  node priznak-vzyatiya.mjs <корень> <имя> [<имя>…]');
  console.log('');
  console.log('  корень — каталог, ОТ КОТОРОГО идёт разрешение: профиль службы, общий каталог.');
  console.log('           Умолчания нет: ответ про чужой корень выглядит так же уверенно.');
  console.log('  пример: node priznak-vzyatiya.mjs /opt/<агент>/.dsh/profiles/web dsh-pamyat-core');
  process.exit(2);
}

try { if (!statSync(koren).isDirectory()) throw new Error('не каталог'); accessSync(koren, constants.R_OK | constants.X_OK) } catch (e) { console.error('СЛЕПОТА: корень ' + koren + ': ' + e.message); process.exit(2) }
let neRazreshilos = false;
const trebuj = createRequire(join(resolve(koren), 'nesushchestvuyushchij.js'));

const versiya = (put) => {
  let d = dirname(put);
  for (let i = 0; i < 8; i++) {
    try { return [JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).version, d]; }
    catch { d = dirname(d); }
  }
  return ['версия не найдена', '?'];
};

console.log('корень разрешения: ' + koren);
for (const imya of imena) {
  try {
    const put = trebuj.resolve(imya);
    const [v, kat] = versiya(put);
    console.log('  ' + imya.padEnd(24) + String(v).padEnd(17) + kat);
  } catch (e) {
    neRazreshilos = true;
    console.log('  ' + imya.padEnd(24) + 'НЕ РАЗРЕШАЕТСЯ    ' + (e.code ?? e.message));
  }
}

process.exit(neRazreshilos ? 1 : 0);
