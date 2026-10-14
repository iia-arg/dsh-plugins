# История изменений · Changelog

## 3.1.1 — аудит A-N-1948 №19 · audit A-N-1948 module 19

Переход 1.0.0 → 3.1.1 намеренный: правило владельца от 10.10.2026 — каждому готовому модулю номер 3.1.1. Это версия обвязки, не whisper.cpp или модели.

The 1.0.0 → 3.1.1 jump is intentional: the owner's 2026-10-10 rule assigns 3.1.1 to each completed module. This is the wrapper version, not whisper.cpp or model versions.

- Фильтр принимает выражения с начальным дефисом; холодный запуск передаёт язык одним доводом, включая auto; multipart сохраняет запятые, точки с запятой, кавычки и обратную косую в пути. Порог усиления передаётся awk как данные; SAGE_KUSOK <1 немедленно отказывается с причиной, сырой текст сохраняется.
- The filter accepts patterns starting with a dash; cold execution passes one language argument, including auto; multipart preserves commas, semicolons, quotes and backslashes in paths. Gain thresholds reach awk as data; SAGE_KUSOK <1 refuses promptly with a reason and preserves raw text.
- Архив захватывает только успешный вывод движка, создаёт каталог 0700 и файлы 0600. Сторож сравнивает Unicode независимо от локали, требует root, называет неполную запись агента и использует порядковое имя временного файла.
- The archive captures only successful engine output, creates directory mode 0700 and file mode 0600. The watcher compares Unicode independently of locale, requires root, reports incomplete agent entries and uses numbered temporary filenames.
- Установка включает сторожа и его внешние зависимости, venv корректора и групповой журнал; документы называют таймер, VOICE_ARCHIVE_DISABLE/код 2, зависимость захвата оригинала от TMPDIR и честную область трёх стендов. Убраны мёртвые STT-фикстуры и управляющий байт комментариев.
- Installation covers the watcher and its external dependencies, the corrector venv and a caller-group log; documentation names the timer, VOICE_ARCHIVE_DISABLE/exit 2, TMPDIR-dependent source capture and the three stands' scope. Dead STT fixtures and the comment control byte are removed.

## 1.0.0 — номер X.Y.Z вместо даты-метки · X.Y.Z instead of a dated tag

- Номер обвязки, не движка: 1.0.0 — номер этого пакета (скрипты распознавания и синтеза, юниты, сторож), а не версия whisper.cpp, модели или иных программ, которые он зовёт. · The wrapper's own number, not the version of whisper.cpp, the model or other engines it calls.
- Ворота выпуска читают версию только в форме X.Y.Z (у пакета без package.json — из верхнего заголовка этого файла), поэтому датированные метки `voice-stack-r20261007-rN` заменены номером; следующая метка — `voice-stack-v1.0.0`. Прежние метки не переносятся. · The release gate reads only X.Y.Z; dated tags are replaced by this number.
- Состав — как у метки `voice-stack-r20261007-r4`. Код не менялся. · Contents as tagged voice-stack-r20261007-r4; no code changes.

## 2026-10-07 — гости Варвары без архива голоса · guests skip the voice archive (r4, B-N-1691)

`bin/transcribe-local-shared` 70e7776a → 117d7c11 (+12/−2, Бета; ворота Вениамина 17:41Z): `VOICE_ARCHIVE_DISABLE=1` у гостей Варвары — `archive_capture` не зовётся; флаг ставится до чтения конфига; значение не 0/1 → код 2. Остальные файлы не менялись.

`bin/transcribe-local-shared`: `VOICE_ARCHIVE_DISABLE=1` (Varvara guests) skips `archive_capture`; the flag is set before the config is read; a value other than 0/1 exits 2.

Метка r2 перенесена c8227bb → aadebaf 07.10, только README −2, по исключению (условие Вениамина 07.10: впредь — новая метка, не перенос).

## 2026-10-07 — юниты сторожа golos-watch · golos-watch units (следующая ревизия после r2)

