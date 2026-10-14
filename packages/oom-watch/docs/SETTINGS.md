# Настройки oom-watch · oom-watch settings

Автор · Author: Aleksandr Argelander · Лицензия · License: MIT · Код · Code: `bin/oom-watch` 3.1.3

Сторож настраивается только переменными окружения — чтобы сам файл скрипта был одинаков на всех машинах. Переменные задаются в юните `oom-watch.service` строкой `Environment=` или в drop-in (`systemctl edit oom-watch.service`). Информационные ключи — `--version` и `--help`; оба не выполняют проход. Ниже — каждая настройка, включая частоту таймера и права службы.

The watchdog is configured by environment variables only, so the script file itself is identical on every machine. Set them in the `oom-watch.service` unit with an `Environment=` line or in a drop-in (`systemctl edit oom-watch.service`). Informational flags are `--version` and `--help`; neither performs a pass. Below is every setting, including the timer cadence and service permissions.

## Сводка · Summary

| Имя · Name | Тип · Type | Умолчание · Default | Где задаётся · Where set |
|---|---|---|---|
| `OOM_WATCH_UNITS` | список имён юнитов через пробел · space-separated list of unit names | пусто · empty | окружение службы · service environment |
| `OOM_WATCH_ALERT` | полный путь к исполняемому файлу · full path to an executable | пусто · empty | окружение службы · service environment |
| `OOM_WATCH_STATE` | путь к каталогу · directory path | `/var/lib/oom-watch` | окружение службы · service environment |
| Частота таймера · Timer cadence | выражение `OnCalendar` · `OnCalendar` expression | `*-*-* *:*:00` (каждую минуту · every minute) | `oom-watch.timer` |
| Запуск от root · Run as root | свойство юнита · unit property | root (нет `User=` · no `User=`) | `oom-watch.service` |
| `--version` | ключ командной строки · CLI flag | — | вызов вручную · manual call |
| `ALERT_TIMEOUT` | константа в коде, секунды · code constant, seconds | `20` | `bin/oom-watch` (не окружение · not the environment) |

## OOM_WATCH_UNITS

**Тип:** строка, имена юнитов через пробел (разбивается `split()`, то есть по любым пробельным символам). **Умолчание:** пусто.

**Type:** string, unit names separated by spaces (split with `split()`, i.e. on any whitespace). **Default:** empty.

**Что значит.** Список юнитов, о групповых убийствах которых тревожить. Пусто — тревожить о любом. Список действует **только** на групповые убийства (`CONSTRAINT_MEMCG`) с **узнанным** юнитом. Глобальные убийства и убийства с неопознанным юнитом тревожат всегда, что бы ни было в списке. Сравнение — точное: системный unit — имя последнего `.service` сегмента; user-manager (`user@N.service` в пути) — весь cgroup-путь. Поэтому `foo.service` и `/user.slice/user-1000.slice/user@1000.service/app.slice/foo.service` различаются; для пользовательского unit нужен весь путь.

**Meaning.** The list of units whose cgroup kills to alert on. Empty — alert on any. The list applies **only** to cgroup kills (`CONSTRAINT_MEMCG`) with an **identified** unit. Global kills and kills with an unidentified unit always alert, whatever the list says. Matching is exact: a system unit uses its final `.service` segment; a user-manager unit (path containing `user@N.service`) uses the entire cgroup path. Thus `foo.service` differs from `/user.slice/user-1000.slice/user@1000.service/app.slice/foo.service`; the latter needs the entire path.

**Пример · Example:**

```ini
[Service]
Environment="OOM_WATCH_UNITS=my-agent.service worker@1.service"
```

**Что сломается при неверном значении.** Имя без `.service` (`my-agent`), опечатка или шаблонный юнит без экземпляра (`worker@.service` вместо `worker@1.service`) никогда не совпадут — и групповые убийства этих юнитов пройдут **молча**, без единой строки даже в журнале службы (фильтр стоит до `notify`). Ничто об этом не напомнит. Новый юнит, добавленный на машину позже, тоже не попадёт под тревогу, пока его не впишут. Поэтому безопаснее оставить пусто.

