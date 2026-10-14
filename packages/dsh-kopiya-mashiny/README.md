Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-kopiya-mashiny — копия машины sadik, её приёмка и сторожа

**Версия:** 3.1.2

Служебный софт sadik: ночная копия машины (`sadik-backup.py`, узкий путь выгрузки через NL), приёмка копии по
расписанию действием (скачать обратно и проверить), сторожа покрытия и размера копии, копия базы OMEGA, тревога об
упавшем юните копии. Каждый юнит копии имеет читателя отказа `*-failed.service` → `kopiya-upala`.

Пакет служебный (группа Д): публикуется исходниками, без npm, после общих ворот секретов (`vorota-obezlichivaniya`).
Адреса, пути и имена машины sadik (узкий путь выгрузки через NL, каталоги копии) зашиты в коде умолчаниями; что из них
переопределяется средой — в разделе «Настройка».

**Временное правило (Вениамин, 07.10.2026):** пока у новых пакетов нет читателя «бой ↔ метка», любой файл пакета
меняется только вместе с новым номером пакета в том же окне.

Пакет — исходники без `package.json`: `sbin/` повторяет пути под `/usr/local/`, юниты и drop-in — в `systemd/`
(пути под `/etc/systemd/system/`). Номер — заголовок CHANGELOG и метка `dsh-kopiya-mashiny-v<номер>`.
При переносе с боя (07.10.2026) сумма каждого файла в дереве была равна сумме боя. Дальше дерево может опережать бой:
правка входит в дерево коммитом, а в бой — монтажом в окне; какие файлы и в каком номере изменены — в `CHANGELOG.md`.
Поэтому бой сверяют с меткой смонтированного номера, а не с головой дерева.

**Сверх плана Зари (b9822ac4 §2.3):** четыре drop-in `backup-verify.service.d/` (`pamyat.conf` MemoryHigh=2G,
`srok-potolok.conf` потолок 3 ч, `tolko-1.conf`, `zz-itogi-priyomki.conf` — сброс SuccessExitStatus). План брал
drop-in по ссылке на `/usr/local`, эти на неё не ссылаются; без них пакет не воспроизводит поведение `backup-verify`.

## Файлы

git хранит только признак «исполняемый», поэтому режим и владелец на диске — в таблице (снято `stat` боя 07.10.2026).

