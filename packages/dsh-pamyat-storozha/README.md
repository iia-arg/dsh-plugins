# dsh-pamyat-storozha

**Версия:** 3.1.8

## Назначение · Purpose

Плагин cordis для платформы DSH, который изнутри процесса агента наблюдает за сжатием контекста и печатает о нём в журнал службы: строку о каждом завершённом сжатии (естественном, принудительном, обрезке без модели, провале), тревогу о переходе заполнения через ступени порога сжатия и сводку с областью наблюдения, знаменателем и тем, чего сторож не видел. В работу агента пакет не вмешивается: не сжимает, ничего не запрещает, только наблюдает и говорит. Кроме плагина пакет везёт в `bin/` четырнадцать самостоятельных программ обслуживания памяти; плагин их не загружает и не зовёт, часть из них на машине вызывается таймерами systemd.

A cordis plugin for the DSH platform that watches context compaction from inside the agent process and reports it to the service log: a line for every finished compaction (natural, forced, prune without a model, failure), an alarm when the fill crosses stages of the compaction threshold, and a summary with the observed scope, the denominator and what the guard did not see. The package does not interfere with the agent: it does not compact and forbids nothing, it only observes and speaks. Besides the plugin, the package ships fourteen standalone memory maintenance programs in `bin/`; the plugin neither loads nor calls them, and some of them are run by systemd timers on the machine.

## Что ставится и куда · What gets installed and where

### Плагин (`src/`) · Plugin (`src/`)

- `src/index.js` — точка входа (`main`, `exports["."]`). Вывозит `name`, `inject` (пустой), `Config` (схема настроек), `apply`, `STOROZHA` (перечень сторожей), `KOLONKI_OPISANIYA`, `dolyaPoroga`.
- `src/vidy-szhatiya.js` — вид сжатия по данным `compaction/end` (`vidKonca`: `error` — провал, `sourceCommandId` — принудительное, иначе естественное), расход вызова (`rashod`), давление на контекст (`davlenie`: вход плюс кэш, без выхода), длительность (`dlitelnost`), незнакомые поля `usage` (`neznakomyePolya`).

- `src/index.js` — entry point (`main`, `exports["."]`). Exports `name`, `inject` (empty), `Config` (settings schema), `apply`, `STOROZHA` (list of guards), `KOLONKI_OPISANIYA`, `dolyaPoroga`.
- `src/vidy-szhatiya.js` — compaction kind from `compaction/end` data (`vidKonca`: `error` — failure, `sourceCommandId` — forced, otherwise natural), call spend (`rashod`), context pressure (`davlenie`: input plus cache, no output), duration (`dlitelnost`), unknown `usage` fields (`neznakomyePolya`).

Что `apply(ctx, config)` регистрирует (по коду `src/index.js`):

- два обработчика `ctx.on('session/event', …)`: первый разбирает `compaction/start`, `/summary`, `/end`, `/prune`; второй ведёт счёт ходов (`turn/start`), такт сводки (`turn/end`), охват по сессиям, сброс ступеней на `compaction/summary` и `compaction/prune` и замер заполнения по `event.data.usage` любого события;
- очистку через `ctx.effect` — снятие ключа и отмену таймеров ожидания замера «после» при выгрузке;
- инструментов, команд, служб и таймеров не регистрирует.

What `apply(ctx, config)` registers (per the code in `src/index.js`):

- two `ctx.on('session/event', …)` handlers: the first parses `compaction/start`, `/summary`, `/end`, `/prune`; the second keeps the turn count (`turn/start`), the summary cadence (`turn/end`), per-session coverage, the stage reset on `compaction/summary` and `compaction/prune`, and the fill measurement from `event.data.usage` of any event;
- cleanup via `ctx.effect` — removal of the single-mount key and cancellation of pending after-measurement timers on unload;
- no tools, commands, services or timers.

Что плагин читает и пишет во время работы:

- журнал: каждая строка через `ctx.logger.info` (запасной путь — `console.log`) с префиксом `[dsh-pamyat-storozha <версия из package.json>]`;
- внешний сток: команда `komandaStoka` асинхронно через `/bin/sh -c`, текст на stdin; ожидание оболочки до 5 с;
- файл отданных ступеней `$DSH_HOME/storages/storozha-stupeni.json` (или путь из `STOROZHA_STUPENI_FAJL`), запись через временный файл и `rename`;
- порог сжатия — функцией `chitatPorogD` из `dsh-pamyat-kompakt/porogi.mjs` (имя агента — `KOMPAKT_AGENT`, каталог — `KOMPAKT_NASTROJKI_KATALOG`, по умолчанию у `dsh-pamyat-kompakt` — `/etc/dsh-pamyat/agenty`);
- окно контекста — `session.requestContext().contextWindow`; маршрут — `session.requestHeader().config` или `requestContext()`.

What the plugin reads and writes at run time:

- log: event lines via `ctx.logger.info` (fallback — `console.log`); startup directly to process stdout prefixed with `[dsh-pamyat-storozha <version from package.json>]`;
- external sink: the `komandaStoka` command asynchronously via `/bin/sh -c`, text on stdin; shell timeout 5 s;
- the reported-stages file `$DSH_HOME/storages/storozha-stupeni.json` (or the path in `STOROZHA_STUPENI_FAJL`), written through a temporary file and `rename`;
- the compaction threshold — via `chitatPorogD` from `dsh-pamyat-kompakt/porogi.mjs` (agent name — `KOMPAKT_AGENT`, directory — `KOMPAKT_NASTROJKI_KATALOG`, `dsh-pamyat-kompakt` default — `/etc/dsh-pamyat/agenty`);
- the context window — `session.requestContext().contextWindow`; the route — `session.requestHeader().config` or `requestContext()`.

### Приборы и сторожа (`bin/`) · Tools and watchers (`bin/`)

- `chitatel-otklonennyh.mjs` — раскладывает отклонённые секретарём файлы по префиксу имени и кладёт рядом решение `<имя>.reshenie.txt`; файлы `znanie-*` помечает «ждёт решения человека».
- `kompakt-priemka` — приёмка сжатия DSH/Codex только чтением: журналы сессий, `pamyat.db`, журнал службы, для семейства `codex` — исходы и шлюз.
- `omega-kopiya-watch` — сторож копирования знаний `pamyat.db` в OMEGA: без копии, «копирование встало», срок жизни, бесхозные записи, ночной счёт доверия и недельная сводка, локальная правка поставки OMEGA, файлы модели эмбеддинга.
- `pamyat-vernut-povtor` — возвращает в базу статью, которую секретарь счёл повтором, записью ядра со связью «уточняет k»; файл переименовывает в `*.vozvrashcheno-<id>.txt`.
- `proba-sleda-podyoma.mjs` — монтирует шесть пакетов памяти на cordis ядра и проверяет, что каждый напечатал строку подъёма.
- `proverka-cepi-boem.mjs` — сверяет id и длину последней вставки сводки в журнале службы агента с записью в базе.
- `proverka-opory.mjs` — проверяет, существуют ли в журналах сессий (старый и `v4`) или у внешних свидетелей опоры записей памяти; с `--zapisat` кладёт отметки в базу.
- `rasshcheplenie-otmeny-watch` — следит за ростом числа записей OMEGA, где `status` активна, а `metadata` говорит «отменена».
- `rubezh-otnoshenij-watch` — один раз сообщает, что рубеж отношений в `pamyat.db` встал верно; иначе ждёт или тревожит.
- `session-agent-preset-watch` — читает первую строку журнала каждой сессии агентов из реестра и ищет заголовки без `agentPreset`.
- `session-writer-watch.py` — тревога, если у живого процесса службы агента отказ «already owned by an active write handle» повторяется дольше 5 минут.
- `sostav-nabora.mjs` — называет состав набора `dsh-pamyat` по условию «последняя принятая и опубликованная версия» (git клона и реестр npm).
- `stendy-vseh-paketov.sh` — гоняет `test/stend-*.mjs` всех пакетов `dsh-pamyat-*` и печатает знаменатель и разряды.
- `sverka-s-istochnikom.mjs` — сверяет записи `pamyat.db` со всеми поддержанными источниками через read-only `proverka-opory.mjs`, в базу не пишет.

- `chitatel-otklonennyh.mjs` — sorts files rejected by the secretary by name prefix and puts a decision `<name>.reshenie.txt` next to each; marks `znanie-*` files as "awaiting a human decision".
- `kompakt-priemka` — read-only acceptance of DSH/Codex compaction: session logs, `pamyat.db`, the service log, and for the `codex` family the outcomes and the gateway.
- `omega-kopiya-watch` — watcher of knowledge copying from `pamyat.db` to OMEGA: no copy, "copying stalled", lifetime, ownerless records, nightly trust count and weekly summary, local patch of the OMEGA distribution, embedding model files.
- `pamyat-vernut-povtor` — returns to the base an article the secretary judged a repeat, as a core record linked "refines k"; renames the file to `*.vozvrashcheno-<id>.txt`.
- `proba-sleda-podyoma.mjs` — mounts six memory packages on the core's cordis and checks that each printed a start-up line.
- `proverka-cepi-boem.mjs` — compares the id and length of the last summary injection in the agent service log with the record in the base.
- `proverka-opory.mjs` — checks whether memory records' anchors exist in session logs (old and `v4`) or with external witnesses; with `--zapisat` stores marks in the base.
- `rasshcheplenie-otmeny-watch` — watches growth of OMEGA records whose `status` is active while `metadata` says "superseded".
- `rubezh-otnoshenij-watch` — reports once that the relations boundary in `pamyat.db` was set correctly; otherwise waits or alarms.
- `session-agent-preset-watch` — reads the first log line of every session of the registry's agents and looks for headers without `agentPreset`.
- `session-writer-watch.py` — alarms when, for a live agent service process, the "already owned by an active write handle" refusal repeats for longer than 5 minutes.
- `sostav-nabora.mjs` — names the composition of the `dsh-pamyat` set by the condition "last accepted and published version" (clone git and the npm registry).
- `stendy-vseh-paketov.sh` — runs `test/stend-*.mjs` of all `dsh-pamyat-*` packages and prints the denominator and classes.
- `sverka-s-istochnikom.mjs` — checks `pamyat.db` records through the read-only `proverka-opory.mjs` source checker, never writes to the base.

