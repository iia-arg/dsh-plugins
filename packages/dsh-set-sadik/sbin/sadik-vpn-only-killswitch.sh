#!/usr/bin/env bash
# sadik egress-killswitch: наружу только VPN-туннели + корп-LAN(10.240/16) + underlay-эндпоинты; остальное REJECT.
# Заведён 2026-08-16 (Михалыч) по образцу bclaude-vpn-only-killswitch.sh.
#
# ОТЛИЧИЯ ОТ bclaude, намеренные:
#   • US-туннель здесь awg3 (не awg1), его underlay-порт 48135 (не 48134)
#   • НЕТ НИ ОДНОГО правила под wg-home: домашний туннель садику не нужен
#     (прямое указание Александра 2026-08-16). Лишний туннель к чужому периметру —
#     это не запас, а риск, поэтому не заводим «на всякий случай».
set -euo pipefail
# A-N-1948 №34: прежде цепь очищалась (-F) и заполнялась по правилу, пока на неё уже указывал OUTPUT/INPUT, — до последнего
# правила (REJECT/DROP) выход и вход были ОТКРЫТЫ. Теперь цепь собирается под временным именем …_NEW, на неё целиком
# переключается OUTPUT/INPUT, и лишь затем старая снимается, а новая получает прежнее имя. В любой момент прыжок ведёт
# в полную цепь. Отказ посреди сборки (set -e) оставляет прежнюю цепь действующей, а недособранную — без прыжка.
# A-N-1948 №5 (LOW Вениамина): …_NEW со ССЫЛКАМИ — прежняя подстановка не завершилась (например, отказал -X старой цепи) и
# на неё уже прыгает OUTPUT/INPUT: -F открыл бы выход/вход. Тогда отказ ДО любого изменения, код 4. Без ссылок (сборка
# оборвалась до прыжка) — очищается и используется, как прежде.
for N in SADIK_VPN_ONLY_OUT_NEW SADIK_EXT_IN_NEW; do
  if iptables -n -L "$N" >/dev/null 2>&1; then
    SSYL=$(iptables -n -L "$N" 2>/dev/null | head -1 | grep -oE '\(([0-9]+) references' | grep -oE '[0-9]+' || echo '?')
    if [ "$SSYL" != 0 ]; then
      echo "ОТКАЗ: цепь $N живая (ссылок $SSYL) — прежняя подстановка не завершилась; правила не трогаю. Разобрать руками: iptables -S | grep _NEW" >&2
      exit 4
    fi
  fi
done
iptables -N SADIK_VPN_ONLY_OUT_NEW 2>/dev/null || iptables -F SADIK_VPN_ONLY_OUT_NEW
iptables -A SADIK_VPN_ONLY_OUT_NEW -o lo -j RETURN

# ── ВХОДЯЩИЕ С ПУБЛИЧНОЙ КАРТЫ. Заворачиваем ТОЛЬКО wan0 (публичный 5.17.7.155).
# Внутренняя lan0 и туннели не затронуты — иначе теряем канал управления.
iptables -N SADIK_EXT_IN_NEW 2>/dev/null || iptables -F SADIK_EXT_IN_NEW
iptables -A SADIK_EXT_IN_NEW -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -A SADIK_EXT_IN_NEW -p tcp --dport 38888 -j RETURN
iptables -A SADIK_EXT_IN_NEW -m limit --limit 6/min --limit-burst 10 -j LOG --log-prefix "[SADIK EXT DROP] "
iptables -A SADIK_EXT_IN_NEW -j DROP

