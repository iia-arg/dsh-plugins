#!/bin/bash
# СТЕНД B-N-1464 (03.10.2026, Искра): страховка smontirovat-vypusk ПО СОСТАВУ — маленькая, ровно заменяемые пути + список новых,
# откат по напечатанной строке возвращает боевой каталог побайтно (сумма дерева: пути, типы, права, содержимое).
# Предмет — настоящая пара выпусков дерева: telegram-multiagent 1.5.58 (7ae0e14) → 1.5.59 (ae348a0): 100 общих путей, 2 новых.
# Всё во временном каталоге (бой и страховки — SMV_MONTAZH); /var/backups/montazh и боевые каталоги не трогаются. От iskra.
# Предмет: SMV_TOOL (по умолчанию боевой /usr/local/sbin/smontirovat-vypusk). Порча инструмента: SMV_TOOL=<копия с порчей>.
# ГДЕ СЛЕП: монтаж мимо инструмента; файлы, убранные из состава (монтаж их не удаляет — и страховка не нужна);
#   владелец файлов (от iskra всё своё — права проверяются, владелец нет); правки боя вне состава (их и не страхуем).
set -u
TOOL=${SMV_TOOL:-/usr/local/sbin/smontirovat-vypusk}
FIXTURE=$(dirname -- "$0")/smv_fixture.py
[ -r "$FIXTURE" ] || { echo "СЛЕПОТА: нет fixture $FIXTURE"; exit 2; }
SOURCE_GIT=(sudo -n -u "$(stat -c %U /opt/iskra/workspace/dsh-plugins)" git -C /opt/iskra/workspace/dsh-plugins)
[ -r "$TOOL" ] || { echo "СЛЕПОТА: предмета нет: $TOOL"; exit 2; }
grep -q 'SMV_MONTAZH' "$TOOL" || { echo "СЛЕПОТА: предмет не знает SMV_MONTAZH — прогон задел бы /var/backups/montazh; не запускаю"; exit 2; }
M1=7ae0e14; M2=ae348a0; P=packages/telegram-multiagent
for c in $M1 $M2; do "${SOURCE_GIT[@]}" cat-file -e "$c^{commit}" 2>/dev/null || { echo "СЛЕПОТА: коммита $c в дереве нет"; exit 2; }; done
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root — с B-N-2025 окно монтажа публикует только root (montazh-okno: writer requires root), обход зовёт @root"; exit 2; }
W=$(mktemp -d /tmp/stend-smv-str-XXXXXX) || exit 2
trap 'rm -rf "$W"' EXIT
# B-N-2046: окна монтажа и замок — ЧАСТНЫЕ. С B-N-2025 smontirovat-vypusk берёт ${SMV_ZAMOK:-/run/lock/smontirovat-fajly.lock} и
# открывает окно в ${MO_STATE_DIR:-/var/lib/montazh-okna}: без этого прогон стенда писал окна в БОЕВОЙ каталог (ночь 14.10 — окно
# PORCHA failed → тревога владельцу 04:20Z, ещё 6 открытых). Каталог уходит вместе с $W; перед каждым вызовом — сброс СВОИХ окон.
export MO_STATE_DIR=$W/okna SMV_ZAMOK=$W/zamok; mkdir -m 0755 "$MO_STATE_DIR" || exit 2
zel=0; kras=0
ok(){ echo "✅ $1"; zel=$((zel+1)); }; no(){ echo "❌ $1"; kras=$((kras+1)); }
run(){ rm -f "$MO_STATE_DIR"/*.json; SMV_MONTAZH=$W/mont SMF_RUKA='Stend <stend@sadik>' python3 -B "$FIXTURE" "$W" "$TOOL" "$1" "$P" "$2" -- "$1" "$P" "$2" --v-boj "$3" > "$W/out-$3" 2>&1; echo $?; }
summa(){ (cd "$1" && { find . -printf '%y %m %p\n' | LC_ALL=C sort; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum; }) | sha256sum | cut -c1-16; }
str_of(){ ls "$W/mont/$1"/*.tgz 2>/dev/null | head -1; }
echo "== стенд страховки smontirovat-vypusk $(date -u +%H:%M:%SZ) · предмет $(sha256sum "$TOOL" | cut -c1-8)"

# ── 1. Изменённые и новые файлы в существующих каталогах ──
B=$W/boj1; mkdir -p "$B"
[ "$(run $M1 "$B" OSNOVA1)" = 0 ] || { echo "СЛЕПОТА: основа 1.5.58 не смонтировалась"; tail -3 "$W/out-OSNOVA1"; exit 2; }
echo "чужое, вне состава" > "$B/chuzhoe.txt"
S0=$(summa "$B")
k=$(run $M2 "$B" PROBA1); STR=$(str_of PROBA1)
[ "$k" = 0 ] && [ -n "$STR" ] && [ "${STR%.po-sostavu.tgz}" != "$STR" ] && ok "монтаж 1.5.59 код 0, страховка новой формы: $(basename "$STR")" || no "монтаж/страховка (код $k, «$STR»)"
VZ=$(tar -tzf "$STR" | grep -c '^fajly/.*[^/]$'); NOV=$(tar -xzOf "$STR" NOVYE.txt | LC_ALL=C sort | tr '\n' ' ')
OBSHCH=$("${SOURCE_GIT[@]}" diff --name-status $M1 $M2 -- $P | grep -c '^A')
[ "$VZ" = 100 ] && [ "$NOV" = "src/live-session.js test/stend-live-session-owner.mjs " ] && [ "$OBSHCH" = 2 ] \
  && ok "внутри ровно: заменяемых 100, новые = 2 по git (src/live-session.js, test/stend-live-session-owner.mjs)" || no "состав страховки: заменяемых $VZ, новые «$NOV», по git новых $OBSHCH"
tar -tzf "$STR" | grep -qF 'chuzhoe.txt' && no "чужой файл вне состава попал в страховку" || ok "чужой файл вне состава в страховку не попал"
RAZ=$(stat -c %s "$STR"); [ "$RAZ" -lt 2000000 ] && ok "страховка маленькая: $RAZ Б" || no "страховка $RAZ Б — велика"
grep -q '^откат: tar -xzpf' "$W/out-PROBA1" && tar -xzOf "$STR" STRAHOVKA.txt | grep -q '^откат: tar -xzpf' && ok "строка отката — в выводе и в STRAHOVKA.txt" || no "строки отката нет"
[ "$(summa "$B")" != "$S0" ] && ok "монтаж изменил бой (сумма сменилась)" || no "монтаж не изменил бой — проба бессильна"
OTKAT=$(sed -n 's/^откат: //p' "$W/out-PROBA1" | head -1)
bash -c "$OTKAT"; S1=$(summa "$B")
[ "$S1" = "$S0" ] && ok "откат вернул бой побайтно ($S0)" || no "после отката сумма $S1 ≠ $S0"

# ── 2. Новый файл в НОВОМ каталоге (каталога test/ в бою нет) ──
B=$W/boj2; mkdir -p "$B"
run $M1 "$B" OSNOVA2 >/dev/null; rm -rf "$B/test"; S0=$(summa "$B")
k=$(run $M2 "$B" PROBA2); STR=$(str_of PROBA2)
KAT=$(tar -xzOf "$STR" NOVYE-KATALOGI.txt | tr '\n' ' '); NN=$(tar -xzOf "$STR" NOVYE.txt | grep -c '^test/')
[ "$k" = 0 ] && [ "$KAT" = "test " ] && [ "$NN" -gt 0 ] && ok "новый каталог назван (NOVYE-KATALOGI: test), новых в нём $NN" || no "новый каталог: код $k, «$KAT», $NN"
bash -c "$(sed -n 's/^откат: //p' "$W/out-PROBA2" | head -1)"
[ "$(summa "$B")" = "$S0" ] && [ ! -e "$B/test" ] && ok "откат снял новые файлы и пустой каталог test/ — бой побайтно" || no "после отката бой ≠ до (test/ $( [ -e "$B/test" ] && echo остался || echo снят))"

# ── 3. Порча СТРАХОВКИ: список новых пуст → после отката новый файл остаётся → красное; возврат ──
B=$W/boj3; mkdir -p "$B"; run $M1 "$B" OSNOVA3 >/dev/null; S0=$(summa "$B")
run $M2 "$B" PROBA3 >/dev/null; STR=$(str_of PROBA3); OTKAT=$(sed -n 's/^откат: //p' "$W/out-PROBA3" | head -1)
cp "$STR" "$W/str-cel.tgz"; X=$W/porcha; mkdir -p "$X"; tar -xzpf "$STR" -C "$X"; : > "$X/NOVYE.txt"
tar -czf "$STR" -C "$X" STRAHOVKA.txt NOVYE.txt NOVYE-KATALOGI.txt fajly
echo "   порча внесена: NOVYE.txt в страховке — $(tar -xzOf "$STR" NOVYE.txt | grep -c .) строк (было 2); sha $(sha256sum "$W/str-cel.tgz" | cut -c1-8) → $(sha256sum "$STR" | cut -c1-8)"
bash -c "$OTKAT"
[ "$(summa "$B")" != "$S0" ] && [ -e "$B/src/live-session.js" ] && ok "ПОРЧА видна: без списка новых src/live-session.js остался, сумма ≠ до" || no "порча не видна — стенд слеп"
cp "$W/str-cel.tgz" "$STR"; bash -c "$OTKAT"
[ "$(summa "$B")" = "$S0" ] && ok "ВОЗВРАТ: целая страховка — откат снова побайтно" || no "возврат не вернул бой"

# ── 4. Порча ИНСТРУМЕНТА: список новых не пишется → собственная сверка отказывает, бой не тронут ──
PT=$W/tool-porcha; sed 's|printf '"'"'%s\\n'"'"' "$f" >> "$S/NOVYE.txt"; NOV=$((NOV+1))|NOV=$((NOV+1))|' "$TOOL" > "$PT"
if cmp -s "$TOOL" "$PT"; then no "порча инструмента НЕ ВНЕСЕНА (образец не найден) — проба бессильна"
else
  echo "   порча инструмента внесена: $(diff "$TOOL" "$PT" | grep -c '^>') строка; sha $(sha256sum "$TOOL" | cut -c1-8) → $(sha256sum "$PT" | cut -c1-8)"
  B=$W/boj4; mkdir -p "$B"; run $M1 "$B" OSNOVA4 >/dev/null; S0=$(summa "$B")
  rm -f "$MO_STATE_DIR"/*.json
  k=$(SMV_MONTAZH=$W/mont SMF_RUKA='Stend <stend@sadik>' python3 -B "$FIXTURE" "$W" "$PT" "$M2" "$P" "$B" -- "$M2" "$P" "$B" --v-boj PROBA4 > "$W/out-PROBA4" 2>&1; echo $?)
  [ "$k" = 1 ] && grep -q 'страховка не сошлась' "$W/out-PROBA4" && [ "$(summa "$B")" = "$S0" ] && [ -z "$(str_of PROBA4)" ] \
    && ok "инструмент с порчей: «страховка не сошлась», код 1, бой не тронут, страховки нет" || no "порча инструмента не поймана (код $k)"
fi
echo "ИТОГ: зелёных $zel · красных $kras"
[ "$kras" = 0 ] && exit 0 || exit 1
