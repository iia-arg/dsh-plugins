# dsh-pamyat-omega

## Назначение · Purpose

Плагин DSH (cordis) — необязательный долговременный слой памяти поверх внешнего хранилища OMEGA по MCP (JSON-RPC `tools/call` по HTTP). Он записывает знание (`omega_store`) и отдельно подтверждает доставку чтением (`omega_call` → `omega_memory`), отличая «не отправлено», «могло дойти» и «не найдено» от подтверждённой записи. Включаемая отдельно выдача по смыслу ищет записи (`omega_query`) и подаёт их модели как данные, не как указание. Локальное ядро памяти (`dsh-pamyat-core`) работает и без этого пакета; политики записи, очередь повторов и дистилляция — не здесь.

A DSH (cordis) plugin providing an optional long-term memory layer on top of an external OMEGA store over MCP (JSON-RPC `tools/call` over HTTP). It writes knowledge (`omega_store`) and separately confirms delivery by reading it back (`omega_call` → `omega_memory`), distinguishing "not sent", "may have arrived" and "not found" from a confirmed record. Semantic retrieval, enabled separately, searches records (`omega_query`) and hands them to the model as data, not instructions. The local memory core (`dsh-pamyat-core`) works without this package; write policy, the retry queue and distillation live elsewhere.

## Что ставится и куда · What gets installed and where

Файлы пакета (поле `files` в `package.json`: `src`, `test`, `docs`, `README.md`, `README.en.md`, `CHANGELOG.md`; `package.json` и `LICENSE` npm кладёт в архив сам):

Package files (the `files` field in `package.json`: `src`, `test`, `docs`, `README.md`, `README.en.md`, `CHANGELOG.md`; npm adds `package.json` and `LICENSE` to the archive by itself):

| Файл · File | Что внутри · Contents |
|---|---|
| `src/index.js` | `name`, `Config` (схема настройки), `apply`: службы, шов `agent/pre-step`, регистрация инструментов · `name`, `Config` (settings schema), `apply`: services, the `agent/pre-step` hook, tool registration |
| `src/svyaz.js` | MCP-связь: `sozdatSvyaz` (POST, разбор SSE `data:`/строк JSON, Bearer-ключ, предел ожидания), `razobratPotok` · MCP connection: `sozdatSvyaz` (POST, parsing SSE `data:`/JSON lines, Bearer key, timeout), `razobratPotok` |
| `src/podtverzhdenie.js` | `istolkovatOtvet`: разбор ответа `omega_memory` (секция Source, «not found») · `istolkovatOtvet`: parsing the `omega_memory` reply (Source section, "not found") |
| `src/vydacha.js` | Чистые функции выдачи: разбор `omega_query`, отбор, бюджеты, рамка гостевых корней, строка журнала · Pure retrieval functions: `omega_query` parsing, selection, budgets, guest-root framing, journal line |
| `test/stend-*.mjs` | Стенды (раздел «Проверка») · Test stands (see "Verification") |
| `docs/` | `ARCHITECTURE.md`, `SETTINGS.md`, `GUARDS.md`, `TROUBLESHOOTING.md` |
| `LICENSE` | Текст лицензии MIT (поле `license` в `package.json`) · The MIT license text (the `license` field in `package.json`) |

Боевой путь на машине: `/opt/agent-plugins/node_modules/dsh-pamyat-omega`. В профиле агента `/opt/<агент>/.dsh/profiles/web/node_modules/dsh-pamyat-omega` — символическая ссылка на этот каталог, в `/opt/<агент>/.dsh/profiles/web/package.json` — зависимость `file:/opt/agent-plugins/node_modules/dsh-pamyat-omega`.

Production path on the machine: `/opt/agent-plugins/node_modules/dsh-pamyat-omega`. In an agent profile, `/opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-omega` is a symlink to that directory, and `/opt/<agent>/.dsh/profiles/web/package.json` has the dependency `file:/opt/agent-plugins/node_modules/dsh-pamyat-omega`.

Что регистрирует `apply` (по `src/index.js`):

What `apply` registers (per `src/index.js`):