Прочее: `test/` — стенды (см. «Проверка»), `docs/` — `ARCHITECTURE.md`, `BIN.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`; `CHANGELOG.md`, `LICENSE`.

Other: `test/` — stands (see "Verification"), `docs/` — `ARCHITECTURE.md`, `BIN.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`; `CHANGELOG.md`, `LICENSE`.

### На машине · On the machine

- Боевой путь: `/opt/agent-plugins/node_modules/dsh-pamyat-storozha`, ставится из тарбола `/opt/agent-plugins-tarbally/dsh-pamyat-storozha-<версия>.tgz` по `/opt/agent-plugins/package.json` и `package-lock.json`.
- Профиль агента ссылается на него записью `"dsh-pamyat-storozha": "file:/opt/agent-plugins/node_modules/dsh-pamyat-storozha"` в `package.json` профиля; в `node_modules` профиля лежит симлинк на боевой путь.
- Юниты systemd, использующие `bin/`. Они зовут не `node_modules`, а копии файлов в `/usr/local/sbin`:

| Юнит | Такт (таймер) | ExecStart | Пользователь | Успешные коды |
|---|---|---|---|---|
| `omega-kopiya-watch.service` | `OnCalendar=*:07/10` | `/usr/local/bin/python-padenie-70 /usr/local/sbin/omega-kopiya-watch` (drop-in `60-python-padenie-70.conf`) | root | 0, 1, 2 |
| `rasshcheplenie-otmeny-watch.service` | `OnCalendar=*-*-* *:17:00` | `/usr/local/sbin/rasshcheplenie-otmeny-watch` | root (по умолчанию) | 0, 2, 3 |
| `rubezh-otnoshenij-watch.service` | `OnCalendar=hourly` | `/usr/local/sbin/rubezh-otnoshenij-watch` | учётка агента-координатора машины (`User=` в юните) | 0 |
| `session-writer-watch.service` | `OnBootSec=60`, `OnUnitInactiveSec=60` | `/usr/local/bin/python-padenie-70 /usr/local/sbin/session-writer-watch.py` (drop-in) | root | 0, 1 |
| `session-agent-preset-watch.service` | `OnCalendar=*-*-* *:00/5:00 UTC` | `/usr/bin/python3 -I -B /usr/local/sbin/session-agent-preset-watch --watch` | root | 0 |

Юниты первых четырёх лежат в `/etc/systemd/system`, `session-agent-preset-watch` — в `/usr/local/lib/systemd/system`. `kompakt-priemka` и `pamyat-vernut-povtor` лежат копиями в `/usr/local/bin`, юнитов у них нет. Остальные программы `bin/` юнитами не вызываются.

- Production path: `/opt/agent-plugins/node_modules/dsh-pamyat-storozha`, installed from the tarball `/opt/agent-plugins-tarbally/dsh-pamyat-storozha-<version>.tgz` per `/opt/agent-plugins/package.json` and `package-lock.json`.
- An agent profile references it with `"dsh-pamyat-storozha": "file:/opt/agent-plugins/node_modules/dsh-pamyat-storozha"` in the profile's `package.json`; the profile's `node_modules` holds a symlink to the production path.
- systemd units that use `bin/`. They call copies of the files in `/usr/local/sbin`, not `node_modules`:

| Unit | Cadence (timer) | ExecStart | User | Success codes |
|---|---|---|---|---|
| `omega-kopiya-watch.service` | `OnCalendar=*:07/10` | `/usr/local/bin/python-padenie-70 /usr/local/sbin/omega-kopiya-watch` (drop-in `60-python-padenie-70.conf`) | root | 0, 1, 2 |
| `rasshcheplenie-otmeny-watch.service` | `OnCalendar=*-*-* *:17:00` | `/usr/local/sbin/rasshcheplenie-otmeny-watch` | root (default) | 0, 2, 3 |
| `rubezh-otnoshenij-watch.service` | `OnCalendar=hourly` | `/usr/local/sbin/rubezh-otnoshenij-watch` | the account of the machine's coordinator agent (`User=` in the unit) | 0 |
| `session-writer-watch.service` | `OnBootSec=60`, `OnUnitInactiveSec=60` | `/usr/local/bin/python-padenie-70 /usr/local/sbin/session-writer-watch.py` (drop-in) | root | 0, 1 |
| `session-agent-preset-watch.service` | `OnCalendar=*-*-* *:00/5:00 UTC` | `/usr/bin/python3 -I -B /usr/local/sbin/session-agent-preset-watch --watch` | root | 0 |

The first four units live in `/etc/systemd/system`, `session-agent-preset-watch` in `/usr/local/lib/systemd/system`. `kompakt-priemka` and `pamyat-vernut-povtor` are copied to `/usr/local/bin` and have no units. The other `bin/` programs are not called by units.

## Установка · Installation

Плагин ставится npm в `/opt/agent-plugins` по lock-файлу; в `/opt/agent-plugins/package.json` пакет записан как `"dsh-pamyat-storozha": "file:../agent-plugins-tarbally/dsh-pamyat-storozha-<версия>.tgz"`. Что нужно рядом:

- `@deepseek-ai/cordis` и `@deepseek-ai/schemastery` — `peerDependencies`, лежат в `/opt/agent-plugins/node_modules/@deepseek-ai/`;
- `dsh-pamyat-kompakt` версии `^3.1.1` — обязательный peer: функция `porogi.mjs` импортируется при загрузке. `file:../dsh-pamyat-kompakt` в devDependencies служит локальным стендам. В рабочую установку передайте архив соседа вместе с архивом сторожа, а также совместимые peers cordis/schemastery. Пример локальной установки: `npm install --offline ./dsh-pamyat-kompakt-3.1.2.tgz ./dsh-pamyat-storozha-3.1.6.tgz`; остальные peers должны быть уже доступны локально. `--legacy-peer-deps`/`--force` обходят проверку зависимости и не доказывают успешный импорт.

Node: плагину нужен Node 18+, приборам и полному стенду с `node:sqlite` — Node 22.13+ (на Node 22 ожидается ExperimentalWarning; это не отказ импорта). Для всего пакета используйте 22.13+.

Node: the plugin needs Node 18+; the tools and full suite using `node:sqlite` need Node 22.13+ (Node 22 may emit ExperimentalWarning; that is not an import failure). Use 22.13+ for the complete package.

The plugin is installed by npm in `/opt/agent-plugins` from the lock file; `/opt/agent-plugins/package.json` lists it as `"dsh-pamyat-storozha": "file:../agent-plugins-tarbally/dsh-pamyat-storozha-<version>.tgz"`. What must be next to it:

- `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` — `peerDependencies`, located in `/opt/agent-plugins/node_modules/@deepseek-ai/`;
- `dsh-pamyat-kompakt` `^3.1.1` is a mandatory peer: `porogi.mjs` is imported at load. The development `file:` link is for local stands. Supply its local archive with the guard archive and compatible local cordis/schemastery peers. `npm install --offline ./dsh-pamyat-kompakt-3.1.2.tgz ./dsh-pamyat-storozha-3.1.6.tgz` requires the other peers to be locally available. `--legacy-peer-deps`/`--force` bypass dependency checking and do not prove the plugin imports.

Подключение в профиле: строка в `package.json` профиля (`"dsh-pamyat-storozha": "file:/opt/agent-plugins/node_modules/dsh-pamyat-storozha"`) и раздел `insert` в `<дом агента>/.dsh/profiles/web/cordis.patch.yml`:

Connecting it in a profile: a line in the profile's `package.json` (`"dsh-pamyat-storozha": "file:/opt/agent-plugins/node_modules/dsh-pamyat-storozha"`) and an `insert` section in `<agent home>/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - name: dsh-pamyat-storozha
      id: dsh-pamyat-storozha
      config:
        ispolnenieInstrumentov: sdk
        agent: <агент>
        predel: 1000000
        stupeni: [0.85, 0.9]
        komandaStoka: 'agent-alert'
