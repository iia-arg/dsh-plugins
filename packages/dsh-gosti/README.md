Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-gosti — гостевой контур Варвары и «Острова»

**Версия:** 3.1.2

Служебный софт sadik: адаптер «чат сайта (Chatwoot) ↔ Варвара», срок 30 суток переписки посетителей, читатель списка
сотрудников «Острова», раннер песочницы гостя без доступа к журналу, шлюз OMEGA для гостевых агентов и его стенд.

Пакет служебный (группа Д): публикуется исходниками, без npm, после общих ворот секретов (`vorota-obezlichivaniya`).
Пути, учётки и адреса машины sadik зашиты в коде умолчаниями; ключи и токены в пакет не входят — в коде и юнитах только
пути к ним (раздел «Внешние файлы»).

**Временное правило (Вениамин, 07.10.2026):** пока у новых пакетов нет читателя «бой ↔ метка», любой файл пакета
меняется только вместе с новым номером пакета в том же окне.

Пакет — исходники без `package.json`: каталоги `bin/`, `sbin/`, `lib/` повторяют пути под `/usr/local/`, юниты и drop-in —
в `systemd/` (под `/etc/systemd/system/`). Номер — заголовок CHANGELOG и метка `dsh-gosti-v<номер>`.
При переносе с боя (07.10.2026) сумма каждого файла в дереве была равна сумме боя. Дальше дерево может опережать бой:
правка входит в дерево коммитом, а в бой — монтажом в окне; какие файлы и в каком номере изменены — в `CHANGELOG.md`.
Поэтому бой сверяют с меткой смонтированного номера, а не с головой дерева.

**Сверх плана Зари (b9822ac4 §2.8), знаменатель снят с диска 07.10.2026:** два живых drop-in —
`omega-shlyuz-gostej.service.d/15-omega-mcp-klyuch.conf` (ключ OMEGA подаётся ТОЛЬКО шлюзу; в файле путь, не значение)
и `spisok-sotrudnikov.service.d/50-adresaty-trevog.conf`. Юнитов вне пакета, исполняющих его файлы, нет.

## Файлы

git хранит только признак «исполняемый», поэтому режим и владелец на диске — в таблице (снято `stat` боя 07.10.2026).

| файл в пакете | путь на диске | кто зовёт | режим | владелец:группа |
|---|---|---|---|---|
| `sbin/sajt-chat` | `/usr/local/sbin/sajt-chat` | sajt-chat.service (User=sajtchat, постоянная) | 755 | root:root |
| `sbin/site-sroki.py` | `/usr/local/sbin/site-sroki.py` | site-sroki-varvara.service ← .timer 02:20 UTC | 755 | root:root |
| `sbin/spisok-sotrudnikov` | `/usr/local/sbin/spisok-sotrudnikov` | spisok-sotrudnikov.service ← .timer раз в 10 мин | 755 | root:root |
| `bin/bwrap-bez-zhurnala` | `/usr/local/bin/bwrap-bez-zhurnala` | песочница гостя Варвары: runnerCommand dsh-sandbox-local в /opt/varvara/.dsh/profiles/web/cordis.patch.yml; проверяет sadik-watch | 755 | root:root |
| `lib/omega-shlyuz/omega-shlyuz-gostej.py` | `/usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py` | omega-shlyuz-gostej.service (User=omega-shlyuz, постоянная) | 755 | root:root |
| `lib/omega-shlyuz/stend-shlyuza-omega.py` | `/usr/local/lib/omega-shlyuz/stend-shlyuza-omega.py` | ночной обход стендов vse-stendy-boevye.sh (дерево доработок Искры) | 755 | root:root |
| `systemd/omega-shlyuz-gostej.service` | `/etc/systemd/system/omega-shlyuz-gostej.service` | systemd: постоянная служба, `WantedBy=multi-user.target`, `Restart=on-failure`; таймера нет | 644 | root:root |
| `systemd/sajt-chat.service` | `/etc/systemd/system/sajt-chat.service` | systemd: постоянная служба, `WantedBy=multi-user.target`, `Restart=on-failure`; таймера нет | 644 | root:root |
| `systemd/site-sroki-varvara.service` | `/etc/systemd/system/site-sroki-varvara.service` | свой .timer (oneshot, `User=varvara`) | 644 | root:root |
| `systemd/site-sroki-varvara.timer` | `/etc/systemd/system/site-sroki-varvara.timer` | systemd (включён) | 644 | root:root |
| `systemd/spisok-sotrudnikov.service` | `/etc/systemd/system/spisok-sotrudnikov.service` | свой .timer (oneshot) | 644 | root:root |
| `systemd/spisok-sotrudnikov.timer` | `/etc/systemd/system/spisok-sotrudnikov.timer` | systemd (включён) | 644 | root:root |
| `systemd/omega-shlyuz-gostej.service.d/15-omega-mcp-klyuch.conf` | `/etc/systemd/system/omega-shlyuz-gostej.service.d/15-omega-mcp-klyuch.conf` | systemd: drop-in — EnvironmentFile ключа OMEGA только шлюзу (B-N-1476; сверх плана) | 644 | root:root |
| `systemd/spisok-sotrudnikov.service.d/50-adresaty-trevog.conf` | `/etc/systemd/system/spisok-sotrudnikov.service.d/50-adresaty-trevog.conf` | systemd: drop-in — ReadWritePaths адресатов тревог (B-N-1640; сверх плана) | 644 | root:root |

