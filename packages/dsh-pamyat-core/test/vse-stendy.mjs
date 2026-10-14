// RU: Запускаем все стенды, найденные на диске, и продолжаем после ненулевого кода. Ручной перечень забывает новые файлы, && останавливается на первом отказе или слепоте. Итог сохраняет слепоту с кодом 2, но расхождение с кодом 1 имеет приоритет.
// EN: Run every suite discovered on disk and continue after nonzero exits. A manual list omits new files; && stops at the first failure or unobservable result. The summary preserves unobservable status as code 2, but mismatch code 1 takes precedence.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const katalog = dirname(fileURLToPath(import.meta.url));
const svoyo = 'vse-stendy.mjs';
const stendy = readdirSync(katalog)
  .filter((f) => f.startsWith('stend-') && f.endsWith('.mjs') && f !== svoyo)
  .sort();

// RU: Называем соседние файлы вне маски запуска: ошибочное имя может скрыть стенд. Это список для разбора, а не автоматический отказ.
// EN: Report neighboring files outside the execution pattern: a misspelled name can hide a suite. This is a list for investigation, not an automatic failure.
const mimo = readdirSync(katalog)
  .filter((f) => f.endsWith('.mjs') && f !== svoyo && !f.startsWith('stend-'));
if (mimo.length) {
  console.log(`⚠️  рядом лежат .mjs НЕ по образцу «stend-*» и потому не гоняются: ${mimo.join(', ')}`);
  console.log('   Это не отказ: переименуйте, если это стенд, либо не обращайте внимания.');
}

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
// RU: Число файлов вне маски включаем в итог. Код 1 не ставим: среди них могут быть законные вспомогательные модули.
// EN: Include the count of files outside the pattern in the summary. Do not set code 1: they may be legitimate helper modules.
const hvost_mimo = mimo.length ? ` · ${mimo.length} ${mimo.length === 1 ? 'файл' : 'файлов'} рядом НЕ гонялся` : '';
console.log(`\n═══ стендов ${stendy.length} · зелёных ${ishody.length - razoshlis.length - slepye.length}`
  + ` · расхождений ${razoshlis.length} · слепота ${slepye.length}${hvost_mimo}`);
if (mimo.length) console.log(`    рядом мимо образца: ${mimo.join(', ')} — переименуйте, если это стенды`);
console.log(`    область обхода: ${katalog}, шаблон stend-*.mjs — перечень СНЯТ С ДИСКА, не записан`);
for (const i of [...razoshlis, ...slepye]) console.log(`    ${i.kod === 1 ? '🔴 разошёлся' : '⚠️  слепота'}: ${i.stend}`);

// RU: Расхождение с кодом 1 имеет приоритет над слепотой с кодом 2.
// EN: Mismatch code 1 takes precedence over unobservable code 2.
process.exit(razoshlis.length ? 1 : (slepye.length ? 2 : 0));
