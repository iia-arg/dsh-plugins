Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-obhod-stendov — ночной и недельный обход боевых стендов sadik

**Версия:** 3.1.120

Каждый root-стенд — строкой в `OBLAST_STENDOV`; комментарий в стенде прав не повышает.

Служебный софт sadik: обход стендов по таймеру (ночной 03:40 UTC и недельный ср 16:00 UTC), обходчик
`vse-stendy-boevye.sh` с перечнями стендов, сами стенды и их данные. Исход обхода читает `chitatel-obhoda`
(пакет **dsh-storozha-sadik**).

Пакет **не к публикации без отдельных ворот:** перечни и обходчик несут внутреннее устройство машины (пути, юниты, имена
агентов, исключения стендов, приёмы проверки боевых предметов).

**Временное правило (Вениамин, 07.10.2026):** пока у новых пакетов нет читателя «бой ↔ метка», любой файл пакета
меняется только вместе с новым номером пакета в том же окне.

⚠️ Боевой таймер исполняет код из рабочего каталога агента (`/opt/iskra/workspace/dorabotki`). Перенос в дерево этого
не меняет; вынос в `/usr/local` — отдельное решение.

Пакет — исходники без `package.json`: `dorabotki/` повторяет путь `/opt/iskra/workspace/dorabotki/` (владелец
`iskra:iskra`), юниты и drop-in — в `systemd/` (под `/etc/systemd/system/`). Номер — заголовок CHANGELOG и метка
`dsh-obhod-stendov-v<номер>`. Перенос с боя: сумма каждого файла в дереве равна сумме боя.

Ночной предел B-N-2063 **временный**: `ceil100((mimo_limit+2500)*1.10)` = 4800 с при mimo=1800; юнит — 5100 с.
**Пересчитать после первого полного прогона 16.10 03:40Z, до 16.10.2026 12:00Z.** Это резерв для измерения полного хвоста,
не обещание достаточности при любом росте. Разбор `pravki-mimo`/`sadik-watch` назначен отдельно, после монтажа.

Обёртка `vse-stendy-po-tajmeru.sh` вызывает соседний `obhod-run-state.py` (установка в тот же `dorabotki/`, 644, iskra:iskra).
Обход фиксирует список до запуска, пишет факты начала/завершения и имена scope своего прогона в частном каталоге.
При обрыве итог и тревога называют прерванные и не начатые пути; до фиксации списка объявленный перечень явно помечен
как запасной источник. TERM→KILL применяется только к зарегистрированным именам с уникальным идентификатором прогона;
уборка ограничена 10 с, общий предел отправки тревоги — 22 с (части по 2000 единиц UTF-16, чтобы канал не отрезал имена).
До чтения scope обёртка останавливает свою отдельную группу запускателей (`setsid`), включая задержанный dispatch:
иначе ещё не созданный scope мог бы появиться после уборки. Ночной caller требует рабочий scope0 и отказывает до стендов
при его отказе; standalone-приёмка сохраняет прежний режим С2. Группа запускателей и scope убираются вместе за те же 10 с.
Перед каждым групповым сигналом `/proc` подтверждает одновременно `pgrp=pid` и `session=pid`;
при отсутствии такого процесса — пропуск со строкой. PID чужого лидера также не получает индивидуального сигнала.
Отказ чтения/остановки scope либо отправки части не считается успехом. Прямой SIGKILL обёртки и отключение машины
не позволяют ей выполнить финальный отчёт; за отсутствие запуска отвечает отдельный читатель обхода. Недельный сценарий не меняется.
С 3.1.74 `notify()` для каждой части печатает `канал тревог <путь>: код N` и первые 20 строк
объединённых stdout/stderr с префиксом `  канал: `. Коды исхода и пределы отправки прежние.
Формат проверяют О9/О9б стенда исключений Искры; О6/О8 сохраняют поимённый договор B-N-2063.
Ручная регрессия (не ночной читатель): `python3 -B test/test_night_abort.py`; нужны sudo/systemd, создаются только свои
временные scope и соседняя служба-фикстура, живые агенты и канал владельца не вызываются.

С 3.1.86 caller отдельно пишет `КАНАЛ НЕ ВЫЗВАН`, если файл канала отсутствует/недоступен или не исполняется. Сам `agent-alert` в этих случаях не запускался; причина остаётся в журнале обёртки. Исход обёртки — прежний 3, дополнительных попыток нет. Наличие этой диагностики и возврат приёмника проверяет существующий `stend-isklyuchenij-obhodchika.sh`, случаи О10/О10б/О11/О11б.

С 3.1.77 `s2_obertka` запускает scope с `--collect` без `--wait`: failed-оболочка после завершения собирается,
код и вывод сохраняет вызывающий обходчик. С2 читает журнал, а не свойства выгруженного юнита.
Ручная регрессия `sudo -n python3 -B test/test_s2_collect.py` исполняет настоящую обёртку от `iskra`,
проверяет выход 7 и самозавершение SIGKILL (код 137), сохранность потоков/контекста, переданный `--collect` и выгрузку scope;
свои имена убирает в `finally`. Настоящего исчерпания памяти нет: оно вызывает боевые тревоги `oom-watch`.
SIGKILL не воспроизводит состояние OOM-failed; прежнее измерение failed→not-found сохранено в П7, повторять его нельзя без согласования.
Стенды, которым failed/OnFailure нужны как предмет, сохраняют юнит до чтения и затем убирают только свои имена.

## Состав — по вызовам (снято 07.10.2026)

Прибор: для каждого файла — строки ядра (сценарии обхода, перечни, обходчик, стенды), где имя файла стоит НЕ в
комментарии; стенд в составе, только если его зовёт обход или стенд, которого зовёт обход. Обходчик каталог `stendy/`
не перебирает — только перечни. Из 54 спорных файлов корня `dorabotki` взяты 3 — данные и помощник, которые читает
`stend-kanarejki-shlyuza.sh`: `edinstvennye-sushchnosti-shlyuza.json`, `zayavlennye-proverki-kanarejki-shlyuza.json`,
`sreda-yunita.py`; остальные 51 — не в пакете (ниже).

## Живые Codex-шлюзы: путь app-server

`test/stend-codex-app-server.py` вызывается ночью отдельной строкой `OBLAST_STENDOV` с `@root` и назван в перечне. Перечень живых шлюзов берётся через `systemctl list-units 'coder-gateway*'` и MainPID; Codex определяется по `GATEWAY_POSTAVSHIK=openai` в `/proc/<MainPID>/environ`. Для каждого требуется `GATEWAY_CODEX_PUT=app-server` после обрезки того же набора пробельных символов, что JS `.trim()` в шлюзе; пустое после обрезки или отсутствующее значение означает `exec`, который, как и иное значение, даёт `КРАСНОЕ` с именем юнита, код 1. Вывод называет каждый проверенный юнит и итог `Codex-шлюзов N · app-server M · иначе K`.

Ноль Codex-шлюзов, недоступный/неоднозначный environ, ошибка systemctl или смена PID/starttime — слепота, код 2. Срез процесса перепроверяется после чтения; полный environ и посторонние переменные не печатаются и не сохраняются. Читатель исхода — существующий `chitatel-obhoda` из dsh-storozha-sadik.

Один проход: максимум 128 обнаруженных юнитов, 3 с на вызов systemctl и общий таймер 30 с; environ ограничен 1 MiB. Повторов, записи состояния и перезапусков нет. Неработающие шлюзы и поставщики не openai вне области; исчезнувший поставщик не исключается молча, а даёт слепоту. Проверка не доказывает наличие G-привязки, полноту AP-квитанции или здоровье app-server; настроенный процесс, меняющий режим после старта, и изменение сразу после последнего среза вне её гарантии.

LOW Вениамина к 3.1.103: в 3.1.103–3.1.104 стенд требовал точные байты и давал ложное красное на пробелах вокруг `app-server`. С 3.1.105 стенд повторяет правило шлюза `String(...).trim() || 'exec'`: обрамлённый `app-server` зелёный, пустота/одни пробельные символы/отсутствие переменной — красный `exec`. Набор JS trim общий с нормализацией поставщика; произвольный Python `.strip()` без этого набора не используется.

## G: сегменты, размер, скорость, ротация и GC

