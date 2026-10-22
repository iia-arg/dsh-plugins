#!/bin/bash
# 03 — план v6 §2 (блок 5): контрольный файл в public-каталоге оператора — по нему администратор входа ведёт mesh-пробу
# (блок 9 плана). Рука — сам ОПЕРАТОР, не root, после 02. Вход: AP_PARAMS=<файл> 03-operator-kontrol.sh.
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_zagruzit_params
test "$(id -u)" -ne 0
AP_CONTROL_DIR="$AP_PUBLIC_ROOT/$AP_OPERATOR/okno-probe/run-probe"
AP_PUBLIC_PATH="$AP_OPERATOR/okno-probe/run-probe/state.js"
/usr/bin/python3 -B - "$AP_CONTROL_DIR" <<'PYCONTROL'
import os,sys
assert os.geteuid()!=0
os.umask(0o027);p=sys.argv[1];os.mkdir(os.path.dirname(p),0o750);os.mkdir(p,0o750)
with open(p+'/state.js.tmp','x') as h:h.write('window.STATE={"window_probe":true};\n')
os.chmod(p+'/state.js.tmp',0o640);os.rename(p+'/state.js.tmp',p+'/state.js')
PYCONTROL
stat -c '%a %u:%g %n' "$AP_CONTROL_DIR" "$AP_CONTROL_DIR/state.js"
sha256sum "$AP_CONTROL_DIR/state.js"
# Тело контрольного файла постоянно — его сумма обязана совпасть с принятой AP_CONTROL_SHA.
printf '%s  %s\n' "$AP_CONTROL_SHA" "$AP_CONTROL_DIR/state.js" | sha256sum -c -
