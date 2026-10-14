#!/usr/bin/env bash
# RU: Уведомление о наличии обновлений: говорит, что ждёт, и НИЧЕГО НЕ СТАВИТ.
# EN: Pending-updates notifier: says what is waiting and INSTALLS NOTHING.
#
# RU: ЗАЧЕМ. По решению владельца машины автоматическая УСТАНОВКА обновлений
# RU: выключена: сложный сервер не обновляют вслепую, обновляет агент по
# RU: процедуре. Но выключенная защита без замены делает тихо: уязвимость выйдет,
# RU: а мы узнаем об этом случайно и постфактум. Поэтому обновление СПИСКОВ
# RU: пакетов оставлено включённым (apt-daily.timer), а этот механизм раз в сутки
# RU: читает списки и говорит человеку, что накопилось.
# EN: WHY. By the machine owner's decision automatic INSTALLATION of updates is off:
# EN: a complex server is not updated blindly, an agent updates it by procedure. But a
# EN: protection switched off without a replacement fails silently: a vulnerability gets
# EN: fixed upstream and we learn it by chance, too late. So refreshing package LISTS stays
# EN: on (apt-daily.timer), and this tool reads the lists once a day and tells a human
# EN: what has piled up.
#
# RU: ГРАНИЦА, РАДИ КОТОРОЙ ОН И НАПИСАН: он НЕ ставит и не скачивает ничего. Всё,
# RU: что он делает, — читает уже скачанные списки и отправляет сообщение. Установка
# RU: — отдельное решение человека и отдельная процедура.
# EN: THE LIMIT IT WAS WRITTEN FOR: it installs and downloads NOTHING. All it does is
# EN: read already downloaded lists and send a message. Installing is a separate human
# EN: decision and a separate procedure.
#
# RU: ТРИ КОДА ВОЗВРАТА. «Не смог измерить» это НЕ «обновлений нет»:
# RU:   0  измерено (обновления есть или их нет — и то и другое штатно)
# RU:   1  СПИСКИ ПРОТУХЛИ: механизм знания сломан. Числа ниже в этом случае врут
# RU:      в сторону спокойствия, и это опаснее любого числа обновлений.
# RU:   2  СЛЕПОТА: измерить не удалось (инструмент не запустился, форма вывода не
# RU:      узнана) ЛИБО измерить удалось, а сказать человеку не вышло. Недоставленная
# RU:      тревога — это тоже «не отработал», и юнит обязан числиться упавшим.
# EN: THREE EXIT CODES. "Could not measure" is NOT "no updates":
# EN:   0  measured (updates exist or not — both normal)
# EN:   1  LISTS STALE: the knowledge source is broken. The numbers then err on the
# EN:      calm side, which is more dangerous than any update count.
# EN:   2  BLINDNESS: could not measure (tool did not run, output shape unknown) OR
# EN:      measured but failed to tell a human. An undelivered alert is also "did not
# EN:      work", and the unit must show as failed.
#
# RU: 🔴 ГДЕ ЭТОТ МЕХАНИЗМ НЕ ПРИМЕНЯЕТСЯ — читать до того, как на него положиться:
# RU:   • Он НЕ знает про уязвимости как таковые. Он знает только то, что уже лежит
# RU:     в скачанных списках apt. Уязвимость без выпущенного пакета ему не видна,
# RU:     и обновления вне apt (npm, pypi, плагины) — тоже: за ними нужен отдельный
# RU:     инструмент, у него другой вопрос и ему нужна сеть.
# RU:   • Он НЕ замечает собственной смерти. Молчание неотличимо от спокойствия,
# RU:     поэтому: раз в HEARTBEAT_DAYS суток он говорит «жив», а снаружи за его
# RU:     таймером следит сторож машины (agent-watchdog.sh, список SERVICES).
# RU:     Ни то ни другое не ловит «таймер числится активным, но не срабатывает» —
# RU:     этот случай виден только по разрыву, то есть уже ПОСЛЕ запуска.
# RU:   • Он НЕ считает обновления ESM (расширенная поддержка Canonical): подписка на
# RU:     машине не включена, эти пакеты недоступны, и показывать их значило бы
# RU:     ежедневно звать человека к тому, чего он не может поставить.
# RU:   • Он НЕ отличает важное от пустяка. «5 пакетов ждут» — это факт, а не оценка.
# EN: 🔴 WHERE THIS TOOL DOES NOT APPLY — read before relying on it:
# EN:   • It does NOT know about vulnerabilities as such. It knows only what is already in
# EN:     the downloaded apt lists. A vulnerability without a released package is invisible,
# EN:     and so are updates outside apt (npm, pypi, plugins): they need a separate tool
# EN:     that asks a different question and needs the network.
# EN:   • It does NOT notice its own death. Silence looks like calm, so: once every
# EN:     HEARTBEAT_DAYS days it says "alive", and the machine watchdog (agent-watchdog.sh,
# EN:     SERVICES list) watches its timer from outside. Neither catches "the timer is
# EN:     listed active but never fires" — that shows only as a gap, i.e. AFTER a run.
# EN:   • It does NOT count ESM updates (Canonical extended support): without a
# EN:     subscription those packages are unavailable, and showing them would call a human
# EN:     daily to something they cannot install.
# EN:   • It does NOT tell important from trivial. "5 packages waiting" is a fact, not a rating.
set -uo pipefail