`README.md`, `README.en.md`, `CHANGELOG.md` и `LICENSE` на машину не ставятся.

Назначение файлов:
- `sajt-chat` — узкий адаптер «чат сайта (Chatwoot на vps-ru) ↔ Варвара» (B-N-1499). Номер конверта из ответа Варвары
  (поле `na`) попадает в текст тревоги или отказа, только если имеет форму конверта адаптера `cw-<разговор>-<сообщение>`;
  иначе в тексте стоит «na неверной формы (длина N)» без самого значения (1.0.7, B-N-1913). Отправку ответа форма не
  решает: как и прежде, решает только наличие такого конверта в базе адаптера.
- `site-sroki.py` — срок 30 суток для переписки посетителей сайта у Варвары.
- `spisok-sotrudnikov` — читатель списка сотрудников сайта «Острова» (B-N-1640).
- `bwrap-bez-zhurnala` — раннер песочницы гостя: маска только для чтения на сокеты journald и др. (B-N-1679). Вызов —
  `bwrap-bez-zhurnala <аргументы bwrap> -- <команда>`; перед первым `--` обёртка добавляет `--tmpfs P --remount-ro P` для
  каждого существующего каталога из зашитого списка: `/run/systemd/journal`, `/opt/varvara/workspace/.message-receipts`,
  `/run/ostrov-most`, `/var/lib/ostrov-most`, `/run/credentials/ostrov-most.service`,
  `/run/credentials/claude-oauth-gateway@varvara.service` и `/run/claude-oauth-gost-varvara` (токены подписок шлюза гостя,
  B-N-1621; сам шлюз работает вне песочницы), `/run/ostrov-most-health`, `/var/lib/varvara-guest-data`,
  `/var/lib/gost-reestr-varvara`, `/etc/ostrov-most`, `/run/varvara-handoff`, `/etc/dsh-telegram`; затем `exec /usr/bin/bwrap`.
  Каталога на машине нет — нет и маски. Нет `--` — код 1 и строка с префиксом `bwrap: `.
- `omega-shlyuz/omega-shlyuz-gostej.py` — шлюз OMEGA для гостевых агентов (B-N-1476); `stend-shlyuza-omega.py` — его стенд.

## Связи с другими пакетами и конфигурацией

- `bwrap-bez-zhurnala` зовёт платформа DSH (dsh-sandbox-local, `runnerCommand`) по профилю Варвары; немоту обёртки сверяет `sadik-watch` (**dsh-storozha-sadik**).
- `stend-shlyuza-omega.py` гоняет ночной обход стендов (`vse-stendy-boevye.sh`, дерево доработок Искры).
- Каталоги из `/etc/tmpfiles.d/sajt-chat.conf`, `/etc/tmpfiles.d/adresaty-trevog.conf`, белый список `/etc/varvara/belyj-spisok.txt`, ключ `/etc/omega/mcp-klyuch.env` — в пакет не входят.

## Настройка

Всё ниже взято из кода и юнитов. «Только для стенда» — подмены, которые на боевых юнитах не ставят. В столбце «умолчание»
«—» значит, что переменная не задана; словами записаны умолчания, которые код вычисляет.

**`sajt-chat`** — без доводов; запускает юнит `sajt-chat.service`, `Environment=` в нём нет.

