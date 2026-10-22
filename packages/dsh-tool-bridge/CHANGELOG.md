# История изменений · Changelog

## 3.1.9 — 17.10.2026 · B-N-2097: формулировка резюме полосы и даты · streak summary wording and dates

- `src/index.js` `tekstRezyume`: вместо «оборвалась без объявления» / «осталось без объявления» — «итог агентом не объявлен — см. ответ хода». Отсутствие объявления значит только, что агент не позвал закрытие полосы, а не что работа потеряна (разбор Зари 17.10 02:47Z: закрыто агентом 0 из 75, работа сделана в 3 из 3 сводок суток).
- Время полосы: начало и конец в разных ЛОКАЛЬНЫХ сутках зоны `heartbeatDayZone` — обе полные даты, время и зона (`14.10.2026 09:30 (Europe/Moscow)`); в одних сутках — как прежде, «ЧЧ:ММ». Прежде полоса Анны 14.10→16.10 печаталась «с 09:30 до 09:30». Сутки судит та же `dayKeyFactory`, что и счётчики heartbeat.
- Логика heartbeat, полосы и объявления не менялась; соглашение `heartbeat_close` в своды не вводится.
- `test/stend-rezyume.mjs`: 32 → 38 проверок — фиксированная строка, отсутствие прежних слов, 14.10→16.10, граница полуночи по локальной зоне, разные сутки UTC при одних московских; прежние проверки текста переведены на новую строку.
- EN: "no declaration" now reads "outcome not declared by the agent — see the turn reply"; when start and end fall on different local days of `heartbeatDayZone`, both full dates, time and zone are printed. Heartbeat logic unchanged.

## 3.1.8 — 15.10.2026 · B-N-2061: покрытие копий правок составом

- `test/stend-publikacii.mjs`: вместо сравнения числа файлов src/+test/ с полным составом проверяется каждая найденная копия правки: её имя или содержащий каталог не должны входить в `files`. Один признак `.bak|.orig|.tmp|.limits` применяется к составу и диску; вложенные копии также учитываются. Записи-каталоги разворачиваются в файлы для остальных проверок стенда, а не читаются как текст.
- Непубликуемая копия — зелёное; покрытая именем/каталогом — FAIL с путём; без копий — прежнее «НЕ ПРИМЕНИМО». Десять CLI-проб на настоящих файлах включают границу соседних каталогов, четыре вида копий и отказ обхода за физическим корнем через ../ или внешнюю ссылку. Код `src/` и зависимости не менялись, подъём копий не требуется.
- EN: Check each edit backup against declared file/directory coverage, not unrelated file totals. Both checks share the backup predicate; directory declarations and nested backups are tested. No runtime changes or restart.

## 3.1.7 — 15.10.2026 · stend-heartbeat: машинная метка «не применимо» для ворот · machine-readable not-applicable mark (Заря; B-N-2062 шаг 2, наряд Забавы 04:53Z)

- `test/stend-heartbeat.mjs`: к каждой строке «НЕ ПРИМЕНИМО» (простой сессии, раздел Г) — строка `STEND-NEPRIMENIMO: <проба>: <причина>` с начала строки; в имени пробы «: » → « — » (двоеточие с пробелом отделяет пробу от причины). Обход ≥ 3.1.65 несёт её в ворота, ворота ≥ 3.1.27 дают СЛЕПОТУ, если раздел Г не измерен ни на одной копии (LOW Вениамина к 3.1.5). Код стенда и счёт проверок прежние. Только тестовый файл — копии поднимать не нужно. · Each not-applicable line is followed by a `STEND-NEPRIMENIMO:` mark for the walker and release gate; exit code and probe count unchanged.
- `stend-publikacii.mjs` метку НЕ печатает: его «не применимо» стоит на всех копиях по устройству — ворота давали бы слепоту всегда.

## 3.1.6 — 15.10.2026 · B-N-1983: содержимое загруженного src вместо mtime

Рабочий кандидат B-N-1983 перенесён поверх принятой Зари 6ada0b8c отдельным выпуском 3.1.6; её запись 3.1.5 сохранена. src и целевой читатель побайтно равны принятой fc2b086b.

- SHA256 src/index.js фиксируется при import и печатается при apply с PID и import-time подписью. cel-mosta сверяет содержимое с квитанцией текущего процесса/подъёма; mtime кода больше не признак «другой код». Домонтаж test/ и смена только номера манифеста не требуют нового подъёма для этого стенда.
- Чужой PID, нет/битый/противоречивый SHA, смена процесса и недоступный журнал дают СЛЕПОТУ; старым процессам без квитанции нужен первый назначенный подъём. Разные байты — FAIL, возврат — зелёный. Формат файла журнала обходчика с unit/start сохранён.
- Новый stend-cel-soderzhimoe: настоящий модуль и читатель, контроль import→правка→apply, порча/возврат содержимого, реальный git archive после test-only commit, версия манифеста, процесс/журнал. Отпечаток не охватывает зависимости и прочие src-файлы; YAML mtime-проверка не менялась.

Loaded-source SHA256 is captured at import and emitted at apply with PID and the loaded package signature. cel-mosta uses that receipt instead of code mtime; missing/ambiguous evidence stays blindness. Test-only deployments retain green; a new isolated integration stand exercises mutation/restoration and git archive.

## 3.1.5 — 15.10.2026 · стенды: «не применимо» вместо вечной слепоты · stends: "not applicable" instead of permanent blindness (Заря; наряд Забавы 03:00Z, B-N-1984 + B-N-1988)

- `test/stend-heartbeat.mjs` (B-N-1984, находка Искры): журнал сессии читается и разбирается ДО суда о возрасте. Целый журнал `session.v4.jsonl.zstd` старше суток — простой сессии: две пробы живого журнала «НЕ ПРИМЕНИМО» с числом часов, код не 2 (10.10: varvara 32.4 ч, marc 24.3 ч слепили ворота VYPUSK_KOPII; 15.10 varvara 33.3 ч — основа 2, кандидат 0). Нет файла, не распаковывается, не разбирается, старое имя журнала — поломка: СЛЕПОТА, как прежде. Счёт проверок прежний (53), «не применимо» в нём. · Live-journal probes: an intact current-format journal older than 24 h is session idleness — "not applicable" with hours, not blindness; missing/undecodable/unparsable/legacy-named journal stays blindness.
- `test/stend-publikacii.mjs` (B-N-1988): проба «на диске файлов больше, чем в составе» без копий правок (.bak-pre-, .limits) в src/ и test/ — «НЕ ПРИМЕНИМО» с причиной, а не слепота (на собранной копии и в дереве она не судит по устройству). · The disk-vs-manifest probe without edit backups is "not applicable", not blindness.
- Строка ИТОГО обоих стендов: в конце «, не применимо N»; начало строки прежнее. Код моста не менялся. · ИТОГО lines end with ", не применимо N"; bridge code unchanged.

