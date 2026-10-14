# Настройки voice-stack · voice-stack settings

Здесь перечислена КАЖДАЯ настройка, которую читает код пакета: переменные окружения, строки конфига, аргументы и флаги в юнитах. Умолчания взяты из кода; где код допускает неочевидное поведение, оно названо.

Every setting the package's code reads is listed here: environment variables, config lines, arguments and unit flags. Defaults are taken from the code; where the code behaves non-obviously, that is stated.

Как читать «где задаётся». «Окружение» — переменная окружения вызывающего процесса. «Конфиг» — строка в `/etc/voice-archive.conf`, который `transcribe-local-shared` исполняет командой `.`; переменная из конфига видна вложенным обёрткам, только если написана с `export`. «Юнит» — строка в файле `systemd/*.service`.

How to read "where set". "Env" is the calling process's environment variable. "Config" is a line in `/etc/voice-archive.conf`, which `transcribe-local-shared` executes with `.`; a variable from the config reaches nested wrappers only if written with `export`. "Unit" is a line in a `systemd/*.service` file.

Цепочка по умолчанию: канал → `transcribe-correct-wrap` → `transcribe-local-shared` → `transcribe-whispercpp-core`. Окружение, заданное каналу, доходит до всех трёх; конфиг читает только `transcribe-local-shared`, и его переменные без `export` до ядра не доходят.

Default chain: channel → `transcribe-correct-wrap` → `transcribe-local-shared` → `transcribe-whispercpp-core`. The environment given to the channel reaches all three; only `transcribe-local-shared` reads the config, and its variables do not reach the core without `export`.

## Аргументы · Arguments

Все три обёртки принимают одинаковые аргументы; умолчания языка различаются.

All three wrappers take the same arguments; language defaults differ.

| Имя · Name | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `$1` | путь · path | — | аудиофайл · audio file | `/tmp/voice.ogg` | ядро: код 2; обёртки передают дальше · core: exit 2; wrappers pass it on |
| `$2` в correct-wrap | строка · string | `ru` | язык; хранится в `YAZ` и передаётся внутреннему распознавателю ВСЕГДА непустым · language; kept in `YAZ` and ALWAYS passed non-empty to the inner transcriber | `auto` | без `$2` в цепочке с корректором язык — `ru`, `DEFAULT_LANG` не действует · without `$2` in the corrector chain the language is `ru`, `DEFAULT_LANG` has no effect |
| `$2` в local-shared | строка · string | `$DEFAULT_LANG`, иначе `ru` · else `ru` | язык · language | `auto` | неверный язык → неверная или переведённая расшифровка · wrong language → wrong or translated transcript |
| `$2` в whispercpp-core | строка · string | `auto` | язык одним доводом; при auto — -l auto · language as one argument; auto uses -l auto | `ru` | неподдерживаемый язык — отказ движка · unsupported language — engine refusal |

## transcribe-local-shared

