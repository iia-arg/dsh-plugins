#!/usr/bin/env bash
# RU: Сторож машины с агентами. Проверяет то, что ломается молча, и зовёт человека.
# EN: Watchdog for a machine that runs agents. Checks what breaks silently and calls a human.
#
# RU: ПРИНЦИП. Сторож не чинит — он сообщает. Починка требует решения, а решение
# RU: принимает человек или агент, но не таймер.
# EN: PRINCIPLE. The watchdog does not repair — it reports. A repair needs a decision,
# EN: and a decision is made by a human or an agent, never by a timer.
#
# RU: ГРАНИЦЫ (без них защита производит тот вред, от которого защищает):
# RU:   • у каждой проверки свой порог, и он в переменной, а не в коде;
# RU:   • на каждую беду — окно тишины (COOLDOWN), иначе тревога станет фоном и её
# RU:     перестанут читать;
# RU:   • сторож молчит, когда всё хорошо. «Ежечасное всё в порядке» — это не
# RU:     наблюдение, а шум.
# EN: LIMITS (without them a guard causes the very harm it guards against):
# EN:   • every check has its own threshold, kept in a variable, not in code;
# EN:   • every problem has a quiet window (COOLDOWN), otherwise the alert becomes
# EN:     background noise and people stop reading it;
# EN:   • the watchdog is silent when all is well. An hourly "all fine" is noise,
# EN:     not observation.
#
# RU: ПРОВЕРЯЕТ ЖИВОЙ ОБЪЕКТ, А НЕ ЗАПИСЬ О НЁМ: состояние службы у systemd, живой
# RU: ответ по сети, реальные байты на диске.
# EN: IT CHECKS THE LIVE OBJECT, NOT A RECORD ABOUT IT: unit state as systemd sees it,
# EN: a live network answer, real bytes on disk.
set -uo pipefail

# RU: Отказ источника — не отсутствие предмета. Вызывающий проверяет код вне $(...).
# RU: Одна попытка добычи за проход; законный пустой результат разбирается отдельно.
# EN: A failed source is not an absent subject. The caller checks the exit code outside $(...).
# EN: One fetch attempt per pass; a legitimately empty result is handled separately.
net_dannyh() {
  local msg="СЛЕПОТА: не добыто $1; код $2; ${3:0:200}"
  printf '%s\n' "$msg" >&2
  logger -t "agent-watchdog" -- "$msg" 2>/dev/null || true
}


# RU: Пути — настройки. Файл настройки по умолчанию — в каталоге пакета /etc/dsh-storozha-mashiny/agent-watchdog.conf;
# RU: на машине с прежним местом путь задаётся переменной WATCHDOG_CONF (drop-in юнита), как каталог состояния и канал.
# EN: Paths are settings. The default settings file is in the package directory /etc/dsh-storozha-mashiny/agent-watchdog.conf;
# EN: a machine with an older location sets WATCHDOG_CONF (unit drop-in), like the state dir and the channel.
CONF="${WATCHDOG_CONF:-/etc/dsh-storozha-mashiny/agent-watchdog.conf}"
STATE="${WATCHDOG_STATE:-/var/lib/machine-watchdog}"
ALERT="${WATCHDOG_ALERT:-/usr/local/bin/agent-alert}"
mkdir -p "$STATE"

# RU: Умолчания; всё перекрывается файлом настройки.
# EN: Defaults; everything is overridden by the settings file.
SERVICES=""                 # RU: список служб через пробел · EN: space-separated unit list
MEMORY_HEALTH_URL=""        # RU: адрес проверки живости памяти, пусто — не проверять · EN: memory health URL, empty = skip
DISK_PATHS="/"              # RU: где смотреть место · EN: where to check free space
DISK_MIN_FREE_PCT=10        # RU: ниже этого — тревога · EN: below this — alert
COOLDOWN_MIN=30             # RU: окно тишины на одну и ту же беду · EN: quiet window per problem, minutes
# RU: Нет файла настройки — сказать об этом И выйти кодом провала (2) в конце прохода: без него сторож
# RU: смотрит только место на «/», и удачный прогон юнита читался бы как «службы под наблюдением»
# RU: (немая слепота на таймере). Место на диске всё равно меряется — полезная часть не теряется.
# EN: No settings file — say so AND exit with a failure code (2) at the end of the pass: without it the
# EN: watchdog only checks free space on "/", and a successful unit run would read as "units are watched"
# EN: (silent blindness on a timer). Free space is still measured — the useful part is kept.
nastrojki_net=0
if [ -r "$CONF" ]; then . "$CONF"
else nastrojki_net=1
     printf '%s\n' "настройки нет ($CONF): службы и память не наблюдаются, только место на $DISK_PATHS (задайте WATCHDOG_CONF)" >&2
