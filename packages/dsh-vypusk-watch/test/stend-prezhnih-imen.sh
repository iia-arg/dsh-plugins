#!/bin/bash
# RU: стенд прежних имён пакета (A-N-1948 шаг 0, с 1.1.14). Зовущий — обходчик vse-stendy-boevye.
# EN: former package names bench (A-N-1948 step 0, since 1.1.14). Caller — the vse-stendy-boevye runner.
# RU: Обёртка: запускает stend-prezhnih-imen.py (python3 -B — без __pycache__), код выхода — его. Что проверяет и чего нет — в докстроке .py.
# EN: Wrapper: runs stend-prezhnih-imen.py (python3 -B — no __pycache__), exit code is its own. What it checks and what not — see the .py docstring.
set -eu
exec python3 -B "$(dirname "$0")/stend-prezhnih-imen.py"
