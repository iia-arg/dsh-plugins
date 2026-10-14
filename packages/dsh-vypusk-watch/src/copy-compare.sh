#!/bin/bash
# Pure ordinary-copy comparison shared by VOW and montazh-okno. No state, channels or deferral.
# Legacy list order/hash width/asymmetry and CHANGELOG stderr are preserved for VOW byte parity.
# Checksums are truncated to 16 hex characters (64 bits): integrity checks, not protection against intentional substitution.
set -uo pipefail
export LC_ALL=C.utf8
blind() {
  python3 -c 'import json,sys;print(json.dumps({"status":"blind","reason":sys.argv[1]},ensure_ascii=False))' "$1"
  exit 2
}
declare -A ARGS=()
while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || blind 'copy checker arguments invalid'
  case "$1" in --source|--copy|--name|--version|--published-only|--exceptions|--tag) ;;
    *) blind 'copy checker argument unknown' ;;
  esac
  [ -z "${ARGS[$1]+x}" ] || blind 'copy checker argument duplicated'
  ARGS[$1]=$2; shift 2
done
for key in --source --copy --name --version --published-only --exceptions; do
  [ -n "${ARGS[$key]+x}" ] || blind 'copy checker argument missing'
done
MK=${ARGS[--source]}; BOI=${ARGS[--copy]}; IMYA=${ARGS[--name]}; VB=${ARGS[--version]}
SOSTAV_TOLKO=${ARGS[--published-only]}; METKA=${ARGS[--tag]:-source}
[[ "$MK" = /* && "$BOI" = /* && -d "$MK" && -d "$BOI" ]] || blind 'copy checker directory unavailable'
[[ "$SOSTAV_TOLKO" = 0 || "$SOSTAV_TOLKO" = 1 ]] || blind 'copy checker policy invalid'
[ -r "${ARGS[--exceptions]}" ] || blind 'copy checker exceptions unavailable'
VREM=$(mktemp -d) || blind 'copy checker scratch unavailable'
trap 'rm -rf -- "$VREM"' EXIT
cp -- "${ARGS[--exceptions]}" "$VREM/exceptions.json" || blind 'copy checker exceptions unreadable'
SUDO=''
summy() {
  ( cd "$1" 2>/dev/null || return 1
    find . -type f -not -path '*/node_modules/*' \
         -not -name '*.bak*' -not -name '*.tar' -not -name '*.tgz' 2>/dev/null \
    | sort | while read -r f; do
        if s=$(sha256sum "$f" 2>/dev/null); then s=${s:0:16}; else s=NECHITAEM; fi
        printf '%s %s\n' "$s" "$f"
      done )
}

  # RU: 🔴 обнулять ДО блока асимметрии: 19.09 обнуление стояло ПОСЛЕ
  # RU: присваивания, и пометка о гашении не печаталась — прибор гасил МОЛЧА.
  # EN: 🔴 reset BEFORE the asymmetry block: on 19.09 the reset stood AFTER
  # EN: the assignment, and the suppression note was not printed — the instrument suppressed SILENTLY.
  VNE_SOSTAVA=''
  summy "$MK"  > "$VREM/metka.txt" || blind "$IMYA: исходный состав не прочитан"
  # RU: 25.09: под root sudo не звать — юнит User=root, а каждый sha256sum/cat/find через sudo давал ~61 тыс. вызовов/сутки.
  # EN: 25.09: do not call sudo under root — the unit is User=root, and every sha256sum/cat/find via sudo gave ~61k calls/day.
  if [ "$(id -u)" = 0 ]; then SUDO=; elif sudo -n true 2>/dev/null; then SUDO=sudo; else SUDO=; fi
  ( cd "$BOI" 2>/dev/null && $SUDO find . -type f -not -path '*/node_modules/*' \
      -not -name '*.bak*' -not -name '*.tar' -not -name '*.tgz' 2>/dev/null | sort \
    | while read -r f; do
        if s=$($SUDO sha256sum "$f" 2>/dev/null); then s=${s:0:16}; else s=NECHITAEM; fi
        printf '%s %s\n' "$s" "$f"
      done ) > "$VREM/boi.txt" || blind "$IMYA: боевой состав не прочитан (бой: $BOI)"

  # RU: У пакета по соответствию обе стороны сужаются до состава публикации МЕТКИ (files + package.json).
  # EN: For a package matched by mapping, both sides are narrowed to the TAG's published contents (files + package.json).
  VNE_SOSTAVA_BOYA=''
  if [ "$SOSTAV_TOLKO" = 1 ]; then
    if ! VNE_SOSTAVA_BOYA=$(python3 - "$MK/package.json" "$VREM/metka.txt" "$VREM/boi.txt" <<'PY_SOSTAV'
import json, sys
files = json.load(open(sys.argv[1], encoding='utf-8')).get('files') or []
if not files: sys.exit(3)
sostav = [f.removeprefix('./').rstrip('/') for f in files] + ['package.json']  # не strip('./'): тот срезает НАБОР знаков («.env.example» → «env.example») — находка приёмки · RU/EN: strip() removes a SET of characters
def v(rel): return any(rel == e or rel.startswith(e + '/') for e in sostav)
dropped = 0
for path in sys.argv[2:]:
    lines = open(path, encoding='utf-8').read().splitlines()
    keep = [l for l in lines if v(l.split(' ', 1)[1][2:] if l.split(' ', 1)[1].startswith('./') else l.split(' ', 1)[1])]
    if path == sys.argv[3]: dropped = len(lines) - len(keep)
    open(path, 'w', encoding='utf-8').write(''.join(l + '\n' for l in keep))
print(dropped)
PY_SOSTAV
    ); then
      blind "$IMYA: у метки $METKA нет \"files\" — состав публикации не определён, сверять по соответствию нечем (бой: $BOI)"
    fi
  fi

  if grep -q '^NECHITAEM ' "$VREM/boi.txt" "$VREM/metka.txt"; then
    blind "$IMYA: файл состава не читается (бой: $BOI)"
  fi
  printf '%s\t%s\n' "$(sha256sum "$VREM/boi.txt" | cut -d' ' -f1)" "$BOI" >> "$VREM/copies"
  NM=$(wc -l < "$VREM/metka.txt"); NB=$(wc -l < "$VREM/boi.txt")
  [ "$NB" -gt 0 ] || blind "$IMYA: боевой каталог не прочитался (0 файлов при $NM в метке)"

  # RU: --- АСИММЕТРИЯ ПО СОСТАВУ: убрать из ожиданий файлы метки, которым в бою взяться
  # RU: неоткуда. Состав читается ИЗ МАНИФЕСТА, а не списком имён: список устарел бы.
  # EN: --- ASYMMETRY BY CONTENTS: drop from expectations the tag files that have no way to
  # EN: appear in production. The contents are read FROM THE MANIFEST, not from a list of names: a list would go stale.
  SOSTAV=$(jq -r '.files // empty | .[]' "$MK/package.json" 2>/dev/null)
  if [ -n "$SOSTAV" ]; then
    : > "$VREM/vne.txt"
    while read -r s f; do
      [ -n "${f:-}" ] || continue
      rel=${f#./}; v_sostave=0
      while read -r e; do
        [ -n "$e" ] || continue
        e=${e#./}; e=${e%/}
        case "$rel" in "$e"|"$e"/*) v_sostave=1; break;; esac
      done <<< "$SOSTAV"
      [ "$v_sostave" = 1 ] || printf '%s %s\n' "$s" "$f" >> "$VREM/vne.txt"
    done < "$VREM/metka.txt"
    if [ -s "$VREM/vne.txt" ]; then
      # RU: выкидываем из ожиданий ТОЛЬКО те, которых в бою нет вовсе
      # EN: drop from expectations ONLY those that are absent from production altogether
      while read -r s f; do
        # RU: путь сверяется ЦЕЛИКОМ (всё после первого пробела строки «сумма путь»): подстрока «␠x.js» задевала и x.js.map.
        # EN: the path is matched WHOLE (everything after the first space of a "sum path" line): the substring " x.js" also hit x.js.map.
        awk -v f="$f" 'substr($0, index($0, " ") + 1) == f { n = 1 } END { exit !n }' "$VREM/boi.txt" ||
          { awk -v f="$f" 'substr($0, index($0, " ") + 1) != f' "$VREM/metka.txt" > "$VREM/m2" && mv "$VREM/m2" "$VREM/metka.txt"; VNE_SOSTAVA="${VNE_SOSTAVA:-}$f "; }
      done < "$VREM/vne.txt"
      NM=$(wc -l < "$VREM/metka.txt")
    fi
  fi

  SOVPALO=$(comm -12 <(sort "$VREM/metka.txt") <(sort "$VREM/boi.txt") | wc -l)
  ZNAM=$(( NM > NB ? NM : NB ))

  VM=$(jq -r '.version // "?"' "$MK/package.json" 2>/dev/null)


  # RU: Совпадение файлов не доказывает наличие записи о выпуске.
  # EN: Matching files do not prove that a release entry exists.
  if ! CHANGELOG_BAD=$($SUDO python3 - "$IMYA" "$VB" "$BOI/CHANGELOG.md" "$MK/CHANGELOG.md" "$VREM/exceptions.json" <<'PY_CHANGELOG'
import pathlib, re, sys, json
name, version, live, tagged, exceptions = sys.argv[1:]
forgiven = json.loads(pathlib.Path(exceptions).read_text()).get(name + '@' + version)
missing = []
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version):
    print(f"{name}: версия боя не прочитана — запись в CHANGELOG проверить нельзя")
else:
    # Начало следующей записи: Markdown-заголовок либо строка версии.
    entry = re.compile(r"^[ \t]*(?:#{1,6}[ \t]+)?" + re.escape(version) + r"(?=$|[ \t]|[—–:])")
    boundary = re.compile(r"^[ \t]*(?:#{1,6}[ \t]+|[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?=$|[ \t]|[—–:]))")
    for label, filename in (("бой", live), ("метка", tagged)):
        try:
            lines = pathlib.Path(filename).read_text(encoding="utf-8").splitlines()
        except FileNotFoundError:
            print(f"{name}: CHANGELOG.md отсутствует ({label}); версия {version} в бою")
            continue
        except (OSError, UnicodeError) as e:
            print(f"{name}: CHANGELOG.md не прочитан ({label}): {type(e).__name__}")
            continue
        found = False
        for i, line in enumerate(lines):
            m = entry.search(line)
            if not m: continue
            # Текст в строке заголовка после номера — тоже содержимое записи («## 1.1.38 — перенумерация …»; A-N-1562).
            # Голая дата после номера содержимым не считается. Пустая запись — заголовок без текста и без строк до следующей.
            # Text after the version in the heading line is entry content too; a bare date is not.
            if re.sub(r"^[\s—–:·-]*(?:[0-9]{4}-[0-9]{2}-[0-9]{2})?[\s—–:·-]*", "", line[m.end():]): found = True; break
            for following in lines[i+1:]:
                if boundary.search(following): break
                if following.strip(): found = True; break
            if found: break
        if not found: missing.append(label)
    if missing:
        if forgiven:
            print(f"ПРОЩЕНО: {name}@{version} — записи нет ({forgiven['reason']}); простил: {forgiven['owner']}, {forgiven['date']}", file=sys.stderr)
        else:
            for label in missing:
                print(f"{name}: версия {version} в бою, записи в CHANGELOG нет или она пуста ({label})")

PY_CHANGELOG
); then
    CHANGELOG_BAD="$IMYA: проверка CHANGELOG не исполнилась"
  fi

MATCHED=0
if [ "$SOVPALO" -eq "$ZNAM" ] && [ "$NM" -eq "$NB" ] && [ -z "$CHANGELOG_BAD" ] && [ "$VM" = "$VB" ]; then MATCHED=1; fi
TOLKO_B=$(comm -13 <(cut -d' ' -f2- "$VREM/metka.txt"|sort) <(cut -d' ' -f2- "$VREM/boi.txt"|sort) | head -6 | tr '\n' ' ')
TOLKO_M=$(comm -23 <(cut -d' ' -f2- "$VREM/metka.txt"|sort) <(cut -d' ' -f2- "$VREM/boi.txt"|sort) | head -6 | tr '\n' ' ')
INOE=$(python3 - "$VREM/metka.txt" "$VREM/boi.txt" <<'PY_DIFFERENT'
import sys
def sums(path):
    return {p: h for h, p in (line.rstrip('\n').split(' ', 1) for line in open(path, encoding='utf-8'))}
a, b = map(sums, sys.argv[1:])
print(' '.join([p for p in sorted(a.keys() & b.keys()) if a[p] != b[p]][:6]))
PY_DIFFERENT
)
python3 - "$MATCHED" "$SOVPALO" "$ZNAM" "$NM" "$NB" "$VM" "$VNE_SOSTAVA" "$VNE_SOSTAVA_BOYA" "$INOE" "$TOLKO_B" "$TOLKO_M" "$CHANGELOG_BAD" "$VREM/boi.txt" <<'PY_RESULT'
import hashlib,json,pathlib,sys
m,matched,total,nm,nb,version,outside,outside_copy,different,only_copy,only_source,changelog,copy_file=sys.argv[1:]
data=pathlib.Path(copy_file).read_bytes()
print(json.dumps(dict(status='match' if m=='1' else 'diff',matched=int(matched),total=int(total),source_count=int(nm),copy_count=int(nb),source_version=version,outside_source=outside,outside_copy_count=outside_copy,different=different,only_copy=only_copy,only_source=only_source,changelog_bad=changelog,copy_sums=data.decode('utf-8'),copy_index_sha256=hashlib.sha256(data).hexdigest()),ensure_ascii=False))
PY_RESULT
[ "$MATCHED" = 1 ] && exit 0
exit 1
