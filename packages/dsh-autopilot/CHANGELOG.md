## 0.1.16 — 21.10.2026 · приблизительный учёт и notice-worker

- Выпуск включает read-only очередь usage_registrations, долговечные root ACK, полный roster из source-profile и пересчёт доступной истории без ложного LATE_REGISTRATION. Старые квитанции и их числа сохраняются.
- Простой сборщика: во время паузы чтения нет. После запуска доступны только сохранившиеся end и уже записанная история; удалённые/вытесненные данные не восстанавливаются. Глубина ограничена 32768 end/8 MiB истории и 32 MiB state, пропуски отмечаются STREAM_GAP.
- INDEX_CAPACITY требует ручного разбора master: автоматического удаления RUN/state нет. Способ разгрузки согласовывается до повторной регистрации; команды стирать индекс или учтённые суммы этим выпуском не разрешены.
- У Codex неизвестная эпоха остаётся sessionCreated=null. Одинаковые sessionId/turn разных неизвестных эпох неразличимы; выдуманного epoch и автоматической reconciliation нет.
- Проверка active/MainPID не обнаруживает петлю перезапусков notice-worker. После непредвиденного исключения таймер поднимает его через 5 с, и проверка почти всегда видит active с новым PID; sadik-watch не помнит смену PID и не считает старты. StartLimit в [Unit] остаётся отдельным тикетом.


- Roster RUN — весь состав `source-profile.json:participants` плюс участники заявки, если они есть; заявка состав не сужает. Ход участника команды, не работавшего по RUN, попадёт в сумму, если закончился в окне `[startedAt,closedAt+grace]` — принятая цена «≈». Список ролей в коде не задан литералом.
- End участника идёт в открытый в момент end RUN; grace применяется только при отсутствии открытых RUN этого участника. Два открытых RUN дают неполноту без начисления обоим. Поздняя регистрация с полной сохранённой историей считается observed, LATE_REGISTRATION больше не выдаётся. Потеря определяется только lostThrough: startedAt ≤ lostThrough участника → STREAM_GAP. endThrough не является потерей и больше не нужен. Старый приватный флаг LATE и endThrough очищаются; числа замороженных итогов не меняются.
- Новый collector читает только хвосты Codex/Claude end-строк: максимум64KiB/источник/тик. Одна JSON-state под прежним collector-lock; SQLite только как read-only очередь регистрации, без старых registration.drain/prepare и R/G/raw/witness.
- Хранит ts/числа и ключ (participant,sessionId,sessionCreated,turn), без содержимого сообщений. Codex thread нормализуется в sessionId; отсутствующий у текущего Codex sessionCreated хранится как null без выдуманного времени. У Claude используется фактический epoch. Неизвестный и известный epoch — разные ключи, автоматического восстановления потерянного epoch нет. Минимум24ч или от старейшего незавершённого RUN минус grace600с; предел32768 end/8MiB. Старейшие вытесняются с пометкой неполноты.
- Каждый тик чистый пересчёт по текущему roster и окну [startedAt,closedAt+600с]. Поздняя регистрация/расширение roster и поздний end меняют предварительную сумму из сохранённой истории. Пересечение двух незамороженных RUN учитывается заново; уже замороженный final не меняется. Повтор ключа не удваивает расход.
- Публичная квитанция schema5 и панель показывают≈. Работа вне AP в окне может попасть в сумму. Нет строк — null; parent_only считается приблизительно без отдельной неполноты, дети SDK не доказываются.
- Finish принимается только из обычного master-owned marker; без finish действует общий TASK_DEADLINE_MAX7200с с пометкой. После закрытия grace остаётся частью фиксированного окна, включая сохранённые end после срока. Финальный RUN-record заморожен в time-state.json; root index отмечается CLOSED. Старые WIP-состояния: версия1 с одними суммами и версия2 с трёхчастной историей — явно отвергаются; четырёхчастная история имеет версию3.
- Основной вход — SELECT новых usage_registrations через SQLite mode=ro, rowid-курсор в той же JSON-state. Доверие файлу службы почты; состав целиком из настройки. Время начала сохранено; полная сохранённая история учитывается без ложной метки поздней регистрации. Root-декларации — второй вход; прежний init-catalog reader убран. Индекс и root-ACK потребления долговечны до продвижения курсора; старый почтовый writer очищает очередь, collector в SQLite не пишет. При rowid reuse/замене БД повтор безопасен; 129-я регистрация после очистки принята. Ротация end-файлов сохраняет неполноту. Срок хранения RUN-state не менялся.

## 0.1.15 — 21.10.2026 · единый LIMIT

- Один общий USAGE_BYTE_LIMIT = 32 MiB для читателей и вызывающих учёта. Временный запас для полного перечитывания ledger/native; Meter 3 с и отдельные raw/G лимиты сохранены. Инкрементальное prepare и MailCut сюда не входят.

## 0.1.14 — кодовый кандидат «конец прогона»

- Принятая граница UID-квоты: при заполненном индексе новый store до проверки RawIndex оставляет 64 КиБ (65 536 байт) core-SQLite сверх лимита 128 МиБ; RawIndex отвечает RAW_INDEX_CAPACITY_EXCEEDED. По решению координатора от 20.10.2026 этот core-edge не блокирует 0.1.14; ранний admission Reader и подключение raw перенесены в 0.1.15 (A-N-3125).
- Единая schema4: обязательная аттестация REGISTERED A+B для чисел, phase final, конечные причины неполноты и публичная ссылка на первый RUN при конфликте.
- Root finalization/autoclose с drain600с, immutable generation и восстановлением после сбоя index/index-origin. Долг фактической публикации повторяется до fast-idle, в том числе после нового RUN проекта.
- Сохранённый EXPIRED у доставки и явное освобождение удерживаемой зоны EXPIRED_EXECUTION_ABANDONED; почта post/0.1.10 не переписывается.

## 0.1.13 — 20.10.2026 · кандидат

