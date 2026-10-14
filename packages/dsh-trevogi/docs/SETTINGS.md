# Настройки · Settings

Формат config: одна строка `KEY=value`; кавычки и shell-подстановки не исполняются и не снимаются. Комментарий начинается только с `#` в нулевой колонке. Пробелы перед `#` — неверная строка; `#` внутри значения остаётся частью пути. Пустые строки разрешены. Все пути абсолютные и непустые. Табуляция, переводы строк и NUL в эффективных значениях запрещены.

Config format: one `KEY=value` per line; quotes and shell substitutions are neither evaluated nor removed. A comment starts only with `#` in column zero. Spaces before `#` make an invalid line; `#` inside a value remains part of the path. Blank lines are allowed. All paths are absolute and nonempty. Tabs, line breaks and NUL in effective values are rejected.

`DSH_TREVOGI_CONFIG` выбирает файл, умолчание `/etc/dsh-trevogi/dsh-trevogi.conf`. При его отсутствии используются env и умолчания; явно выбранный отсутствующий или нечитаемый файл даёт отказ. Неизвестные/повторные ключи и синтаксис отвергаются до эффектов. Типы проверяются после приоритета env: ошибочное значение файла, перекрытое правильным env, не используется. Весь эффективный config проверяется всеми тремя утилитами; ошибка другого ключа тоже даёт отказ.

`DSH_TREVOGI_CONFIG` selects the file, default `/etc/dsh-trevogi/dsh-trevogi.conf`. When that default is absent, environment/defaults apply; an explicitly selected missing or unreadable file fails. Unknown/duplicate keys and syntax fail before effects. Types are checked after environment precedence: an invalid file value overridden by a valid environment value is not used. All three utilities validate the entire effective config; another key's error also fails.

| Ключ · Key | Тип/умолчание · Type/default | Значение/ошибка · Meaning/error |
|---|---|---|
| `AGENT_ALERT_TOKEN_FILE` | абсолютный путь · absolute path; `/etc/dsh-trevogi/token` | Файл токена, первая строка без пробельных символов; нет/пусто → отказ отправки. · Token file, first line with whitespace removed; missing/empty → send refusal. |
| `AGENT_ALERT_CHAT_FILE` | абсолютный путь · absolute path; `/etc/dsh-trevogi/chat-id` | Файл адреса чата, первая строка без пробельных символов; нет/пусто → отказ. · Chat address file, first line with whitespace removed; missing/empty → refusal. |
| `AGENT_ALERT_HVOST` | абсолютный путь · absolute path; `/var/log/dsh-trevogi/poslednie.log` | Заранее созданный хвост. Отправщик не создаёт; отсутствие/закрытая запись → запись отказа в журнал. Обрезка → код 2. · Pre-provisioned tail. Sender does not create it; missing/unwritable → journal write-refusal entry. Trimmer → exit 2. |
| `AGENT_ALERT_POPYTOK` | целое · integer 1..10; `3` | Всего сетевых попыток; неверное → отказ config. · Total network attempts; invalid → config refusal. |
| `AGENT_ALERT_PAUZY` | список секунд · seconds list 0..300; `5 15` | Паузы через одиночные пробелы. В списке из нескольких чисел отсутствующее поле → 15 с; одно число повторяется на каждой паузе (прежний cut). Неверное → отказ. · Single-space-separated delays. A missing field in a multi-number list → 15 s; a single number repeats for each delay (legacy cut). Invalid → refusal. |
| `AGENT_ALERT_TAJMAUT` | целое · integer 1..300; `20` | Предел одного curl. Неверное → отказ. · Per-curl time limit. Invalid → refusal. |
| `AGENT_ALERT_HVOST_PREDEL` | целое · integer 1..1000000000; `20000000` | Предел размера хвоста в байтах; выше — не дописывать, назвать отказ в журнале. · Tail byte-size limit; above it, skip append and name the refusal in journal. |
| `AGENT_ALERT_HVOST_STROK` | целое · integer 1..1000000; `200` | Последние строки после часовой обрезки. Неверное → отказ. · Last lines retained by hourly trimming. Invalid → refusal. |
| `OTKAZ_KLYUCH_KURSOR` | абсолютный путь · absolute path; `/var/lib/dsh-trevogi/otkaz-klyuch/kursor` | Состояние окна; неверные права ломают чтение/сохранение. · Window state; invalid permissions break reading/saving. |
| `OTKAZ_KLYUCH_KANAL` | абсолютный путь · absolute path; `/usr/local/bin/agent-alert` | Исполняемый канал, вызывается с `--` и текстом; отказ сохраняет курсор. · Executable channel, invoked with `--` and text; refusal retains cursor. |
| `OTKAZ_KLYUCH_HOST` | непустой текст · nonempty text; короткое имя текущего хоста · current short hostname | Префикс тревоги сторожа; пустое → отказ. · Watcher alert prefix; empty → refusal. |

