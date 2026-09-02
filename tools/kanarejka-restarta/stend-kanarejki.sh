#!/bin/bash
# Стенд канарейки перед рестартом: проверяет ИСХОДЫ инструмента, а не наличие строк.
#
# 🔴 ГДЕ НЕ ПРИМЕНЯЕТСЯ: не проверяет содержание изоляции (что копия и правда не
# трогает боевые каналы) — это доказывается замером боевых каталогов до и после,
# он в отчёте 160; и не проверяет поведение копии под нагрузкой.
#
# Прогон поднимает платформу дважды, это ~15 секунд. Коды: 0 | 1 | 2.
set -uo pipefail
# 🔴 БОЕВАЯ УСТАНОВКА ЗАДАЁТСЯ СНАРУЖИ, умолчания нет намеренно. Прежде здесь был
# вшит каталог одного агента: у всякого другого стенд искал бы каталоги, которых у
# него нет, и падал бы не объяснив причины. Отсутствие переменной обязано давать
# ВНЯТНЫЙ отказ, а не тихий поиск несуществующего пути.
# Проба на частные имена нашла это как утечку имени; на деле имя было симптомом,
# а болезнью — вшитая чужая установка. Параметр лечит оба разом.
BOEVOJ_DOM="${KANAREJKA_ISHODNYJ_DOM:-}"
# Отсутствие переменной — СЛЕПОТА (проверять нечем), а не расхождение: код 2, не 1.
# Через `:?` вышел бы код 1, и снаружи это читалось бы как «предмет плох».
[ -n "$BOEVOJ_DOM" ] || { echo "СЛЕПОТА: не задан KANAREJKA_ISHODNYJ_DOM — каталог боевой установки, например /opt/<агент>. Проверять нечем."; exit 2; }
[ -d "$BOEVOJ_DOM/.dsh/profiles/web" ] || { echo "СЛЕПОТА: в $BOEVOJ_DOM нет .dsh/profiles/web — это не каталог боевой установки"; exit 2; }
RYADOM="$(cd "$(dirname "$0")" && pwd)"
K=${1:-$RYADOM/kanarejka-restarta.sh}
# «нет файла» и «файл не исполняемый» — разные беды, и общая формулировка про
# ненайденный предмет отправила бы искать не там (поймано на себе 02.09).
[ -f "$K" ] || { echo "СЛЕПОТА: предмета нет: $K"; exit 2; }
[ -x "$K" ] || { echo "СЛЕПОТА: предмет есть, но не исполняемый: $K (chmod +x)"; exit 2; }
echo "предмет: $K (sha256-16 $(sha256sum "$K" | cut -c1-16))"

# 🔴 СНИМОК ЧУЖИХ КАТАЛОГОВ ДО ПРОГОНА. Проверка «убрал за собой» смотрела на ВЕСЬ
# /tmp по маске — то есть на общий ресурс, а не на свой предмет. Чужой живой прогон
# (мой же, соседний, аудиторский) читался как «канарейка не убрала за собой»:
# ложное расхождение на исправном инструменте, воспроизведено 02.09.2026 подставным
# каталогом. Считаем только те каталоги, которых ДО прогона не было.
# 🔴 ТИП + ШАБЛОН, А НЕ ОДНА МАСКА. `ls -d` не различает файл и каталог: тёзка-файл
# (черновик, лог, что угодно с тем же началом имени) читался бы как невывезенный
# каталог. Ищем ровно каталоги ровно этой формы.
svoi_katalogi() { find /tmp -maxdepth 1 -type d -name 'kanarejka-??????' 2>/dev/null | sort; }
CHUZHIE_DO=$(svoi_katalogi)

ok=0; bad=0; slep=0
# 🔴 ИМЕНА ИСПОЛНЕННЫХ ПРОВЕРОК КОПЯТСЯ. Без них строка итога — самоописание, а не
# утверждение о покрытии: пропущенная проверка и пройденная неразличимы, и стенд
# может тихо проредить сам себя, оставшись бодрым. Поводом стало разночтение
# 02.09.2026: «сошлось 19, расхождений 1» прочли как «19 проверок» (было 20),
# потому что общее число не печаталось вовсе.
VYPOLNENO=$(mktemp /tmp/stend-kan-vyp-XXXX)
sud() {
  printf '%s\n' "$2" >> "$VYPOLNENO"
  if [ "$1" = slep ]; then slep=$((slep+1)); echo "СЛЕПОТА $2: ${3:-}"
  elif [ "$1" = да ]; then ok=$((ok+1))
  else bad=$((bad+1)); echo "FAIL $2: ${3:-}"; fi
}
prov() { local ozhid=$1 imya=$2; shift 2; local o; o=$("$@" 2>&1); local rc=$?
  [ "$rc" = "$ozhid" ] && sud да "$imya" || sud нет "$imya" "ждали код $ozhid, дано $rc: $(echo "$o" | tail -1)"; }

# 1-3. слепота там, где проверять нечем — а не красное: «нечем» и «плохо» разные новости
prov 2 "нет дерева платформы -> слепота" env KANAREJKA_APP=/tmp/net-takogo bash "$K" web
prov 2 "нет слоя профиля -> слепота"     env KANAREJKA_DOM=/tmp/net-takogo-doma bash "$K" web

