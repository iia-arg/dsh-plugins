# Изменения · Changelog

## 3.1.6 — 21.10.2026 · podyom-mimo-vorot-watch: пустой ответ journalctl по службам — не слепота · empty per-unit journalctl answer is not blindness

- `bin/podyom-mimo-vorot-watch`: пустой ответ journalctl по службам — не слепота (проба тем же MESSAGE_ID без фильтра юнитов); причина ошибки печатается. Перенос побайтно, SHA256 `ffa0191539abb5e2ec57d360361662a8b407b186e4f996a169ea1bc3ae93a6f0`.
- Повод: ротация journald (1 ГБ ≈ 1,5 сут при ~7000 стартов PID1/час) выбила старты 15 служб — сторож слеп каждые 15 мин с 21.10 12:15Z.
- Граница: опечатку в именах служб не ловит.
- Михалыч; ворота Вениамина 21.10 15:24 МСК.

## 3.1.5 — 17.10.2026 · B-N-2100 r2: место и плановые писатели · disk space and scheduled writers

- `bin/agent-watchdog.sh`: принят r2 с комментарием границ, SHA256 `a40d8c5cda626dabb4db0ac0d5879c2e7122fbda6006df9dbaef90fa1c0311e1`; перенос побайтно, без новых изменений поведения. Independent 20%/10%/rate quiet windows, ≥2 GiB drop per interval, ETA and bounded directory diagnostics; exact accepted r2 bytes including the limitations header.
- Обязательные данные `DISK_KNOWN_WRITERS`: active/activating ожидаемый писатель освобождает только 20%/скорость при полной сравнимой диагностике без чужого роста; ниже 10% исключения нет. Пустой список/неизвестный юнит — именованная слепота, не тишина. Required writer data; expected writes may exempt warning/rate only, foreign growth and the critical tier still alert; missing/invalid inputs are explicit blindness.
- README RU/EN: номер и данные обновления, пределы du 8 с/256 MiB, разрыв скорости 900 с, допущение X=2 GiB/интервал и границы атрибуции. При монтаже дополнять существующий машинный конфиг; смена BACKUP_LOCAL_DIR/TMPDIR/PrivateTmp без правки списка не ловится. Document the required config update and limits; allowed-directory attribution does not identify the writing process.
- `test/stend-agent-watchdog.sh`: фикстура знает обязательного подставного писателя и ответ show; ожидание «без настройки» соответствует общему тексту неполноты r2. Прежние шесть фаз сохранены. Update fixture writer/show data and the missing-config message expectation; keep the six existing phases.

## 3.1.4 — 14.10.2026 · B-N-2048: npm 12

- `bin/dsh-upstream-watch.sh`: ответ `npm view … dist-tags --json` приводится помощником `npm-sostav --view` (пакет `dsh-pribory` 3.1.2): npm 11 отдаёт объект, npm 12 — массив из одного; прежний разбор под npm 12 давал «СЛЕПОТА: метки не разобраны». Не разобран — «СЛЕПОТА», код 2 · the dist-tags answer is normalised by `npm-sostav --view`; npm 12 used to blind the watcher.
- `test/stend-dsh-upstream-watch.sh`: +2 проверки (метки npm 12 массивом — как npm 11; `{"error":…}` — слепота), всего 11 · +2 checks, 11 total.
- необязательный peer `dsh-pribory` `^3.1.2` (`peerDependenciesMeta.optional`; единая форма B-N-2048, решение Забавы 15:07Z; помощник `npm-sostav` — команда на PATH хозяина); нет его в `PATH` — «СЛЕПОТА: npm-sostav не найден — нужен dsh-pribory ≥ 3.1.2», код 2 · optional peer `dsh-pribory` ^3.1.2; without `npm-sostav` on `PATH` the watcher refuses with code 2.
- ⚠️ Публикация: `dsh-pribory` 3.1.2 в npm ещё нет — публиковать его ПЕРВЫМ, иначе установка этого пакета из реестра даст ETARGET (ворота Вениамина 14:44Z) · publish `dsh-pribory` 3.1.2 first, otherwise ETARGET.

## 3.1.3 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `engines.node` ">=18" — кода на Node в пакете нет (bash/python), это граница установки через npm, а не проверенная среда кода · `engines.node` ">=18" — no Node code in the package (bash/python); the bound is for npm installation, not a tested code runtime
- README: строка «Версия · Version: 3.1.3» под заголовком. · README: version line under the heading.
- Код не менялся; номер 3.1.2 → 3.1.3 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.2 — 13.10.2026 · B-N-2032

