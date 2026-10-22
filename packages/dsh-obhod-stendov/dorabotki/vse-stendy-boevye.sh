#!/bin/bash
# VSE_STENDY_PREDEL_API=1
# СПЛОШНОЙ ПРОГОН СТЕНДОВ В БОЕВОЙ РАСКЛАДКЕ (соседи на месте).
#
# 🔴 ЗАЧЕМ ОТДЕЛЬНО ОТ ПРИЁМКИ. Приёмка гоняет стенды на копии дерева тега, где соседних
# пакетов рядом НЕТ, — и часть проб там честно даёт слепоту («ядро не найдено», «платформы
# нет»). Слепота на копии законна, но она НЕ отвечает на вопрос «зелено ли то, что работает».
# Здесь предмет другой: боевые каталоги, соседи на месте, платформа рядом.
#
# ⚠️ ЧЕГО НЕ ДЕЛАЕТ: не проверяет поведение под нагрузкой и не трогает живую базу — стенды
# работают на своих временных каталогах. Зелёный итог значит «стенды сходятся на боевых
# файлах», а не «агент исправен».
#
# КОДЫ (B-H-203, 25.09.2026; замысел Гаммы и Беты 18–19.09): 0 — чисто · 3 — только ОЖИДАЕМОЕ (исключения, сроки действуют) ·
#   1 — неожиданное: красный или слепой стенд без действующего исключения, просроченное или неподтверждённое исключение,
#   охват разошёлся с перечнем · 2 — полнота неустановима (стендов нет, перечня нет, файл исключений не прочитан).
#   Приоритет 1 → 2 → 3 → 0; приоритет выбирает КОД, печатаются ВСЕ результаты.
# 🔴 ДЕФЕКТ БЕТЫ (замер 25.09): стенд с кодом 2 увеличивал «слепот», но не итог — слепой пакет при сошедшемся перечне
#   давал код 0, и ворота ставили метку. Теперь слепота без исключения — неожиданное (1), с исключением — ожидаемое (3).
# 🔴 ИСКЛЮЧЕНИЯ — ОДИН список: /etc/agent-registry/stend-exceptions.yaml (ISKLYUCHENIYA_STENDOV). Совпадение — по
#   стенду («пакет/стенд») + выпуску (version пакета, «*» — любой, «-» — у стенда-файла) + коду + ПРИЗНАКУ (фиксированная
#   подстрока вывода стенда), а не по одному коду: иной отказ того же стенда — неожиданный. Негодная запись/дата —
#   «исключение НЕ ПОДТВЕРЖДЕНО», не разрешение. Прежний ozhidaemye-slepoty.txt обёртки снят — список не дублируется.
# B-N-1862: только явное po_osnove:true допускает ту же X.Y.Z с одним суффиксом -bNNNN или без него.
# Иная основа не проходит перенумерацией; код, признак, причина и срок по-прежнему обязательны.
# Без этого поля прежнее сравнение сохранено. Не доказывает равенство кода копии; это предмет П7 выпуска.
# B-N-1987 (обход 3.1.7, Заря; замысел ред.2 38113c45, ГОДНО Вениамина 13:42Z): суд ПО ПОКРЫТИЮ. Прежде признак, встреченный
#   ХОТЬ РАЗ, делал ожидаемым ВЕСЬ стенд — запись прятала вторую поломку того же стенда с тем же кодом (живой пример 10.10:
#   stend-publikacii, 79-я слепота «состав против диска» без признака). Теперь КАЖДАЯ красная строка (KRASNAYA: ❌ FAIL Error
#   СЛЕПОТА СЛЕПА ПРОПУСК ✗ ✖ «not ok», строки с ✅ — нет) обязана нести признак записи; priznak — строка или СПИСОК
#   фиксированных подстрок; признак короче 12 знаков или равный маркеру — негоден. Красных строк нет — только с pokrytie: kod
#   (пересмотр ≤14 суток, сводка называет поимённо). kopiya: <путь> (B-N-1981) — запись только для этой копии стенда.
# ⚠️ ЧЕГО НЕ ЛОВИТ: таймер, не сработавший вовсе (сторож над сторожем — отдельный пункт); стенд, обрывающийся на первом
#   провале (assert) — второй беды он не печатает; провал без маркера KRASNAYA рядом с другими красными строками; новый
#   провал с тем же текстом, что ожидаемый; признак длиннее 12 знаков, но всё равно общий.
# B-N-1982/1981 (обход 3.1.8, Искра; наряд Забавы 15:38:54Z): (1) копия моста anna — в области (@anna /opt/anna/app,
#   cel-mosta и predelov-iz-fajla; журнал своей службы anna читает сама — MOST_ZHURNAL_YUNITA не нужен, замер 10.10 15:4xZ
#   9 = 9 строк от anna и от root); (2) «исключение устарело» (зелёная ветка) учитывает kopiya: запись копии A на зелёной
#   копии B не советует «снять запись» (3.1.7 учёл kopiya только в красной ветке sudit).
set -u
# Шаблоны каталогов пакетов, по одному на строку. Без eval; пути могут содержать пробелы.
# Явно пустая область означает «ничего не обходить»: код 2, без подстановки умолчания.
# Строка области: «шаблон» — обходим под своей учёткой; «шаблон @учётка корень-платформы» — чужой боевой
# каталог: перебор, прогон и сверка перечня идут через `sudo -n -u учётка`, DSH_TEST_APP = корень его платформы.
# 🔴 ЗАЧЕМ ЧЕРЕЗ ЕГО УЧЁТКУ, А НЕ ПРАВАМИ НА ЕГО ДОМ (A-N-745, 24.09): каталог плагина Петровича 775 petrovich:petrovich —
# стенд оттуда, исполненный под iskra (NOPASSWD: ALL), дал бы dsh путь в root. Под dsh исполняется код dsh.
# ⚠️ Учётка и корень берутся ТОЛЬКО отсюда; строка «@» без корня — отказ (код 2), а не подстановка своего.
# B-N-986 (26.09.2026): пакеты, у которых БОЙ = ДЕРЕВО (path в plugins.yaml — каталог дерева), обходятся по пути дерева —
# как метапакет dsh-pamyat. Сейчас таких два: dsh-pamyat (метапакет) и dsh-pamyat-vyvoz (ручной инструмент, A-H-050). Без этого
# ворота выпуска (PAKET_IMYA) слепли на vyvoz кодом 2: ворота зовут ТОЛЬКО этот обходчик (B-H-060), npm test дерева не гоняют.
# B-N-1410 (02.10.2026, Заря; находка разбора обхода 02.10 [8]): stend-smontirovat-vypusk-args.sh (B-N-1401) был в перечне без строки
# области — «вне области» в ночном итоге; строка без «@»: шапка стенда «Root не нужен», всё во временных каталогах.
# B-N-1395 остаток (02.10.2026, Заря): стенд сторожа лимита Codex — под своей учёткой (замер 44 с); стенд переключателя Codex —
# «@root»: его случай G проверяет чтение носителя учёткой юнита через runuser, под iskra он ложно краснеет (стенд сам даёт код 2).
# B-N-1412 (02.10.2026, Аврора; находка Беты): два стенда dsh-telegram-multiagent читают /opt/claude-oauth (750 claudeoauth; права
# не расширяем — Вениамин) — под iskra их честный исход «нет доступа», судить их — от root. ФАЙЛ, НАЗВАННЫЙ СВОЕЙ СТРОКОЙ ОБЛАСТИ,
# ИЗ КАТАЛОГОВОЙ ВЫБОРКИ НЕ БЕРЁТСЯ (строка файла главнее каталога; совпадение — по пути целиком): иначе он шёл бы дважды — каталогом
# под iskra и строкой под root. В режиме одного пакета (PAKET_IMYA) такие файлы под каталогом пакета берутся вместе с ним — строкой
# «СТЕНД ПАКЕТА ОТДЕЛЬНОЙ СТРОКОЙ:» (не «КАТАЛОГ ПАКЕТА:» — тот ворота разбирают как каталог для сверки дерева с боем).
# ⚠️ ЧЕГО НЕ ЛОВИТ: файловую строку с путём, записанным иначе (ссылка, «//», «/./»), — совпадения нет, стенд пойдёт дважды (видно:
#   имя дважды в выводе, «прошло N+1 из N» в покрытии).
# B-N-1477 (03.10.2026, Заря; заказ Вениамина): stend-prav-domov.sh — читатель пробы ПРАВ ДОМОВ (живое, только чтение) под iskra:
#   ей нужен sudo -n -u nobody/omega/claude/учётки фермы (у iskra NOPASSWD), поэтому строка без «@».
# B-N-1477 т.3: stend-mest-kopij.sh — читатель пробы МЕСТ КОПИЙ (montazh, /home/claude, zadaniya-prervany-watch, /tmp/z-*), тот же порядок;
#   /tmp проба судит через /proc/1/root/tmp — у обходчика PrivateTmp=yes.
# B-N-1458/B-N-1482: источник Claude-стенда читает обходчик; временную root-копию исполняет claudeoauth.
# Его HOME/токен/API/мост/БД/ящик подставные; файловая строка исключает повтор из каталоговой выборки.
# 🔴 Копии четырёх явно названных SDK-стендов исполняются от claudeoauth, которому доступны БОЕВЫЕ токены подписок
#   (/etc/claude-oauth): правка этого стенда = правка кода с этим доступом, ревью соответствующее (замечание Искры/Вениамина 02.10).
#   Комментарий — здесь, а не у самой строки: внутри OBLAST_STENDOV «#» не пропускается и стал бы шаблоном пути.
# A-N-1518 (04.10.2026, Аврора; наряд Забавы 16:01Z): вписаны стенды, лежавшие на диске вне области обхода — замер 04.10:
#   dorabotki 88 стендов, вне области 45; дерево packages 391, вне 30; боевые копии агентов вне — только ссылки и побайтные
#   копии покрытого (0 непокрытого). Из 75 НЕ вписаны 14 опасных/ручных (⛔ «НЕ ЗАПУСКАТЬ БЕЗ ПОДМЕН», «в суточный обход
#   не ставить», stop/start боевых таймеров, обязательный довод, риск настоящего письма) и 16 не зелёных в пробе 04.10
#   16:06–16:11Z под iskra — поимённо в П7 A-N-1518. Вписаны 45 зелёных + stend-pered-podyomom.mjs (зелёный лишь в редакции
#   d89a1507; с мёртвой 2b1ebef6 красный — монтировать стенд ДО этой строки).
# 🔴 СРЕДА stend-pered-podyomom: имя STEND_PLAGINY занято дважды — юнит обходчика задаёт его для стенда набора dsh-pamyat
#   (каталог плагинов, /opt/agent-plugins), а стенд подъёма читает то же имя как node_modules. Без строки SREDA_STENDOV
#   он получает чужое значение и падает «lstat /opt/agent-plugins/dsh-pamyat-core» (проба 04.10).
# B-N-1632 остаток (05.10, разбор Гаммы 4e4c8dab, П7 40ba11a7; наряд Забавы 15:36Z): stend-shag0-bez-metki.mjs telegram 2.5.92+ (шаг 0
#   B-N-1600: письмо без метки не входит в идущий ход) — под root со средой GATEWAY_CANDIDATE=/opt/claude-oauth: замер 05.10 — 0;
#   без переменной и под iskra — 2 «СЛЕПОТА … задайте GATEWAY_CANDIDATE». Исключения code2 нет: код 2 здесь — поломка среды, а не допуск.
# B-N-1695 (06.10, Искра): stend-mcp-spiska-dvizhkom.mjs — список инструментов моста Варвары проверяет ТОТ ЖЕ ДВИЖОК, что в шлюзе
#   (claude-agent-sdk 0.3.289 / Claude Code 2.1.289 из /opt/subscription-gateway-guest), а не парсер SDK: схема без верхнего «type:object»
#   роняет у движка ВЕСЬ список. Под iskra (мост и гостевой шлюз читаемы), ~11 с, к модели не ходит. Пара к stend-mcp-input-schemas Гаммы.
# A-N-1728 (07.10, Искра; слово Забавы 03:23:38Z): двойники dorabotki/stend-kontrakt-kodov.sh и stend-kto-podnimal-bajty.sh сняты вместе
#   с копией dorabotki/kto-podnimal.sh (разошлась с боем: 26959 Б против 42204 Б; источник боя — пакет dsh-pribory, pary-boj.txt:33).
#   Обход идёт стендами пакета против БОЕВОГО /usr/local/bin/kto-podnimal (STEND_PRIBOR в SREDA_STENDOV); контракт кодов пакета внесён.
#   🔴 СЛУЖБА — systemd-resolved, НЕ iskra.service: стенд пакета берёт неподвижное окно -30d, а время растёт с журналом службы
#   (iskra.service 07.10 — 129 047 строк, обрыв по пределу 185 с, код 124). systemd-resolved 07.10: 67 строк, подъёмы 30.09 и 02.10, 6 с.
#   ⚠️ ГРАНИЦА: подъёмы resolved — только загрузки ОС; без перезагрузки подъём 02.10 выйдет из окна (30 суток или ротация журнала,
#   10 ГиБ ≈ 25 суток) — стенд громко ослепнет «подъёмов НЕ БЫЛО» (код 2), а не позеленеет. Лечение — окно «от подъёма» (B-N-1668
#   двойника) в стенд пакета, отдельный пункт.
# 1.0.35 (09.10, Искра; слово Забавы 02:20:52Z): +stend-gost-odna-podpiska @root (B-N-1621; чтение sudo -u <User юнита>, от iskra «нужен root»);
#   +dsh-storozha-mashiny stend-klass-padenie @root (временные юниты systemd-run) и stend-storozh-dvizhkov (был вне обхода, краснел 10/12 с 2.0.9 незамеченным);
#   +stendy/stend-mashinnoj-redakcii.py — с 1.0.32 (B-N-1877) стоял только в ПЕРЕЧНЕ, в области не был: обходчик его не звал ни разу (мой промах 1.0.32).
# 1.0.37 (09.10, Искра; решение Забавы 03:23:17Z, лечение Авроры B-N-1889): копия stend-gost-odna-podpiska в test/ пакета subscription-gateway шла
#   каталогом под iskra → «нужен root», код 2, ворота 1.4.53 отказали; теперь строкой файла @root. Исключение отвергнуто: сделало бы ожидаемой и настоящую слепоту.
# 1.0.37 (окно, Забава 03:33:26Z): +B-N-1891 stendy/stend-dogovora-trevogi.sh в ОБЛАСТЬ (был в перечне без области; от iskra 6/6); PREDEL stend-vorot-vypuska 300 с
#   (вырос 74 → 127 с после B-N-1824/1823/1864, общий 120 с рубил кодом 124); снят дубль dorabotki/stend-gost-odna-podpiska.sh (тот же стенд — строкой пакета выше).
# 1.0.41 (09.10, Искра; условие Вениамина к B-N-1901, Забава 04:52:52Z): +oom-watch/test/stend-yunit-trevoga.py — юнит из пакета несёт канал тревоги
#   (Environment=OOM_WATCH_ALERT); пока стенда нет в области, защита B-N-1901 не считается заведённой. От iskra в юните с PrivateTmp=yes — PASS.
# 3.1.39 (14.10, Аврора; B-N-2029/2030/2033, dsh-montazh 3.1.11; LOW Вениамина 01:5xZ): +три стенда ворот меток в /usr/local/libexec (как
#   stend-metki-vorot) БЕЗ @root — их root-шаги (полка/журнал root:root) идут через sudo -n внутри стенда; source-only и mesta-po-id — с TMPDIR.
# 1.0.44 (09.10, Искра; слово Забавы 07:09:53Z, B-N-1913 dsh-storozha-sadik 1.0.8 Авроры): +dsh-storozha-sadik/test/stend-gruppy-prav.sh БЕЗ @root —
#   пакета в области не было, стенд сам не попадал; под iskra в юните — код 0 (Вениамин 7/7).
# B-N-2018 (12.10, Аврора): +dsh-storozha-sadik/test/stend-ostrov-kopiya-watch.py БЕЗ @root — как stend-gruppy-prav: подмены OKW_*,
#   свой HTTP на 127.0.0.1, временный каталог; предмет без довода — боевой /usr/local/sbin/ostrov-kopiya-watch.
# B-N-2040 (14.10, Заря): +dsh-storozha-sadik/test/stend-pamyat-fill-predel.py БЕЗ @root — подставной journalctl (python -c), журналы
#   машины не читает; предмет без довода — боевой /usr/local/libexec/pamyat-fill-watch.py (root 644, читается iskra). От iskra 6/6.
# 3.1.98 ред.7 (17.10, Искра; выбор (а) Забавы 09:59Z, условие 2 Вениамина 08:27Z к dsh-storozha-sadik 3.1.19): +dsh-storozha-sadik/test/stend-enabled.py
#   БЕЗ @root — настоящий сборщик/читатель sadik-watch-enabled.sh с подменёнными systemd/реестром, 24 случая, ~1,5 с, от iskra 24/24.
#   Файл появляется в дереве ТОЛЬКО влитием 3.1.19 — в окне влитие идёт ДО монтажа этих строк (иначе «В ПЕРЕЧНЕ ЕСТЬ, НА ДИСКЕ НЕТ»).
# B-N-2018 (12.10, Аврора; находка 17:45Z, наряд Забавы 17:45:53Z): stend-crm-caller Варвары — +OSTROV_API_MANIFEST/OSTROV_API_HEALTH:
#   стенд (dsh-tool-bridge, следующий номер 3.1.2) теперь зовёт sverkaKopii — отставшая копия = СЛЕПОТА, а не молчаливый прогон по старому API.
# B-N-1920 (09.10, Аврора; находка Зари 07:34Z): stend-mcp-input-schemas Варвары — @varvara вместо @root: под root (и под iskra —
#   у неё NOPASSWD) исполнялись стенд и src моста из дома гостя (пишет varvara); GATEWAY_CANDIDATE — гостевой шлюз (её же, root 755).
OBLAST_STENDOV="${OBLAST_STENDOV-/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/test/stend-montazh-okno.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/test/stend-flagi-okna.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/test/stend-prewindow-gate.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/test/stend-copy-window.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/test/stend-montazh-producer.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-montazh/test/stend-zhivaya-montazh.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-montazh-mode.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-dve-kopii-montazh.sh @root /opt/iskra/app
/opt/agent-plugins/node_modules/dsh-vypusk-watch/test/stend-montazh-okno.py @root /opt/iskra/app
/opt/agent-plugins/node_modules/dsh-pamyat-storozha/test/stend-preset-lifecycle.mjs @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-montazh-sutochnye.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/dorabotki/stendy/stend-nashi-montazh.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-codex-app-server.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-g-journal-size.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-r-journal-size.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-g-source-contract.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-ap-accounting.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-podpiski/test/stend-audit-kraev.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-limity/test/stend-audit-sostoyanie.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-audit-kraev.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-audit-deadline.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-audit-yunits.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-audit-porchi.py
/opt/iskra/workspace/dsh-plugins/packages/a2a-bus/test/stend-alpha.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/dorabotki/stendy/stend-reestr-verify-root.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/a2a-bus/test/stend-limit-owner.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-b2023-reader.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-b2023-consumers.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-b2023-watch.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-b2023-watch-state.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-podpiski/test/stend-b2023-receiver.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-podpiski/test/stend-switch-bot.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-socseti/test/stend-b2023-social.py @root /opt/iskra/app
/opt/iskra/plugins/dsh-subscription-adapter/test/stend-audit-contract.mjs @iskra /opt/iskra/app
/opt/iskra/plugins/dsh-subscription-adapter/test/stend-audit-docs.mjs @iskra /opt/iskra/app
/opt/iskra/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @iskra /opt/iskra/app
/opt/zarya/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @zarya /opt/zarya/app
/opt/avrora/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @avrora /opt/avrora/app
/opt/spartak/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @spartak /opt/spartak/app
/opt/varvara/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @varvara /opt/varvara/app
/opt/coders/alfa/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @coders /opt/coders/alfa/app
/opt/coders/beta/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @coders /opt/coders/beta/app
/opt/coders/gamma/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @coders /opt/coders/gamma/app
/opt/marc/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @marc /opt/marc/app
/opt/anna/plugins/dsh-subscription-adapter/test/stend-spool-conversation.mjs @anna /opt/anna/app
/opt/socseti-anna/test/stend-meta-watch.mjs @anna /opt/anna/app
/usr/local/libexec/stend-varvara-fs-deny.mjs @varvara /opt/varvara/app
/opt/varvara/plugins/dsh-tool-bridge/test/stend-mcp-input-schemas.mjs @varvara /opt/varvara/app
/opt/iskra/plugins/*/
/opt/agent-plugins/dsh-telegram-multiagent/
/opt/agent-plugins/node_modules/*/
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat/
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/test/stend-audit-boundaries.mjs @iskra /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/test/stend-audit-docs.mjs @iskra /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-schedule-guard/test/stend-audit-runtime.mjs @iskra /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-schedule-guard/test/stend-audit-docs.mjs @iskra /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-schedule-guard/test/stend-native-lifecycle.mjs @iskra /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-vyvoz/
/opt/iskra/workspace/dorabotki/stend-priyomki-kopii.sh
/opt/iskra/workspace/dorabotki/stendy/stend-oblasti-fajlom.sh
/opt/iskra/workspace/dorabotki/stendy/stend-obsluzhivaniya-store-pin.sh
/opt/iskra/workspace/dorabotki/stendy/stend-isklyuchenij-obhodchika.sh
/opt/iskra/workspace/dorabotki/stendy/stend-skillov.sh
/opt/iskra/workspace/dorabotki/stendy/stend-propuska-paketa.sh
/opt/iskra/workspace/dorabotki/stendy/stend-pokrytiya-kopij-mosta.sh
/opt/iskra/workspace/dorabotki/stendy/stend-osnovy-versii.py
/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh
# B-N-1923 (09.10, dsh-montazh 1.0.18 Зари; слово Забавы 11:30Z): стенд следа ворот и сторожа меток мимо ворот — иначе читателя у стенда нет (ворота пакетов дерева стенды не гоняют). Под iskra: sudo -n зовёт сам.
/usr/local/libexec/stend-metki-vorot.sh
/usr/local/libexec/stend-zagolovka-versii.py
/usr/local/libexec/stend-source-only.py
/usr/local/libexec/stend-mesta-po-id.py
/usr/local/libexec/stend-vypusk-kopii.py
/opt/iskra/workspace/dorabotki/stend-sekretov-na-mestah.sh
/opt/iskra/workspace/dorabotki/stend-poteri-pisem.mjs
/opt/iskra/workspace/dorabotki/stend-snyatie-ogranichitelej.mjs
/opt/iskra/workspace/dorabotki/stend-stop-pobudok.mjs
/opt/iskra/workspace/dorabotki/stend-verdiktov-istochniki.mjs
/opt/iskra/workspace/dorabotki/stend-pravki-reestra.sh
/opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh
/opt/iskra/workspace/dorabotki/stend-vidimosti-a2a.sh
/opt/iskra/workspace/dorabotki/stend-reestra-agentov.sh
/opt/iskra/workspace/dorabotki/stend-registry-json.sh
/opt/iskra/workspace/dorabotki/stendy/stend-compact-watch.sh
/opt/iskra/workspace/dorabotki/stendy/stend-doli-preseta.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-ucheta.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh @root /opt/iskra/app
# B-N-1755 (07.10, Михалыч; наряд Забавы, находка Искры 11:23Z): два стенда smontirovat-fajly без читателя — под root, как stend-ucheta
#   (инструмент пишет в /var/backups/montazh и учёт /usr/local); довод — путь инструмента, хвостом «--» в SREDA_STENDOV. Читатель обхода
#   (B-N-1741, Аврора) — под iskra: предмет /usr/local/sbin/chitatel-obhoda root 755, ночи и канал подставные.
/opt/iskra/workspace/dorabotki/stendy/stend-mihalycha.sh @root /opt/iskra/app
# B-N-1848 (08.10, Аврора; обход 1.0.23): стенд --osnova smontirovat-fajly — от root (пишет в журнал инструмента и /var/backups/montazh/PROBA-B1848-*, убирает сам); предмет по умолчанию — боевой /usr/local/sbin/smontirovat-fajly
/opt/iskra/workspace/dorabotki/stendy/stend-osnova.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-ucheta-git.sh @root /opt/iskra/app
# B-N-1817 покрытие (08.10, Михалыч; решение Забавы): правило соседей --novyj без ключей — читатель только этот стенд, от root
/opt/iskra/workspace/dorabotki/stendy/stend-rezhim-novogo.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-chitatelya-obhoda.py
/opt/iskra/workspace/dorabotki/stendy/stend-nemoty-posle-szhatiya.py
# B-N-1768 (07.10, разбор Авроры; наряд Забавы 15:20Z): pochtalona, a2a-owner-copy-watch, mail-stop-hold — под iskra; trust-sverka — от root, довод в SREDA_STENDOV.
/opt/iskra/workspace/dorabotki/stend-pochtalona.sh
/opt/iskra/workspace/dorabotki/stendy/stend-a2a-owner-copy-watch.sh
/opt/iskra/workspace/dorabotki/stendy/stend-mail-stop-hold.sh
/opt/iskra/workspace/dorabotki/stendy/stend-trust-sverka.sh @root /opt/iskra/app
# B-N-1768 такт 2 (Аврора): atsiklichnosti от root (под iskra учёт agent-plugins verify слеп — код 2), obyavlenij-profilej и pokrytiya под iskra, stend-profil от root.
/opt/iskra/workspace/dorabotki/stend-atsiklichnosti.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stend-obyavlenij-profilej.sh
/opt/iskra/workspace/dorabotki/stend-pokrytiya.sh
/opt/iskra/workspace/dorabotki/stendy/stend-profil.sh @root /opt/iskra/app
# B-N-1768 такт 3 (07.10, разбор Михалыча 21:21Z, решения Забавы 21:22Z): hranilishcha-sekretov (под iskra: замер 21:25Z ok=296 fail=0 слепота=0;
#   sistemnoe 2750 — «после решения по 2700» снято фактом) и vozrast-pisma (красный по находке telegram e3b6017 — исключение ОЖИДАЕМО).
/opt/iskra/workspace/dorabotki/stend-hranilishcha-sekretov.sh
/opt/iskra/workspace/dorabotki/stend-vozrast-pisma.mjs
# B-N-1768 (07.10, слово Забавы 15:46Z): stend-mail-new-iskra-sadik.mjs telegram 2.5.108+ (B-N-1624) требует root (getuid, иначе СЛЕПОТА код 2) —
#   пропуск при выпуске 2.5.108: строки «от root» в области не было, ночь дала бы НЕОЖИДАННО. От root 07.10 15:4xZ — все PASS, код 0.
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-new-iskra-sadik.mjs @root /opt/iskra/app
# A-N-1948 №2 (10.10, ворота меток telegram 3.1.1 06:45Z): stend-maska-modul-prava.mjs (№22) требует root — модуль-подстава root и
#   порча владельца; без строки «от root» под iskra он СЛЕП (код 2), выпуск получил бы НЕОЖИДАННО.
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-maska-modul-prava.mjs @root /opt/iskra/app
# 1.0.5: такт 3 Авроры — снятие файлов и профиля smontirovat-fajly, от root (довод в SREDA_STENDOV); два .py-стенда, стоявшие
#   в перечне без строки области (otbros-shlyuza B-N-1698, zhivaya-versiya) — под iskra, замер 07.10: 11 из 11 и 7 из 7.
/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-voice-root.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-sadik-watch-zastryal.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya-profilya.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-otbros-shlyuza.py
/opt/iskra/workspace/dorabotki/stendy/stend-zhivaya-versiya.py
/opt/iskra/workspace/dorabotki/stendy/stend-imeni-v2.sh
/opt/iskra/workspace/dorabotki/stendy/stend-sobrat-kuda.sh
/opt/iskra/workspace/dorabotki/stendy/stend-razbora-env.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-podpiski.sh
/opt/iskra/workspace/dorabotki/stendy/stend-priyomnik-itog.sh
# B-N-1776 такт 4 (07.10, Аврора; ГОДЕН Вениамина 18:05Z): стенд читателя лимитов переключателя — под iskra, подставная база, по умолчанию боевые читатель и настройка; стенд службы dsh-limity — НЕ здесь: ворота Вениамина 18:48Z (стенд из рабочего дерева судит sbin дерева, root исполнял бы файл дерева) — копией в 1.0.8
/opt/iskra/workspace/dorabotki/stendy/stend-limity-pereklyuchatelya.py
/opt/iskra/workspace/dorabotki/stend-kurera.sh
/opt/iskra/workspace/dorabotki/stendy/stend-opisat-kartinku.sh
/opt/iskra/workspace/dorabotki/stend-priyomki-po-raspisaniyu.sh
/opt/iskra/workspace/dorabotki/omega-b-p-060/stend-b-p-060.sh
/opt/iskra/workspace/dorabotki/stend-razmer-kopii-watch.sh
/opt/petrovich/.dsh/profiles/web/plugin/dsh-schedule-guard/ @petrovich /opt/petrovich/app
/opt/zarya/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @zarya /opt/zarya/app
/opt/zarya/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @zarya /opt/zarya/app
/opt/avrora/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @avrora /opt/avrora/app
/opt/avrora/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @avrora /opt/avrora/app
/opt/marc/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @marc /opt/marc/app
/opt/marc/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @marc /opt/marc/app
/opt/spartak/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @spartak /opt/spartak/app
/opt/spartak/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @spartak /opt/spartak/app
/opt/varvara/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @varvara /opt/varvara/app
/opt/varvara/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @varvara /opt/varvara/app
/opt/varvara/plugins/dsh-tool-bridge/test/stend-ostrov-api.mjs @varvara /opt/varvara/app
/opt/varvara/plugins/dsh-tool-bridge/test/stend-saved-plans.mjs @varvara /opt/varvara/app
/opt/coders/alfa/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @coders /opt/coders/alfa/app
/opt/coders/alfa/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @coders /opt/coders/alfa/app
/opt/coders/beta/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @coders /opt/coders/beta/app
/opt/coders/beta/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @coders /opt/coders/beta/app
/opt/coders/gamma/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @coders /opt/coders/gamma/app
/opt/coders/gamma/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @coders /opt/coders/gamma/app
/opt/anna/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @anna /opt/anna/app
/opt/anna/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @anna /opt/anna/app
/opt/master/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @master /opt/master/app
/opt/master/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @master /opt/master/app
/opt/sova/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @sova /opt/sova/app
/opt/sova/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @sova /opt/sova/app
/opt/vintik/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @vintik /opt/vintik/app
/opt/vintik/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @vintik /opt/vintik/app
/opt/shpuntik/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @shpuntik /opt/shpuntik/app
/opt/shpuntik/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @shpuntik /opt/shpuntik/app
/opt/gayka/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @gayka /opt/gayka/app
/opt/gayka/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @gayka /opt/gayka/app
/opt/shurup/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @shurup /opt/shurup/app
/opt/shurup/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @shurup /opt/shurup/app
/opt/tumbler/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs @tumbler /opt/tumbler/app
/opt/tumbler/plugins/dsh-tool-bridge/test/stend-predelov-iz-fajla.mjs @tumbler /opt/tumbler/app
/opt/iskra/workspace/dorabotki/stend-kanarejki-shlyuza.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-rolej-shlyuza.mjs @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-git.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-gruppy-prav.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-ostrov-kopiya-watch.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-pamyat-fill-predel.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-enabled.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/
/opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-claude-task-control.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-guest-tools.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-ingress-auth.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-gost-odna-podpiska.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-model-podmena.sh
/opt/iskra/workspace/dorabotki/stendy/stend-aclaude-snaruzhi.sh
/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-args.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-strahovka.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-codex-limit-watch.sh
/opt/iskra/workspace/dorabotki/stendy/stend-sborshchika-kopii.sh
/opt/iskra/workspace/dorabotki/stendy/stend-pereklyuchatelya-codex.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-podpisok.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-svesti-dostup-watch.sh
/opt/iskra/workspace/dorabotki/stendy/stend-obnovitel-prava.sh @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-codex-control.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-stop-route.mjs @root /opt/iskra/app
# B-N-2010: зависимости шлюза в /opt/claude-oauth (750) — под root; отсутствующие стенды пока не выбираются.
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-live-process.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-claude-process.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-postcompact-process.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-live-turn.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-common-template.mjs
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-idle-status.mjs
# B-N-1613 (05.10, Михалыч): telegram 2.5.81. mail-stop-* ниже — под iskra «СЛЕПОТА: … needs root-owned …», под root 0 (замер 05.10 ~04:50Z).
# Шесть стендов дерева (среда — SREDA_STENDOV, B-N-1607) — под root: GATEWAY_CANDIDATE=/opt/claude-oauth (claudeoauth 0750) учётке iskra
# не читается → «СЛЕПОТА: нет /opt/claude-oauth/task-control.mjs» (2×6); под root со средой обходчика — 0×6.
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-arrival.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-courier.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-expired-delivery.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-ingress-native.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-local-sender.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-sender.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-status-io.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-status-trust.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-unloaded-native.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-claude-input-signature-native.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-inbox-nextturn.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-receiver-r2-ack.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-receiver-r2-casunknown.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-receiver-r2-closeflush.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-sdk-http.mjs @root /opt/iskra/app
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-shag0-bez-metki.mjs @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stendy/stend-prav-domov.sh
/opt/iskra/workspace/dorabotki/stendy/stend-mcp-spiska-dvizhkom.mjs
/opt/iskra/workspace/dorabotki/stendy/stend-mest-kopij.sh
/opt/iskra/workspace/dorabotki/stendy/stend-sajt-chat.sh
/opt/iskra/workspace/dorabotki/stendy/stend-hvostov.sh
/opt/iskra/workspace/dorabotki/stendy/stend-vorot-perenosa.sh
/opt/iskra/workspace/dorabotki/stendy/stend-montazha.sh
/opt/iskra/workspace/dorabotki/stendy/stend-switch-1.sh @root /opt/iskra/app
/opt/iskra/workspace/dorabotki/stend-agent-limits.sh
/opt/iskra/workspace/dorabotki/stend-U0-istochnik.mjs
/opt/iskra/workspace/dorabotki/stend-B14-snimok.sh
/opt/iskra/workspace/dorabotki/stend-373-svodki-vne-vydachi.mjs
/opt/iskra/workspace/dorabotki/stend-svyazok-podpisok.sh
/opt/iskra/workspace/dorabotki/stend-izmeritelya.sh
/opt/iskra/workspace/dorabotki/stend-soglasie-sloev.sh
/opt/iskra/workspace/dorabotki/stend-svershchika.sh
/opt/iskra/workspace/dorabotki/stend-compaction-zaveden.mjs
/opt/iskra/workspace/dorabotki/stend-skill-links.sh
/opt/iskra/workspace/dorabotki/stend-priznaka-oblasti.sh
/opt/iskra/workspace/dorabotki/stend-apt-notify.sh
/opt/iskra/workspace/dorabotki/stend-otmetki-priyomki.sh
/opt/iskra/workspace/dorabotki/stend-proverki-opory.mjs
/opt/iskra/workspace/dorabotki/stend-ohvat-i-sverka.mjs
/opt/iskra/workspace/dorabotki/stend-vtoroj-vhod-svodki.mjs
/opt/iskra/workspace/dorabotki/stend-cepi-pamyati.mjs
/opt/iskra/workspace/dorabotki/stend-uborki-pisma.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-core/test/stend-shemy-bez-istorii.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-omega/test/stend-bez-isklyucheniya.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-omega/test/stend-zapisi-bez-politiki.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-pamyat-restore/test/stend-bez-isklyucheniya.mjs
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-kontrakt-kodov.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-kto-podnimal-bajty.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-nastrojki.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-skill-links.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-audit-runtime.py
# B-N-1922 (09.10, dsh-reestr 2.0.9 Михалыча): стенды дерева dsh-reestr сняты — stend-nastrojki в 2.0.9 удалён; stend-priznaka-oblasti и stend-pravki-reestra = боевым копиям dorabotki (те в области) — гонялись дважды.
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-audit.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-agent-limits.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-agent-watchdog.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-apt-notify.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-bash-padenie-70.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-dkms-kernel-coverage.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-doli-preseta.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-dsh-upstream-watch.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-dve-kopii.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-hvostov.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-inet6-poyavlenie.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-klass-padenie.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-podyom-mimo-vorot.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-predel-dliny-watch.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-python-padenie-70.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-storozh-dvizhkov.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-mashiny/test/stend-yadro-predohranitel.sh
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-agent-alert.sh
/opt/iskra/workspace/dsh-plugins/packages/omega-memory/test/stend-gruppy.sh
/opt/iskra/workspace/dsh-plugins/packages/omega-memory/test/stend-audit.py
/opt/iskra/workspace/dorabotki/stendy/stend-pered-podyomom.mjs
/opt/iskra/workspace/dorabotki/stendy/stend-mashinnoj-redakcii.py
/opt/iskra/workspace/dorabotki/stendy/stend-dogovora-trevogi.sh
/opt/iskra/workspace/dsh-plugins/packages/a2a-bus/test/stend-outgoing-mirror.py
/opt/iskra/workspace/dsh-plugins/packages/a2a-bus/test/stend-13-21.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-init-zavesti.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-ap-pochta.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-obratno-granica.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-yashchik-rezhim.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-soc-anna.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-pokrytiya-installed-check.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-reestr/test/stend-owner-reader.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-nastroek-proby.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-porchi.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-watch-hvost.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-trevogi/test/stend-sposob2.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/oom-watch/test/stend-cli.py
/opt/iskra/workspace/dsh-plugins/packages/oom-watch/test/stend-audit.py
/opt/iskra/workspace/dsh-plugins/packages/oom-watch/test/stend-yunit-trevoga.py
/opt/iskra/workspace/dsh-plugins/packages/voice-stack/test/stend-archive-warning.py
/opt/iskra/workspace/dsh-plugins/packages/voice-stack/test/stend-voice-tools.py @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/voice-stack/test/stend-runtime-contract.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-autopilot/test/stend-dsh-autopilot.sh @root /opt/iskra/app
/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/test/stend-autopilot-mail-health.py @root /opt/iskra/app
/usr/local/lib/omega-shlyuz/stend-shlyuza-omega.py @root /opt/iskra/app}"
# Предел одного стенда: по умолчанию 120 с; B-N-1439, замеры Беты 02.10.2026 под iskra/PrivateTmp.
# kontrakt: строка 185 с снята 07.10 (A-N-1728) вместе с двойником dorabotki; стенд пакета на systemd-resolved — 6/6 за 6 с, общих 120 с хватает.
# mimo: пять полных sadik-watch; худший измеренный интервал 291,873 → 292 с × 5 = 1460;
# предел 1800 с = 1460 + 340 с запаса (23,3%). Для приёмки нужен полный новый прогон 9/9.
# Переименование пути вернёт общий предел 120 с; это не лимиты отдельных внутренних проб.
# B-N-1613 (05.10, Михалыч): stend-mail-stop-expired-delivery спит 150 с ради TTL 120 с — полный прогон под root: 2.5.78 151 с,
# 2.5.81 150 с (код 0); 151 × 1,5 = 226,5 → 230 с.
# A-N-1975 (10.10, Заря): +ветка метапакета, 286 с × 1,5 → 430 с (stend-vorot-vypuska; прежде 300 при ночном 275 с).
# 3.1.97 (B-N-2093 r3, 17.10, Искра): stend-skillov — свой общий предел 300 с (17 скиллов × ≤30 с, остаток — СЛЕПОТОЙ);
#   обходчику 330 с, чтобы обрыв по 124 не опередил собственную слепоту стенда. Замер полного прогона — 0,5 с (17.10, 3 прогона).
# 3.1.98 (B-N-2104(1), 17.10, Искра; слово Забавы 06:22Z): stend-atsiklichnosti — 300 с. Ряд замеров под root (строка области @root):
#   ночь 16.10 97 с (код 0) · ночь 17.10 108 с (код 1) · 17.10 06:16Z 126 с прямым прогоном (код 0; нагрузка 7,9) и 124 через обходчик
#   (обрыв на 120 с в разделе 5: nashi --check 108,8 с + agent-plugins verify 21,9 с). Растёт с учётом (752 позиции + обход класса C),
#   ночью рядом ночная копия. 300 = худший замер 126 с × 2,4 — запас на рост учёта и нагрузку копии.
# 3.1.98 ред.4 (17.10, Искра; слово Забавы 07:52Z, ряд Зари B-N-2105, «годно» Вениамина 06:50Z к B-N-2104(2)): stend-reestra-agentov — 210 с.
#   Ночь 17.10 убит по 124 (120/120). Основание — Беты: полный стенд 28/28 под iskra 136,172 с (с её новым читателем 125,9 с);
#   210 = ceil(136,172 × 1,5 / 10) × 10. Число то же, что в обходе 3.1.97 Беты; здесь — чтобы встало этой ночью (до 03:40Z).
PREDEL_STENDOV="${PREDEL_STENDOV-/usr/local/libexec/stend-varvara-fs-deny.mjs 30
/opt/iskra/workspace/dorabotki/stendy/stend-skillov.sh 330
/opt/iskra/workspace/dorabotki/stend-atsiklichnosti.sh 300
/opt/iskra/workspace/dorabotki/stend-reestra-agentov.sh 210
/opt/iskra/workspace/dorabotki/stendy/stend-pravki-mimo.sh 1800
/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh 430
/opt/iskra/workspace/dsh-plugins/packages/dsh-autopilot/test/stend-dsh-autopilot.sh 600
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-expired-delivery.mjs 230}"
predel_stenda() { local p s; while read -r p s; do [ "$p" = "$1" ] && { echo "$s"; return; }; done <<< "$PREDEL_STENDOV"; echo 120; }
# Read-only query for the wrapper's derived budget, before enumeration or any stand execution.
if [ "$#" -gt 0 ]; then
  if [ "$#" -eq 2 ] && [ "$1" = --predel-stenda ]; then predel_stenda "$2"; exit 0; fi
  echo "ОТКАЗ: допустим только --predel-stenda <путь> (либо обход без аргументов)" >&2; exit 2
