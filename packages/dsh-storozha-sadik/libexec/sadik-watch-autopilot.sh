# AP certificate/consumer reader; source from sadik-watch, never repair services.
sadik_proverit_autopilot() {
  if [ "${MESTNO:-0}" != 1 ]; then log '   AP mail health: local sadik reader not applied in remote mode'; return; fi
  local helper="${SADIK_AP_HEALTH_BIN:-/usr/local/libexec/autopilot-mail-health.py}"
  local cert="${SADIK_AP_CERT:-/etc/autopilot-mail/server.pem}" report rc=0
  local days="${SADIK_AP_CERT_WARN_DAYS:-14}" grace="${SADIK_AP_START_GRACE_SECONDS:-30}"
  local cert_cooldown="${SADIK_AP_CERT_COOLDOWN_SECONDS:-86400}" copy_cooldown="${SADIK_AP_COPY_COOLDOWN_SECONDS:-1800}"
  local -a fields=()
  if [[ ! "$cert_cooldown" =~ ^[1-9][0-9]*$ || ! "$copy_cooldown" =~ ^[1-9][0-9]*$ || ${#cert_cooldown} -gt 6 || ${#copy_cooldown} -gt 6 ]] || [ "$cert_cooldown" -gt 604800 ] || [ "$copy_cooldown" -gt 604800 ]; then
    BEDY=$((BEDY+1)); gruppa autopilot-reader bad-threshold 'Autopilot reader: invalid cooldown threshold' 1800; return
  fi
  report=$(timeout --kill-after=1s 8s /usr/bin/python3 -I -S -B "$helper" --certificate "$cert" --warn-days "$days" --startup-grace-seconds "$grace" 2>&1) || rc=$?
  if [ "$rc" -le 2 ]; then
    mapfile -t fields < <(printf '%s' "$report" | /usr/bin/python3 -I -S -B -c 'import json,sys
x=json.load(sys.stdin)
keys=["certificate_state","certificate_detail","copy_state","copy_detail"]
assert set(x)==set(keys) and all(type(x[k])==str and "\n" not in x[k] for k in keys)
assert x[keys[0]] in ("","cert_expiring","cert_expired","cert_unmeasured")
assert x[keys[2]] in ("","copy_not_active","copy_unit_missing","copy_unmeasured")
code=int(sys.argv[1]);states=x[keys[0]]+x[keys[2]]
assert (code==0)==(not states) and (code==2)==("unmeasured" in states)
for k in keys:print(x[k])' "$rc" 2>/dev/null)
  fi
  if [ "${#fields[@]}" -ne 4 ]; then
    BEDY=$((BEDY+1)); gruppa autopilot-reader "source-code=$rc" "Autopilot reader $helper: result not measured (code $rc)" 1800; return
  fi
  gruppa autopilot-reader '' '' 1800
  if [ -n "${fields[0]}" ]; then BEDY=$((BEDY+1)); fi
  if [ -n "${fields[2]}" ]; then BEDY=$((BEDY+1)); fi
  log "   AP mail health: ${fields[1]}; ${fields[3]}"
  gruppa autopilot-cert "${fields[0]}" "Autopilot certificate: ${fields[1]}" "$cert_cooldown"
  gruppa autopilot-copy "${fields[2]}" "Autopilot consumer: ${fields[3]}" "$copy_cooldown"
}
