#!/usr/bin/env bash
# Приёмка --json у agent-registry pole.
#
# Гоняет УСТАНОВЛЕННЫЙ /usr/local/bin/agent-registry, а не копию: проверять
# надо то, что исполняется, а не то, что лежит рядом.
#
# Коды: 0 сошлось | 1 расхождение | 2 слепота (проверить не удалось).
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ:
#   * не проверяет верность СОДЕРЖИМОГО реестра — только форму вывода;
#   * не проверяет подкоманды list/fakt/verify/sluzhby — у них своя приёмка;
#   * подставной реестр кладётся во временный каталог; боевой /etc не трогается.
set -uo pipefail
export LC_ALL=C.UTF-8          # порядок и диапазоны не должны зависеть от локали

INSTR="${REGISTRY_BIN:-/usr/local/bin/agent-registry}"
ok=0; bad=0; slep=0
sud(){ # вердикт имя сырьё
  case "$1" in
    ok)   ok=$((ok+1));   printf '  ok    %-44s %s\n' "$2" "$3" ;;
    fail) bad=$((bad+1)); printf '  FAIL  %-44s %s\n' "$2" "$3" ;;
    *)    slep=$((slep+1)); printf '  СЛЕПОТА %-42s %s\n' "$2" "$3" ;;
  esac
}

[[ -x "$INSTR" ]] || { echo "СЛЕПОТА: нет исполняемого $INSTR"; exit 2; }
command -v jq >/dev/null || { echo "СЛЕПОТА: нет jq — сквозной конвейер не проверить"; exit 2; }
command -v python3 >/dev/null || { echo "СЛЕПОТА: нет python3"; exit 2; }

echo "== приёмка --json: $INSTR =="

# ── 1. JSON обязан быть разбираемым, а не похожим на JSON ───────────────────
# 🔴 РЕШЕНИЕ 28.08.2026: перечень ниже ОСТАВЛЕН РУКАМИ намеренно, это не забывчивость.
# В тот же день у стенда цельности моста рукописная фикстура была заменена сборкой
# ИЗ ПРЕДМЕТА — там перечень КОПИРОВАЛ источник и расходился с ним молча.
# Здесь случай обратный: перечень задаёт ТРЕБОВАНИЕ к источнику. Возьми его из того
# же читателя, которого проверяем, — выйдет тавтология «читатель отдаёт то, что отдаёт»,
# и проверка перестанет проверять.
# Цена названа: добавят в реестр новый раздел — он не попадёт в ожидание и останется
# непокрытым молча. Разделителя между «забыли дописать» и «раздела и не должно быть»
# у нас нет, поэтому механизма тут не будет (тот же случай, что долг 42).
for pole in sluzhba zavisit_ot kopiya; do
  out=$("$INSTR" pole iskra "$pole" --json 2>/dev/null); k=$?
  if [[ $k -ne 0 ]]; then sud slep "json/$pole" "код=$k"; continue; fi
  if printf '%s' "$out" | jq -e . >/dev/null 2>&1; then
    sud ok "json/$pole разбирается" "$(printf '%s' "$out" | LC_ALL=C.utf8 sed -e 's/\(.\{0,40\}\).*/\1/')"
  else
    sud fail "json/$pole НЕ разбирается" "$(printf '%s' "$out" | LC_ALL=C.utf8 sed -e 's/\(.\{0,60\}\).*/\1/')"
  fi
done

# ── 2. типы сохраняются: скаляр строкой, список массивом, раздел объектом ───
proverit_tip(){ # поле ожидаемый-тип
  out=$("$INSTR" pole iskra "$1" --json 2>/dev/null) || { sud slep "тип/$1" "инструмент отказал"; return; }
  t=$(printf '%s' "$out" | jq -r 'type' 2>/dev/null)
  [[ "$t" == "$2" ]] && sud ok "тип/$1" "$t" || sud fail "тип/$1 ждали $2" "получено $t"
}
proverit_tip sluzhba     string
proverit_tip zavisit_ot  array
proverit_tip kopiya      object

# ── 3. ГРАНИЦА: нет поля => отказ, а НЕ null. Это несущее свойство. ─────────
out=$("$INSTR" pole iskra zavedomo-net-takogo-polya --json 2>/dev/null); k=$?
bajt=$(printf '%s' "$out" | wc -c)
if [[ $k -eq 0 ]]; then
  sud fail "нет поля => обязан отказ" "получен код 0"
elif [[ $bajt -ne 0 ]]; then
  # худший исход: код ненулевой, но в конвейер что-то ушло
  sud fail "при отказе stdout не пуст" "байт=$bajt"
else
  sud ok "нет поля => код $k, stdout пуст" "байт=0"
fi

