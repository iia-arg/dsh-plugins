## 3.1.2 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- добавлен `README.en.md` — перевод `README.md` без изменения содержания.
- `package.json`: `author` — Aleksandr Argelander.
- Код пакета не менялся.

## 3.1.1 — 2026-10-10 · (рабочий номер 1.1.34; общий номер выпуска A-N-1948) Правки по облачному аудиту №7 / Cloud audit #7 fixes (A-N-1948)

- `summarize` передаёт сигнал отмены платформы соседу `dsh-pamyat-kompakt` (с 3.1.1 он прерывает вызов модели). · `summarize` passes the platform cancellation signal to the sibling (which aborts the model call from 3.1.1).
- `package.json`: `peerDependencies` — `dsh-pamyat-kompakt >=3.1.1` (обязателен), `@deepseek-ai/dsh-compaction-basic` и `@deepseek-ai/dsh-llm >=0.2.0-rc.2` (необязательные, берутся из установки платформы); `engines.node >=18`. Чистая установка без соседа теперь отказывает с его именем, а не проходит молча. · Peer dependencies declared; a clean install without the sibling now refuses naming it instead of passing silently.
- Шесть стендов, загружающих `marker-step.mjs`, без платформы рядом дают СЛЕПОТУ с кодом 2, а не трассу с кодом 1. · Six stands loading `marker-step.mjs` give BLINDNESS exit 2 without a platform next to them, not a stack trace with exit 1.
- Документация: README (зависимости, что нужно стендам, коды выхода, сигнал), GUARDS (коды, два стенда в таблицу), ARCHITECTURE (18 стендов), SETTINGS (строка отказа при негодном `KOMPAKT_AGENT`, путь `sudo`). · Docs updated accordingly.
- Аудит отметок продолжения (B-N-1969): поиск сужен полем `SYSLOG_IDENTIFIER` службы — ид берётся у службы (`SyslogIdentifier`, иначе basename пути `ExecStart`), не зашит; до поиска пишется строка «маяк аудита»; при 0 отметок — сверка ид последней строки `[kompakt-dsh` без поля (`-n 1`): другой ид — слепота с тревогой, курсор не двигается. zarya, 7 сут: 30 071 мс и SIGTERM → 6 410 мс. Новый стенд `stend-identifikatora-audita`. Правилу `sudo` агента без группы журнала нужны две новые формы — ставится раньше пакета. · Continuation-marker audit (B-N-1969): the search is narrowed by the service's `SYSLOG_IDENTIFIER` field — the id comes from the service (`SyslogIdentifier`, else the basename of the `ExecStart` path), not hard-coded; a «маяк аудита» (audit beacon) line is written before the search; with 0 markers — an id check of the latest `[kompakt-dsh` line without the field (`-n 1`): another id — blindness with an alert, the cursor does not move. zarya, 7 days: 30,071 ms and SIGTERM → 6,410 ms. New stand `stend-identifikatora-audita`. The `sudo` rule of an agent without the journal group needs two new forms — installed before the package.
- Граница сверки: маяк уходит в журнал через stdout → journald; если сверка опередит приём строки, «последней» окажется строка kompakt-dsh прошлого старта — ид у неё тот же, сверка только слабее (смену ид между стартами она тогда не ловит). · Check boundary: the beacon reaches the journal via stdout → journald; if the check outruns the reception of the line, the "latest" one is the kompakt-dsh line of the previous start — it has the same id, the check is only weaker (it then does not catch an id change between starts).

## 1.1.33 — 2026-10-09 · LICENSE в архиве / LICENSE in the archive (A-N-1887)

В архив входит LICENSE (MIT, A-N-1865 722421f). · The archive includes LICENSE (MIT, A-N-1865 722421f).

Ещё в архиве с прежнего номера · Also in the archive since the previous version: поле `"license": "MIT"` в package.json · `"license": "MIT"` field in package.json. Код пакета не менялся · Package code is unchanged.

## 1.1.32 — 2026-10-08 (B-N-1826, Аврора; ворота Вениамина 07:47Z) · S11 стенда курсора не зависит от смены секунды · S11 no longer depends on the second boundary

- `stend-kursora-audita.mjs` S11: момент прошлого старта снимается один раз (`t11`). Прежде `at(Date.now()-600e3)` считался заново ПОСЛЕ `start()` (до 70 с ожидания): при смене секунды `Math.floor` давал другое число, и S11 краснела на исправном курсоре (ручной прогон обхода 08.10). Порча «пауза 1100 мс перед проверкой»: прежний стенд — FAIL S11, новый — PASS. Код курсора (`marker-step.mjs`) не менялся.
- `stend-kursora-audita.mjs` S11: the previous-start moment is taken once (`t11`). Before, `at(Date.now()-600e3)` was recomputed AFTER `start()` (up to 70 s wait): on a second boundary `Math.floor` gave another number and S11 failed on a correct cursor (manual run 08.10). Corruption "1100 ms pause before the check": old stand — FAIL S11, new — PASS. The cursor code (`marker-step.mjs`) is unchanged.

## 1.1.31 — 2026-10-06 (B-N-1679, кандидат исполнителя; ворота впереди) · якорь разбора строки отметки · anchored marker-line parsing

- `marker-step.mjs`: аудит берёт строку журнала как отметку, только если она ЦЕЛИКОМ имеет форму `[kompakt-dsh <версия>] [continuation-marker] {…}` с начала строки. Прежний образец `…[continuation-marker] {…}$` без привязки совпадал с чужими строками того же журнала: мост инструментов при отказе печатает весь результат JSON с выводом команды — такая строка совпадала, `JSON.parse` падал, и падал весь аудит (слепота с тревогой; курсор не сдвигался — до 7 сут). Заодно больше не принимается отметка без нашего префикса или с префиксом другого модуля. Фильтр `--grep` journalctl не менялся — правило sudo гостя прежнее.
- Стенды: новый `stend-yakorya-audita.mjs` (7 проб); в `stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita` подставные строки отметки приведены к настоящей форме (с префиксом `[kompakt-dsh 0.0.0-proba]`); стендов 18.
- НЕ ЛОВИТ: строку с верным префиксом, напечатанную иным процессом той же службы через поток stdout journald (для песочницы гостя закрыт обёрткой `bwrap-bez-zhurnala`).
- `marker-step.mjs`: the audit takes a journal line as a marker only if it WHOLLY has the form `[kompakt-dsh <version>] [continuation-marker] {…}` from the line start. The old unanchored pattern `…[continuation-marker] {…}$` matched other lines of the same journal: on a tool failure the tool bridge prints the whole result JSON with the command output — such a line matched, `JSON.parse` threw and the whole audit failed (blindness with an alert; the cursor did not move — up to 7 days). Also a marker without our prefix or with another module's prefix is no longer accepted. The journalctl `--grep` filter is unchanged — the guest's sudo rule stays.
- Stands: new `stend-yakorya-audita.mjs` (7 probes); in `stend-dostupa-audita`, `stend-pustogo-audita`, `stend-kursora-audita` the substitute marker lines take the real form (prefix `[kompakt-dsh 0.0.0-proba]`); 18 stands.
- NOT CAUGHT: a line with the right prefix printed by another process of the same service through the journald stdout stream (closed for the guest sandbox by the `bwrap-bez-zhurnala` wrapper).

