# Приборы · Tools (`bin/`)

Каждый прибор — самостоятельный файл; история его появления и полная граница — в шапке самого файла. Здесь — вызов, коды, ключи настройки ([SETTINGS.md](SETTINGS.md)) и главное, чего прибор не делает.

Each tool is a standalone file; the history of its appearance and its full limits are in the file's own header. Here — the call, exit codes, settings keys ([SETTINGS.md](SETTINGS.md)) and the main thing the tool does not do.

| Прибор · Tool | Среда · Runtime | Коды · Codes | Ключи · Keys |
|---|---|---|---|
| `progon [-k N] [-g N] [-t] <команда…>` | bash | код команды; `2` — неверный вызов · the command's code; `2` — bad call | — |
| `pogasit --port N \| --unit ИМЯ [--sudo]` | bash | `0` остановлено или уже не активно; `2` неверный ввод/слепота до или после действия; `3` неоднозначность/гашение не удалось · `0` stopped or inactive; `2` bad input/blindness before or after action; `3` ambiguity/stop failed | — |
| `proba-v-katalog <команда…>` | bash | код команды; `2` — не создать/не войти · the command's code; `2` — cannot create/enter | `PROBA_BEZOPASNYJ` |
| `ubrat <каталог…>` | bash | `0` убрано; `2` отказ · `0` removed; `2` refusal | `UBRAT_KORNI`, `UBRAT_KUDA` |
| `polozhit <файл> [--esli-summa X] < новое` | bash | `0` положено атомарно; `3` отказ до укладки; `4` положено без сохранения владельца; `5` сумма цели изменилась, не положено; `6` положено неатомарно; `7` положено, inode не измерен · `0` placed atomically; `3` refused before placement; `4` placed, owner lost; `5` stale checksum, not placed; `6` non-atomic placement; `7` placed, inode unavailable | — |
| `dvojniki` | bash | `0` тёзок нет или все совпали; `1` расхождение; `2` нечитаемые или не заданы деревья · `0` none or all equal; `1` divergence; `2` unreadable or no trees | `DVOJNIKI_DEREVYA` |
| `kto-podnimal [служба] [окно]` | bash, Python | `0` подъёмы сверены или их не было; `1` подъём мимо ворот; `2` слепота · `0` starts checked or none; `1` start bypassing the gate; `2` blindness | `KTO_SLUZHBA`, `KTO_OTKUDA`, `KTO_ZHURNAL_VOROT` |
| `kto-pravil-fajl [файл] [с-даты]` | bash | `0` чужих правок нет; `1` правящие или неизвестные формы; `2` слепота · `0` no foreign edits; `1` editing or unknown forms; `2` blindness | `KTO_PRAVIL_FAJL` |
| `OBEIMI_KTO=<рука> obeimi-rukami <команда…>` | bash | `0` ответы сошлись; `1` разошлись; `2` отказ · `0` answers match; `1` differ; `2` refusal | `OBEIMI_RUKI` |
| `obyortka-krasneet [каталог]` | bash | `0` все применимые обёртки краснеют; `1` глухие или ловушки; `2` слепота · `0` all applicable wrappers go red; `1` deaf or traps; `2` blindness | `OBYORTKA_KATALOG` |
| `pokrytie-ozhidaniem-prob.mjs [корень]` | Node | `0` у всех стендов есть защита; `1` есть без защиты; `2` корень не задан/обход или чтение не состоялись · `0` all stands guarded; `1` some unguarded; `2` no root/incomplete read | `POKRYTIE_KOREN` |
| `proba-obrezki.sh` | bash | `0` не найдено; `1` найдено; `2` слепота · `0` none; `1` found; `2` blindness | `OBREZKA_IDIOMY`, `OBREZKA_OBLAST`, `OBREZKA_MANIFEST`, `OBREZKA_ISKL` |
| `iskat-miny-oblasti.mjs <файл>` | Node | `0` мин нет; `1` найдены; `2` нет довода/файл не читается · `0` none; `1` found; `2` no argument/unreadable file | — |
| `priznak-vzyatiya.mjs <корень> <имя…>` | Node | `0` все имена разрешились; `1` хотя бы одно не разрешилось; `2` нет/не читается корень или неверный вызов · `0` all resolved; `1` at least one unresolved; `2` missing/unreadable root or bad call | — |
| `sekrety-po-znacheniyu` | Node, `pass` | `0` все формы опознаны; `1` есть проходящие; `2` слепота · `0` all recognised; `1` some pass; `2` blindness | `PS_KATALOG`, `SEKRETY_FAJLY`, `FILTR_PUT` |
| `istoriya-profilya [агент]` / `istoriya-profilya <агент> --zavesti "строка"` | bash, git | `0` снято или изменений нет; `1` коммит не сделан; `2` отказ/слепота · `0` taken or nothing changed; `1` commit failed; `2` refusal/blindness | `ISTORIYA_AGENT`, `ISTORIYA_KATALOG` |
| `dsh-dump-kopiya <DSH_HOME> <каталог платформы>` | bash, Node | код платформы; `2` — слепота · the platform's code; `2` — blindness | — |
| `agent-wake-cost [--home D] [--session S] [--details]` | Python 3 | `0` посчитано; `2` слепота · `0` counted; `2` blindness | `WAKE_HOME` |
| `refresh-skill-links` | bash, Python 3, agent-registry из a2a-bus · from a2a-bus | `0` собрано; `1` дубль/дефект набора/недоступный источник; `2` отказ или нет реестра · `0` built; `1` duplicate/set defect/unavailable source; `2` refusal/missing registry | `SKILL_LINKS_SOURCES` |
| `npm pack … --json \| npm-sostav --files \| --filename`; `npm view X dist-tags --json \| npm-sostav --view` | bash, jq | `0` разобрано; `2` ОТКАЗ (пусто, не один документ, `{"error":…}`, не один состав, нет `files`/`filename`, элемент `files` без строкового `path`, не JSON) или неверный вызов и `--help`, stdout пуст · `0` parsed; `2` REFUSAL (empty, not one document, `{"error":…}`, not one package, no `files`/`filename`, a `files` element without a string `path`, not JSON) or a bad call and `--help`, stdout empty | — |