| файл в пакете | путь на диске | кто зовёт | режим | владелец:группа |
|---|---|---|---|---|
| `sbin/sadik-backup.py` | `/usr/local/sbin/sadik-backup.py` | sadik-backup.service ← .timer 03:00 UTC; читают proverka-svezhesti-kopii.sh, razmer-kopii-watch | 755 | root:root |
| `sbin/kopiya-put-nl` | `/usr/local/sbin/kopiya-put-nl` | drop-in sadik-backup.service.d/30-put-nl.conf (ExecStartPre … up) | 755 | root:root |
| `sbin/kopiya-upala` | `/usr/local/sbin/kopiya-upala` | *-failed.service через OnFailure= (sadik-backup, backup-verify, omega-db-backup, receipt-watch) | 755 | root:root |
| `sbin/proverka-kopii.sh` | `/usr/local/sbin/proverka-kopii.sh` | proverka-svezhesti-kopii.sh (PRIYOMKA_BIN), razmer-kopii-watch; рука | 755 | root:root |
| `sbin/proverka-otmetki-priyomki.sh` | `/usr/local/sbin/proverka-otmetki-priyomki.sh` | healthcheck записи `proverka-otmetki-priyomki` в `/etc/agent-registry/plugins.yaml`; своего юнита и таймера нет | 755 | root:root |
| `sbin/proverka-svezhesti-kopii.sh` | `/usr/local/sbin/proverka-svezhesti-kopii.sh` | backup-verify.service ← .timer 06:15 UTC | 755 | root:root |
| `sbin/razmer-kopii-watch` | `/usr/local/sbin/razmer-kopii-watch` | razmer-kopii-watch.service ← .timer 06:45 UTC | 755 | root:root |
| `sbin/backup-coverage-watch` | `/usr/local/sbin/backup-coverage-watch` | backup-coverage-watch.service (User=iskra) ← .timer *:35 UTC | 755 | root:root |
| `sbin/omega-db-backup.sh` | `/usr/local/sbin/omega-db-backup.sh` | omega-db-backup.service ← .timer 00,06,12,18:20 | 755 | root:root |
| `systemd/backup-coverage-watch.service` | `/etc/systemd/system/backup-coverage-watch.service` | свой .timer | 644 | root:root |
| `systemd/backup-coverage-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/backup-coverage-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in к юниту) | 644 | root:root |
| `systemd/backup-coverage-watch.timer` | `/etc/systemd/system/backup-coverage-watch.timer` | systemd (включён) | 644 | root:root |
| `systemd/backup-verify-failed.service` | `/etc/systemd/system/backup-verify-failed.service` | OnFailure= своего юнита | 644 | root:root |
| `systemd/backup-verify.service` | `/etc/systemd/system/backup-verify.service` | свой .timer | 644 | root:root |
| `systemd/backup-verify.timer` | `/etc/systemd/system/backup-verify.timer` | systemd (включён) | 644 | root:root |
| `systemd/omega-db-backup-failed.service` | `/etc/systemd/system/omega-db-backup-failed.service` | OnFailure= своего юнита | 644 | root:root |
| `systemd/omega-db-backup.service` | `/etc/systemd/system/omega-db-backup.service` | свой .timer | 644 | root:root |
| `systemd/omega-db-backup.timer` | `/etc/systemd/system/omega-db-backup.timer` | systemd (включён) | 644 | root:root |
| `systemd/razmer-kopii-watch.service` | `/etc/systemd/system/razmer-kopii-watch.service` | свой .timer | 644 | root:root |
| `systemd/razmer-kopii-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/razmer-kopii-watch.service.d/60-python-padenie-70.conf` | systemd (drop-in к юниту) | 644 | root:root |
| `systemd/razmer-kopii-watch.timer` | `/etc/systemd/system/razmer-kopii-watch.timer` | systemd (включён) | 644 | root:root |
| `systemd/receipt-watch-failed.service` | `/etc/systemd/system/receipt-watch-failed.service` | OnFailure= своего юнита | 644 | root:root |
| `systemd/sadik-backup-failed.service` | `/etc/systemd/system/sadik-backup-failed.service` | OnFailure= своего юнита | 644 | root:root |
| `systemd/sadik-backup.service` | `/etc/systemd/system/sadik-backup.service` | свой .timer | 644 | root:root |
| `systemd/sadik-backup.service.d/20-hranenie-2.conf` | `/etc/systemd/system/sadik-backup.service.d/20-hranenie-2.conf` | systemd (drop-in к юниту) | 644 | root:root |
| `systemd/sadik-backup.service.d/30-put-nl.conf` | `/etc/systemd/system/sadik-backup.service.d/30-put-nl.conf` | systemd (drop-in к юниту) | 644 | root:root |
| `systemd/sadik-backup.timer` | `/etc/systemd/system/sadik-backup.timer` | systemd (включён) | 644 | root:root |
| `systemd/backup-verify.service.d/pamyat.conf` | `/etc/systemd/system/backup-verify.service.d/pamyat.conf` | drop-in к backup-verify.service (вне плана Зари — см. ниже) | 644 | root:root |
| `systemd/backup-verify.service.d/srok-potolok.conf` | `/etc/systemd/system/backup-verify.service.d/srok-potolok.conf` | drop-in к backup-verify.service (вне плана Зари — см. ниже) | 644 | root:root |
| `systemd/backup-verify.service.d/tolko-1.conf` | `/etc/systemd/system/backup-verify.service.d/tolko-1.conf` | drop-in к backup-verify.service (вне плана Зари — см. ниже) | 644 | root:root |
| `systemd/backup-verify.service.d/zz-itogi-priyomki.conf` | `/etc/systemd/system/backup-verify.service.d/zz-itogi-priyomki.conf` | drop-in к backup-verify.service (вне плана Зари — см. ниже) | 644 | root:root |

`README.md`, `README.en.md`, `CHANGELOG.md` и `LICENSE` на машину не ставятся.

Назначение файлов:
- `sadik-backup.py` — сборщик копии машины; хранение — drop-in `20-hranenie-2.conf` (`BACKUP_RETAIN_LOCAL=2`).
- `kopiya-put-nl` — узкий путь выгрузки копии через awg0 (NL), B-N-762.
- `proverka-svezhesti-kopii.sh` — приёмка по расписанию: скачать уехавшее и проверить; зовёт `proverka-kopii.sh`.
- `proverka-kopii.sh` — приёмка копии действием, а не сверкой списков.
- `proverka-otmetki-priyomki.sh` — сторож отметки приёмки («проверяли ли копию вообще»): возраст отметки и срабатывание
  `backup-verify.timer`, годность копии не оценивает. Своего таймера нет — его зовёт healthcheck записи
  `proverka-otmetki-priyomki` в реестре `/etc/agent-registry/plugins.yaml`.
- `razmer-kopii-watch` — сторож размера копии и места под неё.
- `backup-coverage-watch` — сторож покрытия копии: дома и комнаты на машине против `agent-registry pokrytie --json`.
  Повторы одной и той же тревоги глушит по отпечатку на 24 ч. Разметку копии он сверяет измерителем
  (`IZMERITEL_BIN`; умолчание — путь, зашитый в `sbin/backup-coverage-watch`). С 1.0.6 (B-N-1940) беда разметки
  называется в тревоге по причине: «измеритель разметки ослеп» (в выводе измерителя есть «СЛЕПОТА») или «разметка копии
  противоречива»; нет измерителя или он не отработал — так и сказано («не найден», «не отработал»). В тело тревоги строки
  измерителя идут в порядке «СЛЕПОТА» → прочие «⚠️» → остальное, не больше четырёх.
  Заголовок беды (до первого двоеточия) входит в отпечаток глушения, поэтому слепота измерителя при прежнем составе находок
  больше не гасится как повтор. Смену хвоста при том же заголовке (другой путь слепоты) сторож по-прежнему считает повтором.
- `omega-db-backup.sh` — копия базы долговременной памяти OMEGA.
- `kopiya-upala` — тревога об упавшем юните копии; зовёт systemd через `OnFailure=`.

## Связи с другими пакетами

- `receipt-watch-failed.service` (здесь) — читатель отказа сторожа `receipt-watch` из пакета **dsh-pochta**
  (его drop-in `onfailure.conf`).
- `python-padenie-70` из **dsh-storozha-mashiny** — зовут drop-in `60-python-padenie-70.conf` двух сторожей.
- Тревоги `kopiya-upala` уходят через `/usr/local/bin/agent-alert` (`AGENT_ALERT_BIN`) — пакет **dsh-trevogi**.

## Настройка

Всё ниже взято из кода. «Только для пробы» — подмены, которые на боевых юнитах не ставят. В столбце «умолчание» «—» значит, что
переменная не задана; словами записаны умолчания, которые код вычисляет.

**`sadik-backup.py`** — сборка и выгрузка · **`sadik-backup.py --sostav`** — показать рамку копии (корни источников) без
сборки · **`sadik-backup.py --skachat <drive_id> <куда>`** — скачать архив с Drive · **`DRY=1 sadik-backup.py`** — собрать и
не выгружать. Любой другой первый довод — отказ, код 2.

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `AGENT_REGISTRY_BIN` | `/usr/local/bin/agent-registry` | читатель реестра: состав копии, дома непокрытых агентов, папка на Drive |
| `PASSWORD_STORE_DIR` | `/etc/agent-secrets` | хранилище `pass` с ключами Drive |
| `DRIVE_CLIENT_KEY` | `ferma/google/oauth-client-secret-json` | имя записи `pass` с учётными данными приложения |
| `DRIVE_REFRESH_KEY` | `ferma/google/refresh-token-iia` | имя записи `pass` с ключом обновления |
| `SECRET_KEY_OWNER` | `iskra` | от root за записью ходят `sudo -n -u <владелец>` |
| `BACKUP_LOCAL_DIR` | `/backups` | локальная полка; каталог 0700, архив 0600 |
| `BACKUP_STATE` | `/var/lib/sadik-backup/last.json` | отметка последней удачной копии (0644); каталога нет — создаётся 0755 |
| `BACKUP_RETAIN` | `30` | сколько своих архивов держать на Drive |
| `BACKUP_RETAIN_LOCAL` | `15` | в бою drop-in `20-hranenie-2.conf` даёт `2`; сколько своих архивов держать на полке; меньше 1 — ротация полки не идёт |
| `BACKUP_PRISTAVKA` | `own-chain-` | приставка имени архива и отбор своих при ротации |
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | отправщик тревоги |
| `DRY` | — | `1` — не выгружать, архив оставить, тревог не слать |
| `BACKUP_SO_MARK` | — | не задана — сокеты не метятся; в бою drop-in `30-put-nl.conf` даёт `0x740`; метка сокетов для узкого пути выгрузки (`0x…` годится) |
| `BACKUP_ACL_SROK_SEK` | `1800` | срок `getfacl` для снимка ACL, с |
| `BACKUP_PYC_SROK_SEK` | `60` | срок подпроцесса разбора `__pycache__`, с |
| `BACKUP_SROK_SEK` | `TimeoutStartSec` юнита − 600 с (не прочитан — 3 ч − 10 мин) | общий срок выгрузки от старта процесса |
| `BACKUP_KUSOK_SEK` | `600` | предел одного сетевого запроса выгрузки, с |
| `MONITOR_UNIT` | — | ставит systemd; бюджет длины и ссылка на запуск в тревоге |

Папку на Drive сборщик берёт только из реестра (`agent-registry mashina --json` → `kopiya.drive_folder_id`): переменной
для неё нет намеренно. Зашито в коде: кусок выгрузки 64 МиБ, 5 попыток на кусок, пауза `min(60, 2^n)` с; сроки HTTP —
сеанс 60 с, кусок 600 с, скачивание 1800 с, листинг ротации 120 с; реестр, `pass` и тревога — по 60 с.

**`kopiya-put-nl up | down`** — иное — отказ, код 2. Зовёт drop-in `30-put-nl.conf`: `ExecStartPre=-… up`, `ExecStopPost=… down`.
`up` кладёт маршрут `default dev awg0` в таблицу 740 и правило `fwmark 0x740 lookup 740` на приоритет 39; чужое правило на
39 — отказ. `down` снимает только своё правило и чистит таблицу 740. Метка, таблица, приоритет и устройство зашиты в коде.

**`kopiya-upala <юнит> <заголовок>`** — ровно два непустых довода. Зовут четыре юнита `*-failed.service`
(`sadik-backup`, `backup-verify`, `omega-db-backup`, `receipt-watch`). Отправщик — `AGENT_ALERT_BIN`
(`/usr/local/bin/agent-alert`). Молчит, если в журнале последнего запуска юнита (по `InvocationID`) есть строка
`BACKUP_RESULT … notification=sent`; иначе шлёт тревогу с 6 строками хвоста журнала.

**`proverka-kopii.sh [--tolko-sekrety] [--kopiya-snyata <ISO 8601 с поясом>] <архив.tar.gz>`** — ключи в любом месте,
путь ровно один; прочий ключ на `-` — код 2; дата без часового пояса — код 2.

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `CHITATEL` | `/usr/local/bin/agent-registry` | читатель реестра: пути ключа и хранилища (`mashina --json`) и разметка состава (`pokrytie`) |
| `AGENTS_REGISTRY` | `/etc/agent-registry/agents.yaml` | реестр, чей возраст сверяется с копией; передаётся читателю |
| `TMPDIR` | `/tmp` | где рабочий каталог проверки |
| `--tolko-sekrety` | — | только расшифровочная часть: состав и подключения пропускаются; успех — код 8, а не 0 |
| `--kopiya-snyata` | — | момент снятия копии: если реестр новее, разметка берётся из git реестра на этот момент |

**`proverka-otmetki-priyomki.sh`** — без доводов; своего юнита нет, зовёт healthcheck записи `proverka-otmetki-priyomki`
в `/etc/agent-registry/plugins.yaml`.

| переменная | умолчание | смысл |
|---|---|---|
| `BACKUP_VERIFY_STATE` | `/var/lib/sadik-backup/proverena.json` | отметка приёмки |
| `BACKUP_VERIFY_TIMER` | `backup-verify.timer` | таймер приёмки (читается `LastTriggerUSec`) |
| `PREDEL_OTMETKI_CHASOV` | `72` | предел возраста отметки и последнего срабатывания таймера, ч |

**`proverka-svezhesti-kopii.sh`** — без доводов; зовёт `backup-verify.service`.

| переменная | умолчание | смысл |
|---|---|---|
| `BACKUP_STATE` | `/var/lib/sadik-backup/last.json` | отметка сборки |
| `BACKUP_TIMER` | `sadik-backup.timer` | таймер сборки |
| `BACKUP_SERVICE` | `sadik-backup.service` | служба сборки |
| `BACKUP_BIN` | `/usr/local/sbin/sadik-backup.py` | кем скачивать (`--skachat`) |
| `PRIYOMKA_BIN` | `/usr/local/sbin/proverka-kopii.sh` | кем принимать; по метке потоковой приёмки в нём выбирается формула места |
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | отправщик тревоги |
| `PREDEL_CHASOV` | `30` | предел возраста отметки сборки, ч; задана пустой или не целым 1..999999 — СЛЕПОТА, код 2 |
| `PREDEL_ZAPUSKA_MINUT` | `1500` | предел возраста последнего запуска сборки, мин; то же правило |
| `BACKUP_VERIFY_SERVICE` | `backup-verify.service` | чей `TimeoutStartSec` — потолок сроков |
| `BACKUP_VERIFY_STATE` | `/var/lib/sadik-backup/proverena.json` | куда писать отметку приёмки (временный файл и `mv`, 0644) |
| `TMPDIR` | `/tmp` | ФС распаковки при проверке места; уходит в `proverka-kopii.sh` |

Зашито в коде: каталог скачивания `mktemp -d /tmp/priyomka-kopii.XXXXXX` (`TMPDIR` не слушает); запас места — при
потоковой приёмке `S/20`, не меньше 1 ГБ, иначе `1,5·S`, плюс 5 % объёма ФС; сроки — скачивание `120 + S/12 МБ/с`,
приёмка `120 + S/60 МБ/с`, не дольше потолка юнита − 120 с, через `timeout --kill-after=30`. В бою потолок — 3 ч
(`TimeoutStartSec=10800`, drop-in `srok-potolok.conf`).

**`razmer-kopii-watch`** — без доводов. Любая заданная переменная из таблицы печатает в stderr «⚠️ ПОДМЕНА …».

| переменная | умолчание | смысл |
|---|---|---|
| `RKW_STATE` | `/var/lib/sadik-backup/last.json` | отметка последней копии |
| `RKW_POLKA` | `/backups` | полка |
| `RKW_SKRIPT_KOPII` | `/usr/local/sbin/sadik-backup.py` | откуда брать умолчание хранения, если `BACKUP_RETAIN_LOCAL` нет в окружении юнита сборки |
| `RKW_PRIYOMKA` | `/usr/local/sbin/proverka-kopii.sh` | по метке потоковой приёмки выбирается формула запаса |
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | отправщик тревоги |
| `RKW_KESH` | `/var/lib/razmer-kopii-watch` | кэш листинга архивов |
| `RKW_DF_AVAIL` | свободное место полки | только для пробы |

Хранение на полке сторож берёт из `systemctl show sadik-backup.service -p Environment`, иначе из текста сборщика.
Зашито в коде: порог ступеньки ±5 %; прогноз не дальше 60 ночей; рабочие зоны (`var/backups/montazh*/`, `opt/*/workspace/`,
`opt/coders/*/workspace/`) и журналы сессий (`opt/[coders/]*/.claude/projects/`) считаются отдельной строкой; срок
вызова тревоги 150 с.

**`backup-coverage-watch`** — без доводов. В бою — от `iskra` через `python-padenie-70`.

| переменная | умолчание | смысл |
|---|---|---|
| `AGENT_ALERT_BIN` | `/usr/local/bin/agent-alert` | отправщик тревоги |
| `COVERAGE_SOSTOYANIE` | `/var/lib/backup-coverage-watch/otpechatok` | состояние глушения повторов; каталог даёт `StateDirectory=` юнита |
| `COVERAGE_DPKG_INFO` | `/var/lib/dpkg/info` | списки пакетов для маски `!paket` |
| `IZMERITEL_BIN` | `/opt/iskra/workspace/dorabotki/ozhidaemyj-razmer.py` | измеритель разметки копии; запускается тем же Python |

Зашито в коде: читатель реестра `/usr/local/bin/agent-registry`; глушение повтора 24 ч; сроки `find`, измерителя и
тревоги — 120, 120 и 60 с.

**`omega-db-backup.sh`** — без доводов; юнит ставит `LC_ALL=C.UTF-8`.

| переменная | умолчание | смысл |
|---|---|---|
| `OMEGA_DB` | `/var/lib/omega/.omega/omega.db` | база; должна читаться и иметь таблицу `memories` |
| `OMEGA_BACKUP_DIR` | `/var/backups/omega` | куда класть: каталог 0700, копия `omega-<UTC>.db.gz` 0600 |
| `OMEGA_BACKUP_KEEP` | `28` | сколько копий хранить; меньше 1 — ротация не идёт |
| `OMEGA_BACKUP_MIN_FREE` | `15` | свободного места меньше этого, % — копия не начинается |

## Коды возврата

| программа | коды |
|---|---|
| `sadik-backup.py` | сборка: 0 собрана и уехала (полнота — в отметке и `backup-coverage.json` внутри архива, не в коде; сбой ротации на Drive после выгрузки код не меняет — см. ниже) · 1 собрана, но не уехала · 3 реестр не читается или договор негоден · 4 сборка не удалась · 5 запись не читается из хранилища или токен не выдан; непойманное исключение Python тоже даёт 1. `--sostav`: 0 рамка полна · 4 пропуски или непокрытые агенты · 3 реестр · 2 лишние доводы. `--skachat`: 0 скачано · 1 HTTP не 200 или 0 байт · 4 права скачанного шире 0600 · 5 токен · 2 доводы или нет каталога. Юнит без `SuccessExitStatus`: любой ненулевой код — failed → `sadik-backup-failed.service` → `kopiya-upala` |
| `kopiya-put-nl` | 0 поднят или снят (`down` — всегда 0) · 1 `up` не удался (нет `awg0`, маршрут или правило не встали, чужое правило на 39) · 2 неизвестный ввод. В юните `ExecStartPre=-`: отказ `up` сборку не останавливает |
| `kopiya-upala` | 0 тревога доставлена или не требовалась (`notification=sent`) · 1 не доставлена — юнит тревоги сам failed · 2 отказ ввода |
| `proverka-kopii.sh` | 0 полный профиль пройден · 1 выявлена негодность (в том числе «🔴 НЕГОДНА: в архиве члены, ведущие вне корня распаковки …» — абсолютный путь, «..», путь через ссылку архива, ссылка выше корня; такой архив не распаковывается) · 2 заключения нет · 8 пройден только частичный профиль (`--tolko-sekrety`); последней строкой — `VERIFY_RESULT verdict=… code=…` |
| `proverka-otmetki-priyomki.sh` | 0 приёмка идёт · 1 отметка старше предела и таймер не срабатывал · 2 измерение не состоялось |
| `proverka-svezhesti-kopii.sh` | 0 принята, отметка записана · 1 не принята · 2 неизвестно (слепота, не готово, отказ по месту или сроку) · 4 принята, отметка не сохранена · 5/6/7 — то же, что 1/2/4, но тревога не доставлена · 8 частичный профиль; последней строкой — `BACKUP_RESULT verdict=… notification=… code=…`. В бою успех юнита — только 0 (drop-in `zz-itogi-priyomki.conf` сбрасывает `SuccessExitStatus`); иной код — failed → `backup-verify-failed.service` → `kopiya-upala`, который молчит при `notification=sent` |
| `razmer-kopii-watch` | 0 чисто · 1 тревога сказана (ступенька, нехватка места или «ступенька НЕ мерена», когда на полке нет предыдущего архива) · 2 слепота, тоже уходит человеку. В юните `SuccessExitStatus=1`; падение Python — 70 через `python-padenie-70`. `OnFailure=` у юнита нет |
| `backup-coverage-watch` | 0 покрытие полное · 1 найдено непокрытое (в том числе погашенное как повтор) · 3 реестр не читается или пуст · 4 обход не удался или не прочлись списки dpkg · 5 корень обхода без маски пуст. В юните `SuccessExitStatus=1`; падение Python — 70. `OnFailure=` у юнита нет |
| `omega-db-backup.sh` | 0 копия сделана и проверена · 1 базы нет, места мало, копирование, проверка или сжатие не удались. Юнит без `SuccessExitStatus`: 1 — failed → `omega-db-backup-failed.service` → `kopiya-upala` |

Ротация на Drive идёт после выгрузки со свежим токеном и листает подпапку постранично (до 50 страниц по 100). Её сбой —
не отказ копии: копия уже на Drive, код 0, отметка пишется, а в журнале остаётся строка «⚠️ ротация не состоялась: …» (токен
не получен, HTTP-ошибка, сеть) или «⚠️ ротация ОСТАНОВЛЕНА: …» (больше 50 страниц или ни одного своего объекта). Старое при
этом не удалено, и место на Drive будет расти — эти строки читают глазами, тревоги по ним нет.

## Зависимости

Снято с кода — что программы зовут на деле. В пакет не входит ничего из списка.

- **`agent-registry`** (`/usr/local/bin/agent-registry`, пакет a2a-bus) и реестр `/etc/agent-registry/agents.yaml`. Без
  них сборщик — код 3 с тревогой «Копия sadik не сделана», сторож покрытия — код 3, приёмка — код 2.
- **git и репозиторий `/etc/agent-registry`** — только приёмке с `--kopiya-snyata`, когда реестр новее копии; без них — код 2.
- **`agent-alert`** (`/usr/local/bin/agent-alert`, пакет dsh-trevogi). Без него сборщик молчит; `kopiya-upala` — код 1;
  приёмка по расписанию меняет коды 1/2/4 на 5/6/7; сторожа печатают «тревога не отправлена/не доставлена». Отправщику
  нужна группа `agent-button`.
- **`pass` и хранилище `/etc/agent-secrets`** — выгрузке и скачиванию: от root сборщик зовёт
  `sudo -n -u iskra env PASSWORD_STORE_DIR=… pass show <запись>`. Запись не прочиталась — код 5.
- **Python-модули `requests` и `urllib3`** (не стандартные) — выгрузка, скачивание, ротация; `urllib3` грузится при
  старте, когда задана `BACKUP_SO_MARK` (в бою задана). `--sostav` и `DRY=1` их не трогают. Без `requests` сборка доходит
  до архива и падает на получении токена непойманным исключением — Python выходит кодом 1, как «не уехала».
- **`getfacl`** (пакет acl) — снимок ACL. Без него сборка проходит с кодом 0, а приёмка такую копию отвергает:
  «СНИМОК ACL НЕГОДЕН», код 1.
- **`hostname`** — бюджет длины тревоги сборщика; без него тревога не уходит («ТРЕВОГА НЕ ДОСТАВЛЕНА»), код не меняется.
- **`systemctl`** — сборщик (свой срок), `kopiya-upala`, сторож отметки, приёмка по расписанию, `razmer-kopii-watch`
  (без ответа — слепота, код 2).
- **`journalctl`** — `kopiya-upala` (строка итога и хвост); без него тревога уходит всегда.
- **`ip`** (iproute2) и интерфейс **`awg0`** — `kopiya-put-nl`. Без `ip` он печатает «awg0 нет», то есть называет неверную
  причину; выгрузка тогда идёт прежним путём.
- **`sudo`** — сборщику для `pass`; сторожу покрытия — **беспарольное право учётки `iskra` на `sudo -n find` и
  `sudo -n test`** (правило sudoers в пакет не входит). Нет права — обход не удался, код 4.
- **`gpg`**, **`gzip`**, **`tar`** и coreutils (`mktemp find chmod cp grep wc sort date stat awk sed cut du rm`) — приёмка
  проверяет их перед работой; нет любого — код 2. `tar` приёмка требует, хотя архив читает модулем Python; программой
  `tar` пользуется только `razmer-kopii-watch` (без него ступенька меряется по всей копии). `cat`, `head`, `tail`,
  `mkdir`, `dirname`, `basename` приёмка зовёт вне этой проверки.
- **`timeout`** и **`df`** — приёмка по расписанию (сроки звеньев, место); `df` — и `omega-db-backup.sh`.
- **`python-padenie-70`** (пакет dsh-storozha-mashiny) — запускатель двух Python-сторожей в drop-in `60-python-padenie-70.conf`.
- **Измеритель разметки** `IZMERITEL_BIN` (по умолчанию `/opt/iskra/workspace/dorabotki/ozhidaemyj-razmer.py`) — в пакет
  не входит; нет файла — тревога «измеритель разметки не найден», код 1 (повтор той же беды глушится на 24 ч).
- **Списки dpkg** `/var/lib/dpkg/info/*.list` — маска `!paket` сторожа покрытия; не прочлись — код 4.
- **Сеть до Google** — `oauth2.googleapis.com` и `www.googleapis.com`.

Программа `sqlite3` не нужна: все базы — копия OMEGA, снимки баз в сборщике и проверка баз в приёмке — открываются
модулем Python `sqlite3`.

Версии: **Python ≥ 3.11** для `sadik-backup.py` (`glob(…, include_hidden=True)`); ниже сборка падает до выгрузки.
`backup-coverage-watch` и `sadik-backup.py` используют `X | None` в аннотациях — нужен ≥ 3.10. В остальных программах
признаков новее 3.8 нет. Бой — 3.12 (замер 10.10.2026).

## Установка и снятие (руками root)

Установка файла: `install -o root -g root -m <режим из таблицы> <файл в пакете> <путь на диске>`; в бою — через
`smontirovat-fajly` по воротам. Юниты: положить в `/etc/systemd/system/` (drop-in — в свой каталог `*.service.d/`),
`systemctl daemon-reload`, `systemctl enable --now <имя>.timer`.

Снятие юнита — `systemctl mask` (правило фермы 9): наш юнит с файлом в `/etc/systemd/system` mask не примет —
файл в страховку (`mv`), `daemon-reload`, `mask`; вернуть — `unmask` и файл назад.

## Ограничения

- `sadik-backup.py`: ссылки кладутся ссылками — цель вне разметки в копию не едет; «собрана» ≠ «полна» (полнота — в
  отметке); снимок ACL снят на конец обхода, пути с переводом строки остаются без ACL; маска `ne_klast`, начинающаяся с
  «**», не применяется; ночь, не доехавшая до Drive и вытесненная более новыми, теряет единственный экземпляр;
  `--sostav` — корни источников, а не перечень архива; `--skachat` — перевозка байтов, а не приёмка.
- `kopiya-put-nl` не ловит деградацию самого туннеля; без `awg0` меченые пакеты идут прежним путём.
- `kopiya-upala` не ловит юнит, который не запускался; зависание видит только через `TimeoutStartSec`; смерть самого юнита
  тревоги не видит никто.
- `proverka-kopii.sh`: состав считается по образцам, а не по файлам; манифест — слово сборщика о себе (ловит «знал, что
  пропустил», но не «не знал, что надо взять»); снимок ACL с диском не сверяется; подключения проверяются наличием, а не
  работой; годность значений секретов не проверяется; разметка на момент копии — из git, правка мимо git не ловится.
- `proverka-otmetki-priyomki.sh` годность копии не судит и правдивость отметки не проверяет.
- `proverka-svezhesti-kopii.sh` проверяет только последний архив; размер для расчёта места берёт из отметки, а не с
  Drive; скорость ниже 12 МБ/с упирается в срок.
- `razmer-kopii-watch` рост внутри 5 % за ночь видит только как место; «что выросло» не называет; рост внутри рабочих зон
  не видит, рост журналов сессий — строкой, а не тревогой.
- `backup-coverage-watch`: маска `!paket` не ловит наш файл внутри каталога пакета; смена хвоста беды разметки при том же
  заголовке гасится как повтор; смена владельца каталога состояния ломает глушение.
- `omega-db-backup.sh` держит копию на том же томе, что и база: от смерти диска не спасает.

## Проверка

Сумма каждого файла пакета по метке `dsh-kopiya-mashiny-v<номер>`, смонтированной в бой, = сумма боя (`sha256sum`), права = таблице (`stat -c '%a %U:%G'`); таймеры —
`systemctl list-timers sadik-backup.timer backup-verify.timer omega-db-backup.timer razmer-kopii-watch.timer backup-coverage-watch.timer`.

Своих стендов у пакета нет. Стенды лежат в пакете dsh-obhod-stendov (`dorabotki/`), в бою — в
`/opt/iskra/workspace/dorabotki/`; гоняет их ночной обход `vse-stendy-boevye.sh` под учёткой `iskra`:

| стенд | предмет | условия | что проверяет |
|---|---|---|---|
| `stend-priyomki-kopii.sh` | `proverka-kopii.sh` | без sudo; нужны `gpg`, `python3`, читаемый реестр | приёмку на своём ключе и хранилище через подставной реестр; `--tolko-sekrety` ждёт 8; коды 0/1/2 |
| `stend-priyomki-po-raspisaniyu.sh` | `proverka-svezhesti-kopii.sh` | нужен `sudo -n` (иначе СЛЕПОТА, код 2); подставные сборки через `systemd-run` | 33 пробы и живую политику успеха юнита; коды 0/1/2 |
| `stend-otmetki-priyomki.sh` | `proverka-otmetki-priyomki.sh` | без sudo; подставной `systemctl` | 13 проверок кодов |
| `stend-razmer-kopii-watch.sh` | `razmer-kopii-watch` | без sudo; подмены `RKW_*` | сцепку чисел с приёмкой, место на подставной полке, ступеньку без рабочих зон; коды 0/1/2 |
| `stend-pokrytiya.sh` | `backup-coverage-watch` | установленные файлы, подмены `COVERAGE_SOSTOYANIE`, `AGENT_ALERT_BIN`, `AGENTS_REGISTRY` | видит непокрытое, молчит о размеченном; живую машину не портит; коды 0/1/2 |
| `stendy/stend-sborshchika-kopii.sh` | `sadik-backup.py` (сборка) | без root, ~3 с | восстановимый `__pycache__` и разбор чужих `.pyc` в подпроцессе |
| `stendy/stend-dogovora-trevogi.sh` | `sadik-backup.py` против `agent-alert` | без sudo | три якоря договора на боевом и испорченных копиях отправщика; коды 0/1/2 |

У `kopiya-put-nl`, `kopiya-upala` и `omega-db-backup.sh` стендов нет.
