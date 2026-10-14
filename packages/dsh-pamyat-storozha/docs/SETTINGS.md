# Настройки · Settings

Настройки плагина задаются в cordis YAML (профиль или пресет агента) в блоке `config`; схема — `Config` в `src/index.js` (schemastery). Кроме них пакет читает пять переменных окружения процесса агента.

Plugin settings are set in cordis YAML (agent profile or preset) in the `config` block; the schema is `Config` in `src/index.js` (schemastery). Besides them the package reads five environment variables of the agent process.

```yaml
- insert:
    - name: dsh-pamyat-storozha
      id: dsh-pamyat-storozha
      config:
        agent: <agent>
        ispolnenieInstrumentov: sdk
        stupeni: [0.85, 0.9]
        predel: 1000000
        komandaStoka: '<команда стока · sink command>'
```

## Настройки плагина · Plugin settings

### `agent`

| Тип · Type | Умолчание · Default | Пример · Example |
|---|---|---|
| string | `''` | `agent: <agent>` |

Имя агента: стоит в каждой тревоге («агент <agent> · …») и служит ключом стража одиночного монтажа. Пусто — каждая тревога говорит «агент НЕ НАЗВАН (настройка agent пуста)». Имя-умолчание не подставляется намеренно: угадать агента изнутри нечем.

The agent name: it appears in every alarm ("агент <agent> · …") and is the key of the single-mount guard. Empty — every alarm says "агент НЕ НАЗВАН (настройка agent пуста)" (agent NOT NAMED, setting empty). No default name is substituted on purpose: there is nothing inside to guess the agent from.

**Что сломается при неверном · What breaks if wrong:** пусто у двух агентов в одном процессе — оба получают ключ `''`, второй сторож молча не встанет (печатается только «второй монтаж пропущен»). Чужое имя — тревоги подписаны не тем агентом. Имя не влияет на поиск файла порогов: тот ищется по `KOMPAKT_AGENT`.

Empty for two agents in one process — both get the key `''`, the second guard silently does not start (only "второй монтаж пропущен" is printed). Someone else's name — alarms are signed by the wrong agent. The name does not affect finding the threshold file: that uses `KOMPAKT_AGENT`.

### `ispolnenieInstrumentov`

| Тип · Type | Умолчание · Default | Пример · Example |
|---|---|---|
| `'sdk'` \| `'dsh'` \| `'unknown'` | `'unknown'` | `ispolnenieInstrumentov: dsh` |

Кто исполняет инструменты агента: `sdk` — внешний SDK (результаты инструментов не попадают в сессию платформы, обрезки не бывает), `dsh` — сама платформа (обрезка `compaction/prune` возможна), `unknown` — не установлено. Влияет только на строку сводки: `sdk` — «обрезка: неприменимо (инструменты в SDK)»; `dsh` — «обрезок без модели N» и, пока N = 0, пояснение нуля; `unknown` — «обрезка: не установлено».

Who executes the agent's tools: `sdk` — an external SDK (tool results do not enter the platform session, there is no prune), `dsh` — the platform itself (`compaction/prune` is possible), `unknown` — not established. It affects only the summary line: `sdk` — "обрезка: неприменимо (инструменты в SDK)" (prune: not applicable); `dsh` — "обрезок без модели N" (N prunes without a model) and, while N = 0, an explanation of the zero; `unknown` — "обрезка: не установлено" (prune: not established).

**Что сломается при неверном · What breaks if wrong:** значение вне трёх — схема отвергнет настройку при монтаже. `sdk` при настоящем исполнителе `dsh` — настоящие обрезки всё равно будут напечатаны строкой, но сводка назовёт их «неприменимыми». Настройка относится ко всему процессу; при смешанных исполнителях оставьте `unknown`.

A value outside the three — the schema rejects the settings at mount time. `sdk` when the real executor is `dsh` — real prunes are still printed as lines, but the summary calls them "not applicable". The setting applies to the whole process; with mixed executors leave `unknown`.

### `stupeni`

| Тип · Type | Умолчание · Default | Пример · Example |
|---|---|---|
| number[] | `[0.85, 0.9]` | `stupeni: [0.8, 0.9, 0.95]` |

Ступени тревоги — доли **порога сжатия** (не окна). Каждая отдаётся один раз до следующего сжатия своей сессии. Значок: 🟠 если среди перейдённых есть ступень ≥ 0,9, иначе 🟡.

Alarm stages — shares of the **compaction threshold** (not the window). Each is reported once until the next compaction of its session. Icon: 🟠 if a crossed stage ≥ 0.9 is among them, otherwise 🟡.

