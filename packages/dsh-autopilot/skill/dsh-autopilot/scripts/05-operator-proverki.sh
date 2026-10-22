#!/bin/bash
# 05 — план v6 §4а и условие (б) (блоки 11 и 14): обычный читатель видит здоровье ключа и раскладку, не будучи root.
# Рука — ОПЕРАТОР, после 04. Вход: AP_PARAMS=<файл> 05-operator-proverki.sh.
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_zagruzit_params
test "$(id -u)" -ne 0
/usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/key-health.py
: "${AP_LAYOUT_MANIFEST_SHA:?принятый SHA из registry для обычного reader}"
/usr/bin/python3 -I -B /usr/local/libexec/dsh-autopilot/layout-check.py \
  --manifest /usr/local/libexec/dsh-autopilot/layout-expected.json --sha "$AP_LAYOUT_MANIFEST_SHA"
