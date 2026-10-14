#!/usr/bin/env bash
# RU: ⛔ НЕ ЗАПУСКАТЬ БЕЗ ПОДМЕН: stop/start БОЕВЫХ таймеров (registry-watchdog, apt-updates-notify, apt-daily);
#    снимает маску и ЗАПУСКАЕТ apt-daily-upgrade.timer — на время прогона возвращает автоустановку, выключенную
#    владельцем; с --okno пишет drop-in в /etc/systemd/system/registry-watchdog.timer.d/. Только вручную, с разрешения.
# EN: ⛔ DO NOT RUN WITHOUT SUBSTITUTIONS: it stops/starts LIVE timers (registry-watchdog, apt-updates-notify, apt-daily);
#    it unmasks and STARTS apt-daily-upgrade.timer — for the duration of the run it re-enables automatic upgrades that
#    the owner switched off; with --okno it writes a drop-in to /etc/systemd/system/registry-watchdog.timer.d/.
#    Manual runs only, with permission.
# RU: Стенд: проверка живости не должна судить о механизме ИЗНУТРИ его собственного прогона.
# EN: Test: a liveness check must not judge a mechanism FROM INSIDE that mechanism's own run.
#
# RU: ЗАЧЕМ. Однажды сторож реестров прислал владельцу тревогу о самом себе:
# «таймер числится активным, а следующего запуска НЕТ». Беды не было. systemd не
# вычисляет следующее срабатывание, пока служба, запущенная этим таймером, ещё
# идёт, — а живость записей зовёт САМ сторож, то есть в это окно он попадал
# каждый прогон. Ложно-красное опаснее молчания: оно учит не читать тревоги.
# EN: WHY. Once the registry watchdog sent the owner an alert about itself:
# "the timer is listed as active, but there is NO next run". Nothing was wrong. systemd
# does not compute the next trigger while the service started by that timer is still
# running — and the entries' liveness is invoked BY the watchdog itself, so it landed
# in that window on every run. A false red is more dangerous than silence: it teaches
# people not to read alerts.
#
# RU: 🔴 ЧЕМ ЭТОТ СЛУЧАЙ ЛОВИТСЯ, А ЧЕМ НЕТ. Ручной `systemctl start` беды НЕ
# воспроизводит: таймер остаётся SubState=waiting, поле вычислено, старая
# проверка отвечает зелёным. Воспроизводит только запуск ТАЙМЕРОМ
# (SubState=running). Проба ручным запуском давала уверенное зелёное на больном
# механизме — поэтому случай «окно» вынесен отдельным ключом --okno, а без него
# стенд ПРЯМО ГОВОРИТ, что этот случай не проверялся.
# EN: 🔴 WHAT CATCHES THIS CASE AND WHAT DOES NOT. A manual `systemctl start` does NOT
# reproduce the problem: the timer stays SubState=waiting, the field is computed, and the
# old check answers green. Only a start BY THE TIMER (SubState=running) reproduces it.
# A probe with a manual start gave a confident green on a broken mechanism — so the
# "window" case is a separate --okno switch, and without it the test SAYS PLAINLY that
# this case was not checked.
#
# RU: Тексты проверок берутся ИЗ УСТАНОВЛЕННОГО реестра, а не пишутся заново.
# EN: The check bodies are taken FROM THE INSTALLED registry, not rewritten here.
#
# RU: ГДЕ НЕ ПРИМЕНЯЕТСЯ: стенд трогает НАСТОЯЩИЕ таймеры (останавливает и
# возвращает), поэтому не запускать его в окно 07:30-07:36 UTC — там идут сами
# сторожа. Порчи делаются по одной и восстанавливаются сразу; состояние
# сверяется в конце. Ключ --okno добавляет таймеру временный drop-in на одно
# лишнее срабатывание и снимает его после замера.
# EN: WHERE IT DOES NOT APPLY: the test touches REAL timers (stops them and brings them
# back), so do not run it in the 07:30-07:36 UTC window — the watchdogs themselves run
# then. Corruptions are made one at a time and restored immediately; the state is
# verified at the end. The --okno switch adds a temporary drop-in to the timer for one
# extra trigger and removes it after the measurement.
set -uo pipefail
# RU: B-N-1859 (Заря; слово Забавы 15:24Z): запрет шапки — КОДОМ. 08.10 стенд дважды запустили циклом «все стенды пакета», не прочитав
#     шапки (14:49Z, 15:10Z): текст не остановил ни разу. Теперь без ключа --zhivye-tajmery — ОТКАЗ до первого sudo и systemctl;
#     первая строка отказа — перечень того, что стенд тронул бы. Незнакомый довод — тоже ОТКАЗ (руки набирают --dry-run и т.п.).
# EN: B-N-1859: the header ban is enforced IN CODE: without --zhivye-tajmery — refusal before any sudo/systemctl, the first line lists
#     what would be touched; an unknown argument is a refusal too.
TRONET="stop/start registry-watchdog.timer, apt-updates-notify.timer, apt-daily.timer; unmask→start→stop→mask apt-daily-upgrade.timer; с --okno — drop-in /etc/systemd/system/registry-watchdog.timer.d/99-VREMENNO-stend.conf и daemon-reload"
# ZHIVAYA-MASHINA: stop/start боевых registry-watchdog.timer, apt-updates-notify.timer, apt-daily.timer; unmask/mask apt-daily-upgrade.timer; с --okno — drop-in в /etc/systemd (B-N-1929: маркер; ключ — --zhivye-tajmery или --zhivaya-mashina)
OKNO=0; ZHIVYE=0
for _a in "$@"; do
  case "$_a" in
    --zhivye-tajmery|--zhivaya-mashina) ZHIVYE=1 ;;   # B-N-1929: --zhivaya-mashina — единое имя ключа фермы
    --okno) OKNO=1 ;;
    *) echo "ОТКАЗ: незнакомый довод «$_a» — тронул бы ЖИВЫЕ: $TRONET"; echo "  знаю: --zhivye-tajmery (обязателен), --okno. Ничего не тронуто."; exit 2 ;;
  esac
