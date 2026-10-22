# Настройки · Settings — dsh-vypusk-watch

Все настройки — переменные окружения: единственный разрешённый довод — `--avto-montazh`, любой иной довод — отказ с кодом 3. Умолчаний под раскладку какой-либо машины в коде нет: дерево, корни, соответствия, ссылки и поиск копий задаются файлом окружения юнита (пример — в [ARCHITECTURE.md](ARCHITECTURE.md#install)). Незаданная настройка из этого перечня — слепота с её именем, код 2.

All settings are environment variables: the only accepted argument is `--avto-montazh`; any other argument is refused with exit 3. The code has no defaults tied to any machine layout: the tree, roots, correspondences, links and copy search are set in the unit's environment file (example in [ARCHITECTURE.md](ARCHITECTURE.md#install)). A missing setting from this list is blindness naming it, exit 2.

**Пустое и отсутствующее — разные вещи.** У переменных, помеченных «пусто = выкл», пустая строка отключает проверку, а отсутствие переменной — слепота: пропавшая строка в файле настроек не должна молча выключать проверку. У остальных пустая строка равна отсутствию переменной.

**Empty and missing are different.** For variables marked "empty = off", an empty string disables the check, while a missing variable is blindness: a line lost from the settings file must not silently disable a check. For the rest, an empty string equals an unset variable.

| Переменная · Variable | Умолчание · Default | Пусто · Empty | Значит · Meaning | Что сломается · What breaks |
|---|---|---|---|---|
| `VYPUSK_REPO` | нет — обязательна · none — required | отказ 3 до канала · refusal 3 before alerts | git-дерево семейства с метками и раскладкой `packages/<каталог>` · family git tree with tags and `packages/<directory>` layout | нет `.git` — слепота, код 2 · no `.git` — blindness, exit 2 |
| `VYPUSK_KORNI` | нет — обязательна · none — required | слепота · blindness | корни боевых каталогов, в них пакет ищется по `package.name` · production roots, the package is looked up by `package.name` | неверный корень — пакеты «вне области»; нечитаемый — слепота · wrong root — packages "out of scope"; unreadable — blindness |
| `VYPUSK_AGENT_KORNI` | не задана — поиск по `VYPUSK_AGENT_POISK` · unset — search via `VYPUSK_AGENT_POISK` | пусто = выкл · empty = off | явный перечень корней копий агентов через `:` · explicit `:`-list of agent copy roots | не задана и нет `VYPUSK_AGENT_POISK` — слепота · unset and no `VYPUSK_AGENT_POISK` — blindness |
| `VYPUSK_AGENT_POISK` | нет · none | пусто = выкл · empty = off | родительские каталоги через `:`; корнем копии считается каждый `<родитель>/<каталог>/plugins` · `:`-list of parent dirs; every `<parent>/<dir>/plugins` is a copy root | см. строку выше · see the row above |
| `VYPUSK_INFO_KORNI` | нет — задать явно · none — set explicitly | пусто = выкл · empty = off | политика ответственности, не добавляет корни поиска: их также задают в `VYPUSK_KORNI` или `VYPUSK_AGENT_*`; чужие копии — только сведение · responsibility policy; does not add search roots: also include them in `VYPUSK_KORNI` or `VYPUSK_AGENT_*`; foreign copies are informational | — |
| `VYPUSK_SOOTVETSTVIYA` | нет — задать явно · none — set explicitly | пусто = выкл · empty = off | пары `ключ=путь1:путь2`, одна на строку; ключ — каталог дерева, имя пакета или `dsh.prezhnie_imena`; повтор ключа или две пары для одного пакета через псевдонимы — слепота; каждый путь — отдельная единица сверки по составу публикации · one `key=path1:path2` pair per line; key is tree directory, package name or former name; duplicate keys or multiple aliases mapping the same package are blindness; each path is a separate comparison unit | названный каталог не существует — слепота с именем · named dir missing — blindness with the name |
| `VYPUSK_SSYLKI` | нет — задать явно · none — set explicitly | пусто = выкл · empty = off | пары `ссылка=цель`: цель канонизируется; относительная цель считается относительно каталога ссылки, конечный `/` допустим; цель — каталог · `link=target`: target is canonicalized, relative to the link directory; trailing `/` is allowed; target must be a directory | пропавшая ссылка — расхождение со своей шапкой и лечением · a missing link — divergence with its own header and fix |
| `VYPUSK_RASKLADKA` | нет — задать явно · none — set explicitly | пусто = выкл · empty = off | каталоги `packages/<каталог>` через `:` — пакеты без `package.json`; файл `bin/`, `sbin/`, `libexec/`, `lib/<путь>` сверяется с `/usr/local/<то же>`, `systemd/<путь>` — с `/etc/systemd/system/<путь>`, мерило — новейшая метка `<каталог>-vX.Y.Z` · `:`-list of manifest-less `packages/<dir>`; files compared by the fixed layout against the newest tag | иной верх в метке, нет каталога, есть `package.json`, негодное имя — слепота с именем; пакет не вписан — остаётся «без манифеста» (не сверяется) · unknown top dir, missing dir, a `package.json`, a bad name — blindness; an unlisted package stays "no manifest" (not compared) |
| `VYPUSK_REESTR` | нет — задать явно · none — set explicitly | пусто = выкл · empty = off | путь к реестру `plugins.yaml`; записи с ключом `derevo` (`ref`, `subdir: packages/<каталог>`, `files` с `local`, `remote`, `mode`, `owner`, `not_installed`, `expected_diff_files`, `links`) — каталог сверяется только по своей записи · path to `plugins.yaml`; `derevo` entries take precedence over manifest and layout | реестр не прочитан — слепота, код 2; запись отстала от метки, нет `ref`, файл не читается — слепота каталога; сумма, режим, владелец, ссылка — 🔴 · unreadable registry — blindness, exit 2; stale entry — blindness of the directory; checksum, mode, owner, link — 🔴 |
| `VYPUSK_ISKLYUCHENIYA` | `vypusk-okno-watch.exceptions.list` рядом со скриптом · next to the script | умолчание · default | прощённые пропуски записи CHANGELOG: `пакет@версия · причина · кто · ГГГГ-ММ-ДД`, `#` — комментарий · forgiven missing CHANGELOG entries | отсутствующий/нечитаемый файл, битая строка или повтор ключа — слепота, а не прощение · a missing/unreadable file, broken line or repeated key — blindness, not forgiveness |
| `VYPUSK_SOSTOYANIE` | `/var/lib/vypusk-okno-watch/poslednyaya.txt` | умолчание · default | отпечаток и время последней доставленной тревоги; рядом `.slepota` для тревоги слепоты · fingerprint and time of the last delivered alarm; `.slepota` next to it for the blindness alarm | не пишется — тревога может повториться (сказано в выводе) · unwritable — the alarm may repeat (stated in output) |
| `VYPUSK_NAPOMINAT` | `86400` | умолчание · default | через сколько секунд повторить ту же картину · seconds before the same picture is repeated | не число — слепота «настройка VYPUSK_NAPOMINAT не число секунд», код 2 · not a number — blindness "VYPUSK_NAPOMINAT is not a number of seconds", exit 2 |
| `VYPUSK_ALERT` | `/usr/local/bin/agent-alert` | умолчание · default | отправитель тревоги (одна попытка, предел 90+5 с) · alarm sender (one attempt, 90+5 s limit) | нет файла или не исполняемый — доставка «не подтверждена» · missing or not executable — delivery "not confirmed" |
| `VYPUSK_TIHO` | `0` | умолчание · default | `1` — не звать отправителя (для проб и ручного прогона) · `1` — do not call the sender (for probes and manual runs) | `да`, `yes`, `true` — не «1»: режим остаётся боевым · `yes`, `true` are not "1": the mode stays live |

## Переменные стендов · Stand variables

| Переменная · Variable | Значит · Meaning |
|---|---|
| `VYPUSK_TEST_WATCH` | какой файл сторожа проверять: стенд копий выпуска по умолчанию берёт установленный файл, остальные — `src/vypusk-okno-watch.sh`; полные имена в GUARDS · which watchdog file to test: the release-copies stand defaults to the installed file, the others to `src/vypusk-okno-watch.sh`; full names in GUARDS |
| `VYPUSK_RASKLADKA_PRISTAVKA` | приставка к путям диска для сверки по раскладке (`<приставка>/usr/local/…`); только для стенда, в бою не задавать · disk path prefix for the layout check; stands only, never set in production |
| `VYPUSK_TEST_REFERENCE` | с каким установленным файлом сверять снимок `src/` · which installed file the `src/` snapshot is compared with |

## Режим счёта · Counting mode

Зашит в код и печатается в каждом выводе: все файлы вне `node_modules`, кроме `*.bak*`, `*.tar`, `*.tgz`. Сумма — первые 16 знаков sha256 файла.

Hard-coded and printed in every output: all files outside `node_modules` except `*.bak*`, `*.tar`, `*.tgz`. The checksum is the first 16 hex digits of the file's sha256.

## Коды выхода · Exit codes

| Код · Code | Значит · Meaning |
|---|---|
| 0 | всё сошлось (сведения INFO и «вне области» не меняют код) · everything matched (INFO and "out of scope" do not change the code) |
| 1 | расхождение хотя бы у одного пакета или ссылки · divergence in at least one package or link |
| 2 | слепота: сверять нечем · blindness: nothing to compare against |
| 3 | ошибка вызова: передан иной довод командной строки · call error: an unsupported argument was passed |

| 4 | отложено по адресному окну монтажа, не доказанное тождество · deferred by an addressed deployment window; not proven identity |

`--avto-montazh` включает адресную отсрочку: код 4 — «отложено», не «сошлось». Без ключа — строгий ручной прогон. Нужен `montazh-okno` из `dsh-montazh`; предел пересъёма — один. Подробные границы — в ARCHITECTURE.md, «Автоматическая отсрочка».

`--avto-montazh` enables addressed deferral: exit 4 means deferred, not matched. Without the flag the manual run stays strict. Requires `montazh-okno` from `dsh-montazh`; at most one resample. See ARCHITECTURE.md, “Automatic deferral”, for its boundaries.

B-N-2032: оконный стенд теперь содержит 11 методов (прежние8 и3 проверки producer/закрытия). Нужен читаемый registry reader `MO_REESTR_PRIBOR` (умолчание `/usr/local/bin/agent-plugins`, dsh-reestr2.0.13); его настоящий `run(..., verify=True)` используется helper при закрытии. Предметы/реестр/версии/канал остаются приватными. `MO_DEREVO_REPO` и `MO_DEREVO_PRIBOR` стенд задаёт на свои фикстуры, живую конфигурацию службы не читает. Нет helper/root/reader — код2, без traceback.

The window stand has 11 methods:8existing plus3 actual producer/registry-closure checks. It requires the readable registry reader `MO_REESTR_PRIBOR` (default `/usr/local/bin/agent-plugins`, dsh-reestr2.0.13); closure uses its actual verify function. Every subject/registry/version/channel remains private; the stand pins its own repo and VOW source, without reading the live unit configuration. Missing helper/root/reader gives blindness2.

Отсутствующее и пустое VYPUSK_REPO дают отказ вызова3 до любых отправок/состояния/helper, также в --avto-montazh; заданный, но неверный путь остаётся слепотой2. Остальные обязательные настройки проверяются после этой границы.

Missing or empty VYPUSK_REPO refuses3 before sender/state/helper, also in --avto-montazh; an explicit invalid path remains blindness2. Other mandatory settings are checked after this boundary.