- Принятая граница протокола: «покрытие доставок полно, пока RUN закрыт не позже 48 ч после завершения его последнего task». Tombstone task участника с created>=startedAt RUN даёт TASK_PRUNED_DURING_RUN; ранний tombstone не влияет.

- Принятый operator cut064af3c4 сохраняет целиком допущенный закрывающий SDK-request: R/G/native режутся одним фактическим cut. Проверки настоящего FOREIGN_TURN не ослаблены.
- Legacy-проба читает VYPUSK_REESTR; полный runner передаёт эту переменную и включает пять новых test-файлов склейки.

- Пустой выбор bind текущего RUN даёт R_UNRESOLVED_REQUESTS; глобальный unboundRecords остаётся диагностикой. Каждая acked task-доставка текущего RUN требует R-метки, иначе DELIVERY_UNBOUND; master проверяется по operator-claim. Обычная работа вне RUN не портит измерение.

- Явный R source_gap сохраняется в private cursor schema3; старый cursor проходит один ограниченный replay с R_SOURCE_REPLAY_PENDING, неизвестный G без R не считается обычным вводом.

- Finish синхронизирует родителя marker через O_RDONLY|O_DIRECTORY; ложный EBADF от O_PATH устранён, реальная причина ошибки сохраняется в UNATTESTED.

- Отказ привязки R сохраняется как именованная неполнота участника с totals=null; остальные участники сохраняют доказанные числа.
- Native child guard сохранён. Смешанные RUN/job метки проверяются до cache; каждый G-запрос в окне startedAt RUN ≤ at ≤ cut требует точного R SDK-key/session/created/turn; G до старта RUN не судится; G без R не объявляется ordinary.

## 0.1.12 — 19.10.2026 · кандидат выпуска

- Квитанция schemaVersion 3 учитывает доказанный расход родителя и дочерних исполнений Codex/Claude на depth=1. Вложенность глубже первого уровня даёт CHILD_INCOMPLETE; доказанные числа сохраняются, null используется только без доказанного вклада.
- Общий wire source_version/sv1 связывает версию загруженного CLI/SDK с child evidence. Явный список поддержанных профилей и version namespace защищают кеш/дедупликацию; неизвестный профиль даёт CHILD_INCOMPLETE. Второй подставной профиль применяется только в тестовой копии manifest.
- child_capture_end обязателен у обоих активных observer, включая ноль детей. Дочерние исполнения после закрытия наблюдения не считаются; process exit не заменяет observer.close. Сохраняются также границы R/job/cut и порядок seq при одинаковом времени.
- При потере promptId у одного Claude-child сохраняется доказанный другой child. Повторный такт с прежним кешем восстанавливает полный счёт без повторной оплаты.
- Панель различает полное/частичное покрытие; для незнакомого формата показывает «квитанция формата N — этот рендерер её не понимает».
- Окно установки требует OPEN=0 в индексе учёта. AP устанавливается раньше отдельного шлюза 2bc55a08 (продукт638a579e); совместимость и канарейка на настоящей подписке описаны в window/LIST-P-0.1.12.md. Это порядок будущего окна, не сообщение о монтаже.
- Resume usage предыдущего Codex turn исключается только при независимом native proof.
- Экспортёр выбирается единым physical path, включая запуск через current.
- Request-scoped G gap сохраняет отказ своего запроса и не блокирует доказанно другой запрос.
- Старые G до 0.1.12 у Claude сохраняют GATEWAY_USAGE_MISMATCH навсегда: producer записывал промежуточный usage; это не новый дефект. Финальные значения нельзя восстановить из native под видом независимой сверки.
- Финальный Claude streaming usage и capture depth=1 поставляются отдельным кандидатом шлюза 2bc55a08 (продукт638a579e) от 3.1.8; AP-пакет его не монтирует.

- Известный Minor: README-PILOT установлен как L/pilot/README.md; его относительная ссылка window/LIST-P-0.1.12.md не существует по этому установленному пути. Лист берётся с физической package-полки, указанной в П7. README/physical L в этой дельте сохраняются; исправление ссылки назначено на0.1.13.

## 0.1.11 — 19.10.2026 · UMask collector и неполный учёт по участникам

- Collector явно выставляет0755 новым защищённым каталогам и каталогу поколения публичной квитанции: почта читает статусы, участники открывают своиR-cursor, читатель открываетreceipt.json при маске службы0077.
- Ветка `--publish-team` использует уже существующую publisher-маску0027 для наследованияSGID публичныхкаталогов; UMask службыcollector не меняется. Приватные cursor/cache остаются0700/0600.
- Добавлены пробы первогоOPEN и настоящей публикации от оператора внеreader-группы подsystemdUMask0077, порчаSGIDи возврат. НовыйimmutableID `a20-b41-c2-umask-0077`; почтоваяполка0.1.10 этимпатчем не переименовывается.

- Если у участника нет данных, квитанция называет его и причину, сохраняет суммы остальных и помечает итог как неполный. При отсутствии данных у всех итог остаётся неизвестным (null). Публичная проверка сверяет частичную арифметику; панель показывает «нет данных».

## 0.1.10 — 18.10.2026 · raw supplier / engine-account-read / root-карта (кандидат на основе 0.1.9/a20)

- По слову владельца подписка Codex больше не является условием учёта токенов: engine-account-read при наличии, иначе один записанный switcher-point с пометкой, иначе unknown с сохранёнными токенами. UI/publicReceipt сохраняют источник подписки и неизвестную корзину; необязательная карта не расходует metadata/G-срок.

- Исправления reader после review Беты b35: конечный отдельный ledger/native Meter16МиБ/3с; пропуск завершённой слишком длинной строки; непригодные claims не портят привязки, старые ложные labels очищает миграцияv2; единая policy проверяется по грамматике писателя, при отсутствии/ошибке R не читается с видимой пометкой без fallback.