**What breaks if wrong.** A name without `.service` (`my-agent`), a typo, or a template unit without an instance (`worker@.service` instead of `worker@1.service`) never matches — and cgroup kills of those units pass **silently**, without a single line even in the service journal (the filter sits before `notify`). Nothing will remind you. A unit added to the machine later is not covered either until someone adds it. That is why leaving it empty is safer.

## OOM_WATCH_ALERT

**Договор канала.** Один исполняемый файл по абсолютному пути, без аргументов; текст приходит на stdin. Вывод не пересылается, код 0 означает только приём каналом. Таймаут — 20 с на вызов; недоставленная тревога не повторяется. Stdin содержит недоверенные данные журнала: канал не должен исполнять их и должен безопасно обрабатывать разметку. `dsh-trevogi/agent-alert` по умолчанию использует HTML; в тексте oom-watch динамические поля должны быть очищены от управляющих символов, а `<`, `>` и `&` — экранированы. Обёртка для канала с аргументами — отдельный исполняемый файл по абсолютному пути.

**Channel contract.** One executable at an absolute path, no arguments; input text arrives on stdin. Output is not forwarded, and exit 0 means channel acceptance only. The timeout is 20 s per call; an undelivered alert is not retried. Stdin contains untrusted journal data: the channel must never execute it and must safely handle markup. `dsh-trevogi/agent-alert` defaults to HTML; oom-watch must remove control characters and escape `<`, `>` and `&` in dynamic text fields. If a channel needs arguments, use a separate executable wrapper at an absolute path.


**Тип:** строка — **один абсолютный** путь к исполняемому файлу, без аргументов. **Умолчание скрипта:** пусто (только журнал службы). **Юнит пакета:** `/usr/local/bin/agent-alert` из соседнего пакета `dsh-trevogi`; его нужно установить и настроить отдельно или переопределить абсолютным путём в drop-in.

**Type:** string — **one absolute** path to an executable, no arguments. **Script default:** empty (service journal only). **Packaged unit:** `/usr/local/bin/agent-alert` from the neighboring `dsh-trevogi` package; install and configure it separately or override it with an absolute path in a drop-in.

**Что значит.** Внешний канал тревоги. Сторож проверяет путь через `os.access(путь, X_OK)` и запускает его как `[путь]`, отдавая текст тревоги **на stdin** (текст многострочный, в UTF-8, на русском — см. README). Вывод канала перехватывается и не печатается; судят только по коду возврата. Вызов ограничен `ALERT_TIMEOUT` = 20 с, любое исключение при запуске перехватывается; сбой канала не обрывает проход (см. ниже). Через канал уходят тревоги об убийствах, тревога об ошибке чтения курсора и тревоги «СЛЕПОТА: …» (при каждом слепом запуске, раз в минуту, без памяти о том, что уже сказано); строка «сторож поднят» и сообщения о сбое самого канала — только в журнал службы. Тексты на русском намеренно: это интерфейс для операторов; переводить их — в `build_alert` и `fmt_*`.

**Meaning.** The external alert channel. The watchdog checks the path with `os.access(path, X_OK)` and runs it as `[path]`, passing the alert text **on stdin** (multi-line, UTF-8, in Russian — see README). The channel's output is captured and not printed; only its exit code is judged. The call is limited to `ALERT_TIMEOUT` = 20 s, and any launch exception is caught; a channel failure does not abort the pass (see below). Kill alerts, the cursor read-error alert and the «СЛЕПОТА: …» (BLINDNESS) alerts (on every blind run, once a minute, with no memory of what was already said) go through the channel; the "watchdog is up" line and messages about the channel's own failure go to the service journal only. The texts are Russian on purpose: they are the operators' interface; translate them in `build_alert` and `fmt_*`.

**Пример · Example:**

```ini
[Service]
Environment=OOM_WATCH_ALERT=/usr/local/bin/my-alert
```

```bash
#!/bin/sh
# /usr/local/bin/my-alert — пример канала: текст тревоги приходит на stdin
# /usr/local/bin/my-alert — example channel: the alert text arrives on stdin
exec logger -t oom-alert
```

**Что сломается при неверном значении.** Любой сбой канала даёт в журнале службы строку «🔴 OOM-KILL: тревога НЕ доставлена (<причина>) — остаётся только журнал»; проход идёт до конца, курсор сдвигается, код выхода 0 (если тревога была о слепоте — 2, как и без сбоя канала) — тревога остаётся только в журнале службы и повторно не отправляется.

