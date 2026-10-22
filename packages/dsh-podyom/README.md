Английская версия: [README.en.md](README.en.md) · ниже — русский текст

# dsh-podyom — подъём службы агента через ворота и приборы до и после подъёма

Версия · Version: 3.1.4

## Назначение

Перезапуск службы агента рвёт то, что в ней идёт: компакт, ход, приём голосового, дистилляцию секретаря. Голый `systemctl restart` этого не видит, а миграция памяти при подъёме необратима. Поэтому подъём агента на sadik идёт через `podyom-uzla`. Он поднимает службу только тогда, когда всё это не идёт, а MainPID совпадает с тем, по которому принимали решение. До подъёма он делает снимок базы памяти и снимает канон пакетов. После подъёма сверяет, что процесс сменился и пакеты назвали себя, и пишет след в журнал подъёмов. Кто поднял, что уехало в бой и почему отказано — видно из журнала, а не из переписки.

Зовёт его рука root: `sudo podyom-uzla <служба>`. Сторож `podyom-mimo-vorot-watch` (пакет dsh-storozha-mashiny) берёт у него область вызовом `podyom-uzla --oblast`. Остальные файлы пакета — приборы вокруг подъёма. `pered-podyomom.mjs` сверяет состав (что поедет и что в бою) с реестром плагинов. `kvitanciya-podyoma` по исходу этого прибора выставляет Искре квитанцию «подъём разобран». `proverit-podyom-kodera` — проверка «можно ли поднимать» для кодеров, которые в область `podyom-uzla` не входят. `hod-sluzhby` — общий признак «идёт ли ход»: его зовут `podyom-uzla`, `proverit-podyom-kodera`, `smontirovat-fajly` (dsh-montazh), `pereklyuchatel-podpiski` (dsh-podpiski) и `mail-stop-hold` (dsh-pochta).

Результаты читают:
- журнал `/var/log/podyom-uzla/zhurnal-podyomov.txt` — `kto-podnimal`, ядро памяти (dsh-pamyat-core, свидетель загрузки) и `podyom-mimo-vorot-watch`;
- снимок канонов — `pered-podyomom.mjs --posle`;
- квитанцию в `SOSTOYANIE-ISKRY.txt` — `sadik-watch`.

## Что ставится и куда

Пути и права сверены с записью `dsh-podyom` в `/etc/agent-registry/plugins.yaml` (раздел `services`, `derevo.files`) и со `stat` боевых файлов.

| файл в пакете | путь на машине | режим, владелец | кто исполняет / читает |
|---|---|---|---|
| `bin/podyom-uzla` | `/usr/local/bin/podyom-uzla` | 0755 root:root | рука root; `podyom-mimo-vorot-watch` (`--oblast`) |
| `bin/pered-podyomom.mjs` | `/usr/local/bin/pered-podyomom.mjs` | 0755 root:root | `podyom-uzla` (переменная `PRIBOR`) до и после подъёма; `kvitanciya-podyoma`; рука |
| `bin/kvitanciya-podyoma` | `/usr/local/bin/kvitanciya-podyoma` | 0755 root:root | `podyom-uzla` после удачного подъёма `iskra.service` (`sudo -n -u iskra`) |
| `bin/proverit-podyom-kodera` | `/usr/local/bin/proverit-podyom-kodera` | 0755 root:root | рука root (`sudo -n`) прямо перед `systemctl restart` кодера alfa/beta/gamma/marc/anna/master/vintik/shpuntik/gayka/shurup/tumbler |
| `libexec/agent-hod/hod-sluzhby` | `/usr/local/libexec/agent-hod/hod-sluzhby` | 0755 root:root | `podyom-uzla`, `proverit-podyom-kodera`, `smontirovat-fajly`, `pereklyuchatel-podpiski`, `mail-stop-hold` |
| `libexec/podyom-uzla/check-sled.py` | `/usr/local/libexec/podyom-uzla/check-sled.py` | 0644 root:root | `podyom-uzla` через `/usr/bin/python3 -I -S -B` (замок подъёма и сверка следа); сам ничего из пакета не грузит — его как модуль загружает `baseline.py` |
| `libexec/podyom-uzla/snapshot.cjs` | `/usr/local/libexec/podyom-uzla/snapshot.cjs` | 0755 root:root | `podyom-uzla`: `sudo -n node snapshot.cjs <база> <снимок>` (снимок `VACUUM INTO`) |
| `libexec/podyom-uzla/boundary.cjs` | `/usr/local/libexec/podyom-uzla/boundary.cjs` | 0755 root:root | `podyom-uzla` после подъёма: рубеж базы памяти, число записей, `MAX(id)` |
| `libexec/podyom-uzla/baseline.py` | `/usr/local/libexec/podyom-uzla/baseline.py` | 0644 root:root | рука root, разово (базис следа); обычный подъём его не зовёт. Загружает `check-sled.py` из своего каталога (`importlib`) |

