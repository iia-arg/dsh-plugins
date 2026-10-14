#!/bin/bash
# RU: Стенд настроек сторожа выпуска. Предмет: машинных умолчаний в коде нет; незаданная обязательная настройка и
#     незаданная настройка вида «пусто = выкл» — СЛЕПОТА с её именем, код 2, тревога в канал; явно пустое значение
#     принимается («выключено»). Зовущий — ночной обходчик (берёт stend-*.sh).
#     Среда изолирована: env -i, дерево — несуществующий путь, канал тревог — подставной (счётчик вызовов).
#     Код: 0 — все пробы, 1 — есть красная, 2 — стенд слеп. VYPUSK_TEST_WATCH — подмена предмета (порча/основа).
#     Чего НЕ ловит: верность самих значений (существование путей проверяют другие стенды и сам сторож).
# EN: Settings stand of the release watchdog. Subject: the code has no machine defaults; a missing required setting
#     and a missing "empty = off" setting are BLINDNESS naming it, exit 2, alarm to the channel; an explicitly empty
#     value is accepted ("off"). Caller: the nightly walker (it takes stend-*.sh).
#     Isolated environment: env -i, the tree is a nonexistent path, the alarm channel is a stub (call counter).
#     Exit: 0 — all probes, 1 — a red one, 2 — the stand is blind. VYPUSK_TEST_WATCH overrides the subject.
#     Does NOT catch: whether the values themselves are right (paths are checked by other stands and by the watchdog).
set -u
W=${VYPUSK_TEST_WATCH:-$(dirname "$0")/../src/vypusk-okno-watch.sh}
[ -r "$W" ] || { echo "СЛЕПОТА: предмет не читается: $W"; exit 2; }
T=$(mktemp -d /tmp/stend-nastroek.XXXXXX) || { echo "СЛЕПОТА: нет временного места"; exit 2; }
trap 'rm -rf "$T"' EXIT
printf '#!/bin/bash\necho x >> "%s/vyzovy"\n' "$T" > "$T/alert"; chmod +x "$T/alert"
# RU: $@ — присваивания VYPUSK_*=…, добавляемые к изолированной среде; печатает код, вывод — в $T/out.
# EN: $@ — VYPUSK_*=… assignments added to the isolated environment; prints the exit code, output goes to $T/out.
zapusk() {
  rm -f "$T/vyzovy" "$T/sost"*
  env -i PATH="$PATH" HOME="$T" VYPUSK_ALERT="$T/alert" VYPUSK_SOSTOYANIE="$T/sost" VYPUSK_TIHO=0 "$@" \
    bash "$W" > "$T/out" 2>&1
  echo $?
}
vyzovov() { [ -f "$T/vyzovy" ] && wc -l < "$T/vyzovy" || echo 0; }
vsego=0; proshlo=0
proba() {
  vsego=$((vsego+1))
  if eval "$2"; then proshlo=$((proshlo+1)); echo "  ✅ $1"; else echo "  ❌ $1 — код $k, вызовов канала $(vyzovov), вывод: $(head -c 200 "$T/out" | tr '\n' ' ')"; fi
}
# RU: Все настройки, кроме названных в пробе; дерево — несуществующий путь.
# EN: All settings except the one named in the probe; the tree is a nonexistent path.
VSE=(VYPUSK_REPO="$T/net-dereva" VYPUSK_KORNI="$T/net-kornej" VYPUSK_AGENT_KORNI= VYPUSK_INFO_KORNI= VYPUSK_SOOTVETSTVIYA= VYPUSK_SSYLKI= VYPUSK_RASKLADKA= VYPUSK_REESTR=)
bez() { local r=(); for a in "${VSE[@]}"; do [ "${a%%=*}" = "$1" ] || r+=("$a"); done; printf '%s\0' "${r[@]}"; }

k=$(zapusk)
proba "настроек нет вовсе → СЛЕПОТА «не задана настройка VYPUSK_REPO», код 2, канал 1" '[ "$k" = 2 ] && [ "$(vyzovov)" = 1 ] && grep -qF "не задана настройка VYPUSK_REPO" "$T/out"'
mapfile -d '' -t E < <(bez VYPUSK_KORNI); k=$(zapusk "${E[@]}")
proba "нет VYPUSK_KORNI → СЛЕПОТА с именем, код 2 (а не «всё вне области», код 0)" '[ "$k" = 2 ] && grep -qF "не задана настройка VYPUSK_KORNI" "$T/out"'
mapfile -d '' -t E < <(bez VYPUSK_SSYLKI); k=$(zapusk "${E[@]}")
proba "нет строки VYPUSK_SSYLKI → СЛЕПОТА с именем, код 2 (а не «живых 0 из 0»)" '[ "$k" = 2 ] && grep -qF "не задана настройка VYPUSK_SSYLKI" "$T/out"'
mapfile -d '' -t E < <(bez VYPUSK_RASKLADKA); k=$(zapusk "${E[@]}")
proba "нет строки VYPUSK_RASKLADKA → СЛЕПОТА с именем, код 2 (а не молча выключенная сверка без манифеста)" '[ "$k" = 2 ] && grep -qF "не задана настройка VYPUSK_RASKLADKA" "$T/out"'
mapfile -d '' -t E < <(bez VYPUSK_REESTR); k=$(zapusk "${E[@]}")
proba "нет строки VYPUSK_REESTR → СЛЕПОТА с именем, код 2 (а не молча выключенная сверка записей derevo)" '[ "$k" = 2 ] && grep -qF "не задана настройка VYPUSK_REESTR" "$T/out"'
mapfile -d '' -t E < <(bez VYPUSK_AGENT_KORNI); k=$(zapusk "${E[@]}")
proba "нет ни VYPUSK_AGENT_KORNI, ни VYPUSK_AGENT_POISK → СЛЕПОТА, код 2" '[ "$k" = 2 ] && grep -qF "не задана ни VYPUSK_AGENT_KORNI, ни VYPUSK_AGENT_POISK" "$T/out"'
k=$(zapusk "${VSE[@]}")
proba "все заданы, необязательные пусты → проверка настроек пройдена, дальше «дерева нет»" '[ "$k" = 2 ] && ! grep -qF "не задана" "$T/out" && grep -qF "дерева нет" "$T/out"'
echo "итог: $proshlo из $vsego"
[ "$proshlo" = "$vsego" ] && exit 0 || exit 1