- Относительный путь или голое имя (`my-alert`, рассчитывая на PATH) отклоняется кодом 2 до чтения журнала и создания состояния. Строка с ведущим `/` и аргументами (`/usr/local/bin/notify --chat x`) проверяется как одно имя файла, а не команда с доводами. Для аргументов используйте абсолютный путь к отдельной исполняемой wrapper.
- Файл без бита `x` или несуществующий абсолютный путь — «недоступен»; тревога остаётся в журнале, проход продолжается.
- Исполняемый файл без шебанга — перехваченное исключение запуска; проход продолжается.
- Таймаут — 20 с на одну тревогу; при N вызовах суммарное ожидание может достигнуть N×20 с.
- Ненулевой код канала — строка «тревога НЕ доставлена». Код 0 не доказывает дальнейшую доставку.

**What breaks if wrong.** Any channel failure gives the service-journal line "🔴 OOM-KILL: тревога НЕ доставлена (<reason>) — остаётся только журнал" (alert NOT delivered, journal only); the pass runs to the end, the cursor moves, exit code 0 (if the alert was about blindness — 2, just as without a channel failure) — the alert stays in the service journal only and is not sent again.

- A relative path or bare name (`my-alert`, relying on PATH) is refused with exit 2 before journal reading or state creation. A string beginning with `/` and containing arguments (`/usr/local/bin/notify --chat x`) is checked as one filename, not a command with arguments. Use an absolute executable wrapper for arguments.
- An absolute path that is missing or not executable is unavailable; the alert stays in the journal and the pass continues.
- An executable without a shebang raises a caught launch error; the pass continues.
- The timeout is 20 s per alert; N calls can total N×20 s.
- A nonzero channel exit emits an alert-not-delivered line. Exit 0 does not prove onward delivery.

## OOM_WATCH_STATE

**Тип:** путь к каталогу. **Умолчание:** `/var/lib/oom-watch`; отсутствующая или пустая `OOM_WATCH_STATE` использует это умолчание.

**Type:** directory path. **Default:** `/var/lib/oom-watch`; missing or empty `OOM_WATCH_STATE` uses this default.

**Что значит.** Каталог состояния. Создаётся сам (`os.makedirs`, с родителями). В нём один файл — `cursor`: курсор journald, с которого начнётся следующее чтение; отсутствие файла означает «первый запуск». Других файлов сторож не пишет, в том числе никакой памяти о том, что тревога о слепоте уже ушла.

**Meaning.** The state directory. Created automatically (`os.makedirs`, with parents). It holds one file — `cursor`: the journald cursor the next read starts from; a missing file means "first run". The watchdog writes no other files, including no memory that the blindness alert has already gone out.

**Пример · Example:**

```ini
[Service]
Environment=OOM_WATCH_STATE=/var/lib/oom-watch
```

**Что сломается при неверном значении.**

- Каталог недоступен на запись: проход падает с трассировкой (`PermissionError`), служба в состоянии `failed`. Если курсора ещё не было — падение при его создании каждую минуту, тревог нет. Если курсор был — тревоги прохода уходят, но новый курсор не записывается, и те же тревоги повторяются каждую минуту.
- Каталог на `tmpfs` (`/run`, `/tmp`): после перезагрузки курсор пропадает, первый запуск снова «молчит о прошлом» — убийства между последним проходом до перезагрузки и первым после неё не будут сообщены (в том числе убийства, из-за которых машину перезагружали).
- Смена каталога на новый: то же — новый «первый запуск», окно между старым курсором и новой позицией не проверяется.
- Один каталог на два экземпляра сторожа: они переписывают курсор друг другу, и одни и те же убийства могут прийти дважды.
- Испорченный или пустой файл `cursor`: ветка «ошибка чтения» — тревога наружу, сброс курсора на текущую позицию и выход с кодом 2 (см. [GUARDS.md](GUARDS.md)).

**What breaks if wrong.**

