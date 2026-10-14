#!/usr/bin/env bash
# Приёмка agent-limits — читателя системных пределов агентов.
#
# Гоняет УСТАНОВЛЕННЫЙ /usr/local/bin/agent-limits, а не копию: проверять надо то,
# что исполняется. Данные подставные, каталог временный — боевой /etc/agent-limits
# не трогается ни на одном шаге.
#
# Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ:
#   * не проверяет, ДЕЙСТВУЮТ ли пределы: потребители читают их сами, это их приёмка;
#   * не судит, верны ли значения в боевых файлах — только форму и разбор;
#   * не проверяет права на боевой каталог (это отдельная проба чужой рукой);
#   * не проверяет поведение при десяти агентах — фикстур два.
set -uo pipefail
export LC_ALL=C.UTF-8

INSTR="${LIMITS_BIN:-/usr/local/bin/agent-limits}"
ok=0; bad=0; slep=0
sud(){
  case "$1" in
    ok)   ok=$((ok+1));   printf '  ok    %-46s %s\n' "$2" "${3-}" ;;
    fail) bad=$((bad+1)); printf '  FAIL  %-46s %s\n' "$2" "${3-}" ;;
    *)    slep=$((slep+1)); printf '  СЛЕПОТА %-44s %s\n' "$2" "${3-}" ;;
  esac
}
[ -x "$INSTR" ] || { echo "СЛЕПОТА: нет исполняемого $INSTR"; exit 2; }

D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
export AGENT_LIMITS_DIR="$D"

cat > "$D/obshchee.yml" <<'EOF'
predely:
  maxPerDayCount: 48
  maxTokensPerDay: 0
politiki:
  dayZone: UTC
zamer:
  kvantTokenovNaHod: 10000000
EOF
cat > "$D/proba.yml" <<'EOF'
perehod_zavershyon: false
predely:
  maxPerDayCount: 12
  maxRoundsCount: 5
politiki:
  humanKinds: [user, a2a]
prava:
  goalUsers: [1]
EOF

echo "── чтение и источник значения"
V=$("$INSTR" pokazhi proba 2>/dev/null)
grep -q 'maxPerDayCount .*= 12 .*proba.yml' <<<"$V" \
  && sud ok 'значение агента перебивает общее' || sud fail 'значение агента перебивает общее' "$(grep maxPerDayCount <<<"$V")"
grep -q 'dayZone .*obshchee.yml' <<<"$V" \
  && sud ok 'незаданное берётся из общего файла' || sud fail 'незаданное берётся из общего файла'
grep -q 'minIntervalSeconds .*умолчание кода' <<<"$V" \
  && sud ok 'нет ни там ни там — умолчание кода названо' || sud fail 'умолчание кода названо'

echo "── состояние перехода"
grep -q 'ПЕРЕХОД НЕ ЗАВЕРШЁН' <<<"$V" \
  && sud ok 'незавершённый переход объявлен' || sud fail 'незавершённый переход объявлен'
sed -i 's/perehod_zavershyon: false/perehod_zavershyon: true/' "$D/proba.yml"
"$INSTR" pokazhi proba 2>/dev/null | grep -q 'ПЕРЕХОД НЕ ЗАВЕРШЁН' \
  && sud fail 'после завершения перехода строка исчезает' || sud ok 'после завершения перехода строка исчезает'
sed -i 's/perehod_zavershyon: true/perehod_zavershyon: false/' "$D/proba.yml"

echo "── одно значение и отказ"
"$INSTR" pokazhi proba maxRoundsCount >/dev/null 2>&1 \
  && sud ok 'существующий параметр — код 0' || sud fail 'существующий параметр — код 0'
OUT=$("$INSTR" pokazhi proba xyzzy 2>/dev/null); K=$?
[ "$K" = 3 ] && sud ok 'несуществующий параметр — код 3' || sud fail 'несуществующий параметр — код 3' "код=$K"
[ -z "$OUT" ] && sud ok 'при отказе НОЛЬ байт на stdout' || sud fail 'при отказе ноль байт на stdout' "$OUT"

