# Конфигурация, MCP и диагностика

Справочник к3.1.1. Примеры не меняют настройку и не включают писатели. Config — JSON до4096байт, без symlink/hardlink, принадлежит root или учётке службы; запрещены execute/групповая запись/права остальным. Неизвестные поля отвергаются, типы не преобразуются.

## Общая конфигурация

| ключ | форма и ограничения |
|---|---|
| port | целое1024–65535; HTTP bind только127.0.0.1 |
| stateDir | абсолютный путь до1024знаков; свой каталог0700, SQLite0600 |
| targets | обязательные vk/instagram/threads:строки цифр1–32; telegram:отрицательный ID в строке, безопасное целое |
| keyFiles | Варвара:varvara/monitor; Анна:anna/monitor/channel; абсолютные пути, разные64hex ключи |
| telegram | необязательный блок. Если есть, нужны enabled:boolean,tokenFile:absolute,approvalChatId:negative safe integer; группа отличается от targets.telegram |
| profile | у Анны только anna, у Варвары поле отсутствует |

При enabled=false telegram всё равно полный, иначе config rejected. Без блока worker не создаётся. Legacy пример — config.example.json; её прежние production IDs отвергаются при enabled=true. targets сами по себе не включают API.

## Добавления Анны

| ключ | форма и смысл |
|---|---|
| telegram.externalPoll | только true; offset/getUpdates принадлежат внешнему poller |
| telegram.writerEnabled | boolean; Telegram publication отдельно от notices/карточек |
| telegram.approvalChatId | только Marketing -1001659691422; getMe ожидает anna_arg_bot |
| vk | необязательный блок приёма:enabled=true,armed=true,idleAt=2026-10-13T11:35:20Z,apiVersion=5.<цифры>,groupToken,wallToken |
| vk.groupToken/wallToken | ровно file:absolute либо passRef:имя без флагов/пустых/./..компонентов; значений токенов в config нет |
| vk.writer | отсутствие —выключен. Если есть:enabled=true и token-reference; enabled=false отвергается |
| vk.writer.replies | если есть,enabled=true; unknownReplyObjects — проверенная инвентаризация comment/dm, не автосканирование |

При vk требуется targets.vk=127999849. Схема — src/config.mjs; ограничения/readback — docs/ANNA-VK-FIRST.md, docs/ANNA-VK-TEXT-POSTS.md, VK-REPLIES.md. anna-vk.config.example.json — пример, не команда включения. Не переносить writer из примера в действующую выключенную конфигурацию.

## MCP

POST /mcp, JSON-RPC SDK. Bearer по приватному клиентскому ключу, Host строго127.0.0.1:port, без Origin; Content-Type application/json (допускаетсяcharset=utf-8); тело≤65536байт. Значение ключа не передают argv и не печатают. Monitor не имеет draft-методов, агент не имеет status. Предел:16обработчиков/32соединения. Нет approve/publish/list/rawAPI метода модели.

| инструмент | обязательные аргументы | результат |
|---|---|---|
| draft_post | request_id,platform(vk/instagram/threads/telegram),text | draft_id,draft_token,version,state=pending_approval,payload_sha256,approval_required=true,published=false |
| revise_draft | request_id,draft_id,draft_token,expected_version1–20,text | новаяversion/state/hash,approval_required=true,published=false; только до решения, старая карточка stale |
| draft_reply | request_id,event_token,text | такой же draft-результат; адресат из собственного непросроченного события |
| status | пустой объект | технический статус без текстов/ключей/capabilities |

request_id:8–80знаков, первая латинская буква/цифра, затем буквы/цифры/._:-. Тот же id/запрос/ключ возвращает replayed=true; иное —request_id conflict. Draft UUID36знаков, capability64hex. Текст draft:непустой после trim-проверки,≤4096codepoints,≤16384UTF8байта, без повреждённого Unicode; сохраняется без trim payload. Лишние/неверные аргументы —arguments rejected, role/tool —tool unavailable.

JSON результата — content[0].text. MCP-отказ имеет isError:true и безопасную причину:text rejected,request_id conflict,event/draft not available,version conflict,capacity reached,platform not allowed; прочее —storage operation rejected. Capability не копируют в отчёт/журнал.