# RU: Локаль задана явно и до первого измерения: без неё разбор вывода apt зависит
# RU: от языка запускающего (`apt list` говорит по-русски из оболочки агента и
# RU: по-английски из пустого окружения таймера), и одна машина выглядит по-разному
# RU: из разных рук. Измерено на соседнем стороже.
# EN: The locale is set explicitly before the first measurement: otherwise parsing apt
# EN: output depends on the caller's language (`apt list` speaks Russian in an agent's
# EN: shell and English in a timer's empty environment), and one machine looks different
# EN: from different hands. Measured on a neighbouring watchdog.
export LC_ALL=C.UTF-8

CONF="${APTUN_CONF:-/etc/apt-updates-notify/apt-updates-notify.conf}"
STATE="${APTUN_STATE:-/var/lib/apt-updates-notify}"
ALERT="${APTUN_ALERT:-/usr/local/bin/agent-alert}"

# RU: Форма ${ИМЯ:-умолчание} обязательна: без неё стенд не может подсунуть
# RU: подставные данные, и проверка «умеет ли механизм краснеть» проходит на живой
# RU: машине — то есть отвечает не на тот вопрос.
# EN: The ${NAME:-default} form is mandatory: without it a test stand cannot inject fake
# EN: data, and the "can it turn red" check runs against the live machine — answering
# EN: the wrong question.
CHECK_CMD="${CHECK_CMD:-/usr/lib/update-notifier/apt-check}"
LIST_CMD="${LIST_CMD:-apt list --upgradable}"
STAMP_FILE="${STAMP_FILE:-/var/lib/apt/periodic/update-success-stamp}"
STALE_DAYS="${STALE_DAYS:-3}"          # RU: списки старше — тревога: мы ослепли · EN: lists older — alert: we are blind
HEARTBEAT_DAYS="${HEARTBEAT_DAYS:-7}"  # RU: молчал столько суток — сказать «жив» · EN: silent this many days — say "alive"
RAW_LINES="${RAW_LINES:-12}"
RAW_CHARS="${RAW_CHARS:-200}"
[ -r "$CONF" ] && . "$CONF"

