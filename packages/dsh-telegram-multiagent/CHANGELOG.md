# История изменений · Change history

## 3.1.15 — 21.10.2026 · Claude: строка расхода хода для счётчиков Автопилота

- RU: Claude: строка расхода хода для счётчиков Автопилота; participant = unix-учётка; одна строка на ход; ключ эпохи сессии. Писатель завершённого хода суммирует usage в памяти и пишет `ap-usage-hodov-v1.jsonl` рядом с ledger, 0600. Input включает cache read/write, reasoning повторно к output не прибавляется. Обрыв хода не создаёт строку; повтор callback/end не дописывает дубль. Новый sessionCreated в том же объекте Session открывает новую эпоху. Негодное ASCII-имя учётки даёт один notice на процесс, без записи. Принятый компонент Альфы `1d332cad`; сборщик и витрина Автопилота — отдельный компонент.
- EN: Claude turn-usage row for Autopilot counters; participant is the Unix account; one row per turn; deduplication includes the session epoch. Completed turns aggregate usage in memory and append `ap-usage-hodov-v1.jsonl` beside the ledger, mode0600. Input includes cache reads/writes; reasoning is not added to output twice. Aborted turns emit no row; repeated end callbacks do not duplicate it. A new sessionCreated on the same Session opens a new epoch. Invalid ASCII account names emit one notice per process and no row. Accepted Alfa component `1d332cad`; Autopilot collection/rendering is separate.

## 3.1.14 — 18.10.2026 · писатель R: обрезка и устойчивость (кандидат Альфы, к окну А AP 0.1.10)

- R-журнал ограничен по размеру общей policy (`docs/usage-runtime-policy.json` → `/etc/dsh-telegram-multiagent/usage-runtime-policy.json`, c752def4): при пределе — атомарная замена пустым файлом; недоступная policy во время записи — именованный отказ `R_POLICY_INVALID`, без fallback (e1925947, ГОДНО Вениамина 19:50:51 МСК).
- Запись больше `recordMaxBytes` пропускается с `[usage] R_RECORD_TOO_LARGE skipped=N`; после починки policy следующая запись перечитывает её без рестарта; `R_RESET_FAILED` остаётся залипающим (5e459f6f, ГОДНО 20:23:25 МСК; П7 a68cd351).
- README RU/EN и USAGE-RUNTIME: граница гонки policy и инкрементального читателя; при смене inode — пометка возможной потери (f8d57db7, ГОДНО 19:49:46 МСК).
- Новые стенды `test/stend-usage-runtime-reset.mjs`, `test/stend-usage-runtime-recovery.mjs` (+ фикстуры `usage-runtime-policy-fixture.mjs`, `usage-runtime-reset-child.mjs`). Выпуск — Искра; метка — в окне по листу А.

## 3.1.13 — 17.10.2026 · AP usage producer R (кандидат)

Неблокирующий raw-журнал actual DSH request/session/turn и native claim/end. Delivery ID — только ссылка для root-проверки почтой; metadata модели не источник. Ошибка/потеря native boundary — source_gap, без отказа исполнения. AP-normalizer/G и live окно отдельно.

## 3.1.12 — 2026-10-16 · edited_message обсуждения Анны (кандидат Альфы 2a026ad9, ГОДНО Вениамина 13:47Z; выпуск Искра)

- Единственный Telegram poller Анны с opt-in social принимает `edited_message` своего discussion. Редакция комментария сохраняется отдельным `kind=comment` с явной пометкой в тексте; первоначальное событие и принятый DSH input не заменяются.
- ID редакции содержит discussion/message/edit_date/update_id: повтор того же update не добавляет input, разные правки одной секунды различаются. Автопересылка поста канала сохраняет общий `edited_post` ID с `edited_channel_post`.
- Новый `test/stend-social-edited-message.mjs` проверяет настоящий тракт до durable DSH input на локальной платформе. Публикации и второй getUpdates не добавлены; живое подключение Анны и B-N-2027 вне кандидата. Версия package.json остаётся основой 3.1.11 до назначения общего выпуска.


## 3.1.11 — 2026-10-15 · кандидат AP-notice на линии3.1.10

- Opt-in AP ID-notice с отдельной durable-сессией, Master сохраняет primary, у шести только AP. Traffic: строгие свои имя/@ник, context0; копии не проходят admission.
- Ранний publisher/is_bot отказ ограничен AP-режимом. Без AP сохранён прежний SocialIngress, включая discussion-комментарии Channel_Bot/GroupAnonymousBot; проверки на реальном handleUpdate/SocialIngress.
- Основа3.1.10 (0a061a3b): сохранены простой Гаммы и held_by_replace Беты; native/смежные стенды проверяются на этой линии.


## 3.1.10 — 15.10.2026 · BETA-RCPT: удержанная replace-STOP почта · Replace-held mail

- Квитанция unclaimed письма из backlog завершённого replace-STOP получает `held_by_replace`; очередь и незавершённый исход сохраняются. Status показывает control-id и время; WakeGate не будит удержанное письмо.
- При первой классификации существующий outbox уведомляет отправителя; audit исключает второе уведомление. Неизвестный обратный адрес остаётся в суточной сводке reviewer. События для классификации читаются лениво после точного backlog-сопоставления.
- An unclaimed letter held by a completed replace-STOP receives `held_by_replace`, retaining its queue entry and unfinished outcome. Status shows the control and time; WakeGate respects the hold. The existing outbox notifies the sender once, deduplicated by audit. Unknown return addresses remain in the daily reviewer summary; classification events are read lazily after the exact backlog match.
- Новая таблица/оператор не вводятся; повторной подачи нет. Локальное продолжение без публикации в npm. / No new table or operator and no replay. Local continuation, not published to npm.

## 3.1.9 — 15.10.2026 · сторож простоя видит все завершённые ходы · Idle log sees all completed turns

- Момент последнего `turn/end` ставится до выходов `managedTurn` и отсутствующего `chatId`. Прежде управляемые квитанцией ходы (включая Telegram) и legacy без адреса оставляли «ходов с подъёма НЕ БЫЛО».
- Смысл простоя сохранён: давность завершения любого хода в процессе, `Math.round` минут, порог 30 минут; строка раз в 20 успешных циклов опроса. Ошибочное завершение тоже считается; chunk/message/start отметку не обновляют. После перезапуска история начинается с null.
- `test/stend-prostoya.mjs`: настоящий обработчик и цикл в одном контексте, девять сценариев. Старый код даёт 2/9, кандидат 9/9; внешние IO изолированы. Это журнал, отдельная отправка тревоги не добавляется; зависший опрос и ход до первого завершения вне этой проверки.
- Record completion before receipt/chat routing returns. The existing 30-minute idle log and 20-successful-poll cadence are unchanged; no network alert is added. Isolated regression harness covers managed/legacy routes, threshold and recovery.

## 3.1.8 — 15.10.2026 · входящее от бота отбрасывается · Inbound bot messages are dropped (Гамма; наряд Забавы; ворота Вениамина 01:44 МСК)

- `handleUpdate` (`src/index.js`): сообщение с `from.is_bot === true` отбрасывается ДО допуска, очереди, ответа и разбора медиа —
  одна строка журнала «отброшено: сообщение бота <id> в чате <chat>». Защита от петли бот↔бот в общих чатах (зеркало почты команды
  пишет ботами отправителей). Сообщения людей — как прежде, в том числе пересланный текст бота и ответ на сообщение бота.
- 🔴 Граница: обновления, которые забирает `SocialIngress` Анны (посты канала, callback, обсуждение соцсетей), идут своим путём
  и фильтром НЕ покрыты; залп от ЛЮДЕЙ в группе без записи `groups` фильтр тоже не гасит — для этого режим рабочего чата.
- Новый стенд `test/stend-from-is-bot.mjs` (Гамма): 15 проб на настоящем теле `handleUpdate`; на основе 3.1.7 — 7 проб
  «бот отброшен» красные, 5 проб «человек доходит» зелёные.
- A message whose `from.is_bot` is true is dropped before admission/queue/reply/media with one log line. Human messages are unchanged.
  Updates routed to Anna's SocialIngress are outside the filter; a human-driven group volley needs the working-chat `groups` record.

## 3.1.7 — 14.10.2026 · B-N-2021: дефис в учётке spool · Hyphenated spool accounts; подготовка к публикации · release prep

- `spoolSender` разбирает полное имя курьера по хвостам a2a-pochtalon (v1 hex/PID, ownerall, v2 SHA256), сохраняя дефисы. Битое имя не получает подсказку отправителя и не считается показанным почтальоном.
- `spoolPokazanPochtalonom` сверяет собственную учётку точным префиксом и полным хвостом, включая окончания `-ownerall`/`-v2`; при неоднозначности собственной учётки копия сохраняется. Ящик другого UID по-прежнему не подтверждает показ.
- Новый `stend-spool-agent-name` и три прежние почтовые пробы используют настоящие helpers, без копии старого regexp в фикстуре. Стык — dsh-pochta 3.1.3 и дельта штатной S6/S7 пробы v2 в обходе; номера при сведении назначает координатор.
- Имя файла остаётся подсказкой, не авторизацией. `ownerall` и 64-значный числовой v2-хвост допускают несколько разборов после переноса UID; полное удостоверение отправителя из такого имени невозможно. Совместимость с правилом почтальона не доказывает фактическую доставку его уведомления.
- Full courier-name parsing preserves hyphens; own-account prefix checks keep copies on ambiguity. The filename is a hint, not authentication or proof of an owner notification.
- `author` — «Aleksandr Argelander» (единый автор семьи; лицензия MIT на его имя) · `author` set to "Aleksandr Argelander"
- README RU/EN: номер выпуска 3.1.1 → 3.1.7 · README: own release number updated

## 3.1.6 — 13.10.2026 · B-N-2027

При включённом social только у Анны служба каждые 5 секунд читает приватную очередь socseti и передаёт каждое событие в обычную беседу «Маркетинг». Устойчивый receipt и запись входа DSH предшествуют ACK; повтор ACK не повторяет вход. Внешний текст передаётся как данные, команды Telegram/goal не исполняются. Ответ модели сам не создаёт дополнительное сообщение в группу; уведомления отправляет socseti пачками, черновики одобряются отдельно. После трёх отказов admission удержание видно и общему обработчику восстановления. Последний снятый монтаж останавливает будущие dispatch/ACK, включая ответ на уже начатое чтение очереди.


Основа — принятая 3.1.5 (65aa645b/tag dsh-telegram-multiagent-v3.1.5), включая общий порог /cs и состояние вне хода. Перенесены только social-файлы и вызовы; compact-status/context-status/все stend-cs-* сохранены побайтно.

Интеграционный stend-social-dispatch читает actual socseti через явный SOCSETI_TEST_ROOT; без него или при недоступном источнике — СЛЕПОТА rc2 до выполнения проб. Для установленного канала строка среды обхода указывает дерево socseti, соседа пакета больше не предполагает.

## 3.1.5 — 13.10.2026 · единый шаблон /cs

- Уточнение владельца 13.10 07:28 МСК: первая строка внутри и между ходами — время замера МСК, затем модель и прежние строки чисел/процентов DSH и порога. «(снято внутри хода)» добавляется к первой строке со временем. Момент не подменяется временем команды: у старой оценки DSH без timestamp выводится «время замера не установлено (МСК)».
- Если замера нет, после времени и модели выводится одна причина вместо числовых строк, до 120 графем вместе с префиксом. После сжатия прежние числа скрыты. Время снимка и причина не удалены; отдельных внутриходовых параметров для нижнего хвоста нет. По условию ворот 08:12Z при auto:false стандартная строка и внутри, и между ходами сохраняет «· осталось N · автосжатие ВЫКЛ»; старые адаптеры сохраняют прежнюю числовую оценку, с новой строкой времени.

- Живая проба Искры: /cs учитывает GATEWAY_INGRESS_KEY_FILE, как адаптер, когда поле ingressKeyFile не задано; повторно сверяет эффективный путь после await. Между ходами последний статус выводится без причин/«устарело»; отсутствие хода названо явно. При fallback времени используется только timestamp свежей native usage-опоры, а не момент команды. Техническая причина остаётся в журнале, внутри хода диагностические отказы не скрываются.

- Уточнение 07:28 МСК: пометка «(снято внутри хода)» находится в первой строке со временем; название модели и стандартные числовые строки общие. По условию ворот 08:12Z «осталось N» при auto:false находится в общей строке порога перед «автосжатие ВЫКЛ» в обоих состояниях; отдельного повторного хвоста нет, нулевой и отрицательный остаток не теряются.

## 3.1.4 — 12.10.2026 · B-N-2010: /cs внутри хода по адресу беседы

- Ворота MED 17:17Z: адаптер без callable spoolConversationFor сохраняет прежнее число DSH для Claude и Codex; диагностическое чтение выбирается только при адресной поддержке. «Замер беседы не установлен» относится к адресному адаптеру без адреса этого хода. После awaits повторно проверяется также метод адаптера. Время замера выводится по Москве с явной пометкой «МСК».

- B-N-2010: Claude /cs читает давление по тому же адресу через актуальный адаптер; после всех awaits повторно сверяются модель, адрес и native compact. Неполный замер, неизвестная эпоха или scope скрывают прежнее число.

/cs и /compact-status у Codex читают последнее давление из живого шлюза по адресу spoolConversation.forAgent из B-N-2009; показывают timestamp «снято …, внутри хода». После сжатия до свежего usage — «замера ещё нет», у адресного адаптера без адреса — «замер беседы не установлен», legacy fallback помечен «устарело». Claude читает root usage тем же адресом. Новые unit/process стенды проверяют адрес, свежесть и смешанные версии.

- B-N-2015 (Аврора, 083c149a): стенды mail-new-iskra-sadik и mail-stop-sdk-http запоминают время первого прибытия письма; повторные чтения не получают новое время. Устранено мерцание под тикающими часами, сообщения assertions сохраняют причину отказа. Runtime канала этой правкой не меняется.

- B-N-2017 (Аврора, a01910df): для принятой отметки delay_ms в подписанном статусе стоп-почты может быть отрицательным, но не ниже −clockSkewMs — это не поломка. Отметка прибытия дальше допуска или отрицательная отметка по-прежнему отвергается; у подписанного статуса отказа delay_ms может быть ниже этого предела.

- B-N-2010, проба после сжатия: новая и resumed нить Codex показывает два свежих замера до turn/completed, без продвижения mapping до конца хода; две параллельные беседы и Claude root usage проверяются отдельным process-стендом. /cs выводит причину недоступности (codexError/diagnostic reason), а Claude без Codex-настроек не получает ложную ошибку mapping. Номера сохранены, до монтажа.

- B-N-2010, условия ворот: договор stend-status-error-line теперь требует видимую причину недоступности одной строкой до120графем вместе с префиксом; при measured она отсутствует. Содержимое пути допускается; formatter ограничивает целую строку. Без читаемых публичных зависимостей CodeX/Claude process-стенды возвращают СЛЕПОТА2, wrapper сохраняет её и при любом реальном FAIL возвращает1.

- B-N-2010, раскладка боевых стендов: процессные /cs-стенды загружают extract.mjs динамически из перенесённого кода шлюза. STEND_GATEWAY_SOURCE=/opt/claude-oauth допускается: переносится только package.json, объявленные files корневые *.mjs и test/extract.mjs; каталоги профилей, SDK и node_modules не копируются. Недоступный источник или зависимости — СЛЕПОТА2 до запуска фикстуры.

- B-N-2010, четвёртый /cs-стенд: stend-cs-live-turn берёт producer из STEND_GATEWAY_SOURCE через выборочный файловый перенос, без соседнего пакета и без подавления ошибки импорта. Для него тоже нужны STEND_GATEWAY_NODE_MODULES и STEND_GATEWAY_SOURCE; отсутствующий/недоступный источник либо context-status.mjs — СЛЕПОТА2 до проверок. Негодный код доступного модуля по-прежнему является FAIL.

## 3.1.3 — 12.10.2026 · B-N-2009: ответ по адресу в тот же чат, только текст ответа

Письмо собственного шлюза с явным адресом возвращается в известную беседу этого агента: проверяются владелец файла через lstat/O_NOFOLLOW/fstat и текущее поколение channel_sessions. Без адреса, при чужой учётке или неизвестной беседе — a2a с записью в журнале. Общая учётка coders не различает Альфу, Бету и Гамму.

Адресованные группа, личка и гость получают обычный ответ в тот же чат через durable outbox spool-tg. В чат уходит только непустой текст исходов turn_completed/sdk_input_response, без служебной шапки. no_result, interrupted_unknown, canceled_before_run и прочие исходы не отправляются в этот чат; пометка владельцу сохраняется. Гость сохраняет гостевой пресет и protectSite. Для a2a и писем без адреса — прежнее reply=no. lastOrigin=a2a ставится только служебной беседе.

Пробы: stend-spool-conversation.mjs — HTTP Claude/Codex, группа и гость, чужой UID и поколение, совместимость, отдельный процесс после подачи; stend-spool-reply-outcomes.mjs — исходы, тело без шапки и переоткрытие ledger до/после доставки. Единственная строка outbox и sent_at сохраняют завершённую доставку после переоткрытия. Не гарантируется exactly-once при отправке с неизвестным сетевым ACK до записи sent_at.

Перед откатом у каждого агента на остановленном/осушенном потоке писем проверить ledger в mode=ro: SELECT count(*) FROM outbox WHERE route='spool-tg' AND sent_at IS NULL; требуется 0. Старый канал этого маршрута не знает.

## 3.1.2 — /cs и /ccc в рабочих группах (B-N-2000), курьер убирает письмо на отказе (B-N-1994), стенд курьера не пишет в /tmp машины (B-N-1993) · Заря; окно сведено 11.10

- B-N-1994 (Заря): `courier/iskra-tell` — на «ОТКАЗ публикации в ящик» письмо `/tmp/iskra-tell-<hex>.txt` на принимающей стороне тоже убирается (`rm -f $REMOTE` в обеих ветках; прежде только после «доставлено» — каждый отказ оставлял файл навсегда). Права оставляемого файла — 0600 учётки входа (scp без `-p`, источник `mktemp`; замер настоящим scp 9.6 + sftp-server, и `-O`, при umask 000) — не мировочитаем. Не ловит: обрыв ssh до этой строки. Курьер исполняется на aclaude — действует после монтажа обёрток там. Стенд `stend-courier-publication`: проба 5 «в /tmp адресата осталось 0»; основа 4/5 (2 письма), кандидат 5/5.
- B-N-1993 (Заря): стенд `stend-courier-publication` — заглушки scp/ssh кладут «удалённый» /tmp курьера в каталог стенда, а не в настоящий /tmp машины (прежде 2 письма за прогон, 397 в sadik:/tmp к 10.10). Проба 4 «новых /tmp/iskra-tell-* с меткой прогона 0»; зрячесть — по журналу заглушки scp.
- B-N-2000 (Заря; условия Вениамина 20:14Z, выбор Забавы (б)): ровно четыре канальные команды `/cs`, `/ccc`, `/compact-status`, `/compact` в рабочем чате — голая (одна во всём сообщении) тоже обращение; прежде «молчу: обращения нет», до блока команд не доходило. Исполняются в беседе ЭТОГО чата (`marshrutChata`), ответ — в него же, журнал команды называет «беседа <ключ>». Голая `/ccc`/`/compact` сжимает только при `groups.<id>.nashihBotov: 1` в СВОЁМ конфиге (сколько наших ботов в группе; Telegram списка ботов не даёт, чужие конфиги службе не читаемы — заводит тот, кто добавляет агента в группу); поля нет, не целое, не 1 или свои настройки не прочитаны — ответ «только с ником: /ccc@<ник>». Права прежние: недопущенный — прежний «ОТКАЗ чужому» с тревогой. Молчим: ник другого бота (даже с именем в тексте), «/cs лишнее», «текст /cs», голые `/switch-a`/`/switch-b`. `bezNikaKomandy` снимает ник и у команды с дефисом: `/compact-status@ник` прежде не распознавалась. `src/rabochij-chat.js`, `src/index.js`; стенд `stend-rabochego-chata`: основа 79/123, кандидат 123/123.
- Стенд `stend-voice-a2a-order` (сценарий «actual polling loop after persistence»): в контекст вырезанной `loop` подавать НАСТОЯЩИЙ `botKto` из index.js (с кешем `botMe`), а не подставу `tg.whoAmI()` — проба 10.10 07:2xZ на коде 3.1.1: 17/17; решение координатора 07:17Z — не в окно 3.1.1 (сменило бы отпечаток).

