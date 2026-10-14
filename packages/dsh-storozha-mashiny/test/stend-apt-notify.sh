#!/usr/bin/env bash
# RU: Приёмка уведомления об обновлениях. Гоняет исполняемый файл пакета
# RU: bin/apt-updates-notify.sh (или заданный CEL — например, установленный) на подставных
# RU: данных во временном каталоге. Человеку не пишет ни разу: помощник тревог
# RU: подменён фиктивным, иначе прогон приёмки означал бы десяток тревог владельцу.
# EN: Acceptance stand for the updates notifier. Runs the package file
# EN: bin/apt-updates-notify.sh (or CEL — e.g. the installed one) on fake data in a temp
# EN: directory. Never writes to a human: the alert helper is replaced by a fake,
# EN: otherwise every acceptance run would mean a dozen alerts to the owner.
#
# RU: ══ РАМКА (что стенд смотрит и о чём МОЛЧИТ) ════════════════════════════════
# RU: Две разные границы, и смешивать их нельзя:
# RU: граница ВОЗДЕЙСТВИЯ — что стенд не портит; граница ОХВАТА — о чём он не
# RU: высказывается. Зелёный цвет означает ровно то, что внутри охвата.
# EN: ══ SCOPE (what the stand looks at and what it is SILENT about) ═══════════
# EN: Two different limits, never to be mixed: the IMPACT limit — what the stand does not
# EN: damage; the COVERAGE limit — what it says nothing about. Green means exactly what is
# EN: inside the coverage.
#
# RU: ВОЗДЕЙСТВИЕ: рабочее не трогается вовсе. Подменяются APTUN_STATE, APTUN_ALERT,
# RU:   APTUN_CONF, CHECK_CMD, LIST_CMD; человеку не пишется ни разу.
# EN: IMPACT: nothing real is touched. APTUN_STATE, APTUN_ALERT, APTUN_CONF, CHECK_CMD,
# EN:   LIST_CMD are replaced; nothing is ever written to a human.
#
# RU: 🔴 ОХВАТ — apt ПОДСТАВНОЙ. Стенд проверяет, верно ли предмет РЕАГИРУЕТ на
# RU:   заданные формы вывода, и НЕ проверяет, что настоящий apt отвечает в
# RU:   узнаваемой форме. Замер: /usr/lib/update-notifier/apt-check даёт
# RU:   «0;0» — узнаваемо. Сменит формат при обновлении — стенд останется зелёным.
# RU:   Не тихо: предмет в бою уйдёт в СЛЕПОТУ и скажет, но узнаем мы это тревогой,
# RU:   а не приёмкой.
# EN: 🔴 COVERAGE — apt is FAKE. The stand checks the subject REACTS correctly to given
# EN:   output shapes, and does NOT check that the real apt answers in a recognised shape.
# EN:   Measured: /usr/lib/update-notifier/apt-check gives "0;0" — recognised. If an
# EN:   upgrade changes the format the stand stays green. Not silently: in production the
# EN:   subject goes to BLINDNESS and says so — but we learn it from an alert, not here.
#
# RU: 🔴 ОХВАТ — отправитель ПОДСТАВНОЙ. Что настоящий agent-alert доставляет,
# RU:   этим стендом не доказывается. Доказывается отдельно, сквозным прогоном при
# RU:   заведении (в журнале записи «сказано человеку»).
# EN: 🔴 COVERAGE — the sender is FAKE. That the real agent-alert delivers is not proven
# EN:   here. It is proven separately by an end-to-end run at setup ("сказано человеку"
# EN:   lines in the journal).
#
# RU: НЕ ПРОВЕРЯЕТ вовсе:
# RU:   · что таймер взведён и зовёт предмет — это живость записи в реестре машины;
# RU:   · уязвимости: предмет знает только то, что лежит в списках apt;
# RU:   · обновления ВНЕ apt (плагины, платформа) — это другой инструмент;
# RU:   · права и владельца самого предмета.
# EN: DOES NOT CHECK at all:
# EN:   · that the timer is armed and calls the subject — that is liveness in the machine registry;
# EN:   · vulnerabilities: the subject knows only what is in the apt lists;
# EN:   · updates OUTSIDE apt (plugins, platform) — another tool;
# EN:   · permissions and owner of the subject itself.
set -uo pipefail
export LC_ALL=C.UTF-8
HERE="$(cd "$(dirname "$0")" && pwd)"
CEL="${CEL:-$HERE/../bin/apt-updates-notify.sh}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ok=0; bad=0
skip=0   # RU: непроверяемое ЭТОЙ рукой — не успех и не отказ · EN: not checkable by THIS account — neither pass nor fail
proverka() { # имя ждём_код что_ищем_в_сообщении
  local imya="$1" zhdem="$2" iskat="${3-}"
  if [ "$RC" != "$zhdem" ]; then echo "FAIL $imya: код $RC, ждали $zhdem"; bad=$((bad+1)); return; fi
  if [ -n "$iskat" ] && ! grep -qF "$iskat" "$TMP/msg" 2>/dev/null; then
    echo "FAIL $imya: в сообщении нет «$iskat»"; sed -n '1,4p' "$TMP/msg" 2>/dev/null; bad=$((bad+1)); return; fi
  echo "ok   $imya"; ok=$((ok+1))
}
# RU: Фиктивный помощник тревог: пишет сообщение в файл, код возврата задаётся файлом.
# EN: Fake alert helper: writes the message to a file; its exit code is set by a file.
cat > "$TMP/alert" <<'A'
#!/usr/bin/env bash
printf '%s' "$*" > "$ALERT_MSG_FILE"
exit "$(cat "$ALERT_RC_FILE" 2>/dev/null || echo 0)"
A
chmod +x "$TMP/alert"; echo 0 > "$TMP/alert-rc"
export ALERT_MSG_FILE="$TMP/msg" ALERT_RC_FILE="$TMP/alert-rc"