done
if [ "$ZHIVYE" != 1 ]; then
  echo "ОТКАЗ-ZHIVAYA-MASHINA: без ключа --zhivye-tajmery (или --zhivaya-mashina) не гоняю — тронул бы ЖИВЫЕ: $TRONET"
  echo "  только вручную, с разрешения, вне окна сторожей 07:30–07:36 UTC: bash $0 --zhivye-tajmery [--okno]. Ничего не тронуто."
  exit 2
fi
# RU: B-N-1859 r2: окно сторожей 07:30–07:36 UTC — тоже ОТКАЗ кодом (в нём идут сами сторожа, шапка запрещает).
_ch=$(date -u +%H%M)
if [ "$_ch" -ge 0730 ] && [ "$_ch" -le 0736 ]; then
  echo "ОТКАЗ: окно сторожей 07:30–07:36 UTC (сейчас ${_ch:0:2}:${_ch:2:2}) — стенд в нём не гоняется. Ничего не тронуто."; exit 2
fi
# RU: B-N-1859: маска автоустановки ВОЗВРАЩАЕТСЯ при ЛЮБОМ выходе (обрыв, TERM/INT, ошибка), если она стояла до прогона:
#     раздел D снимает её, и обрыв между unmask и mask оставил бы автоустановку, выключенную владельцем, включённой.
#     ⚠️ НЕ ЛОВИТ: SIGKILL (ловушки не бывает).
MASKA_DO=$(systemctl is-enabled apt-daily-upgrade.timer 2>/dev/null || true)
# RU: B-N-1859 r2 (условие Вениамина 15:3xZ): ловушка возвращает ВСЁ, что стенд трогает, в снятое ДО прогона — не только маску.
#     Таймеры разделов B/C/E: был active — на выходе start. Drop-in --okno: его не было — на выходе rm + daemon-reload.
#     is-enabled трёх таймеров снимается и сверяется, но НЕ правится: стенд его не меняет, расхождение — чужая рука, о нём строка 🔴.
TAJMERY="registry-watchdog.timer apt-updates-notify.timer apt-daily.timer"
declare -A AKTIV_DO VKL_DO
for _t in $TAJMERY; do
  AKTIV_DO[$_t]=$(systemctl is-active "$_t" 2>/dev/null || true); VKL_DO[$_t]=$(systemctl is-enabled "$_t" 2>/dev/null || true)
