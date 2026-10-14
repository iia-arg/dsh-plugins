# Защиты, читатели и стенды · Guards, readers, and tests

Проверка не считается работающей только потому, что её функция есть в файле. Для каждого механизма здесь указан вызывающий, условие отказа, предел работы и потребитель исхода. Код возврата и `sent_at` не доказывают человеческое прочтение; проверка канала не заменяет защиту ОС.

A check is not operational merely because its function exists. Each mechanism below identifies its caller, rejection condition, stopping bound, and outcome consumer. Exit status and `sent_at` do not prove human reading; channel checks do not replace OS security.

| Механизм · Mechanism | Вызывает · Caller | Ловит и действие RU / EN · Detection and action | Граница RU / EN · Boundary | Читатель · Reader |
|---|---|---|---|---|
| `channelAdmission` | channel apply / Telegram handler | Неверные IDs/тип openBot; отказ / invalid IDs/openBot type; reject | Не песочница / not a sandbox | startup log, caller |
| Slash admission | handleUpdate | Команды платформы только owner; неизвестные slash отказ / platform commands owner-only; unknown slash rejected | Только Telegram handler / Telegram handler only | direct response, operator |
| Ledger identity | receive | Один key+другие байты: conflict / same key with different bytes: conflict | Не определяет смысл письма / does not authenticate meaning | log, held file, operator |
| Coordinator signature | mail ingestion | Recipient/ledger/key/time/replay mismatch / mismatch rejects authority | Обычное имя отправителя не подпись / ordinary sender hint is not a signature | ledger audit, operator |
| Session generation | agentFor/receiptAgentFor | ID+createdAt+cwd mismatch stops recovery / mismatch stops recovery | Не исправляет пропавшую историю / cannot repair lost history | named log, held receipt |
| WakeGate | ReceiptRuntime.wake | Повтор той же ошибки ограничен3 / unchanged refusal bounded to3 | Внешний wake вне контроля / external wake outside guard | audit/meta, operator |
| Durable pause | /stop, restore | Работа не возобновляется без allowed privileged human input / no resume without admitted privileged human input | Не означает отмены удалённой работы / not proof of remote cancellation | pause file, direct response |
| /new rotation | rotateConversation | Неизвестная отмена/срок60s удерживает смену / uncertainty or60s expiry holds rotation | Удаление schedule не отзывает доставленный inbox / schedule deletion does not recall inbox | cancellation report, audit |
| AttachmentStore | handler + loop tick | Квота/размер/подмена отказ; ожидание10мин даёт notice / quota,size,snapshot reject;10-minute wait triggers notice | Не проверяет смысл файла / does not validate file meaning | explicit reply, manifest |
| File route | telegram_send_file execute | Чужая папка, symlink, два маршрута отказ / foreign directory,symlink,mixed route rejected | Не вирусный сканер / not malware scanning | tool error, caller |
| Site native view | setup + pre-step | Любое имя кроме pismo исключается; exact check / exclude all other names; exact check | API ToolRuntime; нужен restart при смене wrapper / requires restart when wrapper changes | turn error, operator |
| Site MCP descriptor | pre-step | Нет/лишние инструменты — отказ до модели / missing or additional tools reject before model | Список не заменяет guard самого моста / list check does not replace bridge execution guard | turn end.reason |
| Site closure | /sss + site timer + deliver | Closed blocks new input/results, cancels active turns / closure blocks input/results and interrupts turns | Уже переданный внешний ответ не отзывается / already dispatched external response not recalled | owner confirmation, adapter |
| Guest outbox | prepare/deliver | Logical copies once; revoked targets refused / stable IDs and target revocation | HTTP ack lost can duplicate physical send / lost HTTP ack may duplicate sends | outbox, copies, operator |
| Copy failure alarm | reportCopyFailures | После3failures один intent тревоги / one alarm intent after3failures | Unknown alarm not retried blindly / unknown alarm is not blindly retried | agent-alert integration, log |
| Body expiry | receiptTick | Finished/delivered bodies>30days cleared in batches50 / clear eligible bodies in50-item batches | Metadata/undelivered records retained / metadata and undelivered records remain | counts, retention owner |
| Site expiry | site poll | Closed delivered site records>30days removed / eligible site records deleted after30days | Session files/backups/remote copies excluded / excludes session files,backups,remote copies | retention log, external timer owner |

## Как проверять · How to verify

Запускай проверки на копии с временными базами и подставной сетью. Для новой защиты нужны три результата: здоровое проходит, внесённая порча краснеет с именем предмета, возврат снова проходит. До подсчёта результата докажи внесение порчи фиксированной строкой и SHA файла; одинаковый SHA означает несостоявшуюся порчу.

Run checks against copies with temporary databases and synthetic network services. A new guard needs three outcomes: healthy input passes, deliberate corruption fails with the subject identified, and restoration passes again. Before counting results, prove the corruption using a fixed-string check and a file hash; an unchanged hash means the mutation did not occur.