# RU: 🔴 СОСТОЯНИЕ — НЕ СЛУЖЕБНАЯ МЕЛОЧЬ. В нём живут отметки, по которым механизм
# RU: замечает СВОЙ перерыв и говорит «жив»; без него оба предела молчат, а прогон
# RU: при этом выглядит успешным. Поймано живым прогоном: `mkdir` от имени
# RU: агента в /var/lib отказывает, отказ был проглочен `|| true`, юнит завершился
# RU: «success» — и механизм навсегда остался бы в состоянии «первый запуск», то есть
# RU: без предела молчания, ради которого предел и заводился.
# RU: Каталог создаёт systemd (StateDirectory= в юните). Здесь — проверка, что он
# RU: доступен НА ЗАПИСЬ, потому что существование каталога и право писать в него —
# RU: разные вещи, и вторая проверяется только записью.
# EN: 🔴 STATE IS NOT A MINOR DETAIL. It holds the stamps by which the tool notices ITS OWN
# EN: gap and says "alive"; without it both limits stay silent while the run looks
# EN: successful. Caught on a live run: `mkdir` as the agent user in /var/lib is refused,
# EN: the refusal was swallowed by `|| true`, the unit finished "success" — and the tool
# EN: would have stayed in "first run" forever, without the silence limit it exists for.
# EN: systemd creates the directory (StateDirectory= in the unit). Here we check it is
# EN: WRITABLE: a directory existing and being writable are different things, and the
# EN: second is proven only by writing.
mkdir -p "$STATE" 2>/dev/null
SOSTOYANIE_BEDA=""
if ! : > "$STATE/.proba-zapisi" 2>/dev/null; then
  SOSTOYANIE_BEDA="состояние недоступно на запись ($STATE): отметки не сохранятся, «жив» и «перерыв» работать не будут"
else
  rm -f "$STATE/.proba-zapisi" 2>/dev/null
fi

# RU: Разметка телеграма: «<» и «&» роняют отправку целиком (400 can't parse
# RU: entities). Обратная косая перед «&» обязательна — в правой части подстановки
# RU: голый «&» значит «всё совпадение», и «&lt;» превратилось бы в «<lt;».
# EN: Telegram markup: "<" and "&" make the whole send fail (400 can't parse entities).
# EN: The backslash before "&" is required — on the right side of the substitution a bare
# EN: "&" means "the whole match", and "&lt;" would turn into "<lt;".
esc() {
  local s="${1-}"
  s="${s//&/\&amp;}"; s="${s//</\&lt;}"; s="${s//>/\&gt;}"
  printf '%s' "$s"
}

# RU: Обрезка сырья по знакам, а не по байтам: `cut -c` режет байты и рвёт русскую
# RU: букву пополам, после чего телеграм отвечает 400 «text must be encoded in UTF-8».
# EN: Raw output is trimmed by characters, not bytes: `cut -c` cuts bytes and splits a
# EN: Cyrillic letter, after which Telegram answers 400 "text must be encoded in UTF-8".
syroe() {
  local text="$1" n=0 l out=""
  while IFS= read -r l; do
    n=$((n+1)); [ "$n" -gt "$RAW_LINES" ] && { out+="… (дальше обрезано)"$'\n'; break; }
    out+="${l:0:$RAW_CHARS}"$'\n'
  done <<< "$text"
  printf '%s' "$out"
}

now=$(date +%s)
ruka="$(id -un)@$(hostname -s 2>/dev/null || echo '?')"
zapusk="$(date -Is)"

slepota=()
syroe_bloki=""
[ -n "$SOSTOYANIE_BEDA" ] && slepota+=("$SOSTOYANIE_BEDA")

# RU: ── 1. Сколько применится НЕМЕДЛЕННО и сколько из них по безопасности.
# RU: apt-check печатает «N;M» в stderr (не в stdout) и возвращает 0 при любой беде,
# RU: поэтому код возврата здесь непригоден, а сторожем служит форма вывода.
# EN: ── 1. How many apply IMMEDIATELY and how many of them are security.
# EN: apt-check prints "N;M" to stderr (not stdout) and returns 0 whatever goes wrong,
# EN: so its exit code is useless here; the output shape is the guard.
ac_out="$("$CHECK_CMD" 2>&1)"; ac_code=$?
nemedlenno=""; bezopasnost=""
if [[ "$ac_out" =~ ^[0-9]+\;[0-9]+$ ]]; then
  nemedlenno="${ac_out%;*}"; bezopasnost="${ac_out#*;}"