Ключи `SAJT_*` действуют только при `SAJT_STEND=1`: тогда адаптер печатает «ПОДМЕНЕНО: …» с перечнем подменённых. Без
`SAJT_STEND` заданные ключи игнорируются со строкой «ИГНОРИРУЮ (нет SAJT_STEND=1): …» в stderr; любое иное значение
`SAJT_STEND` — отказ, код 2. Поэтому умолчание из таблицы и есть боевое значение.

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `SAJT_STEND` | — | `1` — режим стенда; иное значение — отказ, код 2 |
| `SAJT_ACCOUNT` | `1` | номер account в пути API `/api/v1/accounts/<N>` |
| `SAJT_INBOX` | `1` | ящик: фильтр `inbox_id` в списке разговоров |
| `SAJT_SPOOL` | `/var/spool/sajt-chat` | каталоги обмена `vhod/`, `kopii/`, `vyhod/`, `vyhod/otkaz/` |
| `SAJT_STATE` | `/var/lib/sajt-chat/zakryto` | файл есть — сайт закрыт (`/sss`); его время изменения входит в ключ автоответа |
| `SAJT_DB` | `/var/lib/sajt-chat-adapter/adapter.db` | своя база SQLite (WAL); каталог адаптер создаёт сам |
| `SAJT_ETC` | `/etc/sajt-chat` | каталог файлов настройки (см. «Внешние файлы») |
| `SAJT_ALERT` | `/usr/local/bin/agent-alert` | отправщик тревог и отбоев |
| `SAJT_MAX_TEXT` | `2000` | предел длины сообщения посетителя, знаков; длиннее — копия и автоответ |
| `SAJT_PER_CONV_MIN` | `6` | конвертов на разговор за 60 с; больше — отсечение |
| `SAJT_MAX_LIVE` | `20` | предел живых разговоров; новый сверх него — отсечение и тревога |
| `SAJT_LIVE_SEC` | `86400` | окно «живого» разговора, с |
| `SAJT_CAP_HOUR` | `60` | общий потолок конвертов к модели за час |
| `SAJT_CAP_DAY` | `300` | то же за сутки |
| `SAJT_NE_ZABRANO` | `120` | конверт в `vhod/` старше этого, с, забирается назад: копия, автоответ, тревога |
| `SAJT_REPLY_AGE` | `3600` | ответ на конверт старше этого, с, отвергается |
| `SAJT_POLL` | `2` | пауза цикла опроса, с |
| `SAJT_ALERT_PAUSE` | `3600` | пауза повтора тревоги одного вида, с |
| `SAJT_KOPII_K` | `5` | копий отсечённого на разговор за окно |
| `SAJT_KOPII_VSEGO` | `30` | копий отсечённого на все разговоры за окно |
| `SAJT_KOPII_OKNO` | `600` | окно счёта копий, с; по его концу — сводка «ещё N…» |
| `SAJT_SHLYUZ_SERDCE` | `2` | период сердцебиения к шлюзу виджета, с |
| `SAJT_STRANIC` | `10` | страниц сообщений разговора за проход |
| `SAJT_SVERKA_SEK` | `3600` | сверка последних 20 сообщений младше этого, с (ловит поздний commit) |
| `SAJT_STRANIC_RAZG` | `10` | страниц списка разговоров за проход |
| `SAJT_AKT_ZAPAS` | `5` | запас на `last_activity_at` и на расхождение часов, с |
| `SAJT_HRANIT_SEK` | `2592000` | срок хранения файлов обмена и строк базы, с (30 сут) |
| `SAJT_CHISTKA_PERIOD` | `3600` | период чистки по сроку, с |

Зашито в коде: переадресация (3xx) в API Chatwoot и в шлюз виджета — отказ (токен и подпись на чужой хост не уходят); тайм-аут запроса API 10 с; тайм-аут `agent-alert` 20 с; POST к шлюзу виджета 5 с (при останове 2 с);
тревога «опрос» после 5 неудач подряд; имя файла обмена — до 80 знаков `[A-Za-z0-9_-]`, права 0640; в копии описываются
первые 5 вложений; номер конверта `na` попадает в текст тревоги только формой `cw-<разговор>-<сообщение>`, иначе —
«na неверной формы (длина N)»; тексты автоответов посетителю.

**`site-sroki.py`** — без доводов. В бою: `/usr/bin/python3 -B /usr/local/sbin/site-sroki.py` из `site-sroki-varvara.service`.

