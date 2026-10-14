#!/usr/bin/env bash
# stend-mail-stop-hold.sh [инструмент] — 23 пробы (9–16: snyat-pauzu, B-N-1596; 17–23: квитанция стопа, B-N-1605) на базе, созданной КОДОМ telegram (mail-stop-hold-podgotovit.mjs), суд итога — КОДОМ telegram
#   (mail-stop-hold-proverit.mjs). Инструмент — по умолчанию боевой /usr/local/sbin/mail-stop-hold. Код telegram — MSH_TELEGRAM (умолчание —
#   боевой /opt/agent-plugins/dsh-telegram-multiagent); в нём нет модулей стопа (telegram до 2.5.72) — СЛЕПОТА, код 2, не зелёное.
#   B-N-1536 (Заря); боевая редакция — по находке Искры (прежняя брала telegram из кандидата Зари).
I=${1:-/usr/local/sbin/mail-stop-hold}; [ -x "$I" ] || { echo "СЛЕПОТА: инструмент не исполняем: $I"; exit 2; }; M=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; ok=0; bad=0
mkdir -p $T/bin
printf '#!/bin/bash\necho "pid=1 start=3 end=3 poslednee=turn/end zhurnal=est"; exit ${HOD_KOD:-0}\n' > $T/bin/hod; chmod 755 $T/bin/hod
printf '#!/bin/bash\ncase "$*" in *MainPID*) echo "${GW_PID:-1}";; *WorkingDirectory*) echo /net;; *) echo;; esac\n' > $T/bin/systemctl; chmod 755 $T/bin/systemctl
node $M/mail-stop-hold-tg.mjs >/dev/null || { echo "СЛЕПОТА: код telegram для стенда не загружается (MSH_TELEGRAM=${MSH_TELEGRAM:-/opt/agent-plugins/dsh-telegram-multiagent}) — проб нет"; exit 2; }
echo "telegram: ${MSH_TELEGRAM:-/opt/agent-plugins/dsh-telegram-multiagent} версия $(node -e "console.log(require('${MSH_TELEGRAM:-/opt/agent-plugins/dsh-telegram-multiagent}/package.json').version)")"
sleep 300 & SVEZH=$!   # «процесс шлюза», запущенный после started_at (строка начата минуту назад)
nov() { rm -rf $T/l; mkdir -m 700 $T/l; node $M/mail-stop-hold-podgotovit.mjs $T/l "$1" >/dev/null; }
zov() { MSH_DB=$T/l/receipts.sqlite MSH_HOD=$T/bin/hod MSH_SYSTEMCTL=$T/bin/systemctl MSH_BACKUP=$T/bak "$I" "$@" > $T/out 2>&1; echo $?; }
sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "✅ $1"; else bad=$((bad+1)); echo "❌ $1 — $(tail -2 $T/out | tr '\n' ' ' | cut -c1-200)"; fi; }
s() { sha256sum < $T/l/receipts.sqlite | cut -c1-12; }
nov unknown; s0=$(s); k=$(zov pokazat beta)
sud "1 pokazat: код $k, строка unknown видна, владелец ждёт напечатан, база не тронута" "$([ $k = 0 ] && grep -q 'ctl-1 · unknown' $T/out && grep -q 'владелец ждёт: receipt' $T/out && [ "$(s)" = $s0 ] && echo 1)"
k=$(GW_PID=$SVEZH zov snyat beta ctl-1 --prichina 'проба стенда М1')
sud "2 snyat без --v-boj: код $k, «ПРОГОН», база не тронута" "$([ $k = 0 ] && grep -q 'ПРОГОН' $T/out && [ "$(s)" = $s0 ] && echo 1)"
nov waiting; s0=$(s); k=$(GW_PID=$SVEZH zov snyat beta ctl-1 --prichina 'проба стенда М1' --v-boj)
sud "3 активный стоп (waiting) — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'это не HOLD' $T/out && [ "$(s)" = $s0 ] && echo 1)"
nov unknown; s0=$(s); k=$(HOD_KOD=1 GW_PID=$SVEZH zov snyat beta ctl-1 --prichina 'проба стенда М1' --v-boj)
sud "4 ход идёт (hod 1) — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'платформа' $T/out && [ "$(s)" = $s0 ] && echo 1)"
k=$(GW_PID=1 zov snyat beta ctl-1 --prichina 'проба стенда М1' --v-boj)
sud "5 шлюз не сменился и нет --sdk-sverka — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'sdk-sverka' $T/out && [ "$(s)" = $s0 ] && echo 1)"
k=$(zov snyat beta ctl-1 --prichina 'проба стенда М1' --v-boj --dry-run); k2=$(GW_PID=$SVEZH zov snyat beta ctl-1 --v-boj)
sud "6 --dry-run и нет причины — отказ 2 оба, не тронут" "$([ $k = 2 ] && [ $k2 = 2 ] && [ "$(s)" = $s0 ] && echo 1)"
do_=$(node $M/mail-stop-hold-proverit.mjs $T/l); k=$(GW_PID=$SVEZH zov snyat beta ctl-1 --prichina 'проба стенда М1' --v-boj); po=$(node $M/mail-stop-hold-proverit.mjs $T/l)
au=$(python3 -c "import sqlite3;print(sqlite3.connect('$T/l/receipts.sqlite').execute(\"select count(*) from audit where kind='mail_stop_manual_release'\").fetchone()[0])")
sud "7 снятие --v-boj (шлюз сменился): код $k · пакет до $do_ · после $po · audit $au · страховка $(ls $T/bak 2>/dev/null | wc -l) · пауза этого стопа названа с командой" \
  "$([ $k = 0 ] && [ "$po" = '{"fence":false,"backlog":0,"nativeBlocked":false,"deferOwner":null,"pause":"paused"}' ] && [ $au = 1 ] && [ "$(ls $T/bak | wc -l)" = 1 ] && grep -q 'ПАУЗА ЭТОГО СТОПА ОСТАЛАСЬ' $T/out && grep -q 'snyat-pauzu beta ctl-1' $T/out && echo 1)"
