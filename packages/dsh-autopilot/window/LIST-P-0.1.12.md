# Лист П · кандидат выпуска AP 0.1.12

Машина sadik. Наряд Забавы 19.10.2026 19:12:08Z; ворота Вениамин. Автор Бета готовит пакет и лист, ничего не монтирует. Исполнение назначает координатор после ворот. Отдельный пакет шлюза Гаммы `2bc55a08b29f0a48deb73c69e9178ce65a2c2007` (продуктовый код638a579e, последняя дельта только стенд) устанавливается **после AP**. Авторские AP48 и синтетические матрицы не заменяют канарейку на настоящей подписке.

Основание AP — `4d79ce48c7ad0e2a3e9950dfd627afc4eeafc193`, с принятыми M3/M8/M7 из `74c6af10` и базой `01e7fb940fea43222a730b61ef18998ad6a2956d` в родословной. Голова выпуска, bundle/patch/source и их суммы — в П7 этой передачи. Неизменный physical L: `/opt/autopilot/releases/9fc898cbe941d5b8a369f1dd657e9119676eb44f-a20-b42-c2-release-012`; физический L из13e2fd38 не меняется. README-PILOT остаётся его прежними байтами; известная битая установленная относительная ссылка записана Minor в CHANGELOG0.1.12, исправление в0.1.13. Источник прежнего листа: `/var/tmp/AP0111-WINDOW-P-R34-alfa-20261019/LIST-P.r3.4.md`, SHA256 `8d33ee3c6e74c238d9d6080beaa0c4c1528b1d741d513ba28e5bf19662ef0818`; дельта Беты `ef70a16bc732168e2c72e34477166cd544aa5b8553649643cf6fe33a0c307c39` переносится ниже. Старый лист/его scripts неизменны и не являются исполняемыми программами этого окна.

Этот лист задаёт последовательность и обязательные признаки. Монтажные leaf-программы AP, private-stage и rollback-параметры готовит назначенная root-рука по принятой П7 окна; их суммы/metadata принимаются отдельно. Раздел шлюза, включая порядок, канарейку и две совместимости, поставляет Гамма отдельным файлом по ссылке P2–P3. Нельзя подставить r3.4 scripts с L_0111 и schema2 вместо новой приёмки schema3. Pdry и живые шаги здесь не объявлены выполненными.

Физический путь листа на исходной package-полке этой передачи: `/opt/coders/beta/workspace/AP012-PDRY-FIX-20261019/repo/packages/dsh-autopilot/window/LIST-P-0.1.12.md` (версия — HEAD/SHA из П7). Операторская принятая копия после stage: `/root/AP012-P-20261019-r2/package/window/LIST-P-0.1.12.md`. В canonical registry запись dsh-autopilot/path указывает корень своей package-полки; `window/LIST-P-0.1.12.md` читается относительно неё, **не** относительно установленного L/pilot/README.md. Файл window в L не поставляется.

## P0. Паспорт, тишина и страховка

Координатор именует root-руку, оператора master, исполнителя vintik, приёмку sova, наблюдателя и окно тишины. Согласовать новый проект `P`, отдельный от живого `/srv/autopilot/projects/ap-test-0110`, и симметричный Pdry на копии. `P` — физический Git-корень; ссылки наружу не расширяют поручение. Старый RUN не переносится на новый core сменой current.

В private root-stage сохранить: П7/описи/суммы AP и шлюза; принятые commit/tree и физические пути; старые current/pins, unit/drop-ins, registry, ACL изменяемых путей, владельцев/режимы и inode; индекс учёта и origin; очередь usage_registrations с run_id/request_sha. Страховку сверить с источником отдельным cmp/sha256sum. Не читать и не включать в отчёт значения auth/keys/tokens. Письмо/rc отправителя не заменяют дисковые суммы.

### Назначенные значения этой редакции

Значения AP/Pdry заданы в поставляемом `window/pdry-parameters.json`; это данные, не разрешение создать живой проект до ворот:

| Имя | Назначенное значение |
|---|---|
| L | `/opt/autopilot/releases/9fc898cbe941d5b8a369f1dd657e9119676eb44f-a20-b42-c2-release-012` |
| P | `/srv/autopilot/projects/ap-test-0112` (новый проект, не ap-test-0110) |
| T | `/var/tmp/AP012-PDRY-RUN-20261019` |
| Pdry | `/var/tmp/AP012-PDRY-RUN-20261019/project` |
| S | `/root/AP012-P-20261019-r2` — новая защищённая root-stage |
| Private server leaf | `/root/AP012-P-20261019-r2/package/window/pdry-server.py` |
| Alert recorder | `/root/AP012-P-20261019-r2/package/window/record-alert.py` |
| Private unit | `stend-ap012-pdry-20261019.service` |
| Private socket | `/var/tmp/AP012-PDRY-RUN-20261019/run/post.sock` |
| Private server state | `/var/tmp/AP012-PDRY-RUN-20261019/state` |
| Alert record | `/var/tmp/AP012-PDRY-RUN-20261019/alerts/record.jsonl` |
| Private leaf data | `/root/AP012-P-20261019-r2/package/window/pdry-parameters.json` |
| Private RUN | `pdry012-20261019` — только синтетическая почта Pdry |
| Private observation | `/var/tmp/AP012-PDRY-RUN-20261019/observations/transport-01.json` |
| Live observation container | `/root/AP012-P-20261019-r2/observations/window-01` |
| Решение live observation | `/root/AP012-P-20261019-r2/observations/window-01/decision.json` — root-owned решение аудитора до открытия P7 |

