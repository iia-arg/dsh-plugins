Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-storozha-sadik — сторожа машины sadik, которые не вошли в dsh-storozha-mashiny, и их каналы тревог

Версия · Version: 3.1.10

Текущая версия — см. заголовок `CHANGELOG.md` (у пакета нет `package.json`) и метку `dsh-storozha-sadik-v<номер>` в дереве.

## Назначение

Пакет собирает служебный софт sadik, привязанный к этой машине: её агентам, туннелям, реестрам и ботам. Обобщённые
сторожа живут в соседнем пакете `dsh-storozha-mashiny`; здесь — то, что без sadik смысла не имеет. Пакет
публикуется только исходниками, в npm его нет: он привязан к sadik — `agent-button-daemon.sh` исполняет команды по
брошенному файлу, каналы тревог пишут владельцу в личные сообщения, а в сторожах зашиты наши машины, адреса и агенты.

Что внутри и кто это зовёт:

- `sadik-watch` — независимый от агентов срез машины. Его зовёт `sadik-watch.timer` каждые 10 минут. Он смотрит
  службы агентов и шлюзов из реестра (`agent-registry`): жива ли служба, свежи ли события в журнале, нет ли отказа
  по длине промпта и обрыва по лимиту, не завис ли ход, растёт ли память. Ещё он проверяет место на `/`, mesh-туннель
  `awg9` до vps-ru, правило 72 и RU split, белый список и песочницу Варвары, гостевые правила Варвары, «сторожа над
  сторожами» (перечень `/etc/agent-registry/storozha-sutochnye.txt`), обслуживание памяти, настройку канала
  `agent-alert`, правку реестра плагинов мимо `agent-plugins pravka`, каталоги голоса от root в `/var/tmp`, состав
  групп-шлюзов прав (ступень «группы прав» зовёт `gruppy-prav-watch`, см. ниже). Раз в 7 суток он сам говорит «жив».
  Тревоги уходят через `dsh-alert`, при его отказе — письмом a2a агенту `iskra`.
- `gruppy-prav-watch` + эталон `gruppy-prav.conf` — члены групп-шлюзов прав (`limity-vhod`, `agent-button`,
  `claudeoauth`) против эталона: строки `m` в `sysusers.d` или явный список с доводом на каждого члена (B-N-1913).
  Сверяет и дополнительных членов (`/etc/group`), и членов по основной группе (`/etc/passwd`). Сам наружу не пишет и
  ничего не меняет: его зовёт `sadik-watch` каждый такт, лишний или недостающий член — тревога с именами учётки и
  группы.
- `dsh-alert` — канал тревог «предмет sadik» (бот @arg_dsh_alert_bot). Его зовут `sadik-watch`, `dsh-compact-watch`,
  а из других пакетов — `pereklyuchatel-podpiski` и `sadik-komandy-priyomnik` (dsh-podpiski).
- `claudeclaw-alert` — канал тревог «предмет aclaude» (бот @idomik_bot), токен лежит на диске sadik. Его зовёт
  `aclaude-snaruzhi-watch`; `dkms-kernel-coverage` берёт его запасным каналом (drop-in `50-mashina.conf`);
  `inet6-poyavlenie-watch` позвал бы его, только если в `PATH` нет `agent-alert`.
- `dsh-compact-watch` — сторож сжатий, `dsh-compact-watch.timer` каждые 5 минут. Он читает журналы служб агентов и
  шлюзов из реестра: события сжатия, немоту сжатия, давление шлюза, серии обрывов, отказ сводки kompakt-dsh, отказ
  секретаря, инструменты, отброшенные шлюзом. Пороги занятости окна (85/90 % от порога сжатия) он берёт из прибора
  `kontekst-zamer` (dsh-storozha-mashiny); заодно стережёт подстановку ролей компакта. Тревоги идут в `dsh-alert`.
  С 08.10 о заполнении контекста и о платформенном сжатии он владельцу молчит: об этом говорит `dsh-pamyat-storozha`
  (`DSH_COMPACT_WATCH_MOLCHAT`).
- `aclaude-snaruzhi-watch` — внешний прибор «aclaude лежит». `sh1` (каждую минуту) делает TCP-рукопожатие с sshd aclaude
  по двум путям; `sh2` (раз в 2 минуты) входит по ssh с forced command `proba-snaruzhi` и проверяет инстансы, их
  вебхук-серверы, диск и внутренних сторожей aclaude. Тревога уходит в `claudeclaw-alert`, запасной — `agent-alert`.
- `chitatel-obhoda` — читатель ночного обхода стендов (`vse-stendy-boevye`, 03:40 UTC). Таймер зовёт его раз в час
  с 04:50 до 10:50 UTC. Он кладёт координатору одно письмо через `tell-komu` (dsh-pochta): неожиданное красное,
  «N-я ночь подряд», «снято», «прогона нет».
- `model-podmena-watch` — сторож подмены модели, раз в 5 минут. В журналах шлюзов он ищет ответ не той моделью и
  `model/rerouted` у Codex; ещё проверяет, пуст ли `~/.claude/remote-settings.json` у учёток Claude-шлюзов. Канал —
  `agent-alert`.
- `sessiya-uderzhana-watch` — сторож удержанной сессии, раз в 2 минуты. Незавершённый `/new` дольше 10 минут —
  тревога в `agent-alert`, одна на эпизод.
- `socseti-watch` — раз в минуту спрашивает статус службы `socseti` (MCP на 127.0.0.1:8381). Telegram остановлен или
  ответа нет — тревога в `agent-alert`, по одной причине раз в сутки.
- `ostrov-kopiya-watch` — раз в час сверяет релиз копии API Острова для стендов (`/opt/agent-plugins-stend/ostrov-api`)
  с `release` из health сайта. Разошлось — тревога в `agent-alert` с готовыми строками обновления копии; сам копию
  не обновляет.
- `pamyat-fill-watch.py` — раз в сутки (02:00 UTC) проверяет за 14 суток, наполняется ли память агентов реестра:
  ходы, новые записи `pamyat.db`, завершения секретаря, склейки OMEGA в чужой корень. Только читает; тревога в
  `agent-alert` при смене набора находок и раз в неделю.
- `pamyat-seam/` — ежедневный (06:20 UTC) стенд цепи «секретарь → ядро → restore» на боевых пакетах
  `/opt/agent-plugins/node_modules`. Если он упал, `pamyat-seam-failed@` шлёт тревогу в `agent-alert`.
- `agent-button-daemon.sh` — «кнопка»: постоянная служба, которая исполняет команды из списка
  `/etc/agent-button/allowed.conf` по файлу-запросу в `/var/lib/agent-button/pending/`. Нужна, чтобы агент мог
  перезапустить сам себя: делает это процесс вне его дерева процессов.

Результат читают владелец (Telegram), координатор (письма `chitatel-obhoda`) и сам `sadik-watch`: упавшую службу
любого сторожа из перечня суточных он видит как «failed» или «просрочен».

## Что ставится и куда

Все 45 файлов сверены с записью `dsh-storozha-sadik` в `/etc/agent-registry/plugins.yaml` (раздел `services`,
`derevo.files`). Права в git не хранятся (только признак «исполняемый»), поэтому режим и владелец даны по бою.
Каталоги `bin/`, `sbin/`, `libexec/` повторяют пути под `/usr/local/`, `systemd/` — под `/etc/systemd/system/`, а
`etc/` (эталон групп `gruppy-prav.conf`) — под `/etc/agent-registry/`.

