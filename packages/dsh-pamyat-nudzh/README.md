# dsh-pamyat-nudzh

## Назначение · Purpose

Плагин cordis для платформы агентов DSH — расходная сторона учёта контекста: по журналу сессии он считает занятость окна модели и сумму расхода токенов. Когда занятость переходит порог, пакет один раз за цикл вставляет модели напоминание записать важное в память до компакта (сжатия разговора) и пишет об этом строку в stderr. Что поднимать обратно в разговор — не его дело: это соседний пакет `dsh-pamyat-byudzhet`. Провайдер присылает число расхода не всегда, поэтому пакет утверждает только «уже не меньше порога» и никогда — «места хватает» (`src/index.js`, шапка и `hvatitLi`). Молчание нуджа не означает запаса: оно значит лишь «по учтённой части порог не перейдён».

A cordis plugin for the DSH agent platform — the spending side of context accounting: from the session journal it counts the model window occupancy and the total spend of tokens. When occupancy crosses the threshold, the package inserts, once per cycle, a reminder telling the model to write what matters into memory before compaction (summarising the conversation), and prints a line about it to stderr. What to bring back into the conversation is not its business: that is the sibling package `dsh-pamyat-byudzhet`. The provider does not always send a usage number, so the package only ever states "already at least the threshold" and never "there is room" (`src/index.js`, the header and `hvatitLi`). The nudge's silence does not mean headroom: it only means "the threshold is not crossed by the counted part".

## Что ставится и куда · What gets installed and where

Состав пакета задан полем `files` в `package.json`; `package.json` и `LICENSE` npm кладёт в архив сам:

The package contents are defined by the `files` field of `package.json`; npm adds `package.json` and `LICENSE` to the archive by itself:

| путь в пакете · path in the package | что это · what it is |
|---|---|
| `src/index.js` | плагин: `name`, `Config` (схема schemastery), `apply`; точка входа (`main`/`exports`), `"type": "module"` · the plugin: `name`, `Config` (schemastery schema), `apply`; entry point (`main`/`exports`), `"type": "module"` |
| `src/schet.js` | арифметика расхода: `raskhodVyzova`, `zavestiSchet` · spend arithmetic: `raskhodVyzova`, `zavestiSchet` |
| `test/` | восемь стендов `stend-*.mjs` (см. «Проверка») · eight stands `stend-*.mjs` (see "Verification") |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |
| `README.md`, `README.en.md`, `CHANGELOG.md` | описание и история выпусков · description and release history |
| `LICENSE` | текст лицензии MIT (поле `license` в `package.json`) · the MIT license text (the `license` field in `package.json`) |

Собственных `dependencies` у пакета нет. `@deepseek-ai/cordis`, `@deepseek-ai/schemastery` и `@deepseek-ai/dsh-llm` объявлены в `peerDependencies` (диапазоны — в `package.json`) и берутся из окружения: `src/index.js` импортирует `@deepseek-ai/schemastery` и `createUserMessage` из `@deepseek-ai/dsh-llm/message`.

The package has no `dependencies` of its own. `@deepseek-ai/cordis`, `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-llm` are declared in `peerDependencies` (ranges are in `package.json`) and come from the environment: `src/index.js` imports `@deepseek-ai/schemastery` and `createUserMessage` from `@deepseek-ai/dsh-llm/message`.

На машине пакет лежит одним экземпляром в общем каталоге плагинов: `agent-plugins/node_modules/dsh-pamyat-nudzh` (рядом, в том же `node_modules`, стоят и `@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-llm`). Профиль агента видит его через ссылку `<домашний каталог агента>/.dsh/profiles/web/node_modules/dsh-pamyat-nudzh`, ведущую на этот каталог. Сам пакет на диск ничего не пишет: из файлов он только читает свой `package.json` ради номера версии в строках журнала.

