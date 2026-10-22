# Узкое обновление: коммит до монтажа, метка после

Наряды Забавы AP-011-UZKIJ-UPDATER и дополнение21:18:54Z. Рука окна — Забава/root после ворот; метку выпуска ставит назначенная ведущая дерева. Три объекта updater: новая полка, manifest, запись dsh-autopilot. Runtime/release/current, службы, NSS, ключ и install-lock не пишутся. install.sh, модель и Autopilot не вызываются. Метку updater не создаёт и не удаляет.

## Данные schema4

Закрытый на запись root-owned JSON: root, old_head, new_head, **metadata_head**, core_file_count, manifest_before_sha256, manifest_after_sha256, core_source, manifest_source, before_entry_sha256, after_entry, task, actor. Старые schema1/2/3 отказывают. old_head/new_head/metadata_head — полные40hex; SHA manifest/записи —64hex; core_file_count —integer1..1024, неbool. Нет значений по умолчанию или вычисления before-пина из текущего live.

new_head задаёт только имя/состав CORE-полки `/opt/autopilot/packages/<new_head>`. metadata_head — принятый полный SHA metadata-коммита, содержащего CORE и generated manifest; это будущая цель метки. Они могут различаться: manifest коммитят после CORE. Манифест в дереве — рука Искры. Код не зашивает конкретные головы/суммы. PARAMS после начала окна не менять: STATE хранит его полную SHA.

До первого действия проверяются отсутствие полки/SAVE, старые manifest/запись, источники, число/имена/режимы/SHA CORE и каждый публикуемый байт **по Git-блобам metadata_head**, включая manifest. CORE дополнительно сверяется с new_head. Неизвестный коммит, искажённый source или blob≠source — STOP2 до SAVE/MO. Ссылок refs/tags в предпроверке байтов нет, готовая метка не требуется.

Дополнение Забавы21:35:04Z: `git merge-base --is-ancestor new_head metadata_head` должен доказать родство. По уточнению Забавы22:29:08Z diff двух коммитов ограничен `-- <subdir>`: внутри пакета разрешены только `checks/layout-expected.json` и `tools/*`; переименование/удаление и смена mode CORE тоже считаются изменением. Иной путь ВНУТРИ пакета или недоказанное родство — STOP2 до SAVE/MO. Изменения других пакетов и корня monorepo этим updater не судятся; они остаются под своими метками/обходом. Пин называется metadata_head, schema3/source_commit из132c35cf больше не принимается; автоматической миграции PARAMS/STATE нет.

## Порядок одного окна

1. Ведущая держит внешний LOCK всего операторского окна, например операторский сеанс под `flock -n /run/lock/autopilot-okno.lock bash`. Его не путать с SAVE/LOCK: каждый вызов updater берёт SAVE/LOCK без ожидания, а между вызовами процессный lock освобождён. Внешний LOCK и запрет соседних окон держит координатор до finish/возврата. Сам updater чужие окна и службы не запирает.
2. apply без --v-boj — проверка, без SAVE/window. apply --v-boj проверяет пины, создаёт постоянный root0700 SAVE с before/after/планами, открывает одно MO TTL1800с, пишет registry через pravka/CAS и файлы SMF по mode0644/0755 (новые --novyj, один ID). В конце сохраняет **awaiting_tag** и выдаёт **PUBLISHED**, код0. Это успешная публикация трёх объектов, **окно ещё не закрыто**. Автоматической метки/ожидания в цикле нет.
3. Сразу check-rollback (только чтение) должен сказать «сходится». Он и rollback доступны без метки. Назначенная рука выпуска после монтажа проходит vypusk-tegom и ставит dsh-autopilot-v0.1.1 **на тот же metadata_head**; дерево выпуска обязано соответствовать ему. Код/ветку/пины в процессе не менять.
4. finish без --v-boj — только проверка полных файлов/записи и точной цели метки. finish --v-boj делает то же, затем строгий montazh-okno zakryt того же ID, STATE.closed и **UPDATE-OK**. Метка на иной коммит, даже с тем же деревом, не принимается. Native MO имеет собственную read-only tag-проверку commit и recheck перед закрытием: tag не включён в изменяемые subjects и не удаляется откатом.
5. Только после принятого закрытия — дальнейшие разрешённые операторские действия. Внешний LOCK снимает ведущая. Не помещать ожидание неизвестной длительности внутрь MO: finish должен состояться до1800с; если выпуск не помещается — остановить прямой ход и выполнить принятый возврат. Просроченное окно — отдельный разбор ведущей.

