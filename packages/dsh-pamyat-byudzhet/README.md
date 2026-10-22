# dsh-pamyat-byudzhet

## Назначение · Purpose

Входящий бюджет памяти агента DSH: решает, сколько сохранённого знания поднять обратно в разговор, чтобы память не вытеснила сам разговор. Пакет — плагин cordis; при монтаже публикует службу `byudzhetPamyati`, которая отбирает переданные ей записи-кандидаты под предел в единицах своей меры («оценка наша», не токены платформы) и печатает в stderr, что поднято, что отброшено и по какой причине (`src/index.js`, `src/otbor.js`). Пакет отказывает, а не советует: неполный подъём объявляется вслух с названными причинами, чтобы «подняли не всё» не было неотличимо от «памяти нет». Расход контекста — не его дело, это соседний пакет `dsh-pamyat-nudzh`. Зовёт службу `dsh-pamyat-restore` при сборке welcome-брифинга (слой C).

The incoming memory budget of a DSH agent: it decides how much stored knowledge to raise back into the conversation so that memory does not crowd out the conversation itself. The package is a cordis plugin; on mount it publishes the `byudzhetPamyati` service, which selects the candidate records passed to it under a limit in units of its own measure ("оценка наша", our estimate, not platform tokens) and prints to stderr what was raised, what was dropped and why (`src/index.js`, `src/otbor.js`). The package refuses rather than advises: an incomplete raise is announced aloud with named reasons, so that "not everything was raised" is not indistinguishable from "there is no memory". Context spend is not its business — that is the sibling package `dsh-pamyat-nudzh`. The service is called by `dsh-pamyat-restore` when building the welcome briefing (layer C).

## Что ставится и куда · What gets installed and where

Состав пакета задаёт поле `files` в `package.json`: `src`, `test`, `docs`, `README.md`, `README.en.md`, `CHANGELOG.md`; `package.json` и `LICENSE` npm кладёт в архив сам, без упоминания в `files`. Точка входа — `src/index.js` (`main` и `exports["."]`).

The package contents are set by the `files` field in `package.json`: `src`, `test`, `docs`, `README.md`, `README.en.md`, `CHANGELOG.md`; npm adds `package.json` and `LICENSE` to the archive by itself, without a mention in `files`. The entry point is `src/index.js` (`main` and `exports["."]`).

| Файл · File | Что внутри · Contents |
|---|---|
| `src/index.js` | плагин cordis: `name`, схема `Config`, `apply` — проверка настроек, строка подъёма, служба `byudzhetPamyati`, вывод `krik` в stderr · the cordis plugin: `name`, the `Config` schema, `apply` — settings checks, the start-up line, the `byudzhetPamyati` service, `krik` output to stderr |
| `src/otbor.js` | `PORYADKI`, `otobrat` (сортировка и жадный проход), сводка отброса с причинами и свойствами · `PORYADKI`, `otobrat` (sorting and greedy pass), the drop summary with reasons and properties |
| `src/mera.js` | `SIMVOLOV_NA_EDINICU`, `ocenit` (цена записи), `sverit` (сверка с числом платформы) · `SIMVOLOV_NA_EDINICU`, `ocenit` (record cost), `sverit` (reconciliation with the platform number) |
| `src/teplo.js` | `teplo`, `raspredelenie` (прибор тепла и касаний), постоянные `POLURASPAD_MS`, `POROG_HOLODNOJ`, `VES_KASANIYA` · `teplo`, `raspredelenie` (warmth and touch instrument), constants `POLURASPAD_MS`, `POROG_HOLODNOJ`, `VES_KASANIYA` |
| `test/` | пять стендов (см. «Проверка») · five stands (see "Verification") |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |
| `LICENSE` | текст лицензии MIT (поле `license` в `package.json`) · the MIT license text (the `license` field in `package.json`) |

Зависимости — только `peerDependencies`: `@deepseek-ai/cordis` и `@deepseek-ai/schemastery` (диапазоны — в `package.json`). Своих `dependencies` нет.

Dependencies are `peerDependencies` only: `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` (ranges — in `package.json`). There are no own `dependencies`.

На машине пакет лежит в `/opt/agent-plugins/node_modules/dsh-pamyat-byudzhet`; рядом, в `/opt/agent-plugins/node_modules/@deepseek-ai/`, лежат `cordis` и `schemastery`. В профиль агента он попадает ссылкой `/opt/<агент>/.dsh/profiles/web/node_modules/dsh-pamyat-byudzhet` → `/opt/agent-plugins/node_modules/dsh-pamyat-byudzhet`.

