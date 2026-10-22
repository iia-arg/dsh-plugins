#!/bin/bash
# СТЕНД ИСКЛЮЧЕНИЙ И КОДОВ ОБХОДЧИКА vse-stendy-boevye.sh (B-H-203, Искра, 25.09.2026).
# Ждём (заранее): 0 — чисто · 3 — только ожидаемое · 1 — неожиданное (в т.ч. слепота без исключения — дефект Беты,
# просроченное, неподтверждённое, иной признак/выпуск; same-count-different-names Гаммы) · 2 — файла исключений нет.
# Приоритет 1 → 2 → 3 → 0, печатаются все результаты. Всё подставное во временном каталоге; боевые область, перечень
# и /etc/agent-registry/stend-exceptions.yaml не читаются.
# Где не применяется: строки области «@учётка»; поведение настоящих стендов (их судит сам обход).
set -u
OBH="${OBHODCHIK_BIN:-/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh}"
[ -f "$OBH" ] || { echo "СЛЕПОТА: нет обходчика $OBH"; exit 2; }
T=$(mktemp -d /tmp/stend-isklyuchenij.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$T"' EXIT
ok=0; bad=0
BUD="2099-01-01T00:00:00Z"; PROSHL="2020-01-01T00:00:00Z"
paket() {   # paket <стенды: zel slep kras kras2 …> — пакет pkg 1.0.0, перечень = все его стенды
  rm -rf "$T/pkg"; mkdir -p "$T/pkg/test"; printf '{"name":"pkg","version":"1.0.0"}\n' > "$T/pkg/package.json"
  local s; for s in "$@"; do case "$s" in
    zel)   printf '#!/bin/bash\nexit 0\n' ;;
    slep)  printf '#!/bin/bash\necho "СЛЕПОТА: признак-слепоты"\nexit 2\n' ;;
    kras)  printf '#!/bin/bash\necho "❌ признак-красноты"\nexit 1\n' ;;
    kras2) printf '#!/bin/bash\necho "❌ другая-краснота"\nexit 1\n' ;;
    koren) printf '#!/bin/bash\n[ -n "${DSH_KOREN_PLATFORMY:-}" ] && exit 0\necho "СЛЕПОТА: нет корня платформы"\nexit 2\n' ;;
    # B-N-1987: publ/publ80 — строки stend-publikacii 10.10 ДОСЛОВНО (подстава, достижимая в бою; 80-я — без признака записи)
    publ|publ80) printf '#!/bin/bash\ncat "%s/%s.txt"\nexit 2\n' "$T" "$s" ;;
    smes)  printf '#!/bin/bash\necho "❌ признак-красноты"\necho "❌ другая-краснота"\nexit 1\n' ;;
    nemark) printf '#!/bin/bash\necho "line 4: 1: предмет-подставной"\nexit 1\n' ;;
    propusk) printf '#!/bin/bash\necho "ПРОПУСК (подставной предмет не установлен — проверять нечем)"\necho "зелёных: 4  красных: 0  пропущено: 1"\nexit 2\n' ;;
  esac > "$T/pkg/test/stend-$s.sh"; done
  ls -1 "$T"/pkg/test/stend-*.sh > "$T/perechen"
}
isk() {     # isk <строки записей YAML> — файл исключений; без аргументов — exceptions: []
  if [ $# -eq 0 ]; then echo 'exceptions: []' > "$T/isk.yaml"; return; fi
  { echo 'exceptions:'; for z in "$@"; do printf '%s\n' "$z"; done; } > "$T/isk.yaml"
}
zap() {     # zap стенд выпуск код признак срок [причина] — B-N-932: причина по умолчанию ПО ФОРМЕ замера
  printf '  - stend: "%s"\n    vypusk: "%s"\n    kod: %s\n    priznak: "%s"\n    prichina: "%s"\n    otvetstvennyj: "Искра"\n    peresmotr: "%s"' "$1" "$2" "$3" "$4" "${6:-замер 2026-09-26 чем: проба}" "$5"
}
progon() { OBLAST_STENDOV="${OBL:-$T/pkg/}" PERECHEN_STENDOV="$T/perechen" ISKLYUCHENIYA_STENDOV="${1:-$T/isk.yaml}" bash "$OBH" > "$T/vyvod" 2>&1; echo $?; }
proba() {   # имя · ждём код · строка-обязана (или «-») · строка-запрещена (или «-»)
  local imya="$1" zhd="$2" est="$3" net="$4" K; K=$(progon "${5:-}")
  local beda=""
  [ "$K" = "$zhd" ] || beda="код $K, ждали $zhd"
  [ "$est" = - ] || grep -qF -- "$est" "$T/vyvod" || beda="${beda:+$beda; }нет «$est»"
  [ "$net" = - ] || ! grep -qF -- "$net" "$T/vyvod" || beda="${beda:+$beda; }лишнее «$net»"
  if [ -z "$beda" ]; then ok=$((ok+1)); echo "  ok    $imya"; else bad=$((bad+1)); echo "  FAIL  $imya — $beda"; fi
}
paket zel; isk
proba "1 всё зелёное, exceptions: [] → 0" 0 "код 0" "НЕОЖИДАННО"
paket zel slep; isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD)"
proba "2 слепой С действующим исключением → 3, ОЖИДАЕМО с причиной и сроком" 3 "ОЖИДАЕМО: pkg/stend-slep.sh (выпуск 1.0.0) · код 2 · замер 2026-09-26 чем: проба · ответственный Искра · пересмотр $BUD" "НЕОЖИДАННО"
paket zel slep; isk
proba "3 ДЕФЕКТ БЕТЫ: слепой без исключения → 1, не 0" 1 "⚠️ НЕОЖИДАННО: pkg/stend-slep.sh (выпуск 1.0.0, код 2) — СЛЕПОТА: исключения нет" -
paket zel kras; isk "$(zap pkg/stend-kras.sh 1.0.0 1 признак-красноты $BUD)"
proba "4 красный С исключением → 3" 3 "ОЖИДАЕМО: pkg/stend-kras.sh" "НЕОЖИДАННО"
paket kras kras2; mv "$T/pkg/test/stend-kras.sh" "$T/k"; printf '#!/bin/bash\nexit 0\n' > "$T/pkg/test/stend-kras.sh"; rm -f "$T/k"
isk "$(zap pkg/stend-kras.sh 1.0.0 1 признак-красноты $BUD)"
proba "5 SAME-COUNT-DIFFERENT-NAMES (Гамма): известный исправлен, другой сломан, красных снова 1 → 1, имя нового, старое устарело" 1 "НЕОЖИДАННО: pkg/stend-kras2.sh" -
grep -qF "исключение устарело (стенд зелёный — снять запись): pkg/stend-kras.sh" "$T/vyvod" && { ok=$((ok+1)); echo "  ok    5б устаревшее исключение названо"; } || { bad=$((bad+1)); echo "  FAIL  5б устаревшее исключение не названо"; }
paket zel slep; isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $PROSHL)"
proba "6 ПРОСРОЧЕННОЕ исключение → 1" 1 "исключение ПРОСРОЧЕНО (пересмотр $PROSHL" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты 2026-13-40T00:00:00Z)"
proba "7 НЕГОДНАЯ дата → «НЕ ПОДТВЕРЖДЕНО», код 1, не разрешение" 1 "исключение НЕ ПОДТВЕРЖДЕНО" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты 2026-10-02)"
proba "7б дата без времени и Z → НЕ ПОДТВЕРЖДЕНО" 1 "peresmotr не ГГГГ-ММ-ДДTчч:мм:ссZ" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD 'признак-слепоты — служба не найдена рядом')"
proba "7в B-N-932: prichina без «замер ДАТА … чем:» (пересказ признака) → НЕ ПОДТВЕРЖДЕНО" 1 "prichina без замера" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD 'замер 2026-09-26 чем: проба → возможна ротация')"
proba "7г B-N-932: prichina по форме, но со словом догадки → НЕ ПОДТВЕРЖДЕНО" 1 "prichina — догадка" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD 'замер 2026-09-26 чем: проба → без X стенд не может быть запущен')"
proba "7д B-N-932 т.2 (Вениамин): «не может быть запущен» — не догадка → ОЖИДАЕМО" 3 "ОЖИДАЕМО: pkg/stend-slep.sh" "НЕ ПОДТВЕРЖДЕНО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD 'замер 2026-09-26 чем: проба → возможности повторить нет, наверняка так')"
proba "7е B-N-932 т.2: «возможности»/«наверняка» — не догадка → ОЖИДАЕМО" 3 "ОЖИДАЕМО: pkg/stend-slep.sh" "НЕ ПОДТВЕРЖДЕНО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 другой-признак $BUD)"
proba "8 иной ПРИЗНАК отказа → 1" 1 "признак «другой-признак» не найден" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 0.9.0 2 признак-слепоты $BUD)"
proba "9 иной ВЫПУСК → 1" 1 "выпуск 0.9.0≠1.0.0" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh '*' 2 признак-слепоты $BUD)"
proba "9б выпуск «*» → 3" 3 "ОЖИДАЕМО: pkg/stend-slep.sh" -
isk "$(zap pkg/stend-slep.sh 1.0.0 1 признак-слепоты $BUD)"
proba "9в иной КОД (исключение на 1, стенд дал 2) → 1" 1 "код 1≠2" "ОЖИДАЕМО"
paket zel
proba "10 файла исключений НЕТ, всё зелёное → 2" 2 "СЛЕПОТА ИСКЛЮЧЕНИЙ: файла исключений нет" - "$T/netu.yaml"
paket zel kras
proba "11 файла нет И красный → 1 (приоритет 1 над 2), слепота исключений напечатана" 1 "СЛЕПОТА ИСКЛЮЧЕНИЙ" - "$T/netu.yaml"
printf 'exceptions: {a: 1}\n' > "$T/krivoj.yaml"; paket zel
proba "11б exceptions не список → 2" 2 "нет списка exceptions" - "$T/krivoj.yaml"
paket slep kras; isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD)"
proba "12 ожидаемое + неожиданное → 1, напечатаны ОБА" 1 "ОЖИДАЕМО: pkg/stend-slep.sh" -
grep -qF "НЕОЖИДАННО: pkg/stend-kras.sh" "$T/vyvod" && { ok=$((ok+1)); echo "  ok    12б неожиданное тоже напечатано"; } || { bad=$((bad+1)); echo "  FAIL  12б неожиданного в выводе нет"; }
paket zel slep; isk
proba "13 причина печатается и для кода 2 (INFO Вениамина)" 1 "stend-slep.sh: СЛЕПОТА: признак-слепоты" -
paket koren; isk
export DSH_TEST_APP="$T"; unset DSH_KOREN_PLATFORMY
proba "14 B-N-932 т.2: корень из DSH_TEST_APP → обходчик задаёт DSH_KOREN_PLATFORMY своим прогонам, стенд-читатель 0" 0 "код 0" "нет корня платформы"
unset DSH_TEST_APP
proba "14б B-N-932 т.2: ни DSH_KOREN_PLATFORMY, ни DSH_TEST_APP → читатель слеп, НЕОЖИДАННО (умолчания нет)" 1 "НЕОЖИДАННО: pkg/stend-koren.sh" -
# ── B-N-1987 (обход 3.1.7, Заря; замысел ред.2 38113c45, ворота Вениамина 13:42Z): суд ПО ПОКРЫТИЮ ──
zapl() {    # zapl стенд выпуск код срок «доп. строки YAML или пусто» признак… — признак СПИСКОМ
  local st="$1" vy="$2" ko="$3" sr="$4" dop="$5" p; shift 5
  printf '  - stend: "%s"\n    vypusk: "%s"\n    kod: %s\n    priznak:\n' "$st" "$vy" "$ko"
  for p in "$@"; do printf '      - "%s"\n' "$p"; done
  printf '    prichina: "замер 2026-10-10 чем: проба"\n    otvetstvennyj: "Заря"\n    peresmotr: "%s"' "$sr"
  [ -z "$dop" ] || printf '\n%s' "$dop"
}
BLIZ=$(date -u -d '+7 days' +%Y-%m-%dT%H:%M:%SZ)
PR_I='частные ИМЕНА не проверены — списка основ нет'; PR_D='СЛЕПОТА состав против диска: копий правок рядом нет'
cat > "$T/publ.txt" <<'PUBL'
образец частных имён: 🔴 списка основ НЕТ (SPISOK_IMYON не задан): проверка на ИМЕНА не выполняется вовсе; сумма списка нет списка
СЛЕПОТА package.json: частные ИМЕНА не проверены — списка основ нет, проверять нечем. Это не «чисто». Путь берётся из переменной SPISOK_IMYON: SPISOK_IMYON=<файл со списком основ> npm test
СЛЕПОТА src/index.js: частные ИМЕНА не проверены — списка основ нет, проверять нечем. Это не «чисто». Путь берётся из переменной SPISOK_IMYON: SPISOK_IMYON=<файл со списком основ> npm test
ИТОГО: сошлось 138, расхождений 0, слепот 79
PUBL
{ head -3 "$T/publ.txt"; cat <<'PUBL80'
СЛЕПОТА состав против диска: копий правок рядом нет — это собранный пакет, а не рабочий каталог, и лишним файлам тут взяться неоткуда
PUBL80
tail -1 "$T/publ.txt"; } > "$T/publ80.txt"
paket zel publ80; isk "$(zap pkg/stend-publ80.sh 1.0.0 2 "$PR_I" $BUD)"
proba "15 СМЕШАННАЯ (Вениамин): покрытая слепота + 80-я строка stend-publikacii без признака → 1, строка названа" 1 "красная строка вне исключения (1): СЛЕПОТА состав против диска" "ОЖИДАЕМО"
paket zel publ; isk "$(zap pkg/stend-publ.sh 1.0.0 2 "$PR_I" $BUD)"
proba "15б порча снята (без 80-й строки) → 3, ОЖИДАЕМО" 3 "ОЖИДАЕМО: pkg/stend-publ.sh" "НЕОЖИДАННО"
paket zel publ80; isk "$(zapl pkg/stend-publ80.sh 1.0.0 2 $BUD '' "$PR_I" "$PR_D")"
proba "15в признак СПИСКОМ покрывает обе строки → 3" 3 "ОЖИДАЕМО: pkg/stend-publ80.sh" "НЕОЖИДАННО"
paket zel publ; isk "$(zapl pkg/stend-publ.sh 1.0.0 2 $BUD '' "$PR_I" "$PR_D")"
proba "15г список: второй признак в выводе не встретился → 1" 1 "признак «$PR_D» не найден" "ОЖИДАЕМО"
paket zel slep; isk "$(zap pkg/stend-slep.sh 1.0.0 2 СЛЕПОТА $BUD)"
proba "16 признак = маркер «СЛЕПОТА» → НЕ ПОДТВЕРЖДЕНО (шире пробы)" 1 "priznak «СЛЕПОТА» шире пробы" "ОЖИДАЕМО"
isk "$(zap pkg/stend-slep.sh 1.0.0 2 слепоты $BUD)"
proba "16б признак короче 12 знаков → НЕ ПОДТВЕРЖДЕНО" 1 "priznak «слепоты» шире пробы" "ОЖИДАЕМО"
isk "$(zapl pkg/stend-slep.sh 1.0.0 2 $BUD '' признак-слепоты FAIL)"
proba "16в в списке широкий элемент → НЕ ПОДТВЕРЖДЕНО" 1 "priznak «FAIL» шире пробы" "ОЖИДАЕМО"
paket zel nemark; isk "$(zap pkg/stend-nemark.sh 1.0.0 1 'line 4: 1: предмет-подставной' $BUD)"
proba "17 красных строк нет, pokrytie не объявлено → 1" 1 "красных строк нет — покрытие не судимо" "ОЖИДАЕМО"
isk "$(zapl pkg/stend-nemark.sh 1.0.0 1 $BLIZ '    pokrytie: kod' 'line 4: 1: предмет-подставной')"
proba "17б pokrytie: kod, пересмотр ≤14 сут → 3, «покрытие не судимо» в сводке поимённо" 3 "ПОКРЫТИЕ НЕ СУДИМО (pokrytie: kod — ожидаемо по коду, красных строк нет): 1 — pkg/stend-nemark.sh" "НЕОЖИДАННО"
isk "$(zapl pkg/stend-nemark.sh 1.0.0 1 $BUD '    pokrytie: kod' 'line 4: 1: предмет-подставной')"
proba "17в pokrytie: kod с пересмотром дальше 14 сут → НЕ ПОДТВЕРЖДЕНО" 1 "pokrytie: kod — пересмотр не дальше 14 суток" "ОЖИДАЕМО"
isk "$(zapl pkg/stend-nemark.sh 1.0.0 1 $BLIZ '    pokrytie: vsyo' 'line 4: 1: предмет-подставной')"
proba "17г pokrytie не «kod» → НЕ ПОДТВЕРЖДЕНО" 1 "pokrytie — только «kod»" "ОЖИДАЕМО"
paket zel smes; isk "$(zapl pkg/stend-smes.sh 1.0.0 1 $BLIZ '    pokrytie: kod' признак-красноты)"
proba "17д pokrytie: kod НЕ отключает покрытие: красная строка вне признака → 1" 1 "красная строка вне исключения (1): ❌ другая-краснота" "ОЖИДАЕМО"
paket zel propusk; isk "$(zap pkg/stend-propusk.sh 1.0.0 2 'зелёных: 4  красных: 0  пропущено: 1' $BUD)"
proba "18 ПРОПУСК — красная строка: признак на итоговой строке не покрывает → 1" 1 "красная строка вне исключения (1): ПРОПУСК" "ОЖИДАЕМО"
isk "$(zap pkg/stend-propusk.sh 1.0.0 2 'подставной предмет не установлен — проверять нечем' $BUD)"
proba "18б признак на строке пропуска → 3" 3 "ОЖИДАЕМО: pkg/stend-propusk.sh" "НЕОЖИДАННО"
# копия B — каталог с ТЕМ ЖЕ именем (ключ «пакет/стенд» берётся из имени каталога копии — как у /opt/*/plugins/dsh-tool-bridge)
paket zel kras; rm -rf "$T/kopiya-b"; mkdir -p "$T/kopiya-b"; cp -r "$T/pkg" "$T/kopiya-b/pkg"; ls -1 "$T"/kopiya-b/pkg/test/stend-*.sh >> "$T/perechen"
isk "$(zapl pkg/stend-kras.sh 1.0.0 1 $BUD "    kopiya: \"$T/pkg\"" признак-красноты)"
OBL="$T/pkg/"$'\n'"$T/kopiya-b/pkg/" proba "19 (B-N-1981) kopiya: запись копии A не ложится на копию B → 1, копия названа" 1 "копия $T/pkg≠$T/kopiya-b/pkg/" "-"
[ "$(grep -cF 'ОЖИДАЕМО: pkg/stend-kras.sh' "$T/vyvod")" = 1 ] && { ok=$((ok+1)); echo "  ok    19б копия A по-прежнему ОЖИДАЕМО (ровно одна)"; } \
  || { bad=$((bad+1)); echo "  FAIL  19б строк «ОЖИДАЕМО: pkg/stend-kras.sh» не 1"; }
