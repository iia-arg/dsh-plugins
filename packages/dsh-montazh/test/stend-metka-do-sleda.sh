#!/bin/bash
# RU: stend-metka-do-sleda.sh — пробы B-N-2115(б): «метка уже есть» проверяется ДО записи следа ворот, в режиме npm.
# RU: Прежде ворота в режиме npm писали строку следа и на уже стоящую метку (dsh-autopilot-v0.1.9, 18.10: вывод ec308f8d).
# RU: Всё на копии: временное дерево git с npm-пакетом, временный журнал следа (root, как в бою), подставные реестр копий,
# RU: перечень и область стендов для обходчика; боевой журнал /var/lib/vypusk-tegom НЕ трогается (VYPUSK_ZHURNAL_DIR свой).
# RU: Пробы (ожидание — до запуска): Т1 исправное → «✅», код 0, строк следа +1 · Т2 метка по каталогу есть → ОТКАЗ код 1,
# RU: строк следа +0, «✅» нет · Т3 метка по имени пакета есть → то же · Т4 метки сняты → снова «✅», +1.
# RU: Доводы: $1 ворота (умолч. ../bin/vypusk-tegom), $2 помощник следа (умолч. ../libexec/vypusk-tegom/zhurnal-zapis).
# RU: Нужен sudo -n (помощник — под root). Коды: 0 все сошлись · 1 расхождение · 2 слепота.
# EN: Probes B-N-2115(b): the "tag already exists" check runs BEFORE the gate trace is written, in npm mode. On a temp git
# EN: tree with its own trace journal; the production journal is not touched. Codes: 0 passed · 1 mismatch · 2 blind.
set -u
K=$(cd "$(dirname "$0")/.." && pwd)
VOROTA="${1:-$K/bin/vypusk-tegom}"; ZAPIS="${2:-$K/libexec/vypusk-tegom/zhurnal-zapis}"
OBH="${STEND_OBHODCHIK:-/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh}"
VOROTA=$(realpath -m -- "$VOROTA"); ZAPIS=$(realpath -m -- "$ZAPIS")   # ворота зовутся из каталога пакета — относительный довод потерялся бы
for f in "$VOROTA" "$ZAPIS"; do [ -x "$f" ] || { echo "СЛЕПОТА: не исполняется $f"; exit 2; }; done
[ -r "$OBH" ] || { echo "СЛЕПОТА: обходчик $OBH не читается"; exit 2; }
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нужен sudo -n (помощник следа — под root)"; exit 2; }
B=$(mktemp -d "${TMPDIR:-/var/tmp}/stend-metka-do-sleda.XXXXXX") || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
ZD="$B/zhurnal"; sudo -n install -d -o root -g root -m 0755 "$ZD" || { echo "СЛЕПОТА: журнал следа не создан"; exit 2; }
trap 'sudo -n rm -rf -- "$ZD"; rm -rf -- "$B"' EXIT INT TERM
# --- подставной мир: репо с npm-пакетом (каталог proba-kat, имя пакета proba-imya — как у 6 пакетов, где имя ≠ каталогу) ---
R="$B/repo"; P="$R/packages/proba-kat"; BOJ="$B/boj"
mkdir -p "$P/src" "$P/test"
printf '{ "name": "proba-imya", "version": "0.0.1", "private": true, "files": ["src"] }\n' > "$P/package.json"
printf 'export const a = 1;\n' > "$P/src/index.js"
printf "console.log('PASS подставной стенд');\n" > "$P/test/stend-zelenyj.mjs"
printf '# Изменения\n\n## 0.0.1 — подставной выпуск стенда\n' > "$P/CHANGELOG.md"
git -C "$B" init -q repo; G() { git -C "$R" -c user.name=stend -c user.email=stend@localhost "$@"; }
G add -A && G commit -qm init || { echo "СЛЕПОТА: подставной репо не собран"; exit 2; }
cp -a "$P" "$BOJ"; ls -1 "$BOJ"/test/stend-* > "$B/perechen"
printf '{"plugins":[{"id":"fixture-copy","path":"%s"}]}\n' "$BOJ" > "$B/kopii.yaml"
echo 'exceptions: []' > "$B/isk.yaml"
strok() { sudo -n sh -c "cat '$ZD/zhurnal.tsv' 2>/dev/null | grep -c ." ; }
vorota() { (cd "$P" && VYPUSK_REPO="$R" VYPUSK_REESTR="$B/kopii.yaml" VYPUSK_ZHURNAL_DIR="$ZD" VYPUSK_ZHURNAL_ZAPIS="$ZAPIS" \
  ISKLYUCHENIYA_STENDOV="$B/isk.yaml" OBHODCHIK="$OBH" OBLAST_STENDOV="$BOJ/" PERECHEN_STENDOV="$B/perechen" "$VOROTA" . 2>&1); }
OK=0; FAIL=0
proba() {  # имя · код · есть строка · нет строки · прирост строк следа
  local imya="$1" zhdem="$2" est="$3" net="$4" pri="$5" do_ out kod posle beda=""
  do_=$(strok); out=$(vorota); kod=$?; posle=$(strok)
  [ "$kod" = "$zhdem" ] || beda="код $kod ≠ $zhdem"
  [ -z "$est" ] || grep -qF -- "$est" <<< "$out" || beda="$beda; нет «$est»"
  [ -z "$net" ] || ! grep -qF -- "$net" <<< "$out" || beda="$beda; есть «$net»"
  [ $((posle - do_)) = "$pri" ] || beda="$beda; строк следа $do_ → $posle (ждали +$pri)"
  if [ -z "$beda" ]; then OK=$((OK+1)); echo "ok   $imya (следа $do_ → $posle)"
  else FAIL=$((FAIL+1)); echo "FAIL $imya — ${beda#; }"; printf '%s\n' "$out" | tail -8 | sed 's/^/       /'; fi
}
echo "ворота $(sha256sum < "$VOROTA" | cut -c1-16) · помощник $(sha256sum < "$ZAPIS" | cut -c1-16) · журнал $ZD"
proba "Т1 исправное: метки нет → «✅», след +1" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "" 1
G tag -a proba-kat-v0.0.1 -m проба; echo "   порча: метка proba-kat-v0.0.1 → $(G rev-parse --short=12 'proba-kat-v0.0.1^{commit}')"
proba "Т2 метка по каталогу есть → ОТКАЗ код 1, следа +0" 1 "ОТКАЗ: метка proba-kat-v0.0.1 уже есть" "можно ставить" 0
G tag -d proba-kat-v0.0.1 >/dev/null; G tag -a proba-imya-v0.0.1 -m проба; echo "   порча: метка proba-imya-v0.0.1 (по имени пакета), proba-kat снята: $(G tag -l | paste -sd' ')"
proba "Т3 метка по имени пакета есть → ОТКАЗ код 1, следа +0" 1 "ОТКАЗ: метка proba-imya-v0.0.1 уже есть" "можно ставить" 0
G tag -d proba-imya-v0.0.1 >/dev/null; echo "   возврат: меток $(G tag -l | grep -c .)"
proba "Т4 возврат: метки сняты → «✅», след +1" 0 "можно ставить ЛОКАЛЬНЫЙ тег" "" 1
echo "ИТОГ: сошлось $OK из $((OK+FAIL))"; [ "$FAIL" = 0 ]