| переменная | умолчание | смысл |
|---|---|---|
| `SITE_DOM` | `/opt/varvara` | дом агента; сессии — `<дом>/.dsh/sessions`. Юнит задаёт то же |
| `SITE_SROK_SUT` | `30` | срок, сутки (допустима дробь). Юнит задаёт то же |
| `SITE_KARTA_SHLYUZA` | `/var/lib/claude-oauth-gateway-varvara/sessii.db` | карта шлюза `dshId → sessionId`, открывается только на чтение |
| `SITE_SEJCHAS` | текущее время | подмена «сейчас», unix-секунды; флагом стенда не закрыта — на боевом юните не ставить |

Зашито в коде: удаляются только сессии с префиксами `telegram-site-` и `telegram-gost-`; сессия с занятым `session.lock`
пропускается; цель вне дома не удаляется.

**`spisok-sotrudnikov`** — доводов нет: `--help` или `-h` — справка, код 0, без тревоги; любой другой довод — код 2 (от root — с
тревогой, не от root — без тревоги). Шебанг `/usr/bin/python3 -I`. Ключ подаёт юнит через
`LoadCredential=ostrov-staff:/etc/spisok-sotrudnikov/directory-readonly.key`.

| переменная | умолчание | смысл |
|---|---|---|
| `SPISOK_URL` | `http://192.168.99.3:4214/internal/v1/staff` | выдача списка сотрудников сайта |
| `SPISOK_KLYUCH` | `$CREDENTIALS_DIRECTORY/ostrov-staff` | файл ключа Bearer; годен ключ из печатных ASCII от 16 знаков, иначе отказ 2 |
| `SPISOK_VYHOD` | `/etc/varvara/belyj-spisok.txt` | белый список маски ПДн Варвары; пишется атомарно, root:`SPISOK_GRUPPA`, 0640 |
| `SPISOK_RUCHNOJ` | `/etc/varvara/belyj-spisok.ruchnoj.txt` | постоянные строки владельца; нет файла — пустой список |
| `SPISOK_ZAPRET` | `/etc/varvara/zapret-spisok.txt` | запреты владельца; **обязателен** (см. «Внешние файлы») |
| `SPISOK_SOST` | `/var/lib/spisok-sotrudnikov` | своё состояние: `sost.json` 0600, `adresaty-trevog.json` 0640; каталог 0700 |
| `SPISOK_ALERT` | `/usr/local/bin/agent-alert` | отправщик тревог |
| `SPISOK_GRUPPA` | `varvara` | группа файла белого списка |
| `SPISOK_TREVOGI` | `/var/lib/adresaty-trevog` | каталог копии адресатов тревог (`adresaty-trevog.json`); drop-in `50-adresaty-trevog.conf` открывает его на запись |
| `SPISOK_GRUPPA_TREVOG` | `marc` | группа этой копии, 0640 |

Подмены `SPISOK_*`, в том числе `SPISOK_KLYUCH`, флагом стенда не закрыты: на боевом юните их не ставят.
Зашито в коде: тайм-аут запроса 5 с; ответ не больше 1 МиБ; переадресация (3xx) — отказ; остывание тревоги одного вида
сутки; тайм-аут `agent-alert` 60 с; имя вносится, только если в нём от 2 слов; телефон — от 10 до 15 цифр.

**`bwrap-bez-zhurnala <доводы bwrap> -- <команда>`** — нужен хотя бы один `--`. Переменных среды не читает. Перечень
13 каталогов под маску зашит (см. «Назначение файлов»); исполнитель — `exec /usr/bin/bwrap`; оболочка — `/bin/sh` (dash),
а не bash: bash исполнил бы `$BASH_ENV` до песочницы.

**`omega-shlyuz-gostej.py`** — без доводов. В бою: `/opt/omega/venv/bin/python3 -B /usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py`.

| переменная | умолчание | смысл |
|---|---|---|
| `SHLYUZ_UPSTREAM` | `http://127.0.0.1:8377/mcp` | служба OMEGA. Юнит задаёт то же |
| `OMEGA_MCP_API_KEY` | — | ключ службы OMEGA; в бою — из `EnvironmentFile=/etc/omega/mcp-klyuch.env` (drop-in `15-omega-mcp-klyuch.conf`). Пусто — шлюз не стартует, код 2 |
| `SHLYUZ_KLYUCHI` | `/etc/omega/gost-klyuchi.txt` | строки «`<sha256 ключа гостя> <корень>`», читаются на каждый запрос. Юнит задаёт то же |
| `SHLYUZ_STATE` | `/var/lib/omega-shlyuz` | списки своих записей `<корень>.ids`, дозапись под `flock`. Юнит задаёт то же и `StateDirectory=omega-shlyuz` 0700 |
| `SHLYUZ_PORT` | `8379` | порт приёма. Юнит задаёт то же |

