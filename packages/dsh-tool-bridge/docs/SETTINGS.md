# Настройки · Settings

## Слои политики · Policy layers

Есть два разных источника: Cordis config задаёт адреса монтажа, YAML задаёт пределы и политику. При успешном чтении порядок — кодовые defaults → `obshchee.yml` → `<limitsAgent>.yml`; в обоих YAML читаются разделы `predely` и `politiki`. Неизвестные ключи игнорируются. Значения YAML не проходят полный отдельный type/range validator.
There are two distinct sources: Cordis config supplies mounting addresses and YAML supplies limits/policy. On successful reads, precedence is code defaults → `obshchee.yml` → `<limitsAgent>.yml`; both YAML files read `predely` and `politiki`. Unknown keys are ignored. YAML values do not pass a complete independent type/range validator.

При отсутствии обоих файлов, ошибке YAML или отсутствующем модуле yaml используется строгий профиль ниже, причина пишется в журнал. Если отсутствует только файл агента, общий файл остаётся источником. Политика читается только при apply: сначала выгрузите прежний плагин и перемонтируйте его либо перезапустите DSH. Слежения за YAML нет.
If both files are absent, YAML fails or the yaml module is missing, the strict policy below applies and the reason is logged. If only the agent file is missing, the shared file remains a source. Policy is read only at apply: dispose the previous plugin and remount it, or restart DSH. There is no YAML watcher.

## Cordis config · Cordis configuration

| Имя · Name | Тип · Type | Умолчание · Default | Значение, пример и ошибка · Meaning, example and failure |
|---|---|---|---|
| `limitsDir` | string | `AGENT_LIMITS_DIR` или `./limits` · or `./limits` | Каталог YAML, относительный путь от cwd DSH; пример `/srv/<instance>/policies`. Явный config выше env. Чтение при apply. · YAML directory, relative to DSH cwd; example `/srv/<instance>/policies`. Explicit config overrides env. Read at apply. |
| `alertCommand` | string | `DSH_ALERT_CMD` или `''` · or `''` | Исполняемый файл, text одним argv, timeout 30000 ms; пусто — только журнал. Явный config выше env. · Executable, text as one argv, timeout 30000 ms; empty logs only. Explicit config overrides env. |
| `limitsAgent` | string | `agent` | Ключ `<limitsAgent>.yml`, пример `example`. Не OS username; неверный ключ выбирает чужую/общую либо отказную политику. · Key for `<limitsAgent>.yml`, e.g. `example`. Not an OS username; a wrong key selects another/shared or fallback policy. |
| `port` | number | `0` | Localhost TCP:0 выбирает свободный порт. Пример 0. Занятый/неверный порт мешает listener; другой процесс не должен угадывать выбранный порт. · Localhost TCP:0 picks a free port. Example 0. Busy/invalid ports prevent listening; consumers must not guess the selected port. |
| `domains` | string[] | `[goals]` | Объявленное поле. Текущий TOOLS/EXEC не фильтруется этим списком; `[]` не выключает инструменты. · Declared field. Current TOOLS/EXEC is not filtered by it; `[]` does not disable tools. |
| `ticketTtlMinutes` | number | `360` | Минуты жизни пропуска; пример 60. Ноль/отрицательное/нечисловое значение не имеет отдельного runtime range validator, выбирать положительное конечное число. · Ticket lifetime minutes; example 60. Zero/negative/nonnumeric values have no independent runtime range validator; use a positive finite number. |
| `serverName` | string | `bridge` | Приставка `mcp__bridge__`; пример `platform_tools`. Смена меняет имена инструментов, коллизия скрывает сервер. · Prefix `mcp__bridge__`; example `platform_tools`. Changing it renames tools; collisions can hide a server. |
| `heartbeatNoticeDir` | string | `''` | Пусто — полный текст только в журнал; пример `/srv/<instance>/notices`. Неверный/неписаемый путь оставляет ошибку и текст в журнале; каталог не даёт транспортной квитанции получателя. · Empty logs full text only; example `/srv/<instance>/notices`. Invalid/unwritable paths retain the error and text in logs; a directory is not a recipient delivery receipt. |

