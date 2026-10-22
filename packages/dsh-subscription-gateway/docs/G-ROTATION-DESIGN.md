> Дельта рождения источника к71b459dc: ручной UUID-профиль отменён.
> sourceCreatedAt в source metadata задаёт нижнюю границу окна P1; UUID — для журнала.

> Кодовый такт18.10.2026 00:45:32 UTC: accepted r2 ee889b06, дисковый cache
> снят воротами03:45. Здесь согласованный простой full-read oracle.

# AP 0.1.10 — простая ротация G, r2

Только замысел. Гамма, sadik. Дельта по наряду координатора18.10.2026
00:35:28 UTC к design `951d0783`. Основа сохранена в BASE-951d0783.md.
Кодовые ced3d243 / 7f71ed74 / 359a5066 / AP6c52b063 не менять.

## 1. Модель угроз и выбор

**«G не защищён от намеренной переписи учёткой агента».** Эта строка должна
войти в README будущего пакета. Намеренная перепись/удаление G и его печатей
учёткой агента вне модели угроз: учёт — инструмент владельца, не арбитраж.
User=master для шлюза и тот же UID инструментов — факт по воротам координатора,
в этом такте живой процесс повторно не исследовался. Root-приём не заставит
такого агента давать producer писать и сам не создаёт независимого арбитража.

Случайная порча/подмена/удаление под тем же UID — в модели. Печать writer и
проверка её при чтении дают именованный отказ. 0400 защищает от обычной случайной
записи; SHA обнаруживает изменённые bytes при сохранённой печати. Согласованную
перепись bytes+SHA с сохранением корректной схемы этот механизм не ловит.

| Вариант | Цена | Решение |
|---|---|---|
| Полное чтение и JSON-разбор всех нужных сегментов каждый раз | Простой эталон без cache, повторяет JSON/память | Cold/fallback и oracle |
| Печати writer,0400, SHA и полный разбор нужных сегментов | Без parsed cache; каждый повтор проверяет bytes и JSON | **Выбран воротами03:45** |
| Root-import/canonical archive из951d0783, если учёт станет арбитражем против агента | Root-хранилище/ACK/квоты/caller/recovery; недостаточно само по себе при общем UID producer и инструментов | Архивное направление, раздел9, сейчас не реализовывать |

Удалены из действующего решения root-import/archive, grant/reserve/ACK/reconcile,
fence/pins/RAW_RETIRED, долгоживущий ambiguity-index после GC, PRESSURE/EXHAUSTED
и tick60с. Переполнение не вытесняет историю раньше срока. Новые службы не нужны.

## 2. Файлы, печать и запись

`<engineHOME>/.usage-meter/` —0700, владелец UID шлюза. Active остаётся
`gateway-v1.jsonl`, regular0600/nlink1, без symlink; закрытые:
`segments/<sourceEpoch>-<segmentNo>.jsonl` и соседний `.seal.json`, оба0400/nlink1,
каталог segments0700. Writer хранит небольшой atomic `segments/manifest.json`0600:
sourceId/epoch, head/activeNo, упорядоченные sealed descriptors и generation→segments
метаданные удерживаемой истории. Это owner-файл, не root-реестр/арбитраж.
Generation и processEpoch не равны sourceEpoch; rotation/restart их не подменяют.

Печать пишет САМ писатель при закрытии, до публикации сегмента читателю:
sourceId/epoch, segmentNo, closedAt, byteLength, SHA256 точных raw bytes вместе сLF;
для каждого встреченного поколения — `{generation, firstSeq, finalSeq,
finalObservedAt, maxObservedAt, firstSegmentNo}`. Поколений в одном сегменте может быть несколько,
поэтому это массив, не одна «последняя generation». finalSeq и finalObservedAt
— последние **в этом сегменте**, не обещание завершения хода. maxObservedAt —
максимум ВСЕХ строк этой generation в сегменте: для P1 нельзя считать последнее
время максимумом до проверки rewind. При первом разборе это сверяется с raw;
возврат времени выбранной generation потом отказывает штатным G_TIME_REWOUND. firstSegmentNo
сохраняет происхождение длинного поколения; seq не обнуляется при ротации.
Generation→segments список/диапазоны служат навигации, не вторым raw-parser.

Один writer на sourcePath, одна общая append/seal/delete очередь всех observers,
единственный active FD. Второй писатель отказывает G_WRITER_BUSY без ожидания;
OS-lock процесса, не stale PID-файл. Это заменяет независимые stat→append очереди,
в которых порог мог быть превышен параллельными observers. Очередь остаётся
ограниченной1024, её переполнение — SOURCE_GAP, модель продолжает работу.