Live state назначены: `/srv/autopilot/projects/ap-test-0112/.pilot/master/jobs.json`, `/srv/autopilot/projects/ap-test-0112/.pilot-receivers/vintik/state.json`, `/srv/autopilot/projects/ap-test-0112/.pilot-receivers/sova/state.json`. Private state — те же относительные пути внутри Pdry. Смена этих значений требует новой именованной редакции/данных, не молчаливого fallback. T создаётся root эксклюзивно под root-owned sticky /var/tmp, mode0755; родитель не может принадлежать участнику или быть group/other-writable без sticky. Рабочая копия кандидата для AP48 остаётся в workspace (урок226/NAMESPACE). До подготовки проверить P/T/S; существующий T — STOP, без очистки/повторной отправки. Существующий L сверяется с принятым составом и не переписывается.

Root-рука после ворот кладёт **весь** принятый пакет из source archive под S/package с root ownership, проверяет имена/SHA/mode по П7 и только затем вызывает leaf. Копирование одного server leaf без принятого состава не является stage. Для запуска под сервисной учёткой root копирует leaf и recorder в доступный T, сохраняя root ownership/mode0755 и сверяя SHA с S/package. Состав и суммы private leaf/data принимаются вместе с этой П7; автор не объявляет их уже принятыми аудитором. Leaf не устанавливает AP, не создаёт P и не запускает модель. Отдельные параметры шлюза GW_TAG/GW_PACKAGE/GW_SECTION_PATH/SHA поступают из раздела Гаммы; эта таблица их не придумывает.

AP_HEAD/AP_BUNDLE_SHA/AP_SOURCE_SHA и inventory берутся из П7 этой головы; кодовые поля не подменять произвольной переменной. Пустые/несогласованные данные и не принятый private leaf — STOP. Нельзя выполнять старые root-common/P7 scripts из AP0111 или считать один private transport протокол всем живым P7.

Перед первым изменением, после остановки новых submit/init, и повторно перед переключением AP проверить:

- `/var/lib/autopilot-usage/index.json`: корректная схема индекса **1**, OPEN ровно **0 из всех runs**; вывести поимённо OPEN и общее число. Индекс закреплений `/var/lib/dsh-autopilot` не заменяет индекс учёта. Негодный/отсутствующий индекс — STOP, не ноль; не закрывать RUN редактированием JSON.
- Каноническая очередь usage_registrations пуста и читается; отсутствие таблицы/ошибка запроса — STOP. Зафиксировать пары, а не только COUNT.
- Нет другого AP-стенда/установщика и активных заданий участников. Авторство и время снимка записать. Новое OPEN/очередь до завершения переключения — STOP до действия, не автоматическое закрытие.

Read-only команда root для первого условия (вывод без содержимого record):

```bash
python3 -I -B - "$AP_PACKAGE/runtime" <<'PY'
import importlib.util,json,sys
from pathlib import Path
p=Path(sys.argv[1])/'team_usage.py'
s=importlib.util.spec_from_file_location('release_preflight_usage',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
d=m.trusted_json(Path('/var/lib/autopilot-usage/index.json'))
assert type(d) is dict and set(d)=={'schemaVersion','runs'} and d['schemaVersion']==1
assert type(d['runs']) is list
assert all(type(r) is dict and set(r)=={'runId','phase','record'} and r['phase'] in ('OPEN','CLOSED') for r in d['runs'])
opened=[r['runId'] for r in d['runs'] if r['phase']=='OPEN']
print(json.dumps({'runs':len(d['runs']),'open':len(opened),'openRunIds':opened}))
assert not opened, 'STOP: OPEN runs exist'
PY
```

`AP_PACKAGE` — доверенная физическая копия принятого пакета, не live current. Эта команда не меняет индекс; до запуска сверить её источник с П7. Ошибка импорта/прав также останавливает окно.

### P0m. СТОП: post/0.1.10 не переписывается

Это обновление AP, не монтаж почтового runtime. **СТОП: post/0.1.10 не переписывается**, включая `/opt/autopilot/post/0.1.10/source-lock.json`. `runtime_files` в сыром MAIL-LAYOUT кандидата описывает отдельную postal-поставку, а не список замен почты в этом окне; его новые source-lock/README суммы не подставлять вместо принятых почтовых строк.

Назначенная root-рука до первой записи берёт путь и SHA принятого публичного манифеста из действующего `installed_check` записи dsh-autopilot. Убедиться, что команда и сумма связаны именно с этим файлом; не угадывать суффикс имени. Из него выбрать ровно **22 уникальные file-строки** `/opt/autopilot/post/0.1.10/`, сверить с диском и сохранить снимок: полный путь, SHA256, mode, UID/GID, device/inode и nlink. Нечитаемый/необычный файл, иное число/состав, несовпадение с принятой раскладкой → STOP до записи. Ни один из этих 22 путей не входит в изменяемые группы окна AP; проверить это по поимённому payload, а не обещанию автора.

Публичный манифест 0.1.12 для `installed_check` строится как **прежняя принятая раскладка + свои изменения AP** (как 0111 сохранял 0110u). Все post-строки переносятся из принятого манифеста без изменения и должны совпасть с диском; старые строки почты/учёта не теряются. Новые AP shelf/release/current строки добавляются/меняются по фактическому принятому payload. Сырой `MAIL-LAYOUT.json` 0.1.12 с `runtime_files` не является входным `version/rows` манифестом `checks/layout-check.py`. В реестре закрепляются точный путь и SHA полученного публичного манифеста; переподписание ошибочных post-строк не лечит несовпадение.

