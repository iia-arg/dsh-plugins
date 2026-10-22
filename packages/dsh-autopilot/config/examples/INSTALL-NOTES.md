# E01–E05: ручная настройка после install.sh

Образцы для dsh-autopilot 0.1.16 сняты со структуры работающих настроек; адреса, UID, имена участников и Telegram ID заменены заглушками. Значений секретов здесь нет. Это дополнение к [установщику](../../install.sh), а не готовый installer сервера. Код пакета не меняется; ограничения фиксированных имён перечислены в [FIXED-NAMES.md](FIXED-NAMES.md).

**До install.sh:** создай непривилегированную Unix-учётку `master` (UID >0), не включай её в `autopilot-view`. Установщик проверяет её через `lib/public_tree.py:54–66` и без неё откажет. Остальные шаги ниже дополняют уже установленную AP-полку.

## Сначала заполни заглушки

| Образец | Куда положить заполненный результат | Владелец, режим |
|---|---|---|
| E01 `source-profile.json.in` | `/var/lib/autopilot-usage/source-profile.json` | root:root, 0600 |
| E02 `tg-autopilot.fragment.json.in` | Поля config плагина TG в профиле **каждого** агента; это не целый cordis-файл | По правилам приватного профиля агента; сохранять его владельца/режим |
| E03 `copy.json.in` | `/etc/autopilot-mail/copy.json` | root:root, 0644 |
| E04 `retention.json.in` | `/etc/autopilot-mail/retention.json` | root:root, 0644 |
| E05 `spool-acl.conf.in` | `/etc/tmpfiles.d/autopilot-mail-spool-acl.conf` | root:root, 0644 |

Файлы `.in` — шаблоны. Строки `__...__` надо заменить, а расширение `.in` снять только у заполненного результата. Не устанавливай шаблоны поверх рабочих файлов. JSON не поддерживает комментарии, поэтому пояснения находятся здесь.

- `__OPERATOR_UNIX__` → `master`; `__WORKER_1_UNIX__` → `vintik`; `__WORKER_2_UNIX__` → `shpuntik`; `__WORKER_3_UNIX__` → `gayka`; `__REVIEWER_UNIX__` → `sova`; `__WORKER_4_UNIX__` → `shurup`; `__WORKER_5_UNIX__` → `tumbler`. **Это обязательные имена текущего кода**, а не свободный выбор пользователя. Заглушки показывают роль, но не устраняют это ограничение.
- `__MEMBER_UNIX__` — одно из этих имён; `__POSTMAN_UNIX__` — `autopilot-post`. Создай семь разных непривилегированных UID. Их значения возьми через `id -u`, не копируй с чужого хоста.
- Значения `__..._INTEGER__` в JSON замени **вместе с кавычками** числом: UID >0, trafficChatId <0, publisherBotIds >0. В `copy.json` значения `__..._DECIMAL_STRING__` остаются строками десятичных цифр: chat_id отрицательный, bot_user_id положительный и свой для каждого бота. Все семь publisherBotIds TG должны совпадать с bots в copy.json.
- `__..._ABSOLUTE_PATH__` — абсолютный физический путь, без symlink и `..`. Для Codex SOURCE_HOME — настоящий CODEX_HOME, где gateway пишет `dsh-usage-hodov.jsonl`; для Claude используется соседний с `runtimeSource.raw` файл `ap-usage-hodov-v1.jsonl`. `LEDGER_ROOT` — путь до приватного каталога TG. E01 сохраняет только используемые v5 поля исходного профиля; старые G/native/ledger descriptors и отпечатки узла в образец не входят.
- `__MEMBER_DISPLAY_NAME__` / `__MEMBER_MENTION__` — собственные имя и обращение участника в рабочей Telegram-группе. Они не заменяют Unix participant. Один E02 повтори по числу агентов, с отдельным noticeDir каждого.
- BOT_TOKEN_DIRECTORY — приватный каталог, содержащий семь отдельно выданных bot token файлов. В JSON только **пути** к ним. Токены не подставляй в JSON/командную строку/репозиторий. Флаги on_send/on_receive и policy хранения взяты из исходной настройки; перед включением явно выбери нужные публикации/сроки. Порог хранения — не бюджет чтения collector.

## Почему установленный source-profile длиннее образца

У старой установки в срезе 22.10.2026 — **29 ключей против 10 в E01**. Способ счёта: четыре ключа верхнего уровня плюс все ключи **одного** participants-объекта рекурсивно, включая промежуточные объекты; элементы массива команды повторно не суммируются. У всех семи участников этого среза — по 25 вложенных ключей против шести в образце. Это описание среза, не лимит схемы.

Боевой профиль сохраняет, среди прочего, `gatewaySource`, `gatewayTransport` с `node`, `nodeSha256`, `policyCli`, `version`, а также gid/tgService/sources и прежние native/ledger descriptors. Эти дополнительные поля старого R/G-пути сборщик **0.1.16 не читает**: активный доступ к участнику ограничен name/uid/engine/home и `runtimeSource.raw` (`runtime/time_collection.py:60–83`). Поэтому отличие длины не означает неполноту E01. Пример намеренно не переносит чужие пути и отпечатки узла; работа других исторических инструментов по старому профилю этим образцом не воспроизводится.

## Порядок ручных шагов