done
DROPIN=/etc/systemd/system/registry-watchdog.timer.d/99-VREMENNO-stend.conf
DROPIN_DO=0; [ -e "$DROPIN" ] && DROPIN_DO=1
vernut_vsyo() {
  local _t _a _v
  for _t in $TAJMERY; do
    _a=$(systemctl is-active "$_t" 2>/dev/null || true)
    if [ "${AKTIV_DO[$_t]}" = active ] && [ "$_a" != active ]; then
      sudo systemctl start "$_t" >/dev/null 2>&1
      echo "ловушка выхода: $_t запущен снова (был active, стал $_a → $(systemctl is-active "$_t" 2>&1))"
    fi
    _v=$(systemctl is-enabled "$_t" 2>/dev/null || true)
    [ "$_v" = "${VKL_DO[$_t]}" ] || echo "ловушка выхода: 🔴 $_t is-enabled было «${VKL_DO[$_t]}», стало «$_v» — стенд это не меняет, не правлю"
  done
  if [ "$DROPIN_DO" = 0 ] && [ -e "$DROPIN" ]; then
    sudo rm -f "$DROPIN"; sudo rmdir "$(dirname "$DROPIN")" 2>/dev/null; sudo systemctl daemon-reload
    echo "ловушка выхода: временный drop-in снят ($( [ -e "$DROPIN" ] && echo 'НЕ снят' || echo 'нет'))"
  fi
  [ "$MASKA_DO" = masked ] || return 0
  [ "$(systemctl is-enabled apt-daily-upgrade.timer 2>/dev/null || true)" = masked ] && return 0
  sudo systemctl stop apt-daily-upgrade.timer >/dev/null 2>&1
  sudo systemctl mask apt-daily-upgrade.timer >/dev/null 2>&1
  echo "ловушка выхода: маска apt-daily-upgrade.timer возвращена ($(systemctl is-enabled apt-daily-upgrade.timer 2>&1))"
}
trap vernut_vsyo EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
export LC_ALL=C.UTF-8

# RU: 🔴 Хвост вывода режется по ЗНАКАМ, а не байтами: `cut -c` считает байты и
# игнорирует локаль, на русском тексте обрыв приходится в середину буквы, и в
# отчёте стенда появляется «автоуста<мусор>». Урок про обрезку известный, и
# первая редакция этого стенда всё равно на него наступила.
# EN: 🔴 The output tail is cut by CHARACTERS, not bytes: `cut -c` counts bytes and
# ignores the locale; on Cyrillic text the cut lands in the middle of a letter, and the
# test report shows "автоуста<garbage>". The truncation lesson was well known, and the
# first revision of this test still stepped on it.
hvost() { local l; l="$(printf '%s' "$1" | tail -1)"; printf '%s' "$l" | LC_ALL=C.utf8 sed -e 's/\(.\{0,100\}\).*/\1/'; }

# RU: 2.0.9 (B-N-1922, Михалыч): пакет = боевая редакция — lib нет; реестр и старая копия — умолчаниями боя sadik (как dorabotki 0b479496).
REESTR="${REESTR:-/etc/agent-registry/plugins.yaml}"
STARYJ="${STARYJ:-/etc/agent-registry/plugins.yaml.bak-pre-krug-samoproverki-20260823}"