fi

# RU: Окно тишины: одна и та же беда не повторяется чаще, чем раз в COOLDOWN_MIN.
# EN: Quiet window: the same problem is not repeated more often than once per COOLDOWN_MIN.
should_alert() {
  # RU: 🔴 Ключ чистим от косых черт: в путях вида «disk-/var» они превращали имя
  # RU: файла отметки в несуществующий путь, отметка не писалась, и окно тишины для
  # RU: дисковых тревог не работало вовсе. Снаружи не видно: тревога-то уходит.
  # EN: 🔴 Slashes are stripped from the key: in paths like "disk-/var" they turned the
  # EN: stamp file name into a nonexistent path, the stamp was never written, and the
  # EN: quiet window for disk alerts never worked. Invisible from outside: the alert still goes out.
  local key="${1//\//_}" f now age
  f="$STATE/last-${key}.stamp"
  now=$(date +%s)
  if [ -f "$f" ]; then
    age=$(( now - $(cat "$f" 2>/dev/null || echo 0) ))
    [ "$age" -lt $(( COOLDOWN_MIN * 60 )) ] && return 1
  fi
  return 0
}

# RU: Отметка окна тишины ставится ТОЛЬКО после подтверждённой отправки. Раньше она
# RU: стояла в should_alert, то есть до отправки: недоставленная тревога глушила
# RU: себя на COOLDOWN_MIN минут. 🔴 ГРАНИЦА: если отправка падает раз за разом,
# RU: тревога будет повторяться каждый запуск сторожа — это намеренно. Не «чинить»
# RU: возвратом отметки вперёд: молчащая беда хуже повторяющейся.
# EN: The quiet-window stamp is set ONLY after a confirmed send. It used to be set in
# EN: should_alert, i.e. before sending: an undelivered alert muted itself for COOLDOWN_MIN
# EN: minutes. 🔴 LIMIT: if sending fails again and again, the alert repeats on every run —
# EN: on purpose. Do not "fix" it by moving the stamp back: a silent problem is worse than a repeating one.
mark_sent() {
  local key="${1//\//_}"
  date +%s > "$STATE/last-${key}.stamp"
}

# RU: Экранирование для parse_mode=HTML телеграма. Строка журнала с «<» или «&»
# RU: роняет отправку целиком: 400 «can't parse entities». Проверено живым
# RU: запросом к API. Порядок замен важен: «&» первым.
# RU: 🔴 Обратная косая перед «&» обязательна: в bash 5.2 «&» в ПРАВОЙ части
# RU: ${s//что/на_что} значит «всё совпадение», как в sed. Без неё «&lt;» станет
# RU: «<lt;» — текст выглядит почти верным, а телеграм отвечает 400. Поймано опытом.
# EN: Escaping for Telegram parse_mode=HTML. A journal line containing "<" or "&" makes
# EN: the whole send fail: 400 "can't parse entities". Verified with a live API request.
# EN: Replacement order matters: "&" first.
# EN: 🔴 The backslash before "&" is required: in bash 5.2 an "&" on the RIGHT side of
# EN: ${s//what/with} means "the whole match", as in sed. Without it "&lt;" becomes
# EN: "<lt;" — looks almost right, and Telegram answers 400. Learned the hard way.
esc() {
  local s="${1-}"
  s="${s//&/\&amp;}"; s="${s//</\&lt;}"; s="${s//>/\&gt;}"
  printf '%s' "$s"
}