```sh
DSH_TEST_APP='/opt/<agent-home>/app' node test/stend-site-platform-tools.mjs
DSH_TEST_APP='/opt/<agent-home>/app' node test/stend-site-file-registration.mjs
node test/stend-istechenie-tel.mjs
node test/stend-site-retention.mjs
```

Эти примеры проверяют ToolRuntime с поздними локальными регистрациями, файловый регистратор, стирание дублей и срок сайта. Полный runner снимает список `stend-*.mjs`; дополнительные `site-command-integration.mjs`, `site-bridge-prestep.mjs` и `test-goal-control.mjs` запускаются отдельно. Список конкретной поставки можно собрать `find test -maxdepth 1 -name 'stend-*.mjs'`; это файлы, а не доказанные проходы.

These examples exercise late local ToolRuntime registrations, file-tool registration, duplicate-body erasure, and site retention. The full runner discovers `stend-*.mjs`; `site-command-integration.mjs`, `site-bridge-prestep.mjs`, and `test-goal-control.mjs` require separate invocation. `find test -maxdepth 1 -name 'stend-*.mjs'` inventories files in a distribution, not verified executions.

## Состав test/ · Composition of test/

Общий прогон (`npm test` = `node test/vse-stendy.mjs`) снимает с диска все `test/stend-*.mjs` и гоняет каждый отдельным процессом. Коды прогона: `0` — все зелёные; `1` — хоть один разошёлся или упёрся в предел `VSE_STENDY_PREDEL_S`; `2` — расхождений нет, но есть слепые.

The common run (`npm test` = `node test/vse-stendy.mjs`) discovers every `test/stend-*.mjs` on disk and runs each in its own process. Run exit codes: `0` — all green; `1` — at least one diverged or hit the `VSE_STENDY_PREDEL_S` limit; `2` — no divergence, but some tests are blind.

Запускаются отдельно, общий прогон их не зовёт: `node test/test-goal-control.mjs`, `node test/site-command-integration.mjs`, `node test/site-bridge-prestep.mjs`; PDF — `python3 -B test/test_pdf_calculation.py`, `test_pdf_letterheads.py`, `test_pdf_saved_result.py`, `test_pdf_guest_proposal.py`, `test_pdf_frozen_footer.py` (unittest, нужны `reportlab` и `pypdf`; `test_pdf_letterheads.py` и `test_pdf_frozen_footer.py` — ещё PyMuPDF (`fitz`), без него код 2).

Started separately, not called by the common run: `node test/test-goal-control.mjs`, `node test/site-command-integration.mjs`, `node test/site-bridge-prestep.mjs`; PDF — `python3 -B test/test_pdf_calculation.py`, `test_pdf_letterheads.py`, `test_pdf_saved_result.py`, `test_pdf_guest_proposal.py`, `test_pdf_frozen_footer.py` (unittest, require `reportlab` and `pypdf`; `test_pdf_letterheads.py` and `test_pdf_frozen_footer.py` also PyMuPDF (`fitz`), exit 2 without it).

Не стенды — помощники, которые стенды импортируют или запускают; сами по себе ничего не проверяют: `test-platform.mjs` и `platforma-02.mjs` (загрузка платформы DSH), `sosedi.mjs` (где взять соседние пакеты), `gost-kontekst.mjs`, `extract.mjs`, `attachment-harness.mjs`, `coordinator-fixture.mjs`, `ordinary-mail-control-fixture.mjs`, `telegram-stop-baseline.mjs` (прежняя редакция стопа для сравнения), `site-adapter-fixture.py`; воркеры `mail-new-kill-worker.mjs`, `pause-worker.mjs`, `pause-publication-worker.mjs`, `receipt-kill-worker.mjs`; каталог `fixtures/`.

Not tests — helpers that tests import or start; on their own they check nothing: `test-platform.mjs` and `platforma-02.mjs` (loading the DSH platform), `sosedi.mjs` (where to take sibling packages), `gost-kontekst.mjs`, `extract.mjs`, `attachment-harness.mjs`, `coordinator-fixture.mjs`, `ordinary-mail-control-fixture.mjs`, `telegram-stop-baseline.mjs` (the previous stop implementation for comparison), `site-adapter-fixture.py`; workers `mail-new-kill-worker.mjs`, `pause-worker.mjs`, `pause-publication-worker.mjs`, `receipt-kill-worker.mjs`; the `fixtures/` directory.

