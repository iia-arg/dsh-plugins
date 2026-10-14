#!/bin/bash
# RU: Обёртка стенда починок для обходчика (он берёт только stend-*.sh и *.mjs); проверяемый сторож — VYPUSK_TEST_WATCH.
# EN: Fixes-stand wrapper for the stand runner (it only picks stend-*.sh and *.mjs); the watcher under test is VYPUSK_TEST_WATCH.
exec python3 -B "$(dirname "$0")/stend-pochinki.py"
