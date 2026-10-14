# Состав dsh-socseti3.1.1

Версия — package.json и две корневые version записи lockfile; startup/MCP initialize читают manifest. Прыжок1.3.3→3.1.1 назначен очередью аудита и сохраняет код B-N-2027. Номер исторического такта не заменяет версию установленного пакета.

Один исходный пакет предназначен для независимых /opt/socseti и /opt/socseti-anna. Это не утверждение, что текущие установки уже равны кандидату: автор не монтировал. Runtime зависит от node_modules, которого в npm/git-архиве нет. Его собирают npm ci --ignore-scripts по lockfile на копии, проверяют npm test и монтируют подготовленным составом; на бою npm не запускают. Узлы сохраняют свои ключи/настройку/БД. Раздел vk.writer Анны не добавляется.

Node24+,npm/Python3 для стендов и sudo -n для root-настройки фикстур. Шаблон Варвары требует /usr/local/bin/node и /opt/nodejs bind; шаблон Анны — собственная учётка и Type=simple. Проверка unit не является запуском/READY-приёмкой. Ключи, SQLite/WAL, клиентские env и настоящие config не входят в архив. Examples не являются боевой настройкой.

Передаваемый source.tar.gz сохраняет весь Git-состав, включая lockfile и .gitignore. npm tarball исключает эти два файла; он дополнительный формат для npm, а не самостоятельное основание воспроизводимой runtime-сборки.

## Полный перечень исходника

Таблица перечисляет каждый файл пакета; test,docs и deployment — исходные средства проверки/монтажа, не обязательные исполняемые места службы. Прежние недостающие poll-fixture и poll-recovery включены. Режимы Git означают только execute-bit; реальные владельцы/режимы назначает монтажная рука. Типичный runtime-code — root:root0644, каталоги0755; config/keys/state имеют отдельный приватный договор из INSTALL/REFERENCE.

