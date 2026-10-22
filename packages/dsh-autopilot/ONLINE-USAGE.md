# Компонент счётчиков 0.1.16: приблизительный счёт по времени

`tools/collect-team-usage.py` через timer/service читает только хвосты end Codex/Claude:≤65536Б/источник/тик, partial≤4096Б. Известные источники читаются также после CLOSED. Одна JSON-state версии3 хранит offsets и историю ts/чисел/идентичности end, без текста. Ключ (participant,sessionId,sessionCreated,turn) исключает повторное начисление. Codex thread является sessionId; отсутствующий у этого источника sessionCreated остаётся null. Claude epoch используется как дан, а старое WIP-состояние без epoch явно отказывается. Разные неизвестный/известный epoch автоматически не склеиваются. История — минимум24ч, либо от старейшего незавершённого RUN минус600с; жёсткий предел32768 строк/8MiB, старейшие вон с неполнотой.

Roster — весь состав `source-profile.json:participants` плюс заявленные участники; поле participants у запроса необязательно. Одна чистая функция каждый тик пересчитывает незамороженные RUN по roster и end в [startedAt,closedAt+600с]. Поздняя регистрация получает сохранённые end; расширение roster и новый пересекающийся RUN пересчитывают предварительные суммы. После grace per-RUN record в time-state.json заморожен, поздние события его не меняют. Schema5/панель/индекс показывают≈ и предварительно/итог; нет строк — null, parent_only без отдельной неполноты.

При распределении end сначала выбираются RUN, где участник был открыт в момент end. Если такие есть, grace закрытых RUN не участвует; при двух открытых расход не начисляется никому, у обоих неполнота. Если открытых нет, действует прежнее окно grace. Поздняя регистрация пересчитывается по сохранённой истории без LATE_REGISTRATION: полная сумма имеет observed. Потеря при startedAt ≤ lostThrough участника даёт STREAM_GAP; при более позднем start эта прежняя потеря не относится к RUN. endThrough не является потерей, его поддержка убрана. При чтении прежней private state3 снимается устаревший флаг LATE, включая frozen RUN, без изменения чисел. Числа ранее замороженного итога не пересчитываются. Старые опубликованные квитанции с LATE больше не проходят finite v5 allowlist и должны быть заново опубликованы из private state. Это ручная миграция прежнего WIP: CLOSED без publishPending активный caller автоматически не переиздаёт, очистка private-флага не переписывает старый public JSON.

Основной вход RUN — новые строки `usage_registrations` из `source-profile.json:mailDatabase`. Сборщик один раз за тик открывает БД через SQLite URI `mode=ro` и `query_only`, выполняет SELECT по rowid и закрывает снимок. Доверие — обычный single-link файл службы `autopilot-post`, без записи посторонним; измеренный production mode0600. Из строки берутся runId/project/startedAt, пути ограничены настроенными projectRoots. Курсор с path/dev/inode/rowid и якорем последней строки хранится в той же JSON-state. Замена БД или повторное использование rowid после очистки вызывает безопасное повторное чтение; индекс/история не удваивают счёт. Чтение ограничено128 строками/тик и1с SQL-времени, request_json материализуется не больше8193 символов; валидный producer допускает8192Б. Будущий startedAt ждёт следующего среза. Время начала не обрезается; сохранённые end пересчитываются без ложной неполноты LATE.

Индекс RUN сохраняется до продвижения курсора. После этого collector пишет прежнюю root-квитанцию регистрации REGISTERED либо terminal UNBOUND. Прежний почтовый writer по ней очищает очередь при следующем register-run; collector SQLite не изменяет. ACK-файлы, их каталог и его запись в родителе синхронизируются до единственного сохранения state. Это ACK потребления, не новый producer root-деклараций и не доказательство R/G. Совпадающий ACK идемпотентен; неизвестный конфликт не перезаписывается. Без ACK старая очередь остановилась бы после128 строк — проверено129-й заявкой.

Готовые root-файлы registration-requests/ оставлены дополнительным входом. Прямое чтение init-state/каталога убрано. RUN, закрытый между тиками, остаётся в почтовой очереди до долговечного внесения в индекс; finish читается по прежнему Master-owned usage-finish marker. Без finish действует TASK_DEADLINE_MAX7200с. Старые drain/prepare, delivery-расширение, owner_export, R/G/raw/witness из активного пути сняты. Счётчики и курсоры не хранятся в SQLite.

Смена inode/усечение→неполно, история сохранённых ключей предотвращает двойной счёт повторённых строк. Полностью потерянный end, неизвестный источник, события за пределом хранения/после вытеснения, работа вне AP в окне, тариф/подписка и дети SDK не доказываются. История ниже описывает прежние2–4 readers/выпуски; они сохранены для архивов и исторических tests. Контракт компонента и границы — CORE-API.md в комплекте передачи.

---

<a id="g-segments-v1"></a>
## AP 0.1.10 · читатель G и очередь регистрации / G reader and registration queue

Кандидат от `778a1ee7`, отдельно от r4 и боя. Вход поставщика — writer Гаммы `25d80920` (policy schema 3, source/manifest/seal schema 1). Новая ротация включается только совместным принятым окном writer/AP/ночного читателя. `sources.raw` и его поставщик в эту дельту не входят. Raw R по-прежнему ограничен прежними 16 МиБ; инкремент R и gap-time этим кандидатом не реализованы.

Candidate based on `778a1ee7`, separate from r4 and production. Supplier input is Gamma writer `25d80920`, policy schema 3 and source/manifest/seal schema 1. Rotation needs a jointly accepted writer/AP/night-reader deployment. This delta does not supply `sources.raw`, incremental R, or gap timestamps.

Зовущие: root `autopilot-usage.service` → `usage_registration.drain` для регистрации и `runtime_receipt_source.prepare` для расходов. Оба читают G под UID владельца gateway через общий `gateway_segments`. `groups()`/`process_requests` Гаммы 6c52 и несущий `operator_tuple` не меняются. Root сверяет всю тройку pid/start/boot с SO_PEERCRED ancestry, снятой почтой из ядра; печать/проекция её не заменяют. Исполнение не ждёт учёта; неизвестное — именованный UNBOUND/incomplete/null.

Both registration and expense preparation use the same owner-UID G reader. Gamma's decoder and the bearing kernel tuple check remain unchanged. Accounting introduces no model admission ACK.

### Профиль и Node / profile and Node

Поля существующей записи участника root-owned source profile:

```json
"gatewaySource": "raw-v1",
"gatewayTransport": {
  "version": 1,
  "policyCli": "/absolute/physical/gateway-release/usage-limits.mjs",
  "node": "/absolute/physical/node-release/bin/node",
  "nodeSha256": "<64 lowercase SHA256 hex digits>"
}
```

`sources.gateway` остаётся `<engineHOME>/.usage-meter/gateway-v1.jsonl`. Рука окна определяет физическую поставку CLI по действующему процессу G, не произвольным хостовым путём. CLI, policy и предки остаются root-owned без чужой записи. UUID/epoch вручную в профиль не вносятся: reader сопоставляет source.json с manifest, печатями и raw внутри снимка.

Node не root-owned (`arg:arg` — учётка владельца); доверие держится на пине суммы, не на правах. Профиль закрепляет realpath и SHA256. Owner-reader проверяет SHA256 и identity `(dev,ino,size,mtime,ctime)` до/после чтения и выполняет **тот же путь**, без PATH/fallback и без memfd. Несовпадение → `NODE_PIN_MISMATCH`. Обновление Node — сменить пин тем же окном. **Гонка хеш → exec не закрыта; подмена учёткой владельца/root вне модели.** Root-owned private fixture допустима, но не является договором поставки. Хеширование входит в G deadline; байты Node не выдаются за байты G.

The profile pins Node's canonical path and SHA256, even when the binary belongs to `arg:arg`. Hash and identity are checked before/after reading; the same path is executed, with no memfd or fallback. The hash-to-exec race remains open; replacement by the owner/root is outside the threat model. Update the binary and pin in the same accepted window.

### Пределы schema 3 / schema 3 limits

Полную схему поставщика проверяет общий **его** `usage-limits.mjs` рядом с producer (импорт `usage-segments.mjs`/`usage-limits.json`). AP не дублирует эту схему и не принимает промежуточную schema 2. Нет/невалидна — `G_POLICY_INVALID`, без числового fallback. AP дополнительно сверяет два числа договора с данными своего выпуска:

| Поставщик policy schema 3 | AP release JSON schema 1 | Экспорт AP | Расхождение |
|---|---|---|---|
| `legacyFileMaxBytes` | `legacyWriterMaxBytes` | `G_WRITER_LIMIT` | `G_WRITER_LIMIT_MISMATCH` |
| `maxRecordBytes` | `recordAllowanceBytes` | `G_RECORD_ALLOWANCE` | `G_RECORD_ALLOWANCE_MISMATCH` |

Сейчас это 134217728 и 65536 байт соответственно. Собственный `usage-reader-limits.json` рядом с `usage_registration.py` содержит и формулу повтора: `ceil((2 × (timerSeconds + accuracySeconds) + heartbeatSeconds + timeoutStartSeconds) / roundToSeconds) × roundToSeconds`. Данные 60/1/15/35/60 дают **180 с**, timer120 даёт 300 с. Эти данные принадлежат AP и не являются схемой G. Нет/негодны → `AP_USAGE_LIMITS_INVALID`. Импорт читает только собственный JSON выпуска, не G/SQLite/сокеты, ничего не пишет.

The supplier's shared CLI validates policy schema 3. AP checks the two mapped contract values, without a fallback. Its separate schema-1 release data also define the rounded retry formula (currently 180 seconds). Import reads only that adjacent release file and performs no source, socket, SQLite or write operation.

### Рождение, P1 и отказы / source birth, P1 and refusals

`source.json.sourceCreatedAt` — обязательное неотрицательное целое epoch-ms. `windowStart = max(0, acceptedAt − 600000)`; если **windowStart < sourceCreatedAt**, до P1 → конечный `RETENTION_GAP`. Равенство допускается. История до рождения источника неизвестна; reader не подставляет ноль вместо потерянного каталога. После его удаления/restart ранняя заявка остаётся конечной; через 600 с нужна **новая** удостоверенная заявка/runId. Принятый acceptedAt старой не передвигается. Для расхода начало окна остаётся `max(0, runStartedAt − 600000)`; acceptedAt относится к регистрации, новая семантика расхода не вводится.

Each snapshot reads the source anchor, manifest, full active and retained seal metadata. A window starting before `sourceCreatedAt` is final `RETENTION_GAP` before P1; equality is allowed. Deleting and recreating the source requires a new late request: a failed early request is never silently revived. Expense snapshots keep their existing `max(0, runStartedAt − 600000)` cutoff; acceptedAt is the registration cutoff.