**Что сломается при неверном · What breaks if wrong:** пустой список — тревог ступеней нет вовсе (молча). Значения > 1 — ступень за порогом сжатия, до неё обычно не доходит. Ступени округляются до процента (`round(ступень × 100)`): 0,855 станет 86%.

An empty list — no stage alarms at all (silently). Values > 1 — a stage above the compaction threshold, usually never reached. Stages are rounded to a percent (`round(stage × 100)`): 0.855 becomes 86%.

### `predel`

| Тип · Type | Умолчание · Default | Пример · Example |
|---|---|---|
| number (токены · tokens) | `0` | `predel: 1000000` |

Запасное окно контекста. Берётся, только если платформа окна не объявила (`requestContext()` без `contextWindow`); тогда строка тревоги говорит «окно — НАСТРОЙКА (платформой не подтверждена: …)». Если платформа окно объявила и оно отличается от `predel`, один раз за жизнь процесса печатается «предел в настройке … РАСХОДИТСЯ с окном, объявленным платформой» (и уходит в сток), а считается по платформе. `0` — запасного окна нет.

A fallback context window. Used only if the platform has announced no window (`requestContext()` without `contextWindow`); then the alarm line says "окно — НАСТРОЙКА (платформой не подтверждена: …)" (window — SETTING, not confirmed by the platform). If the platform announced a window that differs from `predel`, once per process lifetime it prints "предел в настройке … РАСХОДИТСЯ с окном, объявленным платформой" (the configured limit DIFFERS from the platform window; also sent to the sink), and counting follows the platform. `0` — no fallback window.

**Что сломается при неверном · What breaks if wrong:** `0` при модели без объявленного окна и без готового D — ступени не считаются (одна строка «ступени НЕ считаются …»). Устаревшее число — тревога о расхождении на первом замере после каждого подъёма, пока число не уберут или не поправят.

`0` without an announced window and without ready D — stages are not computed (one line "ступени НЕ считаются …"). A stale number — a mismatch alarm at the first measurement after every start-up until the number is removed or corrected.

### `komandaStoka`

| Тип · Type | Умолчание · Default | Пример · Example |
|---|---|---|
| string | нет — ключ без умолчания · none — the key has no default | `komandaStoka: 'logger -t storozha'` |

Внешний сток: `/bin/sh -c <komandaStoka>` запускается асинхронно и получает текст на stdin; обработчик события не ждёт команду. Ступень отдаёт короткую строку «🟠 Заря: контекст 93% порога (…)». Успешное сжатие — «🗜 Заря: сжатие 742 → 27 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash»: после первого usage этой сессии, либо после срока ожидания без числа «после». Провал, обрезка и расхождение окна сохраняют подробную строку с «агент <agent> · …». Сводка и служебные строки идут только в журнал.

The sink runs `/bin/sh -c <komandaStoka>` asynchronously with text on stdin; the event handler does not wait. Fill and successful compaction use short owner lines. The compaction line waits for the session's first usage or the timeout, then omits the after value if unavailable. Failure, prune and window mismatch keep the detailed agent-prefixed line. Summaries and service lines are log-only.

Ожидание оболочки — до 5 с; ошибка команды/таймаут называется в журнале. Это не предел доставки и не остановка всех потомков оболочки: отдельный фоновый потомок может продолжать работу. При выгрузке снимаются таймеры ещё не отданного сжатия; уже начатая команда не отменяется. При частых тревогах команды могут выполняться одновременно. Сток отвечает за своё ограничение повторов/параллельности и фактическую доставку.

The shell timeout is 5 s; command failure/timeout is logged. This bounds waiting for the shell, not delivery or all descendants: background children may continue. Unload cancels unsent-compaction timers; a command already started is not cancelled. Sink commands may overlap and must enforce their own retry/concurrency limits and delivery contract.

Имена коротких строк: iskra→Искра, zarya→Заря, avrora→Аврора, spartak→Спартак, varvara→Варвара, alfa→Альфа, beta→Бета, gamma→Гамма, marc→Марк, petrovich→Петрович; другое имя — значение `agent`, пустое остаётся пустым; всегда задавайте agent. Таблица IMENA находится в `src/index.js`.

Short-line names use the built-in IMENA table above; other names use `agent`, and an empty value stays empty; always set agent.

Три состояния различаются в строке подъёма: задан — «сток задан»; `komandaStoka: ''` — «сток ВЫКЛЮЧЕН намеренно (komandaStoka пуст) — тревога только в журнал»; ключа нет — «сток НЕ ЗАДАН — ключа нет в наборе (похоже на упущение)».

