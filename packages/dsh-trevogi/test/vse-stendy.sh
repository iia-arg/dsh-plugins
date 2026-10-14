#!/usr/bin/env bash
# RU: Весь комплект, каждый код снят сразу; один запуск, повторов нет. Отказ слепоты — 2.
# EN: Full suite, capture each code immediately; one pass, no retries. Blindness exits 2.
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || exit 2
export PYTHONDONTWRITEBYTECODE=1
export AGENT_ALERT_BIN="$ROOT/bin/agent-alert" TREVOGI_TEST_ROOT="$ROOT"
final=0
bash "$ROOT/test/stend-agent-alert.sh"; rc=$?
printf 'STEND stend-agent-alert.sh %s\n' "$rc"
[ "$rc" -le "$final" ] || final="$rc"
for test in stend-nastroek-proby.py stend-watch-hvost.py stend-audit-kraev.py stend-audit-deadline.py stend-audit-yunits.py stend-audit-porchi.py stend-porchi.py; do
  python3 "$ROOT/test/$test"; rc=$?
  printf 'STEND %s %s\n' "$test" "$rc"
  [ "$rc" -le "$final" ] || final="$rc"
done
exit "$final"
