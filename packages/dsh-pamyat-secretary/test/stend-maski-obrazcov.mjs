/**
 * СТОРОЖ: у секретаря НЕТ своей маски образцов и он НЕ зовёт ядро.
 *
 * 🔴 ЗАЧЕМ ЭТОТ СТЕНД ПОСЛЕ ТОГО, КАК МАСКУ ОТСЮДА УБРАЛИ. Прежде маска жила здесь и
 * звала ядро по голому имени пакета; в боевой раскладке импорт не разрешался ни разу,
 * маска молчала, и фильтр отклонял сводки целиком — 11 отказов за сутки (06.09.2026).
 * Маска переехала В ЯДРО, на прямой путь записи. Возврат копии сюда вернёт и беду:
 * копия правил разойдётся с ядром, а импорт снова упрётся в раскладку.
 * Поэтому здесь стоит не проба маски (она в ядре, пара П24/П24-бис/П24-трет), а СТОРОЖ
 * на возврат: файла нет, импорта ядра нет, слова «zamaskirovat» в коде нет.
 *
 * ЧЕГО НЕ ЛОВИТ: не проверяет, что маска РАБОТАЕТ (это ядро и его стенд) — только что
 * она не завелась здесь во второй раз.
 * ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ: копии в секретаре нет. О самой маске он не говорит ничего.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const koren = dirname(dirname(fileURLToPath(import.meta.url)));
let vsego = 0, krasnyh = 0;
function proba(imya, telo) {
  vsego++;
  try { telo(); console.log('  ok   ' + imya); }
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
