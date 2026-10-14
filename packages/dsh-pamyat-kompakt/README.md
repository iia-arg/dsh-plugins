# dsh-pamyat-kompakt

**Версия:** 3.1.2

## Назначение · Purpose

Общий модуль компакта (сжатия контекста) агента. Он считает занятость окна по `usage` поставщика, читает готовый порог из файла настроек агента (файл D), пишет сводку прошлой работы своей моделью (OpenAI-совместимый `/chat/completions`, по умолчанию `deepseek-flash`) и атомарно переписывает журнал сессии Claude Agent SDK или Codex: граница `compact_boundary`, сообщение со сводкой и дословный хвост. Когда сжимать, модуль не решает: решает зовущий (шлюз подписки или `dsh-pamyat-kompakt-dsh`) по своему счётчику. Это не плагин платформы, а библиотека (ES-модуль без зависимостей), которую импортируют другие компоненты.

A shared agent context-compaction module. It computes window occupancy from the provider `usage`, reads a ready threshold from the agent settings file (the D file), writes a summary of past work with its own model (OpenAI-compatible `/chat/completions`, `deepseek-flash` by default) and atomically rewrites the Claude Agent SDK or Codex session log as a `compact_boundary`, a summary message and a verbatim tail. It does not decide when to compact: the caller (the subscription gateway or `dsh-pamyat-kompakt-dsh`) decides by its own counter. It is a library (an ES module with no dependencies) imported by other components, not a platform plugin.

## Что ставится и куда · What gets installed and where

Состав архива — по полю `files` в `package.json`; `package.json` и `LICENSE` npm кладёт в архив и без перечня:

| Файл | Что это |
|---|---|
| `index.mjs` | Точка входа (`main`): занятость, решение, сводка, перезапись журнала, самопроверка |
| `porogi.mjs` | `chitatPorogD` — чтение и проверка готового порога (`porogi`) из файла D |
| `tekstovye-nastrojki.mjs` | Каталог D по умолчанию, чтение JSON размещения, подстановка меток в промт и рамки |
| `promt-svodki.txt` | Системный промт сводки |
| `ramka-stenogrammy.txt`, `ramka-s-hvostom.txt` | Рамки входа: стенограмма без хвоста и с хвостом |
| `stend-*.mjs` | Стенды проверки |
| `LICENSE` | Лицензия MIT (поле `license` в `package.json`) |
| `README.md`, `CHANGELOG.md`, `docs/` | Документация (`docs/ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md`) |

Archive contents per the `files` field of `package.json`; npm puts `package.json` and `LICENSE` into the archive even without the list:

| File | What it is |
|---|---|
| `index.mjs` | Entry point (`main`): occupancy, decision, summary, log rewrite, self-check |
| `porogi.mjs` | `chitatPorogD` — reads and validates the ready threshold (`porogi`) from the D file |
| `tekstovye-nastrojki.mjs` | Default D directory, deployment JSON reader, label substitution in the prompt and frames |
| `promt-svodki.txt` | Summary system prompt |
| `ramka-stenogrammy.txt`, `ramka-s-hvostom.txt` | Input frames: transcript without a tail and with a tail |
| `stend-*.mjs` | Verification stands |
| `LICENSE` | MIT license (the `license` field in `package.json`) |
| `README.md`, `CHANGELOG.md`, `docs/` | Documentation (`docs/ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md`) |

На машине пакет лежит каталогом `/opt/agent-plugins/dsh-pamyat-kompakt` (владелец `root:agent-plugins`). Ссылка `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt` указывает на `../dsh-pamyat-kompakt`. Каталога `nastrojki/` в установке нет: настройки агентов лежат вне пакета (см. «Настройка»).

On the machine the package is the directory `/opt/agent-plugins/dsh-pamyat-kompakt` (owned by `root:agent-plugins`). The link `/opt/agent-plugins/node_modules/dsh-pamyat-kompakt` points to `../dsh-pamyat-kompakt`. The installation has no `nastrojki/` directory: agent settings live outside the package (see Configuration).

Во время работы модуль пишет вне своего каталога:
- `<журнал>.bak-pre-kompakt-<время>` — копия журнала сессии перед каждой перезаписью, рядом с журналом;
- `$HOME/pamyat/udachi-kompakta/` (последние 5 пар «вход + сводка») и `$HOME/pamyat/otkazy-kompakta/` (последние 20 пар «вход + отвергнутый ответ»), каталоги `0700`, файлы `0600`.

At run time the module writes outside its directory:
- `<log>.bak-pre-kompakt-<time>` — a copy of the session log before every rewrite, next to the log;
- `$HOME/pamyat/udachi-kompakta/` (last 5 "input + summary" pairs) and `$HOME/pamyat/otkazy-kompakta/` (last 20 "input + rejected answer" pairs); directories `0700`, files `0600`.

## Установка · Installation

Пакет ставится не из тарбола и не командой `dsh plugin add`, а каталогом:

1. Каталог пакета кладётся в `/opt/agent-plugins/dsh-pamyat-kompakt`.
2. В `/opt/agent-plugins/package.json` он объявлен как `"dsh-pamyat-kompakt": "file:./dsh-pamyat-kompakt"`.
3. В `/opt/agent-plugins/node_modules/` стоит ссылка `dsh-pamyat-kompakt -> ../dsh-pamyat-kompakt`.

The package is installed as a directory, not from a tarball and not via `dsh plugin add`:

1. The package directory is placed at `/opt/agent-plugins/dsh-pamyat-kompakt`.
2. `/opt/agent-plugins/package.json` declares it as `"dsh-pamyat-kompakt": "file:./dsh-pamyat-kompakt"`.
3. `/opt/agent-plugins/node_modules/` holds the link `dsh-pamyat-kompakt -> ../dsh-pamyat-kompakt`.

Кто его загружает:

| Потребитель | Как находит модуль | Что берёт |
|---|---|---|
| `dsh-pamyat-kompakt-dsh` | по имени пакета: `createRequire(...).resolve("dsh-pamyat-kompakt")` от своего `node_modules`; без ссылки из шага 3 он не загрузится | `svodkaNashejModelyu`, `KOMPAKT_MODEL` |
| Шлюзы `/opt/claude-oauth/gateway.mjs` (службы `claude-oauth-gateway@*` и `coder-gateway*`) | по абсолютному пути из переменной `GATEWAY_COMPACTION_MODULE=/opt/agent-plugins/dsh-pamyat-kompakt/index.mjs` в drop-in файлах systemd; загрузчик `/opt/claude-oauth/compaction-runtime.mjs` | `stupenZanjatosti`, `putSessii`, `fizicheskiyKompakt`, `porogIzPreseta`, `reshitKompakt`, `polnayaZanyatost`, `vedraPoImeni`, `zanyatostIzZhurnala`, `STUPEN_SESSII`, `KOMPAKT_STUPENI`, `KOMPAKT_POROG` |
| `dsh-pamyat-storozha` | по имени: `import { chitatPorogD } from "dsh-pamyat-kompakt/porogi.mjs"` | `chitatPorogD` |

Who loads it:

| Consumer | How it finds the module | What it takes |
|---|---|---|
| `dsh-pamyat-kompakt-dsh` | by package name: `createRequire(...).resolve("dsh-pamyat-kompakt")` from its own `node_modules`; it does not load without the link from step 3 | `svodkaNashejModelyu`, `KOMPAKT_MODEL` |
| Gateways `/opt/claude-oauth/gateway.mjs` (`claude-oauth-gateway@*` and `coder-gateway*` services) | by absolute path from `GATEWAY_COMPACTION_MODULE=/opt/agent-plugins/dsh-pamyat-kompakt/index.mjs` in systemd drop-in files; loader `/opt/claude-oauth/compaction-runtime.mjs` | `stupenZanjatosti`, `putSessii`, `fizicheskiyKompakt`, `porogIzPreseta`, `reshitKompakt`, `polnayaZanyatost`, `vedraPoImeni`, `zanyatostIzZhurnala`, `STUPEN_SESSII`, `KOMPAKT_STUPENI`, `KOMPAKT_POROG` |
| `dsh-pamyat-storozha` | by name: `import { chitatPorogD } from "dsh-pamyat-kompakt/porogi.mjs"` | `chitatPorogD` |

Сам `dsh-pamyat-kompakt` в профилях агентов не объявляется. К агенту он попадает через `dsh-pamyat-kompakt-dsh`, который подключён в профиле внутри группы `compaction` (пример из профиля агента `<дом>/.dsh/profiles/web/cordis.patch.yml`, комментарии опущены):

`dsh-pamyat-kompakt` itself is not declared in agent profiles. It reaches the agent through `dsh-pamyat-kompakt-dsh`, which is wired in the profile inside the `compaction` group (example from an agent profile `<home>/.dsh/profiles/web/cordis.patch.yml`, comments omitted):

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: dsh-pamyat-kompakt-dsh
      config:
        thresholdRatio: 0.8
        retainRatio: 0.06
        compactionRetries: 0