| Файл в пакете | Путь на машине | Режим, владелец | Кто исполняет / читает |
|---|---|---|---|
| `sbin/sadik-watch` | `/usr/local/sbin/sadik-watch` | 0755 root:root | `sadik-watch.service`; руками — только `--podtverdit` |
| `bin/dsh-alert` | `/usr/local/bin/dsh-alert` | 0755 root:root | sadik-watch, dsh-compact-watch, pereklyuchatel-podpiski, sadik-komandy-priyomnik |
| `bin/claudeclaw-alert` | `/usr/local/bin/claudeclaw-alert` | 0755 root:root | aclaude-snaruzhi-watch; запасной канал dkms-kernel-coverage |
| `sbin/dsh-compact-watch` | `/usr/local/sbin/dsh-compact-watch` | 0755 root:root | `dsh-compact-watch.service` |
| `sbin/aclaude-snaruzhi-watch` | `/usr/local/sbin/aclaude-snaruzhi-watch` | 0755 root:root | `aclaude-snaruzhi-sh1.service`, `aclaude-snaruzhi-sh2.service` |
| `sbin/chitatel-obhoda` | `/usr/local/sbin/chitatel-obhoda` | 0755 root:root | `chitatel-obhoda.service` |
| `sbin/model-podmena-watch` | `/usr/local/sbin/model-podmena-watch` | 0755 root:root | `model-podmena-watch.service` |
| `sbin/sessiya-uderzhana-watch` | `/usr/local/sbin/sessiya-uderzhana-watch` | 0755 root:root | `sessiya-uderzhana-watch.service` |
| `sbin/socseti-watch` | `/usr/local/sbin/socseti-watch` | 0755 root:root | `socseti-watch.service` |
| `sbin/ostrov-kopiya-watch` | `/usr/local/sbin/ostrov-kopiya-watch` | 0755 root:root | `ostrov-kopiya-watch.service` |
| `sbin/agent-button-daemon.sh` | `/usr/local/sbin/agent-button-daemon.sh` | 0755 root:root | `agent-button.service` |
| `libexec/pamyat-fill-watch.py` | `/usr/local/libexec/pamyat-fill-watch.py` | 0644 root:root | `pamyat-fill-watch.service` (`python3 -B … --run`, `ExecStopPost … --failure`) |
| `libexec/pamyat-seam/run.sh` | `/usr/local/libexec/pamyat-seam/run.sh` | 0755 root:root | `pamyat-seam.service` (User=coders) |
| `libexec/pamyat-seam/stand.mjs` | `/usr/local/libexec/pamyat-seam/stand.mjs` | 0644 root:root | `run.sh` (через `/usr/local/bin/node`) |
| `libexec/pamyat-seam/failed-v2.sh` | `/usr/local/libexec/pamyat-seam/failed-v2.sh` | 0755 root:root | `pamyat-seam-failed@.service` |
| `libexec/gruppy-prav-watch` | `/usr/local/libexec/gruppy-prav-watch` | 0755 root:root | sadik-watch, ступень «группы прав» (`python3 -ISB`) |
| `etc/gruppy-prav.conf` | `/etc/agent-registry/gruppy-prav.conf` | 0644 root:agent-registry | gruppy-prav-watch (эталон состава групп-шлюзов) |
| `systemd/sadik-watch.service` | `/etc/systemd/system/sadik-watch.service` | 0644 root:root | systemd; задаёт среду `SADIK_WATCH_*` |
| `systemd/sadik-watch.timer` | `/etc/systemd/system/sadik-watch.timer` | 0644 root:root | systemd, `*:2/10` (каждые 10 мин), включён |
| `systemd/dsh-compact-watch.service` | `/etc/systemd/system/dsh-compact-watch.service` | 0644 root:root | systemd |
| `systemd/dsh-compact-watch.service.d/70-predely.conf` | `/etc/systemd/system/dsh-compact-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/dsh-compact-watch.timer` | `/etc/systemd/system/dsh-compact-watch.timer` | 0644 root:root | systemd, `*:0/5`, включён |
| `systemd/aclaude-snaruzhi-sh1.service` | `/etc/systemd/system/aclaude-snaruzhi-sh1.service` | 0644 root:root | systemd |
| `systemd/aclaude-snaruzhi-sh1.timer` | `/etc/systemd/system/aclaude-snaruzhi-sh1.timer` | 0644 root:root | systemd, каждую минуту (`*:*:00`), включён |
| `systemd/aclaude-snaruzhi-sh2.service` | `/etc/systemd/system/aclaude-snaruzhi-sh2.service` | 0644 root:root | systemd |
| `systemd/aclaude-snaruzhi-sh2.timer` | `/etc/systemd/system/aclaude-snaruzhi-sh2.timer` | 0644 root:root | systemd, `*:0/2:30`, включён |
| `systemd/chitatel-obhoda.service` | `/etc/systemd/system/chitatel-obhoda.service` | 0644 root:root | systemd; `EnvironmentFile=-/etc/default/chitatel-obhoda` (с «-»: без файла юнит стартует, читатель отказывает сам) |
| `systemd/chitatel-obhoda.timer` | `/etc/systemd/system/chitatel-obhoda.timer` | 0644 root:root | systemd, `04..10:50 UTC`, включён |
| `systemd/model-podmena-watch.service` | `/etc/systemd/system/model-podmena-watch.service` | 0644 root:root | systemd |
| `systemd/model-podmena-watch.service.d/70-predely.conf` | `/etc/systemd/system/model-podmena-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/model-podmena-watch.timer` | `/etc/systemd/system/model-podmena-watch.timer` | 0644 root:root | systemd, `*:0/5`, включён |
| `systemd/sessiya-uderzhana-watch.service` | `/etc/systemd/system/sessiya-uderzhana-watch.service` | 0644 root:root | systemd |
| `systemd/sessiya-uderzhana-watch.service.d/70-predely.conf` | `/etc/systemd/system/sessiya-uderzhana-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/sessiya-uderzhana-watch.timer` | `/etc/systemd/system/sessiya-uderzhana-watch.timer` | 0644 root:root | systemd, через 2 мин после прошлого прогона, включён |
| `systemd/socseti-watch.service` | `/etc/systemd/system/socseti-watch.service` | 0644 root:root | systemd; код 10 считается успехом |
| `systemd/socseti-watch.timer` | `/etc/systemd/system/socseti-watch.timer` | 0644 root:root | systemd, через 60 с после прошлого прогона, включён |
| `systemd/ostrov-kopiya-watch.service` | `/etc/systemd/system/ostrov-kopiya-watch.service` | 0644 root:root | systemd; пределы `MemoryMax=128M`, `MemorySwapMax=0`, `TimeoutStartSec=120` в самом юните |
| `systemd/ostrov-kopiya-watch.timer` | `/etc/systemd/system/ostrov-kopiya-watch.timer` | 0644 root:root | systemd, `*:23` (раз в час), включён |
| `systemd/pamyat-fill-watch.service` | `/etc/systemd/system/pamyat-fill-watch.service` | 0644 root:root | systemd |
| `systemd/pamyat-fill-watch.service.d/70-predely.conf` | `/etc/systemd/system/pamyat-fill-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/pamyat-fill-watch.timer` | `/etc/systemd/system/pamyat-fill-watch.timer` | 0644 root:root | systemd, 02:00 UTC, включён |
| `systemd/pamyat-seam.service` | `/etc/systemd/system/pamyat-seam.service` | 0644 root:root | systemd; `OnFailure=pamyat-seam-failed@%n.service` |
| `systemd/pamyat-seam.timer` | `/etc/systemd/system/pamyat-seam.timer` | 0644 root:root | systemd, 06:20 UTC, включён |
| `systemd/pamyat-seam-failed@.service` | `/etc/systemd/system/pamyat-seam-failed@.service` | 0644 root:root | systemd по `OnFailure=` у `pamyat-seam.service` |
| `systemd/agent-button.service` | `/etc/systemd/system/agent-button.service` | 0644 root:root | systemd, `WantedBy=multi-user.target`, `Restart=always`, включена |

