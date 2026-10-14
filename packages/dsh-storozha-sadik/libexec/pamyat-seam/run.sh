#!/usr/bin/env bash
set -uo pipefail
STAND="${SEAM_STAND:-/usr/local/libexec/pamyat-seam/stand.mjs}"
RUN_ID="${INVOCATION_ID:-manual-$$}"
PREFIX="[pamyat-seam]"
printf '%s START run=%s time=%s stand=%s\n' "$PREFIX" "$RUN_ID" "$(date -u +%FT%TZ)" "$STAND"
if [ ! -r "$STAND" ]; then
  printf '%s END run=%s code=2 reason=stand_unreadable path=%s\n' "$PREFIX" "$RUN_ID" "$STAND"
  exit 2
fi
SUM=$(sha256sum -- "$STAND"); KOD=$?
if [ "$KOD" -ne 0 ]; then
  printf '%s END run=%s code=2 reason=stand_hash_unavailable\n' "$PREFIX" "$RUN_ID"
  exit 2
fi
printf '%s INPUT run=%s sha256=%s timeout_seconds=30\n' "$PREFIX" "$RUN_ID" "${SUM%% *}"
timeout --kill-after=5s 30s /usr/local/bin/node "$STAND"; RAW=$?
case "$RAW" in
  0) KOD=0; WHY=contract_passed ;;
  1) KOD=1; WHY=contract_mismatch ;;
  2) KOD=2; WHY=incomplete ;;
  *) KOD=2; WHY=unexpected_or_timeout ;;
esac
printf '%s END run=%s time=%s raw_code=%s code=%s reason=%s\n' "$PREFIX" "$RUN_ID" "$(date -u +%FT%TZ)" "$RAW" "$KOD" "$WHY"
exit "$KOD"
