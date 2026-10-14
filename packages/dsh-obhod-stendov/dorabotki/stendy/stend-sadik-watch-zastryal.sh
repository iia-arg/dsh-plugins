#!/bin/bash
# СТЕНД «суточный сторож застрял в activating» сторожа sadik-watch (B-N-1828, 08.10.2026, Аврора; ворота Вениамина 08:51Z).
# Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/sadik-watch. Из НАСТОЯЩЕГО файла вынимаются функции log/snyat/kanal/trevoga/gruppa и блок
#   «сторож над сторожами» (от «# ── 2в. СТОРОЖ НАД СТОРОЖАМИ» до «gruppa sutochnye» включительно) — гоняются в обвязке за секунды.
# Подстава — НАСТОЯЩИЙ временный юнит stend-zastryal-<pid>.service (oneshot, sleep 25) и подставной перечень: боевые строки как «!<юнит>»
#   (не судятся, полнота таймеров сходится живьём) + «<он> 1» — в группе только наш юнит.
#   «Сейчас» сторожа (SEYCHAS) сдвигается — так 2 ч в activating достижимы за секунды. Канал и состояние — заглушки в своём mktemp.
# Уборка: ловушка EXIT/TERM/INT — systemctl stop + reset-failed юнита, rm каталога; после — счёт остатков числом.
# Учётка: root (systemd-run, journalctl). Коды: 0 — все пробы; 1 — красные; 2 — слепота.
# ЧЕГО НЕ ЛОВИТ: вызов блока юнитом sadik-watch (порядок файла — Б0); MESTNO=0; настоящий час ожидания (сдвиг SEYCHAS вместо него).
set -u
P="${1:-/usr/local/sbin/sadik-watch}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (systemd-run, journalctl)"; exit 2; }
PER=/etc/agent-registry/storozha-sutochnye.txt; [ -r "$PER" ] || { echo "СЛЕПОТА: перечень $PER не читается"; exit 2; }
U="stend-zastryal-$$.service"
T=$(mktemp -d /tmp/stend-zastryal.XXXXXX) || { echo "СЛЕПОТА: mktemp"; exit 2; }
uborka() { systemctl stop "$U" >/dev/null 2>&1; systemctl reset-failed "$U" >/dev/null 2>&1; rm -rf -- "${T:?}"; }
trap uborka EXIT; trap 'exit 143' TERM; trap 'exit 130' INT
mkdir "$T/sost"; printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/kanal.log"\n' "$T" > "$T/kanal"; chmod 755 "$T/kanal"; : > "$T/kanal.log"
# Живые строки перечня — «!<юнит> стенд»: свежесть чужих не судится (сдвиг SEYCHAS сделал бы их «просрочен» и плавающим фоном),
#   а полнота таймеров сходится живьём. В составе группы остаётся только наш юнит.
{ awk '/^[[:space:]]*(#|$)/{next} /^!/{print; next} {print "!" $1 " стенд-zastryal: чужой сторож не судится"}' "$PER"; echo "$U 1"; } > "$T/perechen"
blok=$(awk '/^# ── 2в\. СТОРОЖ НАД СТОРОЖАМИ/{f=1} f{print} f && /^gruppa sutochnye /{exit}' "$P")
printf '%s\n' "$blok" | grep -q '^gruppa sutochnye ' || { echo "СЛЕПОТА: блока «СТОРОЖ НАД СТОРОЖАМИ» до gruppa sutochnye в $P нет"; exit 2; }
for f in log snyat kanal trevoga gruppa; do awk -v f="$f" '$0 ~ "^"f"\\(\\) *\\{" {p=1} p {print} p && /^\}/ {p=0}' "$P"; done > "$T/funk.sh"
printf '%s\n' "$blok" > "$T/blok.sh"
ok=0; bad=0; N0=0
pr() { if [ "$2" = 0 ]; then echo "✅ $1${3:+ — $3}"; ok=$((ok+1)); else echo "❌ $1${3:+ — $3}"; bad=$((bad+1)); fi; }
takt() { ( MESTNO=1 ALERT="$T/kanal" A2A=/bin/false ZAPASNOJ_ADRESAT=nikto SOST="$T/sost" SEYCHAS=$(( $(date +%s) + ${1:-0} )) BEDY=0 SADIK_SUTOCHNYE="$T/perechen"
  . "$T/funk.sh"; [ -n "${2:-}" ] && . "$2"; . "$T/blok.sh"; echo "GR_SUT=[$GR_SUT]" ) 2>&1; }