В бой не ставятся: `README.md`, `CHANGELOG.md`, все стенды из `test/` и образец `etc/default/chitatel-obhoda.example`.
В записи реестра `not_installed` на 10.10 названы `README.md`, `CHANGELOG.md` и `test/stend-gruppy-prav.sh`; новые файлы
1.0.10 (`test/stend-knopki.sh`, шесть стендов ниже и образец) туда вносят на шаге номера пакета. В `test/` лежат стенды
`gruppy-prav-watch`, `agent-button-daemon.sh`, `dsh-alert`, `claudeclaw-alert`, песочницы гостя и полноты перечня в `sadik-watch`, порога
`dsh-compact-watch`, бюджета `sessiya-uderzhana-watch` и `ostrov-kopiya-watch`; стенды остальных файлов — в пакете `dsh-obhod-stendov`
(см. «Проверка»).

У всех 24 юнитов пакета на машине нет drop-in'ов: вся настройка — в самих юнитах и в файлах, перечисленных в
«Настройке».

### Зависимости

Пакет ставит только свои файлы. Без перечисленного ниже сторож слепнет (код 2) или его юнит не стартует.

Наши пакеты — команды, которые зовёт код:

| команда | пакет | кто зовёт |
|---|---|---|
| `agent-registry` | `a2a-bus` | `sadik-watch` (команда); `dsh-compact-watch` грузит его модулем ради порогов (`KONTEKST_REESTR_PRIBOR`). Остальные сторожа читают файл реестра напрямую |
| `a2a-send` | `a2a-bus` | `sadik-watch` (запасной канал тревог) |
| `agent-alert` | `dsh-trevogi` | единственный канал тревог у `model-podmena-watch`, `sessiya-uderzhana-watch`, `socseti-watch`, `ostrov-kopiya-watch`, `pamyat-fill-watch.py`, `pamyat-seam-failed@`; запасной у `aclaude-snaruzhi-watch`; `sadik-watch` проверяет его настройку. Без него эти шесть сторожей молчат |
| `tell-komu` | `dsh-pochta` | `chitatel-obhoda` (единственный канал) |
| `kontekst-zamer` | `dsh-storozha-mashiny` | `dsh-compact-watch` (пороги занятости окна) |
| `/usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py` | `dsh-pamyat-obsluzhivanie` | `sadik-watch` (обслуживание памяти) |
| `/usr/local/bin/bwrap-bez-zhurnala` | `dsh-gosti` | `sadik-watch` (проба гостевой песочницы) |
| `smontirovat-fajly` | `dsh-montazh` | рука установки (см. «Установка») |

Программы системы:

| программа | кто зовёт |
|---|---|
| `bash`, `python3`, `systemctl`, `journalctl`, `timeout`, `logger` | почти все сторожа |
| модуль python `yaml` (PyYAML) | `dsh-compact-watch`, `model-podmena-watch`, `sessiya-uderzhana-watch`, `pamyat-fill-watch.py` |
| `jq`, `git`, `nft`, `awg`, `ip`, `runuser`, `setpriv`, `ssh` | `sadik-watch` (`ssh` — только при `SADIK_WATCH_MESTNO=0`) |
| `zstd` (`/usr/bin/zstd`) | `pamyat-fill-watch.py` (сжатые журналы сессий) |
| `node` (`/usr/local/bin/node`) | `pamyat-seam/run.sh`, `sadik-watch` |
| `curl` | `dsh-alert`, `claudeclaw-alert` |
| `ssh` | `aclaude-snaruzhi-watch` (`sh2`) |

Файлы машины, которые пакет читает, но не ставит:

- токены каналов: `/etc/dsh-alert.token` (0640 root:agent-switch), `/etc/claudeclaw-alert.token` (0600 root:root); общий адрес владельца — `/etc/vladelec/telegram-id` (0644 root:root);
- `/etc/aclaude-snaruzhi/` — `conf` (ключи — в «Настройке»), ключ входа `id_ed25519`, `known_hosts`;
- `/etc/default/chitatel-obhoda` — `CHO_KOREN`, `CHO_ADRESAT`, `CHO_SHAPKA` (см. «Настройку»); образец —
  `etc/default/chitatel-obhoda.example` пакета (скопировать, root:root 0644, вписать свои значения);
- `/etc/agent-button/allowed.conf` — строки `имя = команда`;
- `/etc/socseti/monitor.key` — 64 шестнадцатеричных знака, 0600 или 0640;
- реестры `/etc/agent-registry/agents.yaml`, `plugins.yaml`, `storozha-sutochnye.txt`;
- объявления групп в `/etc/sysusers.d` и `/usr/lib/sysusers.d` (их читает `gruppy-prav-watch`);
- `/etc/memory-compaction/deployment.json` (`dsh-compact-watch`), `/etc/varvara/gosti/AGENTS.md` и `.prinyato`
  рядом (`sadik-watch`), `/etc/ru-split/ru_v4.cidrs` (`sadik-watch`).

## Установка

Ручная установка без наших инструментов (root): каждый файл из таблицы «Что ставится и куда» —
`install -D -o <владелец> -g <группа> -m <режим из таблицы> <файл в пакете> <путь на машине>` (группа `agent-registry` у
эталона `gruppy-prav.conf` должна существовать); затем `systemctl daemon-reload`, `systemctl enable --now` таймеров и
`agent-button.service` (шаг 3 ниже) и файлы машины из «Зависимостей» — без них сторожа слепнут.

У нас пакет ставят пофайлово, через ворота: правка в дереве `/opt/iskra/workspace/dsh-plugins` получает новый номер
пакета (временное правило Вениамина), проходит ворота, затем её монтируют `smontirovat-fajly`. Без ключа инструмент
делает только прогон; в бой пишет лишь `--v-boj`, и только под root. Страховку заменяемых файлов он кладёт сам
(`/var/backups/montazh/<пункт>/`), после записи сверяет суммы, режим и владельца.

1. Прогон, затем монтаж исполняемых файлов. Каталог кандидата — корень пакета, боевой — `/usr/local`. Файлы называть
   ЯВНО: без списка инструмент берёт все файлы кандидата, то есть и `README.md`, и `systemd/`.

   ```bash
   P=/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik
   sudo smontirovat-fajly --punkt <пункт> --progon "$P" /usr/local sbin/sadik-watch
   sudo smontirovat-fajly --punkt <пункт> --v-boj  "$P" /usr/local sbin/sadik-watch
   ```

2. Юниты — так же, каталог кандидата `"$P/systemd"`, боевой `/etc/systemd/system`:

   ```bash
   sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/systemd" /etc/systemd/system sadik-watch.service sadik-watch.timer
   sudo systemctl daemon-reload
   ```

   Новый файл, которого в бою ещё нет, инструмент примет только с `--novyj` (режим и владелец — по соседям в
   каталоге или явно `--mode=` / `--owner=`).

   Эталон групп — так же, каталог кандидата `"$P/etc"`, боевой `/etc/agent-registry` (0644 root:agent-registry):

   ```bash
   sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/etc" /etc/agent-registry gruppy-prav.conf
   ```

   Порядок для «групп прав»: эталон → `libexec/gruppy-prav-watch` → живой прогон проверки (ждём код 0) →
   `sbin/sadik-watch`. Обратный порядок даёт первым тактом тревогу «слепота».

