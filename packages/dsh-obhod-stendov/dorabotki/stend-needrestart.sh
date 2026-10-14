#!/bin/bash
# Приёмка проверки proverka-needrestart.pl — она обязана уметь КРАСНЕТЬ.
# Текст проверки берётся из УСТАНОВЛЕННОГО файла: стенд её зовёт, а не повторяет.
#
# ЦЕНА ПРОГОНА, названная честно:
#  * стенд кладёт и снимает временные файлы в /etc/needrestart/conf.d (нужен sudo);
#  * один случай нарочно кладёт БИТЫЙ конфиг — пока он лежит, настоящий needrestart
#    отказал бы целиком. Порча живёт секунды и снимается сразу, но запускать стенд
#    посреди обновления системы нельзя;
#  * случай «живой needrestart» заводит два временных юнита nr-proba*, держащих
#    удалённую библиотеку, и снимает их. Без sudo он пропускается — ПРОПУСК, не успех.
#
# ГДЕ СТЕНД НЕ ПРИМЕНЯЕТСЯ: он не проверяет, что защита СРАБОТАЕТ при настоящем
# обновлении libc6 — для этого нужна сама libc6. Он проверяет конфигурацию и то,
# что needrestart её понимает так же, как проверка.
# ZHIVAYA-MASHINA: берёт замки dpkg/apt на прогон и пишет и снимает 99-STEND-*.conf в боевом /etc/needrestart/conf.d (возврат в trap)
# B-N-1929 (Заря; условия Вениамина 10:36Z): ключ --zhivaya-mashina — ПЕРВЫМ действием; без него ОТКАЗ-ZHIVAYA-MASHINA и код 2,
#   НИЧЕГО не позвано (ни sudo, ни systemctl). Ночной обход и ворота выпуска ключ НЕ подают; недельный (vse-stendy-nedelnye.sh) —
#   явно и поимённо своим строкам. Вручную: bash $0 --zhivaya-mashina. Ключ убирается из доводов, остальные — как прежде.
_ZM=0; _DOV=(); for _a in "$@"; do if [ "$_a" = --zhivaya-mashina ]; then _ZM=1; else _DOV+=("$_a"); fi; done
if [ "$_ZM" != 1 ]; then echo "ОТКАЗ-ZHIVAYA-MASHINA: берёт замки dpkg/apt на прогон и пишет и снимает 99-STEND-*.conf в боевом /etc/needrestart/conf.d (возврат в trap) — нужен --zhivaya-mashina. Ничего не тронуто."; exit 2; fi
set -- "${_DOV[@]+"${_DOV[@]}"}"
set -u
PROV=/opt/iskra/workspace/dorabotki/proverka-needrestart.pl
NASH=/etc/needrestart/conf.d/50-agent-services.conf
CONFD=/etc/needrestart/conf.d
ok=0; fail=0; skip=0
sluchaj() { printf '%-52s ' "$1"; }

# 🔴 ЗАКОННЫЙ ОТКАЗ ПРОВЕРЯЕМОГО — НЕ ЕГО ПРОВАЛ. Инструмент честно возвращает код 2
# «needrestart не установлен», то есть говорит «проверять нечем». Стенд, ждущий 0 или 1,
# считал это FAIL и печатал пять красных на ИСПРАВНОМ инструменте — а причина у всех
# была одна и лежала вне предмета. Отказ, объявленный законным, обязан читаться как
# отсутствие проверки и на стороне того, кто эту проверку вызывает.
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: пропуском становится ТОЛЬКО код 2 с этой причиной; любой другой
# код 2 остаётся расхождением — иначе слепота станет укрытием.
zakonnyj_otkaz() { [ "$c" = 2 ] && command grep -q "needrestart не установлен" "$OUT"; }
zeleno() { echo "ok   ($1)"; ok=$((ok+1)); }
krasno() { echo "FAIL ($1)"; fail=$((fail+1)); }
propusk() { echo "ПРОПУСК ($1)"; skip=$((skip+1)); }

[ -x "$PROV" ] || { echo "СЛЕПОТА: нет $PROV"; exit 2; }
[ -f "$NASH" ] || { echo "СЛЕПОТА: нет $NASH — стенду нечего проверять"; exit 2; }
SUM_DO=$(sha256sum "$NASH" | cut -d' ' -f1)

