Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-pochta — письма агентов sadik, сторожа щелей и квитанций, снятие HOLD почтового стопа

Версия · Version: 3.1.5

## Назначение

Письма между агентами ходят через щели — каталоги, из которых их забирает сборщик на другой стороне. Отправитель видит «положено», а не «доставлено». Ошибка в имени файла молча уводит письмо не тому адресату. Если забирать перестали, никто не узнает. Пакет закрывает это с двух концов.
- Отправка проверяет адресата, щель и права ещё до укладки:
  - `tell-komu` — письмо к агентам aclaude, адресат берётся из имени файла;
  - `zabava-tell` — короткое письмо координатору;
  - `zabava-v2-pismo` с транспортом `a2a-v2.py` — письмо координатора в локальный ящик `a2a/in` агента sadik по протоколу v2.
- Сторожа следят за результатом:
  - `zastryalo-v-shcheli` и `zastryalo-varvara` — письмо лежит в щели дольше предела;
  - `receipt-watch` — взятое письмо осталось без исхода (оборванный ход);
  - `a2a-owner-copy-watch` — владелец не получил вовремя копию вопроса из ящика a2a.

Сюда же входят две ручные руки подписанного почтового стопа. `mail-stop-hold` показывает и снимает HOLD, который стоп оставил в базе квитанций агента. `mail-stop-trust-sverka.mjs` сверяет файл доверия стопа. Отдельно лежит `srochnoe-novye` — счётчик непрочитанного в срочном канале Искры.

Кто зовёт:
- сторожей — systemd-таймеры;
- `tell-komu` — рука агентов sadik, а также `chitatel-obhoda` (dsh-storozha-sadik) и `zadaniya-prervany-watch` (dsh-storozha-mashiny);
- `a2a-v2.py` — `zabava-v2-pismo` и `a2a-send --v2` (пакет a2a-bus, через `v2_with_mirror.py`);
- остальное — рука агента или root.

Кто читает результат:
- тревоги сторожей — получатели `agent-alert`;
- отказ `receipt-watch` — `receipt-watch-failed.service` (пакет dsh-kopiya-mashiny);
- письма — сборщик координатора на aclaude и приёмник dsh-telegram-multiagent на sadik.

## Источник receipt-watch

`bin/receipt-watch`, служба, таймер и три drop-in уже входят в это дерево; код совпадает с `/usr/local/bin/receipt-watch` побайтно. `receipt-watch.service` ссылается через `Documentation` на этот README. Рабочий каталог Беты `receipt-watch-20260918` больше не нужен как источник службы. Отдельного пакета `dsh-receipt-watch` не создаётся.

`receipt-watch-failed.service` уже принадлежит пакету `dsh-kopiya-mashiny` (исходник `systemd/receipt-watch-failed.service`, тот же боевой путь в его `derevo.files`). Это внешний читатель исходов 1 и 2: `onfailure.conf` → `receipt-watch-failed.service` → `/usr/local/sbin/kopiya-upala` → `agent-alert`.

## Что ставится и куда

Пути и права сверены с записью `dsh-pochta` в `/etc/agent-registry/plugins.yaml` (раздел `services`, `derevo.files`) и со `stat` боевых файлов.

