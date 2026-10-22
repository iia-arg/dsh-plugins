#!/usr/bin/env bash
# Стенд контракта кодов 0/1/2 у kto-podnimal.sh — тот самый дефект, из-за которого
# сторож молчал бы при живом обходе (замер соседнего агента 09.09.2026).
# 🔴 Всё на ПОДСТАВНЫХ журналах: боевые не трогаются.
# EN: A stand for the 0/1/2 code contract of kto-podnimal.sh — the very defect because of which a watcher would
#     stay silent on a live bypass (a neighbouring agent's measurement of 09.09.2026).
#     🔴 Everything on STAND-IN logs: production ones are not touched.
set -u
export TZ=UTC
K=${STEND_PRIBOR:-$(dirname "$0")/../bin/kto-podnimal}
# Служба с настоящими подъёмами в журнале — обязательна: стенд читает её журнал (sudo -n) и systemctl. Нет — СЛЕПОТА стенда.
# EN: A service with real starts in its journal is mandatory: the stand reads its journal (sudo -n) and
#     systemctl. None — stand BLINDNESS.
SL=${STEND_SLUZHBA:-}; [ -n "$SL" ] || { echo "СЛЕПОТА стенда: не задана STEND_SLUZHBA — служба с подъёмами в журнале"; exit 2; }
RAB=$(mktemp -d); trap 'rm -rf "$RAB"' EXIT
export DSH_PRIBORY_CONF="${STEND_KONF:-$RAB/net.conf}"   # настройка машины прибору не подмешивается · EN: machine settings are not mixed into the tool
# Сигнал — в штатный выход, иначе EXIT-ловушка не зовётся (обходчик гонит через timeout 120).
# EN: A signal goes into a normal exit, otherwise the EXIT trap is not called (the walker runs it through
#     timeout 120).
trap 'exit 143' TERM; trap 'exit 130' INT
BED=0; VSEGO=0; SLEP=0   # слепота отдельно от расхождения · EN: blindness separately from a divergence
sudit() { VSEGO=$((VSEGO+1)); if [ "$2" = "$3" ]; then echo "  ✅ $1 (код $2)"; else BED=$((BED+1)); echo "  🔴 $1 — код $2, ждали $3"; fi; }

echo "── устройство: ветка exit 1 существует ──"
VSEGO=$((VSEGO+1))
# Только строки кода: «exit 1» до первого «#». Прежде проба зеленела на одном комментарии, где ветка упомянута словами.
# EN: Code lines only: "exit 1" before the first "#". Before, the probe went green on a single comment mentioning the branch.
E1=$(grep -cE '^[^#]*exit 1([^0-9]|$)' "$K")
if [ "$E1" -gt 0 ]; then echo "  ✅ exit 1 есть в коде ($E1 вхождений)"; else echo "  🔴 exit 1 НЕТ в коде — сторож молчал бы при обходе"; BED=$((BED+1)); fi
VSEGO=$((VSEGO+1))
if grep -q "СЛЕПОТА ПЕРЕВЕШИВАЕТ НОЛЬ" "$K"; then echo "  ✅ названо, почему слепота важнее нуля"; else echo "  🔴 граница не названа"; BED=$((BED+1)); fi
VSEGO=$((VSEGO+1))
if grep -q "«без следа» НЕ равно «не было»" "$K"; then echo "  ✅ названа граница окна и следа"; else echo "  🔴 не названа"; BED=$((BED+1)); fi