Зашито в коде: адрес приёма `127.0.0.1`; допустимые заголовки Host — `127.0.0.1:<порт>` и `localhost:<порт>` (защита от
DNS-rebinding); без сессий (`stateless`); белый список инструментов; режимы поиска `semantic`, `phrase`, `unified`;
`filter_tags` — до 10 строк по 64 знака; `reason` обрезается до 500 знаков; корень гостя — `^[a-z][a-z0-9_-]{0,63}$`;
тип по умолчанию для невечных записей — `fakt`.

**`stend-shlyuza-omega.py [путь шлюза]`** — по умолчанию проверяет `/usr/local/lib/omega-shlyuz/omega-shlyuz-gostej.py`;
переменных среды не читает. Запуск и условия — в разделе «Проверка».

## Коды возврата

| программа | коды |
|---|---|
| `sajt-chat` | служба без выхода · 0 — остановлена SIGTERM (перед выходом шлёт шлюзу виджета «закрыто») · 2 — `SAJT_STEND` не `1`, нет каталога обмена («🔴 СЛЕПОТА: нет каталога …»), нет `api.token` или `chatwoot-api` · 1 — непойманное исключение (трассировка Python) |
| `site-sroki.py` | 0 — сделано (занятые сессии пропущены штатно) · 1 — хоть один отказ: не удалено, цель вне дома или карта шлюза не прочитана · 2 — нет `<дом>/.dsh/sessions` |
| `spisok-sotrudnikov` | 0 — прочитано и сведено, или справка (`--help`, `-h`) без тревоги · 1 — выдача недоступна или не прошла проверку; файлы не тронуты, тревога · 2 — ключ негоден, нет файла запретов или в нём неразобранные строки, довод в командной строке — всё с тревогой (довод не от root — без тревоги: это ручной вызов, а не служба) · 1 — непойманное исключение: нет группы `varvara`/`marc` или каталога копии адресатов |
| `bwrap-bez-zhurnala` | 1 — нет `--` (строка с префиксом «bwrap: ») · иначе — код самого `/usr/bin/bwrap` (`exec`); нет `/usr/bin/bwrap` — 127 |
| `omega-shlyuz-gostej.py` | служба без выхода · 2 — не задан `OMEGA_MCP_API_KEY` · 1 — непойманное исключение (например, нет пакета `mcp`). Отказ гостю — ответом, а не кодом: 401 до MCP или текст «ОТКАЗ шлюза OMEGA для гостей: …» |
| `stend-shlyuza-omega.py` | 0 — сошлось · 1 — есть FAIL · 2 — есть СЛЕПОТА, запуск не от root или нет файла шлюза · 143 — SIGTERM (уборка выполняется) |

## Внешние файлы и зависимости

Программы и версии:
- `/usr/bin/python3` — `sajt-chat`, `spisok-sotrudnikov`, `site-sroki.py`; только стандартные модули. Признаков новее
  Python 3.8 в коде нет (бой — 3.12);
- `/opt/omega/venv/bin/python3` — шлюз и стенд. Шлюзу нужны пакеты `mcp`, `starlette`, `uvicorn` и модуль
  `omega.types` пакета OMEGA: без `omega.types` шлюз не знает вечных типов и отказывает каждому `omega_store`. Стенду —
  `mcp`, `omega.server.*` и `omega_platform.*`. Нынешние `mcp`, `starlette` и `uvicorn` требуют Python ≥ 3.10
  (`Requires-Python` в их METADATA; замер 10.10.2026 в `/opt/omega/venv`: Python 3.12.3);
- `/usr/bin/bwrap` (bubblewrap) и `/bin/sh` — `bwrap-bez-zhurnala`;
- `/usr/local/bin/agent-alert` (пакет dsh-trevogi) — тревоги `sajt-chat` и `spisok-sotrudnikov`. У `sajt-chat` сбой
  отправки только пишется в журнал; у `spisok-sotrudnikov` неотправленная тревога повторяется следующим тактом;
