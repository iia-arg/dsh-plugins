# Неполадки · Troubleshooting — dsh-pamyat

Каждая запись — из реального опыта сборки и приёмки набора: признак, который вы видите, причина и что делать. Сначала всегда смотрите две строки шапки стенда — `инструмент:` и `соседи:`: они говорят, какую раскладку стенд нашёл, и без них числа ниже не читаются.

Each entry comes from real experience building and accepting the set: the symptom you see, the cause and what to do. Always look first at the two header lines of the stand — `инструмент:` (tool) and `соседи:` (siblings): they say which layout the stand found, and without them the numbers below cannot be read.

## Сводка · Summary

| Признак · Symptom | Причина · Cause | Раздел · Section |
|---|---|---|
| `соседи: НЕ НАЙДЕНЫ`, код 2 · exit 2 | пакет стоит отдельно от членов набора · the package sits apart from the set members | [1](#t1) |
| проба 7 «СЛЕПОТА», код 2 · probe 7 "СЛЕПОТА", exit 2 | нет каталога установленных плагинов · no installed-plugins directory | [2](#t2) |
| `инструмент ДРУГОЙ` · tool differs | `summa-predmeta-2` правили на месте · `summa-predmeta-2` edited in place | [3](#t3) |
| сумма предмета не сходится с архивом · subject checksum differs from the archive | архив пересобран под тем же номером · archive rebuilt under the same version | [4](#t4) |
| `набор ОТСТАЛ на N` / `ВПЕРЕДИ боя на N` | установили другую версию члена · a different member version was installed | [5](#t5) |
| `README… не называет <пакет> <версия>` | состав обновили, описание — нет · composition updated, description not | [6](#t6) |
| своя реализация суммы даёт другое число · your own checksum implementation gives another number | способ пересказан словами · the method was retold in words | [7](#t7) |
| `тело пробы вернуло …` · probe body returned … | проба сказала «нет» возвратом · a probe said "no" by returning | [8](#t8) |
| после прерванного прогона остались временные каталоги · temp dirs left after an interrupted run | процесс убит `SIGKILL` · process killed with `SIGKILL` | [9](#t9) |

<a id="t0"></a>
## 0. `СЛЕПОТА: не задана STEND_…`, код 2 · `СЛЕПОТА: не задана STEND_…`, exit 2

**Признак.** Первая строка стенда — `СЛЕПОТА: не задана STEND_POLKA и/или STEND_PLAGINY — сверять не с чем`, проб нет, код 2.

**Symptom.** The first stand line is `СЛЕПОТА: не задана STEND_POLKA и/или STEND_PLAGINY` (blindness: not set), no probes run, exit 2.

**Причина.** Пути машины стенд берёт только из переменных, умолчания нет: иначе он молча сверял бы с чужой раскладкой.

**Cause.** The stand takes machine paths only from variables, with no default: otherwise it would silently compare against someone else's layout.

**Лечение.** Задайте обе переменные — в команде или в среде того, кто зовёт стенд (см. [SETTINGS.md](SETTINGS.md#stend_boj)).

**Fix.** Set both variables — on the command line or in the environment of whoever calls the stand (see [SETTINGS.md](SETTINGS.md#stend_boj)).

<a id="t1"></a>
## 1. `соседи: НЕ НАЙДЕНЫ`, код 2 · `соседи: НЕ НАЙДЕНЫ`, exit 2

**Признак.** Шапка стенда пишет `соседи: НЕ НАЙДЕНЫ`, часть проб красная со словами «проверить суммы НЕЧЕМ», итог меньше 11, код возврата 2.

**Symptom.** The stand header says `соседи: НЕ НАЙДЕНЫ` (siblings not found), some probes are red saying "nothing to check checksums with", the total is under 11, exit code 2.

**Причина.** Стенд ищет соседний пакет `dsh-pamyat-core` в двух раскладках: рядом с метапакетом (плоский каталог поставки или общий `node_modules` получателя) и на два уровня выше (рабочее дерево семейства, `packages/<имя>`). Если ни там, ни там его нет, сверять не с чем. Это отказ проверки, а не набора: первая редакция стенда знала одну раскладку и в чужой выдавала сырое «No such file», которое выглядело как «пакет сломан».

**Cause.** The stand looks for the sibling package `dsh-pamyat-core` in two layouts: next to the metapackage (a flat delivery directory or the recipient's shared `node_modules`) and two levels up (the family working tree, `packages/<name>`). If it is in neither place, there is nothing to compare against. This is a failure of the check, not of the set: the first version of the stand knew one layout and in any other printed a raw "No such file" that looked like "the package is broken".

**Лечение.** Запускайте стенд там, где члены набора стоят рядом: в рабочем дереве семейства или после установки членов (`npm install --install-links`, см. README), когда они легли в тот же `node_modules`; установка самого набора из дерева членов не ставит. Код 2 не читайте как «годен»: этот прогон набор не проверял.

**Fix.** Run the stand where the set members sit side by side: in the family working tree, or after installing the members (`npm install --install-links`, see README) so they land in the same `node_modules`; installing the set itself from the tree installs no members. Do not read exit 2 as "fit": this run did not check the set.

<a id="t2"></a>
## 2. Пробы пишут «СЛЕПОТА», код 2 · Probes say "СЛЕПОТА", exit 2

**Признак.** Соседи найдены, часть проб красная со словами `СЛЕПОТА: каталога … нет`, `СЛЕПОТА (среда): контроль зрячести инструмента не исполнился`, `СЛЕПОТА (среда): npm pack не исполнился` или `инструмент не дал суммы`; код 2.

**Symptom.** Siblings are found, some probes are red with `СЛЕПОТА: каталога … нет`, `СЛЕПОТА (среда): …` (the tool or `npm pack` did not run) or `инструмент не дал суммы` (the tool gave no checksum); exit 2.

**Причина.** Сверять не с чем: каталог из `STEND_PLAGINY` (или `STEND_BOJ`) либо полка из `STEND_POLKA` не существуют, или npm не может работать — чаще всего не пишется его кэш в `$HOME` (так бывает в песочнице). Это отказ проверки, а не набора; провал по существу в том же прогоне перебивает слепоту (код 1).

**Cause.** Nothing to compare with: the directory from `STEND_PLAGINY` (or `STEND_BOJ`) or the shelf from `STEND_POLKA` does not exist, or npm cannot work — most often its cache in `$HOME` is not writable (as in a sandbox). This is a failure of the check, not of the set; a substantive failure in the same run overrides blindness (exit 1).

**Лечение.** Укажите свою установку: `STEND_PLAGINY=<каталог плагинов>` или `STEND_BOJ=<каталог node_modules с установленными плагинами>`; для npm — `npm_config_cache=<каталог, куда можно писать>`. Если установки нет вовсе, читайте этот красный как «не проверено», а не как «разошлось».

**Fix.** Point the stand at your installation: `STEND_PLAGINY=<plugins dir>` or `STEND_BOJ=<node_modules directory with installed plugins>`; for npm — `npm_config_cache=<a writable directory>`. If there is no installation at all, read this red line as "not checked", not as "diverged".

<a id="t3"></a>
## 3. `инструмент ДРУГОЙ: на диске …, в составе …` · tool differs

**Признак.** Проба 2 красная: сумма файла `summa-predmeta-2` на диске не равна `kak_schitano.summa_instrumenta` в `sostav.json`.

**Symptom.** Probe 2 is red: the checksum of the `summa-predmeta-2` file on disk does not equal `kak_schitano.summa_instrumenta` in `sostav.json`.

**Причина.** Инструмент исправили на месте. Однажды одно и то же имя файла подряд носили шесть разных редакций инструмента, а числа предметов при этом выглядели безупречно: прибор, разойдясь, врёт обо всём, что им померено. Поэтому сумма инструмента проверяется наравне с числами.

**Cause.** The tool was edited in place. Once, the same file name was carried by six different tool versions in a row while the subject numbers looked flawless: a drifting instrument lies about everything it measured. That is why the tool checksum is checked on par with the numbers.

**Лечение.** Верните прежний файл. Если способ действительно меняется — заведите инструмент под новым именем, пересчитайте им все суммы состава и обновите `kak_schitano`. Все числа, снятые изменённым инструментом, считайте недействительными.

**Fix.** Restore the previous file. If the method really changes, add the tool under a new name, recount every composition checksum with it and update `kak_schitano`. Treat every number taken with the edited tool as invalid.

<a id="t4"></a>
## 4. Сумма предмета не сходится с архивом полки · Subject checksum differs from the shelf archive

**Признак.** Проба 5 красная: `<пакет>@<версия>: на полке …, в составе …`. Часто вместе с ней краснеет проба 6 — число файлов.

**Symptom.** Probe 5 is red: `<package>@<version>: на полке …, в составе …` (on the shelf …, in the composition …). Probe 6 — the file count — often goes red with it.

**Причина.** Архив члена под тем же номером версии пересобрали: номер не изменился, содержимое — да. Номер версии врёт в обе стороны — бывает один номер на двух разных редакциях, — поэтому свежесть устанавливается суммой, а не номером. Для члена, который стоит каталогом (поле `katalog`), то же самое значит правку файлов каталога без пересборки набора.

**Cause.** A member archive was rebuilt under the same version number: the number did not change, the content did. Version numbers lie both ways — one number can cover two different builds — so freshness is established by checksum, not by number. For a member installed as a directory (the `katalog` field), the same means files in the directory were edited without rebuilding the set.

**Лечение.** Выясните, какой архив принимали: сумма в `sostav.json` — его отпечаток. Либо верните принятый архив, либо выпустите член под новым номером и пересоберите набор.

**Fix.** Find out which archive was accepted: the checksum in `sostav.json` is its fingerprint. Either restore the accepted archive, or release the member under a new number and rebuild the set.

<a id="t5"></a>
## 5. `набор ОТСТАЛ на N` или `набор ВПЕРЕДИ боя на N` · the set lags or runs ahead

**Признак.** Проба 7 красная с именем члена и разницей номеров.

**Symptom.** Probe 7 is red with the member name and the version gap.

**Причина.** Установленная версия члена не равна записанной в наборе. «Отстал» — член обновили отдельно, а набор не пересобрали; «впереди» — набор собрали под версию, которую ещё не поставили.

**Cause.** The installed member version does not equal the one recorded in the set. "Lags" — the member was updated separately and the set was not rebuilt; "ahead" — the set was built for a version that has not been installed yet.

**Лечение.** Приведите одно к другому: пересоберите набор под установленное или поставьте версии из набора. Расходиться молча им нельзя — для этого метапакет и существует.

**Fix.** Bring one in line with the other: rebuild the set for what is installed, or install the set's versions. They must not drift silently — that is what the metapackage exists for.

<a id="t6"></a>
## 6. `README.md не называет <пакет> <версия>` · README does not name a member

**Признак.** Проба 10 или 11 красная.

**Symptom.** Probe 10 or 11 is red.

**Причина.** Состав обновили, а описание — нет; или в README на одной строке оказались имя пакета семейства, которого в составе нет, и номер версии в пределах 40 знаков — в любой форме: пробы считают это заявкой члена.

**Cause.** The composition was updated but the description was not; or a README has, on one line, the name of a family package that is not in the composition and a version number within 40 characters — in any form: the probes treat this as a member claim.

**Лечение.** Обновите таблицу состава в обоих README из `sostav.json` (имя и версия — на одной строке). Не ставьте имя постороннего пакета семейства рядом с номером версии.

**Fix.** Update the composition table in both READMEs from `sostav.json` (name and version on one line). Do not put a foreign family package name next to a version number.

<a id="t7"></a>
## 7. Своя реализация суммы даёт другое число · Your own checksum implementation gives another number

**Признак.** Вы посчитали сумму предмета по описанию — число не совпадает с `sostav.json`, хотя пакет тот же.

**Symptom.** You computed the subject checksum from a description — the number does not match `sostav.json`, although the package is the same.

**Причина.** Способ легко пересказать словами, но две добросовестные реализации по словам уже давали разные числа на одних и тех же пакетах: порядок полей в строке, завершающий перевод строки, локаль сортировки.

**Cause.** The method is easy to retell in words, but two honest implementations from words already produced different numbers on the same packages: field order in the line, trailing newline, sort locale.

**Лечение.** Не реализуйте способ заново. Сверьте сумму файла `summa-predmeta-2` с `kak_schitano.summa_instrumenta` и запустите его — способ существует ровно в одном экземпляре.

**Fix.** Do not reimplement the method. Check the `summa-predmeta-2` file checksum against `kak_schitano.summa_instrumenta` and run it — the method exists in exactly one copy.

<a id="t8"></a>
## 8. `тело пробы вернуло «…» — пробы говорят только исключением` · probe body returned a value

**Признак.** Проба красная с этой причиной после правки стенда.

**Symptom.** A probe is red with this reason after the stand was edited.

**Причина.** Пробы стенда говорят «нет» только исключением. Раньше засчитывалось одно отсутствие исключения, и тело, вернувшее `false`, выходило зелёным. Теперь любой возврат, кроме `undefined`, — провал.

**Cause.** Stand probes say "no" only by throwing. Previously only the absence of an exception was counted, and a body that returned `false` came out green. Now any return value other than `undefined` is a failure.

**Лечение.** В новой пробе бросайте `Error` с причиной словами, а не возвращайте значение. Асинхронные тела не годятся: промис тоже возврат, и отказ внутри него стенд не дождётся.

**Fix.** In a new probe, throw an `Error` with a reason in words instead of returning a value. Async bodies do not work: a promise is a return value too, and the stand will not wait for a failure inside it.

<a id="t9"></a>
## 9. После прерванного прогона остались временные каталоги · Temp directories left after an interrupted run

**Признак.** Во временном каталоге системы лежат распакованные архивы членов после прогона.

**Symptom.** Unpacked member archives remain in the system temp directory after a run.

**Причина.** Стенд убирает своё временное на обычном выходе, на падении пробы и на `SIGTERM`/`SIGINT` (обходчик стендов гонит их с пределом времени). От `SIGKILL` не спасает ничто.

**Cause.** The stand removes its temp data on normal exit, on a probe failure and on `SIGTERM`/`SIGINT` (stand sweepers run it with a time limit). Nothing protects against `SIGKILL`.

**Лечение.** Останавливайте стенд `SIGTERM`, а не `SIGKILL`; оставшееся после `SIGKILL` удалите вручную.

**Fix.** Stop the stand with `SIGTERM`, not `SIGKILL`; remove what remains after a `SIGKILL` by hand.
