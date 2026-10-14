#!/bin/bash
# RU: стенд соответствий сторожа выпуска (шлюз вне корней по имени; с 0.1.0-alpha.4). Зовущий — обходчик vse-stendy-boevye.
# EN: correspondence bench for the release watcher (a gateway outside the by-name roots; since 0.1.0-alpha.4). Caller — the vse-stendy-boevye runner.
# RU: Обёртка: запускает stend-sootvetstviya.py, код выхода — его (0 все пробы, 1 есть красная). Что проверяет и чего нет — в шапке .py.
# EN: Wrapper: runs stend-sootvetstviya.py, exit code is its own (0 all probes pass, 1 a red probe). What it checks and what not — see the .py header.
set -eu
exec python3 "$(dirname "$0")/stend-sootvetstviya.py"
