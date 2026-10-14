# Защиты и проверка · Guards and verification

Отправщик зовётся сторожами и службами, его результат читают вызывающий и владелец канала. Метка `DSH_PROBA=1` защищает только agent-alert от отправки: сама проба ставит её в окружение процесса. Один вызов заканчивается сразу после строки журнала; без метки эта защита не применяется. Не ловит забывшую метку пробу, чтение чужих утилит и записи курсора/обрезки.

Watchers and services call the sender; the caller and channel owner read its result. `DSH_PROBA=1` protects only agent-alert from sending: the probe sets it in its process environment. A single invocation ends immediately after the journal entry; without the mark this guard does not apply. It misses probes that forget the mark, reads by other utilities, and cursor/trimmer writes.

Проверку настройки `agent-alert --proverit-nastrojku` зовёт сторож узла каждый такт; исход он читает по коду и признаку «НАСТРОЙКА ГОДНА» и шлёт свою тревогу при отказе или несостоявшейся проверке. Режим ловит: неразрешимую настройку, отсутствие файла токена или чата, нечитаемость текущей учёткой, пустую первую строку. Не ловит: принимает ли Telegram токен и существует ли чат (это знает только отправка); при зове от root — нечитаемость для учётки другого вызывающего.

The node watcher calls `agent-alert --proverit-nastrojku` every cycle; it reads the exit code and the “НАСТРОЙКА ГОДНА” marker and raises its own alert on refusal or on a check that did not run. The mode catches unresolvable settings, missing token or chat files, unreadability for the current account and an empty first line. It misses whether Telegram accepts the token and whether the chat exists (only a send can tell) and, when called by root, unreadability for another caller's account.

Сетевой повтор ограничен числом попыток и таймаутом каждой; при умолчании 3×20 + 5 + 15 = 80 с сетевого ожидания плюс локальная обработка и хвост до 5 с. Повторяются сеть/не-JSON/5xx/429, постоянный серверный отказ завершается первой попыткой. При настроечных максимумах 10×300 + 9×300 = 5700 с сетевого ожидания; это верхняя граница настройки, не автоматический общий дедлайн.

Network retries are bounded by attempts and per-attempt timeout; defaults allow 3×20 + 5 + 15 = 80 s of network waiting plus local work and up to 5 s for the tail. Network/5xx/429/non-JSON failures retry; permanent server refusal ends on the first attempt. Configuration maxima allow 10×300 + 9×300 = 5700 s of network waiting; this is a settings upper bound, not an automatic total deadline.

Обрезку зовёт часовой таймер; исход читает администратор в журнале службы. Она ждёт flock не более 30 с и держит последние 200 строк по умолчанию, сохраняет inode/права. Не обнаруживает отсутствие вызовов, подмену файла вне замка и неизвестную конкуренцию читателей.

An hourly timer calls trimming; the administrator reads its service journal. It waits no more than 30 s for flock and keeps the last 200 lines by default, preserving inode/permissions. It does not detect missing invocations, file replacement outside the lock or unknown reader concurrency.

Суточный читатель ключей зовётся таймером, результат читает владелец канала тревог. Один прогон обрабатывает доступное окно, до 8 строк примеров в сообщении, вызов канала ждёт не более 120 с. Он не считает другие отказы или непозванный отправщик; потерянные при ротации строки делают окно неполным. Отдельный системный сторож должен следить, что таймер вызывается; этот пакет такого сторожа не содержит.

A daily timer calls the option-refusal reader; the alert channel owner reads its result. A pass handles the available window, includes up to 8 example rows in an alert and waits at most 120 s for the channel. It does not count other refusals or uncalled senders; rotated-away entries make its window incomplete. A separate system watcher must check timer invocation; this package does not include one.

Полный набор запускается `bash test/vse-stendy.sh` или `npm test`, один обход без повторов; каждый код снимается сразу. Вызывающий монтажный проверяльщик/администратор читает вывод и конечный код. Стенды используют настоящие копии кода; сеть, журнал и каналы подставные, состояние временное.

Run the full suite with `bash test/vse-stendy.sh` or `npm test`, one pass with no retries; each exit code is captured immediately. The deployment checker/administrator reads its output and final code. Tests exercise real code copies; network, journal and channels are doubles and state is temporary.