mk_check() { printf '#!/bin/sh\nprintf %%s "%s" >&2\n' "$1" > "$TMP/check"; chmod +x "$TMP/check"; }
mk_list()  { printf '#!/bin/sh\ncat <<%s\n%s\n%s\nexit %s\n' EOF "$1" EOF "${2:-0}" > "$TMP/list"; chmod +x "$TMP/list"; }
SVEZHIJ="$TMP/stamp"; touch "$SVEZHIJ"
STARYJ="$TMP/stamp-old"; touch -d '10 days ago' "$STARYJ"

progon() { # состояние_каталог check_вывод list_вывод stamp [доп. env]
  rm -f "$TMP/msg"
  RC=0
  OUT="$(APTUN_CONF=/nonexistent APTUN_STATE="$1" APTUN_ALERT="$TMP/alert" \
        CHECK_CMD="$TMP/check" LIST_CMD="$TMP/list" STAMP_FILE="$2" \
        "${@:3}" bash "$CEL" 2>&1)" || RC=$?
}
SP="$TMP/s1"; mkdir -p "$SP"

echo "── 1. первый запуск (состояние пусто)"
mk_check "0;0"; mk_list "Listing..."
progon "$SP" "$SVEZHIJ"
proverka "первый запуск говорит «заведено»" 0 "заведено и прошло первый круг"

echo "── 2. обновлений нет, свежие списки, молчал недавно → тишина"
progon "$SP" "$SVEZHIJ"
proverka "тишина, когда нечего сказать" 0
[ -f "$TMP/msg" ] && { echo "FAIL тишина: сообщение всё-таки послано"; bad=$((bad+1)); } || { echo "ok   тишина: сообщения нет"; ok=$((ok+1)); }

echo "── 3. есть немедленные обновления"
mk_check "3;1"; mk_list "Listing...
foo/noble-updates 2.0 amd64 [upgradable from: 1.0]
bar/noble-updates 3.0 amd64 [upgradable from: 2.0]"
progon "$SP" "$SVEZHIJ"
proverka "говорит про 3 немедленных" 0 "применится немедленно: <b>3</b>"
grep -qF "Ничего не поставлено" "$TMP/msg" && { echo "ok   сказано, что ничего не поставлено"; ok=$((ok+1)); } || { echo "FAIL нет слов про «ничего не поставлено»"; bad=$((bad+1)); }