```

Процессу-потребителю нужны переменная `KOMPAKT_AGENT` (имя файла D) и ключ модели сводки в окружении. Шлюз проверяет контракт модуля один раз при старте; новая версия модуля подхватывается только после перезапуска потребителя.

The consumer process needs `KOMPAKT_AGENT` (the D file name) and the summary-model key in its environment. The gateway validates the module contract once at start-up; a new module version takes effect only after the consumer restarts.

## Настройка · Configuration

Своего `config` в профиле у пакета нет. Код читает четыре источника: переменные окружения, файл D агента, необязательный JSON размещения и текстовые шаблоны рядом с кодом. Старшинство для полей, у которых есть и переменная, и поле D: окружение (непустое) > файл D > умолчание модуля. Источник каждого значения печатается при импорте и экспортируется объектом `ISTOCHNIKI`.

The package has no profile `config`. The code reads four sources: environment variables, the agent D file, an optional deployment JSON and text templates next to the code. For fields that have both a variable and a D field the precedence is environment (non-empty) > D file > module default. The source of every value is printed at import and exported as the `ISTOCHNIKI` object.

### Файл D: `<каталог>/<KOMPAKT_AGENT>.json` · D file: `<dir>/<KOMPAKT_AGENT>.json`

Каталог: `KOMPAKT_NASTROJKI_KATALOG`, иначе `/etc/dsh-pamyat/agenty`. Имя агента допускает только `A-Z a-z 0-9 _ -`. Если `KOMPAKT_AGENT` задан, а файла нет или JSON не разбирается, импорт модуля падает. Без `KOMPAKT_AGENT` модуль работает на умолчаниях, без порога. Файлы D собирает внешний сборщик настроек; модуль их только читает.

Directory: `KOMPAKT_NASTROJKI_KATALOG`, otherwise `/etc/dsh-pamyat/agenty`. The agent name allows only `A-Z a-z 0-9 _ -`. If `KOMPAKT_AGENT` is set and the file is missing or its JSON does not parse, the module import fails. Without `KOMPAKT_AGENT` the module runs on defaults, without a threshold. D files are produced by an external settings builder; the module only reads them.

| Поле | Перебив окружением | Умолчание | Смысл |
|---|---|---|---|
| `porogi` | нет (см. ниже) | нет | Готовый порог: `{schema:1, defaultRoute:{provider,model}, routes:[{provider,model,window,ratio,nominalThreshold}]}`. Проверяется строго (`porogi.mjs`); ошибка даёт `{prichina}`, а не число |
| `model` | `KOMPAKT_MODEL` | `deepseek-flash` | Модель сводки |
| `adres` | `KOMPAKT_ADRES` | `https://api.deepseek.com/v1/chat/completions` | Адрес API сводки |
| `imenaKlyucha` | нет | `KOMPAKT_API_KEY`, `DEEPSEEK_API_KEY`, `GATEWAY_API_KEY` | Имена переменных окружения, где искать ключ (берётся первое непустое). Сам ключ в файлах не хранится |
| `hvostStrok` | `KOMPAKT_HVOST` | 30 | Сколько последних строк журнала остаются дословно; целое ≥ 1, иное — отказ сжатия без перезаписи |
| `oknoSvodki` (устар. `oknoModeli`) | `KOMPAKT_OKNO_MODELI` | 1 000 000 | Окно модели сводки, токены; к порогу компакта не относится |
| `razmyshleniya` | `KOMPAKT_RAZMYSHLENIYA` | `false` | При `false` в запрос идёт `thinking: {type: "disabled"}` |
| `kompaktShlyuzovoj` | `KOMPAKT_SHLYUZOVOJ` | не объявлен | Выключатель шлюзового компакта. Выключает только `false`; не объявлен — сжимать |
| `minProzaZnakov` | `KOMPAKT_MIN_PROZA` | 0 (выкл.) | Если прозы меньше, модель не зовётся, отдаётся проза |
| `ceny` | нет | нет | `{vhod, vyhod, istochnik, data}`, $ за миллион токенов; без него расход печатается только в токенах |
| `imya` | нет | нет | Имя агента для промта (одно слово с заглавной, до 31 буквы); иначе «от лица агента» |

| Field | Env override | Default | Meaning |
|---|---|---|---|
| `porogi` | none (see below) | none | Ready threshold: `{schema:1, defaultRoute:{provider,model}, routes:[{provider,model,window,ratio,nominalThreshold}]}`. Strictly validated (`porogi.mjs`); a fault yields `{prichina}`, not a number |
| `model` | `KOMPAKT_MODEL` | `deepseek-flash` | Summary model |
| `adres` | `KOMPAKT_ADRES` | `https://api.deepseek.com/v1/chat/completions` | Summary API endpoint |
| `imenaKlyucha` | none | `KOMPAKT_API_KEY`, `DEEPSEEK_API_KEY`, `GATEWAY_API_KEY` | Names of environment variables to search for the key (the first non-empty wins). The key itself is never stored in files |
| `hvostStrok` | `KOMPAKT_HVOST` | 30 | Last log lines kept verbatim; an integer ≥ 1, anything else refuses compaction without rewriting |
| `oknoSvodki` (obsolete `oknoModeli`) | `KOMPAKT_OKNO_MODELI` | 1,000,000 | Summary model window, tokens; unrelated to the compaction threshold |
| `razmyshleniya` | `KOMPAKT_RAZMYSHLENIYA` | `false` | When `false`, the request carries `thinking: {type: "disabled"}` |
| `kompaktShlyuzovoj` | `KOMPAKT_SHLYUZOVOJ` | undeclared | Gateway compaction switch. Only `false` turns it off; undeclared means compress |
| `minProzaZnakov` | `KOMPAKT_MIN_PROZA` | 0 (off) | If the prose is shorter, the model is not called and the prose is returned |
| `ceny` | none | none | `{vhod, vyhod, istochnik, data}`, $ per million tokens; without it cost is printed in tokens only |
| `imya` | none | none | Agent name for the prompt (one capitalised word, up to 31 letters); otherwise "on behalf of the agent" |