- An unwritable directory: the pass crashes with a traceback (`PermissionError`), the service is `failed`. If there was no cursor yet — a crash creating it every minute, no alerts. If there was a cursor — the pass's alerts go out, but the new cursor is not written, and the same alerts repeat every minute.
- A directory on `tmpfs` (`/run`, `/tmp`): after a reboot the cursor is gone, the first run again "keeps quiet about the past" — kills between the last pass before the reboot and the first after it are not reported (including kills that caused the reboot).
- Changing to a new directory: the same — a new "first run", the window between the old cursor and the new position is not checked.
- One directory for two watchdog instances: they overwrite each other's cursor, and the same kills may be reported twice.
- A corrupted or empty `cursor` file: the "read error" branch — an outward alert, a cursor reset to the current position and exit code 2 (see [GUARDS.md](GUARDS.md)).

## Частота таймера · Timer cadence

**Тип:** выражение `OnCalendar` systemd в `oom-watch.timer`. **Умолчание:** `*-*-* *:*:00` — каждую минуту в :00; `Persistent=true`; точность — умолчание systemd (`AccuracySec=1min`).

**Type:** a systemd `OnCalendar` expression in `oom-watch.timer`. **Default:** `*-*-* *:*:00` — every minute at :00; `Persistent=true`; accuracy — the systemd default (`AccuracySec=1min`).

**Что значит.** Как часто читается журнал. Курсор читает сохранённые kernel-записи всех загрузок после последней позиции; частота определяет задержку. Утраченный cursor, вычищенный/непостоянный journal и неподдержанные записи оставляют непроверенные окна.

**Meaning.** How often the journal is read. The cursor reads retained kernel entries across boots after its last position; cadence sets the delay. A lost cursor, a vacuumed/nonpersistent journal and unsupported records leave unchecked windows.

**Пример · Example** (раз в пять минут · every five minutes):

```ini
# systemctl edit oom-watch.timer
[Timer]
OnCalendar=
OnCalendar=*-*-* *:00/5:00
```

**Что сломается при неверном значении.** Редкий запуск — поздняя тревога, и чем дольше окно, тем вероятнее, что journald успеет вычистить старые записи: тогда курсор правильного вида принимается без ошибки, чтение идёт с ближайшего места, и убийства из вычищенной части теряются молча. Выключенный таймер (`disable`/`stop`) — полная тишина: сторож не может сказать о том, что его не запускают. Проверка: `systemctl list-timers oom-watch.timer`.

**What breaks if wrong.** A rare schedule means a late alert, and the longer the window, the more likely journald vacuums old entries first: then a well-formed cursor is accepted without error, reading continues from the nearest place, and kills from the vacuumed part are lost silently. A disabled timer (`disable`/`stop`) means total silence: the watchdog cannot tell you it is not being run. Check: `systemctl list-timers oom-watch.timer`.

## Права службы · Service permissions

Юнит пакета работает от root (`User=` не задан). Это умолчание юнита, а не требование скрипта. Другой пользователь должен читать ядерный журнал, писать состояние и запускать канал; права и секреты самого канала проверяются отдельно.

The packaged unit runs as root (no `User=`). That is the unit default, not a script requirement. Another account must read the kernel journal, write state and execute the channel; the channel's own permissions and secrets must be checked separately.

Пример drop-in для заранее созданного пользователя `oom-watch`; его создание и перевод боевой службы здесь не выполняются. При `StateDirectory=oom-watch` systemd создаёт каталог состояния с нужным владельцем. Группа чтения журнала зависит от машины (обычно `systemd-journal` или `adm`). Этот вариант не доказывает доступ к `/usr/local/bin/agent-alert` и его настройкам.

Example drop-in for an already-created `oom-watch` account; creating it and changing a production service are separate actions. `StateDirectory=oom-watch` makes systemd create the state directory with the required owner. The journal-reading group depends on the machine (usually `systemd-journal` or `adm`). This example does not prove access to `/usr/local/bin/agent-alert` or its settings.

```ini
[Service]
User=oom-watch
SupplementaryGroups=systemd-journal
StateDirectory=oom-watch
NoNewPrivileges=yes
```

Нет прав на журнал — «СЛЕПОТА» и код 2; нет прав записи состояния — ошибка Python, код 1. Доступ к журналу и состояние проверь отдельно до перевода службы. При восстановлении доступа отдельной тревоги «слепота кончилась» нет.

No journal read permission means a «СЛЕПОТА» alert and exit 2; no state write permission means a Python error and exit 1. Check journal access and state access separately before changing the service. Restored access has no separate "blindness is over" alert.

