#!/usr/bin/env bash
# OnFailure reader: no journal bodies or memory contents are sent.
set -uo pipefail
ALERT="${SEAM_ALERT_BIN:-/usr/local/bin/agent-alert}"
if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo '[pamyat-seam-alert] INPUT_FAILED unit не передан (нужен один параметр)' >&2
  exit 2
fi
UNIT="$1"
if [[ ! "$UNIT" =~ ^[a-zA-Z0-9_.@:-]+\.service$ ]]; then
  printf '[pamyat-seam-alert] INPUT_FAILED негодное имя unit=%s\n' "$UNIT" >&2
  exit 2
fi
RESULT=unknown; STATUS=unknown; RUN=unknown
SHOW=$(systemctl show "$UNIT" -p LoadState -p Result -p ExecMainStatus -p InvocationID); SHOW_CODE=$?
if [ "$SHOW_CODE" -eq 0 ]; then
  LOAD=unknown
  while IFS='=' read -r key value; do
    case "$key" in
      LoadState) LOAD="$value" ;;
      Result) RESULT="${value:-unknown}" ;;
      ExecMainStatus) STATUS="${value:-unknown}" ;;
      InvocationID) RUN="${value:-unknown}" ;;
    esac
  done <<< "$SHOW"
  if [ "$LOAD" != loaded ]; then
    RESULT=unknown; STATUS=unknown; RUN=unknown
    printf '[pamyat-seam-alert] OBSERVATION_FAILED unit=%s LoadState=%s\n' "$UNIT" "$LOAD" >&2
  fi
else
  printf '[pamyat-seam-alert] OBSERVATION_FAILED unit=%s systemctl_code=%s\n' "$UNIT" "$SHOW_CODE" >&2
fi
MSG="sadik: проверка secretary→core→restore НЕ завершилась успешно. unit=$UNIT result=$RESULT status=$STATUS run=$RUN. Подробности: journalctl -u $UNIT."
printf '[pamyat-seam-alert] FAILURE unit=%s result=%s status=%s run=%s\n' "$UNIT" "$RESULT" "$STATUS" "$RUN"
if [ ! -x "$ALERT" ]; then
  printf '[pamyat-seam-alert] DELIVERY_FAILED sender_unavailable=%s\n' "$ALERT" >&2
  exit 2
fi
# agent-alert defaults: 3 attempts x 20s plus pauses 5+15s. Bound the whole call.
timeout --kill-after=5s 100s "$ALERT" "$MSG"; KOD=$?
if [ "$KOD" -ne 0 ]; then
  printf '[pamyat-seam-alert] DELIVERY_FAILED code=%s unit=%s run=%s\n' "$KOD" "$UNIT" "$RUN" >&2
  exit 2
fi
printf '[pamyat-seam-alert] CHANNEL_ACCEPTED unit=%s run=%s\n' "$UNIT" "$RUN"
