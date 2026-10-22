#!/bin/bash
# 01 — план v6 §0–1 (блоки 1–2 комплекта Альфы): параметры, свежий upstream main = принятый PIN, сумма архива,
# оператор, каталог страховки окна, сухая правка реестра против основы. Рука — root машины приложения.
# Вход: AP_PARAMS=<файл параметров окна> 01-predpolyot.sh. Последняя строка — SAVE=<каталог>: его дают 02, 04, 06, otkat.sh.
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_zagruzit_params
set -euo pipefail
: "${AP_TASK:?пункт окна}" "${AP_PIN:?полный принятый upstream SHA}"
: "${AP_TGZ:?путь принятого package archive}" "${AP_TGZ_SHA:?полный SHA256}"
: "${AP_ARCHIVE_STRIP:?0 для плоского package, 1 для принятого единственного prefix}"
: "${AP_ROLLBACK_PLAN:?принятый JSON возврата layout-А}"
: "${AP_PACKAGE_HEAD:?commit точного CORE постоянной полки}" "${AP_BACKUP_ROOT:?корень страховок}"
: "${AP_WINDOW_PLAN:?принятый root-owned JSON layout-А без subjects smf}"
: "${AP_P7_PATHS:?принятый полный список целей}" "${AP_ACTOR:?рука окна}"
: "${AP_VOW_ENV_JSON:?принятый JSON фактического окружения VOW-service}"
: "${AP_RUKA:?автор учёта smontirovat-fajly}" # stage Д/checks/counter получается из единого архива в шаге2
: "${AP_OPERATOR:?оператор из source-lock}" "${AP_ENGINE_SKILLS:?каталог скиллов движка}"
: "${AP_AGENT_SERVICE:?юнит оператора}" "${AP_GATEWAY_SERVICE:?его юнит шлюза}"
: "${AP_MESH_IP:?IP машины приложения}" "${AP_PORT:?порт раздачи}"
: "${AP_REMOTE_IP:?IP разрешённого входа}" "${AP_DOMAIN:?домен панели}"
: "${AP_PLUGINS_REGISTRY:?живой plugins.yaml}" "${AP_PLUGINS_CANDIDATE:?принятый кандидат}"
: "${AP_PLUGINS_BASE_SHA:?полный SHA живой основы кандидата}"
: "${AP_AGENTS_VERIFY:?полный путь проверенного agents-reader}"
: "${AP_DORABOTKI:?полный путь действующего читателя учёта}"
/usr/bin/python3 -B - "$AP_PIN" "$AP_PACKAGE_HEAD" "$AP_TGZ_SHA" <<'PYPARAM'
import sys,re
assert re.fullmatch(r'[0-9a-f]{40}',sys.argv[1])
assert re.fullmatch(r'[0-9a-f]{40}',sys.argv[2])
assert re.fullmatch(r'[0-9a-f]{64}',sys.argv[3])
PYPARAM
export PLUGINS_REGISTRY="$AP_PLUGINS_REGISTRY"
export SMF_REESTR_PL="$AP_PLUGINS_REGISTRY"
AP_PACKAGE_DIR="/opt/autopilot/packages/$AP_PACKAGE_HEAD"
AP_KEY_FILE=/etc/dsh-autopilot/razdacha-klyuch
AP_UNIT=dsh-autopilot-razdacha.service
AP_DOCUMENT_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AP_SAVE="$AP_BACKUP_ROOT/$AP_TASK/$AP_DOCUMENT_START"
AP_REMOTE_MAIN=$(timeout 30 git ls-remote https://github.com/nick-vels/skills.git refs/heads/main)
AP_REMOTE_MAIN_SHA=$(printf '%s\n' "$AP_REMOTE_MAIN" | awk 'NF==2 && $2=="refs/heads/main" {print $1}')
test "$(printf '%s\n' "$AP_REMOTE_MAIN" | wc -l)" -eq 1
test "$AP_REMOTE_MAIN_SHA" = "$AP_PIN" || { printf '%s\n' 'STOP: main отличается от принятого PIN' >&2; exit 2; }
printf '%s  %s\n' "$AP_TGZ_SHA" "$AP_TGZ" | sha256sum -c -
test "$(id -u)" -eq 0
install -d -m 0700 -o root -g root "$AP_SAVE"
test "$(id -u "$AP_OPERATOR")" -ne 0
test "$(id -g "$AP_OPERATOR")" -ne 0
getent passwd "$AP_OPERATOR" > "$AP_SAVE/operator-passwd.txt"
id "$AP_OPERATOR" > "$AP_SAVE/operator-id.txt"
getent group autopilot-view > "$AP_SAVE/view-before.txt" || test "$?" -eq 2
/usr/local/bin/agent-plugins pravka "$AP_PLUGINS_CANDIDATE" --osnova "$AP_PLUGINS_BASE_SHA"
declare -p $(compgen -v AP_) > "$AP_SAVE/env.sh"; echo SAVE=$AP_SAVE
