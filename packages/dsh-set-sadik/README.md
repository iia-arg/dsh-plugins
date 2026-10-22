Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-set-sadik — сеть машины sadik: RU split, ответная маршрутизация, переключение VPN, killswitch и проверка сети

Версия · Version: 3.1.5

## Назначение

Пакет держит сетевые правила sadik, которые не входят ни в конфиги туннелей, ни в NetworkManager. Он делает пять вещей. Строит набор адресов РФ и уводит трафик к ним в туннель `awg-ru` (RU split). Следит, чтобы ответ на соединение, пришедшее на внешнюю карту `wan0`, уходил обратно через `wan0`, а не в туннель. Переключает выход в интернет с US (`awg3`) на NL (`awg0`) и обратно. Через killswitch выпускает наружу только туннели, корпоративную сеть, концы туннелей и несколько поимённых исключений (ответы внешнего SSH, Новофон, DHCP, соседи по /28), а снаружи на `wan0` впускает только ответы на свои соединения и SSH на порт 38888. И проверяет сеть по свойству: важно не то, что применяющий скрипт вернул 0, а то, что маршрут до каждой точки подключения туннеля существует и идёт через `wan0`.

Сам пакет ничего не зовёт: его вызывают systemd и NetworkManager. При загрузке стартуют `ru-split.service`, `sadik-set.service` и `sadik-vpn-only-killswitch.service`. Таймер `sadik-vpn-failover.timer` срабатывает раз в 30 с, `ru-cidr-update.timer` — по воскресеньям в 04:17 UTC. Drop-in на четыре туннеля `awg-quick@` (`awg0`, `awg3`, `awg9`, `awg-ru`) заново применяет правила политики после старта каждого туннеля. Хук `50-sadik-set` делает то же, когда NetworkManager заново поднимает `wan0`. Ещё один drop-in, на шаблон `awg-quick@`, заставляет все туннели ждать готовности NetworkManager.

Результат читают так. `sadik-set.service` сам проверяет себя через `sadik-set-proverka.sh` (ExecStartPost): если проверка не сошлась, юнит падает. `sadik-watch` по списку `/etc/agent-registry/storozha-sutochnye.txt` следит, чтобы `sadik-vpn-failover.service` отрабатывал не реже раза в час, а `ru-cidr-update.service` — раз в 170 ч. Остальное попадает в системный журнал (теги ниже, в разделе «Проверка»), и отдельного назначенного читателя у этих строк нет.

## Что ставится и куда

У пакета нет `package.json`. Текущая версия — см. package.json/CHANGELOG; у этого пакета номер стоит заголовком в `CHANGELOG.md` и в метке `dsh-set-sadik-v<номер>`. Таблица ниже сверена с `derevo.files` записи `dsh-set-sadik` в `/etc/agent-registry/plugins.yaml`. Режимы и владельцы сняты `sudo stat` 2026-10-08 около 18:50Z: все 20 совпадают с реестром.