ok=0; fail=0
slep=0
dostat() {
  python3 -c "
import yaml,sys
d=yaml.safe_load(open(sys.argv[1],encoding='utf-8'))
for s in ('plugins','services'):
    for e in (d.get(s) or []):
        if e['id']==sys.argv[2]:
            print(e.get('healthcheck') or ''); raise SystemExit
raise SystemExit('нет записи '+sys.argv[2])
" "$1" "$2"
}
# RU: 🔴 ПРЕДМЕТ МОЖЕТ БЫТЬ ЗАНЯТ ЧУЖОЙ РАБОТОЙ, и тогда порча меряет не то состояние,
# которое создала. Дважды стенд краснел на исправной машине только
# потому, что в этот момент шла apt-daily.service: остановка таймера ничего не меняет,
# пока служба уже идёт. FAIL здесь ЛЖЁТ — он читается как поломка предмета и посылает
# чинить исправное. Честный ответ — СЛЕПОТА: проверка не состоялась, и названа причина.
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: занятость проверяется только у тех служб, которые стенд сам
# портит и которые может занять машина. Молча пропускать проверку нельзя — слепота
# считается отдельно и попадает в итог и в канарейку полноты.
# EN: 🔴 THE SUBJECT MAY BE BUSY WITH SOMEONE ELSE'S WORK, and then the corruption measures
# a state other than the one it created. Twice the test went red on a healthy machine only
# because apt-daily.service happened to be running: stopping the timer changes nothing
# while the service is already running. A FAIL here LIES — it reads as a broken subject
# and sends people to fix what works. The honest answer is BLIND: the check did not take
# place, and the reason is named.
# WHERE IT DOES NOT APPLY: busyness is checked only for the services the test itself
# corrupts and that the machine may occupy. Silently skipping a check is not allowed —
# blindness is counted separately and goes into the total and into the completeness canary.
zanyat() { # RU: имя_службы -> 0 если занята · EN: service_name -> 0 if busy
  [ "$(systemctl is-active "$1" 2>/dev/null)" = active ]
}
propusk() { # RU: имя_проверки  служба · EN: check_name  service
  slep=$((slep+1))
  printf 'СЛЕП %-44s предмет занят: %s идёт прямо сейчас\n' "$1" "$2"
}
proba() { # RU: имя  ожидаемый_код  файл_реестра  id · EN: name  expected_code  registry_file  id
  local imya="$1" zhdu="$2" fajl="$3" zid="$4" telo out rc
  telo="$(dostat "$fajl" "$zid")" || { fail=$((fail+1)); printf 'FAIL %-44s СЛЕПОТА: не достать проверку из %s\n' "$imya" "$fajl"; return; }
  [ -n "$telo" ] || { fail=$((fail+1)); printf 'FAIL %-44s СЛЕПОТА: проверка пуста\n' "$imya"; return; }
  out=$(bash -c "$telo" 2>&1); rc=$?
  if [ "$rc" -eq "$zhdu" ]; then ok=$((ok+1)); printf 'ok   %-44s код %s | %s\n' "$imya" "$rc" "$(hvost "$out")"
  else fail=$((fail+1)); printf 'FAIL %-44s код %s (ждали %s) | %s\n' "$imya" "$rc" "$zhdu" "$(hvost "$out")"; fi
}

echo "=== A. ПРОСТОЙ: механизмы исправны, ждём зелёное ==="
proba "сторож реестров"                 0 "$REESTR" registry-watchdog
proba "уведомитель обновлений"          0 "$REESTR" apt-updates-notify
proba "автоустановка выключена"         0 "$REESTR" apt-avtoustanovka

echo
echo "=== B. НАСТОЯЩАЯ ПОРЧА: таймер сторожа остановлен ==="
sudo systemctl stop registry-watchdog.timer
proba "при остановленном таймере"       1 "$REESTR" registry-watchdog
sudo systemctl start registry-watchdog.timer
proba "после возврата таймера"          0 "$REESTR" registry-watchdog