- Служба `pamyatDolgovremennaya` (`ctx.provide`, всегда): `dostupna()`, `pochemuNedostupna()`, `sohranit({soderzhim, tip, metadannye, kto})`, `proverit({id, obrazec})`, `aktivnye({tekst, koren})`, `poTelu({tekst, koren})`.
- Service `pamyatDolgovremennaya` (`ctx.provide`, always): `dostupna()`, `pochemuNedostupna()`, `sohranit({soderzhim, tip, metadannye, kto})`, `proverit({id, obrazec})`, `aktivnye({tekst, koren})`, `poTelu({tekst, koren})`.
  - `sohranit` возвращает `{sostoyanie, id, sozdana, pochemu}`; пять состояний: `dostavleno` (чтение нашло запись с совпавшим образцом), `ne-najdeno` (служба ответила «нет» или содержимое чужое), `ne-otpravleno` (вызова не было), `moglo-dojti-bez-id` (вызов начат, id нет — повтор записью дал бы дубль), `moglo-dojti-id-est` (id есть, чтение не подтвердило — повторять чтением). `sozdana`: `true` для `Stored`, `false` для `Deduped/Reconfirmed/Evolved`, иначе `null`.
  - `sohranit` returns `{sostoyanie, id, sozdana, pochemu}` with five states: `dostavleno` (the read found the record with a matching sample), `ne-najdeno` (the service said "absent" or the content belongs to another record), `ne-otpravleno` (no call was made), `moglo-dojti-bez-id` (the call started, no id — a write retry would duplicate), `moglo-dojti-id-est` (id known, the read did not confirm — retry by reading). `sozdana`: `true` for `Stored`, `false` for `Deduped/Reconfirmed/Evolved`, otherwise `null`.
  - Типы `urok/reshenie/oshibka/ogranichenie` уходят как `lesson_learned/decision/error_pattern/constraint`, остальные — как даны; исходный тип кладётся в `metadata.klass`; `kto` уходит как `entity_id`.
  - Types `urok/reshenie/oshibka/ogranichenie` are sent as `lesson_learned/decision/error_pattern/constraint`, others as given; the original type goes into `metadata.klass`; `kto` is sent as `entity_id`.
  - `proverit` читает без записи и возвращает `est`, `net` или `ne-proveryali`. Без образца содержимого он никогда не скажет `est`: опознаватель в ответе укороченный, совпадение по префиксу id не доказывает, что запись наша, поэтому без `obrazec` ответ — `ne-proveryali`.
  - `proverit` reads without writing and returns `est`, `net` or `ne-proveryali`. Without a content sample it will never answer `est`: the identifier in the reply is shortened, and an id-prefix match does not prove the record is ours, so without `obrazec` the answer is `ne-proveryali`.
  - `aktivnye` — действующие записи корня (`omega_query`, первые 1200 знаков, limit 20); `poTelu` — записи корня, содержащие тело целиком (`mode: phrase`, с учётом регистра, limit 3). Оба отвечают `{otkaz}`, если результат неизвестен.
  - `aktivnye` returns active records of a root (`omega_query`, first 1200 characters, limit 20); `poTelu` returns root records containing the whole body (`mode: phrase`, case-sensitive, limit 3). Both answer `{otkaz}` when the result is unknown.
- Только при `vydacha.vkl: true`, непустом `vydacha.koren` и созданной связи:
- Only with `vydacha.vkl: true`, a non-empty `vydacha.koren` and a created connection:
  - служба `pamyatPoSmyslu` с методом `najti(tekst, {rezhim, vseKorni, uzhe, skolko, sid})`;
  - service `pamyatPoSmyslu` with `najti(tekst, {rezhim, vseKorni, uzhe, skolko, sid})`;
  - обработчик `ctx.on('agent/pre-step')` — выдача А: после `next()` на новое письмо источника `user`/`a2a`/`agent-message` (не короче 40 знаков) добавляет сообщение `source.kind = plugin:dsh-pamyat-omega` до 3 записей / 1500 знаков; только записи со связью доверия ядра. Тот же шов один раз сообщает в stderr, доходит ли инструмент Б до модели (через `mcpBridge.toolNames()` или заголовок запроса);
  - handler `ctx.on('agent/pre-step')` — retrieval A: after `next()`, on a new message from source `user`/`a2a`/`agent-message` (at least 40 characters) it appends a message with `source.kind = plugin:dsh-pamyat-omega` holding up to 3 records / 1500 characters, only records with a core trust link. The same hook reports once on stderr whether tool B reaches the model (via `mcpBridge.toolNames()` or the request header);
  - инструмент `pamyat_po_smyslu` (выдача Б: параметры `zadacha`, `skolko`, `vse_korni`; до 15 записей / 8000 знаков) — через `ctx.get('tools').register` и `defineTool` из `@deepseek-ai/dsh-tools`; ожидание службы `tools` до 30 попыток по 1 с.
  - tool `pamyat_po_smyslu` (retrieval B: parameters `zadacha`, `skolko`, `vse_korni`; up to 15 records / 8000 characters) — via `ctx.get('tools').register` and `defineTool` from `@deepseek-ai/dsh-tools`; waits for the `tools` service for up to 30 attempts of 1 s.