| файл в пакете | путь на машине | режим, владелец | кто исполняет / читает |
|---|---|---|---|
| `bin/tell-komu` | `/usr/local/bin/tell-komu` | 0755 root:root | рука агентов sadik; `chitatel-obhoda`, `zadaniya-prervany-watch` |
| `bin/zabava-tell` | `/usr/local/bin/zabava-tell` | 0755 root:root | рука агента |
| `bin/zabava-v2-pismo` | `/usr/local/bin/zabava-v2-pismo` | 0755 root:root | рука root (`sudo zabava-v2-pismo ФАЙЛ ПОЛУЧАТЕЛЬ`) |
| `bin/srochnoe-novye` | `/usr/local/bin/srochnoe-novye` | 0755 root:root | рука |
| `libexec/a2a-v2.py` | `/usr/local/libexec/a2a-v2.py` | 0644 root:root | загружается модулем: `zabava-v2-pismo` (`HELPER_FILE`), `a2a-send --v2` (`A2A_V2_HELPER`); можно звать `python3 a2a-v2.py probe|decision …` |
| `bin/a2a-owner-copy-watch` | `/usr/local/bin/a2a-owner-copy-watch` | 0755 root:root | `a2a-owner-copy-watch.service` через `python-padenie-70` |
| `bin/receipt-watch` | `/usr/local/bin/receipt-watch` | 0755 root:root | `receipt-watch.service` |
| `sbin/zastryalo-v-shcheli` | `/usr/local/sbin/zastryalo-v-shcheli` | 0755 root:root | `zastryalo-v-shcheli.service` (User=iskra) и `zastryalo-v-shcheli@<агент>.service` (User=<агент>), кроме `@varvara` |
| `libexec/zastryalo-varvara` | `/usr/local/libexec/zastryalo-varvara` | 0755 root:root | `zastryalo-v-shcheli@varvara.service` (drop-in `20-two-queues.conf` заменяет ExecStart) |
| `sbin/mail-stop-hold` | `/usr/local/sbin/mail-stop-hold` | 0755 root:root | рука root; подсказку к нему печатает `mail-stop-receiver.js` (dsh-telegram-multiagent) |
| `sbin/mail-stop-trust-sverka.mjs` | `/usr/local/sbin/mail-stop-trust-sverka.mjs` | 0644 root:root | рука root: `sudo node /usr/local/sbin/mail-stop-trust-sverka.mjs` |
| `systemd/a2a-owner-copy-watch.service` | `/etc/systemd/system/a2a-owner-copy-watch.service` | 0644 root:root | свой таймер; oneshot, `StateDirectory=a2a-owner-copy-watch`, `SuccessExitStatus=1` |
| `systemd/a2a-owner-copy-watch.service.d/60-python-padenie-70.conf` | `/etc/systemd/system/a2a-owner-copy-watch.service.d/60-python-padenie-70.conf` | 0644 root:root | systemd: запуск через `/usr/local/bin/python-padenie-70` (пакет dsh-storozha-mashiny) |
| `systemd/a2a-owner-copy-watch.service.d/70-predely.conf` | `/etc/systemd/system/a2a-owner-copy-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/a2a-owner-copy-watch.timer` | `/etc/systemd/system/a2a-owner-copy-watch.timer` | 0644 root:root | systemd: раз в минуту (`OnBootSec=1min`, `OnUnitActiveSec=1min`); включён |
| `systemd/receipt-watch.service` | `/etc/systemd/system/receipt-watch.service` | 0644 root:root | свой таймер; oneshot |
| `systemd/receipt-watch.service.d/ohvat.conf` | `/etc/systemd/system/receipt-watch.service.d/ohvat.conf` | 0644 root:root | systemd: `RECEIPT_LEDGER_PATHS` — 12 ledger агентов |
| `systemd/receipt-watch.service.d/onfailure.conf` | `/etc/systemd/system/receipt-watch.service.d/onfailure.conf` | 0644 root:root | systemd: `OnFailure=receipt-watch-failed.service` (пакет dsh-kopiya-mashiny) |
| `systemd/receipt-watch.service.d/70-predely.conf` | `/etc/systemd/system/receipt-watch.service.d/70-predely.conf` | 0644 root:root | systemd: пределы `MemoryMax`, `MemorySwapMax=0`, `TimeoutStartSec` (A-N-1963 №11) |
| `systemd/receipt-watch.timer` | `/etc/systemd/system/receipt-watch.timer` | 0644 root:root | systemd: раз в час, первый запуск через 10 мин после загрузки, `Persistent=true`; включён |
| `systemd/zastryalo-v-shcheli.service` | `/etc/systemd/system/zastryalo-v-shcheli.service` | 0644 root:root | свой таймер; `User=iskra` |
| `systemd/zastryalo-v-shcheli.timer` | `/etc/systemd/system/zastryalo-v-shcheli.timer` | 0644 root:root | systemd: `OnCalendar=*:0/5`, `Persistent=true`; включён |
| `systemd/zastryalo-v-shcheli@.service` | `/etc/systemd/system/zastryalo-v-shcheli@.service` | 0644 root:root | шаблон: `User=%i`, `ZASTRYALO_SHCHEL=/opt/%i/a2a/tell` |
| `systemd/zastryalo-v-shcheli@.timer` | `/etc/systemd/system/zastryalo-v-shcheli@.timer` | 0644 root:root | systemd: `*:0/5`; включены экземпляры `@avrora`, `@varvara`, `@zarya` |
| `systemd/zastryalo-v-shcheli@varvara.service.d/20-two-queues.conf` | `/etc/systemd/system/zastryalo-v-shcheli@varvara.service.d/20-two-queues.conf` | 0644 root:root | systemd: две щели Варвары через `zastryalo-varvara`, `StateDirectory=zastryalo-varvara` |

