#!/usr/bin/env bash
# Обёртка стенда stend-priyomnik-itog.py (B-N-1151, Искра): обходчик запускает только stend-*.sh|stend-*.mjs,
# поэтому .py зовётся отсюда. Код возврата — кода стенда (0 зелёное, 1 красное, 2 слепота/канарейка).
exec python3 -B "$(dirname "$(readlink -f "$0")")/stend-priyomnik-itog.py" "$@"
