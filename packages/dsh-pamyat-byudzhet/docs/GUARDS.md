# Проверки и стенды · Checks and test stands

Сторожей в смысле отдельных наблюдателей в этом пакете нет: всё, что ловит беду, — проверки внутри кода и пять стендов. Для каждой: что ловит, чего не ловит, куда говорит.

This package has no separate watchers: everything that catches trouble is a check inside the code plus five test stands. For each: what it catches, what it misses, where it reports.

## Проверки в коде · Checks in the code

Все строки идут в stderr процесса с приставкой `[dsh-pamyat-byudzhet <версия>]`.

All lines go to the process stderr prefixed with `[dsh-pamyat-byudzhet <version>]`.

| Проверка · Check | Ловит · Catches | Не ловит · Misses | Строка · Line |
|---|---|---|---|
| Границы чисел и порядка (`vzyatChislo`, `vzyatPoryadok`) · number and order bounds | `predel` < 0, `porogVery` вне [0, 1], не число, неизвестный `poryadok` — при старте и горячей загрузке · out-of-range or non-numeric values and an unknown `poryadok` at start-up and hot reload | разные значения у разных узлов одного процесса · different values from different nodes of one process | «ОТКЛОНЕНО: … действует …» |
| Строка подъёма · start-up line | факт монтажа и действующие настройки · that mounting happened and the settings in force | правильность самих значений по смыслу · whether the values make sense | «подъём: предел …, порядок …, порог веры …» |
| Нулевой предел · zero limit | `predel = 0`: подниматься не будет ничего · nothing will be raised | слишком малый, но ненулевой предел · a too small but non-zero limit | «предел равен нулю: знание НЕ БУДЕТ подниматься вообще …» |
| Громкий отказ · loud refusal | любой отброс: число, две причины, свойства отброшенных · any drop: count, two reasons, properties of the dropped | записи, которые вызывающий не передал в кандидаты · records the caller never passed as candidates | «поднято НЕ ВСЁ: … ПРИЧИНЫ: … Из них: …» |
| Строка касаний · touch line | у скольких кандидатов есть поле касаний, сколько касались, когда последний раз · how many candidates have the touch field, were touched, the last touch | касания по всей памяти; отметки, поставленные после выдачи · memory-wide touches; marks set after delivery | «касания В ЭТОМ ОТБОРЕ …» / «касания: поля НЕТ …» |
| Прибор тепла · warmth instrument | измерено / не измерено, мин, медиана, макс, ниже порога · measured / unmeasured, min, median, max, below threshold | влияние на отбор — его нет по решению · effect on selection — none by design | «тепло (прибор, на отбор НЕ влияет): …» |
| Отказ отбора · selection refusal | не список записей, негодный предел или неизвестный порядок в вызове — исключение с объяснением · a non-list, an invalid limit or an unknown order — an exception with an explanation | — | исключение, не строка · an exception, not a line |
| Мера · measure | `ocenit` не объекта, `sverit` не чисел — исключение; ноль у платформы — объяснение словами · non-object to `ocenit`, non-numbers to `sverit` — exception; zero from the platform — explained in words | смену оценщика у платформы — видно только по расхождению `sverit` · a change of the platform estimator — visible only as a `sverit` discrepancy | — |

## Стенды · Test stands

Запуск всех: `npm test` (итог 1 — есть красные, иначе 2 — слепота, иначе код первого иного отказа, иначе 0). Стендам нужны `@deepseek-ai/cordis` и `@deepseek-ai/schemastery` в `node_modules`, стенду README — ещё `npm` в PATH. Код стенда: 0 — зелёный, 1 — красные пробы, 2 — слепота (предмет не загрузился).

Run all: `npm test` (overall 1 — some red, otherwise 2 — blindness, otherwise the code of another failure, otherwise 0). The stands need `@deepseek-ai/cordis` and `@deepseek-ai/schemastery` in `node_modules`, the README stand also needs `npm` on PATH. A stand's exit code: 0 — green, 1 — red probes, 2 — blindness (the subject did not load).