```

В окружении службы агента должны быть `DSH_HOME` (каталог данных агента) и `KOMPAKT_AGENT=<агент>`; на машине первое задаётся в самом юните агента, второе — drop-in `60-kompakt-agent.conf`, а у двух Codex-агентов — строкой `Environment=KOMPAKT_AGENT=<агент>` в самом юните. Плагин встаёт при подъёме процесса агента; признак подключения — строка `подъём: ступени … ОТ ПОРОГА СЖАТИЯ …` в журнале службы с именем агента и состоянием стока.

The agent service environment must have `DSH_HOME` (agent data directory) and `KOMPAKT_AGENT=<agent>`; on the machine the first is set in the agent unit itself, the second in the drop-in `60-kompakt-agent.conf`, and for two Codex agents by an `Environment=KOMPAKT_AGENT=<agent>` line in the unit itself. The plugin starts when the agent process starts; the sign of connection is the line `подъём: ступени … ОТ ПОРОГА СЖАТИЯ …` ("start-up: stages … FROM THE COMPACTION THRESHOLD …") in the service log, naming the agent and the sink state.

Сторожа `bin/`: исполняемые файлы скопированы в `/usr/local/sbin` (`omega-kopiya-watch`, `rasshcheplenie-otmeny-watch`, `rubezh-otnoshenij-watch`, `session-writer-watch.py`, `session-agent-preset-watch`) и `/usr/local/bin` (`kompakt-priemka`, `pamyat-vernut-povtor`). Это обычные файлы, а не ссылки: обновление пакета в `node_modules` их не меняет, копию надо обновлять отдельно. Каждый сторож вызывается парой `<имя>.service` (`Type=oneshot`) и `<имя>.timer`; частные значения берутся из `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`. Остальные программы `bin/` запускаются по пути вручную или из ворот.

Пределы `session-writer-watch.service` (A-N-1963 №11): drop-in `systemd/session-writer-watch.service.d/70-predely.conf` → `/etc/systemd/system/session-writer-watch.service.d/70-predely.conf`, 0644 root:root (`MemoryMax`, `MemorySwapMax=0`; `TimeoutStartSec=60` уже в юните). Юнит и таймер — тоже в пакете (B-N-1968): `systemd/session-writer-watch.service` → `/etc/systemd/system/session-writer-watch.service` и `systemd/session-writer-watch.timer` → `/etc/systemd/system/session-writer-watch.timer`, 0644 root:root, побайтно равны бою на 10.10.2026. Drop-in `60-python-padenie-70.conf` этого юнита в пакет не входит (лежит только на машине).

`bin/` watchers: the executables are copied to `/usr/local/sbin` (`omega-kopiya-watch`, `rasshcheplenie-otmeny-watch`, `rubezh-otnoshenij-watch`, `session-writer-watch.py`, `session-agent-preset-watch`) and `/usr/local/bin` (`kompakt-priemka`, `pamyat-vernut-povtor`). These are regular files, not links: updating the package in `node_modules` does not change them, the copy must be updated separately. Each watcher is run by a `<name>.service` (`Type=oneshot`) and `<name>.timer` pair; private values come from `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`. The other `bin/` programs are run by path, manually or from gates.

Limits of `session-writer-watch.service` (A-N-1963 №11): drop-in `systemd/session-writer-watch.service.d/70-predely.conf` → `/etc/systemd/system/session-writer-watch.service.d/70-predely.conf`, 0644 root:root (`MemoryMax`, `MemorySwapMax=0`; `TimeoutStartSec=60` is already in the unit). The unit and its timer are in the package too (B-N-1968): `systemd/session-writer-watch.service` → `/etc/systemd/system/session-writer-watch.service` and `systemd/session-writer-watch.timer` → `/etc/systemd/system/session-writer-watch.timer`, 0644 root:root, byte-identical to production on 2026-10-10. The unit's `60-python-padenie-70.conf` drop-in is not in the package (it exists only on the machine).

## Настройка · Configuration

### Ключи `config` плагина (схема `Config` в `src/index.js`) · Plugin `config` keys (`Config` schema in `src/index.js`)

| Ключ | Тип | Умолчание | Что значит |
|---|---|---|---|
| `ispolnenieInstrumentov` | `'sdk'` \| `'dsh'` \| `'unknown'` | `'unknown'` | кто исполняет инструменты; от этого зависит строка про обрезку в сводке: `sdk` — «неприменимо», `dsh` — счёт обрезок, `unknown` — «не установлено» |
| `komandaStoka` | string | нет | команда внешнего стока (`/bin/sh -c`, текст на stdin, 5 с). `''` — только журнал; ключа нет — строка подъёма называет это упущением. Исполняется с правами процесса агента |
| `stupeni` | number[] | `[0.85, 0.9]` | ступени тревоги — доли порога сжатия |
| `trevogaSzhatiya` | boolean | `true` | отдавать ли в сток короткую строку о завершённом сжатии; провал уходит в сток всегда |
| `predel` | number | `0` | запасное окно в токенах, если платформа окна не объявила; `0` — запасного нет |
| `agent` | string | `''` | имя агента в строках и ключ стража одиночного монтажа. Пусто — в журнале «агент НЕ НАЗВАН (настройка agent пуста)». В короткой строке владельцу (сток) имя берётся из вшитой таблицы `IMENA` в `src/index.js` (имя учётки → имя по-русски), для учётки вне таблицы — само значение `agent`; при пустом `agent` имя в этой строке пустое, «НЕ НАЗВАН» там не пишется |

| Key | Type | Default | Meaning |
|---|---|---|---|
| `ispolnenieInstrumentov` | `'sdk'` \| `'dsh'` \| `'unknown'` | `'unknown'` | who executes tools; determines the prune line in the summary: `sdk` — "not applicable", `dsh` — prune count, `unknown` — "not established" |
| `komandaStoka` | string | none | external sink command (`/bin/sh -c`, text on stdin, 5 s). `''` — log only; key absent — the start-up line calls it an omission. Runs with the agent process privileges |
| `stupeni` | number[] | `[0.85, 0.9]` | alarm stages — shares of the compaction threshold |
| `trevogaSzhatiya` | boolean | `true` | whether to send the short line about a finished compaction to the sink; a failure always goes to the sink |
| `predel` | number | `0` | fallback window in tokens if the platform announced none; `0` — no fallback |
| `agent` | string | `''` | agent name in lines and the single-mount guard key. Empty — the log says "агент НЕ НАЗВАН (настройка agent пуста)" (agent NOT NAMED (the agent setting is empty)). In the short line to the owner (sink) the name is taken from the built-in `IMENA` table in `src/index.js` (account name → name in Russian); for an account outside the table it is the `agent` value itself; with an empty `agent` the name in that line is empty, and "НЕ НАЗВАН" is not written there |

### Окружение и файлы плагина · Plugin environment and files

| Переменная | Где читается | Что делает |
|---|---|---|
| `DSH_HOME` | `src/index.js:311` | каталог для `storages/storozha-stupeni.json`; нет его и `STOROZHA_STUPENI_FAJL` — ступени только в памяти процесса |
| `STOROZHA_STUPENI_FAJL` | `src/index.js:311` | путь файла ступеней вместо `$DSH_HOME/…` (для стендов); пустая строка не отменяет `DSH_HOME` |
| `STOROZHA_ZHDAT_POSLE_MS` | `src/index.js:1021` | сколько ждать замера «после» для строки о сжатии; по умолчанию 600 000 мс |
| `KOMPAKT_AGENT` | `src/index.js:268` | имя агента для файла порогов `dsh-pamyat-kompakt` |
| `KOMPAKT_NASTROJKI_KATALOG` | `dsh-pamyat-kompakt/porogi.mjs` | каталог файлов порогов (читает сосед, не этот пакет) |

| Variable | Read at | Effect |
|---|---|---|
| `DSH_HOME` | `src/index.js:311` | directory for `storages/storozha-stupeni.json`; without it and without `STOROZHA_STUPENI_FAJL` stages live only in process memory |
| `STOROZHA_STUPENI_FAJL` | `src/index.js:311` | stage file path instead of `$DSH_HOME/…` (for stands); an empty string does not override `DSH_HOME` |
| `STOROZHA_ZHDAT_POSLE_MS` | `src/index.js:1021` | how long to wait for the "after" measurement for the compaction line; default 600 000 ms |
| `KOMPAKT_AGENT` | `src/index.js:268` | agent name for the `dsh-pamyat-kompakt` threshold file |
| `KOMPAKT_NASTROJKI_KATALOG` | `dsh-pamyat-kompakt/porogi.mjs` | threshold files directory (read by the sibling, not this package) |

Формат файла ступеней: `{ v: 1, sessii: { <id сессии>: { otdany: [доли], rubezh, kogda } } }`.

Stage file format: `{ v: 1, sessii: { <session id>: { otdany: [ratios], rubezh, kogda } } }`.

### Файл настройки программ `bin/` · Settings file of the `bin/` programs

Путь — `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`, меняется переменной `DSH_PAMYAT_STOROZHA_CONF`. Строки `КЛЮЧ=значение`; `#` в начале строки — комментарий; при повторе ключа действует последнее вхождение; значение с « #» (пробел или таб перед `#`) — отказ с названием ключа: Node и bash — код 2, Python — код 3. Не задан нужный ключ — `СЛЕПОТА` с именем ключа, код 2 (исключения — в таблице ниже).

Path — `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf`, changed by the `DSH_PAMYAT_STOROZHA_CONF` variable. `KEY=value` lines; `#` at the start of a line is a comment; if a key repeats the last occurrence wins; a value containing " #" (space or tab before `#`) is a refusal naming the key: Node and bash — code 2, Python — code 3. A required key unset — `СЛЕПОТА` (blindness) with the key name, code 2 (exceptions are in the table below).

| Ключ | Кто читает |
|---|---|
| `PAMYAT_CORE` | `pamyat-vernut-povtor`, `proba-sleda-podyoma.mjs`, `proverka-opory.mjs` (для `--zapisat`), `omega-kopiya-watch` (счёт доверия), `test/stend-proverki-opory.mjs` |
| `PAMYAT_BAZA` | `proverka-cepi-boem.mjs`, `proverka-opory.mjs`, `sverka-s-istochnikom.mjs`, `rubezh-otnoshenij-watch` |
| `DSH_SESSII` | `proverka-opory.mjs`, `sverka-s-istochnikom.mjs` |
| `CEP_UNIT` | `proverka-cepi-boem.mjs` |
| `SLED_PROFIL` | `proba-sleda-podyoma.mjs` |
| `OTKLONENNYE_KATALOG`, `CHITATEL_RUKA` | `chitatel-otklonennyh.mjs` |
| `DSH_PLUGINS_KLON` | `sostav-nabora.mjs`, `stendy-vseh-paketov.sh` |
| `STENDY_SPISOK_SLEPOTY` | `stendy-vseh-paketov.sh` (умолчание — `prinyataya-slepota.txt` рядом со скриптом) |
| `AGENT_REGISTRY` | `session-agent-preset-watch`, `session-writer-watch.py` |
| `SWW_PAUZA_DIR`, `SWW_VERSIYA`, `SWW_CHITATEL` | `session-writer-watch.py` |
| `KP_ISHODY`, `KP_SHLYUZ` | `kompakt-priemka` (только семейство `codex`; `KP_SHLYUZ` — шаблон с `{agent}`) |
| `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_ISKLYUCHENIYA`, `OKW_IMYA` | `omega-kopiya-watch` |

