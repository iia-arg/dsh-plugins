#!/bin/bash
# B-N-1477 — проба прав домов iskra/zarya/avrora. ТОЛЬКО ЧТЕНИЕ: ничего не меняет.
# Вызов: proba-prav-domov.sh --boj            — живые /opt/{iskra,zarya,avrora}
#        proba-prav-domov.sh --koren DIR      — подставное дерево DIR/opt/{…} (стенд)
# Любой другой ввод — отказ (код 2).
# Исход: 0 — всё ЗЕЛЁНОЕ; 1 — есть КРАСНОЕ; 3 — СЛЕПОТА (нет sudo, нет предмета).
# Два класса строк:
#   dostup — ход чужой учётки по-настоящему (sudo -n -u <кто>): посторонний (nobody) получает
#            отказ, законный читатель — чтение;
#   rezhim — права «прочих» (other) на носителях: дом, a2a, pamyat, pamyat.db(+wal/shm/journal),
#            UROKI. Это второй слой: o+r на файле внутри закрытого дома доступа не даёт
#            (dostup промолчит по построению), поэтому его ловит только rezhim.
# Чего НЕ ловит: чтение через sudo (у claude, iskra, zarya, avrora, coders, petrovich, marc —
# NOPASSWD ALL, для них права дома не граница); копии вне домов (/var/backups/montazh и пр.);
# o+r внутри workspace Искры для учёток фермы, которым дан проход (--x) в дом-узел.
set -u
case "${1:-}" in
  --boj)   [ $# -eq 1 ] || { echo "отказ: лишние доводы" >&2; exit 2; }; R="" ;;
  --koren) [ $# -eq 2 ] && [ -d "$2" ] && [ "$2" != / ] || { echo "отказ: --koren DIR (DIR есть и не /)" >&2; exit 2; }; R="${2%/}" ;;
  *) echo "отказ: вызов --boj | --koren DIR" >&2; exit 2 ;;
esac
sudo -n true 2>/dev/null || { echo "СЛЕПОТА: нет sudo -n у $(id -un)" >&2; exit 3; }

# Законные читатели (замер B-N-1477 03.10.2026). Узел — дом Искры: общие инструменты фермы
# (tell-komu, podyom-uzla, kvitanciya-podyoma …) читают его от имени вызывающего агента.
UZEL_CHITATELI="zarya avrora petrovich coders marc spartak"
POSTORONNIJ=nobody
red=0; slep=0
z() { echo "ЗЕЛЁНОЕ $*"; }
k() { echo "КРАСНОЕ $*"; red=1; }
s() { echo "СЛЕПОТА $*"; slep=1; }
est() { sudo -n test -e "$1"; }                      # предмет есть (рукой root) — иначе отказ ничего не значит

# dostup: кто не должен пройти
ne_dolzhen() {  # ne_dolzhen <кто> <что: read|list|stat> <путь>
  local kto=$1 chto=$2 p=$3 rc
  est "$p" || { s "dostup $kto $chto $p: предмета нет"; return; }
  case $chto in
    read) sudo -n -u "$kto" head -c1 -- "$p" >/dev/null 2>&1; rc=$? ;;
    list) sudo -n -u "$kto" ls -- "$p" >/dev/null 2>&1; rc=$? ;;
    stat) sudo -n -u "$kto" stat -- "$p" >/dev/null 2>&1; rc=$? ;;
  esac
  [ $rc -ne 0 ] && z "dostup $kto $chto $p: отказ (ждали отказ)" || k "dostup $kto $chto $p: ПРОШЁЛ (ждали отказ)"
}
# dostup: кто должен пройти
dolzhen() {     # dolzhen <кто> <что: read|write|stat|sqlite> <путь>
  local kto=$1 chto=$2 p=$3 ok=1
  est "$p" || { s "dostup $kto $chto $p: предмета нет"; return; }
  case $chto in
    read)   sudo -n -u "$kto" head -c1 -- "$p" >/dev/null 2>&1 && ok=0 ;;
    write)  sudo -n -u "$kto" test -w "$p" && ok=0 ;;
    stat)   sudo -n -u "$kto" stat -- "$p" >/dev/null 2>&1 && ok=0 ;;
    sqlite) [ "$(sudo -n -u "$kto" head -c15 -- "$p" 2>/dev/null)" = "SQLite format 3" ] && ok=0 ;;
  esac
  [ $ok -eq 0 ] && z "dostup $kto $chto $p: есть (ждали есть)" || k "dostup $kto $chto $p: НЕТ (ждали есть)"
}
# rezhim: у «прочих» ничего
rezhim() {
  local p=$1 o
  est "$p" || { s "rezhim $p: предмета нет"; return; }
  o=$(sudo -n stat -c %A -- "$p" | cut -c8-10)
  [ "$o" = "---" ] && z "rezhim $p: other=--- " || k "rezhim $p: other=$o (ждали ---)"
}