3. Новый таймер включить: `sudo systemctl enable --now <имя>.timer`; кнопку — `sudo systemctl enable --now
   agent-button.service`. Службы-сторожа сами не перезапускаются: следующий такт таймера возьмёт новый файл. Кнопку
   после замены `agent-button-daemon.sh` нужно перезапустить: `sudo systemctl restart agent-button.service`.
4. Новый сторож с таймером внести строкой в `/etc/agent-registry/storozha-sutochnye.txt` (`<служба> <срок_часов>`) или
   строкой `!<служба> <причина>`. Иначе `sadik-watch` покраснеет: «таймер наш, строки в перечне НЕТ».
   Замаскированный таймер (`systemctl mask`) строки не требует: он идёт в счёт «замаскировано N: <имена>» строки полноты,
   не красное. Служба таймера «-» в `list-timers --all` без маски — красная строка «служба не определена: <таймер>».
5. В записи `dsh-storozha-sadik` реестра перевести `version` (отпечаток `installed_check`) и `ref` на новую метку.
   Реестр правится только через `agent-plugins pravka`: правку мимо неё ловит сам `sadik-watch`.

Снятие файла — `smontirovat-fajly --punkt <пункт> --snyat [--progon | --v-boj] <боевой каталог> <файлы…>`. Юнит
снимают `systemctl mask`. Но наш юнит, у которого есть файл в `/etc/systemd/system`, mask не примет: файл сначала
уносят в страховку (`mv`), затем `daemon-reload` и `mask`. Вернуть — `unmask` и файл на место.

## Настройка

Ниже — всё, что код берёт из окружения, доводов и файлов настройки. Числа, не названные здесь, зашиты в код.

**sadik-watch** (окружение; в бою его задаёт `sadik-watch.service`)

| Настройка | Умолчание кода | Смысл |
|---|---|---|
| `SADIK_WATCH_MESTNO` | `0` (срез по ssh) | `1` — срез снимается на самой машине (бой). Не задана вовсе — отказ, код 2 |
| `SADIK_ALERT_BIN` | `/usr/local/bin/sadik-alert` | основной канал тревог; в бою `/usr/local/bin/dsh-alert`. Не задана вовсе — отказ, код 2 |
| `SADIK_WATCH_SOST` | `$HOME/.local/state/sadik-watch` | каталог состояния; в бою `/var/lib/sadik-watch`. Нет ни его, ни `HOME` — отказ, код 2 с причиной |
| `SADIK_HOST` | `sadik` | хост для ssh (только при `MESTNO=0`) |
| `POROG_TISHINY_MIN` | `120` | столько минут без строк журнала службы — «молчит» |
| `POROG_MESTA_PROC` | `90` | занятость `/` в процентах, с которой идёт тревога |
| `OKNO_OTKAZA` | `3h` | окно поиска отказа по длине и обрыва по лимиту |
| `SADIK_ZAPASNOJ_ADRESAT` | `iskra` | агент, которому уходит письмо a2a при отказе основного канала |
| `SADIK_A2A_BIN` | `/usr/local/bin/a2a-send` | отправщик запасного канала |
| `SADIK_AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | чью настройку проверять (`--proverit-nastrojku`, без отправки) |
| `SADIK_GRUPPY_PRAV_BIN` | `/usr/local/libexec/gruppy-prav-watch` | проверка групп прав (зовётся `python3 -ISB`, предел 20 с) |
| `SADIK_SUTOCHNYE` | `/etc/agent-registry/storozha-sutochnye.txt` | перечень сторожей «юнит срок_часов» и `!юнит причина` |
| `SADIK_REESTR_PLAGINOV` | `/etc/agent-registry/plugins.yaml` | реестр, чью правку мимо `pravka` ловить |
| `SADIK_GOLOS_SUTOK` | `7` | раз во сколько суток говорить «жив» |
| `SADIK_VAR_TMP` | `/var/tmp` | где искать `dsh-voice-*` от root |
| `SADIK_WATCH_PAUZA_DIR` | `/var/lib/dsh-pauza` | файлы паузы агентов по `/stop` (переменная — для стенда) |
| `SADIK_GOSTI_PRAVILA` | `/etc/varvara/gosti/AGENTS.md` | гостевые правила Варвары; рядом `.prinyato` с принятой суммой |
| `SADIK_BELYJ_SPISOK` | из `GATEWAY_GOST_BELYJ_SPISOK` службы `claude-oauth-gateway@varvara` | белый список Варвары |
| `SADIK_BELYJ_MODUL` | `/opt/subscription-gateway-guest/pdn-maska.mjs` | разборщик белого списка |
| `SADIK_NEMOTA_OBERTKA` | `/usr/local/bin/bwrap-bez-zhurnala` | обёртка песочницы Варвары. Принятая сумма — сумма файла обёртки в метке выпуска (`derevo.ref`) той записи реестра, чей `derevo.files` ставит этот путь; записей не одна, реестр или метка не прочитаны — «не мерено», не красное. Дерево по адресу записи git читает с доверием только этому адресу (`safe.directory=<адрес>`, не `*`); адрес не корень дерева — тоже «не мерено» |
| `SADIK_NEMOTA_REESTR` | `/etc/agent-registry/plugins.yaml` | реестр, из которого берётся принятая сумма обёртки |
| `SADIK_NEMOTA_PROFIL` | `/opt/varvara/.dsh/profiles/web/cordis.patch.yml` | профиль, который обязан звать обёртку |
| `SADIK_NEMOTA_LEDGER` | `/opt/varvara/workspace/.message-receipts/receipts.sqlite` | ledger, невидимость которого проверяет проба |
| `SADIK_NEMOTA_ZHURNAL` | пусто (читается журнал `varvara.service`) | файл вместо журнала (для стенда) |
| `RU_SPLIT_SPISOK` | `/etc/ru-split/ru_v4.cidrs` | список RU-сетей; старше 15 суток — беда |
| довод `--podtverdit` | — | записать текущий старт `iskra.service` как ожидаемый (после подъёма руками) |

Состояние, кроме самого каталога: `kvota-kursory.txt` (курсоры журнала квоты Codex), `grp-<ключ>` (групповые
тревоги), `posledniy-golos`, `ozhidaemyj-start-iskra.txt`, `moya-kvitanciya.txt`. Квитанция Искры — строка
`PODYOM_PODTVERZHDEN=` в `/opt/iskra/workspace/SOSTOYANIE-ISKRY.txt`.

Ступень «группы прав»: код 0 проверки — в журнал «группы прав: N групп сходятся с эталоном»; иной код — беда и
групповая тревога `gruppy-prav` с ключом из строки `СОСТАВ:` (тревога по смене состава, напоминание раз в 6 ч,
«снова в порядке» при уходе). Код 2 (слепота) — тоже тревога.

**gruppy-prav-watch** (окружение — только для проб; в бою переменные не заданы)

| Настройка | Умолчание кода | Смысл |
|---|---|---|
| `GRUPPY_PRAV_CONF` | `/etc/agent-registry/gruppy-prav.conf` | эталон |
| `GRUPPY_PRAV_GROUP` | `/etc/group` | дополнительные члены групп |
| `GRUPPY_PRAV_PASSWD` | `/etc/passwd` | члены по основной группе (кроме одноимённой учётки-хозяина) |
| `GRUPPY_PRAV_SYSUSERS` | `/etc/sysusers.d:/run/sysusers.d:/usr/local/lib/sysusers.d:/usr/lib/sysusers.d` | каталоги `*.conf` sysusers, через «:» |

Эталон `gruppy-prav.conf` — строка на группу, `#` — примечание:

- `<группа> sysusers` — члены = строки `m <учётка> <группа>` в `sysusers.d`; группа обязана быть там объявлена (`g`
  или `m`), иначе слепота;
- `<группа> spisok a b c` — явный список (у группы нет объявления в sysusers; строку `m` туда не дописывают:
  `systemd-sysusers` при загрузке создаёт недостающую учётку);
- `<группа> spisok -` — членов быть не должно.

Строка не по форме, пустой эталон или повтор группы (слепота с номерами обеих строк) — слепота. Хозяин группы (одноимённая
учётка) не считается лишним ни по основной группе, ни среди дополнительных членов. В бою: `limity-vhod sysusers`, `agent-button spisok` (8 учёток, довод
на каждую — в примечаниях файла), `claudeoauth spisok -`. Состав группы меняют правкой строки эталона (рука монтажа),
иначе тревога. Вывод: строки `ok <группа>: …`, `ЛИШНИЙ <учётка> в <группа> (…)`, `НЕДОСТАЁТ <учётка> в <группа> (…)`,
`СЛЕПОТА: …`; последняя строка — `СОСТАВ: <ключи>` (пусто — чисто).

**dsh-alert, claudeclaw-alert**

| Настройка | Умолчание | Смысл |
|---|---|---|
| довод 1 | обязателен | текст тревоги |
| `/etc/dsh-alert.token`, `/etc/vladelec/telegram-id` | — / обязательная настройка через vladelec-tg-id | токен бота @arg_dsh_alert_bot и общий владелец |
| `DSH_ALERT_BOEVOJ` | пусто | без `INVOCATION_ID` (вызов не из юнита) текст помечается «ПРОБА…»; `1` снимает пометку |
| `/etc/claudeclaw-alert.token`, `/etc/vladelec/telegram-id` | — / обязательная настройка через vladelec-tg-id | токен бота @idomik_bot и общий владелец |

**dsh-compact-watch** (окружение)

| Настройка | Умолчание | Смысл |
|---|---|---|
| `DSH_COMPACT_WATCH_KANAL` | `/usr/local/bin/dsh-alert` | канал тревог |
| `DSH_COMPACT_WATCH_KATALOG` | `/var/lib/dsh-compact-watch` | состояние: `sostoyanie.json`, `istoriya.jsonl`, `padenie.json` |
| `DSH_COMPACT_WATCH_PRIBOR` | `/usr/local/sbin/kontekst-zamer` | прибор занятости (зовётся с `--mashinno`) |
| `DSH_COMPACT_WATCH_RAZMESCHENIE` | `/etc/memory-compaction/deployment.json` | файл, где стережётся `promptSubstitutions.roleClarification` |
| `DSH_COMPACT_WATCH_MOLCHAT` | `zapolnenie,szhatie-platformy` | о каких видах событий молчать в канале (в журнал пишет всё); пусто — говорит всё |
| `DSH_COMPACT_WATCH_OTBROS_SNYATO_S` | `21600` | сколько секунд без отброса инструментов до «✅ снято» |
| `AGENTS_REGISTRY` | `/etc/agent-registry/agents.yaml` | реестр агентов: службы, шлюзы, имена |
| `KONTEKST_REESTR_PRIBOR` | `/usr/local/bin/agent-registry` | модуль чтения порогов D |
| `KOMPAKT_NASTROJKI_KATALOG` | не задан | каталог настроек компакта для чтения порога D |

Зашито в код: пороги 85 и 90 % от порога сжатия, остывание 3600 с, серия обрывов — 5 событий за 30 минут.
Отметка остывания и флаг порога ставятся только после доставки в канал: тревога, не дошедшая до канала, повторится
следующим тактом. Подавление журнала journald ищется по наблюдаемым службам реестра, а не по зашитому списку.

**aclaude-snaruzhi-watch** (довод `sh1` или `sh2`; файл `SNARUZHI_KONF`, по умолчанию `/etc/aclaude-snaruzhi/conf`, читается как bash)

| Ключ файла | Умолчание | Смысл |
|---|---|---|
| `PUTI` | `10.240.49.1:38888 192.168.99.4:38888` | адреса sshd aclaude (LAN и awg9) |
| `POLZOVATEL` | пусто | учётка `proba-snaruzhi` на aclaude; пусто — `sh2` не идёт, код 4 |
| `KLYUCH`, `ZNAKOMYE` | `/etc/aclaude-snaruzhi/id_ed25519`, `…/known_hosts` | ключ входа и известные хосты |
| `KARTA` | `claudeclaw:3100 … veniamin:3109` | инстансы и порты вебхук-серверов |
| `STOROZHA` | `mesto-aclaude-watch.timer claudeclaw-stuck-watch.timer` | внутренние сторожа aclaude |
| `SVEZHEST_MIN`, `VOZRAST_MIN_S`, `DISK_KRIT` | `15`, `120`, `97` | свежесть сторожей (мин), минимальный возраст процесса (с), критическая занятость диска (%) |
| `SH1_PROMAHOV`, `SH2_KRASNYH`, `ZELENYH_OTBOJ`, `POVTOR_S` | `3`, `2`, `2`, `3600` | сколько промахов или красных подряд до тревоги, зелёных до отбоя, повтор |
| `TCP_TAJMAUT`, `SSH_TAJMAUT` | `5`, `20` | таймауты, с |
| `SOST` | `/var/lib/aclaude-snaruzhi` | состояние |
| `ALERT_IDOMIK`, `ALERT_ZAPAS` | `/usr/local/bin/claudeclaw-alert`, `/usr/local/bin/agent-alert` | основной и запасной каналы |
| `POPYTOK`, `PAUZY` | `3`, `5 15` | попытки основного канала и паузы между ними |
| `SSH_KOMANDA`, `ZHURNAL` | пусто, `logger -t aclaude-snaruzhi` | подмена ssh и журнала — только для стенда (при боевых путях — отказ, код 2) |

В бою в `conf` задан только `POLZOVATEL`.

**chitatel-obhoda** (окружение; в бою `/etc/default/chitatel-obhoda` задаёт `CHO_KOREN`, `CHO_ADRESAT`, `CHO_SHAPKA`; юнит
читает файл с «-», так что без файла — отказ читателя кодом 2 «СЛЕПОТА: не настроено», а не отказ systemd без причины)

| Настройка | Умолчание | Смысл |
|---|---|---|
| `CHO_KOREN` | пусто — слепота, код 2 | дом агента, через щель которого уходит письмо |
| `CHO_ADRESAT` | пусто — слепота, код 2 | адресат (родительный падеж, часть имени `dlya-<адресат>-…`) |
| `CHO_SHAPKA` | `<узел> · chitatel-obhoda (root, щель …) → координатору · НОЧНОЙ ОБХОД СТЕНДОВ` | первая строка письма |
| `CHO_SOST` | `/var/lib/chitatel-obhoda` | состояние |
| `CHO_TELL_BIN`, `CHO_JOURNALCTL`, `CHO_SYSTEMCTL` | `/usr/local/bin/tell-komu`, `journalctl`, `systemctl` | инструменты (подмена — для стенда) |
| `CHO_ISTOCHNIK`, `CHO_SEYCHAS` | пусто | только стенд: каталог ночей вместо журнала, «сейчас» |
| `A2A_PROVERENO_DO` | `5560` | проверенная длина письма; предел письма — на 560 знаков меньше |