## --version

**Тип:** ключ командной строки. Печатает `oom-watch 3.1.3` и выходит без прохода.

**Type:** a CLI flag. Prints `oom-watch 3.1.3` and exits without a pass.

**Допустимые доводы.** Без доводов выполняется прежний проход. `--help` печатает справку и выходит 0 без чтения журнала и изменения состояния. `--version` печатает номер и выходит 0; если указаны оба информационных ключа, приоритет у версии. Любой неизвестный довод (`--dry-run`, `-n`, опечатка `--verison`, пустая строка) даёт код 2 и строку «неизвестный довод …; допустимые: …» в stderr до прохода, даже рядом с допустимым ключом. Курсор не сдвигается, каталог состояния не создаётся.

**Accepted arguments.** No arguments run the existing pass. `--help` prints usage and exits 0 without journal reading or state changes. `--version` prints the version and exits 0; version takes precedence when both informational flags are present. Any unknown argument (`--dry-run`, `-n`, a typo like `--verison`, or an empty string) yields exit 2 and an “неизвестный довод …; допустимые: …” stderr diagnostic before the pass, even alongside an accepted flag. The cursor is not advanced and the state directory is not created.

## ALERT_TIMEOUT (константа · constant)

**Тип:** целое число секунд, константа в коде `bin/oom-watch`; **не** переменная окружения. **Значение:** `20`.

**Type:** an integer number of seconds, a constant in the `bin/oom-watch` code; **not** an environment variable. **Value:** `20`.

**Что значит.** Сколько сторож ждёт один вызов канала тревоги. Таймер запускает сторож раз в минуту; 20 с оставляют проходу время закончиться до следующего запуска даже при двух тревогах подряд.

**Meaning.** How long the watchdog waits for one alert-channel call. The timer starts the watchdog once a minute; 20 s leave the pass time to finish before the next start even with two alerts in a row.

**Что сломается при неверном значении.** Через окружение её не изменить: `Environment=ALERT_TIMEOUT=…` игнорируется. Поменять можно только правкой кода — и тогда файл скрипта перестанет быть одинаковым на всех машинах. Канал, которому нужно больше 20 с, каждый раз будет прерываться со строкой «тревога НЕ доставлена (канал … не ответил за 20 с)»: держите свой канал быстрее этого предела.

**What breaks if wrong.** It cannot be changed through the environment: `Environment=ALERT_TIMEOUT=…` is ignored. It can only be changed by editing the code — and then the script file is no longer identical on every machine. A channel that needs more than 20 s will be interrupted every time with the line "тревога НЕ доставлена (канал … не ответил за 20 с)" (alert NOT delivered, did not answer within 20 s): keep your channel faster than that limit.

## Коды выхода · Exit codes

Не настройка, а то, что сторож отдаёт systemd; описано здесь, потому что от кода зависит состояние юнита.

Not a setting but what the watchdog returns to systemd; described here because the unit state depends on it.

| Код · Code | Когда · When | Что видно · What you see |
|---|---|---|
| `0` | проход отработал: в том числе первый запуск, недоставленные тревоги, проход без новых записей, `--version`/`--help` · the pass completed: including the first run, undelivered alerts, a pass with no new entries, `--version`/`--help` | юнит `inactive (dead)` до следующего запуска · unit `inactive (dead)` until the next start |
| `2` | journal/cursor не добыт, ошибка чтения, неподдержанные JSON/MESSAGE/_BOOT_ID; неизвестный довод или относительный канал (эти два — отказ до прохода) · no journal/cursor, read error, unsupported JSON/MESSAGE/_BOOT_ID; unknown argument or relative alert path (the latter two refuse before a pass) | юнит `failed`; причина в stderr: «СЛЕПОТА», ошибка чтения или отказ ввода/настройки. При read error cursor сброшен, при partial blindness может быть обновлён, при отказе ввода не тронут · unit failed; stderr names blindness, a read error or input/configuration refusal. Read error resets cursor, partial blindness may update it, input refusal leaves it untouched |
| `1` | только неперехваченная ошибка Python (не ожидается), например каталог состояния недоступен на запись · only an uncaught Python error (not expected), e.g. an unwritable state directory | юнит `failed`, трассировка в журнале службы · unit `failed`, traceback in the service journal |