## 3.1.4 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `author` — «Aleksandr Argelander» (единый автор семьи; лицензия MIT на его имя) · `author` set to "Aleksandr Argelander"
- README: строка «Версия · Version: 3.1.4» под заголовком. · README: version line under the heading.
- Код не менялся; номер 3.1.3 → 3.1.4 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.3 — 14.10.2026 · B-N-2027, две формы копии сайта

Установщик копии принимает прежний архив `candidate/app` + `deployment/manifest.json` и новый tar Марка `app` + `manifest.json`. Оба нормализуются в прежнюю раскладку установленной копии. Релиз, поимённый состав и SHA256 сверяются до замены; чужая/неоднозначная форма и небезопасные элементы архива дают именованный отказ. `kopiya-ostrov-installer.mjs` проверяет обе формы, порчи и возврат; отдельно — `app/../../../X`, символическую и жёсткую ссылку. При снятой защите пути тест обнаруживает созданный X вне каталога распаковки, даже если последующая сверка даёт отказ. Порчи проверяются внутри собственного TMPDIR без root.

Разбор не переносит режимы tar: временные обычные файлы создаются по umask. Итоговая копия, как прежде, нормирует все обычные файлы в 0644, каталоги в 0755; исполняемость источника не сохраняется. В tar Марка 08853c4a5871 (SHA b664b472…) 29 обычных файлов app имеют 0755 и станут 0644 в копии. Это копия для стендов, не сохранение режимов боевого приложения; SHA-манифест режимы не проверяет.

## 3.1.2 — 14.10.2026 · фикстура CRM под модель прав сайта 08853c4a5871

`test/api-fixture.py`: при `OSTROV_FIXTURE_CRM=1` профилю фикстуры, кроме `role=hospitality`, ставится `directions=["calculations"]`. С релиза сайта 08853c4a5871 права сотрудника — `permissions.effective(profile)` (не `leader` ⇒ только `directions`), а CRM требует `calculations` (`assistant_crm.py:80`); без поля `stend-crm-caller` получал «API HTTP 403: Нет права работы с расчётами и клиентами». Не `leader` — фикстура не даёт больше нужного. Старый сайт (cc31c0571fb3) поле не читает — стенд зелёный на обеих копиях.

Граница (LOW Вениамина): минимальность прав фикстуры держит только комментарий — стенд к избытку слеп (по коду `permissions.effective`: с `role=leader` или лишними `directions` 403 не возникает — прогоном не проверялось).

## 3.1.1 — правка кода по облачному аудиту №6 (A-N-1948; рабочий номер 1.3.44-a1948): сборка, запуск клиента Острова, хранилище ключей, at, асинхронные тревоги

Рабочий номер до общего выпуска 3.1.1. Документные находки аудита (№4, 10–17, 22, 23, 25, 26) — отдельной правкой.

- **Обёртки новых стендов** (ворота меток 10.10 11:54Z, `obyortka-krasneet`): `stend-ostrov-request-simlink`, `stend-trevoga-ne-blokiruet`, `stend-zapusk-python` — `proba` выбрасывала возврат тела (глухая); теперь краснеет на любом возврате, кроме `undefined`/`true` (как `sud()` соседних пакетов). Прибор: глухих 0, ловушек 0.
- **Стенды под аудит №9** (ворота меток 10.10 12:38Z, копия varvara): `stend-saved-plans`, `stend-crm-caller`, `stend-owner-private-context` подают `botId` фикстуры явно, `stend-mcp-input-schemas` — полную подставную настройку `ostrovApi`; прежде жили на снятом умолчании `botId` («Неверный ID бота», `ostrov_api` не ставился). `src` не тронут.

- **№1 HIGH.** devDependency `@deepseek-ai/cordis` 4.0.1 → 4.0.4 (версия платформы; peer `~4.0.4` у `@deepseek-ai/dsh-tools`): `npm install` в каталоге пакета больше не падает ERESOLVE.
- **№3.** Стенды image-transport, vygruzki, scoped-sessions без пакетов платформы — СЛЕПОТА 2 с причиной, а не падение кодом 1; image-transport берёт пакеты платформы из DSH_TEST_APP, если рядом с пакетом их нет (все из одного места).
- **№5.** `--initialize` хранилища ключей через путь с символической ссылкой на ещё не созданный каталог: каталог создаётся первым, пути пересчитываются через realpath — маркеры несут настоящий путь, самопроверка проходит. Стенд `test/stend-ostrov-request-simlink.mjs`.
- **№6.** Одноразовое `at` проходит ту же лесенку и часовой потолок, что `after_seconds` (срок пересчитан в задержку; поднятый — заменяет `at` на `after_seconds`); неразборчивое `at` — отказ. Пробы в `test/stend-heartbeat.mjs` (49 → 53), `docs/GUARDS.md` RU/EN.
- **№7.** Тревоги отправщика (`alertCommand`) — асинхронный `execFile`: зависший отправщик не держит event loop процесса DSH до 30 с; место выдержки занимается сразу и возвращается при отказе. Стенд `test/stend-trevoga-ne-blokiruet.mjs`; подмены в stend-heartbeat, stend-otmetki-posle, stend-p13-novyj-raspisatel, ожидание квитанции в stend-hourly-delete.
- **№8.** Python 3 для клиента Острова — из PATH процесса DSH (`python3`), а не по абсолютному пути интерпретатора; отказ запуска интерпретатора — известный отказ «запрос не отправлен», а не «исход не установлен».
- **№9.** `ostrovApi`: при `enabled` обязательны `baseUrl`, `keyFile`, `botId` (схема и проверка при установке); умолчания частной сети авторов удалены из JS и Python (`ostrov_api.py`: аргументы обязательны, CLI получил `--bot-id`). Стенд `test/stend-zapusk-python.mjs` (№8, №9).
- **№9, дополнение (находка Авроры, слово Забавы 10:56Z).** Ошибка настройки `ostrovApi` больше не роняет весь мост: `apply` перехватывает отказ `installOstrovApi` — инструмент `ostrov_api` не ставится, в журнал строка «[dsh-tool-bridge] ostrovApi НЕ установлен: <поле> обязателен …», прочие инструменты живут (стенд `stend-ostrov-bez-polya`: три поля пустыми по одному, исправный конфиг, `enabled=false`). Все проверки `installOstrovApi` стоят до регистрации — полу-установки нет; отказ после регистрации (сейчас таких нет) этим не ловится.
- Доки (Аврора, ветка a1948-audit06-avrora): README RU/EN, SETTINGS, GUARDS, OSTROV-REQUEST-RECOVERY — по коду этой записи; `test/stend-ostrov-bez-polya.mjs` внесён в `files` (иначе `npm pack` его не брал и стенд не доезжал до копий).
- **№19.** `releaseCreate` снимает ровно одну метку резерва.
- **№20.** Ошибка инструмента в журнале — те же 500 знаков, что в ответе, и полная длина.
- **№21.** Предел раундов create_goal считается один раз.
- **№24 — принятый риск.** `src/ostrov-site-turn.js` — заготовка (не импортируется), помечена в шапке; поставляется ради своего стенда, который гоняет ночной обход.
- **№18 — не подтверждено.** Выдача и погашение пропусков на живой платформе ключуются одним id (журналы iskra/varvara: 4 пары из 4).
- **№2 HIGH.** `test/stend-publikacii.mjs` по слову владельца 09.10 («имена машины, пакетов, агентов и пути — не находка; ищем секреты»): сняты классы «адреса установки» и «объяснение абсолютных путей». Осталась переносимость — внешняя команда жёстким путём в КОДЕ (.js/.mjs/.cjs/.py/.sh); пути в тексте, примерах и CHANGELOG не судятся; первая строка `#!` через env — переносима. `tools/kopiya-ostrov-api.sh`: `#!/usr/bin/env bash`, каталог копии — обязательный третий довод (умолчания-пути машины нет). Пробы на копии: жёсткий путь интерпретатора в `spawn` и `#!/bin/bash` — расхождение 1, возврат — 0. Не ловит: жёсткий путь в файлах вне кода (.md, .json, .yml) — их предмет текст, а не вызов; вызов, собранный из частей строки. Комментарии `//`, `*`, `/*` не судятся, как и прежде; строки `#` в .py/.sh судятся.

