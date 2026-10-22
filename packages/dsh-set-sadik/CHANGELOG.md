# История изменений dsh-set-sadik

## 3.1.5 — 15.10.2026 · соседи по стойке не метятся · rack neighbours are not marked (Михалыч)

- `sbin/sadik-reply-routing.sh` 2f1f7d87 → ac6c7f34 — в пометке NEW с `wan0` добавлено `! -s 5.17.7.144/28` (:91–93): правило 40
  (fwmark → таблица 100) стоит раньше 50 («свои /28 напрямую»), и ответ соседу по стойке уходил через шлюз .145 — соединение
  не вставало (bclaude → 5.17.7.155:38888: SYN-ACK на MAC шлюза, RST). Автор — Михалыч; ворота Вениамина 12:45Z ГОДНО;
  смонтировано 15:23Z (окно e64a4dc6). Файл перенесён с боя как есть, код не менялся
  · `! -s 5.17.7.144/28` in the NEW-from-wan0 mark: replies to rack neighbours no longer leave via the gateway; copied from live as is.

## 3.1.4 — 15.10.2026 · боевая правка Михалыча возвращена в дерево · live fix by Mikhalych brought back into the tree (Искра, наряд Забавы 10:29:40Z)

- `sbin/sadik-reply-routing.sh` 3bb1ecd2 → 2f1f7d87 (+11/−0) — `flock` после цикла `route_ready`: лечит гонку семи зовущих
  (копии правил mangle). Автор — Михалыч; ворота Вениамина 10:28:46Z ГОДНО; смонтировано Забавой 10:29Z (страховка
  /var/backups/montazh/B-srr-flock-20261015/). Файл перенесён с боя как есть (= кандидат /var/tmp/srr-k), код не менялся.
  · flock after the route_ready loop fixes a race of seven callers (duplicate mangle rules); author Mikhalych, copied from live as is.
- README: строка «Версия · Version: 3.1.4». · README: version line.

## 3.1.3 — 14.10.2026 · боевая правка Михалыча возвращена в дерево · live fix by Mikhalych brought back into the tree (Искра, наряд Забавы 16:24Z)

- `sbin/ru-split-apply.sh` 044be5f1 → 538c40a4 (+13/−0) — RU-split и для контейнеров: цепочка `prerouting` метит проходящий из
  `docker0` и `br-*` трафик к `@ru_v4` (с теми же исключениями, что `output`), цепочка `forward` подрезает MSS под `awg-ru`.
  Автор правки — Михалыч, коммит учёта /usr/local `ea45c8c` (14.10 15:41:22Z), основание — слово Александра 14.10 18:38 МСК
  (15:38:23Z). Файл перенесён с боя как есть, код не менялся; бой уже такой, монтажа нет.
  · RU split for containers too (prerouting for docker0/br-*, MSS clamp for awg-ru); author Mikhalych, copied from live as is.
- README: строка «Версия · Version: 3.1.3». · README: version line.

## 3.1.2 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- README: строка «Версия · Version: 3.1.2» под заголовком. · README: version line under the heading.
- Логика не менялась; номер 3.1.1 → 3.1.2 по правилу владельца 10.10 16:33 (правка README ⇒ +1). · Logic unchanged; version bump for the README edit.

## 3.1.1 — правки по облачному аудиту №5 (A-N-1948: №11 №12 №13 MED, №34 №35 №36 LOW; Заря) · рабочий номер 1.0.2 сведён в единый номер выпуска 3.1.1 (слово владельца 10.10.2026 01:38 МСК)

- `sbin/ru-split-apply.sh` c7d7b0d4 → 044be5f1 (+11/−1) — №11: после применения проверка СВОЙСТВА тем же счётом и порогом, что
  у sadik-watch (сети набора ≥ 5000, есть `fwmark 0xa2c9 lookup 225`); не так — «ОТКАЗ: RU split НЕ работает: <причина>», код 1,
  `ru-split.service` failed вместо active. Число в строке «applied» теперь — сети, а не строки вывода nft (6000 сетей: было 3000).
- `sbin/ru-cidr-update.sh` 6d08b1d4 → 94ad07c4 (+3/−1) — №36: `ru_v4.cidrs` пишется ПОСЛЕ успешного `nft -f`.
- `sbin/sadik-reply-routing.sh` 7ac90a43 → 3bb1ecd2 (+27/−3) — №13: приоритет пометки RU-split — из `/etc/ru-split/prio` той же
  проверкой, что в ru-split-apply.sh (негодный файл — правило пометки не трогается, ОТКАЗ в stderr и журнал); №12: умолчание
  таблицы 51820 ставится, только если его нет — иначе хозяин sadik-vpn-failover.sh.
- `sbin/sadik-vpn-failover.sh` 8f0001a4 → 23542fc1 (+15/−1) — №35: рукопожатие пира, чья точка подключения записана в конфиге
  (`SET_CONF_DIR`, умолч. /etc/amnezia/amneziawg), адрес сравнивается целиком; пир один — он; пиров больше и точка не опознана —
  «мёртв» и строка в журнал.
- `sbin/sadik-vpn-only-killswitch.sh` 77c20326 → d917487b (+48/−29) — №34: цепи `SADIK_VPN_ONLY_OUT` и `SADIK_EXT_IN` собираются
  под `…_NEW` и подставляются целиком (прыжок в новую → снятие старой → прежнее имя); окна без REJECT/DROP нет. IPv6: киллсвитч
  закрывает только IPv4, поэтому `net.ipv6.conf.all.disable_ipv6` ≠ 1 — код 3 с причиной. Итоговый набор правил после двух
  прогонов побайтно равен основе (sha256[:16] 407110f73dc5c011).
- Дельта-2 (LOW Вениамина 03:2xZ): `sbin/sadik-vpn-only-killswitch.sh` d917487b → 6df55a16: `…_NEW` со ссылками (прежняя подстановка
  не дошла до `-X`, на неё прыгает OUTPUT/INPUT) — отказ ДО изменений, код 4; без ссылок — очищается, как прежде. Проба: основа
  d917487b — код 0 и 24 окна без REJECT (живую _NEW очистил -F), кандидат — код 4, окон 0, правило REJECT в _NEW цело.
- Пробы — в своих пространствах имён (unshare -m, каждый случай unshare -n), боевые цепи и маршруты не тронуты: основа 031c9a1e —
  7 расхождений из 12 (все порчи), кандидат — 0 из 12.

## 1.0.1 — пачка README 07.10.2026: пометка строчной формулой; код не менялся

## 1.0.0 — первый выпуск: перенос с боя sadik, код не менялся

Основа — учёт /usr/local `418b194` (файлы пакета те же в `9131236`), юниты /etc/systemd/system `6740db2` и хук
/etc/NetworkManager/dispatcher.d/50-sadik-set (07.10.2026; план Зари «служебный софт в дерево» b9822ac4, r2 §2.4;
слово владельца 07.10 15:32 МСК). 6 файлов, 13 файлов юнитов и drop-in, 1 хук: по плану 18 + сверх плана 2
(`awg-quick@.service.d/05-nm-online.conf`, `50-sadik-set`).