| Имя · Name | Где · Where | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|---|
| `VOICE_ARCHIVE_DISABLE` | только окружение до конфига · env only, before config | 0/1 | `0` | `1` — архив не зовётся; распознавание сохраняется · `1` skips archive, recognition continues | `1` | пусто или другое — код 2 до распознавания; конфиг не перебивает · empty or other value — exit 2 before recognition; config cannot override |
| `VOICE_ARCHIVE_CONF` | окружение · env | путь · path | `/etc/voice-archive.conf` | какой конфиг исполнить · which config to execute | `/etc/voice-archive.conf` | нет файла — молча умолчания · no file — silent defaults |
| `REAL_TRANSCRIBER` | только конфиг · config only | путь · path | `/usr/local/bin/transcribe-whispercpp-core` | настоящий распознаватель · the real transcriber | `/usr/local/bin/transcribe-whispercpp-core` | нет файла или нет бита исполнения → код 4 (`ДВИЖКА НЕТ`); на себя → код 3; на `transcribe-correct-wrap` → бесконечная петля · missing or not executable → exit 4 (`ДВИЖКА НЕТ`); itself → exit 3; `transcribe-correct-wrap` → endless loop |
| `DEFAULT_LANG` | окружение или конфиг · env or config | строка · string | `ru` | язык, если `$2` пуст · language when `$2` is empty | `auto` | английская речь вернётся русским переводом; в цепочке с корректором не действует (тот всегда передаёт `$2`) · English speech comes back as a Russian translation; no effect in the corrector chain (it always passes `$2`) |
| `PENDING_DIR` | только конфиг · config only | путь · path | значение `VOICE_ARCHIVE_DIR`, иначе пусто · value of `VOICE_ARCHIVE_DIR`, else empty | каталог архива; создаётся `mkdir -p` · archive directory; created with `mkdir -p` | `/var/lib/voice-archive/pending` | нельзя создать/писать → архив молча не пишется · cannot create/write → archive silently skipped |
| `VOICE_ARCHIVE_DIR` | только окружение · env only | путь · path | пусто — архив выкл. · empty — archive off | начальное значение `PENDING_DIR` · initial value of `PENDING_DIR` | `/var/lib/voice-archive/pending` | записанная в конфиг — не действует (читается до конфига) · written in the config — no effect (read before the config) |
| `KEYWORDS` | только конфиг · config only | слова через пробел · space-separated words | `паблик public паблік` | первые слова, включающие архив; сравнение с первым словом в нижнем регистре · first words that trigger the archive; compared with the lower-cased first word | `паблик public` | слово в верхнем регистре никогда не совпадёт · an upper-case word never matches |

Переменные `REAL_TRANSCRIBER`, `KEYWORDS` и `PENDING_DIR` из окружения игнорируются: скрипт присваивает их сам до чтения конфига. Конфиг исполняется с правами вызывающего и может переопределить что угодно; ошибки в нём глушатся.

`REAL_TRANSCRIBER`, `KEYWORDS` and `PENDING_DIR` from the environment are ignored: the script assigns them itself before reading the config. The config runs with the caller's rights and may override anything; errors in it are suppressed.

Файл конфига может содержать и другие ключи для других инструментов (например, срок хранения архива). Этот пакет читает только перечисленные.

The config file may hold other keys for other tools (e.g. archive retention). This package reads only those listed.

## transcribe-whispercpp-core

| Имя · Name | Где · Where | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|---|
| `WHISPERCPP_PORT` | окружение · env | целое · integer | `18790` | порт горячего сервера на `127.0.0.1` · warm server port on `127.0.0.1` | `18790` | не совпал с юнитом → каждый вызов идёт холодным путём, в stderr `unreachable` · mismatch with the unit → every call goes cold, `unreachable` on stderr |
| `WHISPER_HOME` | окружение · env | путь · path | `/opt/whisper.cpp` | корень движка; бинарь `build-vulkan/bin/whisper-cli`, модель `models/ggml-large-v3.bin` · engine root | `/opt/whisper.cpp` | холодный путь: код 3 (нет бинаря) или ошибка whisper-cli (нет модели) · cold path: exit 3 (no binary) or whisper-cli error (no model) |
| `DENOISE` | окружение · env | `0` / `1` | не задано → `0` · unset → `0` | шумодав: `1` — вкл., `0` — выкл. молча; не задано или пусто — выкл. со строкой `denoise: выключен по умолчанию …` в stderr; иное — выкл. со строкой `denoise: непонятное значение …` · denoiser: `1` on, `0` off silently; unset or empty — off with a `denoise: выключен по умолчанию …` stderr line; anything else — off with a `denoise: непонятное значение …` line | `1` | `true`/`yes`/`01` НЕ включают шумодав (неизвестное значение ведёт в отказ) · `true`/`yes`/`01` do NOT enable it (unknown value leads to refusal) |
| `DENOISE_HOME` | окружение · env | путь · path | `/opt/dfn` | `venv/bin/python` и кэш весов `models` · `venv/bin/python` and weight cache `models` | `/opt/dfn` | при `DENOISE=1`: нет python → `denoise: ШУМОДАВА НЕТ (…)` и сырой звук; нет пакетов → `denoise: ошибка, работаю по оригиналу` · with `DENOISE=1`: no python → `denoise: ШУМОДАВА НЕТ (…)` and raw audio; missing packages → `denoise: ошибка, работаю по оригиналу` |
| `TMPDIR` | окружение · env | путь · path | `/tmp` | где `mktemp -t` создаёт очищенный файл · where `mktemp -t` creates the denoised file | `/var/tmp` | нельзя писать → шумодав откатывается на оригинал · not writable → denoiser falls back to the original |