Code fixes from cloud audit #6: dev install no longer fails ERESOLVE (#1); platform-dependent stands report blindness instead of crashing (#3); request-key store initialization through a symlinked path (#5); one-shot `at` now goes through the ladder and hourly ceiling (#6); asynchronous alert sending (#7); Python 3 from PATH and a known refusal when it cannot start (#8); ostrovApi requires baseUrl/keyFile/botId, private defaults removed (#9); #19–21. #24 accepted risk, #18 not confirmed live. #2: the neutrality stand drops the install-address and absolute-path-explanation classes (owner decision: paths and names are not findings); hard-path commands in code still fail; kopiya-ostrov-api.sh uses env bash and requires the target directory. Working number until the common 3.1.1 release.

## 1.3.43-b1919 — три стенда судят предмет, а не среду и не мёртвый файл (B-N-1919) · код моста не менялся

Мост Варвары (линия b1690+, поверх 1.3.42-b1898). Правки только в `test/`.

- `test/stend-heartbeat.mjs`: живой журнал сессии ищется под обоими именами — `session.jsonl.zstd` и `session.v4.jsonl.zstd` (платформа 0.2.0-rc.2 пишет второе), свежайший по mtime. Журнал старше 24 ч — СЛЕПОТА с возрастом: сутки — окно счёта «за сутки», в более старом файле событий текущего дня нет, и «0» по нему был бы молчанием мёртвого файла. Прежде у агентов со старыми сессиями стенд брал журнал, который больше не пишется (замер 09.10: от 30.09), и давал зелёное. Цена: простой агента дольше суток — СЛЕПОТА (честно: мерить нечего).
- `test/stend-cel-mosta.mjs`: при `MOST_ZHURNAL_YUNITA=<файл>` журнал службы читается из файла, который снимает обходчик (учётке без чтения журнала — гостевому агенту — группу systemd-journal не даём, решение 04.10); первая строка файла — `#MOST_ZHURNAL_YUNITA <юнит> <ActiveEnterTimestamp>`, иная — СЛЕПОТА (файл о другом подъёме). Без переменной — прежний `journalctl`. Не ловит подмену файла между снятием и чтением.
- `test/stend-publikacii.mjs`: каталог исполняемых ищется с якорем — перед ним не должно быть `[A-Za-z0-9._-]`. Прежде подстрока ловила относительный путь дерева (генератор реестра в пакете a2a-bus, запись 1.3.41) как внешнюю команду: находок 12 → 11, остальные 11 — прежний класс (адреса установки, жёсткие пути, объяснённые абсолютные). Не ловит после правки: абсолютный путь к каталогу bin вне системных — его видят проверки адресов и абсолютных путей.

Three stands judge the subject, not the environment or a dead file: stend-heartbeat finds both session journal names and is BLIND on a journal older than 24 h; stend-cel-mosta can read the unit journal from a file snapshotted by the runner (MOST_ZHURNAL_YUNITA, header-checked); stend-publikacii anchors executable directories (a relative tree path no longer counts as a hard-path command). Bridge code unchanged.

## 1.3.42-b1898 — история восстановлена (A-N-1882 F04), код не менялся (A-N-1898)

Мост Варвары (линия b1690+, поверх 1.3.41-b1880). Номер поднят только потому, что CHANGELOG метки 1.3.41-b1880 разошёлся с деревом: F04 (коммит 1c6d7d6f2) дописал раздел «Восстановлено по истории git». Копий на 1.3.28 (линия most-1.3.28-b1882) F04 не касался — им выпуск не нужен.

## 1.3.41-b1880 — одно правило OSTROV_API для генератора и клиента (A-N-1880) · снята мёртвая диагностика vmestimostChasa (A-N-1882 F05) · +4 пробы dostavkaNovoj (A-N-1883)

Мост Варвары (линия b1690+, поверх 1.3.40-b1857). F05 для копий на 1.3.28 — выпуск 1.3.28-b1882.

- A-N-1880 (F02 Гаммы; код Авроры; ворота Вениамина): `src/ostrov_api.py` 717743f4 → 3368858e — одно правило OSTROV_API: только `http://`,
  знаки узла `[A-Za-z0-9.[]:-]`, один «/» в конце, порт 1..65535 и не пустой, botId 1..16 цифр; генератор (`a2a-bus/bin/agent-registry`) сужен
  до клиента, клиент отвергает то же, что генератор. Чего НЕ ловит: адрес на ответ не проверяется — правило судит форму строки, не живость узла.
