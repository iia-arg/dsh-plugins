# dsh-telegram-multiagent — канал Telegram, файловой почты A2A и чата сайта для агентов DSH с устойчивыми квитанциями

## Назначение

Модуль `dsh-telegram-multiagent` — плагин платформы DSH (`main: src/index.js`, `inject: ['agents']`). Он забирает входящие из Telegram (личные чаты, рабочие группы, гости открытого бота), из файловой почты (`<a2aDir>/in` и ящик почтальона `spoolDir`) и, если включено, из спула чата сайта; каждое сообщение он записывает в квитанцию SQLite (`<workspace>/.message-receipts/receipts.sqlite`), привязывает к поколению сессии агента, ставит в очередь DSH и отправляет ответ туда, откуда пришёл вопрос. Вход сохраняется до продвижения offset Telegram, журнал сессии сбрасывается на диск до побудки. Если исход хода неизвестен, квитанция удерживается для оператора, работа модели вслепую не повторяется.

Кто зовёт: на sadik модуль грузит процесс DSH каждого агента — `avrora`, `iskra`, `zarya`, `spartak`, `marc`, `petrovich`, `varvara`, `anna`, `alfa`, `beta`, `gamma`. Каждая служба `<агент>.service` поднимает `dsh web`, профиль объявляет модуль в своём `cordis.patch.yml`, а Node находит его по симлинку `node_modules/dsh-telegram-multiagent → /opt/agent-plugins/dsh-telegram-multiagent`. Код у всех один, агенты различаются только настройками. Отдельно от агентов работает служба `mail-stop-arrival.service` (root): наблюдатель прихода подписанных стоп-писем.

Кто читает результат: люди в Telegram (ответы, копии владельцу в режиме `owner-all`, тревоги); курьер машины-координатора (на sadik — `sadik-tell-poll` с aclaude по ssh: `out/` обычной щели — через sudo от root, гостевой щели — `sudo -u` владельца щели; щель, чей владелец root, не берётся) — забирает `<a2aDir>/out/*.txt` и переносит их в `out/polnye`; ответы по квитанции `receipt-<sha>.txt` пишутся с правами `0600`, прежние записи — по umask; `a2a-pochtalon` обслуживает ящики `/var/spool/a2a`, а не `out/`; обратные квитанции; внешний адаптер сайта — через `vyhod/` спула сайта; оператор — через квитанции и `src/receipt-admin.mjs`; отправитель стопа — через подписанный статус в своём ящике. Модель агента получает от модуля инструменты `telegram_send_file`, `telegram_make_pdf` (только при `openBot: true`) и `pismo_rukovoditelyu` (только при заданном `supervisor`), а также команды Telegram — перечень с правами ниже, в «Командах в Telegram».

Подробнее об устройстве — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); защиты и их читатели — [docs/GUARDS.md](docs/GUARDS.md); стоп и `/new` почтой — [MAIL-STOP.md](MAIL-STOP.md), [MAIL-NEW.md](MAIL-NEW.md); живой ввод посреди хода — [LIVE-INPUT.md](LIVE-INPUT.md); PDF гостям — [GUEST-PDF.md](GUEST-PDF.md).

### Команды в Telegram

Команды разбирает модуль, до модели они не доходят. Права проверяются на каждое сообщение.

| Команда | Кто может | Что делает |
|---|---|---|
| `/start`, `/help` | любой, кого бот пускает (в `openBot` — и гость) | короткая справка |
| `/stop` | человек из `allowedUsers` | прерывает текущий ход агента, сохраняя контекст, и ставит разговор на паузу; стоп почтой — [MAIL-STOP.md](MAIL-STOP.md) |
| `/new` | человек из `allowedUsers`; только при `newSessionsEnabled: true` | начинает разговор заново (новое поколение сессии) |
| `/goal <текст>` | `goalUsers` (в `openBot` — `allowedUsers`) | ставит цель агенту; из служебного канала — только подписанным письмом (см. «Ограничения») |
| `/compact` (`/ccc`), `/compact-status` (`/cs`) | человек из `allowedUsers` | команды платформы: сжатие разговора и его состояние; идут в реестр команд платформы; команды там нет — отказ |
| `/switch-a`, `/switch-b` | человек из `allowedUsers` | команда платформы, если реестр её знает; если нет — уходит модели обычным текстом (прежний путь) |
| `/sss`, `/sss_on` | только владелец (`ownerChatId`), в личном чате с ботом; при включённом `site` | закрыть / открыть приём с сайта. `/sss` записывает выключатель `site.stateFile` и прерывает разговоры сайта; копии продолжают уходить. Без `ownerChatId` сайт и `/sss` выключены |
| любая другая `/<имя>` | только владелец (`ownerChatId`) | команда из реестра платформы; нет такой — отказ «Неизвестная команда», модели не передаётся |