После установки AP, до принятия окна и после последующих его стадий root повторно читает те же 22 пути и сравнивает весь снимок, включая device/inode. Новая сумма, режим, владелец или inode любого файла → именованный STOP с путём, не «почта не менялась» по одному COUNT. Отдельно назначенный читатель исполняет `installed_check` против закреплённого нового публичного манифеста; сохранить команду/rc/вывод/суммы. Снимки «до/после установки» и этот результат — работа монтажной руки, автор этого листа их не присваивает.

Сухая проба на копии: здоровый публичный манифест с фактическими post-строками + новой AP-строкой проходит настоящий layout-check; заменить только ожидаемый SHA postal source-lock на сумму AP-кандидата → тот же checker называет `content differs` у этого пути. Показать одну замену, grep -cF и разные SHA манифеста; вернуть точные bytes/SHA → снова проходит. Отдельно порча inode/owner только в копии снимка должна остановить сравнение 22 файлов. Почтовые файлы боя ради пробы не менять.

`MAIL-LAYOUT.base` сохраняет историческую ссылку принятой postal-описи `32a6353dcbc81fc0ab5b7253bea9c59fbe417b17`, как в 0.1.11. Она не задаёт основу нового Git-пакета AP и не выбирает пути runtime. Основание AP — 4d79ce48 — фиксируется в Git/П7. В проверенных операционных читателях (prepare-window, layout-check, postal/usage manifest builders, sadik-watch-enabled) поле base не используется как условие исполнения; авторская проверка генератора сверяет его только как данные. Область/адреса чтения приложить к дельте, не утверждать отсутствие любого внешнего потребителя.

## P1. Сначала AP, затем шлюз

После read-only предпроверок назначенная рука ставит службы окна на принятую паузу и сохраняет effective unit. Пауза запрещает автоподъём: если требуется отключение службы, использовать mask по правилам машины, не disable; собственный unit-файл сначала в страховку, затем daemon-reload/mask. Состав служб и точный возврат — только по принятой программе окна. До этой паузы не снимать рабочую привязку collector.

Первое изменение конфигурации установки — адресно снять `/etc/systemd/system/autopilot-usage.service.d/ap0111-p-resolved.conf` в страховку с cmp, не systemctl revert и не весь service.d. Collector остаётся в паузе до принятого нового effective ExecStart; нельзя запускать промежуточную конфигурацию или возвращать old physical L случайно.

AP устанавливается пакетом по принятому составу, через `.new` рядом и mv там, где это предписывает оконная программа. Новый immutable release не перезаписывает старую полку. Проверить имена/байты/mode/owner, новый inode изменённых объектов, current→принятый physical L, registry/installed-check и пустой Git-учёт соответствующих боевых объектов. Новый init использует новый core; старые pins не мигрируют.

До шлюза проверить на физически разложенном L:

- tools/child_usage.py и tools/child-source-versions.json, а также skill/tools, действительно входят в release; renderer/писатель/валидатор/consumer/оконный судья одной версии schema3.
- Эффективный collector запускает новый L. В 0.1.12 exporter выбирается через physical resolve; проверить **фактический** exporter path на частном тике и затем новом разрешённом живом тике. Не требовать старый временный drop-in как часть нового релиза. Использование current в тексте unit само по себе не равняется R_EXPORTER_UNSAFE; решает разрешённый путь загруженного кода.
- Новый renderer с подставной квитанцией schemaVersion=4 показывает видимую строку «квитанция формата 4 — этот рендерер её не понимает», без sentinel-чисел. Скрытый баннер/показ poisoned totals должны провалить контроль; точный возврат даёт исходный результат.

Штатный manifest AP содержит `schemaVersion/sourceVersions/nativeFormats`; fixture второй supported-профиль задаёт только trusted `runtime_receipt_source.CHILD_SOURCE_MANIFEST=Path(...)` на копии. Не переносить тестовый B в боевой manifest; у шлюза обёртка `supported`, полные sourceVersion должны совпасть по пяти полям. `sv1:` пересчитывается AP. Метрики — native; child_usage не обязателен.

## P2–P3. Отдельный раздел шлюза Гаммы

GW_SECTION_PATH=`/opt/coders/gamma/workspace/AP012-GATEWAY-WATCH-CLOSURE-20261019/window/WINDOW-GATEWAY.md`, GW_SECTION_SHA256=`7e9db2c5c063a58abf122f8cae29e9c6b2ac9992827efc55e327c17255cf81a8` — итоговая документная дельта Гаммы к31d69143 по тревогам сторожа и признаку закрытия, передана к общим воротам. [Раздел Гаммы](/opt/coders/gamma/workspace/AP012-GATEWAY-WATCH-CLOSURE-20261019/window/WINDOW-GATEWAY.md). Scripts/inputs/evidence/runs по его указанию относятся к корню прежнего комплекта `/opt/coders/gamma/workspace/AP012-GATEWAY-WINDOW-20261019`, не к каталогу нового документа. Принятую GW_TAG/GW_PACKAGE, stage/страховку и исполняющую руку задаёт паспорт отдельного шлюзового окна, не номер AP.