- Дополнительно при `gostyam.vkl: true`: служба `pamyatDlyaGostej` и инструмент `pamyat_dlya_gostej` (параметр `vopros`) — только корень `vydacha.koren`, только действующие записи с меткой `gostyam.teg` (`filter_tags`), без id и служебных полей.
- Additionally with `gostyam.vkl: true`: service `pamyatDlyaGostej` and tool `pamyat_dlya_gostej` (parameter `vopros`) — only the `vydacha.koren` root, only active records tagged `gostyam.teg` (`filter_tags`), without ids or internal fields.

Плагин ничего не объявляет в `inject`: службы ядра `pamyat` (`sessiyaIsklyuchena`, `doverieDlyaMem`), `tools` и `mcpBridge` читаются через `ctx.get` в момент вызова. Все сообщения идут в stderr (`console.error`) с префиксом `[dsh-pamyat-omega <версия из package.json>]`, включая безусловную строку подъёма с адресом и пределом ожидания. Своего хранилища, таймера доставки, systemd-юнитов и хуков нет.

The plugin declares nothing in `inject`: the core `pamyat` service (`sessiyaIsklyuchena`, `doverieDlyaMem`), `tools` and `mcpBridge` are read through `ctx.get` at call time. All messages go to stderr (`console.error`) prefixed `[dsh-pamyat-omega <version from package.json>]`, including an unconditional startup line with the address and timeout. There is no own store, delivery timer, systemd unit or hook.

## Установка · Installation

**Откуда ставить.** В npm доступна редакция `3.1.2` (замер 15.10.2026, `npm view dsh-pamyat-omega version`). По решению владельца от 14.10.2026 изменения после публикации ведутся локально и в npm не выкладываются. Для актуальной локальной редакции подготовьте архив из выбранной головы дерева: `npm pack <дерево>/packages/dsh-pamyat-omega`, затем `npm install ./dsh-pamyat-omega-<версия>.tgz`.

**Where to install from.** npm provides `3.1.2` (checked on 2026-10-15 with `npm view dsh-pamyat-omega version`). By the owner's decision of 2026-10-14, changes after publication are maintained locally and are not republished to npm. For the current local edition, pack the selected source revision with `npm pack <tree>/packages/dsh-pamyat-omega`, then run `npm install ./dsh-pamyat-omega-<version>.tgz`.

На машине пакет ставится один раз в общий каталог `/opt/agent-plugins` и подключается профилям ссылкой:

On the machine the package is installed once into the shared `/opt/agent-plugins` directory and linked into profiles:

1. Тарбол лежит в `/opt/agent-plugins-tarbally/dsh-pamyat-omega-<версия>.tgz`; в `/opt/agent-plugins/package.json` зависимость `"dsh-pamyat-omega": "file:../agent-plugins-tarbally/dsh-pamyat-omega-<версия>.tgz"`, версия и `integrity` закреплены в `/opt/agent-plugins/package-lock.json`. Ставит npm в `/opt/agent-plugins` по lock-файлу (`npm ci`); результат — `/opt/agent-plugins/node_modules/dsh-pamyat-omega`.

   The tarball is `/opt/agent-plugins-tarbally/dsh-pamyat-omega-<version>.tgz`; `/opt/agent-plugins/package.json` has `"dsh-pamyat-omega": "file:../agent-plugins-tarbally/dsh-pamyat-omega-<version>.tgz"`, with version and `integrity` pinned in `/opt/agent-plugins/package-lock.json`. npm installs it in `/opt/agent-plugins` from the lock file (`npm ci`); the result is `/opt/agent-plugins/node_modules/dsh-pamyat-omega`.