On the machine the package is installed once, in the shared plugins directory: `agent-plugins/node_modules/dsh-pamyat-nudzh` (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-llm` sit next to it in the same `node_modules`). An agent profile sees it through the link `<agent home directory>/.dsh/profiles/web/node_modules/dsh-pamyat-nudzh` pointing to that directory. The package writes nothing to disk: the only file it reads is its own `package.json`, for the version number in log lines.

## Установка · Installation

**Откуда ставить.** В npm доступна редакция `3.1.2` (замер 15.10.2026, `npm view dsh-pamyat-nudzh version`). По решению владельца от 14.10.2026 изменения после публикации ведутся локально и в npm не выкладываются. Для актуальной локальной редакции подготовьте архив из выбранной головы дерева: `npm pack <дерево>/packages/dsh-pamyat-nudzh`, затем `npm install ./dsh-pamyat-nudzh-<версия>.tgz`.

**Where to install from.** npm provides `3.1.2` (checked on 2026-10-15 with `npm view dsh-pamyat-nudzh version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. For the current local edition, pack the selected source revision with `npm pack <tree>/packages/dsh-pamyat-nudzh`, then run `npm install ./dsh-pamyat-nudzh-<version>.tgz`.

1. Тарбол `dsh-pamyat-nudzh-<версия>.tgz` лежит на полке `agent-plugins-tarbally/` — соседнем каталоге с `agent-plugins/`.

   The tarball `dsh-pamyat-nudzh-<version>.tgz` sits on the `agent-plugins-tarbally/` shelf — a sibling directory of `agent-plugins/`.

2. В `agent-plugins/package.json` пакет записан зависимостью на этот тарбол, версия закреплена в `package-lock.json`:

   `agent-plugins/package.json` lists the package as a dependency on that tarball; the version is pinned in `package-lock.json`:

   ```json
   "dsh-pamyat-nudzh": "file:../agent-plugins-tarbally/dsh-pamyat-nudzh-<версия>.tgz"
   ```

   Ставит его npm по lock-файлу в каталоге `agent-plugins/`.

   npm installs it from the lock file in the `agent-plugins/` directory.

3. В профиле агента (`<домашний каталог агента>/.dsh/profiles/web/node_modules/`) — ссылка `dsh-pamyat-nudzh` на установленный каталог.

   The agent profile (`<agent home directory>/.dsh/profiles/web/node_modules/`) has a link `dsh-pamyat-nudzh` to the installed directory.

4. Подключение в `<домашний каталог агента>/.dsh/profiles/web/cordis.patch.yml`, раздел `- insert:` (форма — как в действующих профилях, комментарии убраны):

   Mounting in `<agent home directory>/.dsh/profiles/web/cordis.patch.yml`, section `- insert:` (shape as in the live profiles, comments removed):

   ```yaml
   - insert:
       - name: dsh-pamyat-nudzh
         id: dsh-pamyat-nudzh
         config:
           predel: 1000000
           dolyaTrevogi: 0.7
           otmetkiPuti: [0.5, 0.6, 0.7, 0.85, 0.9, 0.95]
   ```

5. Перезапустить агента. Признак подключения — строка подъёма в stderr процесса (журнале службы):

   Restart the agent. The sign it is mounted is the start-up line in the process stderr (the service log):

   ```text
   [dsh-pamyat-nudzh <версия>] подъём: предел 1000000 ток., доля тревоги 0.7 (порог 700000 ток.). Числитель — занятость ПОСЛЕДНЕГО вызова, не сумма за сессию.
   ```

   Платформа вызывает `apply` несколько раз за один подъём (в коде записан замер: 3), поэтому строка подъёма может повториться (`src/index.js`, комментарий перед `apply`).

   The platform calls `apply` several times per start-up (the code records a measurement: 3), so the start-up line may repeat (`src/index.js`, the comment before `apply`).

## Настройка · Configuration

Ключи блока `config` (схема `Config` в `src/index.js`). Схема знает только типы; границы проверяет `apply` при каждом вызове — и при старте, и при горячей загрузке настройки.

Keys of the `config` block (the `Config` schema in `src/index.js`). The schema only knows types; bounds are checked by `apply` on every call — both at start-up and on a hot reload of the settings.

| ключ · key | тип · type | умолчание · default | допуск · range | смысл · meaning |
|---|---|---|---|---|
| `predel` | число · number | 0 | [0, ∞), конечное · [0, ∞), finite | окно модели в токенах провайдера; 0 — предел неизвестен: расход считается, но тревоги, отметок и вставок нет, при подъёме печатается «предел контекста НЕ ЗАДАН (predel: 0) …» · the model window in provider tokens; 0 — limit unknown: spend is counted, but there is no alarm, no marks and no insertions; at start-up it prints "предел контекста НЕ ЗАДАН (predel: 0) …" |
| `dolyaTrevogi` | число · number | 0.8 | (0, 1] | доля предела, с которой пора подталкивать к компакту; порог = `predel × dolyaTrevogi` · the fraction of the limit from which to nudge towards compaction; threshold = `predel × dolyaTrevogi` |
| `otmetkiPuti` | массив чисел · array of numbers | `[]` | каждое строго между 0 и 1 · each strictly between 0 and 1 | отметки на пути к порогу: на каждую пересечённую печатается одна строка-наблюдение за цикл; на тревогу не влияют · marks on the way to the threshold: one observation line per crossed mark per cycle; they do not affect the alarm |

Негодный `predel` или `dolyaTrevogi` (вне допуска, бесконечность) отклоняется строкой «ОТКЛОНЕНО: <ключ> = … — вне допуска …; действует …»: действует прежнее годное значение, а если его нет — умолчание. `null` и отсутствие ключа дают умолчание. Негодные отметки отбрасываются строкой «ОТКЛОНЕНО: otmetkiPuti — … отброшены …; действуют …», годные сортируются по возрастанию. Подробно — `docs/SETTINGS.md`.

An invalid `predel` or `dolyaTrevogi` (out of range, infinity) is rejected with a line "ОТКЛОНЕНО: <key> = … — вне допуска …; действует …": the previous valid value stays in force, or the default if there is none. `null` or a missing key gives the default. Invalid marks are dropped with a line "ОТКЛОНЕНО: otmetkiPuti — … отброшены …; действуют …"; valid ones are sorted ascending. Details — `docs/SETTINGS.md`.

Переменных окружения пакет не читает (`process.env` в коде нет), файлов настроек у него нет.

The package reads no environment variables (there is no `process.env` in the code) and has no settings files.

### Две величины · Two quantities

- **Занятость окна** — вход последнего вызова модели, у которого было число от провайдера (`inputTokens + cacheReadTokens + cacheWriteTokens`). Порог считается от неё; после компакта она падает. Строка тревоги: «пора подтолкнуть к компакту: занято … из … (порог …%)».
- **Window occupancy** is the input of the model's last call that had a provider number (`inputTokens + cacheReadTokens + cacheWriteTokens`). The threshold is computed from it; it drops after compaction. The alarm line: "пора подтолкнуть к компакту: занято … из … (порог …%)".
- **Сумма расхода** — сколько токенов прошло через API за все учтённые вызовы (`neMenshe`). Каждый вызов пересылает весь контекст, поэтому сумма растёт без предела и компакт её не уменьшает. Это нижняя оценка: сумма может быть только БОЛЬШЕ, потому что вызовы без числа (`bezChisla`) посчитать нельзя.
- **Total spend** is how many tokens went through the API over all counted calls (`neMenshe`). Every call resends the whole context, so the sum grows without bound and compaction does not reduce it. It is a lower bound: the sum can only be LARGER, because calls without a number (`bezChisla`) cannot be counted.

### Служба и события · Service and events

Пакет публикует службу `nudzhPamyati` (`ctx.provide`):

The package publishes the `nudzhPamyati` service (`ctx.provide`):

| метод · method | что делает и возвращает · what it does and returns |
|---|---|
| `uchest(usage, session?)` | учесть расход одного вызова; с сессией — только догнать её журнал, переданный `usage` не прибавляется (иначе то же событие считалось бы дважды) · count one call's spend; with a session — only catch up with its journal, the given `usage` is not added (otherwise the same event would be counted twice) |
| `itog(session?)` | `{ neMenshe, zanyato, vhod, vyhod, izNihRassuzhdenie, uchtenoVyzovov, bezChisla, polnyj }`; без сессии — сумма по всем известным состояниям, `zanyato` — у последнего тронутого; у слепой сессии `zanyato: null` · `{ neMenshe, zanyato, vhod, vyhod, izNihRassuzhdenie, uchtenoVyzovov, bezChisla, polnyj }`; without a session — the sum over all known states, `zanyato` from the last one touched; a blind session gives `zanyato: null` |
| `hvatitLi(session?)` | никогда не «хватает»: `sostoyanie` = `porog-pereyden` (с `zanyato`, `neMenshe`, `predel`, `uchtenoVyzovov`, `bezChisla`) или `neizvestno` (с `pochemu` и числами полноты; при `predel: 0` — только `uchtenoVyzovov`, `bezChisla`; у слепой сессии — только `pochemu`) · never "enough": `sostoyanie` = `porog-pereyden` (with `zanyato`, `neMenshe`, `predel`, `uchtenoVyzovov`, `bezChisla`) or `neizvestno` (with `pochemu` and completeness numbers; with `predel: 0` — only `uchtenoVyzovov`, `bezChisla`; for a blind session — only `pochemu`) |
| `raskhodVyzova(usage)` | `{ vhod, vyhod, vsego, izNihRassuzhdenie }` одного вызова, без накопления; негодное поле — исключение с именем поля · `{ vhod, vyhod, vsego, izNihRassuzhdenie }` of one call, without accumulation; an invalid field throws, naming the field |

Подписки (`ctx.on`):

Subscriptions (`ctx.on`):

- `session/event` — догоняет состояние сессии по её журналу. Журнал берётся у службы `pamyat` (`ctx.get('pamyat').sobytiyaSessii(session)`, необязательна), иначе `session.snapshotEvents()`, иначе `session.events`; унаследованная от родителя часть (`inheritedEventCount`/`seedLength`) отрезается. Учитываются `assistant/message` (`data.usage`), `compaction/summary` (только в сумму, не в занятость), `compaction/end` (успешный компакт с известным `compactionId` делает занятость неизвестной до свежего `usage`), `user/message` от самого пакета (напоминание уже в журнале — не повторять).
- `session/event` — catches the session state up with its journal. The journal comes from the `pamyat` service (`ctx.get('pamyat').sobytiyaSessii(session)`, optional), else `session.snapshotEvents()`, else `session.events`; the part inherited from the parent (`inheritedEventCount`/`seedLength`) is cut off. Counted are `assistant/message` (`data.usage`), `compaction/summary` (into the sum only, not into occupancy), `compaction/end` (a successful compaction with a known `compactionId` makes occupancy unknown until a fresh `usage`), and `user/message` from the package itself (the reminder is already in the journal — do not repeat it).
- `agent/pre-step` — сначала решение остальных обработчиков (`next()`); при `reject`, оборванном шаге или слепой сессии решение не трогается; если вставка взведена — к `messages` добавляется одно сообщение пользователя, собранное `createUserMessage` с `source.kind: 'plugin:dsh-pamyat-nudzh'`, и решение получает `kind: 'enter'`.
- `agent/pre-step` — first the decision of the other handlers (`next()`); on `reject`, an aborted step or a blind session the decision is left alone; if the insertion is armed, one user message built with `createUserMessage` and `source.kind: 'plugin:dsh-pamyat-nudzh'` is appended to `messages`, and the decision gets `kind: 'enter'`.

Весь вывод — `console.error` с приставкой `[dsh-pamyat-nudzh <версия>]`, версия из своего `package.json` («версия неизвестна», если не прочёлся). `ctx.logger` не используется.

All output goes through `console.error` with the prefix `[dsh-pamyat-nudzh <version>]`, the version taken from its own `package.json` ("версия неизвестна" if it could not be read). `ctx.logger` is not used.

### Что настройкой НЕ является · What is NOT a setting

- **Состав суммы.** Три правила арифметики сняты с кода платформы (замер 03.09; способ — чтение типа `TokenUsage` в `@deepseek-ai/dsh-llm` и функции `mapUsage` адаптера `dsh-llm-deepseek`; см. шапку `src/schet.js`): счётчики DISJOINT — вход = `inputTokens + cacheReadTokens + cacheWriteTokens`; `reasoningTokens` в сумму не идёт (это часть выхода, показывается справочно полем `izNihRassuzhdenie`); вызов без `usage` — не ноль, а `bezChisla`.
- **The composition of the sum.** Three arithmetic rules are taken from the platform's code (measured 03.09; method — reading the `TokenUsage` type in `@deepseek-ai/dsh-llm` and the `mapUsage` function of the `dsh-llm-deepseek` adapter; see the header of `src/schet.js`): the counters are DISJOINT — input = `inputTokens + cacheReadTokens + cacheWriteTokens`; `reasoningTokens` do not go into the sum (they are part of output, shown for reference in the `izNihRassuzhdenie` field); a call without `usage` is not zero but `bezChisla`.
- **Запас недостоверности.** Константа `NEVOZMOZHNO = 1.5`: занятость больше `1.5 × predel` объявляется недостоверной — строка «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН», ни отметок, ни тревоги.
- **The non-credibility margin.** The constant `NEVOZMOZHNO = 1.5`: occupancy above `1.5 × predel` is declared non-credible — the line "СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН", no marks, no alarm.
- **Однократность.** Тревога — одна за цикл, напоминание модели — одно за цикл; цикл кончается, когда занятость вернулась под порог или после успешного компакта.
- **Once per cycle.** One alarm per cycle, one reminder to the model per cycle; a cycle ends when occupancy is back below the threshold or after a successful compaction.
- **Несимметричность ответа.** Значения «хватает» у `hvatitLi` нет ни при какой настройке.
- **The asymmetry of the answer.** `hvatitLi` has no "enough" value under any setting.

## Проверка · Verification

Восемь стендов, 98 проб; оба числа сверяет `stend-readme` с файлами `test/`, поэтому при добавлении проб их надо поправить здесь и в `README.en.md`.

Eight stands, 98 probes; both numbers are checked by `stend-readme` against the files in `test/`, so when probes are added they must be updated here and in `README.md`.

Запуск — из каталога пакета: все сразу `npm test`, по одному — `node test/<стенд>.mjs`. Стендам, поднимающим `src/index.js`, нужны установленные зависимости (`npm install` в каталоге пакета: cordis и schemastery из `devDependencies`, dsh-llm как peer). Стенды гоняют cordis, лежащий рядом с пакетом, а не экземпляр живой платформы.

Run from the package directory: all at once with `npm test`, one at a time with `node test/<stand>.mjs`. Stands that load `src/index.js` need installed dependencies (`npm install` in the package directory: cordis and schemastery from `devDependencies`, dsh-llm as a peer). The stands run the cordis next to the package, not the live platform's instance.

| стенд · stand | проб · probes | что проверяет · what it checks |
|---|---|---|
| `stend-granic-porogov` | 10 | негодный порог отклоняется при старте и горячей загрузке (`fiber.update` на настоящем Context), действует прежнее годное; отметки `[50]` и `[0.5, 1.5]` · an invalid threshold is rejected at start-up and on hot reload (`fiber.update` on a real Context), the previous valid value acts; marks `[50]` and `[0.5, 1.5]` |
| `stend-krik-zvuchit` | 6 | строки пакета доходят до stderr отдельного процесса; `ctx.logger` есть и нем; версия в строке подъёма из `package.json` · the package's lines reach the stderr of a separate process; `ctx.logger` exists and is mute; the version in the start-up line comes from `package.json` |
| `stend-nedostovernogo-schyota` | 11 | занятость больше полутора окон: строка «НЕДОСТОВЕРЕН» есть, «пора подтолкнуть» нет; полоса 1–1,5 окна · occupancy above one and a half windows: the "НЕДОСТОВЕРЕН" line is there, "пора подтолкнуть" is not; the 1–1.5 window band |
| `stend-porogov` | 24 | тревога от занятости, а не от суммы; один раз за цикл; `hvatitLi` без «хватает»; живая форма событий; отметки пути · the alarm from occupancy, not from the sum; once per cycle; `hvatitLi` without "enough"; the live event shape; path marks |
| `stend-posle-kompakta` | 18 | неизвестность после компакта, независимость сессий, восстановление из журнала, слепота; подставной ctx · the unknown state after compaction, independent sessions, restore from the journal, blindness; a fake ctx |
| `stend-readme` | 12 | README согласован с кодом, составом `npm pack` и между двумя языками · the README agrees with the code, with the `npm pack` contents and between the two languages |
| `stend-scheta` | 8 | арифметика `src/schet.js`: три счётчика, `reasoningTokens`, отсутствие числа · the arithmetic of `src/schet.js`: three counters, `reasoningTokens`, a missing number |
| `stend-vstavki` | 8 | напоминание попадает в `decision.messages`, ровно одно за цикл, новый цикл после возврата под порог · the reminder reaches `decision.messages`, exactly one per cycle, a new cycle after the return below the threshold |

Коды возврата отдельного стенда: 0 — все пробы зелёные; 1 — есть красные; 2 — СЛЕПОТА: предмет не загрузился (обычно не установлены зависимости). Особые случаи: `stend-posle-kompakta` отдаёт 2 и при неверном числе проб (канарейка, ждёт 18); `stend-vstavki` — 2, если хук `agent/pre-step` не зарегистрирован; `stend-readme` отдаёт только 0 или 1, и ему нужны `npm` и пишущий `HOME` (проба состава зовёт `npm pack --dry-run`). `npm test` прогоняет все `test/stend-*.mjs` по очереди и сводит коды (скрипт `test` в `package.json`): 1, если хоть один стенд вернул 1; иначе — ненулевой код ПОСЛЕДНЕГО упавшего стенда, будь то 2 или иной (коды не старшинствуют: 2, а затем 3 дают 3; 3, а затем 2 — 2); иначе 0.

Exit codes of a single stand: 0 — all probes green; 1 — some are red; 2 — BLINDNESS: the subject did not load (usually dependencies are not installed). Special cases: `stend-posle-kompakta` also returns 2 on a wrong number of probes (canary, expects 18); `stend-vstavki` returns 2 if the `agent/pre-step` hook is not registered; `stend-readme` returns only 0 or 1 and needs `npm` and a writable `HOME` (the contents probe calls `npm pack --dry-run`). `npm test` runs every `test/stend-*.mjs` in turn and combines the codes (the `test` script in `package.json`): 1 if any stand returned 1; otherwise the non-zero code of the LAST failed stand, whether 2 or another (codes have no precedence: 2 then 3 give 3; 3 then 2 give 2); otherwise 0.

Признаки в живой работе и разбор поломок — `docs/GUARDS.md` и `docs/TROUBLESHOOTING.md`; устройство — `docs/ARCHITECTURE.md`.

Signs in live operation and failure analysis — `docs/GUARDS.md` and `docs/TROUBLESHOOTING.md`; design — `docs/ARCHITECTURE.md`.

## Ограничения · Limitations

- **Не измеряет фактический запрос.** Занятость известна только ПОСЛЕ вызова; отказ по длине случается на самом вызове, и крупная прибавка может перескочить из-под порога сразу в отказ. Заполненность окна, с которой сравнивает платформа, — другое число (`tokenMeter.measure(session).totalTokens`), пакет его не читает.
- **Does not measure the actual request.** Occupancy is known only AFTER a call; a length rejection happens at the call itself, and a large increase can jump from below the threshold straight into a rejection. The window fill the platform compares against is a different number (`tokenMeter.measure(session).totalTokens`); the package does not read it.
- **Не управляет сжатием движка.** Платформа сжимает по своему порогу независимо от пакета. Тревога приходит внутри шага, а вставка ждёт следующего `agent/pre-step`; если компакт случится раньше, напоминание не дойдёт (в коде записан живой замер: ноль ходов между тревогой и компактом). Число шагов в строке «занятость вернулась под порог» — нижняя граница: шаги, оборванные до обработчика, не считаются.
- **Does not control the engine's compaction.** The platform compacts by its own threshold, independently of the package. The alarm arrives inside a step, while the insertion waits for the next `agent/pre-step`; if compaction comes first, the reminder is not delivered (the code records a live measurement: zero turns between the alarm and compaction). The step count in the "занятость вернулась под порог" line is a lower bound: steps cut off before the handler are not counted.
- **Неполные данные.** Вызовы без числа от провайдера не считаются; после них занятость могла устареть (тревога говорит об этом вслух).
- **Incomplete data.** Calls without a provider number are not counted; after them occupancy may be stale (the alarm says so aloud).
- **Защита от недостоверного счёта НЕ ЛОВИТ** занижение, любое неверное число в пределах окна и накопительный `usage`, пока он не перерос полтора окна: между 1 и 1,5 окна тревога подаётся с пометкой «ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА» и может быть ложной.
- **The non-credible count guard DOES NOT CATCH** under-counting, any wrong number within the window, or cumulative `usage` until it outgrows one and a half windows: between 1 and 1.5 windows the alarm is raised with the mark "ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА" and may be false.
- **Слепота.** Журнал сессии недоступен, укорочен или с негодной границей наследования — строка «СЛЕПОТА nudzh: …», вставка в эту сессию запрещена, `hvatitLi` отвечает `neizvestno`. Повторов и таймеров нет.
- **Blindness.** If the session journal is unavailable, shortened or has an invalid inheritance boundary — the line "СЛЕПОТА nudzh: …", insertion into that session is forbidden, `hvatitLi` answers `neizvestno`. There are no retries and no timers.
- **Холодный процесс.** История сессии читается при первом обращении к ней, поэтому `itog()` без сессии неполон, пока не тронуты все сессии.
- **Cold process.** A session's history is read on first access to it, so `itog()` without a session is incomplete until all sessions have been touched.
- **Прежнее годное значение порога одно на процесс** (хранится на уровне модуля): при разных порогах у разных узлов одного процесса действует последнее принятое у любого из них.
- **The previous valid threshold value is one per process** (kept at module level): if different nodes of one process set different thresholds, the last one accepted from any of them applies.
- **Вставка заменяет решение шага** на `{ kind: 'enter', messages }`; прочие поля исходного решения не переносятся. Примет ли платформа такое сообщение, стенды не доказывают — только живой заход.
- **The insertion replaces the step decision** with `{ kind: 'enter', messages }`; other fields of the original decision are not carried over. Whether the platform accepts such a message is not proven by the stands — only by a live run.
- **Зависимости:** платформа cordis (события `session/event`, `agent/pre-step`, `ctx.provide`), `@deepseek-ai/dsh-llm` (`createUserMessage`, формат журнала с `source.kind: 'plugin:<имя>'`), `@deepseek-ai/schemastery`; служба `pamyat` ядра памяти — необязательна. Подъём в разговор записанного — работа `dsh-pamyat-byudzhet`, здесь её нет.
- **Dependencies:** the cordis platform (the `session/event` and `agent/pre-step` events, `ctx.provide`), `@deepseek-ai/dsh-llm` (`createUserMessage`, the journal format with `source.kind: 'plugin:<name>'`), `@deepseek-ai/schemastery`; the memory core's `pamyat` service is optional. Bringing recorded memory back into the conversation is the job of `dsh-pamyat-byudzhet`, not of this package.

## Лицензия · License

MIT — поле `license` в `package.json`, текст — [LICENSE](LICENSE).

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
