# Неполадки · Troubleshooting — dsh-vypusk-watch

Каждый раздел: что видно → почему → что делать. Тексты вывода сторож печатает по-русски; ниже они приведены дословно, с переводом.

Each section: symptom → cause → fix. The watchdog prints its output in Russian; it is quoted verbatim below, with a translation.

## Код 2 и строка `СЛЕПОТА: …` · Exit 2 and `СЛЕПОТА: …`

Слепота значит «проверка не состоялась»: годность выпуска не установлена ни в какую сторону. Это не зелёное. Причина названа после двоеточия.

Blindness means "the check did not happen": release health is not established either way. It is not green. The cause follows the colon.

| Причина в выводе · Cause in output | Почему · Why | Что делать · Fix |
|---|---|---|
| `не задана настройка VYPUSK_<ИМЯ>` · setting not set | у службы нет файла окружения или в нём пропала строка; для «пусто = выкл» нужна строка `VYPUSK_<ИМЯ>=` с пустым значением · the unit has no environment file or a line is missing from it; for "empty = off" a line `VYPUSK_<NAME>=` with an empty value is required | дописать строку в файл окружения (см. [SETTINGS.md](SETTINGS.md)) · add the line to the environment file (see [SETTINGS.md](SETTINGS.md)) |
| `не задана ни VYPUSK_AGENT_KORNI, ни VYPUSK_AGENT_POISK` · neither is set | нечем найти корни копий агентов · nothing to find agent copy roots with | задать одну из двух; пустое `VYPUSK_AGENT_KORNI=` выключает добавочные корни · set one of the two; an empty `VYPUSK_AGENT_KORNI=` disables extra roots |
| `дерева нет: <путь>` · no tree | в `VYPUSK_REPO` нет каталога `.git` · `VYPUSK_REPO` has no `.git` | задать верный путь к дереву с метками · point it at the tagged tree |
| `каталогов пакетов 0 в <дерево>/packages` · zero package dirs | раскладка дерева не `packages/<каталог>` или нет прав чтения · tree layout is not `packages/<dir>` or no read access | проверить раскладку и права · check layout and permissions |
| `нечитаемых корней N — область поиска копий неполна` · N unreadable roots | сторож запущен не от того пользователя или корень закрыт правами · run as the wrong user or root dir closed | запускать от пользователя с правом чтения всех корней (у авторов — root) · run as a user that can read every root (root for the authors) |
| `исключения CHANGELOG не прочитаны: <файл>` · exceptions not read | битая строка или повтор ключа в списке исключений · a broken line or repeated key in the exception list | формат строки: `пакет@версия · причина · кто · ГГГГ-ММ-ДД`; один ключ — одна строка · line format as shown; one key, one line |
| `не разрешён путь <корень>/<имя>` · path not resolved | каталог пакета в корне есть, но `readlink -f` не дал пути · the package dir exists in a root but `readlink -f` returned nothing | проверить ссылки и права на пути к каталогу · check links and permissions along the path |
| `перечень корней не получен` · root list not obtained | упал обход корней (`python3` не запустился или не смог записать во временный каталог) · the root scan failed (`python3` did not start or could not write to the temp dir) | проверить `python3` и `/tmp` · check `python3` and `/tmp` |
| `нет временного места` · no temp space | `mktemp -d /tmp/…` не удался · `mktemp` failed | освободить или открыть `/tmp` · free or open `/tmp` |
| `поздняя слепота: N копий — <имена>` · late blindness | по названным копиям сверка не состоялась; причина каждой — строкой выше в выводе: имя пакета не прочиталось; каталог соответствия не существует; перечень меток не прочитан; версия боя не прочитана; меток версии боя не ровно одна (нет вовсе или две — по каталогу и по имени пакета); метка не выгрузилась; у метки нет `files` при сверке по соответствию; боевой каталог дал 0 файлов · the check did not happen for the named copies; each cause is printed above: package name unreadable; correspondence dir missing; tag list unreadable; production version unreadable; not exactly one own-version tag (none, or two — by directory and by package name); tag not extracted; tag has no `files` for a correspondence check; production dir yielded 0 files | устранить названную причину; для меток — одна метка `<каталог>-v<версия>` на коммите выпуска · fix the named cause; for tags — one `<dir>-v<version>` tag on the release commit |

Если в том же прогоне есть и расхождение, код будет 1, а не 2: расхождение важнее, его тревога уходит своим путём.

If the same run also has a divergence, the exit code is 1, not 2: the divergence takes precedence and its alarm goes its own way.

## Код 1: `разошлось` · Exit 1: diverged

**Версия та же, суммы разные.** Файл в бою правили на месте или поставили не из метки. Вывод называет файлы: «только в бою», «только в метке» или с разными суммами. Лечение — переустановить пакет из метки своей версии либо выпустить новую версию с меткой и поставить её.

