Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-compact-outcomes

**Версия:** 3.1.3

## Назначение

Наблюдатель исходов сжатия беседы у Codex-кодеров (плагин Альфы). Датчик `turn-sensor.mjs` работает внутри платформы DSH у трёх Codex-кодеров (их имена зашиты в коде, см. «Ограничения») и на каждом `turn/end` пишет строку с замером токенов. Служба `dsh-compact-outcomes.service` раз в минуту запускает `collector.py`. Тот сравнивает соседние ходы (`turn_watch.py`) и через `agent-alert` шлёт тревогу «признак „сжал Codex“», если число токенов упало без события сжатия DSH. Для Codex-агентов без датчика служба читает события `codex_compacted` из файла выборки журнала шлюза. Кроме того, `collector.py` с `observer.py` вёл семидневный счёт подтверждённых сжатий («наша сводка выжила» / «Codex опередил» / «причина не установлена») с суточными и недельным отчётами в `a2a/out`.

## Что ставится и куда

Все суммы sha256 пакета совпадают с боем рабочей машины, режимы и владельцы совпадают с реестром (сверено 08.10.2026). Каталог плагина `/opt/coders/alfa/plugins/dsh-compact-outcomes/` — `0750 coders:coders`.

| файл в пакете | путь на машине | режим, владелец | что это |
|---|---|---|---|
| `plugin/collector.py` | `/opt/coders/alfa/plugins/dsh-compact-outcomes/collector.py` | 0640 coders:coders | точка входа службы: монитор ходов, затем недельный счёт и отчёты |
| `plugin/observer.py` | `…/dsh-compact-outcomes/observer.py` | 0640 coders:coders | классификатор сжатий (его импортирует `collector.py`), только чтение |
| `plugin/turn_watch.py` | `…/dsh-compact-outcomes/turn_watch.py` | 0644 coders:coders | монитор журналов датчика и файлов выборки шлюзов, очередь тревог `agent-alert` |
| `plugin/turn-sensor.mjs` | `…/dsh-compact-outcomes/turn-sensor.mjs` | 0644 coders:coders | плагин DSH (`name: dsh-compact-outcomes-turns`): датчик конца хода |
| `plugin/agents.json` | `…/dsh-compact-outcomes/agents.json` | 0640 coders:coders | настройка `collector.py --config`: пути кодеров и шлюзов без датчика |
| `plugin/test_observer.py` | `…/dsh-compact-outcomes/test_observer.py` | 0640 coders:coders | тесты `observer.py` и `collector.py` |
| `plugin/test_turn_watch.py` | `…/dsh-compact-outcomes/test_turn_watch.py` | 0644 coders:coders | тесты `turn_watch.py` |
| `plugin/test_turn_sensor.mjs` | `…/dsh-compact-outcomes/test_turn_sensor.mjs` | 0644 coders:coders | тест датчика с подставным контекстом |
| `plugin/test_turn_sensor_sobytiya.mjs` | `…/dsh-compact-outcomes/test_turn_sensor_sobytiya.mjs` | 0644 coders:coders | стенд датчика с настоящим ядром `dsh-pamyat-core` |
| `plugin/mutation_probe.py` | `…/dsh-compact-outcomes/mutation_probe.py` | 0640 coders:coders | проба порчи классификатора |
| `plugin/README.md` | `…/dsh-compact-outcomes/README.md` | 0640 coders:coders | README плагина от автора (история кандидата A-N-675) |
| `systemd/dsh-compact-outcomes.service` | `/etc/systemd/system/dsh-compact-outcomes.service` | 0644 root:root | oneshot под `coders`, песочница `ProtectSystem=strict` |
| `systemd/dsh-compact-outcomes.service.d/agent-alert.conf` | `/etc/systemd/system/dsh-compact-outcomes.service.d/agent-alert.conf` | 0644 root:root | drop-in: `ReadWritePaths=-/var/log/agent-alert/poslednie.log` (с «-») |
| `systemd/dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` | `/etc/systemd/system/dsh-compact-outcomes.service.d/codex-compaction-vyborka.conf` | 0644 root:root | drop-in: `ExecStartPre=-+/usr/local/libexec/codex-compaction-vyborka` для Codex-агентов без датчика |
| `systemd/dsh-compact-outcomes.timer` | `/etc/systemd/system/dsh-compact-outcomes.timer` | 0644 root:root | `OnBootSec=2min`, `OnUnitInactiveSec=60s` |

`README.md`, `CHANGELOG.md` и `LICENSE` корня пакета на машину не ставятся.

Каталоги и файлы, которые создаёт служба (в пакет не входят):