Сегмент закрывается ДО записи строки, если с ней его размер превысит8МиБ,
или возраст непустого active достиг3600с. Таймер writer закрывает его также
без нового emit; пустые часы не создают пустые закрытые сегменты. Строка целиком,
включаяLF, не больше65536Б; на границе не делится. Равенство8МиБ допустимо.
Порядок: drain текущих append → полный write/fsync → SHA writer → close → rename
в уникальное имя без overwrite → печать .new/fsync/rename → chmod0400 обоим →
пустой новый active0600 O_CREAT|O_EXCL безO_TRUNC → manifest atomic/fsync.
У writer есть короткий durable rotation-intent с именами/номерами, чтобы restart
завершил этот переход, а не угадал историю по mtime. Это часть того же writer,
не отдельный broker. Некорректный/неоднозначный recovery — именованный отказ G.

Поколение seq1..8 может быть в S10, seq9..14 — в S11. Родившийся заранее observedAt
не сортирует физическую очередь: A8,B3,A9,C1 допустимы. Никаких дополнительных
raw kinds rotation/seal: `groups()` по-прежнему получает только прежний raw-v1.

## 3. Чтение без cache и целые поколения

Зовущие остаются две точки Беты: registrationContext до register и сбор расходов.
Они получают G только через мой decoder/segment adapter, под UID владельца.
Root не открывает чужой HOME. Перенос обоих reader обязателен до включения ротации;
старый consumer, читающий один active-файл, с новым источником несовместим.

P1 закреплён exact commit Беты `4ef014840bae530200120ed86292ddcdcf6471b1`:
поколение берётся целиком, если любая строка имеет observedAt>=max(0,accept−600с).
Иначе поколение исключается целиком. Физическое перемежение поколений не влияет
на выбор. Текущий4ef вызывает process_requests ПОСЛЕ отбора; r2 соответствует ему,
прежнее усиление через вечный до-P1 ambiguity-index отозвано воротами.

Сначала читатель снимает полный manifest и active snapshot. Из печатей всех
удерживаемых сегментов и полного active получает generation descriptors/maxObservedAt.
Для выбранных P1 поколений берёт ВСЕ сегменты от их firstSegmentNo/seq1 до
snapshot. Нельзя ограничиться сегментами с closedAt или finalObservedAt>=cutoff:
ранний start/binding выбранного поколения может лежать намного раньше.
Список всех пересекающихся сегментов поколения обязателен, в том числе shared.

Каждый используемый закрытый файл открывается nofollow, проверяются owner/type/
mode0400/nlink1, length и SHA по печати; stat/path identity до/после стабильны.
Отсутствующий нужный файл/печать — RETENTION_GAP, SHA mismatch — G_SEGMENT_CORRUPT.
Несоответствие manifest↔печать/schema/identity — G_SEGMENT_INVALID. При чтении
метаданных каталога отсутствие перечисленного объекта не превращается в пустой G.
Чтобы случайная порча печати не дала молча исключить поколение, descriptor
сверяется с atomic manifest-копией; расхождение отказывает до P1. Для первого
разбора нового сегмента значения печати независимо выводятся из raw и сравниваются.

По воротам Вениамина03:45 выбран простой эталон БЕЗ дискового/parsed cache.
Каждое чтение нужного закрытого сегмента сверяет печать/SHA и заново разбирает
raw JSON тем же decoder. Нужных после P1 сегментов мало; ускорение возвращается
только после измеренной необходимости после0.1.10. Новый файл состояния parsed-cache не
создаётся. Все bytes/hash/JSON/time списываются caller-ом, O(delta) не обещается.

Открытый читается целиком до зафиксированного EOF; полнаяLF, fstat/named lstat
до/после и manifest revision должны совпасть. Append/rotate/GC во время попытки,
partialLF или shrink дают отказ этой попытки, не скрытый повтор с новым окном.
Один snapshot, без ожидания lock; обычный caller сам решает разрешённый повтор
в пределах180с. Между попытками нет cache положительного ответа без нового snapshot.
При стабильном наборе full+P1 и сегментный путь дают один результат.

A(свежая) + запоздалая старая B + C(свежая, тройка A) в разных сегментах:
обе целые выбранные A/C попадают в process_requests → AMBIGUOUS; B не останавливает
scan. Все строки старой A исключены P1 — её конфликтов после окна/GC не храним.
Это граница упрощённого решения, а не обещание находить конфликты вне P1 вечно.

## 4. Что SOURCE_GAP, что RETENTION_GAP; вход в groups()