echo "── поведение: три исхода на подставных данных ──"
# A-N-1729: окно — от ПОСЛЕДНЕГО подъёма службы (ActiveEnterTimestamp − 2 мин), а не неподвижные −30d. Прежде служба,
# поднимающаяся только при загрузке ОС (systemd-resolved), через 30 суток без перезагрузки выпадала из окна, прибор
# отвечал «подъёмов НЕ БЫЛО» кодом 0 ДО журнала ворот, и пробы 1–2 давали ложное расхождение (0≠2, 0≠1), проба 3 —
# слепоту; у службы с большим журналом −30d упиралось в предел времени. Теперь в окне подъём есть всегда, пока журнал
# его хранит; нет подъёма или строки «Started» в окне — СЛЕПОТА стенда с причиной, поведенческие пробы не идут.
# EN: A-N-1729: the window starts at the service's LAST start (ActiveEnterTimestamp − 2 min), not a fixed −30d; no start
#     or no "Started" line in the window — stand BLINDNESS with a cause, behaviour probes are skipped.
T_PODYOMA=$(systemctl show "$SL" -p ActiveEnterTimestamp --value 2>/dev/null)
OKNO=""
[ -n "$T_PODYOMA" ] && OKNO=$(date -u -d "$T_PODYOMA - 120 sec" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null)
if [ -z "$OKNO" ]; then
  echo "  🔴 СЛЕПОТА стенда: у $SL нет подъёма (ActiveEnterTimestamp «$T_PODYOMA») — окно не от чего считать; поведенческие пробы не идут"
  [ "$BED" = 0 ] || exit 1; exit 2
fi
N_STARTED=$(sudo -n journalctl --utc -u "$SL" --since "$OKNO" --no-pager -o cat 2>/dev/null | grep -c '^Started ')
if [ "$N_STARTED" -eq 0 ]; then
  # OBHOD-1017: три причины нуля различаются — по началу СИСТЕМНОГО журнала (служба пишет в него), а не одной строкой на всё.
  #   Журнал ротируется по размеру (SystemMaxUse): служба, не поднимавшаяся с загрузки, рано или поздно выпадает из него — это не дефект прибора.
  # «-n +1» — самая старая запись без «| head»: у юнитов IgnoreSIGPIPE=yes, и journalctl за head дочитывал бы журнал до срока.
  NACHALO=$(sudo -n journalctl --system -o short-unix -q --no-pager -n +1 2>/dev/null | cut -d. -f1)
  OKNO_S=$(date -u -d "$OKNO" +%s)
  if ! [[ "$NACHALO" =~ ^[0-9]+$ ]]; then
    echo "  🔴 СЛЕПОТА стенда: журнал не читается (начало системного журнала не получено) — поведенческие пробы не на чем"
  elif [ "$NACHALO" -gt "$OKNO_S" ]; then
    echo "  🔴 СЛЕПОТА стенда: журнал короче подъёма — системный журнал начинается с $(date -u -d "@$NACHALO" '+%Y-%m-%d %H:%M:%S UTC'), подъём $SL в $T_PODYOMA (окно с $OKNO) — поведенческие пробы не на чем"
  else
    echo "  🔴 СЛЕПОТА стенда: подъём $SL в $T_PODYOMA, журнал хранит окно с $OKNO, но строк «Started» 0 (служба не пишет Started?) — поведенческие пробы не на чем"
  fi
  [ "$BED" = 0 ] || exit 1; exit 2
fi
echo "  окно: с $OKNO (последний подъём $SL — $T_PODYOMA; строк «Started» в окне $N_STARTED)"
# 1) слепота: журнала ворот нет
# Окно явно, как у пробы 3 — без него kto-podnimal берёт `today` и в сутки без подъёма службы
# выходит «подъёмов НЕ БЫЛО» кодом 0 до журнала ворот (:79 < :243): стенд плавал по дню, а не по прибору.
# EN: 1) blindness: no gate log
#     The window is explicit, as in probe 3 — without it kto-podnimal takes `today`, and on a day without a
#     service start it exits with "no starts" and code 0 before the gate log (:79 < :243): the stand floated
#     with the day, not with the tool.
ZHURNAL_VOROT="$RAB/netu.log" VOROTA_SLUZHBA="$SL" timeout 120 "$K" "$SL" "$OKNO" >/dev/null 2>&1
sudit "журнала ворот нет → СЛЕПОТА" "$?" 2