| путь | кто пишет | что там |
|---|---|---|
| `/opt/coders/alfa/pamyat/compact-outcomes/` | `collector.py` | `lock`, `state.json`, `latest.md`, `DONE`, `turn-watch-state.json`, `turn-alerts.jsonl` (+ архивы `.1`…`.5`); файлы 0600 |
| `/opt/coders/alfa/pamyat/compact-outcomes/turns/<агент>.jsonl` | `turn-sensor.mjs` в процессе агента | строка на каждый `turn/end`; 8 МиБ + 5 архивов; каталог 0700, файлы 0600 |
| `/opt/coders/alfa/a2a/out/compact-outcomes-*.md` | `collector.py` | суточные и недельный отчёты (только до `DONE`) |
| `/var/lib/codex-compaction-sobytiya/<агент>.jsonl` | `codex-compaction-vyborka` (пакет dsh-podpiski), root | события `codex_compacted` из журнала шлюза, root:coders 0640 |

## Установка

Пакет — исходники без `package.json`, ставится копированием (руками root; в бою — через `smontirovat-fajly` по воротам).

1. Каталог плагина: `install -d -o coders -g coders -m 0750 /opt/coders/alfa/plugins/dsh-compact-outcomes`.
2. Файлы `plugin/*`: `install -o coders -g coders -m <режим из таблицы> plugin/<файл> /opt/coders/alfa/plugins/dsh-compact-outcomes/<файл>`.
3. Юниты: `systemd/dsh-compact-outcomes.{service,timer}` в `/etc/systemd/system/`, оба drop-in — в `/etc/systemd/system/dsh-compact-outcomes.service.d/`, `0644 root:root`.
4. `systemctl daemon-reload`, `systemctl enable --now dsh-compact-outcomes.timer`. У службы нет `[Install]` (состояние `static`), включается только таймер.
5. Датчик подключается профилем агента, а не установкой файла. Блок `compact-outcomes-turns` под условием `@@ESLI COMPACT_OUTCOMES@@` в шаблоне `/etc/agent-registry/shablony-raskladki/codex/A.tmpl` задаёт `name: <дом>/plugins/dsh-compact-outcomes/turn-sensor.mjs` и `config` (см. «Настройка»). Новый профиль действует после подъёма процесса агента.

До первого запуска должны существовать:

- каталог состояния `/opt/coders/alfa/pamyat/compact-outcomes` и каталог отчётов `/opt/coders/alfa/a2a/out`, оба с записью для `coders`. Юнит открывает их на запись строкой `ReadWritePaths=` без приставки «-» (строка 17) при `ProtectSystem=strict` (строка 15) в `systemd/dsh-compact-outcomes.service`. Путь без «-» systemd обязан найти при старте, иначе служба не запустится. Поэтому оба каталога надо создать заранее, хотя `collector.py` сам вызывает `mkdir` для `--state-dir` (`plugin/collector.py`, строка 133). Каталога `--outbox` `collector.py` не создаёт: пока нет `DONE`, без него прогон падает с `outbox does not exist` (строка 149);
- файл `/var/log/agent-alert/poslednie.log` с 3.1.1 НЕ обязателен: drop-in `agent-alert.conf` открывает его с «-» (`ReadWritePaths=-…`, строка 6). Нет файла — служба всё равно поднимается, `agent-alert` пишет «хвост НЕ записан», а тревога уходит как прежде;
- `/usr/local/bin/agent-alert` и `/usr/local/libexec/codex-compaction-vyborka` (пакет dsh-podpiski).

Подкаталог `turns/` и файлы в нём создаёт датчик (`mkdirSync` с `recursive`, `plugin/turn-sensor.mjs`, строка 7).

## Настройка

### Аргументы `collector.py` (задаёт `ExecStart` юнита)

| аргумент | умолчание | в юните | смысл |
|---|---|---|---|
| `--config` | обязателен | `…/agents.json` | файл настройки |
| `--state-dir` | обязателен | `/opt/coders/alfa/pamyat/compact-outcomes` | состояние, `lock`, `DONE`, журнал тревог |
| `--outbox` | нет | `/opt/coders/alfa/a2a/out` | куда класть отчёты; без него отчёты не пишутся |
| `--turn-log-dir` | нет | `/opt/coders/alfa/pamyat/compact-outcomes/turns` | журналы датчика; без него монитор ходов не запускается |
| `--alert` | `/usr/local/bin/agent-alert` | — | программа доставки тревоги, текст — первым аргументом |
| `--drop-ratio` | `0.5` | — | падение считается, если `после < до × ratio`; допустимо `0 < ratio < 1` |