Зашито в код, настройкой не меняется: тайм-аут проверки сервера 3 с, тайм-аут запроса 300 с, модель шумодава `dpdfnet2` с `attn_limit_db=12`, подкаталог `build-vulkan`, имя модели `ggml-large-v3.bin`, флаг `-nt` холодного пути.

Hard-coded, not configurable: server probe timeout 3 s, request timeout 300 s, denoiser model `dpdfnet2` with `attn_limit_db=12`, the `build-vulkan` subdirectory, the model name `ggml-large-v3.bin`, the cold path's `-nt` flag.

## transcribe-correct-wrap

| Имя · Name | Где · Where | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|---|
| `SAGE_INNER_TRANSCRIBER` | окружение · env | путь · path | `/usr/local/bin/transcribe-local-shared` | внутренний распознаватель · inner transcriber | `/usr/local/bin/transcribe-whispercpp-core` (без архива · without the archive) | нет файла → код 127, пустой текст · missing → exit 127, empty text |
| `SAGE_HOME` | окружение · env | путь · path | `/opt/sage-corrector` | корень для умолчаний клиента, журнала, фильтра и пар · root for the client, log, filter and pairs defaults | `/opt/sage-corrector` | см. строки ниже · see the rows below |
| `SAGE_CLIENT` | окружение · env | путь · path | `$SAGE_HOME/sage_client.py` | клиент корректора (нет в пакете) · corrector client (not shipped) | `/opt/sage-corrector/sage_client.py` | нет файла → без коррекции · missing → no correction |
| `SAGE_CLIENT_PY` | окружение · env | путь · path | `/usr/bin/python3` | интерпретатор клиента и встроенных помощников · interpreter for the client and the embedded helpers | `/usr/bin/python3` | не исполняемый → без коррекции; подстановка и срез хвоста тоже не работают · not executable → no correction; substitution and tail cut fail too |
| `SAGE_SOCK` | окружение · env (экспортируется · exported) | путь · path | `/run/sage-corrector/sage.sock` | сокет службы корректора · corrector service socket | `/run/sage-corrector/sage.sock` | не сокет → без коррекции · not a socket → no correction |
| `SAGE_LOG` | окружение · env | путь · path | `$SAGE_HOME/corrector.log` | журнал: усиление, итог корректора, пропажа фильтра, битые строки пар · log: gain, corrector summary, missing filter, broken pair lines | `/var/log/voice/corrector.log` | вызывающий не может дописывать → подстановка и срез хвоста выключены, итог не пишется, в stderr — ошибки оболочки; коррекция работает · caller cannot append → substitution and tail cut off, no summary, shell errors on stderr; correction still works |
| `SAGE_HALLUC_FILTER` | окружение · env | путь · path | `$SAGE_HOME/hallucination-filter.txt` | файл выражений галлюцинаций (фильтр и срез хвоста) · hallucination patterns file (filter and tail cut) | `/opt/sage-corrector/hallucination-filter.txt` | нет файла → фильтр и срез выключены; на каждый вызов строка в журнал системы и `SAGE_LOG` · missing → filter and cut off; a line to the system journal and `SAGE_LOG` on every call |
| `SAGE_ZAMENY` | окружение · env | путь · path | `$SAGE_HOME/zameny.tsv` | пары подстановки терминов · term substitution pairs | `/opt/sage-corrector/zameny.tsv` | нет файла → подстановки нет, молча · missing → no substitution, silently |
| `SAGE_KUSOK` | окружение · env | целое, знаков · integer, chars | `600` | наибольший кусок, подаваемый корректору за раз · largest chunk fed to the corrector at once | `400` | нечисловое или <1 → помощник отказывает, ВЕСЬ текст без коррекции, в журнал системы — последняя строка ошибки Python; слишком большое → кусок не уложится в предел клиента · non-numeric or <1 → helper refuses, the WHOLE text uncorrected, the last Python error line goes to the system journal; too large → a chunk misses the client limit |
| `SAGE_BUDZHET` | окружение · env | число, с · number, s | `45` | общий бюджет коррекции; проверяется перед каждым куском · overall correction budget; checked before each chunk | `40` | больше ~45 упрётся в жёсткий предел 70 с: весь текст уйдёт сырым; нечисловое → как у `SAGE_KUSOK` · above ~45 runs into the hard 70 s cap: the whole text goes raw; non-numeric → as with `SAGE_KUSOK` |
| `SAGE_CLIENT_TIMEOUT` | окружение · env | число, с · number, s | `20` | предел клиента; обёртка ждёт кусок `SAGE_CLIENT_TIMEOUT + 5` с; сам клиент тоже может читать эту переменную (код клиента не в пакете, не проверено) · client limit; the wrapper waits `SAGE_CLIENT_TIMEOUT + 5` s per chunk; the client itself may read it too (client code not shipped, not verified) | `20` | нечисловое → все куски сырые · non-numeric → all chunks raw |
| `GAIN_THRESHOLD_DB` | окружение · env | число, dB · number, dB | `-26` | ниже этой средней громкости запись нормализуется · below this mean loudness the recording is normalised | `-30` | нечисловое → усиление пропускается, данные не исполняются; слишком высокое → нормализуется всё · non-numeric → gain skipped, data is never executed; too high → everything is normalised |
| `SAGE_DEMO_LOG` | окружение · env | путь · path | пусто — выкл. · empty — off | журнал пар RAW→COR · log of RAW→COR pairs | `/var/log/sage-demo.log` | включён надолго → текст чужой речи копится на диске · left on → other people's speech piles up on disk |
| `TMPDIR` | окружение · env | путь · path | `/tmp` | где создаются нормализованный файл и файл итога корректора · where the normalised file and the corrector summary file are created | `/var/tmp` | нельзя писать → усиление пропускается, итог корректора не считается · not writable → gain skipped, corrector summary not counted |