Поля `dolyaPoroga`, `kompaktPlatformennyj`, `dolyaPorogaPlatformy` устарели: при наличии печатается предупреждение, значения игнорируются. Порог (`porogIzPreseta`, `stupenZanjatosti`) читается из D заново при каждом вызове. Остальные поля читаются один раз при импорте. `svodkaNashejModelyu` перечитывает D перед вызовом модели только для проверки его годности.

The fields `dolyaPoroga`, `kompaktPlatformennyj`, `dolyaPorogaPlatformy` are obsolete: if present, a warning is printed and the values are ignored. The threshold (`porogIzPreseta`, `stupenZanjatosti`) is re-read from D on every call. Other fields are read once at import. `svodkaNashejModelyu` re-reads D before the model call only to check its validity.

### JSON размещения (текстовые подстановки) · Deployment JSON (text substitutions)

Файл: `KOMPAKT_RAZMESCHENIE`, иначе `/etc/memory-compaction/deployment.json`. Заданная переменная (в том числе пустая) обязана быть непустым абсолютным путём без сегмента `..` и без NUL и перевода строки; иначе сводка отказывает (`tekstovye-nastrojki.mjs`, проверка `absolute`). Читается лениво, при первой сводке; удачный снимок держится до нового импорта, ошибка не кешируется. Если файла по умолчанию нет, берутся умолчания. Если файл задан переменной явно и его нет, сводка отказывает. Допустим единственный ключ `promptSubstitutions` с полями `ownerInstrumental`, `ownerNominative`, `ownerGenitive`, `ownerDative`, `coordinatorExample`, `evidenceRuleLabel`, `exampleHost`, `roleClarification`. Они заменяют метки `{{KOMPAKT_OWNER_INSTRUMENTAL}}`, `{{KOMPAKT_OWNER_NOMINATIVE}}` и остальные в промте и рамках. Неизвестный ключ, повтор ключа, пустое значение или значение с `{{`/`}}` приводят к отказу сводки до вызова модели. Так же отказывает метка вида `{{KOMPAKT_<ИМЯ>}}` с неизвестным именем в промте или рамке, в том числе в файле, заданном `KOMPAKT_PROMT`, `KOMPAKT_RAMKA` или `KOMPAKT_RAMKA_HVOST`: подстановка (`podstavitTeksty`) идёт до запроса к модели.

File: `KOMPAKT_RAZMESCHENIE`, otherwise `/etc/memory-compaction/deployment.json`. A set variable (including an empty one) must be a non-empty absolute path with no `..` segment and no NUL or line feed; otherwise the summary refuses (`tekstovye-nastrojki.mjs`, the `absolute` check). It is read lazily, at the first summary; a successful snapshot is kept until a fresh import, and failures are not cached. If the default file is missing, defaults are used. If the file is set explicitly via the variable and is missing, the summary refuses. The only allowed key is `promptSubstitutions` with the fields `ownerInstrumental`, `ownerNominative`, `ownerGenitive`, `ownerDative`, `coordinatorExample`, `evidenceRuleLabel`, `exampleHost`, `roleClarification`. They replace the `{{KOMPAKT_OWNER_INSTRUMENTAL}}`, `{{KOMPAKT_OWNER_NOMINATIVE}}` and the other labels in the prompt and frames. An unknown key, a duplicate key, an empty value or a value containing `{{`/`}}` makes the summary refuse before the model is called. A `{{KOMPAKT_<NAME>}}` label with an unknown name in the prompt or a frame causes the same refusal, including in a file set by `KOMPAKT_PROMT`, `KOMPAKT_RAMKA` or `KOMPAKT_RAMKA_HVOST`: substitution (`podstavitTeksty`) happens before the model request.

### Шаблоны · Templates

| Файл | Перебив | Требование |
|---|---|---|
| `promt-svodki.txt` | `KOMPAKT_PROMT` | Не пустой; `{{OT_LICA}}` не более одного. Если в промте есть и `[MODE=ACTIVE]`, и `[MODE=DIALOG]`, ответ обязан начинаться такой меткой |
| `ramka-stenogrammy.txt` | `KOMPAKT_RAMKA` | Ровно один `{{STENOGRAMMA}}` |
| `ramka-s-hvostom.txt` | `KOMPAKT_RAMKA_HVOST` | Один `{{STENOGRAMMA}}` и один `{{HVOST}}` после него (используется, когда зовущий передаёт хвост) |

