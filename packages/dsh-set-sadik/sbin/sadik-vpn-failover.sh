#!/bin/bash
# sadik-vpn-failover.sh — egress failover manager US(awg3) → NL(awg0)
# Заведён 2026-08-16 (Михалыч) по образцу bclaude-vpn-failover.sh.
# ОТЛИЧИЕ ОТ bclaude/aclaude: здесь US-туннель называется awg3, а не awg1.
#
# Ban-safety инварианты:
#   • table 51820 default = ТОЛЬКО dev awg3 (US, приоритет) | dev awg0 (NL, fallback) | unreachable (fail-closed)
#   • НИКОГДА wan0/lan0/main/awg-ru — egress не утекает на офисную сеть, внешний адрес или РФ
#   • приоритет US всегда; NL только при смерти US; failback на US при восстановлении
#   • оба мертвы → unreachable default (лучше нет связи, чем утечка не-того-IP); killswitch дублирует
set -euo pipefail
TABLE=51820
THRESH=${THRESH:-200}     # handshake-age (сек) > порога -> туннель мёртв (env-override для теста)
NOW=$(date +%s)
WG=$(command -v awg || command -v wg)

CONF_DIR=${SET_CONF_DIR:-/etc/amnezia/amneziawg}
# A-N-1948 №35: рукопожатие — ТОГО пира, чья точка подключения записана в конфиге туннеля (как sadik-watch для awg9),
# а не первой строки вывода: со вторым пиром первая строка дала бы чужой возраст — ложный failover или ложное «жив».
# Пир один — он и берётся (прежнее поведение). Пиров больше одного и точка не опознана — «никогда» и строка в журнал:
# лишний failover видно, тихий выбор чужого пира — нет. Адрес сравнивается целиком (1.2.3.4 ≠ 11.2.3.4).
hs_age() {            # возраст последнего handshake в секундах (999999 = никогда)
  local hs pk ep n
  n=$("$WG" show "$1" peers 2>/dev/null | wc -l)
  ep=$(sed -n 's/^ *Endpoint *= *\([^:]*\):.*/\1/p' "$CONF_DIR/$1.conf" 2>/dev/null | head -1)
  pk=$("$WG" show "$1" endpoints 2>/dev/null | awk -v e="$ep" 'e!="" {split($2,a,":"); if (a[1]==e) {print $1; exit}}')
  if [ -z "$pk" ] && [ "$n" = 1 ]; then pk=$("$WG" show "$1" peers 2>/dev/null | head -1); fi
  if [ -z "$pk" ]; then
    [ "$n" -gt 1 ] 2>/dev/null && logger -t sadik-vpn-failover "$1: пиров $n, точка «${ep:-нет в конфиге}» не опознана — считаю мёртвым"
    echo 999999; return
  fi
  hs=$("$WG" show "$1" latest-handshakes 2>/dev/null | awk -v k="$pk" '$1==k{print $2; exit}')
  if [ -n "${hs:-}" ] && [ "$hs" -gt 0 ] 2>/dev/null; then echo $(( NOW - hs )); else echo 999999; fi
}
up() { ip link show "$1" >/dev/null 2>&1; }

US_OK=false; NL_OK=false
if up awg3 && [ "$(hs_age awg3)" -lt "$THRESH" ]; then US_OK=true; fi
if up awg0 && [ "$(hs_age awg0)" -lt "$THRESH" ]; then NL_OK=true; fi

cur=$(ip route show table "$TABLE" default 2>/dev/null | grep -oE 'dev [a-z0-9]+|unreachable' | head -1 | awk '{print $NF}' || true)   # ||true ОБЯЗАТЕЛЕН: при ПУСТОЙ таблице grep даёт код 1, и под set -euo pipefail скрипт умирал молча, не переключив egress (найдено тестом 2026-08-16: US упал → трафик пошёл НАПРЯМУЮ с реального адреса)

if   $US_OK; then want=awg3
elif $NL_OK; then want=awg0
else            want=unreachable; fi

[ "$want" = "$cur" ] && exit 0   # уже в нужном состоянии — no-op

case "$want" in
  awg3)        ip route replace default dev awg3 scope link table "$TABLE"
               logger -t sadik-vpn-failover "→ US(awg3): egress на primary" ;;
  awg0)        ip route replace default dev awg0 scope link table "$TABLE"
               logger -t sadik-vpn-failover "FAILOVER → NL(awg0): US мёртв (handshake>${THRESH}s)" ;;
  unreachable) ip route replace unreachable default table "$TABLE"
               logger -t sadik-vpn-failover "FAIL-CLOSED: US+NL мертвы → unreachable (нет утечки egress)" ;;
esac