| файл в пакете | путь на машине | режим, владелец | кто исполняет или читает |
|---|---|---|---|
| `sbin/ru-cidr-update.sh` | `/usr/local/sbin/ru-cidr-update.sh` | 0755 root:root | `ru-cidr-update.service` (по таймеру); `ru-split-apply.sh`, когда набор `ru_v4` пуст |
| `sbin/ru-split-apply.sh` | `/usr/local/sbin/ru-split-apply.sh` | 0755 root:root | `ru-split.service` (при загрузке) |
| `sbin/sadik-reply-routing.sh` | `/usr/local/sbin/sadik-reply-routing.sh` | 0755 root:root | `sadik-set.service` (ExecStart); ExecStartPost четырёх `awg-quick@` через drop-in; хук `50-sadik-set` |
| `sbin/sadik-set-proverka.sh` | `/usr/local/sbin/sadik-set-proverka.sh` | 0755 root:root | `sadik-set.service` (ExecStartPost); хук `50-sadik-set` (вывод уходит в журнал); вручную |
| `sbin/sadik-vpn-failover.sh` | `/usr/local/sbin/sadik-vpn-failover.sh` | 0755 root:root | `sadik-vpn-failover.service` по таймеру |
| `sbin/sadik-vpn-only-killswitch.sh` | `/usr/local/sbin/sadik-vpn-only-killswitch.sh` | 0755 root:root | исполняет `sadik-vpn-only-killswitch.service`: ставит исходящую цепочку `SADIK_VPN_ONLY_OUT` (в `OUTPUT`) и входящую `SADIK_EXT_IN` (в `INPUT` для `-i wan0`); `sadik-set-proverka.sh` его не запускает, а читает: берёт оттуда адреса `-d` |
| `systemd/awg-quick@.service.d/05-nm-online.conf` | `/etc/systemd/system/awg-quick@.service.d/05-nm-online.conf` | 0644 root:root | systemd: drop-in на шаблон, действует у всех `awg-quick@` |
| `systemd/awg-quick@awg-ru.service.d/20-rule-order.conf` | `/etc/systemd/system/awg-quick@awg-ru.service.d/20-rule-order.conf` | 0644 root:root | systemd: ExecStartPost `-sadik-reply-routing.sh` |
| `systemd/awg-quick@awg0.service.d/20-rule-order.conf` | `/etc/systemd/system/awg-quick@awg0.service.d/20-rule-order.conf` | 0644 root:root | то же |
| `systemd/awg-quick@awg0.service.d/transport.conf.disabled-20260821` | `/etc/systemd/system/awg-quick@awg0.service.d/transport.conf.disabled-20260821` | 0644 root:root | никто: systemd читает только `*.conf`; файл лежит как история |
| `systemd/awg-quick@awg3.service.d/10-reply-routing.conf` | `/etc/systemd/system/awg-quick@awg3.service.d/10-reply-routing.conf` | 0644 root:root | systemd: ExecStartPost `-sadik-reply-routing.sh` |
| `systemd/awg-quick@awg9.service.d/20-rule-order.conf` | `/etc/systemd/system/awg-quick@awg9.service.d/20-rule-order.conf` | 0644 root:root | то же |
| `systemd/ru-cidr-update.service` | `/etc/systemd/system/ru-cidr-update.service` | 0644 root:root | systemd; без `[Install]`, запускается только таймером |
| `systemd/ru-cidr-update.timer` | `/etc/systemd/system/ru-cidr-update.timer` | 0644 root:root | systemd, `timers.target` |
| `systemd/ru-split.service` | `/etc/systemd/system/ru-split.service` | 0644 root:root | systemd, `multi-user.target` |
| `systemd/sadik-set.service` | `/etc/systemd/system/sadik-set.service` | 0644 root:root | systemd, `multi-user.target`; `PartOf=` обоим менеджерам сети |
| `systemd/sadik-vpn-failover.service` | `/etc/systemd/system/sadik-vpn-failover.service` | 0644 root:root | systemd; без `[Install]`, запускается только таймером |
| `systemd/sadik-vpn-failover.timer` | `/etc/systemd/system/sadik-vpn-failover.timer` | 0644 root:root | systemd, `timers.target` |
| `systemd/sadik-vpn-only-killswitch.service` | `/etc/systemd/system/sadik-vpn-only-killswitch.service` | 0644 root:root | systemd, `multi-user.target` |
| `NetworkManager/dispatcher.d/50-sadik-set` | `/etc/NetworkManager/dispatcher.d/50-sadik-set` | 0755 root:root | диспетчер NetworkManager при событиях интерфейсов |

В бой не ставятся `README.md` и `CHANGELOG.md` (поле `not_installed` записи реестра). Каталогов `test/` и `docs/` в пакете нет.