for a in iskra zarya avrora; do
  H=$R/opt/$a; U=$(sudo -n bash -c "ls -d -- '$H'/UROKI-*.md 2>/dev/null | head -1")
  [ -n "$U" ] || s "UROKI в $H не найден"
  # посторонний
  ne_dolzhen $POSTORONNIJ stat "$H/workspace"
  ne_dolzhen $POSTORONNIJ list "$H/a2a/polnye"
  ne_dolzhen $POSTORONNIJ read "$H/pamyat/pamyat.db"
  [ -n "$U" ] && ne_dolzhen $POSTORONNIJ read "$U"
  # память: omega
  dolzhen omega sqlite "$H/pamyat/pamyat.db"
  dolzhen omega write  "$H/pamyat"
  [ -n "$U" ] && dolzhen omega read "$U"
  dolzhen claude stat "$H/a2a/in"                                     # bpftrace 03.10: stat без sudo, uid 1002
  # второй слой
  rezhim "$H"; rezhim "$H/a2a"; rezhim "$H/pamyat"; rezhim "$H/pamyat/pamyat.db"
  for x in -wal -shm -journal; do sudo -n test -e "$H/pamyat/pamyat.db$x" && rezhim "$H/pamyat/pamyat.db$x"; done
  [ -n "$U" ] && rezhim "$U"
  if [ $a = iskra ]; then
    for u in $UZEL_CHITATELI; do
      dolzhen "$u" read "$H/.dsh/profiles/web/cordis.patch.yml"      # tell-komu:239
      dolzhen "$u" read "$H/workspace/SOSTOYANIE-ISKRY.txt"          # kvitanciya-podyoma:39
    done
    dolzhen spartak read "$H/app/node_modules/@deepseek-ai/dsh-client-ui-slots/package.json"    # ссылки /opt/spartak/.dsh/profiles/node_modules
    dolzhen coders  read "$H/app/node_modules/@deepseek-ai/dsh-client-ui-slots/package.json"    # ссылки plugins/*/node_modules у alfa/beta/gamma
    # учётка фермы БЕЗ sudo, прошедшая в узел, личного не видит
    ne_dolzhen spartak list "$H/a2a/polnye"
    ne_dolzhen spartak read "$H/pamyat/pamyat.db"
    [ -n "$U" ] && ne_dolzhen spartak read "$U"
    ne_dolzhen spartak list "$H/.claude"
    rezhim "$H/.claude"
  else
    dolzhen iskra stat "$H/.dsh"                                      # agent-registry: lstat .dsh/.agent-presets
    dolzhen iskra stat "$H/pamyat/pamyat.db"                          # bpftrace 03.10: stat рукой iskra, uid 996
    ne_dolzhen iskra read "$H/pamyat/pamyat.db"                       # проход не даёт чтения базы
  fi
done
[ $slep -ne 0 ] && { echo "ИТОГ: СЛЕПОТА"; exit 3; }
[ $red -ne 0 ] && { echo "ИТОГ: КРАСНОЕ"; exit 1; }
echo "ИТОГ: ЗЕЛЁНОЕ"; exit 0
