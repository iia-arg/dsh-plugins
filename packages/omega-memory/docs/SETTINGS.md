# Настройки omega-memory · omega-memory settings

Здесь перечислено каждое значение, которое пакет задаёт или на которое опирается. Источник — юнит `systemd/omega-memory.service`, образец строки набора агента в README и соглашение о корнях. Для настроек движка, которых в наших файлах нет, сказано «настройка первоисточника»; умолчание приводится только там, где оно прочитано в исходнике движка, с пометкой о версии.

This lists every value the package sets or relies on. Sources: the unit `systemd/omega-memory.service`, the sample agent preset row in the README, and the roots convention. Engine settings absent from our files are marked "upstream setting"; a default is given only where it was read in the engine source, with the version noted.

## Юнит systemd · systemd unit

| Имя · Name | Тип · Type | Значение в пакете · Package value | Что значит · Meaning | Что сломается при неверном · What breaks if wrong |
|---|---|---|---|---|
| `User` | имя учётки · account name | `omega` | учётка процесса · process account | учётка агента → база в его доме с `700`, другие агенты без памяти; нет учётки → служба не стартует · agent account → DB in its home with `700`, other agents lose memory; missing account → service fails to start |
| `Group` | имя группы · group name | `omega` | группа процесса · process group | нет группы → служба не стартует · missing group → service fails to start |
| `SupplementaryGroups` | имена групп · group names | `omega-users` | дополнительная группа процесса;0077 не даёт ей доступ к приватным файлам · supplementary process group;0077 grants it no private-file access | нет группы →216/GROUP; создавать перед стартом · missing group→216/GROUP; create before start |
| `UMask` | маска · mask | `0077` | новые файлы/каталоги только владельцу; существующие не исправляются · new files/directories owner-only; existing modes unchanged | group/world writable HOME/.omega даёт подменять имена независимо от600 базы; checker отказывает · writable HOME/.omega permits name substitution regardless of DB600; checker refuses |
| `WorkingDirectory` | путь · path | `/var/lib/omega` | рабочий каталог · working directory | каталога нет → служба не стартует (код 200/CHDIR) · directory missing → service fails to start (code 200/CHDIR) |
| `Environment=HOME` | путь · path | `/var/lib/omega` | от него движок кладёт базу (`.omega`) и модель (`.cache/omega/models`) · engine derives DB (`.omega`) and model (`.cache/omega/models`) paths from it | другой HOME → «пустая» база и модель не найдена → псевдо-эмбеддинги · different HOME → "empty" DB and model not found → pseudo-embeddings |
| `Environment=OMEGA_TRANSPORT` | строка · string | `http` | режим сервера; умолчание движка `stdio` · server mode; engine default `stdio` | не `http` → порт не слушается, агенты сервер не видят · not `http` → no port opened, agents cannot see the server |
| `Environment=OMEGA_IDLE_TIMEOUT` | целое, секунды · integer, seconds | `0` | сторож простоя; `0` = выключен; умолчание движка `3600` (исходник 1.5.19) · idle watchdog; `0` = off; engine default `3600` (source 1.5.19) | > 0 в версиях, где сторож работает и в http, → процесс выходит с кодом 0 после тишины, `Restart=on-failure` не поднимает · > 0 on versions where the watchdog also runs in http → process exits with code 0 after a quiet period, `Restart=on-failure` does not restart |
| `Environment=OMEGA_DEDUP_THRESHOLDS` | JSON-объект: тип записи → число 0.0–1.0 · JSON object: record type → number 0.0–1.0 | `{"lesson_learned":0.93,"decision":0.93,"memory":0.92}` | порог сходства по Жаккару (слова от 4 букв), СТРОГО выше которого новая запись того же типа и области, признанная пересказом, не сохраняется, а возвращает id прежней; не названные типы — на умолчаниях движка (1.5.19: `lesson_learned` 0.85, `decision` 0.80, `memory` 0.80). Читается один раз при загрузке модуля движка. Пример: `Environment="OMEGA_DEDUP_THRESHOLDS={\"decision\":0.95}"` · Jaccard similarity threshold (words of 4+ letters) STRICTLY above which a new record of the same type and scope, judged a restatement, is not saved and returns the earlier id; types not named keep engine defaults (1.5.19: `lesson_learned` 0.85, `decision` 0.80, `memory` 0.80). Read once at engine module load. Example: `Environment="OMEGA_DEDUP_THRESHOLDS={\"decision\":0.95}"` | неизвестный тип (например `lessons`), не число или значение вне 0..1 → `ValueError` движка (проверено вызовом функции разбора на 1.5.19; как именно это видно на живой службе, не проверялось); слишком низкий порог → разные записи склеиваются и теряются; `1.0` → склейка выключена для типа; правка без перезапуска → не действует · unknown type (e.g. `lessons`), non-number or value outside 0..1 → engine `ValueError` (checked by calling the parser on 1.5.19; how it shows on a live service was not checked); threshold too low → distinct records collapse and are lost; `1.0` → collapse off for the type; change without restart → no effect |
| `ExecStart` | командная строка · command line | `/opt/omega/venv/bin/python3 -m omega.server.mcp_server` | Python из venv движка и модуль MCP-сервера · venv Python and the MCP server module | неверный путь venv → 203/EXEC; неверный модуль → выход с ошибкой и перезапуски каждые 5 с · wrong venv path → 203/EXEC; wrong module → error exit and restarts every 5 s |
| `Type` | тип · type | `simple` | процесс не уходит в фон · process does not fork | `forking` → systemd ждёт форка, которого нет, и убивает по таймауту · `forking` → systemd waits for a fork that never comes and kills it on timeout |
| `Restart` | политика · policy | `on-failure` | перезапуск при ненулевом коде, сигнале, таймауте · restart on non-zero code, signal, timeout | чистый выход с кодом 0 НЕ перезапускается — это свойство значения, см. GUARDS · a clean exit with code 0 is NOT restarted — a property of this value, see GUARDS |
| `RestartSec` | секунды · seconds | `5` | пауза перед перезапуском · delay before restart | слишком мало при постоянной ошибке → упор в лимит частоты запусков systemd · too small with a persistent error → hits systemd's start rate limit |
| `After=` / `Wants=` | цели · targets | `network-online.target` | ждать готовности сети · wait for network readiness | серверу на петле не нужна; лишняя задержка старта, вреда нет · not needed for a loopback server; extra start delay, no harm |
| `WantedBy` | цель · target | `multi-user.target` | автозапуск при `enable` · autostart on `enable` | нет `enable` → после перезагрузки службы нет · no `enable` → no service after reboot |

