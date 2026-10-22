## Codex engine account proof — AP 0.1.10, private candidate

RU: В app-server режиме G дважды вызывает `account/read` у ТОГО ЖЕ дочернего
процесса: после `initialize`/`initialized`, до `turn/start`, и перед записью
`engine_terminal`. `refreshToken=false`, `initialize.capabilities.experimentalApi=true`.
При равных accountRef пишет auth с proof `engine-account-read`. AccountRef — полный
SHA256 exact `workspaceRouting.chatgptAccountId` (64 lowercase hex). В auth входят
только accountRef, производный authEpoch, authMode из `account.type` и planType плюс proof/общий raw-v1
контекст. `account.email`, его SHA, исходный ID, токены и весь RPC reply не пишутся.
Разрешён mode chatgpt, PlanType — strict enum из binary schema0.162.1; неизвестное
значение/неверная форма дают именованный SUBSCRIPTION_UNBOUND, не догадку.

Имена wire: positive `{kind:"auth",accountRef:"<sha256>",authEpoch:"<sha256>",authMode:"chatgpt",
planType:"<PlanType>",proof:"engine-account-read"}`; negative `{kind:"auth",
accountRef:null,authEpoch:null,authMode:null,planType:null,reason:"SUBSCRIPTION_UNBOUND",
detail:"<named reason>"}`. Полей codex-N/subscription в новом proof нет:
сопоставление accountRef→codex-N и AP validator — отдельная рука Беты. Старый
SDK exec без app-server account API сохраняет прежний route-only отказ.

RU: authEpoch выдаётся при первом успешном account/read: `authEpoch = sha256("engine-account-read" ‖ processEpoch ‖ accountRef)` (UTF-8, конкатенация без разделителей); стабилен при той же учётке внутри процесса, меняется с процессом/учёткой; при отказе — null.

Наблюдённый иной ID, включая A→B→A, фиксирует
`ACCOUNT_CHANGED_DURING_TURN` до конца observer; более ранний именованный отказ,
если он уже был, сохраняет приоритет. Ни один последующий ответ не снимает отказ. `account/updated` сам по себе
не означает смену: только запускает account/read. В один момент один RPC и один
coalesced hint; hint во время initial не теряется, его чтение завершается до
turn/start. Новые hints во время hint-read объединяются с ним, не порождают
цикл перечитываний из собственного уведомления. Перед terminal приём новых hints
закрывается; уже ожидавший hint завершается перед обязательным final read.

Каждый read ограничен2000мс; initial/final могут дополнительно дождаться одного
уже занятого hint. Нет retries/login/logout/config/read. RPC ошибка —
ACCOUNT_READ_ERROR, deadline — ACCOUNT_READ_TIMEOUT; неверный ответ —
ACCOUNT_READ_SCHEMA_INVALID/ACCOUNT_ID_UNAVAILABLE/ACCOUNT_AUTH_MODE_UNSUPPORTED.
Незавершённый ход без точного terminal — ACCOUNT_TERMINAL_UNPROVEN; потерянный
обязательный final read — ACCOUNT_READ_FINAL_MISSING. Поздние ответы не дописывают
auth после закрытия. Ошибка учёта не отменяет модельный ход; его запуск может
дождаться bounded initial proof, terminal G — bounded final proof.

