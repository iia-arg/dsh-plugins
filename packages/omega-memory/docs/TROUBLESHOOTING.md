# Частые поломки omega-memory · omega-memory troubleshooting

Каждый случай: признак → причина → лечение. Почти все взяты из нашего опыта; поведение движка может отличаться в вашей версии — там, где мы это знаем, сказано.

Each case: symptom → cause → fix. Almost all come from our own experience; engine behaviour may differ in your version — where we know that, it is said.

## Поиск деградировал / doctor видит другую модель · Search degraded / doctor sees a different model

Признак: файл есть или setup прошёл, а поиск не находит перефразированную запись. Причина: setup скачал bge-small384 или bundle bge-m3 неполный/не там. Лечение: полный ONNX-каталог по README3 в пути embedding.conf, затем круг omega_store→omega_query с тем же entity_id и другими словами. doctor1.5.20 смотрит bge-small даже при параметрах bge-m3: его результат не относится к этой модели. Не принимать ответ health или размер1024 как доказательство отсутствия hash fallback.

Symptom: files/setup look present but other-words search fails. Cause: setup fetched bge-small384 or the bge-m3 bundle is incomplete/wrongly located. Fix: fetch the complete README3 ONNX bundle at the embedding.conf path, then omega_store→omega_query with the same entity_id and different wording. doctor1.5.20 examines bge-small even with bge-m3 settings; its result does not describe this model. Neither health nor dimension1024 rules out hash fallback.

## Нет файла ключа · Missing key file

Признак: Failed to load environment files, либо checker называет обязательный EnvironmentFile. Причина: /etc/omega/mcp-klyuch.env не создан. Лечение: root создаёт его по README4 с0600 без вывода значения и без argv; не ставить «-» перед именем ради обхода. Затем повторить checker. Если файл есть, но401 остаётся — сверить передачу OMEGA_MCP_API_KEY в окружение агента, не показывая значение.

Symptom: Failed to load environment files or the checker names a mandatory EnvironmentFile. Cause: /etc/omega/mcp-klyuch.env was not created. Fix: root follows README4 to create it with0600, keeping values out of argv/output; do not prefix the name with '-' to bypass the failure. Repeat the checker. If401 persists, check agent environment delivery without revealing the value.

## Размерность базы не совпала · Database dimension mismatch

Признак: открытие memories_vec отказывает при переходе384↔1024. Причина: модель изменили, таблица хранит прежний размер. Лечение: вернуть прежнюю модель/конфигурацию; миграцию планировать отдельно со страховкой и пробой на копии. Базу не удалять и автоматически не пересоздавать.

Symptom: memories_vec fails to open after a384↔1024 change. Cause: model changed while the table keeps the previous dimension. Fix: restore the old model/configuration; plan migration separately with a backup and copy test. Never delete or automatically recreate the DB.

## Строка подключена, а инструментов у агента нет · Row is mounted, agent has no tools

**Признак.** Набор собирается без ошибок, плагин числится подключённым, у агента нет инструментов памяти. **Причина.** Строка MCP-клиента лежит в слое профиля, а не в наборе агента; в профиле `web` инструменты общего плана выключены намеренно, набор приходит из `agent.cordis.yml`. **Лечение.** Перенести строку в набор агента и создать новую сессию.

**Symptom.** The preset composes without errors, the plugin is listed as mounted, the agent has no memory tools. **Cause.** The MCP client row sits in the profile layer, not in the agent preset; in the `web` profile common-plane tools are disabled on purpose and the toolset comes from `agent.cordis.yml`. **Fix.** Move the row into the agent preset and create a new session.

## Правка набора не подействовала · Preset edit had no effect

**Признак.** Строку добавили или поправили, а в текущей сессии ничего не изменилось. **Причина.** Набор читается при создании сессии. **Лечение.** Создать новую сессию; проверять в ней.

**Symptom.** The row was added or edited, but nothing changed in the current session. **Cause.** The preset is read when a session is created. **Fix.** Create a new session and check there.

## Агент с внешним движком не видит памяти · Agent with an external engine sees no memory

**Признак.** Строка в наборе агента правильная, сессия новая, а агент инструментов памяти не видит. **Причина.** Рассуждает и вызывает инструменты внешний движок; агент видит только его набор инструментов, и MCP-клиент платформы ему ничего не даёт. **Лечение.** Подключить сервер памяти (`http://127.0.0.1:8377/mcp`) к MCP-клиенту самого внешнего движка — его способом настройки.

**Symptom.** The preset row is correct, the session is new, yet the agent sees no memory tools. **Cause.** An external engine does the reasoning and runs the tools; the agent sees only that engine's toolset, and the harness MCP client gives it nothing. **Fix.** Attach the memory server (`http://127.0.0.1:8377/mcp`) to the external engine's own MCP client, configured its way.

## 401 unauthorized на `/mcp` · 401 unauthorized on `/mcp`

