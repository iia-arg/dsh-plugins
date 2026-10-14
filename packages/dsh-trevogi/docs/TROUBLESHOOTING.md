# Отказы и разбор · Troubleshooting

«Нет токена или чата» → путь отсутствует, закрыт или файл пуст. Проверь путь и права под рукой службы, не печатай значение; секрет не передают в argv. Неверный токен или чат может дать серверный отказ без повторов.

“No token or chat” → the path is missing, unreadable or empty. Check the path and permissions as the service account without printing its value; never pass a secret in argv. An invalid token or chat may cause server refusal without retries.

«Config отсутствует/не читается», неизвестный или повторный ключ → явно выбран не тот файл, неверны права/UTF-8/синтаксис. Восстанови `KEY=value`; комментарий только в нулевой колонке. Отказ всего config запрещает эффекты даже при исправном отдельном ключе.

“Config missing/unreadable”, unknown or duplicate key → wrong explicit file, permissions/UTF-8/syntax. Restore `KEY=value`; comments start only in column zero. Whole-config failure prevents effects even when a particular key is valid.

«Проба, не отправлено», код 0 → сработала метка `DSH_PROBA=1`, это не подтверждение Telegram; строка журнала называет первые 120 знаков неотправленного. Если ожидалась рабочая тревога, проверь окружение вызывающего. Негодная метка отвергается; неизвестный ключ остаётся отказом даже в пробе.

“Probe, not sent”, exit 0 → `DSH_PROBA=1` took effect; the journal line names the first 120 characters of what was not sent; this is not Telegram acknowledgement. If a real alert was expected, check the caller's environment. An invalid marker fails; unknown options still fail in probe mode.

«Сеть не пустила» → curl не дошёл, попытки ограничены настройкой. 5xx/429 и не-JSON повторяются до предела; retry_after больше300/неверный прекращает вызов. «Telegram ответил отказом» → постоянный отказ, повтор не исправит адрес/права. Ответ очищается от токена до журнала, но не считается безопасным произвольным текстом.

“Network blocked” → curl did not reach the service; settings bound retries. 5xx/429 and non-JSON responses retry within limits; invalid/retry_after>300 stops. “Telegram refused” means a permanent refusal; retrying will not fix address/permissions. Responses are redacted for the token before journaling, but are not treated as generally safe arbitrary text.

«Хвост НЕ записан» → файла нет, закрыта запись, занят flock или превышен размер; отправка может быть успешной без хвоста. Проверь часовой таймер и права. Не создавай хвост рукой отправителя: это меняет владельца и границу чтения.

“Tail NOT written” → missing/unwritable file, flock contention or size limit; sending may succeed without the tail. Check the hourly timer and permissions. Do not create the tail as the sender: that changes ownership and read boundaries.

«Курсор прежний» и pending sent:false → доставка неизвестна; следующий прогон НЕ повторит окно. «Слепота журнала» → окно не прочитано; это не ноль отказов. После восстановления канала/журнала повтори один прогон с известным временным курсором на стенде.

“Cursor unchanged” with pending sent:false means delivery unknown; the next pass will NOT replay this window. “Journal blindness” → the window was unreadable; this is not zero refusals. After restoring channel/journal access, run one pass with a known temporary cursor in the test environment.

«Тревога ушла, курсор не записан» —2: восстановить хранилище, следующий запуск сохранит cursor из sent:true без новой отправки. Sent:false после ошибки/таймаута/обрыва требует доказательства исхода и страховки pending; удалить его можно только при доказанном отсутствии отправки и осознанном повторе. Нельзя удалять ради зелёного результата. Нет root/adm/systemd-journal или журнал пишет warning — окно не измерено. Без lib сторож даёт именованный2, без трассировки.

“Alert sent, cursor not written” exits2: restore storage; the next invocation commits the sent:true cursor without resending. Sent:false after error/timeout/crash requires proven delivery status and a pending backup; remove only after proving no send and deliberately retrying. Never delete it only to get green. Lack of root/adm/systemd-journal or a journal warning means an unmeasured window. Missing library gives a named2 without traceback.
