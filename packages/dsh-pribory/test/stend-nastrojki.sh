#!/bin/bash
# СТЕНД НАСТРОЙКИ модулей bin/ пакета dsh-pribory.
# Порядок значения: довод/переменная → файл DSH_PRIBORY_CONF (умолчание /etc/dsh-pribory/dsh-pribory.conf)
# → нейтральное умолчание; нет ничего — СЛЕПОТА или ОТКАЗ, код 2.
# Что проверяет:
#   А) разборщик файла на трёх языках (bash konf, python _konf, node konf): последнее вхождение, «#» — комментарий,
#      пробелы и таб по краям, значения с «:», «*», «{agent}», «;», «=», кириллицей; копии в модулях побайтно равны;
#   Б) пустая настройка: каждый модуль ниже отказывает с кодом 2 и называет свой ключ, ничего не делая;
#   В) ключ из файла доходит до модуля (dvojniki, ubrat, refresh-skill-links — всё во временном каталоге);
#   Г) « #» в значении — отказ с названием ключа у разборщика каждого языка и у 13 модулей; «#» без пробела — значение.
# Чего НЕ проверяет: kto-podnimal (карту «откуда» проверяет stend-kto-podnimal-bajty.sh, коды — stend-kontrakt-kodov.sh);
#   proba-v-katalog (у него нейтральное умолчание «/», отказа нет); polozhit, progon, pogasit, priznak-vzyatiya.mjs,
#   iskat-miny-oblasti.mjs, dsh-dump-kopiya — ключей не читают; боевые значения — сверка файла монтажа, не стенд пакета.
# Каналов тревоги у модулей нет; сверх того AGENT_ALERT_TOKEN_FILE/CHAT_FILE ведут в пустоту. Каталог модулей — STEND_BIN.
# EN: SETTINGS STAND for the bin/ modules of the dsh-pribory package.
#     Value order: argument/variable → the DSH_PRIBORY_CONF file (default /etc/dsh-pribory/dsh-pribory.conf) →
#     neutral default; nothing at all — BLINDNESS or REFUSAL, code 2.
#     What it checks:
#     A) the file parser in three languages (bash konf, python _konf, node konf): last occurrence, "#" is a
#     comment, spaces and tabs around, values with ":", "*", "{agent}", ";", "=", Cyrillic; the copies in the
#     modules are byte-identical;
#     B) empty settings: each module below refuses with code 2 and names its key, doing nothing;
#     C) a key from the file reaches the module (dvojniki, ubrat, refresh-skill-links — all in a temporary
#     directory);
#     D) " #" in a value — a refusal naming the key in each language's parser and in 13 modules; "#" without a
#     space — part of the value.
#     What it does NOT check: kto-podnimal (the "from where" map is checked by stend-kto-podnimal-bajty.sh, the
#     codes by stend-kontrakt-kodov.sh); proba-v-katalog (it has the neutral default "/", no refusal); polozhit,
#     progon, pogasit, priznak-vzyatiya.mjs, iskat-miny-oblasti.mjs, dsh-dump-kopiya — they read no keys;
#     production values — a check of the deployment file, not a package stand.
#     The modules have no alarm channels; on top of that AGENT_ALERT_TOKEN_FILE/CHAT_FILE lead nowhere. The
#     modules directory is STEND_BIN.
set -u
BIN="${STEND_BIN:-$(cd "$(dirname "$0")/../bin" && pwd)}"
T=$(mktemp -d /tmp/stend-nastrojki-pribory.XXXXXX); trap 'rm -rf "$T"' EXIT
VSEGO=0; OK=0
obrez() { python3 -c 'import sys; print(sys.stdin.read()[:200])'; }   # по знакам, не по байтам · EN: by characters, not bytes
proba() { VSEGO=$((VSEGO+1)); if [ "$2" = da ]; then OK=$((OK+1)); echo "  ✅ $1"; else echo "  ❌ $1 — $3"; fi; }

