# dsh-pamyat-obsluzhivanie

**Версия:** 3.1.4

## Назначение · Purpose

Служба обслуживания памяти агентов машины. Это не плагин dsh: это набор Python-модулей и юнитов systemd. Раз в сутки таймер запускает `src/runner.py --run` под учётной записью `omega`. Runner по очереди проводит ступени: счёт локальной памяти агентов, перенос уроков из файлов `UROKI-*.md` в локальную память агента и в OMEGA, чистку текста старых локальных записей (по умолчанию сухую), судью пар записей OMEGA и сверку целостности уроков. Итог уходит одной строкой через `agent-alert`. Судья только предлагает вердикты `same` / `complementary` / `contradiction` и не удаляет и не сливает записи. `heartbeat.py` даёт внешнему сторожу проверку того, что прогон прошёл.

A maintenance service for the memory of the agents on a machine. It is not a dsh plugin: it is a set of Python modules plus systemd units. Once a day a timer starts `src/runner.py --run` under the `omega` account. The runner goes through the stages in order: a count of the agents' local memory, transfer of lessons from `UROKI-*.md` files into the agent's local memory and into OMEGA, cleanup of text in old local records (dry by default), a judge for pairs of OMEGA records, and a lesson integrity check. The result goes out as one summary line via `agent-alert`. The judge only proposes `same` / `complementary` / `contradiction` verdicts and never deletes or merges records. `heartbeat.py` lets an external watchdog check that the run took place.

## Что ставится и куда · What gets installed and where

Файлы пакета (поле `files` в `package.json`: `src`, `test`, `systemd`, `docs`, `README.md`, `CHANGELOG.md`; `package.json` и `LICENSE` npm кладёт в архив и без перечня):

| Файл | Что делает |
|---|---|
| `src/runner.py` | Точка входа (`bin` в `package.json`). Режимы `--run` и `--heartbeat`, ключ `--state-dir`. Каждую ступень запускает в отдельном процессе со своим пределом времени. Пишет отчёт и `latest.json`, шлёт итог |
| `src/memory_count.py`, `src/memory_count.mjs` | Ступень 1, счёт памяти. На каждую базу `<дом>/pamyat/pamyat.db` запускает отдельный процесс `/usr/local/bin/node`, который зовёт счётчик ядра `dsh-pamyat-core` |
| `src/lessons.py`, `src/local_lessons.mjs`, `src/lessons_store.py` | Ступень 2, уроки. Запись в локальную память идёт через ядро, в OMEGA — через `SQLiteStore` поставки OMEGA. В `lessons_store.integrity` — сверка целостности после ступеней |
| `src/chistka.py` | Ступень 3, чистка: стирает текст старых локальных записей, которые уже есть в OMEGA. Ручная команда `vernut` возвращает текст из страховки |
| `src/judge.py` | Ступень 4, судья пар OMEGA. Модуль без собственной командной строки |
| `src/prosmotreno.py` | Ручная отметка человека «пара просмотрена» для пар с признаком секрета и для слишком длинных пар |
| `src/svyazat_zadnim.py` | Разовый ручной проход A-N-1731: задним числом ставит связь `svyaz_omega` для уроков, доставленных в OMEGA раньше |
| `src/heartbeat.py`, `src/prepare_key.py` | Помощники для root. Работают только на стандартной библиотеке и запускаются из отдельных root-копий |
| `systemd/dsh-pamyat-obsluzhivanie.service`, `systemd/dsh-pamyat-obsluzhivanie.timer` | Юниты службы и таймера |
| `test/` | Стенд `stend-obsluzhivaniya.mjs`, тесты `test_*.py`, помощники `fixture.py` и `fixtures/v1-store.py`, root-пробы `security-root.py` и `proba-root-paths.sh` |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |

Package files (the `files` field of `package.json`: `src`, `test`, `systemd`, `docs`, `README.md`, `CHANGELOG.md`; npm puts `package.json` and `LICENSE` into the archive even without the list):

| File | What it does |
|---|---|
| `src/runner.py` | Entry point (`bin` in `package.json`). Modes `--run` and `--heartbeat`, option `--state-dir`. Runs each stage in its own process with its own time limit. Writes the report and `latest.json`, sends the summary |
| `src/memory_count.py`, `src/memory_count.mjs` | Stage 1, memory count. For each database `<home>/pamyat/pamyat.db` it starts a separate `/usr/local/bin/node` process that calls the `dsh-pamyat-core` counter |
| `src/lessons.py`, `src/local_lessons.mjs`, `src/lessons_store.py` | Stage 2, lessons. Local memory is written through the core, OMEGA through the `SQLiteStore` shipped with OMEGA. `lessons_store.integrity` holds the integrity check that runs after the stages |
| `src/chistka.py` | Stage 3, cleanup: erases the text of old local records that are already in OMEGA. The manual `vernut` command restores text from a backup |
| `src/judge.py` | Stage 4, the OMEGA pair judge. The module has no command line of its own |
| `src/prosmotreno.py` | A human's manual "pair reviewed" mark for pairs with a secret sign and for oversized pairs |
| `src/svyazat_zadnim.py` | One-off manual pass A-N-1731: backfills the `svyaz_omega` link for lessons that reached OMEGA earlier |
| `src/heartbeat.py`, `src/prepare_key.py` | Helpers for root. They use only the standard library and run from separate root copies |
| `systemd/dsh-pamyat-obsluzhivanie.service`, `systemd/dsh-pamyat-obsluzhivanie.timer` | Service and timer units |
| `test/` | Bench `stend-obsluzhivaniya.mjs`, `test_*.py` tests, helpers `fixture.py` and `fixtures/v1-store.py`, root probes `security-root.py` and `proba-root-paths.sh` |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |

Куда это попадает на машине:

| Что | Куда |
|---|---|
| Пакет целиком | `/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie`. Runner запускается отсюда: путь задаёт `OBSL_RUNNER` во вставке машины |
| Root-копии `src/heartbeat.py` и `src/prepare_key.py` | `/usr/local/lib/dsh-pamyat-obsluzhivanie/` (`root:root`, файлы 0644). Путь к ним прописан в юните (`ExecStartPre`/`ExecStopPost`). Отсюда же внешний сторож зовёт `heartbeat.py` |
| Юниты из `systemd/` | `/usr/local/lib/systemd/system/` |
| Вставки машины (не входят в пакет) | `/etc/systemd/system/dsh-pamyat-obsluzhivanie.service.d/`: `20-ferma.conf` (данные машины), `40-ort-telemetriya-vykl.conf` (`ORT_DISABLE_TELEMETRY=1`), `agent-alert.conf` (`SupplementaryGroups=agent-button`) |
| Каталог состояния | `/var/lib/dsh-pamyat-obsluzhivanie` (`StateDirectory`, 0700). В нём `run.lock`, `latest.json`, `runs/<run_id>*.json`, `lessons.json`, `chistka.json` (если заведён), `chistka/` (страховки), `judge/` (`state.json`, `prosmotreno.json`, `lock`, `reports/`, `vydacha-<день>.json`) |
| Ключ модели на время прогона | `/run/dsh-pamyat-obsluzhivanie-key/deepseek` (каталог `root:omega` 0750, файл 0440). `prepare_key.py remove` удаляет его после прогона |
| Замок писателя уроков | `uroki-exact-writer.lock` рядом с базой OMEGA `/var/lib/omega/.omega/omega.db` |

Where these end up on the machine:

| What | Where |
|---|---|
| The whole package | `/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie`. The runner is started from here: `OBSL_RUNNER` in the machine drop-in sets the path |
| Root copies of `src/heartbeat.py` and `src/prepare_key.py` | `/usr/local/lib/dsh-pamyat-obsluzhivanie/` (`root:root`, files 0644). The unit names this path (`ExecStartPre`/`ExecStopPost`). The external watchdog calls `heartbeat.py` from here too |
| Units from `systemd/` | `/usr/local/lib/systemd/system/` |
| Machine drop-ins (not part of the package) | `/etc/systemd/system/dsh-pamyat-obsluzhivanie.service.d/`: `20-ferma.conf` (machine data), `40-ort-telemetriya-vykl.conf` (`ORT_DISABLE_TELEMETRY=1`), `agent-alert.conf` (`SupplementaryGroups=agent-button`) |
| State directory | `/var/lib/dsh-pamyat-obsluzhivanie` (`StateDirectory`, 0700). It holds `run.lock`, `latest.json`, `runs/<run_id>*.json`, `lessons.json`, `chistka.json` (if created), `chistka/` (backups), `judge/` (`state.json`, `prosmotreno.json`, `lock`, `reports/`, `vydacha-<day>.json`) |
| Model key for the duration of a run | `/run/dsh-pamyat-obsluzhivanie-key/deepseek` (directory `root:omega` 0750, file 0440). `prepare_key.py remove` deletes it after the run |
| Lesson writer lock | `uroki-exact-writer.lock` next to the OMEGA database `/var/lib/omega/.omega/omega.db` |

## Установка · Installation

Пакет выходит в npm под именем `dsh-pamyat-obsluzhivanie`, как все пакеты с `package.json`; до выхода ставится из локальной полки, как описано ниже. Лицензия — MIT, Aleksandr Argelander: поле `license` в `package.json` и файл `LICENSE`. В `/opt/agent-plugins/package.json` он записан как `file:../agent-plugins-tarbally/dsh-pamyat-obsluzhivanie-<версия>.tgz`, а npm ставит его в `/opt/agent-plugins/node_modules/` по `/opt/agent-plugins/package-lock.json`. Версия берётся из `package.json` пакета и строки lock. Из скриптов npm в пакете есть только `test`: при установке npm ничего не запускает, поэтому юниты и root-копии ставятся отдельно, рукой монтажа:

1. Скопировать `src/heartbeat.py` и `src/prepare_key.py` в `/usr/local/lib/dsh-pamyat-obsluzhivanie/` (`root:root`, 0644). В этот каталог может писать только root.
2. Скопировать `systemd/dsh-pamyat-obsluzhivanie.service` и `.timer` в `/usr/local/lib/systemd/system/`.
3. Положить вставку машины с `LoadCredential=alert-token:…`, `LoadCredential=alert-chat:…`, `Environment=AGENTS_REGISTRY=…`, `OBSL_KLYUCH_HOME=…`, `OBSL_KLYUCH_HRANILISHCHE=…`, `OBSL_RUNNER=<путь к src/runner.py>`.
4. Выполнить `systemctl daemon-reload` и включить таймер (`systemctl enable --now dsh-pamyat-obsluzhivanie.timer`).

