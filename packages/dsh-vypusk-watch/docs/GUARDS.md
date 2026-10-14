# Сторожа и проверки · Guards and checks — dsh-vypusk-watch

Сам пакет — сторож: он охраняет договор «бой = своему выпуску». Здесь описано, что он ловит, чем это доказано (стенды пакета) и, так же подробно, чего он не ловит.

The package itself is a watchdog: it guards the "production = own release" contract. This page describes what it catches, how that is proven (the package stands) and, in equal detail, what it misses.

## Что охраняет сторож · What the watchdog guards

| Признак · Signal | Исход · Outcome | Код · Code | Тревога · Alarm |
|---|---|---|---|
| версия боя совпадает с меткой, суммы файлов равны · production version matches the tag, checksums equal | `сошлось` · matched | 0 | нет · no |
| версия совпадает, суммы разные · same version, different checksums | `разошлось`, с именами файлов · diverged, file names listed | 1 | да · yes |
| файл есть в бою, нет в метке · file in production, not in the tag | `разошлось`, «только в бою» · diverged, "production only" | 1 | да · yes |
| файл состава есть в метке, нет в бою · published file in the tag, missing in production | `разошлось`, «только в метке» · diverged, "tag only" | 1 | да · yes |
| своей метки нет, другие выпуски пакета известны · no own tag, other releases known | `смонтировано невыпущенное` · unreleased build installed | 1 | да · yes |
| нет записи версии в CHANGELOG (боя или метки) без прощения · no CHANGELOG entry (production or tag) without forgiveness | `разошлось` · diverged | 1 | да · yes |
| названная ссылка монтажа пропала или ведёт не туда · named install link missing or wrong | `разошлось` · diverged | 1 | да · yes |
| меток пакета нет вовсе или «своих» меток две · no package tags or two "own" tags | `СЛЕПОТА` · blindness | 2 | да, отдельная · yes, separate |
| нет дерева, корень нечитаем, список исключений битый, каталог соответствия не существует · no tree, unreadable root, broken exception list, missing correspondence dir | `СЛЕПОТА` с именем причины · blindness with the cause named | 2 | да, отдельная · yes, separate |
| вышел более новый выпуск, своя метка на месте · a newer release exists, own tag in place | `INFO` | 0 | нет · no |
| у пакета дерева нет боевого каталога · tree package has no production dir | «вне области» · "out of scope" | 0 | нет · no |
| расхождение в чужой копии (`VYPUSK_INFO_KORNI`) · divergence in a foreign copy | сведение владельцу копии · information for the copy owner | 0 | нет · no |
| не задана обязательная настройка или строка «пусто = выкл» · a required setting or an "empty = off" line is missing | `СЛЕПОТА: не задана настройка …` · blindness naming the setting | 2 | да, отдельная · yes, separate |
| передан иной довод командной строки · an unsupported argument was passed | `ОТКАЗ` до чтения дерева · refused before reading the tree | 3 | нет · no |

