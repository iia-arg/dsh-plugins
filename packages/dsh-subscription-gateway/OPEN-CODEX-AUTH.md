# OPEN: actual Codex auth/billing handle

Решение Забавы 17.10 17:15:51Z требует измерить ВСЕ предусловия file-auth.
Прежняя положительная атрибуция по одной стабильной ссылке снята. Кандидат
пишет authLinkTargetAtStart как route-not-applied-source, а Codex subscription
и authEpoch оставляет null с AUTH_SOURCE_UNPROVEN:<condition>. Три снимка ссылки
и проверка env/actual spawn argv сохранены. Положительный slot3 остаётся OPEN.

В точном upstream rust-v0.162.1 default CLI store=file: config/src/types.rs:133–145,
config/defaults.toml:6. core/src/config/mod.rs:4357–4364 выбирает ЛОКАЛЬНЫЙ
required store раньше cfg/default. Cloud REQUIREMENTS не могут задать этот ключ:
config/src/requirements_layers/layer.rs:13–18,104–105,277–283 удаляет local-only
auth поля. Прежнее утверждение «cloud requirements меняют store» отозвано.

Cloud CONFIG — другой слой. cloud_config_layers.rs:89–121 и state.rs:530–538
передают/сливают config без этого фильтра, loader/mod.rs:250–340 ставит cloud
config между system и user. Поэтому cloud config может заменить default=file
при незаданном user-key; явный user file перекрывает cloud CONFIG store.
Но local requirements всё ещё могут задать store, а cloud REQUIREMENTS могут
выбрать model_provider/model_providers: config_requirements.rs:1031–1043,
model_provider_requirements.rs:9–45, core/config/mod.rs:3831–3840. Required
provider выигрывает local selection и может использовать свой auth source.
Таким образом explicit file не доказывает effective provider.

app-server/src/lib.rs:549–586 создаёт bootstrap_auth, ставит cloud loader,
повторно загружает config и создаёт второй AuthManager. cloud-config/service.rs:198–224
допускает identity-matched cache либо backend; отсутствие cache не исключает
backend. Полный effective store/provider не измерен разрешёнными в этом такте
входами. Это чтение публичного source-тега, не аттестация установленного binary
или live auth. Конкретное применение cloud policy на sadik не установлено.

manager.rs:1489–1505 — CODEX_API_KEY только при enable_codex_api_key_env=true;
app-server явно передаёт false. manager.rs:1508–1534 — ephemeral store;
1537–1560 — CODEX_ACCESS_TOKEN; 1566–1577 — persistent store. OPENAI_API_KEY
имеет helper, но не является той же первой веткой load_auth. Workload provider
и произвольный env_key/custom bearer лежат в других ветках. Default=file
подтверждён; отсутствие альтернативного effective источника — не установлено.

Разрешёнными в этом такте readlink/env/argv входами полного proof не получено.
Счётчик не вводит force-file, vendor/auth RPC, proxy или credential reads.
Приёмщик получает кандидат безопасного отказа и явный незакрытый положительный
сценарий; полный счёт по Codex-подпискам этим не объявляется.

Проверены контракты0.162.1:

1. Current auth.json symlink/stat — конфигурация сейчас, не загруженный handle.
2. account/read — cached account class/email/plan без storage/account ID/epoch. config/read заново разрешает конфигурацию: с cwd возможны другие project layers, без cwd используется cwd процесса при startup; состав слоёв зависит от конкретного пути загрузки. Это не runtime_config кешированного AuthManager. Fresh process+file metadata недостаточны.
3. Workload markers OPENAI_FEDERATION_RULE_ID и OPENAI_IDENTITY_TOKEN_FILE переопределяют file; public account type может остаться chatgpt. Значимо и пустое значение.
4. getAuthStatus без includeToken не даёт нужной identity; с ним экспортирует секрет. refreshToken=false всё равно может вызвать auth(), reload и proactive refresh. Этот путь не выбран.
5. account/rateLimits/read имеет accountId, но вызывает auth()/HTTP usage и может менять auth. Его accountId сам по себе не доказывает epoch каждого модельного вызова. Такой RPC не добавлен в счётчик.
6. Raw TokenUsageRecord содержит thread/turn/session/rootTurn/response IDs и usage, но не actual billing handle. ResponseUsageMetadata — opaque Value без стабильного account schema; догадка по нему не принимается.
7. SessionMeta creator_user_id/creator_account_id ЕСТЬ. Они фиксируют аккаунт при создании нити и не обновляются на resume. Это не источник нового auth epoch.

Область проверки: schema установленного default gateway binary0.162.1, собственное чтение кода и независимый review точного upstream openai/codex rust-v0.162.1. Это не утверждение, что никакого пути вообще нет. Primary source: https://github.com/openai/codex/tree/rust-v0.162.1/codex-rs — login/src/auth; app-server/src/lib.rs; app-server/src/request_processors/account_processor.rs и account_processor/workspace_routing.rs; app-server/src/config_manager_service.rs; core/src/thread_manager.rs; protocol/src/protocol.rs и response_usage.rs. Source/schema hashes — в task evidence. Ранний GREEN-AUTH относился к неверной посылке и не является приёмкой.

Для более общего actual-runtime/billing источника остаётся отдельный контракт: actual runtime/transport producer пишет request/engine process/thread/turn/response → непрозрачный auth/billing handle и epoch по ПРИМЕНЁННОМУ handle. Не по argv модели, current symlink или creator ID. Привязку handle→slot3/4 принимает auth-сторона; неоднозначность/смена без доказательства дают UNBOUND. В journal/public запрещены credential, его hash, email и account ID; public получает только slot/opaque epoch. Отказ источника не останавливает работу модели.

Новые auth proxy, принудительный file mode и диагностические нити ради счётчика не вводились: они меняют исполнение/авторизацию и требуют отдельного решения. В этом кандидате есть raw sensor и три наблюдения маршрута ссылки. Положительный actual-auth/billing стык остаётся открытым. AP normalizer при null auth обязан выдавать incomplete, не относить маршрут к подписке.
