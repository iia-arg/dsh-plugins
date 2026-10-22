## 3.1.11 — 22.10.2026 · шесть членов 3.1.4: документация (B-N-PUBL-METKI)

- Члены подняты ВМЕСТЕ с набором: `dsh-pamyat-core`, `-omega`, `-secretary`, `-byudzhet`, `-nudzh`, `-restore` 3.1.3 → 3.1.4 — только README/CHANGELOG и номер; код членов не менялся.
- Суммы предметов (summa-predmeta-2 по архивам полки 3.1.4): byudzhet `b9e8ce5c8fa39bcd` (18), core `22fdf49cbb494456` (67), nudzh `40b4d955fda053f9` (19), omega `dbcb6dbea3e53a30` (30), restore `ea4a3e06d391aa7d` (25), secretary `a8cc9c38dd6a34af` (67).
- Остальные три члена (`storozha` 3.1.8, `kompakt-dsh` 3.1.4, `kompakt` 3.1.2) и прибор `summa-predmeta-2` — без изменений.

## 3.1.10 — 18.10.2026 · dsh-pamyat-kompakt-dsh 3.1.4 ((71)+(72): сверка ид на пути курсора, ночная строка времени аудита)

- Член поднят ВМЕСТЕ с набором (урок предмета 5 ночи 18.10): `dsh-pamyat-kompakt-dsh` 3.1.3 → 3.1.4 (сумма предмета `6b7ecb50052f0994`, файлов 32 — снята формулой записи реестра по распакованному архиву 3.1.4; та же формула на копии 3.1.3 в бою даёт `30cca52d4a6885bd`, как в записи).
- Остальные восемь членов и прибор `summa-predmeta-2` — без изменений.

## 3.1.9 — 18.10.2026 · dsh-pamyat-storozha 3.1.8 и dsh-pamyat-kompakt-dsh 3.1.3 (журнал 2G, Заря; наряд Забавы 05:40:31Z)

- Члены подняты ВМЕСТЕ с набором (урок предмета 5 ночи 18.10): `dsh-pamyat-storozha` 3.1.7 → 3.1.8 (сумма предмета `44ada9ff04021d08`, файлов 53), `dsh-pamyat-kompakt-dsh` 3.1.2 → 3.1.3 (`30cca52d4a6885bd`, файлов 31) — `summa-predmeta-2` по дереву выпуска.
- Остальные семь членов и прибор `summa-predmeta-2` — без изменений.

## 3.1.8 — 18.10.2026 · dsh-pamyat-storozha 3.1.7 (разбор ночного обхода 18.10, Заря п.5; наряд Забавы 05:21:33Z)

- Член `dsh-pamyat-storozha` 3.1.6 → 3.1.7: сторож вышел 3.1.7 (17.10, метка `dsh-pamyat-storozha-v3.1.7` на `df7c38a8`, дерево пакета `f82c71fb`) без нового номера набора — ночной обход 18.10 дал `stend-sostava.mjs` ❌ (второй раз за три дня, первый — 16.10, 3.1.7 набора)
- `sostav.json`: версия 3.1.7, сумма предмета `500a5f0d02ffdc40`, файлов 53 — `summa-predmeta-2` сошлась тремя путями: по дереву метки, по архиву полки `dsh-pamyat-storozha-3.1.7.tgz` и по бою `/opt/agent-plugins/node_modules/dsh-pamyat-storozha`.
- Остальные восемь членов и прибор `summa-predmeta-2` — без изменений: их версии и суммы стенд набора сверил с боем.

## 3.1.7 — 16.10.2026 · dsh-pamyat-storozha 3.1.6 (разбор ночного обхода 16.10, Искра; наряд Забавы 04:36:54Z)

- Член `dsh-pamyat-storozha` 3.1.4 → 3.1.6: сторож вышел 3.1.5 (15.10 00:36Z) и 3.1.6 (15.10 18:29Z) без нового номера набора — ночной обход 16.10 дал `stend-sostava.mjs` ❌ «в дереве 3.1.6, в наборе 3.1.4» и «бой 3.1.6, набор 3.1.4».
- `sostav.json`: версия 3.1.6, сумма предмета `eefeec0794801f33` (`summa-predmeta-2` по дереву = метке dsh-pamyat-storozha-v3.1.6, дерево пакета 5d880783), файлов 53; архив `dsh-pamyat-storozha-3.1.6.tgz` на полке есть.
- Остальные восемь членов и прибор `summa-predmeta-2` — без изменений.

## 3.1.6 — 14.10.2026 · B-N-2048: dsh-pamyat-storozha 3.1.4

- Член `dsh-pamyat-storozha` 3.1.3 → 3.1.4 (Заря b3ff25fb: `test/stend-audit-install.mjs` — имя архива через `npm-sostav --filename`, нет/отказ помощника — СЛЕПОТА). Зависимость, `sostav.json` (сумма a136a937d86ad674, 50 файлов), обе таблицы README.
- Остальные восемь членов и прибор `summa-predmeta-2` — без изменений.

## 3.1.5 — 14.10.2026 · B-N-2048: npm 12

- `summa-predmeta-2`: разбор вывода `npm pack --json` — помощником `npm-sostav --files` (пакет `dsh-pribory` 3.1.2), одно правило для npm 11 (массив) и npm 12 (объект); прежний разбор `[0].files` под npm 12 давал СЛЕПОТУ на любом пакете. Нет помощника — отказ «нет помощника npm-sostav», код 2. Формат и способ счёта суммы не менялись: суммы 23 пакетов под npm 11 до правки = под 11 после = под 12 после.
- `test/stend-sostava.mjs`, проба 9: состав публикации разбирается тем же помощником.
- `sostav.json`: `summa_instrumenta` → сумма нового прибора.
- Шесть членов → 3.1.3 (Заря, `stend-readme` через `npm-sostav`): core, omega, secretary, byudzhet, nudzh, restore — зависимости, `sostav.json` (суммы и число файлов пересняты), обе таблицы README. storozha 3.1.3, kompakt-dsh и kompakt 3.1.2 — без изменений.
- Прибор и стенд требуют `npm-sostav` в `PATH`: необязательный peer `dsh-pribory` `^3.1.2` (`peerDependenciesMeta.optional`; единая форма B-N-2048 — решение Забавы 15:07Z: обязательный peer npm 7+ ставит сам и ломает офлайн-установку с полки). Нет помощника — ОТКАЗ код 2 «npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2» (решение Забавы 14:36Z).
- ⚠️ Публикация: `dsh-pribory` 3.1.2 в npm ещё нет — публиковать его ПЕРВЫМ, иначе установка этого пакета из реестра даст ETARGET (ворота Вениамина 14:44Z) · publish `dsh-pribory` 3.1.2 first, otherwise ETARGET.

## 3.1.4 — 14.10.2026 · документация: актуальные номера

- README/доки: номера приведены к выпуску (Аврора, ветка nomera-v-dokah, fd070a17); номер пакета +1.
- зависимость `dsh-pamyat-storozha` → 3.1.3; `sostav.json` пересобран.
- Код пакета не менялся.

## 3.1.3 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- `package.json`: `engines.node >=22` (как у dsh-pamyat-omega).
- зависимости — на новые номера сестёр, задетых этим выпуском.
- `package.json`: `author` — Aleksandr Argelander.
- зависимости `dsh-pamyat-core`, `dsh-pamyat-omega` — на 3.1.2 (тот же выпуск оформления).
- Код пакета не менялся.

## 3.1.2 — перезакрепление на dsh-pamyat-storozha 3.1.1 · re-pinned to dsh-pamyat-storozha 3.1.1

- dsh-pamyat-storozha 1.1.51 → 3.1.1 (A-N-1948 №17, Альфа 4dc1debf; смонтирован в бой 13.10 22:23Z, метка `dsh-pamyat-storozha-v3.1.1`): набор за членом не перенумеровали, стенд состава 14.10 краснел 9 из 11 («в дереве 3.1.1, в наборе 1.1.51»; «бой 3.1.1, набор 1.1.51»). Зависимость, `sostav.json` (сумма предмета `a8b6bc5d8c74351a`, файлов 49 — `summa-predmeta-2` по архиву полки, равна бою и дереву) и строка обоих README; прочие восемь членов без изменений. · The set was not renumbered after its member: dependency, `sostav.json` (subject checksum `a8b6bc5d8c74351a`, 49 files — `summa-predmeta-2` over the shelf archive, equal to the live install and the tree) and the line in both READMEs; the other eight members are unchanged.

## 3.1.1 — облачный аудит, модуль №3 (A-N-1948): зонтик набора · umbrella of the set

