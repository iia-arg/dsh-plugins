# dsh-pamyat-kompakt-dsh

**Версия:** 3.1.4

## Назначение · Purpose

Движок сжатия контекста для платформы DSH: класс `NashaSvodka`, наследник родного `BasicCompactionEngine` из `@deepseek-ai/dsh-compaction-basic`. Момент сжатия, выбор и затенение узлов, запись в журнал сессии и возврат сводки в контекст остаются родными; сводку пишет модель соседнего пакета `dsh-pamyat-kompakt` (`svodkaNashejModelyu`), а при любой ошибке работа отдаётся родной сводке платформы. Сверх сводки пакет ограничивает удержание половиной поверхности (иначе родной выбор молча отдаёт «нечего сжимать»), на маршруте Codex ждёт свежего usage после сжатия и после успешного сжатия со сводкой `[MODE=ACTIVE]` один раз будит агента отметкой продолжения.

A context compaction engine for the DSH platform: the class `NashaSvodka`, a subclass of the native `BasicCompactionEngine` from `@deepseek-ai/dsh-compaction-basic`. The compaction moment, node selection and shadowing, the session journal record and returning the summary into the context stay native; the summary is written by the model of the sibling package `dsh-pamyat-kompakt` (`svodkaNashejModelyu`), and on any error the work is handed back to the platform's native summary. Beyond the summary the package caps retention at half of the surface (otherwise the native selection silently returns "nothing to compact"), waits for fresh usage after compaction on the Codex route, and after a successful compaction with an `[MODE=ACTIVE]` summary wakes the agent once with a continuation marker.

## Что ставится и куда · What gets installed and where

Состав публикации задан полем `files` в `package.json`; `package.json` и `LICENSE` npm кладёт в архив и без перечня:

| Файл | Что это |
|---|---|
| `index.mjs` | главный модуль (`main`): класс `NashaSvodka` (он же `default`), сторож свежего usage `storozhUsage`, помощники журнала и хвоста |
| `marker-step.mjs` | отметка продолжения после сжатия (`installMarker`) и аудит журнала службы при старте |
| `continuation-mode.mjs` | файл настройки пакета (пути внешних команд) и файл режима Codex-маркера |
| `stend-*.mjs` | стенды (раздел «Проверка») |
| `LICENSE` | лицензия MIT (поле `license` в `package.json`) |
| `CHANGELOG.md`, `README.md`, `docs/` | журнал изменений и документация (`docs/ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md`) |

The published contents are set by the `files` field of `package.json`; npm puts `package.json` and `LICENSE` into the archive even without the list:

| File | What it is |
|---|---|
| `index.mjs` | main module (`main`): the class `NashaSvodka` (also `default`), the fresh-usage watchdog `storozhUsage`, journal and tail helpers |
| `marker-step.mjs` | the continuation marker after compaction (`installMarker`) and the service journal audit at start-up |
| `continuation-mode.mjs` | the package settings file (paths of external commands) and the Codex marker mode file |
| `stend-*.mjs` | stands (see "Verification") |
| `LICENSE` | MIT license (the `license` field in `package.json`) |
| `CHANGELOG.md`, `README.md`, `docs/` | changelog and documentation (`docs/ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md`) |

Полей `scripts` и `dependencies` в `package.json` нет; `dsh-pamyat-kompakt` указан только в `devDependencies` как каталог соседа в дереве (`file:../dsh-pamyat-kompakt`). Так оставлено намеренно: `dsh-pamyat-kompakt` в реестр npm не опубликован (`npm view dsh-pamyat-kompakt` — E404). Эту ссылку снимут при его первой публикации.

`package.json` has no `scripts` and no `dependencies`; `dsh-pamyat-kompakt` is listed only in `devDependencies`, as the sibling's directory in the tree (`file:../dsh-pamyat-kompakt`). This is intentional: `dsh-pamyat-kompakt` is not published to the npm registry (`npm view dsh-pamyat-kompakt` — E404). The link will be removed at its first publication.

На рабочей машине:

- пакет стоит в `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh` (владелец root, группа agent-plugins);
- в профиль `web` каждого агента он попадает ссылкой `/opt/<агент>/.dsh/profiles/web/node_modules/dsh-pamyat-kompakt-dsh` → `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh` (у всех агентов машины);
- сосед `dsh-pamyat-kompakt` лежит каталогом `/opt/agent-plugins/dsh-pamyat-kompakt`, ссылка `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt` → `../dsh-pamyat-kompakt`; `index.mjs` разрешает его по имени от своего файла;
- пакеты платформы `@deepseek-ai/dsh-compaction-basic` (index.mjs) и `@deepseek-ai/dsh-llm/message` (marker-step.mjs) берутся из установки платформы того агента, который загружает пакет: резолвер идёт от `process.argv[1]` (у агентов это `/opt/<агент>/app/node_modules/@deepseek-ai/dsh/lib/bin.js`), при любой ошибке — от файла модуля. В `/opt/agent-plugins/node_modules/@deepseek-ai` пакета `dsh-compaction-basic` нет, так что без установки платформы агента движок не загрузится.

On the production machine:

- the package lives in `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh` (owner root, group agent-plugins);
- it reaches each agent's `web` profile through the link `/opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-kompakt-dsh` → `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh` (for every agent on the machine);
- the sibling `dsh-pamyat-kompakt` is the directory `/opt/agent-plugins/dsh-pamyat-kompakt`, linked as `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt` → `../dsh-pamyat-kompakt`; `index.mjs` resolves it by name from its own file;
- the platform packages `@deepseek-ai/dsh-compaction-basic` (index.mjs) and `@deepseek-ai/dsh-llm/message` (marker-step.mjs) are taken from the platform installation of the agent that loads the package: resolution starts from `process.argv[1]` (for agents this is `/opt/<agent>/app/node_modules/@deepseek-ai/dsh/lib/bin.js`), on any error — from the module file. `/opt/agent-plugins/node_modules/@deepseek-ai` contains no `dsh-compaction-basic`, so the engine does not load without the agent's platform installation.