В бой не ставятся: `README.md`, `CHANGELOG.md`, `test/stend-priyoma.sh`.

Юнитов у пакета нет. Пакет — исходники без `package.json`: каталоги `bin/` и `libexec/` повторяют пути под `/usr/local/`. Текущая версия — в заголовке `CHANGELOG.md` и в метке `dsh-podyom-v<номер>` дерева `/opt/iskra/workspace/dsh-plugins`.

Что `podyom-uzla` пишет на машине (в пакет не входит):
- `/var/log/podyom-uzla/` (root:root 0755, файлы 0644): журнал `zhurnal-podyomov.txt`, канон `kanon-podyoma-<агент>.txt`, снимок канонов `snimok-kanonov-<агент>.txt`, манифест сверки `manifest.txt`, замки `.podyom-<агент>.lock`;
- снимок базы памяти до подъёма: `<каталог базы>/pamyat-do-podyoma-<агент>-<UTC>.db`; хранятся пять новейших, остальные удаляются, и это пишется в журнал строкой `СРОК`;
- строки в системный журнал с тегом `podyom-uzla` (у подъёма-заглушки — `podyom-uzla-zaglushka`).

Что нужно на машине (в скобках — откуда берётся):
- `bash`, `python3`, `node` с `node:sqlite`, `systemctl`, `journalctl`, `sudo`;
- `jq` (пакет ОС `jq`) — `podyom-uzla` разбирает им ответ `agent-registry pole … --json`; без него область пуста, код 2;
- `logger` (util-linux; в Debian и Ubuntu — пакет `bsdutils`) — строки `podyom-uzla` и `hod-sluzhby` в системный журнал;
- модуль python `yaml` (PyYAML; пакет ОС `python3-yaml`) — им `pered-podyomom.mjs` читает `/etc/agent-registry/plugins.yaml`;
- `/usr/local/bin/agent-registry` (пакет a2a-bus) — из него `podyom-uzla` берёт область; без него область пуста, код 2;
- `/etc/agent-registry/plugins.yaml` — источник принятого для `pered-podyomom.mjs`;
- `/usr/local/bin/summa-predmeta-rezhim` (пакет dsh-montazh) — снимок канонов;
- `/usr/local/bin/summa-predmeta-2` (пакет dsh-pamyat) — канон суммы для `pered-podyomom.mjs` по умолчанию (`--kanon`).

## Установка

Ставят у нас так:

1. Правка файла идёт кандидатом через ворота. По временному правилу (Вениамин, 07.10.2026) любой файл пакета меняется только вместе с новым номером пакета: заголовок в `CHANGELOG.md` и метка `dsh-podyom-v<номер>` в дереве `/opt/iskra/workspace/dsh-plugins`.
2. Монтаж — пофайлово, `smontirovat-fajly` (пакет dsh-montazh), отдельным вызовом на каждый боевой каталог. Сначала прогон, потом в бой:
   ```bash
   sudo smontirovat-fajly --punkt <пункт> --progon --osnova podyom-uzla=<sha256 боя> \
        <дерево>/packages/dsh-podyom/bin /usr/local/bin podyom-uzla
   sudo smontirovat-fajly --punkt <пункт> --v-boj  --osnova podyom-uzla=<sha256 боя> \
        <дерево>/packages/dsh-podyom/bin /usr/local/bin podyom-uzla
   ```
   Файлы `libexec/` монтируются так же в `/usr/local/libexec/podyom-uzla` и `/usr/local/libexec/agent-hod`. Файл, которого в бою ещё нет, — только с `--novyj --mode=<режим из таблицы> --owner=0:0`.
3. Юнитов нет: `daemon-reload` и `enable` не нужны. Новый `podyom-uzla` начинает работать со следующего вызова.
4. После монтажа в записи `dsh-podyom` реестра переводят `version` (отпечаток `installed_check`) и `derevo.ref` на новую метку.

Снятие: файл уходит в страховку (`mv`), а до того надо проверить всех, кто его зовёт (таблица выше).

## Настройка

Переменные окружения и ключи взяты из кода. Переменные-обходы принимают не «да», а **причину словами**: она попадает в вывод и, для `PODNYAT_VSLEPUYU`, в строку `ДО` журнала.

**`podyom-uzla <служба> [ожидаемый MainPID] [ключи]`**

| переменная / ключ | умолчание | смысл |
|---|---|---|
| `<служба>` | — | `X.service` из области: в `agent-registry` у агента X `sluzhba=X.service`, `polzovatel=X`, `dom=/opt/X`. Вне области — код 2 |
| `[ожидаемый MainPID]` | не задан | поднять, только если MainPID сейчас тот же; иначе отказ 1. Не задан — подъём без сверки предмета, с предупреждением |
| `--suhoj` | выключен | сухой прогон: ничего не поднимает и не пишет, считает все причины отказа |
| `--prervat-hod=<причина>` | — | поднять при идущем ходе; голый ключ — отказ 2 |
| `--prervat-distillyaciyu=<причина>` | — | поднять при идущей дистилляции; голый ключ — отказ 2 |
| `--oblast` | — | напечатать область и выйти: 0 — область непуста, 2 — пуста |
| `OKNO` | `15min` | окно журнала службы для проверки компакта |
| `SLED` | `/var/log/podyom-uzla/zhurnal-podyomov.txt` | журнал подъёмов; его каталог — место канона, снимка канонов, манифеста и замков |
| `SLED_PRIBOR` | `/usr/local/libexec/podyom-uzla/check-sled.py` | прибор замка и сверки следа |
| `SLED_MANIFEST` | `<каталог SLED>/manifest.txt` | опора сверки, если в журнале нет суммы |
| `SNIMOK_KANONOV` | `<каталог SLED>/snimok-kanonov-<агент>.txt` | куда писать снимок канонов (его же читает `pered-podyomom.mjs --posle`) |
| `PROFIL_PUTI` | `<дом>/.dsh/profiles/web`, дом — `/opt/<агент>` (у `iskra.service` — `/opt/iskra`, у `petrovich.service` — `/opt/petrovich`) | профиль, из которого берётся состав для снимка канонов |
| `PODYOM_BAZA` | `/opt/<агент>/pamyat/pamyat.db` | база памяти для снимка до подъёма и для рубежа |
| `PRIYOM_BAZA` | `/opt/<агент>/workspace/.message-receipts/receipts.sqlite` | квитанции канала: идёт ли приём входящего |
| `PRIYOM_PREDEL` / `PRIYOM_SHAG` | `120` / `5` (с) | сколько ждать окончания приёма и с каким шагом |
| `HOD_SLUZHBY` | `/usr/local/libexec/agent-hod/hod-sluzhby` | прибор хода (подмена печатается строкой «ПОДМЕНА») |
| `PRIBOR` | `/usr/local/bin/pered-podyomom.mjs` | прибор состава до и после подъёма |
| `PRIBOR_SUMM` | `/usr/local/bin/summa-predmeta-rezhim` | прибор сумм для снимка канонов |
| `KVIT_CMD` | `/usr/local/bin/kvitanciya-podyoma` | квитанция после подъёма Искры |
| `PREDEL_OZHIDANIYA` | `60` (с) | сколько после подъёма ждать, пока пакеты назовут себя в журнале |
| `ZHDU_PAKETOV` | `6` | сколько пакетов должно назвать себя; меньше — слепота (код 2) |
| `PROBA` | пусто (`--suhoj` ставит `да`) | сухой режим |
| `KOMANDA_PODYOMA` | пусто | только для стенда: команда вместо `systemctl restart`; пишет файлы `*.zaglushka.txt`, тег `podyom-uzla-zaglushka`, не проверяет смену PID и не ставит квитанцию |
| `KANON_DOM` | дом службы (`/opt/<агент>`, у `iskra.service` — `/opt/iskra`) | только для стенда: чей `plugins/` идёт в канон момента; подмена печатается строкой «ПОДМЕНА»; задан без `KOMANDA_PODYOMA` — отказ, код 2 |
| `PODNYAT_VSLEPUYU` | — | обход любой слепоты (журнал пуст, прибор ослеп, база квитанций не читается и т. п.) |
| `PODNYAT_NESMOTRYA` | — | обход незавершённого компакта |
| `PODNYAT_NESMOTRYA_NA_PRIBOR` | — | обход исхода 1 прибора состава |
| `PODNYAT_BEZ_SNIMKA` | — | обход несделанного снимка базы |
| `TMPDIR` | `/tmp` | временный файл ошибок проверки приёма |

