# Сторожа, проверки и стенды · Guards, checks and test stands

Здесь — всё, что в пакете ловит беду: три сторожа (они и есть назначение пакета), малые проверки внутри кода и 15 mjs-стендов и 5 отдельных sh-стендов. Для каждого: что ловит, чего НЕ ловит, куда кричит и как читать.

Here is everything in the package that catches trouble: three guards (they are the purpose of the package), small checks inside the code, and 15 mjs stands and 5 separate sh stands. For each: what it catches, what it does NOT catch, where it reports and how to read it.

## Три сторожа · Three guards

| Сторож · Guard | Ловит · Catches | Не ловит · Does not catch | Куда кричит · Reports to |
|---|---|---|---|
| Сторож 1 — оповещение о сжатии · compaction notification | каждое завершённое сжатие: естественное, принудительное, обрезку, провал · every finished compaction: natural, forced, prune, failure | оборванное сжатие (только счётом в сводке), чужие сессии, длительность работы модели, маршрут самого сжатия · a cut-off compaction (only as a summary count), other sessions, model working time, the compaction's own route | журнал и сток · log and sink |
| Сторож 2 — вторая ступень заполнения · second fill stage | переход 85% / 90% порога сжатия, один раз до сжатия, переживает перезапуск · crossing 85% / 90% of the compaction threshold, once until compaction, survives restart | заполнение без `usage`, без готового D и окна, между ответами модели; сжатие мимо загруженного модуля (только запасной сброс) · fill without `usage`, without a ready D or window, between model responses; a compaction while the module was unloaded (fallback reset only) | журнал и сток · log and sink |
| Охват по сессиям · session coverage | сессию этого процесса, замолчавшую больше чем на час · a session of this process silent for over an hour | чужих агентов, сессии без единого события · other agents, sessions without a single event | строка сводки (журнал) · summary line (log) |

Полное описание каждого, с колонками «чего не ловит» и «что значит его молчание», — в README, разделы «Сторож 1», «Сторож 2» и «Охват». Эти разделы сверяет стенд `stend-opisaniya.mjs`.

The full description of each, with the columns "what it does not catch" and "what its silence means", is in the README, sections "Сторож 1", "Сторож 2" and "Охват". Those sections are checked by the stand `stend-opisaniya.mjs`.

## Малые проверки внутри кода · Small checks inside the code

| Проверка · Check | Что делает · What it does | Чего не ловит · What it misses |
|---|---|---|
| Страж одиночного монтажа · single-mount guard | второй `apply` с тем же `agent` в одном процессе пропускается строкой «второй монтаж пропущен»; ключ снимается при выгрузке · a second `apply` with the same `agent` in one process is skipped with the line "второй монтаж пропущен"; the key is removed on unload | два безымянных агента схлопываются в один; разные процессы не различаются · two nameless agents collapse into one; different processes are not distinguished |
| Версия в каждой строке · version in every line | `pechat()` приставляет `[dsh-pamyat-storozha <версия>]`; не прочиталась — «версия неизвестна» · `pechat()` prepends `[dsh-pamyat-storozha <version>]`; unreadable — "версия неизвестна" | строки соседних пакетов; отказ логгера глушится (будет тишина) · lines of sibling packages; a logger failure is swallowed (silence) |
| «Не сообщён ≠ 0» · "not reported ≠ 0" | расход без `usage` печатается словами и с источником · spend without `usage` is printed in words, with its source | правильность расхода у пакета сводки · correctness of the summary package's spend |
| Незнакомые поля `usage` · unknown `usage` fields | поля вне объявления платформы не складываются и называются один раз · fields outside the platform declaration are not added and are named once | изменение смысла объявленного поля · a change of meaning of a declared field |
| Окно платформы против `predel` · platform window vs `predel` | расхождение называется один раз за жизнь процесса · a mismatch is named once per process lifetime | второе расхождение после смены модели в том же процессе · a second mismatch after a model change in the same process |
| Слепота ступеней · stage blindness | нет готового порога D, окна платформы и запасного predel — одна строка «ступени НЕ считаются» с причиной · no ready D threshold, platform window or fallback predel — one line "ступени НЕ считаются" with a reason | повторы после первого раза (сказано один раз) · repeats after the first time (said once) |
| Порог не прочитан · threshold not read | ступени считаются от окна, строка тревоги несёт причину · stages counted from the window, the alarm line carries the reason | что файл порогов верен по существу · that the threshold file is right in substance |
| Разумность времени · time sanity | метка времени раньше 2020 года — «длительность не измерима», а не мусорное число · a timestamp before 2020 — "не измерима", not a garbage number | неверное, но правдоподобное время · a wrong but plausible time |
| Отказ стока · sink failure | «🔴 сток не сработал (…)», строка в журнале остаётся · "🔴 сток не сработал (…)", the log line stays | сток, который «принял» и потерял сообщение · a sink that "accepted" and lost the message |
| Хранение ступеней · stage storage | нечитаемый файл — в строке подъёма; неудачная запись — одна строка «НЕ сохранены» · unreadable file — in the start-up line; failed write — one line "НЕ сохранены" | одновременная запись двумя процессами в один файл · two processes writing one file simultaneously |
| Начато и не завершено · started not finished | сводка считает `compaction/start` без `/end`, ноль печатается тоже · the summary counts `compaction/start` without `/end`, zero is printed too | оборванные до подъёма процесса · ones cut off before the process started |

