#!/bin/bash
# stend-priznaka-oblasti.sh — пробы к priznak-oblasti-podklyucheniya.sh.
# Всё живёт в подставном каталоге /tmp, боевых путей НЕ касается ни одна проба.
# Каждая порча ПЕЧАТАЕТ факт своего внесения: молчаливая порча неотличима от её отсутствия.
set -u
# №20 аудита 16: прибор — из пакета (../bin), а в раскладке «стенд рядом с прибором» (боевой каталог доработок) —
# сосед; путь одной машины в умолчании не стоит. PRIBOR сильнее обоих.
_d=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
if [ -z "${PRIBOR:-}" ]; then
  PRIBOR="$_d/../bin/priznak-oblasti-podklyucheniya.sh"; [ -f "$PRIBOR" ] || PRIBOR="$_d/priznak-oblasti-podklyucheniya.sh"
fi
B=$(mktemp -d /tmp/proba-oblasti.XXXXXX); trap 'rm -rf "$B"' EXIT
O=$B/obshchij; U=$B/uzel/profiles/web/node_modules
mkdir -p "$O/node_modules" "$U"
for p in alfa beta; do mkdir -p "$O/node_modules/$p"; ln -s "$O/node_modules/$p" "$U/$p"; done
cat > "$O/package.json" <<J
{ "dependencies": { "alfa": "file:alfa.tgz", "beta": "file:beta.tgz" } }
J
# 🔴 Базовая область СОГЛАСОВАНА ЦЕЛИКОМ, и это не мелочь. Первый заход держал в ней
# постоянный каталог-предмет: код был 1 ВСЕГДА, и проба битой ссылки не различала
# «битая роняет в 2» от «не роняет вовсе» — расхождение перекрывало её по приоритету.
# Проба, дающая один ответ при исправном и при сломанном, негодна независимо от цвета.
export OBLAST_OBSHCHIJ=$O OBLAST_UZLY=$B/uzel/profiles

zapusk() { "$PRIBOR" > "$B/vyvod" 2>&1; echo $?; }
chislo() { grep -m1 "$1" "$B/vyvod" | grep -oP ': \K\d+$'; }
vsego=0; zel=0
prob() { # имя · ожидание_кода · ожидание_r1 · r2 · bit · r4
  vsego=$((vsego+1)); k=$(zapusk)
  r1=$(chislo 'подключено, но НЕ объявлено'); r2=$(chislo 'объявлено, но НЕ подключено')
  bt=$(chislo 'подключено, но ЦЕЛИ НЕТ');    r4=$(chislo 'ни объявлено, ни подключено')
  fakt="код=$k r1=$r1 r2=$r2 bit=$bt r4=$r4"; zhdu="код=$2 r1=$3 r2=$4 bit=$5 r4=$6"
  if [ "$fakt" = "$zhdu" ]; then echo "✅ $1 · $fakt"; zel=$((zel+1));
  else echo "❌ $1"; echo "   ждала: $zhdu"; echo "   факт:  $fakt"; sed -n '1,6p' "$B/vyvod" | sed 's/^/   | /'; fi
}

echo "── ИСХОДНОЕ (область согласована целиком: подключено = объявлено)"
prob "исправное молчит, все разряды пусты" 0 0 0 0 0

echo "── ПОРЧА 1: вношу ссылку gamma на каталог общего, НЕ объявленный"
mkdir -p "$O/node_modules/gamma"; ln -s "$O/node_modules/gamma" "$U/gamma"
prob "подключено без объявления → разряд 1" 1 1 0 0 0
rm -f "$U/gamma"; rm -rf "$O/node_modules/gamma"; echo "   (порча 1 снята)"

echo "── ПОРЧА 2: вношу объявление delta БЕЗ подключения"
cat > "$O/package.json" <<J
{ "dependencies": { "alfa": "f", "beta": "f", "delta": "f" } }
J
prob "объявлено без подключения → разряд 2" 1 0 1 0 0
cat > "$O/package.json" <<J
{ "dependencies": { "alfa": "f", "beta": "f" } }
J
echo "   (порча 2 снята)"

echo "── ПОРЧА 3: вношу ссылку epsilon в НЕСУЩЕСТВУЮЩУЮ цель"
ln -s "$O/node_modules/epsilon" "$U/epsilon"
prob "цели нет → отдельный разряд, НЕ в 1 и НЕ в 2, код 2" 2 0 0 1 0
rm -f "$U/epsilon"; echo "   (порча 3 снята)"

echo "── СНЯТИЕ ВСЕХ ПОРЧ: обязано вернуться к исходному"
prob "снятие порчи возвращает прежнее" 0 0 0 0 0

echo "── ПОРЧА 4: кладу каталог-предмет мимо объявления И мимо подключения"
mkdir -p "$O/dsh-goal-marker"
prob "каталог мимо всего → разряд 4" 1 0 0 0 1
rmdir "$O/dsh-goal-marker"; echo "   (порча 4 снята)"

echo "── ПОРЧА 5: натравливаю на ПУСТУЮ область (fail-closed)"
mkdir -p "$B/pusto"; OBLAST_UZLY=$B/pusto prob "пустая область → СЛЕПОТА, код 2" 2 "" "" "" ""

echo "── ПОРЧА 6: объявление есть, но РАЗБОР невозможен (битый json)"
echo '{ это не json' > "$O/package.json"
prob "негодное объявление → СЛЕПОТА, а не «объявлено ноль»" 2 "" "" "" ""

echo
echo "═══ ЗЕЛЁНЫХ $zel ИЗ $vsego · область проб: $B (боевые пути не тронуты)"
[ "$zel" = "$vsego" ] || exit 1
exit 0
