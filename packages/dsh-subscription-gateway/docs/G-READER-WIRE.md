# G writer 3.1.8: sourceCreatedAt and active-replacement wire

Гамма, sadik. Контракт writer-дельты по наряду18.10.2026 01:17:51 UTC
поверх71b459dc19d14f2db47a4cbf787d00427cb2380b. Новый обязательный sourceCreatedAt;
manifest/seal и read-only diagnostic API прежние. Дополнение01:23Z: process gap
при live-подмене active; восстановление G из копий запрещено. Полный AP reader — отдельная
рука Беты. Это новый wire, прежний П7/архив71b не переписаны.

## 1. Адреса, типы и полная форма

`D=<engineHOME>/.usage-meter`; CODEX_HOME для Codex, HOME для Claude.
D и D/segments:0700; active D/gateway-v1.jsonl:0600; manifest0600;
source anchor D/gateway-v1.jsonl.source.json:0400; raw/seal closed0400.
Regular, gateway UID, nlink1, no symlink. API активного файла задаёт namespace;
приведённые имена относятся к штатному gateway-v1.jsonl.

Source anchor (schemaVersion относится к transport, не к policy JSON):

```json
{
  "schemaVersion": 1,
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "sourceEpoch": "22222222-2222-4222-8222-222222222222",
  "sourceCreatedAt": 1800000000000
}
```

Manifest `D/segments/manifest.json` — все поля:

```json
{
  "schemaVersion": 1,
  "sourceId": "11111111-1111-4111-8111-111111111111",
  "sourceEpoch": "22222222-2222-4222-8222-222222222222",
  "active": {
    "segmentNo": 1,
    "openedAt": 1800003600000,
    "origins": {"generation-A": 0}
  },
  "segments": [
    {
      "schemaVersion": 1,
      "sourceId": "11111111-1111-4111-8111-111111111111",
      "sourceEpoch": "22222222-2222-4222-8222-222222222222",
      "segmentNo": 0,
      "file": "22222222-2222-4222-8222-222222222222-0.jsonl",
      "closedAt": 1800003600000,
      "byteLength": 512,
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "generations": [
        {
          "generation": "generation-A",
          "firstSeq": 1,
          "finalSeq": 2,
          "finalObservedAt": 1800000015000,
          "maxObservedAt": 1800000015000,
          "firstSegmentNo": 0
        }
      ]
    }
  ],
  "deletedMaxObservedAt": null,
  "retainedFrom": 0
}
```

Seal `D/segments/<sourceEpoch>-<segmentNo>.seal.json` — **ровно объект
manifest.segments[i]**, целиком, включая schemaVersion/sourceId/sourceEpoch,
segmentNo/file/closedAt/byteLength/sha256/generations. Рядом raw с именем
из `file`. Не обёртка `{seal:...}` и не только массив generations.
После JSON parse содержимое sidecar и копия в manifest должны совпасть.
SHA256 считается по точным raw bytes, включая завершающие LF, hex lowercase64.
Иллюстративные byteLength/SHA в примере не надо использовать как fixture.

Все seq/segmentNo/размеры/времена/границы — JSON safe integers (не bool/float),
время UTC epoch milliseconds. segmentNo/времена>=0; seq>=1; byteLength>0.
Generation — непустая строка<=256 (обычно UUID GatewayUsage). FinalSeq и
finalObservedAt — последние в ЭТОМ сегменте, не конец хода. maxObservedAt —
максимум всех его строк данной generation, отдельно от last для ловли rewind.
firstSegmentNo — исходный сегмент начала поколения, может быть меньше retainedFrom
после GC. Первая строка выбранного полного поколения всё равно должна иметь seq1.

## 2. Head и generation→segments: точные имена

Поля `head`, `activeNo`, `epoch`, `revision` и отдельной таблицы
`generationToSegments` в71b НЕТ. Не выдумывать aliases:

- Нынешний номер active — `manifest.active.segmentNo`.
- Epoch источника — `manifest.sourceEpoch`, не raw processEpoch/generation.
- Последний удерживаемый закрытый — последний элемент segments, если есть.
- `retainedFrom` — первый удерживаемый segmentNo; при пустом segments равен
  active.segmentNo. segments упорядочены и непрерывны от retainedFrom до active−1.
- Для generation g выбрать все `segments[i]`, чьи `generations` содержат g.
  Это её closed segment list. В `active.origins` ключ g означает, что поколение
  уже появилось в active; значение — первый исторический segmentNo этого g.
  Active rows/maxObservedAt/последний seq читатель получает полным чтением active;
  в manifest их нет. Неполная запись/новая manifest revision во время read не
  дают право принять смешанный snapshot: guards обеспечит AP reader.

