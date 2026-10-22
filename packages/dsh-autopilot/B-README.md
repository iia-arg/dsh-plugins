# Часть Б — оператор, physical pin и public state

Часть плагина применения «Автопилота» Никиты Велеса на DSH-серверах DeepSeek Harness; исходник — [nick-vels/skills](https://github.com/nick-vels/skills). [Авторство, pin и правило разбора upstream](README.md#upstream-и-обновления).

Срез sadik17.10.2026: AP0.1.7, upstream9fc898cbe941d5b8a369f1dd657e9119676eb44f, local a15-b7-c2. Прежний main46060c3/b4 — историческая основа, не установленная версия. Runtime/панель/почта — разные компоненты; общий статус RU+EN в README.md/README.en.md.

## События и оператор

Из физического корня проекта одна команда сохраняет событие и пытается опубликовать панель:

```bash
REL=$(realpath /opt/autopilot/current)
python3 -B "$REL/skill/tools/ap.py" --no-serve init --slug example --skill-dir "$REL/skill"
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve ask action --note 'нужно решение'
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve answered
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve resume
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve commits
python3 -B "$PINNED_SKILL/tools/ap.py" --no-serve finish --result 'проверенный итог'
```

`PINNED_SKILL` для существующего run — `_sadik.release.skill_dir` из private state, не произвольный текущий путь. Эти примеры выполняет Master в разрешённом проекте; они не инструкция создать run в любом каталоге. Все события требуют `--no-serve`. Неизвестные флаги, включая `--dry-run`, `-n`, `--check`, отказывают кодом2. Finish не запускает stop-server child. В установленном entrypoint update-check принудительно выключен, явный `--check-update` отвергается. Это политика guard, не самостоятельное свойство upstream no-serve.

AP runtime допускает только Unix master; root используется установщиком. Проверки автора выполняются на собственных временных фикстурах с пустым HOME, без участия живого агента Мастера и без его private runtime/cache. Эти пробы не разрешают выполнять кандидата в его сессии.

Оператор — ближайший живой ancestor codex/claude либо реальный долгоживущий ancestor того жеUID из `AUTOPILOT_OPERATOR_PID`. Одноразовый AP-процесс владельцем не назначается. В `.autopilot/operator.json` хранятся boot/pid/start/uid, отдельный постоянный `operator.lock` держит nonblocking flock события. Второй живой оператор получает отказ до записи. Возраст не освобождает проект. Если сведения недоступны или owner отсутствует при существующем ledger, отказ: смерть прежнего оператора не доказана. Не удалять замок вручную.

Полной изоляции при общем UID нет. У нынешней команды отдельные Unix-учётки; их допустимые пути определяет свод/наряд. Receiver state находится в согласованном проекте, но это не доступ к private AP state Мастера.

## MAIN и закреплённая версия

`commits` сохранён из MAIN: для done-ticket проверяет наличие записанного commit в истории HEAD. Отсутствующий commit печатает `!`, но не сбрасывает ticket и не меняет историю. Код0 этой команды сам по себе не означает отсутствия замечаний. Автоматика G3 читает `state.gates`, а не только rc check-plan.

Сохранены MAIN-правила PROGRESS/carried между прогонами, Gittrailers, укрупнения заданий и «одно событие — одно сообщение». Слой Б меняет entrypoint/локальную серверную часть и защищает operator/pin; процессные новшества main не вырезаются. Дельта к источнику — `patches/part-b-upstream.patch`.

Авторитетный pin лежит в `state.js['_sadik']`, атомарно с ledger: schema1, physicalroot, project/runUUID, agent/publicroot, physicalskillpath, SHA дерева/режимов, state_schema2, parentrelease.json SHA, upstream/localrevision/skillversion. `.autopilot/sadik.json` — зеркало. `state.version=2` не является schema release.json. Parent manifest обязателен; выдуманного SHA или fallback на установленную версию нет.

Current выбирает новый init. Resume и обычные события проверяют старый физический release и выполняют его AP, не копируя новый current в проект. При отказавшем init старый active ledger остаётся до атомарной записи преемника; архивирование делает копию. Закреплённые релизы нельзя менять на месте или удалять по возрасту. Unpinned старые проекты требуют отдельной миграции.

## Выгрузка и права

Путь: `/srv/autopilot/public/<agent>/<projectUUID>/<runUUID>/`. Label по умолчанию — Unixlogin master; `AUTOPILOT_AGENT` и `AUTOPILOT_PUBLIC_ROOT` закрепляются при init. Установщик заранее создаёт public-root2751 root:autopilot-view и operator-root2750 master:autopilot-view. Master не состоит в reader-группе.

Worker выставляет umask027. Mkdir0750 наследует SGID/GID; chmod каталогов не используется. Agent/project/stage проверяются на2750 и одинаковый GID родителя. O_PATH позволяет проход через root без directory-read. Неправильные существующие права дают предупреждение, а не автоматическую смену групп. Временные и итоговые файлы явно получают0640 **до rename**. Другим UID чтение закрыто, reader читает через группу.

Run содержит только dashboard.html и state.js. Пара публикуется directory rename либо Linux renameat2(EXCHANGE). Пути открываются через dirfd/no-follow, ссылки, устройства и hardlinks отвергаются. Стадии и временные файлы имеют dot-имена. Индекс агента index.html/index.json намеренно публичен, обновляется под directoryflock; ожидание до0.25с/26попыток. Operator/pin/receipt остаются в private `.autopilot`, публичных служебных lock-файлов нет.

После учёта события одна попытка export ограничена4.8с и отменой0.1с. При отказе выводятся «панель не обновлена», причина и последняя подтверждённая удачная; учёт остаётся сохранён и rc события0. Максимум публичного файла/индекса8MiB, private reads16MiB, pin tree64MiB/10000файлов. Нет общей crash/power-loss-транзакции ledger+index+pair; два HTTP-запроса могут попасть по разные стороны обновления. Kernel hard realtime не обещается.

## Публичный белый список и фильтр

Неизвестные поля и значения неправильного типа не копируются. Строки фильтруются, числа целые, флаги bool, массивы только указанного типа; null допустим. Частный state сохраняется полностью.

| Область | Разрешённые поля |
|---|---|
| Верхние строки | slug,title,mode,depth,tier,startedAt,updatedAt,finishedAt,result |
| Верхние числа | version,rev |
| Массивы строк | beats,report,concerns,additions |
| stages[] | строки id,status,note,startedAt,finishedAt |
| tickets[] | строки id,title,status,review,startedAt,finishedAt; числа wave,retries,repairs; строки[] blockedBy,repairFindings,concerns; tests |
| requirements | числа total,done,inTicket,inSpec,placeholder,deferred,dropped |
| reqList[] | строки id,text,status,why |
| tests и tickets[].tests | числа passed,failed |
| waiting | строки kind,since,note |
| waits[] | строки from,to |
| debt | строки[] emptyEnv,placeholders,assumptions |
| coverage | числа found,fixed,deferred |
| blind | числа checked,matched; строки[] mismatches |
| usage | schemaVersion, runId и типизированная byEngine.codex; Claude в0.1.7 в public не выходит |
| gates | только G1–G4; bool ok, строка at, числа total,open,found,fixed,deferred,problems,checked,matched |

Не выходят `_sadik`, skillDir, dir, briefFile, memoryFile, memoryOwner, baseCommit, log, ticket zone/file/commit, произвольные answer/commandOutput и остальные ключи. Одобренные краткие итоги допускаются в разрешённых текстовых полях; сырые письма/выводы отдельным каналом не публикуются.

Каждая разрешённая строка проверяется без учёта регистра на sk-/ghp_ токены, -----BEGIN, pass://, компоненты pass/ и .password-store/, присваивания DEEPSEEK*/ANTHROPIC* с непустым значением. При совпадении вся строка, включая многострочное тело, становится `[скрыто]`. Теряется и безопасный текст в той же строке. Это не классификатор всех секретов, кодировок или персональных данных.

Один очищенный объект идёт в state.js и HTML-снимок. HTML берётся из закреплённого шаблона; произвольные локальные добавления наружу не копируются. `<` кодируется в JSON, индекс использует очищенный title. Старая выгрузка сама не исправится без следующего успешного события/отдельной проверки архивов назначенной рукой.

Jobs JSON Беты — отдельная схема, не готовый AP state. Прямого маппинга/renderer для него здесь нет. Принятое условие G4 (Забава20:39:21Z): `blind` требует единственные целые `checked` и `matched`, `0 < matched <= checked`; неполный/неизвестный позиционный ввод отвергается кодом2 до записи. G4 положителен только при равных счётчиках и пустом `mismatches`. При сохранении и отдельно перед публичной проекцией неизвестный/неполный blind становится `null`, G4 удаляется; `reopen` также оставляет blind=null без G4. Поэтому шаблон не получает пустой truthy blind и не восстанавливает ложный успех своим fallback. Это проверка согласованности заявленных счётчиков, не доказательство реального объёма проверки, независимости проверяющего или свежести модели. Почтовый JSON не подключён к AP и сам не превращается в доказанную приёмку.

## Сборка, хранение и приёмка

`runtime/part_b_layout.py:overlay(lock,entries)` возвращает новый **полный** mapping. Объявленные replacements проверяются по before/result SHA и режимам, raw/lock не меняются. Guard А добавляется после AP overlay. Caller и установка — рука Альфы. Исторический блокер guard А6 для commits/resume больше не описывает бой: установленный guard эти команды допускает без дополнительных args/flags. Старую запись о заблокированной композиции не использовать как действующее ограничение. Точный договор: [OVERLAY-INTEGRATION.md](OVERLAY-INTEGRATION.md). Новый архив/ключи/NSS эта часть не устанавливает.

Retention: предложение30суток от finishedAt. Удаления нет. Отдельному будущему сборщику нужны полный реестр проектов, защита всех ссылок живых прогонов, отказ при неизвестном/недоступном проекте, общий lock-протокол с созданием ссылок, dry-run и карантин на том жеFS; предел30с/100кандидатов в сутки. Private state и pinned releases вне этой политики.

Исторические30 CLI/33 MAIN/UID-пробы части Б описаны в B-ACCEPTANCE.md; это не счёт текущей пакетной приёмки. Актуальный перечень модулей и бюджет берутся из test/stend-dsh-autopilot.sh принятого выпуска. В этом документальном такте функциональные тесты и живые вызовы не выполнялись.

В этой сверке проверены структура public state и фильтры установленного runtime; новый браузерный DOM-акт не выполнялся, его рука — Забава/общая приёмка. Optional browser_probe.py исполняет Python/AP, а не только читает DOM; browser routing не sandbox для Python. Без отдельного назначения и обзора исходника/комплекта не запускать, private runtime Мастера не использовать и Мастера не привлекать. Внешний TLS/auth, production-службы, почтовый пилот и новый installer не приняты авторскими runtime-пробами.


## Числовые корзины текущего выпуска

Master вызывает `usage ENGINE --snapshot FILE` на закреплённом AP. Claude-снимок допускается только с UID0, Codex — с UID0 или собственным UID Мастера. Guard проверяет файл/путь/схему/run, а не доказывает истинность произвольных чисел. Root Claude-reader отдельно связывает почту/квитанцию/DSH/SDK. Не подменять отказ измерения нулём, не складывать повторные снимки.

На живой пробе17.10 rootClaude `observed` дошёл до private state; Codex той же пробы `not_measured`. Оба фильтра показа0.1.7 оставляют только Codex; private Claude не означает видимую карточку. Детали доказательства и границ — README.md и FORMAT-CONTRACT.md. В source-lock этого дерева уже целевой a17-b9-c2-rollback-r2, но это будущая сборка, не current; не описывать новый каталог прогонов, abandon или rollback как установленные0.1.7.
