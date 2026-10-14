#!/bin/bash
# СТЕНД НАСТРОЙКИ модулей bin/ пакета dsh-pamyat-storozha.
# Порядок значения: переменная → файл DSH_PAMYAT_STOROZHA_CONF (умолчание /etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf)
# → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
# Что проверяет:
#   А) разборщик файла на трёх языках (bash konf, python _konf, node konf): последнее вхождение, «#» — комментарий,
#      пробелы вокруг «=», значения с «:», «*», «{agent}», кириллицей и пробелами; копии в модулях побайтно равны;
#   Б) пустая настройка: каждый модуль ниже отказывает с кодом 2 и называет свой ключ;
#   В) ключ из файла доходит до модуля: отказ меняется с «не задан» на следующую по ходу проверку;
#   Г) « #» в значении — отказ с названием ключа у разборщика каждого языка и у семи модулей; «#» без пробела — значение.
# Чего НЕ проверяет: kompakt-priemka (зовёт реестр агентов по абсолютному пути — подставить нечем);
#   rasshcheplenie-otmeny-watch (ключей не читает); боевые значения — это сверка файла монтажа, не стенд пакета.
# Каналы тревоги подменены у каждого модуля (OKW_ALERT, RASSHCH_ALERT, RUBEZH_ALERT); сверх того AGENT_ALERT_TOKEN_FILE и
# AGENT_ALERT_CHAT_FILE ведут в пустоту — случайный вызов живого agent-alert не доставит письма. Каталог модулей — STEND_BIN.
# EN: SETTINGS STAND for the bin/ modules of the dsh-pamyat-storozha package.
#     Value order: variable → the DSH_PAMYAT_STOROZHA_CONF file (default
#     /etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf) → neutral default; nothing at all — BLINDNESS, code 2.
#     What it checks:
#     A) the file parser in three languages (bash konf, python _konf, node konf): last occurrence, "#" is a
#     comment, spaces around "=", values with ":", "*", "{agent}", Cyrillic and spaces; the copies in the
#     modules are byte-identical;
#     B) empty settings: each module below refuses with code 2 and names its key;
#     C) a key from the file reaches the module: the refusal changes from "not set" to the next check along the
#     way;
#     D) " #" in a value — a refusal naming the key in each language's parser and in seven modules; "#" without a
#     space — part of the value.
#     What it does NOT check: kompakt-priemka (calls the agent registry by an absolute path — nothing to
#     substitute); rasshcheplenie-otmeny-watch (reads no keys); production values — that is a check of the
#     deployment file, not a package stand.
#     Alarm channels are substituted for each module (OKW_ALERT, RASSHCH_ALERT, RUBEZH_ALERT); on top of that
#     AGENT_ALERT_TOKEN_FILE and AGENT_ALERT_CHAT_FILE lead nowhere — an accidental call of the live agent-alert
#     will not deliver a letter. The modules directory is STEND_BIN.
set -u
BIN="${STEND_BIN:-$(cd "$(dirname "$0")/../bin" && pwd)}"
T=$(mktemp -d /tmp/stend-nastrojki.XXXXXX); trap 'rm -rf "$T"' EXIT
VSEGO=0; OK=0; SLEPO=0
obrez() { python3 -c 'import sys; print(sys.stdin.read()[:200])'; }   # по знакам, не по байтам: cut режет кириллицу · EN: by characters, not bytes: cut cuts Cyrillic
proba() {  # proba <имя> <да|нет> <пояснение> · EN: proba <name> <yes|no> <explanation>
  VSEGO=$((VSEGO+1))
  if [ "$2" = da ]; then OK=$((OK+1)); echo "  ✅ $1"; else echo "  ❌ $1 — $3"; fi
}

