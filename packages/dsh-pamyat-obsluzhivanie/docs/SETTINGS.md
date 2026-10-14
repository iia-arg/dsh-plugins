# Настройки · Settings — dsh-pamyat-obsluzhivanie

Настройки службы трёх видов: то, что меняет человек без правки кода (файлы в каталоге состояния, реестр, юнит, переменные окружения); пределы, зашитые в код; пути под раскладку авторов. Имена ключей и переменных — как в коде: это интерфейс.

The service has three kinds of settings: what a human changes without editing code (files in the state directory, the registry, the unit, environment variables); limits hard-coded in the code; paths fixed for the authors' layout. Key and variable names are given as in the code: they are the interface.

## Выключатели в каталоге состояния · Switches in the state directory

<a id="chistka-json"></a>
### `chistka.json`

| Поле · Field | Тип · Type | Умолчание · Default | Значит · Meaning |
|---|---|---|---|
| `primenyat` | bool | файла нет → сухой режим · no file → dry mode | `true` — боевая чистка: стирать текст, со страховкой · `true` — real cleanup: erase text, with a backup |

Пример · Example: `echo '{"primenyat": true}' > <state-dir>/chistka.json` (владелец — `omega`, права 0600 · owner `omega`, mode 0600).

Боевой режим включается только строгим `true`: строка `"true"`, `1` или любое другое значение оставляют режим сухим. Битый JSON — ошибка ступени чистки, а значит и общий статус `error`. Выключить — удалить файл.

Real mode turns on only with a strict `true`: the string `"true"`, `1` or any other value keeps it dry. Broken JSON is a cleanup-stage error, and so the overall status becomes `error`. To switch off, delete the file.

### `judge/prosmotreno.json`

