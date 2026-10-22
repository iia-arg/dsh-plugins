#!/bin/bash
# 02 — план v6 §1–2 (блоки 3–4): страховки П7 и юнитов, открытие окна montazh-okno, постоянная полка пакета,
# install.sh --dry-run → установка → --check. Рука — root машины приложения. Вход: 02-polka.sh <SAVE из 01>.
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_proverit_sostoyanie "${1:-}"
set -euo pipefail
source "$1/env.sh"
install -d -m 0700 "$AP_SAVE/files"
# Перечень возврата для otkat.sh: П7, НОВЫЕ родители путей П7, enable-ссылки, замок установщика, staging полки.
# Откат возвращает ровно этот перечень по страховкам ниже (отсутствовал → в карантин; был → назад из страховки).
AP_RESTORE_PATHS="$AP_SAVE/restore-paths.txt"
{ test ! -e "$AP_RESTORE_PATHS" && test ! -L "$AP_RESTORE_PATHS"; } || ap_stop "$AP_RESTORE_PATHS уже есть — 02 уже шёл в этом SAVE"
: > "$AP_RESTORE_PATHS"
AP_KEY_TIMER_LINK=/etc/systemd/system/timers.target.wants/dsh-autopilot-key-check.timer
AP_UNIT_LINK="/etc/systemd/system/multi-user.target.wants/$AP_UNIT"
AP_INSTALL_LOCK=/opt/autopilot/.install.lock   # lib/install.py :280
test -r "$AP_P7_PATHS" || ap_stop "П7 $AP_P7_PATHS не читается"
while IFS= read -r AP_PATH; do
  test -n "$AP_PATH"
  printf '%s\n' "$AP_PATH" >> "$AP_RESTORE_PATHS"
  # Новый родитель тоже обязан исчезнуть при откате, а не остаться пустым каталогом (замер Гаммы 15.10: 191 отличие).
  AP_PARENT=$(dirname "$AP_PATH")
  while test ! -e "$AP_PARENT" && test ! -L "$AP_PARENT"; do
    install -d -m 0700 "$AP_SAVE/files$(dirname "$AP_PARENT")"
    : > "$AP_SAVE/files$AP_PARENT.absent"
    printf '%s\n' "$AP_PARENT" >> "$AP_RESTORE_PATHS"
    AP_PARENT=$(dirname "$AP_PARENT")
  done
  AP_BACKUP_PATH="$AP_SAVE/files$AP_PATH"
  install -d -m 0700 "$(dirname "$AP_BACKUP_PATH")"
  if test -e "$AP_PATH" || test -L "$AP_PATH"; then
    if test -d "$AP_PATH" && ! test -L "$AP_PATH"; then
      /usr/bin/python3 -B - "$AP_PATH" "$AP_BACKUP_PATH.dir-meta.json" <<'PYDIR'
import os,sys,stat,json,base64
p,out=sys.argv[1:];st=os.lstat(p)
assert stat.S_ISDIR(st.st_mode)
attrs={k:base64.b64encode(os.getxattr(p,k,follow_symlinks=False)).decode() for k in os.listxattr(p,follow_symlinks=False)}
with open(out,'x') as h:json.dump({'path':p,'mode':stat.S_IMODE(st.st_mode),'uid':st.st_uid,'gid':st.st_gid,'inode':st.st_ino,'xattr':attrs},h)
PYDIR
    elif test -f "$AP_PATH" && ! test -L "$AP_PATH" || test -L "$AP_PATH"; then
      cp -a -- "$AP_PATH" "$AP_BACKUP_PATH"
    else
      printf '%s\n' 'STOP: неподдерживаемый вид предмета' >&2; exit 2
    fi
    stat -c '%a %u:%g %i %n' -- "$AP_PATH" >> "$AP_SAVE/metadata-before.txt"
    if test -f "$AP_PATH" && ! test -L "$AP_PATH"; then
      sha256sum -- "$AP_PATH" >> "$AP_SAVE/sums-before.txt"
    elif test -L "$AP_PATH"; then
      readlink -- "$AP_PATH" >> "$AP_SAVE/links-before.txt"
    fi
  else
    : > "$AP_BACKUP_PATH.absent"
  fi