**3.1.120 — ночь 22.10: stend-atsiklichnosti называет настоящую причину, stend-pokrytiya не утверждает полноту живой разметки (Гамма e2a27940).**
**3.1.119 — g-source-contract: при отказе Node — первые 300 байт stderr в тексте причины (Альфа 7059dc7e).**
**3.1.118 — ночь 22.10: перечень +2 стенда TG (stend-claude-turn-native/usage, долг окна AP 0.1.16); g-source-contract — bind файлов initializer вместо каталога (Альфа 4ba93632).**
**3.1.117 — шлюз 3.1.10: 1 новый стенд шлюза в перечне обхода (путь дерева; шлюз 3.1.10 в master с 21.10 04:50Z).**

**3.1.116 — к окну 0.1.12 (шлюз 3.1.9): 7 новых стендов шлюза в перечне обхода (путь дерева; шлюз 3.1.9 в master с 20.10 08:15Z).**

**3.1.115 — предмет под FAIL второго учёта в stend-atsiklichnosti; два стенда обхода больше не оставляют root `__pycache__` в дереве; среда SREDA_STENDOV для 5 стендов dsh-tool-bridge копии Искры.**

**3.1.114 — к окну Ш (шлюз 3.1.8): 4 стенда шлюза в перечне обхода (путь дерева; в бой — окном Ш после влития шлюза) и ночной стенд канарейки разбирает окружение, переданное свойством `env:` объекта.**

**3.1.113 — сторож R под упрощённый учёт 0.1.10 (решение Забавы по policy 18.10, Вениамин 18:01 МСК; рука Зари).** `test/stend-r-journal-size.py` зовут строка `OBLAST_STENDOV` `@root /opt/iskra/app` и строка `SREDA_STENDOV` с доводом; исход читает `chitatel-obhoda`. До окна учёта довод `--otlozheno` («не ведётся», код 0). Окно учёта меняет его на `--istochniki <конфиг источников читателя Гаммы>`. Предел — только из ОДНОГО policy-файла писателя и читателя `/etc/dsh-telegram-multiagent/usage-runtime-policy.json` (root, без записи группе/прочим; ровно `{schemaVersion:1, fileMaxBytes, recordMaxBytes}`); своих пределов в стороже нет, `--policy` — только для проб. Только `lstat` R и `systemctl is-active` службы TG источника, содержимое не читается. КРАСНОЕ ровно в трёх случаях, с предметом: (а) policy нет / нечитаема / не защищена / форма не та; (б) R больше `fileMaxBytes` — обрезка не сработала (ровно предел законен); (в) служба active, а R нет или его mtime старше 300 с — «писатель молчит» (heartbeat писателя 15 с). Жёлтого нет. Unsafe каталог/файл R, неопрошенная служба, незаданный конфиг источников — СЛЕПОТА (код 2); служба не active и R нет — «не судится». Конфиг источников — профиль читателя Гаммы `/var/lib/autopilot-usage/source-profile.json` (`participants[]` → `name`, `uid`, `runtimeSource.raw`; служба — поле `tgService`, плейсхолдер `POLE_SLUZHBY` до П7 Гаммы); изъян профиля или нет поля службы — СЛЕПОТА с именем участника, своего списка нет. Не ловит: чужой `touch` R (ложное зелёное по mtime), события между ночными прогонами, содержимое R. Пробы: `sudo -n python3 -I test/test_r_journal_size.py [проба]` — 32.

**3.1.108 — кандидат только для совместного захода AP 0.1.10: сегментный шлюз 3.1.8 Гаммы, reader/бюджет Беты и этот стенд. После AP 0.1.9, отдельно от совместного окна не ставить.**

`test/stend-g-journal-size.py` зовёт прежняя строка `OBLAST_STENDOV` с `@root /opt/iskra/app`, исход читает `chitatel-obhoda`. Область — живые Codex/Claude из systemctl/MainPID (`coder-gateway*`, `claude-oauth-gateway*`), поставщик из environ. Producer ищется по Node exe/cmdline gateway.mjs: абсолютный entrypoint через `/proc/PID/root`, относительный через cwd. Producer и `usage-limits.json` — рядом с entrypoint, без fallback основного каталога. Неизвестный запуск, flags перед script, ссылки/необычные родители, `..`, непрочитанный процесс — слепота2. Сегментный G берётся из CODEX_HOME/HOME через тот же process root; inode родителей переснимаются. Legacy schema1 сохраняет прежний host-путь G.

Policy читается strict JSON до256KiB: schema1 с двумя ключами либо schema3 писателя3.1.8: schemaVersion и пять полей legacyFileMaxBytes, segmentMaxBytes, segmentMaxAgeSeconds, rawRetentionSeconds, maxRecordBytes. Прежняя schema2 и любые дополнительные directoryWarnBytes/closedCountWarn отвергаются как неподдержанная схема; пороги сторожа заданы только в настройке стенда. Неверная схема/числа, duplicate keys, отсутствие файла — именованная слепота2, без запасного128MiB. Стенд размера не импортирует JavaScript. Дисковая policy может расходиться с загруженной в память до рестарта писателя.

Для schema3 `g_segment_source.py` читает metadata/stat и observedAt первой строки active: source anchor0400 с обязательным safeint UTC epoch-ms `sourceCreatedAt`; manifest0600, writer.lock0600, closed raw/seal0400, active0600, каталоги0700. Все известные файлы regular, uid шлюза, nlink1, без ссылок. `g_safety` держит ранний guard initializer; metadata guard продолжает его для сегментов. Unsafe даёт `FAIL ЖЁЛТОЕ · G выключен шлюзом`; негодная схема, отсутствующий обязательный файл, неполный/drifting срез или intent — слепота2. Исправление chmod не включает уже выключенный writer: initializer решает при старте, согласованный рестарт — отдельный шаг. Зелёное не доказывает, что writer включён. Ручного UUID-профиля нет.

Считаются все файлы `segments/`. Ожидаемо `2*ceil(rawRetentionSeconds/segmentMaxAgeSeconds)+2`: при7сут/1ч338. Стартовый WARN строго при `>2*(7*24*2+2)`, то есть>676;512 из closedCountWarn не используется. Total bytes — active, anchor, metadata/raw/seal/лишние regular файлы всего источника; allocated bytes ФС показаны отдельно. Стартовый объёмный WARN строго>1073741824байт (1GiB). Orphan-файлы дают отдельный WARN. Строка GC называет возраст самого старого закрытого сегмента; старше retention+3600с — «GC отстаёт». Для каждого измеренного schema3 источника три отдельные строки: GC, «Разрастание» и «СПРАВКА». У GC и разрастания собственные вердикты; просроченный сегмент не перекрашивает строку разрастания. Справка без FAIL/цвета показывает фактическое число всех файлов источника (и отдельно segments) рядом с «ожидаемо при закрытии по часу: 344 (2(N+1)+4+2) · Гамма». Это справочный hourly-ориентир, не тревожный порог: размерная ротация может законно дать больше файлов. Эти три строки сохраняются существующим transport STEND-G-METRIC; проверка ротации ниже добавляет четвёртую, максимум — отдельной строкой. Это мягкие предупреждения, не quota и не повод удалять сырьё раньше retention.

Отдельная строка `РОТАЦИЯ` проверяет **непустой** active: `now−firstObservedAt > (policy.segmentMaxAgeSeconds+15*60)*1000` даёт `FAIL ЖЁЛТОЕ · ротация стоит: <шлюз>, первая запись <UTC>`. `firstObservedAt` — observedAt первой строки active, не manifest.active.openedAt и не mtime. После долгого простоя первая запись в старый active свежая: возраст openedAt дал бы ложное жёлтое перед немедленным seal писателя. Рядом напечатаны openedAtMs, firstObservedAtMs и порог в секундах. Читается только первая строка, не больше maxRecordBytes+1 байта (≤65537), с теми же uid/0600/обычный файл/nlink1/O_NOFOLLOW и сверкой stat до/после. Негодный JSON, повтор ключа, неверный/будущий observedAt, слишком длинная или незавершённая строка дают слепоту2. Полный raw не валидируется. Равенство порогу ещё не тревога; свежая первая запись возвращает зелёное. Пустой active получает нейтральное «ротация не требуется: active пуст», firstObservedAtMs=None. GC/разрастание/справка независимы; собственного состояния стенд не заводит.

