# Настройки · Settings — dsh-pamyat-kompakt-dsh

Настройки пакета живут в пяти местах: конфиг движка в пресете агента (родные поля платформы), переменные окружения службы агента, файл настройки пакета (пути внешних команд и файла режима), файл режима Codex-маркера и постоянные в коде. Модель, промт, ключ и окно сводки настраиваются в соседнем пакете `dsh-pamyat-kompakt` — см. его `docs/SETTINGS.md`.

The package settings live in five places: the engine config in the agent preset (native platform fields), environment variables of the agent service, the package settings file (paths of external commands and of the mode file), the Codex marker mode file and constants in code. The summary model, prompt, key and window are configured in the sibling package `dsh-pamyat-kompakt` — see its `docs/SETTINGS.md`.

## Конфиг движка · Engine config

Это родной конфиг `BasicCompactionEngine` — пакет его не расширяет, но читает четыре поля сам. Пример — в README, раздел «Быстрый старт».

This is the native `BasicCompactionEngine` config — the package does not extend it but reads four fields itself. Example — in the README, "Quick start".

| Поле · Field | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | При неверном · If wrong |
|---|---|---|---|---|---|
| `thresholdRatio` | число (0,1) · number | платформы · platform's | доля окна, с которой давление считается порогом; пакет берёт её только для строк диагностики «выбрать нечего» · window share at which pressure counts as threshold; the package uses it only for "nothing to select" diagnostics | `0.8` | платформа отвергнет пресет (`retainRatio` обязан быть меньше) · the platform rejects the preset (`retainRatio` must be smaller) |
| `retainRatio` | число (0,1) · number | платформы · platform's | доля окна под дословный хвост; пакет ограничивает её половиной поверхности · window share for the verbatim tail; the package caps it at half the surface | `0.06` | слишком большое — раньше ловушка «сжатия нет», теперь хвост ½ поверхности · too large — formerly the "no compaction" trap, now tail = ½ surface |
| `retainTokens` | целое · integer | нет · none | явное удержание в токенах; если задано, используется вместо `окно × retainRatio` · explicit retention in tokens; if set, used instead of `window × retainRatio` | `60000` | больше поверхности — тоже срезается до ½ · larger than the surface — also cut to ½ |
| `modelPolicies` | массив · array | `[]` | политики под пару provider/model; для пары с политикой пакет НЕ меняет удержание (родной путь) · per provider/model policies; for a pair with a policy the package does NOT change retention (native path) | `[{provider, model, compactionRetries: 0}]` | — |
| `compactionRetries` | целое · integer | платформы · platform's | сколько повторных заходов делает платформа, если после сжатия давление выше порога; на маршруте Codex пакет останавливает повторы после первой успешной фиксации · how many repeated attempts the platform makes if pressure stays above threshold; on the Codex route the package stops retries after the first successful commit | `0` | — |

Пакет отдаёт свой действующий конфиг по событию `our/compaction-status` (его рассылает канальный плагин для ответа о состоянии сжатия).

The package reports its effective config on the `our/compaction-status` event (emitted by the channel plugin to answer about compaction status).

## Окружение · Environment

