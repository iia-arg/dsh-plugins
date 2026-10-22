# AP producer R — raw runtime facts, кандидат

## Claude end-счётчик для компонента AP 0.1.16

`index.js` передаёт живые `session/event` в `ClaudeTurnUsage` до ранних
AP/managed-return. Читатель нового файла — сборщик Гаммы; этот компонент
сборщик, панель и прежний R-поток не переключает. Пишется
`<workspace>/.message-receipts/ap-usage-hodov-v1.jsonl`, owner UID, mode0600.
Одна end-строка: schemaVersion1, kind=turn_end, participant, engine=claude,
ts (время native end, ISO UTC), sessionId/sessionCreated/turn, status,
input/cached/cache_write/output/vyzovov, polnota=parent_only. RUN, start,
prompt и текст ответа не пишутся. Ключ — participant/sessionId/sessionCreated/turn.

Берутся только assistant/message с source.provider=claude-oauth и usage:
input = inputTokens + cacheReadTokens + cacheWriteTokens; cached/cache_write
уже входят в input. Output — outputTokens без повторного reasoningTokens.
Vyzovov — число usage-сообщений. Native child-сеансы с собственными usage
дают отдельные строки; parent_only не доказывает скрытых детей внутри SDK.
Пропущенные usage/обрыв без end не восстанавливаются из истории. Aborted/error
end или негодные числа не дают строки; это допустимая недосчётка, не measured0.

Повторные монтажи одного root/participant делят один writer со счётчиком
владельцев и дедупликацией seq. Последний close очищает pending без дописывания
незавершённых ходов. Не более64 pending-ходов; при переполнении старейший
отбрасывается с CLAUDE_TURN_USAGE_PENDING_LIMIT. Полка ротируется перед
превышением8MiB, сохраняется один `.1`; старый хвост после смены inode может
быть потерян читателем, полноту этот писатель не обещает. Частичный последний
JSON отделяется LF перед следующим end, без восстановления потерянной строки.
Ошибка sink даёт CLAUDE_TURN_USAGE_WRITE_FAILED и теряет эту end-строку;
следующий ход пробует запись заново. Она не повторяет работу модели и не
прерывает доставку. Ссылки/чужой owner/mode не исправляются автоматически.

Мандат Забавы17.10.2026 12:29:02Z, DESIGN-R3. Основа общего исходника2cca63ac637279fbaea82a27e76dc62df484b465 (TG3.1.12), новый TG-кандидат3.1.13. Нет монтажа, сервисов, внешних моделей или сетевой AP-проверки перед ходом.

## Пишущий и читатель

Если задан штатный autopilotMail, index.js подключает UsageRuntime к существующему CodexTaskControl. Передаваемый adapter-ом taskControl получает request_id и без terminal telemetry; операции/права stop не расширяются. Отдельного usageContextFor/pre-start ACK нет. Без AP-конфигурации наблюдатель не создаётся. У AP-учётки и обычный запрос записывает только runtime identity: наличие записи не делает его AP-job; неизвестная атрибуция остаётся UNBOUND.

Зовущий request-фиксации — реальный CodexTaskControl.attach(agent,...), а не argv/ответ модели. Turn/created/request generation берутся из runtime; native turn/start/end/time и receiptFacts claim читаются из текущей сессии; links — точный dsh_id из receipts и logical_key ap-notice:<deliveryID>. ID-only notice не удостоверяет отправителя. Поля raw/text/контент/ticket не пишутся. Каждый SDK request отдельный, даже если DSHturn один. registeredAt=локальное время attach, НЕ начало DSH-хода или SDK; engine start/terminal/подписку обязан дать G.