## 1.1.30 — 2026-10-05 (A-N-1677, кандидат исполнителя; ворота впереди) · граница окна аудита — прошлый запуск службы · audit window bounded by the previous service start

- `marker-step.mjs`: курсор аудита лежит в доме агента, и агент мог поставить его «минуту назад» — ближайший аудит не видел отметок прежнего запуска (повторяемое сокрытие, поправка ворот к 1.1.29). Теперь перед поиском — запрос прошлого запуска службы: последнее сообщение systemd «Started» (`-u <служба> _PID=1 MESSAGE_ID=39f53479… -n 3 -o json`) с `INVOCATION_ID` не нашего запуска; поле `_PID` journald берёт из учётных данных сокета, агент его не ставит. Курсор не позже прошлого старта — `--after-cursor`; позже (так и у свежего курсора) или негоден — `--since @<прошлый старт>`; прошлого старта нет, он старше 7 сут или запрос не удался — `--since -7 days` с причиной в строке.
- Строка успеха: `окно курсор|от прошлого старта[ (причина)]|7 сут (причина)`; пределы в строке отказа — до 122 с (запрос старта и поиск), до 182 с с повтором за негодный курсор.
- Правило sudo для агентов без группы журнала — вторая форма (запрос старта) и окно `--since @<секунды>`; со старым правилом 1.1.30 работает, но ищет 7 сут.
- Стенды: `stend-kursora-audita.mjs` переписан под прошлый старт (22 пробы, в т. ч. S11 — курсор «минуту назад» при отметке раньше него, S12 — свой запуск отброшен, S13 — запрос старта отказал/старше 7 сут/не PID 1); `stend-dostupa-audita.mjs` — вызовов sudo при отказе по правам 1 → 2 (запрос старта и поиск); `stend-pustogo-audita.mjs` — исход снимается по вызову с `--grep`, а не по первому.
- НЕ ЛОВИТ: поддельные строки отметок, записанные в журнал службы из её же процессов (сокеты journald открыты всем; закрывается в песочнице моста, не здесь); перезапуск без systemd (нет своего «Started» — берётся последний).
- `marker-step.mjs`: the audit cursor lies in the agent's home, and the agent could set it to "a minute ago" — the next audit missed the previous run's markers (repeatable concealment, a gate finding on 1.1.29). Now the search is preceded by a previous-start query: the latest systemd "Started" message (`-u <service> _PID=1 MESSAGE_ID=39f53479… -n 3 -o json`) whose `INVOCATION_ID` is not our run's; journald takes `_PID` from the socket credentials, the agent does not set it. A cursor not later than the previous start — `--after-cursor`; later (as a fresh cursor is) or unusable — `--since @<previous start>`; no previous start, older than 7 days or the query failed — `--since -7 days` with the reason in the line.
- Success line: `окно курсор|от прошлого старта[ (reason)]|7 сут (reason)`; limits in the failure line — up to 122 s (start query and search), up to 182 s with a retry for a rejected cursor.
- The sudo rule for agents without the journal group gets a second form (start query) and the `--since @<seconds>` window; with the old rule 1.1.30 works but searches 7 days.
- Stands: `stend-kursora-audita.mjs` rewritten for the previous start (22 probes, incl. S11 — cursor "a minute ago" with a marker before it, S12 — own run dropped, S13 — start query failed/older than 7 days/not PID 1); `stend-dostupa-audita.mjs` — sudo calls on a permission failure 1 → 2 (start query and search); `stend-pustogo-audita.mjs` — the outcome is taken from the `--grep` call, not the first one.
- NOT CAUGHT: forged marker lines written into the service journal by its own processes (journald sockets are world-writable; closed in the bridge sandbox, not here); a restart without systemd (no own "Started" — the latest is taken).

## 1.1.29 — 2026-10-05 (A-N-1671, кандидат исполнителя; ворота впереди) · курсор аудита журнала · journal audit cursor

- `marker-step.mjs`: аудит при старте больше не перечитывает 7 суток каждый раз. Поиск печатает курсор конца журнала службы (`--show-cursor`); после УСПЕШНОГО разбора он сохраняется в `<DSH_HOME или ~/.dsh>/kompakt-dsh/zhurnal-kursor-<агент>.json` (0700/0600, своей учёткой, атомарно), и следующий старт ищет `--after-cursor`. Курсор старше 7 сут или из будущего (по его `t=`, запас 5 мин), испорченный файл, файл чужой службы — поиск `--since -7 days`; курсор, который journalctl не принял («Failed to seek to cursor»), — один повтор за 7 сут; провал аудита курсор не сдвигает. Прежде поиск за 7 сут был линеен по числу записей службы: у агента с большим журналом (110 тыс. записей, 16–17 с) он упирался в предел 10 с, и аудит слеп на каждом подъёме.
- `marker-step.mjs`: предел журнала 10 → 30 с на путь. Курсор не лечит долгую жизнь процесса (за сутки — 62 тыс. записей, 8,4 с) и первый проход без курсора (все 7 сут).
- `marker-step.mjs`: пустая выборка с `--show-cursor` (код 1, только строка курсора) — пустая история, а не отказ.
- `marker-step.mjs`: «No journal files were found» добавлен в образец отказа по правам (повтор через `sudo -n`).
- Строка успеха: `…, unit <служба>, окно курсор|7 сут[ (причина)], курсор сохранён|не изменён|не сохранён: <код>`.
- Форма аргументов journalctl неизменна, её дословно повторяет узкое правило sudo для агентов без группы журнала (docs/TROUBLESHOOTING.md).
- Новый стенд `stend-kursora-audita.mjs` (16 проб; S1–S3 на настоящем журнале `STEND_BOLSHOJ_UNIT` не меньше 72 000 записей за 7 сут, иначе СЛЕПОТА); стендов 17.
- НЕ ЛОВИТ: ротацию во время самого поиска; процесс, проживший так долго, что записей после курсора больше, чем читается за 30 с; отметки старше 7 сут.
- `marker-step.mjs`: the start-up audit no longer re-reads 7 days every time. The search prints the cursor of the service journal's end (`--show-cursor`); after a SUCCESSFUL parse it is saved to `<DSH_HOME or ~/.dsh>/kompakt-dsh/zhurnal-kursor-<agent>.json` (0700/0600, own account, atomic), and the next start searches `--after-cursor`. A cursor older than 7 days or from the future (by its `t=`, 5 min margin), a corrupt file, a file of another service — `--since -7 days`; a cursor journalctl rejects ("Failed to seek to cursor") — one 7-day retry; a failed audit does not move the cursor. Previously the 7-day search was linear in the service's entry count: an agent with a large journal (110k entries, 16–17 s) hit the 10 s limit and the audit was blind at every start.
- `marker-step.mjs`: journal limit 10 → 30 s per path. The cursor does not fix a long-lived process (a day — 62k entries, 8.4 s) nor the first pass without a cursor (all 7 days).
- `marker-step.mjs`: an empty selection with `--show-cursor` (exit 1, only the cursor line) is an empty history, not a failure.
- `marker-step.mjs`: "No journal files were found" added to the permission-failure pattern (retry via `sudo -n`).
- Success line: `…, unit <service>, окно курсор|7 сут[ (reason)], курсор сохранён|не изменён|не сохранён: <code>`.
- The journalctl argument form is fixed; a narrow sudo rule for agents without the journal group repeats it verbatim (docs/TROUBLESHOOTING.md).
- New stand `stend-kursora-audita.mjs` (16 probes; S1–S3 on a real journal `STEND_BOLSHOJ_UNIT` with at least 72,000 entries in 7 days, otherwise BLINDNESS); 17 stands.
- NOT CAUGHT: rotation during the search itself; a process so long-lived that the entries after the cursor take more than 30 s to read; markers older than 7 days.

