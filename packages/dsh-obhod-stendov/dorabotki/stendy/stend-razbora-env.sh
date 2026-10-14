#!/usr/bin/env bash
# Обёртка стенда stend-razbora-env.py (B-H-081 Ш6, Аврора; дом и зовущий — Заря 01.10): обходчик запускает только stend-*.sh|stend-*.mjs,
# поэтому .py зовётся отсюда. Нужен root (systemd-run) — строка области обходчика «@root». Код возврата — кода стенда
# (0 разбор = systemd везде, 1 расхождение, 2 слепота).
exec python3 -B "$(dirname "$(readlink -f "$0")")/stend-razbora-env.py" "$@"