The package is published to npm as `dsh-pamyat-obsluzhivanie`, like every package with a `package.json`; until then it is installed from the local shelf as described below. The license is MIT, Aleksandr Argelander: the `license` field in `package.json` and the `LICENSE` file. `/opt/agent-plugins/package.json` lists it as `file:../agent-plugins-tarbally/dsh-pamyat-obsluzhivanie-<version>.tgz`, and npm installs it into `/opt/agent-plugins/node_modules/` according to `/opt/agent-plugins/package-lock.json`. The version comes from the package's `package.json` and the lock entry. The only npm script in the package is `test`, so npm runs nothing during installation, and the units and root copies are installed separately, by hand:

1. Copy `src/heartbeat.py` and `src/prepare_key.py` to `/usr/local/lib/dsh-pamyat-obsluzhivanie/` (`root:root`, 0644). Only root can write to this directory.
2. Copy `systemd/dsh-pamyat-obsluzhivanie.service` and `.timer` to `/usr/local/lib/systemd/system/`.
3. Add a machine drop-in with `LoadCredential=alert-token:…`, `LoadCredential=alert-chat:…`, `Environment=AGENTS_REGISTRY=…`, `OBSL_KLYUCH_HOME=…`, `OBSL_KLYUCH_HRANILISHCHE=…`, `OBSL_RUNNER=<path to src/runner.py>`.
4. Run `systemctl daemon-reload` and enable the timer (`systemctl enable --now dsh-pamyat-obsluzhivanie.timer`).

Как юниты стоят на машине (по `systemctl cat`):

- `dsh-pamyat-obsluzhivanie.service` — `static`, `Type=oneshot`, `User=omega`, `Group=omega`.
  - `ExecStartPre=+/usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/prepare_key.py prepare`; `ExecStopPost=+… prepare_key.py remove`. Обе команды выполняются от root.
  - `ExecStart=/opt/omega/venv/bin/python3 -B ${OBSL_RUNNER} --run`. `OBSL_RUNNER=/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/runner.py` задан в `20-ferma.conf`.
  - Юнит задаёт `DEEPSEEK_CREDENTIAL_FILE=/run/dsh-pamyat-obsluzhivanie-key/deepseek`, `AGENT_ALERT_TOKEN_FILE=%d/alert-token`, `AGENT_ALERT_CHAT_FILE=%d/alert-chat`, `HOME=/var/lib/omega`, `OMEGA_HOME=/var/lib/omega/.omega`, `OMEGA_EMBEDDING_*` (модель `bge-m3`, размер 1024), `HF_HUB_OFFLINE=1`, `OMEGA_RERANKER_AUTODOWNLOAD=0`, `PYTHONDONTWRITEBYTECODE=1`, `OPENBLAS_NUM_THREADS=1`.
  - Пределы и защита: `TimeoutStartSec=60min`, `TimeoutStopSec=90s`, `MemoryMax=4G`, `Nice=10`, `KillMode=control-group`, `Restart=no`, `UMask=0077`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `StateDirectoryMode=0700`.
  - Файл `/usr/local/lib/systemd/system/dsh-pamyat-obsluzhivanie.service` побайтно совпадает с `systemd/dsh-pamyat-obsluzhivanie.service`. Данные машины приходят только из вставок.
- `dsh-pamyat-obsluzhivanie.timer` — `enabled`, `OnCalendar=*-*-* 04:00:00 Europe/Moscow`, `Persistent=true`, `AccuracySec=1min`, `WantedBy=timers.target`. Совпадает с `systemd/dsh-pamyat-obsluzhivanie.timer`.

How the units are set up on the machine (per `systemctl cat`):

- `dsh-pamyat-obsluzhivanie.service` — `static`, `Type=oneshot`, `User=omega`, `Group=omega`.
  - `ExecStartPre=+/usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/prepare_key.py prepare`; `ExecStopPost=+… prepare_key.py remove`. Both run as root.
  - `ExecStart=/opt/omega/venv/bin/python3 -B ${OBSL_RUNNER} --run`. `OBSL_RUNNER=/opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/runner.py` comes from `20-ferma.conf`.
  - The unit sets `DEEPSEEK_CREDENTIAL_FILE=/run/dsh-pamyat-obsluzhivanie-key/deepseek`, `AGENT_ALERT_TOKEN_FILE=%d/alert-token`, `AGENT_ALERT_CHAT_FILE=%d/alert-chat`, `HOME=/var/lib/omega`, `OMEGA_HOME=/var/lib/omega/.omega`, `OMEGA_EMBEDDING_*` (model `bge-m3`, dimension 1024), `HF_HUB_OFFLINE=1`, `OMEGA_RERANKER_AUTODOWNLOAD=0`, `PYTHONDONTWRITEBYTECODE=1`, `OPENBLAS_NUM_THREADS=1`.
  - Limits and hardening: `TimeoutStartSec=60min`, `TimeoutStopSec=90s`, `MemoryMax=4G`, `Nice=10`, `KillMode=control-group`, `Restart=no`, `UMask=0077`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `StateDirectoryMode=0700`.
  - The file `/usr/local/lib/systemd/system/dsh-pamyat-obsluzhivanie.service` is byte-identical to `systemd/dsh-pamyat-obsluzhivanie.service`. Machine data comes only from drop-ins.
- `dsh-pamyat-obsluzhivanie.timer` — `enabled`, `OnCalendar=*-*-* 04:00:00 Europe/Moscow`, `Persistent=true`, `AccuracySec=1min`, `WantedBy=timers.target`. Identical to `systemd/dsh-pamyat-obsluzhivanie.timer`.