# 🔴 B-N-1808 (08.10.2026, Аврора; находка Михалыча B-N-1768): ПОРЧА conf.d ТОЛЬКО ПРИ СВОБОДНОМ ЗАМКЕ dpkg/apt.
#   apt-daily.timer на sadik активен: пробы 2–7 кладут в /etc/needrestart/conf.d битый и пустой конфиг — попади это
#   на работающий apt/dpkg, needrestart (если пакет вернут) прочёл бы порчу. Замок — тот же fcntl, что берут apt и dpkg:
#   пробуем взять его без ожидания и сразу отпускаем. Занят ⇒ «ЗАНЯТО», код 4, ни одной записи в conf.d.
#   Нет файла замка — не занят (dpkg создаёт его, когда берёт). Не открыть (права) — СЛЕПОТА, код 2, тоже без порчи.
# ⚠️ НЕ ЛОВИТ: apt, стартовавший ПОСЛЕ проверки, в секунды порчи (замок не удерживается); код 4 обход читает красным.
ZAMKI="${NR_ZAMKI:-/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock}"
# 🔴 B-N-1808 r2 (08.10, Михалыч; наряд Забавы 06:37Z — «проверка замка → СЛЕПОТА/ожидание»): замок не только проверяется,
#   но и УДЕРЖИВАЕТСЯ до выхода стенда — дыра «apt, стартовавший после проверки, в секунды порчи» (шапка Авроры выше) закрыта.
#   Держатель — отдельный процесс (sudo -n python3 -c), его stdin — канал coproc: закрыли канал/стенд умер ⇒ процесс вышел ⇒ замки сняты ядром.
#   Занят ⇒ ждём до NR_ZHDAT с (умолчание 60), опрос раз в 2 с; не дождались ⇒ «ЗАНЯТО», код 4, ни одной записи в conf.d.
#   Цена: на время прогона (секунды) apt/dpkg этих замков не получат — apt-daily в это окно отказал бы «Could not get lock» и повторил по таймеру.
# ⚠️ НЕ ЛОВИТ: needrestart, позванный в обход dpkg/apt (руками), — ему замок не нужен.
ZHDAT="${NR_ZHDAT:-60}"; [[ "$ZHDAT" =~ ^[0-9]+$ ]] || { echo "СЛЕПОТА: NR_ZHDAT «$ZHDAT» — не число"; exit 2; }
PY_ZAMOK='
import fcntl, os, sys, time
zhdat = int(sys.argv[1]); puti = sys.argv[2:]; konec = time.time() + zhdat
while True:
    vzyato, zanyat = [], None
    for put in puti:
        try: fd = os.open(put, os.O_RDWR)
        except FileNotFoundError: continue
        except OSError as e: print(f"СЛЕПОТА {put}: {e.strerror}", flush=True); sys.exit(2)
        try: fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); vzyato.append(fd)
        except OSError: os.close(fd); zanyat = put; break
    if zanyat is None: break
    for fd in vzyato: os.close(fd)
    if time.time() >= konec: print(f"ЗАНЯТО {zanyat}", flush=True); sys.exit(3)
    time.sleep(2)
print("ДЕРЖУ", flush=True)
sys.stdin.read()
'
otpustit_zamok() { if [ -n "${ZAMOK_PID:-}" ]; then exec {ZAMOK[1]}>&- 2>/dev/null; wait "$ZAMOK_PID" 2>/dev/null; ZAMOK_PID=""; fi; }
# shellcheck disable=SC2086
coproc ZAMOK { exec sudo -n python3 -B -u -c "$PY_ZAMOK" "$ZHDAT" $ZAMKI 2>&1; }
ZAMOK_PID=$ZAMOK_PID; trap 'otpustit_zamok' EXIT
otvet=""; read -r -t $((ZHDAT + 20)) otvet <&"${ZAMOK[0]}" || true
case "$otvet" in
  ДЕРЖУ) echo "замок dpkg/apt взят и удерживается до конца прогона (ждали не дольше ${ZHDAT} с)" ;;
  ЗАНЯТО*) otpustit_zamok; echo "ЗАНЯТО: замок dpkg/apt держит другой процесс дольше ${ZHDAT} с — порча conf.d не вносилась: ${otvet#ЗАНЯТО }"; exit 4 ;;
  *) otpustit_zamok; echo "СЛЕПОТА: замок dpkg/apt не взять — порча conf.d не вносилась: ${otvet:-ответа нет (sudo отказал?)}"; exit 2 ;;
esac

TMPD=$(mktemp -d /tmp/stend-nr.XXXXXX) || { echo "СЛЕПОТА: не создать временный каталог"; exit 2; }
OUT="$TMPD/vyvod.txt"
: > "$OUT" 2>/dev/null || { echo "СЛЕПОТА: во временный каталог не пишется — прогон невозможен"; exit 2; }
zapusk() { "$PROV" >"$OUT" 2>&1; echo $?; }
uberi()  { sudo -n rm -f "$CONFD"/99-STEND-*.conf "$CONFD"/00-STEND-*.conf; }
trap 'uberi; sudo -n mv -f "$NASH.STEND-OTKLYUCHEN" "$NASH" 2>/dev/null; rm -rf "$TMPD"; otpustit_zamok' EXIT