## Главная граница каждого · Each tool's main limit

- **`progon`** — печатает код и число строк вывода, но вывод не прячет и не судит. · prints the code and output line count, but neither hides nor judges the output.
- **`pogasit`** — гасит только по TCP-порту (1..65535) или юниту; UDP вне области; по маске командной строки — никогда; несколько процессов на порту — отказ. · stops only by port or unit; never by command-line pattern; several processes on a port — refusal.
- **`proba-v-katalog`** — каталог удаляется ВСЕГДА, даже при отказе команды; для следов разбора не годится. · the directory is ALWAYS removed, even if the command fails; not for keeping traces.
- **`ubrat`** — удаляет только внутри `UBRAT_KORNI`; рабочий каталог вызывающей оболочки увести не может — только предупреждает. · removes only inside `UBRAT_KORNI`; cannot move the calling shell out — only warns.
- **`polozhit`** — проверяет грамматику (`bash -n`, `node --check`, разбор Python), а не работу; работу — только прогоном (`POLOZHIT_PROGON`). · checks syntax, not behaviour; behaviour only by a run (`POLOZHIT_PROGON`).
- **`dvojniki`** — сравнивает тёзок по содержимому; черновики кандидатов (`*/workspace/kandidaty/`) — вне области. · compares namesakes by content; candidate drafts are out of scope.
- **`kto-podnimal`** — авторство по следу `sudo`; подъём без `sudo` (изнутри службы, таймером) называет «юнит», а не лицо; руку — по имени учётки из записи `sudo`. · authorship from the `sudo` trace; a start without `sudo` is named by unit, not person; names the hand by the account in the `sudo` record.
- **`kto-pravil-fajl`** — разбирает имя двоичного файла и флаги, тела `sh -c` не читает; «правок нет» верно для окна. · parses the binary name and flags, not `sh -c` bodies; "no edits" holds for the window.
- **`obeimi-rukami`** — только для читающих команд: команда исполняется дважды. · for read-only commands only: the command runs twice.
- **`obyortka-krasneet`** — не судит стенд, красный или слепой до порчи. · does not judge a stand that is red or blind before corruption.
- **`pokrytie-ozhidaniem-prob.mjs`** — считает наличие защиты от пропажи пробы, а не её верность. · counts the presence of a lost-probe guard, not its correctness.
- **`proba-obrezki.sh`** — ищет по перечню идиом; идиома вне перечня не видна. · searches by an idiom list; an idiom outside the list is invisible.
- **`iskat-miny-oblasti.mjs`** — не понимает замыканий, `var` и теневых объявлений. · does not understand closures, `var` or shadowing.
- **`priznak-vzyatiya.mjs`** — резолвит главный вход, а не `package.json` (у пакетов с `exports` он закрыт). · resolves the main entry, not `package.json` (closed for packages with `exports`).
- **`sekrety-po-znacheniyu`** — печатает исход по форме, значений не печатает; читает хранилище `pass`. · prints the form-based outcome, never values; reads the `pass` store.
- **`istoriya-profilya`** — отвечает «что и когда», а не «кто»; не откатывает; запуск только от самого агента. · answers "what and when", not "who"; no rollback; runs only as the agent itself.
- **`dsh-dump-kopiya`** — не защищает от записи через ссылку в иные файлы дома. · does not guard against writes through a link into other home files.
- **`agent-wake-cost`** — числа берёт только из журнала сессии платформы (`$DSH_HOME/sessions/**/session*.jsonl*`), новейшее поколение журнала в каждом каталоге. · takes numbers only from the platform session log, the newest log generation in each directory.
- **`npm-sostav`** — только разбор stdin: npm не зовёт; принимает форму, а не верность состава; пустой массив `files` — 0 строк при коде `0` (принято воротами 14.10); `--help` — в stderr с кодом `2`. · parses stdin only, never calls npm; accepts the shape, not the correctness of the content; an empty `files` array gives 0 lines with code `0` (accepted by the gate); `--help` goes to stderr with code `2`.
- **`refresh-skill-links`** — набор агента по реестру (`agent-registry pole <агент> navyki`); это набор, а не граница безопасности. · the agent's set comes from the registry; it is a set, not a security boundary.

