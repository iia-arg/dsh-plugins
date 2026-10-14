# Поломки и лечение · Troubleshooting

Каждая запись: признак → причина → лечение. Записи взяты из реальных поломок и из того, что следует из кода. Сначала проверяйте пробник: пустой ответ — это ответ про запрос, а не про данные.

Each entry: symptom → cause → fix. Entries come from real breakages and from what follows from the code. Check your probe first: an empty answer is an answer about the query, not about the data.

## Распознавание висит, процессы множатся · Recognition hangs, processes multiply

Признак: вызов не возвращается, в `ps` растёт число процессов `transcribe-*`, журналы пусты.

Symptom: the call never returns, `ps` shows a growing number of `transcribe-*` processes, logs are empty.

Причина: петля вызовов. Прямую петлю (`REAL_TRANSCRIBER` на саму обёртку) нынешняя версия ловит кодом 3; косвенную — нет. Самая вероятная косвенная: `REAL_TRANSCRIBER=/usr/local/bin/transcribe-correct-wrap` в конфиге — обёртка корректора по умолчанию зовёт `transcribe-local-shared`, та снова её.

Cause: a call loop. The current version catches a direct loop (`REAL_TRANSCRIBER` pointing at the wrapper itself) with exit 3; an indirect one is not caught. The most likely indirect one: `REAL_TRANSCRIBER=/usr/local/bin/transcribe-correct-wrap` in the config — the corrector wrapper calls `transcribe-local-shared` by default, which calls it again.

Лечение: остановите процессы, выпишите цепочку по конфигу и окружению: кто кого зовёт. Корректор ставится СНАРУЖИ (канал зовёт `transcribe-correct-wrap`), последним звеном обязано быть ядро `transcribe-whispercpp-core`.

Fix: kill the processes, write the chain out from the config and environment: who calls whom. The corrector goes OUTSIDE (the channel calls `transcribe-correct-wrap`); the last link must be the core, `transcribe-whispercpp-core`.

## Пустой текст и код 4 «ДВИЖКА НЕТ» · Empty text and exit 4 "ДВИЖКА НЕТ"

Признак: агент получает пустую расшифровку; при ручном запуске код 4 и `transcribe: ДВИЖКА НЕТ: REAL_TRANSCRIBER=… не найден или не исполняем.` в stderr.

Symptom: the agent gets an empty transcript; run by hand, exit 4 and `transcribe: ДВИЖКА НЕТ: REAL_TRANSCRIBER=… не найден или не исполняем.` ("no engine: not found or not executable") on stderr.

Причина: файла `REAL_TRANSCRIBER` нет по пути (по умолчанию `/usr/local/bin/transcribe-whispercpp-core`), конфиг переназначил его на несуществующий путь, или файл скопирован без бита исполнения (в дереве пакета файлы `bin/*` лежат с правами `0644`).

Cause: there is no `REAL_TRANSCRIBER` file at the path (default `/usr/local/bin/transcribe-whispercpp-core`), the config reassigned it to a non-existent path, or the file was copied without the exec bit (in the package tree the `bin/*` files have mode `0644`).

Лечение: поставьте обёртки через `sudo install -m 0755 bin/transcribe-* /usr/local/bin/` и проверьте `REAL_TRANSCRIBER` в конфиге. Из окружения `REAL_TRANSCRIBER` не читается.

Fix: install the wrappers with `sudo install -m 0755 bin/transcribe-* /usr/local/bin/` and check `REAL_TRANSCRIBER` in the config. `REAL_TRANSCRIBER` is not read from the environment.

Если код 127 и `No such file or directory` — пропал `SAGE_INNER_TRANSCRIBER` обёртки корректора (по умолчанию `/usr/local/bin/transcribe-local-shared`).

If it is exit 127 and `No such file or directory` — the corrector wrapper's `SAGE_INNER_TRANSCRIBER` is missing (default `/usr/local/bin/transcribe-local-shared`).

## Английская речь возвращается русским переводом · English speech comes back as a Russian translation

Признак: сказано по-английски, получен русский текст того же смысла.

Symptom: spoken in English, received Russian text with the same meaning.

Причина: в движок ушёл язык `ru`, хотя сервер поднят с `--language auto`. Раньше обёртка жёстко передавала `ru`; сейчас — значение `$2`, иначе `DEFAULT_LANG`, иначе `ru`.