Порядок, канарейка и обе совместимости принадлежат этому отдельному файлу; собственного параллельного сценария Беты здесь нет. AP устанавливается и проверяется раньше шлюза. Прямое письмо Забавы20:05:47Z подтвердило решение координатора и Вениамина: канарейка — первый подъём Совы и живой ход с субагентом, признаки строкой CANARY назначаются до подъёма; отдельный маршрут до подъёма не нужен. После GREEN Совы остальные16 поднимаются по одному. Оба прежних стопа сняты; ограничение restart толькоAP7 больше не действует. Основание31d69143 признано Вениамином ГОДНО23:00МСК; документная дельта7e9db2c5 добавляет ожидаемые тревоги внутри окна и закрывающий признак. Продуктовый код638a579e прежний; отдельная голова2bc55a08b29f0a48deb73c69e9178ce65a2c2007 меняет только HTTP-стенд. Это не отменяет ворот и назначения исполнителя общего окна.

Основной каталог общий для16, гостевой — ещё1; новый раздел охватывает оба диска и последовательные подъёмы всех17. AP7 проверяются также по числовой AP-строке, остальные10 — через обычный ход без добавления в AP. AP-membership gate отсутствует; не-AP с валидным observer тоже может получить capture. Красная первая канарейка означает возврат общего основного диска и только Совы, следующих подъёмов0; более поздний возврат определяется фактически выполненными фазами по разделу Гаммы. Вставка ссылки не является исполнением. До принятия общего окна шлюзовые команды этого листа не запускаются.

Внутри окна РАЗОШЛОСЬ только по ещё не поднятым в очереди ожидаемо и не останавливает окно; расхождение уже проверенного процесса таким исключением не покрыто. Watch не отключается, его конфигурация/охват не меняются. Закрытие — первый тик ПОСЛЕ последнего подъёма со «сошлось» по поимённым16main; Варвара отдельно: PID/InvocationID/version/SHA. Это будущие признаки, не результаты авторского прогона.

## P4. Проект и среда master/vintik/sova

Отдельные обычные наряды координатора задают роли и разрешённую зону. Root заранее создаёт P, `.pilot-receivers` и каждый подкаталог участника. Родитель `.pilot-receivers` — root или master, sticky 1770/3770; **подкаталоги участников без setgid**, владелец соответствующий участник, private state/inbox 0700/0600. Подтвердить реальное создание .mail-inbox0700 под UID получателя; 2700 не допускается.

Единая таблица state-путей в паспорте окна: master → `$P/.pilot/master/jobs.json`; vintik → `$P/.pilot-receivers/vintik/state.json`; sova → `$P/.pilot-receivers/sova/state.json`. Значение RECEIVER_STATE в brief/receive/claim/finish и в заключительном P9 берётся из этой таблицы, без альтернативного `.pilot/<receiver>/jobs.json`. До первого receive файл может ещё не существовать: проверяются его реальные parent/UID/права, пустой JSON ради прохождения контроля не создавать. После исполнения назначенного задания отсутствие файла — недоказанное состояние, не отсутствие активных jobs.

**До init/run**, а не после первого отказа finish, каждый участник своим UID проверяет все назначенные служебные пути. Master — `.pilot/master` и свой `.mail-inbox`; vintik/sova — соответствующий parent state, будущий state.lock, `.mail-inbox`, временные contract/result-файлы и рабочие outputs. В разрешённых writable-каталогах выполнить создание нового контрольного файла, запись, fsync, rename и удаление, проверить owner/mode; новый private inbox создаётся 0700 без setgid. Контроль не читает/переписывает действующие state/lock и не даёт write на P/.autopilot. После уборки probes сверить неизменность прежних объектов. Любой EACCES, неверная маска/владелец или невозможность атомарной записи → STOP до run; права исправляет назначенная рука, затем вся предпроверка повторяется.

На Pdry до живого старта отдельно обязателен настоящий цикл helper от vintik и sova: receive/claim → finish → Master result, с original, STORED и COMPLETED. Порча writable-прав одного служебного parent должна остановить предпроверку; после точного возврата прав штатный цикл проходит. Ручной обход сдачи — копирование результата, state от root, отправка вместо finish или создание отсутствующего state для P9 — не считается прохождением. Если права сломались уже в run, сохранить конкретные путь/UID/операцию/ошибку, приостановить стадию и восстановить штатный путь; ручная сдача не закрывает это условие.

Признак ворот до первого `finish`: **«receive → READY у каждого»** — у vintik и sova собственный private-подкаталог 0700 **без SGID**, в протоколе каждого есть реальный вызов receive и его READY. QUEUED_BUSY/один успешный импорт/READY только у одного не закрывают предпроверку. В Pdry оба receive→READY должны состояться до первого fixture-finish. До первого finish измеряемого run нужны оба свидетельства из предварительного Pdry; в самом run каждый свой finish также допускается только после собственного receive→READY. Предварительные задания используют частный RUN/сокет и не подменяют задания измеряемого проекта.

Корень P и `.autopilot` остаются без group-w **в st_mode с учётом ACL mask**; не давать named write ACL там. Запись vintik только в `P/work`; служебные контрольные пути readonly. Master работает cwd=P. Для executor тоже cwd=P (Ledger.validate), zone=`[work/wc_words.py,work/test_wc_words.py]`, pytest из P/work. Нельзя заменить cwd на P/work для обхода прав.

До GO предоставить VINTIK_PY и SOVA_PY из принятых participant venv с pytest. Каждый своим UID проверяет sys.executable, sys.prefix!=sys.base_prefix, pytest version/path. Отсутствие pytest — STOP до задания; pip/apt внутри П не выполнять. Принятые пути идут в brief.

Core helper Master — `$L/pilot/pilot_mail.py`; каждый вызов submit/result/checked/cancel/public с:

```bash
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B "$L/pilot/pilot_mail.py" \
  --state "$MASTER_STATE" --project "$P" --run "$RUN" --memory AGENTS.md result "$RESULT_ID"
```