# 2) обход: журнал ворот есть, но пуст (подъёмы были, записей нет)
# EN: 2) bypass: the gate log exists but is empty (there were starts, no records)
: > "$RAB/pusto.log"
ZHURNAL_VOROT="$RAB/pusto.log" timeout 120 "$K" "$SL" "$OKNO" >/dev/null 2>&1
sudit "подъёмы есть, записей ворот нет → ОБХОД НАЙДЕН" "$?" 1

# 3) чисто: в журнал ворот кладём минуты всех подъёмов
# EN: 3) clean: we put the minutes of all starts into the gate log
S=$(systemctl show "$SL" -p ActiveEnterTimestamp --value 2>/dev/null)
sudo -n journalctl --utc -u "$SL" --since "$OKNO" --no-pager -o short-iso 2>/dev/null \
  | grep -oE "^[0-9-]+T[0-9:]+" | sed 's/T/ /' | cut -c1-16 | sort -u \
  | sed 's/$/:00 UTC | ДО   | '"$SL"' |/' > "$RAB/chisto.log"
# С 23.09 прибор сверяет ПОЛЯ формата podyom-uzla «время | ДО/ПОСЛЕ | служба | …»,
# а не подстроку минуты — голые минуты давали «9 из 9 мимо ворот» на чистом журнале.
# EN: Since 23.09 the tool compares the FIELDS of the podyom-uzla format "time | ДО/ПОСЛЕ | service | …", not a
#     minute substring — bare minutes gave "9 of 9 bypassed the gate" on a clean log.
ZHURNAL_VOROT="$RAB/chisto.log" timeout 120 "$K" "$SL" "$OKNO" >"$RAB/vyvod3" 2>&1; KOD3=$?   # окно · EN: window
# Условие приёмки: «чисто» (код 0) неотличимо по коду от «подъёмов в окне НЕ БЫЛО» (тоже 0, :79 — до журнала ворот).
# Различитель — СТРОКА ответа: зелёное только со «сверено с журналом ворот»; «НЕ БЫЛО» — СЛЕПОТА (проба не состоялась:
# сверять было нечего). Так видна и граница «служба не поднималась 30 суток».
# EN: Acceptance condition: "clean" (code 0) is indistinguishable by code from "there were NO starts in the
#     window" (also 0, :79 — before the gate log). The distinguisher is the answer LINE: green only with
#     "сверено с журналом ворот"; "НЕ БЫЛО" is BLINDNESS (the probe did not take place: there was nothing to
#     compare). This also shows the boundary "the service has not started for 30 days".
VSEGO=$((VSEGO+1))
if grep -qF 'подъёмов службы в окне НЕ БЫЛО' "$RAB/vyvod3"; then
  SLEP=$((SLEP+1)); echo "  🔴 СЛЕПОТА: все подъёмы в журнале ворот → обходов нет — прибор ответил «подъёмов службы в окне НЕ БЫЛО» (код $KOD3): сверять было нечего, проба не состоялась"
elif [ "$KOD3" = 0 ] && grep -qF 'сверено с журналом ворот' "$RAB/vyvod3"; then
  echo "  ✅ все подъёмы в журнале ворот → обходов нет (код 0, «сверено с журналом ворот»)"
else
  BED=$((BED+1)); echo "  🔴 все подъёмы в журнале ворот → обходов нет — код $KOD3, строки «сверено с журналом ворот» нет"
fi

ZHDYOM=6
[ "$VSEGO" = "$ZHDYOM" ] || { echo "🔴 КАНАРЕЙКА: проб $VSEGO, ЖДЁМ $ZHDYOM"; exit 2; }
echo; echo "итог: $((VSEGO-BED-SLEP)) из $VSEGO (расхождений $BED, слепот $SLEP)"
[ "$BED" = 0 ] || exit 1
[ "$SLEP" = 0 ] || exit 2
