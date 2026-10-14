#!/bin/bash
# Стенд B-N-1054 (Заря): hvosty-vartmp-watch на подставном корне (mktemp), канал — заглушка в файл. От любой учётки.
# bash stend-hvostov.sh [сторож] — по умолчанию БОЕВОЙ /usr/local/sbin/hvosty-vartmp-watch; подмена: довод или HVOSTY_BIN. Боевой /var/tmp, перечень и agent-alert не трогаются (VT_* подменой).
set -u
I=${1:-${HVOSTY_BIN:-/usr/local/sbin/hvosty-vartmp-watch}}; R=$(mktemp -d /var/tmp/stend-hvostov.XXXXXX) || exit 2; trap 'rm -rf "$R"' EXIT
K=$R/koren; mkdir -p $K; KAN=$R/kanal.txt
printf '#!/bin/sh\n[ "$1" = --plain ] && [ "$2" = -- ] || exit 2\nshift 2\nprintf "%%s\\n===\\n" "$1" >> %s\n' "$KAN" > $R/alert; chmod 755 $R/alert
printf '#!/bin/sh\nexit 1\n' > $R/alert-otkaz; chmod 755 $R/alert-otkaz
star() { touch -h -d '-5 days' "$@"; }
# предметы
mkdir -p $K/svezhij.aaaa; echo x > $K/svezhij.aaaa/f                                     # свежий
mkdir -p $K/broshennyj.bbbb/sub; echo x > $K/broshennyj.bbbb/sub/f; head -c 5000 /dev/zero > $K/broshennyj.bbbb/big
star $K/broshennyj.bbbb/sub/f $K/broshennyj.bbbb/big $K/broshennyj.bbbb/sub $K/broshennyj.bbbb   # старый целиком
mkdir -p $K/uborka-proba; echo x > $K/uborka-proba/f; star $K/uborka-proba/f $K/uborka-proba   # долгожитель, срок жив
mkdir -p $K/kandidaty-staryj; echo x > $K/kandidaty-staryj/f; star $K/kandidaty-staryj/f $K/kandidaty-staryj  # срок истёк
mkdir -p $K/systemd-private-abc-x.service-Q; echo x > $K/systemd-private-abc-x.service-Q/f; star $K/systemd-private-abc-x.service-Q/f $K/systemd-private-abc-x.service-Q
mkdir -p $K/glubokij.cccc/a/b; echo x > $K/glubokij.cccc/a/b/svezhij; star $K/glubokij.cccc/a $K/glubokij.cccc   # старый каталог, свежий файл в глубине
echo x > $K/staryj-fajl.txt; star $K/staryj-fajl.txt                                          # старый файл верхнего уровня
P=$R/perechen.txt
printf '# проба\nuborka-* 2099-01-01 mihalych | карантин проба\nkandidaty-* 2000-01-01 mihalych | истёкший\n' > $P
ok=0; fail=0; sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { : > $KAN; VT_KOREN=$K VT_PERECHEN=$P VT_ALERT=${A:-$R/alert} "$I" > $R/out 2>&1; echo $?; }
k=$(zov); t=$(cat $KAN)
sud "П1 свежее молчит" "$(! grep -q 'svezhij.aaaa' $KAN && echo 1)" "$t"
sud "П2 старое → тревога: имя · владелец · объём · возраст (код $k)" "$([ $k = 1 ] && grep -qE "^broshennyj.bbbb · $(id -un) · [0-9.]+ (КБ|Б) · 5\.0 сут$" $KAN && grep -qE '^staryj-fajl.txt · ' $KAN && echo 1)" "$t"
sud "П3 долгожитель со сроком — молчит" "$(! grep -q 'uborka-proba' $KAN && echo 1)" "$t"
sud "П4 долгожитель с истёкшим сроком → тревога с пометкой" "$(grep -qE '^kandidaty-staryj · .* · срок исключения истёк 2000-01-01 \(хозяин mihalych\)$' $KAN && echo 1)" "$t"
sud "П5 systemd-private-* молчит" "$(! grep -q 'systemd-private' $KAN && echo 1)" "$t"
sud "П6 старый каталог со свежим файлом в глубине — молчит (возраст по дереву)" "$(! grep -q 'glubokij.cccc' $KAN && echo 1)" "$t"
sud "П6б в тревоге ровно 3 хвоста (broshennyj, kandidaty-staryj, staryj-fajl)" "$(grep -q 'хвостов старше 72 ч — 3' $R/out && echo 1)" "$(tail -1 $R/out)"
printf 'uborka-* 2099-01-01 mihalych | карантин\nkrivaya stroka bez prichiny\n' > $P
k=$(zov); sud "П7 негодная строка перечня → код 2, строка названа, прочее работает" "$([ $k = 2 ] && grep -q 'СЛЕПОТА: строка 2 перечня негодна' $R/out && grep -q 'broshennyj.bbbb' $KAN && echo 1)" "код $k · $(head -3 $R/out)"
printf '# проба\nuborka-* 2099-01-01 mihalych | карантин проба\nkandidaty-* 2000-01-01 mihalych | истёкший\n' > $P
k=$(A=$R/alert-otkaz zov); sud "П8 канал отказал → код 3" "$([ $k = 3 ] && grep -q 'ТРЕВОГА НЕ ДОСТАВЛЕНА' $R/out && echo 1)" "код $k"
rm -rf $K/broshennyj.bbbb $K/kandidaty-staryj $K/staryj-fajl.txt
k=$(zov); sud "П9 хвостов нет → код 0, канал молчит" "$([ $k = 0 ] && [ ! -s $KAN ] && echo 1)" "код $k · $(tail -1 $R/out)"
echo "ИТОГ: ok $ok · fail $fail"
[ $fail = 0 ]