- В дерево сведена исправленная Забавой вставка dve-kopii-watch.service.d/60-python-padenie-70.conf, сохраняющая --avto-montazh. Кандидат №20 3.1.1 сохранён целиком; эта дельта только вставка и номер.
- Preserve the pending 3.1.1 audit candidate and track the corrected automatic crash-wrapper drop-in.

## 3.1.1 — 13.10.2026 · A-N-1948 №20

- Переход с 2.0.13 на назначенную владельцем линию 3.1.1; аудит всего модуля, код и RU/EN-документация.
- Отметка движков — в закрытом StateDirectory экземпляра (0700, UMask0077); проверяются тип, владелец, права и десятичная дата, будущая/негодная дата сбрасывается атомарно. Отказ записи/удаления — слепота2.
- Настройки снимают хвостовые пробелы до внешних кавычек и отвергают каталог вместо файла. Релиз GitHub читается по точному тегу; security-набор apt распознаётся в любом месте списка. Версии DKMS с суффиксом не усекаются, недоставка называется.
- Bash-запускатель читает stderr после завершения дочернего процесса, без зависимости от ожидания process substitution. Задания: YAML-скаляр/список, пределы разбора; поля письма — одна строка до160 кодовых точек. Подсказка копий использует --osnova.
- Договоры недоставки, выбора шлюза и платформы, зависимости, количества, границы journald и стенды согласованы с кодом. Стенды только с подставными источниками и записывающими каналами, боевые юниты не запускаются.
- Assigned release line 3.1.1 from 2.0.13. Private validated engine state, literal settings, exact release tags, security-suite/DKMS parsing, synchronous stderr capture, YAML task paths and bounded single-line fields; documentation matches the current contracts.

## 2.0.13 — 13.10.2026 · B-N-2025: адресное окно монтажа

dve-kopii-watch допускает --avto-montazh только для точных изменённых файлов обеих сторон пары; финальная проверка срока, один пересъём, 4 не стирает прежнее состояние и не отправляет отбой. Unit явно включает автоматический ключ.

## 2.0.12 — пределы памяти и времени root-сторожам, читающим дома агентов (A-N-1963 №11, Заря) · memory/time limits for root watchers reading agent homes

- Новые drop-in `systemd/<юнит>.service.d/70-predely.conf` (2):
  `dve-kopii-watch`: пик 9 МБ → MemoryMax=128M, MemorySwapMax=0, TimeoutStartSec=60s
  `zadaniya-prervany-watch`: пик 22.4 МБ → MemoryMax=128M, MemorySwapMax=0
- Зачем: сторож от root читает файлы из домов агентов целиком; подменённый файл без пределов съедал память машины
  (MemoryMax=infinity) или вешал такт (нет таймаута). Предел памяти = max(128M, суточный пик×4); `MemorySwapMax=0` — без него
  сверх предела процесс уходит в своп и доживает (проба: 320M без MemorySwapMax — успех за 3,7 с вместо убийства).
  Время у Type=oneshot держит `TimeoutStartSec` (RuntimeMaxSec на oneshot не действует); добавлен только там, где его не было.
- Убит пределом → юнит failed (oom-kill / timeout); читатель — sadik-watch (is-failed по перечню storozha-sutochnye.txt).
- Монтаж: положить файлы, `systemctl daemon-reload`; перезапуск не нужен (oneshot по таймеру, следующий такт возьмёт пределы).
- New drop-ins cap memory (`MemoryMax`, `MemorySwapMax=0`) and, where missing, start time (`TimeoutStartSec`) of root watchers that read files from agent homes.

## 2.0.11 — stend-klass-padenie: временный каталог вне частного /tmp службы обхода (Искра; Забава 04:15:12Z «лечение в стенд»)

