# Поломки и лечение · Troubleshooting

Автор · Author: Aleksandr Argelander · Лицензия · License: MIT · Код · Code: `bin/oom-watch` 3.1.4

Каждая запись: признак → причина → лечение. Причины выведены из кода и из наших прогонов; где причина установлена только чтением кода, это сказано.

Each entry: symptom → cause → fix. Causes are derived from the code and from our runs; where a cause is established by reading the code only, that is stated.

## Сводка · Summary

| Признак · Symptom | Вероятная причина · Likely cause | Раздел · Section |
|---|---|---|
| Служба `failed`, «СЛЕПОТА: …» каждую минуту; или нет файла `cursor` · Service `failed`, «СЛЕПОТА: …» (BLINDNESS) every minute; or no `cursor` file | нет доступа к журналу / пустой журнал / неподдержанные данные / таймер не запущен · no journal access / empty journal / unsupported data / timer not running | 1 |
| Служба убита, тревоги нет · Unit killed, no alert | список, тип убийства, окно · list, kill kind, window | 2 |
| «Служба: не определена» · "unit not identified" | потеря строки или не `.service` · lost line or not a `.service` | 3 |
| «тревога НЕ доставлена (…)» · "alert NOT delivered (…)" | путь с аргументами / не исполним / без шебанга / код не 0 · path with args / not executable / no shebang / non-zero exit | 4 |
| Одни и те же тревоги каждую минуту · The same alerts every minute | каталог состояния не на запись · unwritable state dir | 5 |
| «не ответил за 20 с», проход долгий · "did not answer within 20 s", long pass | канал завис или медленный · channel hung or slow | 6 |
| «не удалось прочитать ядерный лог» · "could not read the kernel log" | испорченный или пустой курсор · corrupted or empty cursor | 7 |
| Процент меньше 100% · Percentage below 100% | так устроено · by design | 8 |
| Ручной прогон ничего не печатает · Manual run prints nothing | таймер успел первым · the timer got there first | 9 |

## 1. Сторож слеп или не запущен · Watchdog blind or not running

**Признак.** `systemctl status oom-watch.service` (и `systemctl --failed`) показывает `failed` с кодом выхода 2, в `journalctl -u oom-watch.service` строка `СЛЕПОТА: не добыт курсор ядерного журнала: …` (или `СЛЕПОТА: не добыт ядерный журнал: journalctl не запущен …`); та же тревога приходит наружу при каждом запуске, то есть раз в минуту. Либо: через минуту после установки нет `/var/lib/oom-watch/cursor` (или `$OOM_WATCH_STATE/cursor`) и в журнале службы нет ни строки `🔴 OOM-KILL: сторож поднят…`, ни строки «СЛЕПОТА».

**Symptom.** `systemctl status oom-watch.service` (and `systemctl --failed`) shows `failed` with exit code 2, `journalctl -u oom-watch.service` has the line `СЛЕПОТА: не добыт курсор ядерного журнала: …` (BLINDNESS: no kernel-journal cursor obtained) or `СЛЕПОТА: не добыт ядерный журнал: journalctl не запущен …` (BLINDNESS: kernel journal not obtained, journalctl not started); the same alert comes outward on every run, i.e. once a minute. Or: a minute after installing there is no `/var/lib/oom-watch/cursor` (or `$OOM_WATCH_STATE/cursor`) and the service journal has neither a `🔴 OOM-KILL: сторож поднят…` (watchdog is up) line nor a «СЛЕПОТА» line.

**Причина.** «СЛЕПОТА» и код 2 — не добыт журнал/курсoр или встретился неподдержанный ввод. `journalctl код 1` может означать отсутствие прав, но работа не от root сама по себе не доказывает отказ: журнал доступен группе `systemd-journal`/`adm`. Код 0 без метки — пустой или недоступный журнал. `journalctl не запущен` — ошибка запуска. `MESSAGE не строка/запись не JSON-объект` и отсутствие годного `_BOOT_ID` называют частично непроверенное окно: пригодные записи обработаны, cursor может быть обновлён по последней годной метке. Таймер вообще не позвал скрипт — отдельный случай, проверяйте timer и journal независимо.