2. В профиле агента: зависимость `file:/opt/agent-plugins/node_modules/dsh-pamyat-omega` в `profiles/web/package.json` и ссылка `profiles/web/node_modules/dsh-pamyat-omega` на этот каталог.

   In the agent profile: the dependency `file:/opt/agent-plugins/node_modules/dsh-pamyat-omega` in `profiles/web/package.json` and the symlink `profiles/web/node_modules/dsh-pamyat-omega` to that directory.

3. Подключение — блок `insert` в `/opt/<агент>/.dsh/profiles/web/cordis.patch.yml`. Пример по форме боевых профилей (адрес и корень заменить своими; ключ в профиль не пишется — только имя переменной окружения):

   Enabling — an `insert` block in `/opt/<agent>/.dsh/profiles/web/cordis.patch.yml`. Example shaped like the production profiles (replace address and root with your own; the key is never written into the profile — only the environment variable name):

```yaml
- insert:
    - name: dsh-pamyat-omega
      id: dsh-pamyat-omega
      config:
        adres: https://memory.example.com/mcp/
        tajmautMs: 10000
        klyuchIzOkruzheniya: OMEGA_MCP_API_KEY
        vydacha:
          vkl: true
          koren: example-agent
          avto: false
          sistemnyeKorni: ["example-agent", "example-coordinator"]
          gostevyeKorni: ["example-guest"]
          gosti: obertka
```

4. Перезапустить службу агента: адрес, ключ и пределы читаются при `apply`, замена файлов уже созданную связь не меняет.

   Restart the agent service: address, key and timeouts are read in `apply`; replacing files does not change an already created connection.

Вне машины пакет ставится как обычный npm-пакет рядом с peer-зависимостями (раздел «Ограничения»).

Off the machine, install it as a regular npm package next to its peer dependencies (see "Limitations").

## Настройка · Configuration

Ключи `config` (схема `Config` в `src/index.js`):

`config` keys (the `Config` schema in `src/index.js`):

| Ключ · Key | Тип · Type | Умолчание · Default | Смысл · Meaning |
|---|---|---|---|
| `adres` | string | нет · none | Адрес MCP. Завершающий слэш обязателен: без него служба отвечает 307 с пустым телом, и это выглядело бы молчанием хранилища. Пустой адрес — `OMEGA_NET_ADRESA`, без слэша — `OMEGA_ADRES_BEZ_SLESHA`; связь не создаётся, `dostupna()` = false · MCP address. A trailing slash is required: without it the service answers 307 with an empty body, which would look like a silent store. Empty — `OMEGA_NET_ADRESA`, no trailing slash — `OMEGA_ADRES_BEZ_SLESHA`; no connection is created, `dostupna()` = false |
| `klyuchIzOkruzheniya` | string | нет · none | Имя переменной окружения с ключом. Не задано — заголовка `Authorization` нет; задано, а переменная пуста — `OMEGA_KLYUCH_PUST`, связь не создаётся · Name of the environment variable holding the key. Not set — no `Authorization` header; set but the variable is empty — `OMEGA_KLYUCH_PUST`, no connection is created |
| `tajmautMs` | number | `10000` | Предел одного MCP-вызова основной связи (`sohranit` — два вызова, `proverit`, `aktivnye`, `poTelu`) · Limit for one MCP call on the primary connection (`sohranit` makes two calls, `proverit`, `aktivnye`, `poTelu`) |
| `vydacha.vkl` | boolean | `false` | Включить выдачу по смыслу (служба, шов, инструмент Б). Запись не выключает · Enable semantic retrieval (service, hook, tool B). Does not disable writes |
| `vydacha.avto` | boolean | `true` | Выдача А на входящее письмо; `false` оставляет инструмент Б · Retrieval A on incoming messages; `false` keeps tool B |
| `vydacha.koren` | string | `''` | Свой корень (`entity_id`) поиска; пусто — выдача не поднимается · Own search root (`entity_id`); empty — retrieval does not start |
| `vydacha.tajmautMs` | number | `3000` | Предел запроса выдачи; при `vse_korni` — `max(значение, 600 мс × число корней)` · Retrieval request limit; with `vse_korni` — `max(value, 600 ms × number of roots)` |
| `vydacha.sistemnyeKorni` | string[] | `[]` | Корни для `vse_korni`; пустой список — отказ поиска по всем корням · Roots for `vse_korni`; an empty list refuses all-root search |
| `vydacha.gostevyeKorni` | string[] | `[]` | Корни недоверенных (гостевых) данных · Roots holding untrusted (guest) data |
| `vydacha.gosti` | string | `'obertka'` | `obertka` — гостевые записи в рамке «ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ»; `vne` — дополнительные гостевые корни не запрашиваются; иное — отказ · `obertka` — guest records framed as "ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ"; `vne` — additional guest roots are not queried; anything else — refusal |
| `gostyam.vkl` | boolean | `false` | Инструмент `pamyat_dlya_gostej`; работает только при поднятой выдаче (`vydacha.vkl` и `vydacha.koren`) · Tool `pamyat_dlya_gostej`; works only when retrieval is up (`vydacha.vkl` and `vydacha.koren`) |
| `gostyam.teg` | string | `'dlya-gostej'` | Метка в `metadata.tags`; пусто — отказ · Tag in `metadata.tags`; empty — refusal |
| `gostyam.zapisej` | number | `5` | Сколько записей отдать гостю, в коде зажато в 1–15 · Records returned to a guest, clamped to 1–15 in code |