| Key | Read by |
|---|---|
| `PAMYAT_CORE` | `pamyat-vernut-povtor`, `proba-sleda-podyoma.mjs`, `proverka-opory.mjs` (for `--zapisat`), `omega-kopiya-watch` (trust count), `test/stend-proverki-opory.mjs` |
| `PAMYAT_BAZA` | `proverka-cepi-boem.mjs`, `proverka-opory.mjs`, `sverka-s-istochnikom.mjs`, `rubezh-otnoshenij-watch` |
| `DSH_SESSII` | `proverka-opory.mjs`, `sverka-s-istochnikom.mjs` |
| `CEP_UNIT` | `proverka-cepi-boem.mjs` |
| `SLED_PROFIL` | `proba-sleda-podyoma.mjs` |
| `OTKLONENNYE_KATALOG`, `CHITATEL_RUKA` | `chitatel-otklonennyh.mjs` |
| `DSH_PLUGINS_KLON` | `sostav-nabora.mjs`, `stendy-vseh-paketov.sh` |
| `STENDY_SPISOK_SLEPOTY` | `stendy-vseh-paketov.sh` (default — `prinyataya-slepota.txt` next to the script) |
| `AGENT_REGISTRY` | `session-agent-preset-watch`, `session-writer-watch.py` |
| `SWW_PAUZA_DIR`, `SWW_VERSIYA`, `SWW_CHITATEL` | `session-writer-watch.py` |
| `KP_ISHODY`, `KP_SHLYUZ` | `kompakt-priemka` (`codex` family only; `KP_SHLYUZ` is a template with `{agent}`) |
| `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_ISKLYUCHENIYA`, `OKW_IMYA` | `omega-kopiya-watch` |

### Аргументы, переменные и коды программ `bin/` · Arguments, variables and exit codes of the `bin/` programs

| Программа | Аргументы | Переменные окружения (умолчание) | Что пишет | Коды |
|---|---|---|---|---|
| `chitatel-otklonennyh.mjs` | `[каталог] [--suho]` | — | `<файл>.reshenie.txt` рядом (кроме `--suho`) | 0, 2 |
| `kompakt-priemka` | `<агент> [--since ISO8601] [--json]` | — | ничего; зовёт `/usr/local/bin/agent-registry`, `journalctl`, `zstd` | 0, 1, 2 |
| `omega-kopiya-watch` | — | `OKW_N_MIN` (10), `OKW_OKNO_MIN` (60), `OKW_OMEGA_DB` (`/var/lib/omega/.omega/omega.db`), `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_CORE`, `OKW_ALERT` (`/usr/local/bin/agent-alert`), `OKW_NODE` (`/usr/local/bin/node`), `OKW_OMEGA_SP` (`/opt/omega/venv/lib/python3.12/site-packages`), `OKW_OMEGA_UNIT` (`omega-memory`), `OKW_OMEGA_MODEL_DIR` (`/var/lib/omega/.cache/omega/models/bge-m3-onnx`), `OKW_SYSTEMCTL`, `OKW_JOURNALCTL` | файл `OKW_STATE`; тревоги в канал | 0, 1, 2; 3 — не задан `OKW_STATE` |
| `pamyat-vernut-povtor` | `<povtoryaet-*.txt> <pamyat.db>` | `PAMYAT_VERNUT_CORE` (только стенд) | запись в базу, переименование файла | 0, 2 |
| `proba-sleda-podyoma.mjs` (без шебанга, `node …`) | `[корень пакетов]` | `PROBA_PROFIL` | временный каталог | 0, 1, 2 |
| `proverka-cepi-boem.mjs` | `[--kontrol]` | `CEP_BAZA`, `CEP_OKNO` (`-7 days`), `CEP_ZHURNAL`, `CEP_START` | ничего; `--kontrol` — временный каталог в `$HOME/workspace/vremennoe/` | 0, 1, 2 |
| `proverka-opory.mjs` | `[<база>.db] [--kontrol] [--zapisat]` | — | только с `--zapisat`: отметки проверки в базу | 0, 1, 2 |
| `rasshcheplenie-otmeny-watch` | — | `RASSHCH_BAZA` (`/var/lib/omega/.omega/omega.db`), `RASSHCH_SOST` (`/var/lib/rasshcheplenie-otmeny-watch/proshloe.json`), `RASSHCH_ITOG` (`…/last.json`), `RASSHCH_ALERT` (`/usr/local/bin/agent-alert`) | `SOST`, `ITOG`; тревоги | 0, 2, 3 (рост) |
| `rubezh-otnoshenij-watch` | — | `RUBEZH_BAZA`, `RUBEZH_SOST` (`/var/lib/rubezh-otnoshenij-watch/skazano`), `RUBEZH_ALERT` (`agent-alert` из `PATH`), `RUBEZH_MONTAZH_MAXID` (2912), `RUBEZH_MONTAZH_TS` (1790004368), `RUBEZH_PREDEL_SUTOK` (7) | `SOST`; тревоги | 0, 1, 2 |
| `session-agent-preset-watch` | `[--json \| --watch]` | `PRESET_WATCH_REGISTRY`, `PRESET_WATCH_STATE`, `PRESET_WATCH_ALERT` — только вместе с `PRESET_WATCH_PROBA=1` | `--watch`: `/var/lib/session-agent-preset-watch/last.json`, тревога `agent-alert --plain` | 0, 1, 2, 3 |
| `session-writer-watch.py` | `[--check] [--version]` | `SESSION_WRITER_PAUZA_DIR` (стенд) | без `--check`: `/var/lib/session-writer-watch/state.json`, тревога `/usr/local/bin/agent-alert` | 0, 1, 2 |
| `sostav-nabora.mjs` | — | `KLON_TEGOV` | `git fetch origin` в клоне; запрос к `registry.npmjs.org` | 0, 1, 2 |
| `stendy-vseh-paketov.sh` | — | `STENDY_PKG_DIR`, `STENDY_OBRAZEC` (`dsh-pamyat-*`), `STENDY_PREDEL` (120 с), `STENDY_SPISOK_SLEPOTY` | ничего, но запускает чужие стенды | 0, 1, 2 |
| `sverka-s-istochnikom.mjs` | `[pamyat.db]` | — | ничего | 0, 1, 2 |

| Program | Arguments | Environment variables (default) | Writes | Codes |
|---|---|---|---|---|
| `chitatel-otklonennyh.mjs` | `[directory] [--suho]` | — | `<file>.reshenie.txt` alongside (except `--suho`) | 0, 2 |
| `kompakt-priemka` | `<agent> [--since ISO8601] [--json]` | — | nothing; calls `/usr/local/bin/agent-registry`, `journalctl`, `zstd` | 0, 1, 2 |
| `omega-kopiya-watch` | — | `OKW_N_MIN` (10), `OKW_OKNO_MIN` (60), `OKW_OMEGA_DB` (`/var/lib/omega/.omega/omega.db`), `OKW_PAMYAT`, `OKW_STATE`, `OKW_PRAVKI`, `OKW_CORE`, `OKW_ALERT` (`/usr/local/bin/agent-alert`), `OKW_NODE` (`/usr/local/bin/node`), `OKW_OMEGA_SP` (`/opt/omega/venv/lib/python3.12/site-packages`), `OKW_OMEGA_UNIT` (`omega-memory`), `OKW_OMEGA_MODEL_DIR` (`/var/lib/omega/.cache/omega/models/bge-m3-onnx`), `OKW_SYSTEMCTL`, `OKW_JOURNALCTL` | the `OKW_STATE` file; alarms to the channel | 0, 1, 2; 3 — `OKW_STATE` unset |
| `pamyat-vernut-povtor` | `<povtoryaet-*.txt> <pamyat.db>` | `PAMYAT_VERNUT_CORE` (stand only) | a record in the base, file rename | 0, 2 |
| `proba-sleda-podyoma.mjs` (no shebang, `node …`) | `[packages root]` | `PROBA_PROFIL` | a temporary directory | 0, 1, 2 |
| `proverka-cepi-boem.mjs` | `[--kontrol]` | `CEP_BAZA`, `CEP_OKNO` (`-7 days`), `CEP_ZHURNAL`, `CEP_START` | nothing; `--kontrol` — a temporary directory in `$HOME/workspace/vremennoe/` | 0, 1, 2 |
| `proverka-opory.mjs` | `[<base>.db] [--kontrol] [--zapisat]` | — | only with `--zapisat`: check marks in the base | 0, 1, 2 |
| `rasshcheplenie-otmeny-watch` | — | `RASSHCH_BAZA` (`/var/lib/omega/.omega/omega.db`), `RASSHCH_SOST` (`/var/lib/rasshcheplenie-otmeny-watch/proshloe.json`), `RASSHCH_ITOG` (`…/last.json`), `RASSHCH_ALERT` (`/usr/local/bin/agent-alert`) | `SOST`, `ITOG`; alarms | 0, 2, 3 (growth) |
| `rubezh-otnoshenij-watch` | — | `RUBEZH_BAZA`, `RUBEZH_SOST` (`/var/lib/rubezh-otnoshenij-watch/skazano`), `RUBEZH_ALERT` (`agent-alert` from `PATH`), `RUBEZH_MONTAZH_MAXID` (2912), `RUBEZH_MONTAZH_TS` (1790004368), `RUBEZH_PREDEL_SUTOK` (7) | `SOST`; alarms | 0, 1, 2 |
| `session-agent-preset-watch` | `[--json \| --watch]` | `PRESET_WATCH_REGISTRY`, `PRESET_WATCH_STATE`, `PRESET_WATCH_ALERT` — only together with `PRESET_WATCH_PROBA=1` | `--watch`: `/var/lib/session-agent-preset-watch/last.json`, alarm via `agent-alert --plain` | 0, 1, 2, 3 |
| `session-writer-watch.py` | `[--check] [--version]` | `SESSION_WRITER_PAUZA_DIR` (stand) | without `--check`: `/var/lib/session-writer-watch/state.json`, alarm via `/usr/local/bin/agent-alert` | 0, 1, 2 |
| `sostav-nabora.mjs` | — | `KLON_TEGOV` | `git fetch origin` in the clone; request to `registry.npmjs.org` | 0, 1, 2 |
| `stendy-vseh-paketov.sh` | — | `STENDY_PKG_DIR`, `STENDY_OBRAZEC` (`dsh-pamyat-*`), `STENDY_PREDEL` (120 s), `STENDY_SPISOK_SLEPOTY` | nothing, but runs other packages' stands | 0, 1, 2 |
| `sverka-s-istochnikom.mjs` | `[pamyat.db]` | — | nothing | 0, 1, 2 |