# Ответы на входящий внешний SSH. Без этого вход отработает, а ОТВЕТ уйдёт в REJECT.
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -p tcp --sport 38888 -j RETURN
# Туннели: выход через VPN разрешён
iptables -A SADIK_VPN_ONLY_OUT_NEW -o awg3 -j RETURN     # US (основной egress)
iptables -A SADIK_VPN_ONLY_OUT_NEW -o awg0 -j RETURN     # NL (запасной egress)
iptables -A SADIK_VPN_ONLY_OUT_NEW -o awg9 -j RETURN     # mesh (server-to-server, не egress)
iptables -A SADIK_VPN_ONLY_OUT_NEW -o awg-ru -j RETURN   # RU split
# Корп/офисная сеть — канал управления. КРИТИЧНО, обязано быть ДО REJECT.
iptables -A SADIK_VPN_ONLY_OUT_NEW -o lan0 -d 10.240.0.0/16 -j RETURN
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -d 10.240.0.0/16 -j RETURN
# Underlay-эндпоинты туннелей через wan0 — иначе туннели не поднимутся после REJECT.
# ⚠️ ПРОВЕРЯТЬ СЧЁТЧИКАМИ, НЕ ПИНГОМ: это UDP на конкретные порты, ICMP уйдёт в REJECT
#    и даст ложный отрицательный результат.
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -p udp -d 186.246.17.63 --dport 48135 -j RETURN  # US awg3
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -p udp -d 201.51.21.218 --dport 43801 -j RETURN  # NL awg0
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -p udp -d 46.19.64.6 --dport 51821 -j RETURN     # RU mesh awg9
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -p udp -d 46.19.64.6 --dport 43801 -j RETURN     # RU split awg-ru
# Новофон — ПРЯМОЙ выход через внешний адрес (поручение Александра 2026-08-11, зеркало aclaude/bclaude).
# 5.17.7.155 внесён им в белый список Новофона 2026-08-16. Исключение поимённое.
iptables -A SADIK_VPN_ONLY_OUT_NEW -d 37.139.38.0/24 -o wan0 -j RETURN
# DHCP renew
iptables -A SADIK_VPN_ONLY_OUT_NEW -o wan0 -p udp --dport 67 -j RETURN
iptables -A SADIK_VPN_ONLY_OUT_NEW -o lan0 -p udp --dport 67 -j RETURN
# Соседи по своему /28 — внешний SSH 38888 (матрица доступа Александра 2026-08-13)
iptables -A SADIK_VPN_ONLY_OUT_NEW -d 5.17.7.156 -o wan0 -j RETURN  # bclaude
iptables -A SADIK_VPN_ONLY_OUT_NEW -d 5.17.7.157 -o wan0 -j RETURN  # aclaude
iptables -A SADIK_VPN_ONLY_OUT_NEW -m limit --limit 6/min --limit-burst 10 -j LOG --log-prefix "[SADIK NO-VPN OUT] "
iptables -A SADIK_VPN_ONLY_OUT_NEW -j REJECT --reject-with icmp-port-unreachable
# Подстановка: сначала прыжок в полную новую цепь, затем снятие прыжков в старую, старую — прочь, новой — прежнее имя.
podstavit() { # цепь_основа  цепь_вход/выход  доп.условие прыжка
  local C=$1 H=$2; shift 2
  iptables -I "$H" 1 "$@" -j "${C}_NEW"
  while iptables -D "$H" "$@" -j "$C" 2>/dev/null; do :; done
  if iptables -n -L "$C" >/dev/null 2>&1; then iptables -F "$C"; iptables -X "$C"; fi
  iptables -E "${C}_NEW" "$C"
}
podstavit SADIK_EXT_IN INPUT -i wan0
podstavit SADIK_VPN_ONLY_OUT OUTPUT

# A-N-1948 №34 (IPv6): киллсвитч закрывает ТОЛЬКО IPv4. На sadik IPv6 выключен настройкой машины (sysctl
# net.ipv6.conf.all.disable_ipv6=1, замер 10.10.2026), и это часть политики, а не случайность: если IPv6 включат,
# egress по IPv6 пойдёт мимо туннелей. Поэтому проверка: IPv6 не выключен — код 3 с причиной, служба failed.
V6=$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || echo 'нет-файла')
if [ "$V6" != 1 ] && [ "$V6" != 'нет-файла' ]; then
  echo "ОТКАЗ: IPv6 не выключен (net.ipv6.conf.all.disable_ipv6=$V6), а киллсвитч закрывает только IPv4 — egress IPv6 мимо туннелей" >&2
  exit 3
fi
