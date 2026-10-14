#!/bin/bash
# ОБХОДЧИК СТЕНДОВ ПО ТАЙМЕРУ (A-N-630, Искра, 23.09.2026). Обёртка над vse-stendy-boevye.sh:
# сам обходчик тревог не шлёт и слепоты в итог не складывает — здесь это и делается.
#
# ИСХОДЫ (B-H-203, 25.09.2026 — коды обходчика 0/3/1/2, ожидаемое судит САМ обходчик по /etc/agent-registry/stend-exceptions.yaml):
#          обходчик 0 → строка итога, код 0
#          обходчик 3 (только ОЖИДАЕМОЕ: действующие исключения) → строка «только ожидаемое: имена», код 0
#          обходчик 1 (неожиданное: красный/слепой без исключения, просроченное, неподтверждённое, охват) → ТРЕВОГА, код 1
#          обходчик 2 (полнота неустановима: стендов нет, перечня нет, файла исключений нет) → строка, код 2
#          тревога не доставлена · обходчик убит по времени · иной код · разбор имён ослеп → код 3 и строка 🔴:
#          это поломка САМОГО сторожа; юнит уйдёт в failed (SuccessExitStatus=1 2 в .service),
#          и его увидит сторож упавших служб — тот же читатель, что у остальных.
# 🔴 ПРЕЖНИЙ СПИСОК ozhidaemye-slepoty.txt СНЯТ (решение Забавы 25.09): ожидаемые слепоты переехали в файл исключений
#   обходчика — список один, второй разошёлся бы молча. Здесь только перевод кодов и тревога с ИМЕНАМИ.
# 🔴 РАЗБОР ИМЁН СВЕРЯЕТСЯ (наследник B-N-640): код 1 без единого имени «НЕОЖИДАННО» и без строки охвата, код 3 без
#   единого «ОЖИДАЕМО» — формат сменился, сторож ослеп → код 3 (тревога при коде 1 всё равно уходит, общим текстом).
# ⚠️ ЧЕГО НЕ ЛОВИТ: таймер, не сработавший вовсе (отдельный пункт) · поведение под нагрузкой (так устроены стенды).
set -u
# B-N-1443 r2: отказ ДО запуска обходчика — код 3 (failed); код 2 ниже принадлежит уже вызванному обходчику.
OBHODCHIK="${OBHODCHIK:-/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh}"
ALERT="${VSE_STENDY_ALERT:-$(command -v agent-alert || echo /nonexistent)}"
# B-N-1443: 02.10 замер Искры — прочие 325 стендов 621 с. Предел = ceil100((mimo + 621) × 1,10).
# Сегодня ceil100((1800 + 621) × 1,10) = 2700 с; unit 3000 с. Mimo берём у того же обходчика.
# Marker prevents invoking an old walker that would ignore the query and start the whole suite.
grep -qxF '# VSE_STENDY_PREDEL_API=1' "$OBHODCHIK" || { echo 'СЛЕПОТА: обходчик без API предела'; exit 3; }
mimo=$(timeout -k 2 5 bash "$OBHODCHIK" --predel-stenda /opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh) || { echo 'СЛЕПОТА: предел mimo не прочитан'; exit 3; }
[[ "$mimo" =~ ^[1-9][0-9]{0,5}$ ]] || { echo 'СЛЕПОТА: негодный предел mimo'; exit 3; }
raschet=$(( ((10#$mimo + 621) * 110 + 9999) / 10000 * 100 ))
PREDEL="${VSE_STENDY_PREDEL:-$raschet}"
[[ "$PREDEL" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk -v n="$PREDEL" 'BEGIN {exit !(n>0)}' || { echo 'ОТКАЗ: предел должен быть положительным числом секунд'; exit 3; }
work=$(mktemp -d "${RUNTIME_DIRECTORY:-${TMPDIR:-/tmp}}/vse-stendy.XXXXXX") || { echo 'СЛЕПОТА: рабочий каталог не создан'; exit 3; }
trap 'rm -rf -- "$work"' EXIT
export VSE_STENDY_PROGRESS_FILE="$work/current.json"
printf '{"phase":"preparing"}\n' > "$VSE_STENDY_PROGRESS_FILE" || { echo 'СЛЕПОТА: начальная отметка не записана'; exit 3; }
# 10 с на завершение по TERM, затем KILL: вместе с alert (20+2 с) остаёмся ниже unit 3000 с.
out=$(timeout -k 10 "$PREDEL" bash "$OBHODCHIK" 2>&1); k=$?
printf '%s\n' "$out"
rash=$(printf '%s\n' "$out" | awk '/ расхождений [0-9]+ +слепот [0-9]+/{for(i=1;i<=NF;i++){if($i=="расхождений")r+=$(i+1)}} END{print r+0}')
slep=$(printf '%s\n' "$out" | awk '/ расхождений [0-9]+ +слепот [0-9]+/{for(i=1;i<=NF;i++){if($i=="слепот")s+=$(i+1)}} END{print s+0}')
stend=$(printf '%s\n' "$out" | sed -n 's/^ИТОГ: стендов \([0-9]*\).*/\1/p' | tail -1)
krasnye=$(printf '%s\n' "$out" | grep -aoE 'РАСХОЖДЕНИЕ:[^ ]+' | sed 's/РАСХОЖДЕНИЕ://' | tr '\n' ' ')
ohvat=$(printf '%s\n' "$out" | sed -n 's/.*🔴 \(В ПЕРЕЧНЕ ЕСТЬ, НА ДИСКЕ НЕТ\|НА ДИСКЕ ЕСТЬ, В ПЕРЕЧНЕ НЕТ\|В ПЕРЕЧНЕ ЕСТЬ, ОБХОДОМ НЕ ПРОГНАН (вне области обхода)\): .*\/\([^/]*\)$/\1: \2/p' | tr '\n' ';')
neozh=$(printf '%s\n' "$out" | sed -n 's/.*🔴 НЕОЖИДАННО: \([^ ]*\) .*/\1/p' | sort -u | tr '\n' ' ')
ozh=$(printf '%s\n' "$out" | sed -n 's/.*ОЖИДАЕМО: \([^ ]*\) .*/\1/p' | sort -u | tr '\n' ' ')
itog="ИТОГ ТАЙМЕРА: обходчик код $k · стендов ${stend:-?} · расхождений $rash · слепот $slep (ожидаемых $(printf '%s' "$ozh" | wc -w), неожиданных $(printf '%s' "$neozh" | wc -w))"
ustarelo=$(printf '%s\n' "$out" | grep -aF 'исключение устарело' | sed 's/^ *//')
[ -n "$ustarelo" ] && printf '%s\n' "$ustarelo"
if { [ "$k" = 1 ] && [ -z "$neozh" ] && [ -z "$ohvat" ]; } || { [ "$k" = 3 ] && [ -z "$ozh" ]; }; then
  echo "🔴 $itog · РАЗБОР ИМЁН РАЗОШЁЛСЯ: обходчик дал код $k, а строк «НЕОЖИДАННО»/«ОЖИДАЕМО»/охвата не найдено — формат сменился"
  if [ "$k" = 1 ] && [ -x "$ALERT" ] && "$ALERT" "обходчик стендов sadik: код 1, расхождений $rash, слепот $slep — имена не разобраны (формат сменился)" >/dev/null 2>&1; then echo "тревога отправлена"; fi
  exit 3
fi
case $k in
  0) echo "$itog"; exit 0 ;;
  3) echo "$itog · только ожидаемое (исключения действуют): $ozh"; exit 0 ;;
  1) echo "🔴 $itog"
     [ -n "$ohvat" ] && krasnye="${krasnye}охват: ${ohvat}"
     [ -n "$neozh" ] && krasnye="${krasnye} НЕОЖИДАННО: ${neozh}"
     if [ -x "$ALERT" ] && "$ALERT" "обходчик стендов sadik: расхождений $rash, слепот $slep — ${krasnye}" >/dev/null 2>&1; then
       echo "тревога отправлена"; exit 1
     fi
     echo "🔴 ТРЕВОГА НЕ ДОСТАВЛЕНА (канал: $ALERT) — сторож нем, находка осталась только в журнале"; exit 3 ;;
  2) echo "⚠️ $itog · СЛЕПОТА ОБХОДА (не тревога по решению координатора): $(grep -m1 -aE 'СЛЕПОТА' <<< "$out")"; exit 2 ;;
  124|137)
     where=$(python3 - "$VSE_STENDY_PROGRESS_FILE" <<'PY_WHERE'
import json, os, stat, sys
try:
    fd=os.open(sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        st=os.fstat(stream.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_size>65536: raise ValueError('progress size')
        d=json.load(stream)
    if d.get('phase')=='running' and isinstance(d.get('stand'),str) and d.get('started_at'):
        print('убит на стенде '+d['stand']+' (старт '+d['started_at']+')')
    elif d.get('phase')=='finished' and isinstance(d.get('stand'),str):
        print('прерван между стендами или при сверке охвата; последний завершён: '+d['stand'])
    else: print('текущий стенд не установлен (до запуска стендов)')
except Exception:
    print('текущий стенд не установлен (отметка недоступна или повреждена)')
PY_WHERE
)
     text="обходчик стендов sadik: код $k, предел ${PREDEL} с — $where"
     echo "🔴 $text"
     if [ -x "$ALERT" ] && timeout -k 2 20 "$ALERT" "$text" >/dev/null 2>&1; then
       echo 'тревога отправлена'
     else echo '🔴 ТРЕВОГА НЕ ДОСТАВЛЕНА'; fi
     exit 3 ;;
  *) echo "🔴 $itog · обходчик вернул непредусмотренный код"; exit 3 ;;
esac