done < <({ cat -- "$AP_P7_PATHS"; printf '%s\n' "$AP_KEY_TIMER_LINK" "$AP_UNIT_LINK" "$AP_INSTALL_LOCK"; } | sort -u)
for AP_SERVICE in "$AP_UNIT" "$AP_AGENT_SERVICE" "$AP_GATEWAY_SERVICE" \
  dsh-autopilot-key-check.service dsh-autopilot-key-check.timer \
  montazh-okno-watch.service montazh-okno-watch.timer \
  vypusk-okno-watch.service vypusk-okno-watch.timer \
  registry-watchdog.service registry-watchdog.timer; do
  systemctl show "$AP_SERVICE" -p Id -p LoadState -p ActiveState -p UnitFileState \
    -p FragmentPath -p DropInPaths -p Requires -p RequiredBy -p Wants -p WantedBy \
    -p BindsTo -p BoundBy -p Requisite -p RequisiteOf -p PartOf -p ConsistsOf \
    -p Before -p After -p Triggers -p TriggeredBy -p MainPID >> "$AP_SAVE/units-before.txt"
  systemctl list-dependencies --reverse --all "$AP_SERVICE" --no-pager >> "$AP_SAVE/reverse-before.txt"
done
# Первичная установка key-units: иной baseline требует отдельного принятого rollback.
for AP_KEY_UNIT in dsh-autopilot-key-check.service dsh-autopilot-key-check.timer; do
  test "$(systemctl show "$AP_KEY_UNIT" -p LoadState --value)" = not-found
  { test ! -e "/etc/systemd/system/$AP_KEY_UNIT" && test ! -L "/etc/systemd/system/$AP_KEY_UNIT"; } \
    || ap_stop "/etc/systemd/system/$AP_KEY_UNIT уже есть — иной baseline требует отдельного принятого отката"
done
{ test ! -e "$AP_KEY_TIMER_LINK" && test ! -L "$AP_KEY_TIMER_LINK"; } || ap_stop "$AP_KEY_TIMER_LINK уже есть"
: > "$AP_SAVE/key-timer-wants.absent"
AP_WINDOW_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AP_CHILD_IDS="$AP_SAVE/child-window-ids.txt"
: > "$AP_CHILD_IDS"
AP_WINDOW_ID=$(/usr/local/sbin/montazh-okno otkryt --plan "$AP_WINDOW_PLAN" \
  --task "$AP_TASK" --actor "$AP_ACTOR" --ttl 1800)
printf '%s\n' "$AP_WINDOW_ID" > "$AP_SAVE/window-id.txt"
# Откат обязан работать и при обрыве дальше в 02 или в 04 — состояние окна в env.sh сразу, а не только в конце 02.
declare -p $(compgen -v AP_) > "$AP_SAVE/env.sh"
: "${AP_P7_PATHS:?полный принятый список}" "${AP_ACTOR:?рука окна}"
AP_PACKAGE_PARENT=$(dirname "$AP_PACKAGE_DIR")
/usr/bin/python3 -B - "$AP_PACKAGE_PARENT" <<'PYPARENTS'
import os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);assert p.is_absolute() and '..' not in p.parts
for q in (p,*p.parents):
 if q.exists() or q.is_symlink():
  st=os.lstat(q);assert stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not stat.S_IMODE(st.st_mode)&0o022
PYPARENTS
install -d -m 0755 -o root -g root "$AP_PACKAGE_PARENT"
AP_PACKAGE_NEW=$(mktemp -d "$AP_PACKAGE_PARENT/.package-new.XXXXXX")
# Случайного staging до mktemp не было; при раннем обрыве он иначе остался бы вне П7.
install -d -m 0700 "$AP_SAVE/files$(dirname "$AP_PACKAGE_NEW")"
: > "$AP_SAVE/files$AP_PACKAGE_NEW.absent"
printf '%s\n' "$AP_PACKAGE_NEW" >> "$AP_RESTORE_PATHS"
python3 -B - "$AP_TGZ" "$AP_ARCHIVE_STRIP" <<'PY'
import sys,tarfile
from pathlib import PurePosixPath
strip=int(sys.argv[2]);assert strip in (0,1)
with tarfile.open(sys.argv[1]) as archive:
    rows=archive.getmembers();roots=set();result=[]
    for row in rows:
        p=PurePosixPath(row.name)
        assert not p.is_absolute() and '..' not in p.parts
        assert row.isfile() or row.isdir(), 'non-regular package member'
        roots.add(p.parts[0])
        if len(p.parts)<=strip:
            assert row.isdir();continue
        result.append(str(PurePosixPath(*p.parts[strip:])))
    assert len(result)==len(set(result)), 'duplicate extracted path'
    if strip:assert len(roots)==1, 'not one package prefix'

