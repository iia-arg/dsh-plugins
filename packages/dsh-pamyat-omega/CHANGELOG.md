
Принятая политика исключения сохранена; удалён внутренний непубликуемый файл и исторические подписи стендов, SDK-путь явно задаётся окружением. Поведение памяти не меняется.

Retain the accepted exclusion policy; remove internal unpublished notes and historical test labels, and supply the SDK path explicitly through the environment. Memory behavior is unchanged.

# Следующая версия · Next release

Без политики исключения сессий ядра — отказ обращения к памяти с причиной; восстановление политики разрешает следующий вызов. Версия выпуска назначается отдельно.

Without core session-exclusion policy, refuse memory access with a reason; policy recovery permits the next call. The release version is assigned separately.

# История изменений · Change history

## 3.1.4 — 22.10.2026 · документация: npm-снимок и локальное ведение

- README/README.en: npm хранит снимок 3.1.2; после публикации пакет ведётся локально (решение владельца 14.10) — Бета 4758c00f, 15.10.
- CHANGELOG: снят устаревший верхний заголовок «# 0.1.0-alpha.* · …» — Гамма 755cfe6f, 22.10.
- Код пакета не менялся. Повод: метка v3.1.3 не давала байты master по документации (B-N-PUBL-METKI, находка Беты).

## 3.1.3 — 14.10.2026 · npm 12: состав публикации через `npm-sostav` (B-N-2048)

- `test/stend-readme.mjs`: вывод `npm pack --dry-run --json` разбирает помощник `npm-sostav --files` (`dsh-pribory` 3.1.2) —
  одним правилом для npm 11 (массив) и npm 12 (объект); прежний `JSON.parse(…)[0].files` под npm 12 слеп. Под npm 11.17.0
  и 12.2.0 стенд даёт тот же счёт.
- Стенду нужен `npm-sostav` в PATH (на sadik — `/usr/local/bin`); нет его — стенд сразу выходит кодом 2 «СЛЕПОТА: npm-sostav
  не найден — нужен dsh-pribory ≥ 3.1.2», не красным и не зелёным.
- `package.json`: необязательный peer `dsh-pribory ^3.1.2` (`peerDependenciesMeta.optional`) — объявляет требование стенда и ничего
  не ставит: обязательный peer под npm 11 и 12 офлайн-установкой не ставится (код 1, `dsh-pribory` в реестре только 3.1.1).
- Код пакета не менялся.

## 3.1.2 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- `package.json`: `author` — Aleksandr Argelander.
- Код пакета не менялся.

## 3.1.1 — облачный аудит, модуль №3 (A-N-1948): код Зари, доки Авроры · cloud audit module 3

- №2: запись из одних пробелов — omega не подтверждает сохранение (ядро отвергает `PAMYAT_NEPOLNAYA_ZAPIS`).
- №4: devDependencies cordis 4.0.1 → 4.0.4 — `npm install` в каталоге пакета без ERESOLVE.
- №10: stend-vydachi «стык ядра» — ядро соседом по дереву, затем по имени; нет нигде — слепота с причиной.
- №24: строка журнала выдачи — без текста письма пользователя (ПДн).
- Документация (Аврора): README RU/EN (№21 — английская страница), docs.

## 1.1.38 — 2026-10-09 · LICENSE в архиве / LICENSE in the archive (A-N-1887)

В архив входит LICENSE (MIT, A-N-1865 722421f). · The archive includes LICENSE (MIT, A-N-1865 722421f).

Ещё в архиве с прежнего номера · Also in the archive since the previous version: ничего · nothing. Код пакета не менялся · Package code is unchanged.

## 1.1.37 — 2026-10-07 · poTelu: поиск записи по телу / Find a record by body

Выпуск рабочей сборки 1.1.36-a1718 (A-N-1718 а2), код без изменений против неё. Release of working build 1.1.36-a1718, code unchanged.

### рабочая 1.1.36-a1718

A-N-1718 (а2, Искра). Новый метод службы `poTelu({tekst, koren})`: `omega_query` mode=phrase, с учётом регистра, `entity_id`=корень, limit 3 → `{ids}` записей, содержащих тело целиком, или `{otkaz}`. В omega-memory 1.5.19 phrase — SQL LIKE «содержит», не FTS; `access_count` не трогает; фильтра status нет; корень пропускает и записи без entity_id. Эхо тела в ответе вырезается до разбора, число id обязано совпасть с шапкой — иначе отказ. Зовёт ядро dsh-pamyat-core 1.1.106-a1718 для `moglo-dojti-bez-id`. Стенд `test/stend-po-telu.mjs`.