- Уточнение привязки R по решению координатора: неоднозначность ограничена (sessionId,sessionCreated,turn); разные ходы одной сессии относятся к своим заданиям, конфликт другого хода их не обнуляет.


- Профиль R содержит обязательный participants[].tgService для сторожа «служба active, R mtime старше300с». Collector проверяет форму поля и отделяет метаданные службы от неизменяемой идентичности источника; systemctl не вызывается читателем.


- Единый policy R: fileMaxBytes ограничивает новую порцию читателя, recordMaxBytes — строку; незавершённая строка сохраняет offset. Список R берётся из source-profile participants[].runtimeSource.raw. Отдельных readerMaxBytes/warningPercent нет.


- Уточнён стабильный ключ R-request: SDK requestGeneration + requestId внутри uid/recipient источника; повтор R-generation не прибавляет расход. Кеш и private-проекция учитывают SDK-generation, состояние b31 переносится с сохранением cursor/фактов/привязок.


- R стал справочным инкрементальным источником: SQLite сохраняет завершённые строки и cursor атомарно; смена inode/обрезка начинают новый хвост без сброса прочитанных фактов. Повторы не удваивают usage. Привязка только по удостоверенному заданию; только ход, заявленный двумя заданиями, исключается. Квитанция показывает source-счётчики негодных/непривязанных записей и одну пометку возможной потери при обрезке. Полный R-перечит и общий wall30/35с как условие отказа сняты; G и арифметика сохранены. Общий policy принадлежит поставке Альфы.

- Окно (Аврора, 18.10 10:2xZ): `window/prepare-window.py` берёт прежний публичный манифест из `installed_check` живой записи (`postal-layout-<c_prev>[a-z]?.json` с проверкой суммы), а не по угаданному имени `postal-layout-<c_prev>.json`: после окон почты и учёта 0.1.9 запись связана с `019p`/`019u`, и прежний код отказывал бы («unexpected … public manifest binding»), а новый манифест потерял бы их строки. ID ядра не меняется: `window/` не входит в release.

- Базовый cmd_init создаёт каталог прогона и tickets отдельно с mode0700; промежуточный родитель больше не зависит от umask. На sadik адаптер по-прежнему заранее создаёт их через child_dir с явным0750; сквозной init под0002 остаётся REGISTERED.

- Root-фикстуры не зависят отumask: явные права почтового каталога, кода экспортёра, fakeNSS, проекта/контроля и восстановления статуса. Public installer создаёт новые каталоги0700 до проверки; старые unsafe остаются отказом. Настоящий save(state) фиксирует временный state.js в0600 перед записью, формат/события не меняются.


- Permission-класс на основе432368b3: явные режимы новых public/init-каталогов и state600; общая fixture_mkdir создаёт каждый уровень с явнымmode, не меняя существующие объекты. Фикстуры root-источников и READY-конфига задают права явно. Guard не ослаблен; три файла фикстур legacy/rollback Гаммы оставлены её руке. Состав и общий результат проверяются внешним полным стендом с raw_supplier Авроры.

- Установщик: новый каталог создаётся0700 до owner/mode проверки и fchmod; существующий0775 по-прежнему отказывается без исправления. Общаяumask и проверка существующих путей не меняются.


- Откат G3.1.8→3.1.6: без gatewayTransport наличие segments/manifest/source рядом с G означает RETENTION_GAP до открытия одиночного файла. Общая охрана регистрационного и расходного чтения; подстава A-в-seal/C-в-active доказала ложное REGISTERED при физическом снятии охраны и отказ после возврата.

- П8: Codex proof engine-account-read, root-issued accountRef→codex-3/4; неизвестное ACCOUNT_UNMAPPED, отрицательные ACCOUNT_CHANGED_DURING_TURN/ACCOUNT_ROUTING_OVERRIDE/ACCOUNT_READ_ERROR/ACCOUNT_READ_TIMEOUT остаются именованными incomplete. authEpoch берётся из raw писателя3aeb34d4 без вычисления в AP. Карта читается один раз на normalize, относится к отдельному бюджету метаданных.
- B: настоящие ced3 flat S0 и25d migration S0→S1 проверены на том же частном G-файле; две заявки и отдельные private root-снимки регистрации, без живого cutover открытого прогона. Root wrappers сохраняют физический package после tmpfs/tmp.


- Уточнение п7: последним решением06:40 восстановлен runtime3a49a8e7: и переход, и уже terminal UNBOUND дают unbound без failed; промежуточная политикаe06 отменена; отдельная postal maintenance-транзакция удаляет завершённую строку без новой заявки. Pending сохраняется, неподтверждённая origin/ошибка публикации остаётся failed. Cleanup асинхронный, не обещание синхронного DELETE.
- От778a1ee7: sourceCreatedAt до P1, строгая граница рождения и две новые ранняя/поздняя заявки; shared policy CLI schema3 с проверкой legacyFileMaxBytes↔G_WRITER_LIMIT и maxRecordBytes↔G_RECORD_ALLOWANCE.
- Node: SHA256+identity до/после чтения, exec того же пути; memfd удалён. Гонка hash→exec явно вне модели owner/root.
- Незавершённый active_gap intent отказывает; процессный G_ACTIVE_REPLACED сохраняет SOURCE_GAP, .replaced не raw. Пробы нужного raw без seal и seal без raw.
- Окно повтора вынесено в данные выпуска формулой (180с сейчас). Конечные root UNBOUND+terminal=True удаляются из очереди только при совпадении runId/SHA; pending сохраняется. Отдельный drain lock/nonterminal sentinel закрывает гонку очистки.
- Разовая ограниченная уборка как autopilot-post; отдельная immutable postal0.1.10 полка и ExecStart mail. Совместная остановка collector+mail обязательна. Старые postal0.1.9, copy/notice программы и протокол не переписываются.
- raw supplier (Аврора 90ba2e77) и его поставка в release/tools (9b5c4cdf). Итоговый ID свода e0ca101a (0.1.9) + 2fc352e0 (0.1.10): a20-b15-c2-team-online → a20-b30-c2-account-map-raw-supplier.
- groups6c52, operator_tuple, R incremental и gap-time вне дельты. Авторский монтаж не выполняется.
- Сохранены панель Марка (back-link, stopped, time-note), независимые scoped/team карточки, MIT/NOTICE, census B-N-2111 и window/katalog-okno.py из принятой основы0.1.9.

