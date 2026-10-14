#!/bin/bash
# Приёмка сторожа отметки приёмки — /usr/local/sbin/proverka-otmetki-priyomki.sh
# Завела Искра 25.08.2026. Гоняет УСТАНОВЛЕННЫЙ файл, не копию: копия расходится
# с боевым молча, и стенд тогда аттестует не тот предмет.
#
# ГДЕ ЭТОТ СТЕНД НЕ ПРИМЕНЯЕТСЯ (границы ОХВАТА — о чём он молчит):
#   • не судит, ПРАВДИВА ли отметка: её содержимое подставное, а настоящую пишет
#     приёмка. Что приёмка пишет её верно — проверяет stend-priyomki-po-raspisaniyu.sh;
#   • не проверяет, что healthcheck записи реестра действительно зовёт этот
#     инструмент: это свойство реестра, его сверяет agent-plugins verify;
#   • не проверяет ПОРОГ по существу (72 ч) — только то, что порог соблюдается.
#     Осмысленность числа ничем не сторожится: сменят период приёмки — порог
#     останется прежним и промолчит. Это знаемая дыра, а не покрытие;
#   • systemctl здесь подставной. Что настоящий systemd отдаёт разбираемое время —
#     замерено 25.08 отдельно и в стенд не входит.
# ГРАНИЦЫ ВОЗДЕЙСТВИЯ (что стенд не портит):
#   • боевую отметку /var/lib/sadik-backup/proverena.json не читает и не пишет;
#   • ни одной службы и таймера не трогает; человеку не пишет ни разу.
set -uo pipefail
PREDMET="${PREDMET_BIN:-/usr/local/sbin/proverka-otmetki-priyomki.sh}"
ZHDYOM_PROVEROK=13
ok=0; fail=0
proverka() { # $1 — что ждём (код), $2 — имя случая, $3.. — как звать
  local zhd="$1" imya="$2"; shift 2
  local out k
  out=$("$@" 2>&1); k=$?
  if [ "$k" = "$zhd" ]; then ok=$((ok+1)); echo "  ok   $imya (код $k)"
  else fail=$((fail+1)); echo "  FAIL $imya: ждали код $zhd, получили $k"; echo "$out" | sed 's/^/       | /'; fi
}
[ -x "$PREDMET" ] || { echo "СЛЕПОТА: предмета нет или он не исполняем: $PREDMET"; exit 2; }
RAB=$(mktemp -d /tmp/stend-otmetki.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$RAB"' EXIT
mkdir -p "$RAB/bin"
cat > "$RAB/bin/systemctl" <<'EOF'
#!/bin/bash
if [ "${PODSTAV_TRIG:-NET}" = "NET" ]; then echo "n/a"; else echo "$PODSTAV_TRIG"; fi
EOF
chmod +x "$RAB/bin/systemctl"
# 🔴 Фикстуру времени делаем ТЕМ ЖЕ форматом, что отдаёт systemd, и под LC_ALL=C.
# Первая редакция стенда 25.08 брала %a в локали агента («Вт»), date -d такое не
# разбирает — стенд краснел на исправном предмете. Факт фикстуры проверяется тем же
# механизмом, каким судит предмет.
tm() { LC_ALL=C date -u -d "$1 hours ago" '+%a %Y-%m-%d %H:%M:%S UTC'; }
otm() { python3 -c "
import json,sys,datetime
t=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=int(sys.argv[1]))
json.dump({'proverena_at':t.isoformat(),'name':'proba.tar.gz','drive_id':'X','ruka':'stend'},open(sys.argv[2],'w'))
" "$1" "$RAB/otm.json"; }
zvat() { PATH="$RAB/bin:$PATH" BACKUP_VERIFY_STATE="$RAB/otm.json" PODSTAV_TRIG="$1" "$PREDMET"; }

echo "── 1. отметка свежая ────────────────────────────────────────"
otm 2;   proverka 0 "свежая отметка (2 ч), таймер 2 ч" zvat "$(tm 2)"
otm 71;  proverka 0 "отметка у самого предела (71 ч)"  zvat "$(tm 2)"
echo "── 2. отметка стара ─────────────────────────────────────────"
otm 100; proverka 0 "стара, но приёмка ИДЁТ -> тревога у неё, не здесь" zvat "$(tm 2)"
otm 100; proverka 1 "стара И таймер молчит 200 ч -> обычай умер"        zvat "$(tm 200)"
otm 73;  proverka 1 "за пределом на час, таймер молчит"                 zvat "$(tm 100)"
echo "── 3. отметки нет ───────────────────────────────────────────"
rm -f "$RAB/otm.json"
proverka 2 "нет отметки, таймер НИ РАЗУ -> приёмки ещё не было" zvat "NET"
proverka 0 "нет отметки, приёмка идёт -> вердикт у неё"         zvat "$(tm 2)"
proverka 1 "нет отметки, таймер молчит 200 ч"                   zvat "$(tm 200)"
echo "── 4. слепота отделена от отказа ────────────────────────────"
echo "не json" > "$RAB/otm.json"
proverka 2 "отметка не разбирается -> слепота, не отказ" zvat "$(tm 2)"
otm 2
proverka 2 "время таймера не разбирается -> слепота" zvat "какая-то чушь"
echo "── 5. устройство предмета (структурно, не по поведению) ─────"
if grep -q 'systemctl show "\$1" -p "\$2" --value' "$PREDMET"; then
  ok=$((ok+1)); echo "  ok   свойства systemd спрашиваются ПО ОДНОМУ"
else
  fail=$((fail+1)); echo "  FAIL спрашивает несколько -p сразу: с --value порядок вывода не следует порядку аргументов (замерено 25.08)"
fi
if grep -q 'vyhod 2 "СЛЕПОТА: время срабатывания' "$PREDMET"; then
  ok=$((ok+1)); echo "  ok   неразобранное время — слепота, а не «таймер не срабатывал»"
else
  fail=$((fail+1)); echo "  FAIL слепота разбора времени выдаётся за отказ"
fi
if grep -qE 'НЕ отвечает на вопрос|не судит о её годности' "$PREDMET"; then
  ok=$((ok+1)); echo "  ok   граница «не судит о годности копии» названа в самом предмете"
else
  fail=$((fail+1)); echo "  FAIL граница охвата в предмете не названа — зелёное прочтут шире"
fi
echo
echo "итог: ok=$ok fail=$fail (ждали проверок: $ZHDYOM_PROVEROK)"
if [ $((ok+fail)) -ne "$ZHDYOM_PROVEROK" ]; then
  echo "🔴 СЛЕПОТА: проведено $((ok+fail)) проверок из $ZHDYOM_PROVEROK — часть не состоялась"; exit 2
fi
[ "$fail" -eq 0 ] || exit 1
exit 0