## Канал Анны

Только channel-ключ:POST /channel/cursor({}),/channel/ingress(source,expectedCursor,cursor,events),/channel/pending({}),/channel/ack(id,payload_hash),/channel/callback(Telegram update). Эти маршруты отсутствуют в каталоге модели. Source связан с настройкой; reply-адресат не берётся из draft_reply аргумента.409 —conflict входа/хранилища,503 —capacity или отсутствующая queue. Ответ — собственный JSON, не MCP-каталог.

## status

| поле | как читать |
|---|---|
| stage | 2 — форма Store status, не семантическая версия приложения |
| publishing | хотя бы один разрешённый writer ready; Telegram Анны дополнительно требует writerEnabled=true |
| external_io | готовность Telegram/VK writers; не охват/здоровье ВК-приёма |
| telegram | null без подсистемы, иначе halted,reason,actions(state→count); ready косвенно в publishing/external_io с учётом профиля |
| vk,vk_post,vk_reply | независимые статусы приёма/писателей; читать причины/coverage, не общий флаг |
| event_delivery | у Анны pending_anna_dispatch, иначе held_no_private_route; не доказательство доставки каждого события |
| drafts | все строки, включая историю, не только активные |
| outbox | число held_* строк, не вся Telegram очередь/отправленные |

Активных drafts на ключ≤100,версий≤20. Legacy events≤1000строк; у Анны≤30000неподтверждённых событий (есть anna_event/event_card_request outbox, ещё не delivered/tg_sent). История автоматически не удаляется. Legacy TTL7суток. Анна ждёт часовой пакет09–23МСК; после доставки карточки TTL24часа, новая версия ждёт нового часа. Tick создаёт до20draft-карточек и берёт до10отправок; Анна между карточками/notices ждёт≥3сек. Пауза повтора не отменяет эти ограничения. Внутрипроцессный приём Анны допускает event.text≤65536codepoints/262144UTF8байта, но /channel тело целиком ограничено65536байтами JSON; максимальный размер события не обещает перенос через этот HTTP-маршрут.

## Причины и журнал

Preflight halted:token_invalid,token_rejected,webhook_present,identity_or_privacy_rejected,chat_identity_rejected,channel_rights_rejected,token_file_rejected,token_file_unavailable,api_unavailable_or_unconfirmed,preflight_failed. MCP остаётся; preflight автоматически не повторяется, исправление/restart — назначенная рука.

poll_failed без halted —degraded getUpdates, интервалы1/2/4/8/16сек, восстановление автоматическое.401/403/409 при poll дают тот же reason с halted=true. authorization_or_conflict —фатальный send; invalid_update_batch —негодная пачка; worker_failed —сбой цикла. owner_id_unavailable —owner/allowlist не прочитан, API не вызывается, проверка настройки с минимум1сек. send_unavailable —транспортный send-отказ, у Анны до успешного HTTP-ответа без второго poller.

События:telegram_action(id,kind,state),telegram_halted(reason),telegram_poll_degraded/recovered,telegram_send_degraded/recovered,telegram_owner_unavailable/recovered,telegram_callback_answer_failed. Transport recovery не заменяет receipt. Startup JSON:service,manifest.version,stage,port,publishing,external_io,vk. Тексты/токены/URL с токеном не выводятся. Причины ВК — профильные документы; их не сворачивают в здоровье Telegram.

## CLI и коды

node src/main.mjs /absolute/config.json — один абсолютный путь. Лишние/неверные доводы, включая --dry-run/-n/--check, —usage и2 до запуска. Core config/ключи/БД/bind/notify —1 с безопасной причиной:config_rejected,config_json_invalid,private/key/state/database_*,ENOENT/EACCES/EPERM/ELOOP/EADDRINUSE; неизвестная —startup_failed. Частный путь и содержимое ошибки не печатаются. Preflight может оставить процесс живым и подсистему halted —читать status.

test/live-pilot.mjs request_id —назначенный живой пилот Варвары с port8381,usage2/отказ1; в npm test не входит. Служба работает доSIGTERM/SIGINT;0/1 не счётчик публикаций. Остановка/откат —INSTALL.md; неизвестный исход не снимают повтором CLI.