**Cause.** Blindness and exit 2 mean the journal/cursor could not be obtained or unsupported input was encountered. `journalctl код 1` can indicate missing read permissions, but a non-root account alone does not prove failure: `systemd-journal`/`adm` members can read the journal. Code 0 without a cursor can mean an empty or inaccessible journal. A launch diagnostic names a journalctl start error. Nonstring MESSAGE/non-object JSON and missing valid `_BOOT_ID` name a partly unchecked window: usable records were processed and the cursor may advance from the last valid mark. A timer that never calls the script is a separate case; check timer and journal independently.

**Лечение · Fix.**

```bash
systemctl status oom-watch.service              # failed, status=2? · failed, status=2?
systemctl list-timers oom-watch.timer            # таймер есть? · is the timer there?
sudo systemctl enable --now oom-watch.timer
systemctl show oom-watch.service -p User -p SupplementaryGroups # сверить права · check access policy
sudo journalctl _TRANSPORT=kernel -n 1 --show-cursor            # от root курсор печатается · as root a cursor is printed
```

Верните выбранной учётке доступ к журналу, состоянию и каналу по SETTINGS; само наличие `User=` не является ошибкой. При пустом журнале проверьте хранение journald. Затем повторите частную проверку и сверяйте новый исход с причиной прежней слепоты. При отсутствии cursor исправный запуск пишет «сторож поднят» и создаёт файл; отдельной тревоги «слепота кончилась» нет.

Restore the chosen account’s journal, state and channel access as described in SETTINGS; `User=` by itself is not an error. Check journald retention if the journal is empty. Then repeat a private check and compare its outcome with the original blindness cause. Without a cursor, a healthy pass writes the watchdog-up line and creates the file; there is no separate blindness-over alert.

Пользовательский manager: полный путь cgroup в тревоге — ожидаемая identity. Свойства MemoryMax и Restart не проверяются системным manager; в фильтре нужен весь путь, имя `foo.service` относится к системному unit.

User manager: the full cgroup path in the alert is its expected identity. MemoryMax and Restart are not queried from the system manager; the filter needs the entire path, while `foo.service` names a system unit.

## 2. Убийство было, тревоги нет · A kill happened, no alert

**Признак.** Служба перезапустилась или упала, в `journalctl _TRANSPORT=kernel` есть `Killed process`, а тревоги нет ни в канале, ни в журнале службы.

**Symptom.** A unit restarted or failed, `journalctl _TRANSPORT=kernel` has `Killed process`, but there is no alert in the channel or in the service journal.

**Причины и лечение · Causes and fixes.**

- **Фильтр `OOM_WATCH_UNITS`.** Юнит узнан, убийство групповое, а юнита нет в списке (опечатка, нет `.service`, шаблон без экземпляра). Такое отбрасывается молча. Лечение: оставьте список пустым или впишите точное имя, как в пути cgroup (`systemctl status <unit>` → строка `CGroup:`).
- **Убийство было до первого запуска** или до смены `OOM_WATCH_STATE` / потери курсора на tmpfs — пропускается по устройству.
- **Убил `systemd-oomd`, а не ядро.** Его строки — не `Killed process` ядра. Проверьте: `journalctl -u systemd-oomd`.
- **Журнал вычищен между проходами.** Курсор правильного вида принимается без ошибки, чтение идёт с ближайшего места, вычищенные строки потеряны (вывод по пробе на systemd 255). Лечение: не держите таймер выключенным подолгу; проверьте настройки хранения journald.
- **Потеряна строка `Killed process`**, дошла только `oom-kill:constraint=…` — тревогу порождает только первая.