В бой не ставятся: `README.md`, `README.en.md`, `CHANGELOG.md`, `LICENSE`, `test/`. Для 3.1.3 добавить `test/` в `derevo.not_installed` записи пакета; остальные соответствия сохранить.

Пакет — исходники без `package.json`: `bin/`, `sbin/`, `libexec/` повторяют пути под `/usr/local/`, `systemd/` — пути под `/etc/systemd/system/`. Текущая версия — в заголовке `CHANGELOG.md` и в метке `dsh-pochta-v<номер>` дерева `/opt/iskra/workspace/dsh-plugins`.

Пакет служебный (группа Д): публикуется исходниками, без npm, после общих ворот секретов (`vorota-obezlichivaniya`). Щели, адресаты и пути машины sadik зашиты в коде умолчаниями; что из них переопределяется средой или ключом — в разделе «Настройка», перечень адресатов `tell-komu` — только правкой кода.

Что нужно на машине (в пакет не входит):
- программы: `bash`, `python3` (с модулем `yaml` — PyYAML — для `a2a-owner-copy-watch`: без него сторож падает на импорте, и `python-padenie-70` выходит кодом 70), `node`, `systemctl`, `journalctl`, `sudo`, `logger`;
- версии: Python 3 — признаков новее 3.7 в коде нет (бой — 3.12); Node ≥ 16.9 для `mail-stop-trust-sverka.mjs` (`Object.hasOwn`, :34; бой — 24);
- `/usr/local/bin/agent-alert` (пакет dsh-trevogi) — тревоги сторожей;
- `/usr/local/bin/python-padenie-70` (dsh-storozha-mashiny);
- `/usr/local/libexec/agent-hod/hod-sluzhby` (пакет dsh-podyom) — его зовут `mail-stop-hold snyat` и `snyat-pauzu` до записи: код не 0 — отказ 2; файла нет (как и `systemctl`, `ps`) — «🔴 ОТКАЗ: <исполняемое> не исполнился (<причина>) — признак слеп», код 2, ничего не записано;
- `receipt-watch-failed.service` (dsh-kopiya-mashiny);
- перечень щелей `/etc/a2a/tell-shcheli.list` — без него `tell-komu` отказывает кодом 3 любому письму;
- маршруты v2 `/etc/a2a/v2-receivers.json` и `/etc/a2a/zabava-v2-receivers.json`;
- файл доверия стопа `/etc/a2a/coordinator-signature.json`, настройки стопа в `/etc/dsh-mail-stop/`;
- реестр агентов `/etc/agent-registry/agents.yaml` (формат и программа `agent-registry` — пакет a2a-bus);
- ledger квитанций агентов (`<дом>/workspace/.message-receipts/receipts.sqlite`, их пишет dsh-telegram-multiagent);
- журнал `a2a-pochtalon.service` (пакет a2a-bus) — его читает `a2a-owner-copy-watch`.

## Установка

Ставят у нас так:

1. Правка идёт кандидатом через ворота. По временному правилу (Вениамин, 07.10.2026) любой файл пакета меняется только вместе с новым номером пакета: заголовок в `CHANGELOG.md` и метка `dsh-pochta-v<номер>` в дереве `/opt/iskra/workspace/dsh-plugins`.
2. Монтаж — пофайлово, `smontirovat-fajly` (пакет dsh-montazh), отдельным вызовом на каждый боевой каталог. Сначала прогон, потом в бой:
   ```bash
   sudo smontirovat-fajly --punkt <пункт> --progon --osnova tell-komu=<sha256 боя> \
        <дерево>/packages/dsh-pochta/bin /usr/local/bin tell-komu
   sudo smontirovat-fajly --punkt <пункт> --v-boj  --osnova tell-komu=<sha256 боя> \
        <дерево>/packages/dsh-pochta/bin /usr/local/bin tell-komu
   ```
   Юниты и drop-in монтируются так же в `/etc/systemd/system/` и в свой каталог `*.service.d/`. Файл, которого в бою ещё нет, — только с `--novyj --mode=<режим из таблицы> --owner=0:0`.
