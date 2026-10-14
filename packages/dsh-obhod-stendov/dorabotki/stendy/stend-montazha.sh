#!/bin/bash
# СТЕНД МОНТАЖА ИЗ ТЕГА (montazh-iz-tega). Искра, 07.09.2026.
#
# 🔴 ЗАЧЕМ. Инструмент ставит код в БОЕВОЙ каталог и умеет УДАЛЯТЬ (rsync --delete).
# Написан час назад по решению п.137; стенда не имел. Цена ошибки выше, чем у ворот
# переноса: там дерево репозитория, здесь то, что работает у агентов.
#
# НАПРАВЛЕНИЕ, КОТОРОГО ЖДЁМ: ждём ТИХУЮ ПОСТАНОВКУ НЕ ТОГО — монтаж без тега, монтаж
# чужой версии, стирание файла, живущего только в бою. Ложный отказ громок и дёшев.
# Поэтому главные пробы — про целость боевого каталога, а не про удобство.
#
# ЧЕГО НЕ ПРОВЕРЯЕТ:
#   · ветку «git не найден» и «нет репозитория» (ломать машину ради пробы не станем);
#   · что смонтированное РАБОТАЕТ — это подъём и приёмка, здесь только «то ли поставлено»;
#   · поведение на боевых каталогах: корни подменены, боевое в прогоне не участвует.
set -u
VOROTA=/opt/iskra/workspace/dorabotki/montazh-iz-tega
VSEGO=0; PROVAL=0
B=$(mktemp -d "${TMPDIR:-/tmp}/stend-montazha.XXXXXX") || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$B"' EXIT INT TERM
[ -x "$VOROTA" ] || { echo "СЛЕПОТА: инструмента нет ($VOROTA)"; exit 2; }
command -v git >/dev/null || { echo "СЛЕПОТА: git не найден"; exit 2; }

# ── подставной репозиторий с тегом и подставной «бой» ────────────────────────
gotovim() {                  # $1 — версия в теге
  rm -rf "$B/repo" "$B/boj" "$B/zhurnal.txt"
  mkdir -p "$B/repo/packages/probnyj/src" "$B/boj/proba-paket/src"
  printf '{ "name": "proba-paket", "version": "%s", "private": true }\n' "$1" > "$B/repo/packages/probnyj/package.json"
  printf 'export const a = 1;\n' > "$B/repo/packages/probnyj/src/index.js"
  ( cd "$B/repo" && git init -q . && git add -A \
    && git -c user.name=proba -c user.email=proba@example.invalid commit -qm proba \
    && git tag "proba-paket-v$1" ) >/dev/null 2>&1
  printf '{ "name": "proba-paket", "version": "0.0.0", "private": true }\n' > "$B/boj/proba-paket/package.json"
  printf 'старое\n' > "$B/boj/proba-paket/src/index.js"
}
zovi() { MONTAZH_REPO="$B/repo" MONTAZH_CEL="$B/boj" MONTAZH_ZHURNAL="$B/zhurnal.txt" RUKA=proba "$VOROTA" "$@" 2>&1; }

proba() {                    # имя · ожидаемый код · ожидаемая строка · доводы…
  local imya="$1" zhdem="$2" stroka="$3"; shift 3
  VSEGO=$((VSEGO+1))
  local out; out=$(zovi "$@"); local kod=$?
  local beda=""
  [ "$kod" = "$zhdem" ] || beda="код $kod, ждали $zhdem"
  [ -n "$stroka" ] && ! printf '%s' "$out" | grep -qF "$stroka" && beda="${beda:+$beda; }нет строки «$stroka»"
  if [ -n "$beda" ]; then PROVAL=$((PROVAL+1)); echo "🔴 $imya: $beda"; else echo "  ✅ $imya"; fi
}

echo "── ЗРЯЧЕСТЬ ПЕРВОЙ: штатный монтаж проходит ──"
gotovim 1.0.0
proba "П1 тег есть → монтаж" 0 "смонтировано" proba-paket 1.0.0
VSEGO=$((VSEGO+1))
if grep -q '"version": "1.0.0"' "$B/boj/proba-paket/package.json" 2>/dev/null; then echo "  ✅ П2 версия в бою сменилась на 1.0.0"
else PROVAL=$((PROVAL+1)); echo "🔴 П2 версия в бою НЕ сменилась"; fi
VSEGO=$((VSEGO+1))
if grep -q 'proba-paket 1.0.0' "$B/zhurnal.txt" 2>/dev/null; then echo "  ✅ П3 строка в журнале монтажей есть"
else PROVAL=$((PROVAL+1)); echo "🔴 П3 журнал монтажей не написан"; fi

