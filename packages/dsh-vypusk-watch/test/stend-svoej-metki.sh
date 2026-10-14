#!/bin/bash
# RU: (0.1.0-alpha.7): договор «бой = своему выпуску» — сценарии исполнителя (их число печатает сам стенд). Зовущий — обходчик vse-stendy-boevye (он берёт только stend-*.sh|*.mjs).
# EN: (0.1.0-alpha.7): the "installed copy = its own release" contract — the implementer's scenarios (the stand prints their count itself). Caller — the vse-stendy-boevye runner (it only picks stend-*.sh|*.mjs).
# RU: Обёртка: запускает stend-svoej-metki.py (python3 -B — без __pycache__), код выхода — его. Что проверяет и чего нет — в докстроке .py.
# EN: Wrapper: runs stend-svoej-metki.py (python3 -B — no __pycache__), exit code is its own. What it checks and what not — see the .py docstring.
set -eu
exec python3 -B "$(dirname "$0")/stend-svoej-metki.py"