## Стенды · Test stands

Запуск всех: `npm test` (по очереди каждый `test/stend-*.mjs`; итоговый код 1 — есть красные, иначе код последнего ненулевого исхода по порядку, если 1 не было, иначе 0). Стенды ждут зависимостей пакета (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `dsh-pamyat-kompakt`) в `node_modules`. Код стенда: 0 — зелёный, 1 — красные пробы, 2 — слепота или канарейка (число проб разошлось с объявленным).

Run all: `npm test` (each `test/stend-*.mjs` in turn; the overall code is 1 if any is red, otherwise the last nonzero code in traversal order, otherwise 0). Stands need the package dependencies (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `dsh-pamyat-kompakt`) in `node_modules`. A stand's exit code: 0 — green, 1 — red probes, 2 — blindness or canary (number of probes differs from the declared one).

⚠️ Запускайте стенды без `DSH_HOME` в окружении: `stend-istochnika-rashoda.mjs` его не снимает и при заданном `DSH_HOME` запишет служебный ключ `'?'` в настоящий файл ступеней `$DSH_HOME/storages/storozha-stupeni.json`.

⚠️ Run the stands without `DSH_HOME` in the environment: `stend-istochnika-rashoda.mjs` does not unset it and, with `DSH_HOME` set, writes a service key `'?'` into the real stage file `$DSH_HOME/storages/storozha-stupeni.json`.

| Стенд · Stand | Проб · Probes | Что проверяет · What it checks | Чего не видит · Blind spot |
|---|---|---|---|
| `stend-vidov.mjs` | 13 | виды сжатия, расход и давление по объявлению платформы, `totalTokens`, длительность · compaction kinds, spend and pressure per the platform declaration, `totalTokens`, duration | только чистые функции, не строки тревог · pure functions only, not alarm lines |
| `stend-opoveshcheniya.mjs` | 43 | строки сжатия/обрезки/провала, ступени, окно от платформы, состав строки, сводка, охват, версия · compaction/prune/failure lines, stages, platform window, line composition, summary, coverage, version | файла порогов нет — база всегда окно; печать сводки по такту `turn/end` не проверяется · no threshold file — the base is always the window; summary printing on the `turn/end` cadence is not checked |
| `stend-poroga-i-hraneniya.mjs` | 14 | ступени от порога из файла порогов, хранение на диске между процессами, сброс сжатием и запасной сброс · stages from the threshold file, on-disk storage across processes, reset by compaction and fallback reset | одновременные процессы · concurrent processes |
| `stend-istochnika-rashoda.mjs` | 5 | строка тревоги называет источник расхода · the alarm line names the spend source | верность расхода у соседа; не снимает `DSH_HOME` · correctness of the sibling's spend; does not unset `DSH_HOME` |
| `stend-odinochnogo-montazha.mjs` | 8 | страж одиночного монтажа на подставном ctx, строка пропуска с версией · single-mount guard on a fake ctx, skip line with version | выгрузку (см. следующий) · unloading (see next) |
| `stend-vygruzki.mjs` | 6 | снятие ключа при выгрузке на настоящем cordis; посылки о cordis · key removal on unload on real cordis; assumptions about cordis | порядок вызовов загрузчика платформы в работе · the platform loader's call order in production |
| `stend-primenimosti-prune.mjs` | 6 | строка обрезки в сводке для `sdk`/`dsh`/`unknown`, отказ схемы на чужие значения · the prune summary line for `sdk`/`dsh`/`unknown`, schema rejection of other values | подключён ли плагин обрезки на самом деле · whether the pruning plugin is actually connected |
| `stend-svodki-po-taktu.mjs` | 6 | правило такта сводки (1-й и каждый 10-й ход) · the summary cadence rule (1st and every 10th turn) | проверяет КОПИЮ правила, не код модуля · checks a COPY of the rule, not the module code |
| `stend-opisaniya.mjs` | 12 | README описывает ровно сторожей из `STOROZHA`, с обеими обязательными колонками · the README describes exactly the guards from `STOROZHA`, with both mandatory columns | правдивость текста описания · truthfulness of the description text |
| `stend-opory-1563.mjs` | 17 | формы источника, старый/v4 журнал, внешние свидетели, охват · source forms, old/v4, external witnesses, coverage | подставные данные · fixture data |
| `stend-proverki-opory.mjs` | 7 | запись отметок и запрет записать слепоту · marks and refusal to store blindness | не боевые данные · not live data |
| `stend-tekstov-vladelcu.mjs` | 10 | короткая строка владельцу · short owner line | не реальная доставка · no real delivery |
| `stend-audit-plugin.mjs` | 9 | регрессии событийного кода · event-code regressions | не платформа в бою · not live platform |
| `stend-audit-install.mjs` | 2 | offline установка и импорт · offline install/import | не реестр npm · no npm registry |
| `stend-audit-bin.mjs` | 8 | реальные CLI на подставе · actual fixture CLIs | не боевые базы · no live DBs |