В `systemd/` добавлены юниты сторожа, чей `bin/golos-watch` уже в пакете: `golos-watch.service`, `golos-watch.timer` и drop-in `golos-watch.service.d/{10-golos-reestr.conf,60-bash-padenie-70.conf}` — побайтно как в `/etc/systemd/system/`. Прежде они не были ни в одном пакете. README — раскладка и установка. Код не менялся.

Added the units of the `golos-watch` watcher (its `bin/golos-watch` was already here): service, timer and two drop-ins, byte-for-byte as deployed. They were previously in no package. README documents layout and install. No code changes.

## 2026-10-07 — юниты как в бою · units as deployed (метка — по выпуску)

`systemd/` приведён к раскладке боя: базовые `sage-warm.service` и `whisper-warm.service` побайтно как в `/etc/systemd/system/`, плюс их drop-in: `sage-warm.service.d/{10-voice-user.conf,20-ozhidanie-soketa.conf}`, `whisper-warm.service.d/{10-voice-user.conf,10-workdir.conf,30-chain.conf}`. Прежняя «свёрнутая» редакция (всё в одном файле) снята: по действию она совпадала с боем, по носителю — нет, и сверка не видела drop-in. README, шаг 3 — раскладка и установка drop-in. Обёртки `bin/` не менялись.

`systemd/` now matches production layout: the base units byte-for-byte as in `/etc/systemd/system/` plus their drop-ins (listed above). The former single-file "folded" units are dropped: they behaved the same but did not match on disk, and verification could not see the drop-ins. README step 3 documents the layout and drop-in install. `bin/` unchanged.

## 2026-10-07 — снят hermes-stt-command · hermes-stt-command removed (метка voice-stack-r20261007)

Переходник command-STT `bin/hermes-stt-command` убран из пакета по слову владельца 07.10.2026 («не нужен»); вместе с ним — его 6 проб в test/stend-voice-tools.py, строка HERMES_STT_CHAIN и упоминания в README/docs. Остальной код не менялся.

The command-STT adapter `bin/hermes-stt-command` is removed (owner decision 2026-10-07): with it its 6 probes, the HERMES_STT_CHAIN setting row and README/docs mentions. No other code changed.

## Изменения, включённые в 1.0.0 · Changes included in 1.0.0

### 2026-10-04 — диагностика отключённого архива · disabled archive diagnostic

После чтения конфига пустой `PENDING_DIR` сопровождается строкой stderr «архив голосовых выключен: PENDING_DIR не задан». Распознавание, stdout и коды возврата сохранены; заданный каталог архивируется как прежде.

After reading the config, an empty `PENDING_DIR` emits the stderr line “архив голосовых выключен: PENDING_DIR не задан” (“voice archive disabled: PENDING_DIR is unset”). Transcription, stdout and exit codes are preserved; a configured directory is archived as before.

### 2026-10-04 — инструменты сторожа и command-STT · watcher and command-STT tools

Добавлены golos-watch и hermes-stt-command с проверенными боевыми алгоритмами. Путь реестра сторожа задаёт GOLOS_REESTR с нейтральным умолчанием; комментарии RU/EN, пример настройки и стенд идут вместе. При установке переносите действующий путь реестра в окружение вызывающего. Лицензия собственного кода — MIT; см. LICENSE.

Added golos-watch and hermes-stt-command with verified runtime algorithms. GOLOS_REESTR selects the watcher's registry with a neutral default; paired comments, a settings example and the stand are included. On installation, carry the current registry path into the caller's environment. Own-code license: MIT; see LICENSE.

### 2026-10-04 — нейтральная диагностика шумодава · neutral denoiser diagnostic

Из строки stderr об отключённом по умолчанию шумодаве убрана внутренняя метка поручения. Условия включения, распознанный текст, коды возврата и выбор горячего/холодного пути не меняются.