SourceId/sourceEpoch/sourceCreatedAt переживают обычные rotation/restart/GC. Raw processGeneration меняется
при новом Node-процессе; raw generation — отдельный GatewayUsage, seq с1;
raw processEpoch — отдельный запуск движка. В manifest не хранится seq всего файла.
UUID остаётся журналу и согласованию manifest/seal/source metadata. Ручной UUID
в профиле не нужен. sourceCreatedAt берётся ТОЛЬКО из source metadata, не из
active.openedAt (тот меняется при ротации), mtime/ctime и не из текущего clock
читателя. Это JSON safe integer>=0, UTC epoch milliseconds; отсутствие, bool,
строка, float, null — G_SEGMENT_INVALID, не0/не«самое старое возможное время».
При первом создании source metadata writer записывает Date.now(); если весь
D исчез, следующее создание даёт новую дату. При частичной утрате manifest/
segments/active прежние guards отказывают, дату не обновляют. Старый private
source metadata71b без поля рождения не backfill-ится догадкой; первичная
инициализация нового/legacy3.1.7 segmented source начинает покрытие с Date.now().

До P1 читатель считает windowStart=max(0,acceptedAtMs−600000). Если
windowStart<sourceCreatedAt, возвращает RETENTION_GAP: история до рождения
неизвестна. Равенство допустимо. Сохранённый acceptedAt не двигается от ожидания:
после10минут новому источнику подходят новые заявки; ранняя заявка с прежним
cutoff автоматически годной не становится. RETENTION_GAP — конечный отказ,
не продление180с retry-window. Сам writer эту P1-проверку/регистрацию не делает.


`deletedMaxObservedAt`: null только до первого GC, далее монотонный максимум
observedAt ВСЕХ удалённых строк по печатям. Он публикуется до удаления bytes.
При cutoff<=этому значению историческое покрытие недоказано → RETENTION_GAP.
Отсутствующее/неверное поле не трактовать как null. Это один coverage scalar,
не список старых binding и не permanent ambiguity-index.

## 3. inspectGatewaySegments: фактический контракт

Экспортирован из `usage-producer.mjs` и `usage-segments.mjs`:

```js
inspectGatewaySegments(file, { verifyCoverage = true } = {})
// synchronous, read-only; returns:
{ manifest: /* полный объект выше */, rows: /* Array raw-v1 objects */ }
```

Назначение — **диагностика all-retained-history/приёмочные пробы писателя**.
Это НЕ готовый AP API регистрации/учёта и НЕ snapshot+budget API для reader Беты.
Открывает source/manifest, проверяет каждый перечисленный closed raw/seal,
length/SHA/summary, разбирает все retained raw в порядке сегментов и весь active.
Возвращает original raw rows, не consumer-compatible request/watermark;
не делает join binding, semantic validation groups6c, SDK/native/peer доказательство.
Проверяет тип sourceCreatedAt, но не сравнивает его с cutoff.
Ни event, ни seq, ни manifest не меняет; не создаёт writer/lock/таймер/файл.

**cutoff/P1:** аргумента cutoff/accept нет, P1 не применяется, все retained rows.
**coverage:** при verifyCoverage=true проверяется только наличие firstSegmentNo
из closed summaries и active.origins среди доступных сегментов. Это проверка
физического происхождения ВСЕХ удерживаемых поколений, не policy окна. Сравнения windowStart<sourceCreatedAt и
cutoff<=deletedMaxObservedAt API НЕ вычисляет. false отключает только проверку
origins; SHA/seal и перечисленные raw всё равно читаются/проверяются.
**счётчик bytes:** отсутствует; ни readBytes/sourceBytes/debits, ни deadline.
byteLength в seal — длина того raw, не счётчик всего I/O, включая metadata/hash.
**snapshot stability:** closed читаются со stat/SHA проверкой; полного атомарного
manifest+active snapshot/retry/owner budget API здесь нет. AP reader реализует
свои FD/identity/size/mtime/ctime/manifest guards и debit каждого чтения сам.
Нельзя импортировать helper как замену этого зовущего и объявлять регистрацию готовой.

Ошибки JS helper — исключения, не `{error:...}`/не public receipt:

- Error.message G_SEGMENT_MISSING, обычно Error.segmentNo — missing closed
  raw/seal или origin. Это вход для RETENTION_GAP на стороне выбранного AP-окна.
- G_SEGMENT_CORRUPT — bytes/length/hash; G_SEGMENT_INVALID — metadata/summary;
  G_SOURCE_UNSAFE — UID/type/mode/link. segmentNo прикладывается там, где известен.
- Native FS ошибки (например ENOENT для самого manifest/active/source anchor)
  также могут пройти наружу. Их owner/root mapping — обязанность reader,
  не обещанный helper-ом typed error wire. Partial raw JSON/LF — INVALID.

## 4. Вход Беты и что видит groups

AP reader использует этот файловый контракт, а не all-history helper как oracle P1.
Полный active + проверенные descriptors → выбрать целые поколения P1 по любой
строке observedAt>=max(0,accept−600с). Для каждого выбранного g получить все его
сегменты от seq1; проверить seals/SHA/raw и сохранить физический порядок.
Missing необходимого сегмента/печати/origin либо недоказанное coverage scalar —
RETENTION_GAP ДО groups(), конечный UNBOUND/private reason без retry prefix.
Wholly-old g вне P1 не обязан валить свежую проекцию из-за утраченного своего начала;
именно поэтому helper verifyCoverage=true НЕ эквивалентен выборке AP.