Во время работы пакет пишет в дом агента (`$DSH_HOME`, иначе `$HOME/.dsh`):

- `kompakt-dsh/usage-alerts/<sha256>.json` — метки тревоги и отбоя ожидания usage (каталог 0700, файлы 0600);
- `kompakt-dsh/zhurnal-kursor-<агент>.json` — курсор аудита журнала службы (запись атомарная, 0700/0600).

At run time the package writes into the agent home (`$DSH_HOME`, otherwise `$HOME/.dsh`):

- `kompakt-dsh/usage-alerts/<sha256>.json` — alert and all-clear marks of the usage wait (directory 0700, files 0600);
- `kompakt-dsh/zhurnal-kursor-<agent>.json` — the cursor of the service journal audit (atomic write, 0700/0600).

## Установка · Installation

Пакет ставится npm по lock общего каталога `/opt/agent-plugins`, из тарбола полки:

1. Тарбол кладётся в `/opt/agent-plugins-tarbally/dsh-pamyat-kompakt-dsh-<версия>.tgz`.
2. В `/opt/agent-plugins/package.json` стоит строка зависимости `"dsh-pamyat-kompakt-dsh": "file:../agent-plugins-tarbally/dsh-pamyat-kompakt-dsh-<версия>.tgz"`; рядом — `"dsh-pamyat-kompakt": "file:./dsh-pamyat-kompakt"`. `package-lock.json` фиксирует состав.
3. `npm` в `/opt/agent-plugins` ставит пакет в `node_modules/dsh-pamyat-kompakt-dsh`; ссылки из профилей агентов уже указывают туда.
4. Код загружается при старте процесса агента, поэтому новая версия начинает работать после перезапуска службы агента.

В `package.json` объявлены `peerDependencies`: `dsh-pamyat-kompakt` `>=3.1.1` (обязателен; с 3.1.1 сосед принимает сигнал отмены платформы) и пакеты платформы `@deepseek-ai/dsh-compaction-basic`, `@deepseek-ai/dsh-llm` `>=0.2.0-rc.2` — необязательные (`peerDependenciesMeta.optional`): npm их не ставит, пакет берёт их из установки платформы агента. Поэтому `npm install` архива без соседа отказывает с именем `dsh-pamyat-kompakt`, а не проходит молча; соседа нужной версии ставят раньше или вместе с этим пакетом.

The package is installed by npm from the lock of the shared directory `/opt/agent-plugins`, from a shelf tarball:

1. The tarball is placed at `/opt/agent-plugins-tarbally/dsh-pamyat-kompakt-dsh-<version>.tgz`.
2. `/opt/agent-plugins/package.json` holds the dependency line `"dsh-pamyat-kompakt-dsh": "file:../agent-plugins-tarbally/dsh-pamyat-kompakt-dsh-<version>.tgz"`; next to it — `"dsh-pamyat-kompakt": "file:./dsh-pamyat-kompakt"`. `package-lock.json` pins the set.
3. `npm` in `/opt/agent-plugins` installs the package into `node_modules/dsh-pamyat-kompakt-dsh`; the links from the agent profiles already point there.
4. The code is loaded when the agent process starts, so a new version takes effect after the agent service restarts.

`package.json` declares `peerDependencies`: `dsh-pamyat-kompakt` `>=3.1.1` (required; from 3.1.1 the sibling accepts the platform cancellation signal) and the platform packages `@deepseek-ai/dsh-compaction-basic`, `@deepseek-ai/dsh-llm` `>=0.2.0-rc.2` — optional (`peerDependenciesMeta.optional`): npm does not install them, the package takes them from the agent's platform installation. So `npm install` of the archive without the sibling refuses naming `dsh-pamyat-kompakt` instead of passing silently; install the sibling of the right version before or together with this package.

Пакет подключается не отдельной строкой пресета, а внутри группы `compaction` профиля `/opt/<агент>/.dsh/profiles/web/cordis.patch.yml`: элемент `compaction-basic` получает `name: dsh-pamyat-kompakt-dsh` и замещает родной движок платформы. Команда `/compact` стоит в той же группе: `command-compact` берёт службу `compaction` из своего контекста и вне группы увидела бы корневой родной движок. Форма у агентов (значения `thresholdRatio` различаются: 0.8 у большинства, 0.65 у двух Codex-агентов):