The three states are distinguished in the start-up line: set — "сток задан"; `komandaStoka: ''` — "сток ВЫКЛЮЧЕН намеренно" (sink switched off on purpose — log only); key absent — "сток НЕ ЗАДАН — ключа нет в наборе" (sink NOT SET — key absent, looks like an omission).

**Что сломается при неверном · What breaks if wrong:** команда, которая ждёт ввода дольше 5 с или падает, — строка отказа на каждую тревогу. ⚠️ Команда исполняется с правами процесса агента; это доверенная настройка — не подставляйте в неё внешний ввод.

A command that waits for input longer than 5 s or fails — a failure line for every alarm. ⚠️ The command runs with the agent process privileges; it is a trusted setting — never substitute external input into it.

### `trevogaSzhatiya`

Boolean, умолчание `true`: отдавать короткую строку успешного сжатия владельцу. `false` выключает только эту строку; провал сжатия и журнал не выключаются.

Boolean, default `true`: send the short successful-compaction line to the owner. `false` disables only that line, not compaction failures or the log.

## Переменные окружения · Environment variables

| Переменная · Variable | Что значит · Meaning | Если не задана · If unset |
|---|---|---|
| `KOMPAKT_AGENT` | имя агента для поиска файла порогов `<katalog>/<KOMPAKT_AGENT>.json` (только `[A-Za-z0-9_-]`) · agent name for finding the threshold file `<katalog>/<KOMPAKT_AGENT>.json` (only `[A-Za-z0-9_-]`) | порог не прочитан («негодное имя агента»), ступени считаются от окна с пометкой · threshold not read ("негодное имя агента", invalid agent name), stages counted from the window with a mark |
| `KOMPAKT_NASTROJKI_KATALOG` | каталог файлов порогов; читает функция `chitatPorogD` соседа `dsh-pamyat-kompakt` · directory of threshold files; read by `chitatPorogD` of the sibling `dsh-pamyat-kompakt` | `/etc/dsh-pamyat/agenty`; файл `<каталог>/<KOMPAKT_AGENT>.json` · file `<directory>/<KOMPAKT_AGENT>.json` |
| `DSH_HOME` | каталог данных агента; отданные ступени — в `$DSH_HOME/storages/storozha-stupeni.json` · agent data directory; reported stages are in `$DSH_HOME/storages/storozha-stupeni.json` | ступени только в памяти процесса: перезапуск их сбросит и возможен повторный крик · stages in process memory only: a restart resets them and a repeated alarm is possible |
| `STOROZHA_STUPENI_FAJL` | явный путь файла ступеней (главнее `DSH_HOME`; нужен стендам) · explicit stage file path (takes precedence over `DSH_HOME`; used by stands) | берётся `DSH_HOME` · `DSH_HOME` is used |
| `STOROZHA_ZHDAT_POSLE_MS` | срок ожидания usage после сжатия, мс; число > 0, используется при загрузке модуля · after-compaction usage wait in ms, read at module load | 600000 (10 мин · min) |

## Файл порогов агента (D) · Agent threshold file (D)

Порог сжатия сторож не вычисляет, а берёт готовым из файла `<KOMPAKT_NASTROJKI_KATALOG>/<KOMPAKT_AGENT>.json` (его ведёт `dsh-pamyat-kompakt`). Нужная часть файла — поле `porogi`, проверяется строго: ровно эти ключи, `schema: 1`, маршрут по умолчанию обязан быть среди `routes`, `0 < ratio < 1`, `0 < nominalThreshold < window`.

The guard does not compute the compaction threshold but takes it ready-made from `<KOMPAKT_NASTROJKI_KATALOG>/<KOMPAKT_AGENT>.json` (maintained by `dsh-pamyat-kompakt`). The relevant part is the `porogi` field, checked strictly: exactly these keys, `schema: 1`, the default route must be among `routes`, `0 < ratio < 1`, `0 < nominalThreshold < window`.

```json
{
  "porogi": {
    "schema": 1,
    "defaultRoute": { "provider": "<provider>", "model": "<model>" },
    "routes": [
      { "provider": "<provider>", "model": "<model>", "window": 1000000, "ratio": 0.89, "nominalThreshold": 890000 }
    ]
  }
}
```

Маршрут замера — провайдер и модель текущего запроса сессии. Если маршрута в `routes` нет, файл нечитаем или не той формы — порог «НЕ ПРОЧИТАН» с причиной, и ступени считаются от окна. Строка тревоги называет источник порога: `(request)` — по маршруту запроса; `(defaultRoute)` — по маршруту по умолчанию из файла, когда маршрут запроса неизвестен (у сессии нет ни заголовка запроса, ни объявленного маршрута). Строка подъёма показывает только долю маршрута по умолчанию («сейчас 0.89»).

