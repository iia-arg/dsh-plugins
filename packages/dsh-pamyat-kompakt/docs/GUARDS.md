# Сторожа и проверки · Guards and checks — dsh-pamyat-kompakt

Модуль не держит своих фоновых сторожей и не шлёт тревог в мессенджеры: всё, что он знает о своей беде, он говорит **строкой журнала** процесса, который его импортировал (обычно журнал службы шлюза), или **исключением** зовущему. Читатель этих строк — человек или внешний сторож журнала. Каждая строка начинается префиксом с версией кода: `[kompakt <версия>]` (настройка, порог, решение) или `[kompakt-nash <версия>]` (вызов модели сводки).

The module runs no background guards of its own and sends no messenger alerts: whatever it knows about its own trouble it says as **a log line** of the process that imported it (usually the gateway service log) or as **an exception** to the caller. The reader of these lines is a person or an external log watcher. Every line starts with a prefix carrying the code version: `[kompakt <version>]` (settings, threshold, decision) or `[kompakt-nash <version>]` (summary model call).

## Сторожа внутри модуля · In-module guards

| Сторож · Guard | Что ловит · Catches | Чего НЕ ловит · Does NOT catch | Как звучит · How it sounds |
|---|---|---|---|
| Версия в каждой строке · Version in every line | Какой код держит процесс — версия читается из `package.json` рядом с кодом один раз при загрузке · Which code the process holds — read once at load from the `package.json` next to the code | Что процесс вообще перезапускался после обновления — это видно только сравнением версии в строке с версией на диске · Whether the process was restarted after an update — visible only by comparing the line's version with the one on disk | `[kompakt <версия>] …`; не прочиталась — `версия неизвестна` · unreadable → `версия неизвестна` |
| Граница имени агента · Agent name boundary | Выход чтения за каталог настроек (`../`) · Reading outside the settings directory (`../`) | — | `🔴 имя агента НЕГОДНО (…)` |
| Обязательный D · Mandatory D | Пропавший или испорченный файл настроек названного агента · A missing or broken settings file of a named agent | Устаревшее, но годное содержимое D · Outdated but valid D content | исключение импорта `настройка агента … НЕ НАЙДЕНА / НЕ ПРОЧИТАНА / НЕ РАЗОБРАНА` · import exception |
| Источник каждого значения · Source of every value | Настройка не доехала, хотя значение совпадает с умолчанием · Settings did not arrive even though the value equals the default | Неверное, но доехавшее значение · A wrong value that did arrive | `источники значений: модель … (настройка) · хвост … (умолчание модуля) …` |
| Устаревшие поля · Obsolete fields | Поля, которые больше не действуют (`dolyaPoroga`, `oknoModeli`, …) · Fields that no longer have effect | — | `поле … УСТАРЕЛО и игнорируется`, `oknoModeli УСТАРЕЛО` |
| Запрет ручного порога · Manual threshold ban | Попытку перебить порог окружением (`KOMPAKT_DOLYA/OKNO/POROG`) · An attempt to override the threshold via environment | — | исключение импорта · import exception |
| Порог не прочитан · Threshold not read | Негодный или пропавший `porogi` в D · Invalid or missing `porogi` in D | — | `🔴 порог из пресета НЕ ПРОЧИТАН: <причина>`; перед вызовом модели — отказ · refusal before the model call |
| Неизвестно ≠ ноль · Unknown ≠ zero | Поставщик не сообщил расход — решение `neizvestno`, а не «окно пустое» · The provider reported no usage — decision `neizvestno`, not "window empty" | Неверное, но числовое значение расхода · A wrong but numeric usage value | возврат `neizvestno` зовущему · return value to the caller |
| Имя поставщика обязательно · Provider name required | Пустое, из пробелов или неизвестное имя поставщика · An empty, whitespace or unknown provider name | — | исключение `ИМЯ ПОСТАВЩИКА НЕ ЗАДАНО / ЗАДАНО ПРОБЕЛАМИ / НЕИЗВЕСТЕН` · exception |
| Посылка openai · openai assumption | `input_tokens` меньше кэша — нормализация больше не верна · `input_tokens` below cache — the normalisation no longer holds | — | `🔴 ПОСЫЛКА НЕ ДЕРЖИТСЯ …`, некэш берётся 0 · non-cached taken as 0 |
| Ступени занятости · Occupancy steps | Тишину «ещё не дошло» отличают от «не измерено»: 60/80/95 % порога печатаются по разу (печать делает зовущий) · Distinguishes "not reached yet" from "not measured": 60/80/95 % printed once each (the caller prints) | Ничего, если зовущий не печатает · Nothing if the caller does not print | строки зовущего · caller's lines |
| Ключ по списку имён · Key by a list of names | Ключ под «чужим» именем переменной · A key under a "foreign" variable name | Негодный, но заданный ключ (это скажет провайдер) · An invalid but present key (the provider will say so) | `ключ для сводки не найден НИ ПОД ОДНИМ из имён: …` |
| Бюджет окна · Window budget | Вход, после которого под сводку не остаётся места · Input that leaves no room for the summary | Неверное окно модели в настройке · A wrong model window in the settings | `место под сводку не осталось: окно …` (исключение · exception) |
| Расход · Cost | Сколько токенов съела сводка; деньги — только при каталоге цен с источником · How many tokens a summary used; money only with a sourced price catalogue | Точность каталога цен · Accuracy of the price catalogue | `расход, ТОКЕНЫ (замер …)`, `расход, ДЕНЬГИ: …`, `🔴 расход НЕ СООБЩЁН` |
| Пустая сводка · Empty summary | Пустой ответ модели — сессия не трогается · An empty model answer — the session is untouched | — | исключение `сводка пуста — сессию НЕ трогаю` |
| Барьер метки режима · Mode-tag barrier | Ответ на задачу вместо сводки (нет `[MODE=…]` в первых 5 строках) · An answer to the task instead of a summary | Чужую метку, процитированную в первых строках ответа · A foreign tag quoted in the first lines of an answer | исключение `сводка нарушает договор промта …`, след отказа · exception, refusal trace |
| Пути против входа · Paths vs input | Путь в обратных кавычках, которого нет во входе (вероятная выдумка) · A backticked path absent from the input (likely invented) | Выдуманные имена и задачи без пути; путь, чей последний кусок случайно есть во входе · Invented names and tasks without a path; a path whose last segment happens to be in the input | пометка `⚠️ НЕТ ВО ВХОДЕ СЖАТИЯ` в сводке и строка `пути ответа против входа: проверено N, НЕТ ВО ВХОДЕ M` · mark in the summary + log line |
| Предохранитель «не навреди» · "Do no harm" fuse | Сводку не короче прозы — отдаётся проза с подписью «без сжатия» · A summary not shorter than the prose — the prose is returned with an "uncompressed" label | Плохую по смыслу, но короткую сводку · A short but poor summary | `ПРЕДОХРАНИТЕЛЬ: сводка … НЕ КОРОЧЕ прозы …` |
| Копия до перезаписи · Backup before rewrite | Потерю журнала при сбое — исходник остаётся рядом · Losing the log on failure — the original stays alongside | Заполнение диска копиями (модуль их не убирает) · The disk filling up with copies (the module does not remove them) | поле `zapas` в результате · `zapas` field in the result |