## 0.1.9 — 17.10.2026 · сводный: командный online usage и панель прогонов (сведение — ворота Вениамина 20:25 МСК)
- Сводный выпуск (Аврора, наряд Забавы 17.10 16:59:52Z) поверх принятого 0.1.8: UI Марка `abc53b62` вместе с его основой — страницей прогонов Зари `c647904e` (в 0.1.8 не входила); AP-потребитель Гаммы `c7558271` + `c88c3885` (карточки v1 рядом с командной квитанцией v2); R-нормализация Беты `e3287bac` + документы `76332cf5`; B-N-2111 Авроры `ec0c5c29` (`katalog-okno hod`, legacy по наибольшей `aN`, перепись пропускает текучку вне области прогонов, повтор прохода только на `SCOPE_CHANGED`).
- Новый immutable ID ядра `a20-b15-c2-team-online`, `local_suffix` `-b9` → `-b15` (r4: сведены байты части B Беты — `ap_sadik.py`, шаблон; её кандидатные `a17-b11/b12/b14` и мои промежуточные `a18-b10`, `a19-b11` в бой не ставились и сменены): кандидаты Гаммы/Беты несли `a17-b9-c2-team-online*` — то же `a17-b9`, что у 0.1.8 в бою, при других байтах; промежуточный `a18-b10` (сведение `1ac9d2b2`…доки `2964dcaa`, в бой не ставился) сменён, потому что LOW панели Гаммы `7c22a90a` (покрытие Claude из снимка, без константы «Сова») меняет байты части B. Оба lock пересчитаны по сведённым байтам.
- Окно (r5, СТОП окна 1 на A07 18.10 08:50Z): `window/directories.py` и `window/return-window.py` больше не несут литералы task окна 0.1.7 (`AP017-U1`, `AP017-RECOVERY`); task = `'AP'+c_new` считает `prepare-window.py` один раз, пишет в `PREPARED.json` и даёт его же `--punkt` всем пяти группам монтажа (`smontirovat-fajly` при `--okno-id` сверяет task == `--punkt`, B-N-2111 (23)). ID ядра не меняется: `window/` не входит в release.
- Стенд пакета объявляет `test_dashboard_ui.py` Марка (в его дельте стенд не менялся — без объявления стенд отказывал).
- G registration: отбор целых generation по наличию свежей строки; старый start/binding долгого хода не отрезается, wholly-old observer исключается целиком, межпоколенное перемежение и AMBIGUOUS сохраняются. В одной дельте с ограниченными повторами180с.
- Регистрация: повтор только доказанной асинхронной дописки до accepted_at+180с; неоднозначность, бюджет, просрочка и неизвестный отказ конечны. Root сохраняет terminal/retryUntil и стоп до owner-чтения; legacy UNBOUND не получает неявный повтор. Кэша нет.
- Уточнение: проверены все15kindsced3, вместимость128MiB названа по размеру строки сLF; несущий kernel-рубежoperator_tuple605 сохранён и документирован, согласованная подделка start/boot отвергается его пробой.

- Early G registration calls Gamma6c52 process_requests under the source owner, before run creation, and preserves whole kernel ancestry + SDK/native proof. Input window: server accepted_at minus600s.
- Fix hidden ambiguity with interleaved observers: no timestamp-based early seek stop. Safe bounded full-prefix verification refuses unproven history; physical short-tail requirement needs a trusted boundary and is explicitly open.

- R caller: receiver captures peer ancestry/birth/boot before TLS/body; root matches G to that snapshot, ignores actor process hint; duplicate runId is refused.
- Operator accounting window ends at guarded per-run finish proof. Post-finish turns are excluded; a turn crossing finish remains named incomplete. Incremental normalizer is proposed as release0.1.10, outside0.1.9.

- Асинхронный caller: init одним bounded one-way запросом в AP-почту сохраняет runId и точное время запроса; только kernel UID master может добавить SQLite intent. Никаких root/sudo прав Мастеру и ACK перед исполнением.
- Root usage collector дренирует очередь до idle, проверяет root-owned source profile, G process identity и SDK/native tuple, ретроспективно связывает расход с начала; дубли идемпотентны, очередь ограничена и обслуживается справедливо. Неизвестный контекст/старая почта/недоступный клиент — named UNBOUND/incomplete, не 0.
- На панели отдельный статус регистрации; scalar hints не подменяют root evidence. Postal0.1.9 включает новый протокол и unit ExecStart: требуется отдельный принятый монтаж server+CLI, без замены старых immutable postal0.1.3/0.1.4.
- Копийная оценка мины raw R: ~12,7тыс. requests до16MiB одного R при одном request/turn; реальный общий предел наступает раньше. Предложение инкремента Беты в плане, код инкремента не заявлен.

- R-нормализация TG 3.1.13 `4f80e7f0`: authenticated AP-mail → receipt/native claim → SDK request → jobId без эвристики последней job; прежний consumer побайтно сохранён.
- Owner exporter с настоящими UID/GID/groups=[], root register/close и индекс из доверенной декларации, общий cut и бюджет; prep failure снимает старый observed, неизвестное остаётся именованным incomplete/null. Launcher-вызов регистрации до первого AP init ещё требует подключения назначенной рукой.
- G принимается в consumer-совместимом формате; raw G1fc не декодируется. G/raw в пробах синтетические, живой 1fc не проверен. R prep пока bounded full pass, без incremental-cache: сверх 16MiB/3с → BUDGET_EXCEEDED.

