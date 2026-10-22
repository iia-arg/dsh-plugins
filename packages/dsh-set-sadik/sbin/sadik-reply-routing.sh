#!/bin/bash
# 1) Ответы на соединения, ПРИШЕДШИЕ на внешнюю карту, уходят обратно тем же путём
#    (без этого при full-tunnel SYN-ACK уходит в awg3 и внешний SSH снаружи мёртв).
# 2) Приоритеты ip rule ФИКСИРУЕМ сами: awg-quick ставит свои правила без явного
#    приоритета, ядро даёт (минимальный существующий - 1), поэтому с каждым рестартом
#    туннельные правила уползают ВЫШЕ нашего и reply-routing молча ломается.
set -u
EXT_IF=wan0; EXT_GW=5.17.7.145; TABLE=100; MARK=0x100; TAG=sadik-reply
P_REPLY=40; P_SUPPRESS=32764; P_TUNNEL=32765; TUN_TABLE=51820; TUN_MARK=0xca6c

# B-N-1242: шлюз может ещё не быть готов при загрузке/рестарте менеджера.
# Только первая идемпотентная установка маршрута; до успеха правила не меняем.
# 20 попыток × (2 с + 1 с kill) + 19 пауз × 1 с = до 79 с ожидания, без вечного цикла.
route_ready=0
for ((attempt=1; attempt<=20; attempt++)); do
  if /usr/bin/timeout -k 1s 2s ip route replace default via "$EXT_GW" dev "$EXT_IF" table "$TABLE"; then
    route_ready=1; break
  fi
  [ "$attempt" -eq 20 ] || sleep 1
done
if [ "$route_ready" -ne 1 ]; then
  echo "ОТКАЗ: шлюз $EXT_GW на $EXT_IF не готов: 20 попыток, timeout 2 с (+1 с kill), пауза 1 с; правила не изменены" >&2
  exit 1
fi

# 15.10.2026 (Михалыч; находка 15 строк sadik-reply в mangle, подтверждена Забавой uniq -c): зовущих семь — sadik-set,
# NM 50-sadik-set, ExecStartPost четырёх awg-quick, — и они идут ОДНОВРЕМЕННО (загрузка, событие NM). «Снять все с меткой → -A»
# не атомарно: два экземпляра оба снимают, оба добавляют → копии копятся. С этого места — один экземпляр за раз.
# Замок ПОСЛЕ ожидания шлюза (LOW Вениамина 15.10): цикл B-N-1242 идемпотентен и держит до 79 с — под замком он заставил бы
# остальных уйти по таймауту, и правил не поставил бы никто. Здесь замок держится доли секунды; 60 с — с большим запасом.
exec 9>/run/sadik-reply-routing.lock
if ! flock -w 60 9; then
  echo "ОТКАЗ: другой sadik-reply-routing держит /run/sadik-reply-routing.lock дольше 60 с — правила не меняю" >&2
  logger -t sadik-reply-routing "ОТКАЗ: блокировка занята дольше 60 с"; exit 1
fi

# сносим ВСЕ правила этих трёх ролей, где бы awg-quick их ни поставил
while ip rule del priority "$P_REPLY" 2>/dev/null; do :; done
for p in $(ip rule show | grep -E "suppress_prefixlength|lookup $TUN_TABLE" | grep -oP '^\K[0-9]+'); do
  ip rule del priority "$p" 2>/dev/null || true
done
# и ставим на фиксированные номера
ip rule add fwmark "$MARK" lookup "$TABLE" priority "$P_REPLY"

# --- добавлено 2026-08-16 (Михалыч): сеть как у основных серверов ---
# Правила живут ЗДЕСЬ, а не в отдельном скрипте: этот вызывается из ExecStartPost
# туннелей и потому переживает их рестарт. Два источника правды развалились бы.
# Новофон ходит с собственного внешнего адреса, БЕЗ туннеля (поручение Александра 2026-08-11).
ip route replace default via "$EXT_GW" dev "$EXT_IF" table 224
for R in "to 5.17.7.144/28 lookup main" "to 37.139.38.0/24 lookup 224"; do
  while ip rule show | grep -qF "$R"; do ip rule del $R 2>/dev/null || break; done