The measurement route is the provider and model of the session's current request. If the route is not in `routes`, or the file is unreadable or malformed — the threshold is "НЕ ПРОЧИТАН" (NOT READ) with a reason, and stages are counted from the window. The alarm line names the threshold source: `(request)` — by the request route; `(defaultRoute)` — by the file's default route, when the request route is unknown (the session has neither a request header nor an announced route). The start-up line shows only the default route's ratio ("сейчас 0.89").

## Файл настройки приборов · Tools settings file

Приборы и сторожа каталога `bin/` (см. [BIN.md](BIN.md)) берут частные значения из одного файла: `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`, путь меняет переменная `DSH_PAMYAT_STOROZHA_CONF`. Плагин `src/` этот файл не читает.

The tools and watchers of `bin/` (see [BIN.md](BIN.md)) take private values from one file: `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`; the `DSH_PAMYAT_STOROZHA_CONF` variable changes the path. The `src/` plugin does not read this file.

Формат: строки `КЛЮЧ=значение`; пробелы вокруг `=` и по краям значения отбрасываются; строка с `#` в начале — комментарий, и только она: значение, в котором есть « #» (пробел или таб перед `#`), — громкий отказ с названием ключа (Node и bash — код `2`, у `rubezh-otnoshenij-watch` — ещё и в канал; Python — код `3`, провал для юнитов, считающих успехом `1` и `2`), а не пояснение, склеенное со значением; `#` без пробела перед ним — часть значения. При повторе ключа действует последнее вхождение, отказ судит его. Разборщик одинаков в трёх языках (bash, Python, Node), это проверяет `test/stend-nastrojki.sh`.

Format: `KEY=value` lines; spaces around `=` and at the edges of the value are dropped; a line starting with `#` is a comment, and only that: a value containing " #" (a space or tab before `#`) is a loud refusal naming the key (Node and bash — code `2`, `rubezh-otnoshenij-watch` also to the channel; Python — code `3`, a failure for units counting `1` and `2` as success), not a note glued into the value; `#` without a space before it is part of the value. If a key repeats, the last occurrence wins, and the refusal judges it. The parser is the same in three languages (bash, Python, Node); `test/stend-nastrojki.sh` checks this.

Порядок значения: довод или переменная модуля (где предусмотрена) → файл → нейтральное умолчание (где оно есть). Нет ничего — модуль печатает `СЛЕПОТА` с именем ключа и выходит с кодом `2`, ничего не делая.

Value order: the module's argument or variable (where provided) → the file → a neutral default (where there is one). Nothing at all — the module prints `СЛЕПОТА` with the key name and exits with code `2`, doing nothing.

