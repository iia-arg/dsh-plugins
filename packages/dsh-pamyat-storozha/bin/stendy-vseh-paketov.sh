#!/bin/bash
# stendy-vseh-paketov.sh — прогон стендов всех пакетов памяти СО ЗНАМЕНАТЕЛЕМ.
#
# ЗАЧЕМ (решение координатора 12.09.2026 09:04Z, по замеру исполнителя того же дня).
# До него прогон отвечал КОДОМ ВОЗВРАТА и молчал о своей области. «Стенды зелёные»
# читалось как «все», а на деле означало 50 ИЗ 63: десять стендов слепли, один
# краснел, один обрывался на середине, и два боевых пакета не имели стендов ВООБЩЕ.
# Ни одно из этих чисел никем не печаталось — значит и не читалось.
# ⇒ Здесь знаменатель и разряды печатаются ВСЕГДА, даже когда всё зелено. Тогда
#   слепота перестаёт быть невидимой, и каждый следующий сам решит, беда она или нет.
#
# ЧЕТЫРЕ РАЗРЯДА, А НЕ ТРИ. Третий исход найден 12.09 и до того сливался с двумя:
#   ЗЕЛЁНЫЙ    код 0            — проверено, сошлось
#   КРАСНЫЙ    код 1            — проверено, разошлось (дороже всего, проверяется первым)
#   СЛЕПОЙ     код не 0 и не 1  — проверять нечем (нет соседнего пакета, нет предмета)
#   ПОЛОВИНА   стенд напечатал пробы и ОБОРВАЛСЯ    — проверено наполовину
# Признак различения половины от слепоты: напечатал ли стенд хоть одну пробу ДО падения.
# Слепой молчит с самого начала; оборвавшийся успел сказать «✅» и лишь потом упал —
# и потому его хвост выглядит убедительно, а проверено меньше, чем кажется.
#
# ПРИРОДА ЗЕЛЁНОГО — ПЕЧАТАЕТСЯ РЯДОМ С ЧИСЛОМ (решение координатора 12.09 09:19Z).
# У части пакетов node_modules — СИМЛИНК на общий боевой каталог плагинов машины.
# Их зелёное означает «зелёное при БОЕВЫХ зависимостях», а не «на своих». Это законный
# обход (слепой стенд не печатает проб вовсе, а зелёный с названным условием печатает
# всё), но обход, МОЛЧАЩИЙ о том, что он обход, хуже и слепоты, и честных зависимостей.
# ⇒ Прибор снимает природу САМ, по readlink, а не по записке рядом: записка адресована
#   тому, кто придёт к пакету, а природа нужна тому, кто читает числа.
#   «своё» — настоящий каталог в дереве · «БОЕВЫЕ» — симлинк · «БИТАЯ ССЫЛКА» — цели нет.
# 🔴 БИТАЯ ССЫЛКА НАЗЫВАЕТСЯ ОТДЕЛЬНО ОТ ОТСУТСТВИЯ: у core такая прожила три дня
#   незамеченной именно потому, что ls показывал строку. Прибор смотрит ЦЕЛЬ (readlink -e).
#
# ГДЕ НЕ ПРИМЕНЯЕТСЯ И ЧЕГО НЕ ГОВОРИТ:
#   — считает СТЕНДЫ, а не ПРОБЫ. Цена слепоты в пробах неизвестна по построению:
#     слепой стенд проб не печатает вовсе;
#   — судит по КОДУ ВОЗВРАТА и по наличию строк проб, а не по смыслу написанного;
#   — гоняет дерево КАК ЕСТЬ. У части пакетов зависимости взяты симлинком на боевой
#     каталог — значит «зелено» там означает «зелено при боевом окружении», не вообще;
#   — пакеты без каталога test/ он НЕ пропускает молча, а называет: это часть знаменателя.
#
# ПРИНЯТАЯ СЛЕПОТА ОТДЕЛЕНА ОТ НОВОЙ (решение координатора 12.09.2026 09:35Z).
# Слепота бывает УСТРОЙСТВОМ, а не поломкой: core/stend-privratnika слеп потому, что рядом
# нет службы, и завтра это не изменится. Роняя код на такой слепоте, прибор возвращал бы 2
# ВСЕГДА — и автоматика перестала бы отличать «появилась НОВАЯ беда» от «жизнь идёт».
# Это зеркало нашего правила: сторож, молчащий при исправном, неотличим от сломанного,
# но и сторож, кричащий ВСЕГДА, неотличим от сломанного.
# ⇒ Принятая слепота печатается ВСЕГДА (её видно), но код НЕ роняет. Новая — роняет.
#
# 🔴 КРИТЕРИЙ, ЧТО РОНЯТЬ: код роняет то, что УСТРАНИМО. Отсутствие соседней службы
#   неустранимо здесь и сейчас — это условие. Новая слепота, половина, битая ссылка и
#   УСТАРЕВШАЯ ЗАПИСЬ в списке устранимы — значит роняют.
#
# ⚠️ ГРАНИЦА СПИСКА, чтобы он не стал свалкой (условие координатора):
#   строка обязана нести ДОВОД и ИМЯ ПРИНЯВШЕГО. Нет любого из них — запись НЕГОДНА,
#   и слепота считается НОВОЙ. Умолчание здесь — не гасить, а кричать.
# 🔴 И СПИСОК САМ ПРОВЕРЯЕТСЯ: если стенд числится принято-слепым, а слепоты в прогоне НЕ
#   дал, запись УСТАРЕЛА и роняет код. Иначе она осталась бы заряженной: стенд ослепнет
#   завтра по ДРУГОЙ причине, и список погасит новую беду молча.
#
# КОДЫ: 0 всё зелено | 1 есть расхождение | 2 новая слепота, половина, битая ссылка
#       или устаревшая запись списка. ПРИНЯТАЯ слепота код не роняет.
# EN: stendy-vseh-paketov.sh — a run of the stands of all memory packages WITH A DENOMINATOR.
#     WHY (coordinator's decision of 12.09.2026 09:04Z, based on the executor's measurement of the same day).
#     Before it the run answered with an EXIT CODE and was silent about its scope. "The stands are green" read
#     as "all", but in fact meant 50 OF 63: ten stands were blind, one was red, one broke off halfway, and two
#     production packages had no stands AT ALL. None of these numbers was printed by anyone — so none was read.
#     ⇒ Here the denominator and the classes are printed ALWAYS, even when everything is green. Then blindness
#     stops being invisible, and each next reader decides for themselves whether it is trouble.
#     FOUR CLASSES, NOT THREE. The third outcome was found on 12.09 and until then merged with the other two:
#     GREEN code 0 — checked, matches
#     RED code 1 — checked, diverges (the most expensive, checked first)
#     BLIND code neither 0 nor 1 — nothing to check with (no neighbouring package, no subject)
#     HALF the stand printed probes and BROKE OFF — checked halfway
#     The sign telling half from blindness: whether the stand printed at least one probe BEFORE failing. A blind
#     one is silent from the start; a broken-off one managed to say "✅" and only then failed — so its tail looks
#     convincing, while less was checked than it seems.
#     THE NATURE OF GREEN IS PRINTED NEXT TO THE NUMBER (coordinator's decision 12.09 09:19Z). Some packages
#     have node_modules as a SYMLINK to the machine's shared production plugin directory. Their green means
#     "green with PRODUCTION dependencies", not "with their own". This is a legitimate workaround (a blind stand
#     prints no probes at all, while a green one with a named condition prints everything), but a workaround
#     SILENT about being a workaround is worse than both blindness and honest dependencies.
#     ⇒ The tool takes the nature ITSELF, by readlink, not from a note alongside: the note is addressed to
#     whoever comes to the package, while the nature is needed by whoever reads the numbers. "своё" — a real
#     directory in the tree · "БОЕВЫЕ" — a symlink · "БИТАЯ ССЫЛКА" — no target.
#     🔴 A BROKEN LINK IS NAMED SEPARATELY FROM ABSENCE: core had one living unnoticed for three days precisely
#     because ls showed a line. The tool looks at the TARGET (readlink -e).
#     WHERE IT DOES NOT APPLY AND WHAT IT DOES NOT SAY:
#     — it counts STANDS, not PROBES. The price of blindness in probes is unknown by construction: a blind stand
#     prints no probes at all;
#     — it judges by the EXIT CODE and by the presence of probe lines, not by the meaning of what is written;
#     — it runs the tree AS IS. Some packages take dependencies by a symlink to the production directory — so
#     "green" there means "green in the production environment", not in general;
#     — packages without a test/ directory are NOT skipped silently but named: they are part of the denominator.
#     ACCEPTED BLINDNESS IS SEPARATED FROM NEW (coordinator's decision of 12.09.2026 09:35Z). Blindness can be
#     BY DESIGN, not a breakage: core/stend-privratnika is blind because there is no service alongside, and that
#     will not change tomorrow. Dropping the code on such blindness, the tool would return 2 ALWAYS — and
#     automation would stop telling "a NEW trouble appeared" from "life goes on". This mirrors our rule: a
#     watcher silent on a healthy subject is indistinguishable from a broken one, but so is a watcher that
#     shouts ALWAYS.
#     ⇒ Accepted blindness is printed ALWAYS (it is visible) but does NOT drop the code. New blindness does.
#     🔴 THE CRITERION FOR WHAT DROPS: the code is dropped by what is FIXABLE. A missing neighbouring service is
#     unfixable here and now — it is a condition. New blindness, a half, a broken link and an OUTDATED list
#     entry are fixable — so they drop the code.
#     ⚠️ THE LIST'S LIMIT, so that it does not become a dump (coordinator's condition): a line must carry a
#     REASON and the NAME OF WHO ACCEPTED it. Missing either — the entry is INVALID, and the blindness counts as
#     NEW. The default here is not to mute but to shout.
#     🔴 AND THE LIST ITSELF IS CHECKED: if a stand is listed as accepted-blind but gave no blindness in the run,
#     the entry is OUTDATED and drops the code. Otherwise it would stay loaded: the stand goes blind tomorrow
#     for ANOTHER reason, and the list mutes the new trouble silently.
#     CODES: 0 all green | 1 there is a divergence | 2 new blindness, a half, a broken link or an outdated list
#     entry. ACCEPTED blindness does not drop the code.
set -uo pipefail
# Файл настройки пакета dsh-pamyat-storozha: строки «КЛЮЧ=значение», «#» — комментарий; берётся последнее вхождение.
# Путь меняет DSH_PAMYAT_STOROZHA_CONF. Порядок: переменная → файл → нейтральное умолчание; нет ничего — СЛЕПОТА, код 2.
# EN: Settings file of the dsh-pamyat-storozha package: "KEY=value" lines, a line starting with "#" is a
#     comment; the last occurrence wins.
#     DSH_PAMYAT_STOROZHA_CONF changes the path. Order: variable → file → neutral default; nothing at all —
#     BLINDNESS, code 2.
DSH_PAMYAT_STOROZHA_CONF="${DSH_PAMYAT_STOROZHA_CONF:-/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf}"
# « #» в значении — громкий отказ (stderr, код 2), а не склеивание пояснения со значением; зовущий обязан выйти: X=$(konf …) || exit 2.
# EN: " #" in a value is a loud refusal (stderr, code 2), not gluing the note into the value; the caller must exit: X=$(konf …) || exit 2.
konf() { local v; v=$(sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" "$DSH_PAMYAT_STOROZHA_CONF" 2>/dev/null | tail -n 1) || true; case "$v" in *[[:space:]]#*) echo "ОТКАЗ: значение ключа $1 в $DSH_PAMYAT_STOROZHA_CONF содержит « #» — комментарий допускается только с начала строки" >&2; return 2;; esac; v=$(printf '%s' "$v" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"); printf '%s' "${v:-$2}"; }
KLON_PAKETOV=$(konf DSH_PLUGINS_KLON "") || exit 2
PKG_DIR="${STENDY_PKG_DIR:-${KLON_PAKETOV:+$KLON_PAKETOV/packages}}"
OBRAZEC="${STENDY_OBRAZEC:-dsh-pamyat-*}"
PREDEL="${STENDY_PREDEL:-120}"
SPISOK_SLEPOTY="${STENDY_SPISOK_SLEPOTY:-$(konf STENDY_SPISOK_SLEPOTY "$(dirname "$0")/prinyataya-slepota.txt")}" || exit 2

[ -n "$PKG_DIR" ] || { echo "СЛЕПОТА: каталог пакетов не задан — STENDY_PKG_DIR или ключ DSH_PLUGINS_KLON в $DSH_PAMYAT_STOROZHA_CONF"; exit 2; }
[ -d "$PKG_DIR" ] || { echo "СЛЕПОТА: каталога пакетов нет: $PKG_DIR"; exit 2; }

# Перечень ПРИНЯТОЙ слепоты: "пакет/стенд | довод | кто принял | дата".
# Запись без довода или без принявшего НЕГОДНА — такая слепота остаётся новой.
# EN: List of ACCEPTED blindness: "package/stand | reason | who accepted | date".
#     An entry without a reason or without who accepted it is INVALID — such blindness remains new.
prinyatye=""; negodnyh=0; imena_negodnyh=""
if [ -f "$SPISOK_SLEPOTY" ]; then
  while IFS= read -r stroka || [ -n "$stroka" ]; do
    case "$stroka" in ''|'#'*) continue ;; esac
    imya_z=$(printf '%s' "$stroka" | awk -F'|' '{gsub(/[ \t]/,"",$1); print $1}')
    dovod=$(printf '%s' "$stroka"  | awk -F'|' '{print $2}' | sed 's/^[ \t]*//;s/[ \t]*$//')
    prinyal=$(printf '%s' "$stroka"| awk -F'|' '{print $3}' | sed 's/^[ \t]*//;s/[ \t]*$//')
    if [ -z "$imya_z" ] || [ -z "$dovod" ] || [ -z "$prinyal" ]; then
      negodnyh=$((negodnyh+1)); imena_negodnyh="$imena_negodnyh ${imya_z:-<без-имени>}"
      continue
    fi
    prinyatye="$prinyatye $imya_z"
  done < "$SPISOK_SLEPOTY"
fi

# Природа зависимостей пакета: снимается с ЦЕЛИ ссылки, не с её наличия.
# EN: The nature of the package's dependencies: taken from the link's TARGET, not from its presence.
priroda() {
  local p=$1
  if [ -L "$p/node_modules" ]; then
    if [ -n "$(readlink -e "$p/node_modules")" ]; then echo "БОЕВЫЕ"; else echo "БИТАЯ"; fi
  elif [ -d "$p/node_modules" ]; then echo "своё"
  else echo "нет"; fi
}

vsego=0; zel=0; kras=0; slep=0; polov=0; slep_prin=0
imena_slep_prin=""; slepye_fakt=""
zel_boevye=0; imena_bityh=""
paketov=0; bez_stendov=""
imena_kras=""; imena_slep=""; imena_polov=""

for p in "$PKG_DIR"/$OBRAZEC; do
  [ -d "$p" ] || continue
  imya=$(basename "$p")
  paketov=$((paketov+1))
  prir=$(priroda "$p")
  case "$prir" in
    БОЕВЫЕ) pometka=" ⚠️ НА БОЕВЫХ ЗАВИСИМОСТЯХ, не на своих" ;;
    БИТАЯ)  pometka=" 🔴 node_modules — БИТАЯ ССЫЛКА (цели нет): зелёное здесь не про зависимости"
            imena_bityh="$imena_bityh $imya" ;;
    нет)    pometka=" · зависимостей нет вовсе" ;;
    *)      pometka="" ;;
  esac
  stendy=( "$p"/test/stend-*.mjs )
  if [ ! -e "${stendy[0]}" ]; then
    bez_stendov="$bez_stendov $imya"
    printf '%-24s %s%s\n' "$imya" "— СТЕНДОВ НЕТ ВОВСЕ (test/ пуст или отсутствует)" "$pometka"
    continue
  fi
  p_vsego=0; p_zel=0; p_kras=0; p_slep=0; p_polov=0; p_slep_prin=0
  for s in "${stendy[@]}"; do
    n=$(basename "$s")
    p_vsego=$((p_vsego+1)); vsego=$((vsego+1))
    vyv=$(cd "$p" && timeout "$PREDEL" node "test/$n" 2>&1); kod=$?
    if [ $kod -eq 1 ] && ! echo "$vyv" | grep -q 'ERR_MODULE_NOT_FOUND'; then
      p_kras=$((p_kras+1)); kras=$((kras+1)); imena_kras="$imena_kras $imya/$n"
    elif echo "$vyv" | grep -q 'ERR_MODULE_NOT_FOUND' && echo "$vyv" | grep -qE '✅|❌'; then
      p_polov=$((p_polov+1)); polov=$((polov+1)); imena_polov="$imena_polov $imya/$n"
    elif [ $kod -ne 0 ]; then
      slepye_fakt="$slepye_fakt $imya/$n"
      if printf '%s' " $prinyatye " | grep -qF " $imya/$n "; then
        p_slep_prin=$((p_slep_prin+1)); slep_prin=$((slep_prin+1))
        imena_slep_prin="$imena_slep_prin $imya/$n"
      else
        p_slep=$((p_slep+1)); slep=$((slep+1)); imena_slep="$imena_slep $imya/$n"
      fi
    else
      p_zel=$((p_zel+1)); zel=$((zel+1))
    fi
  done
  [ "$prir" = "БОЕВЫЕ" ] && zel_boevye=$((zel_boevye+p_zel))
  printf '%-24s зелёных %2d из %2d · красных %d · слепых %d (принятых %d) · половина %d%s\n' \
    "$imya" $p_zel $p_vsego $p_kras $p_slep $p_slep_prin $p_polov "$pometka"
