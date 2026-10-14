# Сторожа и проверки voice-stack · voice-stack guards and checks

В пакете есть golos-watch.service и golos-watch.timer: ежедневный обход и ручной запуск от root. Остальные проверки встроены в обёртки и юниты и срабатывают на каждом вызове. Исход виден в stderr вызывающего, в коде возврата, в журнале корректора `SAGE_LOG` (по умолчанию `$SAGE_HOME/corrector.log`) или в журнале systemd. Две проверки обёртки корректора дополнительно пишут в журнал системы с тегом `transcribe-correct-wrap` (`journalctl -t transcribe-correct-wrap`); их читает golos-watch и отправляет через GOLOS_ALERT; вызывают его таймер пакета или администратор.

The package contains golos-watch.service and golos-watch.timer: a daily scan and manual root invocation. The other checks are built into the wrappers and units and fire on every call. The outcome is visible on the caller's stderr, in the exit code, in the corrector log `SAGE_LOG` (by default `$SAGE_HOME/corrector.log`) or in the systemd journal. Two corrector-wrapper checks additionally write to the system journal with the tag `transcribe-correct-wrap` (`journalctl -t transcribe-correct-wrap`); golos-watch reads them and reports via GOLOS_ALERT; its callers are the packaged timer or an administrator.

Куда попадает stderr обёрток, решает вызывающий. Если канал не сохраняет stderr дочернего процесса, все диагностические строки ниже потеряются, и читателя у них не будет.

Where the wrappers' stderr ends up is the caller's decision. If your channel does not keep the child process's stderr, every diagnostic line below is lost and has no reader.

## Сводка · Summary

