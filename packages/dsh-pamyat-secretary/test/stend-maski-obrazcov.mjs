// RU: Стережём отсутствие второй маски образцов в секретаре: нет файла маски, импорта ядра и слова zamaskirovat в коде. Маска принадлежит прямому пути записи ядра; её работу этот стенд не проверяет.
// EN: Guard against a second sample mask in the secretary: no mask file, core import, or zamaskirovat in code. The mask belongs to the core’s direct write path; this suite does not test its operation.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const koren = dirname(dirname(fileURLToPath(import.meta.url)));
let vsego = 0, krasnyh = 0;
const sud = (v) => { if (v !== undefined && v !== true) throw new Error('тело пробы ВЕРНУЛО «' + String(v).slice(0, 60) + '», а обёртка судит по ИСКЛЮЧЕНИЮ: возврат молча зеленел бы (правка 06.09.2026)'); };
function proba(imya, telo) {
  vsego++;
  try { sud(telo()); console.log('  ok   ' + imya); }
  catch (e) { krasnyh++; console.log('  FAIL ' + imya + ' — ' + (e?.message ?? e)); }
}

proba('своего файла маски в пакете НЕТ', () => {
  if (existsSync(join(koren, 'src', 'maska-obrazcov.js'))) {
    throw new Error('src/maska-obrazcov.js вернулся — это вторая копия правил');
  }
});

proba('секретарь НЕ импортирует ядро по имени пакета', () => {
  const src = readFileSync(join(koren, 'src', 'index.js'), 'utf8');
  const stroki = src.split('\n').filter((s) => !s.trimStart().startsWith('//') && !s.trimStart().startsWith('*'));
  const est = stroki.some((s) => /import\(\s*['"]dsh-pamyat-core/.test(s) || /from\s+['"]dsh-pamyat-core/.test(s));
  if (est) throw new Error('импорт ядра вернулся — в боевой раскладке он не разрешается');
});

proba('контроль зрячести: признак импорта ловит подставную строку', () => {
  const podstavnaya = "  import('dsh-pamyat-core/src/filtr-vhoda.js').then(() => {});";
  const est = /import\(\s*['"]dsh-pamyat-core/.test(podstavnaya);
  if (!est) throw new Error('признак слеп: подставной импорт не найден — проба ничего не стережёт');
});

console.log('итог: ' + (vsego - krasnyh) + ' из ' + vsego);
process.exit(krasnyh ? 1 : 0);
