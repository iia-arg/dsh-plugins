# dsh-podpiski — подписки Claude и Codex на sadik: переключатели, доступ шлюзов к токенам, сторожа и обновитель Codex, приёмник `/switch`

Версия · Version: 3.1.3

## Назначение

Служебный софт sadik вокруг подписок. Claude-агенты ходят к модели через шлюзы `claude-oauth-gateway@<агент>`, Codex-агенты — через `coder-gateway@<агент>` и `coder-gateway-<агент>`; у каждого шлюза один токен подписки. Пакет переключает общие подписки (Claude 1→2→3→1, Codex 3↔4), следит, чтобы шлюз читал только свой токен, держит токен Codex свежим и предупреждает, когда у Codex-подписки кончается лимит.

Кто зовёт. Владелец пишет боту тревог `/switch-a`, `/switch-1`, `/switch-b`, `/switch-2`, `/sss`, `/sss_on`; их принимает постоянная служба `sadik-komandy.service` (учётка `agent-switch`) и через sudoers запускает `sadik-switch@<команда>.service`, а тот — `pereklyuchatel-podpiski` (Claude) или `pereklyuchatel-codex` (Codex) от root. `pereklyuchatel-podpiski` с доводом `tiho` зовёт ещё автопереключатель `dsh-limity-avtoperekl` (пакет dsh-limity); `pereklyuchatel-codex` — заслон лимита `codex-limit-watch`, когда автопереключение включено. По таймерам ходят `codex-obnovitel` (две подписки), `codex-auth-watch`, `codex-katalog-watch`, `codex-limit-watch`, `svesti-dostup-watch`. `codex-compaction-vyborka` зовёт drop-in `dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` (пакет dsh-compact-outcomes). `svyazki-podpisok` и `codex-limits-measure.py` — только рука root.

Кто читает результат. Владелец — ответ бота и тревоги (`dsh-alert` у переключателя Claude, `agent-alert` у остальных). Шлюзы — свои токены через ACL и ссылки `auth.json`. Служба лимитов dsh-limity — состояние `/var/lib/codex-limit-watch/sostoyanie.json`. `turn_watch` dsh-compact-outcomes — файлы `/var/lib/codex-compaction-sobytiya/<имя>.jsonl`.

## Что ставится и куда

[English](README.en.md). Пакет — локальные служебные исходники sadik; перевод документации не означает публикацию наружу. Без `package.json`: `sbin/` и `libexec/` повторяют пути под `/usr/local/`, `systemd/` — под `/etc/systemd/system/`, `etc/default/` — под `/etc/default/`. Таблица сверена с записью `dsh-podpiski` в `/etc/agent-registry/plugins.yaml` (`derevo.files`, 32 файла) и с диском 08.10.2026: суммы, режимы и владельцы совпадают.

