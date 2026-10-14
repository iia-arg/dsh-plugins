# Сторожа и проверки · Guards and checks — dsh-pamyat

## Что есть · What exists

У пакета один стенд — `test/stend-sostava.mjs` (`npm test`), 11 проб — и контроль зрячести инструмента `summa-predmeta-2 --kontrol`. Постоянно работающих сторожей у пакета нет: стенд никто не зовёт по расписанию сам по себе. Его читатель — тот, кто собирает набор, принимает его или гоняет обход стендов (у авторов — ночной обход, который присылает красные строки людям).

The package has one stand — `test/stend-sostava.mjs` (`npm test`), 11 probes — and the tool's sight check `summa-predmeta-2 --kontrol`. The package has no always-on watchdogs: nothing runs the stand on a schedule by itself. Its reader is whoever builds or accepts the set, or runs a stand sweep (the authors run a nightly sweep that reports red lines to people).

## Пробы стенда · Stand probes

| № | Проба · Probe | Ловит · Catches | Не ловит · Misses | Нужны соседи · Needs siblings |
|---|---|---|---|---|
| 1 | стенд годен: инструмент и соседи найдены, контроль зрячести пройден · stand is fit: tool and siblings found, sight check passed | отсутствие инструмента или соседей; инструмент, не видящий правку байта или переименование · missing tool or siblings; a tool blind to a one-byte edit or a rename | годность самих членов · fitness of the members themselves | да · yes |
| 2 | сумма инструмента совпадает с заявленной · tool checksum matches the declared one | инструмент, исправленный на месте · a tool edited in place | изменение способа под новым именем без обновления состава · a method change under a new name without updating the composition | да · yes |
| 3 | зависимости = точные номера членов: равны составу и версии члена в дереве · dependencies are exact member versions equal to the composition and the member version in the tree | расхождение `package.json` и `sostav.json`; члена нет в дереве; версия члена в дереве иная; незаявленные зависимости (A-N-1873) · drift between `package.json` and `sostav.json`; member missing from the tree; a different member version in the tree; undeclared dependencies | что архив полки под этим номером — тот же предмет (проба 5) и равенство бою (проба 7) · that the shelf archive under that version is the same subject (probe 5) and equality with the install (probe 7) | да · yes |
| 4 | версии точные, без диапазонов · versions are exact, no ranges | `^`, `~`, `*`, `>`, `<`, ` - `, `x` как целый разряд · `^`, `~`, `*`, `>`, `<`, ` - `, `x` as a whole part | метки (`latest`), ссылки git · tags (`latest`), git links | нет · no |
| 5 | суммы предметов совпадают с архивом полки · subject checksums match the shelf archive | подменённый или пересобранный архив; правку каталога-члена без пересборки набора · a replaced or rebuilt archive; an edit to a directory member without rebuilding the set | архив, которого нет: это слепота, а не расхождение · a missing archive: blindness, not divergence | да · yes |
| 6 | число файлов совпадает с составом · file count matches the composition | неверное `faylov`; потерянный или лишний файл · a wrong `faylov`; a lost or extra file | — | да · yes |
| 7 | версии набора равны установленным · set versions equal installed ones | набор отстал от установленного или забежал вперёд (оба — красные с именем и разницей номеров) · the set lags behind or runs ahead of the installation (both red, with name and number gap) | установку, которую никто не запускает: стенд сам не ходит по расписанию · an installation nobody runs the stand against | да · yes |
| 8 | состав называет способ, а не только числа · the composition names its method, not just numbers | `sostav.json` без инструмента, его суммы, контроля или объяснения · `sostav.json` lacking tool, its checksum, control or rationale | правильность объяснения · whether the explanation is right | нет · no |
| 9 | всё, что читает стенд, есть в составе публикации · everything the stand reads is published | файл, который стенд читает, но `npm pack` не кладёт · a file the stand reads but `npm pack` omits | чтения, написанные не через `join(koren, '…')` · reads not written as `join(koren, '…')` | да · yes |
| 10 | русское описание перечисляет ровно состав · the Russian description lists exactly the composition | отставший `README.md`; член в README, которого нет в составе · a stale `README.md`; a member listed that is not in the composition | правильность описаний членов · correctness of member descriptions | нет · no |
| 11 | английское описание перечисляет ровно состав · the English description lists exactly the composition | то же для `README.en.md` · the same for `README.en.md` | расхождение двух README между собой: оба сверяются только с составом · drift between the two READMEs: both are checked only against the composition | нет · no |

