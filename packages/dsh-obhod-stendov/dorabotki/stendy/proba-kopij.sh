#!/bin/bash
# B-N-1477 т.2 — проба мест копий. ТОЛЬКО ЧТЕНИЕ. Каркас тот же, что proba-prav-domov.sh.
# Вызов: proba-kopij.sh --boj | --koren DIR ; прочий ввод — отказ (код 2).
# Исход: 0 ЗЕЛЁНОЕ; 1 КРАСНОЕ; 3 СЛЕПОТА (нет sudo, нет предмета).
#   dostup  — ход учётки (sudo -n -u): nobody — отказ; законный — есть (хозяин /home/claude читает свой дом;
#             учётка фермы получает ENOENT, а не EACCES, на .claude/remote/.api_key — как сегодня);
#   schyot  — nobody читает 0 файлов во всём /var/backups/montazh (find -readable от nobody) и 0 копий писем z-* в /tmp
#             корневого пространства имён (/proc/1/root/tmp, по other-битам — годно и под PrivateTmp обходчика);
#   rezhim  — other=--- на трёх каталогах;
#   sluzhba — читатели-службы ходят root (User= пуст или root): sadik-backup, backup-verify, montazh-srok,
#             razmer-kopii-watch, strahovanie-modulej-watch, zadaniya-prervany-watch. Сменят на не-root — потеряют доступ.
# Чего НЕ ловит: новые места копий вне трёх каталогов и /tmp/z-* (их ищет перепись t2/perepis.sh, а не эта проба);
#   чтение через sudo; копии писем в /tmp под другими именами.
set -u
case "${1:-}" in
  --boj)   [ $# -eq 1 ] || { echo "отказ: лишние доводы" >&2; exit 2; }; R="" ;;
  --koren) [ $# -eq 2 ] && [ -d "$2" ] && [ "$2" != / ] || { echo "отказ: --koren DIR (DIR есть и не /)" >&2; exit 2; }; R="${2%/}" ;;
  *) echo "отказ: вызов --boj | --koren DIR" >&2; exit 2 ;;
esac
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo -n у $(id -un)" >&2; exit 3; }
red=0; slep=0
z() { echo "ЗЕЛЁНОЕ $*"; }; k() { echo "КРАСНОЕ $*"; red=1; }; s() { echo "СЛЕПОТА $*"; slep=1; }
est() { sudo -n test -e "$1"; }
ne_dolzhen() { local kto=$1 chto=$2 p=$3 rc
  est "$p" || { s "dostup $kto $chto $p: предмета нет"; return; }
  if [ "$chto" = read ]; then
    local observed
    observed=$(sudo -n -u "$kto" python3 - "$p" <<'PY_READ'
import errno,os,sys
try:
    fd=os.open(sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    os.close(fd)
except OSError as error: print(errno.errorcode[error.errno])
else: print('OTKRYT')
PY_READ
    ) || { s "dostup $kto read $p: проба учётки не выполнена"; return; }
    case "$observed" in
      EACCES|EPERM) z "dostup $kto read $p: отказ (ждали отказ)" ;;
      OTKRYT) k "dostup $kto read $p: ПРОШЁЛ (ждали отказ)" ;;
      *) s "dostup $kto read $p: ${observed:-нет ответа}, не доказательство запрета" ;;
    esac
    return
  fi
  sudo -n -u "$kto" ls -- "$p" >/dev/null 2>&1; rc=$?
  [ $rc -ne 0 ] && z "dostup $kto $chto $p: отказ (ждали отказ)" || k "dostup $kto $chto $p: ПРОШЁЛ (ждали отказ)"; }
dolzhen() { local kto=$1 chto=$2 p=$3 ok=1
  est "$p" || { s "dostup $kto $chto $p: предмета нет"; return; }
  case $chto in read) sudo -n -u "$kto" head -c1 -- "$p" >/dev/null 2>&1 && ok=0 ;; list) sudo -n -u "$kto" ls -- "$p" >/dev/null 2>&1 && ok=0 ;; esac
  [ $ok -eq 0 ] && z "dostup $kto $chto $p: есть (ждали есть)" || k "dostup $kto $chto $p: НЕТ (ждали есть)"; }