| файл в пакете | путь на машине | режим / владелец | кто исполняет / читает |
|---|---|---|---|
| `sbin/pereklyuchatel-podpiski` | `/usr/local/sbin/pereklyuchatel-podpiski` | 0755 root:root | `sadik-switch@a`/`@1` через `sadik-switch-exec`; `pereklyuchatel-podpiski@.service`; `dsh-limity-avtoperekl` (`tiho`); рука root |
| `libexec/pereklyuchatel-podpiski-limity.py` | `/usr/local/libexec/pereklyuchatel-podpiski-limity.py` | 0755 root:root | `pereklyuchatel-podpiski` (заслон лимита); читает `/var/lib/dsh-limity/limity.db` только на чтение |
| `etc/default/pereklyuchatel-podpiski-limity` | `/etc/default/pereklyuchatel-podpiski-limity` | 0644 root:root | `pereklyuchatel-podpiski-limity.py` (правило свежести) |
| `sbin/pereklyuchatel-codex` | `/usr/local/sbin/pereklyuchatel-codex` | 0755 root:root | `sadik-switch@b`/`@2` через `sadik-switch-exec`; `codex-limit-watch` (авто); рука root |
| `sbin/svesti-dostup-podpisok` | `/usr/local/sbin/svesti-dostup-podpisok` | 0755 root:root | оба переключателя, `svyazki-podpisok`, `svesti-dostup-watch`; рука root |
| `sbin/svesti-dostup-watch` | `/usr/local/sbin/svesti-dostup-watch` | 0755 root:root | `svesti-dostup-watch.service` |
| `sbin/svyazki-podpisok` | `/usr/local/sbin/svyazki-podpisok` | 0755 root:root | рука root |
| `sbin/codex-auth-watch` | `/usr/local/sbin/codex-auth-watch` | 0755 root:root | `codex-auth-watch.service` (через `python-padenie-70`) |
| `sbin/codex-katalog-watch` | `/usr/local/sbin/codex-katalog-watch` | 0755 root:root | `codex-katalog-watch.service` (через `python-padenie-70`) |
| `sbin/codex-limit-watch` | `/usr/local/sbin/codex-limit-watch` | 0755 root:root | `codex-limit-watch.service` |
| `sbin/codex-obnovitel` | `/usr/local/sbin/codex-obnovitel` | 0755 root:root | `codex-obnovitel.service` (подписка 3), `codex-obnovitel-4.service` (подписка 4) |
| `libexec/codex-limits-measure.py` | `/usr/local/libexec/codex-limits-measure.py` | 0755 root:root | рука root (`python3 <путь>`); зовущего на машине нет |
| `libexec/codex-compaction-vyborka` | `/usr/local/libexec/codex-compaction-vyborka` | 0755 root:root | `ExecStartPre` drop-in `dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` |
| `sbin/sadik-komandy-priyomnik` | `/usr/local/sbin/sadik-komandy-priyomnik` | 0755 root:root | `sadik-komandy.service` (User=agent-switch) |
| `libexec/sadik-switch-exec` | `/usr/local/libexec/sadik-switch-exec` | 0755 root:root | `sadik-switch@.service` (экземпляры `1`, `a`, `2`, `b`, `sss`, `sss-on`) |
| `systemd/codex-auth-watch.service` | `/etc/systemd/system/codex-auth-watch.service` | 0644 root:root | systemd; root, `SuccessExitStatus=1`, предел 60 с |
| `systemd/codex-auth-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/codex-auth-watch.service.d/60-python-padenie-70.conf` | 0644 root:root | systemd (непойманное исключение — код 70, юнит failed) |
| `systemd/codex-auth-watch.timer` | `/etc/systemd/system/codex-auth-watch.timer` | 0644 root:root | systemd; `*:50 UTC`, `OnBootSec=15min` |
| `systemd/codex-katalog-watch.service` | `/etc/systemd/system/codex-katalog-watch.service` | 0644 root:root | systemd; `SuccessExitStatus=1`, предел 300 с |
| `systemd/codex-katalog-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/codex-katalog-watch.service.d/60-python-padenie-70.conf` | 0644 root:root | systemd |
| `systemd/codex-katalog-watch.timer` | `/etc/systemd/system/codex-katalog-watch.timer` | 0644 root:root | systemd; ежедневно 07:10 UTC |
| `systemd/codex-limit-watch.service` | `/etc/systemd/system/codex-limit-watch.service` | 0644 root:root | systemd; root, `StateDirectory=codex-limit-watch` (0700), предел 420 с |
| `systemd/codex-limit-watch.timer` | `/etc/systemd/system/codex-limit-watch.timer` | 0644 root:root | systemd; `*:03/10` UTC, `OnBootSec=5min` |
| `systemd/codex-obnovitel.service` | `/etc/systemd/system/codex-obnovitel.service` | 0644 root:root | systemd; пути подписки 3 в `Environment=`, `SuccessExitStatus=10 4` |
| `systemd/codex-obnovitel.timer` | `/etc/systemd/system/codex-obnovitel.timer` | 0644 root:root | systemd; `00/6:20` UTC |
| `systemd/codex-obnovitel-4.service` | `/etc/systemd/system/codex-obnovitel-4.service` | 0644 root:root | systemd; пути подписки 4, `SuccessExitStatus=10 4` |
| `systemd/codex-obnovitel-4.timer` | `/etc/systemd/system/codex-obnovitel-4.timer` | 0644 root:root | systemd; `00/6:35` UTC |
| `systemd/pereklyuchatel-podpiski@.service` | `/etc/systemd/system/pereklyuchatel-podpiski@.service` | 0644 root:root | шаблон; экземпляр `1`, `2`, `1-force`, `2-force` разрешён `agent-switch` в sudoers, из Telegram не зовётся |
| `systemd/sadik-komandy.service` | `/etc/systemd/system/sadik-komandy.service` | 0644 root:root | systemd; постоянная, `Restart=always`, `ProtectSystem=strict` |
| `systemd/sadik-switch@.service` | `/etc/systemd/system/sadik-switch@.service` | 0644 root:root | шаблон; экземпляр запускает приёмник `sudo -n systemctl start --wait` |
| `systemd/svesti-dostup-watch.service` | `/etc/systemd/system/svesti-dostup-watch.service` | 0644 root:root | systemd; `SuccessExitStatus=1` |
| `systemd/svesti-dostup-watch.timer` | `/etc/systemd/system/svesti-dostup-watch.timer` | 0644 root:root | systemd; `*:25 UTC` |

Не ставятся: `README.md`, `CHANGELOG.md` (в записи реестра — `not_installed`). В test/ пакета есть stend-audit-kraev.py, stend-b2023-receiver.py и две фикстуры приёмника; исторические стенды переключателей/ACL также доступны в dsh-obhod-stendov (см. «Проверка»).

Вне пакета, но нужны ему: учётка и группа `agent-switch`; `/etc/sudoers.d/sadik-switch` (разрешает `agent-switch` ровно `systemctl start --wait` экземпляров `sadik-switch@{a,b,1,2,sss,sss-on}` и `pereklyuchatel-podpiski@{1,2,1-force,2-force}`); токены и настройки шлюзов в `/etc/claude-oauth/` (`token-podpiska-<N>`, `instance-<агент>.env`, `codex-podpiska-<N>/auth.json` и `polnyj/auth.json`); токен `/etc/dsh-alert.token`, единый ID `/etc/vladelec/telegram-id` и `/usr/local/bin/vladelec-tg-id`; выключатель автопереключения `/etc/codex-limit/nastrojka.json`; `/usr/local/bin/dsh-alert`, `/usr/local/bin/agent-alert`, `/usr/local/bin/python-padenie-70`, `/usr/local/libexec/agent-hod/hod-sluzhby`, `/usr/local/bin/agent-registry`, бинарь Codex в `/opt/claude-oauth/sdk-runtime/`; программы `setfacl`/`getfacl`, `setpriv`, `runuser`, `journalctl`, Python 3 с PyYAML.