- `test/stend-klass-padenie.sh` (+3/−1): каталог скриптов `mktemp -d /run/stend-klass.XXXXXX` вместо `/var/tmp/…`. У vse-stendy-boevye.service PrivateTmp=yes — /tmp и /var/tmp частные, а временные юниты systemd-run живут в общем пространстве и файлов не видят: запускатель отвечал кодом 71 (EX_OSERR, «скрипта нет»), ночной обход 09.10 03:40Z — 1 из 6 (4 FAIL «код 71»).
- Пробы в среде службы (systemd-run -p PrivateTmp=yes, root): прежний стенд — 0 из 6, все «код 71»; 2.0.11 — 6 из 6 (и без PrivateTmp — 6 из 6); режим порчи ZAPUSK=bez — 0 из 6 с причиной «юнит success — падение выглядит успехом» (стенд видит предмет, а не слепнет).
- Мой промах 1.0.35 (обход): заводя стенд @root, пробовала его в голом временном юните — без PrivateTmp службы; урок записан.
- Чего не ловит: стенд по-прежнему нужен root (иначе СЛЕПОТА, код 2); /run — tmpfs, крупных файлов стенд не кладёт.

## 2.0.10 — 2026-10-09 · storozh-dvizhkov: законный вложенный движок; стенд догнан до 2.0.9 (B-N-1866b, Михалыч; ворота Вениамина)

- `bin/storozh-dvizhkov.sh` ce1bd202 → 764cd501: «родитель не шлюз» больше не приговор — подъём по цепочке `ppid` (≤ 32 шагов); дошла до
  ТЕКУЩЕГО шлюза — судит момент старта, не дошла (сирота, родитель 1) — ДОЖИЛ. Снимает ложное «ДОЖИЛ: родитель ≠ шлюз» на длинных
  вложенных ходах (09.10 00:46:58Z у iskra: claude, рождённый оболочкой инструмента живого хода). Код — кандидат Михалыча 4cd15d85
  (горячий монтаж 09.10), плюс шапка: «ДОЖИВШИЙ = … ИЛИ цепочка родителей не доходит до текущего шлюза» и строка о шуме гонки.
- `test/stend-storozh-dvizhkov.sh`: пробы N1 (вложенный после старта → молчит), N4а (сирота впервые → отметка, канал молчит),
  N4 (сирота дольше порога → красное с причиной), N5 (сирота ушёл → отметка снята); итог 16. Различение: на 2.0.9 N1 краснеет.
- Стенд ДОГНАН до 2.0.9: на 2.0.9 он был красным 10/12 и этого никто не заметил (метка 2.0.9 ставилась рукой без прогона стенда
  пакета): П1 ждал «ok: ход один» (теперь «ok: доживших ходов нет»), П5 считал чужим законный вопрос `systemctl show` о службе платформы.
- `docs/moduli/storozh-dvizhkov.md`: раздел «Доживший ход (2.0.9–2.0.10)», правило и шум гонки; «не ловит» дополнено.
- Чего НЕ ловит: два главных хода внутри ОДНОЙ живой платформы (оба рождены после её старта); помощников, рождённых ДОЖИВШИМ ходом
  после перезапуска; граница часов — starttime по BOOTTIME против Monotonic systemd (засыпание/миграция ВМ — законный выглядит
  «рождённым раньше»); звено цепочки, ушедшее посреди подъёма, — разовое «ДОЖИЛ» без тревоги (тревога только после 300 с).

## 2.0.9 — 2026-10-08 · storozh-dvizhkov: второй движок по моменту старта и родителю (B-N-1866, Михалыч; ворота Вениамина)

- `bin/storozh-dvizhkov.sh` bdfbf260 → ce1bd202 (+47/−9). Что различает: момент старта процесса движка относительно старта платформы (движок, рождённый раньше живой платформы, — остаток прежнего хода), и родителя: родитель ≠ шлюз.
- Чего НЕ ловит:
  - два главных хода в ОДНОЙ живой платформе (прежняя редакция ловила);
  - помощников (подагентов), рождённых доживающим ходом;
  - граница часов: starttime процесса считается по BOOTTIME, старт службы — по Monotonic systemd; при засыпании или миграции ВМ законный движок может выглядеть «рождённым раньше» платформы.

## 2.0.8 — 2026-10-04

- README: автор — «Aleksandr Argelander» вместо «Iia-arg team» (три места: шапка, лицензия RU и EN; решение владельца по MIT 04.10, B-N-1540). Из шапки README убран номер версии (стоял 1.0.5 с 1.0.6): номер — в package.json и здесь. Код не менялся. · README: author is Aleksandr Argelander (3 places); version number removed from the README header (source: package.json, CHANGELOG); code unchanged.

## 2.0.7 — перенумерация (A-N-1562): прежний 1.0.7, код не менялся · renumbering, code unchanged

