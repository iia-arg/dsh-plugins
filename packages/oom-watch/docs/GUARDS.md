# Сторожа и проверки oom-watch · oom-watch guards and checks

Автор · Author: Aleksandr Argelander · Лицензия · License: MIT · Код · Code: `bin/oom-watch` 3.1.4

Сам `oom-watch` — сторож. Внутри у него проверки, каждая закрывает конкретный способ промолчать или соврать. Для каждой ниже: что ловит, чего **не** ловит, куда кричит, как читать. Правило, общее для всех: частичная защита не объявляется защитой всего класса — поэтому у каждой проверки граница названа отдельно.

`oom-watch` itself is a watchdog. Inside it has checks, each closing one specific way to stay silent or to lie. For each one below: what it catches, what it does **not** catch, where it reports, how to read it. One rule for all: a partial guard is not declared a guard of the whole class — so each check has its boundary named separately.

## Куда кричит сторож · Where the watchdog reports

| Канал · Channel | Что туда идёт · What goes there | Как читать · How to read |
|---|---|---|
| stderr → журнал службы · service journal | всё: тревоги, служебные строки, трассировки · everything: alerts, service lines, tracebacks | `journalctl -u oom-watch.service` |
| `OOM_WATCH_ALERT` (stdin) | тревоги об убийствах, тревога об ошибке чтения курсора, тревоги «СЛЕПОТА» (при каждом слепом запуске) · kill alerts, cursor read-error alert, «СЛЕПОТА» (blindness) alerts (on every blind run) | ваш канал · your channel |
| код выхода · exit code | 0 — проход отработал (в том числе с недоставленными тревогами); 2 — слепота (включая JSON/MESSAGE/_BOOT_ID), ошибка чтения, неизвестный довод или относительный канал, юнит `failed`; 1 — только неперехваченная ошибка Python · 0 — the pass completed (including with undelivered alerts); 2 — blindness (including JSON/MESSAGE/_BOOT_ID), a read error, unknown argument or relative channel, unit `failed`; 1 — only an uncaught Python error | `systemctl status oom-watch.service`, `systemctl --failed` |

Служебные строки начинаются с `🔴 OOM-KILL:`, тревоги слепоты — с `СЛЕПОТА:` (без значка и без `OOM-KILL`); тревоги об убийствах — с `🔴 Убийство по памяти` (групповое) или `🔴 ПАМЯТЬ КОНЧИЛАСЬ` (глобальное).

Service lines start with `🔴 OOM-KILL:`, blindness alerts with `СЛЕПОТА:` (BLINDNESS; no icon and no `OOM-KILL`); kill alerts start with `🔴 Убийство по памяти` (cgroup kill) or `🔴 ПАМЯТЬ КОНЧИЛАСЬ` (global kill).

## 1. Связь строк по pid · Pid pairing

**Что ловит.** Ядро печатает одно убийство несколькими строками: юнит — в строке `oom-kill:constraint=…`, числа — в строке `…: Killed process …`. Сторож связывает их по загрузке `_BOOT_ID` и номеру процесса одним хронологическим проходом; завершённая пара удаляется. Это ловит ложную пару «имя одной службы — числа другой», которую даёт склейка по порядку при двух близких убийствах или потерянной строке (`printk: N messages suppressed`). Замер на одном входе с одной пропущенной строкой `oom-kill:`: склейка по порядку назвала `svc-b.service` с чужими 16128 kB; связь по pid честно сказала «не определена».

**What it catches.** The kernel prints one kill as several lines: the unit in the `oom-kill:constraint=…` line, the numbers in the `…: Killed process …` line. The watchdog joins them by `_BOOT_ID` and process id in one chronological pass; a completed pair is removed. This catches the false pair "one unit's name, another unit's numbers" that by-order pairing produces with two close kills or a dropped line (`printk: N messages suppressed`). Measured on one input with one `oom-kill:` line missing: by-order pairing named `svc-b.service` with someone else's 16128 kB; pid pairing honestly said "not identified".

**Чего НЕ ловит.**
- Потерю строки `Killed process`: тревогу порождает только она. Если до журнала дошла лишь строка `constraint`, убийство проходит **молча**.
- Две незавершённые строки constraint с одинаковыми boot + pid до строки Killed process: новая заменяет прежнюю. Незавершённые пары между проходами не хранятся. Без годного `_BOOT_ID` связь не выполняется: тревога с неузнанной службой и именованная слепота, код 2.
- Ядро другого формата строк. Разбор сверен с образом ядра 6.8; на других версиях формат не проверялся.