- **The `OOM_WATCH_UNITS` filter.** The unit was identified, the kill was a cgroup kill, and the unit is not in the list (typo, no `.service`, template without instance). This is dropped silently. Fix: leave the list empty or write the exact name as in the cgroup path (`systemctl status <unit>` → the `CGroup:` line).
- **The kill happened before the first run**, or before changing `OOM_WATCH_STATE` / losing the cursor on tmpfs — skipped by design.
- **`systemd-oomd` killed it, not the kernel.** Its lines are not kernel `Killed process` lines. Check: `journalctl -u systemd-oomd`.
- **The journal was vacuumed between passes.** A well-formed cursor is accepted without error, reading continues from the nearest place, the vacuumed lines are lost (conclusion from a probe on systemd 255). Fix: do not keep the timer stopped for long; check journald retention settings.
- **The `Killed process` line was lost**, only `oom-kill:constraint=…` arrived — only the former produces an alert.

## 3. «Служба: не определена» · "unit not identified"

**Признак.** Тревога со строкой `Служба: не определена (строки ядра не сошлись по номеру процесса)`.

**Symptom.** An alert with the line `Служба: не определена (строки ядра не сошлись по номеру процесса)`.

**Причина.** Либо нет предшествующей строки `oom-kill:` с теми же `_BOOT_ID` и pid в этом проходе (она потеряна, попала в другой проход или boot id неподдержан), либо — что код не различает и называет той же фразой — пара нашлась, но последний сегмент пути cgroup не `.service`: пользовательская сессия `*.scope`, корень `/`, slice или вложенная под-cgroup службы.

**Cause.** Either this pass has no preceding `oom-kill:` line with the same `_BOOT_ID` and pid (a lost line, a pass boundary or unsupported boot id), or — which the code does not distinguish and names with the same phrase — the pair was found, but the last cgroup path segment is not a `.service`: a user session `*.scope`, the root `/`, a slice or a nested sub-cgroup of a service.

**Лечение · Fix.**

```bash
journalctl _TRANSPORT=kernel | grep 'pid=<N>,'    # есть строка oom-kill? · is there an oom-kill line?
```

Строки нет — причина её отсутствия здесь не установлена; юнит придётся устанавливать по загрузке и времени. Строка есть — посмотрите `oom_memcg=` / `task_memcg=`: путь покажет, где жил процесс. Тревога в обоих случаях правильная: ближайший юнит намеренно не подставляется.

No line — the reason for its absence is not established here; investigate by boot and time. The line is there — look at `oom_memcg=` / `task_memcg=`: the path shows where the process lived. The alert is correct in both cases: the nearest unit is deliberately not substituted.

## 4. Тревога в журнале есть, наружу не уходит · Alert in journal, not outward

**Признак.** В `journalctl -u oom-watch.service` есть тревога и строка `🔴 OOM-KILL: тревога НЕ доставлена (<причина>) — остаётся только журнал`.

**Symptom.** `journalctl -u oom-watch.service` has the alert and a line `🔴 OOM-KILL: тревога НЕ доставлена (<reason>) — остаётся только журнал` (alert NOT delivered, journal only).

**Причина.** По тексту в скобках. `канал … недоступен` — `OOM_WATCH_ALERT` не проходит `os.access(X_OK)`: файла нет, нет бита `x`, в абсолютном значении есть аргументы. Относительный путь/голое имя — другой исход: отказ настройки2 до прохода, journal и cursor не затронуты. `канал … не запустился: OSError: [Errno 8] Exec format error` — файл исполним, но без строки `#!`; другие тексты исключения — например, ошибка прав. `канал … ответил кодом <N>` — канал вернул ненулевой код. `канал … не ответил за 20 с` — см. раздел 6. Во всех случаях проход доработал и сдвинул курсор: эта тревога наружу уже не уйдёт, она есть только в журнале службы.

