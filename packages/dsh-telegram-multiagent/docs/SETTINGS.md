# Все настройки и пределы · Configuration and limits

Конфигурация состоит из загрузочного `config`, перечитываемого JSON `settingsFile`, переменных окружения и фиксированных констант кода. Эти уровни не взаимозаменяемы. В таблице «unset» означает отсутствие поля; путь примера не означает автоматически созданный каталог.

Configuration consists of loader `config`, reloadable `settingsFile` JSON, environment variables, and fixed code constants. These layers are not interchangeable. “Unset” means an absent field; an example path does not imply automatic directory creation.

## Загрузочный config и JSON · Loader config and JSON

| Ключ · Key | Тип · Type | Умолчание · Default | Значение RU / EN · Meaning | Пример · Example | Неверное значение RU / EN · Failure |
|---|---|---|---|---|---|
| `tokenFile` | `string` | `unset` | Файл читается и trim перед подключением / File is read and trimmed before connection | `/opt/<agent-home>/secrets/bot.token` | Нет чтения/пусто: канал не запускается / Unreadable/empty: channel does not start |
| `token` | `string` | `unset` | Запасной прямой токен; уступает tokenFile / Fallback inline token; tokenFile takes priority | `not shown` | Риск раскрытия через конфиг; токен неверен — HTTP-отказ / Configuration disclosure risk; invalid token causes API rejection |
| `tokenEnv` | `string` | `DSH_TELEGRAM_BOT_TOKEN` | Имя env с запасным токеном / Name of fallback token environment variable | `BOT_TOKEN_ENV` | Несуществующая env даёт отсутствие токена / Missing variable yields no token |
| `appDir` | `string` | `DSH_APP_DIR` | Установка DSH для createRequire / DSH installation used by createRequire | `/opt/<agent-home>/app` | Неверный путь: сервисы не разрешаются, канал не работает / Wrong directory: dependencies cannot resolve; channel unavailable |
| `workspace` | `string` | `process.cwd()` | Корень ledger и разрешённых файлов / Root for the ledger and allowed files | `/opt/<agent-home>/workspace` | Нет прав: потеря работоспособности; несовпадение cwd запрещает resume / Permissions fail; mismatched cwd prohibits resume |
| `agentName` | `string` | `telegram` | Имя в журнале и при обращении группы / Log label and default group addressing name | `Example assistant` | Не даёт полномочий; ложное имя путает атрибуцию / Does not grant authority; misleading name confuses attribution |
| `allowedUsers` | `number[]` | `[]` | Привилегированные Telegram-пользователи / Privileged Telegram user IDs | `[100000001]` | Неверный/неположительный ID отвергается; пустой закрытый список не пускает / Invalid/nonpositive IDs rejected; empty closed list admits nobody |
| `openBot` | `boolean` | `false` | Разрешает разговор всем, не расширяет привилегии / Allows everyone to converse without enlarging privileges | `false` | Неверный тип отвергается; true требует защиты гостевых инструментов / Invalid type rejected; true requires guest capability isolation |
| `preset` | `string` | `platform resolution` | Пресет монтируется при create/resume / Preset mounted during create/resume | `standard` | Неверный пресет: отказ или неполная сборка агента / Unknown preset: refusal or incomplete agent composition |
| `provider` | `string` | `agentDefaultModel selection` | Запасной поставщик при недоступном сервисе модели / Fallback provider when model service is unavailable | `configured-provider` | Неверный поставщик: запрос модели не выполняется / Unknown provider prevents model requests |
| `model` | `string` | `agentDefaultModel selection` | Запасная модель; выбор сервиса имеет приоритет / Fallback model; service selection takes precedence | `configured-model` | Нет в каталоге: model-unavailable / Missing catalog entry: model-unavailable |
| `mergeChatIntoA2A` | `number|string` | `unset` | Общий личный чат владельца и служебная сессия / Merge owner private chat into the service session | `100000001` | Неверный chat ID нарушает связывание сессий; ownerChatId задаётся отдельно / Owner-based functions use the separate ownerChatId setting |
| `a2aDir` | `string` | `unset` | Каталог с in/out для межмашинного обмена / Directory containing in/out exchange subdirectories | `/opt/<agent-home>/exchange` | Без пути маршрут отключён; нет прав — журнал отказа / Absent path disables route; access failures are logged |
| `a2aSession` | `string` | `a2a` | Ключ служебной сессии / Service-session route key | `a2a` | Смена после накопления меняет ожидаемую привязку; миграция отдельно / Changing populated routes changes bindings; migrate separately |
| `spoolDir` | `string` | `unset` | Входной ящик локальной шины ОС / Inbound local OS mail spool | `/var/spool/<mail-root>/<agent>` | Без пути pollSpool выключен; недоступность не означает пустоту / Missing path disables pollSpool; unreadable is not empty |
| `spoolStaleHours` | `number` | `12` | Возраст письма для пометки возможно устарело / Mail age threshold for a possibly stale annotation | `12` | Не срок удаления; отрицательное/NaN число даёт неверную классификацию / Not deletion retention; negative/NaN causes incorrect age classification |
| `a2aCoordinatorPrefixes` | `string[] (config/JSON)` | `[]` | Подсказка ожидаемых координаторских имён; подпись проверяется отдельно / Expected coordinator name hints; signature verification is separate | `["coordinator"]` | Имя не доказывает полномочия; список задаётся явно / Names do not authenticate; configure the list explicitly |
| `settingsFile` | `string` | `tokenFile .token → .json` | JSON доставки и групп, перечитывается по mtime / Delivery/group JSON reloaded when mtime changes | `/opt/<agent-home>/config/channel.json` | Сбой чтения: personal и newSessionsEnabled=false, журнал / Read failure: personal and newSessionsEnabled=false, with log |
| `goalUsers` | `number[]` | `[]` | Допуск команд цели в закрытом Telegram / Goal command authorization in closed Telegram | `[100000001]` | Пусто запрещает; в openBot применяются allowedUsers / Empty denies; openBot uses allowedUsers |
| `goalA2ASenders` | `string[]` | `[]` | Только счётчик в строке журнала `[goal] смонтирован`; на допуск не влияет: `/goal` служебного канала принимается только подписанным письмом / Only a counter in the `[goal] смонтирован` log line; does not affect admission: a service-channel `/goal` is accepted only from a signed letter | `[]` | Имя обычного файла не подпись; не назначать доверие именем / Plain filename is not a signature; do not infer trust from name |
| `guestPreset` | `string` | `site.preset` | Пресет гостя открытого Telegram-бота / Open-bot Telegram guest preset | `varvara-site` | Не задан и нет `site.preset` — гостю отказ, основной пресет не выдаётся / Unset without `site.preset` refuses guests |
| `transcribeCommand` | `string` | `unset` | Внешний исполнитель голосовой расшифровки / External voice transcription executable | `/usr/local/bin/transcribe-example` | Без него голосовые не расшифровываются; отказ/пустой вывод видимы / Absent command disables transcription; failures/empty output are visible |
| `transcribeTimeoutMs` | `number` | `300000` | Предел ожидания расшифровки голосового / Voice transcription wait limit | `300000` | Неположительное берёт умолчание; при отказе в журнале длительность звука и предел / Nonpositive uses default; failure log names audio duration and limit |
| `describeCommand` | `string` | `unset` | Внешний исполнитель описания изображений / External image-description executable | `/usr/local/bin/describe-example` | Пусто отключает; результат недоверенный и не поручение / Unset disables; result is untrusted data rather than instructions |
| `describeTimeoutMs` | `number` | `120000` | Предел ожидания описателя / Image-describer wait limit | `120000` | Неположительное берёт умолчание; таймаут даёт пояснение отказа / Nonpositive uses default; timeout returns failure explanation |
| `supervisor` | `string` | `unset` | Фиксированный локальный агент для pismo_rukovoditelyu / Fixed local recipient for pismo_rukovoditelyu | `coordinator` | Некорректное имя отвергается; права курьера обязательны / Invalid name rejected; courier permissions still required |
| `guestCopyRecipients` | `object[]` | `[]` | Дополнительные копии, JSON settings имеет приоритет / Additional copy targets; JSON settings override channel config | `[{"kind":"a2a","agent":"coordinator"}]` | Неверные цели/непривилегированный Telegram ID/больше8 отвергаются / Invalid targets/unprivileged Telegram ID/over8 rejected |
| `pdnMaskaSvertki` | `object` | нет | B-N-1680: маска ПДн свёрток для модели наблюдателя (`a2a-svertka`) — `{modul, reestr, belyjSpisok}`, абсолютные пути: модуль маски гостевого шлюза, реестр гостей, белый список владельца. Маскируются только телефоны и почта, имя и ник гостя остаются. Без неё свёртка наблюдателю НЕ доставляется (отказ, не сырой текст). `modul` — обычный файл root, не ссылка, без записи группе и прочим, иначе не загружается / PII mask for observer fold letters; without it fold delivery is refused. `modul` must be a regular root file, not a link, without group/other write, otherwise it is not loaded |
| `newSessionsEnabled` | `boolean` | `false` | Явный допуск /new; JSON приоритетнее config / Explicit /new admission; JSON overrides config | `false` | Без true смена поколения запрещена; capability сервиса тоже обязательна / Without true rotation is denied; platform capability also required |
| `site` | `object` | `unset` | Необязательный сайт через файловый адаптер / Optional website input through a file adapter | `see site fields` | Требует openBot, owner, отдельный preset и согласованный мост / Requires openBot, owner, dedicated preset, and compatible bridge |
| `site.preset` | `string` | `required when site enabled` | Узкий пресет сайта / Narrow website preset | `website-guest` | Без него явный отказ при старте site / Missing preset explicitly rejects website startup |
| `site.spoolDir` | `string` | `in code / в коде` | Корень vhod/kopii/vyhod / Root containing vhod/kopii/vyhod | `/var/spool/site-example` | Неверные права/структура дают отказ опроса / Wrong permissions/layout cause polling failure |
| `site.stateFile` | `string` | `in code / в коде` | Есть файл — сайт закрыт; общий с адаптером / Presence closes the site; shared with adapter | `/var/lib/site-example/closed` | Разные пути у соседей нарушают выключение; ошибка чтения не считается open / Mismatched paths break closure; read errors are not treated as open |
| `mailStopOwnerCopies (JSON)` | `boolean` | `true` | false: исходы стоп-почты и ответ на замену не копируются владельцу / false: stop outcomes and the answer to replace are not copied to the owner | `true` | Читается при создании квитанции стопа; подписанный статус не затрагивает; любое значение, кроме false, оставляет копии / Read when the stop receipt is created; never affects the signed status; any value but false keeps copies |
| `deliveryMode (JSON)` | `enum` | `personal` | personal: свои ответы; broadcast: обмен копиями; owner-all: чужое владельцу / personal: own replies; broadcast: mirrored traffic; owner-all: others copied to owner | `owner-all` | Неизвестное значение тихо нормализуется в personal; verify снаружи / Unknown value normalizes to personal; external verification required |
| `groups (JSON)` | `object` | `{}` | Настройки именованных рабочих групп / Per-group addressing configuration | `{"<chat-id>":{"mode":"mention","names":["Assistant"]}}` | Только group/supergroup; незаданная группа следует обычному маршруту / Only group/supergroup; unspecified group follows normal routing |
| `groups.<id>.mode` | `string` | `mention` | Режим прямого обращения / Direct-addressing mode | `mention` | Иное значение журналируется и становится mention / Other values logged and normalized to mention |
| `groups.<id>.names` | `string[]` | `agentName` | Имена отдельными словами Unicode / Names matched as complete Unicode words | `["Assistant"]` | Падежи явно перечислить; совпадение не определяет привилегии / List inflections explicitly; match does not grant privileges |
| `groups.<id>.replyCounts` | `boolean` | `true` | Ответ на сообщение бота считается обращением / Reply to bot counts as addressing | `true` | false требует другого прямого обращения / false requires another addressing signal |
| `groups.<id>.context` | `integer` | `20; max100` | Число последних сообщений контекста / Number of recent context messages | `20` | Неверное значение берёт20; память только в процессе / Invalid values use20; context is process-local |
| `groups.<id>.username` | `string|null` | `null` | Запасной ник бота для обращения / Fallback bot username for addressing | `example_bot` | Это не отдельный grant допуска / Not an authorization grant |

