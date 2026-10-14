## 3.1.6 — 2026-10-14 · стенды и документация · stands and documentation

- Состав и перечень стендов RU/EN дополнены общим consumer и его двумя Python-телами; стенд пустой записи извлекает единственный `PY_CHANGELOG` из `copy-compare.sh` и отвергает ошибку исполнения блока. Код watcher/consumer не менялся.
- Новый номер по решению Забавы 12:06:47Z: метка 3.1.5 уже поставлена на `93f8edbb` для закрытия окна; правки `413772c5` выпускаются следующим номером.
- RU/EN inventories now describe the shared consumer and its two Python test bodies; the empty-entry stand extracts the unique `PY_CHANGELOG` from `copy-compare.sh` and rejects Python failures. Watcher/consumer code is unchanged. Version 3.1.5 was already tagged on `93f8edbb`; these fixes ship as 3.1.6 under the coordinator's revised decision.

## 3.1.5 — 2026-10-14 · B-N-2043 Ш2

- Обычное сравнение копии вынесено в чистый `src/copy-compare.sh`: 0 совпало, 1 разошлось, 2 слепота; JSON без состояния, каналов и кода 4. Прежние counters/diagnostics/fingerprint и CHANGELOG-прощения сохраняются.
- VOW использует consumer и проверяет полный протокол. Normal-copy расхождение откладывается только при одной полной записи copy/files/entry/tag, той же политике, repo, реестре и исключениях; финальный lookup повторяет исходный запрос и поколение. Строгие/слепые исходы вне плана сильнее отсрочки.
- Consumer устанавливается отдельно в `/usr/local/libexec/dsh-vypusk-watch/copy-compare.sh`; отсутствие до монтажа копии даёт отказ producer, отсутствие у reader — слепоту. Номер при сведении назначила Забава: 3.1.5, dsh-montazh 3.1.24.

## 3.1.4 — 2026-10-14 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `author` — «Aleksandr Argelander» (единый автор семьи; лицензия MIT на его имя) · `author` set to "Aleksandr Argelander"
- `engines.node` ">=18" — кода на Node в пакете нет (bash/python), это граница установки через npm, а не проверенная среда кода · `engines.node` ">=18" — no Node code in the package (bash/python); the bound is for npm installation, not a tested code runtime
- README: строка «Версия · Version: 3.1.4» под заголовком. · README: version line under the heading.
- Код не менялся; номер 3.1.3 → 3.1.4 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.3 — 2026-10-14

B-N-2033 (Аврора; замысел Гаммы 51aa233e, условия Вениамина 00:4xZ): на один каталог `packages/<каталог>` — несколько записей derevo
(один пакет на двух местах: `socseti` и `socseti-anna`). Прежде вторая давала СЛЕПОТУ «две записи derevo на один каталог» и сторож не
судил ни одной. Теперь каждая запись судится своим id: в PY_DEREVO ключ строк — `<каталог>#<id>`, когда записей на каталог больше одной;
bash проверяет каждый ключ отдельно, печатает каталог и id. У каталога с ОДНОЙ записью вывод PY_DEREVO побайтно прежний: его исполняет
и `montazh-okno` (`verify_derevo`) на реестре из одной записи. `test/stend-derevo.py` +4 пробы: две записи чисты, порча второй, обратный
порядок, тело PY_DEREVO на реестре из одной записи. НЕ ЛОВИТ: две записи с ОДНИМ id на каталог — прежняя слепота.
Дубль `files.remote` внутри записи — СЛЕПОТА «запись <id>: files.remote «r» повторён в N местах (пути)», запись не судится: прежде словарь
по remote молча сверял только последнее место (`stend-derevo.py` +1 проба, 18). Проба Гаммы `test/stend-audit-runtime.py` test_18 (4271da1d):
повтор несопоставленного ключа `VYPUSK_SOOTVETSTVIYA` — ранняя слепота, код 2, одна тревога; возврат — 0 (только стенд, код сторожа не менялся).