novoe() { KN=$(tail -n +$(( N0 + 1 )) "$T/kanal.log"); N0=$(wc -l < "$T/kanal.log"); }   # без $(…): счётчик не теряется
nash() { printf '%s\n' "$1" | grep -F "$U" | head -1; }   # без обрезки: строка группы длинная
# Б0: в ветке activating есть суд по InactiveExitTimestamp
printf '%s\n' "$blok" | grep -q 'InactiveExitTimestamp --timestamp=unix' && printf '%s\n' "$blok" | grep -q ':zastryal"'; pr "Б0 в ветке activating — суд по InactiveExitTimestamp и состав «:zastryal»" $?
systemd-run --no-block --quiet --collect --unit="$U" -p Type=oneshot /bin/sleep 25 || { echo "СЛЕПОТА: временный юнит не запущен"; exit 2; }
for i in $(seq 1 20); do [ "$(systemctl show "$U" -p ActiveState --value)" = activating ] && break; sleep 0.2; done
VH=$(systemctl show "$U" -p InactiveExitTimestamp --timestamp=unix --value); echo "   подстава: $U activating, вход $VH"
# П1 исправное: «сейчас» — настоящее → прогон идёт, в составе нашего юнита нет, канал о нём молчит
v=$(takt 0); novoe
! printf '%s' "$v" | grep -q "$U:zastryal" && printf '%s' "$v" | grep -q "$U — прогон идёт" && [ -z "$(nash "$KN")" ]
pr "П1 вход только что: «прогон идёт», в составе и канале нашего юнита нет" $? "$(printf '%s\n' "$v" | grep -F "$U" | head -1 | sed 's/^ *//' | cut -c1-100)"
# П2 порча: «сейчас» +2 ч при сроке 1 ч — факт печатается
echo "   порча внесена: SEYCHAS = сейчас + 7200 с; возраст входа $(( $(date +%s) + 7200 - ${VH#@} )) с при сроке 3600 с"
v=$(takt 7200); novoe
# B-N-1923 хвост (09.10, Искра): состав — элементами, не позицией: «$U:zastryal]» / « $U:zastryal» не совпадали, когда наш юнит
#   стоял в составе ПЕРВЫМ при соседе («[$U:zastryal metki-mimo-vorot-watch.service:net-stroki]», 12:32Z) — П2 краснел при исправном стороже.
printf '%s\n' "$v" | sed -n 's/^GR_SUT=\[\(.*\)\]$/\1/p' | tr ' ' '\n' | grep -qxF "$U:zastryal" && printf '%s' "$(nash "$KN")" | grep -q 'прогон идёт 2 ч (с .* МСК) при сроке 1 ч — застрял в activating'
pr "П2 +2 ч в activating при сроке 1 ч: «$U:zastryal» в составе, в канале имя, часы, время входа МСК" $? "$(nash "$KN" | sed "s#.*$U#$U#" | cut -c1-120)"
# П3 тот же состав через минуту — канал молчит
v=$(takt 7260); novoe; [ -z "$KN" ] && printf '%s' "$v" | grep -q "$U:zastryal"; pr "П3 тот же состав через минуту — канал молчит" $?
# П4 слепота: метка входа не читается (подставной systemctl отдаёт пусто ТОЛЬКО на InactiveExitTimestamp)
printf '%s\n' 'systemctl() { case "$*" in *InactiveExitTimestamp*) echo "" ;; *) command systemctl "$@" ;; esac; }' > "$T/podmena.sh"
v=$(takt 7200 "$T/podmena.sh"); novoe; printf '%s' "$v" | grep -q "$U:zastryal-slepo"; pr "П4 метка входа пуста — «$U:zastryal-slepo», не тишина и не «застрял»" $?
# П5 возврат: прогон кончился сам (sleep 25) → в составе нашего юнита нет, журнал «прогон состоялся», канал о нём больше не говорит
for i in $(seq 1 60); do [ "$(systemctl show "$U" -p ActiveState --value)" != activating ] && break; sleep 1; done
echo "   порча снята: $U $(systemctl show "$U" -p ActiveState --value) (прогон завершился)"
v=$(takt 0); novoe
! printf '%s' "$v" | grep -q "$U:zastryal" && printf '%s' "$v" | grep -q "суточный сторож $U: прогон состоялся 0 ч назад" && ! printf '%s' "$KN" | grep -q "$U — "
pr "П5 прогон завершился: «прогон состоялся 0 ч назад», в составе и тексте канала нашего юнита нет" $? "$(printf '%s\n' "$v" | grep -F "$U" | head -1 | sed 's/^ *//' | cut -c1-90)"
uborka; trap - EXIT
n=$(systemctl list-units --all --no-legend --plain 'stend-zastryal-*' 2>/dev/null | wc -l); m=$(ls -d /tmp/stend-zastryal.* 2>/dev/null | wc -l)
[ "$n" = 0 ] && [ "$m" = 0 ]; pr "П6 остатки после стенда: юнитов stend-zastryal-* $n, каталогов $m" $?
echo "итог: $ok из $((ok+bad)) · предмет $P"
ZHDYOM=7; [ $((ok+bad)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проб $((ok+bad)), а стенд из $ZHDYOM"; exit 2; }
[ "$bad" = 0 ]