## Окружение · Environment

`DSH_APP_DIR` — запасной appDir; `DSH_TELEGRAM_BOT_TOKEN` или имя tokenEnv — запасной токен; `DSH_HOME` используется внешним курьером и путями вспомогательных сервисов. `KOMPAKT_AGENT` обозначает экземпляр для команды внешней операции компакта. Они не дают site-сессии новых полномочий. Тестовые `DSH_TEST_APP` и `SITE_ADAPTER_CANDIDATE` относятся к стендам, не к включению боевого сайта.

`DSH_APP_DIR` supplies fallback appDir; `DSH_TELEGRAM_BOT_TOKEN` or tokenEnv supplies a fallback token; external courier/helper services use `DSH_HOME`. `KOMPAKT_AGENT` identifies the instance for an external compaction operation. None grants additional website-session privileges. `DSH_TEST_APP` and `SITE_ADAPTER_CANDIDATE` belong to test harnesses, not production website activation.

## Фиксированные числа · Fixed numeric limits

| Предмет · Subject | Предел · Limit | Значение RU / EN · Meaning |
|---|---|---|
| Telegram JSON call | 15000ms, 3 attempts | Ограниченные повторы; bounded retries |
| Long poll | 25s +10s client allowance; 1 attempt | Следующий цикл вместо внутреннего повтора; next poll instead of internal retry |
| Text chunks | 4000 UTF-16 units | Разбиение без форматирования HTML; plain-text splitting |
| File upload | 60s; one attempt; response≤65536bytes | Не повторять unknown; do not replay unknown outcome |
| Incoming attachment | 20000000bytes; stored quota2000000000bytes; pending600000ms | Размер/квота — отказ; через10мин уведомление, данные сохраняются / Size/quota reject;10-minute wait sends a notice and preserves data |
| File document/photo | 50MB /10MB | Снимок без ссылок; immutable no-symlink snapshot |
| File caption | 1024Unicode code points | Проверяется исполнителем; validated by executor |
| Supervisor letter | 8000Unicode code points | Только text, адресат из config; text only, destination from config |
| Guest copy targets | ≤8 before dedup | Ограничение конфигурации; configuration bound |
| Automatic wakes | ≤3 per unchanged refusal signature | Устойчивая граница; durable budget |
| Service wait | 30s | После ожидания отказ/явная деградация; refusal/explicit degradation after deadline |
| Generation rotation | 60s | Prepared attempt expires; prepared-попытка истекает |
| Goals | 3 starts per rolling hour per channel | Счётчик процесса; process-local counter |
| Site polling | 1s;20files per directory per tick | Граница пачки; bounded batch |
| Site input | 2000Unicode code points; envelope≤65536bytes | Входный контракт; input contract |
| Site copied input | 2000UTF-16 units + marker | Полный raw остаётся в ledger; full raw remains in ledger |
| Copy failure alarm | after3attempts; one alarm intent | Не обещает доставку тревоги; alarm delivery not guaranteed |
| Site adapter copies | 5/conversation,30/global per600s | ВНЕ канала; внешний договор; external adapter contract |
| Ordinary body expiry | 30days;50receipts/pass | Затирание дублей текста; erase duplicate text fields |
| VACUUM after body expiry | backlog drained, at most hourly | Не на каждой порции; not on every batch |
| Site expiry | 30days; hourly trigger | Только завершённые и доставленные; finished and delivered only |