Cause: the engine received language `ru` although the server runs with `--language auto`. The wrapper used to hard-code `ru`; now it passes `$2`, else `DEFAULT_LANG`, else `ru`.

Лечение: передавайте `auto` из канала. `DEFAULT_LANG=auto` в конфиге помогает, только если канал зовёт `transcribe-local-shared` напрямую: обёртка корректора без `$2` сама подставляет `ru`, и `DEFAULT_LANG` до дела не доходит.

Fix: pass `auto` from your channel. `DEFAULT_LANG=auto` in the config helps only if the channel calls `transcribe-local-shared` directly: without `$2` the corrector wrapper substitutes `ru` itself, and `DEFAULT_LANG` never comes into play.

## Русская речь распознаётся как английская, только иногда · Russian speech comes out as English, only sometimes

Признак: обычно всё верно, но иногда русская речь превращается в английский текст; в stderr при этом `falling back to cold run`.

Symptom: usually correct, but sometimes Russian speech becomes English text; meanwhile stderr shows `falling back to cold run`.

Причина: горячий сервер был недоступен, сработал холодный путь. В версиях до 3.1.1 при auto ядро пропускало -l (умолчание whisper-cli — en); 3.1.1 передаёт -l auto.

Cause: the warm server was unavailable and the cold path ran. Before 3.1.1 the core omitted -l for auto (whisper-cli defaults to en); 3.1.1 passes -l auto.

Лечение: передавайте конкретный язык, если он известен; выясните, почему лёг горячий сервер (`journalctl -u whisper-warm`).

Fix: pass a concrete language when known; find out why the warm server went down (`journalctl -u whisper-warm`).

## Распознаёт секундами, а не долями секунды · Seconds instead of fractions of a second

Признак: каждое голосовое обрабатывается несколько секунд.

Symptom: every voice note takes several seconds.

Причина: либо каждый вызов идёт холодным путём (`unreachable` в stderr — порт не совпадает с юнитом или служба лежит), либо сервер работает без GPU (нет групп устройств у живого процесса, или движок собран без GPU-бэкенда).

Cause: either every call goes the cold path (`unreachable` on stderr — the port does not match the unit or the service is down), or the server runs without the GPU (the live process lacks device groups, or the engine was built without a GPU backend).

Лечение: сверьте `WHISPERCPP_PORT` с `--port` в юните; проверьте `sudo grep ^Groups /proc/<pid>/status` у живого процесса; перезапустите службу после изменения групп — добавление в группу задним числом до работающего процесса не доходит.

Fix: match `WHISPERCPP_PORT` with `--port` in the unit; check `sudo grep ^Groups /proc/<pid>/status` on the live process; restart the service after group changes — membership added later does not reach a running process.

## Холодный путь отвечает кодом 3 · Cold path exits with 3

Признак: при недоступном сервере расшифровка пустая, в stderr `cold fallback impossible: … missing`.

Symptom: with the server unavailable the transcript is empty, stderr says `cold fallback impossible: … missing`.

Причина: `whisper-cli` не собран или лежит не по пути `$WHISPER_HOME/build-vulkan/bin/whisper-cli`.

Cause: `whisper-cli` was not built or does not sit at `$WHISPER_HOME/build-vulkan/bin/whisper-cli`.

Лечение: соберите его в той же сборке, что и сервер, и прогоните ядро при остановленном сервере.

Fix: build it in the same build as the server and run the core with the server stopped.

## Служба сломалась после переноса на служебную учётку · Service broke after moving to the service account

Признак: юнит не стартует или обёртка не находит файлы после смены `User=`.

Symptom: the unit fails to start or a wrapper cannot find files after changing `User=`.

Причина: код, модель или словарь лежали в домашнем каталоге человека.

Cause: code, model or glossary lived in a person's home directory.

Лечение: перенесите всё в каталог службы (`/opt/whisper.cpp`, `/opt/sage-corrector`) и проверьте не только юнит, но и умолчания в обёртках.

Fix: move everything into the service's directory (`/opt/whisper.cpp`, `/opt/sage-corrector`) and check not only the unit but also the wrappers' defaults.

## На тишине агент получает «речь» · Agent receives "speech" from silence

Признак: пустая или шумная запись даёт короткую гладкую фразу вроде титров.