Остановить службу можно только маской таймера: `systemctl mask dsh-pamyat-obsluzhivanie.timer`. При маске `prepare_key.py` не готовит ключ, а runner завершает прогон со статусом `disabled` без письма. `heartbeat.py` считает маску старше 3 суток красной.

The only way to stop the service is to mask the timer: `systemctl mask dsh-pamyat-obsluzhivanie.timer`. With a mask, `prepare_key.py` does not prepare the key, and the runner ends the run with status `disabled` and sends no message. `heartbeat.py` reports a mask older than 3 days as red.

## Настройка · Configuration

Переменные окружения, которые читает код:

| Имя | Кто читает | Умолчание в коде | Если не задана |
|---|---|---|---|
| `AGENTS_REGISTRY` | `lessons.py` (`REGISTRY`), через него `runner.py`, `chistka.py`, `svyazat_zadnim.py` | нет | отказ `registry_not_set` ещё до ступени счёта: прогон завершается со статусом `error`, остальные ступени не идут |
| `DEEPSEEK_CREDENTIAL_FILE` | `judge.DeepSeek` | нет (юнит задаёт путь в `/run/dsh-pamyat-obsluzhivanie-key/`) | `KeyError` при первом вызове модели. Файл: одна строка до 4096 байт, без NUL |
| `OBSL_KLYUCH_HOME` | `prepare_key.py` | нет; путь должен быть абсолютным | `credential_source_not_set`, ключ не готовится. `GNUPGHOME` = `<OBSL_KLYUCH_HOME>/.gnupg` |
| `OBSL_KLYUCH_HRANILISHCHE` | `prepare_key.py` | нет; путь должен быть абсолютным | то же; значение уходит в `PASSWORD_STORE_DIR` |
| `PROSMOTRENO_STATE` | `prosmotreno.py` | `/var/lib/dsh-pamyat-obsluzhivanie/judge` | берётся умолчание |
| `PROSMOTRENO_DB` | `prosmotreno.py` | `/var/lib/omega/.omega/omega.db` | берётся умолчание |

Environment variables the code reads:

| Name | Read by | Default in code | If unset |
|---|---|---|---|
| `AGENTS_REGISTRY` | `lessons.py` (`REGISTRY`), and through it `runner.py`, `chistka.py`, `svyazat_zadnim.py` | none | refusal `registry_not_set` before the count stage: the run ends with status `error` and no other stage runs |
| `DEEPSEEK_CREDENTIAL_FILE` | `judge.DeepSeek` | none (the unit sets a path under `/run/dsh-pamyat-obsluzhivanie-key/`) | `KeyError` on the first model call. File format: one line of at most 4096 bytes, no NUL |
| `OBSL_KLYUCH_HOME` | `prepare_key.py` | none; must be an absolute path | `credential_source_not_set`, no key is prepared. `GNUPGHOME` = `<OBSL_KLYUCH_HOME>/.gnupg` |
| `OBSL_KLYUCH_HRANILISHCHE` | `prepare_key.py` | none; must be an absolute path | same; the value goes into `PASSWORD_STORE_DIR` |
| `PROSMOTRENO_STATE` | `prosmotreno.py` | `/var/lib/dsh-pamyat-obsluzhivanie/judge` | the default is used |
| `PROSMOTRENO_DB` | `prosmotreno.py` | `/var/lib/omega/.omega/omega.db` | the default is used |

Код пакета сам не читает следующие переменные. Их задаёт юнит, а получают дочерние процессы или пакет `omega`:
- `OBSL_RUNNER` читает systemd (`ExecStart`).
- `AGENT_ALERT_TOKEN_FILE` и `AGENT_ALERT_CHAT_FILE` читает `/usr/local/bin/agent-alert`.
- `HOME`, `OMEGA_HOME`, `OMEGA_EMBEDDING_*`, `HF_HUB_OFFLINE`, `OMEGA_RERANKER_AUTODOWNLOAD` читает пакет `omega`. Писатель уроков принимает только вектор длины 1024 (`lessons_store.checked_embedding`).

The package code does not read the following variables itself. The unit sets them, and child processes or the `omega` package use them:
- systemd reads `OBSL_RUNNER` (`ExecStart`).
- `/usr/local/bin/agent-alert` reads `AGENT_ALERT_TOKEN_FILE` and `AGENT_ALERT_CHAT_FILE`.
- The `omega` package reads `HOME`, `OMEGA_HOME`, `OMEGA_EMBEDDING_*`, `HF_HUB_OFFLINE` and `OMEGA_RERANKER_AUTODOWNLOAD`. The lesson writer accepts only vectors of length 1024 (`lessons_store.checked_embedding`).

Файлы:

- **Реестр агентов** (YAML по `AGENTS_REGISTRY`). Схема `shema: 1`, список `agenty`. Каждая запись содержит `imya` (маска `[-a-z0-9_]`) и `namerenie` с полями:
  - `dom` — абсолютный путь, не `/` и не ссылка;
  - `polzovatel`;
  - `uroki_file` — файл `UROKI-*.md`, который лежит прямо в `dom`; без поля агент получает отказ;
  - `raskladka.otlichiya.parametry.GOST: true` — гость: его уроки получают пометку `[ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ]`;
  - `sluzhba` — нужна только `svyazat_zadnim.py --v-boj`.