- A-N-1882 F05 (Михалыч; ворота Вениамина): из `src/index.js` снята мёртвая `vmestimostChasa` (остаток после 0.3.27: её вызов ушёл из текста
  часового потолка в cc9e5d5f6); `test/stend-rezhimov.mjs` −3 пробы, ZHDYOM 42 → 39 (A-N-1883 ниже — снова 43). Поведение не меняется.
- A-N-1883 (Михалыч; ворота Вениамина 21:4xZ): `test/stend-rezhimov.mjs` +4 пробы на договор `dostavkaNovoj` — доставка расписателя
  по `source.kind`, не по тексту и не по типу; ZHDYOM 39 → 43. Граница (Михалыч): сутки и turnLedger стенд не вырезает — договор там
  проверен через общую функцию, а не через места вызова.
- Хвост к 1.3.39-b1838 (условие Вениамина, П7 Альфы :56 и :62 — в запись 1838 не вошло): защита контекста приватного Telegram НЕ ловит
  подмену доверенной БД/канала; влияние старых агентных писем в истории; HTTP-роль и данные сервера вне контракта; негодный ввод
  без порчи исходника (проба не делалась). Неизвестные исходы owner `plan.create` до монтажа 1838 нельзя восстанавливать слепым повтором —
  сначала сверить прежний результат.

## 1.3.40-b1857 — несходимость «свидетель > журнал» не гасит самопробуждение (B-N-1857) · тесты CRM без байткода (B-N-1858)

Мост Варвары (линия b1690+, поверх 1.3.39-b1838). Та же правка B-N-1857 для копий на 1.3.28 — выпуск 1.3.28-b1857.

- B-N-1857 (код Авроры): `src/index.js` 91649028 → 9db1df2d (+41/−3): новая `reshenieSvidetelya` и константа `RASHOZHDENIE_TERPENIE_MS`
  (15 мин). Свидетель (история доставок) опережает журнал сессии меньше 15 мин с первого замеченного — НЕ остановка и НЕ тревога
  (строка в журнал), суточный счёт по большему из двух; держится 15 мин и дольше — как прежде: «счёт пробуждений НЕ ВИДЕН», гашение.
  Свидетель не прочитан — как прежде, сразу. Случай: Заря 08.10 14:51:32Z — история 5, журнал 4, сошлось через 96 с.
  `test/stend-b1857-terpenie.mjs` (новый, Б1–Б9, e15667e1; вписан в `files`); `test/stend-p13-novyj-raspisatel.mjs` 6f2991d4 → b2046076
  (образец Р7 `if (svid?.slep && resh.stop) {`).
  Чего не ловит: настоящую слепоту журнала первые 15 мин (предел «подряд» не видит доставок свидетеля; суточный — видит);
  перезапуск процесса обнуляет отметку начала.
- B-N-1858 (кандидат Авроры; ворота Вениамина ГОДНО): тесты не пишут байткод в каталог моста. `test/test_crm_sdk.py` b4c90115 → f5241276 и
  `test/test_crm_http.py` c5ea5a89 → 8c46b223 (+1 каждый: `sys.dont_write_bytecode=True` до импорта src/ostrov_api);
  `test/stend-ostrov-api.mjs` ccea8032 → 48ab87d5 и `test/stend-saved-plans.mjs` c828b70a → f853095e (+1/−1: `-B` у api-fixture.py).
  Случай: 08.10 08:48:25Z ручной прогон test_crm_* голым python3 в боевой копии Варвары оставил src/__pycache__/ostrov_api.cpython-312.pyc.
  Мост сам зовёт раннер с -B (ostrov-api.js:61) — не менялся. Чего не ловит: прочие питоновые запуски рукой; правило — ручные прогоны на копии.
- Чего не ловит 1.3.39-b1838 (по условию ворот; из П7 Альфы, sadik:/opt/coders/alfa/workspace/B-N-1838-20261008/delivery/dlya-veniamina-B-N-1838-P7.md):
  (1) ОСТАТОЧНЫЙ РИСК: прежний owner `plan.create` с actor=null после перехода на staff меняет requestKey — тот же запрос после
  cutover создаёт ДРУГОЙ ID (две записи; подтверждено независимым SQL), дубль не ловится;
  (2) приватный контекст владельца — только для чатов из настройки профиля (`mergeChatIntoA2A` 158901453, `a2aSession=a2a`);
  прочие allowedUsers им не покрыты;
  (3) живой признак не снят стендом: журнал моста пишет только `ostrov_api: успех` без operation — различить вызов владельца по
  журналу нельзя, только по запросу владельца после монтажа.
- semver: суффикс `-b1857` по semver — пре-релиз (1.3.40-b1857 < 1.3.40); реестр сверяет отпечаток, а не порядок номеров.

## 1.3.39-b1838 — приватный Telegram context в объединённой рабочей сессии

- workerUpdate допускает pin a2a только в сравнении маршрута с chat.id/gost-chat.id. Прежние проверки текущего поколения/хода, всех receipts tg, private, from.id = chat.id = route_key, is_bot=false, отсутствия sender_chat и одного отправителя сохранены; смешанный ход с агентным письмом отказывает до HTTP.
- Роль сотрудника по-прежнему подтверждает API по активной Telegram-привязке. TG-гостю сохраняется публичная staff-проекция без повышения; Site остаётся только catalog/objects/quote.
- Добавлен сквозной стенд владельца 158901453 в a2a: личка, агентный/смешанный ход, прежние guest/Site границы, негодные receipts, afterHTTP guard и настоящее ротированное поколение.

## 1.3.38-b1825 — публичный расчёт гостю сайта

- Site получает ostrov_api в каталоге моста и согласованной native политике канала 2.5.114-b1825. Caller допускает только catalog/objects/quote; identity, CRM, сохранённые планы и записи отказаны до HTTP.
- Роль guest выводится из текущего Site маршрута; модель не назначает actor/context/requestKey. После ответа повторно сверяются корневой агент, поколение, turn и Site route.
- Telegram-путь и allocator прежних ключей сохранены. PDF/send сайту не подключены; публичный quote даёт текстовый расчёт без постоянной ссылки.



## 1.3.37-b1690-p16 — рабочая CRM-интеграция, Site пока закрыт

