/**
 * Прогон ВСЕХ стендов пакета одной командой.
 *
 * 🔴 ЗАВЕДЁН 04.09.2026 ПО ЗАМЕРУ ЭТОГО ПАКЕТА: `scripts` в манифесте НЕ БЫЛО ВОВСЕ.
 * То есть `npm test` у получателя не гонял НИ ОДНОГО из шести стендов — не «часть»,
 * а ноль. Снаружи это неотличимо от пакета без проверок.
 *
 * Устройство перенесено из dsh-pamyat-core, где оно родилось из своего замера: там
 * перечень вёлся рукой и называл шесть стендов из девяти, а `&&` обрывал цепь на
 * первой законной слепоте. Здесь перечень СНИМАЕТСЯ С ДИСКА, поэтому «забыли вписать
 * новый стенд» невозможно по устройству, а не по памяти.
 *
 * ⚠️ ГДЕ НЕ ПРИМЕНЯЕТСЯ: обход берёт только `stend-*.mjs`. Файл `test-goal-control.mjs`
 * назван иначе и НЕ ЗОВЁТСЯ — это не недосмотр обхода, а несовпадение имени с шаблоном.
 * Переименовать его — отдельная правка с отдельной приёмкой, здесь не делается.
 *
 * ИСХОД: расхождение (1) важнее слепоты (2) — так же, как во всех наших стендах.
 * Слепота отдельного стенда НЕ гасится: она названа в сводке и уходит в код возврата,
 * иначе «проверить нечем» стало бы неотличимо от «проверено».
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const katalog = dirname(fileURLToPath(import.meta.url));
const svoyo = 'vse-stendy.mjs';
const stendy = readdirSync(katalog)
  .filter((f) => f.startsWith('stend-') && f.endsWith('.mjs') && f !== svoyo)
  .sort();

if (!stendy.length) {
  console.log('СЛЕПОТА: стендов рядом не найдено вовсе — прогонять нечего');
  console.log(`  область обхода: ${katalog}, шаблон stend-*.mjs`);
  process.exit(2);
}

const ishody = [];
for (const s of stendy) {
  const r = spawnSync(process.execPath, [join(katalog, s)], { stdio: 'inherit' });
  ishody.push({ stend: s, kod: r.status ?? 2 });
}

const razoshlis = ishody.filter((i) => i.kod === 1);
const slepye    = ishody.filter((i) => i.kod !== 0 && i.kod !== 1);
console.log(`\n═══ стендов ${stendy.length} · зелёных ${ishody.length - razoshlis.length - slepye.length}`
  + ` · расхождений ${razoshlis.length} · слепота ${slepye.length}`);
console.log(`    область обхода: ${katalog}, шаблон stend-*.mjs — перечень СНЯТ С ДИСКА, не записан`);
for (const i of [...razoshlis, ...slepye]) console.log(`    ${i.kod === 1 ? '🔴 разошёлся' : '⚠️  слепота'}: ${i.stend}`);

// Расхождение важнее слепоты: «нашли беду» сильнее, чем «проверить нечем».
process.exit(razoshlis.length ? 1 : (slepye.length ? 2 : 0));