echo "── 4. 🔴 security среди ОТЛОЖЕННЫХ: apt-check 0, а в ветке безопасности пакет есть"
mk_check "0;0"; mk_list "Listing...
zlo/noble-security 9.9 amd64 [upgradable from: 9.8]"
progon "$SP" "$SVEZHIJ"
proverka "security не теряется при apt-check 0" 0 "из ветки безопасности: 1"
grep -qF "zlo" "$TMP/msg" && { echo "ok   имя security-пакета названо"; ok=$((ok+1)); } || { echo "FAIL имени security-пакета нет"; bad=$((bad+1)); }

echo "── 5. отложенные раскатом сами по себе не будят"
mk_check "0;0"; mk_list "Listing...
snapd/noble-updates 2.76 amd64 [upgradable from: 2.75]"
progon "$SP" "$SVEZHIJ"
proverka "отложенный не будит" 0
[ -f "$TMP/msg" ] && { echo "FAIL отложенный разбудил человека"; bad=$((bad+1)); } || { echo "ok   отложенный не разбудил"; ok=$((ok+1)); }

echo "── 6. списки протухли → код 1"
mk_check "0;0"; mk_list "Listing..."
progon "$SP" "$STARYJ"
proverka "протухшие списки = код 1" 1 "СПИСКИ ПРОТУХЛИ"

echo "── 7. слепота: apt-check выдал мусор"
mk_check "нечто невнятное"; mk_list "Listing..."
progon "$SP" "$SVEZHIJ"
proverka "мусор от apt-check = слепота" 2 "СЛЕПОТА"

echo "── 8. слепота: apt list не отвечает"
mk_check "0;0"; mk_list "ошибка блокировки" 100
progon "$SP" "$SVEZHIJ"
proverka "отказ apt list = слепота" 2 "СЛЕПОТА"

echo "── 9. слепота сильнее протухших списков"
mk_check "мусор"; mk_list "Listing..."
progon "$SP" "$STARYJ"
proverka "слепота перекрывает протухание" 2 "СЛЕПОТА"

echo "── 10. тревога не доставлена → код 2 и отметка НЕ ставится"
mk_check "5;2"; mk_list "Listing...
foo/noble-security 2.0 amd64 [upgradable from: 1.0]"
echo 1 > "$TMP/alert-rc"
SP2="$TMP/s2"; mkdir -p "$SP2"; date +%s > "$SP2/last-run.stamp"; echo 0 > "$SP2/last-spoke.stamp"
before=$(cat "$SP2/last-spoke.stamp")
progon "$SP2" "$SVEZHIJ"
proverka "недоставка = код 2" 2
after=$(cat "$SP2/last-spoke.stamp")
[ "$before" = "$after" ] && { echo "ok   отметка о разговоре не поставлена"; ok=$((ok+1)); } || { echo "FAIL отметка поставлена при недоставке"; bad=$((bad+1)); }
echo 0 > "$TMP/alert-rc"

echo "── 11. помощника тревог нет вовсе → код 2"
mk_check "5;2"; mk_list "Listing...
foo/noble-security 2.0 amd64 [upgradable from: 1.0]"
RC=0
OUT="$(APTUN_CONF=/nonexistent APTUN_STATE="$TMP/s3" APTUN_ALERT="$TMP/net-takogo" \
      CHECK_CMD="$TMP/check" LIST_CMD="$TMP/list" STAMP_FILE="$SVEZHIJ" bash "$CEL" 2>&1)" || RC=$?
[ "$RC" = 2 ] && { echo "ok   нет помощника = код 2"; ok=$((ok+1)); } || { echo "FAIL нет помощника: код $RC"; bad=$((bad+1)); }

echo "── 12. «жив» после долгого молчания"
mk_check "0;0"; mk_list "Listing..."
SP4="$TMP/s4"; mkdir -p "$SP4"; date +%s > "$SP4/last-run.stamp"
echo $(( $(date +%s) - 9*86400 )) > "$SP4/last-spoke.stamp"
progon "$SP4" "$SVEZHIJ"
proverka "heartbeat говорит «жив»" 0 "живо: молчало"