## Строка MCP-клиента в наборе агента · MCP client row in the agent preset

Строка живёт в `agent.cordis.yml` набора агента, не в слое профиля. Читается при создании сессии.

The row lives in the agent preset `agent.cordis.yml`, not in the profile layer. It is read at session creation.

| Имя · Name | Тип · Type | Умолчание · Default | Значение в образце · Sample value | Что значит · Meaning | Что сломается при неверном · What breaks if wrong |
|---|---|---|---|---|---|
| `id` | строка · string | нет · none | `mcp-omega` | имя строки в наборе · row name in the preset | совпадёт с другой строкой → конфликт при сборке набора (поведение платформы не проверялось) · clash with another row → preset composition conflict (platform behaviour not verified) |
| `name` | имя плагина · plugin name | нет · none | `'@deepseek-ai/dsh-mcp-client'` | какой плагин грузить · which plugin to load | опечатка → плагин не найден, инструментов памяти нет · typo → plugin not found, no memory tools |
| `config.serverName` | строка · string | нет, обязательна · none, required | `omega` | пространство имён инструментов этого сервера · namespace for this server's tools | два клиента с одним именем → ошибка «serverName … already in use» · two clients with the same name → "serverName … already in use" error |
| `config.transport` | `stdio` \| `streamable-http` | нет, обязательна · none, required | `streamable-http` | способ связи с сервером · how to reach the server | `stdio` → схема клиента требует `command`, без него строка не проходит проверку; с ним клиент запустит свой процесс вместо службы · `stdio` → the client schema requires `command`, without it the row fails validation; with it the client spawns its own process instead of using the service |
| `config.url` | URL | нет, обязательна · none, required | `http://127.0.0.1:8377/mcp` | адрес MCP службы · service MCP endpoint | не тот порт или без `/mcp` → нет соединения; при `failOnStartupError: false` агент молча без памяти · wrong port or missing `/mcp` → no connection; with `failOnStartupError: false` the agent silently has no memory |
| `config.failOnStartupError` | булево · boolean | `false` | `false` | `true` — сбой подключения валит запуск плагина; `false` — сессия идёт без инструментов памяти · `true` — connection failure fails plugin startup; `false` — session continues without memory tools | `false` скрывает недоступность памяти; `true` при лежащей службе не даёт подняться набору · `false` hides unavailable memory; `true` with the service down prevents the preset from starting |
| `config.headers` | словарь строк · string map | `{}` | Authorization из переменной службы · Authorization from service environment | HTTP-заголовки к серверу, например `Authorization: Bearer <ключ>` · HTTP headers sent to the server, e.g. `Authorization: Bearer <key>` | движок требует ключ, а заголовка нет → 401 на каждый вызов · engine requires a key and no header → 401 on every call |