| Переменная · Variable | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | При неверном · If wrong |
|---|---|---|---|---|---|
| `KOMPAKT_AGENT` | строка `^[a-z][a-z0-9_-]*$` · string | нет · none | имя агента: ключ отметки продолжения, имя для реестра при аудите (и настройка соседа `dsh-pamyat-kompakt`) · agent name: marker key, name for the registry in the audit (and the sibling's setting) | `agent-1` | нет или негодное — аудит не запускается, отметка отказывает строкой «continuation marker refused: <код или имя ошибки>: <текст причины, до 200 знаков>» · missing or invalid — no audit, the marker refuses with "continuation marker refused: <error code or name>: <reason text, up to 200 characters>" |
| `KOMPAKT_MODEL` | строка · string | `deepseek-flash` (у соседа) · (sibling's) | этот пакет переменную НЕ читает: её читает сосед `dsh-pamyat-kompakt` при загрузке; подпись `model` в ответе платформе берётся из его экспорта `KOMPAKT_MODEL` — то есть совпадает с настоящей моделью запроса · this package does NOT read it: the sibling `dsh-pamyat-kompakt` reads it at load time; the `model` label in the answer to the platform comes from its `KOMPAKT_MODEL` export — i.e. it matches the real request model | — | сосед без экспорта — подпись «неизвестна (сосед не отдаёт KOMPAKT_MODEL)» · a sibling without the export — the label "неизвестна" (unknown) |
| `DSH_HOME` | путь · path | `$HOME/.dsh` | корень, под которым лежат метки тревог usage (`kompakt-dsh/usage-alerts`) · root for usage alert marks | `/opt/<agent-home>/.dsh` | нет ни `DSH_HOME`, ни `HOME` — тревога usage не отправляется, строка «метка недоступна» · neither set — the usage alert is not sent, line "mark unavailable" |
| `INVOCATION_ID` | строка · string | случайный UUID · random UUID | опознаватель запуска (ставит systemd): аудит отличает отметки прежних запусков от своих · run id (set by systemd): the audit tells earlier runs' markers from its own | задаёт systemd · set by systemd | — |

Переменные только для стендов: `DSH_TEST_APP` — каталог установки платформы, от которой стенды разрешают её пакеты (не задан — СЛЕПОТА стенда, код 2; путей к чьей-либо установке в стендах нет); `MARKER_INPUT_FIXTURE` — JSON с историческими входами для `stend-stop-komandy` (все обязаны НЕ распознаваться как «/stop»).

Stand-only variables: `DSH_TEST_APP` — the platform installation directory from which stands resolve its packages (unset — stand BLINDNESS, exit 2; stands carry no path to anyone's installation); `MARKER_INPUT_FIXTURE` — JSON with historical inputs for `stend-stop-komandy` (all must NOT be recognised as "/stop").

## Файл настройки пакета · Package settings file

Путь — `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf`, меняет его переменная `DSH_PAMYAT_KOMPAKT_DSH_CONF`. Строки `КЛЮЧ=значение`; комментарий — только строка, начинающаяся с `#`; при повторе ключа действует последнее вхождение. Порядок значения: переменная окружения с именем ключа → файл → умолчание. Умолчания — прежние пути, поэтому без файла поведение прежнее. Значение с « #» (пробел или таб перед `#`) и файл, который есть, но не читается, — громкий отказ при загрузке плагина с ключом или причиной (исключение, а не выход процесса: процесс — агент).

Path — `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf`, changed by `DSH_PAMYAT_KOMPAKT_DSH_CONF`. `KEY=value` lines; a comment is only a line starting with `#`; for a repeated key the last occurrence wins. Value order: environment variable named as the key → file → default. The defaults are the former paths, so without a file the behaviour is unchanged. A value with " #" (a space or tab before `#`) and a file that exists but cannot be read are a loud refusal at plugin load naming the key or the cause (an exception, not a process exit: the process is the agent).

| Ключ · Key | Умолчание · Default | Что значит · Meaning |
|---|---|---|
| `KOMPAKT_AGENT_ALERT` | `/usr/local/bin/agent-alert` | канал тревог владельцу · owner alert channel |
| `KOMPAKT_AGENT_REGISTRY` | `/usr/local/bin/agent-registry` | имя службы агента для аудита отметки · agent service name for the marker audit |
| `KOMPAKT_JOURNALCTL` | `/usr/bin/journalctl` | чтение журнала службы (и через `sudo -n`; путь `sudo` зашит — `/usr/bin/sudo`, ключа нет: где sudo в другом месте, повтор через sudo не состоится, аудит назовёт «unavailable») · service journal reader (also via `sudo -n`; the `sudo` path is fixed — `/usr/bin/sudo`, there is no key: where sudo lives elsewhere the sudo retry does not happen, the audit reports «unavailable») |
| `KOMPAKT_REZHIM_FAJL` | `/etc/dsh-pamyat/continuation-mode.json` | файл режима Codex-маркера · Codex marker mode file |

## Файл режима Codex-маркера · Codex marker mode file

Путь — ключ `KOMPAKT_REZHIM_FAJL` файла настройки пакета (умолчание `/etc/dsh-pamyat/continuation-mode.json`), файл общий для машины. Этот же файл читает шлюз подписки своим читателем, поэтому меняется он только в паузе (см. TROUBLESHOOTING).

The path is the `KOMPAKT_REZHIM_FAJL` key of the package settings file (default `/etc/dsh-pamyat/continuation-mode.json`); the file is machine-wide. The subscription gateway reads the same file with its own reader, so it is changed only during a pause (see TROUBLESHOOTING).

```json
{ "version": 1, "codex_marker": ["<agent>"] }
```

| Поле · Field | Тип · Type | Что значит · Meaning | При неверном · If wrong |
|---|---|---|---|
| `version` | ровно `1` · exactly `1` | версия формата · format version | исключение «invalid continuation mode»: отметка для Codex запрещена · exception: the Codex marker is refused |
| `codex_marker` | массив имён · array of names | агенты на Codex, которым включена отметка; имя вида `[a-z][a-z0-9_-]{0,31}`, перечня имён в коде нет · Codex agents with the marker enabled; a name of the form `[a-z][a-z0-9_-]{0,31}`, there is no name list in code | имя негодной формы или лишний ключ — то же исключение; правильное по форме чужое имя ни с кем не совпадёт · a badly formed name or an extra key — the same exception; a well-formed foreign name matches nobody |
| (файл · file) | ≤ 4096 байт · bytes | нет файла — Codex-маркер выключен для всех · no file — the Codex marker is off for everyone | больше 4096 байт — исключение · larger — exception |

Для маршрута Claude (`claude-oauth` + `claude-*`) отметка работает всегда, независимо от файла.

For the Claude route (`claude-oauth` + `claude-*`) the marker always works, regardless of the file.

## Постоянные в коде · Constants in code

| Имя · Name | Значение · Value | Где · Where | Что значит · Meaning |
|---|---|---|---|
| `DOLYA_POVERHNOSTI` | `0.5` | index.mjs | удержание не больше этой доли поверхности · retention at most this share of the surface |
| `PREDEL_USAGE_HODOV` | `3` | index.mjs | завершённых ходов без свежего usage до тревоги · completed turns without fresh usage before the alert |
| тревога agent-alert · agent-alert alert | 3 попытки × 20 с, паузы 5/15 с, процесс ≤ 100 с · 3 attempts × 20 s, pauses 5/15 s, process ≤ 100 s | index.mjs, marker-step.mjs | бюджет канала тревог · alert channel budget |
| `waitMs` | `120000` мс · ms | marker-step.mjs | срок принятия отметки при простое · marker acceptance deadline while idle |
| `flushMs` | `30000` мс · ms | marker-step.mjs | срок записи сессии на диск · session flush deadline |
| побудки · wakes | `2` | marker-step.mjs | больше двух побудок — `held_error` · more than two wakes — `held_error` |
| аудит · audit | реестр 2 с / 4096 Б; идентификатор службы — `systemctl show -p SyslogIdentifier -p ExecStart`, 2 с (пусто — basename пути `ExecStart`); журнал — только записи с полем `SYSLOG_IDENTIFIER=<ид>`, после сохранённого курсора, если он не позже прошлого запуска службы (сообщение systemd «Started»), иначе от прошлого запуска; не дальше 7 дней / 4 МиБ / 30 с на путь; при 0 отметок — сверка ид (`-n 1`, тот же предел) (до 184 с с запросом старта и сверкой; до 244 с при повторе за негодный курсор) · registry 2 s / 4096 B; service identifier — `systemctl show -p SyslogIdentifier -p ExecStart`, 2 s (empty — basename of the `ExecStart` path); journal — only entries with the `SYSLOG_IDENTIFIER=<id>` field, after the saved cursor if it is not later than the previous service start (systemd "Started" message), otherwise from the previous start; at most 7 days / 4 MiB / 30 s per path; with 0 markers — the id check (`-n 1`, same limit) (up to 184 s with the start query and the check; up to 244 s with a retry for a rejected cursor) | marker-step.mjs | пределы чтения журнала при старте · journal read limits at start-up |
| курсор аудита · audit cursor | `<DSH_HOME или ~/.dsh>/kompakt-dsh/zhurnal-kursor-<агент>.json` (0700/0600, пишет процесс агента) · (0700/0600, written by the agent process) | marker-step.mjs | откуда следующий старт продолжает поиск; удалить — следующий старт ищет за 7 дней · where the next start resumes the search; delete it — the next start searches 7 days |
| маршрут Codex · Codex route | `provider === "claude-oauth"` и `model` начинается с `gpt-` · and `model` starts with `gpt-` | index.mjs, marker-step.mjs | где действуют ожидание usage и Codex-маркер · where the usage wait and the Codex marker apply |

Постоянные меняются только правкой кода: это границы устройства, а не вкус агента.

Constants change only by editing code: these are design boundaries, not an agent's taste.