A-N-1718 (a2): new service method `poTelu` finds root records containing the whole body via phrase search; the echoed body is cut before parsing and the id count must match the header.

## 1.1.36 — 2026-10-07 · Поиск по всем корням: предел по числу корней и частичная выдача / All-root search: limit by root count and partial delivery

A-N-1727 (Искра; наряд Забавы, замечание Вениамина к 1.1.35). Служба OMEGA sadik делит время между одновременными запросами, и все они кончаются вместе (замер по копии базы 07.10: 11 корней 2,0–2,7 с; два поиска по всем корням разом — 5,0 с, три — 6,0 с), поэтому поиск по всем корням упирался в общий предел 3000 мс уже при одном соседнем запросе (отказы Авроры 05.10 05:22Z и Зари 07.10 01:28Z). Теперь предел каждого запроса поиска по всем корням — `max(vydacha.tajmautMs, 600 мс × число корней)`; на sadik 11 корней — 6600 мс. Отказ части корней (поиск не состоялся) больше не отменяет выдачу: она подаётся частично, строка журнала и первая строка ответа модели говорят «⚠️ НЕПОЛНО» и называют немые корни. Деградация любого корня (поиск без фильтра корня) и отказ всех корней по-прежнему отменяют выдачу. Предел выдачи — одна константа `PREDEL_VYDACHI_MS` для связи, строки журнала и схемы (прежде 3000 стояло в трёх местах). ⚠️ Граница: 600 мс × N держит около трёх одновременных поисков по всем корням; при четырёх (замер) обрываются почти все корни сразу — частичная выдача тогда даёт мало. Новый стенд `test/stend-vseh-kornej.mjs`; `test/stend-zamera-vydachi.mjs` ждёт для двух корней предел 1200 мс.

A-N-1727. The sadik OMEGA service shares time between concurrent queries, which finish together, so all-root search hit the shared 3000 ms limit as soon as one neighbouring query ran. Each all-root query now gets `max(vydacha.tajmautMs, 600 ms × root count)`; 6600 ms for 11 roots on sadik. A failure of some roots no longer rejects the delivery: it is delivered partially, and the journal line and the first line of the model answer say «⚠️ INCOMPLETE» and name the silent roots. Degradation of any root or failure of all roots still rejects the delivery. One limit constant `PREDEL_VYDACHI_MS` for the connection, the journal line and the schema. New stand `test/stend-vseh-kornej.mjs`.

## 1.1.35 — 2026-10-07 · Время и охват в строке выдачи / Duration and scope on retrieval lines

A-N-1709 (Искра; находка Зари D4). Строка исхода каждой выдачи (А и Б) — «подано N», «подано 0» и «🔴 не подана» — теперь несёт «· N мс, свой корень|все корни, предел M мс». Строки успеха были и раньше (за 48 ч до 07.10: Б подано 15, отказ 2), но без времени отказ по пределу было не с чем сравнить. Предел связи выдачи — `vydacha.tajmautMs`, умолчание 3000 мс; на sadik он не задан, то есть действует 3000, а не 10000 (10000 — предел связи записи). Стенд `test/stend-zamera-vydachi.mjs`.

A-N-1709. Every retrieval outcome line now carries duration, scope and the limit in force. Success lines existed before, but without time a limit refusal had nothing to compare against. The retrieval connection limit is `vydacha.tajmautMs`, default 3000 ms. Stand `test/stend-zamera-vydachi.mjs`.

## 1.1.34 — 2026-10-07 · Вердикт о Б на каждом подъёме / B verdict on every start

A-N-1708 (Искра; находка Зари D3). Вердикт «доходит ли Б до модели» печатался на первом шаге хода и только один раз за процесс: подъём без шагов молчал (замер 48 ч до 07.10 — 31 процесс, все без шагов), а первый шаг в гостевой сессии захватывал вердикт ложным «🔴 НЕ доходит» (Варвара 05.10 11:46Z: сессия сайта, набор из 2 инструментов) — вердикт своих сессий в том процессе уже не звучал. Теперь: исключённая ядром сессия (isklyuchitSessii) даёт «Б в гостевом наборе не положена» и вердикт не захватывает; если за 10 мин с регистрации шага своей сессии не было — «Б: НЕ ИЗМЕРЕНО» с причиной (срок — `NE_IZMERENO_MS`, для стендов `PAMYAT_B_NE_IZMERENO_MS`). Стенд `test/stend-b-kazhdyj-podyom.mjs`.

