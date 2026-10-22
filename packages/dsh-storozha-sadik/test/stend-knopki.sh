#!/bin/bash
# Стенд agent-button-daemon.sh (A-N-1948 №1, №7, Заря): подставной AGENT_BUTTON_ROOT и список во временном каталоге,
# боевой демон и /var/lib/agent-button не трогаются. Демон запускается своей группой процессов (setsid) и гасится
# по сохранённому номеру группы — не маской. Коды стенда: 0 — все ожидания сошлись; 1 — расхождение; 2 — не собран.
# Довод: путь к демону (по умолчанию — соседний ../sbin/agent-button-daemon.sh).
# ЧЕГО НЕ ЛОВИТ: подмену записи между rename и чтением (её закрывает закрытый work/, а не стенд); поведение под root
# от учётки (метка — в её файле 0600); под root (sudo) метка — в файле root 0600, как в бою (проба Вениамина 1).
# ПОЛНОМОЧИЯ ПО УЧЁТКЕ (наряд Забавы 14.10, HIGH-1 Вениамина) — только под root: запросы кладутся ОТ учёток master
# (без sudo) и iskra (полный sudo) через runuser, признак полного sudo — живой sudo -l -U; исполнение доказывает
# файл-след команды, а не только код. Не root — эти пробы НЕ гоняются: СЛЕПОТА, код 2 (если прочие сошлись).
# Под учёткой без полного sudo базовые пробы краснеют по построению: «ping» не её restart — гонять от root или iskra.
set -u
Z=$(cd "$(dirname "$0")/.." && pwd)
D=${1:-$Z/sbin/agent-button-daemon.sh}
[ -r "$D" ] || { echo "СТЕНД НЕ СОБРАН: нет $D"; exit 2; }
command -v setsid >/dev/null || { echo "СТЕНД НЕ СОБРАН: нет setsid"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/stend-knopki.XXXXXX") || exit 2; trap 'rm -rf -- "${T:?}"' EXIT
plohih=0; vsego=0

zalozhit() { # новый корень кнопки и список «ping = echo pong»
  rm -rf -- "$T/r"; mkdir -p "$T/r/pending"
  printf 'ping = echo pong\n' > "$T/allowed.conf"
  METKA="METKA-$RANDOM$RANDOM"; printf '%s\n' "$METKA" > "$T/sekret"; chmod 600 "$T/sekret"
}
progon() { # ждём .rc для каждого имени-довода не дольше 12 с, затем гасим группу демона
  AGENT_BUTTON_ROOT="$T/r" AGENT_BUTTON_CONF="$T/allowed.conf" setsid bash "$D" </dev/null >"$T/demon.out" 2>&1 &
  local P=$! i n
  for i in $(seq 1 24); do
    n=0; for x in "$@"; do [ -e "$T/r/done/$x.rc" ] && n=$((n+1)); done
    [ "$n" = "$#" ] && break; sleep 0.5
  done
  kill -TERM -- "-$P" 2>/dev/null; sleep 0.3; kill -KILL -- "-$P" 2>/dev/null
  wait "$P" 2>/dev/null
  pgrep -g "$P" >/dev/null && echo "     ⚠️ группа $P не погасла"
}
rc_of() { cat "$T/r/done/$1.rc" 2>/dev/null || echo 'нет'; }
vidno() { grep -rlF -- "$1" "$T/r/done" "$T/r/logs" 2>/dev/null | wc -l; }
ozhid() { # имя условие(0/1) пояснение
  vsego=$((vsego+1))
  if [ "$2" = 1 ]; then echo "  ✅ $1 — $3"; else echo "  ❌ $1 — $3"; plohih=$((plohih+1)); fi
}

zalozhit; printf 'ping\n' > "$T/r/pending/a.cmd"; echo "     внесено: обычный запрос «ping» — файлов $(ls "$T/r/pending" | wc -l)"
progon a
ozhid 'исправное: запрос из списка исполнен' "$([ "$(rc_of a)" = 0 ] && grep -qx pong "$T/r/done/a.out" && echo 1 || echo 0)" "rc $(rc_of a), вывод «$(head -c 40 "$T/r/done/a.out" 2>/dev/null)»"

zalozhit; ln -s "$T/sekret" "$T/r/pending/s.cmd"; echo "     внесено: символьная ссылка ($(test -L "$T/r/pending/s.cmd" && echo 'test -L да')) → файл $(stat -c '%U %a' "$T/sekret"), меток в нём $(grep -cF "$METKA" "$T/sekret")"
progon s
ozhid 'порча: ссылка на чужой файл — метки нет в done/ и журнале' "$([ "$(vidno "$METKA")" = 0 ] && [ "$(rc_of s)" = 65 ] && echo 1 || echo 0)" "файлов с меткой $(vidno "$METKA"), rc $(rc_of s)"

zalozhit; ln "$T/sekret" "$T/r/pending/h.cmd"; echo "     внесено: жёсткая ссылка на файл $(stat -c '%U %a' "$T/sekret") — ссылок $(stat -c '%h' "$T/sekret"), меток $(grep -cF "$METKA" "$T/sekret")"
progon h
ozhid 'порча: жёсткая ссылка — метки нет, отказ' "$([ "$(vidno "$METKA")" = 0 ] && [ "$(rc_of h)" = 65 ] && echo 1 || echo 0)" "файлов с меткой $(vidno "$METKA"), rc $(rc_of h)"

zalozhit; mkfifo "$T/r/pending/a-fifo.cmd"; printf 'ping\n' > "$T/r/pending/b.cmd"; echo "     внесено: FIFO a-fifo.cmd ($(test -p "$T/r/pending/a-fifo.cmd" && echo 'test -p да')) перед обычным b.cmd"
progon a-fifo b
ozhid 'порча: FIFO не вешает кнопку — соседний запрос исполнен' "$([ "$(rc_of b)" = 0 ] && [ "$(rc_of a-fifo)" = 65 ] && echo 1 || echo 0)" "rc b $(rc_of b), rc fifo $(rc_of a-fifo)"

zalozhit; printf '%s\n' "$METKA" > "$T/r/pending/n.cmd"; echo "     внесено: запрос не из списка, текст — метка ($(grep -cxF "$METKA" "$T/r/pending/n.cmd") строка)"
progon n
ozhid 'порча: текст непринятого запроса не повторяется в done/ и журнале' "$([ "$(vidno "$METKA")" = 0 ] && [ "$(rc_of n)" = 64 ] && echo 1 || echo 0)" "файлов с меткой $(vidno "$METKA"), rc $(rc_of n)"

zalozhit; NL=$'\n'; printf 'ping\n' > "$T/r/pending/x${NL}PODDELKA-$METKA.cmd"; printf 'ping\n' > "$T/r/pending/z.cmd"
echo "     внесено: имя запроса с переводом строки — файлов с переводом в имени $(ls -b "$T/r/pending" | grep -c '\\n'), за ним обычный z.cmd"
progon z
ozhid 'порча: перевод строки в имени не подделывает строку журнала' "$([ "$(grep -h -c "^PODDELKA-$METKA" "$T"/r/logs/* 2>/dev/null | paste -sd+ | bc)" = 0 ] && [ "$(rc_of z)" = 0 ] && echo 1 || echo 0)" "строк журнала, начатых подделкой: $(grep -h -c "^PODDELKA-$METKA" "$T"/r/logs/* 2>/dev/null | paste -sd+ | bc), rc z $(rc_of z)"

if [ "$(id -u)" = 0 ] && command -v runuser >/dev/null && id master >/dev/null 2>&1 && id iskra >/dev/null 2>&1; then
  polnomochiya() { # новый корень; список — команды оставляют файл-след; pending доступен учёткам
    rm -rf -- "$T/r" "$T/sled"; mkdir -p "$T/r/pending" "$T/sled"; chmod 711 "$T" "$T/r"; chmod 1777 "$T/r/pending"
    : > "$T/allowed.conf"
    for c in restart-master restart-gateway-master restart-iskra reboot-server restart-memory; do
      printf '%s = touch %s/sled/%s\n' "$c" "$T" "$c" >> "$T/allowed.conf"
    done
  }
  ot() { runuser -u "$1" -- sh -c 'printf "%s\n" "$2" > "$3"' _ "$1" "$2" "$T/r/pending/$3.cmd"; } # учётка текст имя
  sled() { [ -e "$T/sled/$1" ] && echo 1 || echo 0; }
  polnomochiya   # прогон 1 — только запросы master (без sudo): следы отличают исполненное от отказанного
  ot master restart-master m1; ot master reboot-server m2; ot master restart-iskra m3; ot master restart-gateway-master m4
  ot master restart-memory iskra-ot-iskra   # подлог: «чужое» имя запроса — решает владелец файла
  echo "     внесено: запросов $(ls "$T/r/pending" | wc -l), владельцы: $(stat -c '%U' "$T"/r/pending/* | sort | uniq -c | tr -s ' ' | paste -sd,)"
  progon m1 m2 m3 m4 iskra-ot-iskra
  ozhid 'полномочия: master → restart-master исполнено' "$([ "$(rc_of m1)" = 0 ] && [ "$(sled restart-master)" = 1 ] && echo 1 || echo 0)" "rc $(rc_of m1), след $(sled restart-master)"
  ozhid 'полномочия: master → restart-gateway-master исполнено' "$([ "$(rc_of m4)" = 0 ] && [ "$(sled restart-gateway-master)" = 1 ] && echo 1 || echo 0)" "rc $(rc_of m4), след $(sled restart-gateway-master)"
  ozhid 'полномочия: master → reboot-server отказ 77, не исполнено' "$([ "$(rc_of m2)" = 77 ] && [ "$(sled reboot-server)" = 0 ] && echo 1 || echo 0)" "rc $(rc_of m2), след $(sled reboot-server)"
  ozhid 'полномочия: master → restart-iskra отказ 77, не исполнено' "$([ "$(rc_of m3)" = 77 ] && [ "$(sled restart-iskra)" = 0 ] && echo 1 || echo 0)" "rc $(rc_of m3), след $(sled restart-iskra)"
  ozhid 'полномочия: подлог (имя «iskra-ot-iskra», владелец master) → restart-memory отказ 77' "$([ "$(rc_of iskra-ot-iskra)" = 77 ] && [ "$(sled restart-memory)" = 0 ] && echo 1 || echo 0)" "rc $(rc_of iskra-ot-iskra), след $(sled restart-memory)"
  ozhid 'полномочия: причина отказа в done/ называет учётку' "$(grep -qF 'учётка master без полного sudo' "$T/r/done/m2.out" 2>/dev/null && echo 1 || echo 0)" "«$(head -c 80 "$T/r/done/m2.out" 2>/dev/null)»"
  polnomochiya   # прогон 2 — только запросы iskra (полный sudo)
  ot iskra reboot-server i1; ot iskra restart-master i2; ot iskra restart-memory i3
  echo "     внесено: запросов $(ls "$T/r/pending" | wc -l), владельцы: $(stat -c '%U' "$T"/r/pending/* | sort | uniq -c | tr -s ' ' | paste -sd,)"
  progon i1 i2 i3
  ozhid 'полномочия: iskra (полный sudo) → reboot-server, restart-master, restart-memory исполнены' "$([ "$(rc_of i1)$(rc_of i2)$(rc_of i3)" = 000 ] && [ "$(sled reboot-server)$(sled restart-master)$(sled restart-memory)" = 111 ] && echo 1 || echo 0)" "rc $(rc_of i1)/$(rc_of i2)/$(rc_of i3), следы $(sled reboot-server)$(sled restart-master)$(sled restart-memory)"
  echo "  итог: расхождений $plohih из $vsego"
  [ "$plohih" = 0 ]
else
  echo "  итог: расхождений $plohih из $vsego"
  echo "  ⚠️ СЛЕПОТА: полномочия по учётке (7 проб) не проверены — нужен root, runuser и учётки master/iskra"
  [ "$plohih" = 0 ] && exit 2 || exit 1
fi