**model-podmena-watch** (окружение): `MPW_REESTR` (`/etc/agent-registry/agents.yaml`), `MPW_KATALOG`
(`/var/lib/model-podmena-watch`), `MPW_KANAL` (`/usr/local/bin/agent-alert`), `MPW_JOURNALCTL` (`journalctl`),
`MPW_SYSTEMCTL` (`systemctl`), `MPW_DOMA` (`{}`, только стенд: учётка → дом). Остывание тревоги слепоты — 3600 с.

**sessiya-uderzhana-watch** (только окружение, доводы — отказ, код 2): `SUW_REGISTRY`
(`/etc/agent-registry/agents.yaml`), `SUW_STATE` (`/var/lib/sessiya-uderzhana-watch/state.json`), `SUW_ALERT`
(`/usr/local/bin/agent-alert`), `SUW_PREDEL_MIN` (`10`, порог удержания в минутах).

**socseti-watch** (доводы; юнит их не передаёт): `--port` (`8381`), `--key-file` (`/etc/socseti/monitor.key`, 0600
или 0640, 64 hex), `--state-dir` (`/var/lib/socseti-watch`), `--kanal` (`/usr/local/bin/agent-alert`), `--timeout`
(`5`, не больше 10 с). Остывание — сутки на причину.

**ostrov-kopiya-watch** (только окружение): `OKW_KOPIYA` (`/opt/agent-plugins-stend/ostrov-api`), `OKW_HEALTH`
(`http://192.168.99.3:4215/internal/v1/assistant/health`), `OKW_KATALOG` (`/var/lib/ostrov-kopiya-watch`), `OKW_KANAL`
(`/usr/local/bin/agent-alert`), `OKW_RELIZY` (манифесты релизов Марка через «:»,
`/opt/marc/workspace/*/deployment/manifest.json:/opt/marc/workspace/*/*/deployment/manifest.json:/opt/marc/workspace/*/deployment/candidate-*.tar:/opt/marc/workspace/*/*/deployment/candidate-*.tar`), `OKW_ARHIVY`
(`/var/backups/montazh/*/ostrov-api-{rel}-raskladka.tar.gz`), `OKW_POLKA` (`/var/backups/montazh/ostrov-api-kopiya` — куда
строка тревоги кладёт новый архив). Повтор той же беды — раз в сутки; слепоты — раз в сутки по классу (копия / health),
текст ошибки — только в теле. Слепота ушла — одна тревога «снова видит».

Tar Марка с `manifest.json` и `app/` читается без распаковки: релиз, состав и SHA256 сверяются до выдачи одной строки установщика. Негодный tar даёт отказ с путём и предметом; он не становится готовым архивом. Прежний каталог даёт прежние строки сборки/установки. Сам сторож копию не устанавливает. Зовущий — `ostrov-kopiya-watch.timer` раз в час, предел такта службы 120 секунд; состояние хранит только отметку успешной тревоги. Проверка не доказывает побайтного равенства бою: связь с vps-ru остаётся через release из health.

**pamyat-fill-watch.py** (доводы): ровно один из `--check` (отчёт без состояния и тревог), `--run` (бой),
`--failure` (крюк systemd, читает `SERVICE_RESULT`); `--registry` (`/etc/agent-registry/agents.yaml`), `--state-dir`
(`/var/lib/pamyat-fill-watch`; при `--run` допустим только он), `--days` (`14`, от 1 до 90). Канал зашит:
`/usr/local/bin/agent-alert --plain`. Напоминание о тех же находках — раз в 7 суток.

**pamyat-seam**: `SEAM_STAND` (`/usr/local/libexec/pamyat-seam/stand.mjs`) — для `run.sh`; `CEP_PLAGINY`
(`/opt/agent-plugins/node_modules`, задан в юните) — для `stand.mjs`; `SEAM_ALERT_BIN` (`/usr/local/bin/agent-alert`)
и довод «имя юнита» — для `failed-v2.sh`. Предел прогона стенда — 30 с.

**agent-button-daemon.sh**: `AGENT_BUTTON_ROOT` (`/var/lib/agent-button`), `AGENT_BUTTON_CONF`
(`/etc/agent-button/allowed.conf`, строки `имя = команда`). Запрос — ОБЫЧНЫЙ файл `pending/<имя>.cmd` с одной
жёсткой ссылкой; имя — только `A-Z a-z 0-9 . _ @ + -` (иное — отказ без чтения: строка журнала с экранированным
именем, запрос уходит в `processed/nedopustimoe-imya-…`, ответа в `done/` нет), первая строка — имя команды (читаются первые 4096 байт). Демон сначала переносит запрос (`mv`) в
закрытый `work/` (0700, пишет только root) и только там его проверяет и читает. Ответ — `done/<имя>.out` и
`done/<имя>.rc`: 0 и вывод команды — исполнено; 64 — команды нет в списке; 65 — запрос не обычный файл (символическая
ссылка, FIFO, сокет, устройство, каталог) или у файла больше одной жёсткой ссылки. При отказе текст запроса НЕ
повторяется ни в `done/`, ни в журнале — только имя запроса; текст попадает в журнал, лишь когда совпал с именем из
списка. После замены `agent-button-daemon.sh` нужен `sudo systemctl restart agent-button.service`: демон — постоянный
цикл и новый файл сам не перечитывает.

## Проверка

Записи реестра (`agent-plugins list --health` зовёт healthcheck):

- `installed_check` — отпечаток 45 боевых файлов (`sha256sum … | LC_ALL=C sort -k2 | sha256sum | cut -c1-16`) обязан
  быть равен `version` записи `dsh-storozha-sadik`.
- `healthcheck` — `systemctl is-active sadik-watch.timer dsh-compact-watch.timer chitatel-obhoda.timer`, ждём три
  `active`.

Руками: `sha256sum` каждого файла пакета равен боевому, `stat -c '%a %U:%G'` равен таблице выше;
`systemctl list-timers 'aclaude-snaruzhi-*' sadik-watch.timer dsh-compact-watch.timer chitatel-obhoda.timer`.

Стенды лежат в пакете `dsh-obhod-stendov`, на машине — `/opt/iskra/workspace/dorabotki/stendy/`. У всех один
договор: 0 — все пробы прошли, 1 — расхождение, 2 — слепота (стенд проверить не смог). Без довода стенд берёт
БОЕВОЙ файл, путь кандидата подают первым доводом (или переменной, названной в шапке стенда). Канал тревог, журнал и
состояние в стендах подменены.

| Стенд | Предмет | Где гоняется |
|---|---|---|
| `stend-compact-watch.sh` | dsh-compact-watch: журнал байтами, заведение заново, обрывы и др. | ночной обход |
| `stend-nemoty-posle-szhatiya.py` | dsh-compact-watch: немота после сжатия | ночной обход |
| `stend-otbros-shlyuza.py` | dsh-compact-watch: отброс инструментов шлюзом | ночной обход |
| `stend-doli-preseta.sh` | доля и порог D у kontekst-zamer и dsh-compact-watch | ночной обход |
| `stend-pravki-mimo.sh` | sadik-watch, ветка «реестр правлен мимо pravka» | ночной обход |
| `stend-sadik-watch-voice-root.sh` | sadik-watch, root-каталог голоса в `/var/tmp` (root) | ночной обход |
| `stend-sadik-watch-zastryal.sh` | sadik-watch, сторож застрял в activating (root, `systemd-run`) | ночной обход |
| `stend-sadik-watch-bez-sredy.sh` | sadik-watch без среды юнита — отказ 2 | недельный обход |
| `stend-storozha-nad-storozhami.sh` | sadik-watch, «сторож над сторожами» (~10 мин) | недельный обход |
| `stend-model-podmena.sh` | model-podmena-watch, 13 проб (`MPW_PREDMET`) | ночной обход |
| `stend-aclaude-snaruzhi.sh` | aclaude-snaruzhi-watch: sh1/sh2, каналы, отказ на довод | ночной обход |
| `stend-chitatelya-obhoda.py` | chitatel-obhoda: разбор ночей, счёт «подряд», правило писем | ночной обход |
| `test/stend-ostrov-kopiya-watch.py` (в этом пакете) | ostrov-kopiya-watch, 17 проб: исправное, разошлось, повтор, снятие, слепота по классу, «снова видит», отказ канала, полка, кавычки | ночной обход (из дерева, без root) |