## 1.1.28 — перенумерация (A-N-1562): прежний 0.1.0-alpha.28, код не менялся · renumbering, code unchanged

## 0.1.0-alpha.28 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · резолв платформы в два шага, пути фермы в настройку · two-step platform resolution, farm paths in settings

- `marker-step.mjs`, `index.mjs`: пакет платформы разрешается от `process.argv[1]`, при ЛЮБОЙ ошибке — от `import.meta.url`, не вышло — громкий отказ с обеими причинами. Прежде запасной путь брался только при пустом `argv[1]`: другая форма запуска (argv[1] не путь или не платформа) роняла загрузку плагина у всех агентов.
- `marker-step.mjs`, `index.mjs`: the platform package resolves from `process.argv[1]`, on ANY error — from `import.meta.url`, otherwise a loud refusal naming both causes. Previously the fallback was used only with an empty `argv[1]`: another launch form (argv[1] not a path or not the platform) broke plugin loading for every agent.
- Пути внешних команд и файла режима — ключи файла настройки пакета `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf` (`DSH_PAMYAT_KOMPAKT_DSH_CONF`): `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY`, `KOMPAKT_JOURNALCTL`, `KOMPAKT_REZHIM_FAJL`; умолчания — прежние пути, без файла поведение прежнее. « #» в значении и нечитаемый файл — отказ загрузки с ключом/причиной.
- Paths of external commands and of the mode file are keys of the package settings file `/etc/dsh-pamyat-kompakt-dsh/dsh-pamyat-kompakt-dsh.conf` (`DSH_PAMYAT_KOMPAKT_DSH_CONF`): `KOMPAKT_AGENT_ALERT`, `KOMPAKT_AGENT_REGISTRY`, `KOMPAKT_JOURNALCTL`, `KOMPAKT_REZHIM_FAJL`; the defaults are the former paths, without a file the behaviour is unchanged. " #" in a value and an unreadable file are a load refusal naming the key/cause.
- `stend-svezhego-usage.mjs`: без соседа `dsh-pamyat-core` — названная СЛЕПОТА, код 2, а не трассировка `ERR_MODULE_NOT_FOUND`.
- `stend-svezhego-usage.mjs`: without the sibling `dsh-pamyat-core` — a named BLINDNESS, exit 2, not an `ERR_MODULE_NOT_FOUND` stack trace.
- Новый стенд `stend-nastrojki-i-rezolva.mjs` (6 проб); стендов 16.
- New stand `stend-nastrojki-i-rezolva.mjs` (6 probes); 16 stands.

## 0.1.0-alpha.27 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · находки приёмки и обезличивание кода · review findings and anonymised code

- marker-step: вытеснение новым эпизодом — своя фаза `superseded` (прежде `canceled`); отказ без отметки печатает код И текст ошибки; сообщения платформы (`dsh-llm/message`) — у той же установки, что движок (`process.argv[1]`), а не голым импортом; текст тревоги без номера задачи.
- marker-step: displacement by a new episode — its own phase `superseded` (previously `canceled`); a refusal without a marker prints the error code AND text; platform messages (`dsh-llm/message`) come from the same installation as the engine (`process.argv[1]`), not by a bare import; the alert text carries no task id.
- index.mjs: подпись `model` в ответе платформе — модель, которую выбрал `dsh-pamyat-kompakt` (его экспорт `KOMPAKT_MODEL`), а не окружение/умолчание; нет экспорта — «неизвестна».
- index.mjs: the `model` label in the answer to the platform is the model `dsh-pamyat-kompakt` chose (its `KOMPAKT_MODEL` export), not the environment/default; no export — "неизвестна" (unknown).
- continuation-mode: имена в файле режима Codex проверяются по форме `[a-z][a-z0-9_-]{0,31}`; зашитого перечня кодеров нет.
- continuation-mode: names in the Codex mode file are checked by the form `[a-z][a-z0-9_-]{0,31}`; there is no hard-coded coder list.
- Стенды: платформа — только `DSH_TEST_APP` (не задан — СЛЕПОТА, код 2), путей к чужим установкам нет; имена в фикстурах нейтральные; `stend-uderzhaniya` — `summarizationModel`/`maxTokens` вынесены из комментария в конфиг; `stend-sostava` — полный перечень обязательных; новые `stend-literala-hvosta` (сверка `STROKA_HVOSTA` с `dsh-pamyat-restore`) и `stend-fazy-otmetki`; `stend-hvosta` +1 проба (подпись модели). Ворота: KOD 20 → 0.
- Stands: the platform is `DSH_TEST_APP` only (unset — BLINDNESS, exit 2), no paths to other installations; neutral names in fixtures; `stend-uderzhaniya` — `summarizationModel`/`maxTokens` moved from a comment into the config; `stend-sostava` — the full mandatory list; new `stend-literala-hvosta` (`STROKA_HVOSTA` against `dsh-pamyat-restore`) and `stend-fazy-otmetki`; `stend-hvosta` +1 probe (the model label). Gate: KOD 20 → 0.

