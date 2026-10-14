#!/bin/bash
# priznak-oblasti-podklyucheniya.sh — что ПОДКЛЮЧЕНО к узлам против того, что ОБЪЯВЛЕНО.
#
# ЗАЧЕМ (замысел координатора 12.09.2026 09:28Z, исполнение Искры того же дня).
# Прежний признак сравнивал объявление с содержимым /opt/agent-plugins/node_modules.
# Предмет, заведённый ОТДЕЛЬНЫМ КАТАЛОГОМ и подключённый ссылкой из профиля, в это
# множество не входит вовсе — и потому был невидим. Так в слепом пятне оказался боевой
# dsh-telegram-multiagent, который мы монтировали дважды. Ворота видели 8 предметов,
# мимо них жило больше.
# ⇒ Здесь область задаётся НЕ списком имён, а СПОСОБОМ ПОДКЛЮЧЕНИЯ, и расхождение
#   печатается В ОБЕ СТОРОНЫ: и подключённое без объявления, и объявленное без подключения.
#
# ГРАНИЦЫ — НАВЕРХУ, А НЕ В КОНЦЕ (урок 12.09: при обрезке письма первой гибнет оговорка):
#   — прибор судит по ИМЕНИ подключения и по ЦЕЛИ ссылки. Он НЕ проверяет, что внутри
#     цели лежит тот пакет, чьё имя написано: «одно имя, два предмета» он не ловит;
#   — цель разрешается readlink -e. Имя — гипотеза, ЦЕЛЬ — факт. Ссылка с именем
#     «.bak-…», ведущая в живой каталог, считается ЖИВЫМ подключением (случай 12.09);
#   — ссылки на зависимости платформы (<узел>/app/node_modules) предметами НЕ считаются:
#     их сотни, они не наша зона учёта. Их битые считаются ОТДЕЛЬНО и код не роняют;
#   — профиль второго узла читается через sudo. Не прочитан — это СЛЕПОТА ПОЛОВИНЫ
#     ОБЛАСТИ, а не чистота: пустой ответ был бы про права, а не про предмет;
#   — «объявлено» берётся из dependencies. Версия НЕ сверяется — это другой предмет.
#
# КОДЫ: 0 расхождений нет | 1 есть расхождение | 2 слепота (область неполна или битая ссылка)
set -u
# №36 аудита 16: сортировки JS (по кодам) и sort/comm должны идти в ОДНОМ порядке — локаль задана явно, как у сторожа.
export LC_ALL=C.UTF-8

# Пути берутся из окружения с боевым умолчанием — иначе пробу нельзя поставить иначе,
# как испортив бой. Подставная область живёт в /tmp и боевых путей не касается.
OBSHCHIJ=${OBLAST_OBSHCHIJ:-/opt/agent-plugins}
OBYAVLENIE=$OBSHCHIJ/package.json
UZLY=${OBLAST_UZLY:-"/opt/iskra/.dsh/profiles /opt/petrovich/.dsh/profiles"}
# Маска архивов для каталогов общего каталога. Печатается в выводе: следующий должен
# знать, ПОЧЕМУ предмет не попал в счёт, а не догадываться.
MASKA_ARHIVOV='(\.bak|\.staryj|\.tgz$|\.tar\.gz$|^strahovki-)'

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
podkl=$tmp/podkl        # имя|узел|профиль|цель|состояние
: > "$podkl"

uzlov_prochitano=0; uzlov_vsego=0; ne_prochitany=""
for baza in $UZLY; do
  uzlov_vsego=$((uzlov_vsego+1))
  uzel=$(echo "$baza" | cut -d/ -f3)
  spisok=$(sudo -n find "$baza" -maxdepth 3 -type d -name node_modules 2>/dev/null)
  if [ -z "$spisok" ]; then ne_prochitany="$ne_prochitany $uzel"; continue; fi
  uzlov_prochitano=$((uzlov_prochitano+1))
  for nm in $spisok; do
    profil=$(basename "$(dirname "$nm")")
    while IFS= read -r l; do
      [ -n "$l" ] || continue
      imya=$(basename "$l"); cel=$(sudo -n readlink "$l" 2>/dev/null)
      if sudo -n readlink -e "$l" >/dev/null 2>&1; then sost=zhivaya; else sost=bitaya; fi
      echo "$imya|$uzel|$profil|$cel|$sost" >> "$podkl"
    done <<< "$(sudo -n find "$nm" -maxdepth 1 -type l 2>/dev/null)"
  done
done

# 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ, fail-closed: ни одного узла или пустое объявление — отказ прибора.
if [ $uzlov_prochitano -eq 0 ]; then
  echo "СЛЕПОТА ПРИБОРА: ни один профиль не прочитан (узлов объявлено $uzlov_vsego)"
  echo "  область: $UZLY — пустой ответ здесь про ПРАВА, а не про предмет"
  exit 2
fi
if [ ! -r "$OBYAVLENIE" ]; then
  echo "СЛЕПОТА ПРИБОРА: объявление $OBYAVLENIE не читается — сравнивать не с чем"
  exit 2
