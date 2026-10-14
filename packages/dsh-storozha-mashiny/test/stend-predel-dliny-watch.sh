#!/bin/bash
# RU: Стенд predel-dliny-watch: три пробы — исправное молчит · порча краснеет, называя предмет · порча снята — снова зелёное.
# RU: journalctl, logger и канал тревоги — подставные первыми в PATH; состояние (PREDEL_STATE_DIR) и ящик агента
# RU: (PREDEL_YASHCHIKI) — во временном каталоге. Живой журнал и живой канал не получают ни строки. Проверяется bin/ пакета.
# RU: Чего НЕ проверяет: что живой шлюз пишет отказ именно этими словами (образец сверяется с журналом только в бою);
# RU: права install -o/-g на чужой ящик (стенд пишет в свой каталог своей учёткой).
# EN: Stand for predel-dliny-watch: three probes — healthy is quiet · fault turns red naming the subject · fault removed — green again.
# EN: journalctl, logger and the alert channel are stubs first in PATH; the state (PREDEL_STATE_DIR) and the agent inbox
# EN: (PREDEL_YASHCHIKI) live in a temporary directory. The live journal and channel get no line at all. Tests bin/ of this package.
# EN: Does NOT check: that the live gateway words a refusal exactly like this (the pattern meets the real journal only in
# EN: production); install -o/-g into someone else's inbox (the stand writes into its own directory as its own user).
# RU: Коды: 0 — все пробы прошли · 1 — расхождение · 2 — стенд слеп.
# EN: Exit codes: 0 — all probes passed · 1 — mismatch · 2 — the stand is blind.
set -u
[ $# -eq 0 ] || { echo "ОТКАЗ: доводов не принимаю ($*)" >&2; exit 2; }
M="${MODUL:-$(cd "$(dirname "$0")/.." && pwd)/bin/predel-dliny-watch}"
[ -r "$M" ] || { echo "СЛЕПОТА: нет предмета $M"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/stub" "$T/in" "$T/log" "$T/state" "$T/inbox"
cat > "$T/stub/zapis" <<'EOF'
#!/bin/bash
n=$(basename "$0")
# RU: 1.0.2: отказ канала тревоги — файл $STUB_DIR/alert.otkaz (вызов не пишется, код 1).
[ "$n" = agent-alert ] && [ -f "$STUB_DIR/alert.otkaz" ] && exit 1
printf '%s|%s\n' "$n" "$*" >> "$STUB_LOG/$n.log"; exit 0
EOF
cat > "$T/stub/journalctl" <<'EOF'
#!/bin/bash
[ -f "$STUB_DIR/journal.txt" ] && cat "$STUB_DIR/journal.txt"; exit 0
EOF
chmod 755 "$T/stub/"*
for n in logger agent-alert systemctl; do ln -s zapis "$T/stub/$n"; done
ok=0; bad=0
progon() {  # -> KOD, VYVOD, TREVOG, PISEM (новые за прогон)
  local t0=$(cat "$T/log/agent-alert.log" 2>/dev/null | grep -c '^agent-alert|') p0=$(ls "$T/inbox" | grep -c .)
  VYVOD=$(PATH="$T/stub:$PATH" STUB_LOG="$T/log" STUB_DIR="$T/in" PREDEL_STATE_DIR="$T/state" \
          PREDEL_YASHCHIKI="stend-agent=$T/inbox" ALERT="$T/stub/agent-alert" UNIT=stend-shlyuz.service KOMU=stend-agent \
          LC_ALL=C.UTF-8 bash "$M" 2>&1); KOD=$?
  TREVOG=$(( $(cat "$T/log/agent-alert.log" 2>/dev/null | grep -c '^agent-alert|') - t0 )); PISEM=$(( $(ls "$T/inbox" | grep -c .) - p0 ))
}
proverka() { if eval "$2"; then ok=$((ok+1)); echo "  ok   $1"; else bad=$((bad+1)); echo "  FAIL $1 (код $KOD, тревог $TREVOG, писем $PISEM): $VYVOD"; fi; }
OK_STROKA='Oct 04 08:00:01 host node[1]: bridge connected'

# RU: 1. Исправное: в журнале шлюза строки без отказа → код 0, тревог 0, писем 0, logger «чисто».
# EN: 1. Healthy: gateway journal lines without a refusal → exit 0, no alert, no letter, logger "clean".
printf '%s\n%s\n' "$OK_STROKA" "$OK_STROKA" > "$T/in/journal.txt"
progon; proverka "исправное молчит · healthy is quiet" \
  '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 0 ] && [ "$PISEM" -eq 0 ] && tail -1 "$T/log/logger.log" | grep -qF "чисто"'

# RU: 2. Порча: в журнал добавлен отказ «Prompt is too long» → одна тревога с именем юнита, одно письмо агенту, маркер.
# EN: 2. Fault: a "Prompt is too long" refusal is added → one alert naming the unit, one letter to the agent, a marker.
do_=$(cksum < "$T/in/journal.txt")
printf '%s\nOct 04 08:10:05 host node[1]: Prompt is too long\n' "$OK_STROKA" > "$T/in/journal.txt"
posle=$(cksum < "$T/in/journal.txt")
echo "  порча внесена · fault injected: cksum журнала $do_ → $posle"
[ "$do_" != "$posle" ] || { echo "СЛЕПОТА: порча не внесена"; exit 2; }
progon; proverka "порча краснеет и называет юнит · fault is red and names the unit" \
  '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 1 ] && [ "$PISEM" -eq 1 ] && grep -qF "stend-shlyuz.service" "$T/inbox"/predel-*.txt && [ -s "$T/state/last-seen-stend-agent" ]'

# RU: 3. Порча снята: журнал снова без отказа → код 0, ни тревоги, ни письма, logger «чисто».
# EN: 3. Fault removed: the journal has no refusal again → exit 0, no alert, no letter, logger "clean".
printf '%s\n' "$OK_STROKA" > "$T/in/journal.txt"
progon; proverka "порча снята — снова зелёное · fault removed — green again" \
  '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 0 ] && [ "$PISEM" -eq 0 ] && tail -1 "$T/log/logger.log" | grep -qF "чисто"'

# RU: 4. Не настроено: без UNIT/KOMU — код 2 с причиной, ни тревоги, ни письма.
# EN: 4. Not configured: without UNIT/KOMU — exit 2 with a reason, no alert, no letter.
t0=$(cat "$T/log/agent-alert.log" | grep -c '^agent-alert|')
VYVOD=$(PATH="$T/stub:$PATH" STUB_LOG="$T/log" STUB_DIR="$T/in" PREDEL_STATE_DIR="$T/state" ALERT="$T/stub/agent-alert" bash "$M" 2>&1); KOD=$?
TREVOG=$(( $(cat "$T/log/agent-alert.log" | grep -c '^agent-alert|') - t0 )); PISEM=0
proverka "без UNIT/KOMU — отказ 2 · without UNIT/KOMU — refusal 2" '[ "$KOD" -eq 2 ] && [ "$TREVOG" -eq 0 ] && printf "%s" "$VYVOD" | grep -qF "не настроено"'

# RU: 5–6. 1.0.1: агент без ящика — одна тревога владельцу, метка, «НЕ НАСТРОЕНО»; повтора нет.
bez() {
  local t0=$(cat "$T/log/agent-alert.log" | grep -c '^agent-alert|')
  VYVOD=$(PATH="$T/stub:$PATH" STUB_LOG="$T/log" STUB_DIR="$T/in" PREDEL_STATE_DIR="$T/state" \
          PREDEL_YASHCHIKI="stend-agent=$T/inbox" ALERT="$T/stub/agent-alert" UNIT=stend-shlyuz.service KOMU=bez-yashchika \
          LC_ALL=C.UTF-8 bash "$M" 2>&1); KOD=$?
  TREVOG=$(( $(cat "$T/log/agent-alert.log" | grep -c '^agent-alert|') - t0 )); PISEM=0
}
printf '%s\nOct 04 08:20:07 host node[1]: Prompt is too long\n' "$OK_STROKA" > "$T/in/journal.txt"
bez; proverka "1.0.1: агент без ящика — тревога владельцу 1, «НЕ НАСТРОЕНО», метка записана, код 2" \
  '[ "$KOD" -eq 2 ] && [ "$TREVOG" -eq 1 ] && printf "%s" "$VYVOD" | grep -qF "НЕ НАСТРОЕНО: ящика агента bez-yashchika" && [ -s "$T/state/last-seen-bez-yashchika" ]'
bez; proverka "1.0.1: тот же отказ снова — повтора владельцу НЕТ, код 0" '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 0 ]'

# RU: 7–8. 1.0.2: тревога владельцу не ушла — маркер не пишется, код 3; канал вернулся — повтор владельцу.
printf '%s\nOct 04 08:30:09 host node[1]: Prompt is too long\n' "$OK_STROKA" > "$T/in/journal.txt"
m0=$(cat "$T/state/last-seen-stend-agent"); touch "$T/in/alert.otkaz"
progon; proverka "1.0.2: канал владельца отказал — код 3, маркер прежний" \
  '[ "$KOD" -eq 3 ] && [ "$TREVOG" -eq 0 ] && [ "$(cat "$T/state/last-seen-stend-agent")" = "$m0" ] && printf "%s" "$VYVOD" | grep -qF "тревога владельцу не ушла"'
rm -f "$T/in/alert.otkaz"
progon; proverka "1.0.2: канал вернулся — тревога владельцу ПОВТОРЕНА, маркер записан" \
  '[ "$KOD" -eq 0 ] && [ "$TREVOG" -eq 1 ] && grep -qF "08:30:09" "$T/state/last-seen-stend-agent"'

echo "ИТОГ: ok=$ok FAIL=$bad"
[ $((ok+bad)) -eq 8 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 8"; exit 2; }
[ "$bad" -eq 0 ]