TD=$(mktemp -d /tmp/stend-kan-XXXX)
mkdir -p "$TD/.dsh/profiles/web"
cp $BOEVOJ_DOM/.dsh/profiles/web/cordis.patch.yml "$TD/.dsh/profiles/web/"
prov 2 "профиль без ссылок на плагины -> слепота" env KANAREJKA_DOM="$TD" KANAREJKA_APP=$BOEVOJ_DOM/app bash "$K" web
rm -rf "$TD"

# 3а. изоляция: нет списка / список пуст / запись убрана -> ОТКАЗ, а не копия
# без изоляции. Проба без изоляции отнимает у боевого то, ради чего заводилась.
TS=$(mktemp -d /tmp/stend-kan-sp-XXXX)
echo '{"podmenit":[]}' > "$TS/pusto.json"
echo 'не json' > "$TS/musor.json"
python3 -c "
import json
d=json.load(open('$RYADOM/edinstvennye-sushchnosti.json'))
d['podmenit']=[z for z in d['podmenit'] if z['kluch']!='tokenFile']
json.dump(d,open('$TS/bez-tokena.json','w'),ensure_ascii=False)"
prov 2 "нет файла списка -> отказ"        env KANAREJKA_SPISOK="$TS/net.json" bash "$K" web
prov 2 "список пуст -> отказ"             env KANAREJKA_SPISOK="$TS/pusto.json" bash "$K" web
prov 2 "список негоден -> отказ"          env KANAREJKA_SPISOK="$TS/musor.json" bash "$K" web
prov 2 "запись убрана -> отказ по РЕЗУЛЬТАТУ, а не по списку" \
  env KANAREJKA_SPISOK="$TS/bez-tokena.json" bash "$K" web
OTK=$(env KANAREJKA_SPISOK="$TS/bez-tokena.json" bash "$K" web 2>&1)
echo "$OTK" | grep -q 'tokenFile' && sud да "отказ называет ЗАБЫТЫЙ ключ поимённо" \
  || sud нет "отказ называет ЗАБЫТЫЙ ключ поимённо" "имени ключа в отказе нет"
rm -rf "$TS"

# 3б. слой БЕЗ ключа: изолировать либо отказаться, третьего исхода нет.
# Прежняя редакция молча пропускала подмену — копия шла с боевой сущностью.
TD2=$(mktemp -d /tmp/stend-kan-sloi-XXXX)
mkdir -p "$TD2/.dsh/profiles/web"
cp -a $BOEVOJ_DOM/.dsh/profiles/web/node_modules "$TD2/.dsh/profiles/web/" 2>/dev/null
python3 -c "
import io,re
s=io.open('$BOEVOJ_DOM/.dsh/profiles/web/cordis.patch.yml',encoding='utf-8').read()
io.open('$TD2/.dsh/profiles/web/cordis.patch.yml','w',encoding='utf-8').write(re.sub(r'^\s*tokenFile:.*\n','',s,flags=re.M))"
prov 2 "слой БЕЗ ключа -> отказ, а не тихий пропуск" \
  env KANAREJKA_DOM="$TD2" KANAREJKA_APP=$BOEVOJ_DOM/app bash "$K" web
BEZ=$(env KANAREJKA_DOM="$TD2" KANAREJKA_APP=$BOEVOJ_DOM/app bash "$K" web 2>&1)
echo "$BEZ" | grep -q 'tokenFile не задан' && sud да "отказ называет незаданный ключ" \
  || sud нет "отказ называет незаданный ключ" "имени ключа нет"
rm -rf "$TD2"

# 3б-2. НЕЗНАКОМАЯ настройка с чужим адресом: канарейка обязана споткнуться, а не
# человек. Случай проверял аудитор своей рукой — но проверка, живущая в чьём-то
# сегодняшнем прогоне, исчезает вместе с памятью о нём.
TD3=$(mktemp -d /tmp/stend-kan-nov-XXXX)
mkdir -p "$TD3/.dsh/profiles/web"
cp -a $BOEVOJ_DOM/.dsh/profiles/web/node_modules "$TD3/.dsh/profiles/web/" 2>/dev/null
python3 -c "
import io
s=io.open('$BOEVOJ_DOM/.dsh/profiles/web/cordis.patch.yml',encoding='utf-8').read()
# Якорь берётся ПО ПРИЗНАКУ, а не по значению: имя агента у каждого своё,
# и сверка с конкретным именем делала бы стенд непереносимым.
import re
m=re.search(r'^\s*limitsAgent:.*$', s, re.M)
assert m, 'в слое профиля нет строки limitsAgent — не с чем работать'
old=m.group(0)
io.open('$TD3/.dsh/profiles/web/cordis.patch.yml','w',encoding='utf-8').write(
    s.replace(old, old+'\n        novyjKatalog: /var/lib/obshchee-hranilishche',1))"
prov 2 "незнакомая настройка с чужим адресом -> отказ" \
  env KANAREJKA_DOM="$TD3" KANAREJKA_APP=$BOEVOJ_DOM/app bash "$K" web