Чего пакет не ставит, хотя без этого не работает:
- конфиги и ключи туннелей `/etc/amnezia/amneziawg/*.conf` и `*.key` (`*.conf` читают `sadik-reply-routing.sh` и `sadik-set-proverka.sh`);
- маршрут `default dev awg-ru` в таблице 225, куда RU split отправляет помеченный трафик. Код пакета его не ставит: в бою 2026-10-08 он есть, но откуда берётся, я не проверяла — конфиг туннеля закрыт;
- каталог `/etc/ru-split/`: скрипты пишут туда `ru_v4.cidrs` и `update.log`, но не создают его;
- программы `bash`, `nft`, `ip`, `iptables`, `python3`, `curl`, `awk`, `sed`, `paste`, `timeout`, `logger`, `awg` или `wg`, `awg-quick`, NetworkManager.

## Установка

Ручная установка без наших инструментов (root): каждый файл из таблицы «Что ставится и куда» —
`install -D -o root -g root -m <режим из таблицы> <файл в пакете> <путь на машине>`; затем `install -d -m 0755 /etc/ru-split`,
`systemctl daemon-reload` и `systemctl enable --now` юнитов из шага 3 ниже. До этого — правка констант под свою машину
(раздел «Что править под другую машину»): иначе killswitch отрежет машину от сети.

У нас ставят по воротам, пофайлово, инструментом `/usr/local/sbin/smontirovat-fajly`. Так велит поле `update` записи реестра: «новый номер пакета в дереве → ворота → монтаж smontirovat-fajly → перевести version/ref здесь». `smontirovat-vypusk` сюда не подходит: он собирает состав прогоном `npm pack`, а `package.json` у пакета нет. Пока действует временное правило Вениамина, любой файл пакета меняется только вместе с новым номером пакета в том же окне.

1. Кандидат — каталог пакета из дерева на метке, `<П>` ниже. По умолчанию инструмент делает прогон, а пишет в бой только с `--v-boj`. Один вызов покрывает один боевой каталог, поэтому вызовов три (файлы указываются путями относительно кандидата):

   ```
   sudo smontirovat-fajly --punkt <пункт> --progon <П> /usr/local sbin/ru-split-apply.sh …
   sudo smontirovat-fajly --punkt <пункт> --progon <П>/systemd /etc/systemd/system sadik-set.service awg-quick@awg0.service.d/20-rule-order.conf …
   sudo smontirovat-fajly --punkt <пункт> --progon <П>/NetworkManager /etc/NetworkManager dispatcher.d/50-sadik-set
   ```

   Когда прогон чистый, тот же вызов повторяют с `--v-boj` вместо `--progon`. Если файла ещё нет в бою, нужен `--novyj`. Режим и владелец нового файла тогда берутся по соседям в каталоге, а иначе задаются явно: `--mode=755 --owner=0:0` для `sbin/` и хука, `--mode=644 --owner=0:0` для юнитов. Файлы без перечня — значит все обычные файлы кандидата.

   Коды возврата инструмента: 0 — положено и сверено; 1 — отказ на записи или сверка не сошлась (инструмент откатывает сам); 2 — отказ до записи; 3 — монтировать нечего, всё уже равно бою; 4 — положено, но письмо хозяйке dorabotki не легло; 5 — положено, но коммит учёта git не сделан. `/usr/local` и `/etc/systemd/system` лежат под git, и инструмент коммитит их сам. Если учётки нет в его таблице, руку называют ключом `--ruka 'Имя <имя@машина>'`. Под `/etc/NetworkManager` git нет. Страховка ложится в `/var/backups/montazh/<пункт>/`.

2. После юнитов и drop-in: `sudo systemctl daemon-reload`. При первой установке создать каталог набора адресов РФ —
   скрипты пакета пишут в него, но сами не создают: `sudo install -d -m 0755 -o root -g root /etc/ru-split`. Без
   каталога `ru-cidr-update.sh` (с 1.0.2) набор `ru_v4` в `nft` загружает, а на записи `ru_v4.cidrs` падает: код 1,
   `ru-cidr-update.service` failed, `update.log` не пишется, а `sadik-watch` видит список старым.

3. Первая установка — включить юниты:

   ```
   sudo systemctl enable --now ru-split.service sadik-set.service sadik-vpn-only-killswitch.service ru-cidr-update.timer sadik-vpn-failover.timer
   ```