B-N-2033: several derevo records may point to one `packages/<dir>`; each is judged by its registry id (`<dir>#<id>` keys inside
PY_DEREVO when a directory has more than one record). For a directory with a single record the PY_DEREVO output is byte-identical,
because `montazh-okno` executes the same block on a one-record registry. `test/stend-derevo.py` gains four probes.
A duplicate `files.remote` inside a record is now BLINDNESS naming the record id and all paths (the per-remote map used to check only
the last place silently); `stend-derevo.py` +1 probe. Gamma's probe `stend-audit-runtime.py` test_18 (4271da1d): a duplicated unmatched
`VYPUSK_SOOTVETSTVIYA` key is early blindness, code 2, one alert; restore — 0 (test only, watcher code unchanged).

## 3.1.2 — 2026-10-14 · ожидание owned_files под dsh-montazh 3.1.9 (B-N-2034)

- `test/stend-montazh-okno.py` :40: проверка registry окна ждёт `owned_files` = ВСЕ файлы записи derevo (src/x и package.json), а не цель вызова. С dsh-montazh 3.1.9 (в бою с 14.10 01:31Z) прежнее ожидание давало 3 провала из 11 на боевом montazh-okno (обход 03:40Z, строка vse-stendy-boevye.sh:117). Код пакета не менялся. Различающая проба: со старым montazh-okno 3.1.8 исправленный тест красный.

## 3.1.1 — 2026-10-14

Намеренный переход 1.1.16 → 3.1.1 по правилу владельца 10.10: каждому модулю 3.1.1 по готовности (A-N-1948 №22).

Пустой список исключений входит в пакет; образец окружения полон. Ошибки git сохраняют причину, ссылки сверяются по канонической цели, повтор ключа соответствия и опасное имя пакета дают слепоту. Нечитаемые файлы не выдаются за расхождение; вложенный node_modules исключён, имена с пробелами сохраняются. Будущая и повреждённая отметка не глушит тревогу. Стенды дают код 2 при отсутствии предмета/PyYAML; документация описывает зависимости, установку и границы слепоты. Монтажная отсрочка не изменена.

Intentional 1.1.16 → 3.1.1 jump under the owner's 10 October rule. Ships an empty exception list and complete environment sample; retains git causes, canonicalizes link targets, refuses duplicate mapping keys and unsafe package names. Unreadable files are blindness; nested node_modules is excluded and spaced paths are preserved. Future/malformed timestamps do not mute alarms. Stands report blindness for missing input/PyYAML. Deployment deferral remains unchanged.

B-N-2032: сохранена вставка 60-bash-padenie-70.conf и --avto-montazh; стенд окна использует установленный helper по явному пути и проверяет entry:<id>/strict closure на реальном потребителе реестра. Протокол PY_DEREVO и код монтажной отсрочки сохранены.

## 1.1.16 — 13.10.2026 · B-N-2032

- В дерево сведена исправленная Забавой вставка vypusk-okno-watch.service.d/60-bash-padenie-70.conf; --avto-montazh и прежний SyslogIdentifier сохранены. Боевая копия уже правильна; код VOW не меняется.
- Track the corrected crash-wrapper drop-in with the automatic deployment flag.

VOW с явным --avto-montazh: отложены только точные «невыпущенное» (копия+план метки) и hash-derevo (запись+файлы). Права/ссылки/чужие копии/слепота строгие, INFO не отсрочка; полнота нарушена→2. Перед итогом перепроверяется окно, максимум один пересъём. Код4 не пишет отметку доставки.

Решение Забавы Р2 (09.10): поле `package.json` `"dsh": {"prezhnie_imena": [...]}`. После переименования каталога и/или имени пакета
(слово владельца 09.10: всё в npm — с приставкой `dsh-`, каталог = имени) метка версии боя, ключ соответствия и каталог внутри метки
остаются под прежним именем до первого выпуска под новым. Без поля сторож давал ложные исходы сразу после переключения дерева.