Новые входы: `stend-audit-plugin.mjs` — 9 проб; `stend-audit-install.mjs` — 2 установочных случая без сети; `stend-audit-bin.mjs` — 8 CLI-проб (тело `audit-bin.py`, не второй вход). `stend-opory-1563.mjs`, `stend-proverki-opory.mjs` и `stend-tekstov-vladelcu.mjs` входят в npm-прогон; полная таблица входов — README «Проверка». Без zstd или локального ядра по STEND_CORE/PAMYAT_CORE эти пробы дают слепоту 2. Это не зелёный исход.

The three audit entries cover 9 plugin probes, 2 offline install cases and 8 CLI probes. The opory-1563, proverki-opory and owner-text stands also belong to npm test; README lists every entry. Missing zstd or a local core for STEND_CORE/PAMYAT_CORE produces blindness 2.

Отдельные входы shell: stend-nastrojki.sh (34 случая), stend-slepoty-nastrojki.sh (не от root), stend-modeli-omega.sh, stend-pravki-postavki-omega.sh, stend-svodki-doveriya.sh. Последние три требуют специальной частной раскладки OMEGA; на живых моделях их этим нарядом не выполнять. Файлы и вызывающие параметры перечислены в BIN.md.

Separate shell entries: settings (34 cases), settings-blindness (non-root), model, delivery-patch and trust-summary stands. The three OMEGA entries need a dedicated private layout and must not run on live models under this task.

## Как читать строки · How to read the lines

Текст строк журнала — интерфейс для разборщиков и не переводится. Ключевые слова:

The text of log lines is an interface for parsers and is not translated. Key words:

| Строка · Line | Значение · Meaning |
|---|---|
| `подъём: ступени […] ОТ ПОРОГА СЖАТИЯ (…; сейчас 0.89)` | плагин смонтирован; доля порога по маршруту по умолчанию прочитана · plugin mounted; the default-route threshold ratio was read |
| `… сейчас НЕ ПРОЧИТАНА: <причина> — буду считать от окна` | файл порогов не прочитан, ступени будут от окна · threshold file not read, stages will use the window |
| `сток задан` / `сток ВЫКЛЮЧЕН намеренно` / `сток НЕ ЗАДАН — ключа нет в наборе` | состояние внешнего стока · external sink state |
| `сторож уже смонтирован — второй монтаж пропущен` | повторный `apply` того же агента в процессе · a repeated `apply` of the same agent in the process |
| `сжатие естественное` / `сжатие ПРИНУДИТЕЛЬНОЕ (команда человека)` | завершённое сжатие и его вид · a finished compaction and its kind |
| `ОБРЕЗКА без модели: вытеснено N ток.` | обрезка результатов инструментов без вызова модели · tool-result prune without a model call |
| `🔴 ПОПЫТКА СЖАТИЯ ПРОВАЛИЛАСЬ: <ошибка>` | сжатие не удалось, история не урезана · compaction failed, history not cut |
| `расход НЕ СООБЩЁН В СОБЫТИИ ПЛАТФОРМЫ` | в событии нет `usage`; расход вызова сводки — в строке пакета сводки · no `usage` in the event; the summary call's spend is in the summary package's line |
| `длительность X с — между ЗАПИСЯМИ В ЖУРНАЛ` / `не измерима` | время между началом и концом в журнале / метки начала нет · time between start and end records / no start mark |
| `🟡 ЗАПОЛНЕНИЕ X% номинального порога N (request)` / `🟠 …` | перейдена ступень ниже / от 90% порога · a stage below / from 90% of the threshold was crossed |
| `… ОКНА N … ⚠️ порог сжатия НЕ ПРОЧИТАН (…)` | ступень считана от окна, порог не прочитан · stage computed from the window, threshold not read |
| `ступени НЕ считаются: окна нет ни у платформы …` | слепота: не с чем сравнивать · blindness: nothing to compare with |
| `предел в настройке N ток. РАСХОДИТСЯ с окном …` | `predel` не совпадает с окном платформы · `predel` differs from the platform window |
| `⚠️ в usage поля, не объявленные платформой: …` | незнакомые поля названы и не учтены · unknown fields named and not counted |
| `⚠️ отданные ступени НЕ сохранены: …` | запись файла ступеней не удалась · writing the stage file failed |
| `🔴 сток не сработал (…)` | внешний сток отказал, строка осталась в журнале · the external sink failed, the line stayed in the log |
| `сводка сторожа с подъёма процесса (НЕ за сутки …)` | начало сводки · start of the summary |
| `начато и НЕ завершено: N` | сжатия с началом, но без конца · compactions with a start but no end |
| `ОХВАТ ПО СЕССИЯМ: видел N — … МОЛЧИТ M мин` | сессия молчит дольше часа · a session silent for over an hour |
