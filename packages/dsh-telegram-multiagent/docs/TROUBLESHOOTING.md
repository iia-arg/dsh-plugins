# Диагностика и восстановление · Troubleshooting and recovery

Сначала зафиксируй пакет/версию из живого журнала, время запуска процесса, путь его установки и ID квитанции. SHA файла на диске доказывает диск, не уже загруженный модуль. Рабочую базу открывай read-only; не удаляй ledger или сессии для попытки «начать чисто».

First record the live log's package/version, process start time, installation path, and receipt ID. A disk hash identifies the file, not an already loaded module. Open production databases read-only; do not delete ledgers or sessions to try a clean restart.

| Признак · Symptom | Вероятная причина RU / EN · Cause to verify | Проверка и исправление RU / EN · Check and remedy |
|---|---|---|
| Нет подключения бота / no bot connection | tokenFile пуст/нет доступа, неверный appDir / empty or unreadable token file, wrong appDir | Проверить права и путь без вывода токена; check permissions and path without printing token |
| Ответы есть, инструменты отсутствуют / replies work but tools absent | Пресет не смонтирован или чужая область / preset missing or wrong composition scope | Сверить header.agentPreset и wireSchemas; match header.agentPreset and wireSchemas |
| ID collision при resume / ID collision on resume | create вместо сохранённого поколения / create substituted for persisted generation | Сверить persistence list и createdAt, не перезаписывать журнал; check persistence identity, never overwrite log |
| cwd mismatch | Старая сессия другого workspace / persisted session belongs to different workspace | Исправить размещение отдельно; не обходить отказ; migrate separately, do not bypass refusal |
| Site tool set differs | agent/created навесил локальный инструмент / late local registration added a capability | Проверить версию native view filter и restart; retain exact allow-list |
| Site bridge capability list differs | Внешний MCP descriptor содержит лишнее / external descriptor exposes extra tools | Исправить bridge list AND execution, затем restart; fix list and execution, restart |
| identity conflict у kopii / copy identity conflict | Повтор ID имеет новый at/reason / duplicate ID changed timestamp or reason | Сравнить SHA исходного конверта; сохранить исходные байты повтора; compare envelope hashes and preserve retry bytes |
| Вход сайта остался .claimed / claimed website file remains | Ошибка admission/dispatch или перезапуск / admission/dispatch error or restart | Сверить receipt/site_messages; не возвращать в публичное имя вслепую; reconcile before restoring public filename |
| Повторный файл отправлен не туда / file route refusal | Ход не имеет одного подтверждённого Telegram route / open turn lacks one confirmed route | Проверить claimed_turn/session generation/raw sender; модель не выбирает destination |
| /new refused | Нет capability/version2, busy, неизвестная отмена / missing capability, busy, cancellation uncertain | Читать report/audit по receipt; разрешить причину отдельно; inspect cancellation evidence, resolve separately |
| Pause остаётся после restart / pause persists | Durable state по поколению / generation-scoped durable state | Обычный allowed privileged human input или согласованный /new; normal admitted privileged human input or reviewed /new |
| Отвечает на каждое слово группы / noisy group | Группа не перечислена в groups / group missing in settings | Настроить mention/names/replyCounts, проверить реальные entities; configure and test actual entities |
| Владелец видит два письма / duplicated owner visibility | И sender courier, и owner-all receiver копируют / both sender courier and receiver copy | Измерить оба звена; выбрать одно ответственное, не удалять configs вслепую; measure both ends and choose one owner |
| HTTP unknown после файла / file send outcome unknown | Запрос мог пройти, ack потерян / server may have accepted request without ack | Не повторять автоматически; сверить внешний канал; reconcile externally before retry |
| Старый текст остаётся в SQLite / expired text persists | Копии текста/страницы/free-list/отправка ещё pending / duplicate fields, page remnants, pending delivery | Проверить критерий30days, secure_delete и VACUUM; не считать raw=NULL полным стиранием |
| Ledger user_version unsupported | Чужая/промежуточная схема / unsupported schema version | Сохранить страховку, совместимая миграция; не создавать пустую базу поверх; preserve backup and migrate compatibly |

## Read-only пример · Read-only example

```sh
sqlite3 'file:/opt/<agent-home>/workspace/.message-receipts/receipts.sqlite?mode=ro' \
  'SELECT id,route,route_key,claimed_turn,finished_at,outcome,blocked FROM receipts ORDER BY received_at DESC LIMIT 20;'
```

