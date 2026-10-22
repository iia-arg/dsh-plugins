# Installed by the pinned bootstrap as $OPS/env.sh, OPS=/root/AP<номер>-<рука>-<дата>.
# Пути окна выводятся из имени OPS: KIT=/var/tmp/AP<номер>-WINDOW-<рука>-<дата>, PUBLIC=/var/tmp/AP<номер>-WINDOW-PUBLIC-<рука>-<дата>.
set -euo pipefail
umask 077
OPS=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
OPS_NAME=${OPS##*/}
[[ "$OPS" == /root/* && "$OPS_NAME" =~ ^(AP[0-9]+)-([a-z]+-[0-9]{8})$ ]] || { echo "ОТКАЗ: env.sh не в /root/AP<номер>-<рука>-<дата>: $OPS" >&2; return 2 2>/dev/null || exit 2; }
SAVE=$OPS/window
STATE=$OPS/state
PUBLIC=/var/tmp/${BASH_REMATCH[1]}-WINDOW-PUBLIC-${BASH_REMATCH[2]}
KIT=/var/tmp/${BASH_REMATCH[1]}-WINDOW-${BASH_REMATCH[2]}
REPO=/opt/iskra/workspace/dsh-plugins
export OPS SAVE STATE PUBLIC KIT REPO
step() {
  local label=$1
  shift
  local rc=0
  if [[ "$1" = timeout || "$1" = idle_master ]]; then
    "$@" >"$STATE/$label.log" 2>&1 || rc=$?
  else
    timeout -k 2s 60s "$@" >"$STATE/$label.log" 2>&1 || rc=$?
  fi
  printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$label" "$rc" >>"$STATE/RC.tsv"
  if (( rc )); then tail -n 12 "$STATE/$label.log" >&2; return "$rc"; fi
}
if [[ -f "$STATE/forward.id" ]]; then
  ID_AP=$(cat "$STATE/forward.id")
  [[ "$ID_AP" =~ ^[0-9a-f]{32}$ ]]
  export ID_AP
fi
idle_master() {
  local output rc=0
  output=$(timeout -k 2s 60s /usr/local/libexec/agent-hod/hod-sluzhby master.service 2>&1) || rc=$?
  printf '%s\n' "$output"
  [[ $rc = 0 && "$output" == *'zhurnal=est'* && "$output" == *'distill=net'* ]]
}
