# Окно монтажа B-N-2025

Зовущие: producer smontirovat-fajly/smontirovat-vypusk открывают окно, автоматические VOW/registry-watchdog/живая-версия/две-копии/nashi читают его, montazh-okno-watch.timer сообщает просрочку; его смерть проверяет sadik-watch по перечню storozha-sutochnye.txt (порог 180s, при следующем 10-минутном такте sadik-watch). Окно не продлевается от жизни сторожа.

Постоянный каталог /var/lib/montazh-okna root:root 0755, JSON root:root 0644. Один parser — montazh-okno; lstat и проверенный FD, без ссылок, uid 0, mode&022=0 у файла и каталога, schema 1, boot_id, CLOCK_BOOTTIME. TTL от открытия: 1..1800 секунд, при join не меняется. В пределах scope может быть отложена и НАСТОЯЩАЯ ошибка монтажа до 30 минут. Это не полномочия/качество плана: root может передать неверный план. Команды из JSON не исполняются.

## Явные режимы

Все читатели по умолчанию строги. Только --avto-montazh разрешает код 4; у nashi это --check --avto-montazh. Код4 — отдельное «отложено», никогда «сошлось»/ЗЕЛЕНО/СЛЕПОТА. Ошибки 1/2 вне плана и safety errors важнее4. Unit ExecStart передаёт ключ, SuccessExitStatus=4 не добавлен; sadik-watch отличает текущую invocation с кодом 4 через общий helper, срок/права повторно проверяются. Смерть самого сторож просрочки не отсрочивается.

montazh-okno otlozheno --avto-montazh <subject> →4+ID/срок при живом окне,0 если отсрочки нет; без ключа0 без разрешения. Внутренний код 6 означает новое строгое подтверждение закрытого окна, не отсрочку. Зовущий максимум один раз переснимает изменившийся результат; повторная смена → именованная слепота2. Перед возвратом4/каналом срок и поколение проверяются вновь.

## План и producer

JSON плана содержит ровно subjects/checks. Subjects: file:/absolute/path, entry:registry-id, unit:service:package, tag:/absolute/repo:ref. Проверки имеют фиксированные типы: file(path,sha256,uid/gid/mode по необходимости), registry(path,id,expected поля), tag(repo,ref,pinned40hexcommit), unit(unit,package,version). Каждый subject обязан иметь строгую проверку. Пути/ID точные, не wildcard.

Один вызов producer автоматически создаёт file-план по подготовленному составу. Такой план НЕ откладывает сверку учёта/метки. Для окна реального выпуска оператор заранее объявляет ПОЛНЫЙ план: VOW «невыпущенное» требует file:копия/package.json и метку целевого выпуска; derevo — entry:id и все изменённые файлы; nashi — file:manifest и каждый изменённый обычный файл. Safety/ссылки/пропажа/агрегатP/неизвестный вход строги. Root-pлан обязан быть принят по своему основанию и страховке, не составляться из текущей порчи.

Открыть общий план: montazh-okno otkryt --plan plan.json --task B-N-XXXX --actor 'рука'. Передать одному producer --okno-plan plan.json для открытия им, либо --okno-id ID для join. Join не продлевает срок и требует совпадения целевых hash/mode/uid/gid prepared файлов со списком. Единственное расширение (B-N-2034): file-проверки целей, принадлежащих записи derevo, чья registry check уже в окне и равна проверке вызова (owned_files — все файлы записи); иное — «producer is outside immutable plan». Producer открывает/присоединяет после предполёта и замка, ДО первой замены; не удалось опубликовать→отказ до замены. Прогон/нет изменений не создают окно. Успех оставляет open; ошибка приводит failed. Снятие файлов через отдельный режим --snyat этим новым переходом не покрыто.

## Строгое завершение

montazh-okno zakryt ID сверяет все объявленные checks по настоящим данным, затем поколения file/registry/ref/PID/старт и последний локальный stat-барьер ПОСЛЕ внешних rechecks. При изменении окно остаётся открытым. Правка реестра/успех producer не закрывают окно автоматически.