# null допустим ТОЛЬКО как «поле есть, значение пусто» — проверяем на подставном
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp" <<'PY'
import sys, yaml
d = yaml.safe_load(open('/etc/agent-registry/agents.yaml'))
for a in d['agenty']:
    if a['imya'] == 'iskra':
        a['namerenie']['pustoe_pole'] = None
        a['namerenie']['klyuch.s.tochkoj'] = 'значение-есть'
yaml.safe_dump(d, open(sys.argv[1]+'/podstav.yaml','w'), allow_unicode=True, sort_keys=False)
PY
sed "s#^REESTR = .*#REESTR = \"$tmp/podstav.yaml\"#" "$INSTR" > "$tmp/ar.py"
grep -q "^REESTR = \"$tmp/podstav.yaml\"" "$tmp/ar.py" \
  && sud ok "подставной реестр подменён" "$tmp/podstav.yaml" \
  || sud slep "подмена реестра не удалась" "стенд смотрит не туда"

out=$(python3 "$tmp/ar.py" pole iskra pustoe_pole --json 2>/dev/null); k=$?
[[ $k -eq 0 && "$out" == "null" ]] \
  && sud ok "пустое значение => null, код 0" "$out" \
  || sud fail "пустое значение" "код=$k вывод=$out"

# ── 4. точка: подсказка обязана назвать НАСТОЯЩУЮ причину ───────────────────
err=$("$INSTR" pole iskra kopiya.klast --json 2>&1 >/dev/null); k=$?
if [[ $k -eq 0 ]]; then
  sud fail "точечный путь принят" "вложенности быть не должно"
elif printf '%s' "$err" | grep -q 'есть точка'; then
  sud ok "точка => отказ называет причину" "код=$k"
else
  sud fail "точка => отказ без причины" "$(printf '%s' "$err" | LC_ALL=C.utf8 sed -e 's/\(.\{0,60\}\).*/\1/')"
fi

# ложное срабатывание: существующий ключ С ТОЧКОЙ обязан отдаться
out=$(python3 "$tmp/ar.py" pole iskra 'klyuch.s.tochkoj' --json 2>/dev/null); k=$?
[[ $k -eq 0 && "$out" == '"значение-есть"' ]] \
  && sud ok "существующий ключ с точкой отдаётся" "$out" \
  || sud fail "подсказка сработала ложно" "код=$k вывод=$out"

# ── 5. текстовый режим не тронут (обратная совместимость) ───────────────────
out=$("$INSTR" pole iskra sluzhba 2>/dev/null)
[[ "$out" == "iskra.service" ]] \
  && sud ok "текстовый режим: скаляр голым" "$out" \
  || sud fail "текстовый режим изменился" "$out"

# ── 6. сквозной конвейер, как у потребителя ─────────────────────────────────
n=$("$INSTR" pole iskra kopiya --json 2>/dev/null | jq -r '.klast[]' 2>/dev/null | wc -l)
[[ "$n" -gt 0 ]] \
  && sud ok "конвейер | jq даёт строки" "строк=$n" \
  || sud fail "конвейер пуст" "строк=$n"

# ключ с точкой ВНУТРИ раздела берётся через jq — то, ради чего отказались от точки
v=$("$INSTR" pole iskra kopiya --json 2>/dev/null | jq -r '.ne_klast_prichina["app.rc8-20260821"] // empty' 2>/dev/null)
[[ -n "$v" ]] \
  && sud ok "jq берёт ключ с точкой" "$(printf '%s' "$v" | LC_ALL=C.utf8 sed -e 's/\(.\{0,30\}\).*/\1/')" \
  || sud fail "jq не взял ключ с точкой" "пусто"

echo "-- итог: ok=$ok fail=$bad слепота=$slep"

# Канарейка: ТОЧНОЕ число проверок, не «не меньше». Порог слеп к убыли ровно
# того размера, который умещается в запас, и выглядит строже, чем работает:
# «не меньше» звучит как требование, а действует как разрешение.
# Замерено 25.08.2026 приёмом «сверься с соседом того же вида»: канарейка была
# у 3 стендов из 13. Вырезанный раздел проходил кодом 0 — выпотрошенный стенд
# отчитывался успехом.
ZHDYOM_PROVEROK=14
if [ $((ok+bad+slep)) -ne $ZHDYOM_PROVEROK ]; then
  echo "СЛЕПОТА: проверок $((ok+bad+slep)), а стенд состоит из $ZHDYOM_PROVEROK — часть не состоялась."
  echo "         Меняли стенд намеренно? Поправьте ZHDYOM_PROVEROK и скажите, почему."
  exit 2
fi
[[ $slep -gt 0 ]] && exit 2
[[ $bad  -gt 0 ]] && exit 1
exit 0