| Проверка · Check | Файл · File | Ловит · Catches | НЕ ловит · Does NOT catch | Куда сообщает · Reports to |
|---|---|---|---|---|
| Защита от самовызова · Self-call guard | `transcribe-local-shared` | `REAL_TRANSCRIBER` = этот файл (после `readlink -f`) · `REAL_TRANSCRIBER` = this file (after `readlink -f`) | косвенную петлю A→B→A · indirect loop A→B→A | stderr `САМОВЫЗОВ`, код 3 · exit 3 |
| Наличие движка · Engine existence | `transcribe-local-shared` | `REAL_TRANSCRIBER` не найден или без бита исполнения · `REAL_TRANSCRIBER` missing or not executable | движок есть, но не работает (сервер лёг, нет модели) · engine present but broken (server down, no model) | stderr `ДВИЖКА НЕТ`, код 4 · exit 4 |
| Изоляция архива · Archive isolation | `transcribe-local-shared` | любую ошибку архива — не даёт ей тронуть stdout и код · any archive error — keeps it from touching stdout and exit code | сам отказ архива (не сообщается никуда); взятие чужого `audio.*`; нормализованный .wav при общем TMPDIR после усиления · the archive failure itself (reported nowhere); picking someone else's `audio.*`; the normalised .wav after gain with shared TMPDIR | никуда · nowhere |
| Объявление `DENOISE` · `DENOISE` announcement | `transcribe-whispercpp-core` | `DENOISE` не задан или пуст; значение не `0`/`1`; `DENOISE=1` без venv · `DENOISE` unset or empty; a value other than `0`/`1`; `DENOISE=1` without a venv | venv есть, а пакетов нет (это ловит откат ниже) · venv present without the packages (the fallback below catches that) | stderr `denoise: выключен по умолчанию` / `непонятное значение` / `ШУМОДАВА НЕТ` |
| Откат шумодава · Denoiser fallback | `transcribe-whispercpp-core` | ошибку Python, пустой выход · Python error, empty output | непустой, но испорченный выход · non-empty but damaged output | stderr `denoise: …` |
| Проверка горячего сервера · Warm server check | `transcribe-whispercpp-core` | порт не отвечает за 3 с; пустой ответ; ответ, начинающийся с `{"error"` · port silent for 3 s; empty reply; reply starting with `{"error"` | ошибку иной формы; неверный текст от живого сервера; работу на CPU вместо GPU · error of another shape; wrong text from a live server; running on CPU instead of GPU | stderr `warm server …` |
| Проверка холодного бинаря · Cold binary check | `transcribe-whispercpp-core` | нет исполняемого `whisper-cli` · no executable `whisper-cli` | нет модели; неверный текст движка · missing model; wrong engine output | stderr `cold fallback impossible`, код 3 · exit 3 |
| Проверка аргумента · Argument check | `transcribe-whispercpp-core` | нет `$1` или файла · no `$1` or file | файл не аудио · file is not audio | stderr `usage`, код 2 · exit 2 |
| Усиление тихих записей · Quiet-recording gain | `transcribe-correct-wrap` | средняя громкость ниже `GAIN_THRESHOLD_DB` · mean loudness below `GAIN_THRESHOLD_DB` | громкую неразборчивую запись; нечисловой порог (усиление молча выкл.) · loud unintelligible audio; non-numeric threshold (gain silently off) | `SAGE_LOG`: `gain: …dB -> normalized` |
| Фильтр галлюцинаций · Hallucination filter | `transcribe-correct-wrap` | короткий (≤120 символов) текст, совпавший с выражением из файла; пропажу самого файла · short (≤120 chars) text matching a pattern from the file; the file itself going missing | длинные галлюцинации целиком; фразы вне файла · long hallucinations as a whole; phrases not in the file | stdout: маркер; при пропаже файла — журнал системы и `SAGE_LOG` на каждый вызов · stdout: the marker; missing file — system journal and `SAGE_LOG` on every call |
| Срез хвоста · Tail cut | `transcribe-correct-wrap` | галлюцинацию из файла фильтра в последнем предложении длинного текста · a filter-file hallucination in the last sentence of long text | галлюцинацию, за которой ещё >40 знаков речи; текст из одного предложения · a hallucination followed by >40 characters of speech; single-sentence text | никуда — текст просто короче · nowhere — the text is just shorter |
| Подстановка терминов · Term substitution | `transcribe-correct-wrap` | верно расслышанный термин, испорченный корректором (если есть пара) · a correctly heard term spoiled by the corrector (if a pair exists) | ошибки распознавания вне списка пар · recognition errors outside the pair list | битая строка пар — номер в `SAGE_LOG` · broken pair line — its number in `SAGE_LOG` |
| Предусловия корректора · Corrector preconditions | `transcribe-correct-wrap` | код ≠ 0, пустой текст, нет интерпретатора/клиента/сокета · non-zero code, empty text, no interpreter/client/socket | нет права писать в сокет; служба жива, но отвечает неверно · no permission on the socket; service alive but answering wrong | никуда — тихо отдаётся сырой текст · nowhere — raw text silently |
| Коррекция кусками и счёт · Chunked correction and count | `transcribe-correct-wrap` | кусок без коррекции (пустой ответ, `passthrough` клиента, тайм-аут, бюджет); отказ всего шага (нет итога) · an uncorrected chunk (empty reply, client `passthrough`, timeout, budget); failure of the whole step (no summary) | неверный, но непустой ответ; неудачу `mktemp` (счёт пропадает молча) · a wrong but non-empty reply; an `mktemp` failure (the count is lost silently) | `SAGE_LOG`: `ИТОГ корректора …`; если без коррекции ≠ 0 или итога нет — журнал системы · `SAGE_LOG`: `ИТОГ корректора …`; if uncorrected ≠ 0 or no summary — system journal |
| Готовность порта · Port readiness | `whisper-warm.service` | сервер не открыл порт за отведённое время · server did not open the port in time | что сервер распознаёт; что он на GPU · that it recognises; that it runs on the GPU | журнал systemd, юнит `failed` · systemd journal, unit `failed` |
| Готовность сокета · Socket readiness | `sage-warm.service` | сокет не появился за ~180 с · socket did not appear within ~180 s | что служба отвечает через сокет и правит текст · that the service answers over the socket and edits text | журнал systemd, юнит `failed` · systemd journal, unit `failed` |

## Защита от самовызова и наличие движка · Self-call guard and engine existence