On the machine the package lives in `/opt/agent-plugins/node_modules/dsh-pamyat-byudzhet`; next to it, in `/opt/agent-plugins/node_modules/@deepseek-ai/`, are `cordis` and `schemastery`. It reaches an agent profile through the link `/opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-byudzhet` → `/opt/agent-plugins/node_modules/dsh-pamyat-byudzhet`.

## Установка · Installation

**Откуда ставить.** В npm доступна редакция `3.1.2` (замер 15.10.2026, `npm view dsh-pamyat-byudzhet version`). По решению владельца от 14.10.2026 изменения после публикации ведутся локально и в npm не выкладываются. Для актуальной локальной редакции подготовьте архив из выбранной головы дерева: `npm pack <дерево>/packages/dsh-pamyat-byudzhet`, затем `npm install ./dsh-pamyat-byudzhet-<версия>.tgz`.

**Where to install from.** npm provides `3.1.2` (checked on 2026-10-15 with `npm view dsh-pamyat-byudzhet version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. For the current local edition, pack the selected source revision with `npm pack <tree>/packages/dsh-pamyat-byudzhet`, then run `npm install ./dsh-pamyat-byudzhet-<version>.tgz`.

На машине пакет ставится npm по lock-файлу в `/opt/agent-plugins` из тарбола полки. Зависимость в `/opt/agent-plugins/package.json` (и в `package-lock.json`) имеет вид:

On the machine the package is installed by npm from the lock file in `/opt/agent-plugins`, out of a tarball on the shelf. The dependency in `/opt/agent-plugins/package.json` (and in `package-lock.json`) looks like:

```json
"dsh-pamyat-byudzhet": "file:../agent-plugins-tarbally/dsh-pamyat-byudzhet-<версия>.tgz"
```

Тарбол — `/opt/agent-plugins-tarbally/dsh-pamyat-byudzhet-<версия>.tgz`, где `<версия>` — версия из `package.json` пакета. Новая версия: положить тарбол на полку, поменять ссылку в `/opt/agent-plugins/package.json`, переустановить по lock, затем перезапустить службы агентов (загрузчик при правке настройки модуль не перечитывает — комментарий в `src/index.js`, у `vzyatChislo`).

The tarball is `/opt/agent-plugins-tarbally/dsh-pamyat-byudzhet-<version>.tgz`, where `<version>` is the version from the package's `package.json`. A new version: put the tarball on the shelf, change the reference in `/opt/agent-plugins/package.json`, reinstall from the lock, then restart the agent services (on a settings edit the loader does not re-read the module — comment in `src/index.js`, at `vzyatChislo`).

Подключение — в профиле агента `/opt/<агент>/.dsh/profiles/web/cordis.patch.yml`, раздел `- insert:` (так он подключён в действующих профилях машины):

It is connected in the agent profile `/opt/<agent>/.dsh/profiles/web/cordis.patch.yml`, in an `- insert:` section (this is how it is connected in the machine's live profiles):

```yaml
- insert:
    - name: dsh-pamyat-byudzhet
      id: dsh-pamyat-byudzhet
      config:
        predel: 2000        # в одном из профилей — 5000 · one profile has 5000
        poryadok: svezhest
        porogVery: 0.5
```

Признак монтажа — строка в stderr процесса агента (журнал службы), печатается при каждом вызове `apply` (платформа зовёт его несколько раз на подъём):

The sign of mounting is a line in the agent process stderr (the service log), printed on every `apply` call (the platform calls it several times per start-up):

```text
[dsh-pamyat-byudzhet <версия>] подъём: предел 2000 ед., порядок «svezhest», порог веры 0.5. Тепло считается и печатается, но на отбор НЕ ВЛИЯЕТ (прибор, не правило).
```

`<версия>` берётся из собственного `package.json`; не прочиталась — «версия неизвестна» (`src/index.js`, `versiya`).

`<version>` is read from the package's own `package.json`; if unreadable — "версия неизвестна" (version unknown) (`src/index.js`, `versiya`).

## Настройка · Configuration

Схема — `Config` в `src/index.js` (schemastery). Границы проверяются не схемой, а в `apply` (`vzyatChislo`, `vzyatPoryadok`) — и при старте, и при горячей загрузке настройки.

The schema is `Config` in `src/index.js` (schemastery). Bounds are checked not by the schema but in `apply` (`vzyatChislo`, `vzyatPoryadok`) — both at start-up and on a hot settings reload.

| Ключ · Key | Тип · Type | Умолчание · Default | Допуск · Valid | Смысл · Meaning |
|---|---|---|---|---|
| `predel` | number | 2000 | конечное, ≥ 0 · finite, ≥ 0 | предел подъёма в единицах нашей меры; `0` — не поднимать ничего (печатается отдельная строка «предел равен нулю …») · raise limit in units of our measure; `0` — raise nothing (a separate line "предел равен нулю …" is printed) |
| `poryadok` | string | svezhest | `svezhest`, `vera` (`PORYADKI`) | порядок важности: `svezhest` — новые впереди (время из `sozdano`, иначе `kogda`; без времени — ключ 0, в конец); `vera` — высокая вера впереди, неизмеренная (`null`) — после высоких, перед низкими · importance order: `svezhest` — newest first (time from `sozdano`, otherwise `kogda`; no time — key 0, to the end); `vera` — high confidence first, unmeasured (`null`) after high and before low |
| `porogVery` | number | 0.5 | [0, 1] | порог «низкой» веры — только для объяснения отброса, на отбор не влияет · the "low" confidence threshold — only to explain drops, does not affect selection |

Негодное значение отклоняется строкой «ОТКЛОНЕНО: <ключ> = <значение> — …; действует …»: в силе прежнее годное значение, а если его нет — умолчание. Прежнее годное хранится на уровне модуля — одно на процесс.

An invalid value is rejected with a line "ОТКЛОНЕНО: <key> = <value> — …; действует …" (REJECTED … in force …): the previous valid value stays in force, or the default if there is none. The previous valid value is kept at module level — one per process.

Те же три поля можно передать в вызов `otobrat({ zapisi, predel, poryadok, porogVery })` — они заменяют настройку только на этот вызов. Негодный `predel` или неизвестный `poryadok` в вызове — исключение из `src/otbor.js`, а не «ОТКЛОНЕНО».

The same three fields can be passed to an `otobrat({ zapisi, predel, poryadok, porogVery })` call — they override the settings for that call only. An invalid `predel` or unknown `poryadok` in a call is an exception from `src/otbor.js`, not an "ОТКЛОНЕНО" line.

### Что настройкой НЕ является · What is NOT a setting

Постоянные кода, меняются только правкой кода: `SIMVOLOV_NA_EDINICU` = 4 символа на единицу (`src/mera.js`); `PORYADKI` (`src/otbor.js`); `POLURASPAD_MS` = 14 суток, `POROG_HOLODNOJ` = 0.25, `VES_KASANIYA` = 0 (`src/teplo.js`; полураспад и порог холода — гипотезы, на отбор не влияют).

Code constants, changed only by editing the code: `SIMVOLOV_NA_EDINICU` = 4 characters per unit (`src/mera.js`); `PORYADKI` (`src/otbor.js`); `POLURASPAD_MS` = 14 days, `POROG_HOLODNOJ` = 0.25, `VES_KASANIYA` = 0 (`src/teplo.js`; the half-life and the cold threshold are hypotheses and do not affect selection).

Переменных окружения пакет не читает (`process.env` в `src/` нет).

The package reads no environment variables (no `process.env` in `src/`).

### Служба · Service

Пакет предоставляет (`ctx.provide`) службу `byudzhetPamyati`; `inject` не объявляет, чужих служб не потребляет.

The package provides (`ctx.provide`) the `byudzhetPamyati` service; it declares no `inject` and consumes no other services.

| Функция · Function | Что делает · What it does |
|---|---|
| `edinicy()` | `{ imya: 'оценка наша', simvolovNaEdinicu, pochemuNeTokeny }` — в чём считает пакет и почему не в токенах · `{ imya: 'оценка наша', simvolovNaEdinicu, pochemuNeTokeny }` — what the package counts in and why not tokens |
| `ocenit(zapis)` | цена записи: длина `soderzhim` + `klass` + `istochnik`, делённая на `SIMVOLOV_NA_EDINICU`, вверх, не меньше 1; не объект — исключение · record cost: length of `soderzhim` + `klass` + `istochnik` divided by `SIMVOLOV_NA_EDINICU`, rounded up, at least 1; not an object — exception |
| `sverit({ nashe, platformennoe })` | отношение и расхождение в процентах; у платформы ноль — объяснение словами; нашу меру не правит · ratio and discrepancy in percent; zero from the platform — explained in words; never adjusts our measure |
| `otobrat(vopros)` | отбор под предел; возвращает `{ podnyato, otbrosheno, svodka }`; при отбросе — строка «поднято НЕ ВСЁ … ПРИЧИНЫ … Из них …»; при каждом вызове — строки касаний и тепла · selection under the limit; returns `{ podnyato, otbrosheno, svodka }`; on any drop — a line "поднято НЕ ВСЁ … ПРИЧИНЫ … Из них …"; on every call — the touch and warmth lines |

Причин отброса две, и печатаются они отдельно от свойств отброшенных: «НЕ ВЛЕЗАЮТ ЦЕЛИКОМ» (цена одной записи больше всего предела — не поднимется ни при каком порядке) и «не поместились в остаток предела по порядку …». Свойства («Из них: …») — вера ниже порога, вера не измерялась (это не ноль), холодные, тепло не измерялось — ничего не отвергали. Подробно — [docs/SETTINGS.md](docs/SETTINGS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

There are two drop reasons, printed separately from the properties of the dropped records: "НЕ ВЛЕЗАЮТ ЦЕЛИКОМ" (does not fit at all: one record costs more than the whole limit — it will not be raised under any order) and "не поместились в остаток предела по порядку …" (did not fit the remainder). Properties ("Из них: …", of them) — confidence below threshold, confidence never measured (not zero), cold, warmth never measured — rejected nothing. In detail — [docs/SETTINGS.md](docs/SETTINGS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Проверка · Verification

Стендов пять, всего 61 проба (число считает `test/stend-readme.mjs` по строкам `proba(` в исходниках стендов). Запуск всех — `npm test` в каталоге пакета; одного — `node test/<стенд>.mjs`.

There are five stands, 61 probes in total (the number is counted by `test/stend-readme.mjs` from lines starting with `proba(` in the stand sources). Run all — `npm test` in the package directory; one — `node test/<stand>.mjs`.

| Стенд · Stand | Проб · Probes | Что проверяет · What it checks |
|---|---|---|
| `test/stend-granic-chisel.mjs` | 10 | негодные `predel`, `porogVery` и неизвестный `poryadok` отклоняются при старте и при `fiber.update` на настоящем Context; прежнее годное действует в отборе; `predel 0` законен · invalid `predel`, `porogVery` and an unknown `poryadok` are rejected at start-up and on `fiber.update` on a real Context; the previous valid value applies in selection; `predel 0` is legal |
| `test/stend-krik-zvuchit.mjs` | 9 | отказ слышен в stderr отдельного процесса; `ctx.logger` есть и нем; версия в строке — из манифеста; строка касаний называет область и момент · the refusal is audible in a separate process's stderr; `ctx.logger` exists and is mute; the version in the line comes from the manifest; the touch line names scope and moment |
| `test/stend-mery.mjs` | 7 | цена записи (`ocenit`) и сверка с числом платформы (`sverit`) · record cost (`ocenit`) and reconciliation with the platform number (`sverit`) |
| `test/stend-otbora.mjs` | 23 | причины против свойств, две причины, вера `null`, тепло не влияет на отбор, ключ `kogda`, порог холода = `POROG_HOLODNOJ`, три входа касаний · reasons versus properties, two reasons, `null` confidence, warmth does not affect selection, the `kogda` key, cold threshold = `POROG_HOLODNOJ`, three touch inputs |
| `test/stend-readme.mjs` | 12 | оба README согласованы с кодом, составом `npm pack` и между собой · both READMEs agree with the code, the `npm pack` contents and each other |

Коды возврата каждого стенда: 0 — все пробы зелёные, 1 — есть красные, 2 — слепота (предмет или прибор не загрузился: нет зависимостей в `node_modules`, у стенда README — не ответил `npm pack --dry-run`). Итог `npm test` (скрипт в `package.json`): 1, если хоть один стенд вернул 1; иначе — ненулевой код последнего упавшего стенда (обычно 2); иначе 0.

Exit codes of each stand: 0 — all probes green, 1 — some red, 2 — blindness (the subject or an instrument did not load: dependencies missing from `node_modules`, or, for the README stand, `npm pack --dry-run` did not answer). The `npm test` result (script in `package.json`): 1 if any stand returned 1; otherwise the non-zero code of the last failing stand (usually 2); otherwise 0.

Условия: стендам `stend-granic-chisel` и `stend-krik-zvuchit` нужны `@deepseek-ai/cordis` и `@deepseek-ai/schemastery` (devDependencies) в `node_modules` пакета; стенду README — `npm` в PATH. В клоне без `npm install` эти стенды отдадут 2.

Conditions: `stend-granic-chisel` and `stend-krik-zvuchit` need `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` (devDependencies) in the package's `node_modules`; the README stand needs `npm` on PATH. In a clone without `npm install` these stands return 2.

Что требует `stend-readme` (`test/stend-readme.mjs`): в обоих README названы все порядки `PORYADKI`, способ замера единиц (`dsh-compaction`; в русском ещё `exports`; дата 03.09 — хотя бы в одном), предупреждение «МОЛЧА» / SILENTLY и различие «не измерял…» / never measured; в русском умолчания `predel` и `porogVery` стоят в таблице как «| число |», названы `SIMVOLOV_NA_EDINICU` и «НЕ является»; всё, что README называет в `src/` и `test/`, и каждый `stend-…` лежат в составе `npm pack`; оба README называют один набор стендов. О проверке каждый README обязан сказать — непустым разделом (заголовок со словом «провер…», «стенд», «тест» и т. п.) или строкой стендов. Числа сверяются, только если названы: на первой строке, где есть слово «стенд» (в английском — «stand») и «N проб» («N probes»), N обязано совпасть с числом строк `proba(` во всех `test/*.mjs`, а число стендов на той же строке — цифрой или словом от одного до двадцати, до или после слова «стенд» — с числом файлов `test/*.mjs`. Не названо — не ошибка: проба зеленеет и печатает «не названо».

What `stend-readme` (`test/stend-readme.mjs`) requires: both READMEs name all `PORYADKI` orders, the units measurement method (`dsh-compaction`; the Russian one also `exports`; the date 03.09 in at least one), the МОЛЧА / SILENTLY warning and the «не измерял…» / never measured distinction; in the Russian one the `predel` and `porogVery` defaults appear in a table as "| number |", and `SIMVOLOV_NA_EDINICU` and «НЕ является» are named; everything the READMEs name in `src/` and `test/`, and every `stend-…`, is in the `npm pack` contents; both READMEs name the same set of stands. Each README must say something about verification — a non-empty section (a heading with "verif…", "stand", "test" and the like) or a stands line. Numbers are checked only when stated: on the first line containing "stand" (in Russian — «стенд») and "N probes" («N проб»), N must equal the number of `proba(` lines across all `test/*.mjs`, and the stand count on the same line — digits or a word from one to twenty, before or after "stand" — must equal the number of `test/*.mjs` files. Not stated is not an error: the probe stays green and prints "not stated".

Проверка на живом агенте: в журнале службы агента искать строку «подъём: предел …» (монтаж) и при welcome-брифинге — строки «касания …» и «тепло (прибор, на отбор НЕ влияет): …» (отбор был). Чек-лист строк и их смысл — [docs/GUARDS.md](docs/GUARDS.md), частые поломки — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

Checking on a live agent: in the agent service log look for the line "подъём: предел …" (mounted) and, on a welcome briefing, the lines "касания …" and "тепло (прибор, на отбор НЕ влияет): …" (a selection happened). The list of lines and their meaning — [docs/GUARDS.md](docs/GUARDS.md), common failures — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Ограничения · Limitations

- Не считает расход контекста (это `dsh-pamyat-nudzh`), не читает базу памяти и не выбирает кандидатов: работает только с тем списком, который передал вызывающий. На машине вызывающий — `dsh-pamyat-restore`, только в слое C (welcome-брифинг) и через необязательный `ctx.get('byudzhetPamyati')`; нет службы или она бросила — restore строит брифинг без предела и пишет об этом строкой. В слое B (восстановление после компакта) бюджет не зовётся.
- It does not count context spend (that is `dsh-pamyat-nudzh`), does not read the memory database and does not choose candidates: it works only with the list the caller passes. On the machine the caller is `dsh-pamyat-restore`, only in layer C (welcome briefing) and through an optional `ctx.get('byudzhetPamyati')`; if the service is missing or throws, restore builds the briefing without a limit and says so in a line. In layer B (restore after compaction) the budget is not called.
- Отбор жадный: идёт по порядку и берёт то, что помещается; наилучшего заполнения предела не ищет. Запись дороже всего предела не поднимется никогда.
- Selection is greedy: it walks the order and takes what fits; it does not search for the best fill of the limit. A record costlier than the whole limit will never be raised.
- Мера своя, не токены платформы: одна единица — `SIMVOLOV_NA_EDINICU` символов. Замер 03.09 (способ — поиск по самому пакету `@deepseek-ai/dsh-compaction` версии 0.1.1-rc.2: счётчика нет ни в `lib/`, ни среди `exports`) показал, что оценщик платформы наружу не отдаётся. Если платформа сменит оценщик, наши пределы поедут МОЛЧА: единственный признак — расхождение в `sverit`, смотреть его надо самому.
- The measure is our own, not platform tokens: one unit is `SIMVOLOV_NA_EDINICU` characters. A measurement on 03.09 (method — a search of the `@deepseek-ai/dsh-compaction` package itself, version 0.1.1-rc.2: no counter in `lib/` nor among `exports`) showed that the platform estimator is not exported. If the platform changes its estimator, our limits will drift SILENTLY: the only sign is a discrepancy in `sverit`, and one has to look at it oneself.
- `ocenit` считает `soderzhim`, `klass`, `istochnik`. `dsh-pamyat-restore` передаёт записи в своей форме (`vid`, `avtor` вместо `klass`, `istochnik` — `packages/dsh-pamyat-restore/src/index.js`, `perevesti`), поэтому в работе цена складывается только из `soderzhim`.
- `ocenit` counts `soderzhim`, `klass`, `istochnik`. `dsh-pamyat-restore` passes records in its own shape (`vid`, `avtor` instead of `klass`, `istochnik` — `packages/dsh-pamyat-restore/src/index.js`, `perevesti`), so in production the cost is made of `soderzhim` only.
- Вера: «не измерялась» (`null`) и «ниже порога» — разные свойства; NULL не приравнивается к нулю. `porogVery` только объясняет отброс.
- Confidence: "never measured" (`null`) and "below threshold" are different properties; NULL is not treated as zero. `porogVery` only explains drops.
- Тепло и касания — прибор: на порядок и отбор не влияют (`VES_KASANIYA` = 0, `vliyaet_na_otbor: false`). Строка касаний описывает только кандидатов этого отбора и снимается до выдачи; числа по всей памяти из неё не берутся. Условие пересмотра — в шапке `src/teplo.js`.
- Warmth and touches are an instrument: they do not affect order or selection (`VES_KASANIYA` = 0, `vliyaet_na_otbor: false`). The touch line describes only the candidates of this selection and is taken before delivery; memory-wide numbers cannot be derived from it. The revision condition is in the header of `src/teplo.js`.
- Вывод — только `console.error` в stderr процесса. `ctx.logger` не используется: в cordis 4.0.1 (замер 03.09) его встроенный приёмник держит сообщения в кольцевом буфере внутри процесса. Событий пакет не слушает, в файлы не пишет, внешних команд не зовёт.
- Output is `console.error` to the process stderr only. `ctx.logger` is not used: in cordis 4.0.1 (measured 03.09) its built-in sink keeps messages in an in-process ring buffer. The package listens to no events, writes no files and runs no external commands.
- «Прежнее годное» значение настройки одно на процесс: если разные узлы одного процесса зададут разные числа, действует последнее принятое.
- The "previous valid" setting value is one per process: if different nodes of one process set different numbers, the last accepted one applies.
- `porogVery`, переданный в вызов `otobrat`, не проверяется на допуск (проверяются только список, `predel` и `poryadok` — `src/otbor.js`); влияет он лишь на текст свойств.
- A `porogVery` passed to an `otobrat` call is not range-checked (only the list, `predel` and `poryadok` are — `src/otbor.js`); it affects only the properties text.
- Требует платформу DSH с cordis и schemastery (`peerDependencies`); без них загрузка падает с `ERR_MODULE_NOT_FOUND`.
- Requires the DSH platform with cordis and schemastery (`peerDependencies`); without them loading fails with `ERR_MODULE_NOT_FOUND`.

## Лицензия · License

MIT — поле `license` в `package.json`, текст — [LICENSE](LICENSE).

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
