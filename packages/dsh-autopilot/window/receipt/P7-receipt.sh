#!/usr/bin/env bash
set -euo pipefail
[[ $# = 0 ]] || { echo 'СТОП: неизвестные аргументы, включая --dry-run/-n/--check'; exit 2; }
[[ $EUID = 0 && -r /root/AP0112-P/root-common.sh ]] || { echo 'СТОП: нужна root-рука с проверенным root-stage'; exit 2; }
source /root/AP0112-P/root-common.sh
[[ $(stat -c '%d:%i' "$P") = "$(cat "$B/project.identity")" ]] || { echo 'СТОП P7: проект сменился'; exit 2; }
RUN=$(python3 -I -B "$S/project-info.py" run)
SLOT=$(cat "$B/codex-slot")
[[ $SLOT = codex-3 || $SLOT = codex-4 ]] || { echo 'СТОП P7: исходный слот не установлен'; exit 2; }
count=0
if [[ -e $B/observe.count ]]; then count=$(cat "$B/observe.count"); fi
[[ $count =~ ^[0-5]$ ]] || { echo 'СТОП P7: предел шести наблюдений или испорченный счётчик'; exit 2; }
now=$(date +%s)
if [[ $count != 0 ]]; then
  started=$(cat "$B/observe.started")
  [[ $started =~ ^[0-9]+$ && $now -ge $started && $((now-started)) -le 450 ]] || { echo 'СТОП P7: нет150с резерва в окне наблюдения600с'; exit 2; }
fi
echo 'СУДЬЯ P7: свой run/slot, наблюдение в пределах6/600с; создать новый private snapshot, не затирать прежний'
if [[ $count = 0 ]]; then printf '%s\n' "$now" > "$B/observe.started"; fi
printf '%s\n' "$((count+1))" > "$B/observe.count"
GEN=$(python3 -I -c 'import json,re,sys;g=json.load(open(sys.argv[1]))["generation"];assert type(g)is str and re.fullmatch("[0-9a-f]{64}",g);print(g)' /var/lib/autopilot-usage/runs/"$RUN"/current.json)
timeout -k 1s 15s python3 -I -B "$S/u-dir.py" check --before "$B/u-dir.before.json" --profile /var/lib/autopilot-usage/source-profile.json --run "$RUN" --generation "$GEN"
SNAP=$(mktemp -d "$B/snapshot.XXXXXXXX")
printf '%s\n' "$SNAP" > "$B/latest-snapshot"
if timeout -k 1s 25s python3 -I -B "$S/save-receipt.py" "$RUN" "$SNAP" "$GEN"; then :
else
  echo 'неполно у master: SOURCE_UNAVAILABLE'; echo 'неполно у vintik: SOURCE_UNAVAILABLE'; echo 'неполно у sova: SOURCE_UNAVAILABLE'
  echo 'P7: snapshot недоступен; прогон не объявляется проваленным'; exit 0
fi
timeout -k 1s 15s python3 -I -B "$S/validate-public.py" "$L_0112" "$SNAP/receipt.json" "$RUN" "$P"
set +e
timeout -k 1s 50s python3 -I -B "$S/observe-session.py" --run "$RUN" --project "$P" --profile /var/lib/autopilot-usage/source-profile.json --core "$L_0112" --snapshot "$SNAP/prepared" > "$SNAP/session-proof.json"
rc=$?;set -e
cat "$SNAP/session-proof.json"
if timeout -k 1s 10s python3 -I -B "$S/stage-times.py" --bootstrap "$B/bootstrap-proof.json" --session "$SNAP/session-proof.json" --profile /var/lib/autopilot-usage/source-profile.json --run "$RUN" --now "$(date +%s)" | tee "$SNAP/stage-times.json"; then :
else
  echo '{"state":"неизвестно","reason":"TIMING_METADATA_UNAVAILABLE_OR_TIMEOUT"}' | tee -a "$SNAP/stage-times.json"
fi
if [[ $rc = 3 ]]; then
  echo 'P7: нужные mail/native стадии ещё не доказаны; ниже только числа данного среза, GO одной сессии нет'
  timeout -k 1s 15s python3 -I -B "$S/judge-receipt.py" --receipt "$SNAP/receipt.json" --prepared-record "$SNAP/prepared/record.json" --run "$RUN" --project "$P" --codex-slot "$SLOT" | tee "$SNAP/receipt-judge-partial.log"
  exit 0
fi
[[ $rc = 0 ]] || { echo 'СТОП P7: одна сессия не доказана/подменена, расход не объявлять подтверждённым'; exit 2; }
python3 -I -B - "$B/bootstrap-proof.json" "$SNAP/session-proof.json" <<'SAME'
import json,sys
b,s=map(lambda p:json.load(open(p)),sys.argv[1:]);m=s['sessions']['master']
assert b['state']=='verified' and (b['sessionId'],b['sessionCreated'])==(m['sessionId'],m['sessionCreated']), 'СТОП: bootstrap и RUN в разных AP-сессиях'
print('СУДЬЯ: bootstrap-root-proof и весь RUN в одной AP tuple')
SAME
MIN_CUT=$(python3 -I -c 'import json,sys;d=json.load(open(sys.argv[1]));assert d["state"]=="verified";print(d["minCut"])' "$SNAP/session-proof.json")
timeout -k 1s 15s python3 -I -B "$S/judge-receipt.py" --receipt "$SNAP/receipt.json" --prepared-record "$SNAP/prepared/record.json" --run "$RUN" --project "$P" --codex-slot "$SLOT" --min-cut "$MIN_CUT" | tee "$SNAP/receipt-judge.log"
