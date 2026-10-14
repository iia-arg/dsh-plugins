#!/usr/bin/env bash
# Стенд согласия слоёв в montazh-iz-tega: после монтажа lock обязан догонять диск.
# 🔴 Всё на ПОДСТАВНОМ каталоге — боевой /opt/agent-plugins не трогается ничем.
set -u
M=${STEND_PRIBOR:-/opt/iskra/workspace/dorabotki/montazh-iz-tega}
S=/opt/iskra/workspace/strahovki-montazha/pereezd-v-obshchij-20260909
RAB=$(mktemp -d); trap 'rm -rf "$RAB"' EXIT
BED=0; VSEGO=0
proba() { VSEGO=$((VSEGO+1)); if [ "$2" = "$3" ]; then echo "  ✅ $1 ($2)"; else BED=$((BED+1)); echo "  🔴 $1 — было «$2», ждали «$3»"; fi; }

# подставная раскладка: дерево a62, lock a62, рядом посторонний каталог (аналог .staryj)
mkdir -p "$RAB/node_modules"
tar -xzf "$S/obshchij-do/dsh-pamyat-core-0.1.0-alpha.62.tgz" -C "$RAB"
mv "$RAB/package" "$RAB/node_modules/dsh-pamyat-core"
mkdir -p "$RAB/node_modules/dsh-pamyat-core.staryj"
echo '{"name":"dsh-pamyat-core-staryj","version":"0.1.0-alpha.50"}' > "$RAB/node_modules/dsh-pamyat-core.staryj/package.json"
echo '{"name":"proba","version":"1.0.0","dependencies":{"dsh-pamyat-core":"0.1.0-alpha.62"}}' > "$RAB/package.json"
( cd "$RAB" && npm i --package-lock-only --silent >/dev/null 2>&1 )

lock_v() { node -p "JSON.parse(require('fs').readFileSync('$RAB/package-lock.json','utf8')).packages['node_modules/dsh-pamyat-core'].version" 2>/dev/null || echo '—'; }
disk_v() { node -p "require('$RAB/node_modules/dsh-pamyat-core/package.json').version" 2>/dev/null || echo '—'; }

echo "── ДО монтажа: слои согласны на старой версии ──"
proba "lock" "$(lock_v)" "0.1.0-alpha.62"
proba "диск" "$(disk_v)" "0.1.0-alpha.62"

echo "── монтаж свежей версии (подставной источник = распакованный тарбол a66) ──"
IST="$RAB/istochnik"; mkdir -p "$IST"
tar -xzf "$S/moj-boj/dsh-pamyat-core-0.1.0-alpha.66.tgz" -C "$RAB" && mv "$RAB/package" "$IST/pkg"
# зовём ТОЛЬКО блок согласия учёта, как он записан в приборе: pack + package-lock-only
TK=$(mktemp -d); ( cd "$TK" && npm pack "$IST/pkg" >/dev/null 2>&1 )
T=$(ls -1 "$TK"/*.tgz | head -1)
cp -a "$IST/pkg/." "$RAB/node_modules/dsh-pamyat-core/"     # аналог rsync монтажа
npm i --package-lock-only --prefix "$RAB" "file:$T" >/dev/null 2>&1
rm -rf "$TK"

echo "── ПОСЛЕ: учёт догнал диск, дерево не разорено ──"
proba "диск стал свежим" "$(disk_v)" "0.1.0-alpha.66"
proba "lock догнал диск"  "$(lock_v)" "0.1.0-alpha.66"
VSEGO=$((VSEGO+1))
[ -d "$RAB/node_modules/dsh-pamyat-core.staryj" ] && echo "  ✅ точка отката .staryj ЦЕЛА" || { echo "  🔴 .staryj снесена"; BED=$((BED+1)); }

echo "── 🔴 контроль: полный npm i снёс бы лишнее (сухой прогон, ничего не меняет) ──"
UD=$(npm i --dry-run --prefix "$RAB" "file:$S/moj-boj/dsh-pamyat-core-0.1.0-alpha.66.tgz" 2>&1 | grep -c '^remove ' || true)
VSEGO=$((VSEGO+1))
[ "$UD" -gt 0 ] && echo "  ✅ полная установка удалила бы $UD пакет(ов) — потому и не зовём" || { echo "  🔴 сухой прогон не показал удалений — контроль недействителен"; BED=$((BED+1)); }

echo "── прибор объявляет согласие учёта строкой ──"
VSEGO=$((VSEGO+1))
grep -q "учёт согласован: package-lock.json" "$M" && echo "  ✅ строка успеха есть" || { echo "  🔴 строки нет"; BED=$((BED+1)); }
VSEGO=$((VSEGO+1))
grep -q "УЧЁТ НЕ СОГЛАСОВАН" "$M" && echo "  ✅ строка отказа есть — молчания нет" || { echo "  🔴 отказ не назван"; BED=$((BED+1)); }

ZHDYOM=8
[ "$VSEGO" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $VSEGO, ЖДЁМ $ZHDYOM"; exit 2; }
echo; echo "итог: $((VSEGO-BED)) из $VSEGO"
[ "$BED" = 0 ]
