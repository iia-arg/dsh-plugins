#!/bin/bash
# Стенд B-N-971/B-N-922 (Михалыч; +B-N-1576 Заря: E1–E4 — кандидат, равный бою): smontirovat-fajly на подставе /var/tmp/b971. Запуск от root: bash stend.sh <инструмент>
# ⚠️ ПИШЕТ В НАСТОЯЩИЙ ЖУРНАЛ инструмента (logger -t smontirovat-fajly): пункты PROBA-B971-<pid>-*, строки PODMENA.
#   Счётчикам otkaz-do-zapisi / smontirovano / PODMENA эти строки ОТСЕКАТЬ по punkt=PROBA-*. Страховки и
#   /var/tmp/b971.XXXXXX стенд убирает сам в конце.
set -u
# Подстава — mktemp -d, своя на прогон: фиксированный /var/tmp/b971 с rm -rf ломал два прогона разом (26.09 11:14Z, находка Вениамина).
I=$1; R=$(mktemp -d /var/tmp/b971.XXXXXX) || exit 2; chmod 755 $R; mkdir -p $R/boj $R/dorabotki $R/paket/src $R/in $R/k
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
chown nobody:nogroup $R/in; chmod 775 $R/in
printf 'w v1\n' > $R/boj/w.sh; printf 'nd v1\n' > $R/dorabotki/nd.sh; printf 'w v2\n' > $R/paket/src/w.sh
printf '# учёт\n%s|%s\n' "$R/paket/src/w.sh" "$R/boj/w.sh" > $R/pary.txt
export SMF_PARY=$R/pary.txt SMF_DORABOTKI=$R/dorabotki SMF_ISKRA_IN=$R/in
s() { sha256sum "$1" 2>/dev/null | cut -c1-16 || echo net; }
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { rm -f -- "$MO_STATE_DIR"/*.json; "$I" "$@" > $R/out 2>&1; echo $?; }   # B-N-2038: свои окна прошлого вызова
P=PROBA-B971-$$; st() { ls /var/backups/montazh/$P-$1 2>/dev/null | wc -l; }
kand() { rm -rf $R/k/$1; mkdir -p $R/k/$1; printf "$2" > $R/k/$1/$3; }
# A1 пара совпала → ставит
kand a1 'w v2\n' w.sh; d0=$(s $R/boj/w.sh); K=$(zov --punkt $P-a1 --v-boj $R/k/a1 $R/boj w.sh)
sud "A1 пара совпала (кандидат = исходнику): код $K · бой $d0 → $(s $R/boj/w.sh) · страховок $(st a1)" "$([ $K = 0 ] && [ "$(s $R/boj/w.sh)" = "$(s $R/paket/src/w.sh)" ] && [ $(st a1) = 1 ] && echo 1)" "$(tail -2 $R/out)"
# A2 пара разошлась → отказ, бой не тронут, страховки нет
kand a2 'w v3\n' w.sh; d0=$(s $R/boj/w.sh); K=$(zov --punkt $P-a2 --v-boj $R/k/a2 $R/boj w.sh)
sud "A2 пара разошлась: код $K · бой до=после $([ "$d0" = "$(s $R/boj/w.sh)" ] && echo да || echo НЕТ) · страховок $(st a2) · «$(grep -o 'сначала выпуск/правка исходника [^ ]*' $R/out | head -1)»" "$([ $K = 2 ] && [ "$d0" = "$(s $R/boj/w.sh)" ] && [ $(st a2) = 0 ] && grep -q 'сначала выпуск/правка исходника' $R/out && echo 1)" "$(tail -2 $R/out)"
# A3 не в парах → как прежде
kand a3 'x v1\n' x.sh; K=$(zov --punkt $P-a3 --novyj --v-boj $R/k/a3 $R/boj x.sh)
sud "A3 не в парах: код $K · новый файл $(s $R/boj/x.sh) · писем $(ls $R/in | wc -l)" "$([ $K = 0 ] && [ "$(s $R/boj/x.sh)" = "$(s $R/k/a3/x.sh)" ] && [ "$(ls $R/in | wc -l)" = 0 ] && echo 1)" "$(tail -2 $R/out)"
# A4 исходника пары нет → отказ
mv $R/paket/src/w.sh $R/paket/src/w.sh.away; kand a4 'w v2\n' w.sh; K=$(zov --punkt $P-a4 --v-boj $R/k/a4 $R/boj w.sh); mv $R/paket/src/w.sh.away $R/paket/src/w.sh
sud "A4 исходника нет: код $K · страховок $(st a4)" "$([ $K = 2 ] && [ $(st a4) = 0 ] && grep -q 'исходника .* нет' $R/out && echo 1)" "$(tail -1 $R/out)"
# A5 учёт пар не читается → отказ (слепота)
kand a5 'x v2\n' x.sh; K=$(SMF_PARY=$R/net.txt zov --punkt $P-a5 --v-boj $R/k/a5 $R/boj x.sh)
sud "A5 учёт пар не читается: код $K" "$([ $K = 2 ] && grep -q 'не читается' $R/out && echo 1)" "$(tail -1 $R/out)"
# B1 монтаж в dorabotki → письмо легло, в нём суммы
kand b1 'nd v2\n' nd.sh; d0=$(s $R/dorabotki/nd.sh); K=$(zov --punkt $P-b1 --v-boj $R/k/b1 $R/dorabotki nd.sh); L=$(ls $R/in/*.txt 2>/dev/null | head -1)
sud "B1 в dorabotki: код $K · писем $(ls $R/in | wc -l) · владелец $(stat -c %U:%G $L 2>/dev/null) $(stat -c %a $L 2>/dev/null) · конверт $(head -1 $L | grep -c '^\[delivery-v1 id=') · суммы до/после в письме $(grep -cF "было $d0 → стало $(s $R/dorabotki/nd.sh)" $L) · страховка названа $(grep -c "страховка: /var/backups" $L) · .part $(ls -a $R/in | grep -c part)" \
  "$([ $K = 0 ] && [ "$(ls $R/in | wc -l)" = 1 ] && [ "$(stat -c %U $L)" = nobody ] && grep -qF "было $d0 → стало $(s $R/dorabotki/nd.sh)" $L && head -1 $L | grep -q '^\[delivery-v1 id=' && echo 1)" "$(tail -2 $R/out)"
[ -n "$L" ] && echo "   письмо ($(s $L)):" && sed 's/^/   | /' $L | cut -c1-150
# B2 ящика нет → монтаж в силе, код 4
kand b2 'nd v3\n' nd.sh; K=$(SMF_ISKRA_IN=$R/net-yashchika zov --punkt $P-b2 --v-boj $R/k/b2 $R/dorabotki nd.sh)
sud "B2 ящика нет: код $K · файл смонтирован $([ "$(s $R/dorabotki/nd.sh)" = "$(s $R/k/b2/nd.sh)" ] && echo да || echo НЕТ) · «НЕ легло» $(grep -c 'НЕ легло' $R/out)" "$([ $K = 4 ] && [ "$(s $R/dorabotki/nd.sh)" = "$(s $R/k/b2/nd.sh)" ] && echo 1)" "$(tail -1 $R/out)"
# E B-N-1576: кандидат, равный бою (находка Искры 20:28Z — пустой монтаж выглядел сделанным). Бой сейчас: dorabotki/nd.sh = «nd v3» (B2).
pis() { ls $R/in | wc -l; }; ino() { stat -c %i "$1"; }
jn() { journalctl -t smontirovat-fajly --since "$1" -o cat 2>/dev/null | grep -c "montirovat-nechego punkt=$2"; }
printf 'nd2 v1\n' > $R/dorabotki/nd2.sh
kand e1 'nd v3\n' nd.sh; p0=$(pis); i0=$(ino $R/dorabotki/nd.sh); t0=$(date '+%F %T'); sleep 1
K=$(zov --punkt $P-e1 --v-boj $R/k/e1 $R/dorabotki nd.sh); sleep 1
sud "E1 все равны бою (--v-boj): код $K · страховок $(st e1) · писем +$(( $(pis) - p0 )) · inode $([ "$i0" = "$(ino $R/dorabotki/nd.sh)" ] && echo тот же || echo НОВЫЙ) · «БЕЗ ИЗМЕНЕНИЙ: 1 из 1 (nd.sh)» $(grep -cF 'БЕЗ ИЗМЕНЕНИЙ: 1 из 1 (nd.sh)' $R/out) · «ПОЛОЖЕНО» $(grep -c 'ПОЛОЖЕНО' $R/out) · журнал $(jn "$t0" $P-e1)" \
  "$([ $K = 3 ] && [ $(st e1) = 0 ] && [ "$(pis)" = "$p0" ] && [ "$i0" = "$(ino $R/dorabotki/nd.sh)" ] && grep -qF 'БЕЗ ИЗМЕНЕНИЙ: 1 из 1 (nd.sh)' $R/out && grep -q 'монтировать нечего' $R/out && ! grep -q 'ПОЛОЖЕНО' $R/out && [ "$(jn "$t0" $P-e1)" = 1 ] && echo 1)" "$(tail -2 $R/out)"
K=$(zov --punkt $P-e2 --progon $R/k/e1 $R/dorabotki nd.sh)
sud "E2 все равны бою (--progon): код $K · «монтировать нечего» $(grep -c 'монтировать нечего' $R/out)" "$([ $K = 3 ] && grep -q 'монтировать нечего' $R/out && echo 1)" "$(tail -1 $R/out)"
mkdir -p $R/k/e3; printf 'nd v3\n' > $R/k/e3/nd.sh; printf 'nd2 v2\n' > $R/k/e3/nd2.sh
p0=$(pis); i0=$(ino $R/dorabotki/nd.sh); d0=$(s $R/dorabotki/nd2.sh)
K=$(zov --punkt $P-e3 --v-boj $R/k/e3 $R/dorabotki); L=$(ls -t $R/in/*.txt | head -1); T=$(ls /var/backups/montazh/$P-e3/*.tar 2>/dev/null | head -1)
sud "E3 смешанный (nd.sh равен, nd2.sh изменён): код $K · nd2 $d0 → $(s $R/dorabotki/nd2.sh) · nd.sh inode $([ "$i0" = "$(ino $R/dorabotki/nd.sh)" ] && echo тот же || echo НОВЫЙ) · членов страховки $(tar -tf "$T" 2>/dev/null | wc -l) ($(tar -tf "$T" 2>/dev/null | xargs -r -n1 basename)) · «ПОЛОЖЕНО И СВЕРЕНО: 1 из 1» $(grep -cF 'ПОЛОЖЕНО И СВЕРЕНО: 1 из 1' $R/out) · «БЕЗ ИЗМЕНЕНИЙ: 1 из 2 (nd.sh)» $(grep -cF 'БЕЗ ИЗМЕНЕНИЙ: 1 из 2 (nd.sh)' $R/out) · писем +$(( $(pis) - p0 )): строка nd2 $(grep -c '/nd2.sh · было' $L), строка nd.sh $(grep -c '/nd.sh · было' $L), «без изменений» $(grep -cF 'БЕЗ ИЗМЕНЕНИЙ: 1 из 2 (nd.sh)' $L)" \
  "$([ $K = 0 ] && [ "$(s $R/dorabotki/nd2.sh)" = "$(s $R/k/e3/nd2.sh)" ] && [ "$i0" = "$(ino $R/dorabotki/nd.sh)" ] && [ "$(tar -tf "$T" | wc -l)" = 1 ] && tar -tf "$T" | grep -q 'nd2.sh$' && grep -qE 'ПОЛОЖЕНО И СВЕРЕНО( \(сумма, режим, владелец\))?: 1 из 1' $R/out && grep -qF 'БЕЗ ИЗМЕНЕНИЙ: 1 из 2 (nd.sh)' $R/out && [ $(( $(pis) - p0 )) = 1 ] && [ "$(grep -c '/nd2.sh · было' $L)" = 1 ] && [ "$(grep -c '/nd.sh · было' $L)" = 0 ] && grep -qF 'БЕЗ ИЗМЕНЕНИЙ: 1 из 2 (nd.sh)' $L && echo 1)" "$(tail -3 $R/out)"
printf 'w v7\n' > $R/boj/w.sh; kand e4 'w v7\n' w.sh
K=$(zov --punkt $P-e4 --v-boj $R/k/e4 $R/boj w.sh); printf 'w v2\n' > $R/boj/w.sh
sud "E4 равен бою, но ≠ исходнику пары: код $K (прежний отказ раньше равенства) · «сначала выпуск» $(grep -c 'сначала выпуск/правка исходника' $R/out)" "$([ $K = 2 ] && grep -q 'сначала выпуск/правка исходника' $R/out && echo 1)" "$(tail -1 $R/out)"
# C прежнее поведение (B-N-1576: C1 гонял прогон кандидата, РАВНОГО бою после A1, — теперь это код 3 (E2); C1 — на изменённом x.sh)
kand c1 'x v8\n' x.sh
K=$(zov --punkt $P-c1 --progon $R/k/c1 $R/boj x.sh); sud "C1 --progon: код $K · «ПРОГОН»" "$([ $K = 0 ] && grep -q 'ПРОГОН' $R/out && echo 1)" "$(tail -1 $R/out)"
K=$(zov --punkt $P-c2 --v-boj $R/k/a1 $R/boj ../x); sud "C2 путь с «..»: код $K" $([ $K = 2 ] && echo 1)
K=$(zov --punkt $P-c3 --v-boj --dry-run $R/k/a1 $R/boj w.sh); sud "C3 неизвестный ключ: код $K" $([ $K = 2 ] && echo 1)
# D видимая подмена (хвост B-N-971)
jz() { journalctl -t smontirovat-fajly --since "$1" -o cat 2>/dev/null | grep -c "PODMENA punkt=$2"; }
kand d 'x v9\n' x.sh
t0=$(date '+%F %T'); sleep 1; env -u SMF_PARY -u SMF_DORABOTKI -u SMF_ISKRA_IN "$I" --punkt $P-d0 --progon $R/k/d $R/boj x.sh > $R/out 2>&1; K=$?; sleep 1
sud "D0 без SMF_* (--progon, настоящий учёт): код $K · строк ПОДМЕНА $(grep -c 'ПОДМЕНА' $R/out) · в журнале $(jz "$t0" $P-d0)" "$([ $K = 0 ] && [ "$(grep -c 'ПОДМЕНА' $R/out)" = 0 ] && [ "$(jz "$t0" $P-d0)" = 0 ] && echo 1)" "$(head -3 $R/out)"
for v in SMF_PARY SMF_DORABOTKI SMF_ISKRA_IN; do
  t0=$(date '+%F %T'); sleep 1; env -u SMF_PARY -u SMF_DORABOTKI -u SMF_ISKRA_IN $v=${!v} "$I" --punkt $P-d-${v//_/-} --progon $R/k/d $R/boj x.sh > $R/out 2>&1; K=$?; sleep 1
  sud "D1 только $v: код $K · строк ПОДМЕНА $(grep -c 'ПОДМЕНА' $R/out) (своя $(grep -cF "ПОДМЕНА: $v=${!v}" $R/out)) · в журнале $(jz "$t0" $P-d-${v//_/-})" "$([ $K = 0 ] && [ "$(grep -c 'ПОДМЕНА' $R/out)" = 1 ] && [ "$(grep -cF "ПОДМЕНА: $v=${!v}" $R/out)" = 1 ] && [ "$(jz "$t0" $P-d-${v//_/-})" = 1 ] && echo 1)" "$(head -3 $R/out)"
done
t0=$(date '+%F %T'); sleep 1; SMF_PARY=$R/net.txt "$I" --punkt $P-d2 --v-boj $R/k/d $R/boj x.sh > $R/out 2>&1; K=$?; sleep 1
sud "D2 подмена видна и при ОТКАЗЕ (учёт не читается): код $K · ПОДМЕНА $(grep -cF "ПОДМЕНА: SMF_PARY=$R/net.txt" $R/out)" "$([ $K = 2 ] && [ "$(grep -cF "ПОДМЕНА: SMF_PARY=$R/net.txt" $R/out)" = 1 ] && echo 1)" "$(head -3 $R/out)"
echo "ИТОГ: ok $ok · fail $fail"
rm -rf $R /var/backups/montazh/$P-*
[ $fail = 0 ]