Это пример result; ID берётся из настоящего сообщения. У получателей receive/claim/finish — установленный postal helper, с **процессным** Git-окружением при каждом вызове (не менять global config/safe.directory):

```bash
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$P" \
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B /opt/autopilot/post/0.1.10/pilot/pilot_mail.py \
  --state "$RECEIVER_STATE" --project "$P" --run "$RUN" --memory AGENTS.md receive "$MAIL_ID"
```

Этот же prefix применяется к claim/finish, включая pending completion; helper/идентичность Unix не подменять core-префиксом. До первого задания выполнить import и разрешённые проверки доступа на Pdry своими UID; «public/status» не считать гарантированно read-only. Git cwd/pass-through проверять без потери process env.

## P5. Pdry до живого задания

Обязательный протокол на **копии проекта 0.1.12** от master/vintik/sova — условие принятой дельты П. До живого GO предъявить протокол и суммы на новой голове выпуска. Если протокола нет, окно до P6 не продолжается. Бета этим листом его не объявляет выполненным.

Root готовит новый синтетический Git-проект Pdry внутри отдельного T; realpath остаётся внутри T, без ссылок наружу. Не копировать живые ledger/секреты/R/G/raw. Настоящие рабочие команды выполняют master/vintik/sova, не root. В пробных листовых программах все P/S/B, stage, backup, профили, states и counters перепривязать к T с картой замен и SHA; одной переменной Pdry недостаточно, боевой root-common.sh не source.

### P5.1. Штатный сервер на частных socket/state

Форма прямо назначена Забавой20:21:04Z по воротам Вениамина23:20МСК. Сервер — **точно установленный** `/opt/autopilot/post/0.1.10/pilot/mail_service.py`, SHA256 `735befb36b553ebb1a809025df08908c43ee20c15fa13bc2be3e776ab8674f07`. Изменение суммы — STOP/повторное согласование, не подстановка candidate mail_service. Leaf `window/pdry-server.py` импортирует этот файл, заменяет **только** `m.SOCKET_PATH` и `m.STATE_PATH`, вызывает `m.main()`. Своей обёртки вокруг Postman, подмен UID/NSS, TLS и класса сервера нет. Main сам проверяет autopilot-post, production_accounts, группы и TLS. В измеренном NSS: autopilot-post974/961, supplementary autopilot-mail960; master1006, vintik1007, sova1011; перед новым запуском разрешить имена через фактический NSS и сохранить UID/GID.

Живые `/etc/autopilot-mail/server.pem` и `/var/lib/autopilot-mail/server.key` остаются на месте, не копируются и не печатаются. Сервер читает их штатно; клиенты используют тот же `/etc/autopilot-mail/server.pem`, отличается только `--socket "$T/run/post.sock"`. Namespace-отображения socket/state/TLS не нужны. Единственный bind — обязательный recorder вместо agent-alert внутри **того же unit**. `PrivateTmp=no`: иначе systemd скроет T под /var/tmp и получит226/NAMESPACE до main.

До запуска назначенная root-рука проверяет суммы stage/leaf/recorder по П7, отсутствие T и unit, затем:

```bash
S=/root/AP012-P-20261019-r2
T=/var/tmp/AP012-PDRY-RUN-20261019
Pdry=$T/project
PDRY_UNIT=stend-ap012-pdry-20261019
# Имена выше сверены с window/pdry-parameters.json; файл — данные, не shell-source.
test ! -e "$T" && test ! -L "$T" || exit 2
# Отсутствующий unit проверить через systemctl show LoadState; active/failed/существующий — STOP.
test "$(systemctl show "$PDRY_UNIT.service" -p LoadState --value)" = not-found || exit 2
mkdir -m0755 "$T"
install -d -o autopilot-post -g autopilot-mail -m0750 "$T/run"
install -d -o autopilot-post -g autopilot-post -m0700 "$T/state" "$T/alerts"
install -d -o root -g root -m0700 "$T/observations"
install -o root -g root -m0755 "$S/package/window/pdry-server.py" "$T/pdry-server.py"
install -o root -g root -m0755 "$S/package/window/record-alert.py" "$T/record-alert.py"
# Отдельно cmp/SHA обоих источников и копий. copy-disabled.json ОБЯЗАН отсутствовать.
test ! -e "$T/copy-disabled.json" || exit 2
```

T root-owned0755, не SGID; run — service:autopilot-mail0750, state/alerts — service0700, socket создаётся0660. Отдельный синтетический Pdry создаёт root и отдаёт master; служебные parents/участники по P4, каждый receiver0700 без SGID. Root делает читаемую копию принятого S/package в T/package **до** передачи participant paths; это источник dry helper, не установка L. Git/control copy должны читаться получателями даже при UMask0077 (.git dirs0755/files0644, AGENTS0644); приватные ledger не попадают в Git.

До старта и после полного stop снять root-снимок: inode `/run/autopilot-mail/post.sock`, суммарный SHA по поимённому дереву `/var/lib/autopilot-mail` (regular files, mode/UID/GID/inode+SHA, symlinks отдельно без следования), поимённый снимок `/var/spool/dsh-trevogi` (включая tmp/vhod/itog). Хешировать локально без копий/показа ключей или текстов тревог. Файлы снимков0600 в T/observations. Нечитаемый/изменившийся снимок — STOP/разбор; живую службу ради равенства не останавливать и чужие записи не удалять. **Ожидание до запуска:** inode/state одинаковы, новых записей живого spool0; одна стартовая тревога в частном recorder. Число0 относится к поимённому сравнению снимков всего spool, а не к пустому grep.

