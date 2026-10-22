# dsh-pamyat-restore

## Назначение · Purpose

Плагин dsh (cordis) — читающая сторона памяти агента. Слой B: после успешного сжатия сессии вставляет в контекст сводку компакта из памяти (или только побуждение продолжить, если сводка движка `dsh-pamyat-kompakt` уже стоит в поверхности сжатия). Слой C: на первом подходящем шаге сессии после старта процесса подаёт welcome-брифинг — последние записи памяти с решением `use/verify/ignore` и его основанием, плюс последнюю сводку компакта целиком, если та же сводка ещё не стоит в поверхности этой сессии (сессиям `telegram-v2-*` — только знания, без сводки). Плагин только дополняет контекст сообщением на `agent/pre-step`: решений хода не принимает, вызовы инструментов не сторожит, заглушек вместо памяти не подставляет.

A dsh (cordis) plugin: the reading side of agent memory. Layer B: after a successful session compaction it inserts the compaction summary from memory into context (or only a continuation prompt, when a summary from the `dsh-pamyat-kompakt` engine is already in the compacted surface). Layer C: on the first eligible step of a session after process start it delivers a welcome briefing — the latest memory records with a `use/verify/ignore` decision and its reason, plus the latest compaction summary in full, unless the same summary already stands in this session's surface (`telegram-v2-*` sessions get knowledge only, without the summary). The plugin only adds a context message at `agent/pre-step`: it does not decide the turn, does not guard tool calls, and never substitutes stub records for memory.

## Что ставится и куда · What gets installed and where

Файлы пакета (поле `files` в `package.json`): `src/index.js` (весь код плагина), `test/stend-*.mjs` (стенды), `README.md`, `README.en.md`, `CHANGELOG.md`, `docs/` (`ARCHITECTURE.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`). Кроме них npm сам кладёт в архив `package.json` и `LICENSE` (текст лицензии MIT; поле `license` в `package.json`).

Package files (`files` in `package.json`): `src/index.js` (all plugin code), `test/stend-*.mjs` (test stands), `README.md`, `README.en.md`, `CHANGELOG.md`, `docs/` (`ARCHITECTURE.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`). Besides these, npm adds `package.json` and `LICENSE` (the MIT license text; the `license` field in `package.json`) to the archive by itself.

Боевой путь на машине: `/opt/agent-plugins/node_modules/dsh-pamyat-restore`. Профиль агента видит его по символической ссылке `<DSH_HOME>/profiles/web/node_modules/dsh-pamyat-restore` → `/opt/agent-plugins/node_modules/dsh-pamyat-restore`.

Deployed path on the machine: `/opt/agent-plugins/node_modules/dsh-pamyat-restore`. An agent profile sees it through the symlink `<DSH_HOME>/profiles/web/node_modules/dsh-pamyat-restore` → `/opt/agent-plugins/node_modules/dsh-pamyat-restore`.

Что регистрирует `src/index.js`:

What `src/index.js` registers:

- `inject = ['agents']` — плагин ждёт службу `agents`; без неё не поднимается.
- `inject = ['agents']` — the plugin waits for the `agents` service and does not start without it.
- `ctx.provide('newConversationRestore', { version: 1 })` — признак восстановления нового поколения разговора. Читают двое, и оба без него отказывают новому поколению: канал `dsh-telegram-multiagent` перед переходом `/new` и адаптер подписки `dsh-subscription-adapter` (запрос нового поколения и служба `conversationIdentity.check`) — по `ctx.get('newConversationRestore')?.version === 1`.
- `ctx.provide('newConversationRestore', { version: 1 })` — a flag that a new conversation generation will be restored. Two readers, both refuse a new generation without it: the `dsh-telegram-multiagent` channel before a `/new` transition and the subscription adapter `dsh-subscription-adapter` (the new-generation request and the `conversationIdentity.check` service) — via `ctx.get('newConversationRestore')?.version === 1`.
- `ctx.on('session/event', …)` — ловит `compaction/start`, `compaction/summary`, `compaction/end` из журнала сессии (отдельного хука `compaction/*` нет). Успешный `compaction/end` взводит восстановление для этой сессии.
- `ctx.on('session/event', …)` — catches `compaction/start`, `compaction/summary`, `compaction/end` from the session journal (there is no separate `compaction/*` hook). A successful `compaction/end` arms restoration for that session.
- `ctx.on('agent/pre-step', …, { prepend: true })` — сначала зовёт `next()`, затем при необходимости добавляет одно сообщение `createUserMessage` с `source.kind = 'plugin:dsh-pamyat-restore'`, `form: 'snapshot'` и секциями `dsh-pamyat-restore#zapis-<id>` по поданным записям. Решение `reject` и прерванный шаг не трогает.
- `ctx.on('agent/pre-step', …, { prepend: true })` — calls `next()` first, then, when needed, appends one `createUserMessage` message with `source.kind = 'plugin:dsh-pamyat-restore'`, `form: 'snapshot'` and sections `dsh-pamyat-restore#zapis-<id>` for the delivered records. A `reject` decision or an aborted step is left untouched.
- Инструментов не регистрирует.
- No tools are registered.
- Защёлка `globalThis.__pamyatRestore`: второй `apply` в том же процессе сразу выходит.
- Latch `globalThis.__pamyatRestore`: a second `apply` in the same process returns immediately.

Чужие службы берутся через `ctx.get`, не `inject` (их отсутствие не останавливает агента):

Other services are obtained through `ctx.get`, not `inject` (their absence does not stop the agent):

- `pamyat` (ядро `dsh-pamyat-core`): `prochitat` (чтение записей, 10 знаний и отдельно 1 сводка класса `klassSvodki`), `dostupna`/`pochemuNedostupna`, `sessiyaIsklyuchena` (политика исключения сессий), `otmetitKasanie` (касание поданных записей, `povod: 'vydacha-agentu'`), `sobytiyaSessii`/`eSvodkaSzhatiya` (чтение журнала сессии; без них — запасной путь через `session.events`).
- `pamyat` (core, `dsh-pamyat-core`): `prochitat` (reads records: 10 knowledge records, and separately 1 summary of class `klassSvodki`), `dostupna`/`pochemuNedostupna`, `sessiyaIsklyuchena` (session exclusion policy), `otmetitKasanie` (touches delivered records, `povod: 'vydacha-agentu'`), `sobytiyaSessii`/`eSvodkaSzhatiya` (session journal reading; without them it falls back to `session.events`).
- `byudzhetPamyati` (`dsh-pamyat-byudzhet`): `otobrat({ zapisi })` — отбор знаний для слоя C. В слое B бюджет не зовётся.
- `byudzhetPamyati` (`dsh-pamyat-byudzhet`): `otobrat({ zapisi })` — knowledge selection for layer C. Layer B never calls the budget.

Файлы, которые пишет код:

Files written by the code:

- `welcomeOtmetki` (по умолчанию `~/.dsh-pamyat-welcome-otmetki.json`) — JSON «id сессии → время последнего брифинга в мс»; пишется `writeFileSync`, каталог создаётся при надобности.
- `welcomeOtmetki` (default `~/.dsh-pamyat-welcome-otmetki.json`) — JSON mapping session id to the last briefing time in ms; written with `writeFileSync`, the directory is created if needed.
- `<welcomeOtmetki>.compaction-ok.json` — свидетель успешного платформенного сжатия `{version:1, scope, session, compactionId, time}`; пишется атомарно: временный `<…>.<uuid>.tmp` с правами 0600, `fsync`, `rename`, `fsync` каталога.
- `<welcomeOtmetki>.compaction-ok.json` — evidence of a successful platform compaction `{version:1, scope, session, compactionId, time}`; written atomically: temporary `<…>.<uuid>.tmp` with mode 0600, `fsync`, `rename`, directory `fsync`.

Весь журнал плагина — строки в stderr с префиксом `[dsh-pamyat-restore <версия из package.json>]`.

All plugin logging is stderr lines prefixed `[dsh-pamyat-restore <version from package.json>]`.

## Установка · Installation

