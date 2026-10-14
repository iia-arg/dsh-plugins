# Диагностика · Troubleshooting

Вначале проверить registry provider, Cordis scope, baseURL и process version. Не печатать ingress key или vendor credential. Gateway владеет SDK/токеном; adapter владеет route/block/descriptor boundaries.
First check provider registration, scope, baseURL and process version. Never print ingress/vendor credentials. SDK credentials belong to the gateway; route/block/descriptor boundaries belong to the adapter.

| Признак · Symptom | Проверка/действие · Check/action |
|---|---|
| Пакет без src / пустой plugin · Missing code | Не устанавливать bare registry placeholder; npm pack проверенного source + npm install архива, version/SHA/src/index.js · Use a verified local archive |
| Provider missing | Видимость llm/agents и вызов apply в нужной области; установка npm сама не монтирует · Check mounting scope |
| HTTP503 health / neutral label | Шлюз не готов; provider не подтверждён. Не выбирать ветку по model ID · Read readiness reason, do not infer the provider |
| Ошибка ingress file · Ingress failure | Absolute path, UID/mode, regular fd, размер/hex; отказ до POST · Check file metadata without value logging |
| Restore refused | newConversationRestore.version=1 и gateway conversationIdentity=2; пакет-поставщик в SERVICES · Repair agreed composition, no silent legacy downgrade |
| live-pressure-unavailable | Классифицированная первая причина в adapter log: session/scope/identity/config; gateway видит missing, fallback отдельно · Check the scoped services/process |
| live-pressure-code-drift | Изменились package.json/src без подъёма движка; restart в том же approved окне и живой proof после него · Restart with the code deployment, then verify loaded proof |
| live-pressure-stale/process-route | Возраст observedAt либо PID/startTicks/процесс DSH и его маршрут; это другой отказ, не missing services · Check exact source/process binding |
| REMOTE_HTTP_GATEWAY | Ingress/history/cwd/bridge передаются в cleartext; использовать loopback/HTTPS · Warning is not an allowlist; repair transport |
| GATEWAY_ERROR | Шлюз прислал error; cause сохранён, ordinary Error без скрытого повтора · Inspect SDK effects before retry |
| INCOMPLETE_STREAM | EOF без done; уже показанный текст не доказывает завершения · Preserve unknown outcome |
| CONTROL_EVENT_REJECTED | input-status/task-status без своего reader или отклонён своим scoped reader; поток остановлен, lease закрыт · Check exact session/turn binding, never select latest |
| Нет saved text · Missing final text | Проверить полный block-end и корректное завершение, не сумму дельт · Check the block contract |
| Terminated после 5 минут · Five-minute cutoff | Dispatcher fallback и версия Node; не отключать deadline · Read the silence-limit warning and run its stand |
| Overflow не сжимает · No compaction | LlmError category и настоящий platform normalizer; unknown side effects не повторять · Run the actual overflow stand |
| Missing test dependency | Названная СЛЕПОТА 2, STEND_APP с совместимой DSH/tool-fs; не считать нулём проверок · Read GUARDS and the exact prerequisite |

После исправления повторить конкретный отказ, нормальную пробу и возврат порчи. Живой model/Telegram отдельно принимает рука окна. Ни stderr, ни каталог моделей не доказывают доставку/исполнение SDK.
After repair run the failing/normal/restored cases. Live model/Telegram verification belongs to the deployment window. Logs or catalogs alone cannot certify SDK execution/delivery.

Mount metadata probe одна, 5000 мс, disposal signal; старая response/error не затирает новую v2 observation. Это не polling: legacy label освежается при новом mount. UTF-8/JSON диагностируются по строке/причине, без raw payload. Даже после части текста malformed record отказывает, reader отменяется и lease закрывается.
The single mount probe is bounded/cancellable and cannot overwrite a newer v2 observation. It is not periodic polling. Malformed records remain errors after partial text, without raw payload logging; reader and lease are cleaned up.