Зашито в код: параметры нормализации `loudnorm=I=-16:TP=-1.5:LRA=11`, 16 кГц, моно; предел длины для фильтра — 120 символов; срез хвоста — текст длиннее 120 знаков, фраза кончается не дальше 40 знаков от конца и начинается не дальше 25 знаков от начала своего предложения; жёсткий предел всего шага коррекции — 70 с; точка реза куска — не раньше трети `SAGE_KUSOK`; текст маркера `[речь не распознана — на записи тишина или шум, текст не получен]`.

Hard-coded: normalisation `loudnorm=I=-16:TP=-1.5:LRA=11`, 16 kHz, mono; filter length limit 120 characters; tail cut — text longer than 120 characters, the phrase ends no further than 40 characters from the end and starts no further than 25 characters from the start of its sentence; hard limit for the whole correction step — 70 s; a chunk cut point no earlier than a third of `SAGE_KUSOK`; the marker text `[речь не распознана — на записи тишина или шум, текст не получен]`.

Формат `hallucination-filter.txt`: одно расширенное регулярное выражение (`grep -E`) на строку, сравнение без учёта регистра, пустые строки и строки, начинающиеся с `#`, пропускаются. Выражение, совпадающее со всем подряд (например `.`), превратит любую короткую расшифровку в маркер. Тот же файл срез хвоста читает как регулярные выражения Python; выражение, которое Python не компилирует, там молча пропускается.

`hallucination-filter.txt` format: one extended regular expression (`grep -E`) per line, case-insensitive, blank lines and lines starting with `#` skipped. A pattern matching everything (e.g. `.`) turns any short transcript into the marker. The tail cut reads the same file as Python regular expressions; a pattern Python cannot compile is silently skipped there.

Формат `zameny.tsv`: строка `образец<TAB>замена`, кодировка UTF-8; пустые строки и строки, начинающиеся с `#`, пропускаются. Образец — регулярное выражение Python, ищется целым словом без учёта регистра; в замене допустимы ссылки на группы (`\1`); если найденное начиналось с заглавной, а замена — со строчной, первая буква поднимается. Пары применяются дважды — до и после корректора, поэтому пара обязана давать тот же результат при повторном применении (пара вида «X → X-что-то» развернётся дважды). Битая строка пропускается одна, её номер пишется в `SAGE_LOG`.