fi

# Среда ОДНОГО стенда («путь ПЕРЕМЕННАЯ=значение …», по строке): sudo строки «@» сбрасывает окружение, а стенд канарейки шлюза
# (B-N-1048, 26.09, Аврора; решение Забавы — ночной обход) без KANAREJKA_ISHODNYJ_DOM слепнет (умолчания в нём нет намеренно).
# Дом /opt/avrora: в его env есть все единственные ветки anthropic — регресс списка ловится ДО подъёма копии (у iskra
# GATEWAY_BAZA_SESSIJ в env нет). Под root: /etc/claude-oauth другим не проходим; файлы канарейки пишет только iskra (NOPASSWD: ALL).
# ⚠️ Значения без пробелов. Переименуют стенд — строка перестанет совпадать, стенд ГРОМКО ослепнет (код 2), не позеленеет.
# B-N-1588 (05.10, Михалыч; наряд Забавы): stend-codex-control и stend-stop-route (telegram, под root) без GATEWAY_CANDIDATE слепнут
# (код 2, умолчания нет). Дом — исходник шлюза боя /opt/claude-oauth (с него 8 агентов; varvara — гостевой шлюз, вне). Стенды шлюз
# только читают: проба 05.10 — после прогона на копии /opt/claude-oauth diff -rq копия↔бой = 0 строк.
# B-N-1600 (05.10, Искра; наряд Забавы): 5 стендов SDK-входа и stend-mail-stop-sdk-http (стоп, тот же класс; B-N-1607) telegram брали шлюз и адаптер соседями дерева (../../subscription-*),
# в /opt/agent-plugins соседей нет — красное «модуль не найден». С telegram (номер — по выпуску) они берут их через test/sosedi.mjs:
# GATEWAY_CANDIDATE (шлюз боя /opt/claude-oauth) и ADAPTER_CANDIDATE (адаптер 1.1.17 Искры; у avrora/marc/spartak/zarya тот же d114f3e5,
# varvara 0.1.14 — вне); без переменной — СЛЕПОТА, код 2. До выпуска этого telegram строки лишние и безвредны (старые стенды переменные не читают).
# A-N-1711 (07.10, Аврора; наряд Забавы; находка Зари D6): всё ПОСЛЕ токена «--» в строке — ПОЗИЦИОННЫЕ доводы стенду (после пути);
# до «--» — переменные, как прежде. Три стенда сторожа OMEGA требуют $1 «путь к сторожу» (без него «line N: 1: путь к сторожу», код 1 —
# его гасило исключение «ОЖИДАЕМО», и признаки 5б/6/7 omega-kopiya-watch стендом в бою не мерились ни разу). stend-kursora-audita
# (kompakt-dsh ≥1.1.29) без STEND_BOLSHOJ_UNIT слепнет (код 2). С 3.1.107 (kompakt-dsh 3.1.4, (71)+(72), выбор (А) Забавы 18.10 06:21Z) —
# a2a-owner-copy-watch.service: ≈ 150 тыс. записей в журнале 2G (≈ 1,5 сут), единственная служба выше порога 72 000; iskra.service — ≈ 5 тыс.,
# слепота объёма. Учётка обхода (группа systemd-journal) журнал читает. Порог S2 3 с там держится только с kompakt-dsh 3.1.4 (сверка ид
# через --since): на 3.1.3 S2 ≈ 20 с — строка меняется ТЕМ ЖЕ окном, что копия пакета.
# STEND_KONF — боевая настройка пакета: без OKW_PRAVKI признак 6 сторожа слепнет и его слепота ломает такты стендов признаков 7 и 5б.
#   Стенды перекрывают окружением все пишущие ключи (OKW_STATE/PAMYAT/ALERT/CORE) — из файла берутся только OKW_PRAVKI/IMYA/ISKLYUCHENIYA
#   (сторож: os.environ.get(…) or _konf(…)); боевое otdano.json после прогона не меняется (замер 07.10). Пункты правки поставки —
#   разные: мост B-N-1061 (bridge.py ×2), обработчики B-N-1072 (handlers.py ×3) — стенд различает их тревоги.
# A-N-1721 (07.10, Аврора; наряд Забавы): .py-стенды в обходе (python3, PYTHONDONTWRITEBYTECODE=1). Семь .py дерева (a2a-bus, dsh-trevogi ×3, oom-watch,
#   voice-stack ×2) — строками области, как .sh дерева; их прежде не звал никто (dsh-trevogi — только свой vse-stendy.sh пакета).
#   Стенд гостевого шлюза OMEGA — под root (systemd-run временных юнитов), python3 — venv OMEGA (нужен mcp): PATH строкой ниже.
#   Замер 07.10 04:37Z: 18 с, копия службы 22,7 с CPU, юниты и каталоги убирает сам (A-N-1722) — в ночной, не в недельный.
#   stend-cli.py oom-watch требует довод «root» (там bin/oom-watch): /usr/local — боевой (= дерево 282220d7, замер 07.10).
# B-N-1698 этап 2 (07.10, Искра; находка Вениамина): stend-shemy-mosta.mjs шлюза (1.4.47) — читатель фильтра схем моста в БОЕВОМ
#   /opt/claude-oauth/gateway.mjs: настоящий процесс шлюза и движок Claude, подставные API и мост. В бой стенд не едет («files» без test) —
#   поэтому из дерева, Claude-веткой ниже (копия root 0644 → claudeoauth, довод /opt/claude-oauth). Под iskra в раскладке дерева — слепота.
# B-N-1734 (07.10, Искра; находка Авроры A-N-1721): stend-guest-pdf.mjs telegram берёт мост через test/sosedi.mjs (BRIDGE_CANDIDATE) —
#   мост Варвары: гостевой PDF работает у неё (1.3.33-b1700). Без строки стенд — СЛЕПОТА «задайте BRIDGE_CANDIDATE» (код 2), не зелёный.
# B-N-1919 (09.10, Заря; решение Забавы 07:37:40Z, вариант (г)): журнал службы для stend-cel-mosta учётки БЕЗ чтения журнала
#   (гостевой агент — не в systemd-journal, решение 04.10). Обходчик (в systemd-journal) снимает journalctl -u <юнит> с его
#   ActiveEnterTimestamp в файл своего прогона: каталог mktemp 711, файл 600 + ACL u:<читатель>:r; первая строка — шапка
#   «#MOST_ZHURNAL_YUNITA <юнит> <старт>», стенд (tool-bridge ≥1.3.43-b1919) сверяет её с собой. Путь — MOST_ZHURNAL_YUNITA в SREDA ниже.
#   Снятие не удалось — файла нет, стенд слепнет ГРОМКО (ENOENT), не зеленеет. Снимок — на старте обхода: служба поднята позже —
#   шапка ≠ подъёму → СЛЕПОТА. НЕ ловит: подмену файла между снятием и чтением (рука, имеющая права обходчика).
ZHURNALY_OBHODA=$(mktemp -d "${TMPDIR:-/tmp}/obhod-zhurnaly.XXXXXX") && chmod 711 "$ZHURNALY_OBHODA" || ZHURNALY_OBHODA=""
[ -n "$ZHURNALY_OBHODA" ] && trap 'rm -rf -- "$ZHURNALY_OBHODA"' EXIT
snyat_zhurnal_yunita() {   # $1 — юнит, $2 — учётка-читатель
  local f="$ZHURNALY_OBHODA/$1" s
  [ -n "$ZHURNALY_OBHODA" ] || return 0
  s=$(systemctl show "$1" -p ActiveEnterTimestamp --value 2>/dev/null)
  [ -n "$s" ] && ( umask 077; { printf '#MOST_ZHURNAL_YUNITA %s %s\n' "$1" "$s"; journalctl -u "$1" --since "$s" --no-pager -o cat; } > "$f" ) \
    && setfacl -m "u:$2:r" "$f" || rm -f -- "$f"
}
snyat_zhurnal_yunita varvara.service varvara
SREDA_STENDOV="${SREDA_STENDOV-/opt/agent-plugins/node_modules/dsh-vypusk-watch/test/stend-montazh-okno.py MONTAZH_OKNO_BIN=/usr/local/sbin/montazh-okno
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-audit-runtime.py STEND_BIN=/usr/local/bin STEND_OBREZKA=/opt/iskra/workspace/dorabotki/proba-obrezki.sh STEND_POKRYTIE=/opt/iskra/workspace/dorabotki/pokrytie-ozhidaniem-prob.mjs STEND_MINY=/opt/iskra/workspace/dorabotki/iskat-miny-oblasti.mjs STEND_PRIZNAK=/usr/local/libexec/svodka/priznak-vzyatiya.mjs
/opt/iskra/workspace/dsh-plugins/packages/a2a-bus/test/stend-alpha.py STEND_A2A_V2_SOURCE=/usr/local/libexec/a2a-v2.py
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-social-dispatch.mjs SOCSETI_TEST_ROOT=/opt/iskra/workspace/dsh-plugins/packages/dsh-socseti
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-social-edited-message.mjs SOCSETI_TEST_ROOT=/opt/iskra/workspace/dsh-plugins/packages/dsh-socseti
/opt/socseti-anna/test/stend-meta-watch.mjs META_WATCH_CONFIG=/opt/anna/.config/socseti/config.json
/opt/iskra/workspace/dsh-plugins/packages/a2a-bus/test/stend-limit-owner.py STEND_A2A_V2_SOURCE=/usr/local/libexec/a2a-v2.py
/opt/iskra/workspace/dsh-plugins/packages/dsh-socseti/test/stend-b2023-social.py SOCSETI_TEST_NODE_MODULES=/opt/socseti/node_modules SOCSETI_WATCH_SOURCE=/opt/iskra/workspace/dsh-plugins/packages/dsh-storozha-sadik/sbin/socseti-watch
/opt/varvara/plugins/dsh-tool-bridge/test/stend-mcp-input-schemas.mjs GATEWAY_CANDIDATE=/opt/subscription-gateway-guest TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent
/opt/iskra/workspace/dorabotki/stend-kanarejki-shlyuza.sh KANAREJKA_ISHODNYJ_DOM=/opt/avrora
/opt/iskra/workspace/dorabotki/stendy/stend-pered-podyomom.mjs STEND_PLAGINY=/opt/agent-plugins/node_modules
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-codex-control.mjs GATEWAY_CANDIDATE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-stop-route.mjs GATEWAY_CANDIDATE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-live-process.mjs STEND_GATEWAY_NODE_MODULES=/opt/claude-oauth/node_modules STEND_GATEWAY_SOURCE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-claude-process.mjs STEND_GATEWAY_NODE_MODULES=/opt/claude-oauth/node_modules STEND_GATEWAY_SOURCE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-postcompact-process.mjs STEND_GATEWAY_NODE_MODULES=/opt/claude-oauth/node_modules STEND_GATEWAY_SOURCE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-cs-live-turn.mjs STEND_GATEWAY_NODE_MODULES=/opt/claude-oauth/node_modules STEND_GATEWAY_SOURCE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-shag0-bez-metki.mjs GATEWAY_CANDIDATE=/opt/claude-oauth
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-claude-input-signature-native.mjs GATEWAY_CANDIDATE=/opt/claude-oauth ADAPTER_CANDIDATE=/opt/iskra/plugins/dsh-subscription-adapter
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-inbox-nextturn.mjs GATEWAY_CANDIDATE=/opt/claude-oauth ADAPTER_CANDIDATE=/opt/iskra/plugins/dsh-subscription-adapter
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-receiver-r2-ack.mjs GATEWAY_CANDIDATE=/opt/claude-oauth ADAPTER_CANDIDATE=/opt/iskra/plugins/dsh-subscription-adapter
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-receiver-r2-casunknown.mjs GATEWAY_CANDIDATE=/opt/claude-oauth ADAPTER_CANDIDATE=/opt/iskra/plugins/dsh-subscription-adapter
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-sdk-receiver-r2-closeflush.mjs GATEWAY_CANDIDATE=/opt/claude-oauth ADAPTER_CANDIDATE=/opt/iskra/plugins/dsh-subscription-adapter
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-mail-stop-sdk-http.mjs GATEWAY_CANDIDATE=/opt/claude-oauth ADAPTER_CANDIDATE=/opt/iskra/plugins/dsh-subscription-adapter
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-kontrakt-kodov.sh STEND_PRIBOR=/usr/local/bin/kto-podnimal STEND_SLUZHBA=systemd-resolved.service
/opt/iskra/workspace/dsh-plugins/packages/dsh-pribory/test/stend-kto-podnimal-bajty.sh STEND_PRIBOR=/usr/local/bin/kto-podnimal
/opt/agent-plugins/node_modules/dsh-pamyat-storozha/test/stend-modeli-omega.sh STEND_KONF=/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf -- /usr/local/sbin/omega-kopiya-watch
/opt/agent-plugins/node_modules/dsh-pamyat-storozha/test/stend-pravki-postavki-omega.sh STEND_PRAVKI=/etc/agent-registry/omega-pravki-postavki.txt STEND_PUNKT_SEARCH=B-N-982 STEND_PUNKT_BRIDGE=B-N-1061 STEND_PUNKT_HANDLERS=B-N-1072 -- /usr/local/sbin/omega-kopiya-watch
/opt/agent-plugins/node_modules/dsh-pamyat-storozha/test/stend-svodki-doveriya.sh STEND_KONF=/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf -- /usr/local/sbin/omega-kopiya-watch
/opt/agent-plugins/node_modules/dsh-pamyat-kompakt-dsh/stend-kursora-audita.mjs STEND_BOLSHOJ_UNIT=a2a-owner-copy-watch.service
/opt/iskra/workspace/dsh-plugins/packages/dsh-obhod-stendov/test/stend-r-journal-size.py -- --otlozheno
/usr/local/lib/omega-shlyuz/stend-shlyuza-omega.py PATH=/opt/omega/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
/opt/iskra/workspace/dsh-plugins/packages/oom-watch/test/stend-cli.py -- /usr/local
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-guest-pdf.mjs BRIDGE_CANDIDATE=/opt/varvara/plugins/dsh-tool-bridge
# B-N-1752 (07.10, Михалыч; наряд Забавы): stend-site-adapter.mjs telegram — без SITE_ADAPTER_CANDIDATE СЛЕПОТА (код 2) с 04.10, исключения
#   по выпуску (2.5.71/2.5.97) отстают от -bNNNN. Кандидат — боевой /usr/local/sbin/sajt-chat (root 755, iskra читает): фикстура грузит его runpy
#   с SAJT_STEND=1, временными SPOOL/DB/STATE, SAJT_ALERT=/bin/true и подменённым chatwoot_post — сети и боевых путей нет. Замер 07.10: 0 с боем, 1 с порчей.
/opt/agent-plugins/dsh-telegram-multiagent/test/stend-site-adapter.mjs SITE_ADAPTER_CANDIDATE=/usr/local/sbin/sajt-chat
# B-N-1755: довод стендам smontirovat-fajly (у них I — первый довод, без умолчания; знак доллара здесь нельзя: строка внутри значения SREDA_STENDOV, set -u) — боевой инструмент.
/opt/iskra/workspace/dorabotki/stendy/stend-mihalycha.sh -- /usr/local/sbin/smontirovat-fajly
/opt/iskra/workspace/dorabotki/stendy/stend-smontirovat-vypusk-rezhimy.sh -- /usr/local/sbin/smontirovat-vypusk
/opt/iskra/workspace/dorabotki/stendy/stend-ucheta-git.sh -- /usr/local/sbin/smontirovat-fajly
/opt/iskra/workspace/dorabotki/stendy/stend-rezhim-novogo.sh -- /usr/local/sbin/smontirovat-fajly
# B-N-1768: довод stend-trust-sverka — боевая сверка trust стопов (без довода стенд отказывает).
/opt/iskra/workspace/dorabotki/stendy/stend-trust-sverka.sh -- /usr/local/sbin/mail-stop-trust-sverka.mjs
# B-N-1768 такт 2: stend-profil — прибор хода и инструмент монтажа (без HODPRIBOR — отказ на шаге 20).
/opt/iskra/workspace/dorabotki/stendy/stend-profil.sh HODPRIBOR=/usr/local/libexec/agent-hod/hod-sluzhby -- /usr/local/sbin/smontirovat-fajly
# 1.0.5: такт 3 Авроры — довод стендам снятия — боевой инструмент.
/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya.sh -- /usr/local/sbin/smontirovat-fajly
/opt/iskra/workspace/dorabotki/stendy/stend-snyatiya-profilya.sh -- /usr/local/sbin/smontirovat-fajly
# B-N-1699 1.3.36 (07.10, Заря; ворота Вениамина 08:08Z; П7 Зари 95dc4c5a §3): stend-ostrov-api и stend-saved-plans моста Варвары —
#   под varvara (как stend-predelov-iz-fajla), на копии API Острова /opt/agent-plugins-stend/ostrov-api (установщик tools/kopiya-ostrov-api.sh, root).
#   Копия обязана совпасть с manifest.json по составу и суммам, иначе СЛЕПОТА с кодом 2. Порядок: копия → мост 1.3.36 → эти строки.
# B-N-1740 1.3.37 (07.10, Заря; слияние Забавы): OSTROV_API_HEALTH — сверка release копии с живым сайтом, недоступен → СЛЕПОТА.
# B-N-1797 (08.10, Аврора): TELEGRAM_TEST_PLUGIN_ROOT — без него stend-ostrov-api МОЛЧА пропускает PDF-сценарии (строка 206 стенда:
#   «if(process.env.TELEGRAM_TEST_PLUGIN_ROOT)»; pdfTemplatesDir — от него же, строка 76): без — 17/17, с ним — 19/19 (замер 08.10 ~06:45Z под varvara, Аврора).
/opt/varvara/plugins/dsh-tool-bridge/test/stend-ostrov-api.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
# B-N-1919 (09.10, Заря; наряд Забавы 07:27Z, находка Михалыча B-N-1914): ворота с VYPUSK_KOPII=[dsh-tool-bridge-varvara] гонят все 29 стендов
#   дерева на копии Варвары под varvara; эти четыре без среды слепли (код 2). TELEGRAM_TEST_PLUGIN_ROOT/MARK_TEST_APP — как у stend-ostrov-api выше;
#   owner-private-context сверяет копию API Острова с сайтом (sverkaKopii) — как ostrov-api/saved-plans. heartbeat: платформа 0.2.0-rc.2 пишет
#   session.v4.jsonl.zstd, стенд ищет только session.jsonl.zstd (в доме varvara их 0) — MOST_ZHURNAL на живой журнал a2a (v4 стенд разбирает: 49/49).
#   1.0.45 (Искра; Вениамин 08:0xZ, Забава 07:47:37Z): строка heartbeat с MOST_ZHURNAL на один файл СНЯТА — мост 1.3.43-b1919 сам ищет оба имени.
/opt/varvara/plugins/dsh-tool-bridge/test/stend-crm-caller.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
/opt/varvara/plugins/dsh-tool-bridge/test/stend-site-turn-evidence.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent
/opt/varvara/plugins/dsh-tool-bridge/test/stend-owner-private-context.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
/opt/varvara/plugins/dsh-tool-bridge/test/stend-cel-mosta.mjs MOST_ZHURNAL_YUNITA=$ZHURNALY_OBHODA/varvara.service
# B-N-1919 (09.10, Михалыч): стенд ворот — TMPDIR вне частного /tmp. Юнит обхода PrivateTmp=true, а ворота (dsh-montazh 1.0.15, B-N-1909) гонят
#   обходчик отдельным systemd-run: подставы стенда в частных /tmp и /var/tmp ему не видны → «пакета proba-vorot-vypuska нет в области» (СЛЕПОТА).
#   /run/vse-stendy-boevye не годится (noexec). Каталог обязан существовать (install -d -o iskra -g iskra -m 0750): нет — стенд слепнет «нет временного каталога».
/opt/iskra/workspace/dorabotki/stendy/stend-vorot-vypuska.sh TMPDIR=/opt/iskra/workspace/tmp-stendov
# B-N-1923 (dsh-montazh 1.0.18): проба 6б зовёт отдельный systemd-run с ReadWritePaths на каталог стенда — в частном /var/tmp юнита обхода его снаружи нет (код 226).
/usr/local/libexec/stend-metki-vorot.sh TMPDIR=/opt/iskra/workspace/tmp-stendov
# 3.1.39 (B-N-2030/2033, Аврора): пробы плана гонят подставной обходчик через systemd-run ворот — входы вне частного /var/tmp юнита.
/usr/local/libexec/stend-source-only.py TMPDIR=/opt/iskra/workspace/tmp-stendov
/usr/local/libexec/stend-mesta-po-id.py TMPDIR=/opt/iskra/workspace/tmp-stendov
# 3.1.52: копийный стенд зовёт временные юниты ворот; под PrivateTmp нужен общий TMPDIR, как у соседних воротных стендов.
/usr/local/libexec/stend-vypusk-kopii.py TMPDIR=/opt/iskra/workspace/tmp-stendov
# Наряд Забавы 12.10 17:06Z (Заря; ночь 12.10 — исключение просрочено 10-ю ночь подряд): stend-hodovogo-zova, проба 5 «настоящая форма» ждёт
#   журнал кодера (STEND_ZHURNAL_KODERA), без него слепа по построению. Копия ОБЕЗЛИЧЕНА: 600 первых событий журнала кодера, все строки data
#   (кроме type/role/id/preset/mode) — заполнителем той же длины; форма событий и счёт знаков настоящие. Под iskra 12.10 — 6 из 6, окно seq 0–443.
/opt/agent-plugins/node_modules/dsh-pamyat-secretary/test/stend-hodovogo-zova.mjs STEND_ZHURNAL_KODERA=/opt/agent-plugins-stend/hodovoj-zov/zhurnal-kodera-obezl.jsonl
# 3.1.115 (наряд Забавы 05:11Z; разбор Зари 04:58Z, её пробы под iskra: со средой код 0, без — код 2): та же среда, что у копии Варвары выше,
#   для 5 стендов моей копии dsh-tool-bridge 3.1.9 (зовутся строкой /opt/iskra/plugins/*/). mcp-input-schemas — НЕ (гость 3.1.5 при боевом 3.1.8, тикет Забавы).
/opt/iskra/plugins/dsh-tool-bridge/test/stend-crm-caller.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
/opt/iskra/plugins/dsh-tool-bridge/test/stend-site-turn-evidence.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent
/opt/iskra/plugins/dsh-tool-bridge/test/stend-owner-private-context.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
/opt/iskra/plugins/dsh-tool-bridge/test/stend-ostrov-api.mjs TELEGRAM_TEST_PLUGIN_ROOT=/opt/agent-plugins/dsh-telegram-multiagent MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
/opt/iskra/plugins/dsh-tool-bridge/test/stend-saved-plans.mjs MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health
/opt/varvara/plugins/dsh-tool-bridge/test/stend-saved-plans.mjs MARK_TEST_APP=/opt/agent-plugins-stend/ostrov-api/app OSTROV_API_MANIFEST=/opt/agent-plugins-stend/ostrov-api/manifest.json OSTROV_API_HEALTH=http://192.168.99.3:4215/internal/v1/assistant/health}"
sreda_stenda() { local p s; while read -r p s; do [ "$p" = "$1" ] && { echo "$s"; return; }; done <<< "$SREDA_STENDOV"; }
# Корень СВОЕЙ платформы для прогонов под своей учёткой (B-N-932 т.2, 26.09, Аврора; решение Забавы): стенд привратника core ищет
# службу подтверждения через DSH_KOREN_PLATFORMY (умолчания в нём нет намеренно) — без неё слепнет. Замер 26.09: с /opt/iskra/app
# 17 из 17. Значение — из DSH_TEST_APP (его задают юнит и ворота выпуска, vypusk-tegom берёт всю среду юнита): второго пути здесь
# нет. Нет обеих — пусто, стенд слепнет ГРОМКО (НЕОЖИДАННО). Читатель сейчас один (stend-privratnika.mjs), прочим безвредна.
KOREN_SVOEJ_PLATFORMY="${DSH_KOREN_PLATFORMY:-${DSH_TEST_APP:-}}"
# Стенды пакета: test/stend-* и stend-* в КОРНЕ пакета. 🔴 A-N-732 (24.09): kompakt и kompakt-dsh держат стенды в корне,
# и обход брал в область только каталоги с test/ — эти пакеты выпадали ЦЕЛИКОМ, а не частью: 13 стендов не гонялись
# ни разу, и стенд боевого пути kompakt простоял красным с a20 незамеченным. Одно место отбора на все три цикла.
# Виден ли ФАЙЛ под учёткой строки области (своя — напрямую; «@учётка» — её глазами: чужой дом своей учётке закрыт).
# Ночь 13.10: предел причины — 200 символов; обрезка названа, UTF-8 не рвётся.
korotkaya_prichina() {
  python3 -c 'import sys
for line in sys.stdin:
    text = line.rstrip("\n")
    print(text if len(text) <= 200 else text[:199] + "…")'
}
est_fajl() { if [ -n "${2:-}" ]; then sudo -n -u "$2" test -f "$1"; else [ -f "$1" ]; fi; }
stendy_kataloga() {
  local d="$1" kto="${2:-}" s
  # Строка области — ОДИН ФАЙЛ-стенд (25.09, B-H-183): стенд вне каталога пакета (dorabotki), где соседей
  # целиком брать нельзя. Только имя stend-*.sh|stend-*.mjs|stend-*.py (.py — A-N-1721).
  # B-N-939 (26.09.2026): ФАЙЛ берётся и в строке «@учётка»: стенд копии моста, который меряет НАСТРОЙКИ агента
  # (stend-cel-mosta, stend-predelov-iz-fajla), гоняется под учёткой копии, а соседние кодовые стенды — нет
  # (код копий = код Искры, держит fingerprint_check реестра). Каталог в строке «@» — как прежде, целиком.
  local f="${d%/}"
  if est_fajl "$f" "$kto"; then
    case "${f##*/}" in stend-*.sh|stend-*.mjs|stend-*.py) printf '%s\n' "$f" ;; esac
    return 0
  fi
  if [ -n "$kto" ]; then
    sudo -n -u "$kto" bash -c 'for s in "$1"test/stend-*.mjs "$1"test/stend-*.sh "$1"test/stend-*.py "$1"stend-*.mjs "$1"stend-*.sh "$1"stend-*.py; do
      [ -f "$s" ] || continue; case "$s" in *.py) [ -f "${s%.py}.sh" ] && continue ;; esac; printf "%s\n" "$s"; done; exit 0' _ "$d" | bez_otdelnyh
    return 0
  fi
  # A-N-1721: stend-X.py рядом со stend-X.sh — тело обёртки (её зовёт .sh), отдельно не гоняется: иначе двойной прогон.
  for s in "$d"test/stend-*.mjs "$d"test/stend-*.sh "$d"test/stend-*.py "$d"stend-*.mjs "$d"stend-*.sh "$d"stend-*.py; do
    [ -f "$s" ] || continue
    case "$s" in *.py) [ -f "${s%.py}.sh" ] && continue ;; esac
    printf '%s\n' "$s"
  done | bez_otdelnyh
  return 0
}
# B-N-1412: стенды-файлы со своей строкой области (OTDELNYE, заполняется после разбора области) — из каталоговой выборки вон.
OTDELNYE=""
bez_otdelnyh() { local s; while IFS= read -r s; do case $'\n'"$OTDELNYE"$'\n' in *$'\n'"$s"$'\n'*) ;; *) printf '%s\n' "$s" ;; esac; done; }
# Строка области делится по « @», не по пробелам: в шаблоне пробелы законны. Хвост «учётка корень» —
# ровно два слова, иначе отказ до обхода. Результат — «шаблон<TAB>учётка<TAB>корень» (учётка пуста = своя).
razobrat_oblast() {
  local stroka="$1" hvost kto app
  case "$stroka" in
    *' @'*) hvost="${stroka#* @}"; kto="${hvost%% *}"; app="${hvost#"$kto"}"; app="${app# }"
            if [ -z "$kto" ] || [ -z "$app" ] || [[ "$app" == *' '* ]]; then
              echo "СЛЕПОТА: строка области «$stroka» — после « @» нужны учётка и корень платформы" >&2; return 2
            fi
            printf '%s\t%s\t%s\n' "${stroka%% @*}" "$kto" "$app" ;;
    *) printf '%s\t\t\n' "$stroka" ;;
  esac
}
oblasti=()
while IFS= read -r stroka || [ -n "$stroka" ]; do
  [ -n "$stroka" ] || continue
  o=$(razobrat_oblast "$stroka") || exit 2
  oblasti+=("$o")
