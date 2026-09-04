/**
 * Прогон ВСЕХ стендов пакета одной командой.
 *
 * 🔴 ЗАВЕДЁН 04.09.2026 ПО ЗАМЕРУ У ПОЛУЧАТЕЛЯ, а не по вкусу. Прежде `scripts.test`
 * был цепочкой `node A && node B && …`, и у неё два порока, каждый измерен:
 *   1. ПЕРЕЧЕНЬ ВЁЛСЯ РУКОЙ. Он называл шесть стендов из девяти: не звались
 *      stend-filtra-vhoda (31 проба), stend-dolgovremennoj (10), stend-ocheredi-dostavki
 *      (19) — шестьдесят проб самой свежей работы. Здесь перечень СНИМАЕТСЯ С ДИСКА,
 *      поэтому «забыли вписать новый стенд» невозможно по устройству, а не по памяти.
 *   2. `&&` ОБРЫВАЕТ ЦЕПЬ НА ПЕРВОМ НЕНУЛЕВОМ КОДЕ. В чистой установке одного лишь
 *      ядра stend-dolgovremennoj законно слепнет (нет пакета секретаря рядом) и отдаёт
 *      2 — и получатель видел ОДИН стенд из девяти вместо всех. Слепота одной пробы
 *      не повод не проверять остальное.
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
