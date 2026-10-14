# Настройки · Settings

Здесь собрана КАЖДАЯ настройка каждого модуля пакета: имя · тип · умолчание · смысл · пример · что сломается при неверном значении. Подробности и контекст — в разделе модуля `docs/moduli/<модуль>.md` (ссылка у заголовка каждого модуля).

This is EVERY setting of every module in the package: name · type · default · meaning · example · what breaks if wrong. Details and context are in the module section `docs/moduli/<module>.md` (linked at each module's heading).

## Где задаются настройки · Where settings are set

Модули с юнитом systemd, кроме `storozh-dvizhkov.sh`, читают только переменные окружения; задавайте их drop-in'ом `/etc/systemd/system/<юнит>.service.d/50-<host>.conf` (строки `Environment="КЛЮЧ=значение"` или `EnvironmentFile=`), затем `systemctl daemon-reload`. Проверка — `systemctl cat <юнит>`: что там не видно, того модуль не получит.

Modules with a systemd unit, except `storozh-dvizhkov.sh`, read only environment variables; set them with a drop-in `/etc/systemd/system/<unit>.service.d/50-<host>.conf` (`Environment="KEY=value"` lines or `EnvironmentFile=`), then `systemctl daemon-reload`. Check with `systemctl cat <unit>`: what is not shown there, the module will not get.

Три модуля (`agent-limits`, `kontekst-zamer`, `storozh-dvizhkov.sh`, последний имеет шаблонный юнит) берут свои настройки через `lib/nastrojka`: переменная окружения → файл настроек пакета → умолчание. Остальные переменные этих трёх модулей (помечены «только окружение») по-прежнему читаются только из окружения.

The three modules (`agent-limits`, `kontekst-zamer`, `storozh-dvizhkov.sh`, the last has a template unit) take their settings through `lib/nastrojka`: environment variable → package settings file → default. Their other variables (marked "env only") are still read from the environment only.

## Общий файл настроек пакета · Package settings file

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` | файл `КЛЮЧ=значение` · `KEY=value` file | нет файла — работают умолчания · no file — defaults apply | машинные значения модулей без юнита; читается одинаково из любой учётки, из `sudo` и из чужих служб · machine values for modules without a unit; reads the same from any account, `sudo` and other services | `SD_SHLYUZ=/srv/gateway/gateway.mjs` | путь существует, но не обычный читаемый файл → все три модуля отказывают с кодом 2 (не молчаливое умолчание); опечатка в имени ключа → сработает умолчание молча · path exists but is not a readable regular file → all three refuse with exit 2 (not a silent default); typo in a key name → the default applies silently |
| `DSH_STOROZHA_MASHINY_CONF` | путь · path | `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` | другой путь файла настроек — для стендов и проб · alternative settings file path — for stands and probes | `/tmp/stend/proba.conf` | указывает на несуществующий файл → работают умолчания; заданная в окружении, не переживает `sudo` · points to a missing file → defaults apply; set in the environment, it does not survive `sudo` |

Формат файла: строки `КЛЮЧ=значение`; пустые строки и строки с `#` в начале пропускаются; пробелы в начале строки допустимы; значение — всё после первого `=` до конца строки; комментарий — только с начала строки: « #» или «табуляция+#» внутри значения — громкий отказ с названием ключа, код 2 (не тихое склеивание пояснения); хвостовые пробелы и табуляции снимаются до кавычек; одна пара внешних кавычек `"…"` или `'…'` снимается; `\r` в конце снимается; при повторе ключа побеждает последняя строка; `КЛЮЧ=` с пустым значением считается незаданным. Подстановок нет: `$HOME`, `` `cmd` `` и `*` остаются буквами. Права — `0644 root:root`: секретов в файле нет, а читать его должны все вызывающие.

File format: `KEY=value` lines; empty lines and lines starting with `#` are skipped; leading blanks are allowed; the value is everything after the first `=` to the end of the line; a comment only starts a line: " #" or "tab+#" inside a value is a loud refusal naming the key, exit 2 (not a silent merge of the remark); trailing spaces and tabs are removed before quotes; one pair of outer quotes `"…"` or `'…'` is removed; a trailing `\r` is removed; on a repeated key the last line wins; `KEY=` with an empty value counts as unset. There is no expansion: `$HOME`, `` `cmd` `` and `*` stay literal. Permissions — `0644 root:root`: the file holds no secrets, and every caller must be able to read it.

Пустая переменная окружения (`КЛЮЧ=`) считается незаданной и уступает файлу — так же, как `${КЛЮЧ:-…}` в sh.

An empty environment variable (`KEY=`) counts as unset and yields to the file — the same as `${KEY:-…}` in sh.

## agent-limits · [moduli/agent-limits](moduli/agent-limits.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `AGENT_LIMITS_DIR` (окружение → файл → умолчание · env → file → default) | каталог · dir | `/etc/ai-agent-limits` | где лежат `obshchee.yml` и `<agent>.yml` · where `obshchee.yml` and `<agent>.yml` live | `/etc/ai-agent-limits` | нет каталога → `pokazhi` работает на умолчаниях кода и пишет «файла агента нет», `proverit` — СЛЕПОТА, код 2 · missing → `pokazhi` uses code defaults and says so, `proverit` → BLINDNESS, exit 2 |

Разделы файла пределов: `predely`, `politiki`, `prava`, `zamer` (квант `kvantTokenovNaHod`), `proverka` (`korniPotrebitelej` — где искать читателей ключей); верхний ключ `perehod_zavershyon: false` — файл ещё никем не читается.

Limit-file sections: `predely`, `politiki`, `prava`, `zamer` (quantum `kvantTokenovNaHod`), `proverka` (`korniPotrebitelej` — where to look for key readers); the top-level key `perehod_zavershyon: false` means nobody reads the file yet.

## agent-watchdog.sh · [moduli/agent-watchdog](moduli/agent-watchdog.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `WATCHDOG_CONF` | путь · path | `/etc/dsh-storozha-mashiny/agent-watchdog.conf` | файл настройки (shell) · settings file (shell) | `/etc/dsh-storozha-mashiny/agent-watchdog.conf` | нет файла → «настройки нет» в stderr, место на `/` меряется, выход 2 «проверка неполна» · missing → "настройки нет" on stderr, `/` space still checked, exit 2 "проверка неполна" |
| `WATCHDOG_STATE` | каталог · dir | `/var/lib/machine-watchdog` | отметки окон тишины · quiet-window stamps | `/var/lib/machine-watchdog` | не пишется → тревоги каждый прогон · not writable → alerts every run |
| `WATCHDOG_ALERT` | путь · path | `/usr/local/bin/agent-alert` | команда тревоги, текст HTML первым доводом · alert command, HTML text as first argument | `/usr/local/bin/agent-alert` | нет файла → «нет помощника… НЕ отправлена» в stdout, код 3, юнит failed; отказ доставки — также код 3, окно тишины не ставится · missing → "not sent" on stdout, exit 3, unit failed; failed delivery also exits 3 without setting the quiet window |
| `SERVICES` (в `WATCHDOG_CONF`) | список через пробел · space list | пусто · empty | юниты для `is-active`; `юнит:часы` — свежесть разовой службы · units to check; `unit:hours` — oneshot freshness | `"nginx.service backup.timer backup.service:26"` | опечатка → тревога «inactive/unknown»; часы не целое ≥1 → тревога «элемент негоден» · typo → "inactive/unknown" alert; bad hours → "item invalid" alert |
| `MEMORY_HEALTH_URL` (в `WATCHDOG_CONF`) | URL | пусто — не проверять · empty = skip | адрес проверки живости сервиса памяти · memory service health URL | `http://127.0.0.1:8377/health` | неверный → «память не отвечает» каждые `COOLDOWN_MIN` · wrong → "memory not answering" every `COOLDOWN_MIN` |
| `DISK_PATHS` (в `WATCHDOG_CONF`) | пути через пробел · path list | `/` | где смотреть место · where to check space | `"/ /var"` | несуществующий путь → СЛЕПОТА, код 2 · nonexistent → BLINDNESS, exit 2 |
| `DISK_MIN_FREE_PCT` (в `WATCHDOG_CONF`) | целое, % · int, % | `10` | ниже — тревога · below → alert | `15` | слишком высоко → постоянная тревога; 0 → место не сторожится · too high → constant alert; 0 → space not watched |
| `COOLDOWN_MIN` (в `WATCHDOG_CONF`) | целое, мин · int, min | `30` | окно тишины на одну беду · quiet window per problem | `60` | 0 → тревога каждые 5 минут · 0 → alert every 5 minutes |

## apt-updates-notify.sh · [moduli/apt-updates-notify](moduli/apt-updates-notify.md)

Все — переменные окружения; файл `APTUN_CONF` (shell) может их перекрыть. · All are environment variables; the `APTUN_CONF` file (shell) may override them.

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `APTUN_CONF` | путь · path | `/etc/apt-updates-notify/apt-updates-notify.conf` | необязательный файл настройки · optional settings file | `/etc/apt-updates-notify/apt-updates-notify.conf` | нет файла — умолчания · missing → defaults |
| `APTUN_STATE` | каталог · dir | `/var/lib/apt-updates-notify` | отметки · stamps | `/var/lib/apt-updates-notify` | не пишется → СЛЕПОТА, код 2 · not writable → BLINDNESS, exit 2 |
| `APTUN_ALERT` | путь · path | `/usr/local/bin/agent-alert` | канал тревоги · alert command | `/usr/local/bin/agent-alert` | нет файла или нет доступа учётки к каналу → «человеку НЕ сказано», код 2 · missing or no access → "human not told", exit 2 |
| `CHECK_CMD` | команда · command | `/usr/lib/update-notifier/apt-check` | счёт немедленных и security · immediate and security count | `/usr/lib/update-notifier/apt-check` | непонятный вывод → СЛЕПОТА · unknown output → BLINDNESS |
| `LIST_CMD` | команда · command | `apt list --upgradable` | полный список · full list | `apt list --upgradable` | нет строки `Listing` → СЛЕПОТА · no `Listing` line → BLINDNESS |
| `STAMP_FILE` | путь · path | `/var/lib/apt/periodic/update-success-stamp` | отметка обновления списков · list-refresh stamp | то же · same | нечитаема → СЛЕПОТА · unreadable → BLINDNESS |
| `STALE_DAYS` | целое, сут · int, days | `3` | старше — «СПИСКИ ПРОТУХЛИ», код 1 · older → "lists stale", exit 1 | `3` | слишком мало → ложные «протухли» · too small → false "stale" |
| `HEARTBEAT_DAYS` | целое, сут · int, days | `7` | молчал столько — сказать «жив» · silent this long → say "alive" | `7` | слишком велико → долгая тишина неотличима от смерти · too big → long silence looks like death |
| `RAW_LINES` / `RAW_CHARS` | целое · int | `12` / `200` | обрезка сырья в сообщении · raw output trimming | `12` / `200` | слишком велико → длинное сообщение · too big → a long message |

Учётка юнита в пакете — `User=nobody`; каналу тревоги обычно нужна учётка с доступом к токену — задайте `User=`/`Group=` drop-in'ом. · The unit runs as `User=nobody`; the alert channel usually needs an account with token access — set `User=`/`Group=` in a drop-in.

## dkms-kernel-coverage-check.sh · [moduli/dkms-kernel-coverage-check](moduli/dkms-kernel-coverage-check.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `DKMS_COVERAGE_MODULE` | строка · string | пусто — НЕ НАСТРОЕНО, код 2 · empty = NOT CONFIGURED, exit 2 | имя модуля в `dkms status` · module name in `dkms status` | `amneziawg` | пусто → «НЕ НАСТРОЕНО», код 2 (юнит failed); опечатка → dkms не знает модуля, слепота, код 2 · empty → "НЕ НАСТРОЕНО", exit 2 (unit failed); typo → dkms does not know the module, blindness, exit 2 |
| `DKMS_COVERAGE_ALERT_FALLBACK` | имя команды · command name | `agent-alert` | запасное имя канала, если `agent-alert` нет в `PATH` · fallback alert name | `legacy-alert` | нет ни одного → тревоги нет, только строка `logger` · neither → no alert, only a `logger` line |

## dsh-upstream-watch.sh · [moduli/dsh-upstream-watch](moduli/dsh-upstream-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `DSH_PAKET` | строка · string | `@deepseek-ai/dsh` | пакет в npm · npm package | `@deepseek-ai/dsh` | реестр молчит → код 2 · registry silent → exit 2 |
| `DSH_REPO` | `владелец/репо` · `owner/repo` | `deepseek-ai/deepseek-harness` | репозиторий описаний релизов · release-notes repository | `org/repo` | точный тег `v<версия>`/`<версия>` не получен или ответ не объект релиза → для новой альфы код 2 без записи версии; полученный объект с пустым body — признака безопасности нет · exact `v<version>`/`<version>` tag missing or invalid release object → a new alpha exits 2 without recording; valid object with an empty body has no security marker |
| `DSH_SOSTOYANIE` | путь · path | `/var/lib/dsh-upstream-watch/vidennye.txt` <!-- vorota-ob:dopusk=PUT --> | файл виденных версий · seen-versions file | `/var/lib/x/seen.txt` | не пишется → повтор тревог каждый день · not writable → repeated alerts daily |
| `DSH_ALERT` | команда · command | `agent-alert` из `PATH` · from `PATH` | канал тревоги · alert channel | `/usr/local/bin/agent-alert` | нет команды или доставка отказала → код 3, юнит failed; версия не записана, повтор · missing or failed delivery → exit 3, unit failed; version not recorded, retry |
| `DSH_BEZOPASNOST` | ERE | `security\|vulnerabilit\|CVE-\|безопасн\|уязвим` | признаки безопасности в описании · security markers in notes | `security\|CVE-` | негодный ERE → признак не найдётся никогда · invalid ERE → never found |
| `DSH_PACKAGE_JSON` | путь · path | пусто · empty | `package.json` приложения с установленной версией · app `package.json` with the installed version | `/opt/<agent-home>/app/package.json` | пусто → «НЕ НАСТРОЕНО», и свою версию один раз объявит новой · empty → "НЕ НАСТРОЕНО", own version announced as new once |

## dve-kopii-watch · [moduli/dve-kopii-watch](moduli/dve-kopii-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `DKW_OSNOVA` | путь · path | пусто = не настроено · empty = not configured | `node_modules` общего дерева плагинов · shared plugin tree `node_modules` | `/opt/<plugins>/node_modules` | нет каталога пакета → СЛЕПОТА по пакету, код 2 · missing → per-package blindness, exit 2 |
| `DKW_APPS` | `имя=каталог` через пробел · space-separated `name=dir` | пусто = не настроено · empty = not configured | `node_modules` установок агентов (фактические app служб) · agents' installations (actual service apps) | `a=/opt/<agent-home>/app/node_modules` | элемент без `=` → код 2; каталог, который не запускает ни одна служба → ложный красный; установки нет в списке → не сторожится · item without `=` → exit 2; a dir no service runs → false red; unlisted install → not watched |
| `DKW_SOSTOYANIE` | путь · path | `/var/lib/dve-kopii-watch/posledniy-ishod` | последний исход · last outcome | `/var/lib/dve-kopii-watch/posledniy-ishod` | не пишется → «снова совпадают» не скажется · not writable → "matched again" never said |
| `DKW_ALERT` | путь · path | `/usr/local/bin/agent-alert` | канал тревоги (`--plain -- текст`) · alert channel | `/usr/local/bin/agent-alert` | нет команды → СЛЕПОТА канала, код 2 · missing → channel blindness, exit 2 |
| `DKW_MASHINA` | строка · string | имя узла · node name | имя машины в тексте · machine name in text | `node1` | только текст · text only |
| `DKW_PODPIS` | строка · string | `dve-kopii-watch` | подпись «кто» в тексте · "who" signature | `dve-kopii-watch` | только текст · text only |

Доводы: `--osnova КАТАЛОГ`, повторяемый `--app ИМЯ=КАТАЛОГ`, `--tolko-pechat` (без тревоги/состояния), `--avto-montazh` (адресная отсрочка, код 4 без состояния/отбоя; пакетный юнит включает ключ). `MONTAZH_OKNO_BIN` — только окружение, путь `/usr/local/sbin/montazh-okno` из `dsh-montazh`, 5 с на вызов; отсутствие/неподтверждение не даёт отсрочку. `DKW_MO_RESCAN` — внутренний признак единственного повторного замера, не настройка. · Arguments: `--osnova DIR`, repeatable `--app NAME=DIR`, `--tolko-pechat` (no alert/state), `--avto-montazh` (scoped deferral, exit 4 without state/recovery writes; enabled by the packaged unit). `MONTAZH_OKNO_BIN` is env-only, default `/usr/local/sbin/montazh-okno` from `dsh-montazh`, 5 s per call; missing/unconfirmed means no deferral. `DKW_MO_RESCAN` is internal and permits one whole-pass retry.

## hvosty-vartmp-watch · [moduli/hvosty-vartmp-watch](moduli/hvosty-vartmp-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `HVT_PERECHEN` | путь · path | `/etc/hvosty-vartmp-watch/dolgozhiteli.txt` | перечень долгожителей · long-lived list | `/etc/hvosty-vartmp-watch/dolgozhiteli.txt` | нет файла → хвостом назовётся всё старое (громко, не вредно) · missing → every old entry reported (loud, harmless) |
| `VT_KOREN` | путь · path | `/var/tmp` | только для стенда: корень · test only: root | `/tmp/fake-root` | печатается строкой «ПОДМЕНА» · printed as "ПОДМЕНА" |
| `VT_PERECHEN` | путь · path | — | только для стенда, главнее `HVT_PERECHEN` · test only, beats `HVT_PERECHEN` | `/tmp/list.txt` | то же · same |
| `VT_ALERT` | путь · path | `/usr/local/bin/agent-alert` | только для стенда: канал · test only: channel | `/tmp/alert-stub` | то же · same |
| `VT_POROG_CH` | число, ч · number, h | `72` | только для стенда: порог · test only: threshold | `1` | не число → падение Python · not a number → Python crash |
| `VT_SEGODNYA` | дата · date | сегодня UTC · today UTC | только для стенда: «сегодня» · test only: "today" | `2030-01-01` | то же · same |

## inet6-poyavlenie-watch · [moduli/inet6-poyavlenie-watch](moduli/inet6-poyavlenie-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `INET6_STATE_DIR` | путь · path | `/var/lib/inet6-poyavlenie-watch` | каталог файла `est-inet6` · directory of the `est-inet6` file | `/var/lib/inet6-poyavlenie-watch` | не создаётся → анти-спам не работает · cannot be created → anti-spam breaks |

Канал — первая найденная в `PATH` команда `agent-alert`, иначе `claudeclaw-alert`; нет ни одной — строка `ALERT(no sink)` в журнал. · Channel — the first of `agent-alert`, then `claudeclaw-alert` in `PATH`; neither — an `ALERT(no sink)` journal line.

## kontekst-zamer · [moduli/kontekst-zamer](moduli/kontekst-zamer.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `KONTEKST_ZAMER_SHABLONY` (окружение → файл → умолчание · env → file → default) | glob через «:» · ":"-separated globs | `/opt/*/.dsh` | где искать каталоги `.dsh` агентов · where to look for agents' `.dsh` | `/opt/*/.dsh:/srv/agents/*/.dsh` | агенты вне шаблона молча не видны; ни одного кэша → код 2 · agents outside are silently missed; no cache → exit 2 |
| `KONTEKST_ZAMER_DOMA` (только окружение · env only) | пути через «:» · ":"-separated paths | пусто · empty | явный список домов, перекрывает шаблоны (стенды) · explicit homes, overrides patterns (stands) | `/tmp/fx/.dsh` | несуществующий дом → «кэш не прочитан» · missing home → "cache not read" |
| `KONTEKST_REESTR_PRIBOR` (только окружение · env only) | путь · path | `/usr/local/bin/agent-registry` | Python-модуль реестра с `zagruzit()` и `chitat_porog_d()` (пакет `a2a-bus`) · registry module (`a2a-bus` package) | `/usr/local/bin/agent-registry` | не загружается → у всех «порог D НЕ ИЗМЕРЕН» · fails to load → "D not measured" for all |
| `AGENTS_REGISTRY` (только окружение · env only) | путь · path | умолчание реестра · registry default | файл реестра агентов (читает модуль реестра) · agent registry file | `agents.yaml` | см. выше · see above |
| `KOMPAKT_NASTROJKI_KATALOG` (только окружение · env only) | путь · path | умолчание реестра · registry default | каталог файлов порогов D `<агент>.json` · directory of D files | `/etc/x/agents` | нет файла → «не измерено» · no file → "not measured" |

Прибор обычно зовёт от root другая служба: значение шаблонов кладите в файл настроек пакета, а не в окружение вызывающего. · Another service usually calls it as root: put the pattern value in the package settings file, not in the caller's environment.

## podyom-mimo-vorot-watch · [moduli/podyom-mimo-vorot-watch](moduli/podyom-mimo-vorot-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `PMV_PODYOM` | путь · path | `/usr/local/bin/podyom-uzla` | ворота подъёма, источник области (пакет `dsh-podyom`) · start gate, scope source (`dsh-podyom` package) | `/usr/local/bin/podyom-uzla` | нет/отказ → СЛЕПОТА с тревогой, код 2 · missing/failing → blindness with alert, exit 2 |
| `PMV_PRIBOR` | путь · path | `/usr/local/bin/kto-podnimal` | прибор «кто поднимал» (пакет `dsh-pribory`) · "who started it" probe (`dsh-pribory` package) | `/usr/local/bin/kto-podnimal` | не исполняем → СЛЕПОТА, код 2 · not executable → blindness, exit 2 |
| `PMV_ALERT` | путь · path | `/usr/local/bin/agent-alert` | канал тревоги · alert channel | `/usr/local/bin/agent-alert` | отказ → `dostavleno: net`, повтор · failure → `dostavleno: net`, repeat |
| `PMV_SOST` | путь · path | `/var/lib/podyom-mimo-vorot-watch/soobshcheno.txt` | что уже сказано · already said | то же · same | не заводится → СЛЕПОТА, код 2 · cannot create → blindness, exit 2 |
| `PMV_ITOG` | путь · path | `/var/lib/podyom-mimo-vorot-watch/last.json` | итог для проверки здоровья · result for a healthcheck | то же · same | не пишется → предупреждение в stdout · not writable → stdout warning |
| `PMV_OKNO` | строка `date -d` · string | `24 hours ago` | окно прибора · probe window | `6 hours ago` | прибор откажет → СЛЕПОТА по службе · probe fails → per-service blindness |
| `PMV_SLUZHBY` | список · list | вызов ворот · gate call | службы без `.service` (стенд) · services (stand) | `a b` | перекрывает область ворот · overrides the gate scope |
| `PMV_MASHINA` | строка · string | `hostname -s` | имя машины в тексте · machine name | `node1` | только текст · text only |

## predel-dliny-watch · [moduli/predel-dliny-watch](moduli/predel-dliny-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `UNIT` | имя юнита · unit name | пусто, обязательна · empty, required | юнит шлюза агента · agent gateway unit | `<gateway>@<agent>.service` | пусто → код 2; чужой юнит → «чисто» при 0 строк · empty → exit 2; wrong unit → "clean" with 0 lines |
| `KOMU` | имя агента · agent name | пусто, обязательна; в шаблоне `%i` · empty, required; `%i` in the template | ключ маркера и адресат письма · marker key and letter recipient | `<agent>` | пусто → код 2; нет в `PREDEL_YASHCHIKI` → после доставки владельцу код 2 и маркер, повтора нет · empty → exit 2; not in `PREDEL_YASHCHIKI` → owner told, exit 2 and marker, no repeat |
| `PREDEL_YASHCHIKI` | `имя=каталог` через пробел · space-separated `name=dir` | пусто · empty | входящие каталоги агентов · agents' inboxes | `a=/opt/<agent-home>/a2a/in` | адресата нет → после доставки владельцу код 2, маркер записан, повтора нет; доставка владельцу отказала → код 3 без маркера · recipient missing → owner told, exit 2, marker written, no repeat; owner delivery failed → exit 3, no marker |
| `PATTERN` | ERE | `Prompt is too long\|input_too_large\|Input exceeds the maximum length\|[(]perepolnenie:` | формулировки отказа · refusal wording | то же · same | негодный ERE → код 2; новая формулировка → пропуск · invalid → exit 2; new wording → missed |
| `OKNO_MIN` | минуты · minutes | `35` | окно чтения журнала · journal window | `35` | меньше периода таймера → отказы теряются · below timer period → refusals lost |
| `ALERT` | путь · path | `agent-alert` из `PATH`, иначе `/nonexistent` · from `PATH`, else `/nonexistent` | канал тревоги · alert channel | `/usr/local/bin/agent-alert` | не исполняем → `logger` «ALERT(no sink)» · not executable → `logger` "ALERT(no sink)" |
| `PREDEL_STATE_DIR` | путь · path | `/var/lib/predel-dliny-watch` | каталог маркеров · marker directory | `/var/lib/predel-dliny-watch` | не пишется → тревога повторяется · not writable → alert repeats |

## storozh-dvizhkov.sh · [moduli/storozh-dvizhkov](moduli/storozh-dvizhkov.md)

Все шесть — окружение → файл настроек пакета → умолчание. · All six — environment → package settings file → default.

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `SD_SHLYUZ` | путь · path | пусто = не настроено · empty = not configured | путь скрипта шлюза в командной строке node · gateway script path in the node command line | `/srv/gateway/gateway.mjs` | пусто → «НЕ НАСТРОЕНО», код 2; не тот путь → «СЛЕПОТА: шлюз не найден», код 2 · empty → exit 2; wrong → gateway not found, exit 2 |
| `SD_SHLYUZ_SLUZHBA` | юнит · unit | пусто · empty | (1.0.1) юнит конкретного шлюза — его MainPID; обязателен при нескольких шлюзах с одним скриптом · gateway unit (its MainPID); required with several gateways on one script | `<gateway>@<агент>.service` | нет MainPID или он не среди найденных шлюзов → слепота, код 2 · no MainPID or not among the matched gateways → blindness, exit 2 |
| `SD_SOSTOYANIE` | путь · path | `/var/lib/storozh-dvizhkov/sostoyanie` | отметка начала беды; каталог и файл принадлежат вызывающему, без чужой записи и без ссылок · trouble-start mark; caller-owned directory and file, no other write permissions or symlinks | `/var/lib/storozh-dvizhkov/mark` | не создать/записать или негодные владелец/тип/права → слепота, код 2; нечисловая/будущая дата сбрасывается на «сейчас» · create/write failure or invalid owner/type/permissions → blindness, exit 2; a nonnumeric/future date resets to now |
| `SD_MASHINA` | строка · string | `hostname -s` | имя машины в тексте тревоги · machine name in the alert | `node1` | только текст · text only |
| `SD_SLUZHBA_PLATFORMY` | имя юнита · unit name | `службы платформы` | имя юнита платформы: `LoadState=loaded` включает проверку доживших по MainPID и времени старта · platform unit: `LoadState=loaded` enables survivor checks using MainPID and start time | `<agent>.service` | не загружен (включая умолчание) → прежнее правило «движков больше одного»; загружен без MainPID → все движки дожившие · not loaded (including default) → legacy more-than-one rule; loaded without MainPID → all engines survive |
| `SD_PRIPISKA` | строка · string | пусто · empty | приписка к тревоге; `\n` — перевод строки · alert appendix; `\n` = newline | `Публикация сейчас закрыта обёрткой.` | только текст · text only |

Порог 300 с — в обоих режимах; норма — 0 доживших при загруженном юните платформы, иначе не больше 1 движка. Это числа в коде, не настройки. · Threshold 300 s in both modes; normal means 0 survivors with a loaded platform unit, otherwise at most 1 engine. These are code constants, not settings.

## yadro-predohranitel · [moduli/yadro-predohranitel](moduli/yadro-predohranitel.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `YP_TARGET_IP` | адрес · address | пусто — не действует · empty = inactive | адрес, обязанный отвечать после подъёма туннеля · address that must answer once the tunnel is up | `192.0.2.10` | пусто → код 2, перезагрузки нет; недостижимый и в исправном ядре → ЛОЖНЫЙ откат через 10 минут · empty → exit 2, no action; unreachable even in a good kernel → FALSE fallback after 10 minutes |
| `YP_DRY` | флаг · flag | пусто · empty | пробный прогон: всё, кроме перезагрузки, код 1 · dry run: everything but the reboot, exit 1 | `1` | забыт в бою → предохранитель не откатит никогда · left on in production → never falls back |

Путь метки `/var/lib/yadro-predohranitel/armed` и имя модуля `amneziawg` зашиты в коде. · The marker path `/var/lib/yadro-predohranitel/armed` and the module name `amneziawg` are fixed in the code.

## zadaniya-prervany-watch · [moduli/zadaniya-prervany-watch](moduli/zadaniya-prervany-watch.md)

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `ZPW_KOREN` | путь · path | пусто, обязательна · empty, required | дом агента, через щель которого уходит письмо · agent home whose outbox carries the letter | `/opt/<agent-home>` | пусто → код 2; неверный → отказ канала, код 1 · empty → exit 2; wrong → channel failure, exit 1 |
| `ZPW_ADRESAT` | слово · word | пусто, обязательна · empty, required | адресат в имени письма `dlya-<адресат>-…` · recipient in the letter name | `koordinatora` | пусто → код 2; неизвестный каналу → код 1 · empty → exit 2; unknown to the channel → exit 1 |
| `ZPW_SHAPKA` | строка · string | `<host> · zadaniya-prervany-watch (root, щель <ZPW_KOREN>) → координатору · …` | первая строка письма · first line of the letter | любая · any | только текст · text only |
| `ZPW_PRAVKA_SCHYOTA` | строка · string | `правки счёта статей` | имя правки секретаря со счётом статей · name of the secretary change with the article count | `v0.3.0` | только текст · text only |
| `ZPW_SOST` | путь · path | `/var/lib/zadaniya-prervany-watch` | состояние: отметки, письмо, зеркало · state: marks, letter, mirror | `/var/lib/zadaniya-prervany-watch` | не создаётся → код 2 · cannot create → exit 2 |
| `ZPW_REESTR_BIN` | путь · path | `/usr/local/bin/agent-registry` | реестр агентов (пакет `a2a-bus`) · agent registry (`a2a-bus` package) | `/usr/local/bin/agent-registry` | не читается → код 2 · unreadable → exit 2 |
| `ZPW_TELL_BIN` | путь · path | `/usr/local/bin/tell-komu` | канал писем (пакет `dsh-pochta`) · letter channel (`dsh-pochta` package) | `/usr/local/bin/tell-komu` | отказ → код 1, отметки не обновлены · failure → exit 1, marks kept |
| `ZPW_JOURNALCTL` | команда · command | `journalctl` | чтение журнала службы агента · agent service journal reader | `journalctl` | молчит → «записано: НЕ установлено» · silent → "written: not established" |
| `ZPW_SEYCHAS` | эпоха, с · epoch, s | `date +%s` | «сейчас» — только для стендов · "now" — stands only | `1700000000` | в бою → неверные возрасты заданий · in production → wrong task ages |

Пороги в коде: задание старше 3600 с, повтор через 86400 с, живая метка моложе 10800 с. · Thresholds in code: task older than 3600 s, repeat after 86400 s, live marker younger than 10800 s.