Зачем. Умолчание `REAL_TRANSCRIBER` дважды было неверным: сперва указывало на саму обёртку (на машине без конфига она звала себя бесконечно: процессы множились, вызов висел, журналы молчали), потом — на файл, которого на машине не было (работало, пока конфиг его переопределял; без конфига — невнятный код 127 и пустой текст). Теперь умолчание — ядро пакета, совпадение путей останавливает работу с кодом 3, а отсутствующий или неисполняемый движок — с кодом 4; обе проверки пишут по две-три строки в stderr.

Why. The `REAL_TRANSCRIBER` default was wrong twice: first it pointed at the wrapper itself (on a host without the config it called itself forever: processes multiplied, the call hung, logs stayed silent), then at a file absent from the host (it worked while the config overrode it; without the config — an obscure exit 127 and empty text). Now the default is the package's core, a path match stops work with exit 3, and a missing or non-executable engine with exit 4; both checks write two or three stderr lines.

Чего НЕ ловит. Петлю через другую обёртку. При нынешних умолчаниях для неё достаточно ОДНОЙ строки `REAL_TRANSCRIBER=/usr/local/bin/transcribe-correct-wrap` в конфиге: обёртка корректора по умолчанию зовёт `transcribe-local-shared`, и вызов уходит в бесконечную рекурсию. Проверяйте цепочку глазами при каждом изменении конфига. Проверка наличия не ловит движок, который есть, но не работает.

What it does NOT catch. A loop through another wrapper. With the current defaults a SINGLE config line `REAL_TRANSCRIBER=/usr/local/bin/transcribe-correct-wrap` is enough: the corrector wrapper calls `transcribe-local-shared` by default, and the call recurses forever. Re-read the chain by eye on every config change. The existence check does not catch an engine that exists but does not work.

Как читать тревогу. `transcribe: САМОВЫЗОВ — REAL_TRANSCRIBER указывает на этот же файл (<путь>)` — исправьте `REAL_TRANSCRIBER` в конфиге; код 3 здесь не путать с кодом 3 ядра. `transcribe: ДВИЖКА НЕТ: REAL_TRANSCRIBER=<путь> не найден или не исполняем.` — поставьте ядро с битом исполнения (`install -m 0755`) или исправьте путь.

How to read the alarm. `transcribe: САМОВЫЗОВ — REAL_TRANSCRIBER указывает на этот же файл (<path>)` ("self-call — points at this same file") — fix `REAL_TRANSCRIBER` in the config; do not confuse this exit 3 with the core's exit 3. `transcribe: ДВИЖКА НЕТ: REAL_TRANSCRIBER=<path> не найден или не исполняем.` ("no engine: not found or not executable") — install the core with the exec bit (`install -m 0755`) or fix the path.

## Объявление `DENOISE` · `DENOISE` announcement

Зачем. Шумодав по умолчанию выключен — по замеру он не помогал. Но работа «по сырому звуку» должна быть видна как выбор, а не как молчание, а значение вроде `DENOISE=true` не должно молча означать «выключено», пока автор уверен, что включил. Поэтому: не задано или пусто — одна строка `denoise: выключен по умолчанию …`; не `0` и не `1` — строка `denoise: непонятное значение DENOISE=«…»`, и шумодав НЕ запускается; `DENOISE=1` без venv — строка `denoise: ШУМОДАВА НЕТ (…)`. Явное `DENOISE=0` — тишина.

Why. The denoiser is off by default — by measurement it did not help. But working "on raw audio" must show up as a choice, not as silence, and a value like `DENOISE=true` must not silently mean "off" while its author is sure it is on. Hence: unset or empty — one line `denoise: выключен по умолчанию …` ("off by default"); neither `0` nor `1` — a line `denoise: непонятное значение DENOISE=«…»` ("unknown value") and the denoiser does NOT run; `DENOISE=1` without a venv — a line `denoise: ШУМОДАВА НЕТ (…)` ("no denoiser"). An explicit `DENOISE=0` is silent.

Чего НЕ ловит. Venv есть, но пакетов в нём нет — это всплывает как `denoise: ошибка, работаю по оригиналу`. Строка «выключен по умолчанию» печатается на КАЖДОМ вызове: если ваш канал считает любой stderr тревогой, задайте `DENOISE=0` явно.