Removed an internal work-item label from the stderr line announcing that denoising is off by default. Activation conditions, transcription output, exit codes and warm/cold path selection are unchanged.

### 2026-10-04 — документация перенесена на новую кодовую базу · documentation moved to the new code base

Документация и комментарии в коде приведены к новой кодовой базе пакета. Строки кода взяты из неё без изменений; сверка без комментариев — ноль расхождений. Что изменилось в коде и теперь описано:

Documentation and code comments are brought to the package's new code base. Code lines are taken from it unchanged; a comment-stripped comparison shows zero differences. What changed in the code and is now documented:

- Умолчания цепочки указывают на файлы пакета: `SAGE_INNER_TRANSCRIBER` — `/usr/local/bin/transcribe-local-shared`, `REAL_TRANSCRIBER` — `/usr/local/bin/transcribe-whispercpp-core`. Цепочка по умолчанию: канал → `transcribe-correct-wrap` → `transcribe-local-shared` → ядро; корректор стоит снаружи архива. Раздел о «двух стрелках на файлы, которых нет в пакете», и инструкция замыкать цепочку через конфиг удалены; совет ставить корректор в `REAL_TRANSCRIBER` убран — при новых умолчаниях это петля.
- Chain defaults point at package files: `SAGE_INNER_TRANSCRIBER` is `/usr/local/bin/transcribe-local-shared`, `REAL_TRANSCRIBER` is `/usr/local/bin/transcribe-whispercpp-core`. Default chain: channel → `transcribe-correct-wrap` → `transcribe-local-shared` → core; the corrector sits outside the archive. The section about "two arrows pointing at files not in the package" and the instructions for closing the chain via the config are removed; the advice to put the corrector into `REAL_TRANSCRIBER` is dropped — with the new defaults that is a loop.
- `transcribe-local-shared`: новая проверка наличия движка — код 4 и строка `ДВИЖКА НЕТ` вместо прежних кода 127 и пустого текста.
- `transcribe-local-shared`: a new engine existence check — exit 4 and a `ДВИЖКА НЕТ` line instead of the former exit 127 and empty text.
- `transcribe-whispercpp-core`: `DENOISE` по умолчанию `0`; незаданное или пустое значение объявляется строкой в stderr, значение не `0`/`1` шумодав не включает и тоже объявляется; `DENOISE=1` без venv пишет `ШУМОДАВА НЕТ`.
- `transcribe-whispercpp-core`: `DENOISE` defaults to `0`; an unset or empty value is announced on stderr, a value other than `0`/`1` does not enable the denoiser and is announced too; `DENOISE=1` without a venv prints `ШУМОДАВА НЕТ`.
- `transcribe-correct-wrap`: язык хранится в `YAZ`, а не в `LANG`; новые настройки `SAGE_LOG`, `SAGE_HALLUC_FILTER`, `SAGE_ZAMENY`, `SAGE_KUSOK` (600), `SAGE_BUDZHET` (45 с), `SAGE_CLIENT_TIMEOUT` (20 с); пропажа файла фильтра пишется в журнал системы; новые шаги — срез хвостовой галлюцинации и подстановка терминов (до и после корректора).
- `transcribe-correct-wrap`: the language is kept in `YAZ`, not `LANG`; new settings `SAGE_LOG`, `SAGE_HALLUC_FILTER`, `SAGE_ZAMENY`, `SAGE_KUSOK` (600), `SAGE_BUDZHET` (45 s), `SAGE_CLIENT_TIMEOUT` (20 s); a missing filter file is written to the system journal; new steps — trailing-hallucination cut and term substitution (before and after the corrector).
- Клиент корректора зовётся иначе: вместо одного вызова с пределом 25 с — коррекция кусками через встроенный помощник, предел куска `SAGE_CLIENT_TIMEOUT`+5 с, общий бюджет, жёсткий предел шага 70 с, счёт неисправленных кусков в журнале и в журнале системы. Недоступный на запись журнал больше не выключает коррекцию, но выключает подстановку и срез хвоста.
- The corrector client is called differently: instead of one call with a 25 s limit — chunked correction through an embedded helper, a per-chunk limit of `SAGE_CLIENT_TIMEOUT`+5 s, an overall budget, a hard 70 s step limit, a count of uncorrected chunks in the log and in the system journal. An unwritable log no longer disables correction, but it disables substitution and the tail cut.
- `whisper-warm.service`: `WorkingDirectory=/var/lib/whisper-warm` (юнит его не создаёт · the unit does not create it), `Type=exec`, `Wants=network-online.target`, `GGML_VK_VISIBLE_DEVICES=0`, `TimeoutStartSec=180`, `MemoryMax=8G`, `Nice=-5`; `Restart=on-failure`, `RestartSec=5` — без изменений · unchanged.
- `sage-warm.service`: `Restart=always`, `RestartSec=3` (было · was `on-failure`, `5`), ожидание сокета в `ExecStartPost` до 180 с · socket wait in `ExecStartPost` up to 180 s, `TimeoutStartSec=200`, `MemoryMax=2G`, `SupplementaryGroups=video render`, `After=network.target`.
- Описано ограничение: в цепочке с корректором архив на тихой записи сохраняет нормализованный `.wav` вместо исходного аудио.
- A limitation is documented: in the chain with the corrector, on a quiet recording the archive stores the normalised `.wav` instead of the source audio.