```bash
systemd-run --quiet --collect --unit="$PDRY_UNIT" \
  -p Type=notify -p NotifyAccess=main \
  -p User=autopilot-post -p Group=autopilot-post -p SupplementaryGroups=autopilot-mail \
  -p RuntimeMaxSec=120 -p TimeoutStartSec=20 -p TimeoutStopSec=8 \
  -p KillSignal=SIGINT -p Restart=no -p UMask=0077 \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes \
  -p PrivateTmp=no -p PrivateNetwork=yes -p RestrictAddressFamilies=AF_UNIX \
  -p "ReadWritePaths=$T/run $T/state $T/alerts" \
  -p "BindReadOnlyPaths=$T/record-alert.py:/usr/local/bin/agent-alert" \
  --setenv=PYTHONNOUSERSITE=1 --setenv=PYTHONDONTWRITEBYTECODE=1 \
  --setenv="PDRY_ALERT_RECORD=$T/alerts/record.jsonl" \
  -- /usr/bin/python3 -s -B "$T/pdry-server.py" --socket "$T/run/post.sock" --state "$T/state"
```

Leaf передаёт штатный `--copies T/copy-disabled.json` — отсутствующий частный config. Это намеренно вызывает copy_error и встроенную тревогу main: «показ не настроен». Живая copy.json не меняется, worker не запускается. До **первого submit** root читает фактические User/Groups/MainPID/InvocationID/BindReadOnlyPaths unit, журнал `autopilot_mail_loaded` с installed source_module, частный socket и recorder: ровно одна JSON-строка с service UID и «показ не настроен». Нет строки/другой UID/тревога в живом spool — STOP. Запись готовности systemd не заменяет этого контроля. Recorder получает только stdin/--plain, append0600, nofollow; текст этой частной тревоги не содержит секретов. Probe самого recorder: на копии заглушить запись → старт main есть, записи нет → STOP, восстановить точные bytes → снова здоровый цикл. Не подменять recorder настоящим agent-alert для порчи.

### P5.2. Получение и finish, stop и страховка частного state

Настоящие master/vintik/sova вызывают candidate helper `T/package/lib/pilot_mail.py` на Pdry с process-env из P4/P6, `PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 python3 -s -B`, и **только частным** `--socket T/run/post.sock`. После монтажа AP живой helper вызывается по L/pilot/pilot_mail.py, не по dry shelf. До первого finish оба получателя обязаны иметь receive→READY и owner/mode receiver parent0700 без SGID. Проба — частный TLS/submit/receive/ACK/finish/result, без моделей, AP init/collector и без утверждения REGISTERED.

Результат каждого — отдельный JSON0600 с ровно status/summary/context_ref; context_ref непустой. До исполнения сохранить SHA, удалить **только context_ref**, grep -cF1→0 и разные SHA; штатный finish обязан отказать, receiver state не меняется. Вернуть точные bytes/SHA/grep1; снова finish→RESULT_READY, deliverySTORED/completionCOMPLETED и Master RESULT_SAVED. Два READY перед первым finish, фактические пути/UID/state SHA сохраняются в `T/observations/transport-01.json`. Ошибку/неопределённую доставку не лечить новым nonce или ручной сдачей; автоматических повторов0.

В finally назначенная root-рука останавливает **только** `$PDRY_UNIT.service` через systemctl stop (KillSignal=SIGINT вызывает main finally→Postman.stop), сохраняет journal и исход stop. Частный socket обязан исчезнуть; активный unit/forced kill/ошибка cleanup — STOP, без PASS. Ограничения: unit120с, start20с, stop8с, каждая client-команда20с, ожидание recorder5с, повторов0. Живой autopilot-mail.service не останавливается.

После успешного stop снять повторные живые снимки и сравнить. Затем T/state застраховать `tar -cpf "$T/private-state.tar" -C "$T" state` (umask0077), сверить поимённо regular file bytes/mode/owner с архивом без извлечения поверх оригинала; ни ссылок, ни внешних путей. Только после равенства удалить **ровно T/state** и проверить отсутствие. Сохранить SHA архива, именованный путь и протокол удаления; архив0600 содержит private test state и не публикуется. Сокет уже снял main; не трогать живые state/socket/key. При отказе stop/страховки ничего не удалять. Протокол с живыми агрегатами/recorder/UID/порчей-возвратом и непокрытым читает назначенная приёмка Pdry. Этот postal протокол не заменяет весь функциональный Pdry или живой P7.

Проверить семь переносов: helper import с postal PYTHONPATH; inbox0700 без setgid; Git safe.directory process-env; права control root против рабочей зоны и реальный run_window; pytest выбранных venv; снятие старого drop-in/новый physical exporter в частном unit-tree; конечное observation window. Для каждого: здоровое→ровно названная порча на копии→точный возврат, grep -cF плюс SHA, UID и ожидаемый reason; guard/production не ослаблять. Контроль корня P/.autopilot с write ACL должен получить RUN_STATE_UNAVAILABLE, потом восстановиться. Передать отдельным файлом протокол Pdry с именами всех сценариев и непокрытых случаев.

