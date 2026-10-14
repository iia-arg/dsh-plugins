#!/bin/bash
# СТЕНД «СТОРОЖ НАД СТОРОЖАМИ» (sadik-watch, ветка 2в; B-N-884, Искра, 25.09.2026).
# Гоняет ВЕСЬ sadik-watch под root (как юнит), но: состояние — временный каталог, канал — заглушка, перечень — подставной,
# journalctl/systemctl подменены ТОЛЬКО для юнитов proba-*.service (прочие вызовы — настоящие). Боевые рубежи и бот не трогаются.
# Ждём: свежий — молчит; просроченный — красное с именем и тревога; failed — красное; прогона нет — красное; снять — «снова в порядке»
# один раз, дальше тишина; перечень не прочитан — красное.
# Где не применяется: настоящие таймеры (это живой прогон ветки на боевом перечне — отдельная проба 8).
# ЧЕГО НЕ ЛОВИТ (граница предмета, B-N-1827): сторожа, ЗАСТРЯВШЕГО в activating навсегда — sadik-watch его свежесть не судит
#   (:961), стенд повторяет эту границу: «идёт Y» печатается отдельным числом, но красным не становится. Сам класс — B-N-1828 (Аврора).
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
SW="${SADIK_WATCH_BIN:-/usr/local/sbin/sadik-watch}"
[ -f "$SW" ] || { echo "СЛЕПОТА: нет $SW"; exit 2; }
T=$(mktemp -d /tmp/stend-nad-storozhami.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }; chmod 755 "$T"
trap 'sudo -n rm -rf "$T"' EXIT
ok=0; bad=0; SEY=$(date +%s)
mkdir -p "$T/shim" "$T/sost"
cat > "$T/shim/journalctl" <<'SH'
#!/bin/bash
u=""; for a in "$@"; do case "$a" in UNIT=proba-*) u="${a#UNIT=}";; esac; done
if [ -n "$u" ]; then v=$(sed -n "s/^${u} //p" "$(dirname "$0")/../ts" 2>/dev/null); [ -n "$v" ] && printf '{"__REALTIME_TIMESTAMP":"%s000000"}\n' "$v"; exit 0; fi
exec /usr/bin/journalctl "$@"
SH
cat > "$T/shim/systemctl" <<'SH'
#!/bin/bash
# B-N-1068: полнота — таймеры и пути их юнитов из файлов стенда; файл «tajmery-nastoyashchie» — настоящие (живой срез, проба 8).
d="$(dirname "$0")/.."
case " $* " in
  *" list-timers "*) [ -e "$d/tajmery-nastoyashchie" ] && exec /usr/bin/systemctl "$@"; cat "$d/tajmery" 2>/dev/null; exit 0 ;;
  *" show "*FragmentPath*) [ -e "$d/tajmery-nastoyashchie" ] && exec /usr/bin/systemctl "$@"; cat "$d/fragmenty" 2>/dev/null; exit 0 ;;
  *" is-failed "*proba-*) grep -qxF "${@: -1}" "$(dirname "$0")/../failed" 2>/dev/null; exit $? ;;
  *" show "*proba-*) echo inactive; exit 0 ;;