- CRM schema/validation/SDK/runner и caller: публичные staff-поля гостю, остальные операции подтверждённому сотруднику; private Telegram context обязателен для CRM. Guest не повышается в staff.
- client.create, client.assign и plan.link используют тот же savedKey/guard B-N-1690; прежний digest и legacy lookup сохранены. Потеря известного state отказывает до HTTP; процедура bootstrap Альфы обязательна.
- SDK нормализует отсутствующий messenger.userId после self-Telegram, сохраняя настоящие привязки; caller повторно проверяет turn после ответа и отказывает ротированным Site-маршрутам.
- Финальный навык Марка r2 включён с явной пометкой о неподключённом Site. Namespace/UUID/high-water/restore требуют отдельной приёмки; этот пакет их не включает.
- Стенды: сквозные CRM caller/HTTP, исходная матрица восстановления Альфы, native/MCP и регрессии; статус полного набора и ограничения окружения — в П7.

## 1.3.37-b1690 — рабочая версия B-N-1690, не выпуск

plan.create/plan.edit/client.save проверяют подготовленное состояние ключей до HTTP. Потеря целого хранилища, прежнего ключа или его резервирования возвращает OSTROV_API_RECOVERY_REQUIRED; чтение не блокируется. Прежние случайные ключи сохраняются, новые зависят от неизменного epoch и прежнего canonical digest. Это предотвращает дубль при согласованном откате локальной копии post-cutover записи, пока сохранён серверный журнал идемпотентности.

Перед включением требуется явная подготовка существующего state и workspace при остановленном writer: tools/ostrov-request-state.mjs; порядок и границы — docs/OSTROV-REQUEST-RECOVERY.md. Автоматической инициализации/сброса нет. Wire DTO и разрешённые операции не меняются; guest.requestHuman/frameRevision не вводятся.

## 1.3.37 — B-N-1740, сверка release копии API Острова с живым сайтом

Только стенды. При заданном `OSTROV_API_MANIFEST` (режим обходчика) `test/ostrov-api-kopiya.mjs` перед `stend-ostrov-api` и `stend-saved-plans` обязательно сверяет `release` копии с живым API: GET `OSTROV_API_HEALTH` (`http://192.168.99.3:4215/internal/v1/assistant/health`, без подписи — из ответа берётся только `release`). Не задан адрес, не HTTP 200, ответ > 4 КБ или не JSON, нет `release` из 12 hex, сайт недоступен — СЛЕПОТА с причиной (код сети из `cause`); `release` ≠ манифесту копии — СЛЕПОТА «копия отстала от сайта: копия X, сайт Y, обнови установщиком». Чего не ловит: сайт, отдающий чужой `release` (ответ не подписан), и правку файлов на vps-ru без смены `release`. Находка Искры (Вениамин 08:13Z): без копии API Марка (`MARK_TEST_APP` не задан или каталог без `server.py`) `stend-ostrov-api` теперь слепнет кодом 2 с причиной, как `stend-saved-plans`, а не падает кодом 13 на «No module named 'server'».

Stands only: in walker mode the copy check also compares the copy release with the live API health (release field only); unreachable/invalid health or a mismatch is an explained blind result.

## 1.3.36 — копия API Острова для стендов stend-ostrov-api и stend-saved-plans

Находка Забавы 07.10: у двух стендов нет читателя — ночной и недельный обходы их не зовут (07.10: 0 упоминаний в журналах обоих), а MARK_TEST_APP указывал в рабочий каталог Марка, который уходит при уборке. Код моста не менялся.

- `tools/kopiya-ostrov-api.sh <архив релиза Марка> <release с vps-ru> [каталог]` — устойчивая копия API в `/opt/agent-plugins-stend/ostrov-api` (root, 0644/0755): `manifest.artifact` релиза обязан совпасть с `release` из `/_retreat/health` боевого API, состав `candidate/app` и суммы всех файлов — с `deployment/manifest.json`; иначе отказ кодом 2, копия не тронута. Чужой каталог не трогается (ворота Вениамина 08:04Z): последнее звено пути — `ostrov-api`, существующие каталог и `.prezhnyaya` — только прежние копии (`ISTOCHNIK`, `manifest.json`, `app/`, не ссылки), ссылки и устройства в `app` — отказ; всё до первой записи. Замена через сборку рядом и `mv`, прежняя — `.prezhnyaya`; `ISTOCHNIK` — архив, его сумма, релиз, время.
- `test/ostrov-api-kopiya.mjs` — оба стенда при заданном `OSTROV_API_MANIFEST` сверяют копию с манифестом до запуска: состав или сумма ≠ манифесту → СЛЕПОТА (код 2) с именем файла и сумм. Без переменной — как прежде.

Stable Ostrov API copy for the two bridge stands: an installer that checks the release id against live vps-ru health and every file against the release manifest, and a pre-run copy check (OSTROV_API_MANIFEST) that turns a drifted copy into an explained blind result.

## 1.3.35 — стенд stend-ostrov-api: политика канала по решению владельца

Только стенд, код моста не менялся. Проба «installed channel-policy characterization: new API hidden (requires owner delta)» ждала, что гость Telegram НЕ видит `ostrov_api`, и краснела всегда: установленная политика канала (`site-policy.js`, `TG_GUEST_TOOLS`) с решения владельца 06.10 22:33 выдаёт гостю `ostrov_api`, и в бою гость его вызывает. Снимок политики в стенде устарел, а не код. Новая проба одна для установленной и парной политики: гость видит `ostrov_api`, чтения и quote работают (HTTP и native), роль ответа `guest` и в API не уходит проба `staff-private`, `client.read` гостя идёт с его приватным контекстом, `client.read` без приватного update (групповой чат) отказан мостом до API; сайт API не видит. Порчи: политика скрывает API гостю, гостю снова идёт проба staff-private, сняты обе преграды client.* — каждая краснеет на этой пробе.

Stand only, bridge code unchanged: the stale «guest must not see ostrov_api» snapshot is replaced by the owner policy of 06.10 — guest sees ostrov_api as role guest without a staff-private probe; client.* only with a real private update; site has no API.

## 1.3.34 — B-N-1699, выпуск рабочей редакции моста Варвары

Выпуск в дерево того, что в бою у Варвары с 07.10 00:29 МСК как 1.3.33-b1700 (слово владельца 06.10 16:57: сначала рабочая версия, потом выпуск). Код побайтно равен бою; отличаются только номер и этот раздел. По пунктам:

- **B-N-1698 этап 1, фильтр схем MCP** (`src/index.js`, `mcpSchemaRefusal`): отбрасывается только присутствующая схема не-объект или с верхним `type` ≠ `object`, каждый отказ — 🔴 в журнале; отсутствующая схема получает `{type:object, properties:{}}`. Верхние `oneOf/anyOf/allOf` у объектной схемы проходят (откат 19:11Z, рабочий `omega_store`); плоскость требуется только от собственной схемы `ostrov_api` (`test/stend-mcp-input-schemas.mjs`, три строки против 1.3.33 ослаблены намеренно).
- **B-N-1700, `ostrov_api` — десять операций**: identity, catalog, objects, quote, plan.create, plan.read, plan.edit, client.read, client.save, plan.list (`src/ostrov-api.js`, `src/ostrov_api.py`, `src/ostrov-api-runner.py`, `src/ostrov-api-schema.json`, `src/ostrov-api-validation.json`). Записи (plan.create/plan.edit/client.save) — только с ключом повтора, который назначает код моста; client.* — только в текущем приватном Telegram-чате; Telegram userId в client.save назначает код, не модель.
- **`requestKeyDir`** (схема настроек `ostrovApi`): при `enabled:true` обязателен абсолютный каталог вне workspace, проверка и через ссылки; иначе отказ до HTTP. Прежние ключи (с флагом `allowClientOperations` и анонимные из ротированных бесед) восстанавливаются без второго сохранения.
- **Гостевые беседы `gost-`**: в 1.3.33 контекст Telegram гостю не передавался вовсе; теперь для приватного чата гостя, закреплённого как `gost-<chat>`, контекст передаётся (plan.create из текущего receipt), публичные чтения гостя остаются анонимными (`guest:true`).
- **Тексты**: навык `skill/ostrov-live-consultant` (SKILL.md — сохранённые расчёты, карточка гостя, адресный objects по id; references/operations.md, plans.md) и `docs/OSTROV-API.md`.
- **Стенды**: новый `test/stend-saved-plans.mjs` (201 строка, в `files`), `test/stend-ostrov-api.mjs`, `test/stend-scoped-sessions.mjs` (+проба «негодная схема скрыта, прямой вызов отказан, возврат»), `test/api-fixture.py`.

Release of the working bridge edition running for Varvara since 07.10 as 1.3.33-b1700: MCP schema filter (B-N-1698 stage 1), ostrov_api with ten operations and bridge-owned request keys (B-N-1700), mandatory requestKeyDir outside the workspace, guest `gost-` private context, skill/doc texts, stands. Code is byte-identical to the live copy; only the version and this section differ.

## 1.3.33-b1700 — рабочая редакция поверх B-N-1698, не выпуск

- Сохранены правило схем B-N-1698 и исправление omega_store после отката19:11Z; рабочий номер отделяет этот состав от1.3.33-b1698 и боевого/откатного1.3.33.
- ostrovApi предлагает десять операций с сохранёнными расчётами и карточками; client.read/save и plan.list включены по слову владельца22:33МСК, без клиентского выключателя. application/бронь закрыты контрактом API.
- При ostrovApi.enabled:true схема настроек требует requestKeyDir: абсолютный каталог вне workspace. Умолчания под cwd нет; отсутствие/относительный/внутренний путь дают отказ до HTTP. Назначенный путь профиля /opt/varvara/.ostrov-api-requests.
- Контекст/ключи назначает код, старые requestKey и анонимные сохранения восстанавливаются без копий; client.save сохраняет прежние Telegram ID из client.read. Это рабочий состав без выпускной метки.

## 1.3.33-b1698 — рабочая редакция B-N-1698, не выпуск

- Мост исключает только присутствующую схему не-объект/type≠object; отсутствующая схема получает прежнее object/properties умолчание. Каждый отказ назван в 🔴.
- Откат 19:11Z: прежний общий запрет верхних комбинаторов убирал рабочий omega_store. Type:object с oneOf/anyOf/allOf проходит по наблюдению движка0.3.289; правило внешнего API модели на общий MCP-набор не перенесено.
- Рабочий номер отличает код в памяти процесса от боевого/откатного1.3.33. Выпускной номер и метка — отдельный шаг после монтажа.

## 1.3.33 — B-N-1695: схема ostrov_api для Claude/MCP

- Модель получает inputSchema type:object без верхнего oneOf/anyOf/allOf; четыре публичные операции, params по умолчанию {}.
- Прежний строгий oneOf сохранён во внутренней проверке до HTTP: несовместимые params, private/запись и модельная личность по-прежнему отказываются.
- stend-mcp-input-schemas проверяет все схемы возвращаемых наборов моста SDK из окружения шлюза и ограничения верхнего уровня; порча на старую схему различается по имени ostrov_api.

## 1.3.32 — 06.10.2026 (B-N-1695, Гамма r5 + Бета Ш5; номер и запись — Забава)

- Инструмент ostrov_api: прямой вызов API сайта «Острова» (catalog/objects/quote/identity, только чтение), единый клиент Марка ostrov_api.py; включается только ostrovApi.enabled:true.
- TG-гостю (telegram-gost-*): telegram_send_file, telegram_make_pdf, ostrov_api; сайт без изменений.
- Содержимое кода = кандидат Гаммы r5 (tgz 5555e70c); изменены только номер версии и эта запись.

## Кандидат B-N-1695 Ш4 r5 — API8308, единый клиент

- Ровно четыре публичные операции CONFIRM0; гостю context не нужен и не выдумывается.
- Единственная HTTP/HMAC реализация — byte-exact Python клиент Марка26253bbd; мост — process/stdin adapter, canonical envelope.
- Настоящий worker update берётся из текущего coded input, роль решает API identity; без метаданных публичный путь остаётся guest.
- Старые12/private операции/обещания убраны из активной schema/справки/скилла.

## Кандидат B-N-1695 Ш4 r4 — представление signed zero

- API JSON -0.0 нормализуется только в0 при декодировании для canonical JSON dsh-tools; другие поля/суммы не пересчитываются.
- Различающая проба на настоящем quote с нулевой скидкой: сырой JSON содержит -0.0, native PDF отказывает; клиентский Q принимается. Порча/возврат15/15.

## Кандидат B-N-1695 Ш4 r3 — канал Беты, номер выпуска не назначен

- Общий TG-перечень моста: ostrov_api + telegram_make_pdf + telegram_send_file; сайт сохраняет прежний набор.
- Политика канала — только Бета18102c6; историческое предложение политики исключено из активного пакета.
- Различающая проба реальной регистрации Беты и моста: API quote всех трёх kind → PDF → текущий отправщик, native/MCP; Telegram upload подставной, без живой доставки.

