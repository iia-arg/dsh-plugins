#!/bin/bash
# RU: стенд нескольких копий по соответствию и отпечатка невыпущенного (B-N-1738). Обёртка: код — stend-neskolko-kopij.py.
# EN: wrapper for stend-neskolko-kopij.py (B-N-1738).
set -eu
exec python3 "$(dirname "$0")/stend-neskolko-kopij.py" "$@"