Внешние зависимости программ: Node с `node:sqlite` (`proverka-*`, `sverka-s-istochnikom.mjs`), `zstd`, `sqlite3` (`rubezh-otnoshenij-watch`), Python 3 с PyYAML (`session-*`), Python службы OMEGA `/opt/omega/venv/bin/python3` (шебанг `rasshcheplenie-otmeny-watch`), `git` и сеть (`sostav-nabora.mjs`).

External dependencies of the programs: Node with `node:sqlite` (`proverka-*`, `sverka-s-istochnikom.mjs`), `zstd`, `sqlite3` (`rubezh-otnoshenij-watch`), Python 3 with PyYAML (`session-*`), the OMEGA service Python `/opt/omega/venv/bin/python3` (shebang of `rasshcheplenie-otmeny-watch`), `git` and network (`sostav-nabora.mjs`).

## Проверка · Verification

Состав входов: 15 `test/stend-*.mjs` в `npm test` и 5 отдельных `.sh`; `audit-bin.py` — тело mjs-обёртки. Без локальных peers, zstd или ядра памяти для STEND_CORE/PAMYAT_CORE полный прогон может дать 2 — слепота, а не принятие пакета. Код npm: 1 имеет приоритет; если его не было, остаётся последний ненулевой код по порядку.

There are 15 npm mjs entries and 5 separate shell entries; audit-bin.py is an mjs-wrapper body. Missing local peers, zstd or the core for STEND_CORE/PAMYAT_CORE can yield blindness 2. Code 1 is sticky; otherwise npm retains the last nonzero code in traversal order.


`npm test` (по `scripts.test` в `package.json`) по очереди запускает только `test/stend-*.mjs` и сводит коды: хоть один код 1 — итог 1; иначе последний ненулевой код (2 — слепота); все 0 — итог 0. Стенды `*.sh` в `npm test` не входят и запускаются отдельно.

`npm test` (per `scripts.test` in `package.json`) runs only `test/stend-*.mjs` one by one and combines the codes: any code 1 — result 1; otherwise the last non-zero code (2 — blindness); all 0 — result 0. The `*.sh` stands are not part of `npm test` and are run separately.

Запускать `npm test` без `DSH_HOME` и `STOROZHA_STUPENI_FAJL` в окружении: `env -u DSH_HOME -u STOROZHA_STUPENI_FAJL npm test`. Стенды `stend-istochnika-rashoda.mjs`, `stend-vygruzki.mjs` и `stend-primenimosti-prune.mjs` монтируют настоящий `apply()` и шлют события сжатия, не снимая `DSH_HOME`; при заданном `DSH_HOME` они запишут ключ сессии в его `storages/storozha-stupeni.json`, то есть в файл ступеней агента.

Run `npm test` without `DSH_HOME` and `STOROZHA_STUPENI_FAJL` in the environment: `env -u DSH_HOME -u STOROZHA_STUPENI_FAJL npm test`. The stands `stend-istochnika-rashoda.mjs`, `stend-vygruzki.mjs` and `stend-primenimosti-prune.mjs` mount the real `apply()` and send compaction events without unsetting `DSH_HOME`; with `DSH_HOME` set they write a session key into its `storages/storozha-stupeni.json`, i.e. into the agent's stage file.

| Стенд | Что проверяет | Коды |
|---|---|---|
| `stend-audit-plugin.mjs` | логгер, D без окна, асинхронный сток, выгрузка, предел сессий, единицы | 0, 1, 2 |
| `stend-audit-install.mjs` | настоящая npm-установка локальных архивов без сети и импорт обязательного соседа | 0, 1, 2 |
| `stend-audit-bin.mjs` | CLI-пробы на временных SQLite/zstd/git fixtures; Python-тело audit-bin.py | 0, 1, 2 |
| `stend-vidov.mjs` | виды сжатия, расход, давление | 0, 1 |
| `stend-opoveshcheniya.mjs` | строки сжатия, обрезки, провала, ступеней; окно от платформы (снимает `DSH_HOME`, свой каталог порогов) | 0, 1 |
| `stend-poroga-i-hraneniya.mjs` | ступени от порога, хранение ступеней на диске (свой `DSH_HOME`) | 0, 1 |
| `stend-tekstov-vladelcu.mjs` | короткие строки в сток (свой `DSH_HOME`) | 0, 1 |
| `stend-istochnika-rashoda.mjs` | строка о сжатии называет источник расхода | 0, 1 |
| `stend-odinochnogo-montazha.mjs` | страж одиночного монтажа | 0, 1, 2 (канарейка) |
| `stend-vygruzki.mjs` | снятие ключа монтажа при выгрузке на настоящем cordis | 0, 1, 2 (канарейка) |
| `stend-primenimosti-prune.mjs` | строка обрезки для `sdk`/`dsh`/`unknown`, отказ схемы на чужом значении | 0, 1 |
| `stend-svodki-po-taktu.mjs` | правило такта сводки (копия правила, не код модуля) | 0, 1, 2 (канарейка) |
| `stend-opisaniya.mjs` | README против перечня `STOROZHA` | 0, 1, 2 |
| `stend-proverki-opory.mjs` | `proverka-opory.mjs` на подставной базе: не пишет без `--zapisat`, слепоту в базу не кладёт | 0, 1, 2 |
| `stend-opory-1563.mjs` | `proverka-opory.mjs` на герметичной подставе журналов (старый и `v4`) | 0, 1, 2 |

| Stand | What it checks | Codes |
|---|---|---|
| `stend-audit-plugin.mjs` | logger, D without window, async sink, unload, session cap, units | 0, 1, 2 |
| `stend-audit-install.mjs` | actual offline local-archive npm install and mandatory sibling import | 0, 1, 2 |
| `stend-audit-bin.mjs` | CLI fixtures with temporary SQLite/zstd/git; audit-bin.py body | 0, 1, 2 |
| `stend-vidov.mjs` | compaction kinds, spend, pressure | 0, 1 |
| `stend-opoveshcheniya.mjs` | compaction, prune, failure and stage lines; window from the platform (unsets `DSH_HOME`, own threshold directory) | 0, 1 |
| `stend-poroga-i-hraneniya.mjs` | stages from the threshold, stage storage on disk (own `DSH_HOME`) | 0, 1 |
| `stend-tekstov-vladelcu.mjs` | short sink lines (own `DSH_HOME`) | 0, 1 |
| `stend-istochnika-rashoda.mjs` | the compaction line names the spend source | 0, 1 |
| `stend-odinochnogo-montazha.mjs` | single-mount guard | 0, 1, 2 (canary) |
| `stend-vygruzki.mjs` | mount key removal on unload with real cordis | 0, 1, 2 (canary) |
| `stend-primenimosti-prune.mjs` | prune line for `sdk`/`dsh`/`unknown`, schema refusal of a foreign value | 0, 1 |
| `stend-svodki-po-taktu.mjs` | summary cadence rule (a copy of the rule, not the module code) | 0, 1, 2 (canary) |
| `stend-opisaniya.mjs` | README against the `STOROZHA` list | 0, 1, 2 |
| `stend-proverki-opory.mjs` | `proverka-opory.mjs` on a stand-in base: no writes without `--zapisat`, blindness never stored | 0, 1, 2 |
| `stend-opory-1563.mjs` | `proverka-opory.mjs` on a hermetic stand-in of logs (old and `v4`) | 0, 1, 2 |

`stend-opisaniya.mjs` требует в `README.md` раздел на каждого сторожа из `STOROZHA` (`Сторож 1 — оповещение о сжатии`, `Сторож 2 — вторая ступень заполнения`, `Охват: какие сессии сторож видел`) с обязательными колонками из `KOLONKI_OPISANIYA`. Раздел — заголовок уровня 2–4 (`##`–`####`); текст заголовка сравнивается с перечнем без учёта регистра, лишних пробелов и вида тире. Вторая сторона пары: раздел, в собственном тексте которого стоит первая колонка из `KOLONKI_OPISANIYA` (что сторож не ловит), считается заявкой на сторожа и обязан быть в перечне кода. Поэтому саму эту колонку дословно нельзя писать ни в каком другом разделе, в том числе здесь. Число заявок должно совпасть с числом сторожей. В этом README девять разделов второго уровня, три из них — сторожа. На нём стенд даёт код 0. Стенд проверяет наличие и охват разделов, но не верность их текста.