Юнит задаёт `Environment=PYTHONDONTWRITEBYTECODE=1`, `UMask=0077`, `TimeoutStartSec=90`. Сам код переменных окружения не читает.

### `agents.json`

| ключ | кто читает | смысл |
|---|---|---|
| `agents[].name` | `collector.py`, `turn_watch.py` | только имена из списка, зашитого в коде (`collector.py`, `turn_watch.py`), без повторов; иначе `ValueError` |
| `agents[].cwd` | `collector.py` | ожидаемый `cwd` в шапке журнала DSH (расхождение пишется в problems) |
| `agents[].dsh_dir` | `collector.py` | каталог сессий DSH; читается новейшее поколение `session[.vN].jsonl.zstd` |
| `agents[].codex_dir` | `collector.py` | каталог rollout Codex (`*-<uuid>.jsonl`) |
| `agents[].gateway_db` | `collector.py` | SQLite шлюза, таблица `sessions(kluch, sessionId)`, только чтение |
| `agents[].memory_db` | `collector.py` | SQLite памяти, `zapisi` с `klass='svodka-kompakcii'`, только чтение |
| `shlyuzy_bez_datchika[].name` | `turn_watch.py` | `[a-z]+`; не должен совпадать с агентом из `agents` (иначе двойная тревога) |
| `shlyuzy_bez_datchika[].unit` | `turn_watch.py` | `coder-gateway-<имя>.service` или `coder-gateway@<имя>.service` |
| `shlyuzy_bez_datchika[].fajl` | `turn_watch.py` | абсолютный путь файла выборки |

Имя и юнит для выборки журнала (root) задаются отдельно, в drop-in `codex-compaction-vyborka.conf`. Новый шлюз без датчика требует правки и drop-in, и `agents.json`.

### `config` датчика `turn-sensor.mjs` (в профиле агента)

| ключ | смысл |
|---|---|
| `agent` | имя из того же зашитого списка; иначе плагин бросает ошибку при установке |
| `logDir` | абсолютный путь каталога журналов (`…/pamyat/compact-outcomes/turns`) |
| `gatewayDb` | абсолютный путь SQLite шлюза (`/var/lib/coder-gateway-<имя>/sessii.db`) |
| `appDir` | каталог приложения DSH; из него берётся `@deepseek-ai/dsh-scope` |

Порог датчик берёт из ответа на событие `our/compaction-status` (его отвечает `dsh-pamyat-kompakt-dsh`): `modelPolicies[provider, model].thresholdRatio` важнее общего `thresholdRatio`. Окно модели — `llm.resolveModelInfo`, предел ожидания 1000 мс. Ответ должен быть ровно один.

### Постоянные в коде

| постоянная | значение | где |
|---|---|---|
| срок наблюдения | 7 суток от первого прогона, затем `DONE` | `collector.py` |
| отчёт за сутки | не раньше чем через 5 мин после конца суток UTC | `collector.py` |
| предел входа | 128 МиБ файл, 256 МиБ после распаковки | `collector.py` |
| журналы датчика и тревог | 8 МиБ + 5 архивов | `turn_watch.py`, `turn-sensor.mjs` |
| `SVEZHEST` | 600 с: файл выборки старше — слепота | `turn_watch.py` |
| доставка | ≤ 2 тревоги за прогон, 15 с на вызов, 3 попытки | `turn_watch.py` |
| `NEDOST_MAX` | 50 недоставленных в сводке, сверх — счёт «потеряно» | `turn_watch.py` |

## Проверка

Тесты не трогают бой: работают во временных каталогах и шлют тревоги в заглушку. Единственное исключение — `test_turn_sensor_sobytiya.mjs`: он загружает боевое ядро памяти (см. ниже). Запускать из каталога `plugin/` (или из установленного каталога под `coders`). Ключ `-B` нужен, чтобы не создавать `__pycache__`.

| команда | что проверяет | код возврата |
|---|---|---|
| `python3 -B -m unittest -v test_observer test_turn_watch` | классификатор, сбор с картой UUID, отчёты и `DONE`, порог падения, «платформа» без тревоги, повтор без повторной отправки, монитор после `DONE` | 0 — все прошли, 1 — есть падения |
| `node test_turn_sensor.mjs` | замер `totalTokens`, порог по общему `thresholdRatio` (0.9) из ответа `our/compaction-status` и окну модели, UUID из SQLite, одна строка на `turn/end` (повтор с тем же seq не пишется), `platform_seq` после `compaction/start`, ротация 8 МиБ + 5. Ветку `modelPolicies` тест не проверяет: в подставном ответе её нет | 0 — PASS, иначе исключение `assert` (≠0) |
| `node test_turn_sensor_sobytiya.mjs` | `platform_seq` на формах DSH 0.1.1 (`events`) и 0.2.0 (`snapshotEvents` через `ctx.pamyat`), строка пишется и без журнала | 0 — сошлось, 1 — расхождение, 2 — слепота (ядро не загрузилось или в нём нет `sobytiyaSessii`) |
| `python3 -B mutation_probe.py` | порча текста сводки переводит событие из `ours` в `unknown`, возврат восстанавливает | 0, при провале `AssertionError` (1) |