Исключение — стенд `gruppy-prav-watch`: он лежит в самом пакете, `test/stend-gruppy-prav.sh`, и ночной обход берёт
его из дерева (`/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/`, без root). Без доводов он судит
СОСЕДНИЕ файлы дерева `../libexec/gruppy-prav-watch` и `../etc/gruppy-prav.conf`, а не боевые; бой проверяют доводами
`<проверка> <эталон>`. Живые `/etc/group`, `/etc/passwd`, `/etc/sysusers.d` он не трогает: работает на их копиях.
10 проб: исправное 0 · лишний в sysusers-группе 1 · гость с основной группой 1 · штатный выпал 1 · лишний в списочной
1 · объявление пропало 2 (слепота) · возврат 0 · хозяин дополнительным членом своей группы 0 · повтор группы в эталоне 2 ·
умолчание каталогов sysusers включает `/run` и `/usr/local/lib`. Коды стенда: 0 — все ожидания сошлись, 1 — расхождение, 2 — стенд не
собран: нет проверки или эталона, либо на машине нет того, по чему бьют порчи. Стенд только для sadik: ему нужны группы
`limity-vhod`, `agent-button`, `claudeoauth`, учётки `varvara` и `limity-ds` (первым членом `limity-vhod`) и объявление
`dsh-limity.conf` в `/etc/sysusers.d`. На машине без них он выходит кодом 2 и перечисляет, чего нет, а не краснеет
семью ложными расхождениями.

Живой прогон проверки групп (только чтение): `sudo /usr/bin/python3 -ISB /usr/local/libexec/gruppy-prav-watch`.

Ещё шесть стендов 1.0.10 в `test/` пакета: `stend-polnoty-maski.sh` (полнота перечня в `sadik-watch`: замаскированный таймер и служба «-» без маски, под root), `stend-nemota-obertki.sh` (проба песочницы гостя в `sadik-watch`, под root),
`stend-dsh-alert.sh` (под root), `stend-claudeclaw-alert.sh` (под root), `stend-porogov-kanal.py` (порог `dsh-compact-watch`
и доставка), `stend-byudzhet-trevog.py` (бюджет тревог `sessiya-uderzhana-watch`). Обходы их пока не зовут.

Стенд кнопки — `test/stend-knopki.sh` (с 1.0.10), тоже в самом пакете: подставной `AGENT_BUTTON_ROOT` и список во
временном каталоге, боевой демон и `/var/lib/agent-button` не трогаются; гоняется от учётки или под `sudo` (тогда метка
— в файле root 0600, как в бою); без довода судит соседний
`../sbin/agent-button-daemon.sh`. 6 проб: исправное исполнено · символическая ссылка на чужой файл — 65, текста нет ·
жёсткая ссылка — 65 · FIFO не вешает кнопку, соседний запрос исполнен · текст непринятого запроса не повторяется ·
перевод строки в имени запроса не подделывает строку журнала.
Коды стенда: 0, 1 — расхождение, 2 — не собран. Ночной и недельный обход его пока не зовут: в перечне стендов его нет.

Стендов нет у `sessiya-uderzhana-watch`, `socseti-watch`, `pamyat-fill-watch.py` (у него есть режим `--check`: только
чтение, код 1, если есть находки), `dsh-alert`, `claudeclaw-alert`. Сам `pamyat-seam` и
есть стенд: 0 — цепь прошла, 1 — расхождение, 2 — проверять нечем или вышло время.

Пробный прогон `sadik-watch` без боевого состояния и канала (из шапки скрипта, под root):

```bash
sudo SADIK_WATCH_MESTNO=1 SADIK_WATCH_SOST=/tmp/proba-sost SADIK_ALERT_BIN=/bin/true SADIK_VLADELEC_WATCH_BIN=/bin/true /usr/local/sbin/sadik-watch
```

Коды выхода: `sadik-watch` — 0 такт прошёл (беды — в журнале и канале), 2 срез не получен или пуст, нет среды
юнита или нет ни `SADIK_WATCH_SOST`, ни `HOME`; `--podtverdit` — 1, если старт не снят. `dsh-compact-watch` — 0, 1 (не доставлено или такт упал), 2 (слепота).
`aclaude-snaruzhi-watch` — 0 прогон состоялся (красное aclaude — не ошибка прибора), 2 довод или подмена ssh при
боевых путях, 3 тревога не доставлена, 4 нет учётки или ключа. `chitatel-obhoda` — 0, 1 канал отказал, 2 слепота.
`sessiya-uderzhana-watch` — 0, 1 тревога не ушла, 2 слепота. `socseti-watch` — 0 ready, 10 telegram halted (юнит
считает успехом), 2 слепота, 3 тревога не подтверждена или не записано состояние. `pamyat-fill-watch.py --run` — 0
или 2. `dsh-alert`, `claudeclaw-alert` — 0 доставлено, 1 нет. `gruppy-prav-watch` — 0 всё сходится, 1 находки
(перечень строками), 2 слепота (эталон или файл не прочитан, строка эталона не по форме, группы нет, у группы
«sysusers», а объявления нет); слепота — не «чисто».

Журналы: `journalctl -u <служба>`; итог отправки `dsh-alert` — строка `SENT …` под тегом `dsh-alert`; отказы
`claudeclaw-alert` — под своим тегом; `aclaude-snaruzhi-watch` пишет под тегом `aclaude-snaruzhi`.

## Ограничения

- `sadik-watch` живёт на наблюдаемой машине: если sadik лёг, сторож молчит вместе с ним. Проба «машина недоступна»
  в местном режиме не ведётся, и он пишет об этом каждый такт. Собственную смерть он показывает только отсутствием
  голоса «жив» (до 7 суток тишины). Сам себя в перечне суточных он не проверяет (`!sadik-watch.service`).
- `sadik-watch` смотрит «процесс есть» по свежести журнала, а не «работа идёт». Память он меряет ростом числа записей
  без оценки их смысла, место — только на `/`. Застрявшего сторожа видит не раньше его срока от входа в activating
  (суточный — до ~52 ч). Не видит таймеры вне `/etc/systemd/system` и службы без таймера. Маску не судит: замаскированный таймер — решение человека; размаскированный без строки перечня снова краснеет. В код зашиты адрес vps-ru
  `46.19.64.6`, интерфейс `awg9`, таблица 225 и метка `0xa2c9` (принятая сумма обёртки `bwrap-bez-zhurnala` берётся из
  реестра и метки выпуска, см. «Настройку»); квитанция подъёма
  ведётся только для `iskra.service`.