The package is not mounted by a separate preset line but inside the `compaction` group of the profile `/opt/<agent>/.dsh/profiles/web/cordis.patch.yml`: the `compaction-basic` element gets `name: dsh-pamyat-kompakt-dsh` and replaces the platform's native engine. The `/compact` command sits in the same group: `command-compact` takes the `compaction` service from its own context and outside the group would see the root native engine. The shape used by the agents (`thresholdRatio` differs: 0.8 for most, 0.65 for two Codex agents):

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: dsh-pamyat-kompakt-dsh
      config:
        thresholdRatio: 0.8
        retainRatio: 0.06
        compactionRetries: 0
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
```

В окружении службы агента задаётся имя агента `KOMPAKT_AGENT=<агент>`. На рабочей машине у большинства агентов это drop-in `/etc/systemd/system/<служба>.d/60-kompakt-agent.conf`, а у двух Codex-агентов — строка `Environment=KOMPAKT_AGENT=<агент>` в самом юните (`/etc/systemd/system/<агент>.service`). Сам `dsh-pamyat-kompakt` настраивается по своей документации.

The agent service environment sets the agent name `KOMPAKT_AGENT=<agent>`. On the production machine, for most agents this is the drop-in `/etc/systemd/system/<service>.d/60-kompakt-agent.conf`, and for two Codex agents it is an `Environment=KOMPAKT_AGENT=<agent>` line in the unit itself (`/etc/systemd/system/<agent>.service`). `dsh-pamyat-kompakt` itself is configured according to its own documentation.

## Настройка · Configuration

### Конфиг движка (`config` элемента `compaction-basic`) · Engine config (`config` of the `compaction-basic` element)

Своей схемы у пакета нет: `NashaSvodka` наследует `static Config`, `static inject` и разбор конфига (`resolveConfig`) от `BasicCompactionEngine`. Все ключи уходят платформе; пакет сам читает только `thresholdRatio`, `retainRatio`, `retainTokens` и `modelPolicies` из уже разобранного `this.config`. Умолчания — из кода платформы.

The package has no schema of its own: `NashaSvodka` inherits `static Config`, `static inject` and config resolution (`resolveConfig`) from `BasicCompactionEngine`. All keys go to the platform; the package itself reads only `thresholdRatio`, `retainRatio`, `retainTokens` and `modelPolicies` from the already resolved `this.config`. Defaults come from the platform code.

| Ключ | Тип | Умолчание | Кто читает | Смысл |
|---|---|---|---|---|
| `thresholdRatio` | число | 0.8 | платформа; пакет — для строки «выбрать нечего» | доля окна, с которой давление считается порогом |
| `retainRatio` | число | 0.16 (если не задан `retainTokens`) | платформа; пакет — для удержания R | доля окна под дословный хвост; пакет удерживает не больше `⌊поверхность × 0.5⌋` |
| `retainTokens` | целое ≥ 0 | нет | платформа; пакет — для удержания R | явное удержание в токенах вместо `окно × retainRatio`; вместе с `retainRatio` нельзя |
| `modelPolicies` | массив политик `{provider, model, …}` | `[]` | платформа; пакет | для точной пары provider/model с политикой пакет не меняет удержание (родной путь) |
| `compactionRetries` | целое ≥ 0 | 1 | платформа | повторные заходы, если после сжатия давление выше порога |
| `headroomTokens` | целое ≥ 0 | 65536 | платформа | запас под сжатие при расчёте порога |
| `maxTokens` | целое ≥ 1 | равно `headroomTokens` | платформа | потолок вывода родной сводки |
| `maxOverflowRetries` | целое ≥ 0 | 1 | платформа | повторы восстановления при переполнении окна |
| `summarizationProvider`, `summarizationModel` | строка | `""` | платформа | модель родной сводки; действуют только когда пакет отдал работу родной сводке |
| `auto` | булево | `true` | платформа | `false` — платформа не подписывает автоматическое сжатие по давлению и переполнению |

| Key | Type | Default | Read by | Meaning |
|---|---|---|---|---|
| `thresholdRatio` | number | 0.8 | platform; package — for the "nothing to select" line | window share at which pressure counts as the threshold |
| `retainRatio` | number | 0.16 (if `retainTokens` is not set) | platform; package — for retention R | window share for the verbatim tail; the package retains at most `⌊surface × 0.5⌋` |
| `retainTokens` | integer ≥ 0 | none | platform; package — for retention R | explicit retention in tokens instead of `window × retainRatio`; not together with `retainRatio` |
| `modelPolicies` | array of policies `{provider, model, …}` | `[]` | platform; package | for an exact provider/model pair with a policy the package does not change retention (native path) |
| `compactionRetries` | integer ≥ 0 | 1 | platform | extra passes if pressure stays above the threshold after compaction |
| `headroomTokens` | integer ≥ 0 | 65536 | platform | compaction headroom in the threshold computation |
| `maxTokens` | integer ≥ 1 | equal to `headroomTokens` | platform | output cap of the native summary |
| `maxOverflowRetries` | integer ≥ 0 | 1 | platform | recovery retries on context window overflow |
| `summarizationProvider`, `summarizationModel` | string | `""` | platform | model of the native summary; matter only when the package has handed the work to the native summary |
| `auto` | boolean | `true` | platform | `false` — the platform does not subscribe automatic pressure and overflow compaction |

Удержание: `R = retainTokens ?? ⌊окно × retainRatio⌋`, `M = min(R, ⌊surfaceTokens × 0.5⌋)` (`DOLYA_POVERHNOSTI = 0.5`). При `M < R` пакет на синхронную часть вызова `compactIfNeeded` платформы подставляет замороженную копию конфига с `retainTokens = M`. Это действует только при триггере `pressure`, известной паре provider/model и отсутствии для неё `modelPolicies`.

Retention: `R = retainTokens ?? ⌊window × retainRatio⌋`, `M = min(R, ⌊surfaceTokens × 0.5⌋)` (`DOLYA_POVERHNOSTI = 0.5`). With `M < R` the package substitutes, for the synchronous part of the platform's `compactIfNeeded` call, a frozen config copy with `retainTokens = M`. This applies only to the `pressure` trigger, a known provider/model pair and no `modelPolicies` entry for it.

### Файл настройки пакета · Package settings file

Путь — `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf`, меняется переменной `DSH_PAMYAT_KOMPAKT_DSH_CONF`. Строки `КЛЮЧ=значение`; комментарий — только строка, начинающаяся с `#`; при повторе ключа берётся последнее вхождение. Значение берётся в порядке: переменная окружения с именем ключа → файл → умолчание. Если файл есть, но не читается, или в значении стоит « #» (пробел или таб перед `#`), загрузка плагина отказывает исключением.

Path — `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf`, changed by the variable `DSH_PAMYAT_KOMPAKT_DSH_CONF`. `KEY=value` lines; a comment is only a line starting with `#`; for a repeated key the last occurrence wins. Value order: environment variable named as the key → file → default. If the file exists but cannot be read, or a value contains " #" (a space or tab before `#`), plugin loading fails with an exception.