## 1.0.7 — 2026-10-04

- Новый стенд КЛАССА `test/stend-klass-padenie.sh`: падение до `main()` у юнита, чей `SuccessExitStatus` содержит код падения. Живой systemd: каждый предмет — временный юнит `systemd-run` (`Type=oneshot`, `SuccessExitStatus="1 2"`), судится по `Result` юнита. Пробы: битый импорт и синтаксис Python, синтаксис и unbound variable bash → юнит failed, код 70; намеренные `sys.exit(1)` и `exit 2` → success. `ZAPUSK=bez` — те же юниты без запускателя: четыре пробы падения краснеют («юнит success»). Нужны root и `systemd-run`, иначе код 2. · New class stand on live systemd transient units; `ZAPUSK=bez` turns the four crash probes red.

## 1.0.6 — 2026-10-04

- `python-padenie-70`, `bash-padenie-70`: имя процесса — снова имя скрипта. С 1.0.3/1.0.5 оно было именем запускателя, и `agent-alert` писал «звал=python-padenie-» / «звал=bash» (он берёт `ps -o comm=` родителя). Python-запускатель пишет имя скрипта в `/proc/self/comm`; bash-запускатель исполняет исполняемый скрипт по его пути (шебанг), неисполняемый — через `bash`, как прежде (граница: там имя «bash»). Тег журнала это не меняет — его задаёт `SyslogIdentifier=` юнита. · The process name is the script's again (`agent-alert` "звал=" reads the parent's comm).
- Стенды модулей на `lib/nastrojka` (`storozh-dvizhkov`, `agent-limits`, доля `kontekst-zamer`) больше не читают файл настроек машины: `DSH_STOROZHA_MASHINY_CONF` — несуществующий файл во временном каталоге. Было: после установки пакета живой `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` подменял пробы (П0 стенда `storozh-dvizhkov` получал «СЛЕПОТА» вместо «НЕ НАСТРОЕНО»). · Stands no longer read the machine settings file.
- Стенды: python 11 проб (+1 «звал=»), bash 15 (+3: «звал=» исполняемого и неисполняемого, unbound при запуске по пути). · Stands: python 11, bash 15.

## 1.0.5 — 2026-10-04

- Новый модуль `bash-padenie-70` — запускатель bash-сторожей, пара к `python-padenie-70`: `bash -n` до запуска (синтаксис и `bad substitution` → 70, скрипт не начинает работу); во время работы строка самого bash «<путь скрипта>: line N: … unbound variable» → 70; иначе код скрипта как есть. Путь — доводом или из `BASH_PADENIE_SKRIPT` (для цепочки `exec bash "$OBERTKA"`). Закрывает класс: `set -u` даёт 1, синтаксис — 2, и оба у юнитов с `SuccessExitStatus=1 2` выглядят успехом (проверено: скрипт-файл с `set -u` и неопределённой переменной под `SuccessExitStatus=1` → `Result=success`). · New `bash-padenie-70` launcher, the bash counterpart of `python-padenie-70`.
- Стенд `test/stend-bash-padenie-70.sh`: 12 проб. · 12 probes.

## 1.0.4 — 2026-10-04

- `python-padenie-70`: отказы «скрипта не дали» и «скрипта нет» — код 71 (было 2: у юнитов с `SuccessExitStatus=1 2` переехавший скрипт давал «успех»). · Refusals "no script given" and "no such script" exit 71 (was 2, a success for units with `SuccessExitStatus=1 2`).
- Стенд `storozh-dvizhkov`: проба П9 — `MainPID` службы шлюза не среди найденных процессов шлюза → «СЛЕПОТА», код 2. · Stand probe П9: the gateway unit's `MainPID` not among the found gateway processes → blindness, exit 2.

## 1.0.3 — 2026-10-04

- Новый модуль `python-padenie-70` — запускатель Python-сторожей: намеренный код выхода проходит как есть, непойманное исключение (в том числе до `main()`: импорт, синтаксис) — traceback и код 70. Закрывает класс «`SuccessExitStatus=1`, а скрипт упал — юнит успешен»: проверено, `python3 -c "import <нет такого>"` под таким юнитом даёт Result=success. Ставится drop-in'ом `ExecStart=` к юниту, сами скрипты не меняются. · New `python-padenie-70` module — a launcher for Python watchdogs: a deliberate exit code passes as is; an uncaught exception (including before `main()`) — traceback and exit 70. Closes the "`SuccessExitStatus=1` and the script crashed — the unit is successful" class. Installed as an `ExecStart=` drop-in; the scripts themselves are unchanged.
- Стенд `test/stend-python-padenie-70.sh`: 10 проб (коды 0/1/3 как есть · импорт, синтаксис, `main` → 70 · `__name__`, `argv`, импорт соседнего модуля как при обычном запуске · без скрипта и несуществующий → 2). · 10 probes.

