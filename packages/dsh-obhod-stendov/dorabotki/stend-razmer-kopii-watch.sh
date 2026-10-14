#!/bin/bash
# Приёмка сторожа размера копии sadik — /usr/local/sbin/razmer-kopii-watch (B-N-1470, 03.10.2026, Аврора; наряд Забавы).
#
# ЗАЧЕМ: запас места у сторожа — НЕ своё число, а формула приёмки (proverka-svezhesti-kopii.sh 2б: S/20, не меньше 1 ГБ,
# прежняя 1,5·S; запас 5 % ФС; устройство — метка <<'PYPOTOK' в proverka-kopii.sh). До 03.10 сторож держал свою копию числа
# («размер + 2 ГиБ») и разошёлся с приёмкой в обе стороны молча. Формула, зависящая от чужого файла, без зовущего снова
# разойдётся молча — зовущий у неё ночной обход стендов (vse-stendy-boevye), этот стенд.
#
# ЧТО ПРОВЕРЯЕТ:
#   С — сцепка: числа приёмки, которые повторяет сторож, ещё стоят в тексте ОБОИХ установленных файлов (grep -F, не модель).
#       Приёмка сменила формулу → красное здесь, а не ложная/пропущенная тревога места через неделю.
#   М — место на подставной полке: нужное считается стендом ЗДЕСЬ, по df этого каталога (другой прибор, чем shutil у сторожа),
#       граница ±1 ГБ вокруг него; прежнее устройство приёмки; приёмка не читается → слепота.
#   Ш — ступенька «без рабочих зон и журналов»: журналы сессий (.claude/projects, в т.ч. у кодеров) и рабочие зоны тревоги
#       не дают; рост/убыль прочего > 5 % — дают.
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: боевая полка, боевой кэш, боевая тревога — всё подставное во временном каталоге (trap);
#   хранение (BACKUP_RETAIN_LOCAL) берётся у живого юнита sadik-backup тем же путём, что у сторожа, — его не проверяет.
# ЧЕГО НЕ ЛОВИТ: приёмка с меткой PYPOTOK, которой на деле нужно больше S/20, при тех же числах в тексте (граница Вениамина);
#   доставку тревоги человеку; прогноз по ночам (номер ночи) — не проверяется.
# КОДЫ: 0 — сошлось | 1 — расхождение | 2 — часть проверок не состоялась
set -uo pipefail
INSTR="${INSTR:-/usr/local/sbin/razmer-kopii-watch}"
PRIYOMKA="${PRIYOMKA:-/usr/local/sbin/proverka-kopii.sh}"
STOROZH_PRIYOMKI="${STOROZH_PRIYOMKI:-/usr/local/sbin/proverka-svezhesti-kopii.sh}"
T=$(mktemp -d) || { echo "СЛЕПОТА: mktemp"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT
ok=0; fail=0; slep=0
pass(){ printf '%-58s ok (%s)\n' "$1" "$2"; ok=$((ok+1)); }
bad(){ printf '%-58s FAIL %s\n' "$1" "$2"; fail=$((fail+1)); }
blind(){ printf '%-58s СЛЕПОТА %s\n' "$1" "$2"; slep=$((slep+1)); }
itog(){ echo "-------------------------------------------------------------------"; echo "сошлось: $ok   FAIL: $fail   ПРОПУЩЕНО: $slep"
        [ $slep -gt 0 ] && exit 2; [ $fail -gt 0 ] && exit 1; exit 0; }

# 0) прибор исполним и знает ВСЕ подмены; без подмены тревоги каждый прогон будил бы владельца — отказ ДО проб.
[ -x "$INSTR" ] || { blind "сторож исполним" "$INSTR"; itog; }
for v in RKW_STATE RKW_POLKA RKW_KESH RKW_DF_AVAIL RKW_PRIYOMKA AGENT_ALERT_BIN; do
  [ "$(grep -cF "env(\"$v\"" "$INSTR")" -ge 1 ] || { blind "сторож знает подмену $v" "нет в $INSTR — пробы не начинаю"; itog; }
done

# С) сцепка с приёмкой: те же числа в обоих файлах.
sc(){ local fajl=$1 obr=$2 imya=$3; local n; n=$(grep -cF -- "$obr" "$fajl" 2>/dev/null) || n=0
      [ -r "$fajl" ] || { blind "$imya" "$fajl не читается"; return; }
      [ "$n" -ge 1 ] && pass "$imya" "$n" || bad "$imya" "нет «$obr» в $fajl"; }
sc "$STOROZH_PRIYOMKI" "grep -qF \"<<'PYPOTOK'\" \"\$PRIYOMKA\"" "С1 приёмка выбирает формулу по метке PYPOTOK"
sc "$STOROZH_PRIYOMKI" 'RASPAK=$(( RAZMER / 20 )); [ "$RASPAK" -lt 1000000000 ] && RASPAK=1000000000' "С2 приёмка: поток S/20, не меньше 1 ГБ"
sc "$STOROZH_PRIYOMKI" 'RASPAK=$(( RAZMER * 3 / 2 ))' "С3 приёмка: прежняя 1,5·S"
sc "$STOROZH_PRIYOMKI" 'zapas=$(( obem / 20 ))' "С4 приёмка: запас 5 % объёма ФС"
sc "$INSTR" "\"<<'PYPOTOK'\" in PRIYOMKA.read_text" "С5 сторож: та же метка"
sc "$INSTR" 'max(razmer // 20, 10**9) if potok else razmer * 3 // 2' "С6 сторож: S/20 ≥ 1 ГБ, иначе 1,5·S"
sc "$INSTR" 'shutil.disk_usage(POLKA).total // 20' "С7 сторож: 5 % объёма ФС"
sc "$INSTR" 'nuzhno = razmer * (retain + 1) + zapas' "С8 сторож: нужно = S·(хранение+1) + запас"
if [ -r "$PRIYOMKA" ]; then
  [ "$(grep -cF "<<'PYPOTOK'" "$PRIYOMKA")" -ge 1 ] && echo "   (сведения: живая приёмка $PRIYOMKA — потоковая)" || echo "   (сведения: живая приёмка $PRIYOMKA — прежняя, 1,5·S)"
fi

# Подставные архивы: члены opt/… заданных размеров (байты). $1 полка $2 имя $3 прочее $4 журналы avrora $5 журналы кодера $6 рабочие
mk(){ local s; s=$(mktemp -d "$T/src.XXXX")
  mkdir -p "$s/opt/avrora/pamyat" "$s/opt/avrora/.claude/projects/x" "$s/opt/coders/beta/.claude/projects/y" "$s/opt/zarya/workspace"
  head -c "$3" /dev/urandom > "$s/opt/avrora/pamyat/a.bin"
  head -c "$4" /dev/urandom > "$s/opt/avrora/.claude/projects/x/j.jsonl"
  head -c "$5" /dev/urandom > "$s/opt/coders/beta/.claude/projects/y/j.jsonl"
  head -c "$6" /dev/urandom > "$s/opt/zarya/workspace/w.bin"
  tar -czf "$1/own-chain-$2.tar.gz" -C "$s" opt || return 1; rm -rf -- "${s:?}"; }
S=23839599100   # размер из отметки — как у копии 03.10; файлы на полке крошечные, место считается от отметки
polka(){ local p="$T/polka-$1"; mkdir -p "$p"; mk "$p" 2026-01-01-0300 "$2" "$3" "$4" "$5" && mk "$p" 2026-01-02-0300 "$6" "$7" "$8" "$9" || return 1
  printf '{"name":"own-chain-2026-01-02-0300.tar.gz","size_bytes":%s}\n' "$S" > "$p/last.json"; echo "$p"; }
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/trevogi.txt"\n' "$T" > "$T/alert"; chmod 755 "$T/alert"
printf '#!/bin/sh\n# приёмка без метки потока\n' > "$T/priyomka-prezhnyaya.sh"
cp -- "$PRIYOMKA" "$T/priyomka-zhivaya.sh" 2>/dev/null || printf "#!/bin/sh\n<<'PYPOTOK'\n" > "$T/priyomka-zhivaya.sh"
grep -qF "<<'PYPOTOK'" "$T/priyomka-zhivaya.sh" || printf "\n<<'PYPOTOK'\n" >> "$T/priyomka-zhivaya.sh"   # М-пробы — на потоковом устройстве
prog(){ local p=$1 df=$2 pr=$3 n=$4; local k="$T/kesh-$n"; mkdir -p "$k"
  RKW_STATE="$p/last.json" RKW_POLKA="$p" RKW_KESH="$k" RKW_DF_AVAIL="$df" RKW_PRIYOMKA="$pr" AGENT_ALERT_BIN="$T/alert" \
    "$INSTR" > "$T/$n.out" 2> "$T/$n.err"; echo $? > "$T/$n.kod"
  grep -qF 'ПОДМЕНА AGENT_ALERT_BIN' "$T/$n.err" || echo "ПОДМЕНА ТРЕВОГИ НЕ ПРИНЯТА" >> "$T/$n.out"; }
sudit(){ local n=$1 imya=$2 kod_zhd=$3 obr=$4 net=${5:-}; local kod; kod=$(cat "$T/$n.kod")
  if grep -qF 'ПОДМЕНА ТРЕВОГИ НЕ ПРИНЯТА' "$T/$n.out"; then blind "$imya" "заглушка тревоги не подтверждена"; return; fi
  if [ "$kod" != "$kod_zhd" ]; then bad "$imya" "ждали код $kod_zhd, получили $kod: $(tr '\n' ' ' < "$T/$n.out")"; return; fi
  if [ -n "$obr" ] && ! grep -qF -- "$obr" "$T/$n.out"; then bad "$imya" "нет «$obr»: $(tr '\n' ' ' < "$T/$n.out")"; return; fi
  if [ -n "$net" ] && grep -qF -- "$net" "$T/$n.out"; then bad "$imya" "есть лишнее «$net»"; return; fi
  pass "$imya" "код $kod"; }

# М) место. Нужное считает стенд: хранение — у юнита (как сторож), объём ФС — df этого каталога, S/20 ≥ 1 ГБ.
retain=$(systemctl show sadik-backup.service -p Environment --value 2>/dev/null | grep -oE '(^|[[:space:]])BACKUP_RETAIN_LOCAL=[0-9]+' | grep -oE '[0-9]+$')
obem=$(df -B1 --output=size "$T" 2>/dev/null | tail -1 | tr -d ' ')
P=$(polka m 1000000 300000 100000 200000 1000000 300000 100000 200000) || { blind "М подставная полка" "архивы не собрались"; itog; }
if [[ "${retain:-}" =~ ^[0-9]+$ && "${obem:-}" =~ ^[0-9]+$ ]]; then
  raspak=$(( S / 20 )); [ $raspak -lt 1000000000 ] && raspak=1000000000
  nuzhno=$(( S * (retain + 1) + raspak + obem / 20 ))
  zpolka=$(( $(stat -c %s "$P"/own-chain-*.tar.gz | paste -sd+) ))
  echo "   (стенд: хранение $retain, объём ФС $obem Б, нужно $nuzhno Б, полка $zpolka Б)"
  prog "$P" $(( nuzhno - zpolka - 1000000000 )) "$T/priyomka-zhivaya.sh" M1; sudit M1 "М1 есть на 1 ГБ меньше нужного -> МЕСТА НЕ ХВАТИТ" 1 "МЕСТА НЕ ХВАТИТ" "ВЫРОСЛА"
  prog "$P" $(( nuzhno - zpolka + 1000000000 )) "$T/priyomka-zhivaya.sh" M2; sudit M2 "М2 есть на 1 ГБ больше нужного -> чисто" 0 "чисто:" "НЕ мерено"
  zap=$(awk -v z=$(( raspak + obem / 20 )) 'BEGIN{printf "%.1f", z/1e9}')
  sudit M2 "М3 строка называет запас приёмки ${zap} ГБ (счёт стенда)" 0 "запас приёмки ${zap} (поток S/20"
  prog "$P" $(( nuzhno - zpolka + 1000000000 )) "$T/priyomka-prezhnyaya.sh" M4; sudit M4 "М4 прежняя приёмка (1,5·S) при том же месте -> красное" 1 "распаковка 1,5·S"
  prog "$P" $(( nuzhno - zpolka + 1000000000 )) "$T/net-takoj-priyomki" M5; sudit M5 "М5 приёмка не читается -> СЛЕПОТА" 2 "СЛЕПОТА"
else
  blind "М место" "хранение «${retain:-}» или объём ФС «${obem:-}» не сняты"
fi

# Ш) ступенька. Место заведомо есть (10^15 Б), устройство — потоковое.
VEZDE=1000000000000000
stup(){ local n=$1 imya=$2 kod=$3 obr=$4; shift 4; local p; p=$(polka "$n" "$@") || { blind "$imya" "архивы не собрались"; return; }
  prog "$p" $VEZDE "$T/priyomka-zhivaya.sh" "$n"; sudit "$n" "$imya" "$kod" "$obr"; }
#            прежний: прочее журн.avr журн.код раб     новый: прочее  журн.avr журн.код раб
stup Sh1 "Ш1 журналы +60%, кодера +100%, рабочие +100%, прочее +4% -> чисто" 0 "чисто:" \
            1000000 400000 100000 200000          1040000 640000 200000 400000
stup Sh2 "Ш2 прочее +8% -> ВЫРОСЛА" 1 "ВЫРОСЛА копия без рабочих зон и журналов" \
            1000000 400000 100000 200000          1080000 400000 100000 200000
stup Sh3 "Ш3 прочее -8% -> УМЕНЬШИЛАСЬ" 1 "УМЕНЬШИЛАСЬ копия без рабочих зон и журналов" \
            1000000 400000 100000 200000          920000 400000 100000 200000
stup Sh4 "Ш4 строка «чисто» называет журналы отдельно" 0 "журналы сессий" \
            1000000 400000 100000 200000          1000000 400000 100000 200000
[ -s "$T/trevogi.txt" ] && pass "тревоги ушли в заглушку, не человеку" "$(wc -l < "$T/trevogi.txt") строк" || bad "тревоги ушли в заглушку" "заглушка пуста при красных пробах"
itog
