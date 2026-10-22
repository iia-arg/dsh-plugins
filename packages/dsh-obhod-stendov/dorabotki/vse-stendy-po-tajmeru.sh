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
# B-N-2063: ВРЕМЕННО прочие = 2500 с, ceil100((1800+2500)*1.10)=4800; unit 5100 с.
# Пересчитать после первого полного прогона, срок 16.10.2026 12:00Z. Это бюджет, не замер всего хвоста.
work=$(mktemp -d "${RUNTIME_DIRECTORY:-${TMPDIR:-/tmp}}/vse-stendy.XXXXXX") || { echo 'СЛЕПОТА: рабочий каталог не создан'; exit 3; }
RUN_STATE="$(dirname "$0")/obhod-run-state.py"
runner=""; scopes_done=0; scopes_code=0; alert_done=0; report_done=0; hvost=""; hvost_code=2
scope_cleanup() {
  [ "$scopes_done" = 0 ] || return "$scopes_code"
  scopes_done=1
  [ -z "$runner" ] || printf '%s %s\n' "$runner" "$$" > "$work/launcher"
  timeout -k 1 9 python3 -B "$RUN_STATE" cleanup "$work"
  scopes_code=$?; return "$scopes_code"
}
run_report() {
  hvost=$(python3 -B "$RUN_STATE" report "$work" 2>&1); hvost_code=$?
  printf '%s\n' "$hvost"; report_done=1
}
# B-N-2105: сигнал ряда — СВОЕЙ отправкой: otpravit_trevogu ставит alert_done, и тогда finish не сказал бы об обрыве прохода.
soobshchit_ryad() {
  [ -x "$ALERT" ] || { echo "КАНАЛ НЕ ВЫЗВАН (ряд стендов): $ALERT" >&2; return 126; }
  printf '%s\n' "$1" | timeout -k 1 21 python3 -B "$RUN_STATE" notify "$work" "$ALERT"
}
otpravit_trevogu() {
  alert_done=1
  [ -e "$ALERT" ] || { echo "КАНАЛ НЕ ВЫЗВАН: нет файла или путь недоступен: $ALERT" >&2; return 127; }
  [ -x "$ALERT" ] || { echo "КАНАЛ НЕ ВЫЗВАН: нет права исполнения: $ALERT" >&2; return 126; }
  printf '%s\n%s\n' "$1" "$hvost" | timeout -k 1 21 python3 -B "$RUN_STATE" notify "$work" "$ALERT"
}
finish() {
  local code=$? cleanup_code=0
  trap - EXIT TERM INT HUP
  scope_cleanup || cleanup_code=$?
  if [ -n "$runner" ]; then kill -KILL "$runner" 2>/dev/null || true; wait "$runner" 2>/dev/null || true; fi
  [ "$report_done" = 1 ] || run_report
  if [ "$cleanup_code" != 0 ] || [ "$hvost_code" != 0 ] || [ "$code" -ge 3 ]; then
    echo "🔴 ОБХОД ПРЕРВАН: код $code, уборка scope $cleanup_code"
    if [ "$alert_done" = 0 ]; then
      otpravit_trevogu "обходчик стендов sadik: прерван, код $code, уборка scope $cleanup_code" || echo '🔴 ТРЕВОГА НЕ ДОСТАВЛЕНА ПОЛНОСТЬЮ'
    fi
    case "$code" in 0|1|2) code=3 ;; esac
  fi
  rm -rf -- "$work"
  exit "$code"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP
[ -r "$RUN_STATE" ] || { echo "СЛЕПОТА: нет $RUN_STATE"; exit 3; }
export VSE_STENDY_PROGRESS_FILE="$work/current.json"
export VSE_STENDY_SCOPE_REQUIRED=1
printf '{"phase":"preparing"}\n' > "$VSE_STENDY_PROGRESS_FILE" || { echo 'СЛЕПОТА: начальная отметка не записана'; exit 3; }
# Marker prevents invoking an old walker that would ignore the query and start the whole suite.
grep -qxF '# VSE_STENDY_PREDEL_API=1' "$OBHODCHIK" || { echo 'СЛЕПОТА: обходчик без API предела'; exit 3; }
mimo=$(timeout -k 2 5 bash "$OBHODCHIK" --predel-stenda /opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh) || { echo 'СЛЕПОТА: предел mimo не прочитан'; exit 3; }
[[ "$mimo" =~ ^[1-9][0-9]{0,5}$ ]] || { echo 'СЛЕПОТА: негодный предел mimo'; exit 3; }
raschet=$(( ((10#$mimo + 2500) * 110 + 9999) / 10000 * 100 ))
PREDEL="${VSE_STENDY_PREDEL:-$raschet}"
[[ "$PREDEL" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk -v n="$PREDEL" 'BEGIN {exit !(n>0)}' || { echo 'ОТКАЗ: предел должен быть положительным числом секунд'; exit 3; }
# File output does not wait on a pipe inherited by a detached scope. wait is interruptible by traps.
export VSE_STENDY_RYAD_PROHOD="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; t_prohoda=$SECONDS   # B-N-2105: id прохода — в каждую строку ряда
setsid timeout -k 10 "$PREDEL" bash "$OBHODCHIK" > "$work/output" 2>&1 & runner=$!
wait "$runner"; k=$?
scope_cleanup || { echo '🔴 НЕ ВСЕ SCOPE ОСТАНОВЛЕНЫ'; k=125; }
runner=""
out=$(cat "$work/output")
printf '%s\n' "$out"
run_report
# B-N-2105: суд ряда — после прохода при ЛЮБОМ коде (убитый проход оставил строки до обрыва); ряд — наблюдение: отказ суда
#   печатается и код обхода НЕ меняет. Пишет ряд только ночной юнит (VSE_STENDY_RYAD в юните).
if [ -n "${VSE_STENDY_RYAD:-}" ]; then
  stend_n=$(printf '%s\n' "$out" | sed -n 's/^ИТОГ: стендов \([0-9]*\).*/\1/p' | tail -1)
  ryad_msg=$(timeout -k 2 30 python3 -B "$(dirname "$0")/sud-ryada-stendov.py" --ryad "$VSE_STENDY_RYAD" \
    --otmetka "${VSE_STENDY_RYAD%/*}/ryad-otmetka" --prohod "$VSE_STENDY_RYAD_PROHOD" ${stend_n:+--stendov "$stend_n"} \
    --dlit-prohoda "$((SECONDS - t_prohoda))" --predel-prohoda "$PREDEL" 2> "$work/ryad.err"); rk=$?
  sed 's/^/  /' "$work/ryad.err"
  if [ "$rk" != 0 ]; then echo "⚠️ РЯД СТЕНДОВ: суд не прошёл (код $rk): $ryad_msg"
  elif [ -n "$ryad_msg" ]; then printf '%s\n' "$ryad_msg"; soobshchit_ryad "$ryad_msg" || echo '🔴 СИГНАЛ РЯДА СТЕНДОВ НЕ ДОСТАВЛЕН'; fi
fi
rash=$(printf '%s\n' "$out" | awk '/ расхождений [0-9]+ +слепот [0-9]+/{for(i=1;i<=NF;i++){if($i=="расхождений")r+=$(i+1)}} END{print r+0}')
slep=$(printf '%s\n' "$out" | awk '/ расхождений [0-9]+ +слепот [0-9]+/{for(i=1;i<=NF;i++){if($i=="слепот")s+=$(i+1)}} END{print s+0}')
stend=$(printf '%s\n' "$out" | sed -n 's/^ИТОГ: стендов \([0-9]*\).*/\1/p' | tail -1)
krasnye=$(printf '%s\n' "$out" | grep -aoE 'РАСХОЖДЕНИЕ:[^ ]+' | sed 's/РАСХОЖДЕНИЕ://' | tr '\n' ' ')
ohvat=$(printf '%s\n' "$out" | sed -n 's/.*🔴 \(В ПЕРЕЧНЕ ЕСТЬ, НА ДИСКЕ НЕТ\|НА ДИСКЕ ЕСТЬ, В ПЕРЕЧНЕ НЕТ\|В ПЕРЕЧНЕ ЕСТЬ, ОБХОДОМ НЕ ПРОГНАН (вне области обхода)\): .*\/\([^/]*\)$/\1: \2/p' | tr '\n' ';')
neozh=$(printf '%s\n' "$out" | sed -n -e 's/^ *🔴 НЕОЖИДАННО: \([^ ]*\) .*/\1/p' -e 's/^ *⚠️ НЕОЖИДАННО: \([^ ]*\) (выпуск .*код 2) — СЛЕПОТА: .*/\1/p' | sort -u | tr '\n' ' ')
ozh=$(printf '%s\n' "$out" | sed -n 's/.*ОЖИДАЕМО: \([^ ]*\) .*/\1/p' | sort -u | tr '\n' ' ')
itog="ИТОГ ТАЙМЕРА: обходчик код $k · стендов ${stend:-?} · расхождений $rash · слепот $slep (ожидаемых $(printf '%s' "$ozh" | wc -w), неожиданных $(printf '%s' "$neozh" | wc -w))"
ustarelo=$(printf '%s\n' "$out" | grep -aF 'исключение устарело' | sed 's/^ *//')
[ -n "$ustarelo" ] && printf '%s\n' "$ustarelo"
if { [ "$k" = 1 ] && [ -z "$neozh" ] && [ -z "$ohvat" ]; } || { [ "$k" = 3 ] && [ -z "$ozh" ]; }; then
  echo "🔴 $itog · РАЗБОР ИМЁН РАЗОШЁЛСЯ: обходчик дал код $k, а строк «НЕОЖИДАННО»/«ОЖИДАЕМО»/охвата не найдено — формат сменился"
  if [ "$k" = 1 ] && otpravit_trevogu "обходчик стендов sadik: код 1, расхождений $rash, слепот $slep — имена не разобраны (формат сменился)"; then echo "тревога отправлена"; fi
  exit 3
fi
case $k in
  0) echo "$itog"; exit 0 ;;
  3) echo "$itog · только ожидаемое (исключения действуют): $ozh"; exit 0 ;;
  1) # B-N-2108: только слепые стенды — предупреждение; тревога с именами и код 1 сохраняются.
     if [ "$rash" -eq 0 ] && [ "$slep" -gt 0 ] && [ -z "$ohvat" ] && ! grep -qF '🔴 С2:' <<< "$out"; then
       echo "⚠️ $itog · СЛЕПОТА СТЕНДОВ"
     else echo "🔴 $itog"; fi
     [ -n "$ohvat" ] && krasnye="${krasnye}охват: ${ohvat}"
     [ -n "$neozh" ] && krasnye="${krasnye} НЕОЖИДАННО: ${neozh}"
     if otpravit_trevogu "обходчик стендов sadik: расхождений $rash, слепот $slep — ${krasnye}"; then
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
     if otpravit_trevogu "$text"; then
       echo 'тревога отправлена'
     else echo '🔴 ТРЕВОГА НЕ ДОСТАВЛЕНА'; fi
     exit 3 ;;
  *) echo "🔴 $itog · обходчик вернул непредусмотренный код"; exit 3 ;;
esac