**Кто читает исход.** Тревогу — получатель канала `agent-alert` (одна попытка на картину, предел 90 с на отправку и 5 с на завершение). Код выхода и полный вывод — журнал службы, которая запускает сторож по таймеру. Таймер и юнит пакет не ставит: без них сторож не зовётся вовсе (см. [ARCHITECTURE.md](ARCHITECTURE.md#install)).

**Who reads the outcome.** The alarm goes to the recipient of the `agent-alert` channel (one attempt per picture, 90 s to send plus 5 s to finish). The exit code and full output go to the journal of the service that runs the watchdog on a timer. The package installs neither timer nor unit: without them the watchdog is never called (see [ARCHITECTURE.md](ARCHITECTURE.md#install)).

## Стенды пакета · Package stands

Python ≥ 3.9 и PyYAML (`python3-yaml`) обязательны.

Python ≥ 3.9 and PyYAML (`python3-yaml`) are required.

Все стенды работают на временных git-деревьях, временных боевых каталогах и подставном канале тревог: живое дерево, бой и настоящий канал они не трогают. Исключение одно — стенд копий выпуска по умолчанию читает установленный файл сторожа (только чтение).

All stands use temporary git trees, temporary production dirs and a stub alarm channel: they never touch the live tree, production or the real channel. One exception: the release-copies stand reads the installed watchdog file by default (read-only).

| Стенд · Stand | Запуск · Run | Проб · Probes | Что доказывает · What it proves |
|---|---|---|---|
| копии выпуска · release copies | `bash test/stend-kopij-vypuska.sh` (→ `probe.py`) | тождество + 5 сценариев · identity + 5 scenarios | снимок `src/` равен установленному файлу; исправное — 0; порча своей копии — 1; возврат — 0; порча чужой копии — только сведение, 0 · the `src/` snapshot equals the installed file; healthy — 0; own copy corrupted — 1; restore — 0; foreign copy corrupted — information only, 0 |
| договор «бой = своему выпуску» · "production = own release" contract | `bash test/stend-svoej-metki.sh` (→ `stend-svoej-metki.py`) | 16 сценариев × 3 прогона · 16 scenarios × 3 runs | правило тревоги по всем веткам (см. ниже); прогон на исправном, на порче и после возврата · the alarm rule on every branch (see below); run on the healthy file, on a corruption and after restore |
| соответствия · correspondences | `bash test/stend-sootvetstviya.sh` (→ `stend-sootvetstviya.py`) | 11 | сверка пакетов вне корней по составу публикации; канал зовётся ровно при коде ≠ 0 · checking packages outside the roots by published file list; the channel fires exactly on exit ≠ 0 |
| доводы командной строки · command-line arguments | `bash test/stend-dovodov.sh` | 6 | любой иной довод — отказ с кодом 3 до чтения дерева, без канала и без отметки состояния · any other argument is refused with exit 3 before reading the tree, without the channel and without a state mark |
| настройки · settings | `bash test/stend-nastroek.sh` | 7 | незаданная обязательная настройка и незаданная настройка «пусто = выкл» — слепота с именем, код 2; явно пустые значения принимаются · a missing required setting and a missing "empty = off" setting are blindness naming it, exit 2; explicit empty values are accepted |
| прежние имена · former names | `bash test/stend-prezhnih-imen.sh` (→ `stend-prezhnih-imen.py`) | 10 | после переименования каталога/имени пакета (`dsh.prezhnie_imena` в `package.json`) метка версии боя, ключ `VYPUSK_SOOTVETSTVIYA`, каталог в метке и запись `derevo` находятся по прежнему имени; без поля — прежние ложные исходы (невыпущенное, вне области, слепота); кривое поле — слепота · after a package rename the live tag, correspondence key, in-tag directory and `derevo` record are found by the former name; without the field — the old false outcomes; malformed field — blindness |
| починки · fixes | `bash test/stend-pochinki.sh` (→ `stend-pochinki.py`) | 5 | `VYPUSK_NAPOMINAT` не число — слепота с именем, код 2; файл состава сверяется целиком, а не подстрокой; отметка расхождения — атомарно (ссылка на месте состояния заменяется, цель не трогается); тихий режим не создаёт каталог состояния · non-numeric `VYPUSK_NAPOMINAT` is blindness naming it, exit 2; a contents file is matched whole, not as a substring; the mismatch mark is atomic (a symlink at the state path is replaced, its target untouched); quiet mode does not create the state directory |

Поимённый перечень 15 входов; Python-тело shell-обёртки отдельно не считается.

Named inventory of 15 entry points; a shell wrapper and its Python body count once.

| Вход · Entry |
|---|
| `test/stend-audit-docs.py` |
| `test/stend-audit-runtime.py` |
| `test/stend-copy-compare.sh` |
| `test/stend-derevo.sh` |
| `test/stend-dovodov.sh` |
| `test/stend-kopij-vypuska.sh` |
| `test/stend-montazh-okno.py` |
| `test/stend-nastroek.sh` |
| `test/stend-neskolko-kopij.sh` |
| `test/stend-pochinki.sh` |
| `test/stend-prezhnih-imen.sh` |
| `test/stend-pustoj-zapisi.sh` |
| `test/stend-raskladki.sh` |
| `test/stend-sootvetstviya.sh` |
| `test/stend-svoej-metki.sh` |

`npm test` запускает два стенда: копии выпуска и договор «бой = своему выпуску». Стенды соответствий, доводов, настроек и починок запускаются отдельно.

`npm test` runs two stands: release copies and the "production = own release" contract. The correspondence, argument, settings and fixes stands are run separately.

### Договор «бой = своему выпуску» — 16 сценариев · The contract — 16 scenarios

| Сценарий · Scenario | Ожидаемый код · Expected code | Смысл · Meaning |
|---|---|---|
| `old-matches` | 0 | бой равен своей метке · production equals its tag |
| `prerelease-not-newer` | 0 | пре-выпуск (`-rc.1`) не считается более новым · a prerelease is not "newer" |
| `new-commit-only` | 0 | новый коммит без метки не тревожит · a new untagged commit does not alarm |
| `new-tag-old-live` | 0 | вышел новый выпуск, бой на своей прежней метке — только INFO · newer release, production on its own older tag — INFO only |
| `missing-own-tag` | 1 | своей метки нет при известных выпусках · no own tag while releases are known |
| `two-prefix-tags` | 2 | у версии боя две метки: по каталогу дерева и по имени пакета — слепота · the production version has two tags, by tree directory and by package name — blindness |
| `name-prefix-only` | 0 | метка с приставкой по имени пакета тоже своя · a tag prefixed by the package name also counts |
| `corrupt-live` | 1 | правка файла в бою при той же версии · a production file edited under the same version |
| `restored-first`, `restored-second` | 0, 0 | файл возвращён — снова зелёное, два прогона подряд · file restored — green again, two consecutive runs |
| `archive-version-mismatch` | 1 | метка своей версии указывает на коммит с другой версией в манифесте · the own-version tag points to a commit with a different manifest version |
| `final-first`, `final-second` | 0, 0 | итоговое исправное состояние, два прогона подряд · final healthy state, two consecutive runs |
| `no-package-tags` | 2 | меток пакета нет вовсе — слепота · no package tags at all — blindness |
| `no-tags-restored-first`, `no-tags-restored-second` | 0, 0 | своя метка возвращена — зелёное, без тревоги · own tag restored — green, no alarm |

Стенд гоняет все 16 сценариев трижды: на исправном стороже, на копии с порчей (сторож сверяет бой с самой новой меткой пакета вместо метки своей версии) и снова на исправном. Признак — `PASS own-version 16/16; last-tag mutation detected; restored 16/16`. На порче краснеют ровно шесть сценариев: `new-tag-old-live`, `name-prefix-only`, `restored-first`, `restored-second`, `final-first`, `final-second`.

The stand runs all 16 scenarios three times: on the healthy watchdog, on a corrupted copy (the watchdog compares production with the newest package tag instead of the own-version tag) and on the healthy one again. The pass line is `PASS own-version 16/16; last-tag mutation detected; restored 16/16`. On the corruption exactly six scenarios turn red: `new-tag-old-live`, `name-prefix-only`, `restored-first`, `restored-second`, `final-first`, `final-second`.

### Соответствия — 11 проб · Correspondences — 11 probes

Без пары соответствия пакет вне области (0) · исправное (0) · файл вне состава с разными суммами не считается (0) · файл состава с точкой в имени изменён в бою (1) · правка главного файла в бою, с именем файла (1) · возврат (0) · файл состава удалён в бою, «только в метке» (1) · правка файла вне состава не считается — граница (0) · бой впереди метки, версия без метки (1) · пара на несуществующий каталог — слепота с именем (2). · канал тревоги звали ровно в прогонах с кодом ≠ 0 — сводная проба по всем прогонам стенда.

No correspondence pair — package out of scope (0) · healthy (0) · a file outside the published list with different checksums is ignored (0) · a published file with a dot in its name edited in production (1) · main file edited in production, file named (1) · restore (0) · a published file deleted in production, "tag only" (1) · an edit outside the published list is ignored — a limit (0) · production ahead of the tag, untagged version (1) · a pair pointing to a missing dir — blindness with the name (2). · the alert channel was called exactly in runs with exit ≠ 0 — a summary probe over all the stand runs.

### Доводы — 6 проб · Arguments — 6 probes

Без доводов — прежний путь (в изолированной среде он кончается слепотой, код 2, канал позван один раз) · `--bez-trevogi` — отказ 3, канал 0, файл состояния не создан · `--dry-run` (привычка из других программ) — отказ 3 · позиционный довод — отказ 3 · текст отказа называет верный путь (`VYPUSK_TIHO=1`) · отказ перечисляет настройки корней копий агентов (`VYPUSK_AGENT_KORNI`, `VYPUSK_AGENT_POISK`).

No arguments — the usual path (in the isolated environment it ends in blindness, exit 2, channel called once) · `--bez-trevogi` — refused 3, channel 0, no state file created · `--dry-run` (a habit from other tools) — refused 3 · a positional argument — refused 3 · the refusal text names the right way (`VYPUSK_TIHO=1`) · the refusal lists the agent copy root settings (`VYPUSK_AGENT_KORNI`, `VYPUSK_AGENT_POISK`).

### Настройки — 7 проб · Settings — 7 probes

Настроек нет вовсе — слепота «не задана настройка VYPUSK_REPO», код 2, канал позван один раз · нет `VYPUSK_KORNI` — слепота с именем (а не «всё вне области», код 0) · нет строки `VYPUSK_SSYLKI` — слепота с именем (а не «живых 0 из 0») · нет ни `VYPUSK_AGENT_KORNI`, ни `VYPUSK_AGENT_POISK` — слепота · нет строки `VYPUSK_RASKLADKA` — слепота · нет строки `VYPUSK_REESTR` — слепота · все заданы, необязательные пусты — проверка настроек пройдена, сторож идёт дальше.

No settings at all — blindness "VYPUSK_REPO not set", exit 2, channel called once · no `VYPUSK_KORNI` — blindness naming it (not "everything out of scope", exit 0) · no `VYPUSK_SSYLKI` line — blindness naming it (not "alive 0 of 0") · neither `VYPUSK_AGENT_KORNI` nor `VYPUSK_AGENT_POISK` — blindness · missing `VYPUSK_RASKLADKA` — blindness · missing `VYPUSK_REESTR` — blindness · all set, optional ones empty — the settings check passes and the watchdog goes on.

## Подавление повторов · Repeat suppression

Ту же картину расхождения сторож отправляет один раз; дальше пишет только в журнал, пока картина не изменится или не пройдёт `VYPUSK_NAPOMINAT` секунд (86400 по умолчанию). Тревога слепоты подавляется отдельно, своим файлом `<состояние>.slepota`. Отметка «отправлено» ставится только после того, как отправитель вернул успех: отказ канала не глушится.

The watchdog sends the same divergence picture once; after that it only writes to the journal until the picture changes or `VYPUSK_NAPOMINAT` seconds pass (86400 by default). The blindness alarm is suppressed separately, with its own `<state>.slepota` file. The "sent" mark is set only after the sender reports success: a channel failure is not silenced.

**Когда останавливается.** Сторож делает один проход и выходит; повторы задаёт таймер. Одна попытка доставки на прогон, без повторов внутри прогона.

**When it stops.** The watchdog makes one pass and exits; repetition comes from the timer. One delivery attempt per run, no retries within a run.

## Чего сторож НЕ ловит · What the watchdog does NOT catch

1. **«Смонтировали и пометили» неотличимо от «не монтировали вовсе».** Оба состояния дают «метка = бой», то есть зелёное. Сторож ловит несоответствие боя своему выпуску, а не отсутствие работы. Более новый выпуск — только INFO; то, что его не смонтировали, — не тревога.
2. **Правку в памяти процесса.** Сторож сравнивает диск с диском. Какая версия работает, показывает только журнал живого процесса.
3. **Пакеты вне дерева**, поставленные из реестра другой рукой.
4. **Подмену самой метки.** Если метку переставили на другой коммит, сторож скажет «сошлось»: он сверяет с тем, на что метка указывает сейчас.
5. **Верность кода.** Только тождество: одинаково плохой код в метке и в бою — зелёный.
6. **Содержимое `node_modules` внутри пакета** и файлы, исключённые режимом счёта (`*.bak*`, `*.tar`, `*.tgz`).
7. **Отсутствие в бою файла, которого нет в составе публикации.** Это намеренная асимметрия: установка такой файл не кладёт. Если же он в бою появится или изменится — поймается.
8. **Расхождение боя с незакоммиченным деревом.** Предмет сверки — метка, а не рабочее дерево.
9. **Правку файлов боя вне состава** у пакетов, сверяемых через пары соответствий.
10. **Исправность цели ссылки монтажа** (её файлы сверяет основной цикл) и ссылки, не названные в `VYPUSK_SSYLKI`.
11. **Неверное значение переменной окружения и опечатку в имени необязательной:** `VYPUSK_TIHO=да` — не «1», режим остаётся боевым; `VYPUSK_TIHO`, `VYPUSK_NAPOMINAT`, `VYPUSK_ALERT`, `VYPUSK_SOSTOYANIE`, `VYPUSK_ISKLYUCHENIYA` с опечаткой молча не действуют. Опечатка в имени настройки из перечня обязательных ловится — это слепота «не задана».

1. **"Installed and tagged" is indistinguishable from "not installed at all".** Both give "tag = production", i.e. green. The watchdog catches production diverging from its release, not the absence of work. A newer release is INFO only; not installing it is not an alarm.
2. **An in-memory change in a process.** The watchdog compares disk with disk. Only the live process's journal shows which version runs.
3. **Packages outside the tree** installed from a registry by someone else.
4. **A moved tag.** If a tag is moved to another commit, the watchdog reports "matched": it compares against what the tag points to now.
5. **Code correctness.** Identity only: equally bad code in the tag and in production is green.
6. **`node_modules` inside a package** and files excluded by the counting mode (`*.bak*`, `*.tar`, `*.tgz`).
7. **A missing production file that is not in the published list.** This asymmetry is deliberate: installation never places such a file. If it appears or changes in production, it is caught.
8. **Production diverging from an uncommitted tree.** The reference is the tag, not the working tree.
9. **Edits to production files outside the published list** for packages checked through correspondence pairs.
10. **The health of an install link's target** (its files are checked by the main loop) and links not named in `VYPUSK_SSYLKI`.
11. **A wrong environment value or a typo in an optional variable's name:** `VYPUSK_TIHO=yes` is not "1", the mode stays live; misspelled `VYPUSK_TIHO`, `VYPUSK_NAPOMINAT`, `VYPUSK_ALERT`, `VYPUSK_SOSTOYANIE`, `VYPUSK_ISKLYUCHENIYA` silently have no effect. A typo in a required setting's name is caught — it is blindness "not set".

## Чего не ловят стенды · What the stands miss

- Стенды проверяют копию сторожа на временных деревьях; что таймер на машине существует и срабатывает, они не проверяют.
- Стенд копий выпуска сверяет `src/` с установленным файлом. На машине без установленного сторожа он сообщает слепоту (код 2): проверить пакет там можно только с подменой `VYPUSK_TEST_WATCH` и `VYPUSK_TEST_REFERENCE`.
- Настоящую доставку тревоги стенды не проверяют: канал подставной.

- The stands test a copy of the watchdog on temporary trees; they do not check that a timer exists on the machine and fires.
- The release-copies stand compares `src/` with the installed file. On a machine without an installed watchdog it reports blindness (exit 2): there the package can only be checked by overriding `VYPUSK_TEST_WATCH` and `VYPUSK_TEST_REFERENCE`.
- The stands do not check real alarm delivery: the channel is a stub.

При одновременном расхождении и поздней слепоте код 1; слепота остаётся только в журнале, отдельная тревога слепоты не уходит. Исправление расхождения открывает ветку слепоты (код 2). Нельзя считать тревогу расхождения полным перечнем непроверенных копий.

When mismatch and late blindness coexist, exit 1 takes precedence; blindness stays in the journal only and no separate blindness alarm is sent. Resolving the mismatch exposes blindness (exit 2). A mismatch alarm is not the full list of unchecked copies.

Стенд `test/stend-montazh-okno.py` требует root и helper `montazh-okno`. В дереве умолчание — соседний `dsh-montazh/sbin/montazh-okno`; для установленной копии задай `MONTAZH_OKNO_BIN=/usr/local/sbin/montazh-okno`. Стенд всегда создаёт приватный `MO_STATE_DIR`, канал и дерево; живое окно не читается. Отсутствие helper/root — слепота 2.

The window stand requires root and `montazh-okno`; source defaults to the neighboring package, an installed copy needs `MONTAZH_OKNO_BIN=/usr/local/sbin/montazh-okno`. It always creates private state, channel and tree; it never reads the live window. Missing helper/root gives blindness 2.

`--avto-montazh` включает адресную отсрочку: код 4 — «отложено», не «сошлось». Без ключа — строгий ручной прогон. Нужен `montazh-okno` из `dsh-montazh`; предел пересъёма — один. Подробные границы — в ARCHITECTURE.md, «Автоматическая отсрочка».

`--avto-montazh` enables addressed deferral: exit 4 means deferred, not matched. Without the flag the manual run stays strict. Requires `montazh-okno` from `dsh-montazh`; at most one resample. See ARCHITECTURE.md, “Automatic deferral”, for its boundaries.

B-N-2032: оконный стенд теперь содержит 11 методов (прежние8 и3 проверки producer/закрытия). Нужен читаемый registry reader `MO_REESTR_PRIBOR` (умолчание `/usr/local/bin/agent-plugins`, dsh-reestr2.0.13); его настоящий `run(..., verify=True)` используется helper при закрытии. Предметы/реестр/версии/канал остаются приватными. `MO_DEREVO_REPO` и `MO_DEREVO_PRIBOR` стенд задаёт на свои фикстуры, живую конфигурацию службы не читает. Нет helper/root/reader — код2, без traceback.

The window stand has 11 methods:8existing plus3 actual producer/registry-closure checks. It requires the readable registry reader `MO_REESTR_PRIBOR` (default `/usr/local/bin/agent-plugins`, dsh-reestr2.0.13); closure uses its actual verify function. Every subject/registry/version/channel remains private; the stand pins its own repo and VOW source, without reading the live unit configuration. Missing helper/root/reader gives blindness2.

## Общий consumer и его читатель · Shared consumer and reader

`test/stend-copy-compare.sh` запускает `python3 -B -m unittest -v test_copy_compare test_copy_wiring`: `test/test_copy_compare.py` — 7 проб настоящего `src/copy-compare.sh`, `test/test_copy_wiring.py` — 1 проба проводки настоящего VOW. Только временные source/copy/Git/registry/state, без живого unit или канала. Python-тела не добавляют два входа к shell-обёртке.

The shell stand runs 7 real consumer checks and 1 actual VOW wiring check, on private temporary files/state. It does not prove a live unit or channel; the two Python bodies are counted once through their shell runner.

`test/stend-pustoj-zapisi.sh` извлекает единственный `PY_CHANGELOG` из общего `src/copy-compare.sh`; source-watch аргумент указывает на соседний consumer. Без него/при неоднозначности — слепота2, без чтения другого боевого файла. Проверяет 9 именованных входов, отказ Python не считается «запись есть».

The empty-entry stand extracts the unique block from the shared consumer. A source-watch argument resolves to its adjacent consumer. Missing/ambiguous block means blindness2, without a production fallback; Python failure never means a valid entry.