Некоторые schema keys намеренно без `.default()`: после нормализации отсутствие и явное значение различаются диагностикой источника. При прямом вызове `apply()` обход schema недопустим; штатный Cordis должен обработать config.
Some schema keys intentionally omit `.default()`: source diagnostics distinguish absence from an explicit value after normalization. Bypassing the schema by directly calling `apply()` is unsupported; normal Cordis loading must process config.

## Cordis config: ostrovApi · Cordis configuration: ostrovApi

Необязательный объект `ostrovApi` включает инструмент API Острова; операции, роли и границы — [OSTROV-API](OSTROV-API.md), подготовка хранилища ключей — [OSTROV-REQUEST-RECOVERY](OSTROV-REQUEST-RECOVERY.md). При `enabled: true` мост на каждый вызов запускает интерпретатор Python 3 с `src/ostrov-api-runner.py` и ходит по сети к API Острова.
The optional `ostrovApi` object enables the Ostrov API tool; operations, roles and limits are in [OSTROV-API](OSTROV-API.md), the key store preparation in [OSTROV-REQUEST-RECOVERY](OSTROV-REQUEST-RECOVERY.md). With `enabled: true` the bridge starts a Python 3 interpreter with `src/ostrov-api-runner.py` on every call and goes over the network to the Ostrov API.

| Имя · Name | Тип · Type | Умолчание · Default | Значение и ошибка · Meaning and failure |
|---|---|---|---|
| `ostrovApi.enabled` | boolean | `false` | `true` регистрирует инструмент `ostrov_api`. Иное значение, кроме `true`/`false`, схема отвергает · `true` registers the `ostrov_api` tool. Values other than `true`/`false` are refused by the schema |
| `ostrovApi.baseUrl` | string | нет — обязателен при `enabled: true` · none — required with `enabled: true` | Адрес API в форме `http://<узел>[:<порт>][/]` (`https` не принимается); иная форма — отказ вызова «Адрес API должен иметь вид http://host:port» или «Неверный порт API» · API address as `http://<host>[:<port>][/]` (`https` is not accepted); another form refuses the call with «Адрес API должен иметь вид http://host:port» or «Неверный порт API» |
| `ostrovApi.keyFile` | string path | нет — обязателен при `enabled: true` · none — required with `enabled: true` | Файл ключа подписи HMAC; недоступен — ответ `{"ok":false,"error":"Файл ключа API недоступен…"}` · HMAC signing key file; unreadable — the answer `{"ok":false,"error":"Файл ключа API недоступен…"}` |
| `ostrovApi.botId` | string | нет — обязателен при `enabled: true` · none — required with `enabled: true` | 1..16 цифр без ведущего нуля; иначе «Неверный ID бота» · 1..16 digits without a leading zero; otherwise «Неверный ID бота» |
| `ostrovApi.requestKeyDir` | absolute path | нет · none | При `enabled: true` обязателен — без него схема отвергает config. Абсолютный, вне рабочего каталога агента (и не через ссылку в него); готовится оператором до первого запуска · Required with `enabled: true` — without it the schema refuses the config. Absolute, outside the agent working directory (and not linked into it); prepared by the operator before the first start |

## YAML: пределы · YAML: limits

