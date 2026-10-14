# /cs внутри хода · In-turn /cs

B-N-2010: шлюз 3.1.3 и канал 3.1.4 поверх публичного адреса B-N-2009. Читатель — registered compact-status handler, alias /cs. Производители: Codex watcher event_msg/token_count; Claude SDK iterator с root assistant usage. Снимок показывает последний известный input внутри текущего хода и момент замера («снято ЧЧ:ММ:СС МСК»; timestamp хранится в UTC), а не накопленный расход и не завершённый baseline DSH. Codex использует timestamp события rollout; Claude — время получения assistant сообщения шлюзом.

The existing /cs handler reads the latest dated model-input observation from the live gateway. Codex uses its existing token-count watcher; Claude uses SDK root assistant usage. Neither producer publishes cumulative spend or a completed platform baseline.

## Один адрес · One address

Только B-N-2009 spoolConversation.version=1 / forAgent(actualAgent), тот же x-dsh-spool-conversation с base64url JSON {key,session_id,session_created}. Внутренний RAM-индекс сравнивает ровно эти три значения: порядок полей и пробелы JSON не создают другую беседу, новый запрос с той же тройкой заменяет прежний снимок. Query и echo сохраняют присланные wire-байты. В RAM Map и query нет SDK/cwd/первого текста/бюджетного ключа. Native request identity только сверяет те же поля адреса. SDK parent_tool_use_id и session_id используются для проверки источника события текущего запроса, не для адресации беседы.

The public address remains the one supplied by B-N-2009. The RAM index uses exactly its three values regardless of JSON field order or whitespace; requests and replies retain the supplied wire bytes. Native identity is a cross-check only. SDK parent/scope fields fence the source of a request's observation and never create a conversation key.

У адаптера с callable spoolConversationFor без адреса, с негодным или несогласованным адресом — «замер беседы не установлен». У адаптера без этого метода (1.1.17/1.1.19) канал сохраняет прежний вывод DSH/Codex, как до B-N-2010, для обоих поставщиков. Такой вывод не объявляется замером внутри хода; диагностический endpoint для него не читается. Безадресный запрос снимает все диагностические снимки этого шлюза, поскольку его нельзя безопасно приписать беседе. Новый адресованный запрос восстанавливает свой снимок. Model/resume mapping и запросы моделей от этого не меняются.

An unaddressed request conservatively retires diagnostic snapshots; it does not change SDK routing or model execution. A new addressed request restores its own snapshot. No neighbouring conversation supplies a fallback number.

## Claude: источник числа · Claude observation

Давление input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens; output не входит. Все три значения должны быть известными неотрицательными safe integers. Явный null, отсутствующее/негодное значение, неизвестный parent scope или synthetic assistant error дают blind, а не выдуманный ноль. SDKAssistantMessage.message имеет тип BetaMessage/BetaUsage с обязательными number|null cache fields; nullable тип не доказывает null=0.

Только parent_tool_use_id===null публикует давление родителя. Непустая строка означает сообщение вложенного агента и не заменяет снимок родителя. System compact_boundary гасит снимок только при SDK session_id текущего query; неизвестный источник гасит свежесть, другая известная SDK session не подставляется родителю. Эти проверки не являются вторым способом найти беседу.

SDK assistant messages могут представлять завершённый content block одного API response; usage ещё не final total. Здесь сохраняется последняя сообщённая входная часть этого root response; result aggregates по нескольким запросам не используются. Окно Claude из проверенной политики запроса, либо null; отсутствие окна не выдумывается. Процент выводится лишь при известном пороге политики.

Claude publishes the three known input buckets, excluding output, and only for a root assistant message. Child-agent usage and compaction cannot replace the parent's measurement. Unknown/malformed/error observations invalidate freshness. The observation is the latest reported input, not a final multi-request result aggregate.

## Чтение и свежесть · Reads and freshness

