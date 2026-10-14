# Настройки · Settings — dsh-pamyat-kompakt

## Откуда берутся значения · Where values come from

Старшинство: **окружение > файл D агента > умолчание модуля**. Окружение старше, чтобы перебить значение на один прогон, не правя файл. Источник каждого значения печатается при импорте строкой `[kompakt <версия>] источники значений: …` и выдаётся наружу объектом `ISTOCHNIKI` — так видно, доехала ли настройка, даже когда её значение совпадает с умолчанием.

Precedence: **environment > the agent's D file > module default**. The environment wins so a value can be overridden for one run without editing the file. The source of each value is printed at import as `[kompakt <version>] источники значений: …` (value sources) and exported as the `ISTOCHNIKI` object — so you can see whether the settings arrived even when a value equals the default.

Значения модели и поля D читаются **один раз, при импорте модуля**. Необязательные текстовые подстановки читаются отдельно при первом сжатии. Перед каждым вызовом модели файл D читается заново, но только как проверка годности: новые значения вступают в силу после перезапуска процесса.

Model settings and D fields are read **once, at module import**. Optional text substitutions are read separately at first compaction. Before every model call the D file is read again, but only as a validity check: new values take effect after the process restarts.

## Файл D · The D file

Путь: `<KOMPAKT_NASTROJKI_KATALOG>/<KOMPAKT_AGENT>.json`, каталог выбирается прежним `KOMPAKT_NASTROJKI_KATALOG`; без него сохранён установочный путь `/etc/dsh-pamyat/agenty`. Если `KOMPAKT_AGENT` задан, файл **обязателен**: его отсутствие или негодный JSON — отказ импорта (исключение), а не тихий откат к умолчаниям. Файл D обычно собирает внешний сборщик настроек; в нём же живут поля других модулей памяти — этот модуль читает только поля из таблицы ниже.

Path: `<KOMPAKT_NASTROJKI_KATALOG>/<KOMPAKT_AGENT>.json`, KOMPAKT_NASTROJKI_KATALOG selects the directory; without it the existing /etc/dsh-pamyat/agenty installation path remains. If `KOMPAKT_AGENT` is set, the file is **mandatory**: missing or invalid JSON means the import fails (an exception), not a silent fallback to defaults. The D file is usually produced by an external settings builder; it also holds fields of other memory modules — this module reads only the fields in the table below.

### Поля D · D fields