3. После правки юнита или drop-in: `sudo systemctl daemon-reload`. `smontirovat-fajly` сам этого не делает. Скрипты подхватываются следующим запуском таймера.
4. Новый таймер: `sudo systemctl enable --now <имя>.timer`. Сторож новой щели агента: `sudo systemctl enable --now zastryalo-v-shcheli@<агент>.timer`. Шаблон годится, только если учётка, каталог `/opt/<агент>` и щель `/opt/<агент>/a2a/tell` совпадают по имени.
5. После монтажа в записи `dsh-pochta` реестра переводят `version` (отпечаток `installed_check`) и `derevo.ref` на новую метку.

Снятие юнита — `systemctl mask` (правило фермы 9). Наш юнит с файлом в `/etc/systemd/system` mask не примет, поэтому так: файл в страховку (`mv`), `daemon-reload`, `mask`. Вернуть — `unmask` и файл назад.

## Настройка

Всё ниже взято из кода. «Только для стенда» — подмены, которые на боевых юнитах не ставят. В столбце «умолчание» «—» значит,
что переменная не задана; словами записаны умолчания, которые код вычисляет.

**`tell-komu <файл>`** — имя файла `dlya-<кому>-<тема>.<расширение>`, где `<кому>` — `veniamina`, `mihalycha`, `zabavy` или `vseh` (родительный падеж).

| переменная / довод | умолчание | смысл |
|---|---|---|
| `DSH_HOME` | — | если задан, корень агента = `DSH_HOME` без `/.dsh`; иначе `HOME` |
| `ZABAVA_TELL_DIR` | `<корень>/a2a/tell` | исходящая щель; обязана быть в перечне `/etc/a2a/tell-shcheli.list` |
| `A2A_ZERKALO` | `<корень>/a2a/polnye` | зеркало: полная копия письма под тем же именем |
| `A2A_TELL_LIST` | `/etc/a2a/tell-shcheli.list` | подмена перечня щелей — только вместе с `A2A_TELL_PROBA=1`, с записью в журнал |
| `A2A_TELL_PROBA` | `0` | `1` — объявленная проба: без неё подмена `A2A_TELL_LIST` — отказ 3 |
| `A2A_SKIP_ADRESAT=1` | выключен | осознанный обход проверки адресата |
| `A2A_PROVERENO_DO` | `5560` | знаков; проверенная глубина доставки; длиннее — предупреждение, письмо всё равно кладётся |
| `A2A_KONFIG_IMEN` | `/opt/iskra/.dsh/profiles/web/cordis.patch.yml` | откуда брать полные имена пакетов для предупреждения о сокращённых |
| `--v2` | — | отказ 3: v2 разрешён только sadik→sadik |

**`zabava-tell "текст" | - | -f файл | -- "-текст"`**

| переменная | умолчание | смысл |
|---|---|---|
| `ZABAVA_TELL_DIR` | `$HOME/a2a/tell` | исходящая щель; файл `tell-<наносекунды>.txt`, права 664 |

**`zabava-v2-pismo ФАЙЛ ПОЛУЧАТЕЛЬ [--supersedes ID]`** (под sudo)

| что | значение в коде | смысл |
|---|---|---|
| `/etc/a2a/zabava-v2-receivers.json` | зашит | маршрут получателя: `inbox`, `ledger`, `owner`, `mode` (только 0644 или 0664) |
| `/usr/local/libexec/a2a-v2.py` | зашит | транспорт v2 |
| проба поддержки v2 | 60 с | без подтверждения читателя письмо не отправляется |
| итог `--supersedes` | 60 с наблюдения | исход отмены: `confirmed`, `too_late`, `held`, `not_confirmed` или `unknown` |

**`python3 /usr/local/libexec/a2a-v2.py probe|decision <получатель> [metadata.json]`**

| переменная | умолчание | смысл |
|---|---|---|
| `A2A_V2_ROUTES` | `/etc/a2a/v2-receivers.json` | маршруты; годится только маршрут с `machine: sadik` |

