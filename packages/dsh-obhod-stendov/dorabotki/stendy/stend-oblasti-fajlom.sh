#!/bin/bash
# СТЕНД СТРОКИ ОБЛАСТИ «ОДИН ФАЙЛ-СТЕНД» обходчика vse-stendy-boevye.sh. Искра, 25.09.2026.
# Зачем: стенд вне каталога пакета (dorabotki) можно взять в обход только строкой-файлом —
# целиком каталог брать нельзя (там стенды «не запускать без подмен»).
# Ждём (заранее): файл из области ЗАПУЩЕН и ПОСЧИТАН в покрытии; сосед в том же каталоге НЕ запущен;
# упавший файл-стенд — расхождение; пакетный каталог обходится как прежде.
# Где не применяется: строка области «@учётка» с файлом (по договору не берётся) — не проверяется.
# Боевые область и перечень не трогаются: всё подставное во временном каталоге.
set -u
OBH="${OBHODCHIK_BIN:-/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh}"
[ -f "$OBH" ] || { echo "СЛЕПОТА: нет обходчика $OBH"; exit 2; }
T=$(mktemp -d /tmp/stend-oblasti-fajlom.XXXXXX) || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$T"' EXIT
# B-H-203: обходчик читает файл исключений — стенд даёт свой пустой, боевой /etc не читается.
export ISKLYUCHENIYA_STENDOV="$T/isk.yaml"; echo 'exceptions: []' > "$ISKLYUCHENIYA_STENDOV"
ok=0; bad=0
sud(){ if [ "$1" = ok ]; then ok=$((ok+1)); echo "  ok    $2"; else bad=$((bad+1)); echo "  FAIL  $2 — $3"; fi; }
mkdir -p "$T/pkg/test" "$T/odin"
printf '#!/bin/bash\nexit 0\n' > "$T/pkg/test/stend-paketa.sh"
printf '#!/bin/bash\ntouch "%s/zapushchen-odin"\n[ "${KOD_ODIN:-0}" = 0 ] || echo "❌ проба-одна: причина-порчи-стенда"\nexit ${KOD_ODIN:-0}\n' "$T" > "$T/odin/stend-odin.sh"
printf '#!/bin/bash\ntouch "%s/zapushchen-sosed"\nexit 0\n' "$T" > "$T/odin/stend-sosed.sh"
printf '%s\n' "$T/pkg/test/stend-paketa.sh" "$T/odin/stend-odin.sh" > "$T/perechen"
progon(){ rm -f "$T"/zapushchen-*; OBLAST_STENDOV="$T/pkg/
$T/odin/stend-odin.sh" PERECHEN_STENDOV="$T/perechen" bash "$OBH" > "$T/vyvod" 2>&1; echo $?; }

K=$(progon)
[ "$K" = 0 ] && grep -q 'ПОКРЫТИЕ: прошло 2 из 2 объявленных · пропало 0 · незаписанных 0' "$T/vyvod" \
  && sud ok "файл-стенд запущен и посчитан (2 из 2), код 0" \
  || sud fail "файл-стенд запущен и посчитан" "код $K; $(grep 'ПОКРЫТИЕ' "$T/vyvod")"
[ -f "$T/zapushchen-odin" ] && sud ok "файл-стенд исполнен (след есть)" || sud fail "файл-стенд исполнен" "следа нет"
[ ! -f "$T/zapushchen-sosed" ] && sud ok "сосед в том же каталоге НЕ запущен" || sud fail "сосед не запущен" "сосед исполнен — строка-файл взяла каталог"
grep -qE '^pkg +зелёных 1 +расхождений 0 +слепот 0' "$T/vyvod" \
  && sud ok "пакетный каталог обходится как прежде" || sud fail "пакетный каталог" "$(head -3 "$T/vyvod" | tr '\n' '|')"
K=$(KOD_ODIN=1 progon)
[ "$K" = 1 ] && grep -q 'РАСХОЖДЕНИЕ:stend-odin.sh' "$T/vyvod" \
  && sud ok "упавший файл-стенд -> расхождение, код 1" || sud fail "упавший файл-стенд" "код $K"
# A-N-881: причина расхождения — в выводе обходчика (строка провала стенда с его именем), а не только имя и код.
grep -qF 'stend-odin.sh: ❌ проба-одна: причина-порчи-стенда' "$T/vyvod" \
  && sud ok "причина расхождения напечатана обходчиком" || sud fail "причина расхождения напечатана" "строки провала стенда в выводе нет"

echo "  ok=$ok  FAIL=$bad"
ZHDYOM=6
[ $((ok+bad)) -eq $ZHDYOM ] || { echo "СЛЕПОТА: проверок $((ok+bad)) из $ZHDYOM"; exit 2; }
[ "$bad" -eq 0 ] || exit 1
exit 0
