#!/bin/bash
# Сверка НЕЗАЯВЛЕННЫХ зависимостей наших плагинов от дерева платформы.
#
# ЗАЧЕМ. Наши плагины (mcp-bridge, claude-oauth) держат node_modules
# СИМВОЛИЧЕСКОЙ ССЫЛКОЙ на /opt/iskra/app/node_modules и импортируют оттуда
# пакеты платформы, не объявляя их в своём package.json. Пакеты транзитивные:
# их тянет @deepseek-ai/dsh, а не мы. Значит обновление платформы вправе их
# переместить, переименовать или сменить им мажор — и наш плагин перестанет
# монтироваться. Снаружи это тихо: служба поднимется, health ответит 200,
# а модель останется без инструментов.
#
# ГДЕ НЕ ПРИМЕНЯЕТСЯ И КОГДА ОСТАНАВЛИВАЕТСЯ. Скрипт только читает и только
# разрешает имена пакетов. Ничего не ставит, не правит и не перезапускает.
# Он проверяет РАЗРЕШИМОСТЬ имени, а не совместимость версии: пакет на месте,
# но с другим поведением — этого он не увидит и не претендует.
#
# Код возврата: 0 — все разрешились, 1 — что-то не разрешилось,
#               2 — СЛЕПОТА (не нашла ни одного импорта или нет файла плагина).
set -u
# №15 аудита 16 (10.10.2026): перечень плагинов — SVERKA_PLAGINY (каталоги через пробел), умолчания НЕТ:
# прежде в коде стояли два каталога одной машины, и на любой другой прибор был слеп всегда.
[ -n "${SVERKA_PLAGINY:-}" ] || { echo "СЛЕПОТА: перечень плагинов не задан (SVERKA_PLAGINY пуст) — сверять нечего."; exit 2; }
export SVERKA_PLAGINY

exec node -e '
const fs = require("fs"), path = require("path"), { createRequire } = require("module");
const plugins = process.env.SVERKA_PLAGINY.split(/\s+/).filter(Boolean);
let bad = 0, seen = 0, slepota = 0;

for (const p of plugins) {
  const main = path.join(p, "src/index.js");
  if (!fs.existsSync(main)) { console.log("СЛЕПОТА — нет файла плагина: " + main); slepota++; continue; }
  const src = fs.readFileSync(main, "utf8");
  const imports = [...src.matchAll(/from\s+[\x27"]([^\x27"]+)[\x27"]/g)].map(m => m[1])
    .filter(s => !s.startsWith("node:") && !s.startsWith("."));
  if (imports.length === 0) {
    // Ноль импортов у плагина, который заведомо их имел, — это ответ про наш
    // образец, а не про плагин. Молчать об этом нельзя.
    console.log("СЛЕПОТА — в " + main + " не нашлось ни одного внешнего импорта");
    slepota++; continue;
  }
  const req = createRequire(main);
  for (const i of imports) {
    seen++;
    try { console.log("  есть  " + path.basename(p) + "  " + i + "  ->  " + req.resolve(i)); }
    catch (e) { console.log("  НЕТ   " + path.basename(p) + "  " + i + "  — " + (e.code || e.message)); bad++; }
  }
}

if (slepota) { console.log(`ЗАВИСИМОСТИ: СЛЕПОТА (${slepota}) — проверка перестала попадать в код`); process.exit(2); }
if (bad)     { console.log(`ЗАВИСИМОСТИ: РАЗОШЛИСЬ — не разрешились ${bad} из ${seen}`); process.exit(1); }
console.log(`ЗАВИСИМОСТИ: сходится — незаявленных ${seen}, все разрешились`);
'
