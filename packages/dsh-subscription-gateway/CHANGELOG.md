# Изменения · Changelog

## 3.1.10 — 21.10.2026 · Codex originator (witness)

- Codex app-server: ожидаемое имя в initialize userAgent берётся из фактической среды дочернего процесса. Default originator codex_sdk_ts и внешний override сохраняются; проверка версии и mismatch остаются строгими.
- Регрессия на сохранённом реальном initialize: witness → несовпадение → witness, отдельная среда spawn и fallback clientInfo.name.

## 3.1.9 — 20.10.2026 · child capture

- Общий source_version/sv1 из загруженного SDK/CLI, ID-only lifecycle Claude и first-level Codex child_edge с ключом версии; локальные child_capture_end/gap.
- Уточнена граница SDK witness: версия package.json и SHA256 входного файла SDK до/после import; отпечаток всего дерева модулей и транзитивных зависимостей не заявлен.
- субагенты глубже первого уровня и завершившиеся после закрытия наблюдения — не считаются: строка участника помечается неполной
- Порядок окна: сперва AP-читатель новых kinds/manifest, потом шлюз; без живых подписочных канареек в этом кандидате.


- Claude query включает includePartialMessages только при usageObserver; без observer сохраняется прежний поток SDK без partial-кадров. G получает финальный message_delta на message_stop вместо промежуточных assistant usage.
- Обрыв pending stream помечает только свой request. Уже поставленный prefix сохраняется с непрерывным seq; переполнение общей очереди по-прежнему замораживает весь процесс.
- Исторические Claude G до этого исправления не содержат финальных output и остаются GATEWAY_USAGE_MISMATCH.
- Отдельный пакет от reader/exporter dsh-autopilot 0.1.12; совместный монтаж этим кандидатом не разрешается.

## 3.1.8 — 18.10.2026 · AP 0.1.10: учёт G, аккаунт Codex и сегменты журнала

- Проверка аккаунта Codex: состояние читается у того же app-server перед началом хода и перед terminal-записью G. В журнал сохраняются хеш идентификатора и разрешённые поля authMode/planType; email и токены не сохраняются. Смена аккаунта, отказ чтения или неподтверждённая подмена источника дают именованную непривязку. Привязку аккаунта к подписке выполняет читатель Автопилота.
- Лимиты задаёт писатель: usage-limits.json со schemaVersion=3 содержит только пять исполняемых ограничений. Пороги ночного контроля вынесены из policy писателя; usage-limits.mjs выдаёт те же лимиты читателю через CLI.
- Активная замена G: подмена файла во время работы оставляет стойкую отметку разрыва для процесса, закрывает сегмент с печатью и открывает следующий. Восстановление истории G из резервной копии запрещено, в том числе при остановленном шлюзе.
- Рождение источника: sourceCreatedAt записывается при создании и сохраняется при обычных перезапусках. Ручное внесение UUID источника в профиль заменено проверкой окна читателем: запрос истории до рождения источника получает RETENTION_GAP.
- Сегменты G: писатель закрывает непустой сегмент по пределу 8 МиБ или возрасту 1 час, сохраняет SHA256 и печать, выставляет закрытым файлам режим 0400 и удерживает историю 7 суток. Перезапуск восстанавливает незавершённую ротацию. Чтение не использует кэш разобранных данных; отсутствие или порча сегмента дают именованный отказ. При включённом G старт создаёт пустой active-файл, не изменяя существующий.
- Новые файлы: usage-limits.mjs, usage-limits.json, usage-segments.mjs; документы docs/G-ROTATION-DESIGN.md и docs/G-READER-WIRE.md; стенды test/stend-usage-engine-account.mjs, test/stend-usage-segments.mjs, test/stend-usage-segments-http.mjs и test/stend-usage-startup.mjs. Стенды проверяют аккаунт, ротацию, HTTP-путь, порчу и возврат на временных копиях.
- При монтаже для читателя создаётся root-копия тройки usage-limits.mjs, usage-limits.json, usage-segments.mjs в /opt/autopilot-gateway-policy/3.1.8-<голова>/ и запись реестра autopilot-gateway-policy. Суффикс — первые 8 знаков итоговой головы шлюза; вся цепочка каталогов root:root 0755, файлы root:root 0644. Копия обновляется вместе со шлюзом, суммы трёх файлов сверяются с той же поставкой.

## 3.1.7 — 17.10.2026 · только AP 0.1.10: пустой G и предел пакета

При старте включённого G создаётся пустой private usage-файл без observer/seq;
существующий файл проверяется и не изменяется. Небезопасный путь даёт именованный
отказ учёта, не отменяя запуск/ход шлюза. Единый file-limit задан usage-limits.json,
writer использует экспорт GATEWAY_USAGE_FILE_MAX_BYTES; CLI выдаёт те же данные.
Это отдельный кандидат поверх принятого ced3d243, в0.1.9 не входит.


## 3.1.6 — 17.10.2026 · AP019 raw G, маршрут auth и привязка процесса

Дополнение17.10 17:32:57Z: kernel binding содержит sourceProcess{pid,boot,start};
consumer-compatible process request предоставляет отдельная G-проекция AP
без готового run/auth. PID — app-server/SDK child, не его инструменты.
Проверка регистратора Беты и монтаж остаются отдельно.


Неблокирующий raw usage source: SDK/RPC identity, native child facts до root filter,
bounded process queue и gap; Claude FD3 handle/override guard. Фактический spawn
Codex app-server и Claude SDK пишет engine_process_binding с kernel-тройкой
(pid,starttime,boot_id) и native tuple; отказ Z/X/x, повторный снимок/direct parent.
Регистрация run — отдельный потребитель.

Уточнение Забавы17.10 17:15:51Z: authLinkTargetAtStart всегда сообщает маршрут
readlink, не применённый источник. Сохранены три снимка ссылки и добавлен actual
argv hook перед app-server spawn. Env/link/argv/недоказанный effective config дают
AUTH_SOURCE_UNPROVEN:<condition>, subscription/authEpoch=null. Прежний positive
proof switcher-symlink-three-points снят: cloud-aware AuthManager не аттестован.
Положительный slot3 остаётся OPEN. Авторизация/конфиги/службы не меняются,
модель отказ учёта не блокирует. Область и пробы — USAGE-PRODUCER.md и
OPEN-CODEX-AUTH.md. AP-нормализация и монтаж не входят в эту дельту.

## 3.1.5 — 14.10.2026 · строка usage хода Codex для сверки полноты (Заря; наряд Забавы 20:48Z, слово владельца 23:16 МСК)

- `codex-app-server.mjs`: `schetUsageHoda()` — итог хода из уведомлений `thread/tokenUsage/updated` (канал протокола app-server,
  не файл rollout): total последнего − (total − last) первого; вызовы — число разных total. В конце каждого хода (и проваленного) —
  строка журнала «usage хода: turn=… thread=… вызовов=… input/cached/cache_write/output/reasoning=… полнота=…» и строка JSONL в
  `$CODEX_HOME/dsh-usage-hodov.jsonl` (0600, учётка шлюза = владелец CODEX_HOME). Без текста хода и секретов. Не бросает:
  уведомление без turnId / с негодными числами считается отдельно, недоступный дом — строка «не записано».
- Читатель — `dsh-autopilot` `tools/measure-run-codex.py --sverka-shlyuz`. Ветка Codex-SDK (`runStreamed`) не тронута — у нас путь app-server.
- `codex-app-server.mjs`: per-turn usage from `thread/tokenUsage/updated` → one log line and one JSONL line in `$CODEX_HOME`; never throws.

## 3.1.4 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `author` — «Aleksandr Argelander» (единый автор семьи; лицензия MIT на его имя) · `author` set to "Aleksandr Argelander"
- README: номер выпуска 3.1.1 → 3.1.4 · README: own release number updated
- Код не менялся; номер 3.1.3 → 3.1.4 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.3 — 12.10.2026 · B-N-2010: /cs внутри хода по адресу беседы

- Граница поддержки диагностики: если Unix endpoint не поднялся при старте (живой занятый сокет либо таймаут зонда 250 мс), gateway работает дальше без свежего статуса; автоматического повторного подъёма до следующего рестарта нет. Отказ виден в журнале и /cs.

- B-N-2010: Claude публикует input и кэш текущего root SDK response; дочерние/неизвестные scope и неполный usage не выдают чужое или ложное свежее число. Authenticated local context-status чтение дополняет private Unix IPC.

Последний token_count Codex доступен каналу в ходе через RAM/private Unix IPC по единственному адресу B-N-2009; сжатие/слепота снимают число. SQLite диагностика не пишет, resume mapping не меняется. Два независимых стенда observer/endpoint входят в пакет. /cs numeric состояние и полный process runner — в dsh-telegram-multiagent.

- Публичный адрес сопоставляется по тройке key/session_id/session_created, порядок полей JSON не создаёт новую беседу (187fbe5f).

- B-N-2010, ворота B-N-1774: обёртка stend-context-observer учитывает возврат тела — строка сохраняется как причина отказа, false и прочие значения кроме undefined/true дают FAIL. Числовые проверки watcher и runtime шлюза не менялись.