## Команды владельца и sudoers

| Telegram | Экземпляр | Действие |
|---|---|---|
| `/switch-a` | `sadik-switch@a.service` | Claude: следующая общая подписка, со штатным заслоном |
| `/switch-1` | `sadik-switch@1.service` | Claude: следующая общая подписка с force; ожидание конца хода остаётся |
| `/switch-b` | `sadik-switch@b.service` | Codex: toggle со штатным заслоном |
| `/switch-2` | `sadik-switch@2.service` | Codex: toggle-force |
| `/sss` | `sadik-switch@sss.service` | Закрыть чат сайта: файл `/var/lib/sajt-chat/zakryto` |
| `/sss_on` | `sadik-switch@sss-on.service` | Открыть чат сайта: снять тот же файл |

Приёмник принимает только private-сообщение владельца без доводов. `/sss_on` в Telegram содержит подчёркивание, экземпляр `sss-on` — дефис. Шаблоны команд не передаются shell. Состояние чата читает адаптер `sajt-chat`; state обязан быть обычным файлом. Каталог, ссылка или ошибка ФС дают именованный отказ кодом 2, не признак «чат уже закрыт». Приёмник возвращает свежий итог из `/var/lib/sadik-switch/`, не прежний результат.

Внешний `/etc/sudoers.d/sadik-switch` устанавливает администратор (`root:root`, 0440). Минимальный допуск для этих шести команд — **точные argv**, без wildcard и shell-скобок:

```sudoers
agent-switch ALL=(root) NOPASSWD: /usr/bin/systemctl start --wait sadik-switch@a.service, /usr/bin/systemctl start --wait sadik-switch@1.service, /usr/bin/systemctl start --wait sadik-switch@b.service, /usr/bin/systemctl start --wait sadik-switch@2.service, /usr/bin/systemctl start --wait sadik-switch@sss.service, /usr/bin/systemctl start --wait sadik-switch@sss-on.service
```

Проверка подготовленного файла до установки: `visudo -cf <файл>`. Прежние разрешения `pereklyuchatel-podpiski@{1,2,1-force,2-force}` относятся к внутреннему совместимому интерфейсу и отдельно сохраняются там, где ещё есть его вызывающий; текущие Telegram-команды идут через `sadik-switch@`. Этот пример не снимает существующий допуск и не создаёт учётку `agent-switch`.

## Установка

Ставят у нас монтажом по воротам из выгрузки метки `dsh-podpiski-v<номер>` (текущая версия — заголовок `CHANGELOG.md`). `smontirovat-fajly` сам снимает страховку боевых файлов; по умолчанию это прогон, в бой пишет только `--v-boj`. Пути файлов — относительно каталога кандидата и боевого каталога одновременно, поэтому каталог берётся по корню раскладки:

```bash
P=<выгрузка метки>/packages/dsh-podpiski
# 1) план без записи
sudo smontirovat-fajly --punkt <пункт> --progon "$P" /usr/local sbin/pereklyuchatel-codex sbin/codex-limit-watch
# 2) в бой: исполняемые (sbin/, libexec/ → /usr/local), настройка, юниты
sudo smontirovat-fajly --punkt <пункт> --v-boj "$P" /usr/local sbin/<файл> libexec/<файл> …
sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/etc" /etc default/pereklyuchatel-podpiski-limity
sudo smontirovat-fajly --punkt <пункт> --v-boj "$P/systemd" /etc/systemd/system <имя>.service <имя>.timer …
# 3) юниты
sudo systemctl daemon-reload
sudo systemctl enable --now codex-auth-watch.timer codex-katalog-watch.timer codex-limit-watch.timer \
     codex-obnovitel.timer codex-obnovitel-4.timer sadik-komandy.service
sudo systemctl enable --now svesti-dostup-watch.timer   # только после такта 2 B-N-1621 «ПЕРЕШЛО» и сверки ACL
```

Новый файл, которого ещё нет в бою, `smontirovat-fajly` ставит только с `--novyj --mode=<режим> --owner=0:0`; режимы — из таблицы выше. После монтажа в записи `dsh-podpiski` переводятся `version` (вывод её `installed_check`) и `derevo.ref`.

Порядок, который важен:

- `etc/default/pereklyuchatel-podpiski-limity` ставится вместе с читателем или раньше: без файла читатель отвечает «не измерено» (код 20), и переключение Claude проходит только с `force`.
- `svesti-dostup-watch.timer` до подтверждённого такта 2 B-N-1621 «ПЕРЕШЛО» остаётся выключенным. После сведения ACL «своя подписка» назначенная рука проверяет `svesti-dostup-podpisok --proverit`, затем отдельно включает таймер; до перехода проверка красная по построению, часовая тревога не говорит о новом отказе.
- Новый Codex-шлюз вписывается в перечень домов `DOMA` трёх файлов сразу — `pereklyuchatel-codex`, `codex-limit-watch`, `codex-auth-watch` — и ставится после того, как юнит шлюза поднят: `codex-auth-watch` о не загруженном юните тревожит каждым прогоном, переключатель без живого шлюза отказывает в `toggle`.
- Любой `chmod`/`chgrp`/`install`/`cp` файла токена сбрасывает маску ACL — следом `sudo svesti-dostup-podpisok --svesti`.

Снятие юнита — `systemctl mask` (правило фермы): юнит с файлом в `/etc/systemd/system` mask не примет, поэтому файл переносится в страховку (`mv`), затем `systemctl daemon-reload`, `systemctl mask <юнит>`; вернуть — `unmask` и файл на место.

## Внешние зависимости

| Зависимость | Источник/назначение | Когда нужна |
|---|---|---|
| Python 3, sqlite3, PyYAML (`python3-yaml`); Bash/coreutils, `timeout`, `journalctl`, `systemctl` | ОС; разбор реестра, процессы, журнал | Для соответствующих скриптов; Python3 stdlib содержит sqlite3 |
| `sudo`, `runuser`, `setpriv` (util-linux), `getfacl`/`setfacl` (acl) | ОС; точный вызов root-исполнителя и проверка чтения от учётки шлюза | Приёмник, переключатели, права токенов |
| `/usr/local/bin/agent-registry`, `/etc/agent-registry/agents.yaml` | a2a-bus; `namerenie.podpiska`, модель/окно и состав агентов | Переключатель Claude, связки, watcher каталога |
| `/usr/local/bin/agent-alert` | dsh-trevogi; доставка тревог | Сторожа, обновитель, переключатель Codex |
| `/usr/local/bin/dsh-alert` | dsh-storozha-sadik | Переключатель Claude |
| `/usr/local/bin/python-padenie-70` | dsh-storozha-mashiny | Drop-in сторожей auth/catalog; traceback становится отказом юнита |
| `/usr/local/bin/vladelec-tg-id`, `/etc/vladelec/telegram-id` | dsh-storozha-sadik; доверенная общая настройка владельца | Приёмник; ID по умолчанию нет |
| `/usr/local/libexec/agent-hod/hod-sluzhby` | dsh-podyom; измерение состояния хода | Ожидание конца хода перед рестартом Claude |
| `/var/lib/sadik-watch/otkaz-limita-*` | dsh-storozha-sadik, sadik-watch | Локальный источник лимитного заслона Claude |
| `/var/lib/dsh-limity/limity.db`, читатель и его `/etc/default` | dsh-limity и этот пакет | Второй источник заслона Claude |
| Шлюзы, их учётки/юниты, `/etc/claude-oauth/` и homes Codex | dsh-subscription-gateway и раскладка машины | Реальные переключения/сверка ACL; токены создаёт владелец окна |
| Codex app-server `/opt/claude-oauth/sdk-runtime/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex` (`CODEX_OBN_BIN` у обновителя), JWT access и отдельный полный носитель | Установленный SDK/runtime | Обновитель и замер лимита; полный refresh не отдаётся шлюзам |
| Учётка `agent-switch`, sudoers выше, `/etc/dsh-alert.token` | Развёртывание машины | Приёмник команд владельца |

Отсутствующая зависимость не означает «квота свободна». Собственных npm-зависимостей и автоматического установщика у пакета нет; изменять ACL, токены, sudoers и живые службы может только назначенная рука окна.

## Настройка

Настройки: правило свежести, выключатель автопереключения Codex, окружение юнитов обновителя и поля реестра. Таблица различает штатные параметры окружения и перечисленные подмены, которым нужен *_STEND=1. Не перечисленные здесь параметры сверяют по исходнику; замок подмен не является фильтром всего окружения.

