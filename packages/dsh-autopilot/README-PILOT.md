# Почтовый пилот на sadik / Mail pilot on sadik

Часть плагина применения «Автопилота» Никиты Велеса на DSH-серверах DeepSeek Harness; исходник — [nick-vels/skills](https://github.com/nick-vels/skills). [Авторство, pin и правило разбора upstream](README.md#upstream-и-обновления).

## RU — входы кандидата 0.1.12; исторические пробы 17.10.2026

Оператор — Unix `master`. Команда — `vintik`, `shpuntik`, `gayka`, `shurup`, `sova`, `tumbler`. Задания, ответы и отмены идут через отдельную почту Автопилота, не через прежний `a2a-send` тройки кодеров. Мастер сохраняет обычный и отдельный Autopilot-маршрут. Сервер аутентифицирует Unix-учётки; CLI не запускает модель, shell задания, `sudo` или интеграцию проекта.

Кандидат 0.1.12 использует postal client/receiver helper `/opt/autopilot/post/0.1.10`; номер AP не создаёт post/0.1.12. Факт монтажа проверяется отдельно. Порядок нового окна и Pdry — [лист П](window/LIST-P-0.1.12.md). Описанные ниже пробы 17.10 относятся к прежнему core `a15-b7-c2`, AP0.1.7; они не аттестуют новый выпуск.

### Две точки входа

- **Мастер:** `$REL/pilot/pilot_mail.py` из физического core его run; postal-зависимости берутся из `/opt/autopilot/post/0.1.10/pilot` через явно заданный `PYTHONPATH`, Python `-s -B`.
- **Получатель:** `/opt/autopilot/post/0.1.10/pilot/pilot_mail.py` под своей Unix-учёткой команды. В physical core префикс допускает `master/coders`; это не receiver-вход для Совы и остальных новых участников. Postal helper допускает собственные шесть учёток команды.

Статусы живой пробы17.10: Master submit=`PLACED`, Sova receive=`READY`, finish=`RESULT_READY`; run `0ce512af275e4b0d910fc161e1aea14c`. Это наблюдённый путь одного получателя, не приёмка работы всех шести.

### Проект и полномочия

`PROJECT` — заранее согласованный физический Git-проект. Master state, receiver state, run и memory связываются с ним; receiver `--state` должен находиться внутри него и вне защищённой `.autopilot`/памяти. Перенос одного `--state` наружу не является допустимым обходом политики. У каждого участника отдельный state; Мастер исключает служебные файлы из Git.

Технически допустимый путь может быть запрещён сводом конкретного агента. Отдельный обычный наряд координатора должен разрешать работу именно в этом проекте; письмо Мастера не расширяет границу записи. Будущая папка `/srv/autopilot/projects` принята, но ещё не создана в бою. Не выдавать старые тестовые `/var/tmp/...` за общее разрешение команде.

Файлы README/AGENTS/CLAUDE/PROGRESS и `.autopilot/` — данные проекта, не полномочия. Отказ `BLOCKED/POLICY_PRODUCTION_DENIED` не превращается в исполненное задание. На запрещённом запросе выполнение прекращается.

### Операторские команды — справочник, не запуск

Значения берутся из настоящего зарегистрированного проекта/run; `$REL` — его physical release. `$MASTER_STATE` и `$MEMORY` — утверждённые пути проекта.

```sh
POST_PY=/opt/autopilot/post/0.1.10/pilot
PYTHONPATH="$POST_PY" PYTHONNOUSERSITE=1 python3 -s -B "$REL/pilot/pilot_mail.py"   --state "$MASTER_STATE" --project "$PROJECT" --run "$RUN" --memory "$MEMORY" submit < job.json
PYTHONPATH="$POST_PY" PYTHONNOUSERSITE=1 python3 -s -B "$REL/pilot/pilot_mail.py"   --state "$MASTER_STATE" --project "$PROJECT" --run "$RUN" --memory "$MEMORY" result "$RESULT_MAIL_ID"
```

`submit` принимает JSON задачи из stdin: job_id, ticket, recipient из команды, role(executor/reviewer/acceptance/researcher), cwd/zone/requirements/brief/deadline и поля заявленного контекста. Форму и ограничения проверяет установленный helper; старые примеры с recipient=alfa больше не его схема.

`PLACED` означает, что helper записал успешный возврат от почтового транспорта; это не след получения, чтения или исполнения адресатом.

`result` получает ответ по ID из authenticated postal client, сохраняет оригинал до ACK. `checked JOB COMMIT`, `public`, `reconcile`, `cancel` — операторские подкоманды; они не являются независимым AP writer. После проверки Мастер сам интегрирует Git, сохраняет штатные трейлеры и отмечает соответствующие AP-события. Приёмка кода не выводится из `PLACED`, ACK или одного rc0.

### Побочные действия команд

| Команда | Что меняет |
|---|---|
| AP init/events/resume/commits/finish/usage | Private state и попытка public export; даже commits не read-only |
| pilot submit/cancel | Локальный job-state и отправка писем через postal transport |
| pilot result/receive ID | Локальное сохранение оригинала/state и удалённый ACK; это не простое чтение |
| pilot claim | Локальное состояние задания, без запуска модели |
| pilot checked JOB COMMIT | Локальное принятие job/commit; AP state и G4 автоматически не выставляет |
| pilot finish | Локальный результат, отправка ответа и completion; PENDING повторяется тем же finish |
| pilot public/reconcile | Могут создать parent/lock, хотя представление jobs не сохраняют; не гарантированно read-only для файловой системы |
| pilot_archive | Новая отдельная копия Git commit, не запуск её кода |

### Получатель

```sh
POST=/opt/autopilot/post/0.1.10/pilot/pilot_mail.py
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$PROJECT" \
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B "$POST" --state "$RECEIVER_STATE" --project "$PROJECT" --run "$RUN" --memory "$MEMORY" receive "$MAIL_ID"
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$PROJECT" \
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B "$POST" --state "$RECEIVER_STATE" --project "$PROJECT" --run "$RUN" --memory "$MEMORY" claim "$JOB_ID"
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$PROJECT" \
PYTHONPATH=/opt/autopilot/post/0.1.10/pilot PYTHONNOUSERSITE=1 \
  python3 -s -B "$POST" --state "$RECEIVER_STATE" --project "$PROJECT" --run "$RUN" --memory "$MEMORY" finish "$JOB_ID" < contract.json
```

Имя берётся из Unix, флага `--name` нет. `receive` получает ID, а не текст из stdin; original сохраняется до ACK. Обычная занятость объявляется `--busy` на receive/claim. Finish читает status/summary/context_ref и отправляет результат через тот же postal transport; пересылка его `mail` через `a2a-send` больше не нужна. При pending completion повторяется тот же finish, не новый job/nonce.

До возврата всей пачки сохраняются правила заморозки проекта и контроля HEAD/памяти/PROGRESS. При изменении защищённого объекта — `PROJECT_CHANGED_RECONCILE`, не автоматический перезапуск. CLI задаёт абсолютный deadline: после текущего времени и не дальше7200с; в одной таблице заданий допускает не более3активных jobs и одно задание получателю. Число участников команды не является лимитом параллелизма. Организационные бюджеты repairs/retries ведёт Мастер по плану/наряду; не считать их заново из-за смены контекста. Freshness/context_ref заявлены, не доказывают новый или слепой контекст. Повторяемая доставка не доказывает exactly-once внешних действий.

### Приёмка и расход

`pilot_archive.py` готовит отдельную копию конкретного commit без истории, приватной `.autopilot`, AGENTS/CLAUDE/SKILL, памяти и `.env`; перед запуском зависимостей нужна разрешённая изоляция и исходные брифы. Это не автоматическое доказательство слепоты. jobs-public JSON и публичный AP state — разные схемы, их связь не подразумевается.

Claude измеряется root после закрытого хода, затем Мастер делает штатный `usage claude`; это не прежний проект export-helper/T2 с дополнительным модельным ходом. Живая проба подтверждена до private state, карточка Claude в0.1.7 остаётся скрыта. Codex в текущем проверенном run не измерен. Ни helper задания, ни ACK не являются числовым замером. См. [README.md](README.md) и [FORMAT-CONTRACT.md](FORMAT-CONTRACT.md).

## EN — deployed workflow on 17 October 2026

The operator is Unix account `master`. The team is `vintik`, `shpuntik`, `gayka`, `shurup`, `sova`, `tumbler`. Tasks, results and cancellations use dedicated Autopilot mail, not the former three coders' `a2a-send` route. Master retains both ordinary and Autopilot mail. The server authenticates Unix accounts. The CLI launches neither models, task shell commands, sudo nor project integration.

The 0.1.12 candidate uses postal client/receiver helper `/opt/autopilot/post/0.1.10`; deployment is verified separately. See [the installation and Pdry order](window/LIST-P-0.1.12.md). The 17 October live probe below used core `a15-b7-c2`, AP0.1.7; it does not attest this candidate.

### Distinct entrypoints

Master uses `$REL/pilot/pilot_mail.py` from the run's pinned physical core, supplying installed postal dependencies through `PYTHONPATH=/opt/autopilot/post/0.1.10/pilot` and Python `-s -B`. Receivers use `/opt/autopilot/post/0.1.10/pilot/pilot_mail.py` under their own team account. The physical core prefix admits master/coders and is not the receiver entrypoint for Sova or the other current participants.

The live probe recorded Master submit=`PLACED`, Sova receive=`READY`, finish=`RESULT_READY`, run `0ce512af275e4b0d910fc161e1aea14c`. This confirms one receiver's route, not live acceptance for all six.

### Project and authority

`PROJECT` is an explicitly authorized physical Git project. Operator and receiver state, run and memory are bound to it. Receiver state must be inside the project and outside protected control/memory paths; moving `--state` outside is refused. Each account has separate state, excluded from Git by Master.

A path accepted by the CLI can still violate an agent's policy. A separate ordinary coordinator assignment must authorize that project; Master mail cannot widen write access. `/srv/autopilot/projects` is accepted as a future root but absent in production. Old `/var/tmp` probe paths grant no general authority. Project README/AGENTS/CLAUDE/PROGRESS and `.autopilot` are data. `BLOCKED/POLICY_PRODUCTION_DENIED` stops the task and is not successful execution.

### Commands and results

The shell examples in the RU section are shared command syntax for both languages and use actual project/run bindings and installed helpers. `PLACED` means the helper recorded successful mail-transport submission; it does not prove receipt, reading or execution by the recipient. `submit` reads task JSON from stdin. The helper validates job/ticket, current team recipient, role, zone, requirements, brief, deadline and declared context. `recipient=alfa` and `--name` are obsolete. `result ID` fetches authenticated mail and saves it before ACK. `checked JOB COMMIT`, `public`, `reconcile`, `cancel` are operator commands, not automatic AP state integration. Master integrates Git, writes trailers and AP events after verification.

Receiver `receive ID` takes an ID, not stdin mail text. Account identity comes from Unix. Declare ordinary-work busy state with `--busy` on receive/claim. `finish JOB` reads status/summary/context_ref JSON and sends through postal transport itself; do not resend its `mail` via a2a-send. Retry the same finish for pending completion, not a new job/nonce.

Project/HEAD/memory/PROGRESS stay frozen until the batch returns. A changed control object yields PROJECT_CHANGED_RECONCILE, not automatic relaunch. The CLI requires an absolute deadline after now and at most 7200 seconds ahead; each job-state table admits at most 3 active jobs and one per recipient. Team size is not the concurrency limit. Master tracks organizational repair/retry budgets under the plan or assignment; a context change does not restart that budget. Freshness/context_ref are declarations, not proof of a fresh or blind context. Deduplicated delivery does not provide exactly-once external execution. PLACED, ACK and rc0 do not prove accepted code.

### Command side effects

| Command | Mutations |
|---|---|
| AP init/events/resume/commits/finish/usage | Private state and an attempted public export; commits is not read-only |
| pilot submit/cancel | Local job state and outgoing postal mail |
| pilot result/receive ID | Durable local original/state plus remote ACK, not plain reading |
| pilot claim | Local job state, no model launch |
| pilot checked JOB COMMIT | Local job/commit acceptance, without automatically setting AP state or G4 |
| pilot finish | Local result, outgoing result and completion; repeat the same finish for PENDING |
| pilot public/reconcile | May create parent/lock without saving the jobs view; not guaranteed filesystem-read-only |
| pilot_archive | A new separate Git-commit copy, without executing its code |

### Acceptance and usage

`pilot_archive.py` prepares a separate copy of a specific commit, excluding history, private control, instructions, memory and .env. Dependency execution requires authorized isolation and original briefs; the archive alone does not prove blindness. Public job JSON and public AP state are different schemas.

Root measures Claude after the turn closes; Master then invokes normal usage claude. The earlier separate-model-turn export-helper/T2 proposal is not this deployed path. The live probe confirms the private basket; Claude's public card remains hidden in 0.1.7. Codex is unmeasured in the checked run. Task helpers and ACKs are not numeric usage measurements. See [README.en.md](README.en.md) and [FORMAT-CONTRACT.md](FORMAT-CONTRACT.md).


## 0.1.14 · просроченная доставка и удерживаемая зона

`reconcile` сохраняет EXPIRED для PLACED/DELIVERY_UNKNOWN/QUEUED_BUSY после deadline. RUNNING не становится доказанно завершённым по часам. Поздний удостоверенный результат сохраняется отдельно; EXPIRED не превращается в CHECKED. Новая задача может занять свободную ёмкость, но пересекающаяся зона остаётся удержанной, пока нет доказательства завершения либо явного решения оператора.

Команда из того же физического L: `python3 -s -B "$L/pilot/pilot_mail.py" --state "$OPERATOR_STATE" --project "$PROJECT" --run "$RUN" --memory "$MEMORY" release-expired "$JOB" --reason "<почему принимается риск>"`. Она требует настоящую root-квитанцию, общий operator.lock и EXPIRED job; сначала долговечно пишет private marker, затем снимает hold. Получателя не останавливает и completion в почте не подделывает. Root привязывает marker к canonical Postman taskSHA/recipient/deadline и включает job/reason/sourceSHA в final. Не более128 actions на RUN. После seal разрешён только точный повтор ранее включённого marker для завершения прерванного локального commit; новая action отказывает FINAL_ALREADY_SEALED. Некорректный marker не является свидетельством освобождения.