echo "── 13. разрыв замечен"
mk_check "0;0"; mk_list "Listing..."
SP5="$TMP/s5"; mkdir -p "$SP5"; echo $(( $(date +%s) - 5*86400 )) > "$SP5/last-run.stamp"; date +%s > "$SP5/last-spoke.stamp"
progon "$SP5" "$SVEZHIJ"
proverka "разрыв назван" 0 "перерыв: прошлый прогон был 5 сут"

echo "── 14. сырьё печатается рядом с вердиктом (в журнал)"
mk_check "2;1"; mk_list "Listing...
foo/noble-security 2.0 amd64 [upgradable from: 1.0]"
progon "$SP" "$SVEZHIJ"
if printf '%s' "$OUT" | grep -q '^── ожидают:' && printf '%s' "$OUT" | grep -q 'применится немедленно: 2'; then
  echo "ok   вердикт и сырьё рядом"; ok=$((ok+1))
else echo "FAIL сырья рядом с вердиктом нет"; printf '%s\n' "$OUT" | head -8; bad=$((bad+1)); fi

echo "── 15. состояние недоступно на запись → СЛЕПОТА, а не тихий успех"
# RU: Каталог существует, но писать в него нельзя — ровно то, что было на
# RU: живом прогоне: mkdir от агента в /var/lib отказал, и отказ проглотился молча.
# EN: The directory exists but is not writable — exactly what happened on a live run:
# EN: the agent's mkdir in /var/lib was refused and the refusal was swallowed silently.
mk_check "0;0"; mk_list "Listing..."
SP6="$TMP/s6-tolko-chtenie"; mkdir -p "$SP6"; chmod 500 "$SP6"
if [ "$(id -u)" = 0 ]; then
  # RU: Непроверяемо ПО УСТРОЙСТВУ: root пишет в каталог 500, отказа не воспроизвести.
  # RU: Замерено: под root предмет честно давал 0, а стенд ждал 2 и печатал
  # RU: FAIL — ложно-красное на исправной машине, то есть звал чинить работающее.
  # EN: Uncheckable BY DESIGN: root writes into a mode-500 directory, the refusal cannot be
  # EN: reproduced. Measured: as root the subject honestly gave 0 while the stand expected 2
  # EN: and printed FAIL — a false red on a healthy machine, calling to fix what works.
  echo "ПРОПУСК недоступное состояние = слепота: рукой root отказ не воспроизвести"
  skip=$((skip+1))
else
  progon "$SP6" "$SVEZHIJ"
  proverka "недоступное состояние = слепота" 2 "состояние недоступно на запись"
fi
chmod 700 "$SP6"

echo "── 16. состояние доступно → про него не сказано ни слова"
progon "$SP6" "$SVEZHIJ"
if [ "$RC" = 0 ]; then echo "ok   исправное состояние молчит"; ok=$((ok+1));
else echo "FAIL исправное состояние даёт код $RC"; bad=$((bad+1)); fi

echo
echo "ИТОГ: ok=$ok fail=$bad пропущено=$skip"

# RU: Канарейка: ТОЧНОЕ число проверок, не «не меньше». Порог слеп к убыли ровно
# RU: того размера, который умещается в запас, и выглядит строже, чем работает:
# RU: «не меньше» звучит как требование, а действует как разрешение.
# RU: Замерено приёмом «сверься с соседом того же вида»: канарейка была
# RU: у 3 стендов из 13. Вырезанный раздел проходил кодом 0 — выпотрошенный стенд
# RU: отчитывался успехом.
# EN: Canary: the EXACT number of checks, not "at least". A threshold is blind to a loss
# EN: that fits within the margin and looks stricter than it works: "at least" sounds like
# EN: a requirement and acts like a permission. Measured by comparing with sibling stands:
# EN: 3 of 13 had a canary. A cut-out section passed with exit 0 — a gutted stand reported success.
ZHDYOM_PROVEROK=21
if [ $((ok+bad+skip)) -ne $ZHDYOM_PROVEROK ]; then
  echo "СЛЕПОТА: проверок $((ok+bad+skip)), а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
[ "$bad" -eq 0 ] || exit 1
# RU: Пропуск — не успех: код 2 означает «часть свойств этой рукой не измерена».
# EN: A skip is not a pass: exit 2 means "some properties were not measured by this account".
[ "$skip" -eq 0 ] || exit 2
exit 0