| что | где задаётся | умолчание | смысл |
|---|---|---|---|
| `ISCHERPANA_DOLYA_OT` | `/etc/default/pereklyuchatel-podpiski-limity` | `1.0` | доля, с которой подписка Claude «исчерпана» (пока не прошёл сброс) |
| `SVOBODNA_5CH_DOLYA_MENSHE`, `SVOBODNA_5CH_VOZRAST_MIN` | там же | `0.80`, `130` | «свободна» по окну 5 ч: доля меньше и замер не старше, мин |
| `SVOBODNA_7D_DOLYA_MENSHE`, `SVOBODNA_7D_VOZRAST_MIN` | там же | `0.90`, `6*60` | то же по окну 7 дней. Значение — число или произведение чисел; нет файла, ключа, лишний ключ, не та форма — «не измерено» |
| `{"avto": true}` | `/etc/codex-limit/nastrojka.json` | нет файла — ВЫКЛ | `codex-limit-watch` сам зовёт `pereklyuchatel-codex <N>`; выкл — только тревога «пора переключить» |
| `CODEX_OBN_POLNYJ`, `CODEX_OBN_PROIZV`, `CODEX_OBN_DOM`, `CODEX_OBN_ZAMOK`, `CODEX_OBN_SLED` | `Environment=` юнитов `codex-obnovitel{,-4}.service` | умолчаний нет — пусто → отказ, код 3 | полный носитель, производный файл для шлюзов, дом обновителя, замок, след прогона — свои у каждой подписки |
| `CODEX_OBN_POROG_CH` | окружение юнита | `72` | обновлять, когда до конца access меньше стольких часов |
| `CODEX_OBN_VNEOCH_MIN` | окружение юнита | `60` | внеочередной refresh по флагу `<дом>/vneocherednoj` — не чаще раза в N мин (отметка попытки — mtime `<дом>/vneocherednoj.popytka`). Флаг ставит `codex-limit-watch`, когда сервер ответил 401 на замер лимита подписки (`/var/lib/codex-obnovitel/podpiska-<N>/vneocherednoj`); он же сразу запускает `systemctl start --no-block codex-obnovitel.service` (подписка 3) или `codex-obnovitel-4.service` (подписка 4) и выходит кодом 1. При флаге порог `CODEX_OBN_POROG_CH` не применяется; снимает флаг обновитель — только после удачного refresh и пробного запроса под новым access, иначе тревога и флаг остаётся |
| `CODEX_OBN_PREDEL_S`, `CODEX_OBN_BIN`, `CODEX_OBN_ALERT` | окружение юнита | `240`, бинарь Codex в `/opt/claude-oauth/sdk-runtime/…`, `/usr/local/bin/agent-alert` | ожидание ответа app-server; какой Codex звать; канал тревог |
| `mashina.raskladka_obshchee.osnova.codex.predel_servera` | `/etc/agent-registry/agents.yaml` | нет — слепота | предел окна сервера, с которым `codex-katalog-watch` сверяет окна шлюзов |
| `namerenie.podpiska` агента | `/etc/agent-registry/agents.yaml` | — | `obshchaya-claude` — агент в общем переключении Claude; `podpiska-N` — своя, не трогается; иное — отказ |
| `CKW_RUNTIME`, `CKW_SHLYUZY`, `CKW_PAMYAT`, `CKW_REESTR`, `AGENT_ALERT_BIN` | окружение `codex-katalog-watch` | `/opt/claude-oauth/sdk-runtime/node_modules/@openai`, `/var/lib/coder-gateway-*/codex-home`, `/var/lib/codex-katalog-watch/pamyat.json`, `/etc/agent-registry/agents.yaml`, `/usr/local/bin/agent-alert` | подмены только с `CKW_STEND=1`; без ключа игнорируются с именем переменной, иное значение ключа — отказ 2 до действий |
| `AGENTS_REGISTRY`, `KATALOG_KLYUCHEJ`, `SVYAZKI_SVESTI` | окружение `svyazki-podpisok` | `/etc/agent-registry/agents.yaml`, `/etc/claude-oauth`, — | подмены только с `SVYAZKI_STEND=1`; без ключа игнорируются, иное значение — отказ 2. При подставном каталоге helper SVYAZKI_SVESTI обязателен |
| `CODEX_AUTH_JSON` | окружение `codex-limits-measure.py` | `/var/lib/coder-gateway-alfa/codex-home/auth.json` | чей `auth.json` мерить |
| `SWITCH_STEND=1` + `SWITCH_*` · `PK_STEND=1` + `PK_*` · `CLW_STEND=1` + `CLW_*` · `CODEX_WATCH_STEND=1` + `CODEX_WATCH_*` · `SDP_STEND=1` + `SDP_*` · `SDW_STEND=1` + `SDW_*` · `SADIK_STEND=1` + `SADIK_*`, `SADIK_EXEC_*` | окружение | ключ пуст — бой | точки подмены для стендов. Без ключа подмены игнорируются со строкой «ИГНОРИРУЮ» (у `svesti-dostup-watch` — отказ 2); ключ не `1` — отказ 2. Стенд переключателей обязан подменить и `svesti-dostup-podpisok` (`SWITCH_SVESTI`, `PK_SVESTI`), иначе отказ 2; стенд переключателя Claude (`SWITCH_STEND=1`) обязан подменить ещё и реестр агентов (`SWITCH_REGISTRY`) — без него отказ 2 «стенд судил бы своих агентов по БОЕВОМУ реестру», ничего не тронуто |

Константы в коде (меняются правкой и новым номером пакета): переключатель Claude — не чаще раза в 30 с, ожидание конца хода 600 с на весь запуск, страховки env в `/var/backups/montazh/pereklyuchatel-podpiski/`, хранится 10 прогонов; `codex-limit-watch` — «выбрана» от 95 %, предупреждение от 80 %, гистерезис 2 п.п., автопереключение не чаще раза в час и не больше 3 за сутки, слепота после 3 неудачных прогонов подряд (ответ сервера 401 — тревога «ОТОЗВАН» в первом же прогоне, раз на эпизод, и код 1; в `codex-limit-watch.service` нет `SuccessExitStatus=1`, поэтому такой прогон помечает юнит failed); `codex-auth-watch` — запас срока access 48 ч, след обновителя не старше 26 ч; `pereklyuchatel-codex` в `toggle` — замер лимита не старше 900 с; перечни домов шлюзов `DOMA` — в коде трёх файлов.

