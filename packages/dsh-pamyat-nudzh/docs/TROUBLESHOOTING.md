# Поломки и их лечение · Troubleshooting

Каждый случай — признак в журнале или поведении, причина по коду и что делать. Строки журнала ищите в stderr процесса агента (журнале службы): пакет пишет только туда.

Each case is a sign in the log or behaviour, the cause per the code and what to do. Look for log lines in the agent process stderr (the service log): the package writes only there.

## Нет строки подъёма · No start-up line

**Причина.** Плагин не подключён, загрузка упала (`ERR_MODULE_NOT_FOUND` — не установлены `@deepseek-ai/schemastery`, `@deepseek-ai/cordis` или `@deepseek-ai/dsh-llm`), либо смотрят не в stderr: пакет пишет только через `console.error`, а `ctx.logger` намеренно не использует.

**Cause.** The plugin is not added, loading failed (`ERR_MODULE_NOT_FOUND` — `@deepseek-ai/schemastery`, `@deepseek-ai/cordis` or `@deepseek-ai/dsh-llm` not installed), or one is not looking at stderr: the package writes only via `console.error` and deliberately does not use `ctx.logger`.

**Лечение.** Проверьте блок плагина в cordis YAML и наличие зависимостей; ищите строку «подъём: предел …» в журнале службы.

**Fix.** Check the plugin block in cordis YAML and the dependencies; look for the "подъём: предел …" line in the service log.

## Строка подъёма несколько раз · The start-up line several times

**Причина.** Платформа зовёт `apply` несколько раз на подъём (замер: 3), и каждый вызов печатает строку. Это норма, не дефект монтажа.

**Cause.** The platform calls `apply` several times per start-up (measured: 3), and every call prints the line. This is normal, not a mounting defect.

## «ОТКЛОНЕНО: …» · "ОТКЛОНЕНО: …" (rejected)

**Причина.** `predel` меньше нуля, не конечное число, или `dolyaTrevogi` вне (0, 1]. Действует прежнее годное значение, при старте — умолчание; строка называет, какое именно.

**Cause.** `predel` is below zero or not a finite number, or `dolyaTrevogi` is outside (0, 1]. The previous valid value stays in force, the default at start-up; the line names which one.

**Лечение.** Исправьте настройку; новая строка подъёма покажет принятые числа. Подробно — [SETTINGS.md](SETTINGS.md).

**Fix.** Fix the setting; the next start-up line shows the accepted numbers. In detail — [SETTINGS.md](SETTINGS.md).

## «предел контекста НЕ ЗАДАН (predel: 0)» · "context limit NOT SET"

**Причина.** `predel` не задан или равен 0. Пакет считает расход, но подтолкнуть не может, и напоминаний не вставляет вовсе.

**Cause.** `predel` is unset or 0. The package counts spend but cannot nudge and inserts no reminders at all.

**Лечение.** Задайте `predel` — объявленное окно модели в токенах провайдера.

**Fix.** Set `predel` — the model's declared window in provider tokens.

## Напоминание не приходит, хотя окно почти полно · No reminder although the window is nearly full

**Причина.** По коду возможны пять причин: `predel` равен 0; `predel` больше настоящего окна, и порог не достигается; провайдер не прислал `usage`, и занятость не обновилась (в `itog()` растёт `bezChisla`); после компакта давление неизвестно до свежего `usage` основной модели; сессия слепа (строка «СЛЕПОТА nudzh»). Отдельно: занятость известна после вызова, а отказ по длине случается на вызове, поэтому крупная прибавка может перескочить порог сразу в отказ.

**Cause.** Per the code there are five possible causes: `predel` is 0; `predel` is larger than the real window, so the threshold is never reached; the provider sent no `usage`, so occupancy was not updated (`bezChisla` grows in `itog()`); after compaction the pressure is unknown until a fresh main-model `usage`; the session is blind (a "СЛЕПОТА nudzh" line). Separately: occupancy is known after a call, while a length rejection happens at the call, so a large increase can jump past the threshold straight into a rejection.

**Лечение.** Сверьте строку подъёма с окном модели; посмотрите `ctx.nudzhPamyati.itog(session)` — `zanyato`, `bezChisla`; ищите строки «после сжатия давление неизвестно» и «СЛЕПОТА nudzh». Чтобы видеть рост между тревогами, задайте `otmetkiPuti`.

**Fix.** Compare the start-up line with the model window; look at `ctx.nudzhPamyati.itog(session)` — `zanyato`, `bezChisla`; look for the "после сжатия давление неизвестно" and "СЛЕПОТА nudzh" lines. To see growth between alarms, set `otmetkiPuti`.