| File | Override | Requirement |
|---|---|---|
| `promt-svodki.txt` | `KOMPAKT_PROMT` | Not empty; at most one `{{OT_LICA}}`. If the prompt contains both `[MODE=ACTIVE]` and `[MODE=DIALOG]`, the answer must start with such a tag |
| `ramka-stenogrammy.txt` | `KOMPAKT_RAMKA` | Exactly one `{{STENOGRAMMA}}` |
| `ramka-s-hvostom.txt` | `KOMPAKT_RAMKA_HVOST` | One `{{STENOGRAMMA}}` and one `{{HVOST}}` after it (used when the caller passes a tail) |

### Прочие переменные окружения · Other environment variables

| Переменная | Умолчание | Смысл |
|---|---|---|
| `KOMPAKT_AGENT` | пусто | Имя агента = имя файла D |
| `KOMPAKT_VHOD` | 0 | Предел входа сводки, знаков; 0 — без предела |
| `KOMPAKT_POTOLOK` | 393 216 | Потолок `max_tokens` провайдера |
| `KOMPAKT_ZN_NA_TOK` | 2.0 | Знаков на токен для оценки входа; увеличивать без нового замера нельзя |
| `KOMPAKT_ZAPAS` | 8192 | Запас окна на обрамление запроса, токены |
| `KOMPAKT_MIN_VYHOD` | 8192 | Если места под сводку меньше, отказ |
| `KOMPAKT_PLATFORMENNYJ` | `true`, если порог прочитан | Признак платформенного компакта (экспортируется) |
| `KOMPAKT_OTKAZY`, `KOMPAKT_UDACHI` | `$HOME/pamyat/otkazy-kompakta`, `$HOME/pamyat/udachi-kompakta` | Каталоги следа сводок |
| `KOMPAKT_VYHOD` | 100000 | Объявлена, кодом не используется |
| `KOMPAKT_DOLYA`, `KOMPAKT_OKNO`, `KOMPAKT_POROG` | — | Запрещены: если заданы, импорт падает (порог задаётся только через `porogi` в D) |
| `KOMPAKT_SAMOPROVERKA` | — | Самопроверка. Включает её любое непустое значение, и не только при `node index.mjs`: проверка стоит в теле модуля и срабатывает при любом импорте, в том числе в процессе-потребителе. В конце она вызывает `process.exit` (0/1/2) и тем завершает этот процесс. В окружении шлюзов и агентов не задавать |
| `HOME`, `CODEX_HOME` | — | Поиск журнала сессии: `$HOME/.claude/projects/...`, затем `$CODEX_HOME/sessions/...` |

| Variable | Default | Meaning |
|---|---|---|
| `KOMPAKT_AGENT` | empty | Agent name = D file name |
| `KOMPAKT_VHOD` | 0 | Summary input limit, characters; 0 means unlimited |
| `KOMPAKT_POTOLOK` | 393,216 | Provider `max_tokens` ceiling |
| `KOMPAKT_ZN_NA_TOK` | 2.0 | Characters per token for input estimation; do not raise without a new measurement |
| `KOMPAKT_ZAPAS` | 8192 | Window margin for request framing, tokens |
| `KOMPAKT_MIN_VYHOD` | 8192 | If less room is left for the summary, refuse |
| `KOMPAKT_PLATFORMENNYJ` | `true` if the threshold was read | Platform compaction flag (exported) |
| `KOMPAKT_OTKAZY`, `KOMPAKT_UDACHI` | `$HOME/pamyat/otkazy-kompakta`, `$HOME/pamyat/udachi-kompakta` | Summary trace directories |
| `KOMPAKT_VYHOD` | 100000 | Declared, not used by the code |
| `KOMPAKT_DOLYA`, `KOMPAKT_OKNO`, `KOMPAKT_POROG` | — | Forbidden: if set, the import fails (the threshold comes only from `porogi` in D) |
| `KOMPAKT_SAMOPROVERKA` | — | Self-check. Any non-empty value enables it, and not only under `node index.mjs`: the check sits in the module body and fires on any import, including in a consumer process. At the end it calls `process.exit` (0/1/2) and so terminates that process. Do not set it in the environment of gateways and agents |
| `HOME`, `CODEX_HOME` | — | Session log lookup: `$HOME/.claude/projects/...`, then `$CODEX_HOME/sessions/...` |

Флаги `KOMPAKT_SHLYUZOVOJ`, `KOMPAKT_PLATFORMENNYJ`, `KOMPAKT_RAZMYSHLENIYA`: истина только для строки `true`. Заданная пустая `KOMPAKT_SHLYUZOVOJ` означает `false`, то есть шлюзовой компакт выключен.

The flags `KOMPAKT_SHLYUZOVOJ`, `KOMPAKT_PLATFORMENNYJ`, `KOMPAKT_RAZMYSHLENIYA` are true only for the string `true`. A set but empty `KOMPAKT_SHLYUZOVOJ` means `false`, i.e. gateway compaction is off.

Ступени занятости `KOMPAKT_STUPENI` = 0.60 / 0.80 / 0.95 от порога зашиты в код. Подробный справочник — [docs/SETTINGS.md](docs/SETTINGS.md).