### Документация (выпускается в 0.1.0-alpha.27) · documentation (released in 0.1.0-alpha.27)

- Добавлены docs/ (ARCHITECTURE, SETTINGS, GUARDS, TROUBLESHOOTING); README переписан по разделам стандарта документации. Всё на двух языках: назначение, место в системе, схемы, каждая настройка, сторожа и стенды, частые поломки.
- Added docs/ (ARCHITECTURE, SETTINGS, GUARDS, TROUBLESHOOTING); the README is rewritten to the documentation standard outline. Everything in two languages: purpose, place in the system, diagrams, every setting, guards and stands, common failures.
- Комментарии в index.mjs, marker-step.mjs, continuation-mode.mjs и всех stend-*.mjs переписаны и дополнены на двух языках (RU/EN) и обезличены. Код не изменён: цепочка лексем без комментариев совпадает с прежней во всех 16 файлах.
- Comments in index.mjs, marker-step.mjs, continuation-mode.mjs and all stend-*.mjs rewritten and extended in two languages (RU/EN) and anonymised. Code unchanged: the comment-free token stream matches the previous one in all 16 files.
- package.json: двуязычные description и keywords; в files добавлен docs/.
- package.json: bilingual description and keywords; docs/ added to files.
- Прежние записи этого файла обезличены: имена агентов и людей, реальные пути и номера внутренних задач заменены ролями («координатор», «приёмщик», «исполнитель», «агент-N») и обозначениями. Смысл, числа и даты сохранены.
- Earlier entries of this file are anonymised: agent and person names, real paths and internal task ids are replaced with roles (coordinator, reviewer, implementer, agent-N) and placeholders. Meaning, numbers and dates are kept.

## 0.1.0-alpha.26 — 2026-10-01 (команда /stop; код исполнителя r1+r2 e7bef287, принят приёмщиком)

- `marker-step.mjs` (stopEvidence): продолжение после сжатия гасится ТОЛЬКО командой «/stop» (без учёта регистра) в начале сообщения человека из Telegram — рамка «[личный чат, от …]», source=user, отправитель из белого списка allowedUsers плагина; группы — та же рамка. Слова людей («стоп», «отмена», STOP в тексте), письма агентов, вебхуки и неизвестные источники продолжение НЕ гасят. Повод: 3 из 3 ложных отмен 01.10 (у трёх разных агентов).
- Новый `stend-stop-komandy.mjs`; `stend-otmetki.mjs` и README — под новое правило.
- Признак в бою: после сжатия с «стоп» в тексте письма — продолжение идёт; «/stop» владельца в Telegram — гасит.
- НЕ ЛОВИТ: перехват /stop до сообщения (адресация по номеру поручения — отдельная задача); /stop из канала без рамки Telegram (не гасит — по построению).

## 0.1.0-alpha.25 — 2026-10-01 (отметка узнаёт письмо-продолжение и Claude-шлюза; дельта исполнителя, принята приёмщиком; в паре со шлюзом подписки 0.4.24)

- `marker-step.mjs:34` (legacyLetter): уже принятое письмо шлюза узнаётся по метке «[шлюз Codex · продолжение после стопа]» ИЛИ «[шлюз Claude · продолжение после стопа]» (прежде — только Codex). Шлюз 0.4.24 кладёт Claude-агенту письмо со своей меткой; без правки marker видел в нём «внешний вход» (held_external) и будил агента ещё раз — лишний ход с текстом marker'а (петли нет, wake ≤ 2).
- Новый `stend-pisma-prodolzheniya.mjs`: настоящий installMarker, 6 сценариев (Codex/Claude/чужое × строка/блоки) — письма шлюза → canceled, побудок 0; чужое письмо → прежнее held_external.
- Признак в бою (после подъёма Claude-агента на шлюзе 0.4.24): после письма «[шлюз Claude · продолжение после стопа]» в журнале continuation-marker фаза canceled («legacy Codex letter already admitted» — прежний текст reason, семейство видно по самому письму), второй побудки нет.
- НЕ ЛОВИТ: письмо шлюза с иной меткой (например, переименованного шлюза) — пойдёт прежним путём held_external; сам факт доставки письма и его задержку marker не проверяет.

## 0.1.0-alpha.24 — 2026-09-30 (положительный след аудита продолжения; дельта исполнителя, принята приёмщиком)

- `marker-step.mjs`: после полного разбора журнала — одна строка «continuation audit: ok, путь direct|sudo, строк отметок N, unit <имя>». Прежде успех аудита молчал, и «молчание» было неотличимо от «аудит не звали»; теперь след есть в обоих путях (a23: прямой journalctl первым, sudo только при отказе прав).
- README и стенды `stend-dostupa-audita.mjs`, `stend-pustogo-audita.mjs` — ждут новую строку.
- Признак в бою после подъёма: у агента-3 «путь direct», у агента-2 (служба названа не по имени агента) «путь sudo».
- НЕ ЛОВИТ: строка говорит, что аудит прошёл, но не что отметок столько, сколько должно быть — число N здесь наблюдение, не сверка.

## 0.1.0-alpha.23 — 2026-09-30 (прямой journalctl первым, sudo только при отказе прав; дельта исполнителя, принята приёмщиком)

- `marker-step.mjs`: журнал службы сначала читается напрямую (`journalctl -u <служба>`); `sudo -n` зовётся ТОЛЬКО если прямой вызов дал код 1 и stderr «insufficient permissions» или «Permission denied». Прежде (a22) sudo звался всегда — у агента-3 нет NOPASSWD, и каждый его подъём слал владельцу «restart audit unavailable».
- README и стенды `stend-dostupa-audita.mjs`, `stend-pustogo-audita.mjs` — под новый порядок.
- Граница a22 про агента-3 — снята как исправленная (см. ниже).
- НЕ ЛОВИТ: учётку, которая не читает журнал И не имеет NOPASSWD (сейчас таких агентов с пакетом нет — агент-3 читает журнал своей службы напрямую); отказ прав с иным текстом stderr пойдёт тревогой, а не в sudo.

## 0.1.0-alpha.22 — 2026-09-30 (чтение аудита отметки — служба из реестра и journalctl через sudo; дельта исполнителя, принята приёмщиком)