- Члены набора — точные номера: core, omega, restore, byudzhet, nudzh 3.1.1; dsh-pamyat-storozha 1.1.51 (модуль №17: дом session-writer-watch, B-N-1968); прочие члены без изменений.
- `sostav.json` пересобран каноническим `summa-predmeta-2`: пять членов модуля и storozha 1.1.51 — по дереву; secretary 1.1.108, kompakt-dsh 1.1.33, kompakt 1.1.40 — по полке и бою (решение координатора 10.10 08:38Z).
- Документы трёх членов (secretary README ×2, kompakt-dsh README, kompakt README и docs/GUARDS.md) в master без номера — ждут их выпуска (модуль №7).
- Документация (Аврора): README RU/EN — №11 установка членов `--install-links`, версии из состава.

## 0.1.0-alpha.103 — 2026-10-10 · промежуточный номер набора ради правки `summa-predmeta-2` (A-N-1948 №10) · interim set version for the `summa-predmeta-2` fix

Номер поднят по решению координатора 10.10 01:51Z (условие Вениамина к монтажу №10): изменился файл пакета `summa-predmeta-2` (запись A-N-1948 №10 ниже), а набор стоял на 0.1.0-alpha.102. Это не 3.1.1: 3.1.1 набора памяти — в очередь модуля №3, после его аудита. В этот номер входят и записи A-N-1873, A-N-1871, A-N-1887 ниже: они лежали в дереве после 0.1.0-alpha.102. · Version raised by coordinator decision 2026-10-10 01:51Z (Veniamin's condition for module #10 installation): the package file `summa-predmeta-2` changed while the set stood at 0.1.0-alpha.102. This is not 3.1.1: the memory set's 3.1.1 waits for module #3 and its audit. This version also carries the A-N-1873, A-N-1871 and A-N-1887 entries below, which sat in the tree after 0.1.0-alpha.102.

Состав пересобран на номерах членов из дерева: зависимости `package.json` — точные номера, которые выйдут (core 1.1.107, omega 1.1.37, secretary 1.1.106, byudzhet 1.1.18, nudzh 0.1.0-alpha.25, restore 1.1.50, storozha 1.1.49, kompakt-dsh 1.1.32, kompakt 1.1.39), а не `file:`-архивы старой схемы. `sostav.json`: версии, суммы и число файлов пересняты `summa-predmeta-2` по архивам полки и, второй стороной, по каталогам дерева — 9 из 9 совпали. Проба 3 стенда проверяет смысл: номер = составу = версии члена в дереве, член в дереве есть; прежде она сверяла `file:`-строку и была зелёной на наборе, отставшем от дерева. Номер самого набора не менялся.

Сведение при слиянии в master 08.10 ~23:4xZ (Искра; дерево ушло вперёд от основы ветки): core 1.1.107 → 1.1.109, secretary 1.1.106 → 1.1.107, nudzh 0.1.0-alpha.25 → 1.1.26 (перенумерация + лицензия MIT); суммы предметов — тем же `summa-predmeta-2` по архивам полки (core cc863de9 / 66, secretary 601929b0 / 66) и по дереву для nudzh 1.1.26 (67ed34bd / 19 — архива на полке ещё нет). Лицензия набора — MIT (A-N-1865).

Composition rebuilt on member versions from the tree: `package.json` dependencies are the exact versions that will ship, not old-scheme `file:` archives. `sostav.json` versions, checksums and file counts were re-taken with `summa-predmeta-2` over shelf archives and, as a second side, over tree directories — 9 of 9 matched. Stand probe 3 checks meaning: version = composition = member version in the tree, member present. The set's own version is unchanged.

A-N-1871 (Аврора, 08.10): стенд набора — член и его версия засчитываются на одной строке в любой записи README (в том числе таблицей), а не только в одной форме; число проб не менялось. Граница: проверяется, что член с версией назван, а не верность описания. Состав перезакреплён на номера членов этого выпуска: core 1.1.110, byudzhet 1.1.19, nudzh 1.1.27, storozha 1.1.50 — суммы `summa-predmeta-2` по каталогам дерева (архивов этих номеров на полке ещё нет).

A-N-1871: the set stand counts a member and its version on one line in any README form (including a table); probe count unchanged. Limit: it checks that the member with its version is named, not that the description is accurate. Composition re-pinned to this release's member versions: core 1.1.110, byudzhet 1.1.19, nudzh 1.1.27, storozha 1.1.50 — `summa-predmeta-2` checksums over tree directories (no shelf archives for these versions yet).

A-N-1887 (Аврора, 09.10): члены подняты ради LICENSE (722421f), код не менялся — omega 1.1.38, secretary 1.1.108, restore 1.1.51, kompakt-dsh 1.1.33, kompakt 1.1.40; зависимости и состав перезакреплены, суммы `summa-predmeta-2` по каталогам дерева. · A-N-1887: members bumped for LICENSE (722421f), code unchanged; dependencies and composition re-pinned, `summa-predmeta-2` checksums over tree directories.

A-N-1948 №10 (Заря, 10.10; находка Авроры 01:30Z, CRITICAL по месту вызова — podyom-uzla зовёт прибор под root по каталогам агента): `summa-predmeta-2` — `npm pack --dry-run --json --ignore-scripts`, сценарии prepack/prepare/postpack пакета больше не исполняются. Суммы на 22 живых каталогах (/opt/agent-plugins/*, /opt/*/plugins/*) до и после — 22 из 22 равны. `sostav.json`: `summa_instrumenta` 3afebd2d6114ac81 → e6812fdcceb909f5 (проба 2 стенда сверяет её с файлом). Номер набора — 0.1.0-alpha.103 (см. заголовок). · `summa-predmeta-2` now runs `npm pack --ignore-scripts`: a package's prepack/prepare/postpack scripts no longer run (the tool is called as root over agent directories). Checksums on 22 live directories are equal before and after. `sostav.json` `summa_instrumenta` updated; the set's version is 0.1.0-alpha.103 (see the heading).

> ⏸ Набор не ведётся до открытия окна публикации (04.10.2026): записи после 0.1.0-alpha.102 не делаются, номер не меняется — кроме 0.1.0-alpha.103 выше (A-N-1948 №10, правка `summa-predmeta-2`). · The set is not maintained until the publication window opens: no entries after 0.1.0-alpha.102, version unchanged — except 0.1.0-alpha.103 above (A-N-1948 #10, the `summa-predmeta-2` fix).

## 0.1.0-alpha.102 — 2026-10-04 (не выпущено · unreleased)

- Инструмент счёта суммы предмета заменён: `summa-predmeta` → `summa-predmeta-2`. Способ и суммы те же (сверено на 12 живых пакетах, вывод равен побайтно); различие — в отказе: прежний при отказе npm печатал пустую сумму и выходил с кодом 0, новый не печатает строку каталога без суммы, называет причину в stderr и выходит с кодом 2; `--kontrol` при отказе — «СЛЕПОТА», код 2. Прежний файл из пакета убран. `sostav.json`: `instrument` и `summa_instrumenta` — новые (`3afebd2d6114ac81`); стенд и документы ищут и называют новое имя. · The subject-checksum tool is replaced: `summa-predmeta` → `summa-predmeta-2`. Method and checksums are the same (checked on 12 live packages, output byte-identical); the difference is in failure: the old one printed an empty checksum with exit 0 when npm failed, the new one omits the directory line, names the cause on stderr and exits 2; `--kontrol` on failure — "СЛЕПОТА", exit 2. The old file is removed from the package. `sostav.json`: new `instrument` and `summa_instrumenta` (`3afebd2d6114ac81`); the stand and docs look for and name the new file.

## 0.1.0-alpha.101 — 2026-10-04 (не выпущено · unreleased)

Стенд набора: слепота больше не выдаётся за расхождение · The set stand no longer passes blindness off as divergence:

- Провал, который проба сама назвала «СЛЕПОТА», не считается расхождением: если других провалов нет — код 2, и при найденных соседях (прежде — код 1). · A failure the probe itself named "СЛЕПОТА" (blindness) is not counted as a divergence: with no other failures — exit 2, even with siblings found (before — exit 1).
- Отказ среды npm (например, кэш в `$HOME` не пишется) — слепота с причиной: `--kontrol` инструмента и `npm pack` не исполнились — «СЛЕПОТА (среда): …»; инструмент вышел с кодом 0 без суммы — «инструмент не дал суммы» (прежде — «на полке undefined» и «Command failed», код 1). Сам `summa-predmeta` закреплён суммой и не менялся. · An npm environment failure (e.g. the cache in `$HOME` is not writable) is blindness with a cause: the tool's `--kontrol` and `npm pack` did not run — "СЛЕПОТА (среда): …"; the tool exited 0 without a checksum — "инструмент не дал суммы" (before — "on the shelf undefined" and "Command failed", exit 1). `summa-predmeta` itself is pinned by checksum and unchanged.
- Документы: снято «известное расхождение» (код 1 при слепоте с соседями); раздел поломок 2 — о слепоте и npm. · Docs: the "known discrepancy" (exit 1 on blindness with siblings) is removed; troubleshooting section 2 covers blindness and npm.

## 0.1.0-alpha.100 — 2026-10-04

Пути машины вынесены из стенда и состава · Machine paths moved out of the stand and the composition:

- `test/stend-sostava.mjs`: полка архивов и каталог установленных плагинов — только из переменных `STEND_POLKA` и `STEND_PLAGINY`, без умолчания; не заданы — «СЛЕПОТА: не задана …», код 2, до всех проб. `STEND_BOJ` по-прежнему подменяет только каталог установки (умолчание — `$STEND_PLAGINY/node_modules`). С переменными этой машины пробы и итог прежние. · The archive shelf and the installed-plugins directory come only from the `STEND_POLKA` and `STEND_PLAGINY` variables, with no default; unset — "СЛЕПОТА: не задана …" (blindness), exit 2, before any probe. `STEND_BOJ` still overrides only the installation directory (default `$STEND_PLAGINY/node_modules`). With this machine's variables the probes and the total are unchanged.
- `sostav.json`: поле `katalog` члена, стоящего каталогом, — путь относительно `STEND_PLAGINY`, а не абсолютный. · The `katalog` field of the member installed as a directory is a path relative to `STEND_PLAGINY`, not an absolute one.
- `package.json`: зависимости `file:` на полку архивов не менялись — npm не подставляет в них переменные; уходят при переходе набора на зависимости по версиям. · The `file:` dependencies on the archive shelf are unchanged — npm does not substitute variables into them; they go away when the set moves to version dependencies.

Документация и комментарии · Documentation and comments — сами эти правки код стенда и инструмента, состав набора, версии и суммы членов не меняли; изменение кода стенда — пункт выше · these edits by themselves did not change the stand or tool code, the set composition, member versions or checksums; the stand code change is the item above:

- Добавлены `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`; `README.md` переписан двуязычным по общему стандарту документации, `README.en.md` — английская страница с той же таблицей состава (её читает стенд). · Added `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`; `README.md` rewritten bilingual to the common documentation standard, `README.en.md` is an English page with the same composition table (the stand reads it).
- `package.json`: `description` и `keywords` на двух языках, `docs` добавлен в `files`; прочие поля прежние. · `package.json`: bilingual `description` and `keywords`, `docs` added to `files`; other fields unchanged.
- `test/stend-sostava.mjs`: комментарии двуязычные (RU/EN) и обезличенные; код без комментариев равен прежнему (сравнение синтаксических деревьев). · `test/stend-sostava.mjs`: comments are bilingual (RU/EN) and anonymized; the code without comments equals the previous one (syntax-tree comparison).
- `sostav.json`: пояснительные текстовые поля двуязычные и обезличенные; функциональные поля (имена, версии, суммы, число файлов, каталог, инструмент и его сумма) не тронуты. · `sostav.json`: explanatory text fields are bilingual and anonymized; functional fields (names, versions, checksums, file counts, directory, tool and its checksum) are untouched.
- История ниже обезличена: из заголовков убраны пометки исполнителей и номера внутренних задач, имена заменены ролями, пути — заполнителями; содержание записей сохранено. · The history below is anonymized: author marks and internal task numbers were removed from headings, names replaced with roles, paths with placeholders; entry content is preserved.

## 0.1.0-alpha.99 — 2026-10-04
secretary a104→a105 (предмет cd42facb41550a48, 66): кандидат исполнителя c3ecba9, в дереве c35e586. Тарбол <полка-архивов>/dsh-pamyat-secretary-0.1.0-alpha.105.tgz (398a5c94). Прочие члены — как a98 (core a102, omega a31, restore a47, byudzhet a16, nudzh a23, storozha a35, kompakt-dsh a26, kompakt a36). Ставить одним окном с secretary a105 — иначе стенд набора «версии равны боевым» красный.

## 0.1.0-alpha.98 — 2026-10-03
secretary a103→a104 (предмет 9273d570b3d1bde7, 60): только стенд `test/stend-fakta-zova.mjs` (имя `vneSessii` в окружении vm; без него 3/8), код секретаря тот же (e8da8963). Тарбол <полка-архивов>/dsh-pamyat-secretary-0.1.0-alpha.104.tgz (ad99ea8e). a103 в бой не ставился — его заменяет a104. Прочие члены — как a97 (core a102, restore a47, omega a31).

## 0.1.0-alpha.97 — 2026-10-03
core a101→a102 (предмет cc6c317ce83ec15a, 58), restore a46→a47 (8ba0c6ef6c7104c3, 18), omega a30→a31 (20046f246806cf72, 18), secretary a102→a103 (bb9b056eaa278b96, 60): настройка ядра `isklyuchitSessii` (префиксы session.id вне памяти) и заслоны в restore/omega/secretary. Умолчание `[]` — поведение прежнее; исключение заработает, когда реестр доставит настройку в профиль гостевого агента (не этим выпуском). Тарболы <полка-архивов>/…core-0.1.0-alpha.102.tgz, …restore-0.1.0-alpha.47.tgz, …omega-0.1.0-alpha.31.tgz, …secretary-0.1.0-alpha.103.tgz. Прочие члены — без изменений.

## 0.1.0-alpha.96 — 2026-10-03
Состав приведён к бою: restore a45→a46 (предмет 21f1a9b2f7ea10ce, 18 файлов) и storozha a34→a35 (предмет 115a82c85e12988d, 14 файлов) — оба в бою с выпуска /new 1.5.60 (03.10 04:2xZ), набор их не отражал, и ночной обход это ловил. omega a28→a30 (пометка гостевых записей, исполнитель; принято приёмкой; в бою с 13:01:55Z; предмет 4330cd5fc3d9ad91, 18 файлов) — добавлено исполнителем сверх кандидата исполнителя: без него стенд набора «версии равны боевым» красный. Код членов набором не менялся; тарболы <полка-архивов>/…restore-0.1.0-alpha.46.tgz, …storozha-0.1.0-alpha.35.tgz, …omega-0.1.0-alpha.30.tgz. obsluzhivanie a10 в набор не входит (ставится отдельно). Прочие члены — без изменений.

## 0.1.0-alpha.95 — 2026-10-01
core a100→a101: zavestiZhurnal(…, { tolkoChtenie }) для ночного читателя dsh-pamyat-obsluzhivanie a8 (исполнитель; принято приёмкой), предмет 5ebae07ff965eeba, 58 файлов (po-publikacii). obsluzhivanie в набор не входит — ставится отдельно в <каталог-плагинов>.

## 0.1.0-alpha.94 — 2026-10-01
kompakt-dsh a25→a26: продолжение после сжатия гасит только /stop человека из Telegram (исполнитель e7bef287; принято приёмкой), предмет 4dae2b3d287da5e7, 19 файлов (контроль на бою a25 — записанный 6e39a3ebbde54e23). core a99→a100: только комментарий области склейки (исполнитель), предмет bc189901799a18cd, 57 файлов (контроль a99 — 3c0c4720858513b3). omega a27→a28: граница Source — начало записи списка, ложные ne-najdeno (исполнитель; принято приёмкой), предмет 74480129b817eacb, 18 файлов (контроль a27 — 9e252b72bc565b79).

## 0.1.0-alpha.93 — 2026-10-01
kompakt-dsh a24→a25: marker узнаёт письмо-продолжение и Claude-шлюза («[шлюз (Codex|Claude) · продолжение после стопа]»; дельта исполнителя, принято приёмкой), +stend-pisma-prodolzheniya; число предмета 6e39a3ebbde54e23, 18 файлов (контроль на бою a24 — записанный 4a7f09a1ec2a10c1). Пара к subscription-gateway 0.4.24.

## 0.1.0-alpha.92 — 2026-10-01
storozha a33→a34: stend-opoveshcheniya изолирован от боевого D и KOMPAKT_AGENT (исполнитель 238ae0c5, принято приёмкой); runtime-код не менялся; число предмета db8a340696c75e4b, 14 файлов (контроль на бою a33 — записанный 4a861b1b381bd321). Снимает исключение stend-opoveshcheniya a33.

## 0.1.0-alpha.91 — 2026-10-01
secretary a101→a102 поверх a90 (restore a45): автоповтор прерванного среза (исполнитель, принято приёмкой); число предмета 213e6357b72701fa, 60 файлов (контроль на бою a101 — записанный f0ea4b7124e67e77). Ставить ПОСЛЕ a90 (lock и реестр собраны поверх него).

## 0.1.0-alpha.90 — 2026-10-01
restore a44→a45: наставление «оценивать применённое» в welcome (вариант (в) владельца 01.10 09:48 МСК; код исполнителя a0d93d5b, номер и CHANGELOG — исполнитель); число предмета 4c0ae8fe1c5e2242, 17 файлов (контроль на бою a44 — записанный 4836780ff28317ce). Не ловит: станет ли модель оценивать.
ИСПРАВЛЕНО (моя ошибка в a89): sostav.json не был пересчитан под kompakt a36 / storozha a33 — stend-sostava на a89 давал 5 из 11; теперь kompakt 307be993e8c5d02f/21, storozha 4a861b1b381bd321/14 (сняты summa-predmeta-kanon, бой = полка).

## 0.1.0-alpha.89 — 2026-10-01
kompakt a35→a36 и storozha a32→a33 одним выпуском (порог готовым из D, porogi.mjs; код исполнителя 6817e81 r2); числа предмета kompakt 307be993e8c5d02f (21 файл, контроль на бою a35 — записанный e7c98692…), storozha 4a861b1b381bd321 (14 файлов, с правкой выпуска devDependencies, контроль на бою a32 — записанный a05f0d25…). Ставить одним окном с agent-registry и 9 D.

## 0.1.0-alpha.88 — 2026-09-30
secretary a100→a101 (стенд строк для подъёма; код не менялся); число предмета f0ea4b7124e67e77 (контроль на бою a100 — записанный 4a8797cb…), файлов 58.

## 0.1.0-alpha.87 — 2026-09-30
secretary a99→a100 (/distill-srez не закрывает частично разобранный срез); число предмета 4a8797cb40630503 (контроль на бою a99 — записанный 33d0d8e0…), файлов 57.

## 0.1.0-alpha.86 — 2026-09-30
kompakt-dsh a23→a24 (положительный след аудита продолжения; дельта исполнителя, принято приёмкой); число предмета 4a7f09a1ec2a10c1 (контроль на бою a23 — записанный 41008be1…), файлов 17.

## 0.1.0-alpha.85 — 2026-09-30
kompakt-dsh a22→a23 (прямой journalctl первым, sudo только при отказе прав; дельта исполнителя, принято приёмкой); число предмета 41008be11f2f2448 (контроль на бою a22 — записанный dc296784…), файлов 17.

## 0.1.0-alpha.84 — 2026-09-30
kompakt-dsh a21→a22 (служба из agent-registry, журнал через sudo -n; дельта исполнителя, принято приёмкой); число предмета dc296784173adb4d (контроль на бою a21 — записанный a8d4513a…), файлов 17.

## 0.1.0-alpha.83 — 2026-09-30
kompakt a34→a35 (fallback D→E снят; nastrojki/*.json вне пакета — файлов 23→20); число предмета e7c986922759985f (контроль на бою a34 — записанное a3d5e88e…). Состав в бой идёт каталогом (<каталог-плагинов>/dsh-pamyat-kompakt), не архивом.

## 0.1.0-alpha.82 — 2026-09-30
kompakt-dsh a20→a21 (пустой аудит journalctl — не тревога; дельта исполнителя, принято приёмкой); число предмета a8d4513acfb0453c (контроль на a20 — записанные 2dca0d8f…), файлов 16.

## 0.1.0-alpha.81 — 2026-09-30
core a98→a99 (инструмент модели pamyat_ocenit, поле poslednyaya_vydacha; число предмета 3c0c4720858513b3, файлов 57) и restore a43→a44 (use по вере модели — из двух разных выдач; число предмета 4836780ff28317ce, файлов 16); summa-predmeta-kanon, контроль на a98/a43 дал записанные 24383743…/f18e4dde…. Кандидат исполнителя, правки приёмщика и буква А координатора; принято приёмкой. Монтаж: restore ПЕРВЫМ или одним окном с core.

## 0.1.0-alpha.80 — 2026-09-30
omega a26→a27 (выключатель vydacha.avto; кандидат исполнителя, принято приёмкой); число предмета 9e252b72bc565b79 (summa-predmeta-kanon d4fc9642), файлов 18.

## 0.1.0-alpha.79 — 2026-09-30
kompakt-dsh a18→a20 (отметка MODE=ACTIVE после сохранённой пары summary/checkpoint/end; кандидат исполнителя, принято приёмкой); число предмета 2dca0d8f4eb43448 (summa-predmeta-kanon d4fc9642), файлов 15.

## 0.1.0-alpha.78 — 2026-09-30

nudzh a22→a23 (после компакта давление неизвестно, прежнее число не вставляется; кандидат исполнителя, принято приёмкой на архив 92324eb3). Поверх a77. Состав переснят (summa-predmeta --po-publikacii: nudzh 07ec4a57, файлов 14).

## 0.1.0-alpha.77 — 2026-09-30

secretary a98→a99 (прерванный заход: ядро спрашивается о записанном, задание прерванного среза закрывается; кандидат исполнителя, принято приёмкой). Поверх a76. Состав переснят (summa-predmeta --po-publikacii: secretary 33d0d8e0, файлов 56).

## 0.1.0-alpha.76 — 2026-09-30

omega a25→a26 (ключ службы OMEGA ≥1.5.19 из окружения: klyuchIzOkruzheniya; принято приёмкой по плану 15:0x МСК). Поверх a75. Состав переснят (summa-predmeta: omega c5bae5e1, файлов 18). Ставится в Фазе 0 окна OMEGA 1.5.19, до перезапуска omega-memory.

## 0.1.0-alpha.75 — 2026-09-30

core a97→a98 (исполнитель: чистка — hranilishche.js, index.js). Принято приёмкой. Состав переснят (summa-predmeta: core 24383743, файлов 56). obsluzhivanie a6 — вне набора (стоит в <каталог-плагинов> отдельно).

## 0.1.0-alpha.74 — 2026-09-30

restore a42→a43 (исполнитель: след выдачи welcome-брифинга в журнале службы; новый стенд stend-sleda-vydachi). Принято приёмкой. Поверх a73 (secretary a98 в бою с 10:03Z). Состав переснят (summa-predmeta).

## 0.1.0-alpha.73 — 2026-09-30

secretary a97→a98 (исполнитель: сверка охвата в итоговой строке дистилляции). Принято приёмкой. Состав переснят (summa-predmeta).

## 0.1.0-alpha.72 — 2026-09-30

secretary a96→a97 (исполнитель: ключ среза kluchSreza «сеанс#min-max» в трёх местах вместо первого/последнего; «устарело K» в итоговой строке дистилляции). Принято приёмкой. Состав переснят (summa-predmeta).

## 0.1.0-alpha.71 — 2026-09-30

secretary a95→a96 (исполнитель: команда /distill-srez — дозапуск разбора одного сорвавшегося среза, строка цены с масштабом прошлых полных заходов; стенд stend-distill-srez). Принято приёмкой. Состав переснят (summa-predmeta).

## 0.1.0-alpha.70 — 2026-09-30

secretary a94→a95 (исполнитель: повтор выбора тем при ne-dochitala; новый стенд stend-povtora-vybora-tem). Принято приёмкой. Состав переснят (summa-predmeta).

## 0.1.0-alpha.69 — 2026-09-30

omega a24→a25 (исполнитель: «Б — инструмент» не выдаёт регистрацию за доставку; новый стенд stend-dostupnosti-b). Принято приёмкой. Состав переснят (summa-predmeta).

## 0.1.0-alpha.68 — 2026-09-30

kompakt a33→a34 и storozha a31→a32 (исполнитель: путь раскладки 0.1 снят — лежащий `.agent-presets` даёт названный отказ); kompakt-dsh a17→a18 и restore a41→a42 (исполнитель: стенды под DSH 0.2, код модулей не менялся). Принято приёмкой. Состав переснят (summa-predmeta).

## 0.1.0-alpha.67 — 2026-09-29

kompakt a32→a33 и storozha a30→a31 (исполнитель; принято приёмкой 30.09 00:5x МСК): доля порога на DSH 0.2 — из вложенного пресета профиля A; окно kompakt — «несколько contextWindow, все равны — годно». Ставится ТОЛЬКО окном обновления DSH 0.2.

## 0.1.0-alpha.66 — 2026-09-29

omega a23→a24: peer @deepseek-ai/dsh-llm (на DSH 0.2 — копия установки, не 0.1.1 из agent-plugins). Ставится ТОЛЬКО в окне. Состав переснят.

## 0.1.0-alpha.65 — 2026-09-29

kompakt-dsh a16→a17 (журнал через помощника ядра, vhodSHvostom, poslednijEpizod; стенд stend-styka-sobytij). Ставится ТОЛЬКО в окне обновления DSH. Состав переснят (summa-predmeta).

## 0.1.0-alpha.64 — 2026-09-29

secretary a93→a94 (черновик reasoning), omega a22→a23 (письмо agent-message). Ставится ТОЛЬКО в окне обновления DSH. Состав переснят (summa-predmeta).

## 0.1.0-alpha.63 — 2026-09-29

core a96→a97 (помощник событий сессии), secretary a92→a93 и restore a40→a41 (чтение журнала через помощника; restore — и источник вставки v4), nudzh a21→a22 и omega a21→a22 (источник вставки v4 `plugin:<имя>`). Ставится ТОЛЬКО в окне обновления DSH. Состав переснят (summa-predmeta).

## 0.1.0-alpha.62 — 2026-09-29

core a95→a96: только новый стенд stend-nfc-soderzhim. Состав переснят (summa-predmeta).

## 0.1.0-alpha.61 — 2026-09-29

core a94→a95: текст записи в NFC (index.js :593 и hranilishche.zapisat). Состав переснят (summa-predmeta).

## 0.1.0-alpha.60 — 2026-09-29

restore a39→a40, nudzh a20→a21: только peerDependencies `@deepseek-ai/dsh-llm` `^0.1.1-rc.2 || ^0.2.0-rc.2` (DSH 0.2 выключал оба). Код не менялся. Состав переснят (summa-predmeta).

## 0.1.0-alpha.59 — 2026-09-29

secretary a91→a92: только стенд stend-povtora-suda (путь скрипта возврата в бою). a58 не мечен — промежуточный. Состав переснят (summa-predmeta).

## 0.1.0-alpha.58 — 2026-09-29

core a93→a94 (vidnaVOmega, повод касания povtor-sudom), omega a20→a21 (aktivnye), secretary a90→a91 (суд «ПОВТОРЯЕТ», ключ sudPovtor.vkl ВЫКЛ). Ворота приёмщика 16:00Z. Состав переснят (summa-predmeta).

## 0.1.0-alpha.57 — 2026-09-29

kompakt-dsh a15→a16: отбой ожидания usage (index.mjs 3edc303e, новый стенд stend-otboya-usage.mjs; ворота приёмщика 15:34Z). Состав переснят (summa-predmeta).

## 0.1.0-alpha.56 — 2026-09-29

omega a19→a20: выдача знаний по смыслу (ключ `vydacha`, по умолчанию выключена; А — до 3 связанных с ядром записей на входящее письмо, Б — инструмент `pamyat_po_smyslu`). core a92→a93: только комментарий правила многосвязи. Состав переснят (summa-predmeta).

## 0.1.0-alpha.55 — 2026-09-29

kompakt-dsh a14→a15: исправлен путь установки платформы в стенде, рабочий код прежний. Состав переснят.

## 0.1.0-alpha.54 — 2026-09-29

core a91→a92: таблица `svyaz_omega` (многие-к-одному, MED-1) и служба `doverieDlyaMem` — связь записи pamyat.db с её экземпляром в OMEGA для выдачи по смыслу; связь только при ответе «запись создана» (у2′). omega a18→a19: признак `sozdana` в ответе `sohranit`. Ядро и omega — ОДНИМ окном. Состав пересчитан `summa-predmeta`; остальные члены набора не меняются.

## 0.1.0-alpha.53 — 2026-09-29

kompakt-dsh a13→a14: одна тревога после трёх завершённых ходов без свежего usage; ожидание не снимается. Состав переснят, остальные члены не меняются.

## 0.1.0-alpha.52 — 2026-09-29

kompakt-dsh a12→a13: ожидание свежего usage после успешного сжатия Codex, без обнуления давления. Состав и проверочный прибор пересняты; остальные члены набора не меняются.

## 0.1.0-alpha.51 — 2026-09-28

- ч.2: secretary a90 — журнал фактического вызова и единственного исхода дистилляции. Остальные члены набора сохранены.

## 0.1.0-alpha.50 — 2026-09-27

- Состав перезакреплён на бой копилок KOPILKA-2 (26.09 20:46–21:0xZ) и KOPILKA-3 (27.09 01:50Z): core a90 → a91, secretary a86 → a89 (a87 и a88 вошли), kompakt-dsh a11 → a12, kompakt a31 → a32 (каталогом). В sostav.json у четырёх — versiya, predmet (summa-predmeta d4fc9642 по боевым <каталог-плагинов>/node_modules/<член>, kompakt — <каталог-плагинов>/dsh-pamyat-kompakt) и faylov (core 50 → 51, secretary 46 → 49); omega a18, byudzhet a16, nudzh a20, restore a39, storozha a30 не менялись — их суммы с боя равны записанным (контроль способа). package.json — три зависимости на архивы полки (core a91, secretary a89, kompakt-dsh a12); kompakt — каталогом, как был. README.md и README.en.md — версии в строках четырёх членов.
- Причина: набор не подняли ни в копилке-2, ни в копилке-3 — спутник выпуска, пропущенный в плане (исполнитель); поймал ночной обходчик 27.09 03:52Z (stend-sostava: «версии набора РАВНЫ боевым» — core бой a91, набор a90; «суммы = архиву полки» для kompakt@a31). В порядок выпуска исполнителя «набор dsh-pamyat» внесён третьей строкой раздела «Спутники».

## 0.1.0-alpha.49 — 2026-09-26

- Состав перезакреплён на бой окна выпуска (монтаж 17:45–17:49Z): core a89 → a90, omega a17 → a18, byudzhet a15 → a16, restore a38 → a39, storozha a29 → a30, kompakt-dsh a10 → a11, kompakt a30 → a31 (каталогом). В sostav.json у семи — versiya, predmet (summa-predmeta по боевым <каталог-плагинов>/node_modules/<член>) и faylov; secretary a86 и nudzh a20 не менялись (их суммы с боя равны записанным — контроль способа). package.json — шесть зависимостей на новые архивы полки; README.md и README.en.md — версии в строках членов. stend-sostava: 9/11 → 11/11 (исполнитель; ворота приёмщика 18:41Z).

- README.en.md и README.md: число членов в описании — девять, не восемь («which nine», «9 пакетов»; «9 of 9» / «9 из 9»), по sostav.json (9) — (исполнитель, находка исполнителя). «Одиннадцать проб» верно — стенд даёт 11.

- `test/stend-sostava.mjs`: новая проба «ЧИСЛО ФАЙЛОВ предметов совпадает с составом» — поле `faylov` было без читателя (приёмщик, ворота a42:
  порча restore 13→12 давала 10/10 зелёное). Число — из того же вызова `summa-predmeta`, что и сумма («… файлов N»); сумма не посчитана —
  СЛЕПОТА. Проб 10 → 11. README: «Восемь проб»/«Eight probes» → «Одиннадцать»/«Eleven» (счёт отставал и до правки: было 10).

## 0.1.0-alpha.48 — 2026-09-26

Состав: kompakt a29 → a30 — пути ответа против входа сжатия (пометка «⚠️ НЕТ ВО ВХОДЕ СЖАТИЯ»). predmet kompakt 790b85cefe41ea03 → 843da84a9c57130a (summa-predmeta по копии боя с файлами окна), faylov 22 → 23. Прочие восемь — без изменений.

## 0.1.0-alpha.47 — 2026-09-26

Остаток: уборка /tmp в стендах, код пакетов не менялся. Состав: core a88 → a89 — predmet 31fccec614a55935 → 3d5f3876a0c8b9b0, faylov 50; secretary a85 → a86 — predmet d2c600c6c63198d4 → cd884e3b22d59aa5, faylov 46 (summa-predmeta по архивам кандидатов = отпечатку реестра-кандидата). Прочие семь — без изменений.

## 0.1.0-alpha.46 — 2026-09-26

Состав: secretary a84 → a85 — суд отмены: повтор старшей записи ложится «уточняет» (понижено из «УСТАРЕЛА»), «НЕТ РЕЛЕВАНТНОГО.» с пунктуацией — пусто, строка «записано id N по теме». predmet secretary 0701f2da7a4ff36d → d2c600c6c63198d4 (summa-predmeta по архиву полки = отпечатку реестра), faylov 45 → 46. Прочие восемь — без изменений.

## 0.1.0-alpha.45 — 2026-09-26

часть core (исполнитель; ворота приёмщика 02:4xZ). Состав: core a87 → a88 — уборка ядра (итог привратника, закрытие базы) через ctx.effect ДО открытия базы вместо мёртвого ctx.on('dispose'); новый стенд stend-vygruzki. predmet core 153387bdb4e063aa → 31fccec614a55935 (summa-predmeta по архиву полки = отпечатку реестра), faylov 49 → 50. Прочие восемь — без изменений.

## 0.1.0-alpha.44 — 2026-09-26

(ворота приёмщика 02:30Z). Состав: storozha a28 → a29 — очистка отметки монтажа через ctx.effect вместо мёртвого ctx.on('dispose'); новый стенд stend-vygruzki. predmet storozha 1e169322c9222f5b → 5eaa6f4821cf0e17 (summa-predmeta по архиву полки = отпечатку реестра), faylov 13 → 14. Прочие восемь — без изменений.

## 0.1.0-alpha.43 — 2026-09-26

(ворота приёмщика). Состав: nudzh a19 → a20 — README RU/EN сведены по числам, stend-readme сверяет число проб и стендов; код не менялся. predmet nudzh 35a2b962c28df15f → f3c759ba329cca0c (summa-predmeta по архиву полки = отпечатку реестра), faylov 13. Прочие восемь — без изменений.

## 0.1.0-alpha.42 — 2026-09-26

(кандидат исполнителя; ворота приёмщика 00:54Z). Состав: restore a37 → a38 — строка «⛔» отменённых одной строкой в конце брифинга, вне бюджета; знания под бюджетом, как было; новый стенд stend-otmenennyh-v-konce. predmet restore b2dece2a664e9d23 → 675dd83bb70d8de7 (summa-predmeta по архиву полки = отпечатку реестра), faylov 12 → 13. Прочие восемь — без изменений.

## 0.1.0-alpha.41 — 2026-09-26

Волна 3 выпусков пакетов памяти (исполнитель; наряд координатора 25.09 23:48Z). Состав: storozha a27 → a28, kompakt-dsh a9 → a10 (обёртка stend-hvosta), kompakt a28 → a29 (обёртки 8 корневых стендов). Код ни одного члена не менялся — только стенды. predmet — summa-predmeta: storozha 1e169322c9222f5b и kompakt-dsh 0a8250ca9748e07c по архивам полки (= отпечаткам реестра), kompakt 790b85cefe41ea03 по каталогу боя (на метке a28 тот же прибор дал принятое cbc7d8cb). Прочие шесть — без изменений.

## 0.1.0-alpha.40 — 2026-09-25

(доверие к записи на событиях; кандидат исполнителя, ворота приёмщика 23:16Z/23:25Z, монтаж координатора 23:28Z). Состав: core a86 → a87 (состояние доверия вычисляется из событий: doverie.js, schet-doveriya.mjs, stend-doveriya), restore a36 → a37 (ОТМЕНЕНА → строка «⛔ #id не подаётся — отменена #k (кем, когда)», stend-doveriya-vydachi). predmet — тем же fingerprint_check, что реестр (core 153387bdb4e063aa, restore b2dece2a664e9d23). Прочие шесть — без изменений.

## 0.1.0-alpha.39 — 2026-09-25

Волна 2 выпусков пакетов памяти (исполнитель; порядок координатора — метапакет вслед волне). Состав: omega a16 → a17 (инвариант apply, комментарий), secretary a83 → a84 (обёртки 8 стендов, уборка /tmp в стендах). predmet — тем же fingerprint_check, что реестр (omega 0501e82ed5f1a695, secretary 0701f2da7a4ff36d). Прочие шесть — без изменений. subscription-adapter 0.1.4 той же волны — не член набора.

## 0.1.0-alpha.38 — 2026-09-25

Волна 1 выпусков пакетов памяти (исполнитель; решение координатора 25.09 ~21:3xZ — метапакет вслед каждой волне). Состав: core a85 → a86 (класс вне умолчаний, инвариант apply + стенд,/919 стенды), byudzhet a14 → a15 (границы чисел), nudzh a18 → a19 (границы порогов). predmet — тем же fingerprint_check, что реестр. Прочие шесть — без изменений. Попутно: test/stend-sostava.mjs — образец уборки временного (1603fd0), уже в дереве.

## 0.1.0-alpha.37 — 2026-09-25

(наряд координатора 25.09). secretary a82 → a83: второе мнение суда отмены называет «УТОЧНЯЕТ», а не «undefined»;
стенд суда — proba краснеет на возврате тела (условие приёмки 18:14Z); в a83 вошла и невыпущенная (стенд отклонённой
сводки — mkdtemp). sostav.json: versiya a83, predmet d967fe1caf370c52 → 92a212cf6851e02e (summa-predmeta --po-publikacii по
распакованному архиву; на a82 тот же способ дал принятое d967fe1c…), faylov 45 → 45. Прочие семь членов — без изменений.

## 0.1.0-alpha.36 — 2026-09-25

(условие приёмки и находка исполнителя) + restore a35 → a36 (36 исполнителя, в бою с 25.09 18:18:45Z):
sostav.json versiya a36, predmet 4f611825ca8c9f67 → 1c5db679cc85668d, faylov 11 (без изменений); прочие семь членов не тронуты.
Правки стенда test/stend-sostava.mjs:
- проба «ВЕРСИИ ТОЧНЫЕ»: `x` — диапазон, только когда стоит целым разрядом версии (`1.x`, `1.2.X`, `x`). Прежде `/x/` без границ
  ловил любую букву x в пути члена-каталога или в предрелизе (`0.1.0-fix.1`) и краснел ложно; заглавную `1.2.X` не ловил вовсе;
- `proba`: ЛЮБОЙ возврат тела, кроме `undefined`, — провал (пробы говорят только исключением). Прежде засчитывалось одно
  отсутствие исключения; первая редакция ловила только `false`, а obyortka-krasneet подставляет пять форм (условие приёмки).

## 0.1.0-alpha.35 — 2026-09-25

(решение координатора 25.09 20:39 МСК — пересборка набора тем же монтажом, что член). restore a34 → a35: касание
(`otmetitKasanie`) — только записям, вошедшим в текст брифинга. sostav.json: versiya a35, predmet 79677a150cf594ef → 4f611825ca8c9f67
(summa-predmeta по распакованному архиву полки; на a34 тот же способ дал принятое 79677a15…), faylov 10 → 11 (новый стенд
test/stend-kasaniya-podannyh.mjs). Прочие семь членов — без изменений.

## 0.1.0-alpha.34 — 2026-09-25

(отложка снята владельцем 25.09 18:08). Состав выровнен с БОЕМ: core a85 · omega a16 · secretary a82 ·
byudzhet a14 · nudzh a18 · restore a34 (было a40/a10/a16/a8/a12/a18 — отставание 6–66 версий). Суммы — каноном по архивам полки,
совпали с боем и отпечатками реестра у 6 из 6.
По решению координатора 25.09 18:24 набор РАСШИРЕН до восьми: + storozha a27, + kompakt-dsh a9, + kompakt a28 — КАТАЛОГОМ, как на бою
(file:<каталог-плагинов>/dsh-pamyat-kompakt; kompakt-dsh зовёт его по имени, в манифесте не объявляя). vyvoz — за бортом: в бою не живёт.
Зовущий — область и строка ночного обходчика (vse-stendy-boevye.sh, perechen-boevyh-stendov.txt). Поставка — из дерева: зависимости file:-архивы <полка-архивов>.
Стенд: сверка сумм — с полкой, а не с реестром npm; «дерево не позади» заменено на «набор РАВЕН бою» — прежняя проба отставания
набора не видела по построению. Черновик исполнителя 23.09 (alpha.34, fa17b83f) этим заменён: он выравнивал на a77/a62/a29 — бой ушёл дальше.

## 0.1.0-alpha.33

**Только текст README.** Состав не тронут: `core a40 · omega a10 · secretary a16 · byudzhet a8 ·
nudzh a12 · restore a18` — те же шесть номеров, что в `alpha.32`.

🔴 **Почему отдельный номер, а не правка под прежним.** Раздел «Метки в реестре npm — не источник
правды о приёмке» был дописан ПОСЛЕ того, как встал тег `dsh-pamyat-v0.1.0-alpha.32`. Замер каноном:

```
тарбол из рабочего дерева   997d52cb951d0e0b   файлов 7
дерево тега a32 с origin    d8879da8cd45800d   файлов 7
```

Одинаковый номер, разное содержимое — то самое «расхождение ПРЕДМЕТА при верном НОМЕРЕ», которое
не видит ни одна проверка, сравнивающая версии. Поймано воротами приёмки (`тег = тарбол`), а не
чтением. Правка под прежним номером сделала бы тег ложной подписью: он бы существовал и указывал
не на то.

⚠️ **Что этот раздел НЕ лечит.** Он объясняет метки тому, кто откроет README ставшего пакета.
Тот, кто читает метки прямо в реестре, его не увидит — и это остаётся так при любом выпуске.
## 0.1.0-alpha.32

**Секретарь `alpha.15` → `alpha.16`.** Вердикт на `a16` есть (`323ba92`), в реестре она есть —
то есть это единственная версия секретаря, которая одновременно принята и достижима постороннему.

Что это даёт ставящему набор: отказ фильтра на сводке компакта больше **не обрывает дистилляцию**
и не теряет текст сводки. На `a15` один отказ уносил и сводку, и все знания захода.

⚠️ **Почему НЕ `alpha.18`, хотя приёмка требует именно её.** `a17` и `a18` в реестр не выпускались
по правилу вех — они существуют коммитом и тегом. Набор объявляет зависимости точными номерами,
и набор с `secretary@0.1.0-alpha.18` был бы **неустановим**; проверено фактом:
`npm i dsh-pamyat-secretary@0.1.0-alpha.18` → `notarget, No matching version found`.
То есть требование «в набор только с `a18`» и правило «в npm по вехам» сейчас несовместимы,
и это не чья-то оплошность, а устройство. Позиция вынесена владельцу.

🔴 **И то, что важнее самого состава: набор `alpha.31` собран, закоммичен и НЕ ОПУБЛИКОВАН.**
Посторонний по метке набора получает `alpha.30` — а в ней ядро `alpha.36`. Замер на установленном
наборе, пять форм: **пароль кириллицей ПРОХОДИТ в память**, ссылка на переменную окружения
запирается ложно. Обе формы вылечены в ядре `alpha.40`, которое опубликовано и принято.
Лечится одной командой публикации набора; правило вех — не моё, чтобы его снимать.

## 0.1.0-alpha.31 — 05.09.2026

Ядро поднято с `alpha.36` до `alpha.40` — до последней ПРИНЯТОЙ и опубликованной.

🔴 **Цена промедления измерена, а не оценена.** Что получал ставящий набор на a36:
```
пароль = "Секрет123#"        НЕ ловился  ← кириллический пароль уходил в память
token: process.env.MY_TOKEN  ловился     ← ложный отказ на ссылку, не на секрет
password: Secret.Pass1       ловился
```
На a40 все три верны. Первое — дыра, второе — ложный отказ; набор раздавал обе.

⚠️ **Секретарь ОСТАЛСЯ на `alpha.15`, хотя в реестре раздаётся `alpha.16`.** Не по недосмотру:
в файле принятых сумм вердикта на a16 НЕТ. Набор несёт принятое, и разнобой здесь законный —
набор прибивает точные версии, а метка пакета живёт своей жизнью. Появится вердикт — поднимем
отдельным номером.
📌 Из-за этого в наборе НЕТ лечения потери сводок компакта (долг 114): оно в a16. Тот, кто
ставит набор, получает секретаря, у которого отказ фильтра на сводке обрывает и дистилляцию.
Названо здесь, чтобы это не выглядело забытым.

Остальные пять — на своих принятых: byudzhet a8 · nudzh a12 · omega a10 · restore a18.

## 0.1.0-alpha.30 — 05.09.2026

**Набор пересобран на ПРИНЯТЫХ версиях. Прежний состав раздавал ядро четырёхдневной давности.**

    было  core a25 · omega a9  · secretary a14 · byudzhet a7 · nudzh a10 · restore a16
    стало core a36 · omega a10 · secretary a15 · byudzhet a8 · nudzh a12 · restore a18

🔴 **Что получал посторонний, поставив прежний набор** (замер на установленном a25):

    api_key=sk-abc123XYZ789      → НЕ ЛОВИЛСЯ  (закрыто в a29)
    password = Xk9#mQ2$vL8p      → НЕ ЛОВИЛСЯ  (закрыто в a31)
    пароль = "Секрет123#"        → НЕ ЛОВИЛСЯ  (закрыто в a38)
    token: process.env.MY_TOKEN  → запирался ЛОЖНО (закрыто в a37)
    rezhim не экспортирована — потребитель не мог спросить решение и держал свой список

Числа состава сняты ПРОГОНОМ в чистой установке принятых версий, а не счётом по коду.

**Проба «версия на диске совпадает с заявленной» переписана на «диск НЕ ПОЗАДИ».**
Прежняя стала ложно-красной ПО ПОСТРОЕНИЮ, когда мы ввели порядок «метку раздачи двигает
приёмка»: между выпуском и вердиктом диск ЗАКОННО идёт впереди — набор закрепляет принятое,
а в дереве лежит последнее выпущенное. Прибор не менялся, изменился порядок вокруг него.
Расхождением осталось «диск ПОЗАДИ состава»: тогда набор закрепляет то, чего в дереве нет.
Порча (состав требует alpha.99): с защитой — красное с именем пакета, без защиты — зелёное.

⚠️ **Граница:** набор закрепляет ПРИНЯТОЕ, а не последнее выпущенное. На 05.09 в реестре есть
core a39, vyvoz a4 и другие версии под меткой «не принято» — их здесь нет намеренно.

# Изменения

## 0.1.0-alpha.28 — 2026-09-04

Ядро `0.1.0-alpha.24`: 🔴 закрыта дыра, внесённая в `alpha.22` этого же ядра. Просмотр назад
у перечня слов-объявлений запрещал перед словом ещё и подчёркивание, и из правила выпадали
ВСЕ имена вида `FAL_API_KEY=`: они помечались как `entropiya` и ПРОХОДИЛИ в память, а со
слабым значением — без следа. Замер: `alpha.20` запирал 7 живых имён из 7, `alpha.23` — 0 из 7.
Набор `alpha.27` раздавал именно эту редакцию.

## 0.1.0-alpha.27 — набор догоняет ядро alpha.23

Ядро `0.1.0-alpha.23`: граница слова слева у перечня объявлений (alpha.21 принимал
`monkey=`, `hotkey=`, `myapikey=` за объявление ключа — 8 ложных из 8) и прогонщик
стендов вместо списка имён рукой (`npm test` у получателя прогонял один стенд из девяти).

Числа состава сняты прогоном в установленном каталоге и суммой предмета по канону,
а не переписаны из прошлой записи.

## 0.1.0-alpha.26 — набор догоняет byudzhet и nudzh; сверка состава переведена на реестр

    dsh-pamyat-byudzhet  0.1.0-alpha.6  → 0.1.0-alpha.7   (Э8.3: тепло-прибор, причина ≠ свойство)
    dsh-pamyat-nudzh     0.1.0-alpha.9  → 0.1.0-alpha.10  (долг 94: имя и версия при монтаже)

Версии взяты ИЗ РЕЕСТРА прямым запросом, а не из памяти о том, что публиковалось.

### 🔴 Проба сумм сверяет теперь РЕЕСТР, а не рабочее дерево

Состав описывает то, что получит ставящий, то есть опубликованные редакции. Дерево —
другой предмет: по правилу владельца правки копятся в репозитории между выпусками,
поэтому дерево ЗАКОННО опережает реестр, и проба по дереву в это время красная всегда.
04.09.2026 так и вышло: ядро несло в дереве непубликованную правку, проба краснела на
исправном составе — а красное «известной причины» через день перестают читать.

Тот же довод, что для тарбола против каталога: проверять надо **то, что поедет**.

⚠️ Цена: пробе нужна сеть. Нет сети или нет версии в реестре — слепота с названной
причиной, а не «сошлось» и не «расхождение». Расхождение печатается раньше слепоты.

Записи ведутся **от первой опубликованной версии**. Редакции, существовавшие до неё,
сюда не входят: они не уезжали к получателю, и их номера ничего не адресуют снаружи.

Источник дат — реестр npm (время публикации), источник содержания — работа, которой
эти выпуски вызваны. Даты в UTC.

## 0.1.0-alpha.24 — 2026-09-04

Набор догнал ядро `alpha.20`: режим отказа назначается каждому правилу отдельно —
объявленный и структурные запирают, энтропийное подозрение помечает и пропускает.
Числа состава сняты прогоном: предмет `af9dea3b9625b077`, файлов 18, проб 114.

## 0.1.0-alpha.23 — 2026-09-04

Набор догнал restore `alpha.16`: вставка несёт опознаватели поднятых записей,
без которых наследование уровня происхождения (Э5.3) неисполнимо по построению.
Числа состава сняты прогоном: предмет `967cf09941546b45`, файлов 8, проб 88 (было 82).

## 0.1.0-alpha.22 — 2026-09-04

Набор догнал ядро `alpha.19`: алфавит кандидата сужен по замеру на корпусе в 510 записей
знаний (18 ложных → 0 при том же покрытии живых ключей), добавлена проба «каждая форма
ключа отвергается СВОИМ признаком».
Числа состава сняты прогоном: предмет `dddf5efd53fa3eab`, файлов 18, проб 111.

## 0.1.0-alpha.21 — 2026-09-04

Набор догнал ядро `alpha.18`. Числа состава сняты прогоном: предмет `4ccb4854ce7d5265`,
файлов 18, проб 109.

## 0.1.0-alpha.20 — 2026-09-04

Набор догнал ядро `alpha.17`: закрыта дыра «слово=значение» в фильтре входа. Прежний
набор `alpha.19` отдавал бы ставящему ядро, в котором форма `КЛЮЧ=значение` — самая
частая там, где секреты и живут, — не проверялась вовсе.

Числа состава сняты прогоном: предмет `002fbe697b3e2ea4`, файлов 18, проб 109 (было 104).

## 0.1.0-alpha.19 — 2026-09-04

Набор догнал ядро `alpha.16` — фильтр входа Э5.2. Прежний набор `alpha.18` закреплял
ядро `alpha.15`, то есть ставящий получал редакцию без фильтра.

Числа состава сняты прогоном: предмет `65f403e6dff5e26d`, файлов 18, проб 104
(было 88 — прибавились стенд фильтра и пробы служебных полей).

## 0.1.0-alpha.18 — 2026-09-04

Набор догнал секретаря `alpha.14` — защита от двойного захода по одному срезу.

## 0.1.0-alpha.17 — 2026-09-04

Набор догнал секретаря `alpha.13` — состав пакета очищен от рабочих копий,
уехавших в тарбол вместе с объявленными каталогами.

## 0.1.0-alpha.16 — 2026-09-04

Ядро a14 → a15 (запись о невоспроизводимости a13 по тегу).

⚠️ Четвёртая сборка набора за сутки. Серия выпусков закончена, и перед этой сборкой
проверено ЗАМЕРОМ, что все шесть членов живут в реестре ровно теми редакциями, что на
машине, — иначе набор устарел бы прямо в момент выпуска.

## 0.1.0-alpha.15 — 2026-09-04

Секретарь a10 → a11: предел неокончательных отказов подряд.

⚠️ Третья пересборка набора за сутки, и это не суета, а цена устройства: набор закрепляет
точные версии, значит каждый выпуск члена делает его устаревшим. Разряд в сверщике теперь
это ловит, но лечение остаётся ручным — набор пересобирается ПОСЛЕ серии выпусков, а не
после каждого; иначе круг не кончится никогда.

## 0.1.0-alpha.14 — 2026-09-04

Набор догнал членов: ядро a13→a14, слой a8→a9, секретарь a9→a10.

До этой сборки ставящий `dsh-pamyat` получал ядро **без очереди недоставленного**, слой
**без `proverit`** (то есть ядро звало бы несуществующий метод) и секретаря с **падающим
швом** на отказе провайдера по деньгам.

🔴 **И это второй такой круг за сутки**, значит не случай, а свойство устройства: набор
закрепляет версии точными числами — иначе имя означало бы разные наборы, — и потому каждый
выпуск члена делает набор устаревшим МОЛЧА. Заведён разряд в сверщике публикаций: он
спрашивает реестр напрямую и краснеет, когда закреплённая версия разошлась с меткой члена.
Границу разряд называет сам: он сравнивает ЧИСЛА, а не содержимое, и не умеет отличить
намеренно старое закрепление от забытого — такое решение надо записывать отдельно.

## 0.1.0-alpha.13 — 2026-09-04

Набор приведён к тому, что действительно опубликовано: ядро a11→a13, секретарь a5→a9,
восстановление a14→a15. До этой сборки имя `dsh-pamyat` адресовало вчерашнее поведение —
ставящий получал ядро без write-through в долговременную память и без восьми классов
знаний, секретаря без учёта расхода и с порогом ответа 4000 (треть вызовов сгорала в
отказах), восстановление без печати версии при монтаже.

Числа состава сняты **из реестра npm**, а не из рабочего дерева: скачано с
`--prefer-online`, распаковано, посчитано каноном `summa-predmeta`. Число проб снято
**прогоном** стендов в установленных каталогах, где рядом стоят все шесть членов, — а не
счётом объявлений по коду.

🔴 Попутно найдено и вылечено: **репозиторий отстал от реестра у ядра и секретаря**.
Четыре файла легли в корень пакета вместо `src/` — копирование без каталога назначения
кладёт рядом, а не поверх. Коммиты выглядели содержательными (378 и 203 строки нового
кода), `git status` был чист, а `src/index.js` оставался прежним. То есть под тегами
`dsh-pamyat-core-v0.1.0-alpha.13`, `dsh-pamyat-secretary-v0.1.0-alpha.8` и `-v0.1.0-alpha.9`
лежал код, из которого опубликованное **не пересобирается**. Нашёл это не глаз, а стенд
состава: он считает суммы по рабочему дереву, и они разошлись с суммами из реестра.

## 0.1.0-alpha.12 — 2026-09-03

Состав догнал `dsh-pamyat-nudzh` 0.1.0-alpha.9 — редакцию, в которой у меры расхода
появился потребитель: напоминание вставляется модели в контекст, а не только кричит
в журнал. Без этого подъёма `npm i dsh-pamyat` притянул бы alpha.8, где напоминание
до модели не доходит.

Версия, сумма предмета, число файлов и число проб сняты ПРОГОНОМ с диска в момент
сборки, а не взяты из письма: за сутки предмет менялся быстрее, чем о нём успевали
договориться словами.

## 0.1.0-alpha.11 — 2026-09-03

Состав догнал реестр: `dsh-pamyat-restore` 0.1.0-alpha.13 → 0.1.0-alpha.14.

🔴 Почему это не косметика. alpha.13 несла крючок welcome-брифинга
`turn === 1 && step === 1` — первый шаг СЕССИИ, недостижимый на живой сессии, которая
переживает перезапуски. Ставивший метапакет получал слой C, который не мог сработать
никогда, и молчание было неотличимо от исправной работы. alpha.14 даёт достижимый
крючок (первый шаг после старта процесса) с пределом частоты.

🔴 Как это нашлось и что из этого следует. Не поиском: я сверяла суммы для соседней
задачи и увидела, что состав закрепляет редакцию на одну младше опубликованной.
Метапакет собирается ПОСЛЕ членов, и любой выпуск члена после сборки оставляет состав
позади молча — сам метапакет об этом не узнает. Отсюда правило круга: выпустил члена —
пересобери состав в том же круге, иначе имя набора адресует прошлое.

Заодно: описание говорило «набор из ПЯТИ пакетов» при шести членах, а английское
описание отстало на семь версий (называло пять членов версий alpha.9/6/3/4/4 и не знало
о restore вовсе) — при зелёном стенде. Проба README читала ТОЛЬКО русский файл. Это наш
класс парных объектов: рассинхрон двух описаний не виден ничем, кроме сверки самих
описаний, а проба, читающая одно из пары, даёт ровно ту уверенность, которой пара и
должна была помешать. Проба расширена на оба, каждое сверяется с составом отдельно;
контроль зрячести — две порчи, давшие разные ответы.

## 0.1.0-alpha.10 — 2026-09-03

Выпуск документационный, код не менялся: добавлен CHANGELOG.md (в состав), поле repository с directory. Номер поднят потому, что номер версии — имя предмета: правка манифеста или описания делает предмет другим, и сумма предмета при этом меняется всегда.

## 0.1.0-alpha.9 — 2026-09-03

Стенд состава у получателя без соседей отвечает кодом 2 «проверять нечем» вместо кода 1. Прежде посторонний, распаковавший тарбол без установки, получал «набор негоден» там, где на деле нечем было проверить.

## 0.1.0-alpha.8 — 2026-09-03

Первый выпуск. Метапакет семейства памяти: тянет шесть слоёв и держит состав в sostav.json, подтверждённый двумя руками.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке.

- `a9d99275c0be` (2026-09-04) — Набор переведён на следующую редакцию ядра `dsh-pamyat-core` — ту, что в CHANGELOG ядра описана как «Граница слова стала ИЗБИРАТЕЛЬНОЙ» (граница слова у key-семейства и русских слов есть, у token/secret/password/pwd/psk/llat/pin/credential — нет; закрыта запись в фигурных скобках с кавычкой перед разделителем; добавлено слитное `presharedkey`). Изменены зависимость в `package.json`, строка ядра в `sostav.json` (новая сумма предмета `08148cfe38585b53`; число файлов 19 и проб 121 не менялись) и таблица версий в `README.md`/`README.en.md`; прочие пять членов набора не менялись.