echo "== А) разборщик файла настройки"
cat > "$T/k.conf" <<'KONF'
# комментарий: KLYUCH_A=не это
KLYUCH_A=первое
KLYUCH_B=/a/*/b.db:/c/*/d.db
KLYUCH_C=/var/lib/shlyuz-{agent}
#KLYUCH_D=закомментировано
KLYUCH_AB=чужой ключ с общим началом
KONF
# Последнее вхождение KLYUCH_A — с пробелами и табом по краям; пишется printf, чтобы хвост не срезал редактор.
# EN: The last occurrence of KLYUCH_A — with spaces and a tab around it; written with printf so that an editor
#     does not strip the tail.
printf '  KLYUCH_A =\t последнее значение \t \n' >> "$T/k.conf"
ozhid=$'последнее значение\n/a/*/b.db:/c/*/d.db\n/var/lib/shlyuz-{agent}\n\nчужой ключ с общим началом'
# Копии разборщика: одна на язык, остальные обязаны совпасть с ней побайтно.
# EN: Parser copies: one per language, the others must match it byte for byte.
proba "фикстура несёт хвостовые пробелы (контроль внесения)" "$(grep -q 'значение[[:space:]]\+$' "$T/k.conf" && echo da || echo net)" "хвоста в фикстуре нет — проба пробелов слепа"
konf_bash() { sed -n '/^DSH_PAMYAT_STOROZHA_CONF=/p;/^konf() /p' "$1"; }
konf_py()   { sed -n "/^KONF=os.environ.get('DSH_PAMYAT_STOROZHA_CONF'/,/^    return value or default/p" "$1"; }
konf_node() { grep -E '^const (KONF|konf) = ' "$1" | sed 's/fs\.readFileSync/readFileSync/'; }   # «fs.» — только способ импорта · EN: "fs." — only the import style
etalon=""; raznyh=0; kopij=0
for f in "$BIN"/*; do
  for yaz in bash py node; do
    t=$(konf_$yaz "$f"); [ -n "$t" ] || continue
    kopij=$((kopij+1)); e=$(eval "echo \"\${etalon_$yaz:-}\"")
    if [ -z "$e" ]; then printf -v "etalon_$yaz" '%s' "$t"; printf -v "fajl_$yaz" '%s' "$f"
    elif [ "$t" != "$e" ]; then raznyh=$((raznyh+1)); echo "    расходится: $(basename "$f") ($yaz)"; fi
  done
done
proba "копий разборщика $kopij, расходятся $raznyh" "$([ "$kopij" -ge 3 ] && [ "$raznyh" = 0 ] && echo da || echo net)" "копии разошлись"
vyvod_bash=$(DSH_PAMYAT_STOROZHA_CONF="$T/k.conf" bash -c "$(konf_bash "${fajl_bash:-/dev/null}")"'; for k in KLYUCH_A KLYUCH_B KLYUCH_C KLYUCH_D KLYUCH_AB; do konf $k ""; echo; done' 2>&1)
vyvod_py=$(DSH_PAMYAT_STOROZHA_CONF="$T/k.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
for k in ['KLYUCH_A','KLYUCH_B','KLYUCH_C','KLYUCH_D','KLYUCH_AB']: print(_konf(k,''))" 2>&1)
vyvod_node=$(DSH_PAMYAT_STOROZHA_CONF="$T/k.conf" node --input-type=module -e "import { readFileSync } from 'node:fs'
$(konf_node "${fajl_node:-/dev/null}")
for (const k of ['KLYUCH_A','KLYUCH_B','KLYUCH_C','KLYUCH_D','KLYUCH_AB']) console.log(konf(k))" 2>&1)
for yaz in bash py node; do
  v=$(eval "echo \"\$vyvod_$yaz\"")
  proba "разборщик $yaz: последнее вхождение, комментарии, «:», «*», «{agent}», кириллица" \
    "$([ "$v" = "$ozhid" ] && echo da || echo net)" "получено: $(printf '%s' "$v" | tr '\n' '|' | obrez)"
done
umolch=$(DSH_PAMYAT_STOROZHA_CONF="$T/net.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
print(_konf('KLYUCH_A','умолчание'))" 2>&1)
proba "нет файла — нейтральное умолчание (python)" "$([ "$umolch" = умолчание ] && echo da || echo net)" "получено: $umolch"

echo "== Б) пустая настройка — отказ, код 2, назван ключ"
export DSH_PAMYAT_STOROZHA_CONF="$T/net.conf"
mkdir -p "$T/home"; printf '# повторяет действующую запись: 1\n# класс: urok\n\nтекст\n' > "$T/povtoryaet-1.txt"; : > "$T/baza.db"
cat > "$T/alert" <<ALERT
#!/bin/bash
printf '%s\n' "\$*" >> "$T/alert.log"
ALERT
chmod +x "$T/alert"
PODMENA="RUBEZH_ALERT=$T/alert OKW_ALERT=$T/alert RASSHCH_ALERT=$T/alert AGENT_ALERT_TOKEN_FILE=$T/net AGENT_ALERT_CHAT_FILE=$T/net"
otkaz() {  # otkaz <модуль> <ключ> <команда…> · EN: otkaz <module> <key> <command…>
  # Ожидаемый код — OZHID (умолчание 2); omega-kopiya-watch при слепоте настройки выходит кодом 3: коды 1 и 2 юнит считает успехом.
  # EN: The expected code is OZHID (default 2); omega-kopiya-watch exits with code 3 on settings blindness: the unit counts codes 1 and 2 as success.
  local m=$1 k=$2 oz=${OZHID:-2}; shift 2
  local out kod; out=$(env -i DSH_PROBA=1 PATH=/usr/bin:/bin:/usr/local/bin HOME="$T/home" DSH_PAMYAT_STOROZHA_CONF="$T/net.conf" \
    $PODMENA timeout 60 "$@" 2>&1); kod=$?
  proba "$m: код $kod, ключ $k" "$([ "$kod" = "$oz" ] && printf '%s' "$out" | grep -qF "$k" && echo da || echo net)" \
    "ожидался код $oz и ключ $k; вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"
}
otkaz pamyat-vernut-povtor    PAMYAT_CORE         "$BIN/pamyat-vernut-povtor" "$T/povtoryaet-1.txt" "$T/baza.db"
otkaz chitatel-otklonennyh    OTKLONENNYE_KATALOG "$BIN/chitatel-otklonennyh.mjs"
if zstd --version >/dev/null 2>&1; then
  otkaz sverka-s-istochnikom PAMYAT_BAZA "$BIN/sverka-s-istochnikom.mjs"
  otkaz proverka-opory DSH_SESSII "$BIN/proverka-opory.mjs"
else
  for m in sverka-s-istochnikom proverka-opory; do
    VSEGO=$((VSEGO+1)); SLEPO=$((SLEPO+1))
    echo "  СЛЕПОТА: $m — zstd не доступен; проверка пустой настройки не проведена"
  done
fi
otkaz proverka-cepi-boem      CEP_UNIT            "$BIN/proverka-cepi-boem.mjs"
otkaz proba-sleda-podyoma     PAMYAT_CORE         node "$BIN/proba-sleda-podyoma.mjs"   # без шебанга, права 644 — как в бою · EN: no shebang, mode 644 — as in production
otkaz sostav-nabora           DSH_PLUGINS_KLON    "$BIN/sostav-nabora.mjs"
otkaz rubezh-otnoshenij-watch PAMYAT_BAZA         "$BIN/rubezh-otnoshenij-watch"
otkaz stendy-vseh-paketov     DSH_PLUGINS_KLON    "$BIN/stendy-vseh-paketov.sh"
otkaz session-agent-preset    AGENT_REGISTRY      python3 "$BIN/session-agent-preset-watch"
otkaz session-writer-watch    AGENT_REGISTRY      python3 "$BIN/session-writer-watch.py" --check
OZHID=3 otkaz omega-kopiya-watch OKW_STATE        python3 "$BIN/omega-kopiya-watch"
proba "слепота rubezh ушла в подменённый канал, не в живой" "$(grep -qF 'PAMYAT_BAZA' "$T/alert.log" 2>/dev/null && echo da || echo net)" "в подменённом канале пусто"

echo "== В) ключ из файла доходит до модуля"
mkdir -p "$T/klon/packages"
printf 'DSH_PLUGINS_KLON=%s\n' "$T/klon" > "$T/da.conf"
out=$(env -i DSH_PROBA=1 PATH=/usr/bin:/bin HOME="$T/home" DSH_PAMYAT_STOROZHA_CONF="$T/da.conf" $PODMENA timeout 60 "$BIN/stendy-vseh-paketov.sh" 2>&1); kod=$?
proba "stendy-vseh-paketov: ключ прочитан (обход каталога $T/klon/packages, код $kod)" \
  "$(printf '%s' "$out" | grep -qF 'не задан' && echo net || { printf '%s' "$out" | grep -qF 'обойдено' && echo da || echo net; })" \
  "вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"
printf 'OKW_STATE=%s\n' "$T/state/otdano.json" > "$T/okw.conf"
out=$(env -i DSH_PROBA=1 PATH=/usr/bin:/bin HOME="$T/home" DSH_PAMYAT_STOROZHA_CONF="$T/okw.conf" OKW_OMEGA_DB="$T/net-omega.db" \
  $PODMENA OKW_PAMYAT="$T/net/*/pamyat.db" OKW_CORE="$T/net-yadra" OKW_PRAVKI="$T/net-pravki" \
  OKW_SYSTEMCTL=/bin/false OKW_JOURNALCTL=/bin/false timeout 60 python3 "$BIN/omega-kopiya-watch" 2>&1); kod=$?