НЕ является настройкой и намеренно не настраивается: имена инструментов OMEGA, форма ответа «записи нет», различение «неизвестно» и «нет», обязательная сверка образца содержимого. Выключатель сверки позволил бы объявить доставкой чужую запись. Фиксированные пределы выдачи (`PREDEL` в `src/vydacha.js`): А — 3 записи / 1500 знаков, Б — 15 / 8000, вход 1200 знаков, 20 кандидатов, минимум письма 40 знаков, снимки старше 48 ч отсеиваются, порог дубля 0.5.

NOT configurable, on purpose: OMEGA tool names, the "record missing" reply format, the distinction between "unknown" and "absent", and the mandatory content-sample check. A switch to skip the check would allow another record to be reported as ours. Fixed retrieval limits (`PREDEL` in `src/vydacha.js`): A — 3 records / 1500 characters, B — 15 / 8000, input 1200 characters, 20 candidates, minimum message 40 characters, snapshots older than 48 h are dropped, duplicate threshold 0.5.

Окружение и файлы, которые читает код:

Environment and files read by the code:

- переменная с именем из `klyuchIzOkruzheniya` — при `apply`, значение уходит в `Authorization: Bearer`;
- the variable named by `klyuchIzOkruzheniya` — in `apply`; its value goes into `Authorization: Bearer`;
- `PAMYAT_B_NE_IZMERENO_MS` — через сколько мс без шага своей сессии писать «Б: НЕ ИЗМЕРЕНО» (умолчание 600000), читается при загрузке модуля;
- `PAMYAT_B_NE_IZMERENO_MS` — after how many ms without an own-session step to log "Б: НЕ ИЗМЕРЕНО" (default 600000), read at module load;
- `../package.json` пакета — версия для строк stderr;
- the package's `../package.json` — version for stderr lines;
- `@deepseek-ai/dsh-tools` разрешается от `process.argv[1]` (установка запускающего процесса).
- `@deepseek-ai/dsh-tools` is resolved from `process.argv[1]` (the launching process installation).

## Проверка · Verification

Стенды гоняют настоящий код против подставной MCP-точки на `127.0.0.1` или подставного транспорта; живую OMEGA не трогают. Запуск всех: `npm test` в каталоге пакета (нужен POSIX shell); одного: `node test/<стенд>.mjs`.

Stands run the real code against a fake MCP endpoint on `127.0.0.1` or a fake transport; the live OMEGA is not touched. Run all: `npm test` in the package directory (needs a POSIX shell); one: `node test/<stand>.mjs`.