`groups()` получает только исходные raw-v1 строки выбранных ПОЛНЫХ поколений.
Никакого rawkind retention_gap, synthetic seq1/перенумерации. Source_gap/seqhole
выбранного поколения → SOURCE_GAP из groups, недоступна вся переданная проекция.
При ENOSPC marker может не записаться, журнал не raw. P1/typed refusal/byte-time
budget и сравнение с sourceCreatedAt выполняет читатель Беты отдельным нарядом.

Код и сценарии зафиксированы; reader Беты и его текущий код этим текстом не
принимаются. Сверка этой схемы: exact71b source + настоящие owner-файлы во временном
HOME, без модели. Живой G/боевые источники не читались.

## 5. Формула ночного числа файлов для Альфы

Для часового режима Nclosed=ceil(rawRetentionSeconds/segmentMaxAgeSeconds).
При7сутках/1час это168. Постоянные regular files Fstable=2*Nclosed+4=340:
raw/seal пары плюс active, manifest, writer.lock и source metadata.
Это baseline числа файлов, не порог WARN. Burst/размерная ротация, карантин и
transient-файлы увеличивают число. Возраст/объём/missing/orphans считать отдельно.
Значения R/T брать из usage-limits.json той же поставки, не дублировать168 как
независимую константу. Пороги наблюдения — в настройке стенда обхода, не здесь.
Policy schemaVersion=3 содержит только schemaVersion и пять исполняемых полей:
legacyFileMaxBytes, segmentMaxBytes, segmentMaxAgeSeconds, rawRetentionSeconds,
maxRecordBytes. Прежняя strict-схема2 требовала оба warning-поля, поэтому удаление
не совместимо с ней. Схемы source/manifest/seal по-прежнему schemaVersion1.
Observation thresholds belong to the nightly scan configuration, not the writer policy.

При сценарных3,2–9,2млнБ/сутки среднее133333–383333Б/час меньше8МиБ.
При равномерной нагрузке закрывает час; это арифметика прежней оценки, не
свежий24-часовой замер и не доказательство отсутствия burst.

## 6. Подмена active: canonical gap и quarantine

G(.usage-meter) никогда не восстанавливается из копий. При остановленном gateway
согласованная подмена истории внутри окна регистрации неразличима и запрещена.
Эти ограничения применяются и к sourceCreatedAt; UUID в профиле не возвращён.

При live-подмене dev/inode/size writer сохраняет suspect bytes в
`D/segments/<sourceEpoch>-<segmentNo>.replaced`, mode0400. Этот файл НЕ raw
сегмент, НЕ печать и НЕ выбирается для P1. Manifest не ссылается на его bytes.
На месте потерянного canonical active появляется обычный запечатанный сегмент
того же segmentNo с raw-v1 source_gap. Базовые identity/generation/seq поля
берутся из события, встретившего подмену; observedAt — момент её обнаружения:

```json
{"schemaVersion":1,"processGeneration":"process-uuid","generation":"generation-A","seq":42,"requestId":"request-id","requestGeneration":"request-generation","uid":1003,"recipient":"fixture","engine":"claude","sessionId":"session-id","sessionCreated":1,"dshTurn":1,"processEpoch":"engine-epoch","observedAt":1800003600000,"kind":"source_gap","reason":"G_ACTIVE_REPLACED","scope":"process","replacedFile":"22222222-2222-4222-8222-222222222222-1.replaced"}
```

Context keys присутствуют только если были в trigger row; типы соответствуют
raw-v1, значения примера не fixture. Это обычный canonical gap, не новое raw kind.
Seq не перенумеровывается: потерянные более ранние строки не восстанавливаются.
Перед groups() reader проверяет P1/полноту выбранного поколения. Если повреждение
лишило поколение начала, оно уже incomplete; при наличии выбранного marker или
seqhole groups() даёт SOURCE_GAP. process_requests6c оборачивает Incomplete в
REGISTRATION_CONTEXT_UNAVAILABLE; не ожидать от него публичного SOURCE_GAP.
Дополнительный .replaced нельзя разбирать или добавлять к sourceBytes как raw
историю. Проверка самого marker raw/seal — обычная SHA/summary проверка.

После marker writer открывает следующий пустой active с новым segmentNo,
сохраняет source anchor и process-scope latch до restart. Очередь не пишет новые
здоровые события этого процесса. После restart новый период может пройти P1,
но прежний gap не исчезает. Нет автоматического healing старой квитанции.

Внутренний intent op=active_gap доводит freeze quarantine, запись marker,
обычный seal и открытие следующего active. AP reader должен отказаться от
смешанного snapshot при активном intent, как и для seal/GC, а не принимать
промежуточную пустоту. .replaced удаляется writer вместе с gap-сегментом по
closedAt через7суток; при missing canonical raw/seal действует прежний
G_SEGMENT_MISSING -> reader RETENTION_GAP. Quarantine не исправляет missing raw.
inspectGatewaySegments по-прежнему только читает canonical retained rows;
наличие source_gap не превращается в исключение этим структурным helper.
Семантический отказ SOURCE_GAP происходит в groups(), не в inspect helper.

## 7. Codex auth proof: engine-account-read


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