echo "── битый файл"
printf 'predely:\n  a: [1,\n' > "$D/bityj.yml"
"$INSTR" pokazhi bityj >/tmp/.al_o 2>/dev/null; K=$?
[ "$K" = 2 ] && sud ok 'битый YAML — код 2, не тихое умолчание' || sud fail 'битый YAML — код 2' "код=$K"
[ ! -s /tmp/.al_o ] && sud ok 'при битом файле stdout пуст' || sud fail 'при битом файле stdout пуст'
P=$("$INSTR" proverit 2>/dev/null); K=$?
grep -q 'bityj' <<<"$P" && grep -q 'proba' <<<"$P" \
  && sud ok 'битый файл НЕ гасит проверку остальных' || sud fail 'битый файл не гасит проверку остальных' "$P"
rm -f "$D/bityj.yml" /tmp/.al_o

echo "── квант перерасхода"
cat > "$D/malo.yml" <<'EOF'
predely:
  maxTokensPerDay: 15000000
EOF
"$INSTR" pokazhi malo 2>/dev/null | grep -q 'ЗАЩИТЫ НЕТ' \
  && sud ok 'предел меньше двух квантов — ЗАЩИТЫ НЕТ' || sud fail 'предел меньше двух квантов — ЗАЩИТЫ НЕТ'
cat > "$D/mnogo.yml" <<'EOF'
predely:
  maxTokensPerDay: 100000000
EOF
M=$("$INSTR" pokazhi mnogo 2>/dev/null)
grep -q 'ЗАЩИТЫ НЕТ' <<<"$M" \
  && sud fail 'достаточный предел НЕ жалуется (зрячесть)' || sud ok 'достаточный предел НЕ жалуется (зрячесть)'
grep -q 'допуск ±10000000' <<<"$M" \
  && sud ok 'допуск назван числом рядом со значением' || sud fail 'допуск назван числом' "$(grep maxTokensPerDay <<<"$M")"
"$INSTR" pokazhi proba maxTokensPerDay 2>/dev/null | grep -q 'НЕ ОГРАНИЧИВАТЬ' \
  && sud ok 'ноль отличается от «не задано»' || sud fail 'ноль отличается от «не задано»'
"$INSTR" proverit >/dev/null 2>&1; K=$?
[ "$K" = 1 ] && sud ok 'proverit краснеет на негодном пределе' || sud fail 'proverit краснеет' "код=$K"
rm -f "$D/malo.yml" "$D/mnogo.yml"

echo "── json"
J=$("$INSTR" pokazhi proba --json 2>/dev/null)
python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
assert d['znacheniya']['predely']['maxPerDayCount']==12
assert d['istochnik']['predely']['maxPerDayCount'].endswith('proba.yml')
" <<<"$J" 2>/dev/null \
  && sud ok 'json несёт значение И источник' || sud fail 'json несёт значение и источник'

