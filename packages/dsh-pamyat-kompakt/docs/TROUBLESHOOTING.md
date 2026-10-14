# Поломки и лечение · Troubleshooting — dsh-pamyat-kompakt

Каждая запись — из реальной эксплуатации: признак, который видно в журнале, причина и лечение. Строки журнала модуля начинаются с `[kompakt <версия>]` или `[kompakt-nash <версия>]`.

Every entry comes from real operation: the sign visible in the log, the cause and the fix. The module's log lines start with `[kompakt <version>]` or `[kompakt-nash <version>]`.

## Модуль не загружается · The module does not load

| Признак · Sign | Причина · Cause | Лечение · Fix |
|---|---|---|
| Исключение `настройка агента <agent> НЕ НАЙДЕНА (<путь>)`; вместе с модулем не поднимается и шлюз · Exception `… НЕ НАЙДЕНА` (not found); the gateway does not start either | Задан `KOMPAKT_AGENT`, а файла D нет · `KOMPAKT_AGENT` set but no D file | Положить D в `KOMPAKT_NASTROJKI_KATALOG` или исправить имя агента. Модуль намеренно не откатывается к умолчаниям: тихая работа без настройки хуже явного отказа · Put the D file into `KOMPAKT_NASTROJKI_KATALOG` or fix the agent name. The module deliberately does not fall back to defaults |
| `ВНЕШНЯЯ настройка <agent> НЕ РАЗОБРАНА` · not parsed | В D битый JSON (часто — недописанный файл при ручной правке) · Broken JSON in D (often a half-written file after a manual edit) | Проверить `node -e 'JSON.parse(require("fs").readFileSync("<D>"))'`; писать D атомарно (временный файл + `mv`) · Validate the JSON; write D atomically |
| `KOMPAKT_DOLYA: порог задаётся сборкой porogi в D, перебив не поддерживается` | В окружении остался старый ручной перебив порога · An old manual threshold override is left in the environment | Убрать `KOMPAKT_DOLYA`, `KOMPAKT_OKNO`, `KOMPAKT_POROG` из окружения службы · Remove them from the service environment |

## Компакт не происходит · Compaction never happens

| Признак · Sign | Причина · Cause | Лечение · Fix |
|---|---|---|
| `🔴 порог из пресета НЕ ПРОЧИТАН: <причина>` | Поле `porogi` в D отсутствует или нарушает схему (см. SETTINGS) · `porogi` in D missing or violating the schema | Пересобрать D сборщиком настроек; причина в строке называет, что именно не так · Rebuild D; the reason names what is wrong |
| Контекст растёт, строк о сжатии нет; зовущий получает `neizvestno` · Context grows, no compaction lines; the caller gets `neizvestno` | Поставщик не сообщает расход, занятость неизвестна · The provider reports no usage, occupancy unknown | Найти, почему usage не доходит до зовущего; для Codex брать занятость из журнала (`zanyatostIzZhurnala`). «Неизвестно» намеренно не считается нулём · Find why usage does not reach the caller; for Codex read occupancy from the log. "Unknown" is deliberately not zero |
| Решение `vyklyuchen` · decision `vyklyuchen` | В D или окружении `kompaktShlyuzovoj` / `KOMPAKT_SHLYUZOVOJ` = false · switched off | Включить, если шлюзовой компакт нужен; не объявленный выключатель уже означает «сжимать» · Turn it on if needed; an undeclared switch already means "compress" |
| `файла сессии нет: …/.claude/projects/…` у агента на Codex · for a Codex agent | Codex кладёт журнал в `$CODEX_HOME/sessions/ГГГГ/ММ/ДД/rollout-…-<sid>.jsonl`, а `CODEX_HOME` в окружении процесса не задан · `CODEX_HOME` not set in the process environment | Задать `CODEX_HOME` процессу, который импортирует модуль · Set `CODEX_HOME` for the importing process |
| `в стенограмме нет текстовых ходов` · no text turns | Журнал в незнакомой схеме записи (модуль понимает `message.*` Claude SDK и `payload.type=="message"` Codex) · An unknown record scheme | Сверить формат журнала; новая схема добавляется в `stenogrammaHvostom` · Check the log format; a new scheme is added in `stenogrammaHvostom` |
| `в сессии N строк — резать нечего` · nothing to cut | Журнал короче `hvostStrok + 2` строк · The log is shorter than `hvostStrok + 2` | Норма для свежей сессии; при постоянном повторе уменьшить `hvostStrok` · Normal for a fresh session; if persistent, lower `hvostStrok` |

## Сводка не получается · The summary fails

