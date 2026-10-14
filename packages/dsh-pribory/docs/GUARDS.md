# Проверки и стенды · Checks and stands

В пакете нет сторожей с таймером и нет каналов тревоги: приборы кричат только строками вывода и кодом возврата. Читатель у них — тот, кто их зовёт: рука агента или сторож машины, который разбирает код. Пакет такого сторожа не назначает; без назначенного читателя код `1` или `2` никто не увидит.

The package has no timer watchers and no alert channels: the tools shout only with output lines and an exit code. Their reader is whoever calls them: an agent's hand or a machine watcher that parses the code. The package assigns no such watcher; without an assigned reader, a code `1` or `2` is seen by nobody.

Контракт кодов у читающих приборов один: `0` — сошлось, `1` — найдено расхождение, `2` — проверять нечем (слепота). Слепота нарочно не равна нулю: «не смог прочитать» не даёт права сказать «чисто».

Reading tools share one code contract: `0` — matches, `1` — a divergence found, `2` — nothing to check with (blindness). Blindness is deliberately not zero: "could not read" gives no right to say "clean".

## Стенды · Stands

Стенды лежат в `test/` и зовутся по одному: `bash test/<стенд>`. Итог печатается последней строкой вида «итог: N из M», код `0` — всё сошлось, `1` — есть расхождение, `2` — стенду проверять нечем.

Stands live in `test/` and are run one by one: `bash test/<stand>`. The result is the last line, "итог: N из M"; code `0` — all match, `1` — a divergence, `2` — the stand has nothing to check with.

### `stend-nastrojki.sh`

Ловит: разборщик файла настройки на трёх языках расходится (последнее вхождение, комментарий, пробелы и табуляции по краям, значения с `:`, `*`, `{agent}`, `;`, `=`, кириллицей); копии разборщика в модулях одного языка перестали быть побайтно равны; модуль при пустой настройке не отказывает кодом `2` или не называет свой ключ; ключ из файла не доходит до модуля (`dvojniki`, `ubrat`, `refresh-skill-links`); значение с « #» не отказано (у разборщика каждого языка и у 13 модулей) или `#` без пробела не сохранён в значении.