## Стенды · Stands

Все стенды запускаются из каталога пакета: `node stend-<имя>.mjs`. Сеть и ключ не нужны; модель подменяется (`globalThis.fetch`), временные каталоги убираются на любом выходе. Код выхода 0 — всё зелёное.

All stands run from the package directory: `node stend-<name>.mjs`. No network or key needed; the model is faked (`globalThis.fetch`), temporary directories are removed on any exit. Exit code 0 means all green.

| Стенд · Stand | Проб · Probes | Что держит · What it holds |
|---|---|---|
| `stend-boevogo-puti.mjs` | 7 | Рабочий путь сводки зовёт `strokiRashoda`, адрес и модель уходят из настройки в тело запроса; строка порога при подъёме · The production summary path calls `strokiRashoda`; endpoint and model go from the settings into the request body; the threshold line at start-up |
| `stend-istochnikov.mjs` | 12 | Источник каждого значения; настройка доезжает до расчёта; отказ при пропавшем/битом D и возврат · Source of each value; settings reach the computation; refusal on missing/broken D and recovery |
| `stend-last-output.mjs` | 1 | `zanyatostIzZhurnala` отдаёт выход последнего вызова (`vyhod` из `last_token_usage`), а не накопленный за сессию · `zanyatostIzZhurnala` returns the last call's output (`vyhod` from `last_token_usage`), never the session total |
| `stend-lenivyh-tekstovyh-nastroek.mjs` | 3 | Импорт не читает JSON размещения: недоступный (EACCES) и битый JSON отказывают только сводку, тот же процесс работает после ремонта; умолчание каталога D без JSON. Под root проба EACCES слепа — код 2 · Import does not read the deployment JSON: unreadable (EACCES) and malformed JSON refuse only the summary, the same process recovers after repair; the D directory default without JSON. Under root the EACCES probe is blind — exit 2 |
| `stend-metki-rezhima.mjs` | 6 | Барьер `[MODE=…]` и перенос метки в первую строку на настоящих формах ответов · The `[MODE=…]` barrier and tag relocation on real answer shapes |
| `stend-okna.mjs` | 7 | Чтение готовых маршрутов D, отсутствие пересчёта порога, отказ и возврат · Reading ready D routes, no threshold recomputation, refusal and recovery |
| `stend-pereklyuchatelej.mjs` | 5 | Исходы `reshitKompakt`, включая «не объявлено = сжимать» · `reshitKompakt` outcomes, including "undeclared = compress" |
| `stend-polnoy-zanyatosti.mjs` | 13 | Нормализация anthropic и openai на одном входе; отказы по имени поставщика · anthropic and openai normalisation on one input; provider-name refusals |
| `stend-predohranitelya.mjs` | 7 | `chtoOtdat`: предохранитель и порог «нечего сжимать»; проба, краснеющая на старом устройстве · `chtoOtdat`: the fuse and the "nothing to compress" threshold; a probe that turns red on the old design |
| `stend-putej-vhoda.mjs` | 10 | Пометка путей вне входа; оба рабочих выхода сводки зовут проверку · Marking paths outside the input; both production outputs call the check |
| `stend-ramki-i-otkaza.mjs` | 13 | Рамки стенограммы и хвоста, след отказа и удачи (права, ротация) · Transcript and tail frames, refusal and success trace (modes, rotation) |
| `stend-rashoda.mjs` | 9 | Строки расхода: токены отдельно от денег, отсутствие usage — не ноль · Cost lines: tokens separate from money, missing usage is not zero |
| `stend-sostava.mjs` | 10 | Состав архива пакета (`npm pack`): белый список `files`, контроль зрячести, новые стенды подбираются сами · Tarball contents (`npm pack`): the `files` white list, a sight check, new stands picked up automatically |
| `stend-svodki-porogov.mjs` | 9 | Устаревшая функция `svodkaPorogov` (сохранена, не вызывается) · The obsolete `svodkaPorogov` function (kept, not called) |
| `stend-tekstovyh-nastroek.mjs` | 10 | Подстановки размещения в настоящем теле запроса сводки, отказы негодного JSON размещения без сети · Deployment substitutions in the real summary request body, refusals of invalid deployment JSON without network |
| `stend-versii-v-zhurnale.mjs` | 6 | Версия в каждой строке и её происхождение из `package.json` рядом с кодом · The version in every line and its origin from the `package.json` next to the code |