## 3.1.2 — 12.10.2026 · B-N-2009/B-N-2011: письмо возвращается в свою беседу; 2 продолжения НА БЕСЕДУ, до 2N

Адрес беседы приходит от клиента явным `x-dsh-spool-conversation`, поддержка объявляется `spoolConversation:1`; адрес локален запросу и входит в конверт продолжения Codex/Claude и досылки B. Приёмник сверяет свою учётку и текущее поколение беседы; адресованная Telegram-беседа получает обычный ответ в тот же чат. Старые клиенты сохраняют fallback a2a.

Предел теперь **2 успешных письма-продолжения НА БЕСЕДУ/поколение**, вместо общего предела на процесс шлюза. При N стоящих беседах возможно до **2N писем**. Не-pressure завершение сбрасывает только свою цепочку; досылка B не расходует этот предел. Проверенный v2 key имеет один бюджет с адресным заголовком и без него; для legacy без определяемой беседы остаётся общий fallback. Failed publication не расходует successful-letter slot.

Уточнение к воротам метки 12.10.2026: `stend-codex-spool-conversation.mjs` под учёткой Искры создаёт побайтную временную копию шлюза и выбирает доступный SDK (явный STEND_SDK либо соседний слой, при отказе чтения — гостевая раскладка). Закрытая ссылка sdk-runtime дерева больше не препятствует проверке; HTTP/app-server/письмо и проверки адреса не меняются. Боевой шлюз и обходчик не правились.

Пробы: `stend-continuation-conversations.mjs` (независимость A/B, reset своей цепочки, canonical JSON, поколение, ошибка укладки, handles после reset, v2 с заголовком/без него, legacy fallback); настоящие HTTP Claude/Codex с разными беседами и смешанным заголовком; адресный native-стенд канала с process restart и гостевым ответом.

**Границы (LOW):** записи карты счётчика живут до reset соответствующей цепочки или рестарта процесса, без TTL/эвикции; при большом числе стоящих бесед карта растёт. Счётчик в RAM: рестарт снимает бюджет. Не заявляется глобальный предел2 на шлюз либо стойкость бюджета после рестарта. Маршрутизация не восстанавливает утраченную durable-привязку гостя, а Telegram-доставка не гарантирует exactly-once при неизвестном сетевом ACK.

## 3.1.1 — выпуск по облачному аудиту №1 (A-N-1948): негодное тело запроса, карта сессий и её срок хранения, восемь мелких находок, документация, engines; №3 отклонён

Единый номер выпуска наших пакетов 3.1.1 (слово владельца 10.10.2026); рабочий номер 1.4.57 в бой не выходил. Документные находки аудита №4–11, 19–22, 24 исправлены в README, CONVERSATIONS, LIVE-INPUT и docs/ RU/EN (Аврора) — их перечень в отчёте приёмки, здесь не повторяется. Документация приведена к коду 3.1.1: карта сессий (кэш ≤ 8 только в памяти, промах читает базу, строка удаляется при мёртвой сессии и по сроку `GATEWAY_SESSII_SROK_DNEJ` — строка ключа в SETTINGS), Node ≥ 22.22.0 (README, TROUBLESHOOTING), «Установка» под выпуск 3.1.1 и имя `dsh-subscription-gateway`, в GUARDS — стенды `stend-telo-zaprosa`, `stend-karta-sessij`, `stend-srok-sessij`.

- **№1 HIGH.** Тело `null`, массив, строка или `messages` не массив объектов — теперь 400 `bad_request` до любого обращения к полям; прежде `null`/`[null]`/`5` роняли процесс TypeError вне try, обрывая все живые ходы. Обработчик запроса обёрнут: любое исключение внутри — 500 или событие `error`, процесс жив. Стенд `test/stend-telo-zaprosa.mjs`.
- **№2 HIGH.** Вытеснение из кэша на восемь бесед — только из памяти, строка в SQLite остаётся; промах кэша читает строку из базы; при старте в память поднимаются последние восемь строк (порядок `rowid` = свежесть при `INSERT OR REPLACE`). Прежде девятая беседа удаляла mapping первой из базы — её продолжение шло полной историей в новую сессию. Строка удаляется по-прежнему только при подтверждённой мёртвой сессии. Стенд `test/stend-karta-sessij.mjs`.
- **№3 MED — отклонено, не правка.** После повтора хода `task-status:terminal` не публикуется НАМЕРЕННО: барьер B-N-1536 r2 (1.4.38) — terminal запроса заверяет исход всех его запросов к SDK, а первый, снятый без положительного terminal, повтором не заверяется (стенд `test/stend-request-terminal-barrier.mjs`, проба r3). Следствие, названное аудитором (адаптер остаётся в unknown/HOLD после мёртвой сессии), — вопрос замысла, не кода.
- **№12.** Удержанный первый текст выпускается перед любым следующим блоком — порядок `text` → `tool`/`thinking` сохраняется.
- **№13.** `/v1/task-control`: негодный JSON — 400 `accepted:false`, а не 503 `unknown` (вечный HOLD у адаптера).
- **№14.** Флаг явного стопа ставится только по принятому `stop-exact`: отвергнутый не отменяет досылку B, компакт и письмо продолжения.
- **№15.** Закрытие app-server: SIGTERM через 5 с, SIGKILL ещё через 5 с с записью в журнал.
- **№16.** Текст отказа поставщика в argv `agent-alert` проходит вычистку секретов, как журнал и NDJSON.
- **№17.** Письмо «нужен /new» пишется в свой каталог `mkdtemp` с флагом `wx`, каталог снимается после `tell-komu`.
- **№18.** `/health` без ingress-пропуска не отдаёт путь к файлу токена (`chego_ne_hvataet`) и причину отказа ingress-файла (`ingressError`); с пропуском — как прежде. Остальные поля без изменений (их читает адаптер).
- **№23.** `explainExit` строит каталог транскрипта по правилу CLI Claude (всё не латиница/цифра → `-`; длинный путь — поиск по первым 200 знакам среди каталогов с этим транскриптом).
- **Срок хранения карты сессий** (находка Вениамина к №2: после правки строки `sessions` копились без предела). Строка несёт отметку последней записи (`obnovleno`); на старте удаляются строки старше `GATEWAY_SESSII_SROK_DNEJ` суток (умолчание 30). Строкам прежней схемы при первом старте ставится «сейчас» — срок считается от обновления, а не стирает их сразу. Неверное значение (не целое ≥ 1) — тревога в журнал и НИЧЕГО не удаляется. Удалённая строка — не потерянная беседа: её следующий ход поедет полной историей в новую сессию. Чистка только на старте: шлюз без перезапуска копит строки до следующего подъёма. Стенд `test/stend-srok-sessij.mjs`.
- **engines** `node >=24.19.0` → `>=22.22.0`. Из Node 24 коду не нужно ничего: единственная требовательная часть — `node:sqlite` (без флага с 22.13); SDK Claude/Codex и MCP SDK требуют Node ≥ 18. Нижняя граница — проверенная: на Node 22.22 пилот прошёл все стенды, кроме проверки версии. `stend-deployment-config` теперь сверяет пол не с «24», а с полом `node:sqlite` (≥ 22.13) и с исполняющим Node.
- **Состав:** в `files` внесены стенды `stend-telo-zaprosa`, `stend-karta-sessij`, `stend-srok-sessij` (в 1.4.57 первые два в состав не попали — в установленной копии их не было бы).
- Стенды `stend-telo-zaprosa`, `stend-karta-sessij`, `stend-srok-sessij`: обёртка `proba` краснеет на ЛЮБОМ возврате тела, кроме `undefined`/`true`, и объявлена в форме, которую узнаёт прибор ворот `obyortka-krasneet` (первая редакция была «глухой» и «ловушкой» — отказ ворот 10.10 00:13Z).
- `docs/ARCHITECTURE.md`: до начала потока возможен и код 500 (сбой обработчика).
- Стенды под новую структуру кода (предмет каждого не менялся): `stend-conversation-http` вырезает `obrabotatZapros`; `stend-conversation-isolation` и `stend-image-platform-checkpoint` — заглушка `sessiyaIzBazy` («в базе нет»); `stend-flagged-otkazy` — настоящая `vychistit`.

Code fixes from cloud audit #1: invalid request bodies now get 400 and a handler exception no longer kills the process (#1); cache eviction is memory-only, a miss reads SQLite, startup loads the latest eight rows (#2); #3 rejected — the terminal barrier after a retry is deliberate (B-N-1536 r2, stend-request-terminal-barrier); plus #12–18 and #23 (order of held text, 400 on invalid task-control JSON, explicit-stop flag only on accepted stop-exact, SIGKILL fallback for app-server, redacted alert argv, mkdtemp/wx for the coordinator letter, /health details only with the ingress bearer, CLI transcript path rule). Also: session-map retention (`GATEWAY_SESSII_SROK_DNEJ`, default 30 days, startup cleanup; an invalid value deletes nothing), engines lowered to Node >=22.22.0 (only `node:sqlite` is required, unflagged since 22.13), three new stands added to `files`, documentation findings fixed in RU/EN docs. The common release number of our packages is 3.1.1.