**Cause.** By the text in brackets. `канал … недоступен` (unavailable) — `OOM_WATCH_ALERT` fails `os.access(X_OK)`: the file is missing, has no `x` bit, the absolute value contains arguments. A relative path/bare name is a different result: configuration refusal2 before the pass, without touching journal or cursor. `канал … не запустился: OSError: [Errno 8] Exec format error` (failed to launch) — the file is executable but has no `#!` line; other exception texts — e.g. a permission error. `канал … ответил кодом <N>` — the channel exited non-zero. `канал … не ответил за 20 с` — see section 6. In every case the pass finished and moved the cursor: this alert will not go outward any more, it exists only in the service journal.

**Лечение.** Укажите полный путь к одному исполняемому файлу без аргументов; аргументы зашейте внутрь обёртки; первой строкой файла — шебанг (`#!/bin/sh`). Проверьте канал руками тем же способом, каким его зовёт сторож:

**Fix.** Give a full path to one executable with no arguments; put arguments inside a wrapper; make a shebang (`#!/bin/sh`) its first line. Test the channel by hand the same way the watchdog calls it:

```bash
printf 'проверка\nвторая строка\n' | sudo /usr/local/bin/my-alert; echo "rc=$?"
```

## 5. Одни и те же тревоги каждую минуту · The same alerts every minute

**Признак.** Одна и та же тревога об убийстве повторяется в журнале службы каждую минуту; рядом трассировка Python, служба `failed`.

**Symptom.** The same kill alert repeats in the service journal every minute; a Python traceback next to it; the service is `failed`.

**Причина.** Проход обрывается до записи курсора, и следующий читает то же окно. Известный случай (установлен чтением кода): `PermissionError` при записи `cursor` — каталог состояния недоступен на запись. Канал без шебанга эту беду больше не вызывает: с 04.10.2026 исключение при запуске канала перехватывается, проход доходит до записи курсора (раздел 4).

**Cause.** The pass aborts before writing the cursor, and the next one reads the same window. Known case (established by reading the code): `PermissionError` writing `cursor` — the state directory is not writable. A channel without a shebang no longer causes this: since 2026-10-04 an exception when launching the channel is caught and the pass reaches the cursor write (section 4).

**Лечение.** Верните каталогу права на запись. Следующий проход отработает окно и сдвинет курсор.

**Fix.** Restore write permission on the directory. The next pass processes the window and moves the cursor.

## 6. «Не ответил за 20 с» · "did not answer within 20 s"

**Признак.** В журнале службы строка `🔴 OOM-KILL: тревога НЕ доставлена (канал … не ответил за 20 с) — остаётся только журнал`; проход длится дольше обычного, служба дольше обычного в `activating (start)`.

**Symptom.** The service journal has the line `🔴 OOM-KILL: тревога НЕ доставлена (канал … не ответил за 20 с) — остаётся только журнал` (alert NOT delivered, did not answer within 20 s); the pass takes longer than usual, the service stays in `activating (start)` longer than usual.

**Причина.** Канал тревоги завис или медленнее 20 с (`ALERT_TIMEOUT`, константа в коде). Сторож прерывает вызов через 20 с и продолжает проход, курсор записывается. Предел — на каждый вызов: при N тревогах в одном проходе он может длиться до N×20 с. Прежде у вызова не было таймаута, и зависший канал держал `oneshot` сколько угодно.

**Cause.** The alert channel hung or is slower than 20 s (`ALERT_TIMEOUT`, a code constant). The watchdog interrupts the call after 20 s and continues the pass; the cursor is written. The limit is per call: with N alerts in one pass the pass can last up to N×20 s. Previously the call had no timeout, and a hung channel held the `oneshot` for as long as it hung.

**Лечение.** Сделайте канал быстрее 20 с — например, поставьте таймаут внутри него (`timeout 15 curl …`). Недоставленные тревоги не повторяются: найдите их в `journalctl -u oom-watch.service` и передайте руками.

**Fix.** Make the channel faster than 20 s — for example, put a timeout inside it (`timeout 15 curl …`). Undelivered alerts are not retried: find them in `journalctl -u oom-watch.service` and pass them on by hand.