4. Когда изменились скрипты на машине, где всё уже стоит. `sadik-vpn-failover.sh` и `ru-cidr-update.sh` подхватятся сами при следующем срабатывании таймера. `ru-split-apply.sh`, `sadik-reply-routing.sh` и `sadik-vpn-only-killswitch.sh` применяются, только когда их юнит стартует заново (`sudo systemctl restart ru-split.service`, `sadik-set.service`, `sadik-vpn-only-killswitch.service`). Новый drop-in туннеля начнёт работать только после рестарта туннеля, а рестарт рвёт связь через этот туннель. Хук `50-sadik-set` диспетчер NetworkManager берёт из каталога при каждом событии. Это сказано по устройству NetworkManager, на машине я этого не проверяла.

⚠️ Правка killswitch или маршрутизации без готового отката может отрезать машину от сети. Путь отката держат до применения. Снимают юнит через `systemctl mask` (правило фермы 9): наш юнит с файлом в `/etc/systemd/system` mask не примет, поэтому файл уносят в страховку (`mv`), делают `daemon-reload`, потом `mask`. Вернуть — `unmask` и файл на место.

## Настройка

Ни один юнит пакета не задаёт `Environment=`: в бою 2026-10-08 у `sadik-set`, `ru-split`, `sadik-vpn-only-killswitch`, `sadik-vpn-failover` и `ru-cidr-update` пустой `Environment`. Поэтому в бою всегда действуют умолчания.

| что | умолчание | смысл |
|---|---|---|
| переменная `RU_SPLIT_PRIO_FILE` (`ru-split-apply.sh`, `sadik-reply-routing.sh`) | `/etc/ru-split/prio` | путь к файлу приоритета правила RU split; с 1.0.2 его читают ОБА скрипта. Место правды одно — сам файл; проверка годности продублирована в обоих скриптах одинаково: правка правила проверки в одном требует той же правки в другом |
| переменная `RU_SPLIT_MIN` (`ru-split-apply.sh`) | 5000 | сколько сетей обязано быть в наборе `ru_v4` после применения; меньше — отказ, код 1 |
| содержимое `/etc/ru-split/prio`: одно число (`ru-split-apply.sh`, `sadik-reply-routing.sh`) | файла нет → 60 (на sadik его нет) | приоритет правила `ip rule fwmark 0xa2c9 lookup 225`. Ведущие нули читаются как десятичное число. Не число, длиннее 5 цифр или вне 1..32765: `ru-split-apply.sh` — отказ, код 2, правила не тронуты; `sadik-reply-routing.sh` — строка «ОТКАЗ: … правило пометки RU-split не трогаю» в stderr и журнал (тег `sadik-reply-routing`), правило пометки не трогает, остальные правила ставит дальше и выходит кодом 0 |
| переменная `THRESH` (`sadik-vpn-failover.sh`) | 200 | возраст последнего рукопожатия в секундах; старше — туннель считается мёртвым |
| переменная `SET_CONF_DIR` (`sadik-set-proverka.sh`, `sadik-vpn-failover.sh`) | `/etc/amnezia/amneziawg` | откуда читать `Endpoint` из `*.conf`; переключатель с 1.0.2 по нему узнаёт, чьё рукопожатие считать |
| переменная `SET_EXT_IF` (`sadik-set-proverka.sh`, `50-sadik-set`) | `wan0` | внешний интерфейс: проверка ждёт маршрут через него, хук реагирует только на него |
| переменная `SET_KILLSWITCH` (`sadik-set-proverka.sh`) | `/usr/local/sbin/sadik-vpn-only-killswitch.sh` | файл, из которого проверка берёт адреса `-d`, чтобы сверить их с точками подключения |
| доводы `$1`, `$2` хука `50-sadik-set` | дают NetworkManager | интерфейс и событие. Работает только на `up`, `dhcp4-change`, `dhcp6-change` у `SET_EXT_IF`, остальное — выход 0 |
| `OnCalendar`, `RandomizedDelaySec`, `Persistent` в `ru-cidr-update.timer` | `Sun *-*-* 04:17:00`, 600, `true` | когда обновлять набор адресов РФ |
| `OnBootSec`, `OnUnitActiveSec` в `sadik-vpn-failover.timer` | 90, 30 | первый прогон после загрузки и период |
| `Restart`, `RestartSec`, `StartLimitIntervalSec`, `StartLimitBurst`, `TimeoutStartSec` в `sadik-set.service` | `on-failure`, 10, 600, 3, 150 | повтор при провале применения или проверки: не больше 3 стартов за 600 с |