echo "── БЕЗ ТЕГА НЕ СТАВИМ ──"
gotovim 1.0.0
proba "П4 версии без тега → ОТКАЗ" 1 "локального тега" proba-paket 9.9.9
VSEGO=$((VSEGO+1))
if grep -q '"version": "0.0.0"' "$B/boj/proba-paket/package.json" 2>/dev/null; then echo "  ✅ П5 после отказа бой НЕ ТРОНУТ"
else PROVAL=$((PROVAL+1)); echo "🔴 П5 бой изменён при отказе"; fi

echo "── ГЛАВНОЕ: файл, живущий только в бою ──"
gotovim 1.0.0
printf 'правка чужой рукой\n' > "$B/boj/proba-paket/src/chuzhoe.js"
proba "П6 монтаж стёр бы файл → ОТКАЗ" 1 "стёр бы" proba-paket 1.0.0
VSEGO=$((VSEGO+1))
if [ -f "$B/boj/proba-paket/src/chuzhoe.js" ]; then echo "  ✅ П7 после отказа чужой файл ЦЕЛ"
else PROVAL=$((PROVAL+1)); echo "🔴 П7 чужой файл СТЁРТ — ворота не защитили"; fi
proba "П8 обход с причиной → ставит" 0 "смонтировано" proba-paket 1.0.0 "--soglasna-udalit=проба стенда"
VSEGO=$((VSEGO+1))
if grep -q 'удалено по причине' "$B/zhurnal.txt" 2>/dev/null; then echo "  ✅ П9 обход НАЗВАН в журнале"
else PROVAL=$((PROVAL+1)); echo "🔴 П9 обход в журнале не назван — след неполон"; fi

echo "── ПОДМЕНА ПРЕДМЕТА: тег есть, версия в нём другая ──"
gotovim 1.0.0
# тег на 2.0.0 при манифесте 1.0.0 — тот же номер, другое содержимое
( cd "$B/repo" && git tag proba-paket-v2.0.0 ) >/dev/null 2>&1
proba "П10 тег несёт не ту версию → ОТКАЗ" 1 "подмена предмета" proba-paket 2.0.0

echo "── ГРЯЗНОЕ ДЕРЕВО ──"
gotovim 1.0.0
printf 'незакоммиченное\n' > "$B/repo/packages/probnyj/src/gryaz.js"
proba "П11 дерево грязное → ОТКАЗ" 1 "ГРЯЗНОЕ" proba-paket 1.0.0

echo "── СЛЕПОТЫ И ОТКАЗЫ ВВОДА ──"
gotovim 1.0.0
proba "П12 пакета нет в бою → слепота" 2 "СЛЕПОТА" net-takogo 1.0.0
proba "П13 доводы не названы → отказ" 2 "montazh-iz-tega"
proba "П14 неизвестный ключ → отказ" 2 "неизвестный ключ" proba-paket 1.0.0 "--vydumannyj"
proba "П15 обход с ПУСТОЙ причиной → отказ" 2 "ПУСТОЙ причиной" proba-paket 1.0.0 "--soglasna-udalit="

echo "── ЗРЯЧЕСТЬ ПОСЛЕ ПОРЧ ──"
gotovim 1.0.0
proba "П16 снова штатный монтаж → проходит" 0 "смонтировано" proba-paket 1.0.0

echo "── ХВОСТ ГОВОРИТ ТО ЖЕ, ЧТО НАЧАЛО (07.09.2026) ──"
# 🔴 ЗАЧЕМ: наши инструменты печатают отказ ПЕРВОЙ строкой, а рука смотрит хвост
# (последняя строка = результат). За один отрезок я трижды прочла хвост и трижды не
# увидела отказа. Привычка верна для успеха и ложна для отказа — лечится инструментом.
gotovim 1.0.0
VSEGO=$((VSEGO+1))
OUT=$(zovi proba-paket 9.9.9)
PERV=$(printf '%s' "$OUT" | head -1); POSL=$(printf '%s' "$OUT" | tail -1)
if printf '%s' "$PERV" | grep -q 'ОТКАЗ' && printf '%s' "$POSL" | grep -q 'ИТОГ: ОТКАЗ'; then
  echo "  ✅ П17 при отказе причина и в первой строке, и в последней"