P1 сохраняет целые поколения, если хоть одна строка свежая; все содержащие их закрытые сегменты читаются полностью, длина/SHA и raw-итоги проверяются по печати. Порядок физический, seq не переименовывается. Кэша/checkpoint нет. `cutoff <= deletedMaxObservedAt` → `RETENTION_GAP`; это отдельная граница от строгого сравнения рождения.

- Нужный raw без печати, печать без raw, потеря нужного segment/origin/manifest/source → `RETENTION_GAP` до `groups()`. Частично записанный **нужный** закрытый raw без печати также отказ; orphan вне manifest не объявляется нужным.
- Порча байта/SHA → `G_SEGMENT_CORRUPT`; негодные поля → `G_SEGMENT_INVALID`; разные UUID внутри снимка → `SOURCE_ID_MISMATCH`; mode/UID/link → `G_SOURCE_UNSAFE`.
- Seq-дыра или относящийся raw `source_gap`, в том числе `scope=process, reason=G_ACTIVE_REPLACED`, → `SOURCE_GAP`. `.replaced` 0400 — карантин, **не сырьё**, его байты не читаются как история.
- Наличие `intent.json`, включая `active_gap`, означает незавершённый снимок → `G_SNAPSHOT_CHANGED`; изменившиеся identity/metadata и недописанный active LF также не дают полный снимок. Регистрация может повторять только явно переходящий исход в ограниченном окне.
- AMBIGUOUS, BUDGET_EXCEEDED, RETENTION_GAP, SOURCE_GAP и просрочка конечны. Reader не пишет/чинит/вращает/GC источники.

ENOSPC-пробы покрывают две формы незавершённого закрытия (нужный raw без seal и seal без raw), а не все способы отказа диска. Валидный prefix сам по себе не доказывает исправность всего диска.

### Бюджеты / budgets

План G = прочитанные metadata + весь active + byteLength нужных closed + maxRecordBytes. Legacy S0 ограничен legacyFileMaxBytes+maxRecordBytes, обычные сегменты — segmentMaxBytes. Metadata ограничены 16 МиБ. Срок G на drain/prep — `2 × 3,752396944910288 = 7,504793889820576 с` по принятому холодному замеру регистрации. SDK/native/почта/обычный receipt сохраняют отдельные 16 МиБ/3 с. Отчёт разделяет gatewayBytes/gatewaySeconds/gatewayReadPlans; неизвестное child I/O — null с консервативным списанием гранта, не ноль. Проверка policy учтена и в owner, и в CLI.

Registration drain is sequential. G is reread for each eligible registration attempt, without a per-participant cache: N attempts cost about N source reads; peak parsing memory belongs to one registration. Queue lock prevents overlapping drains from publishing a final status over a live attempt. Segment retention, metadata and time still bound capacity; no request-count ceiling is asserted from the benchmark.

Копийный замер Беты на sadik, UID coders1003, 18.10.2026 03:16:42–47Z: новый reader без memfd + неизменённый process_requests, свежий Python.

| Полные файлы | Строки / requests | Reader + decoder | Пик RSS |
|---|---:|---:|---:|
| active8МиБ + closed8МиБ | 28291 / 2829 | 0,499250с | 119176КиБ |
| active8МиБ + 2×closed8МиБ | 42437 / 4244 | 0,678307с | 154024КиБ |

Первое чтение после отдельной32МиБ записи/fsync и FADV_DONTNEED; drop_caches не использован, резидентность не измерялась. Пик — `VmHWM` из `/proc/self/status` после reader/decoder; `ru_maxrss` не использован как пик, он наследовал builder. Это snapshot+decoder без owner IPC/SDK/native/регистрации, не SLA и не верх вместимости. Формы raw синтетические, Node и provider validator настоящие.

### Очередь и вызывающая почта / queue and postal caller

Почта очищает intent только по защищённому root-статусу **REGISTERED**, либо **UNBOUND с terminal строго True**, и совпадению **requestSHA256 и runId**. Actor-owned файл, другой SHA/runId, terminal=1, отсутствие поля и retryable UNBOUND не дают удаления. DELETE повторно ограничен runId+SHA; tombstone остаётся и запрещает повтор runId. Размер очереди 128; один проход не сканирует больше 128 строк.

Root drain держит отдельный неблокирующий lock на весь такт. Перед owner I/O пишет **REGISTRATION_IN_PROGRESS, terminal=False**; почта не удаляет живую попытку. Следующий владелец lock распознаёт оставленный crash sentinel и завершает его как REGISTRATION_ATTEMPT_INTERRUPTED без повторного G-чтения. Обычные доказанные SOURCE_LAG/CONTEXT_UNAVAILABLE повторяются до acceptedAt+формульного окна; прочие отказы конечны.

Решение владельца по воротам06:40 отменяет промежуточное правило03:24Z: и переход удостоверенной заявки в terminal UNBOUND, и уже конечная строка идут в `registration.unbound` без `registration.failed` и нового rc2. Это побайтный runtime принятого3a49a8e7. Root статус должен быть durable до почтовой очистки; повторного G-чтения нет. Чинимые profile/I/O/origin/mismatch остаются failed/rc2. `prepared.failed` не используется для очереди регистрации. Неподтверждённая origin, негодный/чужой root-status и сбой его записи остаются ошибками, не основаниями очистки. При пойманном системном сбое после IN_PROGRESS восстанавливается прежний проверенный pending или fsync-удаляется новый sentinel; следующий такт не выдаёт известный сбой за смерть процесса. Защита охватывает также отказ записи budget-диагностики. Настоящий непойманный обрыв по-прежнему оставляет прежний fail-closed sentinel. Retryable UNBOUND в окне остаётся в очереди и в failed до разрешения.

Зовущий очистки без новой заявки — существующий `Postman.retention_tick` в почте, в одной SQLite-транзакции с maintenance. При неуспехе весь DELETE откатывается. Удаление асинхронно: на следующем успешном допустимом postal-такте, интервал в принятой конфигурации60с плюс задержки loop/работы; это не синхронный DELETE при возврате root drain и не жёсткий SLA60с. Почта пишет собственную БД, root только сохраняет окончательный статус. Main почты продолжает вызывать maintenance независимо от регистрационных заявок. До следующего postal-такта tombstone уже остаётся виден и root повторно G не читает.

The approved3a49a8e7 rule is restored: both the transition into terminal UNBOUND and subsequent visits report `registration.unbound`, without a failed tick or another G read. Unproven origins, mismatched/invalid statuses and publication errors remain failures. Pending retryable requests stay queued. The existing postal retention tick acknowledges final statuses in its own transaction; failures roll back deletion. Cleanup is asynchronous on the next successful eligible postal tick (configured60seconds plus loop/work delay), not synchronous drain completion or a hard60second SLA.

The mail service prunes only matching protected root completions, preserving pending/retryable requests and all status tombstones. A whole-drain lock and a nonterminal in-progress sentinel prevent premature queue deletion. Interrupted attempts stop on the next drain without another G read.

Изменённый `mail_registration.py` должен попасть к **postal-службе**: основной installer AP эту полку не устанавливает. Подготовлены `MAIL-LAYOUT.json` для новой неизменяемой `/opt/autopilot/post/0.1.10` и только смена ExecStart mail unit на неё. Старую 0.1.9 не переписывать. Протокол, прочие mail/copy/notice программы и их версии этим тактом не меняются.

В принятом окне 0.1.10 остановить **collector и почту вместе**, поставить оба новых caller, а до запуска почты выполнить разовую уборку от её существующей учётки:

```sh
sudo -u autopilot-post /usr/bin/python3 -I -B /opt/autopilot/post/0.1.10/pilot/prune_registration_queue.py
```

Без аргументов; неизвестные флаги дают отказ. Уборка берёт существующий postman.lock неблокирующе, SQLite mode=rw/timeout3с, не создаёт БД; максимум 128 строк. Root запуск запрещён, чтобы не создать root WAL. При работающей почте → `REGISTRATION_PRUNE_BUSY`. Сохранить JSON deleted IDs/count/remaining и независимо сверить БД/статусы. Старый collector со своим временным terminal=True **нельзя** оставлять рядом с новой очисткой. Страховка, монтаж и restart — назначенной рукой после ворот, не автором кандидата.

The new library requires its own postal0.1.10 shelf and service cutover; the main AP installer does not mount it. Stop collector and mail together, deploy both compatible callers, run the bounded cleanup as `autopilot-post` while mail is stopped, then follow the accepted restart plan. Never overwrite the immutable0.1.9 shelf or run cleanup as root.

### Границы / boundaries

Печати защищают от случайной порчи, не согласованной переписи raw+seal+manifest владельцем/root. Согласованное восстановление всего старого каталога источника из копии не обнаруживается датой рождения; такой возврат не разрешён. UUID в профиле не требуется, постоянный конфликтный индекс не добавлен. Копийные пробы не аттестуют живые модели/G/auth/подписки, UI или весь диск. Возврат на active-only reader при включённой ротации запрещён: он теряет сохранённую историю.

Seals do not authenticate coordinated owner/root rewrites or restoration of a whole old source directory. That rollback is not authorized. Copied-input tests do not attest live model/auth/subscription behavior or full UI. Do not roll back to an active-only reader while rotation is enabled.

## Историческое описание 0.1.9 / historical 0.1.9 description

Ниже сохранён контекст active-only выпуска. Противоречащие ему правила текущего segmented-кандидата определены выше; планы прежних выпусков не являются выполненными механизмами.

# Online usage AP0.1.9 — первая ступень, кандидат

Основа `605c35e1` + закреплённая G-проекция/потребитель Гаммы `6c52b063`; физическая редакция кандидата `a17-b12-c2-team-online-r-gcontext`. Код не смонтирован. Ранняя G-проекция вызывается до создания run и до R/AP-job join; root отдельно проверяет сохранённую peer-ancestry и SDK/native. Исполнение не ждёт подтверждения учёта. Ограничение физического хвоста ниже остаётся открытым условием наряда.

## Зовущий и область

`systemd/autopilot-usage.timer` вызывает root service каждые60с независимо от наличия OPEN. До проверки OPEN root читает защищённый source profile, ограниченную очередь AP-почты и индекс. Без заявки и OPEN не читает/не проверяет HOME участников и не зовёт owner exporter; schema старого сервера не выдаётся за пустую очередь. Пустой/закрытый индекс — исправный idle, отсутствующий/битый — отказ с reason. Это отдельный usage-индекс; rollback run_catalog не переиспользуется как доказательство job→turn.