`stend-opisaniya.mjs` requires in `README.md` a section for every guard in `STOROZHA` (`Сторож 1 — оповещение о сжатии`, `Сторож 2 — вторая ступень заполнения`, `Охват: какие сессии сторож видел`) with the mandatory columns from `KOLONKI_OPISANIYA`. A section is a level 2–4 heading (`##`–`####`); the heading text is compared with the list ignoring case, extra spaces and the dash kind. The second side of the pair: a section whose own text contains the first column from `KOLONKI_OPISANIYA` (what the guard does not catch) counts as a claim of a guard and must be in the code list. So that column itself must not be written verbatim in any other section, including this one. The number of claims must equal the number of guards. This README has nine second-level sections, three of them guards. On it the stand returns code 0. The stand checks the presence and coverage of the sections, not the correctness of their text.

`stend-proverki-opory.mjs` берёт ядро из `STEND_CORE` или ключа `PAMYAT_CORE` боевого файла настройки и импортирует настоящее ядро; база и каталог сессий у него временные.

`stend-proverki-opory.mjs` takes the core from `STEND_CORE` or the `PAMYAT_CORE` key of the production settings file and imports the real core; its base and sessions directory are temporary.

Стенды `*.sh` (первый довод — путь к сторожу, где нужен):

| Стенд | Запуск | Коды | Окружение |
|---|---|---|---|
| `stend-nastrojki.sh` | `bash test/stend-nastrojki.sh` (`STEND_BIN` — каталог программ) | 0, 1 | каналы тревоги подменены, `agent-alert` уведён в пустоту |
| `stend-slepoty-nastrojki.sh` | `bash test/stend-slepoty-nastrojki.sh` | 0, 1, 2 | подменённый канал; от root — слепота стенда |
| `stend-modeli-omega.sh` | `bash test/stend-modeli-omega.sh <сторож>` | 0, 1 | без sudo; в такте «бой» читает боевой каталог модели, `systemctl`, `journalctl` |
| `stend-pravki-postavki-omega.sh` | `bash test/stend-pravki-postavki-omega.sh <сторож>` + `STEND_PUNKT_SEARCH`, `STEND_PUNKT_BRIDGE`, `STEND_PUNKT_HANDLERS` | 0, 1, 2 | sudo, копия боевой базы OMEGA, чтение боевой поставки и `systemctl` |
| `stend-svodki-doveriya.sh` | `bash test/stend-svodki-doveriya.sh <сторож> [основа]` | 0, 1, 2 | sudo, копия боевой базы OMEGA, чтение боевой поставки и `systemctl` |

`*.sh` stands (the first argument is the watcher path where needed):

| Stand | Run | Codes | Environment |
|---|---|---|---|
| `stend-nastrojki.sh` | `bash test/stend-nastrojki.sh` (`STEND_BIN` — programs directory) | 0, 1 | alarm channels substituted, `agent-alert` led nowhere |
| `stend-slepoty-nastrojki.sh` | `bash test/stend-slepoty-nastrojki.sh` | 0, 1, 2 | substituted channel; as root — stand blindness |
| `stend-modeli-omega.sh` | `bash test/stend-modeli-omega.sh <watcher>` | 0, 1 | no sudo; in the "бой" (production) cycle reads the production model directory, `systemctl`, `journalctl` |
| `stend-pravki-postavki-omega.sh` | `bash test/stend-pravki-postavki-omega.sh <watcher>` + `STEND_PUNKT_SEARCH`, `STEND_PUNKT_BRIDGE`, `STEND_PUNKT_HANDLERS` | 0, 1, 2 | sudo, copy of the production OMEGA base, reads the production distribution and `systemctl` |
| `stend-svodki-doveriya.sh` | `bash test/stend-svodki-doveriya.sh <watcher> [base]` | 0, 1, 2 | sudo, copy of the production OMEGA base, reads the production distribution and `systemctl` |

Нельзя запускать без подмен или без понимания последствий:

- `stend-pravki-postavki-omega.sh`, `stend-svodki-doveriya.sh` — в ночном обходе с A-N-1711 (07.10; доводы — таблица vse-stendy-boevye.sh), ночью 10–20 с; нужен sudo, копия боевой OMEGA; последний такт — боевая поставка и systemctl: красное ночью — живое состояние, не дефект стенда (прежнее «не ставить» снято 17.10);
- `stend-istochnika-rashoda.mjs`, `stend-vygruzki.mjs`, `stend-primenimosti-prune.mjs` и весь `npm test` — при заданном `DSH_HOME` пишут в файл ступеней агента;
- `bin/stendy-vseh-paketov.sh` — запускает стенды всех пакетов `dsh-pamyat-*` без чтения их шапок, в том числе стенды, трогающие бой;
- `bin/proverka-opory.mjs --zapisat`, `bin/pamyat-vernut-povtor` — пишут в боевую `pamyat.db`; `bin/chitatel-otklonennyh.mjs` без `--suho` пишет файлы решений;
- `bin/omega-kopiya-watch`, `rubezh-otnoshenij-watch`, `rasshcheplenie-otmeny-watch`, `session-agent-preset-watch --watch`, `session-writer-watch.py` без `--check` — шлют тревоги через `agent-alert` и пишут своё состояние; ручной прогон сдвигает отметки боевого юнита;
- `bin/proba-sleda-podyoma.mjs` — монтирует пакеты памяти с настройками боевого профиля (у ядра база временная, у остальных — боевые настройки);
- `bin/sostav-nabora.mjs` — делает `git fetch origin` в клоне.

Do not run without substitutions or without understanding the consequences:

- `stend-pravki-postavki-omega.sh`, `stend-svodki-doveriya.sh` — in the nightly round since A-N-1711 (07.10; arguments — the vse-stendy-boevye.sh table), 10–20 s at night; need sudo, copy of the production OMEGA; the last step reads the production install and systemctl: red at night is live state, not a stand defect (the former "not for the daily round" withdrawn 17.10);
- `stend-istochnika-rashoda.mjs`, `stend-vygruzki.mjs`, `stend-primenimosti-prune.mjs` and the whole `npm test` — with `DSH_HOME` set they write into the agent's stage file;
- `bin/stendy-vseh-paketov.sh` — runs the stands of all `dsh-pamyat-*` packages without reading their headers, including stands that touch production;
- `bin/proverka-opory.mjs --zapisat`, `bin/pamyat-vernut-povtor` — write to the production `pamyat.db`; `bin/chitatel-otklonennyh.mjs` without `--suho` writes decision files;
- `bin/omega-kopiya-watch`, `rubezh-otnoshenij-watch`, `rasshcheplenie-otmeny-watch`, `session-agent-preset-watch --watch`, `session-writer-watch.py` without `--check` — send alarms via `agent-alert` and write their state; a manual run shifts the production unit's marks;
- `bin/proba-sleda-podyoma.mjs` — mounts memory packages with the production profile settings (the core gets a temporary base, the others production settings);
- `bin/sostav-nabora.mjs` — runs `git fetch origin` in the clone.

## Ограничения · Limitations

Плагин:

- Видит только события своего процесса. Сжатия других агентов и других процессов, события до подъёма и события, не дошедшие до слушателя, не наблюдаются; молчание этих случаев не различает.
- Счёт сводки живёт в памяти процесса и обнуляется подъёмом: «с подъёма», а не «за сутки». Если событий нет вовсе, сводка не печатается, и снаружи сторож неотличим от мёртвого; отдельного сторожа молчания нет.
- Сторож 1 (оповещение о сжатии): сжатие, начатое и оборванное (перезапуск, падение), строки завершения не получает; оно видно в сводке как «начато и НЕ завершено» только до гибели процесса. Расход, не сообщённый в `usage` события платформы, печатается как «НЕ СООБЩЁН», а не ноль, и тревоги не поднимает. Дистилляцию секретаря не наблюдает. Длительность — между записями в журнал, а не работа модели. Маршрут в строке — на момент чтения, не обязательно тот, которым сжимали.
- Сторож 2 (ступени заполнения): если нет готового D, окна платформы и `predel`, ступени не считаются (об этом одна строка). Вызовы без `usage.inputTokens` мимо счёта. Заполнение известно только после ответа модели. Сжатие, прошедшее, пока модуль не был загружен, ловится лишь запасным сбросом (доля ниже отданной ступени больше чем на 0,10). Счёт свой и с нуджем (`dsh-pamyat-nudzh`) не сверяется.
- Охват по сессиям: это сессии этого процесса, а не агенты машины. Сессия без единого события с подъёма в списке отсутствует. Пометка «МОЛЧИТ» — после часа без событий.
- Страж одиночного монтажа ключуется по `config.agent`: два безымянных монтажа в одном процессе схлопнутся в один.
- Неудача печати глушится: сломанный логгер даёт тишину. Отказ стока печатается в журнал строкой «сток не сработал».
- `komandaStoka` исполняется оболочкой с правами процесса агента; подставлять в неё внешний ввод нельзя.
- Загрузка требует `dsh-pamyat-kompakt` рядом, он объявлен обязательным peer `^3.1.1`.

Plugin:

- Sees only the events of its own process. Compactions of other agents and processes, events before start-up and events that did not reach the listener are not observed; its silence does not distinguish these cases.
- The summary count lives in process memory and resets on start-up: "since start-up", not "per day". With no events at all the summary is not printed, and from outside the guard is indistinguishable from a dead one; there is no separate silence watcher.
- Guard 1 (compaction notification): a compaction that started and was cut off (restart, crash) gets no finish line; it shows in the summary as "начато и НЕ завершено" (started and NOT finished) only until the process dies. Spend not reported in the platform event's `usage` is printed as "НЕ СООБЩЁН" (not reported), not zero, and raises no alarm. The secretary's distillation is not observed. Duration is between log records, not model work. The route in the line is as of reading, not necessarily the one used for compaction.
- Guard 2 (fill stages): if ready D, the platform window and predel are all missing, stages are not counted (one line says so). Calls without `usage.inputTokens` bypass the count. The fill is known only after a model response. A compaction that passed while the module was not loaded is caught only by the fallback reset (share below a reported stage by more than 0.10). The count is its own and is not reconciled with the nudge (`dsh-pamyat-nudzh`).
- Session coverage: these are sessions of this process, not agents of the machine. A session with no event since start-up is absent from the list. The "МОЛЧИТ" (silent) mark appears after an hour without events.
- The single-mount guard is keyed by `config.agent`: two unnamed mounts in one process collapse into one.
- A printing failure is swallowed: a broken logger yields silence. A sink failure is printed to the log as "сток не сработал" (sink failed).
- `komandaStoka` runs in a shell with the agent process privileges; external input must never be substituted into it.
- Loading requires `dsh-pamyat-kompakt` alongside, it is declared as the mandatory peer `^3.1.1`.