echo "== А) разборщик файла настройки"
printf '# комментарий: KLYUCH_A=не это\nKLYUCH_A=первое\nKLYUCH_B=/a/*/b.db:/c/*/d.db\nKLYUCH_C=/opt/{agent}/x\n#KLYUCH_D=закомментировано\nKLYUCH_AB=чужой ключ с общим началом\nKLYUCH_E=u1@x.service=текст (раз);u2|u3=текст два\n' > "$T/k.conf"
printf '  KLYUCH_A =\t последнее значение \t \n' >> "$T/k.conf"   # хвост пишется printf: редактор его срезал бы · EN: the tail is written by printf: an editor would strip it
proba "фикстура несёт хвостовые пробелы (контроль внесения)" "$(grep -q 'значение[[:space:]]\+$' "$T/k.conf" && echo da || echo net)" "хвоста нет — проба пробелов слепа"
ozhid=$'последнее значение\n/a/*/b.db:/c/*/d.db\n/opt/{agent}/x\n\nчужой ключ с общим началом\nu1@x.service=текст (раз);u2|u3=текст два'
KL="KLYUCH_A KLYUCH_B KLYUCH_C KLYUCH_D KLYUCH_AB KLYUCH_E"
konf_bash() { sed -n '/^DSH_PRIBORY_CONF=/p;/^konf() /p' "$1"; }
konf_py()   { sed -n "/^KONF=os.environ.get('DSH_PRIBORY_CONF'/,/^    return value or default/p" "$1"; }
konf_node() { grep -E '^const (KONF|konf) = ' "$1" | sed 's/fs\.readFileSync/readFileSync/'; }
raznyh=0; kopij=0
for f in "$BIN"/*; do
  for yaz in bash py node; do
    t=$(konf_$yaz "$f"); [ -n "$t" ] || continue
    kopij=$((kopij+1)); e=$(eval "echo \"\${etalon_$yaz:-}\"")
    if [ -z "$e" ]; then printf -v "etalon_$yaz" '%s' "$t"; printf -v "fajl_$yaz" '%s' "$f"
    elif [ "$t" != "$e" ]; then raznyh=$((raznyh+1)); echo "    расходится: $(basename "$f") ($yaz)"; fi
  done
done
proba "копий разборщика $kopij, расходятся $raznyh" "$([ "$kopij" -ge 3 ] && [ "$raznyh" = 0 ] && echo da || echo net)" "копии разошлись"
vyvod_bash=$(DSH_PRIBORY_CONF="$T/k.conf" bash -c "$(konf_bash "${fajl_bash:-/dev/null}")"'; for k in '"$KL"'; do konf $k ""; echo; done' 2>&1)
vyvod_py=$(DSH_PRIBORY_CONF="$T/k.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
for k in '$KL'.split(): print(_konf(k,''))" 2>&1)
vyvod_node=$(DSH_PRIBORY_CONF="$T/k.conf" node --input-type=module -e "import { readFileSync } from 'node:fs'
$(konf_node "${fajl_node:-/dev/null}")
for (const k of '$KL'.split(' ')) console.log(konf(k))" 2>&1)
for yaz in bash py node; do
  v=$(eval "echo \"\$vyvod_$yaz\"")
  proba "разборщик $yaz: последнее вхождение, комментарии, края, «:», «*», «{agent}», «;», «=»" \
    "$([ "$v" = "$ozhid" ] && echo da || echo net)" "получено: $(printf '%s' "$v" | tr '\n' '|' | obrez)"
done

echo "== Б) пустая настройка — отказ, код 2, назван ключ"
mkdir -p "$T/home"
otkaz() {  # otkaz <модуль> <ключ> <команда…> · EN: otkaz <module> <key> <command…>
  local m=$1 k=$2; shift 2
  local out kod; out=$(env -i PATH=/usr/bin:/bin:/usr/local/bin HOME="$T/home" DSH_PRIBORY_CONF="$T/net.conf" \
    AGENT_ALERT_TOKEN_FILE="$T/net" AGENT_ALERT_CHAT_FILE="$T/net" timeout 60 "$@" 2>&1); kod=$?
  proba "$m: код $kod, ключ $k" "$([ "$kod" = 2 ] && printf '%s' "$out" | grep -qF "$k" && echo da || echo net)" \
    "ожидался код 2 и ключ $k; вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"
}
otkaz agent-wake-cost       WAKE_HOME           python3 "$BIN/agent-wake-cost"
otkaz dvojniki              DVOJNIKI_DEREVYA    bash "$BIN/dvojniki"
otkaz istoriya-profilya     ISTORIYA_AGENT      bash "$BIN/istoriya-profilya"
otkaz kto-podnimal          KTO_SLUZHBA         bash "$BIN/kto-podnimal"
otkaz kto-pravil-fajl       KTO_PRAVIL_FAJL     bash "$BIN/kto-pravil-fajl"
otkaz obeimi-rukami         OBEIMI_RUKI         bash "$BIN/obeimi-rukami" true
otkaz obyortka-krasneet     OBYORTKA_KATALOG    bash "$BIN/obyortka-krasneet"
otkaz pokrytie-ozhidaniem   POKRYTIE_KOREN      node "$BIN/pokrytie-ozhidaniem-prob.mjs"
otkaz proba-obrezki         OBREZKA_IDIOMY      bash "$BIN/proba-obrezki.sh"
otkaz refresh-skill-links   SKILL_LINKS_SOURCES bash "$BIN/refresh-skill-links"
otkaz sekrety-po-znacheniyu FILTR_PUT           node "$BIN/sekrety-po-znacheniyu"
otkaz ubrat                 UBRAT_KORNI         bash "$BIN/ubrat"

echo "== В) ключ из файла доходит до модуля"
mkdir -p "$T/derevo" "$T/korni/x" "$T/a/s1" "$T/t"
printf -- '---\nname: s1\n---\n' > "$T/a/s1/SKILL.md"
printf 'DVOJNIKI_DEREVYA=%s\nUBRAT_KORNI=%s\nSKILL_LINKS_SOURCES=%s\n' "$T/derevo" "$T/korni" "$T/a" > "$T/da.conf"
zov() { env -i PATH=/usr/bin:/bin:/usr/local/bin HOME="$T/home" DSH_PRIBORY_CONF="$T/da.conf" timeout 60 "$@" 2>&1; }
out=$(zov bash "$BIN/dvojniki"); kod=$?
proba "dvojniki: деревья из файла ($T/derevo, код $kod)" "$(printf '%s' "$out" | grep -qF "деревья поиска: $T/derevo" && echo da || echo net)" "вывод: $(printf '%s' "$out" | head -4 | tr '\n' ' ' | obrez)"
out=$(zov bash "$BIN/ubrat" "$T/korni/x"); kod=$?
proba "ubrat: корень из файла — убран $T/korni/x (код $kod)" "$([ "$kod" = 0 ] && [ ! -e "$T/korni/x" ] && echo da || echo net)" "вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"
mkdir -p "$T/rbin"; printf '#!/bin/sh\necho "нет поля '"'"'navyki'"'"'"\nexit 3\n' > "$T/rbin/agent-registry"; chmod +x "$T/rbin/agent-registry"   # подставной реестр: «поля нет» — полный набор · EN: stand-in registry: "no field" — the full set
out=$(env -i PATH="$T/rbin:/usr/bin:/bin" HOME="$T/home" DSH_PRIBORY_CONF="$T/da.conf" SKILL_LINKS_TARGET="$T/t" timeout 60 bash "$BIN/refresh-skill-links" 2>&1); kod=$?
proba "refresh-skill-links: источник из файла — ссылка $T/t/s1 (код $kod)" "$([ -L "$T/t/s1" ] && echo da || echo net)" "вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"

echo "== Г) « #» в значении — громкий отказ с названием ключа; «#» без пробела — часть значения"
# Комментарий только с начала строки. Прежде «KEY=знач # пояснение» отдавал «знач # пояснение» во всех трёх разборщиках.
# EN: A comment only from the line start. Before, "KEY=val # note" returned "val # note" in all three parsers.
printf 'KLYUCH_A=значение # пояснение\nKLYUCH_H=a#b\n' > "$T/reshetka.conf"
proba "фикстура несёт « #» (контроль внесения)" "$(grep -qF ' # ' "$T/reshetka.conf" && echo da || echo net)" "в фикстуре нет « #» — проба слепа"
r_bash=$(DSH_PRIBORY_CONF="$T/reshetka.conf" bash -c "$(konf_bash "${fajl_bash:-/dev/null}")"'; v=$(konf KLYUCH_A ""); echo "kod=$? v=[$v]"; konf KLYUCH_H ""' 2>&1)
r_py=$(DSH_PRIBORY_CONF="$T/reshetka.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
print('v=['+_konf('KLYUCH_A','')+']')" 2>&1); k_py=$?
h_py=$(DSH_PRIBORY_CONF="$T/reshetka.conf" python3 -c "import os
$(konf_py "${fajl_py:-/dev/null}")
print(_konf('KLYUCH_H',''))" 2>&1)
r_node=$(DSH_PRIBORY_CONF="$T/reshetka.conf" node --input-type=module -e "import { readFileSync } from 'node:fs'
$(konf_node "${fajl_node:-/dev/null}")
console.log('v=[' + konf('KLYUCH_A') + ']')" 2>&1); k_node=$?
h_node=$(DSH_PRIBORY_CONF="$T/reshetka.conf" node --input-type=module -e "import { readFileSync } from 'node:fs'
$(konf_node "${fajl_node:-/dev/null}")
console.log(konf('KLYUCH_H'))" 2>&1)
ozh_otkaz() { printf '%s' "$1" | grep -qF 'ОТКАЗ' && printf '%s' "$1" | grep -qF 'KLYUCH_A' && ! printf '%s' "$1" | grep -qF 'пояснение]'; }
proba "разборщик bash: « #» — ОТКАЗ, код 2, назван ключ" "$(ozh_otkaz "$r_bash" && printf '%s' "$r_bash" | grep -qF 'kod=2 v=[]' && echo da || echo net)" "получено: $(printf '%s' "$r_bash" | tr '\n' '|' | obrez)"
proba "разборщик python: « #» — ОТКАЗ, код 2, назван ключ" "$(ozh_otkaz "$r_py" && [ "$k_py" = 2 ] && echo da || echo net)" "код $k_py; получено: $(printf '%s' "$r_py" | tr '\n' '|' | obrez)"
proba "разборщик node: « #» — ОТКАЗ, код 2, назван ключ" "$(ozh_otkaz "$r_node" && [ "$k_node" = 2 ] && echo da || echo net)" "код $k_node; получено: $(printf '%s' "$r_node" | tr '\n' '|' | obrez)"
proba "«#» без пробела — часть значения (bash, python, node: a#b)" "$([ "$(printf '%s' "$r_bash" | tail -1)" = 'a#b' ] && [ "$h_py" = 'a#b' ] && [ "$h_node" = 'a#b' ] && echo da || echo net)" "bash $(printf '%s' "$r_bash" | tail -1) · python $h_py · node $h_node"
# Модуль целиком: « #» в ключе, который он читает, — код 2, текст отказа и ключ в выводе; у bash — модуль выходит, а не идёт дальше с пустым.
# EN: The whole module: " #" in a key it reads — code 2, the refusal text and the key in the output; a bash module exits instead of going on with an empty value.
negodna() {  # negodna <модуль> <ключ> <команда…> · EN: negodna <module> <key> <command…>
  local m=$1 k=$2; shift 2
  printf '%s=/x # пояснение\n' "$k" > "$T/neg.conf"
  local out kod; out=$(env -i PATH=/usr/bin:/bin:/usr/local/bin HOME="$T/home" DSH_PRIBORY_CONF="$T/neg.conf" \
    AGENT_ALERT_TOKEN_FILE="$T/net" AGENT_ALERT_CHAT_FILE="$T/net" timeout 60 "$@" 2>&1); kod=$?
  proba "$m: « #» в $k → код $kod" "$([ "$kod" = 2 ] && printf '%s' "$out" | grep -qF 'содержит « #»' && printf '%s' "$out" | grep -qF "$k" && echo da || echo net)" \
    "ожидался код 2, «содержит « #»» и ключ $k; вывод: $(printf '%s' "$out" | tr '\n' ' ' | obrez)"
}
negodna agent-wake-cost       WAKE_HOME           python3 "$BIN/agent-wake-cost"
negodna dvojniki              DVOJNIKI_DEREVYA    bash "$BIN/dvojniki"
negodna istoriya-profilya     ISTORIYA_AGENT      bash "$BIN/istoriya-profilya"
negodna kto-podnimal          KTO_OTKUDA          bash "$BIN/kto-podnimal"
negodna kto-podnimal          KTO_SLUZHBA         bash "$BIN/kto-podnimal"
negodna kto-pravil-fajl       KTO_PRAVIL_FAJL     bash "$BIN/kto-pravil-fajl"
negodna obeimi-rukami         OBEIMI_RUKI         bash "$BIN/obeimi-rukami" true
negodna obyortka-krasneet     OBYORTKA_KATALOG    bash "$BIN/obyortka-krasneet"
negodna pokrytie-ozhidaniem   POKRYTIE_KOREN      node "$BIN/pokrytie-ozhidaniem-prob.mjs"
negodna proba-obrezki         OBREZKA_IDIOMY      bash "$BIN/proba-obrezki.sh"
negodna proba-v-katalog       PROBA_BEZOPASNYJ    bash "$BIN/proba-v-katalog" "$T/kuda" true
negodna refresh-skill-links   SKILL_LINKS_SOURCES bash "$BIN/refresh-skill-links"
negodna sekrety-po-znacheniyu FILTR_PUT           node "$BIN/sekrety-po-znacheniyu"
negodna ubrat                 UBRAT_KORNI         bash "$BIN/ubrat"

echo "ИТОГ: $OK из $VSEGO"
[ "$OK" = "$VSEGO" ]