**`pered-podyomom.mjs`** (только ключи, позиционный довод — отказ 2)

| ключ / переменная | умолчание | смысл |
|---|---|---|
| `--sluzhba` | `iskra.service` | чья служба |
| `--profil` | `<дом User службы>/.dsh/profiles/web`; если владельца службы не снять — `/opt/iskra/.dsh/profiles/web` | корень профиля |
| `--konfig` | `<профиль>/cordis.patch.yml` | что объявлено к загрузке |
| `--reestr-plaginov` | `/etc/agent-registry/plugins.yaml` | источник принятого (оба раздела, `plugins` и `services`) |
| `--kanon` | `/usr/local/bin/summa-predmeta-2` | прибор суммы предмета |
| `--cel пакет=версия,…` / `--cel-fajl <файл>` / `--cel-s-diska` | — | цель подъёма; одна из трёх обязательна, без цели — слепота 2. `--cel-s-diska` с двумя другими не совмещается |
| `--posle` | выключен | разряд «В БОЮ»: что процесс напечатал о себе с момента старта |
| `SNIMOK_KANONOV` | `/var/log/podyom-uzla/snimok-kanonov-<агент>.txt` | цель разряда «В БОЮ» при `--cel-s-diska` |
| `--strogo` | — | принимается и ничего не меняет |
| `--reestr` | — | разряды, ходившие в npm, выключены распоряжением владельца; без ключа печатается «не проверялся» |
| `--summy` | — | снят: отказ 2 |

**`kvitanciya-podyoma [iskra|iskra.service]`** — любой другой довод даёт отказ 2.

| переменная | умолчание | смысл |
|---|---|---|
| `KVITANCIYA_FAJL` | `/opt/iskra/workspace/SOSTOYANIE-ISKRY.txt` | файл, где правятся строки `PODYOM_PODTVERZHDEN=` и `PODTVERDILA=` |
| `KVITANCIYA_SLUZHBA` | `iskra.service` | чей старт ставится в квитанцию |
| `KVITANCIYA_PRIBOR` | `/usr/local/bin/pered-podyomom.mjs` | прибор, зовётся с `--posle --cel-s-diska` |