Активация unit/timer, создание корневого индекса и namespace входных источников — только принятым листом. Здесь unit-файлы/CLI доставляются в пакете, daemon-reload/enable/start не исполняются. После монтажа producers R/G пусковой читатель создаёт защищённые root записи из настоящего run/project и исходной DSHtuple оператора до его первого AP-хода; имя/путь в argv модели такого источника не заменяют. Сырой R — TG 3.1.13 `4f80e7f0`; ниже описан его AP-нормализатор. Ранний raw G и сбор используют закреплённый модуль Гаммы; полного живого сведения этим кандидатом не заявлено. До подключения доверенного launcher и сведения G это копийные доказательства, не принятый live caller всей команды. Новая карточка требует root receipt v2; старый пользовательский v1 observed её не включает.

CLI: `python3 -I -B <physical-release>/tools/collect-team-usage.py`. Root API читает `index.json` только root-owned, без ссылок/групповой записи в предках. Unknown CLI flags отказывают. `--owner` — внутренний parser с JSON stdin, права только текущего UID; он не выполняет код из HOME.

Индекс: `{schemaVersion:1,runs:[{runId,phase:"OPEN"|"CLOSED",record:"ABS/root-config.json"}]}`.
Root-config: `schemaVersion:1,runId,startedAt,project,origin:{mailDatabase,operatorReservation},participants:[{name,uid,gid,home,runtimeHome?,engine,sources:{runtime,gateway,raw:[...]}}]`.

`operatorReservation` — root JSON `{runId,project,operator:{jobId,sessionId,sessionCreated,turn}}` от доверенного запуска. AP init читает root-резерв по SHA256(realpath project) в `/var/lib/autopilot-usage/reservations/SHA.json`; нет его/сломался → обычный UUID init, без отказа работы, учёт оператора не считается доказанным. Резерв прежнего runId повторно init не использует. Путь R/G и набор файлов raw задаёт корневой producer, не тело задания.

Перечень jobs строится кодом из таблицы messages AP-почты (это текущая retained-таблица, не обещание вечного архива; GC-потеря → отказ полноты; поля: kernel-удостоверенный master/sender_uid/recipient и typed task envelope данного run). Operator-job сверяется с root-резервом и реальным R-binding; пропущенный почтовый участник/job → JOBSET_INCOMPLETE. Времена jobs заново строятся из последних R-фактов каждого request; входной jobs из config не является источником. Нулевой расход не приглашённой в jobs роли допустим только после полной этой сверки, без чтения её HOME; одного root-владельца у вручную выбранной границы недостаточно. DB+WAL читаются копированием в private temp, исходный SQLite не открывается на запись; rollback journal/изменение источника → отказ. Нет origin → RUN_ORIGIN_UNPROVEN, не observed.

## G process binding — контракт RU / EN

**RU.** В `gateway-v1.jsonl` при spawn app-server/Claude child пишется отдельное событие `schemaVersion:1, kind:"engine_process_binding"`: `enginePid:int>0`, `engineStart:string` десятичных тиков поля 22 `/proc/<pid>/stat`, `boot_id:UUID`, `request_id`, `sessionId`, `sessionCreated:int`, `turn`, а также `uid/recipient/engine/generation/processEpoch/seq`. Сохраняются общие поля G `requestId/requestGeneration/processGeneration/dshTurn/observedAt`; `request_id=requestId`, `turn=dshTurn`. Нормализатор G однозначно соединяет binding с request по `request_id` и сверяет весь tuple, UID, generation/epoch и последовательность. Он передаёт `sourceProcess:{pid:enginePid,start:engineStart,boot:boot_id}` в нормализованном `kind=request` обоим читателям, включая `registrationContext` **до** root register. Root сопоставляет только всю тройку `(pid,starttime,boot_id)` с цепочкой `/proc`, снятой почтой при приёме; отсутствующий/конфликтующий binding или расход тройки оставляет `UNBOUND` с именем причины. PID отдельно, body hint и текущая живость вместо сохранённой цепочки не доказывают связь. Встраивать поле в raw request не требуется. Учёт не вводит ACK перед моделью.

**EN.** At app-server/Claude child spawn, `gateway-v1.jsonl` receives a separate `schemaVersion:1, kind:"engine_process_binding"` event: `enginePid:int>0`, `engineStart:string` containing decimal ticks from field 22 of `/proc/<pid>/stat`, `boot_id:UUID`, `request_id`, `sessionId`, `sessionCreated:int`, `turn`, plus `uid/recipient/engine/generation/processEpoch/seq`. Existing G fields `requestId/requestGeneration/processGeneration/dshTurn/observedAt` remain; `request_id=requestId` and `turn=dshTurn`. The G normalizer joins binding to request unambiguously by `request_id`, checking the complete tuple, UID, generation/epoch and sequence. It supplies `sourceProcess:{pid:enginePid,start:engineStart,boot:boot_id}` on normalized `kind=request` to both readers, including `registrationContext` **before** root register. Root compares the complete `(pid,starttime,boot_id)` triple with the `/proc` ancestry captured by mail at receipt. A missing/conflicting binding or mismatched triple remains named `UNBOUND`. PID alone, a body hint or current liveness cannot replace captured ancestry. Raw requests need no embedded field. Accounting adds no model admission ACK.

Подставные строки в `test/fixtures/gamma-engine-process-binding.json` имеют эту форму; их normalized-часть получена настоящим закреплённым `process_requests()` Гаммы. Это fixture совместимости, не аттестация живого G. / The fixture uses this raw shape and golden output from Gamma’s pinned `process_requests()`; it does not attest live G.

## Ранняя регистрация G: проекция и полный ограниченный снимок

Owner-reader под UID/GID участника без supplementary groups вызывает **неизменённую функцию Гаммы** `gateway_receipt_source.process_requests(rows, participant)` до регистрации run. `acceptedAt` берётся из серверного `usage_registrations.accepted_at`, не из тела модели. В функцию передаются **целые поколения**: поколение `generation` выбирается, если хотя бы одна его строка имеет `observedAt >= max(0, acceptedAt_ms − 600000)`. Все его строки, включая старые start/binding и seq1, сохраняются в исходном физическом порядке. Поколение, все строки которого старше порога, исключается целиком. Полные `(pid,boot,start)` сравниваются с цепочкой, снятой почтой при приёме; далее независимо проверяются SDK request/binding и native claim. `REGISTRATION_CONTEXT_UNAVAILABLE`/`REGISTRATION_CONTEXT_AMBIGUOUS` и ошибки источника остаются именованным `UNBOUND`; модель продолжает работу. Для raw G источник профиля объявляется `gatewaySource: raw-v1`; сбор расходов использует `normalize_gateway()` того же модуля Гаммы. Legacy `normalized-v1` остаётся форматом уже нормализованных источников при сборе, а не raw-декодером регистрации.

**Режим AP 0.1.9: полный G без префильтра, неизменённый разборщик 6c52 (решение Забавы 21:41:19Z).** Глобального порядка observer timestamps нет, ранней остановки по observedAt нет. Owner-UID reader открывает O_NOFOLLOW, фиксирует размер fstat и читает ровно этот снимок; изменение identity/размера/mtime/ctime, в том числе append во время чтения, даёт именованный отказ. Последняя неполная строка не разбирается. После полного чтения выбираются поколения со свежей строкой относительно server acceptedAt−600с, затем передаются все строки этих поколений. Порог600с — условие активности поколения; длительность самого хода им не ограничена. Свежий heartbeat сохраняет начальный binding даже для очень долгого хода. Отбор не зависит от перемежения observer; seq/identity/epoch проверяются прежним кодом Гаммы без перенумерации и удаления auth/usage видов. `windowStart` в private snapshot proof обозначает этот порог активности, а не время самой ранней сохранённой строки.

G-снимок имеет отдельный бюджет `G_READ_LIMIT = G_WRITER_LIMIT + G_RECORD_ALLOWANCE`. Источник закреплён контрактом guard из ced3d243: usage-producer.mjs:45 и ограничение одной записи:35. Пока одно именованное `G_WRITER_LIMIT=128*1024*1024`, до единого источника в0.1.10; запас одной записи `G_RECORD_ALLOWANCE=64*1024`. Источник — guard писателя `if(info.size+Buffer.byteLength(raw)>128*1024*1024)` в usage-producer.mjs, не обещание жёсткой файловой quota при параллельных observer. Единый источник константы и ускорение чтения —0.1.10.

**Договор AP 0.1.10, не r4:** поставщик G 3.1.7 (`7f71ed74` + документы `359a5066`) задаёт предел полем `gatewayV1FileMaxBytes` в `usage-limits.json` рядом с producer того же живого процесса; физическая поставка определяется по процессу, не фиксированным путём хоста. Текущий AP `4ef01484` знает `G_WRITER_LIMIT=134217728` числом и не извлекает предел из JS или JSON; запас регистрации остаётся отдельными 65536 Б. Нынешний договор совпадает с настоящим файлом `359a5066`. Схема поставщика и отказ при её негодности — `usage-producer.mjs:4–6`/`usage-limits.mjs:1`; существующий Python-читатель — `dsh-obhod-stendov` `da9c19c9`, `test/stend-g-journal-size.py:41` (`writer_limit`), обнаружение поставки — там же `:14` (`producer_source`). Схема в AP не дублируется, динамический читатель этой документальной дельтой не добавлен: отсутствие JSON не выдаётся за новый отказ AP. Любой последующий читатель обязан отказывать по имени без числового fallback; изменение поставщиком N требует отдельного согласования бюджета AP. Дельта предназначена только для общего захода AP 0.1.10 + шлюз 3.1.7 + обход 3.1.107; в r4 не включается.

**Формула срока G: `G_READ_SECONDS = 2 * G_COLD_WORST_SECONDS` = `2 * 3.752396944910288` = `7.504793889820576` секунды.** Основание — сохранённый холодный128MiB замер наsadik, test/fixtures/g-registration-cold-128.json (SHA256f31aea9c07e8387279ce97c5e0e36c91e2c0cd6b5fc8da82918bed41bd79a585). Минимум получен Бетой из настоящего producer `ced3d2438fe57f4703d8e6fb557cdc5eef3e2750` с JSON.stringify без отступов и LF: serializer:34; heartbeat:26; invalid binding:25; processGap:29/fail:30; writerguard:45, recordguard:35. РабочийcheckoutГаммы имелHEAD1fc, поэтому исполнялась отдельно сохранённая byte-exact копия объекта ced, продуктГаммы не правился.