Доводы:

| команда | доводы |
|---|---|
| `pereklyuchatel-podpiski` | `[1\|2\|3] [force] [tiho]`; формы N-force — синоним цели+force, вторая цель запрещена (код 2); без цели — следующая по кругу от подписки первого общего шлюза |
| `pereklyuchatel-codex` | `3\|4\|toggle\|toggle-force` — все Codex-шлюзы; `3\|4 <агент> …` — только названные (`alfa`, `beta`, `gamma`, `marc`, `anna`) |
| `svesti-dostup-podpisok` | `--dobavit [--codex N]` · `--svesti` · `--proverit` · `--chtenie [--bez-gruppy G]` |
| `svyazki-podpisok` | `pokazat` · `razlozhit [--ustanovit]` (без `--ustanovit` — сухой прогон) |
| `pereklyuchatel-podpiski-limity.py` | `1\|2\|3 [--baza <файл>] [--nastrojka <файл>]`; печатает `free\|blocked\|unknown<TAB>причина` |
| `codex-compaction-vyborka` | `<имя> <юнит>` (`[a-z]+`, `coder-gateway-<имя>.service` или `coder-gateway@<имя>.service`) |
| `sadik-switch-exec` | ровно один: `1`, `a`, `2`, `b`, `sss`, `sss-on` |
| `codex-auth-watch`, `codex-katalog-watch`, `codex-limit-watch`, `codex-obnovitel` | без доводов; любой довод — отказ (код 2, у `codex-obnovitel` — код 3) |
| `svesti-dostup-watch`, `sadik-komandy-priyomnik` | без доводов; доводы не проверяются и молча пропускаются |

## Коды выхода

Код 0 не подтверждает доставку тревоги или фактическое переключение сам по себе: читай итог и сверку. Интерфейсы здесь описаны по исходникам; ограничения обработки ошибок перечислены ниже.

| Программа | Документированные коды |
|---|---|
| `pereklyuchatel-podpiski` | 0 — переключено/уже на цели; 1 — ошибка переключения или откат; 2 — негодный ввод/настройка стенда; 3 — слишком часто; 4 — состав шлюзов/реестр не установлен; 5 — лимитный заслон; 6 — отметку частоты не записать; 7 — часть занятых/неизмеренных не переключена |
| `pereklyuchatel-codex` | 0 — переключено/уже на цели; 1 — сверка не сошлась, откат; 2 — отказ до смены; 3 — откат тоже не удался |
| `svesti-dostup-podpisok` | 0 — сошлось/сделано; 1 — расхождение либо чтение после записи не сошлось; 2 — отказ/слепота; 3 — getfacl/setfacl отказали |
| `svesti-dostup-watch` | 0 — зелёное; 1 — красное, тревога отправлена либо повтор подавлен; 2 — помощник отказал/слеп; 3 — тревога не доставлена |
| `svyazki-podpisok` | 0 — показано/план/разложено; 1 — расхождение/ошибка записи или провал отката; 2 — отказ, в том числе дубль env до записи или поздний дубль с успешным откатом собственных записей |
| `codex-auth-watch` | 0 — чисто; 1 — беда; 2 — слепота; 3 — тревога не доставлена |
| `codex-katalog-watch` | 0 — чисто либо прежняя слепота уже сообщена (различать stdout); 1 — изменение/слепота/отбой сообщены; 2 — отказ; 3 — весть не доставлена, память прежняя |
| `codex-obnovitel` | 0 — обновлено/подобрана копия; 10 — обновление не требовалось; 2 — отказ обновления; 3 — слепота носителя/дома/бинаря; 4 — другой прогон уже идёт; 5 — тревога не доставлена поверх 2/3 |
| `pereklyuchatel-podpiski-limity.py` | 0 — free; 10 — blocked; 20 — unknown, причина после TAB |

`codex-limit-watch`, `codex-compaction-vyborka`, ручной `codex-limits-measure.py`, `sadik-switch-exec` и постоянный приёмник имеют собственные исходы; точные ветки сверяются по шапке/итогу программы. Например, ответ сервера 401 у limit-watch — код 1 с тревогой «ОТОЗВАН», код 0 сам по себе не означает нулевого расхода. Неизвестные ключи, в том числе `--dry-run`, не заменяют штатные команды проверки.

## Договор кодовой части №11

- `codex-obnovitel` читает RPC собственным буфером байтов: уведомления перед ответом в одной записи не скрывают ответ. Ошибки full/derived/work-переноса дают след `otkaz`, тревогу и код 2; недоставка тревоги — 5. После частичного переноса полный файл может уже содержать новую пару: производный надо сверить/восстановить, не считать оба файла прежними. Успех 0 и «не требовалось» 10 сохранены.
- `svyazki-podpisok` заранее проверяет всю партию env на дубли GATEWAY_TOKEN_FILE, включая leading space/tab. Дубль до записи — 2; поздний дубль — без вызова helper, с восстановлением только собственных записей: 2 при удачном откате, 1 при отказе отката. Намеренные параллельные записи этой проверкой не координируются.
- `codex-compaction-vyborka`: негодный JSON и отсутствие строкового __CURSOR — отказ 2 до append. `pereklyuchatel-codex`: недоступный замок и tokens не-объект — отказ 2; остальные 0/1/3 сохранены.
- `SVYAZKI_STEND=1` и `CKW_STEND=1` нужны только названным подменам. Они не ограничивают PATH, намеренные действия root и все остальные переменные процесса. Кодовые audit-стенды теперь входят в `test/stend-audit-kraev.py`; прежние внешние стенды продолжают требовать подходящую среду.