- Root timer60с: без OPEN — только индекс и выход без HOME; с OPEN — owner-readers, постфактум R/G/raw, ограниченные IO/время и incremental cursors.
- Базовая receipt v2: оба движка, участник/подписка, закрытый срез/pending, строгие null/reason и public projector/панель; не-модельная публикация сохраняет operator/gates/tickets.
- Native Claude Agent/Task и неподдержанный spawn — именованный incomplete, subtotal детей null; нет обещания native покрытия по одному reader.
- Runtime R и gateway G поставляются отдельно; окно gateway с рестартами отдельно. Полная final/чат — следующая ступень.

## 0.1.8 — 17.10.2026 · откат r2-LOW (Гамма; ворота Вениамина: код 06:34Z, census r2-LOW 06:37Z)

- Откат прогона: область источника — owner-census вместо литерала `/opt/master`. HOME не граница: production-корни каждый раз заново
  выводятся из видимых локальных mount и обязаны совпасть с принятым census (`tools/ap-run-inventory.py scan`,
  `lib/owner_inventory.py`, `lib/accepted_inventory.py`); новый, исчезнувший или изменённый record, неизвестная FS, исчерпание лимита
  (глубина 256, файл 16 MiB, обход 60 s) — RUN_INVENTORY_UNPROVEN/отказ, не ноль. Принятый census r2-LOW — 9afce991 (вне пакета).
- Окно отката (`tools/ap-rollback-window.py`): барьер fanotify снят по решению Забавы вместе с permission-reader, PID1 FDSTORE и ack.
  Вместо них — freeze `master.service` и `coder-gateway-master.service`, проверка native idle и полного набора UID master
  (real/effective/saved/fs, PID/starttime) до и после, ровно два MainPID без детей, crontab master отсутствует; собственный transient
  root job с RuntimeMaxSec 180, cleanup снимает только свой freeze.
- Граница (принятая посылка координатора): это СНИМКИ, а не непрерывное доказательство — короткий root-запуск между снимками не
  ловится; privileged root и параллельный admin freeze/thaw/restart вне гарантии. Новое PID/identity — unproven, не успех.
- Код r2 `4f020acb` (родитель — метка 0.1.7 `cc1947d6`), 28 файлов +2973/−22; эта запись — номер и CHANGELOG.
- Оконные помощники от номера (Искра, слово Забавы 06:49Z): `window/prepare-window.py` берёт номер из `package.json` (= `RELEASE.json`),
  прежний выпуск — из записи реестра (обязан быть вторым заголовком CHANGELOG), прежнюю раскладку и принятый `current` — из
  `postal-layout-<прежний>.json`, тексты записи реестра — из `RELEASE.json["registry"]`; имена раскладки и пунктов — `AP<номер>`.
  `window/tag-record.py` берёт номер из `package.json` выпущенного исходника; `window/env-template.sh` выводит OPS из своего места,
  KIT и PUBLIC — из имени OPS (`/root/AP<номер>-<рука>-<дата>`), негодное имя — явный отказ.
  `window/restore-window.py` (возврат файлов окна) берёт новую раскладку из описи окна (строка группы 4), а не `postal-layout-017.json`:
  прежний на подготовке 0.1.8 отказывал «REFUSE non-core target» — возврат окна 0.1.8 сорвался бы; на 0.1.7 оба дают FILES_CHECK_PASS. Проба: на подставе окна 0.1.7 старый и новый помощник дают
  план побайтно (193 + 2 файла), порча имени раскладки — 9 расхождений.
- Сведение выпуска (Аврора, наряд Забавы 17.10 12:42Z): код выше + публикационная подготовка Зари + документация и NOTICE Альфы.
  Заря: B3 — пометки `vorota-ob:dopusk` у двух синтетических образцов секретов в `test/test_sadik.py` (AST тот же); B6 — в `files`
  `checks/layout-check.py`, `tools/ap-rollback-window.py`, `tools/ap-run-inventory.py`, `tools/prepare-mail-tls.py`; B7 — `author`,
  `repository`, `engines.python` >=3.10; `test/` вне npm-пакета. Альфа: NOTICE с MIT upstream Nick Vels в `files`, шапки «Derived from»
  в восьми overlay-файлах, пересчитанные пины части B. Рабочие черновики `ROLLBACK-CANDIDATE.md` и `TLS-CANDIDATE.md` из пакета
  убраны (решение Забавы 17.10 13:05Z); описание инструментов отката и TLS — в этом журнале.
- Новый immutable ID ядра: шапки изменили байты восьми файлов части B, поэтому `local_revision` `a16-b8-c2-rollback-r2` →
  `a17-b9-c2-rollback-r2`, `local_suffix` части B `-b8` → `-b9` (правило `runtime/part_b_layout.py`), `part_b_manifest_sha256` пересчитан.
  Каталог `releases/…-a16-b8-c2-rollback-r2` не создавался и под новые байты не используется. Логика runtime не менялась.
- Перепись прогонов строгой политикой (B-N-2107): census и боевой `scan` дают одинаковое закрепление — основа Гаммы `61d9b177`
  (`lib/owner_inventory.py`, `lib/accepted_inventory.py`, `test/test_attestation_pin.py`) и проверки Беты `f1fed46e`
  (`test/test_census_pin_policy.py`, фикстура `hidden-production-9afce991.json`, оба модуля объявлены в стенде пакета).
- Каталог прогонов в окне обновления: ядро a17 требует `/var/lib/dsh-autopilot`, базовый `install.sh` его не кладёт, а
  `ap-run-inventory.py bootstrap` требует ограду окна отката. Новый помощник `window/katalog-okno.py`: своя ограниченная ограда
  (freeze `master.service` и `coder-gateway-master.service` внутри временного держателя, его остановка размораживает, предел
  RuntimeMaxSec), bootstrap примитивом `run_catalog.bootstrap` по census, снятому в окне, проверка хозяев и режимов, сравнение
  census с повторным scan перед переводом `current`, проба init→finish от `master` и возврат (каталог окна без закреплений удаляется).
  Ограда доказывается В МОМЕНТ bootstrap/сравнения примитивами `lib/operator_window.py` (profile, unit_snapshot, check_binding,
  group_pids, operator_census): держатель жив и до предела ≥ 120 с, единицы заморожены с прежней идентичностью, процессов учётки
  оператора вне единиц нет; `window_id` — ID открытого окна монтажа из `forward.id`, сверенный с записью `montazh-okno` (ворота Вениамина 17:14 МСК).