Скорость без состояния: сумма `byteLength` валидированных печатей с `now−604800000 < closedAt <= now`, делённая на604800с. Active и старые печати в числитель не входят. Это средний поток закрытых raw за скользящие7сут, а не разность двух total после GC. Для молодого источника знаменатель всё равно7сут; это не скорость за время с рождения.

Пороговые настройки находятся в одном месте — начале `test/g_segment_source.py`: `WARN_BYTES`, `WARN_FILES`, `THRESHOLD_STAGE`. Они фиксированы и названы «стартовые». Автоматического обучения, нового root-состояния и нового читателя нет. Каждую ночь `STEND-G-METRIC:` печатает measuredAtMs, имя/юнит, totalBytes, segmentFiles, closedBytes7d, байт/с и пороги. Существующий обходчик передаёт эти строки в свой stdout/журнал также при коде0. Отдельная строка `STEND-G-METRIC: МАКСИМУМ` называет самый быстрый измеренный шлюз и его скорость; индивидуальные строки каждого шлюза сохраняются. Максимум выбирается по точным closedBytes7d, не по сумме или округлённым скоростям. При неполном охвате/слепоте строка помечена «частичный», без измеренных источников — «не измерен», а не числовой ноль. Через неделю люди снимают ряд ночных строк, считают `2*(максимальная скорость шлюза*7сут)` и меняют константы/метку обычным окном; сам стенд пороги не пересчитывает.

Для schema3 прежние75%/100% от128MiB active отменены. Договор AP теперь сверяет отдельно legacyFileMaxBytes ↔ G_WRITER_LIMIT и maxRecordBytes ↔ G_RECORD_ALLOWANCE; это не лимит всего сегментного источника. 128MiB остаётся только границей legacyS0 (+maxRecordBytes), обычные сегменты ограничены segmentMaxBytes. Объёмные пороги теперь относятся ко всему источнику. Это не обещание бюджета reader AP, P1/seq/свежести, binding/полноты, raw SHA или обнаружения согласованной переписи тем же uid. `inspectGatewaySegments` (all-history без P1/счётчика I/O) монитором не используется; AP reader принадлежит Бете.

Legacy schema1: `gatewayV1FileMaxBytes >65536`, safe JS integer; жёлтый `(limit*3+3)//4`, красный limit. Сохраняются FAIL/«риск SOURCE_GAP по размеру» и договор равенства AP G_WRITER_LIMIT с JSON-пределом каждой сборки. AP импортируется `python3 -I -B -c` из `/opt/autopilot/current/skill/tools`; origin/release и symlink containment проверяются до импорта. AP<producer и AP>producer — разные красные причины с обоими числами/путями; модуль/импорт/предел отсутствует — слепота2. Чистота такого импорта подтверждена владельцем Бетой; пробы автора — на копии будущей раскладки. AP ≤3с/64KiB stdout/stderr, без pyc. Для schema3 проверяются обе указанные пары; любое неравенство красное с именем пары, числами и путями, отсутствие G_RECORD_ALLOWANCE — слепота2. До/после импорта и таблицы initializer переснимается также usage-reader-limits.json AP. Импорт получает PATH и существующий неизменённый HOME родителя, остальное окружение отфильтровано. Это проверка численного договора, не бюджета всего источника.

Нет ни G, ни producer — нейтральное «G не ведётся (сборка без G)» с путём; G есть без producer — слепота2 с именем/каталогом. При producer policy нужна даже без G. Новый процесс (starttime позже max(mtime,ctime) producer) без G — жёлтое «G ожидается, файла нет»; старый — нейтральное «до монтажа G». Неоднозначность/будущая дата — слепота2. Итог: шлюзовN/сG/безG/Gвыключен; ноль шлюзов — слепота. Код0 означает отсутствие тревоги, не наличие G.

Вторую прежнюю root-строку зовёт `test/stend-g-source-contract.py` → живой `g-source-contract.py`. Каждый найденный каталог producer проверяется один раз (dev/inode), с именами всех юнитов; сборочного fallback нет. Реальный prepareGatewayUsage запускается на временных HOME: openai/anthropic × каталог0700/0755/link/foreignuid × файл0600/0644/nlink2/link/directory/missing/foreignuid —56случаев. Для schema3 проверяется и полный metadata guard после initializer. Несовпадение — красное с именем случая и путём; ошибка — слепота2. `--producer /absolute/usage-producer.mjs` — адресный режим.

Копии `fixtures/g-producer-359a` и `fixtures/g-producer-25d8` — только для детерминированной сборки (SOURCE.json/commit/SHA); живой договор — строка обхода.Точные четыре файла writer-кандидата Гаммы25d8092059192ee3a456d99fd7e91123955d21cb из AP010-G-WRITER-LIMITS-ONLY-20261018 сверены с Git blobs; его внешняя приёмка здесь не утверждается. Настоящий prepare в частном HOME создаёт sourceCreatedAt с реальными часами; CLI проверяется через временный MainPID. Рукописные metadata остаются unit-пробами схемы, не заменяют owner-прогон. Принудительные seal создаёт метод самого писателя: это геометрия количества/справки, не замер нагрузки. Fixture ap-limits-0516 содержит реальные usage_registration.py, mail_registration.py и usage-reader-limits.json Беты0516b410 в будущей раскладке skill/tools; SOURCE.json перечисляет SHA и источники. Подставная адаптация old2 из r3 удалена: сборка и живой договор используют настоящий schema3 writer. При смене итогового writer совместную проверку повторить; боевой монтаж этой fixture не утверждается.

Один проход размера: ≤128юнитов, systemctl≤3с/вызов, общий30с, environ≤1MiB, cmdline/status≤64KiB; на источник≤16384объектов, JSON≤8MiB/файл и≤32MiB metadata. Договор:90с, Node≤15с/сборку, stdout/stderr≤256KiB. bwrap даёт Node readonly imports и writable только временные HOME/tmpfs, без сети/PID наружу, capabilities сняты. До/после переснимаются процесс и статический состав initializer (producer, engine-process, policy; дляschema3 также usage-segments). Нет retries/записи состояния/очистки/рестартов. Произвольные новые imports и намеренное чередование файлов/mount между срезами не защищены атомарно; loaded code в памяти не проверяется. Боевые HOME/gateway.mjs/службы не исполняются.

## Файлы

git хранит только признак «исполняемый», поэтому режим и владелец на диске — в таблице (снято `stat` боя 07.10.2026).

