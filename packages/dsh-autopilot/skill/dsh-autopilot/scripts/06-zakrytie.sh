#!/bin/bash
# 06 — план v6 §9 (блок 19): запись реестра, проверки установки, учёт, сторож выпуска, git-учёт /usr/local и
# /etc/systemd/system, закрытие окна и дочерних окон, строгий сторож, журналы окна. Рука — root.
# Вход: 06-zakrytie.sh <SAVE из 01> — ТОЛЬКО после метки пакета (поправка 5: «файлы → метка → правка реестра»).
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_proverit_sostoyanie "${1:-}"
source "$1/env.sh"
ap_metka_est
ap_git_lichnost
/usr/local/bin/agent-plugins pravka "$AP_PLUGINS_CANDIDATE" --osnova "$AP_PLUGINS_BASE_SHA" \
  --ustanovit --punkt "$AP_TASK"
DESTDIR=/ bash "$AP_PACKAGE_DIR/install.sh" --check
/usr/local/bin/agent-plugins verify
"$AP_AGENTS_VERIFY" verify
ap_dorabotki_svoi   # поправка 3: без set -e, расхождения только из П7 окна
# AP_VOW_ENV_JSON — принятые root-owned данные фактического service-config.
# Systemd EnvironmentFile не shell-source; парсер service не заменяем новым eval.
ap_vow() {
  python3 -B - "$AP_VOW_ENV_JSON" "$AP_SAVE/$1" "$2" <<'PYVOW'
import os,stat,json,subprocess,sys
p,state,mode=sys.argv[1:];st=os.lstat(p)
assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and not stat.S_IMODE(st.st_mode)&0o022
capture=json.load(open(p));assert isinstance(capture,dict) and capture.get('schema')==1
assert isinstance(capture.get('captured_at_utc'),str) and isinstance(capture.get('commands'),list)
unit=capture['units']['vypusk-okno-watch.service']
assert unit['properties']['Id']=='vypusk-okno-watch.service' and unit['properties']['LoadState']=='loaded'
values=unit['configured_environment'];assert isinstance(values,dict)
assert all(isinstance(k,str) and k.startswith('VYPUSK_') and isinstance(v,str) for k,v in values.items())
assert values.get('VYPUSK_REPO') and values.get('VYPUSK_REESTR')
env={k:v for k,v in os.environ.items() if not k.startswith('VYPUSK_')};env.update(values);env.update(VYPUSK_TIHO='1',VYPUSK_SOSTOYANIE=state)
args=['/usr/local/sbin/vypusk-okno-watch.sh']+(['--avto-montazh'] if mode=='window' else [])
sys.exit(subprocess.run(args,env=env).returncode)
PYVOW
}
if ap_vow vow-manual-state window; then AP_VOW_RC=0; else AP_VOW_RC=$?; fi
case "$AP_VOW_RC" in 0|4) ;; *) printf '%s\n' 'STOP: VOW нашёл не только отсрочку' >&2; exit "$AP_VOW_RC";; esac
: "${AP_USR_LOCAL_FILES:?свой NUL-list}" "${AP_SYSTEMD_FILES:?свой NUL-list}"
for AP_GIT_SPEC in '/usr/local|AP_USR_LOCAL_FILES' '/etc/systemd/system|AP_SYSTEMD_FILES'; do
  IFS='|' read -r AP_GIT_ROOT AP_LIST_NAME <<< "$AP_GIT_SPEC"
  test -f "${!AP_LIST_NAME}"
  # Существующий staged index проверен до add; чужие staged-пути => STOP.
  git -C "$AP_GIT_ROOT" add -f --pathspec-from-file="${!AP_LIST_NAME}" --pathspec-file-nul
  git -C "$AP_GIT_ROOT" diff --cached --name-only
  /usr/bin/python3 -B - "$AP_GIT_ROOT" "${!AP_LIST_NAME}" <<'PYINDEX'
import sys,subprocess
root,listfile=sys.argv[1:]
allowed=set(open(listfile,'rb').read().split(b'\0'))-{b''}
assert allowed
for p in allowed: assert not p.startswith(b'/') and b'..' not in p.split(b'/') and not any(x in p for x in [b'*',b'?',b'['])
actual=set(subprocess.check_output(['git','-C',root,'diff','--cached','--name-only','-z']).split(b'\0'))-{b''}
assert actual <= allowed, 'STOP: index содержит чужие staged-пути'
PYINDEX
  if ! git -C "$AP_GIT_ROOT" diff --cached --quiet; then
    git -C "$AP_GIT_ROOT" -c user.name="$AP_GIT_NAME" -c user.email="$AP_GIT_EMAIL" commit -m "$AP_TASK: install accepted Autopilot files"
  fi
  git -C "$AP_GIT_ROOT" status --porcelain
  git -C "$AP_GIT_ROOT" rev-parse HEAD
done
/usr/local/sbin/montazh-okno zakryt "$AP_WINDOW_ID"
while IFS= read -r AP_CHILD_ID; do
  /usr/local/sbin/montazh-okno zakryt "$AP_CHILD_ID"
done < "$AP_CHILD_IDS"
ap_vow vow-final-state strict
AP_WINDOW_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s\n%s\n' "$AP_WINDOW_START" "$AP_WINDOW_END" > "$AP_SAVE/window-times.txt"
for AP_SERVICE in "$AP_UNIT" "$AP_AGENT_SERVICE" "$AP_GATEWAY_SERVICE" \
  montazh-okno-watch.service vypusk-okno-watch.service registry-watchdog.service; do
  journalctl -u "$AP_SERVICE" --since "$AP_WINDOW_START" --until "$AP_WINDOW_END" \
    -o short-iso --no-pager > "$AP_SAVE/journal-$AP_SERVICE.txt"
done
echo 06-ZAKRYTIE-OK
# Учёт сумм — после закрытия окна (поправка 3), отдельным действием руки учёта, не этим скриптом: --save узаконивает
# разом ВСЁ расхождение, и чужое, легшее после сверки выше, узаконилось бы вместе со своим.
echo "дальше рукой: \"$AP_DORABOTKI\" --check — расхождения те же, что выше; затем \"$AP_DORABOTKI\" --save"
