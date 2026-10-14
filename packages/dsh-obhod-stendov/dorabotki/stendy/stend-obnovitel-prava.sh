#!/usr/bin/env bash
# Обёртка стенда stend-obnovitel-prava.py (B-N-1621, Искра): обходчик запускает только stend-*.sh|stend-*.mjs.
# Код возврата — кода стенда (0 зелёное, 1 красное, 2 слепота/канарейка). Учётка ROOT — строка обхода «@root».
exec python3 -B "$(dirname "$(readlink -f "$0")")/stend-obnovitel-prava.py" "$@"