**What it does NOT catch.**
- A lost `Killed process` line: only that line produces an alert. If only the `constraint` line reached the journal, the kill passes **silently**.
- Two unfinished constraint lines with the same boot + pid before Killed process: the new one replaces the old one. Unfinished pairs do not survive between passes. Without a valid `_BOOT_ID`, there is no pairing: an unknown-unit alert plus named blindness and exit 2.
- A kernel with a different line format. Parsing was checked against a 6.8 kernel image; other versions were not checked.

**Куда кричит.** В текст тревоги: строка `Служба: не определена (строки ядра не сошлись по номеру процесса)`.

**Where it reports.** In the alert text: the line `Служба: не определена (строки ядра не сошлись по номеру процесса)` (unit not identified, kernel lines did not pair by pid).

**Как читать.** Ищите в ядерном журнале рядом с временем тревоги строку `oom-kill:` с тем же pid: `journalctl _TRANSPORT=kernel | grep 'pid=<N>'`. Если она есть, а юнит всё равно не определён — смотрите путь cgroup в ней: вероятно, это не `.service` (см. ниже).

**How to read.** Look in the kernel journal near the alert time for an `oom-kill:` line with the same pid: `journalctl _TRANSPORT=kernel | grep 'pid=<N>'`. If it is there and the unit is still unidentified, look at the cgroup path in it: it is probably not a `.service` (see below).