enoent() { local kto=$1 p=$2 e   # ошибка, которую получает учётка, открывая несуществующий путь
  e=$(sudo -n -u "$kto" python3 -c "import errno,sys
try: open(sys.argv[1])
except OSError as x: print(errno.errorcode[x.errno])
else: print('OTKRYT')" "$p" 2>/dev/null)
  [ "$e" = ENOENT ] && z "dostup $kto enoent $p: ENOENT (ждали ENOENT)" || k "dostup $kto enoent $p: ${e:-нет ответа} (ждали ENOENT)"; }
rezhim() { local p=$1 o; est "$p" || { s "rezhim $p: предмета нет"; return; }
  o=$(sudo -n stat -c %A -- "$p" | cut -c8-10); [ "$o" = "---" ] && z "rezhim $p: other=---" || k "rezhim $p: other=$o (ждали ---)"; }
schyot() { local opis=$1 n=$2 iz=$3; [ "$n" -eq 0 ] && z "schyot $opis: nobody читает 0 из $iz" || k "schyot $opis: nobody читает $n из $iz (ждали 0)"; }

M=$R/var/backups/montazh; H=$R/home/claude; Z=$R/var/lib/zadaniya-prervany-watch
HOZ=$(sudo -n stat -c %U "$H" 2>/dev/null) || { s "нет $H"; HOZ=claude; }
# посторонний
ne_dolzhen nobody list "$M"
# B-N-2065: предмет из текущего перечня, не вечная ссылка на удаляемую страховку.
# NUL сохраняет пробелы/переводы строк в имени; отказ find не превращается в 0.
MEST_LIST=$(mktemp) || { echo "СЛЕПОТА: не создать список мест копий"; exit 3; }
trap 'rm -f -- "$MEST_LIST"' EXIT
MEST_FILES=()
if sudo -n find "$M" -xdev -type f -print0 > "$MEST_LIST"; then
  mapfile -d '' -t MEST_FILES < "$MEST_LIST"
else s "schyot $M: root-перечень не получен"; fi
vsego=${#MEST_FILES[@]}
sample_stamp() { sudo -n python3 - "$1" <<'PY_STAMP'
import errno,os,stat,sys
try: st=os.lstat(sys.argv[1])
except OSError as error:
    print(errno.errorcode.get(error.errno,str(error.errno)),file=sys.stderr)
    sys.exit(1)
if not stat.S_ISREG(st.st_mode): sys.exit(1)
print(st.st_dev,st.st_ino,st.st_mode,st.st_uid,st.st_gid,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
PY_STAMP
}
if [ "$vsego" -eq 0 ]; then s "dostup nobody read $M: перечень пуст, образца нет"
else
  sample=${MEST_FILES[0]}
  if before=$(sample_stamp "$sample"); then
    ne_dolzhen nobody read "$sample"
    after=$(sample_stamp "$sample") && [ "$before" = "$after" ] || s "dostup nobody read $sample: образец исчез/изменился"
  else s "dostup nobody read $sample: образец исчез/не regular"; fi
fi
ne_dolzhen nobody list "$H"
ne_dolzhen nobody read "$Z/dlya-zabavy-zadaniya-prervany.md"
schyot "$M (все файлы)" "$(sudo -n -u nobody find "$M" -xdev -type f -readable 2>/dev/null | wc -l)" "$vsego"
# /tmp — корневого пространства имён: у ночного обходчика PrivateTmp=yes, его /tmp пуст, и «0 из 0» было бы слепым
# зелёным (замер 03.10 10:3xZ: под частным /tmp 0 из 0 при 62 на хосте). Считаем по other-битам: /tmp 1777, other = nobody.
if [ -z "$R" ]; then TT=/proc/1/root/tmp; else TT=$R/tmp; fi
if sudo -n test -d "$TT/."; then
  zv=$(sudo -n find "$TT/" -maxdepth 1 -type f -user "$HOZ" -name 'z-*' 2>/dev/null | wc -l)
  schyot "$TT/z-* хозяина $HOZ (other-биты)" "$(sudo -n find "$TT/" -maxdepth 1 -type f -user "$HOZ" -name 'z-*' -perm -o=r 2>/dev/null | wc -l)" "$zv"
else s "schyot: нет $TT"; fi
# законные
dolzhen "$HOZ" list "$H"
dolzhen iskra list "$H"                                            # dvojniki под iskra обходит /home/claude (т.3, 11:15:44Z)
for u in avrora coders; do enoent "$u" "$H/.claude/remote/.api_key"; done
for u in sadik-backup backup-verify montazh-srok razmer-kopii-watch strahovanie-modulej-watch zadaniya-prervany-watch; do
  us=$(systemctl show -p User --value "$u.service" 2>/dev/null); ld=$(systemctl show -p LoadState --value "$u.service" 2>/dev/null)
  [ "$ld" = loaded ] || { s "sluzhba $u: LoadState=$ld"; continue; }
  [ -z "$us" ] || [ "$us" = root ] && z "sluzhba $u: User=${us:-root}" || k "sluzhba $u: User=$us — не root, после закрытия потеряет доступ"
done
# второй слой
rezhim "$M"; rezhim "$H"; rezhim "$Z"
[ $slep -ne 0 ] && { echo "ИТОГ: СЛЕПОТА"; exit 3; }
[ $red -ne 0 ] && { echo "ИТОГ: КРАСНОЕ"; exit 1; }
echo "ИТОГ: ЗЕЛЁНОЕ"; exit 0