| Признак · Sign | Причина · Cause | Лечение · Fix |
|---|---|---|
| `ключ для сводки не найден НИ ПОД ОДНИМ из имён: …` | Ключ лежит в окружении под другим именем (так бывало, когда соседний модуль в том же процессе брал его под своим именем) · The key lives under another variable name | Добавить это имя в `imenaKlyucha` в D или задать `KOMPAKT_API_KEY` · Add that name to `imenaKlyucha` or set `KOMPAKT_API_KEY` |
| `сводка: HTTP 400 … maximum context length is …` | `oknoSvodki` больше настоящего окна модели или поднят `KOMPAKT_ZN_NA_TOK` · `oknoSvodki` above the real window, or `KOMPAKT_ZN_NA_TOK` raised | Взять окно из отказа самой модели; `KOMPAKT_ZN_NA_TOK` без нового замера не увеличивать · Take the window from the model's own refusal; do not increase `KOMPAKT_ZN_NA_TOK` without measuring |
| `сводка: HTTP 400 … Invalid max_tokens value, the valid range of max_tokens is [1, N]` | `KOMPAKT_POTOLOK` выше потолка провайдера · above the provider ceiling | Поставить N из текста отказа · Set N from the refusal text |
| `место под сводку не осталось: окно …, вход ~… ток.` | Проза больше, чем помещается в окно модели сводки · The prose is larger than the summary model window allows | Ограничить вход `KOMPAKT_VHOD` (берётся хвост, обрезка подписывается) или взять модель с бо́льшим окном. Сессия при этом не тронута · Limit input with `KOMPAKT_VHOD` (the tail is taken, the cut labelled) or use a model with a larger window. The session is untouched |
| `сводка нарушает договор промта: нет первой строки MODE …` | Модель ответила на последнюю реплику вместо сводки · The model answered the last message instead of summarising | Вход и ответ лежат в `~/pamyat/otkazy-kompakta/`; проверить, что рамка подаётся (строка «рамка стенограммы не найдена» её бы назвала). Метка в первых 5 строках переносится сама · The input and answer are in `~/pamyat/otkazy-kompakta/`; check the frame is applied. A tag within the first 5 lines is moved automatically |
| Сводка обрывается на полуслове, компакт повторяется каждый ход · The summary is cut mid-word, compaction repeats every turn | Включены размышления модели сводки, рассуждение съедает потолок вывода · Summary model reasoning is on and eats the output ceiling | `razmyshleniya: false` (умолчание · default). Подъём потолка не лечит — проверено · Raising the ceiling does not help — verified |
| `промт сводки не найден` / `рамка стенограммы не найдена` | Пакет поставлен без файлов данных или переопределён путь · Package installed without data files, or a path override | Проверить состав пакета (`promt-svodki.txt`, `ramka-*.txt`) и `KOMPAKT_PROMT` / `KOMPAKT_RAMKA*` · Check the package contents and the overrides |

## Странности в числах · Odd numbers

| Признак · Sign | Причина · Cause | Лечение · Fix |
|---|---|---|
| Шлюз печатает «занято 17608987 из 945000 (1863%)» · "used … (1863%)" | Поставщик (Codex) отдаёт расход, накопленный за сессию, а не за вызов · Cumulative session usage instead of per-call | Брать занятость из журнала: `zanyatostIzZhurnala` / `zanyatostPoSvezhemuZhurnalu` читают `last_token_usage` · Read occupancy from the log via `last_token_usage` |
| `🔴 ПОСЫЛКА НЕ ДЕРЖИТСЯ: у openai input … < кэш …` | Поставщик изменил смысл полей usage · The provider changed the meaning of usage fields | Сверить поля с документацией поставщика и поправить нормализацию в `VEDRA_POSTAVSHCHIKA` · Check the fields and fix the normalisation |
| Занятость завышена в несколько раз, «склеенные» числа · Occupancy inflated, "glued" numbers | Поле usage пришло строкой · A usage field arrived as a string | Модуль приводит вёдра `Number(...)`; если видно у зовущего — то же самое у зовущего · The module coerces buckets with `Number(...)`; do the same in the caller |
| `ПРЕДОХРАНИТЕЛЬ: сводка … НЕ КОРОЧЕ прозы …` | На малом входе сводка «раскладывает», а не сжимает · On small input the summary expands rather than compresses | Норма: агенту отдана проза с честной подписью. Чтобы не звать модель на мелочи — `minProzaZnakov` · Normal: prose returned with an honest label. To skip tiny inputs set `minProzaZnakov` |

## Настройка «не действует» · A setting "has no effect"

| Признак · Sign | Причина · Cause | Лечение · Fix |
|---|---|---|
| Поправили D, а модель/адрес/хвост прежние · D edited, but model/endpoint/tail unchanged | Значения читаются один раз при импорте · Values are read once at import | Перезапустить процесс; проверить строку `источники значений: …` — в скобках должно стоять «настройка» · Restart; the `источники значений` line must say «настройка» (settings) |
| Версия в строках журнала не та, что на диске · The version in log lines differs from the one on disk | Процесс держит старый код в памяти · The process holds old code in memory | Перезапустить службу, которая импортирует модуль · Restart the importing service |
| Поле `oknoModeli` / `dolyaPoroga` «игнорируется» · ignored | Устаревшие имена · Obsolete names | `oknoModeli` → `oknoSvodki`; доля порога — только через `porogi` · threshold share only via `porogi` |
| После компакта агент пишет о себе под чужим именем · After compaction the agent refers to itself by another name | В D нет поля `imya` или промт старого вида без `{{OT_LICA}}` · No `imya` in D, or an old prompt without `{{OT_LICA}}` | Задать `imya`; строка `промт старый, имя не подставлено` называет второй случай · Set `imya`; a log line names the second case |

## Обслуживание · Maintenance

| Признак · Sign | Причина · Cause | Лечение · Fix |
|---|---|---|
| Рядом с журналами копятся файлы `*.bak-pre-kompakt-*` · `*.bak-pre-kompakt-*` files pile up | Копия делается перед каждым сжатием и модулем не удаляется · A copy is made before every compaction and never removed by the module | Убирать внешним уходом по сроку, когда копии больше не нужны для разбора · Remove them with an external age-based cleanup |
| В сводке пометка `⚠️ НЕТ ВО ВХОДЕ СЖАТИЯ` · The mark appears in a summary | Модель назвала путь, которого не было в сжимаемом тексте · The model named a path absent from the compressed text | Не верить этому пути без проверки; вход лежит в `~/pamyat/udachi-kompakta/` · Do not trust the path without checking; the input is in `~/pamyat/udachi-kompakta/` |
