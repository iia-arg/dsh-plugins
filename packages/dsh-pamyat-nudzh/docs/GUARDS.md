# Проверки и стенды · Checks and test stands

Отдельных сторожей-наблюдателей в этом пакете нет: всё, что ловит беду, — проверки внутри кода и восемь стендов. Для каждой проверки названо, что она ловит, чего не ловит и куда говорит. Частичная защита, не назвавшая своих границ, выглядит полной, — поэтому границы здесь важнее перечня.

This package has no separate watchers: everything that catches trouble is a check inside the code plus eight test stands. For each check: what it catches, what it misses and where it reports. A partial guard that does not name its limits looks complete — so the limits here matter more than the list.

## Проверки в коде · Checks in the code

Все строки идут в stderr процесса через `console.error` с приставкой `[dsh-pamyat-nudzh <версия>]`. Читатель строк — человек в журнале службы и слой, который этот журнал разбирает; модель видит только вставленное напоминание.

All lines go to the process stderr via `console.error` prefixed with `[dsh-pamyat-nudzh <version>]`. The reader of these lines is a human in the service log and whatever layer parses that log; the model sees only the inserted reminder.

| Проверка · Check | Ловит · Catches | Не ловит · Misses | Строка · Line |
|---|---|---|---|
| Границы порогов (`vzyatPorog`) · threshold bounds | `predel` < 0, бесконечность, не число; `dolyaTrevogi` вне (0, 1] — при старте и горячей загрузке; `otmetkiPuti` вне (0, 1) отбрасываются в apply строкой «ОТКЛОНЕНО» · out-of-range, infinite or non-numeric values at start-up and hot reload; `otmetkiPuti` outside (0, 1) are dropped in apply with an «ОТКЛОНЕНО» (rejected) line | неверное, но годное окно модели; разные значения у узлов одного процесса · a wrong but valid model window; different values from nodes of one process | «ОТКЛОНЕНО: … действует …» |
| Строка подъёма · start-up line | факт монтажа и действующие пороги, при каждом `apply` · that mounting happened and the thresholds in force, on every `apply` | соответствие `predel` настоящему окну модели · whether `predel` matches the real model window | «подъём: предел … ток., доля тревоги …» |
| Незаданный предел · unset limit | `predel = 0`: подталкивать не с чем сравнивать · nothing to compare with | слишком большой или малый ненулевой предел · a too large or too small non-zero limit | «предел контекста НЕ ЗАДАН (predel: 0) …» |
| Недостоверный счёт · non-credible count | занятость больше `1.5 × predel` (накопительный usage поставщика): тревога НЕ подаётся, строка — один раз до следующего компакта · occupancy above `1.5 × predel` (cumulative provider usage): NO alarm, the line once until the next compaction | занижение; любое неверное число в пределах окна; накопительный usage, ещё не дошедший до 1.5 окна — между 1.0 и 1.5 окна тревога подаётся с пометкой «выше объявленного окна» и может быть ложной · under-counting; any wrong number within the window; cumulative usage not yet at 1.5 windows — between 1.0 and 1.5 windows the alarm carries an "above the declared window" mark and may be false | «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН: …» |
| Тревога порога · threshold alarm | занятость последнего вызова ≥ порога, один раз за цикл, с полнотой учёта и суммой · last call occupancy ≥ threshold, once per cycle, with completeness and sum | рост между вызовами: отказ по длине происходит на вызове, раньше, чем известна занятость · growth between calls: a length rejection happens at the call, before occupancy is known | «пора подтолкнуть к компакту: занято … из …» |
| Отметки пути · path marks | ряд занятости между тревогами · an occupancy series between alarms | ничего не предупреждают и не защищают · they warn of and protect against nothing | «отметка пути N%: …» |
| Однократная вставка · one-time insertion | повтор напоминания на каждом шаге, в том числе при исключении в сборке (флаг гасится ДО сборки) · repeating the reminder on every step, including when building throws (the flag is cleared BEFORE building) | приёмку сообщения платформой — её доказывает только живой заход · the platform accepting the message — only a live run proves it | «напоминание вставлено в сессию …» |
| Неизвестность после компакта · unknown after compaction | устаревшая занятость после успешного компакта; повтор старого напоминания · stale occupancy after a successful compaction; repeating an old reminder | сжатие, о котором в журнале нет пары summary/end с одним `compactionId` · a compaction without a summary/end pair with the same `compactionId` in the journal | «после сжатия давление неизвестно …» |
| Слепота журнала · journal blindness | недоступный или укороченный журнал сессии, негодное событие usage: вставка запрещена · an unavailable or shortened session journal, an invalid usage event: insertion forbidden | ошибки внутри службы `pamyat` ядра памяти, если она отдаёт правдоподобный, но неверный журнал · errors inside the memory core's `pamyat` service if it returns a plausible but wrong journal | «СЛЕПОТА nudzh: …» |
| Сбой учёта · counting failure | исключение в обработчике `session/event` не обрывает чужой поток · an exception in the `session/event` handler does not break the platform's stream | причину: строка называет только текст исключения · the cause: the line names only the exception text | «не смог учесть расход: …» |

## Стенды · Test stands

`npm test` гоняет все `test/stend-*.mjs` и возвращает 1, если хоть один стенд вернул 1; иначе — код последнего стенда, вернувшего не 0 (обычно 2 — слепота); 0 — только если все зелёные. Каждый стенд можно запустить отдельно: `node test/<стенд>.mjs` из каталога пакета.