| Ключ · Key | Ожидаемый тип/единица · Expected type/unit | Кодовое умолчание · Code default | Пример, эффект и ошибка · Example, effect and failure |
|---|---|---|---|
| `createLimitCount` | integer ≥ 1, creations | `3` | Пример 3, лимит create_goal/сессия за окно. Не квота всех инструментов; неверный тип может сломать сравнение. · Example 3, create_goal/session ceiling per window. Not an all-tool quota; invalid types can break comparisons. |
| `createWindowMinutes` | finite number >0, minutes | `60` | Пример 60, rolling window creation timestamps; больше окно дольше держит слот. Ноль/NaN нельзя считать отключением. · Example 60, rolling window of creation timestamps; longer windows retain slots longer. Zero/NaN are not an off switch. |
| `blockAfterRoundsCount` | integer ≥ 1, goal rounds | `3` | Только блокировка из goal-round; человеку порог не мешает. Сверять с платформенной политикой. · Only blocking through goal-round authority; human turns bypass this threshold. Match the platform policy. |
| `minIntervalSeconds` | finite number >0, seconds | `1800` | База лестницы (для after_seconds и `at`) и минимум every_seconds. Слишком малое значение ускоряет автономную активность; сторож не чинит YAML. · Ladder base (for after_seconds and `at`) and minimum every_seconds. Too-small values accelerate autonomy; the guard does not repair YAML. |
| `maxConsecutiveCount` | integer ≥ 1, deliveries/session | `6` | Остановка после 6 автономных доставок без внешнего вида источника. Бюджет не общий для всех корней. · Stop after 6 autonomous deliveries without an external source kind. Budget is not shared across roots. |
| `maxPerDayCount` | integer ≥ 1, deliveries/session/day | `48` | Календарные сутки в dayZone. Несколько сессий умножают суммарный потолок. · Calendar day in dayZone. Multiple sessions multiply the overall ceiling. |
| `maxVChasCount` | integer ≥0, deliveries/session/rolling hour | `0` | 0 выключает часовой потолок. При исчерпании after_seconds и `at` отодвигаются, создание/изменение времени every_seconds/daily/weekly отказывает; turn/end снимает действующие правила любого вида. · 0 disables the hourly ceiling. Exhaustion defers after_seconds and `at` and refuses every_seconds/daily/weekly creation/timing updates; turn/end removes existing rules of every kind. |

## YAML: политики · YAML: policy

| Ключ · Key | Ожидаемый тип · Expected type | Кодовое умолчание · Code default | Смысл/пример/ошибка · Meaning/example/failure |
|---|---|---|---|
| `dayZone` | IANA string | `Europe/Moscow` | Пример `UTC`. Неверный zone может бросить Intl error; это не автоматический переход к UTC. · Example `UTC`. Invalid zones can throw Intl errors; there is no automatic UTC fallback. |
| `humanKinds` | string[] | `[user,a2a,agent-message]` | Источники, прерывающие полосу. Это доверенный тип, не слово в тексте. Слишком широкий список занижает streak, слишком узкий не видит внешний ввод. · Source kinds that break streaks. Trusted type, not text keywords. Too broad understates streaks; too narrow misses external input. |
| `rezhimIntervala` | `lesenka` or `ravnomerno` | `lesenka` | Лестница:base×(streak+1), не выше последней ступени; неизвестное значение журналируется и заменяется lesenka. · Ladder:base×(streak+1), capped at the final step; unknown values are logged and replaced by lesenka. |
| `ravnomernoIntervalSeconds` | finite number >0, seconds | `1800` | Только ravnomerno, пример 3600. Меньше minimum даёт диагностический конфликт; повтор может быть отвергнут guard. · Only ravnomerno, example 3600. Below the minimum is a diagnostic conflict; repeats may fail the guard. |
| `szhimatIstoriyuPeredUdarom` | boolean | `false` | Только literal true включает предупреждение о сжатии истории. Bridge не подключает persistence hook и фактически не делает сжатие; это интерфейсная заготовка. · Only literal true enables a history-compaction warning. The bridge does not install a persistence hook or actually compact history; this is an interface placeholder. |
| `rezyumirovatPolosu` | boolean | `true` | Literal false выключает автоматическое резюме; явный heartbeat_close сохраняется. · Literal false disables automatic summaries; explicit heartbeat_close remains available. |

Строгий fallback: `createLimitCount=1`, `createWindowMinutes=60`, `blockAfterRoundsCount=3`, `minIntervalSeconds=3600`, `maxConsecutiveCount=1`, `maxPerDayCount=1`, `dayZone=UTC`, `humanKinds=[user]`. В этом объекте нет остальных полей; нельзя обещать полную normal-default конфигурацию после ошибки чтения.
Strict fallback: `createLimitCount=1`, `createWindowMinutes=60`, `blockAfterRoundsCount=3`, `minIntervalSeconds=3600`, `maxConsecutiveCount=1`, `maxPerDayCount=1`, `dayZone=UTC`, `humanKinds=[user]`. Other fields are absent from this object; do not assume complete normal-default configuration after a read failure.

## Окружение и package policy · Environment and package policy

