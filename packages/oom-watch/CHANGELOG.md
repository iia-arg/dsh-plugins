# Журнал изменений · Changelog

## 3.1.3 — 14.10.2026 · документация: актуальные номера

- README/доки: номера приведены к выпуску (Аврора, ветка nomera-v-dokah, fd070a17); номер пакета +1.
- `bin/oom-watch`: `__version__` → 3.1.3 (только строка номера).
- Прочий код не менялся.

## 3.1.2 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- README: строка «Версия · Version: 3.1.2» под заголовком; `__version__` в `bin/oom-watch` и шапки четырёх документов `docs/` — 3.1.2 (номер живёт в коде и печатается `--version`); ожидание `test/stend-cli.py` — 3.1.2 (со старым ожиданием 4 FAIL «version…», с новым 20 PASS из 20). · README: version line under the heading; `__version__` in `bin/oom-watch` and four `docs/` headers set to 3.1.2.
- Логика не менялась; номер 3.1.1 → 3.1.2 по правилу владельца 10.10 16:33 (правка README ⇒ +1). · Logic unchanged; version bump for the README edit.

## 3.1.1 — 14.10.2026 · A-N-1948 №23

- Назначенный переход с2.2.2 на3.1.1; аудит всего модуля, код и RU/EN документы. В отчёте15 находок (письмо13); №8 уже устранён в основе, остальные исправлены/приведены к договору.
- Сохранён активный канал фермы B-N-1901, явно названы dsh-trevogi и override абсолютным путём. Стенд юнита параметризован и не пропускает внешние PATH/state/каналы в исполнение.
- Имена процессов с пробелами/скобками, kernel-записи всех сохранённых загрузок и хронологическая связь _BOOT_ID+pid. Пользовательский менеджер сохраняет полную cgroup identity, системные свойства не подставляются.
- Неподдержанный MESSAGE/запись/boot identity — именованная слепота2, валидные события обработаны, курсор только по годной последней метке. Относительный канал — отказ2 до журнала; пустое состояние — штатное умолчание.
- Динамические поля очищены от controls/HTML, мёртвая ветка курсора убрана. Root/group-journal профиль и границы чтения/доставки описаны; опасные пробы — только отдельная VM, проверка пакета на fixtures.
- Assigned release3.1.1 from2.2.2: exact comm parsing, all retained boots, ordered boot+pid pairing, user-manager identity, typed input blindness and literal channel/state contracts. Unit-channel fixtures never invoke a production sink.

Автор · Author: Iia-arg team · Лицензия · License: MIT

Записи ниже восстановлены только по тому, что известно из README и кода пакета; дат и номеров промежуточных выпусков в пакете нет, и они здесь не выдумываются.

The entries below are reconstructed only from what is known from the package README and code; the package holds no dates or numbers of intermediate releases, and none are invented here.

## 2.2.2 — 2026-10-09

История восстановлена (A-N-1882 F04, коммит 1c6d7d6f2: раздел «Восстановлено по истории git» в конце файла), код не менялся. Номер поднят только потому, что CHANGELOG метки 2.2.1 разошёлся с деревом (A-N-1898); `__version__` и примеры `--version` в docs и стенде — вслед за номером.

B-N-1901: юнит `systemd/oom-watch.service` несёт канал тревоги фермы — `Environment=OOM_WATCH_ALERT=/usr/local/bin/agent-alert` (прежде строка была закомментированным образцом, и юнит из пакета молча выключал внешние тревоги: при пустом `OOM_WATCH_ALERT` — только журнал). Стенд `test/stend-yunit-trevoga.py`: юнит из пакета → настоящий скрипт → тревога в подставном канале. Скрипт `bin/oom-watch` этим пунктом не менялся.

History restored (A-N-1882 F04, commit 1c6d7d6f2: the "Восстановлено по истории git" section at the end), code unchanged. The number is raised only because the 2.2.1 tag's CHANGELOG diverged from the tree (A-N-1898); `__version__` and the `--version` examples in docs and the stand follow the number.

## 2.2.1 — 2026-10-04

Неизвестный довод, включая `--dry-run`, теперь даёт отказ с кодом 2 и перечнем допустимых доводов до чтения журнала и изменения состояния. `--help` печатает справку и выходит 0 без прохода. `--version` сохраняет вывод версии и выход 0; без доводов остаётся прежний проход. Все доводы проверяются до информационного выхода, поэтому неизвестный довод рядом с `--help` или `--version` тоже отказывает. Добавлен изолированный стенд с временным состоянием и проверкой сумм курсора.

