#!/bin/bash
# СТЕНД ПРОПУСКА НЕДЕЛЬНЫХ И РУЧНЫХ В ПАКЕТНЫХ ВОРОТАХ обходчика vse-stendy-boevye.sh (B-N-2071 (б), Искра, 16.10.2026;
# решение Забавы 11:36:14Z). Ждём (заранее): в режиме PAKET_IMYA стенд, записанный недельным (перечень недельных) или
# «ИСКЛЮЧЁН, ручной: <путь>» (пометка боевого перечня), НЕ судится и печатается строкой «ПРОПУЩЕН … N: имена»; из охвата
# исключён. Порча — пометку снять: стенд судится и краснеет; возврат — снова зелёное. Без PAKET_IMYA пропуска нет.
# Всё подставное во временном каталоге; боевые область, перечни и /etc/agent-registry/stend-exceptions.yaml не читаются.
# Код: 0 — все пробы сошлись · 1 — нет · 2 — слепота стенда.
set -u
OBH="${OBHODCHIK_BIN:-$(cd "$(dirname "$0")/.." && pwd)/vse-stendy-boevye.sh}"
[ -f "$OBH" ] || { echo "СЛЕПОТА: нет обходчика $OBH"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/stend-propuska.XXXXXX") || { echo "СЛЕПОТА: нет временного каталога"; exit 2; }
trap 'rm -rf "$T"' EXIT
ok=0; bad=0
mkdir -p "$T/pkg/test"; printf '{"name":"pkg","version":"1.0.0"}\n' > "$T/pkg/package.json"
printf '#!/bin/bash\nexit 0\n' > "$T/pkg/test/stend-zel.sh"
printf '#!/bin/bash\necho "❌ долгий-недельный оборван"\nexit 1\n' > "$T/pkg/test/stend-ned.sh"
printf '#!/bin/bash\necho "ОТКАЗ-ZHIVAYA-MASHINA: без ключа не гоняю"\nexit 2\n' > "$T/pkg/test/stend-ruch.sh"
chmod 755 "$T"/pkg/test/stend-*.sh
ls -1 "$T"/pkg/test/stend-*.sh > "$T/perechen"            # как перечень выпуска у ворот: все стенды каталога
echo 'exceptions: []' > "$T/isk.yaml"
ned() { printf '# недельный (подставной)\n/opt/iskra/workspace/dorabotki/stend-ned.sh\n' > "$T/ned"; }   # копия dorabotki — сверка по имени
ruch() { printf '#   ИСКЛЮЧЁН, ручной: %s (подставной)\n' "$T/pkg/test/stend-ruch.sh" > "$T/ruch"; }
progon() { env ${PAKET-PAKET_IMYA=pkg} OBLAST_STENDOV="$T/pkg/" PERECHEN_STENDOV="$T/perechen" ISKLYUCHENIYA_STENDOV="$T/isk.yaml" \
  PERECHEN_NEDELNYH_STENDOV="$T/ned" PERECHEN_RUCHNYH_POMETOK="$T/ruch" bash "$OBH" > "$T/vyvod" 2>&1; echo $?; }
proba() {   # имя · ждём код · строка-обязана (или «-») · строка-запрещена (или «-»)
  local imya="$1" zhd="$2" est="$3" net="$4" K; K=$(progon)
  local beda=""
  [ "$K" = "$zhd" ] || beda="код $K, ждали $zhd"
  [ "$est" = - ] || grep -qF -- "$est" "$T/vyvod" || beda="${beda:+$beda; }нет «$est»"
  [ "$net" = - ] || ! grep -qF -- "$net" "$T/vyvod" || beda="${beda:+$beda; }лишнее «$net»"
  if [ -z "$beda" ]; then ok=$((ok+1)); echo "  ok    $imya"; else bad=$((bad+1)); echo "  FAIL  $imya — $beda"; tail -8 "$T/vyvod" | sed 's/^/          /'; fi
}
ned; ruch
proba "1 исправное: пропущено 2 с именами, судится 1, итог 0" 0 "ПРОПУЩЕН (пакетные ворота): недельный/ручной, 2: stend-ned.sh (недельный), stend-ruch.sh (ручной)" "НЕОЖИДАННО"
proba "1 охват: объявлено и прошло 1 из 1 (пропущенные не в знаменателе)" 0 "ПОКРЫТИЕ: прошло 1 из 1 объявленных" "ОБХОДОМ НЕ ПРОГНАН"
: > "$T/ned"; echo "     порча: недельный перечень пуст ($(wc -l < "$T/ned") строк)"
proba "2 порча: недельный без пометки → судится, красное по имени" 1 "stend-ned.sh" "stend-ned.sh (недельный)"
ned
proba "2 возврат: пометка недельного вернулась → 0" 0 "недельный/ручной, 2" "НЕОЖИДАННО"
: > "$T/ruch"; echo "     порча: пометок ручного $(grep -c 'ИСКЛЮЧЁН, ручной' "$T/ruch")"
proba "3 порча: ручной без пометки → судится, неожиданное" 1 "stend-ruch.sh" "stend-ruch.sh (ручной)"
ruch
proba "3 возврат → 0" 0 "недельный/ручной, 2" "НЕОЖИДАННО"
rm -f "$T/ned"
proba "4 перечня недельных нет → пропуск НЕ применён (сказано), недельный судится" 1 "ПРОПУСК НЕДЕЛЬНЫХ НЕ ПРИМЕНЁН" "stend-ned.sh (недельный)"
ned
PAKET="" proba "5 без PAKET_IMYA (ночной режим) → пропуска нет, оба судятся" 1 "stend-ned.sh" "ПРОПУЩЕН (пакетные ворота)"
echo "ИТОГО: сошлось $ok, расхождений $bad"
[ "$bad" -eq 0 ]
