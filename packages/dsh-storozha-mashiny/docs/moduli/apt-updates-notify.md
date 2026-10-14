# apt-updates-notify.sh — уведомление об обновлениях apt · apt pending-updates notifier

Раз в сутки читает уже скачанные списки apt и говорит человеку, что ждёт установки. НИЧЕГО не ставит и не скачивает. Нужен там, где автоматическая установка обновлений выключена намеренно: выключенная защита без замены отказывает молча.

Once a day it reads the already downloaded apt lists and tells a human what is waiting to be installed. It installs and downloads NOTHING. Meant for machines where automatic installation is deliberately off: a protection switched off without a replacement fails silently.

## Файлы · Files

| Файл · File | Что это · What |
|---|---|
| `bin/apt-updates-notify.sh` | сам механизм · the tool |
| `systemd/apt-updates-notify.service` | разовый запуск от непривилегированной учётки, `StateDirectory=apt-updates-notify` · oneshot as an unprivileged account |
| `systemd/apt-updates-notify.timer` | ежедневно в 07:35 UTC, `Persistent=true` · daily at 07:35 UTC |
| `test/stend-apt-notify.sh` | приёмочный стенд, 21 проверка · acceptance stand, 21 checks; запускать не от root: проба отказа прав требует непривилегированной учётки, под root пропуск и код 2 · run as non-root: the permission-denial probe needs an unprivileged account; root skips it and exits 2 |

## Как работает · How it works

Три замера: `apt-check` (сколько применится немедленно и сколько из них по безопасности; печатает `N;M` в stderr), `apt list --upgradable` (полный список, включая отложенные поэтапным раскатом; ветка безопасности — по имени набора `*-security`), и возраст отметки обновления списков. Протухшие списки — главная беда: они дают уверенное «обновлений нет».

Three measurements: `apt-check` (how many apply immediately, how many are security; prints `N;M` to stderr), `apt list --upgradable` (the full list, including phased packages; the security pocket is found by suite name `*-security`), and the age of the list-refresh stamp. Stale lists are the main danger: they give a confident "no updates".

Поводы сказать человеку: первый запуск («заведено»), слепота, протухшие списки, есть немедленные или security-обновления (каждые сутки, без окна тишины — это долг), перерыв между прогонами ≥ 2 суток, и «жив» раз в `HEARTBEAT_DAYS` суток молчания. Отложенные раскатом сами по себе не будят.

Reasons to tell a human: first run ("set up"), blindness, stale lists, immediate or security updates pending (every day, no quiet window — it is a debt), a gap between runs ≥ 2 days, and "alive" after `HEARTBEAT_DAYS` days of silence. Phased packages alone do not wake anyone.

Отметки (`last-run.stamp`, `last-spoke.stamp`, `last-verdict`) лежат в `APTUN_STATE`. `last-spoke` ставится ТОЛЬКО после подтверждённой доставки.

Stamps (`last-run.stamp`, `last-spoke.stamp`, `last-verdict`) live in `APTUN_STATE`. `last-spoke` is set ONLY after confirmed delivery.

## Настройки · Settings

Все — переменные окружения; файл `APTUN_CONF` (shell) может их перекрыть.

All are environment variables; the `APTUN_CONF` file (shell) may override them.

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Если неверно · If wrong |
|---|---|---|---|---|
| `APTUN_CONF` | путь · path | `/etc/apt-updates-notify/apt-updates-notify.conf` | необязательный файл настройки · optional settings file | нет файла — работает на умолчаниях · missing → defaults |
| `APTUN_STATE` | каталог · dir | `/var/lib/apt-updates-notify` | отметки · stamps | нет прав на запись → СЛЕПОТА, код 2 · not writable → BLINDNESS, exit 2 |
| `APTUN_ALERT` | путь · path | `/usr/local/bin/agent-alert` | канал тревоги · alert command | нет файла → «человеку НЕ сказано», код 2 · missing → exit 2 |
| `CHECK_CMD` | команда · cmd | `/usr/lib/update-notifier/apt-check` | счёт немедленных · immediate count | непонятный вывод → СЛЕПОТА · unknown output → BLINDNESS |
| `LIST_CMD` | команда · cmd | `apt list --upgradable` | полный список · full list | нет строки `Listing` → СЛЕПОТА · no `Listing` line → BLINDNESS |
| `STAMP_FILE` | путь · path | `/var/lib/apt/periodic/update-success-stamp` | отметка обновления списков · list-refresh stamp | нечитаема → СЛЕПОТА · unreadable → BLINDNESS |
| `STALE_DAYS` | целое, сут · int | `3` | старше — «СПИСКИ ПРОТУХЛИ» · older → stale | — |
| `HEARTBEAT_DAYS` | целое, сут · int | `7` | молчал столько — сказать «жив» · silent this long → "alive" | — |
| `RAW_LINES` / `RAW_CHARS` | целое · int | `12` / `200` | обрезка сырья в сообщении · raw output trimming | — |

Учётка юнита: в пакете `User=nobody`, `Group=nogroup` — читать списки этого хватает, но каналу тревоги обычно нужна учётка с доступом к токену (через группу). Задайте свою в drop-in: `apt-updates-notify.service.d/50-<host>.conf` с `User=` и `Group=`. Root не нужен и не рекомендуется.

Unit account: the package ships `User=nobody`, `Group=nogroup` — enough to read the lists, but the alert channel usually needs an account with token access (via a group). Set yours in a drop-in with `User=` and `Group=`. Root is neither needed nor recommended.

## Что ловит и чего НЕ ловит · What it catches and what it does NOT

Ловит: ожидающие обновления (немедленные и security, включая security среди отложенных); протухшие списки; собственную слепоту; собственный перерыв (сообщением при следующем запуске); недоставку тревоги (код 2).

Catches: pending updates (immediate and security, including security among phased ones); stale lists; its own blindness; its own gap (reported on the next run); failed alert delivery (exit 2).

НЕ ловит: уязвимости без выпущенного пакета; обновления вне apt (npm, pypi, плагины); обновления ESM без подписки; собственную смерть — за таймером должен следить сторож машины (`agent-watchdog.sh`, элемент `apt-updates-notify.timer` в `SERVICES`); «таймер числится active, но не срабатывает» — виден только как перерыв ПОСЛЕ запуска. Не отличает важное от пустяка.

Does NOT catch: vulnerabilities without a released package; updates outside apt (npm, pypi, plugins); ESM updates without a subscription; its own death — the machine watchdog must watch its timer (`agent-watchdog.sh`, item `apt-updates-notify.timer` in `SERVICES`); "timer listed active but never fires" — visible only as a gap AFTER a run. Does not tell important from trivial.

## Куда кричит · Where it alerts

В `APTUN_ALERT` (HTML-разметка Telegram, экранирование встроено). Вердикт и сырьё — в stdout, то есть в журнал юнита.

To `APTUN_ALERT` (Telegram HTML markup, escaping built in). Verdict and raw data go to stdout, i.e. the unit journal.

## Коды выхода · Exit codes

| Код · Code | Значение · Meaning |
|---|---|
| 0 | измерено (обновления есть или нет) · measured |
| 1 | СПИСКИ ПРОТУХЛИ · lists stale |
| 2 | СЛЕПОТА: не измерено, или человеку не сказано · BLINDNESS: not measured, or human not told |