Всё остальное — константы в коде, переменными не меняется. Это внешний интерфейс `wan0` и его шлюз; таблицы 100, 224, 225, 51820; метки `0x100` (ответы), `0xa2c9` (RU split), `0xca6c` (собственные пакеты туннеля); приоритеты правил 40, 50, 75, 78, 79, 32764, 32765 в `sadik-reply-routing.sh` (приоритет пометки RU split — из `/etc/ru-split/prio`, см. выше); каталог конфигов туннелей в `sadik-reply-routing.sh`; источник RIPE, каталог `/etc/ru-split` и порог в 500 CIDR в `ru-cidr-update.sh`; списки адресов-исключений в `ru-split-apply.sh` и `sadik-vpn-only-killswitch.sh`; порт SSH 38888; имена туннелей `awg3`/`awg0` в переключателе.

### Что править под другую машину

🔴 Пакет написан под sadik: адреса, интерфейсы и порты ниже зашиты в код, а не взяты из настроек. Поставленный как
есть на другую машину, он применит чужие адреса, а killswitch отрежет её от сети: выход разрешён только на концы
туннелей sadik. До установки на другую машину каждое место правят в коде. Место названо файлом и константой, а не
номером строки: номера сдвигаются от правки к правке.

| что | где в коде | на sadik |
|---|---|---|
| внешний интерфейс и его шлюз | `sadik-reply-routing.sh`, `EXT_IF=` и `EXT_GW=`; интерфейс ещё в `sadik-vpn-only-killswitch.sh` (`-i wan0`, `-o wan0`) | `wan0`, шлюз провайдера |
| своя внешняя сеть /28 | `sadik-reply-routing.sh`, правило `to <сеть> lookup main priority 50` | /28 sadik |
| концы туннелей (адрес и порт UDP) | `sadik-vpn-only-killswitch.sh`, строки `-p udp -d <адрес> --dport <порт>`; `ru-split-apply.sh`, правило `ip daddr { … } return`; конфиги `/etc/amnezia/amneziawg/*.conf` | `awg3`, `awg0`, `awg9`, `awg-ru` |
| имена туннелей | killswitch (`-o awg3` … `-o awg-ru`), `sadik-vpn-failover.sh` (`awg3` основной, `awg0` запасной), `sadik-reply-routing.sh` (`awg3` в таблице 51820) | `awg3`, `awg0`, `awg9`, `awg-ru` |
| корпоративная сеть (канал управления) | killswitch, `-d 10.240.0.0/16` на `lan0` и `wan0` | `10.240.0.0/16` через `lan0` |
| порт внешнего SSH | killswitch: вход `--dport 38888`, ответы `--sport 38888` | `38888` |
| сеть Новофона | killswitch `-d 37.139.38.0/24`; `ru-split-apply.sh` (`return` до пометки); `sadik-reply-routing.sh` (`lookup 224 priority 75`) | `37.139.38.0/24` |
| соседи по /28 | killswitch, два правила `-d <адрес> -o wan0` | два соседних сервера |
| источник набора адресов РФ и каталог | `ru-cidr-update.sh`, `SRC=` и `DIR=` | RIPE, `/etc/ru-split` |
| таблицы, метки и приоритеты правил | `sadik-reply-routing.sh`, `ru-split-apply.sh` | таблицы 100, 224, 225, 51820; метки `0x100`, `0xa2c9`, `0xca6c`; приоритеты в «Настройке» выше |

