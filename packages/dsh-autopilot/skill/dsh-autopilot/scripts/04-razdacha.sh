#!/bin/bash
# 04 — план v6 §3, §4, §4а, §6 (блоки 6, 8, 10, 13): сумма ключа раздачи, файлы и юнит раздачи, проверяльщик ключа
# (шесть целей условия (б)), счётчик модели. Каждый файл — своим дочерним окном smontirovat-fajly. Рука — root.
# Вход: 04-razdacha.sh <SAVE из 01>, после 02 и 03.
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_proverit_sostoyanie "${1:-}"
source "$1/env.sh"
ap_klyuch_proverit "$AP_KEY_FILE"
ap_new_file "$AP_D_STAGE/razdacha.py" /usr/local/libexec/dsh-autopilot/razdacha.py 0755
ap_new_file "$AP_D_STAGE/razdacha-zdorova" /usr/local/bin/razdacha-zdorova 0755
ap_new_file "$AP_D_STAGE/dsh-autopilot-razdacha.service" /etc/systemd/system/dsh-autopilot-razdacha.service 0644
systemd-analyze verify /etc/systemd/system/dsh-autopilot-razdacha.service
systemctl daemon-reload
systemctl enable --now "$AP_UNIT"
# Поправка 2 (r6): сразу после enable --now порт ещё не слушается — голый вызов давал 000 и обрывал окно.
ap_zhdat_razdachu /usr/local/bin/razdacha-zdorova
systemctl show "$AP_UNIT" -p MainPID -p ActiveState -p DynamicUser -p SupplementaryGroups -p FragmentPath -p DropInPaths
ss -ltnH "sport = :$AP_PORT"
curl --fail --silent --show-error --max-time 5 "http://$AP_MESH_IP:$AP_PORT/__zhivoj"
: "${AP_CHECKS_STAGE:?принятый проверенный stage шести целей условия (б)}" "${AP_LAYOUT_MANIFEST_SHA:?принятый полный SHA манифеста из реестра}"
ap_new_file "$AP_CHECKS_STAGE/key-check.py" /usr/local/libexec/dsh-autopilot/key-check.py 0755
ap_new_file "$AP_CHECKS_STAGE/key-health.py" /usr/local/libexec/dsh-autopilot/key-health.py 0755
ap_new_file "$AP_CHECKS_STAGE/layout-check.py" /usr/local/libexec/dsh-autopilot/layout-check.py 0755
ap_new_file "$AP_CHECKS_STAGE/layout-expected.json" /usr/local/libexec/dsh-autopilot/layout-expected.json 0644
ap_new_file "$AP_CHECKS_STAGE/dsh-autopilot-key-check.service" /etc/systemd/system/dsh-autopilot-key-check.service 0644
ap_new_file "$AP_CHECKS_STAGE/dsh-autopilot-key-check.timer" /etc/systemd/system/dsh-autopilot-key-check.timer 0644
systemd-analyze verify /etc/systemd/system/dsh-autopilot-key-check.service /etc/systemd/system/dsh-autopilot-key-check.timer
systemctl daemon-reload
systemctl start dsh-autopilot-key-check.service
systemctl enable --now dsh-autopilot-key-check.timer
systemctl show dsh-autopilot-key-check.service -p User -p Group -p ExecStart -p FragmentPath -p DropInPaths -p ExecMainCode -p ExecMainStatus -p ExecMainExitTimestampMonotonic
systemctl is-active dsh-autopilot-key-check.timer
: "${AP_COUNTER_SOURCE:?принятый exact adapter}" "${AP_COUNTER_SHA:?его полный SHA256}"
: "${AP_COUNTER_TARGET:?принятый боевой адрес адаптера}"
printf '%s  %s\n' "$AP_COUNTER_SHA" "$AP_COUNTER_SOURCE" | sha256sum -c -
ap_new_file "$AP_COUNTER_SOURCE" "$AP_COUNTER_TARGET" 0755
: "${AP_COUNTER_README_SOURCE:?}" "${AP_COUNTER_README_TARGET:?}"
ap_new_file "$AP_COUNTER_README_SOURCE" "$AP_COUNTER_README_TARGET" 0644
# Mapping/child-окна уже входят в принятую П7.
declare -p $(compgen -v AP_) > "$AP_SAVE/env.sh"; echo 04-RAZDACHA-OK