- Метка версии боя и ряд выпусков — по префиксам {каталог, имя, прежние имена}; метка учитывается один раз.
- `VYPUSK_SOOTVETSTVIYA`: ключ пары узнаётся по каталогу, имени или прежнему имени (пара шлюза в `/etc/vypusk-okno-watch.env` не обязана меняться в окне).
- Каталог в метке: если в метке нет `packages/<каталог>`, берётся первый из (имя, прежние имена), что в ней есть; INFO «метка … несёт прежний каталог».
- Записи `derevo`: если в метке `ref` нет `subdir`, пробуется `packages/<прежнее имя>` из `package.json` дерева; INFO с тем же текстом.
- Кривое поле (`dsh` не объект, не список, имя не `[A-Za-z0-9._-]`, больше 16) — слепота пакета/записи с именем поля, не молчаливое «прежних нет».
- Новый стенд `test/stend-prezhnih-imen.{py,sh}` (10 проб: исправное → порча «поле снято» → возврат, кривое поле); на основе 1.1.13 — 4 из 10.

⚠️ Чего не ловит: верность самого поля (что названо действительно прежнее имя); метку под именем, которого в поле нет.
Поле живёт в ключе `dsh`, который читает и платформа (`dsh.bundle`, `dsh.profile`); сторож читает только `prezhnie_imena`.

## 1.1.15 — 13.10.2026 · B-N-2025: адресное окно монтажа

## 1.1.14 — A-N-1948 шаг 0: прежние имена пакета (`dsh.prezhnie_imena`)

## 1.1.13 — B-N-1767: сверка по записям derevo реестра (VYPUSK_REESTR)

Добавлено в сторож (`src/vypusk-okno-watch.sh`) · Added to the watcher:

- `VYPUSK_REESTR` — путь к реестру (`plugins.yaml`). Записи с ключом `derevo` {`address`, `ref`, `subdir: packages/<каталог>`, `files[{local, remote, mode, owner}]`, `not_installed`, `expected_diff_files`, `links`} — носитель «файл пакета → путь на диске». Мерило — метка `ref`, а не «новейшая». Каталог с записью сверяется только по ней, раньше манифеста и раскладки, и второй раз не считается. Поэтому сверяются и пакеты с нестандартным верхом (`NetworkManager/`, `plugin/`, `dorabotki/`), и пакеты с `package.json` вне корней (`socseti`).
- Сверка двусторонняя:
  - файл метки вне `files` и вне `not_installed` → слепота «запись отстала от метки»;
  - `remote`, которого нет в метке → слепота;
  - сумма боя ≠ метке, режим или владелец ≠ записи, ссылка не туда, файла нет → 🔴 с путём;
  - `expected_diff_files` → INFO с обеими суммами и `expected_diff_reason`;
  - метка того же ряда новее `ref` → INFO;
  - реестр не прочитан → слепота всего прогона, код 2.
- Пакет и в `VYPUSK_RASKLADKA`, и в `derevo` → сверяется по `derevo`, плюс INFO «из перечня раскладки можно убрать».
- Итог — строка «derevo (записи реестра, VYPUSK_REESTR=…): записей N · сошлось · разошлось · слепота». Пустое значение выключает сверку (поведение 1.1.12), отсутствие переменной — слепота.
- `VYPUSK_REESTR` names the registry; entries with a `derevo` key are compared against their `ref` tag both ways (tag ↔ files ∪ not_installed), by checksum, mode, owner and links; such a directory is checked only by its entry.

Чего не ловит · Not caught:
- файл на диске вне `files`;
- копии пакета с записью `derevo` в `VYPUSK_KORNI` (путь манифеста для него не идёт);
- `version`/`installed_check` записи — это `agent-plugins verify`;
- устаревшую причину прощения.

Добавлено в стенды · Added to the stands:

- `test/stend-derevo.sh` (→ `.py`) — 13 проб: исправное · порча → 🔴, канал 1 · возврат · режим · запись отстала · нет `ref` · прощение INFO · метка новее INFO · derevo раньше раскладки · ссылка · запись вне дерева · реестр битый · пусто = выкл. На 1.1.12 — 0 из 13.
- Штатные стенды задают `VYPUSK_REESTR=`; в `stend-nastroek.sh` проба «строки нет → слепота».

