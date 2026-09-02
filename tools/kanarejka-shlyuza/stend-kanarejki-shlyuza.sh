#!/bin/bash
# Стенд канарейки шлюза: проверяет ИСХОДЫ инструмента, а не наличие строк.
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ: не проверяет, правильно ли шлюз обрабатывает запросы к
# модели, и не ловит медленную деградацию — это не предмет канарейки.
#
# Боевая установка задаётся снаружи; умолчания нет намеренно — у всякого другого
# агента каталоги свои, и тихий поиск чужого пути хуже внятного отказа.
# Прогон поднимает копию шлюза до восьми раз, это ~40 секунд. Коды: 0 | 1 | 2.
set -uo pipefail
BOEVOJ_DOM="${KANAREJKA_ISHODNYJ_DOM:-}"
[ -n "$BOEVOJ_DOM" ] || { echo "СЛЕПОТА: не задан KANAREJKA_ISHODNYJ_DOM (каталог боевой установки агента). Проверять нечем."; exit 2; }
RYADOM="$(cd "$(dirname "$0")" && pwd)"
K=${1:-$RYADOM/kanarejka-shlyuza.sh}
SHLYUZ_DIR="${KANAREJKA_SHLYUZ_DIR:-/opt/claude-oauth}"
SOSTAV="$RYADOM/zayavlennye-proverki-kanarejki-shlyuza.json"

[ -f "$K" ] || { echo "СЛЕПОТА: предмета нет: $K"; exit 2; }
[ -x "$K" ] || { echo "СЛЕПОТА: предмет есть, но не исполняемый: $K (chmod +x)"; exit 2; }
[ -r "$SHLYUZ_DIR/gateway.mjs" ] || { echo "СЛЕПОТА: не читается $SHLYUZ_DIR/gateway.mjs — не с чего готовить порчи"; exit 2; }

ok=0; bad=0; slep=0; ISPOLNENO=""
sud() { ISPOLNENO="$ISPOLNENO$2"$'\n'
        if [ "$1" = да ]; then ok=$((ok+1)); else bad=$((bad+1)); echo "FAIL $2: ${3:-}"; fi; }
# Имя проверки одно на обе ветки: разное написание при успехе и неуспехе делало бы
# покрытие ложным ровно тогда, когда предмет плох (поймано на стенде платформы 02.09).
prov() { # ждём_код имя команда...
  local zhdem="$1" imya="$2"; shift 2
  local vyv kod
  vyv=$("$@" 2>&1); kod=$?
  if [ "$kod" = "$zhdem" ]; then sud да "$imya"; else sud нет "$imya" "ждали код $zhdem, дано $kod"; fi
  POSLEDNIJ_VYVOD="$vyv"
}

echo "предмет: $K (sha256-16 $(sha256sum "$K" | cut -c1-16))"