Коды каждого стенда: `0` — годно, `1` — расхождение (в том числе непойманное исключение `assert`), `2` — слепота (предмет не загрузился, нет окружения или соседа). `scripts.test` прогоняет все `test/stend-*.mjs` по очереди и возвращает `1`, если хоть один дал 1; иначе — ненулевой код ПОСЛЕДНЕГО упавшего стенда, будь то 2 или иной (коды не старшинствуют: 2, а затем 3 дают 3; 3, а затем 2 — 2); иначе `0`.

Exit codes of each stand: `0` — pass, `1` — mismatch (including an uncaught `assert` exception), `2` — blind (subject failed to load, missing environment or neighbour). `scripts.test` runs every `test/stend-*.mjs` in turn and returns `1` if any returned 1; otherwise the non-zero code of the LAST failed stand, whether 2 or another (codes have no precedence: 2 then 3 give 3; 3 then 2 give 2); otherwise `0`.

Окружение стендов: `stend-dostupnosti-b` и `stend-b-kazhdyj-podyom` требуют `DSH_TEST_APP` или `STEND_APP`, `stend-bez-isklyucheniya` — `DSH_TEST_APP` (каталог установки DSH для `@deepseek-ai/dsh-tools`), иначе код 2. `STEND_OMEGA` подменяет проверяемый `src/index.js` в `stend-vseh-kornej`, `stend-zamera-vydachi`, `stend-b-kazhdyj-podyom`. `stend-prichina-identichnost` ищет соседний пакет `dsh-pamyat-secretary` в том же родительском каталоге. Проба стыка в `stend-vydachi` загружает `dsh-pamyat-core`. `stend-readme` вызывает `npm pack --dry-run`.

Stand environment: `stend-dostupnosti-b` and `stend-b-kazhdyj-podyom` need `DSH_TEST_APP` or `STEND_APP`, `stend-bez-isklyucheniya` needs `DSH_TEST_APP` (the DSH installation directory supplying `@deepseek-ai/dsh-tools`); otherwise code 2. `STEND_OMEGA` substitutes the tested `src/index.js` in `stend-vseh-kornej`, `stend-zamera-vydachi`, `stend-b-kazhdyj-podyom`. `stend-prichina-identichnost` looks for the sibling package `dsh-pamyat-secretary` in the same parent directory. The integration probe in `stend-vydachi` loads `dsh-pamyat-core`. `stend-readme` runs `npm pack --dry-run`.

