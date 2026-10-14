# Сторожа и проверки · Guards and checks — dsh-pamyat-obsluzhivanie

У пакета четыре слоя проверок: внешняя живость (heartbeat), проверки внутри каждого прогона, защитные пределы ступеней и набор тестов. Ниже для каждого — что ловит, чего не ловит, куда кричит и как читать тревогу.

The package has four layers of checks: external liveness (heartbeat), checks inside every run, protective stage limits, and the test suite. For each: what it catches, what it misses, where it reports and how to read the alarm.

## Внешний heartbeat · External heartbeat

**Кто зовёт и кто читает.** Сторож машины (отдельный скрипт, не в пакете) каждые 10 минут запускает root-копию `heartbeat.py` и шлёт групповую тревогу при смене состояния, с напоминанием раз в 6 часов; возврат к норме снимает тревогу. Сам heartbeat ничего не пишет и никому не шлёт — он только отвечает кодом и строкой.

**Who calls and who reads.** The machine watchdog (a separate script, not in the package) runs the root copy of `heartbeat.py` every 10 minutes and raises a group alarm on a state change, with a reminder every 6 hours; a return to normal clears the alarm. Heartbeat itself writes nothing and sends nothing — it only answers with a code and a line.

| Код · Code | Строка · Line | Значит · Meaning |
|---|---|---|
| 0 | `heartbeat: completed <run_id>` | последний плановый прогон завершён (`ok`/`finding`) и доставлен · the last scheduled run finished (`ok`/`finding`) and was delivered |
| 0 | `heartbeat: running <run_id>` | прогон идёт и укладывается в 60 мин + 90 с · a run is in progress within 60 min + 90 s |
| 0 | `disabled: timer masked; masked_since=…` | маска моложе 3 суток · mask younger than 3 days |
| 1 | `disabled: … limit_days=3` | маска стоит 3 суток и дольше · mask in place for 3 days or more |
| 0 | `выключено владельцем: <slovo>; кто <kto>; с <kogda>; timer masked; masked_since=…` | маска + годная запись решения `/etc/dsh-pamyat-obsluzhivanie/vyklyucheno` (root, пишет только root; поля `kto=`, `kogda=` ISO с поясом, `slovo=`) — при любом сроке маски (B-N-2028) · mask + a valid decision record, at any mask age |
| 1 | `запись решения … негодна (<причина>); …` | при маске запись есть, но ей нельзя верить: не root, пишется не только root (файл или каталог), ссылка, нет поля, дата без пояса или из будущего · a record exists but cannot be trusted |
| 1 | `запись решения … есть, а таймер <state> не замаскирован …` | запись осталась после снятия маски — снять запись или вернуть маску · the record outlived the mask |
| 1 | `heartbeat: run overdue <run_id>` | прогон висит дольше предела · a run hangs past the limit |
| 1 | `heartbeat: scheduled run missing since …` | после 02:05 UTC нет прогона, начатого после 01:00 UTC · after 02:05 UTC there is no run started after 01:00 UTC |
| 1 | `heartbeat: error delivery=…` | прогон завершился ошибкой или доставка не подтверждена · the run failed or delivery is not confirmed |
| 2 | `heartbeat: not measured (timer/state unavailable)` | таймер или `latest.json` не прочитаны, схема негодна, дата маски неизвестна или из будущего · timer or `latest.json` unreadable, bad schema, mask date unknown or in the future |

Дата маски — время изменения самой ссылки маски на `/dev/null`, а не момент первого опроса: снять и поставить маску заново — новая дата. `latest.json` читается root-ом осторожно: только обычный файл, без перехода по ссылкам, не больше 1 МиБ.

The mask date is the modification time of the mask symlink to `/dev/null` itself, not the moment of the first poll: unmasking and masking again gives a new date. Root reads `latest.json` carefully: regular file only, no symlink following, at most 1 MiB.

**Не ловит:** отказ самого сторожа машины или его канала тревоги; первый день после установки — до первого прогона heartbeat честно отвечает «не измерено».

**Misses:** a failure of the machine watchdog itself or its alarm channel; on the first day after installation, before the first run, heartbeat honestly answers "not measured".

## Проверки внутри прогона · Checks inside a run

