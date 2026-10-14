#!/usr/bin/env bash
# RU: Стенд КЛАССА «падение до main() у юнита с SuccessExitStatus ∋ код падения» (1.0.7, B-N-1544, Михалыч).
# RU: Живой systemd: каждый предмет исполняется ВРЕМЕННЫМ юнитом systemd-run (Type=oneshot, SuccessExitStatus="1 2", как у
# RU: наших сторожей) и судится по Result юнита, а не по коду процесса — ровно то, что видит обходчик failed.
# RU: Ждём: Python с битым импортом и с синтаксической ошибкой, bash с синтаксической ошибкой и с unbound variable → юнит
# RU: НЕ success (failed, код 70); намеренные выходы 1 (Python) и 2 (bash) → success (запускатель не делает лишних падений).
# RU: Режим ZAPUSK=bez — те же юниты БЕЗ запускателя (скрипт в ExecStart): так стоит класс до 1.0.3/1.0.5 — четыре пробы
# RU: падения обязаны покраснеть (юнит «успешен» и слеп). Это и есть различение стенда.
# RU: Нужны root и systemd-run; иначе СЛЕПОТА, код 2. Машину не меняет: юниты временные (снимаются stop + reset-failed), имена stend-klass-<pid>-*;
# RU: в журнал systemd попадают строки этих юнитов. Скрипты — во временном каталоге, убираются.
# EN: Class stand: crash before main() in a unit whose SuccessExitStatus contains the crash code. Live systemd transient
# EN: units (Type=oneshot, SuccessExitStatus="1 2"), judged by the unit Result. ZAPUSK=bez runs the same units without the
# EN: launcher — the four crash probes must turn red. Needs root and systemd-run, otherwise exit 2.
set -u
D=$(cd "$(dirname "$0")/.." && pwd)
PY=${PY_PADENIE_BIN:-$D/bin/python-padenie-70}
SH=${BASH_PADENIE_BIN:-$D/bin/bash-padenie-70}
[ "$(id -u)" = 0 ] || { echo "СЛЕПОТА: нужен root (systemd-run временных юнитов)"; exit 2; }
command -v systemd-run >/dev/null || { echo "СЛЕПОТА: нет systemd-run"; exit 2; }
[ "${ZAPUSK:-}" = bez ] || { [ -x "$PY" ] && [ -x "$SH" ]; } || { echo "СЛЕПОТА: нет исполняемых $PY / $SH"; exit 2; }
# RU: 2.0.11: каталог скриптов — в /run, не в /var/tmp: у службы обхода PrivateTmp=yes (частные /tmp и /var/tmp), а временные
# RU: юниты systemd-run живут в общем пространстве и частного каталога не видят — bash-padenie-70 отвечал кодом 71 на всё (0 из 6).
T=$(mktemp -d /run/stend-klass.XXXXXX) || exit 2; chmod 755 "$T"; trap 'rm -rf "$T"' EXIT
ok=0; bad=0; n=0
p() { ok=$((ok+1)); echo "  ok   $1"; }
f() { bad=$((bad+1)); echo "  FAIL $1 — $2"; }
printf '#!/usr/bin/env python3\nimport net_takogo_modulya_proby\n' > "$T/import.py"
printf '#!/usr/bin/env python3\ndef f(:\n' > "$T/sintaksis.py"
printf '#!/usr/bin/env python3\nimport sys\nsys.exit(1)\n' > "$T/nashel.py"
printf '#!/bin/bash\necho do\nif then\n' > "$T/sintaksis.sh"
printf '#!/bin/bash\nset -u\necho "$NET_TAKOJ_PROBY"\n' > "$T/unbound.sh"
printf '#!/bin/bash\nexit 2\n' > "$T/nashel.sh"
chmod 755 "$T"/*
# yunit <скрипт> → RES (Result юнита) и KOD (код главного процесса)
yunit() {
  local s=$1 zap=() out
  n=$((n+1))
  if [ "${ZAPUSK:-}" != bez ]; then case "$s" in *.py) zap=("$PY") ;; *.sh) zap=("$SH") ;; esac; fi
  # RU: судим по свойствам юнита (вывод systemd-run при провале другой — «Job … failed»); RemainAfterExit держит юнит до чтения.
  # RU: БЕЗ --wait: для oneshot systemd-run и так ждёт конца задания запуска; --wait при RemainAfterExit ждал бы вечно
  # RU: (успешный юнит остаётся active). timeout 60 — предел на случай зависшего предмета.
  local u="stend-klass-$$-$n.service"
  out=$(timeout 60 systemd-run --unit="$u" -p Type=oneshot -p RemainAfterExit=yes -p SuccessExitStatus="1 2" \
        "${zap[@]}" "$s" 2>&1)
  RES=$(systemctl show -p Result --value "$u" 2>/dev/null); KOD=$(systemctl show -p ExecMainStatus --value "$u" 2>/dev/null)
  systemctl stop "$u" >/dev/null 2>&1; systemctl reset-failed "$u" >/dev/null 2>&1
  [ -n "$RES" ] || RES="?(${out:0:120})"
}
padenie() { yunit "$T/$1"; [ "$RES" = exit-code ] && [ "$KOD" = 70 ] && p "$2 → юнит $RES, код $KOD (не «успех»)" || f "$2" "юнит $RES, код ${KOD:-?} — падение выглядит успехом"; }
namerenno() { yunit "$T/$1"; [ "$RES" = success ] && [ "$KOD" = "$3" ] && p "$2 → success, код $KOD (намеренный выход не сломан)" || f "$2" "юнит $RES, код ${KOD:-?}"; }
echo "режим: $([ "${ZAPUSK:-}" = bez ] && echo 'БЕЗ запускателя (основа класса)' || echo "запускатели $PY, $SH")"
padenie import.py      "Python: битый импорт до main()"
padenie sintaksis.py   "Python: синтаксическая ошибка"
padenie sintaksis.sh   "bash: синтаксическая ошибка (код bash 2 ∈ SuccessExitStatus)"
padenie unbound.sh     "bash: unbound variable (код bash 1 ∈ SuccessExitStatus)"
namerenno nashel.py    "Python: намеренный sys.exit(1)" 1
namerenno nashel.sh    "bash: намеренный exit 2" 2
echo "ИТОГ: ok=$ok FAIL=$bad"
[ $((ok+bad)) -eq 6 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 6"; exit 2; }
[ "$bad" -eq 0 ]