| файл в пакете | путь на диске | кто зовёт | режим | владелец:группа |
|---|---|---|---|---|
| `dorabotki/obhod-run-state.py` (с 3.1.72) | `/opt/iskra/workspace/dorabotki/obhod-run-state.py` | ночная обёртка: scope, хвост, части тревоги; добавить в derevo.files записи dsh-obhod-stendov ДО монтажа | 644 | iskra:iskra |
| `libexec/stend-varvara-fs-deny.mjs` (с 3.1.15) | `/usr/local/libexec/stend-varvara-fs-deny.mjs` | ночной обход, `@varvara /opt/varvara/app`; 15 с, caller 30 с | 644 | root:root |
| `dorabotki/omega-b-p-060/stend-b-p-060.sh` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/omega-b-p-060/stend-b-p-060.py` | `/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.py` | стенд stend-b-p-060.sh (зовёт его python OMEGA `/opt/omega/venv/bin/python3 -B`) | 755 | iskra:iskra |
| `dorabotki/perechen-boevyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt` | обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/perechen-nedelnyh-stendov.txt` | `/opt/iskra/workspace/dorabotki/perechen-nedelnyh-stendov.txt` | vse-stendy-nedelnye.sh | 644 | iskra:iskra |
| `dorabotki/stend-373-svodki-vne-vydachi.mjs` | `/opt/iskra/workspace/dorabotki/stend-373-svodki-vne-vydachi.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-agent-limits.sh` | `/opt/iskra/workspace/dorabotki/stend-agent-limits.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-apt-notify.sh` | `/opt/iskra/workspace/dorabotki/stend-apt-notify.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-B14-snimok.sh` | `/opt/iskra/workspace/dorabotki/stend-B14-snimok.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-atsiklichnosti.sh` | `/opt/iskra/workspace/dorabotki/stend-atsiklichnosti.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stend-cepi-pamyati.mjs` | `/opt/iskra/workspace/dorabotki/stend-cepi-pamyati.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-compaction-zaveden.mjs` | `/opt/iskra/workspace/dorabotki/stend-compaction-zaveden.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-izmeritelya.sh` | `/opt/iskra/workspace/dorabotki/stend-izmeritelya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kanarejki-shlyuza.sh` | `/opt/iskra/workspace/dorabotki/stend-kanarejki-shlyuza.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-kurera.sh` | `/opt/iskra/workspace/dorabotki/stend-kurera.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-needrestart.sh` | `/opt/iskra/workspace/dorabotki/stend-needrestart.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh с ключом `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stend-obyavlenij-profilej.sh` | `/opt/iskra/workspace/dorabotki/stend-obyavlenij-profilej.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-ohvat-i-sverka.mjs` | `/opt/iskra/workspace/dorabotki/stend-ohvat-i-sverka.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-otmetki-priyomki.sh` | `/opt/iskra/workspace/dorabotki/stend-otmetki-priyomki.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pochtalona.sh` | `/opt/iskra/workspace/dorabotki/stend-pochtalona.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-pokrytiya.sh` | `/opt/iskra/workspace/dorabotki/stend-pokrytiya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-poteri-pisem.mjs` | `/opt/iskra/workspace/dorabotki/stend-poteri-pisem.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-hranilishcha-sekretov.sh` | `/opt/iskra/workspace/dorabotki/stend-hranilishcha-sekretov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vozrast-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-vozrast-pisma.mjs` | ночной обход (perechen-boevyh-stendov.txt) — исключение ОЖИДАЕМО; обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-pravki-reestra.sh` | `/opt/iskra/workspace/dorabotki/stend-pravki-reestra.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-kopii.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-kopii.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priyomki-po-raspisaniyu.sh` | `/opt/iskra/workspace/dorabotki/stend-priyomki-po-raspisaniyu.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-priznaka-oblasti.sh` | `/opt/iskra/workspace/dorabotki/stend-priznaka-oblasti.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-proverki-opory.mjs` | `/opt/iskra/workspace/dorabotki/stend-proverki-opory.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-razmer-kopii-watch.sh` | `/opt/iskra/workspace/dorabotki/stend-razmer-kopii-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-reestra-agentov.sh` | `/opt/iskra/workspace/dorabotki/stend-reestra-agentov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-registry-json.sh` | `/opt/iskra/workspace/dorabotki/stend-registry-json.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-sekretov-na-mestah.sh` | `/opt/iskra/workspace/dorabotki/stend-sekretov-na-mestah.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-skill-links.sh` | `/opt/iskra/workspace/dorabotki/stend-skill-links.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-snyatie-ogranichitelej.mjs` | `/opt/iskra/workspace/dorabotki/stend-snyatie-ogranichitelej.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-soglasie-sloev.sh` | `/opt/iskra/workspace/dorabotki/stend-soglasie-sloev.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-stop-pobudok.mjs` | `/opt/iskra/workspace/dorabotki/stend-stop-pobudok.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-storozha-reestrov.sh` | `/opt/iskra/workspace/dorabotki/stend-storozha-reestrov.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svershchika.sh` | `/opt/iskra/workspace/dorabotki/stend-svershchika.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-svyazok-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stend-svyazok-podpisok.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-U0-istochnik.mjs` | `/opt/iskra/workspace/dorabotki/stend-U0-istochnik.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-uborki-pisma.mjs` | `/opt/iskra/workspace/dorabotki/stend-uborki-pisma.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-verdiktov-istochniki.mjs` | `/opt/iskra/workspace/dorabotki/stend-verdiktov-istochniki.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vidimosti-a2a.sh` | `/opt/iskra/workspace/dorabotki/stend-vidimosti-a2a.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stend-vtoroj-vhod-svodki.mjs` | `/opt/iskra/workspace/dorabotki/stend-vtoroj-vhod-svodki.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stend-vzaimnogo-nabludeniya.sh` | `/opt/iskra/workspace/dorabotki/stend-vzaimnogo-nabludeniya.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh с ключом `--zhivaya-mashina` | 755 | iskra:iskra |
| `dorabotki/stendy/clw-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/clw-sluchai.sh` | стенд stend-codex-limit-watch.sh | 755 | iskra:iskra |
| `dorabotki/stendy/fake-codex.py` | `/opt/iskra/workspace/dorabotki/stendy/fake-codex.py` | стенд clw-sluchai.sh | 755 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-napominaniya.mjs` | стенд stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-podgotovit.mjs` | стенд stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-proverit.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-proverit.mjs` | стенд stend-mail-stop-hold.sh | 644 | iskra:iskra |
| `dorabotki/stendy/mail-stop-hold-tg.mjs` | `/opt/iskra/workspace/dorabotki/stendy/mail-stop-hold-tg.mjs` | стенд mail-stop-hold-napominaniya.mjs | 644 | iskra:iskra |
| `dorabotki/stendy/pk-sluchai.sh` | `/opt/iskra/workspace/dorabotki/stendy/pk-sluchai.sh` | стенд stend-pereklyuchatelya-codex.sh | 755 | iskra:iskra |
| `dorabotki/stendy/poll-fixture.mjs` | `/opt/iskra/workspace/dorabotki/stendy/poll-fixture.mjs` | стенд stend-a2a-owner-copy-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/priyomnik-imeni-v2.mjs` | `/opt/iskra/workspace/dorabotki/stendy/priyomnik-imeni-v2.mjs` | стенд stend-imeni-v2.sh | 644 | iskra:iskra |
| `dorabotki/stendy/proba-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-kopij.sh` | стенд stend-mest-kopij.sh | 755 | iskra:iskra |
| `dorabotki/stendy/proba-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/proba-prav-domov.sh` | стенд stend-prav-domov.sh | 755 | iskra:iskra |
| `dorabotki/stendy/smv-atomic-probe.py` | `/opt/iskra/workspace/dorabotki/stendy/smv-atomic-probe.py` | стенд stend-smontirovat-vypusk-rezhimy.sh | 644 | iskra:iskra |
| `dorabotki/stendy/smv_fixture.py` | `/opt/iskra/workspace/dorabotki/stendy/smv_fixture.py` | четыре stend-smontirovat-vypusk-*.sh и smv-atomic-probe.py; только частные фикстуры | 644 | iskra:iskra |
| `dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-a2a-owner-copy-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-aclaude-snaruzhi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-aclaude-snaruzhi.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-chitatelya-obhoda.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-chitatelya-obhoda.py` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.etalon` | стенд stend-codex-limit-watch.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-codex-limit-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-compact-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-compact-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-doli-preseta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-doli-preseta.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-dogovora-trevogi.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-dogovora-trevogi.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-hvostov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-hvostov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-imeni-v2.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-imeni-v2.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-isklyuchenij-obhodchika.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnovy-versii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnovy-versii.py` | ночной обход; po_osnove: своя bare/suffix основа проходит, чужая отказывает; без доводов проверяет соседний vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mashinnoj-redakcii.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-mashinnoj-redakcii.py` | ночной обход; юниты systemd трёх пакетов дерево↔бой по рабочим строкам за вычетом данных /etc/agent-registry/ozhidaemye-razlichiya.yaml; живые drop-in вне дерева не видит | 644 | iskra:iskra |
| `dorabotki/stendy/stend-limity-pereklyuchatelya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-limity-pereklyuchatelya.py` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mail-stop-hold.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mail-stop-hold.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-mest-kopij.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mest-kopij.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-mihalycha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-mihalycha.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-modeli-omega.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-modeli-omega.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-model-podmena.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-model-podmena.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-montazha.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-montazha.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-nemoty-posle-szhatiya.py` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-oblasti-fajlom.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-oblasti-fajlom.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.py` | стенд stend-obnovitel-prava.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-obnovitel-prava.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-opisat-kartinku.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-opisat-kartinku.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-osnova.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-osnova.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-otbros-shlyuza.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-otbros-shlyuza.py` | ночной обход (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pered-podyomom.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-pered-podyomom.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.etalon` | стенд stend-pereklyuchatelya-codex.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-prav-domov.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-prav-domov.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-pravki-mimo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh; vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.py` | стенд stend-priyomnik-itog.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-priyomnik-itog.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-profil.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-profil.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, HODPRIBOR, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.py` | стенд stend-razbora-env.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-razbora-env.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rezhim-novogo.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-rezhim-novogo.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-rolej-shlyuza.mjs` | `/opt/iskra/workspace/dorabotki/stendy/stend-rolej-shlyuza.mjs` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-bez-sredy.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-voice-root.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-voice-root.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sadik-watch-zastryal.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-zastryal.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.py` | стенд stend-sajt-chat.sh | 444 | iskra:iskra |
| `dorabotki/stendy/stend-sajt-chat.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 555 | iskra:iskra |
| `dorabotki/stendy/stend-sborshchika-kopii.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sborshchika-kopii.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-args.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-git.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya-profilya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya-profilya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-snyatiya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/smontirovat-fajly) | 755 | iskra:iskra |
| `dorabotki/stendy/stend-sobrat-kuda.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-sobrat-kuda.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-storozha-nad-storozhami.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-storozha-nad-storozhami.sh` | недельный обход (perechen-nedelnyh-stendov.txt); vse-stendy-nedelnye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-podpisok.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svesti-dostup-watch.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-watch.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-svodki-doveriya.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-svodki-doveriya.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.py` | стенд stend-switch-1.sh | 644 | iskra:iskra |
| `dorabotki/stendy/stend-switch-1.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-trust-sverka.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-trust-sverka.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh (@root, довод /usr/local/sbin/mail-stop-trust-sverka.mjs) | 644 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta-git.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta-git.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-ucheta.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-ucheta.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-perenosa.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-perenosa.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-vorot-vypuska.sh` | `/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh` | ночной обход (perechen-boevyh-stendov.txt); обходчик vse-stendy-boevye.sh | 755 | iskra:iskra |
| `dorabotki/stendy/stend-zhivaya-versiya.py` | `/opt/iskra/workspace/dorabotki/stendy/stend-zhivaya-versiya.py` | ночной обход (perechen-boevyh-stendov.txt) | 644 | iskra:iskra |
| `dorabotki/skaner-zhivoj-mashiny.py` | `/opt/iskra/workspace/dorabotki/skaner-zhivoj-mashiny.py` | обходчик vse-stendy-boevye.sh (С1 перед каждым стендом, правила для суда С2); берётся из каталога обходчика — ставить рядом | 755 | iskra:iskra |
| `dorabotki/vse-stendy-boevye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-boevye.sh` | vse-stendy-po-tajmeru.sh | 755 | iskra:iskra |
| `dorabotki/vse-stendy-nedelnye.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-nedelnye.sh` | vse-stendy-nedelnye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/vse-stendy-po-tajmeru.sh` | `/opt/iskra/workspace/dorabotki/vse-stendy-po-tajmeru.sh` | vse-stendy-boevye.service (User=iskra) | 755 | iskra:iskra |
| `dorabotki/edinstvennye-sushchnosti-shlyuza.json` | `/opt/iskra/workspace/dorabotki/edinstvennye-sushchnosti-shlyuza.json` | стенд stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | `/opt/iskra/workspace/dorabotki/zayavlennye-proverki-kanarejki-shlyuza.json` | стенд stend-kanarejki-shlyuza.sh | 644 | iskra:iskra |
| `dorabotki/sreda-yunita.py` | `/opt/iskra/workspace/dorabotki/sreda-yunita.py` | стенд stend-kanarejki-shlyuza.sh | 755 | iskra:iskra |
| `systemd/vse-stendy-boevye.service` | `/etc/systemd/system/vse-stendy-boevye.service` | свой .timer 03:40 UTC | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/30-stend-nabora.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/30-stend-nabora.conf` | drop-in: STEND_POLKA, STEND_PLAGINY для стенда набора | 644 | root:root |
| `systemd/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-boevye.service.d/60-bash-padenie-70.conf` | drop-in: запуск через bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-boevye.timer` | `/etc/systemd/system/vse-stendy-boevye.timer` | systemd (включён) | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service` | `/etc/systemd/system/vse-stendy-nedelnye.service` | свой .timer ср 16:00 UTC | 644 | root:root |
| `systemd/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | `/etc/systemd/system/vse-stendy-nedelnye.service.d/60-bash-padenie-70.conf` | drop-in: запуск через bash-padenie-70 | 644 | root:root |
| `systemd/vse-stendy-nedelnye.timer` | `/etc/systemd/system/vse-stendy-nedelnye.timer` | systemd (включён) | 644 | root:root |