echo
echo "=== C. НАСТОЯЩАЯ ПОРЧА: таймер уведомителя остановлен ==="
sudo systemctl stop apt-updates-notify.timer
proba "при остановленном таймере"       1 "$REESTR" apt-updates-notify
sudo systemctl start apt-updates-notify.timer
proba "после возврата таймера"          0 "$REESTR" apt-updates-notify

echo
echo "=== D. НАСТОЯЩАЯ ПОРЧА: автоустановка возвращена ==="
sudo systemctl unmask apt-daily-upgrade.timer >/dev/null 2>&1
sudo systemctl start apt-daily-upgrade.timer  >/dev/null 2>&1
proba "при возвращённой автоустановке"  1 "$REESTR" apt-avtoustanovka
sudo systemctl stop apt-daily-upgrade.timer   >/dev/null 2>&1
sudo systemctl mask apt-daily-upgrade.timer   >/dev/null 2>&1
proba "после повторной маски"           0 "$REESTR" apt-avtoustanovka

echo
echo "=== E. НАСТОЯЩАЯ ПОРЧА: списки apt перестали обновляться ==="
# RU: 🔴 ЦЕНА ЭТОЙ ПОРЧИ: остановка и запуск apt-daily.timer заново разыгрывают
# RandomizedDelaySec (12 ч), то есть сдвигают ближайшее обновление списков.
# Ущерба нет — списки обновляются дважды в сутки, — но знать надо.
# EN: 🔴 THE COST OF THIS CORRUPTION: stopping and starting apt-daily.timer re-rolls
# RandomizedDelaySec (12 h), i.e. shifts the next package-list update.
# No harm — the lists are updated twice a day — but it is worth knowing.
if zanyat apt-daily.service; then
  propusk "при остановленном apt-daily"  apt-daily.service
  propusk "после возврата apt-daily"     apt-daily.service
else
  sudo systemctl stop apt-daily.timer
  proba "при остановленном apt-daily"     1 "$REESTR" apt-avtoustanovka
  sudo systemctl start apt-daily.timer
  proba "после возврата apt-daily"        0 "$REESTR" apt-avtoustanovka
fi