Числа следует менять отдельной поведенческой правкой, а не правкой документации. Не все пределы настраиваются через config; `site` не создаёт чужой таймер очистки файлов сессий или конфигурацию адаптера.

Change these constants through a separately verified behavioral change, not by editing documentation. Not every bound is configurable through config; `site` does not create external session-file cleanup timers or configure the adapter.

## Контракт файлового инструмента · File tool contract

`telegram_send_file` принимает только `path` (обязательная строка), `caption` (необязательная строка до1024Unicode code points) и `mode` (`document` по умолчанию или `photo`). `chat_id` и иной адресат не принимаются. Ответ содержит `message_id`, `chat_id`, `filename`, `bytes`, `mode`; он подтверждает ответ Bot API на один upload, не прочтение.

`telegram_send_file` accepts only required string `path`, optional string `caption` up to1024Unicode code points, and `mode` (`document` by default or `photo`). It accepts no `chat_id` or destination override. Its result contains `message_id`, `chat_id`, `filename`, `bytes`, and `mode`; this records a single upload's Bot API acknowledgement, not human reading.

Разрешённые расширения: `.txt`, `.md`, `.csv`, `.json`, `.pdf`, `.doc`, `.xls`, `.ppt`, `.docx`, `.xlsx`, `.pptx`, `.odt`, `.ods`, `.odp`, `.png`, `.jpg`, `.jpeg`, `.webp`. `photo` принимает только PNG/JPEG. Формат проверяется по сигнатуре/целому UTF-8; текст с NUL отвергается. Файл должен иметь одну ссылку и оставаться неизменным во время чтения. Файловые передачи не имеют durable-очереди восстановления после restart; unknown требует ручной сверки.

