#!/bin/bash
# Стенд B-N-1026 (Аврора): smontirovat-fajly --snyat на подставе /var/tmp/b1026. Запуск от root: bash stend-snyatiya.sh <инструмент>
# ⚠️ ПИШЕТ В НАСТОЯЩИЙ ЖУРНАЛ инструмента (logger -t smontirovat-fajly): пункты PROBA-B1026-<pid>-*, строки PODMENA;
#   страховки — в НАСТОЯЩИЙ /var/backups/montazh{,-s-klyuchom}/PROBA-B1026-<pid>-* — стенд их убирает в конце (только свои пункты).
# Ждём: S1 снятие одного (755) — код 0, прежнего нет, .SNYATO-<дата> с той же суммой и правами 644, страховка с членом,
#   письмо в подставной ящик, строка «snyato» в журнале · S2 двух (один 600) — код 0, закрытый остаётся 600, страховка в
#   montazh-s-klyuchom · S3 повтор — код 2 «уже снят» · S4 бой пары — 2 · S5 исходник пары — 2 · S6 профиль агента — 2 ·
#   S7 --progon — 0, план, ничего не записано · S8 без файлов — 2 · S9 всё-или-ничего: второй неснимаем (chattr +i) — код 1,
#   первый возвращён с прежними правами 750, второй на месте · S10 строки ПОДМЕНА SMF_* напечатаны.
# Подстава — mktemp -d, своя на прогон: фиксированный /var/tmp/b1026 с rm -rf ломал два прогона разом (26.09 11:14Z, находка Вениамина).
I=$1; R=$(mktemp -d /var/tmp/b1026.XXXXXX) || exit 2; chmod 755 $R; mkdir -p $R/boj $R/dorabotki $R/src $R/in $R/boj/.dsh/profiles/web
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
export SMF_PARY=$R/pary.txt SMF_DORABOTKI=$R/dorabotki SMF_ISKRA_IN=$R/in
D=$(date -u +%Y%m%d); P=PROBA-B1026-$$; T0=$(date -u '+%F %T')
trap 'chattr -i "$R"/dorabotki/d.sh 2>/dev/null; rm -rf "$R" /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-*' EXIT
trap 'exit 143' TERM; trap 'exit 130' INT   # B-N-1768: без этого TERM, пришедший не во время ожидания дочернего, убивает bash МИМО ловушки EXIT (замер: утечки 1/20 → 0/30)
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
s() { sha256sum "$1" 2>/dev/null | cut -c1-64 || echo net; }
f() { printf '%s\n' "$2" > "$1"; chmod "$3" "$1"; }
f $R/dorabotki/a.sh 'echo a' 755; f $R/dorabotki/b.sh 'echo b' 755; f $R/dorabotki/sekret.txt 'tajna' 600
f $R/boj/v-pare.sh 'echo p' 755; f $R/src/ish.sh 'echo p' 644; f $R/boj/prof.yml x 644; f $R/boj/.dsh/profiles/web/cordis.patch.yml x 644
f $R/dorabotki/c.sh 'echo c' 750; f $R/dorabotki/d.sh 'echo d' 755
printf '%s|%s\n' $R/src/ish.sh $R/boj/v-pare.sh > $R/pary.txt
sa=$(s $R/dorabotki/a.sh)
# S1
o=$("$I" --punkt $P-1 --v-boj --snyat $R/dorabotki a.sh 2>&1); k=$?
st=$(ls /var/backups/montazh/$P-1/ 2>/dev/null | wc -l); pis=$(ls $R/in | wc -l)
[ $k = 0 ] && [ ! -e $R/dorabotki/a.sh ] && [ "$(s $R/dorabotki/a.sh.SNYATO-$D)" = "$sa" ] && [ "$(stat -c %a $R/dorabotki/a.sh.SNYATO-$D)" = 644 ] \
  && [ "$st" = 1 ] && tar -tf /var/backups/montazh/$P-1/*.tar | grep -qx "${R#/}/dorabotki/a.sh" && [ "$pis" = 1 ] && grep -qF 'СНЯТО в твоих dorabotki' $R/in/* \
  && sud "S1 снят один: .SNYATO-$D, сумма та же, 755→644, страховка с членом, письмо" 1 || sud "S1" 0 "код $k стр $st писем $pis; $(echo "$o" | tail -2 | tr '\n' ' ')"
# S2
sb=$(s $R/dorabotki/b.sh); o=$("$I" --punkt $P-2 --v-boj --snyat $R/dorabotki b.sh sekret.txt 2>&1); k=$?
[ $k = 0 ] && [ ! -e $R/dorabotki/b.sh ] && [ ! -e $R/dorabotki/sekret.txt ] && [ "$(s $R/dorabotki/b.sh.SNYATO-$D)" = "$sb" ] \
  && [ "$(stat -c %a $R/dorabotki/sekret.txt.SNYATO-$D)" = 600 ] && [ "$(ls /var/backups/montazh-s-klyuchom/$P-2/ 2>/dev/null | wc -l)" = 1 ] \
  && sud "S2 сняты два: закрытый остался 600, страховка в montazh-s-klyuchom" 1 || sud "S2" 0 "код $k; $(echo "$o" | tail -2 | tr '\n' ' ')"
# S3
o=$("$I" --punkt $P-3 --v-boj --snyat $R/dorabotki a.sh 2>&1); k=$?
[ $k = 2 ] && grep -qF 'уже снят' <<< "$o" && sud "S3 повтор — отказ «уже снят»" 1 || sud "S3" 0 "код $k; $(echo "$o" | tail -1)"
# S4 / S5
o=$("$I" --punkt $P-4 --v-boj --snyat $R/boj v-pare.sh 2>&1); k=$?
[ $k = 2 ] && grep -qF 'стоит БОЕМ в паре' <<< "$o" && [ -e $R/boj/v-pare.sh ] && sud "S4 бой пары — отказ, файл на месте" 1 || sud "S4" 0 "код $k; $(echo "$o" | tail -1)"
o=$("$I" --punkt $P-5 --v-boj --snyat $R/src ish.sh 2>&1); k=$?
[ $k = 2 ] && grep -qF 'ИСХОДНИК пары' <<< "$o" && [ -e $R/src/ish.sh ] && sud "S5 исходник пары — отказ, файл на месте" 1 || sud "S5" 0 "код $k; $(echo "$o" | tail -1)"
# S6 (B-N-1564: мёртвый профиль теперь снимается — S6 держит признак жизни: cordis.yml рядом)
f $R/boj/.dsh/profiles/web/cordis.yml x 644
o=$("$I" --punkt $P-6 --v-boj --snyat $R/boj .dsh/profiles/web/cordis.patch.yml 2>&1); k=$?
[ $k = 2 ] && grep -qF 'профиль агента' <<< "$o" && sud "S6 профиль агента — отказ" 1 || sud "S6" 0 "код $k; $(echo "$o" | tail -1)"
# S7
o=$("$I" --punkt $P-7 --snyat --progon $R/boj prof.yml 2>&1); k=$?
[ $k = 0 ] && grep -qF 'ПРОГОН: ничего не записано' <<< "$o" && grep -qF 'план СНЯТИЯ' <<< "$o" && [ -e $R/boj/prof.yml ] && [ ! -e /var/backups/montazh/$P-7 ] \
  && sud "S7 --progon — план, файл на месте, страховки нет" 1 || sud "S7" 0 "код $k; $(echo "$o" | tail -1)"
# S8
o=$("$I" --punkt $P-8 --v-boj --snyat $R/boj 2>&1); k=$?
[ $k = 2 ] && grep -qF 'файлы обязательны' <<< "$o" && sud "S8 без файлов — отказ" 1 || sud "S8" 0 "код $k; $(echo "$o" | tail -1)"
# S9
chattr +i $R/dorabotki/d.sh && vnes=1 || vnes=0
o=$("$I" --punkt $P-9 --v-boj --snyat $R/dorabotki c.sh d.sh 2>&1); k=$?
chattr -i $R/dorabotki/d.sh 2>/dev/null
[ "$vnes" = 1 ] && [ $k = 1 ] && [ -e $R/dorabotki/c.sh ] && [ "$(stat -c %a $R/dorabotki/c.sh)" = 750 ] && [ ! -e $R/dorabotki/c.sh.SNYATO-$D ] && [ -e $R/dorabotki/d.sh ] \
  && sud "S9 всё-или-ничего: второй неснимаем — код 1, первый возвращён 750" 1 || sud "S9" 0 "chattr внесён=$vnes код $k c=$(stat -c %a $R/dorabotki/c.sh 2>&1); $(echo "$o" | tail -2 | tr '\n' ' ')"
# S10
grep -qF 'ПОДМЕНА: SMF_PARY=' <<< "$o" && grep -qF 'ПОДМЕНА: SMF_ISKRA_IN=' <<< "$o" && sud "S10 строки ПОДМЕНА напечатаны" 1 || sud "S10" 0 "нет строк ПОДМЕНА"
zh=$(journalctl -t smontirovat-fajly --since "$T0" --no-pager -o cat 2>/dev/null | grep -cF "snyato punkt=$P-")
echo "журнал: строк «snyato punkt=$P-*» — $zh (ждём 2: S1, S2)"
rm -rf /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-* $R
echo "остатки: montazh $P-* $(ls -d /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-* 2>/dev/null | wc -l) · $R $([ -e $R ] && echo есть || echo нет)"
echo "ИТОГ: ok=$ok fail=$fail"; [ "$fail" = 0 ] && [ "$zh" = 2 ] && [ "$ok" = 10 ]