1. Подготовь DSH и профили агентов, gateway/adapter и при необходимости bridge. Для Codex статистики нужен app-server end writer (контракт с gateway3.1.5; здесь закреплён 3.1.10), для Claude — TG3.1.15. У штатного bootstrap обязательны работающие `master.service` и `coder-gateway-master.service` под UID оператора; не переименовывай их без правки кода. Память TG — опциональный event-helper при наличии native fallback.
2. Проверь созданного до install.sh оператора, создай остальные шесть фиксированных Unix-учёток и сервисные `autopilot-post` / `autopilot-copy`. Все входят в `autopilot-mail`, сервисы — не в первичную почту; если есть `a2a-pochta`, шесть участников кроме оператора также не должны в неё входить. Требования проверяет `lib/mail_service.py:68–83`. Установщик создаёт public-группу `autopilot-view`, но оператор **не должен** состоять в ней (`lib/public_tree.py:54–70`).
3. Подготовь `/etc/autopilot-mail` root:root0755. Заполни E03/E04; каталог токенов — root:autopilot-copy0750, каждый token-файл — root:autopilot-copy0640, обычный single-link файл. TLS приготовь своим вызовом `tools/prepare-mail-tls.py` в новом приватном каталоге; установка отдельно: сертификат `/etc/autopilot-mail/server.pem` root0644, private key `/var/lib/autopilot-mail/server.key` autopilot-post0600. Почтовая state-dir — autopilot-post0700. Ключ/сертификат должны составлять пару; клиент использует тот же публичный сертификат.
4. Установи отдельную postal-раскладку по `lib/post_layout.py`; базовый install.sh её не разворачивает. В текущих `systemd/autopilot-mail.service` и notice-worker используется post/0.1.10, **copy/failure units указывают post/0.1.3**. До старта согласуй все эти пути с установленными полками и импортируемыми файлами; не включай шаблоны с отсутствующим ExecStart. `/usr/local/bin/autopilot-mail` должен указывать на wrapper установленной почты. Сокет `/run/autopilot-mail/post.sock` создаёт сервис (группа autopilot-mail,0660).
5. Установи dsh-trevogi со спулом, ACL и работающим sender path-unit. E05 добавляет только права postman и сохраняет чужие правила. После заполнения примени отдельный fragment командами ниже; это выполняет установщик вручную, не агент из этого документа:

   ```sh
   # В текущем каталоге лежит уже заполненный spool-acl.conf, без __...__.
   sudo install -o root -g root -m 0644 spool-acl.conf /etc/tmpfiles.d/autopilot-mail-spool-acl.conf
   sudo systemd-tmpfiles --create /etc/tmpfiles.d/autopilot-mail-spool-acl.conf
   sudo getfacl /var/spool/dsh-trevogi/tmp /var/spool/dsh-trevogi/vhod
   ```

   Проверь ACL `u:autopilot-post:wx`, доступный для прохода каталог `itog/` и настройки sender. Общий `/etc/tmpfiles.d/dsh-trevogi-spul-acl.conf` целиком не заменяй. Team ACL для других задач настраиваются отдельно.
6. Создай приватный notice inbox каждого участника: физический каталог владельца-агента0700, сами notices0600. Адресно объедини E02 с config существующего TG-плагина, сохрани прочие поля профиля. Настройка читается при старте; после её изменения нужен согласованный рестарт. Unit-template notice использует `/opt/%i/...`: другой home/workspace требует адаптации unit. Одного JSON-фрагмента недостаточно без DSH-профиля и сервиса агента.
7. Подготовь `/var/lib/autopilot-usage` и `registrations` root:root0755 и E01 root0600. Postman должен читать root ACK0644 и проходить через оба каталога. На **новой** установке не создавай произвольный `index.json`: при его отсутствии reader возвращает пустой индекс, а collector пишет origin-bound index/state сам (`runtime/runtime_receipt_source.py:1084–1104`). Не копируй time-state/ACK/почтовую БД чужой машины и не очищай существующую установку этим советом.
8. До первого init нужен отдельный bootstrap `/var/lib/dsh-autopilot`: `window/katalog-okno.py`, принятый root-census, реальная ограниченная ограда двух юнитов и открытое окно dsh-montazh. Его реестр должен описывать настоящие полки/профили/права твоего хоста. dsh-reestr/dsh-podyom и для copies/publication `dsh-pribory ≥3.1.2` / dsh-vypusk-watch — зависимости этого пути, не Python-импорты счётчика. Не заменяй квитанции ограды придуманным JSON. `ap-run-inventory.py bootstrap` требует rollback-ограды; forward-helper — `katalog-okno.py`.
9. Проверь public dirs, установленный skill/tool-путь и права по `lib/public_tree.py`; укажи projectRoots существующего проекта/корня проектов в E01. Поставь нужные mail/copy/notice/usage units и timers после проверки конфигурации. install.sh сам их не включает. Финальный признак: естественный init → новая очередь usage_registrations → первый штатный тик → RUN/полный roster в index/квитанции v5 → совпавший REGISTERED ACK → последующее удаление строки штатным Postman. Ручной SELECT и пустая очередь сами по себе не доказывают эту цепочку.

Это ручной план подготовки, не результат cold-install испытания. Перед запуском заполненных JSON проверь синтаксис `python3 -m json.tool <файл>` и типы/ограничения выше; эта команда не проверяет UID/права/доступность API. Шаблоны без заполнения исполняющие валидаторы обязаны отвергать.

## E06–E09 остаются за пределами образцов

- **E06:** installed-check manifest/записи реестра генерируются для реальных файлов, путей и UID целевой установки; чужой боевой manifest не копируй.
- **E07:** операторский комплект принятого окна — отдельный материал; согласуй свой порядок bootstrap/обновления и возврат, ссылка на старый комплект не делает его универсальным installer.
- **E08:** старый ручной measure-run-codex — необязательная диагностика; при необходимости используй соответствующий tool из пакета, он не входит в новый service v5.
- **E09:** внешний TLS/домен/basic-auth/reverse proxy/firewall для удалённой панели настрой своими средствами; сетевые адреса исходного сервера и его ключи не нужны для подготовки этих образцов.
