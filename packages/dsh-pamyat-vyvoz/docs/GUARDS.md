# Сторожа и проверки · Guards and checks — dsh-pamyat-vyvoz

У пакета нет постоянно работающих сторожей: он ничего не делает сам. Проверки двух видов — защиты, встроенные в каждый вызов, и стенд `npm test`. Читатель встроенных защит — тот, кто вызвал вывоз или ввоз: он видит отказ с кодом и текстом. Читатель стенда — тот, кто собирает или принимает пакет.

The package has no always-on watchdogs: it does nothing by itself. There are two kinds of checks: protections built into every call, and the `npm test` stand. The reader of the built-in protections is whoever called export or import: they see a refusal with a code and text. The reader of the stand is whoever builds or accepts the package.

## Защиты внутри вызова · Built-in protections

| Защита · Protection | Ловит · Catches | Не ловит · Misses |
|---|---|---|
| проверка договора с ядром на образцах · core contract check on samples | нет ядра, нет `najti_sekret`/`rezhim`, ответ чужой формы, чистый текст не `null`, объявленный секрет не найден · no core, missing functions, wrong answer shape, clean text not `null`, declared secret not found | ядро, которое проходит образцы, но пропускает другие секреты · a core that passes the samples but misses other secrets |
| фильтр каждой записи · per-record filter | запирающие классы — задержка; незнакомый класс — остановка вывоза · locking classes — held back; unknown class — export stops | секрет в форме, которую фильтр ядра не знает: «задержано 0» ≠ «секретов нет» · a secret in a form the core filter does not know: "held back 0" ≠ "no secrets" |
| незнакомый ключ вызова → отказ · unknown call key → refusal | опечатка, тихо отключившая бы настройку · a typo that would silently disable a setting | неверное значение верного ключа · a wrong value under a correct key |
| отбор по отсутствующему полю → отказ · selection by a missing field → refusal | вывоз шире, чем просили · an export wider than requested | — |
| временный файл и переименование · temp file and rename | полуфайл с верным заголовком при обрыве · a half-file with a valid header after a crash | обрыв во время самого переименования на ФС без атомарного `rename` · a crash during rename on a filesystem without atomic `rename` |
| сумма содержимого в заголовке · content checksum in the header | файл, дошедший не целиком или правленный после вывоза · a file that arrived incomplete or was edited after export | файл без суммы: проверки нет, и это сказано словами «не проверена» · a file without a checksum: no check, stated as "not verified" |
| отказ ввоза на чужой `id` и чужую схему · import refusal on foreign `id` and schema | отмывание доверия через номера; чтение чужого формата догадкой · trust laundering via ids; reading a foreign format by guesswork | — |
| одна транзакция ввоза · one import transaction | половину ввоза, выглядящую как успех · half an import that looks like success | — |
| тождество «агент + источник + время» · identity "agent + source + time" | двойной ввоз · double import | две разные записи с тем же агентом, источником и временем считаются одной · two different records with the same agent, source and time count as one |
| строка-след в журнале базы · trace line in the DB journal | операцию без истории · an operation without history | базу без таблицы `zhurnal`: операция идёт, а отказ следа называется вслух · a DB without a `zhurnal` table: the operation proceeds and the trace failure is named aloud |

## Стенд · Stand

`npm test` запускает `test/vse-stendy.mjs`. Тот обходит `test/`, берёт все файлы `stend-*.mjs` с диска (перечень не записан руками) и называет в итоге `.mjs`, лежащие рядом не по образцу. Исходный стенд `stend-vyvoza.mjs` сохраняет 60 проб. Ядру нужно лежать соседним каталогом `../dsh-pamyat-core`; иначе стенд честно пишет «СЛЕПОТА» и возвращает 2.

`npm test` runs `test/vse-stendy.mjs`. It walks `test/`, takes every `stend-*.mjs` from disk (the list is not maintained by hand) and names, in the summary, any `.mjs` lying there outside the pattern. The original `stend-vyvoza.mjs` retains 60 probes. The core must sit in the sibling directory `../dsh-pamyat-core`; otherwise the stand honestly says "СЛЕПОТА" (blindness) and exits 2.

