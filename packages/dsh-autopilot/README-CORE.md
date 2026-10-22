# Почта Автопилота — клиент 0.1.4, сервер/copy 0.1.3

Часть плагина применения «Автопилота» Никиты Велеса на DSH-серверах DeepSeek Harness; исходник — [nick-vels/skills](https://github.com/nick-vels/skills). [Авторство, pin и правило разбора upstream](README.md#upstream-и-обновления).

Почтовый контур установлен: клиент/notice 0.1.4, живые процессы server/copy 0.1.3. Core AP 0.1.7 — отдельный физический release. Далее описан договор транспорта/хранения, а не указание выполнить старое окно AP-011 заново. Служебные квитанции публикуются через ботов самих агентов. Прежние raw copy_outbox строки не являются готовыми квитанциями и автоматически не проигрываются.

Служба `autopilot-mail.service` работает от непривилегированной учётки `autopilot-post`, сокет `/run/autopilot-mail/post.sock`, sender определяется SO_PEERCRED и закреплённым NSS-составом. Шестеро команды не входят в основную почтовую группу; Мастер сохраняет оба маршрута. SQLite в `/var/lib/autopilot-mail/mail.sqlite`, режим0600. Root-runtime и чужие ящики не допускаются.

## Установленная раскладка и требования к её изменениям

Срез17.10.2026 10:53UTC: mail/copy active/running, их unit files disabled. Семь notice-таймеров active/waiting; одноразовые notice-services между опросами inactive/dead. Это не отсутствие доставки. В команде master, vintik, shpuntik, gayka, shurup, sova, tumbler. Реальные User/argv подтверждены systemctl/proc, root-ссылки — readlink.

Исторический порядок первого монтажа: сначала AP-0110.1.1, затем отдельное почтовое окно. Ниже требования к назначенной монтажной руке; они не означают, что текущий сервер ещё не установлен. Клиентский runtime — `/opt/autopilot/post/0.1.4`; работающие сервер/copy остаются в `/opt/autopilot/post/0.1.3`, его содержимое и root-ссылку `/usr/local/bin/autopilot-mail` на versioned bin описывает `MAIL-LAYOUT.json` (генератор `python3 -B lib/post_layout.py`, не устанавливает файлы). Источники lib/test/systemd — CORE; список включает также остальные поведенческие файлы AP-011. Исторический состав AP-011 (в том числе13файлов skill) — происхождение этого договора; документальный такт skill/install/archive не меняет; лицензионное дополнение обновляет только part_b_manifest_sha256 в source-lock, без смены upstream или runtime-логики.

Подготовить отдельные autopilot-post user/group и autopilot-mail group с семью участниками команды и отдельными сервисными ролями post/copy. Не давать команде sudo или доступ к основной почте. Корневой `source-lock.json` postal runtime копируется из принятого AP-011, чтобы настоящий `require_main()` мог проверить MAIN-pin. Старую PATH-ссылку страхует монтажная рука. Файл `/etc/autopilot-mail/retention.json` root:root0644, каталог root:root0755; образец `config/retention.json`. Смонтировать ровно содержимое принятого пакета/манифеста назначенной рукой. Не брать монорепозиторий из старой ветки1c1909c2.

ACL отправителя тревог добавляются в `/etc/tmpfiles.d/dsh-trevogi-spul-acl.conf`: два правила `a+` для tmp/vhod, `u:autopilot-post:wx`. Предыдущие правила сохраняются. `getfacl` должен показать `user:autopilot-post:-wx`, повторный `systemd-tmpfiles --create` не снимает право. Существование учётки и реальный spool-reader проверяет монтажная рука. В кандидате проверка проведена только на отдельной копии NSS/spool.

Юнит autopilot-mail содержит OnFailure на autopilot-mail-failed@; уведомитель принимает только собственный mail-unit, использует существующий agent-alert spool с ограниченным ожиданием, не содержит Telegram-ключей. Перед включением notice-таймеров назначенная рука монтирует opt-in autopilotMail-профили: второй вход Мастеру, AP-only шестерым. Запуск службы/боевые профили частью авторской сдачи не являются.

## Клиент

`bin/autopilot-mail send <agent> --request <свой-файл.json>` читает письмо из stdin при первом вызове и сохраняет nonce/payload до сети. Повтор того же request-файла повторяет тот же delivery_id, изменённый payload при том же nonce даёт REQUEST_CONFLICT. Намеренно новое письмо требует нового request-файла.

Installed 0.1.4 client contract: client-local refusals exit2 and print a fixed stderr code: LOCAL_REQUEST_CONFLICT (including noncanonical saved request bytes), UNSAFE_LOCAL_STATE, INVALID_LOCAL_REQUEST, LOCAL_STATE_UNAVAILABLE, UNSAFE_NOTICE_DIRECTORY, LOCAL_NOTICE_UNAVAILABLE, or FRAME_TOO_LARGE. The saved request is not normalized/overwritten to bypass a conflict. No send/ACK follows a failed durable local write. Raw exception text and request content are not printed. TLS/socket/server-response failures retain SOURCE_UNVERIFIED_OR_UNAVAILABLE; this diagnostic change does not retry a request or relax authentication.

`inbox`, `get <id>`, `read <id> --directory <личный-inbox>`, `ack <id>`, `status` не требуют sudo. `read` сохраняет оригинал до ACK. Ручной низкоуровневый ACK без сохранения — сознательный выбор адресата. После GC get даёт BODY_PRUNED, не пустое успешное письмо. Старый send/ACK не открывает письмо заново и не создаёт повторного события.

## Хранение и ресурсы

У каждого агента раздельные incoming/outgoing keep_count и older_than_hours. При превышении count очищаются только допустимые старые ссылки до порога либо исчерпания кандидатов. Две ссылки удерживают одно тело, физически оно удаляется после обеих. Обычный ACK разрешает серверную очистку после срока от acked_at; личный durable inbox не чистится. Unread/unknown защищены.

Task дополнительно защищён до finish+STORED результата и job_complete. Receive сохраняет source_delivery_id в job-state до ACK; finish отправляет результат с устойчивым nonce, затем подтверждает пару исходного/результирующего ID. При ошибке completion выводится PENDING/код2. Мастер/адресат видят completion_pending в status и вручную повторяют тот же finish; DUPLICATE+mail идёт по тому же пути, timestamp завершения не сдвигается. У ordinary дополнительного completion-callback нет.

Tombstone хранится бессрочно: D/request_sha, участники и терминальные метаданные; тело/nonce/subject очищаются. Новая конфигурация не имеет пожизненного COUNT1000. Ограничены живые body-bytes, занятые страницы SQLite и unacked-письма отправителя (не более200). Занятая БД: page_size*(page_count-freelist_count), все таблицы/индексы/overflow, без свободных страниц. WAL/размер файла/свободный диск — отдельные величины.

80%-порог/70%-recovery берутся из конфигурации. Один сигнал на эпизод, завершение старого сигнала не погашает новый. Перед ресурсным отказом проводится bounded GC; его commit не откатывается вместе с отказанной новой вставкой. При реальном исчерпании ресурса запрещается новая приёмка, но get/ACK/completion/GC остаются доступными. Оператор Забава назначает расширение/разбор неочищаемого остатка, IDs ради места не стираются.

Служба сама зовёт retention_tick по расписанию. Журнал содержит gc_run_id, removed/retained/protected по агенту/стороне и отдельные числа тел/tombstone. Status читает здоровье GC, текущий объём и собственные счётчики. Отдельный health-reader обнаруживает незов GC; он не защищает от зависания всего процесса/ОС. Запись об ошибке и отправка сигнала не равны подтверждённой внешней доставке.

## Откат

База и профиль страхуются назначенной монтажной рукой до окна. Новый код добавляет метаданные, не меняя D/request_sha; удалённые тела не восстанавливаются откатом программы. После первой очистки нельзя подменить БД старой страховкой и снова принимать старые nonce: это нарушило бы дедуп. Для отката нужны актуальный ledger/tombstone и совместимый читатель либо остановка новой приёмки. Таймеры/службы меняются только по принятому окну, без общих reset-failed/очисток чужих имён.


## Квитанции: настройка и сервисная роль

`/etc/autopilot-mail/copy.json` — root:root0644, parent root:root0755; schema_version2, образец `config/copy.example.json` содержит учебные bot_user_id, их нельзя монтировать как реальные. В пилоте ровно одна target с каноническим отрицательным chat_id, text_chars100 или3000 (целое, code points), у каждого из семи TEAM on_send/on_receive. Проверка реального права публикации каждого бота в чат остаётся монтажной пробой.

Видимый отправитель — бот subject-агента. Первый STORED порождает send от отправителя, первый ACK — receive от адресата. ACK означает подтверждение почтового протокола, не ход модели или исполнение. Флаги независимы; оба false не запрещают прямой ответ человеку по имени. Программа не вызывает модель. Повтор nonce/ACK не создаёт факта ещё раз.

Отдельные autopilot-copy user/group (UID не почтальона и не TEAM), supplementary autopilot-mail. Ключи семи ботов: файлы root:autopilot-copy0640 в root:autopilot-copy0750, без ссылок/жёстких копий; каталог и файл сверяются с NSS-группой до чтения. Ключи не в JSON/argv/логах, один завершающий LF допустим. При старте программы все семь числовых prefix до ':' сравниваются с bot_user_id; чужой ключ отказывает до claim/network с именем агента. getMe не вызывается. Prefix проверяет локальную карту, не действительность/отзыв ключа и не права чата.

Сервисная роль через тот же проверенный сокет получает только copy_claim/result/status: ни send/get/ack чужого ящика, ни прямого доступа к mail.sqlite. Участники не получают copy RPC или ключи. Копировщик имеет только sendMessage к targets принятого config, до сети проверяются метод и chat_id; redirects, getUpdates/getMe/webhook/forward/edit/delete запрещены. Это контроль штатной программы, не защита от полностью скомпрометированной службы с ключами.

Без watcher/hot reload: оператор атомарно меняет root-файл и перезапускает ТОЛЬКО autopilot-copy. На claim worker посылает SHA принятого config; почтальон при несовпадении сам читает фиксированный root-файл, сверяет SHA и принимает поколение показа без своего рестарта. JSON-конфиг/путь из RPC не принимается. Несогласованность даёт COPY_CONFIG_MISMATCH до claim; почта/jobs продолжаются. Показ при неверном config/UID отключается и поднимает тревогу, не ломая STORED/ACK. В status виден configured/счётчики/эпизод/состояние системного alert.

Pending/retry при отключении subject/удалении или изменении target подавляются без HTTP. Уже отправленное и запрос в сети не отзываются. Повторное включение не оживляет suppressed. Фрагмент существующей публикации заморожен; изменение100↔3000 применяется к новым. Отправляется одно сообщение: до100/3000 code points тела, конверт до3500 UTF16; дополнительная обрезка emoji явная. Хвост «… / Текст обрезан. Полный текст: autopilot-mail get <id>». Тема до128 code points, без переносов. parse_mode/entities не задаются, предпросмотр ссылок выключен. Команда get сохраняет права собственного ящика.

## Повторы, наблюдение и cutover

Уникальный ключ (event=delivery_id:phase,target,part1), actor хранится с фактом. Перед HTTP commit attempt/claim/lease30с. Сеть ограничена timeout10с, запрос без результата после lease расходует попытку и ждёт10с; максимум5 попыток всего. Подтверждённый и неоднозначный отказ повторяются через>=10с. Для429 валидный retry_after задаёт max(10,retry_after), сохраняется общий bot/chat cooldown; restart бюджета не сбрасывает. Ошибочный retry_after именуется и использует обычную паузу. Физические дубли допустимы, новые mail/jobs не создаются.

После5 — possibly_lost, локальный текст очищается, попытки/ключ/исход сохраняются. Первый loss открывает один durable эпизод и системный alert, следующие увеличивают lost_count; повтор terminal не увеличивает. Первый sent закрывает эпизод и даёт одно восстановление. Старые lost не пересылаются, следующий loss открывает новый эпизод. Зовущий notify_copies — основной цикл почтальона через существующий ограниченный agent-alert spool и tmpfiles ACL autopilot-post; копировщику ACL тревог не нужен. Alert claimed при crash становится unknown, бесконечного повтора нет. Недоставка alert видна отдельным состоянием; сигнал отправителя не доказывает внешнюю доставку.

Snapshot квитанции живёт независимо от серверного body/GC до terminal; удаление тела не продлевает бюджет. Sent Telegram GC не редактирует/не удаляет. При отказе показа почта и jobs продолжаются. Ошибку сохранения факта/публикации в самой SQLite при STORED/ACK не выдаём за успешную почту: транзакция откатывается; это отказ хранения, не HTTP.

На первой установке очередь пустая. Если обнаружены raw copy_outbox из прежнего ядра, показ отказывает LEGACY_COPY_OUTBOX_REQUIRES_REVIEW; почта остаётся доступна в режиме без показа и уведомляет оператора. Назначенная рука до cutover снимает поимённый read-only inventory `SELECT event,target,part,state FROM copy_outbox ORDER BY event,target,part`, страхует БД и принимает судьбу этих строк отдельным актом. Их нельзя превращать в три новых Telegram-квитанции или проигрывать молча. Автоматической миграции/очистки истории в этом кандидате нет. Требование такого акта не препятствует первой установке на пустой БД.

`systemd/autopilot-copy.service` — отдельный процесс, After/Requires/PartOf почты. Mail Type=notify сообщает READY после bind/listen; запуск ограничен30с. Плановый restart mail сначала останавливает copy, затем возвращает его после READY. Обратной зависимости нет: сбой copy не останавливает почту. PartOf не распространяет отдельный start: после stop mail → start mail оператор отдельно запускает copy.

Только отсутствие endpoint/отказ connect ДО request пережидаются до10с с шагом0,2с; TLS/права/неоднозначный исход отправленного RPC не повторяются. После исчерпания copy выходит2, остаётся failed без автоматического restart (RestartPreventExitStatus=2), OnFailure вызывается один раз. Это правило действует на все контролируемые выходы2, включая неверные config/key; исправив причину, оператор явно поднимает copy. Неожиданные crash по-прежнему Restart=on-failure. Последняя попытка, начатая до deadline, сохраняет штатные transport timeouts;10с — предел начала повторов, не всех стадий TLS/ответа. OnFailure helper для copy сообщает «работа продолжается». До активации назначенная рука проверяет числовые bot-ID фильтры всех семи профилей, реальные keys/chat bindings и внешний положительный след квитанций. Авторские проверки используют только синтетические ключи, закрытую HTTP-подставу и временные UID/БД; живые Telegram/боевые службы не использовались.


## EN — deployed component boundary

Checked on sadik on 17 October 2026: autopilot-mail.service runs as autopilot-post and autopilot-copy.service as autopilot-copy. Both live processes execute /opt/autopilot/post/0.1.3/pilot programs. The command link and notice template use /opt/autopilot/post/0.1.4. They are active processes with disabled unit files; seven notice timers are active/waiting, while their one-shot services are normally inactive between polls. The team is master, vintik, shpuntik, gayka, shurup, sova, tumbler. Core AP 0.1.7 is separate.

Dedicated mail uses a TLS-authenticated Unix socket /run/autopilot-mail/post.sock, peer-account identity and a private SQLite ledger. Master retains ordinary and Autopilot mail; the six executors do not gain access to unrelated mailboxes. The installed CLI creates and durably saves a new --request file itself; body input is stdin. Reuse of the same canonical request deduplicates delivery; changed bytes conflict. read saves before ACK. ACK means protocol acknowledgement, not model execution. Client-local failures have fixed stderr codes and refuse before later send/ACK when durable storage fails. Receivers must use the postal helper, as documented in README-PILOT.md.

Retention preserves unacknowledged/unfinished work and permanent tombstones; body GC, SQLite occupied pages, WAL/file size and free disk are distinct measurements. Resource refusal does not imply read/ACK/completion are disabled. No replay of old raw receipt-outbox rows or restoration of pruned bodies is promised by code rollback.

Bot-key values never belong in docs, JSON arguments or logs. They remain root-owned files readable only by the copy service through its group; a key prefix only checks local bot-ID binding. Copy RPC cannot read other mailboxes. Receipts use only guarded sendMessage targets, durable bounded retries and episode alerts. Failed display delivery does not prove mail failed or that a human read a message. Live HTTP/bot delivery was not re-tested in this documentation task.

The installation and rollback procedures above are component contracts, not a fresh deployment order. Main README.en.md records the current core/server/client/dashboard split and the separate accepted-but-not-deployed plans. Iskra maintains skill/; these documentation changes do not alter it or service configuration.


## Кандидат B-N-JOURNAL-POTOP: длительные notices

Авторский кандидат 21.10.2026 для окна AP 0.1.16 по решению Забавы; этот раздел не утверждает монтаж. Семь notice-services используют `Type=simple`: один процесс на ящик вызывает существующий `MailClient.notice` почты `post/0.1.10`. Между началами коротких успешных опросов — пять секунд по монотонным часам. Длительный RPC не перекрывается вторым и не получает дополнительной полной пятисекундной паузы. Это прежняя частота опроса, без обещания срока выполнения хода модели.

Worker устанавливается основным installer на самостоятельную полку `/opt/autopilot/notices/<sha256>/mail-notice-loop.py`; её адрес закреплён в `systemd/autopilot-mail-notice@.service`. Смена AP `current` и возврат старого core не удаляют этот файл. Эти почтовые unit templates по-прежнему монтирует назначенная рука отдельно от installer. Обновление AP без принятого монтажа обоих notice-юнитов не включает новый механизм. Архив пакета включает worker явно через `package.json:files`.

Таймер имеет `OnBootSec=5`, `OnUnitInactiveSec=5`, `AccuracySec=1`. Ожидаемые ошибки notice (ValueError, включая LocalMailError, OSError, KeyError, UnicodeError) остаются внутри живого worker. Ошибка печатается только при смене видимого текста, с именем класса и первыми 200 символами str(error); CR/LF экранируются в одну строку. Ожидание после ошибок — 5, 10, 20, 40, 60 с, затем 60 с. Успешный poll сбрасывает отступ и завершает эпизод ошибки; следующий отказ снова сообщается. Стартовая и recovery-строки не печатаются. SyslogLevel=warning сохраняет диагностическую строку под временным LogLevelMax=notice.

Непредвиденное исключение проходит наружу: этот кандидат не гасит программные ошибки широким except Exception. При стойком непредвиденном исключении таймер повторяет старт через 5 с плюс планирование, а traceback с SyslogLevel=warning может вернуть прежний класс потопа. Эта защита его не ловит. Предохранитель StartLimitIntervalSec/StartLimitBurst в [Unit] записан отдельным тикетом и в этом компоненте не реализован. Для запрета последующих запусков маскируются timer/service. SIGTERM прерывает ожидание сразу; незавершённый stop job ограничен TimeoutStopSec=10, отдельный SIGTERM этим пределом не ограничен.

Порядок AP 0.1.16 закреплён в принятом KIT/DOCUMENT/LIST-P-0.1.16.md: пакет → TG → sadik-watch 3.1.28 → notice-worker и active-перечень → сборщик → признаки. Временный 50-zhurnal-notice.conf снят координатором до окна: его не удаляют повторно и не возвращают из старой страховки. При действующем фильтре нельзя считать отсутствие Started отсутствием стартов: `window/notice-10min.py` следит за PID/start timestamp/InvocationID всех семи workers. Старый отдельный малый лист к db30f9ad заменён этим порядком.

Публикация остаётся ID-only, атомарной и идемпотентной; notice не ACKает письмо. Письмо остаётся в серверном inbox до действий получателя. Worker молчит на старте и пустом исправном опросе; ожидаемая ошибка видна один раз при смене её текста. Новых полномочий, доступа к чужой A2A-почте, Telegram-ключей и сетевых адресов у него нет. Сокет, TLS-проверки, peer credentials и guards каталога берутся из действующего клиента без ослабления.

Исторический путь клиента `post/0.1.4` выбран намеренно компонентом Беты `14d35c1f` от16.10.2026; акт переключения сервера на `post/0.1.10` отдельно сохранял notice0.1.4. Методы notice этих установленных клиентов AST-равны на срезе21.10. Это не доказанная ошибка старого маршрута; новый worker использует действующий0.1.10 без изменения его immutable файлов. Сервер, copy и CLI этим кандидатом не обновляются.


## Границы выпуска 0.1.16

Во время простоя сборщик не читает end-файлы. После запуска он использует доступные строки и сохранённую историю; данные, которые источник уже удалил или вытеснил, не выдумываются. История ограничена 32768 end/8 MiB, весь state — 32 MiB; потеря отмечается STREAM_GAP. INDEX_CAPACITY требует ручного разбора master, автоматической очистки RUN/state нет. До принятого решения о разгрузке не повторять регистрацию бесконечно и не стирать учтённые суммы.

Codex sessionCreated=null означает неизвестную эпоху. Повтор одинаковых opaque sessionId/turn в разных неизвестных эпохах неразличим; код не назначает им выдуманное время.

Проверка active/MainPID не обнаруживает петлю перезапусков notice-worker. Worker, падающий на непредвиденном исключении и поднимаемый таймером через 5 с, почти всегда застаётся active с новым PID. Сторож не хранит прежний PID и не считает таймерные старты, поэтому возвращение потока журнала по этой причине остаётся вне проверки. StartLimitIntervalSec/StartLimitBurst в [Unit] — отдельный тикет, в этом выпуске его не добавляли.
