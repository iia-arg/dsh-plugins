#!/bin/bash
# Стенд `agent-registry sobrat --kuda`: сборка НИКОГДА не пишет в бой (B-H-081 Ш3-2, Искра 26.09.2026; КРАСНОЕ Вениамина 19:29Z).
# Предмет — INSTR (по умолчанию бой /usr/local/bin/agent-registry); реестр — боевой (нужен mashina.kompakt_obshchee, Ш3-1).
# Случаи Вениамина: «/» (пустая переменная: --kuda "$DIR/"), «/var/..», каталог со ссылкой etc → ПОДСТАВНОЙ корень;
# плюс исправный — новый каталог получает ВСЕ файлы сборки (число — из реестра, см. n_ozhid), вне него ничего.
# 🔴 ПОД ROOT НЕ ИДЁТ (код 2): под iskra боевой /etc непишем — даже порча предмета не дотянется до боя; ловушка ведёт
#   в подставной корень во временном каталоге, а не в /etc.
# ⚠️ НЕ ЛОВИТ: гонку «ссылку подложили между проверкой и открытием» (O_NOFOLLOW держит только последнее звено).
# Коды: 0 — всё зелёное, 1 — расхождение, 2 — слепота (нет предмета, под root, сборка не собралась).
set -u
INSTR="${INSTR:-/usr/local/bin/agent-registry}"
[ "$(id -u)" = 0 ] && { echo "СЛЕПОТА: под root стенд не идёт — порча предмета дотянулась бы до боя"; exit 2; }
[ -x "$INSTR" ] || { echo "СЛЕПОТА: предмета нет: $INSTR"; exit 2; }
T=$(mktemp -d /tmp/stend-sobrat-kuda.XXXXXX); trap 'rm -rf "$T"' EXIT INT TERM
mkdir -p "$T/lovushka" "$T/podstavnoj-etc"; ln -s "$T/podstavnoj-etc" "$T/lovushka/etc"
ok=0; bad=0
sud() { if [ "$2" = 1 ]; then ok=$((ok+1)); echo "  ok    $1"; else bad=$((bad+1)); echo "  FAIL  $1 — $3"; fi; }
faylov() { find "$1" -type f 2>/dev/null | wc -l; }

