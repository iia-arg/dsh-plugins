# Приборы и сторожа вне плагина · Tools and watchers outside the plugin (`bin/`)

Каталог `bin/` — четырнадцать самостоятельных программ обслуживания памяти. Плагин (`src/`) их не загружает и не зовёт: каждую зовёт свой таймер, ворота или человек. Частные значения (пути баз, каталоги сессий, имена юнитов) берутся из файла настройки пакета — см. [SETTINGS.md](SETTINGS.md#файл-настройки-приборов--tools-settings-file).

The `bin/` directory holds fourteen standalone memory maintenance programs. The plugin (`src/`) neither loads nor calls them: each one is called by its own timer, gate or person. Private values (database paths, session directories, unit names) come from the package settings file — see [SETTINGS.md](SETTINGS.md#файл-настройки-приборов--tools-settings-file).

Общий договор кодов: `0` — проверено, сошлось; `1` — проверено, разошлось (тревога); `2` — проверять нечем (СЛЕПОТА), в том числе когда не задан нужный ключ настройки. Исключения названы у модуля.

Node для приборов с node:sqlite — 22.13+; Python-инструменты требуют свою указанную среду.

Node tools using node:sqlite need 22.13+; Python tools need their listed runtime.

Common exit-code contract: `0` — checked, matches; `1` — checked, differs (alarm); `2` — nothing to check with (BLINDNESS), including when a required settings key is not set. Exceptions are named per module.

| Модуль · Module | Среда · Runtime | Что делает · What it does | Ключи · Keys |
|---|---|---|---|
| `pamyat-vernut-povtor` | Node | возврат статьи, которую секретарь счёл повтором · returns an article the secretary judged a repeat | `PAMYAT_CORE` |
| `chitatel-otklonennyh.mjs` | Node | решения по отклонённым сводкам рядом с файлом · decisions on rejected summaries next to the file | `OTKLONENNYE_KATALOG`, `CHITATEL_RUKA` |
| `sverka-s-istochnikom.mjs` | Node, `zstd` | сверка записей с опорой в журнале сессии, без записи · checks records against their session-log anchor, read-only | `PAMYAT_BAZA`, `DSH_SESSII` |
| `proverka-opory.mjs` | Node, `zstd` | есть ли у записи свидетель; `--zapisat` кладёт отметки · does a record have a witness; `--zapisat` stores marks | `PAMYAT_BAZA`, `DSH_SESSII`, `PAMYAT_CORE` |
| `proverka-cepi-boem.mjs` | Node, `journalctl` | совпадает ли вставленное в сессию с базой · does the injected text match the database | `PAMYAT_BAZA`, `CEP_UNIT` |
| `proba-sleda-podyoma.mjs` | Node | подали ли шесть выбранных cordis-плагинов строку подъёма · did the six selected cordis plugins print their start-up line | `PAMYAT_CORE`, `SLED_PROFIL` |
| `sostav-nabora.mjs` | Node, `git`, сеть · network | состав набора по условию «последняя принятая версия» · set composition by "last accepted version" | `DSH_PLUGINS_KLON` |
| `rubezh-otnoshenij-watch` | bash, `sqlite3` | один раз сказать, что рубеж отношений встал верно · say once that the relations boundary is correct | `PAMYAT_BAZA` |
| `stendy-vseh-paketov.sh` | bash | прогон стендов всех пакетов со знаменателем · runs all package stands with a denominator | `DSH_PLUGINS_KLON`, `STENDY_SPISOK_SLEPOTY` |
| `session-agent-preset-watch` | Python 3, PyYAML | заголовки сессий без `agentPreset` · session headers without `agentPreset` | `AGENT_REGISTRY` |
| `session-writer-watch.py` | Python 3, PyYAML | повторный отказ единственного писателя сессии · repeated single-writer refusal | `AGENT_REGISTRY`, `SWW_PAUZA_DIR`, `SWW_VERSIYA`, `SWW_CHITATEL` |
| `rasshcheplenie-otmeny-watch` | Python OMEGA (`/opt/omega/venv`) | рост расщепления «status активна / metadata отменена» · growth of the "status active / metadata superseded" split | — |
| `kompakt-priemka` | Python 3, `zstd` | приёмка сжатия DSH/Codex только чтением · read-only acceptance of DSH/Codex compaction | `KP_ISHODY`, `KP_SHLYUZ` |
| `omega-kopiya-watch` | Python 3 | доехали ли знания из `pamyat.db` в OMEGA и без срока · did knowledge reach OMEGA, without expiry | `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_ISKLYUCHENIYA`, `OKW_IMYA`, `PAMYAT_CORE` |

## По модулям · Per module

**`pamyat-vernut-povtor <файл povtoryaet-*.txt> <pamyat.db>`** — пишет текст записью ядра со связью «уточняет k» и помечает файл `vozvrashcheno-<id>`. Коды: `0` возвращено, `2` отказ до записи. Запуск от учётки агента. Не доставляет в OMEGA и не проверяет, жива ли k.

**`pamyat-vernut-povtor <povtoryaet-*.txt file> <pamyat.db>`** — writes the text as a core record linked "refines k" and marks the file `vozvrashcheno-<id>`. Codes: `0` returned, `2` refused before writing. Run as the agent's account. It does not deliver to OMEGA and does not check whether k is alive.

**`chitatel-otklonennyh.mjs [каталог]`** — тексты не трогает, решение кладёт рядом файлом `<имя>.reshenie.txt`. Файлы знаний без класса не закрывает, а помечает «ждёт решения человека». Не служба: ходит по вызову, ничего не удаляет.

**`chitatel-otklonennyh.mjs [directory]`** — leaves texts untouched and places the decision next to them as `<name>.reshenie.txt`. Knowledge files without a class are not closed but marked "waits for a human decision". Not a service: runs on call and deletes nothing.

**`sverka-s-istochnikom.mjs [pamyat.db]`** — печатает, в базу не пишет. Журнал читает внешним `zstd`: встроенная распаковка на многокадровом журнале молча отдаёт обрывок. Совместимое read-only имя proverka-opory.mjs: singleton, диапазон, #oknoN, старый/v4 журнал и внешние свидетели; все ключи записи/неизвестные ключи отвергает, код 2.

**`sverka-s-istochnikom.mjs [pamyat.db]`** — prints and never writes to the database. Reads the log with external `zstd`: the built-in decompressor silently returns a fragment on a multi-frame log. Read-only alias of proverka-opory.mjs: singleton, range, #oknoN, old/v4 and external witnesses; writing/unknown options are refused with code 2.

**`proverka-opory.mjs [pamyat.db] [--zapisat]`** — отвечает «есть ли у записи свидетель», а не «совпадает ли текст». Слепота в базу не ложится даже с `--zapisat`. Без `--zapisat` база не меняется.

**`proverka-opory.mjs [pamyat.db] [--zapisat]`** — answers "does the record have a witness", not "does the text match". Blindness is never stored, even with `--zapisat`. Without `--zapisat` the database is unchanged.

**`proverka-cepi-boem.mjs [--kontrol]`** — сравнивает id и длину последней вставки в окне журнала с базой. О более ранних вставках не говорит. `--kontrol` — встроенный контроль зрячести на подставной базе.

**`proverka-cepi-boem.mjs [--kontrol]`** — compares id and length of the last injection in the log window with the database. Says nothing about earlier injections. `--kontrol` is a built-in sight check on a stand-in database.

**`proba-sleda-podyoma.mjs`** (без шебанга — `node proba-sleda-podyoma.mjs`) — след подъёма есть признак присутствия, а не исправности. Корень пакетов — каталог рядом с ядром (`PAMYAT_CORE`), cordis — тот, что разрешает ядро; довод командной строки заменяет корень. Теги `!!js` профиля читаются строкой, сбой разбора профиля — СЛЕПОТА. Коды: `0` все подали след, `1` кто-то молчит, `2` проверять нечем. Пакеты поднимаются с боевой настройкой, поэтому детям выставляется метка пробы `DSH_PROBA=1`: `agent-alert` (dsh-trevogi ≥ 1.0.0) отвечает «проба, не отправлено» — прогон пробы владельцу не кричит. Канал, зовущий не через `agent-alert` и без этой метки, она не гасит.

**`proba-sleda-podyoma.mjs`** (no shebang — `node proba-sleda-podyoma.mjs`) — a start-up line is a sign of presence, not of correct work. The package root is the directory next to the core (`PAMYAT_CORE`), cordis is the one the core resolves; a command-line argument replaces the root. Profile `!!js` tags are read as strings, a profile parse failure is BLINDNESS. Codes: `0` all printed, `1` someone is silent, `2` nothing to check with. Packages start with production settings, so children get the probe mark `DSH_PROBA=1`: `agent-alert` (dsh-trevogi ≥ 1.0.0) answers "probe, not sent" — a probe run does not alert the owner. A channel called not via `agent-alert` and ignoring the mark is not silenced.

**`sostav-nabora.mjs`** — принятость берёт из коммитов вердиктов в клоне дерева (перед чтением делает `git fetch origin` — обновляет ссылки клона), достижимость — запросом к `registry.npmjs.org`. Число не называет — называет условие.

**`sostav-nabora.mjs`** — takes acceptance from verdict commits in the tree clone (runs `git fetch origin` first — updates the clone's refs) and reachability from a request to `registry.npmjs.org`. It names the condition, not a number.

**`rubezh-otnoshenij-watch`** — проверяет поля отношений, единственность рубежа и целость рубежа происхождения. Слепоту тоже шлёт в канал (`RUBEZH_ALERT`, умолч. `agent-alert` из `PATH`). Коды: `0` ожидание либо сказано, `1` тревога, `2` слепота.

**`rubezh-otnoshenij-watch`** — checks the relation fields, the boundary being set once and the origin boundary being intact. Blindness also goes to the channel (`RUBEZH_ALERT`, default `agent-alert` from `PATH`). Codes: `0` waiting or reported, `1` alarm, `2` blindness.

**`stendy-vseh-paketov.sh`** — четыре разряда: зелёный, красный, слепой, оборванный на середине. Знаменатель печатается всегда. Принятая слепота — по списку `STENDY_SPISOK_SLEPOTY` (умолч. — `prinyataya-slepota.txt` рядом со скриптом).

**`stendy-vseh-paketov.sh`** — four classes: green, red, blind, cut off half-way. The denominator is always printed. Accepted blindness comes from the `STENDY_SPISOK_SLEPOTY` list (default — `prinyataya-slepota.txt` next to the script).

**`session-agent-preset-watch [--json|--watch]`** — читает только первую строку журнала каждой сессии агентов из реестра. Субагентские заголовки считает, но не судит. Не задан реестр — `СЛЕПОТА preset-watch` с причиной (файла настройки нет / есть, но не читается / ключа нет), код `2`; в режиме `--watch` — ещё и тревога в канал, один раз на текст (подпись в `last.json`). Прочие слепоты — код `3`, только в журнал.

**`session-agent-preset-watch [--json|--watch]`** — reads only the first log line of each session of the registry's agents. Subagent headers are counted but not judged. No registry — `СЛЕПОТА preset-watch` with the cause (no settings file / exists but unreadable / no key), code `2`; in `--watch` mode also an alarm to the channel, once per text (signature in `last.json`). Other blindness — code `3`, journal only.

**`session-writer-watch.py [--check]`** — тревога, если отказ писателя повторяется дольше 5 минут у живого процесса. Агент на паузе по `/stop` даёт строку, а не тревогу. Каталог паузы — общий договор с тем, кто пишет паузу: умолчания нет, не задан — СЛЕПОТА, код `2`. Имя узла в тексте тревоги — `os.uname().nodename`.

**`session-writer-watch.py [--check]`** — alarms when a writer refusal repeats for over 5 minutes on a live process. An agent paused by `/stop` gives a line, not an alarm. The pause directory is a shared contract with the pause writer: no default; unset — BLINDNESS, code `2`. The node name in the alarm text is `os.uname().nodename`.

**`rasshcheplenie-otmeny-watch`** — рост — код `3`, а не `1`: код `1` у `sudo -n` занят его собственными отказами. Ключей настройки нет; шебанг указывает на Python службы OMEGA (`/opt/omega/venv/bin/python3`).

**`rasshcheplenie-otmeny-watch`** — growth is code `3`, not `1`: code `1` of `sudo -n` is taken by its own refusals. No settings keys; the shebang points at the OMEGA service Python (`/opt/omega/venv/bin/python3`).

**`kompakt-priemka <агент> [--since …] [--json]`** — дом и семейство берёт из `agent-registry`. Ключи `KP_*` нужны только семейству `codex`; `KP_SHLYUZ` — шаблон с `{agent}`. Не заданы — СЛЕПОТА, код `2`.

**`kompakt-priemka <agent> [--since …] [--json]`** — takes home and family from `agent-registry`. The `KP_*` keys are needed only by the `codex` family; `KP_SHLYUZ` is a template with `{agent}`. Unset — BLINDNESS, code `2`.

**`omega-kopiya-watch`** — семь признаков (без копии, «копирование встало», срок жизни, бесхозные, доверие с недельной сводкой, правка поставки OMEGA, модель эмбеддинга). Отметка «названо» ставится только после успеха канала. Не задан `OKW_STATE` — СЛЕПОТА с причиной (файла настройки нет / есть, но не читается / ключа нет), тревога в канал каждый такт до исправления (памяти отданного без файла состояния нет) и код `3` — коды 1 и 2 юнит считает успехом; не задан `PAMYAT_CORE` — признак 5 «НЕ ИЗМЕРЕНО».

**`omega-kopiya-watch`** — seven signs (no copy, "copying stopped", expiry, ownerless, trust with a weekly summary, OMEGA delivery patch, embedding model). The "reported" mark is set only after the channel succeeds. `OKW_STATE` unset — BLINDNESS with the cause (no settings file / exists but unreadable / no key), an alarm to the channel every cycle until fixed (without the state file there is no memory of what was sent) and code `3` — the unit counts codes 1 and 2 as success; `PAMYAT_CORE` unset — sign 5 "НЕ ИЗМЕРЕНО".

## Стенды · Stands

| Стенд · Stand | Модуль · Module | Окружение · Environment |
|---|---|---|
| `test/stend-nastrojki.sh` | все с ключами · all with keys | переносим; каналы тревоги подменены · portable; alarm channels replaced |
| `test/stend-slepoty-nastrojki.sh` | `omega-kopiya-watch`, `session-agent-preset-watch` | слепота настройки в подменённом канале: файла нет / файл 000 / ключа нет / возврат; не от root · settings blindness in a substituted channel: no file / mode 000 / no key / return; not as root |
| `test/stend-proverki-opory.mjs` | `proverka-opory.mjs` | `STEND_CORE` или `PAMYAT_CORE` — ядро памяти · the memory core |
| `test/stend-modeli-omega.sh <сторож>` | `omega-kopiya-watch`, признак 7 | без sudo; боевые каталог модели и `systemctl` — чтение · no sudo; live model dir and `systemctl` — read |
| `test/stend-pravki-postavki-omega.sh <сторож>` | `omega-kopiya-watch`, признак 6 | sudo-копия OMEGA; `STEND_PUNKT_SEARCH`, `STEND_PUNKT_BRIDGE`, `STEND_PUNKT_HANDLERS`, `STEND_PRAVKI` или `STEND_KONF` |
| `test/stend-svodki-doveriya.sh <сторож>` | `omega-kopiya-watch`, признак 5б | sudo-копия OMEGA · sudo copy of OMEGA |

`npm test` гоняет только `test/stend-*.mjs`. Стенды `.sh` зовутся отдельно с путём к сторожу; три стенда OMEGA привязаны к установленной OMEGA и в суточный обход не ставятся.

`npm test` runs only `test/stend-*.mjs`. The `.sh` stands are called separately with the watcher path; the three OMEGA stands depend on an installed OMEGA and are not for a daily run.

Граница proba-sleda-podyoma: только core, omega, secretary, byudzhet, nudzh, restore — шесть cordis-плагинов. Члены набора storozha/kompakt/kompakt-dsh этим прибором не проверяются; у библиотек другой договор загрузки. Наличие всего набора он не доказывает.

proba-sleda-podyoma covers only the six cordis plugins listed above, not storozha/kompakt/kompakt-dsh or the complete umbrella set.

Файл prinyataya-slepota.txt в архив не входит: его создаёт оператор по принятому перечню либо задаёт STENDY_SPISOK_SLEPOTY. Отсутствие означает, что принятых слепот нет; слепота даёт 2, а не зелёное.

The operator supplies prinyataya-slepota.txt or STENDY_SPISOK_SLEPOTY. It is absent from the archive; an absent file means no blindness is accepted.

RUBEZH_BAZA/SOST/ALERT задают базу, файл отметки и канал. Перед переносом на другую машину задайте RUBEZH_MONTAZH_MAXID (умолчание 2912), RUBEZH_MONTAZH_TS (1790004368), RUBEZH_PREDEL_SUTOK (7). Это замеры одного монтажа sadik, не универсальные значения. Рубеж происхождения 68 зашит в коде и переменной не переопределяется; для другого рубежа нужна отдельная правка кандидата и приёмка. Неверный профиль машины даёт тревогу даже на исправной чужой базе.

RUBEZH_BAZA/SOST/ALERT choose the DB, report marker and channel. On another machine configure RUBEZH_MONTAZH_MAXID (2912), RUBEZH_MONTAZH_TS (1790004368) and RUBEZH_PREDEL_SUTOK (7): these defaults describe one sadik deployment. Provenance boundary 68 is hard-coded and has no environment override; a different boundary requires a candidate edit and review.
