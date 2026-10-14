# 0.1.0-alpha.103 · Обезличивание / Anonymization

Публичная схема SQL без исторических комментариев; нейтральные литералы стендов и явные допуски синтетических секретов. Поля базы, настройки и поведение записи не меняются; принятые RU/EN документы и комментарии сведены после проверки исходных токенов.

Public SQL schema without historical comments; neutral test literals and explicit synthetic-secret allowances. Database fields, settings and write behavior are unchanged; accepted RU/EN documentation and comments are integrated after verifying source tokens.

# История изменений · Change history

## 3.1.2 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- `package.json`: `author` — Aleksandr Argelander.
- Код пакета не менялся.

## 3.1.1 — облачный аудит, модуль №3 (A-N-1948): код Зари (a1948-03-yadro), доки Авроры · cloud audit module 3

- №1: исключение слоя на повторе доставки не обрывает проход — исход `moglo-dojti`; проба [M] stend-ocheredi-dostavki (условие Вениамина).
- №2: запись из одних пробелов ядро отвергает (`PAMYAT_NEPOLNAYA_ZAPIS`).
- №8: stend-otnoshenij-schet — код 2 дочернего стенда передаётся слепотой (код 2), а не красным.
- №9: stend-kasanij В3 под root — СЛЕПОТА (код 2) с причиной, а не ложное красное.
- №25: `svodka().poPrirode` складывает одну природу из разных исходов, а не заменяет.
- №23 (Заря, дельта-2 08:31Z, поправка 08:39Z): Новая база памяти создаётся с режимом 0o660 (openSync(…, 'wx', 0o660)), который подчиняется umask и ACL по умолчанию: в каталоге с ACL по умолчанию (живые /opt/<агент>/pamyat) режим 0660 с маской ACL rw-, учётка omega сохраняет rw; в каталоге без ACL при umask 0022 — 0640. В обоих случаях прочим учёткам доступа нет — это и проверяет проба «ПРАВА» (m & 0o007 === 0), больше она ничего о режиме не утверждает. Существующие базы не трогаются.
  A new memory database is created with mode 0o660 (openSync(…, 'wx', 0o660)), which is subject to umask and default ACLs: in a directory with a default ACL (live /opt/<agent>/pamyat) the mode is 0660 with ACL mask rw- and the omega account keeps rw; without an ACL under umask 0022 it is 0640. In both cases other accounts get no access — that is what the PERMISSIONS probe checks (m & 0o007 === 0), and nothing more. Existing databases are not changed.
- Документация (Аврора): README RU/EN, docs — по находкам №5–7, №12, №14, №15, №17–22, №26, №27; №11 — установка членов набора `--install-links`.

## 1.1.110 — 2026-10-08 · Стенды: обёртки судят возврат, README — по схеме / Harnesses judge the return value, README stand follows the schema (A-N-1884, A-N-1871)

`test/stend-povtora-bez-id.mjs` 59f7c2d6 → 395a847a и `test/stend-povtora-ocheredi.mjs` 41cb36c9 → 8fdda293 (A-N-1884, Аврора; ворота Вениамина): обёртка `proba` судит и по возврату тела — любой возврат, кроме `undefined` и `true`, — расхождение, по договору cd5085f0; прибор ворот obyortka-krasneet по пакету — глухих 0. `test/stend-readme.mjs` (A-N-1871): ключи настройки берутся из схемы `Config`, а не из жёсткого списка, где оставался снятый `zhurnalSkolko`. Граница: стенд проверяет, что каждый ключ схемы назван в README, а не верность описания. Число проб не менялось. Код пакета не менялся.

`test/stend-povtora-bez-id.mjs` and `test/stend-povtora-ocheredi.mjs` (A-N-1884): the `proba` wrapper also judges the body's return value — anything but `undefined` or `true` is a divergence, per the cd5085f0 contract; the gate's obyortka-krasneet check over the package — 0 deaf. `test/stend-readme.mjs` (A-N-1871): settings keys come from the `Config` schema rather than a fixed list that still held the removed `zhurnalSkolko`. Limit: the stand checks that every schema key is named in the README, not that its description is accurate. Probe counts are unchanged. Package code is unchanged.

В архив входит LICENSE (MIT, A-N-1865 722421f). · The archive includes LICENSE (MIT, A-N-1865 722421f).

## 1.1.109 — 2026-10-08 · Стенд ключей: обёртка судит возврат / Settings harness: the wrapper judges the return value (A-N-1870 r2)