Программы `bin/`:

- `proverka-opory.mjs`, `sverka-s-istochnikom.mjs` проверяют наличие опоры, а не совпадение текста. `sverka-s-istochnikom.mjs` читает одну сессию `telegram-a2a` и только старый журнал `session.jsonl.zstd`, без `v4`.
- `proverka-cepi-boem.mjs` смотрит только последнюю вставку в окне журнала; сравнивает id и длину, а не текст.
- `omega-kopiya-watch` связывает записи только по отпечатку текста (NFC): слитую или изменённую хранилищем запись назовёт «без копии»; знания, не дошедшие до `pamyat.db`, и чужие узлы не видит; правку поставки, наложенную заново с ошибкой, и подменённый файл модели того же размера не ловит.
- `rasshcheplenie-otmeny-watch` следит только за ростом `active_with_superseded_metadata`; не видит `last_accessed`, `valid_until`, счётчики обращений, подмену `node_id`/времён и переписанное происхождение.
- `rubezh-otnoshenij-watch` держит в умолчаниях замер конкретного монтажа (`RUBEZH_MONTAZH_MAXID`, `RUBEZH_MONTAZH_TS`) и рубеж происхождения `68`.
- `session-agent-preset-watch` не судит субагентские сессии (`origin=subagent`). `session-writer-watch.py` ловит только повторный отказ писателя, а не живость вообще.
- `proba-sleda-podyoma.mjs` проверяет присутствие строки подъёма, а не исправность пакета.
- `sostav-nabora.mjs` читает факт коммита вердикта, а не его содержание; работает рукой владельца клона.
- `stendy-vseh-paketov.sh` судит по коду возврата и строкам проб; часть пакетов берёт зависимости симлинком на боевой каталог.
- Сторожа на машине работают по копиям в `/usr/local/sbin`; обновление пакета их не трогает.

`bin/` programs:

- `proverka-opory.mjs`, `sverka-s-istochnikom.mjs` check the presence of an anchor, not text agreement. `sverka-s-istochnikom.mjs` reads one session, `telegram-a2a`, and only the old log `session.jsonl.zstd`, not `v4`.
- `proverka-cepi-boem.mjs` looks only at the last injection in the log window; it compares id and length, not text.
- `omega-kopiya-watch` links records only by a text fingerprint (NFC): a record merged or altered by the store is reported as "no copy"; knowledge that never reached `pamyat.db` and other nodes are not seen; a distribution patch re-applied with an error and a substituted model file of the same size are not caught.
- `rasshcheplenie-otmeny-watch` watches only growth of `active_with_superseded_metadata`; it does not see `last_accessed`, `valid_until`, access counters, substitution of `node_id`/timestamps or rewritten provenance.
- `rubezh-otnoshenij-watch` keeps a measurement of a specific deployment in its defaults (`RUBEZH_MONTAZH_MAXID`, `RUBEZH_MONTAZH_TS`) and the provenance boundary `68`.
- `session-agent-preset-watch` does not judge subagent sessions (`origin=subagent`). `session-writer-watch.py` catches only a repeated writer refusal, not liveness in general.
- `proba-sleda-podyoma.mjs` checks the presence of a start-up line, not that the package works.
- `sostav-nabora.mjs` reads the fact of a verdict commit, not its content; it works with the clone owner's account.
- `stendy-vseh-paketov.sh` judges by exit code and probe lines; some packages take dependencies through a symlink to the production directory.
- The watchers on the machine run from copies in `/usr/local/sbin`; a package update does not touch them.

---

Описание сторожей ниже сверяет стенд `test/stend-opisaniya.mjs`. Заголовок раздела — уровня 2–4, его текст совпадает с заголовком из перечня `STOROZHA` в `src/index.js` без учёта регистра, лишних пробелов и вида тире. У каждого раздела обязательны две колонки: что сторож не ловит и что значит его молчание. Английское название — отдельной строкой под заголовком. Эти разделы не переводятся и не переименовываются.

The guard descriptions below are checked by the stand `test/stend-opisaniya.mjs`. A section heading is of level 2–4, and its text matches the heading from the `STOROZHA` list in `src/index.js` ignoring case, extra spaces and the dash kind. Each section must have two columns: what the guard does not catch and what its silence means. The English title goes on a separate line under the heading. These section headings are not translated or renamed.

## Сторож 1 — оповещение о сжатии

*Guard 1 — compaction notification*

Одна строка на одно завершённое сжатие: агент, вид, вытесненный объём, длина сводки, расход, модель, длительность, идентификатор сжатия и маршрут. Пример настоящей строки:

One line per finished compaction: agent, kind, shadowed volume, summary length, spend, model, duration, compaction id and route. An example of a real line:

```text
[dsh-pamyat-storozha <версия>] агент <agent> · сжатие естественное · вытеснено 812000 ток. (вход) · сводка вышло 5400 зн. · дистилляция: сторож её НЕ наблюдает (…) · расход НЕ СООБЩЁН В СОБЫТИИ ПЛАТФОРМЫ (поле usage; это не ноль) — расход своего вызова печатает сам kompakt · модель <summary-model> · длительность 41.5 с — между ЗАПИСЯМИ В ЖУРНАЛ, не работа модели · id c-1 · маршрут сейчас <provider> (маршрут НА МОМЕНТ ЧТЕНИЯ, не обязательно тот, которым сжимали)
```

| | |
|---|---|
| **Что ловит · What it catches** | всякое завершённое сжатие: естественное, принудительное (команда человека), обрезку без модели и проваленную попытку · every finished compaction: natural, forced (a human command), prune without a model, and a failed attempt |
| **🔴 ЧЕГО НЕ ЛОВИТ · What it does NOT catch** | Незавершённое сжатие (оборванное перезапуском или падением) строки завершения не получает; его начало учитывается и показывается в сводке как «начато и НЕ завершено», но при гибели процесса этот счёт теряется. Сжатие в чужой сессии или другом процессе. Расход, который провайдер не сообщил в событии платформы: печатается словами «НЕ СООБЩЁН», а не нулём. Длительность работы модели: поля длительности у событий нет, считается время между записями в журнал (в нём и очередь, и ожидание). Маршрут, которым шло само сжатие: печатается маршрут на момент чтения, и это помечено. · An unfinished compaction (cut off by a restart or crash) gets no completion line; its start is counted and shown in the summary as "started and NOT finished", but this count is lost if the process dies. A compaction in another session or process. Spend the provider did not report in the platform event: printed as "НЕ СООБЩЁН" (not reported), not zero. Model working time: events have no duration field, the time between journal records is measured (queueing and waiting included). The route the compaction actually used: the route at reading time is printed, and that is marked. |
| **🔴 ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ · What its silence means** | «сжатий не было» **и** «события до нас не дошли» **и** «плагин не смонтирован» — три разные вещи, по молчанию неразличимые. Признак работы — строка подъёма при старте и сводка после первого хода; нет их — молчание не значит ничего. · "there were no compactions" **and** "events did not reach us" **and** "the plugin is not mounted" — three different things, indistinguishable by silence. The sign of work is the start-up line and the summary after the first turn; without them silence means nothing. |

## Сторож 2 — вторая ступень заполнения

*Guard 2 — second fill stage*

Ступени 85% и 90% **от порога сжатия** — того же числа, которое показывает команда статуса сжатия (100% = floor(окно × доля)). Порог берётся готовым из файла порогов агента для текущего маршрута на каждом замере. Не прочитан — ступени считаются от окна, и строка говорит «⚠️ порог сжатия НЕ ПРОЧИТАН (<причина>) — считаю от окна». Числитель — вход плюс кэш из ответа модели («по ответу модели»): он равен давлению в момент ответа и отстаёт на прирост между ответами. Пример:

Stages 85% and 90% **of the compaction threshold** — the same number the compaction status command shows (100% = floor(window × ratio)). The threshold is taken ready-made from the agent's threshold file for the current route at every measurement. If it cannot be read, stages are counted from the window and the line says "⚠️ порог сжатия НЕ ПРОЧИТАН (<reason>) — считаю от окна" (compaction threshold NOT READ — counting from the window). The numerator is input plus cache from the model response ("по ответу модели", per model response): it equals the pressure at the moment of the response and lags by the growth between responses. Example:

```text
[dsh-pamyat-storozha <версия>] агент <agent> · 🟡 ЗАПОЛНЕНИЕ 85,4% номинального порога 890 000 (request) (76,0% окна; по ответу модели) — перешагнул 85% (756 500); занято 760 000 (вход+кэш, БЕЗ выхода). окно — платформа, модель <model> · счёт СВОЙ, с нуджем не сверяется
```