После отказа: восстановить предметы из своей страховки; montazh-okno otkat-proveren --plan original-state.json ID. План возврата должен покрывать РОВНО все исходные subjects; проверки — по принятому прежнему состоянию, не по произвольно текущему. Для нового файла прежнее отсутствие: {"kind":"absent","path":"/absolute/path"}; ссылка тоже не считается отсутствием. Неполный план→2, несовпадение→1; только строгая сверка+поколения ставят rolled_back и разрешают новый ID. Root способен солгать в плане: это объявленная граница полномочий/качества. Запись хранит checks принятого возврата. Код не запускает откат сам.

## Просрочка и границы

watch(timer60s/onboot30s) — одна попытка agent-alert --plain с пределом95s, юнит120s; ACK только полностью включённых строк, после успеха повтор не чаще86400s. Послеfailed/expiry/reboot сами readers прекращают4 независимо отwatch. Сломанная/небезопасная запись не разрешает отсрочку. Незакрытые/failed не удаляются и блокируют новое окно того же состава до строгого завершения. Терминальные записи сохраняются не менее 24 ч по mtime для пересечения со старым прогоном; затем watch удаляет только closed/rolled_back под metadata-lock со сверкой записи и fsync каталога. Failed/незакрытые не удаляются.

Не ловит произвольный ручной/внешний обход, намеренного root, качество заявленного плана, физический crash после последнего stat до атомарной записи closed. Не покрыта первая очередь ostrov-kopiya-watch (её отдельный producer вне наряда), неизвестные API/service-health, несведение агрегата P nashi. Не обещает окно для повреждённых/нечитаемых предметов и safety нарушений.

Уведомление называет задачу/ID, заявленную руку и первые два предмета (до 240 символов каждый), затем число остальных. Длинные поля обрезаются только в сообщении; полный план остаётся в JSON. Каждая строка влезает в общий предел 2800 единиц UTF-16; ACK ставится только окнам, чьи строки целиком вошли в подтверждённое сообщение.

Замок метаданных хранится рядом с постоянными записями (`/var/lib/montazh-okna/.lock`), вместо предложенного временного `/run` в замысле. Поэтому исчезновение `/run` не теряет запись или замок; срок всё равно задаётся boot_id/CLOCK_BOOTTIME. Проверено на частном mount namespace с пустым `/run`.

## SMV release data — B-N-2043 Ш1

`podgotovit --release descriptor.json --registry registry.yaml --rows rows` принимает ровно repo,commit,subdir,manifest; repo canonical absolute, commit40hex, subdir packages/<каталог>, manifest — file row package.json с SHA исходного blob. Подмены semantic данных, missing row, другой effectiveVOWrepo или неоднозначные aliases отвергаются. Автоматический tag check сохраняет короткий ref, commit, vow_consistency:true и release_aliases; Git lookup всегда refs/tags. Дополнительный kind tag_absent с тем же subject проверяет отсутствие tag для проверенного rollback; ошибки Git не читаются как отсутствие. Повторный барьер не допускает появления tag после проверки. Чистого copy consumer/normal-copy deferral здесь нет — это Ш2.

## Ш2: copy и поколение связанного запроса

Действующий договор Ш2 дополняет историческое описание Ш1 выше. Copy-планы создаются только `podgotovit --release descriptor --registry registry --rows rows [--copies selector]`; descriptor сохраняет прежние четыре поля. Ручной `otkryt` для copy отказывает: protected baseline обязан снять helper. Selector — ровно package/version/copies, от 1 до 64 неповторных ID; publication — до 16384 файлов на копию, вся запись — до 2 МиБ. Чужая семья/ID/root, ссылки опубликованных целей, неизвестный формат и неполный состав отказывают до замены. Проверяется npm pack pinned C при подготовке, без package scripts; закрытие повторяет strict consumer и сохранённые file checks, не npm.