Полный перечень того, что выпускает исходящий фильтр killswitch `SADIK_VPN_ONLY_OUT`; всё прочее — REJECT:

- `-o lo`;
- ответы на внешний SSH: `-o wan0 -p tcp --sport 38888`;
- весь выход в туннели: `-o awg3`, `-o awg0`, `-o awg9`, `-o awg-ru`;
- корпоративная сеть: `-o lan0 -d 10.240.0.0/16` и `-o wan0 -d 10.240.0.0/16`;
- концы туннелей через `wan0`: четыре правила UDP «адрес · порт» (US `awg3`, NL `awg0`, RU mesh `awg9`, RU split `awg-ru`);
- Новофон: `-d 37.139.38.0/24 -o wan0`, любой протокол;
- DHCP: `-p udp --dport 67` на `wan0` и на `lan0`;
- два соседа по /28: `-d <адрес> -o wan0`, любой протокол.

Входящий фильтр `SADIK_EXT_IN` (только `-i wan0`) пропускает `RELATED,ESTABLISHED` и `tcp --dport 38888`, прочее —
DROP с записью в журнал ядра.

## Проверка

Стендов в пакете нет: каталога `test/` нет.

Проверка установки — `installed_check` из записи реестра, дословно:

```
set -o pipefail; sha256sum /etc/NetworkManager/dispatcher.d/50-sadik-set /etc/systemd/system/awg-quick@.service.d/05-nm-online.conf /etc/systemd/system/awg-quick@awg-ru.service.d/20-rule-order.conf /etc/systemd/system/awg-quick@awg0.service.d/20-rule-order.conf /etc/systemd/system/awg-quick@awg0.service.d/transport.conf.disabled-20260821 /etc/systemd/system/awg-quick@awg3.service.d/10-reply-routing.conf /etc/systemd/system/awg-quick@awg9.service.d/20-rule-order.conf /etc/systemd/system/ru-cidr-update.service /etc/systemd/system/ru-cidr-update.timer /etc/systemd/system/ru-split.service /etc/systemd/system/sadik-set.service /etc/systemd/system/sadik-vpn-failover.service /etc/systemd/system/sadik-vpn-failover.timer /etc/systemd/system/sadik-vpn-only-killswitch.service /usr/local/sbin/ru-cidr-update.sh /usr/local/sbin/ru-split-apply.sh /usr/local/sbin/sadik-reply-routing.sh /usr/local/sbin/sadik-set-proverka.sh /usr/local/sbin/sadik-vpn-failover.sh /usr/local/sbin/sadik-vpn-only-killswitch.sh | LC_ALL=C sort -k2 | sha256sum | cut -c1-16 | sed 's/^/sha256:/'
```

Запускать под root (`sudo bash -c '…'`): без прав часть файлов не прочитается, и отпечаток будет не про них. Ждать код 0 и вывод, равный полю `version` записи. 2026-10-08 около 18:50Z оба равны `sha256:22ad6aa999d7b43c`.

`healthcheck` из записи реестра: `systemctl is-active sadik-vpn-failover.timer`. Ждать `active` и код 0. Он покрывает только таймер переключателя.

Коды служб пакета, которые валят юнит (с 1.0.2):
- `ru-split-apply.sh` — 1, если после применения в наборе `ru_v4` меньше `RU_SPLIT_MIN` сетей (умолчание 5000) или нет
  правила `fwmark 0xa2c9 lookup 225`; строка «ОТКАЗ: RU split НЕ работает: …», `ru-split.service` становится failed. 2 —
  негодный `/etc/ru-split/prio`;
- `sadik-vpn-only-killswitch.sh` — 3, если IPv6 не выключен (правила IPv4 уже стоят); 4 — ДО любой правки: цепь
  `SADIK_VPN_ONLY_OUT_NEW` или `SADIK_EXT_IN_NEW` уже есть и на неё ссылаются («цепь …_NEW живая (ссылок N) — прежняя
  подстановка не завершилась; правила не трогаю»). Разбирают руками: `sudo iptables -S | grep _NEW`. Итого коды 0 / 3 / 4;
