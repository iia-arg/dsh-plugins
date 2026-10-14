# Самопробуждение: политика и границы · Autonomous wake policy and boundaries

Мост ограничивает доставленные расписателем автономные пробуждения, а не все возможные причины запуска агента. Его читатель — callback конца хода и guard постановки расписания. Неизвестная история не равна отсутствию работы; при слепоте мост пишет причину и ограничивает продолжение.
The bridge constrains scheduler-delivered autonomous wakes, not every possible agent trigger. Its consumers are the turn-end callback and scheduling guard. Unknown history does not mean no activity; when blind, the bridge reports the reason and constrains continuation.

## Источник и область · Source and scope

Счёт берётся из persistent событий одной сессии. Поддерживаются старые dispatch events и новый source.kind=schedule. Полоса прерывается видами humanKinds, а календарный день вычисляется в dayZone. Несколько корневых сессий имеют отдельные бюджеты; число 48 по умолчанию нельзя читать как общий дневной бюджет агента.
Counters use durable events from one session. Old dispatch events and new source.kind=schedule are supported. humanKinds breaks the streak, and dayZone defines the calendar day. Multiple root sessions have separate budgets; the default 48 is not a shared daily agent budget.

История schedule служит дополнительным свидетелем: чтение до 100 records/task сравнивается с дневным числом в session events. Если свидетель видит больше событий или не читается, подсистема сообщает слепоту. Недоступный API свидетеля возвращает null и не превращается в полную независимую проверку.
Scheduler history supplies an additional witness: up to 100 records/task are compared with the daily session-event count. If the witness sees more events or fails to read, the subsystem reports blindness. An unavailable witness API returns null and does not amount to complete independent verification.

## Умолчание, расчёт и границы · Defaults and calculation

При успешном чтении умолчания: minimum 1800 seconds, максимум 6 подряд, 48/сутки/сессия, лестница, hour ceiling 0 (выключен), автоматическое резюме true. Лестница задаёт base×step с ограничением ступени по полосе; ровный режим задаёт ravnomernoIntervalSeconds. При исчерпании часа одноразовый срок отодвигается, постановка/изменение времени every_seconds, daily и weekly отказывает. turn/end проверяет полосу, сутки и час для всех действующих видов.
Normal defaults on a successful read are minimum 1800 seconds, maximum 6 consecutive, 48/day/session, ladder mode, hourly ceiling 0(disabled), automatic summarytrue. Ladder delays use base×step bounded by the streak; uniform mode uses ravnomernoIntervalSeconds. A full hour defers one-shot delays and refuses every_seconds, daily and weekly creation/timing updates. turn/end checks streak, day and hour for all existing kinds.

Строгий fallback при ошибке чтения: одна creation за 60 minutes, blocked после 3 rounds, minimum 3600 seconds, максимум 1 подряд и 1/сутки, UTC, humanKinds=[user]. Отсутствующие поля отказного объекта не дополняются полноценной обычной политикой. Файл политики не валидируется по всем типам и диапазонам: оператор должен проверять значения перед reload.
Strict read-failure fallback is one creation per 60 minutes, blocked after 3 rounds, minimum 3600 seconds, maximum 1 consecutive and 1/day, UTC, humanKinds=[user]. Missing fields in the failure object are not filled into a full normal policy. Policy files lack complete type/range validation: operators must validate values before reloading.

## Остановка и резюме · Stopping and summaries

Механизм работает на turn/end и не обрывает текущий ход. Он удаляет напоминания через native сервис, затем пишет итог в журнал и optional notice directory. Маркер остановки ставится до await против второй конкурентной проверки и снимается при неудаче. Следующий конец хода может повторить остановку; отдельного бесконечного retry-loop нет.
The mechanism acts at turn/end and does not interrupt the current turn. It deletes reminders through the native service, then writes a summary to logs and an optional notice directory. A stop marker is set before awaiting to prevent a concurrent duplicate check and cleared on failure. A later turn end can retry stopping; there is no separate infinite retry loop.

heartbeat_close принимает непустой содержательный итог. Файл отметки или память процесса подавляет дублирующее автоматическое резюме той же полосы; закрытие потребляет отметку, чтобы она не подавляла следующую. Пустой итог отказывает. Без каталога уведомлений отметка не переживает restart, а текст остаётся в журнале.
heartbeat_close accepts a nonempty substantive outcome. A marker file or process memory suppresses the automatic duplicate summary for that streak; closure consumes the marker so it cannot suppress the next streak. Empty outcomes are refused. Without a notice directory, the marker does not survive restart while its text remains logged.

Удаление считается успешным только при deleted:true. deleted:false и исключение записываются с ID напоминания, не увеличивают число снятых и не мешают проверить остальные. Отказ возвращает false и снимает маркер для следующего конца хода.
Deletion succeeds only on deleted:true. deleted:false and exceptions are recorded with the reminder ID, do not increase removal counts and do not prevent other attempts. Failure returns false and clears the marker for the next turn end.

## Чего защита не охватывает · What it does not cover

Одновременные доставки до конца хода могут превысить часовой предел: проверка не стоит внутри доставщика. Пределы не контролируют goal rounds, job wake budgets, внешние dispatchers, другой маршрут без моста и scoped site sessions. Они не заменяют сохранность/backup session journal. Модель с root/sudo может воздействовать на процесс и файлы; это поведенческий guard, не OS isolation.
Simultaneous deliveries before turn end can exceed the hourly limit: checking does not occur inside the delivery driver. Limits do not control goal rounds, job wake budgets, external dispatchers, other routes without the bridge or scoped site sessions. They do not replace session-journal integrity/backup. A model with root/sudo can affect processes and files; this is a behavioral guard, not OS isolation.

Настройка szhimatIstoriyuPeredUdarom не делает compaction: hook остаётся неподключённым, включение только предупреждается в журнале. Изменение YAML требует remount/restart в текущем вызове apply, хотя отдельный reader имеет mtime cache. Эти границы надо проверять по исполняемому коду, а не по намерению комментария.
The szhimatIstoriyuPeredUdarom setting does not perform compaction: its hook is not connected and enabling it only logs a warning. Changed YAML requires remount/restart under the current apply call path even though the reader has an mtime cache. Verify these boundaries from executing code rather than comment intent.

Подробные настройки: [SETTINGS](docs/SETTINGS.md). Потоки и состояния: [ARCHITECTURE](docs/ARCHITECTURE.md). Каждый guard и его проверка: [GUARDS](docs/GUARDS.md). Диагностика с восстановлением: [TROUBLESHOOTING](docs/TROUBLESHOOTING.md).
For complete settings see [SETTINGS](docs/SETTINGS.md); flows/states in [ARCHITECTURE](docs/ARCHITECTURE.md); each guard and its tests in [GUARDS](docs/GUARDS.md); recovery procedures in [TROUBLESHOOTING](docs/TROUBLESHOOTING.md).