| Предмет | Причина/действие |
|---|---|
| Нормальная смена сегмента, seq продолжается | Не gap; raw строки объединяются в исходном порядке |
| Producer потерял event: очередь, short-write/I/O/ENOSPC, строка слишком велика | Писатель сохраняет `kind=source_gap` с прежней scope/reason, если запись возможна; иначе остаётся journal-отказ писателя. Утерянное не превращается в нормальную ротацию |
| В выбранном полном поколении есть raw source_gap | `groups()` :40 отказывает SOURCE_GAP, ВСЯ переданная проекция недоступна, не только одно поколение |
| Все нужные сегменты и печати есть, но seq дырявый | `groups()` :55 даёт SOURCE_GAP; sealSHA не доказывает полноту событий |
| У выбранного поколения отсутствует ранний/средний сегмент, он удалён по7суткам либо случайно | RETENTION_GAP ДО groups(), даже если оставшиеся строки parseable |
| Нужного сегмента нет | RETENTION_GAP, сырьё/покрытие не восстановлены |
| SHA не совпал, печать/manifest некорректны | G_SEGMENT_CORRUPT/INVALID ДО groups(); не маскировать под retention или нули |
| Нормальный GC всего старого поколения вне P1 | В текущую проекцию не попадает, SOURCE_GAP marker не добавляется |

В raw kinds НЕ добавляется `retention_gap`. Segment adapter сначала проверяет
полноту выбранных поколений и только затем передаёт их неизменённые rows в
`groups()`/process_requests. Нельзя подать suffix и надеяться, что SOURCE_GAP
из groups честно назовёт физическую потерю сегмента. Не синтезировать seq1,
не перенумеровывать и не выбрасывать source_gap выбранного поколения.

Точный6c process_requests переводит SOURCE_GAP в REGISTRATION_CONTEXT_UNAVAILABLE;
adapter RETENTION_GAP до него сохраняет типизированную причину owner→root.
Внешний итог регистрации — конечный UNBOUND (retryable=false), с private reason
RETENTION_GAP; числовая квитанция при необходимости incomplete/null по её схеме,
не observed0. Новая private причина и её передача — будущая узкая дельта caller
Беты; public enum без отдельного решения не расширяем. Если marker физически не записался, groups его не видит: журнал службы не
является raw-входом. Прежние проверки watermark/свежести/R/native остаются,
но новый надёжный health-transport эта дельта не вводит и ловлю каждого
последнего потерянного event по одному groups не обещает. Groups/6c в этом такте
не правятся. Request-scope marker в выбранном поколении всё равно валит полный
его input. Process-scope marker без идентифицируемой generation отказывает как
SOURCE_GAP доP1, а не исчезает из-за отсутствия ключа. Whole-old generation с
валидным маркером целиком внеP1 исключается по тому же правилу4ef; это отдельная
граница политики, не лечение исторической потери.

## 5. Хранение ровно по возрасту закрытия

Удаляет САМ writer: после startup/recovery и каждого seal, также на часовом
обслуживании writer. Только закрытые source-owned сегменты/печати, чьи closedAt
<= now−604800с. Возраст берётся из проверенной печати, не mtime. Нет root GC,
pins, fence, продления ради живого run или сохранения конфликтов после удаления.
Active не удаляется. Невалидное/будущее closedAt запрещает удаление этого объекта
и печатается как G_RETENTION_METADATA_INVALID. Имена вне точной manifest-схемы
не удаляются «по маске». Один pass/максимум32сегмента, без рекурсии/повтора до успеха;
не успел — именованный результат, следующий штатный hourly/seal/startup вызов.

Writer под своей общей очередью публикует atomic manifest revision с удалёнными
диапазонами/границей retained history, затем удаляет точные raw+seal .
Crash до unlink оставляет лишние orphan bytes, после — законный missing range;
restart сверяет intent и завершает точный список, не удаляет неизвестные файлы.
Список generation→segments у удерживаемых данных и firstSegmentNo достаточен,
чтобы selected gen с началом до retentionFloor получил RETENTION_GAP. В той же transaction
manifest хранит минимальный retained segmentNo и `deletedMaxObservedAt`: максимум
observedAt ВСЕХ уже удалённых строк; до первого GC — null. Он вычисляется из
проверенных per-generation maxObservedAt печатей и только растёт. Это один
скаляр покрытия, не список поколений/привязок или индекс конфликтов. При
cutoff<=deletedMaxObservedAt читатель консервативно возвращает RETENTION_GAP
ДО P1, даже если видимые остатки вообще не содержат подходящих поколений.
Для свежего окна при обычных временах deletedMaxObservedAt намного старше
cutoff, а выбранная многодневная generation всё равно проверяется по firstSegmentNo.
Повреждение/утрата этого поля — invalid manifest, не null по умолчанию.
GC пишет frontier/max до unlink: crash может консервативно ограничить покрытие
раньше удаления, но не разрешает ложный полный snapshot после него. Случайно пропавший ещё listed segment
даёт тот же RETENTION_GAP; partial manifest/segment loss — источник недоступен. Полная потеря .usage-meter
создаёт sourceCreatedAt нового источника; cutoff раньше даты рождения даёт
RETENTION_GAP, без ручного UUID-профиля. Дата обычным restart не обновляется.