esac
exec /usr/bin/systemctl "$@"
SH
printf '#!/bin/sh\necho "$1" >> %s/trevogi\n' "$T" > "$T/alert"
# B-N-886: подмена «канал отказал» ПИШЕТ СЛЕД каждого вызова — видно, что она дошла (не второй sudo, не проба мимо);
# подставной a2a-send кладёт письмо из stdin и выходит кодом ${A2A_KOD:-4} (4 — «лёг, видимость не ушла», как у root).
printf '#!/bin/sh\necho "$1" >> %s/popytki-kanala\nexit 1\n' "$T" > "$T/alert-otkaz"
printf '#!/bin/sh\necho "komu=$1" >> %s/a2a-pisma\ncat >> %s/a2a-pisma\nexit $(cat %s/a2a-kod 2>/dev/null || echo 4)\n' "$T" "$T" "$T" > "$T/a2a"
chmod 755 "$T/shim/"* "$T/alert" "$T/alert-otkaz" "$T/a2a"
printf 'proba-a.service 26\nproba-b.service 26\n' > "$T/perechen"
# B-N-1068: подставные таймеры (строка list-timers: … <таймер> <служба>) и пути их юнитов; по умолчанию оба «наши» и оба в перечне.
tajmery() { : > "$T/tajmery"; : > "$T/fragmenty"; while [ $# -ge 2 ]; do
  printf 'n/a n/a n/a n/a %s.timer %s.service\n' "$1" "$1" >> "$T/tajmery"; printf 'Id=%s.timer\nFragmentPath=%s/%s.timer\n\n' "$1" "$2" "$1" >> "$T/fragmenty"; shift 2; done; }
tajmery proba-a /etc/systemd/system proba-b /etc/systemd/system
progon() { rm -f "$T/trevogi"; sudo -n env PATH="$T/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" SADIK_WATCH_MESTNO=1 \
  SADIK_WATCH_SOST="$T/sost" SADIK_ALERT_BIN="${ALERT_BIN:-$T/alert}" SADIK_A2A_BIN="$T/a2a" SADIK_SUTOCHNYE="${1:-$T/perechen}" "$SW" > "$T/vyvod" 2>&1; }
sud() { if [ "$2" = ok ]; then ok=$((ok+1)); echo "  ok    $1"; else bad=$((bad+1)); echo "  FAIL  $1 — $3"; fi; }
est() { grep -qF -- "$1" "$2" 2>/dev/null; }
# 1 оба свежие
printf 'proba-a.service %s\nproba-b.service %s\n' $((SEY-3600)) $((SEY-7200)) > "$T/ts"; : > "$T/failed"; progon
! est "СТОРОЖ НАД СТОРОЖАМИ" "$T/vyvod" && ! est "СТОРОЖ НАД СТОРОЖАМИ" "$T/trevogi" && est "суточный сторож proba-a.service: прогон состоялся 1 ч назад" "$T/vyvod" \
  && sud "1 свежие — молчит, строка свежести в журнале" ok || sud "1 свежие" fail "$(grep -a 'сторож' "$T/vyvod" | head -2)"
# 2 просроченный
printf 'proba-a.service %s\nproba-b.service %s\n' $((SEY-30*3600)) $((SEY-3600)) > "$T/ts"; progon
est "proba-a.service — последний прогон состоялся 30 ч назад при сроке 26 ч" "$T/trevogi" && ! est "proba-b" "$T/trevogi" \
  && sud "2 просроченный — тревога с именем и часами, свежий не назван" ok || sud "2 просроченный" fail "тревоги: $(cat "$T/trevogi" 2>/dev/null | head -c 200)"
# 3 повтор того же состава — тишина (остывание 6 ч)
progon; ! est "proba-" "$T/trevogi" && est "СТОРОЖ НАД СТОРОЖАМИ" "$T/vyvod" && sud "3 тот же состав — канал молчит (о proba-*), журнал помнит" ok || sud "3 повтор" fail "тревога повторилась"
# 4 failed
echo proba-b.service > "$T/failed"; progon
est "proba-b.service — FAILED" "$T/trevogi" && sud "4 failed — тревога с именем" ok || sud "4 failed" fail "$(cat "$T/trevogi" 2>/dev/null | head -c 200)"
# 5 прогона нет
: > "$T/failed"; printf 'proba-a.service %s\n' $((SEY-3600)) > "$T/ts"; progon
est "proba-b.service — состоявшегося прогона в журнале НЕТ" "$T/trevogi" && sud "5 прогона нет — тревога" ok || sud "5 прогона нет" fail "$(cat "$T/trevogi" 2>/dev/null | head -c 200)"
# 6 снять — снова в порядке, один раз
printf 'proba-a.service %s\nproba-b.service %s\n' $((SEY-3600)) $((SEY-3600)) > "$T/ts"; progon
est "снова в порядке" "$T/trevogi" && sud "6 снять — «снова в порядке»" ok || sud "6 снять" fail "$(cat "$T/trevogi" 2>/dev/null | head -c 200)"
progon; ! est "proba-" "$T/trevogi" && ! est "СТОРОЖ НАД СТОРОЖАМИ" "$T/vyvod" && sud "6б дальше — тишина (о proba-*)" ok || sud "6б тишина" fail "есть тревога/строка"
# 9 B-N-886: основной канал отказал → запасной (письмо a2a агенту машины); подмена дошла; повтор не шлёт
rm -rf "$T/sost"; mkdir -p "$T/sost"; rm -f "$T/popytki-kanala" "$T/a2a-pisma" "$T/a2a-kod"
printf 'proba-a.service %s\nproba-b.service %s\n' $((SEY-30*3600)) $((SEY-3600)) > "$T/ts"; : > "$T/failed"
ALERT_BIN="$T/alert-otkaz" progon
p=$(grep -c . "$T/popytki-kanala" 2>/dev/null || echo 0)
if [ "$p" -ge 1 ] && est "komu=iskra" "$T/a2a-pisma" && est "ОСНОВНОЙ КАНАЛ ТРЕВОГ ОТКАЗАЛ" "$T/a2a-pisma" && est "proba-a.service — последний прогон состоялся 30 ч" "$T/a2a-pisma" \
   && est "запасной канал: письмо в ящике iskra (a2a-send код 4)" "$T/vyvod"; then sud "9 канал отказал ($p вызов(а) подмены) → письмо a2a iskra с тревогой" ok
else sud "9 запасной канал" fail "вызовов подмены $p; a2a: $(head -c 150 "$T/a2a-pisma" 2>/dev/null)"; fi
# B-N-1841: письмо = запись от komu=; живые тревоги других групп не входят в проверку повтора proba-.
pisma_proba() { awk '/^komu=/{n+=p;p=0} index($0,"proba-"){p=1} END{print n+p}' "$T/a2a-pisma" 2>/dev/null; }
n1=$(pisma_proba); ALERT_BIN="$T/alert-otkaz" progon; n2=$(pisma_proba)
[ "$n1" = "$n2" ] && sud "9б доставлено запасным — отметка стоит, повтор письма нет" ok || sud "9б повтор" fail "писем было $n1, стало $n2"
# 10 оба канала отказали → строка в журнале, отметки нет, следующий такт пробует снова
rm -rf "$T/sost"; mkdir -p "$T/sost"; rm -f "$T/a2a-pisma"; echo 1 > "$T/a2a-kod"
ALERT_BIN="$T/alert-otkaz" progon; ALERT_BIN="$T/alert-otkaz" progon
m=$(grep -c '^komu=' "$T/a2a-pisma" 2>/dev/null || echo 0)
est "ЗАПАСНОЙ канал тоже отказал (a2a-send код 1" "$T/vyvod" && [ "$m" -ge 2 ] && sud "10 оба отказали — 🔴 в журнале, повтор каждый такт ($m попыток)" ok || sud "10 оба отказали" fail "попыток a2a $m; $(grep -a 'ЗАПАСНОЙ' "$T/vyvod" | head -1)"
rm -f "$T/a2a-kod"; rm -rf "$T/sost"; mkdir -p "$T/sost"
# 11 B-N-1068: ПОЛНОТА — наш таймер без строки перечня → тревога; «!» — молчит; чужой (/usr/lib) — молчит; слепота — тревога
rm -rf "$T/sost"; mkdir -p "$T/sost"; : > "$T/failed"
printf 'proba-a.service %s\nproba-b.service %s\n' $((SEY-3600)) $((SEY-3600)) > "$T/ts"
tajmery proba-a /etc/systemd/system proba-b /etc/systemd/system proba-c /etc/systemd/system; progon
est "proba-c.service — таймер proba-c.timer наш (/etc/systemd/system/proba-c.timer), строки в перечне НЕТ" "$T/trevogi" && est "наших таймеров 3 · исключено «!» 0 · без строки 1" "$T/vyvod" \
  && sud "11 наш таймер без строки — тревога с именем, счёт 3/0/1" ok || sud "11 полнота" fail "$(grep -a 'полнота' "$T/vyvod" | head -1) | $(head -c 200 "$T/trevogi" 2>/dev/null)"
cp "$T/perechen" "$T/perechen-isk"; echo '!proba-c.service проба стенда' >> "$T/perechen-isk"; rm -rf "$T/sost"; mkdir -p "$T/sost"; progon "$T/perechen-isk"
! est "строки в перечне НЕТ" "$T/trevogi" && ! est "строки в перечне НЕТ" "$T/vyvod" && ! est "строка перечня негодна" "$T/vyvod" && est "наших таймеров 3 · исключено «!» 1 · без строки 0" "$T/vyvod" \
  && sud "11б «!proba-c.service причина» — молчит, «!»-строка не судится как срок" ok || sud "11б исключение" fail "$(grep -a 'полнота\|негодна\|НЕТ' "$T/vyvod" | head -2)"
tajmery proba-a /etc/systemd/system proba-b /etc/systemd/system proba-c /usr/lib/systemd/system; rm -rf "$T/sost"; mkdir -p "$T/sost"; progon
! est "строки в перечне НЕТ" "$T/trevogi" && est "наших таймеров 2 · исключено «!» 0 · без строки 0" "$T/vyvod" \
  && sud "11в чужой таймер (/usr/lib) без строки — молчит" ok || sud "11в чужой" fail "$(grep -a 'полнота' "$T/vyvod" | head -1)"
: > "$T/tajmery"; : > "$T/fragmenty"; rm -rf "$T/sost"; mkdir -p "$T/sost"; progon
est "полнота перечня НЕ проверена: список таймеров пуст" "$T/trevogi" && sud "11г список таймеров пуст — тревога-слепота, не «всё внесено»" ok || sud "11г слепота" fail "$(head -c 200 "$T/trevogi" 2>/dev/null)"
tajmery proba-a /etc/systemd/system proba-b /etc/systemd/system; : > "$T/fragmenty"; rm -rf "$T/sost"; mkdir -p "$T/sost"; progon
est "таймеров 2, а наших (файл в /etc/systemd/system) 0" "$T/trevogi" && sud "11д пути юнитов не прочитаны — тревога-слепота" ok || sud "11д слепота" fail "$(head -c 200 "$T/trevogi" 2>/dev/null)"
tajmery proba-a /etc/systemd/system proba-b /etc/systemd/system; rm -rf "$T/sost"; mkdir -p "$T/sost"
# 7 перечень не прочитан
progon "$T/netu"; est "перечень суточных сторожей не прочитан" "$T/trevogi" && sud "7 перечень не прочитан — тревога" ok || sud "7 перечень" fail "$(cat "$T/trevogi" 2>/dev/null | head -c 200)"
# B-N-1827 (08.10, Искра; разбор Михалыча, признаки Вениамина 08:48Z): sadik-watch про сторожа в activating пишет
#   «<юнит> — прогон идёт, свежесть в этом такте не сужу» (без «суточный сторож») — прежний счёт только по «прогон состоялся» давал
#   ложное «свежих 76 из 77». Теперь два числа ОТДЕЛЬНО: состоялся X и идёт Y; проба 8 зелёная при X+Y=M, а Y печатается всегда —
#   вечный activating не сливается в «свежих». Просроченный/failed/без прогона строки не пишут — не входят ни в X, ни в Y.
schet_sostoyalsya() { grep -ac 'суточный сторож .*прогон состоялся' "$1"; }
schet_idyot() { grep -acE ' — прогон идёт( [0-9]+ мин \(срок [0-9]+ ч\))?, свежесть в этом такте не сужу' "$1"; }   # обе формы: до 1.0.6 и с 1.0.6 (B-N-1828: «идёт N мин (срок X ч)»)
# 8в–8д — сам счёт на подставном выводе (живой срез activating не воспроизводит по заказу); M=3: строка «идёт» в обеих формах sadik-watch
printf '%s\n' '   суточный сторож proba-a.service: прогон состоялся 3 ч назад (срок 30 ч)' '   proba-b.service — прогон идёт, свежесть в этом такте не сужу' '   proba-c.service — прогон идёт 12 мин (срок 30 ч), свежесть в этом такте не сужу' > "$T/vyvod-schet"
x=$(schet_sostoyalsya "$T/vyvod-schet"); y=$(schet_idyot "$T/vyvod-schet")
[ "$y" = 2 ] && [ $((x+y)) = 3 ] && sud "8в сторожа в activating (обе формы, до и с 1.0.6): зелено, идёт Y=2 (свежих $x · идёт $y · из 3)" ok || sud "8в activating" fail "свежих $x · идёт $y · из 3"
[ "$x" = 1 ] && sud "8г контроль: activating НЕ засчитан как «состоялся» (X=$x)" ok || sud "8г контроль" fail "X=$x, ждали 1"
printf '%s\n' '   суточный сторож proba-a.service: прогон состоялся 3 ч назад (срок 30 ч)' > "$T/vyvod-schet"
x=$(schet_sostoyalsya "$T/vyvod-schet"); y=$(schet_idyot "$T/vyvod-schet")
[ $((x+y)) = 1 ] && sud "8д просроченный (строки нет): свежих $x · идёт $y · из 2 → проба 8 краснеет" ok || sud "8д просроченный" fail "свежих $x · идёт $y"
# 8 боевой перечень на настоящем журнале (если он есть) — живой срез, тревога в заглушку
BP="${STEND_BOEVOJ_PERECHEN:-/etc/agent-registry/storozha-sutochnye.txt}"   # B-N-1068: подмена — прогон кандидата перечня до монтажа
if [ -r "$BP" ]; then
  rm -rf "$T/sost"; mkdir -p "$T/sost"; touch "$T/tajmery-nastoyashchie"; progon "$BP"; rm -f "$T/tajmery-nastoyashchie"
  x=$(schet_sostoyalsya "$T/vyvod"); y=$(schet_idyot "$T/vyvod"); m=$(grep -vcE '^[[:space:]]*(#|$|!)' "$BP")
  echo "  (живой срез: $(grep -a 'суточный сторож\|СТОРОЖ НАД' "$T/vyvod" | tr '\n' '|' | cut -c1-300))"
  [ $((x+y)) = "$m" ] && sud "8 боевой перечень по настоящему журналу: свежих $x · идёт $y · из $m" ok || sud "8 боевой перечень" fail "свежих $x · идёт $y · из $m"
  ! est "строки в перечне НЕТ" "$T/vyvod" && ! est "полнота перечня НЕ проверена" "$T/vyvod" && est "полнота перечня: наших таймеров" "$T/vyvod" \
    && sud "8б боевой перечень ПОЛОН по настоящим таймерам: $(grep -ao 'наших таймеров [0-9]* · исключено «!» [0-9]* · без строки [0-9]*' "$T/vyvod" | head -1)" ok \
    || sud "8б полнота боевого" fail "$(grep -a 'полнота\|строки в перечне НЕТ' "$T/vyvod" | head -3 | cut -c1-250)"
else ok=$((ok+2)); echo "  ok    8, 8б боевого перечня ещё нет — живой срез не делается (до монтажа)"; fi
echo "  ok=$ok  FAIL=$bad"
ZHDYOM=21   # B-N-1068: 12 → 18 — пробы 11, 11б–11д (полнота) и 8б (полнота боевого перечня); B-N-1827: 18 → 21 — 8в, 8г, 8д (счёт: состоялся/идёт)
[ $((ok+bad)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из $ZHDYOM"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