What it does NOT catch. A venv without the packages — that surfaces as `denoise: ошибка, работаю по оригиналу` ("error, using the original"). The "off by default" line is printed on EVERY call: if your channel treats any stderr as an alarm, set `DENOISE=0` explicitly.

## Откаты ядра · Core fallbacks

Зачем. Отказ одной ступени не должен ронять распознавание целиком: шумодав откатывается на оригинал, горячий сервер — на холодный запуск.

Why. One stage failing must not take recognition down: the denoiser falls back to the original, the warm server to a cold run.

Чего НЕ ловит. Ветку отката нужно проверять отдельно: при живом сервере она не исполняется никогда, и отсутствие `whisper-cli` или модели обнаружится только в день отказа сервера. Язык auto передаётся как -l auto.

What it does NOT catch. The fallback branch needs its own test: with a live server it never runs, so a missing `whisper-cli` or model shows up only on the day the server fails. The auto language is passed as -l auto.

Как проверить. Остановите `whisper-warm`, прогоните `transcribe-whispercpp-core <речь> ru`, убедитесь, что в stderr есть `unreachable`, а в stdout — осмысленный текст. Запустите службу обратно и убедитесь, что строка `unreachable` пропала.

How to test. Stop `whisper-warm`, run `transcribe-whispercpp-core <speech> ru`, confirm `unreachable` on stderr and sensible text on stdout. Start the service again and confirm the `unreachable` line is gone.

## Фильтр галлюцинаций и срез хвоста · Hallucination filter and tail cut

Зачем. Whisper на тишине выдаёт грамматически безупречные дежурные фразы из обучающих субтитров. Корректор их не ловит, и агент получает выдуманную «речь». Опасность — в том, что однажды выдумка совпадёт с правдоподобной инструкцией. Фильтр заменяет такие короткие тексты явным маркером «речь не распознана»; у длинного текста срез хвоста убирает такую фразу из последнего предложения.

Why. On silence Whisper produces grammatically perfect stock phrases from its training subtitles. The corrector does not catch them and the agent receives invented "speech". The danger is that one day the invention matches a plausible instruction. The filter replaces such short texts with an explicit "speech not recognised" marker; on long text the tail cut removes such a phrase from the last sentence.

Пропажа файла фильтра больше не молчит: на каждом вызове строка `🔴 фильтр галлюцинаций НЕ НАЙДЕН: <путь> — фильтр ВЫКЛЮЧЕН …` уходит в журнал системы и в `SAGE_LOG`, а текст идёт дальше как был. Язык обёртка корректора теперь держит в `YAZ`, а не в `LANG`, поэтому больше не портит локаль, нужную для регистронезависимого сравнения кириллицы.

A missing filter file is no longer silent: on every call a line `🔴 фильтр галлюцинаций НЕ НАЙДЕН: <path> — фильтр ВЫКЛЮЧЕН …` ("hallucination filter NOT FOUND — filter OFF") goes to the system journal and to `SAGE_LOG`, while the text goes on as is. The corrector wrapper now keeps the language in `YAZ`, not `LANG`, so it no longer spoils the locale needed for case-insensitive Cyrillic matching.

Чего НЕ ловит. Длинные тексты целиком (только хвост последнего предложения, и то если фраза кончается не дальше 40 знаков от конца и стоит не дальше 25 знаков от начала предложения); фразы, которых нет в файле; зацикленные повторы. Файла фильтра в пакете нет. При локали вызывающего без UTF-8 кириллица без учёта регистра не сравнивается: пишите выражения в том регистре, в каком их выдаёт движок, или с явными классами вроде `[Пп]`. Срез хвоста читает тот же файл как выражения Python: выражение, которое Python не компилирует, там молча пропускается.

What it does NOT catch. Long texts as a whole (only the tail of the last sentence, and only if the phrase ends no further than 40 characters from the end and sits no further than 25 characters from the sentence start); phrases missing from the file; looped repeats. The filter file is not shipped. Under a non-UTF-8 caller locale Cyrillic is not matched case-insensitively: write patterns in the case the engine produces, or with explicit classes like `[Пп]`. The tail cut reads the same file as Python patterns: a pattern Python cannot compile is silently skipped there.