echo "── ключ без читателя (31.08: в файле лежали шесть строк, которых не читал никто)"
# 🔴 Раздел начинается с ЧИСТОГО каталога: файлы предыдущих разделов (proba.yml и
# прочие) содержат свои ключи, и проверка читателей честно краснела на них. Разделы
# стенда, делящие один каталог, — это накопленное состояние, а не изоляция.
rm -f "$D"/*.yml
mkdir -p "$D/potreb"
cat > "$D/potreb/chitatel.js" <<'EOF'
const LIMITS_DIR = '/etc/agent-limits'
const x = cfg.maxPerDayCount
EOF
cat > "$D/obshchee.yml" <<EOF
predely:
  maxPerDayCount: 48
  maxTokensPerDay: 0
zamer:
  kvantTokenovNaHod: 10000000
proverka:
  korniPotrebitelej: ["$D/potreb"]
  bezChitatelyaNarochno: []
EOF
cat > "$D/sirota.yml" <<'EOF'
predely:
  maxPerDayCount: 12
  xyzzySirotaCount: 7
EOF
P=$("$INSTR" proverit 2>/dev/null); K=$?
grep -q 'xyzzySirotaCount.*не читает НИКТО' <<<"$P"   && sud ok 'ключ без читателя пойман' || sud fail 'ключ без читателя пойман' "$P"
grep -q 'maxPerDayCount.*не читает НИКТО' <<<"$P"   && sud fail 'ключ С читателем НЕ назван бедой (зрячесть)' || sud ok 'ключ С читателем НЕ назван бедой (зрячесть)'
[ "$K" = 1 ] && sud ok 'сирота даёт код 1' || sud fail 'сирота даёт код 1' "код=$K"
# намеренное исключение: не беда, но ВИДНО
sed -i 's/  bezChitatelyaNarochno: \[\]/  bezChitatelyaNarochno: [xyzzySirotaCount, maxTokensPerDay]/' "$D/obshchee.yml"
P2=$("$INSTR" proverit 2>/dev/null); K2=$?
[ "$K2" = 0 ] && sud ok 'объявленное исключение не краснеет' || sud fail 'объявленное исключение не краснеет' "код=$K2"
grep -q 'намеренно без читателя: 2' <<<"$P2"   && sud ok 'исключения печатаются числом' || sud fail 'исключения печатаются числом' "$P2"
grep -q 'список обязан убывать' <<<"$P2"   && sud ok 'у списка исключений названо требование убывать' || sud fail 'требование убывать названо'
# рамка не объявлена -> проверить читателей нечем, и это беда
# 🔴 Удаляем в ЛЮБОЙ форме записи: в фикстуре путь стоит в одну строку
# (korniPotrebitelej: ["..."]), и regex под многострочный список не совпадал —
# удаление не состоялось, а проверка объявляла дефект предмета. Порча тоже
# подлежит проверке фактом.
python3 - "$D/obshchee.yml" <<'PYX'
import sys, re
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'^  korniPotrebitelej:.*\n(?:    - .*\n)*', '', s, flags=re.M)
assert 'korniPotrebitelej' not in s, 'рамка не удалилась — порча не состоялась'
open(p, 'w').write(s)
PYX
# сырьё в вердикт: приговор без вывода непроверяем
P3=$("$INSTR" proverit 2>&1); K3=$?
grep -q 'рамка проверки не объявлена' <<<"$P3" \
  && sud ok 'без рамки — беда, а не молчание' \
  || sud fail 'без рамки — беда, а не молчание' "код=$K3 | $(head -2 <<<"$P3" | tr '\n' ' ')"
rm -rf "$D/potreb" "$D/sirota.yml"
# возвращаем фикстуру, на которой стоят разделы ниже
cat > "$D/obshchee.yml" <<'EOF'
predely:
  maxPerDayCount: 48
  maxTokensPerDay: 0
politiki:
  dayZone: UTC
zamer:
  kvantTokenovNaHod: 10000000
EOF

echo "── read-only ПО ПОСТРОЕНИЮ (только исполняемые строки)"
# 🔴 Ищем ТОЛЬКО в исполняемых строках: слова «open», «shutil», «os.replace» есть
# в докстринге, где объясняется их отсутствие. Проверка на текст поймала бы рассказ
# об отсутствии записи и покраснела на исправном предмете — уже обжигались 28.08.
TELO=$(python3 - "$INSTR" <<'PY'
import ast,sys
s=open(sys.argv[1],encoding='utf-8').read()
t=ast.parse(s); lines=s.split('\n'); vyrez=set()
for n in ast.walk(t):
    if isinstance(n,(ast.Module,ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
        d=ast.get_docstring(n,clean=False)
        if d is not None and n.body and isinstance(n.body[0],ast.Expr):
            for i in range(n.body[0].lineno, n.body[0].end_lineno+1): vyrez.add(i)
print('\n'.join(l.split('#')[0] for i,l in enumerate(lines,1) if i not in vyrez))
PY
)
N=$(grep -cE "open\([^)]*['\"][wa]|shutil|os\.replace|\.write\(|unlink|rmtree" <<<"$TELO" || true)
[ "${N:-0}" = 0 ] && sud ok 'записи в инструменте нет ни одной' || sud fail 'записи в инструменте нет' "найдено: $N"
grep -cE "def cmd_" <<<"$TELO" | grep -q '^2$' \
  && sud ok 'подкоманд ровно две: pokazhi и proverit' || sud fail 'подкоманд ровно две' "$(grep -cE 'def cmd_' <<<"$TELO")"

ZHDYOM=26
echo
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
if [ $((ok+bad)) -ne "$ZHDYOM" ]; then
  echo "🔴 КАНАРЕЙКА: проведено $((ok+bad)) проверок, ждали $ZHDYOM — часть не состоялась"
  exit 2
fi
[ "$bad" = 0 ] || exit 1
[ "$slep" = 0 ] || exit 2
exit 0