Allowed extensions are `.txt`, `.md`, `.csv`, `.json`, `.pdf`, `.doc`, `.xls`, `.ppt`, `.docx`, `.xlsx`, `.pptx`, `.odt`, `.ods`, `.odp`, `.png`, `.jpg`, `.jpeg`, and `.webp`. Photo mode accepts only PNG/JPEG. Validation checks format signatures or complete UTF-8; NUL-containing text is rejected. The file must have one link and remain unchanged during reading. File uploads have no durable restart-recovery queue; unknown outcomes require manual reconciliation.

## Адресаты копий и подпись координатора · Copy targets and coordinator signatures

Каждый `guestCopyRecipients` элемент — один из трёх видов: `{kind:"telegram", id:<positive-number>}`, `{kind:"a2a", agent:<local-agent-name>}` (письмо на каждую реплику) или `{kind:"a2a-svertka", agent:<local-agent-name>}` (наблюдатель «к сведению»). Telegram ID должен входить в allowedUsers; имя A2A соответствует `[a-z][a-z0-9_-]{0,63}`. Лишние ключи и другие виды отвергаются; адресатов не больше 8. Основной owner target режима owner-all добавляется из ownerChatId отдельно; пустое значение выключает эту цель, совпадения затем устраняются.

Свёртка `a2a-svertka`: реплики разговора копятся и уходят наблюдателю одним письмом через `a2a-send`, когда разговор затих на 15 мин, набрал 20 реплик, длится 60 мин или накопил 40 000 знаков (`SVERTKA` в `src/guest-channel.js`, не настройка); каждая реплика в письме урезается до 8 000 знаков. Перед доставкой текст проходит маску контактов `pdnMaskaSvertki`; маска не задана или не загрузилась — свёртка не доставляется. Наблюдатель отвечает ровно «к сведению»; ответ, начатый «🔴 ТРЕВОГА», — тревога: владельцу и адресатам из `adresatyTrevogFile`.