Локальный файл <receipts.root>/usage-runtime-v1.jsonl, owner UID службы,0600/single-link; root ledger0700 без ссылок. Envelope schemaVersion1,generation(эпоха R),seq,uid,recipient.
- runtime_request: requestId,requestGeneration(ledger),registeredAt,sessionId,sessionCreated,turn,turnStartedAt,finishedAt=null,turnOutcome=null,claimedAt,deliveryIds,claims[]. ClaimedAt=null при отсутствии реального claim; turnStartedAt отдельное фактическое время.
- runtime_turn: тот же native tuple/границы/claims, без requestId. FinishedAt берётся из КОНКРЕТНОГО turn/end после успешного штатного sessions.flush. Следующий turn во время await не подменяет его.
- watermark: at (миллисекунды UTC). Интервал15с, unref; на время native observation watermarks пропускаются, пока flush не завершён. Это processed R cut, не G/nativegraph полнота.
- source_gap: reason,at; после первого gap R прекращает нормальные записи до перезапуска. Queue1023normal+1gap максимум1024; пределы recordMaxBytes/fileMaxBytes читаются из общей policy; oversized record пропускается с `[usage] R_RECORD_TOO_LARGE skipped=N` в журнале процесса, не в R, достигнутый предел файла запускает атомарную обрезку. Нет бесконечного retry: policy снова проверяется только при очередной записи; прочие ошибки не сбрасываются автоматически. Асинхронные append+fsync; model-call не ждёт их результата.

Reader — AP-сборка Гаммы; по решению владельца 18.10.2026 17:38 МСК она хранит inode/offset и читает приращение без полного строгого перечитывания R. Смена inode начинает чтение с 0; в каждой квитанции соответствующей накопленной суммы остаётся одна пометка возможной потери строк при обрезке. Сам writer эту квитанцию не формирует. Raw runtime_request не становится AP-job от самого присутствия в файле: связь с SDK/native/Postman и данные расхода G — отдельный предмет читателя. Установка: reader и сторож первыми, writer последним. Старый strict reader может отказать на seq>1 после обрезки; не включать новый writer раньше нового reader.

## Общая policy и обрезка

Единственный штатный путь: `/etc/dsh-telegram-multiagent/usage-runtime-policy.json`. Кандидат принятой Забавой 18.10 15:01:17 UTC формы — `docs/usage-runtime-policy.json`: schemaVersion=1, fileMaxBytes=33554432 (32 МиБ), recordMaxBytes=65536 (64 КиБ). Три поля обязательны; лишние/повторные поля, неверные типы, recordMaxBytes>fileMaxBytes, ссылка, небезопасные права/владелец или отсутствие файла → R_POLICY_INVALID. Файл root-owned, обычный, single-link, без записи группы/прочих, до 16 КиБ. Runtime не подставляет запасной cap. Policy читается при создании UsageRuntime, перед каждой queued записью и ещё раз непосредственно перед reset. Отсутствующая/нечитаемая policy прекращает R до записи и обрезки, логирует R_POLICY_INVALID; старые значения не используются как fallback. Изменения policy монтируются согласованным окном. R_POLICY_INVALID приостанавливает запись; следующая queued-операция снова проверяет policy, и после исправления пишет без нового writer. Это действует и при отсутствии policy на старте. Пропущенные факты не повторяются; сам writer службу не перезапускает. Внутренний параметр конструктора policyPath нужен для кандидата/изолированных fixture; штатный index.js его не переопределяет. Поддержка иного общего пути через профиль не добавляется.

LOW-граница: удаление policy после последней успешной проверки уже начатой записи не отменяет эту операцию; она может завершиться. Следующая queued-запись обнаружит отсутствие policy и остановится с R_POLICY_INVALID. Если текущей операции нужна обрезка, её отдельная проверка policy перед reset ещё может отказать. Дополнительной проверки перед LF/write нет.

Запись больше recordMaxBytes пропускается, не залипает и не вызывает обрезку. Счётчик пропущенных записей текущего writer печатается только в журнал процесса: `[usage] R_RECORD_TOO_LARGE skipped=N`; в heartbeat и схему R поле не добавляется. Лимит проверяется после чтения policy в очереди; при смене лимита перед reset — ещё до замены файла. Следующая нормальная запись проходит. Номер seq пропущенной записи не переиспользуется; информационный reader не требует непрерывности seq.