- Каналы. Токен `dsh-alert` (0640 root:agent-switch) читает только root, поэтому вызов от учётки агента скажет «нет
  доступа». Вызов не из юнита помечается «ПРОБА» в самом отправляемом тексте. Текст длиннее 4000 знаков обрезается
  по исходному тексту, до экранирования (с пометкой); тот же кусок уходит и запасным ходом без разметки.
  `claudeclaw-alert` разбирает ответ Telegram: причина отказа — в журнал, текст — запасным ходом без разметки; разметку
  он не экранирует (вызывающие шлют теги намеренно). Повтора у него нет.
- `dsh-compact-watch` первый прогон не шлёт тревог по истории журнала: он говорит одно «заведён заново». Шлюз, не
  записанный агенту в `zavisit_ot`, он не видит. Форму строк шлюзов старее нужной (без «модель запрошена», без
  «отброшено шлюзом») не читает. О заполнении и платформенном сжатии в канал молчит (`DSH_COMPACT_WATCH_MOLCHAT`).
- `aclaude-snaruzhi-watch` не видит раннер, зависший на модели при живом вебхук-сервере; отвал Telegram у бота;
  конец подписки Claude; рост диска ниже `DISK_KRIT`. «Вебхук-сервер отвечает» не значит «агент жив».
- `chitatel-obhoda` не читает ручные прогоны обхода и недельный обход и не судит, кто прав, стенд или предмет.
  После смены `OnCalendar` обхода счёт «подряд» начнётся заново.
- `model-podmena-watch` не видит подмену, о которой шлюз не знает (Codex без `model/rerouted`), и путь DeepSeek.
  Псевдоним модели вместо полного имени даст ложную тревогу.
- `sessiya-uderzhana-watch` ловит только удержание незавершённым `/new`. После отправленной тревоги повтора нет:
  дальше удержание видно только в журнале юнита. На все тревоги такта — общий бюджет 100 с: на что не хватило,
  «не ушло» и уйдёт следующим прогоном.
- `socseti-watch` знает лишь то, что отдаёт статус `socseti`. Тревога по одной причине — не чаще раза в сутки.
- `ostrov-kopiya-watch` связывает копию с сайтом только номером релиза: что архив побайтно тот, что на сайте, сверяет
  установщик по манифесту. Не видит отставания внутри часа; откат сайта назад — тоже «разошлось», и строка поставит
  старый релиз (читать глазами). Каталог релиза ищет на двух уровнях `/opt/marc/workspace`; глубже — «не найден».
- `pamyat-fill-watch.py` не оценивает качество записей. Пока кэш истории не набрал 14 суток, завершения секретаря
  он называет «не измерено», а не бедой.
- `pamyat-seam` подаёт событие компакта руками: что живая платформа испустит его в такой форме, он не доказывает.
- `gruppy-prav-watch` не видит членство через NSS вне `/etc/group` и `/etc/passwd` (LDAP/sssd — на sadik их нет);
  членство, выданное юнитом (`SupplementaryGroups=`, так юнит `sajt-chat` получает группу `agent-button`), — его в `/etc/group`
  нет; права, выданные мимо групп (ACL `u:<учётка>`, владение файлом, sudoers); группы вне эталона; вход и выход
  между двумя тактами (10 мин). Верность самого эталона он не судит: список `spisok` пишет человек.
- `agent-button-daemon.sh`: кто может писать в `pending/` (группа `agent-button`), тот запустит ЛЮБУЮ команду из
  списка. Гостевых агентов в группу не добавлять. Команды списка исполняются от root как есть (`bash -c`).
  🔴 Посылка: `/proc/sys/fs/protected_hardlinks` = 1 обязателен (на sadik 1, замер 10.10.2026). Демон отказывает по
  счёту ссылок (больше одной — код 65), но счёт ловит не всё: без этой настройки учётка может сделать жёсткую ссылку
  на чужой файл, которым не владеет, и, если его исходное имя лежит в каталоге, где ей можно удалять, убрать это имя —
  ссылка останется одна, и демон примет файл как запрос. Настройка ядра запрещает создать такую ссылку вовсе. Подмену записи между переносом в `work/` и чтением закрывает закрытый
  `work/`, а не стенд.
- Пакет публикуется только исходниками, без npm: файлы привязаны к sadik (имена агентов, адреса, боты, пути) и как есть
  на другой машине не работают.

## B-N-2023: единая настройка владельца

`/usr/local/bin/vladelec-tg-id` читает `/etc/vladelec/telegram-id`: файл root:root 0644, каталог root:root 0755, ровно одна строка из 5..15 ASCII-цифр. Нет файла, ссылка файла/каталога, неверные владелец/права или формат — stderr с причиной и код 2, без ID по умолчанию. Доводы не принимаются; VLADELEC_TG_ID_FILE — только путь стенда. Принятый reader aclaude проверяет метаданные до чтения; stat/awk/head — отдельные шаги, подмена между ними требует root.

Файлы пакета: `bin/vladelec-tg-id` → `/usr/local/bin/vladelec-tg-id` (0755 root:root), `etc/vladelec/telegram-id.example` — пример, НЕ монтируется как настройка, `libexec/vladelec-tg-id-watch` → `/usr/local/libexec/vladelec-tg-id-watch` (0755 root:root). Боевого ID в пакете нет. Настройку `/etc/vladelec/telegram-id` root:root 0644 кладёт рука монтажа отдельно.

`dsh-alert` и `claudeclaw-alert` читают общий ID до токена/сети: нет владельца → отказ 2. Старая настройка .chat больше не используется этими двумя потребителями. Местный `sadik-watch` раз в 10 минут зовёт независимый helper: отказ reader → письмо Забаве через `tell-komu` от учётки Искры, её существующая щель A2A. Telegram и файл владельца для самой доставки письма не нужны. Сроки — 3 с reader, 5 с письмо плюс 1 с до kill; состояние причины/попытки сохраняется атомарно в `/var/lib/sadik-watch/vladelec-tg-id.json`: та же причина не чаще 6 часов, смена причины сразу, одно письмо «восстановлено». Неудачная укладка тоже ограничена 6 часами; состояние попытки пишется до курьера. Другой одновременный такт не ждёт lock, выходит 2. Повреждённый JSON сохраняется одним `.invalid`, reader всё равно вызывается, новое состояние и письмо называют восстановление. Недоступное хранилище/ошибка файловой системы дают СЛЕПОТА в журнале и код 2; это граница защиты, нужен оператор. Ошибка курьера остаётся в журнале, ложного «положено» нет.

Старые `/etc/dsh-alert.owner`, `/etc/dsh-alert.chat`, `/etc/claudeclaw-alert.chat` автором не удаляются. `/etc/agent-alert/chat-id`, agent-tell и профильные allowedUsers — отдельные настройки маршрутов. Их глобальные owner-default следует согласованно свести на этот reader, сохранив явно заданные группы/собеседников; без поручения данные/маршруты не меняются. Hardlink не годится как постоянное решение: замена canonical через mv оставляет alias на прежнем inode.

B-N-2023: manual probes must also set SADIK_VLADELEC_WATCH_BIN=/bin/true or isolate the helper/courier in a private namespace. Muting the Telegram alert alone does not mute independent A2A. The unit has no override, so the normal helper is called every local tick. An explicitly empty override refuses before state writes.

Пакетные проверки B-N-2023: `test/stend-b2023-reader.py`, `stend-b2023-consumers.py`, `stend-b2023-watch.py`, `stend-b2023-watch-state.py`. Нужен sudo для root-файлов и приватного mount namespace; неизвестная среда — код 2. Боевые настройки, Telegram и доставка в настоящую щель в пробах не используются. `VLADELEC_WATCH_STATE_DIR` — каталог состояния только стенда; юнит использует `/var/lib/sadik-watch`.