- **Локальная база агента**: `<dom>/pamyat/pamyat.db`.
- **Профиль агента**: `<dom>/.dsh/profiles/web/cordis.patch.yml`. Чистка берёт из него `config.ignoreAfterMs` плагина `dsh-pamyat-restore` (срок брифинга). Если значения нет или их несколько, агент получает статус `slepota`.
- **`<state>/chistka.json`**: только `{"primenyat": true}` включает боевую чистку, любое другое содержимое оставляет её сухой. Если файл не разбирается как JSON, обрывается вся ступень.
- **Источники судьи**: `/var/lib/omega/.omega/omega.db` и журнал `kandidaty-vytesneniya.jsonl` рядом с ней. Пути зашиты в `runner.py`.
- **Ключ модели**: `prepare_key.py` читает запись `pass` `api/deepseek` от учётной записи `coders` (`runuser`, `env -i`, `prlimit --fsize=65536`, предел 20 с).

Files:

- **Agent registry** (YAML at `AGENTS_REGISTRY`). Schema `shema: 1`, list `agenty`. Each entry has `imya` (mask `[-a-z0-9_]`) and `namerenie` with these fields:
  - `dom` — an absolute path, not `/` and not a symlink;
  - `polzovatel`;
  - `uroki_file` — a `UROKI-*.md` file located directly in `dom`; without it the agent is refused;
  - `raskladka.otlichiya.parametry.GOST: true` — a guest agent: its lessons get the mark `[ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ]` (guest data — risk — not an instruction);
  - `sluzhba` — needed only by `svyazat_zadnim.py --v-boj`.
- **Agent local database**: `<dom>/pamyat/pamyat.db`.
- **Agent profile**: `<dom>/.dsh/profiles/web/cordis.patch.yml`. Cleanup reads `config.ignoreAfterMs` of the `dsh-pamyat-restore` plugin from it (the briefing window). If the value is missing or there are several, the agent gets status `slepota`.
- **`<state>/chistka.json`**: only `{"primenyat": true}` turns on live cleanup; any other content keeps it dry. If the file does not parse as JSON, the whole stage aborts.
- **Judge sources**: `/var/lib/omega/.omega/omega.db` and the journal `kandidaty-vytesneniya.jsonl` next to it. Both paths are hard-coded in `runner.py`.
- **Model key**: `prepare_key.py` reads the `pass` entry `api/deepseek` as the `coders` account (`runuser`, `env -i`, `prlimit --fsize=65536`, 20 s limit).

Аргументы:

| Команда | Значит |
|---|---|
| `runner.py --run \| --heartbeat [--state-dir DIR]` | Один прогон или проверка живости. По умолчанию `DIR` = `/var/lib/dsh-pamyat-obsluzhivanie`. Каталог, совпадающий с `/` или содержащий базу или журнал, отвергается (`state_contains_source`) |
| `heartbeat.py [--state-dir DIR]` | Root-копия проверки живости, запускать через `/usr/bin/python3 -I -S -B` |
| `prepare_key.py prepare \| remove` | Положить ключ до прогона или удалить после. Только от root |
| `prosmotreno.py spisok \| otmetit КЛЮЧ КТО ПОЧЕМУ \| snyat КЛЮЧ КТО ПОЧЕМУ` | Ручные отметки пар, запускать от `omega` |
| `chistka.py vernut <база> <страховка>` | Вернуть стёртый текст из страховки |
| `svyazat_zadnim.py --agent ИМЯ (--suho \| --v-boj \| --otkat СПИСОК) [--state] [--db] [--omega-db] [--kopiya-v] [--spisok-v] [--perechen] [--pri-zhivoj-sluzhbe ПРИЧИНА]` | Разовый проход связей. Коды: 0 — сделано, 1 — есть пропуски, 2 — отказ до действия |

Arguments:

| Command | Meaning |
|---|---|
| `runner.py --run \| --heartbeat [--state-dir DIR]` | One run, or a liveness check. `DIR` defaults to `/var/lib/dsh-pamyat-obsluzhivanie`. A directory equal to `/` or containing the database or the journal is rejected (`state_contains_source`) |
| `heartbeat.py [--state-dir DIR]` | Root copy of the liveness check; run with `/usr/bin/python3 -I -S -B` |
| `prepare_key.py prepare \| remove` | Place the key before a run or remove it afterwards. Root only |
| `prosmotreno.py spisok \| otmetit KEY WHO WHY \| snyat KEY WHO WHY` | Manual pair marks; run as `omega` |
| `chistka.py vernut <db> <backup>` | Restore erased text from a backup |
| `svyazat_zadnim.py --agent NAME (--suho \| --v-boj \| --otkat LIST) [--state] [--db] [--omega-db] [--kopiya-v] [--spisok-v] [--perechen] [--pri-zhivoj-sluzhbe REASON]` | One-off link pass. Exit codes: 0 — done, 1 — some pairs skipped, 2 — refused before acting |

Пределы зашиты в код. Менять их можно только правкой кода; полный перечень — в `docs/SETTINGS.md`.

The limits are hard-coded. They can be changed only by editing the code; the full list is in `docs/SETTINGS.md`.

