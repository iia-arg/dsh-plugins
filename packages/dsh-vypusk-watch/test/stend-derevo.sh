#!/bin/bash
# RU: Обёртка стенда сверки по записям derevo реестра (VYPUSK_REESTR) для обходчика (он берёт только stend-*.sh и *.mjs);
#     проверяемый сторож — VYPUSK_TEST_WATCH. Что проверяет и чего нет — в докстроке .py.
set -eu
exec python3 -B "$(dirname "$0")/stend-derevo.py"