## 1.1.12 — B-N-новые-пакеты: сверка пакетов без манифеста по раскладке (VYPUSK_RASKLADKA)

Добавлено в сторож (`src/vypusk-okno-watch.sh`) · Added to the watcher:

- `VYPUSK_RASKLADKA` — перечень каталогов `packages/<каталог>` через `:`: служебные пакеты без `package.json` (исходники, ставятся от root). Файл пакета `bin|sbin|libexec|lib/<путь>` сверяется с `/usr/local/<то же>`, `systemd/<путь>` — с `/etc/systemd/system/<путь>`; `README.md` и `CHANGELOG.md` верхнего уровня не ставятся. Мерило — новейшая метка `<каталог>-vX.Y.Z`. Исход каждого пакета — строка «сошлось: <пакет> [раскладка, без манифеста] — N из N файлов, метка …» или 🔴 с файлом («иные суммы» / «нет на диске»); итог — строка «раскладка (без манифеста, VYPUSK_RASKLADKA): пакетов N · сошлось · разошлось · слепота». Бой целиком равен прежней метке и новых файлов нет — «сошлось» плюс INFO «выпуск … новее боя, не смонтирован».
- Слепота, а не молчание: файл метки с иным верхом («куда ставится, не знаю»), каталога нет в дереве, у пакета есть `package.json`, негодное имя, переменная не задана вовсе. Пустая строка — сверка выключена, пакеты остаются «без манифеста», как в 1.1.11.
- Перечень явный, а не «всё без манифеста»: `oom-watch` (без манифеста, метка 2.2.1) расходится с боем по двум юнитам — захват по умолчанию дал бы немедленную ложную тревогу.
- `VYPUSK_RASKLADKA` lists `packages/<dir>` entries (`:`-separated) of manifest-less system packages; their files are compared with the newest `<dir>-vX.Y.Z` tag by the fixed layout `bin|sbin|libexec|lib → /usr/local/…`, `systemd → /etc/systemd/system/…`. Unknown top-level dirs, missing dirs, a `package.json` or an unset variable are blindness; an empty value turns the check off.

Чего не ловит · Not caught: права и владельца (git хранит только x-бит) · пакеты вне перечня · файлы на диске, которых нет в метке (сверка идёт от метки) · верхи вне пяти названных.

Добавлено в стенды · Added to the stands:

- `test/stend-raskladki.sh` (→ `.py`) — 10 проб на подставном дереве и подставном диске (`VYPUSK_RASKLADKA_PRISTAVKA`): исправное молчит · порча файла → 🔴 с пакетом и путём, канал 1 · возврат → 0 · бой = старой метке → INFO · удалённый юнит → «нет на диске» · иной верх, каталога нет, есть `package.json`, негодное имя → слепота · пусто → выключено. На 1.1.11 — 0 из 10.
- Штатные стенды задают `VYPUSK_RASKLADKA=`; в `stend-nastroek.sh` проба «строки нет → слепота».

## 1.1.11 — B-N-1738: несколько копий по соответствию; сумма состава в отпечатке невыпущенного

Исправлено в сторожe (`src/vypusk-okno-watch.sh`) · Fixed in the watcher:

- `VYPUSK_SOOTVETSTVIYA`: путей у пакета может быть несколько через `:` (шлюз — `/opt/claude-oauth:/opt/subscription-gateway-guest`). Каждая копия — своя единица сверки и своя строка исхода («сошлось» / 🔴 / слепота); названный путь без каталога — слепота этой копии, прочие сверяются. Прежде гостевая копия шлюза не сверялась вовсе: соответствие держало один путь.
- «Смонтировано невыпущенное»: в отпечаток повтора и в строку тревоги входит сумма состава копии (`files` её package.json + package.json, без node_modules и ссылок на каталоги). Прежде отпечаток нёс только номер — новая правка той же рабочей версии глушилась сутки как «та же картина».
- `VYPUSK_SOOTVETSTVIYA` accepts several `:`-separated paths per package, each compared and reported separately; the unreleased fingerprint includes the copy's contents sum.