else
  PROVAL=$((PROVAL+1))
  echo "🔴 П17 хвост не повторяет отказ: первая «$PERV», последняя «$POSL»"
fi

echo "── ПРЕДУПРЕЖДЕНИЕ ОБ ОБЩЕМ КАТАЛОГЕ ЗВУЧИТ В ВЫВОДЕ ──"
# 🔴 ЗАЧЕМ: правка в /opt/agent-plugins — это правка у ОБОИХ агентов сразу. Разведение копий
# числилось живым две недели и не действовало; цена уже заплачена (агента подняли на
# непринятой редакции, попавшей туда чужой правкой). Оговорка в ШАПКЕ файла работает как её
# отсутствие: шапку читают редко, вывод — всегда.
VSEGO=$((VSEGO+1))
gotovim 1.0.0
OUT_OBSH=$(MONTAZH_REPO="$B/repo" MONTAZH_CEL=/opt/agent-plugins MONTAZH_ZHURNAL="$B/zh2.txt" \
           RUKA=proba "$VOROTA" net-takogo-paketa 1.0.0 2>&1 || true)
# на несуществующем пакете инструмент отказывает раньше — проверяем сам ТЕКСТ предмета
# 🔴 ИЩЕМ ИМЕННО echo, А НЕ ПРОСТО ТЕКСТ: комментарий с тем же словом не печатается,
# и проба по голому тексту зеленела бы на предмете, где предупреждение вырезано из вывода.
# ⚠️ И честно о том, как это выяснилось: первая порча НЕ ВНЕСЛАСЬ (мой sed не совпал по
# отступу), а я успела записать «проба не упала, потому что находит текст в комментарии» —
# объяснение правдоподобное и НЕПРОВЕРЕННОЕ. Правда открылась печатью ФАКТА ВНЕСЕНИЯ:
# «строк с echo-предупреждением теперь 0». Порча по номеру строки уронила ровно П18 (17 из 18).
# Класс: «порча не уронила» — три диагноза, и первый из них «порчи не было».
if grep -qE 'echo "[^"]*ЭТО ОБЩИЙ КАТАЛОГ МАШИНЫ' "$VOROTA" && grep -q 'case "\$CEL_KOREN"' "$VOROTA"; then
  echo "  ✅ П18 предупреждение об общем каталоге есть и печатается по цели, а не в шапке"
else
  PROVAL=$((PROVAL+1)); echo "🔴 П18 предупреждения об общем каталоге в выводе нет"
fi

# ── ВЛАДЕЛЕЦ ЦЕЛИ НЕ ОТБИРАЕТСЯ МОЛЧА (09.09.2026) ──
# Замер на подставной паре: rsync -a берёт владельца ОТ ИСТОЧНИКА, цель dsh:dsh 664
# становилась iskra:iskra 644 — монтаж молча отбирал пакет. Класс Михалыча: права берутся
# от НАЗНАЧЕНИЯ. Сохранять «как было» отказались осознанно: восстановление требует КАРТЫ
# владельцев (в раскладке Искры каталог root:root, файлы iskra:iskra — chown -R отобрал бы
# файлы у их владельца, проверено ДО внесения). Поэтому fail-closed: стоп и назвать.
VSEGO=$((VSEGO+2))
if grep -q 'VL_IST=' "$VOROTA" && grep -q 'VL_CEL=' "$VOROTA" && \
   grep -qE 'if \[ "\$VL_IST" != "\$VL_CEL" \]' "$VOROTA"; then
  echo "  ✅ П19 сверка владельцев источника и цели стоит ДО переноса"
else
  PROVAL=$((PROVAL+1)); echo "🔴 П19 сверки владельцев перед переносом нет"
fi
# Вторая половина пары: отказ обязан НАЗЫВАТЬ обоих владельцев, иначе «стоп» без предмета.
if grep -qE 'владелец источника \(\$VL_IST\) и цели \(\$VL_CEL\)' "$VOROTA"; then
  echo "  ✅ П20 отказ называет обоих владельцев поимённо"
else
  PROVAL=$((PROVAL+1)); echo "🔴 П20 отказ не называет владельцев — «стоп» без предмета"
fi

echo "итог: $((VSEGO-PROVAL)) из $VSEGO"
[ "$PROVAL" -gt 0 ] && exit 1
exit 0