RAM-снимки принадлежат живому gateway process. Существующий Unix endpoint <bazaSessij>.context-status.sock остаётся mode0600, у UID службы. Для Claude без Codex D-полей канал берёт baseURL и ingressKeyFile из актуального зарегистрированного llm adapter. Поле D.adres и догадки по имени агента не используются. Adapter package не меняется. Наличие callable spoolConversationFor у актуального адаптера — обязательный признак адресной поддержки перед чтением снимка; после await сверяется также идентичность этого метода.

Дополнительный POST /context-status принимает только authenticated ingress request: admission до JSON, subscription credential и SDK. Reply положительно объявляет schema1/spoolConversation1/provider(openai|anthropic), PID/startTicks, generation и echo address; /health объявляет contextStatus:1 при наличии producer. Неавторизованный health не раскрывает новый private pathname или key. Клиент разрешает только local HTTP 127.0.0.1/[::1], без credential URL/query/hash/path/redirect; ключ читается через проверенный fd (regular, NOFOLLOW/NONBLOCK, UID, permissions, size, 64hex). Значения ключей не логируются.

The Unix transport remains private. Claude discovers the existing active adapter route and reads an authenticated local diagnostic endpoint. No settings or filesystem path guesses identify the gateway. The endpoint starts no SDK turn, model request or compaction and carries no transcript/credential data.

После всех awaits handler повторяет session/address/service/adapter object и route fields, перечитывает provider/model target и native completed compaction boundary. Изменение любого из них скрывает прежнее число. Последняя native проверка синхронна, перед форматированием. Compacted/SDK boundary/new request снимают свежесть; неполные/out-of-order native события дают unknown. При отсутствии compact end sequence равная миллисекунда неоднозначна: startedAt<=compact.time не допускает старого числа. Известный endSeq разделяет эпохи без гадания по времени.

A final synchronous fence checks native compaction after all asynchronous reads. Routing/model changes, incomplete evidence and ambiguous equal timestamps suppress stale observations. Before the first new sample after compaction the status says «после сжатия, замера ещё нет». Superseded/closed callbacks cannot restore an old request.

## Пределы и границы · Bounds

Адрес2048 ASCII bytes, frames4096bytes, model200bytes, Unix pathname107bytes. Reader750ms включая HTTP response body; server body/connection500ms. Unix connections до32; отдельный pool pending HTTP reads до32. Снимков128: вытесняются только inactive, при128active новый отказывает. Diagnostic endpoints не запускают автоматический compact, steer, retry, restart или модель.

Node/libuv удаляет initial bind pathname при close/exit. Unix producer слушает случайное имя через parent dirFD, публикует hardlink и снимает исходное имя; чужой advertised inode cleanup не удаляет. При startup failure закрываются собственные listener/FD и снимается только свой inode. Restart теряет только snapshots; diagnostic SQLite writes/schema changes отсутствуют. Если поддержка не поднялась при старте (например, сокет занят живым процессом или зонд не ответил за 250 мс), шлюз продолжает работать без неё; повторного подъёма до следующего рестарта нет. Это видно в журнале и /cs.

Не измеряет промежуточное изменение root контекста между SDK observations и не защищает от скомпрометированного процесса той же UID. Вне running показанный снимок является последним датированным observation завершённого запроса. Legacy gateway/new channel: прежняя оценка с «устарело», после compaction число скрыто. New gateway/old channel: прежний reader. У адресного адаптера нет доступного address — неизвестный замер, не чужая беседа. У старого адаптера нет spoolConversationFor — прежний вывод, в том числе между ходами; он не называется свежим снимком шлюза. Петрович напрямую DeepSeek не производит снимок подписочного шлюза.

Копийные SDK/HTTP/RPC/SQLite fixtures не являются живой подпиской, live journal /cs эпизодом или доказательством монтажа. Приёмка и монтаж — назначенной рукой. Context HTTP stand требует обе части пары gateway/channel; он проверяет реальный producer/reader на копиях.