`copy:R:P:B` содержит config/policy/registry binding, полный publication и прежний baseline. Он связан с main registry entry, всеми publication file subjects и одним tag/C в той же записи. `otlozheno --require subject ...` не складывает records; reader передаёт `--copy-policy`, `--copy-registry`, `--copy-config-sha256`. `--with-generation` добавляет строку `ПОКОЛЕНИЕ SHA256`; финальный запрос повторяет все параметры и `--record-sha256`. Изменение записи/TTL после измерения вызывает не более одного полного пересъёма VOW, повторная смена —2. Code6 остаётся строгой адресной проверкой closed окна.

SMV держит общий монтажный замок во время страховки, фиксации всех копий, публикации и замен. Первое окно публикуется до mkdir/.new. Common copy join только подтверждает свою уже закреплённую часть и не меняет JSON. B-N-2060: file join записи derevo разрешён и в copy-окно. При равенстве всех прочих полей registry-проверки файловый вызов дочитывает только недостающие path/source.type/source.address, уже закреплённые release_copy, из текущего реестра и проходит прежнее ПОЛНОЕ равенство. Подмножество expected само по себе недостаточно; исходная registry-проверка остаётся единственной и не ослабляется. Добавляемый файл обязан входить в owned_files той же записи; срок/исходные copy/tag/проверки не меняются. Прежний generic file join без copy сохранён. Защищённый rollback_plan copy-окна одновременно дополняется снимком внешнего файла до первой замены (для нового файла — absent), не переснимая исходные baseline или реестр. Это не разрешает чужой файл, расширение copy/tag либо обход проверки происхождения; root с неверным планом по-прежнему вне модели защиты. При откате copy защищённый `rollback_plan` проверяет весь исходный subject-set; `otkat-proveren ID` берёт его автоматически. Поданный план обязан совпасть по данным с protected plan; укороченный snapshot не принимается. Generic окно без copy по-прежнему требует явный `--plan`.

Runtime reader: VOW; strict check/linked lookup/rollback и parser: helper; publication/замена: SMV. Consumer устанавливается отдельным файлом владельца VOW, `/usr/local/libexec/dsh-vypusk-watch/copy-compare.sh` 0755 root:root. Нужен полный согласованный состав и новый запуск reader; старый reader остаётся строгим для normal-copy. Ни отсутствие предмета, ни safety/blindness, ни чужая/информационная область этим окном не глушатся. Максимум отсрочки 1800 с, независимо от живости сторожа; excluded policy paths и физические изменения после последнего барьера остаются вне защиты.

Проверенный copy-откат доказывает точное прежнее физическое состояние и SHA256 полной прежней записи реестра, включая отсутствие добавленных полей. Старые installed_check/health callbacks при этом не исполняются. `rolled_back` не означает здоровье старой копии; yunit-читатель не превращает такой snapshot-откат в зелёную приёмку. Forward close и ordinary VOW продолжают строгую проверку действующего состояния. / Copy rollback proves the exact old physical snapshot and full registry-entry digest, without executing old installed_check/health callbacks. It does not establish health; unit readers cannot treat it as a healthy release. Forward close and ordinary VOW retain strict current checks.

## Сведение3.1.23: подмены и обратная совместимость

MO_COPY_PRIBOR и MO_COPY_CONFIG, если заданы, печатаются в stderr каждого вызова helper. При первом открытии copy-плана словарь substitutions запечатывает их значения в записи окна; join не меняет эту запись. Generic окна безcopy новый trace-field не получают. Этот след объявляет источник прибора/конфигурации, не удостоверяет их качество.

Откат к helperдоШ2 разрешён только когда во всём /var/lib/montazh-okna осталось0записей сcopy-check или rollback_plan, включаяclosed/rolled_back. Фазовое закрытие недостаточно: старыйparser не понимает сохранённую схему. Иначе — только совместимый код вперёд. Точный независимый счётчик и страховки — в П7-дельте сведения, исполнять перед откатом.