- стенд шлюза зовёт `systemctl`, `systemd-run`, `sudo`, `journalctl`, `ps` и CLI `sqlite3`.

Службы и сеть:
- служба OMEGA (пакет omega-memory, `omega-memory.service`, порт 8377) — для шлюза (`After=`/`Wants=`). Не ответила —
  гость получает «служба OMEGA не ответила (…)», а `tools/list` — пустой список;
- шлюз API Chatwoot на vps-ru — адрес в `/etc/sajt-chat/chatwoot-api`; выдача списка сотрудников — `SPISOK_URL`.

Учётки и группы:
- `sajtchat` — служба `sajt-chat`; дополнительная группа `agent-button` нужна ради `agent-alert`;
- `omega-shlyuz` — шлюз (не `omega`, без доступа к `/var/lib/omega` и `/etc/omega`);
- root — `spisok-sotrudnikov.service`;
- `varvara` — `site-sroki-varvara.service`: чистка идёт от учётки Варвары, поэтому подмена каталога ссылкой между проверкой и удалением не дотянется дальше её собственных файлов;
- группы `varvara` (белый список) и `marc` (копия адресатов тревог); нет группы — исключение, код 1;
- учётка `omega` — стенд шлюза работает через `sudo -u omega`.

Внешние файлы — в пакет не входят; что будет без каждого:

| путь | кто читает | без него |
|---|---|---|
| `/etc/sajt-chat/api.token`, `/etc/sajt-chat/chatwoot-api` | `sajt-chat` | код 2 при старте; юнит перезапускается раз в 10 с, не больше 5 раз за 600 с |
| `/etc/sajt-chat/shlyuz-url`, `/etc/sajt-chat/shlyuz.secret` | `sajt-chat` | работает, но окно виджета не получает состояния (строка «шлюз виджета не настроен …») |
| `/etc/sajt-chat`, `/var/lib/sajt-chat` (каталоги) | юнит `sajt-chat`, `ReadOnlyPaths=` без «-» | юнит не стартует (так systemd обращается с обязательным путём песочницы) |
| `/var/spool/sajt-chat/{vhod,kopii,vyhod,vyhod/otkaz}` | `sajt-chat` | код 2 «СЛЕПОТА: нет каталога»; создаёт их `/etc/tmpfiles.d/sajt-chat.conf` |
| `/opt/varvara/.dsh/sessions` | `site-sroki.py` | код 2 |
| `/var/lib/claude-oauth-gateway-varvara/sessii.db` | `site-sroki.py`, только чтение | сессии и кэш удаляются, расшифровки SDK этих сессий — нет; на каждую — отказ, код 1 |
| `/etc/spisok-sotrudnikov/directory-readonly.key` | юнит `spisok-sotrudnikov`, `LoadCredential=` | юнит не стартует; ключа нет в учётных данных — код 2 с тревогой |
| `/etc/varvara/zapret-spisok.txt` | `spisok-sotrudnikov` | **обязателен**: код 2 на каждом такте (раз в 10 мин), тревога одного вида — не чаще раза в сутки; белый список не пишется |
| `/etc/varvara/belyj-spisok.ruchnoj.txt` | `spisok-sotrudnikov` | необязателен: берётся пустым |
| `/etc/varvara/belyj-spisok.txt` | пишет `spisok-sotrudnikov` | создаётся |
| `/var/lib/adresaty-trevog` | пишет `spisok-sotrudnikov` | создаёт `/etc/tmpfiles.d/adresaty-trevog.conf`; нет каталога — исключение уже после записи белого списка |
| `/etc/omega/mcp-klyuch.env` | юнит шлюза, `EnvironmentFile=` без «-» | юнит не стартует |
| `/etc/omega/gost-klyuchi.txt` | шлюз, на каждый запрос | не прочитан или есть негодная строка — никого не пускает (401). Права по шапке шлюза — 640 root:omega-shlyuz; код их не проверяет |
| `/var/lib/omega/.omega/{omega.db,license.json,device.json}`, `/var/lib/omega/.cache/omega/models` | стенд шлюза (снимает копию) | СЛЕПОТА, код 2 |

## Установка и снятие (руками root)