Each guestCopyRecipients item is one of three kinds: `{kind:"telegram", id:<positive-number>}`, `{kind:"a2a", agent:<local-agent-name>}` (a letter per message) or `{kind:"a2a-svertka", agent:<local-agent-name>}` (an observer "for information"). Telegram IDs must be privileged allowedUsers entries; A2A names match `[a-z][a-z0-9_-]{0,63}`. Extra keys and other kinds are rejected; at most 8 recipients. Owner-all adds its primary ownerChatId target separately before duplicate targets are removed; an empty value disables that target.

Fold `a2a-svertka`: a conversation's messages accumulate and go to the observer as one letter via `a2a-send` once the conversation has been quiet for 15 min, reached 20 messages, lasted 60 min or accumulated 40 000 characters (`SVERTKA` in `src/guest-channel.js`, not a setting); each message in the letter is cut to 8 000 characters. Before delivery the text passes the contact mask `pdnMaskaSvertki`; with no mask or a mask that failed to load the fold is not delivered. The observer replies exactly «к сведению»; a reply starting with «🔴 ТРЕВОГА» is an alarm: to the owner and to the recipients from `adresatyTrevogFile`.

Trust policy — отдельный JSON по явному coordinatorTrustFile из config/JSON settingsFile. Умолчание пустое: подпись без настроенного файла не считается доверенной. Требуется обычный файл без symlink, root-owned и без group/world write. Он содержит публичные ключи; приватный signing key в нём не хранится.

