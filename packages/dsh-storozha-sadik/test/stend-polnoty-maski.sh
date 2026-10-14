#!/bin/bash
# СТЕНД «замаскированный таймер в полноте перечня» сторожа sadik-watch (A-N-1948 модуль №5, дельта Забавы 04:12Z; Искра, 10.10.2026).
# Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/sadik-watch. Как stend-sadik-watch-zastryal: из НАСТОЯЩЕГО файла вынимаются функции
#   log/snyat/kanal/trevoga/gruppa и блок «# ── 2в. СТОРОЖ НАД СТОРОЖАМИ» до «gruppa sutochnye»; канал и состояние — заглушки в mktemp.
# Перечень стенда: все живые строки — «!<юнит>» (чужие не судятся), живой registry-watchdog.service — судимая строка. Подставной
#   systemctl (функция) отвечает ТОЛЬКО на list-timers и на «show -p Id …»: свои таймеры с FragmentPath в /etc/systemd/system;
#   остальное — настоящий systemctl. Живые таймеры и юниты не трогаются.
# Пробы: П1 замаскированный таймер (служба «-», LoadState=masked) → не «без строки», имя в счёте «замаскировано» · П2 порча: обычный
#   таймер без строки перечня → «<служба>:net-stroki» (полнота зрячая) · П3 порча снята → снова без net-stroki · П4 служба «-» без маски → красное «служба не определена: <таймер>».
# Учётка: root (журнал и состояние живых юнитов в блоке). Коды: 0 — все пробы; 1 — красные; 2 — слепота.
# ЧЕГО НЕ ЛОВИТ: вызов блока юнитом (порядок файла); настоящий list-timers (подстава); маску, снятую без строки перечня.
set -u
P="${1:-/usr/local/sbin/sadik-watch}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (живые юниты блока)"; exit 2; }
PER=/etc/agent-registry/storozha-sutochnye.txt; [ -r "$PER" ] || { echo "СЛЕПОТА: перечень $PER не читается"; exit 2; }
grep -qE '^registry-watchdog\.service ' "$PER" || { echo "СЛЕПОТА: в $PER нет строки registry-watchdog.service — судимой строки стенда"; exit 2; }
T=$(mktemp -d /tmp/stend-polnoty-maski.XXXXXX) || { echo "СЛЕПОТА: mktemp"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT
mkdir "$T/sost"; printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/kanal.log"\n' "$T" > "$T/kanal"; chmod 755 "$T/kanal"; : > "$T/kanal.log"
{ awk '/^[[:space:]]*(#|$)/{next} /^!/{print; next} $1=="registry-watchdog.service"{print; next} {print "!" $1 " стенд-polnoty: чужой сторож не судится"}' "$PER"; } > "$T/perechen"
blok=$(awk '/^# ── 2в\. СТОРОЖ НАД СТОРОЖАМИ/{f=1} f{print} f && /^gruppa sutochnye /{exit}' "$P")
printf '%s\n' "$blok" | grep -q '^gruppa sutochnye ' || { echo "СЛЕПОТА: блока «СТОРОЖ НАД СТОРОЖАМИ» до gruppa sutochnye в $P нет"; exit 2; }
for f in log snyat kanal trevoga gruppa; do awk -v f="$f" '$0 ~ "^"f"\\(\\) *\\{" {p=1} p {print} p && /^\}/ {p=0}' "$P"; done > "$T/funk.sh"
printf '%s\n' "$blok" > "$T/blok.sh"
# подстава: строки list-timers «… <таймер> <служба>» и блоки show; STEND_TMR — строки «таймер служба состояние»
cat > "$T/podmena.sh" <<'SH'
systemctl() {
  case "$1" in
    list-timers) while read -r t s m; do [ -n "$t" ] && echo "- - - - $t $s"; done <<< "$STEND_TMR" ;;
    show) case " $* " in *" -p Id "*)
            while read -r t s m; do [ -n "$t" ] || continue
              printf 'Id=%s\nLoadState=%s\nFragmentPath=/etc/systemd/system/%s\nUnitFileState=%s\n\n' "$t" "$( [ "$m" = masked ] && echo masked || echo loaded)" "$t" "$( [ "$m" = masked ] && echo masked || echo enabled)"
            done <<< "$STEND_TMR" ;;
          *) command systemctl "$@" ;; esac ;;
    *) command systemctl "$@" ;;
  esac
}
SH
ok=0; bad=0
pr() { if [ "$2" = 0 ]; then echo "✅ $1 — $3"; ok=$((ok+1)); else echo "❌ $1 — $3"; bad=$((bad+1)); fi; }
takt() { ( MESTNO=1 ALERT="$T/kanal" A2A=/bin/false ZAPASNOJ_ADRESAT=nikto SOST="$T/sost" SEYCHAS=$(date +%s) BEDY=0 SADIK_SUTOCHNYE="$T/perechen" STEND_TMR="$1"
  . "$T/funk.sh"; . "$T/podmena.sh"; . "$T/blok.sh"; echo "GR_SUT=[$GR_SUT]" ) 2>&1; }
sostav() { printf '%s\n' "$1" | sed -n 's/^GR_SUT=\[\(.*\)\]$/\1/p' | tr ' ' '\n' | grep -F ':net-stroki' | tr '\n' ' '; }
polnota() { printf '%s\n' "$1" | grep -m1 'полнота перечня:' | sed 's/^ *//'; }
echo "== стенд полноты с маской: предмет $P ($(sha256sum "$P" | cut -c1-16))"
MASKA='stend-maska.timer - masked
stend-obychnyj.timer registry-watchdog.service loaded'
v=$(takt "$MASKA"); s=$(sostav "$v"); pl=$(polnota "$v")
[ -z "$s" ] && printf '%s' "$pl" | grep -qF 'замаскировано 1: stend-maska.timer'
pr "П1 замаскированный таймер → не «без строки», имя в счёте" $? "net-stroki: [${s% }] · $pl"
PORCHA="$MASKA
stend-bez.timer stend-bez.service loaded"; echo "   порча внесена: таймер stend-bez.timer → stend-bez.service, строк перечня с ним $(grep -c 'stend-bez' "$T/perechen")"
v=$(takt "$PORCHA"); s=$(sostav "$v")
printf '%s' "$s" | grep -qF 'stend-bez.service:net-stroki'; pr "П2 порча: обычный таймер без строки → net-stroki" $? "net-stroki: [${s% }]"
v=$(takt "$MASKA"); s=$(sostav "$v"); [ -z "$s" ]; pr "П3 порча снята → без net-stroki" $? "net-stroki: [${s% }] · $(polnota "$v")"
# П4 (LOW Вениамина 04:27Z): служба «-» БЕЗ маски — не маска, а красная «служба не определена: <таймер>»
BITYJ="$MASKA
stend-bityj.timer - loaded"; echo "   порча внесена: stend-bityj.timer со службой «-» и LoadState=loaded (без маски)"
v=$(takt "$BITYJ"); s=$(printf '%s\n' "$v" | sed -n 's/^GR_SUT=\[\(.*\)\]$/\1/p'); pl=$(polnota "$v")
printf '%s' "$s" | tr ' ' '\n' | grep -qxF 'stend-bityj.timer:sluzhba-neopr' && printf '%s\n' "$v" | grep -qF 'служба не определена: stend-bityj.timer' && printf '%s' "$pl" | grep -qF 'замаскировано 1: stend-maska.timer'
pr "П4 служба «-» без маски → красное «служба не определена», маска по-прежнему в счёте" $? "состав: [$s] · $pl"
echo "итог: $ok из $((ok+bad))"; [ "$bad" = 0 ] || exit 1