Установка файла: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>`; в бою — через
`smontirovat-fajly` по воротам. Юниты и drop-in: в `/etc/systemd/system/`, `systemctl daemon-reload`, включить
`sajt-chat`, `omega-shlyuz-gostej` и таймеры `site-sroki-varvara`, `spisok-sotrudnikov`.
⚠️ Чат сайта живой: без слова координатора не останавливать и не пробовать боевым ключом (правило 03.10.2026).

Снятие юнита — `systemctl mask` (правило фермы 9): наш юнит с файлом в `/etc/systemd/system` mask не примет —
файл в страховку (`mv`), `daemon-reload`, `mask`; вернуть — `unmask` и файл назад.

## Ограничения

- `sajt-chat` не судит смысл ответов Варвары; не видит больше `SAJT_STRANIC_RAZG`×25 разговоров, оживших между двумя
  опросами, и расхождения часов sadik и vps-ru больше `SAJT_AKT_ZAPAS`; вложения не скачивает. Останов `kill -9` или
  падение машины «закрыто» шлюзу виджета не шлёт — окно закрывает тайм-аут шлюза. Отбой есть только у тревоги `shlyuz`.
  Чистка по сроку не касается сессий и памяти Варвары, журнала службы, копий в Telegram и самого Chatwoot.
- `site-sroki.py` не трогает строки `receipts.sqlite`, вложения, спул сайта, память агента, журналы systemd и строку
  карты в `sessii.db`.
- `spisok-sotrudnikov` не ловит список, верный по схеме, но ошибочный по смыслу; смерть своего таймера; устаревание,
  если сайт отдаёт ту же старую ревизию. У копии `adresaty-trevog.json` в `SPISOK_SOST` читателя пока нет.
- `bwrap-bez-zhurnala` не закрывает файловые инструменты платформы (они идут через dsh-fs-sandbox), сеть, абстрактные
  сокеты и пути не из списка; маску ставит только на каталог — путь, ставший файлом или сокетом, маску молча не получит.
- `omega-shlyuz-gostej.py`: записи гостя лежат в общей базе; правильность фильтра корня внутри OMEGA проверяет стенд,
  а не шлюз; `dsh-pamyat-obsluzhivanie` пишет в корень гостя мимо шлюза, и такие записи `similar` не подтвердит;
  при недоступной службе `tools/list` отдаёт пустой список, а не ошибку.

## Проверка

Сумма каждого файла пакета по метке `dsh-gosti-v<номер>`, смонтированной в бой, = сумма боя (`sha256sum`), права = таблице (`stat -c '%a %U:%G'`).

Стенды:
- **`stend-shlyuza-omega.py`** (в этом пакете): `sudo /opt/omega/venv/bin/python3 -B /usr/local/lib/omega-shlyuz/stend-shlyuza-omega.py [шлюз.py]` —
  после каждого обновления OMEGA и правки шлюза; в ночном обходе — строкой `@root` (пакет dsh-obhod-stendov). Нужны root
  (иначе код 2), `systemd-run`, учётка `omega`, CLI `sqlite3` и свободные порты 8396–8399 (стенд их не проверяет). Живая
  служба OMEGA не нужна: стенд поднимает её копию временным юнитом на копии боевой базы, снятой только на чтение, и
  шлюз под проверкой — вторым временным юнитом с `DynamicUser=yes`. Не ловит доставку ключа гостю, права файлов на
  боевой машине и поведение под нагрузкой.
- **`stend-sajt-chat.sh`** (+ `stend-sajt-chat.py`, пакет dsh-obhod-stendov, `dorabotki/stendy/`): предмет — `SAJT_BIN`,
  по умолчанию `/usr/local/sbin/sajt-chat`; под обычной учёткой, Chatwoot, шлюз виджета и тревога подставные на
  127.0.0.1. Адаптер обязан напечатать «ПОДМЕНЕНО» с `SAJT_SPOOL` и `SAJT_ETC`, иначе код 2; проб ровно 50, иначе код 2.
  Коды 0 / 1 / 2.
- **`dsh-telegram-multiagent/test/stend-site-adapter.mjs`** — стенд канала, предмет `SITE_ADAPTER_CANDIDATE=/usr/local/sbin/sajt-chat`;
  без переменной — СЛЕПОТА, код 2.
- **`dsh-storozha-sadik/test/stend-nemota-obertki.sh`** (root) — стенд блока сторожа `sadik-watch`, который каждый такт
  проверяет `bwrap-bez-zhurnala`: сумма против метки, права `root:root 755`, `runnerCommand` в профиле, проба под `varvara`.

У `site-sroki.py` и `spisok-sotrudnikov` стендов нет.