Изолированный livechild с UID0 реально записал234байта SOURCE_GAP процесса после1023pending и некорректного binding; это минимальная известная внутренняя ветка: UID-only context, две UUID по36байт, seq1, observedAt13цифр, fixedkind/reason/scope. Корректный heartbeat с минимально допустимыми короткими context IDs —332байта. На обычном UID1003 этот же producer дал237/335байт. Native child tuple действительно снимался с собственного Node-child, моделей не было. Измерение234не выдаётся за здоровый run: Gистория source_gap корректно заканчиваетсяUNBOUND.

Coldметод: перваяпопытка после записи/fsync другого128MiB файла, затем FADV_DONTNEED толькоprivateG; mincore0/32768страниц передчтением, globaldrop_caches не трогался. На332B:128MiB/404248JSONLстрок (малый метаданный хвост до точных128MiB), G3.752396945с и metadata12997байт/0.010348658с, BOUND. На234B:573580копий настоящей minстроки,134217720байт (на8меньше128MiB, следующаястрока уже вышлабы заwriterlimit), G2.730124625с, ожидаемыйUNBOUND. На335B и237B отдельно3.540570493/2.919805820с; первые два коротких прогона выполнялись одновременно, это явно часть условий, они не исключены изmax. Все семь coldизмерений сохранены, выбран их max. Минимальнаяошибка короче, но полный здоровый332Bпоток требует ещё и всех seq/identityпроверок, поэтому оказался медленнее — короткий failurepath не подменяет worstcase.

Измеренияcompletion имели локальный budget30с только у worker-прибора, чтобы увидеть время без обрезки. Исходный код алгоритма/Γ6c52 не переписывался. После выбораформулы проверяется и штатный порог. Прямойowner_context запускался подUID1003 с supplementarygroups, всеfixtureфайлы600/700егоUID; это не ownerIPC/mail/liveGприёмка. RootIPC/kernel проводка проверяется отдельно наdeclaredprivateстенде. PeakRSSновыхworkerдо1211160KiB (~1.16GiB), а не прежние~0.9GiB; это весь Pythonworker. MemoryMax не устанавливается. Gphase означает read/decode/projection; целыйownerвызов включает такжеSDK/native иcleanup/importoverhead, все времена даны отдельно в исходныхJSON.


SDK/native/почта и обычный receipt сохраняют прежний общий16MiB и свои boundedтаймеры. `sourceBytes` означает этот NON-G канал, `gatewayBytes` — отдельноG; rootreport также даёт gatewaySeconds/metadataSeconds и лимиты двух каналов. Неизвестное=null, а conservativecharged поля удерживают весь недоказанный выданныйgrant, не ноль. Ошибка GилиmetadataBUDGET_EXCEEDED оставляетUNBOUND с именем/scope, модель идёт. Registration.failed иroot-owned registration-budget/<run>.json сохраняют sizeBytes/readBytes/elapsedSeconds и Gлимиты; это диагностика, не canonicalusage. При hardtimeout доказанного размера/байт может не быть: null. Успешная регистрация снимает старую диагностику. Учёт G не вычитается из16MiB receipt; metadata регистрации по-прежнему учитывается в этом канале.

**Память, две строки по коду:**
- В одном тике заявки обрабатываются последовательно: `drain` проходит `for row in queue`, `owner_export` ждёт завершения единственного дочернего reader через communicate; parallel batch/pool в регистрации нет.
- G перечитывается для каждой ещё не зарегистрированной заявки, дошедшей доowner_export, не один раз на участника за тик. УжеREGISTERED пропускаются, общего кэша распарсенногоG нет; суммарные byte/time grants тика ограничивают повторные чтения. Крупные dicts живут в одном owner-процессе и освобождаются до следующего; при этом несколько ручных CLIпроцессов не объявлены одной сериализованной службой.

Читатель до переполнения — отдельный выпуск обхода Альфы: Gжёлтое от75%writerlimit (сейчас96MiB), красное от100%(128MiB). Предыдущие12/16MiB относятся к старому варианту3.1.104, не к новомуG128контракту. ОтсутствиеG нейтрально и поимённо, не нулевой расход. Readerпроверяет размер G обнаруженных живых шлюзов, не полноту producer/квитанций. Индекс/checkpoint0.1.10 планируется по первым24ч живогоG после окнаG уmaster.

**EN. Registration uses the entire G snapshot and the unchanged6c52 parser; no kind prefilter.** Select a whole `generation` if any of its records has `observedAt >= max(0, acceptedAt_ms - 600000)`; discard a wholly stale generation. Every record of a selected generation is retained in its original physical order, including seq1 and an early binding. Interleaving observers cannot change membership. A fresh heartbeat retains a long-running turn regardless of its start age;600s is an activity threshold, not a turn-duration limit. Gamma still validates seq/identity/epoch without renumbering. `windowStart` in private proof is the activation cutoff; retained records may precede it. `G_READ_LIMIT=G_WRITER_LIMIT+64KiB`, with the accepted ced3d243128MiB writer guard held in one named constant until the unified source in0.1.10. The G deadline is `2*G_COLD_WORST_SECONDS`, currently2*3.752396945s=7.504793890s from the cold128MiB benchmark linked above. Beta measured the actual producer:234-byte source_gap and332-byte valid watermark in a private UID0child; UID1003 gives237/335bytes. Cold128MiB reruns selected the slowest full-parser result,3.752396945s on healthy332B input; the234B gap history correctly refuses. Seven measurements and conditions are retained;MemoryMax is unchanged. SDK/native/post/ordinaryreceipt retain their separate16MiB budget and bounded timers. Bytes and times are reported separately; unknown reads are null, conservatively charged to the granted budget. Either budget refusal yields named UNBOUND while execution continues. Snapshot identity/size/mtime/ctime changes and partialLF refuse rather than produce a partial successfulbinding. Two memory facts: the root tick handles requests sequentially, and each eligible new registration attempt rereads G; there is no per-participant parsed-cache. MemoryMax is not added. Alpha's separate nightstand warns at75% and100% of the writer limit (96/128MiB now). Checkpoint/index work remains0.1.10 after the first24h of live masterG.


**AP 0.1.10 contract; excluded from r4:** G 3.1.7 supplies `gatewayV1FileMaxBytes` in `usage-limits.json` next to the producer from the same live process deployment, discovered through that process rather than a fixed host path. AP `4ef01484` currently compiles `134217728` and a separate `65536` registration allowance; it reads neither a JS guard nor this JSON. The real `359a5066` file agrees. Reuse the supplier validation/export (`usage-producer.mjs:4–6`, `usage-limits.mjs:1`) or Alpha `da9c19c9` `test/stend-g-journal-size.py:41` `writer_limit`, with `producer_source` at `:14` for process discovery; no AP schema is duplicated here. This documentation adds no dynamic AP reader and makes no new AP missing-file refusal claim. A future reader must refuse missing/invalid data by name without a numeric fallback; a changed supplier limit requires a separately accepted AP budget. Ship this contract only in the joint AP 0.1.10 / gateway 3.1.7 / nightly 3.1.107 window.

The full-snapshot mode above replaces the former physical-tail requirement. There is no early timestamp stop; named UNBOUND is the accepted response when the shared budget cannot prove a complete snapshot.

## Контракт входа потребителя

R JSONL (`sources.runtime`): `kind:"request",requestId,jobId,sessionId,sessionCreated,turn,claimedAt,finishedAt`. claimedAt — фактическая граница scheduler/native turn, finishedAt — конец либо null. Повтор того же request допускает только дополнение finishedAt, неизменны job/tuple/claim. `kind:"watermark",at` подтверждает обработанный cut. ID-only notice не удостоверяет отправителя; job принадлежность удостоверяет AP-почта и реальная receipt claim.

G JSONL (`sources.gateway`): `kind:"request",requestId,sessionId,sessionCreated,dshTurn,uid,engine,threadId,turnId,startedAt,endedAt,status,subscription,authEpoch,parentRequestId?`; для закрытого Codex обязательны `totals` шести метрик из канала протокола. Запись running может дополняться terminal, identity/подписка не меняются. `watermark` — как у R. G пишет фактические RPC/SDK IDs и выбранный credential handle/epoch; текущая symlink/registry не историческое доказательство. Базовый normalizer не принимает строку неизвестной формы за ноль.

`home` — engine data root (у Codex CODEX_HOME); `runtimeHome` — отдельный разрешённый корень R, по умолчанию home. У живого Codex Unix HOME и CODEX_HOME различаются; оба корня задаёт root-конфигурация, source сохраняет UID-проверку и запрет ссылок/выхода за свой корень. Источник raw — реальные Codex rollout и Claude SDK JSONL под закреплённым HOME/UID. R/G не заменяют независимую проверку начала/конца/turn в raw. Дополнительный in-scope raw turn без binding → UNBOUND; одинаковый DSHturn для разных jobs → MIXED_JOB_TURN; чужой owner/thread → FOREIGN_TURN; срезанный интервал → TURN_OUTSIDE_JOB. Дедуп по thread/response_id или SDK session/message.id, последняя физическая запись; конечный Codex итог сверяется с G.totals. Поздняя Claude поправка за интервалом не маскируется старой usage.

**Граница детей текущего AP-кандидата:** native SDK Agent/Task у Claude → CLAUDE_NATIVE_SUBAGENT_UNSUPPORTED, ofWhichSubagents=null и Claude/project incomplete; DSH spawn без полного принятого графа → CHILD_SOURCE_UNSUPPORTED; native Codex spawn без поддержанного G-graph → CODEX_NATIVE_SUBAGENT_UNSUPPORTED. Видимый raw child без R/G → UNLISTED_CHILD. Это не «0 детей». Если потребуются дополнительные graph события — R/G+потребитель сдаются одной согласованной дельтой, не включаются молча. Когда spawn не обнаружен и весь выбранный raw/requestset сверён, нулевой subtotal означает только этот проверенный закрытый срез.

## Нормализация сырого R и регистрация root

Дельта поверх AP `c7558271` не меняет `runtime/team_usage.py`, TG R, gateway или B-overlay. `collect-team-usage.py` сначала вызывает `runtime_receipt_source.prepare`, затем прежнюю `iteration` с тем же cut и оставшимся бюджетом. `export-runtime-source.py --owner` читает источники только под настоящими UID/GID участника с пустыми supplementary groups; root не открывает SDK/native-файлы владельца своим UID.