NOV=$(env KANAREJKA_DOM="$TD3" KANAREJKA_APP=$BOEVOJ_DOM/app bash "$K" web 2>&1)
echo "$NOV" | grep -q 'novyjKatalog' && sud да "отказ называет незнакомую настройку строкой" \
  || sud нет "отказ называет незнакомую настройку строкой" "строки нет в отказе"
rm -rf "$TD3"

# 3в. механизм подмены отключён -> контроль ПОСЛЕ подмены обязан поймать
PORCHA="$(dirname "$K")/.stend-kan-porcha.sh"
python3 -c "
import io
s=io.open('$K',encoding='utf-8').read()
old='    sed -i -E \"s|^(\\\\s*)\$kluch:.*\$|\\\\1\$kluch: \$novoe|\" \"\$f\"'
assert s.count(old)==1, s.count(old)
io.open('$PORCHA','w',encoding='utf-8').write(s.replace(old,'    true',1))"
prov 2 "подмена не выполнилась -> отказ по контролю" bash "$PORCHA" web
rm -f "$PORCHA"

# 4. исправный предмет -> зелёное. Без этого «краснеет всегда» неотличимо от работы.
prov 0 "исправный предмет -> зелёное" bash "$K" web

# 5. вердикт не молчит про то, что рестарт не сделан
VYV=$(bash "$K" web 2>&1)
echo "$VYV" | grep -q 'РЕСТАРТ НЕ СДЕЛАН' && sud да "зелёный вердикт говорит, что рестарт НЕ сделан" \
  || sud нет "зелёный вердикт говорит, что рестарт НЕ сделан" "строки нет"
echo "$VYV" | grep -q 'НЕ проверены' && sud да "зелёный вердикт называет, чего НЕ проверил" \
  || sud нет "зелёный вердикт называет, чего НЕ проверил" "строки нет"

# 6. изоляция объявлена поимённо, а не молча
for k in tokenFile spoolDir a2aDir heartbeatNoticeDir; do
  echo "$VYV" | grep -q "подменено $k" && sud да "изоляция объявлена: $k" \
    || sud нет "изоляция объявлена: $k" "в выводе нет строки подмены"
done

# 7. за собой убрано и копия погашена — признак работы, а не наличие строки
CHUZHIE_POSLE=$(svoi_katalogi)
moi=$(comm -13 <(printf '%s\n' "$CHUZHIE_DO") <(printf '%s\n' "$CHUZHIE_POSLE") | grep -c . || true)
[ "${moi:-0}" = 0 ] && sud да "временные каталоги СВОИХ прогонов убраны" \
  || sud нет "временные каталоги СВОИХ прогонов убраны" "осталось $moi (чужие не в счёт)"
zhivyh=$(pgrep -f 'node .*bin\.js web --port' 2>/dev/null | while read p; do
  tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q '/usr/local/bin/node' && echo x; done | wc -l)
[ "$zhivyh" -le 1 ] && sud да "копии погашены" \
  || sud нет "копии погашены" "живых платформ $zhivyh, ожидалась одна боевая"

# Заявленный состав — ДАННЫМИ рядом; нет файла — судить о покрытии нечем, и это
# слепота, а не «всё выполнено».
ZAYAV="$(dirname "$0")/zayavlennye-proverki-kanarejki.json"
if [ ! -f "$ZAYAV" ]; then
  echo "СЛЕПОТА: нет заявленного состава ($ZAYAV) — «выполнено N из N» утверждать нечем"
  rm -f "$VYPOLNENO"; exit 2
fi
python3 -c "
import json
z=json.load(open('$ZAYAV'))['proverki']
print('\n'.join(z))" > "$VYPOLNENO.zayav"
VSEGO=$(wc -l < "$VYPOLNENO.zayav")
SDELANO=$((ok+bad+slep))
echo "ИТОГО: сошлось $ok, расхождений $bad, слепот $slep"
echo "ВЫПОЛНЕНО $SDELANO из $VSEGO заявленных"
PROPUSK=$(comm -23 <(sort -u "$VYPOLNENO.zayav") <(sort -u "$VYPOLNENO") || true)
LISHNIE=$(comm -13 <(sort -u "$VYPOLNENO.zayav") <(sort -u "$VYPOLNENO") || true)
rm -f "$VYPOLNENO" "$VYPOLNENO.zayav"
if [ -n "$PROPUSK" ]; then
  echo "🔴 ПРОПУЩЕНО (заявлено, но не исполнилось):"
  printf '%s\n' "$PROPUSK" | sed 's/^/     /'
fi
if [ -n "$LISHNIE" ]; then
  echo "🔴 ИСПОЛНЕНО СВЕРХ ЗАЯВЛЕННОГО (впишите в состав):"
  printf '%s\n' "$LISHNIE" | sed 's/^/     /'
fi
[ -z "$PROPUSK" ] && [ -z "$LISHNIE" ] || exit 2
[ "$bad" = 0 ] || exit 1
[ "$slep" = 0 ] || exit 2
exit 0
