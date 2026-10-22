#!/bin/bash
# otkat — план v6 «Общий отказ и откат» (блоки 20–21): машина приложения возвращается в состояние ДО окна —
# службы окна сняты, перечень возврата из 02 (П7, новые родители, enable-ссылки, замок, staging) возвращён по страховкам,
# затем otkat-proveren дочерних окон и основного. Рука — root машины приложения. Вход: otkat.sh <SAVE из 01>.
# Сайт на входе закрывает рука входа (VYKL на vps-ru) ДО этого скрипта — он машину входа не трогает.
# Годится до первого прогона оператора и после обрыва в 02 или 04. После прогона (живое закрепление нового release)
# нужен отдельный принятый план миграции — этот скрипт его не заменяет.
# 15.10 (замер Гаммы, прибор bwrap fake-root): прежний откат возвращал только файлы дочерних окон и ставил mask —
# после установки 02+04 оставалось 191 отличие от «до». Теперь:
#  - mask НЕ ставится: службы до окна не было ⇒ файл юнита в карантин, daemon-reload, LoadState=not-found.
#    Ссылка mask → /dev/null — новый предмет относительно «отсутствовал», а не возврат.
#  - раскладка А возвращается этим же скриптом по плану основного окна, ДО его otkat-proveren.
#  - всё, что вернуть по страховке нельзя доказуемо («существующее на месте» без согласованной страховки,
#    план окна расходится со страховкой), — STOP ДО первого действия; дальше — ручной путь (SKILL раздел 4).
. "$(dirname "$(readlink -f "$0")")/obshchee.sh"
ap_proverit_sostoyanie "${1:-}"
source "$1/env.sh"
# Обрыв 02 до открытия окна: 02 к тому моменту писал только в SAVE — машину возвращать не в чем.
if test ! -e "$AP_SAVE/window-id.txt"; then
  echo "окно не открывалось (нет $AP_SAVE/window-id.txt): 02 оборвался до первого изменения машины — откатывать нечего"
  echo "если montazh-okno показывает открытое окно задачи $AP_TASK — разбор рукой"
  echo OTKAT-OK; exit 0
fi
: "${AP_RESTORE_PATHS:?нет перечня возврата — SAVE от 02 до 15.10 вечер; откат — ручной путь SKILL раздел 4}"
test "$AP_RESTORE_PATHS" = "$AP_SAVE/restore-paths.txt" || ap_stop "перечень возврата не в SAVE: $AP_RESTORE_PATHS"
AP_CHILD_IDS=${AP_CHILD_IDS:-$AP_SAVE/child-window-ids.txt}
test -f "$AP_CHILD_IDS" || : > "$AP_CHILD_IDS"
AP_QUARANTINE="$AP_SAVE/otkat-karantin"
{ test ! -e "$AP_QUARANTINE" && test ! -L "$AP_QUARANTINE"; } || ap_stop "$AP_QUARANTINE уже есть — откат уже шёл; разбор рукой"