**`proverit-podyom-kodera <юнит>`** — юнит из `alfa.service`, `beta.service`, `gamma.service`, `marc.service`, `anna.service`, `master.service`, `vintik.service`, `shpuntik.service`, `gayka.service`, `shurup.service`, `tumbler.service`. Своих переменных нет: дочернему `hod-sluzhby` он сам ставит `HOD_SYSTEMCTL` и `HOD_JOURNALCTL`. Каждая внешняя команда ограничена 10 с и 16 МиБ вывода.

**`hod-sluzhby <юнит>`**

| переменная | умолчание | смысл |
|---|---|---|
| `HOD_SYSTEMCTL` | `systemctl` | подмена для стенда |
| `HOD_JOURNALCTL` | `journalctl`; не от root — `sudo -n journalctl` | подмена для стенда |
| `HOD_DISTILL_MIN` | `100` (мин) | метка разбора старше этого не считается идущей дистилляцией |
| `HOD_KAT_METOK` | из `putOtklonennyh` в `$DSH_HOME/profiles/web/cordis.patch.yml` службы | каталог меток `razbor-idet-*.txt` |

**`check-sled.py`**: `--file`, `--journal`, `--service`, `--phase ДО|ПОСЛЕ`, `--manifest` (все обязательны), `--allow-new`. Служебные режимы: `--lock-run <путь> -- <команда>` и `--lock-held <fd> <путь>`.

**`baseline.py`**: `--plan` или `--apply <проверенный JSON>` (одно из двух), `--directory`, `--services …`, `--operator` (обязательны).

## Проверка

Сверка с боем — команды из записи `dsh-podyom` реестра:
- `installed_check`: `sha256sum` девяти боевых файлов, свёрнутый в `sha256:<16 знаков>`; результат должен совпасть с полем `version` записи;
- `healthcheck`: `test -x /usr/local/bin/podyom-uzla && echo 'podyom-uzla исполним'`;
- запись `proverit-podyom-kodera` реестра проверяет ещё `sudo -n /usr/local/bin/proverit-podyom-kodera --help`: код 0 — прибор на месте.

Стенд пакета — `test/stend-priyoma.sh [путь к podyom-uzla]`, по умолчанию `../bin/podyom-uzla` рядом со стендом. Запускать под учёткой с `sudo -n` (нужны `sudo -n python3` и `sudo -n test`). Стенд подставляет свою `receipts.sqlite` через `PRIYOM_BAZA` и зовёт `podyom-uzla iskra.service --suhoj`, так что подъёма нет. Пробы:
- П1 — незаконченных приёмов нет;
- П2 — приём идёт и не кончается → отказ с id;
- П3 — приём кончается во время ожидания;
- П4 — базы нет → слепота;
- П6 — удержание `mail_stop_intake` → ждёт и отказывает;
- П5 — снова как П1.

Код 0 — все шесть зелёные, 1 — хоть одна красная, 2 — не создан временный каталог либо предмет не дошёл до раздела приёма (отказал раньше — пробы не судимы, причина печатается).

Сухой прогон самого подъёма — `sudo podyom-uzla <служба> --suhoj`:
- 0 — в бою дошло бы до подъёма;
- 3 — в бою был бы отказ, причины перечислены;
- 2 — слепота: вне области, неизвестный ключ или пустая область.

Коды в бою:

