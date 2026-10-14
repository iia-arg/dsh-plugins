# Восстановление ключей повторов requestKey · requestKey recovery

Описание относится к версии пакета из `package.json`. Wire API и аргументы модели не меняются. Перед каждой из шести write-операций — plan.create, plan.edit, client.create, client.save, client.assign, plan.link (перечень `WRITES` в `src/ostrov-api.js`) — мост проверяет состояние ключей; guest.requestHuman, frameRevision и новый endpoint статуса не вводятся.
This applies to the package version in `package.json`. The wire API and model arguments do not change. Before each of the six write operations — plan.create, plan.edit, client.create, client.save, client.assign, plan.link (the `WRITES` list in `src/ostrov-api.js`) — the bridge checks the key state; guest.requestHuman, frameRevision and a new status endpoint are not introduced.

## Состояние и поведение · State and behaviour

В защищённом requestKeyDir остаются прежние <digest>.json и добавляются .request-state.json и .reservations/<digest>.sha256. В workspace лежит .ostrov-api-state.json; он должен входить в резервную копию. Оба неизменяемых маркера содержат одинаковые epoch, keyAlgorithm, канонические пути и полный список pre-cutover legacyDigests. Ключи, токены и Telegram payload в workspace-маркер не копируются.
The protected requestKeyDir keeps the former <digest>.json files and gains .request-state.json and .reservations/<digest>.sha256. The workspace holds .ostrov-api-state.json; it must be in the backup. Both immutable markers contain the same epoch, keyAlgorithm, canonical paths and the full list of pre-cutover legacyDigests. Keys, tokens and Telegram payloads are not copied into the workspace marker.

Нет подготовленного/совпадающего маркера, пропала половина известной пары, state не читается или SHA не совпала — OSTROV_API_RECOVERY_REQUIRED до HTTP. Текст называет неизвестный исход прежней записи и необходимость восстановления оператором. Чтение остаётся доступным. Runtime не создаёт и не инициализирует пропавшее хранилище.
No prepared/matching marker, half of a known pair missing, unreadable state or a SHA mismatch give OSTROV_API_RECOVERY_REQUIRED before HTTP. The text names the unknown outcome of the earlier write and the need for operator recovery. Reads stay available. The runtime does not create or initialise a missing store.

Резервирование публикуется перед ключом, оба файла сохраняются с fsync. Успешный читатель тоже делает fsync обоих файлов и каталогов до возврата ключа. Конкурентный читатель может отказать на ещё неполной паре, но не создаёт замену. Оставшиеся временные файлы не удаляются автоматически.
The reservation is published before the key; both files are saved with fsync. A successful reader also fsyncs both files and directories before returning the key. A concurrent reader may refuse on a still incomplete pair but creates no replacement. Leftover temporary files are not removed automatically.

Прежние случайные ключи переиспользуются без изменения. Неизменяемый legacyDigests отличает потерянный старый ключ от нового действия, включая совместимость с allowClientOperations/anonymous. Инициализировать защиту по заведомо неполному старому state нельзя.
Former random keys are reused unchanged. The immutable legacyDigests tells a lost old key from a new action, including compatibility with allowClientOperations/anonymous. Protection must not be initialised from a known-incomplete old state.

Новые ключи вычисляются неизменной версионированной формулой:
New keys are computed by a fixed versioned formula:

    vp- + sha256("ostrov-request-v1\n" + epoch + "\n" + canonicalDigest).hex[:48]

canonicalDigest — прежний digest моста: session/operation/params/actor/botId/guest. Сначала ищутся совместимые legacy keys, потом применяется формула. Epoch и формулу нельзя менять на месте. Если согласованная старая копия ещё не содержит нового ключа и его резервирования, прежний вызов получит тот же ключ; серверный журнал идемпотентности предотвратит повторное изменение. Изменение роли или client.read preprocessing может дать 409 — это отказ, не разрешение отправить новый ключ.
canonicalDigest is the bridge's former digest: session/operation/params/actor/botId/guest. Compatible legacy keys are looked up first, then the formula applies. The epoch and the formula must not be changed in place. If a consistent old copy does not yet hold the new key and its reservation, the earlier call gets the same key; the server idempotency journal prevents a repeated change. A role change or client.read preprocessing may give 409 — a refusal, not permission to send a new key.

## Подготовка · Preparation

Это не автоматическая миграция при запуске; подготовку делает назначенная оператором рука после приёмки пакета. Остановить и дождаться завершения старого writer до подготовки; сохранить его остановленным до загрузки нового пакета. Пакет и подготовка состояния выполняются одним окном.
This is not an automatic migration at start-up; the preparation is done by an operator-assigned hand after the package is accepted. Stop the old writer and wait for it to finish before preparing; keep it stopped until the new package is loaded. The package and the state preparation happen in one window.

Предварительный просмотр без изменения данных · Preview without changing data:

    node tools/ostrov-request-state.mjs --plan <requestKeyDir> <workspace>

В окне, после страховки полного прежнего state и пакета, от владельца обоих путей (учётка агента, чей это `requestKeyDir`) ·
In the window, after a backup copy of the full previous state and package, as the owner of both paths (the account of the agent
whose `requestKeyDir` it is):

    node tools/ostrov-request-state.mjs --initialize <requestKeyDir> <workspace>
    node tools/ostrov-request-state.mjs --check <requestKeyDir> <workspace>