Умолчания `failOnStartupError` и `headers` прочитаны в схеме конфигурации одной версии MCP-клиента (0.2.0-rc.2). Клиент принимает и другие поля (`toolCallTimeoutMs`, `maxInstructionBytes`, `reconnect`); пакет их не задаёт — см. документацию клиента.

The defaults of `failOnStartupError` and `headers` were read in the config schema of one MCP client version (0.2.0-rc.2). The client accepts other fields too (`toolCallTimeoutMs`, `maxInstructionBytes`, `reconnect`); the package does not set them — see the client's documentation.

Значение не храните в agent.cordis.yml. Образец README использует `Authorization: !!js "'Bearer ' + process.env.OMEGA_MCP_API_KEY"`; шаблон sdk-claude/B.tmpl использует тот же механизм. В unit агента подключите root0600 EnvironmentFile=/etc/omega/mcp-klyuch.env, затем назначенная рука перезапускает процесс и создаёт новую сессию. systemd читает файл от root и передаёт значение в окружение процесса; агенту не нужен доступ к самому файлу. После запуска проверьте MCP-круг. Значение не передавайте командами `env KEY=<значение>` или аргументом curl.

Keep the value out of agent.cordis.yml. README uses `Authorization: !!js "'Bearer ' + process.env.OMEGA_MCP_API_KEY"`, matching sdk-claude/B.tmpl. Add the root0600 EnvironmentFile=/etc/omega/mcp-klyuch.env to the agent unit; the operator restarts the process and creates a new session. systemd reads the file as root and supplies its value to the process environment; the agent need not read that file. Verify the MCP round trip. Do not pass values as env KEY=<value> or curl arguments.

## Корень агента · Agent root

| Имя · Name | Тип · Type | Умолчание · Default | Пример · Example | Что значит · Meaning | Что сломается при неверном · What breaks if wrong |
|---|---|---|---|---|---|
| `entity_id` | строка · string | нет (настройка первоисточника) · none (upstream setting) | `agent-coordinator` | корень записей агента, передаётся при каждой записи и каждом поиске · the agent's record root, passed on every store and search | не задан → всё в одной куче; задан разный при записи и поиске → своё не находится · unset → everything in one pile; different on store and search → own records not found |

Корень вписывается в описание личности агента: «твой корень — X, передавай его при каждой записи и каждом поиске». Это соглашение, а не граница доступа.

The root is written into the agent's persona: "your root is X, pass it on every store and every search". It is a convention, not an access boundary.

## Настройки движка, на которые пакет опирается · Engine settings the package relies on

Это настройки первоисточника — смотрите документацию движка. Умолчания ниже прочитаны в исходнике версии 1.5.19 и могут отличаться в вашей.

These are upstream settings — see the engine's documentation. The defaults below were read in the source of version 1.5.19 and may differ in yours.

| Имя · Name | Умолчание (1.5.19) · Default (1.5.19) | Зачем пакету · Why the package cares |
|---|---|---|
| `OMEGA_HTTP_HOST` | `127.0.0.1` | откуда берётся петлевой адрес; юнит его не задаёт · where the loopback address comes from; the unit does not set it |
| `OMEGA_HTTP_PORT` | `8377` | откуда берётся порт в `url`; юнит его не задаёт · where the port in `url` comes from; the unit does not set it |
| `OMEGA_HOME` | `$HOME/.omega` | каталог базы и ключа · DB and key directory |
| `OMEGA_MCP_API_KEY` | нет; иначе файл `$OMEGA_HOME/mcp_api_key` · none; otherwise file `$OMEGA_HOME/mcp_api_key` | ключ для `Authorization: Bearer` · key for `Authorization: Bearer` |
| `OMEGA_EMBEDDING_MODEL_DIR` | `~/.cache/omega/models/<модель · model>-onnx` | где служба ищет модель · where the service looks for the model |
| `OMEGA_RSS_LIMIT_MB` | `8192` в режиме http · in http mode | выше лимита процесс выходит с кодом 0 · above it the process exits with code 0 |