Unknown arguments, including `--dry-run`, now produce exit 2 and a list of accepted arguments before journal reading or state changes. `--help` prints usage and exits 0 without a pass. `--version` retains version output and exit 0; no arguments retain the existing pass. Every argument is validated before informational exits, so an unknown argument alongside `--help` or `--version` is also refused. Added an isolated stand using temporary state and cursor checksums.

## 2.2.0 — 2026-10-04

Выпуск того, что стоит в бою с 04.10.2026 01:04Z без номера: v2 по A-N-1516 (принят, смонтирован) поверх 1.1.0. По схеме перенумерации 1.1.0 соответствует 2.1.0; новые возможности v2 — минор, отсюда 2.2.0. Код бина = смонтированному v2, кроме строки `__version__` (была «1.1.0» — `oom-watch --version` в бою называл чужой номер).

Release of what has been running since 2026-10-04 01:04Z without a number: v2 (A-N-1516, accepted and mounted) on top of 1.1.0. Under the renumbering scheme 1.1.0 maps to 2.1.0; v2's new capabilities make it a minor, hence 2.2.0. The binary equals the mounted v2 except the `__version__` line (it said "1.1.0").

### 2026-10-04 · Изменения поведения · Behaviour changes

Ниже — отличия от последнего выпущенного 1.1.0.

Below — the differences from the last released 1.1.0.

- **Слепота — тревога и код выхода 2.** `current_cursor()` считает слепотой три исхода `journalctl -k -n 1 --show-cursor`: не запустился (`OSError`), ответил ненулевым кодом (нет прав: проверено, от учётки без прав код 1 и ни строки курсора) или ответил кодом 0 без строки курсора — в том числе совсем пустой ядерный журнал на первом запуске (прежде это был молчаливый выход 0 и повтор). Во всех трёх случаях — тревога «СЛЕПОТА: не добыт курсор ядерного журнала: …» через `notify` и выход с кодом 2. Если не запустилось основное чтение `journalctl --after-cursor` — «СЛЕПОТА: не добыт ядерный журнал: journalctl не запущен» и код 2. Ветка ошибки чтения (`--after-cursor` ответил ненулевым кодом) по-прежнему тревожит «не удалось прочитать ядерный лог (rc=…)» и сбрасывает курсор на текущую позицию, но теперь выходит с кодом 2: проход не считается успешным. Следствие: юнит `oneshot` становится `failed` и виден в `systemctl --failed`. Известное ограничение: памяти о том, что тревога о слепоте уже сказана, нет — она уходит при каждом запуске, раз в минуту по таймеру, и заваливает канал, пока слепота не кончится.
- **Сбой канала тревоги не обрывает проход.** Вызов канала (`notify`) ограничен 20 секундами (`ALERT_TIMEOUT` — константа в коде, не переменная окружения), любое исключение при запуске канала (файл без шебанга — `OSError: Exec format error`, ошибка прав) перехватывается. Любой сбой — таймаут, исключение, ненулевой код, неисполнимый путь — даёт одну строку «🔴 OOM-KILL: тревога НЕ доставлена (<причина>) — остаётся только журнал» в stderr, проход идёт до конца, курсор записывается. `notify` возвращает True/False. Прежде: исключение при запуске роняло проход с кодом 1 до записи курсора — те же тревоги повторялись каждую минуту, наружу не уходило ничего; таймаута не было (проба: зависание канала на 60 с держало `oneshot` 60 с, теперь 20 с). Тревога «СЛЕПОТА» идёт тем же `notify`, поэтому сломанный канал не роняет и путь слепоты. По-прежнему не ловится: канал, ответивший 0, но не доставивший сообщение дальше.
- **Курсор — на последней прочитанной записи.** После успешного чтения курсор ставится на `__CURSOR` последней прочитанной записи, а не на конец журнала в этот момент: строки, пришедшие после чтения (в том числе пока ждали канал тревоги), читает следующий проход. Ничего не прочитано — курсор не меняется.
- Коды выхода теперь: 0 — проход отработал (в том числе «тревога не доставлена»); 2 — слепота, журнал не добыт или ошибка чтения; 1 — только неперехваченная ошибка Python (не ожидается).
- Документация (README, ARCHITECTURE, SETTINGS, GUARDS, TROUBLESHOOTING) приведена к этому поведению; в GUARDS добавлены проверки 7–9.

