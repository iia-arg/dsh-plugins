#!/bin/bash
# Обход класса «байтовая обрезка рвёт UTF-8» по ПЕРЕЧНЮ ИДИОМ.
# Исходы: 0 — не найдено; 1 — найдено; 2 — проверять нечем (слепота).
# EN: A sweep of the class "byte truncation tears UTF-8" by an IDIOM LIST.
#     Outcomes: 0 — not found; 1 — found; 2 — nothing to check with (blindness).
set -uo pipefail
# Файл настройки пакета dsh-pribory: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение.
# Путь меняет DSH_PRIBORY_CONF. Порядок: переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
# EN: Settings file of the dsh-pribory package: "KEY=value" lines, a line starting with "#" is a comment; the
#     last occurrence wins.
#     DSH_PRIBORY_CONF changes the path. Order: variable → file → neutral default; nothing at all — BLINDNESS,
#     code 2.
DSH_PRIBORY_CONF="${DSH_PRIBORY_CONF:-/etc/dsh-pribory/dsh-pribory.conf}"
# « #» в значении — громкий отказ (stderr, код 2), а не склеивание пояснения со значением; зовущий обязан выйти: X=$(konf …) || exit 2.
# EN: " #" in a value is a loud refusal (stderr, code 2), not gluing the note into the value; the caller must exit: X=$(konf …) || exit 2.
konf() { local v; v=$(sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" "$DSH_PRIBORY_CONF" 2>/dev/null | tail -n 1) || true; case "$v" in *[[:space:]]#*) echo "ОТКАЗ: значение ключа $1 в $DSH_PRIBORY_CONF содержит « #» — комментарий допускается только с начала строки" >&2; return 2;; esac; v=$(printf '%s' "$v" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); printf '%s' "${v:-$2}"; }
IDIOMY="${IDIOMY:-$(konf OBREZKA_IDIOMY "")}" || exit 2
OBLAST="${OBLAST:-$(konf OBREZKA_OBLAST "")}" || exit 2
[ -n "$IDIOMY" ] && [ -n "$OBLAST" ] || { echo "🔴 СЛЕПОТА: перечни не заданы — IDIOMY/OBLAST или ключи OBREZKA_IDIOMY/OBREZKA_OBLAST в $DSH_PRIBORY_CONF"; exit 2; }

for f in "$IDIOMY" "$OBLAST"; do
  [ -s "$f" ] || { echo "🔴 СЛЕПОТА: нет или пуст $f — проверять нечем. Это НЕ «чисто»."; exit 2; }
done

mapfile -t PATTS < <(grep -v '^#' "$IDIOMY" | grep -v '^$' | cut -d'|' -f1)
mapfile -t DIRS  < <(grep -v '^#' "$OBLAST" | grep -v '^$')

# Пути наших файлов — из учёта доработок, поимённо. Нет учёта — разделять нечем,
# и проба говорит это вслух, а не молча возвращается к отбору по имени.
# EN: Paths of our files come from the enhancements ledger, by name. No ledger — nothing to separate with, and
#     the probe says so aloud rather than silently falling back to selection by name.
MANIFEST_FAJL="${MANIFEST_FAJL:-$(konf OBREZKA_MANIFEST "")}" || exit 2
UCHYOT_EST=0
if [ -r "$MANIFEST_FAJL" ]; then
  UCHYOT_EST=1
  MANIFEST_PUTI=$(cut -d'|' -f2 "$MANIFEST_FAJL")
else
  MANIFEST_PUTI=""
  echo "⚠️  учёт доработок недоступен ($MANIFEST_FAJL) — принадлежность не проверяется,"
  echo "    все находки идут как наши: это ОСЛАБЛЕНИЕ, а не тишина"
fi
vne_uchyota=0
[ "${#PATTS[@]}" -gt 0 ] && [ "${#DIRS[@]}" -gt 0 ] || { echo "🔴 СЛЕПОТА: список пуст после разбора"; exit 2; }

echo "ОБЛАСТЬ: каталогов ${#DIRS[@]}, идиом ${#PATTS[@]}"
# 🔴 ОБЛАСТЬ ПЕЧАТАЕТСЯ ЦЕЛИКОМ, А НЕ НАПОЛОВИНУ. Прежде здесь стояло число
# каталогов и идиом — но не РУКА и не ОТКАЗЫ. 03.09.2026 трое за час получили
# «их нет» вместо «я не мог их увидеть»: у одного мешали права, у другого глубина,
# у меня шаблон. Ноль обязан читаться как «столько нашлось В ЭТИХ границах».
# ГДЕ НЕ ПРИМЕНЯЕТСЯ: проба не пытается обойти отказ и не просит прав — называет.
# EN: 🔴 THE SCOPE IS PRINTED WHOLE, NOT HALF. Previously there was a count of directories and idioms here — but
#     not the HAND and not the REFUSALS. On 03.09.2026 three agents within an hour got "there are none" instead
#     of "I could not see them": for one, rights got in the way, for another, depth, for me, the pattern. A zero
#     must read as "this many were found WITHIN THESE limits".
#     WHERE IT DOES NOT APPLY: the probe does not try to get around a refusal and does not ask for rights — it
#     names it.
OSHIB_OBHODA=$(for d in "${DIRS[@]}"; do grep -rn "" "$d" 2>&1 >/dev/null; done | wc -l)
echo "  рука: $(id -un) · отказов при чтении: $OSHIB_OBHODA · глубина обхода НЕ ограничена"
if [ "$OSHIB_OBHODA" -gt 0 ]; then
  echo "  🔴 ОБХОД НЕПОЛОН: часть каталогов не прочлась — сказанное ниже про то, что УДАЛОСЬ увидеть"
fi
nayd=0; obojd=0; net=0; izv=0
ISKL="${ISKL:-$(konf OBREZKA_ISKL "")}" || exit 2
for d in "${DIRS[@]}"; do
  if [ ! -e "$d" ]; then echo "  вне обхода: $d — нет такого пути"; net=$((net+1)); continue; fi
  obojd=$((obojd+1))
  for p in "${PATTS[@]}"; do
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      # 🔴 Комментарии не исполняются — обрезка в них безвредна. Без этого проба
      # ловит собственные пояснения и чужие предупреждения об этом же классе
      # (02.09: пять ложных находок в agent-alert, где идиома стоит в комментарии,
      # объясняющем, почему она там безопасна). Признак — начало строки после
      # номера; блочный комментарий без ведущего знака проба увидит: ложно-красное,
      # лечится объявлением в исключениях, и это лучше пропуска.
      # EN: 🔴 Comments are not executed — truncation in them is harmless. Without this the probe catches its own
      #     explanations and other people's warnings about this very class (02.09: five false findings in
      #     agent-alert, where the idiom stands in a comment explaining why it is safe there). The sign is the
      #     start of the line after the number; a block comment without a leading mark will be seen by the
      #     probe: a false red, cured by declaring it in the exceptions, and that is better than a miss.
      t=$(printf '%s' "$line" | sed 's/^[^:]*:[0-9]*://' | sed 's/^[[:space:]]*//')
      case "$t" in '#'*|'//'*|'*'*|'/*'*) continue ;; esac
      # Объявленные исключения печатаются ПОИМЁННО и не красят исход: молчание
      # о них читалось бы как «не искали». Список обязан убывать, а не расти.
      # EN: Declared exceptions are printed BY NAME and do not colour the outcome: silence about them would read
      #     as "not searched". The list must shrink, not grow.
      adres="${line%%:*}:$(printf '%s' "$line" | cut -d: -f2)"
      if [ -f "$ISKL" ] && grep -qF "$adres|" "$ISKL"; then
        izv=$((izv+1)); echo "  вне проверки [$adres] $(grep -F "$adres|" "$ISKL" | cut -d'|' -f2)"
        continue
      fi
      # 🔴 ОТБОР ПО ПРИНАДЛЕЖНОСТИ, А НЕ ПО РАСШИРЕНИЮ (долг 57). Прежде проба
      # брала всё, что нашёл grep, и отсеивала масками (.bak|.log|…). Чужой .sh,
      # положенный в наш каталог, разбирался как свой — и потребовал бы объяснять
      # чужие обрезки. Учёт доработок знает НАШИ файлы поимённо, и это надёжнее
      # имени: имя — догадка о принадлежности, манифест — запись о ней.
      # ГДЕ НЕ ПРИМЕНЯЕТСЯ: находка в файле ВНЕ учёта не выбрасывается — она
      # считается отдельно и печатается. Выбросить значило бы ослабить пробу
      # (наш новый файл ещё не в манифесте), а сложить вместе — вернуть исходную
      # беду. Разделение предметов, не послабление.
      # EN: 🔴 SELECTION BY OWNERSHIP, NOT BY EXTENSION (debt 57). Previously the probe took everything grep
      #     found and filtered with masks (.bak|.log|…). Someone else's .sh put into our directory was parsed as
      #     ours — and would have required explaining someone else's truncations. The enhancements ledger knows
      #     OUR files by name, and that is more reliable than a name: a name is a guess about ownership, a
      #     manifest is a record of it.
      #     WHERE IT DOES NOT APPLY: a finding in a file OUTSIDE the ledger is not thrown away — it is counted
      #     separately and printed. Throwing it away would weaken the probe (our new file is not in the manifest
      #     yet), and adding it in would bring back the original trouble. A separation of subjects, not a
      #     relaxation.
      fajl=${line%%:*}
      if [ "$UCHYOT_EST" -eq 0 ] || command grep -qxF -- "$fajl" <<< "$MANIFEST_PUTI"; then
        nayd=$((nayd+1)); echo "  НАЙДЕНО [$p] $line"
      else
        vne_uchyota=$((vne_uchyota+1)); echo "  вне учёта [$p] $line"
      fi
    # 🔴 Проба исключает СВОИ СПИСКИ поимённо: в них искомые идиомы лежат как
    # ДАННЫЕ, и без исключения проба находит сама себя — «проверка содержит ровно
    # то, что запрещает». Исключение именно поимённое, а не по маске: маска
    # заодно спрятала бы настоящие находки в соседних файлах.
    # EN: 🔴 The probe excludes ITS OWN LISTS by name: the idioms it looks for lie in them as DATA, and without
    #     the exclusion the probe finds itself — "the check contains exactly what it forbids". The exclusion is
    #     by name, not by mask: a mask would also hide real findings in neighbouring files.
    done < <(grep -rnE --binary-files=without-match "$p" "$d" 2>/dev/null \
             | grep -vE '^[^:]*\.(bak|orig|log|md)(-[^:]*)?:|^[^:]*/(node_modules|\.git)/' \
             | grep -vF "$IDIOMY:" | grep -vF "$OBLAST:" | grep -vF "$0:" \
             | { if [ -n "$ISKL" ]; then grep -vF -- "$ISKL:"; else cat; fi; } | grep -vE "/peredacha-proba-obrezki\.txt:")
  done
done
echo "ИТОГО: найдено $nayd (в файлах ИЗ УЧЁТА); вне учёта $vne_uchyota; объявленных исключений $izv; обойдено каталогов $obojd из ${#DIRS[@]}; вне обхода $net"
[ "$nayd" -gt 0 ] && exit 1
[ "$net" -eq 0 ] && [ "$OSHIB_OBHODA" -eq 0 ] || exit 2
exit 0
