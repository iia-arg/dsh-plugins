# 0.1.0-alpha.106 · Обезличивание / Anonymization

Нейтральный адресат в примере промпта, нейтральные метки сообщений и стендов, явный SDK-путь стенда и точечные допуски синтетических секретов. Конвейер, бюджеты, маска, отказы воды и обрыва сохранены.

Neutral addressee in a prompt example, neutral runtime/test labels, explicit test SDK path and narrow synthetic-secret allowances. Pipeline, budgets, masking, watermark and truncation refusals are retained.

Восстановлены дословные KOD-якоря комментариев о потолке модели и отсутствии обрезки по умолчанию, с переводом рядом. Исходный внешний стенд снятия ограничителей снова проверяет все девять проб; исполняемые токены не изменены.

Restored exact comment anchors explaining the model ceiling and the absence of default truncation, with adjacent English translations. The original external limit-removal stand again checks all nine cases; executable tokens are unchanged.

# 0.1.0-alpha.105 · Изменения / Changes

Маска полного запроса суда; отказ негодной воды и сохранения без ложного сдвига; оборванная статья не записывается и не считается успехом; нулевой бюджет выбора тем не отправляется в API.

Mask complete judgment requests; refuse invalid watermark reads and failed saves without false advancement; refuse truncated article writes and success; do not send zero topic-selection budget to the API.

# История изменений · Change history

## 3.1.2 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- `package.json`: `author` — Aleksandr Argelander.
- Код пакета не менялся.

## 3.1.1 — 2026-10-10 · (рабочий номер 1.1.110; общий номер выпуска A-N-1948) Правки по облачному аудиту №7 и A-N-1955 / Cloud audit #7 and A-N-1955 fixes (A-N-1948)

Номер 1.1.109 занят неслитым заделом A-N-1950. · 1.1.109 is held by the unmerged A-N-1950 groundwork.

- `/svodka-prinyat` читает только обычный файл внутри `putOtklonennyh` (имя без пути — оттуда же; ссылки разворачиваются до сверки). Прежде путь шёл в `readFileSync` как есть: человек из канала мог положить в память любой файл, читаемый учёткой агента. · `/svodka-prinyat` reads only a regular file inside `putOtklonennyh`; previously any path readable by the agent account went into memory.
- `test/stend-shva.mjs` (A-N-1955): выключатели `PAMYAT_DISTILLYACIYA_VYKL`/`PAMYAT_RASSUZHDENIYA_VYKL` направлены на несуществующие пути — машинный выключатель больше не краснит пробу «включена, но ключа нет»; новая проба проверяет ветку «выключена файлом» временным файлом (10 проб). · The machine switch no longer turns the probe red; a new probe checks the switch branch with a temporary file.
- `test/stend-komandy-svodki.mjs`: файлы стенда в каталоге, пробы 10–12 границы чтения. `test/stend-readme.mjs` сверяет русскую и английскую половины README.md; README.en.md — английская страница-указатель (прежде побайтная копия README.md, проба проходила тривиально). · Read-boundary probes; README halves compared; README.en.md is a pointer page.
- `test/stend-komandy-svodki.mjs`, пробы 13–14 (условие ворот Вениамина 10.10): 13 — сосед по префиксу имени каталога (`…/otkl-zlo/x` при `putOtklonennyh=…/otkl`), 14 — `../` без абсолютного пути; оба — отказ «вне каталога». Порча «без разделителя» (`startsWith(kornevoj + RAZDELITEL)` → `startsWith(kornevoj)`) краснит ровно 13. · Probes 13–14: a sibling by the directory-name prefix and `../` without an absolute path are refused; the "no separator" corruption turns exactly 13 red.
- Граница `/svodka-prinyat`: подмену по ссылке между `realpath` и `readFileSync` и жёсткую ссылку внутри каталога сверка не ловит — для них нужна запись в `putOtklonennyh`, то есть учётка агента; это вне модели угрозы «человек из канала». · Boundary: a link swap between `realpath` and `readFileSync` and a hard link inside the directory are not caught — they need write access to `putOtklonennyh`, i.e. the agent account; outside the "human in a channel" threat model.
- `package.json`: `engines.node >=22.15.0` (нужен `zstdDecompressSync`). Документация: README (установка архивом, engines), SETTINGS, ARCHITECTURE, GUARDS, TROUBLESHOOTING (скрипт возврата повтора из `dsh-pamyat-storozha`, `STEND_VERNUT`), склейки чисел и слов. · Docs updated accordingly.

## 1.1.108 — 2026-10-09 · LICENSE в архиве / LICENSE in the archive (A-N-1887)

В архив входит LICENSE (MIT, A-N-1865 722421f). · The archive includes LICENSE (MIT, A-N-1865 722421f).

Ещё в архиве с прежнего номера · Also in the archive since the previous version: история CHANGELOG восстановлена (A-N-1882 F04, Заря) · CHANGELOG history restored (A-N-1882 F04). Код пакета не менялся · Package code is unchanged.

## 1.1.107 — 2026-10-08 · putZhurnala снят, готовность без него / putZhurnala removed, readiness without it (A-N-1870)

