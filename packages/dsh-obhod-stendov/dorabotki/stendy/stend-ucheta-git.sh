#!/bin/bash
# Стенд B-N-923 v4 (Заря; подстава — mktemp -d: v1–v3 держали ФИКСИРОВАННЫЙ /var/tmp/b923, и два прогона разом портили друг друга (26.09 11:14Z); + рука по таблице/SMF_RUKA, + снятие, + пути под .gitignore): smontirovat-fajly — коммит учёта git сам. Запуск от root: bash stend-ucheta-git.sh <инструмент>
# Подстава /var/tmp/b923: свой git-корень, свой «dorabotki» (тоже под git), не-git каталог. SMF_PARY/SMF_DORABOTKI/SMF_ISKRA_IN/
# SMF_NASHI — подмена (инструмент печатает её строкой ПОДМЕНА). ⚠️ ПИШЕТ В НАСТОЯЩИЙ ЖУРНАЛ инструмента: пункты PROBA-B923-<pid>-*.
# Страховки /var/backups/montazh/PROBA-B923-<pid>-* и /var/tmp/b923 стенд убирает сам в конце.
set -u
I=$1; R=$(mktemp -d /var/tmp/b923.XXXXXX) || exit 2; chmod 755 $R; mkdir -p $R/git/sub $R/nogit $R/dorabotki $R/in $R/k $R/chuzhoj $R/paket
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
# B-N-1693 test-only: suppress real journal and registry reads.
mkdir -p "$R/bin"
printf '#!/bin/sh\nexit 0\n' > "$R/bin/logger"
chmod 755 "$R/bin/logger"
export PATH="$R/bin:$PATH" SMF_REESTR_PL="$R/plugins.yaml" SMF_MANIFEST="$R/manifest.txt"
printf 'plugins: []\nservices: []\n' > "$R/plugins.yaml"   # B-N-2038: пустой файл — «registry shape invalid» у окна (с 3.1.8)
:; : > "$R/manifest.txt"
chown nobody:nogroup $R/in; chmod 775 $R/in
printf 'w v1\n' > $R/paket/w.sh; printf '%s|%s\n' "$R/paket/w.sh" "$R/nogit/w-para.sh" > $R/pary.txt; : > $R/nashi.sh
export SMF_PARY=$R/pary.txt SMF_DORABOTKI=$R/dorabotki SMF_ISKRA_IN=$R/in SMF_NASHI=$R/nashi.sh
g() { git -C "$1" -c user.name=stend -c user.email=stend@b923 "${@:2}"; }
for d in git dorabotki chuzhoj; do g $R/$d init -q; printf 'a v1\n' > $R/$d/a.sh; printf 'r v1\n' > $R/$d/ryadom.sh; printf 's v1\n' > $R/$d/snyat.sh; g $R/$d add -A; g $R/$d commit -qm init; done
printf 'n v1\n' > $R/nogit/a.sh
printf 'node_modules/@*/\n' > $R/git/.gitignore; mkdir -p $R/git/node_modules/@x; printf 'f v1\n' > $R/git/node_modules/@x/f.js
g $R/git add .gitignore; g $R/git add -f node_modules/@x/f.js; g $R/git commit -qm ignor
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
zov() { rm -f -- "$MO_STATE_DIR"/*.json; "$I" "$@" > $R/out 2>&1; echo $?; }   # B-N-2038: свои окна прошлого вызова
P=PROBA-B923-$$; kand() { rm -rf $R/k/$1; mkdir -p $R/k/$1/$(dirname $3); printf "$2" > $R/k/$1/$3; }
nlog() { git -C "$1" rev-list --count HEAD; }
# G1 монтаж в git-корень: сущ. a.sh + новый sub/b.sh → 1 коммит ровно с ними, чисто, рука claude → Zabava <zabava@aclaude>, сообщение по форме
mkdir -p $R/k/g1/sub; printf 'a v2\n' > $R/k/g1/a.sh; printf 'b v1\n' > $R/k/g1/sub/b.sh
n0=$(nlog $R/git); K=$(SUDO_USER=claude zov --punkt $P-g1 --novyj --mode=644 --owner=root:root --v-boj $R/k/g1 $R/git a.sh sub/b.sh)
fl=$(git -C $R/git show --name-only --format= HEAD | sort | paste -sd' '); msg=$(git -C $R/git log -1 --format=%s); au=$(git -C $R/git log -1 --format='%an <%ae>')
sud "G1 монтаж в git: код $K · коммитов +$(( $(nlog $R/git) - n0 )) · файлы [$fl] · «$msg» · рука $au · status $(git -C $R/git status --porcelain | wc -l) · строка «коммит» $(grep -c '^коммит ' $R/out)" \
  "$([ $K = 0 ] && [ $(( $(nlog $R/git) - n0 )) = 1 ] && [ "$fl" = 'a.sh sub/b.sh' ] && [ "$msg" = "$P-g1: a.sh sub/b.sh (smontirovat-fajly)" ] \
     && [ "$au" = "Zabava <zabava@aclaude>" ] && [ -z "$(git -C $R/git status --porcelain)" ] && grep -q "^коммит $(git -C $R/git rev-parse --short HEAD) в $R/git" $R/out && echo 1)" "$(tail -3 $R/out)"
# G2 чужое рядом: ryadom.sh изменён (не в индексе) + chuzhoj-new.sh новый в индексе → не закоммичены, предупреждение, остались как были
printf 'r v2\n' > $R/git/ryadom.sh; printf 'c\n' > $R/git/chuzhoj-new.sh; git -C $R/git add chuzhoj-new.sh
kand g2 'a v3\n' a.sh; n0=$(nlog $R/git); K=$(zov --punkt $P-g2 --v-boj $R/k/g2 $R/git a.sh)
fl=$(git -C $R/git show --name-only --format= HEAD | paste -sd' '); st=$(git -C $R/git status --porcelain | LC_ALL=C sort | paste -sd'|')
sud "G2 чужое рядом: код $K · коммитов +$(( $(nlog $R/git) - n0 )) · в коммите [$fl] · status [$st] · предупреждений $(grep -c 'чужих незафиксированных 2' $R/out)" \
  "$([ $K = 0 ] && [ $(( $(nlog $R/git) - n0 )) = 1 ] && [ "$fl" = a.sh ] && [ "$st" = ' M ryadom.sh|A  chuzhoj-new.sh' ] && grep -q '⚠️ учёт git.*чужих незафиксированных 2' $R/out && echo 1)" "$(tail -3 $R/out)"
git -C $R/git reset -q chuzhoj-new.sh; rm -f $R/git/chuzhoj-new.sh; git -C $R/git checkout -q ryadom.sh
# G3 dorabotki (под git) → коммита нет, строка «dorabotki», письмо хозяйке легло (прежнее)
kand g3 'a v2\n' a.sh; printf '|%s|\n' "$R/dorabotki/a.sh" > $R/nashi.sh; n0=$(nlog $R/dorabotki); K=$(zov --punkt $P-g3 --v-boj $R/k/g3 $R/dorabotki a.sh)
sud "G3 dorabotki: код $K · коммитов +$(( $(nlog $R/dorabotki) - n0 )) · строка dorabotki $(grep -c 'dorabotki, учёт Искры' $R/out) · писем $(ls $R/in | wc -l)" \
  "$([ $K = 0 ] && [ $(( $(nlog $R/dorabotki) - n0 )) = 0 ] && grep -q 'dorabotki, учёт Искры' $R/out && ! grep -q '^коммит ' $R/out && [ "$(ls $R/in | wc -l)" = 1 ] && echo 1)" "$(tail -3 $R/out)"
# G4 не git → как прежде: код 0, ни строки «учёт git», ни «коммит»
kand g4 'n v2\n' a.sh; K=$(zov --punkt $P-g4 --v-boj $R/k/g4 $R/nogit a.sh)
sud "G4 не git: код $K · строк «учёт git»/«коммит» $(grep -cE '^(учёт git|коммит )' $R/out) · смонтировано $([ "$(cat $R/nogit/a.sh)" = 'n v2' ] && echo да || echo НЕТ)" \
  "$([ $K = 0 ] && [ "$(grep -cE '^(учёт git|коммит )' $R/out)" = 0 ] && [ "$(cat $R/nogit/a.sh)" = 'n v2' ] && echo 1)" "$(tail -3 $R/out)"
# G5 --progon → план «будет коммит в <корень>», коммита нет, бой не тронут
kand g5 'a v9\n' a.sh; n0=$(nlog $R/git); K=$(zov --punkt $P-g5 --progon $R/k/g5 $R/git a.sh)
sud "G5 --progon: код $K · план $(grep -c "учёт git: будет коммит в $R/git — путей 1" $R/out) · коммитов +$(( $(nlog $R/git) - n0 )) · бой не тронут $([ "$(cat $R/git/a.sh)" = 'a v3' ] && echo да || echo НЕТ)" \
  "$([ $K = 0 ] && grep -q "учёт git: будет коммит в $R/git — путей 1" $R/out && [ $(( $(nlog $R/git) - n0 )) = 0 ] && [ "$(cat $R/git/a.sh)" = 'a v3' ] && echo 1)" "$(tail -3 $R/out)"
# G6 содержимое = закоммиченному → «коммита нет» (B-N-1576: кандидат, РАВНЫЙ бою, теперь код 3 — см. G6б; поэтому бой
#   сначала правится МИМО git на «a v4», а кандидат возвращает закоммиченное «a v3»: монтаж есть, коммитить нечего)
printf 'a v4\n' > $R/git/a.sh; kand g6 'a v3\n' a.sh; n0=$(nlog $R/git); K=$(zov --punkt $P-g6 --v-boj $R/k/g6 $R/git a.sh)
sud "G6 без изменений: код $K · коммитов +$(( $(nlog $R/git) - n0 )) · «коммита нет» $(grep -c 'закоммиченному — коммита нет' $R/out)" \
  "$([ $K = 0 ] && [ $(( $(nlog $R/git) - n0 )) = 0 ] && grep -q 'закоммиченному — коммита нет' $R/out && echo 1)" "$(tail -3 $R/out)"
# G6б B-N-1576: кандидат РАВЕН бою → код 3 «монтировать нечего», коммита нет, бой не тронут
kand g6b 'a v3\n' a.sh; n0=$(nlog $R/git); i0=$(stat -c %i $R/git/a.sh); K=$(zov --punkt $P-g6b --v-boj $R/k/g6b $R/git a.sh)
sud "G6б равен бою: код $K · коммитов +$(( $(nlog $R/git) - n0 )) · inode $([ "$i0" = "$(stat -c %i $R/git/a.sh)" ] && echo тот же || echo НОВЫЙ) · «монтировать нечего» $(grep -c 'монтировать нечего' $R/out)" \
  "$([ $K = 3 ] && [ $(( $(nlog $R/git) - n0 )) = 0 ] && [ "$i0" = "$(stat -c %i $R/git/a.sh)" ] && grep -q 'монтировать нечего' $R/out && echo 1)" "$(tail -3 $R/out)"
# G7 чужой .git (как дерево Искры): а) без safe.directory — «не читается»; б) safe.directory через среду — «чужой»; коммита нет в обоих
chown -R nobody:nogroup $R/chuzhoj/.git; kand g7 'a v2\n' a.sh; n0=$(git -c safe.directory='*' -C $R/chuzhoj rev-list --count HEAD)
K=$(zov --punkt $P-g7a --v-boj $R/k/g7 $R/chuzhoj a.sh); a1=$(grep -c 'git под чужим владельцем' $R/out)
kand g7 'a v3\n' a.sh; rm -f -- "$MO_STATE_DIR"/*.json; K2=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$R/chuzhoj" "$I" --punkt $P-g7b --v-boj $R/k/g7 $R/chuzhoj a.sh > $R/out 2>&1; echo $?)
b1=$(grep -c "корень $R/chuzhoj чужой (.git: nobody)" $R/out); n1=$(git -c safe.directory='*' -C $R/chuzhoj rev-list --count HEAD)
sud "G7 чужой .git: коды $K/$K2 · «не читается» $a1 · «чужой» $b1 · коммитов +$((n1 - n0))" \
  "$([ $K = 0 ] && [ $K2 = 0 ] && [ $a1 = 1 ] && [ $b1 = 1 ] && [ $((n1 - n0)) = 0 ] && ! grep -q '^коммит ' $R/out && echo 1)" "$(tail -3 $R/out)"
# G8 коммит сорвался (index.lock занят) → код 5, монтаж В СИЛЕ, строка 🔴
: > $R/git/.git/index.lock; kand g8 'a v4\n' a.sh; n0=$(nlog $R/git); K=$(zov --punkt $P-g8 --v-boj $R/k/g8 $R/git a.sh); rm -f $R/git/.git/index.lock
sud "G8 сбой коммита: код $K · смонтировано $([ "$(cat $R/git/a.sh)" = 'a v4' ] && echo да || echo НЕТ) · коммитов +$(( $(nlog $R/git) - n0 )) · 🔴 $(grep -c '🔴 учёт git' $R/out)" \
  "$([ $K = 5 ] && [ "$(cat $R/git/a.sh)" = 'a v4' ] && [ $(( $(nlog $R/git) - n0 )) = 0 ] && grep -q '🔴 учёт git' $R/out && echo 1)" "$(tail -3 $R/out)"
# G9 рука: а) SMF_RUKA сильнее таблицы (SUDO_USER=claude); б) учётки нет в таблице → ОТКАЗ 2 с причиной (B-N-1551; было «имя <имя@host>» + ⚠️), бой цел, коммита нет; в) кривой SMF_RUKA → отказ 2, бой цел
kand g9 'a v5\n' a.sh; K=$(SUDO_USER=claude SMF_RUKA='Proba Ruka <proba@b923>' zov --punkt $P-g9a --v-boj $R/k/g9 $R/git a.sh); a9=$(git -C $R/git log -1 --format='%an <%ae>')
kand g9 'a v6\n' a.sh; n9=$(nlog $R/git); K2=$(SUDO_USER=nekto zov --punkt $P-g9b --v-boj $R/k/g9 $R/git a.sh); b9=$(cat $R/git/a.sh); k9=$(( $(nlog $R/git) - n9 )); w9=$(grep -cF 'рука коммита учёта не установлена: учётки «nekto» нет в таблице' $R/out)
kand g9 'a v7\n' a.sh; K3=$(SMF_RUKA='просто имя' zov --punkt $P-g9c --v-boj $R/k/g9 $R/git a.sh); c9=$(cat $R/git/a.sh)
sud "G9 рука: SMF_RUKA → «$a9» (код $K) · nekto → код $K2, причина $w9, бой «$b9», коммитов +$k9 · кривой SMF_RUKA → код $K3, бой «$c9»" \
  "$([ $K = 0 ] && [ "$a9" = 'Proba Ruka <proba@b923>' ] && [ $K2 = 2 ] && [ "$b9" = 'a v5' ] && [ $k9 = 0 ] && [ $w9 = 1 ] && [ $K3 = 2 ] && [ "$c9" = 'a v5' ] && echo 1)" "$(tail -3 $R/out)"
# G10 снятие в git-корне → 1 коммит с rename snyat.sh → snyat.sh.SNYATO-<дата>, «(smontirovat-fajly --snyat)», status чист, рука Zabava
n0=$(nlog $R/git); K=$(SUDO_USER=claude zov --punkt $P-g10 --v-boj --snyat $R/git snyat.sh); ns=$(git -C $R/git show --name-status --format= HEAD | tr '\t' ' ' | paste -sd'|')
m10=$(git -C $R/git log -1 --format=%s); a10=$(git -C $R/git log -1 --format='%an <%ae>')
sud "G10 снятие: код $K · коммитов +$(( $(nlog $R/git) - n0 )) · [$ns] · «$m10» · рука $a10 · status $(git -C $R/git status --porcelain | wc -l)" \
  "$([ $K = 0 ] && [ $(( $(nlog $R/git) - n0 )) = 1 ] && [[ "$ns" =~ ^R100\ snyat\.sh\ snyat\.sh\.SNYATO-[0-9]{8}$ ]] && [[ "$m10" == *'(smontirovat-fajly --snyat)' ]] \
     && [ "$a10" = 'Zabava <zabava@aclaude>' ] && [ -z "$(git -C $R/git status --porcelain)" ] && echo 1)" "$(tail -3 $R/out)"
# G11 .gitignore (node_modules/@*/): а) новый неотслеживаемый под игнором → коммитов 0, код 0, «вне учёта»; б) отслеживаемый под игнором →
# коммит; в) снятие отслеживаемого → коммит удаления, .SNYATO «вне учёта», код 0, status чист
kand g11a 'n v1\n' node_modules/@x/novyj.js; n0=$(nlog $R/git); K=$(SUDO_USER=claude zov --punkt $P-g11a --novyj --mode=644 --owner=root:root --v-boj $R/k/g11a $R/git node_modules/@x/novyj.js); na=$(( $(nlog $R/git) - n0 )); wa=$(grep -c 'node_modules/@x/novyj.js — вне учёта (.gitignore)' $R/out)
kand g11b 'f v2\n' node_modules/@x/f.js; n0=$(nlog $R/git); K2=$(SUDO_USER=claude zov --punkt $P-g11b --v-boj $R/k/g11b $R/git node_modules/@x/f.js); nb=$(( $(nlog $R/git) - n0 )); fb=$(git -C $R/git show --name-only --format= HEAD | paste -sd' ')
n0=$(nlog $R/git); K3=$(SUDO_USER=claude zov --punkt $P-g11c --v-boj --snyat $R/git node_modules/@x/f.js); nc=$(( $(nlog $R/git) - n0 )); sc=$(git -C $R/git show --name-status --format= HEAD | tr '\t' ' ' | paste -sd'|'); wc3=$(grep -c 'SNYATO-[0-9]* — вне учёта (.gitignore)' $R/out)
sud "G11 игнор: а) код $K, коммитов $na, «вне учёта» $wa · б) код $K2, коммитов $nb [$fb] · в) снятие код $K3, коммитов $nc [$sc], .SNYATO «вне учёта» $wc3, status $(git -C $R/git status --porcelain | wc -l)" \
  "$([ $K = 0 ] && [ $na = 0 ] && [ $wa = 1 ] && [ $K2 = 0 ] && [ $nb = 1 ] && [ "$fb" = node_modules/@x/f.js ] && [ $K3 = 0 ] && [ $nc = 1 ] && [ "$sc" = 'D node_modules/@x/f.js' ] && [ $wc3 -ge 1 ] && [ -z "$(git -C $R/git status --porcelain)" ] && echo 1)" "$(tail -4 $R/out)"
echo "ИТОГ: ok $ok · fail $fail"
rm -rf $R /var/backups/montazh/$P-*
[ $fail = 0 ]