## Тревога есть, а строки «напоминание вставлено» нет · An alarm but no "reminder inserted" line

**Причина.** Вставка делается на следующем шаге агента (`agent/pre-step`); если шага не было (компакт случился внутри того же шага), напоминания не будет. Ещё: решение выше по цепи — `reject`, шаг оборван (`signal.aborted`), сессия слепа, или успешный компакт отменил отложенное напоминание.

**Cause.** The insertion happens on the agent's next step (`agent/pre-step`); if there was no step (compaction happened within the same step), there is no reminder. Also: the decision higher up the chain is `reject`, the step was aborted (`signal.aborted`), the session is blind, or a successful compaction cancelled the pending reminder.

**Лечение.** Посмотрите строку «занятость вернулась под порог … Шагов между тревогой и этим мигом: K»: K = 0 означает, что шага между тревогой и компактом не было. Это известная граница механизма, а не поломка.

**Fix.** Look at the line "занятость вернулась под порог … Шагов между тревогой и этим мигом: K": K = 0 means there was no step between the alarm and compaction. This is a known limit of the mechanism, not a failure.

## «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН» · "OCCUPANCY COUNT NOT CREDIBLE"

**Причина.** Занятость больше `1.5 × predel`. Окно не может быть заполнено больше самого себя, значит число говорит о приборе. Вероятная причина — поставщик отдаёт `usage` накопительно за сессию, а платформа передаёт его как usage одного вызова. Тревога при этом не подаётся.

**Cause.** Occupancy is above `1.5 × predel`. A window cannot be fuller than itself, so the number is about the instrument. The likely cause is a provider reporting `usage` cumulatively per session while the platform passes it on as the usage of one call. No alarm is raised.

**Лечение.** Сравните `inputTokens` двух вызовов подряд: если он растёт от вызова к вызову при малых сообщениях, usage накопительный. Чинить надо на стороне платформы или поставщика; этот пакет только отказывается толкать по ложному основанию.

**Fix.** Compare `inputTokens` of two consecutive calls: if it grows from call to call with small messages, usage is cumulative. The fix belongs to the platform or provider side; this package only refuses to push on a false basis.

## Ложные тревоги в начале сессии · False alarms at the start of a session

**Причина.** При накопительном usage занятость растёт быстрее настоящей. Пока она между порогом и `1.5 × predel`, защита недостоверного счёта молчит, и тревога подаётся ложно; выше объявленного окна тревога несёт пометку «ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА (N%)» с проверкой — два вызова подряд, растёт ли input.

**Cause.** With cumulative usage, occupancy grows faster than the real one. While it is between the threshold and `1.5 × predel`, the non-credible guard stays silent and the alarm is false; above the declared window the alarm carries the mark "ЗАНЯТОСТЬ ВЫШЕ ОБЪЯВЛЕННОГО ОКНА (N%)" with a check — two calls in a row, does input grow.

**Лечение.** То же, что выше: проверить usage двумя вызовами и чинить источник числа. Порог менять не надо — он не поможет.

**Fix.** Same as above: check usage with two calls and fix the source of the number. Changing the threshold will not help.

## Отметки пути не печатаются · Path marks are not printed

**Причина.** Список пуст; значения вне (0, 1) отброшены — об этом строка «ОТКЛОНЕНО: otmetkiPuti …» при подъёме (например, `[50]` вместо `[0.5]`); отметка уже напечатана в этом цикле; счёт недостоверен — тогда разбор обрывается до отметок; `predel` равен 0.

**Cause.** The list is empty; values outside (0, 1) were dropped — an "ОТКЛОНЕНО: otmetkiPuti …" line at start-up says so (for example `[50]` instead of `[0.5]`); the mark was already printed this cycle; the count is non-credible — then analysis stops before marks; `predel` is 0.

**Лечение.** Запишите отметки долями: `[0.5, 0.6, 0.7]`.

**Fix.** Write marks as fractions: `[0.5, 0.6, 0.7]`.

## «СЛЕПОТА nudzh: …» · "BLINDNESS nudzh: …"

**Причина.** По тексту после двоеточия: «журнал сессии недоступен» — ни служба `pamyat`, ни сессия не отдали массив событий; «журнал укорочен; требуется новая сессия» — событий стало меньше, чем уже прочитано; «негодная граница наследованного журнала» — `inheritedEventCount`/`seedLength` не целое или больше журнала; «событие seq=N: …» — негодный `usage` в событии (например, отрицательное поле). Вставка в такую сессию запрещена.