**Признак.** `/health` отвечает 200, а вызовы инструментов падают, `/mcp` отвечает 401 с текстом про `Authorization: Bearer`; при `failOnStartupError: false` агент просто остаётся без инструментов. **Причина.** Версия движка требует ключ доступа, а строка MCP-клиента его не передаёт. **Лечение.** Добавить в строку `config.headers` с заголовком из `process.env.OMEGA_MCP_API_KEY` по примеру SETTINGS (см. [SETTINGS.md](SETTINGS.md)); ключ — в `$HOME/.omega/mcp_api_key` служебной учётки или в переменной движка `OMEGA_MCP_API_KEY`. Значение ключа не показывать и в командную строку не передавать.

**Symptom.** `/health` returns 200, tool calls fail, `/mcp` returns 401 mentioning `Authorization: Bearer`; with `failOnStartupError: false` the agent simply has no tools. **Cause.** The engine version requires an access key and the MCP client row does not send it. **Fix.** Add `config.headers` with the SETTINGS header from `process.env.OMEGA_MCP_API_KEY` to the row (see [SETTINGS.md](SETTINGS.md)); the key is in the service account's `$HOME/.omega/mcp_api_key` or in the engine variable `OMEGA_MCP_API_KEY`. Never print the key or pass it on a command line.

## Второй агент не достаёт до памяти · The second agent cannot reach memory

**Признак.** Служба работает, `/health` отвечает, у одного агента память есть, у другого — нет или «пустая». **Причина.** Служба запущена под учёткой первого агента: база в его домашнем каталоге с `700`. **Лечение.** Завести служебную учётку `omega`, перенести данные в `/var/lib/omega`, запустить службу под ней (юнит пакета); проверка — `systemctl show omega-memory -p User`.

**Symptom.** The service runs, `/health` answers, one agent has memory, another has none or an "empty" one. **Cause.** The service runs under the first agent's account: the database sits in its home with `700`. **Fix.** Create the `omega` service account, move the data to `/var/lib/omega`, run the service under it (the package unit); check with `systemctl show omega-memory -p User`.

## `chmod` на базу откатывается · `chmod` on the database reverts

**Признак.** Права файла базы, выставленные в юните или руками, через какое-то время снова закрыты для группы `omega-users`, хотя в юните `UMask=0077`. **Причина.** Движок ужесточает права файла при новых соединениях, а не только при старте; маска лишь убирает биты и не открывает файл, созданный с явными `600`. **Лечение.** Не бороться: агенты ходят в память по сети, файл читает только служба; служебные файлы с0077 также доступны только владельцу. Если нужен файловый доступ для отладки — от учётки `omega`.

**Symptom.** Database file modes set in the unit or by hand are closed to the `omega-users` group again after a while, even though the unit has `UMask=0077`. **Cause.** The engine tightens the file mode on new connections, not only at start; a mask only removes bits and does not open a file created with an explicit `600`. **Fix.** Do not fight it: agents use memory over the network, only the service reads the file; auxiliary files created under0077 are owner-only too. For debugging file access, use the `omega` account.

## Служба не стартует: `216/GROUP` · Service fails to start: `216/GROUP`

**Признак.** `systemctl status omega-memory` → `status=216/GROUP`, перезапуски каждые 5 секунд. В журнале службы: `Failed to determine supplementary groups: No such process`. **Причина.** Нет группы из `SupplementaryGroups=` (`omega-users`) или из `Group=` (`omega`). Systemd отказывает до любого `ExecStartPre=`, даже с `+`, — внутри юнита понятнее не сказать. **Лечение.** `sh bin/proverit-ustanovku.sh` назовёт недостающую группу; `sudo groupadd --system omega-users`; для основной группы `omega` — шаг1 создания учётки, не создавать её раньше useradd, затем `sudo systemctl restart omega-memory`.

**Symptom.** `systemctl status omega-memory` → `status=216/GROUP`, restarts every 5 seconds. The service journal says `Failed to determine supplementary groups: No such process`. **Cause.** The group from `SupplementaryGroups=` (`omega-users`) or from `Group=` (`omega`) does not exist. Systemd refuses before any `ExecStartPre=`, even with `+` — the unit cannot say it more clearly. **Fix.** `sh bin/proverit-ustanovku.sh` names the missing group; `sudo groupadd --system omega-users`; for the primary `omega` group follow account-creation step1 rather than creating its group before useradd, then `sudo systemctl restart omega-memory`.

## Группа не открывает приватные файлы · Group does not open private files

С UMask=0077 приватность служебных файлов ожидаема: агенты работают через MCP. Не открывать .omega на запись группе ради отладки; отладку выполняет учётка omega. Права существующего HOME/.omega, отвергнутые checker, меняет монтажная рука отдельной согласованной правкой.

UMask=0077 intentionally keeps auxiliary files private: agents use MCP. Do not make .omega group-writable for debugging; use the omega account. Existing HOME/.omega modes rejected by the checker require a separate operator-approved repair.

## Запись «не сохранилась», вернулся старый id · Store "did not save", an old id came back