`OMEGA_SEMANTIC_DEDUP_THRESHOLD` (умолчание 0.92 в исходнике 1.5.19) — отдельная проверка движка по смыслу; `OMEGA_DEDUP_THRESHOLDS` её не задаёт, юнит тоже.

`OMEGA_SEMANTIC_DEDUP_THRESHOLD` (default 0.92 in the 1.5.19 source) is a separate meaning-based engine check; `OMEGA_DEDUP_THRESHOLDS` does not set it, nor does the unit.

## Drop-in'ы службы · Service drop-ins

Пакет поставляет юнит и четыре drop-in как кандидатную конфигурацию; совпадение с установленной машиной проверяет монтажная рука. Числа и имена ниже относятся к поставляемым директивам.

The package ships the unit and four drop-ins as candidate configuration; the deployment operator verifies installed-machine equality. Values below describe the shipped directives.

| Drop-in · Drop-in | Что задаёт · What it sets | Без него · Without it |
|---|---|---|
| `15-omega-mcp-klyuch.conf` ключ доступа · access key | `EnvironmentFile=/etc/omega/mcp-klyuch.env` с ключом `/mcp`, права `600`, владелец root, без «-»: нет файла — служба не стартует · `EnvironmentFile=` with the `/mcp` key, mode `600`, owned by root, no "-": file missing — service fails to start | ключ берётся по правилам движка (см. таблицу выше) · the key follows engine rules (see table above) |
| `embedding.conf` модель эмбеддингов · embedding model | `OMEGA_EMBEDDING_MODEL`, `OMEGA_EMBEDDING_MODEL_DIR`, `OMEGA_EMBEDDING_DIM=1024`, `OMEGA_EMBEDDING_POOLING`, `OMEGA_EMBEDDING_PAD_TOKEN`, `OMEGA_EMBEDDING_PAD_ID` — многоязычная модель · a multilingual model | штатная модель, 384 измерения; база с векторами 1024 при этом не откроется — смена размерности требует переэмбеддинга · default model, 384 dims; a database with 1024-dim vectors will then not open — changing the dimension requires re-embedding |
| `offline.conf` без сети · offline | `HF_HUB_OFFLINE=1`, `OMEGA_RERANKER_AUTODOWNLOAD=0` | движок может пытаться скачать модель реранкера, если его включат · the engine may try to download the reranker model if it is enabled |
| `40-ort-telemetriya-vykl.conf` телеметрия onnxruntime · onnxruntime telemetry | `ORT_DISABLE_TELEMETRY=1` | onnxruntime пытается слать телеметрию наружу и копит очередь в домашнем каталоге службы (по комментарию файла) · onnxruntime tries to send telemetry out and queues it in the service home (per the file's comment) |

Описание drop-in'ов взято из их собственных комментариев (файлы в `systemd/omega-memory.service.d/`), поведение без них мы не воспроизводили.

The drop-in descriptions come from their own comments (files in `systemd/omega-memory.service.d/`); we have not reproduced behaviour without them.

Секреты (ключ) в командную строку не передавайте: она видна всем через `ps`. Если ключ нужен службе явно — через файл окружения systemd с правами `600`, а не через `Environment=` в юните.

Do not pass secrets (the key) on the command line: it is visible to everyone via `ps`. If the service needs the key explicitly, use a systemd environment file with mode `600`, not `Environment=` in the unit.

Файловый checker использует поддержанный профиль пакета: single-line EnvFile до64KiB, целиком quoted или обычные значения; итоговые HOME/model-path учитывают EnvironmentFile. Specifier, смешанные/многострочные кавычки, escape путей и изменения namespace/окружения вне профиля дают2. Проверка имени юнита — только группы.

File preflight supports this package profile: single-line EnvFile up to64KiB, whole quoted or plain values; effective HOME/model paths include EnvFile overrides. Specifiers, mixed/multiline quotes, path escapes and out-of-profile namespace/environment transformations return2. Unit-name mode checks groups only.