| Ключ | Умолчание | Смысл |
|---|---|---|
| `KOMPAKT_AGENT_ALERT` | `/usr/local/bin/agent-alert` | канал тревог владельцу |
| `KOMPAKT_AGENT_REGISTRY` | `/usr/local/bin/agent-registry` | реестр агентов: имя своей системной службы для аудита |
| `KOMPAKT_JOURNALCTL` | `/usr/bin/journalctl` | чтение журнала службы (и через `sudo -n`) |
| `KOMPAKT_REZHIM_FAJL` | `/etc/dsh-pamyat/continuation-mode.json` | файл режима Codex-маркера |

| Key | Default | Meaning |
|---|---|---|
| `KOMPAKT_AGENT_ALERT` | `/usr/local/bin/agent-alert` | owner alert channel |
| `KOMPAKT_AGENT_REGISTRY` | `/usr/local/bin/agent-registry` | agent registry: name of the agent's own system service for the audit |
| `KOMPAKT_JOURNALCTL` | `/usr/bin/journalctl` | service journal reader (also via `sudo -n`) |
| `KOMPAKT_REZHIM_FAJL` | `/etc/dsh-pamyat/continuation-mode.json` | Codex marker mode file |

Путь `sudo` для запасного чтения журнала при отказе по правам — `/usr/bin/sudo`. Он прибит в `marker-step.mjs`, ключа и переменной для него нет.

The `sudo` path for the fallback journal read on a permission failure is `/usr/bin/sudo`. It is hard-coded in `marker-step.mjs`; there is no key or variable for it.

Файл режима: `{"version":1,"codex_marker":[<агенты>]}`, не больше 4096 байт, имена вида `[a-z][a-z0-9_-]{0,31}`, лишние ключи запрещены. Нет файла — Codex-маркер выключен; файл негоден — исключение, и отметка для Codex запрещается. Для маршрута Claude (`claude-oauth` + `claude-*`) отметка работает независимо от файла.

Mode file: `{"version":1,"codex_marker":[<agents>]}`, at most 4096 bytes, names of the form `[a-z][a-z0-9_-]{0,31}`, extra keys forbidden. No file — the Codex marker is off; an invalid file — an exception, and the marker is refused for Codex. On the Claude route (`claude-oauth` + `claude-*`) the marker works regardless of the file.

### Переменные окружения · Environment variables

| Переменная | Где | Смысл |
|---|---|---|
| `KOMPAKT_AGENT` | marker-step.mjs | имя агента: ключ отметки, имя для реестра при аудите; должно подходить под `^[a-z][a-z0-9_-]*$` |
| `DSH_PAMYAT_KOMPAKT_DSH_CONF` | continuation-mode.mjs | путь файла настройки пакета |
| `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY`, `KOMPAKT_JOURNALCTL`, `KOMPAKT_REZHIM_FAJL` | continuation-mode.mjs | то же, что ключи файла настройки, и сильнее файла |
| `DSH_HOME`, `HOME` | index.mjs, marker-step.mjs | корень для меток тревог и курсора аудита (`$DSH_HOME`, иначе `$HOME/.dsh`) |
| `INVOCATION_ID` | marker-step.mjs | опознаватель запуска (ставит systemd; без него — случайный UUID) |

| Variable | Where | Meaning |
|---|---|---|
| `KOMPAKT_AGENT` | marker-step.mjs | agent name: marker key, name for the registry in the audit; must match `^[a-z][a-z0-9_-]*$` |
| `DSH_PAMYAT_KOMPAKT_DSH_CONF` | continuation-mode.mjs | path of the package settings file |
| `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY`, `KOMPAKT_JOURNALCTL`, `KOMPAKT_REZHIM_FAJL` | continuation-mode.mjs | same as the settings file keys, and stronger than the file |
| `DSH_HOME`, `HOME` | index.mjs, marker-step.mjs | root for alert marks and the audit cursor (`$DSH_HOME`, otherwise `$HOME/.dsh`) |
| `INVOCATION_ID` | marker-step.mjs | run id (set by systemd; otherwise a random UUID) |

Дочернему `agent-alert` пакет передаёт `AGENT_ALERT_POPYTOK=3`, `AGENT_ALERT_TAJMAUT=20`, `AGENT_ALERT_PAUZY="5 15"` (процесс ограничен 100 с), `journalctl` — `LC_ALL=C`. Переменную `KOMPAKT_MODEL` пакет не читает: подпись `model` в ответе платформе берётся из экспорта `KOMPAKT_MODEL` соседа.

The package passes `AGENT_ALERT_POPYTOK=3`, `AGENT_ALERT_TAJMAUT=20`, `AGENT_ALERT_PAUZY="5 15"` to the child `agent-alert` (the process is limited to 100 s), and `LC_ALL=C` to `journalctl`. The package does not read `KOMPAKT_MODEL`: the `model` label in the answer to the platform comes from the sibling's `KOMPAKT_MODEL` export.

### Службы, события, крючки · Services, events, hooks

