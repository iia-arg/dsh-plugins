#!/usr/bin/env bash
# RU: Стенд python-padenie-70: исполняет запускатель пакета (или PADENIE_BIN) на подставных скриптах во временном
# RU: каталоге. Ждём: намеренные коды 0/1/3 — как есть; падение на импорте, синтаксисе и в main — код 70 и traceback;
# RU: argv, __name__ и импорт соседнего модуля — как при обычном запуске; без скрипта или с несуществующим — код 71.
# RU: Машина не меняется, systemd не зовётся. Любая учётка.
# EN: Stand for python-padenie-70: runs the package launcher (or PADENIE_BIN) on fake scripts in a temp dir.
# EN: Expected: deliberate exits 0/1/3 pass as is; import, syntax and main crashes — exit 70 with a traceback;
# EN: argv, __name__ and a sibling import as in a normal run; no script or a missing one — exit 71.
set -u
I="${PADENIE_BIN:-$(cd "$(dirname "$0")/.." && pwd)/bin/python-padenie-70}"
[ -x "$I" ] || { echo "СЛЕПОТА: нет исполняемого $I"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ok=0; bad=0
p() { ok=$((ok+1)); echo "  ok   $1"; }
f() { bad=$((bad+1)); echo "  FAIL $1 — $2"; }
zov() { OUT=$("$I" "$@" 2>"$T/err"); KOD=$?; ERR=$(cat "$T/err"); }
printf 'import sys\nsys.exit(0)\n' > "$T/nol.py"
printf 'import sys\nsys.exit(1)\n' > "$T/nashel.py"
printf 'raise SystemExit(3)\n' > "$T/tri.py"
printf 'import nesushchestvuyushchij_modul_proby\n' > "$T/import.py"
printf 'def f(:\n' > "$T/sintaksis.py"
printf 'def main():\n    raise ValueError("proba")\nif __name__ == "__main__":\n    main()\n' > "$T/main.py"
printf 'import sys\nprint(__name__, sys.argv[0].endswith("argv.py"), sys.argv[1:])\n' > "$T/argv.py"
printf 'ZNACH = 42\n' > "$T/sosed_proby.py"
printf 'import sosed_proby\nprint(sosed_proby.ZNACH)\n' > "$T/sosed.py"
zov "$T/nol.py";    [ "$KOD" = 0 ] && p "sys.exit(0) → 0" || f "sys.exit(0) → 0" "код $KOD"
zov "$T/nashel.py"; [ "$KOD" = 1 ] && [ -z "$ERR" ] && p "sys.exit(1) → 1 как есть, stderr пуст" || f "sys.exit(1) → 1" "код $KOD | $ERR"
zov "$T/tri.py";    [ "$KOD" = 3 ] && p "SystemExit(3) → 3" || f "SystemExit(3) → 3" "код $KOD"
zov "$T/import.py"; [ "$KOD" = 70 ] && grep -q '^Traceback' <<<"$ERR" && grep -qF 'ModuleNotFoundError' <<<"$ERR" && grep -qF 'код 70' <<<"$ERR" \
  && p "падение на импорте → 70, traceback, причина" || f "падение на импорте → 70" "код $KOD | $(tail -2 <<<"$ERR")"
zov "$T/sintaksis.py"; [ "$KOD" = 70 ] && grep -qF 'SyntaxError' <<<"$ERR" && p "синтаксическая ошибка → 70" || f "синтаксис → 70" "код $KOD | $(tail -2 <<<"$ERR")"
zov "$T/main.py";   [ "$KOD" = 70 ] && grep -qF 'ValueError: proba' <<<"$ERR" && p "исключение в main → 70" || f "main → 70" "код $KOD | $(tail -2 <<<"$ERR")"
zov "$T/argv.py" a b; [ "$KOD" = 0 ] && [ "$OUT" = "__main__ True ['a', 'b']" ] && p "__name__, argv[0] и доводы — как при обычном запуске" || f "argv" "код $KOD | $OUT"
zov "$T/sosed.py";  [ "$KOD" = 0 ] && [ "$OUT" = 42 ] && p "соседний модуль импортируется (sys.path[0] = каталог скрипта)" || f "соседний модуль" "код $KOD | $OUT | $(tail -1 <<<"$ERR")"
mkdir -p "$T/bin"; printf '#!/bin/bash\nps -o comm= -p "$PPID" > "$ZVAL_FAJL"\n' > "$T/bin/agent-alert"; chmod 755 "$T/bin/agent-alert"
printf 'import subprocess, sys\nsubprocess.run(["agent-alert", "proba"])\nsys.exit(1)\n' > "$T/zval_proby.py"
OUT=$(PATH="$T/bin:$PATH" ZVAL_FAJL="$T/zval" "$I" "$T/zval_proby.py" 2>"$T/err"); KOD=$?
[ "$KOD" = 1 ] && [ "$(cat "$T/zval" 2>/dev/null)" = zval_proby.py ] && p "1.0.6: «звал=» в agent-alert — имя скрипта (comm), не запускателя" || f "звал=" "код $KOD | comm «$(cat "$T/zval" 2>/dev/null)»"
zov;                [ "$KOD" = 71 ] && grep -qF 'нужен путь скрипта' <<<"$ERR" && p "без скрипта → 71 с причиной" || f "без скрипта → 71" "код $KOD | $ERR"
zov "$T/net.py";    [ "$KOD" = 71 ] && grep -qF 'скрипта нет' <<<"$ERR" && p "несуществующий скрипт → 71 с причиной (вне SuccessExitStatus «1 2»)" || f "несуществующий → 71" "код $KOD | $ERR"
echo "ИТОГ: ok=$ok FAIL=$bad"
[ $((ok+bad)) -eq 11 ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из 11"; exit 2; }
[ "$bad" -eq 0 ]