Trust policy is separate JSON selected by explicit coordinatorTrustFile in config/settingsFile JSON. Its default is empty: signatures without a configured store are not trusted. The store must be a root-owned regular non-symlink file without group/world write permissions. It holds public keys, not private signing material.

| Поле · Field | Тип · Type | Требование RU / EN · Requirement |
|---|---|---|
| version | integer | Ровно1 / exactly1 |
| status | string | Ровноapproved / exactly approved |
| maxLifetimeMs | integer | Положительный согласованный срок / positive approved lifetime |
| clockSkewMs | integer | Неотрицательная допустимая погрешность / nonnegative clock tolerance |
| keys | object | key_id→Ed25519public PEM / key_id→Ed25519public PEM |

```json
{"version":1,"status":"approved","maxLifetimeMs":300000,"clockSkewMs":5000,"keys":{"example-key":"<Ed25519 PUBLIC KEY PEM>"}}
```

Числа примера иллюстрируют формат, не рекомендуют политику доверия. Отсутствие поля/неверный тип/неизвестный ключ/срок/подпись/повтор delivery_id не дают доверия. Подпись производится `node src/sign-coordinator.mjs REQUEST_JSON`; request имеет только строки action, delivery_id, input, key_file, key_id, ledger_uuid, output, policy_file, recipient. Input/output/key/policy — файловые пути. Секрет не должен находиться в командной строке; передаётся путь key_file. Начало и конец срока выставляет подписывающий по approved policy.

The example numbers illustrate syntax rather than prescribe trust policy. Missing fields, invalid types, unknown keys, bad lifetime/signature, or reused delivery IDs never grant trust. `node src/sign-coordinator.mjs REQUEST_JSON` signs a request containing only string fields action, delivery_id, input, key_file, key_id, ledger_uuid, output, policy_file, and recipient. Input/output/key/policy are file paths. Private key material must not appear in process arguments; only its key_file path is supplied. The signer derives issued/expiry times from the approved policy.

Дополнительные фиксированные сроки: RETRY_SECONDS=`[0,5,30,120,600]` для outbox; HOLD_ALERT_MS=`[0,3600000,86400000]` — уведомления сразу, через час и сутки; ENVELOPE_HOLD_MS=24часа. Удержанный ввод не удаляется и не исполняется только потому, что прошёл срок; конечный отказ и учёт сохраняются. Обычный body expiry требует finished_at/body_at и соответствующих доставок старше срока; site-полная очистка считает30суток от received_at и дополнительно требует finished_at и отсутствие pending исходящих.

Additional fixed bounds: outbox RETRY_SECONDS=`[0,5,30,120,600]`; HOLD_ALERT_MS=`[0,3600000,86400000]` reports immediately, after one hour, and after one day; ENVELOPE_HOLD_MS is24hours. Held input is neither deleted nor executed merely because time elapsed; terminal refusal and accounting are retained. Ordinary body expiry requires old finished_at/body_at and eligible delivery timestamps; full site purge counts30days from received_at and also requires completion and no pending outgoing items.