## Кандидат B-N-1695 Ш4 — прямой API (номер выпуска не назначен)

- `ostrov_api`: чтение и три калькулятора через HMAC API Марка; контекст из текущих Telegram-квитанций, без аргументов личности модели.
- Явный opt-in `ostrovApi.enabled:true`; TG-гостевой allowlist отдельно от сайта. Предложенная дельта native политики канала приложена для сведения.
- Пробы native/MCP на настоящем API-коде и синтетических данных, порчи подписи/маски/политики с возвратом, понятный неизвестный исход и предел 15с.
- Скилл под инструмент, без запуска shell; номер пакета остаётся1.3.31 до решения координатора, это не монтажная метка.

## 1.3.31 — B-N-1645 и принятый стенд B-N-1669

В allowedToolNames для telegram-site-/telegram-gost- добавлен только zapomnit_dannye_gostya; pismo_rukovoditelyu и pamyat_dlya_gostej сохранены. Мост отдаёт пересечение этого закрытого перечня с живой областью сессии и проверяет допуск на прямом вызове; остальные имена не разрешены. Реализация нового guest-data инструмента и разрешение канала — Telegram/WIP Беты, мост его не создаёт. Принятый Вениамином стенд Авроры stend-gost-bez-zapisi (c817490a) перенесён побайтно и включён в npm files: оба гостевых префикса, закрытый перечень трёх одобренных имён, запретный класс записи/оболочки и настоящий bridge отказ bash при ошибочно широком scope канала. Живой descriptor с тремя именами появится после регистрации/допуска нового инструмента; fs/shell остаются запрещены.


## 1.3.30

B-N-1644: `src/scoped-sessions.json` — в `allowedToolNames` гостевых сессий (`telegram-site-`, `telegram-gost-`) добавлен `pamyat_dlya_gostej` (чтение СВОЕЙ памяти, только помеченное «для гостей»; инструмент dsh-pamyat-omega ≥1.1.33, настройка `gostyam`). Мост по-прежнему отдаёт гостю только пересечение со списком живого набора сессии: нет инструмента или канал его не разрешил — гость его не видит. Стенд `stend-scoped-sessions.mjs` — проверка `B-N-1644-gost-pamyat-dlya-gostej`.

B-N-1644: `pamyat_dlya_gostej` added to `allowedToolNames` for guest sessions; the bridge still exposes only the intersection with the session's live tool set.

## 1.3.29

B-N-1642: `src/scoped-sessions.json` — к `telegram-site-` добавлен префикс `telegram-gost-`: сессии гостей открытого Telegram-бота (канал `dsh-telegram-multiagent` ≥ 2.5.86) получают тот же узкий набор, что посетитель сайта (`pismo_rukovoditelyu`). Сессии `telegram-<id>` (владелец, свои чаты) не меняются. Стенд `stend-scoped-sessions.mjs`: гость, группа гостя и повёрнутая сессия гостя ограничены; соседний префикс `telegram-gostx-` — нет.

B-N-1642: scoped prefix `telegram-gost-` added for open-bot Telegram guest sessions; other Telegram sessions unchanged.

## 1.3.28 — перенумерация (A-N-1562): прежний 0.3.28, код не менялся · renumbering, code unchanged

## 0.3.28

Публикационный состав перепроверен: DOK/KOMM/KOD не содержит частных литералов. Исполнение0.3.27 сохранено побайтно; исправлен только анализатор стенда, чтобы env-свойство не считалось глобальной константой, а чтение YAML и строка limitsDir использовали один каталог из действующей настройки, переменной окружения или диагностического override.
Publication contents rechecked: DOK/KOMM/KOD contain no private literals. Version0.3.27 runtime remains byte-identical; only the diagnostic analyzer is fixed so environment properties are not mistaken for global constants and YAML reads and limitsDir logging use one directory from the effective configuration, environment, or diagnostic override.

## 0.3.27

Часовой предел охватывает все виды расписания; удаление требует deleted:true и повторяется при отказе на следующем конце хода. limitsDir и alertCommand задаются в config с нейтральными умолчаниями; YAML применяется при монтаже/перезапуске. Примеры стендов обезличены.
The hourly ceiling covers all schedule kinds; deletion requires deleted:true and failures retry on a later turn end. limitsDir and alertCommand use configuration with neutral defaults; YAML applies at mount/restart. Test fixtures are anonymized.

## Документация, без новой версии · Documentation, no new version

Документация RU+EN, схемы, таблицы настроек и двуязычные комментарии. Исполняемые токены и AST сохранены; нумерация и выпуск выполняются отдельно.
RU+EN documentation, diagrams, settings tables and bilingual comments. Executable tokens and AST are preserved; versioning and release are separate.

## Исторические версии · Historical versions

Ниже краткая техническая история без внутренних журналов монтажа и персональных идентификаторов. Это история исходников, не доказательство текущей установки.
The following is a concise technical history without internal deployment logs or personal identifiers. It records source history, not evidence of the current installation.

### 0.3.26

Пересечение scoped allowlist и исключение site-сессий из heartbeat; отзыв пропусков остаётся.
Scoped allowlist intersection and site-session heartbeat exclusion; ticket revocation remains.

### 0.3.25

Policy-префиксы scoped-сессий и проверки ограниченного каталога.
Scoped-session policy prefixes and restricted-catalog tests.

### 0.3.24

Image protocol1 с сохранённым вложением и строгими пределами транспорта.
Image protocol1 with stored attachments and strict transport bounds.

### 0.3.23

Динамические scoped tools и полный tools.execute для новых инструментов.
Dynamic scoped tools and full tools.execute for newly exposed tools.

### 0.3.22

Проверка выданного каталога на invoke; включение стендов в поставку.
Issued-catalog checks at invoke and inclusion of tests in the package.

### 0.3.21

Выдача native pamyat_ocenit.
Exposure of native pamyat_ocenit.

### 0.3.20

Выдача pamyat_po_smyslu и актуализация native schema.
Exposure of pamyat_po_smyslu and native-schema updates.

### 0.3.19

Схемы DSH0.2, schedule_update и cron guard.
DSH0.2 schemas, schedule_update and cron guard.

### 0.3.18

Поддержка snapshotEvents и новой доставки schedule; независимый свидетель.
snapshotEvents and new schedule delivery support; independent witness.

### 0.3.17

Проверки установки и предупреждения по памяти/расписанию.
Installation checks and memory/scheduling diagnostics.

### 0.3.16

Сверка слоёв политики и домов профилей в стендах.
Policy-layer and profile-home checks in tests.