**Cause.** By the text after the colon: "журнал сессии недоступен" (journal unavailable) — neither the `pamyat` service nor the session returned an event array; "журнал укорочен; требуется новая сессия" (journal shortened; a new session is needed) — there are fewer events than already read; "негодная граница наследованного журнала" (invalid inherited boundary) — `inheritedEventCount`/`seedLength` is not an integer or exceeds the journal; "событие seq=N: …" (event seq=N) — an invalid `usage` in the event (for example a negative field). Insertion into such a session is forbidden.

**Лечение.** Проверьте службу `pamyat` ядра памяти и что сессия отдаёт `snapshotEvents()` или `events`. Для укороченного журнала — начать новую сессию. Негодное событие учитывается как вызов без числа; давление станет известным со следующим годным usage.

**Fix.** Check the memory core's `pamyat` service and that the session provides `snapshotEvents()` or `events`. For a shortened journal — start a new session. An invalid event counts as a call without a number; pressure becomes known again with the next valid usage.

## «не смог учесть расход: …» · "could not count spend: …"

**Причина.** Исключение в обработчике `session/event` вне разбора журнала. Поток платформы при этом не обрывается.

**Cause.** An exception in the `session/event` handler outside journal parsing. The platform's stream is not interrupted.

**Лечение.** Текст исключения — в строке; сохраните её и событие, на котором она появилась, и сообщите авторам пакета.

**Fix.** The exception text is in the line; keep it and the event it appeared on, and report it to the package authors.

## Сумма расхода больше предела · The total spend exceeds the limit

**Причина.** Норма: сумма — сколько прошло через API за все вызовы, она растёт без предела и компакцией не уменьшается. Строка тревоги так и говорит: «Число уже БОЛЬШЕ предела, а это возможно без переполнения окна».

**Cause.** Normal: the sum is what went through the API over all calls; it grows without bound and is not reduced by compaction. The alarm line says so: "Число уже БОЛЬШЕ предела, а это возможно без переполнения окна" (the number already exceeds the limit, which is possible without window overflow).

## `hvatitLi()` всегда «neizvestno» · `hvatitLi()` always "neizvestno"

**Причина.** Так устроено: «хватает» пакет не говорит никогда, потому что данные о расходе неполны. Ответ бывает только `porog-pereyden` или `neizvestno` с причиной и числами полноты.

**Cause.** By design: the package never says "enough", because spend data is incomplete. The answer is only `porog-pereyden` or `neizvestno` with a reason and completeness numbers.

## `itog()` без сессии неполон или `zanyato: null` · `itog()` without a session is incomplete or `zanyato: null`

**Причина.** Без сессии `itog()` суммирует только сессии, которые процесс уже прочитал, а занятость берёт у последней тронутой; у слепой сессии занятость `null`. Холодный процесс узнаёт историю сессии лишь при первом обращении.

**Cause.** Without a session, `itog()` sums only the sessions the process has already read and takes occupancy from the last one touched; a blind session has `null` occupancy. A cold process learns a session's history only on first access.

**Лечение.** Спрашивайте `itog(session)` для нужной сессии.

**Fix.** Ask `itog(session)` for the session you need.

## Стенд вернул код 2 · A stand returned exit code 2

**Причина.** Слепота: предмет не загрузился, обычно не установлены зависимости.

**Cause.** Blindness: the subject did not load, usually dependencies are missing.

**Лечение.** `npm install` в каталоге пакета и повторить. Это не «пакет сломан»: проверить не удалось.

**Fix.** `npm install` in the package directory and run again. This is not "the package is broken": checking was impossible.

## `stend-readme` покраснел после правки README · `stend-readme` turned red after a README edit

**Причина.** Стенд сверяет README с кодом: умолчания в таблице, обязательные фразы на обоих языках, отсутствие абсолютных путей, число стендов и проб на строке, где названы стенды, состав `npm pack`, одинаковый набор упомянутых стендов в обоих README. Ещё одна причина — нет пишущего `HOME`: проба состава зовёт `npm pack --dry-run`.

**Cause.** The stand checks the README against the code: defaults in the table, required phrases in both languages, no absolute paths, the number of stands and probes on the line naming the stands, the `npm pack` contents, the same set of mentioned stands in both READMEs. Another cause is a non-writable `HOME`: the contents probe calls `npm pack --dry-run`.

**Лечение.** Прочтите текст красной пробы — он называет, чего не хватает. `README.en.md` собирается из английских абзацев `README.md`: правьте `README.md` и пересоберите английский.

**Fix.** Read the red probe's text — it names what is missing. `README.en.md` is built from the English paragraphs of `README.md`: edit `README.md` and rebuild the English one.