isk "$(zap pkg/stend-kras.sh 1.0.0 1 признак-красноты $BUD)"
OBL="$T/pkg/"$'\n'"$T/kopiya-b/pkg/" proba "19в без kopiya — как прежде, обе копии ОЖИДАЕМО → 3" 3 "ОЖИДАЕМО: pkg/stend-kras.sh" "НЕОЖИДАННО"
rm -rf "$T/kopiya-b"
# ── B-N-1981 (обход 3.1.8, Искра): ЗЕЛЁНАЯ ветка тоже учитывает kopiya (3.1.7 учёл её только в sudit) ──
paket zel kras; rm -rf "$T/kopiya-b"; mkdir -p "$T/kopiya-b"; cp -r "$T/pkg" "$T/kopiya-b/pkg"
printf '#!/bin/bash\nexit 0\n' > "$T/kopiya-b/pkg/test/stend-kras.sh"; ls -1 "$T"/kopiya-b/pkg/test/stend-*.sh >> "$T/perechen"
isk "$(zapl pkg/stend-kras.sh 1.0.0 1 $BUD "    kopiya: \"$T/pkg\"" признак-красноты)"
OBL="$T/pkg/"$'\n'"$T/kopiya-b/pkg/" proba "20 (B-N-1981) запись копии A, копия B зелёная → «устарело» НЕ печатается, A ОЖИДАЕМО → 3" 3 "ОЖИДАЕМО: pkg/stend-kras.sh" "исключение устарело"
printf '#!/bin/bash\nexit 0\n' > "$T/pkg/test/stend-kras.sh"
OBL="$T/pkg/"$'\n'"$T/kopiya-b/pkg/" proba "20б зелена и своя копия A → «устарело» печатается, код 0" 0 "исключение устарело (стенд зелёный — снять запись): pkg/stend-kras.sh" "НЕОЖИДАННО"
rm -rf "$T/kopiya-b"
# ── ОБЁРТКА ТАЙМЕРА vse-stendy-po-tajmeru.sh: перевод кодов, тревога с именами (канал — подставной) ──
OBERTKA="${OBERTKA_BIN:-/opt/iskra/workspace/dorabotki/vse-stendy-po-tajmeru.sh}"
printf '#!/bin/sh\necho "$1" >> "%s/trevogi"\n' "$T" > "$T/alert"; chmod +x "$T/alert"
printf '#!/bin/bash\n# VSE_STENDY_PREDEL_API=1\nOBLAST_STENDOV="%s/pkg/" PERECHEN_STENDOV="%s/perechen" ISKLYUCHENIYA_STENDOV="%s/isk.yaml" exec bash "%s" "$@"\n' "$T" "$T" "$T" "$OBH" > "$T/obh-nastoyashchij"
printf '#!/bin/bash\n# VSE_STENDY_PREDEL_API=1\nif [ "$#" -gt 0 ]; then [ "$#" -eq 2 ] && [ "$1" = --predel-stenda ] || exit 2; echo 1800; exit 0; fi\necho "pkg  зелёных 0   расхождений 1   слепот 0"\necho "ИТОГ: стендов 1 · код 1"\nexit 1\n' > "$T/obh-bez-imyon"
printf '#!/bin/bash\n# VSE_STENDY_PREDEL_API=1\nif [ "$#" -gt 0 ]; then [ "$#" -eq 2 ] && [ "$1" = --predel-stenda ] || exit 2; echo 1800; exit 0; fi\necho "pkg  зелёных 0   расхождений 0   слепот 1"\necho "ИТОГ: стендов 1 · код 3"\nexit 3\n' > "$T/obh-3-bez-imyon"
obertka() { rm -f "$T/trevogi"; OBHODCHIK="$1" PERECHEN_STENDOV="$T/perechen" VSE_STENDY_ALERT="${2:-$T/alert}" bash "$OBERTKA" > "$T/vyvod" 2>&1; echo $?; }
oproba() {  # имя · обходчик · ждём код · строка вывода · строка тревоги (или «-» — тревоги быть не должно, «*» — не проверять)
  local imya="$1" obh="$2" zhd="$3" est="$4" tr="$5" K; K=$(obertka "$obh" "${6:-}")
  local beda=""
  [ "$K" = "$zhd" ] || beda="код $K, ждали $zhd"
  grep -qF -- "$est" "$T/vyvod" || beda="${beda:+$beda; }нет «$est»"
  case "$tr" in
    '*') ;;
    -) [ ! -s "$T/trevogi" ] || beda="${beda:+$beda; }тревога ушла: $(head -c 120 "$T/trevogi")" ;;
    *) grep -qF -- "$tr" "$T/trevogi" 2>/dev/null || beda="${beda:+$beda; }в тревоге нет «$tr»" ;;
  esac
  if [ -z "$beda" ]; then ok=$((ok+1)); echo "  ok    $imya"; else bad=$((bad+1)); echo "  FAIL  $imya — $beda"; fi
}
paket zel; isk
oproba "О1 обходчик 0 → обёртка 0, без тревоги" "$T/obh-nastoyashchij" 0 "ИТОГ ТАЙМЕРА: обходчик код 0" -
paket zel slep; isk "$(zap pkg/stend-slep.sh 1.0.0 2 признак-слепоты $BUD)"
oproba "О2 обходчик 3 → обёртка 0, «только ожидаемое» с именем, без тревоги" "$T/obh-nastoyashchij" 0 "только ожидаемое (исключения действуют): pkg/stend-slep.sh" -
paket zel slep; isk
oproba "О3 обходчик 1 (слепой без исключения) → тревога с ИМЕНЕМ, код 1" "$T/obh-nastoyashchij" 1 "тревога отправлена" "НЕОЖИДАННО: pkg/stend-slep.sh"
oproba "О4 тревога не доставлена → код 3 (сторож нем)" "$T/obh-nastoyashchij" 3 "ТРЕВОГА НЕ ДОСТАВЛЕНА" "*" /bin/false
oproba "О5 код 1 без имён и охвата → разбор ослеп, код 3, тревога общим текстом" "$T/obh-bez-imyon" 3 "РАЗБОР ИМЁН РАЗОШЁЛСЯ" "имена не разобраны"
oproba "О6 код 3 без «ОЖИДАЕМО» → отказ с поимённым запасным перечнем (B-N-2063)" "$T/obh-3-bez-imyon" 3 "РАЗБОР ИМЁН РАЗОШЁЛСЯ" "НЕ ПРОГНАН: $T/pkg/test/stend-zel.sh"
paket zel; rm -f "$T/isk.yaml"
oproba "О7 обходчик 2 (файла исключений нет) → обёртка 2, без тревоги" "$T/obh-nastoyashchij" 2 "ИТОГ ТАЙМЕРА: обходчик код 2" - 
# B-N-1458: старый обходчик не должен быть вызван вместо запроса API предела.
printf '#!/bin/bash\ntouch "%s/old-called"\necho "не должен запускаться"\nexit 0\n' "$T" > "$T/obh-bez-api"
oproba "О8 обходчик без API → отказ ДО запуска, код 3, поимённая тревога (B-N-2063)" "$T/obh-bez-api" 3 "СЛЕПОТА: обходчик без API предела" "НЕ ПРОГНАН: $T/pkg/test/stend-zel.sh"
[ ! -e "$T/old-called" ] && { ok=$((ok+1)); echo "  ok    О8б обходчик без API действительно не вызван"; } \
  || { bad=$((bad+1)); echo "  FAIL  О8б обходчик без API был вызван до отказа"; }