`putZhurnala` снят из Config: с A-P-056 (23.09) дистилляция читает события той же сессии и файл не берёт. Строка готовности при подъёме больше его не требует: прежде без него она объявляла «ВКЛЮЧЕНА, НО НЕ ГОТОВА — заход не начнётся», хотя дистилляция шла, а с ним — «журнал задан» о неиспользуемом файле. Внутренний файловый вход `distillirovat({ putZhurnala })` для стендов не тронут. Новая проба в `test/stend-krik-zvuchit.mjs`.

`putZhurnala` is removed from Config: since A-P-056 distillation reads events of the same session and never the file. The startup readiness line no longer requires it. The internal file input of `distillirovat` used by stands is unchanged. New probe in `test/stend-krik-zvuchit.mjs`.

## 1.1.106 — перенумерация (A-N-1562): прежний 0.1.0-alpha.106, код не менялся · renumbering, code unchanged

## Документационный кандидат · Documentation candidate

Добавлены парное руководство RU/EN, схемы фаз и состояния, таблица каждой настройки, защита ключей/внешнего входа и инструкции чтения заданий. Комментарии документируют фактическое поведение; код и номер версии не меняются в этом такте.

Added paired RU/EN guidance, phase/state diagrams, complete settings, key/external-input boundaries and pending-task instructions. Comments describe actual behavior; code and version remain unchanged in this task.

## Сохранённые возможности · Existing capabilities

Сохранение сводки отделено от дистилляции, ошибки приёма/сборки/сети различаются. Конвейер поддерживает окна, хвост, выбор тем, статьи, маскуядра, классы, происхождение, кандидаты отношений и ограниченные повторы. Автоповтор прерванного среза и ходовой зов используют явные признаки и пределы; содержательная истинность модели не объявляется доказанной механическим успехом.

Summary capture is separate from distillation, with distinct intake/assembly/network failures. The pipeline supports windows, tail, topics, articles, core masking, classes, provenance, relationship candidates and bounded retries. Interrupted-slice retry and turn triggering use explicit evidence and stopping rules; mechanical success does not prove the model's semantic truth.

Внутренняя история поручений и установок сохранена вGit; публичный журнал её личных адресов и имён не содержит.

Internal work-item and deployment history remains inGit; the public changelog excludes its personal addresses and names.

## Восстановлено по истории git

Записи восстановлены по git diff названных коммитов 08.10.2026; это не номера выпусков и не замеры на установке.

