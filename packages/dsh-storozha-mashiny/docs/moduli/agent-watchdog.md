# agent-watchdog.sh — сторож машины · machine watchdog

Сторож машины с агентами: раз в пять минут проверяет то, что ломается молча (службы и таймеры, свежесть разовых служб, живость сервиса памяти, место на дисках), и зовёт человека через канал тревоги. Сам ничего не чинит.

A watchdog for a machine that runs agents: every five minutes it checks what breaks silently (units and timers, freshness of oneshot units, liveness of the memory service, disk space) and calls a human through the alert channel. It repairs nothing itself.

## Файлы · Files

| Файл · File | Что это · What |
|---|---|
| `bin/agent-watchdog.sh` | сам сторож · the watchdog |
| `systemd/agent-watchdog.service` | разовый запуск (`Type=oneshot`) · oneshot unit |
| `systemd/agent-watchdog.service.d/10-locale.conf` | `LC_ALL=C.UTF-8` — без неё обрезка текста режет кириллицу по байтам · without it text trimming cuts Cyrillic by bytes |
| `systemd/agent-watchdog.timer` (+ `.timer.d/10-calendar.conf`) | каждые 5 минут, плюс календарная страховка от «повисшего» таймера · every 5 minutes, plus a calendar trigger against a stuck timer |
| `test/stend-agent-watchdog.sh` | стенд: исправное → порча → снятие порчи, плюс «без настройки» · stand: healthy → fault → fault removed, plus "no settings" |

## Как работает · How it works

Сторож читает файл настройки (shell-синтаксис, переменные ниже) и проходит три блока. Службы: для обычного элемента спрашивает у systemd `is-active`; для элемента вида `юнит:часы` смотрит журнал systemd и судит о свежести последнего успешного запуска разовой службы. Память: делает HTTP-запрос и ждёт в ответе `"status":"ok"`. Диски: считает долю свободного места через `df`.

The watchdog reads a settings file (shell syntax, variables below) and runs three blocks. Units: for a plain item it asks systemd `is-active`; for an item of the form `unit:hours` it reads the systemd journal and judges the freshness of the last successful run of a oneshot unit. Memory: an HTTP request that must contain `"status":"ok"`. Disks: the free-space share via `df`.

На каждую беду — своё окно тишины (`COOLDOWN_MIN`): одна и та же тревога не повторяется чаще. Отметка окна ставится только после подтверждённой отправки: недоставленная тревога повторится в следующий заход, а не замолчит.

Every problem has its own quiet window (`COOLDOWN_MIN`): the same alert is not repeated more often. The window stamp is set only after a confirmed send: an undelivered alert repeats on the next run instead of going silent.

Если источник данных не ответил (журнал не читается, `df` упал или выдал непонятное), это не «чисто», а СЛЕПОТА: строка в stderr и в журнал (`logger -t agent-watchdog`), итоговый код 2.

If a data source fails (journal unreadable, `df` failed or returned garbage), that is not "clean" but BLINDNESS: a line to stderr and to the journal (`logger -t agent-watchdog`), final exit code 2.

## Настройки · Settings

Переменные окружения (задаются в юните или drop-in):

Environment variables (set in the unit or a drop-in):

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `WATCHDOG_CONF` | путь · path | `/etc/dsh-storozha-mashiny/agent-watchdog.conf` | файл настройки · settings file | `/etc/dsh-storozha-mashiny/agent-watchdog.conf` | файла нет → «настройки нет» в stderr, место на `/` меряется, проход завершается кодом 2 «проверка неполна» (юнит failed) · missing → "настройки нет" on stderr, `/` free space still checked, the pass exits 2 "проверка неполна" (unit failed) |
| `WATCHDOG_STATE` | каталог · dir | `/var/lib/machine-watchdog` | отметки окон тишины · quiet-window stamps | `/var/lib/machine-watchdog` | нет прав на запись → окно тишины не работает, тревоги повторяются каждый заход · not writable → no quiet window, alerts repeat every run |
| `WATCHDOG_ALERT` | путь · path | `/usr/local/bin/agent-alert` | команда канала тревоги, текст — первым аргументом (HTML) · alert command, text as first argument (HTML) | `/usr/local/bin/agent-alert` | нет файла → в stdout «нет помощника… тревога НЕ отправлена», код 3, юнит failed; отказ доставки — также код 3, окно тишины не ставится · missing → "нет помощника" on stdout, exit 3, unit failed; failed delivery also exits 3 without setting the quiet window |

Переменные файла настройки:

Settings-file variables:

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `SERVICES` | список через пробел · space list | пусто · empty | юниты для `is-active`; элемент `юнит:часы` — свежесть разовой службы · units for `is-active`; `unit:hours` — oneshot freshness | `"nginx.service backup.timer backup.service:26"` | опечатка в имени → тревога «служба в состоянии inactive/unknown»; часы не целое ≥1 → тревога «элемент негоден» · typo → alert "inactive/unknown"; bad hours → "item invalid" alert |
| `MEMORY_HEALTH_URL` | URL | пусто — не проверять · empty = skip | адрес проверки живости · health URL | `http://127.0.0.1:8377/health` | неверный адрес → тревога «память не отвечает» каждые `COOLDOWN_MIN` · wrong URL → "memory not answering" alert |
| `DISK_PATHS` | список путей · path list | `/` | где смотреть место · where to check space | `"/ /var /opt"` | несуществующий путь → СЛЕПОТА, код 2 · nonexistent path → BLINDNESS, exit 2 |
| `DISK_MIN_FREE_PCT` | целое, % · int | `10` | ниже — тревога · below → alert | `10` | — |
| `COOLDOWN_MIN` | целое, мин · int | `30` | окно тишины на одну беду · quiet window | `30` | 0 → тревога каждые 5 минут · 0 → alert every 5 minutes |

## Что ловит и чего НЕ ловит · What it catches and what it does NOT

Ловит: службу не в `active`; разовую службу, у которой последний запуск завершился не `done` («ПАДАЕТ»); разовую службу, не завершавшуюся успешно дольше срока («НЕ СРАБАТЫВАЛ»); неответ сервиса памяти; нехватку места; собственную слепоту (код 2).

Catches: a unit not `active`; a oneshot unit whose last run did not end `done` ("FAILING"); a oneshot unit with no successful run within the limit ("NOT RUNNING"); a memory service not answering; low disk space; its own blindness (exit 2).

НЕ ловит: успешный по коду запуск, который ничего не проверил; «юнит:часы» для `simple`/`forking` (там `done` ставится на старте — мерится не то); журнал, обрезанный ротацией до последнего запуска (даст громкое «не срабатывал», не тихое); собственную смерть — сторожа сторожит кто-то другой (например, сторож реестров по взаимному наблюдению). Без файла настройки службы и память не наблюдаются вовсе.

Does NOT catch: a run that succeeded by exit code but checked nothing; `unit:hours` for `simple`/`forking` units (`done` is recorded at start); a journal rotated past the last run (gives a loud "not running", not a silent pass); its own death — someone else must watch the watchdog (e.g. a registry watchdog in mutual observation). Without a settings file units and memory are not watched at all.

## Куда кричит · Where it alerts

В команду `WATCHDOG_ALERT` (по умолчанию `agent-alert` из пакета тревог), текст с HTML-разметкой Telegram (экранирование `&`, `<`, `>` встроено). Слепота — ещё и в журнал с тегом `agent-watchdog`.

To the `WATCHDOG_ALERT` command (default: `agent-alert` from the alerts package), text with Telegram HTML markup (`&`, `<`, `>` escaping built in). Blindness also goes to the journal with tag `agent-watchdog`.

## Коды выхода · Exit codes

| Код · Code | Значение · Meaning |
|---|---|
| 0 | проверено; известные проблемы доставлены либо их окно тишины ещё не вышло · checked; known problems delivered or still within their quiet window |
| 2 | часть предметов не измерена (СЛЕПОТА) · some subjects not measured (BLINDNESS) |
| 3 | (с 1.0.1) тревога не доставлена или помощника нет — юнит failed, беду увидит соседний сторож · (since 1.0.1) alert not delivered or helper missing — unit failed |

При отсутствии помощника или отказе доставки — код 3 и строка «🔴 … НЕ отправлена / НЕ доставлена» в stdout; отметка окна тишины не ставится, следующий прогон повторит попытку.

A missing helper or failed delivery gives exit 3 and a "🔴 … НЕ отправлена / НЕ доставлена" line on stdout; no quiet-window stamp is written, so the next run retries.

## Стенд · Stand

`test/stend-agent-watchdog.sh` — без root, всё подставное (logger, systemctl, journalctl, curl, df, du — заглушки первыми в PATH, со сверкой перед пробами). Охват: исправное, служба не active, возврат в норму, отсутствие настройки, отсутствие помощника и отказ доставки (6 проб). Свежесть, память, нехватка места и окно тишины этим стендом не проверяются.

`test/stend-agent-watchdog.sh` — no root, everything faked (logger, systemctl, journalctl, curl, df, du are stubs first in PATH, verified before probing). Coverage: healthy, unit not active, recovery, no settings, missing helper, and failed delivery (6 probes). Freshness, memory, low disk space, and the quiet window are not covered by this stand.
