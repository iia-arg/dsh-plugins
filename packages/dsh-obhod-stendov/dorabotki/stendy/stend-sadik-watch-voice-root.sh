#!/bin/bash
# СТЕНД ступени «root-каталог голоса в /var/tmp» сторожа sadik-watch (B-N-1822, 08.10.2026, Аврора).
# Предмет: довод 1, иначе БОЕВОЙ /usr/local/sbin/sadik-watch. Из НАСТОЯЩЕГО файла вынимаются функции log/snyat/kanal/trevoga/gruppa
#   и блок ступени (от «# ── 2в.» до «# ── 3.») — гоняются в обвязке за секунды; полный такт сторожа (~85 с) не нужен.
# Изоляция: подставной /var/tmp (SADIK_VAR_TMP → свой каталог), состояние и каналы — заглушки в своём каталоге (mktemp, ловушка
#   EXIT/TERM). Боевой /var/tmp, боевое состояние /var/lib/sadik-watch и канал тревог не трогаются. Учётка: root (chown 0 в подставе).
# Коды: 0 — все пробы; 1 — красные; 2 — слепота (нет предмета, нет блока, не root).
# ЧЕГО НЕ ЛОВИТ: что юнит sadik-watch вообще зовёт ступень (это порядок файла — проба Б0 смотрит, что блок стоит до «голоса жизни»);
#   живой канал dsh-alert (заглушка); MESTNO=0 (ssh) — ступень зовёт snyat, ветка ssh здесь не проверяется.
set -u
P="${1:-/usr/local/sbin/sadik-watch}"
[ -r "$P" ] || { echo "СЛЕПОТА: предмет не читается: $P"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (подстава с владельцем uid 0)"; exit 2; }
T=$(mktemp -d /tmp/stend-voice-root.XXXXXX) || { echo "СЛЕПОТА: mktemp"; exit 2; }
trap 'rm -rf -- "${T:?}"' EXIT; trap 'exit 143' TERM; trap 'exit 130' INT
mkdir "$T/vt" "$T/sost"; printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/kanal.log"\n' "$T" > "$T/kanal"; chmod 755 "$T/kanal"; : > "$T/kanal.log"
blok=$(awk '/^# ── 2в\. ROOT-КАТАЛОГ ГОЛОСА/{f=1} /^# ── 3\. Голос жизни/{f=0} f' "$P")
[ -n "$blok" ] || { echo "СЛЕПОТА: блока ступени «2в» в $P нет"; exit 2; }
funk=$(for f in log snyat kanal trevoga gruppa; do awk -v f="$f" '$0 ~ "^"f"\\(\\) *\\{" {p=1} p {print} p && /^\}/ {p=0}' "$P"; done)
printf '%s\n' "$funk" > "$T/funk.sh"; printf '%s\n' "$blok" > "$T/blok.sh"
ok=0; bad=0
pr() { if [ "$2" = 0 ]; then echo "✅ $1${3:+ — $3}"; ok=$((ok+1)); else echo "❌ $1${3:+ — $3}"; bad=$((bad+1)); fi; }
takt() {  # один такт ступени; печать — вывод ступени; канал копится в kanal.log
  ( MESTNO=1 ALERT="$T/kanal" A2A=/bin/false ZAPASNOJ_ADRESAT=nikto SOST="$T/sost" SEYCHAS=$(( $(date +%s) + ${1:-0} )) BEDY=0 SADIK_VAR_TMP="${VT:-$T/vt}"
    . "$T/funk.sh"; . "$T/blok.sh"; echo "BEDY=$BEDY" ) 2>&1
}
novoe() { KN=$(tail -n +$(( N0 + 1 )) "$T/kanal.log"); N0=$(wc -l < "$T/kanal.log"); }   # без $(…): счётчик N0 не теряется в подоболочке
N0=0
# Б0. ступень стоит до «голоса жизни» и зовёт gruppa voice-root (порядок файла — зовущий в такте)
n1=$(grep -n '^# ── 2в\. ROOT-КАТАЛОГ ГОЛОСА' "$P" | cut -d: -f1); n3=$(grep -n '^# ── 3\. Голос жизни' "$P" | cut -d: -f1)
[ -n "$n1" ] && [ -n "$n3" ] && [ "$n1" -lt "$n3" ] && grep -q '^gruppa voice-root ' "$P"; pr "Б0 ступень в такте сторожа: блок до «голоса жизни», зов gruppa voice-root" $? "строки $n1 < $n3"
# П1 исправное: два рабочих каталога агентов (uid 1003, 996) → охват 2 · root 0, канал молчит
mkdir "$T/vt/dsh-voice-1003" "$T/vt/dsh-voice-996"; chown 1003 "$T/vt/dsh-voice-1003"; chown 996 "$T/vt/dsh-voice-996"
v=$(takt); novoe; k=$KN
echo "$v" | grep -q 'охват 2 · root 0' && [ -z "$k" ]; pr "П1 исправное: охват 2 · root 0, в канал ничего" $? "$(echo "$v" | grep 'голоса' | sed 's#.*голоса: ##')"
# П2 порча: root-каталог dsh-voice-0 (как оставляет стенд под root) — факт внесения печатается
mkdir "$T/vt/dsh-voice-0"; echo "   порча внесена: $(stat -c '%n uid=%u' "$T/vt/dsh-voice-0" | sed "s#$T/vt/##")"
v=$(takt); novoe; k=$KN
echo "$v" | grep -q 'охват 3 · root 1 — dsh-voice-0' && [ "$(printf '%s' "$k" | grep -c 'каталог голоса от root — dsh-voice-0')" = 1 ] && echo "$v" | grep -q 'BEDY=1'
pr "П2 порча dsh-voice-0 (root): журнал «root 1 — dsh-voice-0», в канал одна строка с именем, беда засчитана" $? "$(printf '%s' "$k" | cut -c1-110)"
# П3 повтор того же состава до остывания — канал молчит
v=$(takt 60); novoe; k=$KN; [ -z "$k" ] && echo "$v" | grep -q 'root 1'; pr "П3 тот же состав через минуту — канал молчит (журнал помнит)" $?
# П4 root-владелец под ЧУЖИМ числом (dsh-voice-1005, uid 0) — тоже беда; состав сменился — новая строка
mkdir "$T/vt/dsh-voice-1005"; echo "   порча внесена: $(stat -c '%n uid=%u' "$T/vt/dsh-voice-1005" | sed "s#$T/vt/##")"
v=$(takt 120); novoe; k=$KN; printf '%s' "$k" | grep -q 'dsh-voice-0 dsh-voice-1005'; pr "П4 dsh-voice-1005 с владельцем root — в составе, канал говорит о смене" $? "$(printf '%s' "$k" | cut -c1-110)"
# П5 уборка → «снова в порядке», журнал root 0
rmdir "$T/vt/dsh-voice-0" "$T/vt/dsh-voice-1005"; echo "   порча снята: $(ls "$T/vt" | tr '\n' ' ')"
v=$(takt 180); novoe; k=$KN
echo "$v" | grep -q 'охват 2 · root 0' && printf '%s' "$k" | grep -q 'снова в порядке'; pr "П5 убрано → журнал «root 0», в канал «снова в порядке»" $? "$(printf '%s' "$k" | cut -c1-110)"
# П6 после «снова в порядке» — тишина
v=$(takt 240); novoe; k=$KN; [ -z "$k" ]; pr "П6 чистые такты дальше — канал молчит" $?
# П7 слепота: каталога нет → СЛЕПОТА, не «root 0»
v=$(VT="$T/net" takt 300); novoe; k=$KN
echo "$v" | grep -q 'СЛЕПОТА (find код' && printf '%s' "$k" | grep -q 'СЛЕПОТА' && ! echo "$v" | grep -q 'root 0'; pr "П7 /var/tmp не читается — СЛЕПОТА в журнал и канал, не ноль" $?
echo "итог: $ok из $((ok+bad)) · предмет $P"
ZHDYOM=8; [ $((ok+bad)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проб $((ok+bad)), а стенд из $ZHDYOM"; exit 2; }
[ "$bad" = 0 ]