- `marker-step.mjs`: имя службы агента берётся из реестра (`agent-registry pole <имя> sluzhba --json`) и проверяется образцом `^[a-z][a-z0-9_-]*\.service$`; журнал читается `sudo -n -- journalctl -u <служба> …`. Прежде служба угадывалась как `<имя>.service` (у агента-2 служба называется не по его имени), а его системная учётка системный журнал без sudo не читает — отсюда ложная тревога «continuation audit unavailable» на каждом подъёме.
- Новый `stend-dostupa-audita.mjs`; `stend-pustogo-audita.mjs` переведён на нового читателя (ответ реестра подставляется для уникальной службы).
- ~~🔴 ГРАНИЦА (условие приёмщика): sudo зовётся для ЛЮБОГО агента, у которого включён kompakt-dsh; у агента-3 NOPASSWD нет — при включении пакета «audit unavailable» на каждом подъёме.~~ ИСПРАВЛЕНО в a23: довод «пакет у агента-3 не грузится» снят по неверной маске (`[kompakt-dsh` вместо `[dsh-pamyat-kompakt-dsh`), пакет у агента-3 грузится с 30.09 — и ложная тревога была; a23 зовёт sudo только при отказе прав.
- НЕ ДЕЛАЕТ: не меняет FSM отметки, пороги и доставку; пустой аудит (rc1 без вывода) по-прежнему не тревога (a21).

## 0.1.0-alpha.21 — 2026-09-30 (пустой аудит; исходная дельта исполнителя)

- Пустой `journalctl --grep` с rc1, пустыми stdout/stderr и без killed/signal означает пустую историю отметок (нет совпадений с фильтром), а не недоступность аудита. Исправлена ложная тревога при первом подключении компактора. Дельта marker-step.mjs ed19b855 → 7a13115e, принято приёмщиком.
- НЕ ДЕЛАЕТ: отказы прав, таймаут, сигнал — по-прежнему тревога. Любой stderr, другой код отказа, переполнение буфера и ошибка JSON не подавляются. Пределы чтения 7 дней / 4 МиБ / 10 с прежние; agent-alert этим исключением не затронут.
- Новый stend-pustogo-audita.mjs: настоящий journalctl, уникальный идентификатор unit без строк; независимое чтение без фильтра подтверждает пустоту, grep даёт rc1 и пустой вывод; прежний модуль красный, исправленный зелёный. Настоящей тревоги и временного сервиса нет.
- НЕ ЛОВИТ: при непрерывной очереди продолжение откладывается без срока; отметка теряется при подъёме. held_external без срока принят координатором; предел счётом внешних ходов не вводится. Восстановления после restart нет.

## 0.1.0-alpha.20 — 2026-09-30 (отметка продолжения, вариант 2, шаг а; выпущено 30.09 — пометка «КАНДИДАТ» снята в a21 по слову координатора)

Отметка MODE=ACTIVE после сохранённой пары summary/checkpoint/end: чтение на pre-step после await next(), пробуждение idle, принятие детерминированного ID только после sessions.flush. Внешнее письмо обрабатывается первым; завершение его хода возвращает отметку в ready. Отмена/ошибка/срок ожидания запрещают продолжение. Срок 120 с идёт только при idle+ready с пустым ящиком, снимается при held_external/offered/выходе из idle и начинается заново после внешнего хода. Отсутствующий MODE — только строка журнала, без тревоги; настоящие сбои сохраняют held_error и agent-alert. Расход и пороги не меняются.

Codex по умолчанию использует прежнее письмо. Общий переключатель continuation-mode.json включает marker только согласованным переходом в паузе; шлюз с этой же настройкой не кладёт письмо. a19 с письмом Claude — SUPERSEDED, не монтировать.

НЕ ЛОВИТ: restart между сжатием и принятием — отметка теряется.
SIGKILL: «отметка теряется, продолжения нет, есть тревога». Тревога — при следующем подключении компактора, если в доступном журнале сохранилась незакрытая отметка; в ней агент, session и compactionId. Один просмотр, без таймера аудита и восстановления задачи; повтор той же отметки подавляется по alert-attempt в журнале. Попытка не означает доставку.
При следующей активации пресета — один диагностический просмотр журнала за 7 дней (4 МиБ, 10 с); незакрытый эпизод даёт одну попытку agent-alert, без восстановления задачи. Читатель тревоги — владелец через agent-alert. Утрата/ротация журнала за пределом окна и недоставленная тревога не восстанавливаются. НЕ ЛОВИТ: слова STOP/стоп/отмена в любом внешнем письме могут ложно отменить отметку (= прежний простой); причина пишется в журнал possible STOP/cancellation in external input, логика не менялась. Свободный STOP в ещё не опрошенном ящике не виден; распознавание отмены в тексте консервативное, семантическую отмену не гарантирует. Дедупликация диагностической тревоги опирается на сохранность журнала. states сохраняют один последний эпизод на сессию до конца процесса.

## 0.1.0-alpha.18 — 2026-09-30 (после окна перехода на DSH 0.2: стенды под DSH 0.2 — разбор и кандидат исполнителя (обвязка, не модуль); принято приёмщиком; код модуля НЕ менялся)

- `stend-uderzhaniya.mjs` (dfef48bd → eaf4924f): у самодельной сессии добавлены `eventAt`, `seq` и `headroomTokens: 0` — движок 0.2 их зовёт («session.eventAt is not a function»). Движки настоящие (BasicCompactionEngine 0.2.0-rc.2 + наш NashaSvodka): 10/10; порча подстановки удержания — 5/10.
- `stend-svezhego-usage.mjs` (45b7b614 → a633d92d у исполнителя + строка шапки): подстава в форме 0.2 — ответ с `stream`, `request/header` с `reason`, `meter.ctx`, `ctx.waterfall`, `snapshotEvents`; журнал — настоящей функцией ядра `sobytiyaSessii` через `ctx.get('pamyat')`. Шапка: стенд зависит от соседства пакетов в общем каталоге `node_modules` (импорт ядра по относительному пути `../dsh-pamyat-core/src/` — принят приёмщиком).
- Не беда, записано: наше удержание R = окно × retainRatio, у платформы 0.2 — (окно − резерв ответа) × retainRatio; при S/2 между ними удерживаем чуть больше платформы. Не чиним.
- Условие модуля на 0.2 (не стенда): без службы ядра `ctx.pamyat` журнал не читается — громко «🔴 журнал сессии недоступен», и прежняя беда ожидания usage возвращается. Служба есть у 9/9 с окна.

## 0.1.0-alpha.17 — 2026-09-29 (переход на DSH 0.2, кандидат исполнителя поверх a16; принят приёмщиком; ТОЛЬКО окном DSH, одним окном с ядром a97)