`zameny.tsv` format: a line `pattern<TAB>replacement`, UTF-8; blank lines and lines starting with `#` are skipped. The pattern is a Python regular expression matched as a whole word, case-insensitively; the replacement may use group references (`\1`); if the match started with a capital and the replacement with a lower-case letter, the first letter is raised. Pairs are applied twice — before and after the corrector — so a pair must give the same result when applied again (a pair of the form "X → X-something" expands twice). A broken line is skipped alone, its number is written to `SAGE_LOG`.

## whisper-warm.service

| Имя · Name | Тип · Type | Умолчание в юните · Unit value | Что значит · Meaning | Если неверно · If wrong |
|---|---|---|---|---|
| `After` / `Wants` | цели · targets | `network-online.target` | затребовать сеть и стартовать после неё; самому серверу внешняя сеть не нужна · pull in the network and start after it; the server itself needs no outside network | — |
| `Type` | вид · kind | `exec` | «запущено» — после успешного `exec()` бинаря; ошибка запуска видна сразу · "started" after the binary's `exec()` succeeds; a launch error is visible at once | — |
| `User` / `Group` | учётка · account | `voicesvc` | служебная учётка · service account | нет учётки → юнит не стартует · no account → unit fails to start |
| `SupplementaryGroups` | группы · groups | `video render` | доступ к GPU · GPU device access | нет групп → нет GPU (медленно или отказ) · no groups → no GPU (slow or failure) |
| `WorkingDirectory` | путь · path | `/var/lib/whisper-warm` | рабочий каталог; юнит его НЕ создаёт · working directory; the unit does NOT create it | нет каталога → юнит не стартует (шаг `CHDIR`) · missing → unit fails to start (`CHDIR` step) |
| `GGML_VK_VISIBLE_DEVICES` | целое · integer | `0` | какой GPU видит Vulkan-сборка · which GPU the Vulkan build sees | не тот индекс → не тот GPU или нет GPU · wrong index → wrong GPU or none |
| `--model` | путь · path | `/opt/whisper.cpp/models/ggml-large-v3.bin` | модель · model | сервер не стартует · server fails to start |
| `--host` | адрес · address | `127.0.0.1` | только локально · local only | иное значение открывает сервер сети · another value exposes the server to the network |
| `--port` | целое · integer | `18790` | порт; дублируется в `ExecStartPost` и `WHISPERCPP_PORT` · port; duplicated in `ExecStartPost` and `WHISPERCPP_PORT` | рассинхрон → холодный путь при каждом вызове или проваленный старт · mismatch → cold path on every call or failed start |
| `--language` | строка · string | `auto` | язык, если клиент не передал · language when the client sends none | действует только на клиентов, не приславших язык; ядро этого пакета присылает всегда · affects only clients that send no language; this package's core always sends one |
| `--threads` | целое · integer | `4` | потоки CPU · CPU threads | больше ядер — конкуренция; меньше — медленнее · more than cores — contention; fewer — slower |
| `--convert` | флаг · flag | вкл. · on | перекодирование входа через ffmpeg · input conversion via ffmpeg | нет ffmpeg → по справке флага конвертация невозможна; уйдёт ли ядро в холодный путь, зависит от формы ответа сервера (не проверено) · no ffmpeg → per the flag's help conversion is impossible; whether the core falls back cold depends on the server's reply shape (not tested) |
| `ExecStartPost` | команда · command | до 90 попыток (`curl -m 2`, пауза 1 с) · up to 90 attempts (`curl -m 2`, 1 s pause) | ждать ответа порта · wait for the port | порт не ответил → провал старта · port silent → start fails |
| `TimeoutStartSec` | с · s | `180` | общий предел старта вместе с `ExecStartPost` · overall start limit including `ExecStartPost` | слишком мал для загрузки модели → провал старта · too small for model load → start fails |
| `Restart`, `RestartSec` | политика · policy | `on-failure`, `5` | перезапуск только при сбое · restart only on failure | — |
| `MemoryMax` | объём · size | `8G` | жёсткий потолок памяти · hard memory cap | меньше нужного модели → убийство по OOM и перезапуск по кругу · below what the model needs → OOM kill and a restart loop |
| `Nice` | целое · integer | `-5` | приоритет CPU выше обычного · CPU priority above normal | — |