`test/stend-klyuchej-a1870.mjs` 3510dbf3 → cd5085f0 (Аврора; ворота Вениамина): обёртка `proba` судит и по возврату тела — строка или `false` → расхождение (договор obyortka-krasneet «строка = причина, false = отказ»); прежде судила только по исключению, и подмена тела проверки на возврат оставляла стенд зелёным (ГЛУХИХ 3). Код ядра не меняется.

1.1.108 стоял в бою с 08.10 21:03Z до монтажа 1.1.109, не помечен: ворота — глухой стенд (время монтажа 1.1.109 — в учёте /opt/agent-plugins и реестре, не здесь: CHANGELOG входит в пакет и в бой).

## 1.1.108 — 2026-10-08 · Ключи настройки сведены с кодом / Settings reconciled with code (A-N-1870)

Ключи настройки сведены с кодом. `maskirovatObrazcy` объявлен в Config (boolean, умолчание true; поведение прежнее: false выключает маску, и запись с образцом секрета отвергает фильтр). `zhurnalSkolko` снят из Config: не читался ни в одной редакции. `config.koren` больше не читается: корень долговременной доставки — всегда `agent`; прежде override шёл в запись и поиск по телу, а проверка видимости смотрела в `agent`. Ни в одном профиле `koren` в блоке ядра задан не был. Новый стенд `test/stend-klyuchej-a1870.mjs`: 3 пробы, на прежней редакции 3 расхождения.

Settings reconciled with code. `maskirovatObrazcy` is declared in Config (boolean, default true; behavior unchanged). `zhurnalSkolko` is removed from Config: no revision ever read it. `config.koren` is no longer read: the long-term delivery root is always `agent`; the override used to reach writes and body search while the visibility check used `agent`. New stand `test/stend-klyuchej-a1870.mjs`: 3 probes, 3 mismatches on the previous revision.

## 1.1.107 — 2026-10-07 · Разбор «без id» по телу с порогом длины / Id-less entries resolved by body, with a length threshold

Выпуск рабочих сборок 1.1.106-a1718 и 1.1.106-a1718r2 (A-N-1718 а2), код без изменений против них; требует слой dsh-pamyat-omega 1.1.37 (`poTelu`), со слоем без `poTelu` поведение прежнее. Release of working builds 1.1.106-a1718 and -a1718r2, code unchanged; needs dsh-pamyat-omega 1.1.37.

### рабочая 1.1.106-a1718r2 · Порог длины тела для сверки по телу / Body-length threshold

Условие Вениамина к A-N-1718 (а2), 11:24Z: тело короче 80 знаков после trim по телу не сверяется — `poTelu` не зовётся, запись ждёт руки, строка итога называет «тело коротко для сверки по телу N». Без порога короткое тело, целиком входящее в ЧУЖУЮ запись корня при недошедшей нашей, давало ложное «1»: очередь снималась и связывалась с чужим id, знание терялось молча. Тела очереди sadik 07.10 — 570–2231 знаков, порог их не отключает. Стенд `stend-povtora-bez-id.mjs`: случай Б5 (короткое тело внутри чужой записи) — красный на 1.1.106-a1718, зелёный здесь.

Veniamin's condition: bodies shorter than 80 characters after trim are not body-searched and wait for a human; a short body contained in another root record would otherwise yield a false single match.

### рабочая 1.1.106-a1718 · Разбор «без id» по телу / Id-less entries resolved by body

A-N-1718 (а2, Искра; решение Забавы 11:06Z). `moglo-dojti-bez-id` больше не висят вечно: проход спрашивает слой `poTelu` (dsh-pamyat-omega 1.1.36-a1718) — сколько записей корня содержат тело целиком. Ровно одна — запись снимается из очереди как подтверждённая (журнал `dostavleno · podtverzhdeno-po-telu`, связь как у подтверждения чтением); ноль — ждёт руки, повтора записью нет (знание могло лечь с иным телом); больше одной — ждёт руки, журнал `dubl` с id. Очередь из одних «без id» теперь будит проход, если слой умеет `poTelu`. Строка итога называет дубли и несостоявшиеся проверки. Слой без `poTelu` — поведение прежнее. Стенд `test/stend-povtora-bez-id.mjs`.

A-N-1718 (a2): id-less queue entries are resolved by body search through the layer's `poTelu`: exactly one root record containing the whole body removes the entry as confirmed; zero or more than one leave it for a human, never retried by writing.

