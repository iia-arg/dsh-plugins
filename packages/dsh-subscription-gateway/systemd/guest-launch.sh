#!/bin/sh
# RU: Шаблон deployment: проверить учётку, реальные пути и приоритет drop-in перед монтажом. Описанные права относятся к живому процессу шлюза.
# EN: Deployment template: verify account, actual paths and drop-in precedence before installation. These permissions apply to the live gateway process.
set -eu
[ "${GATEWAY_INSTRUMENTY_DVIZHKA:-}" = net ] || { echo 'guest-launch: guest tools policy must be net' >&2; exit 2; }
[ "$#" -eq 1 ] || { echo 'guest-launch: expected gateway path' >&2; exit 2; }
case "${GATEWAY_TOKEN_FILE:-}" in
  */token-podpiska-1) selected=1 ;;
  */token-podpiska-2) selected=2 ;;
  */token-podpiska-3) selected=3 ;;
  *) echo 'guest-launch: unknown subscription token selection' >&2; exit 2 ;;
esac
[ -n "${CREDENTIALS_DIRECTORY:-}" ] || { echo 'guest-launch: no systemd credentials directory' >&2; exit 2; }
GATEWAY_TOKEN_FILE="$CREDENTIALS_DIRECTORY/token-podpiska-$selected"
[ -r "$GATEWAY_TOKEN_FILE" ] || { echo 'guest-launch: selected credential unreadable' >&2; exit 2; }
export GATEWAY_TOKEN_FILE
unset OMEGA_MCP_API_KEY OMEGA_GOST_KLYUCH GATEWAY_MCP
exec /usr/local/bin/node "$1"
