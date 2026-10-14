#!/bin/bash
# RU: Только подставные источники, каналы и ремонтные команды; живые сторожа/юниты не запускаются.
# EN: Fixture sources, recording channels and repair stubs only; no production guards or units.
set -u
[ "$#" -eq 0 ] || { echo 'ОТКАЗ: доводов нет'; exit 2; }
exec python3 -B "$(dirname "$(readlink -f "$0")")/audit-fixtures.py"