# RU: Обрезка по ЗНАКАМ, построчно. `cut -c` в GNU coreutils режет по БАЙТАМ и
# RU: локаль игнорирует — на русском тексте обрыв приходился на середину буквы,
# RU: телеграм отвечал 400 «text must be encoded in UTF-8», тревога не уходила.
# RU: Подстановка ${s:0:N} считает знаки только при заданной локали — она задана
# RU: в юните (Environment=LC_ALL=C.UTF-8).
# EN: Trim by CHARACTERS, line by line. GNU coreutils `cut -c` cuts BYTES and ignores
# EN: the locale — on Cyrillic text the cut landed mid-letter, Telegram answered 400
# EN: "text must be encoded in UTF-8", and the alert never went out.
# EN: ${s:0:N} counts characters only with a locale set — the unit sets it
# EN: (Environment=LC_ALL=C.UTF-8).
#
# RU: 🔴 ИЗВЕСТНЫЙ СПЯЩИЙ ДЕФЕКТ (не чиним намеренно): `read` не отдаёт
# RU: последнюю строку, если во входе нет завершающего перевода строки. В бою не
# RU: проявляется — вход всегда от journalctl, там перевод есть. Проснётся, если
# RU: кто-то поменяет источник входа (например, подаст текст через printf '%s'):
# RU: тревога тогда молча станет пустой. Меняешь источник — проверь этот случай.
# EN: 🔴 KNOWN DORMANT DEFECT (deliberately not fixed): `read` drops the last line when
# EN: the input has no trailing newline. Never shows in production — input always comes
# EN: from journalctl, which ends with a newline. It wakes up if someone changes the input
# EN: source (e.g. feeds text via printf '%s'): the alert then silently becomes empty.
# EN: Changing the source — test this case.
cut_chars() {
  local n="$1" l
  while IFS= read -r l; do printf '%s\n' "${l:0:$n}"; done
}

alert() {
  local key="$1" text="$2"
  should_alert "$key" || { echo "тихо ($key): окно тишины ещё не вышло"; return 0; }
  if [ ! -x "$ALERT" ]; then
    echo "🔴 нет помощника $ALERT — тревога НЕ отправлена: $text"
    nedostavleno=$((nedostavleno+1))
    return 0
  fi
  local out rc
  out="$("$ALERT" "$text" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then
    mark_sent "$key"
  else
    echo "🔴 тревога ($key) НЕ доставлена (код $rc): $out — окно тишины не ставлю, повторю в следующий заход"
    nedostavleno=$((nedostavleno+1))
  fi
}

problems=0
dobycha_failed=0
nedostavleno=0

