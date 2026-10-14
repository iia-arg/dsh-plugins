#!/bin/bash
# Стенд B-N-1027/B-N-1028 (Аврора): предупреждения учёта smontirovat-fajly. Запуск от root: bash stend-ucheta.sh <инструмент>
# Подстава /var/tmp/b1027.XXXXXX: SMF_PARY, SMF_DORABOTKI, SMF_ISKRA_IN, SMF_REESTR_PL, SMF_MANIFEST, SMF_NASHI. Живой учёт не читается.
# Журнал монтажа — ПОДСТАВНОЙ (B-N-1098): у инструмента подмены журнала нет (zhurnal() = «logger -t smontirovat-fajly», метка — константа),
#   но logger зовётся по имени — заглушка первой в PATH пишет в $R/zhurnal.log; U6 читает его, U14 — что в настоящем журнале строк пунктов 0.
# ⚠️ Страховки инструмент кладёт в НАСТОЯЩИЙ /var/backups/montazh/PROBA-B1027-* (MONTAZH — константа, подмены нет) — убираются в конце, только свои.
# Зовущий — ночной обходчик vse-stendy-boevye.sh (строка «@root»: запись и снятие инструмент делает только от root, :150/:157).
# Ждём: U1 снятие пути из plugins.yaml — «стоит в учёте: plugins.yaml:» и «за тобой: запись реестра/учёта у 1 из 1» ·
#   U2 путь нигде — ни того, ни другого · U3 путь только в manifest.txt — «manifest.txt:» · U4 путь только в списке nashi — «nashi:» ·
#   U5 граница имени: в plugins.yaml только «…/f5.shx» — для «…/f5.sh» предупреждения нет · U6 настоящее снятие — журнал v_uchyote=1,
#   письмо несёт «стоит в учёте» · U7 монтаж нового в dorabotki без строки nashi — ОТКАЗ код 2 «сначала строка учёта: <путь>», ничего не легло
#   (B-N-1098: было предупреждение с кодом 0) ·
#   U8 то же со строкой — предупреждения нет · U9 новый *.bak-* — не считается (--check его не смотрит) · U10 список nashi не
#   прочитан — ОТКАЗ код 2 «… не прочитан», ничего не легло (B-N-1098) · U11 строки ПОДМЕНА трёх новых SMF_* · U12 список nashi со строкой
#   едет ЭТИМ ЖЕ вызовом — предупреждения нет (B-N-1028б) · U13 едет тем же вызовом без строки — ОТКАЗ код 2 «сначала строка учёта», ничего
#   не легло (B-N-1098). «Ничего не легло» = сумма подставного dorabotki до=после, письма в ящике нет, страховки пункта нет.
# Подстава — mktemp -d, своя на прогон: фиксированный /var/tmp/b1027 с rm -rf ломал два прогона разом (26.09 11:14Z, находка Вениамина).
# B-N-1098: предмет — довод 1, иначе STEND_SMF, иначе боевой (обходчик зовёт «bash стенд» без доводов; порча — через SREDA_STENDOV)
I=${1:-${STEND_SMF:-/usr/local/sbin/smontirovat-fajly}}; [ -x "$I" ] || { echo "СЛЕПОТА: инструмент не исполняем: $I"; exit 2; }
R=$(mktemp -d /var/tmp/b1027.XXXXXX) || exit 2; chmod 755 $R; mkdir -p $R/boj $R/dorabotki $R/src $R/in $R/k
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
D=$R/dorabotki; P=PROBA-B1027-$$; T0=$(date -u '+%F %T')
export SMF_PARY=$R/pary.txt SMF_DORABOTKI=$D SMF_ISKRA_IN=$R/in SMF_REESTR_PL=$R/plugins.yaml SMF_MANIFEST=$R/manifest.txt SMF_NASHI=$R/nashi.sh
mkdir -p $R/bin; printf '#!/bin/sh\nt=-\nwhile [ $# -gt 0 ]; do case "$1" in -t) shift; t=$1;; --) shift; break;; -*) ;; *) break;; esac; shift; done\necho "$t: $*" >> %s/zhurnal.log\n' $R > $R/bin/logger
chmod 755 $R/bin/logger; export PATH=$R/bin:$PATH   # B-N-1098: подставной журнал монтажа (см. шапку)
summa_d() { find $D -type f -print0 | sort -z | xargs -0 -r sha256sum | sha256sum | cut -c1-16; }   # B-N-1098: «ничего не легло»
nichego() { [ "$1" = "$(summa_d)" ] && [ -z "$(ls -A $R/in 2>/dev/null)" ] && ! ls -d /var/backups/montazh/$P-$2* >/dev/null 2>&1; }
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
for f in f1 f2 f3 f4 f5; do printf 'echo %s\n' $f > $R/boj/$f.sh; chmod 755 $R/boj/$f.sh; done
printf 'echo d\n' > $D/d1.sh; chmod 755 $D/d1.sh
printf '%s|%s\n' $R/src/i.sh $R/boj/v-pare.sh > $R/pary.txt
printf 'plugins:\n  - id: x\n    path: %s\n    installed_check: sha256sum %s | cut -c1-16\n' $R/boj/f1.sh $R/boj/f5.shx > $R/plugins.yaml
printf 'A|%s|abc\nA|%s|def\n' $R/boj/f3.sh $D/d1.sh > $R/manifest.txt
printf '#!/bin/bash\n# список\nA|%s|описание\nD|%s|есть в списке\n' $R/boj/f4.sh $D/uchtyon.sh > $R/nashi.sh
pl() { "$I" --punkt $P-$1 --snyat --progon $R/boj "$2" 2>&1; }
o=$(pl 1 f1.sh); grep -qF 'стоит в учёте: plugins.yaml:' <<< "$o" && grep -qF 'за тобой: запись реестра/учёта у 1 из 1' <<< "$o" \
  && sud "U1 путь в plugins.yaml — предупреждение и «за тобой»" 1 || sud "U1" 0 "$(echo "$o" | tail -3 | tr '\n' ' ')"