Пробы 10 и 11 (русский и английский README) с A-N-1871 сверяют смысл, а не форму строки: каждый член состава и его версия должны стоять на одной строке в любой записи — строка с отступом, таблица, перечень. И обратно: любое имя `dsh-pamyat-<…>`, за которым на той же строке в пределах 40 знаков стоит номер вида `N.N.N`, считается заявкой члена, и его имя обязано быть в составе. Поэтому в README нельзя ставить имя постороннего пакета семейства рядом с номером версии — в любой форме, не только с отступом.

Since A-N-1871 probes 10 and 11 (Russian and English README) check meaning, not line shape: every member of the composition and its version must stand on one line in any notation — an indented line, a table, a list. And the other way round: any `dsh-pamyat-<…>` name followed on the same line within 40 characters by an `N.N.N` version is a member claim, and its name must be in the composition. So a README must not put the name of a foreign family package next to a version number — in any form, not only indented.

<a id="kody"></a>
## Коды возврата · Exit codes

| Код · Code | Значит · Meaning |
|---|---|
| 0 | все пробы зелёные · all probes green |
| 1 | есть провал по существу — объявление разошлось с фактом · a substantive failure — declaration diverged from the facts |
| 2 | слепота: не задана `STEND_POLKA` или `STEND_PLAGINY` (до всех проб) либо каждый провал — слепота (пробы, требующие ненайденных соседей, или пробы, сами назвавшие «СЛЕПОТА») · blindness: `STEND_POLKA` or `STEND_PLAGINY` is unset (before any probe), or every failure is blindness (probes needing siblings that were not found, or probes that named themselves "СЛЕПОТА") |

Код 2 не значит «набор годен» — он значит, что этот стенд набор не проверял.

Code 2 does not mean "the set is fit" — it means this stand did not check it.

**Слепота при найденных соседях.** Провал, который сама проба назвала «СЛЕПОТА» (нет полки или каталога установки, инструмент сумм или `npm pack` не исполнились, инструмент вышел с кодом 0, но суммы не дал), не считается расхождением: если других провалов нет, код 2. Прежде такие провалы давали код 1, а отказ npm (кэш не пишется) выглядел как «на полке undefined» и «Command failed». Проверено прогоном с npm без кэша: прежняя редакция — 6 из 11, код 1; эта — 6 из 11, код 2, все пять провалов названы слепотой. ⚠️ Инструмент `summa-predmeta-2` при отказе npm выходит с кодом 0 без суммы — стенд это ловит; сам инструмент закреплён суммой и правится только новым файлом.

**Blindness with siblings found.** A failure the probe itself named "СЛЕПОТА" (no shelf or installation directory, the checksum tool or `npm pack` did not run, the tool exited 0 without a checksum) is not counted as a divergence: with no other failures, exit 2. Before, such failures gave exit 1, and an npm failure (cache not writable) looked like "on the shelf undefined" and "Command failed". Verified with npm without a cache: the previous version — 6 of 11, exit 1; this one — 6 of 11, exit 2, all five failures named blindness. ⚠️ The `summa-predmeta-2` tool exits 0 without a checksum when npm fails — the stand catches that; the tool itself is pinned by checksum and is changed only as a new file.

## Как читать красное · How to read a red line

Каждая проба печатает `❌ <название> — <причина>`. Причина называет пакет, версию и оба числа — объявленное и найденное. Сначала смотрите пробу 1: если она красная, остальные числа ничего не значат.

Each probe prints `❌ <name> — <reason>`. The reason names the package, version and both numbers — declared and found. Look at probe 1 first: if it is red, the other numbers mean nothing.

| Строка · Line | Что делать · What to do |
|---|---|
| `инструмент ДРУГОЙ: на диске …, в составе …` | инструмент правили на месте: верните прежний файл или заведите новый под новым именем и пересчитайте состав · the tool was edited in place: restore it, or add a new tool under a new name and recount |
| `<пакет>@<версия>: на полке …, в составе …` | архив на полке не тот, что принимали: выясните, кто и когда его пересобрал · the shelf archive is not the accepted one: find out who rebuilt it and when |
| `бой …, набор … — набор ОТСТАЛ на N` | установили новее, чем записано в наборе: пересоберите набор под установленное · a newer version was installed than the set records: rebuild the set |
| `README.md не называет <пакет> <версия>` | состав обновили, описание — нет · the composition was updated, the description was not |

## Контроль зрячести инструмента · Tool sight check

`summa-predmeta-2 --kontrol` строит подставной пакет и проверяет, что сумма меняется от правки одного байта и от переименования файла. Он гоняет ту же функцию, что и обычный счёт: иначе контролировалось бы не то, чем меряют.

`summa-predmeta-2 --kontrol` builds a dummy package and checks that the checksum changes on a one-byte edit and on a file rename. It runs the same function as normal counting: otherwise it would check something other than what measures.