⚠️ Тот же текст «не сошлись по номеру процесса» печатается, когда пара по pid **нашлась**, но последний сегмент пути cgroup не оканчивается на `.service`: сессия `*.scope`, корень `/`, slice, вложенная под-cgroup службы (`…/foo.service/worker`). Причина в тексте тогда неверна — см. [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

⚠️ The same "did not pair by pid" text is printed when the pid pair **was found** but the last cgroup path segment does not end in `.service`: a `*.scope` session, the root `/`, a slice, a nested sub-cgroup of a service (`…/foo.service/worker`). The stated reason is then wrong — see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 2. Неопознанное убийство тревожит всегда · Unidentified kill always alerts

**Что ловит.** Если юнит не определён, фильтр `OOM_WATCH_UNITS` к убийству не применяется — тревога уходит всегда. Так дефект разбора (или неожиданный путь cgroup) не превращается в молчание.

**What it catches.** If the unit is not identified, the `OOM_WATCH_UNITS` filter does not apply to the kill — the alert always goes out. So a parsing defect (or an unexpected cgroup path) does not turn into silence.

**Чего НЕ ловит.** Ошибку в самом списке: узнанный юнит, записанный в список с опечаткой или без `.service`, фильтруется молча — даже в журнал службы ничего не пишется. Эта проверка защищает от дефекта разбора, а не от дефекта настройки.

**What it does NOT catch.** An error in the list itself: an identified unit written into the list with a typo or without `.service` is filtered silently — nothing is written even to the service journal. This check guards against a parsing defect, not against a configuration defect.

**Куда кричит.** Обычная тревога с «Служба: не определена». **How it reports:** a normal alert with "Служба: не определена" (unit not identified).

## 3. Глобальное убийство тревожит всегда · Global kill always alerts

**Что ловит.** Убийства с `constraint` = `CONSTRAINT_NONE`, `CONSTRAINT_CPUSET`, `CONSTRAINT_MEMORY_POLICY` или с префиксом строки не `Memory cgroup…` (если строка `constraint` потеряна) идут в тревогу независимо от `OOM_WATCH_UNITS`: список отвечает на вопрос «чьи пределы мы стережём», а глобальная нехватка памяти — не про чей-то предел. Тревога не печатает предела и процента и прямо говорит «Причина НЕ в этой службе». Строка ядра распознаётся по `: Killed process`, а не по префиксу, — поэтому ловятся все три текста ядра, включая `Out of memory (oom_kill_allocating_task)`.

**What it catches.** Kills with `constraint` = `CONSTRAINT_NONE`, `CONSTRAINT_CPUSET`, `CONSTRAINT_MEMORY_POLICY`, or with a line prefix other than `Memory cgroup…` (if the `constraint` line was lost), alert regardless of `OOM_WATCH_UNITS`: the list answers "whose limits do we guard", and a machine-wide shortage is not about anyone's limit. The alert prints no limit or percentage and says plainly "Причина НЕ в этой службе" (the cause is NOT this unit). The kernel line is recognised by `: Killed process`, not by its prefix — so all three kernel texts are caught, including `Out of memory (oom_kill_allocating_task)`.

**Чего НЕ ловит.**
- Причину: тревога называет жертву, а не того, кто съел память.
- Память машины на момент убийства: строка «Память машины» — это `/proc/meminfo` **сейчас**, и так и подписана.
- Убийства `systemd-oomd` (пользовательское пространство): у них свои строки журнала, не ядерные.

**What it does NOT catch.**
- The cause: the alert names the victim, not who ate the memory.
- Host memory at the time of the kill: the "Память машины" (host memory) line is `/proc/meminfo` **now**, and is labelled so.
- `systemd-oomd` kills (userspace): they have their own journal lines, not kernel ones.

**Куда кричит.** Тревога `🔴 ПАМЯТЬ КОНЧИЛАСЬ НА ВСЕЙ МАШИНЕ …`. **How it reports:** the alert `🔴 ПАМЯТЬ КОНЧИЛАСЬ НА ВСЕЙ МАШИНЕ …` (memory ran out on the whole machine).

## 4. Сброс курсора при ошибке чтения · Cursor reset on read error

**Что ловит.** `journalctl --after-cursor` вернул ненулевой код. Без этой проверки сторож ослеп бы навсегда: курсор не двигается, каждый запуск падает на том же месте, жалоба уходит только в журнал службы, который никто не читает. Замер до исправления: три запуска подряд, три одинаковые жалобы, курсор не изменился. Теперь — тревога наружу через канал, сдвиг курсора на текущую позицию и выход с кодом 2: окно не проверено, поэтому проход не считается успешным, и юнит `oneshot` становится `failed`. Следующий запуск читает уже от новой позиции. Граница: сдвиг **только** при ошибке; пустой ответ журнала — это «убийств не было», курсор не трогается.

**What it catches.** `journalctl --after-cursor` returned a non-zero code. Without this check the watchdog would go blind forever: the cursor never moves, every run fails at the same place, the complaint goes only to the service journal nobody reads. Measured before the fix: three runs in a row, three identical complaints, the cursor unchanged. Now — an outward alert through the channel, the cursor moved to the current position and exit code 2: the window was not checked, so the pass does not count as a success, and the `oneshot` unit becomes `failed`. The next run reads from the new position. Boundary: the move happens **only** on an error; an empty journal answer means "no kills" and leaves the cursor alone.

**Чего НЕ ловит.**
- **Убийства в пропущенном окне.** Окно между старым и новым курсором не проверяется — тревога говорит об этом прямо.
- **Вычищенный или чужой журнал при курсоре правильного вида.** Проба на systemd 255: курсор с подменённым идентификатором журнала `journalctl` принял с кодом 0 и выдал записи с ближайшего места; ненулевой код (`Failed to seek to cursor: Invalid argument`) дали только испорченный и пустой курсоры. Значит, после вычистки журнала (`journalctl --vacuum-*`, ротация) эта проверка, скорее всего, **не срабатывает**, и убийства из вычищенной части теряются без тревоги. Комментарий в коде называет «журнал вычищен» среди причин срабатывания — проба этого не подтверждает.
- **Если и текущую позицию получить нельзя.** `journalctl` не запустился, ответил ненулевым кодом (например, нет прав) или ответил кодом 0 без строки курсора — это уже слепота: проверка 8, тревога «СЛЕПОТА», выход с кодом 2; тревога «не удалось прочитать ядерный лог» в этом случае не уходит, курсор не меняется, и так при каждом запуске.

**What it does NOT catch.**
- **Kills in the skipped window.** The window between the old and the new cursor is not checked — the alert says so plainly.
- **A vacuumed or foreign journal with a well-formed cursor.** Probe on systemd 255: a cursor with a substituted journal identifier was accepted by `journalctl` with code 0, returning entries from the nearest place; a non-zero code (`Failed to seek to cursor: Invalid argument`) came only from a corrupted and an empty cursor. So after a journal vacuum (`journalctl --vacuum-*`, rotation) this check most likely **does not fire**, and kills from the vacuumed part are lost without an alert. The code comment lists "journal vacuumed" among the triggers — the probe does not confirm that.
- **If the current position cannot be obtained either.** `journalctl` failed to start, exited non-zero (e.g. no permission) or exited 0 without a cursor line — that is blindness: check 8, a «СЛЕПОТА» alert, exit code 2; the "could not read the kernel log" alert does not go out in this case, the cursor stays, and so on every run.

**Куда кричит.** Через `notify` — в журнал службы и в канал:

**Where it reports.** Via `notify` — to the service journal and the channel:

```
🔴 OOM-KILL: не удалось прочитать ядерный лог (rc=1).
Позиция сброшена на текущую — …, но окно до этого момента
НЕ проверено: убийства в нём, если были, пропущены.
```

(Вторая строка примера сокращена; полный текст — в `bin/oom-watch`. Если текущая позиция недоступна, `current_cursor()` сообщает «СЛЕПОТА», выходит 2 и не возвращается в ветку сброса.)

(The second line above is shortened; full text is in `bin/oom-watch`. If the current position cannot be obtained, `current_cursor()` reports blindness and exits 2 without returning to the reset branch.)

## 5. Молчание первого запуска · First-run silence

**Что ловит.** Первый запуск (файла `cursor` нет) не тревожит о прошлом: иначе установка на машину с долгой историей вывалила бы все старые убийства разом. Он записывает текущую позицию и пишет в журнал службы `🔴 OOM-KILL: сторож поднят, слежу за ядерным логом с этой позиции`.

**What it catches.** The first run (no `cursor` file) does not alert about the past: otherwise installing on a machine with a long history would dump every old kill at once. It records the current position and writes `🔴 OOM-KILL: сторож поднят, слежу за ядерным логом с этой позиции` (watchdog is up, watching the kernel log from this position) to the service journal.

**Чего НЕ ловит.**
- **Пустой ядерный журнал и отсутствие прав.** Если позицию не добыть (`journalctl` не запустился, код не 0, или код 0 без строки курсора — так выглядит и совсем пустой ядерный журнал), это не «первый запуск», а слепота: проверка 8, тревога «СЛЕПОТА», выход 2, файл `cursor` не пишется.
- **Убийства до первого запуска** и убийства между потерей курсора (смена `OOM_WATCH_STATE`, каталог на tmpfs после перезагрузки) и новым «первым запуском» — молча пропускаются по устройству.
- Строка «сторож поднят» во внешний канал **не** уходит — только в журнал службы.

**What it does NOT catch.**
- **An empty kernel journal and no permission.** If the position cannot be obtained (`journalctl` failed to start, a non-zero code, or code 0 without a cursor line — a completely empty kernel journal looks like this too), that is not a "first run" but blindness: check 8, a «СЛЕПОТА» alert, exit 2, no `cursor` file written.
- **Kills before the first run**, and kills between losing the cursor (a changed `OOM_WATCH_STATE`, a tmpfs directory after a reboot) and the new "first run" — skipped silently by design.
- The "watchdog is up" line does **not** go to the external channel — only to the service journal.

**Куда кричит.** Только журнал службы. **Where it reports:** the service journal only.

## 6. Запасной путь при отказе канала · Alert-channel failure fallback

**Что ловит.** Тревога **сначала** печатается в stderr (журнал службы) и только потом идёт в канал — поэтому отказ канала не теряет тревогу целиком. Если путь канала не исполним — строка `🔴 OOM-KILL: тревога НЕ доставлена (канал <путь> недоступен) — остаётся только журнал`; если канал вернул не 0 — `… (канал <путь> ответил кодом <N>) — остаётся только журнал`. Сторож при этом не падает и продолжает обработку остальных убийств. Зависание и исключение при запуске канала — проверка 7.

**What it catches.** The alert is printed to stderr (the service journal) **first** and only then goes to the channel — so a channel failure does not lose the alert entirely. If the channel path is not executable — the line `🔴 OOM-KILL: тревога НЕ доставлена (канал <path> недоступен) — остаётся только журнал` (alert NOT delivered, channel unavailable, journal only); if the channel exits non-zero — `… (канал <path> ответил кодом <N>) — остаётся только журнал` (channel exited with code N). The watchdog does not crash and goes on with the remaining kills. A hang and a launch exception are check 7.

**Чего НЕ ловит.**
- **Канал вернул 0, но ничего не доставил.** Сторож верит коду возврата; вывод канала перехватывается и не печатается.
- **Относительный путь/имя из PATH** — отказ кодом 2 до чтения журнала и создания состояния. Абсолютная строка с аргументами проверяется как одно имя файла; для аргументов нужна wrapper. См. [SETTINGS.md](SETTINGS.md).
- О сбое канала сообщается **только** в журнал службы — то есть туда, куда, по замыслу пакета, никто не смотрит. Внешнего второго канала нет.

**What it does NOT catch.**
- **A channel that exits 0 but delivered nothing.** The watchdog trusts the exit code; the channel's output is captured and not printed.
- **A relative path or name from PATH** — refused with exit 2 before journal reading or state creation. An absolute string containing arguments is checked as one filename; arguments need a wrapper. See [SETTINGS.md](SETTINGS.md).
- A channel failure is reported **only** to the service journal — that is, where, by the package's own premise, nobody looks. There is no second external channel.

**Куда кричит.** Только журнал службы. **Where it reports:** the service journal only.

## 7. Перехват сбоя доставки · Catching alert-delivery failures

**Что ловит.** Вызов канала ограничен 20 секундами (`ALERT_TIMEOUT` — константа в коде, не переменная окружения), и любое исключение при запуске канала перехватывается: например, `OSError: [Errno 8] Exec format error` у исполняемого файла без шебанга или ошибка прав. Любой сбой — таймаут, исключение, ненулевой код, неисполнимый путь — даёт одну строку в stderr `🔴 OOM-KILL: тревога НЕ доставлена (<причина>) — остаётся только журнал`, и проход идёт до конца: остальные убийства обрабатываются, курсор записывается. Прежде исключение при запуске обрывало проход с кодом 1 до записи курсора — те же тревоги повторялись каждую минуту, а наружу не уходило ничего; зависший канал держал `oneshot` без предела (проба: зависание канала на 60 с держало проход 60 с, теперь — 20 с).

**What it catches.** The channel call is limited to 20 seconds (`ALERT_TIMEOUT` — a constant in the code, not an environment variable), and any exception while launching the channel is caught: for example `OSError: [Errno 8] Exec format error` for an executable without a shebang, or a permission error. Any failure — a timeout, an exception, a non-zero exit, a non-executable path — gives one stderr line `🔴 OOM-KILL: тревога НЕ доставлена (<reason>) — остаётся только журнал` (alert NOT delivered, journal only), and the pass runs to the end: the remaining kills are processed, the cursor is written. Previously a launch exception aborted the pass with exit code 1 before the cursor was saved — the same alerts repeated every minute and nothing went out; a hung channel held the `oneshot` without limit (probe: a 60 s channel hang held the pass for 60 s, now 20 s).

**Чего НЕ ловит.**
- Канал, ответивший кодом 0, но не доставивший сообщение дальше.
- Повторную доставку: недоставленная тревога не повторяется ни следующим проходом, ни позже — курсор уже сдвинут, тревога есть только в журнале службы.
- Сумму ожиданий: 20 с — предел на **один** вызов; при N тревогах в одном проходе он может длиться до N×20 с.

**What it does NOT catch.**
- A channel that exits 0 but does not deliver the message further.
- Redelivery: an undelivered alert is not retried by the next pass or later — the cursor has already moved, the alert exists only in the service journal.
- The sum of waits: 20 s is the limit for **one** call; with N alerts in one pass the pass can last up to N×20 s.

**Куда кричит.** Только журнал службы. Причины в скобках дословно: `канал <путь> не ответил за 20 с`, `канал <путь> не запустился: <тип>: <текст>`, `канал <путь> ответил кодом <N>`, `канал <путь> недоступен`.

**Where it reports.** The service journal only. The reasons in brackets, verbatim: `канал <path> не ответил за 20 с` (did not answer within 20 s), `канал <path> не запустился: <type>: <text>` (failed to launch), `канал <path> ответил кодом <N>` (exited with code N), `канал <path> недоступен` (unavailable).

## Неподдержанные данные и вывод · Unsupported data and rendering

Неразборчивый JSON, не-объект JSON, MESSAGE не строкой и OOM-записи без годного `_BOOT_ID` дают именованную слепоту и код 2 после обработки пригодных событий. Cursor может продвинуться по последнему декодированному объекту с годной меткой; пропущенное окно не проверено и не повторяется. Динамический вывод заменяет непечатные символы пробелами и экранирует HTML; filter и systemctl получают исходную identity.

Invalid JSON, non-object JSON, nonstring MESSAGE and OOM entries without a valid `_BOOT_ID` yield named blindness and exit 2 after usable events are processed. The cursor may advance from the last decoded object with a valid cursor; skipped records remain unchecked and are not retried. Dynamic output replaces nonprintable characters with spaces and escapes HTML; filtering and systemctl receive the raw identity.

User-manager unit печатается полным cgroup-путём, не опрашивается у системного manager; его MemoryMax/Restart не проверяются. Фильтр `foo.service` не включает user path; нужен весь путь либо пустой фильтр.

A user-manager unit is shown by its full cgroup path and never queried from the system manager; its MemoryMax/Restart are unchecked. The `foo.service` filter does not include a user path; use the entire path or an empty filter.

## 8. Слепота: тревога «СЛЕПОТА» и код выхода 2 · Blindness: a «СЛЕПОТА» alert and exit code 2

**Что ловит.** Сторож не может добыть ядерный журнал или позицию в нём. Срабатывает в трёх местах:
- `current_cursor()` — позиция последней записи (`journalctl _TRANSPORT=kernel -n 1 --show-cursor`) нужна на первом запуске (курсора ещё нет) и в ветке ошибки чтения (проверка 4). Слепотой считаются три исхода: `journalctl` не запустился (`OSError`); ответил ненулевым кодом — обычно у службы нет прав чтения журнала (историческая проба с `journalctl -k` от учётки без доступа дала код 1, `No journal files were opened due to insufficient permissions` и отсутствие курсора; новая команда на живом журнале отдельно не измерена); ответил кодом 0 без строки курсора (так выглядит и совсем пустой ядерный журнал на первом запуске — это тоже слепота, а не тихий повтор). Тревога: `СЛЕПОТА: не добыт курсор ядерного журнала: <причина>.`, где причина — `journalctl не запущен (<тип ошибки>)`, `journalctl код <N>` или `journalctl код 0, но метки cursor нет`;
- основное чтение (`journalctl --after-cursor`) не запустилось (`OSError`): тревога `СЛЕПОТА: не добыт ядерный журнал: journalctl не запущен (<тип ошибки>).`

Во всех случаях тревога идёт через `notify` (журнал службы и канал, если задан), и сторож выходит с кодом 2: проход не считается успешным, юнит `oneshot` становится `failed` и виден в `systemctl status oom-watch.service` и `systemctl --failed`. Файл `cursor` не меняется. Тревога о слепоте идёт тем же `notify` с таймаутом и перехватом (проверка 7), поэтому сломанный канал этот путь не роняет: недоставка даёт строку «тревога НЕ доставлена», а код выхода остаётся 2.

**What it catches.** The watchdog cannot obtain the kernel journal or a position in it. It fires in three places:
- `current_cursor()` — the position of the last entry (`journalctl _TRANSPORT=kernel -n 1 --show-cursor`) is needed on the first run (no cursor yet) and in the read-error branch (check 4). Three outcomes count as blindness: `journalctl` failed to start (`OSError`); it exited non-zero — usually the service lacks journal read permission (a historical `journalctl -k` probe from an account without access returned 1, `No journal files were opened due to insufficient permissions` and no cursor line; the new command has not been measured independently on a live journal); it exited 0 without a cursor line (a completely empty kernel journal on the first run looks like this too — that is also blindness, not a silent retry). Alert: `СЛЕПОТА: не добыт курсор ядерного журнала: <reason>.` (BLINDNESS: no kernel-journal cursor obtained), where the reason is `journalctl не запущен (<error type>)` (journalctl not started), `journalctl код <N>` (journalctl code N) or `journalctl код 0, но метки cursor нет` (journalctl code 0, but no cursor line);
- the main read (`journalctl --after-cursor`) failed to start (`OSError`): alert `СЛЕПОТА: не добыт ядерный журнал: journalctl не запущен (<error type>).` (BLINDNESS: kernel journal not obtained, journalctl not started).

In every case the alert goes through `notify` (the service journal and the channel, if set), and the watchdog exits with code 2: the pass does not count as a success, the `oneshot` unit becomes `failed` and shows up in `systemctl status oom-watch.service` and `systemctl --failed`. The `cursor` file is not changed. The blindness alert goes through the same `notify` with its timeout and catch (check 7), so a broken channel does not crash this path: a non-delivery produces the "тревога НЕ доставлена" (alert NOT delivered) line, and the exit code stays 2.

**Чего НЕ ловит.**
- **Повтор: у сторожа нет памяти о том, что о слепоте уже сказано.** Тревога «СЛЕПОТА» уходит **при каждом запуске** — раз в минуту по таймеру — и заваливает канал одинаковыми сообщениями, пока слепота не кончится. Это известное ограничение. Отдельного сообщения о том, что слепота кончилась, тоже нет: сторож просто снова работает (первый запуск со строкой «сторож поднят» или обычное чтение от курсора).
- **Недоставленную тревогу о слепоте** при сломанном канале или пустом `OOM_WATCH_ALERT`: тогда слепоту видно только в журнале службы и по состоянию юнита `failed`.
- **Ошибку только у `--after-cursor`** (ненулевой код), когда текущая позиция получается, — это проверка 4 (сброс курсора, тоже код 2), а не слепота.
- **Курсор правильного вида от вычищенного журнала** — принимается с кодом 0, это не слепота (см. проверку 4).
- **Сторож, который не запускается вовсе** (таймер выключен) или падает раньше проверки (каталог состояния не создаётся — трассировка, код 1).

**What it does NOT catch.**
- **Repetition: the watchdog keeps no memory that the blindness was already reported.** The «СЛЕПОТА» alert goes out **on every run** — once a minute by the timer — and floods the channel with identical messages for as long as the blindness lasts. This is a known limitation. There is no separate "blindness is over" message either: the watchdog simply works again (a first run with the "watchdog is up" line, or an ordinary read from the cursor).
- **An undelivered blindness alert** with a broken channel or an empty `OOM_WATCH_ALERT`: then blindness is visible only in the service journal and as the unit's `failed` state.
- **A failure of `--after-cursor` only** (a non-zero code) while the current position is obtainable — that is check 4 (cursor reset, also code 2), not blindness.
- **A well-formed cursor from a vacuumed journal** — accepted with code 0, not blindness (see check 4).
- **A watchdog that is not started at all** (timer disabled) or crashes before the check (the state directory cannot be created — a traceback, code 1).

**Куда кричит.** Журнал службы и канал — при каждом слепом запуске; код выхода 2 — состояние юнита `failed`.

**Where it reports.** The service journal and the channel — on every blind run; exit code 2 — the unit's `failed` state.

## 9. Курсор на последней прочитанной записи · Cursor at the last read entry

**Что ловит.** После успешного чтения курсор ставится на `__CURSOR` последней прочитанной записи, а не на конец журнала в момент окончания прохода. Строки ядра, пришедшие после чтения — в том числе пока ждали канал тревоги, — прочитает следующий проход: окно потери закрыто. Если не прочитано ничего, курсор не меняется (прежде он каждый проход переставлялся на текущий конец журнала).

**What it catches.** After a successful read the cursor is set to the `__CURSOR` of the last entry read, not to the end of the journal at the moment the pass ends. Kernel lines that arrived after the read — including while waiting for the alert channel — are read by the next pass: the loss window is closed. If nothing was read, the cursor is left unchanged (previously it was moved to the current end of the journal on every pass).

**Чего НЕ ловит.**
- Вычищенный журнал при курсоре правильного вида (см. проверку 4).
- Убийство, две строки которого легли в разные проходы: карта по pid строится заново в каждом проходе, поэтому строка `Killed process` во втором проходе не найдёт пары из первого и придёт как «служба не определена» (установлено чтением кода).
- Проход, оборвавшийся до записи курсора (каталог состояния недоступен на запись): следующий проход перечитает то же окно, тревоги повторятся.
- Файл курсора пишется открытием на запись, не атомарно.

**What it does NOT catch.**
- A vacuumed journal with a well-formed cursor (see check 4).
- A kill whose two lines fell into different passes: the pid map is built anew in each pass, so a `Killed process` line in the second pass finds no pair from the first and arrives as "unit not identified" (established by reading the code).
- A pass aborted before the cursor is written (an unwritable state directory): the next pass re-reads the same window, and the alerts repeat.
- The cursor file is written by opening it for writing, not atomically.

**Куда кричит.** Никуда: проверка работает молча. Её след — содержимое файла `cursor`, равное `__CURSOR` последней записи, прочитанной проходом.

**Where it reports.** Nowhere: the check works silently. Its trace is the content of the `cursor` file, equal to the `__CURSOR` of the last entry the pass read.

## Как проверить проверки · How to test the checks

Каждую защиту проверяйте на частном состоянии и recording channel: исправное → порча с доказанным внесением → снятая порча. Стенды и границы — README, раздел 8. Ниже прежние ожидания для живого изолированного стенда; они не доказывают результат текущей правки.

Check each guard with private state and a recording channel: healthy → evidenced corruption → restored healthy. See README section 8 for stands and limits. The table below lists earlier expectations for an isolated live test box; it does not prove this change.

| Проверка · Check | Проба · Probe | Ожидание · Expected |
|---|---|---|
| 1. связь по pid · pid pairing | два убийства сразу (16M и 24M) · two kills at once | у каждой тревоги свой юнит и свои числа (~15.8 и ~23.8 МБ) · each alert has its own unit and numbers |
| 2. неопознанное · unidentified | задать `OOM_WATCH_UNITS` без пробного юнита, убить пробу в `*.scope` (`systemd-run --scope`) · set the list without the probe, kill a probe in a scope | тревога «Служба: не определена» несмотря на список · alert despite the list |
| 3. глобальное · global | `sysrq f` с `OOMScoreAdjust=1000` | «ПАМЯТЬ КОНЧИЛАСЬ», без предела и процента, несмотря на список · no limit/percentage, despite the list |
| 4. сброс курсора · cursor reset | на стенде: записать в `cursor` мусор · on a test box: write garbage into `cursor` | одна тревога «не удалось прочитать…», код 2 и юнит `failed`; следующий проход читает от новой позиции, код 0 · one alert, code 2 and unit `failed`; the next pass reads from the new position, code 0 |
| 5. первый запуск · first run | на стенде: удалить `cursor` · on a test box: delete `cursor` | строка «сторож поднят», файл появился · line present, file created |
| 6. отказ канала · channel failure | `OOM_WATCH_ALERT` на канал, возвращающий 1 · a channel returning 1 | тревога в журнале + «тревога НЕ доставлена (канал … ответил кодом 1)» · alert in journal + "alert NOT delivered (exited with code 1)" line |
| 7. сбой доставки · delivery failure | канал `sleep 60`; затем исполняемый файл без шебанга · a channel doing `sleep 60`; then an executable without a shebang | проход ~20 с и «не ответил за 20 с»; затем «не запустился: OSError: …»; в обоих случаях выход 0, курсор записан · pass takes ~20 s with "did not answer within 20 s"; then "failed to launch: OSError: …"; exit 0 and the cursor written in both cases |
| 8. слепота · blindness | дважды от непривилегированной учётки с отдельным каталогом состояния, доступным ей на запись (`sudo -u nobody env OOM_WATCH_STATE=<каталог> /usr/local/bin/oom-watch; echo $?`), затем тот же каталог от root · twice as an unprivileged account with a separate state directory it can write, then the same directory as root | код 2 оба раза и тревога «СЛЕПОТА: не добыт курсор ядерного журнала: journalctl код 1.» оба раза (с заданным в команде `OOM_WATCH_ALERT` — и в канал оба раза); файл `cursor` не появился; от root — «сторож поднят», `cursor` появился, код 0 · code 2 both times and the «СЛЕПОТА» alert both times (with `OOM_WATCH_ALERT` set in the command — to the channel both times too); no `cursor` file; as root — "watchdog is up", `cursor` appears, code 0 |
| 9. курсор · cursor | второе убийство, пока сторож ждёт медленный канал (`sleep 10`) по первому · a second kill while the watchdog waits for a slow channel (`sleep 10`) on the first | о втором сообщает следующий проход · the next pass reports the second |

Проба 2 через `systemd-run --scope` опирается на разбор кода (cgroup `*.scope` → юнит не определён), на живой машине нами не запускалась. Пробы 4–9 меняют состояние сторожа — делайте их на стенде с отдельным `OOM_WATCH_STATE`.

Probe 2 via `systemd-run --scope` is based on reading the code (a `*.scope` cgroup → unit not identified) and was not run by us on a live machine. Probes 4–9 change the watchdog's state — run them on a test box with a separate `OOM_WATCH_STATE`.