done
# 50: соседи по своему /28 мимо RU-split — иначе SYN придёт на wan0, а SYN-ACK уйдёт в awg-ru
ip rule add to 5.17.7.144/28 lookup main priority 50
# 60: RU-split по метке. ПОЗЖЕ reply(40) — иначе ответ на внешний SSH, пришедший с
#     российского адреса, уехал бы в awg-ru. РАНЬШЕ туннельного правила ($P_TUNNEL) —
#     иначе весь РФ-трафик ушёл бы в US и split был бы декоративным.
# A-N-1948 №13: приоритет — НЕ зашитый 60, а из /etc/ru-split/prio той же проверкой, что в ru-split-apply.sh
# (там же довод: на bclaude 61, иначе пометка встаёт до «from <публичный> lookup public»). Прежде этот скрипт при
# каждом рестарте туннеля и событии NM переставлял правило на 60 — два хозяина одного правила. Правило здесь
# остаётся: только этот скрипт переживает смыв правил (рестарт systemd-networkd, 02.09.2026).
# Негодный файл — правило пометки не трогаю (как ru-split-apply), говорю причину; остальные правила ставлю.
RU_PRIO_F="${RU_SPLIT_PRIO_FILE:-/etc/ru-split/prio}"
RU_PRIO=$( [ -r "$RU_PRIO_F" ] && tr -d '[:space:]' < "$RU_PRIO_F" ); RU_PRIO=${RU_PRIO:-60}
case "$RU_PRIO" in *[!0-9]*) RU_PRIO_OTKAZ="содержит «$RU_PRIO» — не число" ;;
  *) if [ ${#RU_PRIO} -gt 5 ]; then RU_PRIO_OTKAZ="приоритет «$RU_PRIO» длиннее 5 цифр"
     else RU_PRIO=$((10#$RU_PRIO))
       if [ "$RU_PRIO" -lt 1 ] || [ "$RU_PRIO" -gt 32765 ]; then RU_PRIO_OTKAZ="приоритет $RU_PRIO вне 1..32765"; else RU_PRIO_OTKAZ=""; fi
     fi ;;
esac
if [ -z "$RU_PRIO_OTKAZ" ]; then
  while ip rule show | grep -qF "fwmark 0xa2c9 lookup 225"; do ip rule del fwmark 0xa2c9 lookup 225 2>/dev/null || break; done
  ip rule add from all fwmark 0xa2c9 lookup 225 priority "$RU_PRIO"
else
  echo "ОТКАЗ: $RU_PRIO_F $RU_PRIO_OTKAZ — правило пометки RU-split не трогаю" >&2
  logger -t sadik-reply-routing "ОТКАЗ: $RU_PRIO_F $RU_PRIO_OTKAZ — правило пометки RU-split не трогаю"
fi
# 75: Новофон по адресу назначения. Работает ТОЛЬКО потому, что nft ru_split исключает
#     37.139.38.0/24 ДО пометки: иначе метка встала бы раньше и это правило было бы мёртвым
#     (ровно такой дефект найден на bclaude 2026-08-16 и там же починен).
ip rule add to 37.139.38.0/24 lookup 224 priority 75
ip rule add table main suppress_prefixlength 0 priority "$P_SUPPRESS"
ip rule add not fwmark "$TUN_MARK" table "$TUN_TABLE" priority "$P_TUNNEL"

for CH in PREROUTING OUTPUT; do
  while iptables -t mangle -L "$CH" --line-numbers -n 2>/dev/null | grep -q "$TAG"; do
    N=$(iptables -t mangle -L "$CH" --line-numbers -n | awk -v t="$TAG" '$0~t{print $1; exit}')
    iptables -t mangle -D "$CH" "$N" || break
  done
done
# 15.10.2026 (Михалыч; замер bclaude → 5.17.7.155:38888 — 4 SYN, ни одного SYN-ACK): соседей по стойке (5.17.7.144/28) НЕ метим.
# Иначе ответ соседу уходит по правилу 40 (раньше 50 «соседи напрямую») через шлюз .145, а тот в сегмент не разворачивает.
iptables -t mangle -A PREROUTING -i "$EXT_IF" ! -s 5.17.7.144/28 -m conntrack --ctstate NEW -j CONNMARK --set-mark "$MARK" -m comment --comment "$TAG"
iptables -t mangle -A PREROUTING -j CONNMARK --restore-mark -m comment --comment "$TAG"
# 2026-08-16 (Михалыч): "-m connmark ! --mark 0x0" ОБЯЗАТЕЛЕН. Без него restore-mark
# затирал НУЛЁМ метку 0xa2c9, поставленную nft ru_split (у нового исходящего соединения
# connmark = 0), и RU-split молча не работал: правила выглядели верно, трафик шёл в US.
# Доказано счётчиком awg-ru: при снятом правиле отправлено 2368 -> 4576 байт.
# Ответы на входящие имеют connmark 0x100 и восстанавливаются как прежде.
iptables -t mangle -A OUTPUT -m connmark ! --mark 0x0 -j CONNMARK --restore-mark -m comment --comment "$TAG"

# --- добавлено 2026-09-02 (Искра): маршруты /32 до ТОЧЕК ПОДКЛЮЧЕНИЯ туннелей ---
# Зачем: туннель метит свои пакеты и исключает их из своей таблицы (иначе петля), а в
# main умолчание подавлено правилом suppress_prefixlength. Пакетам рукопожатия идти
# некуда — `ip route get <точка>` возвращает ПУСТОТУ, и туннели умирают ТИХО.
# Поймано 02.09.2026: needrestart перезапустил systemd-networkd при обновлении ОС,
# правила смыло, а туннели при этом НЕ перезапускались (active/exited) — значит и
# ExecStartPost не сработал. Маршруты стояли только в памяти ядра и исчезли.
# 🔴 Адреса берутся ИЗ КОНФИГОВ, а не константами: сменится Endpoint — подхватится сам.
CONF_DIR=/etc/amnezia/amneziawg
TOCHKI=$(sed -n 's/^ *Endpoint *= *\([^:]*\):.*/\1/p' "$CONF_DIR"/*.conf 2>/dev/null | sort -u)
for T in $TOCHKI; do
  case "$T" in [0-9]*.[0-9]*.[0-9]*.[0-9]*) ip route replace "$T/32" via "$EXT_GW" dev "$EXT_IF" ;; esac
done

TUN=$(ip rule show | grep -vE "fwmark $MARK" | grep -oP '^\K[0-9]+(?=:.*(suppress_prefixlength|lookup 518))' | sort -n | head -1)
if [ -n "$TUN" ] && [ "$P_REPLY" -ge "$TUN" ]; then
  logger -t sadik-reply-routing "WARNING: reply priority $P_REPLY >= tunnel $TUN"; exit 1
fi
# 2026-08-16: правила направления в таблицу 51820 НЕ должны принадлежать awg3.
# Иначе они исчезают вместе с ним — то есть ровно тогда, когда нужен failover.
# A-N-1948 №12: умолчание таблицы 51820 — хозяйство sadik-vpn-failover.sh (awg3 | awg0 | unreachable). Здесь — только
# если его НЕТ вовсе (первый подъём, таблицу смыло): прежде каждый рестарт туннеля и событие NM безусловно возвращали
# awg3, и при мёртвом US egress до 30 с уходил в мёртвый туннель вопреки решению failover.
if [ -z "$(ip route show table 51820 default 2>/dev/null)" ]; then
  ip route replace default dev awg3 table 51820 2>/dev/null || true
fi
ip rule del priority 78 2>/dev/null || true
ip rule add from all lookup main suppress_prefixlength 0 priority 78 2>/dev/null || true
ip rule del priority 79 2>/dev/null || true
ip rule add not from all fwmark 0xca6c lookup 51820 priority 79 2>/dev/null || true

exit 0