PY
tar -xzf "$AP_TGZ" --strip-components="$AP_ARCHIVE_STRIP" --no-same-owner -C "$AP_PACKAGE_NEW"
# BEGIN-CONSOLIDATED-SPLIT
: "${AP_PACKAGE_NEW:?проверенный новый source staging}" "${AP_SAVE:?root-private страховка окна}"
AP_AUX_STAGE="$AP_SAVE/consolidated-aux"
{ test ! -e "$AP_AUX_STAGE" && test ! -L "$AP_AUX_STAGE"; } || ap_stop "$AP_AUX_STAGE уже есть"
install -d -m 0700 -o root -g root "$AP_AUX_STAGE"
for AP_AUX_DIR in checks razdacha tools; do
  { test -d "$AP_PACKAGE_NEW/$AP_AUX_DIR" && ! test -L "$AP_PACKAGE_NEW/$AP_AUX_DIR"; } \
    || ap_stop "в архиве нет каталога $AP_AUX_DIR (или это ссылка)"
  mv -- "$AP_PACKAGE_NEW/$AP_AUX_DIR" "$AP_AUX_STAGE/$AP_AUX_DIR"
done
AP_CHECKS_STAGE="$AP_AUX_STAGE/checks"
AP_D_STAGE="$AP_AUX_STAGE/razdacha"
AP_COUNTER_SOURCE="$AP_AUX_STAGE/tools/measure-run-codex.py"
AP_COUNTER_README_SOURCE="$AP_AUX_STAGE/tools/README-measure-run-codex.md"
# END-CONSOLIDATED-SPLIT
chown -R root:root "$AP_PACKAGE_NEW"
chmod 0755 "$AP_PACKAGE_NEW"
test ! -e "$AP_PACKAGE_DIR" || { printf '%s\n' 'STOP: полка уже существует; сверить, не перезаписывать' >&2; exit 2; }
mv -T -- "$AP_PACKAGE_NEW" "$AP_PACKAGE_DIR"
AP_LOCAL=$(python3 -B -c 'import json,sys; print(json.load(open(sys.argv[1]))["local_revision"])' "$AP_PACKAGE_DIR/source-lock.json")
AP_RELEASE="/opt/autopilot/releases/$AP_PIN-$AP_LOCAL"
test "$(python3 -B -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream_sha"])' "$AP_PACKAGE_DIR/source-lock.json")" = "$AP_PIN"
test "$(python3 -B -c 'import json,sys; print(json.load(open(sys.argv[1]))["runtime_operator"])' "$AP_PACKAGE_DIR/source-lock.json")" = "$AP_OPERATOR"
DESTDIR=/ bash "$AP_PACKAGE_DIR/install.sh" --dry-run
DESTDIR=/ bash "$AP_PACKAGE_DIR/install.sh"
# Снимок «после» своей записи (условие Вениамина 15.10 19:05Z): otkat вернёт байты «до», только если живой файл = «до»
# или = этому снимку; иное — чужая правка поверх (например, учётки соседнего окна в /etc/group) — СТОП до первого действия.
/usr/bin/python3 -B - "$AP_SAVE" "$AP_RESTORE_PATHS" <<'PYPOSLE'
import hashlib,json,os,stat,sys
from pathlib import Path
save,manifest=Path(sys.argv[1]),Path(sys.argv[2])
def sost(p):
    if not os.path.lexists(p): return None
    st=os.lstat(p)
    if stat.S_ISLNK(st.st_mode): v='link:'+os.readlink(p)
    elif stat.S_ISREG(st.st_mode): v=hashlib.sha256(open(p,'rb').read()).hexdigest()
    else: v='vid:'+oct(stat.S_IFMT(st.st_mode))
    return [v,stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid]
posle={}
for t in sorted(set(x for x in manifest.read_text().splitlines() if x)):
    b=save/'files'/t.lstrip('/')
    if b.is_symlink() or b.is_file(): posle[t]=sost(t)
with open(save/'posle.json','x') as h: json.dump(posle,h)
print('снимок «после» установки:',len(posle),'путей, бывших до окна')
PYPOSLE
DESTDIR=/ bash "$AP_PACKAGE_DIR/install.sh" --check
stat -c '%a %U:%G %n' "$AP_PUBLIC_ROOT" "$AP_PUBLIC_ROOT/$AP_OPERATOR"
getent group autopilot-view
declare -p $(compgen -v AP_) > "$AP_SAVE/env.sh"; echo WINDOW=$AP_WINDOW_ID
