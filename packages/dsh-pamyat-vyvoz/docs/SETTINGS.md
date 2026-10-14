# Настройки · Settings — dsh-pamyat-vyvoz

У пакета нет файлов настроек и переменных окружения: всё задаётся аргументами вызова. Имена ключей — как в коде, это интерфейс.

The package has no settings files or environment variables: everything is passed as call arguments. Key names are given as in the code: they are the interface.

## CLI `vyvoz-pamyati` (только вывоз · export only)

| Ключ · Flag | Тип · Type | Умолчание · Default | Значит · Meaning | Что сломается · What breaks |
|---|---|---|---|---|
| `--baza <путь · path>` | путь · path | обязателен · required | база-источник: записи читаются только на чтение; в её журнал пишется одна строка-след · source DB: records read read-only; one trace line goes to its journal | нет ключа — код 2; база не открылась — код 2 · missing flag — exit 2; DB did not open — exit 2 |
| `--otkuda <имя · name>` | строка · string | обязателен · required | имя источника в заголовке файла · source name in the file header | нет или пусто — отказ `VYVOZ_NET_OTKUDA` · missing or empty — `VYVOZ_NET_OTKUDA` refusal |
| `--fajl <путь · path>` | путь · path | нет — проба · none — dry probe | куда писать файл · where to write the file | без него файл не создаётся, только отчёт · without it no file is created, only a report |
| `--yadro <путь · path>` | путь · path | поиск цепочкой · chain lookup | путь к `filtr-vhoda.js` ядра · path to the core's `filtr-vhoda.js` | неверный путь — отказ договора, код 2 · wrong path — contract refusal, exit 2 |
| `--agent <имя · name>` | строка · string | все · all | вывезти только записи этого агента · export only this agent's records | в базе нет поля `agent` — отказ `VYVOZ_OTBOR_NET_POLYA`, код 1 · DB has no `agent` field — refusal, exit 1 |
| `--klass <имя · name>` | строка · string | все · all | вывезти только этот класс · export only this class | в базе нет поля `klass` — тот же отказ, код 1 · DB has no `klass` field — the same refusal, exit 1 |
| `--s <время · time>` | мс epoch или дата ISO · ms epoch or ISO date | без нижней границы · no lower bound | записи не раньше · records not earlier than | не разобралось — код 2 (иначе вышел бы пустой отбор, неотличимый от «подходящего нет») · unparsable — exit 2 (otherwise an empty selection indistinguishable from "nothing matched") |
| `--po <время · time>` | то же · same | без верхней границы · no upper bound | записи не позже · records not later than | то же; у `--s`/`--po` без поля `sozdano` в базе — отказ `VYVOZ_OTBOR_NET_POLYA` · same; `--s`/`--po` without a `sozdano` field — `VYVOZ_OTBOR_NET_POLYA` |

Неизвестный ключ, ключ без значения, повтор ключа, аргумент без `--` — код 2 с текстом справки. `--help` и `--pomoshch` печатают справку и тоже возвращают 2.

An unknown flag, a flag without a value, a repeated flag, an argument without `--` — exit 2 with the help text. `--help` and `--pomoshch` print the help and also exit 2.

| Код CLI · CLI exit | Значит · Meaning |
|---|---|
| 0 | вывоз (или проба) состоялся · export (or probe) done |
| 1 | отказ по предмету: `VYVOZ_NEZNAKOMYJ_KLASS`, `VYVOZ_OTBOR_NET_POLYA` · refusal on the subject |
| 2 | слепота: нет ядра, база не открылась, аргументы не поняты, прочие отказы · blindness: no core, DB did not open, arguments not understood, other refusals |

## API

```js
import { vyvezti, otchyot, vvezti, otchyot_vvoza, VERSIYA_SHEMY, POLYA, NE_VYVOZITSYA } from 'dsh-pamyat-vyvoz';
```

| Функция · Function | Ключи · Keys | Значит · Meaning |
|---|---|---|
| `vyvezti(o)` | `baza`, `otkuda`, `fajl?`, `yadro?`, `otbor?`, `krik?` | вывоз; `otbor` = `{agent, klass, s, po}`; `krik` — куда печатать предупреждения (по умолчанию `console.error`) · export; `krik` is where warnings go (default `console.error`) |
| `vvezti(o)` | `baza`, `fajl`, `yadro?`, `krik?` | ввоз в базу-приёмник · import into the target DB |
| `otchyot(it)`, `otchyot_vvoza(it)` | итог вызова · call result | отчёт числами, без содержимого записей · numeric report, without record content |

Незнакомый ключ в объекте вызова — отказ `VYVOZ_NEIZVESTNYJ_KLYUCH`: опечатка в имени ключа иначе тихо отключила бы настройку.

