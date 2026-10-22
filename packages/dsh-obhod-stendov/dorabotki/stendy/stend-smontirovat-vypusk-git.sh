#!/bin/bash
# СТЕНД B-N-1263 (30.09.2026, Искра): учёт git в smontirovat-vypusk — коммит ТОЛЬКО путей состава, рука, коды 0/5.
# Всё на временном репозитории и временном каталоге страховок (SMV_MONTAZH); предмет — настоящий пакет дерева
# (набор dsh-pamyat: метки-коммиты 0a11d7c = a80, 755e4f4 = a79). Боевые каталоги и /var/backups/montazh не трогаются.
# Запуск: от root (корень git должен принадлежать root, как у /opt/agent-plugins). Не root — СЛЕПОТА, код 2.
# Предмет: SMV_TOOL (по умолчанию боевой /usr/local/sbin/smontirovat-vypusk).
# ГДЕ СЛЕП: монтаж мимо инструмента; корень git под чужим владельцем (ветка есть, проба — нет); удаление файлов из состава.
set -u
TOOL=${SMV_TOOL:-/usr/local/sbin/smontirovat-vypusk}
FIXTURE=$(dirname -- "$0")/smv_fixture.py
[ -r "$FIXTURE" ] || { echo "СЛЕПОТА: нет fixture $FIXTURE"; exit 2; }
SOURCE_GIT=(sudo -n -u "$(stat -c %U /opt/iskra/workspace/dsh-plugins)" git -C /opt/iskra/workspace/dsh-plugins)
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: стенд нужен от root (корень git — root, как в бою)"; exit 2; }
[ -r "$TOOL" ] || { echo "СЛЕПОТА: предмета нет: $TOOL"; exit 2; }
# Предохранитель: предмет без SMV_MONTAZH положил бы страховки прогона в НАСТОЯЩИЙ /var/backups/montazh (так и вышло 30.09 19:20Z на основе).
grep -q 'SMV_MONTAZH' "$TOOL" || { echo "СЛЕПОТА: предмет не знает SMV_MONTAZH — прогон задел бы /var/backups/montazh; не запускаю"; exit 2; }
M1=0a11d7c; M2=755e4f4; P=packages/dsh-pamyat
"${SOURCE_GIT[@]}" cat-file -e "$M1^{commit}" 2>/dev/null && "${SOURCE_GIT[@]}" cat-file -e "$M2^{commit}" 2>/dev/null \
  || { echo "СЛЕПОТА: коммитов $M1/$M2 в дереве нет — предмета нет"; exit 2; }
W=$(mktemp -d /tmp/stend-smv-git-XXXXXX) || exit 2
trap 'rm -rf "$W"' EXIT
# B-N-2046: окна монтажа и замок — ЧАСТНЫЕ. С B-N-2025 smontirovat-vypusk берёт ${SMV_ZAMOK:-/run/lock/smontirovat-fajly.lock} и
# открывает окно в ${MO_STATE_DIR:-/var/lib/montazh-okna}: без этого прогон стенда писал окна в БОЕВОЙ каталог (ночь 14.10 — окно
# PORCHA failed → тревога владельцу 04:20Z, ещё 6 открытых). Каталог уходит вместе с $W; перед каждым вызовом — сброс СВОИХ окон.
export MO_STATE_DIR=$W/okna SMV_ZAMOK=$W/zamok; mkdir -m 0755 "$MO_STATE_DIR" || exit 2
R0=$W/repo; B=$R0/node_modules/dsh-pamyat; mkdir -p "$B" "$W/montazh"
git -C "$R0" init -q && echo "*.tgz" > "$R0/.gitignore" && git -C "$R0" add .gitignore \
  && git -C "$R0" -c user.name=S -c user.email=s@s commit -qm init || { echo "СЛЕПОТА: временный репозиторий не создан"; exit 2; }
