#!/usr/bin/env bash
# Обёртка стенда stend-sajt-chat.py (B-N-1499 адаптер чата сайта, r14 Авроры; Искра 03.10): обходчик запускает только stend-*.sh|stend-*.mjs,
# поэтому .py зовётся отсюда. Предмет — бой /usr/local/sbin/sajt-chat. Код возврата — кода стенда (0 зелёное, 1 красное, 2 слепота).
exec python3 -B "$(dirname "$(readlink -f "$0")")/stend-sajt-chat.py" "$@"
