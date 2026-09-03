#!/usr/bin/env bash
# Проба согласия README с packages/: числа в заголовках и строки таблиц против
# каталогов на диске.
#
# 🔴 ЗАЧЕМ. 03.09.2026 заглавная страница называла первую таблицу «Plugins» и читалась
# как ПОЛНЫЙ перечень: восемь строк при пятнадцати каталогах. Семейство памяти стояло
# отдельной таблицей ниже, до которой читатель не доходил. Сама по себе каждая таблица
# была верна — ложным было то, как они читались вместе.
#
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба считает СТРОКИ и КАТАЛОГИ. О том, верно ли описан пакет,
# она не говорит ничего; о том, существует ли каталог, на который ведёт ссылка, —
# тоже (это соседняя проба check-readme-index.sh).
set -u
cd "$(dirname "$0")/.." || exit 2
[ -f README.md ] || { echo "СЛЕПОТА: README.md не найден"; exit 2; }
[ -d packages ] || { echo "СЛЕПОТА: каталога packages/ нет"; exit 2; }

katalogov=$(find packages -mindepth 1 -maxdepth 1 -type d | wc -l)

# Строки таблиц: считаем ссылки вида [`имя`](packages/имя) в каждом разделе.
platform=$(awk '/^## Platform plugins/{v=1;next} /^## /{v=0} v' README.md | grep -cE '^\| \[`')
pamyat=$(awk '/^## Memory family/{v=1;next} /^## /{v=0} v' README.md | grep -cE '^\| \[`')
vsego=$(( platform + pamyat ))

# Числа, ОБЪЯВЛЕННЫЕ в заголовках и во вступлении.
zayavleno_vsego=$(grep -oE '^## What is here: ([0-9]+) packages' README.md | grep -oE '[0-9]+' | head -1)
zayavleno_pl=$(grep -oE '^## Platform plugins \(([0-9]+)\)' README.md | grep -oE '[0-9]+' | head -1)
zayavleno_pm=$(grep -oE '^## Memory family .*\(([0-9]+)\)' README.md | grep -oE '[0-9]+' | head -1)

echo "область: README.md против packages/ · каталогов $katalogov · строк таблиц $vsego (платформа $platform + память $pamyat)"
echo "заявлено в заголовках: всего ${zayavleno_vsego:-НЕТ}, платформа ${zayavleno_pl:-НЕТ}, память ${zayavleno_pm:-НЕТ}"

bad=0
for para in "$vsego:$katalogov:строк таблиц против каталогов" \
            "${zayavleno_vsego:-0}:$katalogov:число во вступлении против каталогов" \
            "${zayavleno_pl:-0}:$platform:число в заголовке платформы против строк" \
            "${zayavleno_pm:-0}:$pamyat:число в заголовке памяти против строк"; do
  a=${para%%:*}; rest=${para#*:}; b=${rest%%:*}; chto=${rest#*:}
  if [ "$a" != "$b" ]; then echo "  FAIL $chto: $a против $b"; bad=$((bad+1))
  else echo "  ok   $chto: $a"; fi
done

if [ "$bad" -eq 0 ]; then echo "ИТОГО: сошлось 4, расхождений 0"; exit 0; fi
echo "ИТОГО: расхождений $bad — число в описании разошлось с диском"
exit 1