## Вне обхода — стенды в `dorabotki`, которых обход не зовёт (в пакет не взяты)

- корень: stend-kanarejki.sh — «РУЧНОЙ НАМЕРЕННО» (так в перечне, 1.0.12: копия наследует личность живого агента);
  stend-needrestart.sh с 3.1.1 в пакете (таблица выше), его зовёт недельный обход;
  stend-hranilishcha-sekretov.sh и stend-vozrast-pisma.mjs — с 1.0.12 в пакете и в ночном обходе (vozrast-pisma — с исключением ОЖИДАЕМО);
- stendy/CHITAT-PERED-PROGONOM-nabor-vorot.txt, stendy/stend-podyoma.sh — `stendy/stend-podyoma.sh` «вне обхода намеренно» (так в перечне); `CHITAT-PERED-PROGONOM-nabor-vorot.txt` — записка для руки.
- ручной `stend-krug-samoproverki.sh` — «ИСКЛЮЧЁН, ручной» (так в перечне); его источник — дерево dsh-reestr
  (`/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-krug-samoproverki.sh`), копия в `dorabotki` снята в 1.0.50.

## Не в пакете — предметы проверки и прочее (решение координатора отдельно)

- Предметы, которые стенды пакета проверяют (инструменты других областей): `montazh-iz-tega`,
  `ozhidaemyj-razmer.py`, `priznak-oblasti-podklyucheniya.sh`, `proverit-publikacii.py` (+ его настройка `karta-publikacij.yaml`),
  `proverka-opory.mjs`, `verdikty-priyomki.sh`; исходники боевых инструментов с парой в `/usr/local` (уже в своих пакетах).
- Прочие файлы корня `dorabotki`, которые ядро упоминает только в комментариях, файлы `*.SNYATO*`, страховки `*.bak*`, учёт `nashi-dorabotki.sh`/`manifest.txt`.

## Зависимости

- Канон P-разряда: `/usr/local/bin/summa-predmeta-2` (dsh-pamyat), установленный до потребителя; `nashi` передаёт один каталог, читает второе поле — одну 16-значную hex-сумму. Состав/способ счёта сохранены. Нет прибора, отказ или пустая/невалидная сумма — именованная СЛЕПОТА, код 2 до сверки/записи манифеста. Порча пусто/0 не может стать эталоном. Область: `/opt/iskra/plugins/*/` и `/opt/dsh-package-manager/*/package/`; остальные корни и семантическая верность состава не проверяются. Повторного счёта при отказе нет.
- `stendy/stend-nashi-montazh.py` копирует настоящий установленный канон в частный `/usr/local/bin`; кандидат задаётся `KANON_BIN`. Проверяет исправное → пусто/0 → возврат, а также отказ --save без изменения эталона.
- **dsh-pribory ≥ 3.1.2**: `nashi-dorabotki.sh --check` (§3, охват) вызывает `npm-sostav --files` через PATH; помощнику нужен jq. Установить `/usr/local/bin/npm-sostav` ПЕРЕД потребителем, пока действует npm 11. Нет помощника — код 2 с причиной «npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2». Ошибка разбора состава на npm 11/12 называет каталог; итог «не измерен», код 2. Каталог без `package.json` пропускается законно.
- `stendy/stend-nashi-montazh.py` копирует настоящий `npm-sostav` из PATH в свой частный `/usr/local`; кандидат задаётся `NPM_SOSTAV_BIN`.
- Охват вызывает `npm pack --ignore-scripts --dry-run --json`: lifecycle scripts пакета (включая prepack/prepare) не исполняются. Проверка `--scenario hooks` ручной регрессии ставит эти scripts в подставной пакет и требует отсутствия их меток. Граница: это запрет lifecycle scripts именно этого вызова pack, не проверка безопасности кода npm или содержимого пакета; дополнительного запуска сборки нет.
- Ручная регрессия §3: `sudo python3 test/test_nashi_ohvat.py --helper <кандидат npm-sostav> --npm-dir <каталог библиотеки npm> --output <JSON>`; mount/net namespace, без подмены npm через PATH. Предел одной пробы 120 с, временные подставы удаляются по выходу. Проверяет только разбор и охват: верность состава npm и остальные разряды `--check` не проверяет; ночной обход этот ручной тест не зовёт.
- Программы: bash, python3, node, systemctl, journalctl, sudo, `systemd-run` (scope каждого стенда), `setpriv` (учётка стенда
  в scope с теми же группами), `setfacl` из пакета acl (журнал гостевого агента), `timeout` (предел стенда); `bash-padenie-70` из пакета
  **dsh-storozha-mashiny** (drop-in обоих юнитов).