fi
# Разбор ОБЪЯВЛЕНИЯ. Первый заход брал любой ключ по отступу и притащил сам «dependencies» —
# счёт сказал 9 вместо 8. Перечень по форме отвечает про форму; берём УЗЕЛ дерева, а не строку.
obyavleno=$(node -e '
  const o=require(process.argv[1]).dependencies||{};
  console.log(Object.keys(o).sort().join("\n"));
' "$OBYAVLENIE" 2>/dev/null)
if [ -z "$obyavleno" ]; then
  echo "СЛЕПОТА ПРИБОРА: в $OBYAVLENIE не нашлось ни одной зависимости"
  echo "  пустой перечень — это отказ разбора, а не «объявлено ноль»"
  exit 2
fi

# Разделение подключений по ЦЕЛИ, а не по имени.
predmety=$(awk -F'|' '$4 !~ /\/app\/node_modules\// {print}' "$podkl")
platf_bit=$(awk -F'|' '$4 ~ /\/app\/node_modules\// && $5=="bitaya" {print $2"/"$1}' "$podkl" | sort -u)

v_obshchem=$(echo "$predmety" | awk -F'|' -v o="$OBSHCHIJ" 'index($4,o)==1 && $5=="zhivaya" {print $1}' | sort -u)
vne_obshchego=$(echo "$predmety" | awk -F'|' -v o="$OBSHCHIJ" 'index($4,o)!=1 && $5=="zhivaya" {print $2"/"$3"/"$1}' | sort -u)
bitye_predmetov=$(echo "$predmety" | awk -F'|' '$5=="bitaya" {print $2"/"$3"/"$1" -> "$4}' | sort -u)

# Разряд 1: подключено в общий каталог, но не объявлено.
r1=$(comm -23 <(echo "$v_obshchem") <(echo "$obyavleno"))
# Разряд 2: объявлено, но не подключено ни одним узлом.
r2=$(comm -13 <(echo "$v_obshchem") <(echo "$obyavleno"))
# Разряд 4: каталог-предмет в общем каталоге, ни объявлен, ни подключён.
katalogi=$(find "$OBSHCHIJ" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null \
           | grep -v '^node_modules$' | grep -Ev "$MASKA_ARHIVOV" | sort -u)
r4=$(comm -23 <(echo "$katalogi") <(cat <(echo "$obyavleno") <(echo "$v_obshchem") | sort -u))

n() { [ -z "$1" ] && echo 0 || echo "$1" | grep -c .; }
echo "═══ ПРИЗНАК ОБЛАСТИ ПОДКЛЮЧЕНИЯ, $(date -u '+%Y-%m-%d %H:%M:%SZ')"
echo "    узлов прочитано $uzlov_prochitano из $uzlov_vsego${ne_prochitany:+ · НЕ ПРОЧИТАНЫ:$ne_prochitany}"
echo "    подключений-строк $(n "$(echo "$predmety" | grep .)") (один предмет у двух узлов — две строки)"
echo "    уникальных предметов: в общий каталог $(n "$v_obshchem") · вне его $(n "$vne_obshchego") · с битой целью $(n "$bitye_predmetov")"
echo "    объявлено в $OBYAVLENIE: $(n "$obyavleno") · каталогов-предметов в общем: $(n "$katalogi")"
echo "    архивы отсеяны по МАСКЕ ИМЕНИ $MASKA_ARHIVOV — маска это гипотеза, цель факт"
echo
echo "─── РАСХОЖДЕНИЕ В ОБЕ СТОРОНЫ"
echo "    подключено, но НЕ объявлено: $(n "$r1")"; [ -n "$r1" ] && echo "$r1" | sed 's/^/       🔴 /'
echo "    объявлено, но НЕ подключено: $(n "$r2")"; [ -n "$r2" ] && echo "$r2" | sed 's/^/       🔴 /'
echo "    в общем каталоге, но ни объявлено, ни подключено: $(n "$r4")"; [ -n "$r4" ] && echo "$r4" | sed 's/^/       🔴 /'
echo "    подключено, но ЦЕЛИ НЕТ: $(n "$bitye_predmetov")"; [ -n "$bitye_predmetov" ] && echo "$bitye_predmetov" | sed 's/^/       🔴 /'
echo
echo "─── НЕ РАСХОЖДЕНИЕ, НО ЧАСТЬ ОБЛАСТИ"
echo "    подключено ВНЕ общего каталога (личное узла, учёту общего не подлежит): $(n "$vne_obshchego")"
[ -n "$vne_obshchego" ] && echo "$vne_obshchego" | sed 's/^/       /'
echo "    битых ссылок на зависимости ПЛАТФОРМЫ (<узел>/app/node_modules): $(n "$platf_bit")"
echo "       код НЕ роняют: зона платформы, не наш учёт. Границу называю, беду не сужу."

[ -n "$r1$r2$r4" ] && exit 1
[ -n "$bitye_predmetov" ] && exit 2
[ -n "$ne_prochitany" ] && exit 2
exit 0