## 1.4.56 — три Claude-стенда выбирают слой SDK, как stend-env-dvizhka, и на чужом слое сверяют версию движка с реестром (B-N-1906, B-N-1910, Заря)

`test/stend-claude-task-control.mjs`, `test/stend-claude-mail-http.mjs`, `test/stend-guest-tools.mjs` от учётки iskra (ночной обход) падали по СРЕДЕ: ссылка `sdk-runtime` дерева ведёт в `/opt/claude-oauth` (750), iskra её не читает — «SDK НЕ УСТАНОВЛЕН в слое среды», и это читалось как «не сошлось». Теперь слой выбирается так же, как в `stend-env-dvizhka.mjs` (B-N-1899): `sdk-runtime` рядом с пакетом, если читается этой учёткой; иначе раскладка гостя `/opt/subscription-gateway-guest/sdk-runtime`; `STEND_SDK=<каталог>` — явно. Шлюз поднимается из копии каталога (настоящий файл `gateway.mjs`, `sdk-runtime` — ссылка на выбранный слой). Выбор печатается строкой «слой SDK: …»; нечитаемый слой — СЛЕПОТА с причиной (код 2), а не «не сошлось». Код шлюза не менялся.

**Сверка версии движка (B-N-1910).** Если стенд взял слой не рядом с пакетом (раскладку гостя или `STEND_SDK`), он сверяет версию `@anthropic-ai/claude-agent-sdk` из `package.json` этого слоя с `version` записи `claude-agent-sdk` в реестре машины `/etc/agent-registry/plugins.yaml` (её `installed_check` читает слой самого шлюза): расхождение — «РАСХОЖДЕНИЕ» с обеими версиями, код 1; реестр, запись или версия слоя не читаются — СЛЕПОТА, код 2; совпало — строка «версия движка: … = записи реестра». Источник — реестр, а не `package.json` пакета: там лишь диапазон `>=0.3 <0.4`. Учётка, которой слой рядом читается (root, claudeoauth), идёт прежним путём без сверки — это и есть слой шлюза.

**Не ловит.** Запись реестра — снимок: сменят слой шлюза без правки реестра — стенд сверит с устаревшей записью (это ловит `agent-plugins verify`, а не стенд). `codex-sdk` не сверяется: три стенда работают только с поставщиком `anthropic`. Цена: на слое гостя стенд без читаемого реестра машины суждения не выносит.

Three Claude stands now pick the SDK layer like stend-env-dvizhka: adjacent sdk-runtime if readable by this account, else the guest layout, or STEND_SDK; the choice is printed, an unreadable layer is BLINDNESS (exit 2). On a non-adjacent layer they compare the claude-agent-sdk version of that layer with the claude-agent-sdk entry of the machine plugin registry: mismatch exits 1 naming both versions, unreadable registry or layer is BLINDNESS (exit 2). Does not catch: a stale registry entry (agent-plugins verify does), codex-sdk.

## 1.4.55 — окружение движка: ГИГИЕНА, НЕ ЗАЩИТА (B-N-1899, Михалыч; находка Авроры)