Перед записью, превышающей cap, одна операция существующей tail-очереди создаёт ПУСТОЙ O_EXCL temp 0600 в ledger root, fsync temp, rename поверх текущего файла, fsync каталога; затем append текущего факта + fsync. При уже достигнутом cap действует то же правило. Новый inode, прежний не архивируется; открытый ранее FD может временно удерживать безымянный старый inode до close. Формат schemaVersion1 сохраняется, R generation/seq внутри процесса продолжаются; новый reset-record не вводится. Нужен один writer на ledger root, Promise-очередь не является межпроцессным lock.

Оборванный хвост при первом append после запуска проверяется чтением одного последнего байта. Если нет LF и добавление разделителя+нового факта помещается в cap, writer сначала пишет один LF+fsync: предыдущие строки сохраняются, оборванный JSON закрывается как отдельная негодная строка. Если хвост был целым JSON без LF, он станет обычной валидной строкой. Читатель должен пропустить негодную строку с +1 к своему счётчику, а не склеивать её со следующей. Если всё вместе превышает cap, штатная обрезка удалит файл вместе с хвостом. Исправный файл ниже cap при рестарте сохраняется; R generation меняется как прежде. Рекомендация Вениамина про LF принята, дополнительного дропа при каждом запуске нет.

Ошибки reset → R_RESET_FAILED, ошибка append/сохранения → SOURCE_GAP; эти причины залипают в текущем объекте. R_RESET_FAILED может возникнуть после rename до подтверждения fsync каталога; безопасное автоматическое подтверждение такой замены не реализуется. После [usage] R_RESET_FAILED — рестарт службы при пустом ходе. Нормальные queued факты и wm после неё подавляются. Нет retry-loop, рестарта служб или backoff. Source_gap по возможности записывается в тот же текущий файл без повторной попытки обрезки; на сломанном/переполненном sink может не записаться даже он — лог/ошибка обязательны, наличие здорового TG не доказывает здоровый R. Обрыв до rename оставляет прежний файл, после rename — новый пустой/частично наполненный. После SIGKILL могут остаться пустые `.usage-runtime-reset-<uuid>.tmp`; это не архив и не источник для reader, автоматического восстановления/поднятия temp нет. Power loss не доказан SIGKILL-пробой.

Лимит относится только к одному R, не к ledger/native/G/диску в целом; не гарантирует срок хранения в днях. Числа wall 30/35 и бюджет reader writer не меняет. Компрометация root/same UID и два одновременных writer вне обещанного контура.

## Повторные факты и ключи читателя

Да, повтор R-факта возможен: request()/observe() не имеют дедупа, repeated observe повторяет тот же native turn с другими seq; новый объект может повторно наблюдать turn уже с другой generation. Сам append не имеет цикла повтора, но ошибка fsync не означает отсутствия уже записанных байтов. Количество строк R не равно числу единиц токенов: в R чисел расхода нет.

- runtime_request: `(uid, recipient, requestGeneration, requestId)`. requestId — UUID конкретного SDK attach, не jobId.
- runtime_turn: `(uid, recipient, sessionId, sessionCreated, turn)`. Обновлять снимок хода по этому ключу: незавершённый и завершённый — состояния одного хода, не два расхода. Не отбрасывать terminal update как обычный дубль.
- watermark/source_gap — служебные факты, не расход. R generation+seq различают строки, но не повтор того же native факта между процессами.
- Числа G/native usage сводятся по responseId/messageId внутри thread/UID; связь с requestId не заменяется суммированием raw R.

Доказательство по основе TG 3.1.13: `src/codex-task-control.js:30–35` создаёт/сохраняет request_id, `src/usage-runtime.js` request()/observe() каждый раз зовут emit без фильтра повторов. Characterisation в stend-usage-runtime.mjs воспроизводит два request-факта с одним SDK-ключом и три turn-факта с одним native-ключом, в том числе после смены R generation.