| программа | коды |
|---|---|
| `podyom-uzla` | 0 — поднято, MainPID сменился, пакеты назвались, след записан · 1 — отказ (компакт, ход, приём, «нельзя» прибора, MainPID не тот, нет снимка, канон не совпал со следом, нет замка, строка `ДО` не записалась) либо restart вернул 0, а PID прежний · 2 — слепота (в том числе назвалось меньше `ZHDU_PAKETOV` пакетов, не записан снимок канонов или строка `ПОСЛЕ`) · 5 — идёт дистилляция · иной — код `systemctl restart` |
| `pered-podyomom.mjs` | 0 можно · 1 нельзя · 2 слепота (ведёт себя как «нельзя») |
| `kvitanciya-podyoma` | 0 квитанция выставлена · 2 отказ или слепота · иначе — исход прибора (1: бой разошёлся с диском) |
| `proverit-podyom-kodera` | 0 можно по снимку · 1 занят (ход или дистилляция) · 2 слепота или отказ |
| `hod-sluzhby` | 0 хода нет (или нет процесса) · 1 ход идёт · 2 журнал живого процесса пуст · 3 неверный вызов · 4 сбой `systemctl show` |
| `check-sled.py` | 0 сошлось или новый файл · 1 расхождение (или отказ замка) · 2 слепота |
| `baseline.py` | 0 план напечатан или базис записан · 1 отказ базиса |

## Ограничения

- Компакт виден только по журналу службы за окно `OKNO` (15 мин). Компакт дольше окна не виден, а если платформа перестанет печатать `compaction/start`, проверка ослепнет.
- Ход и дистилляция видны по журналу главного процесса с его запуска. Потерянная journald строка конца даёт ложное «идёт» (обходится ключом с причиной). Смена формулировок платформы или секретаря даёт ложное «не идёт»: это ловит только сверка при обновлении.
- Метка разбора старше `HOD_DISTILL_MIN` (100 мин) не считается идущей дистилляцией. Разбор без метки `hod-sluzhby` не видит. Перезагрузку машины и OOM не спрашивает никто.
- Приём входящего виден только с `channel_started=1`: файл, который только лёг в ящик, и канал, не пишущий квитанций, не видны. Удержание `channel_interrupted` приёмом не считается.
- Область — из реестра агентов. Агент с другим устроем, ошибочно записанный с `dom=/opt/X` и `polzovatel=X`, будет поднят с проверками не для своего устроя. Кодеры alfa/beta/gamma (учётка `coders`) выпадают из области сами. Для них — `proverit-podyom-kodera`: это снимок, а не замок, звать его надо непосредственно перед действием.
- Ожидаемый MainPID необязателен. Без него подъём идёт без сверки предмета, с предупреждением.
- Канон момента берётся из `<дом>/plugins/*/` и `/opt/agent-plugins/*/`, снимок канонов — из профиля `<дом>/.dsh/profiles/web` (или `PROFIL_PUTI`); дом — `/opt/<агент>`, у Искры — `/opt/iskra`. С 1.0.5 Петрович идёт общей веткой и снимается со своего дома `/opt/petrovich`; до 1.0.5 его канон и снимок брались из `/opt/iskra` и описывали состав Искры. Снимок находит пакет только по ссылке `<профиль>/node_modules/<имя>` для имени из `cordis.patch.yml`: пакет профиля без такой ссылки в снимок не попадает.
- Канон отвечает «что уехало в бой этим подъёмом», а не «законен ли состав».
- `pered-podyomom.mjs` видит только литеральные пути `import … from "/…"` во входном файле пакета. Вычисляемый путь и подключение из соседнего файла не видны. `package.json` профиля как способ подключения не читается. Разряды, сверявшие диск и метки с реестром npm, и разряд «файл сумм против дерева вердиктов» выключены, а не удалены.
- `pered-podyomom.mjs` исполняет команды `fingerprint_check` из реестра рукой вызвавшего (под `podyom-uzla` — root). Граница доверия та же, что у `agent-plugins verify`.
- Квитанция есть только у Искры. Она значит «прибор разобрал подъём и сошлось», а не «подъём законен». Задним числом её не выставить: после нового выпуска прибор законно даёт 1. Подделать её может любой с sudo на машине.
- `check-sled.py` сверяет артефакт с последней строкой журнала. Подлинность журнала он не доказывает.
- `snapshot.cjs` снимает копию `VACUUM INTO`. Пять новейших снимков на агента хранятся рядом с базой, на том же томе.
