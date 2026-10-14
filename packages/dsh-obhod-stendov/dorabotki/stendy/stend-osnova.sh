#!/bin/bash
# Стенд B-N-1848 (Аврора, 08.10.2026): smontirovat-fajly --osnova — сверка боя с основой кандидата ДО записи.
# Класс «письмо старее диска»: окно Анны 13:23Z затёрло правку Марка 13:21:44Z кандидатом от старой основы.
# Запуск от root: bash stend-osnova.sh [<инструмент>] (умолчание — STEND_PREDMET, иначе бой /usr/local/sbin/smontirovat-fajly). Подстава — mktemp -d в /var/tmp, убирается в конце.
# ⚠️ ПИШЕТ В НАСТОЯЩИЙ ЖУРНАЛ инструмента (logger -t smontirovat-fajly): пункты PROBA-B1848-<pid>-*, строки PODMENA;
#   страховки /var/backups/montazh/PROBA-B1848-<pid>-* стенд убирает сам.
# Зрячесть: на инструменте БЕЗ --osnova краснеют все пробы с ключом (отказ «неизвестный ключ», а не «бой ≠ основе»);
#   на r1 (сверка только в предполёте) краснеют O8б/O8в/O7б и O13 — гонка между предполётом и mv.
set -u
I=${1:-${STEND_PREDMET:-/usr/local/sbin/smontirovat-fajly}};   # r3 (Искра, обход 1.0.23): предмет по умолчанию — бой; кандидат — доводом или STEND_PREDMET
echo "предмет: $I"; [ -x "$I" ] || { echo "СЛЕПОТА: предмет $I не исполняемый"; exit 2; }
 R=$(mktemp -d /var/tmp/b1848.XXXXXX) || exit 2; chmod 755 $R; mkdir -p $R/boj $R/paket/src $R/in $R/k
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
chown nobody:nogroup $R/in; chmod 775 $R/in
printf 'p v1\n' > $R/boj/para.sh; printf 'p v1\n' > $R/paket/src/para.sh
printf '# учёт\n%s|%s\n' "$R/paket/src/para.sh" "$R/boj/para.sh" > $R/pary.txt   # пара нужна: пустой учёт — отказ-слепота
printf 'f v1\n' > $R/boj/f.sh; printf 'g v1\n' > $R/boj/g.sh
export SMF_PARY=$R/pary.txt SMF_DORABOTKI=$R/dorabotki-net SMF_ISKRA_IN=$R/in SMF_RUKA='Stend <stend@sadik>' SMF_ZAMOK=$R/zamok
s() { sha256sum "$1" 2>/dev/null | cut -c1-${2:-16} || echo net; }
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { rm -f -- "$MO_STATE_DIR"/*.json; "$I" "$@" > $R/out 2>&1; echo $?; }   # B-N-2038: свои окна прошлого вызова
P=PROBA-B1848-$$; st() { ls /var/backups/montazh/$P-$1 2>/dev/null | wc -l; }
# r4 (условие Вениамина, образец stend-snyatiya.sh:14–15, B-N-1768): уборка при ЛЮБОМ выходе, включая TERM/INT посреди прогона;
#   фоновый монтаж пробы O13 гасится первым — иначе он пережил бы стенд и положил страховку после уборки.
trap 'kill $(jobs -p) 2>/dev/null; wait 2>/dev/null; rm -rf "$R" /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-*' EXIT
trap 'exit 143' TERM; trap 'exit 130' INT
kand() { rm -rf $R/k/$1; mkdir -p $R/k/$1; printf "$2" > $R/k/$1/$3; }
# O1 исправное: основа = бой → монтаж
kand o1 'f v2\n' f.sh; os=$(s $R/boj/f.sh); K=$(zov --punkt $P-o1 --v-boj --osnova f.sh=$os $R/k/o1 $R/boj f.sh)
sud "O1 основа = бой ($os): код $K · бой → $(s $R/boj/f.sh) · «основа сверена» $(grep -c 'основа сверена' $R/out) · страховок $(st o1)" \
  "$([ $K = 0 ] && [ "$(s $R/boj/f.sh)" = "$(s $R/k/o1/f.sh)" ] && grep -q 'основа сверена' $R/out && echo 1)" "$(tail -1 $R/out)"
# O2 ПОРЧА (случай Марка): основа снята, потом бой правят, потом монтаж со старой основой → отказ, бой не тронут
kand o2 'f v3-kandidat\n' f.sh; os=$(s $R/boj/f.sh); printf 'f v2 + pravka-marka\n' > $R/boj/f.sh; pm=$(s $R/boj/f.sh)
echo "   порча внесена: бой после снятия основы $os → $pm ($([ "$os" != "$pm" ] && echo изменён || echo НЕ ИЗМЕНЁН))"
K=$(zov --punkt $P-o2 --v-boj --osnova f.sh=$os $R/k/o2 $R/boj f.sh)
sud "O2 бой изменён после основы: код $K · бой $pm → $(s $R/boj/f.sh) · страховок $(st o2) · обе суммы в отказе $(grep -c "основа $os, бой $pm" $R/out) · имя $(grep -c "$R/boj/f.sh" $R/out)" \
  "$([ $K = 2 ] && [ "$(s $R/boj/f.sh)" = "$pm" ] && [ $(st o2) = 0 ] && grep -q "бой ≠ основе: $R/boj/f.sh — основа $os, бой $pm" $R/out && echo 1)" "$(tail -1 $R/out)"
# O3 возврат: основа заново от текущего боя → монтаж
os=$(s $R/boj/f.sh); K=$(zov --punkt $P-o3 --v-boj --osnova f.sh=$os $R/k/o2 $R/boj f.sh)
sud "O3 основа от текущего боя ($os): код $K · бой → $(s $R/boj/f.sh)" "$([ $K = 0 ] && [ "$(s $R/boj/f.sh)" = "$(s $R/k/o2/f.sh)" ] && echo 1)" "$(tail -1 $R/out)"
# O4 без ключа — как прежде + предупреждение
kand o4 'f v4\n' f.sh; K=$(zov --punkt $P-o4 --v-boj $R/k/o4 $R/boj f.sh)
sud "O4 без --osnova: код $K · бой = кандидату $([ "$(s $R/boj/f.sh)" = "$(s $R/k/o4/f.sh)" ] && echo да || echo нет) · «основа не сверена» $(grep -c 'основа не сверена' $R/out)" \
  "$([ $K = 0 ] && [ "$(s $R/boj/f.sh)" = "$(s $R/k/o4/f.sh)" ] && grep -q 'основа не сверена' $R/out && echo 1)" "$(tail -1 $R/out)"
# O5 ключ на файл не из вызова → отказ
kand o5 'f v5\n' f.sh; d0=$(s $R/boj/f.sh); K=$(zov --punkt $P-o5 --v-boj --osnova h.sh=$d0 $R/k/o5 $R/boj f.sh)
sud "O5 --osnova на файл не из вызова: код $K · бой не тронут $([ "$(s $R/boj/f.sh)" = "$d0" ] && echo да || echo НЕТ)" "$([ $K = 2 ] && [ "$(s $R/boj/f.sh)" = "$d0" ] && grep -q 'такого файла в вызове нет' $R/out && echo 1)" "$(tail -1 $R/out)"
# O6 ключ одному из двух → отказ, ни один не тронут
rm -rf $R/k/o6; mkdir -p $R/k/o6; printf 'f v6\n' > $R/k/o6/f.sh; printf 'g v6\n' > $R/k/o6/g.sh; df=$(s $R/boj/f.sh); dg=$(s $R/boj/g.sh)
K=$(zov --punkt $P-o6 --v-boj --osnova f.sh=$df $R/k/o6 $R/boj f.sh g.sh)
sud "O6 основа одному из двух: код $K · f,g не тронуты $([ "$(s $R/boj/f.sh)$(s $R/boj/g.sh)" = "$df$dg" ] && echo да || echo НЕТ)" "$([ $K = 2 ] && [ "$(s $R/boj/f.sh)$(s $R/boj/g.sh)" = "$df$dg" ] && grep -q 'не всем монтируемым файлам: нет для «g.sh»' $R/out && echo 1)" "$(tail -1 $R/out)"
# O7 негодная форма (15 hex) → отказ
K=$(zov --punkt $P-o7 --v-boj --osnova f.sh=${df:0:15} $R/k/o6 $R/boj f.sh)
sud "O7 сумма короче 16: код $K" "$([ $K = 2 ] && grep -q 'нужно <файл>=<sha256' $R/out && echo 1)" "$(tail -1 $R/out)"
K=$(zov --punkt $P-o7b --v-boj --osnova f.sh=$(s $R/boj/f.sh 20) $R/k/o6 $R/boj f.sh)
sud "O7б сумма 20 hex (не 16 и не 64): код $K" "$([ $K = 2 ] && grep -q 'нужно <файл>=<sha256' $R/out && echo 1)" "$(tail -1 $R/out)"
K=$(zov --punkt $P-o7v --v-boj --osnova f.sh=nebylo $R/k/o6 $R/boj f.sh)
sud "O7в значение не hex и не net: код $K" "$([ $K = 2 ] && grep -q 'нужно <файл>=<sha256' $R/out && echo 1)" "$(tail -1 $R/out)"
# O8 основа на файл, которого в бою нет (--novyj) → отказ, файл не создан
kand o8 'n v1\n' n.sh; K=$(zov --punkt $P-o8 --v-boj --novyj --osnova n.sh=$df $R/k/o8 $R/boj n.sh)
sud "O8 основа-сумма, а в бою файла нет: код $K · создан $([ -e $R/boj/n.sh ] && echo ДА || echo нет)" "$([ $K = 2 ] && [ ! -e $R/boj/n.sh ] && grep -q 'а в бою файла' $R/out && echo 1)" "$(tail -1 $R/out)"
K=$(zov --punkt $P-o8b --v-boj --novyj --osnova n.sh=net $R/k/o8 $R/boj n.sh)
sud "O8б новый, основа net, файла нет → ставится: код $K · n → $(s $R/boj/n.sh)" "$([ $K = 0 ] && [ "$(s $R/boj/n.sh)" = "$(s $R/k/o8/n.sh)" ] && echo 1)" "$(tail -1 $R/out)"
kand o8v 'm v1-kandidat\n' m.sh; printf 'm chuzhoj-novyj\n' > $R/boj/m.sh; cm=$(s $R/boj/m.sh); echo "   порча внесена: в бою появился чужой m.sh $cm"
K=$(zov --punkt $P-o8v --v-boj --novyj --osnova m.sh=net $R/k/o8v $R/boj m.sh)
sud "O8в основа net, а файл появился: код $K · чужой цел $([ "$(s $R/boj/m.sh)" = "$cm" ] && echo да || echo НЕТ)" "$([ $K = 2 ] && [ "$(s $R/boj/m.sh)" = "$cm" ] && grep -q '«файла нет», а в бою он есть' $R/out && echo 1)" "$(tail -1 $R/out)"
# O9 --snyat с --osnova → отказ
K=$(zov --punkt $P-o9 --snyat --v-boj --osnova g.sh=$dg $R/boj g.sh)
sud "O9 --snyat с --osnova: код $K · g.sh на месте $([ -e $R/boj/g.sh ] && echo да || echo НЕТ)" "$([ $K = 2 ] && [ -e $R/boj/g.sh ] && grep -q 'при --snyat не применяется (B-N-1848)' $R/out && echo 1)" "$(tail -1 $R/out)"
# O10 полная сумма 64 hex, ключ формой --osnova= → монтаж
dg64=$(s $R/boj/g.sh 64); K=$(zov --punkt $P-o10 --v-boj --osnova=g.sh=$dg64 $R/k/o6 $R/boj g.sh)
sud "O10 64 hex, форма --osnova=: код $K · g → $(s $R/boj/g.sh)" "$([ $K = 0 ] && [ "$(s $R/boj/g.sh)" = "$(s $R/k/o6/g.sh)" ] && echo 1)" "$(tail -1 $R/out)"
# O11 --progon с порчей тоже отказывает (план не обещает того, что бой не примет)
kand o11 'f v11\n' f.sh; K=$(zov --punkt $P-o11 --progon --osnova f.sh=0000000000000000 $R/k/o11 $R/boj f.sh)
sud "O11 --progon, основа ≠ бою: код $K" "$([ $K = 2 ] && grep -q 'бой ≠ основе' $R/out && echo 1)" "$(tail -1 $R/out)"
# O12 три файла, основа не сошлась у среднего (предполёт) → не смонтирован ни один
printf 'a v1\n' > $R/boj/a.sh; printf 'b v1\n' > $R/boj/b.sh; printf 'c v1\n' > $R/boj/c.sh
rm -rf $R/k/o12; mkdir -p $R/k/o12; for x in a b c; do printf "$x v2\n" > $R/k/o12/$x.sh; done
oa=$(s $R/boj/a.sh); ob=$(s $R/boj/b.sh); oc=$(s $R/boj/c.sh); printf 'b chuzhaya-pravka\n' > $R/boj/b.sh; vse0="$(s $R/boj/a.sh)$(s $R/boj/b.sh)$(s $R/boj/c.sh)"
echo "   порча внесена: b.sh $ob → $(s $R/boj/b.sh)"
K=$(zov --punkt $P-o12 --v-boj --osnova a.sh=$oa --osnova b.sh=$ob --osnova c.sh=$oc $R/k/o12 $R/boj a.sh b.sh c.sh)
sud "O12 три файла, у среднего бой ≠ основе: код $K · суммы всех трёх до=после $([ "$vse0" = "$(s $R/boj/a.sh)$(s $R/boj/b.sh)$(s $R/boj/c.sh)" ] && echo да || echo НЕТ) · страховок $(st o12)" \
  "$([ $K = 2 ] && [ "$vse0" = "$(s $R/boj/a.sh)$(s $R/boj/b.sh)$(s $R/boj/c.sh)" ] && [ $(st o12) = 0 ] && grep -q "бой ≠ основе: $R/boj/b.sh" $R/out && echo 1)" "$(tail -1 $R/out)"
# O13 ГОНКА под замком: предполёт прошёл, инструмент ждёт замок с готовыми временными копиями; чужая правка b.sh; замок отпущен → отказ, ни один не заменён
oa=$(s $R/boj/a.sh); ob=$(s $R/boj/b.sh); oc=$(s $R/boj/c.sh)
exec 9>>$R/zamok; flock 9
( exec 9>&-; rm -f -- "$MO_STATE_DIR"/*.json; "$I" --punkt $P-o13 --v-boj --osnova a.sh=$oa --osnova b.sh=$ob --osnova c.sh=$oc $R/k/o12 $R/boj a.sh b.sh c.sh > $R/out13 2>&1; echo $? > $R/kod13 ) &
for t in $(seq 1 300); do [ "$(ls -A $R/boj | grep -c '\.smf-')" = 3 ] && break; sleep 0.1; done
vr=$(ls -A $R/boj | grep -c '\.smf-'); printf 'b chuzhaya-pravka-2\n' > $R/boj/b.sh; pb=$(s $R/boj/b.sh)
echo "   гонка: временных копий у замка $vr, чужая правка b.sh $ob → $pb, отпускаю замок"
flock -u 9; exec 9>&-; wait
K=$(cat $R/kod13); ost=$(ls -A $R/boj | grep -c '\.smf-')
sud "O13 правка между предполётом и mv: код $K · a,c прежние $([ "$(s $R/boj/a.sh)$(s $R/boj/c.sh)" = "$oa$oc" ] && echo да || echo НЕТ) · b чужая цела $([ "$(s $R/boj/b.sh)" = "$pb" ] && echo да || echo НЕТ) · временных осталось $ost" \
  "$([ "$vr" = 3 ] && [ $K = 2 ] && [ "$(s $R/boj/a.sh)$(s $R/boj/c.sh)" = "$oa$oc" ] && [ "$(s $R/boj/b.sh)" = "$pb" ] && [ $ost = 0 ] && grep -q 'ПОД ЗАМКОМ' $R/out13 && echo 1)" "$(tail -1 $R/out13)"
echo "ИТОГ: ok=$ok FAIL=$fail"
rm -rf -- /var/backups/montazh/$P-* "$R"
[ "$fail" = 0 ]
