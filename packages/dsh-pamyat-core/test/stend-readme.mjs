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

const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
const ru = readFileSync(join(koren, 'README.md'), 'utf8');
const en = readFileSync(join(koren, 'README.en.md'), 'utf8');

let vsego = 0, proshlo = 0;
const proba = (imya, f) => {
  vsego++;
  try { f(); proshlo++; console.log('  ✅ ' + imya); }
  catch (e) { console.log('  ❌ ' + imya + ' — ' + e.message.slice(0, 130)); }
};

const PRIRODY = ['otkazano-chelovekom', 'otmeneno', 'net-kanala', 'net-sluzhby', 'net-agenta', 'ne-predyavleno'];
const KLYUCHI = ['putBazy', 'agent', 'sprashivat', 'chtenieSkolko', 'zhurnalSkolko'];

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

proba('раздел «что настройкой не является» есть в обоих', () => {
  if (!/НЕ является/i.test(ru)) throw new Error('нет в русском');
  if (!/NOT configurable/i.test(en)) throw new Error('нет в английском');
});

proba('оба README предупреждают, что часть имён — НАШИ, а не ядра', () => {
  if (!ru.includes('НАШИ')) throw new Error('русский не предупреждает');
  if (!en.includes('OURS')) throw new Error('английский не предупреждает');
});

console.log('  итог: ' + proshlo + ' из ' + vsego);
process.exit(proshlo === vsego ? 0 : 1);