Отчего стенд слепнет (код 2, «СЛЕПОТА: …»), и чем дать ему предмет: `DSH_TEST_APP` — каталог `app` платформы DSH (без него слепы стенды, которым нужна платформа); `GATEWAY_CANDIDATE`, `ADAPTER_CANDIDATE`, `BRIDGE_CANDIDATE` — соседние пакеты `dsh-subscription-gateway`, `dsh-subscription-adapter`, `dsh-tool-bridge` (в дереве берутся из `../../`, в бою их нет); `SITE_ADAPTER_CANDIDATE` — адаптер сайта; `KORDIS` — модуль `@deepseek-ai/cordis` (по умолчанию ищется от пакета). Ещё три стенда ждут предметов машины: `stend-mail-stop-local-sender.mjs` и `stend-mail-new-iskra-sadik.mjs` — учётку `coders`, `stend-voice-archive.mjs` — файл обёртки `VOICE_ARCHIVE_WRAPPER` (умолчание `/usr/local/bin/transcribe-local-shared`); без них — код 2. `stend-courier-publication.mjs` и `stend-mail-stop-publication.mjs`, наоборот, слепнут под root: им нужен ящик учётки агента, запускать от непривилегированного пользователя. `SVYAZ_SRC` — необязательная подмена предмета (другой `src/index.js`), без неё берётся свой; `VOICE_TEST_MODE` и прочие служебные переменные стенды задают себе сами.

What makes a test blind (exit 2, «СЛЕПОТА: …» — blindness) and how to give it its subject: `DSH_TEST_APP` — the DSH platform `app` directory (without it the tests that need the platform are blind); `GATEWAY_CANDIDATE`, `ADAPTER_CANDIDATE`, `BRIDGE_CANDIDATE` — the sibling packages `dsh-subscription-gateway`, `dsh-subscription-adapter`, `dsh-tool-bridge` (in the tree taken from `../../`, absent in production); `SITE_ADAPTER_CANDIDATE` — the website adapter; `KORDIS` — the `@deepseek-ai/cordis` module (resolved from the package by default). Three more tests expect machine subjects: `stend-mail-stop-local-sender.mjs` and `stend-mail-new-iskra-sadik.mjs` — the `coders` account, `stend-voice-archive.mjs` — the `VOICE_ARCHIVE_WRAPPER` wrapper file (default `/usr/local/bin/transcribe-local-shared`); without them — exit 2. `stend-courier-publication.mjs` and `stend-mail-stop-publication.mjs`, conversely, are blind under root: they need an agent account mailbox; run them as an unprivileged user. `SVYAZ_SRC` is an optional subject override (another `src/index.js`); without it the package's own is used; `VOICE_TEST_MODE` and other internal variables are set by the tests themselves.

## Чтение тревог · Reading failures

`Site tool set differs` означает, что native-набор не равен разрешённому; не расширяй allow-list по тексту ошибки. `Site bridge capability list differs` указывает на другой, внешний контур. `dispatch_unknown` и `interrupted_unknown` требуют сопоставления конкретного receipt с поколением и концом хода, а не общего перезапуска работы. Исчерпанный outbox повторяет только доставку, не исполнение исходного поручения.

`Site tool set differs` means the native capability set differs from the approved list; do not broaden authorization merely to silence the error. `Site bridge capability list differs` identifies a separate external surface. `dispatch_unknown` and `interrupted_unknown` require matching the receipt, generation, and turn outcome, not wholesale replay of the task. Exhausted outbox handling concerns response delivery, not re-executing the original directive.

`UNVERIFIED`, «слепота» и отсутствующее поле — третье состояние, а не ноль событий. Назови окно времени, конкретную сессию, версию процесса и метод измерения. Если журнал содержит start без end, это не completed; если end есть, но нет ответа, причину ищи в `result_json.end.reason`.

`UNVERIFIED`, a blind check, and an unavailable field are a third state rather than zero events. State the time window, exact session, live process version, and measurement method. Start without end is not completed; when end exists but no response does, inspect `result_json.end.reason`.


## Owner и download · Owner and download

stend-owner-settings и stend-owner-channel-mount проверяют задано→снято→возвращено, явный адресат и ошибочный JSON. stend-telegram-download-limits использует настоящий локальный HTTP-сервер: исправный файл→слишком большой/зависшие заголовки или тело→снова исправный. Проверяются дедлайн, точная граница байтов и отсутствие частичных файлов. Это не живая доставка Telegram или ответ модели.

stend-owner-settings and stend-owner-channel-mount check configured→removed→restored, explicit targets, and malformed JSON. stend-telegram-download-limits uses a real local HTTP server: valid file→oversized/stalled headers or body→valid again. It checks the deadline, byte boundary, and absence of partial files. These tests do not prove live Telegram delivery or model responses.


stend-deployment-portability проверяет настоящий ledger, configurable trust и обратный courier на временных данных: явный маршрут работает, снятие mapping удерживает unknown, возврат настройки снова разрешает. Новый контур не проверяет доступность внешнего courier/trust в чужой установке: это проверка монтажника с её реальными настройками.

stend-deployment-portability exercises the actual ledger, configurable trust, and return courier on temporary data: explicit routing works, withdrawing the map holds unknown input, and restoring it permits delivery again. It does not prove availability of an external courier/trust store in another installation; installers must verify their own configuration.