## 3.1.1 — облачный аудит, модуль №2 (A-N-1948): код ядра (Искра) — №1, №2, №9, №10, №11, №22, №12 отклонён; Заря — №3, №19, №20, №21, №23, №24; документация (Аврора) — №4–8, №10, №12, №13–18, №25 · рабочий номер 2.5.123-a1948 сведён (слово владельца 10.10 01:38)

- №1 MED — `src/message-receipts.js`: `receipt-admin discard` для `channel_unknown`/`dispatch_unknown`, если запись не выдана агенту
  (`dispatch_started=0`, без сессии и claimed_turn); прежде выхода не было — удержание навсегда, «УДЕРЖАНО» каждые сутки. Напоминание
  называет путь. Выданное агенту и записи в сессии по-прежнему не закрываются. Стенд `test/stend-zakryt-neizvestnyj.mjs`: основа 3/7, кандидат 7/7.
- №9 LOW — `src/index.js`: идентичность бота в цикле опроса — из кеша `botKto` (getMe раз на процесс), не запросом getMe каждые ~25 с.
- №11 LOW — `src/index.js`: имена legacy-записей в `out/` в прежнем формате «<мс>-…txt», но метка строго растёт внутри процесса
  (два события в одну миллисекунду не затирают друг друга). Стенды copy-decisions и legacy-outgoing-copies: `outMs` в их окружении.
- №22 LOW — `src/guest-channel.js`: модуль маски ПДн свёртки (`pdnMaskaSvertki.modul`) грузится только обычным файлом root без записи
  группе/прочим. Стенд `test/stend-maska-modul-prava.mjs` (root): основа 2/5, кандидат 5/5; живая маска Варвары грузится.
- №10 LOW — принятый риск: канал ждёт расшифровку голосового (до transcribeTimeoutMs+10 с) — комментарий B-N-1634 исправлен, описание — README.
- №12 LOW — отклонён: `<a2aDir>/out` забирает курьер `sadik-tell-poll` с aclaude (ssh + `sudo` от root; щели класса gost — от владельца щели), права 0600 ему не мешают; неточная фраза README — Авроре.
- №25 LOW — README (Аврора): голосовое в рабочей группе расшифровывается до проверки обращения.
- №2 MED — `src/index.js` (`pollReceiptDirectory`): подписанное письмо координатора, принятое (аудит `coordinator_signature_verified`), но не выданное агенту из-за отказа обработчика (`agentFor`), при повторе того же файла с теми же байтами продолжает тот же приём (как голосовое B-N-1662), а не уходит в `signature_reauthorization_required`. Граница: `dispatch_started=0`, `message_json` пуст, без `blocked`, не завершено, исходник не отпущен; повтор ПОСЛЕ выдачи по-прежнему удержан. Стенд `stend-coordinator-poll`: сценарий переписан («…continues the same admission»), добавлены пробы «replay after handoff stays held: dispatch/message» и «continuation refuses changed bytes» (1 байт тела изменён → «source changed: continuation refused», агенту не выдано); сценарии стенда независимы (FAIL одного не прячет остальные, итог `TOTAL n/m`, код 1 при любом FAIL); в окружение стенда — `node:crypto`.
- №22 — комментарий «НЕ ЛОВИТ»: каталог модуля с записью для не-root — проверяется только файл.
- Регрессия `test/vse-stendy.mjs` (основа — git worktree e4d9d200, та же раскладка): красные 7 = 7 по именам (среда без node_modules), новых нет.

- Документация (Аврора, ветка a1948-audit02-avrora r1–r7, 43989f36): README RU/EN, docs/ARCHITECTURE, GUARDS, SETTINGS, TROUBLESHOOTING — под код аудита №2: команды с правами, путь паузы, `goalA2ASenders`, `a2a-svertka`, внешние программы, состав test/, довод engines; №10 (приём ждёт расшифровку — принятый риск), №12 (`out/` забирает курьер `sadik-tell-poll`: обычной щели — от root, гостевой — `sudo -u` владельца щели), №25, `pdnMaskaSvertki.modul`, `discard` до выдачи, поле `host`.

- Стенд `stend-zakryt-neizvestnyj`: обёртка `proba` краснеет на любом возврате тела, кроме `undefined`/`true` (отказ ворот `obyortka-krasneet` 06:2xZ: «глухая обёртка в стенде, тронутом в этом выпуске»).
- Стенд `stend-voice-a2a-order` (сценарий «actual polling loop after persistence»): в vm-контекст вырезанной `loop` добавлен `botKto` (№9 заменил в `loop` прямой `tg.whoAmI()` на помощник уровня модуля) — без него стенд краснел от среды, не от кода (ворота 06:45Z; сверено на коде 3519d7b0: 16/1 → 17/17, на 2.5.122 — 17/17).

Заря (ветка audit02-zarya 6adad6b0):

- №24, №3: пять стендов (`stend-pdf-letterhead-schema`, `stend-pdf-saved-schema` — через `testPlatform(['dsh-tools'])`; `stend-mail-stop-local-sender`, `stend-mail-new-iskra-sadik` — проверка учётки `coders` до `mkdtemp`; `stend-voice-archive` — `fs.existsSync` обёртки) и два PDF-теста (`test_pdf_letterheads.py`, `test_pdf_frozen_footer.py` — без PyMuPDF) без предпосылок выходят кодом 2 «СЛЕПОТА», а не исключением с кодом 1.
- №23, №21: `courier/iskra-tell` — все пять вызовов `logger` с `|| true` (без `logger` курьер больше не обрывается кодом 127); удалённый временный файл — `/tmp/iskra-tell-<16 hex из /dev/urandom>.txt` вместо pid.
- №20: `src/send-mail-stop.mjs` — необязательное поле `host` в `sender.json` (хост или псевдоним ssh для `transport=ssh`, умолчание `sadik`; имя `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$`, иначе `sender_config_untrusted`); поле `machine` в выводе `placed` — этот хост (при `local` — имя своей машины). Конфиги без `host` работают как прежде. Стенд `stend-mail-stop-sender` проверяет поле.
- №19: `MAIL-STOP.md` — раздел «Коды выхода и вывод»: `send-mail-stop` 0/2/3, `read-mail-stop-status`, `sign-coordinator`, `observe-mail-stop` 0/2.
- `package.json` не менялся. Служба Telegram этих файлов не загружает (`send-mail-stop.mjs` — отдельный CLI, курьер — отдельный скрипт): перезапуск служб не нужен.
- Five stands and two PDF tests report blindness (exit 2) instead of throwing (exit 1) when prerequisites are missing; the courier no longer dies without `logger` and uses a random remote temp name; the stop sender takes an optional `host` for the ssh transport (default `sadik`); MAIL-STOP.md documents exit codes of the four helpers.

## 2.5.122-a1507 — A-N-1507: stend-imena больше не зовёт ворота обезличивания (класс имён снят словом владельца 09.10.2026) · stend-imena no longer calls the anonymisation gate

