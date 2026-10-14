#!/bin/bash
# СТЕНД B-N-916: sadik-watch без среды юнита — ОТКАЗ (код 2), а не ложная тревога.
# Повод: 25.09 15:36Z голый `sadik-watch --help` снял срез по ssh (умолчание aclaude), основной канал sadik-alert дал 127,
# запасной положил агенту ложное письмо. Всё здесь подставное: состояние — временный каталог, запасной канал a2a — заглушка
# (SADIK_A2A_BIN; это НЕ признак среды юнита), основной — заглушка. Сторож — под root через `sudo -n env <явный список>`
# (env_reset: чего не передали, того у сторожа нет — это и есть «голый» запуск).
# Ждём: Б1 без среды — код 2, «ОТКАЗ», 0 писем в запасной канал, каталог состояния не создан · Б2 с одной переменной из двух —
# отказ · Б3 среда юнита — обычный такт (итог напечатан, без «ОТКАЗ»), код 0. Порча «проверка снята» подаётся как
# SADIK_WATCH_BIN=<копия>: тогда Б1/Б2 краснеют — голый запуск снова кладёт письмо в запасной канал (в заглушку).
# Звать: рука при правке sadik-watch; Б3 гоняет весь sadik-watch (~70 с). В ночной обход не входит.
set -u
# RU: Стенд меряет через sudo. Нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — СЛЕПОТА, код 2, а не ложное красное.
# EN: The test measures through sudo. No sudo (an agent shell in bwrap with NoNewPrivs, no rights) — BLIND, exit 2, not a false red.
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo (NoNewPrivs $(awk '/^NoNewPrivs/{print $2}' /proc/self/status)) — стенд меряет через sudo, исход был бы ложным"; exit 2; }
SW="${SADIK_WATCH_BIN:-/usr/local/sbin/sadik-watch}"
T=$(mktemp -d /tmp/stend-sw-bez-sredy.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }; chmod 755 "$T"
trap 'sudo -n rm -rf "$T"' EXIT
ok=0; bad=0
sud() { if [ "$2" = ok ]; then ok=$((ok+1)); echo "  ok    $1"; else bad=$((bad+1)); echo "  FAIL  $1 — $3"; fi; }
printf '#!/bin/sh\ncat >> %s/pisma\necho >> %s/pisma\nexit 0\n' "$T" "$T" > "$T/a2a"
printf '#!/bin/sh\necho "$1" >> %s/trevogi\n' "$T" > "$T/alert"; chmod 755 "$T/a2a" "$T/alert"
PUT="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
pisem() { local n; n=$(grep -c 'sadik-watch' "$T/pisma" 2>/dev/null); echo "${n:-0}"; }
# Б1 — голый: только заглушка запасного канала и временное состояние
rm -f "$T/pisma"; out=$(sudo -n env "$PUT" SADIK_A2A_BIN="$T/a2a" SADIK_WATCH_SOST="$T/sost1" "$SW" --help 2>&1); rc=$?
if [ "$rc" = 2 ] && printf '%s' "$out" | grep -aqF 'ОТКАЗ: sadik-watch запущен без среды юнита' && [ "$(pisem)" = 0 ] && ! sudo -n test -e "$T/sost1"; then
  sud "Б1 без среды юнита — код 2, «ОТКАЗ», писем 0, состояние не создано" ok
else sud "Б1" fail "код $rc, писем $(pisem), состояние $(sudo -n test -e "$T/sost1" && echo создано || echo нет): $(printf '%s' "$out" | tail -1 | cut -c1-120)"; fi
# Б2 — одна переменная из двух (счёт писем — свой: файл сброшен)
rm -f "$T/pisma"; out=$(sudo -n env "$PUT" SADIK_WATCH_MESTNO=1 SADIK_A2A_BIN="$T/a2a" SADIK_WATCH_SOST="$T/sost2" "$SW" 2>&1); rc=$?
[ "$rc" = 2 ] && printf '%s' "$out" | grep -aqF 'ОТКАЗ' && [ "$(pisem)" = 0 ] \
  && sud "Б2 только SADIK_WATCH_MESTNO — отказ" ok || sud "Б2" fail "код $rc, писем $(pisem)"
# Б3 — среда юнита (как в sadik-watch.service; канал и состояние — подставные)
: > "$T/perechen-sut"
out=$(sudo -n env "$PUT" SADIK_WATCH_MESTNO=1 SADIK_ALERT_BIN="$T/alert" SADIK_A2A_BIN="$T/a2a" SADIK_WATCH_SOST="$T/sost3" \
  SADIK_SUTOCHNYE="$T/perechen-sut" "$SW" 2>&1); rc=$?
if [ "$rc" = 0 ] && ! printf '%s' "$out" | grep -aqF 'ОТКАЗ: sadik-watch запущен без среды' && printf '%s' "$out" | grep -aqE 'бед не найдено|бед найдено|🔴'; then
  sud "Б3 среда юнита — обычный такт (код 0, итог напечатан)" ok
else sud "Б3" fail "код $rc: $(printf '%s' "$out" | tail -1 | cut -c1-120)"; fi
echo "  ok=$ok  FAIL=$bad"
ZHDYOM=3
[ $((ok+bad)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из $ZHDYOM"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