- Недельный `stend-needrestart.sh` проверяет `/opt/iskra/workspace/dorabotki/proverka-needrestart.pl` и боевой
  `/etc/needrestart/conf.d/50-agent-services.conf` — в пакеты они не входят; нет любого — СЛЕПОТА, код 2. Под ключом
  `--zhivaya-mashina` он берёт замки dpkg/apt на прогон и пишет и снимает `99-STEND-*.conf` в живом `/etc/needrestart/conf.d`.
- `stendy/stend-vorot-perenosa.sh` проверяет установленные ворота `/usr/local/bin/perenos-v-derevo` (пакет dsh-montazh), другой путь — `PERENOS_BIN`.
- Модуль python `yaml` (PyYAML; пакет ОС `python3-yaml`): им обходчик читает `/etc/agent-registry/stend-exceptions.yaml`. Без модуля
  файл исключений «не разобран», и итог обхода не ниже 2. Его же импортируют 18 стендов пакета.
- Учётка обхода (iskra) — с беспарольным `sudo -n`: им идут scope-юнит каждого стенда, суд журнала `journalctl` после
  прогона и стенды чужих учёток. Без него С2 слепнет, и обход кончается кодом 2 (если нет причины для 1).
- Каталог `/opt/iskra/workspace/tmp-stendov` (iskra:iskra 0750) создаёт монтаж, не пакет: это `TMPDIR` стенда ворот
  `stend-vorot-vypuska.sh` и `/usr/local/libexec/stend-metki-vorot.sh` (строки `SREDA_STENDOV` обходчика). В юните обхода
  `/tmp` и `/var/tmp` частные, а оба стенда зовут отдельные службы `systemd-run` (ворота — обходчик, проба 6б — сторож меток),
  которым частный каталог не виден. Нет каталога — оба стенда слепнут.
- `/etc/agent-registry/stend-exceptions.yaml` (исключения стендов), реестр, боевые предметы стендов — в пакет не входят.

## Установка и снятие (руками root)

Файлы `dorabotki/` — в `/opt/iskra/workspace/dorabotki/` владельцем `iskra:iskra` с режимом из таблицы; юниты и drop-in —
в `/etc/systemd/system/`, `systemctl daemon-reload`, `systemctl enable --now vse-stendy-boevye.timer vse-stendy-nedelnye.timer`.

Снятие юнита — `systemctl mask` (правило фермы 9): наш юнит с файлом в `/etc/systemd/system` mask не примет —
файл в страховку (`mv`), `daemon-reload`, `mask`; вернуть — `unmask` и файл назад.

## Как обходчик гонит стенды

Перед прогоном обходчик снимает журнал службы гостевого агента (имя юнита зашито в обходчике) с момента её подъёма в файл своего прогона: каталог `mktemp` в
`TMPDIR` с правами 711, файл 600 и ACL на чтение учётке этого агента (`setfacl`). Первая строка — шапка `#MOST_ZHURNAL_YUNITA <юнит> <старт>`.
Путь получает стенд этого агента `stend-cel-mosta.mjs` переменной `MOST_ZHURNAL_YUNITA` (строка `SREDA_STENDOV`). Снять не удалось —
файла нет, стенд слепнет, а не зеленеет.

**С1 — предупреждение до запуска, не красное.** Перед каждым стендом `skaner-zhivoj-mashiny.py` читает его текст и ищет команды,
меняющие живую машину: `systemctl` с меняющим глаголом, `useradd` и родню, запись в `/etc`, замки dpkg/apt, инструменты с ключом
действия. Стенд чужой учётки читается её рукой и подаётся сканеру через stdin. Маркеры в тексте стенда: `# ZHIVAYA-MASHINA: <что
меняет>` (ручной стенд, меняет живое) и `# ZHIVAYA-MASHINA-NET: <чем подменено>` (живого не трогает). В сводке обхода — строки
«⚠️ С1: <стенд>» с первыми находками, «С1 (предупреждение, не красное): …», «NET без проверки С2 (@root): N» (объявление NET у стенда
@root С2 проверить не может). Код обхода С1 не меняет.

**С2 — обнаружение после, не защита.** Каждый стенд идёт в своём `sudo -n systemd-run --scope --unit=obhod-stend-<pid>-<run>-<N>` через
`setpriv` с теми же uid, gid, группами и umask; среда передаётся файлом 0600 в рабочем каталоге прогона (в командной строке её
увидели бы все). После прогона один запрос `sudo -n journalctl` по окну прогона судит записи sudo и shadow-utils каждого юнита
по правилам С1. Находка — «🔴 С2: стенд <путь> изменил живую машину». Стоп и сброс своих временных юнитов (`systemd-run --unit=`
из того же стенда) находкой не считаются. Зрячесть проверяется каждым прогоном: юнит №0 зовёт `sudo -n /usr/bin/true obhod-stend-<pid>-<run>-0`; его записи в журнале
нет или scope не поднялся — «СЛЕПОТА С2». С 3.1.9 запрос берёт записи и по `SYSLOG_IDENTIFIER`: journald, принявший запись
после выхода процесса, кладёт её без `_COMM` и `_SYSTEMD_UNIT`. Пробу зрячести узнаём по метке прогона; прочие такие записи своей
учётки и shadow-utils считаются («записей без привязки к юниту N»), меняющая из них — «⚠️ С2 БЕЗ ПРИВЯЗКИ», код 2: источник не установить —
стенд обхода или иной процесс той же учётки (например, служба агента), работавший в окне прогона.
Собственный запрос С2 вложенного обходчика (точная форма целиком) находкой не считается; прочие `journalctl` — на суде сканера. С2 не видит действий стендов @root (всё внутри идёт от root без своей записи sudo, кроме
shadow-utils), команд внутри `sudo bash <скрипт>` и действий в отдельных юнитах, которые стенд поднимает сам (`systemd-run` без
`--scope`).

**Живые стенды — только с ключом** (их два: `stend-vzaimnogo-nabludeniya.sh` и `stend-needrestart.sh`). `stend-vzaimnogo-nabludeniya.sh` без `--zhivaya-mashina` отказывает строкой
«ОТКАЗ-ZHIVAYA-MASHINA», кодом 2 и ничего не трогает; с ключом он на секунды останавливает боевой `agent-watchdog.timer`
(отключается `BEZ_PORCHI_PREDMETA=1`). Ключ подаёт только недельный обход: `vse-stendy-nedelnye.sh` задаёт свои `OBLAST_STENDOV`,
`PERECHEN_STENDOV`, `PREDEL_STENDOV` и `SREDA_STENDOV`, а `SREDA_STENDOV` целиком замещает умолчание обходчика и подаёт ключ
поимённо (хвост строки после `--`). Ночной обход и ворота выпуска ключ не подают. С2-находки стенда под ключом печатаются
строкой «ЖИВОЙ ПО КЛЮЧУ: …» и красными не считаются.

Стенды, которые сами поднимают временные юниты: `stend-reestra-agentov.sh` — `sudo -n systemd-run --unit=b1890s<pid>-<агент>
-p RuntimeDirectory=…` для трёх проб гостя (нет `sudo -n` — пробы пропускаются); `stendy/stend-razbora-env.sh` (@root) — через
`stend-razbora-env.py` временные `systemd-run --wait --pipe`. Их действия внутри этих юнитов С2 по стенду не видит.