nov unknown; k=$(GW_PID=1 zov snyat beta ctl-1 --prichina 'проба стенда М1' --backlog derzhat --sdk-sverka 'журнал шлюза: terminal req-1' --v-boj); po=$(node $M/mail-stop-hold-proverit.mjs $T/l)
sud "8 --sdk-sverka и backlog derzhat: код $k · пакет $po (fence снят, письмо удержано — nativeBlocked законно)" \
  "$([ $k = 0 ] && [ "$po" = '{"fence":false,"backlog":1,"nativeBlocked":true,"deferOwner":null,"pause":"paused"}' ] && grep -q 'удержанные к модели не пойдут НИКОГДА' $T/out && ! grep -q 'HOLD снят' $T/out && echo 1)"
# B-N-1596: snyat-pauzu — снимает только паузу своего стопа после снятия fence
sq() { python3 -c "import sqlite3,sys;c=sqlite3.connect('$T/l/receipts.sqlite');r=c.execute(sys.argv[1]).fetchall();c.commit();print(r[0][0] if r else '')" "$1"; }
nov unknown; k=$(zov pokazat beta)
sud "9 pokazat показывает паузу стопа: код $k" "$([ $k = 0 ] && grep -q 'пауз, поставленных стопом: 1' $T/out && grep -q 'стоп ctl-1 (unknown)' $T/out && echo 1)"
s0=$(s); k=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --v-boj)
sud "10 snyat-pauzu при fence (unknown) — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'сначала снять fence' $T/out && [ "$(s)" = $s0 ] && echo 1)"
k=$(GW_PID=$SVEZH zov snyat beta ctl-1 --prichina 'проба стенда М1' --v-boj); s0=$(s); k2=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза')
sud "11 после snyat (fence снят: $k) snyat-pauzu без --v-boj — ПРОГОН, не тронут" "$([ $k = 0 ] && [ $k2 = 0 ] && grep -q 'ПРОГОН' $T/out && [ "$(s)" = $s0 ] && echo 1)"
k=$(HOD_KOD=1 zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --v-boj); k2=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --backlog vernut --v-boj); k3=$(zov snyat-pauzu beta ctl-1 --v-boj)
sud "12 ход идёт / чужой ключ --backlog / нет причины — отказ 2 все, не тронут" "$([ $k = 2 ] && [ $k2 = 2 ] && [ $k3 = 2 ] && [ "$(s)" = $s0 ] && echo 1)"
sq "UPDATE conversation_pauses SET command_id='rcp-chuzhoj'" >/dev/null; s1=$(s); k=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --v-boj)
sud "13 пауза поставлена другим стопом — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'не этим стопом' $T/out && [ "$(s)" = $s1 ] && echo 1)"
sq "UPDATE conversation_pauses SET command_id=(SELECT receipt_id FROM mail_stop_controls WHERE control_id='ctl-1'),state='resuming',owner_id='msg-own'" >/dev/null; s1=$(s); k=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --v-boj)
sud "14 пауза resuming (владелец уже снимает) — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'resuming' $T/out && [ "$(s)" = $s1 ] && echo 1)"
sq "UPDATE conversation_pauses SET state='paused',owner_id=NULL" >/dev/null; do_=$(node $M/mail-stop-hold-proverit.mjs $T/l); nb0=$(ls $T/bak | wc -l)
k=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --v-boj); po=$(node $M/mail-stop-hold-proverit.mjs $T/l); au=$(sq "select count(*) from audit where kind='mail_stop_manual_pause_release'")
sud "15 snyat-pauzu --v-boj: код $k · пакет до $do_ · после $po · audit $au · страховок +$(( $(ls $T/bak | wc -l) - nb0 ))" \
  "$([ $k = 0 ] && [ "$po" = '{"fence":false,"backlog":0,"nativeBlocked":false,"deferOwner":null,"pause":null}' ] && [ $au = 1 ] && [ $(( $(ls $T/bak | wc -l) - nb0 )) = 1 ] && grep -q 'пауза снята' $T/out && echo 1)"