Пути в документации — нейтральные примеры. При переносе установки явно задавай прежние значения полей размещения; пустое coordinatorTrustFile выключает доверие к подписи, а не указывает на машинный файл.

Documentation paths are neutral examples. When migrating, explicitly configure the previous deployment values; empty coordinatorTrustFile disables signature trust rather than selecting a machine-specific file.


## Явный владелец и ограниченная загрузка · Explicit owner and bounded download

ownerChatId задаётся числом или цифровой строкой в config плагина либо JSON settingsFile; JSON имеет приоритет даже при null/пустой строке. Умолчание пустое. Владелец должен быть положительным безопасным целым и входить в allowedUsers. Некорректное/пустое значение или ошибка чтения JSON выключает owner-зависимые команды, копии и сайт с явной строкой в журнале. mergeChatIntoA2A связывает сессии; он больше не заменяет ownerChatId и не определяет адресата копий.

Set ownerChatId as a number or digit string in plugin config or settingsFile JSON; JSON takes precedence even when null or empty. The default is empty. The owner must be a positive safe integer in allowedUsers. Invalid/empty values or JSON read failures disable owner commands, copies, and the website with an explicit log. mergeChatIntoA2A links sessions; it neither substitutes for ownerChatId nor selects copy recipients.

В этом условном примере config.allowedUsers содержит 123.

In this synthetic example, config.allowedUsers includes 123.

```json
{"deliveryMode":"owner-all","ownerChatId":123}
```

После запуска с пустым владельцем добавление ownerChatId требует перезапуска для включения site transport. Установка null/пустой строки у уже включённого сайта закрывает приём и запрещает отложенные site-копии, даже если старый адресат остался в guestCopyRecipients. Уже живые site-ходы останавливаются внутренним callback с последним подтверждённым владельцем как актором отмены; этот кеш не используется для отправок или нового допуска. Возврат настройки снова разрешает действия на уже созданном transport.

After starting without an owner, adding ownerChatId requires a restart to enable website transport. Setting null or an empty string on an enabled website closes admission and denies pending site copies, even if an old recipient remains in guestCopyRecipients. Existing site turns are stopped by an internal callback using the last validated owner as the cancellation actor; that cache is never used for sending or fresh authorization. Restoring configuration permits actions on an already created transport again.

| Ключ · Key | Где · Location | Умолчание · Default | Граница · Boundary |
|---|---|---|---|
| ownerChatId | config или JSON settingsFile / config or settingsFile JSON | пусто / empty | Только явный привилегированный личный ID; ошибка не выбирает другого / Explicit privileged private ID only; errors never choose another recipient |
| a2aCoordinatorPrefixes | config или JSON settingsFile / config or settingsFile JSON | [] | Подсказки имён, не полномочия / Display hints, not authority |
| telegramFileTimeoutMs | config | 30000 ms | Общий дедлайн metadata/headers/body; положительное безопасное целое / Overall metadata, headers, and body deadline; positive safe integer |
| telegramFileMaxBytes | config | 20971520 bytes (20 MiB) | Фактически прочитанные байты, включая ответ без Content-Length; положительное безопасное целое / Actual bytes including responses without Content-Length; positive safe integer |

Голосовая загрузка делает одну попытку getFile и чтения файла, останавливается по первому пределу и удаляет частичный временный файл. Созданный файл имеет режим 0600 и уникальное имя. Эти настройки не ограничивают transcriber или другие Bot API вызовы; для общего тракта вложений действует отдельный AttachmentStore. Неизвестная сетевая ошибка не раскрывает URL с токеном.

Voice downloads make one getFile and file-read attempt, stop at the first bound, and delete partial temporary files. Completed files have mode 0600 and unique names. These settings do not limit the transcriber or other Bot API calls; the general attachment path has separate AttachmentStore limits. Unclassified network errors do not expose token-bearing URLs.