## Новые и уточнённые договоры 3.1.1 · Revised 3.1.1 contracts

kto-podnimal запрашивает journalctl --utc и сравнивает ближайшую запись sudo точного юнита в пределах 60 с от подъёма. Успешный systemctl start и restart рассматриваются одинаково; имя юнита — данные, включая экранированные имена. Это временная связь, не доказательство причинности: авторство без sudo и общий логин людей по-прежнему не различаются.

kto-podnimal uses journalctl --utc and matches the nearest sudo record for the exact unit within 60 seconds of its start. systemctl start and restart are treated alike; escaped unit names remain data. Time proximity does not prove causality: starts without sudo and people sharing a login remain indistinguishable.

kto-pravil-fajl требует реальную запись журнала в запрошенном окне, а не строку «No entries». Полный путь сравнивается с аргументами COMMAND (относительные — от PWD записи); тела sh -c и пути через симлинк не раскрываются. Одинаковое basename в другом каталоге не считается этим файлом.

kto-pravil-fajl requires an actual journal event in the requested window, not a “No entries” marker. It compares the full path with COMMAND arguments (relative paths use the record’s PWD); sh -c bodies and symlink aliases are not expanded. A matching basename in another directory is not this file.

polozhit: --esli-summa принимает первые 16 знаков SHA256; POLOZHIT_SUMMA_PRI_SYOME сохраняется для совместимости и принимает прежний MD5. Любая несовпавшая сумма — код5 до записи, обе суммы проверяются перед укладкой; это не блокировка от гонки между сверкой и mv. POLOZHIT_PROGON выполняет произвольный код только при явном задании, путь черновика — POLOZHIT_CHERNOVIK. Python компилируется из bytes без __pycache__, с учётом coding:. Коды4/6/7 означают, что файл уже положен: повтор автоматически не выполняется.

polozhit: --esli-summa takes the first 16 SHA256 characters; POLOZHIT_SUMMA_PRI_SYOME retains its legacy MD5 contract for compatibility. A mismatch returns5 before writing; both checks precede placement and do not lock out the race before mv. POLOZHIT_PROGON executes arbitrary code only when explicitly supplied; POLOZHIT_CHERNOVIK is the temporary path. Python is compiled from bytes without __pycache__, respecting coding:. Codes4/6/7 mean the file was placed: no automatic retry is made.

progon всегда пробует дописать PROGON_UCHYOT (по умолчанию $HOME/workspace/.progon-primeneniya). Родительский каталог сам не создаёт; две строки stderr о недоступном учёте не меняют код команды. -k/-g — целые 0..999999999, ошибочное значение отказывает до выполнения команды.

progon always attempts to append to PROGON_UCHYOT (default $HOME/workspace/.progon-primeneniya). It does not create the parent; two stderr lines about unavailable accounting do not alter the command’s code. -k/-g take integers 0..999999999; invalid values refuse before the command runs.

dsh-dump-kopiya использует NODE или node из PATH; нет интерпретатора — слепота2. refresh-skill-links без agent-registry — слепота2 до изменения ссылок; при недоступном источнике — код1, все прежние ссылки сохраняются. Установка реестра: a2a-bus/bin/agent-registry и его зависимость python3-yaml.

dsh-dump-kopiya uses NODE or node from PATH; an absent interpreter gives blindness2. refresh-skill-links without agent-registry gives blindness2 before changing links; an unavailable source returns1 and preserves all existing links. Install a2a-bus/bin/agent-registry and its python3-yaml dependency.

istoriya-profilya делает git add -A: неигнорируемые файлы с токенами и секретами попадут в .git. До --zavesti администратор проверяет .gitignore; инструмент секреты не распознаёт и игнорирующие правила сам не создаёт. Существующая история не очищается этой правкой.

istoriya-profilya runs git add -A: unignored token or secret files enter .git. Before --zavesti the administrator must check .gitignore; the tool neither detects secrets nor creates ignore rules. This change does not scrub existing history.