- `test/stend-imena.mjs` a1606a26 → 2b1116e3 (+11/−39): снята ТОЛЬКО проба «имена по готовым воротам» — вызов `/usr/local/bin/vorota-obezlichivaniya --svodka` и разбор «IMYA N/Nф». С dsh-montazh 1.0.20 эти ворота — ворота секретов, класса IMYA в них нет: по слову владельца 09.10.2026 18:33 МСК имена агентов, людей и машин больше не находка. Без штатного `test/chastnye-imena.json` стенд печатает «имена не проверяются» и это граница, а не слепота; явный или повреждённый список — по-прежнему СЛЕПОТА (код 2), список с именем — по-прежнему FAIL. Остальные пробы (who_, затенение, приветствие, умолчание) — без изменений. Замер на боевом `src/index.js`: 13 из 13, код 0, и с боевыми воротами, и с кандидатом ворот секретов (стенд их не зовёт); прежний стенд на боевых воротах — 14 из 14 (снятая проба — четырнадцатая).
- Код `src/` не менялся: перезапуск служб агентов не нужен; номер в журнале живых процессов останется 2.5.121-b1892 до их подъёма (сторож живой версии telegram не сверяет — только шлюз, мост, адаптер).
- `test/stend-imena.mjs`: the "names via the ready gate" probe is removed — since dsh-montazh 1.0.20 the gate checks secrets only and has no IMYA class (owner's word 09.10.2026: names are not a finding). Without the default list the stand reports names as out of scope, not blind; an explicit or damaged list behaves as before. `src/` unchanged; no service restart needed.

## 2.5.121-b1892 — B-N-1892 и B-N-1913: комментарий `receiptTick` обезличен; фикстура адаптера сайта — id в форме адаптера · `receiptTick` comment de-personalised; site-adapter fixture uses the adapter id form

- `src/index.js`: в комментарии к сверке квитанций снято имя агента («замер … 09.10» → «замер 09.10»); код не менялся. Ворота обезличивания по `src/index.js`: IMYA 1 → 0.
- Граница: выпуск 2.5.120-b1892 смонтирован, но метки не получил — ворота выпуска отказали на `stend-imena` (имя в этом комментарии). Метки `telegram-multiagent-v2.5.120-b1892` нет; поведение 2.5.120 и 2.5.121 одинаково.
- `test/site-adapter-fixture.py` (B-N-1913): id конверта в фикстуре — в форме адаптера `sajt-chat` `cw-<conv>-<mid>` (`cw-11-101`): адаптер с 1.0.6 проверяет его по форме. Цена: стенд telegram знает форму id адаптера `sajt-chat`; сменится форма — править обе стороны.
- `src/index.js`: agent name removed from the receipt-reconcile comment; code unchanged. Release 2.5.120-b1892 was deployed without a tag: the release gate refused it on `stend-imena`.
- `test/site-adapter-fixture.py` (B-N-1913): fixture envelope id now uses the `sajt-chat` adapter form `cw-<conv>-<mid>`; if the adapter changes that form, both sides must change.

## 2.5.120-b1892 — B-N-1892: сверка квитанций — один раз на сессию за такт · receipt reconcile once per session per tick

- `src/index.js` `receiptTick` (Заря; причина — разбор Искры 09.10): прежде для КАЖДОЙ незавершённой квитанции звался `observe(session)` → `flush` + `ledger.reconcile(session)`, а `reconcile` сверяет сразу все квитанции сессии; на длинной сессии (`telegram-a2a`: 3763 квитанции, 58 692 события) это ≈0,7 с на вызов, остановка главного потока `dsh web` ≈0,7 с × N. Теперь сверка запоминается на такт по сессии (id + createdAt) и повторяется только если строке нужен `recovered`, а сессию сверяли без него; отказ сверки повторяется каждой строке (тот же аудит). Замер на копии базы и сессии: N=11 — 7,3–7,7 с → 0,7–0,8 с, N=30 — 19,3–20,6 с → 0,75 с; вызовов `reconcile` N → 1; снимок базы после такта побайтно тот же.
- Граница: события, пришедшие в сессию посреди такта, следующие квитанции той же сессии увидят на следующем такте (≈25 с). Остаток ≈0,7 с одной сверки на длинной сессии не тронут: индекс `receipts(session_id)` не поможет (99% строк — одной сессии), сокращение `managed`/`receiptFacts` — отдельный шаг.
- `src/index.js` `receiptTick`: reconcile runs once per session per tick (keyed by id + createdAt), repeated only when a row needs `recovered`; a failed reconcile is rethrown to every row (same audit). On a copy: N=11 7.3–7.7 s → 0.7–0.8 s, N=30 19–21 s → 0.75 s; reconcile calls N → 1; post-tick database dump byte-identical. Boundary: events arriving mid-tick are seen by later rows of the same session on the next tick.

## 2.5.119-a1871 — A-N-1871: стенд предела `/goal` проверяет смысл, а не одно слово · goal-limit stand checks meaning, not one word

- `test/test-goal-control.mjs` (Аврора; ворота Вениамина): предел `GOAL_MAX_PER_HOUR` в README засчитывается рядом с единицей времени — «час», «hour» или «/ч», в любом порядке; прежде только рядом со словом «час». Число проб не менялось. Код пакета не менялся.
- Граница: README, где предел не назван рядом с единицей времени, краснеет — стенд требует, чтобы предел был назван, но не проверяет описание окна (скользящий час).
- `test/test-goal-control.mjs`: the `GOAL_MAX_PER_HOUR` limit counts in the README next to a time unit — «час», «hour» or «/ч», in either order; before, only next to «час». Probe count unchanged; package code unchanged. Limit: the stand requires the limit to be named next to a time unit, not that the window is described correctly.

## 2.5.118-a1881 — A-N-1881: письмо владельца до конца прерванного хода снова поднимает ход · A-N-1882 F07: границы диагностики · README RU/EN

Один выпуск из трёх частей (ворота Вениамина ГОДНО 22:0xZ на все три).

- `src/conversation-pause.js` 8a77e5e3 → b0d11838 (+9/−1): обычное письмо владельца после `/stop`, пришедшее ПОКА прерванный ход ещё идёт, снимало паузу (state `resuming`), но ворота побудки отказывали занятому агенту (`wake-gate.js:17/23`, `status==='running'`), а после конца хода будить было некому — письмо и всё за ним стояли до следующего входа или перезапуска. Теперь обработчик `turn/end` паузы при `resuming` и `owner_turn===null` после простоя (`agent.whenIdle()`) делает ОДНУ побудку `resumeAfterOwner` по записанному намерению; условие перепроверяется в момент побудки (`resuming` и ход владельца не начат), занятого агента ворота по-прежнему отклоняют. `restore` (побудка после перезапуска) не тронут.
- `test/stend-pause-before-idle.mjs` 43c9a82e → 76ccfca0: прерванный ход держит управляемый замок до постановки письма владельца (был `setTimeout 60`: на медленном диске ход успевал кончиться, и сценарий «до простоя» не проверялся — PASS был пустым); признак `a.status==='running'` в момент письма, иначе СЛЕПОТА (код 2); ход владельца ждётся до 3 с. Находка F03 шага 4 Гаммы (A-N-1865): на tmpfs стенд был красным, на диске — пустым зелёным.
- Чего не ловит: платформу без `agent.whenIdle` — побудка не делается, в журнал пишется строка «нет agent.whenIdle»; двойную побудку из чужих путей, кроме ворот `running`.
- A-N-1882 F07 (Михалыч): `src/index.js` 261936eb → 44e9e75f (+8) — возвращены две границы диагностики (комментарии, кода не меняют); `test/test-goal-control.mjs` dc2e523b → 60197d47.
- README (Аврора, A-N-1875 шаг 3, файлы целиком из d04ca393): `README.md` daa0ff03 → 37783c15, `README.en.md` новый 78b7df9b. Остальное из шага 3 в этот выпуск не входит.
- На заметку (класс A-N-1870): `goalA2ASenders` (`src/index.js:828`) — ключ без действия: читается в Set и печатается в строке монтажа, но ничего не разрешает и не запрещает.

## 2.5.117-b1845 — B-N-1845: копия курьера в дереве = боевой aclaude

- `courier/iskra-tell` e84bf6d1 → 0430c888 (+10/−2) — побайтно боевой `aclaude:/usr/local/bin/iskra-tell` (снят 08.10 14:2xZ, ssh aclaude-iskra):
  вызов `anna-tell` → `/opt/anna/a2a/in` (B-N-1837, рука Забавы 16:29 МСК) и режим `--new [-f <file>]` для `--coder`
  (подписанный /new кодерам через send-mail-stop.mjs) — правка Забавы, источник — `aclaude:/usr/local/bin/iskra-tell`; в дерево не попадала.
- Курьер исполняется только на aclaude (ссылки `<имя>-tell`); на sadik файл лишь входит в состав пакета. Код канала не тронут.

## 2.5.116-b1834 — B-N-1834 (Альфа): среда publication-стендов

- `test/stend-courier-publication.mjs` 5d6b7a22 → a98acf50 и `test/stend-mail-stop-publication.mjs` 838baca0 → 10574b19 (ворота Вениамина 10:00Z):
  под root — СЛЕПОТА (код 2) до создания временных ящиков; перед запуском тестового курьера из child env удаляются все SUDO_*.
  Непривилегированный запуск и sudo -u iskra сохраняют содержательные пробы. Публикатор и курьер не менялись; номер — потому что test/ в npm pack.
- Publication stands: root is BLIND (exit 2) before temp mailboxes are created; SUDO_* removed from the child env of the test courier.

## 2.5.115-b1691b — B-N-1691b остаток (Аврора): stend-svertka-maska не краснеет от UUID квитанций

- `test/stend-svertka-maska.mjs` 261f0301 → b12434ad (+3/−1): из проверки «нет 912» (цифры телефона не утекли) убираются и UUID квитанций
  («ответ по receipt <uuid>») — случайный UUID содержит «912» в ~0,59% (1 на ~171), проба краснела на исправной маске. Телефон под шаблон
  UUID не подпадает: открытый телефон → 13 из 18 у основы и кандидата. Код канала не меняется; номер — потому что test/ входит в npm pack.
- `test/stend-svertka-maska.mjs` no longer fails on receipt UUIDs: a random UUID contains "912" ~0.59% of the time; phone leaks are still caught.

## 2.5.114-b1825 — B-N-1825, публичные цены и расчёт гостю сайта

- Стенд `stend-guest-pdf` проверяет новый Site-набор API+письмо; прямые PDF/send остаются отдельными отказами с корректными аргументами и без побочных файлов/отправки. Прежние Telegram/PDF-пробы сохранены.
- Site-политика допускает `ostrov_api` как опциональный инструмент; согласованный caller `dsh-tool-bridge` 1.3.38-b1825 разрешает сайту только `catalog`, `objects`, `quote`. Identity, CRM, сохранённые планы, заявки и брони остаются закрыты.
- Ограничение globals берёт только зарегистрированные инструменты: отсутствие API не скрывает доступную `pamyat_dlya_gostej`. Telegram-набор и его PDF/send сохранены; сайту PDF/send не добавлены.
- Монтаж обоих пакетов одним окном после ворот; wrapper политики обновляется с перезапуском службы. Выпуск 2.5.114 следует после метки 2.5.113-b1691b.
- Остаток по решению координатора: quote без ограничения частоты; чтение проверено на контрактном архиве, Марку сверить после первого живого расчёта. catalog/objects публичные; живой расчёт этим CHANGELOG не объявляется проверенным.

## 2.5.113-b1691b — B-N-1691b, рабочий кандидат (поверх 2.5.112-b1814)

- Два native-стенда оператора задают собственный mkdtemp baseDirectory для VoiceTempStore через apply и удаляют его в finally; root-прогоны не используют настоящий /var/tmp.
- Проверки утечки контактов в stend-svertka-maska исключают только корректные телефонные и почтовые заглушки: случайные цифры в hex-ID больше не дают ложный отказ. Наличие маски и обнаружение открытых контактов проверяются по-прежнему.
- Код и новый стенд B-N-1814 сохранены; журналирование отказов B-N-1813 сохранено.
- SIGKILL, отказ файловой системы и будущие стенды без явного baseDirectory остаются вне этой правки.

## 2.5.112-b1814 — B-N-1814, рабочий кандидат (основа — 2.5.111-b1813 Беты)

- `receipt-admin discard` закрывает удержание `channel_interrupted`, если сообщение не выдано агенту (dispatch_started=0, без сессии и хода): исход `operator_discarded`, аудит с оператором и ссылкой; `approve-new` для этой причины по-прежнему отказ.
- Владельцу при таком закрытии: «Сообщение не было принято из-за перезапуска агента — пришлите, пожалуйста, ещё раз»; прочие закрытия — прежний текст.
- Напоминание «УДЕРЖАНО» для `channel_interrupted` называет путь: discard через receipt-admin.
- Стенд `test/stend-zakryt-prervannyj.mjs` (8 проб).

## 2.5.111-b1813 — B-N-1813, рабочий кандидат

- Отказ неизвестной или некорректной slash-команды назван в журнале; тело и аргументы сообщения не печатаются.
- Пакет сопровождает подключение штатной /compact в scoped-группы собственного компактора у marc/alfa/beta/gamma; эти профили идут отдельным монтажным составом. /ccc сохраняет штатный alias.
- Команда использует существующий ручной механизм DSH; активный ход не прерывает и на busy отвечает отказом. Модель сводки, пороги, белый список и сжатие остальных шести профилей не менялись.
- Живой монтаж и вызовы принимает координатор после ворот, при пустых ходах.

## 2.5.110 — 2026-10-07 · B-N-1799

- Два гостевых стенда убирают только свой временный каталог и при раннем process.exit(2) из helper.
- Платформа закрывается во внешнем finally; SQLite ledger Telegram-стенда закрывается при отказе проверки или конструктора.
- На обычном выходе финальная очистка выполняется после зарегистрированных exit writers. Пробы очистка → оставить → возврат различают остатки на диске после завершения ребёнка.
- Runtime относительно установленной рабочей 2.5.109-b1691 не изменён. Это выпуск стендовой правки; новый живой признак канала не заявлен. SIGKILL и произвольный более поздний writer остаются вне защиты.

## 2.5.109-b1691 — B-N-1691, рабочий кандидат

- Голосовые Telegram: отдельные каталоги разговоров 0700 вне workspace, файл 0600; отдельное задание для каждого параллельного распознавания.
- Удаление задания и пустого каталога разговора в finally; TMPDIR распознавателя направлен в задание, ошибка удаления названа в журнале.
- При старте опроса — уборка своего пространства: хвосты старше 30 минут, не более 1000 записей, неполная уборка названа.
- Гостевой openBot-вход вне allowedUsers передаёт VOICE_ARCHIVE_DISABLE=1: совместная правка transcribe-local-shared запрещает постоянный архив явно; архив владельца/команды сохранён. Стартовая уборка печатает итог даже при пустом каталоге.
- Это управление временными файлами; доступ тем же UID ограничивает отдельный sandbox. Выпуск и живой признак ещё впереди.


## 2.5.109 — выпуск рабочей 2.5.108-b1757: /new поставщику без состояния (B-N-1757, Гамма; выпуск B-N-1757)

Выпуск по слову владельца 06.10 16:57 после живого признака: 07.10 12:3xZ Забава → Петрович, control_id 63639fb4, state complete, reason new_committed; ответ Петровича 12:34Z «новая сессия открыта, знания подняты». Поверх 2.5.108 (B-N-1624/B-N-1760). Отправитель Зари сохранён, изменён приёмник `src/index.js`.

- Явный `statelessProviders` только из settings JSON, пусто по умолчанию. Для Петровича настройка отдельно: `["deepseek-direct"]`. Ни встроенных разрешённых имён, ни допуска из plugin config нет.
- Вариант А действует только без conversationIdentity: живой `agentDefaultModel.currentSelection().provider` в списке + restore v1. Без службы выбора/её selection — прежний отказ, config.provider не служит запасным допуском. Проверенный снимок используется при создании stateless-сессии.
- conversationIdentity v2 идёт прямо в прежний check(signal), до запроса модели; отказ не обходится. Известное имя шлюза claude-oauth без v2 также отказано при ошибочном включении в список.
- Новый native-стенд проверяет подписанный /new, clean session и отказы; три порчи (в том числе игнорировать список) различают guard. После монтажа нужен живой complete и первый ход новой сессии с восстановленными знаниями; отправитель Искры должен разрешать маршрут Петровича.

Release of working 2.5.108-b1757 after live sign (control 63639fb4, complete/new_committed). JSON-only default-empty stateless list requires live selected provider and restore v1; no config fallback for admission. Existing v2 check runs first unchanged. Sender code retained; sender trust for Petrovich is a separate mount step.

## 2.5.108 — выпуск рабочей 2.5.107-b1624: отправитель /new по почте; /new от Искры на sadik (B-N-1624, Заря; выпуск B-N-1760)

Выпуск по слову владельца 06.10 16:57 после живого признака: 07.10 12:04Z Искра → Заря, control_id 26a4cffa, статусы received → admitted → complete/new_committed, новая сессия с вводной (B-N-1624 закрыт). Код равен рабочей 2.5.107-b1624 (в бою с 12:02Z); в выпуске меняются только номер и записи о номере.

Слово владельца 05.10 09:26: «/new (новый разговор агенту) — нужна возможность слать мне и управляющим (Искре и т.п.) самостоятельно». Приёмник /new по почте есть с 2.5.101, а отправитель до 2.5.107 режим new отвергал (`sender_mode_denied`): живого успешного /new по почте не было ни разу. Приёмник в этом выпуске не менялся.

- **`src/send-mail-stop.mjs` — режим new.** `--mode new` принимается, если он есть в `modes` защищённой конфигурации отправителя; тело необязательно: без `--body-file` приёмник ставит стандартную вводную, с ним — вводную из файла. `pause` с телом и `replace` без тела по-прежнему отказ кодом 2 до передачи.
- **Новый стенд `test/stend-mail-new-iskra-sadik.mjs` (root).** Цепочка как на sadik: отправитель под root, `transport=local`, ящик чужого владельца → placed → MailStopReceiver → complete/new_committed; отказы: адресат вне права Искры — `no_permission`, получатель в ходу — `turn_running`, чужой ключ под `iskra-stop-1` — `signature_invalid`, отказ адаптера — `rotation_refused` с причиной в detail (как у petrovich 05.10 17:53Z).
- **Памятки.** `MAIL-STOP.md`: у Искры pause и new; на sadik отправитель Искры идёт целиком под sudo (в ящики агентов учётка iskra писать не может); граница — полный sudo у нескольких учёток. `MAIL-NEW.md`: у курьеров `--new` нет (прежняя строка описывала несуществующее); petrovich без адаптера поколений — /new ему отказ.

Release of working 2.5.107-b1624 after the first live complete /new from Iskra (07.10 12:04Z, control 26a4cffa, complete/new_committed). Sender mode new for signed mail (receiver unchanged since 2.5.101): `--mode new` with optional intro body. New root stand for Iskra's sadik chain (sender under sudo, local publication into a foreign mailbox, receiver complete and four refusals). Docs corrected: courier has no `--new`; petrovich lacks the generation capability.

## 2.5.107 — выпуск рабочей версии: PDF сохранённого расчёта и бланки (B-N-1700, B-N-1701), стенд гостевого PDF (B-N-1734)

Выпуск того, что работает в бою под рабочими номерами 2.5.106-b1700/-b1701/-b1734 (слово владельца 16:57: сначала рабочая версия, потом выпуск). Код не менялся по сравнению с боем; меняются только номер и этот раздел.

- **B-N-1700 (Бета) — PDF сохранённого расчёта.** Сохранённый расчёт `result` из plan.create/read/edit даёт видимую кликабельную ссылку, вид и дату из результата сервера. Гостевой вид — таблица строк, читаемые денежные суммы и условия без сырого JSON. Старый вход `kind/quote/guestName` сохранён и работает без постоянной ссылки. Цены не пересчитываются; кириллица/ToUnicode и прежний current-chat маршрут сохранены.
- **B-N-1701 — бланки и нижние поля.** PDF-предложение на одном из трёх принятых бланков Острова; `letterhead` выбирает общий вертикальный (по умолчанию), общий горизонтальный или юридический; каталог задаёт `pdfTemplatesDir`; бланк повторяется на продолжениях. Нижние поля: общий вертикальный — 80 pt, общий горизонтальный — 96 pt, юридический — 96 pt; тело, номера страниц и условия — выше контактного подвала (повод: однострочный title 128 символов в legal, вход SHA256 `731b241c…`, выводил таблицу на контакты). Замороженные шаблоны сохранены.
- **B-N-1734 (Искра) — стенд гостевого PDF в боевой раскладке.** `test/stend-guest-pdf.mjs` берёт мост через `test/sosedi.mjs` (`BRIDGE_CANDIDATE` или сосед дерева `../../tool-bridge`, иначе СЛЕПОТА, код 2), подставки инструментов — через `defineTool` платформы.

Release of the working version: saved-result PDF with a clickable link and readable guest tables (B-N-1700), three selectable letterheads with footer margins 80/96/96 pt (B-N-1701), guest-PDF stand in the deployed layout (B-N-1734). Code equals the deployed working build; only the version and this section change.

## 2.5.106 — B-N-1695 Ш5: PDF-расчёт и отправка гостю Telegram

По поручению Забавы и слову владельца: TG-гость получает `telegram_send_file` и `telegram_make_pdf`, без bash; site-набор прежний. Файл только PDF из `vydacha/<actual_chat_id>/`, текущий чат берётся из квитанций, не из аргумента модели. Генератор на установленном ReportLab получает kind/quote/guestName через stdin, возвращает уникальный путь; цены из API не пересчитывает. `ostrov_api` разрешён только TG-гостю для сведения с клиентом Гаммы. Частичная сумма `total:null` отказана, отмена записи убирает незавершённый PDF.

R2 исправляет собственный ToUnicode-кодек для поддержанных non-BMP символов; кириллица/эмодзи сохраняются, неизвестный шрифту glyph отказан без тихой потери. Пакет ReportLab не меняется. Условие ворот Вениамина11:47Z и решение Забавы: `telegram_make_pdf` регистрируется **только при `config.openBot===true`**. У остальных агентов прежний файловый инструмент остаётся, нового PDF-инструмента нет. Проверено native registration, actual API→PDF→sender на synthetic данных; живую Telegram-доставку выпуск не объявляет.

2.5.105 — отозвана (дефект ToUnicode).

B-N-1695: Telegram guests receive own-folder PDF generation and delivery without a shell; website capabilities stay unchanged. The PDF tool is registered only when openBot is literally true; other agents keep the existing file tool. Local UTF-16BE ToUnicode handling preserves supported non-BMP text, unsupported glyphs refuse. ReportLab and API prices are not modified. Release 2.5.105 was withdrawn for malformed ToUnicode.

## 2.5.104 — B-N-1680 (маска ПДн в свёртке наблюдателю)

B-N-1680 (решение владельца: контакты гостя моделям не передавать; находка ворот 05.10 17:19Z — свёртка a2a-svertka уходила модели наблюдателя сырой): свёртка хранит полные реплики (`parts`); при доставке наблюдателю — маска каждой полной реплики модулем маски гостевого шлюза (`pdnMaskaSvertki: {modul, reestr, belyjSpisok}`; реестр гостей и белый список владельца читаются на каждую доставку) → обрезка до 8000 → маска письма целиком. Нет настройки, нечитаемый реестр, части не сходятся с шапкой («реплик N») или чужой разговор — отказ доставки, сырой текст не уходит. Свёртка, собранная до 2.5.104 без частей, берёт их из своих ждущих строк. Маскируются только контакты — телефоны и почта; имя и ник гостя наблюдателю остаются (слово владельца 05.10 20:26 МСК; образец имён реестра не применяется). Копии владельцу (`telegram`) не маскируются. Стенд `stend-svertka-maska` (М1–М9); `stend-svertka-kopij` — маска-тождество (он проверяет механику свёртки). Не покрыто: обычный адресат `{kind:"a2a"}` (не свёртка) маской не проходит; номер Telegram-чата гостя в шапке свёртки остаётся.

B-N-1680: fold letters keep full replicas; delivery to the observer masks each replica with the guest-gateway mask module, then truncates, then masks the whole letter. Missing mask setting, unreadable registry or parts mismatch refuses delivery; raw text never leaves. Only contacts (phones, emails) are masked; guest names and nicknames stay. Owner Telegram copies are not masked. Not covered: plain `{kind:"a2a"}` copy targets; the guest Telegram chat number in the fold header.

## 2.5.103 — B-N-1624 (Альфа): переносимый стенд миграции /new

test/stend-mail-new-migration.mjs больше не импортирует модуль по пути рабочего каталога автора (`../../../../basis/…`, в 2.5.101–2.5.102 — ERR_MODULE_NOT_FOUND в дереве и в бою, единственный красный набора). Правка — коммит Альфы aa4a4fe, только telegram-файл; две её правки стендов dsh-mail-stop ставятся на aclaude отдельно. Код канала не менялся.

## 2.5.102 — B-N-1672 и состав MAIL-NEW.md

Принятая правка signature-стенда3902838 перенесена на2.5.101: отсутствие/пустой DSH_TEST_APP даёт явную слепоту/code2 до фикстуры, внутренний async deadline60000мс именует этап и убирает только собственные временные каталоги. Криптографические, audit/native и Codex проверки сохранены; успех выходит естественно, assertion остаётся ошибкой. Общий timeout vse-stendy.mjs — отдельная рука. MAIL-NEW.md добавлен в files package.json рядом с MAIL-STOP.md: существующий документ подписанного /new теперь входит в npm pack. Документ и принятые runtime правки2.5.99–101 сохранены побайтно.


### 2.5.102 — B-N-1678 (Искра): предел на стенд в test/vse-stendy.mjs

Набор стендов звал каждый стенд spawnSync без timeout — один зависший стенд держал весь набор. Теперь у стенда предел 300 с (VSE_STENDY_PREDEL_S — для проб и ручной настройки; 300 = 2× самого долгого замера 05.10: stend-mail-stop-expired-delivery нарочно ждёт 150 с), по пределу — SIGKILL стенда, строка «🔴 НЕОЖИДАННО: предел N с — <стенд>» сразу и в итоге, исход — расхождение (код набора 1), набор идёт дальше. Граница: дочерние процессы стенда не убиваются; предел на стенд, не на набор.

## 2.5.101

B-N-1624: подписанный почтовый /new для координатора и разрешённых управляющих. Идущий ход не останавливается: отказ до begin. Права Искры ограничены явными шестью адресатами. Общая ротация с Telegram, вводная в новом поколении, квота3 begin/600000ms (удержанное поколение — сверка без списания). Каждое исключение отдаёт подписанный статус; четыре admission причины названы. На restart — неизвестный исход и owner-copy без повтора эффектов; отсутствие signer/trust не останавливает polling. Перед begin повторно проверяется прежняя binding/revision и live-agent.

## 2.5.100 — B-N-1640 (читатель адресатов тревог, предел рассылки; перенос на 2.5.98)

B-N-1640 (слово владельца 05.10 11:37 МСК: «тревоги — адресатам из списка, у кого alerts=true»): у файла адресатов тревог появился читатель. Ответ наблюдателя на письмо-свёртку, начатый «🔴 ТРЕВОГА», ставится каждому сотруднику из файла `adresatyTrevogFile` (JSON настроек; только числовые `telegramUserIds`, пишет `spisok-sotrudnikov`) строкой outbox `<receipt>:trevoga:<id>` и доставляется в его чат с ботом наблюдателя — независимо от режима копий владельцу, с повторами общей очереди копий. Владелец исключается (ему тревога уходит своей копией, как прежде); «к сведению» и любой иной ответ сотрудникам не идут. Нет настройки — выключено; файл не прочитан — строка журнала «🔴 [тревога] адресаты сотрудников не прочитаны», владелец получает тревогу как прежде. Предел рассылки (условие У1 ворот, пороги назначенные): сотрудникам — не больше 1 тревоги на разговор гостя за 30 мин и 10 за сутки на всех; сверх — владельцу пометка «🔴 предел рассылки…» (`<receipt>:trevoga-predel`), сама тревога у него в копии ответа. Граница: бот может написать только тому, кто сам начал с ним разговор (каждому сотруднику с alerts=true — нажать Start у бота наблюдателя); иначе после всех попыток — строка журнала «🔴 [тревога] сотруднику НЕ доставлено…». Стенд stend-svertka-kopij С15–С24.

B-N-1640: the alert-recipients file gets a reader. An observer's «🔴 ТРЕВОГА» reply to a fold letter is queued to every staff id from `adresatyTrevogFile` (numeric ids only) as outbox `<receipt>:trevoga:<id>` and delivered to that chat regardless of the owner-copy mode; the owner is excluded (own copy as before); off when the setting is absent; an unreadable file is logged and the owner still gets the alarm.

## 2.5.98 — B-N-1662

Принятая логика B-N-1662 (2967320) перенесена на 2.5.97. В слитом разговоре более позднее обычное a2a/spool ждёт полученный, ещё не поданный voice/audio до flush/terminal либо предела 355000 мс от received_at голоса. По умолчанию: загрузка 30000 + расшифровка 300000 + завершение процесса 10000 + idle 15000 мс. По пределу удержание снимается при следующем опросе; порядок после срока не гарантируется. Стоп/task-control не проходит этот барьер. Удержание до prepare сохраняет received-квитанцию и исходник; /new и signed supersedes отменяют доказанно неподанный held-ввод, queued/unknown native proof прежний. Повтор подписанного held source продолжает только исходный admission с прежними path/байтами/audit/recipient/ledger; новый путь и changed wire отказаны. Стенд voice-a2a-order проверяет порядок, pending-TG loop, сроки, отказ, отмены и подпись. Правки 2.5.92–97 и все их стенды сохранены; изменены только index.js/receipt-runtime.js, добавлены один стенд, запись и номер.


## 2.5.97 — B-N-1619 (красная строка владельцу, дописка)

Слово владельца 09:26 МСК п.7 через Забаву 05.10 13:57Z: в строке «🔴 ход оборван» — имя агента (`; агент: <agentName>` из настройки
канала, `index.js` передаёт его в `MessageReceipts`), число неисполненных писем («Не исполнено писем: N — повтора нет; переподать, если
поручение в силе:», N пересчитывается при свёртке; перечень id остаётся, потолок 20 прежний), «сброс:» без приписок за поясом
(`chistyjSbros`: живьём 05.10 шлюз дописывал «(лимит ходов исключён: записи max_turns_reached…»). Открытая строка старого вида
(до 2.5.97) при свёртке не ломается. Стенд `stend-interrupt-owner.mjs` +6 проб (11–16).

B-N-1619: the owner line names the agent, counts unexecuted letters (recounted on fold), adds a re-send hint, and trims the reset time.

## 2.5.96 — B-N-1629

B-N-1629 (замер Михалыча 09:15Z на 2.5.85; жив на 2.5.91 и 2.5.93): статус прерывания письма из Telegram `interrupt-status:copy-tg:…` в режиме без копий владельцу (personal, в т.ч. откат при нечитаемом JSON настроек) попадал в общую ветку доставки copy-tg и бросал «режим запрещает это направление» → 5 попыток (≈755 с) → «ДОСТАВКА ИСЧЕРПАНА». Теперь он снимается по тому же условию, что пометка `interrupt-owner:` в 2.5.93: `owner_copy_mode==='personal'` при создании или текущий режим без копий; журнал «статус прерывания не отправлен: <причина>», audit `interrupt_status_skipped`. Заодно закрыто: статус, созданный в personal, после смены режима на owner-all уходил владельцу. Обычные копии в personal по-прежнему отказывают. Стенд `stend-interrupt-status-personal` (7 проб).

B-N-1629: the Telegram-letter `interrupt-status:copy-tg:…` row is now dropped under the same condition as `interrupt-owner:` in 2.5.93 (personal at creation or a current mode without owner copies) instead of retrying into exhaustion; a status created in personal is no longer sent to the owner after a mode switch. Harness `stend-interrupt-status-personal`.


## 2.5.93

B-N-1655: в owner-all копируются исходящие служебные статусы, УДЕРЖАНО, возвраты отмены и подписанные stop-status, отдельно от обычного ответа по receipt. Legacy command/error и ответы сохраняют копию в независимом outbox. Строка успешной доставки содержит точный outbox ID. Длинный Unicode-текст не разрывает surrogate pair. Reader принимает полное sender-owned зеркало `agent-outgoing-<operation>.json` от обновлённого a2a-send; исходник не считается доставкой в Telegram. Personal не заводит копий и не рассылает их задним числом. Старые зеркала до сохранённого cutoff не пересылаются автоматически.

B-N-1655 r2: принятые2.5.86–2.5.90 сохранены; совместный стенд с правилом почтальона; вне owner-all не создаются новые per-outgoing meta строки.

R2: режим каждой новой outbox-записи сохранён в owner_copy_mode; прямые interrupted writers тоже используют общий producer, свёртки разных режимов разделены. Старые NULL записи сохраняют совместимость; восстановить их исходный режим нельзя.

## 2.5.92 — B-N-1632

`stend-claude-input-signature-native.mjs` согласован с verified-only допуском gateway 1.4.44: настоящий Codex-генератор из GATEWAY_CANDIDATE даёт false → not-offered/signature-unverified/RPC0, true → offered/user-role/exactturn/RPC1; повтор false остаётся отказом. Claude crypto/audit/native next-turn, его порча/возврат и malformed-пробы сохранены. Снятие verified-gate в копии настоящего gateway1.4.44 краснит этот стенд, возврат байтов восстанавливает зелёное. Шлюз и стенд монтируются одним окном. Принятая B-N-1608 (2.5.91) сохранена; runtime Telegram не менялся. LIVE-INPUT.md: русский и английский контракт синхронизированы с gateway 1.4.44 — verified строго true в обоих путях; false → signature-unverified, отсутствующее поле/неверный тип → invalid-user-input, до Codex RPC.

## 2.5.91

B-N-1608 (живая replace-проба Варваре 05.10 11:20:40Z, control 5eccb560 → denied/remote_absence_unproved; разбор Беты b41d11f6): absent() отвергал ЛЮБУЮ нетерминальную строку mail_sdk_requests этой сессии раньше проверки последнего хода. Строки адаптера до телеметрии стоп-почты (0.1.14 не просил SDK terminal, close делал их unknown/transport_closed) после смены адаптера блокировали простой навсегда — у Варвары 16 строк ходов 32–47 при 16/16 completed turn/end. Теперь строка, чей lease не просил terminal, блокирует только пока её ход в журнале сессии не закончен completed — как отсутствующая строка (B-N-1596 r2). Признак такой строки: с 2.5.91 reason='no_telemetry' (ставится при записи, close его не затирает); у прежних — по истории их процесса: строка другого generation, unknown с transport_closed или без reason, и у этого generation нет ни одной строки с телеметрией (terminal/registered/ready, process_changed, sdk_thread_id в привязке). Строка процесса с телеметрией без terminal (настоящая потеря), строка текущего процесса без признака и незавершённый ход по-прежнему дают отказ. Строки не удаляются и не переписываются. Стенд stend-mail-stop-absent-legacy (17 проб).

B-N-1608: absent() refused on ANY unresolved mail_sdk_requests row before checking the last turn, so rows left by an adapter without mail-stop telemetry blocked idle stop forever after the adapter upgrade. A row whose lease never requested SDK terminal now blocks only until the session journal shows its turn completed, like a missing row. Such rows are marked reason='no_telemetry' since 2.5.91; older rows qualify only when their process generation left no telemetry trace. A lost terminal of a telemetry lease, an unmarked row of the current process and an unfinished turn still refuse. Rows are neither deleted nor rewritten.

## 2.5.90 — B-N-1600 шаг 0 и B-N-1659

Перенос принятой логики Зари7e89a06 на принятую2.5.89/d1cdc88. `SdkInbox.forward()` оставляет письмо без метки в очереди next-turn, проверяя default-допуск до `compatible()`, lease и выбора Claude-hook/Codex-steer. `compatible()` остаётся проверкой native ABI и не означает допуск; до этапа1 с меткой refines живой ввод закрыт для всех relay-писем, включая подписанные. Один log: «inbox: живой ввод письма без метки закрыт». Новый shag0 проверяет очередь и отсутствие новой sdk_inputs; восемь стендов механизма выдают fixture-допуск явно. Гостевая защита и память2.5.86/89, А-r2 и Б2 сохранены.

стенд local-sender: подстава приведена к раскладке боевых ящиков

B-N-1659: ключ/config fixture остались root-owned, mailbox home/in принадлежит coders. Publisher и sender не менялись; принятая правка7cf3293 перенесена без изменения поведения боя.

## 2.5.89

B-N-1644 (слово владельца 05.10 12:08 МСК, решение координатора 09:31Z): гостю (сайт и открытый Telegram-бот) допустим второй инструмент — `pamyat_dlya_gostej` (dsh-pamyat-omega ≥1.1.33, настройка `gostyam`: чтение СВОЕЙ памяти, только записи с меткой «для гостей»). `pismo_rukovoditelyu` по-прежнему обязателен; `pamyat_dlya_gostej` — допустим, не обязателен: у агента без этой настройки набор гостя остаётся ровно `pismo_rukovoditelyu`. Проверка набора и проверка моста — «обязательный ⊆ имена ⊆ разрешённые» вместо точного равенства; лишнее имя — отказ, как прежде. `tools.restrict` отказывает на незарегистрированном имени, поэтому без инструмента памяти ограничение ставится прежнее (ровно `SITE_TOOLS`); инструмент, поднявшийся после создания беседы, в ней не виден (в закрытую). Новый стенд `test/stend-gost-pamyat.mjs`.

B-N-1644: a guest (website and open Telegram bot) may additionally see `pamyat_dlya_gostej` (dsh-pamyat-omega ≥1.1.33, `gostyam` setting: reading the agent's OWN memory, only records tagged for guests). `pismo_rukovoditelyu` remains mandatory; `pamyat_dlya_gostej` is allowed but optional: without that setting the guest set stays exactly `pismo_rukovoditelyu`. The tool-set check and the bridge check become "mandatory ⊆ names ⊆ allowed" instead of exact equality; any extra name still fails. `tools.restrict` rejects unregistered names, so without the memory tool the previous restriction (exactly `SITE_TOOLS`) is applied; a tool registered after the conversation was created stays invisible there (fail closed). New harness `test/stend-gost-pamyat.mjs`.

## 2.5.88

B-N-1639 (слово владельца 05.10.2026 11:24 МСК: «Марк копии принимает к сведению, не отвечает на каждую; поднимает тревогу, когда разговор идёт не туда»): новый вид адресата копий гостя `{kind: "a2a-svertka", agent}`. Реплики наблюдателю не шлются по одной: ждут в outbox своей квитанции (route `svertka`, под сроком хранения сайта) и сворачиваются в одно a2a-письмо на разговор, когда он затих 15 мин, набрал 20 реплик, идёт 60 мин или превысил 40 000 знаков (пороги назначенные, `SVERTKA`). Шапка письма: «[к сведению: свёртка разговора сайта N, реплик K, ЧЧ:ММ–ЧЧ:ММ UTC; …]», у гостя Telegram (ключ `gost-`, 2.5.86) — «…разговора Telegram-чата N…». У получателя ответ ровно «к сведению» на свёртку владельцу не копируется (аудит `owner_copy_svedenie`), любой иной ответ — тревога — копируется как прежде. Стенд stend-svertka-kopij.

Для читателей outbox: строка ожидания — route `svertka`, `sent_at` ставится СРАЗУ (доставщик её не берёт), `error='svertka:zhdet'`; свёрнутая — `error='svertka:v:<id письма-свёртки>'`; битая — `error='svertka:bitaya'`. Заполненный `sent_at` у них НЕ означает доставки. Читатели проверены 05.10: доставщики плагина берут только `sent_at IS NULL`; `expireBodies` стирает тело строк с `sent_at` старше 30 сут — ждущую строку это заденет, только если плагин не делал тактов 30 сут (свёртка — не позже 60 мин), и тогда она уйдёт в `svertka:bitaya`; вне плагина на sadik `a2a-owner-copy-watch` смотрит только route `a2a`. Срок хранения: у сайта — срок сайта, у гостя Telegram — общий срок тел квитанций. r2: битая ждущая строка не держит свёртку остальных разговоров — снимается в `svertka:bitaya` одной строкой журнала «🔴 [копия] свёртка: битая ждущая реплика…»; сбой подготовки гостевых копий не обрывает такт (копии a2a, доставка, отчёт исчерпания идут дальше) — строка журнала «🔴 [копия] гостевые копии и свёртка не подготовлены». Стенд stend-svertka-kopij С12–С14.

B-N-1639: new guest-copy target `{kind: "a2a-svertka", agent}` — observer replicas wait in their receipt's outbox (route `svertka`, covered by site retention) and fold into one a2a letter per conversation once quiet 15 min, 20 replicas, 60 min old or 40 000 characters (assigned thresholds). On the observer side an exact «к сведению» reply to a fold letter is not copied to the owner; any other reply (an alarm) is copied as before.

For outbox readers: a waiting row is route `svertka` with `sent_at` set IMMEDIATELY and `error='svertka:zhdet'`; a folded one has `error='svertka:v:<fold id>'`, a broken one `error='svertka:bitaya'` — `sent_at` there does NOT mean delivered. Checked readers: plugin deliverers take `sent_at IS NULL` only; `expireBodies` blanks bodies of rows with `sent_at` older than 30 days, which reaches a waiting row only if the plugin made no ticks for 30 days (folding happens within 60 min), and the row then goes to `svertka:bitaya`. r2: a broken waiting row no longer blocks other conversations' folds (moved to `svertka:bitaya`, one log line); a guest-copy preparation failure no longer aborts the tick (logged). Telegram guests (`gost-` key) fold too, header «Telegram-чата N».

## 2.5.87

B-N-1637 r2 (исправление регрессии 2.5.85; решение координатора 05.10.2026 09:37Z): копия владельцу «📨 вопрос от» у письма из местного spool пропускается ТОЛЬКО если его показал почтальон — учётка в имени файла ≠ учётка ящика (правило a2a-pochtalon.py: файл владельца ящика не переносится и не показывается). Письма своей учётки (продолжения шлюза после стопа, переписка alfa/beta/gamma под общей учёткой coders) снова получают копию плагина: в 2.5.85 они были невидимы владельцу (112 из 623 местных писем за 7 суток), это поймал a2a-owner-copy-watch. Ящик, принадлежащий не процессу, — копия ставится (уверенности нет). Граница: признак показа — ИМЯ файла, не факт показа: файл, положенный хозяином ящика с чужой учёткой в имени, плагин не скопирует. Стенды stend-spool-bez-dublya-kopii (5 случаев), stend-otpravitelya-a2a.

B-N-1637 r2 (2.5.85 regression fix): the plugin skips the owner copy of a local spool letter only when the postman showed it — the file name account differs from the mailbox owner. Own-account letters (gateway continuations, coders sharing one account) get the plugin copy again; an unexpected mailbox owner keeps the copy. Boundary: the sign of display is the file NAME, not the fact of display — a file placed by the mailbox owner under another account's name is not copied by the plugin.

## 2.5.86

B-N-1642 (решение владельца 04.10 19:11: гостям — только гостевой набор): гость открытого Telegram-бота больше не получает основной пресет. Гостевой чат — личный чат не из `allowedUsers` или группа, не заведённая в `settings.groups` (чужой может добавить бота в свою группу). Ему ключ беседы `gost-<chatId>` (сессия `telegram-gost-<chatId>`, ротация `/new` префикс сохраняет), пресет `guestPreset` или `site.preset`, и та же политика инструментов, что у посетителя сайта (`site-policy.js`: только `pismo_rukovoditelyu`, поздние регистрации не видны, чужой вызов отказан). Гостевого пресета нет — гостю отказ, основной набор не выдаётся. `/new` создаёт сессию пресетом своего ключа (раньше всегда основным). Решения о беседе (ключ, «ограниченный ключ», чат из ключа, пресет) — одна фабрика `marshrutyGostya` в `guest-channel.js`; ключ беседы для всех 7 мест (сообщение, /goal, команды, /new, пауза /stop, описание картинки, поиск агента для /stop) считает её `marshrutChata`; вложения гостевой беседы при /new находятся по ключу `gost-` (`rotate-conversation.js`). Подставы стендов, вырезающие функции из `index.js`, получают эти имена из той же фабрики помощником `test/gost-kontekst.mjs` (13 файлов, правка — одна обёртка контекста). Сессии владельца, заведённых групп и a2a не меняются. Нужен мост `dsh-tool-bridge` с префиксом `telegram-gost-` в `scoped-sessions.json` — иначе гостю отказ до модели. Новый стенд `test/stend-tg-gost.mjs`. r2: гость Telegram — та же граница, что у посетителя сайта, по всем местам, различающим сессии по префиксу: письмо руководителю от гостя помечено «[источник не удостоверен; гость Telegram, чат N]», `telegram_send_file` гостю не регистрируется (список префиксов один — `OGRANICHENNYE_SESSII` в site-policy.js). Исключение из памяти — настройка ядра `isklyuchitSessii` (реестр), префикс `telegram-gost-` добавляется туда же, монтировать вместе. Стенд `stend-tg-gost.mjs` — пробы 8 и 9. r3: непонятный id чата при открытом боте (не целое, 0) считается гостевым (в закрытую), а маршрут гостя из него не строится — сообщение отказывается, а не получает ключ, который пресет и ротация не узнали бы и выдали бы основной набор (стенд, проба 2б).

B-N-1642: open-bot Telegram guests (private chats outside `allowedUsers`, unconfigured groups) get route key `gost-<chatId>` (session `telegram-gost-…`), the guest/site preset and the site tool policy instead of the main preset; no guest preset means refusal. Requires the tool bridge `telegram-gost-` scope. r2: Telegram guests get the same boundary as website visitors wherever sessions are told apart by prefix: a guest's supervisor letter is labelled «[источник не удостоверен; гость Telegram, чат N]», and `telegram_send_file` is not registered for guests (one prefix list, `OGRANICHENNYE_SESSII` in site-policy.js). Memory exclusion is the core setting `isklyuchitSessii` (registry); `telegram-gost-` must be added there and mounted together. Harness `stend-tg-gost.mjs` probes 8 and 9. r3: an unintelligible chat id on an open bot (non-integer, 0) counts as a guest (fail closed), and no guest route is built from it — the message is refused rather than given a key that preset selection and rotation would not recognise and would map to the main set (harness probe 2b).

## 2.5.85

B-N-1637 (слово владельца 05.10.2026 11:24 МСК: «найти причину двойной доставки и исправить»): письмо из местного spool (`/var/spool/a2a`) больше не получает копию владельцу «📨 вопрос от» от плагина — его уже показал почтальон `a2a-pochtalon` («← от …») в том же боте. Письма с aclaude (канал a2a, почтальона нет) копируются как прежде. Пропуск — строкой журнала «[копия] вопрос: пропуск; origin=spool». Цена: у показа почтальона одна попытка `tell-owner` без очереди повторов и обрезка до 900 знаков с путём к письму в ящике. Стенд stend-spool-bez-dublya-kopii.

B-N-1637: a local spool letter (`/var/spool/a2a`) no longer gets the plugin's «📨 вопрос от» owner copy — the `a2a-pochtalon` postman already showed it («← от …») in the same bot. aclaude letters (a2a channel, no postman) are copied as before. The skip is logged. Trade-off: the postman notice is a single `tell-owner` attempt without a retry queue, truncated to 900 characters with the mailbox path.

## 2.5.84

B-N-1619 остаток (слово владельца 05.10.2026 09:26 МСК: «красная пометка в ленте владельцу при оборванном ходе — да»): на `interrupted_unknown` в копию владельцу (`copy-tg`) ставится строка «🔴 ход оборван: <класс причины>[; сброс: …]» с перечнем писем «не исполнены (повтора нет)». Любой маршрут (a2a, tg, site) и любой `expects_reply`. Ограждения как у статуса 2.5.83: не на машинные письма (квитанции, статусы прерывания, task-control/mail-stop); свёртка по классу причины, пока строка не ушла (120 с), с потолком 20 id — дальше «… и ещё N (все id — в журнале квитанций)», полный перечень в audit `interrupt_owner_queued/folded` (замечание Вениамина: лавина обрывов не раздувает строку за 4000 знаков); для «прочее» — только вид ошибки, без сырого текста. Доставка: в режиме без копий владельцу (не owner-all/broadcast) строка снимается с записью в журнал и audit, не крутится повторами. Статус отправителю 2.5.83 не изменён. Новый стенд `test/stend-interrupt-owner.mjs`.

B-N-1619 remainder: on `interrupted_unknown` a red «🔴 ход оборван» line goes to the owner copy (`copy-tg`), folded per cause class while unsent, capped at 20 ids plus «… и ещё N» (full list in audit); machine letters excluded; no raw error text for «other». Dropped with a log line when the delivery mode gives the owner no copies. New harness `test/stend-interrupt-owner.mjs`.

B-N-1630 (слово владельца 05.10.2026 10:30 МСК: «голосовые бывают и длиннее в 2 раза, лимит точно увеличить в 2 раза»): предел расшифровки голосового 120 с → 300 с по умолчанию, задаётся `config.transcribeTimeoutMs` (неположительное — умолчание; строка в docs/SETTINGS.md). Строка ошибки в журнале называет длительность звука и предел, а исчерпание предела — «(предел исчерпан)» (живой случай 05.10 07:21:49Z: голосовое 323.7 с → ETIMEDOUT при 120 с). B-N-1634: расшифровка асинхронная (`spawn` с `detached: true` — у `execFile` параметр `detached` не доходит до `spawn`, потомок остаётся в группе родителя, замер 05.10): процесс агента не замирает на время расшифровки; по пределу гасится вся группа процессов транскрайбера (SIGTERM, через 5 с SIGKILL) — внуки обёртки `transcribe-correct-wrap` не остаются сиротами; жёсткий потолок предел+10 с: если stdout держит процесс, ушедший из группы (setsid/демон), ещё через 5 с вывод бросается (`stdout.destroy()`) и расшифровка отказывает `ETIMEDOUT` (К1 Вениамина); вывод ограничен 1 МБ, как прежде у `execFileSync`; stderr транскрайбера — в журнал агента, как прежде. Порядок Telegram-обновлений прежний: единственный цикл опроса ждёт `handleUpdate`. Новый стенд `test/stend-transcribe-predel.mjs` (STEND_SEKUNDY=1 — настоящие 130 с / 310 с).

B-N-1630: voice transcription limit 120 s → 300 s by default, configurable via `config.transcribeTimeoutMs`; the failure log names audio duration and limit. B-N-1634: transcription is asynchronous (`spawn` with `detached: true`; `execFile` does not pass `detached` to `spawn`), the agent process no longer freezes, and the whole transcriber process group is killed at the limit (SIGTERM, then SIGKILL after 5 s), with a hard ceiling of limit+10 s even if an escaped process holds stdout; output capped at 1 MB; Telegram update order unchanged. New harness `test/stend-transcribe-predel.mjs`.

## 2.5.83

Статус прерывания отправителю (B-N-1619). Ход, закрытый `interrupted_unknown` (лимит подписки, отказ API, остановка и т. п.), раньше давал сигнал только копией владельцу, если отправитель не ждал ответа (`expects_reply=0`, так у писем координатора). Теперь отправителю уходит машинный статус `[статус прерывания v1]`: класс причины, для лимитов — время сброса из текста ошибки, перечень квитанций. Свёртка: один статус на (маршрут, отправитель, класс), пока он не ушёл; отправка отложена на 2 мин, чтобы пачка прерываний легла в один. На машинные письма (ответы по receipt, сами статусы, task-control/mail-stop) статус не ставится. Маршрут a2a — туда же, куда ушёл бы ответ; tg — в копию владельцу; site — нет. Повтор письма не появился (at-most-once). Новый стенд `test/stend-interrupt-status.mjs`.

Interruption status to the sender (B-N-1619): an `interrupted_unknown` turn now queues a folded machine status (`[статус прерывания v1]`) with the cause class, reset time for limits and receipt ids, when no reply was expected; never for machine letters; no replay. New harness `test/stend-interrupt-status.mjs`.

## 2.5.82

B-N-1615 (замечание Вениамина к 2.5.80): публикаторы в ящик под root — `courier/iskra-tell` (текст на «python3 -») и `src/publish-mail-stop.py` — открывали ящик одним `open` с `O_DIRECTORY|O_NOFOLLOW`: защищено было только последнее звено, промежуточное `/opt/<агент>/a2a` агентское, его можно было увести ссылкой, и root создавал файл в чужом месте (перезаписи не было). Теперь ящик открывается проходом от «/» по звеньям: `O_DIRECTORY|O_NOFOLLOW` на каждом; звенья root — без записи группе и прочим (sticky допустим); первое не-root звено (`/opt/<дом>`) задаёт владельца, все глубже — только его. Отсутствующий ящик курьер создаёт сам — `mkdir` через дескриптор родителя, владелец родителя, 755; строки `mkdir -p … chown` и `stat` по путям из удалённой команды убраны, владелец письма берётся от дескриптора ящика. `publish-mail-stop.py`: временный каталог — тоже через дескриптор ящика, а не `mkdtemp(dir=путь)`.

Mailbox publishers running as root (`courier/iskra-tell`, `src/publish-mail-stop.py`) opened the mailbox with one `open(O_DIRECTORY|O_NOFOLLOW)`, protecting only the last component; an agent-owned intermediate directory could be swapped for a symlink. The mailbox is now reached by walking from `/` with `O_DIRECTORY|O_NOFOLLOW` per component, root components must not be group/other-writable (sticky allowed), and every component below the first non-root one must have that owner. A missing mailbox is created with `mkdir` relative to the parent descriptor; the path-based `mkdir -p … chown` and `stat` are gone. The mail-stop temporary directory is created relative to the mailbox descriptor.

## 2.5.81

Стенды, бравшие шлюз и адаптер соседями дерева (B-N-1607, B-N-1600). Шесть стендов — `stend-claude-input-signature-native`, `stend-sdk-inbox-nextturn`, `stend-sdk-receiver-r2-ack`, `-casunknown`, `-closeflush`, `stend-mail-stop-sdk-http` — импортировали `../../subscription-gateway` и `../../subscription-adapter`; в боевой раскладке `/opt/agent-plugins` соседей нет, и стенд краснел «модуль не найден». Теперь путь — через новый `test/sosedi.mjs`: `GATEWAY_CANDIDATE` и `ADAPTER_CANDIDATE`, в дереве по умолчанию соседи; нет модуля — СЛЕПОТА, код 2. Код плагина не менялся.

Harnesses that imported the gateway and adapter as tree siblings (B-N-1607): six harnesses now take them from `GATEWAY_CANDIDATE` / `ADAPTER_CANDIDATE` via the new `test/sosedi.mjs` (tree siblings by default); a missing module is blind, exit 2. Plugin code unchanged.

## 2.5.80

B-N-1609 (замечание Вениамина к 2.5.79): обычный курьер (`courier/iskra-tell`) публиковал письмо `sudo cp` в предсказуемое имя внутри ящика получателя, а ящик принадлежит агенту (775) — подложенная им ссылка увела бы запись root по ссылке. Теперь публикует короткий публикатор под root на той стороне, как `publish-mail-stop.py`: ящик открывается дескриптором (`O_DIRECTORY|O_NOFOLLOW`), временный файл `.<отправитель>-<случайное>.part` — `O_CREAT|O_EXCL|O_NOFOLLOW`, запись, владелец и права — через дескриптор, `fsync`, `renameat2` без замены; источник в `/tmp` — `O_NOFOLLOW` и владелец = `SUDO_UID`. Попутно: отказ публикации печатал «доставлено» (внешний скрипт продолжал после упавшего `sudo sh`) — теперь «ОТКАЗ публикации в ящик» и выход 1. Стенд `test/stend-courier-publication.mjs`: пробы подлога ссылки и отказа записи.

## 2.5.79

B-N-1590: reader подписанных статусов стопа принимал статус, подписанный ЛЮБЫМ ключом из trust-store: в общем trust {X,Y} статус агента Y под ключом X проходил. Теперь trust-store обязан связать каждый key_id с одним получателем (`receivers`), `verifyStopStatus` сверяет `receiver` статуса с владельцем ключа (`key_receiver_mismatch`), trust-store без связки — отказ (`status_trust_unavailable`). Переход: в `status-trust-<агент>.json` дописать `receivers` до установки reader. B-N-1583: обычный курьер (`courier/iskra-tell` и вызовы по имени) публиковал письмо через `<итог>.part` в ящике получателя — опрос ящика видел этот файл как неподдерживаемый формат и тревожил владельца; теперь временное имя с точкой в том же каталоге и атомарный `mv`, при отказе временный файл убирается. Новые стенды `test/stend-mail-stop-status-trust.mjs` (root) и `test/stend-courier-publication.mjs`. Номер 2.5.78 — за B-N-1600 (Искра).

## 2.5.78

Родной приём писем rc.2 (B-N-1600, находка Михалыча). `@deepseek-ai/dsh-agent-loop` теперь разрешается от платформы агента — `appDir` из настроек плагина (тот же якорь, что у `platformOf`; запасной — `DSH_APP_DIR`), а не от каталога плагина: в общем `/opt/agent-plugins` этого пакета нет, и родной путь в бою молча выключался, оставляя запасной next-turn. Без якоря или с неразрешимым — по-прежнему next-turn, но строка журнала называет причину: `inbox: native rc.2 admission ABI unavailable (<причина>); …`. Стенды SDK-входа передают платформу так же, как бой (`DSH_TEST_APP`); новый стенд `test/stend-sdk-inbox-yakor.mjs`.

Native rc.2 mail admission (B-N-1600): `@deepseek-ai/dsh-agent-loop` now resolves from the agent platform (`appDir` plugin setting, same anchor as `platformOf`; fallback `DSH_APP_DIR`) instead of the plugin directory, where it is absent in the shared `/opt/agent-plugins`. Without a resolvable anchor the next-turn fallback stays and the log line names the reason. SDK-input harnesses pass the platform like production does; new harness `test/stend-sdk-inbox-yakor.mjs`.

## 2.5.77

Стоп-почта (B-N-1603). С 2.5.73 резолвер цели ждёт `agentFor`; подпись control, истёкшая за это время, давала строку `admitted` с прошедшим deadline: пауза ставилась, `beginDispatch` отказывал, приёмник выходил без подписанного статуса, строка держала fence до смены процесса, а `mail-stop-hold snyat` её не брал. Теперь срок перепроверяется перед `admit`: истёкший control — `denied/expired` до fence и паузы. Отказ `beginDispatch` по любой иной причине — строка в `unknown` (`dispatch_not_started`) и подписанный `unknown` с `own_pause`; fence снимает `mail-stop-hold snyat` штатно.

## 2.5.76

Только описание (B-N-1596 r2, остаток Вениамина): `MAIL-STOP.md` перечисляет четыре исхода `unknown`, оставляющих паузу (`no_exact_sdk_lease`, `terminal_unconfirmed`, `replacement_permit_unavailable`, `replacement_admission_unknown`), порядок снятия (fence — `mail-stop-hold snyat`; пауза — сообщение владельца при `mergeChatIntoA2A`, у кодеров alfa/beta/gamma — только `mail-stop-hold snyat-pauzu`) и не ловимый случай `beginDispatch`→false: без подписанного статуса, строка остаётся `admitted` и держит fence до смены процесса. Код не менялся.

## 2.5.75

Стоп-почта (B-N-1596 r2, вердикт Вениамина по паузе Спартака). Подписанный статус `unknown` несёт поле `own_pause`: true — паузу разговора поставил этот же control, и после снятия fence (`mail-stop-hold snyat`) она остаётся; снимает её `mail-stop-hold snyat-pauzu` либо обычное сообщение владельца, если его чат слит с разговором. Сама пауза при `unknown` не снимается: исход удалённого хода неизвестен. Включает 2.5.74.

## 2.5.74

Стоп-почта, живая проба 2.5.73 на spartak (B-N-1596 r2). Replace на простаивающем удалённом агенте (claude-oauth), чей последний ход прошёл в прежнем процессе, кончался `unknown/remote_absence_unproved` и оставлял fence и паузу: доказательство отсутствия удалённого запроса требовало строку `mail_sdk_requests` в состоянии terminal для последнего хода, а у хода прежнего процесса её нет. Теперь при отсутствии такой строки доказательством служит штатный `turn/end` этого хода с `reason.kind="completed"`: адаптер завершает шаг только после `done` шлюза, а шлюз шлёт `done` после конца SDK-цикла. Прерванный или упавший последний ход, живая аренда и любая незавершённая строка по сессии — по-прежнему не доказательство. Недоказанное отсутствие теперь отказ `denied/remote_absence_unproved` ДО fence и паузы (раньше — `unknown` после них). Стенд `test/stend-mail-stop-unloaded-native.mjs`: случаи `replace-remote` и `replace-remote-aborted`.

## 2.5.73

Стоп-почта (B-N-1596, B-N-1595). Простаивающий агент, чей первичный a2a-разговор сохранён на диске, но не загружен этим процессом (после подъёма не было a2a-письма), больше не даёт `target_none`: приёмник продолжает разговор тем же путём, что и письмо (`agentFor`, создание новой сессии недостижимо), и pause/replace доходят до `complete`. Разговор, ни разу не заведённый, по-прежнему отказ. Отказ `target_none` называет причину в подписанном статусе полем `target_cause`: `holds_session`, `resume_failed`, `no_live_agent`, `session_created`, `subagent`, `cwd`. Replace получает подписанный конечный статус `complete/replacement_admitted` после принятия замены (раньше последним был `replacement_queued`). Новая настройка `mailStopOwnerCopies` (JSON настроек, умолчание `true`): `false` — исходы стопа и ответ на замену не копируются владельцу; подписанный статус не копия и не затрагивается. Новый стенд `test/stend-mail-stop-unloaded-native.mjs`.

## 2.5.72

Подписанный stop pause/replace: общий admission guard, durable fence, статусы, TTL и независимое arrival-наблюдение.

## 2.5.71 — перенумерация (A-N-1562): прежний 1.5.71, код не менялся · renumbering, code unchanged

## 1.5.71

Стенд `test/stend-imena.mjs` берёт перечень запрещённых имён из честного источника: явный путь (третий аргумент или `STEND_IMENA_FILE`), иначе соседний JSON, а при его действительном отсутствии — готовые ворота обезличивания (предел вызова 10 000 мс, буфер 1 МиБ, превышение — код 2). Нет ни одного источника — слепота, код 2, а не зелёный. Код пакета не менялся.

The `test/stend-imena.mjs` stand reads forbidden names from an honest source: an explicit path (third argument or `STEND_IMENA_FILE`), else the neighbouring JSON, else the installed de-identification gate (10 000 ms limit, 1 MiB buffer, exceeding — exit 2). No source at all is blindness (exit 2), not green. Package code is unchanged.

## 1.5.70

В режиме `owner-all` владелец получает в бот агента копию писем, которые агент сам уложил через инструмент отправки посреди хода: зеркало `<a2aDir>/polnye`, только письма со строкой «положено в щель», пометка «письмо → <адресат из имени файла>», текст целиком (длинный — частями). Копия идёт той же очередью `copy-tg`, что копии вопросов и ответов; ответ хода не дублируется. Отметка `sent_copy_since` в ledger: история зеркала не рассылается, письма вне `owner-all` после возврата режима не досылаются. Стенд `test/stend-sent-copies.mjs`, 8 проб.

In `owner-all` mode the owner receives, in the agent's bot, copies of letters the agent itself placed through the sending tool during a turn: mirror `<a2aDir>/polnye`, only letters stamped as placed, marked with the recipient from the file name, full text (long text split). Copies use the same `copy-tg` queue; the turn answer is not duplicated. A `sent_copy_since` ledger baseline prevents replaying history and backfilling letters sent outside `owner-all`. Stand `test/stend-sent-copies.mjs`, 8 probes.

## 1.5.69

Durable CAS для входа в текущий SDK-ход, admission до native claim и отдельное user/message доказательство. Unknown сохраняется между поколениями без автоповтора; known not-offered возвращается в next-turn. Сохранены исправления позднего ACK/dispose и принятая основа1.5.68.

Durable CAS for current-turn SDK input, admission before native claim, and separate user/message evidence. Unknown survives generations without automatic retries; known not-offered returns to next-turn. Retains late-ACK/dispose fixes and accepted1.5.68 baseline.

## 1.5.68 — 2026-10-04 · Нейтральная публикация / Neutral publication

Стенд платформенных прав передаёт вырезанному handleUpdate настоящий resolveOwnerId в VM-контексте. Проверки владельца, гостя и неверного owner сохранены; исправление стенда не меняет рабочий код.

The platform-permissions harness provides the extracted handleUpdate with the real resolveOwnerId through its VM context. Owner, guest, and invalid-owner assertions are preserved; this harness repair does not change production code.

Имена, пути размещения и внутренние идентификаторы убраны из исполняемых литералов и тестовых примеров. Маршруты возвратов, файл доверия, каталоги состояния и имя читателя задаются явно; нейтральные умолчания не выбирают конкретного оператора или машину. Для действующих установок нужно перенести прежние значения в конфигурацию перед обновлением. Проверки подписи, право отказа и пределы повторов сохранены.

Deployment names, paths, and internal identifiers are removed from executable literals and test examples. Return routes, trust files, state directories, and the reader label are explicit settings; neutral defaults do not select a particular operator or host. Existing installations must transfer their previous values to configuration before updating. Signature checks, refusal behavior, and retry limits are preserved.

## 1.5.67 — 2026-10-04 · Настройки владельца и ограниченная загрузка / Owner settings and bounded downloads

Координаторские префиксы читаются из JSON доставки перед config, проверяются по типу и фиксируются при монтаже. Обновление существующей установки требует явного ownerChatId и сверки с привилегиями профиля перед пакетом и перезапуском.

Coordinator prefixes are read from delivery JSON before config, type-checked, and captured at mount. Existing installations require explicit ownerChatId and verification against profile privileges before the package update and restart.

Настоящие идентификаторы и бот-ник в выбранных стендах заменены нейтральными примерами. Владелец задаётся ownerChatId без частного умолчания; owner-действия и сайт выключаются при его отсутствии. Умолчание координаторских префиксов пустое. Голосовая загрузка ограничена общим дедлайном и фактическим размером, частичный файл при отказе удаляется.

Real identifiers and the bot username in selected harnesses use neutral examples. ownerChatId configures the owner without a private default; missing values disable owner actions and the website. Coordinator prefixes default to empty. Voice downloads have an overall deadline and actual byte limit, with partial files removed on failure.

## Документация без нового номера · Documentation without a new version

Добавлены парные русские и английские описания установки, архитектуры, настроек, проверок и восстановления. Комментарии объясняют назначение и границы механизмов; история ниже сохраняет смысл прежних выпусков с обезличенными участниками и путями. Версия не назначается; новой проверки живой доставки эта запись не заявляет.

Added paired Russian and English documentation for installation, architecture, settings, checks, and recovery. Comments explain mechanism boundaries; the history below retains earlier release meanings with neutral actors and paths. No version is assigned and no new live-delivery verification is claimed.

Исторические результаты стендов не означают повторной проверки текущего кандидата. Сохранены исходный порядок версий и оговорки кандидатов; отсутствующие номера не восстановлены предположением.

Historical test results do not imply retesting of the current candidate. Original version order and candidate caveats are retained; missing releases have not been invented.

## 1.5.66 — 2026-10-03 · Изоляция сайта / Website isolation

`telegram_send_file` не регистрируется для `telegram-site-`, включая resume и новые поколения; Telegram сохраняет инструмент. Site-view содержит ровно `pismo_rukovoditelyu`, даже после поздних локальных регистраций `schedule_*` и других инструментов. Схемы и исполнение используют общий фильтр; `wireSchemas` отказывает при расхождении. Native-стенд проверяет набор после `agent/created`, подключение к живому агенту, сохранение Telegram-инструмента и запрет прямого вызова из сайта.

`telegram_send_file` is not registered for `telegram-site-`, including resume and new generations; Telegram retains it. Site views expose exactly `pismo_rukovoditelyu`, even after late local registration of `schedule_*` and other tools. Schemas and execution share a filter; `wireSchemas` rejects mismatches. Native tests cover the set after `agent/created`, live-agent adoption, retention of the Telegram tool, and denied direct website invocation.

## 1.5.65 — 2026-10-03 · Сайт и срок хранения / Website traffic and retention

Добавлен сайт: отдельные сессии, узкий preset, адресат из маршрута, устойчивые копии/ответы, команды владельца `/sss` и `/sss_on`. Договор адаптера v2 требует согласованного комплекта памяти, моста и профиля. `site-retention` очищает завершённые записи старше 30 суток с доставленными исходящими; pending остаётся. Срок файлов сессий обслуживает отдельный таймер.

Added website input with separate sessions, a narrow preset, route-derived destinations, durable copies/responses, and owner commands `/sss` and `/sss_on`. Adapter contract v2 requires compatible memory, bridge, and profile components. `site-retention` purges finished records older than 30 days whose outgoing delivery is complete; pending records remain. A separate timer governs persisted session files.

Для обычных истёкших receipts стираются также дубли текста в message_json/result_json, отправленных outbox, гостевых копиях и control-конвертах. Учёт сохраняется; используются secure_delete, порции по 50 и VACUUM после разбора накопленного не чаще раза в час.

Ordinary expired receipts also have text duplicates erased from message_json/result_json, sent outbox entries, guest copies, and control envelopes. Accounting remains; erasure uses secure_delete, batches of 50, and VACUUM after draining the backlog, at most hourly.

## 1.5.63 — 2026-10-03 · Папка гостя / Guest directory

Кандидат на основе 1.5.62 ограничивает гостя открытого бота каталогом `vydacha/<chat_id>/`. Канал создаёт его без symlink и сообщает путь агенту; привилегированные пользователи и закрытый бот сохраняют workspace-допуск. Пробы проверяют папку/config с порчей и возвратом, `/cs`, `/ccc`, `/switch-a`, `/switch-b` и настоящую `/new`-ротацию привилегированного не-владельца при openBot=true.

The candidate based on 1.5.62 confines open-bot guests to `vydacha/<chat_id>/`. The channel creates it without symlinks and tells the agent; privileged users and closed bots retain workspace access. Tests mutate and restore directory/config boundaries and exercise `/cs`, `/ccc`, `/switch-a`, `/switch-b`, and actual `/new` rotation by a privileged non-owner under openBot=true.

## 1.5.62 — 2026-10-03 · Файлы и гости / Files and guests

Добавлен scoped `telegram_send_file`: снимок файла workspace и одна multipart-попытка, документация и стенды в пакете. openBot отделяет публичный разговор от allowedUsers. `pismo_rukovoditelyu` передаёт текст только настроенному руководителю через курьер. Гостевые вопросы/итоги копируются по закреплённым адресатам через durable outbox; owner-all включает владельца, guestCopyRecipients добавляет другие цели.

Added scoped `telegram_send_file`: a workspace-file snapshot and one multipart attempt, with packaged documentation and tests. openBot separates public conversation from allowedUsers privileges. `pismo_rukovoditelyu` sends text only to the configured supervisor through the courier. Guest questions/results are copied to captured targets through a durable outbox; owner-all includes the owner and guestCopyRecipients adds targets.

Команды registry, кроме сохранённых команд канала, доступны только владельцу из mergeChatIntoA2A; goalUsers и открытый бот этого права не дают. Unknown slash, отсутствие lookup и исчезновение команды до execute дают отказ без модели. Только `/switch-a` и `/switch-b` сохраняют прежний текстовый маршрут при отсутствии обработчика. Стенд использует настоящие handleUpdate, CommandRuntime и PermissionPresetService, измеряя mode/approval владельца, гостя и открытого бота.

Registry commands, apart from retained channel commands, are restricted to the owner from mergeChatIntoA2A; goalUsers and open-bot admission do not grant that right. Unknown slash input, missing lookup, and disappearing commands are rejected without model execution. Only `/switch-a` and `/switch-b` keep their previous text route when no handler exists. Tests use actual handleUpdate, CommandRuntime, and PermissionPresetService to inspect owner, guest, and open-bot mode/approval.

## 1.5.61 — 2026-10-03 · Возобновление паузы / Pause resume

Обычный ввод человека из allowedUsers снимает паузу и получает отдельный первый ход перед накопленным. Бот, нечисловой from.id и человек вне списка её не снимают. Кандидат r6 добавляет только видимость: native queue/catalog, атомарный JSON редакции 2 с режимом 0644, обновление 60 секунд, удаление при resume. Одно A2A pause-notice идёт обратным outbox без завершения письма и ack-loop; внешние сторожа и перечень interrupted ID в `/stop` сюда не входят.

Ordinary human input from allowedUsers resumes the session and receives a separate first turn before the backlog. Bots, nonnumeric from.id, and users outside the list do not resume it. Candidate r6 adds visibility only: native queue/catalog, atomic revision-2 JSON with mode 0644, 60-second refresh, and removal on resume. One A2A pause notice uses the return outbox without completing the letter or creating an acknowledgement loop; external watchdogs and interrupted-ID lists in `/stop` are excluded.

Кандидат r5 сохраняет паузу поколения: mail/recovery/scheduler копят ввод без turn/start; контекст claimed-ввода, порядок и resume переживают restart. interrupted_unknown не replay; graceful dispose сохраняет paused inbox. `/new` создаёт неприостановленное поколение; новый stop имеет приоритет над поздним восстановлением. Кандидат r2 ждёт idle после `/stop` до 5 секунд; после подтверждения `/new` работает. cancelled_by_new сохраняет тело/время; перечень отмены содержит отправителя, приём и preview, включая delivered recurring inbox. Отмена аудируется по ID; обратный курьер не угадывает адрес, unknown remote-send даёт durable HOLD и предупреждение без автоповтора. Дополнены native-пробы, replay, целый длинный ответ и порча трёх контуров чистоты.

Candidate r5 persists generation pauses: mail/recovery/scheduler accumulate input without turn/start; claimed-input context, ordering, and resume survive restart. interrupted_unknown is not replayed; graceful disposal preserves paused inbox. `/new` creates an unpaused generation, and a new stop overrides late recovery. Candidate r2 waits up to five seconds for idle after `/stop`; confirmed completion permits `/new`. cancelled_by_new retains body/time; cancellation reports include sender, reception, and preview, including delivered recurring inbox items. Cancellation is audited by ID; return couriers never guess destinations, and unknown remote sends yield durable HOLD plus a warning without replay. Tests expand native checks, replay, complete long responses, and corruption of three isolation surfaces.

## 1.5.60 — 2026-10-02 · Кандидат ротации / Rotation candidate

`/new` создаёт поколение, поимённо отменяет active schedules, неисполненные receipts и вложения, сохраняет audit/outbox и отказывает для running/borrowed. newSessionsEnabled по умолчанию false. Независимые ворота в исходной записи ещё впереди.

`/new` creates a generation, cancels active schedules, unexecuted receipts, and attachments by identity, persists audit/outbox, and rejects running/borrowed sessions. newSessionsEnabled defaults to false. The source entry had not yet claimed independent acceptance.

## 1.5.59 — 2026-10-02 · Живая сессия / Live-session adoption

Канал заимствует живую root-сессию scheduler после проверки cwd и receipt generation, не открывая второго writer. Borrowed не даёт dispose; `/new` отказывает без ложного сброса. Receipt-hook идемпотентен. Admin допускает только discard ещё не отправленного signature_reauthorization_required, не approve-new.

The channel adopts a live root scheduler session after checking cwd and receipt generation, without opening another writer. Borrowed sessions grant no disposal right; `/new` rejects without claiming a reset. Receipt hooks are idempotent. Admin permits only discard of undispatched signature_reauthorization_required, never approve-new.

## 1.5.58 — 2026-10-02 · Ссылки и тревоги / Links and alarms

text_link на этого бота считается обращением: http/https или без схемы, ровно t.me, `/<username>` или `/@<username>` без учёта регистра. Чужой бот, ссылка на сообщение, telegram.me, иной хост, порт и tg:// не подходят. Прежние mention/text_mention/bot_command сохранены. Тревоги о чужом, cwd mismatch и невзятом письме идут только mergeChatIntoA2A-владельцу, если он в allowedUsers; иначе никому, с причиной в журнале. Стенды проверяют ссылки, исключение гостей из тревог и отсутствие владельца.

A text_link to this bot counts as addressing: http/https or no scheme, exactly t.me, and case-insensitive `/<username>` or `/@<username>`. Another bot, message links, telegram.me, other hosts, ports, and tg:// are excluded. Existing mention/text_mention/bot_command handling remains. Unauthorized-sender, cwd-mismatch, and unclaimed-mail alarms go only to the mergeChatIntoA2A owner when included in allowedUsers; otherwise nobody receives them and the reason is logged. Tests cover links, guest exclusion, and absent owners.

## 1.5.57 — 2026-10-02 · Прерывание Claude / Claude interruption

`claude-*` и `gpt-*` используют один stopRemote через `/v1/task-control`; внешний DSH-ход отменяется только после ACK шлюза, прочие модели получают отказ пути. Требуется gateway≥0.4.27 с Query.interrupt(); прежний Claude-router отвечает accepted:false, поэтому прерывание не подтверждено и внешний ход не отменяется. Пакетный стенд различает успех, unknown и неизвестную модель; сквозной receiver→adapter→gateway→SDK стенд оставался вне пакета.

`claude-*` and `gpt-*` share stopRemote through `/v1/task-control`; the external DSH turn is cancelled only after gateway ACK, while other models are rejected as unsupported. Gateway≥0.4.27 with Query.interrupt() is required; older Claude routers return accepted:false, leaving interruption unconfirmed and the external turn uncancelled. Packaged tests distinguish success, unknown, and unsupported models; the receiver→adapter→gateway→SDK integration test remained outside the package.

## 1.5.56 — 2026-10-02 · Подписанные конверты / Signed envelopes

На основу 1.5.55 перенесены Ed25519, recipient/ledger/action/срок и durable replay-защита delivery_id. Проверка предшествует управлению: unsigned — обычный текст, неверная подпись — удержание с outbox-извещением. Рабочие чаты сохранены; пилотный срок 900 секунд и согласованное включение при restart обязательны. Отправитель подписывает только с разрешённой `_OT`-меткой; другие курьеры остаются unsigned без координаторской роли. Это соглашение под общим UID, не новая изоляция; приёмник доверяет валидной подписи.

Rebased Ed25519, recipient/ledger/action/lifetime binding, and durable delivery-ID replay protection onto 1.5.55. Verification precedes control: unsigned mail is ordinary text, invalid signatures are held with outbox notices. Work groups remain; the pilot required a 900-second lifetime and coordinated restart activation. Senders sign only under approved `_OT` labels; other couriers stay unsigned without coordinator authority. This is a shared-UID convention, not new isolation; receivers trust valid signatures.

## 1.5.55 — 2026-10-02 · Рабочие группы / Work groups

Настроенный groups-чат mode=mention реагирует на ник, text_mention, `/command@username`, names с Unicode-границей слова и reply боту при replyCounts (default true). Сам бот и чужой ник не считаются обращением. Без обращения молчание для всех, включая владельца: посторонним нет отказа/тревоги, голосовые не скачиваются; при обращении прежний допуск. Последние N сообщений хранятся process-local и передаются как данные, не распоряжения; внутренние рамки вырезаются. Ненастроенные группы, личка и служебный канал не менялись. Добавлен rabochij-chat и стенд, обновлены зависимости handleUpdate-проб.

Configured groups with mode=mention respond to usernames, text_mention, `/command@username`, Unicode-word-boundary names, and replies to the bot when replyCounts is enabled (default true). The bot itself and other usernames do not count. Without addressing, everyone including owners receives silence: outsiders get no refusal/alarm and voice files are not downloaded; addressing follows existing admission. The latest N messages stay process-local and are supplied as data, not instructions; internal framing is stripped. Unconfigured groups, private chats, and service input are unchanged. Added rabochij-chat and tests and updated handleUpdate test dependencies.

## 1.5.54 — 2026-10-02 · Зрячесть шлюзовых стендов / Gateway-test visibility

Только стенды: отсутствие task-control.mjs (ENOENT) — расхождение, код 1; EACCES/EPERM — слепота, код 2 с предметом/учёткой. Наличие файла не доказывает версию; stop-route описывает gateway≥0.4.26. stend-gateway-access исполняет обе точки входа при отсутствующем файле, запрете чтения/прохода и возврате, отдельно подтверждая stat внесение порчи. Runtime и права не менялись; обновление внешнего обходчика было отдельным шагом, до которого слепота сохранялась.

Tests only: missing task-control.mjs (ENOENT) is a mismatch, exit 1; EACCES/EPERM is blindness, exit 2 identifying subject/account. File presence does not prove version; stop-route documents gateway≥0.4.26. stend-gateway-access executes both entry points for missing files, denied read/traversal, and restoration, with stat confirming mutation. Runtime and permissions are unchanged; updating the external runner was separate, with blind checks remaining until then.

## 1.5.53 — 2026-10-01 · Telegram stop / Telegram stop

`/stop` человека из allowedUsers прерывает ход через Codex turn/interrupt или native cancel с keepInbox. Команда не передаётся модели; номер ещё не адресует задачу. Claude string-prompt в этой редакции неподдержан до проверки streaming-пути.

Human `/stop` from allowedUsers interrupts through Codex turn/interrupt or native cancel with keepInbox. It does not reach the model; a trailing number does not yet select a task. Claude string-prompt remains unsupported in this release pending streaming validation.

## 1.5.52 — 2026-10-01 · Адресная отмена Codex / Targeted Codex cancellation

Добавлен typed task-control/1 в v2 для наблюдаемого текущего running-хода, отдельно от давления; совместимые gateway 0.4.23 и subscription-adapter 0.1.10. Включение явно по экземпляру: taskControlCodex=true в адаптере, default off. Служба выдаёт привязанный app-server ACK, сохраняя unknown ответа модели. Durable-учёт/outbox различает intent, no-adapter, принятие, отказ и unknown. Обычные сообщения/cancelPending не менялись; UI, модели, мост, CAS/amend/дети не добавлялись. Стенд проверяет scope/auth/повторы/гонки/timeout/ACK/intent; живой Codex, полный HTTP/DSH-driver, живой профиль, model_ack и SIGKILL нового пути вне исходной проверки.

Added typed task-control/1 in v2 for an observed current running turn, separate from pressure stops, with companion gateway 0.4.23 and subscription-adapter 0.1.10. Activation is explicit per instance through taskControlCodex=true in the adapter, default off. The service returns bound app-server ACK while retaining unknown model response. Durable accounting/outbox distinguishes intent, no adapter, acceptance, refusal, and unknown. Ordinary messages/cancelPending are unchanged; no UI, models, bridge, CAS/amend, or child controls were added. Tests cover scope/auth/retries/races/timeout/ACK/intent; live Codex, full HTTP/DSH driver, live profile, model_ack, and SIGKILL on the new path were outside original checks.

## 1.5.51 — 2026-09-30 · Квитанции без ядра / Receipts without the core

На DSH 0.2 fallback без dsh-pamyat-core пробует events, затем snapshotEvents(); ядро в приоритете. Результат обязан быть массивом, пустой допустим; отказ не превращается в пустой журнал. Граница — inheritedEventCount??seedLength??0; диагностика называет пути. Пробы проверяют обе формы, наследование, this, пустой/неверный/отказавший reader, приоритет и однократный лог; 0.1.1/0.2 требуют одинаковых фактов. Экземпляры с ядром сохраняют рабочий путь.

On DSH 0.2, fallback without dsh-pamyat-core tries events then snapshotEvents(); the core takes precedence. Results must be arrays, with empty arrays valid; failure is never treated as an empty log. The boundary is inheritedEventCount??seedLength??0, with paths named in diagnostics. Tests cover both forms, inheritance, this binding, empty/invalid/failing readers, precedence, and one-time logs; 0.1.1/0.2 must yield matching facts. Core-enabled instances retain their runtime path.

## 1.5.50 — 2026-09-30 · Изоляция стендов / Test isolation

Только стенды: platforma-02 допускает session root лишь под os.tmpdir(); `.dsh` или `/opt` дают отказ кодом 2 до создания платформы. В прежних пробах шесть receipt-стендов работали при unshare -n/EAI_AGAIN без модели и сети. Замеры времени/памяти не изменяли runtime.

Tests only: platforma-02 allows session roots only under os.tmpdir(); `.dsh` or `/opt` is rejected with exit 2 before platform creation. Earlier probes ran six receipt tests under unshare -n/EAI_AGAIN without model or networking. Timing/memory measurements changed no runtime behavior.

## 1.5.49 — 2026-09-30 · Native-платформа стенда / Native test platform

Только стенды: platforma-02 создаёт агента через Cordis Context/default-службы/agents.create, настоящий ReactLoopInbox 0.2 и core event helper, вместо извлечения Inbox 0.1/JsonlSessionPersistence по имени. Обновлены receipt-runtime, spool-дедупликация, native stat, решения без цели, supersedes-races и SIGKILL/recovery. Resume 0.2 сам закрывает оборванный ход: стенд допускает outcome=interrupted_unknown наряду с blocked, без разрешения replay.

Tests only: platforma-02 creates an agent through Cordis Context/default services/agents.create, actual 0.2 ReactLoopInbox, and the core event helper rather than name-based retrieval of Inbox 0.1/JsonlSessionPersistence. Updated receipt-runtime, spool deduplication, native stat, targetless decisions, supersedes races, and SIGKILL/recovery. Resume on 0.2 closes interrupted turns itself: tests accept outcome=interrupted_unknown alongside blocked without allowing replay.

## 1.5.48 — 2026-09-29 · DSH 0.2 / DSH 0.2

Обновлены receipts-документация и совместимость: list() допускает `{header,revision}`, ID читается как h.id??h.header?.id; create/resume setup принимает agent вторым аргументом, сохраняя 0.1.1-путь; без inspect используется stat(id), undefined означает именованный not-found. В этой редакции receipt-reader 0.2 требовал helper ядра, иначе удерживал письмо.

Updated receipt documentation and compatibility: list() supports `{header,revision}`, IDs use h.id??h.header?.id; create/resume setup accepts agent as a second argument while retaining the 0.1.1 path; absent inspect uses stat(id), with undefined reported as named not-found. In this release, 0.2 receipt observation required the core helper or held the mail.

Новая сессия сохраняет cwd/agentPreset внутри meta, откуда фабрика пишет header; неиспользуемый верхний agentPreset снят, setup по-прежнему монтирует preset. Старые журналы не переписаны. A2A-источник стал `{kind:'agent-message',form:'relay',senderSessionId:'a2a:<sender>'}`: прежние формы не проходили миграцию 0.2. Читатели моста, agent-limits и памяти обновляются согласованно не позже канала.

New sessions store cwd/agentPreset inside meta, which the factory writes into headers; unused top-level agentPreset is removed and setup still mounts presets. Old logs are not rewritten. A2A sources become `{kind:'agent-message',form:'relay',senderSessionId:'a2a:<sender>'}` because older forms failed 0.2 migration. Bridge, agent-limits, and memory readers must be updated together no later than the channel.

ReceiptFacts/WakeGate/ReceiptRuntime получают ленивый ctx.get('pamyat') без inject: согласованы events/seedLength 0.1.1 и snapshotEvents/inheritedEventCount 0.1.7+/0.2. Без helper заявлены fallback и одна диагностика, нечитаемый журнал даёт отказ. Монтаж требовал общего окна после совместимых ядра, bridge 0.3.18, agent-limits и памяти; отдельная установка не заявлена безопасной.

ReceiptFacts/WakeGate/ReceiptRuntime use lazy ctx.get('pamyat') without injection, aligning 0.1.1 events/seedLength with 0.1.7+/0.2 snapshotEvents/inheritedEventCount. Missing helpers use the documented fallback with one diagnostic; unreadable logs fail. Deployment required a coordinated window after compatible core, bridge 0.3.18, agent-limits, and memory components; isolated installation was not claimed safe.

## 1.5.47 — 2026-09-29 · Закрытие битого UTF-8 / Resolving invalid UTF-8

Admin discard ROOT ID OPERATOR REFERENCE завершает неисполненное invalid_utf8 как operator_discarded, аудирует решение и отвечает «не исполнялось». approve-new запрещён. Раньше удержание было незакрываемым и сохраняло занятость. Завершённый исходник переносится в released/; hold-текст называет discard после ручной сверки. Стенд использует настоящие pollReceiptDirectory и receipt-admin.

Admin discard ROOT ID OPERATOR REFERENCE closes unexecuted invalid_utf8 as operator_discarded, audits the decision, and reports no execution. approve-new is prohibited. Previously the hold could not be resolved and kept the agent busy. Resolved sources move into released/; hold text names discard after manual reconciliation. Tests use actual pollReceiptDirectory and receipt-admin.

## 1.5.46 — 2026-09-28 · Описание изображений / Image descriptions

describeCommand запускается как `<command> <file>` для фото/image-документов. Изображение передаётся сразу, описание после enqueue идёт отдельной async-дописью через execFile: default describeTimeoutMs=120000, ошибки/timeout/пустота сообщаются; unset выключает описатель с логом. Описание ограничено 4000 знаками с пометкой усечения и рамкой недоверенных данных; внутренние <<< и >>> заменяются. Удачное описание предупреждает о возможных ошибках модели, особенно в числах, требуя сверки файла или ответа человека; рамка не гарантирует защиты от внушения.

describeCommand runs as `<command> <file>` for photos/image documents. Images enqueue immediately; descriptions follow as separate asynchronous execFile input: default describeTimeoutMs=120000, with errors/timeouts/empty results reported; unset disables the describer with a log. Descriptions are limited to 4000 characters with marked truncation and untrusted-data framing; internal <<< and >>> are replaced. Successful descriptions warn of model errors, especially numbers, and require checking the file or asking a human; framing does not guarantee injection protection.

Допись не имеет receipt: сбой до неё теряет описание, но сохраняет файл/путь. Восстановление как Telegram-ввод владельца или иной route было бы неверным. Видео/стикеры/анимации не описываются. Стенд реального handler проверяет порядок приёма без ожидания описателя, отказные ветви и предупреждение до рамки.

The follow-up has no receipt: a crash before it loses the description but retains the file/path. Recovering it as owner Telegram input or another route would be wrong. Videos/stickers/animations are not described. Actual-handler tests check intake without waiting for descriptions, failure paths, and warning placement before the frame.

## 1.5.45 — 2026-09-27 · Тихая capability-проба / Quiet capability probe

Валидная capability_probe с reply_channel=ledger сохраняет ответ только в machineReplyBody, без A2A-outbox/ownerReplyBody и копии владельцу. Ответ подтверждает режим; нужен согласованный A2A-v2-клиент. Старые пробы без явного режима/обычные задачи сохраняют маршруты; отправленное и pending не удаляются. Reader действует после загрузки процессом. Стенд проверяет тишину и сохранение прежних A2A/copy-tg.

A valid capability_probe with reply_channel=ledger stores only machineReplyBody, without A2A-outbox/ownerReplyBody or owner copies. Responses confirm the mode; a compatible A2A-v2 client is required. Older probes without explicit mode/ordinary tasks retain routes; sent and pending items are not deleted. Readers take effect after process loading. Tests check silence and preservation of previous A2A/copy-tg behavior.

## 1.5.44 — 2026-09-26 · Извещение о настоящем удержании / Actual-hold notifications

acceptEnvelope не отправляет преждевременное «УДЕРЖАНО» при awaiting_cancellation: исход определяет cancelPending того же прохода. Настоящее удержание сообщает holdCancellation, несостоявшуюся обработку — holdTick. Окончательные admission-отказы invalid_metadata/superseded_before_arrival продолжают извещать сразу; обновлены соответствующие стенды.

acceptEnvelope no longer sends premature held notices for awaiting_cancellation: cancelPending resolves the outcome in the same pass. holdCancellation reports actual holds, and holdTick covers processing that did not occur. Final admission rejections such as invalid_metadata/superseded_before_arrival still notify immediately; corresponding tests were updated.

## 1.5.43 — 2026-09-26 · Решение без цели / Targetless decisions

Неназванная/отсутствующая цель выпускает решение как no_target_released/target_absent_released. Pending-цель отменяется; running/finished дают удержание/«поздно». Неверные ledger UUID/supersedes ID не выпускаются. Если допустимая отмена пришла раньше цели, цель удерживается superseded_before_arrival; негодная отмена не подавляет настоящее решение.

An unspecified/missing target releases a decision as no_target_released/target_absent_released. Pending targets are cancelled; running/finished targets yield held/too-late handling. Invalid ledger UUID/supersedes IDs are not released. Valid cancellation arriving first holds its target as superseded_before_arrival; invalid cancellation cannot suppress a genuine decision.

Без изменения runtime возвращена оговорка: возраст письма измеряет пребывание в этом ящике, не задержку до него. Обёртка resume-cwd принимает только undefined/true из пробы, отвергая false/{ok:false}, которые прежде проходили без исключения.

Without runtime changes, restored the caveat that mail age measures time in this inbox, not earlier delay. The resume-cwd wrapper accepts only undefined/true from test bodies, rejecting false/{ok:false} that previously passed without exceptions.

## 1.5.42 — 2026-09-26 · Отправитель A2A / A2A attribution

Отправитель a2a/in определяется filename-prefix до `-<digits>`, не самим каналом. a2aCoordinatorPrefixes получают прежнюю координаторскую метку; прочие имена очищаются от знаков вне букв/цифр/._-. Заголовок копии ответа берёт ту же метку. Это учёт, не authentication; spool не менялся. Добавлен стенд отправителя.

a2a/in attribution uses the filename prefix before `-<digits>`, not the channel itself. a2aCoordinatorPrefixes retain coordinator labels; other names have characters outside letters/digits/._- replaced. Response-copy headers use the same label. This is attribution, not authentication; spool is unchanged. Added sender tests.

## 1.5.41 — 2026-09-25 · Возврат тела стенда / Test-body returns

Только обёртки четырёх стендов UTF-8/причины/свежесть/уборка: возврат кроме undefined теперь означает отказ. Отбрасывание return прежде допускало ложное зелёное; runtime пакета не менялся.

Only wrappers for four UTF-8/reason/freshness/cleanup tests changed: returning anything except undefined now rejects the test. Ignoring returns previously allowed false passes; package runtime is unchanged.

## 1.5.40 — 2026-09-25 · Фоновые отказы / Background failures

Catch добавлен в фоновую побудку и регистрацию compact-status: ошибки wake/observe/SQLite/waitService/register теперь журналируются, не становятся unhandled rejection с fatal load failure/exit службы. Finally-уборка сохранена; основной loop уже ловил отказ и не менялся. Стенд извлекает реальные блоки.

Added catches to background wakes and compact-status registration: wake/observe/SQLite/waitService/register errors are logged rather than becoming unhandled rejections that trigger fatal load failure/service exit. Finally cleanup remains; the main loop already handled failures and is unchanged. Tests extract actual blocks.

## 1.5.39 — 2026-09-25 · Ошибка уведомления / Notification failure

Telegram-уведомление об обрыве хода имеет catch с причиной. Прежний void tg.send не защищён синхронным try; network/429/403 давали unhandled rejection и падение службы. A2A/другие send сохраняют обработчики; добавлена проба отказа уведомления.

Telegram interrupted-turn notices now have a cause-reporting catch. Synchronous try did not protect the previous void tg.send; network/429/403 failures caused unhandled rejections and service exit. A2A/other sends retain handling; added notification-failure tests.

## 1.5.38 — 2026-09-24 · Время claim / Claim timestamp

claimed_at хранит event time DSH, не момент сверки; audit claimed содержит turn/taken_at/recovered. Добавление столбца без смены user_version допускает откат чтения к 1.5.37. Старые/неизвестные строки NULL, не 0; audit отличает старое от нового claim без time. status отдаёт поле после инициализации схемы службой. Стенд добавлен, внешний receipt-watch ещё не читает claimed_at. interrupted_unknown здесь не меняется.

claimed_at stores DSH event time, not reconciliation time; claimed audit includes turn/taken_at/recovered. Adding the column without changing user_version permits reading with 1.5.37. Old/unknown rows are NULL, not zero; audit distinguishes old records from new claims missing timestamps. Status exposes the field after service schema initialization. Added tests; external receipt-watch does not yet consume claimed_at. interrupted_unknown is unchanged here.

## 1.5.37 — 2026-09-24 · Битый UTF-8 в ledger / Invalid UTF-8 in the ledger

Битое письмо сохраняется blocked=invalid_utf8 до отказа разбора, получает hold-извещения 0/1/24 часа и суточную сводку; файл остаётся человеку. Раньше исключение до receive оставляло только повторяемый log без receipt/уведомления. Повтор лога подавлен по письму/причине; receiptReplyHeader безопасен для битого raw. celyjUtf8/mailEnvelope.celyj сохраняют самодостаточность извлечённых функций; добавлен стенд.

Invalid mail persists as blocked=invalid_utf8 before parsing rejection, receiving hold notices at 0/1/24 hours and daily summaries; its file remains for human review. Previously, exceptions before receive left only repeated logs without receipts/notices. Logging is deduplicated by letter/reason; receiptReplyHeader handles invalid raw safely. celyjUtf8/mailEnvelope.celyj keep extracted functions independent; added tests.

## 1.5.36 — 2026-09-24 · Resume cwd / Resume cwd

До setup/publish проверяется cwd сессии. Mismatch/unknown даёт именованный отказ и owner-alert, без fallback create/переписывания header. Тревога — одна на session/cwd за процесс, 5 секунд на адресата; дальше log. Чужие сессии требуют отдельной ротации до монтажа; добавлен стенд.

Session cwd is checked before setup/publish. Mismatch/unknown causes named refusal and owner-alert without fallback create/header rewriting. Alerts are limited to one per session/cwd per process and five seconds per recipient; further failures remain logged. Foreign sessions require separate rotation before installation; added tests.

## 1.5.35 — 2026-09-23 · Короткая причина / Bounded error lines

configError/windowError сводятся в строку до 120 Unicode code points вместе с многоточием. Графемы сохраняют emoji/диакритику; короткий текст не меняется. Новый статусный стенд подхватывается runner; codexError всё ещё не выводится.

configError/windowError become single lines up to 120 Unicode code points including ellipsis. Grapheme boundaries preserve emoji/diacritics; short text is unchanged. The runner discovers the new status test; codexError remains unrendered.

## 1.5.34 — 2026-09-23 · Exported API стенда / Exported test API

Только stend-supersedes-race использует test-platform: Inbox из корня dsh-agent, не неэкспортируемого глубокого пути. Нет платформы — слепота, код 2; src не менялся.

Only stend-supersedes-race switches to test-platform: Inbox comes from the dsh-agent root rather than an unexported deep path. Missing platform means blindness, exit 2; src is unchanged.

## 1.5.33 — 2026-09-23 · Семантика статуса / Status semantics

Статус различает auto:false, отсутствие/несколько engine-ответов и configError. Числа/проценты сохранены; при выключенном сжатии остаток заменён явной пометкой. Добавлен смысловой стенд. Документирован SIGKILL-угол К2 между remove и подтверждённым flush, способный прервать общий ход.

Status distinguishes auto:false, absent/multiple engine responses, and configError. Values/percentages remain; disabled compaction replaces remaining capacity with an explicit label. Added semantic tests. Documented the K2 SIGKILL window between remove and confirmed flush that can interrupt the shared turn.

## 1.5.32 — 2026-09-23 · Отмена pending-решения / Pending-decision cancellation

К2 использует native inbox.remove с проверкой session_id/session_created/ledger. Intent до remove; A завершается и B выпускается лишь после flush. Running A удерживает B, finished A означает «поздно»; unknown/обрыв не разрешает replay. Цель должна быть в decision_index: не семантический отзыв прозы и не откат внешних эффектов. Новая миграция не нужна, используются К1/user_version=2.

K2 uses native inbox.remove after session_id/session_created/ledger checks. Intent precedes remove; A completes and B releases only after flush. Running A holds B, finished A is too late; unknown/interruption permits no replay. Targets must exist in decision_index: this is neither semantic prose revocation nor side-effect rollback. No new migration is needed; K1/user_version=2 is used.

Стенд гонки проверяет обе очерёдности, порчу с возвратом и SIGKILL recovery. test-platform и четыре receipt-стенда получают DSH_TEST_APP; обновлены порог/snapshot/команды контекста. Исходная запись не заявляла окончательную приёмку объединения или live-монтаж; смысловой status-стенд ещё не включён.

Race tests cover both orders, mutation/restoration, and SIGKILL recovery. test-platform and four receipt tests use DSH_TEST_APP; threshold/snapshot/context-command checks were updated. The original entry claimed neither final combined acceptance nor live deployment; semantic status tests were not yet included.

## 1.5.31 — 2026-09-23 · Приём v2 / V2 admission

К1 распознаёт/удерживает v2, мигрируя ledger в user_version=2. Capability_probe-ответ формируется приёмником с UUID; отмена — К2. Admin status read-only; rollback-v1 отказывает при unresolved-конвертах, SQLite/WAL holders и неполном /proc. Перед старым JS уполномоченно откатываются все мигрировавшие ledger; подмена старой копией запрещена. Ворота были сообщены координатором, live-монтаж этой записью не заявлен.

K1 recognizes/holds v2 and migrates the ledger to user_version=2. Receivers generate capability_probe responses with UUIDs; cancellation is K2. Admin status is read-only; rollback-v1 rejects unresolved envelopes, SQLite/WAL holders, and incomplete /proc scans. Before older JS is restored, authorized rollback must cover every migrated ledger; replacement with old copies is prohibited. Acceptance was reported by the coordinator; this entry claims no live deployment.

## 1.5.30 — 2026-09-23 · След входа в ход / Turn-admission trace

entered_turn называет received_at/flushed_at/released_at/taken_at/lag_ms. lag_ms=taken_at−released_at — только последний участок; весь путь taken_at−received_at. Сбой после COMMIT до print теряет log, не receipt. Добавлен lag-стенд. Версия поднята после расхождения кода под старым 1.5.29; отдельной записи 1.5.29 в источнике нет.

entered_turn reports received_at/flushed_at/released_at/taken_at/lag_ms. lag_ms=taken_at−released_at measures only the final interval; the full path is taken_at−received_at. A crash after COMMIT before printing loses the log, not the receipt. Added lag tests. Versioning was corrected after divergent code under old 1.5.29; the source has no separate 1.5.29 entry.

## 1.5.28 — 2026-09-20 · Два поля обрыва / Two interruption fields

Без изменения runtime документация различает blocked=interrupted_unknown при recovery и outcome=interrupted_unknown для finished-хода без результата. Запрос печатает оба поля, явный ноль и знаменатель; COALESCE(SUM(...),0) предотвращает пустую ячейку на пустых/all-NULL данных. Первоначальный запрос без этого был отклонён.

Without runtime changes, documentation distinguishes blocked=interrupted_unknown during recovery from outcome=interrupted_unknown for finished turns without results. Queries print both fields, explicit zeros, and denominators; COALESCE(SUM(...),0) prevents empty cells on empty/all-NULL data. The initial query lacking this handling was rejected.

## 1.5.27 — 2026-09-20 · Отказ формата виден / Visible format rejection

Первый негодный файл вызывает owner-alert существующим Telegram-путём. A2A_TREVOG_PREDEL=5 ограничивает тревоги за процесс, объявляя исчерпание; журнал не ограничен. Успешный poll отдельно называет число форматных отказов, потому что успех опроса их не исключает. Добавлен стенд и зависимости route/poll-проб. Отвергнутый файл всё ещё остаётся в ящике: переноса/уборки нет.

The first invalid file triggers owner-alert through the existing Telegram route. A2A_TREVOG_PREDEL=5 bounds alarms per process and announces exhaustion; logging continues. Poll success separately reports format rejections, since successful polling does not exclude them. Added tests and route/poll-test dependencies. Rejected files still remain in the inbox: no relocation/cleanup is added.

## 1.5.24 · Бюджет побудок / Wake budget

Ошибки учитываются до managed return; автоматические побудки проходят единые receipt-ворота K=3 с одной тревогой на серию и durable-состоянием. Завершённые/неопределённые ходы не повторяются.

Errors are accounted for before managed return; automatic wakes use one receipt gate with K=3, one alarm per episode, and durable state. Completed/uncertain turns are not replayed.

## 1.5.23 · Обязательный persist / Required persist

poll требует функцию persist до Telegram-запроса; неверный/отсутствующий callback отвергается без сети и сдвига offset. Проверка типа не доказывает фактическую запись. Основа — проверенная 1.5.22; её отдельного заголовка в исходной истории нет.

poll requires a persist function before requesting Telegram updates; invalid/missing callbacks are rejected without networking or offset advancement. Type checks do not prove actual persistence. It is based on reviewed 1.5.22, which has no separate heading in the source history.

## 1.5.21 · Кандидат копий владельцу / Owner-copy candidate

Восстановлены A2A→Telegram копии вопросов/receipt-ответов в owner-all/broadcast, включая reply=no. Attribution привязана к receipt; сбои/повторы копий независимы от основного ответа. Граница отката к 1.5.20 документировалась отдельно.

Restored A2A→Telegram question/receipt-response copies in owner-all/broadcast, including reply=no. Attribution is receipt-bound; copy failures/retries are independent of the main response. The rollback boundary to 1.5.20 was documented separately.

## 1.5.20 — 2026-09-18 · Кандидат durable receipts / Durable-receipt candidate

Добавлены долговечные квитанции, flush-барьер до исполнения, удержание ambiguous legacy и восстановление исхода. Исходная запись требует независимых ворот перед монтажом; цена и ограничения вынесены в receipts-документацию.

Added durable receipts, a pre-execution flush barrier, ambiguous-legacy holds, and outcome recovery. The source entry requires independent acceptance before installation; costs and limits are described in receipt documentation.

## 1.5.19 — 2026-09-18 · Вложения / Attachments

Document/photo/video скачиваются потоком в приватный workspace с SHA256, приватными правами и пределами 20 MB/2 GB. Авторизация до скачивания/расшифровки; голосовой путь сохранён. Имена/подписи — данные, архивы не раскрываются. Дедупликация в пределах чата: Telegram identity до сети, SHA после загрузки неизвестного файла. Состояния передачи сохраняются, через 10 минут ожидания требуется уведомление; сетевые квитанции не блокируют очередь.

Document/photo/video are streamed into private workspace storage with SHA256, private permissions, and 20 MB/2 GB limits. Authorization precedes downloads/transcription; voice handling remains. Names/captions are data and archives are not unpacked. Deduplication is chat-scoped: Telegram identity before networking, SHA after downloading an unknown file. Dispatch state persists, waiting triggers a notice after ten minutes, and network receipts do not block the queue.

## 1.5.18 — 2026-09-18 · Два измерения / Two measurements

compact-status разделяет Codex usage и давление DSH, берёт настройки живого движка своего экземпляра и связывает usage с последним вызовом. Пороги/сжатие не перенастраиваются.

compact-status separates Codex usage from DSH pressure, reads the instance's live-engine settings, and binds usage to the latest call. Thresholds/compaction are not reconfigured.

## 1.5.17 — 2026-09-15 · Локальный порог / Local threshold revision

compact-status читает thresholdRatio живой compaction-службы через agent context, учитывает modelPolicies и называет источник во всех ветвях. Недоступность сообщается без выдуманного порога. Стенд проверяет смену настройки/отказ; live realm и загрузка после restart остаются независимой приёмке.

compact-status reads thresholdRatio from the active compaction service through agent context, accounts for modelPolicies, and names sources on all paths. Unavailability is reported without inventing a threshold. Tests cover setting changes/failure; live realm and post-restart loading remain independent acceptance work.

## 1.5.16 · Spool-дедупликация / Spool deduplication

Spool получает собственный poslannye: skip уже отправленного, add после send, delete в cleanup-callback. Это состояние в памяти; restart теряет его, окно между подачей и claim не закрыто. Пробы проверяют has→continue и второй обходной send с порчей/возвратом.

Spool gains its own poslannye: skip previously sent mail, add after send, and delete in cleanup callbacks. State is in memory; restart loses it and the dispatch-to-claim window remains open. Tests mutate/restore has→continue and a second bypassing send.

## 1.5.15 · Архив прочитанного / Read-mail archive

Прочитанное A2A/spool переносится rename в prochitannye/, не удаляется бесследно. Сохранены ротация старше 30 суток, Date.now при коллизии и прежнее удаление при выключенном архиве. Повторная spool-подача вне этой правки; архив проверен на обоих путях с порчей.

Read A2A/spool mail is renamed into prochitannye/ instead of disappearing through deletion. Retained behavior includes rotation after 30 days, Date.now collision handling, and deletion with archiving disabled. Repeated spool dispatch is outside this change; archive tests cover both routes with mutation.

## 1.5.14 · Уборка всех выходов / Cleanup on every exit

Новый стенд опроверг подозрение об отсутствии finally в nudgeUntilClaimed: callback/poslannye.delete уже работают при claim, обрыве очереди, missing wakeDriver, стопе, бюджете и ошибках. Runtime не менялся. Порча удаления finally краснеет, доказывая зрячесть.

The new test disproved suspected missing finally cleanup in nudgeUntilClaimed: callback/poslannye.delete already ran on claim, queue interruption, missing wakeDriver, stop, exhausted budgets, and errors. Runtime is unchanged. Removing finally makes the test fail, demonstrating visibility.

## 1.5.13 · Дедупликация A2A / A2A deduplication

Poslannye помнит поданные filenames и пропускает повторный poll, пока письмо ждёт claim. Без него примерно 25-секундный опрос повторял файл за 120 секунд ожидания. Имя забывается при удалении; правило удаления после claim сохранено.

Poslannye remembers dispatched filenames and skips repeated polls while mail awaits claim. Without it, roughly 25-second polling resent files during the 120-second wait. Names are forgotten on deletion; delete-after-claim remains.

## 1.5.12 — 2026-09-09 · Сведение редакций / Revision reconciliation

Сведены дерево и более полная рабочая редакция с разным кодом под одним номером; теги тоже не покрывали всю историю. Из дерева перенесены name/version из одного manifest и явная тревога fallback; автор сведения отдельно не проверял перенесённое. Сохранён idle-порог 30 минут с обязательной оговоркой: замер другого экземпляра, не каждой установки.

Reconciled tree and fuller deployed revisions with different code under one version; tags also failed to cover the complete history. Transferred manifest-based name/version and explicit fallback alarms from the tree; the reconciliation author did not separately verify the transferred change. The 30-minute idle threshold retains its caveat: it came from another instance's measurement, not every installation.

Spool-след получил filename; восстановлен фильтр dot-prefixed временных .txt, чтобы не принять недописанное. Исправлены стенды: nudge-заглушка передаёт cleanup-callback, poll-проба получает momentPoslednegoHoda default null («ходов с запуска нет», не ноль минут). Сведение — новый предмет приёмки; исходный прогон без расхождений оставил слепой stend-imena без частного словаря. Это граница сторонней установки, не проверка имён. Live-монтаж не заявлен.

Spool traces gained filenames; restored the dot-prefixed temporary .txt filter to avoid admitting incomplete files. Tests were fixed: nudge stubs forward cleanup callbacks and polling receives momentPoslednegoHoda default null (no turns since startup, not zero idle minutes). Reconciliation is new acceptance work; the original mismatch-free run retained blind stend-imena without its private dictionary. This is an external-installation boundary, not name verification. Live deployment is not claimed.

## 1.5.11 — 2026-09-07 · Имя в следе / Filename traces

A2A-след приёма включает filename, связывая событие получателя с отчётом курьера без догадки по времени/длине. Стенд проверяет текст предмета, ловит удаление строки, но не исполняет живую очередь и не доказывает фактическую печать.

A2A reception traces include filenames, linking recipient events to courier reports without time/length guesses. Tests inspect source text and detect removal of the line, but do not execute a live queue or prove actual printing.

## 1.5.10 — 2026-09-07 · Стоп после ошибки / Stop after error

Nudge-цикл останавливается одной строкой, когда поднятый им ход оборвался ошибкой после старта цикла. Письмо остаётся следующему живому ходу. Раньше побудки каждые 0,5 секунды до 120 секунд генерировали повторные платные отказы. Старая ошибка не блокирует новый цикл; отметка передаётся параметром для самодостаточности. Время снятия лимита из чужого текста не разбирается. Пробы различают свежий/старый/отсутствующий обрыв и порчу условия.

The nudge loop stops with one log line when a turn it woke fails after the loop began. Mail remains for the next live turn. Previously, wakes every 0.5 seconds for up to 120 seconds generated repeated paid failures. Old errors do not block new loops; markers are passed as parameters to keep extracted code independent. Reset times are not parsed from third-party text. Tests distinguish fresh/old/absent failures and corrupted conditions.

## 1.5.9 · Источник отказа и пустая почта / Failure sources and empty mail

Отказ A2A/spool/Telegram называет конкретный источник, успех — полный состав. Control flow прежний: отказ прерывает круг с паузой. Первое установленное имя не перетирается; примитивный throw даёт unknown-source. Удаление пустого spool и его отказ теперь видны; пустой A2A остаётся с одной строкой на filename. PUSTO:-ключ забывается вместе с файлом, позволяя сообщить повторное размещение.

A2A/spool/Telegram failures name the actual source, while success names all components. Control flow remains: failures abort and pause the cycle. First-established names are preserved; primitive throws yield unknown-source. Empty-spool deletion and failure are visible; empty A2A remains with one line per filename. PUSTO: keys expire with files, allowing reporting of replacement mail.

Обновлены source/spool/suppression-стенды; caller и редкая строка не зависят от старой формы/прозы. Все одиннадцать тогдашних стендов подмены принимают argv[2]/SVYAZ_SRC (argv старше) и печатают выбранный файл, предотвращая ложное зелёное на другом предмете.

Updated source/spool/suppression tests; caller and sparse-log checks no longer depend on old code shape/wording. All eleven then-existing substitution tests accept argv[2]/SVYAZ_SRC (argv wins) and print the selected file, preventing false passes on another subject.

## 1.5.8 · Подавление и размер пачки / Suppression and batch size

Множества подавления A2A/spool разделены: чужой cleanup не стирает spool-ключи. Стенд извлекает настоящие циклы/множества, проверяет чужие/свои ключи; отсутствие механизма даёт слепоту. spool-пачка получила spoolBatchChars=40000 дополнительно к пяти письмам по счёту, на основе корпуса. Сверхдлинное письмо не режется: передаётся целиком одно, с именем/длиной в log. Проверяются порядок, отсутствие потерь и согласованность обоих пределов.

A2A/spool suppression sets are separate: foreign cleanup no longer erases spool keys. Tests extract actual loops/sets and check foreign/local keys; missing mechanisms yield blindness. Spool batches gain corpus-based spoolBatchChars=40000 alongside the five-letter count threshold. Oversized letters are never truncated: each is delivered intact alone with name/length logged. Tests cover ordering, no loss, and consistency of both bounds.

## 1.5.7 · Чанки не журналируются / Chunk logs suppressed

assistant/chunk не печатается по фрагментам; assistant/message сохраняет полный ответ одной строкой. Поток мог исчерпать journald 10000 сообщений/30 секунд и потерять другие события, включая compaction/end. Стенд проверяет guard и чтение последней compaction/summary.

assistant/chunk is no longer logged per fragment; assistant/message retains complete responses in one line. Streams could exhaust journald's 10000-message/30-second limit and lose other events, including compaction/end. Tests cover the guard and latest compaction/summary reading.

## 1.5.6 · Редкий успешный poll / Sparse poll-success logs

Успех оставляет след раз в 20 циклов и при восстановлении после отказа. При ~25-секундном long poll это около восьми минут: отличает остановку от тихой работы без потока строк. Стенд извлекает счётчик; порча порога даёт отказ.

Success leaves a trace every 20 cycles and on recovery from failure. With ~25-second long polling, this is about eight minutes, distinguishing stopped polling from quiet operation without flooding logs. Tests extract the counter; threshold mutation fails.

## 1.5.5 · Версия процесса / Process version

Первая startup-строка называет пакет/версию своего manifest. Ошибка чтения даёт unknown, не запасное число. Disk SHA/timestamp не доказывают уже загруженную редакцию.

The first startup line names the package/version from its own manifest. Read failure yields unknown rather than a fallback number. Disk SHA/timestamps do not prove the loaded revision.

## 1.5.4 · Текст и код / Message and code

Причина выводит текст первым, код в скобках; «без пояснения» только если нет обоих. Пустой message больше не прячет полезный error code.

Reasons print message first, code in brackets; no-explanation wording applies only when both are absent. Empty messages no longer hide useful error codes.

## 1.5.3 · Зависимость стенда / Test dependency

Freshness-стенд извлекает блок вместе с prichina; отсутствие helper даёт слепоту с причиной, не расхождение исправного runtime. В 1.5.2 новый вызов сделал извлечение несамостоятельным; выпуск ушёл с красным стендом из-за непрочитанного результата. Обёртка выпуска сама не проверяла стенды.

Freshness tests extract the block with prichina; missing helpers yield blindness with a cause, not mismatch on correct runtime. In 1.5.2, new calls broke extracted-code independence; the release shipped with failing tests because results were not read. The release wrapper did not itself validate tests.

## 1.5.2 · Две оси причины / Two error-detail axes

Три места диагностики различают непустоту пустого error и сохранение текста примитивного throw. Добавлен code при пустом message; первая редакция отвергнута за потерю строки. Null/{} не несут текста и честно остаются «без пояснения». Две порчи проверяют отдельные оси; прежняя неполнота сохранения текста примитивов не ухудшилась, но не объявлена устранённой.

Three diagnostic paths distinguish nonempty detail for empty errors from preservation of primitive-throw text. Codes are included for empty messages; the first revision was rejected for losing string content. Null/{} contain no text and honestly remain unexplained. Two mutations exercise separate axes; prior incomplete primitive-text preservation was not worsened but is not claimed fixed.

## 1.5.1 · Подробность сетевой причины / Network-error detail

errDetail собирает class/code/message и AggregateError.errors вместо nullish-цепочки, считавшей пустой message причиной. Пустой перечень — явно нет описательных полей, не пустая строка. Log называет состав poll; стенд извлекает функцию и краснеет при возврате прежнего выражения.

errDetail collects class/code/message and AggregateError.errors instead of a nullish chain treating empty messages as reasons. Empty lists explicitly mean missing descriptive fields rather than empty output. Logs name polling components; tests extract the function and fail when the old expression returns.

## 1.5.0 · Свежесть и runner / Freshness and runner

compact-status различает свежую usage-опору, устаревшую после компакта и недоступный замер. Расстояние до порога только при свежем источнике; старая эвристика не выдаётся за новые числа провайдера. API выбирается по доступным events или eventAt/seq; ошибка означает unknown, не свежесть.

compact-status distinguishes fresh usage baselines, baselines stale after compaction, and unavailable measurements. Threshold distance is shown only for fresh sources; old heuristics are not presented as new provider values. APIs are selected from available events or eventAt/seq; failure means unknown, not fresh.

Добавлены scripts.test и runner с перечнем с диска; упаковка каталогов включает новые стенды. Впервые видна законная слепота частного stend-imena, не охватывающего весь состав. Проба свежести различает отсутствующий признак (код 2) и сломанную логику (код 1). Порог остаётся window×0.8; чужой thresholdRatio стенд не читает, эта граница ещё не исправлена.

Added scripts.test and disk-discovered test execution; directory packaging includes new tests. Legitimate blindness of private stend-imena, which does not cover the full distribution, becomes visible. Freshness tests distinguish absent mechanisms (exit 2) from broken logic (exit 1). The threshold remains window×0.8; tests do not read external thresholdRatio, and that limitation is not yet fixed.

## 1.4.3 · Команды из чата / Commands from chat

Slash-ввод передаётся platform registry, не модели. Поддержаны compact/compact-status и ccc/cs aliases; ответ называет сессию. Правила допуска раннего выпуска не следует смешивать с поздней owner-only политикой.

Slash input reaches the platform registry rather than the model. compact/compact-status and ccc/cs aliases are supported; responses identify sessions. Early-release admission rules must not be confused with later owner-only policy.

## 1.4.2 · Обезличивание / Anonymization

Из двух log-строк удалена частная агентная метка без изменения поведения. Рабочие 1.4.2/1.4.1 были одинаковы до выпуска: номер отставал, содержание уже включало правку. Это не потерянное изменение.

Two log lines lose private agent labels without behavior changes. Deployed 1.4.2/1.4.1 were already identical before release: numbers lagged while content already included the fix. This is not a lost change.

## 1.4.1 · Четыре исхода / Four wake outcomes

Побудка различает claim, занятость на всех проверках, неудачную побудку и пустую с начала очередь. Тревога только при действительном отказе, не штатной занятости. Добавлен stend-pobudki.

Wake reporting distinguishes claim, busy agents at every check, ineffective waking, and initially empty queues. Alarms indicate actual failures, not normal busy operation. Added stend-pobudki.

## 1.4.0 · Сеть и почтовый ящик / Networking and mail spool

Исходная история называет изменение причин сетевого отказа и чтения почтового ящика, с подробностями в тогдашнем README. Дополнительные детали здесь не выдуманы.

The source history identifies changes to network-failure causes and mail-spool reading, referring to the README of that time. Additional details are not invented here.

## Более ранние · Earlier releases

Исходник упоминает 1.3.0 — цель из канала, 1.2.0 — отправку после сетевого сбоя, 1.1.0 — кто спросил, кому отвечено и кому видно. Отдельных подробных записей этих версий в источнике нет.

The source mentions 1.3.0 for channel goals, 1.2.0 for sending after network failures, and 1.1.0 for question/response attribution and visibility. The source contains no separate detailed entries for these versions.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке. · EN: Entries reconstructed from the git diffs of the named commits on 2026-10-08; these are not release numbers and not live measurements.

- `33c25ba029b6` (2026-08-20) — Каталог пакета переименован из `telegram-channel` в `telegram-multiagent`; экспортируемое имя плагина (`name` в `src/index.js`) и метка эффекта опроса сменились с `dsh-telegram-channel` на `dsh-telegram-multiagent`, `repository.directory` и команда установки в корневом README приведены к тому же имени. Поведение кода не менялось. · EN: The package directory, exported plugin name, poll-effect label, repository.directory and root README install command moved from telegram-channel to telegram-multiagent; code behaviour is unchanged.
- `157f8d373f7b` (2026-08-20) — Только номер версии в `package.json` (и перевод строки в конце файла): выпуск переименования из предыдущего пункта, код не менялся. · EN: Version number in package.json only (plus a trailing newline), releasing the rename above; no code change.
- `d38d41aaca53` (2026-08-21) — Входящее помечается каналом (`[личный чат, от …]` / `[служебный канал, от координатора]`), а похожие строки из текста отправителя вырезаются до постановки метки; настройка `mergeChatIntoA2A` сводит указанный чат в служебную сессию — одна память на владельца и координатора. Ответ получает заголовок `[ответ: кто] на «…»`, привязанный к ходу через очередь вопросов, а не к последнему сообщению. Режим копий во второй канал (`personal` / `broadcast` / `owner-all`) читается на лету по mtime из `settingsFile` (по умолчанию — файл токена с расширением `.json`); ошибка чтения даёт `personal` и строку в журнал. · EN: Unforgeable channel marks (lookalike lines stripped first), mergeChatIntoA2A for one shared session, turn-bound reply headers, and a copy delivery mode read live from an external settings file with personal as the fallback.
- `0be699d5febb` (2026-08-21) — `TelegramClient.call` в `src/client.js` повторяет запрос до трёх раз с паузой 0,4 и 0,8 с при сетевом сбое или неразборном ответе и пишет попытки в журнал; отказ самого Telegram (`ok:false`) не повторяется, длинный опрос `getUpdates` идёт одной попыткой. · EN: TelegramClient.call retries network or parse failures up to three times with a growing delay; Telegram-level refusals are not retried and getUpdates keeps a single attempt.
- `b6512921d420` (2026-08-21) — `downloadTelegramFile` скачивает файл встроенным `fetch` вместо запуска `curl` с адресом, содержащим токен бота: токен больше не попадает в аргументы процесса, видимые другим пользователям машины. Ответ не-2xx теперь даёт ошибку `telegram file download: HTTP <код>`. · EN: File download uses built-in fetch instead of spawning curl with the token-bearing URL, so the bot token no longer appears in process arguments; non-2xx responses now throw.
- `fb924d9baf15` (2026-08-21) — `pollA2A` берёт из входящих файлы `.txt` и `.md` (раньше только `.txt`); о каждом невзятом файле пишет в журнал по имени один раз (имя забывается, когда файл исчезает), а недоступный каталог входящих называет с причиной вместо молчаливого `catch { return; }`. · EN: pollA2A accepts .txt and .md, logs each rejected file name once, and reports an unreadable inbox directory instead of silently returning.
- `f229bf997390` (2026-08-23) — В `agentFor` сервисы `agentPresets`, `agentDefaultModel` и `sessionPersistence` берутся через новую `waitService`: ожидание до 30 с с записью о начале и длительности ожидания и громкой строкой о последствии при неудаче — вместо голого `ctx.get()`, который до подъёма сервиса молча давал `undefined`. Итог списка сохранённых сессий теперь всегда в журнале: «заводится впервые» при пустом списке, предупреждение с числом и id, если нашей сессии среди них нет. · EN: agentFor waits up to 30 s for agentPresets, agentDefaultModel and sessionPersistence through a new waitService helper instead of a bare ctx.get(), and always logs the saved-session list outcome.
- `9ccc37433762` (2026-08-23) — Команда `/goal` из Telegram и служебного канала: состояние цели, `/goal stop` и постановка с пределом 3 в час на канал; право даётся списками `goalUsers` и `goalA2ASenders` (по умолчанию пусты — команда отклоняется всем), отправитель служебного канала называет себя строкой `From: <имя>` (учёт, не проверка подлинности). Маркер цели вырезается из исходящих ответов, исход цели (`goal/change`) сообщается в канал, откуда она поставлена; сервисы `goals`, `goalMarker`, `mcpBridge` ожидаются до 5 с. Добавлены `test/test-goal-control.mjs` и `test/extract.mjs`, каталог `test` вошёл в `files`. · EN: Added /goal control from Telegram and the agent-to-agent channel (status, stop, create at most 3 per hour per channel) gated by goalUsers/goalA2ASenders, with goal-marker stripping, outcome reporting and the goal-control test.
- `2efcddbe3dba` (2026-09-03) — В `package.json` объявлена devDependency `@deepseek-ai/cordis` 4.0.1 для стенда `stend-dostupa-sluzhb`; путь каталога шины в комментарии `src/index.js` и подсказка стенда обезличены — каталог задаётся настройкой `spoolDir`. Поведение не менялось. · EN: Declared @deepseek-ai/cordis 4.0.1 as a devDependency for the service-access test and anonymised the spool path in a comment and a test hint; no behaviour change.
- `70e508bee09f` (2026-09-19) — Когда копия вопроса или ответа во второй канал не делается, журнал называет режим, origin и причину (`copySkipped`: personal без копий, owner-all не копирует переписку владельца, режим не предусматривает направления); отложенная копия, запрещённая текущим режимом, отказывает с именем режима, отсутствие чата владельца тоже пишется в журнал. Добавлены `OLD-PATHS.md`, раздел условий в `OWNER-COPIES.md` и `test/stend-copy-decisions.mjs`. · EN: Skipped owner copies now log the delivery mode, origin and reason, deferred copies refused by the mode name it, and OLD-PATHS.md plus a copy-decision test were added.
- `c3a55d01ef53` (2026-09-19) — Восстановление квитанции ищет сессию исполнения по сохранённым `session_id` и времени создания (новый `src/receipt-session.js`), а не по адресу ответа: среди живых сессий, иначе через `persistence.inspect` и `ctx.agents.resume` с проверкой до запуска цикла. Несовпадение блокирует квитанцию как `session_mapping_error`, сбой чтения пишется в аудит как `session_read_error` / `session_observation_error`, квитанция с `finished_at` повторно не обрабатывается. Добавлены стенды receipt-session и session-tick. · EN: Receipt recovery resolves the execution session by persisted id and creation time (live entry or validated resume) instead of the reply address, blocking mismatches as session_mapping_error.
- `3676bb05275d` (2026-09-22) — `formatStatus` в `src/compact-status.js` выдаёт короткий цифровой статус: строка модели, счётчик модели (опора замера `baseline.tokens`) и счётчик DSH — оба в токенах и в процентах от порога компакта (окно × доля из работающего движка), затем строка порога с остатком либо «порог НЕИЗВЕСТЕН (причина)». Журнал Codex стал сверкой: ⚠️ только при расхождении с опорой, возрасте замера больше 30 мин или изменении контекста после замера; пояснительные строки и ссылка на паспорт модели убраны. · EN: compact-status output became a digits-only summary — model, provider and DSH counters as tokens and percent of the compaction threshold, and the threshold with remaining tokens — with the Codex journal used only as a cross-check.