**Откуда ставить.** В npm доступна редакция `3.1.2` (замер 15.10.2026, `npm view dsh-pamyat-restore version`). По решению владельца от 14.10.2026 изменения после публикации ведутся локально и в npm не выкладываются. Для актуальной локальной редакции подготовьте архив из выбранной головы дерева: `npm pack <дерево>/packages/dsh-pamyat-restore`, затем `npm install ./dsh-pamyat-restore-<версия>.tgz`.

**Where to install from.** npm provides `3.1.2` (checked on 2026-10-15 with `npm view dsh-pamyat-restore version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. For the current local edition, pack the selected source revision with `npm pack <tree>/packages/dsh-pamyat-restore`, then run `npm install ./dsh-pamyat-restore-<version>.tgz`.

На машине пакет ставится общим для всех агентов, через npm по lock-файлу каталога `/opt/agent-plugins`. В `/opt/agent-plugins/package.json` зависимость указывает на тарбол:

On the machine the package is installed once for all agents, with npm from the lock file of `/opt/agent-plugins`. In `/opt/agent-plugins/package.json` the dependency points to a tarball:

```json
"dsh-pamyat-restore": "file:../agent-plugins-tarbally/dsh-pamyat-restore-<версия>.tgz"
```

Тарболы лежат в `/opt/agent-plugins-tarbally/`, точная версия и `integrity` закреплены в `/opt/agent-plugins/package-lock.json`. Рядом в том же `node_modules` должны стоять peer-зависимости (`@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`) и, для реальных данных, `dsh-pamyat-core`.

Tarballs live in `/opt/agent-plugins-tarbally/`; the exact version and `integrity` are pinned in `/opt/agent-plugins/package-lock.json`. The peer dependencies (`@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`) and, for real data, `dsh-pamyat-core` must sit next to it in the same `node_modules`.

Подключение — ссылка из профиля агента на общий каталог и запись в разделе `insert` файла `<DSH_HOME>/profiles/web/cordis.patch.yml`. Пример по форме боевых профилей (путь файла отметок — образец, у каждого агента свой):

Enabling: a symlink from the agent profile to the shared directory and an entry in the `insert` section of `<DSH_HOME>/profiles/web/cordis.patch.yml`. Example in the form of the production profiles (the marker file path is a sample; each agent has its own):

```yaml
- insert:
    - name: dsh-pamyat-restore
      id: dsh-pamyat-restore
      config:
        klassSvodki: svodka-kompakcii
        restoreEnabled: true
        welcomeEnabled: true
        welcomeBudget: 15200
        ignoreAfterMs: 604800000
        useVeraThreshold: 0.7
        welcomeInterval: 86400000
        welcomeOtmetki: /opt/<агент>/pamyat/welcome-otmetki.json
```

Новые настройки берутся только после перезапуска процесса агента: повторный `apply` в том же процессе сразу выходит (защёлка `globalThis.__pamyatRestore`).

New settings take effect only after the agent process restarts: a repeated `apply` in the same process returns immediately (latch `globalThis.__pamyatRestore`).

## Настройка · Configuration

Ключи `config` (Schema `Config` в `src/index.js`):

`config` keys (Schema `Config` in `src/index.js`):

| Ключ · Key | Тип · Type | Умолчание · Default | Что делает · Effect |
|---|---|---|---|
| `restoreEnabled` | boolean | `true` | Слой B: восстановление после успешного `compaction/end`. · Layer B: restoration after a successful `compaction/end`. |
| `welcomeEnabled` | boolean | `true` | Слой C: welcome-брифинг. · Layer C: welcome briefing. |
| `welcomeBudget` | number | `800` | Мягкий предел длины строк знаний брифинга (в единицах длины строки JS). Первая строка входит всегда; рамка, строки отмен и сводка компакта идут вне предела. · Soft length limit for briefing knowledge lines (JS string length units). The first line always fits; the frame, cancellation lines and the compaction summary are outside the limit. |
| `welcomeInterval` | number | `86400000` | Минимальный промежуток между брифингами одной и той же сессии, мс (по файлу `welcomeOtmetki`). · Minimum interval between briefings of the same session, ms (tracked in `welcomeOtmetki`). |
| `welcomeOtmetki` | string | `join(homedir(), '.dsh-pamyat-welcome-otmetki.json')` | Файл отметок брифинга; от него же строится путь `<…>.compaction-ok.json`. При общем доме нескольких агентов задавать свой путь каждому. · Briefing marker file; the `<…>.compaction-ok.json` path is derived from it. When several agents share a home, give each its own path. |
| `ignoreAfterMs` | number | `604800000` (7 суток) · `604800000` (7 days) | Запись старше — `ignore`. · Older records get `ignore`. |
| `useVeraThreshold` | number | `0.7` | Вера не ниже порога — `use` (с оговорками ниже). · Trust at or above it gets `use` (with the caveats below). |
| `ignoreVeraThreshold` | number | `0.3` | Вера ниже порога — `ignore`; между порогами — `verify`. Должен быть ниже `useVeraThreshold`, иначе при подъёме в stderr строка «пороги веры несовместимы» (загрузка не останавливается). · Trust below it gets `ignore`; between the thresholds — `verify`. Must be below `useVeraThreshold`; otherwise startup logs "пороги веры несовместимы" to stderr (loading continues). |
| `klassSvodki` | string | `svodka-kompakcii` | Класс записи-сводки компакта. Обязан совпадать с `klass` секретаря (`dsh-pamyat-secretary`), иначе сводки «не найдутся». · Record class of the compaction summary. Must match the secretary `klass` (`dsh-pamyat-secretary`), otherwise summaries are "not found". |

Порядок решения `decide` для записи знания: время неизвестно — `verify`; старше `ignoreAfterMs` — `ignore`; состояние доверия от ядра (`otmenena` — `ignore` с видимой строкой ⛔ без содержимого; `oprovergnuta`/`otmetka-negodna`/`utochnena` — `verify`; `podtverzhdena` — `use`); вера не измерена — `verify`; ниже `ignoreVeraThreshold` — `ignore`; ниже `useVeraThreshold` — `verify`; если все оценки от модели (`kem` начинается с `model:`) — `use` только при «helped» от двух разных `kem`.

`decide` order for a knowledge record: unknown time — `verify`; older than `ignoreAfterMs` — `ignore`; core trust state (`otmenena` — `ignore` with a visible ⛔ line without content; `oprovergnuta`/`otmetka-negodna`/`utochnena` — `verify`; `podtverzhdena` — `use`); trust not measured — `verify`; below `ignoreVeraThreshold` — `ignore`; below `useVeraThreshold` — `verify`; if all ratings are model-authored (`kem` starts with `model:`) — `use` only with "helped" from two distinct `kem` values.

Переменных окружения код плагина не читает (путь по умолчанию зависит от `homedir()`). Стенды читают: `DSH_SESSION`, `DSH_TEST_APP`, `STEND_APP` (`test/stend-restore.mjs`), `PREDMET` (`test/stend-krik-zvuchit.mjs`), `STEND_RESTORE` (`test/stend-welcome-v2.mjs`).

The plugin code reads no environment variables (the default path depends on `homedir()`). The stands read: `DSH_SESSION`, `DSH_TEST_APP`, `STEND_APP` (`test/stend-restore.mjs`), `PREDMET` (`test/stend-krik-zvuchit.mjs`), `STEND_RESTORE` (`test/stend-welcome-v2.mjs`).

Файлы: пишет `welcomeOtmetki` и `<welcomeOtmetki>.compaction-ok.json` (см. выше), читает их же и `package.json` пакета (версия для строк журнала).

Files: writes `welcomeOtmetki` and `<welcomeOtmetki>.compaction-ok.json` (see above), reads them back, and reads the package `package.json` (version for log lines).

## Проверка · Verification

Стенды лежат в `test/`, работают на подставных данных и временных каталогах, живых служб не зовут. Коды возврата у каждого стенда: 0 — сошлось, 1 — расхождение (в том числе непойманный `assert`), 2 — слепота: проверка не состоялась (нет зависимостей, соседнего пакета или SDK) — это не успех.

The stands live in `test/`, run on fixtures and temporary directories, and call no live services. Exit codes of each stand: 0 — match, 1 — mismatch (including an uncaught `assert`), 2 — blindness: the check could not run (missing dependencies, neighbouring package or SDK); exit 2 is not success.

```sh
    npm test
    node test/stend-restore.mjs
    node test/stend-doveriya-vydachi.mjs
    node test/stend-readme.mjs
    DSH_SESSION=<платформа>/node_modules/@deepseek-ai/dsh-session/lib/index.js node test/stend-restore.mjs
```

`npm test` гоняет все `test/stend-*.mjs` по очереди и итожит: 1, если хоть один стенд дал 1; иначе ненулевой код последнего стенда, вернувшего 2 или иной ненулевой код; 0 — все дали 0. Нужен POSIX shell.

`npm test` runs every `test/stend-*.mjs` in turn and returns: 1 if any stand returned 1; otherwise the nonzero code of the last stand that returned 2 or another nonzero code; 0 if all returned 0. It needs a POSIX shell.

| Стенд · Stand | Что проверяет · What it checks |
|---|---|
| `test/stend-restore.mjs` | Основной: слои B и C раздельно — доступность памяти, форма сообщения (`id`, роль, `source.kind`, секции), доверие и пороги, бюджет, сводка, касания. С SDK (`DSH_SESSION` или `DSH_TEST_APP`/`STEND_APP`) — прохождение события через валидатор загрузки платформы; рядом `dsh-pamyat-core` — согласие порогов с формулой веры; рядом `dsh-pamyat-secretary` — совпадение `klassSvodki` с его `klass`. · Main stand: layers B and C separately — memory availability, message shape (`id`, role, `source.kind`, sections), trust and thresholds, budget, summary, touches. With an SDK (`DSH_SESSION` or `DSH_TEST_APP`/`STEND_APP`) — the event passes the platform load validator; with a neighbouring `dsh-pamyat-core` — thresholds agree with the trust formula; with a neighbouring `dsh-pamyat-secretary` — `klassSvodki` matches its `klass`. |
| `test/stend-bez-isklyucheniya.mjs` | Без `sessiyaIsklyuchena` у ядра, без ядра или для исключённой сессии память не читается и ничего не вставляется; после возврата — снова вставляется. · Without core `sessiyaIsklyuchena`, without the core, or for an excluded session, memory is not read and nothing is inserted; after recovery insertion resumes. |
| `test/stend-doveriya-vydachi.mjs` | Состояния доверия: отмена — строка ⛔ без содержимого и касания; сквозная проба через настоящее ядро на временной базе. · Trust states: cancellation yields an ⛔ line without content or touch; end-to-end probe through the real core on a temporary database. |
| `test/stend-kasaniya-podannyh.mjs` | Касания ставятся ровно записям, вошедшим в текст (настоящее ядро, временная база, сверка отдельным SQL-соединением). · Touches go exactly to records that entered the text (real core, temporary database, checked through a separate SQL connection). |
| `test/stend-klass-nol.mjs` | Ноль сводок до и после успешного сжатия, ошибочный `compaction/end`, история до монтажа, порча и чужая отметка `.compaction-ok.json`, отказ записи и чтения. · Zero summaries before and after successful compaction, failed `compaction/end`, pre-load history, corrupt and foreign `.compaction-ok.json`, write and read failures. |
| `test/stend-krik-zvuchit.mjs` | В отдельном процессе с настоящим cordis: строка подъёма с версией из `package.json` доходит до stderr; без службы `agents` плагин ждёт и молчит. · In a separate process with real cordis: the startup line with the version from `package.json` reaches stderr; without the `agents` service the plugin waits silently. |
| `test/stend-nastavleniya-ocenki.mjs` | Наставление про `pamyat_ocenit` в брифинге ровно одно и только при поданных знаниях. · The `pamyat_ocenit` instruction appears exactly once in the briefing and only with delivered knowledge. |
| `test/stend-new-session.mjs` | Сессия `telegram-v2-*` получает знания, но не старую глобальную сводку (ни в welcome, ни после чужого сжатия); `telegram-a2a` сохраняет оба пути. · A `telegram-v2-*` session receives knowledge but not the old global summary (neither in welcome nor after a foreign compaction); `telegram-a2a` keeps both paths. |
| `test/stend-otmenennyh-v-konce.mjs` | Отмены идут в конце вне `welcomeBudget`: первые 3 поимённо, остальные сводкой; дата записи ДД.ММ по Москве. · Cancellations go last, outside `welcomeBudget`: first 3 by id, the rest summarized; record date DD.MM in Moscow time. |
| `test/stend-pometki-otnoshenij.mjs` | Форматирование отношений записей (отменена/уточнена/отменяет/уточняет) и `#id`. · Formatting of record relationships (cancelled/refined/cancels/refines) and `#id`. |
| `test/stend-readme.mjs` | Оба README: ключи настроек, ссылки на файлы из архива `npm pack`, одинаковые команды проверки, упоминание слепоты; форма версий зависимостей; запуск остальных стендов в распакованном архиве (допустимы 0 и 2). · Both READMEs: settings keys, links to files in the `npm pack` archive, identical verification commands, mention of blindness; dependency version shape; runs the other stands from the unpacked archive (0 and 2 are acceptable). |
| `test/stend-sleda-vydachi.mjs` | Строка следа выдачи: счёт use/verify/ignore/«не влезло» сходится с числом отобранных. · Delivery trace line: use/verify/ignore/"did not fit" counts add up to the number of selected records. |
| `test/stend-styka-sobytij.mjs` | Стык с ядром: `pomoshchnikYadra` через `ctx.get` и поиск сводки в поверхности на формах журнала DSH 0.1.1 и 0.2.0. · Core integration: `pomoshchnikYadra` via `ctx.get` and summary lookup in the surface on DSH 0.1.1 and 0.2.0 journal shapes. |
| `test/stend-use-ot-modeli.mjs` | Правило `use` при оценках только от модели: нужны «helped» от двух разных `kem`. · The `use` rule for model-only ratings: "helped" from two distinct `kem` values is required. |
| `test/stend-welcome-v2.mjs` | Предел `welcomeInterval` — на сессию: каждый новый `telegram-v2-*` получает брифинг, перезапуск той же сессии в пределах интервала — нет. · `welcomeInterval` is per session: every new `telegram-v2-*` session gets a briefing, a restart of the same session within the interval does not. |

Стенды `stend-doveriya-vydachi`, `stend-kasaniya-podannyh`, `stend-styka-sobytij` и части `stend-restore` ищут соседний `../../dsh-pamyat-core` (и `../../dsh-pamyat-secretary`); без них — код 2. `stend-kasaniya-podannyh` требует `node:sqlite`.

`stend-doveriya-vydachi`, `stend-kasaniya-podannyh`, `stend-styka-sobytij` and parts of `stend-restore` look for a neighbouring `../../dsh-pamyat-core` (and `../../dsh-pamyat-secretary`); without them the result is exit 2. `stend-kasaniya-podannyh` needs `node:sqlite`.

## Ограничения · Limitations

- Зависимости: peer `@deepseek-ai/dsh-llm` (подэкспорт `@deepseek-ai/dsh-llm/message`) и `@deepseek-ai/schemastery`; диапазоны — в `package.json`. Обязательная служба — только `agents`. Без `pamyat` (`dsh-pamyat-core`) плагин поднимается, но ничего не подаёт и пишет об этом в stderr. Без `byudzhetPamyati` (`dsh-pamyat-byudzhet`) брифинг строится без отбора по бюджету. Сводки пишет `dsh-pamyat-secretary`; побуждение без повторной вставки работает только для сводок провайдера `dsh-pamyat-kompakt` (пакет `dsh-pamyat-kompakt-dsh`). С `dsh-pamyat-omega` код напрямую не связан.
- Dependencies: peers `@deepseek-ai/dsh-llm` (subexport `@deepseek-ai/dsh-llm/message`) and `@deepseek-ai/schemastery`; ranges are in `package.json`. The only required service is `agents`. Without `pamyat` (`dsh-pamyat-core`) the plugin starts but delivers nothing and says so on stderr. Without `byudzhetPamyati` (`dsh-pamyat-byudzhet`) the briefing is built without budget selection. Summaries are written by `dsh-pamyat-secretary`; the prompt-only path (no re-insertion) works only for summaries from provider `dsh-pamyat-kompakt` (package `dsh-pamyat-kompakt-dsh`). The code has no direct link to `dsh-pamyat-omega`.
- Без метода `sessiyaIsklyuchena` у ядра чтение и подача памяти запрещены (`ОТКАЗ PAMYAT_POLITIKA_NEDOSTUPNA` в stderr), обычный ход агента идёт.
- Without core `sessiyaIsklyuchena`, memory reads and delivery are refused (`ОТКАЗ PAMYAT_POLITIKA_NEDOSTUPNA` on stderr); the normal agent turn proceeds.
- Сессии `telegram-v2-*`: после чужого сжатия глобальная сводка не переносится; welcome даёт только знания, без сводки компакта.
- `telegram-v2-*` sessions: the global summary is not carried over after a foreign compaction; welcome delivers knowledge only, without the compaction summary.
- Слой C читает не больше 10 записей; бюджет отбирает только из них. Сводка в welcome подаётся целиком, вне `welcomeBudget`, бюджета и проверок `decide` (возраст и доверие); предупреждение о старой сводке есть только в слое B. Если её текст (без последнего абзаца-обещания хвоста) уже входит в сообщение сводки сжатия на поверхности сессии (`svodkaNaPoverhnosti` в `src/index.js`), в брифинг она НЕ поднимается — в stderr «уже стоит в поверхности этой сессии — в брифинг НЕ поднята»; если поверхность прочитать не удалось, сводка поднимается, как прежде, со строкой «поверхность сессии не прочитана — есть ли там сводка, НЕ ЗНАЕМ».
- Layer C reads at most 10 records; the budget selects only from them. The summary in welcome is delivered in full, outside `welcomeBudget`, the budget service and `decide` checks (age and trust); the old-summary warning exists only in layer B. If its text (without the final continuation-promise paragraph) is already contained in a compaction summary message on the session surface (`svodkaNaPoverhnosti` in `src/index.js`), it is NOT raised into the briefing — stderr says «уже стоит в поверхности этой сессии — в брифинг НЕ поднята» (already in this session's surface, not raised); if the surface could not be read, the summary is raised as before with the line «поверхность сессии не прочитана — есть ли там сводка, НЕ ЗНАЕМ» (surface not read, unknown whether the summary is there).
- `welcomeBudget` — не предел всего сообщения.
- `welcomeBudget` is not a limit on the whole message.
- Отметки (процессная и дисковая) ставятся до чтения памяти: при отказе чтения брифинг этой сессии не повторится до нового процесса или истечения интервала. В одном процессе сессия получает не больше одного брифинга, даже после `welcomeInterval`. Испорченный или нечитаемый `welcomeOtmetki` читается как «брифинга не было».
- Markers (in-process and on disk) are set before memory is read: if reading fails, the session's briefing is not retried until a new process or the interval expires. Within one process a session gets at most one briefing, even after `welcomeInterval`. A corrupt or unreadable `welcomeOtmetki` reads as "no briefing yet".
- Касания ставятся до возврата сообщения: это не доказательство, что модель его получила.
- Touches are recorded before the message is returned; this does not prove the model received it.
- Решение `use` — пометка к данным, не доказательство истинности; различие `kem` не доказывает независимость выдач (это протокол записи ядра).
- A `use` decision is an annotation, not proof of truth; distinct `kem` values do not prove independent deliveries (that is the core write protocol).
- Не делает резервных копий, не шифрует, не чистит чужое знание от инструкций, не ставит сторожей: журнал — только stderr, читать его должен кто-то снаружи.
- No backups, no encryption, no sanitizing of prompt instructions in stored knowledge, no watchdogs: logging is stderr only, and someone outside must read it.
- Скрипт `npm test` написан на POSIX shell; в иной оболочке он не работает.
- The `npm test` script is written for a POSIX shell and does not work in other shells.

## Лицензия · License

MIT — поле `license` в `package.json`, текст — [LICENSE](LICENSE).

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