- `ru-cidr-update.sh` — 2, если пришло меньше 500 CIDR (набор не тронут); 1, если нет каталога `/etc/ru-split` (набор
  уже загружен, список не записан). Список `/etc/ru-split/ru_v4.cidrs` пишется
  только ПОСЛЕ успешной загрузки набора в `nft`: отказ загрузки больше не оставляет свежий файл при старом наборе.

Сеть по свойству — `sudo /usr/local/sbin/sadik-set-proverka.sh`. Под обычной учёткой конфиги туннелей не читаются, и выйдет «слепота» с кодом 2. Коды: 0 — сошлось; 1 — есть расхождение (маршрута до точки подключения нет, он идёт не через `wan0`, нет правила `lookup 100`, `suppress_prefixlength` или `lookup 51820`, или точки нет в killswitch); 2 — проверять нечем (точки подключения не прочитаны или killswitch не прочитан). Последняя строка вывода — `ИТОГО: сошлось N, расхождений M, слепот K (точек подключения: P)`.

Что ещё смотреть:
- `systemctl list-timers ru-cidr-update.timer sadik-vpn-failover.timer` — оба таймера стоят в расписании;
- `systemctl is-active ru-split.service sadik-set.service sadik-vpn-only-killswitch.service` — каждый `active` (oneshot с `RemainAfterExit`);
- журнал по тегам: `journalctl -t sadik-vpn-failover` (переключения), `-t sadik-reply-routing` (предупреждение о порядке приоритетов), `-t sadik-nm-hook` (срабатывания хука и вывод проверки), `-u ru-cidr-update.service`; журнал ядра с префиксами `[SADIK EXT DROP]` и `[SADIK NO-VPN OUT]` (отказы killswitch, не больше 6 в минуту);
- `/etc/ru-split/update.log` — строка на каждое обновление набора;
- killswitch проверяют счётчиками (`sudo iptables -L SADIK_VPN_ONLY_OUT -v -n`, входящий фильтр — `sudo iptables -L SADIK_EXT_IN -v -n`), а не пингом: к концам туннелей открыт только UDP на их порты, ICMP уйдёт в REJECT и даст ложный отказ;
- сумма каждого файла пакета равна сумме боя (`sudo sha256sum`), права — таблице выше (`sudo stat -c '%a %U:%G'`).

## Ограничения