Добавлено в стенды · Added to the stands:

- `test/stend-neskolko-kopij.sh` (→ `.py`) — 7 проб: две копии сошлись · порча файла второй копии → красное с её именем · возврат · путь без каталога → слепота · невыпущенное: тревога с суммой, повтор глушится, правка той же рабочей версии — новая картина.

## 1.1.10

Исправлено в сторожe (`src/vypusk-okno-watch.sh`) · Fixed in the watcher:

- Правило «запись CHANGELOG есть и не пуста»: текст в строке заголовка после номера теперь тоже содержимое записи — `## 1.1.9 — перенумерация …` без тела больше не «пустая»; голая дата или одно тире после номера — по-прежнему пусто. Было: запись перенумерации без тела давала ложное «записи нет или она пуста». · The "CHANGELOG entry exists and is not empty" rule: text in the heading line after the version now counts as entry content — `## 1.1.9 — renumbering …` without a body is no longer "empty"; a bare date or a lone dash after the version still is. Before: a renumbering entry without a body gave a false "entry missing or empty".

Добавлено в стенды · Added to the stands:

- `test/stend-pustoj-zapisi.sh <vypusk-okno-watch.sh>` — 9 проб правила на подставных CHANGELOG; блок правила берётся из предмета, не из копии. · 9 probes of the rule on fake CHANGELOGs; the rule block is taken from the subject, not a copy.

## 1.1.9 — перенумерация (A-N-1562): прежний 0.1.0-alpha.9, код не менялся · renumbering, code unchanged

## 0.1.0-alpha.9 — 2026-10-04 (не выпущено · unreleased)

Исправлено в сторожe (`src/vypusk-okno-watch.sh`) · Fixed in the watcher:

- `VYPUSK_NAPOMINAT` не число секунд — СЛЕПОТА «настройка VYPUSK_NAPOMINAT не число секунд», код 2. Было: в ветке расхождения сравнение падало с ошибкой оболочки, и тревога уходила на каждом прогоне. · A non-numeric `VYPUSK_NAPOMINAT` is BLINDNESS naming the setting, exit 2. Before: the comparison in the mismatch branch failed with a shell error and the alert went out on every run.
- Асимметрия по составу сверяет путь целиком, а не подстрокой: файл вне состава `x.js` больше не уносит из ожиданий `x.js.map` из состава (прежде его отсутствие в бою пряталось, а присутствие давало ложное «лишнее»). · The contents asymmetry matches the path whole, not as a substring: `x.js` outside the contents no longer drops `x.js.map` (inside) from expectations (before, its absence in production was hidden and its presence produced a false "extra").
- Отметка доставки расхождения пишется атомарно (временный файл рядом и `mv`, права 0600), как отметка слепоты; каталог состояния создаётся только при записи отметки — тихий режим (`VYPUSK_TIHO=1`) его не создаёт. · The mismatch delivery mark is written atomically (a temp file next to it and `mv`, mode 0600), like the blindness mark; the state directory is created only when the mark is written — quiet mode (`VYPUSK_TIHO=1`) does not create it.
- Нижняя строка кодов в шапке называет и код 3. · The lower exit-code line in the header also names code 3.

Исправлено в стендах · Fixed in the stands:

- Новый стенд `test/stend-pochinki.sh` (→ `stend-pochinki.py`, 5 проб) на четыре исправления выше. · New stand `test/stend-pochinki.sh` (→ `stend-pochinki.py`, 5 probes) for the four fixes above.
- `test/stend-sootvetstviya.py`: проба «канал звали ровно при коде ≠ 0» по всем прогонам (11 проб). · A "channel called exactly on exit ≠ 0" probe over all runs (11 probes).
- `test/probe.py`, `test/stend-sootvetstviya.py`, `test/stend-svoej-metki.py`: настройки сторожа вызывающего (`VYPUSK_*`) не наследуются. · The caller's watcher settings (`VYPUSK_*`) are not inherited.
- `test/stend-svoej-metki.py`: итог «own-version N/N … restored N/N» считается из сценариев, а не печатается литералом; обёртка `.sh` больше не называет устаревшее число сценариев. · The "own-version N/N … restored N/N" total is computed from the scenarios rather than printed as a literal; the `.sh` wrapper no longer names an outdated scenario count.