echo "чужое" > "$R0/chuzhoe.txt"
zel=0; kras=0
ok(){ echo "✅ $1"; zel=$((zel+1)); }; no(){ echo "❌ $1"; kras=$((kras+1)); }
run(){ rm -f "$MO_STATE_DIR"/*.json; SMV_MONTAZH=$W/montazh SMF_RUKA='Stend <stend@sadik>' python3 -B "$FIXTURE" "$W" "$TOOL" "$1" "$P" "$2" -- "$1" "$P" "$2" --v-boj "$3" > "$W/out" 2>&1; echo $?; }
h0=$(git -C "$R0" rev-parse HEAD)
k=$(run $M1 "$B" PROBA-1263); msg=$(git -C "$R0" log -1 --format=%s); au=$(git -C "$R0" log -1 --format='%an <%ae>')
n=$(git -C "$R0" show --stat --format= HEAD | grep -c '|')
[ "$k" = 0 ] && [ "$(git -C "$R0" rev-parse HEAD)" != "$h0" ] && [ "$msg" = "dsh-pamyat 0.1.0-alpha.80 = $M1 (PROBA-1263) · smontirovat-vypusk" ] \
  && [ "$au" = "Stend <stend@sadik>" ] && [ "$n" = 7 ] && grep -q 'чужих незафиксированных 1' "$W/out" \
  && [ -n "$(git -C "$R0" status --porcelain -- chuzhoe.txt)" ] \
  && ok "С1 исправное: код 0, коммит «$msg», рука Stend, путей 7, чужой файл не тронут и назван" \
  || { no "С1 исправное: код $k, «$msg», рука $au, путей $n"; tail -3 "$W/out" | sed 's/^/     /'; }
h1=$(git -C "$R0" rev-parse HEAD)
k=$(run $M1 "$B" PROBA-1263b)
# B-N-2046: с B-N-2025 R2 (65f48729) повтор без изменений — код 3 «БЕЗ ИЗМЕНЕНИЙ» до окна/страховки/учёта (прежде 0 «состав = закоммиченному»).
[ "$k" = 3 ] && [ "$(git -C "$R0" rev-parse HEAD)" = "$h1" ] && grep -q '^БЕЗ ИЗМЕНЕНИЙ' "$W/out" \
  && ok "С2 повтор: код 3, «БЕЗ ИЗМЕНЕНИЙ», нового коммита нет" || no "С2 повтор: код $k"
: > "$R0/.git/index.lock"; echo "порча внесена: .git/index.lock $( [ -e "$R0/.git/index.lock" ] && echo есть || echo НЕТ)"
k=$(run $M2 "$B" PROBA-1263c)
v=$(node -p "require('$B/package.json').version" 2>/dev/null)
[ "$k" = 5 ] && [ "$v" = 0.1.0-alpha.79 ] && grep -q 'монтаж В СИЛЕ' "$W/out" && grep -q '✅ СМОНТИРОВАНО' "$W/out" \
  && ok "С3 порча (индекс заперт): код 5, «монтаж В СИЛЕ», в каталоге a79" || { no "С3 порча: код $k, версия $v"; tail -3 "$W/out" | sed 's/^/     /'; }
rm -f "$R0/.git/index.lock"
k=$(run $M2 "$B" PROBA-1263d); msg=$(git -C "$R0" log -1 --format=%s)
[ "$k" = 0 ] && [ "$msg" = "dsh-pamyat 0.1.0-alpha.79 = $M2 (PROBA-1263d) · smontirovat-vypusk" ] \
  && ok "С4 возврат: код 0, коммит «$msg»" || no "С4 возврат: код $k, «$msg»"
NB=$W/nogit/dsh-pamyat; mkdir -p "$NB"
k=$(run $M1 "$NB" PROBA-1263e)
[ "$k" = 0 ] && grep -q 'вне git — учёта нет' "$W/out" && ok "С5 вне git: код 0, «учёта нет»" || { no "С5 вне git: код $k"; tail -2 "$W/out" | sed 's/^/     /'; }
echo "ИТОГ: зелёных $zel · красных $kras"
[ "$kras" = 0 ] || exit 1
exit 0