R исходника — `schemaVersion:1`, `generation`, плотный `seq`, `uid`, `recipient`; типы `runtime_request`, `runtime_turn`, `watermark`, `source_gap`. Это не готовый JSONL потребителя. Нормализатор связывает requestId с таблицей `mail_sdk_requests`, receiptId/messageId — с физическим удалением из inbox очереди native DSHv4 и `receipts`, deliveryId — с `messages.id` аутентифицированной AP-почты. `sender_uid` должен быть настоящим UID master, envelope — task данного run/job/recipient. Текст задания, последнее письмо и близость времени привязку не доказывают. Нормализованный `claimedAt` — первая claim выбранной AP-job; более раннее обычное письмо не сдвигает её начало. Две AP-job в одном turn → `MIXED_JOB_TURN`. Дырка seq, source_gap, чужая generation SDK, неподтверждённый native claim/end/request или потерянная доставка дают именованный incomplete. Новый generation не лечит исторический source_gap.

Native: физический session.v4 JSONL (или bounded zstd, нужен `/usr/bin/zstd`), dense seq и известная версия/семантика событий. Seeded/parentSession/subagent и неизвестные события не объявляются поддержанными. DB+WAL копируются со сверкой stat до/после; исходный SQLite не открывается на запись. Изменение/partial tail/rollback journal → отказ полноты.

Канонический root registry создаёт `supply-team-usage-index.py`, не модель. Зовущий — уже имеющийся root usage collector после удостоверенной заявки `init` через AP-почту. CLI ручной регистрации сохранён для назначенной руки; автоматический путь описан ниже. Кандидат не смонтирован, живой связки с G этим не доказано. Исполнение задания не ждёт телеметрию: нет ACK перед моделью, отказ регистрации не разрешает отменять/задерживать AP-ход.

Декларация root-owned 0600/0644, без writable group/other и ссылок в предках: обычный root-config выше, дополненный верхним `operator:{jobId,sessionId,sessionCreated,turn}` и `runtimeSource` у каждого участника. Схема участника:

```json
{"name":"sova","uid":1000,"gid":1000,"engine":"claude",
 "home":"/ABS/engine-home","runtimeSource":{
   "home":"/ABS/dsh-home","raw":"/ABS/dsh-home/receipts/usage-runtime-v1.jsonl",
   "ledger":"/ABS/dsh-home/receipts/receipts.sqlite",
   "native":{"root":"/ABS/dsh-home/native","cwd":"/ABS/project","compression":"none","version":4}},
 "sources":{"runtime":"/ABS/dsh-home/receipts/usage-runtime-v1.jsonl",
   "gateway":"/ABS/engine-home/gateway-normalized.jsonl","raw":["/ABS/engine-home/engine.jsonl"]}}
```

UID/GID и все пути в примере — placeholders: launcher обязан подставить реальные `pwd` значения и точные источники. `sources.runtime` равен `runtimeSource.raw`. Native допускает также явный список физических файлов вместо layout; layout выводит путь из реального sessionId по pinned DSHv4 codec, не сканирует HOME. Необязательный `runtimeHome` сохранён для совместимости core. Набор участников обязан совпасть с удостоверенными адресатами AP-task плюс master.

`origin.operatorReservation` строго `<index-parent>/reservations/<SHA256(realpath project)>.json`, ровно путь, который читает AP init. Register пишет root reservation, record, index и checksum index-origin; занятый flock → `INDEX_BUSY`, без ожидания. Нужна защищённая root-конфигурация, actor argv/manifest этого не заменяет.

```sh
python3 -I -B <physical-release>/tools/supply-team-usage-index.py --index /var/lib/autopilot-usage/index.json --output /var/lib/autopilot-usage/runs --register /ABS/root-declaration.json
python3 -I -B <physical-release>/tools/collect-team-usage.py
```

`--close RUN` у supplier административно переводит registry в CLOSED и снимает observed pointer с `OBSERVATION_CLOSED`; **это не final billing и не AP finish/cancel**. Повторное использование project reservation другим run разрешается только после подтверждённого CLOSED предыдущего run того же project; открытый run остаётся конфликтом. Все проверки index/record/conflict выполняются до записи, новая reservation публикуется последней.

Коллектор сериализует OPEN snapshot→publish с register/close одним nonblocking root lock; занятый registry не перезаписывается. Root создаёт защищённый effective index и immutable для этого такта owner-снимки R/G/raw с общим cut=min доступных watermark и текущего UTC. Поздние terminal events переходят в следующий такт; время измерения не подменяет cut. Proof пути/UID/hash/байты и dispositions хранятся в private root prepared/proof. Публичная receipt не содержит эти пути, тела сообщений и SDK raw. Неизвестные requests не исключаются молча.

При ошибке подготовки прежний observed немедленно заменяется свежим v2 incomplete с именем и null totals и передаётся прежнему publisher UID master; отказ публикации назван PUBLISH_LAG. asOf сохраняет последний доказанный source-cut (или startedAt, если среза ещё не было), measuredAt отмечает время отказа: время ошибки не выдаётся за обработанную историю. Если roster/origin нельзя подтвердить, root current pointer удаляется и source-status становится incomplete; старый observed не используется. Публичная проекция проекта по-прежнему выполняется прежним ограниченным publisher; в root-пробе публикация в проект была недоступна и не считается живой приёмкой.

**G/raw в пробах синтетические, живой 1fc не проверен.** G здесь — только consumer-совместимые `request`/`watermark`; raw schema `1fc061e8` не декодируется этим R-кандидатом. Доступность credential handle/подписки, G join и живое сведение — следующий шаг Гаммы/назначенной руки.

## Бюджеты и снимок

Для прежнего consumer: два owner-reader параллельно, каждый≤5с; общий source deadline25с, ещё≤5с на публикацию, unit timeout35с. Новые source bytes≤16MiB за всю итерацию (DB+WAL, R для построения окон и повторное owner-чтение R/G/raw; индекс/config/receipt — отдельные ограниченные служебные JSON), parser-cache≤16MiB/run. Не весь исторический HOME: точные файлы, cursors до целой строки; история до run-start не сохраняется. Rebuild сверх бюджета сохраняет продвижение и incomplete до полного источника. Не более10 readers в текущей итерации; лишние явно BUDGET_EXCEEDED, не «все учтены». Расширение состава сверх начальных7 требует отдельного решения бюджета; автоматического обещания больших команд нет.

Для R-нормализации: подготовка использует cooperative deadline 3с (проверки при чтении и hard timeout owner subprocess); consumer worker получает остаток 30с от старта collector, затем его группа убивается. Корневой SQLite SELECT/CPU и staging выполняются вне внешнего subprocess-ограничителя и могут превысить cooperative deadline. Предохранитель всей systemd-службы — TimeoutStartSec=35; его срабатывание не гарантирует свежую receipt. Это ограничение текущего кандидата, не доказанный hard30 для всего root-процесса. Исходники и decoded zstd суммарно ≤16MiB; bytes подготовки, в том числе failed owner, вычитаются из consumer budget; при timeout или ненадёжном ответе exporter весь выданный owner grant списывается как верхняя граница, а не как измеренное фактическое чтение. В отчёте sourceBytes поэтому может включать этот консервативный charge. При timeout группа owner/consumer с потомками убивается; ошибку учёта публикуют, модель не ждёт. **Подготовка R пока читает полный выбранный raw/native/DB набор, incremental-cache для неё нет.** Источник, не помещающийся в 16MiB/3с, может оставаться `BUDGET_EXCEEDED`; это предел этого кандидата, а не обещание дальнейшего продвижения core-cache. Не применять описанный выше incremental-progress consumer к нормализатору R. Ограничитель 30с относится к consumer-группе с вычетом уже прошедшего времени; чтения подготовки имеют собственный cooperative deadline.

Незавершённая job после7200с claim → JOB_OVERDUE; никакой отмены job и бесконечного синхронного ожидания. Базовая receipt имеет phase=live/basis=closed_turns, asOf и measuredAt, pending активных engine turns. Активные ещё не включены: это не общая стоимость незавершённого хода. Любой missing → project totals всех6 null; подтверждённые строки остаются частичными, engine без участников даёт null. Неполный jobset/origin не преобразуется в успешную сумму остальных.

Root хранит cache0600 и immutable публичные generations root0644 под root0755. `current.json` указывает generation+SHA. Receipt несёт projectRef=SHA256(realpath project), проверяемый по реальному пути проекта при публикации, не по actor-owned state. Public projector читает только этот корневой receipt, actor-edited state не источник; private HOME/команды/SDK IDs не проецируются. Панель показывает состав поимённо, missing/reason, подписки, шесть чисел, «из них субагенты», cut/pending; старше120с явно «снимок устарел».

Не-модельный publisher UID master берёт штатный operator.lock без takeover, проверяет run/project/pin и root receipt. Меняет usage snapshot/rev и `.autopilot/usage/receipt.json`, сохраняет gates/tickets/operator.json; busy lock → PUBLISH_LAG. Затем существующий bounded exporter публикует статическую пару. Root не выполняет AP init/finish/set, модель для writer не будится.

Final drain/полная итоговая квитанция/чат-outbox — AP0.1.10, не объявлены сделанными этим выпуском. Биллинг/деньги и недоступные логи вне доказанного источника.

## Пробы и граница приёмки

`test_team_usage.py`, `test_team_usage_projection.py` включены в штатный стенд. Дополнительно private mount-copy с семью настоящими UID: closed raw чтение, kernel dropUID, HOME closed/foreign/window/return, protected root jobset/public receipt, idle strace. Это синтетические engine events без моделей, не живой проект.

Полный legacy PID1-probe в `test_legacy_window.py` требует живого systemd-run и автором не исполняется по действующему ограничению офлайн-проб. Отдельный offline regression явно перечисляет этот исключённый модуль; его итог не выдается за полный native gate. Окно gateway отдельно: hod-sluzhby перед каждым поочерёдным рестартом; диск=живой процесс после подъёма; dry rollback до окна. Здесь ни один node-процесс не перезапускался.

## Предел размера raw R и план следующего выпуска

Замер Беты на sadik, 2026-10-17T16:45:17.964Z: frozen Producer R `4f80e7f0`, SHA usage-runtime.js `bc0ea6c2abc65eb9afb4559654ddd1eba5d21775fa0129ae4b358e1905ab5ee1`, физические DSHv4/SDK/receipt fixtures без моделей. UTF-8 и завершающий LF включены. Это средний размер копийной выборки, не живой средний размер по получателям.

| Состав на одного fixture-получателя | Запросы / native turns | Строки / байты R | Средняя строка | R-байт на запрос с долей terminal | Верхняя оценка запросов до 16 MiB |
|---|---:|---:|---:|---:|---:|
| 1 request на turn | 100 / 100 | 201 / 131828 | 655,86 | 1316,76 | 12741 (~12,7 тыс.) |
| 10 request на turn | 100 / 10 | 111 / 78645 | 708,51 | 784,93 | 21373 (~21,4 тыс.) |