else
  slepota+=("apt-check: форма вывода не узнана (код $ac_code): $(printf %s "$ac_out" | LC_ALL=C.utf8 sed -e 's/\(.\{0,120\}\).*/\1/')")
  syroe_bloki+="── $CHECK_CMD (код $ac_code)"$'\n'"$(syroe "$ac_out")"$'\n'
fi

# RU: ── 2. Полный список ожидающих. Он ШИРЕ первого числа и это не противоречие:
# RU: apt-check считает то, что применится сейчас, а сюда попадают и пакеты,
# RU: отложенные поэтапным раскатом (phasing). На живой машине было
# RU: ровно так: apt-check 0, а ждут 5. Показываем оба числа и объясняем разницу —
# RU: иначе одно из них прочтут как «всё свежее», а другое как «висит вечно».
# EN: ── 2. The full pending list. It is WIDER than the first number, and that is not a
# EN: contradiction: apt-check counts what applies now, while this list also includes
# EN: packages held back by phased rollout. Seen on a live machine: apt-check 0, five
# EN: waiting. Both numbers are shown and the difference explained — otherwise one reads
# EN: as "all fresh" and the other as "stuck forever".
# shellcheck disable=SC2086
list_out="$($LIST_CMD 2>/dev/null)"; list_code=$?
vsego=""; imena=""; sec_imena=""
if [ "$list_code" -eq 0 ] && printf '%s' "$list_out" | grep -q '^Listing'; then
  imena="$(printf '%s' "$list_out" | grep -v '^Listing' | grep '/')"
  vsego=$( [ -n "$imena" ] && printf '%s\n' "$imena" | wc -l || echo 0 )
  # RU: Ветка безопасности определяется по набору, из которого взят кандидат:
  # RU: имя набора стоит после косой черты в первом поле строки apt.
  # EN: The security pocket is identified by the suite the candidate comes from:
  # EN: the suite name follows the slash in the first field of the apt line.
  sec_imena="$(printf '%s' "$imena" | awk -F'[/ ]' '$2 ~ /(^|,)[^,]*-security(,|$)/ {print $1}')"
else
  slepota+=("apt list: вывод не узнан (код $list_code)")
  syroe_bloki+="── $LIST_CMD (код $list_code)"$'\n'"$(syroe "$list_out")"$'\n'
fi
sec_vsego=$( [ -n "$sec_imena" ] && printf '%s\n' "$sec_imena" | wc -l || echo 0 )

# RU: ── 3. Свежесть списков. Это ГЛАВНАЯ проверка, а не служебная: все числа выше
# RU: читаются из локальных списков, и протухшие списки дают уверенное «обновлений
# RU: нет». Отказ, неотличимый от спокойствия, — ровно то, от чего заведён механизм.
# EN: ── 3. List freshness. This is the MAIN check, not a side one: all numbers above
# EN: come from local lists, and stale lists give a confident "no updates". A failure
# EN: indistinguishable from calm is exactly what this tool exists against.
spiski_vozrast=""; spiski_protuhli=0
if [ -r "$STAMP_FILE" ]; then
  st=$(stat -c %Y "$STAMP_FILE" 2>/dev/null || echo 0)
  sutok=$(( (now - st) / 86400 ))
  spiski_vozrast="списки обновлены $(date -d "@$st" -Is) ($sutok сут. назад)"
  [ "$sutok" -ge "$STALE_DAYS" ] && spiski_protuhli=1
else
  slepota+=("отметка обновления списков нечитаема: $STAMP_FILE")
  spiski_vozrast="отметка $STAMP_FILE нечитаема"
fi

