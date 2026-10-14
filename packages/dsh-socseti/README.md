# dsh-socseti — MCP-черновики и публикация в Telegram/ВК после одобрения человеком

Версия · Version: 3.1.8

Версия пакета, строка старта main и MCP initialize берутся из `package.json`; история — в `CHANGELOG.md`. [English README](README.en.md).

B-N-1481: MCP-черновики и одобряемая людьми публикация в тестовый Telegram.
Node >=24; npm ci --ignore-scripts; npm test. node_modules в пакете нет (`.gitignore`):
зависимости ставит `npm ci --ignore-scripts` по `package-lock.json` на копии сборки, затем подготовленный runtime монтирует назначенная рука. На бою npm не запускают. [Порядок установки](INSTALL.md).

Пакет живёт в двух независимых установках: `/opt/socseti` (профиль Варвары без поля profile) и `/opt/socseti-anna` (`profile:"anna"`). Базы, ключи и конфигурация разделены. Анна принимает события ВК, Telegram приходит через отдельный владеющий poller канал; включаемые отдельно писатели ВК требуют точного человеческого одобрения. Приём Instagram/Threads включается отдельно через meta; писателей этих сетей нет. См. META-ANNA.md. У Анны выключенный писатель — отсутствие `vk.writer`, а `enabled:false` в этом разделе отвергается.

Роли: агент создаёт черновик; человек принимает решение в карточке; назначенная рука устанавливает и сверяет службу; monitor читает статус. П7 — передача изменения на независимую приёмку, а не API службы. Имена и B-N-номера ниже — история договоров машины. [Справочник](REFERENCE.md), [состав](PAKET.md).

Для npm ci нужна исходная копия с package-lock.json: Git или полный source.tar.gz из передачи. npm pack исключает lockfile; дополнительный npm tarball не заменяет этот источник.

## Профиль Варвары и общий договор карточки
Штатный запуск — приложенный systemd unit, с flock на daemon.lock:
один daemon/поллер на БД. Прямой параллельный запуск main.mjs не разрешён.

Ключ varvara открывает draft_post, revise_draft, draft_reply. Ключ monitor —
только status. Внешнего approve/publish/import/list нет. Ключи различны,
32 случайных байта в hex, не в argv. Конфигурация/ключи сервера root:socseti
0640, /etc/socseti 0750; БД и WAL/SHM приватны, каталог0700/umask0077.

Параметры telegram.enabled/tokenFile/approvalChatId — доверенная конфигурация.
Если блока telegram нет, daemon хранит черновики без Telegram. Если блок присутствует, он содержит enabled, tokenFile и approvalChatId даже при enabled=false; у Анны также обязательны externalPoll:true и writerEnabled. Полная схема и ограничения — REFERENCE.md.
При включении getMe проверяет ostrov_smm_bot и privacy on; getWebhookInfo —
отсутствие webhook; getChat — типы и IDs; getChatMember — право публикации.
Конфликт чужого poller/неверные права останавливают worker, не удаляют webhook.
Разрешён единственный origin API https://api.telegram.org, redirect запрещён.

Полный путь: MCP → SQLite → карточка → callback_query из getUpdates →
решение одного allowlisted человека → очередь публикации → Telegram message_id.
Карточка включает draft/version/hash/platform/account/kind, для ответа ещё
событие/диалог/получателя. Длинный полный текст — draft.txt на том же сообщении,
кнопки и метаданные в caption. Ничего не обрезается; документ создаётся в памяти,
произвольные URL/пути/медиа от модели не принимаются.

Одобряющие: владелец из /etc/vladelec/telegram-id / список из /etc/socseti/approvers.json, достаточно одного.
Только inline «Опубликовать / Отклонить». Текстовое ok не действует.
Проверяются from.is_bot=false, ID человека, bot ID, chat/message ID, текст или
caption/document ID, кнопки/nonce, текущие версия/хеш/цель/TTL. Forward, edited,
inline-game/inaccessible callback не разрешают публикацию. Решение, approval,
публикационный action и offset updates фиксируются одной SQLite-транзакцией.
Редактирование возможно до решения; старые карточки становятся недействительны.