| Проверка · Check | Ловит · Catches | Не ловит · Misses |
|---|---|---|
| счёт памяти (ступень 1) · memory count (stage 1) | расхождение журнала ядра и числа строк базы по агенту; недоступную базу или отсечку · divergence between the core journal and the row count per agent; an unreachable DB or cutoff | компенсацию удаления вставкой, правку тела без смены числа, потерю строки вместе с отметкой, согласованную подмену отсечки, состояние OMEGA · delete-insert compensation, body edits without count change, row lost together with its mark, coordinated cutoff swap, OMEGA state |
| целостность уроков (ступень 5) · lesson integrity (stage 5) | дубли `source_key` в OMEGA, локальные дубли источника, изменённый текст, пропавшую запись или вектор по каждой квитанции · duplicate `source_key` in OMEGA, local source duplicates, changed text, a missing record or vector per receipt | записи, о которых нет квитанции (их не писал этот пакет) · records without a receipt (not written by this package) |
| аудит очереди судьи · judge queue audit | нечитаемое или чужой схемы `judge/state.json` · unreadable or wrong-schema `judge/state.json` | правильность самих вердиктов · correctness of the verdicts themselves |
| рост очереди · queue growth | очередь росла три дня подряд и растёт сегодня · the queue grew three days running and grows today | рост медленнее суточного шага · growth slower than one step a day |

Все эти признаки входят в одну строку итога и в JSON отчёта прогона. Отдельных писем у ступеней нет: исправная проверка тревоги не создаёт.

All these signs go into the single summary line and the run report JSON. Stages send no separate messages: a passing check creates no alarm.

## Защитные пределы ступеней · Protective stage limits

**Судья.**
- Пары с признаком секрета модели не отдаются никогда. Признак — ограниченный набор шаблонов: ключи `sk-…`, `ghp_…`, `AIza…`, закрытые ключи, `password=`/`пароль`, `passphrase`, `Bearer`. Это не детектор всех секретов: что не совпало с шаблоном, уйдёт модели.
- Пары длиннее 16 000 байт модели тоже не отдаются.
- Не больше 500 вызовов за сутки UTC (`MAX_CALLS`); вызов резервируется до отправки и сохраняется, так что рестарт или ручной повтор лимит не обнуляют.
- Ответ модели принимается, только если он полный (`finish_reason=stop`), не больше 1 МиБ и содержит вердикт из трёх допустимых.

**Judge.**
- Pairs with a secret pattern are never sent to the model. The pattern is a limited set: `sk-…`, `ghp_…`, `AIza…` keys, private keys, `password=`/`пароль`, `passphrase`, `Bearer`. It is not a detector of all secrets: anything that does not match goes to the model.
- Pairs longer than 16,000 bytes are not sent either.
- At most 500 calls per UTC day (`MAX_CALLS`); a call is reserved before sending and saved, so a restart or manual repeat does not reset the limit.
- A model answer is accepted only if complete (`finish_reason=stop`), at most 1 MiB, and holding one of the three allowed verdicts.

**Уроки.**
- Закрепляется хэш уже прочитанного начала файла: правка старого текста даёт `source_rewritten`, и новые блоки из этого файла не берутся до решения человека.
- Сумма файла хранилища OMEGA (`_store.py`) закреплена в `REVIEW_STORE_SHA`: другая редакция — отказ писать, потому что поведение записи проверялось на конкретной.
- Вектор проверяется до записи: длина 1024, конечные числа, не нулевой; деградированный или отсутствующий движок векторов — отказ до любой постоянной записи.
- После записи — повторное чтение: текст, корень, ключ источника, тип, активность, срок жизни и строка вектора.

**Lessons.**
- The hash of the already-read file prefix is pinned: editing old text gives `source_rewritten`, and no new blocks are taken from that file until a human decides.
- The checksum of the OMEGA store file (`_store.py`) is pinned in `REVIEW_STORE_SHA`: another version means refusal to write, because write behaviour was verified on that specific one.
- The vector is checked before writing: length 1024, finite numbers, non-zero; a degraded or missing embedding backend means refusal before any persistent write.
- After writing — a read-back: text, root, source key, type, active flag, TTL and the vector row.

**Чистка.**
- Сухая по умолчанию.
- В боевом режиме сначала страховка `sqlite backup`, проверенная восстановлением (`integrity_check`, число строк, текст каждого кандидата в копии).
- Затем одна транзакция `BEGIN IMMEDIATE` — тот же замок записи, что у ядра. Внутри неё каждое условие перепроверяется по снимку OMEGA, снятому уже под замком.
- Не больше 500 стираний за проход. База занята — агент пропускается.