done

# 🔴 КОНТРОЛЬ ЗРЯЧЕСТИ: ноль стендов при живых пакетах — это отказ прибора, а не чистота.
# EN: 🔴 BLINDNESS CONTROL: zero stands with live packages is a tool failure, not cleanliness.
if [ $vsego -eq 0 ]; then
  echo "СЛЕПОТА ПРИБОРА: пакетов обойдено $paketov, стендов найдено 0 — мерить нечем"
  echo "  область: $PKG_DIR, пакеты $OBRAZEC, стенды test/stend-*.mjs"
  exit 2
fi

echo
echo "═══ ЗЕЛЁНЫХ $zel ИЗ $vsego · красных $kras · слепых НОВЫХ $slep (принятых $slep_prin) · проверено наполовину $polov"
echo "    ИЗ ЗЕЛЁНЫХ $zel_boevye ПОЛУЧЕНЫ НА БОЕВЫХ ЗАВИСИМОСТЯХ (симлинк), а не на своих —"
echo "    их «зелено» означает «зелено при боевом окружении»; разойдутся боевые — соврут молча"
echo "    пакетов обойдено $paketov, из них БЕЗ СТЕНДОВ${bez_stendov:- нет}"
echo "    область: $PKG_DIR, пакеты $OBRAZEC, перечень СНЯТ С ДИСКА по маске test/stend-*.mjs"
echo "    считаны СТЕНДЫ, не пробы: цена слепоты в пробах неизвестна — слепой проб не печатает"
[ -n "$imena_bityh" ] && { echo "    🔴 БИТАЯ ССЫЛКА node_modules (хуже отсутствующей — создаёт видимость):"; for i in $imena_bityh; do echo "       $i"; done; }
[ -n "$imena_kras" ]  && { echo "    🔴 РАСХОЖДЕНИЕ:"; for i in $imena_kras; do echo "       $i"; done; }
[ -n "$imena_polov" ] && { echo "    ⚠️  ПРОВЕРЕНО НАПОЛОВИНУ (оборвался после первых проб):"; for i in $imena_polov; do echo "       $i"; done; }
[ -n "$imena_slep" ]  && { echo "    ⚠️  СЛЕПОТА НОВАЯ (проверять нечем, в списке принятых её нет):"; for i in $imena_slep; do echo "       $i"; done; }
[ -n "$imena_slep_prin" ] && { echo "    ·   слепота ПРИНЯТАЯ (кода не роняет, довод в $SPISOK_SLEPOTY):"; for i in $imena_slep_prin; do echo "       $i"; done; }
[ $negodnyh -gt 0 ] && { echo "    🔴 ЗАПИСЕЙ СПИСКА НЕГОДНО $negodnyh (нет довода или имени принявшего) — их слепота считается НОВОЙ:"; for i in $imena_negodnyh; do echo "       $i"; done; }