Любой непустой accountRoutingOverride кроме NO_CONSTRAINT отказывает
ACCOUNT_ROUTING_OVERRIDE. Основание исключения: точный upstream rust-v0.162.1,
[`model-provider/src/workspace_routing.rs:60`](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/model-provider/src/workspace_routing.rs#L60):
`"NO_CONSTRAINT" => None` при выборе x-openai-account-routing-override header.
Это отсутствие override HEADER, не обещание отсутствия региональной маршрутизации:
backendOrigin всё ещё применяется, но в G не копируется. Остальные непустые значения
(us/us_cr/неизвестные) остаются UNBOUND; исходный override в G не записывается.
Пустая строка/null допускаются как пустое значение по наряду; отсутствующее поле
или неверный тип — ACCOUNT_READ_SCHEMA_INVALID.

EN: The same spawned Codex app-server is queried after initialization, before
turn/start, and again before the G terminal record. Equal SHA256 account IDs produce
engine-account-read proof containing only accountRef, derived authEpoch, account.type as authMode,
and the strict PlanType enum. No email, email hash, raw ID, token, backend origin
or full reply is retained. Observed ID changes are sticky through the turn; an earlier named failure keeps priority.
account/updated only requests a fresh read; it is not identity evidence. Reads
are coalesced and bounded at2000ms each. Errors/timeouts produce named unbound
records; late replies cannot upgrade a closed observer. NO_CONSTRAINT alone is
accepted as the documented absence of a routing-override header; other nonempty
overrides refuse. This attests engine-reported account state at the observed read
points, not billing or identity of an unobserved model request. Beta separately
maps accountRef to a subscription slot and updates the AP consumer.

EN: On the first successful account/read, `authEpoch = sha256("engine-account-read" ‖ processEpoch ‖ accountRef)` (UTF-8 concatenation, no separators); it stays stable for the same account in one process, changes with the process/account, and is null on refusal.

## G 3.1.8 — writer ротации, только кандидат AP 0.1.10

**G не защищён от намеренной переписи учёткой агента.** Печати предназначены
для обнаружения случайной порчи. Root-import и parsed/disk cache отсутствуют.
Намеренная согласованная перепись bytes/manifest/SHA вне модели угроз.

**G is not protected against intentional rewriting by the agent account.** Seals
address accidental corruption. There is no root import or parsed/disk cache;
coordinated rewriting of data and its hashes is outside this threat model.

### Потеря G и подмена active · Loss of G and active replacement

**Каталог G (.usage-meter) НЕ восстанавливается из копий никогда. Потеря G —
потеря учёта за период, а не повод вернуть старое.** Восстановление каталога G
при ОСТАНОВЛЕННОМ шлюзе, с подменой истории ровно в окне регистрации, не
различается; это действие запрещено правилом выше. sourceCreatedAt не является
доказательством отсутствия такого восстановления.

Работающий writer сохраняет dev/inode/size и времена своего active. Перед
дописыванием смена inode или размера (включая копию с теми же байтами) означает
G_ACTIVE_REPLACED. Suspect bytes уходят в segments/<sourceEpoch>-<segmentNo>.replaced
0400; это карантин, не canonical raw и не источник для AP. Writer долговечно
пишет вместо утраченного active canonical source_gap с scope=process,
reason=G_ACTIVE_REPLACED и replacedFile, закрывает этот gap-сегмент с обычной
печатью и открывает следующий пустой active. sourceId/epoch/sourceCreatedAt
не меняются. Незавершённый active_gap intent доводится при restart; незавершённый
обычный seal не перетирается. При ошибке FS marker может не записаться —
отказ остаётся в журнале, полнота не обещается.

Существующий process-scope latch останавливает G всего процесса до restart,
модельный HTTP-запрос продолжает выполняться. Restart не лечит старые окна:
source_gap/seqhole выбранного полного поколения по-прежнему даёт SOURCE_GAP
в groups(); свежий доказанный период проверяется отдельно политикой P1.
.replaced удаляется writer вместе со связанным gap-сегментом по его closedAt
через 7 суток, не читается как история и учитывается ночным обходом Альфы
как дополнительные байты/файл сверх здоровой часовой формулы. На restart
заранее восстановленную согласованную историю этот механизм не различает.

**The G directory (.usage-meter) must never be restored from backups. Losing G
means losing accounting coverage for that period, not permission to restore old
history.** Restoring G while the gateway is STOPPED, replacing history exactly
inside the registration window, cannot be distinguished. That action is
prohibited by this rule; sourceCreatedAt does not prove it did not happen.

A running writer remembers active dev/inode/size and timestamps. Before append,
changed inode or size, including a byte-identical copied replacement, triggers
G_ACTIVE_REPLACED. Suspect bytes move to the0400 .replaced quarantine beside
closed segments; readers must never treat it as canonical history. The writer
persists a canonical source_gap (scope=process, reason=G_ACTIVE_REPLACED,
replacedFile), seals that gap segment and opens the next empty active segment.
Source identity and birth are preserved. An active_gap intent supports restart
recovery and never replaces a pending ordinary seal. Filesystem failure may
prevent the marker itself; a journal message cannot prove complete raw history.
The existing process-wide latch disables G until process restart, while model
HTTP handling continues. Restart does not repair historical coverage. The AP
reader still obtains SOURCE_GAP from groups() for any selected generation with
a gap or sequence hole. The writer removes quarantine with its linked gap
segment after seven days by closedAt. Alpha's nightly size/count audit includes
these extra files beyond the healthy hourly baseline. Restoring consistent
history before startup remains outside the live identity check.

Формат для читателя (код AP меняет Бета отдельной дельтой):

- `<engineHOME>/.usage-meter/gateway-v1.jsonl`: active regular0600, родитель0700.
- `.usage-meter/segments/manifest.json`: regular0600, schemaVersion1; sourceId,
  sourceEpoch, active:{segmentNo,openedAt,origins}, segments:[seal...],
  deletedMaxObservedAt:null|epoch-ms, retainedFrom. origins: generation→firstSegmentNo.
- `.usage-meter/segments/<sourceEpoch>-<segmentNo>.jsonl` и `.seal.json`: regular0400,
  свой UID/nlink1, каталог0700, no symlink. Номер сегмента монотонен с0 и не seq.
- Seal: schemaVersion1, sourceId/sourceEpoch, segmentNo, file, closedAt(epoch-ms),
  byteLength, sha256(точные bytes сLF), generations:[{generation,firstSeq,finalSeq,
  finalObservedAt,maxObservedAt,firstSegmentNo}]. Final относится к сегменту,
  не означает конец поколения; max отдельно нужен для P1 до проверки rewind.
- gateway-v1.jsonl.source.json0400 рядом с active: sourceId/sourceEpoch и
  sourceCreatedAt (UTC epoch-ms), записанный при первой инициализации. Обычный
  restart/rotation/GC дату не меняют. UUID служит журналу и согласованию файлов,
  ручной UUID в профиле AP не требуется.
  writer.lock0600: постоянный flock FD. Его
  удалять/подменять при живом writer нельзя. Потерянный manifest при этих метаданных
  отказывает; это не новый чистый source. intent.json0600 — только незавершённый
  seal/GC/active_gap; .new временные файлы не являются историей. Два источника в одном
  нестандартном каталоге API получают отдельные manifest/intent/lock prefixes.

Reader contract (the AP integration is Beta's separate change): active is a
0600 regular file; its parent and segments directory are0700. The0600 manifest
carries source identity, active segment number/open time/generation origins,
ordered seals, retainedFrom and deletedMaxObservedAt. Each0400 closed JSONL has
an identical0400 seal mirrored in the manifest. Per-generation finalSeq and
finalObservedAt describe this segment, not end-of-turn; maxObservedAt supports
whole-generation P1. All objects must have the gateway UID, one hard link and
no symlinks. The0400 source metadata beside active contains sourceCreatedAt
(UTC epoch milliseconds), sourceId and sourceEpoch. UUIDs correlate files/logs;
there is no manual AP UUID enrollment. Ordinary restart/rotation/GC preserve the
birth time. The0600 writer.lock retains flock. Partial loss of segments or
manifest refuses instead of silently restarting history. intent.json (seal/GC/active_gap) is recovery state,
not an additional raw kind. Temporary .new files are not source records.

Один writer сериализует append/seal/GC. Нужен Linux `/usr/bin/flock` (util-linux),
он получает inheritedFD3; родитель удерживает тот же open-file-description после
выхода helper. Нет пакетов/демона для этого кода. Второй writer — G_WRITER_BUSY.
Сегмент закрывается перед превышением8МиБ или через1час непустой жизни; idle
таймер тоже зовёт seal. Пустые часы не плодят закрытые файлы. Событие<=65536Б
не режется. Generation/seq продолжаются через сегмент; restart не переписывает
старые строки и восстанавливает origin. Рестарт процесса не возобновляет старый
HTTP-ход/движок: следующий GatewayUsage получает собственную generation/seq1.

One serialized writer owns append, seal and GC. Linux /usr/bin/flock locks an
inherited FD; the parent retains the lock. A second writer fails G_WRITER_BUSY.
Close before exceeding8MiB or after one hour of a nonempty segment, including
idle timer invocation. Empty hours produce no closed segments. Records up to
65536bytes remain whole. Rotation preserves observer generation and sequence;
process restart preserves previous bytes but does not resume an engine/HTTP turn.
The next observer starts a distinct generation at seq1.

GC делает writer при startup, seal и часовом обслуживании: eligible closedAt
<=now−604800000мс; до/на/после границы различаются. Один pass<=32сегмента,
без повтора до успеха; следующий вызов продолжит backlog. Если время закрытия
нарушает порядок, удаление не перескакивает через более молодой сегмент.
Manifest/scalar публикуется до unlink; crash может оставить лишние файлы,
но не забывает покрытие. deletedMaxObservedAt=max observedAt удалённых строк
(монотонен, null только доGC). Rawход>7суток может утратить начало. Нет pins,
вечного conflict-index, quota/PRESSURE. Пороги наблюдения — в настройке стенда
обхода, не здесь. Writer не удаляет сырьё раньше срока ради размера каталога.
Синхронный fsync может зависеть от ФС;32 — предел числа объектов, не обещание
абсолютного5с deadline для системных вызовов.

The writer reclaims segments with closedAt<=now−7days, at startup/seal/hourly
maintenance, at most32per pass. It never skips a younger prefix segment. The
manifest and conservative deletedMaxObservedAt commit before unlink. A crash
may leave extra bytes but cannot grant false historical coverage. There are no
pins, permanent conflict index or pressure/quota controller. Filesystem fsync
latency is not bounded by the32-object work limit. Nightly size/count warnings
are monitoring inputs, not grounds for early deletion.

Читатель сначала получает полный active и descriptors, выбирает целые поколения
P1 (любая строка>=accept−600с), читает ВСЕ их сегменты отseq1, проверяет SHA/печати
и заново разбирает JSON. Кэша нет. cutoff<=deletedMaxObservedAt → RETENTION_GAP.
Missing required raw/seal/firstSegmentNo → writer validator G_SEGMENT_MISSING
с segmentNo: это вход reader для RETENTION_GAP ДО groups(), не новый raw kind.
Порча byte/SHA → G_SEGMENT_CORRUPT; неправильная печать/manifest → G_SEGMENT_INVALID;
unsafe mode/link/owner → G_SOURCE_UNSAFE. Raw source_gap/seq-дыра выбранной gen
по-прежнему SOURCE_GAP в groups, недоступна вся проекция. ENOSPC может не оставить
marker: journal не raw-input; writer-ротация не добавляет health-transport.

The AP reader obtains full active bytes and generation descriptors, applies P1,
and reads every segment of each selected generation from seq1. It verifies seals
and parses JSON every time. cutoff<=deletedMaxObservedAt is RETENTION_GAP.
G_SEGMENT_MISSING with segmentNo identifies missing raw/seal/origin data for
reader-side RETENTION_GAP before groups(). G_SEGMENT_CORRUPT identifies byte/hash
damage; G_SEGMENT_INVALID identifies bad metadata; G_SOURCE_UNSAFE identifies
unsafe ownership/type/mode/link. Raw source_gap or a sequence hole remains
SOURCE_GAP in groups(), refusing the whole projection. ENOSPC may prevent a raw
gap marker; journald is not a raw event stream or a new health transport.

usage-limits.json schemaVersion3 — единственный источник размеров/сроков:
legacyFileMaxBytes134217728 (только для первого legacyS0), segmentMaxBytes8388608,
segmentMaxAgeSeconds3600, rawRetentionSeconds604800, maxRecordBytes65536.
Пороги наблюдения — в настройке стенда обхода, не здесь. Python читает strict JSON,
не JS. Ошибка static import policy по-прежнему роняет весь gateway. Startup gate
prepareGatewayUsage решает G есть/нет один раз; после отказа нужен restart.
Новая пустая история не расходует seq. Existing established active/manifest loss
не чинится O_CREAT. Legacy S0 допускает старый предел+maxRecordBytes; остальные
sealed<=8МиБ. При полной потере .usage-meter новая инициализация автоматически
пишет новый sourceCreatedAt=Date.now(), не дату из старых файлов/mtime. Для AP
windowStart=max(0,acceptedAt−600000мс); windowStart<sourceCreatedAt означает
RETENTION_GAP до P1: история до рождения неизвестна. Равенство допускается.
Ручного expectedSourceId нет. Первые10минут новые заявки отказываются, затем
новые заявки работают по обычным доказательствам. У ранней заявки acceptedAt
не меняется от ожидания; её cutoff и предел180с не продлеваются. Старые source
metadata без даты рождения не получают выдуманную дату: G_SEGMENT_INVALID.


Policy schemaVersion3 is the single packaged source for writer sizes/retention.
Observation thresholds belong to the nightly scan configuration, not this package.
Python reads strict JSON. Invalid static policy
import still prevents gateway startup. prepareGatewayUsage decides G availability
once per process; a failed startup needs restart. An established missing active
or manifest refuses instead of silently recreating history. The first legacy S0
allows legacyFileMaxBytes+maxRecordBytes; subsequent segments are bounded8MiB.
If the entire .usage-meter directory is lost, new initialization records a new
sourceCreatedAt=Date.now(). It never inherits the old birth time or substitutes
mtime. Before P1, the AP reader rejects windowStart<sourceCreatedAt as RETENTION_GAP,
where windowStart=max(0,acceptedAt−600000ms); equality is allowed. There is no
expectedSourceId/manual UUID profile step. New intents can pass after ten minutes;
an old intent keeps its original acceptedAt/cutoff and180-second retry deadline.
Metadata without a proven birth field refuses G_SEGMENT_INVALID rather than
receiving an invented historical date. The reader implementation is a separate change.


При heartbeat Беты332Б/15с:5760строк/сутки,1 912 320Б/сутки; при ровной работе
24закрытия/сутки по часу плюс один active. Число metadata-файлов: на24закрытых
48raw+seal плюс manifest/lock/active/source-metadata, transientintent отдельно. Другие события,
размерная ротация и частые restart меняют число. Это расчёт от замера Беты,
не замер суточной нагрузки этой версии.

Beta's332-byte heartbeat every15seconds gives5760records /1,912,320bytes per day.
Continuous operation yields24hourly closed segments (48raw+seal files) plus
active/manifest/lock/source-metadata and transient intent files. Other events and size rotation
change this estimate; it is arithmetic from Beta's measurement, not a daily
load measurement of3.1.8.


Расчёт числа файлов для Альфы (здоровый часовой сценарий):
Nclosed=ceil(rawRetentionSeconds/segmentMaxAgeSeconds)=168;
Fstable=2*Nclosed+4=340 (active,manifest,lock,source). Burst/size rotation,
quarantine и transient-файлы увеличивают число. Это справочный baseline, не
порог WARN и не quota. Пороги наблюдения — в настройке стенда обхода, не здесь.

Alpha's healthy hourly baseline is Nclosed=ceil(retentionSeconds/segmentAge)=168
and Fstable=2*Nclosed+4=340. Bursts, size rotation, quarantine and transient files
can increase this count. This is a reference baseline, not a WARN threshold or
quota. Observation thresholds belong to the nightly scan configuration, not here.

Удаление обязательных полей несовместимо с прежней strict-схемой2: её точный
список требовал оба порога. Поэтому policy schemaVersion=3; потребители JSON
должны принимать эту версию и ровно пять исполняемых writer-величин выше.
Схемы source/manifest/seal/raw-v1 при этом не изменены.

Removing required fields is incompatible with the former strict schema2, which
required both warning fields. The writer policy therefore uses schemaVersion3.
JSON consumers must accept version3 and the five writer-enforced quantities above.
Source, manifest, seal and raw-v1 schemas are unchanged.


---

# Исторический контракт3.1.7 (ниже не действует segment-format)

# G 3.1.7 — только AP 0.1.10

Эта дельта от ced3d243 не предназначена для выпуска/окна0.1.9.

## Старт пустого источника (B-N-2111, пункт36)

Стартовое решение «G есть/нет» принимается один раз: `prepareGatewayUsage`
возвращает путь или null, а последующие ходы используют сохранённый
`USAGE_SOURCE_FILE`. Это отличается от 3.1.6, где попытка включения G была
на каждом ходе. Ошибка старта (каталог не 0700, чужой UID, hardlink и т.п.)
выключает G до рестарта всего шлюза; исправленный путь сам по себе не вызывает
повторную инициализацию. Это не отменяет прежних проверок append на каждой
записи и не обещает дальнейшую исправность I/O при успешном старте.

Зовущий — gateway.mjs до server.listen. G включён на поддержанных provider
openai/anthropic: Codex использует только CODEX_HOME, Claude только HOME.
prepareGatewayUsage не создаёт observer, generation или event и не меняет seq.
Новый .usage-meter получает0700, новый gateway-v1.jsonl —0600. Файл открывается
O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_NONBLOCK, безO_TRUNC; приEEXIST толькоlstat.
Здоровый существующий regular0600/uid/nlink1 сохраняется байт-в-байт, inode и
mtime/ctime не меняются. Содержимое при старте не читается и не валидируется.

Неизвестный provider выключает инициализацию; отсутствующий/относительный HOME,
небезопасные modes/owner/link/type или ошибкаfs дают G_SOURCE_UNAVAILABLE и null.
Чужой путь не чинится и не chmod/truncate. Запуск/ход модели продолжается без
observer; чтобы повторить эту стартовую проверку после исправления, нужен restart.
Нет автоматических retries/rotation/admission. Пустой файл не означает нулевой
расход: process_requests6c52 на полном пустом snapshot даёт
REGISTRATION_CONTEXT_UNAVAILABLE. Учёт не выдаёт успешную регистрацию безbinding.

## Проверка безопасности для стенда

Имя реального gate — `prepareGatewayUsage` (`usage-producer.mjs`); отдельной
чистой функции/экспорта `isSafe...` в 3.1.7 нет. Не выдавать ниже имена выражений
за новый JS API. Эта функция также создаёт отсутствующие пути: read-only стенд
повторяет её guards, а не вызывает initializer на боевом HOME.

После проверки поддержанного provider и абсолютного HOME она получает `d`
через lstat каталога `.usage-meter`, `info` через fstat нового файла либо lstat
существующего. Точный положительный эквивалент двух guards:

```js
d.isDirectory() && d.uid === gatewayUid && (d.mode & 0o777) === 0o700
info.isFile() && info.uid === gatewayUid && (info.mode & 0o777) === 0o600 && info.nlink === 1
```

`gatewayUid` здесь — UID из `process.getuid()` в процессе шлюза,
а не UID Альфы/root, запускающего стенд. Каталог не получает условие nlink1.
Для существующего пути нужен lstat, иначе symlink ошибочно станет regular/dir.
Это ровно проверки конечных каталога/файла в коде, не обещание отдельного
анализа всех предков пути. Небезопасный объект не чинится; EEXIST не приводит
к открытию существующего файла на запись.

## Единый предел и guard (пункт34)

Единственный числовой источник — соседний файл пакета usage-limits.json:
{schemaVersion:1,gatewayV1FileMaxBytes:134217728}. Это immutable release-data,
не env/model configuration. JS экспорт GATEWAY_USAGE_FILE_MAX_BYTES берётся из
этого поля; writer не содержит второго file-limit literal.
При битом JSON, отсутствии файла либо негодной схеме/типе статический импорт
`usage-producer.mjs` выбрасывает ошибку до `prepareGatewayUsage` и HTTP-listen.
В результате не запускается **весь шлюз**, а не только учёт G; это не
`G_SOURCE_UNAVAILABLE` с продолжающейся моделью и не fallback-значение.
Граница отказа здесь названа без её изменения.
Проверка пакетного data-file входит в import/pack/full gate; код и данные меняются
одним пакетом. Константа не является доказательством кода ещё живого старого процесса.

Форма guard как контракт:

```js
if (info.size + Buffer.byteLength(raw) > GATEWAY_USAGE_FILE_MAX_BYTES)
  throw Error('SOURCE_GAP');
```

Равенство допускается; размер включает весь JSONL record и завершающийLF.
Проверкаstat→append остаётся неатомарной между observers. Это порог перед append,
не жёсткий quota: параллельные записи могут превысить его. Ротации нет, gap-marker
может не поместиться. Новый контракт числа не устраняет эту известную гонку.

Читатели Альфы/Беты получают число без JS parsing: читают usage-limits.json из
корня той же принятой физической поставки G. Python — strict JSON, ровно поля
schemaVersion/gatewayV1FileMaxBytes, version1, положительный safe integer >65536;
bool/float/unknown fields/нетфайла/другаяверсия — именованный отказ читателя,
не подстановка134217728 или поиск литерала. Путь/пин поставки задаёт доверенный
операторский профиль/лист, не модель и не G-source. Проверка «диск=процесс» остаётся
обязательна в окне, бюджет выводится формулой от N с отдельно названным запасом.
Решение о запасе/общем byte/time-budget принадлежит читателю; этот пакет их не меняет.

Для прежнего draft fc88 сохранён необязательный read-only CLI:
node <G-runtime>/usage-limits.mjs → JSON той же формы. Он импортирует тот же экспорт,
не запускает engine и не читает HOME/учётки/сырой G; любые аргументы дают rc2.
Это выдача константы, не вторая G-проекция. Прямое чтение JSON не требует Node.

---

# Raw G — кандидат 3.1.6 для AP019

Зовущие: HTTP handler шлюза, callback запуска SDK и progonAppServer. Источник — фактический taskControl descriptor, затем SDK/RPC thread/turn/result. Reader — будущий AP root normalizer. Он обязан перепроверить R, native-сессию, UID, job, окно и сырой журнал. Этот source НЕ является normalized G входом APc755; live reader ещё не подключён.

При наличии descriptor.request_id пишется <engineHOME>/.usage-meter/gateway-v1.jsonl: Claude engineHOME=HOME, Codex=CODEX_HOME. Режим файла 0600, private parent 0700, свой UID, без symlink/hardlink. В source входят processGeneration (Node), generation (HTTP observer), seq, requestId, DSH tuple, recipient, uid, engine и observedAt. processEpoch — запуск движка, НЕ authEpoch. observedAt — время наблюдения, не timestamp модели.

Факты: engine_ready/engine_terminal, assistant_usage, protocol_usage(last/total), thread(parent/path), turn_started/turn_terminal, child_edge, auth, engine_process_start/closed, watermark/source_gap. Ready/accepted/transport closed не подменяют terminal. Пути и IDs остаются private; prompt, tool arguments, ticket, credential, его hash, email и account ID в source не попадают. Source не суммирует расходы и не прибавляет task/result aggregates.

Codex пишет дочерние события ДО прежнего root filter. Raw path и parent ID — ссылки для дальнейшей независимой проверки, не готовая атрибуция job. Неизвестная native tool форма даёт CHILD_SOURCE_UNSUPPORTED. Claude Agent/Task даёт CLAUDE_NATIVE_SUBAGENT_UNSUPPORTED: будущий AP обязан оставить subset=null и Claude/project incomplete.

Claude auth фиксируется в callback реального SDK spawn после записи токена в FD3; slot1/2/3 — выбранный TOKEN_FILE. Непустые API/OAuth/custom bearer credentials или альтернативные provider flags дают SUBSCRIPTION_UNBOUND. Это trace переданного handle в принятой конфигурации; биллинг поставщика не измерен. Native Task auth отдельно не утверждается.

Codex по уточнению Забавы 17.10 17:15:51Z всегда пишет в engine_process_start
`authLinkTargetAtStart` (цель readlink или null) и
`authLinkMeaning=route-not-applied-source`. Это маршрут файла на старте, не
подписка и не применённый credential. Поле сохраняется при env override;
неизвестная цель также остаётся маршрутом. Содержимое auth.json не открывается.

Три снимка CODEX_HOME/auth.json сохранены: до spawn, после ready, на terminal.
Каждый — lstat/readlink/lstat; для зарегистрированной цели slot3/4 сравниваются
сам target и dev/inode/ctimeNs ссылки. Не-ссылка, ошибка, ABA или пропущенная
точка дают именованный отказ. Метаданные ссылки не публикуются как authEpoch.
App-server дополнительно наблюдает actual argv непосредственно перед spawn:
разрешён для проверки только app-server --listen stdio://. Exec SDK не отдаёт
этот контракт, поэтому его argv остаётся недоказанным.

Приоритет причины AUTH_SOURCE_UNPROVEN: LINK_POINT_MISSING →
LINK_UNSTABLE_OR_UNAVAILABLE → ENV_OVERRIDE → SPAWN_ARGV_UNPROVEN →
EFFECTIVE_AUTH_CONFIG_UNPROVEN. Для каждого из этих исходов subscription и
 authEpoch равны null. Проверка env — по наличию (включая пустое значение):
CODEX_API_KEY, CODEX_ACCESS_TOKEN, OPENAI_API_KEY, OPENAI_ACCESS_TOKEN,
OPENAI_FEDERATION_RULE_ID, OPENAI_IDENTITY_TOKEN_FILE,
OPENAI_WORKLOAD_IDENTITY_CONTEXT. Это консервативный запрет атрибуции;
он не утверждает, что все эти переменные имеют одинаковый upstream-приоритет.

Положительный Codex slot в этом кандидате НЕ реализован: final AuthManager
Codex0.162.1 получает cloud-aware config. Cloud REQUIREMENTS фильтруют store;
cloud CONFIG может заменить default, но явный user file перекрывает этот слой.
Local requirements store и required provider остаются отдельными входами.
Даже явный file и чистые env/argv не удостоверяют effective provider. В этом
историческом route-only такте новых чтений конфигов/учёток и auth RPC не было;
app-server account/read доказательство0.1.10 описано в начале документа. Подробный source-разбор
и точный остаток — OPEN-CODEX-AUTH.md. Проба clean/file/stable → slot3 остаётся
открытой; возврат после порчи восстанавливает маршрут, а не полноту квитанции.
Отказ относится только к учёту; выполнение модели не отменяется.

Очередь ограничена на Node-процесс: 1023 обычных события и один process gap, всего1024; запись≤64KiB, порог перед append128MiB, retry0. Проверка размера и append не атомарны между разными observer: параллельные writers могут пересечь порог; это не жёсткий файловый quota. Следующая проверка сверх порога даёт SOURCE_GAP/request и прекращает normal/watermarks этого observer; новый request снова проверяет тот же файл. Marker source_gap может уже не поместиться, причина остаётся в журнале службы. Ротации нет. Process overflow прекращает все normal/watermarks до перезапуска; scope=process относится ко всему processGeneration. Ошибка отдельного sink/request имеет scope=request. Неисправный sink может не записать gap — reader обязан проверять epoch/seq/freshness/native полноту. Автоматических reset/rotate нет. Append/fsync асинхронны, модель их не ждёт; новые ACK/admission/cancel/restart не добавлены.

Копийные проверки: stend-usage-auth-preconditions проверяет различение route/auth; stend-usage-codex-symlink —22 случая (14 основных и8 настоящих caller-прогонов с подставными SDK/RPC), теперь без положительной подписки; producer10 случаев; auth-source — нет лишних RPC/ложной подписки; generator — настоящий генератор/fake RPC; process-budget — два наблюдателя по600 событий; HTTP — настоящий gateway handler с fake SDK и FD3, без модели/поставщика. Вызов — npm run test:usage, включён в npm test. Полный штатный gate автором не объявлен пройденным; точный собственный regression-list в handoff/REPORT.md.

## Процесс движка ↔ native tuple (дополнение к 3.1.6)

ЗовущийCodex: `sozdatKlienta` вызывает `onSpawn(child)` немедленно после настоящего `spawnImpl`; `progonAppServer` передаёт его в `usageObserver.engineProcess(child)`. Claude тоже отдельный процесс: SDK вызывает предоставленный `spawnClaudeCodeProcess`, он делегирует `spawnDvizhkaSTokenom`, возвращающий настоящий `ChildProcess`. После фиксации processEpoch/FD3handle тот же callback передаёт child обсерверу. При отсутствии usageObserver новых чтений/proc нет.

В прежний private gateway-v1.jsonl добавлена schemaVersion1 запись:

```json
{"kind":"engine_process_binding","enginePid":12345,"engineStart":"9007199254740993","boot_id":"00000000-0000-0000-0000-000000000001","request_id":"request-id","sessionId":"native-session","sessionCreated":42,"turn":7}
```

Это пример формы, не живая привязка. Дополнительно сохраняются прежние requestId (=request_id), dshTurn (=turn), uid/recipient/engine/requestGeneration, generation/processGeneration/processEpoch, seq/observedAt. `enginePid` — положительный safe integer; `engineStart` — каноническая десятичная СТРОКА тиков из/proc/PID/stat поля22, не Date/UTC и не округлённый JSnumber. `boot_id` — точная строка ядра/proc/sys/kernel/random/boot_id. Разбор comm учитывает пробелы/скобки/переводы строки; cmdline/environ/FDcredentials не читаются.

Перед записью readEngineIdentity дважды снимает stat/boot; проверяет PID в самой строке и directparent=PID шлюза, активность ChildProcess и известное живое состояние kernel (R/S/D/T/t/W/K/P/I); Z/X/x или неизвестное состояние отказные (JS exitCode может отставать). Только полное равенство(pid,starttime,boot_id) обоих снимков допускает запись. Ошибка/расход → G_PROCESS_UNPROVEN/source_gap, без положительного binding/last-known; обычное исполнение не отменяется. У Nodeошибки observercallback изолированы; retry0, новых ожиданий/ACK/watchers нет. Запись append/fsync через прежнюю неблокирующую очередь, не отдельный synchronous pre-start admission.

Потребитель, назначенный Бете: приёмник очереди снимает peerPID→предки/proc в момент приёма; root соединяет с этой записью по ВСЕЙ тройке и только затем проверяет native tuple/run/job по независимому источнику. Один PID недостаточен. Если запись ещё не fsync либо процесс исчез/поменялся, источник не доказан: не подставлять текущий PID/последний request. Это событие НЕ регистрирует run и не является capability; rootreceiver/peer-chain в этом пакете не реализованы. Политику ограниченного повторного чтения очереди назначает её рука, модель не ждёт метрику.

Границы: gateway и rootconsumer должны видеть одну PIDnamespace и kernelboot; перенос номеров между namespace не поддержан. Это точечный снимок в моментspawn, не обещание дальнейшей живости. Child может завершиться после снимка — root проверяет chain, снятую при приёме, а не переиспользует PID. Прямая порча журнала тем же UID этой метадатой не исключена; root всё равно обязан выполнить независимые проверки происхождения/tuple.

Codex SDK exec-ветка0.162.1 не отдаёт ChildProcess PID через используемый публичный API; её process binding этой дельтой НЕ заявлен, PID не угадывается черезpgrep/последнего ребёнка. Сохраняются прежние readlink3точки для её auth-профиля, без новых vendor/auth-правок. Для регистрации по этому протоколу требуетсяapp-server или новый отдельный принятый источник execPID.

Новыйkind должен быть известен AP-нормализатору (старый32ef честно отказывает SOURCE_SCHEMA_UNSUPPORTED). В передаче приложена отдельная APcompat-дельта: строго проверяет форму и совпадение request_id/turn aliases, оставляет metadata private, не превращает её в job-label. Числа/прежниеproof/R-normalizer не меняются.

Пробы `test/stend-usage-process-binding.mjs` (включён вnpmtest:usage): свои Nodechildren + отдельныйPythonразбор/proc, syntheticPIDreuse(starttime), изменение между чтениями→gap→новыйobserverнаТОМЖЕживомchild, kernelzombie с exitCode=null→gap→новыйживойchild, настоящийCodexspawn/generator с fakeRPC и настоящаяClaudecallback с подставнымchild/FD3. Ни реальный движок/SDKпровайдер, ни служба не запускаются. Полный rootreceiptрегистратор Беты этими пробами не проверен. Монтаж/Nodeрестарт — отдельное окно с прежними условиями WINDOW-USAGE-DRAFT.

## sourceProcess для регистрации

Сырый engine_process_binding теперь содержит alias sourceProcess ровно
{pid: int, boot: UUID boot_id, start: десятичная строка ticks из stat22}.
Все три значения получены одним readEngineIdentity; старые поля сохраняются.
Codex PID — прямой дочерний app-server, созданный sozdatKlienta/spawn, не
дочерний shell/инструмент движка. У Claude это отдельный SDK child, полученный
spawnClaudeCodeProcess. Root-приёмник должен найти его в цепочке предков peer
и сравнить ВСЮ тройку; имя процесса или один PID не являются привязкой.
SDK exec PID через используемый API не отдаёт: контекст для него не заявлен.

Consumer-compatible G request строит AP gateway_receipt_source.process_requests
из стабильного защищённого raw prefix: без run/R/job/raw-engine/auth-proof.
Эта G-проекция выдаёт только request/watermark с ISO-временем; смешанный raw
журнал сам по себе normalized-v1 входом не является. SourceProcess и native
ключи сохраняются также в обычном normalized G request. Проекция принадлежит
поставщику G, а зовущий раннего чтения/проверка peer chain — регистратор Беты.

Append/fsync остаются асинхронными и ограниченными прежней process queue;
до initialize/auth нет нового barrier или retry. У Claude FD3/auth наблюдаются
раньше binding. Пока запись не появилась, читатель обязан отказать UNAVAILABLE,
а не выбирать последний request. Доступность после записи не доказывает
текущую живость, принадлежность job или подписку. Время process request —
наблюдение подтверждённого binding; это не timestamp начала модельного turn.
Auth-route отдельный, positive Codex slot остаётся OPEN по прежнему кандидату.

## Финальный Claude usage и обрыв (кандидат 3.1.9)

Новые stream_event от includePartialMessages обрабатываются только числовой проекцией G. Текст/content-block partial frames не отправляются клиенту повторно и не вызывают bridge tools. Обычные assistant frames сохраняют прежний HTTP/context путь; G ждёт message_stop и финальные usage delta. В памяти не более одного сообщения; новый start до stop, неверная session либо stop без финального delta ведут в request-scoped source_gap. close при незавершённом сообщении пишет CLAUDE_STREAM_INTERRUPTED, без глобального process freeze; общий queue overflow сохраняет прежний глобальный отказ.

Следующий request требует scope-aware reader/registration из dsh-autopilot 0.1.12. Старые reader могут трактовать любой source_gap глобально. Исторический промежуточный G нельзя восстановить из native, выдавая это за два независимых источника.


## Child capture · кандидат 3.1.9

субагенты глубже первого уровня и завершившиеся после закрытия наблюдения — не считаются: строка участника помечается неполной

Loaded version witness: Codex — initialize.userAgent запущенного app-server; Claude — system/init CLI и кэш первой загрузки SDK. Общий source_version/sv1; ID-only lifecycle, без текстов/paths/SDK total_tokens. Поддержанные пары закреплены child-source-versions.json; неизвестные дают CHILD_INCOMPLETE.

Кандидат вводит новые G kinds. Порядок окна: сначала AP-читатель с поддержкой общего wire ab58161a и manifest, затем этот шлюз. Выпуск шлюза не раньше AP. Живые подписочные канарейки остаются условием окна выпуска; здесь только копийные пробы.

Приватность новых kinds: source_version/child_started/child_terminal/end/gap не содержат transcript/output paths, текстов и SDK total_tokens. Прежний Codex kind thread.rawPath остаётся исходным private-полем: его читает AP raw_supplier для поиска native-файла. Это исключение старого wire, а не новый путь в ID-only lifecycle; отсутствие путей во всём G этим кандидатом не заявляется.
