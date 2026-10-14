#!/bin/bash
# Стенд B-N-1014 v3 (Аврора; условия Вениамина 06:23Z и 06:30Z): smontirovat-fajly — отказ при правке профиля занятого агента. Запуск от root: bash stend-profil.sh <инструмент>
# Подстава /var/tmp/b1014.XXXXXX: дом агента h/.dsh/profiles/web/cordis.patch.yml, h/workspace/.message-receipts/receipts.sqlite;
# SMF_SYSTEMCTL — подставной (list-units/show из файлов), SMF_JOURNALCTL — печатает файл zh. Живые профили не трогаются.
# ⚠️ Пишет в НАСТОЯЩИЙ журнал инструмента строки punkt=PROBA-B1014-*; страховки и /var/tmp/b1014.XXXXXX убирает сам.
# ПЛАН (ДО прогона): P1 свободен → 0, поставил · P2 ход (turn/start) → 2, бой цел, страховок 0 · P3 письмо в очереди → 2 · P4 письмо в ходе → 2
#  · P5 ключ при ходе → 0, поставил, строка profil-na-hodu в журнале 1 · P6 ключ с пустой причиной → 2 · P7 не профиль при ходе → 0
#  · P8 журнал пуст → 2 «не знаю» · P9 базы нет → 2 · P10 службы с этим DSH_HOME нет → 0 «ходу идти негде» · P11 строки ПОДМЕНА SMF_SYSTEMCTL/JOURNALCTL — 2
#  v2: P6b ключ без «=» → 2 · P12 домашний .dsh/cordis.patch.yml при ходе → 2 · P13 пресет при ходе → 0 (вне области, замер) · P14 прибора хода нет → 2
#  v3: P15a шлюз без WD рядом с агентом, агент в ходе → 2 с именем agent.service · P15b то же, агент свободен → 0 · P15c две службы с WD → 2 «не знаю»
#  Прибор хода — HODPRIBOR=<путь> (кандидат hod-sluzhby до монтажа), в инструмент — через SMF_HOD.
set -u
# Подстава — mktemp -d, своя на прогон: фиксированный /var/tmp/b1014 с rm -rf ломал два прогона разом (26.09 11:14Z, находка Вениамина).
# B-N-1768 (07.10, Аврора): обязательные доводы — ДО подставы (отказ не заводит каталог); уборка подставы и своих страховок —
#   ловушкой EXIT на любом выходе (отказ, сигнал TERM/INT), а не последней строкой: прежде отказ ${HODPRIBOR:?} оставлял
#   /var/tmp/b1014.* (12 штук с 02.10). Строки PROBA-* в журнале инструмента ловушка не трогает (как и раньше).
I=${1:?инструмент smontirovat-fajly}; : "${HODPRIBOR:?путь к hod-sluzhby}"
R=$(mktemp -d /var/tmp/b1014.XXXXXX) || exit 2
export MO_STATE_DIR=$R/okna; mkdir -m 755 -- "$MO_STATE_DIR" || { echo "СЛЕПОТА: нет частного каталога окон"; exit 2; }   # B-N-2038: окна монтажа — частные, не боевой /var/lib/montazh-okna
trap 'rm -rf -- "${R:?}"; [ -z "${P:-}" ] || rm -rf -- /var/backups/montazh/"$P"-*' EXIT
trap 'exit 143' TERM; trap 'exit 130' INT
chmod 755 $R; H=$R/h; mkdir -p $H/.dsh/profiles/web $H/workspace/.message-receipts $R/k $R/bin
printf 'id: web\nv: 1\n' > $H/.dsh/profiles/web/cordis.patch.yml; printf 'o v1\n' > $H/.dsh/profiles/web/drugoj.yml
printf '# пары\n/net/ish|/net/boj\n' > $R/pary.txt
DB=$H/workspace/.message-receipts/receipts.sqlite
sqlite3 $DB "create table receipts(id text, received_at int, claimed_turn int, finished_at int, blocked text)"
echo 4242 > $R/pid; printf 'agent.service loaded active running A\nsosed.service loaded active running S\n' > $R/units
cat > $R/bin/systemctl <<SC
#!/bin/bash
case "\$1" in
  list-units) cat $R/units ;;
  show) case "\$*" in *--value*) [ -e $R/show-padaet ] && { echo "Failed to connect to bus" >&2; exit 1; }; cat $R/pid; exit 0;; esac; printf 'Id=agent.service\nMainPID=%s\nWorkingDirectory=$H/workspace\nEnvironment=PATH=/usr/bin DSH_HOME=%s\n\nId=sosed.service\nMainPID=7\nWorkingDirectory=/net\nEnvironment=DSH_HOME=/net/.dsh\n' "\$(cat $R/pid)" "\$(cat $R/dh 2>/dev/null || echo $H/.dsh)"; [ -e $R/gw ] && printf '\nId=gw@agent.service\nMainPID=99\nWorkingDirectory=\nEnvironment=DSH_HOME=$H/.dsh\n'; [ -e $R/dva ] && printf '\nId=agent2.service\nMainPID=98\nWorkingDirectory=/net/w\nEnvironment=DSH_HOME=$H/.dsh\n' ;;
