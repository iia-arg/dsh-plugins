#!/bin/bash
# Cross-check of the duplicated action=blocked threshold constant.
#
# WHY. The blocked action goes through our own direct call, around the
# platform's remote boundary (the block method is not exposed), so the "not
# before N autonomous rounds" threshold is repeated on our side as a number. The
# number is duplicated across a boundary we do not control: the platform changes
# its own and ours diverges silently, and one prohibition starts behaving
# differently on the two routes.
#
# WHERE IT DOES NOT APPLY AND WHEN IT STOPS. The script only reads and only
# compares two numbers: it edits nothing, restarts nothing and goes nowhere
# except the two named files. It does NOT repair a divergence — a human does,
# because the right decision (accept the platform's new number, or diverge
# deliberately) depends on what the platform changed.
#
# Exit code: 0 — they match, 1 — divergence OR blindness of the script itself.
#
# USAGE:  tools/check-blocked-threshold.sh <bridge file> <platform installation root>
#     or  OUR_FILE=... DSH_APP=... tools/check-blocked-threshold.sh
# The paths are arguments on purpose: the script must read THE installation that
# was upgraded, not the one it was written on.
set -u

OUR_FILE=${1:-${OUR_FILE:-}}
DSH_APP=${2:-${DSH_APP:-}}
if [ -z "$OUR_FILE" ] || [ -z "$DSH_APP" ]; then
  echo "blocked threshold: two paths are required — <bridge file> <platform installation root>"; exit 2
fi
PLATFORM_FILE="$DSH_APP/node_modules/@deepseek-ai/dsh-tool-goal/lib/index.js"

fail() { echo "blocked threshold: $*"; exit 1; }

[ -r "$OUR_FILE" ]      || fail "BLINDNESS — cannot read our file $OUR_FILE"
[ -r "$PLATFORM_FILE" ] || fail "BLINDNESS — cannot read the platform file $PLATFORM_FILE"

# our default
OURS=$(grep -oP 'BLOCKED_AFTER_ROUNDS_DEFAULT = \K[0-9]+' "$OUR_FILE" | head -1)
# the platform's: two independent places — the schema .default(N) and the fallback ?? N
PLATFORM_SCHEMA=$(grep -oP 'blockedAfterConsecutiveRounds: z\.number\(\)[^;]*\.default\(\K[0-9]+' "$PLATFORM_FILE" | head -1)
PLATFORM_FALLBACK=$(grep -oP 'config\.blockedAfterConsecutiveRounds \?\? \K[0-9]+' "$PLATFORM_FILE" | head -1)

# A sign of the script's own health: empty here means "the pattern stopped
# matching the code", not "there is no number". Staying silent about that is not
# allowed.
[ -n "$OURS" ]              || fail "BLINDNESS — our default not found in $OUR_FILE"
[ -n "$PLATFORM_SCHEMA" ]   || fail "BLINDNESS — the platform .default() not found in $PLATFORM_FILE"
[ -n "$PLATFORM_FALLBACK" ] || fail "BLINDNESS — the platform ?? N not found in $PLATFORM_FILE"

[ "$PLATFORM_SCHEMA" = "$PLATFORM_FALLBACK" ] || fail "the platform has two DIFFERENT numbers: schema $PLATFORM_SCHEMA, fallback $PLATFORM_FALLBACK"

if [ "$OURS" != "$PLATFORM_SCHEMA" ]; then
  fail "DIVERGENCE — ours is $OURS, the platform's is $PLATFORM_SCHEMA (${PLATFORM_FILE}). Compare and decide by hand."
fi

VER=$(grep -m1 '"version"' "$DSH_APP/node_modules/@deepseek-ai/dsh-tool-goal/package.json" | grep -oP '"\K[0-9][^"]*')
echo "blocked threshold: matches ($OURS), dsh-tool-goal ${VER:-version could not be read}"
exit 0
