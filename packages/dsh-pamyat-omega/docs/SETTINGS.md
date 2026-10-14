# Настройки соединения и выдачи · Connection and retrieval settings

| Имя · Name | Тип · Type | Умолчание · Default | Смысл и пример · Meaning and example | Ошибка · Failure |
|---|---|---|---|---|
| `adres` | string | Не задано · Absent | `https://memory.example.com/mcp/` | Пусто или нет завершающего `/`: связь не создана · Empty or no trailing `/`: connection unavailable |
| `klyuchIzOkruzheniya` | string | Имени нет · No name | `MEMORY_SERVICE_KEY`, значение считывается из env процесса · Reads value from process env | Имя задано, значение пусто/не пришло — отказ; имя не задано — нет Authorization · Named but missing/empty value refuses; no name sends no Authorization |
| `tajmautMs` | number | `10000` | Один network запрос записи/чтения · Per network write/read-back request | Не общий срок двухшагового сохранения · Not the total two-step save duration |
| `vydacha` | object | `{}` | Блок выдачи по смыслу · Retrieval configuration | Не отключает запись · Does not disable writes |
| `vydacha.vkl` | boolean | `false` | Включить службу поиска и инструмент · Enable search service and tool | Без root или рабочей связи поиск не поднимается · No root/connection prevents retrieval startup |
| `vydacha.avto` | boolean | `true` | Подача на входящее сообщение · Injection for incoming messages | `false` оставляет поиск по запросу · `false` retains explicit search |
| `vydacha.koren` | string | `''` | `example-agent`, фильтр entity_id · entity_id scope | Пусто — отказ поднятия выдачи · Empty refuses retrieval startup |
| `vydacha.tajmautMs` | number | `3000` | Предел запроса pamyatPoSmyslu по root; для vse_korni — max(значение, 600 мс × число корней) (A-N-1727) · Per-root pamyatPoSmyslu request deadline; for vse_korni — max(value, 600 ms × root count) | Служба OMEGA делит время между одновременными запросами, поэтому предел всех корней растёт с их числом; 600 мс × N держит около трёх поисков разом · The OMEGA service shares time between concurrent queries, so the all-root limit grows with root count; covers about three concurrent searches |
| `vydacha.sistemnyeKorni` | string[] | `[]` | `[example-agent, example-coordinator]` | Для vse_korni нужен непустой системный список после исключения guests · Multi-root mode requires a nonempty system list after removing guest roots |
| `vydacha.gostevyeKorni` | string[] | `[]` | `[example-guest]`, корни недоверенных данных · Untrusted roots | Неназванный guest неотличим от system по тексту · An unlisted guest is not detectable from its text |
| `vydacha.gosti` | string | `'obertka'` | `obertka`: явно обрамить; `vne`: не запрашивать добавочные guest-корни · Wrap or omit additional guest roots | Иное значение — отказ многокорневого поиска · Other values refuse multi-root search |
| `gostyam` | object | `{}` | B-N-1644: чтение памяти гостем — один инструмент `pamyat_dlya_gostej` · Guest memory reading — one tool `pamyat_dlya_gostej` | Нужен `vydacha.vkl` и `vydacha.koren`; запись этим путём невозможна · Requires `vydacha.vkl` and `vydacha.koren`; nothing can be written this way |
| `gostyam.vkl` | boolean | `false` | Включить инструмент гостя · Enable the guest tool | По умолчанию выключено: у агентов без настройки ничего не меняется · Off by default: agents without the setting are unchanged |
| `gostyam.teg` | string | `'dlya-gostej'` | Метка в `metadata.tags` записи OMEGA; поиск — жёсткий `filter_tags` · Tag in the OMEGA record's `metadata.tags`; hard `filter_tags` search | Пусто — отказ выдачи (без метки отдавалось бы всё) · Empty refuses (no tag would expose everything) |
| `gostyam.zapisej` | number | `5` | Сколько записей отдать, 1–15 · Records returned, 1–15 | Превью OMEGA — до 200 знаков; длиннее — «фрагмент» · OMEGA previews are ≤200 characters; longer ones are marked as fragments |
| `PAMYAT_B_NE_IZMERENO_MS` (переменная окружения процесса · process environment variable) | number | `600000` | Через сколько мс без шага своей сессии писать «Б: НЕ ИЗМЕРЕНО»; читается при загрузке модуля · After how many ms without an own-session step to log «Б: НЕ ИЗМЕРЕНО» (not measured); read at module load | Не число или ≤ 0 — умолчание 600000 · Non-number or ≤ 0 — default 600000 |