| Группа проб · Probe group | Проб · Probes | Что проверяет · What it checks |
|---|---|---|
| фильтр вывоза · export filter | 11 | объявленный секрет не уезжает; секрет в любом другом поле договора (`istochnik`, `podozrenie`) задерживает запись с названием поля; секрет внутри поля-BLOB (байты UTF-8) тоже; незнакомый класс в другом поле останавливает вывоз даже после запирающего; все четыре запирающих класса задерживаются; незнакомый класс останавливает вывоз; помечающий вывозится с пометкой; отчёт без содержимого, числа абсолютные, «задержано 0» не выдаётся за «секретов нет» · declared secret stays; a secret in any other contract field (`istochnik`, `podozrenie`) holds the record back naming the field; so does a secret inside a BLOB field (UTF-8 bytes); an unknown class in another field stops the export even after a locking one; all four locking classes held; unknown class stops export; marking class exported with mark; content-free report, absolute numbers, "held 0" not passed off as "no secrets" |
| договор с ядром · core contract | 5 | нет функции, чужая форма ответа, чужое слово режима, нет ядра, путь не строкой — отказ, файла нет · missing function, wrong answer shape, wrong mode word, no core, non-string path — refusal, no file |
| ввоз · import | 10 | чужой `id`, чужая схема, атомарность, ввоз тоже фильтрует — каждое поле договора в том виде, в каком оно ляжет в базу (секрет внутри поля-объекта, секрет в другом поле, чистое поле-объект проходит), тождество, незнакомое поле названо, ограничение ложится неподтверждённым · foreign `id`, foreign schema, atomicity, import filters too — every contract field as it will be stored (a secret inside an object field, a secret in another field, a clean object field passes), identity, unknown field named, constraint lands unconfirmed |
| круг и схема · round trip and schema | 6 | круг «вывоз → ввоз» сохраняет число и текст; свои номера; причины невывоза названы; `id` нет в перечне; редакция пакета из манифеста; схема ушла вперёд — сказано · round trip keeps count and text; own ids; reasons for non-export named; no `id` in the list; package version from manifest; schema moved ahead — stated |
| заголовок и сумма · header and checksum | 3 | узел, задержанные, сумма; ввоз ловит правку файла; нет суммы — «не проверена» · host, held back, checksum; import catches file edits; no checksum — "not verified" |
| тождество, атомарность записи, журнал · identity, atomic write, journal | 6 | разные агенты не сливаются; повтор не удваивает; нет временного полуфайла; запись не по месту; след в журнале; нет таблицы журнала — отказ назван · different agents not merged; repeat not doubled; no temp half-file; write not in place; journal trace; no journal table — failure named |
| отбор и CLI · selection and CLI | 5 | отбор берёт только подходящее; границы времени включительно; отбор по несуществующему полю — отказ; коды 1 и 2 разведены; без `--fajl` ничего не создаётся · selection takes only matches; inclusive time bounds; selection by missing field — refusal; exit codes 1 and 2 separated; nothing created without `--fajl` |
| поля и источник · fields and source | 14 | что вывозится (`proishozhdenie`, `ocenki`, `podtverzhdenie`) и что нет (`proverka`, `kasanij`, `poslednee_kasanie`) с причиной в файле; «откуда» обязателен на вывозе и ввозе, пустое имя не годится, порядок проверок; лишний ключ — отказ, верный набор проходит · what is exported and what is not, with the reason in the file; "otkuda" required on export and import, empty name rejected, check order; extra key refused, correct set passes |

Проба «запись идёт не по месту» читает текст `src/vyvoz.js` регулярками: ищет вызов переименования и смотрит, что первый вызов записи файла пишет во временное имя. Поэтому правка этого файла должна держать в комментариях эти вызовы без открывающей скобки.

The "write not in place" probe reads the text of `src/vyvoz.js` with regular expressions: it looks for a rename call and checks that the first file-write call writes to the temporary name. So edits to this file must keep these calls out of comments in their opening-parenthesis form.

**Не ловит:** проверку на настоящей чужой машине — круг проверен на копии живой базы (55 записей, содержимое сохранено до знака; подставная запись с ключом задержана и в файл не попала), а не между двумя машинами.

**Misses:** a check on a real foreign machine — the round trip was verified on a copy of a live database (55 records, content preserved exactly; a planted record with a key was held back and never reached the file), not between two machines.

## Аудит №14 · Audit 14

Три входа: прежний stend-vyvoza.mjs — 60 проб, stend-audit-boundaries.mjs — 31 проба, stend-audit-docs.mjs — 8 проб. Новые CLI/API проверки работают только с собственными временными SQLite/JSONL, без копии живой памяти. Нужен соседний core либо VYVOZ_YADRO; его нет — именованная СЛЕПОТА 2 до проверок. VYVOZ_CANDIDATE задаёт альтернативный корень предмета для source-порч.

Three entries: the original stand has 60 probes, the boundaries stand 31, and the docs stand 8. New CLI/API probes use only synthetic temporary databases/files, never a production memory copy. Missing sibling core (or explicit VYVOZ_YADRO) gives named blindness 2 before assertions. VYVOZ_CANDIDATE selects a source-copy root for fault injection.