# RU: ── 1. Службы. Проверяем состояние у systemd, а не наличие процесса: процесс
# RU: с похожим именем может принадлежать чужой службе.
# EN: ── 1. Units. We ask systemd for the state instead of looking for a process: a process
# EN: with a similar name may belong to a different unit.
# RU: 🔴 Элемент «юнит:часы» — СВЕЖЕСТЬ последнего успешного запуска разовой службы вместо
# RU: is-active (oneshot между тактами inactive). is-active таймера не видит «таймер active, запусков нет» и службу, падающую
# RU: при живом таймере. Успех и провал — из журнала systemd (сняты опытом на systemd-run -p Type=oneshot):
# RU:   успех  — JOB_TYPE=start JOB_RESULT=done  («Finished …»);
# RU:   провал — JOB_TYPE=start JOB_RESULT=failed/timeout/… («Failed to start …»), рядом UNIT_RESULT=exit-code.
# RU: Различитель: последнее ЗАВЕРШЕНИЕ запуска не done → «ПАДАЕТ»; иначе последний done старше срока (или его нет) → «НЕ
# RU: СРАБАТЫВАЛ». Журнал не добыт → СЛЕПОТА (код 2), не «чисто». Элементы без «:» — как прежде (is-active).
# RU: ⚠️ ГРАНИЦА: только для Type=oneshot. У simple/forking done ставится на СТАРТЕ — там «юнит:часы» мерит не то.
# RU: Не ловит: успешный по коду запуск, ничего не проверивший (сторож, который всегда кончается exit 0); журнал, обрезанный
# RU: ротацией до последнего запуска (даст громкое «не срабатывал», не тихое).
# EN: 🔴 An item "unit:hours" checks FRESHNESS of the last successful run of a oneshot unit instead of
# EN: is-active (a oneshot is inactive between runs). is-active on a timer misses "timer active, no runs" and a unit that
# EN: fails while its timer is alive. Success and failure come from the systemd journal (measured with systemd-run -p Type=oneshot):
# EN:   success — JOB_TYPE=start JOB_RESULT=done  ("Finished …");
# EN:   failure — JOB_TYPE=start JOB_RESULT=failed/timeout/… ("Failed to start …"), with UNIT_RESULT=exit-code nearby.
# EN: Rule: the last COMPLETED start is not done → "FAILING"; otherwise the last done is older than the limit (or absent) →
# EN: "NOT RUNNING". Journal not fetched → BLINDNESS (exit 2), not "clean". Items without ":" work as before (is-active).
# EN: ⚠️ LIMIT: Type=oneshot only. For simple/forking, done is recorded at START — there "unit:hours" measures the wrong thing.
# EN: Does not catch: a run that succeeded by exit code but checked nothing (a guard that always ends with exit 0); a journal
# EN: rotated past the last run (gives a loud "not running", not a silent pass).
svezhest() { # svezhest юнит часы · svezhest unit hours
  local u="$1" ch="$2" out kod posl posl_ok now vozr
  if ! [[ "$ch" =~ ^[1-9][0-9]*$ ]]; then
    problems=$((problems+1)); alert "fresh-$u-forma" "🔴 элемент SERVICES <b>$(esc "$u:$ch")</b> негоден: после «:» нужны часы (целое ≥1)"; return
  fi
  out=$(journalctl UNIT="$u" JOB_TYPE=start -o json -n 20 --no-pager -q 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "журнал запусков $u" "$kod" "$out"; dobycha_failed=1; return; fi
  posl=$(printf '%s\n' "$out" | jq -rs 'map(select(.JOB_RESULT)) | last | if . then "\(.__REALTIME_TIMESTAMP)|\(.JOB_RESULT)" else "" end' 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "разбор журнала запусков $u (jq)" "$kod" "$posl"; dobycha_failed=1; return; fi
  out=$(journalctl UNIT="$u" JOB_TYPE=start JOB_RESULT=done -o json -n 1 --no-pager -q 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "журнал успехов $u" "$kod" "$out"; dobycha_failed=1; return; fi
  posl_ok=$(printf '%s\n' "$out" | jq -rs 'last | if . then .__REALTIME_TIMESTAMP else "" end' 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "разбор журнала успехов $u (jq)" "$kod" "$posl_ok"; dobycha_failed=1; return; fi
  now=$(date +%s)
  local ok_txt="в журнале нет"
  if [ -n "$posl_ok" ]; then
    vozr=$(( now - posl_ok / 1000000 ))
    if [ "$vozr" -lt 3600 ]; then ok_txt="$(( vozr / 60 )) мин"; else ok_txt="$(( vozr / 3600 )) ч"; fi
    ok_txt="$ok_txt назад ($(date -u -d "@$(( posl_ok / 1000000 ))" '+%d.%m %H:%MZ'))"
  fi
  if [ -n "$posl" ] && [ "${posl#*|}" != done ]; then
    problems=$((problems+1))
    alert "fresh-$u-padaet" "🔴 <b>$u</b> ПАДАЕТ: последний запуск ($(date -u -d "@$(( ${posl%%|*} / 1000000 ))" '+%d.%m %H:%MZ')) завершился <b>$(esc "${posl#*|}")</b>; последний успех: $ok_txt. Таймер зовёт, служба не доходит до конца."
    return
  fi
  vozr=$(( now - ${posl_ok:-0} / 1000000 ))
  if [ -z "$posl_ok" ] || [ "$vozr" -gt $(( ch * 3600 )) ]; then
    problems=$((problems+1))
    alert "fresh-$u-molchit" "🔴 <b>$u</b> НЕ СРАБАТЫВАЛ: последний успешный запуск — $ok_txt при сроке $ch ч; провалов после него нет — служба не запускается (таймер снят, «active без следующего запуска» или завис)."
  fi
}

for s in $SERVICES; do
  case "$s" in *:*) svezhest "${s%%:*}" "${s#*:}"; continue ;; esac
  st="$(systemctl is-active "$s" 2>/dev/null || true)"
  if [ "$st" != "active" ]; then
    problems=$((problems+1))
    alert "service-$s" "🔴 служба <b>$s</b> в состоянии <b>${st:-неизвестно}</b>. Последние строки журнала:
<code>$(esc "$(journalctl -u "$s" --no-pager -n 5 2>/dev/null | tail -5 | cut_chars 160)")</code>"
  fi
done

# RU: ── 2. Память: живой ответ по сети, а не «служба запущена».
# EN: ── 2. Memory service: a live network answer, not "the unit is running".
if [ -n "$MEMORY_HEALTH_URL" ]; then
  resp="$(curl -s -m 10 "$MEMORY_HEALTH_URL" 2>&1)"
  case "$resp" in
    *'"status":"ok"'*) : ;;
    *)
      problems=$((problems+1))
      alert "memory-health" "🔴 память не отвечает на проверку живости ($MEMORY_HEALTH_URL). Ответ: <code>$(esc "$(printf %s "$resp" | LC_ALL=C.utf8 sed -e 's/\(.\{0,160\}\).*/\1/')")</code>"
      ;;
  esac
fi

# RU: ── 3. Место на диске. Кончится — молча встанет всё: и записи памяти, и журналы.
# EN: ── 3. Disk space. When it runs out everything stops silently: memory writes and journals alike.
for p in $DISK_PATHS; do
  disk_raw=$(df --output=avail,size "$p" 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then
    net_dannyh "место на диске $p (df)" "$kod" "$disk_raw"
    dobycha_failed=1; continue
  fi
  free_pct=$(printf '%s\n' "$disk_raw" | awk 'NR==2 && NF==2 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ && $2>0 && $1<=$2 {printf "%d", $1*100/$2; ok=1} END {if (!ok || NR!=2) exit 2}'); kod=$?
  if [ "$kod" -ne 0 ]; then
    net_dannyh "доля свободного места $p (разбор df)" "$kod" "пустой или негодный результат"
    dobycha_failed=1; continue
  fi
  if [ "$free_pct" -lt "$DISK_MIN_FREE_PCT" ]; then
    problems=$((problems+1))
    alert "disk-$p" "🔴 на <b>$p</b> осталось <b>${free_pct}%</b> места (порог ${DISK_MIN_FREE_PCT}%). Занято: <code>$(esc "$(du -sh "$p"/* 2>/dev/null | sort -rh | head -3 | tr '\n' ' ')")</code>"
  fi
done

# RU: 1.0.1: недоставленная тревога — провал юнита кодом 3, а не 0: иначе беда, которую сторож увидел,
# RU: не дошла ни до человека, ни до соседнего сторожа служб. Проверяется ПЕРВОЙ — код 2 «неполна» её не перекроет.
# EN: 1.0.1: an undelivered alert fails the unit with exit 3, not 0 — otherwise a problem the watchdog saw reaches
# EN: neither a human nor the neighbouring service watchdog. Checked FIRST so exit 2 "incomplete" does not hide it.
if [ "$nedostavleno" -ne 0 ]; then
  echo "🔴 тревог НЕ доставлено: $nedostavleno (помощник $ALERT) — юнит failed (код 3); известных проблем: $problems"
  exit 3
fi
if [ "$dobycha_failed" -ne 0 ]; then
  echo "проверка неполна: часть предметов не измерена (место на диске и/или журнал запусков — строки СЛЕПОТА выше); известных проблем: $problems"
  exit 2
fi
# RU: Настройки нет — проход неполон: код 2 (юнит failed), причина названа. Проблемы места, если были, уже сказаны.
# EN: No settings — the pass is incomplete: exit 2 (unit failed), reason named. Disk problems, if any, were already reported.
if [ "$nastrojki_net" -ne 0 ]; then
  echo "проверка неполна: настройки нет ($CONF) — службы и память НЕ наблюдаются; известных проблем: $problems"
  exit 2
fi
if [ "$problems" -eq 0 ]; then
  echo "ok: всё проверенное в порядке ($(date -Iseconds))"
else
  echo "problems: $problems"
fi
exit 0