| Имя · Name | Умолчание/тип · Default/type | Назначение и последствия · Purpose and effects |
|---|---|---|
| `AGENT_LIMITS_DIR` | string path; legacy built-in directory | Установить явно, пример `/srv/<instance>/policies`; относительный путь разрешается процессом. Нет файлов/парсера → строгий fallback. · Set explicitly, e.g. `/srv/<instance>/policies`; relative paths depend on process cwd. Missing files/parser → strict fallback. |
| `DSH_ALERT_CMD` | string executable path; fallback for alertCommand | Пример `/srv/<instance>/notify-operator`; получает text как один argv, timeout 30000 ms. Отсутствие/отказ сохраняет текст в журнал, не подтверждает доставку. · Example `/srv/<instance>/notify-operator`; receives text as one argv, timeout 30000 ms. Missing/failed senders retain logs, not a delivery receipt. |
| `sessionIdPrefixes` | nonempty string[] in `scoped-sessions.json` | Поставлено `[telegram-site-, telegram-gost-]`. Malformed/missing отказывает загрузке; меняется пакетом и reload, не профильным config. · Supplied `[telegram-site-, telegram-gost-]`. Missing/malformed data refuses loading; changes require package reload, not profile config. |
| `allowedToolNames` | nonempty string[] in same JSON | Поставлено `[pismo_rukovoditelyu, pamyat_dlya_gostej, zapomnit_dannye_gostya, ostrov_api]` — для обеих приставок. Только пересечение с зарегистрированной областью; запись имени не регистрирует тело. · Supplied `[pismo_rukovoditelyu, pamyat_dlya_gostej, zapomnit_dannye_gostya, ostrov_api]` — for both prefixes. Intersects registered scope only; naming a tool does not register its body. |
| `telegramGuestToolNames` | string[] in same JSON; optional, `[]` | Поставлено `[telegram_send_file, telegram_make_pdf, ostrov_api]`. Добавляется к `allowedToolNames` только для сессий `telegram-gost-`, тоже лишь пересечением с зарегистрированной областью. Не массив или пустое имя — отказ загрузки. · Supplied `[telegram_send_file, telegram_make_pdf, ostrov_api]`. Added to `allowedToolNames` only for `telegram-gost-` sessions, again only as an intersection with the registered scope. A non-array or an empty name refuses loading. |

При scoped-prefix совпадении heartbeat исключён; это не удаление напоминаний и не фильтрация глобальных хуков/встроенных инструментов движка. Prefix ID должен сохраняться при ротации сессии.
A matching scoped prefix skips heartbeat; it does not remove reminders or filter global hooks/engine-native tools. The ID prefix must survive session rotation.

## Ненастраиваемые пределы · Fixed limits

| Предмет · Subject | Предел/граница · Limit/boundary |
|---|---|
| Пропуск · Ticket | 24 случайных байта→48 hex; TTL из config, отзыв на turn/end · 24 random bytes→48 hex; TTL from config; revoke matching turn/end |
| HTTP `/invoke` | JSON buffered; отдельного body/timeout ceiling нет · no dedicated body/timeout ceiling |
| Файл alert helper · Alert helper | timeout 30000 ms; cooldown 86400000 ms only after successful send |
| Неизвестный счёт · Unknown counter | Delay 86400 seconds; operator notice, no inferred zero |
| Сверка schedule history · Scheduler history | До 100 records/task · Up to 100 records/task |
| Изображение · Image | base64 ≤ 10000000 bytes, width/height ≤ 8000 px, text ≤ 61440 bytes, read ≤ 10000 ms |
| Raw attachment bytes | минимум трёх пределов · minimum of three ceilings: min(storage.maxImageBytes, storage.maxMessageImageBytes, 7500000) |
| Image response JSON | ≤ 10065536 байт, только protocol 1 · ≤ 10065536 (10000000 + 65536) bytes, protocol 1 only |

Настройки зависимостей (`defaultMaxGoalRounds`, job wake budgets, attachment limits) принадлежат тем сервисам и не управляются мостом. При обновлении платформы нужно сверить их интерфейсы и сгенерированные JSON, а не копировать числа из этого документа.
Dependency settings (`defaultMaxGoalRounds`, job wake budgets, attachment limits) belong to their services and are not controlled by the bridge. After platform updates, compare interfaces and generated JSON rather than copying numbers from this document.