# Сверка и возврат — одним кодом в двух режимах: proverit (только чтение) и vernut (действие, с повторной сверкой).
ap_vozvrat() {
python3 -B - "$1" "$AP_SAVE" "$AP_RESTORE_PATHS" "$AP_CHILD_IDS" "$AP_ROLLBACK_PLAN" "$AP_QUARANTINE" <<'PYOTKAT'
import base64,hashlib,json,os,shutil,stat,sys,tempfile
from pathlib import Path
mode,save,manifest,child_ids,main_plan,quarantine=sys.argv[1],*map(Path,sys.argv[2:])
def stop(text): print('STOP: '+text,file=sys.stderr); sys.exit(2)
if manifest.is_symlink() or not manifest.is_file(): stop('перечень возврата не обычный файл')
paths=set(x for x in manifest.read_text().splitlines() if x)
# Цели дочерних окон: их план — ровно один absent (это доказал ap_new_file); в перечень — даже если П7 их не назвал.
child_targets=set()
for ident in child_ids.read_text().split():
    plan=json.load(open(save/('rollback-'+ident+'.json')))
    if len(plan['checks'])!=1 or plan['checks'][0]['kind']!='absent': stop('план дочернего окна '+ident+' не «один absent»')
    child_targets.add(plan['checks'][0]['path'])
paths|=child_targets
rows={}
for text in paths:
    p=Path(text)
    if not p.is_absolute() or text!=os.path.normpath(text) or text=='/': stop('путь перечня не абсолютный/не нормальный: '+text)
    if p==save or save in p.parents or p in save.parents: stop('путь перечня пересекается с SAVE: '+text)
    if any(q.is_symlink() for q in p.parents): stop('родитель пути — ссылка: '+text)
    backup=save/'files'/text.lstrip('/')
    absent=Path(str(backup)+'.absent'); meta=Path(str(backup)+'.dir-meta.json')
    if absent.is_file(): kind='absent'
    elif meta.is_file():
        kind='directory'; d=json.loads(meta.read_text())
        if d['path']!=text: stop('страховка каталога не от этого пути: '+text)
        if not p.is_dir() or p.is_symlink(): stop('каталог «до» сейчас не каталог — ручной путь: '+text)
    elif backup.is_symlink() or backup.is_file(): kind='file'
    elif text in child_targets: kind='absent'
    else: stop('нет страховки «до» — существующее на месте, ручной путь: '+text)
    if text in child_targets and kind!='absent': stop('цель дочернего окна существовала до окна — ручной путь: '+text)
    rows[text]=(p,backup,kind,meta)
# План основного окна обязан сходиться со страховками: absent ↔ отсутствовал; file ↔ та же сумма и метаданные.
plan=json.load(open(main_plan))
for check in plan['checks']:
    text=check['path']; row=rows.get(text)
    if row is None: stop('путь плана основного окна вне перечня возврата: '+text)
    p,backup,kind,meta=row
    if check['kind']=='absent':
        if kind!='absent': stop('план: absent, страховка: был — ручной путь: '+text)
    elif check['kind']=='file':
        if kind!='file' or backup.is_symlink(): stop('план: file, страховка: '+kind+' — ручной путь: '+text)
        st=backup.lstat()
        if hashlib.sha256(backup.read_bytes()).hexdigest()!=check['sha256']: stop('сумма страховки ≠ план: '+text)
        for key,value in (('mode',stat.S_IMODE(st.st_mode)),('uid',st.st_uid),('gid',st.st_gid)):
            if key in check and check[key]!=value: stop(key+' страховки ≠ план: '+text)
    else: stop('проверка вида '+check['kind']+' — ручной путь: '+text)
# Бывший файл возвращается байтами «до» только поверх СВОЕЙ записи: живой = «до» или = снимку «после» из 02.
# Иное — чужая правка поверх окна (учётки соседа в /etc/group и т.п.): затирать нельзя — СТОП до первого действия.
# Нет снимка (02 оборвался до установки) — годно только «живой = до».
def sost(q):
    if not os.path.lexists(q): return None
    st=os.lstat(q)
    if stat.S_ISLNK(st.st_mode): v='link:'+os.readlink(q)
    elif stat.S_ISREG(st.st_mode): v=hashlib.sha256(open(q,'rb').read()).hexdigest()
    else: v='vid:'+oct(stat.S_IFMT(st.st_mode))
    return [v,stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid]
pf=save/'posle.json'
if pf.is_symlink() or (pf.exists() and not pf.is_file()): stop('снимок «после» не обычный файл')
posle=json.loads(pf.read_text()) if pf.exists() else {}
for text,(p,backup,kind,meta) in sorted(rows.items()):
    if kind!='file': continue
    zhivoj=sost(p); do=sost(backup)
    if zhivoj!=do and (text not in posle or zhivoj!=posle[text]):
        stop('живой файл не равен ни «до», ни «после» своей записи — чужая правка, ручной путь: '+text)
count={k:sum(1 for r in rows.values() if r[2]==k) for k in ('absent','file','directory')}
print('перечень возврата:',len(rows),'путей',count,'; план основного окна:',len(plan['checks']),'проверок — сходится')
if mode=='proverit': sys.exit(0)
quarantine.mkdir(mode=0o700)
def to_quarantine(p):
    if os.path.lexists(p):
        target=quarantine/(str(len(os.listdir(quarantine)))+'-'+p.name)
        shutil.move(str(p),str(target)); print('в карантин:',p)
# Глубже — раньше: дети уходят до родителей, родитель «до» получает метаданные после возврата содержимого.
for text in sorted(rows,key=lambda t:len(Path(t).parts),reverse=True):
    p,backup,kind,meta=rows[text]
    if kind=='absent': to_quarantine(p)
    elif kind=='directory':
        d=json.loads(meta.read_text()); os.chown(p,d['uid'],d['gid']); os.chmod(p,d['mode'])
        for key in set(os.listxattr(p))-set(d['xattr']): os.removexattr(p,key)
        for key,value in d['xattr'].items(): os.setxattr(p,key,base64.b64decode(value))
    else:
        to_quarantine(p)
        fd,name=tempfile.mkstemp(prefix='.otkat-',dir=p.parent); os.close(fd)
        try:
            st=backup.lstat()
            if backup.is_symlink(): os.unlink(name); os.symlink(os.readlink(backup),name); os.lchown(name,st.st_uid,st.st_gid)
            else: shutil.copy2(backup,name); os.chown(name,st.st_uid,st.st_gid); os.chmod(name,stat.S_IMODE(st.st_mode))
            os.replace(name,p); print('из страховки:',p)
        finally:
            if os.path.lexists(name): os.unlink(name)
print('возвращено путей:',len(rows),'; карантин:',quarantine)
PYOTKAT
}