**Same version, different checksums.** A production file was edited in place or installed from something other than the tag. The output lists the files: "production only", "tag only" or with different checksums. Fix: reinstall the package from its own-version tag, or release a new tagged version and install that.

**`смонтировано невыпущенное: бой=<версия>, своей метки нет`** · unreleased build installed. В бою версия, у которой нет метки, хотя другие выпуски пакета помечены. Обычно забыли поставить метку при выпуске. Поставить метку на коммит, из которого собирали бой, — только если это действительно тот коммит; иначе выпустить заново.

**`смонтировано невыпущенное: …`** — production runs a version that has no tag while other releases are tagged. Usually the tag was forgotten at release. Tag the commit production was built from — only if it really is that commit; otherwise release again.

**`версия в архиве метки X не равна версии боя Y`** · tag archive version differs. Метка своей версии указывает на коммит, где в манифесте другая версия: метку поставили не на тот коммит. Переставить метку на коммит выпуска.

**`версия в архиве метки X не равна версии боя Y`** — the own-version tag points to a commit whose manifest has a different version: the tag is on the wrong commit. Move it to the release commit.

**`версия <V> в бою, записи в CHANGELOG нет или она пуста (<где>)`** · no CHANGELOG entry. Запись о версии обязана быть и в бою, и в метке. Дописать запись и выпустить заново; если выпуск без записи осознанный — добавить строку в список исключений с причиной, кем и когда.

**No CHANGELOG entry** — the version entry must exist both in production and in the tag. Add the entry and release again; if a release without an entry is deliberate, add a line to the exception list with reason, who and when.

**`ссылки нет: …`, `ссылка уводит не туда: …`, `цель ссылки не каталог: …`** · install link missing or wrong. Ссылку из `VYPUSK_SSYLKI` удалили или переставили — например, при переустановке пакета. Восстановить ссылку на названную цель.

**Install link missing or wrong** — a link from `VYPUSK_SSYLKI` was removed or repointed, e.g. by a package reinstall. Restore the link to the named target.

## Всё зелёное, а работа не сделана · All green, but the work was not done

Сторож не отличает «смонтировали и пометили» от «не монтировали вовсе»: в обоих случаях бой равен своей метке. Строка `INFO: … выпуск X новее боя Y` — единственный след того, что новый выпуск есть, а в бой он не попал. Проверять монтаж нужно отдельно, по версии в журнале работающего процесса.

The watchdog cannot tell "installed and tagged" from "not installed at all": in both cases production equals its own tag. The line `INFO: … выпуск X новее боя Y` (release X is newer than production Y) is the only trace that a new release exists but did not reach production. Check the installation separately, by the version in the running process's journal.

## Тревога пришла один раз и больше не приходит · The alarm came once and never again

Так и задумано: та же картина повторяется не чаще раза в `VYPUSK_NAPOMINAT` секунд. В журнале каждого прогона при этом есть строка `(в бот НЕ шлю: та же картина, прошло N с из M — повтор глушится)` (not sending: same picture). Расхождение никуда не делось, пока код выхода 1.

By design: the same picture repeats no more than once per `VYPUSK_NAPOMINAT` seconds. Every run's journal still has the line `(в бот НЕ шлю: …)` (not sending: same picture). The divergence is still there as long as the exit code is 1.

Тревога слепоты подавляется отдельно, файлом `<состояние>.slepota`; строка в журнале — `повтор слепоты подавлен: …`. Файл удаляется первым прогоном без слепоты, если тихий режим не включён.

The blindness alarm is suppressed separately, by the `<state>.slepota` file; the journal line is `повтор слепоты подавлен: …`. The file is removed by the first run without blindness, unless quiet mode is on.

## Тревога не дошла · The alarm did not arrive

| В журнале · In the journal | Почему · Why | Что делать · Fix |
|---|---|---|
| `доставка … НЕ подтверждена: отправитель недоступен: <путь>` · sender unavailable | `VYPUSK_ALERT` не существует или не исполняемый · missing or not executable | указать исполняемый отправитель · point it at an executable sender |
| `доставка … НЕ подтверждена: … код 124 (ИСТЁК предел канала)` или `137` · channel limit expired | отправитель не уложился в 90 с (+5 с до SIGKILL) · sender exceeded 90 s (+5 s to SIGKILL) | разобраться с каналом; следующий прогон повторит попытку · fix the channel; the next run retries |
| `доставка … пропущена: VYPUSK_TIHO=1` · delivery skipped | тихий режим включён · quiet mode on | для боевого прогона убрать `VYPUSK_TIHO` · unset it for live runs |
| `отметка доставки … не сохранена — следующий прогон может повторить тревогу` · mark not saved | каталог файла состояния не пишется · state dir not writable | дать права на запись каталогу `VYPUSK_SOSTOYANIE` · make the state dir writable |