**Cleanup.**
- Dry by default.
- In real mode, first a `sqlite backup` verified by restoring (`integrity_check`, row count, the text of every candidate in the copy).
- Then one `BEGIN IMMEDIATE` transaction — the same write lock the core uses. Inside it every condition is re-checked against an OMEGA snapshot taken under the lock.
- At most 500 erasures per pass. A busy database skips the agent.

<a id="prosmotreno"></a>
## Ручная отметка «просмотрено человеком» · Manual "reviewed by a human" mark

Пары с секретом и длинные без решения человека давали бы `finding` каждую ночь. Человек смотрит пару и ставит отметку:

Pairs with secrets and over-long pairs would give `finding` every night without a human decision. A human looks at the pair and marks it:

```bash
sudo -u omega <python-окружения-OMEGA · OMEGA-env-python> -B src/prosmotreno.py spisok
sudo -u omega <python-окружения-OMEGA · OMEGA-env-python> -B src/prosmotreno.py otmetit <ключ · key> <кто · who> <почему · why>
sudo -u omega <python-окружения-OMEGA · OMEGA-env-python> -B src/prosmotreno.py snyat   <ключ · key> <кто · who> <почему · why>
```

`spisok` печатает ключ, идентификаторы обеих записей, размер и признаки — текстов памяти не печатает. Ключ пары — sha256 от идентификаторов, текстов и корней обеих записей: правка любой записи делает отметку недействующей сама. Отмечено ровно то, что человек видел.

`spisok` prints the key, both record ids, size and flags — it does not print memory texts. The pair key is a sha256 of both records' ids, texts and roots: editing either record invalidates the mark by itself. Exactly what the human saw is marked.

## Коды возврата runner · runner exit codes

| Код · Code | Статус · Status |
|---|---|
| 0 | `ok`, `finding`, `disabled` (маска · mask) |
| 1 | `error`, `timeout` |
| 2 | доставка неизвестна (поверх любого статуса) · delivery unknown (over any status) |
| 3 | `busy` — замок держит другой прогон · another run holds the lock |

## Как читать строку итога · How to read the summary line

Строка одна на прогон и перечисляет: статус; судья — разобрано, очередь и сохранённый остаток, вызовов из `MAX_CALLS`, рост очереди, секретных, длинных, просмотрено, без векторов; уроки — новые локально, подтверждено в OMEGA, ранее, отказов и причина; дубли `source_key` и ошибки квитанций; чистка — режим, «снял бы», стёрто, слепота; счёт памяти — баз X/N, расхождений; путь к полному отчёту. Слово «не измерено» вместо числа — ступень не дала числа, это не ноль.

One line per run lists: status; judge — reviewed, queue and saved remainder, calls out of `MAX_CALLS`, queue growth, secret, over-long, reviewed by human, without vectors; lessons — new locally, confirmed in OMEGA, earlier, refusals and reason; `source_key` duplicates and receipt errors; cleanup — mode, "would remove", erased, blindness; memory count — DBs X/N, divergences; path to the full report. The words "не измерено" (not measured) instead of a number mean the stage gave no number — it is not zero.

## Набор тестов · Test suite

`npm test` запускает `test/stend-obsluzhivaniya.mjs`: тот проверяет Python окружения OMEGA с `numpy` и `sqlite_vec` (нет — код 2, «СЛЕПОТА») и гонит Python unittest — 142 тестов. Модель, доставка, базы и ключи подставные; боевые базы тестам не нужны.

`npm test` runs `test/stend-obsluzhivaniya.mjs`: it checks the OMEGA env Python with `numpy` and `sqlite_vec` (missing — exit 2, "СЛЕПОТА" = blindness) and runs Python unittest — 142 tests. The model, delivery, databases and keys are stubs; no live databases are needed.