`test_turn_sensor_sobytiya.mjs` по умолчанию импортирует ядро из `/opt/agent-plugins/node_modules/dsh-pamyat-core`. Другой путь задаёт переменная `DSH_PAMYAT_CORE`. База ядра создаётся во временном каталоге. `test_observer.py` запускать только через `-m unittest`: прямой `python3 test_observer.py` выполнит лишь класс `Classification` (вызов `unittest.main()` стоит в середине файла).

В бою:

- `systemctl is-active dsh-compact-outcomes.timer` — проверка здоровья по реестру. Ещё смотреть `systemctl show dsh-compact-outcomes.service -p Result,ExecMainStatus`.
- Сумма каждого установленного файла равна сумме пакета (`sha256sum`), права — по таблице (`stat -c '%a %U:%G'`).
- Каждый прогон печатает в журнал службы JSON `{"turn_rows_new", "turn_log_problems", "pending_alerts"}`. Пока нет `DONE`, печатается ещё строка с `coverage` и `problems`.
- Коды `collector.py`: 0 — прогон прошёл (беды по агентам — в `problems`, код ими не меняется); 1 — исключение (занят `lock`, `unexpected agent`, `agent mismatch`, `turn log exceeds bound`, неверный `shlyuzy_bez_datchika`, каталог `--outbox` не существует); 2 — ошибка аргументов.

## Ограничения

- Недельный счёт разовый. После 7 суток пишется `DONE`, и `collector.py` больше не классифицирует и не шлёт отчёты; монитор ходов работает дальше. На рабочей машине `DONE` лежит с 25.09.2026, сейчас работает только монитор ходов. Новый запуск счёта — только явным решением; по коду для нового срока надо убрать и `DONE`, и `state.json`.
- Тревога «сжал Codex» по падению токенов — признак, а не доказательство. Текст тревоги прямо говорит, что `compacted` не подтверждён. Если между ходами сменился последний seq событий `compaction/*`, пишется запись «платформа» в `turn-alerts.jsonl` без тревоги. Ровно `ratio` (половина) не тревожит.
- Сравниваются только соседние ходы (`turn = прежний + 1`) одной сессии, `createdAt`, UUID, модели и окна. Пропущенный ход, смена UUID или ошибка замера разрывают сравнение.
- Датчик не оставляет строки, если процесс убит до `turn/end`. Ходы до подключения датчика задним числом не восстанавливаются.
- Канал шлюзов без датчика не ловит сжатие, о котором шлюз не написал `[codex-compaction]`. Первый прогон ставит курсор в конец файла, история не тревожит. Файл короче курсора — курсор в конец, пропущенное не читается.
- Слепота (`turn log missing`, файл выборки не читается или старше 600 с) даёт одну тревогу на вход и один отбой на выход. Не ловятся: недописанная последняя строка датчика, исключения монитора (падает весь прогон), смерть самой службы или таймера.
- Тревога, не доставленная за 3 попытки, уходит в сводку недоставленных (до 50, сверх — только счёт). Тревога о слепоте не копится: при живой слепоте ставится заново. Сбой между доставкой и сохранением даёт повтор один раз.
- В `agents` допустимы только три имени, зашитые в `collector.py`, `turn_watch.py` и `turn-sensor.mjs`. Новый агент с датчиком требует правки кода.
- Номер пакета — 1.2.2: заголовок `CHANGELOG.md` и метка `dsh-compact-outcomes-v<номер>` (`package.json` нет). Лицензия — MIT, файл `LICENSE`.
- Пакет не к публикации без отдельных ворот: `agents.json` раскрывает раскладку кодеров (пути сессий, `/var/lib/coder-gateway-*`).
- Зависимости: `python3`, `zstd` (распаковка журналов DSH), `node` с `node:sqlite` (датчик и его тесты), `@deepseek-ai/dsh-scope` из `appDir`, `dsh-pamyat-kompakt-dsh` (ответ на `our/compaction-status`), по желанию служба `pamyat` из `dsh-pamyat-core` (`sobytiyaSessii`, иначе `session.events`), `/usr/local/bin/agent-alert`, `/usr/local/libexec/codex-compaction-vyborka` (dsh-podpiski), учётка `coders`.