A-N-1708. The B verdict was printed only on the first turn step, once per process: starts without steps were silent, and a first step in a guest session captured the verdict with a false «🔴 not reaching». Now a core-excluded session yields «B is not part of the guest set» without capturing the verdict, and 10 minutes without an own-session step yields «B: NOT MEASURED» with the cause. Stand `test/stend-b-kazhdyj-podyom.mjs`.

## 1.1.33 — чтение памяти гостем (B-N-1644) · guest memory reading

Новая настройка `gostyam` (по умолчанию выключена — у агентов без неё ничего не меняется). Включённая даёт один инструмент `pamyat_dlya_gostej`: поиск по смыслу только в корне `vydacha.koren`, только действующие записи с меткой `gostyam.teg` в `metadata.tags` (жёсткий фильтр OMEGA `filter_tags`), не больше `gostyam.zapisej`. Отдаётся текст записи без id и служебных полей; превью OMEGA до 200 знаков, длиннее — с пометкой «фрагмент»; прилипший к записи хвост ответа обрезается. Деградация поиска (без фильтров), сбой и отказ хранилища обычным текстом «ОТКАЗ …» (так отказывает шлюз гостей OMEGA) — явный отказ, а не «сведений нет». Журнал называет число записей, без текста вопроса. Инструмент не проверяет исключение сессий ядра — он сделан для исключённых (гостевых) сессий; запись этим путём невозможна. Новый стенд `test/stend-gostej.mjs`.

New `gostyam` setting (off by default — agents without it are unchanged). When enabled it adds one tool, `pamyat_dlya_gostej`: semantic search only in the `vydacha.koren` root, only active records tagged `gostyam.teg` in `metadata.tags` (hard OMEGA `filter_tags` filter), at most `gostyam.zapisej`. It returns record text without ids or internal fields; OMEGA previews are up to 200 characters, longer ones are marked as fragments, and any response tail stuck to a record is cut. Degraded (unfiltered) search, failure, or a plain-text store refusal («ОТКАЗ …», as the OMEGA guest gateway refuses) is an explicit refusal, not "nothing known". The log states the record count without the question text. The tool does not check core session exclusion — it exists for excluded (guest) sessions; nothing can be written this way. New harness `test/stend-gostej.mjs`.

## 1.1.32 — перенумерация (A-N-1562): прежний 0.1.0-alpha.32, код не менялся · renumbering, code unchanged

## Документационный кандидат · Documentation candidate

Добавлены парные RU/EN руководство и комментарии, схемы записи/проверки/выдачи, таблицы настроек и границы защит. Исполняемый код и номер версии сохранены; выпуск назначается отдельно.

Added paired RU/EN guide and comments, write/read/retrieval diagrams, configuration tables and guard limits. Executable code and version remain unchanged; release numbering is separate.

## Существующие контракты · Existing contracts

Провайдер различает тристороннее подтверждение и неизвестные исходы с/без id, сопоставляет четыре класса внешним типам, отмечает создание отдельно от склейки и предоставляет root-ограниченную активную выдачу. Сверка Source не должна захватывать похожие записи или обрывать знание на его собственном Markdown-заголовке.

The provider distinguishes three-way confirmation and ambiguity with/without IDs, maps four classes to external types, separates creation from merging, and provides root-scoped active retrieval. Source parsing must neither consume similar records nor truncate knowledge at its own Markdown heading.

Выдача поддерживает автоматическую и запросную стороны, чтение доверия ядра, ограниченные списки системных/гостевых корней, обрамление недоверенных данных и признаки деградации поиска. Исключение сессий требует подключённого метода ядра. Исторические внутренние адреса и наряды сохранены в истории репозитория, не в публичном журнале.

Retrieval supports automatic and explicit paths, core trust lookup, bounded system/guest root inventories, untrusted-data framing and degradation detection. Session exclusion requires the core method. Internal addresses and work-item history remain in version control rather than this public changelog.