Дополнительные названные координатором находки: **(8)** P9 проверяет receiver state по таблице P4, **(9)** проверка служебных прав/штатного finish до init/run. Для (8) на копии положить пустые decoy jobs.json по старым `.pilot/vintik`/`.pilot/sova`, оставить реальный receiver-state с RUNNING: новый quiet должен назвать активное задание. Удаление только реального state даёт именованный STOP, не переход к decoy; вернуть точные bytes → исходный контроль. Для (9) использовать настоящие UID и helper на частной почте, без ручной доставки результата; показать owner/mode/ACL до-порча-возврат и вновь успешный штатный цикл. Это план двух дополнительных Pdry-проб, не заявление об уже выполненном живом П.

## P6. Одно функциональное задание и независимая приёмка

Сохранить условие единственной командной сессии Master из r3.4: из a2a только self-mail через штатный autopilot-mail, без init/Git/submit. Первый bootstrap-only ход читает оригинал в AP_ROUTE=autopilot-team и завершается. Root проверяет durable session generation и парный native call/output read именно этого mail; лишь после содержательного GO координатора init и все submit/result выполняются в той же AP tuple `(sessionId,sessionCreated)`. `/new`, ротация и переход в другую сессию запрещены в пределах П. Bootstrap до init не начисляется проекту. Сохранить bootstrap-proof и сравнить tuple с наблюдаемым RUN; строковый префикс имени сессии сам по себе не доказательство.

До нового init root проверяет готовность профиля, policy, источников и регистрации; master выполняет init из принятого физического L. Сам init создаёт AP pin и посылает заявку регистрации через submit_from_init; ждать REGISTERED **до init нельзя**. Затем root-collector обрабатывает заявку, и отдельное чтение root status подтверждает REGISTERED/тот же RUN; pending/retry не выдавать за регистрацию. SourceCreatedAt предшествует регистрируемому ходу, origin/record должны быть независимыми, не подставленными. Сохранить RUN, sessionId/createdAt, identity источников и physical release; до functional submit получить предусмотренный bootstrap и его регистрационное доказательство.

Функциональный brief прежний: Python wc_words.py, UTF-8, до десяти слов, регистр не важен, кириллица/латиница, пунктуация удаляется, `слово<TAB>число`, при равенстве алфавит; не менее пяти тестов: пустой, строка, кириллица, ничья, пунктуация. Файлы только `work/…`. Один submit Винтику, без создания нового nonce при неизвестной доставке. PLACED/READY/finish/result/checked и native terminal — разные факты. До каждого result в той же команде вывести RESULT_ID; сохранить original и completion.

Master интегрирует конкретный commit C с принятой zone/trailers. Архив Совы exact-C: `A=P/.acceptance/wc-C`, код в `A/work`, cwd acceptance=`A/work`, outputs=`A/work/.outputs` private0700. Сравнить blob `work/wc_words.py`, `work/test_wc_words.py` до/после ACL. Сова читает код, пишет только outputs, запускает SOVA_PY с PYTHONDONTWRITEBYTECODE=1, TMPDIR=outputs, `-s -B -m pytest -q -p no:cacheprovider test_wc_words.py`, ноль collected не успех. Функциональный ПРИНЯТО/ВОЗВРАТ Совы отделён от полноты токенов.

Каждый task JSON сохраняется до своего первого submit. Поля задания Винтика: job_id=`wc-vintik-impl`, ticket=`01`, recipient=`vintik`, role=`executor`, cwd=P, zone=`[work/wc_words.py,work/test_wc_words.py]`, requirements=`[R01,R02,R03,R04,R05]`, brief=исходный функциональный brief, deadline=`now+1800`, context_request=`fresh`, parent_job_id=null, context_ref=null. Deadline фиксируется в сохранённом JSON, не пересоздаётся при неопределённой доставке. После finish/result Master делает integration C, с ровно одним trailer `Autopilot-Run: RUN` и `Requirements: R01,R02,R03,R04,R05`, затем `checked wc-vintik-impl C`; это не автоматический G4.

Сове идёт **новое authenticated acceptance-задание**: job_id=`wc-sova-accept`, ticket=`01`, recipient=`sova`, role=`acceptance`, cwd=`A/work`, zone=`[wc_words.py,test_wc_words.py,.outputs]`, те же requirements, deadline=`now+1800`, context_request=`fresh`, parent_job_id=null, context_ref=null; brief содержит исходные требования/C/blob SHA, без вердикта автора. Не ставить parent_job_id Винтика: другой recipient даёт INVALID_PARENT. Сова возвращает finish status=`DONE` или `DONE_WITH_CONCERNS`, summary начинается с «ПРИНЯТО» или «ВОЗВРАТ». Оба получателя до finish сохраняют отдельный stdin JSON с **ровно** `status`, `summary`, `context_ref` (договор README-PILOT «Получатель» и pilot_mail.main/Receiver.finish). Result context_ref — непустой полный ID `[A-Za-z0-9][A-Za-z0-9._-]{0,79}`, не null из task JSON; фиксируется получателем и сохраняется при pending retry. Status — фактический DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT. Файл результата0600/SHA сохраняется, CLI finish читает его из stdin. Два ключа, null/невалидный context_ref — отказ, не ручная сдача. Master получает result в той же AP-сессии и сохраняет этот verdict отдельно от postal completion.

## P7. Квитанция schema3 и глазами «неполно» с числами

Все проверки импортов/прав/pytest/pins/unit/профилей выполнить заранее. Первая попытка чтения P7 открывает окно и расходует попытку до snapshot, даже если дальше ошибка. На одно разрешённое окно максимум 6 попыток/600 с, старт последней не позже 450 с, резерв 150 с; общий активный бюджет прежнего П 40 минут. Автоматических повторов 0. Негодные часы/counters — STOP. После исчерпания сохранить start/count/snapshot/причину; новое именованное окно только по слову аудитора, старые counters не стирать. Новое окно не повторяет submit/init и не даёт новый слот.