Catches: the three-language settings parser diverging (last occurrence, comment, spaces and tabs around, values with `:`, `*`, `{agent}`, `;`, `=`, Cyrillic); parser copies in modules of one language no longer byte-identical; a module not refusing with code `2` on empty settings or not naming its key; a key from the file not reaching the module; a value with " #" not refused (in each language's parser and in 13 modules) or `#` without a space not kept in the value.

🔴 Чего НЕ ловит: верность боевых значений — это сверка файла монтажа, а не стенд пакета; модули без ключей (`progon`, `pogasit`, `polozhit`, `priznak-vzyatiya.mjs`, `iskat-miny-oblasti.mjs`, `dsh-dump-kopiya`); `proba-v-katalog` — у него нейтральное умолчание `/` и отказа нет; `kto-podnimal` — его проверяют два стенда ниже.

🔴 Does NOT catch: correctness of production values — that is a check of the deployment file, not a package stand; modules without keys; `proba-v-katalog` (neutral default `/`, no refusal); `kto-podnimal` — the two stands below check it.

Подмешивание настройки машины исключено: стенд подаёт свой `DSH_PRIBORY_CONF` во временном каталоге. Каталог модулей меняет `STEND_BIN`.

Machine settings cannot leak in: the stand passes its own `DSH_PRIBORY_CONF` in a temporary directory. `STEND_BIN` changes the module directory.

### `stend-kto-podnimal-bajty.sh`

Ловит: `kto-podnimal` на записи `sudo` не в UTF-8 (обрезанная буква), которую `journalctl` без `-a` отдаёт как `[N B blob data]`: рука должна быть названа, «откуда» — найдено по карте `KTO_OTKUDA`, соседи по заходу — найдены, прибор не падает; учётка с цифрой, дефисом и подчёркиванием (`agent-2_x`) названа именем, а не строкой журнала целиком. Подставной `journalctl` стенд кладёт первым в `PATH`, боевой журнал не читается.

Catches: `kto-podnimal` on a non-UTF-8 `sudo` record (a cut letter), which `journalctl` without `-a` returns as `[N B blob data]`: the hand must be named, "from where" found via the `KTO_OTKUDA` map, session neighbours found, and the tool must not crash; an account with a digit, hyphen and underscore (`agent-2_x`) is named by its name, not as the whole journal line. The stand puts a stand-in `journalctl` first on `PATH`; the real journal is not read.

🔴 Чего НЕ ловит: живой журнал машины; имя учётки другой формы, чем `agenta` и `agent-2_x` (проба 6), — проверены только эти две.

🔴 Does NOT catch: the machine's live journal; an account name of another form than `agenta` and `agent-2_x` (probe 6) — only these two are checked.

### `stend-kontrakt-kodov.sh`

Ловит: пропажу ветки `exit 1` в строках кода — упоминание в комментарии не засчитывается (сторож, судящий по коду, молчал бы при живом обходе) и три исхода на подставном журнале ворот — журнала нет → `2`; журнал пуст при настоящих подъёмах → `1`; все подъёмы записаны → `0` со строкой «сверено с журналом ворот». Зелёный `0` без этой строки не засчитывается: «подъёмов в окне НЕ БЫЛО» тоже даёт `0`, и стенд считает такой исход слепотой.

Catches: a missing `exit 1` branch in code lines — a mention in a comment does not count (a watcher judging by code would stay silent on a live bypass) and three outcomes on a stand-in gate log — no log → `2`; empty log with real starts → `1`; all starts recorded → `0` with the line "сверено с журналом ворот". A green `0` without that line does not count: "no starts in the window" also gives `0`, and the stand treats it as blindness.

Требует: службу с подъёмом (`STEND_SLUZHBA`, без неё — код `2`); окно — от её последнего подъёма (`ActiveEnterTimestamp` − 2 мин), нет подъёма или строки `Started` в окне — СЛЕПОТА стенда, код `2`, и `sudo -n journalctl`: стенд строит «чистый» журнал ворот из боевого журнала службы. Где `sudo` не работает, третья проба краснеет ложно — см. [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

Requires: a service with a start (`STEND_SLUZHBA`, without it — code `2`); the window starts at its last start (`ActiveEnterTimestamp` − 2 min), no start or no `Started` line in the window — stand BLINDNESS, code `2`, and `sudo -n journalctl`: the stand builds the "clean" gate log from the service's real journal. Where `sudo` does not work, the third probe goes falsely red — see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

🔴 Чего НЕ ловит: верность разряда «откуда» и имени руки — это `stend-kto-podnimal-bajty.sh`; подъёмы до последнего (окно — от последнего подъёма).

🔴 Does NOT catch: correctness of the "from where" class and the hand name — that is `stend-kto-podnimal-bajty.sh`; starts before the last one (the window begins at the last start).

### `stend-skill-links.sh`

Ловит: `refresh-skill-links` на подставных источниках скиллов — дубль имени между источниками (код `1`, назван поимённо, ссылка ведёт на источник с приоритетом); пропажа источника (`1`); настоящий каталог в цели (`1`, каталог не удаляется); цель-ссылка или цели нет (`2`); поле `name` в `SKILL.md` расходится с каталогом, пропало или повторяется. Отказ без источников проверяет `stend-nastrojki.sh`.

Catches: `refresh-skill-links` on stand-in skill sources — a name duplicated across sources (code `1`, named, the link goes to the priority source); a missing source (`1`); a real directory in the target (`1`, not deleted); the target is a link or absent (`2`); the `name` field in `SKILL.md` differing from the directory, missing or duplicated. Refusal without sources is checked by `stend-nastrojki.sh`.

🔴 Чего НЕ ловит: живые каталоги скиллов и каталог ссылок движка; видит ли движок собранные ссылки — проверяется только живой сессией.

🔴 Does NOT catch: live skill directories and the engine's link directory; whether the engine sees the built links is checked only by a live session.

## Как читать ответ прибора · Reading a tool's answer

Код без строки не читать: у `kto-podnimal` код `0` значит и «сверено с журналом ворот», и «подъёмов в окне НЕ БЫЛО». Сторож, который зовёт прибор, должен различать их по строке «ИТОГ».

Do not read the code without the line: for `kto-podnimal`, code `0` means both "checked against the gate log" and "no starts in the window". A watcher calling the tool must tell them apart by the "ИТОГ" line.

Слово «СЛЕПОТА» и код `2` значат «проверить нечем»: не задан ключ, не читается журнал, нет прав. Это не «чисто» и не «плохо», это несостоявшийся замер.

The word "СЛЕПОТА" and code `2` mean "nothing to check with": a key is unset, a journal is unreadable, no rights. This is neither "clean" nor "bad"; it is a measurement that did not happen.

## Аудитный runtime-стенд · Audit runtime stand

stend-audit-runtime.py проверяет реальные команды с синтетическими файлами, подставными системными командами, реестром и Node-платформой. Сигналы не уходят настоящим процессам, systemctl не обращается к машине; журналы, профили, секреты и каталоги навыков — только временные. Проверяет и исправные входы, и отказ наблюдателя; каждому методу соответствует именованный результат unittest. Корректность настроек sudo/групп/живого журнала и поведения настоящего агента — вне покрытия.

stend-audit-runtime.py exercises real commands using synthetic files, substitute system commands, a registry and a Node platform. Signals never reach real processes and systemctl never contacts the host; journals, profiles, secrets and skill directories are temporary. It tests healthy inputs and observer failures, with named unittest results. Real sudo/group/journal settings and actual agent behaviour are outside its coverage.

stend-skill-links сам кладёт подставной agent-registry первым в PATH. Разрешённый набор и права реального реестра этим не проверяются; временно недоступный источник сохраняет существующие ссылки и даёт код1.

stend-skill-links places its own substitute agent-registry first in PATH. It does not check the actual allowed set or registry permissions; an unavailable source preserves existing links and returns1.