o=$(pl 2 f2.sh); ! grep -qF 'стоит в учёте' <<< "$o" && ! grep -qF 'за тобой: запись' <<< "$o" && grep -qF 'ПРОГОН' <<< "$o" \
  && sud "U2 путь нигде — предупреждений 0" 1 || sud "U2" 0 "$(echo "$o" | tail -3 | tr '\n' ' ')"
o=$(pl 3 f3.sh); grep -qF 'стоит в учёте: manifest.txt:' <<< "$o" && sud "U3 только manifest.txt — назван" 1 || sud "U3" 0 "$(echo "$o" | tail -2 | tr '\n' ' ')"
o=$(pl 4 f4.sh); grep -qF 'стоит в учёте: nashi:' <<< "$o" && sud "U4 только список nashi — назван" 1 || sud "U4" 0 "$(echo "$o" | tail -2 | tr '\n' ' ')"
o=$(pl 5 f5.sh); ! grep -qF 'стоит в учёте' <<< "$o" && grep -qF 'ПРОГОН' <<< "$o" && sud "U5 граница имени: «f5.shx» не засчитан за «f5.sh»" 1 || sud "U5" 0 "$(echo "$o" | tail -2 | tr '\n' ' ')"
o=$("$I" --punkt $P-6 --v-boj --snyat $D d1.sh 2>&1); k=$?
zh=$(grep -F "snyato punkt=$P-6 " $R/zhurnal.log 2>/dev/null | grep -cF 'v_uchyote=1')   # B-N-1098: подставной журнал
[ $k = 0 ] && [ "$zh" = 1 ] && grep -qF 'стоит в учёте: manifest.txt:' $R/in/* 2>/dev/null \
  && sud "U6 настоящее снятие: журнал v_uchyote=1, письмо несёт «стоит в учёте»" 1 || sud "U6" 0 "код $k журнал $zh; $(echo "$o" | tail -2 | tr '\n' ' ')"
rm -f $R/in/*
printf 'echo n\n' > $R/k/novyj.sh; printf 'echo u\n' > $R/k/uchtyon.sh; printf 'x\n' > $R/k/staryj.bak-20260926
s0=$(summa_d); o=$("$I" --novyj --mode=644 --owner=root:root --punkt $P-7 --v-boj $R/k $D novyj.sh 2>&1); k=$?
[ $k = 2 ] && grep -qF "сначала строка учёта: $D/novyj.sh" <<< "$o" && nichego "$s0" 7 \
  && sud "U7 новый в dorabotki без строки nashi — ОТКАЗ код 2 «сначала строка учёта», ничего не легло (dorabotki $s0=$(summa_d))" 1 || sud "U7" 0 "код $k; dorabotki $s0→$(summa_d); письма $(ls -A $R/in | wc -l); $(echo "$o" | tail -2 | tr '\n' ' ')"
o=$("$I" --novyj --mode=644 --owner=root:root --punkt $P-8 --progon $R/k $D uchtyon.sh 2>&1); ! grep -qF 'БЕЗ строки учёта' <<< "$o" && grep -qF 'ПРОГОН' <<< "$o" \
  && sud "U8 новый со строкой в nashi — предупреждения нет" 1 || sud "U8" 0 "$(echo "$o" | tail -2 | tr '\n' ' ')"
o=$("$I" --novyj --mode=644 --owner=root:root --punkt $P-9 --progon $R/k $D staryj.bak-20260926 2>&1); ! grep -qF 'БЕЗ строки учёта' <<< "$o" && grep -qF 'ПРОГОН' <<< "$o" \
  && sud "U9 новый *.bak-* — не считается (--check его не смотрит)" 1 || sud "U9" 0 "$(echo "$o" | tail -2 | tr '\n' ' ')"
printf 'echo n2\n' > $R/k/novyj2.sh; s0=$(summa_d); o=$(SMF_NASHI=$R/net-takogo.sh "$I" --novyj --mode=644 --owner=root:root --punkt $P-10 --progon $R/k $D novyj2.sh 2>&1); k=$?
[ $k = 2 ] && grep -qF "список учёта $R/net-takogo.sh не прочитан" <<< "$o" && nichego "$s0" 10 \
  && sud "U10 список nashi не прочитан — ОТКАЗ код 2 «не прочитан», ничего не легло" 1 || sud "U10" 0 "код $k; $(echo "$o" | tail -2 | tr '\n' ' ')"
grep -qF 'ПОДМЕНА: SMF_REESTR_PL=' <<< "$o" && grep -qF 'ПОДМЕНА: SMF_MANIFEST=' <<< "$o" && grep -qF 'ПОДМЕНА: SMF_NASHI=' <<< "$o" \
  && sud "U11 строки ПОДМЕНА трёх новых SMF_*" 1 || sud "U11" 0 "нет строк ПОДМЕНА"
# U12/U13 (B-N-1028б): список nashi едет ЭТИМ ЖЕ вызовом (лежит в бою — в dorabotki)
printf '#!/bin/bash\n# боевой список без строки\n' > $D/nashi.sh
mkdir -p $R/k2; printf 'echo n3\n' > $R/k2/novyj3.sh
printf '#!/bin/bash\nD|%s|едет тем же окном\n' $D/novyj3.sh > $R/k2/nashi.sh
o=$(SMF_NASHI=$D/nashi.sh "$I" --novyj --mode=644 --owner=root:root --punkt $P-12 --progon $R/k2 $D nashi.sh novyj3.sh 2>&1)
! grep -qF 'БЕЗ строки учёта' <<< "$o" && grep -qF 'из кандидата этого вызова' <<< "$o" && grep -qF 'ПРОГОН' <<< "$o" \
  && sud "U12 список nashi со строкой едет тем же вызовом — предупреждения нет, источник назван" 1 || sud "U12" 0 "$(echo "$o" | grep -E 'БЕЗ|список учёта|ОТКАЗ' | head -2 | tr '\n' ' ')"
printf '#!/bin/bash\n# кандидат без строки\n' > $R/k2/nashi.sh
s0=$(summa_d); o=$(SMF_NASHI=$D/nashi.sh "$I" --novyj --mode=644 --owner=root:root --punkt $P-13 --progon $R/k2 $D nashi.sh novyj3.sh 2>&1); k=$?
[ $k = 2 ] && grep -qF "сначала строка учёта: $D/novyj3.sh" <<< "$o" && nichego "$s0" 13 \
  && sud "U13 список едет тем же вызовом, но БЕЗ строки — ОТКАЗ код 2 «сначала строка учёта», ничего не легло" 1 || sud "U13" 0 "код $k; $(echo "$o" | tail -2 | tr '\n' ' ')"
n=$(journalctl -t smontirovat-fajly --since "$T0" --no-pager -o cat 2>/dev/null | grep -cF "punkt=$P-"); z=$(grep -cF "punkt=$P-" $R/zhurnal.log 2>/dev/null)
[ "$n" = 0 ] && [ "${z:-0}" -gt 0 ] && sud "U14 настоящий журнал не тронут: строк punkt=$P-* 0; в подставном $z" 1 || sud "U14" 0 "в настоящем $n, в подставном ${z:-0}"
rm -rf /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-* $R
echo "остатки: $(ls -d /var/backups/montazh/$P-* /var/backups/montazh-s-klyuchom/$P-* 2>/dev/null | wc -l) · $R $([ -e $R ] && echo есть || echo нет)"
echo "ИТОГ: ok=$ok fail=$fail"; [ "$fail" = 0 ] && [ "$ok" = 14 ]   # B-N-1098: +U14