# Всё сверить ДО первого действия: расхождение плана и страховок останавливает откат, ничего не сдвинув.
ap_vozvrat proverit
# Откат зовут и после обрыва в 02, когда юнитов 04 ещё нет: снимать только загруженное.
ap_snyat() {
  if [[ "$(systemctl show "$2" -p LoadState --value)" == loaded ]]; then systemctl $1 "$2"   # $1 без кавычек: «disable --now» — два слова
  else echo "$2: не загружен — пропускаю"; fi
}
ap_snyat 'disable --now' dsh-autopilot-key-check.timer
ap_snyat stop dsh-autopilot-key-check.service
ap_snyat 'disable --now' "$AP_UNIT"
ap_vozvrat vernut
systemctl daemon-reload
# Юнитов окна до окна не было (02 это требует) — после возврата systemd их не знает. mask не ставится.
for AP_U in "$AP_UNIT" dsh-autopilot-key-check.service dsh-autopilot-key-check.timer; do
  if test -e "$AP_SAVE/files/etc/systemd/system/$AP_U.absent"; then
    AP_LS=$(systemctl show "$AP_U" -p LoadState --value)
    test "$AP_LS" = not-found || ap_stop "$AP_U после возврата LoadState=$AP_LS, ждали not-found"
    echo "$AP_U: LoadState=not-found"
  fi
done
while IFS= read -r AP_CHILD_ID; do
  /usr/local/sbin/montazh-okno otkat-proveren --plan "$AP_SAVE/rollback-$AP_CHILD_ID.json" "$AP_CHILD_ID"
done < "$AP_CHILD_IDS"
/usr/local/sbin/montazh-okno otkat-proveren --plan "$AP_ROLLBACK_PLAN" "$AP_WINDOW_ID"
# Повторная установка после отката: mask нет — ap_new_file пройдёт на пустом месте; карантин остаётся следом в SAVE.
echo OTKAT-OK