s0=$(s); k=$(zov snyat-pauzu beta ctl-1 --prichina 'проба стенда пауза' --v-boj)
sud "16 повтор — паузы нет: отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'снимать нечего' $T/out && [ "$(s)" = $s0 ] && echo 1)"
# B-N-1605: квитанция стопа (blocked=mail_stop_intake) закрывается вместе со snyat; висящая — zakryt-kvitanciyu; суд — настоящий holdTick
nap() { node $M/mail-stop-hold-napominaniya.mjs $T/l; }
nov unknown; k=$(zov pokazat beta)
sud "17 pokazat: открытая квитанция стопа видна (стоп unknown — не «ВИСИТ»)" "$([ $k = 0 ] && grep -q 'открытых квитанций стопа (blocked=mail_stop_intake): 1' $T/out && ! grep -q 'ВИСИТ' $T/out && echo 1)"
k=$(GW_PID=$SVEZH zov snyat beta ctl-1 --prichina 'проба стенда квитанции' --v-boj); n=$(nap); po=$(node $M/mail-stop-hold-proverit.mjs $T/l)
sud "18 snyat --v-boj закрывает свою квитанцию: код $k · $n · backlog/fence $po" \
  "$([ $k = 0 ] && grep -q 'квитанция стопа закрыта 1' $T/out && [ "$n" = '{"stop_open":false,"stop_blocked":null,"stop_new_notices":0,"foreign_open":true}' ] && [ "$po" = '{"fence":false,"backlog":0,"nativeBlocked":false,"deferOwner":null,"pause":"paused"}' ] && echo 1)"
nov unknown; sq "UPDATE mail_stop_controls SET state='superseded'" >/dev/null; k=$(zov pokazat beta)
sud "19 висящая квитанция (стоп снят до B-N-1605) названа с командой" "$([ $k = 0 ] && grep -q 'ВИСИТ — mail-stop-hold zakryt-kvitanciyu beta ctl-1' $T/out && echo 1)"
s0=$(s); k=$(zov zakryt-kvitanciyu beta ctl-1 --prichina 'проба стенда квитанции'); pr=$(grep -c 'ПРОГОН' $T/out); k2=$(zov zakryt-kvitanciyu beta ctl-1 --v-boj); k3=$(zov zakryt-kvitanciyu beta ctl-1 --prichina 'проба стенда квитанции' --backlog vernut --v-boj)
sud "20 zakryt-kvitanciyu: прогон (код $k) не пишет; без причины / чужой ключ — отказ 2" "$([ $k = 0 ] && [ $pr = 1 ] && [ $k2 = 2 ] && [ $k3 = 2 ] && [ "$(s)" = $s0 ] && echo 1)"
nov unknown; s0=$(s); k=$(zov zakryt-kvitanciyu beta ctl-1 --prichina 'проба стенда квитанции' --v-boj)
sud "21 zakryt-kvitanciyu при стопе unknown (fence) — отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'сначала snyat' $T/out && [ "$(s)" = $s0 ] && echo 1)"
nov unknown; sq "UPDATE mail_stop_controls SET state='superseded'" >/dev/null; b0=$(ls $T/bak 2>/dev/null | wc -l); k=$(zov zakryt-kvitanciyu beta ctl-1 --prichina 'проба стенда квитанции' --v-boj); n=$(nap)
au=$(sq "select count(*) from audit where kind='mail_stop_manual_receipt_close'")
sud "22 zakryt-kvitanciyu --v-boj: код $k · $n · audit $au · страховок +$(( $(ls $T/bak | wc -l) - b0 ))" \
  "$([ $k = 0 ] && grep -q 'записано: квитанция закрыта 1' $T/out && [ "$n" = '{"stop_open":false,"stop_blocked":null,"stop_new_notices":0,"foreign_open":true}' ] && [ $au = 1 ] && [ $(( $(ls $T/bak | wc -l) - b0 )) = 1 ] && echo 1)"
s0=$(s); k=$(zov zakryt-kvitanciyu beta ctl-1 --prichina 'проба стенда квитанции' --v-boj)
sud "23 повтор — квитанция уже закрыта: отказ 2, не тронут" "$([ $k = 2 ] && grep -q 'не висит' $T/out && [ "$(s)" = $s0 ] && echo 1)"
kill $SVEZH 2>/dev/null; echo "ИТОГ: ok $ok · fail $bad"; [ $bad = 0 ]
