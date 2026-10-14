# Юнит службы · Service unit

Юнит ниже содержит короткие RU/EN-комментарии. Четыре drop-in отдельно задают ключ, bge-m3/1024, offline и запрет телеметрии. Перед монтажом проверьте их вместе через установочный checker.

The unit below has short RU/EN comments. Four drop-ins separately set the key, bge-m3/1024, offline mode and disabled telemetry. Run the install checker against the complete set before deploying.

```ini
[Unit]
Description=OMEGA memory server (omega-memory core)
After=network-online.target
Wants=network-online.target

[Service]
# RU: База и ключ доступны только владельцу; агенты используют MCP.
# EN: Database and key are owner-only; agents use MCP.
Type=simple
User=omega
Group=omega
SupplementaryGroups=omega-users
WorkingDirectory=/var/lib/omega
Environment=HOME=/var/lib/omega
Environment=OMEGA_TRANSPORT=http
Environment=OMEGA_IDLE_TIMEOUT=0
Environment="OMEGA_DEDUP_THRESHOLDS={\"lesson_learned\":0.93,\"decision\":0.93,\"memory\":0.92}"
# RU: Новые каталоги и служебные файлы закрыты от группы и прочих.
# EN: New directories and auxiliary files are private to the service account.
UMask=0077
ExecStart=/opt/omega/venv/bin/python3 -m omega.server.mcp_server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

UMask=0077 закрывает новые файлы и каталоги для группы и прочих. HOME допускает 2750, .omega — 700; оба каталога без записи группе. Существующие права маска не исправляет: checker отказывает, монтажная рука согласует исправление отдельно. Группа omega-users не открывает базу, ключ или служебные файлы с 600/700.

UMask=0077 keeps newly created files/directories private. HOME may be 2750 and .omega 700; neither is group-writable. The mask does not repair existing modes: the checker refuses and the operator separately agrees on repairs. omega-users does not grant access to owner-only database, key or auxiliary files.

Нет ExecStartPost, ожидания health или chmod базы. Restart=on-failure повторяет ошибочный старт через 5 с; при обычных лимитах systemd это может продолжаться бесконечно. Качество модели, доступ по MCP и сохранность базы принимаются отдельно по README/GUARDS.

There is no ExecStartPost, readiness wait or database chmod. Restart=on-failure retries failed starts after 5s; ordinary systemd rate limits may allow this indefinitely. Model quality, MCP access and DB integrity require the separate README/GUARDS acceptance checks.