- Служба: движок регистрируется службой `compaction` (базовый класс платформы). Через `static inject` платформы нужны `llm`, `tokenMeter`, `sessions`.
- Service: the engine registers as the `compaction` service (the platform base class). The platform's `static inject` requires `llm`, `tokenMeter`, `sessions`.
- Через `ctx.get` пакет берёт, если они есть: `pamyat` с `sobytiyaSessii` (ядро памяти `dsh-pamyat-core`, чтение журнала сессии; без него — `session.events`/`snapshotEvents()`), `sessions` (`flush` для отметки), `agents` (живой агент сессии).
- Through `ctx.get` the package uses, when present: `pamyat` with `sobytiyaSessii` (memory core `dsh-pamyat-core`, session journal reading; without it — `session.events`/`snapshotEvents()`), `sessions` (`flush` for the marker), `agents` (the session's live agent).
- Переопределены методы платформы `summarize` (наша сводка с хвостом) и `compactIfNeeded` (ожидание свежего usage на Codex). Добавлен `compactSUderzhaniem` (удержание ≤ ½ поверхности); `compactRegion` подменяется только на один вызов.
- Platform methods overridden: `summarize` (our summary with the tail) and `compactIfNeeded` (waiting for fresh usage on Codex). Added: `compactSUderzhaniem` (retention ≤ ½ of the surface); `compactRegion` is replaced for a single call only.
- Ответ `summarize`: `summary` — сводка и, если хвост подан, строка `STROKA_HVOSTA` («Дальше — дословный хвост журнала до сжатия (N сообщ.): …»); `rawOutput` — сводка без неё; `provider: "dsh-pamyat-kompakt"`; `llmStreamCall: false`; `maxTokens: 0`. Сигнал отмены платформы (`summarize(input, agent, signal)`) передаётся соседу и прерывает вызов модели сводки; отмена, как и любая ошибка, — строка журнала и родная сводка платформы.
- `summarize` answer: `summary` — the summary plus, if the tail was supplied, the `STROKA_HVOSTA` line ("Дальше — дословный хвост журнала до сжатия (N сообщ.): …", "the verbatim tail follows"); `rawOutput` — the summary without it; `provider: "dsh-pamyat-kompakt"`; `llmStreamCall: false`; `maxTokens: 0`. The platform cancellation signal (`summarize(input, agent, signal)`) is passed to the sibling and aborts the summary model call; a cancellation, like any error, gives a log line and the platform's native summary.
- Подписки: `session/event` (сторож usage; отметка продолжения), `agent/status`, `agent/pre-step` (вставка отметки после `next()`), `dispose`, `our/compaction-status` (движок кладёт в ответ свой `this.config`).
- Subscriptions: `session/event` (usage watchdog; continuation marker), `agent/status`, `agent/pre-step` (marker insertion after `next()`), `dispose`, `our/compaction-status` (the engine pushes its `this.config` into the reply).

Подробно, с примерами — `docs/SETTINGS.md`; устройство — `docs/ARCHITECTURE.md`.

In detail, with examples — `docs/SETTINGS.md`; design — `docs/ARCHITECTURE.md`.

## Проверка · Verification

В `package.json` нет `scripts`: каждый стенд — отдельный файл, запуск `node stend-<имя>.mjs` из каталога пакета. Стенды ждут соседства в общем `node_modules` (`dsh-pamyat-kompakt`, `dsh-pamyat-core`, `dsh-pamyat-restore`, `@deepseek-ai/*`), то есть запускаются в `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh`, а не в git-дереве. Стенды, загружающие `marker-step.mjs`, требуют, чтобы `@deepseek-ai/dsh-llm` разрешался от файла стенда или модуля.

`package.json` has no `scripts`: each stand is a separate file, run as `node stend-<name>.mjs` from the package directory. Stands expect neighbours in a shared `node_modules` (`dsh-pamyat-kompakt`, `dsh-pamyat-core`, `dsh-pamyat-restore`, `@deepseek-ai/*`), i.e. they run in `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh`, not in the git tree. Stands that load `marker-step.mjs` need `@deepseek-ai/dsh-llm` to resolve from the stand file or the module.

Стенды аудита и тревог сверяют вызовы внешних команд с путями по умолчанию, прибитыми в самих стендах: `/usr/local/bin/agent-registry` (`stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita`, `stend-yakorya-audita`, `stend-identifikatora-audita`), `/usr/bin/journalctl` и `/usr/bin/sudo` (`stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita`), `/usr/bin/systemctl` (те же четыре стенда аудита и `stend-identifikatora-audita`; путь задан в коде, ключа настройки у него нет), `/usr/local/bin/agent-alert` (`stend-predela-usage`). Если в окружении или в файле настройки пакета `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY` или `KOMPAKT_JOURNALCTL` указывают на другой путь, эти стенды дают код 1 на исправном коде. Гонять их без этих ключей. Только `stend-nastrojki-i-rezolva` сам снимает ключи из окружения своего дочернего процесса.

The audit and alert stands compare external-command calls against the default paths hard-coded in the stands themselves: `/usr/local/bin/agent-registry` (`stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita`, `stend-yakorya-audita`, `stend-identifikatora-audita`), `/usr/bin/journalctl` and `/usr/bin/sudo` (`stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita`), `/usr/bin/systemctl` (the same four audit stands and `stend-identifikatora-audita`; the path is set in code, it has no settings key), `/usr/local/bin/agent-alert` (`stend-predela-usage`). If `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY` or `KOMPAKT_JOURNALCTL` in the environment or in the package settings file point to another path, these stands exit with code 1 on correct code. Run them without these keys. Only `stend-nastrojki-i-rezolva` removes the keys from its child process environment by itself.

| Стенд | Что проверяет | Что нужно |
|---|---|---|
| `stend-hvosta` | `summarize` подаёт хвост вторым блоком, при несошедшемся стыке не подаёт | `DSH_TEST_APP` |
| `stend-uderzhaniya` | удержание ≤ ½ поверхности на настоящих `compactIfNeeded` платформы и пакета | `DSH_TEST_APP` |
| `stend-svezhego-usage` | ожидание свежего usage на настоящих `Session`/`TokenMeter` | `DSH_TEST_APP`, соседний `dsh-pamyat-core` |
| `stend-predela-usage` | одна тревога после 3 завершённых ходов без usage | `DSH_TEST_APP` |
| `stend-otboya-usage` | один отбой после доставленной тревоги | `DSH_TEST_APP` |
| `stend-styka-sobytij` | журнал сессии на формах DSH 0.1.1 и 0.2.0 через ядро памяти | `DSH_TEST_APP`, соседний `dsh-pamyat-core` |
| `stend-otmetki` | фазы и гонки отметки продолжения | установка платформы рядом (`@deepseek-ai/dsh-llm` в `node_modules`); нет — СЛЕПОТА, код 2 |
| `stend-fazy-otmetki` | фаза `superseded`, текст отказа, `dsh-llm/message` от установки зовущего, проверка файла режима | — |
| `stend-stop-komandy` | отметку отменяет только «/stop» человека в рамке Telegram | по желанию `MARKER_INPUT_FIXTURE`; установка платформы рядом (`@deepseek-ai/dsh-llm`), нет — СЛЕПОТА, код 2 |
| `stend-pisma-prodolzheniya` | принятое письмо-продолжение шлюза отменяет отметку | установка платформы рядом (`@deepseek-ai/dsh-llm` в `node_modules`); нет — СЛЕПОТА, код 2 |
| `stend-dostupa-audita` | имя службы из реестра, `sudo -n` только при отказе по правам | установка платформы рядом (`@deepseek-ai/dsh-llm` в `node_modules`); нет — СЛЕПОТА, код 2 |
| `stend-pustogo-audita` | пустая история на настоящем `journalctl` — не тревога | право читать журнал напрямую или через `sudo -n`; установка платформы рядом (`@deepseek-ai/dsh-llm`), нет — СЛЕПОТА, код 2 |
| `stend-kursora-audita` | курсор аудита, окно 7 сут, повтор при непринятом курсоре | `DSH_TEST_APP`, `STEND_BOLSHOJ_UNIT` (служба с ≥ 72 000 записей за 7 сут). Записи стенд считает сам, напрямую `/usr/bin/journalctl`, без `sudo`: без права читать журнал этой службы записей окажется меньше 72 000, и стенд выйдет с кодом 2 |
| `stend-vremeni-audita` | время аудита формы S1 (окно 7 сут: поиск + сверка ид) на самой плотной службе агента из `agent-registry list`: < 20 с — ЗЕЛЁНОЕ (0), ≥ 20 с — ЖЁЛТОЕ (1), аудит не ok — КРАСНОЕ (1); порча для проб — `STEND_PORCHA=zaderzhka:<мс>` или `otkaz` | `DSH_TEST_APP`; учётке нужен доступ к журналам служб агентов (группа `systemd-journal`), иначе у всех 0 записей — код 2 |
| `stend-yakorya-audita` | аудит берёт только строки формы `[kompakt-dsh <версия>] [continuation-marker] {…}` с начала | `DSH_TEST_APP` |
| `stend-identifikatora-audita` | поиск отметок сужен полем `SYSLOG_IDENTIFIER` службы (не зашито); 0 отметок при строках `[kompakt-dsh` под другим идентификатором — слепота, курсор не двигается | `DSH_TEST_APP` |
| `stend-nastrojki-i-rezolva` | файл настройки и двухшаговый резолв пакета платформы | установка платформы рядом (`@deepseek-ai/dsh-llm` в `node_modules`); нет — СЛЕПОТА, код 2 |
| `stend-pristavki` | каждая строка журнала несёт имя и версию | `DSH_TEST_APP` |
| `stend-literala-hvosta` | `STROKA_HVOSTA` совпадает с литералом `dsh-pamyat-restore` | `DSH_TEST_APP`, соседний `dsh-pamyat-restore` |
| `stend-sostava` | белый список `files`: мусор не попадает, обязательное не теряется | `npm`, `tar`; путь пакета — необязательный аргумент |

| Stand | What it checks | What it needs |
|---|---|---|
| `stend-hvosta` | `summarize` supplies the tail as a second block, and not when the joint does not match | `DSH_TEST_APP` |
| `stend-uderzhaniya` | retention ≤ ½ of the surface on the real `compactIfNeeded` of the platform and the package | `DSH_TEST_APP` |
| `stend-svezhego-usage` | waiting for fresh usage on the real `Session`/`TokenMeter` | `DSH_TEST_APP`, sibling `dsh-pamyat-core` |
| `stend-predela-usage` | one alert after 3 completed turns without usage | `DSH_TEST_APP` |
| `stend-otboya-usage` | one all-clear after a delivered alert | `DSH_TEST_APP` |
| `stend-styka-sobytij` | session journal on DSH 0.1.1 and 0.2.0 shapes through the memory core | `DSH_TEST_APP`, sibling `dsh-pamyat-core` |
| `stend-otmetki` | phases and races of the continuation marker | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-fazy-otmetki` | phase `superseded`, failure text, `dsh-llm/message` from the caller's installation, mode file validation | — |
| `stend-stop-komandy` | only a human "/stop" in the Telegram envelope cancels the marker | optionally `MARKER_INPUT_FIXTURE`; a platform installation next to it (`@deepseek-ai/dsh-llm`), missing — BLINDNESS, exit 2 |
| `stend-pisma-prodolzheniya` | an admitted gateway continuation letter cancels the marker | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-dostupa-audita` | service name from the registry, `sudo -n` only on a permission failure | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-pustogo-audita` | an empty history on the real `journalctl` is not an alert | permission to read the journal directly or via `sudo -n`; a platform installation next to it (`@deepseek-ai/dsh-llm`), missing — BLINDNESS, exit 2 |
| `stend-kursora-audita` | audit cursor, 7-day window, retry on a rejected cursor | `DSH_TEST_APP`, `STEND_BOLSHOJ_UNIT` (a service with ≥ 72,000 entries over 7 days). The stand counts the entries itself, directly with `/usr/bin/journalctl`, without `sudo`: without permission to read that service's journal it will find fewer than 72,000 entries and exit with code 2 |
| `stend-vremeni-audita` | S1-form audit time (7-day window: search + id check) on the densest agent service from `agent-registry list`: < 20 s — GREEN (0), ≥ 20 s — YELLOW (1), audit not ok — RED (1); corruption for probes — `STEND_PORCHA=zaderzhka:<ms>` or `otkaz` | `DSH_TEST_APP`; the account needs access to agent service journals (`systemd-journal` group), otherwise all have 0 entries — code 2 |
| `stend-yakorya-audita` | the audit takes only lines of the form `[kompakt-dsh <version>] [continuation-marker] {…}` from the start | `DSH_TEST_APP` |
| `stend-identifikatora-audita` | the marker search is narrowed by the service's `SYSLOG_IDENTIFIER` field (not hard-coded); 0 markers while `[kompakt-dsh` lines are under another identifier — blindness, the cursor does not move | `DSH_TEST_APP` |
| `stend-nastrojki-i-rezolva` | settings file and two-step resolution of the platform package | a platform installation next to it (`@deepseek-ai/dsh-llm` in `node_modules`); missing — BLINDNESS, exit 2 |
| `stend-pristavki` | every log line carries name and version | `DSH_TEST_APP` |
| `stend-literala-hvosta` | `STROKA_HVOSTA` equals the `dsh-pamyat-restore` literal | `DSH_TEST_APP`, sibling `dsh-pamyat-restore` |
| `stend-sostava` | the `files` whitelist: garbage stays out, nothing mandatory is lost | `npm`, `tar`; package path as an optional argument |

`DSH_TEST_APP` — каталог установки платформы (стенд подставляет `process.argv[1] = $DSH_TEST_APP/node_modules/@deepseek-ai/dsh/lib/bin.js`), например `/opt/<агент>/app`.

`DSH_TEST_APP` is the platform installation directory (the stand sets `process.argv[1] = $DSH_TEST_APP/node_modules/@deepseek-ai/dsh/lib/bin.js`), e.g. `/opt/<agent>/app`.

Коды возврата:

- `0` — все пробы сошлись;
- `1` — расхождение; у стендов на `node:assert` (`stend-otmetki`, `stend-pisma-prodolzheniya`, `stend-stop-komandy`, `stend-pustogo-audita`, `stend-dostupa-audita`, `stend-predela-usage`, `stend-svezhego-usage`) — необработанное исключение при расхождении;
- `2` — слепота стенда: не задан `DSH_TEST_APP`, не загрузился предмет или сосед, не совпало ожидаемое число проб. `stend-otmetki`, `stend-pisma-prodolzheniya`, `stend-stop-komandy`, `stend-pustogo-audita`, `stend-dostupa-audita` и `stend-nastrojki-i-rezolva` до загрузки `marker-step.mjs` проверяют, что рядом разрешается `@deepseek-ai/dsh-llm/message`; нет — СЛЕПОТА, код 2 (прежде — трасса с кодом 1). У `stend-sostava` кода 2 нет. Из стендов на `assert` код 2 дают `stend-predela-usage` и `stend-svezhego-usage`: оба при незаданном `DSH_TEST_APP`, а второй ещё и без соседа `dsh-pamyat-core`;
- `143`/`130` — прерывание по SIGTERM/SIGINT. Сигнал в выход с уборкой временного каталога переводят только `stend-hvosta`, `stend-fazy-otmetki` и `stend-sostava`. Ещё шесть стендов создают временный каталог (`stend-kursora-audita`, `stend-nastrojki-i-rezolva`, `stend-otboya-usage`, `stend-predela-usage`, `stend-styka-sobytij`, `stend-yakorya-audita`), но обработчика сигнала у них нет: прерванный стенд оставит каталог в каталоге временных файлов (`os.tmpdir()`).

Exit codes:

- `0` — all probes passed;
- `1` — mismatch; for stands on `node:assert` (`stend-otmetki`, `stend-pisma-prodolzheniya`, `stend-stop-komandy`, `stend-pustogo-audita`, `stend-dostupa-audita`, `stend-predela-usage`, `stend-svezhego-usage`) — an uncaught exception on a mismatch;
- `2` — stand blindness: `DSH_TEST_APP` unset, the subject or a sibling did not load, the expected probe count did not match. `stend-otmetki`, `stend-pisma-prodolzheniya`, `stend-stop-komandy`, `stend-pustogo-audita`, `stend-dostupa-audita` and `stend-nastrojki-i-rezolva` check, before loading `marker-step.mjs`, that `@deepseek-ai/dsh-llm/message` resolves next to them; if not — BLINDNESS, exit 2 (previously a stack trace with exit 1). `stend-sostava` has no code 2. Among the `assert` stands, code 2 comes from `stend-predela-usage` and `stend-svezhego-usage`: both when `DSH_TEST_APP` is unset, and the latter also without the sibling `dsh-pamyat-core`;
- `143`/`130` — interruption by SIGTERM/SIGINT. Only `stend-hvosta`, `stend-fazy-otmetki` and `stend-sostava` turn the signal into an exit that removes the temporary directory. Six more stands create a temporary directory (`stend-kursora-audita`, `stend-nastrojki-i-rezolva`, `stend-otboya-usage`, `stend-predela-usage`, `stend-styka-sobytij`, `stend-yakorya-audita`) but have no signal handler: an interrupted stand leaves its directory in the temporary files directory (`os.tmpdir()`).

В бою признак подключения — строка при создании движка: `[dsh-pamyat-kompakt-dsh <версия>] движок создан платформой: наша сводка ПОДКЛЮЧЕНА, при отказе модели отдаём родной`. Признак работы — при сжатии `[kompakt-dsh <версия>] наша сводка: N зн. из M зн. прозы`; строка `наша сводка НЕ СОСТОЯЛАСЬ (…) — отдаю родной` значит, что сжатие прошло родной сводкой. Что ловит каждый сторож и стенд — `docs/GUARDS.md`; разбор поломок — `docs/TROUBLESHOOTING.md`.

In production the sign of mounting is the line at engine creation: `[dsh-pamyat-kompakt-dsh <version>] движок создан платформой: наша сводка ПОДКЛЮЧЕНА, при отказе модели отдаём родной` ("engine created by the platform: our summary CONNECTED, on model failure we hand over to native"). The sign of operation is, at compaction, `[kompakt-dsh <version>] наша сводка: N зн. из M зн. прозы` ("our summary: N chars from M chars of prose"); the line `наша сводка НЕ СОСТОЯЛАСЬ (…) — отдаю родной` ("our summary FAILED (…) — handing over to native") means the compaction went with the native summary. What each guard and stand catches — `docs/GUARDS.md`; failure analysis — `docs/TROUBLESHOOTING.md`.

## Ограничения · Limitations

- Пакеты платформы `@deepseek-ai/dsh-compaction-basic` и `@deepseek-ai/dsh-llm` не объявлены ни в `dependencies`, ни в `peerDependencies`, а `dsh-pamyat-kompakt` — только в `devDependencies`: npm их не подтянет. Не разрешился любой из трёх — исключение при загрузке модуля, пресет агента не монтируется.
- The platform packages `@deepseek-ai/dsh-compaction-basic` and `@deepseek-ai/dsh-llm` are declared neither in `dependencies` nor in `peerDependencies`, and `dsh-pamyat-kompakt` only in `devDependencies`: npm will not pull them in. If any of the three does not resolve, module loading throws and the agent preset does not mount.
- Сводку пишет только сосед `dsh-pamyat-kompakt`; ошибка или пустая проза во входе — строка журнала и родная сводка платформы (её модель — `summarizationProvider`/`summarizationModel` или модель агента).
- The summary is written only by the sibling `dsh-pamyat-kompakt`; an error or empty prose in the input — a log line and the platform's native summary (its model is `summarizationProvider`/`summarizationModel` or the agent's model).
- Хвост не подаётся, если стык не сошёлся, журнал сессии не читается или голова пуста; голову, начатую не с `surface.nodes[0]`, сверка не ловит. Ручной `/compact` и восстановление при переполнении идут с удержанием 0 — хвоста нет.
- The tail is not supplied if the joint does not match, the session journal cannot be read or the head is empty; a head that does not start at `surface.nodes[0]` is not caught by the check. Manual `/compact` and overflow recovery run with retention 0 — no tail.
- Удержание ½ поверхности — постоянная в коде, не настройка. Подстановка опирается на то, что платформа читает политику до первого `await` в `compactIfNeeded`; если это изменится, удержание станет родным, о чём кричит строка `🔴 платформа НЕ прочла подстановку удержания`.
- Retention ½ of the surface is a constant in code, not a setting. The substitution relies on the platform reading the policy before the first `await` in `compactIfNeeded`; if that changes, retention becomes native, announced by the line `🔴 платформа НЕ прочла подстановку удержания` ("the platform did NOT read the retention substitute").
- R пакет считает от полного окна, а платформа — от окна за вычетом резерва ответа; порог для строки «выбрать нечего» — `окно × thresholdRatio`, без ограничения бюджетом давления, как у платформы. Числа этой строки могут расходиться с решением платформы.
- The package computes R from the full window, the platform from the window minus the response reserve; the threshold for the "nothing to select" line is `window × thresholdRatio`, without the pressure-budget cap the platform applies. The numbers of that line may differ from the platform's decision.
- Ожидание свежего usage, его тревога и отбой — только на маршруте Codex (`provider` `claude-oauth`, модель `gpt-*`) при основе давления `usage`. Журнал сессии не читается — ожидания нет, сжатие идёт родным путём, одна строка `🔴` на сессию.
- Waiting for fresh usage, its alert and all-clear apply only to the Codex route (`provider` `claude-oauth`, model `gpt-*`) with a `usage` pressure baseline. If the session journal cannot be read there is no waiting, compaction goes the native way, one `🔴` line per session.
- Отметка продолжения живёт в памяти процесса: перезапуск между сжатием и принятием её теряет (аудит при следующем старте шлёт тревогу, задачу не восстанавливает). Нужны `KOMPAKT_AGENT` правильной формы и сводка, первая строка которой `[MODE=ACTIVE]`; не больше двух побудок; «принято» значит, что вход дошёл до агента, а не что задача выполнена. Отменяет только «/stop» в начале личного сообщения Telegram в штатной рамке; цитата, «/stop!», «/stop@bot», иные транспорты не распознаются, подделку рамки доверенным плагином проверка не ловит.
- The continuation marker lives in process memory: a restart between compaction and acceptance loses it (the audit at the next start sends an alert, the task is not restored). It needs a well-formed `KOMPAKT_AGENT` and a summary whose first line is `[MODE=ACTIVE]`; at most two wakes; "accepted" means the input reached the agent, not that the task was done. Only "/stop" at the start of a private Telegram message in the standard envelope cancels it; a quote, "/stop!", "/stop@bot", other transports are not recognised, and a forged envelope from a trusted plugin is not detected.
- Внешние команды `agent-alert`, `agent-registry`, `journalctl`, `sudo` — не часть пакета; без них сводка и удержание работают, а тревоги и аудит отказывают строкой журнала. Аудит требует systemd-журнала и права читать журнал своей службы.
- The external commands `agent-alert`, `agent-registry`, `journalctl`, `sudo` are not part of the package; without them the summary and retention work, while alerts and the audit fail with a log line. The audit needs the systemd journal and permission to read its own service journal.
- Строки журнала, текст вставки продолжения и подписи — на русском языке.
- Log lines, the continuation insertion text and labels are in Russian.