Формула: `floor((16777216 − 152) / bytesPerRequestIncludingTurnShare)`. Один watermark в каждой выборке — 152 байта. При штатном heartbeat 15 с он добавляет примерно 875 520 байт/сутки (~0,84 MiB) независимо от числа requests; рост seq и длины идентификаторов меняет размер. Это R-only верхняя оценка, НЕ безопасный предел нормализатора: общий бюджет 16 MiB расходуют также ledger/native/G/raw, DB/WAL и повторные чтения core; 3 с может кончиться раньше. Число claims и доля requests на turn тоже меняют среднее. В этих fixtures перед закрытием ledger имел размер 135 168 байт; WAL отсутствовал (0 байт) — не обещание нулевого WAL в живой работе.

Сырой append-only R ограничен Producer R на128 MiB, а текущий prep читает его целиком в общем16 MiB. Поэтому после превышения бюджета R-участник остаётся именованным BUDGET_EXCEEDED/incomplete, totals=null; новые requests не исправят это. Это известная мина готовности к сводному выпуску, а не «ждём R/G». Величина ~12,7 тыс. применима только к указанной выборке без накопленных heartbeat и прочих источников; потеря полноты возможна значительно раньше.

**Предложение выпуска: dsh-autopilot 0.1.10 — инкремент в нормализаторе, рука Бета; TG-контракт Гаммы не менять. В сводный0.1.9 инкремент не включён.** Сохранять защищённый cursor по offset + dev/inode + последнему целому LF + generation/seq/watermark и нормализованный индекс request/native-фактов текущих OPEN run; новые байты разбирать ограниченными порциями. Замена/усечение/дырка/source_gap остаются именованными отказами, новый generation не стирает gap. При cold rebuild >16 MiB сохранять продвижение между тактами, пока источник не дочитан — incomplete/null; полноту нельзя объявлять по одному хвосту. Закрытые request facts удалять только после доказанного безопасного cut для всех использующих их OPEN run. Native и SQLite/WAL требуют отдельного bounded snapshot/cursor решения: один offset сырого R не отменяет их бюджет и согласованность. Исполнение не ждёт rebuild, учёт не отменяет задания.

Альтернатива — ротация/шарды R по run у Гаммы в TG с отдельным принятым контрактом истории/общих native turns. В этом наряде не реализуется и ей не назначается. Предпочтение нормализатору сохраняет согласованный raw R и разделение ответственности. Выбор/назначение следующего кода — координатору до сводного выпуска; текущая дельта только называет предел и план, не выдаёт его за устранённый.

## Caller через очередь почты: контракт и монтаж

`init` генерирует/выбирает один runId, затем до первого AP-шага делает единственную попытку `/usr/local/bin/autopilot-mail register-run` с JSON stdin. Адрес сокета по умолчанию штатный; `AUTOPILOT_USAGE_MAIL_SOCKET` позволяет явный адрес для проверяемой transport-конфигурации/копии, не меняет TLS/UID-доверие. Контакт ≤0,2с на socket operation, внешний предел subprocess0,75с, группа убивается при timeout. После TLS/peer-проверки посылается строка, **ответ/ACK приложения не читается**. SUBMITTED означает отправленные байты, не QUEUED/REGISTERED. Connect/TLS/client/timeout ошибки превращаются в local UNBOUND с именем; init и модель продолжают. Утраченная при недоступной почте заявка автоматически не становится зарегистрированной после возврата; в пробе возврата выполнен новый init. Повтор runId отказан RUN_ALREADY_EXISTS, даже если тело одинаково; внутренний повтор root-такта для уже REGISTERED — это не новая заявка.

Wire запроса: `{op:"usage_register",runId,project,startedAt,operator:{pid,uid,boot,start}}`; никаких source paths, команд и Python/argv для root. `startedAt` — точный UTC момент init-запроса (микросекунды), а не старое округлённое до секунды UI-поле; иначе начало того же SDK-запроса могло оказаться позже округлённого времени. Почта принимает startedAt в пределах [serverNow−5с, serverNow+1с], проверяет kernel SO_PEERCRED UID master, строгую форму/размер≤8192B и сохраняет intent/requestSHA/kernel peer UID+PID/acceptedAt в отдельную таблицу своей SQLite. Поле operator из тела оставлено только для совместимости и не участвует в привязке. ДО TLS и чтения body приёмник снимает SO_PEERCRED peerPID и цепочку /proc/stat до PID1 (≤64 узлов, cooperative50мс), дважды проверяет родителя/starttime и сохраняет chain:[{pid,starttime}],boot_id,uid в отдельном operator_json. Только этот снимок использует root. Если proc уже исчез или изменился — очередь хранит REGISTRATION_CHAIN_UNAVAILABLE, root выдаёт именованный UNBOUND. Нет pre-start application ACK; TLS-handshake удерживает клиента живым во время обычного accept/capture, но успех произвольной гонки/пропавшего proc не обещается.

Таблица ограничена128 intent. Совпадающий runId/requestSHA не добавляет второй run; другой payload с тем же ID отвергается. Почта очищает подтверждённые записи только по root-owned status с совпавшим requestSHA; модель не может прислать «ACK регистрации» вместо root. Root пробует до8 необработанных intent за такт, private cursor обеспечивает справедливость и при неуспешном префиксе; REGISTERED строки не отнимают попытки. Большой backlog может ждать несколько тактов; нет обещания максимум61с для произвольной очереди/сбоев/источников. Штатный timer60с/Accuracy1с, справочный R-collector не имеет общего wall30/35с (TimeoutStartSec=0); фактические started/accepted/registered времена различаются и сохраняются, не подменяются текущим cut.

Root profile — `/var/lib/autopilot-usage/source-profile.json` (или явный root CLI `--profile`), owner0 без ссылок и writable group/other в предках. Поля строго `schemaVersion:1,mailDatabase,projectRoots:[...],participants:[...]`; участники имеют тот же runtimeSource/sources контракт выше. У каждого участника профиля обязательно `tgService` (например `master.service`): это имя TG-службы для сторожа, не часть billing-record. Сторож берёт `participants[].runtimeSource.raw` и `participants[].tgService` из этого же файла; active и mtime R старше300с дают «писатель молчит». Коллектор systemctl не вызывает и перед построением record снимает только это поле метаданных. Root issuer задаёт только допустимые HOME/файлы/движки и проектные корни; project должен быть canonical directory UID master в этих корнях. В init body этих путей нет. До включения timer назначенная рука проверяет профиль целиком и provision root canonical index; программа не угадывает профиль из actor-owned state.

Доказательство оператора: consumer-совместимый G request должен дополнительно нести `sourceProcess:{pid:int,boot:boot_id,start:decimal_/proc_starttime_string}` от G producer. UID должен совпасть с master, тройка sourceProcess должна точно совпасть с одним из server-captured предков на том boot; PID отдельно и body hint не годятся. Interval G request содержит startedAt, watermark закрывает этот момент; выбранная native session/created/turn уникальна. Затем owner exporter независимо сверяет SDK requestId/binding и физические native start/end/claims. Нет/неоднозначность/лаг — `REGISTRATION_CONTEXT_UNAVAILABLE`/`REGISTRATION_CONTEXT_AMBIGUOUS`/`REGISTRATION_SOURCE_LAG`, не выбор «последней сессии». Это дополнительный G-метаданный интерфейс, поставщик — Гамма; живой supplier sourceProcess здесь не принят. **G/raw в пробах синтетические, живой 1fc не проверен.**

Регистрация асинхронна. Canonical root record сохраняет runId и startedAt из удостоверенной заявки, даже если SDK ход завершился до root-такта. Source R/G/native факты за промежуток читаются задним числом. Для неизменённого c755 prepared snapshot получает нижнюю границу чтения до ДОКАЗАННОГО claim выбранной job: claim может предшествовать init, и его binding нельзя выбрасывать как старую историю. Это не перенос canonical startedAt и не приписывание других jobs: принадлежность/границы/множества R/G/raw по-прежнему проверяются. Основа счёта — целые закрытые SDK turns, не обещание точного разрезания одного SDK call по времени shell-команды init.

Root пишет защищённый record/reservation/index и public `registrations/<runId>.json` с requestSHA/projectRef/state/reason/timestamps. Projector доверяет REGISTERED только этому root evidence с совпавшим projectRef; actor state допускается лишь как SUBMITTED/UNBOUND с пометкой client_report. Панель сразу показывает «Учёт неполон: регистрация после старта», UNBOUND и причину, а не пустоту/нулевой расход. REGISTERED — ещё не observed receipt: полнота расходов отдельно проверяется consumer.

Новые AP-task адресаты добавляются в root roster только из удостоверенной почты и root profile, до сбора. Старые адресаты не удаляются из record из-за GC; потеря jobset остаётся неполнотой. Нет профиля/старый сервер без usage_registrations/невалидный индекс — named background error, не успешный пустой scan. Указанные бюджет16MiB/cooperativeprep/remainingconsumer30с и ограничения full-source R остаются; регистрационные SDK/native/почтовые чтения тоже списывают NON-G sourceBytes, а регистрационный G учитывается отдельным грантом и gatewayBytes.

Поставка требует postal **0.1.9 server+CLI+mail_registration.py**, нового ExecStart и отдельного принятого рестарта AP-почты; права User=autopilot-post/NoNewPrivileges/ReadWritePaths не расширены. `lib/post_layout.py` строит новый immutable `/opt/autopilot/post/0.1.9`, старые полки0.1.3/0.1.4 сохраняются. AP physical local_revision включает b11/r-ancestry, source-lock/part-b-lock пересчитаны. Сам installer службами не управляет, монтаж/enable/restart автором не выполнены. Live G, живой профиль и внешние ворота остаются назначенным рукам.


## Дельта 16:54Z: происхождение, finish, следующий выпуск

Очередь отказывает второму runId; root register также отказывает уже имеющемуся run, не заменяет record/index/reservation. Init выбирает runId один раз. При отсутствии REGISTERED postal-origin run становится RUN_NOT_REGISTERED/incomplete; исчезновение marker не превращает его в legacy/manual run. Почта прежней версии, сохранявшая только client hint, не удостоверяет новую цепочку — такие строки UNBOUND, не мигрируются догадкой.

Граница оператора: одна доказанная sessionId/sessionCreated от init до AP finish. Anchor turn нужен для доказательства init; последующие turns этой сессии до finish относятся к той же operator job. Полностью поздний native turn исключён AFTER_RUN до разбора его child claims, так что этот класс поздней деятельности не портит старую квитанцию. Проверки схемы всего append-only источника, GAP и общий бюджет по-прежнему действуют на полный файл; инкремент/изоляция исторических окон в0.1.10 ещё не реализованы. Native turn, пересекающий finish, даёт RUN_FINISH_SPLITS_TURN/incomplete: расходы целого turn не режутся по wall clock. Это существенная граница: finish внутри ещё активного SDK/native turn не даёт полную финальную квитанцию.