- `sadik-set-proverka.sh` ловит только «правила и маршруты смыло». Она не видит, что точка подключения сменилась на той стороне, а конфиг остался прежним. Не видит качество канала (потери, задержки, MTU) и не проверяет, есть ли выход в интернет вообще. Наличие правил она проверяет подстрокой, без проверки их приоритетов, а правила RU split (по умолчанию 60), Новофона (75), соседей по /28 (50) и маршрут таблицы 225 не проверяет совсем.
- Если проверка в ExecStartPost вернёт 1 или 2, `sadik-set.service` упадёт. Слепота (2) тоже валит юнит. Systemd перезапустит его не больше трёх раз за 600 с, а потом юнит останется `failed`.
- Хук `50-sadik-set` срабатывает только на `up`, `dhcp4-change` и `dhcp6-change` у `wan0`. Случай, когда NetworkManager не запущен вовсе, он не ловит. Молчание хука не значит, что сеть здорова.
- Drop-in туннелей вызывают `sadik-reply-routing.sh` с префиксом `-`, поэтому провал скрипта туннель не роняет и снаружи не виден. Скрипт ждёт шлюз до 79 с (20 попыток) и, если не дождался, выходит с 1, не меняя правил.
- Адреса концов туннелей записаны в трёх местах: конфиги туннелей (оттуда их берут `sadik-reply-routing.sh` и проверка), константы в `sadik-vpn-only-killswitch.sh` и константы в `ru-split-apply.sh`. Проверка сверяет конфиги только с killswitch. Если адрес сменится, killswitch молча заблокирует новый, а список исключений RU split останется устаревшим, и этого никто не заметит. Списки не синхронизируются: так решено намеренно.
- Приоритет правила пометки RU split (`fwmark 0xa2c9 lookup 225`) с 1.0.2 берут из `/etc/ru-split/prio` оба скрипта, `ru-split-apply.sh` и `sadik-reply-routing.sh`. Прежде `sadik-reply-routing.sh` ставил его на 60 константой, и на машине с другим числом в файле каждый старт туннеля, срабатывание хука и рестарт `sadik-set` возвращали правило на 60.
- `sadik-reply-routing.sh` ставит `default dev awg3` в таблицу 51820, только если в ней ещё нет маршрута по умолчанию (с 1.0.2). Выбор между US (`awg3`), NL (`awg0`) и `unreachable` целиком у `sadik-vpn-failover.sh`: старт `sadik-set`, туннеля или хук его больше не перебивают. Прежде любое из этих событий возвращало выход на US до следующего прогона переключателя.
- `sadik-vpn-failover.sh` считает туннель живым по свежести рукопожатия (моложе `THRESH`) с ТЕМ пиром, чья точка подключения записана в `Endpoint` конфига `SET_CONF_DIR/<туннель>.conf` (с 1.0.2; прежде бралась первая строка `latest-handshakes`). Пир один — берётся он. Пиров несколько, а точка не опознана — туннель считается мёртвым, в журнал (тег `sadik-vpn-failover`) пишется причина. Знает только `awg3` и `awg0`. Когда мертвы оба, ставит `unreachable` (fail-closed). Если нет ни `awg`, ни `wg`, скрипт падает, ничего не переключив. Есть ли в конфигах туннелей `PersistentKeepalive`, я не проверяла: без него туннель, по которому ничего не идёт, рукопожатие не обновляет.
- killswitch — это два фильтра. Исходящий `SADIK_VPN_ONLY_OUT` (первым правилом `OUTPUT`) выпускает только туннели, корпоративную сеть, концы туннелей и поимённые исключения, прочее — REJECT. Входящий `SADIK_EXT_IN` (первым правилом `INPUT` для `-i wan0`) пропускает только `RELATED,ESTABLISHED` и `tcp --dport 38888`, прочее — DROP с записью `[SADIK EXT DROP]`; внутренняя `lan0` и туннели им не затронуты. Новый входящий порт на `wan0`, кроме 38888, будет молча отброшен, пока его не допишут в код.
- killswitch построен только на `iptables` (IPv4); правил `ip6tables` код не ставит. С 1.0.2 он собирает цепочки под временными именами `SADIK_VPN_ONLY_OUT_NEW` и `SADIK_EXT_IN_NEW`, ставит прыжок в новую цепочку, снимает прыжки в старую и переименовывает новую: пустой цепочки на пути нет, окна открытого выхода при повторном применении нет. После установки правил IPv4 он проверяет `net.ipv6.conf.all.disable_ipv6`: не 1 — отказ, код 3, «IPv6 не выключен…», и служба `sadik-vpn-only-killswitch` становится failed. Правила IPv4 к этому моменту уже стоят. На sadik IPv6 выключен настройкой машины — это часть политики.
- `ru-cidr-update.sh` собирает только IPv4 (`ru_v4`). Если пришло меньше 500 CIDR, он отказывает с кодом 2 и набор не трогает. Без доступа к `ftp.ripe.net` набор не обновится.
- Пакет не ставит конфиги и ключи туннелей, маршрут таблицы 225 и каталог `/etc/ru-split` (см. раздел «Что ставится и куда»). Правило `72: to 46.19.64.6 iif lo ipproto tcp lookup 225`, которое есть в бою, ставит не этот пакет.
- Пакет служебный (группа Д): публикуется исходниками, без npm, после общих ворот секретов (`vorota-obezlichivaniya`).
