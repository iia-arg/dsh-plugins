# Поломки и их лечение · Troubleshooting

Признак → причина → лечение. Случаи взяты из нашей работы с пакетом.

Symptom → cause → fix. The cases come from our operation of the package.

## Нет строки подъёма · No start-up line

**Причина.** Плагин не подключён, загрузка упала (`ERR_MODULE_NOT_FOUND` — не установлены `@deepseek-ai/schemastery` или `@deepseek-ai/cordis`), либо смотрят не в stderr: пакет пишет только через `console.error`, а `ctx.logger` намеренно не использует.

**Cause.** The plugin is not added, loading failed (`ERR_MODULE_NOT_FOUND` — `@deepseek-ai/schemastery` or `@deepseek-ai/cordis` not installed), or one is not looking at stderr: the package writes only via `console.error` and deliberately does not use `ctx.logger`.

**Лечение.** Проверьте блок плагина в cordis YAML и наличие зависимостей; ищите строку в журнале службы, куда попадает stderr процесса.

**Fix.** Check the plugin block in cordis YAML and the dependencies; look for the line in the service log that receives the process stderr.

## Строка подъёма три раза · The start-up line three times

**Причина.** Платформа зовёт `apply` несколько раз на подъём (замер: 3), и каждый вызов печатает строку. Это норма для этого пакета, не дефект монтажа.

**Cause.** The platform calls `apply` several times per start-up (measured: 3), and every call prints the line. This is normal for this package, not a mounting defect.

## «ОТКЛОНЕНО: …» · "REJECTED: …"

**Причина.** `predel` меньше нуля или не число; `porogVery` вне [0, 1] или не число. Действует прежнее годное значение, а при старте — умолчание.

**Cause.** `predel` below zero or not a number; `porogVery` outside [0, 1] or not a number. The previous valid value applies, or the default at start-up.

**Лечение.** Исправьте значение в настройке; горячая загрузка подхватит его без перезапуска.

**Fix.** Correct the value in the settings; a hot reload picks it up without a restart.

## «ОТКЛОНЕНО: poryadok …» при подъёме · "ОТКЛОНЕНО: poryadok …" at start-up

**Причина.** Опечатка в `poryadok`. Значение отклонено при монтаже: действует прежний годный порядок или умолчание `svezhest` (прежде, до 0.1.0-alpha.18 (прежняя нумерация; выпуск 3.1.1 это уже содержит), опечатка принималась, и каждый отбор бросал «неизвестный порядок»).

**Cause.** A typo in `poryadok`. The value is rejected at mount: the previous valid order or the default `svezhest` stays in force (before 0.1.0-alpha.18 (old numbering; release 3.1.1 already includes this) the typo was accepted, and every selection threw "unknown order").

**Лечение.** Поставьте `svezhest` или `vera`; сверьте строку подъёма — порядок в ней в кавычках «…».

**Fix.** Set `svezhest` or `vera`; check the start-up line — the order is quoted there «…».

## Знание не поднимается вовсе · No knowledge is raised at all

**Причина.** (1) `predel: 0` — тогда есть строка «предел равен нулю …». (2) Все кандидаты дороже предела — в отказе только «НЕ ВЛЕЗАЮТ ЦЕЛИКОМ». (3) Вызывающий не передал кандидатов — тогда нет и строки «поднято НЕ ВСЁ», а строка тепла показывает «измерено 0, не измерено 0».

**Cause.** (1) `predel: 0` — then there is a "предел равен нулю …" line. (2) All candidates cost more than the limit — the refusal shows only "НЕ ВЛЕЗАЮТ ЦЕЛИКОМ". (3) The caller passed no candidates — then there is no "поднято НЕ ВСЁ" line, and the warmth line shows "измерено 0, не измерено 0".

**Лечение.** (1) Поставьте предел. (2) Дробите или ужимайте такие записи при записи: ни порядок, ни порог их не поднимут. (3) Смотрите вызывающий слой.

**Fix.** (1) Set a limit. (2) Split or condense such records at write time: neither order nor threshold will raise them. (3) Look at the calling layer.

## Поднимаются старые записи, а не свежие · Old records are raised instead of fresh ones

**Причина.** У записей нет ни `sozdano`, ни `kogda` (время в ином поле): ключ у всех 0, и они остаются в порядке входа. Признак: строка тепла показывает «не измерено N». До 0.1.0-alpha.18 (прежняя нумерация; выпуск 3.1.1 это уже содержит) так же вело себя время в одном `kogda`; теперь его порядок читает.

**Cause.** Records have neither `sozdano` nor `kogda` (the time is in another field): every key is 0, and they keep the input order. Sign: the warmth line shows "не измерено N". Before 0.1.0-alpha.18 (old numbering; release 3.1.1 already includes this) time only in `kogda` behaved the same way; now the order reads it.

**Лечение.** Передавайте время в `sozdano` или `kogda` либо сортируйте кандидатов по свежести до вызова.

**Fix.** Pass the time in `sozdano` or `kogda`, or sort the candidates by freshness before the call.

## «тепло: измерено 0, не измерено N» · "warmth: measured 0, unmeasured N"

**Причина.** У записей нет ни `sozdano`, ни `kogda`. Это свойство переданных данных, а не памяти; раньше такой же вид давал сам прибор, читавший только `sozdano`.

**Cause.** Records have neither `sozdano` nor `kogda`. This is a property of the passed data, not of memory; previously the instrument itself, reading only `sozdano`, produced the same picture.

## «касания: поля НЕТ ни у одной записи» · "touches: no record has the field"

**Причина.** Ядро памяти старше 0.1.0-alpha.43 (прежняя нумерация; выпуск 3.1.1 новее) или вызывающий не передаёт `kasanij`. Строка говорит только об этом отборе: «касались 0» до выдачи — норма, отметку ставят после неё.

**Cause.** The memory core is older than 0.1.0-alpha.43 (old numbering; release 3.1.1 is newer) or the caller does not pass `kasanij`. The line speaks only about this selection: "touched 0" before delivery is normal, marks are set after it.

## Пределы «поехали» без правки · Limits "drifted" without an edit

**Причина.** Наша мера своя (4 символа на единицу); если вы сравниваете её с числом платформы, а платформа сменила оценщик, расхождение появится молча.

**Cause.** Our measure is our own (4 characters per unit); if you compare it with the platform number and the platform changed its estimator, a discrepancy appears silently.

**Лечение.** Сверяйте `sverit({ nashe, platformennoe })` там, где оба числа видны в одном событии; меру не подгоняйте.

**Fix.** Reconcile with `sverit({ nashe, platformennoe })` where both numbers are visible in one event; do not fit the measure.

## `stend-readme` покраснел после правки README · `stend-readme` turned red after a README edit

**Причина.** Пропал один из обязательных признаков (порядки, умолчания в таблице, «МОЛЧА»/SILENTLY, «не измерял»/not measured, число проб или стендов словом), README.md и README.en.md называют разные стенды, или README ссылается на файл, которого нет в `npm pack`.

**Cause.** One of the mandatory markers disappeared (orders, defaults in the table, the silent-drift warning, the never-measured distinction, the probe count or the stand count as a word), README.md and README.en.md name different stands, or the README references a file not in `npm pack`.

**Лечение.** Правьте README.md (он двуязычный), затем перенесите английские абзацы правки в README.en.md — это английская страница, собранная из английских половин README.md, а не его копия; число проб — из исходников стендов, а не по памяти.

**Fix.** Edit README.md (it is bilingual), then carry the English paragraphs of the edit over to README.en.md — it is the English page built from the English halves of README.md, not a copy of it; take the probe count from the stand sources, not from memory.