"$INSTR" sobrat --kuda / >"$T/o1" 2>&1; k=$?
sud "S1 --kuda / → отказ 3" "$([ $k = 3 ] && grep -q 'обязан быть НОВЫМ' "$T/o1" && echo 1)" "код $k: $(tail -1 "$T/o1" | cut -c1-120)"
"$INSTR" sobrat --kuda /var/.. >"$T/o2" 2>&1; k=$?
sud "S2 --kuda /var/.. → отказ 3" "$([ $k = 3 ] && grep -q 'обязан быть НОВЫМ' "$T/o2" && echo 1)" "код $k: $(tail -1 "$T/o2" | cut -c1-120)"
"$INSTR" sobrat --kuda "$T/lovushka" >"$T/o3" 2>&1; k=$?
n3=$(faylov "$T/podstavnoj-etc")
sud "S3 каталог со ссылкой etc → подставной корень: код ≠ 0 и в подставном корне 0 файлов" "$([ $k != 0 ] && [ "$n3" = 0 ] && echo 1)" "код $k, файлов в подставном корне $n3: $(tail -1 "$T/o3" | cut -c1-120)"
"$INSTR" sobrat --kuda "$T/novyj" >"$T/o4" 2>&1; k=$?
n4=$(faylov "$T/novyj"); vne=$(( $(faylov "$T") - n4 - 4 ))   # 4 — o1..o4 самого стенда
# B-H-081 F Ф2 (Заря 29.09): было «15» литералом — покраснело 29.09 11:40Z от +H spartak (A-N-1158), станет 32 с A/B.
# Число — из реестра по составу сборки: D на kompakt_agent + H на пользователя с agent_tell + J + 2 (A/B) на генерируемого.
# B-N-1413: + M на каждого агента семейства codex (config.toml); список семейства берётся из F, не литерал 4.
# ⚠️ НОВЫЙ РОД СБОРКИ (новое производное в sobrat) → поправить n_ozhid: иначе S4 покраснеет — громко, не молча (Искра 29.09).
# B-H-081 Ш6 (30.09, Аврора): + C (/etc/claude-oauth/instance-<имя>.env) — по одному на агента семейств sdk-claude/codex ⇒ (ab+1).
# B-N-738 (Аврора 29.09): при mashina.raskladka_obshchee.dsh_pokolenie "0.2" файла B нет (строки B вложены в A) — 1 на генерируемого.
n_ozhid=$(python3 -B -c 'import os,yaml; Y=yaml.safe_load(open(os.environ.get("AGENTS_REGISTRY","/etc/agent-registry/agents.yaml"))); N=[a["namerenie"] for a in Y["agenty"]]; ab=1 if ((Y.get("mashina") or {}).get("raskladka_obshchee") or {}).get("dsh_pokolenie")=="0.2" else 2; print(sum(1 for n in N if n.get("kompakt_agent"))+len({n["polzovatel"] for n in N if (n.get("kanal") or {}).get("agent_tell")})+1+(ab+1)*sum(1 for n in N if (n.get("raskladka") or {}).get("semejstvo") in ("sdk-claude","codex"))+sum(1 for n in N if (n.get("raskladka") or {}).get("semejstvo")=="codex"))' 2>/dev/null)
sud "S4 новый каталог → код 0, ${n_ozhid:-?} файлов внутри (из реестра), вне — 0" "$([ -n "$n_ozhid" ] && [ $k = 0 ] && [ "$n4" = "$n_ozhid" ] && [ "$vne" = 0 ] && [ "$(faylov "$T/podstavnoj-etc")" = 0 ] && echo 1)" "код $k, внутри $n4, вне $vne: $(tail -1 "$T/o4" | cut -c1-120)"
"$INSTR" sobrat --kuda "" >"$T/o5" 2>&1; k=$?
sud "S5 --kuda \"\" (пустая переменная целиком) → отказ 3" "$([ $k = 3 ] && echo 1)" "код $k"
# S6 (low Вениамина 19:45Z): новый путь, чей существующий предок — ссылка на НАСТОЯЩИЙ /etc: проверка обязана быть ДО
#   создания каталогов (отказ 3 «ничего не создано»). Прежний порядок под iskra падал PermissionError (код 1) на mkdir в /etc,
#   под root — оставлял бы пустой каталог в бою. Ссылка только читается (realpath), в /etc ничего не пишется.
mkdir -p "$T/ssylka"; ln -s /etc "$T/ssylka/etc"
"$INSTR" sobrat --kuda "$T/ssylka/etc/nov-stend-$$/pod" >"$T/o6" 2>&1; k=$?
sud "S6 новый путь через ссылку на /etc → отказ 3 ДО mkdir" "$([ $k = 3 ] && grep -q 'ничего не создано' "$T/o6" && [ ! -e "/etc/nov-stend-$$" ] && echo 1)" "код $k: $(tail -1 "$T/o6" | cut -c1-120)"
# S7 (low Вениамина 20:02Z): «..» после ссылки — abspath сворачивал его лексически и пропускал путь в /etc.
ln -s /etc "$T/s7"
"$INSTR" sobrat --kuda "$T/s7/../etc/nov-stend7-$$/pod" >"$T/o7" 2>&1; k=$?
sud "S7 «ссылка/../etc/nov/pod» (ссылка → /etc) → отказ 3 ДО mkdir" "$([ $k = 3 ] && grep -q 'ничего не создано' "$T/o7" && [ ! -e "/etc/nov-stend7-$$" ] && echo 1)" "код $k: $(tail -1 "$T/o7" | cut -c1-120)"
# S8 (B-N-1105, находка Зари): у двух агентов один kompakt_agent — sobrat отказывает ДО любой записи (прежде: второй O_EXCL
#   падал трассой, первые файлы уже лежали), verify называет повтор строкой. Реестр — копия боевого (или AGENTS_REGISTRY)
#   с подставой: второе встреченное kompakt_agent получает значение первого; внесение подставы проверяется до суда.
REG="${AGENTS_REGISTRY:-/etc/agent-registry/agents.yaml}"
v1=$(grep -m1 -E '^ +kompakt_agent: ' "$REG" | sed -E 's/^ +kompakt_agent: ([^ ]+).*/\1/')
n2=$(grep -n -E '^ +kompakt_agent: ' "$REG" | sed -n 2p | cut -d: -f1)
if [ -n "$v1" ] && [ -n "$n2" ]; then
  sed -E "${n2}s/(kompakt_agent: )[^ ]+/\1${v1}/" "$REG" > "$T/povtor.yaml"
  vneseno=$(grep -c -E "^ +kompakt_agent: ${v1}( |$)" "$T/povtor.yaml")
else vneseno=0; fi
if [ "$vneseno" -ge 2 ]; then
  AGENTS_REGISTRY="$T/povtor.yaml" "$INSTR" sobrat --kuda "$T/s8" >"$T/o8" 2>&1; k=$?
  AGENTS_REGISTRY="$T/povtor.yaml" "$INSTR" verify >"$T/o8v" 2>&1; kv=$?
  sud "S8 повтор kompakt_agent ${v1} → sobrat отказ 3, файлов 0, каталог не создан; verify строка «повторяется»" \
    "$([ $k = 3 ] && [ ! -e "$T/s8" ] && grep -q 'повторяется' "$T/o8" && [ $kv = 1 ] && grep -q 'kompakt_agent.*повторяется' "$T/o8v" && echo 1)" \
    "sobrat код $k, каталог $([ -e "$T/s8" ] && echo "создан, файлов $(faylov "$T/s8")" || echo нет); verify код $kv, строк «повторяется» $(grep -c 'повторяется' "$T/o8v")"
else
  sud "S8 повтор kompakt_agent" 0 "подстава не внесена (в $REG меньше двух kompakt_agent) — проба ничего не проверила"
fi
rm -f "$T/o5" "$T/o6" "$T/o7" "$T/o8" "$T/o8v" "$T/povtor.yaml"
echo "ИТОГ: ok=$ok FAIL=$bad"
[ $bad = 0 ] && exit 0 || exit 1