| Стенд · Test | Что проверяет · Coverage | Вне проверки · Exclusions |
|---|---|---|
| `stend-agent-alert.sh` | 31 проверка (от root — 30: нечитаемость файла не воспроизводится): отправка/отказ/повтор, HTML UTF-16 и plain fallback, проверка настройки · 31 checks (30 as root: unreadability is not reproducible): send/refusal/retry, HTML UTF-16 and plain fallback, configuration check | Живой канал, права другой руки, одновременная отправка · Live channel, other-account permissions, concurrent sends |
| `stend-nastroek-proby.py` | Метка, отказ неизвестного ввода/config, env/config приоритет, токен через stdin, argv и `/proc/self/cmdline`, очистка ответа, inode/права, config сторожа · Probe mark, invalid input/config, precedence, stdin token, argv and process cmdline, response redaction, inode/modes, watcher config | Универсальный фильтр секретов, реальные журналы/токены · General secret filtering, real journals/tokens |
| `stend-watch-hvost.py` | 8 сценариев курсора и хвоста, отказ/возврат канала, первый вызов, пустое окно и print-only · 8 cursor/tail scenarios, channel refusal/recovery, first call, empty window and print-only | Ротация, конкуренция нескольких писателей · Rotation and concurrent writers |
| `stend-porchi.py` | Четыре порчи настоящего кода: метка пробы, текст пробы в журнале, токен в argv, снятие очистки ответа; каждая `0 → 1 → 0`, grep-F и SHA · Four real-code mutations: probe mark, probe text in the journal, token argv, removed response redaction; each `0 → 1 → 0`, grep-F and SHA | Все возможные классы ошибок · All possible bug classes |
| stend-audit-kraev.py | 32 краевых методов: HTML/HTTP/разрешения/курсор/help; реальные nobody и root-группа только процесса · 32 edge methods, including actual nobody/process-only journal groups | Telegram/journald/manager live — вне проверки |
| stend-audit-porchi.py | Источниковые порчи исправлений 0→1→0, grep-F/SHA · Source mutations with recovery | Все возможные сбои/реальные системные юниты не покрыты |
| stend-audit-deadline.py | реальный helper и отделившийся pipe-holder · actual bounded helper | короткий0.1с-прогон, не ожидание120с · scaled timing |
| stend-audit-yunits.py | два offline unit parser, NNP fault/recovery · two offline unit consumers | юниты не запускаются · no live unit start |

3.1.1: retry_after≤300с, default3/max10 попыток; с default timeout и retry_after сетевое ожидание до660с, абсолютного общего дедлайна нет. pending/lock защищают от повторной автоматической отправки окна, заканчиваются commit-only после подтверждённой отправки либо отказом2 до ручного разбора неизвестного исхода. Не защищают от дубликата внутри сетевых повторов и от ротации журнала. Проверка прав токена — только --proverit-nastrojku, не универсальный ACL-аудит.

3.1.1:retry_after≤300s, default3/max10 attempts; default request timeouts with retry_after allow up to660s of network waiting, without an absolute total deadline. Pending/lock prevent automated window replay: commit-only after confirmed sending, or exit2 until an operator resolves unknown delivery. They do not prevent duplicates inside network retries or journal rotation. Token rights are checked by --proverit-nastrojku only, not a general ACL audit.


Предупреждение о слепоте журнала — отдельный сигнал: один вызов канала за такт, может повторяться следующие сутки при продолжающейся слепоте. Pending защищает только прочитанное окно отказов. Дедлайн120с/30с/5с после timeout убивает группу и закрывает pipe, без бесконечного drain; ожидание прямого потомка после kill не более5с. Отделившийся собственным setsid потомок может продолжить работу: исход доставки остаётся неизвестным, это не доказательство отсутствия отправки.

Journal-blindness notices are a separate signal: one channel call per tick, repeated on later days while blindness continues. Pending protects only a read refusal window. Channel120s/journal30s/logger5s deadlines kill the process group and close pipes without an unbounded drain; direct-child wait after kill is bounded by5s. A descendant that creates another session may continue: delivery remains unknown, not proven absent.