## 1.0.2 — 2026-10-04

Тот же класс, что исправление `inet6` в 1.0.1: «сказано» отмечается только после доставки. · Same class as the 1.0.1 `inet6` fix: "reported" is marked only after delivery.

- `dsh-upstream-watch.sh`: недоставленная тревога о rc/стабильной версии или об альфе с безопасностью — версия НЕ пишется в виденные, код 3 (юнит failed), следующий заход повторит (было: записывалась, повтора не было). · An undelivered alert — the version is NOT recorded, exit 3 (unit failed), retried next pass.
- `predel-dliny-watch`: `fire` возвращает исход доставки владельцу; не доставлено — маркер не пишется, код 3, повтор (было: код `logger`, то есть «сообщено» и при отказе канала). · `fire` returns the owner delivery outcome; not delivered — no marker, exit 3, retry.
- Стенды: по две пробы к каждой правке (отказ канала → не записано, код 3 · канал вернулся → повтор). · Stands: two probes per fix.

## 1.0.1 — 2026-10-04

Исправлены десять известных ограничений версии 1.0.0 (README §9 той версии). У каждой правки — проба в стенде модуля: на коде 1.0.0 она красная, на 1.0.1 зелёная. · The ten known limitations of 1.0.0 are fixed. Each fix has a probe in the module's stand: red on 1.0.0 code, green on 1.0.1.

