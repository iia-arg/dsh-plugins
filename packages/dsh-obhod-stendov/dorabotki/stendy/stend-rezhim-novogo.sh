#!/bin/bash
# Стенд B-N-1817: режим и владелец НОВОГО файла у smontirovat-fajly — по соседям; сверка режима/владельца после монтажа.
# Вызов: stend-rezhim-novogo.sh <инструмент>   (от root; цели — во временном каталоге, вне git и dorabotki)
# Пишет: строки журнала -t smontirovat-fajly с пунктом STEND-B-N-1817-*, страховки /var/backups/montazh/STEND-B-N-1817-* — убирает сам.
# 🔴 ПОКРЫТИЕ (Вениамин 08.10 04:56Z, решение Забавы): путь ПО УМОЛЧАНИЮ — --novyj БЕЗ ключей (режим/владелец по соседям, отказы
#   «нет соседей / разнобой / 022|6000») — держит ТОЛЬКО этот стенд: stend-ucheta и stend-ucheta-git с 08.10 зовут --novyj с явными
#   --mode=644 --owner=root:root. Снимут этот стенд из обхода — правило соседей останется без читателя.
# Обход: от root (@root в vse-stendy-boevye.sh), довод — путь инструмента через SREDA_STENDOV.
set -u; trap 'exit 143' TERM; trap 'exit 130' INT; T=${1:?инструмент}; [ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root"; exit 2; }
W=$(mktemp -d /var/tmp/stend1817.XXXXXX); P=STEND-B-N-1817-$$; ok=0; bad=0; HL=(); trap 'rm -rf "$W" /var/backups/montazh/$P' EXIT
export MO_STATE_DIR=$W/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
U=iskra; UG=$(id -u $U):$(id -g $U)
sud(){ if [ "$1" = да ]; then ok=$((ok+1)); echo "  ✅ $2"; else bad=$((bad+1)); echo "  🔴 $2 — $3"; fi; }
mk(){ rm -rf "$W/b" "$W/k"; mkdir -p "$W/b" "$W/k"; }            # b — «бой», k — кандидат
sos(){ local m=$1 o=$2 n=$3; case $o in *:*) ;; *) o=$o:$o;; esac; echo x > "$W/b/$n"; chown $o "$W/b/$n"; chmod $m "$W/b/$n"; }
kan(){ printf 'kandidat %s\n' "$RANDOM" > "$W/k/$1"; chmod $2 "$W/k/$1"; }
run(){ rm -f -- "$MO_STATE_DIR"/*.json; OUT=$("$T" --punkt $P --v-boj "$@" 2>&1); RC=$?; }   # B-N-2038
st(){ stat -c '%a %u:%g' -- "$1" 2>/dev/null || echo "нет"; }
echo "== 1. ПОРЧА ПРЕДМЕТА: новый 600 среди соседей 644 $U → ждём 644 $UG"
mk; sos 644 $U a.txt; sos 644 $U b.txt; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$(st $W/b/new.mjs)" = "644 $UG" ] && sud да "лёг $(st $W/b/new.mjs)" || sud нет "новый 600→?" "лёг $(st $W/b/new.mjs), rc=$RC $(echo "$OUT"|grep -m1 -E 'ОТКАЗ|🔴'|cut -c1-120)"
echo "$OUT" | grep -q "по неисполняемым соседям: 644×2" && sud да "в плане названо основание" || sud нет "основание в плане" "$(echo "$OUT"|grep -m1 'new.mjs →'|cut -c1-160)"
echo "== 2. ИСПРАВНОЕ: существующий x.sh 750 $U, кандидат 600, без --novyj → режим и владелец не меняются"
mk; sos 750 $U x.sh; kan x.sh 600; run "$W/k" "$W/b" x.sh
[ "$RC" = 0 ] && [ "$(st $W/b/x.sh)" = "750 $UG" ] && sud да "x.sh $(st $W/b/x.sh), rc 0" || sud нет "существующий" "$(st $W/b/x.sh) rc=$RC"
echo "== 3. ВОЗВРАТ: новый кандидат 644 → 644 $UG"
mk; sos 644 $U a.txt; kan new.mjs 644; run --novyj "$W/k" "$W/b" new.mjs
[ "$(st $W/b/new.mjs)" = "644 $UG" ] && sud да "лёг $(st $W/b/new.mjs)" || sud нет "возврат" "$(st $W/b/new.mjs) rc=$RC"
echo "== 4. СВЕРКА ПРАВ: подменённый install портит режим временного (chmod 600 после записи) → ждём «СВЕРКА НЕ СОШЛАСЬ», rc 1"
mkdir -p "$W/fake"; printf '#!/bin/bash\n/usr/bin/install "$@" || exit $?\nfor a; do :; done; case "$a" in */.*.smf-*) chmod 600 "$a";; esac\n' > "$W/fake/install"; chmod 755 "$W/fake/install"
mk; sos 644 $U a.txt; kan new.mjs 644; rm -f -- "$MO_STATE_DIR"/*.json; OUT=$(PATH="$W/fake:$PATH" "$T" --punkt $P --v-boj --novyj "$W/k" "$W/b" new.mjs 2>&1); RC=$?
echo "     порча внесена: файл лёг $(st $W/b/new.mjs) (план 644)"
[ "$RC" = 1 ] && echo "$OUT" | grep -q "режим 600 ≠ плану 644" && sud да "сверка покраснела: $(echo "$OUT"|grep -m1 'режим 600'|cut -c1-90)" || sud нет "сверка прав" "rc=$RC $(echo "$OUT"|grep -m1 -E '✅|СВЕРКА'|cut -c1-120)"
echo "     возврат: без подмены → $( mk; sos 644 $U a.txt; kan new.mjs 644; run --novyj "$W/k" "$W/b" new.mjs; echo "rc=$RC $(echo "$OUT"|grep -m1 -o '✅ ПОЛОЖЕНО[^·]*')")"
echo "== ГРАНИЧНЫЕ"
mk; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$RC" = 2 ] && echo "$OUT" | grep -q "нет соседних файлов" && [ ! -e $W/b/new.mjs ] && sud да "нет соседей → ОТКАЗ, не записано" || sud нет "нет соседей" "rc=$RC $(st $W/b/new.mjs)"
run --novyj --mode=644 --owner=$U:$U "$W/k" "$W/b" new.mjs
[ "$(st $W/b/new.mjs)" = "644 $UG" ] && sud да "нет соседей + --mode=644 --owner=$U:$U → $(st $W/b/new.mjs)" || sud нет "ключи" "$(st $W/b/new.mjs) rc=$RC $(echo "$OUT"|grep -m1 ОТКАЗ|cut -c1-100)"
mk; sos 640 $U a.txt; sos 644 $U b.txt; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$RC" = 2 ] && echo "$OUT" | grep -q "с разными режимами: 640×1 644×1" && sud да "разные режимы → ОТКАЗ с перечнем" || sud нет "разные режимы" "rc=$RC $(echo "$OUT"|grep -m1 ОТКАЗ|cut -c1-140)"
mk; echo x > $W/real.txt; chmod 644 $W/real.txt; ln -s $W/real.txt $W/b/ssylka.txt; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$RC" = 2 ] && echo "$OUT" | grep -q "нет соседних файлов" && sud да "в каталоге только ссылка → не сосед → ОТКАЗ" || sud нет "ссылка" "rc=$RC $(st $W/b/new.mjs)"
mk; sos 644 $U a.txt; sos 755 $U run.sh; kan new.sh 700; run --novyj "$W/k" "$W/b" new.sh
[ "$(st $W/b/new.sh)" = "755 $UG" ] && sud да "исполняемый 700 среди 644+755 → $(st $W/b/new.sh)" || sud нет "исполняемый" "$(st $W/b/new.sh) rc=$RC"
mk; sos 644 $U a.txt; kan new.mjs 600; mkdir -p $W/k/pod; cp -p $W/k/new.mjs $W/k/pod/; run --novyj "$W/k" "$W/b" pod/new.mjs
[ "$RC" = 2 ] && echo "$OUT" | grep -q "ещё нет — соседей нет" && [ ! -e $W/b/pod ] && sud да "новый подкаталог → ОТКАЗ, каталог не создан" || sud нет "подкаталог" "rc=$RC"
run --novyj --mode=644 --owner=$U:$U "$W/k" "$W/b" pod/new.mjs
[ "$(st $W/b/pod/new.mjs)" = "644 $UG" ] && [ "$(stat -c '%a %u:%g' $W/b/pod)" = "755 $UG" ] && sud да "подкаталог + ключи → файл $(st $W/b/pod/new.mjs), каталог $(stat -c '%a %u:%g' $W/b/pod)" || sud нет "подкаталог+ключи" "$(st $W/b/pod/new.mjs) rc=$RC"
mk; sos 644 $U a.txt; sos 644 root:root b.txt; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$RC" = 2 ] && echo "$OUT" | grep -q "с разными владельцами" && sud да "разные владельцы → ОТКАЗ" || sud нет "владельцы" "rc=$RC $(st $W/b/new.mjs)"
mk; sos 644 $U a.txt; sos 600 $U a.txt.bak-x; sos 600 $U .skryt; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$(st $W/b/new.mjs)" = "644 $UG" ] && sud да "*.bak* и скрытые 600 не в счёт → $(st $W/b/new.mjs)" || sud нет "исключения" "$(st $W/b/new.mjs) rc=$RC"
mk; sos 644 $U a.txt; kan a.txt 600; run --mode=644 "$W/k" "$W/b" a.txt
[ "$RC" = 2 ] && echo "$OUT" | grep -q "только вместе с --novyj" && sud да "--mode без --novyj → ОТКАЗ" || sud нет "--mode без --novyj" "rc=$RC"
run --novyj --mode=666 "$W/k" "$W/b" a.txt; [ "$RC" = 2 ] && echo "$OUT" | grep -q "запись группе/прочим" && sud да "--mode=666 → ОТКАЗ (o+w)" || sud нет "o+w" "rc=$RC"
run --novyj --mode=6x4 "$W/k" "$W/b" a.txt; [ "$RC" = 2 ] && sud да "--mode=6x4 → ОТКАЗ" || sud нет "мусор в --mode" "rc=$RC"
run --novyj --owner=net-takogo:root "$W/k" "$W/b" a.txt; [ "$RC" = 2 ] && sud да "--owner несуществующей учётки → ОТКАЗ" || sud нет "owner" "rc=$RC"
mk; sos 644 $U a.txt; sos 444 $U zamorozh.txt; sos 555 $U zamorozh.sh; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$(st $W/b/new.mjs)" = "644 $UG" ] && sud да "замороженные 444/555 рядом не мешают → $(st $W/b/new.mjs)" || sud нет "замороженные" "$(st $W/b/new.mjs) rc=$RC $(echo "$OUT"|grep -m1 ОТКАЗ|cut -c1-120)"
mk; sos 644 $U a.txt; sos 444 $U zamorozh.txt; kan kopiya.txt 444; run --novyj "$W/k" "$W/b" kopiya.txt
[ "$(st $W/b/kopiya.txt)" = "444 $UG" ] && sud да "кандидат 444 → по соседям только для чтения → $(st $W/b/kopiya.txt)" || sud нет "кандидат 444" "$(st $W/b/kopiya.txt) rc=$RC"
mk; sos 664 $U a.txt; sos 664 $U b.txt; kan new.mjs 600; run --novyj "$W/k" "$W/b" new.mjs
[ "$RC" = 2 ] && echo "$OUT" | grep -q "= 664 .*запись группе" && [ ! -e $W/b/new.mjs ] && sud да "соседи 664 → ОТКАЗ (g+w от соседей не наследуется)" || sud нет "сосед 664" "rc=$RC $(st $W/b/new.mjs)"
run --novyj --mode=644 "$W/k" "$W/b" new.mjs
[ "$(st $W/b/new.mjs)" = "644 $UG" ] && sud да "соседи 664 + --mode=644 → $(st $W/b/new.mjs)" || sud нет "664+--mode" "$(st $W/b/new.mjs) rc=$RC"
mk; sos 4755 $U a.sh; kan new.sh 755; run --novyj "$W/k" "$W/b" new.sh
[ "$RC" = 2 ] && echo "$OUT" | grep -q "= 4755 .*suid" && sud да "сосед 4755 → ОТКАЗ (suid не наследуется)" || sud нет "сосед 4755" "rc=$RC $(st $W/b/new.sh)"
mk; sos 644 $U a.txt; kan new.mjs 600; run --novyj --mode=664 "$W/k" "$W/b" new.mjs
[ "$RC" = 2 ] && sud да "--mode=664 → ОТКАЗ (g+w)" || sud нет "--mode=664" "rc=$RC"
echo; echo "итог: сошлось $ok, расхождений $bad (из $((ok+bad)))"; [ "$bad" = 0 ]