| Стенд · Stand | Проб · Probes | Что проверяет · What it checks | Чего не видит · Blind spot |
|---|---|---|---|
| `stend-granic-chisel.mjs` | 10 | отклонение негодных чисел и неизвестного `poryadok` при старте и `fiber.update` на настоящем Context; прежнее годное действует в отборе; `predel 0` законен · rejection of invalid numbers and an unknown `poryadok` at start and on `fiber.update` on a real Context; the previous valid value applies in selection; `predel 0` is legal | живой экземпляр cordis платформы · the platform's live cordis instance |
| `stend-krik-zvuchit.mjs` | 9 | отказ слышен в stderr отдельного процесса; `ctx.logger` есть и нем; нулевой предел говорит; версия — из манифеста; строка касаний называет область и момент · the refusal is audible in a separate process's stderr; `ctx.logger` exists and is mute; zero limit speaks; version from the manifest; touch line names scope and moment | врущий манифест · a lying manifest |
| `stend-mery.mjs` | 7 | цена растёт с длиной, пустая запись стоит 1, служебные поля входят в цену, сверка даёт проценты и не делит на ноль · cost grows with length, an empty record costs 1, service fields count, reconciliation gives percent and never divides by zero | соответствие нашей меры токенам платформы · how our measure relates to platform tokens |
| `stend-otbora.mjs` | 23 | причины против свойств, две причины, вера `null`, тепло не влияет на отбор, тепло и порядок `svezhest` по `kogda`, порог холода в сводке = `POROG_HOLODNOJ`, три входа касаний, вес касаний ноль, основание в шапке `src/teplo.js` · reasons versus properties, two reasons, `null` confidence, warmth does not affect selection, warmth and the `svezhest` order via `kogda`, the cold threshold in the summary = `POROG_HOLODNOJ`, three touch inputs, zero touch weight, the basis in the `src/teplo.js` header | записи вовсе без времени — ключ 0, порядок входа (свойство данных) · records with no time at all — key 0, input order (a property of the data) |
| `stend-readme.mjs` | 12 | README.md и README.en.md: порядки, умолчания в таблице, способ замера единиц, «МОЛЧА»/SILENTLY, «не измерял»/not measured, число проб и стендов по исходникам, одинаковый набор стендов, всё упомянутое — в составе `npm pack` (сбой `npm` — СЛЕПОТА, код 2) · both READMEs: orders, defaults in the table, the units method, the silent-drift warning, the never-measured distinction, probe and stand counts from sources, the same set of stands, everything referenced is in `npm pack` (an `npm` failure — BLINDNESS, exit 2) | правдивость остального текста; пробы, порождённые циклом · truthfulness of the rest of the text; probes generated in a loop |

Стенд README читает исходники стендов и считает строки, начинающиеся с `proba(` или `await proba(`; число в README обязано совпасть (сейчас 61). Шапку `src/teplo.js` читает `stend-otbora`: в ней обязаны стоять дословно «ПЕРЕСЕЧЕНИЕ опознавателей двух соседних выдач» и `journalctl`.

The README stand reads the stand sources and counts lines starting with `proba(` or `await proba(`; the number in the README must match (61 now). The `src/teplo.js` header is read by `stend-otbora`: it must contain the verbatim phrase "ПЕРЕСЕЧЕНИЕ опознавателей двух соседних выдач" and `journalctl`.

## Как читать строки · How to read the lines

| Строка · Line | Значение · Meaning |
|---|---|
| `подъём: предел N ед., порядок «…», порог веры X` | плагин смонтирован с этими настройками · plugin mounted with these settings |
| `ОТКЛОНЕНО: поле = значение — вне допуска …; действует … (прежнее годное / умолчание)` | настройка отклонена · a setting was rejected |
| `предел равен нулю: знание НЕ БУДЕТ подниматься вообще` | `predel = 0` |
| `поднято НЕ ВСЁ: просили A, подняли B, отброшено C — ПРИЧИНЫ: …` | неполный подъём · incomplete raise |
| `N НЕ ВЛЕЗАЮТ ЦЕЛИКОМ: цена записи больше всего предела` | запись дороже всего предела — лечится дроблением · a record costlier than the whole limit — cured by splitting |
| `N не поместились в остаток предела по порядку «…»` | места не хватило — лечится порядком или пределом · ran out of room — cured by order or limit |
| `Из них: с верой ниже X: N; с НЕИЗМЕРЕННОЙ верой (это не ноль): N; холодных …; с НЕИЗМЕРЕННЫМ теплом …` | свойства отброшенных, не причины · properties of the dropped, not reasons |
| `единицы «оценка наша», НЕ токены платформы` | цена — в нашей мере · the cost is in our measure |
| `касания В ЭТОМ ОТБОРЕ (N записей-кандидатов, снято ДО выдачи): …` | входы касаний этого отбора · touch inputs of this selection |
| `касания: поля НЕТ ни у одной записи ЭТОГО отбора` | ядро старше 0.1.0-alpha.43 (прежняя нумерация; выпуск 3.1.1 новее) или вызывающий поле не передаёт · core older than 0.1.0-alpha.43 (old numbering; release 3.1.1 is newer) or the caller drops the field |
| `тепло (прибор, на отбор НЕ влияет): измерено N, не измерено M, …` | распределение тепла · warmth distribution |