# --- 1. исправная машина -------------------------------------------------
sluchaj "исправная машина: код 0"
c=$(zapusk); grep -q 'наши=3/3 чужие-задеты=0/5' "$OUT" && [ "$c" = 0 ] \
  && zeleno "код 0, наши=3/3" || { zakonnyj_otkaz && propusk "needrestart не установлен — проверять действие нечем" || krasno "код=$c: $(tail -1 "$OUT")"; }

# --- 2. порча: файл 99-* перезатирает наш пустым списком ------------------
sluchaj "99-*.conf с пустым списком отменяет защиту"
echo '$nrconf{blacklist_rc} = [];' | sudo -n tee "$CONFD/99-STEND-pusto.conf" >/dev/null
c=$(zapusk); uberi
[ "$c" = 1 ] && grep -q 'защиты нет вовсе' "$OUT" \
  && zeleno "код 1, «защиты нет вовсе»" || { zakonnyj_otkaz && propusk "needrestart не установлен — проверять действие нечем" || krasno "код=$c: $(tail -1 "$OUT")"; }

# --- 3. порча: правило шире задуманного -----------------------------------
sluchaj "правило шире: задеты чужие службы"
printf '$nrconf{blacklist_rc} = [ qr(^iskra), qr(^petrovich), qr(^claude-oauth-gateway@) ];\n' \
  | sudo -n tee "$CONFD/99-STEND-shire.conf" >/dev/null
c=$(zapusk); uberi
[ "$c" = 1 ] && grep -q 'задеты чужие' "$OUT" \
  && zeleno "код 1, названы iskra-other/petrovich-other" || { zakonnyj_otkaz && propusk "needrestart не установлен — проверять действие нечем" || krasno "код=$c: $(tail -1 "$OUT")"; }

# --- 4. порча: защищена только одна из трёх -------------------------------
sluchaj "защищена одна из трёх: две названы поимённо"
printf '$nrconf{blacklist_rc} = [ qr(^iskra\\.service$) ];\n' \
  | sudo -n tee "$CONFD/99-STEND-chastichno.conf" >/dev/null
c=$(zapusk); uberi
[ "$c" = 1 ] && grep -q 'не защищены: petrovich.service, claude-oauth-gateway@iskra.service' "$OUT" \
  && zeleno "код 1, обе недостающие названы" || { zakonnyj_otkaz && propusk "needrestart не установлен — проверять действие нечем" || krasno "код=$c: $(tail -1 "$OUT")"; }

# --- 5. порча: наш файл переименован вне *.conf ---------------------------
# Ловушка расширений: needrestart читает только *.conf, поэтому копия рядом
# с «неправильным» именем защиты не даёт, хотя файл на диске цел.
sluchaj "наш файл вне маски *.conf: защиты нет"
sudo -n mv "$NASH" "$NASH.STEND-OTKLYUCHEN"
c=$(zapusk)
sudo -n mv "$NASH.STEND-OTKLYUCHEN" "$NASH"
[ "$c" = 1 ] && grep -q 'защиты нет вовсе' "$OUT" \
  && zeleno "код 1 при целом файле рядом" || { zakonnyj_otkaz && propusk "needrestart не установлен — проверять действие нечем" || krasno "код=$c: $(tail -1 "$OUT")"; }

# --- 6. слепота отделена от расхождения -----------------------------------
sluchaj "битый конфиг: СЛЕПОТА (код 2), а не расхождение"
echo '$nrconf{blacklist_rc} = [ qr(^bez-zakrytiya ;' | sudo -n tee "$CONFD/99-STEND-bityj.conf" >/dev/null
c=$(zapusk)
nr=$(sudo -n NEEDRESTART_MODE=l needrestart -b -r l >/dev/null 2>&1; echo $?)
uberi
[ "$c" = 2 ] && grep -q 'СЛЕПОТА' "$OUT" \
  && zeleno "код 2; настоящий needrestart на том же файле дал код $nr" \
  || { zakonnyj_otkaz && propusk "needrestart не установлен — проверять действие нечем" || krasno "код=$c: $(tail -1 "$OUT")"; }

# --- 7. живой needrestart: A/B механизма ----------------------------------
sluchaj "живой needrestart: якорь ^имя\$ и наши выражения"
if ! sudo -n true 2>/dev/null; then
  propusk "нет sudo без пароля — живой A/B не проводился"