zhdyomUsage и сторож свежего usage читают журнал через службу ядра ctx.get('pamyat') — БЕЗ inject (pomoshchnikYadra,
sobytiyaDlyaUsage): DSH 0.1.1 events | 0.1.7+/0.2.0 snapshotEvents(). Службы/помощника нет — прежнее session.events. Журнал не
читается вовсе — «не жду» (null: сжатие идёт родным путём, не блокируется) и строка вслух один раз на сессию, а не TypeError на
events.length в слушателе session/event и на пути сжатия. Стенд stend-styka-sobytij.mjs.
Дельта второго кандидата (замечание приёмщика): vhodSHvostom (дословный хвост) тоже читает журнал через службу — прежде s?.events
давал на 0.2.0 «сессия агента недоступна» при каждом сжатии и хвост пропадал; нечитаемый журнал — своя причина. Индексы
snapshotEvents() 0.2.0 = seq (dsh-session :1455, :1376) — sobytiya[uzly[i]] прежний.
Перекладка третьего кандидата (29.09, по описи сопровождающего и наряду координатора): поверх a16 (отбой ожидания usage) — будет a17. poslednijEpizod a16 тоже читает журнал через службу ядра (pm, как zhdyomUsage; условие приёмщика); слушатель session/event: отбой a16 + чтение через ядро вместе. Стенд stend-styka-sobytij + stend-otboya-usage a16.

## 0.1.0-alpha.16 — 2026-09-29 (ожидание usage — остаток: отбой; кандидат исполнителя поверх a15)

Наряд координатора 29.09 (у приёмщика условия «отбой» не было — его вердикт a14 принял предел без отбоя): тревога «ожидание usage затянулось» (a14, K=3 завершённых хода) теперь закрывается ОДНИМ отбоем, когда после неё приходит свежий usage: poslednijEpizod() находит последний успешно закрытый эпизод, метка usage-alerts/<ключ>.json получает поле otboj (reserved → command_ok|command_failed) ДО отправки — перезапуск не повторяет. Тревога не дошла (command_failed) — отбоя нет. K=3 не менялся: замер 29.09 по сессиям трёх агентов-кодеров — 3 из 3 эпизодов сжатия получили usage через 0 завершённых ходов. Стенд stend-otboya-usage.mjs.

## 0.1.0-alpha.15 — 2026-09-29 (ожидание usage: путь установки стенда)

stend-predela-usage берёт установку платформы из DSH_TEST_APP, с прежним запасным путём, заданным в коде стенда. Прогон под другой учёткой с DSH_TEST_APP=<её установка платформы>: отказ основы, зелёный кандидат, порча и возврат. Исполняемый index.mjs не изменён.

## 0.1.0-alpha.14 — 2026-09-29 (предел ожидания usage)

После трёх уникальных завершений хода без свежего usage после успешного сжатия маршрута Codex — одна попытка agent-alert на эпизод; ожидание продолжается. Зовущий session/event turn/end, метка попытки сохраняется в DSH_HOME/kompakt-dsh/usage-alerts и не допускает повтора после рестарта. Предел включает завершение хода со сжатием. Ошибки канала/метки названы; 100с покрывают фиксированный цикл канала 3×20с с паузами5/15с. Новый стенд предела, ошибки, сброса и повторного подключения; коэффициент давления и чужие маршруты не меняются.

## 0.1.0-alpha.13 — 2026-09-29 (ожидание свежего usage на маршруте Codex; исполнитель)

После успешно закрытого сжатия на маршруте claude-oauth/gpt-* с основой tokenMeter.kind=usage повторное pressure-решение удерживается до нового assistant/message с usage. Внутренний retry платформы останавливается после commit; занятость не обнуляется. Ожидание восстанавливается из событий сессии. Ошибки, Claude/direct и context-overflow сохраняют прежний путь. Новый stend-svezhego-usage использует настоящие Session, TokenMeter и BasicCompactionEngine, подменяя только модель.

## 0.1.0-alpha.12 — 2026-09-26 (смена имени модели; разбор и код — исполнители)

`index.mjs`: ярлык модели в событии сводки платформе `process.env.KOMPAKT_MODEL ?? "deepseek-v4-flash"` → `?? "deepseek-flash"`. Ярлык, не вызов: модель зовёт dsh-pamyat-kompakt, здесь только подпись события. Источник имени — страницы поставщика https://api-docs.deepseek.com/news/news260910/ и /quick_start/pricing/ («Use deepseek-flash as the model name»; старое имя принимается «temporarily», срок не назван), снято и проверено живой пробой 26.09 (deepseek-flash → HTTP 200; старого имени в перечне поддерживаемых уже нет).

## 0.1.0-alpha.11 — 2026-09-26 (найдено ночным обходом стендов; код не менялся)

devDependencies: `dsh-pamyat-kompakt` — `file:../dsh-pamyat-kompakt`. `index.mjs:63` берёт соседа по имени (`trebovatSvoj.resolve`), а в ДЕРЕВЕ
у пакета не было node_modules со ссылкой на него: 3 из 4 стендов в раскладке дерева (временный каталог, без подложки) падали
`Cannot find module 'dsh-pamyat-kompakt'`. На бою ссылку `node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt` ставит монтаж, в
наборе dsh-pamyat сосед приходит своей строкой — поэтому именно dev, а не dependencies: `file:`-зависимость в dependencies ломает
установку метапакета (npm 11.17 «Cannot destructure property 'package' of 'node.target' as it is null», rc 1). Установка в дереве —
`npm install --offline` (ставит только ссылку; каталог соседа не трогает).

## 0.1.0-alpha.10 — 2026-09-25 (уборка временного в стендах; обёртка stend-hvosta (глухой); код не менялся)

Обёртка stend-hvosta: отказ на любой возврат тела ≠ undefined (по образцу соседних стендов; глухоту нашёл прибор проверки стендов — стенд тронут уборкой временного).

## 0.1.0-alpha.9 — 25.09.2026