The occupancy steps `KOMPAKT_STUPENI` = 0.60 / 0.80 / 0.95 of the threshold are hard-coded. Detailed reference: [docs/SETTINGS.md](docs/SETTINGS.md).

## Проверка · Verification

`scripts` в `package.json` нет. Стенды запускаются из каталога пакета: `node stend-<имя>.mjs`. Модель подменяется через `globalThis.fetch`, временные каталоги создаются в `/tmp` и убираются. Стенды, которые поднимают модуль в своём процессе, наследуют окружение: заданный `KOMPAKT_AGENT` без файла D или заданный `KOMPAKT_POROG` уронят импорт. Поэтому запускать их нужно в окружении без `KOMPAKT_*`. Ни один стенд не пишет в установленный каталог, профили или шлюз.

`package.json` has no `scripts`. Stands are run from the package directory: `node stend-<name>.mjs`. The model is faked via `globalThis.fetch`; temporary directories are created in `/tmp` and removed. Stands that load the module in their own process inherit the environment: a set `KOMPAKT_AGENT` without a D file or a set `KOMPAKT_POROG` will break the import, so run them in an environment without `KOMPAKT_*`. No stand writes to the installed directory, profiles or gateway.

| Стенд | Что держит | Коды выхода |
|---|---|---|
| `stend-boevogo-puti.mjs` | рабочий путь сводки зовёт `strokiRashoda`; адрес и модель доходят до тела запроса; строка порога при подъёме | 0 все пробы прошли, 1 есть красные, 130/143 по SIGINT/SIGTERM |
| `stend-istochnikov.mjs` | источник каждого значения, отказ при пропавшем или битом D и возврат | 0 / 1 / 130 / 143 |
| `stend-last-output.mjs` | `zanyatostIzZhurnala` отдаёт выход последнего вызова, а не накопленный | 0; падение `assert` даёт ненулевой |
| `stend-lenivyh-tekstovyh-nastroek.mjs` | битый или недоступный JSON размещения не роняет импорт, отказывает только сводка, после ремонта работает; под root проба недоступного JSON слепа — код 2 | 0; падение `assert` даёт ненулевой; 2 под root |
| `stend-metki-rezhima.mjs` | барьер `[MODE=…]` и перенос метки в первую строку | 0 / 1 / 130 / 143 |
| `stend-okna.mjs` | чтение маршрутов D без пересчёта, отказ на негодной `schema`, запрет `KOMPAKT_POROG` | 0 / 1 |
| `stend-pereklyuchatelej.mjs` | исходы `reshitKompakt` | 0 / 1 |
| `stend-polnoy-zanyatosti.mjs` | нормализация `anthropic` и `openai`, отказы по имени поставщика | 0 / 1 |
| `stend-predohranitelya.mjs` | `chtoOtdat`: предохранитель длины и порог «нечего сжимать» | 0 чисто, 1 расхождение, 2 слепота |
| `stend-putej-vhoda.mjs` | пометка путей, которых нет во входе | 0 / 1 / 130 / 143 |
| `stend-ramki-i-otkaza.mjs` | рамки стенограммы и хвоста, след отказов и удач (права, ротация) | 0 / 1 / 130 / 143 |
| `stend-rashoda.mjs` | строки расхода: токены отдельно от денег | 0 / 1 |
| `stend-sostava.mjs` | состав тарбола по белому списку `files`; вызывает `npm pack` на копии пакета во временном каталоге (нужен `npm`); путь к другому пакету можно передать аргументом | 0 / 1 / 130 / 143 |
| `stend-svodki-porogov.mjs` | устаревшая `svodkaPorogov` (сохранена, не вызывается) | 0 / 1 |
| `stend-tekstovyh-nastroek.mjs` | подстановки в настоящем теле запроса, отказы JSON размещения | 0; падение `assert` даёт ненулевой |
| `stend-versii-v-zhurnale.mjs` | версия в каждой строке журнала берётся из соседнего `package.json` | 0 / 1 / 130 / 143 |