- **Blindness — an alert and exit code 2.** `current_cursor()` treats three outcomes of `journalctl -k -n 1 --show-cursor` as blindness: it failed to start (`OSError`), exited non-zero (no permission: verified, an unprivileged account gets exit 1 and no cursor line), or exited 0 without a cursor line — including a completely empty kernel journal on the first run (previously a silent exit 0 and a retry). In all three cases — the alert "СЛЕПОТА: не добыт курсор ядерного журнала: …" (BLINDNESS: no kernel-journal cursor obtained) via `notify` and exit code 2. If the main read `journalctl --after-cursor` failed to start — "СЛЕПОТА: не добыт ядерный журнал: journalctl не запущен" (BLINDNESS: kernel journal not obtained, journalctl not started) and code 2. The read-error branch (`--after-cursor` exited non-zero) still alerts "не удалось прочитать ядерный лог (rc=…)" (could not read the kernel log) and resets the cursor to the current position, but now exits with code 2: the pass is not counted as a success. Consequence: the `oneshot` unit becomes `failed` and shows up in `systemctl --failed`. Known limitation: there is no memory that the blindness alert was already said — it goes out on every run, once a minute by the timer, and floods the channel for as long as the blindness lasts.
- **An alert-channel failure does not abort the pass.** The channel call (`notify`) is limited to 20 seconds (`ALERT_TIMEOUT` — a constant in the code, not an environment variable), and any exception while launching the channel (a file without a shebang — `OSError: Exec format error`, a permission error) is caught. Any failure — a timeout, an exception, a non-zero exit, a non-executable path — prints one stderr line "🔴 OOM-KILL: тревога НЕ доставлена (<reason>) — остаётся только журнал" (alert NOT delivered, journal only); the pass runs to the end and the cursor is saved. `notify` returns True/False. Previously: a launch exception crashed the pass with exit code 1 before the cursor was saved — the same alerts repeated every minute and nothing went out; there was no timeout (probe: a 60 s channel hang held the `oneshot` for 60 s, now 20 s). The «СЛЕПОТА» alert goes through the same `notify`, so a broken channel does not crash the blindness path either. Still not caught: a channel that exits 0 but does not deliver the message further.
- **The cursor sits at the last read entry.** After a successful read the cursor is set to the `__CURSOR` of the last entry read, not to the end of the journal at that moment: lines that arrived after the read (including while waiting for the alert channel) are read by the next pass. Nothing read — the cursor is left unchanged.
- Exit codes now: 0 — the pass completed (including "alert not delivered"); 2 — blindness, journal not obtained, or a read error; 1 — only an uncaught Python error (not expected).
- The documentation (README, ARCHITECTURE, SETTINGS, GUARDS, TROUBLESHOOTING) now matches this behaviour; GUARDS gained checks 7–9.

### Документация · Documentation

**Только документация; код не изменён, кроме комментариев.**

**Documentation only; code unchanged except comments.**

- Документация стала двуязычной (русский абзац, затем тот же по-английски): README.md по стандартному плану из 10 разделов, новые docs/ARCHITECTURE.md (схемы mermaid: взаимодействие, поток одного убийства, состояния курсора), docs/SETTINGS.md, docs/GUARDS.md, docs/TROUBLESHOOTING.md и этот журнал.
- Комментарии и docstring в `bin/oom-watch`, `systemd/oom-watch.service`, `systemd/oom-watch.timer` — двуязычные (`# RU:` / `# EN:`), с границами: чего каждая проверка не ловит. Исполняемый код и тексты тревог не тронуты (сверка AST без docstring и строк юнитов без комментариев — расхождений 0).
- Примеры юнитов в README обезличены: `svc-a.service`, `svc-b.service`.
- Рецепт проверки в README уточнён по коду: групповая тревога начинается с `🔴 Убийство по памяти`, а не с `🔴 OOM-KILL`; если таймер успел первым, тревога — в `journalctl -u oom-watch.service`.
- Описаны ограничения, найденные при разборе кода (поведение не менялось): слепой и молчаливый первый запуск без прав на журнал; сдвиг курсора на конец журнала, а не на последнюю прочитанную строку; отсутствие таймаута у канала тревоги; неперехваченное исключение при запуске канала (эти четыре сняты изменениями поведения 2026-10-04 выше); приём курсора от вычищенного журнала без ошибки (проба на systemd 255); неверная причина «не сошлись по номеру процесса» для cgroup не `.service`; игнорирование любых аргументов, кроме `--version`.