| Файл · File | Тестов · Tests | Что проверяет · What it checks |
|---|---|---|
| `test_bez_svyazi.py` | 3 | уроки без связи, «не измерено», отказ доставки тревоги · unlinked lessons, unmeasured counts, alert delivery refusal |
| `test_credentials.py` | 2 | дата маски по настоящей ссылке; модель читает ключ без root и runuser · mask date from a real link; the model reads the key without root or runuser |
| `test_integration.py` | 4 | бюджет судьи и повтор, резерв вызова при пределе времени, два одновременных старта — один работник, отказ уроков не останавливает судью · judge budget and repeat, call reservation on timeout, two simultaneous starts — one worker, a lesson refusal does not stop the judge |
| `test_judge.py` | 28 | пары, очередь, лимит вызовов, секреты, длинные пары, отчёты · pairs, queue, call limit, secrets, over-long pairs, reports |
| `test_lessons.py` | 15 | разбор блоков, закрепление начала, запись в обе памяти, пометка гостя · block parsing, prefix pinning, writes to both memories, guest mark |
| `test_local_lessons.py` | 3 | длинный кириллический текст, предел ввода, короткий текст · long Cyrillic text, input limit, short text |
| `test_memory_count.py` | 9 | счёт памяти, охват, находка, только чтение · memory count, coverage, finding, read-only |
| `test_nastrojki_mashiny.py` | 5 | реестр и источник ключа — из настроек машины, без них отказ с именем; имя узла из системы · registry and key source come from machine settings, a named refusal without them; node name from the system |
| `test_nedelya.py` | 15 | недельная выдача, секреты, части сообщения и отказ доставки · weekly reports, secrets, message parts and delivery refusal |
| `test_oshibki_modeli.py` | 5 | доля ошибок модели, ошибка журнала и строка итога · model failure ratio, journal error and summary |
| `test_reshenie_vyklyucheniya.py` | 7 | запись решения «выключено владельцем»: маска + запись, без записи, запись без маски, негодная запись, возврат (B-N-2028) · owner decision record: mask + record, none, record without mask, invalid record, removal |
| `test_prosmotreno.py` | 6 | отметки человека и граница шаблона `sk-` · human marks and the `sk-` pattern boundary |
| `test_root_reader.py` | 2 | root отвергает слишком большой `latest.json` до разбора, ссылку и FIFO · root refuses an over-large `latest.json` before parsing, a symlink and a FIFO |
| `test_runner.py` | 11 | ступени, маска, замок, статусы и доставка · stages, mask, lock, statuses and delivery |
| `test_sboi_nochej.py` | 9 | цепочки сбоев, отсрочка пары, пропуск дня и очистка состояния · failure sequences, pair deferral, skipped days and state cleanup |
| `test_store_fixture.py` | 2 | сумма закреплённой фикстуры и отказ Writer до открытия базы · pinned fixture hash and Writer refusal before opening the database |
| `test_svyaz_omega.py` | 4 | связь урока с OMEGA, восстановление, повтор и конфликт · OMEGA lesson links, recovery, repeats and conflicts |
| `test_svyazat_zadnim.py` | 8 | ручная связка, откат, живая служба и неизвестный ввод · manual linking, rollback, live service and unknown input |
| `test_zamok_povtor.py` | 4 | занятая база, предел повторов и возврат после отказа · busy database, retry limit and recovery after refusal |

Отдельно, только в одноразовом пространстве имён и вручную: `test/proba-root-paths.sh` и `test/security-root.py` проверяют, что root-помощники не исполняют код из каталогов, доступных на запись не-root. Положительный контроль: подложенные файлы действительно исполняются старым путём, но не новым root-помощником. На боевой машине их не запускать — скрипт сам отказывает вне отдельного пространства имён.

Separately, only in a disposable namespace and by hand: `test/proba-root-paths.sh` and `test/security-root.py` check that the root helpers do not execute code from directories writable by non-root. Positive control: the planted files really execute via the old path, but not via the new root helper. Do not run them on a live machine — the script refuses outside a separate namespace by itself.

**Не ловит:** тесты счёта памяти требуют `dsh-pamyat-core`, найденного по имени; из рабочего дерева без него 5 тестов из 9 падают (см. [TROUBLESHOOTING.md](TROUBLESHOOTING.md#t1)). Внешний зовущий heartbeat (сторож машины) пакет не проверяет: его тест — часть стендов машины, а не пакета.

**Misses:** the memory-count tests need `dsh-pamyat-core` resolvable by name; from the working tree without it 5 of 9 tests fail (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#t1)). The package does not test the external heartbeat caller (the machine watchdog): that test belongs to the machine's benches, not to the package.

Полнота набора: 19 файлов, 142 метода. Модуль omega нужен тесту reader_does_not_block_actual_v1_writer и новой проверке Store hash; без него это слепота среды, не приемка. Фикстура совпадает с REVIEW_STORE_SHA. Версия Python 3.12+; Python 3.11 этим стендом не заявлена.

Suite completeness: 19 files, 142 methods. The omega module is required by the actual V1 writer-reader probe and the new Store hash refusal; missing it is environment blindness. The fixture equals REVIEW_STORE_SHA. Python 3.12+ is required, not 3.11.