### 0.3.15

Cordis development dependency для lifecycle test.
Cordis development dependency for lifecycle testing.

### 0.3.14

Ранняя очистка ctx.effect для mount/dispose/remount.
Early ctx.effect cleanup for mount/dispose/remount.

### 0.3.13

Упаковка post-success marker test.
Packaging the post-success marker test.

### 0.3.12

Исправление startup prefix и перечня integrity test.
Correction of startup prefixes and integrity-test inventory.

### 0.3.11

Отметки после успешной отправки и повтор неудавшейся остановки.
Post-success send markers and retries for failed stopping.

### 0.3.10

Проверка правки интервала по настоящему исходнику.
Adjusted-delay checks against actual source.

### 0.3.9

Выдача native pamyat_otnoshenie.
Exposure of native pamyat_otnoshenie.

### 0.3.8

Package/version prefix журнала.
Package/version log prefix.

### 0.3.7

Уточнение поставки и приёмочных проверок.
Package and acceptance-check refinements.

### 0.3.5

Слепота стенда сообщает недостающую предпосылку.
Inconclusive tests report their missing prerequisite.

### 0.3.4

Коды проверки проходят через общий runner.
Test exit codes propagate through the common runner.

### 0.3.3

Полный состав поставки и переносимые стенды.
Complete package inventory and portable tests.

### 0.3.2

Согласование стендов с рабочим кодом.
Alignment of tests with working code.

### 0.3.1

Fail-closed при потере источника событий.
Fail-closed behavior on loss of the event source.

### 0.3.0

Резюме автономной полосы.
Autonomous streak summaries.

### 0.2.0

Переименование внутренних файлов пакета; потребителям требуется обновить пути.
Renamed package-internal files; consumers must update paths.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке. · EN: Entries reconstructed from the git diffs of the named commits on 2026-10-08; these are not release numbers and not live measurements.

- `ce83e21be838` (2026-08-23) — Первая редакция пакета: плагин открывает точку входа на loopback и через шлюз подписки отдаёт модели стороннего движка инструменты платформы (цели, фоновые задачи, расписание) с описаниями и схемами, извлечёнными из пакетов платформы (`src/parity.json`, `src/schedule.json`, `tools/extract-*.mjs`). Доступ — по одноразовому пропуску на пару (агент, ход), который гаснет на `turn/end` или по `ticketTtlMinutes`; личность по проводу не передаётся. Настройки: предел постановки целей (`createLimit`, `createWindowMinutes`), порог `blocked` (`blockedAfterRounds`, сверка `tools/check-blocked-threshold.sh`) и пределы самопробуждения `heartbeat*` со счётом по журналу сессии; стенды `test-heartbeat.mjs` и `test-startup-lines.mjs`. · EN: Initial bridge: a loopback entry point carrying platform goal, job and schedule tools with extracted schemas to an externally driven model, one-time per-turn tickets, goal-creation and blocked-threshold limits, and session-log-based self-wake limits.
- `d3bee4ee6b44` (2026-08-23) — `test-startup-lines.mjs` первым делом проверяет, что всё обещанное в `package.json` (`files`, `main`, `dsh.bundle.patch`) есть на диске, и называет недостающий файл; без `cordis.patch.yml` стенд заканчивается вердиктом, а не падением. `src/index.js` не менялся. · EN: The startup-lines test now first checks that every file promised by package.json exists on disk; src/index.js is unchanged.
- `7ab673a2197c` (2026-09-01) — Переименованы внутренние файлы: `src/parity.json` → `src/paritet.json`, `src/schedule.json` → `src/raspisanie.json`, `tools/extract-*` → `tools/izvlech-*`, `test-*.mjs` → `test/stend-*.mjs`; стенды получили коды исхода 0/1/2. Пределы самопробуждения и целей перенесены из настроек плагина в YAML-файлы каталога пределов (`AGENT_LIMITS_DIR`, файл агента по `limitsAgent` поверх общего) с источником каждого значения в строке подъёма; нет файла, файл битый или нет модуля `yaml` — берётся самый строгий набор. Добавлены режимы интервала `lesenka` (пауза растёт ступенями, `after_seconds` одноразовых правится вверх) и `ravnomerno`, потолок пробуждений за скользящий час, вывод противоречий настроек и длины полосы; `heartbeatHumanKinds` по умолчанию `[user, a2a]`, в манифесте этой редакции нет `files`, `repository` и `dsh.bundle.patch`. · EN: Package-internal files were renamed, self-wake and goal limits moved into a YAML limits directory with per-value sources and a strictest fallback, and interval modes, a sliding-hour ceiling and configuration-contradiction reporting were added.
- `e68e8056a0a5` (2026-09-02) — Из противоречий настроек убрана проверка «часовой потолок недостижим»: потолок ограничивает и цепочки одноразовых напоминаний, у которых шага нет; вместимость часа при текущем шаге печатается при подъёме как сведение (`vmestimostChasa`), потолок назван «на сессию». Мера «подряд» в журнале названа «без внешнего слова» с перечнем видов источника из настройки; в комментарии названа граница — потеря журнала сессии молча обнуляет все три счётчика. В `package.json` появился явный перечень `files`. · EN: The "hourly ceiling unreachable" contradiction was removed (one-shot chains have no step), labels now say "without an external word" and list source kinds, the session-log boundary is documented, and package.json gained an explicit files list.
- `f13f8bdc90cd` (2026-09-03) — `test/stend-publikacii.mjs` получил раздел абсолютных путей: найденные в составе пути сверяются с перечнем объяснённых исключений; красное — необъяснённый путь, объяснение без пути и пустой поиск (контроль зрячести). В `package.json` peerDependency `@deepseek-ai/schemastery` сужена с `*` до `^3.18.1`, добавлена devDependency `yaml` 2.9.0. · EN: The publication test gained an absolute-path check with explained exceptions and a visibility control; the schemastery peer range was narrowed to ^3.18.1 and yaml 2.9.0 added as a devDependency.
- `8274fe45e3c5` (2026-10-08) — Корень стенда `test/stend-vygruzki.mjs` получил службу `tools` с пустым реестром (`get` → undefined, `wireSchemas` → пустой список): мост объявляет `inject` `tools`, и без неё cordis не вызывал `apply`, так что пробы монтажа и выгрузки мерили несостоявшийся монтаж. Код моста не менялся. · EN: The unload test root now provides an empty tools service, without which cordis never called apply and the mount/unload probes measured a mount that did not happen; bridge code is unchanged.