## Проверка

Запись `dsh-podpiski` в `/etc/agent-registry/plugins.yaml`:

- `installed_check` — сумма 32 боевых файлов: `sha256sum <файлы> | LC_ALL=C sort -k2 | sha256sum | cut -c1-16`; должна совпасть с полем `version` (проверка всего реестра — `agent-plugins verify`);
- `healthcheck` — `systemctl is-active sadik-komandy.service codex-auth-watch.timer svesti-dostup-watch.timer`: три строки `active`.

Отдельными записями того же реестра стерегутся `codex-auth-watch`, `codex-obnovitel`, `codex-limit-watch`, `codex-katalog-watch` (свои `installed_check`/отпечатки по одному файлу).

Стенды лежат в пакете dsh-obhod-stendov и ставятся в `/opt/<главный агент>/workspace/dorabotki/`; ночной обход гоняет их по `perechen-boevyh-stendov.txt`. Предмет по умолчанию — **боевые** файлы; кандидата подают через `STEND_PREDMET` (или довод, где так сказано). Коды у всех: 0 — зелёное или совпало с эталоном, 1 — красное, 2 — слепота.

| стенд | предмет | учётка | что проверяет |
|---|---|---|---|
| `stendy/stend-pereklyuchatelya-podpiski.sh` | `pereklyuchatel-podpiski` | любая | смешанное без цели, откат первого не поднявшегося, заслон лимита и `force`, отметка частоты; всё на подставных env, systemctl и канале тревог |
| `stendy/stend-limity-pereklyuchatelya.py [читатель] [настройка]` | `pereklyuchatel-podpiski-limity.py` | любая | правило свежести на подставной базе той же схемы |
| `stendy/stend-switch-1.sh` (зовёт `stend-switch-1.py`) | приёмник → `sadik-switch-exec` → переключатели | — | все шесть команд Telegram на подставном Telegram и systemctl, включая `/sss` и `/sss_on` |
| `stendy/stend-priyomnik-itog.sh` | приёмник и файл итога | — | после успешного `/switch` следующий отказ доходит текстом отказа, а не прошлым «переключено» |
| `stendy/stend-pereklyuchatelya-codex.sh` | `pereklyuchatel-codex` | root | случаи G V R A F U K против эталона `stend-pereklyuchatelya-codex.etalon`; боевые ссылки только читаются |
| `stendy/stend-codex-limit-watch.sh` | `codex-limit-watch` | главный агент | все случаи против эталона `stend-codex-limit-watch.etalon` (подставной app-server `fake-codex.py`) |
| `stendy/stend-svesti-dostup-podpisok.sh` | `svesti-dostup-podpisok` | root | ACL на подставном каталоге токенов, чтение ядром от настоящих учёток шлюзов |
| `stendy/stend-svesti-dostup-watch.sh` | `svesti-dostup-watch` (`SDW_BIN`) | любая | красное, слепота, подавление повтора, недоставленная тревога |
| `stendy/stend-obnovitel-prava.sh` | `codex-obnovitel` (права производного) | root | новый производный наследует группу, режим и ACL заменяемого |
| `stend-svyazok-podpisok.sh` | установленный `svyazki-podpisok` | — | раскладка на подставном реестре и каталоге ключей |

Пакетный `test/stend-audit-kraev.py` проверяет в том числе compaction reader, прямой Python-вызов measure и новые края переключения/переноса. Для auth/catalog-watch отдельный полный runtime-стенд здесь не заявлен; приёмник дополнительно покрыт `test/stend-b2023-receiver.py`.

Руками, только чтение:

```bash
sudo svesti-dostup-podpisok --proverit         # 0 — шлюзы читают своё 1/1 и чужие 0/N
systemctl list-timers 'codex-*' svesti-dostup-watch.timer
journalctl -u codex-limit-watch -n 20 --no-pager
```

## Ограничения

