# Неполадки · Troubleshooting — dsh-pamyat-obsluzhivanie

Записи — из реальной истории службы: признак → причина → лечение. Первым делом смотрите `latest.json` в каталоге состояния: поле `status`, поле `delivery` и `reason` у ступеней.

Entries come from the service's real history: symptom → cause → fix. First look at `latest.json` in the state directory: the `status` field, the `delivery` field and each stage's `reason`.

## Сводка · Summary

| Признак · Symptom | Раздел · Section |
|---|---|
| из рабочего дерева 5 тестов счёта памяти падают · from the working tree 5 memory-count tests fail | [1](#t1) |
| уроки не переносятся: `omega_store_hash_mismatch` · lessons not transferred | [2](#t2) |
| `source_rewritten` у файла уроков · on a lesson file | [3](#t3) |
| `writer_uid_not_omega` при ручном запуске · on a manual run | [4](#t4) |
| `finding` каждую ночь из-за секретных или длинных пар · every night due to secret or over-long pairs | [5](#t5) |
| счёт памяти: «РАСХОЖДЕНИЕ … новое N» после намеренного удаления · after an intentional deletion | [6](#t6) |
| чистка: `slepota` у агента · cleanup: `slepota` for an agent | [7](#t7) |
| `delivery=unknown`, код 2 · exit 2 | [8](#t8) |
| heartbeat: «scheduled run missing» или «not measured» | [9](#t9) |
| служба убита по памяти при первом векторе · service killed for memory on the first embedding | [10](#t10) |
| судья: `invalid credential` · judge | [11](#t11) |
| `busy`, код 3 · exit 3 | [12](#t12) |

<a id="t1"></a>
## 1. Из рабочего дерева 5 тестов счёта памяти падают · From the working tree 5 memory-count tests fail

**Признак.** Набор содержит 18 файлов/135 методов, но тесты счёта/локальных уроков отказывают без dsh-pamyat-core или проба настоящего V1 writer не импортирует omega.

**Symptom.** The 18-file/135-method suite cannot run memory count/local lessons without dsh-pamyat-core, or the actual V1 writer cannot import omega.

**Причина.** Стенду нужны Python 3.12+, numpy/sqlite_vec/PyYAML и копия OMEGA, а Node должен находить ядро и его peer-зависимости. Ядро не объявлено зависимостью этого пакета. Число упавших методов зависит от недостающей части; не считать ошибку среды доказательством поломки памяти.

**Cause.** The stand requires Python 3.12+, numpy/sqlite_vec/PyYAML and a copy of OMEGA; Node must resolve the core and its peer dependencies. This package does not declare the core dependency. The failure count depends on what is missing and is not proof of a memory failure.

**Лечение.** На отдельной копии подготовить полную раскладку, затем выполнить весь стенд. Живые модели не нужны: вызовы/векторы/базы в тестах подставные. reader_does_not_block_actual_v1_writer выполняет только закреплённую fixture-редакцию на временной базе. Не подменять этот тест заглушкой или пропуском ради числа.

**Fix.** Prepare a complete isolated layout and run the entire stand. No live model is required: calls/vectors/DBs are fixtures. The actual V1 reader-writer test executes only the pinned frozen store on a temporary DB. Do not mock away or skip that test just to improve the total.

<a id="t2"></a>
## 2. Уроки не переносятся: `omega_store_hash_mismatch` · Lessons not transferred: `omega_store_hash_mismatch`

**Признак.** У ступени уроков отказ `omega_store_hash_mismatch`, `OMEGA подтверждено=0`, хотя файлы уроков растут.

**Symptom.** The lesson stage refuses with `omega_store_hash_mismatch`, `OMEGA подтверждено=0` (confirmed in OMEGA = 0), although the lesson files grow.

**Причина.** Писатель уроков закрепляет сумму файла хранилища OMEGA (`REVIEW_STORE_SHA`) и отказывается писать в другую редакцию. Так бывало трижды: после местной правки дедупликации в OMEGA, после повторного переноса местных правок на новую поставку и после добавления замков в хранилище. Каждый раз запись была исправна, но сумма устаревала.

**Cause.** The lesson writer pins the checksum of the OMEGA store file (`REVIEW_STORE_SHA`) and refuses to write into another version. This happened three times: after a local deduplication patch in OMEGA, after local patches were re-applied to a new delivery, and after locks were added to the store. Each time writing was fine, but the checksum went stale.

**Лечение.** Сравните новую редакцию `_store.py` с прежней: меняется ли поведение `store()` (сигнатура, дедупликация, транзакции). Только после проверки обновите закреплённую сумму отдельной правкой с приёмкой. Не отключайте проверку суммы.

**Fix.** Compare the new `_store.py` with the previous one: does `store()` behaviour change (signature, deduplication, transactions)? Only after that check, update the pinned checksum in a separate reviewed change. Do not disable the checksum check.

<a id="t3"></a>
## 3. `source_rewritten` у файла уроков · `source_rewritten` on a lesson file

**Признак.** Отказ `source_rewritten` с именем файла; новые уроки этого агента не переносятся.

**Symptom.** A `source_rewritten` refusal naming the file; this agent's new lessons are not transferred.

**Причина.** Файл уроков — только для дописывания. Кто-то поправил старый текст или вставил строку внутрь уже принятого блока, и хэш прочитанного начала разошёлся с закреплённым.

**Cause.** The lesson file is append-only. Someone edited old text or inserted a line inside an already accepted block, and the hash of the read prefix no longer matches the pinned one.

**Лечение.** Верните начало файла как было и дописывайте только в конец. Если правка старого текста нужна по делу, решение принимает человек: тогда сбрасывается закрепление этого файла в `lessons.json` (данные ступени), с пониманием, что перечитанные блоки сверятся по ключам заново.

**Fix.** Restore the file's beginning and append only at the end. If editing old text is genuinely needed, a human decides: the pin for that file in `lessons.json` (stage data) is then reset, knowing that re-read blocks will be matched by key again.

<a id="t4"></a>
## 4. `writer_uid_not_omega` при ручном запуске · `writer_uid_not_omega` on a manual run

**Признак.** Ручной запуск `runner.py` из-под своей учётки или через `sudo` даёт отказ уроков `writer_uid_not_omega`.

**Symptom.** Running `runner.py` by hand under your account or via `sudo` gives the lesson refusal `writer_uid_not_omega`.

**Причина.** Писатель уроков работает только под учётной записью `omega`, а под root служба не должна исполнять Python окружения OMEGA вовсе.

**Cause.** The lesson writer runs only as `omega`, and the service must not run the OMEGA env Python as root at all.

**Лечение.** Ручной прогон — только `sudo systemctl start dsh-pamyat-obsluzhivanie.service`.

**Fix.** A manual run is only `sudo systemctl start dsh-pamyat-obsluzhivanie.service`.

<a id="t5"></a>
## 5. `finding` каждую ночь из-за секретных или длинных пар · `finding` every night due to secret or over-long pairs

**Признак.** Итог `finding`, в строке ненулевые `секретных=` или `длинных=`, очередь не убывает.

**Symptom.** The result is `finding`, the line shows non-zero `секретных=` (secret) or `длинных=` (over-long), the queue does not shrink.

**Причина.** Такие пары модели не отдаются никогда — без решения человека они остаются в очереди и каждую ночь поднимают `finding`.

**Cause.** Such pairs are never sent to the model — without a human decision they stay in the queue and raise `finding` every night.

**Лечение.** Посмотрите пары командой `prosmotreno.py spisok` и отметьте просмотренные (`otmetit`) — см. [GUARDS.md](GUARDS.md#prosmotreno). Отметка снимает пару из счёта; правка любой из записей отметку отменяет.

**Fix.** Review the pairs with `prosmotreno.py spisok` and mark the reviewed ones (`otmetit`) — see [GUARDS.md](GUARDS.md#prosmotreno). A mark removes the pair from the count; editing either record cancels the mark.

<a id="t6"></a>
## 6. «РАСХОЖДЕНИЕ счёта памяти агента … новое N» после намеренного удаления · Memory-count divergence after an intentional deletion

**Признак.** После того как из базы агента намеренно удалили записи, счёт каждую ночь называет этого агента с ненулевой «новой разницей».

**Symptom.** After records were intentionally deleted from an agent's database, the count names this agent with a non-zero "new difference" every night.

**Причина.** Так и задумано: удаление без сдвига отсечки выглядит ровно как потеря. Ступень сама отсечку не сдвигает — иначе настоящая потеря исчезла бы из вида.

**Cause.** This is by design: a deletion without moving the cutoff looks exactly like a loss. The stage never moves the cutoff itself — otherwise a real loss would disappear from view.

**Лечение.** Если удаление намеренное и проверено, отсечку сдвигает человек средствами ядра. Не гасите ступень и не переставляйте отсечку, не убедившись, что удаление было вашим.

**Fix.** If the deletion was intentional and verified, a human moves the cutoff with the core's tools. Do not switch the stage off or reset the cutoff without making sure the deletion was yours.

<a id="t7"></a>
## 7. Чистка: `slepota` у агента · Cleanup: `slepota` for an agent

**Признак.** В отчёте чистки у агента `status: slepota` и причина, общий статус `finding`.

**Symptom.** The cleanup report shows `status: slepota` (blindness) with a reason for an agent; the overall status is `finding`.

**Причина.** Ступень не берётся решать, когда не знает условий: `yadro_bez_metki_vychishcheno` — ядро агента старше нужного и не имеет поля отметки вычистки; `profil_ne_prochitan:…` или нет срока брифинга — профиль агента не прочитан или в нём нет одного значения `restore.ignoreAfterMs`.

**Cause.** The stage refuses to decide when it does not know the conditions: `yadro_bez_metki_vychishcheno` — the agent's core is older than required and lacks the cleanup mark field; `profil_ne_prochitan:…` or a missing briefing window — the agent profile was not read or lacks a single `restore.ignoreAfterMs` value.

**Лечение.** Обновите ядро агента или поправьте профиль. Слепота — не число: пока причина не снята, по этому агенту ничего не стирается.

**Fix.** Update the agent's core or fix the profile. Blindness is not a number: until the cause is removed, nothing is erased for that agent.

<a id="t8"></a>
## 8. `delivery=unknown`, код 2 · `delivery=unknown`, exit 2

**Признак.** Прогон закончился, но `delivery: unknown`, служба вернула 2; heartbeat краснеет.

**Symptom.** The run finished, but `delivery: unknown`, the service returned 2; heartbeat goes red.

**Причина.** `agent-alert` отказал или не ответил за 90 секунд. Служба намеренно не повторяет отправку вслепую: письмо могло уйти, и повтор дал бы дубль.

**Cause.** `agent-alert` failed or did not answer within 90 seconds. The service deliberately does not retry blindly: the message may have gone out, and a retry would duplicate it.

**Лечение.** Проверьте канал тревог и учётные данные `LoadCredential`. Строка итога лежит в `latest.json` (поле `summary`) — её можно прочитать оттуда.

**Fix.** Check the alarm channel and the `LoadCredential` credentials. The summary line is in `latest.json` (the `summary` field) and can be read from there.

<a id="t9"></a>
## 9. Heartbeat: «scheduled run missing» или «not measured» · Heartbeat: "scheduled run missing" or "not measured"

**Признак.** Код 1 «scheduled run missing since …» или код 2 «not measured».

**Symptom.** Exit 1 "scheduled run missing since …" or exit 2 "not measured".

**Причина.** «Missing» — после 02:05 UTC нет прогона, начатого после 01:00 UTC: таймер не сработал, служба не стартовала, или время таймера изменили, а окно heartbeat — нет. «Not measured» — `latest.json` нет (первый день после установки), он не обычный файл, больше 1 МиБ, другой схемы, либо маска стоит без подтверждённой даты.

**Cause.** "Missing" — after 02:05 UTC there is no run started after 01:00 UTC: the timer did not fire, the service did not start, or the timer time was changed while the heartbeat window was not. "Not measured" — `latest.json` is absent (first day after installation), is not a regular file, exceeds 1 MiB, has another schema, or the mask exists without a confirmed date.

**Лечение.** `systemctl list-timers dsh-pamyat-obsluzhivanie.timer` и `journalctl -u dsh-pamyat-obsluzhivanie.service`; при первом монтаже — один ручной прогон. Время таймера менять только вместе с окном в `heartbeat.py`.

**Fix.** `systemctl list-timers dsh-pamyat-obsluzhivanie.timer` and `journalctl -u dsh-pamyat-obsluzhivanie.service`; on first installation — one manual run. Change the timer time only together with the window in `heartbeat.py`.

<a id="t10"></a>
## 10. Служба убита по памяти при первом векторе · Service killed for memory on the first embedding

**Признак.** Ступень уроков обрывается, в журнале systemd — превышение `MemoryMax`.

**Symptom.** The lesson stage breaks off; the systemd journal shows `MemoryMax` exceeded.

**Причина.** Один настоящий вектор модели `bge-m3` занимал около 1,56 ГБ памяти процесса; первый выпуск с пределом 1 ГБ этого не выдерживал.

**Cause.** One real `bge-m3` embedding took about 1.56 GB of process memory; the first release with a 1 GB limit could not handle it.

**Лечение.** `MemoryMax=4G` в юните (как сейчас). Не опускайте предел ниже, не замерив пик.

**Fix.** `MemoryMax=4G` in the unit (as now). Do not lower the limit without measuring the peak.

<a id="t11"></a>
## 11. Судья: `invalid credential` · Judge: `invalid credential`

**Признак.** Ступень судьи `error` с причиной про ключ; вызовов модели 0.

**Symptom.** The judge stage is `error` with a key-related reason; 0 model calls.

**Причина.** Файла ключа из `DEEPSEEK_CREDENTIAL_FILE` нет или он негоден (пуст, длиннее 4096 байт, многострочный). Ключ кладёт `ExecStartPre` только на время прогона службы и удаляет `ExecStopPost`, поэтому прогон в обход службы ключа не видит. Если же `prepare_key.py` сам отказал (нет доступа у учётки-владельца хранилища, истёк предел 20 секунд), служба не стартует вовсе: признак тогда — сбой `ExecStartPre` в журнале и heartbeat «scheduled run missing». При маске ключ не готовится намеренно, а runner завершается `disabled`, не доходя до судьи.

**Cause.** The key file from `DEEPSEEK_CREDENTIAL_FILE` is missing or invalid (empty, longer than 4096 bytes, multi-line). `ExecStartPre` places the key only for the duration of a service run and `ExecStopPost` removes it, so a run that bypasses the service does not see a key. If `prepare_key.py` itself refused (the key store's owner account has no access, the 20-second limit expired), the service does not start at all: the sign is then an `ExecStartPre` failure in the journal and heartbeat "scheduled run missing". Under a mask the key is deliberately not prepared, and runner ends as `disabled` without reaching the judge.

**Лечение.** Запускайте прогон только через службу; проверьте журнал `ExecStartPre` и доступ учётки-владельца к хранилищу ключей. Значение ключа в журнал не попадает и не должно печататься при проверке.

**Fix.** Run only through the service; check the `ExecStartPre` journal and the owner account's access to the key store. The key value never reaches the journal and must not be printed while checking.

<a id="t12"></a>
## 12. `busy`, код 3 · `busy`, exit 3

**Признак.** Ручной запуск сразу возвращает `busy`.

**Symptom.** A manual start immediately returns `busy`.

**Причина.** Другой прогон держит замок `run.lock`. Второй прогон судью не зовёт и второго письма не шлёт — это защита, а не поломка.

**Cause.** Another run holds `run.lock`. The second run neither calls the judge nor sends a second message — this is protection, not a failure.

**Лечение.** Дождитесь конца текущего прогона (не дольше 60 минут). Если `latest.json` показывает `running` дольше предела — смотрите heartbeat «run overdue» и журнал службы.

**Fix.** Wait for the current run to finish (60 minutes at most). If `latest.json` shows `running` past the limit, see heartbeat "run overdue" and the service journal.

## Журнал кандидатов требует ремонта · Candidate journal requires repair

Признак: judge.error=journal, принятые/очередь не измерены, вызовов 0; missing_journal_is_not_empty проверяет этот исход. Причина: нет либо негоден kandidaty-vytesneniya.jsonl рядом с omega.db; его пишет внешняя локальная V1-правка хранилища OMEGA. Лечение: владелец поставки проверяет писателя/путь/права/замок и восстанавливает настоящий журнал по страховке. Не создавать пустой файл, не считать отсутствие 0 кандидатов.

Symptom: judge.error=journal, accepted/queue not measured and 0 calls; the missing-journal test covers this. Cause: missing/invalid kandidaty-vytesneniya.jsonl beside omega.db, written by an external local V1 store patch. The deployment owner checks writer/path/modes/lock and restores the real journal from backup. Do not create an empty file or read missing as 0 candidates.

## Уроки без связи с OMEGA · Lessons lack the OMEGA link

Первый шаг — `svyazat_zadnim.py --suho --agent ИМЯ`, только проверка. Ключи/коды — SETTINGS. Боевая связка требует namerenie.sluzhba и остановленной службы агента; обход блокировки только --pri-zhivoj-sluzhbe с явной причиной и отдельным поручением. Пробы этого пакета не делают такой проход на бою. Для возврата — --otkat со своим списком и страховкой.

Start with `svyazat_zadnim.py --suho --agent NAME`, read-only inspection. SETTINGS lists keys/codes. Apply requires namerenie.sluzhba and a stopped agent service; overriding that check needs --pri-zhivoj-sluzhbe with an explicit reason and separate authorization. These tests never apply on live data. Roll back with --otkat and your own list/backup.