done <<< "$OBLAST_STENDOV"
# B-N-1412: пути строк-файлов (их видимость — под учёткой строки, как у самой выборки).
for o in "${oblasti[@]}"; do
  IFS=$'\t' read -r shablon kto app <<< "$o"
  case "${shablon##*/}" in stend-*.sh|stend-*.mjs|stend-*.py) est_fajl "$shablon" "$kto" && OTDELNYE="$OTDELNYE$shablon"$'\n' ;; esac
done
mapfile -t katalogi < <(
  for o in "${oblasti[@]}"; do
    IFS=$'\t' read -r shablon kto app <<< "$o"
    while IFS= read -r katalog; do
      [ -n "$(stendy_kataloga "${katalog%/}/" "$kto")" ] && printf '%s/\t%s\t%s\n' "${katalog%/}" "$kto" "$app"
    done < <(if [ -n "$kto" ]; then sudo -n -u "$kto" bash -c 'compgen -G "$1"; exit 0' _ "$shablon"; else compgen -G "$shablon"; fi)
  done | sort -u
)
# ── РЕЖИМ ОДНОГО ПАКЕТА (B-H-060, 24.09.2026): PAKET_IMYA=<name из package.json> ───────────────────
# Зовут ворота выпуска (vypusk-tegom): метку ставят на пакет, и судить надо ЕГО стенды, а не флот.
# Область и перечень — те же, что у сплошного прогона: второго списка «где что лежит» не заводим, оставляем
# из найденного только каталоги с этим именем в package.json (читается под той же учёткой, что прогон), а из
# перечня — строки под ними. Каждый оставшийся каталог печатается строкой «КАТАЛОГ ПАКЕТА:» — по ней ворота
# сверяют, что проверен тот же предмет, что поедет. Имени нет ни в одном боевом каталоге — код 2: судить нечего.
if [ -n "${PAKET_IMYA+x}" ]; then
  [ -n "$PAKET_IMYA" ] || { echo "СЛЕПОТА: PAKET_IMYA задан пустым"; exit 2; }
  otobrano=()
  for zapis in "${katalogi[@]}"; do
    IFS=$'\t' read -r d kto app <<< "$zapis"
    # A-N-962 (25.09.2026): путь — ДОВОДОМ node (process.argv), не текстом JS: апостроф в пути каталога рвал литерал —
    # пакет «не находился ни в одном боевом каталоге» (код 2). Тот же приём, что в vypusk-tegom (A-N-960).
    # AP-STEND-V-OBHOD: адресный файл определяет пакет по родительскому package.json.
    kor_paketa="$d"
    if est_fajl "${d%/}" "$kto"; then
      kor_paketa=$(dirname -- "${d%/}")
      [ "${kor_paketa##*/}" != test ] || kor_paketa=$(dirname -- "$kor_paketa")
      kor_paketa="${kor_paketa%/}/"
    fi
    imya_pj=$(if [ -n "$kto" ]; then sudo -n -u "$kto" node -p 'require(require("path").resolve(process.argv[1])).name' "${kor_paketa}package.json" 2>/dev/null
              else node -p 'require(require("path").resolve(process.argv[1])).name' "${kor_paketa}package.json" 2>/dev/null; fi)
    [ "$imya_pj" = "$PAKET_IMYA" ] && otobrano+=("$zapis") && printf 'КАТАЛОГ ПАКЕТА: %s\t%s\n' "$kor_paketa" "$kto"
  done
  if [ ${#otobrano[@]} -eq 0 ]; then
    echo "СЛЕПОТА: пакета «$PAKET_IMYA» нет ни в одном боевом каталоге со стендами в области обхода — судить нечего"
    exit 2
  fi
  # B-N-1412: стенд пакета, вынесенный своей строкой области (иная учётка), — судится вместе с пакетом.
  for zapis in "${katalogi[@]}"; do
    IFS=$'\t' read -r d kto app <<< "$zapis"
    est_fajl "${d%/}" "$kto" || continue
    uzhe_vybran=""
    for vz in "${otobrano[@]}"; do [ "$vz" != "$zapis" ] || { uzhe_vybran=1; break; }; done
    [ -z "$uzhe_vybran" ] || continue
    for vz in "${otobrano[@]}"; do IFS=$'\t' read -r pd _ _ <<< "$vz"
      [[ "${d%/}" == "$pd"* ]] && { otobrano+=("$zapis"); printf 'СТЕНД ПАКЕТА ОТДЕЛЬНОЙ СТРОКОЙ: %s\t%s\n' "${d%/}" "$kto"; break; }
    done
  done
  katalogi=("${otobrano[@]}")
fi
# B-N-2071 (б) (решение Забавы 16.10 11:36:14Z): в пакетных воротах (PAKET_IMYA) НЕ судить стенды, уже записанные
#   НЕДЕЛЬНЫМИ (perechen-nedelnyh-stendov.txt) или «ИСКЛЮЧЁН, ручной: <путь>» (комментарий боевого перечня). Ворота гоняют
#   ВСЕ стенды каталога выпуска с пределом стенда: ручной откажет без ключа, недельный оборвётся (16.10, dsh-reestr 3.1.4:
#   stend-krug-samoproverki код 2, stend-storozha-reestrov код 124 на 120 с). Сверка ПО ИМЕНИ файла: недельный прогон гоняет
#   копию dorabotki, не файл дерева (stend-storozha-reestrov: da964079 ≠ 9c36f91b). Пропуск печатается строкой с именами —
#   не прячется в ноль; из «объявленных» охвата пропущенные тоже исключаются. Ночной и недельный прогоны (без PAKET_IMYA) не
#   затронуты. Перечня нет — пропуск НЕ применяется (судим больше, не меньше) и это печатается.
#   ⚠️ Не ловит: одноимённый стенд ДРУГОГО пакета пропустится и там; пометку «ручной» не в форме «ИСКЛЮЧЁН, ручной: <путь>».
PROPUSK_IMENA=""
if [ -n "${PAKET_IMYA+x}" ]; then
  PN="${PERECHEN_NEDELNYH_STENDOV:-/opt/iskra/workspace/dorabotki/perechen-nedelnyh-stendov.txt}"
  PR="${PERECHEN_RUCHNYH_POMETOK:-/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt}"
  if [ -r "$PN" ]; then
    while IFS= read -r p; do case "$p" in \#*|'') continue;; esac; PROPUSK_IMENA+="${p##*/}"$'\t'"недельный"$'\n'; done < "$PN"
  else echo "⚠️ ПРОПУСК НЕДЕЛЬНЫХ НЕ ПРИМЕНЁН: нет перечня $PN — недельные стенды пакета судятся"; fi
  if [ -r "$PR" ]; then
    while IFS= read -r p; do PROPUSK_IMENA+="${p##*/}"$'\t'"ручной"$'\n'; done < <(sed -n 's/^#.*ИСКЛЮЧЁН, ручной: \([^ ]*\).*/\1/p' "$PR")
  else echo "⚠️ ПРОПУСК РУЧНЫХ НЕ ПРИМЕНЁН: нет перечня $PR — ручные стенды пакета судятся"; fi
fi
propusk_prichina() {   # $1 — путь стенда; печатает «недельный»/«ручной» и код 0, иначе код 1
  [ -n "$PROPUSK_IMENA" ] || return 1
  local r; r=$(awk -F'\t' -v i="${1##*/}" '$1 == i { print $2; exit }' <<< "$PROPUSK_IMENA")
  [ -n "$r" ] && printf '%s' "$r"
}
bez_propuska() { local s; while IFS= read -r s; do propusk_prichina "$s" >/dev/null || printf '%s\n' "$s"; done; }
# Учётка, под которой виден путь из перечня: первая область С УЧЁТКОЙ, чей шаблон — начало пути; иначе своя.
kto_dlya() {
  local o sh kto app
  for o in "${oblasti[@]}"; do IFS=$'\t' read -r sh kto app <<< "$o"
    [ -n "$kto" ] && [[ "$1" == $sh* ]] && { printf '%s' "$kto"; return 0; }
  done
  return 0
}
ISKL="${ISKLYUCHENIYA_STENDOV:-/etc/agent-registry/stend-exceptions.yaml}"
# Файл исключений → строки «стенд<TAB>выпуск<TAB>код<TAB>признак<TAB>причина<TAB>ответственный<TAB>срок<TAB>статус<TAB>режим версии».
# Статус: ok · prosrocheno · negodno:<почему>. Файла нет / не YAML / нет списка exceptions — код 2 разборщика, итог не ниже 2.
ISKL_SLEP=""
if ! ISKL_TSV=$(ISKL="$ISKL" python3 - <<'PY' 2>&1
import os, re, sys, datetime
put = os.environ['ISKL']
try:
    import yaml
    d = yaml.safe_load(open(put, encoding='utf-8'))
except FileNotFoundError:
    print(f'файла исключений нет: {put} — ожидаемое от неожиданного не отличить (пустой список пишется явно: exceptions: [])'); sys.exit(2)
except Exception as e:
    print(f'файл исключений не разобран ({put}): {e}'.replace('\n', ' ')); sys.exit(2)
if not isinstance(d, dict) or not isinstance(d.get('exceptions'), list):
    print(f'в {put} нет списка exceptions (пустой — exceptions: [])'); sys.exit(2)
teper = datetime.datetime.now(datetime.timezone.utc)
chist = lambda v: re.sub(r'[\t\n\r\x1f]+', ' ', str(v if v is not None else '')).strip()
MARKERY = ('❌', 'FAIL', 'Error', 'СЛЕПОТА', 'СЛЕПА', 'ПРОПУСК', '✗', '✖', 'not ok')   # = KRASNAYA суда (B-N-1987)
for i, z in enumerate(d['exceptions']):
    if not isinstance(z, dict): print('\t'.join([f'#{i}', '', '', '', '', '', '', 'negodno:запись не словарь'])); continue
    pola = {k: chist(z.get(k)) for k in ('stend', 'vypusk', 'kod', 'priznak', 'prichina', 'otvetstvennyj', 'peresmotr')}
    # B-N-1987: признак — строка или СПИСОК; в TSV — через \x1f. Каждый не короче 12 знаков и не равен маркеру красной строки.
    pz = z.get('priznak'); priznaki = [chist(x) for x in pz] if isinstance(pz, list) else ([pola['priznak']] if pola['priznak'] else [])
    pola['priznak'] = '\x1f'.join(priznaki)
    beda = [k for k, v in pola.items() if not v]
    if isinstance(pz, list) and priznaki and not all(priznaki): beda.append('priznak — список с пустым элементом')
    for pr_ in priznaki:
        if pr_ and (len(pr_) < 12 or pr_ in MARKERY): beda.append(f'priznak «{pr_}» шире пробы (короче 12 знаков или равен маркеру красной строки)')
    pokrytie = z.get('pokrytie'); kopiya = z.get('kopiya')
    if pokrytie is not None and pokrytie != 'kod': beda.append('pokrytie — только «kod»')
    if kopiya is not None and not (isinstance(kopiya, str) and kopiya.startswith('/') and chist(kopiya) == kopiya): beda.append('kopiya — абсолютный путь')
    if not re.fullmatch(r'[^/\s]+/[^/\s]+', pola['stend']): beda.append('stend не «пакет/стенд»')
    if not re.fullmatch(r'[1-9][0-9]*', pola['kod']): beda.append('kod не целое > 0')
    po_osnove = z.get('po_osnove', False)
    if not isinstance(po_osnove, bool): beda.append('po_osnove не true/false')
    if po_osnove is True and not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', pola['vypusk']):
        beda.append('po_osnove требует vypusk X.Y.Z без суффикса')
    # B-N-932 (26.09, Аврора; правило Вениамина 25.09 при B-N-927): prichina — ЗАМЕР, а не догадка. Исключение stend-cel-mosta
    # с причиной-догадкой из текста самого стенда («возможна ротация») прятало дефект стенда 3+ версии. Форма: «замер ГГГГ-ММ-ДД»
    # и «чем:» (прибор/команда); слова догадки — негодно. ⚠️ Форма не отличит честный замер от выдуманного по форме — она
    # заставляет НАЗВАТЬ прибор и дату, чтобы пересмотр мог повторить; содержание судит ворота.
    pr = pola['prichina']
    if pr and not (re.search(r'замер \d{4}-\d\d-\d\d', pr) and 'чем:' in pr):
        beda.append('prichina без замера — нужно «замер ГГГГ-ММ-ДД … чем: <прибор/команда> → <что увидели>»')
    # Т.2 (low Вениамина): «может быть» краснило честное «без X стенд не может быть запущен»; основы «возможн»/«наверн» ловили
    # «возможность»/«наверняка» — сужено до словоформ догадки. ⚠️ ЧЕГО НЕ ЛОВИТ: синонимы вне списка («скорее всего», «похоже»,
    # «предположим», «по-видимому»), латиницу («maybe», «probably»), выдуманный замер по верной форме — это суд ворот, не формы.
    if re.search(r'(?i)\b(возможн(?:о|а|ы|ый|ая|ое|ые)|вероятн(?:о|ый|ая|ое|ые)|наверн(?:о|ое)|предположительно|видимо|кажется)\b', pr):
        beda.append('prichina — догадка (возможно/вероятно/…) — замерьте')
    status = 'ok'
    if not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', pola['peresmotr']): beda.append('peresmotr не ГГГГ-ММ-ДДTчч:мм:ссZ')
    else:
        try:
            srok = datetime.datetime.strptime(pola['peresmotr'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
            if srok < teper: status = 'prosrocheno'
            if pokrytie == 'kod' and srok > teper + datetime.timedelta(days=14): beda.append('pokrytie: kod — пересмотр не дальше 14 суток')
        except ValueError: beda.append('peresmotr — несуществующая дата')
    if beda: status = 'negodno:' + ', '.join(('пусто: ' + b) if b in pola else b for b in beda)
    print('\t'.join([pola['stend'] or f'#{i}', pola['vypusk'], pola['kod'], pola['priznak'], pola['prichina'], pola['otvetstvennyj'], pola['peresmotr'], status, 'osnova' if po_osnove is True else 'tochno', 'kod' if pokrytie == 'kod' else '-', kopiya if isinstance(kopiya, str) and kopiya else '-']))
PY
); then ISKL_SLEP="$ISKL_TSV"; ISKL_TSV=""; fi
# A-N-1562 (04.10.2026, Заря): перенумерация 0.1.0-alpha.N → 1.1.N, X.Y.Z → (X+1).Y.Z. В переходный период запись
# исключения и бой могут назвать один выпуск в разных формах — «тот же выпуск» понимает обе (равны, или одна —
# перенумерация другой). ⚠️ ЧЕГО НЕ ЛОВИТ: перенумерация нового номера (1.1.N → 2.1.N) тоже даёт «тот же» — если пакет
# когда-нибудь выйдет в 2.1.N при живой записи 1.1.N, совпадение ложное. Правило — на переходный период, потом снять.
perenum() {
  if [[ $1 =~ ^0\.1\.0-alpha\.([0-9]+)$ ]]; then echo "1.1.$((10#${BASH_REMATCH[1]}))"
  elif [[ $1 =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then echo "$((10#${BASH_REMATCH[1]}+1)).${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"; fi
}
ta_zhe_versiya() {
  if [ "${3:-tochno}" = osnova ]; then
    [[ $2 =~ ^([0-9]+\.[0-9]+\.[0-9]+)(-b[0-9]+)?$ ]] || return 1
    [ "$1" = "${BASH_REMATCH[1]}" ]; return
  fi
  [ "$1" = "$2" ] && return 0
  local p; p=$(perenum "$1"); [ -n "$p" ] && [ "$p" = "$2" ] && return 0
  p=$(perenum "$2"); [ -n "$p" ] && [ "$p" = "$1" ]
}
# Суд стенда с кодом ≠ 0: «OZH<TAB>подробности» или «NEOZH<TAB>почему». Аргументы: ключ · выпуск · код · вывод · путь стенда.
# B-N-1987: красная строка — KRASNAYA без ✅; каждая обязана нести признак записи (покрытие), иначе запись не совпала.
KRASNAYA='❌|FAIL|Error|СЛЕПОТА|СЛЕПА|ПРОПУСК|✗|✖|not ok'
sudit() {
  local klyuch="$1" vyp="$2" kod="$3" vyvod="$4" put="${5:-}" st vy ko pr pri otv sr stat rezhim pokr kop bylo="" nesovp=""
  local krasnye vne nenajden ns p; local -a priz
  krasnye=$(grep -E -- "$KRASNAYA" <<< "$vyvod" | grep -vF -- '✅')
  while IFS=$'\t' read -r st vy ko pr pri otv sr stat rezhim pokr kop; do
    [ "$st" = "$klyuch" ] || continue
    bylo=1
    case "$stat" in negodno:*) printf 'NEOZH\tисключение НЕ ПОДТВЕРЖДЕНО (%s)\n' "${stat#negodno:}"; return ;; esac
    if [ "${kop:--}" != - ] && [ "$put" != "$kop" ] && [[ "$put" != "${kop%/}/"* ]]; then nesovp="$nesovp копия $kop≠$put;"; continue; fi
    if [ "$vy" != "*" ] && ! ta_zhe_versiya "$vy" "$vyp" "$rezhim"; then nesovp="$nesovp выпуск $vy≠$vyp;"; continue; fi
    [ "$ko" = "$kod" ] || { nesovp="$nesovp код $ko≠$kod;"; continue; }
    IFS=$'\x1f' read -r -a priz <<< "$pr"; nenajden=""
    for p in "${priz[@]}"; do grep -qF -- "$p" <<< "$vyvod" || nenajden="$nenajden «$p»"; done
    [ -z "$nenajden" ] || { nesovp="$nesovp признак$nenajden не найден;"; continue; }
    ns=""
    if [ -z "$krasnye" ]; then
      [ "$pokr" = kod ] || { nesovp="$nesovp красных строк нет — покрытие не судимо (нужна pokrytie: kod);"; continue; }
      ns=" · покрытие не судимо"
    else
      vne=$(grep -vF -f <(printf '%s\n' "${priz[@]}") <<< "$krasnye")
      [ -z "$vne" ] || { nesovp="$nesovp красная строка вне исключения ($(grep -c . <<< "$vne")): $(head -3 <<< "$vne" | sed 's/^[[:blank:]]*//' | cut -c1-140 | paste -sd'|');"; continue; }
    fi
    if [ "$stat" = prosrocheno ]; then printf 'NEOZH\tисключение ПРОСРОЧЕНО (пересмотр %s, ответственный %s)\n' "$sr" "$otv"; return; fi
    printf 'OZH\tкод %s · %s · ответственный %s · пересмотр %s%s\n' "$kod" "$pri" "$otv" "$sr" "$ns"; return
  done <<< "$ISKL_TSV"
  if [ -n "$bylo" ]; then printf 'NEOZH\tисключение есть, но не совпало:%s\n' "$nesovp"; else printf 'NEOZH\tисключения нет\n'; fi
}
versiya() {   # выпуск каталога пакета; стенд-файл вне пакета — «-»; файл в <пакет>/test/ — выпуск пакета (B-N-939)
  local d="${1%/}" kto="$2"
  if est_fajl "$d" "$kto"; then
    [ "$(basename "$(dirname "$d")")" = test ] || { echo "-"; return; }
    d=$(dirname "$(dirname "$d")")
  fi
  if [ -n "$kto" ]; then sudo -n -u "$kto" cat "$d/package.json" 2>/dev/null; else cat "$d/package.json" 2>/dev/null; fi \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version") or "?")' 2>/dev/null || echo "?"
}
# B-N-1443: wrapper supplies a private per-run path under the unit RuntimeDirectory.
# Standalone calls get a private temporary directory; no shared stale marker between runs.
progress_dir=""
if [ -z "${VSE_STENDY_PROGRESS_FILE:-}" ]; then
  progress_dir=$(mktemp -d "${TMPDIR:-/tmp}/vse-stendy-progress.XXXXXX") || exit 2
  VSE_STENDY_PROGRESS_FILE="$progress_dir/current.json"
  trap 'rm -rf -- "$progress_dir" ${ZHURNALY_OBHODA:+"$ZHURNALY_OBHODA"}' EXIT   # B-N-1919: и каталог журналов прогона
fi
RUN_STATE_DIR=$(dirname "$VSE_STENDY_PROGRESS_FILE")
# B-N-2063: execution and the abort report share one frozen selection.
declare -A PLAN_STENDY=()
: > "$RUN_STATE_DIR/plan.new" || exit 2
for zapis in "${katalogi[@]}"; do
  IFS=$'\t' read -r d kto app <<< "$zapis"
  PLAN_STENDY["$zapis"]="$(stendy_kataloga "$d" "$kto" | bez_propuska)"
  [ -z "${PLAN_STENDY[$zapis]}" ] || printf '%s\n' "${PLAN_STENDY[$zapis]}" >> "$RUN_STATE_DIR/plan.new" || exit 2
done
mv -- "$RUN_STATE_DIR/plan.new" "$RUN_STATE_DIR/plan" || exit 2
if [ -n "${PAKET_IMYA+x}" ]; then   # B-N-2071 (б): пропущенные — строкой с именами, и при нуле
  propushcheno=""; n_prop=0
  for zapis in "${katalogi[@]}"; do IFS=$'\t' read -r d kto app <<< "$zapis"
    while IFS= read -r s; do r=$(propusk_prichina "$s") || continue
      case $'\n'"$propushcheno" in *$'\n'"$s "*) continue;; esac
      propushcheno+="$s ($r)"$'\n'; n_prop=$((n_prop+1))
    done < <(stendy_kataloga "$d" "$kto")
  done
  echo "ПРОПУЩЕН (пакетные ворота): недельный/ручной, $n_prop${propushcheno:+: $(printf '%s' "$propushcheno" | sed 's#.*/##' | paste -sd ',' - | sed 's/,/, /g')}"
fi
: > "$RUN_STATE_DIR/started"; : > "$RUN_STATE_DIR/finished"
# B-N-2105 (Заря; замысел 1a31c04f, ворота Вениамина 07:52Z): РЯД длительностей — строка на КАЖДЫЙ стенд сразу после finished, только
#   при заданном VSE_STENDY_RYAD (drop-in ночного юнита) И id прохода от ночной обёртки, вне режима ворот (PAKET_IMYA) — см. условие ниже.
#   Поля TSV: ночь, проход, путь, учётка, секунды, код, предел стенда ЭТОЙ ночи, копия_идёт, load1 на старте, iowait % за стенд.
#   iowait мгновенного нет: строка cpu /proc/stat при running и при finished, доля Δiowait/Δсуммы. Отказ записи ряда — строка «РЯД:» в
#   stderr, НЕ отказ обхода (ряд — наблюдение); неполноту ряда называет суд по счёту строк прохода против ИТОГА.
progress() {
  python3 - "$VSE_STENDY_PROGRESS_FILE" "$1" "$2" "${3:-}" "${4:-}" "${5:-}" <<'PY_PROGRESS'
import datetime, json, os, subprocess, sys, tempfile, time
path,phase,stand,code,kto,predel=sys.argv[1:]
# Пишет ТОЛЬКО ночной проход: VSE_STENDY_RYAD_PROHOD ставит лишь обёртка-по-таймеру, а ворота (vypusk-tegom :319/:847) зовут обходчик
#   со ВСЕЙ средой ночного юнита (с VSE_STENDY_RYAD) и PAKET_IMYA, от root — без этого условия они дописали бы ночь «-» и могли создать
#   ряд владельцем root, после чего iskra не пишет.
RYAD=os.environ.get('VSE_STENDY_RYAD','') if os.environ.get('VSE_STENDY_RYAD_PROHOD') and 'PAKET_IMYA' not in os.environ else ''
def cpu():
    with open('/proc/stat') as f: return [int(x) for x in f.readline().split()[1:]]
try:
    if phase=='running':
        data={'phase':phase,'stand':stand,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'started_mono':time.monotonic()}
        if RYAD:
            try:
                with open('/proc/loadavg') as f: data['ryad_load1']=f.read().split()[0]
                data['ryad_cpu']=cpu()
                k=subprocess.run(['systemctl','is-active',os.environ.get('VSE_STENDY_RYAD_KOPIYA','sadik-backup.service')],
                                 capture_output=True,text=True,timeout=5).stdout.strip()
                data['ryad_kopiya']=1 if k in ('active','activating','deactivating','reloading') else 0
            except Exception as e:
                print('РЯД: нагрузка на старте не снята: '+type(e).__name__,file=sys.stderr)
    else:
        with open(path) as stream: data=json.load(stream)
        if data.get('phase')!='running' or data.get('stand')!=stand: raise ValueError('progress mismatch')
        data.update(phase=phase,elapsed_seconds=int(time.monotonic()-data['started_mono']),exit_code=int(code))
        if RYAD:
            try:
                io='-'
                if isinstance(data.get('ryad_cpu'),list):
                    d=[b-a for a,b in zip(data['ryad_cpu'],cpu())]; io=f'{100*d[4]/sum(d):.1f}' if sum(d)>0 else '0.0'
                pole=lambda x: str(x).replace('\t',' ').replace('\n',' ')
                prohod=os.environ.get('VSE_STENDY_RYAD_PROHOD','-')
                stroka='\t'.join(map(pole,[prohod[:10],prohod,stand,kto or '-',data['elapsed_seconds'],data['exit_code'],predel or '-',
                                           data.get('ryad_kopiya','-'),data.get('ryad_load1','-'),io]))+'\n'
                fd=os.open(RYAD,os.O_WRONLY|os.O_APPEND|os.O_CREAT|os.O_NOFOLLOW,0o600)
                with os.fdopen(fd,'a') as f: f.write(stroka)
            except Exception as e:
                print('РЯД: строка не записана: '+stand+': '+type(e).__name__,file=sys.stderr)
    fd,tmp=tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)),prefix='.progress-')
    try:
        with os.fdopen(fd,'w') as stream: json.dump(data,stream,ensure_ascii=False)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
    with open(os.path.join(os.path.dirname(path),'started' if phase=='running' else 'finished'),'a') as stream:
        stream.write(stand+'\n')
    if phase=='finished': print(data['elapsed_seconds'])
except Exception as error:
    print('СЛЕПОТА: отметка текущего стенда не записана: '+type(error).__name__,file=sys.stderr)
    sys.exit(2)
PY_PROGRESS
}
# B-N-1929 такт 3 (Заря): С2 — «ОБНАРУЖЕНИЕ ПОСЛЕ», не защита. Каждый стенд — в СВОЁМ scope-юните obhod-stend-<pid>-<run>-<N>
#   (sudo systemd-run --scope: тот же процесс, те же пространства имён — частный /tmp обхода виден; меняется только cgroup).
#   После прогона ОДИН запрос журнала по окну прогона: записи sudo (COMMAND=) и shadow-utils (useradd-семейство пишет само,
#   и от root без sudo) с _SYSTEMD_UNIT этого прогона; меняющий глагол — правила С1 (skaner-zhivoj-mashiny.py рядом) ⇒
#   🔴 «С2: стенд <путь> изменил живую машину». stop/reset-failed СВОИХ транзитных юнитов (заведённых в том же юните
#   через systemd-run --unit=) — не находка. Зрячесть — каждым прогоном: юнит №0 зовёт «sudo -n /usr/bin/true <префикс>0», его записи нет ⇒ СЛЕПОТА С2.
#   Обход 3.1.9 (ночь 11.10, stend-oblasti-fajlom): journald, принявший запись позже выхода процесса, кладёт её БЕЗ _COMM и _SYSTEMD_UNIT
#   (замер 11.10 04:01:19: приём на 0,31–0,33 с позже источника, 4 записи; ночи 08–11.10 в окне обхода — 0/16/0/10 таких, все iskra).
#   Такие записи выборка по _COMM не возвращала вовсе: проба зрячести «терялась» (ложная СЛЕПОТА, код 2), а меняющая команда стенда
#   прошла бы МОЛЧА. Теперь: выборка ещё и по SYSLOG_IDENTIFIER (его пишет сама программа); пробу узнаём по метке прогона в команде;
#   запись без привязки своей учётки (или shadow-utils) — в счёт «без привязки», меняющая — «С2 БЕЗ ПРИВЯЗКИ», код 2 (источник не установить: стенд обхода ИЛИ иной процесс той же учётки в окне
#   прогона — например, служба агента; LOW-2 Вениамина 05:45Z).
#   journalctl --sync / повтор чтения не лечат: поля теряются при ПРИЁМЕ, запись лежала в журнале за секунду до чтения.
#   Учётка — setpriv с ТЕМИ ЖЕ группами (id -G), а не «systemd-run --uid/--gid»: те ставят одну основную группу и снимают
#   дополнительные (проба 11:4xZ: iskra без systemd-journal — kto-podnimal ослеп, stend-kontrakt-kodov 4/6). Umask — тот же.
#   Среда — ФАЙЛОМ 0600 (sudo режет TMPDIR, LD_LIBRARY_PATH, PYTHONPATH; командной строкой нельзя — /proc/*/cmdline читают все).
#   НЕ ЛОВИТ: «sudo bash <скрипт>» / «sudo python3 <файл>» — запись несёт только интерпретатор и файл, а systemctl внутри идёт уже
#   от root без своей записи (проба 11:3xZ: цель остановлена, С2 молчит); стенды @root, меняющие машину без sudo и не через shadow-utils (systemctl от root — С3, не здесь); действия внутри
#   ОТДЕЛЬНЫХ юнитов, которые стенд поднимает сам (systemd-run без --scope: их записи несут их юнит, не стенда); инструменты,
#   не пишущие в журнал; изменение, сделанное и возвращённое, — ловится (запись есть), но красное и для честной пробы с возвратом.
S1_SKANER="$(dirname "$0")/skaner-zhivoj-mashiny.py"; S1_N=0; S1_MARKER=0; S1_SLEP=0; S1_SPISOK=""; S1_NET_ROOT=0; S1_NET_SPISOK=""   # С1 — см. цикл стендов
S2_RUN=$(python3 -c 'import secrets; print(secrets.token_hex(8))') || exit 2
S2_OWNER="$$-$S2_RUN"; S2_PREFIKS="obhod-stend-$S2_OWNER-"; S2_N=0; S2_SLEP=""; S2_UID=$(id -u); S2_GID=$(id -g); S2_GRUPPY=$(id -G | tr ' ' ','); S2_UMASK=$(umask)
S2_NACHALO=$(date '+%Y-%m-%d %H:%M:%S')
S2_KAT=$(dirname "$VSE_STENDY_PROGRESS_FILE"); S2_SREDA="$S2_KAT/.s2-sreda-$$"; S2_KARTA="$S2_KAT/.s2-karta-$$"
printf '%s\n' "$S2_OWNER" > "$S2_KAT/scope-owner" || exit 2
: > "$S2_KAT/scopes" || exit 2
: > "$S2_KARTA" && chmod 600 "$S2_KARTA" || S2_SLEP="карта юнитов не пишется в $S2_KAT"
s2_obertka() {   # $1 — номер юнита; дальше — команда
  local n=$1; shift
  [ ! -e "$S2_KAT/cancelled" ] || return 143
  if [ -n "$S2_SLEP" ]; then "$@"; return; fi
  ( umask 077; env -0 > "$S2_SREDA" ) || { echo "СЛЕПОТА С2: среда стенда не записана"; return 2; }
  printf '%s\n' "${S2_PREFIKS}$n.scope" >> "$S2_KAT/scopes" || return 2
  sudo -n systemd-run --scope --collect -q --unit="${S2_PREFIKS}$n" -- \
    setpriv --reuid="$S2_UID" --regid="$S2_GID" --groups="$S2_GRUPPY" -- /bin/bash --norc -c '
    umask "$1"; f=$2; shift 2; for v in $(compgen -e); do unset "$v" 2>/dev/null; done
    while IFS= read -r -d "" kv; do export "$kv" 2>/dev/null; done < "$f"; exec "$@"' _ "$S2_UMASK" "$S2_SREDA" "$@"
}
s2_obertka 0 sudo -n /usr/bin/true "${S2_PREFIKS}0" </dev/null >/dev/null 2>&1 || S2_SLEP="${S2_SLEP:-sudo systemd-run --scope не сработал (нужен sudo -n)}"
if [ "${VSE_STENDY_SCOPE_REQUIRED:-0}" = 1 ] && [ -n "$S2_SLEP" ]; then
  echo "СЛЕПОТА: ночной запуск без scope запрещён: $S2_SLEP"
  exit 2
fi
# B-N-1482: среда только тестовая; EXIT этой функции не заменяет уборку progress родителя.
prognat_stend() (
  local program="$1" limit copy_dir copy_name checksum_before checksum_copy
  limit=$(predel_stenda "$s")
  if [ "$pk" = dsh-subscription-adapter ]; then
    s2_obertka "$S2_N" "${zapusk[@]}" env -u VSE_STENDY_PROGRESS_FILE -u RUNTIME_DIRECTORY "${sreda[@]}" bash -c '
      set -euo pipefail
      umask 077
      test_dir=$(mktemp -d /tmp/vse-stendy-ingress.XXXXXX)
      cleanup() { local status=$?; rm -rf -- "$test_dir" || status=2; exit "$status"; }
      trap cleanup EXIT
      trap "exit 143" TERM
      trap "exit 130" INT
      printf "STEND-TEMP: %s\n" "$test_dir"
      python3 -c "import secrets; print(secrets.token_hex(32))" > "$test_dir/ingress"
      # Последнее присваивание: ни унаследованный путь, ни SREDA не выбирают ключ.
      env GATEWAY_INGRESS_KEY_FILE="$test_dir/ingress" timeout "$1" "$2" "$3" </dev/null
    ' _ "$limit" "$program" "$s"
  # A-N-1948 модуль №1 (Искра; замечание Вениамина 23:1xZ): stend-telo-zaprosa и stend-karta-sessij (шлюз 3.1.1) делают ход через SDK —
  #   той же веткой против БОЕВОГО /opt/claude-oauth; до монтажа 3.1.1 там старый код — красное (telo 0/7, karta 2/5). Ехать вместе со шлюзом.
  # Разбор обхода 08.10 (Заря): stend-limity-process.mjs (B-N-1776 такт 2) запускает НАСТОЯЩИЙ шлюз из sdk-runtime — в дереве
  #   его нет («СЛЕПОТА: … нет gateway.mjs или sdk-runtime»); как соседи — копией под claudeoauth на /opt/claude-oauth (4 из 4).
  elif [[ "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-claude-task-control.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-guest-tools.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-ingress-auth.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-claude-mail-http.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-shemy-mosta.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-limity-process.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-telo-zaprosa.mjs ||
          "$s" = /opt/iskra/workspace/dsh-plugins/packages/dsh-subscription-gateway/test/stend-karta-sessij.mjs ]]; then
    copy_name=${s##*/}
    copy_dir=$(sudo -n mktemp -d /tmp/vse-stendy-claude.XXXXXX) || exit 2
    cleanup_copy() { local status=$?; sudo -n rm -rf -- "$copy_dir" || status=2; exit "$status"; }
    trap cleanup_copy EXIT
    trap 'exit 143' TERM
    trap 'exit 130' INT
    printf 'STEND-TEMP: %s\n' "$copy_dir"
    checksum_before=$(sha256sum -- "$s") || exit 2
    sudo -n install -o root -g root -m 0644 -- "$s" "$copy_dir/$copy_name" || exit 2
    sudo -n chmod 0755 -- "$copy_dir" || exit 2
    checksum_copy=$(sha256sum -- "$copy_dir/$copy_name") || exit 2
    [ "${checksum_before%% *}" = "${checksum_copy%% *}" ] || { echo 'СЛЕПОТА: копия Claude-стенда не совпала с источником'; exit 2; }
    # Шлюз/SDK уже доступны своей служебной учётке; доступа в /opt/iskra ей не даём.
    s2_obertka "$S2_N" sudo -n -u claudeoauth env -u GATEWAY_INGRESS_KEY_FILE -u VSE_STENDY_PROGRESS_FILE -u RUNTIME_DIRECTORY \
      DSH_TEST_APP=/opt/claude-oauth bash -c '
        printf "STEND-EXEC: uid=%s file=%s package=%s\n" "$(id -u)" "$2" "$3"
        exec timeout "$1" node "$2" "$3"
      ' _ "$limit" "$copy_dir/$copy_name" /opt/claude-oauth </dev/null
  else
    s2_obertka "$S2_N" "${zapusk[@]}" env -u VSE_STENDY_PROGRESS_FILE -u RUNTIME_DIRECTORY ${PY_ENV:-} "${sreda[@]}" timeout "$limit" "$program" "$s" "${dovody[@]}" </dev/null
  fi
)

medlennye=()
ozh_vsego=0; neozh_vsego=0; nesud_vsego=0; nesud_spisok=""
# B-N-1207 (30.09.2026, Искра): имена прогнанных — для поимённой сверки с перечнем ниже. Пять строк перечня (28.09–30.09)
# лежали на диске, но вне области обхода: «прошло 263 из 268» говорило ЧИСЛО, а имён не называло никто.
prognany=""
itog=0; vsego_stendov=0
for zapis in "${katalogi[@]}"; do
  IFS=$'\t' read -r d kto app <<< "$zapis"
  imya=$(basename "${d%/}")
  zapusk=(env DSH_KOREN_PLATFORMY="$KOREN_SVOEJ_PLATFORMY")
  # B-N-2019: оба имени платформы — корень этой копии; явная среда стенда ниже сохраняет приоритет.
  [ -n "$kto" ] && zapusk=(sudo -n -u "$kto" env DSH_TEST_APP="$app" STEND_APP="$app")
  ok=0; bad=0; bl=0; spisok=""; prichiny=""; sudy=""
  vyp=$(versiya "$d" "$kto"); pk=$imya; metka=$imya
  # ключ исключений «пакет/стенд»: файл в <пакет>/test/ — имя пакета, иначе — каталог файла (B-N-939)
  # Метка строки итога у строки-файла — ПОЛНЫЙ ПУТЬ (Заря, наряд Забавы 14.10 23:06Z): голое имя не различало одноимённые — 12 пар в области
  #   (stend-audit-runtime.py dsh-pribory и dsh-vypusk-watch и др.); «пакет/стенд» тоже не различает — копии по агентам.
  if est_fajl "${d%/}" "$kto"; then metka=${d%/}; pk=$(basename "$(dirname "${d%/}")"); [ "$pk" = test ] && pk=$(basename "$(dirname "$(dirname "${d%/}")")"); fi
  # 🔴 </dev/null у вызова стенда (Вениамин 02:54): цикл читает перечень из потока, и стенд наследует его как stdin —
  # стенд, читающий stdin, проглотил бы остаток стендов пакета, и сверка покраснела бы «прошло N из M» с ложным диагнозом.
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    prognany="$prognany$s"$'\n'
    read -ra sreda <<< "$(sreda_stenda "$s")"
    # A-N-1711: хвост строки после «--» — доводы стенда (только общая ветка prognat_stend; особые ветки доводов не берут).
    dovody=(); for i in "${!sreda[@]}"; do [ "${sreda[$i]}" = -- ] || continue; dovody=("${sreda[@]:$((i+1))}"); sreda=("${sreda[@]:0:$i}"); break; done
    # С2: номер юнита → стенд → ключ. Ключ --zhivaya-mashina, поданный стенду ДОВОДОМ (SREDA, хвост после «--»; так его даёт только
    #   недельный — поимённо своим строкам), делает его С2-находки «ожидаемо: живой под ключом» (не красное; Забава 11:46Z п.2).
    s2k=0; for a in "${dovody[@]}"; do [ "$a" = --zhivaya-mashina ] && s2k=1; done
    S2_N=$((S2_N+1)); printf '%s\t%s\t%s\n' "$S2_N" "$s" "$s2k" >> "$S2_KARTA"
    # С1 (B-N-1929 такт 3, решение Забавы 11:33Z — вариант (В)): ПРЕДУПРЕЖДЕНИЕ ДО — только печать находок поимённо в сводке,
    #   НЕ красное и НЕ отказ в запуске; краснеет С2. Стенд чужой учётки читается её рукой (сканеру — текстом через stdin).
    if [ -n "$kto" ]; then s1=$(sudo -n -u "$kto" cat -- "$s" 2>/dev/null | python3 -B "$S1_SKANER" - 2>&1); s1k=$?
    else s1=$(python3 -B "$S1_SKANER" "$s" 2>&1); s1k=$?; fi
    # Вениамин п.2 (через Забаву 11:34Z): стенд @root с объявлением ZHIVAYA-MASHINA-NET — его «не трогаю» С2 проверить не может
    #   (systemctl от root записи sudo не даёт) — печать числом и поимённо, не красное.
    if [ "$kto" = root ] && grep -q '^NET' <<< "$s1"; then S1_NET_ROOT=$((S1_NET_ROOT+1)); S1_NET_SPISOK="$S1_NET_SPISOK  ⚠️ NET без проверки С2 (@root): $s"$'\n'; fi
    case $s1k in
      0) ;;
      1|3) S1_N=$((S1_N+1)); [ $s1k -eq 3 ] && S1_MARKER=$((S1_MARKER+1))
           S1_SPISOK="$S1_SPISOK  ⚠️ С1: $s${kto:+ (@$kto)}$([ $s1k -eq 3 ] && echo ' · с маркером ZHIVAYA-MASHINA')"$'\n'
           S1_SPISOK="$S1_SPISOK$(printf '%s\n' "$s1" | awk -F'\t' '$1=="NAHODKA"{print "      строка " $2 ": " $3}' | head -3)"$'\n' ;;
      *) S1_SLEP=$((S1_SLEP+1)); S1_SPISOK="$S1_SPISOK  ⚠️ С1 не прочитал: $s — $(printf '%s' "$s1" | head -1 | cut -c1-120)"$'\n' ;;
    esac
    progress running "$s" || exit 2
    case "$s" in
      *.sh) out=$(prognat_stend bash 2>&1); k=$? ;;
      # A-N-1721: .py — «python3» с PYTHONDONTWRITEBYTECODE=1 в окружении (правило B-N-1599: без байткода; порча того же размера
      # в ту же секунду исполнила бы прежний). Переменная, а не «-B»: «-B» не наследуют дочерние python стенда — проба 07.10:
      # stend-*.py dsh-trevogi под «-B» оставил __pycache__ в дереве (убран). Интерпретатор — первый python3 в PATH:
      # стенду со своим venv путь даёт строка SREDA_STENDOV (PATH=…).
      *.py) out=$(PY_ENV=PYTHONDONTWRITEBYTECODE=1 prognat_stend python3 2>&1); k=$? ;;
      *)    out=$(prognat_stend node 2>&1); k=$? ;;
    esac
    printf '%s\n' "$out" | grep -E '^STEND-(TEMP|EXEC|G-METRIC|AP-METRIC|R-METRIC): ' || true
    # B-N-2062 (Заря; решение Забавы 03:16Z, вариант А): метка стенда «STEND-NEPRIMENIMO: <проба>: <причина>» — наружу с путём стенда
    #   и учёткой (поля через TAB): ворота судят, не осталась ли проба неизмеренной на ВСЕХ копиях. Код стенда этим не меняется.
    printf '%s\n' "$out" | sed -n 's/^STEND-NEPRIMENIMO: //p' | while IFS= read -r nep; do
      printf 'STEND-NEPRIMENIMO: %s\t%s\t%s\n' "$s" "${kto:--}" "$nep"; done
    # B-N-2062 (LOW Вениамина 03:29Z): в режиме ворот (PAKET_IMYA) — ФАКТ прогона «STEND-PROGNAN: <путь>\t<учётка|->\t<код>»:
    #   знаменатель суда меток в воротах — прогнанные, а не лежащие в каталоге (stend-X.py при stend-X.sh, вынесенные строкой и т. п.).
    #   Ночной прогон строку не печатает: журнал не растёт.
    [ -n "${PAKET_IMYA+x}" ] && printf 'STEND-PROGNAN: %s\t%s\t%s\n' "$s" "${kto:--}" "$k"
    elapsed=$(progress finished "$s" "$k" "${kto:--}" "$(predel_stenda "$s")") || exit 2   # B-N-2105: учётка и предел — в ряд
    [ "$elapsed" -lt 30 ] || medlennye+=("$s · ${elapsed} с · код $k")
    klyuch="$pk/$(basename "$s")"
    if [ $k -eq 0 ]; then ok=$((ok+1))
      # B-N-1981 (3.1.8): запись с kopiya — устарела, только если зелёна ЕЁ копия (поле 11; «-» — любая копия, как прежде).
      [ -n "$(awk -F'\t' -v kl="$klyuch" -v put="$s" '$1 == kl { k = $11; sub(/\/$/, "", k)
              if ($11 == "-" || $11 == "" || put == $11 || put == k || index(put, k "/") == 1) { print "y"; exit } }' <<< "$ISKL_TSV")" ] \
        && sudy="$sudy      исключение устарело (стенд зелёный — снять запись): $klyuch"$'\n'
      continue
    fi
    if [ $k -eq 2 ]; then bl=$((bl+1)); spisok="$spisok слепота:$(basename "$s")"
    else bad=$((bad+1)); spisok="$spisok РАСХОЖДЕНИЕ:$(basename "$s")(код $k)"; fi
    sud=$(sudit "$klyuch" "$vyp" "$k" "$out" "$s")
    [[ "${sud%%$'\t'*}" = OZH && "$sud" == *"· покрытие не судимо" ]] && { nesud_vsego=$((nesud_vsego+1)); nesud_spisok="$nesud_spisok $klyuch"; }
    if [ "${sud%%$'\t'*}" = OZH ]; then ozh_vsego=$((ozh_vsego+1)); sudy="$sudy      ОЖИДАЕМО: $klyuch (выпуск $vyp) · ${sud#*$'\t'}"$'\n'
    else
      neozh_vsego=$((neozh_vsego+1))
      # B-N-2108: слепота не поломка; неожиданный исход по-прежнему блокирует ворота кодом 1.
      case "$k" in
        2) sudy="$sudy      ⚠️ НЕОЖИДАННО: $klyuch (выпуск $vyp, код $k) — СЛЕПОТА: ${sud#*$'\t'}"$'\n' ;;
        124) sudy="$sudy      🔴 НЕОЖИДАННО: $klyuch (выпуск $vyp, код $k) — ПРЕДЕЛ: ${sud#*$'\t'}"$'\n' ;;
        *) sudy="$sudy      🔴 НЕОЖИДАННО: $klyuch (выпуск $vyp, код $k) — ${sud#*$'\t'}"$'\n' ;;
      esac
    fi
    {
      # 🔴 A-N-881 (25.09): ПРИЧИНА РАСХОЖДЕНИЯ — В ВЫВОД. Прежде от стенда оставались имя и код, а его строки «❌ проба: причина»
      # пропадали: плавающий отказ stend-otklonennoj-svodki.mjs в воротах 10:4xZ разобрать стало нечем (409 повторов зелёные).
      # До 5 строк провала (❌ / FAIL / Error / СЛЕПОТА), по 200 знаков; строк провала нет — последние 3 строки вывода.
      # B-N-1800 (07.10.2026, Аврора): таких строк нет — строки с «🔴» (без «✅»): им метят провал stend-switch-1, stend-poteri-pisem и др.
      #   Только запасным отбором: «🔴» печатают и проверяемые модули по ходу проб — первым отбором они вытеснили бы FAIL (замер на 590 стендах).
      # B-N-1552 (04.10.2026): вход — here-string, отбор — «grep -m5», а не «printf | grep | head -5». Служба идёт с
      # IgnoreSIGPIPE=yes: ранний выход читателя (head, а с -m и сам grep) давал писателю EPIPE, и в журнал сыпалось
      # «write error: Broken pipe». Без трубы на входе писать в закрытое некому. Итог тот же: первые 5 строк.
      # B-N-1754 (07.10.2026, Аврора): К СТРОКЕ ПРОВАЛА — ЕЁ ПОЯСНЕНИЯ. Стенд печатает «     не в карте: <путь>» над строкой
      #   «   FAIL …» — отбор по образцу их терял, и в итоге оставалось «найдено 1» без имени. Берём к каждой из ≤5 строк провала
      #   (отбор прежний) примыкающие к ней непустые строки с БОЛЬШИМ отступом — до и после, всю цепочку подряд; показ ≤10 на стенд
      #   (VSE_STENDY_POYASNENIJ; 0 — пояснений нет) — с пометкой «↳ » (по ней их отличает читатель обхода). Кадры стека «at …» и прошедшие пробы «✅» не берутся.
      #   Не влезло — последней строкой «↳ (показано K из M)» (r2: 30 находок не теряются молча, читатель несёт счёт в письмо).
      #   ⚠️ НЕ ЛОВИТ: пояснение с тем же или меньшим отступом или отделённое пустой строкой; провал с пометкой «🔴» (не в отборе).
      #   ГРАНИЦЫ ПРАВКИ (B-N-1754, для второй руки): только эти строки до «[ -n "$pr" ] || pr=…» включительно.
      pr=$(awk -v MAXP=5 -v MAXS="${VSE_STENDY_POYASNENIJ:-10}" '
        function ots(s) { match(s, /^[[:blank:]]*/); return RLENGTH }
        function poyasn(j, i) { return !P[j] && L[j] ~ /[^[:blank:]]/ && L[j] !~ /^[[:blank:]]*at |✅/ && ots(L[j]) > ots(L[i]) }
        { L[NR] = $0 }
        END {
          for (i = 1; i <= NR && np < MAXP; i++) if (L[i] ~ /❌|FAIL|Error|СЛЕПОТА|СЛЕПА|ПРОПУСК|✗|✖|not ok/ && L[i] !~ /✅/) { P[i] = 1; np++ }   # = KRASNAYA суда (B-N-1987)
          if (!np) for (i = 1; i <= NR && np < MAXP; i++) if (L[i] ~ /🔴/ && L[i] !~ /✅/) { P[i] = 1; np++ }   # B-N-1800
          for (i = 1; i <= NR; i++) if (P[i]) {
            for (j = i - 1; j >= 1 && poyasn(j, i); j--) if (!R[j]) { R[j] = 1; nr++ }
            for (j = i + 1; j <= NR && poyasn(j, i); j++) if (!R[j]) { R[j] = 1; nr++ }
          }
          for (i = 1; i <= NR; i++) if (P[i]) print L[i]; else if (R[i] && ns < MAXS) { print "↳ " L[i]; ns++ }
          if (ns < nr) print "↳ (показано " (ns + 0) " из " nr ")"
        }' <<< "$out" | korotkaya_prichina)
      [ -n "$pr" ] || pr=$(printf '%s\n' "$out" | tail -3 | korotkaya_prichina)
      # A-N-965 (25.09.2026): имя стенда — ДАННЫМИ, не текстом выражения sed: «|», «&», «\» в имени ломали/искажали строку причин.
      # Префикс — через ENVIRON (awk -v разбирает «\»); не while read: в UTF-8 он склеивает строку, обрезанную cut -c посреди буквы, со следующей.
      prichiny="$prichiny$(printf '%s\n' "$pr" | PREFIKS="      $(basename "$s"): " awk '{ print ENVIRON["PREFIKS"] $0 }')"$'\n'
    }
  done <<< "${PLAN_STENDY[$zapis]}"
  [ $((ok+bad+bl)) -eq 0 ] && continue
  vsego_stendov=$((vsego_stendov+ok+bad+bl))
  printf '%-26s зелёных %-3s расхождений %-3s слепот %s%s\n' "$metka" "$ok" "$bad" "$bl" "${kto:+ · под $kto, платформа $app}"
  [ -n "$spisok" ] && echo "   $spisok"
  [ -n "$prichiny" ] && printf '%s' "$prichiny"
  [ -n "$sudy" ] && printf '%s' "$sudy"
done
for slow in "${medlennye[@]}"; do printf 'ДОЛГИЙ СТЕНД: %s\n' "$slow"; done
# С2 (B-N-1929 такт 3): суд по журналу юнитов этого прогона. Коды разборщика: 0 чисто · 1 находки · 2 слепота.
s2_kod=0; s2_vyvod=""
# Разборщик — доводом -c, НЕ «python3 - <<heredoc»: heredoc занял бы stdin, и журнал из трубы не дошёл бы (поймано зрячестью 11:4xZ).
S2_PY=$(cat <<'PY_S2'
import datetime, importlib.util, json, os, pwd, re, sys
put, prefiks, karta, vsego = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
try:
    sp = importlib.util.spec_from_file_location('skaner', put); sk = importlib.util.module_from_spec(sp); sp.loader.exec_module(sk)
    stroki = [l.split('\t') for l in open(karta, encoding='utf-8').read().splitlines() if l.count('\t') == 2]
    stend = {r[0]: r[1] for r in stroki}; pod_klyuchom = {r[0] for r in stroki if r[2] == '1'}
except Exception as e: print(f'СЛЕПОТА С2: {type(e).__name__}: {e}'); sys.exit(2)
SHADOW = ('useradd', 'userdel', 'usermod', 'groupadd', 'groupdel', 'groupmod', 'gpasswd', 'chpasswd')
# 3.1.9 (находка 2 ночей 10.10/11.10: 57 и 75 ложных «🔴 С2 … изменил живую машину»): собственный запрос С2 ВЛОЖЕННОГО обходчика (стенды
#   обхода зовут его внутри своих юнитов) — чтение журнала. Узнаётся ТОЛЬКО по точной форме целиком (прежняя 3.1.8 и нынешняя), не по имени
#   journalctl: «sudo journalctl --vacuum-*/--rotate/--flush …» меняют машину и остаются на суде сканера (предупреждение Вениамина 05:04Z).
_s2_comm = ' '.join('_COMM=' + x for x in ('sudo',) + SHADOW); _s2_ident = ' '.join('SYSLOG_IDENTIFIER=' + x for x in ('sudo',) + SHADOW)
ZAPROS_S2 = re.compile(r"/usr/bin/journalctl -q -o json --since '\d{4}-\d\d-\d\d \d\d:\d\d:\d\d' " + re.escape(_s2_comm) + '(?: ' + re.escape('+ ' + _s2_ident) + ')?')
zapisi, zryachest, yunitov = [], False, set()
proba, kto = '/usr/bin/true ' + prefiks + '0', pwd.getpwuid(os.getuid()).pw_name   # 3.1.9: проба узнаётся по метке и без привязки
bez_priv = 0
for l in sys.stdin:
    try: d = json.loads(l)
    except ValueError: continue
    u = d.get('_SYSTEMD_UNIT', '')
    if not u:   # 3.1.9: journald потерял поля (процесс вышел до приёма) — юнит не узнать; программа — из SYSLOG_IDENTIFIER
        m = d.get('MESSAGE', ''); m = bytes(m).decode('utf-8', 'replace') if isinstance(m, list) else str(m)
        ident, t = d.get('_COMM') or d.get('SYSLOG_IDENTIFIER', ''), int(d.get('__REALTIME_TIMESTAMP', 0))
        if ident == 'sudo':
            if 'COMMAND=' not in m: continue
            kom = m.split('COMMAND=', 1)[1].strip()
            if kom == proba: zryachest = True; continue
            if m.split(':', 1)[0].strip() != kto: continue   # чужая учётка — не стенды этого прогона
            bez_priv += 1; zapisi.append((t, '?', kom, False))
        elif ident in SHADOW: bez_priv += 1; zapisi.append((t, '?', f'{ident}: {m}', True))
        continue
    if not (u.startswith(prefiks) and u.endswith('.scope')): continue
    n = u[len(prefiks):-len('.scope')]; yunitov.add(n)
    m = d.get('MESSAGE', ''); m = bytes(m).decode('utf-8', 'replace') if isinstance(m, list) else str(m)
    t = int(d.get('__REALTIME_TIMESTAMP', 0))   # микросекунды: в одной секунде systemd-run и stop своего юнита — порядок по тексту врал бы
    if d.get('_COMM') == 'sudo':
        if 'COMMAND=' not in m: continue
        kom = m.split('COMMAND=', 1)[1].strip()
        if n == '0':
            zryachest = zryachest or kom == proba; continue
        zapisi.append((t, n, kom, False))
    elif d.get('_COMM') in SHADOW: zapisi.append((t, n, f"{d['_COMM']}: {m}", True))
def ispolnyaemoe(kom):   # имя исполняемой команды записи sudo: пропустить env (-u X, -i), VAR=знач, timeout [ключи] срок, nice -n N
    t = kom.split(); i = 0
    while i < len(t):
        b = t[i].rsplit('/', 1)[-1]
        if b == 'env':
            i += 1
            while i < len(t) and (t[i].startswith('-') or '=' in t[i]): i += 2 if t[i] in ('-u', '--unset', '-C', '--chdir') else 1
            continue
        if '=' in t[i] and not t[i].startswith('/'): i += 1; continue
        if b in ('timeout', 'nice', 'ionice', 'stdbuf'):
            i += 1
            while i < len(t) and (t[i].startswith('-') or t[i][:1].isdigit()): i += 2 if t[i] in ('-n', '-k', '-s', '-c') else 1
            continue
        return b
    return ''
INSTRUMENTY = ('klon-agenta', 'smontirovat-', 'agent-plugins', 'podyom-uzla')
svoi, nah, ozh = {}, [], {}
# «Свои» юниты — по ВСЕМ записям юнита до суда: стенд часто чистит имя ДО systemd-run (stend-reestra-agentov, полный прогон 12:13Z).
for t, n, kom, shadow in zapisi: svoi.setdefault(n, set()).update(sk.bez_suffiksa(x) for x in sk.svoi_yunity(kom))
svoi['?'] = set().union(*svoi.values()) if svoi else set()   # 3.1.9: запись без привязки — «свои» юниты всего прогона
nah_bez = []
for t, n, kom, shadow in sorted(zapisi, key=lambda z: z[0]):   # устойчиво: при равном времени — порядок журнала
    h = 'shadow-utils' if shadow else sk.nahodka(kom)
    if not h: continue
    ex = ispolnyaemoe(kom)
    if ZAPROS_S2.fullmatch(kom): continue   # 3.1.9: свой запрос С2 вложенного обходчика — по точной форме (см. ZAPROS_S2)
    # Запуск САМОГО стенда (обход: sudo -u <учётка> env … <интерпретатор> <стенд> …) — не действие; его доводы (пути инструментов) — не вызовы.
    #   Узко (граница Вениамина 12:41Z): ровно форма вызова обходчика «timeout <срок> <bash|node|python3> <путь стенда этого юнита>».
    if stend.get(n) and re.search(r'(^|\s)timeout \d+ (bash|node|python3) ' + re.escape(stend[n]) + r'(\s|$)', kom): continue
    if n == '?' and any(re.search(r'(^|\s)timeout \d+ (bash|node|python3) ' + re.escape(p) + r'(\s|$)', kom) for p in stend.values()): continue   # 3.1.9: запуск стенда без привязки
    # Инструмент с ключом действия — находка, только если он сам ИСПОЛНЯЕМОЕ записи; путь доводом (sha256sum …/podyom-uzla) — чтение.
    if h.startswith(INSTRUMENTY) and not ex.startswith(h.split()[0].rstrip('-')): continue
    if h.startswith('systemctl'):
        celi = [sk.bez_suffiksa(x) for x in sk.tseli_systemctl(kom)]
        if celi and all(c in svoi[n] for c in celi): continue
    kogda = f"{datetime.datetime.fromtimestamp(t / 10**6, datetime.timezone.utc):%H:%M:%SZ}, юнит {prefiks}{n}"
    if n == '?': nah_bez.append(f"  ⚠️ С2 БЕЗ ПРИВЯЗКИ: меняющая команда, журнал потерял юнит — источник не установить (стенд обхода или иной процесс учётки {kto}): {kom[:200]} ({kogda[:9]})"); continue
    if n in pod_klyuchom: ozh.setdefault(stend[n], []).append(kom[:160]); continue   # Вениамин (б) 11:5xZ: «ЖИВОЙ ПО КЛЮЧУ», не красное
    nah.append(f"  🔴 С2: стенд {stend.get(n, '?№' + n)} изменил живую машину: {kom[:200]} ({kogda})")
print('\n'.join([f"  ЖИВОЙ ПО КЛЮЧУ: {st}: {'; '.join(k)}" for st, k in ozh.items()] + nah + nah_bez))
if not zryachest: print(f'СЛЕПОТА С2: записи пробы зрячести «{proba}» в журнале нет — записи sudo этого прогона не видны'); sys.exit(2)
print(f'С2: стендов в своих юнитах {vsego}, с записями sudo/shadow {len(yunitov - {"0"})}, находок {len(nah)}, живых по ключу {len(ozh)}, '
      f'записей без привязки к юниту {bez_priv} (из них меняющих {len(nah_bez)})')
sys.exit(1 if nah else 2 if nah_bez else 0)
PY_S2
)
if [ -z "$S2_SLEP" ]; then
  sleep 1   # журнал пишет sudo асинхронно — дать последней записи лечь
  s2_vyvod=$(sudo -n journalctl -q -o json --since "$S2_NACHALO" _COMM=sudo _COMM=useradd _COMM=userdel _COMM=usermod \
      _COMM=groupadd _COMM=groupdel _COMM=groupmod _COMM=gpasswd _COMM=chpasswd \
      + SYSLOG_IDENTIFIER=sudo SYSLOG_IDENTIFIER=useradd SYSLOG_IDENTIFIER=userdel SYSLOG_IDENTIFIER=usermod SYSLOG_IDENTIFIER=groupadd \
      SYSLOG_IDENTIFIER=groupdel SYSLOG_IDENTIFIER=groupmod SYSLOG_IDENTIFIER=gpasswd SYSLOG_IDENTIFIER=chpasswd 2>/dev/null \
    | python3 -B -c "$S2_PY" "$(dirname "$0")/skaner-zhivoj-mashiny.py" "$S2_PREFIKS" "$S2_KARTA" "$S2_N"
  ); s2_kod=$?
else
  s2_vyvod="СЛЕПОТА С2: $S2_SLEP — стенды шли без своих юнитов"; s2_kod=2
fi
printf '%s\n' "$s2_vyvod" | sed '/^$/d'
printf '%s' "$S1_SPISOK"
echo "С1 (предупреждение, не красное): стендов с меняющими командами в тексте $S1_N (из них с маркером $S1_MARKER) · не прочитано $S1_SLEP · из $S2_N"
printf '%s' "$S1_NET_SPISOK"; echo "NET без проверки С2 (@root): $S1_NET_ROOT"
rm -f -- "$S2_SREDA" "$S2_KARTA"
if [ "$vsego_stendov" -eq 0 ]; then
  echo "СЛЕПОТА: ни одного стенда не найдено — это про обход, а не про предметы."
  exit 2
fi
# ── ЗНАМЕНАТЕЛЬ ИЗ ОБЪЯВЛЕННОГО СПИСКА, А НЕ ИЗ ЧИСЛА ОТРАБОТАВШИХ ──────────
# 🔴 ЗАЧЕМ (требование Забавы 09.09.2026): «Y обязан браться из ОБЪЯВЛЕННОГО списка проб,
# а не из числа отработавших — иначе знаменатель считает сам себя и сходится всегда».
# Прежде здесь печаталось «стендов N», где N — сколько нашлось на диске. Пропади стенд
# (переименован, удалён, положен не туда) — обход его не найдёт, и итог остался бы зелёным
# и правдивым ПО ЦВЕТАМ, но ложным ПО ОХВАТУ. Её же класс: «проба не падает — она ИСЧЕЗАЕТ,
# ложь в знаменателе».
# ⚠️ ГРАНИЦА: перечень РУЧНОЙ и не знает, законно ли появление нового стенда. Он лишь
# заставляет расхождение быть НАЗВАННЫМ — в обе стороны.
PERECHEN="${PERECHEN_STENDOV:-/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt}"
if [ -r "$PERECHEN" ]; then
  obyavleno=0
  net_na_diske=0; net_v_perechne=0; net_v_oblasti=0
  while IFS= read -r p; do
    case "$p" in \#*|'') continue;; esac
    # Режим одного пакета: объявленное — только строки под его боевыми каталогами.
    if [ -n "${PAKET_IMYA:-}" ]; then
      svoj=""; for zapis in "${katalogi[@]}"; do IFS=$'\t' read -r d _ _ <<< "$zapis"; [[ "$p" == "${d%/}" || "$p" == "$d"* ]] && svoj=1; done
      [ -n "$svoj" ] || continue
    fi
    [ -n "${PAKET_IMYA+x}" ] && propusk_prichina "$p" >/dev/null && continue   # B-N-2071 (б): пропущенный — не объявленный
    obyavleno=$((obyavleno+1))
    kto=$(kto_dlya "$p")
    if [ -n "$kto" ]; then sudo -n -u "$kto" test -f "$p"; else [ -f "$p" ]; fi \
      || { echo "  🔴 В ПЕРЕЧНЕ ЕСТЬ, НА ДИСКЕ НЕТ: $p${kto:+ (смотрела под $kto)}"; net_na_diske=$((net_na_diske+1)); continue; }
    # B-N-1207: файл есть, но обход его не звал — строки области обхода (OBLAST_STENDOV) для него нет.
    grep -qxF -- "$p" <<< "$prognany" \
      || { echo "  🔴 В ПЕРЕЧНЕ ЕСТЬ, ОБХОДОМ НЕ ПРОГНАН (вне области обхода): $p"; net_v_oblasti=$((net_v_oblasti+1)); }
  done < "$PERECHEN"
  for zapis in "${katalogi[@]}"; do
    IFS=$'\t' read -r d kto app <<< "$zapis"
    while IFS= read -r s; do
      grep -qxF "$s" "$PERECHEN" || { echo "  🔴 НА ДИСКЕ ЕСТЬ, В ПЕРЕЧНЕ НЕТ: $s"; net_v_perechne=$((net_v_perechne+1)); }
    done < <(stendy_kataloga "$d" "$kto" | { if [ -n "${PAKET_IMYA+x}" ]; then bez_propuska; else cat; fi; })
  done
  echo "ПОКРЫТИЕ: прошло $vsego_stendov из $obyavleno объявленных · пропало $net_na_diske · незаписанных $net_v_perechne · вне области $net_v_oblasti"
  if [ "$vsego_stendov" -ne "$obyavleno" ] || [ "$net_na_diske" -gt 0 ] || [ "$net_v_perechne" -gt 0 ] || [ "$net_v_oblasti" -gt 0 ]; then
    echo "🔴 ОХВАТ РАЗОШЁЛСЯ С ОБЪЯВЛЕННЫМ — цвета выше верны, но считаны НЕ ВСЕ пробы"
    itog=1
  fi
else
  echo "⚠️ СЛЕПОТА ОХВАТА: перечня $PERECHEN нет — знаменатель снова считает сам себя"
  [ "$itog" -eq 1 ] || itog=2
fi
if [ -n "$ISKL_SLEP" ]; then
  echo "⚠️ СЛЕПОТА ИСКЛЮЧЕНИЙ: $ISKL_SLEP"
  [ "$itog" -eq 1 ] || itog=2
fi
[ "$neozh_vsego" -gt 0 ] && itog=1
[ "$s2_kod" -eq 1 ] && itog=1                               # С2: стенд изменил живую машину — исключения не действуют
[ "$s2_kod" -eq 2 ] && [ "$itog" -ne 1 ] && itog=2          # С2 слеп — полнота неустановима
[ "$itog" -eq 0 ] && [ "$ozh_vsego" -gt 0 ] && itog=3
echo "СУД ОТКАЗОВ: неожиданных $neozh_vsego · ожидаемых $ozh_vsego (исключения: $ISKL)"
[ "$nesud_vsego" -gt 0 ] && echo "⚠️ ПОКРЫТИЕ НЕ СУДИМО (pokrytie: kod — ожидаемо по коду, красных строк нет): $nesud_vsego —$nesud_spisok"
echo "ИТОГ: стендов $vsego_stendov · код $itog (0 — чисто · 3 — только ожидаемое · 1 — неожиданное · 2 — полнота неустановима)"
exit $itog
