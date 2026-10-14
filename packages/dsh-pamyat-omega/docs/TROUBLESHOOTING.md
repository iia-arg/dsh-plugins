# Диагностика · Troubleshooting

| Признак · Symptom | Причина и проверка · Cause and evidence | Действие · Action |
|---|---|---|
| OMEGA_ADRES_BEZ_SLESHA | Endpoint без `/` · Endpoint lacks `/` | Исправить адрес, не принимать redirect за empty-store · Fix endpoint; a redirect is not an empty store |
| OMEGA_KLYUCH_PUST | Env-имя есть, значение не дошло · Named env variable missing/empty | Проверить секретное окружение процесса без печати значения · Check secret provisioning without printing the value |
| 401/403 | Bearer не передан/не принят · Bearer absent/rejected | Проверить сторону сервера и роль, не отключать auth · Check server role/config, retain auth |
| `dostupna=true`, вызов падает · Available but calls fail | Метод проверяет настройку, не сеть · Configuration check, not network health | Читать udalos/pochemu конкретного вызова · Inspect actual call result |
| `moglo-dojti-bez-id` | Запись могла завершиться до обрыва · Write may precede failure | Ручная сверка, не второй blind store · Reconcile; do not blindly store again |
| `moglo-dojti-id-est` | ID есть, read-back не подтвердил · ID known, read inconclusive | Вызвать proverit по полному ID/образцу · Read-back with full ID/sample |
| Source чужой/не разобран · Wrong/unparsed Source | Разметка, склейка, усечение · Formatting/merge/truncation | Проверить реальный ответ без секретов, согласовать парсер · Inspect actual sanitized reply and align parser |
| Доставлено, локального доверия нет · Delivered but no local trust | sozdana=false/null, нет svyaz · Creation false/unknown, no local link | Не считать delivery созданием новой записи · Do not equate delivery with new creation |
| Авто ничего не подало · No automatic injection | avto=false, короткий вход, нет доверия, уже показано · Disabled/short/unlinked/already shown | Читать счётчики отсева по причине · Read rejection counts by reason |
| Инструмент не у модели · Tool absent from model | Registry зарегистрировал, bridge не выставил · Registered but not exposed by bridge | Сверить descriptor/wire header и scope · Inspect descriptor/header and scope |
| `keyword-only mode` | Root constraint не гарантирован · Root constraint not guaranteed | Исправить режим внешнего поиска; не показывать результат · Repair external retrieval mode; refuse results |
| Публичная сессия получает память · Public session receives memory | Метод исключения отсутствует/префикс не совпал · Missing exclusion method/prefix mismatch | Проверить ядро и все consumer hooks до включения источника · Verify core and consumer hooks before source admission |

Проверь версию manifest и код, реально загруженный процессом. Смена файла не перезапускает уже созданное замыкание соединения; значение env считывается при создании связи. Без согласованной перезагрузки нельзя объявлять новый адрес/ключ действующим.

Check the manifest version and code actually loaded by the process. Replacing a file does not refresh an existing connection closure; env is read when the connection is built. A new endpoint/key is not active until a controlled reload applies it.

В отчёт включай полный id записи и форму Source только после проверки на приватные данные. Не копируй bearer-значение, весь env или приватную запись. Зафиксируй способ, scope и время проверки, а неизвестный результат оставь неизвестным.

Include a full record ID and Source shape only after checking for private data. Do not copy a bearer value, entire env, or private record. Record method, scope, and time, and retain inconclusive results as inconclusive.

## PAMYAT_POLITIKA_NEDOSTUPNA

Метод исключения ядра отсутствует либо служба недоступна: память не читается/не подаётся; omega также не отправляет новые записи. Проверить поднятое ядро и его sessiyaIsklyuchena. Восстановление метода разрешает повторный вызов без снятия защиты.

The core exclusion method or service is unavailable: memory is neither read nor delivered; omega also refuses new writes. Check the loaded core and its sessiyaIsklyuchena. Restoring the method permits another call without disabling protection.

Предел запрета: новая запись, автоматическая/ручная/прямая выдача и aktivnye. proverit проверяет доставку ранее известного id и может читать его без политики; он не создаёт запись и не подаёт память агенту.

Scope: new writes, automatic/manual/direct retrieval and aktivnye. proverit may read an already known id to verify earlier delivery without policy; it neither creates a record nor delivers memory to the agent.