elif ! sudo -n bash -c 'command -v needrestart' >/dev/null 2>&1; then
  # 🔴 «ПРАВИЛО НЕ ДЕЙСТВУЕТ» И «ИНСТРУМЕНТА НЕТ» — РАЗНЫЕ БЕДЫ, а раньше стенд
  # выдавал за первую вторую: печатал «наши выражения FAIL (A=0 B=0 …)», и это
  # читалось как «защита сломана», то есть страшнее, чем есть.
  # Замер 03.09.2026: needrestart вычищен с машины 02.09 в 14:28 командой
  # `apt-get -y purge needrestart`; наш /etc/needrestart/conf.d/50-agent-services.conf
  # при этом уцелел и лежит БЕЗ ПРИМЕНЕНИЯ. Пока пакета нет — автоперезапуска нет,
  # значит и угрозы нет; но нет и защиты, и вернётся она молча вместе с пакетом.
  propusk "needrestart НЕ УСТАНОВЛЕН (purge 02.09.2026 14:28) — проверять действие нечем; наш конфиг лежит без применения и заработает сам, если пакет вернут"
else
  D=/opt/iskra/workspace/nrproba-stend
  mkdir -p "$D"; cp /usr/lib/x86_64-linux-gnu/libz.so.1 "$D/libz.so.1"
  sudo -n systemd-run --unit=nr-proba --property="Environment=LD_PRELOAD=$D/libz.so.1" /bin/sleep 300 >/dev/null 2>&1
  sudo -n systemd-run --unit=nr-proba-iskra --property="Environment=LD_PRELOAD=$D/libz.so.1" /bin/sleep 300 >/dev/null 2>&1
  sleep 1; rm -f "$D/libz.so.1"
  A=$(sudo -n NEEDRESTART_MODE=l needrestart -b -r l 2>/dev/null | grep -c 'NEEDRESTART-SVC: nr-proba')
  printf '$nrconf{blacklist_rc} = [ qr(^nr-proba\\.service$) ];\n' \
    | sudo -n tee "$CONFD/99-STEND-ab.conf" >/dev/null
  B=$(sudo -n NEEDRESTART_MODE=l needrestart -b -r l 2>/dev/null | grep -c 'NEEDRESTART-SVC: nr-proba')
  BI=$(sudo -n NEEDRESTART_MODE=l needrestart -b -r l 2>/dev/null | grep -c 'NEEDRESTART-SVC: nr-proba-iskra.service')
  uberi
  C=$(sudo -n NEEDRESTART_MODE=l needrestart -b -r l 2>/dev/null | grep -c 'NEEDRESTART-SVC: nr-proba')
  sudo -n systemctl stop nr-proba.service nr-proba-iskra.service >/dev/null 2>&1
  sudo -n systemctl reset-failed nr-proba.service nr-proba-iskra.service >/dev/null 2>&1
  rm -rf "$D"
  # A: оба видны (наши выражения их не ловят) -> 2
  # B: заблэклистили ровно nr-proba.service той же формой ^имя$ -> остаётся 1, и это -iskra
  # C: порча снята -> снова 2
  if [ "$A" = 2 ] && [ "$B" = 1 ] && [ "$BI" = 1 ] && [ "$C" = 2 ]; then
    zeleno "A=2 B=1(nr-proba-iskra) C=2 — механизм действует, якорь \$ не шире"
  else
    krasno "A=$A B=$B BI=$BI C=$C — ожидалось 2/1/1/2"
  fi
fi

# --- возврат ---------------------------------------------------------------
SUM_POSLE=$(sha256sum "$NASH" | cut -d' ' -f1)
sluchaj "наш файл вернулся побайтно"
[ "$SUM_DO" = "$SUM_POSLE" ] && zeleno "sha256 совпал" || krasno "было $SUM_DO стало $SUM_POSLE"
sluchaj "временных файлов стенда не осталось"
n=$(ls "$CONFD"/*STEND* 2>/dev/null | wc -l)
[ "$n" = 0 ] && zeleno "0" || krasno "осталось $n"
sluchaj "временных юнитов стенда не осталось"
n=$(systemctl list-units --all --no-legend --plain 'nr-proba*' 2>/dev/null | wc -l)
[ "$n" = 0 ] && zeleno "0" || krasno "осталось $n"

echo "-----------------------------------------------------------"
echo "зелёных: $ok  красных: $fail  пропущено: $skip"

# Канарейка: ТОЧНОЕ число, не «не меньше». Порог слеп к убыли ровно того
# размера, который умещается в запас, и при этом выглядит строже точного
# значения: «не меньше» звучит как требование, а работает как разрешение.
# Замерено 25.08.2026: у трёх стендов из тринадцати канарейка была, у десяти нет —
# вырезанный раздел проходил кодом 0, то есть выпотрошенный стенд отчитывался успехом.
ZHDYOM_PROVEROK=10
if [ $((ok+fail+skip)) -ne $ZHDYOM_PROVEROK ]; then
  echo "СЛЕПОТА: проверок $((ok+fail+skip)), а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
[ "$fail" = 0 ] || exit 1
[ "$skip" = 0 ] || exit 2
exit 0