echo
if [ "$OKNO" = 1 ]; then
  echo "=== F. ОКНО ПРОГОНА: служба запущена ТАЙМЕРОМ (настоящее воспроизведение) ==="
  NEXT=$(date -u -d '+70 seconds' '+%H:%M:%S')
  sudo mkdir -p /etc/systemd/system/registry-watchdog.timer.d
  printf '[Timer]\nOnCalendar=*-*-* %s UTC\n' "$NEXT" | sudo tee /etc/systemd/system/registry-watchdog.timer.d/99-VREMENNO-stend.conf >/dev/null
  sudo systemctl daemon-reload
  dostat "$REESTR" registry-watchdog > /tmp/.hc-nov.$$ ; dostat "$STARYJ" registry-watchdog > /tmp/.hc-star.$$ 2>/dev/null || : > /tmp/.hc-star.$$
  timeout 140 bash -c 'until [ "$(systemctl show registry-watchdog.service -p ActiveState --value)" != inactive ]; do sleep 0.2; done'
  echo "  SubState(timer)=$(systemctl show registry-watchdog.timer -p SubState --value)  NextElapse=[$(systemctl show registry-watchdog.timer -p NextElapseUSecRealtime --value)]"
  out=$(bash /tmp/.hc-nov.$$ 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then ok=$((ok+1)); printf 'ok   %-44s код 0 | %s\n' "новая проверка внутри окна" "$(hvost "$out")"
  else fail=$((fail+1)); printf 'FAIL %-44s код %s | %s\n' "новая проверка внутри окна" "$rc" "$(hvost "$out")"; fi
  if [ -s /tmp/.hc-star.$$ ]; then
    out=$(bash /tmp/.hc-star.$$ 2>&1); rc=$?
    if [ "$rc" -eq 1 ]; then ok=$((ok+1)); printf 'ok   %-44s код 1 | %s\n' "старая проверка внутри окна (краснела)" "$(hvost "$out")"
    else fail=$((fail+1)); printf 'FAIL %-44s код %s — старая обязана краснеть, иначе окно не воспроизведено\n' "старая проверка внутри окна" "$rc"; fi
  else
    echo "  ⚠️ старой проверки нет ($STARYJ) — сверка «до и после» пропущена"
  fi
  timeout 90 bash -c 'until [ "$(systemctl show registry-watchdog.service -p ActiveState --value)" = inactive ]; do sleep 1; done'
  rm -f /tmp/.hc-nov.$$ /tmp/.hc-star.$$
  sudo rm -f /etc/systemd/system/registry-watchdog.timer.d/99-VREMENNO-stend.conf
  sudo rmdir /etc/systemd/system/registry-watchdog.timer.d 2>/dev/null
  sudo systemctl daemon-reload
  echo "  временный drop-in снят, следующий запуск: $(systemctl show registry-watchdog.timer -p NextElapseUSecRealtime --value)"
else
  echo "⚠️ СЛУЧАЙ F (окно прогона) НЕ ПРОВЕРЯЛСЯ — нужен ключ --okno."
  echo "   Без него стенд НЕ отвечает на главный вопрос: врёт ли проверка о себе изнутри прогона."
fi

echo
echo "=== ВОЗВРАТ СОСТОЯНИЯ ==="
sost_ok=1
for u in registry-watchdog.timer apt-updates-notify.timer apt-daily.timer; do
  a=$(systemctl is-active "$u"); [ "$a" = active ] || { echo "  🔴 $u сейчас $a"; sost_ok=0; }
done
m=$(systemctl is-enabled apt-daily-upgrade.timer 2>&1); [ "$m" = masked ] || { echo "  🔴 apt-daily-upgrade.timer сейчас $m, а должен быть masked"; sost_ok=0; }
d=$(ls -A /etc/systemd/system/registry-watchdog.timer.d 2>/dev/null | wc -l); [ "$d" = 0 ] || { echo "  🔴 остался временный drop-in"; sost_ok=0; }
[ "$sost_ok" = 1 ] && echo "  состояние машины возвращено полностью" || fail=$((fail+1))

echo
echo "ИТОГ: ok=$ok fail=$fail слепота=$slep"

# RU: Канарейка: ТОЧНОЕ число проверок, не «не меньше». Порог слеп к убыли ровно
# того размера, который умещается в запас, и выглядит строже, чем работает:
# «не меньше» звучит как требование, а действует как разрешение.
# Замерено приёмом «сверься с соседом того же вида»: канарейка была
# у 3 стендов из 13. Вырезанный раздел проходил кодом 0 — выпотрошенный стенд
# отчитывался успехом.
# EN: Canary: the EXACT number of checks, not "at least". A threshold is blind to a loss
# of exactly the size that fits in its margin, and looks stricter than it works:
# "at least" sounds like a requirement but acts as a permission.
# Measured with the "compare with a sibling of the same kind" technique: only 3 of 13
# tests had a canary. A removed section passed with code 0 — a gutted test
# reported success.
ZHDYOM_PROVEROK=11
if [ $((ok+fail+slep)) -ne $ZHDYOM_PROVEROK ]; then
  echo "СЛЕПОТА: проверок $((ok+fail+slep)), а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
[ "$fail" -eq 0 ] || exit 1
# RU: 🔴 Слепота НЕ зелёная: проверка не состоялась, и это не то же, что «сошлось».
# EN: 🔴 Blindness is NOT green: the check did not take place, which is not the same as "consistent".
[ "$slep" -eq 0 ] || { echo "код 2: часть проверок не состоялась — предмет был занят"; exit 2; }
exit 0