Перед send HTTP action атомарно становится sending. Только явный успешный
ответ с ожидаемым message_id/chat/text даёт sent/published. Различие только конечных ASCII-пробелов/tab/CR/LF допускается; ведущий и внутренний текст, Unicode-пробелы, chat/bot/document/nonce не нормализуются. Receipt хранит фактический ответ; callback сверяется с ним побайтно. Потерянный ответ,
неразбираемый результат, 5xx, завершение процесса между отправкой и фиксацией
дают unknown; автоматического повторения НЕТ. При старте sending→unknown.
Оператор сверяет Telegram и приватную БД; снятие unknown вручную этим выпуском
не реализовано. Нельзя лечить unknown удалением строки и повтором отправки.

Доказанный отказ connect/getaddrinfo до HTTP (ECONNREFUSED, ENOTFOUND, EAI_AGAIN) или UND_ERR_CONNECT_TIMEOUT даёт not_sent. Action возвращается queued с паузой 1 секунда, максимум три попытки суммарно с 429; после исчерпания failed. Generic timeout/reset, потерянный ответ и ошибки чтения полученного ответа остаются unknown. Это различение подтверждено подставой, не проверкой живого Telegram.

После транспортного отказа tick прекращает расход очереди. Деградированный собственный опрос сначала обязан восстановиться, затем разрешает отправки. У Анны externalPoll сохраняется: свой getUpdates она не зовёт. reason=send_unavailable держится до успешного HTTP ответа; telegram_send_recovered означает восстановление транспорта, а не доказательство sent, которое отдельно требует годного receipt.

Явный Telegram 429: retry_after 1–60 сек, всего не более 3 отправок action.
Другой подтверждённый 4xx — failed; 401/403/409 останавливают worker. Polling:
20сек long poll, HTTP срок25сек, ответ≤2MiB. Временная неудача getUpdates не
останавливает worker: status.telegram.reason=poll_failed, в журнале один раз
telegram_poll_degraded, опрос повторяется с отступом 1/2/4/8/16сек (потолок16сек),
после удачи — telegram_poll_recovered. halted до ручного перезапуска дают только
401/403/409, негодная пачка updates (invalid_update_batch) и непредвиденный сбой
цикла (worker_failed). При halted
MCP/status продолжает отвечать. Журнал содержит ID action/тип/состояние,
не текст/токен/URL с токеном. Один tick берёт максимум20 карточек/10 отправок.

Одновременно не более100 незавершённых drafts/ключ; expired/published/rejected/
failed освобождают место. unknown и publishing место НЕ освобождают. TTL7суток,
20версий/draft, у legacy1000events всего; у Анны30000pending событий (см. REFERENCE). История и idempotency сохраняются, автоудаления
нет — это одновременный предел, не ограничение общего размера БД.
Тело MCP≤64KiB; текст≤4096codepoints/16384UTF8байта. SQLite busy_timeout1сек,
дальше отказ без автоповтора. systemd максимум3старта/300сек, RestartSec5.

Для профиля Варвары ТОЛЬКО тестовые чаты: группа -1004416192741, канал -1004451262289.
Прежний ID группы -5336351970 не используется. Боевые Telegram IDs дополнительно
отвергаются config при enabled. В этом профиле VK/Instagram/Threads и ответы через их API
не вызываются: одобрение для них сохраняется как approved_held_stage3.

В профиле Варвары приватные события остаются held_no_private_route без sender; у Анны есть отдельная подтверждаемая доставка channel/pending→ack, не общая OMEGA. Один Bearer не
отличает публичный/закрытый чат; маршрут без общей OMEGA B-N-1476/1483 — отдельная
приёмка. Профиль Анны описан отдельно и не разделяет ключи/БД с Варварой. Сырые draft/event capabilities в закрытой БД
0600 — осознанно принятая Забавой граница (14:54:19Z), шифрование не заявлено.
Файл varvara-mcp.env читает systemd; самой Варваре файл недоступен, ключ передаётся через окружение; его полномочия ограничены тремя draft.

Дельта ворот 16:13:24Z: failOnStartupError=false у mcp-socseti сохраняет запуск
гостевого профиля даже без backend. Отказ Telegram preflight оставляет MCP
черновиков живым; status.telegram.reason и telegram_halted объясняют причину
без токена/URL. Нет автоматического повторения preflight: исправить причину,
перезапустить socseti. Ошибка core config/БД/MCP-ключей по-прежнему фатальна.
Карта секретов добавляет bot-token→ferma/dsh/socseti-bot-token (ветка заведена Искрой, проверено по имени),
varvara-mcp.env→НЕ: локальная восстанавливаемая пара с varvara.key. Проверялись
имена веток, не значения. IPAddressAllow не сужался по решению координатора.