# --- порченые копии шлюза: соседние файлы и node_modules обязаны быть рядом ---
# Иначе копия падает не от порчи, а от неразрешённых зависимостей, и стенд
# проверяет собственную фикстуру вместо предмета (поймано 02.09).
TD=$(mktemp -d /tmp/stend-kan-shl-XXXXXX)
uborka() { rm -rf "$TD" /tmp/kanarejka-shlyuza-otkaz-*.log 2>/dev/null; }
trap uborka EXIT
cp -a "$SHLYUZ_DIR"/*.mjs "$SHLYUZ_DIR"/*.json "$TD/" 2>/dev/null
ln -sfn "$SHLYUZ_DIR/node_modules" "$TD/node_modules"
printf 'GATEWAY_PORT=8789\nGATEWAY_WORK_DIR=%s\nGATEWAY_TOKEN_FILE=/etc/claude-oauth/token-podstavnoj\n' "$BOEVOJ_DOM" > "$TD/env-obrazec.env"

# 1. исправный предмет
prov 0 "исправный шлюз -> зелёная" env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SROK=15 bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'РЕСТАРТ НЕ СДЕЛАН И НЕ БУДЕТ' \
  && sud да "зелёная объявляет, что рестарта не делает" \
  || sud нет "зелёная объявляет, что рестарта не делает" "строки нет в выводе"

# 2. порча синтаксиса
cp "$TD/gateway.mjs" "$TD/gw-sintaksis.mjs"; printf '\nconst oborvano = {\n' >> "$TD/gw-sintaksis.mjs"
prov 1 "шлюз сломан синтаксисом -> красная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-sintaksis.mjs" KANAREJKA_SROK=8 bash "$K"

# 3. порча, которую грамматика НЕ ловит — главный довод существования канарейки
python3 -c "
import io
p='$TD/gateway.mjs'; s=io.open(p,encoding='utf-8').read()
y='const server = http.createServer'
assert s.count(y)==1
io.open('$TD/gw-padaet.mjs','w',encoding='utf-8').write(s.replace(y,'netTakojFunkcii();\n'+y,1))"
node --check "$TD/gw-padaet.mjs" 2>/dev/null \
  && sud да "порча проходит грамматику (иначе она проверяла бы node --check)" \
  || sud нет "порча проходит грамматику (иначе она проверяла бы node --check)" "node --check её видит"
prov 1 "шлюз падает при старте, грамматика чиста -> красная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-padaet.mjs" KANAREJKA_SROK=8 bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'netTakojFunkcii' \
  && sud да "отказ называет ПРИЧИНУ падения, а не хвост стека" \
  || sud нет "отказ называет ПРИЧИНУ падения, а не хвост стека" "причины нет в выводе"

# 4. порт отвечает, а по существу плохо
python3 -c "
import io
p='$TD/gateway.mjs'; s=io.open(p,encoding='utf-8').read()
y='const ok = Boolean(readToken());'
assert s.count(y)==1
io.open('$TD/gw-health.mjs','w',encoding='utf-8').write(s.replace(y,'const ok = false;',1))"
prov 1 "порт отвечает, health не по существу -> красная" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/gw-health.mjs" KANAREJKA_SROK=12 bash "$K"

# 5. сущность убрана из списка -> ловит проверка РЕЗУЛЬТАТА, а не список
python3 -c "
import json
d=json.load(open('$RYADOM/edinstvennye-sushchnosti-shlyuza.json',encoding='utf-8'))
d['sushchnosti']=[x for x in d['sushchnosti'] if x['klyuch']!='GATEWAY_PORT']
json.dump(d,open('$TD/bez-porta.json','w',encoding='utf-8'),ensure_ascii=False)"
prov 1 "сущность убрана из списка -> отказ по РЕЗУЛЬТАТУ" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/bez-porta.json" bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'GATEWAY_PORT' \
  && sud да "отказ называет уцелевший ключ поимённо" \
  || sud нет "отказ называет уцелевший ключ поимённо" "имени ключа в отказе нет"

# 6. незнакомая настройка спотыкает механизм, а не человека
sudo cat /etc/claude-oauth/instance-"$(basename "$BOEVOJ_DOM")".env > "$TD/env-novaya.env" 2>/dev/null \
  || cp "$TD/env-obrazec.env" "$TD/env-novaya.env"
echo 'GATEWAY_NOVYJ_SOKET=/var/run/chuzhoj.sock' >> "$TD/env-novaya.env"
prov 1 "незнакомая настройка -> отказ" \
  env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_ENV="$TD/env-novaya.env" bash "$K"
echo "$POSLEDNIJ_VYVOD" | grep -q 'GATEWAY_NOVYJ_SOKET' \
  && sud да "отказ называет незнакомую настройку поимённо" \
  || sud нет "отказ называет незнакомую настройку поимённо" "имени настройки нет в отказе"

# 7. слепоты: проверять нечем
echo 'не json' > "$TD/musor.json"
prov 2 "списка сущностей нет -> слепота"   env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/net.json" bash "$K"
prov 2 "список негоден -> слепота"          env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_SUSHCHNOSTI="$TD/musor.json" bash "$K"
prov 2 "предмета нет -> слепота"            env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_PREDMET="$TD/net.mjs" bash "$K"
prov 2 "настроек экземпляра нет -> слепота" env KANAREJKA_DOM="$BOEVOJ_DOM" KANAREJKA_ENV="$TD/net.env" bash "$K"

# 8. структурное: канарейка НЕ смеет импортировать предмет
grep -qE "(^|[^a-z])(import|require)\(.*gateway\.mjs" "$K" \
  && sud нет "канарейка не импортирует предмет" "в предмете есть импорт gateway.mjs" \
  || sud да "канарейка не импортирует предмет"

# 9. боевое цело
ss -ltn 2>/dev/null | grep -q ':8789 ' \
  && sud да "боевой шлюз слушает как слушал" \
  || sud нет "боевой шлюз слушает как слушал" "порт 8789 не отвечает"

# 10. за собой убрано: только СВОИ каталоги, чужие прогоны не в счёт
ostatki=$(find /tmp -maxdepth 1 -type d -name 'kanarejka-shlyuza-??????' -newer "$TD" 2>/dev/null | wc -l)
[ "$ostatki" = 0 ] \
  && sud да "временные каталоги канарейки убраны" \
  || sud нет "временные каталоги канарейки убраны" "осталось $ostatki"

# --- покрытие: заявлено против исполненного ---------------------------------
if [ -r "$SOSTAV" ]; then
  ZAYAV=$(python3 -c "import json;print('\n'.join(json.load(open('$SOSTAV',encoding='utf-8'))['proverki']))")
  PROPUSK=$(comm -23 <(echo "$ZAYAV" | sort) <(echo "$ISPOLNENO" | grep -v '^$' | sort))
  LISHNIE=$(comm -13 <(echo "$ZAYAV" | sort) <(echo "$ISPOLNENO" | grep -v '^$' | sort))
  VSEGO=$(echo "$ZAYAV" | grep -cv '^$')
else
  # Нет состава — покрытие УТВЕРЖДАТЬ НЕЧЕМ, и это слепота, а не зелёное.
  # Прежде здесь был код 0 при непосчитанном покрытии: стенд отчитывался бодро,
  # не зная, все ли проверки исполнились (поймано порчей 02.09).
  PROPUSK=""; LISHNIE=""; VSEGO="?"
  echo "🔴 ПОКРЫТИЕ НЕ ПОСЧИТАНО: нет файла заявленного состава $SOSTAV"
  slep=$((slep+1))
fi

echo
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
echo "ВЫПОЛНЕНО $((ok+bad)) из $VSEGO заявленных"
[ -n "$PROPUSK" ] && { echo "🔴 ПРОПУЩЕНО:"; printf '%s\n' "$PROPUSK" | sed 's/^/     /'; }
[ -n "$LISHNIE" ] && { echo "🔴 СВЕРХ ЗАЯВЛЕННОГО (впишите в состав):"; printf '%s\n' "$LISHNIE" | sed 's/^/     /'; }
[ -z "$PROPUSK" ] && [ -z "$LISHNIE" ] || exit 2
[ "$bad" = 0 ] || exit 1
[ "$slep" = 0 ] || exit 2
exit 0