«Канал подтвердил доставку (код 0)» значит только, что отправитель вернул 0. Прочёл ли тревогу человек, сторож не знает и так и пишет.

"Канал подтвердил доставку (код 0)" (channel confirmed delivery) only means the sender returned 0. Whether a human read it the watchdog does not know, and says so.

## Тихий режим не включается · Quiet mode does not turn on

`VYPUSK_TIHO=да`, `yes` или `true` — не `1`: режим остаётся боевым, тревоги уходят. Тихий режим включает только точное значение `1`. Опечатку в имени переменной сторож тоже не замечает.

`VYPUSK_TIHO=да`, `yes` or `true` is not `1`: the mode stays live and alarms go out. Only the exact value `1` enables quiet mode. A typo in the variable name is not noticed either.

## Код 3: `ОТКАЗ: у сторожа нет доводов` · Exit 3: no arguments accepted

Сторож принимает только `--avto-montazh`; остальные доводы, включая `--dry-run` и позиционные, отвергаются. Всё задаётся окружением. Для пробного прогона: `VYPUSK_TIHO=1 bash vypusk-okno-watch.sh`.

The watchdog accepts only `--avto-montazh`; other arguments, including `--dry-run` and positional ones, are refused. Everything is set through the environment. For a trial run: `VYPUSK_TIHO=1 bash vypusk-okno-watch.sh`.

## Стенды · Stands

**Стенд копий выпуска: `СЛЕПОТА: не прочитана пара …`, код 2.** На машине нет установленного сторожа по пути авторов. Задать `VYPUSK_TEST_WATCH` и `VYPUSK_TEST_REFERENCE`; при подмене эталона стенд печатает `ПОДМЕНА эталона` — это проверка кандидата, а не равенство бою.

**Release-copies stand: `СЛЕПОТА: не прочитана пара …`, exit 2.** The machine has no watchdog installed at the authors' path. Set `VYPUSK_TEST_WATCH` and `VYPUSK_TEST_REFERENCE`; with an overridden reference the stand prints `ПОДМЕНА эталона` (reference overridden) — that checks a candidate, not equality with production.

**Стенд копий выпуска красный после правки `src/`.** `src/vypusk-okno-watch.sh` — побайтный снимок установленного файла, стенд сверяет их суммы. Правка снимка требует одновременного выпуска нового установленного файла.

**Release-copies stand red after editing `src/`.** `src/vypusk-okno-watch.sh` is a byte-for-byte snapshot of the installed file, and the stand compares their checksums. Editing the snapshot requires releasing a new installed file at the same time.

**Стенд договора: `mutation anchor absent or ambiguous`.** Порча стенда ищет в стороже точную строку `  METKA=${METKI[0]}`. Если её переписали, стенд не может внести порчу и падает, а не зеленеет.

**Contract stand: `mutation anchor absent or ambiguous`.** The stand's corruption looks for the exact line `  METKA=${METKI[0]}` in the watchdog. If it was rewritten, the stand cannot apply the corruption and fails instead of passing.

При одновременном расхождении и поздней слепоте код 1; слепота остаётся только в журнале, отдельная тревога слепоты не уходит. Исправление расхождения открывает ветку слепоты (код 2). Нельзя считать тревогу расхождения полным перечнем непроверенных копий.

When mismatch and late blindness coexist, exit 1 takes precedence; blindness stays in the journal only and no separate blindness alarm is sent. Resolving the mismatch exposes blindness (exit 2). A mismatch alarm is not the full list of unchecked copies.

`перечень меток не прочитан` / `метка не выгрузилась`: первая строка stderr git сохранена (до 240 байт). Для `dubious ownership` владелец дерева должен совпадать с пользователем юнита либо администратор задаёт `git config --system --add safe.directory /path/to/tree`, только для доверенного дерева. Глобальное `safe.directory=*` не нужно.

The first git stderr line (up to 240 bytes) is retained for tag-list/archive failures. For `dubious ownership`, match tree ownership to the unit user or have an administrator trust the specific tree via `git config --system --add safe.directory /path/to/tree`. Do not use `safe.directory=*`.

`--avto-montazh` включает адресную отсрочку: код 4 — «отложено», не «сошлось». Без ключа — строгий ручной прогон. Нужен `montazh-okno` из `dsh-montazh`; предел пересъёма — один. Подробные границы — в ARCHITECTURE.md, «Автоматическая отсрочка».

`--avto-montazh` enables addressed deferral: exit 4 means deferred, not matched. Without the flag the manual run stays strict. Requires `montazh-okno` from `dsh-montazh`; at most one resample. See ARCHITECTURE.md, “Automatic deferral”, for its boundaries.