- The documentation became bilingual (a Russian paragraph, then the same in English): README.md on the standard 10-section outline, new docs/ARCHITECTURE.md (mermaid diagrams: interaction, the flow of one kill, cursor states), docs/SETTINGS.md, docs/GUARDS.md, docs/TROUBLESHOOTING.md and this changelog.
- Comments and docstrings in `bin/oom-watch`, `systemd/oom-watch.service`, `systemd/oom-watch.timer` are bilingual (`# RU:` / `# EN:`), with boundaries: what each check does not catch. Executable code and alert texts are untouched (AST comparison without docstrings and unit lines without comments — 0 differences).
- Unit examples in the README are anonymized: `svc-a.service`, `svc-b.service`.
- The README verification recipe was corrected to match the code: a cgroup alert starts with `🔴 Убийство по памяти`, not `🔴 OOM-KILL`; if the timer got there first, the alert is in `journalctl -u oom-watch.service`.
- Limitations found while reading the code are documented (behaviour unchanged): a blind and silent first run without journal permission; the cursor moving to the journal end rather than the last line read; no timeout on the alert channel; an uncaught exception when launching the channel (these four were removed by the 2026-10-04 behaviour changes above); a cursor from a vacuumed journal accepted without error (probe on systemd 255); the wrong "did not pair by pid" reason for non-`.service` cgroups; any argument other than `--version` being ignored.

## 1.1.0

Текущая версия кода (`__version__ = "1.1.0"`). Что в ней есть — по README и коду; какие из пунктов появились именно в 1.1.0, а какие раньше, в пакете не записано.

The current code version (`__version__ = "1.1.0"`). What it contains — per the README and code; which of these items appeared in 1.1.0 specifically and which earlier is not recorded in the package.

- Сигнал — ядерный журнал (`journalctl -k` от сохранённого курсора), а не счётчик `memory.events.oom_kill`, который обнуляется при перезапуске юнита.
- Связь строк ядра по pid вместо склейки по порядку; несошедшаяся пара — «служба не определена», ближайший юнит не подставляется. Версия со склейкой по порядку была выпущена и отозвана.
- Два вида убийства: групповое (`CONSTRAINT_MEMCG`, юнит из `oom_memcg`, предел и процент) и глобальное (`CONSTRAINT_NONE` / `CPUSET` / `MEMORY_POLICY`, юнит из `task_memcg`, без предела, с памятью машины «сейчас»).
- Распознавание строки убийства по `: Killed process` — все три текста ядра.
- Имя юнита — последний сегмент пути cgroup (вложенные slice и шаблонные юниты).
- Неопознанные и глобальные убийства тревожат всегда, независимо от `OOM_WATCH_UNITS`.
- Ошибка чтения курсора — одна тревога наружу и сброс на текущую позицию вместо вечной слепоты.
- Номер версии в самом скрипте, `oom-watch --version`.

- The signal is the kernel journal (`journalctl -k` from a saved cursor), not the `memory.events.oom_kill` counter that is reset when the unit restarts.
- Kernel lines are paired by pid instead of by order; an unmatched pair is "unit not identified", the nearest unit is not substituted. A by-order version was shipped and withdrawn.
- Two kinds of kill: cgroup (`CONSTRAINT_MEMCG`, unit from `oom_memcg`, limit and percentage) and global (`CONSTRAINT_NONE` / `CPUSET` / `MEMORY_POLICY`, unit from `task_memcg`, no limit, host memory "now").
- The kill line is recognised by `: Killed process` — all three kernel texts.
- Unit name — the last segment of the cgroup path (nested slices and template units).
- Unidentified and global kills always alert, regardless of `OOM_WATCH_UNITS`.
- A cursor read error — one outward alert and a reset to the current position instead of permanent blindness.
- The version number lives in the script itself, `oom-watch --version`.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке. · EN: Entries reconstructed from the git diff of the named commits on 2026-10-08; they are not release numbers and not measurements of the deployed system.