**Удержание не больше половины поверхности (слово владельца 25.09 «ищем ловушку, пытаемся исправить»; вариант а2 —
решение координатора).** Платформа сравнивает порог с давлением (usage), удержание считает от окна (окно × retainRatio), а хвост набирает из
узлов поверхности; у шлюзовых агентов поверхность — только сообщения (52–75 тыс. на пороге при давлении 890 тыс.), и при 6% окна
selectCompactableRange молча отдавал null. Теперь наш движок переопределяет compactIfNeeded (платформа зовёт его динамически): на ветке
pressure удержание = min(окно × retainRatio, ⌊поверхность × ½⌋) (постоянная DOLYA_POVERHNOSTI) и подаётся платформе подстановкой
this.config на синхронную часть вызова. При поверхности ≥ 2 удержаний выбор побайтно прежний (агенты с большой поверхностью). Восстановление после
переполнения и маршрут с modelPolicies — прежним путём.
Громко вместо молча (console.error — строки ctx.logger.info платформы до журнала службы не доходят): «выбрать нечего: давление P ≥ порога T,
поверхность S < удержания U» / «… по балансу пар инструментов» / «… поверхность пуста»; сторож «🔴 платформа НЕ прочла подстановку
удержания» — если платформа начнёт читать политику после await, ловушка вернётся, и это будет слышно.
Попутное, не лечится: у шлюзовых после сжатия оценка давления = прежнее − вытесненное (трафик SDK в счёте до следующего ответа) ⇒ при
давлении далеко за порогом «still above threshold» (retries 0 ⇒ warn, ход идёт, сжатие записано). Стенд stend-uderzhaniya.mjs.

## 0.1.0-alpha.8 — 25.09.2026

**Строка о хвосте в конце сводки (слово владельца 25.09).** Агент читал сводку дважды: в поверхности
платформы и во вставке dsh-pamyat-restore. Теперь сводка одна — наша, в поверхности; если хвост подан (vhodSHvostom дал
≥1 сообщение), в её конец добавлена строка «Дальше — дословный хвост журнала до сжатия (N сообщ.): он не пересказан и
идёт как был.» Хвоста нет или стык не сошёлся — строки нет. Меняется только `summary`; `rawOutput` — ответ модели как был.
Начало строки экспортировано (`STROKA_HVOSTA`) — тот же литерал в dsh-pamyat-restore a33 (по нему он выбирает текст
побуждения и срезает строку в welcome). Строка журнала: «в конец сводки добавлена строка о хвосте (N сообщ.)».
Граница: +~30 токенов к обёрнутой сводке; платформа отказывает сжатию, если обёрнутая сводка не меньше затенённого.

## 0.1.0-alpha.7 — 24.09.2026

**Хвост из сессии агента .** summarize(input, agent) берёт хвост из agent.session: идёт по surface.nodes с начала,
выводит сообщения тем же session.deriveEventMessage, что buildSummarizationInput платформы (0.1.1-rc.2 :648), считает
непустые до длины головы; остаток surface — хвост. Стык проверяется содержимым (первое и последнее сообщения головы);
не сошлось или сессии нет — хвост НЕ подаётся, строка журнала с причиной, сводка как прежде. compactRegion не трогается.
Ручной и восстановительный пути (retain 0) дают пустой хвост — без изменений.
- Строка журнала: «наша сводка: … · хвост N зн. (M сообщ.) — подан, не пересказывается» / «хвост НЕ подан (причина)».
- Новый стенд `stend-hvosta.mjs` (5 проб, настоящий summarize на подставной сессии surface+events).
- Не доказано стендом: что живая сессия платформы устроена так же — снимет один живой компакт под наблюдением.
- Наряд — координатор; кандидат — сопровождающий пакета.

## 0.1.0-alpha.6 — 2026-09-23

Сосед dsh-pamyat-kompakt берётся ПО ИМЕНИ пакета, а не по абсолютному пути (шов Ш2 стенда швов).
Резолв — от самого пакета (createRequire(import.meta.url)), отказ громкий и называет лечение.
⚠️ Требует при монтаже ссылку node_modules/dsh-pamyat-kompakt → ../dsh-pamyat-kompakt:
kompakt не установлен как пакет, а `npm install` в общем каталоге плагинов сейчас откатил бы
шесть пакетов на закреплённые старые версии. Кандидат — сопровождающий пакета.

## 0.1.0-alpha.5 — 2026-09-18

/compact-status: разделены замер Codex и давление DSH; настройки берутся от работающего движка своего агента. Выход usage привязан к последнему вызову. Пороги и сжатие не перенастраиваются.

# dsh-pamyat-kompakt-dsh

Наша сводка компакта внутри РОДНОГО механизма платформы DeepSeek Harness.

## 0.1.0-alpha.1 — первый выпуск

**Зачем.** У агентов на родной платформе (агент-2) сводку компакта писала сама платформа.
Нам нужна наша сводка — с нашим промтом и нашей моделью, — но так, чтобы обновление
платформы ничего не ломало.

**Как сделано.** Платформа сама объявила точку расширения, дословно в своём коде:
«Override this sole hook for a template or remote summarizer.» Мы наследуем
`BasicCompactionEngine` и переопределяем ОДИН метод `summarize`.

    РОДНОЕ (не трогаем)  момент компакта · затенение узлов · границы · запись в журнал ·
                         возврат сводки в контекст · проверка «сводка меньше затенённого»
    НАШЕ (один метод)    чем и по какому промту написана сводка

**Граница отказа.** Если наша модель не ответила — НЕ роняем компакт и НЕ молчим:
кричим в журнал и отдаём работу родной сводке. Не сжать вовсе хуже, чем сжать чужим
промтом: агент упрётся в стену окна.

**🔴 Класс, купленный первым же подъёмом второго агента.** Первая редакция импортировала класс
платформы по ПРИБИТОМУ пути к одной установке платформы. У агента-2 работало, агента-1 уронило:
установок платформы на машине ДВЕ, у каждого агента
своя. Отказ был громкий и мгновенный — `preset failed to mount`, — и это лучшее, что
могло случиться: тихо агент-1 унаследовал бы ЧУЖОЙ движок.
Вылечено по устройству: класс берётся у ЗОВУЩЕГО через `createRequire(process.argv[1])`.
Проверено — резолв от двух установок даёт РАЗНЫЕ пути.

**След при создании.** Движок печатает строку в журнал, когда платформа его создаёт.
Без неё работающий движок неотличим от неподключённого: строка сводки появляется только
при компакте, а он бывает раз в сутки.

**Настройки — на агента, доля окна.** Порог задаётся ДОЛЕЙ (`thresholdRatio`), а не
числом токенов: доля переезжает вместе с моделью, штуки — нет. Сейчас 0.7 у обоих.

**Чего этот пакет НЕ делает.** Не считает токены и не решает, когда сжимать, — это
платформа. Не режет журнал — это платформа (`retainRatio`). Не пишет знания в память —
это секретарь.

**Не проверено на живом компакте.** Признак: в журнале обязаны появиться строка о
создании движка и строка «наша сводка: N зн. из M зн. прозы».

## 0.1.0-alpha.2 — модуль называет свою версию