Коды обходчика: 0 — чисто; 3 — только ожидаемое (исключения действуют); 1 — неожиданное: красный или слепой стенд без
исключения, просроченное или неподтверждённое исключение, охват разошёлся с перечнем, **находка С2** (исключения её не снимают);
2 — полнота неустановима: стендов нет, перечня нет, файл исключений не прочитан, **С2 слеп** (если нет причины для 1).

## Ряд длительностей стендов (3.1.100, B-N-2105)

Ночной юнит задаёт drop-in'ом `70-ryad-stendov.conf` `VSE_STENDY_RYAD=/var/lib/vse-stendy-boevye/ryad.tsv` (`StateDirectory`, 0700, iskra);
пишет только проход с id от ночной обёртки и без `PAKET_IMYA` (ворота берут среду юнита, но в ряд не пишут). Обходчик дописывает строку на
каждый стенд сразу после него — убитый проход оставляет строки до обрыва. Поля: ночь, проход, путь, учётка, секунды, код, предел этой
ночи, копия_идёт, load1 на старте, iowait % за стенд. После прохода обёртка зовёт `dorabotki/sud-ryada-stendov.py` (пороги и «не ловит»
— в его шапке) и шлёт сигнал своей отправкой. Читатель — координатор через `chitatel-obhoda`; действие на сигнал — наряд хозяину стенда
«ускорить или обосновать предел», не подъём PREDEL по умолчанию. Регрессия: `python3 -B test/test_ryad_stendov.py` (sudo — только для
scope самих фикстур, как `test_night_abort.py`).

## Проверка

Сумма каждого файла пакета = сумма боя (`sha256sum`), права = таблице (`stat -c '%a %U:%G'`); исход обхода — читатель `chitatel-obhoda`.

## Фикстуры SMV и места копий (3.1.70, B-N-2065)

Четыре `stend-smontirovat-vypusk-*` и `smv-atomic-probe.py` используют общий `smv_fixture.py`.
Он создаёт частные реестр владельца копии, настройки copy-checker, state/lock/страховки и npm-cache.
Git-источник читается от владельца через upload-pack в собственную копию; в ней одна метка выпуска
закрепляется на проверяемый исторический коммит (нынешняя метка может иметь другое дерево).
В частной копии настоящего монтажника меняется только `R`; `binding.json` фиксирует обе суммы.
`montazh-okno` и строгий copy-checker настоящие. Исходный Git, боевые окна, реестр и копии не меняются.
Git-вызов ограничен 20 с, запуск монтажника — 90 с + 5 с до SIGKILL; внешний предел стенда — 120 с.
Это проверки именованных ветвей, не защита от монтажа мимо инструмента.

`proba-kopij.sh` берёт regular-образец из текущего NUL-перечня `/var/backups/montazh`
(или его копии `--koren`). Пустой/неполученный перечень, исчезнувший/изменившийся образец,
неисполненная проба учётки — слепота; без повторного поиска и зелёного пропуска.
Содержимое образца не выводится. Для ожидаемого запрета чтения подходят только EACCES/EPERM.
Общий поиск readable-файлов и остальные проверки прав/законных читателей сохранены.
Не ловит доступ между обходами, новые места копий вне перечисленных каталогов и чтение через sudo.

Ручной кандидатный регресс: `sudo python3 -B test/test_b_n_2065.py --source-bundle <bundle-с-master-и-метками>`.
Он использует отдельные mount/net namespaces, реальные временные UID-права и файлы;
User/LoadState служб для копии — подставные ответы, службы хоста не меняются.

### B-N-2063: общий код проверки реестра

`dsh-storozha-sadik/libexec/sadik-watch-pravka.sh` содержит реальную проверку 2г: её зовут штатный `sadik-watch.timer` через watcher и B1–B5 узкого `stend-pravki-mimo.sh`. Стенд читает определения функций log/kanal/gruppa из проверяемого watcher, затем зовёт общий код; main, срез машины и owner-helper не исполняются. Все его каналы/состояние/реестр подставные. Девять прежних проб сохранены. Сторож продолжает применять `_UID=0`, полный SHA и 21600 с остывания; эта проверка не покрывает agents.yaml, подлог root или смысл принятой pravka.

Новый helper → `/usr/local/libexec/sadik-watch-pravka.sh`, 0644 root:root, в derevo.files; сначала библиотека, затем watcher/стенд. Файл сам по себе при source не делает IO. Регресс: `python3 packages/dsh-obhod-stendov/test/test_pravki_isolation.py` из дерева (рука автора/приёмщика, нужна sudo для A1–A4). Он исполняет реальный caller с подставным срезом и каналами, проверяет обнаружение/возврат. Полного живого такта и реальной доставки этот регресс не проверяет.

Автопилот 0.1.1: `dsh-autopilot/test/stend-dsh-autopilot.sh` — отдельная строка `@root /opt/iskra/app`, адресный предел 600 с (внутри обёртки 480 с). Пусковой признак — финальная принятая голова Автопилота 0.1.1 в master рабочего дерева Искры и файл по указанному адресу с принятой суммой. Полка `/opt/autopilot/packages/...` туда ничего не кладёт; обход может войти до её окна. Пару область+перечень монтируют вместе с точки зрения запусков обхода. Проверка значения — `vse-stendy-boevye.sh --predel-stenda <полный путь>`; команда только читает таблицу. Ручная интеграционная проба: `sudo -n env AP_STEND_SOURCE=<принятый пакет 0.1.1> AP_ROUTE_EVIDENCE=<новый каталог> python3 -B test/test_autopilot_route.py`; настоящий обходчик/обёртка, root и обычный сосед, ограниченные отдельные scope, порчи/возвраты, частный mount/network namespace.

Для отдельной проверки чистого ночного отбора запускают тот же файл с аргументом `NightlyRoute` и другим новым `AP_ROUTE_EVIDENCE`: без `PAKET_IMYA`, область и перечень содержат только AP-обёртку. Без аргументов выполняется только `AutopilotRoute` (шесть фаз), поэтому классы не перезаписывают один каталог доказательств.

Пакетный отбор принимает и единственный адресный стенд в корне пакета или `test/`; точная файловая строка учитывается один раз и входит в знаменатель охвата. Полные ворота на частном DEREVO проверяет `sudo -n env AP_STEND_SOURCE=<принятый пакет> AP_GATE_EVIDENCE=<новый каталог> python3 -B test/test_autopilot_gate.py`; журнал, реестр и локальная метка только подставные.

### Ночные строки учёта 3.1.109 — кандидат совместного захода 0.1.10

`test/stend-ap-accounting.py` зовётся существующим обходчиком как `@root /opt/iskra/app`; исход читает `chitatel-obhoda`, все `STEND-AP-METRIC` сохраняются и при коде0. Один проход30с, subprocess3с, ≤128юнитов, environ≤1MiB, config≤256KiB, retries0, без своего состояния/рестартов/очистки.

Очередь: `sqlite3 -readonly /var/lib/autopilot-mail/mail.sqlite`, в readonly namespace (`bwrap --ro-bind / /`) для запрета побочного создания WAL-shm. COUNT/MIN/MAX accepted_at из usage_registrations, секунды UTC; WARN при COUNT>=64. Таблицы нет — «нет предмета», не измеренный0; отсутствие самой БД — слепота2; существующая пустая таблица — COUNT0/NULL..NULL. Ошибки/битая схема/нечисловое, отрицательное или будущее accepted_at/сменаinode дают слепоту2. Если SQLite требует отсутствующий shm, rootfsreadonly запрещает запись и даёт слепоту2; immutable=1 не используется, WAL не игнорируется. Между независимыми запросами очередь может меняться; агрегат снят одной read-транзакцией, это срез, не длина за всю ночь.

