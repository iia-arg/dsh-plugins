# dkms-kernel-coverage-check.sh — покрытие ядер DKMS-модулем · DKMS kernel coverage check

Проверяет, собран ли DKMS-модуль (на машине-образце — модуль VPN-туннелей AmneziaWG) для ВСЕХ установленных ядер, а не только для текущего. Не хватает — сам ставит заголовки ядра и делает `dkms install`, затем сообщает. Не смог — тревога «перезагружать нельзя».

Checks that a DKMS module (on the reference machine — the AmneziaWG VPN tunnel module) is built for ALL installed kernels, not only the running one. If something is missing it installs kernel headers and runs `dkms install` itself, then reports. If it cannot — alert "do not reboot".

## Зачем · Why

Обновление пакета `*-dkms` пересобирает модуль только под текущее ядро и молча теряет остальные (наблюдалось на двух машинах сразу после `apt upgrade`). Загрузчик с `GRUB_DEFAULT=saved` может выбрать другое ядро; без модуля туннели не поднимутся, и машина, у которой весь исходящий трафик идёт через туннель, останется без связи. Так однажды был потерян сервер.

Updating a `*-dkms` package rebuilds the module only for the running kernel and silently loses the others (seen on two machines right after `apt upgrade`). A boot loader with `GRUB_DEFAULT=saved` may pick another kernel; without the module the tunnels do not come up, and a machine routing all outbound traffic through the tunnel loses connectivity. A server was once lost this way.

Это осознанное исключение из правила «сторож не чинит»: починка здесь механическая и безопасная, а цена промедления — потеря машины при следующей перезагрузке.

This is a deliberate exception to "a watchdog does not repair": the repair is mechanical and safe, and the cost of waiting is losing the machine at the next reboot.

## Файлы · Files

| Файл · File | Что это · What |
|---|---|
| `bin/dkms-kernel-coverage-check.sh` | проверка (root: `apt-get install`, `dkms install`) · the check (root) |
| `systemd/dkms-kernel-coverage.service` | разовый запуск от root · oneshot as root |
| `systemd/dkms-kernel-coverage.timer` | ежедневно и через 5 минут после загрузки · daily and 5 min after boot |
| `test/stend-dkms-kernel-coverage.sh` | стенд на заглушках: исправное → порча → снятие, плюс «без настройки» · stub stand |

## Настройки · Settings

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `DKMS_COVERAGE_MODULE` | строка · string | пусто — НЕ НАСТРОЕНО, код 2 · empty = NOT CONFIGURED, exit 2 | имя модуля в `dkms status` · module name in `dkms status` | `amneziawg` | пусто → stderr «НЕ НАСТРОЕНО: … не задан — покрытие ядер модулем НЕ проверяется», код 2 (юнит failed); опечатка → `dkms status` не найдёт модуль, слепота, код 2 · empty → "НЕ НАСТРОЕНО", exit 2 (unit failed); typo → module unknown to `dkms status`, blindness, exit 2 |
| `DKMS_COVERAGE_ALERT_FALLBACK` | имя команды · command name | `agent-alert` | запасное имя канала, если `agent-alert` нет в PATH · fallback alert name | `legacy-alert` | нет ни одного → тревога не уходит, остаётся только строка `logger` · neither found → no alert, only the `logger` line |

Задаются в drop-in юнита: `dkms-kernel-coverage.service.d/50-<host>.conf`, строки `Environment=`.

Set them in a unit drop-in with `Environment=` lines.

## Что ловит и чего НЕ ловит · What it catches and what it does NOT

Ловит: установленное ядро (пакет `linux-image-<версия>`), для которого модуль текущей версии не в состоянии `installed`; чинит его и говорит, что починил; не смог — тревога и код 1.

Catches: an installed kernel (package `linux-image-<version>`) for which the current module version is not `installed`; repairs it and says so; repair failed — alert and exit 1.

НЕ ловит: загрузку модуля на деле (это `yadro-predohranitel`); ядра не из пакетов `linux-image-<цифра>…`. Пустой ответ `dpkg-query`/`dkms status` — слепота, код 2. Канал выбирается по имени в PATH, не по сумме; отказ доставки печатается «НЕ доставлена», но код остаётся итогом ремонта (0 или 1), отдельного кода доставки нет.

Does NOT catch: actual module loading (`yadro-predohranitel`); kernels outside `linux-image-<digit>…` packages. An empty `dpkg-query`/`dkms status` answer gives blindness, exit 2. The channel is chosen by PATH name, not checksum; delivery failure prints "НЕ доставлена", but the exit code remains the repair outcome (0 or 1), with no separate delivery code.

Текст тревоги говорит о «модуле туннелей» и `amneziawg-dkms` — он написан под машину-образец; для другого модуля смысл тот же, но слова надо читать с поправкой.

The alert text speaks of "the tunnel module" and `amneziawg-dkms` — written for the reference machine; for another module the meaning is the same but read the wording accordingly.

## Куда кричит · Where it alerts

В `agent-alert` (или запасное имя), плюс строка в журнал `logger -t dkms-coverage` (`FAILED: …` или `auto-fixed: …`). Переводы строк — настоящие (с 1.0.1; прежде `%0A`, который канал показывал буквально).

To `agent-alert` (or the fallback name), plus a journal line `logger -t dkms-coverage` (`FAILED: …` or `auto-fixed: …`). Line breaks are real newlines (since 1.0.1; before, a literal `%0A`).

## Коды выхода · Exit codes

| Код · Code | Значение · Meaning |
|---|---|
| 0 | всё покрыто или починено · covered or repaired |
| 2 | НЕ НАСТРОЕНО: модуль не задан; или (с 1.0.1) СЛЕПОТА: `dpkg-query` не назвал ядер или `dkms status` не знает модуля · NOT CONFIGURED; or (since 1.0.1) BLINDNESS: no kernels from `dpkg-query` or module unknown to `dkms status` |
| 1 | хотя бы одно ядро починить не удалось — НЕ ПЕРЕЗАГРУЖАТЬ · at least one kernel could not be repaired — DO NOT REBOOT |