## 1.1.106 — 2026-10-07 · Зовущий отложенной доставки / Caller for deferred delivery

A-N-1718 (Искра; находка B-N-1704). До этой версии `dostavitOtlozhennoe` не звал никто: очередь sadik стояла с 09.09 (35 записей у четырёх агентов, попыток 0). Теперь проход зовётся после ПОДТВЕРЖДЁННОЙ доставки новой записи — она доказывает, что слой жив; не чаще раза в час на процесс, без наложения, вызывающий запись не ждёт; итог — строка `повтор доставки (A-N-1718)`. Очередь из одних `moglo-dojti-bez-id` и исчерпанных прохода не будит. Второе: `ne-najdeno` с опознавателем перед повтором записью сперва проверяется чтением (`proverit`), как `moglo-dojti-id-est`: замер 07.10 нашёл все 25 таких записей sadik в OMEGA байт в байт (23 — под тем же id) — ложное «не найдено» прежней сверки Source. Стенд `test/stend-povtora-ocheredi.mjs`.

A-N-1718. Before this version nothing called `dostavitOtlozhennoe`: the sadik queue had stood since 09.09 (35 records across four agents, 0 attempts). The pass now runs after a CONFIRMED delivery of a new record, which proves the layer is alive; at most hourly per process, never overlapping, never awaited by the writer; it reports a `повтор доставки (A-N-1718)` line. A queue holding only `moglo-dojti-bez-id` or exhausted entries does not wake it. Also, `ne-najdeno` with an id is read-checked (`proverit`) before any write retry, as `moglo-dojti-id-est` already was: on 07.10 all 25 such sadik records were byte-identical in OMEGA (23 under the same id), a false miss by the former Source check. Stand `test/stend-povtora-ocheredi.mjs`.

## 1.1.105 — 2026-10-05 · Свидетель причины в стенде видимости OMEGA / Cause witness in the OMEGA visibility harness

Только `test/stend-vidnosti-omega.mjs`, код не менялся (A-N-1623, Аврора). Исправный случай, давший не `true`, имеет две причины: политика ядра не дошла до слоя omega (так ослеп стенд 1.1.103, B-N-1588) или сломана ветка связи `vidnaVOmega`. До В1 стенд зовёт `aktivnye` слоя тем же текстом и подставным ответом: слой отдал запись — стенд зрячий, не-`true` есть РАСХОЖДЕНИЕ (ЯДРО), код 1; не отдал — СЛЕПОТА (СТЕНД/СЛОЙ), код 2. Обе причины и значение свидетеля печатаются; в исправном прогоне — строка свидетеля «да», проб по-прежнему 13.

Only `test/stend-vidnosti-omega.mjs`, code unchanged (A-N-1623). A non-`true` healthy case has two causes: core policy did not reach the omega layer (1.1.103 blindness, B-N-1588) or the `vidnaVOmega` link branch is broken. Before V1 the harness calls the layer's `aktivnye` directly: the record is returned — harness sighted, non-`true` is a CORE mismatch, code 1; not returned — HARNESS/LAYER blindness, code 2. Both causes and the witness value are printed.

## 1.1.104 — 2026-10-05 · Стенд видимости OMEGA / OMEGA visibility harness

Только `test/stend-vidnosti-omega.mjs`, код не менялся (B-N-1588, Михалыч). Слой с 1.1.32 берёт политику ядра через `ctx.get('pamyat')`; стенд подавал `get: () => undefined`, слой закрывался `PAMYAT_POLITIKA_NEDOSTUPNA`, и исправный случай давал null. Теперь стенд отдаёт слою службу ядра.

Only `test/stend-vidnosti-omega.mjs`, code unchanged (B-N-1588). The layer reads core policy via `ctx.get('pamyat')` since 1.1.32; the harness now provides the core service instead of `undefined`.

## 1.1.103 — перенумерация (A-N-1562): прежний 0.1.0-alpha.103, код не менялся · renumbering, code unchanged

## Документационный кандидат · Documentation candidate

Добавлены единое руководство RU+EN, схемы взаимодействия и состояний, полная таблица настроек, границы защит и диагностика. Комментарии переработаны в парные RU/EN объяснения. Номер версии назначается отдельно при выпуске; исполняемый код этого такта не меняется.