B-N-2023: owner approval reads `/usr/local/bin/vladelec-tg-id` at each decision, without a cached owner or fallback. Delegated approvers are read from the required root-owned `/etc/socseti/approvers.json`, an explicit JSON array of integer IDs (5..15 digits), which may be empty. No fallback IDs exist. File and parent must be regular/directory, uid 0, no symlinks, no group/other writes. The settings are checked before reading; replacement requires root. The list is read at each decision and each worker claim. The root-owned setting is `/etc/vladelec/telegram-id`; the shared reader enforces ownership, permissions and one numeric line. Missing settings refuse startup before state writes; a running Telegram worker holds without API calls and marks `owner_id_unavailable`, retries the reader at the existing loop cadence with a 1-second minimum, and recovers automatically when the file returns. Other worker failures still halt.

Existing approval tables whose CHECK enumerated owner IDs migrate transactionally to a positive-integer CHECK; authorization stays at the actual callback boundary. Historical rows, foreign keys and SQLite version 1/2 are preserved; failed migration rolls back. Direct database writes are trusted local storage operations, not the approval API. Changes to the current owner do not erase past lawful approvals. Owner checks cannot revoke an API call already sent before the file changed.

B-N-2023 R3: пакет содержит только `etc/socseti/approvers.json.example` (`[]`), это не боевой список. Рука монтажа кладёт `/etc/socseti/approvers.json` root:root 0644 в каталог root:root 0755. Отсутствующий/неверный список даёт отказ до записи состояния; worker использует прежний `owner_id_unavailable` и восстанавливается после возврата настройки. SQLite сохраняет историю прежних одобрений; новые решения проверяют текущий список. `SOCSETI_OWNER_READER` и `SOCSETI_APPROVERS_FILE` позволяют стендам подставить свои предметы; шаблон Анны задаёт эти имена каноническими машинными путями, шаблон Варвары использует те же умолчания. Пакетные тесты сами готовят нейтральные root-настройки; `/usr/local/bin/vladelec-tg-id` и данные боя не требуются. Полный стенд: `test/stend-b2023-social.py`, Node 24 и `SOCSETI_TEST_NODE_MODULES` (по умолчанию `/opt/socseti/node_modules`), `SOCSETI_WATCH_SOURCE` (по умолчанию соседний пакет дерева). Проверки выполняются на временной копии, внешние API подставные.

## Ответы ВК профиля Анны

Настройка, точные цели, legacy unknown и границы readback описаны в [VK-REPLIES.md](VK-REPLIES.md). Пара канала — 3.1.6 с сохранённым /cs версии 3.1.5.

## Проверки и диагностический статус

`npm test` на Node24 не требует ручных переменных. Собственные проверки строят подставные ключи/owner/allowlist и SQLite в /tmp; требуется sudo -n только для прав root-настройки фикстуры. Свой socseti-watch пакет не поставляет: в дереве тест находит соседний dsh-storozha-sadik автоматически, в самостоятельном архиве именованно пропускает шесть внешних подпроб сторожа; отдельно отсутствующий dsh-telegram-multiagent даёт пять именованных пропусков проверки межпакетного канала. Полный мониторный круг можно явно задать существующим абсолютным SOCSETI_WATCH_SOURCE; неверный явный путь — отказ. Число подпроб различается по наличию соседа, зелёное не означает проверенный внешний сторож. Live pilot в npm test не входит.

Новая версия не меняет конфигурацию, не включает ВК-писателя и не переписывает старые approvals/unknown. Описание status, startup codes, событий журнала и аргументов MCP — REFERENCE.md. Методы приёма Анны доступны только её channel-ключу, отсутствуют в каталоге модели. [Приём ВК](docs/ANNA-VK-FIRST.md), [текстовые посты](docs/ANNA-VK-TEXT-POSTS.md), [ответы ВК](VK-REPLIES.md), [группировка notices](docs/ANNA-NOTICES.md).

Миграционные пробы прежней очереди используют закреплённую SHA-фикстуру test/fixtures/telegram-queue-r1.mjs, без git show. Межпакетные проверки канала Анны требуют соседнего dsh-telegram-multiagent; в самостоятельном архиве они дают именованные пропуски. Проверка восстановления владельца самого worker выполняется и без этого соседа.

B-N-2027 Meta candidate (number assigned at merge): see [META-ANNA.md](META-ANNA.md). Intake is opt-in; refresh requires separate verified metadata/source barrier; no Meta writer is enabled.