Symptom: an empty or noisy recording yields a short smooth phrase, like subtitles.

Причина: галлюцинация Whisper. Фильтр её не поймал: нет файла фильтра (тогда в `journalctl -t transcribe-correct-wrap` строка `фильтр галлюцинаций НЕ НАЙДЕН`), нет подходящего выражения, текст длиннее 120 символов, или регистр кириллицы не совпал при локали вызывающего без UTF-8.

Cause: a Whisper hallucination. The filter missed it: no filter file (then `journalctl -t transcribe-correct-wrap` shows `фильтр галлюцинаций НЕ НАЙДЕН`), no matching pattern, text longer than 120 characters, or a Cyrillic case mismatch under a non-UTF-8 caller locale.

Лечение: добавьте выражение в файл фильтра (`SAGE_HALLUC_FILTER`, по умолчанию `$SAGE_HOME/hallucination-filter.txt`) в том регистре, в каком фраза пришла, и проверьте тремя пробами (см. GUARDS.md).

Fix: add a pattern to the filter file (`SAGE_HALLUC_FILTER`, default `$SAGE_HOME/hallucination-filter.txt`) in the case the phrase arrived in, and test with three probes (see GUARDS.md).

## Тихие записи не распознаются · Quiet recordings are not recognised

Признак: тихое голосовое даёт пусто или дежурную фразу.

Symptom: a quiet voice note gives empty text or a stock phrase.

Причина: усиление не сработало: нет ffmpeg, громкость выше порога, нечисловой `GAIN_THRESHOLD_DB`, нельзя создать временный файл, или цепочка идёт мимо `transcribe-correct-wrap` (усиление есть только в нём).

Cause: gain did not run: no ffmpeg, loudness above the threshold, non-numeric `GAIN_THRESHOLD_DB`, temporary file cannot be created, or the chain bypasses `transcribe-correct-wrap` (gain exists only there).

Лечение: проверьте строку `gain: … -> normalized` в `SAGE_LOG` (по умолчанию `corrector.log`); её отсутствие на тихой записи — признак, что шаг не выполнился.

Fix: look for `gain: … -> normalized` in `SAGE_LOG` (default `corrector.log`); its absence on a quiet recording means the step did not run.

## Корректор не правит текст · Corrector does not change the text

Признак: пунктуация и регистр такие же, как у сырого распознавания; ошибок нигде нет.

Symptom: punctuation and casing are the same as raw recognition; no errors anywhere.

Причина: одно из предусловий не выполнено (код ≠ 0, нет интерпретатора, нет клиента, нет сокета) — тогда нет ни итога, ни строки; или куски ушли без коррекции (клиент вернул пусто или `passthrough`, предел куска, бюджет `SAGE_BUDZHET`, жёсткий предел 70 с) — тогда это видно по итогу.

Cause: a precondition failed (code ≠ 0, no interpreter, no client, no socket) — then there is neither a summary nor a line; or chunks went uncorrected (the client returned empty or `passthrough`, the per-chunk limit, the `SAGE_BUDZHET` budget, the hard 70 s limit) — then the summary shows it.

Лечение: посмотрите последнюю строку `ИТОГ корректора` в `SAGE_LOG` и `journalctl -t transcribe-correct-wrap`. Нет итога вовсе — от имени вызывающей учётки проверьте `test -S /run/sage-corrector/sage.sock`, `test -f` клиента и `systemctl status sage-warm`.

Fix: look at the last `ИТОГ корректора` line in `SAGE_LOG` and at `journalctl -t transcribe-correct-wrap`. No summary at all — as the calling account check `test -S /run/sage-corrector/sage.sock`, `test -f` on the client and `systemctl status sage-warm`.

## Слова разорваны точкой · Words split by a full stop

Признак: «распозн. Далась», «what your country can. Do for you.»

Symptom: "распозн. Далась", "what your country can. Do for you."

Причина: корректору подали текст построчно — каждая строка-сегмент стала предложением. Нынешняя версия склеивает строки перед коррекцией.

Cause: the corrector was fed line by line — each segment line became a sentence. The current version joins lines before correction.

Лечение: убедитесь, что стоит актуальная `transcribe-correct-wrap` (в ней есть строка с `tr '\n' ' '`).

Fix: make sure the current `transcribe-correct-wrap` is installed (it contains a line with `tr '\n' ' '`).