```sh
python3 -I -B tools/update-polka-011.py --params /ABS/PARAMS.json --save /var/backups/montazh/AP011-ID apply
python3 -I -B tools/update-polka-011.py --params /ABS/PARAMS.json --save /var/backups/montazh/AP011-ID apply --v-boj
python3 -I -B tools/update-polka-011.py --params /ABS/PARAMS.json --save /var/backups/montazh/AP011-ID check-rollback
# После публикации назначенная рука ставит метку на PARAMS.metadata_head.
python3 -I -B tools/update-polka-011.py --params /ABS/PARAMS.json --save /var/backups/montazh/AP011-ID finish
python3 -I -B tools/update-polka-011.py --params /ABS/PARAMS.json --save /var/backups/montazh/AP011-ID finish --v-boj
python3 -I -B tools/update-polka-011.py --params /ABS/PARAMS.json --save /var/backups/montazh/AP011-ID rollback --v-boj
```

finish отказывается, если публикация неполна, STATE/PARAMS сдвинулись, метки нет или она не на metadata_head; before-action failures не меняют файлы/SAVE/MO. Старая prepared-фаза не finish-ится. active после обрыва разрешена только при полном совпадении файлов/записи и правильной метке. Повтор apply с existing SAVE запрещён. Незнакомые --check/--dry-run/-n —STOP2; check-rollback не принимает --v-boj.

## Возврат и границы

Возврат сначала сверяет весь состав: manifest∈{before,after}, metadata, запись∈{до,после}, нет чужого в полке, страховки/планы/пины верны. Иное —STOP2 до первого действия. Запись возвращается pravka/CAS, чужие записи/comments сохраняются; manifest — разрешённым09:05Z atomic recovery из SAVE; новая полка rename в SAVE/quarantine; затем otkat-proveren с прежними subjects. Forward tag-check — только условие закрытия, inverse не требует метку и не делает tag-действий. Если метка уже создана, она остаётся историей выпуска. Автор и коммиттер SMF/pravka берутся из actor, не из унаследованной чужой подписи.

Между возвратом реестра и manifest installed_check краснеет — ожидаемо; обход/сторож раскладки в окно не пускать. Согласование запусков — координатор; updater службы не трогает. Manifest заменяется rename в том же каталоге, layout-check читает один FD/bytes; registry+manifest не являются атомарной парой. Простой Мастера не требуется по решению координатора.

Обрыв между mkdir SAVE и первым state.json — ручной путь: процесс завершён, LOCK свободен, по task/subjects нет MO, живое=до. Только после сверок убрать частичный SAVE с рабочего пути, сохранив в карантине. Неизвестность —STOP. State пишется перед открытием MO. Реальный возврат требует исходного MO receipt (terminal cleanup86400с), иначе ручной разбор; уже принятый возврат даёт read-only «нечего» без receipt.

Произвольный SIGKILL/носитель/concurrent root вне LOCK — отдельные границы, неизвестные .smf-* не усваиваются. Git-read≤20с; остальные команды≤120с, пишущий SMF≤360с при его lock-wait300с; таймаут убивает группу. Git с --no-optional-locks, чужого root status нет. Метки, публикации наружу и изменения служб вне updater.

Стенд test-update-polka-011.py: настоящий SMF/MO/pravka внутри bwrap host-ro, writable только fixture/tmp/backups; logger — заглушка. AP011_ASSETS: before-manifest/entry, after-manifest, core/, package/, core-head.txt, проверенные git-objects. Fixture сначала БЕЗ tag: apply/check/rollback работают; positive flow создаёт tag отдельно после apply и finish закрывает то же MO. Unknown metadata_head и blob mismatch —STOP до действий; same-tree wrong commit отвергается updater и отдельно nativeMO. NSS/ключ синтетические; inode/mtime/ctime не сравниваются. Busy-flock dependency wait300→1с; Git timeout моделируется отдельно. Evidence каталог новый.

Старые указатели плана: ap_new_file —obshchee42, existing STOP49–50, здесь не вызывается. Полного updater/путиА01–06 и путиБ нет.