## sage-warm.service

Код сервера в пакет не входит; смысл переменных `SAGE_MODEL_DIR`, `SAGE_GLOSSARY`, `SAGE_THREADS` выведен из имён и не проверен.

The server code is not shipped; the meaning of the `SAGE_MODEL_DIR`, `SAGE_GLOSSARY`, `SAGE_THREADS` variables is inferred from their names and not verified.

| Имя · Name | Тип · Type | Значение в юните · Unit value | Что значит · Meaning | Если неверно · If wrong |
|---|---|---|---|---|
| `After` | цель · target | `network.target` | только порядок, без `Wants=` · ordering only, no `Wants=` | — |
| `User` / `Group` | учётка · account | `voicesvc` | служебная учётка · service account | юнит не стартует · unit fails to start |
| `SupplementaryGroups` | группы · groups | `video render` | доступ к видеоустройствам · video device access | нет групп → нет доступа к устройствам · no groups → no device access |
| `RuntimeDirectory` / `RuntimeDirectoryMode` | имя, права · name, mode | `sage-corrector`, `0755` | создаёт `/run/sage-corrector` · creates `/run/sage-corrector` | сокет некуда положить · no place for the socket |
| `HF_HUB_OFFLINE` | `1`/`0` | `1` | не ходить в сеть за моделью · no network model fetch | `0` — попытка скачивания при старте · `0` — download attempt at start |
| `SAGE_SOCK` | путь · path | `/run/sage-corrector/sage.sock` | путь сокета; совпадает с обёрткой и с `ExecStartPost` · socket path; must match the wrapper and `ExecStartPost` | рассинхрон → коррекция никогда не вызывается или провал старта · mismatch → correction never runs or start fails |
| `SAGE_MODEL_DIR` | путь · path | `/opt/sage-corrector/model` | каталог модели (по имени) · model directory (by name) | не установлено · not determined |
| `SAGE_GLOSSARY` | путь · path | `/opt/sage-corrector/glossary.txt` | словарь терминов (по имени) · glossary (by name) | не установлено · not determined |
| `SAGE_THREADS` | целое · integer | `4` | потоки (по имени) · threads (by name) | не установлено · not determined |
| `ExecStartPost` | команда · command | до 180 проверок сокета раз в 1 с · up to 180 socket checks, 1 s apart | ждать появления сокета · wait for the socket | сокет не появился за ~180 с → провал старта · no socket within ~180 s → start fails |
| `TimeoutStartSec` | с · s | `200` | общий предел старта · overall start limit | меньше ожидания сокета → провал старта раньше времени · below the socket wait → start fails early |
| `Restart`, `RestartSec` | политика · policy | `always`, `3` | перезапуск при любом выходе процесса, включая код 0 · restart on any process exit, including exit 0 | — |
| `MemoryMax` | объём · size | `2G` | жёсткий потолок памяти · hard memory cap | меньше нужного модели → убийство по OOM и перезапуск по кругу · below what the model needs → OOM kill and a restart loop |

## Дополнительные инструменты · Additional tools

Дополнительные параметры команд приведены в таблице README «Дополнительные команды». GOLOS_REESTR необходимо перенести из установленного окружения перед сменой путей; остальные прежние умолчания сохранены.

Additional command settings appear in the README Additional commands table. Carry GOLOS_REESTR from the installed environment before changing paths; all other former defaults are retained.

При пустом итоговом `PENDING_DIR` обёртка на каждом вызове пишет в stderr «архив голосовых выключен: PENDING_DIR не задан». Это уведомление об отключённом архиве; распознавание продолжается с прежними stdout и кодом возврата. Конфиг может задать `PENDING_DIR`, окружение — `VOICE_ARCHIVE_DIR`.

When the final `PENDING_DIR` is empty, the wrapper writes “архив голосовых выключен: PENDING_DIR не задан” (“voice archive disabled: PENDING_DIR is unset”) to stderr on every call. This reports disabled archiving; transcription continues with its existing stdout and exit code. The config can set `PENDING_DIR`; the environment can set `VOICE_ARCHIVE_DIR`.