Движку Claude больше не отдаются служебные `GATEWAY_*`: они нужны только шлюзу, остаётся лишь `GATEWAY_MOST_PROPUSK` — для заголовка моста. Правило по приставке: новый `GATEWAY_*` по умолчанию движку не уходит. Токен подписки подаётся движку дескриптором 3 (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`, свой `spawnClaudeCodeProcess`), а не через env: его больше нет ни в env Bash модели, ни в `/proc/<движок>/environ`. `OMEGA_MCP_API_KEY` движку нужен (заголовок omega) и остаётся. Хвост stderr движка при ненулевом выходе шлюз пишет в журнал сам: при своём запуске SDK его не копит. Стенд `test/stend-env-dvizhka.mjs`: настоящий движок против подставных API Anthropic, OMEGA и моста.

**Не ловит.** Учётка шлюза = учётка движка = учётка Bash, поэтому:
- файл токена `GATEWAY_TOKEN_FILE` учётка агента читает по ACL;
- у avrora, iskra, zarya sudo NOPASSWD ALL;
- `/proc/<шлюз>/environ` той же учётке открыт (`OMEGA_MCP_API_KEY`, все `GATEWAY_*`);
- `OMEGA_MCP_API_KEY` и пропуск хода остаются в env движка и Bash;
- ключ входа в шлюз (файл учётки агента, 600) читается напрямую;
- ветку Codex (app-server) правка не трогает.
Настоящую границу дала бы отдельная учётка шлюза — она ждёт решения владельца по sudo агентов.

Engine env hygiene, NOT protection: gateway-only `GATEWAY_*` (except `GATEWAY_MOST_PROPUSK`) no longer reach the Claude engine; the subscription token goes via fd 3 instead of env. Does not stop: token file readable via ACL, sudo of three agents, `/proc/<gateway>/environ` of the same uid, `OMEGA_MCP_API_KEY` and the turn ticket in the engine/Bash env.

## 1.4.54 — три стенда в составе пакета (B-N-1897, Аврора; находка Михалыча)

`test/stend-podmena.mjs`, `test/stend-pressure-event-time.mjs`, `test/stend-shemy-mosta.mjs` лежали в дереве, но не в `files` — не попадали в тарбол и в установленные копии, и ворота выпуска по ним отказывали бы (B-N-1823). Теперь в `files`, вместе с данными `test/pressure-events.json` — их читает только `stend-pressure-event-time` (`new URL('./pressure-events.json', import.meta.url)`). Прочие зависимости стендов уже были в составе: `test/zaglushka-app-server.mjs`, `codex-app-server.mjs` (stend-podmena), `codex-compaction-watch.mjs` (stend-pressure-event-time), `gateway.mjs` (stend-shemy-mosta; ещё ему нужен `node_modules` рядом с пакетом — есть в установленной копии, в тарболе нет по устройству). Код шлюза не менялся.

Three stands (and `test/pressure-events.json`, read only by stend-pressure-event-time) were in the tree but not in `files`, so neither in the tarball nor in installed copies; now included. Gateway code is unchanged.

## 1.4.53 — шаблон гостя = бой: одна подписка гостю (B-N-1621, Михалыч; выпуск в дерево B-N-1889, Аврора)

Гостевой шаблон `systemd/95-gost.conf` отставал от боя: в дереве `LoadCredential` грузил гостю все три подписки (f877f63e), в бою с 08.10 — одна (ffff21b2, монтаж B-N-1621). Новый гость, заведённый из пакета, получил бы старое. Теперь шаблон побайтно равен бою `/etc/systemd/system/claude-oauth-gateway@varvara.service.d/95-gost.conf`.

- `systemd/95-gost.conf` f877f63e → ffff21b2: `LoadCredential=` сброшен; `RuntimeDirectory=claude-oauth-gost-%i` (0500), `ExecStartPre=+/usr/local/libexec/gost-podpiska-vybor %i`, `CREDENTIALS_DIRECTORY=%t/claude-oauth-gost-%i`. Цена побайтного равенства: файл снова несёт пути sadik (`/etc/claude-oauth`, `/opt/subscription-gateway-guest`) вместо обезличенных `/etc/subscription-gateway`, `/srv/…` (A-N-1865) — к окну публикации обезличивать заново.
- `systemd/gost-podpiska-vybor` — новый (1e0661fc = бой `/usr/local/libexec/gost-podpiska-vybor`, root 0755): копирует в `RuntimeDirectory` ровно токен из `GATEWAY_TOKEN_FILE` в `instance-<гость>.env`; неизвестное — отказ, код 2, шлюз не стартует. В архив входит через `files: systemd`.
- `test/stend-gost-odna-podpiska.sh` — новый (2e9ce780 = `/opt/iskra/workspace/dorabotki/stend-gost-odna-podpiska.sh`), в `files`. От root, только чтение.
- `systemd/GUEST.md`: описан выбор одной подписки и путь установки; «два token-podpiska» исправлено на три (по `guest-launch.sh`).
- Граница (B-N-1621): шлюз и платформа гостя — одна учётка, текущий токен учётка гостя читать может; правило «1 из 3», не «0». Код шлюза не менялся.

Guest template = production: the guest gets one subscription. `systemd/95-gost.conf` is byte-identical to production (LoadCredential reset; `gost-podpiska-vybor` copies exactly the env-selected token into the unit's RuntimeDirectory); new `systemd/gost-podpiska-vybor` (installed at `/usr/local/libexec/gost-podpiska-vybor`) and `test/stend-gost-odna-podpiska.sh`. Price: the file carries sadik paths again instead of the anonymised ones. Gateway code is unchanged.

## 1.4.52 — выпуск рабочей 1.4.52-b1811: петля «СТОП → сжатие → стоп» шлюза кодеров (B-N-1811, Альфа; выпуск — Заря)

Выпуск — ровно бой с 08.10 00:23:44Z в обеих копиях (/opt/claude-oauth, /opt/subscription-gateway-guest), код не менялся:
gateway.mjs 5b17a1e8, codex-app-server.mjs ce419533, новый live-pressure.mjs 4070e6ab. Меняются только номер (package.json) и этот
заголовок. Парный адаптер — dsh-subscription-adapter 1.1.18-b1811 у кодеров (src/live-pressure.js).

Порог стопа шлюз берёт из живой настройки движка: адаптер по `our/compaction-status` отдаёт proof (окно, доля, запас, PID и
startticks процесса, версия и суммы src/index.js и src/live-pressure.js), шлюз сверяет его с диском и /proc. Расхождение —
«🔴 давление слепо: <причина>; действие выключено» (fail closed). Старый клиент без поля livePressure — прежний порог D.
Сжатием считается только парное compaction/start → compaction/end без ошибки той же сессии; steer отделён от подтверждения.
⚠️ Сверка версии адаптера: смена `version` в package.json адаптера на диске без подъёма движка кодера даёт
`live-pressure-code-drift` — стопы выключены до подъёма.
Живой признак (снято 08.10): Альфа 02:22:30Z порог → 02:22:47Z «steer принят #1» → 02:29:34Z одно compaction/end, повторного
порога нет. Стенды Альфы: 68 из 68 (implementation/evidence/FINAL-GREEN.log кандидата B-N-1811).
Правка выпуска (ворота vypusk-tegom 08.10): test/stend-conversation-http.mjs исполняет вырезку хендлера в vm, а B-N-1811 добавил в неё
вызов pressureForRequest — функция вне вырезки (ReferenceError). В контекст стенда добавлена заглушка; предмет стенда — личность
разговора, давление в нём не проверяется. Стенды пакета на выпуске: 43 из 43.

## 1.4.51 — выпуск рабочей 1.4.50-b1776: события лимитов SDK → приёмная dsh-limity (B-N-1776 такт 2, Заря; выпуск B-N-1812)

Выпуск — ровно бой с 07.10 18:00Z в обеих копиях (/opt/claude-oauth, /opt/subscription-gateway-guest), код не менялся: gateway.mjs 4e7c90a3.
Живой признак: служба dsh-limity с 07.10 18:00Z принимает строки шлюзов («принято N, отказано 0»), строка журнала шлюза
`[subscription-gateway 1.4.50-b1776/4e7c90a3]` у всех экземпляров. Меняются только номер (package.json) и этот заголовок.

На каждый `rate_limit_event` хода Claude шлюз кладёт в
`GATEWAY_LIMITY_VHOD` (умолчание `/var/spool/dsh-limity/vhod`, пустое — выключено) по строке JSON на окно: доля
(`utilization`, проба А 07.10: доля 0..1), сброс (секунды unix), статус — только у окна `rateLimitType`; окна — из
`unifiedWindows` (недокументированное поле CLI 0.3.289, снято пробой А), без него — из `rateLimitType`. Атомарно `.tmp → rename`,
файлы 0640, без токена и текста хода. Подписка — номер из имени `GATEWAY_TOKEN_FILE` (`token-podpiska-N`); нет номера, доли или
приёмной — строка журнала «лимиты: …», ход не страдает. Стенды: `test/stend-limity-sobytie.mjs` (функции, 11 проб),
`test/stend-limity-process.mjs` (настоящий шлюз + CLI, подставной API с заголовками anthropic-ratelimit-unified-*, 4 пробы).

## 1.4.50 — B-N-1742, порог наблюдателя сжатия Codex из D

Выпуск рабочей 1.4.49-b1742, код без изменений против неё. Живой признак 07.10: стоп на пороге D 599181 прошёл полной цепочкой у marc (11:32:21→11:34:16Z) и gamma (11:34:34→11:39:00Z); Codex сам после подъёма не сжимал.

Наблюдатель сжатия Codex читает порог из готового D (/etc/dsh-pamyat/agenty/<агент>.json, defaultRoute), а не из удалённого preset DSH. nominalThreshold берётся без пересчёта из окна rollout; при отказе именует агента, путь и причину. Исправная запись восстанавливает зрячесть. Изменения одинаковы для основной и гостевой копий. Ворота кода: Вениамин 07.10 09:48Z. Версия рабочая; выпуск 1.4.50 — после живого признака и отдельного слова.

The Codex compaction observer reads the ready D threshold instead of the removed DSH preset. Release of working build 1.4.49-b1742; both deployed copies (/opt/claude-oauth, /opt/subscription-gateway-guest) carry the same three files.

## 1.4.49 — B-N-1739, белый список: международные номера

Строка «тел:» белого списка Варвары с международным номером («+XXX XX XXX XXXX») при каждом подъёме шлюза с 06.10 шла в журнал «не разобрана — НЕ пропускается»: разборщик принимал только нормальную форму `7` и 10 цифр. Теперь номер, записанный с «+», — E.164 любой страны: 8–15 цифр, пробелы, дефисы, скобки (`normBelyj`); без «+» — как прежде (+7/8, `normTel`). Сверка такого номера с текстом, с реестром гостя и со списком — по цифрам как есть: прежнее правило «10 цифр → 7…», «8… → 7…» сделало бы «+49 30 123456» или «+81 3 1234 5678» из списка ключом к российскому номеру с теми же цифрами (стенд показал это на основе). Мусор («+12 34», буквы, 16 цифр, «++») — не разобран, назван номером строки, содержимого в журнале нет. Стенд `stend-pdn-maska.mjs` +3 пробы (44). Цена: «+8 9…» (ошибочная запись российского номера) теперь читается как номер с кодом 8 и не совпадает с «8 9…».

An international number in the whitelist was logged as unparsed: the parser accepted only `7` + 10 digits. A number written with «+» is now any-country E.164 (8–15 digits, separators allowed), compared by its digits as is — so a listed foreign number no longer unmasks a Russian one with the same digits; without «+» — as before. Junk is named by line number only. Stand +3 probes (44).

## 1.4.48 — B-N-1737, гостевой запуск: подписка 3 в дереве

Находка Вениамина к B-N-1676: гостевая копия выбирала `token-podpiska-3` вне дерева (`systemd/guest-launch.sh`), и монтаж из дерева уронил бы старт гостя. Теперь в дереве: launcher принимает 1/2/3; образец `systemd/95-gost.conf` грузит три подписки (пути — нейтральные, как прежде: развёрнутый drop-in машины живёт отдельно от пакета); `docs/SETTINGS.md` — так же. Фильтр схем гостя (B-N-1698 этап 1) сведён в 1.4.47 ветвлением по поставщику.

Veniamin's finding: the guest copy selected `token-podpiska-3` outside the tree. Now in the tree: the launcher accepts 1/2/3, the example drop-in loads three subscriptions (neutral paths kept), docs updated.

## 1.4.47 — B-N-1698 этап 2: одна негодная схема инструмента моста не гасит весь список

Движок Claude (claude-agent-sdk 0.3.289) отбрасывает ВЕСЬ список инструментов MCP, если у одного схема без верхнего `type: object`: шлюз писал «мост у модели: прислано N · собрано 0». Ветка anthropic теперь отбрасывает только негодный инструмент с криком «🔴 схема инструмента "<имя>" отброшена шлюзом: <причина>», остальные доходят до модели; строка «мост у модели» — «прислано N · собрано M · отброшено шлюзом K (имена)». Фильтр — дельта Гаммы из гостевой копии (этап 1, Варвара), перенос — Искра. Ветка openai (Codex) не меняется: обработчик списка — как в 1.4.44, zod-путь — прежний перебор. Стенд `test/stend-shemy-mosta.mjs` (настоящий процесс шлюза и движок, подставные API и мост); `test/stend-image-transport.mjs` берёт функции фильтра в контекст vm.

The Claude engine drops the WHOLE MCP tool list when one schema lacks a top-level `type: object`. The anthropic branch now drops only the invalid tool with a named alert, and the rest reach the model. The openai (Codex) branch is unchanged. New stand `test/stend-shemy-mosta.mjs`.

## 1.4.46 — B-N-1736, маска ПДн: сумма после плюса — не телефон

Находка Авроры при B-N-1676; r2 — ворота Вениамина 05:57Z (HIGH) и решение Забавы. Ветка `TELEFON` с разделителями маскировала суммы («+12 500 000 ₽»), а ограждение валюты 1.4.45 в слитной ветке обходили копейки («+12500000,50 ₽»). Теперь одно ограждение `SUMMA_POSLE` для обеих веток, в обработчике замены над всем совпадением: за ним необязательные копейки и валюта ⇒ сумма, как есть. Буквенная валюта — с правой границей `(?!\.?\p{L})` и явными склонениями (руб., рубль/рубля/рублей…, р., долл./доллар/ов, евро, USD/EUR/RUB/GBP): «Рублёвка», «Европейская», «Eurostar», «р.Москва» — не валюта. Сумма — только при числе цифр < 10: 10 и больше перед валютой — телефон («+7 999 111 22 33 руб»); совпадение с дефисом или скобками — телефон всегда. «+12 500 000» без валюты маскируется. Цена: сумма от миллиарда с валютой маскируется. Стенд +4 пробы (41).

Aurora's finding during B-N-1676; r2 after Veniamin's gate (HIGH) and Zabava's decision. One guard `SUMMA_POSLE` for both phone branches, in the replacer over the whole match: optional decimals and a currency ⇒ a sum. Letter currencies need a right boundary and listed inflections; a sum only below 10 digits; a dash or brackets — always a phone. Stand +4 probes (41).

## 1.4.45 — B-N-1676, маска ПДн: слитные международные номера

Находка Беты 05.10 16:21Z, ворота Вениамина. Ветка `+…` образца `TELEFON` требовала ≥10 цифр и не брала номер вплотную за латиницей: «+49301234», «+493012345», «WhatsApp+79991112233» уходили модели без маски. Новая ветка `TELEFON_SLITNYJ`: «+» и 8–15 цифр (E.164) без разделителей; слева не цифра, «_», «+» (часть числа или идентификатора), справа не цифра и не знак валюты (₽, руб, р., $, €, £, ¥, USD, EUR, RUB, GBP). Белый список действует как прежде. Ветки с разделителями не менялись. Стенд `stend-pdn-maska.mjs` +3 пробы (37). Цена: «+20261007», «рост +12345678» теперь маскируются.

Beta's finding, Veniamin's gate. The `+…` branch of `TELEFON` needed ≥10 digits and skipped a number right after Latin letters. New branch `TELEFON_SLITNYJ`: «+» and 8–15 digits (E.164) without separators; not after a digit/underscore/plus, not before a currency sign. Whitelist works as before; separator branches unchanged. Stand +3 probes (37).

## 1.4.44 — B-N-1632

Codex live-input через `turn/steer` допускает только `provenance.verified === true`, как Claude-hook. Валидное false даёт known-not-offered/signature-unverified, отсутствующее или неверно типизированное поле — invalid-user-input общего парсера. Причина отправляется в input-status и безопасный журнал, без текста письма/сырых ошибок; RPC не вызывается. Это проверка признака доверенного отправителя, криптографическая проверка подписи остаётся у отправляющего caller. Cancel/stop/pressure не затронуты. Новый стенд использует настоящий /v1/task-control, генератор и JSON-RPC дочерний процесс; прежние транспортные fixtures подают явно verified=true.


## 1.4.43 — B-N-1620, отказ фильтра поставщика отдельно от лимитов: «нужен /new»

Слово владельца 05.10 10:55 МСК, разбор Зари (db1e4457), замысел принят Вениамином 06:53Z. Счётчик отказов подряд (`otmetitOtkaz`) теперь различает вид по сигнатуре текста: `flag-session` / `flag-message` (Anthropic «safeguards flagged this session/message»), `flag-codex` («flagged for possible cybersecurity risk»); лимиты и 401 — прежний общий счёт. Беседа помечена — 2 отказа одного flag-вида подряд или 1 `flag-session`: один сигнал «нужен /new <агент> (беседа, причина flagged <вид>)» владельцу (`agent-alert`) и координатору письмом (`tell-komu`, щель своего агента по HOME/DSH_HOME). Один на беседу до удачного хода; общая тревога на 3-м отказе для помеченной беседы не дублируется; шлюз сам ничего не сбрасывает. Границы: счёт в памяти процесса (перезапуск — повтор сигнала), Map чистится только удачным ходом, одиночный `flag-message` не сигналит, aclaude и Петрович вне области. Стенд `test/stend-flagged-otkazy.mjs` (12 проб).

Owner's word 05.10, Zarya's analysis, accepted by Veniamin 06:53Z. The consecutive-failure counter now distinguishes content-filter refusals by signature (`flag-session`, `flag-message`, `flag-codex`) from limits and 401. A flagged conversation (two of the same kind in a row, or one `flag-session`) sends one "/new needed" signal per conversation to the operator (alert helper) and the coordinator (`tell-komu`); the generic third-failure alert is not duplicated; the gateway resets nothing. Limits: in-memory counters (restart repeats the signal), maps cleared only by a successful turn, single `flag-message` does not signal. Stand `test/stend-flagged-otkazy.mjs` (12 probes).

## 1.4.42 — B-N-1547 (1) r6, белый список владельца

Решение владельца 05.10.2026 09:37 МСК: публичные контакты — отдельный текстовый файл `GATEWAY_GOST_BELYJ_SPISOK` (строки «имя: …», «тел: …», «почта: …», «домен: …», «#» — комментарий), который владелец правит сам. Файл читается на каждый запрос вместе с реестром: правка действует со следующего обращения к модели, перезапуск не нужен. Телефон сверяется по нормальной форме (`normTel`: +7/8, пробелы, дефисы, скобки, 10 цифр без кода → 7XXXXXXXXXX) — в r5 «публичные» номера сверялись по сырым цифрам, и «8 (…)» маскировался. «домен:» пропускает любой адрес домена (точное совпадение, без поддоменов). Значение из списка главнее записи гостя в реестре. Строка, которую не разобрать, не пропускается и называется номером в журнале; нечитаемый файл — пустой список (маскируется всё), тоже в журнале. Сводка списка пишется в журнал при смене содержимого, без значений. Образец телефона расширен (все формы — п.5 владельца): «7» с разделителями и скобками, как «8»; десять цифр с ведущей 9 — с разделителями между группами («911 781 15 15», «(911) 781-15-15»); в r5 эти формы гостевого номера уходили в модель как есть. Слитные десять цифр без кода — граница (не отличить от номера заказа). Прежняя `GATEWAY_GOST_PUBLICHNYE` (JSON) — отказ при старте с именем новой переменной. Стенд: +10 проб, формы телефона 9 → 14; уборка временного каталога с повторами (гонка ENOTEMPTY после SIGTERM шлюза пробы конвертов давала ложный красный).

Owner decision 05.10.2026: public contacts are a separate text file `GATEWAY_GOST_BELYJ_SPISOK` («имя/тел/почта/домен: …» lines) the owner edits; read per request, so an edit applies from the next model call without a restart. Phones are compared in normal form (r5 compared raw digits, so «8 (…)» was masked). A «домен:» line passes any address of the domain (exact match). A listed value wins over a guest record. An unparsable line is not whitelisted and is named in the log; an unreadable file is an empty list (everything masked). The phone pattern now also catches «7» with separators and grouped ten digits starting with 9 (in r5 these guest numbers reached the model unmasked); bare contiguous ten digits remain a boundary. The old `GATEWAY_GOST_PUBLICHNYE` (JSON) refuses at startup. Harness: +10 probes; temp-dir cleanup retries (ENOTEMPTY race).

## 1.4.41 — B-N-1547 (1) r5, маска запрещает шлюзовой компакт

Условие Вениамина: модуль шлюзового сжатия (`GATEWAY_COMPACTION_MODULE`) отправляет стенограмму своему поставщику мимо посредника маски. Поэтому при `GATEWAY_MASKA_PDN=1` шлюз отказывает при старте (код 2), если модуль сжатия загружен и шлюзовой компакт не выключен явно (`KOMPAKT_SHLYUZOVOJ` не `false`); «не объявлен» — тоже отказ. Модуль не задан или не загрузился — сжатия нет, отказа нет. Стенд `test/stend-pdn-maska.mjs`: +3 пробы (вкл, не объявлен, выкл).

Veniamin's condition: the gateway compaction module sends the transcript to its own provider, bypassing the mask intermediary. With `GATEWAY_MASKA_PDN=1` the gateway refuses at startup (exit 2) when the compaction module is loaded and gateway compaction is not explicitly disabled (`KOMPAKT_SHLYUZOVOJ` not `false`); «undeclared» is refused too. No module or a failed load means no compaction and no refusal. Stand: +3 probes.

## 1.4.40 — B-N-1547 (1) r4, карта заглушек на ход

Обратная подстановка заглушек — только из карты ТЕКУЩЕГО хода (замечание Вениамина): каждый ход получает у посредника свою карту и свой адрес `ANTHROPIC_BASE_URL` вида `…/h/<токен>`; заглушки, созданные маской в запросах этого хода, раскрываются в ответе клиенту только этого хода. Заглушка другого разговора, пришедшая через заметку, память или файл, не раскрывается — гость видит её буквально. Карта закрывается вместе с ответом; запрос к посреднику без открытой карты — отказ 502, наружу не уходит. Общей карты процесса больше нет. Стенд `test/stend-pdn-maska.mjs`: +4 пробы (карта хода, голый адрес, закрытая карта, раздельные карты).

Reverse placeholder substitution only from the CURRENT turn's map (Veniamin's remark): each turn gets its own map and its own `ANTHROPIC_BASE_URL` (`…/h/<token>`); placeholders created in that turn's requests are revealed only in that turn's client reply. A placeholder from another conversation arriving via a note, memory or file is not revealed — the guest sees it literally. The map closes with the response; an intermediary request without an open map is refused with 502 and never forwarded. There is no process-wide map anymore. Stand `test/stend-pdn-maska.mjs`: +4 probes.

## 1.4.39 — B-N-1547 (1), маска ПДн гостя

Гостевая маска ПДн (B-N-1547): при `GATEWAY_MASKA_PDN=1` SDK ходит к поставщику через локального посредника шлюза (127.0.0.1, случайный порт), который маскирует тело запроса целиком — история, resume, сводки, tool_result, системный текст. Имя, телефоны и почты гостя из реестра (`GATEWAY_GOST_REESTR` — каталог `*.json` `{imya, telefony[], pochty[]}`) и любые телефоны/почты по образцу заменяются заглушками `⟦имя|тел|почта:id⟧`; публичные контакты из `GATEWAY_GOST_PUBLICHNYE` не трогаются. Ответ клиенту хоста раскрывает заглушки обратно (имя в ответе и документе — подстановкой на хосте, после модели). Модель — только из `GATEWAY_GOST_MODELI`, рабочий каталог — только `GATEWAY_WORK_DIR` (`cwd` конверта беседы подменяется, только если он в конверте есть; stateless-конверт не меняется); журнал шлюза маскируется тем же правилом. Непарсимое или сжатое тело, нечитаемый реестр — отказ 502, наружу не уходит; неполная настройка — отказ при старте. Новый модуль `pdn-maska.mjs`, стенд `test/stend-pdn-maska.mjs`. Не ловит: имя вне реестра, склонённые формы имени, контакты словами или в картинке; путь Codex маской не покрыт (с маской — отказ при старте). Без `GATEWAY_MASKA_PDN` поведение прежнее.
Стенд `test/stend-conversation-http.mjs`: в контекст vm добавлено `MASKA_PDN:null` — обработчик теперь читает это имя.

Guest PII mask (B-N-1547): with `GATEWAY_MASKA_PDN=1` the SDK reaches the provider through a local gateway intermediary that masks the whole request body. Registry guest names, phones and emails plus pattern-matched phones/emails become `⟦kind:id⟧` placeholders; public contacts are kept. The host client reply reveals placeholders back (names in replies and documents are substituted host-side, after the model). Model only from `GATEWAY_GOST_MODELI`, working directory only `GATEWAY_WORK_DIR` (an envelope `cwd` is replaced only when present; a stateless envelope is left unchanged); gateway log is masked by the same rule. Unparsable or compressed bodies and an unreadable registry are refused with 502; incomplete settings refuse at startup. Does not catch names outside the registry, inflected names, contacts in words or images; the Codex path is not covered. Without `GATEWAY_MASKA_PDN` behaviour is unchanged.
Stand `test/stend-conversation-http.mjs`: `MASKA_PDN:null` added to its vm context — the handler now reads this name.

## 1.4.38 — B-N-1536 r2

Поверх принятого 1.4.37 (B-N-1577 r2, Гамма): exact stop-exact и положительный SDK terminal (B-N-1536, Бета); explicit stop удерживает composer, продолжение и вспомогательный compact.
По условию У1 Вениамина закрытие хода и доказательство terminal разведены: любое `turn/completed` своей нити закрывает ход, как в 1.4.36 (несовпадение id — в журнал); доказательство для stop/replace — только terminal с точным id хода, иначе unknown → HOLD. Ранний `turn/completed` до ответа `turn/start` (буфер ≤ 8) — тот же принцип.

## 1.4.37 — B-N-1577

После неошибочного ответа RPC на pressure `turn/steer` однократное предупреждение через 300000 мс, если локальный поток шлюза/app-server не закрыт. Наблюдение сохраняется во время закрытия дочернего процесса. Журнал различает отправку RPC, привязку ACK, `turn/completed`, начало и результат закрытия. Несовпадение turn ID completion только журналируется как bound=false; любое completion в выбранной нити завершает ход, как в1.4.36. Отсутствующий ID помечается неизвестным. Никакого автоматического interrupt/restart. Необязательный `GATEWAY_STOP_WATCH_ALERT` получает сообщение через stdin, без аргументов и с окружением только PATH/LANG; предел 30000 мс/SIGKILL и 8192 байта вывода. Платформенный `turn/end` этот прибор не наблюдает. Договор и границы — `docs/STOP-WATCH.md`; три новые изолированные пробы. r2 устраняет условия У1/У2 ворот: completion после смены ID и окружение канала проверяются отдельно.

## 1.4.36 — перенумерация (A-N-1562): прежний 0.4.36, код не менялся · renumbering, code unchanged

## 0.4.36

Стенд `test/stend-inbox-gateway-races.mjs` копирует во временный каталог и `secret-redact.mjs`: с 0.4.35 его импортирует `codex-app-server.mjs`, и без него стенд падал на импорте (ERR_MODULE_NOT_FOUND) раньше первой мутации. Код шлюза не менялся.
The `test/stend-inbox-gateway-races.mjs` stand also copies `secret-redact.mjs` into its temporary directory: `codex-app-server.mjs` imports it since 0.4.35, and without it the stand failed on import before the first mutation. Gateway code is unchanged.

## 0.4.35

Одно правило на выходе: перед записью в NDJSON и stderr шлюз вычищает точные значения секретов своего процесса — подписочный токен (`GATEWAY_TOKEN_FILE`), ingress-ключ (`GATEWAY_INGRESS_KEY_FILE`), токены Codex `access_token`, `refresh_token`, `id_token` (`CODEX_HOME/auth.json`) — в буквальной, JSON-экранированной и URI-форме; файлы перечитываются при смене. Сырые поля app-server без известной формы (модели и причина подмены, статус хода, метод запроса сервера, id нити) проходят только по белому списку формы, иначе — вид и длина. Новый модуль `secret-redact.mjs`, стенд `test/stend-sekrety-vyhoda.mjs`. Не ловит секрет в иной кодировке, секреты других процессов и вывод мимо `send`/`log` (HTTP-ответы ошибок).

Single egress rule: before NDJSON and stderr writes the gateway redacts exact values of its process secrets (subscription token, ingress key, Codex `access_token`, `refresh_token`, `id_token`) in literal, JSON-escaped and URI forms, re-reading files on change. Raw app-server fields without a known shape pass only by a shape allowlist. New module `secret-redact.mjs`, stand `test/stend-sekrety-vyhoda.mjs`. Does not cover other encodings, other processes' secrets, or output bypassing `send`/`log`.

## 0.4.33

Namespace-режим deployment-стенда возвращает код 2 при NoNewPrivs=1 или недоступном sudo до startup-проб; режим без deployment-root сохраняется. Проба sudo ограничена одним вызовом и 4000 мс.
The deployment stand's namespace mode exits with code 2 for NoNewPrivs=1 or unavailable sudo before startup probes; mode without a deployment root is preserved. The sudo probe is limited to one call and 4000 ms.

Обычный A2A-вход в активный SDK-ход с exact lease и provenance-рамкой. Claude hook допускает только проверенную подпись; неподтверждённое письмо остаётся в next-turn. Общий бюджет/порядок хуков и предел Stop2/30000ms; Codex steer сериализован с cancel/pressure. Сохранены изменения принятой0.4.32.

Ordinary A2A input into an active SDK turn with exact lease binding and provenance framing. Claude hooks require verified signature provenance; unverified mail remains in next-turn. Shared hook ordering/budget, Stop2/30000ms bounds, and serialized Codex message/cancel/pressure steer. Retains accepted0.4.32 changes.

## 0.4.32

Memory-export модуль выбирается через GATEWAY_MEMORY_MODULE с пустым умолчанием. Частные диагностические ID/подсказки и deployment-пути шаблонов заменены нейтральными. Существующая машинная конфигурация применяется отдельно от публичных примеров; поведение runtime сохраняется при явной настройке прежнего модуля.
Select the memory-export module with GATEWAY_MEMORY_MODULE, empty by default. Private diagnostic IDs/hints and deployment-template paths are neutralized. Existing machine configuration is applied separately from public examples; an explicit prior module preserves runtime behavior.

## 0.4.31

Адрес базы и continuation allowlist обезличены и настраиваются; optional compaction backend не ломает старт при отсутствии/ошибке контракта. Node floor24.19.0 проверен с SQLite; status видит публичную семью gateway@. Стенды используют нейтральные данные и backend fixtures.
Database location and continuation allowlist are neutral/configurable; missing or invalid optional compaction backends no longer break startup. Node floor24.19.0 is verified with SQLite; status includes public gateway@ services. Tests use neutral data and backend fixtures.

## Документация, без перенумерации · Documentation without version reassignment

README, архитектура, настройки, guards и диагностика приведены к парным RU/EN абзацам; runtime/helpers/tests получили двуязычные комментарии. Исполняемые token/AST и данные сохранены. Перенумерация, публикация и deployment — отдельная процедура.
README, architecture, settings, guards and troubleshooting now use paired RU/EN paragraphs; runtime/helpers/tests receive bilingual comments. Executable tokens/AST and data are preserved. Version reassignment, publication and deployment are separate procedures.

## История действующих контрактов · Current-contract history

0.4.30: актуальная ветка давления/telemetry; полный источник изменения определяется кодом и историей репозитория. Документация не переносит внутренние идентификаторы монтажных заданий наружу.
0.4.30: current pressure/telemetry branch; source and repository history define the complete change. Documentation does not publish internal deployment-task identifiers.

0.4.29: вход agent-stream защищён отдельным ingress key; гостевой Claude SDK имеет instance-only builtin-tools policy и credential launcher.
0.4.29: agent-stream ingress is protected by a separate key; guest Claude SDK has an instance-only built-in-tools policy and credential launcher.

0.4.28: conversation identity v2 и безопасное разделение поколений/бесед; управление ходом и текущие SDK пути сохраняются.
0.4.28: conversation identity v2 and separation of generations/conversations; turn control and current SDK paths remain.

0.4.26–0.4.27: image protocol1 и узкая очистка bridge image history/checkpoint; совместимость bridge/gateway требует общей установки.
0.4.26–0.4.27: image protocol1 and narrow bridge-image history/checkpoint cleanup; bridge/gateway compatibility requires coordinated deployment.

0.4.22–0.4.25: основной HTTP MCP путь передаёт JSON Schema без legacy zod conversion; SDK callbacks/task control продолжают уточняться.
0.4.22–0.4.25: primary HTTP MCP forwarding preserves JSON Schema without legacy zod conversion; SDK callbacks/task control continue to evolve.

Ранние версии ввели per-agent service, resume mapping, SDK runtime separation, pressure observation, app-server control и guards сериализации. Это краткое публичное резюме; точные historical diffs доступны в git-истории, не заменены новым поведением.
Earlier releases introduced per-agent services, resume mapping, SDK-runtime separation, pressure observation, app-server control and serialization guards. This is a concise public summary; exact historical diffs remain in git history, not replaced by new behavior.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке.

- `fe7da8ad1e0c` (2026-08-23) — Первый состав пакета. `gateway.mjs` слушает только петлю (`127.0.0.1`, `GATEWAY_PORT`), принимает `POST /v1/agent-stream` и ведёт цикл модели через официальный Claude Agent SDK на подписочном токене из `GATEWAY_TOKEN_FILE` (читается на каждом запросе; `/health` — по наличию токена); внешние MCP — из `GATEWAY_MCP`, инструменты платформы — мостом по пропуску, их схемы переводятся из JSON Schema в zod (`jsonschema-to-zod.mjs`). В составе также шаблон `systemd/gateway@.service` (экземпляр на агента), `systemd/60-journal-read.conf`, образец `schedule.json` и стенд `test-schema-adapter.mjs`. · EN: Initial package: a loopback-only service on `POST /v1/agent-stream` driving the model loop through the official Claude Agent SDK with the subscription token from `GATEWAY_TOKEN_FILE`, external MCP from `GATEWAY_MCP`, the ticketed platform tool bridge with JSON Schema→zod conversion, a per-agent systemd unit template, a journal-read drop-in, sample schemas and the adapter stand.
- `0660f2d6d850` (2026-09-01) — Продолжение сессии SDK между ходами: шлюз помнит в памяти процесса до 8 бесед (ключ — хэш первого сообщения, сторож — хэш уже отданного префикса) и при росте истории отдаёт через `resume` только новые сообщения; при правке истории платформой или неудаче `resume` до первого события ход повторяется полной историей; `GATEWAY_RESUME=0` выключает, перезапуск шлюза карту теряет. Строки журнала и ошибок и ролевые метки склейки подсказки («Ассистент»/«Пользователь») переведены на русский, добавлен `README.ru.md`; стенд адаптера даёт код 2 (СЛЕПОТА), если адаптер не загрузился, и FAIL с именем случая вместо стектрейса. · EN: In-process SDK session resume across turns (up to 8 conversations keyed by the first message, prefix-hash guard, full-history fallback, disabled by `GATEWAY_RESUME=0`); log/error strings and prompt role labels switched to Russian; `README.ru.md` added; the adapter stand exits 2 when the adapter cannot load and reports named FAILs instead of stack traces.
- `bea50ea0cc0e` (2026-09-02) — Только комментарий в шапке `gateway.mjs`: имя машины установки заменено словами «главная машина»; поведение не менялось. · EN: Header comment of `gateway.mjs` only: an installation host name replaced by a neutral phrase; no behaviour change.
- `640235b32337` (2026-09-04) — В `package.json` появился `scripts.test` (`node test-schema-adapter.mjs`); стенд адаптера на отсутствующий, неразборчивый или не-массивный файл схем отвечает кодом 2 (СЛЕПОТА) с путём, а не кодом 1. · EN: `package.json` gains `scripts.test`; the adapter stand exits 2 (blindness) with the path for a missing, unparsable or non-array schema file instead of exit 1.
- `d9f42a89fb6f` (2026-09-04) — Каждая строка журнала шлюза начинается с `[subscription-gateway <версия>/<сумма>]`: версия читается из соседнего `package.json` («неизвестна», если не прочитан), сумма — первые 8 знаков sha256 самого `gateway.mjs`. · EN: Every gateway log line is prefixed with the version read from the adjacent `package.json` (or "unknown") and the first 8 hex digits of the sha256 of `gateway.mjs` itself.
- `a3053bbcd2b5` (2026-09-11) — Шлюз жёстко импортирует модуль сжатия `dsh-pamyat-kompakt` по абсолютному пути (без модуля не стартует): после хода считает занятость окна из usage, пишет в журнал ступени занятости и по `reshitKompakt` делает шлюзовое сжатие сессии (`fizicheskiyKompakt`); отказ сжатия сессию не трогает, строка подъёма называет переключатели шлюзового и платформенного сжатия. Хвост `explainExit` вместо «причина не установлена» говорит, что лимит ходов исключён или не проверен; в этой же правке из журнала пропал префикс версии/суммы (вернулся в `d65222ede906`), добавлен `.npmignore`. · EN: Hard import of the `dsh-pamyat-kompakt` module by absolute path: per-turn window occupancy, occupancy-step log lines and gateway-side session compaction via `reshitKompakt`/`fizicheskiyKompakt`, switch states in the startup line; `explainExit` no longer claims "reason not established"; the version/sum log prefix was dropped here (restored in `d65222ede906`); `.npmignore` added.
- `d65222ede906` (2026-09-14) — Граница поставщика: `GATEWAY_POSTAVSHIK` выбирает `anthropic` (прежний путь SDK, он же умолчание) или `openai` (Codex через новую зависимость `@openai/codex-sdk`), неизвестное значение — отказ при старте с кодом 3; если поставщик не сообщил расход, занятость считается неизвестной, и сжатие такт пропускает. Карта продолжения сессий хранится в SQLite (путь пока зашит) и читается при старте, мёртвая сессия опознаётся и сбрасывается; полная история длиннее 1,2 млн знаков заменяется помеченным хвостом последних сообщений (при переполнении хвост уменьшается вдвое), а первый текст-блок «Prompt is too long» при нулевом usage считается ошибкой, а не ответом. · EN: Provider boundary via `GATEWAY_POSTAVSHIK` (`anthropic` default or `openai` through `@openai/codex-sdk`, unknown value exits 3), unknown occupancy skips compaction; SQLite-persisted resume map, dead-session reset, history-tail fallback for oversized prompts, and an in-stream "Prompt is too long" with zero usage treated as an error.
- `b438f825848b` (2026-09-14) — Путь базы сессий берётся из `GATEWAY_BAZA_SESSIJ` (умолчание прежнее), файлу ставятся права 0600, строка подъёма называет путь и его источник (настройка или умолчание); отказ записи в базу называет следствие — следующий ход пойдёт полным транскриптом. · EN: Session database path from `GATEWAY_BAZA_SESSIJ` (old default kept), file mode 0600, path and its source logged at startup, write failures state their consequence.
- `0536a12237a1` (2026-09-14) — `GATEWAY_BAZA_SESSIJ` из одних пробелов считается незаданной (`.trim()`); путь базы печатается до её открытия, а неудача открытия называет путь и следствие перед падением. · EN: A whitespace-only `GATEWAY_BAZA_SESSIJ` counts as unset; the database path is logged before opening, and an open failure names the path and consequence before exiting.
- `0952a196b658` (2026-09-14) — Своя формула занятости окна из шлюза убрана: вёдра расхода и занятость берутся из модуля сжатия (`vedraPoImeni`, `polnayaZanyatost`) по имени поставщика; ветка `openai` отдаёт сырой usage Codex, приведение делает модуль. · EN: The gateway's own occupancy formula is removed; usage buckets and occupancy come from the compaction module by provider name, and the `openai` branch passes raw Codex usage.
- `76010e1b7071` (2026-09-14) — Умолчание `anthropic` для `GATEWAY_POSTAVSHIK` снято: без переменной шлюз не стартует (код 3), и отказ различает четыре случая — переменной нет, значение пустое, значение из пробелов, значение неизвестно. · EN: The `anthropic` default for `GATEWAY_POSTAVSHIK` is removed; startup refuses with exit 3 and distinguishes unset, empty, whitespace-only and unknown values.
- `fee42baf70a8` (2026-09-14) — Строка подъёма называет поставщика и источник выбора; значение, отличающееся от известного только регистром, отклоняется с отдельной причиной (сравнение остаётся регистрозависимым). · EN: The startup line names the provider and its source; a value differing from a known one only by case is refused with a dedicated reason (matching stays case-sensitive).
- `7587e84eee17` (2026-09-14) — Способ авторизации стал свойством поставщика: подписочный токен требуется только `anthropic`, `openai` проверяет читаемость `CODEX_HOME/auth.json`. `/health` отвечает по готовности выбранного поставщика (поля `postavshchik`, `avtorizaciya`, `chego_ne_hvataet`), отказ без токена называет поставщика и файл, строка подъёма — способ авторизации и неготовность. · EN: Authorization became a provider property (token only for `anthropic`, readable `CODEX_HOME/auth.json` for `openai`); `/health`, the no-token refusal and the startup line report the selected provider's readiness and what is missing.
- `502c41f4ef01` (2026-09-14) — Мост инструментов для Codex: при поставщике `openai` шлюз поднимает отдельный MCP-сервер (streamable HTTP на `GATEWAY_MCP_PORT`, по умолчанию порт шлюза + 100), который отдаёт состав инструментов текущего хода и пересылает вызовы в мост платформы. Доступ — по пропуску текущего хода в `Authorization: Bearer`, Codex получает его через переменную `DSH_MOST_PROPUSK`, а не в конфиге; пара сервер+транспорт создаётся на каждый запрос, неподнявшийся мост — громкая строка, шлюз работает дальше без инструментов. · EN: Tool bridge for Codex: with `openai` the gateway runs a separate streamable-HTTP MCP server on `GATEWAY_MCP_PORT` (default gateway port + 100) serving the current turn's tools and forwarding calls, gated by the current turn's ticket passed via `DSH_MOST_PROPUSK`.
- `18328c3e8981` (2026-09-14) — В объявление моста Codex добавлено `default_tools_approval_mode: 'approve'`: без него Codex видел инструменты, но отказывал в их вызове политикой одобрения. · EN: The Codex bridge declaration adds `default_tools_approval_mode: 'approve'`; without it Codex listed the tools but refused to call them.
- `04b0525aee6a` (2026-09-14) — Отказ моста Codex в пропуске называет случившуюся причину — хода нет, пропуск не передан, пропуск от прошлого хода, чужой пропуск; для этого запоминается пропуск предыдущего хода. · EN: The Codex bridge's ticket refusal names the actual cause (no turn, no ticket, previous turn's ticket, foreign ticket).
- `8a6a8c622654` (2026-09-14) — Мост Codex пишет в журнал каждый запрос списка (сколько инструментов отдано) и каждый вызов инструмента, так что «мост не спрашивали» отличим от отказа и ответа. · EN: The Codex bridge logs every list request (tool count) and every tool call, so "never asked" is distinguishable from refusal and success.
- `01eda3c49f64` (2026-09-14) — Отсутствующий или неполный `bridge` в теле запроса проверяется явно: шлюз пишет, чего нет (url, пропуск, инструменты), и сбрасывает текущий мост Codex; раньше чтение `body.bridge.url` бросало TypeError, в журнал шло только «мост не собран», а текущий мост не обновлялся. · EN: A missing or incomplete request `bridge` is checked explicitly, logging which parts are absent and clearing the current Codex bridge instead of failing with a TypeError.
- `12678dfd7852` (2026-09-14) — Ветка `openai` пишет в журнал решение об объявлении моста Codex: «мост ОБЪЯВЛЕН» с адресом и числом инструментов либо почему нет (сервер не поднят, нет состава хода). · EN: The `openai` branch logs whether the bridge was declared to Codex (address and tool count) or why not.
- `0e4c6f05edf6` (2026-09-15) — В строке «мост НЕ ПОДКЛЮЧЁН» различены «поля `tools` нет» и «поле `tools` не массив». · EN: The "bridge NOT connected" line distinguishes a missing `tools` field from a non-array one.
- `17f195358358` (2026-09-22) — В `gateway.mjs` дерева внесены: режим песочницы Codex из `GATEWAY_PESOCHNICA` (пусто — умолчание SDK, источник печатается); строка рабочего каталога хода с источником (тело запроса или `GATEWAY_WORK_DIR`); занятость окна Codex берётся из журнала сессии (`zanyatostIzZhurnala`), а не из накопленного за сессию usage потока, с записью, каким числом решает; для поставщиков кроме `anthropic` id сессии сохраняется только из usage движка. При сведении различение из `0e4c6f05edf6` вернулось к общему «НЕТ ПОЛЯ». · EN: Changes brought into the tree's `gateway.mjs`: Codex sandbox mode from `GATEWAY_PESOCHNICA`, logged working directory source, Codex occupancy read from the session log instead of cumulative stream usage, non-anthropic session ids saved only from engine usage; the `0e4c6f05edf6` distinction reverted to the generic wording.
- `9bb795012f51` (2026-09-22) — Claude Agent SDK и Codex SDK убраны из `dependencies`: шлюз грузит их из слоя `sdk-runtime/node_modules/` рядом с пакетом (`zagruzitSdk`; при отсутствии — отказ с командой лечения), границы версий — в `sdkCompat` `package.json`; новый `gateway-sdk.mjs` (`status`, `update anthropic|codex|all`) ставит SDK в слой и службы не перезапускает, `@modelcontextprotocol/sdk` стал явной зависимостью. `GATEWAY_EFFORT` передаётся в обе ветки (anthropic `effort`, Codex `modelReasoningEffort`) по своему перечню уровней каждой ветки; негодное значение не передаётся и называется в журнале, на ходе печатаются запрошенный и применённый уровень. · EN: Agent SDKs moved out of `dependencies` into a side `sdk-runtime/` layer loaded by `zagruzitSdk`, bounded by `sdkCompat` and managed by the new `gateway-sdk.mjs`; `GATEWAY_EFFORT` is forwarded to both branches with per-branch level lists and logged as requested vs applied.
- `8118f09007be` (2026-09-23) — Применённый уровень effort на ветке anthropic берётся из хука `Stop` SDK, а не из `system/init`; строка на `result` различает «хук не пришёл» и «пришёл без effort» и помечает «РАСХОЖДЕНИЕ». При подъёме — предупреждение, если в окружении задан `CLAUDE_CODE_EFFORT_LEVEL`; сжатие SDK (`compact_boundary`) пишется в журнал как «было → стало» токенов. · EN: The applied effort on the anthropic branch is read from the SDK `Stop` hook instead of `system/init`, with distinct "hook missing"/"no effort" cases and a "MISMATCH" mark; a startup warning for `CLAUDE_CODE_EFFORT_LEVEL`; SDK `compact_boundary` logged as before → after tokens.
- `011c4e8da438` (2026-09-30) — Стенд `test/stend-podmena.mjs` с заглушкой `test/zaglushka-app-server.mjs`: при подмене модели сервером app-server (`model/rerouted`) ход обязан кончиться исключением с именами моделей, `turn/interrupt` уходит ровно один раз, наружу не уходит ни одного ответа чужой модели. README (RU/EN) получил раздел о `test/`: в архив не входит, класть туда можно только стенды на коде пакета и заглушках, без живой подписки и живого шлюза. · EN: New stand `test/stend-podmena.mjs` with an app-server stub checks that a server-side model reroute ends the turn with an exception, sends exactly one `turn/interrupt` and leaks no foreign-model output; README (RU/EN) documents that `test/` is unpacked and limited to stub-only stands.
- `b53fa60c4c1a` (2026-10-02) — Стенд `test/stend-pressure-text.mjs`: замыкание хука `PostToolBatch` исполняется вместе с настоящими `signalDavleniya` и `vzyatB`, вырезанными из `gateway.mjs` (если они там есть). Добавлены пробы: после `/stop` хук пуст и сигнал не тратится; без `/stop` сообщение B и сигнал давления идут одной добавкой, B первым. · EN: `test/stend-pressure-text.mjs` runs the `PostToolBatch` closure with the real `signalDavleniya`/`vzyatB` cut from `gateway.mjs` and adds probes: empty after `/stop` without spending the signal, otherwise B and the pressure signal in one addition with B first.
- `872174f6b438` (2026-10-02) — Стенд `test/stend-claude-task-control.mjs` (исполняется под учёткой службы с доступом к настоящим токенам) до записи подставного токена и запуска шлюза проверяет, что `HOME`, `GATEWAY_TOKEN_FILE` и прочие пути авторизации в окружении шлюза лежат внутри его временного каталога — лексически и по реальному существующему предку с учётом symlink; иначе СЛЕПОТА, уборка и код 2, который прогон сценариев передаёт наружу. Шапка называет границу: это защита от случайного выхода путей, а не песочница от злонамеренной правки. · EN: `test/stend-claude-task-control.mjs` verifies, before writing the fake token and starting the gateway, that `HOME`, `GATEWAY_TOKEN_FILE` and other auth paths stay inside its temp directory (lexically and via the real ancestor, symlinks included), otherwise exits 2; the header states it is an accident guard, not a sandbox.
- `50a4e87af7fc` (2026-10-03) — Повторно внесена та же правка `test/stend-claude-task-control.mjs`, что в `872174f6b438`: импорт состава выпуска `cd313dd3f6fc` вернул файл к прежней редакции. · EN: Re-applies the `872174f6b438` change to `test/stend-claude-task-control.mjs` after the release import `cd313dd3f6fc` had reverted it.