Обязательный вход новой leaf-программы P7 — root-owned observation-контейнер с observation ID, ссылкой на разрешение аудитора, RUN/P, неизменяемой ссылкой на предыдущие окна и накопленным activeSeconds. Counters/start/snapshots хранятся внутри него, а не в общем B/observe.*; существующий start не перезаписывается из-за count=0. Before-first-snapshot leaf атомарно учитывает попытку и проверяет count/450/600/общие2400с. Старый `window/receipt/P7-receipt.sh` такой интерфейс не реализует: **его нельзя запускать как P7 этого окна**. Приёмка назначенной leaf-программы обязана включать первая ошибочная snapshot→count1, шестая/седьмая попытка, 450/451с, 600с end, 2400с cumulative, новые окна без разрешения/с разрешением, испорченные/отрицательные часы и неизменность предыдущего контейнера. До такого протокола и суммы leaf в паспорте P7 не открывать.

Root сохраняет canonical generation/receipt и private prepared R/G/native на один cut, проверяет происхождение, RUN/P/job binding, schemaVersion **3**, sums/шесть метрик и subset. Использует новый штатный `team_usage.public_receipt`, не старый schema2 validate-public/judge-receipt из r3.4. Не доказывать независимость арифметикой того же collector: сравнить с сохранённым native/provider ID oracle и фактическими G anchors. Отсутствие измерения не ноль; CHILD_INCOMPLETE сохраняет parent+доказанных depth1 детей; null только без вклада.

После установленной версии исполнить задание P6 и отдельно проверить отображение partial. В копии его подготовленного среза убрать только observer end одного участника с положительными доказанными числами, сохранить process_closed/parent/native; сделать штатный owner→consumer/public→**новый настоящий renderer** в отдельной публикации копии. Глазами открыть эту копию панели и записать URL/время/скрин или точный HTML: видны «неполно у X: CHILD_INCOMPLETE», ненулевые доказанные числа, subset и полное/частичное coverage. Это копия после живого задания, её не выдавать за порчу боевого G или настоящий live gap. Если живой RUN уже partial, дополнительно зафиксировать настоящую строку; не требовать искусственно испортить подписку.

Копия среза и renderer должны относиться к **фактически установленному** physical L и выполненному RUN/P; сохранить SHA renderer, canonical/public receipt и итогового HTML, а не использовать HTML из прежнего кандидата. Порча+возврат bytes/SHA/counters обязательны; восстановленный healthy срез снова observed. Отдельная schema4-проба P1 не должна показывать числа. При отсутствии browser/renderer evidence визуальная приёмка не состоялась, rc Python её не заменяет. Назвать, кто прочёл панель и какие участники/числа покрыты.

## P8. Завершение и возврат окна

Master штатно завершает или отменяет RUN по фактическому состоянию; не писать CLOSED вручную в индекс. Root проверяет терминальную очередь/индекс, снимает установочные паузы только после принятой конфигурации и проверяет actual process/unit. Затем выполнить P9 ниже до возврата временных ACL. На отказе — остановить текущую стадию, сохранить факт и применить принятый возврат; не повторять задание автоматически.

### P9. Тишина по фактическим state, затем возврат временных прав

Старый `/root/AP0111-P/project-info.py quiet` не использовать как судью этого окна: он читает `.pilot/{vintik,sova}/jobs.json`, а штатный receiver работал в `.pilot-receivers/<имя>/state.json`. При подготовке нового root-stage назначенная рука передаёт quiet-reader **ту же таблицу P4** и записывает три фактически открытых пути/UID/inode/SHA в протокол. Связь каждого state с RUN/P/schema/memory, regular file без ссылок, owner и private mode проверяются до jobs; ошибки JSON/чтения/отсутствие файла дают именованный STOP с участником и путём. Прочитать другой существующий пустой ledger вместо отсутствующего state нельзя.

Для каждого назначенного authenticated task из Master ledger нужен след у соответствующего receiver. Вывести job ID/status из фактических трёх state, сопоставить ожидаемые IDs и delivery/result originals. QUEUED_BUSY/PLACED/DELIVERY_UNKNOWN/RUNNING/STATUS_REQUIRED не являются тишиной; неизвестный статус — STOP. RESULT_READY означает подготовку результата, но не доказывает postal STORED/COMPLETED или сохранение результата Master. Явная отмена требует своего удостоверенного следа, не только ручного cancelled=true. Не объявлять тишину при пустом/отсутствующем ledger участника, которому задание было отправлено; случай vintik без state.json остаётся недоказанным до разбора. Шлюзы/native children и очередь проверяются отдельным bounded idle-reader: конечные postal state их не заменяют.

Только после положительных quiet/idle проверок вернуть временные ACL (включая work и реальные `.pilot-receivers/<имя>` пути) из поимённых страховок, не права установленного релиза. cmp/getfacl/mode и Git-учёт сверить отдельно. Master/vintik/sova своими UID повторно проверяют предусмотренный доступ к **своим фактическим** state parent, не к старому `.pilot/<имя>`.

Передача координатору/Вениамину: head и поимённые package/hash/mode; before→after+страховка; AP48 с полным логом; протокол Pdry; отдельный файл и протоколы Гаммы по совместимости/настоящей канарейке; RUN/P/commit и функциональная приёмка; schema3 canonical receipt, native oracle, visual partial; OPEN/queue до-после; действующие версии и что не покрыто. Автор выпуска не принимает собственный монтаж.
