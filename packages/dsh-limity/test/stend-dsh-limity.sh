#!/bin/bash
# RU: Обёртка стенда службы лимитов dsh-limity для обходчика (он берёт только stend-*.sh); что проверяет — в докстроке .py.
# С 1.0.3 — от root (chown файлов приёмной по учёткам); иначе СЛЕПОТА код 2. В обход — строкой @root.
set -eu
exec python3 -B "$(dirname "$0")/stend-dsh-limity.py" "$@"