Added a paired RU+EN guide, interaction and state diagrams, a complete settings table, guard boundaries, and troubleshooting. Comments have been revised into paired RU/EN explanations. Version numbering is a separate release step; this task does not change executable behavior.

## Сохранённые возможности текущей реализации · Existing implementation capabilities

Локальное хранилище использует встроенный SQLite, миграционные рубежи и один SAVEPOINT для записи знания и локального журнала. Входной фильтр различает очистку, маску, подтверждённый секрет и подозрение; прежние параметры длины оставлены как диагностическая совместимость.

Local storage uses built-in SQLite, migration boundaries, and one SAVEPOINT for knowledge plus local journal writes. The input filter distinguishes cleaning, masking, a recognized secret, and suspicion; legacy length options remain as diagnostic compatibility fields.

Долговременная доставка отделена от локальной записи, поддерживает очередь, неоднозначные исходы и связи локального/external id. Доверие выводится из отношений и событий; модельные оценки привязаны к фактической выдаче приветствия.

Long-term delivery is separate from local writing and supports queues, ambiguous outcomes, and local/external ID links. Trust is derived from relationships and events; model ratings are tied to actual welcome issuance.

Совместимость событий охватывает `events` и `snapshotEvents()`, признаки наследования и сжатия. Исключение сессий задано префиксами через ядро и используется интегрированными потребителями. Диагностика различает горячую загрузку, отсутствие внешнего следа и объявленный старт службы.

Session compatibility covers `events`, `snapshotEvents()`, inheritance, and compaction markers. Session exclusion is defined by prefixes in the core and consumed by integrated callers. Diagnostics distinguish hot apply, missing external traces, and declared service startup.

Подробная внутренняя хронология сохранена в системе контроля версий. Публичный журнал описывает возможности и ограничения без адресов установок, частных имён и внутренних номеров нарядов.

Detailed internal history remains in version control. The public changelog describes capabilities and limits without installation addresses, private names, or internal work-item numbers.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке. · EN: Entries restored from the git diff of the named commits on 2026-10-08; these are not release numbers or production measurements.