| Ключ · Key | Модули · Modules | Значение · Meaning | Нет значения · No value |
|---|---|---|---|
| `PAMYAT_CORE` | `pamyat-vernut-povtor`, `omega-kopiya-watch`, `proverka-opory --zapisat`, `proba-sleda-podyoma` | корень пакета ядра памяти (`…/dsh-pamyat-core`); у `proba-sleda-podyoma` из него выводятся корень пакетов и cordis · memory core package root; `proba-sleda-podyoma` derives the package root and cordis from it | отказ, код 2; у `omega-kopiya-watch` — признак 5 «НЕ ИЗМЕРЕНО» · refusal, code 2; sign 5 "НЕ ИЗМЕРЕНО" |
| `PAMYAT_BAZA` | `sverka-s-istochnikom`, `proverka-cepi-boem`, `proverka-opory`, `rubezh-otnoshenij-watch` | база `pamyat.db` агента · the agent's `pamyat.db` | СЛЕПОТА, код 2 |
| `DSH_SESSII` | `proverka-opory`, `sverka-s-istochnikom` | каталог сессий агента (`<дом>/.dsh/sessions/<проект>`) · agent session directory | СЛЕПОТА, код 2 |
| `OTKLONENNYE_KATALOG` | `chitatel-otklonennyh` | каталог отклонённых сводок · rejected summaries directory | СЛЕПОТА, код 2 (если нет довода) |
| `CHITATEL_RUKA` | `chitatel-otklonennyh` | подпись руки в файле решения · hand signature in the decision file | без подписи · no signature |
| `CEP_UNIT` | `proverka-cepi-boem` | юнит службы агента, чей журнал читается · agent service unit | СЛЕПОТА, код 2 |
| `SLED_PROFIL` | `proba-sleda-podyoma` | профиль `cordis.patch.yml` агента · the agent's profile | СЛЕПОТА, код 2 |
| `DSH_PLUGINS_KLON` | `sostav-nabora`, `stendy-vseh-paketov.sh` | клон дерева пакетов (`packages/` внутри) · package tree clone | СЛЕПОТА, код 2 |
| `STENDY_SPISOK_SLEPOTY` | `stendy-vseh-paketov.sh` | список принятой слепоты · accepted blindness list | `prinyataya-slepota.txt` рядом со скриптом · next to the script |
| `AGENT_REGISTRY` | `session-agent-preset-watch`, `session-writer-watch.py` | реестр агентов `agents.yaml` · agent registry | СЛЕПОТА, код 2 |
| `SWW_PAUZA_DIR` | `session-writer-watch.py` | каталог файлов паузы `<каталог>/<агент>/pauza.json` · pause files directory | СЛЕПОТА, код 2 |
| `SWW_VERSIYA` | `session-writer-watch.py` | строка версии в `--version` и выводе · version string | `session-writer-watch 3` |
| `SWW_CHITATEL` | `session-writer-watch.py` | назначенный читатель в поле `reader` · assigned reader | `не назначен` |
| `KP_ISHODY` | `kompakt-priemka` (codex) | каталог исходов компакта Codex (`state.json`, `turns/`) · Codex compaction outcomes | СЛЕПОТА, код 2 |
| `KP_SHLYUZ` | `kompakt-priemka` (codex) | каталог шлюза агента, шаблон с `{agent}` · agent gateway directory template | СЛЕПОТА, код 2 |
| `OKW_PAMYAT` | `omega-kopiya-watch` | шаблоны баз `pamyat.db` через `:` (glob) · `:`-separated glob patterns | СЛЕПОТА, код 2 |
| `OKW_STATE` | `omega-kopiya-watch` | файл памяти отданных тревог · sent-alarms state file | СЛЕПОТА в канал, код 3 · BLINDNESS to the channel, code 3 |
| `OKW_PRAVKI` | `omega-kopiya-watch` | перечень локальных правок поставки OMEGA · list of local OMEGA patches | признак 6 в слепоту · sign 6 blind |
| `OKW_ISKLYUCHENIYA` | `omega-kopiya-watch` | исключения «агент:id» через пробел · "agent:id" exclusions | исключений нет · none |
| `OKW_IMYA` | `omega-kopiya-watch` | «каталог:корень OMEGA» через пробел · "directory:OMEGA root" pairs | имя каталога = корень · directory name = root |

Переменные модулей (`OKW_*`, `RUBEZH_*`, `RASSHCH_*`, `PRESET_WATCH_*`, `SESSION_WRITER_PAUZA_DIR`, `STENDY_PKG_DIR`, `CEP_BAZA`, `PAMYAT_VERNUT_CORE`, `PROBA_PROFIL`) по-прежнему стоят выше файла; часть из них — только для стендов.

Module variables (`OKW_*`, `RUBEZH_*`, `RASSHCH_*`, `PRESET_WATCH_*`, `SESSION_WRITER_PAUZA_DIR`, `STENDY_PKG_DIR`, `CEP_BAZA`, `PAMYAT_VERNUT_CORE`, `PROBA_PROFIL`) still take precedence over the file; some of them are for stands only.

```ini
# /etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf — пример; <…> заменить своими путями · example; replace <…> with your paths
PAMYAT_CORE=<node_modules>/dsh-pamyat-core
PAMYAT_BAZA=<дом агента>/pamyat/pamyat.db
DSH_SESSII=<дом агента>/.dsh/sessions/<проект>
CEP_UNIT=<агент>.service
AGENT_REGISTRY=<реестр агентов>.yaml
OKW_PAMYAT=<корень домов>/*/pamyat/pamyat.db
OKW_STATE=/var/lib/dsh-pamyat-storozha/omega-kopiya-watch.json
KP_SHLYUZ=<каталог шлюзов>/{agent}
```

Сторож хранит охват последних 128 сессий по последнему событию; вытеснение названо в сводке. Файл ступеней хранит не более 128 сессий по времени последней отправки/сброса ступени (kogda). Старые записи режутся при загрузке/записи. При возврате вытеснённой сессии ступень может быть отдана повторно; это ограниченный dedup, не вечный архив. Без событий очистка в памяти не вызывается. Другие карты незавершённых сжатий эта граница не ограничивает.

Coverage retains the 128 most recently active sessions; eviction is reported in the summary. The stage file retains 128 sessions by the last stage send/reset time (kogda). Old entries are trimmed on load/write. A returning evicted session may alert again: this is bounded dedup, not a permanent archive. This cap does not bound the unfinished-compaction maps.