Как проверить (три пробы). Исправное: короткая обычная фраза проходит без изменений. Порча: добавьте в файл выражение, совпадающее с этой фразой, — должен выйти маркер. Возврат: уберите выражение — фраза снова проходит. Для пропажи файла: переименуйте его — в `journalctl -t transcribe-correct-wrap` появится строка `НЕ НАЙДЕН`; верните — новые строки перестанут появляться.

How to test (three probes). Healthy: a short ordinary phrase passes unchanged. Fault: add a pattern matching that phrase to the file — the marker must come out. Revert: remove the pattern — the phrase passes again. For a missing file: rename it — a `НЕ НАЙДЕН` line appears in `journalctl -t transcribe-correct-wrap`; rename it back — new lines stop appearing.

## Подстановка терминов · Term substitution

Зачем. Корректор иногда портит верно расслышанные термины («пул реквест» → «пул-реквест», «пич кит» → «Пич. кит»). Пары `zameny.tsv` возвращают термин: до корректора (чтобы тот не успел исказить сырое) и после (если исказил всё равно).

Why. The corrector sometimes spoils correctly heard terms ("пул реквест" → "пул-реквест", "пич кит" → "Пич. кит"). The `zameny.tsv` pairs restore the term: before the corrector (so it has no chance to distort the raw text) and after (if it did anyway).

Чего НЕ ловит. Неверно расслышанное слово, для которого нет пары. Пары применяются дважды: пара, которая при повторе даёт другой результат (вида «X → X-что-то»), развернётся дважды. Битая строка пропускается одна, её номер пишется в `SAGE_LOG`; если журнал недоступен на запись, подстановка не работает вовсе (в stderr вызывающего — только ошибка оболочки).