Ход дольше7суток со свежим heartbeat может потерять start/binding по этому GC.
Тогда selected generation не полон → RETENTION_GAP. Поколение короче7суток также
неполно при случайном удалении. Эти границы названы прямо; retention не растёт
по активности. Новая generation/restart не лечат старые затронутые окна.
Исторический запрос за пределами retained coverage даёт RETENTION_GAP, даже
если в оставшихся сегментах вообще нет видимого подходящего поколения.
При свежем accept, возрасте окна600с и180с ожидания7суток хватает для обычного
конечного хода; это не доказательство для бесконечного/многодневного хода.

## 6. Ночная строка и что нужно стенду Альфы

Зовущий — существующий ночной контур Альфы, стенд переводится с одного файла на
source manifest+active+segments. Новый60с timer/машина состояний не добавляются.
Входы: доверенный HOME/sourcePath/transportVersion, UID шлюза, pin живой
поставки и `usage-limits.json` той же поставки. Имя/подключение изменённого стенда
остаётся за Альфой через координатора; этот текст не объявляет его уже вызываемым.

Стенду нужны: схема имён/manifest/seal; guards dir0700, active0600, closed/raw и
seal0400, regular/nlink1/правильныйUID/no symlink; точный closedAt retention604800с;
пределы segmentBytes8388608/age3600с и warning thresholds. Считать весь каталог
(включая metadata/temp) в logical bytes, allocated blocks отдельно; число
closed segments, наличие active, oldest closed age, last writer cleanup result,
manifest/listed missing и orphan count. Parsed cache отсутствует.
Он не становится вторым G raw-parser: семантика kinds/seq остаётся у нормализатора.

Одна ночная строка: sourceId, UTC, dirBytes/allocatedBytes, closedCount/activeBytes,
oldestClosedAge, expected7days, missing/orphans, cleanupStatus, WARN либо OK,
причина. Пороги наблюдения — в настройке стенда обхода, не здесь;
они не являются hard quota/admission/EXHAUSTED. Ночной pass максимум
30с, одна попытка; превышение — SCAN_TIMEOUT, не ложный OK. При возврате объёма
ниже порога следующая строка OK. ENOSPC/ошибка append всё ещё SOURCE_GAP; ночь
не обещает предупредить каждое переполнение. Нет удалений раньше7суток по WARN.

## 7. usage-limits.json, startup и миграция

Данные package policy schemaVersion3: legacyFileMaxBytes134217728,
segmentMaxBytes8388608, segmentMaxAgeSeconds3600, rawRetentionSeconds604800,
maxRecordBytes65536. Удаление обязательных warning-полей несовместимо со strict
схемой2, поэтому версия policy3. Ночные пороги хранит только стенд Альфы.
JS exports и Python читатели берут
значения только из этого JSON, без parsing JS/дублирования чисел в caller.
Strict schema/type/version/unknown-key; bool/float/invalid — отказ. Старое
schemaVersion1/file limit не переименовывается молча в «quota каталога».
Бюджет reader = сумма нужных sealed bytes + весьactive + metadata/запас,
формулу/time grant задаёт caller; прежние128МиБ не вечный лимит всего сегментного G.

prepareGatewayUsage остаётся однократным gate до HTTP-listen: unsafe start
выключает G до restart; битый policy по359a останавливает весь шлюз при импорте.
При первой согласованной инициализации пустой active0600 создаётся в0700 без
O_TRUNC, без event/seq/observer; empty G → REGISTRATION_CONTEXT_UNAVAILABLE.
Здоровый существующий active не изменяется от startup. Новая source metadata содержит sourceCreatedAt=Date.now() при инициализации;
reader до P1 требует cutoff>=sourceCreatedAt. Новый UUID не нужно вносить в профиль.

Legacy gateway-v1.jsonl мигрирует в отдельном окне: drain writer, проверить всё
сырьё, закрыть неизменённые bytes как S0 с печатью; если он больше8МиБ, принять
однократный legacy size grant от прежнего предела с измеренным запасом, не обрезать.
Новый active пуст. Ротация не чинит прежний source_gap; rollback на старый reader
требует всех нужных bytes в правильном порядке, один active не откат истории.
Оба reader/стенд/профиль и package policy меняются согласованно после внешних ворот.

