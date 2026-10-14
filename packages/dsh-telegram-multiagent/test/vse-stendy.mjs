// RU: Изолированный стенд vse-stendy.mjs: проверяет реальные границы модуля на управляемых входах. Условия внешних сервисов и код слепоты читай в сценариях; прохождение не доказывает живую доставку.
// EN: Isolated harness vse-stendy.mjs: exercises module boundaries using controlled inputs. Read its scenarios for external-service requirements and blind outcomes; passing does not prove live delivery.


import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const katalog = dirname(fileURLToPath(import.meta.url));
// B-N-1678: предел на один стенд — зависший стенд больше не держит весь набор. 300 с = 2× самого долгого замера 05.10
// (stend-mail-stop-expired-delivery нарочно ждёт 150 с под root; под iskra самый долгий stend-pobudki 25 с). VSE_STENDY_PREDEL_S —
// для проб и ручной настройки. Граница: убивается сам стенд (SIGKILL), его внуки — нет; предел не делит время между стендами.
const predelS = Number(process.env.VSE_STENDY_PREDEL_S) > 0 ? Number(process.env.VSE_STENDY_PREDEL_S) : 300;
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
  const r = spawnSync(process.execPath, [join(katalog, s)], { stdio: 'inherit', timeout: predelS * 1000, killSignal: 'SIGKILL' });
  if (r.error?.code === 'ETIMEDOUT') { console.log(`🔴 НЕОЖИДАННО: предел ${predelS} с — ${s}`); ishody.push({ stend: s, kod: 'predel' }); continue; }
  ishody.push({ stend: s, kod: r.status ?? 2 });
}

const razoshlis = ishody.filter((i) => i.kod === 1 || i.kod === 'predel');
const slepye    = ishody.filter((i) => i.kod !== 0 && i.kod !== 1 && i.kod !== 'predel');
console.log(`\n═══ стендов ${stendy.length} · зелёных ${ishody.length - razoshlis.length - slepye.length}`
  + ` · расхождений ${razoshlis.length} · слепота ${slepye.length}`);
console.log(`    область обхода: ${katalog}, шаблон stend-*.mjs — перечень СНЯТ С ДИСКА, не записан`);
for (const i of [...razoshlis, ...slepye]) console.log(`    ${i.kod === 'predel' ? `🔴 НЕОЖИДАННО: предел ${predelS} с` : i.kod === 1 ? '🔴 разошёлся' : '⚠️  слепота'}: ${i.stend}`);


process.exit(razoshlis.length ? 1 : (slepye.length ? 2 : 0));
