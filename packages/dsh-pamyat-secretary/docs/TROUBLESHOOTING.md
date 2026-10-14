# От признака к причине · From symptom to cause

| Признак · Symptom | Проверка · Evidence | Действие · Action |
|---|---|---|
| Сводка есть, знаний нет · Summary but no knowledge | distillyaciya/выключающий файл/readiness/маска · Enable/switch/readiness/mask | Развести два потока, не считать сводку извлечением · Separate flows, summary is not extraction |
| Плагин не загрузился · Plugin unavailable | `inject: [pamyat]`, версия ядра и схемы · Core dependency/version/schema | Подключить ядро в профиль и проверить службу · Load and verify core |
| Ключ задан, не получен · Configured key missing | Приоритет файл/pass/env и окружение процесса · Source priority/process context | Исправить источник, не печатать значение · Fix provisioning without printing value |
| net-deneg / HTTP 402 | Отказ провайдера · Provider response | Проверить счёт провайдера, не повторять вызов для каждой статьи · Resolve balance, avoid repeated article failures |
| klyuch-ne-prinyat | 401/403/роль · Auth/role | Проверить ключ и роль принятым способом · Verify key/role through approved procedure |
| ne-sprosili / timeout | Временный исход и число попыток · Transient class/attempt count | Проверить исчерпание 3 попыток; не объявлять срез пустым · Inspect retry exhaustion, not an empty slice |
| ne-dochitala | stop_reason, max_tokens, textblock · Output stop/cap/text | Проверить бюджет и маркер; проверить statya-oborvana и повтор после восстановления · Check budget/marker, check statya-oborvana and retry after recovery |
| proza вместо списка · Prose, not topics | Сохранённый ответ и разбор JSON · Saved response/parser | Ручной разбор, не считать результат нулём тем · Inspect rather than assuming zero topics |
| net-maski | Ядро и метод маски · Core mask method | Подключить совместимое ядро; не обходить проверку · Load compatible core, retain guard |
| zahod-uzhe-byl | Ключ среза и активный процесс · Slice key/live process | Устранить второго вызывающего, не удалять все следы · Remove duplicate caller, not all history |
| Прерванный разбор · Interrupted run | PID/маркер/срез/записано · PID/marker/slice/saved count | Ноль счётчика окон 1–64 допускает retry, но за этой областью запись не измерена; partial/unknown требует руки · Window 1–64 zero count admits retry but later windows are unmeasured; partial/unknown needs an operator |
| Ходовой зов молчит · Turn trigger quiet | DSH_HOME, events, threshold, live marker, pauseDo | Проверить событие и объём, не менять порог наугад · Check event/size, avoid guessing thresholds |
| Вода не записана · Water not persisted | Права, rename и каталог · Permissions/rename/directory | Исправить сохранение воды; следующее событие может взять то же окно · Fix persistence, repeated window possible |
| Исключённая сессия пишет память · Isolated session writes | Метод исключения ядра и префикс id · Core exclusion method/session prefix | Проверить всех вызывающих до включения источника · Verify consumers before source admission |

Статья, признанная повтором (файл `povtoryaet-*` в `putOtklonennyh`), возвращается скриптом `pamyat-vernut-povtor` из соседнего пакета `dsh-pamyat-storozha` (`bin/pamyat-vernut-povtor`, в бою `/usr/local/bin/pamyat-vernut-povtor`; команда — в шапке файла). Без `dsh-pamyat-storozha` возврат невозможен; стенд `stend-povtora-suda` берёт скрипт из `STEND_VERNUT`, иначе из `/usr/local/bin`, и без файла слеп (код 2).

An article judged a repeat (a `povtoryaet-*` file in `putOtklonennyh`) is restored by the `pamyat-vernut-povtor` script from the sibling package `dsh-pamyat-storozha` (`bin/pamyat-vernut-povtor`, in production `/usr/local/bin/pamyat-vernut-povtor`; the command is in the file header). Without `dsh-pamyat-storozha` it cannot be restored; the `stend-povtora-suda` stand takes the script from `STEND_VERNUT`, otherwise from `/usr/local/bin`, and is blind without the file (exit 2).

`/distill-srez` с da может вызвать платный API и записать знания; без da цена проверяется без модели, но может закрыться уже обработанное задание. Сначала прочти отчёт среза, уже записанное по источнику и причину задания; повтор частично обработанного среза должен учитывать границу дублей.

`/distill-srez` with da may call a paid API and write knowledge; without da it estimates without a model call, but may close an already processed task. Inspect the slice report, already-saved source records and task reason first; repeating partially processed material must account for duplication risk.

Отключающие файлы проверяются в момент вызова, профильные boolean — в текущем экземпляре плагина. Не выдавай смену файла исходника за смену загруженного кода: после обновления нужен согласованный перезапуск/перезагрузка, затем фактический след версии и нового вызова.

Disable files are checked at invocation time, while profile booleans belong to the current plugin instance. Replacing a source file is not proof of loaded-code replacement: use a controlled restart/reload, then verify the version trace and an actual call.

Сохраняй адрес пакета, версию, срез/seq, число тем и поимённые исходы, usage и причину без секретов. Маска и счётчики не заменяют фактическое знание в SQLite: проверяй его отдельным чтением по ключу источника.

Retain package/version, slice/seq, topic count and classified results, usage and sanitized reasons. Masking and counters do not replace a realSQLite record: independently retrieve it by its source key.

Повреждённый/нечитаемый файл воды или негодная запись сессии дают otkaz-vody до вызова модели. Только ENOENT допускает первое состояние; удаление всей воды между перезапусками неотличимо от первого запуска и этой проверкой не доказуемо. При отказе сохранения итог voda-ne-sohranena, первичные байты не изменены, строка «вода сдвинута» не печатается. Следующее событие после восстановления снова читает файл.

A corrupt/unreadable watermark file or invalid session entry returns otkaz-vody before model invocation. Only ENOENT permits initial state; complete deletion between restarts cannot be distinguished from first startup by this check. Save failure returns voda-ne-sohranena, leaves primary bytes unchanged and prints no advancement. The next event rereads state after recovery.
