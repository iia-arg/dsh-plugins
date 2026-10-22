#!/bin/bash
# stend-skillov — ночная проверка полки скиллов (замысел «кто зовёт проверку скиллов», ГОДЕН Вениамина 02:59Z 17.10.2026).
# ЗАЧЕМ. Прибор /opt/agent-skills-local/proverka-skilla.py до 17.10 не звал НИКТО, кроме руки, а на месте лежал у 8 из 17
#   скиллов (у 9 из /opt/agent-skills-newserver ссылки нет). Стенд собирает во временной полке копии ВСЕХ скиллов
#   /opt/agent-skills-local (ссылки разыменованы), кладёт в корень ОДИН боевой прибор и ссылку в каждый скилл, гонит прибор
#   по каждому; где есть SHA256SUMS — sha256sum -c. Прибор не размножается: его правка доезжает до всех скиллов сама.
# ЗОВУЩИЙ — обходчик vse-stendy-boevye.timer (03:40Z, iskra); ЧИТАТЕЛЬ — chitatel-obhoda.
# 🔴 ДЕЙСТВИЕ ПРИ КРАСНОМ (условие 1 Вениамина): наряд ХОЗЯИНУ набора с именем скилла и строкой прибора; хозяйка обоих
#   наборов (agent-skills-local и agent-skills-newserver) — Искра (решение Вениамина 17.10). Письмо Забаве — доставка, не действие.
# ОЖИДАЕМО СЛЕПЫЕ — НЕ здесь: список исключений один, /etc/agent-registry/stend-exceptions.yaml (B-H-203). Каждая красная
#   строка начинается с имени скилла («<скилл> | СЛЕПОТА: …») — у записи свой признак на скилл, peresmotr гасит её по дате.
# КОДЫ: 0 — все чисто · 1 — есть отказ (FAIL прибора, опись не сошлась) · 2 — отказов нет, есть слепота (прибор слеп, не
#   уложился, не прогнан по общему пределу, полка/прибор не читаются, неизвестный ввод).
# ОСТАНОВКА: прибор по скиллу — не дольше PREDEL_SKILLA (30 с), весь стенд — PREDEL_VSEGO (300 с); исчерпан общий предел —
#   оставшиеся скиллы печатаются СЛЕПОТОЙ поимённо, не зелёным. Только читает; копии — в mktemp -d /tmp, trap.
# НЕ ЛОВИТ: внешние наборы /opt/agent-skills, -anna, -gws; скиллы, подключённые агенту не через /opt/agent-skills-local;
#   всё, чего не ловит сам прибор (шапка его блока kandidaty); правильность содержания скилла.
# Переменные среды — только для проб стенда (числа проверяются): STEND_SKILLOV_POLKA, STEND_SKILLOV_PRIBOR,
#   STEND_SKILLOV_PREDEL_SKILLA, STEND_SKILLOV_PREDEL_VSEGO. Доводы — отказ.
set -u
if [ $# -gt 0 ]; then echo "stend-skillov | СЛЕПОТА: доводов стенд не принимает (передано: $*)"; exit 2; fi
POLKA=${STEND_SKILLOV_POLKA:-/opt/agent-skills-local}
PRIBOR=${STEND_SKILLOV_PRIBOR:-$POLKA/proverka-skilla.py}
PREDEL_SKILLA=${STEND_SKILLOV_PREDEL_SKILLA:-30}
PREDEL_VSEGO=${STEND_SKILLOV_PREDEL_VSEGO:-300}
for v in "$PREDEL_SKILLA" "$PREDEL_VSEGO"; do
  case $v in ''|*[!0-9]*|0) echo "stend-skillov | СЛЕПОТА: предел не целое положительное: «$v»"; exit 2;; esac