Каждый стенд печатает итог «N из N»; красная проба называет причину. Стенды, которые поднимают модуль, делают это дочерним процессом: модуль читает настройку один раз при импорте.

Every stand prints an "N of N" total; a red probe names its reason. Stands that load the module do so in a child process: the module reads its settings once at import.

## Самопроверка · Self-check

`KOMPAKT_SAMOPROVERKA=1 node index.mjs` — 10 объявленных проб, коды 0 чисто · 1 расхождение · 2 слепота. Проверяет границы: не трогать сессию при отказе сводки, переписать ровно хвост + 2 строки, сохранить копию, не порвать цепочку `parentUuid`, правильно брать большой ход хвостом.

`KOMPAKT_SAMOPROVERKA=1 node index.mjs` — 10 declared probes, exit codes 0 clean · 1 mismatch · 2 blind. It checks boundaries: do not touch the session on summary refusal, rewrite exactly tail + 2 lines, keep a copy, keep the `parentUuid` chain, take a large turn by its tail.

⚠️ Пять проб идут через живой вызов модели и **без ключа слепы** (код 2). Две пробы ступеней требуют прочитанного порога (`KOMPAKT_AGENT` и файл D); без них проба «ступень растёт» краснеет, а «ниже первой доли нет ступени» проходит пусто. Без ключа и D ожидаемый итог: прогнано 5 из 10, зелёных 4, красных 1, слепых 5, код 2. Зрячая замена без сети — стенды выше.

⚠️ Five probes go through a live model call and are **blind without a key** (code 2). Two step probes need a threshold that was read (`KOMPAKT_AGENT` and a D file); without them "the step grows" turns red and "no step below the first share" passes vacuously. Without a key and D the expected result: 5 of 10 run, 4 green, 1 red, 5 blind, code 2. The sighted, network-free substitute is the stands above.

## Проверка размещения и модельных шаблонов · Deployment and model-template checks

Новый helper делает одну попытку чтения на вызов сжатия до первого успешного снимка (без внутренних повторов), отвергает не-файл, неизвестные/повторные ключи, неверные типы, пустые пути/подстановки и метки вне объявленного списка. Исходный JSON при ошибке разбора не печатается. Шаблоны обрабатываются перед вставкой материала, без рекурсивных замен. Отказ не вызывает провайдера. Не применяется к произвольным словам стенограммы, не проверяет их истинность, не удостоверяет администратора/владельца JSON и не обещает качество живой модели; это отдельная приёмка.

The helper attempts one read per compaction call until the first successful snapshot, without internal retries, rejecting non-files, unknown/duplicate keys, wrong types, empty paths/substitutions, and undeclared tokens. Parse failures do not print the JSON contents. Templates are rendered before material insertion without recursive replacement. Refusal does not call the provider. It does not constrain arbitrary transcript words, verify their truth, authenticate the JSON administrator/owner, or guarantee live model quality; those are separate acceptance checks.

Ошибка optional JSON не является отказом импорта платформы. Неуспешный снимок не сохраняется; ремонт позволяет следующему вызову пройти. Успешный снимок кешируется, поэтому эта проверка не обнаруживает последующую порчу файла до перезапуска. Импортные проверки обязательного D остаются прежними и не относятся к optional JSON.

Optional-JSON errors do not fail platform import. Failed snapshots are not stored, so repair permits the next call to succeed. A successful snapshot is cached; subsequent file corruption is not detected until restart. Existing mandatory-D import checks remain separate from optional JSON.
