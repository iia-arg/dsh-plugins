#!/usr/bin/env bash
# RU: Стенд bash-padenie-70: запускатель пакета (или PADENIE_BIN) на подставных скриптах во временном каталоге.
# RU: Ждём: коды 0/1/3 как есть; unbound variable → 70; синтаксис и bad substitution → 70, скрипт НЕ начинает работу;
# RU: ошибка дочернего скрипта код не меняет; argv как есть; stderr скрипта проходит насквозь; цепочка «exec bash $OBERTKA»
# RU: с BASH_PADENIE_SKRIPT ловит unbound дочернего; без скрипта и с несуществующим → 71. systemd не зовётся.
# EN: Stand for bash-padenie-70 on fake scripts in a temp dir; systemd is not called.
set -u
I="${PADENIE_BIN:-$(cd "$(dirname "$0")/.." && pwd)/bin/bash-padenie-70}"
[ -r "$I" ] || { echo "СЛЕПОТА: нет $I"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ok=0; bad=0
p() { ok=$((ok+1)); echo "  ok   $1"; }
f() { bad=$((bad+1)); echo "  FAIL $1 — $2"; }
zov() { OUT=$(bash "$I" "$@" 2>"$T/err"); KOD=$?; ERR=$(cat "$T/err"); }
printf 'exit 0\n' > "$T/nol.sh"; printf 'set -u\nexit 1\n' > "$T/nashel.sh"; printf 'exit 3\n' > "$T/tri.sh"
printf 'set -u\necho do\necho "$NET_TAKOJ_PROBY"\necho posle\n' > "$T/unbound.sh"
printf 'touch "%s/nachal"\nif then\n' "$T" > "$T/sint.sh"
printf 'touch "%s/nachal2"\nx=1\necho ${x/\n' "$T" > "$T/badsub.sh"
printf 'set -u\nbash "%s/unbound.sh"\nexit 0\n' "$T" > "$T/rebenok.sh"
printf 'echo "$1|$2"\n' > "$T/argv.sh"; printf 'echo "SVOJ_STDERR_PROBY" >&2\nexit 1\n' > "$T/stderr.sh"
printf 'set -u\nexport OBERTKA BASH_PADENIE_SKRIPT\nexec bash "$OBERTKA"\n' > "$T/roditel.sh"
zov "$T/nol.sh";    [ "$KOD" = 0 ] && p "exit 0 → 0" || f "exit 0" "код $KOD"
zov "$T/nashel.sh"; [ "$KOD" = 1 ] && p "exit 1 («нашёл беду») → 1 как есть" || f "exit 1" "код $KOD | $ERR"
zov "$T/tri.sh";    [ "$KOD" = 3 ] && p "exit 3 → 3" || f "exit 3" "код $KOD"
zov "$T/unbound.sh"; [ "$KOD" = 70 ] && grep -qF 'unbound variable' <<<"$ERR" && grep -qF 'код 70' <<<"$ERR" && [ "$OUT" = do ] \
  && p "unbound variable → 70, строка bash насквозь, работа до ошибки была" || f "unbound → 70" "код $KOD | $OUT | $(tail -1 <<<"$ERR")"
zov "$T/sint.sh";   [ "$KOD" = 70 ] && [ ! -e "$T/nachal" ] && grep -qF 'syntax error' <<<"$ERR" && p "синтаксис → 70, скрипт НЕ начал работу" || f "синтаксис → 70" "код $KOD | начал: $([ -e "$T/nachal" ] && echo да || echo нет)"
zov "$T/badsub.sh"; [ "$KOD" = 70 ] && [ ! -e "$T/nachal2" ] && p "bad substitution → 70, не начал" || f "bad substitution → 70" "код $KOD"
zov "$T/rebenok.sh"; [ "$KOD" = 0 ] && grep -qF 'unbound variable' <<<"$ERR" && p "ошибка дочернего скрипта код не меняет (граница), строка видна" || f "дочерний" "код $KOD"
zov "$T/argv.sh" a b; [ "$KOD" = 0 ] && [ "$OUT" = "a|b" ] && p "доводы как есть" || f "доводы" "код $KOD | $OUT"
zov "$T/stderr.sh"; [ "$KOD" = 1 ] && grep -qxF 'SVOJ_STDERR_PROBY' <<<"$ERR" && p "stderr скрипта проходит насквозь" || f "stderr насквозь" "код $KOD | $ERR"
OUT=$(OBERTKA="$I" BASH_PADENIE_SKRIPT="$T/unbound.sh" bash "$I" "$T/roditel.sh" 2>"$T/err"); KOD=$?; ERR=$(cat "$T/err")
[ "$KOD" = 70 ] && grep -qF "$T/unbound.sh упал" <<<"$ERR" && p "цепочка exec bash \$OBERTKA + BASH_PADENIE_SKRIPT — unbound дочернего → 70" || f "цепочка exec" "код $KOD | $(tail -1 <<<"$ERR")"
mkdir -p "$T/bin"; printf '#!/bin/bash\nps -o comm= -p "$PPID" > "$ZVAL_FAJL"\n' > "$T/bin/agent-alert"; chmod 755 "$T/bin/agent-alert"
printf '#!/bin/bash\nagent-alert proba\nexit 1\n' > "$T/zval-proby.sh"; chmod 755 "$T/zval-proby.sh"
cp "$T/zval-proby.sh" "$T/zval-neisp.sh"; chmod 644 "$T/zval-neisp.sh"
printf '#!/bin/bash\nset -u\necho do\necho "$NET_TAKOJ_PROBY"\n' > "$T/unbound-isp.sh"; chmod 755 "$T/unbound-isp.sh"
OUT=$(PATH="$T/bin:$PATH" ZVAL_FAJL="$T/zval" bash "$I" "$T/zval-proby.sh" 2>"$T/err"); KOD=$?
[ "$KOD" = 1 ] && [ "$(cat "$T/zval" 2>/dev/null)" = zval-proby.sh ] && p "1.0.6: исполняемый — «звал=» имя скрипта (comm), код как есть" || f "звал= исполняемый" "код $KOD | comm «$(cat "$T/zval" 2>/dev/null)»"
OUT=$(PATH="$T/bin:$PATH" ZVAL_FAJL="$T/zval2" bash "$I" "$T/zval-neisp.sh" 2>"$T/err"); KOD=$?
[ "$KOD" = 1 ] && [ "$(cat "$T/zval2" 2>/dev/null)" = bash ] && p "1.0.6: неисполняемый — через bash, «звал=bash» (граница названа)" || f "звал= неисполняемый" "код $KOD | comm «$(cat "$T/zval2" 2>/dev/null)»"
zov "$T/unbound-isp.sh"; [ "$KOD" = 70 ] && grep -qF 'unbound variable' <<<"$ERR" && p "1.0.6: исполняемый с unbound variable → 70 (запуск по пути ловится так же)" || f "unbound исполняемый → 70" "код $KOD | $(tail -1 <<<"$ERR")"
zov;                [ "$KOD" = 71 ] && grep -qF 'нужен путь скрипта' <<<"$ERR" && p "без скрипта → 71" || f "без скрипта → 71" "код $KOD"
zov "$T/net.sh";    [ "$KOD" = 71 ] && grep -qF 'скрипта нет' <<<"$ERR" && p "несуществующий → 71" || f "несуществующий → 71" "код $KOD"
echo "ИТОГ: ok=$ok FAIL=$bad"
[ $((ok+bad)) -eq 15 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 15"; exit 2; }
[ "$bad" -eq 0 ]