Не выгружай содержимое `raw`, `message_json`, `outbox.body` или секретов в публичный отчёт. Для диагноза чаще достаточно идентичности, времени, статуса и сообщения ошибки. Операторский `receipt-admin.mjs` содержит конкретные команды, перечисленные ниже; перед действием прочитай ограничения выбранного действия. Перенос команды от другой версии не является разрешённым восстановлением.

Do not publish `raw`, `message_json`, `outbox.body`, or secret contents in a report. Identity, timestamps, status, and an error message usually suffice. `receipt-admin.mjs` provides the concrete operations listed below; review each operation's eligibility constraints before acting. Copying a command from another version is not a valid recovery procedure.

## Что исправлено исторически · Previously observed failure classes

Проверки полного набора выполняются после всех событий регистрации, а не сразу после setup. Паузы и смена поколения переживают перезапуск; ранний успешный stdout не считается подтверждением flush. Копии и исходящие повторяются отдельно от работы модели. Срок хранения затирает все дубли тела, а не только одно поле.

Complete capability checks run after registration events rather than immediately after setup. Pauses and generation rotation survive restart; early successful stdout is not a persistence confirmation. Copies and outgoing delivery are retried separately from model execution. Retention erases duplicate body fields rather than a single field.

## Операторский receipt-admin · Operator receipt-admin

Синтаксис: `node src/receipt-admin.mjs status <absolute-ledger-root>` только читает; действия `approve-new`, `discard`, `release-text`, `reject-envelope` дополнительно требуют receipt ID, имя оператора и ссылку на решение. `approve-new` применим к ещё не начатому legacy_ambiguous; `discard` также допускает определённые invalid_utf8/signature holds. Действия конверта требуют held/envelope_held до deadline без dispatch; release-text запрещён при неизвестной фазе отмены и пустом теле.

Syntax: `node src/receipt-admin.mjs status <absolute-ledger-root>` is read-only; `approve-new`, `discard`, `release-text`, and `reject-envelope` additionally require a receipt ID, operator name, and decision reference. `approve-new` applies to undispatched legacy ambiguity; discard also handles certain invalid-UTF8/signature holds. Envelope actions require held/envelope_held before the deadline and before dispatch; release-text rejects uncertain cancellation phases and empty bodies.

`rollback-v1` — отдельная схема отката, требует оператора/основание и отсутствия открытых/неопределённых конвертов. `/proc`-проверка открытых дескрипторов является наблюдением, не замком против нового writer: держи пишущую службу остановленной до завершения. CLI не мигрирует неизвестную базу и не создаёт пустую вместо неё. Никогда не используй release/discard только для гашения тревоги без разбора исхода.

`rollback-v1` is a separate schema rollback requiring operator/reference and no unresolved envelopes. The `/proc` descriptor check is an observation, not an exclusion lock against new writers; keep the writing service stopped until rollback finishes. The CLI neither migrates unknown databases nor replaces them with empty ones. Never release/discard merely to silence an alarm without reconciling the outcome.


```sh
node src/receipt-admin.mjs status '/opt/<agent-home>/workspace/.message-receipts'
node src/receipt-admin.mjs approve-new ROOT ID OPERATOR REFERENCE
node src/receipt-admin.mjs discard ROOT ID OPERATOR REFERENCE
node src/receipt-admin.mjs release-text ROOT ID OPERATOR REFERENCE
node src/receipt-admin.mjs reject-envelope ROOT ID OPERATOR REFERENCE
node src/receipt-admin.mjs rollback-v1 ROOT OPERATOR REFERENCE
```

ROOT в примере — существующий абсолютный корень ledger; ID — receipt ID, OPERATOR и REFERENCE — непустые строки решения. Произвольные `dispatch_unknown`/`interrupted_unknown` эти команды не выпускают на автоматический повтор. Исключение: `discard` закрывает без исполнения запись `channel_unknown` или `dispatch_unknown`, которая не дошла до агента (передача не начата, сессии и захваченного хода нет), — иначе «УДЕРЖАНО» напоминало бы о ней каждые сутки. Ветвь удержанного исполнения в диаграмме обозначает общий операторский разбор, не универсальную команду «разрешить».

ROOT must be an existing absolute ledger root; ID is the receipt ID, and OPERATOR/REFERENCE are nonempty decision strings. These commands do not release arbitrary `dispatch_unknown`/`interrupted_unknown` records for automatic replay. Exception: `discard` closes without execution a `channel_unknown` or `dispatch_unknown` record that never reached the agent (dispatch not started, no session and no claimed turn) — otherwise «УДЕРЖАНО» (held) would remind about it every day. The diagram's held-execution branch denotes operator reconciliation rather than a universal allow command.
