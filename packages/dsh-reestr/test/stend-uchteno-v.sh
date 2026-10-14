#!/bin/bash
# RU: СТЕНД uchteno_v (B-N-1918): запись без своего installed_check, учтённая пакетной записью, — verify судит её
# RU: через пакет. Случаи на подставном реестре (PLUGINS_REGISTRY/AGENTS_REGISTRY во временном каталоге):
# RU: (1) uchteno_v на существующую пакетную запись, файл в её derevo.files и installed_check → код 0, «учтено»;
# RU: (2) uchteno_v на несуществующую запись → код 1 с названной причиной; (3) без uchteno_v и без installed_check →
# RU: по-прежнему НЕ ПРОВЕРЕНО, код 2; (4) файла нет в derevo.files пакета → код 1; (5) при uchteno_v осталась version →
# RU: код 1 «двойной учёт»; (6) у пакета нет installed_check → код 1, а сам пакет — НЕ ПРОВЕРЕНО (код 2 сильнее);
# RU: (7)/(8) свой fingerprint записи (файл вне пакета) сверяется как прежде: совпал → 0, разошёлся → 1.
# RU: Чего НЕ ловит: верность боевых записей (это verify на бою); записи с несколькими файлами — только первый путь path (B-N-1931; было source.address).
# RU: Пишет только во временный каталог. Предмет — AP (по умолчанию ../bin/agent-plugins рядом со стендом).
# EN: uchteno_v STAND (B-N-1918): an entry without its own installed_check, covered by a package entry, is verified
# EN: through the package. Cases on a stand-in registry: (1) uchteno_v to an existing package entry whose derevo.files
# EN: and installed_check carry the file → exit 0; (2) to a missing entry → exit 1 with the reason; (3) neither field →
# EN: still UNVERIFIED, exit 2; (4) file not in the package's derevo.files → exit 1; (5) version left next to
# EN: uchteno_v → exit 1 "double accounting"; (6) package without installed_check → exit 2 (blindness wins).
# EN: Does NOT catch: whether live entries are right; multi-file entries — only source.address is checked.
set -u
TUT=$(dirname "$(readlink -f "$0")")
AP="${AP:-$TUT/../bin/agent-plugins}"
[ -x "$AP" ] || { echo "СЛЕПОТА: нет исполняемого $AP" >&2; exit 2; }
T=$(mktemp -d /tmp/stend-uchteno-v.XXXXXX); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/dom"
printf 'agenty:\n  - imya: stend-agent\n    namerenie:\n      dom: %s\n' "$T/dom" > "$T/agents.yaml"
printf 'содержимое\n' > "$T/f.sh"
S=$(sha256sum "$T/f.sh" | cut -c1-16)
ok=0; bad=0
proba() { # RU: имя · ждём_код · факт_код · подстрока · файл вывода · EN: name · expected · actual · substring · output
  local beda=""
  [ "$2" = "$3" ] || beda="код $3, ждали $2"
  [ -z "$4" ] || grep -qF -- "$4" "$5" || beda="${beda:+$beda; }нет «$4»"
  if [ -z "$beda" ]; then ok=$((ok+1)); echo "  ok   $1"; else bad=$((bad+1)); echo "  FAIL $1 — $beda"; sed 's/^/        /' "$5" | head -4; fi
}
# RU: paket — пакетная запись; $1 — её installed_check (пусто → без поля); $2 — derevo.files local
paket() {
  echo "  - id: paket"
  [ -n "$1" ] && echo "    installed_check: \"$1\""
  [ -n "$1" ] && echo "    version: \"$S\""
  printf '    derevo:\n      files:\n        - {local: "%s", remote: "f.sh"}\n' "$2"
}
zapis() { # RU: $1 — uchteno_v (пусто → без поля); $2 — лишняя version (пусто → нет); $3 — path (умолч. файл); $4 — source.address (умолч. файл)
  echo "  - id: odin-fajl"
  printf '    path: "%s"\n' "${3:-$T/f.sh}"   # B-N-1931: место берётся из path, не из source.address
  printf '    source:\n      type: local-dir\n      address: "%s"\n' "${4:-$T/f.sh}"
  [ -n "$1" ] && echo "    uchteno_v: $1"
  [ -n "$2" ] && echo "    version: \"$2\""
  return 0
}
gon() { # RU: имя случая · ждём · подстрока · реестр — файл $T/r.yaml (НЕ конвейером: в подоболочке счётчики терялись)
  mv "$T/r.yaml" "$T/$1.yaml"
  PLUGINS_REGISTRY="$T/$1.yaml" AGENTS_REGISTRY="$T/agents.yaml" "$AP" verify > "$T/$1.out" 2>&1; local k=$?
  proba "$1" "$2" "$k" "$3" "$T/$1.out"
}
IC="sha256sum $T/f.sh | cut -c1-16"
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket ""; } > "$T/r.yaml"; gon '1 uchteno_v на пакет' 0 'через запись paket'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis nety ""; } > "$T/r.yaml"; gon '2 uchteno_v на несуществующую' 1 'записи «nety» в реестре нет'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis "" ""; } > "$T/r.yaml"; gon '3 без uchteno_v и installed_check' 2 'НЕ ПРОВЕРЕНО'
{ echo plugins:; paket "$IC" "$T/drugoj.sh"; zapis paket ""; } > "$T/r.yaml"; gon '4 файла нет в derevo.files' 1 'не в derevo.files записи «paket»'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket "$S"; } > "$T/r.yaml"; gon '5 осталась version' 1 'двойной учёт'
{ echo plugins:; paket "" "$T/f.sh"; zapis paket ""; } > "$T/r.yaml"; gon '6 пакет без installed_check' 2 'сама без installed_check'
# RU: (7)/(8) свой fingerprint при uchteno_v (файл вне пакета) сверяется как прежде: совпал → 0, разошёлся → 1
printf 'настройка\n' > "$T/konf"; F=$(sha256sum "$T/konf" | cut -c1-16)
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket ""; echo "    fingerprint: \"$F\""; echo "    fingerprint_check: \"sha256sum $T/konf | cut -c1-16\""; } > "$T/r.yaml"; gon '7 свой fingerprint совпал' 0 'совпадает'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket ""; echo "    fingerprint: \"0000\""; echo "    fingerprint_check: \"sha256sum $T/konf | cut -c1-16\""; } > "$T/r.yaml"; gon '8 свой fingerprint разошёлся' 1 'РАСХОЖДЕНИЕ'
# RU: (9) LOW Вениамина: путь в installed_check пакета — целым токеном; «…/f.sh-old» не засчитывает «…/f.sh» → код 1
cp "$T/f.sh" "$T/f.sh-old"   # пакет сам проверяем (та же сумма), иначе его СЛЕПОТА (код 2) закроет случай
{ echo plugins:; paket "sha256sum $T/f.sh-old | cut -c1-16" "$T/f.sh"; zapis paket ""; } > "$T/r.yaml"; gon '9 путь лишь префиксом в installed_check' 1 'не в installed_check записи «paket»'
# RU: B-N-1931 (Аврора): место — первый абсолютный путь path, source.address не берётся (Михалычу приходилось переписывать source).
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket "" "$T/f.sh" "/usr/local (git-учёт, sbin/f.sh)"; } > "$T/r.yaml"; gon '10 место только в path, source чужой' 0 'через запись paket'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket "" "см. derevo.files" "$T/f.sh"; } > "$T/r.yaml"; gon '11 в path нет пути, source годен' 1 'в path записи нет абсолютного пути'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket "" "$T/f.sh, юниты /etc/systemd/system/stend-x.service" ""; } > "$T/r.yaml"; gon '12 path «файл, юниты …»' 0 'через запись paket'
{ echo plugins:; paket "$IC" "$T/f.sh"; zapis paket "" "юниты /etc/systemd/system/stend-x.service, файл $T/f.sh" ""; } > "$T/r.yaml"; gon '13 первым в path не файл (граница)' 1 'не в derevo.files записи «paket»'
echo "ИТОГ: ok=$ok fail=$bad"
[ "$bad" -eq 0 ]