Параметры являются настройками данного провайдера; в локальном ядре их дублировать не нужно. Нет настройки «не проверять содержимое»: подтверждение образца обязательно. Таймауты применяются к каждому MCP-вызову, поэтому запись с чтением может занять больше одного `tajmautMs`.

These settings belong to this provider and should not be duplicated in the local core. There is no switch to skip content verification: the sample check is mandatory. Deadlines apply per MCP call, so a write followed by a read-back can take longer than one `tajmautMs`.

```yaml
vydacha:
  vkl: true
  avto: false
  koren: example-agent
  tajmautMs: 3000
  sistemnyeKorni: [example-agent, example-coordinator]
  gostevyeKorni: [example-guest]
  gosti: vne
```

Этот пример включает запросный поиск, выключает автоподачу и исключает дополнительные guest-roots из многокорневого запроса. Он не назначает читателя очереди локального ядра и не настраивает сервер OMEGA; это отдельные стороны договора.

This example enables task-driven search, disables automatic injection, and omits additional guest roots in multi-root mode. It neither assigns a core delivery-queue reader nor configures the OMEGA server; those are separate sides of the contract.

## Фиксированные пределы · Fixed implementation limits

| Предел · Limit | Значение · Value | Область · Scope |
|---|---:|---|
| Автоподача · Automatic injection | `3 / 1500` | Записи / бюджет текста · Records / text budget |
| По запросу · Task-driven retrieval | `15 / 8000` | Записи / бюджет текста · Records / text budget |
| Вход · Query input | `1200` | JavaScript длина текста · JavaScript string length |
| Кандидаты · Candidates | `20` | Один root-запрос · One root query |
| Минимум письма · Minimum message | `40` | Автоматический вход · Automatic input |
| Давний снимок · Old snapshot | `48 h` | Отсев распознанных снимков · Recognized snapshot rejection |
| Лексический дубль · Lexical duplicate | `0.5` | Порог сходства · Similarity threshold |

Эти числа лежат в `PREDEL`, не в пользовательском Config. Бюджет текста — эвристика `prevyu.length+80`; первая запись может быть больше бюджета, потому что проверка срыва включается только при уже взятой записи. Не обещай строгий общий предел 8000/1500 или счёт токенов модели.

These values are in `PREDEL`, not user Config. Text budgeting estimates `prevyu.length+80`; the first item may exceed the budget because overflow rejection starts only after an item has been selected. Do not promise a strict 8000/1500 ceiling or model-token accounting.

`aktivnye` использует основную связь с `tajmautMs` (10 000 мс), а `pamyatPoSmyslu` — отдельную связь с `vydacha.tajmautMs` (3 000 мс). Настройка поиска по смыслу не ускоряет сверку видимости `aktivnye`. Собственный `vydacha.koren` не должен входить в `gostevyeKorni`, если нужен режим исключения гостей: он всё равно включается в запрос.

`aktivnye` uses the primary connection with `tajmautMs` (10,000 ms), while `pamyatPoSmyslu` uses a separate connection with `vydacha.tajmautMs` (3,000 ms). Retrieval configuration does not shorten `aktivnye` reconciliation. Keep the own `vydacha.koren` outside `gostevyeKorni` when guest omission is required: the own root is still queried.