| Stand | What it holds | Exit codes |
|---|---|---|
| `stend-boevogo-puti.mjs` | the production summary path calls `strokiRashoda`; endpoint and model reach the request body; threshold line at start-up | 0 all probes passed, 1 any red, 130/143 on SIGINT/SIGTERM |
| `stend-istochnikov.mjs` | source of every value, refusal on missing/broken D and recovery | 0 / 1 / 130 / 143 |
| `stend-last-output.mjs` | `zanyatostIzZhurnala` returns the last call's output, not the cumulative one | 0; a failed `assert` gives non-zero |
| `stend-lenivyh-tekstovyh-nastroek.mjs` | broken/unreadable deployment JSON does not break the import, only the summary refuses, works again after repair; under root the unreadable-JSON probe is blind — exit 2 | 0; a failed `assert` gives non-zero; 2 under root |
| `stend-metki-rezhima.mjs` | the `[MODE=…]` barrier and moving the tag to the first line | 0 / 1 / 130 / 143 |
| `stend-okna.mjs` | reading D routes without recomputation, refusal on a bad `schema`, `KOMPAKT_POROG` forbidden | 0 / 1 |
| `stend-pereklyuchatelej.mjs` | `reshitKompakt` outcomes | 0 / 1 |
| `stend-polnoy-zanyatosti.mjs` | `anthropic` and `openai` normalisation, provider-name refusals | 0 / 1 |
| `stend-predohranitelya.mjs` | `chtoOtdat`: the length fuse and the "nothing to compress" threshold | 0 clean, 1 mismatch, 2 blind |
| `stend-putej-vhoda.mjs` | marking paths absent from the input | 0 / 1 / 130 / 143 |
| `stend-ramki-i-otkaza.mjs` | transcript and tail frames, refusal and success trace (modes, rotation) | 0 / 1 / 130 / 143 |
| `stend-rashoda.mjs` | cost lines: tokens separate from money | 0 / 1 |
| `stend-sostava.mjs` | tarball contents under the `files` white list; runs `npm pack` on a copy of the package in a temporary directory (needs `npm`); a path to another package can be passed as an argument | 0 / 1 / 130 / 143 |
| `stend-svodki-porogov.mjs` | the obsolete `svodkaPorogov` (kept, not called) | 0 / 1 |
| `stend-tekstovyh-nastroek.mjs` | substitutions in the real request body, deployment JSON refusals | 0; a failed `assert` gives non-zero |
| `stend-versii-v-zhurnale.mjs` | the version in every log line comes from the neighbouring `package.json` | 0 / 1 / 130 / 143 |

Самопроверка `KOMPAKT_SAMOPROVERKA=1 node index.mjs` (включается любым непустым значением и при любом импорте модуля, см. «Прочие переменные окружения») возвращает 0, если всё чисто, 1 при расхождении и 2 при слепоте. Она не подменяет модель: при наличии ключа делает платный вызов к `KOMPAKT_ADRES` и пишет удачную пару в настоящий `$HOME/pamyat/udachi-kompakta` (если не задан `KOMPAKT_UDACHI`). Без ключа 5 из 10 проб слепы. Без `KOMPAKT_AGENT` и D проба ступеней краснеет. Сессии для проб создаются в `/tmp/kompakt-samoproverka-*`.

The self-check `KOMPAKT_SAMOPROVERKA=1 node index.mjs` (enabled by any non-empty value and on any import of the module, see Other environment variables) returns 0 when clean, 1 on a mismatch and 2 when blind. It does not fake the model: with a key present it makes a paid call to `KOMPAKT_ADRES` and writes a success pair into the real `$HOME/pamyat/udachi-kompakta` (unless `KOMPAKT_UDACHI` is set). Without a key 5 of 10 probes are blind. Without `KOMPAKT_AGENT` and D the step probe turns red. Probe sessions are created in `/tmp/kompakt-samoproverka-*`.

Живой признак: при импорте модуль печатает в stderr строки `[kompakt <версия>]` с источником настройки («ВНЕШНЯЯ» и путь D), порогом и источниками значений; бюджет и расход вызова сводки печатаются в stdout строками `[kompakt-nash <версия>]`. Что ловит и чего не ловит каждый сторож — [docs/GUARDS.md](docs/GUARDS.md); частые поломки — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

Live sign: on import the module prints `[kompakt <version>]` lines to stderr with the settings source ("ВНЕШНЯЯ" — external — and the D path), the threshold and value sources; the summary call budget and cost are printed to stdout as `[kompakt-nash <version>]` lines. What each guard catches and misses: [docs/GUARDS.md](docs/GUARDS.md); common failures: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Ограничения · Limitations

