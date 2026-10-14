#!/bin/bash
# RU: Обёртка стенда копий выпуска: запускает probe.py (python3 -B — без __pycache__ рядом со стендом), код выхода — его.
#     Зовущий — обходчик стендов (берёт только stend-*.sh|*.mjs, поэтому .py идёт через обёртку).
# EN: Wrapper for the release-copies bench: runs probe.py (python3 -B — no __pycache__ next to the bench), exit code is its own.
#     Caller — the bench runner (it only picks stend-*.sh|*.mjs, hence the .py goes through a wrapper).
# RU: Что проверяет и чего нет — в шапке probe.py. Без VYPUSK_TEST_WATCH/VYPUSK_TEST_REFERENCE предмет и эталон —
#     установленный /usr/local/sbin/vypusk-okno-watch.sh.
# EN: What it checks and what not — see the probe.py header. Without VYPUSK_TEST_WATCH/VYPUSK_TEST_REFERENCE both subject and
#     reference are the installed /usr/local/sbin/vypusk-okno-watch.sh.
set -eu
exec python3 -B "$(dirname "$0")/probe.py"