**`srochnoe-novye [--otmetit]`**

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `SROCHNOE` | `/opt/iskra/workspace/srochnoe` | каталог срочного канала; новыми считаются `*.txt` новее отметки `.prochitano-do` |
| `--otmetit` | — | обновить отметку прочтения |

**`a2a-owner-copy-watch [--inspect | --baseline <APPROVED_JSON>]`**

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `A2A_COPY_REGISTRY` | `/etc/agent-registry/agents.yaml` | агенты с каналом telegram и их дома |
| `A2A_COPY_STATE` | `/var/lib/a2a-owner-copy-watch/state.sqlite` | своё состояние: замеченные письма, курсор журнала почтальона, время тревог |
| `A2A_COPY_ALERT` | `/usr/local/bin/agent-alert` | отправщик тревоги (`--plain`) |
| `A2A_COPY_NOW_MS` | текущее время | только для стенда |
| `A2A_COPY_POCHTALON_LOG` | — | только для стенда: файл вместо журнала `a2a-pochtalon.service`; на боевом юните не ставить |
| `--inspect` | — | посмотреть, ничего не сохраняя |
| `--baseline` | — | разово записать одобренный перечень старых писем, до первых тревог |
| порог / тревога | 300 с / одна на агента за 6 ч | зашито в коде |

**`receipt-watch`** (любой довод — слепота, код 2)

| переменная | умолчание | смысл |
|---|---|---|
| `RECEIPT_LEDGER_PATHS` | `/opt/iskra/workspace/.message-receipts/receipts.sqlite`, `/opt/petrovich/workspace/.message-receipts/receipts.sqlite` | абсолютные пути ledger, по одному на строку; в бою drop-in `ohvat.conf` даёт 11 путей |
| `RECEIPT_MAX_AGE_SECONDS` | `86400` | взятое письмо без исхода старше этого — просрочено |

**`zastryalo-v-shcheli`**

| переменная | умолчание | смысл |
|---|---|---|
| `ZASTRYALO_SHCHEL` | `/opt/iskra/a2a/tell` | щель; в шаблоне `@` — `/opt/%i/a2a/tell` |
| `ZASTRYALO_PREDEL_MIN` | `5` | предел лежания, мин |
| `A2A_ZERKALO` | `$HOME/a2a/polnye` | зеркало для счёта «положено за сутки» |
| `ZASTRYALO_ALERT` | `/usr/local/bin/agent-alert` | отправщик тревоги |

**`zastryalo-varvara --shchel <путь> --shchel <путь> --state-dir <путь> [--alert-bin <путь>]`** — пути абсолютные, щелей ровно две. В бою drop-in передаёт `/opt/varvara/a2a/tell`, `/opt/varvara/workspace/a2a/tell`, `/var/lib/zastryalo-varvara` и `/usr/local/bin/agent-alert`. Порог 300 с и не больше 10 тревог за час на обе щели зашиты в коде.

**`mail-stop-hold`**
- `pokazat <агент>` — режим по умолчанию;
- `snyat <агент> <control_id> --prichina '…' [--backlog vernut|derzhat] [--sdk-sverka '…'] [--v-boj]`;
- `snyat-pauzu <агент> <control_id> --prichina '…' [--v-boj]`;
- `zakryt-kvitanciyu <агент> <control_id> --prichina '…' [--v-boj]`.

Без `--v-boj` — прогон: все проверки, ничего не пишется.

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `--backlog` | `vernut` | вернуть удержанные письма в обычный путь или держать |
| `--sdk-sverka` | — | доказательство руки, что запрос SDK завершён (для агента без шлюза — обязательно) |
| `MSH_DB` | `<WorkingDirectory службы>/.message-receipts/receipts.sqlite` | только для стенда |
| `MSH_BACKUP` | `/var/backups/montazh/mail-stop-hold` | куда класть страховку базы перед записью |
| `MSH_HOD` | `/usr/local/libexec/agent-hod/hod-sluzhby` | только для стенда; любая подмена `MSH_*` печатается строкой «ПОДМЕНА» |
| `MSH_SYSTEMCTL` | `systemctl` | только для стенда |
| `MSH_NOW_MS` | текущее время | только для стенда |

**`mail-stop-trust-sverka.mjs [--trust <файл>] [--stop-config <файл>]…`**