An unknown key in the call object is refused with `VYVOZ_NEIZVESTNYJ_KLYUCH`: a typo in a key name would otherwise silently disable the setting.

Путь к ядру — строка. Передать сам модуль ядра вместо пути — отказ договора с подсказкой.

The core path is a string. Passing the core module itself instead of a path is a contract refusal with a hint.

<a id="fajl"></a>
## Файл вывоза · Export file

**Заголовок (первая строка) · Header (first line):**

| Поле · Field | Значит · Meaning |
|---|---|
| `vyvoz` | всегда `"dsh-pamyat"`; иначе ввоз отказывает `VYVOZ_NE_NASH_FAJL` · always `"dsh-pamyat"`; otherwise import refuses |
| `versiya_shemy` | версия формата, сейчас `2`; другая — отказ ввоза · format version, currently `2`; another is refused on import |
| `polya` | перечень переносимых полей записи · list of carried record fields |
| `polya_neizvestnye_vyvozu` | поля базы-источника, которых пакет не знает (если были) · source DB fields unknown to the package (if any) |
| `otkuda` | имя источника; пусто — отказ ввоза · source name; empty is refused on import |
| `uzel` | имя машины, где сделан вывоз · host where the export was made |
| `kogda` | время вывоза, мс epoch · export time, ms epoch |
| `zapisej`, `zaderzhano` | записей в файле и задержано фильтром · records in the file and held back by the filter |
| `ne_vyvozitsya` | что не вывозится и почему (`id`, `zhurnal`, `ochered_dolgovremennogo`, `nastrojki`, `kasanij`, `poslednee_kasanie`, `proverka`) · what is not exported and why |
| `summa` | `sha256:` + 32 знака по строкам записей; ввоз сверяет · `sha256:` + 32 hex over record lines; import checks it |

**Поля записи (`POLYA`) · Record fields (`POLYA`):**

| Поле · Field | Значит · Meaning |
|---|---|
| `agent`, `klass`, `soderzhim`, `istochnik`, `sozdano` | агент, класс, текст, источник, время создания · agent, class, text, source, creation time |
| `bez_podtverzhdeniya` | запись ждёт подтверждения; у класса `ogranichenie` при ввозе ставится всегда · record awaits confirmation; always set on import for class `ogranichenie` |
| `vera`, `ochistka`, `podozrenie` | служебные поля записи ядра — их смысл задаёт `dsh-pamyat-core` · core record service fields — their meaning is defined by `dsh-pamyat-core` |
| `ocenki`, `podtverzhdenie` | суждение человека о знании: кто оценил веру и почему, кто и когда подтвердил · a human's judgment of the knowledge: who scored trust and why, who confirmed and when |
| `proishozhdenie` | уровень происхождения записи; пустое у ввезённой записи значит «не установлено», а не «старше механизма» · record origin level; empty on an imported record means "not established", not "older than the mechanism" |

Задержанные записи в файл не попадают вовсе — ни текстом, ни пометкой.

Held-back records do not enter the file at all — neither as text nor as a mark.

## Проверка отбора и приёмника · Selection and receiver checks

`otbor` — обычный объект только с ключами `agent, klass, s, po`. Неизвестное имя: `VYVOZ_NEIZVESTNYJ_KLYUCH` до чтения базы. API `s`/`po` — конечное число миллисекунд epoch; строки (включая ISO), null, NaN и Infinity отказываются с `VYVOZ_OTBOR_TYPE`. undefined означает незаданную границу. Ноль и отрицательные epoch допустимы. CLI по-прежнему разбирает время из строки. Пустой объект намеренно означает все записи.

`otbor` is a plain object with only `agent, klass, s, po`. Unknown names refuse before reading the database. API time bounds are finite epoch-ms numbers; strings including ISO, null, NaN and Infinity refuse with `VYVOZ_OTBOR_TYPE`. Undefined is an unset bound; zero and negative epochs are valid. The CLI still parses string timestamps. An empty object intentionally selects all rows.

`pometka_filtra` — известная пометка транспорта, не сохраняется в БД. Ввоз заново фильтрует данные POLYA, неизвестные прочие поля по-прежнему называет. Приёмник должен уже существовать и быть инициализирован ядром; иначе `VYVOZ_BAZA_NE_SUSHHESTVUET`, пустая база не создаётся. Проверка существования не блокирует переименование/удаление пути другим процессом между проверкой и открытием SQLite; это не замок файлового пути.

`pometka_filtra` is known transport metadata, not persisted in the DB. Import rechecks POLYA data and still names all other unknown fields. The receiver must already exist and be initialized by the core; otherwise import refuses without creating an empty DB. The existence check does not lock the pathname against another process renaming/deleting it between the check and SQLite open.