| Поле · Field | Тип · Type | Умолчание · Default | Что значит · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `porogi` | объект · object | — (обязателен · required) | Готовая политика порога, см. ниже · Ready threshold policy, see below | см. ниже · see below | Порог «НЕ ПРОЧИТАН»: ступени не считаются, `KOMPAKT_POROG` = undefined, перед вызовом модели — отказ · Threshold "НЕ ПРОЧИТАН" (not read): no steps, `KOMPAKT_POROG` undefined, refusal before the model call |
| `imya` | строка · string | нет → «от лица агента» · none → "on behalf of the agent" | Имя, от лица которого пишется сводка (подставляется в `{{OT_LICA}}` промта). Одно слово с заглавной, 2–31 буква · Name in whose voice the summary is written (put into the prompt's `{{OT_LICA}}`). One capitalised word, 2–31 letters | `"Агент"` | Печатается «имя НЕГОДНО», сводка пишется нейтрально · "имя НЕГОДНО" (name invalid) printed, summary written neutrally |
| `model` | строка · string | `deepseek-flash` | Модель сводки · Summary model | `"deepseek-flash"` | HTTP-ошибка провайдера → сводки нет, сессия не трогается · Provider HTTP error → no summary, session untouched |
| `adres` | строка · string | `https://api.deepseek.com/v1/chat/completions` | Адрес OpenAI-совместимого `/chat/completions` · OpenAI-compatible `/chat/completions` endpoint | `"https://api.example.com/v1/chat/completions"` | Сетевая ошибка → сводки нет · Network error → no summary |
| `imenaKlyucha` | массив строк · string[] | `["KOMPAKT_API_KEY","DEEPSEEK_API_KEY","GATEWAY_API_KEY"]` | ИМЕНА переменных окружения, где искать ключ; берётся первое непустое. Сам ключ в файле не хранится никогда · NAMES of environment variables holding the key; the first non-empty wins. The key itself is never stored in the file | `["MY_SUMMARY_KEY"]` | Ни одно не задано → отказ «ключ для сводки не найден НИ ПОД ОДНИМ из имён» · None set → refusal listing all names checked |
| `hvostStrok` | целое ≥ 1 · integer ≥ 1 | 30 | Сколько последних строк журнала остаются дословно после сжатия · Last log lines kept verbatim after compaction | `30` | Больше длины журнала − 2 → «резать нечего». 0, отрицательное, дробное или не число → строка подъёма «🔴 негодный хвост …», физическое сжатие отказывает, сессия не тронута · More than log length − 2 → "nothing to cut". 0, negative, fractional or non-numeric → start-up line «🔴 негодный хвост …» (bad tail), physical compaction refuses, the session is untouched |
| `oknoSvodki` | число · number | 1000000 | Окно МОДЕЛИ СВОДКИ в токенах; от него считается бюджет вызова · SUMMARY model window in tokens; the call budget is computed from it | `1000000` | Больше настоящего → отказ провайдера «maximum context length»; меньше → ранний отказ «место под сводку не осталось» · Larger than real → provider "maximum context length" refusal; smaller → early "no room for the summary" refusal |
| `oknoModeli` | число · number | — | Устаревшее имя `oknoSvodki`; принимается как запасное с печатью «устарело» · Obsolete name of `oknoSvodki`; accepted as a fallback with an "устарело" notice | — | — |
| `kompaktShlyuzovoj` | логическое · boolean | не объявлен · undeclared | Выключатель компакта шлюза. Только явное `false` выключает; не объявлен = сжимать · Gateway compaction switch. Only an explicit `false` turns it off; undeclared = compress | `true` | `false` при живом шлюзе → контекст растёт до отказа модели агента · `false` with a live gateway → context grows until the agent model refuses |
| `razmyshleniya` | логическое · boolean | `false` | Размышления модели сводки. При `false` в запрос кладётся `thinking: {type: "disabled"}` · Reasoning of the summary model. When `false`, `thinking: {type: "disabled"}` is sent | `false` | `true` с думающей моделью → обрывы сводки на полуслове · `true` with a thinking model → summaries cut mid-word |
| `minProzaZnakov` | число · number | 0 (выкл · off) | Если прозы меньше — модель не зовётся, агенту отдаётся проза как есть · If prose is shorter, the model is not called and the prose is returned as is | `10000` | Слишком большой → почти все сжатия без сводки · Too large → almost all compactions without a summary |
| `ceny` | объект · object | — | Каталог цен для строки расхода в деньгах: `vhod`, `vyhod` — $ за миллион токенов; `istochnik`, `data` — откуда и когда цена · Price catalogue for the money cost line: `vhod`, `vyhod` — $ per million tokens; `istochnik`, `data` — source and date of the price | `{"vhod":0.27,"vyhod":1.1,"istochnik":"<price page>","data":"2026-01-01"}` | Нет поля → деньги не печатаются, причина называется · Missing → money not printed, the reason is stated |
| `dolyaPoroga`, `kompaktPlatformennyj`, `dolyaPorogaPlatformy` | — | — | Устаревшие поля: игнорируются с печатью «УСТАРЕЛО» · Obsolete fields: ignored with an "УСТАРЕЛО" notice | — | — |

### Поле porogi · The porogi field

```json
"porogi": {
  "schema": 1,
  "defaultRoute": { "provider": "claude-oauth", "model": "claude-opus-5" },
  "routes": [
    { "provider": "claude-oauth", "model": "claude-opus-5", "window": 1000000, "ratio": 0.8, "nominalThreshold": 800000 }
  ]
}
```

| Ключ · Key | Правило · Rule |
|---|---|
| `schema` | ровно `1` · exactly `1` |
| `defaultRoute` | ровно `provider` и `model`, непустые строки · exactly `provider` and `model`, non-empty strings |
| `routes[]` | непустой массив; у каждого маршрута ровно пять ключей `provider, model, window, ratio, nominalThreshold`; пара provider/model не повторяется · non-empty array; each route has exactly five keys; no repeated provider/model pair |
| `window` | целое > 0 · integer > 0 |
| `ratio` | число в (0; 1) · number in (0; 1) |
| `nominalThreshold` | целое, 0 < порог < window. Модуль его **не пересчитывает** — берёт как есть · integer, 0 < threshold < window. The module does **not** recompute it — taken as is |
| маршрут `defaultRoute` · the `defaultRoute` route | обязан быть среди `routes` · must be present in `routes` |

Любое нарушение — порог «НЕ ПРОЧИТАН» с причиной (`chitatPorogD` возвращает `{prichina}`), а не исключение. Принято, что `nominalThreshold = floor(window × ratio)`, как у компакции платформы; считает его сборщик настроек.

Any violation yields a threshold "НЕ ПРОЧИТАН" (not read) with a reason (`chitatPorogD` returns `{prichina}`), not an exception. By convention `nominalThreshold = floor(window × ratio)`, as in the platform compaction; the settings builder computes it.

## Переменные окружения · Environment variables

| Переменная · Variable | Тип · Type | Умолчание · Default | Что значит · Meaning | Если неверно · If wrong |
|---|---|---|---|---|
| `KOMPAKT_AGENT` | строка `[A-Za-z0-9_-]+` · string | — | Имя агента = имя файла D. Не задано → умолчания модуля, порог не прочитан · Agent name = D file name. Unset → module defaults, threshold not read | Негодные знаки → «имя агента НЕГОДНО», умолчания · Invalid characters → "имя агента НЕГОДНО", defaults |
| `KOMPAKT_NASTROJKI_KATALOG` | путь · path | `/etc/dsh-pamyat/agenty` (константа `KATALOG_VNESHNIJ` · constant) | Каталог файлов D · D files directory | Нет файла → отказ импорта · No file → import fails |
| `KOMPAKT_MODEL`, `KOMPAKT_ADRES`, `KOMPAKT_HVOST`, `KOMPAKT_OKNO_MODELI`, `KOMPAKT_MIN_PROZA` | как поля D · as D fields | — | Перебивают `model`, `adres`, `hvostStrok`, `oknoSvodki`, `minProzaZnakov` · Override the D fields | см. поля D · see D fields |
| `KOMPAKT_SHLYUZOVOJ`, `KOMPAKT_RAZMYSHLENIYA` | `"true"` / иное · other | — | Перебивают `kompaktShlyuzovoj`, `razmyshleniya`. Любое значение кроме `true` = false · Override; any value other than `true` = false | `"yes"` читается как false · `"yes"` reads as false |
| `KOMPAKT_PLATFORMENNYJ` | `"true"` / иное | «вкл», если порог прочитан · "on" if the threshold was read | Признак, что платформенный компакт включён (экспортируется для шлюза) · Sign that platform compaction is on (exported for the gateway) | — |
| `KOMPAKT_VHOD` | число знаков · characters | 0 | Предел знаков прозы на вход сводки, считается с конца; 0 = без предела · Character limit of prose sent to the summary, counted from the end; 0 = unlimited | Мал → в сводку уходит только хвост, начало хода помечается «ОТРЕЗАНО» · Small → only the tail is summarised, the cut is labelled |
| `KOMPAKT_VYHOD` | число · number | 100000 | **Объявлена, но кодом не используется** · **Declared but not used by the code** | — |
| `KOMPAKT_POTOLOK` | токены · tokens | 393216 | Потолок `max_tokens` провайдера · Provider `max_tokens` ceiling | Больше настоящего → каждый запрос отвергается провайдером · Larger than real → every request refused |
| `KOMPAKT_ZN_NA_TOK` | число · number | 2.0 | Знаков на токен для оценки входа (замер на кириллице 2.44) · Characters per token for the input estimate (measured 2.44 on Cyrillic) | Увеличение без замера → отказ «maximum context length»; уменьшение безопасно · Increasing without measuring → "maximum context length" refusal; decreasing is safe |
| `KOMPAKT_ZAPAS` | токены · tokens | 8192 | Запас на служебное обрамление запроса · Margin for request framing | — |
| `KOMPAKT_MIN_VYHOD` | токены · tokens | 8192 | Меньше места под сводку — отказ, а не обрубок · Less room for the summary → refusal, not a stub | — |
| `KOMPAKT_PROMT` | путь · path | `promt-svodki.txt` рядом с кодом · next to the code | Системный промт модели сводки · System prompt of the summary model | Нет файла или пуст → отказ сводки · Missing or empty → summary refusal |
| `KOMPAKT_RAMKA`, `KOMPAKT_RAMKA_HVOST` | путь · path | `ramka-stenogrammy.txt`, `ramka-s-hvostom.txt` | Рамки входа. В рамке ровно одно `{{STENOGRAMMA}}`; в рамке с хвостом ещё ровно одно `{{HVOST}}` после него · Input frames. Exactly one `{{STENOGRAMMA}}`; the tail frame also exactly one `{{HVOST}}` after it | Иное число меток → отказ · A different marker count → refusal |
| `KOMPAKT_OTKAZY`, `KOMPAKT_UDACHI` | путь · path | `$HOME/pamyat/otkazy-kompakta`, `$HOME/pamyat/udachi-kompakta` | Куда класть следы отказов (20 пар) и удач (5 пар) · Where to keep refusal (20 pairs) and success (5 pairs) traces | Не записалось → строка журнала, сводка не страдает · Write failed → a log line, the summary is unaffected |
| `KOMPAKT_SAMOPROVERKA` | любое · any | — | Запустить самопроверку при `node index.mjs` · Run the self-check on `node index.mjs` | — |
| `KOMPAKT_DOLYA`, `KOMPAKT_OKNO`, `KOMPAKT_POROG` | — | — | **Запрещены**: порог задаётся только через D. Задана любая → исключение при импорте · **Forbidden**: the threshold comes only from D. Any of them set → exception at import | — |
| `CODEX_HOME` | путь · path | — | Дом Codex: где искать журнал `sessions/**/rollout-*-<sid>.jsonl` · Codex home: where to look for the session log | — |
| `HOME` | путь · path | — | Дом Claude SDK (`~/.claude/projects`) и следов сводок · Claude SDK home and summary traces | — |
| имена из `imenaKlyucha` · names from `imenaKlyucha` | секрет · secret | — | Ключ модели сводки · Summary model key | — |

## Значения, которые не настраиваются · Fixed values

| Имя · Name | Значение · Value | Почему · Why |
|---|---|---|
| `KOMPAKT_STUPENI` | 0.60, 0.80, 0.95 | Доли порога, на которых печатается ступень занятости · Threshold shares at which an occupancy step is printed |
| `STROK_POISKA_METKI` | 5 | В скольких первых строках искать метку `[MODE=…]` · How many first lines are searched for the `[MODE=…]` tag |
| `OTKAZOV_HRANIT` / `UDACH_HRANIT` | 20 / 5 | Сколько пар следа хранить · How many trace pairs to keep |
| права следов · trace modes | каталог 0700, файлы 0600 · dir 0700, files 0600 | В следе — стенограмма беседы агента · The trace contains the agent's conversation transcript |
| права журнала сессии · session log mode | как у исходного · same as the original | Перезапись идёт через временный файл 0600, которому до `rename` даётся режим исходного журнала: журнал 0600 остаётся 0600 · The rewrite goes through a 0600 temp file that gets the original log's mode before `rename`: a 0600 log stays 0600 |
| `PREDEL_SVODKI_MS` | 600000 | Срок ответа модели сводки; сигнал отмены платформы (`summarize(…, signal)` у `dsh-pamyat-kompakt-dsh`) прерывает вызов раньше. Истёк или отменён — исключение с причиной, сессия не тронута · Summary model response deadline; the platform cancellation signal (`summarize(…, signal)` in `dsh-pamyat-kompakt-dsh`) aborts the call earlier. Expired or cancelled — an exception with the reason, the session untouched |

## Размещение и подстановки данных модели · Deployment and model-data substitutions

`tekstovye-nastrojki.mjs` не читает JSON при импорте: первое чтение происходит при сжатии. Путь выбирается `KOMPAKT_RAZMESCHENIE`; умолчание — `/etc/memory-compaction/deployment.json`. Отсутствующий умолчальный файл допускает нейтральные значения. Явно выбранный отсутствующий/нечитаемый файл, неверный JSON и неизвестный или повторный ключ — отказ сжатия до модели; импорт остаётся успешным. JSON содержит только текстовые подстановки, не API credentials; они не исполняются как код. Нужен доверенный файл администратора, читаемый всеми процессами-потребителями.

`tekstovye-nastrojki.mjs` performs no import-time JSON read: the first read happens at compaction. `KOMPAKT_RAZMESCHENIE` selects its path; the default is /etc/memory-compaction/deployment.json. A missing default file uses neutral values. An explicitly selected missing/unreadable file, malformed JSON, or unknown/duplicate key refuses compaction before the model call; import remains successful. JSON contains text substitutions rather than API credentials; they are not executed as code. Supply a trusted administrator-owned file readable by every consuming process.

| Ключ · Key | Тип · Type | Умолчание · Default | Смысл RU / EN · Meaning | Пример · Example | Ошибка RU / EN · Failure |
|---|---|---|---|---|---|
| `KOMPAKT_RAZMESCHENIE` | env absolute path | /etc/memory-compaction/deployment.json | Общий JSON / shared JSON | /etc/memory-compaction/deployment.json | Пустой/относительный/`..` путь — отказ / empty, relative, parent traversal refuses |
| `promptSubstitutions` | JSON object | нейтральные значения ниже / neutral values below | Подстановки системного промта и рамок / system prompt and frame substitutions | `{ "exampleHost": "example-host" }` | null/массив/неизвестные ключи — отказ / null, array, unknown keys refuse |

Каталог D не определяется JSON: прежние env/умолчание и сборщик D сохранены. В JSON допустим только promptSubstitutions; поле settingsDirectory из непринятого r1 удалить. Отсутствующий default JSON оставляет нейтральные текстовые значения и не меняет D. Ошибка не кешируется: после ремонта следующий вызов повторяет чтение. После успешного чтения снимок используется до нового импорта; позднюю порчу файла эта версия не перечитывает.

JSON does not select D's directory: its existing environment/default and producer are unchanged. JSON accepts promptSubstitutions only; remove settingsDirectory from the unaccepted r1 configuration. A missing default JSON uses neutral text values without changing D. Failures are not cached, so the next call can read a repaired file. After success the snapshot stays until a new import; later corruption is not reread by this version.

| Подстановка · Substitution | Метка · Token | Нейтральное умолчание · Neutral default | Назначение RU / EN · Purpose |
|---|---|---|---|
| ownerInstrumental | `{{KOMPAKT_OWNER_INSTRUMENTAL}}` | владельцем | Владелец в творительном падеже / owner in instrumental case |
| ownerNominative | `{{KOMPAKT_OWNER_NOMINATIVE}}` | владелец | Владелец в именительном / owner in nominative case |
| ownerGenitive | `{{KOMPAKT_OWNER_GENITIVE}}` | владельца | Владелец в родительном / owner in genitive case |
| ownerDative | `{{KOMPAKT_OWNER_DATIVE}}` | владельцу | Владелец в дательном / owner in dative case |
| coordinatorExample | `{{KOMPAKT_COORDINATOR_EXAMPLE}}` | я и агент-координатор | Пример запрета раздваивать собственную роль / example forbidding a split self-identity |
| evidenceRuleLabel | `{{KOMPAKT_EVIDENCE_RULE}}` | правило прослеживаемости | Название правила проверки происхождения / provenance-rule label |
| exampleHost | `{{KOMPAKT_EXAMPLE_HOST}}` | example-host | Узел в примерах журнала / host in log examples |
| roleClarification | `{{KOMPAKT_ROLE_CLARIFICATION}}` | Роль координатора и местного агента, источник — только стенограмма / coordinator/local agent distinction, inferred only from the transcript | Полная строка разграничения ролей в обеих рамках / complete role-boundary line in both frames |

Каждое значение — непустая строка без `{{`/`}}`. Необъявленный ключ в объекте или неизвестная `KOMPAKT_*` метка исходного шаблона — отказ. Значения не подставляются рекурсивно. Непереданные поля получают нейтральное умолчание. Точный roleClarification по умолчанию находится в DEFAULT_LABELS модуля; при переносе установки сравни весь собранный текст с прежним, а не только число замен.

Each value is a nonempty string without `{{`/`}}`. Unknown object keys or unknown KOMPAKT_* tokens in the original template refuse. Values are never substituted recursively. Missing fields retain neutral defaults. DEFAULT_LABELS defines the exact default roleClarification; migration must compare complete rendered text with the old version rather than just replacement counts.

Подстановки выполняются только на исходных шаблонах ДО вставки стенограммы и хвоста. Метки, встречающиеся в материале пользователя, остаются его текстом. STENOGRAMMA и HVOST по-прежнему должны встречаться ровно один раз в соответствующей рамке; OT_LICA допускает ноль для старого промта, один для подстановки, больше одного — отказ. Файлы промта и рамок остаются данными модели; они намеренно не переведены в двуязычную инструкцию, поскольку это изменило бы запрос.

Substitutions apply only to original templates BEFORE inserting transcript/tail data. Tokens in user material remain literal user text. STENOGRAMMA and HVOST still require exactly one occurrence in their frames; OT_LICA allows zero for legacy prompts, one for substitution, and rejects more than one. Prompt/frame files remain model data and are deliberately not made into bilingual instructions, which would change the request.

Текстовый снимок фиксируется первым успешным чтением при сжатии; после него для смены значений нужен новый импорт процесса. Перед заменой промта/рамок останови или удержи вызывающие процессы: старый кешированный index.mjs не умеет новые метки и может прочитать новый шаблон. Монтировать полный пакет и перезапускать его потребителей нужно одним согласованным окном.

The text snapshot is captured by the first successful compaction read; changing it afterward requires a fresh process import. Stop or hold callers before replacing prompt/frame files: a cached old index.mjs cannot interpret new tokens but can still read new templates. Install the complete package and restart its consumers in one coordinated window.