| Стенд · Stand | Что проверяет · What it checks |
|---|---|
| `stend-svyazi` | Связь: нет адреса или слэша, ключ (передан, не задан, пуст, не принят — 401), обрыв и пустой ответ — «неизвестно», а не «нет»; отказ службы отдельно от обрыва; разбор SSE · Connection: missing address or slash, key (passed, unset, empty, rejected — 401), broken connection and empty reply — "unknown", not "absent"; service refusal distinct from a broken connection; SSE parsing |
| `stend-podtverzhdeniya` | Разбор ответа `omega_memory` по эталонам OMEGA: Source, укороченный id, «not found», чужое содержимое · Parsing of the `omega_memory` reply against OMEGA fixtures: Source, shortened id, "not found", foreign content |
| `stend-sborki` | Провайдер целиком: служба объявлена, адрес без слэша, `ne-otpravleno`, `proverit` без образца и при мёртвой связи, строка подъёма с версией из манифеста, схема · Whole provider: service declared, address without slash, `ne-otpravleno`, `proverit` without a sample and with a dead connection, startup line with the manifest version, schema |
| `stend-sozdana` | `sozdana` по ответу записи (`Stored` / `Deduped/Reconfirmed/Evolved`) отдельно от доставки · `sozdana` from the write reply (`Stored` / `Deduped/Reconfirmed/Evolved`) separately from delivery |
| `stend-karty-tipov` | Перевод типов и `metadata.klass` — по телу запроса, полученного подставной точкой · Type mapping and `metadata.klass` — from the request body received by the fake endpoint |
| `stend-krik-zvuchit` | Отказ слышен в stderr отдельного процесса с настоящим `Context` cordis · A refusal is audible on stderr of a separate process with a real cordis `Context` |
| `stend-zapisi-bez-politiki` | Без `sessiyaIsklyuchena` ядра `sohranit` и `aktivnye` не идут в HTTP; после восстановления — идут · Without core `sessiyaIsklyuchena`, `sohranit` and `aktivnye` make no HTTP call; after recovery they do |
| `stend-bez-isklyucheniya` | То же для выдачи А, `najti` и зарегистрированного инструмента Б; исключённая сессия · The same for retrieval A, `najti` and the registered tool B; excluded session |
| `stend-vydachi` | Выдача: деградация, корень через связь ядра, многосвязь, project и старые снимки, дубли, бюджеты, шов, `vkl`/`avto`, гостевые корни, стык с правилом ядра · Retrieval: degradation, root via core link, multiple links, project and old snapshots, duplicates, budgets, the hook, `vkl`/`avto`, guest roots, agreement with the core rule |
| `stend-vseh-kornej` | Поиск по всем корням: предел растёт с числом корней, частичная выдача «НЕПОЛНО», одна константа предела · All-root search: limit grows with root count, partial delivery marked "НЕПОЛНО", one limit constant |
| `stend-zamera-vydachi` | Строка исхода выдачи Б несёт время, охват и предел · Retrieval B outcome line carries duration, scope and limit |
| `stend-dostupnosti-b` | `dostupnostB`: регистрация Б и набор, видимый модели (мост, заголовок, сбой моста) · `dostupnostB`: B registration vs. the set visible to the model (bridge, header, bridge failure) |
| `stend-b-kazhdyj-podyom` | Вердикт о Б на каждом подъёме: «ДОХОДИТ» / «НЕ доходит» / «НЕ ИЗМЕРЕНО»; гостевая сессия не захватывает вердикт · A B verdict on every startup: "ДОХОДИТ" / "НЕ доходит" / "НЕ ИЗМЕРЕНО"; a guest session does not capture the verdict |
| `stend-gostej` | `pamyat_dlya_gostej`: только свой корень, метка, действующие записи; хвост ограничений и id не выдаются; отказ шлюза — отказ, а не «сведений нет» · `pamyat_dlya_gostej`: own root, tag and active records only; constraints tail and ids are not returned; a gateway refusal is a refusal, not "nothing known" |
| `stend-po-telu` | `poTelu`: аргументы запроса, 1/0/3 id, эхо тела не читается результатом, расхождение с шапкой — отказ, без корня — без HTTP · `poTelu`: request arguments, 1/0/3 ids, the echoed body is not read as a result, header mismatch — refusal, no root — no HTTP |
| `stend-prichina-identichnost` | `prichina_stroka` в `src/svyaz.js` побайтно совпадает с копией в `dsh-pamyat-secretary` · `prichina_stroka` in `src/svyaz.js` is byte-identical to the copy in `dsh-pamyat-secretary` |
| `stend-readme` | Обязательные признаки обоих README и наличие упомянутых в них файлов в составе публикации · Required markers in both READMEs and presence of the files they mention in the published package |

Признак установки на машине: `readlink /opt/<агент>/.dsh/profiles/web/node_modules/dsh-pamyat-omega` указывает на `/opt/agent-plugins/node_modules/dsh-pamyat-omega`; в stderr службы агента — строка подъёма с адресом.

Installation check on the machine: `readlink /opt/<agent>/.dsh/profiles/web/node_modules/dsh-pamyat-omega` points to `/opt/agent-plugins/node_modules/dsh-pamyat-omega`; the agent service stderr shows the startup line with the address.

## Ограничения · Limitations