esac
SC
printf '#!/bin/bash\ncat %s/zh\n' $R > $R/bin/journalctl; chmod 755 $R/bin/*
export SMF_HOD=${HODPRIBOR:?путь к hod-sluzhby} SMF_PARY=$R/pary.txt SMF_SYSTEMCTL=$R/bin/systemctl SMF_JOURNALCTL=$R/bin/journalctl SMF_DORABOTKI=$R/net-dorabotki SMF_ISKRA_IN=$R/net-in
s() { sha256sum "$1" 2>/dev/null | cut -c1-16 || echo net; }
ok=0; fail=0; sud() { if [ "${2:-}" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 — ${3:-}"; fi; }
P=PROBA-B1014-$$; st() { ls /var/backups/montazh/$P-$1 2>/dev/null | wc -l; }
kand() { printf "id: web\\nv: $1\\n" > $R/k/cordis.patch.yml; }
zh() { printf '[a] [event] type=turn/start\n[a] [event] type=turn/%s\n' "$1" > $R/zh; }
db() { sqlite3 $DB "delete from receipts"; [ -n "${1:-}" ] && sqlite3 $DB "insert into receipts(id,received_at,claimed_turn,finished_at) values('r1',1,$1,NULL)"
  # Вениамин 04:56Z: ошибка вставки не должна прикидываться красной пробой (так молча упала r1) — сверка числа записей, иначе СЛЕПОТА
  local n z; n=$(sqlite3 $DB "select count(*) from receipts" 2>/dev/null); [ -n "${1:-}" ] && z=1 || z=0
  [ "$n" = "$z" ] || { echo "СЛЕПОТА: подстава квитанций не легла — записей «$n», ждали $z (db ${1:-пусто})"; exit 2; }; }
zov() { rm -f -- "$MO_STATE_DIR"/*.json; "$I" "$@" > $R/out 2>&1; echo $?; }   # B-N-2038: свои окна прошлого вызова
PR=$H/.dsh/profiles/web/cordis.patch.yml
zh end; db; kand 2; K=$(zov --punkt $P-p1 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P1 свободен: код $K · профиль $(s $PR) = кандидат $(s $R/k/cordis.patch.yml)" "$([ $K = 0 ] && [ "$(s $PR)" = "$(s $R/k/cordis.patch.yml)" ] && echo 1)" "$(tail -2 $R/out)"
zh start; db; kand 3; d0=$(s $PR); K=$(zov --punkt $P-p2 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P2 ход идёт: код $K · бой цел $([ "$d0" = "$(s $PR)" ] && echo да || echo НЕТ) · страховок $(st p2) · «$(grep -o 'ЗАНЯТОГО[^—]*' $R/out | head -1)»" "$([ $K = 2 ] && [ "$d0" = "$(s $PR)" ] && [ $(st p2) = 0 ] && grep -q 'ЗАНЯТОГО' $R/out && echo 1)" "$(tail -1 $R/out)"
zh end; db NULL; K=$(zov --punkt $P-p3 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P3 письмо в очереди: код $K · «$(grep -oE 'в ходе [0-9]+, в очереди [0-9]+' $R/out)»" "$([ $K = 2 ] && grep -q 'в очереди 1' $R/out && [ "$d0" = "$(s $PR)" ] && echo 1)" "$(tail -1 $R/out)"
db 5; K=$(zov --punkt $P-p4 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P4 письмо в ходе: код $K · «$(grep -oE 'в ходе [0-9]+, в очереди [0-9]+' $R/out)»" "$([ $K = 2 ] && grep -q 'в ходе 1' $R/out && echo 1)" "$(tail -1 $R/out)"
zh start; db; t0=$(date '+%F %T'); sleep 1; K=$(zov --punkt $P-p5 --v-boj --profil-na-hodu='проба стенда B-N-1014' $R/k $H/.dsh/profiles/web cordis.patch.yml); sleep 1
J=$(journalctl -t smontirovat-fajly --since "$t0" -o cat 2>/dev/null | grep -c "profil-na-hodu punkt=$P-p5 .*prichina=проба стенда B-N-1014")
sud "P5 ключ при ходе: код $K · поставил $([ "$(s $PR)" = "$(s $R/k/cordis.patch.yml)" ] && echo да || echo НЕТ) · строка в журнале $J · «НА ХОДУ» $(grep -c 'ПРОФИЛЬ НА ХОДУ' $R/out)" "$([ $K = 0 ] && [ "$(s $PR)" = "$(s $R/k/cordis.patch.yml)" ] && [ $J = 1 ] && echo 1)" "$(tail -2 $R/out)"
kand 4; K=$(zov --punkt $P-p6 --v-boj --profil-na-hodu=' ' $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P6 ключ с пустой причиной: код $K" "$([ $K = 2 ] && grep -q 'ПУСТОЙ причиной' $R/out && echo 1)" "$(tail -1 $R/out)"
rm -rf $R/k2; mkdir $R/k2; printf 'o v2\n' > $R/k2/drugoj.yml; K=$(zov --punkt $P-p7 --v-boj $R/k2 $H/.dsh/profiles/web drugoj.yml)
sud "P7 не профиль при ходе: код $K · поставил $([ "$(s $H/.dsh/profiles/web/drugoj.yml)" = "$(s $R/k2/drugoj.yml)" ] && echo да || echo НЕТ)" "$([ $K = 0 ] && [ "$(s $H/.dsh/profiles/web/drugoj.yml)" = "$(s $R/k2/drugoj.yml)" ] && echo 1)" "$(tail -1 $R/out)"
: > $R/zh; K=$(zov --punkt $P-p8 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P8 журнал пуст: код $K" "$([ $K = 2 ] && grep -q 'журнал главного процесса пуст' $R/out && echo 1)" "$(tail -1 $R/out)"
zh end; mv $DB $DB.away; K=$(zov --punkt $P-p9 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml); mv $DB.away $DB
sud "P9 базы квитанций нет: код $K" "$([ $K = 2 ] && grep -q 'не читается' $R/out && echo 1)" "$(tail -1 $R/out)"
zh start; echo /drugoj/.dsh > $R/dh; K=$(zov --punkt $P-p10 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml); rm -f $R/dh
sud "P10 службы с этим DSH_HOME нет: код $K · «$(grep -o 'ходу идти негде' $R/out | head -1)»" "$([ $K = 0 ] && grep -q 'ходу идти негде' $R/out && echo 1)" "$(tail -1 $R/out)"
K=$(zov --punkt $P-p11 --progon $R/k $H/.dsh/profiles/web cordis.patch.yml); n=$(grep -cE 'ПОДМЕНА: SMF_(SYSTEMCTL|JOURNALCTL)=' $R/out)
sud "P11 подмены названы: строк ПОДМЕНА SMF_SYSTEMCTL/JOURNALCTL $n" "$([ $n = 2 ] && echo 1)" "$(head -3 $R/out)"
K=$(zov --punkt $P-p6b --v-boj --profil-na-hodu $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P6b ключ без «=»: код $K" "$([ $K = 2 ] && grep -q 'ТРЕБУЕТ причины' $R/out && echo 1)" "$(tail -1 $R/out)"
zh start; db; printf 'dom v1\n' > $H/.dsh/cordis.patch.yml; rm -rf $R/k3; mkdir $R/k3; printf 'dom v2\n' > $R/k3/cordis.patch.yml; d0=$(s $H/.dsh/cordis.patch.yml)
K=$(zov --punkt $P-p12 --v-boj $R/k3 $H/.dsh cordis.patch.yml)
sud "P12 домашний патч при ходе: код $K · бой цел $([ "$d0" = "$(s $H/.dsh/cordis.patch.yml)" ] && echo да || echo НЕТ)" "$([ $K = 2 ] && [ "$d0" = "$(s $H/.dsh/cordis.patch.yml)" ] && grep -q 'ЗАНЯТОГО' $R/out && echo 1)" "$(tail -1 $R/out)"
mkdir -p $H/.dsh/.agent-presets/ag; printf 'pr v1\n' > $H/.dsh/.agent-presets/ag/agent.cordis.yml; rm -rf $R/k4; mkdir $R/k4; printf 'pr v2\n' > $R/k4/agent.cordis.yml
K=$(zov --punkt $P-p13 --v-boj $R/k4 $H/.dsh/.agent-presets/ag agent.cordis.yml)
sud "P13 пресет при ходе (вне области): код $K · поставил $([ "$(s $H/.dsh/.agent-presets/ag/agent.cordis.yml)" = "$(s $R/k4/agent.cordis.yml)" ] && echo да || echo НЕТ)" "$([ $K = 0 ] && [ "$(s $H/.dsh/.agent-presets/ag/agent.cordis.yml)" = "$(s $R/k4/agent.cordis.yml)" ] && echo 1)" "$(tail -1 $R/out)"
zh end; K=$(SMF_HOD=$R/net-pribora zov --punkt $P-p14 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P14 прибора хода нет: код $K" "$([ $K = 2 ] && grep -q 'прибор хода .* не ответил' $R/out && echo 1)" "$(tail -1 $R/out)"
touch $R/gw; zh start; db; kand 7; d0=$(s $PR); K=$(zov --punkt $P-p15a --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P15a шлюз без WD + агент в ходе: код $K · «$(grep -oE 'agent\.service \(pid [0-9]+\)' $R/out | head -1)»" "$([ $K = 2 ] && grep -q 'ЗАНЯТОГО' $R/out && grep -q 'agent.service (pid' $R/out && [ "$d0" = "$(s $PR)" ] && echo 1)" "$(tail -1 $R/out)"
zh end; K=$(zov --punkt $P-p15b --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml)
sud "P15b шлюз без WD + агент свободен: код $K · поставил $([ "$(s $PR)" = "$(s $R/k/cordis.patch.yml)" ] && echo да || echo НЕТ)" "$([ $K = 0 ] && [ "$(s $PR)" = "$(s $R/k/cordis.patch.yml)" ] && echo 1)" "$(tail -1 $R/out)"
touch $R/dva; K=$(zov --punkt $P-p15c --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml); rm -f $R/gw $R/dva
sud "P15c две службы с WD: код $K" "$([ $K = 2 ] && grep -q 'какая живая, не знаю' $R/out && echo 1)" "$(tail -1 $R/out)"
# P16 (B-N-1223): СВОЙ show прибора хода падает, ход идёт — слепота, а не «не запущена»: код 2, бой цел
zh start; db; kand 16; d0=$(s $PR); touch $R/show-padaet; K=$(zov --punkt $P-p16 --v-boj $R/k $H/.dsh/profiles/web cordis.patch.yml); rm -f $R/show-padaet
sud "P16 show прибора упал при ходе: код $K · бой цел $([ "$d0" = "$(s $PR)" ] && echo да || echo НЕТ) · «$(grep -oE 'прибор хода .* не ответил \(код [0-9]+\)' $R/out | head -1)»" "$([ $K = 2 ] && [ "$d0" = "$(s $PR)" ] && grep -q 'не ответил (код 4)' $R/out && echo 1)" "$(tail -2 $R/out)"
echo "ИТОГ: ok $ok · fail $fail"
[ $fail = 0 ]