## 7. «Не удалось прочитать ядерный лог» · "could not read the kernel log"

**Признак.** Тревога `🔴 OOM-KILL: не удалось прочитать ядерный лог (rc=…)`.

**Symptom.** An alert `🔴 OOM-KILL: не удалось прочитать ядерный лог (rc=…)` (could not read the kernel log).

**Причина.** `journalctl --after-cursor` вернул ненулевой код. По пробе это испорченный или пустой файл `cursor` (`Failed to seek to cursor: Invalid argument`). При отсутствии прав на журнал эта тревога не приходит: текущую позицию тоже получить нельзя, и сторож шлёт тревогу «СЛЕПОТА» с кодом 2 (раздел 1).

**Cause.** `journalctl --after-cursor` exited non-zero. In our probe this is a corrupted or empty `cursor` file (`Failed to seek to cursor: Invalid argument`). With no permission on the journal this alert does not come: the current position cannot be obtained either, and the watchdog sends a «СЛЕПОТА» alert with code 2 (section 1).

**Лечение.** Сторож уже сам сбросил курсор на текущую позицию, но этот проход завершился кодом 2, и юнит в состоянии `failed` до следующего успешного прохода. Окно до тревоги проверьте руками (`journalctl _TRANSPORT=kernel --since … | grep 'Killed process'`). Следующий запуск читает от новой позиции; если тревога повторяется каждый запуск — проверьте, кто портит файл `cursor` (например, второй экземпляр сторожа с тем же `OOM_WATCH_STATE`).

**Fix.** The watchdog has already reset the cursor to the current position by itself, but this pass ended with code 2, and the unit stays `failed` until the next successful pass. Check the window before the alert by hand (`journalctl _TRANSPORT=kernel --since … | grep 'Killed process'`). The next run reads from the new position; if the alert repeats on every run, find what corrupts the `cursor` file (for example, a second watchdog instance with the same `OOM_WATCH_STATE`).

## 8. «Выбран на N%» меньше 100 · "used N%" below 100

**Признак.** Групповое убийство, а процент 60–98%.

**Symptom.** A cgroup kill, yet the percentage is 60–98%.

**Причина.** Это не ошибка: процент — это anon-rss **убитого процесса** к **текущему** `MemoryMax` юнита. Предел считает ещё файловый кэш, память ядра и другие процессы юнита. Если `MemoryMax` поменяли после убийства, процент посчитан от нового значения.

**Cause.** Not an error: the percentage is the **killed process's** anon-rss against the unit's **current** `MemoryMax`. The limit also counts page cache, kernel memory and the unit's other processes. If `MemoryMax` was changed after the kill, the percentage is computed against the new value.

**Лечение.** Не требуется. Для полной картины — `memory.events` и `memory.stat` cgroup юнита.

**Fix.** None needed. For the full picture — the unit cgroup's `memory.events` and `memory.stat`.

## 9. Ручной прогон после пробы пуст · Manual run after a probe is empty

**Признак.** Запустили пробу из README, затем `sudo /usr/local/bin/oom-watch` — ничего не напечатано.

**Symptom.** You ran the README probe, then `sudo /usr/local/bin/oom-watch` — nothing printed.

**Причина.** Таймер и ручной запуск делят один курсор; если таймер прошёл после убийства, он уже сообщил о нём и сдвинул курсор. (Самый первый запуск сюда не относится: он не тревожит о прошлом, но печатает строку «🔴 OOM-KILL: сторож поднят…».)

**Cause.** The timer and the manual run share one cursor; if the timer ran after the kill, it has already reported it and moved the cursor. (The very first run does not belong here: it does not alert about the past, but it does print the line "🔴 OOM-KILL: сторож поднят…" (watchdog is up).)

**Лечение.** Смотрите `journalctl -u oom-watch.service -n 20`: тревога там.

**Fix.** Look at `journalctl -u oom-watch.service -n 20`: the alert is there.