| ключ | умолчание | смысл |
|---|---|---|
| `--trust` | `/etc/a2a/coordinator-signature.json` | файл доверия стопа |
| `--stop-config` | — | файл настройки стопа агента; можно несколько; без него проверка 6 (ключ статусов) не делается |

## Проверка

Сверка с боем — команды из записи `dsh-pochta` реестра:
- `installed_check`: `sha256sum` 23 боевых файлов, свёрнутый в `sha256:<16 знаков>`; результат должен совпасть с полем `version` записи;
- `healthcheck`: `systemctl is-active a2a-owner-copy-watch.timer receipt-watch.timer zastryalo-v-shcheli.timer`;
- таймеры целиком: `systemctl list-timers a2a-owner-copy-watch.timer receipt-watch.timer 'zastryalo-v-shcheli*'`.

Собственные пробы перечислены ниже. Общие боевые стенды лежат в `/opt/iskra/workspace/dorabotki/` и гоняются обходчиком `vse-stendy-boevye.sh` (пакет dsh-obhod-stendov):
- `stendy/stend-a2a-owner-copy-watch.sh` — под iskra;
- `stendy/stend-mail-stop-hold.sh` — под iskra;
- `stendy/stend-trust-sverka.sh -- /usr/local/sbin/mail-stop-trust-sverka.mjs` — от root; без довода стенд отказывает;
- `stendy/stend-imeni-v2.sh` — имя письма v2 через боевой `a2a-v2.py`;
- `stend-kurera.sh` — `tell-komu`, 12 проб на подставной щели, объявленной пробой (`A2A_TELL_PROBA` и `A2A_TELL_LIST`).

Ручная проверка без записи:
- `mail-stop-hold pokazat <агент>` — только чтение;
- `mail-stop-hold snyat …` без `--v-boj` — прогон;
- `sudo node /usr/local/sbin/mail-stop-trust-sverka.mjs` — только чтение;
- `a2a-owner-copy-watch --inspect` — ничего не сохраняет.

Коды возврата:

| программа | коды |
|---|---|
| `tell-komu` | 0 положено, зеркало сохранено · 3 отказ (адресат, файл, щель вне перечня, права) · справка (`--help`, `-h`, пустой вызов) — тоже 3, печатается и без перечня щелей · 4 положено, зеркала нет · 129/130/143 — сигнал |
| `zabava-tell` | 0 положено (и `--help`) · 2 неверный вызов или пустое сообщение · 3 щель недоступна или запись не удалась |
| `zabava-v2-pismo` | 0 отправлено (JSON в stdout) · 3 отказ (в том числе битый ответ приёмника) · 2 — ошибка разбора доводов (argparse) |
| `a2a-v2.py` | 0 · 3 отказ (и ошибка доводов) |
| `srochnoe-novye` | 0 новых нет (или отметка обновлена) · 1 есть непрочитанные · 2 слепота |
| `a2a-owner-copy-watch` | 0 чисто · 1 есть просроченные копии (для юнита — успех, `SuccessExitStatus=1`) · 2 неполная проверка или ошибка |
| `receipt-watch` | 0 чисто · 1 просрочено · 2 слепота; 1 и 2 дают failed и `receipt-watch-failed.service` |
| `zastryalo-v-shcheli` | 0 чисто · 1 застряло (тревога ушла или названа причина, почему нет) · 2 слепота: щели нет, щель не читается или `find` не ответил (тревога о слепоте ушла или названа причина, почему нет) |
| `zastryalo-varvara` | 0 чисто · 1 застряло · 2 слепота · 3 тревога не отправлена |
| `mail-stop-hold` | 0 показано, прогон прошёл или запись подтверждена · 1 запись не удалась или не сошлась при проверке после неё (транзакция одна; страховка базы уже сделана) · 2 отказ (ничего не записано) |
| `mail-stop-trust-sverka.mjs` | 0 доверие сходится · 1 есть 🔴 — стоп не включать · 2 файл не читается или довод неизвестен |

## Ограничения

