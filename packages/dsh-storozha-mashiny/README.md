# dsh-storozha-mashiny — сторожа и приборы машины, на которой работают несколько ИИ-агентов

Версия · Version: 3.1.3

*English version — [below](#english).*

Текущая версия — см. `package.json` и `CHANGELOG.md`.

## Назначение

Пакет — 16 независимых исполняемых файлов (bash и python3), общий читатель настроек `lib/nastrojka` и юниты systemd к
двенадцати модулям. Каждый сторож проверяет одну вещь, которая ломается молча, и зовёт человека. Молчание сторожа
значит «проверено и чисто». Если проверить не удалось, это отдельный громкий исход (обычно код 2), а не тишина. Чинят
сами только `dkms-kernel-coverage-check.sh` (ставит заголовки ядра и собирает модуль) и `yadro-predohranitel`
(откатывает загрузку в рабочее ядро).

Пакет написан обобщённо: всё, что зависит от машины, вынесено в настройки. На боевой машине эти значения задают drop-in'ы
`50-mashina.conf`, файлы `/etc/default/*` и общий файл `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf`.

| Модуль | Что сторожит или делает | Кто зовёт на боевой машине | Кому говорит |
|---|---|---|---|
| `agent-watchdog.sh` | службы и таймеры из списка, свежесть разовых служб (`юнит:часы`), живость памяти по URL, место на дисках | `agent-watchdog.timer`, каждые 5 мин | `agent-alert` |
| `apt-updates-notify.sh` | сколько обновлений apt ждёт и сколько из них по безопасности; не протухли ли списки. Ничего не ставит | `apt-updates-notify.timer`, 07:35 UTC | `agent-alert`; раз в 7 суток «жив» |
| `dkms-kernel-coverage-check.sh` | DKMS-модуль собран для КАЖДОГО установленного ядра; если нет — собирает сам | `dkms-kernel-coverage.timer`, раз в сутки и через 5 мин после загрузки | `agent-alert`, запасной — `claudeclaw-alert` |
| `yadro-predohranitel` | первая загрузка нового ядра: модуль `amneziawg` и сеть до `YP_TARGET_IP`; нет за 10 мин — перезагрузка в `saved_entry` GRUB | `yadro-predohranitel.service` при загрузке, только если взведена метка | журнал юнита |
| `inet6-poyavlenie-watch` | появился ли глобальный IPv6 (тогда защита v4-first больше не гарантирована) | `inet6-poyavlenie-watch.timer`, каждые 30 мин | `agent-alert` (нет его — `claudeclaw-alert`) |
| `hvosty-vartmp-watch` | брошенные записи верхнего уровня `/var/tmp` старше 72 ч, кроме перечня долгожителей. Только отчёт | `hvosty-vartmp-watch.timer`, 05:17 | `agent-alert` |
| `dve-kopii-watch` | код 9 общих пакетов платформы в дереве плагинов и в app каждого агента — не разошёлся ли | `dve-kopii-watch.timer`, 06:47 | `agent-alert` |
| `podyom-mimo-vorot-watch` | служба агента поднята не через `podyom-uzla` (по прибору `kto-podnimal`) | `podyom-mimo-vorot-watch.timer`, каждые 15 мин | `agent-alert`; итог в `last.json` для healthcheck |
| `dsh-upstream-watch.sh` | новая версия `@deepseek-ai/dsh` в npm: rc и стабильная — тревога, альфа — молча (с признаком безопасности — с оговоркой) | `dsh-upstream-watch.timer`, 03:00 UTC | `agent-alert` |
| `predel-dliny-watch` | отказ поставщика по длине промпта в журнале шлюза агента | `predel-dliny-watch.timer` (Искра, каждые 30 мин) и `predel-dliny-watch@<агент>.timer` (каждые 15 мин) | `agent-alert` и письмо в ящик агента |
| `zadaniya-prervany-watch` | задания прерванных дистилляций `zadanie-prervan-*` старше часа | `zadaniya-prervany-watch.timer`, раз в час в :23 | письмо координатору через `tell-komu` |
| `storozh-dvizhkov.sh` | ход агента пережил свою платформу: движок `claude` под шлюзом, рождённый до старта текущей платформы (или платформа не работает, или цепочка родителей не доходит до шлюза), держится дольше 5 мин. Если служба платформы не юнит — прежнее правило «ходов больше одного» | `storozh-dvizhkov@<агент>.timer`, каждые 2 мин | `agent-alert` |
| `kontekst-zamer` | прибор: заполненность окна контекста агентов DSH и номинальный порог сжатия | `dsh-compact-watch` (пакет dsh-storozha-sadik) с `--mashinno`; healthcheck реестра; люди | stdout |
| `agent-limits` | утилита: пределы и политики агентов из `/etc/ai-agent-limits`, проверка формы файлов. Только читает | руками и скриптами; стенд в ночном обходе | stdout |
| `python-padenie-70` | запускатель Python-сторожа: падение скрипта даёт код 70, а не «успех» при `SuccessExitStatus=1` | `ExecStart=` в drop-in'ах `60-python-padenie-70.conf` | — |
| `bash-padenie-70` | то же для bash: `set -u`, синтаксис, `bad substitution` дают код 70 | `ExecStart=` в drop-in'ах `60-bash-padenie-70.conf` | — |

Включённые экземпляры на боевой машине: `predel-dliny-watch@<агент>` — у семи агентов (четыре кодера и ещё
три агента); `storozh-dvizhkov@<агент>` — у пяти агентов с Claude-шлюзом, в том числе главного и гостя. Падение
любого сторожа с таймером видит `sadik-watch` (пакет dsh-storozha-sadik) по перечню `/etc/agent-registry/storozha-sutochnye.txt`: там все службы пакета с таймером.
Запускатели `*-padenie-70` зовут и юниты других пакетов (a2a-pochtalon, codex-auth-watch, registry-watchdog,
vse-stendy-boevye и др.).

## Что ставится и куда

Состав пакета для монтажа — 47 мест: 16 файлов `bin/`, `lib/nastrojka` и 30 файлов `systemd/` (25 юнитов и 5 drop-in'ов). Поимённый состав — в таблице ниже. Учёт ведётся одной записью `dsh-storozha-mashiny` в `/etc/agent-registry/plugins.yaml` (раздел `services`), `derevo.files`; `ref` указывает метку пакета. Режимы и владельцы в таблице — контракт монтажа, а не новый замер боевой машины. Исторический замер на 09.10.2026 охватывал 45 файлов дерева: все их суммы совпали с боевыми. Записи `apt-updates-notify`, `kontekst-zamer`, `podyom-mimo-vorot-watch` оставлены ради healthcheck; файлы ведёт пакетная запись (`uchteno_v: dsh-storozha-mashiny`). В бою файлы лежат копиями, а не ссылками в каталог пакета.

| Файл в пакете | Путь на машине | Режим, владелец | Кто исполняет / читает |
|---|---|---|---|
| `bin/agent-watchdog.sh` | `/usr/local/sbin/agent-watchdog.sh` | 0755 root:root | `agent-watchdog.service` |
| `bin/apt-updates-notify.sh` | `/usr/local/sbin/apt-updates-notify.sh` | 0755 root:root | `apt-updates-notify.service` (на боевой машине drop-in: `DynamicUser=yes`, `User=apt-updates-notify`) |
| `bin/dkms-kernel-coverage-check.sh` | `/usr/local/sbin/dkms-kernel-coverage-check.sh` | 0755 root:root | `dkms-kernel-coverage.service` |
| `bin/dsh-upstream-watch.sh` | `/usr/local/sbin/dsh-upstream-watch.sh` | 0755 root:root | `dsh-upstream-watch.service` через `bash-padenie-70` |
| `bin/dve-kopii-watch` | `/usr/local/sbin/dve-kopii-watch` | 0755 root:root | `dve-kopii-watch.service` через `python-padenie-70` |
| `bin/hvosty-vartmp-watch` | `/usr/local/sbin/hvosty-vartmp-watch` | 0755 root:root | `hvosty-vartmp-watch.service` через `python-padenie-70` |
| `bin/kontekst-zamer` | `/usr/local/sbin/kontekst-zamer` | 0755 root:root | dsh-compact-watch, healthcheck записи `kontekst-zamer`, люди |
| `bin/podyom-mimo-vorot-watch` | `/usr/local/sbin/podyom-mimo-vorot-watch` | 0755 root:root | `podyom-mimo-vorot-watch.service` через `bash-padenie-70` |
| `bin/yadro-predohranitel` | `/usr/local/sbin/yadro-predohranitel` | 0755 root:root | `yadro-predohranitel.service` |
| `bin/zadaniya-prervany-watch` | `/usr/local/sbin/zadaniya-prervany-watch` | 0755 root:root | `zadaniya-prervany-watch.service` (root) |
| `bin/agent-limits` | `/usr/local/bin/agent-limits` | 0755 root:root | руками, скрипты |
| `bin/bash-padenie-70` | `/usr/local/bin/bash-padenie-70` | 0755 root:root | drop-in'ы `60-bash-padenie-70.conf` |
| `bin/inet6-poyavlenie-watch` | `/usr/local/bin/inet6-poyavlenie-watch` | 0755 root:root | `inet6-poyavlenie-watch.service` |
| `bin/predel-dliny-watch` | `/usr/local/bin/predel-dliny-watch` | 0755 root:root | `predel-dliny-watch.service`, `predel-dliny-watch@.service` |
| `bin/python-padenie-70` | `/usr/local/bin/python-padenie-70` | 0755 root:root | drop-in'ы `60-python-padenie-70.conf` |
| `bin/storozh-dvizhkov.sh` | `/usr/local/bin/storozh-dvizhkov.sh` | 0755 root:root | `storozh-dvizhkov@.service` |
| `lib/nastrojka` | `/usr/local/lib/dsh-storozha-mashiny/lib/nastrojka` | 0755 root:root | agent-limits, kontekst-zamer, storozh-dvizhkov.sh (запасной путь: в бою они лежат копиями, не рядом с `lib/`) |
| `systemd/agent-watchdog.service` | `/etc/systemd/system/agent-watchdog.service` | 0644 root:root | systemd; drop-in машины `50-mashina.conf` |
| `systemd/agent-watchdog.service.d/10-locale.conf` | `/etc/systemd/system/agent-watchdog.service.d/10-locale.conf` | 0644 root:root | systemd (`LC_ALL=C.UTF-8`) |
| `systemd/agent-watchdog.timer` | `/etc/systemd/system/agent-watchdog.timer` | 0644 root:root | systemd, включён |
| `systemd/agent-watchdog.timer.d/10-calendar.conf` | `/etc/systemd/system/agent-watchdog.timer.d/10-calendar.conf` | 0644 root:root | systemd (`OnCalendar=*:0/5` — страховка от зависшего таймера) |
| `systemd/apt-updates-notify.service` | `/etc/systemd/system/apt-updates-notify.service` | 0644 root:root | systemd |
| `systemd/apt-updates-notify.timer` | `/etc/systemd/system/apt-updates-notify.timer` | 0644 root:root | systemd, включён |
| `systemd/dkms-kernel-coverage.service` | `/etc/systemd/system/dkms-kernel-coverage.service` | 0644 root:root | systemd |
| `systemd/dkms-kernel-coverage.timer` | `/etc/systemd/system/dkms-kernel-coverage.timer` | 0644 root:root | systemd, включён |
| `systemd/dsh-upstream-watch.service` | `/etc/systemd/system/dsh-upstream-watch.service` | 0644 root:root | systemd |
| `systemd/dsh-upstream-watch.timer` | `/etc/systemd/system/dsh-upstream-watch.timer` | 0644 root:root | systemd, включён |
| `systemd/dve-kopii-watch.service` | `/etc/systemd/system/dve-kopii-watch.service` | 0644 root:root | systemd |
| `systemd/dve-kopii-watch.service.d/70-predely.conf` | `/etc/systemd/system/dve-kopii-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/dve-kopii-watch.timer` | `/etc/systemd/system/dve-kopii-watch.timer` | 0644 root:root | systemd, включён |
| `systemd/hvosty-vartmp-watch.service` | `/etc/systemd/system/hvosty-vartmp-watch.service` | 0644 root:root | systemd |
| `systemd/hvosty-vartmp-watch.timer` | `/etc/systemd/system/hvosty-vartmp-watch.timer` | 0644 root:root | systemd, включён |
| `systemd/inet6-poyavlenie-watch.service` | `/etc/systemd/system/inet6-poyavlenie-watch.service` | 0644 root:root | systemd |
| `systemd/inet6-poyavlenie-watch.timer` | `/etc/systemd/system/inet6-poyavlenie-watch.timer` | 0644 root:root | systemd, включён |
| `systemd/podyom-mimo-vorot-watch.service` | `/etc/systemd/system/podyom-mimo-vorot-watch.service` | 0644 root:root | systemd |
| `systemd/podyom-mimo-vorot-watch.timer` | `/etc/systemd/system/podyom-mimo-vorot-watch.timer` | 0644 root:root | systemd, включён |
| `systemd/predel-dliny-watch.service` | `/etc/systemd/system/predel-dliny-watch.service` | 0644 root:root | systemd (экземпляр Искры) |
| `systemd/predel-dliny-watch.timer` | `/etc/systemd/system/predel-dliny-watch.timer` | 0644 root:root | systemd, включён |
| `systemd/predel-dliny-watch@.service` | `/etc/systemd/system/predel-dliny-watch@.service` | 0644 root:root | systemd, шаблон на агента |
| `systemd/predel-dliny-watch@.timer` | `/etc/systemd/system/predel-dliny-watch@.timer` | 0644 root:root | systemd, 7 включённых экземпляров |
| `systemd/storozh-dvizhkov@.service` | `/etc/systemd/system/storozh-dvizhkov@.service` | 0644 root:root | systemd, шаблон на агента |
| `systemd/storozh-dvizhkov@.timer` | `/etc/systemd/system/storozh-dvizhkov@.timer` | 0644 root:root | systemd, 5 включённых экземпляров |
| `systemd/yadro-predohranitel.service` | `/etc/systemd/system/yadro-predohranitel.service` | 0644 root:root | systemd, включена; `ConditionPathExists=/var/lib/yadro-predohranitel/armed` |
| `systemd/zadaniya-prervany-watch.service` | `/etc/systemd/system/zadaniya-prervany-watch.service` | 0644 root:root | systemd |
| `systemd/zadaniya-prervany-watch.service.d/50-rezhim-sostoyaniya.conf` | `/etc/systemd/system/zadaniya-prervany-watch.service.d/50-rezhim-sostoyaniya.conf` | 0644 root:root | systemd (`StateDirectoryMode=0750`) |
| `systemd/zadaniya-prervany-watch.service.d/70-predely.conf` | `/etc/systemd/system/zadaniya-prervany-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/zadaniya-prervany-watch.timer` | `/etc/systemd/system/zadaniya-prervany-watch.timer` | 0644 root:root | systemd, включён |

В бой не ставятся: `test/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` (в записи реестра —
`not_installed`).

Юниты в бою равны юнитам дерева побайтно. Всё машинное — в drop-in'ах машины поверх них: например,
`apt-updates-notify.service` в дереве идёт от `User=nobody`, `Group=nogroup`, а на боевой машине drop-in `50-mashina.conf`
задаёт `DynamicUser=yes`, `User=apt-updates-notify`; `UNIT=coder-gateway@%i.service` для `predel-dliny-watch@` задаёт
drop-in `50-mashina.conf` шаблона.

Машинные файлы — не часть пакета, но пакет их читает:

- drop-in'ы `50-mashina.conf` у `agent-watchdog`, `apt-updates-notify`, `dkms-kernel-coverage`, `dsh-upstream-watch`,
  `dve-kopii-watch`, `hvosty-vartmp-watch`, `inet6-poyavlenie-watch`, `podyom-mimo-vorot-watch`,
  `predel-dliny-watch`, `predel-dliny-watch@`, `storozh-dvizhkov@`, `zadaniya-prervany-watch`; `cel.conf` у
  `yadro-predohranitel`; `unit-shlyuza.conf` у пяти экземпляров `predel-dliny-watch@<агент>`;
  свой drop-in у экземпляра `storozh-dvizhkov@<агент>` гостя (`SD_SHLYUZ` гостевого шлюза); `60-*-padenie-70.conf`;
- `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` (для `lib/nastrojka`), `/etc/agent-watchdog/watchdog.conf`,
  `/etc/default/predel-dliny-watch`, `/etc/default/zadaniya-prervany-watch`, `/etc/default/dsh-upstream-watch`,
  `/etc/agent-registry/vartmp-dolgozhiteli.txt`.

## Требования

Для выбранных модулей нужны systemd, Bash, Python 3 с `yaml` (PyYAML), утилиты coreutils/procps (`ps`, `pgrep`), `ip`, `dpkg-query` и `dkms`. `agent-watchdog.sh` и `dsh-upstream-watch.sh` используют `jq` и `curl`; `zadaniya-prervany-watch` — `jq`, Python 3 с `yaml` и `timeout`; `dsh-upstream-watch.sh` — также `npm` и `node`.

| Модуль | Команда / модуль | Пакет-поставщик |
|---|---|---|
| сторожа с тревогами владельцу | `agent-alert` | `dsh-trevogi` |
| `kontekst-zamer`, `stend-doli-preseta.sh`, `zadaniya-prervany-watch` | `agent-registry` | `a2a-bus` |
| `podyom-mimo-vorot-watch` | `podyom-uzla` | `dsh-podyom` |
| `podyom-mimo-vorot-watch` | `kto-podnimal` | `dsh-pribory` |
| `zadaniya-prervany-watch` | `tell-komu` | `dsh-pochta` |
| `dve-kopii-watch --avto-montazh` | `montazh-okno` | `dsh-montazh` |

## Установка

У нас пакет ставят пофайлово, через ворота: правка в дереве `/opt/<главный агент>/workspace/dsh-plugins` получает новый номер
(`package.json` и `CHANGELOG.md`), проходит ворота и монтируется `smontirovat-fajly`. Без ключа инструмент делает
только прогон; в бой пишет лишь `--v-boj`, и только под root. Страховку он кладёт в `/var/backups/montazh/<пункт>/`,
после записи сверяет сумму, режим и владельца. Файлы называйте явно: без списка он берёт все файлы каталога
кандидата.

Исполняемые файлы раскладываются по двум каталогам (см. таблицу), поэтому вызова тоже два:

```bash
P=/opt/<главный агент>/workspace/dsh-plugins/packages/dsh-storozha-mashiny
sudo smontirovat-fajly --punkt <пункт> --progon "$P/bin" /usr/local/sbin dve-kopii-watch
sudo smontirovat-fajly --punkt <пункт> --v-boj  "$P/bin" /usr/local/sbin dve-kopii-watch
sudo smontirovat-fajly --punkt <пункт> --v-boj  "$P/bin" /usr/local/bin  predel-dliny-watch
sudo smontirovat-fajly --punkt <пункт> --v-boj  "$P"     /usr/local/lib/dsh-storozha-mashiny lib/nastrojka
```

Юниты — каталог кандидата `"$P/systemd"`, боевой `/etc/systemd/system`. Юниты дерева отличаются от боевых (см. выше):
перед монтажом юнита сравните его с `systemctl cat <юнит>` и проверьте, что drop-in машины даёт то же действующее
значение.

```bash
sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/systemd" /etc/systemd/system dve-kopii-watch.service
sudo systemctl daemon-reload
sudo systemctl enable --now <имя>.timer                    # новый таймер
sudo systemctl enable --now predel-dliny-watch@<агент>.timer storozh-dvizhkov@<агент>.timer   # новый агент
```

Новый файл, которого в бою ещё нет, инструмент примет только с `--novyj`. После монтажа:

- новый сторож с таймером — строкой в `/etc/agent-registry/storozha-sutochnye.txt` (`<служба> <срок_часов>`), иначе
  `sadik-watch` покраснеет «строки в перечне НЕТ»;
- новый агент — экземпляры `predel-dliny-watch@` и `storozh-dvizhkov@` заводятся руками, не из реестра; его ящик —
  в `PREDEL_YASHCHIKI` (`/etc/default/predel-dliny-watch`), его шлюз — в drop-in. Экземпляр таймера вписать и в
  healthcheck записи `dsh-storozha-mashiny` (там перечень таймеров явный: экземпляр вне перечня не проверяется);
- в записи `dsh-storozha-mashiny` перевести `version` (отпечаток `installed_check`) и `ref` на новую метку — через
  `agent-plugins pravka`;
- `yadro-predohranitel` взводят перед перезагрузкой в новое ядро: имя целевого ядра (как в `uname -r`) записать в
  `/var/lib/yadro-predohranitel/armed`.

## Настройка

Три вида настроек. Модули с юнитом берут значения из окружения юнита (drop-in `Environment=` или
`EnvironmentFile=`). Модули, которые зовут руками, через `sudo` и из чужих служб (`agent-limits`, `kontekst-zamer`,
`storozh-dvizhkov.sh`), читают их через `lib/nastrojka` в порядке: переменная окружения → строка `КЛЮЧ=значение` в
файле `DSH_STOROZHA_MASHINY_CONF` → умолчание. Пустая переменная считается незаданной; файл есть, но не читается —
отказ, код 2. Третий вид — собственные файлы модулей. Полный справочник — `docs/SETTINGS.md`.

| Модуль | Настройка | Умолчание | Смысл; что задано на боевой машине |
|---|---|---|---|
| lib/nastrojka | `DSH_STOROZHA_MASHINY_CONF` | `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` | файл настроек; на боевой машине в нём `AGENT_LIMITS_DIR`, `KONTEKST_ZAMER_SHABLONY`, `SD_*` |
| agent-watchdog.sh | `WATCHDOG_CONF` | `/etc/dsh-storozha-mashiny/agent-watchdog.conf` | файл настройки (bash); на боевой машине `/etc/agent-watchdog/watchdog.conf`. Нет файла — код 2 |
| | `WATCHDOG_STATE` | `/var/lib/machine-watchdog` | окна тишины; на боевой машине `/var/lib/agent-watchdog` |
| | `WATCHDOG_ALERT` | `/usr/local/bin/agent-alert` | канал тревоги |
| | ключи файла `SERVICES` | пусто | службы и таймеры через пробел; `юнит:часы` — свежесть последнего успешного запуска разовой службы |
| | `MEMORY_HEALTH_URL` | пусто — не проверять | адрес проверки живости памяти |
| | `DISK_PATHS`, `DISK_MIN_FREE_PCT` | `/`, `10` | где мерить место и ниже какого процента свободного тревожить |
| | `COOLDOWN_MIN` | `30` | окно тишины на одну беду, мин |
| apt-updates-notify.sh | `APTUN_CONF` | `/etc/apt-updates-notify/apt-updates-notify.conf` | файл настройки (bash), необязателен; на боевой машине его нет |
| | `APTUN_STATE`, `APTUN_ALERT` | `/var/lib/apt-updates-notify`, `/usr/local/bin/agent-alert` | состояние (создаёт systemd, `StateDirectory=`) и канал |
| | `STALE_DAYS`, `HEARTBEAT_DAYS` | `3`, `7` | списки старше — «протухли», код 1; молчал столько суток — сказать «жив» |
| | `CHECK_CMD`, `LIST_CMD`, `STAMP_FILE`, `RAW_LINES`, `RAW_CHARS` | `/usr/lib/update-notifier/apt-check`, `apt list --upgradable`, `/var/lib/apt/periodic/update-success-stamp`, `12`, `200` | источники и объём сырья в тексте (подмена — для стенда) |
| dkms-kernel-coverage-check.sh | `DKMS_COVERAGE_MODULE` | пусто — «НЕ НАСТРОЕНО», код 2 | имя DKMS-модуля; на боевой машине `amneziawg` |
| | `DKMS_COVERAGE_ALERT_FALLBACK` | `agent-alert` | запасное имя канала, если нет `agent-alert`; на боевой машине `claudeclaw-alert` |
| yadro-predohranitel | `YP_TARGET_IP` | пусто — не действует, код 2 | адрес, который обязан отвечать на ping после подъёма туннеля; на боевой машине задан в `cel.conf` |
| | `YP_DRY` | пусто | пробный прогон без перезагрузки (код 1 вместо reboot) |
| | метка `/var/lib/yadro-predohranitel/armed` | нет — не взведён | имя целевого ядра; путь зашит |
| inet6-poyavlenie-watch | `INET6_STATE_DIR` | `/var/lib/inet6-poyavlenie-watch` | состояние; на боевой машине задан тот же путь |
| hvosty-vartmp-watch | `HVT_PERECHEN` | `/etc/hvosty-vartmp-watch/dolgozhiteli.txt` (нет файла — перечень пуст) | перечень долгожителей `<маска> <ГГГГ-ММ-ДД> <хозяин> \| <причина>`; на боевой машине `/etc/agent-registry/vartmp-dolgozhiteli.txt` |
| | `VT_KOREN`, `VT_PERECHEN`, `VT_ALERT`, `VT_POROG_CH`, `VT_SEGODNYA` | `/var/tmp`, —, `/usr/local/bin/agent-alert`, `72`, сегодня | только стенд; печатаются строкой «ПОДМЕНА» |
| dve-kopii-watch | `DKW_OSNOVA`, `DKW_APPS` | пусто — «НЕ НАСТРОЕНО», код 2 | `node_modules` дерева плагинов; установки `имя=каталог …`. На боевой машине `/opt/agent-plugins/node_modules` и app всех агентов |
| | `DKW_SOSTOYANIE`, `DKW_ALERT` | `/var/lib/dve-kopii-watch/posledniy-ishod`, `/usr/local/bin/agent-alert` | файл последнего исхода и канал |
| | `DKW_MASHINA`, `DKW_PODPIS` | имя узла, `dve-kopii-watch` | имя машины и подпись в тексте |
| | доводы `--osnova`, `--app ИМЯ=КАТАЛОГ`, `--tolko-pechat` | — | для стенда; `--tolko-pechat` — без тревоги и без записи состояния |
| podyom-mimo-vorot-watch | `PMV_PODYOM`, `PMV_PRIBOR`, `PMV_ALERT` | `/usr/local/bin/podyom-uzla`, `/usr/local/bin/kto-podnimal`, `/usr/local/bin/agent-alert` | ворота (дают область `--oblast`), прибор, канал |
| | `PMV_SOST`, `PMV_ITOG` | `/var/lib/podyom-mimo-vorot-watch/soobshcheno.txt`, `…/last.json` | сказанное и итог прогона |
| | `PMV_OKNO`, `PMV_MASHINA` | `24 hours ago`, `hostname -s` | окно прибора; имя машины (на боевой машине — её короткое имя) |
| | `PMV_SLUZHBY` | пусто | список служб вместо области ворот — только стенд |
| dsh-upstream-watch.sh | `DSH_PAKET`, `DSH_REPO` | `@deepseek-ai/dsh`, `deepseek-ai/deepseek-harness` | пакет npm и репозиторий описаний |
| | `DSH_SOSTOYANIE` | `/var/lib/dsh-upstream-watch/vidennye.txt` | виденные версии |
| | `DSH_ALERT` | `agent-alert` | канал (текст HTML первым доводом); на боевой машине задан в `/etc/default/dsh-upstream-watch` |
| | `DSH_PACKAGE_JSON` | пусто — наша версия будет объявлена новой один раз | `package.json` приложения с установленной версией; на боевой машине задан |
| | `DSH_BEZOPASNOST` | `security\|vulnerabilit\|CVE-\|безопасн\|уязвим` | признаки безопасности в описании релиза |
| predel-dliny-watch | `UNIT`, `KOMU` | пусто — «не настроено», код 2 | юнит шлюза агента и имя агента. На боевой машине `KOMU=%i` в шаблоне, `UNIT` — в drop-in'ах |
| | `PATTERN` | `Prompt is too long\|input_too_large\|Input exceeds the maximum length\|[(]perepolnenie:` | признак отказа (ERE) |
| | `OKNO_MIN` | `35` | окно журнала, мин |
| | `ALERT` | `agent-alert` из `PATH` | канал владельцу |
| | `PREDEL_YASHCHIKI` | пусто | ящики агентов `имя=каталог`; на боевой машине в `/etc/default/predel-dliny-watch` |
| | `PREDEL_STATE_DIR` | `/var/lib/predel-dliny-watch` | маркеры `last-seen-<агент>` |
| zadaniya-prervany-watch | `ZPW_KOREN`, `ZPW_ADRESAT` | пусто — слепота, код 2 | дом агента-отправителя и адресат; на боевой машине в `/etc/default/zadaniya-prervany-watch` |
| | `ZPW_SHAPKA`, `ZPW_PRAVKA_SCHYOTA` | `<узел> · zadaniya-prervany-watch …`, `правки счёта статей` | первая строка письма; название правки в тексте |
| | `ZPW_SOST`, `ZPW_REESTR_BIN`, `ZPW_TELL_BIN`, `ZPW_JOURNALCTL` | `/var/lib/zadaniya-prervany-watch`, `/usr/local/bin/agent-registry`, `/usr/local/bin/tell-komu`, `journalctl` | состояние и инструменты |
| | `ZPW_SEYCHAS` | `date +%s` | только стенд |
| storozh-dvizhkov.sh | `SD_SHLYUZ` | пусто — «НЕ НАСТРОЕНО», код 2 | путь скрипта шлюза в командной строке node; на боевой машине в файле настроек |
| | `SD_SHLYUZ_SLUZHBA` | пусто | юнит конкретного шлюза; на боевой машине `claude-oauth-gateway@%i.service` |
| | `SD_SOSTOYANIE` | `/var/lib/storozh-dvizhkov/sostoyanie` | отметка начала беды; юнит: `/var/lib/storozh-dvizhkov-%i/sostoyanie`, `StateDirectoryMode=0700`, `UMask=0077`; чужие владелец/запись/ссылка либо отказ записи — код 2; нечисловая/будущая дата сбрасывается |
| | `SD_SLUZHBA_PLATFORMY` | `службы платформы` | не только текст тревоги — выбирает режим. Юнит загружен (`LoadState=loaded`) — судит по моменту старта: движок, рождённый раньше `ExecMainStartTimestampMonotonic` платформы, — доживший; у юнита нет `MainPID` — все движки дожившие («платформа не работает»). Не юнит (в том числе умолчание) — прежнее правило «движков больше одного». На боевой машине `%i.service` |
| | `SD_MASHINA`, `SD_PRIPISKA` | `hostname -s`, пусто | текст тревоги |
| kontekst-zamer | `KONTEKST_ZAMER_SHABLONY` | `/opt/*/.dsh` | шаблоны каталогов `.dsh` через «:» (через `lib/nastrojka`) |
| | `KONTEKST_ZAMER_DOMA` | пусто | явный список домов через «:» — для стенда |
| | `KONTEKST_REESTR_PRIBOR` | `/usr/local/bin/agent-registry` | модуль чтения порогов D |
| | `KOMPAKT_NASTROJKI_KATALOG` | не задан | каталог настроек компакта |
| | довод `--mashinno` | — | машинный вывод `v=1` (его читает dsh-compact-watch) |
| agent-limits | `AGENT_LIMITS_DIR` | `/etc/ai-agent-limits` | каталог файлов пределов (через `lib/nastrojka`) |
| | `pokazhi <агент> [параметр] [--json]`, `proverit [--json]` | — | показать значения с источником; проверить форму файлов |
| python-padenie-70 | довод 1 | — | путь Python-скрипта, дальше его доводы |
| bash-padenie-70 | довод 1 или `BASH_PADENIE_SKRIPT` | — | путь bash-скрипта; `BASH_PADENIE_SKRIPT` — для цепочки `exec bash $OBERTKA` |

## Проверка

Стенды пакета — в `test/`. На боевой машине ночной обход (`vse-stendy-boevye`) гоняет их прямо из дерева
`/opt/<главный агент>/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/`. У всех один договор: 0 — все пробы прошли,
1 — расхождение, 2 — стенд слеп. Каждый проверяет три состояния: исправное молчит, порча краснеет с именем предмета,
порча снята — снова тихо. Канал тревог, `logger`, `systemctl`, `journalctl` и прочее подменены заглушками первыми в
`PATH`, состояние — во временном каталоге. Предмет по умолчанию — файл из `bin/` пакета; установленный подают
доводом или переменной.

| Стенд | Предмет, как звать | Ночной обход |
|---|---|---|
| `stend-agent-watchdog.sh` | agent-watchdog.sh; `CEL=<путь>` | да |
| `stend-apt-notify.sh` | apt-updates-notify.sh; `CEL=<путь>`; не от root — иначе проба прав пропущена, код 2 | да |
| `stend-dkms-kernel-coverage.sh` | dkms-kernel-coverage-check.sh; `CEL=<путь>` | да |
| `stend-yadro-predohranitel.sh` | yadro-predohranitel, каждая проба в `sudo unshare -m`; нужен sudo без пароля, иначе код 2 | да |
| `stend-inet6-poyavlenie.sh` | inet6-poyavlenie-watch; довод 1 | да |
| `stend-hvostov.sh` | hvosty-vartmp-watch; довод 1 или `HVOSTY_BIN` | да |
| `stend-dve-kopii.sh` | dve-kopii-watch; довод 1 | да |
| `stend-podyom-mimo-vorot.sh` | podyom-mimo-vorot-watch; довод 1 | да |
| `stend-dsh-upstream-watch.sh` | dsh-upstream-watch.sh (сеть не трогается) | да |
| `stend-predel-dliny-watch.sh` | predel-dliny-watch | да |
| `stend-doli-preseta.sh` | доля и порог D в kontekst-zamer (функции вынимаются AST, прибор целиком не запускается) | да |
| `stend-agent-limits.sh` | agent-limits; `LIMITS_BIN=<путь>` | да |
| `stend-python-padenie-70.sh` | python-padenie-70; `PADENIE_BIN=<путь>` | да |
| `stend-bash-padenie-70.sh` | bash-padenie-70; `PADENIE_BIN=<путь>` | да |
| `stend-storozh-dvizhkov.sh` | storozh-dvizhkov.sh, 16 проб (с 2.0.10 — и вложенный законный движок, сирота-доживший); довод 1 | да |
| `stend-klass-padenie.sh` | класс «падение до main() при `SuccessExitStatus` ∋ код»: временные юниты `systemd-run`, каталог скриптов в `/run`; нужен root, иначе код 2 | да (`@root`) |
| `proba-prav-sostoyaniya-zadaniya-prervany.sh` | права каталога состояния zadaniya-prervany-watch; `--boj` или `--koren DIR`; исход 0 зелёное, 1 красное, 3 слепота | нет |
| `stend-dve-kopii-montazh.sh` | контракт монтажа dve-kopii-watch; Python unittest на копиях | — |
| `stend-audit.sh` | исправления аудита №20; подставные источники, каналы и ремонтные команды; нужна непривилегированная учётка (пробы прав), фикстуры `os.umask(0o077)` | — |

Пример: `bash test/stend-dve-kopii.sh` (кандидат из `bin/`) или `bash test/stend-dve-kopii.sh /usr/local/sbin/dve-kopii-watch` (бой).

Записи реестра (`agent-plugins list --health` зовёт healthcheck):

- `dsh-storozha-mashiny`: `installed_check` — отпечаток всех мест из поимённого `derevo.files` (для текущего состава 47; после монтажа сверить список) (`sha256sum … | LC_ALL=C sort -k2 | sha256sum |
  cut -c1-16`) обязан быть равен `version` записи; `healthcheck` — `is-active` 22 таймеров: 10 простых и явные
  экземпляры шаблонов (7 `predel-dliny-watch@`, 5 `storozh-dvizhkov@`). Экземпляр, которого нет в перечне, не
  проверяется. Живой признак таймера `agent-watchdog` — `systemctl show agent-watchdog.timer -p
  NextElapseUSecMonotonic` не `infinity`.
- `apt-updates-notify` (файлы ведёт пакетная запись): healthcheck — таймер активен, следующий запуск вычислен, последний прогон моложе 48 ч
  (`/var/lib/apt-updates-notify/last-run.stamp`).
- `kontekst-zamer` (файлы ведёт пакетная запись): healthcheck — `sudo -n /usr/local/sbin/kontekst-zamer` с кодом 0,
  есть строка «номинальные доли D», нет «порог D НЕ ИЗМЕРЕН» и «слепо».
- `podyom-mimo-vorot-watch` (файлы ведёт пакетная запись): только читает итог `/var/lib/podyom-mimo-vorot-watch/last.json` (не старше 40 мин); сам
  сторож не зовёт.

Исторический замер на 09.10.2026: суммы `sha256sum` всех 45 тогда учтённых файлов `derevo.files` совпали с боевыми. После монтажа текущего состава проверить все 47 имён отдельно; режимы/владельцы — `stat -c '%a %U:%G'`.

Коды выхода модулей: `agent-watchdog.sh` — 0, 2 (нет настройки или журнал не добыт), 3 (тревога не доставлена).
`apt-updates-notify.sh` — 0 измерено, 1 списки протухли, 2 слепота или не доставлено. `dkms-kernel-coverage-check.sh` —
0 (покрыто или починено), 1 починить не удалось, 2 не настроено или слепота. `yadro-predohranitel` — 0, 1 (`YP_DRY`),
2; иначе перезагрузка. `inet6-poyavlenie-watch` — 0, 1 (весть не доставлена), 2 слепота. `hvosty-vartmp-watch` — 0
хвостов нет, 1 есть и тревога ушла, 2 слепота, 3 не ушла (юнит: `SuccessExitStatus=1`). `dve-kopii-watch` — 0, 1
разошёлся код, 2 слепота, 4 адресная отсрочка: состояние не меняется, отбоя нет (юнит включает `--avto-montazh`, `SuccessExitStatus=1`; 4 → failed). `podyom-mimo-vorot-watch` — 0, 3 новый обход, 2 слепота (юнит:
`SuccessExitStatus=2 3`). `dsh-upstream-watch.sh` — 0, 1 новое, 2 слепота, 3 не доставлено (юнит: `SuccessExitStatus=0
1 2`). `predel-dliny-watch` — 0, 2 слепота или не настроено, 3 отказ доставки. `zadaniya-prervany-watch` — 0, 1 канал
отказал, 2 слепота. `storozh-dvizhkov.sh` — 0 (доживших нет — печатает «ok: доживших ходов нет»; или доживший замечен впервые, или
держится меньше 300 с), 1 доживший держится дольше 300 с (в режиме «не юнит» — движков больше одного; тревога ушла
или НЕ ушла — см. вывод), 2 слепота или не настроено.
`kontekst-zamer` — 0 величины получены, 1 сессии есть, величин нет, 2 прибор слеп. `agent-limits` — `pokazhi`: 0, 3
нет такого параметра; `proverit`: 0, 1 есть беды, 2 слепота. `*-padenie-70` — код скрипта как есть, 70 — скрипт
упал, 71 — скрипта нет.

## Ограничения

- Пакет не сторожит сам себя: смерть таймера видит другой сторож (`sadik-watch` по перечню суточных,
  `agent-watchdog.sh` по `SERVICES`).
- Все сторожа — снимок на такте. Что случилось и прошло между тактами, они не видят.
- `agent-watchdog.sh`: `юнит:часы` годится только для `Type=oneshot`. Он не видит «успешный» по коду запуск, который
  ничего не проверил. Последнюю строку без перевода строки `read` теряет (спящий дефект, в бою вход от `journalctl`).
- `apt-updates-notify.sh` знает только скачанные списки apt: уязвимость без выпущенного пакета, обновления npm и pypi,
  ESM ему не видны; важное от пустяка он не отличает.
- `dkms-kernel-coverage-check.sh` выбирает канал по имени в `PATH`, а не по сумме. Отказ доставки печатается «НЕ доставлена»; код остаётся итогом ремонта (0 или 1).
  Текст тревоги говорит о «модуле туннелей» и `amneziawg-dkms`.
- `yadro-predohranitel` проверяет модуль `amneziawg`: имя зашито в код, а не берётся из настройки. Не видит зависание
  до userspace без паники и порчу служб при живой сети. Путь метки зашит.
- `inet6-poyavlenie-watch` смотрит состояние «есть глобальный адрес или маршрут», а не отказы Node.
- `hvosty-vartmp-watch` смотрит только верхний уровень `/var/tmp`. Возраст по подделанному mtime врёт. Ссылки не
  раскрывает. Живую запись, в которую не пишут больше 72 ч, назовёт хвостом (лечится строкой перечня). Сам ничего не
  удаляет.
- `dve-kopii-watch` сверяет только 9 пакетов из своего списка и только установки из `DKW_APPS`. Вложенные
  `node_modules` и `package.json` не сверяет. Видит диск, а не память процесса.
- `podyom-mimo-vorot-watch` не отличит первый ручной запуск в первые 60 с загрузки от загрузочного. Службы вне области
  ворот (исполнители, которых поднимают руками) он не смотрит.
- `dsh-upstream-watch.sh` не говорит, годна ли нам версия. Слепота источника (код 2) юнит не роняет
  (`SuccessExitStatus=0 1 2`): её видно в журнале и по повтору альфы. Переименование пакета или смену репозитория он
  не ловит.
- `predel-dliny-watch` ловит только формулировки из `PATTERN`. Экземпляр знает один юнит: новый агент — новый
  экземпляр, руками. Шлюз, запущенный не бинарём `node`, даст 0 строк (это видно знаменателем).
- `zadaniya-prervany-watch` не отличает «повтор сделан, файл забыли удалить»: «снято» значит «файла нет». Задания вне
  `profiles/web` он не видит.
- `storozh-dvizhkov.sh` смотрит движки ОДНОГО шлюза. Это наблюдение, а не защита от публикации. При нескольких шлюзах
  с одним скриптом без `SD_SHLYUZ_SLUZHBA` — слепота, код 2. Движки — процессы `claude` из cgroup шлюза (любой
  глубины дерева процессов) и прямые дети шлюза; `claude` во вложенной cgroup, не прямой ребёнок шлюза, не виден.
  С 2.0.9 в режиме по старту он НЕ ловит два главных хода внутри одной живой платформы (оба рождены после её старта;
  прежнее правило «больше одного» их ловило) и помощников, рождённых дожившим ходом уже после перезапуска (сам
  доживший при этом красный). Граница часов: старт процесса — по BOOTTIME (`/proc/<pid>/stat`), старт службы — по
  Monotonic systemd; после засыпания или миграции ВМ законный движок может выглядеть «рождённым раньше». Звено цепочки
  родителей, ушедшее посреди подъёма, даёт разовое «ДОЖИЛ» в списке без тревоги (тревога — только после 300 с).
- `kontekst-zamer` берёт порог из `D.defaultRoute`, а не effective-порог запроса. Долю в памяти движка (файл правлен
  без подъёма) не видит.
- `lib/nastrojka` не ловит опечатку в имени ключа в файле (сработает умолчание); переменная окружения всегда главнее
  файла.
- `*-padenie-70` не видят ошибку, которую скрипт сам перехватил и закончил кодом 1, ошибку дочернего скрипта и смерть
  от сигнала.
- Учёт: пакетный состав — 47 мест (поимённо выше); после монтажа запись `dsh-storozha-mashiny` должна охватывать именно их. Машинные drop-in'ы (`50-mashina.conf`,
  `cel.conf`, `unit-shlyuza.conf`, `60-*-padenie-70.conf`) — вне пакета: их держит учёт доработок (`manifest.txt`,
  класс Y), а не эта запись.
---

<a id="english"></a>

# dsh-storozha-mashiny — watchdogs and instruments for a machine that runs several AI agents

Current version — see `package.json` and `CHANGELOG.md`.

## Purpose

The package is 16 independent executables (bash and python3), a shared settings reader `lib/nastrojka`, and systemd
units for twelve modules. Each watchdog checks one thing that breaks silently and calls a human. A silent watchdog
means "checked and clean". If it could not check, that is a separate loud outcome (usually exit 2), not silence.
Only `dkms-kernel-coverage-check.sh` (installs kernel headers and builds the module) and `yadro-predohranitel`
(rolls the boot back to the working kernel) repair anything themselves.

The package is written generically: everything machine-specific is a setting. On the production machine these values are set by the
`50-mashina.conf` drop-ins, the `/etc/default/*` files and the shared file
`/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf`.

| Module | What it watches or does | Who calls it on the production machine | Whom it tells |
|---|---|---|---|
| `agent-watchdog.sh` | units and timers from a list, freshness of oneshot services (`unit:hours`), memory liveness by URL, disk space | `agent-watchdog.timer`, every 5 min | `agent-alert` |
| `apt-updates-notify.sh` | how many apt updates are pending and how many of them are security; whether the lists went stale. Installs nothing | `apt-updates-notify.timer`, 07:35 UTC | `agent-alert`; "alive" every 7 days |
| `dkms-kernel-coverage-check.sh` | the DKMS module is built for EVERY installed kernel; if not, builds it itself | `dkms-kernel-coverage.timer`, daily and 5 min after boot | `agent-alert`, fallback `claudeclaw-alert` |
| `yadro-predohranitel` | first boot of a new kernel: the `amneziawg` module and the network up to `YP_TARGET_IP`; none within 10 min — reboot into GRUB `saved_entry` | `yadro-predohranitel.service` at boot, only when the marker is armed | unit journal |
| `inet6-poyavlenie-watch` | whether a global IPv6 appeared (then the v4-first protection is no longer guaranteed) | `inet6-poyavlenie-watch.timer`, every 30 min | `agent-alert` (none — `claudeclaw-alert`) |
| `hvosty-vartmp-watch` | abandoned top-level `/var/tmp` entries older than 72 h, except the long-lived list. Report only | `hvosty-vartmp-watch.timer`, 05:17 | `agent-alert` |
| `dve-kopii-watch` | whether the code of 9 shared platform packages diverged between the plugin tree and each agent's app | `dve-kopii-watch.timer`, 06:47 | `agent-alert` |
| `podyom-mimo-vorot-watch` | an agent service was started not through `podyom-uzla` (per the `kto-podnimal` instrument) | `podyom-mimo-vorot-watch.timer`, every 15 min | `agent-alert`; result in `last.json` for the healthcheck |
| `dsh-upstream-watch.sh` | a new `@deepseek-ai/dsh` version in npm: rc and stable — alert, alpha — silent (with a security sign — with a caveat) | `dsh-upstream-watch.timer`, 03:00 UTC | `agent-alert` |
| `predel-dliny-watch` | a provider refusal on prompt length in the agent gateway's journal | `predel-dliny-watch.timer` (Iskra, every 30 min) and `predel-dliny-watch@<agent>.timer` (every 15 min) | `agent-alert` and a letter to the agent's inbox |
| `zadaniya-prervany-watch` | interrupted distillation tasks `zadanie-prervan-*` older than an hour | `zadaniya-prervany-watch.timer`, hourly at :23 | a letter to the coordinator via `tell-komu` |
| `storozh-dvizhkov.sh` | an agent turn outlived its platform: a `claude` engine under the gateway that was started before the current platform start (or the platform is not running, or its parent chain does not reach the gateway) lasts longer than 5 min. If the platform service is not a unit — the old rule "more than one turn" | `storozh-dvizhkov@<agent>.timer`, every 2 min | `agent-alert` |
| `kontekst-zamer` | instrument: context-window fill of the DSH agents and the nominal compaction threshold | `dsh-compact-watch` (the machine watchdogs package `dsh-storozha-sadik`) with `--mashinno`; registry healthcheck; humans | stdout |
| `agent-limits` | tool: agents' limits and policies from `/etc/ai-agent-limits`, file shape check. Read only | by hand and from scripts; its stand is in the nightly run | stdout |
| `python-padenie-70` | launcher for a Python watchdog: a script crash gives exit 70, not "success" under `SuccessExitStatus=1` | `ExecStart=` in `60-python-padenie-70.conf` drop-ins | — |
| `bash-padenie-70` | the same for bash: `set -u`, syntax, `bad substitution` give exit 70 | `ExecStart=` in `60-bash-padenie-70.conf` drop-ins | — |

Enabled instances on the production machine: `predel-dliny-watch@<agent>` — for seven agents (four coding agents and
three more agents); `storozh-dvizhkov@<agent>` — for five agents with a Claude gateway, the main agent and the guest
included. A failure of any watchdog with a timer is seen by `sadik-watch` (package dsh-storozha-sadik) through the
list `/etc/agent-registry/storozha-sutochnye.txt`: all of the package's services with a timer are in it. The `*-padenie-70` launchers are also used by units of other packages
(a2a-pochtalon, codex-auth-watch, registry-watchdog, vse-stendy-boevye and others).

## What gets installed and where

The package installation inventory is 47 places: 16 `bin/` files, `lib/nastrojka`, and 30 `systemd/` files (25 units and 5 drop-ins). Their names are in the table below. One `dsh-storozha-mashiny` entry in `/etc/agent-registry/plugins.yaml` (`services`, `derevo.files`) keeps the inventory; `ref` points to the package tag. The table's modes and owners are the installation contract, not a new live-machine measurement. The historical 09.10.2026 measurement covered 45 tree files whose hashes all matched the live files. The `apt-updates-notify`, `kontekst-zamer`, and `podyom-mimo-vorot-watch` entries remain for healthchecks; the package entry keeps the files (`uchteno_v: dsh-storozha-mashiny`). Live files are copies, not symlinks into the package.

| File in the package | Path on the machine | Mode, owner | Who executes / reads |
|---|---|---|---|
| `bin/agent-watchdog.sh` | `/usr/local/sbin/agent-watchdog.sh` | 0755 root:root | `agent-watchdog.service` |
| `bin/apt-updates-notify.sh` | `/usr/local/sbin/apt-updates-notify.sh` | 0755 root:root | `apt-updates-notify.service` (on the production machine a drop-in: `DynamicUser=yes`, `User=apt-updates-notify`) |
| `bin/dkms-kernel-coverage-check.sh` | `/usr/local/sbin/dkms-kernel-coverage-check.sh` | 0755 root:root | `dkms-kernel-coverage.service` |
| `bin/dsh-upstream-watch.sh` | `/usr/local/sbin/dsh-upstream-watch.sh` | 0755 root:root | `dsh-upstream-watch.service` via `bash-padenie-70` |
| `bin/dve-kopii-watch` | `/usr/local/sbin/dve-kopii-watch` | 0755 root:root | `dve-kopii-watch.service` via `python-padenie-70` |
| `bin/hvosty-vartmp-watch` | `/usr/local/sbin/hvosty-vartmp-watch` | 0755 root:root | `hvosty-vartmp-watch.service` via `python-padenie-70` |
| `bin/kontekst-zamer` | `/usr/local/sbin/kontekst-zamer` | 0755 root:root | dsh-compact-watch, healthcheck of the `kontekst-zamer` entry, humans |
| `bin/podyom-mimo-vorot-watch` | `/usr/local/sbin/podyom-mimo-vorot-watch` | 0755 root:root | `podyom-mimo-vorot-watch.service` via `bash-padenie-70` |
| `bin/yadro-predohranitel` | `/usr/local/sbin/yadro-predohranitel` | 0755 root:root | `yadro-predohranitel.service` |
| `bin/zadaniya-prervany-watch` | `/usr/local/sbin/zadaniya-prervany-watch` | 0755 root:root | `zadaniya-prervany-watch.service` (root) |
| `bin/agent-limits` | `/usr/local/bin/agent-limits` | 0755 root:root | by hand, scripts |
| `bin/bash-padenie-70` | `/usr/local/bin/bash-padenie-70` | 0755 root:root | `60-bash-padenie-70.conf` drop-ins |
| `bin/inet6-poyavlenie-watch` | `/usr/local/bin/inet6-poyavlenie-watch` | 0755 root:root | `inet6-poyavlenie-watch.service` |
| `bin/predel-dliny-watch` | `/usr/local/bin/predel-dliny-watch` | 0755 root:root | `predel-dliny-watch.service`, `predel-dliny-watch@.service` |
| `bin/python-padenie-70` | `/usr/local/bin/python-padenie-70` | 0755 root:root | `60-python-padenie-70.conf` drop-ins |
| `bin/storozh-dvizhkov.sh` | `/usr/local/bin/storozh-dvizhkov.sh` | 0755 root:root | `storozh-dvizhkov@.service` |
| `lib/nastrojka` | `/usr/local/lib/dsh-storozha-mashiny/lib/nastrojka` | 0755 root:root | agent-limits, kontekst-zamer, storozh-dvizhkov.sh (fallback path: on the live machine they are copies, not next to `lib/`) |
| `systemd/agent-watchdog.service` | `/etc/systemd/system/agent-watchdog.service` | 0644 root:root | systemd; machine drop-in `50-mashina.conf` |
| `systemd/agent-watchdog.service.d/10-locale.conf` | `/etc/systemd/system/agent-watchdog.service.d/10-locale.conf` | 0644 root:root | systemd (`LC_ALL=C.UTF-8`) |
| `systemd/agent-watchdog.timer` | `/etc/systemd/system/agent-watchdog.timer` | 0644 root:root | systemd, enabled |
| `systemd/agent-watchdog.timer.d/10-calendar.conf` | `/etc/systemd/system/agent-watchdog.timer.d/10-calendar.conf` | 0644 root:root | systemd (`OnCalendar=*:0/5` — insurance against a stuck timer) |
| `systemd/apt-updates-notify.service` | `/etc/systemd/system/apt-updates-notify.service` | 0644 root:root | systemd |
| `systemd/apt-updates-notify.timer` | `/etc/systemd/system/apt-updates-notify.timer` | 0644 root:root | systemd, enabled |
| `systemd/dkms-kernel-coverage.service` | `/etc/systemd/system/dkms-kernel-coverage.service` | 0644 root:root | systemd |
| `systemd/dkms-kernel-coverage.timer` | `/etc/systemd/system/dkms-kernel-coverage.timer` | 0644 root:root | systemd, enabled |
| `systemd/dsh-upstream-watch.service` | `/etc/systemd/system/dsh-upstream-watch.service` | 0644 root:root | systemd |
| `systemd/dsh-upstream-watch.timer` | `/etc/systemd/system/dsh-upstream-watch.timer` | 0644 root:root | systemd, enabled |
| `systemd/dve-kopii-watch.service` | `/etc/systemd/system/dve-kopii-watch.service` | 0644 root:root | systemd |
| `systemd/dve-kopii-watch.service.d/70-predely.conf` | `/etc/systemd/system/dve-kopii-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/dve-kopii-watch.timer` | `/etc/systemd/system/dve-kopii-watch.timer` | 0644 root:root | systemd, enabled |
| `systemd/hvosty-vartmp-watch.service` | `/etc/systemd/system/hvosty-vartmp-watch.service` | 0644 root:root | systemd |
| `systemd/hvosty-vartmp-watch.timer` | `/etc/systemd/system/hvosty-vartmp-watch.timer` | 0644 root:root | systemd, enabled |
| `systemd/inet6-poyavlenie-watch.service` | `/etc/systemd/system/inet6-poyavlenie-watch.service` | 0644 root:root | systemd |
| `systemd/inet6-poyavlenie-watch.timer` | `/etc/systemd/system/inet6-poyavlenie-watch.timer` | 0644 root:root | systemd, enabled |
| `systemd/podyom-mimo-vorot-watch.service` | `/etc/systemd/system/podyom-mimo-vorot-watch.service` | 0644 root:root | systemd |
| `systemd/podyom-mimo-vorot-watch.timer` | `/etc/systemd/system/podyom-mimo-vorot-watch.timer` | 0644 root:root | systemd, enabled |
| `systemd/predel-dliny-watch.service` | `/etc/systemd/system/predel-dliny-watch.service` | 0644 root:root | systemd (Iskra's instance) |
| `systemd/predel-dliny-watch.timer` | `/etc/systemd/system/predel-dliny-watch.timer` | 0644 root:root | systemd, enabled |
| `systemd/predel-dliny-watch@.service` | `/etc/systemd/system/predel-dliny-watch@.service` | 0644 root:root | systemd, per-agent template |
| `systemd/predel-dliny-watch@.timer` | `/etc/systemd/system/predel-dliny-watch@.timer` | 0644 root:root | systemd, 7 enabled instances |
| `systemd/storozh-dvizhkov@.service` | `/etc/systemd/system/storozh-dvizhkov@.service` | 0644 root:root | systemd, per-agent template |
| `systemd/storozh-dvizhkov@.timer` | `/etc/systemd/system/storozh-dvizhkov@.timer` | 0644 root:root | systemd, 5 enabled instances |
| `systemd/yadro-predohranitel.service` | `/etc/systemd/system/yadro-predohranitel.service` | 0644 root:root | systemd, enabled; `ConditionPathExists=/var/lib/yadro-predohranitel/armed` |
| `systemd/zadaniya-prervany-watch.service` | `/etc/systemd/system/zadaniya-prervany-watch.service` | 0644 root:root | systemd |
| `systemd/zadaniya-prervany-watch.service.d/50-rezhim-sostoyaniya.conf` | `/etc/systemd/system/zadaniya-prervany-watch.service.d/50-rezhim-sostoyaniya.conf` | 0644 root:root | systemd (`StateDirectoryMode=0750`) |
| `systemd/zadaniya-prervany-watch.service.d/70-predely.conf` | `/etc/systemd/system/zadaniya-prervany-watch.service.d/70-predely.conf` | 0644 root:root | systemd: limits `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/zadaniya-prervany-watch.timer` | `/etc/systemd/system/zadaniya-prervany-watch.timer` | 0644 root:root | systemd, enabled |

Not installed: `test/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` (`not_installed` in the
registry entry).

The live units are byte-equal to the tree units. Everything machine-specific is in the machine's drop-ins on top of
them: for example, `apt-updates-notify.service` in the tree runs as `User=nobody`, `Group=nogroup`, while on the production machine the
`50-mashina.conf` drop-in sets `DynamicUser=yes`, `User=apt-updates-notify`; `UNIT=coder-gateway@%i.service` for
`predel-dliny-watch@` is set by the template's `50-mashina.conf` drop-in.

Machine files are not part of the package, but the package reads them:

- `50-mashina.conf` drop-ins of `agent-watchdog`, `apt-updates-notify`, `dkms-kernel-coverage`, `dsh-upstream-watch`,
  `dve-kopii-watch`, `hvosty-vartmp-watch`, `inet6-poyavlenie-watch`, `podyom-mimo-vorot-watch`,
  `predel-dliny-watch`, `predel-dliny-watch@`, `storozh-dvizhkov@`, `zadaniya-prervany-watch`; `cel.conf` of
  `yadro-predohranitel`; `unit-shlyuza.conf` of five `predel-dliny-watch@<agent>` instances;
  an own drop-in of the guest's `storozh-dvizhkov@<agent>` instance (`SD_SHLYUZ` of the guest gateway); `60-*-padenie-70.conf`;
- `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` (for `lib/nastrojka`), `/etc/agent-watchdog/watchdog.conf`,
  `/etc/default/predel-dliny-watch`, `/etc/default/zadaniya-prervany-watch`, `/etc/default/dsh-upstream-watch`,
  `/etc/agent-registry/vartmp-dolgozhiteli.txt`.

## Requirements

Selected modules need systemd, Bash, Python 3 with `yaml` (PyYAML), coreutils/procps tools (`ps`, `pgrep`), `ip`, `dpkg-query`, and `dkms`. `agent-watchdog.sh` and `dsh-upstream-watch.sh` use `jq` and `curl`; `zadaniya-prervany-watch` uses `jq`, Python 3 with `yaml`, and `timeout`; `dsh-upstream-watch.sh` also uses `npm` and `node`.

| Module | Command / module | Provider package |
|---|---|---|
| watchdogs alerting the owner | `agent-alert` | `dsh-trevogi` |
| `kontekst-zamer`, `stend-doli-preseta.sh`, `zadaniya-prervany-watch` | `agent-registry` | `a2a-bus` |
| `podyom-mimo-vorot-watch` | `podyom-uzla` | `dsh-podyom` |
| `podyom-mimo-vorot-watch` | `kto-podnimal` | `dsh-pribory` |
| `zadaniya-prervany-watch` | `tell-komu` | `dsh-pochta` |
| `dve-kopii-watch --avto-montazh` | `montazh-okno` | `dsh-montazh` |

## Installation

We install the package file by file, through the gate: a change in the tree `/opt/<main agent>/workspace/dsh-plugins` gets
a new number (`package.json` and `CHANGELOG.md`), passes the gate and is mounted with `smontirovat-fajly`. Without a
flag the tool only does a dry run; only `--v-boj` writes to the live machine, and only as root. It puts the backup in
`/var/backups/montazh/<item>/` and after writing checks sum, mode and owner. Name the files explicitly: without a
list it takes all files of the candidate directory.

The executables go to two directories (see the table), so there are two calls as well:

```bash
P=/opt/<main agent>/workspace/dsh-plugins/packages/dsh-storozha-mashiny
sudo smontirovat-fajly --punkt <item> --progon "$P/bin" /usr/local/sbin dve-kopii-watch
sudo smontirovat-fajly --punkt <item> --v-boj  "$P/bin" /usr/local/sbin dve-kopii-watch
sudo smontirovat-fajly --punkt <item> --v-boj  "$P/bin" /usr/local/bin  predel-dliny-watch
sudo smontirovat-fajly --punkt <item> --v-boj  "$P"     /usr/local/lib/dsh-storozha-mashiny lib/nastrojka
```

Units — candidate directory `"$P/systemd"`, live directory `/etc/systemd/system`. The tree units differ from the
live ones (see above): before mounting a unit, compare it with `systemctl cat <unit>` and check that the machine
drop-in gives the same effective value.

```bash
sudo smontirovat-fajly --punkt <item> --v-boj "$P/systemd" /etc/systemd/system dve-kopii-watch.service
sudo systemctl daemon-reload
sudo systemctl enable --now <name>.timer                   # a new timer
sudo systemctl enable --now predel-dliny-watch@<agent>.timer storozh-dvizhkov@<agent>.timer   # a new agent
```

A new file that is not on the live machine yet is accepted only with `--novyj`. After mounting:

- a new watchdog with a timer — a line in `/etc/agent-registry/storozha-sutochnye.txt` (`<service> <period_hours>`),
  otherwise the daily watchdog `sadik-watch` turns red with "no line in the list";
- a new agent — the `predel-dliny-watch@` and `storozh-dvizhkov@` instances are created by hand, not from the
  registry; its inbox goes into `PREDEL_YASHCHIKI` (`/etc/default/predel-dliny-watch`), its gateway into a drop-in.
  Also add the timer instance to the healthcheck of the `dsh-storozha-mashiny` entry (its timer list is explicit: an
  instance missing from the list is not checked);
- in the `dsh-storozha-mashiny` entry move `version` (the `installed_check` fingerprint) and `ref` to the new tag —
  through `agent-plugins pravka`;
- `yadro-predohranitel` is armed before rebooting into a new kernel: write the target kernel name (as in
  `uname -r`) to `/var/lib/yadro-predohranitel/armed`.

## Configuration

Three kinds of settings. Modules with a unit take values from the unit environment (drop-in `Environment=` or
`EnvironmentFile=`). Modules that are called by hand, via `sudo` and from other services (`agent-limits`,
`kontekst-zamer`, `storozh-dvizhkov.sh`) read them through `lib/nastrojka` in the order: environment variable → a
`KEY=value` line in the `DSH_STOROZHA_MASHINY_CONF` file → default. An empty variable counts as unset; the file
exists but cannot be read — refusal, exit 2. The third kind is the modules' own files. Full reference —
`docs/SETTINGS.md`.

| Module | Setting | Default | Meaning; what is set on the production machine |
|---|---|---|---|
| lib/nastrojka | `DSH_STOROZHA_MASHINY_CONF` | `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` | settings file; on the production machine it holds `AGENT_LIMITS_DIR`, `KONTEKST_ZAMER_SHABLONY`, `SD_*` |
| agent-watchdog.sh | `WATCHDOG_CONF` | `/etc/dsh-storozha-mashiny/agent-watchdog.conf` | settings file (bash); on the production machine `/etc/agent-watchdog/watchdog.conf`. No file — exit 2 |
| | `WATCHDOG_STATE` | `/var/lib/machine-watchdog` | quiet windows; on the production machine `/var/lib/agent-watchdog` |
| | `WATCHDOG_ALERT` | `/usr/local/bin/agent-alert` | alert channel |
| | file key `SERVICES` | empty | units and timers separated by spaces; `unit:hours` — freshness of the last successful run of a oneshot service |
| | `MEMORY_HEALTH_URL` | empty — do not check | memory liveness URL |
| | `DISK_PATHS`, `DISK_MIN_FREE_PCT` | `/`, `10` | where to measure space and below which free percent to alert |
| | `COOLDOWN_MIN` | `30` | quiet window per problem, min |
| apt-updates-notify.sh | `APTUN_CONF` | `/etc/apt-updates-notify/apt-updates-notify.conf` | settings file (bash), optional; absent on the production machine |
| | `APTUN_STATE`, `APTUN_ALERT` | `/var/lib/apt-updates-notify`, `/usr/local/bin/agent-alert` | state (created by systemd, `StateDirectory=`) and channel |
| | `STALE_DAYS`, `HEARTBEAT_DAYS` | `3`, `7` | lists older — "stale", exit 1; silent this many days — say "alive" |
| | `CHECK_CMD`, `LIST_CMD`, `STAMP_FILE`, `RAW_LINES`, `RAW_CHARS` | `/usr/lib/update-notifier/apt-check`, `apt list --upgradable`, `/var/lib/apt/periodic/update-success-stamp`, `12`, `200` | sources and amount of raw data in the text (substitution — for the stand) |
| dkms-kernel-coverage-check.sh | `DKMS_COVERAGE_MODULE` | empty — "НЕ НАСТРОЕНО", exit 2 | DKMS module name; on the production machine `amneziawg` |
| | `DKMS_COVERAGE_ALERT_FALLBACK` | `agent-alert` | fallback channel name if there is no `agent-alert`; on the production machine `claudeclaw-alert` |
| yadro-predohranitel | `YP_TARGET_IP` | empty — does not act, exit 2 | the address that must answer ping after the tunnel is up; on the production machine set in `cel.conf` |
| | `YP_DRY` | empty | trial run without reboot (exit 1 instead of reboot) |
| | marker `/var/lib/yadro-predohranitel/armed` | absent — not armed | target kernel name; the path is hard-coded |
| inet6-poyavlenie-watch | `INET6_STATE_DIR` | `/var/lib/inet6-poyavlenie-watch` | state; on the production machine the same path is set |
| hvosty-vartmp-watch | `HVT_PERECHEN` | `/etc/hvosty-vartmp-watch/dolgozhiteli.txt` (no file — empty list) | long-lived list `<mask> <YYYY-MM-DD> <owner> \| <reason>`; on the production machine `/etc/agent-registry/vartmp-dolgozhiteli.txt` |
| | `VT_KOREN`, `VT_PERECHEN`, `VT_ALERT`, `VT_POROG_CH`, `VT_SEGODNYA` | `/var/tmp`, —, `/usr/local/bin/agent-alert`, `72`, today | stand only; printed as a "ПОДМЕНА" line |
| dve-kopii-watch | `DKW_OSNOVA`, `DKW_APPS` | empty — "НЕ НАСТРОЕНО", exit 2 | `node_modules` of the plugin tree; installations `name=dir …`. On the production machine `/opt/agent-plugins/node_modules` and the apps of all agents |
| | `DKW_SOSTOYANIE`, `DKW_ALERT` | `/var/lib/dve-kopii-watch/posledniy-ishod`, `/usr/local/bin/agent-alert` | last-outcome file and channel |
| | `DKW_MASHINA`, `DKW_PODPIS` | node name, `dve-kopii-watch` | machine name and signature in the text |
| | arguments `--osnova`, `--app NAME=DIR`, `--tolko-pechat` | — | for the stand; `--tolko-pechat` — no alert and no state write |
| podyom-mimo-vorot-watch | `PMV_PODYOM`, `PMV_PRIBOR`, `PMV_ALERT` | `/usr/local/bin/podyom-uzla`, `/usr/local/bin/kto-podnimal`, `/usr/local/bin/agent-alert` | the gate (gives the scope via `--oblast`), the instrument, the channel |
| | `PMV_SOST`, `PMV_ITOG` | `/var/lib/podyom-mimo-vorot-watch/soobshcheno.txt`, `…/last.json` | what was said and the run result |
| | `PMV_OKNO`, `PMV_MASHINA` | `24 hours ago`, `hostname -s` | instrument window; machine name (on the production machine — its short name) |
| | `PMV_SLUZHBY` | empty | a service list instead of the gate's scope — stand only |
| dsh-upstream-watch.sh | `DSH_PAKET`, `DSH_REPO` | `@deepseek-ai/dsh`, `deepseek-ai/deepseek-harness` | npm package and release-notes repository |
| | `DSH_SOSTOYANIE` | `/var/lib/dsh-upstream-watch/vidennye.txt` | versions already seen |
| | `DSH_ALERT` | `agent-alert` | channel (HTML text as the first argument); on the production machine set in `/etc/default/dsh-upstream-watch` |
| | `DSH_PACKAGE_JSON` | empty — our version will be announced as new once | the app's `package.json` with the installed version; set on the production machine |
| | `DSH_BEZOPASNOST` | `security\|vulnerabilit\|CVE-\|безопасн\|уязвим` | security signs in the release notes |
| predel-dliny-watch | `UNIT`, `KOMU` | empty — "not configured", exit 2 | the agent's gateway unit and the agent name. On the production machine `KOMU=%i` in the template, `UNIT` in drop-ins |
| | `PATTERN` | `Prompt is too long\|input_too_large\|Input exceeds the maximum length\|[(]perepolnenie:` | refusal sign (ERE) |
| | `OKNO_MIN` | `35` | journal window, min |
| | `ALERT` | `agent-alert` from `PATH` | channel to the owner |
| | `PREDEL_YASHCHIKI` | empty | agents' inboxes `name=dir`; on the production machine in `/etc/default/predel-dliny-watch` |
| | `PREDEL_STATE_DIR` | `/var/lib/predel-dliny-watch` | markers `last-seen-<agent>` |
| zadaniya-prervany-watch | `ZPW_KOREN`, `ZPW_ADRESAT` | empty — blindness, exit 2 | sender agent's home and the recipient; on the production machine in `/etc/default/zadaniya-prervany-watch` |
| | `ZPW_SHAPKA`, `ZPW_PRAVKA_SCHYOTA` | `<node> · zadaniya-prervany-watch …`, `правки счёта статей` | first line of the letter; the name of the fix in the text |
| | `ZPW_SOST`, `ZPW_REESTR_BIN`, `ZPW_TELL_BIN`, `ZPW_JOURNALCTL` | `/var/lib/zadaniya-prervany-watch`, `/usr/local/bin/agent-registry`, `/usr/local/bin/tell-komu`, `journalctl` | state and tools |
| | `ZPW_SEYCHAS` | `date +%s` | stand only |
| storozh-dvizhkov.sh | `SD_SHLYUZ` | empty — "НЕ НАСТРОЕНО", exit 2 | gateway script path in the node command line; on the production machine in the settings file |
| | `SD_SHLYUZ_SLUZHBA` | empty | the unit of a specific gateway; on the production machine `claude-oauth-gateway@%i.service` |
| | `SD_SOSTOYANIE` | `/var/lib/storozh-dvizhkov/sostoyanie` | trouble-start mark; unit: `/var/lib/storozh-dvizhkov-%i/sostoyanie`, `StateDirectoryMode=0700`, `UMask=0077`; foreign owner/write access, symlink or failed write → exit 2; a nonnumeric/future date resets |
| | `SD_SLUZHBA_PLATFORMY` | `службы платформы` | not just alert text — it selects the mode. A loaded unit (`LoadState=loaded`) — judged by start time: an engine started before the platform's `ExecMainStartTimestampMonotonic` is a survivor; the unit has no `MainPID` — every engine is a survivor ("the platform is not running"). Not a unit (including the default) — the old rule "more than one engine". On the production machine `%i.service` |
| | `SD_MASHINA`, `SD_PRIPISKA` | `hostname -s`, empty | alert text |
| kontekst-zamer | `KONTEKST_ZAMER_SHABLONY` | `/opt/*/.dsh` | glob patterns of `.dsh` directories separated by ":" (via `lib/nastrojka`) |
| | `KONTEKST_ZAMER_DOMA` | empty | explicit list of homes separated by ":" — for the stand |
| | `KONTEKST_REESTR_PRIBOR` | `/usr/local/bin/agent-registry` | module that reads the D thresholds |
| | `KOMPAKT_NASTROJKI_KATALOG` | not set | compaction settings directory |
| | argument `--mashinno` | — | machine output `v=1` (read by dsh-compact-watch) |
| agent-limits | `AGENT_LIMITS_DIR` | `/etc/ai-agent-limits` | directory of limit files (via `lib/nastrojka`) |
| | `pokazhi <agent> [key] [--json]`, `proverit [--json]` | — | show values with their source; check the file shape |
| python-padenie-70 | argument 1 | — | path of the Python script, then its arguments |
| bash-padenie-70 | argument 1 or `BASH_PADENIE_SKRIPT` | — | path of the bash script; `BASH_PADENIE_SKRIPT` — for an `exec bash $OBERTKA` chain |

## Verification

The package's stands are in `test/`. On the production machine the nightly run (`vse-stendy-boevye`) runs them straight from the
tree `/opt/<main agent>/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/`. They share one contract: 0 — all probes
passed, 1 — mismatch, 2 — the stand is blind. Each checks three states: healthy is quiet, a fault turns red naming
the subject, fault removed — quiet again. The alert channel, `logger`, `systemctl`, `journalctl` and the rest are
replaced by stubs first in `PATH`; state is in a temporary directory. The default subject is the file from the
package's `bin/`; an installed one is passed as an argument or a variable.

| Stand | Subject, how to call | Nightly run |
|---|---|---|
| `stend-agent-watchdog.sh` | agent-watchdog.sh; `CEL=<path>` | yes |
| `stend-apt-notify.sh` | apt-updates-notify.sh; `CEL=<path>`; non-root — root skips the permission probe and exits 2 | yes |
| `stend-dkms-kernel-coverage.sh` | dkms-kernel-coverage-check.sh; `CEL=<path>` | yes |
| `stend-yadro-predohranitel.sh` | yadro-predohranitel, each probe inside `sudo unshare -m`; needs passwordless sudo, otherwise exit 2 | yes |
| `stend-inet6-poyavlenie.sh` | inet6-poyavlenie-watch; argument 1 | yes |
| `stend-hvostov.sh` | hvosty-vartmp-watch; argument 1 or `HVOSTY_BIN` | yes |
| `stend-dve-kopii.sh` | dve-kopii-watch; argument 1 | yes |
| `stend-podyom-mimo-vorot.sh` | podyom-mimo-vorot-watch; argument 1 | yes |
| `stend-dsh-upstream-watch.sh` | dsh-upstream-watch.sh (the network is not touched) | yes |
| `stend-predel-dliny-watch.sh` | predel-dliny-watch | yes |
| `stend-doli-preseta.sh` | D ratio and threshold in kontekst-zamer (functions are extracted via AST, the instrument is not run as a whole) | yes |
| `stend-agent-limits.sh` | agent-limits; `LIMITS_BIN=<path>` | yes |
| `stend-python-padenie-70.sh` | python-padenie-70; `PADENIE_BIN=<path>` | yes |
| `stend-bash-padenie-70.sh` | bash-padenie-70; `PADENIE_BIN=<path>` | yes |
| `stend-storozh-dvizhkov.sh` | storozh-dvizhkov.sh, 16 probes (since 2.0.10 also a legitimate nested engine and an orphan survivor); argument 1 | yes |
| `stend-klass-padenie.sh` | the class "crash before main() with `SuccessExitStatus` ∋ the code": temporary `systemd-run` units, scripts directory in `/run`; needs root, otherwise exit 2 | yes (`@root`) |
| `proba-prav-sostoyaniya-zadaniya-prervany.sh` | permissions of the zadaniya-prervany-watch state directory; `--boj` or `--koren DIR`; outcome 0 green, 1 red, 3 blind | no |
| `stend-dve-kopii-montazh.sh` | dve-kopii-watch installation contract; Python unittest on copies | — |
| `stend-audit.sh` | audit 20 fixes; fixture sources, channels, and repair commands; non-root required (permission probes); fixture `os.umask(0o077)` | — |

Example: `bash test/stend-dve-kopii.sh` (the candidate from `bin/`) or
`bash test/stend-dve-kopii.sh /usr/local/sbin/dve-kopii-watch` (live).

Registry entries (`agent-plugins list --health` calls the healthcheck):

- `dsh-storozha-mashiny`: `installed_check` — the fingerprint of every named `derevo.files` place (47 for the current inventory; compare names after installation) (`sha256sum … | LC_ALL=C sort -k2 |
  sha256sum | cut -c1-16`) must equal the entry's `version`; `healthcheck` — `is-active` of 22 timers: 10 plain ones
  and explicit template instances (7 `predel-dliny-watch@`, 5 `storozh-dvizhkov@`). An instance missing from the list
  is not checked. The live sign of the `agent-watchdog` timer — `systemctl show agent-watchdog.timer -p
  NextElapseUSecMonotonic` is not `infinity`.
- `apt-updates-notify` (files kept by the package entry): healthcheck — the timer is active, the next run is computed, the last run is younger than
  48 h (`/var/lib/apt-updates-notify/last-run.stamp`).
- `kontekst-zamer` (files kept by the package entry): healthcheck — `sudo -n /usr/local/sbin/kontekst-zamer` with exit 0, a "номинальные доли D" line
  exists, no "порог D НЕ ИЗМЕРЕН" and no "слепо".
- `podyom-mimo-vorot-watch` (files kept by the package entry): only reads the result `/var/lib/podyom-mimo-vorot-watch/last.json` (not older than 40
  min); does not call the watchdog itself.

Sums: `sha256sum` of each of the 45 `derevo.files` files equals the live one (on 09.10.2026 — all 45 equal),
`stat -c '%a %U:%G'` — the table above.

Module exit codes: `agent-watchdog.sh` — 0, 2 (no settings or the journal was not fetched), 3 (the alert was not
delivered). `apt-updates-notify.sh` — 0 measured, 1 lists stale, 2 blindness or not delivered.
`dkms-kernel-coverage-check.sh` — 0 (covered or repaired), 1 repair failed, 2 not configured or blindness.
`yadro-predohranitel` — 0, 1 (`YP_DRY`), 2; otherwise a reboot. `inet6-poyavlenie-watch` — 0, 1 (the message was not
delivered), 2 blindness. `hvosty-vartmp-watch` — 0 no tails, 1 tails found and the alert went, 2 blindness, 3 the
alert did not go (unit: `SuccessExitStatus=1`). `dve-kopii-watch` — 0, 1 code diverged, 2 blindness, 4 scoped deferral without state/recovery writes (unit enables `--avto-montazh`, `SuccessExitStatus=1`; 4 → failed). `podyom-mimo-vorot-watch` — 0, 3 a new bypass, 2 blindness (unit: `SuccessExitStatus=2 3`).
`dsh-upstream-watch.sh` — 0, 1 something new, 2 blindness, 3 not delivered (unit: `SuccessExitStatus=0 1 2`).
`predel-dliny-watch` — 0, 2 blindness or not configured, 3 delivery refused. `zadaniya-prervany-watch` — 0, 1 the
channel failed, 2 blindness. `storozh-dvizhkov.sh` — 0 (no survivors — prints "ok: доживших ходов нет"; or a survivor
noticed for the first time, or lasting less than 300 s), 1 a survivor lasts longer than 300 s (in the "not a unit"
mode — more than one engine; the alert delivered or NOT — see the output), 2 blindness or not configured. `kontekst-zamer` — 0 values obtained, 1 sessions exist but no values, 2 the instrument is blind.
`agent-limits` — `pokazhi`: 0, 3 no such key; `proverit`: 0, 1 problems, 2 blindness. `*-padenie-70` — the script's
code as is, 70 — the script crashed, 71 — no script.

## Limitations

- The package does not watch itself: a dead timer is seen by another watchdog (the daily watchdog `sadik-watch` through the daily list,
  `agent-watchdog.sh` through `SERVICES`).
- All watchdogs take a snapshot per tick. What happened and passed between ticks they do not see.
- `agent-watchdog.sh`: `unit:hours` works only for `Type=oneshot`. It does not see a run that "succeeded" by exit
  code but checked nothing. `read` loses a last line without a trailing newline (a dormant defect; live input comes
  from `journalctl`).
- `apt-updates-notify.sh` knows only the downloaded apt lists: a vulnerability without a released package, npm and
  pypi updates, ESM are invisible to it; it does not tell the important from the trivial.
- `dkms-kernel-coverage-check.sh` picks the channel by name in `PATH`, not by checksum. Failed delivery prints
  "НЕ доставлена"; the exit code remains the repair outcome (0 or 1). The alert text speaks of "the tunnel module" and `amneziawg-dkms`.
- `yadro-predohranitel` checks the `amneziawg` module: the name is hard-coded, not taken from a setting. It does not
  see a hang before userspace without a panic, or broken services with a working network. The marker path is
  hard-coded.
- `inet6-poyavlenie-watch` watches the state "a global address or route exists", not Node failures.
- `hvosty-vartmp-watch` looks only at the top level of `/var/tmp`. Age from a forged mtime lies. It does not follow
  symlinks. A live entry not written for more than 72 h is called a tail (cured by a list line). It deletes nothing
  itself.
- `dve-kopii-watch` compares only the 9 packages from its list and only the installations from `DKW_APPS`. It does
  not compare nested `node_modules` or `package.json`. It sees the disk, not the process memory.
- `podyom-mimo-vorot-watch` cannot tell a first manual start in the first 60 s of boot from the boot start. Services
  outside the gate's scope (executors started by hand) are not watched.
- `dsh-upstream-watch.sh` does not say whether a version suits us. Source blindness (exit 2) does not fail the unit
  (`SuccessExitStatus=0 1 2`): it shows in the journal and as an alpha retry. It does not catch a package rename or a
  repository move.
- `predel-dliny-watch` catches only the wordings in `PATTERN`. An instance knows one unit: a new agent means a new
  instance, by hand. A gateway not started by the `node` binary gives 0 lines (the denominator shows it).
- `zadaniya-prervany-watch` cannot tell "the retry was done, the file was forgotten": "cleared" means "no file". It
  does not see tasks outside `profiles/web`.
- `storozh-dvizhkov.sh` watches the engines of ONE gateway. It is observation, not protection against publishing.
  Several gateways with one script and no `SD_SHLYUZ_SLUZHBA` — blindness, exit 2. Engines are `claude` processes
  from the gateway's cgroup (any depth of the process tree) and the gateway's direct children; a `claude` in a nested
  cgroup that is not a direct child of the gateway is not seen. Since 2.0.9, in the start-time mode it does NOT
  catch two main turns inside one live platform (both started after its start; the old "more than one" rule caught
  them), nor helpers spawned by a survivor after the restart (the survivor itself is red). Clock boundary: the
  process start is by BOOTTIME (`/proc/<pid>/stat`), the service start by systemd Monotonic; after a suspend or a VM
  migration a legitimate engine may look "started earlier". A parent-chain link leaving mid-walk gives a one-off
  "ДОЖИЛ" line without an alert (the alert comes only after 300 s).
- `kontekst-zamer` takes the threshold from `D.defaultRoute`, not the effective request threshold. It does not see a
  ratio held in the engine's memory (file edited without a restart).
- `lib/nastrojka` does not catch a typo in a key name in the file (the default applies); an environment variable
  always beats the file.
- `*-padenie-70` do not see an error the script caught itself and ended with exit 1, an error in a child script, or
  death by a signal.
- Accounting: the package inventory is 47 named places (above); after installation the `dsh-storozha-mashiny` entry must cover those names. The machine drop-ins
  (`50-mashina.conf`, `cel.conf`, `unit-shlyuza.conf`, `60-*-padenie-70.conf`) are outside the package: they are kept
  by the local-changes accounting (`manifest.txt`, class Y), not by this entry.