Владельцу (сток) — одна короткая строка: «🟠 Заря: контекст 93% порога (742 тыс. из 800 тыс.)», «🗜 Заря: сжатие 742 → 27 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash» («после» — первый замер usage сессии после сжатия; нет его за 10 мин — «сжатие с 742 тыс.»); полная строка с источниками — в журнале. `<имя>` — из вшитой таблицы `IMENA` по `config.agent`, для учётки вне таблицы — само значение `agent`, при пустом `agent` — пусто. To the owner (sink) — one short line; the full line with sources stays in the log. `<имя>` comes from the built-in `IMENA` table by `config.agent`; for an account outside the table it is the `agent` value itself, and with an empty `agent` it is empty. 🟡 — ступень ниже 90%, 🟠 — 90% и выше. Один скачок через обе ступени даёт одно сообщение («перешагнуты 85% (…) и 90% (…) ОДНИМ скачком»). Отданные ступени хранятся на диске по сессиям (`$DSH_HOME/storages/storozha-stupeni.json`) и сбрасываются на `compaction/summary` или `compaction/prune` своей сессии — перезапуск службы повторного крика не вызывает. Окно спрашивается у платформы в момент каждого замера; `predel` — запасное число, помечается «платформой не подтверждена», а расхождение настройки с платформой называется вслух один раз.

🟡 — a stage below 90%, 🟠 — 90% and above. One jump over both stages gives one message ("перешагнуты 85% (…) и 90% (…) ОДНИМ скачком", crossed in ONE jump). Reported stages are stored on disk per session (`$DSH_HOME/storages/storozha-stupeni.json`) and reset on `compaction/summary` or `compaction/prune` of their session — a service restart does not cause a repeated alarm. The window is asked from the platform at every measurement; `predel` is a fallback marked "платформой не подтверждена" (not confirmed by the platform), and a mismatch between the setting and the platform is said aloud once.

| | |
|---|---|
| **Что ловит · What it catches** | переход через каждую ступень порога сжатия — по одному разу до следующего сжатия своей сессии, и после перезапуска службы тоже (ступени на диске) · crossing each stage of the compaction threshold — once until the next compaction of its session, also after a service restart (stages on disk) |
| **🔴 ЧЕГО НЕ ЛОВИТ · What it does NOT catch** | Заполнение, когда нет готового порога D, окна платформы и запасного predel: доля не считается вовсе (это печатается отдельной строкой). Вызовы, у которых провайдер не сообщил `usage` или `inputTokens`: они проходят мимо счёта. Заполнение между двумя ответами модели: величина известна только после вызова, и резкий скачок может перешагнуть ступень и упереться в предел, не дав сторожу такта. Сжатие, прошедшее, пока модуль не был загружен: на это есть только запасной сброс (доля упала ниже отданной ступени больше чем на 0,10). · Fill when ready D, the platform window and predel are all missing: the share is not computed at all (a separate line says so). Calls where the provider did not report `usage` or `inputTokens`: they bypass the count. Fill between two model responses: the value is known only after a call, and a sharp jump may cross a stage and hit the limit without giving the guard a beat. A compaction that happened while the module was not loaded: only a fallback reset covers it (the share dropped below a reported stage by more than 0.10). |
| **🔴 ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ · What its silence means** | «ступень не пройдена» **и** «usage не приходит». Случай «нет D, окна и predel» из молчания выведен: он печатается строкой «ступени НЕ считаются» с причиной — иначе тишина читалась бы как «занято мало». · "no stage crossed" **and** "usage does not arrive". The "no D, window or predel" case is taken out of silence: it is printed as "ступени НЕ считаются" (stages NOT counted) with a reason — otherwise silence would read as "little is occupied". |
| **⚠️ СЧЁТ СВОЙ · Own count** | нудж (`dsh-pamyat-nudzh`) ведёт собственный счёт со своей долей. Числа независимы и могут разойтись — это вторая пара глаз, а не «правильное число»; разойдутся — смотреть оба. · the nudge package (`dsh-pamyat-nudzh`) keeps its own count with its own ratio. The numbers are independent and may differ — this is a second pair of eyes, not "the correct number"; if they differ, look at both. |

## Охват: какие сессии сторож видел

*Coverage: which sessions the guard saw*

В сводке всегда, даже при нуле, печатается строка «ОХВАТ ПО СЕССИЯМ: видел N — <id> (событий K)». Сессия, от которой больше часа нет событий, получает пометку «МОЛЧИТ N мин»; сессия прежнего разговора (после `/new`, в архиве платформы) — пометку «прежний разговор /new» вместо неё.

The summary always, even at zero, prints the line "ОХВАТ ПО СЕССИЯМ: видел N — <id> (событий K)" (COVERAGE BY SESSION: saw N — <id> (K events)). A session with no events for more than an hour gets the mark "МОЛЧИТ N мин" (silent N min); a previous-conversation session (after `/new`, archived by the platform) gets "прежний разговор /new" (previous conversation /new) instead.

| | |
|---|---|
| **Что ловит · What it catches** | сессию этого процесса, от которой перестали приходить события: она остаётся в списке с пометкой «МОЛЧИТ N мин» · a session of this process that stopped sending events: it stays in the list marked "МОЛЧИТ N мин" |
| **🔴 ЧЕГО НЕ ЛОВИТ · What it does NOT catch** | Чужих агентов машины — вовсе, ни одним событием: сторож живёт внутри процесса, и «видел 1» говорит про сессии этого процесса, а не про число агентов на машине. Сессию, от которой с подъёма не было ни одного события: её в списке нет, и «не было» не отличить от «не дошло». · Other agents on the machine — not at all, through no event: the guard lives inside the process, and "saw 1" speaks about sessions of this process, not the number of agents on the machine. A session that sent no event since start-up: it is not in the list, and "there was none" cannot be told from "it did not arrive". |
| **🔴 ЧТО ЗНАЧИТ ЕГО МОЛЧАНИЕ · What its silence means** | «сессия шлёт события» **и** «сторож не смонтирован» **и** «событий не было вовсе». В обычной работе процесс видит одну сессию, так что разряд чаще всего молчит по существу, а не по исправности. · "the session sends events" **and** "the guard is not mounted" **and** "there were no events at all". In normal operation a process sees one session, so the category is usually silent on the merits, not because of health. |


Сторож хранит охват последних 128 сессий по последнему событию; вытеснение названо в сводке. Файл ступеней хранит не более 128 сессий по времени последней отправки/сброса ступени (kogda). Старые записи режутся при загрузке/записи. При возврате вытеснённой сессии ступень может быть отдана повторно; это ограниченный dedup, не вечный архив. Без событий очистка в памяти не вызывается. Другие карты незавершённых сжатий эта граница не ограничивает.

Coverage retains the 128 most recently active sessions; eviction is reported in the summary. The stage file retains 128 sessions by the last stage send/reset time (kogda). Old entries are trimmed on load/write. A returning evicted session may alert again: this is bounded dedup, not a permanent archive. This cap does not bound the unfinished-compaction maps.

## Квитанция подъёма · Startup receipt

Строка подъёма `[dsh-pamyat-storozha <version>] подъём: …` идёт один раз непосредственно в stdout процесса, независимо от exporter Cordis: его logger может принять строку только в буфер. Версия фиксируется из package.json при импорте; неизвестная версия не заменяется выдуманной. Читатель — pered-podyomom --posle, затем kvitanciya-podyoma (только rc0). Это признак загрузки, не доказательство исправности всех сторожей; ошибка stdout сохраняет прежнюю границу «печать не роняет пакет». Остальные сообщения сохраняют logger-путь. После монтажа нужен назначенный подъём; старый процесс новую строку не получит.

The startup line `[dsh-pamyat-storozha <version>] подъём: …` goes once directly to process stdout, independently of Cordis exporters, which may only buffer logger messages. The version is read at module import; an unknown version is not invented. The reader is pered-podyomom --posle, then kvitanciya-podyoma (rc0 only). This proves loading, not all guard behavior. Output failure retains the no-crash boundary. Other messages keep their logger route; an assigned restart is required after deployment.

`node test/stend-startup-journal.mjs` — настоящий Cordis без exporter: stdout/version + remount; не запуск живой службы. · Actual Cordis without exporter: stdout/version + remount; no live service.

## TEAM-003: first-start session gap / первый подъём

`session-agent-preset-watch` (root oneshot → timer) distinguishes an absent session root before a service's first observable start. The canonical unit comes from `namerenie.sluzhba`. Only a loaded, inactive unit with empty ActiveEnterTimestamp, ExecMainStartTimestamp and InvocationID AND an empty retained all-boot journal is counted as `agents_not_started`, separately from `agents_scanned`. No alarm is sent for that case; JSON, journal and state name the waiting agents. The existing registry remains the denominator; waiting agents are not counted as inspected sessions.

Ненулевой/неполный/недоступный systemd или journalctl, timeout/не-root, неизвестная unit, существующий пустой root сессий — прежняя слепота2, не разрешение пропуска. След запуска/InvocationID/журнала при отсутствующем root — тревога. Заголовки без agentPreset по-прежнему провал1. У каждого запроса предел5с в общем бюджете60с. В историю читаются только служебные поля, не MESSAGE. Отсутствие следов означает отсутствие в текущем manager и сохранённом журнале, не восстановление удалённой истории; при одновременной утрате всех прежних свидетельств прошлый запуск не доказать этой проверкой.

Зовущий — `session-agent-preset-watch.service --watch`; читатель проблем — прежний agent-alert, оператор видит ожидание первого подъёма через --json/журнал/last.json. Права, таймер и антидублирование не меняются. `test/stend-preset-lifecycle.mjs` — @root,12 temp-fixture методов, systemd/journal/alert явно подставные; никаких живых служб/сессий/моделей/тревог стенд не вызывает.

Для окна команды выбран второй вариант документации: при ещё старом стороже между записью новых агентов в agents.yaml (Z5) и их первым подъёмом (Z9/Z10) поимённые FileNotFoundError этих новых session-root являются ожидаемой стадией окна. Остальные ошибки этим не оправданы, сторож/канал не выключаются. На bclaude/spark исправленный выпуск ставится принятой рукой ДО Z5; приёмка сессий удерживается до настоящего первого хода. Это порядок будущей установки, не выполненный автором монтаж.