Документация на двух языках: README переписан по-русски и по-английски; добавлены `docs/ARCHITECTURE.md` (схемы прогона, пакета и подавления повторов, пример юнита и таймера), `docs/SETTINGS.md` (все переменные окружения с умолчаниями и последствиями неверных значений), `docs/GUARDS.md` (что ловит сторож, все стенды и пробы, чего не ловит), `docs/TROUBLESHOOTING.md`. Комментарии стендов — парами RU/EN. История изменений обезличена: имена исполнителей, номера внутренних пунктов и рабочие пути убраны, смысл сохранён. Сами эти правки документации код стендов не меняли; изменения кода стендов — пункты выше.

Bilingual documentation: the README is rewritten in Russian and English; added `docs/ARCHITECTURE.md` (run, package and repeat-suppression diagrams, a sample unit and timer), `docs/SETTINGS.md` (every environment variable with defaults and the effect of wrong values), `docs/GUARDS.md` (what the watchdog catches, every stand and probe, what it misses), `docs/TROUBLESHOOTING.md`. Stand comments are RU/EN pairs. The changelog is anonymised: performer names, internal item numbers and working paths are removed, the meaning is kept. These documentation edits by themselves did not change stand code; the stand code changes are the items above.

## 0.1.0-alpha.8 — 2026-10-04

🔴 Изменено поведение: в коде сторожа нет умолчаний под раскладку конкретной машины. `VYPUSK_REPO`, `VYPUSK_KORNI`, `VYPUSK_INFO_KORNI`,
`VYPUSK_SOOTVETSTVIYA`, `VYPUSK_SSYLKI` и новая `VYPUSK_AGENT_POISK` (вместо зашитых родительских каталогов копий агентов) задаются окружением
(файл настроек юнита); незаданная обязательная настройка — СЛЕПОТА с именем настройки, код 2, а не молчаливое умолчание. Комментарии — пары RU/EN без имён.
`src/vypusk-okno-watch.sh` bc06678c → afb3c4b5 (= бою /usr/local/sbin, монтаж координатора с файлом настроек). Остальной кандидат (тесты, документация) —
отдельным выпуском при переносе документации. Вместе с исходником — два теста того же принятого кандидата, без них `npm test`
красный по устройству (старая проба ждёт прежних умолчаний): `test/probe.py` 7e9ea550 → 0af60a7d (настройки проба задаёт явно) и новый
`test/stend-nastroek.sh` f86cdbef (пусто/незадано → слепота с именем; 5 проб). Документация кандидата (README, docs/) — позже.
НЕ ЛОВИТ: настройку, заданную неверно, но непусто (путь не тот) — это видно по картине сверки, не по запуску.

## 0.1.0-alpha.7 — 2026-10-01

Смена договора: «бой = СВОЕМУ выпуску». Каждая установленная копия сверяется с меткой ЕЁ версии (версия из package.json боя), а не с последней меткой пакета.
Новый, ещё не установленный выпуск — INFO, канал не зовётся (так метку можно ставить ДО монтажа). Метки пакета есть, а своей версии боя нет —
РАСХОЖДЕНИЕ, rc 1: «смонтировано невыпущенное: бой=VB, своей метки нет; последний выпуск X» (вариант (в) исполнителя 18c3c2a5, решение координатора и
приёмщика 01.10). Меток пакета нет вовсе или своих две (два допустимых префикса) — слепота; версия внутри архива метки ≠ версии боя — расхождение.
`test/stend-svoej-metki.py` — 16 сценариев договора и встроенная порча «выбрать последнюю метку» (красное → восстановление зелёное); зовут `npm test` и
обходчик через новую обёртку `test/stend-svoej-metki.sh` (обходчик берёт только stend-*.sh|*.mjs — без обёртки у стенда нет ночного читателя; выпуск, исполнитель).
`test/probe.py`: явный независимый эталон VYPUSK_TEST_REFERENCE для приёмки кандидата до монтажа; без переменной — прежняя сверка исходника с боем.
НЕ ЛОВИТ / граница: копию, чья версия в package.json подделана вместе с файлами под чужую метку, — версия берётся из самого боя; пакет, в бою которого
выпуск ещё не стоит, не обещает «новое доехало» — это INFO, не тревога; stend-dovodov и stend-sootvetstviya в npm test не входят (их зовёт ночной обход).