- Переключатель Claude трогает только живые `claude-oauth-gateway@<агент>`, у которых в реестре `podpiska: obshchaya-claude` и в `/proc/<pid>/environ` есть `GATEWAY_TOKEN_FILE=…/token-podpiska-{1,2,3}`. Агента со своей подпиской не трогает; реестр не ответил или значение неизвестно — отказ до любого действия. Занятый агент (ход не кончился за 600 с на весь запуск) остаётся на прежней подписке — код 7. Заслон лимита — не резервирование квоты: после замера подписку может потратить другая машина; окна `seven_day_opus`/`seven_day_sonnet`/overage, premium-ограничения и баланс доплат не судятся. Подписка без свежих замеров — «не измерено», переход только с `force`.
- Переключатель Codex меняет ссылку `auth.json` в доме шлюза атомарно и не перезапускает шлюз: новая подписка — со следующего хода, идущий ход доживает на прежней. Переключает только дома из `DOMA` в коде; ход, упавший на 401 посреди смены, не отслеживается. При делёже или неполной карте домов авто заслона не действует; пороги известных подписок продолжают наблюдаться, отсутствующие ссылки именуются тревогой/отбоем по переходу. Ручная команда с выбором агентов по-прежнему требует все зарегистрированные дома: сначала восстановить ссылки, затем перенос.
- `codex-limit-watch` не ловит достижение лимита между прогонами (до 10 мин), иные ограничения сервера, кроме ответа `account/rateLimits/read`, ускорение расхода кредитов между замерами; при делёже прогноз и горизонты не строятся. Чистка сырого ответа в состоянии ловит только **имена** ключей (account*, email, user_id, token, auth): почта или идентификатор в значении под нейтральным именем пройдёт в состояние и дальше в выдачу.
- `codex-auth-watch` не знает, жив ли токен у сервера (это видят прогон обновителя и ответ 401 на замер `codex-limit-watch`), не видит хода, упавшего на авторизации между прогонами, шлюзов вне `DOMA` и подписок вне своего перечня. Пока юнит шлюза из `DOMA` не загружен, он тревожит каждым прогоном.
- `codex-obnovitel` не спасает, если процесс погиб между ответом сервера и полной записью копии: старый refresh списан, новый не лёг — нужен вход владельца. Смерть собственного таймера видит только `codex-auth-watch` по свежести следа.
- `codex-katalog-watch` смотрит только модели `gpt-6-astra` и `gpt-6.1-sol` и только `instructions_template`; смену каталога OpenAI не видит, пока ни один шлюз его не перечитал; физический предел `sol` не измерен.
- `svesti-dostup-podpisok` не закрывает доступ через sudo у агентов с sudo, копии токенов вне своих путей, `/run/credentials` гостя и чтение, уже сделанное процессом до отзыва. `svesti-dostup-watch` не видит правку, сделанную и исправленную между прогонами (окно — час); одинаковую тревогу повторяет не чаще раза в сутки.
- `svyazki-podpisok` не создаёт файлы ключей, не трогает их права, не перезапускает службы (строка действует со следующего подъёма экземпляра) и не проверяет, рабочий ли ключ; агентов с `obshchaya-claude` не трогает. Права файлов ключей разделяют агентов по неосторожности, а не от намеренного: у агентов машины есть sudo (принято владельцем, `/etc/claude-oauth/PRAVA-TOKENOV.md`).
- `codex-compaction-vyborka` не видит сжатия, о котором шлюз не написал строку `[codex-compaction]`; курсор, ушедший из журнала при ротации, останавливает выборку (её слепоту называет `turn_watch` по давности файла).
- `codex-limits-measure.py` имеет shebang Python3 -B и исполняется напрямую; явный `python3 /usr/local/libexec/codex-limits-measure.py` также допустим. Токен он не обновляет; при истёкшем access выходит кодом 3, не ходя в сеть.
- Приёмник принимает только личные сообщения владельца без аргументов; offset сдвигается до исполнения, поэтому команда, прерванная рестартом службы, не повторится. `/sss` и `/sss_on` идут мимо общего замка переключений и без проверки живости Варвары.
- Ключи *_STEND закрывают только перечисленные подмены; они не являются фильтром всего окружения root. PATH и штатные параметры программ остаются вне названных замков.
- Значения токенов ни одна программа пакета не печатает: только пути, сроки и хеши `sha256[:8]`.

## B-N-2023: владелец команд из общей настройки

`sadik-komandy-priyomnik` требует `/usr/local/bin/vladelec-tg-id` и доверенную `/etc/vladelec/telegram-id`, общего ID по умолчанию нет. Проверка на старте до токена и повторно перед каждой private-командой: изменённый ID применяется без кэширования; отсутствие/отказ читателя даёт явную причину, команда не исполняется. Startup отказ — код 2, ошибка при обработке обновления — отказ этой команды, offset не возвращается назад.

SADIK_OWNER_FILE сохранён только как явная подмена при SADIK_STEND=1 через VLADELEC_TG_ID_FILE; прямой VLADELEC_TG_ID_FILE имеет приоритет на стенде. В обычном режиме прежняя /etc/dsh-alert.owner не используется, root-исполнителя/проверки живости/права sudoers это изменение не меняет. Reader timeout — 3 с. Сам приёмник не является читателем отказа файла: независимая A2A-проверка — местный sadik-watch раз в 10 минут.

B-N-2023 R3: `sadik-komandy.service` имеет `RestartPreventExitStatus=2`: неверная настройка владельца останавливает автоматические рестарты. После исправления файла оператор запускает службу; независимый `sadik-watch` остаётся зовущим helper. `test/stend-b2023-receiver.py` запускает `receiver-itog.py` (8 проб) и `receiver-switch.py` (24) на копиях, в частном namespace и со стендовыми переключателями; root нужен только стенду. Боевые юниты, модели, токены и Telegram не вызываются.
