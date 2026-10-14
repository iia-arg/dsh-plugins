#!/usr/bin/env bash
# RU: Стенд сторожа машины agent-watchdog.sh: три пробы — исправное молчит, порча краснеет
# RU: с именем предмета, порча снята — снова зелено. Плюс проба «без настройки».
# EN: Stand for the machine watchdog agent-watchdog.sh: three probes — healthy is silent, a fault
# EN: turns red naming the subject, fault removed — green again. Plus a "no settings" probe.
#
# RU: ВОЗДЕЙСТВИЕ: ни одна строка не уходит в настоящий журнал и в настоящий канал тревоги.
# RU: logger, systemctl, journalctl, curl, df, du подменены заглушками ПЕРВЫМИ в PATH;
# RU: помощник тревоги — заглушкой через WATCHDOG_ALERT; состояние — во временном каталоге.
# RU: Перед пробами стенд проверяет, что каждое имя разрешается в заглушку; нет — ОТКАЗ (код 2).
# EN: IMPACT: not a single line reaches the real journal or the real alert channel.
# EN: logger, systemctl, journalctl, curl, df, du are stubs placed FIRST in PATH; the alert
# EN: helper is a stub via WATCHDOG_ALERT; state lives in a temp directory. Before probing the
# EN: stand checks every name resolves to a stub; otherwise it REFUSES (exit 2).
#
# RU: ОХВАТ: только ветка «служба не active» и ветка «нет настройки». Свежесть «юнит:часы»,
# RU: память, диск, окно тишины и отказ доставки здесь НЕ проверяются (их проверял
# RU: сравнительный стенд при переносе); настоящая доставка тревоги — тоже нет.
# EN: COVERAGE: only the "unit not active" branch and the "no settings" branch. Freshness
# EN: "unit:hours", memory, disk, quiet window and failed delivery are NOT checked here (the
# EN: comparison stand covered them during porting); real alert delivery is not checked either.
#
# RU: Коды: 0 — сошлось; 1 — расхождение; 2 — стенд не смог проверить.
# EN: Exit: 0 — all matched; 1 — mismatch; 2 — the stand could not check.
set -uo pipefail
export LC_ALL=C.UTF-8
HERE="$(cd "$(dirname "$0")" && pwd)"
CEL="${CEL:-$HERE/../bin/agent-watchdog.sh}"
[ -r "$CEL" ] || { echo "СЛЕПОТА: нет $CEL"; exit 2; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
S="$T/stub"; mkdir -p "$S"
ok=0; bad=0
p() { echo "ok   $1"; ok=$((ok+1)); }
f() { echo "FAIL $1"; bad=$((bad+1)); }

# RU: Заглушки пишут каждый вызов в $T/calls. Сломанная служба задаётся файлом $T/failed.
# EN: Stubs log every call to $T/calls. The broken unit is set by the file $T/failed.
for c in logger journalctl du; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$c" "$T" > "$S/$c"
done
cat > "$S/systemctl" <<EOF
#!/bin/sh
echo "systemctl \$*" >> "$T/calls"
if [ "\$1" = is-active ] && grep -qxF "\$2" "$T/failed" 2>/dev/null; then echo failed; exit 3; fi
echo active
EOF
printf '#!/bin/sh\necho "curl $*" >> "%s/calls"\necho "{\\"status\\":\\"ok\\"}"\n' "$T" > "$S/curl"
printf '#!/bin/sh\necho "df $*" >> "%s/calls"\nprintf "Avail Size\\n50 100\\n"\n' "$T" > "$S/df"
cat > "$S/alert" <<EOF
#!/bin/sh
printf '%s\n' "\$1" >> "$T/alerts"
EOF
chmod +x "$S"/*
export PATH="$S:$PATH"
for c in logger systemctl journalctl curl df du; do
  [ "$(command -v "$c")" = "$S/$c" ] || { echo "ОТКАЗ: $c разрешается в $(command -v "$c"), а не в заглушку — пробы не начаты"; exit 2; }
done

printf 'SERVICES="proba-a.service proba-b.service"\nMEMORY_HEALTH_URL=""\nDISK_PATHS="/"\nDISK_MIN_FREE_PCT=10\nCOOLDOWN_MIN=30\n' > "$T/conf"
progon() { # RU: прогон с подставной настройкой · EN: run with the fake settings
  : > "$T/alerts"
  OUT="$(WATCHDOG_CONF="$T/conf" WATCHDOG_STATE="$T/state" WATCHDOG_ALERT="$S/alert" bash "$CEL" 2>&1)"; RC=$?
}

echo "── 1. исправное молчит · healthy is silent"
: > "$T/failed"; progon
[ "$RC" = 0 ] && grep -qF 'ok: всё проверенное в порядке' <<<"$OUT" && [ ! -s "$T/alerts" ] \
  && p "исправное: код 0, «ok», тревог 0" || f "исправное: код $RC, тревог $(wc -l < "$T/alerts") | $OUT"

echo "── 2. порча: proba-b.service не active · fault: proba-b.service not active"
echo proba-b.service > "$T/failed"
# RU: Порча печатает факт своего внесения — спросом у заглушки напрямую, мимо сторожа.
# EN: The fault prints proof it was injected — by asking the stub directly, bypassing the watchdog.
echo "  порча внесена · fault injected: systemctl is-active proba-b.service → $(systemctl is-active proba-b.service)"
progon
[ "$RC" = 0 ] && grep -qF 'problems: 1' <<<"$OUT" && grep -qF 'proba-b.service' "$T/alerts" && ! grep -qF 'proba-a.service' "$T/alerts" \
  && p "порча: «problems: 1», тревога называет proba-b.service и только её" || f "порча: код $RC | $OUT | $(cat "$T/alerts")"

echo "── 3. порча снята — снова зелено · fault removed — green again"
: > "$T/failed"
echo "  порча снята · fault removed: systemctl is-active proba-b.service → $(systemctl is-active proba-b.service)"
progon
[ "$RC" = 0 ] && grep -qF 'ok: всё проверенное в порядке' <<<"$OUT" && [ ! -s "$T/alerts" ] \
  && p "после снятия: код 0, «ok», тревог 0" || f "после снятия: код $RC | $OUT"

echo "── 4. без настройки: говорит, чего не хватает · no settings: says what is missing"
: > "$T/alerts"
do_sc=$(grep -c '^systemctl ' "$T/calls")
OUT="$(WATCHDOG_CONF="$T/net-takogo.conf" WATCHDOG_STATE="$T/state2" WATCHDOG_ALERT="$S/alert" bash "$CEL" 2>&1)"; RC=$?
po_sc=$(grep -c '^systemctl ' "$T/calls")
# RU: r2 (условие ворот): без настройки — провал кодом 2 и причина, не немой успех.
# EN: r2 (gate condition): no settings — failure exit 2 with the reason, not a silent success.
[ "$RC" = 2 ] && grep -qF 'настройки нет' <<<"$OUT" && grep -qF 'проверка неполна: настройки нет' <<<"$OUT" && [ "$do_sc" = "$po_sc" ] \
  && p "без настройки: код 2, «настройки нет» и «проверка неполна», службы не опрашивались" || f "без настройки: код $RC, systemctl $do_sc→$po_sc | $OUT"

echo "── 5. 1.0.1: помощника тревоги нет — код 3, не 0"
echo proba-b.service > "$T/failed"; : > "$T/alerts"
echo "  порча внесена: помощник $T/net-pomoshchnika — $( [ -e "$T/net-pomoshchnika" ] && echo есть || echo нет)"
OUT="$(WATCHDOG_CONF="$T/conf" WATCHDOG_STATE="$T/state5" WATCHDOG_ALERT="$T/net-pomoshchnika" bash "$CEL" 2>&1)"; RC=$?
[ "$RC" = 3 ] && grep -qF 'НЕ отправлена' <<<"$OUT" && grep -qF 'тревог НЕ доставлено: 1' <<<"$OUT" \
  && p "нет помощника: код 3, «НЕ отправлена», «не доставлено: 1»" || f "нет помощника: код $RC | $OUT"

echo "── 6. 1.0.1: доставка отказала — код 3"
printf '#!/bin/sh\necho "отказ доставки"; exit 1\n' > "$S/alert-otkaz"; chmod +x "$S/alert-otkaz"
OUT="$(WATCHDOG_CONF="$T/conf" WATCHDOG_STATE="$T/state6" WATCHDOG_ALERT="$S/alert-otkaz" bash "$CEL" 2>&1)"; RC=$?
[ "$RC" = 3 ] && grep -qF 'НЕ доставлена (код 1)' <<<"$OUT" && grep -qF 'тревог НЕ доставлено: 1' <<<"$OUT" \
  && p "отказ доставки: код 3, «НЕ доставлена (код 1)»" || f "отказ доставки: код $RC | $OUT"
: > "$T/failed"

grep -q '^logger ' "$T/calls" 2>/dev/null && echo "  (logger звали: $(grep -c '^logger ' "$T/calls") раз — в заглушку)"
echo; echo "ИТОГ: ok=$ok fail=$bad"
# RU: Канарейка: точное число проверок. · EN: Canary: the exact number of checks.
[ $((ok+bad)) -eq 6 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 6"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