- `dostupna()` доказывает только, что связь создана из настройки, а не работу сети или ключа.
- `dostupna()` proves only that the connection was created from the settings, not that the network or key works.
- Подтверждение сверяет префикс id и первые 40 нормализованных знаков образца внутри секции Source — это не сравнение полного текста. Признак «not found» ищется по всему ответу до выделения Source; образец из одних пробелов даёт ложное `dostavleno` — вызывающий должен отвергать его сам.
- Confirmation compares the id prefix and the first 40 normalized sample characters inside the Source section — not a full-text comparison. The "not found" marker is searched in the whole reply before Source is isolated; a whitespace-only sample yields a false `dostavleno` — the caller must reject it.
- Внешний контракт разметки ответов OMEGA (Source, список похожих записей, `` ## N. [тип] `mem-…` ``, «Phrase Search Results») зашит в разборщики; при смене серверной реализации его надо перемерить живым обезличенным ответом — эталоны стендов новую разметку сами не обнаружат. Ответ с `keyword-only mode` считается деградацией и отвергается целиком.
- The External contract of OMEGA reply markup (Source, the similar-records list, `` ## N. [type] `mem-…` ``, "Phrase Search Results") is built into the parsers; when the server implementation changes it must be re-measured against a sanitized live reply — stand fixtures cannot detect a new format by themselves. A reply containing `keyword-only mode` is treated as degradation and rejected entirely.
- Без `sessiyaIsklyuchena` ядра запись, `aktivnye`, `poTelu` и выдача отказывают до HTTP с `PAMYAT_POLITIKA_NEDOSTUPNA`; `proverit` политику не проверяет. `sohranit` не получает id сессии — исключение конкретной записи остаётся за вызывающим ядром. Инструмент `pamyat_dlya_gostej` исключение сессий не проверяет (он для таких сессий и сделан).
- Without core `sessiyaIsklyuchena`, writes, `aktivnye`, `poTelu` and retrieval refuse before HTTP with `PAMYAT_POLITIKA_NEDOSTUPNA`; `proverit` does not check policy. `sohranit` receives no session id — excluding a particular write stays with the calling core. Tool `pamyat_dlya_gostej` does not check session exclusion (it exists for such sessions).
- Срок хранения назначает OMEGA: типы вне карты (например, `fakt`, `poryadok`, `nablyudenie`) уходят как есть и по протоколу службы могут истечь; карта действует только на новые записи.
- Retention is set by OMEGA: types outside the map (e.g. `fakt`, `poryadok`, `nablyudenie`) are sent as is and may expire under the service protocol; the map affects only new records.
- Выдача А не подаёт записи без связи доверия ядра (`doverieDlyaMem`); множество уже поданных id живёт в памяти процесса и теряется при перезапуске. Бюджет — оценка `prevyu.length + 80`, первая запись может его превысить. Отсев снимков и дублей эвристичен (слова SNIMOK, Жаккар 0.5 — перефраз не ловит).
- Retrieval A delivers no records without a core trust link (`doverieDlyaMem`); the set of already delivered ids lives in process memory and is lost on restart. The budget is the estimate `prevyu.length + 80`; the first record may exceed it. Snapshot and duplicate filtering is heuristic (SNIMOK words, Jaccard 0.5 — paraphrases are missed).
- `poTelu` не фильтрует по статусу и захватывает записи без `entity_id`; `aktivnye` видит только 20 кандидатов.
- `poTelu` has no status filter and also matches records without `entity_id`; `aktivnye` sees only 20 candidates.
- Регистрация `pamyat_po_smyslu` не доказывает, что модель его видит или вызывает; без службы `tools` за 30 с или без `@deepseek-ai/dsh-tools` инструмент не регистрируется (отказ в stderr).
- Registering `pamyat_po_smyslu` does not prove the model sees or calls it; without the `tools` service within 30 s or without `@deepseek-ai/dsh-tools` the tool is not registered (refusal on stderr).
- Нет проверки здоровья сети по таймеру, повторной записи, смены ключей, резервного копирования, гарантии истинности памяти.
- No timer-based network health check, write retries, key rotation, backup, or guarantee that memory is true.
- Зависимости: peer — `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery` (диапазоны в `package.json`); Node.js не ниже `engines.node`; во время работы — `@deepseek-ai/dsh-tools` из установки DSH (в `peerDependencies` не объявлен); внешняя служба OMEGA с MCP-инструментами `omega_store`, `omega_call` (`omega_memory`, `omega_query`). Подробности — `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`.
- Dependencies: peer — `@deepseek-ai/cordis`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery` (ranges in `package.json`); Node.js not below `engines.node`; at runtime — `@deepseek-ai/dsh-tools` from the DSH installation (not declared in `peerDependencies`); an external OMEGA service with MCP tools `omega_store`, `omega_call` (`omega_memory`, `omega_query`). Details: `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`.

## Лицензия · License

MIT — поле `license` в `package.json`, текст — [LICENSE](LICENSE).

MIT — the `license` field in `package.json`; the text is in [LICENSE](LICENSE).