## 0.1.0-alpha.6 — 2026-09-27

Тревога расхождения перед отправкой в HTML-канал экранирует &, < и >.
Подсказка `ln -s ../<цель> <ссылка>` и динамические пути остаются текстом.
Исходный вывод и отпечаток картины не меняются; ветка слепоты уже экранирована отдельно.
Проверено на подставном HTML-получателе с возвратом после порчи; боевой канал не вызывался.
Граница: лимит и обрезка сообщения в agent-alert этой правкой не проверяются.

## 0.1.0-alpha.5 — 2026-09-26

У сторожа нет доводов — любой довод → ОТКАЗ, код 3, ДО чтения дерева, боя, канала и состояния
(было: `--bez-trevogi` молча проглатывался, сторож шёл боевым режимом с каналом тревог). Отказ перечисляет режимы
окружения (VYPUSK_TIHO=1 и др.). Код 3, а не 2: 2 — «слепота» с тревогой. В шапке — строка кодов выхода
(условие приёмки). Новый стенд test/stend-dovodov.sh (5 проб, изолированная среда, подставной канал).
ЧЕГО НЕ ЛОВИТ: неверное значение окружения и опечатку в имени переменной.

## 0.1.0-alpha.4 — 2026-09-26

Сторож выпуска видит шлюз подписки. Новое — VYPUSK_SOOTVETSTVIYA (по умолчанию
subscription-gateway=<каталог-шлюза>): каталог дерева сверяется с названным боевым каталогом, а не с поиском по
имени в корнях. Сверка такого пакета — только по составу публикации метки (files + package.json) в обе стороны;
всё в бою вне состава не считается (каталог шлюза — ещё и домашний каталог его учётки). Метка без files — СЛЕПОТА;
соответствие на отсутствующий каталог — СЛЕПОТА с именем. Новый стенд test/stend-sootvetstviya.sh (8 проб).
Не ловит: правку файлов боя вне состава (sdk-runtime/, старые gateway.mjs.*).

## 0.1.0-alpha.3 — 2026-09-25

Копия сторожа в пакете приведена к бою. /usr/local/sbin/vypusk-okno-watch.sh смонтирован 20:15:17Z (2ea0827e; правка исполнителя,
ворота приёмщика 20:13Z, условия приёмки 3 и 4) мимо копии пакета (осталась 9c7506ca) ⇒ stend-kopij-vypuska.sh красный, обходчик 20:22Z код 1.
src/vypusk-okno-watch.sh ← бой побайтно; кода в пакете больше не меняется ничего.

## 0.1.0-alpha.2

Исходник сторожа = бой `9c7506ca019540f9` (две правки исполнителя 24.09, смонтированы координатором; ворота приёмщика):
- (#249-В): предел вызова канала — одна запись `KANAL_PREDEL_S` (+`KANAL_DOBIV_S` до SIGKILL); из неё и `timeout`, и строка исхода, чтобы число стояло рядом с исходом. Коды 124/137 названы.
- отметка «отправлено» пишется только по коду 0 канала; прежде отказ канала глох на напоминании как «уже отправлено».

Выпуск (исполнитель): без него переустановка пакета молча откатила бы обе правки, а стенд `stend-kopij-vypuska.sh` краснел на тождестве src/бой. Стенд не менялся.

## 0.1.0-alpha.1

Исходник сторожа c22bedd508cc39dc и пять сценариев стенда исполнителя. Стенд исполняет временную копию выбранного исходника.

Перед сценариями проверяется тождество снимка и действующего сторожа по SHA-256.
