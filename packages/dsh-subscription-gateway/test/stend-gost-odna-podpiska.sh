#!/bin/bash
# stend-gost-odna-podpiska — учётка гостевого шлюза читает токены РОВНО ОДНОЙ подписки, и это подписка из env (B-N-1621, Михалыч 08.10.2026).
# ОБЛАСТЬ: юниты claude-oauth-gateway@*.service, чей ExecStart содержит guest-launch (как их узнаёт svesti-dostup-podpisok),
#   либо юниты, переданные аргументами. Пути: <каталог токенов из env>/token-podpiska-[123], /run/credentials/<юнит>/token-podpiska-*,
#   RuntimeDirectory юнита, каталог из GATEWAY_TOKEN_FILE живого процесса. Чтение — sudo -u <User юнита> test -r.
# НЕ ЛОВИТ: копии токенов вне этих путей; чтение через группы из SupplementaryGroups= юнита (у гостя пусто — 95-gost.conf);
#   то, что ТЕКУЩИЙ токен читает и платформа гостя (одна учётка) — это граница правки, не дефект стенда.
# КОДЫ: 0 — у всех ровно одна подписка = env · 1 — нарушение (названо) · 2 — слепота (юнита нет/не работает/env не прочитан).
set -uo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root"; exit 2; }
for a in "$@"; do case "$a" in -*) echo "ключей нет, получен '$a' — отказ"; exit 2;; esac; done
yunity=("$@")
if [ ${#yunity[@]} -eq 0 ]; then
  while read -r u _; do [[ "$(systemctl show -p ExecStart --value "$u")" == *guest-launch* ]] && yunity+=("$u"); done \
    < <(systemctl list-units --all --no-legend --plain 'claude-oauth-gateway@*.service')
fi
[ ${#yunity[@]} -gt 0 ] || { echo "СЛЕПОТА: гостевых шлюзов не найдено"; exit 2; }
kod=0
for u in "${yunity[@]}"; do
  pid=$(systemctl show -p MainPID --value "$u"); kto=$(systemctl show -p User --value "$u")
  [ -n "$pid" ] && [ "$pid" != 0 ] || { echo "СЛЕПОТА $u: не работает"; [ $kod = 1 ] || kod=2; continue; }
  ef=$(systemctl show -p EnvironmentFiles --value "$u" | tr ' ' '\n' | grep -E '/instance-[^/]+\.env$' | tail -1)
  sel=$(sed -n 's/^GATEWAY_TOKEN_FILE=//p' "$ef" 2>/dev/null | tail -1); N=${sel##*token-podpiska-}
  [[ "$N" =~ ^[123]$ ]] || { echo "СЛЕПОТА $u: выбор подписки из '$ef' не прочитан"; [ $kod = 1 ] || kod=2; continue; }
  zh=$(tr '\0' '\n' < /proc/$pid/environ | sed -n 's/^GATEWAY_TOKEN_FILE=//p'); rd=$(systemctl show -p RuntimeDirectory --value "$u")
  puti=$(for d in "$(dirname "$sel")" "/run/credentials/$u" ${rd:+/run/$rd} "$(dirname "${zh:-/nonexistent/x}")"; do ls -d "$d"/token-podpiska-[123] 2>/dev/null; done | sort -u)
  chitaet=""; chuzhie=""
  for p in $puti; do sudo -u "$kto" test -r "$p" 2>/dev/null || continue; chitaet+="$p "; [ "${p##*token-podpiska-}" = "$N" ] || chuzhie+="$p "; done
  if [ -n "$chuzhie" ]; then echo "🔴 $u (учётка $kto, выбрана $N): читает ЧУЖИЕ подписки: $chuzhie"; kod=1
  elif [ -z "$chitaet" ]; then echo "🔴 $u (учётка $kto): не читает даже выбранную $N — шлюз без токена"; kod=1
  elif [ "${zh##*token-podpiska-}" != "$N" ]; then echo "🔴 $u: живой процесс на '${zh}', env выбрал $N"; kod=1
  else echo "ok $u: учётка $kto читает только подписку $N ($chitaet), живой процесс на ней"; fi
done
exit $kod