# RU: ── Вердикт. Слепота сильнее протухших списков: «не смог измерить» означает,
# RU: что и про остальное мы знаем меньше, чем думаем.
# EN: ── Verdict. Blindness outranks stale lists: "could not measure" means we know less
# EN: about everything else than we think.
if [ "${#slepota[@]}" -gt 0 ]; then verdikt=СЛЕПОТА; kod=2
elif [ "$spiski_protuhli" = 1 ]; then verdikt="СПИСКИ ПРОТУХЛИ"; kod=1
else verdikt=ИЗМЕРЕНО; kod=0
fi

# RU: ── Разрыв: когда механизм запускался в прошлый раз.
# EN: ── Gap: when the tool ran last time.
razryv=""; pervyj_zapusk=0
if [ -r "$STATE/last-run.stamp" ]; then
  prev=$(cat "$STATE/last-run.stamp" 2>/dev/null || echo 0)
  gap=$(( (now - prev) / 86400 ))
  [ "$gap" -ge 2 ] && razryv="перерыв: прошлый прогон был $gap сут. назад — всё это время про обновления никто не спрашивал"
else
  pervyj_zapusk=1
fi

# RU: ── Печать в журнал: вердикт и сырьё рядом. Вердикт без сырья непроверяем.
# EN: ── Journal output: verdict and raw data side by side. A verdict without raw data is unverifiable.
echo "обновления apt: $verdikt (код $kod)"
echo "  рукой: $ruka   запуск: $zapusk"
echo "  применится немедленно: ${nemedlenno:-?} (из них по безопасности: ${bezopasnost:-?})"
echo "  всего новее в списках: ${vsego:-?} (из них из ветки безопасности: $sec_vsego)"
echo "  $spiski_vozrast"
[ -n "$razryv" ] && echo "  $razryv"
[ -n "$imena" ] && { echo "── ожидают:"; printf '%s\n' "$imena" | head -20; }
for x in "${slepota[@]:-}"; do [ -n "$x" ] && echo "  СЛЕПОТА: $x"; done
[ -n "$syroe_bloki" ] && { echo "── сырьё:"; printf '%s' "$syroe_bloki"; }

# RU: ── Надо ли говорить человеку.
# RU: Повод «есть обновления» повторяется КАЖДЫЕ сутки, пока они есть, и окна тишины
# RU: здесь нет намеренно: непоставленное обновление — это долг, и он обязан быть
# RU: виден, пока не погашен. Отложенные раскатом сами по себе поводом не являются:
# RU: они доедут сами через несколько дней, а ежедневная тревога о том, чего человек
# RU: не может ускорить, приучает не читать тревоги.
# EN: ── Should a human be told.
# EN: "Updates pending" repeats EVERY day while they exist; there is deliberately no quiet
# EN: window: an uninstalled update is a debt and must stay visible until paid. Packages
# EN: held back by phased rollout are not a reason by themselves: they arrive in a few
# EN: days, and a daily alert about something a human cannot speed up teaches people to
# EN: ignore alerts.
povod=""
if [ "$kod" -eq 2 ]; then povod="слепота"
elif [ "$kod" -eq 1 ]; then povod="протухли"
elif [ "$pervyj_zapusk" = 1 ]; then povod="заведён"
elif [ "${nemedlenno:-0}" -gt 0 ] || [ "$sec_vsego" -gt 0 ]; then povod="есть"
elif [ -n "$razryv" ]; then povod="разрыв"
else
  molchal=$(( (now - $(cat "$STATE/last-spoke.stamp" 2>/dev/null || echo 0)) / 86400 ))
  [ "$molchal" -ge "$HEARTBEAT_DAYS" ] && povod="жив"
fi

svodka="применится немедленно: <b>${nemedlenno:-?}</b> (по безопасности ${bezopasnost:-?})
всего новее в списках: ${vsego:-?}, из ветки безопасности: $sec_vsego
$(esc "$spiski_vozrast")"

soobshenie=""
case "$povod" in
  слепота)
    soobshenie="⚠️ обновления apt: <b>СЛЕПОТА</b>