## 8. Пробы будущей реализации

Это план, не выполненные тесты. Во всех порчах: healthy → подтверждённое внесение
(число замен и SHA/независимый fixed-string контроль) → именованный отказ →
возврат исходных bytes/результата. Проверяется код кандидата, не модель механизма.

- Поколение seq1..8/S0 и9..14/S1, старое начало+свежий heartbeat → полный seq,
  REGISTERED при остальных годных предпосылках. Целиком старое → внеP1.
- A + late-old B + C в разных closed/active → AMBIGUOUS; B не останавливает scan.
- Raw source_gap в выбранной gen → SOURCE_GAP из groups и недоступна вся проекция;
  удалён нужный S0 при валидном S1 → RETENTION_GAP ДО groups; возврат → исход.
- SHA bytes при сохранённой печати испорчен → G_SEGMENT_CORRUPT; убрать печать,
  подменить manifest descriptor, seq-дыра при наличии всех segment → разные причины.
- Граница8МиБ/3600с, два observer, короткая запись/ENOSPC/partialLF, crash каждой
  фазы seal/recovery/GC → нет тихой потери/дублирования/успеха по хвосту.
- Age закрытия7суток−1/ровно7суток/+1; mtime не основание GC; live ход>7суток
  теряет начало → RETENTION_GAP. Ошибочное имя/orphan не удаляется общей маской.
- Seal с finalObservedAt старее раннего maxObservedAt → P1 берёт generation
  по максимуму, затем groups ловит rewind; исторический cutoff на/до
  deletedMaxObservedAt → RETENTION_GAP даже при отсутствии видимых поколений.
- На каждом повторе closed SHA проверяется и JSON разбирается заново;
  GC убрал raw → RETENTION_GAP, сохранённой проекции вместо сырья нет.
- Пустой новый G; restart старого active; policy/schema gates; rollback S0.
- Ночная строка below/at/above thresholds, missing/timeout/cleanup failure;
  после возврата WARN→OK; Альфа получает writer policy/guards под gatewayUID,
  а пороги читает только из собственной настройки ночного стенда.

Будущая моя рука — writer/seal/retention/segment decoder; Беты — оба reader,
P1/caller budgets и передача typed RETENTION_GAP; Альфы — ночной стенд сегментов.
Это границы на согласование координатора, не поручение соседям этим документом.

## 9. Третий вариант: если учёт станет арбитражем против агента

Версия951d0783 сохранена целиком как BASE-951d0783.md: общий writer, SHA и
первичный root-import в canonical archive, root receipt/ACK/recovery/quota,
retention pins и долгоживущие validation/conflict summaries. Она не удалена,
но **не часть выбранного r2**, не требование к его реализации и не скрытый backlog.
Для арбитража надо сначала выделить producer/transport из UID агента или иной
независимый источник события: один root-import не защищает от недопоставки.
Затем отдельно определить доверенную границу и цену; принимать тот вариант
по нынешнему r2 нельзя. До такого нового решения действует явная README-граница
из раздела1 и owner-печати против случайной порчи.

## 10. Границы проверки и сдачи

Покрытие текста: threat model, seal/0400, поколение через segments, P1/полный разбор,
retention7суток, SOURCE_GAP/RETENTION_GAP, ночной стенд, policy/startup/migration.
Посылки: точный6c groups и4ef P1 проверены по исходникам; shared UID master и
новая threat model — решение/замер координатора. Числа8МиБ/час/7суток приняты
по наряду; прежние предложения ночных порогов отозваны решением18.10 01:50Z. Runtime, UID/process-live, performance,
crash/GC/integration не проверялись: реализации ротации в этом такте нет.
Сдача — текстовая дельта к951d0783, старый комплект не переписывается.

## Дополнение ворот 18.10 01:23Z: восстановление G запрещено

Каталог .usage-meter никогда не восстанавливается из копий; потеря означает
потерю учёта. Согласованная подмена при остановленном gateway неразличима.
Живой writer сравнивает active dev/inode/size, при подмене сохраняет .replaced
0400 вне canonical истории, пишет process-scope source_gap G_ACTIVE_REPLACED,
закрывает gap-сегмент и открывает новый. Процессный latch сохраняется до restart.
Карантин удаляется с gap-сегментом через7суток closedAt. Подробный reader wire —
[G-READER-WIRE.md](G-READER-WIRE.md#6-подмена-active-canonical-gap-и-quarantine).