| Ступень и файл | Пределы |
|---|---|
| Счёт памяти (`memory_count.py`) | 5 с на базу, 60 с на ступень |
| Уроки (`lessons.py`) | `MAX_NEW` 400 блоков за проход, `MAX_FILE` 8 МиБ на файл уроков, 900 с на ступень |
| Чистка (`chistka.py`) | `POROG` 1000 последних записей с текстом не трогаются, `PREDEL` 500 стираний за проход на агента, `KEEP` 3 страховки на агента, 900 с на ступень |
| Судья (`judge.py`) | `MAX_CALLS` 500 вызовов модели за сутки UTC; `MAX_INPUT_BYTES` 16000; `MAX_OUTPUT_TOKENS` 512; `MODEL` `deepseek-flash`; пары из журнала — расстояние ≤ `V1_MAX_DIST` 0,10; соседи по векторам — до 8 на запись со сходством ≥ `SOSED_MIN_SIM` 0,92; `NEDELYA_DNEJ` 7; `SBOI_NOCHEJ` 3; 1800 с на ступень |
| Сводка (`runner.py`) | `OSHIBOK_MODELI_DOLYA` 0,10: при такой доле сбоев модели прогон получает `error`, а не `finding` |
| Heartbeat (`heartbeat.py`) | `MASK_LIMIT_DAYS` 3; окно прогона 01:00–02:05 UTC |

| Stage and file | Limits |
|---|---|
| Memory count (`memory_count.py`) | 5 s per database, 60 s per stage |
| Lessons (`lessons.py`) | `MAX_NEW` 400 blocks per pass, `MAX_FILE` 8 MiB per lesson file, 900 s per stage |
| Cleanup (`chistka.py`) | `POROG`: the latest 1000 records with text are never touched; `PREDEL`: 500 erasures per pass per agent; `KEEP`: 3 backups per agent; 900 s per stage |
| Judge (`judge.py`) | `MAX_CALLS` 500 model calls per UTC day; `MAX_INPUT_BYTES` 16000; `MAX_OUTPUT_TOKENS` 512; `MODEL` `deepseek-flash`; journal pairs: distance ≤ `V1_MAX_DIST` 0.10; vector neighbours: up to 8 per record with similarity ≥ `SOSED_MIN_SIM` 0.92; `NEDELYA_DNEJ` 7; `SBOI_NOCHEJ` 3; 1800 s per stage |
| Summary (`runner.py`) | `OSHIBOK_MODELI_DOLYA` 0.10: at this share of failed model calls the run is `error` rather than `finding` |
| Heartbeat (`heartbeat.py`) | `MASK_LIMIT_DAYS` 3; run window 01:00–02:05 UTC |

## Проверка · Verification

`npm test` запускает `node test/stend-obsluzhivaniya.mjs`. Стенд:

1. проверяет `/opt/omega/venv/bin/python3 -B -c 'import numpy, sqlite_vec'` (предел 10 с);
2. запускает `/opt/omega/venv/bin/python3 -B -m unittest discover -s test -p 'test_*.py' -v` с `PYTHONDONTWRITEBYTECODE=1` и `OPENBLAS_NUM_THREADS=1` (предел 110 с).

`npm test` runs `node test/stend-obsluzhivaniya.mjs`. The bench:

1. checks `/opt/omega/venv/bin/python3 -B -c 'import numpy, sqlite_vec'` (10 s limit);
2. runs `/opt/omega/venv/bin/python3 -B -m unittest discover -s test -p 'test_*.py' -v` with `PYTHONDONTWRITEBYTECODE=1` and `OPENBLAS_NUM_THREADS=1` (110 s limit).

Коды возврата стенда:

| Код | Значит |
|---|---|
| 0 | все тесты прошли |
| 1 | тест упал или стенд не запустился, в том числе вышел предел 110 с |
| 2 | СЛЕПОТА: нет Python OMEGA, `numpy` или `sqlite_vec` |

Bench exit codes:

| Code | Meaning |
|---|---|
| 0 | all tests passed |
| 1 | a test failed or the bench failed to run, including hitting the 110 s limit |
| 2 | СЛЕПОТА (blindness): OMEGA Python, `numpy` or `sqlite_vec` missing |

Python-тесты можно запустить и без npm, той же командой `unittest discover` интерпретатором `/opt/omega/venv/bin/python3 -B`. В `test/` 19 файлов `test_*.py` и 142 метода `test_*` (подсчитано по коду). Модель, доставка, базы и ключи в тестах подставные. Особенности:

- Тестам счёта памяти и `local_lessons` нужно ядро `dsh-pamyat-core`, доступное Node по имени пакета. Пакет его зависимостью не объявляет, поэтому вне общего `node_modules` (например, в рабочем дереве) эти тесты не проходят. Подробнее — `docs/TROUBLESHOOTING.md`.
- Тесту маски в `test_runner.py` нужен `systemctl` на машине.
- Стенд не запускает `test/security-root.py` и `test/proba-root-paths.sh`. Им нужен root и отдельное пространство монтирования: `proba-root-paths.sh <каталог пакета> <каталог улик>` запускается только через `unshare --mount --net`, иначе отказывает с кодом 2.

The Python tests can also run without npm, using the same `unittest discover` command with `/opt/omega/venv/bin/python3 -B`. `test/` holds 19 `test_*.py` files with 142 `test_*` methods (counted in the code). The model, delivery, databases and keys are stubs in the tests. Notes:

- The memory count and `local_lessons` tests need the `dsh-pamyat-core` core, resolvable by Node by package name. The package does not declare it as a dependency, so outside a shared `node_modules` (for example, in the working tree) these tests do not pass. Details: `docs/TROUBLESHOOTING.md`.
- The mask test in `test_runner.py` needs `systemctl` on the host.
- The bench does not run `test/security-root.py` or `test/proba-root-paths.sh`. They need root and a separate mount namespace: `proba-root-paths.sh <package dir> <evidence dir>` must be started through `unshare --mount --net`; otherwise it refuses with exit 2.

Проверка на машине, только чтение:

- `sudo /usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py` (или `runner.py --heartbeat`). Коды:
  - 0 — прогон прошёл и итог доставлен, прогон идёт в срок или таймер замаскирован меньше 3 суток;
  - 1 — красное: маска старше предела, прогон просрочен или его нет, статус не `ok`/`finding`, доставка не `accepted`;
  - 2 — не измерено.
- Коды `runner.py --run`:
  - 0 — `ok`, `finding` или `disabled`;
  - 1 — `error` или `timeout`;
  - 2 — исход доставки итога, недельной выдачи или строки «уроки без связи» неизвестен;
  - 3 — `busy`, замок держит другой прогон.
- Где смотреть итог: файл `/var/lib/dsh-pamyat-obsluzhivanie/latest.json` (поля `status` и `delivery`) и `journalctl -u dsh-pamyat-obsluzhivanie.service`.
- Совпадение root-копий с пакетом: `cmp /usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py /opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/heartbeat.py`, и так же для `prepare_key.py`.

On-machine checks, read-only:

- `sudo /usr/bin/python3 -I -S -B /usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py` (or `runner.py --heartbeat`). Exit codes:
  - 0 — the run completed and the summary was delivered, a run is in progress within its limit, or the timer has been masked for less than 3 days;
  - 1 — red: the mask is older than the limit, the run is overdue or missing, the status is not `ok`/`finding`, or delivery is not `accepted`;
  - 2 — not measured.
- `runner.py --run` exit codes:
  - 0 — `ok`, `finding` or `disabled`;
  - 1 — `error` or `timeout`;
  - 2 — the delivery outcome of the summary, the weekly listing or the "lessons without link" line is unknown;
  - 3 — `busy`, another run holds the lock.
- Where to read the result: `/var/lib/dsh-pamyat-obsluzhivanie/latest.json` (fields `status` and `delivery`) and `journalctl -u dsh-pamyat-obsluzhivanie.service`.
- Root copies against the package: `cmp /usr/local/lib/dsh-pamyat-obsluzhivanie/heartbeat.py /opt/agent-plugins/node_modules/dsh-pamyat-obsluzhivanie/src/heartbeat.py`, and the same for `prepare_key.py`.

## Ограничения · Limitations

- Судья только предлагает: вердикты не применяются, записи не сливаются и не удаляются. Смысл вердикта не проверяется, проверяется только форма ответа.
- The judge only proposes: verdicts are not applied, and records are not merged or deleted. The meaning of a verdict is not checked, only the shape of the answer.
- Судья не ловит:
  - секреты без узнаваемого префикса: фильтр `SECRET` ограничен, и такие тексты уходят модели;
  - пары из разных корней;
  - пары за пределами 8 соседей или со сходством ниже 0,92;
  - строки журнала с расстоянием больше 0,10;
  - записи без векторов: они только считаются.
- The judge does not catch:
  - secrets without a recognisable prefix: the `SECRET` filter is limited, and such texts go to the model;
  - pairs across roots;
  - pairs beyond 8 neighbours or with similarity below 0.92;
  - journal rows with distance above 0.10;
  - records without vectors: they are only counted.
- Пороги 0,10 и 0,92 отсекают дальние пары вслепую: доля противоречий среди отсечённых пар не измерена.
- The 0.10 and 0.92 thresholds cut far pairs blindly: the share of contradictions among the cut pairs has not been measured.
- Пары с признаком секрета и пары длиннее 16000 байт модели не отдаются. Они ждут отметки человека через `prosmotreno.py`.
- Pairs with a secret sign and pairs over 16000 bytes are never sent to the model. They wait for a human mark through `prosmotreno.py`.
- Маска не отменяет запросы к модели, которые уже отправлены, и не возвращает их резерв в дневном лимите.
- A mask does not cancel model requests already sent and does not return their reservation in the daily limit.
- Доставка итога пробуется один раз. Код 0 от `agent-alert` значит только, что канал принял вызов, а не что итог прочитан.
- Summary delivery is tried once. Exit 0 from `agent-alert` only means the channel accepted the call, not that anyone read the summary.
- Счёт памяти проверяет форму чисел ядра, но не их смысл. Изменения базы после снимка транзакции он не видит.
- The memory count checks the shape of the core's numbers, not their meaning. It does not see database changes after the transaction snapshot.
- Ступень уроков не ловит:
  - правку файла уроков, после которой не изменились ни размер, ни `mtime_ns`;
  - правку, сделанную после прохода: её увидит следующий проход как `source_rewritten`.
- The lessons stage does not catch:
  - a lesson file edit that changed neither size nor `mtime_ns`;
  - an edit made after the pass: the next pass sees it as `source_rewritten`.
- Писатели OMEGA, которые не берут `uroki-exact-writer.lock`, могут создать дубль. `integrity` находит только дубли с одинаковым `source_key` и не схлопывает их.
- OMEGA writers that do not take `uroki-exact-writer.lock` can create a duplicate. `integrity` finds only duplicates with the same `source_key` and does not merge them.
- Чистка не ловит:
  - удаление записи в OMEGA после стирания её текста: тогда текст остаётся только в страховке, а страховок хранится 3 последних на агента;
  - смену смысла записи в OMEGA при том же узле.