рукой: $(esc "$ruka"), $(esc "$zapusk")"
    for x in "${slepota[@]:-}"; do [ -n "$x" ] && soobshenie+=$'\n'"• $(esc "$x")"; done
    soobshenie+=$'\n'"<code>$(esc "$(syroe "$syroe_bloki")")</code>
Числа об обновлениях сейчас недостоверны — это не «обновлений нет»."
    ;;
  протухли)
    soobshenie="🔴 обновления apt: <b>СПИСКИ ПРОТУХЛИ</b>
рукой: $(esc "$ruka"), $(esc "$zapusk")
$svodka
Списки не обновлялись $STALE_DAYS сут. и более. Автоустановка выключена намеренно, а вот обновление списков — нет: проверь apt-daily.timer. Пока списки стоят, числа выше врут в сторону спокойствия."
    ;;
  есть)
    soobshenie="📦 обновления apt ждут установки
рукой: $(esc "$ruka"), $(esc "$zapusk")
$svodka"
    [ -n "$sec_imena" ] && soobshenie+=$'\n'"по безопасности:
<code>$(esc "$(printf '%s\n' "$sec_imena" | head -10)")</code>"
    [ -n "$imena" ] && soobshenie+=$'\n'"<code>$(esc "$(printf '%s\n' "$imena" | head -8 | cut -d' ' -f1,2)")</code>"
    soobshenie+=$'\n'"Ничего не поставлено: автоустановка выключена по решению владельца, обновление — отдельная процедура и отдельное решение."
    ;;
  заведён)
    soobshenie="🟢 уведомление об обновлениях заведено и прошло первый круг: <b>$verdikt</b>
рукой: $(esc "$ruka"), $(esc "$zapusk")
$svodka
Дальше говорю, когда обновления есть, когда списки протухли и раз в $HEARTBEAT_DAYS сут. — «жив». Ничего не ставлю никогда."
    ;;
  разрыв)
    soobshenie="⚠️ обновления apt: измерено, но был перерыв
рукой: $(esc "$ruka"), $(esc "$zapusk")
$(esc "$razryv")
$svodka"
    ;;
  жив)
    soobshenie="🟢 уведомление об обновлениях живо: молчало $molchal сут.
рукой: $(esc "$ruka"), $(esc "$zapusk")
$svodka
Это не отчёт о здоровье машины, а доказательство, что сам механизм работает."
    ;;
esac

if [ -n "$soobshenie" ]; then
  if [ ! -x "$ALERT" ]; then
    echo "🔴 нет помощника $ALERT — человеку НЕ сказано. Отметку не ставлю, повторю в следующий заход"
    kod=2
  else
    out="$("$ALERT" "$soobshenie" 2>&1)"; rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "  сказано человеку (повод: $povod)"
      # RU: Отметка ставится ТОЛЬКО после подтверждённой доставки: стояла бы до —
      # RU: недоставленная тревога заглушила бы себя на HEARTBEAT_DAYS суток.
      # EN: The stamp is set ONLY after confirmed delivery: set before, an undelivered
      # EN: alert would mute itself for HEARTBEAT_DAYS days.
      date +%s > "$STATE/last-spoke.stamp"
    else
      echo "🔴 тревога НЕ доставлена (код $rc): $out — отметку не ставлю, повторю в следующий заход"
      kod=2
    fi
  fi
else
  echo "  человеку не сказано: обновлений нет, списки свежие, до отчёта о живости ещё $(( HEARTBEAT_DAYS - molchal )) сут."
fi

# RU: Отметка о самом прогоне ставится всегда — она про то, что механизм РАБОТАЛ,
# RU: а не про то, что он сумел дозвониться.
# EN: The run stamp is always set — it says the tool RAN, not that it got through.
date +%s > "$STATE/last-run.stamp"
printf '%s\n' "$verdikt" > "$STATE/last-verdict"
exit "$kod"