- `20a3c901dcdb` (2026-09-03) — `distillirovat` (`src/distill-shov.js`) стал считать фактический расход захода по `usage` провайдера: вызовы, вход, выход, чтение и запись кеша; отказные вызовы (в том числе оборванные по `max_tokens`) учитываются до разбора исхода. Итог несёт поле `rashod`, в журнал печатается строка «расход захода: …» в токенах, без пересчёта в деньги; это потраченное, а не допустимый бюджет `maxTokenov*`. Адрес API можно задать через `nastrojka.adres`. · EN: `distillirovat` now counts actual run usage from provider `usage` (calls, input, output, cache read/write), failed calls included, returns it as `rashod` and logs a «расход захода» line in tokens rather than money; this is spent usage, not the `maxTokenov*` budget, and the API address may come from `nastrojka.adres`.
- `fff1dcf3390b` (2026-09-03) — В запросе статьи тема перенесена после транскрипта, чтобы вызовы одного захода имели общий префикс для кеша провайдера; умолчание `maxTokenovStati` поднято с 4000 до 8000 (позже заменено: по коду на 08.10 умолчание 0); при подъёме печатается безусловная строка состояния: класс и «дистилляция ВЫКЛЮЧЕНА / взведена / ВКЛЮЧЕНА, НО НЕ ГОТОВА» с названием недостающего условия. · EN: The article prompt puts the topic after the transcript so calls share a cacheable prefix, default `maxTokenovStati` went from 4000 to 8000 (later replaced: per the code as of 08.10 the default is 0), and startup always logs a readiness line naming any missing condition.
- `f87a79a82edd` (2026-09-03) — Каждая строка журнала секретаря несёт имя и версию пакета: `krik` печатает `[dsh-pamyat-secretary <версия>]`, версия читается из своего `package.json`, при неудаче — «версия неизвестна» вместо константы. Проба в `test/stend-krik-zvuchit.mjs`. · EN: Every secretary log line carries the package name and the version read from its own `package.json` («версия неизвестна» if unreadable), with a probe in `test/stend-krik-zvuchit.mjs`.
- `d16ba554ac73` (2026-09-04) — Удалены копии `index.js`, `distill-shov.js`, `distillyaciya.js`, ошибочно лежавшие в корне пакета; их изменения перенесены в `src/`: `sprosit` различает HTTP 402 (`net-deneg`) и 401/403 (`klyuch-ne-prinyat`) с признаком `okonchatelno`, окончательный отказ на статье обрывает заход с числом необработанных тем, строка готовности читает плоские поля схемы `klyuchFajl`/`klyuchPass` вместо несуществующего `klyuch.*`. · EN: Stray package-root copies of the sources were removed and their changes moved into `src/`: `sprosit` separates 402 (`net-deneg`) from 401/403 (`klyuch-ne-prinyat`) with an `okonchatelno` flag, a final article failure aborts the run and reports untreated topics, and the readiness line reads the flat `klyuchFajl`/`klyuchPass` schema fields.
- `1cca83263eff` (2026-09-04) — Исправлена временная мёртвая зона в `distillirovat`: ветка отказа первого вызова возвращала `rashod` до его объявления и падала с ReferenceError вместо названной причины. Счётчик расхода объявлен до первого вызова, все ранние возвраты после него (отказ провайдера, неразобранные и пустые темы) несут `rashod`, отказ первой ступени передаёт `okonchatelno`; в `test/stend-rashoda.mjs` добавлены пробы всего шва против подставного сервера 402/401. · EN: Fixed a TDZ in `distillirovat`: the first-call failure branch returned `rashod` before its declaration and threw ReferenceError instead of naming the cause; the counter is now declared before the first call, every later early return carries `rashod`, and seam-level 402/401 probes were added to `test/stend-rashoda.mjs`.
- `c3d2b30dbe89` (2026-09-09) — `sprosit` помечает HTTP 408/425/429/5xx и сетевые отказы признаком `vremenno`; новая обёртка `sprositUporno` повторяет только их (до 3 попыток, паузы 2 и 6 с), 402/401/403 не повторяются; шов зовёт её для выбора тем, статей и повтора статьи. Добавлен второй вход сводки — команда `/svodka-prinyat <путь>`: текст из файла проходит тот же приём, что событие `compaction/summary`, а источником записи становится сам файл (`istochnikYavno` в `razobratSvodku`), без выдуманного диапазона seq. Стенд `test/stend-upornogo-vyzova.mjs`. · EN: `sprosit` marks 408/425/429/5xx and network failures `vremenno` and the new `sprositUporno` wrapper retries only those (3 attempts, 2 s and 6 s pauses) while 402/401/403 are not retried; a second summary input, `/svodka-prinyat <path>`, feeds a file through the same intake with the file itself as the source (`istochnikYavno`).
- `7ed3a0c0b3c7` (2026-09-09) — Только уборка: из `src/` удалены пять страховочных копий `*.bak-*`, попадавших в состав пакета (`files` включает `src`); код не менялся. · EN: Cleanup only: five `*.bak-*` backup copies that were shipped as part of `src/` were removed; code unchanged.
- `f6544dcfc930` (2026-09-10) — `razvestiFazy` (`src/index.js`) после приёма сводки всегда печатает строку о дистилляции: «дистилляция: ПОЗВАНА …» перед запуском или «дистилляция: ПРОПУЩЕНА, выключена настройкой distillyaciya …», чтобы «не звалась» отличалась от «ещё считает». · EN: After summary intake `razvestiFazy` always logs «дистилляция: ПОЗВАНА» before starting or «дистилляция: ПРОПУЩЕНА» when `distillyaciya` is off, so "not called" differs from "still running".
- `96fabe64bc0e` (2026-09-10) — Окна дистилляции были сняты целиком: из схемы и проброса убраны `razmerOkna`/`predelOkon`, разбиение транскрипта, обрезка начала с обработчиком `otbroshennoe`, строки «ОКНА:» и «ОХВАТ НЕ ПОЛНЫЙ»; заход шёл одним проходом, три стенда окон удалены. Отменено следующим коммитом `de33e6def` (возврат `razmerOkna`/`predelOkon` с умолчанием 0 и обработчика `otbroshennoe`); действующее поведение — в «Сохранённых возможностях». · EN: Distillation windows were removed entirely (settings, splitting, head truncation, window log lines and stands) in favour of a single pass; reverted by the next commit `de33e6def`, which restored `razmerOkna`/`predelOkon` with default 0.
- `e36fc970b662` (2026-09-11) — Из Config и обоих README снят ключ `predelZnakov` (умолчание 200000): шов его уже не читал, ограничение транскрипта задаётся `predelOkon`. · EN: The unused `predelZnakov` Config key (default 200000) was removed from Config and both READMEs; transcript bounding is set by `predelOkon`.
- `199afec14698` (2026-09-19) — Добавлен стенд `test/stend-orientira-porcha.mjs`: копирует `src/` во временный каталог, прогоняет `test/stend-predela-stati.mjs` на годном коде, затем заменяет в `promty.js` фразу-ориентир длины статьи и ждёт диагностики «ориентир … НЕ ВЫНУТ» (`BROKEN_PHRASE=1`), после возврата фразы — снова годный прогон. Ветки `BROKEN_PHRASE` в `stend-predela-stati.mjs` на момент коммита в дереве ещё не было. · EN: Added `test/stend-orientira-porcha.mjs`, which runs `stend-predela-stati.mjs` on a temporary copy of `src/`, breaks the article-length guide phrase in `promty.js`, expects the blindness diagnostic, then expects a clean run again after restoring it; the `BROKEN_PHRASE` branch it relies on was not yet in the tree at that commit.