## Сказал ключевое слово, а в архиве пусто · Said the keyword, archive is empty

Признак: голосовое начиналось с «паблик», файла в архиве нет.

Symptom: the voice note began with "паблик", no file in the archive.

Причина: `VOICE_ARCHIVE_DIR` записан в конфиге (там он не действует — нужен `PENDING_DIR`); каталог нельзя создать; распознавание исказило первое слово; перед словом оказалось другое слово; ключ в конфиге написан не в нижнем регистре. Архив о своих отказах не сообщает.

Cause: `VOICE_ARCHIVE_DIR` was written in the config (it has no effect there — `PENDING_DIR` is needed); the directory cannot be created; recognition garbled the first word; another word came before it; the keyword in the config is not lower-case. The archive does not report its failures.

Лечение: прогоните `transcribe-local-shared` вручную на записи с ключом и проверьте каталог; распечатайте расшифровку и её первое слово.

Fix: run `transcribe-local-shared` by hand on a keyword recording and check the directory; print the transcript and its first word.

## В архиве чужой аудиофайл · Someone else's audio in the archive

Признак: в архиве не то голосовое, которое было сказано.

Symptom: the archive holds a different voice note from the one spoken.

Причина: оригинал ищется как `audio.*` (кроме `.wav`) в каталоге входного файла. Если канал кладёт файлы в общий каталог вроде `/tmp`, там может оказаться чужой `audio.*`.

Cause: the original is looked up as `audio.*` (other than `.wav`) in the input file's directory. If your channel puts files into a shared directory like `/tmp`, someone else's `audio.*` may be there.

Лечение: пусть канал создаёт отдельный временный каталог на каждое голосовое.

Fix: have your channel create a separate temporary directory for each voice note.

## В архиве `.wav` вместо исходного аудио · A `.wav` in the archive instead of the source audio

Признак: для части голосовых в архиве лежит `.wav` (часто громче оригинала) вместо исходного `.ogg`/`.opus`.

Symptom: for some voice notes the archive holds a `.wav` (often louder than the original) instead of the source `.ogg`/`.opus`.

Причина: канал зовёт `transcribe-correct-wrap`, и запись была тихой: обёртка нормализовала её во временный файл в `$TMPDIR` и передала архиву этот путь. Это верно для общего TMPDIR без исходника рядом. Если TMPDIR — каталог сообщения, как у dsh-telegram-multiagent, архив находит audio.ogg/opus и берёт оригинал.

Cause: the channel calls `transcribe-correct-wrap` and the recording was quiet: the wrapper normalised it into a temporary file in `$TMPDIR` and passed that path to the archive. This applies to a shared TMPDIR without a source alongside. With a per-message TMPDIR, as used by dsh-telegram-multiagent, the archive finds audio.ogg/opus and takes the original.

Лечение: в коде пакета не решено (см. «Границы» в README). Если исходник нужен всегда, поставьте `GAIN_THRESHOLD_DB` ниже громкости ваших записей (усиление тогда не сработает) или зовите архив без корректора.

Fix: not solved in the package code (see "Limits" in the README). If you always need the source, set `GAIN_THRESHOLD_DB` below the loudness of your recordings (gain then does not fire) or call the archive without the corrector.

## Приёмка на тоне вернула пусто · Acceptance on a tone returned empty

Признак: проверочный файл с синусом даёт пустой текст и предупреждение об откате.

Symptom: a sine-wave test file gives empty text and a fallback warning.

Причина: в файле нет речи. Это нормально.

Cause: there is no speech in the file. That is expected.

Лечение: проверяйте на настоящей речи; синтезированная речь годится только для признака «текст на нужном языке появился».

Fix: test on real speech; synthesised speech is only good for "text in the right language appeared".

## Канал обрывает длинные голосовые · Channel cuts long voice notes

Признак: короткие голосовые распознаются, длинные — нет, ошибка тайм-аута в журнале канала.

Symptom: short voice notes work, long ones do not, a timeout error in the channel's log.

Причина: у канала свой предел ожидания (например 120 с), а ядро ждёт горячий сервер до 300 с и потом ещё может пойти холодным путём; после распознавания обёртка корректора добавляет до 70 с коррекции.

Cause: the channel has its own wait limit (e.g. 120 s), while the core waits up to 300 s for the warm server and may then still go the cold path; after recognition the corrector wrapper adds up to 70 s of correction.