- «Положено» — не «доставлено»: `tell-komu` и `zabava-tell` кладут файл в щель, забирает сборщик на той стороне.
- `tell-komu` проверяет только КОМУ, а не ЧТО. Перечень адресатов зашит в коде, новый адресат дописывается рукой. Агенту этой машины пишут не им, а `a2a-send`.
- `zabava-tell` щель по перечню `/etc/a2a/tell-shcheli.list` не сверяет: пишет в `$HOME/a2a/tell` или `ZABAVA_TELL_DIR`. Ключ, стоящий вторым доводом, и обычное слово вместо текста уходят письмом.
- `zabava-v2-pismo` после укладки письма не отправляет повторно. Отменить можно только ожидающее письмо; взятое или исполненное не отменяется.
- `zastryalo-v-shcheli` смотрит ровно одну щель и считает только `.txt` и `.md`. Файлы с другим расширением лежат вечно, и это норма: они называются числом. Сторож не ловит:
  - доставку и прочтение;
  - потерю после забора;
  - «мы сами перестали класть» — пустая щель законна.
- Счёт «положено за сутки» у `zastryalo-v-shcheli` берёт из зеркала `*.md` и `*.txt` (`tell-komu` кладёт в зеркало файл без расширения как `.txt`). Строка счёта — «за сутки: положено через tell-komu N · в щели сейчас M»; разности «забрано» сторож не считает: в щель кладут и мимо зеркала (`zabava-tell`), а «в щели сейчас» считает все файлы. Нет зеркала — не слепота: сторож печатает «ПРОВЕРИТЬ НЕЧЕМ — зеркала нет» и продолжает проверку щели. Слепота (код 2) — щели нет, щель не читается или `find` по щели или по существующему зеркалу отказал; тогда сторож шлёт тревогу через `ZASTRYALO_ALERT`, а если отправщик отказал или не исполняем, печатает «тревога слепоты НЕ ушла / НЕ отправлена» и всё равно выходит кодом 2. Эта строка остаётся только в журнале юнита: у юнитов `OnFailure` нет.
- Шаблон `zastryalo-v-shcheli@` не годится для кодеров (`/opt/coders/<имя>`).
- `zastryalo-varvara` не доказывает сбор, доставку и прочтение и не замечает незапущенного таймера. Сверх 10 тревог в час тревога подавляется, состояние остаётся красным.
- Порог `receipt-watch` (сутки) — запас, а не замер. Наблюдённый максимум хода — 20 400 с. Сам сторож тревог не шлёт: его слышно только через `OnFailure`, а это тревога каждый час, пока причина не устранена.
- `a2a-owner-copy-watch` даёт не больше одной тревоги на агента за 6 ч. Копии, просроченные внутри окна, попадут в следующую тревогу. Тела писем он не читает.
- `mail-stop-hold snyat` не снимает паузу разговора (для неё есть `snyat-pauzu`) и не будит ход: ход начнётся со следующим письмом. Отправителю статус он не отвечает. Ход, начатый между проверкой `hod-sluzhby` и транзакцией, не ловится — после снятия повторите `pokazat`. Стоп, брошенный на `beginDispatch` в telegram 2.5.72–2.5.76, остаётся в `admitted`, и `snyat` его не берёт до смены процесса агента.
- `mail-stop-trust-sverka.mjs` не проверяет, что приватные ключи у нужных рук и что ящики `returnRoutes` живые. Перечень адресатов `new` для Искры дублирует код канала: правка одного без другого даст расхождение.
- `srochnoe-novye` сам не зовёт: его надо позвать.

## B-N-2021 — имя учётки v2

`put` допускает полную учётку `[a-z_][a-z0-9_-]*`, как почтальон a2a-bus; дефис разрешён, иной символ отказывает до временной записи. Recipient/ledger и схема конверта не ослаблены. Монтировать вместе с dsh-telegram-multiagent 3.1.7 и новой S6/S7 пробы имени v2 в обходе: прежняя S6 требовала отказа для законного дефиса.

Из копии пакета: `python3 -B test/stend-v2-agent-name.py`. Частная цепочка: `sudo python3 -B test/stend-chain-agent-name.py --telegram <копия dsh-telegram-multiagent> --postman <копия a2a-bus>/sbin/a2a-pochtalon.py --receiver-user coders`. Имена учёток подставные; root нужен только для смены UID файлов во временном каталоге, затем Node-приёмник работает под указанным непривилегированным пользователем. При отсутствии root — слепота 2. Передача/ledger настоящие, уведомление владельцу подставное; модель и Telegram не вызываются. `test/` остаётся вне боя, но входит в архив источников.