- `agent-limits`: читатель ключа — файл с путём каталога `AGENT_LIMITS_DIR` или вызовом `agent-limits`, плюс имя ключа (прежде только слово `agent-limits` — потребитель «по пути» считался сиротой). · A key reader is a file with the `AGENT_LIMITS_DIR` path or an `agent-limits` call, plus the key name.
- `dkms-kernel-coverage-check.sh`: пустой ответ `dpkg-query` или `dkms status` — «СЛЕПОТА», код 2 (было: код 0 молча). · An empty `dpkg-query`/`dkms status` answer — "СЛЕПОТА", exit 2 (was a silent 0).
- `dkms-kernel-coverage-check.sh`: в тексте тревоги настоящие переводы строк вместо буквального `%0A`. · Real newlines in the alert text instead of a literal `%0A`.
- `agent-watchdog.sh`: тревога не доставлена или помощника нет — код 3, юнит failed (было: код 0). · Alert not delivered or helper missing — exit 3, unit failed (was 0).
- `yadro-predohranitel`: пустая метка или метка на другое ядро, взведённая ДО текущей загрузки, — снимается с объяснением, код 2; метка, взведённая в этой загрузке, не трогается (было: «не моё» навсегда). · An empty marker, or one armed for another kernel BEFORE this boot, is removed with a reason, exit 2; a marker armed in this boot is kept.
- `storozh-dvizhkov.sh`: новая настройка `SD_SHLYUZ_SLUZHBA` — юнит конкретного шлюза (берётся его `MainPID`); несколько шлюзов с одним скриптом без неё — «СЛЕПОТА», код 2 (было: первый попавшийся). Новый шаблон `storozh-dvizhkov@.service` + `.timer` (раз в 2 мин, экземпляр на агента, своя отметка) — у сторожа впервые есть зовущий. · New `SD_SHLYUZ_SLUZHBA` setting (the gateway unit's `MainPID`); several gateways on one script without it — blindness, exit 2 (was: the first one found). New `storozh-dvizhkov@` service + timer template — the watchdog has a caller for the first time.
- `inet6-poyavlenie-watch`: состояние пишется (и снимается) только при доставленной тревоге; недоставка — код 1, следующий прогон повторит (было: записано, повтора нет). · State is written (and removed) only after a delivered alert; non-delivery — exit 1, the next run repeats.
- `dsh-upstream-watch.sh`: ответ источника описаний проверяется по существу (код `curl` и что пришёл список); для новой альфы без описания — «СЛЕПОТА», версия не записывается и повторится, код 2 (было: пустое описание, альфа с исправлением безопасности молчала). · The release-notes answer is checked for substance; a new alpha without notes — blindness, not recorded, retried, exit 2.
- `predel-dliny-watch`: ящика агента нет в `PREDEL_YASHCHIKI` — владельцу сказано, маркер записан, «НЕ НАСТРОЕНО», код 2; повтора владельцу каждые 15 минут больше нет (было: код 3 и та же тревога на каждом прогоне). · No agent mailbox — owner told, marker written, "НЕ НАСТРОЕНО", exit 2; no more repeat every 15 minutes.
- `kontekst-zamer`: ветка «доли нет» больше не падает `NameError` — пишет «слепо (причина)». · The "no ratio" branch no longer crashes with `NameError`.
- Стенды: добавлены пробы ко всем десяти правкам; стенд `dkms` читает полный текст тревоги (он теперь многострочный). · Stands: probes added for all ten fixes; the `dkms` stand reads the full (now multi-line) alert text.
- Документация: README §9 и `docs/GUARDS.md` — исправленное убрано, остающиеся границы названы; коды выхода в описаниях модулей. · Docs updated accordingly.

## 1.0.0 — 2026-10-04

### Правка перед выпуском (r2, 2026-10-04) · Pre-release fix (r2, 2026-10-04)

- `agent-watchdog.sh`: без файла настройки — причина и выход 2 «проверка неполна» (юнит failed); место на диске меряется по-прежнему; умолчание файла настройки — `/etc/dsh-storozha-mashiny/agent-watchdog.conf (каталог пакета; прежнее место задаётся WATCHDOG_CONF · package directory; an older location is set by WATCHDOG_CONF)`. · Without a settings file — the reason and exit 2 "проверка неполна" (unit failed); disk space is still measured; default settings file `/etc/dsh-storozha-mashiny/agent-watchdog.conf (каталог пакета; прежнее место задаётся WATCHDOG_CONF · package directory; an older location is set by WATCHDOG_CONF)`.
- `dkms-kernel-coverage-check.sh`: без `DKMS_COVERAGE_MODULE` — «НЕ НАСТРОЕНО» и выход 2 вместо молчаливого 0. · Without `DKMS_COVERAGE_MODULE` — "НЕ НАСТРОЕНО" and exit 2 instead of a silent 0.
- `lib/nastrojka`: комментарий — только с начала строки; « #» внутри значения — громкий отказ с ключом, код 2. · A comment only starts a line; " #" inside a value is a loud refusal naming the key, exit 2.

Первая публикация. 14 модулей перенесены из работающих машин без изменения логики: всё, что зависело от конкретной машины (пути, имена служб, адреса, канал тревоги), вынесено в настройки с нейтральными умолчаниями; комментарии переведены на два языка. Поведение каждого модуля с машинными настройками сверено с исходным файлом сравнительным стендом на одних и тех же подставных входах.

First publication. 14 modules ported from machines in operation without changing their logic: everything that depended on a specific machine (paths, unit names, addresses, alert channel) became settings with neutral defaults; comments are bilingual. Each module's behaviour with machine settings was compared with the original file by a comparison stand on the same fake inputs.

- Новое: `lib/nastrojka` — одна функция настроек для модулей без юнита (`agent-limits`, `kontekst-zamer`, `storozh-dvizhkov.sh`): окружение → `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` → умолчание, иначе отказ с кодом 2. · New: `lib/nastrojka` — one settings function for the modules without a unit: environment → `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` → default, otherwise refusal with exit 2.
- Модули с юнитом получают настройки drop-in'ами systemd, как и прежде. · Modules with a unit get settings through systemd drop-ins, as before.
- Канал тревоги по умолчанию — `agent-alert` из пакета `dsh-trevogi`. · The default alert channel is `agent-alert` from the `dsh-trevogi` package.
- Стенды всех модулей — в `test/`, с заглушками канала, `logger`, `systemctl`, `journalctl`. · Stands for all modules are in `test/`, with stubs for the channel, `logger`, `systemctl`, `journalctl`.
- Известные ограничения перечислены в README, раздел 9, и в `docs/GUARDS.md`; в этой версии они намеренно не исправлены. · Known limitations are listed in README section 9 and in `docs/GUARDS.md`; they are deliberately not fixed in this version.