`<requestKeyDir>` — значение `ostrovApi.requestKeyDir`, `<workspace>` — рабочий каталог агента · `<requestKeyDir>` is the value
of `ostrovApi.requestKeyDir`, `<workspace>` is the agent's working directory.

На sadik (единственная установка) это `/opt/varvara/.ostrov-api-requests` и `/opt/varvara/workspace`, владелец обоих — `varvara`:
`node tools/ostrov-request-state.mjs --initialize /opt/varvara/.ostrov-api-requests /opt/varvara/workspace` от `varvara` ·
On sadik (the only installation) these are `/opt/varvara/.ostrov-api-requests` and `/opt/varvara/workspace`, both owned by `varvara`:
`node tools/ostrov-request-state.mjs --initialize /opt/varvara/.ostrov-api-requests /opt/varvara/workspace` as `varvara`.

Запускать helper из принятого пакета. Initialize отказывает, если существует хотя бы один маркер или каталог резервирования; --force нет. --dry-run, -n и неизвестные аргументы отказываются. --plan ничего не инициализирует. --check проверяет оба маркера и все присутствующие/legacy пары с форматом и SHA; историю сайта он не читает и не удостоверяет.
Run the helper from the accepted package. Initialize refuses if at least one marker or the reservation directory exists; there is no --force. --dry-run, -n and unknown arguments are refused. --plan initialises nothing. --check verifies both markers and all present/legacy pairs with format and SHA; it neither reads nor certifies the site history.

Коды выхода helper: 0 — успех, на stdout одна строка JSON `{"ok":true,"mode":…,"directory":…,"workspace":…,"legacyCount":N}` (у `--check` ещё `"keyCount":M`); 2 — любой отказ, включая неверные или незнакомые доводы и повторный initialize: на stdout ничего, причина — одной строкой на stderr. Других кодов нет; в автоматизации проверять код и поле `ok`.
Helper exit codes: 0 — success, one JSON line on stdout `{"ok":true,"mode":…,"directory":…,"workspace":…,"legacyCount":N}` (`--check` adds `"keyCount":M`); 2 — any refusal, including wrong or unknown arguments and a repeated initialize: nothing on stdout, the reason as one line on stderr. There are no other codes; automation should check the code and the `ok` field.

Initialize проверяет весь текущий legacy-набор, сохраняет SHA-резервирования, сверяет неизменность входного набора и публикует оба маркера. Частичная подготовка остаётся закрытой: не удалять маркеры и не запускать initialize повторно ради зелёного ответа. В остановленном окне выяснить причину и восстановить точные согласованные файлы. Новый мост не запускать до успешного --check.
Initialize verifies the whole current legacy set, saves the SHA reservations, checks that the input set did not change and publishes both markers. A partial preparation stays closed: do not delete markers and do not rerun initialize to get a green answer. In the stopped window find the cause and restore the exact consistent files. Do not start the new bridge before a successful --check.

Смонтировать принятый пакет целиком и проверить его версию из `package.json` в строке подъёма живого процесса. Сохранять epoch, оба маркера, ключи и резервирования в копии: резервная копия должна включать и workspace, и requestKeyDir — проверять фактическое содержимое копии, а не ссылку. Откат к старому коду снимает эту защиту: при неудачном монтаже записи остановить, state/маркеры/страховки сохранить.
Mount the accepted package as a whole and check its `package.json` version in the start-up line of the live process. Keep the epoch, both markers, keys and reservations in the backup: the backup must include both the workspace and requestKeyDir — check the actual backup content, not a link. Rolling back to the old code removes this protection: after a failed mount stop writes and keep the state/markers/safety copies.

## Границы · Limits

Защищены шесть названных write-операций, а не identity гостя и любые смысловые повторы. Другая сессия, изменённые params/actor/bot либо намеренно новый epoch образуют иной логический ключ. Уже утраченные ДО первого initialize случайные ключи локально не обнаружить. Утрата серверного журнала идемпотентности тоже вне защиты. Пустой каталог ключей не доказывает отсутствие прежних записей на сайте; полноту legacy-state нужно установить до initialize, --plan лишь показывает инвентарь своего момента.
The six named write operations are protected, not the guest identity or any semantic repeats. Another session, changed params/actor/bot or a deliberately new epoch form another logical key. Random keys already lost BEFORE the first initialize cannot be detected locally. Loss of the server idempotency journal is also outside the protection. An empty key directory does not prove there were no earlier writes on the site; legacy-state completeness must be established before initialize, --plan only shows the inventory at its moment.

Helper не выполняет автоматический ремонт, повтор API, рестарт службы или отправку сообщения оператору. Runtime-отказ останавливает текущую запись. Маркер ограничен 8 MiB, keyfile 64 KiB; bootstrap принимает максимум 100000 старых ключей. Пробы — синтетические SQLite/receipts и localhost. Боевой монтаж выполняет назначенная оператором рука.
The helper does no automatic repair, API retry, service restart or operator message. A runtime refusal stops the current write. The marker is limited to 8 MiB, a keyfile to 64 KiB; bootstrap accepts at most 100000 old keys. Probes use synthetic SQLite/receipts and localhost. Production mounting is done by an operator-assigned hand.