- `997958851c9f` (2026-09-03) — Каждая строка ядра в stderr несёт имя и версию, прочитанную из собственного package.json (`[dsh-pamyat-core <версия>]`, при нечитаемом манифесте — «версия неизвестна»), а `apply` всегда печатает строку подъёма с путём базы и перечнем `klassyZnaniy`; прежде исправное ядро молчало и было неотличимо от несмонтированного (src/index.js, `krik`). · EN: Every core stderr line carries the name and the version read from its own package.json, and `apply` always prints a startup line with the database path and the `klassyZnaniy` list; previously a healthy core was silent.
- `c9b9470aa527` (2026-09-03) — Запись класса вне `klassyZnaniy` больше не уходит молча: журнал отмечает исход `ostalos-v-operativnom` с природой `klass-vne-klassyZnaniy` и причиной, так что штатный отбор отличим от непозванного долговременного слоя (src/index.js, `vDolgovremennuyu`). В test/stend-dolgovremennoj.mjs добавлена проба согласованности перечня классов секретаря с `klassyZnaniy`; без соседнего пакета — слепота, а не «сошлось». · EN: A record whose class is outside `klassyZnaniy` is now journaled with the `ostalos-v-operativnom` outcome and a reason, and the long-term delivery stand checks the secretary's class list against `klassyZnaniy`.
- `d16ba554ac73` (2026-09-04) — Умолчание `klassyZnaniy` расширено с пяти классов до восьми: к reshenie, urok, vyvod, nablyudenie, fakt добавлены ogranichenie, oshibka, poryadok, которые производит секретарь и которые прежде оставались только в оперативном слое (src/index.js, Config). Удалена лишняя копия index.js в корне пакета (вне `main` и `files`; исполняемый вход — src/index.js). · EN: The `klassyZnaniy` default grows from five to eight classes (adding ogranichenie, oshibka, poryadok), and a stray root-level index.js outside `main` and `files` is removed.
- `a37bf2cb3022` (2026-09-06) — Добавлен инструмент замера test/korpus-progon.mjs: прогоняет входной фильтр (`najti_sekret`) по корпусу (`--db`, `--otklonennye <каталог>` или stdin) и считает, сколько объявленных значений запирается и сколько из них — чистый lowerCamelCase; при прогоне по базе памяти предупреждает, что этот корпус уже отфильтрован. Это не стенд, поведение пакета не меняется. · EN: Adds the measurement tool test/korpus-progon.mjs, which runs the input filter over a corpus and counts locked declared values and pure lowerCamelCase among them; it is not a stand and does not change package behavior.
- `59940bf0b563` (2026-09-09) — Новый метод службы `poIstochniku(istochnik)`: точный спрос по ссылке на источник без горизонта последних N, как у `prochitat`; отдаёт список всех записей с этой ссылкой по возрастанию `sozdano`, пустой или не строковый источник — отказ `PAMYAT_ISTOCHNIK_PUST` (src/hranilishche.js, src/index.js). По коду на 08.10 метод зовут dsh-pamyat-secretary (проверка «срез уже разобран») и dsh-pamyat-obsluzhivanie (`src/local_lessons.mjs`). · EN: New service method `poIstochniku(istochnik)` returns every record with that source reference, without the latest-N horizon of `prochitat`, and refuses an empty source with `PAMYAT_ISTOCHNIK_PUST`; per the code as of 08.10 it is called by dsh-pamyat-secretary and dsh-pamyat-obsluzhivanie.
- `ded6e4e4693d` (2026-09-09) — `poIstochniku` ограничен агентом: хранилище принимает `{ agent, istochnik }` и отбирает `WHERE agent = ? AND istochnik = ?`, служба подставляет агента из настройки узла и снаружи его не принимает; пустой агент — отказ `PAMYAT_ISTOCHNIK_BEZ_AGENTA`. Без этого записи соседнего агента с тем же источником считались бы своими. · EN: `poIstochniku` is restricted to the configured agent (the caller cannot pass one), and an empty agent is refused with `PAMYAT_ISTOCHNIK_BEZ_AGENTA`, so another agent's records with the same source no longer count as one's own.
- `486ec60bff9c` (2026-09-10) — Стенд test/stend-po-istochniku.mjs: на временной базе проверяет, что `poIstochniku` отдаёт только записи своего агента, отказывает на пустом источнике и на пустом агенте и отдаёт пустой список для неизвестного источника. · EN: The stand test/stend-po-istochniku.mjs checks on a temporary database that `poIstochniku` returns only the agent's own records, refuses an empty source or agent, and returns an empty list for an unknown source.
- `e15c2a5362a4` (2026-09-14) — Стенд test/stend-svidetelya-zagruzki.mjs: проба 4 задаёт смещение следа числом (180 с), а не выражением от самой константы окна, из-за которого была зелёной при любом окне; добавлена проба 4б (след за 60 с — «подъём ОБЪЯВЛЕН»), так что окно объявления 120 с зажато с двух сторон. · EN: The startup-witness stand now uses a literal 180 s offset in probe 4 instead of one derived from the window constant, and new probe 4b (60 s) bounds the 120 s announcement window from both sides.
- `199afec14698` (2026-09-19) — Добавлен стенд test/stend-schyota-zapisej.mjs (node:test, временная база): счёт `svodka()` — по фактическим строкам против отметок журнала; маска, подозрение и очистка — диагностика, а не лишние успешные записи; отказ подтверждения, неверная уверенность, падение INSERT и сбой журнала не оставляют отметок успеха и откатывают строку знания; двойная отметка даёт тревогу с числами, историческая разница видна, но не тревожит. · EN: Adds the stand test/stend-schyota-zapisej.mjs, which checks that `svodka()` counts actual rows against journal marks, that diagnostics and failed writes leave no success marks, and that duplicate marks raise a numeric alarm.
- `653a46f84d72` (2026-09-25) — 17 стендов test/ (stend-dolgovremennoj, stend-hranilishcha, stend-po-istochniku, stend-svidetelya-zagruzki и др.) убирают свой временный каталог на любом выходе — обычном, падении пробы, `process.exit`, SIGTERM/SIGINT: `mkdtemp` идёт через `vremennyj()` с уборкой в обработчике `exit`. Исполняемый код пакета не менялся. · EN: 17 stands now remove their temporary directories on any exit, including `process.exit` and SIGTERM/SIGINT; package runtime code is unchanged.
- `1603fd0bcc5b` (2026-09-25) — То же правило уборки временного распространено ещё на 4 стенда: stend-instrumenta-otnoshenij, stend-otnoshenij-schet, stend-otnoshenij, stend-schyota-zapisej. Исполняемый код не менялся. · EN: The same temporary-directory cleanup is applied to four more stands; runtime code is unchanged.