- Не решает, когда сжимать. Молчание модуля означает «не звали». Занятость видна с запаздыванием на ход: выход хода попадает в окно только следующим входом.
- It does not decide when to compact. Silence from the module means "not called". Occupancy lags by one turn: a turn's output enters the window only as the next input.
- `reshitKompakt` различает `neizvestno` (нет данных — не ноль), `zdyot`, `vyklyuchen`, `zhat`. Ступени (`stupenZanjatosti`) модуль только вычисляет; печать при пересечении и сброс `STUPEN_SESSII` делает зовущий.
- `reshitKompakt` distinguishes `neizvestno` (no data, not zero), `zdyot`, `vyklyuchen`, `zhat`. The module only computes steps (`stupenZanjatosti`); printing on crossing and resetting `STUPEN_SESSII` is the caller's job.
- Поставщиков занятости два: `anthropic` и `openai`. Неизвестное или пустое имя приводит к исключению, нового поставщика добавляют в `VEDRA_POSTAVSHCHIKA`. Форматов журнала тоже два: Claude Agent SDK и Codex rollout.
- There are two occupancy providers: `anthropic` and `openai`. An unknown or empty name throws, and a new provider is added in `VEDRA_POSTAVSHCHIKA`. There are also two log formats: Claude Agent SDK and Codex rollout.
- В сводку идут только текстовые блоки (`text`, `input_text`, `output_text`) ролей `user` и `assistant`. Вызовы инструментов, их результаты и роль `developer` не входят. Хвост считается строками JSONL, а не ходами. Битые строки хвоста не переносятся.
- Only text blocks (`text`, `input_text`, `output_text`) of the `user` and `assistant` roles go into the summary. Tool calls, their results and the `developer` role are excluded. The tail is counted in JSONL lines, not turns. Broken tail lines are not carried over.
- При `KOMPAKT_VHOD > 0` более ранняя проза отбрасывается, а обрезанный ход помечается «НАЧАЛО ХОДА ОТРЕЗАНО».
- With `KOMPAKT_VHOD > 0` earlier prose is dropped, and the cut turn is marked "НАЧАЛО ХОДА ОТРЕЗАНО" (start of turn cut off).
- Если места в окне модели сводки меньше `KOMPAKT_MIN_VYHOD`, модуль отказывает целиком и не выдаёт урезанную сводку. Окно модели сводки, потолок 393 216 и 2.0 знака на токен — замеры для одной модели; при её смене их нужно переснять.
- If less than `KOMPAKT_MIN_VYHOD` of room is left in the summary model window, the module refuses outright and returns no truncated summary. The summary model window, the 393,216 ceiling and 2.0 characters per token are measurements for one model; re-measure them when the model changes.
- Предохранитель: если сводка не короче прозы, в журнал кладётся проза с подписью «БЕЗ СЖАТИЯ».
- Fuse: if the summary is not shorter than the prose, the prose is written to the log with a "БЕЗ СЖАТИЯ" (uncompressed) label.
- Проверка путей помечает (`⚠️ НЕТ ВО ВХОДЕ СЖАТИЯ`), но не удаляет пути в обратных кавычках, последнего сегмента которых нет во входе. Выдуманные имена и задачи без пути она не ловит. Путь, чей последний сегмент случайно встречается во входе, тоже пройдёт.
- The path check marks (`⚠️ НЕТ ВО ВХОДЕ СЖАТИЯ`, not in the compaction input) but does not remove backticked paths whose last segment is absent from the input. It does not catch invented names or tasks without a path. A path whose last segment happens to occur in the input also passes.
- Перенос метки `[MODE=…]` не отличает чужую метку, процитированную в первых 5 строках ответа на задачу.
- Moving the `[MODE=…]` tag does not tell apart a foreign tag quoted within the first 5 lines of an answer to the task.
- След отказа сохраняется только при нарушении договора `[MODE=…]`. HTTP-ошибки, пустой ответ и нехватка окна дают исключение без следа.
- A refusal trace is saved only when the `[MODE=…]` contract is violated. HTTP errors, an empty answer and lack of window room raise an exception without a trace.
- Копии `*.bak-pre-kompakt-*` не ротируются и копятся рядом с журналом. Блокировки журнала нет: запись идёт через временный файл и `rename`; права журнала сохраняются (0600 остаётся 0600).
- `*.bak-pre-kompakt-*` copies are not rotated and pile up next to the log. There is no log locking: the write goes through a temporary file and `rename`; the log mode is kept (0600 stays 0600).
- `zanyatostPoSvezhemuZhurnalu` берёт самый свежий по времени журнал в `$CODEX_HOME/sessions`. Если параллельных сессий несколько, число будет от той, что писалась последней.
- `zanyatostPoSvezhemuZhurnalu` takes the most recently modified log under `$CODEX_HOME/sessions`. With several parallel sessions the number comes from whichever was written last.
- Платформенный порог (`thresholdRatio` пресета) модулю недоступен. `KOMPAKT_PLATFORMENNYJ` означает лишь, что порог из D прочитан.
- The platform threshold (preset `thresholdRatio`) is not accessible to the module. `KOMPAKT_PLATFORMENNYJ` only means the threshold was read from D.
- Зависимости: модель сводки по сети (ключ из окружения; вызов ограничен 600000 мс и прерывается сигналом отмены платформы), файл D от сборщика настроек. Шлюз `/opt/claude-oauth/gateway.mjs` при недоступном модуле или неполном контракте (включая отсутствие порога для `KOMPAKT_AGENT`) не падает: компакт помечается недоступным, `fizicheskiyKompakt` отказывает, а транспорт работает дальше. `dsh-pamyat-kompakt-dsh` без этого пакета не загружается.
- Dependencies: the summary model over the network (key from the environment; the call is bounded by 600000 ms and aborted by the platform cancellation signal) and the D file from the settings builder. The gateway `/opt/claude-oauth/gateway.mjs` does not crash if the module is unavailable or its contract is incomplete (including a missing threshold for `KOMPAKT_AGENT`): compaction is marked unavailable, `fizicheskiyKompakt` refuses, and the transport keeps working. `dsh-pamyat-kompakt-dsh` does not load without this package.
- Промт, рамки, строки журнала и подписи в сессии — на русском.
- The prompt, frames, log lines and session labels are in Russian.