proba "omega-kopiya-watch: OKW_STATE из файла (состояние записано в $T/state, код $kod)" \
  "$([ -f "$T/state/otdano.json" ] && echo da || echo net)" "файла состояния нет; вывод: $(printf '%s' "$out" | tail -3 | tr '\n' ' ' | obrez)"

echo "== Г) « #» в значении — громкий отказ с названием ключа; «#» без пробела — часть значения"
# Комментарий только с начала строки. Прежде «KEY=знач # пояснение» отдавал «знач # пояснение» во всех трёх разборщиках.
# EN: A comment only from the line start. Before, "KEY=val # note" returned "val # note" in all three parsers.
printf 'KLYUCH_A=значение # пояснение\nKLYUCH_H=a#b\n' > "$T/reshetka.conf"
proba "фикстура несёт « #» (контроль внесения)" "$(grep -qF ' # ' "$T/reshetka.conf" && echo da || echo net)" "в фикстуре нет « #» — проба слепа"
r_bash=$(DSH_PAMYAT_STOROZHA_CONF="$T/reshetka.conf" bash -c "$(konf_bash "${fajl_bash:-/dev/null}")"'; v=$(konf KLYUCH_A ""); echo "kod=$? v=[$v]"; konf KLYUCH_H ""' 2>&1)
r_py=$(DSH_PAMYAT_STOROZHA_CONF="$T/reshetka.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
print('v=['+_konf('KLYUCH_A','')+']')" 2>&1); k_py=$?
h_py=$(DSH_PAMYAT_STOROZHA_CONF="$T/reshetka.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
print(_konf('KLYUCH_H',''))" 2>&1)
r_node=$(DSH_PAMYAT_STOROZHA_CONF="$T/reshetka.conf" node --input-type=module -e "import { readFileSync } from 'node:fs'
$(konf_node "${fajl_node:-/dev/null}")
console.log('v=[' + konf('KLYUCH_A') + ']')" 2>&1); k_node=$?
h_node=$(DSH_PAMYAT_STOROZHA_CONF="$T/reshetka.conf" node --input-type=module -e "import { readFileSync } from 'node:fs'
$(konf_node "${fajl_node:-/dev/null}")
console.log(konf('KLYUCH_H'))" 2>&1)
ozh_otkaz() { printf '%s' "$1" | grep -qF 'ОТКАЗ' && printf '%s' "$1" | grep -qF 'KLYUCH_A' && ! printf '%s' "$1" | grep -qF 'пояснение]'; }
proba "разборщик bash: « #» — ОТКАЗ, код 2, назван ключ" "$(ozh_otkaz "$r_bash" && printf '%s' "$r_bash" | grep -qF 'kod=2 v=[]' && echo da || echo net)" "получено: $(printf '%s' "$r_bash" | tr '\n' '|' | obrez)"
proba "разборщик python: « #» — ОТКАЗ, код 3, назван ключ" "$(ozh_otkaz "$r_py" && [ "$k_py" = 3 ] && echo da || echo net)" "код $k_py; получено: $(printf '%s' "$r_py" | tr '\n' '|' | obrez)"
proba "разборщик node: « #» — ОТКАЗ, код 2, назван ключ" "$(ozh_otkaz "$r_node" && [ "$k_node" = 2 ] && echo da || echo net)" "код $k_node; получено: $(printf '%s' "$r_node" | tr '\n' '|' | obrez)"
proba "«#» без пробела — часть значения (bash, python, node: a#b)" "$([ "$(printf '%s' "$r_bash" | tail -1)" = 'a#b' ] && [ "$h_py" = 'a#b' ] && [ "$h_node" = 'a#b' ] && echo da || echo net)" "bash $(printf '%s' "$r_bash" | tail -1) · python $h_py · node $h_node"
# Модуль целиком: строка с « #» в ключе, который модуль читает, — его код провала и ключ в выводе.
# EN: The whole module: a line with " #" in a key the module reads — its failure code and the key in the output.
negodna() {  # negodna <модуль> <ключ> <код> <команда…> · EN: negodna <module> <key> <code> <command…>
  local m=$1 k=$2 oz=$3; shift 3
  printf '%s=/x # пояснение\n' "$k" > "$T/neg.conf"
  local out kod; out=$(env -i DSH_PROBA=1 PATH=/usr/bin:/bin:/usr/local/bin HOME="$T/home" DSH_PAMYAT_STOROZHA_CONF="$T/neg.conf" \
    $PODMENA timeout 60 "$@" 2>&1); kod=$?
  proba "$m: « #» в $k → код $kod" "$([ "$kod" = "$oz" ] && printf '%s' "$out" | grep -qF 'содержит « #»' && printf '%s' "$out" | grep -qF "$k" && echo da || echo net)" \
    "ожидался код $oz, «содержит « #»» и ключ $k; вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"
}
: > "$T/alert.log"
negodna rubezh-otnoshenij-watch PAMYAT_BAZA      2 "$BIN/rubezh-otnoshenij-watch"
proba "rubezh: отказ « #» ушёл в подменённый канал" "$(grep -qF 'содержит « #»' "$T/alert.log" 2>/dev/null && echo da || echo net)" "в подменённом канале пусто"
negodna stendy-vseh-paketov     DSH_PLUGINS_KLON 2 "$BIN/stendy-vseh-paketov.sh"
negodna omega-kopiya-watch      OKW_PAMYAT       3 python3 "$BIN/omega-kopiya-watch"
negodna session-writer-watch    AGENT_REGISTRY   3 python3 "$BIN/session-writer-watch.py" --check
negodna session-agent-preset    AGENT_REGISTRY   3 python3 "$BIN/session-agent-preset-watch"
negodna proverka-opory          DSH_SESSII       2 "$BIN/proverka-opory.mjs"
negodna chitatel-otklonennyh    OTKLONENNYE_KATALOG 2 "$BIN/chitatel-otklonennyh.mjs"

echo "ИТОГ: $OK из $VSEGO · слепых $SLEPO"
[ "$((OK+SLEPO))" = "$VSEGO" ] || exit 1
[ "$SLEPO" -eq 0 ] || exit 2
exit 0
