#!/usr/bin/env bash
# RU split-routing apply (boot + идемпотентный, robust — без set -e). RU-dst→mark 0xa2c9→table225→awg-ru→egress a-vps-ru.
# Исключает VPN-underlay-endpoints (46.19.64.6 сам в ru_v4 → иначе mesh/awg-ru underlay hijack, root-cause 2026-07-14).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PROVEN=/usr/local/sbin/ru-cidr-update.sh
# 05.10.2026 (Михалыч; находка bclaude к B-N-1660; решение Забавы 13:32 МСК): приоритет правила пометки — из файла
# /etc/ru-split/prio (одно число); файла нет → 60 (aclaude, sadik). На bclaude — 61: там 60 занят «from 5.17.7.156
# lookup public», и пометка обязана стоять ПОСЛЕ него, иначе ответы с публичного адреса уйдут в awg-ru.
# Неизвестное содержимое → ОТКАЗ до любых изменений (exit 2): лишний отказ увидит сторож RU split, лишнее действие угонит ответы.
PRIO_F="${RU_SPLIT_PRIO_FILE:-/etc/ru-split/prio}"
PRIO=$( [ -r "$PRIO_F" ] && tr -d '[:space:]' < "$PRIO_F" ); PRIO=${PRIO:-60}
case "$PRIO" in *[!0-9]*) echo "ОТКАЗ: $PRIO_F содержит «$PRIO» — не число; правила не трогаю"; exit 2 ;; esac
# r2 (К1 Вениамина 10:40Z): длину — ДО сравнений: огромное число роняет «[ -lt ]» с ошибкой, оба условия ложны, и проверка «проходила».
[ ${#PRIO} -le 5 ] || { echo "ОТКАЗ: приоритет «$PRIO» длиннее 5 цифр; правила не трогаю"; exit 2; }
# r3 (Михалыч, своя проба 10:58Z): «061» ip rule читает как ВОСЬМЕРИЧНОЕ → priority 49, до public на 60. Привожу к десятичному.
PRIO=$((10#$PRIO))
if [ "$PRIO" -lt 1 ] || [ "$PRIO" -gt 32765 ]; then echo "ОТКАЗ: приоритет $PRIO вне 1..32765; правила не трогаю"; exit 2; fi
nft add table inet ru_split 2>/dev/null || true
if ! nft list set inet ru_split ru_v4 2>/dev/null | grep -q elements; then /usr/local/sbin/ru-cidr-update.sh || true; fi
nft add set inet ru_split ru_v4 '{ type ipv4_addr; flags interval; auto-merge; }' 2>/dev/null || true
nft add chain inet ru_split output '{ type route hook output priority mangle ; policy accept ; }' 2>/dev/null || true
nft flush chain inet ru_split output
# D-N-1656 (05.10.2026, Михалыч): ответы на ВХОДЯЩИЕ соединения не метить — иначе ответ клиенту с RU-адреса уходит в awg-ru
# (правило 60 стоит до «from <публичный> lookup public»/fwmark 0x100), клиент получает чужой адрес и соединение не встаёт.
nft add rule inet ru_split output ct direction reply return
nft add rule inet ru_split output ip daddr { 46.19.64.6, 186.246.17.63, 201.51.21.218 } return
# 2026-08-10: НЕ метить underlay туннелей (иначе wg-home уходил внутрь awg-ru и умер на 18 суток).
# По ПРИЗНАКУ (метка 0xca6c), а не списком IP — список эндпоинтов выше забыли пополнить.
# 2026-08-11: Novofon — ПОРУЧЕНИЕ Александра (голос 14:43): «новофон должен идти через внешний
# адрес... реальный внешний адрес может утекать без vpn-туннеля». Исключаем из RU-разметки,
# иначе API-запросы (443) уходили в awg-ru и Novofon видел 46.19.64.6 вместо 5.17.7.157.
nft add rule inet ru_split output ip daddr 37.139.38.0/24 return
nft add rule inet ru_split output meta mark 0xca6c return
nft add rule inet ru_split output ip daddr @ru_v4 meta mark set 0xa2c9
nft add chain inet ru_split postrouting '{ type nat hook postrouting priority srcnat ; policy accept ; }' 2>/dev/null || true
nft flush chain inet ru_split postrouting
nft add rule inet ru_split postrouting oifname "awg-ru" masquerade
# Снимаю ВСЕ правила пометки (не только на текущем приоритете): при смене приоритета старое не должно остаться вторым.
while ip rule del fwmark 0xa2c9 lookup 225 2>/dev/null; do :; done
ip rule add fwmark 0xa2c9 lookup 225 priority "$PRIO"
# A-N-1948 №11: код 0 — только при РАБОТАЮЩЕМ split, проверка свойства, а не хода применения. Счёт и порог — те же, что у
# sadik-watch (сети и адреса набора, ≥ 5000; RIPE ~8400, sanity ru-cidr-update 500): пустой набор (RIPE недоступен при
# загрузке) или нет правила пометки (нет ip) — код 1 с причиной, ru-split.service станет failed, а не active.
RU_N=$(nft list set inet ru_split ru_v4 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?' | wc -l)
RU_R=$(ip rule show 2>/dev/null | grep -cF 'fwmark 0xa2c9 lookup 225')
echo "RU-split applied: ru_v4=$RU_N, ip-rule=$RU_R, priority=$PRIO"
RU_MIN=${RU_SPLIT_MIN:-5000}
RU_PRICHINA=""
[ "$RU_N" -ge "$RU_MIN" ] 2>/dev/null || RU_PRICHINA="${RU_PRICHINA}в ru_v4 $RU_N сетей (порог $RU_MIN); "
[ "$RU_R" -ge 1 ] 2>/dev/null || RU_PRICHINA="${RU_PRICHINA}нет ip rule fwmark 0xa2c9 → 225; "
[ -z "$RU_PRICHINA" ] || { echo "ОТКАЗ: RU split НЕ работает: ${RU_PRICHINA%; }"; exit 1; }