Guard до durable state save ставит точную usageFinishedAt. После успешной записи он сохраняет master-owned `.autopilot/usage-finish/<runId>.json` с runId,project,finishedAt; fsync файла и обоих каталогов до снятия catalog pin. Ошибка учёта не отменяет finish/модель, но печатает RUN_FINISH_UNATTESTED. Root читает только производный от уже принятого canonical project путь, проверяет владельца master, режимы/nlink/ссылки/поля и закрепляет immutable `run-window/<runId>.json` с SHA исходника. Current state при отсутствии finish-marker используется только для подтверждения ещё активного run или именованного отказа; он не может подменить старую границу. Новый init того же проекта может сменить current state до root-такта — per-run marker остаётся. После root seal удаление actor marker не открывает окно. Удаление REGISTERED, напротив, даёт named incomplete.

Reopen с тем же runId не открывает закрытое окно учёта; нужен новый init/новый runId и штатная смена root reservation. Прежнее требование root CLOSED перед повторным регистрационным использованием того же project сохранено; автозакрытие старого root run этой дельтой не добавлено. Обрыв публикации root register до REGISTERED не выдаётся за успех: остаётся именованный UNBOUND/RUN_ALREADY_EXISTS для отдельного root-разбора, run не удваивается. Подстановка G только с объявленным sourceProcess wire; живой1fc не проверен.

**Предлагаемый следующий выпуск — dsh-autopilot0.1.10, Бета/normalizer.** До его ворот: bounded incremental R offset/dev/inode/LF/generation/seq/WM, устойчивый backfill, доказанная ротация/усечение и GAP; отдельно native/SQLite/WAL. Это выпуск, а не обещание «потом». В0.1.9 остаётся численно названная мина16MiB/≈12741 R-only request при выбранной fixture, без нулей вместо неизвестного.


## Несущий рубеж регистрации / Bearing registration check

Проекция 6c52 проверяет формат и согласованность метаданных. Согласованную подделку engineStart/boot_id вместе с sourceProcess.start/boot она пропускает. Несущая проверка — неизменённый operator_tuple из605: полная тройка (pid,starttime,boot_id) сопоставляется с peer-ancestry, которую AP-почта снимает из живого ядра при приёме SO_PEERCRED. Это не чтение живого /proc заново на позднем root-такте: PID к нему уже может исчезнуть. Цепочку задаёт сервер почты, не текст задания/клиентский hint. Нет точного соответствия — именованный UNBOUND. Ослабление этого условия запрещено. Адрес: runtime/usage_registration.py:operator_tuple; приём/capture_ancestry — lib/mail_registration.py. Новая проба меняет start/boot согласованно в обоих местах, настоящий6c52 принимает проекцию, kernel-рубеж отвергает, возврат проходит.

The unchanged605 operator_tuple is the bearing authenticity check: it matches the full pid/starttime/boot_id triple against ancestry captured from the live kernel by AP mail at SO_PEERCRED acceptance. The6c52 projection validates metadata consistency and accepts a coordinated forged start/boot pair; it does not attest the kernel identity. No exact match means named UNBOUND. This check must not be weakened. Root uses the kernel evidence captured at acceptance, not a potentially reused/disappeared PID queried later.

## Все виды producer ced3 и вместимость128MiB

Все15 kinds получены настоящими методами producer в отдельном live-harness на собственном child (моделей0). JSON.stringify без отступов +LF, UID0 только в private namespace. authUnknown и сериализация claudeHandle проверены без открытия token-файла и без утверждения о действительном FD3/auth handle. Столбец размера — самый короткий вектор, полученный в этой пробе, не обещание минимума каждого аргумента публичного API. Глобальный минимум234B доказан отдельно по коду: неизменяемый envelope любого валидного context уже294B без kind/payload; только отказ binding обедняет context до UID, и его самый короткий внутренний вариант — source_gap/process234B. Все другие kinds используют полный context. Произвольный посторонний enqueue с переопределением служебных полей не рассматривается как внутренний формат producer.

Вместимость — floor(134217728/bytesWithLF), остаток —134217728%bytesWithLF. Это число одинаковых строк данного размера, не число requests/calls. Примеры:234B→573580строк,8B остатка;332B→404270строк,88B остатка. Идентификаторы/seq/времена могут удлинять реальные строки; плотный benchmark сохраняет schema/seq с padding и отдельным малым хвостом, поэтому его404248строк не равны арифметическому404270.

|kind|наблюдено байт с LF|строк в128MiB|остаток,байт|
|---|---:|---:|---:|
| `assistant_usage` | 457 | 293693 | 27 |
| `auth` | 377 | 356015 | 73 |
| `child_edge` | 404 | 332222 | 40 |
| `engine_process_binding` | 590 | 227487 | 398 |
| `engine_process_closed` | 357 | 375960 | 8 |
| `engine_process_start` | 379 | 354136 | 184 |
| `engine_ready` | 344 | 390167 | 280 |
| `engine_terminal` | 379 | 354136 | 184 |
| `protocol_usage` | 579 | 231809 | 317 |
| `source_gap` | 234 | 573580 | 8 |
| `thread` | 362 | 370767 | 74 |
| `turn_started` | 408 | 328965 | 8 |
| `turn_terminal` | 409 | 328160 | 288 |
| `unsupported` | 352 | 381300 | 128 |
| `watermark` | 332 | 404270 | 88 |


## Окно повторов регистрации / Registration retry window

Для AP0.1.9 root drain обрабатывает заявки последовательно, до8 новых попыток за такт; кэша G нет. Ожидание асинхронного G ограничено **accepted_at +180с**, где accepted_at — момент приёма AP-почтой по её собственным часам, сохранённый в SQLite. Срок не продлевается новым тактом, перезапуском коллектора или новым checkedAt. Это политика ожидания: 2×(OnUnitActiveSec60с +AccuracySec1с) + heartbeat G15с + TimeoutStartSec службы35с =172с, округлено до3мин. Основания: systemd/autopilot-usage.timer:6–7, autopilot-usage.service:11, producer ced3d243 usage-producer.mjs:22. Это НЕ гарантированная задержка flush или приёмки всей очереди128; поздно дошедшая очередь явно истекает без G-чтения. В момент границы (>= accepted_at+180с) попытка уже запрещена; срок проверяется и после owner-вызова до register.

Повтор разрешён только с явным boolean retryable от доверенного owner-reader и одной из причин REGISTRATION_CONTEXT_UNAVAILABLE/REGISTRATION_SOURCE_LAG. Разрешённые случаи: файл G ещё не появился/пуст, в выбранном окне пока нет записей, строго проверенный pre-binding prefix либо ещё нет записи для PID из снятой цепочки; watermark может отстать только при уже непротиворечивом kernel tuple. Группы проверяются штатными groups/process_request/process_requests Гаммы: другой pending observer не скрывает конфликт законченных групп. Недоступность сама по себе не доказательство будущей дописки. SOURCE_GAP/повреждение схемы/seq/неверная тройка при известном PID/неоднозначность/бюджет/оборванный последний LF — конечные отказы. Последняя неполная строка не разбирается; повтор для неё не разрешён без доказательства восстановления append. G decoder и несущий operator_tuple605 не изменены.

Root status дополнен terminal:bool и retryUntil:UTC|null; прежняя public-проекция сохраняет прежние поля. Для конечного UNBOUND срок null, состояние не оживает после исправления источника. Старый UNBOUND без доказанного разрешения повтора тоже конечный. До дорогого owner-вызова root атомарно сохраняет конечный REGISTRATION_ATTEMPT_INTERRUPTED; аварийное прерывание не оставляет вечный повтор. Только явный переходящий отказ заменяет его на terminal=false с неизменным сроком; истечение даёт REGISTRATION_RETRY_EXPIRED. Возврат источника помогает только ожидающей заявке в окне; для уже конечной требуется новый удостоверенный runId (либо отдельно назначенное административное действие, которого кандидат не добавляет). Причина продолжает публиковаться как UNBOUND, не как нулевой расход. Модельный ход не ждёт этой очереди и не отменяется её отказом.

Bounded background retries in AP0.1.9 use a fixed **180-second window from authenticated mail accepted_at**. The policy allows two60s timer opportunities (+1s accuracy each), a15s G heartbeat and the35s service limit:172s rounded to3min. It is not a flush guarantee or a128-entry queue completion SLA. Expired entries do not enter the owner reader; the deadline is checked again before register. A new tick or collector restart cannot extend it.

Only an explicit typed retryable=true for CONTEXT_UNAVAILABLE/SOURCE_LAG can permit another attempt: missing/empty G, no selected records yet, a validated pre-binding prefix, a not-yet-recorded peer PID, or a lagging watermark after an unambiguous kernel match. Complete observers must still pass Gamma's unchanged decoder and the bearing kernel check. Conflicts, source gaps, schema/seq/kernel mismatches, budgets, incomplete final LF and unknown failures are final UNBOUND. Root terminal/retryUntil metadata never changes the public receipt wire. A conservative persisted stop before owner I/O prevents crash-driven endless retries; legacy UNBOUND without retry proof is final. A repaired source cannot revive a final run: it needs a new authenticated runId or a separately authorized administrative action. Execution never waits for accounting. Cache/batch-per-participant, incremental source reading and epoch/gap metadata remain AP0.1.10.


### Приёмка целых поколений / Whole-generation acceptance

Тест, прежде требовавший UNBOUND для хода старше600с со свежим heartbeat, был неверным: строковый отбор сам отрезал начало и создавал seq-gap. Теперь тот же private kernel/owner/register pipeline требует REGISTERED; порча всех свежих heartbeat делает поколение полностью старым→UNBOUND, возврат heartbeat→REGISTERED. Отдельные проверки перемежения подтверждают: wholly-old observer исчезает целиком, активный сохраняет все строки, запоздалый старый duplicate binding внутри активного поколения даёт AMBIGUOUS. Без generation, с неверным типом или длиной нельзя доказать принадлежность строки: именованный отказ, не тихое исключение. Гаммин groups(:34–60) использует тот же ключgeneration и получает исходный seq с1; несовместимого условия не обнаружено. SOURCE_GAP от реально потерянного начала/ротации по-прежнему не исправляется фильтром. Физическая ревизия этого совмещённого кандидата —a17-b14-c2-team-online-r-gcontext,AP0.1.9.

