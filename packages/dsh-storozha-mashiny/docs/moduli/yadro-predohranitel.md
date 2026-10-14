# yadro-predohranitel — предохранитель первой загрузки нового ядра · new-kernel first-boot fuse

Защищает от потери машины при первой загрузке в новое ядро: если в целевом ядре за 10 минут не загрузился модуль туннелей `amneziawg` или не отвечает контрольный адрес, предохранитель перезагружает машину в рабочее ядро (`saved_entry` GRUB). Срабатывает один раз: метка снимается ДО перезагрузки.

Protects against losing a machine on the first boot into a new kernel: if within 10 minutes the `amneziawg` tunnel module is not loaded or the probe address does not answer, the fuse reboots into the working kernel (GRUB `saved_entry`). It fires once: the marker is removed BEFORE rebooting.

## Файлы · Files

| Файл · File | Что это · What |
|---|---|
| `bin/yadro-predohranitel` | сам предохранитель (root) · the fuse (root) |
| `systemd/yadro-predohranitel.service` | разовый запуск при загрузке, только если взведён (`ConditionPathExists=`) · oneshot at boot, only when armed |
| `test/stend-yadro-predohranitel.sh` | стенд в отдельном пространстве монтирования (нужен sudo) · stand in a separate mount namespace (needs sudo) |

## Как пользоваться · How to use

1. Сделать текущее рабочее ядро сохранённым выбором GRUB (`grub-set-default` / `GRUB_DEFAULT=saved`), а новое загрузить разово (`grub-reboot`).
2. Взвести: `echo <версия-нового-ядра> > /var/lib/yadro-predohranitel/armed` (как в `uname -r`).
3. `systemctl enable yadro-predohranitel.service`, задать `YP_TARGET_IP` в drop-in, перезагрузиться.

1. Make the current working kernel GRUB's saved choice and boot the new one once (`grub-reboot`).
2. Arm: write the new kernel version (as in `uname -r`) into `/var/lib/yadro-predohranitel/armed`.
3. Enable the unit, set `YP_TARGET_IP` in a drop-in, reboot.

После загрузки: метки нет — код 0. Пустая метка — снята, код 2; чужое ядро и метка старше загрузки — снята, код 2; чужое ядро и метка этой загрузки — ожидание будущей перезагрузки, код 0. Время загрузки/метки не добыто — метка сохранена, код 2. Ядро совпало: до 60 попыток с паузой 10 с — модуль загружен И адрес отвечает на ping → «ЗЕЛЕНО», метка снята. Иначе → «КРАСНО», метка снята, `systemctl reboot` (или код 1 при `YP_DRY`).

After boot: no marker — exit 0. Empty marker — removed, exit 2; other kernel and a marker older than boot — removed, exit 2; other kernel with a marker from this boot — wait for the future reboot, exit 0. Unavailable boot/marker time — marker retained, exit 2. Matching kernel: up to 60 attempts 10 s apart — module loaded AND probe answers ping → GREEN, marker removed. Otherwise → RED, marker removed, `systemctl reboot` (or exit 1 with `YP_DRY`).

## Настройки · Settings

| Имя · Name | Тип · Type | Умолчание · Default | Смысл · Meaning | Пример · Example | Если неверно · If wrong |
|---|---|---|---|---|---|
| `YP_TARGET_IP` | адрес · address | пусто — предохранитель не действует · empty = inactive | адрес, обязанный отвечать на ping после подъёма туннеля (например, mesh-сосед) · address that must answer ping once the tunnel is up | `192.0.2.10` | пусто → «не задан», код 2, метка цела, перезагрузки нет; адрес, недостижимый и в исправном ядре → ЛОЖНЫЙ откат через 10 минут · empty → exit 2, no action; an address unreachable even in a good kernel → FALSE fallback after 10 minutes |
| `YP_DRY` | флаг · flag | пусто · empty | пробный прогон: всё, кроме перезагрузки, код 1 · dry run | `1` | — |

Путь метки прибит в коде: `/var/lib/yadro-predohranitel/armed`. Модуль проверяется по имени `amneziawg` (строка `lsmod`).

The marker path is fixed in code: `/var/lib/yadro-predohranitel/armed`. The module is checked by the name `amneziawg` (`lsmod` line).

## Что ловит и чего НЕ ловит · What it catches and what it does NOT

Ловит: новое ядро, в котором не загрузился модуль туннелей или не поднялась сеть до контрольного адреса.

Catches: a new kernel in which the tunnel module did not load or the network to the probe address did not come up.

НЕ ловит: зависание до userspace без паники (частично помогает `panic=10` в командной строке ядра); порчу GPU и служб при живой сети; ядро, загруженное не через `saved_entry`-схему (откат вернёт туда, куда указывает сохранённый выбор GRUB, — проверьте его ДО взвода). Пустая метка и метка другого ядра, оставшаяся с прежней загрузки, снимаются с кодом 2; взвод в текущей загрузке ждёт перезагрузки.

Does NOT catch: a hang before userspace without a panic (`panic=10` on the kernel cmdline helps partly); broken GPU or services while the network works; boots not using the `saved_entry` scheme (the fallback goes wherever GRUB's saved choice points — check it BEFORE arming). An empty marker or an other-kernel marker left from a previous boot is removed with exit 2; a marker armed in the current boot waits for reboot.

## Куда кричит · Where it alerts

Никуда, кроме stdout (журнал юнита). Тревоги в канал нет: в момент срабатывания сети, скорее всего, нет.

Nowhere but stdout (the unit journal). No channel alert: at the moment it fires there is most likely no network.

## Коды выхода · Exit codes

| Код · Code | Значение · Meaning |
|---|---|
| 0 | не взведён / не то ядро / ЗЕЛЕНО (или перезагрузка запущена) · not armed / other kernel / GREEN (or reboot started) |
| 1 | КРАСНО при `YP_DRY` · RED with `YP_DRY` |
| 2 | `YP_TARGET_IP` не задан — не действует; или (с 1.0.1) метка пуста, или взведена на другое ядро ДО этой загрузки — снята · not configured; or (since 1.0.1) the marker was empty, or armed for another kernel BEFORE this boot — removed |