- `72dd627726c3` (2026-08-20) — Первая редакция: `bin/oom-watch`, юнит `oneshot` и поминутный таймер. Читает `journalctl -k` от сохранённого курсора (`OOM_WATCH_STATE`, по умолчанию `/var/lib/oom-watch`), строку `oom-kill:constraint=CONSTRAINT_MEMCG` склеивает со следующей `Memory cgroup out of memory: Killed process` по порядку; юнит — последний сегмент пути `oom_memcg`, неузнанный юнит тревожит всегда; тревога — в журнал и, если задан `OOM_WATCH_ALERT`, командой с текстом одним доводом; первый запуск только запоминает позицию. Только групповые убийства. · EN: First revision: a oneshot unit plus a per-minute timer reading `journalctl -k` from a saved cursor, pairing the `CONSTRAINT_MEMCG` line with the next `Memory cgroup out of memory: Killed process` line by order; unit = last segment of the `oom_memcg` path, an unrecognised unit always alerts; alert to the journal and optionally to `OOM_WATCH_ALERT` as a single argument; the first run only records the position; cgroup kills only.
- `f6a5c811b759` (2026-08-20) — Пакет отозван: из дерева удалены README, `bin/oom-watch` и оба юнита, потому что склейка строк ядра по порядку могла приписать убийство не той службе. Это та «версия со склейкой по порядку», что в перечне возможностей кода выше названа выпущенной и отозванной. · EN: Package withdrawn: README, the script and both units removed, because by-order pairing could attribute a kill to the wrong unit; this is the by-order version noted in the feature list above as shipped and withdrawn.
- `671561063690` (2026-08-20) — Пакет возвращён со связью по pid: журнал читается в JSON, из строк `oom-kill:` строится карта «pid → юнит», строка `Killed process <pid>` связывается по ней; не связалось — «служба не определена», ближайший юнит не подставляется, и такая тревога идёт всегда, даже при заданном `OOM_WATCH_UNITS`. Юнит берётся, только если сегмент оканчивается на `.service`. Тревога стала многострочной (узел, описание и пользователь юнита, процесс и anon-rss, `MemoryMax` и процент, политика `Restart`, время) и передаётся в `OOM_WATCH_ALERT` через stdin. Первый запуск без курсора теперь выходит молча. · EN: Package restored with pid pairing: the journal is read as JSON, `oom-kill:` lines build a pid → unit map, and an unmatched kill is reported as "unit not identified" (always alerting, even with `OOM_WATCH_UNITS`), never the nearest unit; only `.service` segments count as units; the alert becomes multi-line (host, unit description and user, process and anon-rss, `MemoryMax` and percentage, `Restart` policy, time) and goes to `OOM_WATCH_ALERT` on stdin; a first run without a cursor now exits silently.
- `ef169bc73b22` (2026-08-21) — Глобальные убийства: учитываются все значения `constraint` (`CONSTRAINT_MEMCG` — групповое, `NONE`/`CPUSET`/`MEMORY_POLICY` — глобальное), строка убийства узнаётся по `: Killed process` (все три текста ядра), юнит у группового — из `oom_memcg`, у глобального — из `task_memcg`. Глобальная тревога говорит другими словами: без предела и процента, с памятью машины «сейчас, не на момент убийства»; она идёт всегда, независимо от `OOM_WATCH_UNITS`. · EN: Global kills: every `constraint` value is handled (MEMCG cgroup; NONE/CPUSET/MEMORY_POLICY global), the kill line is matched by `: Killed process` (all three kernel texts), the unit comes from `oom_memcg` for a cgroup kill and `task_memcg` for a global one; a global alert uses different wording, no limit or percentage, host memory labelled "now", and always alerts regardless of `OOM_WATCH_UNITS`.
- `727c9d485764` (2026-10-04) — Дерево приведено к установленному скрипту: `current_cursor()` при незапуске `journalctl`, ненулевом коде или ответе без строки курсора шлёт тревогу «СЛЕПОТА: не добыт курсор ядерного журнала…» и выходит с кодом 2; незапуск основного чтения — «СЛЕПОТА: не добыт ядерный журнал…», код 2; ветка ошибки чтения после сброса курсора выходит с кодом 2 вместо 0. Это поведение описано выше в пункте «Слепота — тревога и код выхода 2». В `systemd/oom-watch.service` закомментированные образцы заменены действующей машинной строкой `OOM_WATCH_ALERT`; позже юнит снова обобщён (по коду на 08.10 канал тревоги в нём — закомментированный образец). · EN: The tree is brought to the installed script: cursor failures (journalctl not started, non-zero exit, no cursor line) and a failed main read alert "СЛЕПОТА…" and exit 2, and the read-error branch exits 2 instead of 0 (the behaviour described above under "Blindness — an alert and exit code 2"); the service file carried a machine-specific `OOM_WATCH_ALERT` line instead of commented examples, later generalised again (per the code as of 08.10 the alert channel is a commented example).