The former test expected UNBOUND for a long-running turn with a recent heartbeat; it codified a reader defect. The real private registration pipeline now requires REGISTERED. Making all its heartbeats stale removes that generation and yields UNBOUND; restoring the recent heartbeat restores REGISTERED on the private test copy. Wholly stale observers are omitted as complete groups. A delayed old duplicate binding in an active group still produces AMBIGUOUS. Missing/invalid generation metadata refuses selection. The unchanged Gamma groups(:34–60) receives every original seq; missing source history or rotation is never repaired by inventing seq1. This combined AP0.1.9 candidate uses physical revision a17-b14-c2-team-online-r-gcontext.

### Проба ced3 → 25d на одном файле

Старая форма читается без gatewayTransport. Копийная проба использует exact ced3 writer и его engine-process helper, реальный свой ChildProcess и SO_PEERCRED/AP-mail/SDK/native proof, без модели. Первый новый run REGISTERED на одиночном файле. Реальный25d сохраняет исходные bytes при prepare, затем его новое поколение начинается в legacyS0 и продолжается в active1 с настоящей печатью/manifest. Новый run после окна рождения источника REGISTERED. Root-реестр фаз — раздельные частные снимки; это не аттестация живого OPEN-run cutover. SourceCreatedAt не подменяется0:1300мс, второй acceptedAt4201300мс, cutoff3601300мс. Нужные первыеseq берутся изS0 по целому поколению. Root snapshots reset только в tmpfs; физический G-файл один и тот же.


Охрана одиночного G при следах ротации (AP0.1.10): если gatewayTransport отсутствует, но рядом с файлом есть segments, manifest, manifest.json, source.json либо <имя-G>.source.json, регистрация и экспорт расходов возвращают RETENTION_GAP до открытия G. Даже пустой каталог или оборванная ссылка на сегментную историю не разрешают fallback. Это охрана от неполного одиночного чтения после отката шлюза: A уже может быть в seal, а C — в active. Она не проверяет саму печать; для чтения сохранённой истории нужен принятый сегментный профиль. При отсутствии всех признаков прежний legacy-путь сохранён. Соседство повторно проверяется после чтения до декодирования/использования G. Признак, появившийся при открытии/чтении, также даёт RETENTION_GAP. Атомарного снимка всего каталога это не создаёт; прежняя проверка идентичности читаемого G остаётся действующей.

Legacy rollback guard: with no gatewayTransport, adjacent segments/manifest/manifest.json/source.json or <G-name>.source.json refuse with RETENTION_GAP before opening the single file. Empty or dangling history markers also refuse. Both registration and expense readers share the guard. Removing all markers restores the old single-file path. The guard runs before opening and again after reading, before G decoding/use. A marker appearing during open/read also refuses. This is not an atomic snapshot of the directory and does not validate seals; existing G snapshot identity checks remain in place. The private A-in-seal/C-in-active test uses real registration; deleting the guard falsely registers, restoring it refuses again. No live gateway/model run is attested.


УстановщикAP0.1.10: apply(dir) создаёт только отсутствующий каталог с mode0700, проверяет открытый O_DIRECTORY|O_NOFOLLOW fd и затем fchmod до целевого режима. Существующий group/other-writable каталог остаётся отказом; installer не чинит0775 и не меняет общуюumask. Это снимает отказ нового каталога приumask0002, но не легализует небезопасные fixture-каталоги, созданные до вызоваapply.

AP installer creates a missing directory0700, validates the opened directory fd and then applies its target mode. Existing0775 directories remain refused without repair; the process umask is unchanged. Pre-existing unsafe fixture directories still require their own correction.


Root0002: доверенные положительные фикстуры задают собственныеmode/owner черезfd, ане подменяют маску процесса. Почтовый parent700, root-owned код экспортёра755/644, fakeNSS root/etc755 с файлами644/600, Master project/control700. Удалённый root-статус восстанавливается с сохранённымmode. Production public_tree.prepare создаёт только новый каталог сmode0700 до прежнейпроверки/fchown/fchmod; existing0775 отказывается. ВунаследованномSGID каталоге допускаетсяkernel2700: битыдоступа всёравно0700.

Production overlay ap.py save(state) задаёт fd-временномуфайлу0600 ДО JSON-write/replace, независимо отcallerumask; state bytes иevent-format прежние. Это изменение прав B writer иpins (b23), не заявление «B bytes неизменны». Сам п8 иB legacy-interop не перерабатывались; все исходные57 registration cases иодиндобавленный guard-case сохранены (floor58).


Init directories: базовый `cmd_init` создаёт каталог прогона и `tickets` отдельными `makedirs(mode=0o700)`. `mode` только для конечного узла одного `makedirs` не задаёт права промежуточному родителю. Существующие каталоги этим кодом не chmod-ятся. На sadik `ap_sadik.pinned_fresh` заранее создаёт оба через `child_dir` с явным `0750` и прежней owner/write-проверкой; она сохранена. Поэтому старый sadik-путь уже защищал каталоги от group-write. Ссылка `team_usage.py:491` относится к родителям почтовой БД, а не каталогу прогона; нового доказательства `RUN_ORIGIN_UNPROVEN` от каталога прогона не заявляем.

Base `cmd_init` creates the run directory and `tickets` separately with explicit `0700`; existing directories are unchanged. The sadik adapter retains its existing `child_dir` creation with explicit `0750` and owner/write checks. The actual master init under caller umask `0002` is checked through REGISTERED and an observed receipt.

## Directory fixture contract on 432368b3

Положительные фикстуры используют `_fixture_dirs.fixture_mkdir(path, mode=..., parents=..., exist_ok=...)`: каждый отсутствующий промежуточный уровень создаётся с явным0755, конечный — с переданнымmode. Существующие объекты не chmod-ятся; негативный0775 сохраняется для отказа продуктовогоguard. TemporaryDirectory/mkdtemp имеют штатныйAPIконтракт0700, а не параметрmode. Общаяumask не заменяется.

В public_tree новыйmkdir0700 предшествует прежней owner/write-проверке иfchown/fchmod. apply уже так работает в основании432368b3. Базовыйinit создаёт run/tickets отдельнымиmode0700, save(state) задаёт0600 до записи. Sadik child_dir остаётся прежним: явный0750 иowner/write guard; team_usage.py:491 относится кmailDBparents.

Private root-origin fixture sources have explicit0600 file modes; the READY retention fixture uses the required0644 config mode. These are fixture permissions, not weaker product guards. Gamma's legacy_window/legacy_window_probe/rollback_catalog_cli fixtures remain unchanged for her hand. The base432368b3 already contains legacy history guards; this permission delta does not add, weaken or extend them. Full stand integration with Avrora raw_supplier is a private proof composition, not a production release.

## engine-account-read

П8 AP0.1.10, отдельный кандидат, не r4. Второй Codex proof — `engine-account-read` из писателя Гаммы3aeb34d4. Положительная auth несёт accountRef/authEpoch (64 lowercase hex), authMode=chatgpt и непустой planType. `authEpoch` AP передаёт без пересчёта; свою метку не вводит. Старый switcher-symlink-three-points и Claude actual-sdk-fd3-handle сохраняются. Проверка живого kernel tuple из usage_registration остаётся несущей: G-проекция сама согласованную подделку pid/start/boot не доказывает.

Root до включения нового proof готовит карту явным window/build-codex-account-map.py: из `/etc/claude-oauth/codex-podpiska-{3,4}/auth.json` выбирается только `tokens.account_id`, в выход уходит SHA256 UTF-8 → codex-N. Email не выбирается и не хранится, ID/токены не выводятся. Builder не пишет карту сам, не вызывается моделью или сборщиком; монтаж файла назначенной рукой по П7. Runtime читает только `/var/lib/autopilot-usage/codex-account-map.json`, schemaVersion1/accounts (одна–две пары), root:root0644, родительские каталоги root-owned без group/other-write. Дубликат ID в двух слотах → ACCOUNT_MAP_AMBIGUOUS при подготовке. Нет карты/неверная схема/опасный путь/изменение при чтении → ACCOUNT_MAP_UNAVAILABLE/INVALID/UNSAFE/CHANGED, без fallback к имени участника или planType. Неизвестный accountRef → ACCOUNT_UNMAPPED.

Карта загружается один раз внутри normalize вызова, не кешируется между вызовами. Размер карты ≤65536Б; её I/O, разбор и проверка входят в прежний metadata-бюджет16МиБ/3с. В segmented пути время G из него исключается; карта не расходует отдельный G-бюджет. Карта более65536Б даёт ACCOUNT_MAP_INVALID. Исчерпание общего metadata-бюджета при загрузке карты даёт BUDGET_EXCEEDED со scope=metadata, переполнение G — scope=gateway. Разборщик сохраняет ACCOUNT_CHANGED_DURING_TURN, ACCOUNT_ROUTING_OVERRIDE, ACCOUNT_READ_ERROR, ACCOUNT_READ_TIMEOUT; квитанция incomplete, все шесть итогов null. Уже зарегистрированный run от отказа auth не становится незарегистрированным: неполнота относится к квитанции расхода. До модели нет ACK, учёт не блокирует ход.

Копийный стык: root-выдача карты → owner exporter → неизменённый c755 → именованная неполнота и возврат. Живой account/read и настоящие секреты не читались, фактические подписки этим кандидатом не аттестованы. Настоящий ced3 single-file S0 читается до ротации; после prepare25d на том же файле поколение через S0/S1 регистрируется. Это две отдельные заявки после закрытия первой и сброса частного root-снимка, не проба переключения уже OPEN боевого run.

English contract: AP takes the writer3aeb34d4 raw authEpoch verbatim. A root-issued digest map selects codex-3/4; neither planType nor participant names infer the slot. Only the explicit root window builder selects tokens.account_id and hashes it; runtime never opens credential files. Unknown accountRef is ACCOUNT_UNMAPPED. Missing/invalid/unsafe/changed maps refuse with named errors. Map limit65536B; its complete load belongs to metadata16MiB/3s, separate from G. It loads once per normalize call and is not cached across calls. Four negative account details retain their names and produce incomplete/six-null totals. Existing legacy Codex and Claude proofs remain supported. Registration's live kernel tuple check is mandatory. No model-path ACK is added. Proofs use private fixtures, not live auth/account RPCs.


## Дельта ворот 14:39Z: независимые области панели

Карточки v1 остаются рядом с командной квитанцией v2: Codex «Поток оператора»
(с прежним уточнением дочерних потоков, когда они входят в область) и валидный
observed Claude «Сова · указанные запросы». Их числа, окно и measuredAt не
заменяются новым team-срезом. Неизмеренный Claude по-прежнему скрыт. Пока R/G
не поставляют привязку, командная строка показывает «неполно: нет R/G», UNBOUND
поимённо и шесть null итогов. Старые карточки не считаются расходом всей команды.