| файл | читатель/исполнитель |
|---|---|
| `.gitignore` | состав исходника/пример, не секреты боя |
| `CHANGELOG.md` | человек/агент; документация |
| `CONTRACT.md` | человек/агент; документация |
| `INSTALL.md` | человек/агент; документация |
| `LICENSE` | состав исходника/пример, не секреты боя |
| `PAKET.md` | человек/агент; документация |
| `PILOT.md` | человек/агент; документация |
| `README.en.md` | человек/агент; документация |
| `README.md` | человек/агент; документация |
| `REFERENCE.md` | человек/агент; документация |
| `VK-REPLIES.md` | человек/агент; документация |
| `anna-vk.config.example.json` | состав исходника/пример, не секреты боя |
| `config.example.json` | состав исходника/пример, не секреты боя |
| `deployment/provision-keys.py` | назначенная рука; provisioning вне модели |
| `docs/ANNA-NOTICES.md` | человек/агент; документация |
| `docs/ANNA-VK-FIRST.md` | человек/агент; документация |
| `docs/ANNA-VK-TEXT-POSTS.md` | человек/агент; документация |
| `etc/socseti/approvers.json.example` | пример настройки, не список/файл боя |
| `package-lock.json` | npm/manifest/версия |
| `package.json` | npm/manifest/версия |
| `src/auth.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/config.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/contract.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/main.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/server.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/store.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/telegram-api.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/telegram-notices.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/telegram-queue.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/telegram-worker.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/vk-api.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/vk-post-writer.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/vk-receiver.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/vk-reply-writer.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `src/vk-two-readers-probe.mjs` | main/модуль приложения; собственные копии в обоих runtime |
| `systemd/socseti-anna.service` | назначенная рука и systemd; путь установки по её проверенному unit |
| `systemd/socseti.service` | назначенная рука и systemd; путь установки по её проверенному unit |
| `systemd/socseti.service.d/10-node-seti.conf` | назначенная рука и systemd; путь установки по её проверенному unit |
| `systemd/socseti.sysusers` | назначенная рука и systemd; путь установки по её проверенному unit |
| `test/fixtures/README.md` | история и сумма закреплённой фикстуры |
| `test/fixtures/telegram-queue-r1.mjs` | только миграционный стенд, в main не импортируется |
| `test/anna-approval-policy.test.mjs` | npm test; подставные источники |
| `test/anna-channel-http.test.mjs` | npm test; подставные источники |
| `test/anna-config-worker.test.mjs` | npm test; подставные источники |
| `test/anna-hourly.test.mjs` | npm test; подставные источники |
| `test/anna-ingress.test.mjs` | npm test; подставные источники |
| `test/anna-notices.test.mjs` | npm test; подставные источники |
| `test/anna-tg-recovery.test.mjs` | npm test; подставные источники |
| `test/anna-tg-roundtrip.test.mjs` | npm test; подставные источники |
| `test/approval-fixture.mjs` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/approvers-settings.test.mjs` | npm test; подставные источники |
| `test/audit-15.test.mjs` | npm test; подставные источники |
| `test/auth.test.mjs` | npm test; подставные источники |
| `test/concurrency-worker.mjs` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/config.test.mjs` | npm test; подставные источники |
| `test/contract.test.mjs` | npm test; подставные источники |
| `test/daemon-telegram.test.mjs` | npm test; подставные источники |
| `test/daemon.test.mjs` | npm test; подставные источники |
| `test/live-pilot.mjs` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/poll-fixture.mjs` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/preflight-halted.test.mjs` | npm test; подставные источники |
| `test/server.test.mjs` | npm test; подставные источники |
| `test/stage2-quota.test.mjs` | npm test; подставные источники |
| `test/stend-b2023-social.py` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/store.test.mjs` | npm test; подставные источники |
| `test/telegram-api.test.mjs` | npm test; подставные источники |
| `test/telegram-poll-recovery.test.mjs` | npm test; подставные источники |
| `test/telegram-queue.test.mjs` | npm test; подставные источники |
| `test/telegram-race-worker.mjs` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/telegram-worker.test.mjs` | npm test; подставные источники |
| `test/vk-api.test.mjs` | npm test; подставные источники |
| `test/vk-backfill-diagnostics.test.mjs` | npm test; подставные источники |
| `test/vk-main.test.mjs` | npm test; подставные источники |
| `test/vk-post-crash-worker.mjs` | помощник тестов или явно ручной пилот; см. README/REFERENCE |
| `test/vk-post-main.test.mjs` | npm test; подставные источники |
| `test/vk-post-writer.test.mjs` | npm test; подставные источники |
| `test/vk-receiver.test.mjs` | npm test; подставные источники |
| `test/vk-reply-main.test.mjs` | npm test; подставные источники |
| `test/vk-reply-writer.test.mjs` | npm test; подставные источники |
| `test/vk-two-readers-probe.test.mjs` | npm test; подставные источники |

## Проверяемый признак поставки

Имена, байты и execute-bit архива/установленной копии совпадают с принятой головой; зависимости совпадают с закреплённым lock. Новый пакет не содержит действующих ключей/config/БД и не включает писатель. При монтаже суммы всех мест и версия живого PID/MCP сверяются отдельно, учёт/ref обновляет назначенная рука. Старые машинные пути/статусы служб не выдаются за сегодняшний замер.

Внешний socseti-watch поставляется другим пакетом: monorepo-тест находит его соседом, standalone-архив пропускает только соответствующие именованные подпробы. Собственные worker проверки выполняются в обоих случаях. Полный живой пилот и реальная доставка не входят в npm test.

Миграционные пробы прежней очереди используют закреплённую SHA-фикстуру test/fixtures/telegram-queue-r1.mjs, без git show. Межпакетные проверки канала Анны требуют соседнего dsh-telegram-multiagent; в самостоятельном архиве они дают именованные пропуски. Проверка восстановления владельца самого worker выполняется и без этого соседа.