# B-N-2064 (2): вывод канала — в журнал, не в /dev/null (немой отказ 14.10 02:12Z был неустановим). Канал отказывает с причиной в stderr.
printf '#!/bin/sh\necho "причина-отказа-канала-О9" >&2\nexit 1\n' > "$T/alert-otkaz"; chmod +x "$T/alert-otkaz"
paket zel slep; isk
oproba "О9 канал отказал → его строка в журнале обёртки" "$T/obh-nastoyashchij" 3 "  канал: причина-отказа-канала-О9" "*" "$T/alert-otkaz"
oproba "О9б канал отказал → код канала назван" "$T/obh-nastoyashchij" 3 "канал тревог $T/alert-otkaz: код 1" "*" "$T/alert-otkaz"
# WEEKLY-ALERT 3.1.86: канал не вызван — причина принадлежит caller, у sender своего следа быть не может.
# Подставной приёмник тот же: oproba очищает trevogi и отдельно читает его после каждого вызова.
alert_mode=$(stat -c %a "$T/alert")
alert_sum=$(sha256sum "$T/alert" | cut -d ' ' -f1)
alert_before=$( { printf '%s\n' "$alert_sum"; stat -c '%a %u:%g' "$T/alert"; } | sha256sum | cut -d ' ' -f1)
chmod 644 "$T/alert" || exit 2
[ "$(stat -c %a "$T/alert")" = 644 ] || { echo 'СЛЕПОТА: порча права исполнения не внесена'; exit 2; }
[ "$(sha256sum "$T/alert" | cut -d ' ' -f1)" = "$alert_sum" ] || { echo 'СЛЕПОТА: chmod изменил байты канала'; exit 2; }
alert_after=$( { sha256sum "$T/alert" | cut -d ' ' -f1; stat -c '%a %u:%g' "$T/alert"; } | sha256sum | cut -d ' ' -f1)
[ "$alert_before" != "$alert_after" ] || { echo 'СЛЕПОТА: состояние канала не изменилось'; exit 2; }
printf 'ПОРЧА канала: mode=644, SHA состояния %s → %s (байты прежние)\n' "$alert_before" "$alert_after"
oproba "О10 канал без права исполнения → caller называет причину, код 3, приёмник пуст" "$T/obh-nastoyashchij" 3 "КАНАЛ НЕ ВЫЗВАН: нет права исполнения: $T/alert" -
chmod "$alert_mode" "$T/alert" || exit 2
alert_return=$( { sha256sum "$T/alert" | cut -d ' ' -f1; stat -c '%a %u:%g' "$T/alert"; } | sha256sum | cut -d ' ' -f1)
[ "$alert_return" = "$alert_before" ] || { echo 'СЛЕПОТА: режим канала не возвращён'; exit 2; }
oproba "О10б исполнение возвращено → приёмник получил тревогу" "$T/obh-nastoyashchij" 1 "тревога отправлена" "НЕОЖИДАННО: pkg/stend-slep.sh"
mv "$T/alert" "$T/alert-saved" || exit 2
[ ! -e "$T/alert" ] && [ -f "$T/alert-saved" ] || { echo 'СЛЕПОТА: порча отсутствием канала не внесена'; exit 2; }
[ "$(sha256sum "$T/alert-saved" | cut -d ' ' -f1)" = "$alert_sum" ] || { echo 'СЛЕПОТА: сохранён не тот канал'; exit 2; }
alert_absent=$(printf 'absent\n' | sha256sum | cut -d ' ' -f1)
printf 'ПОРЧА канала: путь отсутствует, SHA состояния %s → %s; сохранённые байты %s\n' "$alert_before" "$alert_absent" "$alert_sum"
oproba "О11 канал отсутствует → caller называет причину, код 3, приёмник пуст" "$T/obh-nastoyashchij" 3 "КАНАЛ НЕ ВЫЗВАН: нет файла или путь недоступен: $T/alert" -
mv "$T/alert-saved" "$T/alert" || exit 2
alert_return=$( { sha256sum "$T/alert" | cut -d ' ' -f1; stat -c '%a %u:%g' "$T/alert"; } | sha256sum | cut -d ' ' -f1)
[ "$alert_return" = "$alert_before" ] || { echo 'СЛЕПОТА: канал не возвращён'; exit 2; }
oproba "О11б файл возвращён → приёмник получил тревогу" "$T/obh-nastoyashchij" 1 "тревога отправлена" "НЕОЖИДАННО: pkg/stend-slep.sh"
echo "  ok=$ok  FAIL=$bad"
ZHDYOM=59   # 55 + WEEKLY-ALERT (4): О10/О10б/О11/О11б;  34 + B-N-1987: 15–15г, 16–16в, 17–17д, 18–18б, 19–19в (17 проверок) + B-N-1981 (3.1.8): 20, 20б + B-N-2064 (2): О9, О9б
[ $((ok+bad)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из $ZHDYOM"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