Лечение: согласуйте предел канала с длиной голосовых; на длинных записях проверьте, что работает GPU; при необходимости уменьшите `SAGE_BUDZHET`.

Fix: align the channel's limit with voice-note length; on long recordings check that the GPU is in use; lower `SAGE_BUDZHET` if needed.

## Длинное голосовое исправлено только в начале · A long voice note is corrected only at the start

Признак: начало текста с пунктуацией и заглавными, хвост — сырой; в журнале системы строка `🔴 корректор: ИТОГ корректора: кусков N · без коррекции M …`.

Symptom: the start of the text has punctuation and capitals, the tail is raw; the system journal has a line `🔴 корректор: ИТОГ корректора: кусков N · без коррекции M …`.

Причина: исчерпан бюджет `SAGE_BUDZHET` (по умолчанию 45 с): оставшиеся куски ушли сырыми. Если сырой ВЕСЬ текст и итога нет — сработал жёсткий предел 70 с или упал помощник разрезки (например, нечисловой `SAGE_KUSOK`).

Cause: the `SAGE_BUDZHET` budget (45 s by default) ran out: the remaining chunks went raw. If the WHOLE text is raw and there is no summary — the hard 70 s limit fired or the chunking helper crashed (e.g. a non-numeric `SAGE_KUSOK`).

Лечение: проверьте, не перегружена ли служба `sage-warm` (её держат и соседние голосовые); причины по кускам — строки `корректор без коррекции: кусок …` в `SAGE_LOG`. Поднимать `SAGE_BUDZHET` выше ~45 с бессмысленно: упрётся в предел 70 с.

Fix: check whether `sage-warm` is overloaded (neighbouring voice notes hold it too); per-chunk reasons are the `корректор без коррекции: кусок …` lines in `SAGE_LOG`. Raising `SAGE_BUDZHET` above ~45 s is pointless: it runs into the 70 s limit.

## Строка `denoise: выключен по умолчанию` на каждом вызове · `denoise: выключен по умолчанию` on every call

Признак: в stderr каждого распознавания одна строка `denoise: выключен по умолчанию … — расшифровка по сырому звуку`.

Symptom: every recognition prints one stderr line `denoise: выключен по умолчанию … — расшифровка по сырому звуку` ("off by default — transcribing raw audio").

Причина: `DENOISE` не задан. Это не сбой, а объявленный выбор: шумодав по умолчанию выключен.

Cause: `DENOISE` is unset. This is not a failure but an announced choice: the denoiser is off by default.

Лечение: задайте `DENOISE=0` в окружении вызывающего, чтобы строка пропала, или `DENOISE=1` и поставьте venv шумодава. `DENOISE=true`/`yes` шумодав НЕ включают — придёт строка `непонятное значение`.

Fix: set `DENOISE=0` in the caller's environment to drop the line, or `DENOISE=1` and install the denoiser venv. `DENOISE=true`/`yes` do NOT enable it — you get an `непонятное значение` ("unknown value") line instead.

## Юнит whisper-warm не стартует: CHDIR · whisper-warm unit fails to start: CHDIR

Признак: `systemctl status whisper-warm` — `failed`, в журнале `Changing to the requested working directory failed` и `status=200/CHDIR`.

Symptom: `systemctl status whisper-warm` shows `failed`, the journal has `Changing to the requested working directory failed` and `status=200/CHDIR`.

Причина: нет каталога `/var/lib/whisper-warm` (юнит его не создаёт) или служебная учётка не может в него войти.

Cause: the `/var/lib/whisper-warm` directory is missing (the unit does not create it) or the service account cannot enter it.

Лечение: `sudo install -d -o voicesvc -g voicesvc /var/lib/whisper-warm`, затем `sudo systemctl restart whisper-warm`.

Fix: `sudo install -d -o voicesvc -g voicesvc /var/lib/whisper-warm`, then `sudo systemctl restart whisper-warm`.

## Дополнительные инструменты · Additional tools

golos-watch не разобрал реестр: проверьте GOLOS_REESTR и PyYAML; проба не узнаёт фразу: сначала общий движок, затем профиль.

If golos-watch cannot parse the registry, check GOLOS_REESTR and PyYAML; if the phrase is not recognized, check the shared engine before the profile.
