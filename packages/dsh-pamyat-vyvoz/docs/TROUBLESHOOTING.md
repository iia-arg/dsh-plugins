# Неполадки · Troubleshooting — dsh-pamyat-vyvoz

Каждый отказ пакета несёт код `VYVOZ_…` и текст с причиной. Ниже — признак → причина → лечение. Почти все отказы ввоза происходят до открытия базы-приёмника: «база не тронута» — буквально.

Every package refusal carries a `VYVOZ_…` code and a text with the reason. Below: symptom → cause → fix. Almost all import refusals happen before the target database is opened: "database untouched" is literal.

## Сводка · Summary

| Код или признак · Code or symptom | Раздел · Section |
|---|---|
| `VYVOZ_DOGOVOR_YADRA`, «ядро не загрузилось ни по одному пути» · "core did not load by any path" | [1](#t1) |
| `VYVOZ_NEZNAKOMYJ_KLASS`, код 1 · exit 1 | [2](#t2) |
| `VYVOZ_NET_OTKUDA` | [3](#t3) |
| `VYVOZ_OTBOR_NET_POLYA`, код 1 · exit 1 | [4](#t4) |
| `VYVOZ_NEIZVESTNYJ_KLYUCH` | [5](#t5) |
| `VYVOZ_SUMMA_NE_SOSHLAS` | [6](#t6) |
| `VYVOZ_CHUZHIE_ID`, `VYVOZ_CHUZHAYA_SHEMA`, `VYVOZ_NE_NASH_FAJL`, `VYVOZ_NET_ZAGOLOVKA`, `VYVOZ_ZAGOLOVOK_BEZ_OTKUDA` | [7](#t7) |
| `VYVOZ_BITAYA_STROKA`, `VYVOZ_PUSTOJ_FAJL` | [8](#t8) |
| «ПРИНЯТО С ПОТЕРЕЙ ПОЛЕЙ» / «ВВОЗ НЕ ЗНАЕТ ПОЛЕЙ» · "accepted with field loss" / "import does not know fields" | [9](#t9) |
| «след в журнале НЕ записан» · "journal trace NOT written" | [10](#t10) |
| ввоз прошёл, а новых записей 0 · import passed but 0 new records | [11](#t11) |
| стенд: «СЛЕПОТА: ядро рядом не найдено», код 2 · stand: core not found, exit 2 | [12](#t12) |

<a id="t1"></a>
## 1. Ядро не найдено или нарушает договор · Core not found or breaks the contract

**Признак.** Отказ договора: ядро не загрузилось ни по одному пути (перечень попыток в тексте), или «ядро не отдаёт najti_sekret()», или ответ «вне договора». CLI — код 2, файла нет.

**Symptom.** A contract refusal: the core did not load by any path (attempts listed in the text), or "core does not export najti_sekret()", or an answer "outside the contract". CLI exit 2, no file.

**Причина.** Пакет ищет `dsh-pamyat-core/src/filtr-vhoda.js` по имени пакета, соседним каталогом и в своём `node_modules`; либо ядро слишком старое или не той формы. Без годного фильтра вывоза нет по устройству — это защита, а не поломка.

**Cause.** The package looks for `dsh-pamyat-core/src/filtr-vhoda.js` by package name, as a sibling directory and in its own `node_modules`; or the core is too old or of the wrong shape. Without a valid filter there is no export by design — this is protection, not a failure.

**Лечение.** Поставьте ядро не ниже нижней границы из `peerDependencies` (`>=0.1.0-alpha.31` — прежняя нумерация; подходит любое 1.1.x) рядом или укажите путь `--yadro /path/to/dsh-pamyat-core/src/filtr-vhoda.js`. Передавайте путь строкой, а не сам модуль.

**Fix.** Install the core at or above the `peerDependencies` floor (`>=0.1.0-alpha.31` — old numbering; any 1.1.x fits) next to the package, or pass `--yadro /path/to/dsh-pamyat-core/src/filtr-vhoda.js`. Pass the path as a string, not the module itself.

<a id="t2"></a>
## 2. `VYVOZ_NEZNAKOMYJ_KLASS` — вывоз остановлен · export stopped

**Признак.** «вывоз ОСТАНОВЛЕН: класс … ядру известен, а нам нет»; код 1, файла нет.

**Symptom.** "export STOPPED: class … is known to the core but not to us"; exit 1, no file.

**Причина.** В ядре появился класс секрета, о котором пакет не знает, и `rezhim()` ответил `neizvesten`. Раз ядро ушло вперёд, под вопросом вся раскладка, поэтому останавливается весь вывоз, а не одна запись.

**Cause.** The core has a secret class the package does not know, and `rezhim()` answered `neizvesten`. Once the core has moved ahead, the whole layout is in question, so the entire export stops, not one record.

**Лечение.** Обновите пакет до версии, знающей этот класс, и повторите. Обходить фильтр нельзя: утечка необратима, остановка — нет.

**Fix.** Update the package to a version that knows this class and retry. Do not bypass the filter: a leak is irreversible, a stop is not.

<a id="t3"></a>
## 3. `VYVOZ_NET_OTKUDA`

**Признак.** Вывоз отказан, файла нет.

**Symptom.** The export is refused, no file.

**Причина.** Не задан `--otkuda` или задан пустым. Умолчания нет намеренно: прежнее «неизвестно» вписывало в файл значение, за которое никто не отвечал, а принимающая сторона без источника не может оценить происхождение записей.

**Cause.** `--otkuda` is missing or empty. There is deliberately no default: the former "unknown" wrote into the file a value nobody stood behind, and the receiving side cannot assess record origin without a source.

**Лечение.** Укажите имя источника: `--otkuda <имя-агента-или-машины>`.

**Fix.** Name the source: `--otkuda <agent-or-host-name>`.

<a id="t4"></a>
## 4. `VYVOZ_OTBOR_NET_POLYA`

**Признак.** «отбор задан по полю …, которого в этой базе НЕТ»; код 1.

**Symptom.** "selection by field … which this DB does NOT have"; exit 1.

**Причина.** Отбор по `agent`, `klass` или времени (`sozdano`) в базе старой схемы. Пропустить условие молча нельзя: вывезлось бы больше, чем просили.

**Cause.** Selection by `agent`, `klass` or time (`sozdano`) on an old-schema database. The condition cannot be dropped silently: more would be exported than requested.

**Лечение.** Уберите это условие отбора или обновите схему базы средствами ядра.

**Fix.** Remove this selection condition or upgrade the database schema with the core's tools.

<a id="t5"></a>
## 5. `VYVOZ_NEIZVESTNYJ_KLYUCH`

**Признак.** Вызов API отказан с перечнем незнакомых ключей.

**Symptom.** An API call is refused with a list of unknown keys.

**Причина.** Опечатка или ключ из чужой привычки в объекте вызова. Без отказа такая опечатка тихо отключила бы настройку.

**Cause.** A typo or a key from another habit in the call object. Without a refusal such a typo would silently disable the setting.

**Лечение.** Вывоз принимает `baza, fajl, otkuda, yadro, otbor, krik`; ввоз — `baza, fajl, yadro, krik`.

**Fix.** Export accepts `baza, fajl, otkuda, yadro, otbor, krik`; import accepts `baza, fajl, yadro, krik`.

<a id="t6"></a>
## 6. `VYVOZ_SUMMA_NE_SOSHLAS`

**Признак.** «сумма содержимого не сошлась… Файл дошёл не целиком либо правлен после вывоза. База НЕ тронута».

**Symptom.** "content checksum did not match… The file arrived incomplete or was edited after export. Database NOT touched".

**Причина.** Строки записей не совпадают с суммой из заголовка: файл обрезан при переносе или его правили руками.

**Cause.** The record lines do not match the header checksum: the file was truncated in transit or edited by hand.

**Лечение.** Перенесите файл заново и сверьте его сумму на обеих машинах. Не правьте файл вывоза руками.

**Fix.** Transfer the file again and compare its checksum on both machines. Do not edit an export file by hand.

<a id="t7"></a>
## 7. Отказы по заголовку и номерам · Header and id refusals

**Признак.** `VYVOZ_CHUZHIE_ID` (строка несёт `id`), `VYVOZ_CHUZHAYA_SHEMA` (другая версия схемы), `VYVOZ_NE_NASH_FAJL`, `VYVOZ_NET_ZAGOLOVKA`, `VYVOZ_ZAGOLOVOK_BEZ_OTKUDA`.

**Symptom.** `VYVOZ_CHUZHIE_ID` (a line carries `id`), `VYVOZ_CHUZHAYA_SHEMA` (another schema version), `VYVOZ_NE_NASH_FAJL`, `VYVOZ_NET_ZAGOLOVKA`, `VYVOZ_ZAGOLOVOK_BEZ_OTKUDA`.

**Причина.** Файл сделан не этим пакетом, другой версией формата или собран вручную. Чужой `id` запрещён, потому что запись с малым номером легла бы ниже рубежа происхождения принимающей базы.

**Cause.** The file was not produced by this package, uses another format version, or was assembled by hand. A foreign `id` is forbidden because a record with a low number would land below the receiving database's origin milestone.

**Лечение.** Сделайте вывоз заново той версией пакета, что стоит на принимающей стороне, и ввозите полученный файл без правок.

**Fix.** Re-export with the package version installed on the receiving side and import the resulting file unedited.

<a id="t8"></a>
## 8. `VYVOZ_BITAYA_STROKA`, `VYVOZ_PUSTOJ_FAJL`

**Признак.** «строка N не разбирается как JSON… База НЕ тронута» или «файл пуст».

**Symptom.** "line N does not parse as JSON… Database NOT touched" or "file is empty".

**Причина.** Файл повреждён или пуст. Ввоз атомарен: из-за одной битой строки не ляжет ни одна запись.

**Cause.** The file is damaged or empty. Import is atomic: a single broken line means no record is stored.

**Лечение.** Перенесите файл заново; если повреждён исходник — сделайте вывоз заново.

**Fix.** Transfer the file again; if the source is damaged, re-export.

<a id="t9"></a>
## 9. «ПРИНЯТО С ПОТЕРЕЙ ПОЛЕЙ» / «ВВОЗ НЕ ЗНАЕТ ПОЛЕЙ» · Field loss on import

**Признак.** Предупреждение через `krik` с перечнем полей и числом записей, которые их несли.

**Symptom.** A warning via `krik` listing the fields and how many records carried them.

**Причина.** В схеме принимающей базы нет этих столбцов, или поля вне перечня `POLYA`. Значения в БД не размещены; восстановить их можно из сохранённого исходного JSONL, который функция ввоза не удаляет.

**Cause.** The receiving database's schema lacks these columns, or the fields are outside the `POLYA` list. The values are not stored in the DB, but can be recovered from a retained source JSONL; the import function does not delete it.

**Лечение.** Если значения нужны — сначала обновите схему приёмника средствами ядра, затем ввозите. Сохраните файл вывоза до проверки результата.

**Fix.** If the values matter, first upgrade the receiving schema with the core's tools, then import. Keep the export file until the result is checked.

<a id="t10"></a>
## 10. «след в журнале НЕ записан» · "journal trace NOT written"

**Признак.** Предупреждение после успешной операции.

**Symptom.** A warning after a successful operation.

**Причина.** В базе нет таблицы `zhurnal` или в неё нельзя писать (например, база на томе только для чтения). Операция при этом состоялась.

**Cause.** The database has no `zhurnal` table or it cannot be written (for example, the database is on a read-only volume). The operation itself succeeded.

**Лечение.** Обновите схему базы средствами ядра. Помните: вывоз пишет строку-след в журнал базы-источника даже при пробе без `--fajl`.

**Fix.** Upgrade the database schema with the core's tools. Remember: export writes a trace line into the source database's journal even on a dry probe without `--fajl`.

<a id="t11"></a>
## 11. Ввоз прошёл, а новых записей 0 · Import passed but 0 new records

**Признак.** Отчёт ввоза: вставлено 0, «уже было» N.

**Symptom.** The import report: inserted 0, "already present" N.

**Причина.** Тот же файл (или пересекающийся) уже ввозили: тождество «агент + источник + время создания» совпало. Это защита от удвоения памяти.

**Cause.** The same (or an overlapping) file was imported before: the identity "agent + source + creation time" matched. This protects against doubling memory.

**Лечение.** Ничего не делать, если повтор случайный. Если записи действительно разные, но совпали по тождеству, — это граница пакета: их различает только содержимое, а ввоз сверяет тройку.

**Fix.** Do nothing if the repeat was accidental. If the records really differ but share the identity, that is a package limit: only content distinguishes them, while import compares the triple.

<a id="t12"></a>
## 12. Стенд: «СЛЕПОТА: ядро dsh-pamyat-core рядом не найдено» · Stand: core not found

**Признак.** `npm test` возвращает 2.

**Symptom.** `npm test` exits 2.

**Причина.** Стенд ищет ядро соседним каталогом `../dsh-pamyat-core` (раскладка рабочего дерева семейства).

**Cause.** The stand looks for the core in the sibling directory `../dsh-pamyat-core` (the family working-tree layout).

**Лечение.** Гоняйте стенд в рабочем дереве или положите рядом ссылку `../dsh-pamyat-core` на установленное ядро.

**Fix.** Run the stand in the working tree, or place a `../dsh-pamyat-core` link to the installed core next to the package.

## Отбор и отсутствующий приёмник · Selection and missing receiver

Неизвестный CLI ключ — код 2, файла вывоза и строки журнала нет. Проверь имя по справке. Неизвестный ключ внутри API otbor — VYVOZ_NEIZVESTNYJ_KLYUCH; строка вместо числового времени — VYVOZ_OTBOR_TYPE. Это отказ ввода до чтения данных, не пустой результат фильтра.

Unknown CLI flags refuse before export with exit 2. Unknown API selection keys and nonnumeric time bounds are input refusals, not an empty query result.

VYVOZ_BAZA_NE_SUSHHESTVUET: база-приёмник отсутствует. Сначала создай её ядром; ввоз переносит строки, не создаёт схему. Пустой файл при этом отказе не оставляется. pometka_filtra — известная транспортная пометка, не неизвестное поле; при ввозе она в БД не сохраняется.

The receiving DB is missing: initialize it with the core first. Import transfers rows rather than creating the schema and leaves no empty file for this refusal. Filter annotations are known transport metadata, not unknown DB fields; they are not persisted.