## Что ставится и куда

Пакет ставится в бой целым каталогом, по составу публикации (все файлы перечня `npm pack --dry-run --ignore-scripts`, `test/` и `docs/` тоже; `README.en.md` в `files` не назван, но npm кладёт `README*` в архив сам). Текущая версия — см. `package.json`/`CHANGELOG.md`.

| Файл в пакете | Путь на машине | Режим / владелец | Кто исполняет / читает |
|---|---|---|---|
| `src/index.js` и остальные модули `src/*.js`, `src/*.mjs` | `/opt/agent-plugins/dsh-telegram-multiagent/src/` | `0644 root:root`; `src/client.js` — `0755` | Node процесса DSH каждого агента (11 служб, см. «Назначение»); вход — `main` из `package.json` |
| `package.json` | `/opt/agent-plugins/dsh-telegram-multiagent/package.json` | `0644 root:root` | Node (имя и версия для строки подъёма `[dsh-telegram-multiagent <версия> · область …] подъём`); `installed_check` реестра |
| `cordis.patch.yml` | `/opt/agent-plugins/dsh-telegram-multiagent/cordis.patch.yml` | `0755 root:root` | Загрузчик DSH (`dsh.bundle.patch`). Это образец; в бою настройки берутся из профиля агента, собранного по шаблонам `/etc/agent-registry/shablony-raskladki/{sdk-claude,codex}/A.tmpl` |
| `systemd/mail-stop-arrival.service` | `/etc/systemd/system/mail-stop-arrival.service` (копия) и `…/dsh-telegram-multiagent/systemd/` | `0644 root:root` | systemd; юнит `enabled`, `User=root`, запускает `/usr/local/bin/node /opt/agent-plugins/dsh-telegram-multiagent/src/observe-mail-stop.mjs /etc/dsh-mail-stop/arrival-observer.json` (путь к node зашит в `ExecStart`: где node лежит иначе — править юнит), пишет в `/var/lib/dsh-mail-stop-arrivals` |
| `src/observe-mail-stop.mjs`, `src/mail-stop-arrival.js` | в каталоге пакета | `0644 root:root` | `mail-stop-arrival.service` (root) |
| `src/send-mail-stop.mjs` (+ `src/publish-mail-stop.py`) | в каталоге пакета | `0644 root:root` | Отправитель стопа: на sadik — Искра, `sudo node /opt/agent-plugins/dsh-telegram-multiagent/src/send-mail-stop.mjs --recipient <агент> --mode pause\|replace\|new [--body-file <файл>]`; `publish-mail-stop.py` вызывается из него через `python3` |
| `src/read-mail-stop-status.mjs` | в каталоге пакета | `0644 root:root` | Отправитель стопа: сверка подписанного статуса `node …/read-mail-stop-status.mjs <файл статуса> <control_id> <wire_sha>` |
| `src/sign-coordinator.mjs` | в каталоге пакета | `0644 root:root` | Подписант координатора: `node …/sign-coordinator.mjs REQUEST_JSON` |
| `src/receipt-admin.mjs` | в каталоге пакета | `0644 root:root` | Оператор: `status ROOT`, `approve-new\|discard\|release-text\|reject-envelope ROOT ID OPERATOR REFERENCE`, `rollback-v1 ROOT OPERATOR REFERENCE`; ROOT — `<workspace>/.message-receipts`; `status` только читает; `rollback-v1` отказывает, пока ledger открыт живым процессом; ошибка — код 2 |
| `src/pdf-calculation.py` | в каталоге пакета | `0644 root:root` | `/usr/bin/python3 -B`, запускается из `src/pdf-tool.js` (инструмент `telegram_make_pdf`); нужны `reportlab`, `pypdf`, шрифт `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, бланки из `pdfTemplatesDir` |
| `courier/iskra-tell`, `courier/coder-tell` | в каталоге пакета | `0755 root:root` | На sadik никто не вызывает: это кандидаты курьеров для aclaude (`iskra-tell` и ссылки `petrovich-/marc-/zarya-/avrora-/varvara-/anna-tell`, `coder-tell`) |

Симлинки профилей (ставятся раскладкой профилей, не этим пакетом): `/opt/{avrora,iskra,zarya,spartak,marc,varvara,anna}/.dsh/profiles/web/node_modules/dsh-telegram-multiagent`, `/opt/coders/{alfa,beta,gamma}/.dsh/profiles/web/node_modules/…` (относительная ссылка), `/opt/petrovich/.dsh/profiles/node_modules/…` → `/opt/agent-plugins/dsh-telegram-multiagent`.

Лежат в каталоге, но в работе не участвуют: `test/` (стенды, помощники, фикстуры), `docs/`, `CHANGELOG.md`, `README.md`, `README.en.md`, `GUEST-PDF.md`, `LIVE-INPUT.md`, `MAIL-NEW.md`, `MAIL-STOP.md`, `NEW-SESSIONS.md`, `OLD-PATHS.md`, `OUTGOING-FILES.md`, `OWNER-COPIES.md`, `RECEIPTS.md`.

Внешние программы, которые пакет не ставит, но зовёт по абсолютному пути:

| Программа | Кто зовёт | Без неё |
|---|---|---|
| `/usr/local/bin/a2a-send` | копии гостей `{kind:"a2a"}`, свёртки, письмо руководителю (`pismo_rukovoditelyu`), местные обратные квитанции | отказ «Local courier failed …; delivery not confirmed»: письмо не положено, ошибка остаётся у вызывающего (строка outbox или ответ инструмента) |
| `/usr/local/bin/tell-komu` | обратные квитанции на другую машину (`new-return`) | строка уходит в `HOLD` — до решения оператора |
| `/usr/local/bin/agent-alert` | тревога о недоставленных копиях сайта | тревога не уходит, остаётся строка журнала |
| `$HOME/.local/lib/dsh-coordinator-signer/prepare-coordinator.mjs` | курьер `courier/iskra-tell` при `OT=zabava` (подпись координатора) | отказ «подпись не получена; ничего не отправлено», код 2 |
| `/usr/bin/python3` (+ `reportlab`, `pypdf`) | `telegram_make_pdf` | PDF не собирается |

Что модуль создаёт сам во время работы:

| Путь | Что там |
|---|---|
| `<workspace>/.message-receipts/receipts.sqlite`, `released/`, `return-notices/` | ledger квитанций, архив прочитанного, обратные квитанции |
| `<workspace>/attachments/telegram/` (+ `index.json`) | входящие вложения, приватные каталоги |
| `<workspace>/vydacha/<chat_id>/` | единственная папка, откуда гость получает файлы |
| `<pauseStateRoot>/<агент>/pauza.json` (на sadik `/var/lib/dsh-pauza/<агент>/`) | опубликованный статус паузы; `<агент>` = имя каталога `spoolDir` |
| `<voiceTempBaseDirectory>/dsh-voice-<uid>/<хэш workspace>/` (умолчание `/var/tmp`) | временные голосовые, `0700` |
| `/var/lib/dsh-mail-stop-arrivals/*.json` | записи наблюдателя прихода стопа (служба root) |

## Установка

Пакет публикуется в npm выпуском 3.1.7 (порядок и окно — по решению владельца); до выхода ставится из дерева: у нас пакет монтируют по воротам, автор в бой не ставит. Источник — дерево `/opt/iskra/workspace/dsh-plugins/packages/dsh-telegram-multiagent`.

1. Выпуск: номер версии и заголовок в `CHANGELOG.md`, ворота `vypusk-tegom`, коммит и метка в дереве.
2. Прогон монтажа (ничего не пишет):
   `sudo smontirovat-vypusk <метка> packages/dsh-telegram-multiagent /opt/agent-plugins/dsh-telegram-multiagent --progon`
3. Монтаж по составу публикации со страховкой в `/var/backups/montazh/<пункт>/`:
   `sudo smontirovat-vypusk <метка> packages/dsh-telegram-multiagent /opt/agent-plugins/dsh-telegram-multiagent --v-boj <пункт>`
4. Правка записи `telegram-multiagent` в `/etc/agent-registry/plugins.yaml` (`version`, `fingerprint`) через `pravka`.
5. Новый код загружается только при подъёме процесса: назначенная рука перезапускает все службы, которые его грузят (`avrora`, `iskra`, `zarya`, `spartak`, `marc`, `petrovich`, `varvara`, `anna`, `alfa`, `beta`, `gamma` `.service`). Свою службу агент изнутри не перезапускает.
6. Юнит наблюдателя ставится отдельно, пофайловым монтажом, и только если он изменился:
   `sudo smontirovat-fajly --punkt <пункт> --v-boj <копия метки>/packages/dsh-telegram-multiagent/systemd /etc/systemd/system mail-stop-arrival.service`,
   затем `sudo systemctl daemon-reload && sudo systemctl enable --now mail-stop-arrival.service`. После смены `observe-mail-stop.mjs` или `mail-stop-arrival.js` — `sudo systemctl restart mail-stop-arrival.service`. Нужны root-owned `/etc/dsh-mail-stop/arrival-observer.json` (поля ровно `root`, `mailboxes`, не больше 32 ящиков) и каталог `/var/lib/dsh-mail-stop-arrivals`: наблюдатель создаёт его сам (`0755`), а уже существующий обязан быть каталогом root, не ссылкой и без записи для группы и прочих — иначе отказ `arrival_root_untrusted`.

Проверка вне фермы, в чистом каталоге (без наших ворот и без платформы DSH):

```sh
cd <дерево>/packages/dsh-telegram-multiagent && npm pack --ignore-scripts --pack-destination /tmp/proba
cd /tmp/proba && npm init -y && npm install --ignore-scripts ./dsh-telegram-multiagent-*.tgz @deepseek-ai/cordis@4.0.1
cd node_modules/dsh-telegram-multiagent && npm test
```

`@deepseek-ai/cordis` 4.0.1 — devDependency пакета, лежит в открытом реестре npm; без него слепнут стенды, грузящие модуль через cordis. Платформу DSH (`@deepseek-ai/dsh-session` и др.) так не поставить: стенды, которым она нужна, слепы, пока не задан `DSH_TEST_APP` — каталог `app` установленной платформы. Соседние пакеты — `GATEWAY_CANDIDATE`, `ADAPTER_CANDIDATE`, `BRIDGE_CANDIDATE`. Слепота — не отказ пакета: что именно слепнет и почему — [docs/GUARDS.md](docs/GUARDS.md), «Состав test/».

Подключение агенту: блок `- insert: - name: dsh-telegram-multiagent` в профиле, собранном из шаблона реестра, плюс симлинк в `node_modules` профиля. Правка профиля руками запрещена — только через реестр (`agents.yaml` и шаблоны).

## Настройка

Настройки приходят из трёх мест: `config` модуля в профиле, JSON-файл `settingsFile` и окружение процесса. Пути в бою: токен — `/etc/dsh-telegram/<агент>.token`, JSON — `/etc/dsh-telegram/<агент>.json`.

**`config` в профиле (читается при подъёме):**

| Ключ | Умолчание | Смысл |
|---|---|---|
| `tokenFile` | не задан | Файл с токеном бота; читается первым. Пустой или нечитаемый — канал не поднимается |
| `token` | не задан | Токен прямо в конфиге; берётся, только если нет `tokenFile` |
| `tokenEnv` | `DSH_TELEGRAM_BOT_TOKEN` | Имя переменной окружения с токеном; последний запасной источник |
| `settingsFile` | `tokenFile` с заменой `.token` → `.json` | JSON с перечитываемыми настройками (таблица ниже) |
| `appDir` | `$DSH_APP_DIR` | Установка DSH этого агента; от неё разрешаются `@deepseek-ai/dsh-*`. Не задано или не разрешилось — канал не поднимается |
| `workspace` | `process.cwd()` | Рабочий каталог: ledger, вложения, `vydacha/`, cwd сессий |
| `agentName` | `telegram` в журнале, `агент` в текстах | Имя агента в журнале и в текстах собеседнику; имя по умолчанию для обращения в группе |
| `allowedUsers` | `[]` | Числовые ID Telegram с привилегиями. При `openBot: false` пустой список не пускает никого |
| `openBot` | `false` | `true` — говорить можно всем; команды, цели и копии остаются только у `allowedUsers`; включает `telegram_make_pdf` и копии гостей |
| `preset` | выбор платформы | Пресет инструментов для обычных разговоров |
| `guestPreset` | `site.preset` | Пресет для гостевых чатов открытого бота |
| `provider`, `model` | `agentDefaultModel` платформы | Запасной выбор модели, если сервис модели по умолчанию не поднялся |
| `mergeChatIntoA2A` | не задан | ID личного чата, сведённого в сессию служебного канала (`a2aSession`) |
| `a2aDir` | не задан (A2A выключен) | Каталог обмена: `in/` (вход), `out/` (ответы), `polnye/` (зеркало исходящих для копий), `tell/` |
| `a2aSession` | `a2a` | Ключ разговора служебного канала |
| `spoolDir` | не задан (выключен) | Ящик почтальона; имя каталога — ключ агента для паузы, стопа почтой и управления Codex. Без абсолютного пути пауза не публикуется, стоп почтой не применяется |
| `spoolStaleHours` | `12` | Сколько часов письмо может пролежать, прежде чем получит пометку «возможно, устарело» |
| `goalUsers` | `[]` | Кто из Telegram может ставить `/goal` в закрытом боте (в `openBot` вместо него — `allowedUsers`). Предел — в коде, не настройка: не больше 3 новых целей на канал за скользящий час (`GOAL_MAX_PER_HOUR` в `src/index.js`), сверх него — отказ «Зовите человека»; снятие цели не ограничено |
| `goalA2ASenders` | `[]` | Только счётчик в строке журнала `[goal] смонтирован`, на допуск не влияет (см. «Ограничения») |
| `supervisor` | не задан | Адресат-агент для инструмента `pismo_rukovoditelyu`; не задан — инструмента нет |
| `transcribeCommand` | не задан | Команда расшифровки голосовых (`<команда> <файл> auto`); не задана — голосовые не расшифровываются |
| `transcribeTimeoutMs` | `300000` | Предел расшифровки; по пределу гасится вся группа процессов |
| `describeCommand` | не задан | Команда описания картинок; не задана — картинки не описываются |
| `describeTimeoutMs` | `120000` | Предел описания картинки |
| `telegramFileTimeoutMs` | `30000` | Общий предел скачивания голосового (метаданные, заголовки, тело) |
| `telegramFileMaxBytes` | `20971520` | Предел фактически прочитанных байт голосового |
| `voiceTempBaseDirectory` | `/var/tmp` | Где заводить временный каталог голосовых; он не может лежать внутри `workspace` |
| `pdfTemplatesDir` | не задан | Абсолютный каталог фирменных бланков PDF; не задан — `telegram_make_pdf` отказывает |
| `site` | не задан | Чат сайта: `{preset, spoolDir, stateFile}`. Включается, только если действует `ownerChatId`; тогда обязательны `openBot: true` и `site.preset`, иначе подъём модуля падает с ошибкой |

**Ключи JSON `settingsFile` и `config` (JSON важнее, если ключ в нём есть):**

| Ключ | Умолчание | Когда читается | Смысл |
|---|---|---|---|
| `ownerChatId` | пусто | на каждое обращение | Владелец; должен входить в `allowedUsers`. Пусто, null или ошибка JSON выключает команды владельца, копии и сайт |
| `newSessionsEnabled` | `false` | на каждое обращение | Разрешает `/new` (смену поколения) |
| `guestCopyRecipients` | `[]` | на каждое обращение | Куда копировать разговоры гостей (не больше 8): `{kind:"telegram",id}` из `allowedUsers`, `{kind:"a2a",agent}` — письмо на каждую реплику, или `{kind:"a2a-svertka",agent}` — одно письмо-свёртка на разговор наблюдателю (условия — [docs/SETTINGS.md](docs/SETTINGS.md)) |
| `pdnMaskaSvertki` | не задан | на каждую доставку | `{modul, reestr, belyjSpisok}` — маска контактов в свёртке разговора гостя; не задан — свёртка не доставляется. `modul` — обычный файл root, не ссылка, без записи для группы и прочих, иначе не загружается и свёртка не доставляется |
| `adresatyTrevogFile` | не задан | на каждую тревогу | JSON с `telegramUserIds` — кому ещё слать тревогу по свёртке (не чаще 1 на разговор за 30 мин и 10 в сутки) |
| `a2aCoordinatorPrefixes` | `[]` | при подъёме | Префиксы имён координатора — подсказка, не полномочие |
| `coordinatorTrustFile` | пусто | при подъёме | root-owned JSON с публичными ключами координатора; пусто — подписи не доверяем. В бою `/etc/a2a/coordinator-signature.json` |
| `mailStopConfigFile` | пусто | при подъёме | root-owned JSON приёмника стопа (`version, recipient, status_key_id, status_key_file, arrival_root`); пусто или нечитаемо — стоп почтой не применяется. В бою `/etc/dsh-mail-stop/receiver-<агент>.json` |
| `pauseStateRoot` | `<workspace>/.pause-state` | при подъёме | Корень файлов паузы; в бою `/var/lib/dsh-pauza` |
| `compactSettingsRoot` | пусто | при подъёме | Каталог настроек журнала Codex для `/compact-status`; в бою `/etc/dsh-pamyat/agenty` |
| `receiptReviewer` | `координатор` | при подъёме | Кто разбирает удержанные квитанции (подпись в уведомлениях) |
| `remoteReturnRecipients` | `{}` | при подъёме | Таблица «агент → получатель курьера» для удалённых обратных квитанций; неизвестное удерживается |
| `coordinatorReturnRecipient` | пусто | при подъёме | Получатель обратной квитанции для подписанных писем |
| `remoteCourierEnvKey` | `A2A_TELL_DIR` | при подъёме | Через какую переменную курьер получает каталог `tell`; `A2A_ZERKALO` занят |
| `sharedSenderName` | `shared-user` | при подъёме | Имя общей учётки, которой обратный адрес не назначается |
| `siteSpoolDir` | `site.spoolDir` или `<workspace>/.site-spool` | при подъёме | Спул сайта (`vhod/`, `kopii/`, `vyhod/`) |
| `siteStateFile` | `site.stateFile` или `<workspace>/.site-state/closed` | при подъёме | Файл-выключатель сайта |

Ключи «при подъёме» меняются только перезапуском службы. Неверный тип или относительный путь в них — отказ до любых файловых действий.

**Только в JSON `settingsFile`:**

| Ключ | Умолчание | Смысл |
|---|---|---|
| `deliveryMode` | `personal` | `personal` — ответ только в источник; `owner-all` — письма служебного канала и ответы на них копируются владельцу; `broadcast` — копия в другой канал |
| `groups` | `{}` | Рабочие группы: `{"<chat_id>": {mode:"mention", names, replyCounts, context, username}}`; `context` по умолчанию 20, не больше 100. Голосовые разрешённых расшифровываются до проверки обращения (см. «Ограничения») |
| `mailStopOwnerCopies` | `true` | `false` — не копировать владельцу исходы стопа почтой |
| `statelessProviders` | `[]` | Поставщики без состояния, для которых `/new` разрешён без capability `conversationIdentity` (`claude-oauth` не допускается; нужен `newConversationRestore`) |

**Окружение:**

| Переменная | Умолчание | Кто читает, смысл |
|---|---|---|
| `DSH_APP_DIR` | — | Запасной `appDir` |
| `DSH_TELEGRAM_BOT_TOKEN` (или имя из `tokenEnv`) | — | Запасной токен |
| `KOMPAKT_AGENT` | — | `/compact-status`: имя файла `<compactSettingsRoot>/<имя>.json` |
| `DSH_HOME` | — | Передаётся `/usr/local/bin/a2a-send` — местному курьеру писем руководителю и копий гостей |
| `DSH_MAIL_STOP_CONFIG` | `/etc/dsh-mail-stop/sender.json` | `send-mail-stop.mjs`: конфиг отправителя (`version, key_id, key_file, modes, recipients`, `transport` `ssh`/`local`; необязательное `host` — хост или псевдоним ssh для `transport: ssh`, умолчание `sadik`, имя по `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$`, иначе `sender_config_untrusted`, код 2; коды выхода и вывод помощников стопа — [MAIL-STOP.md](MAIL-STOP.md)) |
| `DSH_MAIL_STOP_STATUS_TRUST` | `/etc/dsh-mail-stop/status-trust.json` | `read-mail-stop-status.mjs`: публичные ключи статусов |
| `DSH_MAIL_STOP_SENDER` | `/usr/local/lib/dsh-mail-stop/src/send-mail-stop.mjs` | `courier/iskra-tell`: путь помощника стопа |
| `OT`, `A2A_TELL_REPLY` (`no`), `PREDEL_ZNAKOV` (`3500`) | — | `courier/iskra-tell`: имя отправителя, ждать ли ответ, предел знаков письма |
| `VSE_STENDY_PREDEL_S` | `300` | `test/vse-stendy.mjs`: предел на один стенд, с |

Расшифровщику модуль передаёт `TMPDIR=<временный каталог голосового>` и при отключённом архиве `VOICE_ARCHIVE_DISABLE=1`.

Фиксированные пределы кода (вызовы Bot API, длина кусков, вложения, сроки хранения, побудки) сведены в [docs/SETTINGS.md](docs/SETTINGS.md) («Фиксированные числа»).

## Проверка

Что стоит в бою (из записи реестра):

```sh
node -p "require('/opt/agent-plugins/dsh-telegram-multiagent/package.json').version"   # installed_check
readlink /opt/iskra/.dsh/profiles/web/node_modules/dsh-telegram-multiagent             # healthcheck → /opt/agent-plugins/dsh-telegram-multiagent
```

Отпечаток состава (`fingerprint_check` записи; должен совпасть с `fingerprint`):

```sh
set -o pipefail; cd /opt/agent-plugins/dsh-telegram-multiagent && npm pack --dry-run --json 2>/dev/null \
 | jq -r '.[0].files[].path' | grep -v '\.bak' | LC_ALL=C sort \
 | while read -r f; do printf '%s %s\n' "$f" "$(sha256sum "$f" | cut -d' ' -f1)"; done | sha256sum | cut -c1-16
```

Живой признак: в журнале службы агента при подъёме есть строка `[dsh-telegram-multiagent <версия> · область …] подъём` и нет строк с `🔴` про токен, `appDir` или настройки. Наблюдатель: `systemctl is-active mail-stop-arrival.service` → `active`, в журнале `mail-stop-arrival: ready`.

Стенды:

```sh
cd /opt/agent-plugins/dsh-telegram-multiagent
DSH_TEST_APP=/opt/<агент>/app npm test          # = node test/vse-stendy.mjs
```

`vse-stendy.mjs` берёт с диска все `test/stend-*.mjs` (сейчас 190) и гоняет каждый отдельным процессом с пределом `VSE_STENDY_PREDEL_S` (300 с). Коды: `0` — все зелёные; `1` — хоть один разошёлся или упёрся в предел; `2` — расхождений нет, но есть слепые стенды (нет предмета или условий: `DSH_TEST_APP`, соседнее ядро памяти, адаптер сайта `SITE_ADAPTER_CANDIDATE`, root для части стендов стопа почтой). Итоговая строка: `═══ стендов N · зелёных … · расхождений … · слепота …`.

Вне общего прогона, запускаются отдельно:
- `node test/test-goal-control.mjs`, `node test/site-command-integration.mjs`, `node test/site-bridge-prestep.mjs`;
- PDF: `python3 -B test/test_pdf_calculation.py` (и `test_pdf_letterheads.py`, `test_pdf_saved_result.py`, `test_pdf_guest_proposal.py`, `test_pdf_frozen_footer.py`) — unittest, код 0 при успехе; нужны `reportlab` и `pypdf`, а `test_pdf_letterheads.py` и `test_pdf_frozen_footer.py` — ещё PyMuPDF (`fitz`): без него эти два выходят кодом 2 (слепота).

Полный состав `test/` — что гоняет общий прогон, что запускается отдельно, какие файлы — помощники и воркеры, а не стенды, и от каких переменных среды стенды слепнут или отказывают под root — в [docs/GUARDS.md](docs/GUARDS.md), раздел «Состав test/».

Прохождение стендов не доказывает живую доставку: `sent_at` в квитанции — это ответ Bot API, а не прочтение человеком.

## Ограничения

- Не защищает от root на машине и не хранит секреты: у нескольких учёток на sadik полный sudo, они читают любой ключ.
- Имя отправителя в письме, `From:`, имя файла и `OT` — подсказка, а не полномочие. Права координатора даёт только подписанный конверт, сверенный с `coordinatorTrustFile`. `/goal` из служебного канала принимается только из подписанного письма в `<a2aDir>/in`. `goalA2ASenders` читается, но ни на что не влияет.
- Доставка не «ровно один раз»: если ответ Bot API потерян, после повторов возможен физический дубль. Файл (`telegram_send_file`) отправляется одной попыткой, без очереди восстановления; неизвестный исход разбирают руками.
- Неизвестное исполнение не повторяется и не объявляется успехом: квитанция удерживается до разбора оператором (`receipt-admin.mjs`).
- `/stop` и пауза не отзывают уже сделанную внешнюю работу; удаление задания из расписания не отзывает уже доставленный ввод.
- Снятие паузы посреди хода (A-N-1881): если ввод владельца снял паузу, пока прерванный ход ещё шёл (`owner_turn` ещё не записан), то по `turn/end` этого хода агента будят один раз, когда он освободится (`agent.whenIdle` → `wakeGate.resumeAfterOwner`); перед побудкой состояние паузы проверяется заново. Если у агента платформы нет `agent.whenIdle`, побудки нет, в журнале строка «Пауза <сессия>: нет agent.whenIdle — побудка после хода не выполнена».
- Сверка квитанций с историей сессии (`observe`/`reconcile`) идёт один раз на сессию за такт (B-N-1892); повторно — только если строке нужно восстановление, а сессию сверяли без него. Граница: события, пришедшие в сессию посреди такта, остальные квитанции той же сессии увидят только на следующем такте.
- Ключи «при подъёме», а также появление `ownerChatId` для включения сайта требуют перезапуска службы.
- Если `tokenFile` не кончается на `.token` и `settingsFile` не задан, файлом настроек станет сам файл токена: JSON не разберётся, канал будет работать в режиме `personal` без владельца и без `/new`.
- Сайт: при заданных `site` и `ownerChatId`, но без `openBot: true` или `site.preset` подъём модуля падает с ошибкой `Site requires openBot, owner and dedicated preset`. Чистку файлов сессий сайта и гостей модуль не делает — это внешний таймер (`site-sroki-varvara.timer`).
- Контекст рабочих групп хранится только в памяти процесса и теряется при перезапуске; падежи имён не угадываются.
- Вложения не проверяются на вредоносность; голосовые и картинки обрабатываются внешними командами, без них модуль только пишет строку в журнал.
- Наблюдатель стопа не удаляет свои записи (предел 4096), архивирует их монтирующая рука; файлы, лежавшие в ящике до запуска наблюдателя, остаются «приход неизвестен».
- `courier/coder-tell` пропускает только `-f`, `--stop-pause`, `--stop-replace`; `--new` кодерам доступен только через `iskra-tell --coder <alfa|beta|gamma> --new`.
- Обработчик сообщения Telegram ждут внутри цикла опроса (принятый риск, находка №10): пока расшифровывается голосовое разрешённого пользователя, стоит весь приём канала — Telegram, служебная почта, ящик почтальона, такт квитанций — до `transcribeTimeoutMs` (умолчание 300 000 мс) и ещё около 10 с; текст при занятом агенте держит приём до 15 с (ожидание простоя агента). Входы не теряются — они уже в квитанциях, — но стоп-письма и ответы другим чатам задерживаются.
- В рабочей группе (`groups`) голосовое разрешённого пользователя (при `openBot` — любого участника) скачивается и уходит во внешний `transcribeCommand` ДО проверки обращения: так ищется имя бота в речи. Значит, расшифровывается каждое такое голосовое группы, даже не адресованное боту: это время и стоимость расшифровщика и чужие разговоры, переданные внешней команде.
- Совместимость проверялась на DSH `0.2.0-rc.2` и Node.js `24.19.0` (`engines`: Node ≥ 24 — проверенная среда; встроенный `node:sqlite` есть и в Node 22.13+, но с `ExperimentalWarning`, и на 22 пакет у нас не проверялся).

## B-N-2021 — учётки с дефисом в spool

`node test/stend-spool-agent-name.mjs` проверяет настоящие filename helpers. Полный хвост v1 hex/PID, ownerall или v2 SHA256 соответствует a2a-bus; дефис внутри учётки сохраняется. Недопустимое имя не получает атрибуцию и не снимает копию владельцу, но обычный текст из spool не запрещается этой проверкой. Собственная учётка сверяется точным префиксом, в том числе при окончаниях `-ownerall`/`-v2`. После переноса UID filename остаётся подсказкой: эти окончания могут давать несколько разборов. Полномочий такой hint не назначает. Совместимость с правилом почтальона не доказывает успех его уведомления. Частная цепочка UID-transfer — `dsh-pochta/test/stend-chain-agent-name.py`, без живых ящиков и Telegram.