- Cleanup does not catch:
  - deletion of a record in OMEGA after its text was erased: the text then survives only in a backup, and only the latest 3 backups per agent are kept;
  - a change of meaning in OMEGA under the same node.
- Ротации каталога состояния нет.
- The state directory is never rotated.
- Окно 01:00–02:05 UTC в `heartbeat.py` задано числами и не сверяется с `OnCalendar` таймера.
- The 01:00–02:05 UTC window in `heartbeat.py` is literal numbers and is not checked against the timer's `OnCalendar`.
- Пути зашиты в код и юнит под раскладку машины:
  - `/opt/omega/venv/bin/python3`, `/var/lib/omega/.omega/omega.db`, `/var/lib/dsh-pamyat-obsluzhivanie`;
  - `/usr/local/bin/node`, `/usr/local/bin/agent-alert`, `/usr/local/lib/dsh-pamyat-obsluzhivanie/`;
  - учётные записи `omega` и `coders`, запись `pass` `api/deepseek`;
  - адрес `https://api.deepseek.com/chat/completions`.
- Paths are hard-coded in the code and the unit for this machine's layout:
  - `/opt/omega/venv/bin/python3`, `/var/lib/omega/.omega/omega.db`, `/var/lib/dsh-pamyat-obsluzhivanie`;
  - `/usr/local/bin/node`, `/usr/local/bin/agent-alert`, `/usr/local/lib/dsh-pamyat-obsluzhivanie/`;
  - the `omega` and `coders` accounts, the `pass` entry `api/deepseek`;
  - the URL `https://api.deepseek.com/chat/completions`.
- Зависимости:
  - systemd;
  - системный `/usr/bin/python3`, только стандартная библиотека (root-помощники);
  - Python 3.12+ окружения OMEGA с `numpy`, `sqlite_vec`, `PyYAML` и пакетом `omega`. Писатель уроков сверяет sha256 файла `_store.py` поставки OMEGA с закреплённой суммой (`REVIEW_STORE_SHA`), при несовпадении отказывает (`omega_store_hash_mismatch`);
  - Node с `node:sqlite` и ядро `dsh-pamyat-core` в том же `node_modules`. Для чистки ядро должно заводить поле `zapisi.vychishcheno`;
  - `agent-alert`, `pass` и `gpg` у учётной записи `coders`, ключ API DeepSeek, сеть до API.
- Dependencies:
  - systemd;
  - the system `/usr/bin/python3`, standard library only (root helpers);
  - the OMEGA Python 3.12+ env with `numpy`, `sqlite_vec`, `PyYAML` and the `omega` package. The lesson writer compares the sha256 of OMEGA's shipped `_store.py` with a pinned value (`REVIEW_STORE_SHA`) and refuses on a mismatch (`omega_store_hash_mismatch`);
  - Node with `node:sqlite`, and the `dsh-pamyat-core` core in the same `node_modules`. For cleanup the core must create the `zapisi.vychishcheno` field;
  - `agent-alert`, `pass` and `gpg` for the `coders` account, a DeepSeek API key, network access to the API.

Python 3.12 — минимальная версия этого выпуска: judge.py использует новую грамматику f-строк. До установки проверьте версию именно интерпретатора venv OMEGA на копии.

Python 3.12 is the minimum for this release: judge.py uses the newer f-string grammar. Check the actual isolated OMEGA venv interpreter version before installation.

Журнал V1 рядом с omega.db — обязательная предпосылка. Его пишет локальная правка record_supersession_candidate в хранилище OMEGA (не этот пакет); без неё обычная поставка может не создавать kandidaty-vytesneniya.jsonl. Отсутствие/порча — error:journal, вызовов модели — 0, а не пустая очередь. Настройку писателя согласует владелец поставки OMEGA; создавать пустой журнал ради зелёного нельзя.

The V1 journal beside omega.db is required. It is written by the local record_supersession_candidate store patch, outside this package; an ordinary upstream install may not create kandidaty-vytesneniya.jsonl. Missing/corrupt means error:journal and 0 model calls, not an empty queue. Agree on the writer with the OMEGA deployment owner; do not fake readiness by creating an empty journal.

Фикстура test/fixtures/v1-store.py — точная закреплённая редакция _store.py c587490f…; test_store_fixture.py проверяет совпадение с REVIEW_STORE_SHA и отказ Writer при другой сумме импортированного модуля до открытия БД. Код OMEGA сохраняет свою upstream-лицензию (fixtures/LICENSE-OMEGA.txt); свой код пакета — MIT.

The v1-store.py fixture is the exact pinned _store.py revision c587490f…; test_store_fixture.py verifies REVIEW_STORE_SHA equality and refusal on a different imported-module hash before DB opening. OMEGA code retains its upstream license (fixtures/LICENSE-OMEGA.txt); this package's own code is MIT.

Действующая маска ночного таймера сохраняется: установка этого выпуска не разрешает снять её или начать ручной боевой прогон. Для такой смены режима нужно отдельное прямое поручение владельца; стенды используют копии, сеть моделей отключена.

The current nightly-timer mask remains in place. Installing this release does not authorize unmasking it or manually running live maintenance. A mode change needs a separate direct owner instruction; stands use copies with model networking disabled.