`npm test` runs every `test/stend-*.mjs` and returns 1 if any stand returned 1; otherwise the code of the last stand that returned non-zero (usually 2 — blindness); 0 only if all are green. Each stand can be run on its own: `node test/<stand>.mjs` from the package directory.

| стенд · stand | проб · probes | что проверяет · what it checks | предмет · subject |
|---|---|---|---|
| `stend-granic-porogov` | 10 | отказ негодного порога при старте и горячей загрузке, действие прежнего годного; отметки пути вне (0, 1) — строка «ОТКЛОНЕНО» · rejection of an invalid threshold at start-up and hot reload, the previous valid value acting; path marks outside (0, 1) — an "ОТКЛОНЕНО" line | настоящий cordis Context · a real cordis Context |
| `stend-krik-zvuchit` | 6 | крик слышен в stderr отдельного процесса; `ctx.logger` нем; версия из манифеста · the shout is audible in a separate process's stderr; `ctx.logger` is mute; version from the manifest | отдельный процесс node · a separate node process |
| `stend-nedostovernogo-schyota` | 11 | защита недостоверного счёта говорит и НЕ толкает; граница строгая; один раз за цикл; мусорный ввод; полоса 1–1,5 окна — тревога с пометкой, текст называет полосу · the non-credible guard speaks and does NOT push; strict boundary; once per cycle; junk input; the 1–1.5 window band — a marked alarm, the text names the band | отдельный процесс node · a separate node process |
| `stend-porogov` | 24 | тревога от занятости, а не от суммы; один раз; «хватит ли» без «хватает»; события журнала в живой форме; расход сводки; отметки пути · alarm from occupancy, not the sum; once; no "enough"; journal events in live shape; summary spend; path marks | настоящий Context · a real Context |
| `stend-posle-kompakta` | 18 | 31 утверждение в 18 пробах: неизвестность после компакта, сессии, перезапуск, унаследованный журнал, слепота · 31 assertions in 18 probes: unknown after compaction, sessions, restart, inherited journal, blindness | подставной ctx · a fake ctx |
| `stend-readme` | 12 | README согласован с кодом, составом `npm pack` и между языками · the README agrees with the code, the `npm pack` contents and between languages | тексты и `npm pack --dry-run` · texts and `npm pack --dry-run` |
| `stend-scheta` | 8 | арифметика расхода `src/schet.js` · spend arithmetic of `src/schet.js` | функции модуля · module functions |
| `stend-vstavki` | 8 | напоминание в `decision.messages`, ровно одно за цикл; новый цикл; отказ выше по цепи; гашение до сборки · the reminder in `decision.messages`, exactly one per cycle; a new cycle; rejection higher up the chain; clearing before building | подставной ctx · a fake ctx |

Код выхода стенда: 0 — всё зелёное, 1 — есть красные, 2 — слепота (предмет не загрузился). Исключение: `stend-readme` требует npm и пишущий `HOME` — без записи в кеш npm проба состава краснеет на исправном README.

A stand's exit code: 0 — all green, 1 — some red, 2 — blindness (the subject did not load). Exception: `stend-readme` needs npm and a writable `HOME` — without a writable npm cache the contents probe goes red on a healthy README.

Зрячесть стендов проверена порчей 04.10: вход без `cacheReadTokens` в `src/schet.js` (одна замена) дал красное в `stend-porogov` (21 из 24) и `stend-scheta` (6 из 8), остальные шесть стендов остались зелёными — они не смотрят на состав входа.

The stands' sight was verified by breakage on 04.10: input without `cacheReadTokens` in `src/schet.js` (one replacement) turned `stend-porogov` (21 of 24) and `stend-scheta` (6 of 8) red, while the other six stands stayed green — they do not look at the input composition.

## Как читать строки · How to read the lines

| строка · line | значит · means | делать · do |
|---|---|---|
| «подъём: предел P ток., доля тревоги D (порог T ток.)» | пакет смонтирован, пороги в силе; несколько таких строк на подъём — норма (`apply` зовётся несколько раз) · mounted, thresholds in force; several per start-up is normal | сверить P с окном модели · compare P with the model window |
| «предел контекста НЕ ЗАДАН (predel: 0) …» | считает, но не подталкивает · counts but does not nudge | задать `predel` · set `predel` |
| «ОТКЛОНЕНО: … действует …» | значение настройки отвергнуто · a setting value was rejected | исправить настройку · fix the setting |
| «отметка пути N%: занято … из …» | наблюдение, не тревога · observation, not an alarm | ничего · nothing |
| «пора подтолкнуть к компакту: занято … из …» | порог перейдён; вставка взведена на следующий шаг · threshold crossed; insertion armed for the next step | ждать строку вставки · expect the insertion line |
| «напоминание вставлено в сессию S (занято N)» | модель получила одно напоминание · the model got one reminder | — |
| «занятость вернулась под порог: … Шагов …: K» | цикл закончен; K — нижняя граница шагов · cycle over; K is a lower bound of steps | — |
| «после сжатия давление неизвестно …» | успешный компакт; ждём свежий usage · successful compaction; waiting for fresh usage | — |
| «… восстановлено из журнала» | после перезапуска сессия осталась в неизвестности · after a restart the session is in the unknown state | — |
| «СЧЁТ ЗАНЯТОСТИ НЕДОСТОВЕРЕН: …» | число о приборе, а не об окне · the number is about the instrument, not the window | проверить usage поставщика двумя вызовами подряд · check provider usage with two consecutive calls |
| «СЛЕПОТА nudzh: …» | журнал или событие негодны; вставка запрещена · journal or event invalid; insertion forbidden | см. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| «не смог учесть расход: …» | исключение в обработчике событий · an exception in the event handler | см. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
