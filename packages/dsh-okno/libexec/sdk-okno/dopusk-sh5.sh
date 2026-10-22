#!/bin/bash
# B-N-1501 r2, условие 3 Вениамина: допуск к Ш5 (смена ссылки sdk-runtime на новый слой).
# Вызов: dopusk-sh5.sh <T1> <T2>   T1 — время обмена Ш1, T2 — daemon-reload Ш2; оба — unix-секунды из журнала окна (date -u +%s).
# Claude-юниты A обязаны быть подняты ПОЗЖЕ T1 (иначе держат литеральный путь каталога → смесь JS/бинаря после Ш5);
# кодеры — ПОЗЖЕ T2 (иначе drop-in GATEWAY_CODEX_BIN не действует). Код: 0 — допуск; 1 — нет; 2 — вызов неверен.
# НЕ ловит: юнит, поднятый позже T, но упавший после (смотрите ActiveState в строке); гостя varvara (носитель B, Ш8).
# НЕ ловит: процесс, поднятый вовремя, но загрузивший SDK до смены ссылки (первый ход между Ш4 и Ш5: JS прежнего слоя
#   при бинаре нового — 14.10 coder-gateway-master). Признак загрузки — строка журнала «SDK … взят из слоя» после Ш5 (os-upgrade §9.7).
set -u
[[ $# -eq 2 && $1 =~ ^[0-9]{10}$ && $2 =~ ^[0-9]{10}$ ]] || { echo "отказ: dopusk-sh5.sh <T1 unix-сек> <T2 unix-сек>"; exit 2; }
T1=$1 T2=$2 net=() vsego=0
proverit() {   # <юнит> <порог>
  local u=$1 t=$2 ts e akt
  vsego=$((vsego+1))
  ts=$(systemctl show "$u" -p ExecMainStartTimestamp --value 2>/dev/null)
  akt=$(systemctl show "$u" -p ActiveState --value 2>/dev/null)
  if [[ -z $ts || $ts == n/a ]]; then echo "  $u: СЛЕПОТА — времени подъёма нет ($akt)"; net+=("$u"); return; fi
  e=$(date -d "$ts" +%s 2>/dev/null) || { echo "  $u: СЛЕПОТА — время «$ts» не разобрано"; net+=("$u"); return; }
  if (( e > t )) && [[ $akt == active ]]; then echo "  $u: поднят $ts ($e) > $t · $akt — да"
  else echo "  $u: поднят $ts ($e), порог $t · $akt — НЕТ"; net+=("$u"); fi
}
echo "Claude-юниты A, порог T1=$T1 ($(date -u -d @$T1 +%FT%TZ)):"
for a in avrora iskra spartak zarya sova; do proverit "claude-oauth-gateway@$a.service" "$T1"; done
echo "кодеры, порог T2=$T2 ($(date -u -d @$T2 +%FT%TZ)):"
for k in coder-gateway@alfa coder-gateway@beta coder-gateway@gamma coder-gateway-marc coder-gateway-anna coder-gateway-master coder-gateway-vintik coder-gateway-shpuntik coder-gateway-gayka coder-gateway-shurup coder-gateway-tumbler; do proverit "$k.service" "$T2"; done
if (( ${#net[@]} == 0 )); then echo "допуск к Ш5: ДА — ${vsego} из ${vsego}"; exit 0; fi
echo "допуск к Ш5: НЕТ — ${#net[@]} из ${vsego}: ${net[*]}"; exit 1
