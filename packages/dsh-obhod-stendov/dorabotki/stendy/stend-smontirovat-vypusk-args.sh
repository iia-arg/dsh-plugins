#!/bin/bash
# СТЕНД B-N-1401 (02.10.2026, Искра): разбор аргументов smontirovat-vypusk — строго, до любых действий.
# Повод: 6-й «--progon» молча проигнорирован → задуманный прогон стал боевым монтажом (obsluzhivanie a9, 02.10 03:22:30Z).
# Всё на временном: «бой» — пустой временный каталог, страховки — временный SMV_MONTAZH; предмет — настоящий пакет
# дерева (набор dsh-pamyat, коммит 0a11d7c). Боевые каталоги и /var/backups/montazh не трогаются. Root не нужен.
# Предмет: SMV_TOOL (по умолчанию боевой /usr/local/sbin/smontirovat-vypusk).
# ГДЕ СЛЕП: разбор, который принимает форму, но исполняет иначе, чем названо в выводе (проверяем по следу на диске:
# файлы в «бою» и страховки — только у --v-boj); вызовы мимо инструмента.
set -u
TOOL=${SMV_TOOL:-/usr/local/sbin/smontirovat-vypusk}
FIXTURE=$(dirname -- "$0")/smv_fixture.py
[ -r "$FIXTURE" ] || { echo "СЛЕПОТА: нет fixture $FIXTURE"; exit 2; }
SOURCE_GIT=(sudo -n -u "$(stat -c %U /opt/iskra/workspace/dsh-plugins)" git -C /opt/iskra/workspace/dsh-plugins)
[ -r "$TOOL" ] || { echo "СЛЕПОТА: предмета нет: $TOOL"; exit 2; }
grep -q 'SMV_MONTAZH' "$TOOL" || { echo "СЛЕПОТА: предмет не знает SMV_MONTAZH — --v-boj задел бы /var/backups/montazh; не запускаю"; exit 2; }
M=0a11d7c; P=packages/dsh-pamyat
"${SOURCE_GIT[@]}" cat-file -e "$M^{commit}" 2>/dev/null || { echo "СЛЕПОТА: коммита $M в дереве нет"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root — с B-N-2025 окно монтажа публикует только root (montazh-okno: writer requires root), обход зовёт @root"; exit 2; }
W=$(mktemp -d /tmp/stend-smv-args-XXXXXX) || exit 2
trap 'rm -rf "$W"' EXIT
# B-N-2046: окна монтажа и замок — ЧАСТНЫЕ. С B-N-2025 smontirovat-vypusk берёт ${SMV_ZAMOK:-/run/lock/smontirovat-fajly.lock} и
# открывает окно в ${MO_STATE_DIR:-/var/lib/montazh-okna}: без этого прогон стенда писал окна в БОЕВОЙ каталог (ночь 14.10 — окно
# PORCHA failed → тревога владельцу 04:20Z, ещё 6 открытых). Каталог уходит вместе с $W; перед каждым вызовом — сброс СВОИХ окон.
export MO_STATE_DIR=$W/okna SMV_ZAMOK=$W/zamok; mkdir -m 0755 "$MO_STATE_DIR" || exit 2
ok=0; bed=0; vsego=0
sud(){ vsego=$((vsego+1)); if [ "$2" = 1 ]; then ok=$((ok+1)); echo "  ✅ $1"; else bed=$((bed+1)); echo "  🔴 $1 — $3"; fi; }
# run <имя> <аргументы…>: свежий «бой» и каталог страховок; печатает код; след — файлов в бою и страховок
run(){ local n=$1; shift; rm -rf "$W/boj" "$W/mont"; rm -f "$MO_STATE_DIR"/*.json; mkdir -p "$W/boj" "$W/mont"
  SMV_MONTAZH=$W/mont SMF_RUKA='Stend <stend@sadik>' python3 -B "$FIXTURE" "$W" "$TOOL" "$M" "$P" "$W/boj" -- "$@" > "$W/out-$n" 2>&1; echo $?; }
sled(){ echo "$(find "$W/boj" -type f | wc -l)/$(find "$W/mont" -type f | wc -l)"; }   # файлов в бою / страховок
B=$W/boj
echo "== стенд разбора аргументов smontirovat-vypusk $(date -u +%H:%M:%SZ) · предмет $(sha256sum "$TOOL" | cut -c1-8)"

# отказы: код 2, след 0/0, в выводе подсказка формы
otk(){ local n=$1 opis=$2; shift 2; local k; k=$(run "$n" "$@"); local s; s=$(sled)
  sud "$opis → ОТКАЗ код 2, след 0/0, подсказка формы" \
    "$([ "$k" = 2 ] && [ "$s" = 0/0 ] && grep -q 'форма: smontirovat-vypusk' "$W/out-$n" && echo 1)" \
    "код $k, след $s: $(tail -1 "$W/out-$n" | cut -c1-140)"; }
otk incident "случай 02.10: <м> <п> <б> --v-boj ПУНКТ --progon (оба режима)" "$M" "$P" "$B" --v-boj PROBA-1401 --progon
otk lishnij "лишний позиционный: <м> <п> <б> lishnij"  "$M" "$P" "$B" lishnij
otk staraya "старая позиционная форма с 5-м без ключа: <м> <п> <б> --progon PUNKT" "$M" "$P" "$B" --progon PROBA-1401
otk neznak  "незнакомый ключ --dry-run"                "$M" "$P" "$B" --dry-run
otk n       "незнакомый ключ -n"                       "$M" "$P" "$B" -n
otk bezpunkta "--v-boj без пункта"                     "$M" "$P" "$B" --v-boj
otk punktflag "--v-boj --progon (пункт похож на ключ)" "$M" "$P" "$B" --v-boj --progon
otk dvazhdy "--progon дважды"                          "$M" "$P" "$B" --progon --progon
otk malo    "позиционных два"                          "$M" "$P"

# допустимые формы
k=$(run umolch "$M" "$P" "$B"); s=$(sled)
sud "без режима → ПРОГОН (код 0, «бой не тронут», след 0/0)" "$([ "$k" = 0 ] && grep -q 'ПРОГОН, бой не тронут' "$W/out-umolch" && [ "$s" = 0/0 ] && echo 1)" "код $k, след $s"
k=$(run progon "$M" "$P" "$B" --progon); s=$(sled)
sud "--progon → ПРОГОН (код 0, след 0/0)" "$([ "$k" = 0 ] && grep -q 'ПРОГОН, бой не тронут' "$W/out-progon" && [ "$s" = 0/0 ] && echo 1)" "код $k, след $s"
k=$(run vperedi --progon "$M" "$P" "$B"); s=$(sled)
sud "ключ впереди: --progon <м> <п> <б> → ПРОГОН (код 0, след 0/0)" "$([ "$k" = 0 ] && grep -q 'ПРОГОН, бой не тронут' "$W/out-vperedi" && [ "$s" = 0/0 ] && echo 1)" "код $k, след $s"
k=$(run vboj "$M" "$P" "$B" --v-boj PROBA-1401); s=$(sled)
sud "действующая форма --v-boj ПУНКТ → СМОНТИРОВАНО (код 0), файлы в бою и 1 страховка" \
  "$([ "$k" = 0 ] && grep -q 'СМОНТИРОВАНО' "$W/out-vboj" && [ "${s%/*}" -gt 0 ] && [ "${s#*/}" = 1 ] && echo 1)" "код $k, след $s"

# B-N-1403: подмены из окружения названы ПЕРВЫМИ строками (run подаёт SMV_MONTAZH и SMF_RUKA) — и при прогоне, и при отказе
sud "подмены названы: первые строки «⚠️ ПОДМЕНА: SMV_MONTAZH=…» и «…SMF_RUKA=…» (прогон и отказ)" \
  "$([ "$(head -2 "$W/out-umolch")" = "⚠️ ПОДМЕНА: SMV_MONTAZH=$W/mont"$'\n'"⚠️ ПОДМЕНА: SMF_RUKA=Stend <stend@sadik>" ] && grep -q '^⚠️ ПОДМЕНА: SMV_MONTAZH=' "$W/out-incident" && echo 1)" \
  "первые строки: $(head -2 "$W/out-umolch" | tr '\n' '|')"

echo; echo "итог: $ok из $vsego"
ZHDYOM=14
[ "$vsego" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $vsego, ждём $ZHDYOM"; exit 2; }
[ "$bed" = 0 ]