What it does NOT catch. A misheard word that has no pair. Pairs are applied twice: a pair that gives a different result on repeat (of the form "X → X-something") expands twice. A broken line is skipped alone, its number goes to `SAGE_LOG`; if the log is not writable, substitution does not run at all (only a shell error on the caller's stderr).

## Корректор · Corrector

Зачем. Корректор — улучшение, а не условие работы. Любой его сбой (нет сокета, нет клиента, тайм-аут, пустой ответ) приводит к выдаче сырого текста, код возврата сохраняется. Длинный текст режется на куски ≤ `SAGE_KUSOK` знаков, чтобы ни один кусок не упирался в предел клиента; общий бюджет `SAGE_BUDZHET` держит распознавание в пределе ожидания канала.

Why. The corrector is an improvement, not a precondition. Any failure (no socket, no client, timeout, empty reply) results in raw text; the exit code is preserved. Long text is cut into chunks ≤ `SAGE_KUSOK` characters so no chunk hits the client's limit; the overall `SAGE_BUDZHET` budget keeps recognition within the channel's wait limit.

Каждый кусок, ушедший без коррекции, считается. В `SAGE_LOG` пишется строка на каждый такой кусок и итог `ИТОГ корректора: кусков N · без коррекции M · знаков L · T с`. Если M ≠ 0 или итога нет вовсе (помощник упал или его оборвал предел 70 с), строка `🔴 корректор: …` уходит в журнал системы.

Every chunk that went uncorrected is counted. `SAGE_LOG` gets a line per such chunk and a summary `ИТОГ корректора: кусков N · без коррекции M · знаков L · T с` (chunks N · uncorrected M · characters L · T s). If M ≠ 0 or there is no summary at all (the helper crashed or was cut by the 70 s limit), a line `🔴 корректор: …` goes to the system journal.

Чего НЕ ловит. Неверный, но непустой ответ корректора уходит пользователю как есть. Если `mktemp` не смог создать файл итога, счёт молча пропадает, хотя коррекция идёт. Предусловия (код 0, текст, интерпретатор, клиент, сокет) проверяются молча: при их невыполнении ни счёта, ни строки нет.

What it does NOT catch. A wrong but non-empty corrector reply goes to the user as is. If `mktemp` could not create the summary file, the count is silently lost although correction runs. Preconditions (exit 0, text, interpreter, client, socket) are checked silently: when they fail there is neither a count nor a line.

Как проверить. Сравните вывод `transcribe-correct-wrap` и внутреннего распознавателя на одном файле с русской речью без пунктуации: разница в знаках препинания означает, что корректор работает; в `SAGE_LOG` должна появиться строка `ИТОГ корректора` с `без коррекции 0`. Порча: задайте `SAGE_BUDZHET=0` — все куски уйдут сырыми, в журнале системы появится строка `🔴 корректор`. Возврат: уберите переменную — снова `без коррекции 0`, новых строк в журнале системы нет.

How to test. Compare the output of `transcribe-correct-wrap` and the inner transcriber on the same Russian speech file without punctuation: a difference in punctuation means the corrector works; `SAGE_LOG` must get an `ИТОГ корректора` line with `без коррекции 0`. Fault: set `SAGE_BUDZHET=0` — all chunks go raw, a `🔴 корректор` line appears in the system journal. Revert: remove the variable — `без коррекции 0` again, no new system journal lines.

## Готовность юнитов · Unit readiness

Зачем. `ExecStartPost` не даёт systemd объявить службу готовой, пока она реально не готова: `whisper-warm` — пока порт не ответит (до 90 попыток, пауза 1 с, общий предел `TimeoutStartSec=180`); `sage-warm` — пока не появится сокет (до 180 проверок раз в секунду, предел `TimeoutStartSec=200`).

Why. `ExecStartPost` keeps systemd from declaring a service ready until it really is: `whisper-warm` — until the port answers (up to 90 attempts, 1 s pause, overall limit `TimeoutStartSec=180`); `sage-warm` — until the socket appears (up to 180 checks once a second, limit `TimeoutStartSec=200`).

Чего НЕ ловит. Отвечающий порт не значит, что модель на GPU и что распознавание работает; существующий сокет не значит, что корректор отвечает. Проверяйте расшифровкой настоящей речи и пунктами 4–5 приёмки в README. У `sage-warm` перезапуск `Restart=always`: служба, падающая сразу после старта, будет подниматься по кругу каждые 3 с — смотрите `journalctl -u sage-warm`, а не только `is-active`.

What it does NOT catch. An answering port does not mean the model is on the GPU or that recognition works; an existing socket does not mean the corrector answers. Check with a transcript of real speech and acceptance points 4–5 in the README. `sage-warm` has `Restart=always`: a service that dies right after start will be brought up in a loop every 3 s — look at `journalctl -u sage-warm`, not only `is-active`.

## Дополнительные инструменты · Additional tools

golos-watch — читатель новых строк корректора и проверяльщик команды каждой учётки; без внешнего запуска не действует. Проверка test/stend-voice-tools.py изолирует зависимые команды; не подменяет живую приёмку речи/GPU.

golos-watch reads new corrector alerts and checks each account command; it needs an external caller. test/stend-voice-tools.py isolates dependent commands and does not replace live speech/GPU acceptance.

## Диагностика отключённого архива · Disabled archive diagnostic

Вызывающий канал получает строку stderr при пустом `PENDING_DIR` после чтения конфига. Уведомление появляется один раз за вызов и не запускает повторов. Оно не обнаруживает отказ копирования при непустом каталоге и не доказывает запись архива. Назначенного автоматического читателя этой строки пакет не добавляет.

The calling channel receives a stderr line when `PENDING_DIR` is empty after the config is read. The notification occurs once per invocation and starts no retries. It does not detect a failed copy to a non-empty directory or prove that an archive was written. The package adds no designated automatic reader for this line.

Стенд `python3 test/stend-archive-warning.py` выполняет настоящую обёртку с временным распознавателем и файлами. Проверяет пустую настройку, приоритет конфига, сохранение аудио и текста, отсутствие ключевого слова, пустой текст и ошибку распознавателя; живые модели и службы не запускает.

The stand `python3 test/stend-archive-warning.py` executes the actual wrapper with a temporary transcriber and files. It checks empty settings, config precedence, audio and text capture, a non-keyword, empty text and a transcriber error; it starts no live models or services.