Отметки «просмотрено человеком» для пар, которые модели не отдаются (секрет или длина). Руками не правится — только командой `src/prosmotreno.py` (см. [GUARDS.md](GUARDS.md#prosmotreno)). Формат — `{"version": 1, "pary": {<ключ пары>: {kto, kogda, pochemu, a, b}}}`. Неизвестный формат — судья отказывает, а не угадывает, что отметил человек.

"Reviewed by a human" marks for pairs never sent to the model (secret or length). Not edited by hand — only via `src/prosmotreno.py` (see [GUARDS.md](GUARDS.md#prosmotreno)). Format: `{"version": 1, "pary": {<pair key>: {kto, kogda, pochemu, a, b}}}`. An unknown format makes the judge refuse rather than guess what the human marked.

## Реестр агентов · Agent registry

Файл YAML (путь в коде — `REGISTRY`, см. [пути](#paths)). Ступени берут из него список агентов. Требуемая форма:

A YAML file (code path `REGISTRY`, see [paths](#paths)). The stages take the list of agents from it. Required shape:

```yaml
shema: 1
agenty:
  - imya: agent-one                 # [-a-z0-9_]+
    namerenie:
      dom: /opt/<agent-home>        # абсолютный, не «/» · absolute, not "/"
      polzovatel: agent-one
      uroki_file: /opt/<agent-home>/UROKI-AGENT-ONE.md
      raskladka:
        otlichiya:
          parametry:
            GOST: true              # только для агента-гостя · guest agents only
```

| Ключ · Key | Тип · Type | Умолчание · Default | Значит · Meaning | Что сломается · What breaks |
|---|---|---|---|---|
| `shema` | int | — | версия схемы, должна быть 1 · schema version, must be 1 | иначе отказ `registry_schema` для всех ступеней · otherwise `registry_schema` refusal for every stage |
| `imya` | str | — | имя агента; уникально · agent name; unique | недопустимые символы — `registry_agent_invalid`; повтор — `registry_agent_duplicate_or_empty` · bad characters or repeats refuse the whole registry |
| `namerenie.dom` | str | — | дом агента; база — `<dom>/pamyat/pamyat.db` · agent home; DB is `<dom>/pamyat/pamyat.db` | не абсолютный или ссылка — отказ по агенту · not absolute or a symlink — refusal for that agent |
| `namerenie.uroki_file` | str | нет · none | точный файл уроков: прямо в `dom`, имя `UROKI-*.md` · exact lesson file: directly in `dom`, named `UROKI-*.md` | нет — `registry_source_unmapped`; другой каталог или имя — `registry_source_invalid` · missing or misplaced — refusal for that agent |
| `…raskladka.otlichiya.parametry.GOST` | bool | `false` | агент-гость: уроки получают пометку · guest agent: lessons get a mark | строго `true`; иначе урок гостя ляжет без пометки · strictly `true`; otherwise a guest lesson is stored unmarked |

## Юнит и таймер systemd · systemd unit and timer

| Настройка · Setting | Значение · Value | Что сломается · What breaks |
|---|---|---|
| `OnCalendar` (timer) | `*-*-* 04:00:00 Europe/Moscow` (= 01:00 UTC) | heartbeat ждёт прогон после 01:00 UTC и считает его пропущенным после 02:05 UTC; другое время даст ложный «пропущен» · heartbeat expects a run after 01:00 UTC and flags it missing after 02:05 UTC; another time gives a false "missing" |
| `Persistent` | `true` | пропущенный из-за выключения прогон выполнится при старте · a run missed while off runs at boot |
| `User`/`Group` | `omega` | писатель уроков отказывает не под `omega` (`assert_omega`) · the lesson writer refuses unless running as `omega` |
| `TimeoutStartSec` | `60min` | меньше суммы ступеней — служба будет убита до итога · less than the stage total — the service is killed before the summary |
| `MemoryMax` | `4G` | один настоящий вектор занимал около 1,56 ГБ; 1 ГБ мало · one real embedding took about 1.56 GB; 1 GB is too little |
| `LoadCredential` | `alert-token`, `alert-chat` — во вставке машины, не в юните пакета · in the machine drop-in, not in the package unit | без них доставка невозможна, старт не разрешается · without them delivery is impossible and start is refused |
| `ExecStartPre` / `ExecStopPost` | `prepare_key.py prepare` / `remove` (root) | без ключа судья не зовёт модель (`invalid credential`) · without a key the judge cannot call the model |
| `Environment=OMEGA_EMBEDDING_*`, `HF_HUB_OFFLINE=1`, `OMEGA_RERANKER_AUTODOWNLOAD=0` | как у действующей OMEGA · as in the live OMEGA | другая модель или размер вектора — уроки отказывают на проверке вектора (ждут 1024) · another model or dimension makes lessons fail the vector check (1024 expected) |

<a id="machine"></a>
## Настройки машины · Machine settings

Данные конкретной машины не зашиты ни в код, ни в юнит пакета: их задаёт вставка юнита машины (`/etc/systemd/system/dsh-pamyat-obsluzhivanie.service.d/<имя>.conf`). Без неё служба не стартует (нет `OBSL_RUNNER`) либо ступени отказывают с именем причины.

Machine-specific data is hard-coded neither in the code nor in the package unit: a machine unit drop-in sets it (`/etc/systemd/system/dsh-pamyat-obsluzhivanie.service.d/<name>.conf`). Without it the service does not start (no `OBSL_RUNNER`) or stages refuse naming the cause.

| Настройка · Setting | Значит · Meaning | Не задана · Unset |
|---|---|---|
| `LoadCredential=alert-token:<файл>`, `alert-chat:<файл>` | токен и чат канала тревог · alert channel token and chat | доставка тревог невозможна · alert delivery impossible |
| `AGENTS_REGISTRY` | путь реестра агентов (YAML) · agent registry path | `registry_not_set` в ступенях уроков, счёта и уборки · in the lessons, count and cleanup stages |
| `OBSL_KLYUCH_HOME` | дом учётной записи хранилища ключа; `GNUPGHOME` = его `.gnupg` · home of the key store account | `credential_source_not_set`, ключа нет, старт не удаётся · no key, start fails |
| `OBSL_KLYUCH_HRANILISHCHE` | каталог хранилища `pass` · `pass` store directory | то же · same |
| `OBSL_RUNNER` | путь установленного `src/runner.py` для `ExecStart` · installed `src/runner.py` path for `ExecStart` | `ExecStart` без пути — служба не стартует · no path — the service does not start |

## Переменные окружения · Environment variables

| Имя · Name | Кто читает · Read by | Умолчание · Default | Значит · Meaning |
|---|---|---|---|
| `DEEPSEEK_CREDENTIAL_FILE` | `judge.DeepSeek` | обязательна · required | файл ключа: одна строка ≤ 4096 байт, без NUL · key file: one line ≤ 4096 bytes, no NUL |
| `AGENT_ALERT_TOKEN_FILE`, `AGENT_ALERT_CHAT_FILE` | `agent-alert` | задаёт юнит через `%d` · set by the unit via `%d` | доставка итога · summary delivery |
| `PROSMOTRENO_STATE` | `prosmotreno.py` | каталог судьи в каталоге состояния · judge dir inside the state dir | где лежат отметки · where marks live |
| `PROSMOTRENO_DB` | `prosmotreno.py` | база OMEGA · OMEGA DB | откуда брать записи пар · where pair records come from |
| `PYTHONDONTWRITEBYTECODE`, `OPENBLAS_NUM_THREADS` | Python | `1` | без кэша байткода в пакете; один поток BLAS · no bytecode cache in the package; one BLAS thread |

## Командная строка · Command line

| Команда · Command | Значит · Meaning |
|---|---|
| `runner.py --run [--state-dir DIR]` | один прогон · one run |
| `runner.py --heartbeat [--state-dir DIR]` | проверка живости без root-копии (только чтение) · liveness check without the root copy (read-only) |
| `heartbeat.py` | то же для root-сторожа · the same for the root watchdog |
| `prepare_key.py prepare \| remove` | ключ до старта / удаление после · key before start / removal after |
| `prosmotreno.py spisok \| otmetit КЛЮЧ КТО ПОЧЕМУ \| snyat КЛЮЧ КТО ПОЧЕМУ` | отметки человека · human marks |
| `svyazat_zadnim.py --agent ИМЯ (--suho \| --v-boj \| --otkat СПИСОК) [--state FILE] [--db FILE] [--omega-db FILE] [--kopiya-v DIR] [--spisok-v DIR] [--perechen] [--pri-zhivoj-sluzhbe ПРИЧИНА]` | Проверка/связка/откат; 0 сделано,1 пропуски,2 отказ до действия. В --v-boj нужен namerenie.sluzhba, живая служба требует отдельной причины · inspect/link/rollback; 0 done,1 skips,2 refusal before action; apply needs service identity and an explicit override reason for a live service |
| `dsh-pamyat-obsluzhivanie --run \| --heartbeat [--state-dir DIR]` | npm bin-ссылка на src/runner.py; shebang /opt/omega/venv/bin/python3, Python 3.12+ и полная раскладка; вне её запускайте копию явно подходящим Python · npm bin link, fixed venv shebang, Python 3.12+ and complete layout required |
| `chistka.py vernut <база> <страховка>` | вернуть стёртый текст из страховки · restore erased text from a backup |

Неизвестные аргументы отвергаются. `--state-dir` маску таймера не обходит, а каталог, содержащий базу OMEGA или журнал, отвергается (`state_contains_source`).

Unknown arguments are rejected. `--state-dir` does not bypass the timer mask, and a directory that contains the OMEGA database or the journal is rejected (`state_contains_source`).

## Пределы, зашитые в код · Limits hard-coded in the code

Менять — только правкой кода с приёмкой; числа ниже названы, чтобы их было видно.

Changing them requires a code edit with acceptance; the numbers are listed so they are visible.

| Константа · Constant | Файл · File | Значение · Value | Значит · Meaning |
|---|---|---|---|
| `MAX_CALLS` | judge | 500 (было 40; B-N-1618 r2) | вызовов модели за сутки UTC · model calls per UTC day |
| `MAX_INPUT_BYTES` | judge | 16000 | длиннее — пара не отдаётся модели · longer pairs are not sent to the model |
| `MAX_OUTPUT_TOKENS` | judge | 512 | предел ответа модели · model answer limit |
| `MAX_JOURNAL_BYTES` | judge | 64 MiB | предел журнала вытеснения · eviction journal limit |
| `JOURNAL_WAIT_SECONDS` | judge | 10 | ожидание замка писателя журнала · wait for the journal writer's lock |
| `MODEL` | judge | `deepseek-flash` | модель судьи · judge model |
| соседей / близость · neighbours / similarity | judge | 8 / ≥ 0,92 (`SOSED_MIN_SIM`); журнал V1 · V1 journal: dist ≤ 0,10 (`V1_MAX_DIST`) — B-N-1618 r2 | поиск пар по векторам · vector pair search |
| `MAX_FILE` | lessons | 8 MiB | предел файла уроков · lesson file limit |
| `MAX_NEW` | lessons | 400 | блоков за проход · blocks per pass (до 1.1.20 — 200) |
| `POROG` | chistka | 1000 | последних записей с текстом не трогать · latest records with text kept |
| `PREDEL` | chistka | 500 | стираний за проход · erasures per pass |
| `KEEP` | chistka | 3 | страховок на агента · backups per agent |
| `MASK_LIMIT_DAYS` | heartbeat | 3 | маска старше — красное · an older mask is red |
| окно прогона · run window | heartbeat | 01:00–02:05 UTC | ожидаемое время завершения · expected completion time |
| пределы ступеней · stage limits | runner | 60 / 900 / 900 / 1800 с · s | счёт / уроки / чистка / судья · count / lessons / cleanup / judge |

<a id="paths"></a>
## Пути под раскладку авторов · Paths fixed for the authors' layout

Эти пути записаны в коде и юните и переменными не меняются; данные машины вынесены в [Настройки машины](#machine). На другой машине их нужно либо воспроизвести, либо править код.

These paths are written into the code and the unit and cannot be changed by variables; machine data lives in [Machine settings](#machine). On another machine they must either be reproduced or the code edited.

| Путь · Path | Где · Where | Что · What |
|---|---|---|
| `<state-dir>` | runner (`STATE`), heartbeat | каталог состояния = каталог `StateDirectory` юнита в `/var/lib`; меняется `--state-dir` · state dir = the unit's `StateDirectory` under `/var/lib`; `--state-dir` overrides |
| `/var/lib/omega/.omega/omega.db` | runner, lessons, prosmotreno | база OMEGA · OMEGA DB |
| `/opt/omega/venv/bin/python3` | юнит, стенд · unit, stand | Python окружения OMEGA · OMEGA env Python |
| `/usr/local/lib/dsh-pamyat-obsluzhivanie/` | юнит · unit | root-копии помощников · root helper copies |
| `/run/dsh-pamyat-obsluzhivanie-key/deepseek` | prepare_key, юнит · unit | ключ модели на время прогона · model key for the run |
| `<dom>/.dsh/profiles/web/cordis.patch.yml` | chistka | restore.ignoreAfterMs; порог чистки берётся из профиля · cleanup cutoff comes from this profile |
| `<state-dir>/judge/vydacha-<день>.json` | judge, runner | тексты памяти, 0600; после отказа остаётся для ручного разбора; автоматического повтора нет · memory texts, 0600; retained for manual review after delivery failure; no automatic retry |
| учётка `coders` · account `coders` | prepare_key (`runuser -u`) | от её имени читается `pass`; каталоги хранилища — настройки `OBSL_KLYUCH_*` (см. [Настройки машины](#machine)) · `pass` is read as this account; the store directories are the `OBSL_KLYUCH_*` settings (see [Machine settings](#machine)) |
| `/usr/local/bin/node`, `/usr/local/bin/agent-alert` | memory_count, lessons, runner, judge | Node и доставка · Node and delivery |

Предпосылки: Python 3.12+ окружения OMEGA; pass show api/deepseek исполняется от coders. OBSL_KLYUCH_HOME и OBSL_KLYUCH_HRANILISHCHE задают каталоги, но не меняют имя записи api/deepseek или учётку. Значение ключа не передавать в argv/лог. Журнал V1 — kandidaty-vytesneniya.jsonl рядом с omega.db; writer вне пакета, отсутствие означает error:journal, не пустую очередь.

Prerequisites: OMEGA Python 3.12+; pass show api/deepseek runs as coders. OBSL_KLYUCH_HOME/store settings choose directories without changing that entry name/account. Keep key values out of argv/logs. The external V1 writer creates kandidaty-vytesneniya.jsonl beside omega.db; missing means error:journal, not an empty queue.