### Документация · Documentation

README переписан по единому стандарту документации: двуязычные пары абзацев, десять разделов, схема места в системе, таблица настроек, честный раздел «Границы». Сохранён раздел «Что выглядит успехом, но им не является».

README rewritten to the common documentation standard: bilingual paragraph pairs, ten sections, a placement diagram, a settings table, an honest "Limits" section. The "Things that look like success and are not" section is kept.

Добавлены `docs/ARCHITECTURE.md` (схемы взаимодействия, поток одного голосового, состояния ядра, коды возврата), `docs/SETTINGS.md` (каждая настройка с умолчанием и последствием ошибки), `docs/GUARDS.md` (что ловит и чего не ловит каждая проверка) и `docs/TROUBLESHOOTING.md`.

Added `docs/ARCHITECTURE.md` (interaction diagrams, one voice message flow, core states, exit codes), `docs/SETTINGS.md` (every setting with its default and failure consequence), `docs/GUARDS.md` (what each check catches and does not catch) and `docs/TROUBLESHOOTING.md`.

Описана реальная цепочка: прежний README предлагал направить канал на `transcribe-local-shared`, но её умолчание `REAL_TRANSCRIBER` и умолчание `SAGE_INNER_TRANSCRIBER` у обёртки корректора указывают на файлы, которых в пакете нет. Теперь показано, как собрать цепочку из частей пакета через конфиг.

The real chain is documented: the previous README said to point the channel at `transcribe-local-shared`, but its `REAL_TRANSCRIBER` default and the corrector wrapper's `SAGE_INNER_TRANSCRIBER` default point at files not shipped in the package. It now shows how to build the chain from the package's parts via the config.

### Комментарии в коде · Code comments

Комментарии в `bin/*` и `systemd/*` стали двуязычными (`# RU:` / `# EN:`) и дополнены: зачем, что делает, чего не ловит. Исправлено имя в шапке `transcribe-local-shared` (прежняя шапка называла файл `transcribe-archive-wrap`) и имя клиента в шапке `transcribe-correct-wrap`. Строки кода не менялись: сверка без комментариев даёт ноль расхождений.

Comments in `bin/*` and `systemd/*` are now bilingual (`# RU:` / `# EN:`) and extended: why, what, what is not caught. Fixed the name in the `transcribe-local-shared` header (the old header called the file `transcribe-archive-wrap`) and the client name in the `transcribe-correct-wrap` header. No code lines changed: a comment-stripped comparison shows zero differences.