done
[ -d "$POLKA" ] || { echo "stend-skillov | СЛЕПОТА: нет полки $POLKA"; exit 2; }
[ -r "$PRIBOR" ] || { echo "stend-skillov | СЛЕПОТА: прибор не читается: $PRIBOR"; exit 2; }
T=$(mktemp -d /tmp/stend-skillov.XXXXXX) || { echo "stend-skillov | СЛЕПОТА: mktemp не удался"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT
START=$SECONDS
cp -- "$PRIBOR" "$T/proverka-skilla.py" || { echo "stend-skillov | СЛЕПОТА: прибор не скопирован"; exit 2; }
echo "прибор: $PRIBOR · sha256 $(sha256sum < "$PRIBOR" | cut -c1-16) · полка $POLKA · пределы ${PREDEL_SKILLA} с/скилл, ${PREDEL_VSEGO} с всего"
skilly=()
for s in "$POLKA"/*/; do
  n=$(basename "$s"); p=$(readlink -f -- "$s")
  [ -f "$p/SKILL.md" ] || continue
  skilly+=("$n"); cp -a -- "$p" "$T/$n" 2>/dev/null || { echo "  $n | СЛЕПОТА: копия не снята ($p)"; continue; }
  ln -sfn ../proverka-skilla.py "$T/$n/proverka-skilla.py"
done
[ ${#skilly[@]} -gt 0 ] || { echo "stend-skillov | СЛЕПОТА: на полке нет ни одного SKILL.md"; exit 2; }
chisto=0 otkaz=() slepye=()
for n in "${skilly[@]}"; do
  ost=$((PREDEL_VSEGO - (SECONDS - START)))
  if [ ! -f "$T/$n/SKILL.md" ]; then slepye+=("$n"); continue; fi
  if [ "$ost" -le 0 ]; then echo "  $n | СЛЕПОТА: не прогнан — общий предел ${PREDEL_VSEGO} с исчерпан"; slepye+=("$n"); continue; fi
  lim=$PREDEL_SKILLA; [ "$ost" -lt "$lim" ] && lim=$ost
  out=$(cd "$T/$n" && timeout -k 2 "$lim" python3 -B ./proverka-skilla.py 2>&1); k=$?
  syr=$(printf '%s\n' "$out" | sed -n 's/^kandidaty: //p')
  krasn=0 slep=0
  if [ $k -eq 124 ] || [ $k -eq 137 ]; then echo "  $n | СЛЕПОТА: прибор не уложился в ${lim} с"; slep=1
  else
    while IFS= read -r l; do
      case $l in FAIL:*) echo "  $n | $l"; krasn=1;; СЛЕПОТА:*) echo "  $n | $l"; slep=1;; esac
    done <<< "$out"
    case $k in 0) ;; 1) [ $krasn -eq 1 ] || { echo "  $n | FAIL: прибор rc 1 без строки FAIL"; krasn=1; } ;;
      2) [ $slep -eq 1 ] || { echo "  $n | СЛЕПОТА: прибор rc 2 без строки СЛЕПОТА"; slep=1; } ;;
      *) echo "  $n | СЛЕПОТА: прибор rc $k"; slep=1 ;; esac
  fi
  if [ -f "$T/$n/SHA256SUMS" ]; then
    vs=$(grep -c . "$T/$n/SHA256SUMS"); ok=$(cd "$T/$n" && sha256sum -c SHA256SUMS 2>/dev/null | grep -c ': OK$')
    [ "$ok" -eq "$vs" ] || { echo "  $n | FAIL: опись SHA256SUMS сошлась $ok из $vs"; krasn=1; }
    syr="$syr · опись $ok/$vs"
  fi
  if [ $krasn -eq 1 ]; then otkaz+=("$n"); elif [ $slep -eq 1 ]; then slepye+=("$n")
  else chisto=$((chisto+1)); echo "  чисто   $n · ${syr:-сырья нет}"; fi
done
spisok() { local IFS=,; echo "${*:-—}"; }
echo "итог: скиллов ${#skilly[@]} · чисто $chisto · с отказом ${#otkaz[@]}: $(spisok "${otkaz[@]}") · слепых ${#slepye[@]}: $(spisok "${slepye[@]}") · $((SECONDS - START)) с"
echo "ожидаемо слепых судит обходчик по stend-exceptions.yaml (одна запись на всех, признак на скилл, peresmotr); красное по скиллу — наряд хозяйке набора (Искра)"
[ ${#otkaz[@]} -eq 0 ] || exit 1
[ ${#slepye[@]} -eq 0 ] || exit 2
exit 0
