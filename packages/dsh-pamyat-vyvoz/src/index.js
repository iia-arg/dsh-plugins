/**
 * RU: dsh-pamyat-vyvoz — вывоз и ввоз памяти агента.
 * EN: dsh-pamyat-vyvoz — export and import of an agent's memory.
 *
 * RU: Пакет НЕ плагин: он не монтируется в ход и ничего не делает сам. Это две команды,
 * RU: которые зовут рукой либо из обслуживающего сторожа. Причина простая: перенос памяти —
 * RU: действие с последствиями на ДРУГОЙ машине, и оно не должно случаться по расписанию,
 * RU: пока никто не смотрит.
 * EN: The package is NOT a plugin: it is not mounted into an agent turn and does nothing on
 * EN: its own. It is two commands, invoked by hand or from a maintenance watchdog. The reason
 * EN: is simple: moving memory is an action with consequences on ANOTHER machine, and it must
 * EN: not happen on a schedule while nobody is watching.
 *
 * RU: ЧТО ЭТОТ ПАКЕТ НЕ ДЕЛАЕТ:
 * RU:   · не заменяет ночную копию базы — та возвращает машину в прежнее состояние,
 * RU:     а вывоз переносит смысл туда, где схема и номера чужие;
 * RU:   · не сливает знания и не разрешает противоречий между машинами;
 * RU:   · не судит о правдивости записи — только о том, нет ли в ней секрета.
 * EN: WHAT THIS PACKAGE DOES NOT DO:
 * EN:   · it does not replace the nightly database backup — the backup returns the machine
 * EN:     to a previous state, while export carries meaning to a place where the schema and
 * EN:     record numbers are foreign;
 * EN:   · it does not merge knowledge or resolve contradictions between machines;
 * EN:   · it does not judge whether a record is true — only whether it contains a secret.
 *
 * RU: Точка входа пакета (package.json: main и exports "."). Ниже — только повторный
 * RU: экспорт; своей логики в этом файле нет.
 * EN: Package entry point (package.json: main and exports "."). Below are re-exports only;
 * EN: this file has no logic of its own.
 */
// RU: vyvezti (async) — вывоз записей из базы в файл JSONL с заголовком (без fajl — только отчёт); otchyot — отчёт о вывозе словами.
// EN: vyvezti (async) — exports records from a database into a JSONL file with a header (without fajl — report only); otchyot — export report in words.
export { vyvezti, otchyot } from './vyvoz.js';
// RU: vvezti (async) — ввоз файла вывоза в базу (заголовок проверяется, сумма — если есть в заголовке); otchyot_vvoza — отчёт о ввозе словами.
// EN: vvezti (async) — imports an export file into a database (header verified, checksum — if present in the header); otchyot_vvoza — import report in words.
export { vvezti, otchyot_vvoza } from './vvoz.js';
// RU: Схема файла: версия, переносимые поля, карта непереносимого с причинами, класс отказа схемы.
// RU: Прочие функции shema.js (zagolovok, proverit_zagolovok, summa_soderzhimogo и др.) наружу не выставлены.
// EN: File schema: version, transferred fields, map of non-transferred fields with reasons, schema refusal class.
// EN: Other shema.js functions (zagolovok, proverit_zagolovok, summa_soderzhimogo, etc.) are not exposed.
export { VERSIYA_SHEMY, POLYA, NE_VYVOZITSYA, OtkazShemy } from './shema.js';
// RU: Договор с ядром памяти: vzyat_filtr (async) — загрузка фильтра секретов ядра с проверкой договора;
// RU: reshenie — решение вывоза о записи; OtkazDogovora — класс отказа договора; IMYA_YADRA — имя пакета ядра.
// EN: Contract with the memory core: vzyat_filtr (async) — loads the core's secret filter and checks the contract;
// EN: reshenie — export decision for a record; OtkazDogovora — contract refusal class; IMYA_YADRA — core package name.
export { vzyat_filtr, reshenie, OtkazDogovora, IMYA_YADRA } from './yadro.js';