# 🔴 САМОПРОВЕРКА СПИСКА: числится принятой, а слепоты не дал ⇒ запись устарела.
# EN: 🔴 LIST SELF-CHECK: listed as accepted, yet gave no blindness ⇒ the entry is outdated.
ustarelo=""
for z in $prinyatye; do
  printf '%s' " $slepye_fakt " | grep -qF " $z " || ustarelo="$ustarelo $z"
done
[ -n "$ustarelo" ] && { echo "    🔴 ЗАПИСЬ СПИСКА УСТАРЕЛА (числится принято-слепым, а слепоты НЕ дал —"
                        echo "       снять из списка: иначе погасит НОВУЮ слепоту того же стенда молча):"
                        for i in $ustarelo; do echo "       $i"; done; }

[ $kras -gt 0 ] && exit 1
# 🔴 БИТАЯ ССЫЛКА РОНЯЕТ ПРОГОН В КОД 2, наравне со слепотой, и вот почему.
# Печать без кода называет природу только тому, кто ЧИТАЕТ вывод. Кто смотрит код
# возврата — а так смотрит любая автоматика — увидел бы 0 и прочёл «всё зелено».
# Битая ссылка означает «стенды прошли НЕ на тех зависимостях, что мы думаем»,
# то есть то же семейство, что слепота: проверено не то. Это не расхождение (код 1):
# расхождение — про предмет, а здесь про область проверки.
# Роняем то, что УСТРАНИМО: новую слепоту, половину, битую ссылку, порчу списка.
# ПРИНЯТАЯ слепота ($slep_prin) кода не роняет — она условие, а не поломка.
# EN: 🔴 A BROKEN LINK DROPS THE RUN TO CODE 2, on a par with blindness, and here is why. Printing without a code
#     names the nature only to whoever READS the output. Whoever looks at the exit code — and any automation
#     looks that way — would see 0 and read "all green". A broken link means "the stands passed on DIFFERENT
#     dependencies than we think", i.e. the same family as blindness: the wrong thing was checked. It is not a
#     divergence (code 1): a divergence is about the subject, while this is about the scope of the check.
#     We drop what is FIXABLE: new blindness, a half, a broken link, list corruption. ACCEPTED blindness
#     ($slep_prin) does not drop the code — it is a condition, not a breakage.
{ [ $slep -gt 0 ] || [ $polov -gt 0 ] || [ -n "$imena_bityh" ] \
  || [ $negodnyh -gt 0 ] || [ -n "$ustarelo" ]; } && exit 2
exit 0