## Пробы

stend-usage-runtime.mjs:18 конкретных случаев, включая asynchronous flush race/отказ/потерю end/claim-null/queue/symlink/privacy. stend-usage-runtime-native.mjs:настоящий DSH Agent/inbox/flush, ни модели. stend-usage-runtime-recovery.mjs:skip/counter, уменьшение/увеличение cap, возврат policy без рестарта, LOW in-flight, отказ native во время policy gap и три reset-барьера. stend-usage-runtime-reset.mjs:cap/inode, сохранение исправного файла, хвост, policy и четыре SIGKILL-барьера. Все policy fixtures root-owned под свежим /tmp: helper использует sudo -n только для создания своих файлов, без установки /etc. Для native задать DSH_TEST_APP=<каталог платформы> и node_modules от этого каталога в корне изолированной копии; без доступной платформы — слепота, не PASS. Порча native claimedAt→observer clock даёт FAIL, возврат PASS; SHA и grep-cF1 в отдельной evidence. Соседние stop SDK HTTP/reader/native input и task-control проверяются на подставных транспортах, не в бою. Общий vse-stendy автоматически подбирает оба stend-*; полный набор автор не объявляет пройденным.

## Залипающий source_gap и информационный читатель

Ошибки R_RESET_FAILED, SOURCE_GAP, native/claim и безопасности источника
залипают в текущем writer: новые нормальные записи и watermark подавляются.
R_POLICY_INVALID — исключение: при возврате исправной policy следующая queued
операция, включая heartbeat, восстанавливает запись без рестарта. Ошибка native,
возникшая во время отказа policy, остаётся залипающим отказом после её исправления.
Это отказ писателя; native boundary/claim и проверки безопасного файла остаются
обязательными. Сам source_gap при отказе sink может не попасть в файл.

По решению владельца 18.10.2026 17:38 МСК читатель R хранит inode/offset,
читает только приращение и сохраняет уже наблюдённые факты. R служит
информационным источником: gap не требует обнулить накопленную сумму или
объявлять все следующие прогоны incomplete/null. Диагностика потерь не
доказывает полноту истории. Конкретный вывод gap и его времени принадлежит
читателю; raw-R writer панель и командную квитанцию не формирует.

Новый экземпляр writer начинает новую generation и вновь проверяет источник
и policy. Он не восстанавливает пропущенные строки. При обрезке меняется inode,
reader начинает с offset 0 и сохраняет в квитанции соответствующей накопленной
суммы одну пометку возможной потери строк при обрезке. Это не отменяет отдельные
проверки G, native usage и привязки к заданиям. Рестарт TG выполняется только
в назначенном окне; R сам службу не перезапускает.

Повторные живые callbacks для уже завершённого хода не дописывают строку:
писатель хранит в WeakMap последний end-номер на native Session и владельца
(каталог, участник). Номера ходов DSH растут; запись отметки предшествует append.
Отметка переживает повторный mount TG, пока жив объект Session; после освобождения
Session память может быть собрана. История после загрузки/перезапуска DSH не
публикуется как session/event и не перечитывается писателем. Это защита живого
пути callbacks, не импорт произвольной истории другим объектом Session. Ошибка
записи может недосчитать ход; повторять неоднозначный append нельзя, иначе возможен
двойной счёт. Формат и арифметика строки от этой защиты не меняются.

Participant рабочего писателя берётся из os.userInfo().username — Unix-учётки
процесса, не из отображаемого config.agentName. Второй аргумент acquire сохранён
для совместимости вызовов; в учётную строку он не попадает. Если имя учётки
недоступно или не проходит прежний ASCII-regex, строки нет, а
CLAUDE_TURN_USAGE_PARTICIPANT_INVALID печатается один раз на процесс.