- `test/legacy_window_probe.py`: копия окна отката стартует с последнего legacy-ядра из `managed` (без `run_inventory_protocol`), а не
  с живого `current`. При `current` a17 прежний тест краснел всегда: init ядра a17 под `bwrap` (файлы root видны как nobody) —
  «unsafe catalogue parent» даже на годном каталоге; на r3 — «нет /var/lib/dsh-autopilot». Решение Забавы 17.10 14:25Z.
- Документация B-N-2112 (Альфа):
  - RU: READMEs сверены с установленным AP0.1.7/a15-b7-c2, upstream9fc898cb, активными mail/copy0.1.3 и клиентом/notice0.1.4. Уточнены отдельные Unix-участники команды, postal receiver-вход, physical pin и отдельная раздача ap1. Первоначальная документационная дельта не меняла runtime/skill/бой; лицензионное дополнение ниже отдельно меняет комментарии overlay и их пины.
  - EN: READMEs checked against installed AP0.1.7/a15-b7-c2, upstream9fc898cb, active mail/copy0.1.3 and client/notice0.1.4. Clarified separate team accounts, postal receiver entrypoint, physical pins and shared ap1 serving. The initial documentation delta left runtime, skill and production unchanged; the license supplement below separately updates overlay comments and their pins.
  - RU: Живая Claude-проба17.10 подтверждена до private writer; Codex в текущей пробе не измерен. Оба фильтра0.1.7 всё ещё скрывают Claude. Приёмка расхода, наличие карточки и исторические пробы разных выпусков различаются.
  - EN: The 17 October live Claude probe is confirmed through the private writer; Codex is unmeasured in the current probe. Both 0.1.7 filters still hide Claude. Usage acceptance, card visibility and historical probes of different releases are distinct facts.

  - RU: В первых абзацах указаны Никита Велес, его Автопилот и [nick-vels/skills](https://github.com/nick-vels/skills) как источник решения; наш пакет — его применение на DSH-серверах. Добавлены pin из source-lock.json, сверка main 11:39:06UTC (SHA совпал), обязательный разбор upstream перед каждым местным выпуском и пофайловый перечень patches/overlay.
  - EN: Opening paragraphs credit Nikita Veles, his Autopilot and [nick-vels/skills](https://github.com/nick-vels/skills) as the original solution; our package applies it on DSH servers. Added the source-lock.json pin, the 11:39:06UTC main check (matching SHA), mandatory upstream review before each local release and a per-file patches/overlay inventory.

  - RU: Лицензионное дополнение B-N-2112: добавлен NOTICE с полным MIT upstream Nick Vels и перечнем производных файлов; NOTICE включён в files package.json. Восемь overlay-файлов получили комментарий Derived from, сводный patch и SHA256-пины пересчитаны. Логика runtime, версии и бой не менялись. README RU/EN содержат одинаковые факты и ссылку на NOTICE.
  - EN: B-N-2112 license supplement: added NOTICE with Nick Vels’s full upstream MIT text and the derived-file list; package.json files now includes NOTICE. Added Derived from comments to eight overlay files and regenerated the combined patch and SHA256 pins. Runtime logic, versions and production are unchanged. RU/EN READMEs carry matching facts and the NOTICE link.

  - RU: r4 по разбору «как посторонний»: явно требуется Python 3.10+, установка на другом сервере отделена от примера sadik. Названы предварительная учётка master, ограничения reader-группы, отдельный bootstrap каталога, почтовый профиль и раздача; роли нашего монтажа не выданы за внешнюю инфраструктуру. Ошибочный current/skill и старые SHA в рабочих примерах уже исправлены r2/r3. Package metadata остаётся отдельной дельтой Зари; условие нового immutable ID при интеграции сохранено.
  - EN: r4 follows the outsider review: Python 3.10+ is explicit, and prerequisites for another server are separated from the sadik example. Documents the pre-existing master account, reader-group constraint, separate catalogue bootstrap, mail profile and dashboard serving; local installation roles are not presented as external infrastructure. The invalid current/skill argument and stale SHAs in operational examples were already corrected in r2/r3. Package metadata remains Zarya's separate delta; integration still requires a new immutable ID.

## 0.1.7 — выпущено 17.10.2026 / Released

- RU: Root-вход Claude связывает обычный AP envelope.run с почтой, квитанциями, DSH-ходом и полным набором SDK-запросов. Writer принимает Claude только из root-owned снимка; числа/границы модель не поставляет. Physical core a15-b7-c2. Показ Claude остаётся ограничен двумя фильтрами; живая private-проба после выпуска не открыла карточку автоматически.
- RU: Время новых root-снимков и window select_turn выводится в UTC с6знаками; observer сравнивает мгновения. Старые акты0.1.6 сохранены.

- B-N-2090b: root-only mail/receipt/DSH origin entry for Claude, complete parent/child request census and changed-ledger refusal. Historical G0 origin remains a separate explicit branch. No model-supplied request list or timestamps.
- Claude writer now requires UID0 snapshot ownership; Codex self-UID behavior is unchanged. Root publishes numeric JSON under protected /var/lib/autopilot-usage/<runId>/public; private origin stays0700/0600.
- Both Claude public/UI hide barriers stay until one observed live caller proof and independent acceptance, followed by a separately gated visibility change. The deployed 0.1.7 filters still hide Claude after the later live private measurement; this release does not enable the card automatically.
- Local core a15-b7-c2; upstream and mail runtime unchanged. Accepted be9 reader gains only root admission/ledger provenance comparison; builder0b stays byte-identical. Root fixture suite is declared in the package stand.
- FORMAT-CONTRACT explains AP016's three-versus-six fractional time digits. New root snapshots and window select_turn use UTC six-digit output; observer compares instants (accepted3e2bac03). AP016 stored evidence is retained.

## 0.1.6 — выпущено 17.10.2026 / Released

- RU: Числовые снимки привязаны к run, повтор не суммируется, чужой движок не освежается. В public/renderer включён только Codex; это возможность показа, не доказательство нового живого замера. Установлены childproof reader be9 и builder0b; тогда live AP-origin producer ещё отсутствовал и был добавлен отдельно в0.1.7. Прежние pinned run не мигрируют автоматически.
- RU: Трёхзначные и шестизначные дробные секунды старых актов могут задавать одно мгновение; исправление observer принято отдельной пробой, исходные доказательства не переписывались.

- B-N-2090: Master writes run-bound numeric snapshots without summing repeated measurements or refreshing the other engine. Existing pinned runs keep their prior release.
- Codex is shown on the public dashboard. Claude remains private and its card is absent until a later accepted release has a verified live caller and one live observed run; a manually supplied observed snapshot does not enable it. No visibility flag or automatic enablement is added.
- Ship Gamma's accepted child-completeness reader be9f62ef, manifest builder0b2410db and36 unchanged behavioral tests. SDK spawn pairing proves declared children; omitted or unsupported child bindings give incomplete/null. The builder supports script-produced G0 records only: a live AP run→DSH binding producer, export ingest and threadguard are still absent.
- Flat usage schema32649d9e stays unchanged for private/wire snapshots; public exports only Codex. The proposed T1 exact-byte export/T2 separate-turn/T3 original-Master-thread path needs its separately accepted implementation/live proof, not a historical G0 snapshot.
- Local core revision a14-b6-c2; source main9fc898cb, postal client/notice0.1.4 and mail/copy0.1.3 remain unchanged.

## 0.1.5 — выпущено 17.10.2026 / Released

- RU: MAIN закреплён на9fc898cb (skill metadata2.1.0), убрано дублирование ссылки AGENTS; Codex-counter включён в пакет и physical tools. В этой версии это отдельная ручная диагностика без интеграции с панелью. Её исторический выпуск не является текущей живой приёмкой Codex.

- Pin upstream main `9fc898cb` (skill2.1.0); the one-line AGENTS.md reference avoids duplicate attachment. Rebase B overlay and pilot contracts without changing their executable behavior.
- Ship the Codex run counter and its README in npm and the physical core release's `tools/`. Master calls it manually at final acceptance; stdout/private report only, no state.js/dashboard integration. Gateway completeness remains explicit and mail executor homes are excluded.
- Gateway completeness refuses an active selected turn without a gateway total (exit2); completed-turn measurement uses an explicit end bound.
- Core release `9fc898cb…-a13-b5-c2`; mail client/notice runtime0.1.4 and active mail/copy0.1.3 remain byte-identical.

## 0.1.4 — выпущено 16.10.2026

- B-N-2084: `autopilot-mail send --help` explains stdin body input and that the CLI creates the new `--request` file; an existing file must have canonical bytes.

- CLI reports fixed client-local request/storage/notice/frame refusal codes in stderr and retains exit2. Canonical request conflicts and durable-before-ACK checks remain strict; raw exception text/payloads are not exposed. Library OSError subclass/errno/filename are preserved.
- The copy fixture waits up to5 seconds for the addressed sent outcome before SIGINT. Delay0.2 seconds, corruption/return and ten delayed repeats passed.
- Client runtime and notice template use0.1.4. Existing mail/copy processes and their active unit paths remain0.1.3; the protocol, credentials and their runtime bytes are unchanged. This release is a client update.

## 0.1.3 — 16.10.2026

- Mail/copy startup emits runtime_version and source_module for current-invocation P7 checks; loaded is not a claim of RPC availability.

- Pinned TLS authenticates the Unix mail server before request bytes in DSH user namespaces; kernel actor/recipient checks remain strict. No plaintext downgrade.
- Mail reports systemd READY after bind/listen; copy follows ordered restart and retries only proven pre-send connection loss for up to10 seconds. Controlled exit2 stops automatic restarts; recovery requires an explicit start.
- The deployment supplies server and all clients atomically. Four ExecStart paths and postal runtime/manifest move to0.1.3. The existing sadik watchdog reads certificate expiry (14days) and mail-active/copy-active through its separately versioned companion release.
- New deployment certificate/key pair is prepared privately. No credential or live service is changed by this package build. Graceful copy SIGTERM and detailed TLS refusal diagnostics remain named limitations.

## 0.1.2

Separate team post on AP-011: authenticated socket, durable nonce IDs, retention and resource limits; postal layout is CORE. Service-generated send/ACK receipts use agent bots, independent flags, guarded sendMessage targets, bounded durable retries and episode alerts; frozen receipts survive body GC. Separate copy service and root config/key-prefix verification are CORE. The package runner declares all twenty unittest modules.

## Исторические записи ранних сборок / Early build history

- a12-b4-c2: rebuild pilot caller on accepted bc285e23 scope/limits/control-out delta; team mail transport not included.

## 0.1.1

- Скилл `skill/dsh-autopilot/` (Искра, r6/r7, ворота Вениамина 07:33:40Z и 08:20:01Z): поправки первого окна, ротация ключа, скрипты окна `scripts/` (01–06, otkat, rotaciya-klyucha, образец параметров). `skill` добавлен в `files` по решению Забавы 15.10 08:20:35Z — скилл и скрипты едут с пакетом на свежий сервер.
- Дельта по требованию Вениамина07:44:26Z, принятая Забавой07:44:41Z: expectedFailures/unexpectedSuccesses дают2 (обычные failures/errors —1); вместо240с на каждый файл — один бюджет480с с именем текущего файла, остановкой группы и отказом запуска остатка. В README — будущий @root и адресный предел обхода≥600с, перечень не изменён.
- B-N-2069 (4): `test/stend-dsh-autopilot.sh` запускает восемь объявленных `test_*.py` с проверкой непустого и полного списка. Счёт покрытия берётся из объявления; пустой модуль, skip, недостающая среда или timeout — слепота2, провал теста —1, полное выполнение —0. Имена провалов и итог печатаются.
- Root готовит только временные fixture; installer/UID-пробы идут отroot, runtime/Б отmaster с пустым HOME. Исходный архив закреплён; raw и переносимая Б-fixture собираются без установки в бой. Полная охрана А проверяется существующими install/composition-тестами.
- Перечень обхода не изменён; включение стенда в обход — отдельный такт Гаммы. Runtime/source-lock/vendor не менялись.
- Скилл, дельта 3 (Искра, 15.10 ~17:4xZ; слово владельца 18:26/18:29/18:32 МСК — два пути): `reference/PUT-B-rukami.md` (путь Б руками, опись действий и признак полноты), `reference/REZHIMY-po-kodu.md`; в скриптах — `03` задаёт `AP_PUBLIC_ROOT` через загрузчик (падал unbound), охрана `{ A && B; } || ap_stop` вместо молчащего под set -e `A && B` (02, ap_new_file), `otkat.sh` — файлы дочерних окон в страховку до `otkat-proveren`, `mask` после. В `skill/` 13 файлов (ряды полки 0.1.1 — 57).
- Скрипты, дельта 4 (AP-OTKAT, Искра 15.10 ~19Z; находка прибора Гаммы `d5361f28`: откат дельты 3 после 02+04 — 23 → 212 путей, 191 отличие): `02` пишет перечень возврата `<SAVE>/restore-paths.txt` (П7, новые родители, enable-ссылки, `.install.lock`, staging) и `env.sh` сразу после открытия окна; `otkat.sh` — сверка перечня со страховками и планом основного окна ДО первого действия, возврат всей раскладки (отсутствовавшее — в карантин SAVE, бывшее — из страховки), юниты `not-found`, `mask` не ставится. Прибор Гаммы 5/5 (23 → 23), строки стенда обрывов 02/04 и порчи — 9/9. В `skill/` по-прежнему 13 файлов.
- Скрипты, дельта 4в (условие ворот Вениамина 15.10 19:05Z): `02` сразу после `install.sh` пишет снимок «после» `<SAVE>/posle.json` по путям, бывшим до окна; `otkat.sh` возвращает такой файл байтами «до», только если живой = «до» или = «после», иначе СТОП до первого действия (чужая правка — например, учётки соседнего окна в `/etc/group` — не затирается). Проба: прежний откат на чужой строке в `/etc/group` — код 0 и строка стёрта; новый — код 2, строка цела. Приборы Гаммы без регресса: 5/5 и 4/4.
- Скилл, дельта 5 (решение владельца 15.10 21:46 МСК, для обоих скиллов): `reference/PUT-B-rukami.md` переписан плоской инструкцией — 100 шагов «Сделать / Результат / Если не так» без многострочных фрагментов-скриптов и функций `b_*`; опись А-номеров (293) и признак полноты — приложениями; SKILL «Два пути» и «Ведение» — под новую форму. Код скриптов не менялся.

## 0.1.0

- Часть А: офлайн-установщик общей копии Autopilot v2.1.0 (326c6ea3), исходник архивом с SHA256; root-owned sources/releases/current и общая ссылка скилла.
- Проверка и план без записи; повтор без смены файлов/метаданных; именной ремонт; активация после записи release.
- Пакет пока содержит только часть А. Выгрузка панели, замок оператора, закрепление resume и почтовые исполнители — отдельные части команды.
- Условие Вениамина LOW-MED-3: установщик только раскладывает файлы; runtime ap.py от master, с отказом root/прочих учёток до upstream-кода. Полный source SHA сохранён, местная сборка a2, исторический pyc только в sources; разбор кода передан отдельно.
- Догоняющая дельта Забавы 18:11:55Z: bootstrap autopilot-view, членство Master, public/master 2750; readonly modes, NSS-подстава через --root, идемпотентность и repair. Местная сборка a3; службы и credential не изменяются.
- Стык Д (d06f7530): подготовка LoadCredential без вывода значения; отсутствующий/пустой ключ генерируется приватно, существующий сохраняется, небезопасный даёт отказ. Местная сборка a4; пересылка nginx и enable остаются назначенной рукой.
- Добавка Забавы 18:14:49Z: вендор без orphan pyc/cache, отказ байткода в source(), runtime -B и отказ отличающихся прав общих родителей без REPAIR. Местная сборка a5; источник SHA прежний, фильтр и новые суммы закреплены.
- Условие пилота Забавы 18:34Z: argv guard запрещает serve/неизвестный ввод/update, принудительно no-serve и физический release; guard после шебанга/entry0755. Finish не порождает stop при no-serve, sources не исполняются. Местная сборка a6.
- Решение Забавы 18:47:11Z: public2751, Master вне reader-группы, отказ существующего членства без автоматического удаления; местная сборка a7. Раздел master2750 и файлы0640 сохраняются.
- Решение владельца 18:59:21Z: main46060c3 вместоstable326, a9-b4; закреплённаяБ159, full-map overlay, commits/resume guard; guarded measure-run вrelease, memory/model-counter audit и изолированные пробы.
- Уточнение Забавы19:16:56Z: ключ только64lowercasehex, генерация лишь отсутствующего; empty/invalid existing отказ без перезаписи. Local a10-b4; права0600/private0700 сохранены.
- Candidate-only стыкВ/c1209609: pilot_layout доставляет четыреpilotфайла вrelease; roleRootrefusal/операторMaster/receiverCoders, local a11-b4-c1. Runtimeпилота ещёнепринят, findingsприписаныавтору.
