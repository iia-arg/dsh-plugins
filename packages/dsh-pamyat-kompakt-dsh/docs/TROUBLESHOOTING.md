# Частые поломки · Troubleshooting — dsh-pamyat-kompakt-dsh

Все случаи ниже — из реальной эксплуатации пакета. Формат: признак → причина → лечение.

All cases below come from real operation of the package. Format: symptom → cause → fix.

## Агент не поднимается: «preset failed to mount» · The agent does not start: "preset failed to mount"

**Признак.** Служба агента падает при подъёме; в журнале отказ импорта движка сжатия.

**Symptom.** The agent service fails at start-up; the journal shows an import failure of the compaction engine.

**Причина.** Пакет сжатия платформы ищется от исполняемого файла той установки платформы, которая загружает агента. Если на машине несколько установок платформы и в какой-то нет `@deepseek-ai/dsh-compaction-basic` — импорт отказывает. (Самая первая редакция пакета брала класс по прибитому пути к одной установке — у одного агента работало, у другого роняло подъём.)

**Cause.** The platform compaction package is resolved from the executable of the very platform installation that loads the agent. If the machine has several platform installations and one lacks `@deepseek-ai/dsh-compaction-basic`, the import fails. (The very first edition took the class by a hard-coded path to one installation — it worked for one agent and broke another's start-up.)

**Лечение.** Установите пакет сжатия платформы в ту же установку, что и агент; путь в коде не прибивайте.

**Fix.** Install the platform compaction package into the same installation as the agent; do not hard-code paths.

## «не нашёл пакет dsh-pamyat-kompakt по имени» · "could not find package dsh-pamyat-kompakt by name"

**Признак.** Отказ импорта с этой строкой; стенды падают с `Cannot find module 'dsh-pamyat-kompakt'`.

**Symptom.** Import failure with this line; stands fail with `Cannot find module 'dsh-pamyat-kompakt'`.

**Причина.** Сосед разрешается по имени из `node_modules`, где стоит этот пакет. В дереве исходников или при ручной раскладке ссылки нет.

**Cause.** The sibling is resolved by name from the `node_modules` where this package lives. In a source tree or a manual layout the link is missing.

**Лечение.** Поставьте ссылку `node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt` (в дереве — `npm install --offline`, он ставит только ссылку). Не переносите соседа в `dependencies`: `file:`-зависимость там ломает установку метапакета.

**Fix.** Create the link `node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt` (in the tree — `npm install --offline`, which creates only the link). Do not move the sibling into `dependencies`: a `file:` dependency there breaks the metapackage installation.

## Давление выше порога, а сжатия нет · Pressure above threshold, but no compaction

**Признак.** Агент упирается в окно; в журнале строка «выбрать нечего: давление P ≥ порога T, поверхность S < удержания U — сжатия нет».

**Symptom.** The agent hits the window; the journal shows "выбрать нечего: давление P ≥ порога T, поверхность S < удержания U — сжатия нет" ("nothing to select: pressure ≥ threshold, surface < retention — no compaction").

**Причина.** Платформа меряет давление по всему контексту, а хвост набирает из поверхности. У агентов за шлюзом подписки поверхность — только сообщения; если удержание больше всей поверхности, выбрать нечего. Пакет режет удержание до ½ поверхности, поэтому такая строка значит, что подстановка не дошла до платформы (см. следующий раздел) или поверхность действительно пуста.

**Cause.** The platform measures pressure over the whole context but collects the tail from the surface. For agents behind a subscription gateway the surface is messages only; if retention exceeds the whole surface there is nothing to select. The package caps retention at ½ of the surface, so this line means the substitute did not reach the platform (see the next section) or the surface really is empty.

**Лечение.** Проверьте, нет ли рядом строки «платформа НЕ прочла подстановку удержания». Вариант «по балансу пар инструментов» — в начале поверхности висит вызов инструмента без ответа; это лечится на стороне сессии, а не удержания.

**Fix.** Check for a nearby line "платформа НЕ прочла подстановку удержания". The "tool-call pair balance" variant means an unanswered tool call sits at the start of the surface; that is fixed on the session side, not by retention.

## «🔴 платформа НЕ прочла подстановку удержания» · "the platform did NOT read the retention substitute"

**Признак.** Эта строка после обновления платформы.

**Symptom.** This line after a platform upgrade.

**Причина.** Пакет подаёт удержание подстановкой конфига на синхронную часть вызова; платформа начала читать политику после `await`.

**Cause.** The package supplies retention by substituting the config for the synchronous part of the call; the platform started reading the policy after an `await`.

**Лечение.** Сверьте `compactIfNeeded` новой версии `dsh-compaction-basic` и способ подачи удержания; до правки сжатие идёт с родным удержанием (ловушка возможна). Стенд `stend-uderzhaniya` воспроизводит этот случай в разделе 6.

**Fix.** Compare `compactIfNeeded` of the new `dsh-compaction-basic` with how retention is supplied; until fixed, compaction uses native retention (the trap is possible). The stand `stend-uderzhaniya` reproduces this case in section 6.

## Codex: сжатие повторяется или «давление НЕИЗВЕСТНО» · Codex: repeated compaction or "pressure UNKNOWN"

**Признак.** После сжатия на маршруте Codex в журнале «давление после сжатия НЕИЗВЕСТНО до свежего usage»; через 3 хода — тревога «ожидание usage затянулось».

**Symptom.** After a Codex-route compaction the journal shows "давление после сжатия НЕИЗВЕСТНО до свежего usage"; after 3 turns — the alert "ожидание usage затянулось".

**Причина.** Платформа меряет давление по последнему отчёту провайдера; после сжатия старый отчёт ещё «высокий», и без защиты сжатие повторялось бы впустую. Пакет ждёт свежего отчёта. Тревога значит, что отчёт не пришёл за 3 завершённых хода (по замеру на трёх эпизодах все три получили его раньше первого завершённого хода).

**Cause.** The platform measures pressure from the latest provider report; after compaction the old report is still "high", and without protection compaction would repeat for nothing. The package waits for a fresh report. The alert means the report did not arrive within 3 completed turns (measured on three episodes, all three got it before the first completed turn).

**Лечение.** Проверьте шлюз подписки: отдаёт ли он usage в ответах модели. Когда usage придёт, будет один отбой; сжатие разблокируется само.

**Fix.** Check the subscription gateway: does it return usage in model responses. When usage arrives there will be one all-clear; compaction unblocks by itself.

## «🔴 журнал сессии недоступен» · "session journal unavailable"

**Признак.** Строка один раз на сессию; ожидание usage и хвост не работают.

**Symptom.** The line once per session; the usage wait and the tail do not work.

**Причина.** На DSH 0.2 у сессии нет поля `events`, журнал отдаёт только служба ядра памяти (`ctx.get('pamyat')`). Её нет, если `dsh-pamyat-core` не подключён в пресете.

**Cause.** On DSH 0.2 a session has no `events` field; only the memory core service (`ctx.get('pamyat')`) provides the journal. It is missing if `dsh-pamyat-core` is not attached in the preset.

**Лечение.** Подключите `dsh-pamyat-core` тому же агенту. Сжатие при этом не блокируется — идёт родным путём.

**Fix.** Attach `dsh-pamyat-core` to the same agent. Compaction is not blocked meanwhile — it goes the native way.

## «наша сводка НЕ СОСТОЯЛАСЬ — отдаю родной» · "our summary FAILED — handing over to native"

**Признак.** Эта строка с причиной в скобках при сжатии.

**Symptom.** This line with a reason in brackets at compaction.

**Причина.** Ошибка в соседнем `dsh-pamyat-kompakt`: нет ключа, сеть, модель ответила не по договору, барьер формы сводки, негодная настройка агента.

**Cause.** An error in the sibling `dsh-pamyat-kompakt`: no key, network, the model answered off-contract, a summary shape barrier, invalid agent settings.

**Лечение.** Разбирайте по причине в скобках и по документации `dsh-pamyat-kompakt` (TROUBLESHOOTING). Сжатие уже прошло родной сводкой — агент не встал.

**Fix.** Diagnose by the reason in brackets and the `dsh-pamyat-kompakt` documentation (TROUBLESHOOTING). Compaction has already gone through with the native summary — the agent did not stall.

## «хвост НЕ подан (…)» · "tail NOT supplied (…)"

**Признак.** Сводка пишется по одной голове; строки о хвосте в конце сводки нет.

**Symptom.** The summary is written from the head alone; there is no tail line at the end.

**Причина.** По причине в скобках: сессия недоступна, журнал не читается, голова пуста, число сообщений на поверхности не совпало с головой или стык не сошёлся по содержимому. Для ручного и восстановительного сжатия (удержание 0) хвоста нет по устройству — там строки «НЕ подан» тоже нет.

**Cause.** Per the reason in brackets: session unavailable, journal unreadable, empty head, the surface message count did not match the head, or the joint did not match by content. For manual and recovery compaction (retain 0) there is no tail by design — no "NOT supplied" line there either.

**Лечение.** Обычно не требуется: это защита «не подать чужое». Повторяющийся «стык не сошёлся» после обновления платформы — повод сверить `buildSummarizationInput` новой версии.

**Fix.** Usually none needed: this is the "never supply the wrong thing" protection. A recurring "joint mismatch" after a platform upgrade is a reason to compare the new `buildSummarizationInput`.

## Отметка продолжения отменяется сама или будит дважды · The continuation marker cancels itself or wakes twice

**Признак.** После сжатия агент не продолжает задачу (фаза `canceled`) — или продолжает дважды.

**Symptom.** After compaction the agent does not continue the task (phase `canceled`) — or continues twice.

**Причина.** Прежде отметку гасило любое слово «стоп» в любом письме — это давало ложные отмены. Теперь гасит только «/stop» в начале личного сообщения Telegram в штатной рамке. Двойная побудка была, когда шлюз подписки клал своё письмо-продолжение, а отметка не узнавала его метку.

**Cause.** Previously any word "stop" in any letter cancelled the marker — causing false cancellations. Now only "/stop" at the start of a private Telegram message in the standard envelope cancels it. Double wake-ups happened when the subscription gateway put its own continuation letter and the marker did not recognise its tag.

**Лечение.** Смотрите `reason` в строке `[continuation-marker]`. Причина «legacy Codex letter already admitted» — письмо шлюза уже продолжило агента (верно и для шлюза Claude). Если шлюз сменил метку письма, её надо добавить в распознавание.

**Fix.** Look at `reason` in the `[continuation-marker]` line. The reason "legacy Codex letter already admitted" means the gateway letter has already resumed the agent (also true for the Claude gateway). If the gateway changed its letter tag, add it to recognition.

## «continuation audit unavailable» на каждом подъёме · "continuation audit unavailable" at every start-up

**Признак.** Тревога слепоты аудита при каждом перезапуске агента.

**Symptom.** An audit blindness alert at every agent restart.

**Причина.** Учётка агента не читает журнал своей службы ни напрямую, ни через `sudo -n`; или реестр агентов не отдал имя службы; или (с B-N-1969) `systemctl show` не ответил, идентификатор службы не установлен, либо строки kompakt-dsh в журнале подписаны другим идентификатором, чем поле поиска — причина названа в строке отказа. Прежде служба угадывалась как `<имя>.service` — у агентов, чья служба названа иначе, это давало ложную тревогу; прежде же `sudo` звался всегда, и учётка без NOPASSWD тревожила на каждом подъёме.

**Cause.** The agent account reads its own service journal neither directly nor via `sudo -n`; or the agent registry did not return the service name; or (since B-N-1969) `systemctl show` did not answer, the service identifier is not established, or kompakt-dsh lines in the journal are labelled with another identifier than the search field — the reason is named in the failure line. Previously the service was guessed as `<name>.service` — for agents whose service is named differently this produced a false alert; also `sudo` used to be called always, and an account without NOPASSWD alerted at every start-up.

**Лечение.** Дайте учётке право читать журнал своей службы (группа журнала или правило `sudo -n` для `journalctl -u <служба>`) и проверьте ответ `agent-registry pole <агент> sluzhba --json`. Пакет сам права не выдаёт. Узкое правило без группы журнала (с 1.1.29) должно дословно повторять форму аргументов: `journalctl ^-u <служба>\.service (--since -7 days|--since @[0-9]+|--after-cursor [A-Za-z0-9\=;]+) --grep \\\[continuation-marker\\\] -o json --no-pager --show-cursor$` и (с 1.1.30) запрос прошлого старта `journalctl ^-u <служба>\.service _PID\=1 MESSAGE_ID\=39f53479d3a045ac8e11786248231fbf -n 3 -o json --no-pager$` (регулярное выражение sudo ≥ 1.9.10). С B-N-1969 первая форма (поиск без поля) пакетом больше не зовётся — её место занимает поиск с полем `journalctl ^-u <служба>\.service SYSLOG_IDENTIFIER\=[A-Za-z0-9_.@+-]+ (--since -7 days|--since @[0-9]+|--after-cursor [A-Za-z0-9\=;]+) --grep \\\[continuation-marker\\\] -o json --no-pager --show-cursor$` и сверка ид `journalctl ^-u <служба>\.service (--since -7 days|--since @[0-9]+|--after-cursor [A-Za-z0-9\=;]+) --grep \^\\\[kompakt-dsh\\s -n 1 -o json --no-pager$`; форма запроса прошлого старта остаётся нужна и новому пакету — снимать после подъёма на новом пакете только прежнюю форму поиска, запрос старта не трогать (без него окно — 7 сут, курсор не сверяется, тревоги нет). Правило ставится РАНЬШЕ пакета, иначе каждый подъём — слепота. Совпадение проверять `sudo -l -U <агент> /usr/bin/journalctl <аргументы>`, а не только `visudo -c`. Без второй строки 1.1.30 работает, но ищет за 7 дней: в строке успеха «окно 7 сут (запрос старта: …)». Причина `signal=SIGTERM` при пустом stderr — таймаут: журнал службы за окно слишком велик; с 1.1.29 следующий успешный старт сохраняет курсор, и поиск идёт только после него; с B-N-1969 поиск идёт только по записям своего идентификатора — поток чужих строк в том же юните (например, `sudo`) его больше не тормозит.

**Fix.** Give the account permission to read its own service journal (journal group or a `sudo -n` rule for `journalctl -u <service>`) and check the answer of `agent-registry pole <agent> sluzhba --json`. The package grants no permissions itself. A narrow rule without the journal group (since 1.1.29) must repeat the argument form verbatim: `journalctl ^-u <service>\.service (--since -7 days|--since @[0-9]+|--after-cursor [A-Za-z0-9\=;]+) --grep \\\[continuation-marker\\\] -o json --no-pager --show-cursor$` and (since 1.1.30) the previous-start query `journalctl ^-u <service>\.service _PID\=1 MESSAGE_ID\=39f53479d3a045ac8e11786248231fbf -n 3 -o json --no-pager$` (sudo ≥ 1.9.10 regular expression). Since B-N-1969 the first form (search without the field) is no longer called by the package — its place is taken by the search with the field `journalctl ^-u <service>\.service SYSLOG_IDENTIFIER\=[A-Za-z0-9_.@+-]+ (--since -7 days|--since @[0-9]+|--after-cursor [A-Za-z0-9\=;]+) --grep \\\[continuation-marker\\\] -o json --no-pager --show-cursor$` and the id check `journalctl ^-u <service>\.service (--since -7 days|--since @[0-9]+|--after-cursor [A-Za-z0-9\=;]+) --grep \^\\\[kompakt-dsh\\s -n 1 -o json --no-pager$`; the previous-start query form stays needed by the new package too — after the start on the new package remove only the old search form, do not touch the start query (without it the window is 7 days, the cursor is not checked, no alert). The rule goes in BEFORE the package, otherwise every start is blindness. Check the match with `sudo -l -U <agent> /usr/bin/journalctl <arguments>`, not only `visudo -c`. Without the second line 1.1.30 works but searches 7 days: the success line says "окно 7 сут (запрос старта: …)". The cause `signal=SIGTERM` with an empty stderr is a timeout: the service journal in the window is too large; since 1.1.29 the next successful start saves a cursor and the search covers only what follows it; since B-N-1969 the search covers only entries of the service's own identifier — a stream of foreign lines in the same unit (e.g. `sudo`) no longer slows it.

## Включить отметку продолжения для агента на Codex · Enabling the continuation marker for a Codex agent

**Признак.** На Codex отметки нет, хотя на Claude она работает.

**Symptom.** No marker on Codex although it works on Claude.

**Причина.** Для Codex отметка включается только файлом режима (по умолчанию выключена); тот же файл читает шлюз подписки, и включённому агенту он перестаёт класть своё письмо-продолжение.

**Cause.** For Codex the marker is enabled only by the mode file (off by default); the subscription gateway reads the same file and stops putting its continuation letter for an enabled agent.

**Лечение.** Сначала установите оба читателя (этот пакет и шлюз) с пустым списком. Затем в паузе: остановите новые ходы агента, дождитесь окончания текущих, убедитесь, что в очереди нет старых писем-продолжений, и атомарно опубликуйте файл с именем агента. Посреди хода режим не меняйте — общего замка нет. Откат — такая же пауза и пустой список.

**Fix.** First install both readers (this package and the gateway) with an empty list. Then during a pause: stop the agent's new turns, wait for current ones to finish, make sure no old continuation letters are queued, and publish the file with the agent's name atomically. Do not change the mode mid-turn — there is no shared lock. Rollback — the same pause and an empty list.

## Стенд «глухой» — проходит, не проверяя · A "deaf" stand — passes without checking

**Признак.** Стенд зелёный при заведомо испорченном коде.

**Symptom.** A stand is green on deliberately broken code.

**Причина.** Обёртка стенда отбрасывала возврат тела пробы: проба, которая «говорила» возвратом, а не исключением, проходила всегда. Нашёл это прибор проверки стендов, а не сам стенд.

**Cause.** The stand wrapper discarded the probe body's return value: a probe that "spoke" by returning instead of throwing always passed. It was found by a stand-checking tool, not by the stand itself.

**Лечение.** Обёртка проб `stend-hvosta` теперь отказывает на любой возврат тела, кроме `undefined`; остальные стенды говорят исключением (`assert`) или явным счётом. Перед доверием к зелёному — порча: испортите проверяемое место в копии и убедитесь, что стенд покраснел.

**Fix.** The `stend-hvosta` probe wrapper now fails on any body return other than `undefined`; the other stands speak by exception (`assert`) or an explicit count. Before trusting green — corrupt the checked spot in a copy and make sure the stand turns red.