**Зачем.** Из девяти наших пакетов этот был единственным, кто себя не называл: строки шли
как `[dsh-pamyat-kompakt-dsh]` и `[kompakt-nash]`, без номера. Цена не теоретическая —
приставка `[kompakt-nash]` СОВПАДАЕТ с приставкой соседнего пакета `dsh-pamyat-kompakt`,
и всякий счёт «строк kompakt в окне» молча считал ДВА прибора как один. Пока предмет не
называет версию, «какой код держит процесс» доказывается только косвенно — временем файла
на диске против времени старта службы.

**Как сделано.** Версия читается из манифеста ОДИН РАЗ при загрузке модуля и приставляется
одной общей функцией `pristavka`. Поведение не тронуто: меняется наблюдаемость, не работа.

**Почему один раз, а не при каждой печати.** Ленивое чтение заставило бы процесс со СТАРЫМ
кодом называть НОВЫЙ номер сразу после монтажа — то есть соврать ровно в том случае, ради
которого строка и заводится. Не прочиталось — говорим «версия неизвестна», а не подставляем
последний известный номер.

**Чем проверено.** `stend-pristavki.mjs`, 5 проб, три исхода:
целое 5 из 5 · порча «убрать версию из приставки» 3 из 5, код 1 · порча «вернуть голый
литерал в лог» 4 из 5, код 1 · снятие обеих — снова 5 из 5, сумма файла вернулась.
Пробы 1–3 судят по значению, ВЫДАННОМУ НАРУЖУ, а не по тексту файла; проба 4 — по
ВЫЗЫВАЮЩЕЙ СТОРОНЕ («функция верна» и «функция вызывается» — разные утверждения);
проба 5 — контроль зрячести образца пробы 4, внутри стенда, а не рядом.

**⚠️ Граница.** Стенд НЕ поднимает движок платформы: его конструктор требует настоящий
`ctx` фреймворка, и подставной ломался бы при каждом обновлении платформы по ЧУЖОЙ причине.
Значит связка «платформа зовёт наш конструктор» здесь не доказана — она снимается боем,
первой строкой в журнале после подъёма.

**⚠️ Хвост, в этот выпуск НЕ входит.** У пакета нет `files`: в состав уезжает всё, что лежит
в каталоге. Замером — тарбол предыдущей версии `dsh-pamyat-kompakt-dsh-0.1.0-alpha.1.tgz`
входит в состав, то есть выпуск везёт внутри себя предыдущий. Вред — раздутый пакет, не отказ.
Признак закрытия: посторонний файл в каталоге в состав НЕ попадает, обе настоящие части
(`index.mjs`, `package.json`) на месте.

## 0.1.0-alpha.4 — своё имя в приставке вместо чужого

**Предмет.** Рабочие строки шли под `[kompakt-nash …]` — той же приставкой, какой подписывается
СОСЕДНИЙ пакет `dsh-pamyat-kompakt`. Различало их лишь то, что номера версий разошлись
(`a11` против `a2`), то есть СОВПАДЕНИЕ ЗНАЧЕНИЙ, а не устройство. Дойди этот пакет до
`alpha.11` — строки слились бы МОЛЧА, и всякий счёт «строк kompakt в окне» снова считал бы
два прибора за один. Замер 14.09: под `[kompakt-nash]` за сутки 105 строк соседа и 95 наших
без версии — счёт был недостоверен именно так.

**Что сделано.** Оба вызова печати идут под своим именем: `[kompakt-dsh <версия>]`.
Поведение не тронуто — меняется только подпись строки.

**Проверено.** Стенд `stend-pristavki.mjs` — 7 из 7 (добавлены проба 6 «в вызовах нет чужого
имени» и проба 7 — контроль её зрячести внутри стенда). Порча (вернуть `kompakt-nash`)
роняет ровно пробу 6: 6 из 7; снятие вернуло сумму `index.mjs` знак в знак
(`6d34038d3b2274b4`).

⚠️ **ГРАНИЦА ПАКЕТА, названная отдельной строкой (по замеру приёмки 14.09).** Пакет привязан
к КАТАЛОГУ ПЛАГИНОВ ЭТОЙ МАШИНЫ: `index.mjs` берёт сводку абсолютным импортом из
`<общий каталог плагинов>/dsh-pamyat-kompakt/index.mjs`. Сейчас это работает, потому что установки
платформы делят один каталог плагинов. На другой машине или при смене каталога пакет
сломается — причину искать здесь, а не в коде сводки. Это ХРУПКОСТЬ, не дефект: решение
менять подключение не принято.

## 0.1.0-alpha.3 — состав задаётся белым списком

**Зачем.** У пакета не было `files` ВООБЩЕ — единственного из шестнадцати в дереве.
Без белого списка в выпуск уезжает всё, что лежит рядом с манифестом. Проверено не
рассуждением, а сборкой настоящего тарбола: подставной файл, страховка `index.mjs.bak-*`
и тарбол предыдущей версии попали в состав все три — 6 файлов вместо 4.

**Почему не стреляло до сих пор.** Выпуск собирают ИЗ МЕТКИ, а в дереве версий тарбола
и страховок нет. Заряжено с 12.09, когда `dsh-pamyat-kompakt-dsh-0.1.0-alpha.1.tgz` лёг в
рабочий каталог. Выстрелило бы у первого, кто соберёт пакет из рабочего каталога.

**Как сделано.** `files: ["index.mjs", "CHANGELOG.md", "stend-*.mjs"]`. `package.json` npm
включает сам. Поведение не тронуто: код тот же, версия в приставке та же механика.

**Цена выбора, названа ДО работы.** Стенды взяты ОБРАЗЦОМ `stend-*.mjs`, а не поимённо.
Поимённый перечень строже к постороннему файлу с нашим именем, но ронял бы каждый НОВЫЙ
стенд из состава МОЛЧА. Молчаливая пропажа дороже лишнего файла — тот же выбор, что у
`dsh-pamyat-kompakt` в a7.

**Чем проверяется.** `stend-sostava.mjs` собирает настоящий тарбол и читает `tar tzf` —
проверяется УСТРОЙСТВО, а не написание: признак по слову «files» в манифесте соврал бы
зелёным при опечатке внутри списка. Контроль зрячести стоит ВНУТРИ стенда: тот же каталог
без `files` обязан дать мусор в составе, иначе «мусора нет» означало бы и «список работает»,
и «мусор не доехал до копии».

    целое                         6 из 6, код 0
    порча: снять files            3 из 6, КОД 1 (краснеют ровно три пробы про мусор)
    снятие порчи                  6 из 6, сумма манифеста вернулась знак в знак

**Границы.** Стенд работает на КОПИИ в /tmp и про боевой каталог не говорит ничего.
Боем не проверено: в бою alpha.1, монтаж не моя рука.