Пример всех config-ключей — `dsh-trevogi.conf.example`. Токенового значения в нём нет. Сохрани прежние пути существующей установки явно до смены скриптов, иначе нейтральные умолчания выберут другой хвост и курсор.

See `dsh-trevogi.conf.example` for every config key. It contains no token value. Explicitly preserve an existing installation's paths before replacing scripts, otherwise neutral defaults select another tail and cursor.

Два env-ключа отправщика не входят в config: `DSH_PROBA` — 0 по умолчанию, 1 прекращает отправку до чтения токена; другое значение запрещено. `AGENT_ALERT_PREDEL` — 3900 по умолчанию, положительное целое для порога обрезки текста; Telegram-бюджет всё равно не более 4096 UTF-16. Негодный предел ломает HTML и plain и даёт код 1. Журнал 120 знаков и ожидания flock 5/30 с сохранены фиксированными.

Two sender environment keys are not config keys: `DSH_PROBA` defaults to 0, and 1 stops sending before token reading; other values fail. `AGENT_ALERT_PREDEL` defaults to 3900, a positive integer for the text truncation threshold; Telegram's budget is still at most 4096 UTF-16 units. An invalid threshold fails both HTML and plain with exit 1. The 120-character journal limit and 5/30 s flock waits remain fixed.

CLI сторожа `--kursor` и `--kanal` перекрывают соответствующие пути после чтения config; `--tolko-pechat` запрещает отправку и запись курсора. У обрезки нет ключей: неизвестный ввод, включая `--dry-run`, `-n`, `--check`, даёт код 2 без правки хвоста.

The watcher's `--kursor` and `--kanal` override the corresponding paths after config loading; `--tolko-pechat` prevents sending and cursor writes. The trimmer has no options: unexpected input, including `--dry-run`, `-n`, `--check`, exits 2 without changing the tail.

## 3.1.1

Пробелы по краям действующего значения отвергаются (не снимаются); внутренние пробелы путей разрешены, конечный `=` сохраняется. CRLF разделяет строки config; CR в env-значении отвергается. MONITOR_UNIT — env обработчика OnFailure, метка «ПО ОТКАЗУ СЛУЖБЫ» главнее cgroup. Без неё метка по cgroup/TriggeredBy: timer пустая, служба/cron/подтверждённая session-рука именуются; неопределённый источник так и называется. Для этого требуется systemctl; префикс входит в бюджет4096 UTF-16.

Leading/trailing whitespace in an effective value refuses rather than being trimmed; internal path spaces and a final `=` are preserved. CRLF separates config lines; CR in environment values refuses. MONITOR_UNIT from OnFailure takes precedence over cgroup source labels. Timer/service/cron/session evidence controls the label; unsupported sources remain unknown. systemctl supplies timer evidence; the prefix consumes the4096 UTF-16 budget.

Повторы сети/5xx/429/не-JSON: default3/max10; timeout default20/max300с; паузы default5/15, max300с. retry_after integer0..300с переопределяет паузу, неверное/больше300 прекращает вызов. Max5700с при предельной настройке, default80с или660с с retry_after, плюс местная работа; общего wall-clock дедлайна отправщика нет. Watcher0/2 вместо старого3: help0, негодный ввод2; доставка неизвестна блокирует повтор pending. Проверка настройки дополнительно отвергает чтение токена «прочими».

Network/5xx/429/non-JSON retries:default3/max10, request default20/max300s, pause default5/15/max300s. Integer retry_after0..300 overrides the pause; invalid/larger values stop. Configured maximum5700s; default80s or660s with retry_after plus local work, not a global wall-clock deadline. Watcher uses0/2:help0, invalid input2. Unknown delivery blocks pending replay. The settings check additionally refuses world-readable tokens.