**Признак.** Запись вернула `Deduped → <id>`, и это id более старой записи. **Причина.** Склейка повторов: новая запись того же типа и области почти дословно повторяет прежнюю (сходство по Жаккару на словах выше порога `OMEGA_DEDUP_THRESHOLDS` или умолчания движка). **Лечение.** Если это действительно новое знание — переформулировать или дополнить запись; если склейка срабатывает слишком часто для типа — поднять его порог в юните и перезапустить службу.

**Symptom.** A store returned `Deduped → <id>`, the id of an older record. **Cause.** Repeat collapsing: the new record of the same type and scope nearly repeats an earlier one (Jaccard similarity over words above the `OMEGA_DEDUP_THRESHOLDS` threshold or the engine default). **Fix.** If it is truly new knowledge, rephrase or extend the record; if collapsing fires too often for a type, raise its threshold in the unit and restart the service.

## `--dry-run` изменил систему · `--dry-run` changed the system

**Признак.** После `omega setup --dry-run` появились модель, каталоги и хуки. **Причина.** В версии движка, на которой мы попались, `--dry-run` у setup не был сухим. **Лечение.** Не полагаться на `--dry-run` без проверки на своей версии; пробовать на копии или под отдельной учёткой. Хуки ставятся для той учётки, от которой запущена команда, — проверьте её настройки клиента.

**Symptom.** After `omega setup --dry-run`, a model, directories and hooks appeared. **Cause.** In the engine version that bit us, setup's `--dry-run` was not dry. **Fix.** Do not rely on `--dry-run` without checking on your version; try on a copy or under a separate account. Hooks are installed for the account that ran the command — check its client settings.

## `/health` отвечает, а памяти нет · `/health` answers, memory does not work

**Признак.** `curl …/health` даёт `{"status":"ok",…}`, а агент память не находит. **Причина.** `/health` доказывает только, что процесс жив: он отвечает без ключа и не трогает ни модель, ни базу, ни строку набора. **Лечение.** Принимать по кругу «запись → поиск другими словами» из инструментов агента; разбирать по разделам выше.

**Symptom.** `curl …/health` returns `{"status":"ok",…}`, yet the agent cannot find memory. **Cause.** `/health` only proves a process is alive: it answers without the key and touches neither the model, nor the database, nor the preset row. **Fix.** Accept by the "store → search in other words" round trip from agent tools; diagnose with the sections above.

## Служба остановилась и не поднялась · Service stopped and did not come back

**Признак.** `systemctl is-active` → `inactive`, в журнале нет ошибки, перезапуска не было. **Причина.** Процесс вышел чисто, с кодом 0; `Restart=on-failure` такой выход не перезапускает. В проверенной версии движка так выходит его сторож памяти (в журнале строка про превышение RSS-лимита). **Лечение.** `sudo systemctl start omega-memory`; найти причину в `journalctl -u omega-memory`. Если такие выходы повторяются, решение о `Restart=always` (через drop-in) или о лимите `OMEGA_RSS_LIMIT_MB` — за вами; пакет его не принимает.

**Symptom.** `systemctl is-active` → `inactive`, no error in the journal, no restart happened. **Cause.** The process exited cleanly with code 0; `Restart=on-failure` does not restart such an exit. In the engine version we checked, its memory watchdog exits that way (the journal has a line about the RSS limit being exceeded). **Fix.** `sudo systemctl start omega-memory`; find the cause in `journalctl -u omega-memory`. If such exits recur, choosing `Restart=always` (via a drop-in) or an `OMEGA_RSS_LIMIT_MB` limit is up to you; the package does not make that choice.

## Порт занят · Port already in use

**Признак.** Служба падает при старте и перезапускается каждые 5 секунд; в журнале — что адрес занят и, возможно, работает другой демон OMEGA. **Причина.** На `127.0.0.1:8377` уже слушает другой процесс — например, движок, запущенный клиентом агента в своём режиме, или вторая копия службы. **Лечение.** `ss -tlnp | grep 8377` — найти владельца порта; убрать лишний процесс или сменить порт движка и `url` у всех агентов.

**Symptom.** The service fails at start and restarts every 5 seconds; the journal says the address is in use and another OMEGA daemon may be running. **Cause.** Another process already listens on `127.0.0.1:8377` — for example an engine started by an agent client in its own mode, or a second copy of the service. **Fix.** `ss -tlnp | grep 8377` — find the port owner; remove the extra process or change the engine port and every agent's `url`.

## Все записи в одной куче · All records in one pile

**Признак.** Поиск одного агента выдаёт записи всех остальных вперемешку. **Причина.** Агенты не передают `entity_id`, или передают один и тот же. **Лечение.** Дать каждому агенту свой корень и вписать его в описание личности: «твой корень — X, передавай его при каждой записи и каждом поиске». Помнить: корень — раскладка, не граница доступа.

**Symptom.** One agent's search returns everyone's records mixed together. **Cause.** Agents do not pass `entity_id`, or all pass the same one. **Fix.** Give each agent its own root and write it into the persona: "your root is X, pass it on every store and every search". Remember: a root is filing, not an access boundary.