Провайдер: каждый живой openai coder-gateway из systemctl/MainPID, CODEX_HOME только из environ; config.toml читается через process root, родители без ссылок, файл regular/nlink1, чтение ограничено и сверено до/после. model_provider верхнего уровня, таблица model_providers (в том числе пустая) либо model_provider в любом profiles.<имя> дают «свой провайдер — подписка по account/read не доказывает», жёлтое с именем/путём без значенийconfig. Отсутствующий config — стандартные настройки. Ожидаются11Codex-шлюзов по наряду; обнаруженные имена печатаются, неполнота/изменениепроцесса/env/config→слепота2. Перепроверяются и исключённыеnon-openaiпроцессы. Проверяются все профили, включая невыбранные: активный профиль меняется флагом запуска. Флаги запуска, переменные окружения провайдера и overrides из других файлов эта проверка не показывает; account/read не вызывается.

Карта: форма по закреплённому коду Беты07207242, `/var/lib/autopilot-usage/codex-account-map.json`, строго schemaVersion1/accounts с1–2 digest→codex-3/4; файлroot0644. Источники — `/etc/claude-oauth/codex-podpiska-{3,4}/auth.json`, только tokens.account_id→SHA256UTF8. Чтениеroot, без вывода/сохраненияID/email/token/digest; map≤64KiB/auth≤1MiBкаждый, regular/root/no-group-other-write/nlink1/no-follow, безопасныеrootпредки, statдо/после всехтрёхфайлов. Несовпадение, карта только одного из двухслотов или одинаковыйaccount_idвобоихслотах→жёлтое «карта устарела»; отсутствие/небезопасность/негоднаясхема/изменение→слепота2. Это отдельная ночная сверка, не runtimeAPbuilder и не его монтаж. Живыеcredentials в авторских пробах не читались; тесты используют собственныесинтетическиеauth наканоническихпутяхвnamespace.

«принятые за 24 ч заявки, сейчас конечные UNBOUND (по причинам)»: читаются все доверенные root-статусы `/var/lib/autopilot-usage/registrations/*.json`, независимо от наличия строк SQLite. Считаются заявки с `now−86400 < acceptedAt <= now`, которые **сейчас** имеют state=UNBOUND и terminal=true; группировка по точному reason. Стартовая N=8 на причину, жёлтое строго при >8. Строка и этот договор явно относятся к acceptedAt: старая заявка, принятая больше суток назад и ставшая terminal сегодня, вне окна. Это решение координатора05:24:50, не оценка времени первого terminal. checkedAt в окно не входит.

Перед включением проверен настоящий prune_terminal из закреплённой Беты07207242: он удаляет только terminal-строки usage_registrations без минимального возраста на следующем успешном такте почты (настроенный интервал60с), либо при новом init; root JSON-tombstone сохраняет. Проба на копии оставила файлы возрастом1с и2сут байт-в-байт после удаления SQL-строк. Поэтому суточный счётчик обходит файлы, а не очередь. По проверенному коду возрастной очистки этих tombstone нет; ручное удалениеroot или новый внешний cleaner этим не исключаются. Другой установленный owner/политика очистки требует повторить договорную пробу: исчезнувший вместе с историей предмет невозможно восстановить одним чтением каталога.

Путь регистрации имеет cutoff повторов180с от приёма по данным Беты: округление `2×(60+1)+15+35=172` вверх до60с. Это проверено кодом/импортом копии, не замером задержки на живой машине и не SLA завершения при инфраструктурном отказе. Для такого отказа старая заявка может завершиться позже и не попасть в сутки приёма.

Ограничения UNBOUND: ≤4096 файлов, ≤16KiB на статус и≤32MiB суммарно, ≤128 разных причин, тот же общий30с, без повторов/состояния. Строгая форма Бетыschema1, safe root-предки/regular/root/no-group-other-write/nlink1/no-follow, типы и UTC acceptedAt/startedAt/checkedAt/registeredAt, pending только с известной pending-причиной и UTC retryUntil>=acceptedAt (точные180с не являются условием допуска наблюдателя), пересверка всех файлов и набора каталога. Негодный/исчезнувший/менявшийся предмет, неизвестное имя или исчерпанный бюджет — слепота2; пустой существующий каталог — измеренное0из0 имеющихся файлов, что само по себе не удостоверяет полную историю суток. Отсутствующий каталог — слепота2, а не ноль. Pending/REGISTERED/внеокна не входят в terminal UNBOUND. Знаменатель строки — число имеющихся root-статусов заявок в окне, а не вся очередь: заявка, для которой ещё нет первого root JSON, в знаменатель не входит. Все четыре строки вместе возвращают0/1/2 по фактическим исходам; постоянная draft-слепота снята. Только кандидат: перед монтажом — внешние ворота, весь пакет и совместный0.1.10 послеAP0.1.9.

Сборочный writer25d8 дополнительно закреплён независимым literal SHA256 usage-limits.json из принятойголовы25d80920: согласованное изменениеfixture+SOURCE.json больше не оставляет тест зелёным. Проверка детерминирована и не обращается в домГаммы; внешнее продвижение еёGitHEAD при неизменнойfixture она сама не видит. Перед сдачей автор отдельно сверяетdonorHEAD/blob сfixture.

Формы сверены с pinned WIRE Беты07207242/32ae983c: очередь — epoch-seconds, account_id — точный UTF-8 без trim, однослотовая карта не даёт полный PASS. Прибор читает исходные root JSON, не публичную проекцию без terminal. Legacy без terminal/retryUntil — слепота2. По наряду проверяются договорные пути по умолчанию; нестандартные mailDatabase в root profile и custom --index требуют отдельной зарегистрированной области, сюда не подмешиваются.


### Совместимость G 0.1.9 без JSON-policy

Два G-стенда различают известный поставленный `usage-producer.mjs` шлюза3.1.6 (SHA256 a8183a3530a3a37453aff2d8c641842436df5951ef4e3c4eb70686ffa2f7547c) и более новые JSON-aware сборки. В3.1.6 файл `usage-limits.json` не поставлялся, не импортируется и не создаётся при запуске; cap читается из фактического inline guard именно этого закреплённого исходника. Это не общий fallback на128MiB: другая сборка без обязательного JSON даёт слепоту, а JSON рядом с известной3.1.6 обозначает смешанную поставку и тоже даёт слепоту. Иные версии legacy без JSON этим pin не охвачены.

Для3.1.6 отсутствующий G-файл нейтрален: писатель создаёт его при первом запросе с descriptor. Существующий G проверяется с прежними порогами75%/100% и безопасностью metadata. `stend-g-source-contract.py` сохраняет сравнение фактического inline cap с AP G_WRITER_LIMIT; только initializer `prepareGatewayUsage` у3.1.6 имеет «нет предмета», без ложных56/56. Для schema1JSON/schema3 прежние договоры и56 initializer-проб сохраняются. Смена кода/policy во время договора остаётся слепотой.

Сборочная fixture `g-producer-316` содержит точные source/engine-process из master0f45b1e4, SHA/SOURCE рядом. Это не монтаж шлюза и не создание лишнего JSON в бою. Упрощённый R-reader не отменяет G-policy сегментного транспорта: в кандидате Гаммы5e9b2b7a при наличии gatewayTransport G-часть по-прежнему читаетusage-limits.json черезpolicyCli; плоский legacy-G и R-cursor обходятся без этого G-sidecar. Общая R-policy usage-runtime-policy.json — другой файл.


## 3.1.120: ночная диагностика второго учёта и приёмка покрытия (22.10.2026)

`dorabotki/stend-atsiklichnosti.sh` сохраняет10 проверок и код ненулевого `--check`, но объясняет его настоящим diff manifest.txt или предметным отказом guard. Справка «progon0» и расхождения тёзок сами по себе не объясняют код второго учёта. Неизвестная причина остаётся ненулевым исходом, с явно названной границей разбора.

В шаге6 `dorabotki/stend-pokrytiya.sh` живая разметка — данные часового watcher, а не неизменное предположение теста. Установленный watcher обязан молчать на полностью размеченной временной фикстуре. Его живые находки остаются поимённо в выводе и не глушатся этим стендом. Шаг7 использует прежнюю живую базу, всего36 проверок.

Ручная регрессия: `sudo -n python3 -B -m unittest discover -s test -p test_dorabotki_diagnostics.py -v`. Новый файл — `test/test_dorabotki_diagnostics.py`; он не добавляется в ночной перечень автоматически. Его шесть случаев подменяют только предметы и первый учёт, весь AT-код исполняется в private namespace. Полный ночной обход и монтаж не являются частью этой регрессии.