Физическое удаление ключа из JSON разрешает явное config.ownerChatId как запасной источник; для принудительного выключения используй null или пустую строку.

Physically removing the JSON key permits an explicit config.ownerChatId fallback; use null or an empty string to force disabling.

JSON a2aCoordinatorPrefixes имеет приоритет над config при монтаже. Это массив непустых строк; неверный тип даёт отказ. Изменение списка после старта требует перезапуска; проверка подписи остаётся независимой.

JSON a2aCoordinatorPrefixes precedes config at mount. It must be an array of nonempty strings; invalid types are rejected. Changing the list after startup requires a restart; signature verification remains independent.


## Переносимые настройки размещения · Portable deployment settings

Все настройки ниже читаются из JSON settingsFile перед config при apply. Это снимок монтажа: после их изменения нужен restart/remount. Старое имя/корень в существующей установке переносит оператор; в новом коде их умолчание не зашито. Неверный тип и пустые или относительные обязательные корни вызывают отказ до файловых действий.

The following settings are read from settingsFile JSON before config during apply. They are a mount snapshot: changes require a restart/remount. Operators carry forward previous names/roots in existing installations; the new code does not embed them as defaults. Invalid types and invalid required roots are rejected before file actions.

| Ключ · Key | Тип · Type | Нейтральное умолчание · Neutral default | Смысл / Meaning |
|---|---|---|---|
| coordinatorTrustFile | absolute path or empty string | empty | Публичный root-owned trust-store; пусто даёт trust_unavailable / Public root-owned trust store; empty yields trust_unavailable |
| pauseStateRoot | nonempty absolute path | workspace/.pause-state | Корень внешних файлов паузы, далее agent/pauza.json / Root of external pause files, followed by agent/pauza.json |
| compactSettingsRoot | absolute path or empty string | empty | Корень настроек журнала Codex; пусто явно выключает эту часть статуса / Codex journal-settings root; empty explicitly disables that portion of status |
| receiptReviewer | bounded single-line string | координатор / coordinator | Имя назначенного читателя hold/failed notices; также сохраняется в ledger для readonly admin / Assigned hold/failed-notice reader, also stored for readonly admin |
| remoteReturnRecipients | object of agent-name→courier-recipient | {} | Явная таблица обычных remote возвратов; неизвестное остаётся HOLD / Explicit ordinary remote returns; unknown routes remain held |
| coordinatorReturnRecipient | empty or valid recipient name | empty | Отдельный возврат для подтверждённой подписи, не берётся из текста письма / Separate verified-signature return, never inferred from message text |
| remoteCourierEnvKey | environment key name | A2A_TELL_DIR | Как courier получает каталог tell; ключ зеркала A2A_ZERKALO запрещён / How the courier receives the tell directory; the mirror key A2A_ZERKALO is reserved |
| sharedSenderName | empty or account/agent name | shared-user | Общая Unix-учётка не выдаётся за единственного обратного адресата / A shared Unix account is not treated as a unique return address |
| siteSpoolDir | nonempty absolute path | site.spoolDir or workspace/.site-spool | Входы и выходы сайта; flat JSON имеет приоритет / Website spool; flat JSON takes precedence |
| siteStateFile | nonempty absolute path | site.stateFile or workspace/.site-state/closed | Общий выключатель сайта; flat JSON имеет приоритет / Shared website switch; flat JSON takes precedence |

Нейтральный trust/remote default не ослабляет проверку: подписанное без настроенного trust-store отвергается, неизвестный возврат удерживается. Courier вызывает фиксированный executable, тело через stdin; typed intent и запрет повтора unknown не изменены. Встроенный admin status берёт имя читателя из ledger, а открытие без явной новой метки сохраняет прежнюю.

Neutral trust/remote defaults do not weaken checks: signed input without a configured trust store is rejected, and unknown returns are held. The courier uses a fixed executable and stdin bodies; typed intent and the refusal to retry unknown outcomes are unchanged. Built-in admin status reads the reviewer label from the ledger, and opening without an explicit new label preserves the stored one.
