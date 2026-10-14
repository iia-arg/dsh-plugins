# Поломки и их лечение · Troubleshooting

Признак → причина → лечение. Случаи взяты из нашей работы с пакетом.

Symptom → cause → fix. The cases come from our operation of the package.

## Нет строки подъёма · No start-up line

**Признак.** В журнале службы агента после перезапуска нет строки `[dsh-pamyat-storozha …] подъём: …`.

**Symptom.** After a restart the agent service log has no `[dsh-pamyat-storozha …] подъём: …` line.

**Причина.** Плагин не подключён в профиле/пресете, либо загрузка упала: чаще всего `ERR_MODULE_NOT_FOUND` на `dsh-pamyat-kompakt/porogi.mjs` — соседний пакет не установлен в тот же `node_modules` (он указан только в `devDependencies`).

**Cause.** The plugin is not added to the profile/preset, or loading failed: most often `ERR_MODULE_NOT_FOUND` for `dsh-pamyat-kompakt/porogi.mjs` — the sibling package is not installed into the same `node_modules` (it is listed only in `devDependencies`).

**Лечение.** Проверьте блок плагина в cordis YAML и наличие `node_modules/dsh-pamyat-kompakt/porogi.mjs` рядом с пакетом; ищите ошибку загрузки плагина в журнале платформы.

**Fix.** Check the plugin block in cordis YAML and that `node_modules/dsh-pamyat-kompakt/porogi.mjs` exists next to the package; look for the plugin load error in the platform log.

## Две-три строки подъёма на один подъём · Two or three start-up lines per start

**Признак.** Несколько строк «подъём» в одну секунду, тревоги печатаются по нескольку раз.

**Symptom.** Several "подъём" lines in the same second, alarms printed several times.

**Причина.** Несколько профилей одного процесса ссылаются на общий каталог плагинов, и `apply` зовётся несколько раз. В текущей версии страж одиночного монтажа пропускает повторные монтажи одного агента и пишет «второй монтаж пропущен». Если строк «пропущен» нет, а подъёмов несколько — у монтажей разные `agent` (или работает старая версия пакета).

**Cause.** Several profiles of one process reference a shared plugin directory and `apply` is called several times. In the current version the single-mount guard skips repeated mounts of one agent and prints "второй монтаж пропущен". If there are no "skipped" lines but several start-ups — the mounts have different `agent` values (or an old package version is running).

**Лечение.** Задайте одинаковый `agent` во всех ссылках одного агента; сверьте версию в квадратных скобках строки с установленной.

**Fix.** Set the same `agent` in all references of one agent; compare the version in the line's square brackets with the installed one.

## После переподнятия плагина сторож молчит · The guard is silent after re-mounting the plugin

**Признак.** После выгрузки и повторного монтажа в том же процессе — только «второй монтаж пропущен», тревог нет.

**Symptom.** After unloading and mounting again in the same process — only "второй монтаж пропущен", no alarms.

**Причина.** Ключ стража не снят при выгрузке. Так было, пока снятие висело на событии `'dispose'`, которого в cordis 4.0.1 нет; текущая версия снимает ключ через `ctx.effect`.

**Cause.** The guard key was not removed on unload. This happened while removal hung on the `'dispose'` event, which cordis 4.0.1 does not have; the current version removes the key via `ctx.effect`.

**Лечение.** Обновите пакет; проверка — `test/stend-vygruzki.mjs`. До обновления помогает перезапуск процесса.

**Fix.** Update the package; check with `test/stend-vygruzki.mjs`. Until then a process restart helps.

## «порог сжатия НЕ ПРОЧИТАН» · "compaction threshold NOT READ"

**Признак.** Тревоги ступеней идут от окна: «ЗАПОЛНЕНИЕ X% ОКНА N … ⚠️ порог сжатия НЕ ПРОЧИТАН (<agent>: D <путь>: <причина>)».

**Symptom.** Stage alarms use the window: "ЗАПОЛНЕНИЕ X% ОКНА N … ⚠️ порог сжатия НЕ ПРОЧИТАН (<agent>: D <path>: <reason>)".

**Причина и лечение по тексту причины · Cause and fix by the reason text:**

| Причина · Reason | Что не так · What is wrong | Лечение · Fix |
|---|---|---|
| `негодное имя агента` | `KOMPAKT_AGENT` не задан или с недопустимыми знаками · `KOMPAKT_AGENT` unset or has invalid characters | задайте `KOMPAKT_AGENT=<agent>` в окружении службы · set `KOMPAKT_AGENT=<agent>` in the service environment |
| `ENOENT …` | нет файла `<KOMPAKT_NASTROJKI_KATALOG>/<agent>.json` · no file `<KOMPAKT_NASTROJKI_KATALOG>/<agent>.json` | проверьте каталог и имя; файл готовит `dsh-pamyat-kompakt` · check the directory and name; the file is prepared by `dsh-pamyat-kompakt` |
| `неизвестная schema porogi` | в файле нет поля `porogi` или не та форма · the file lacks `porogi` or has another shape | приведите к форме из [SETTINGS.md](SETTINGS.md) · bring it to the shape in [SETTINGS.md](SETTINGS.md) |
| `маршрут не объявлен` | провайдер+модель текущего запроса не перечислены в `routes` (часто после смены модели) · the current request's provider+model are not listed in `routes` (often after a model change) | добавьте маршрут в файл порогов · add the route to the threshold file |
| `неполная пара provider/model` | у запроса известен только провайдер или только модель · the request knows only the provider or only the model | проверьте объявление маршрута платформой · check the platform's route announcement |
| `негодный defaultRoute` | нет полной пары provider/model · incomplete pair | исправьте defaultRoute по SETTINGS · correct the default route |
| `пустые routes` | список маршрутов пуст · empty route list | добавьте поддержанный маршрут · add a supported route |
| `негодный маршрут` | лишние/пропущенные поля или неверная пара · wrong fields or pair | ровно поля из SETTINGS · use the exact documented fields |
| `повтор маршрута` | два одинаковых provider/model · duplicate pair | удалите дубль · remove the duplicate |
| `негодные окно/доля/порог` | числа вне условия формы · invalid numeric bounds | целые 0 < nominalThreshold < window, 0 < ratio < 1 · use the documented numeric bounds |

## «ступени НЕ считаются: окна нет» · "stages NOT counted: no window"

**Причина.** Не прочитан готовый порог D, платформа не объявила окно (`contextWindow` необязателен), а `predel` равен 0. Причина в строке различает «у сессии нет requestContext()» (это про нас — старая платформа или подставной контекст) и «модель окна НЕ объявила» (это про модель).

**Cause.** The ready D threshold cannot be read, the platform announced no window and predel is 0. The reason in the line distinguishes "у сессии нет requestContext()" (about us — an old platform or a fake context) from "модель окна НЕ объявила" (about the model).

**Лечение.** Задайте `predel` числом окна модели; он будет помечаться «платформой не подтверждена».

**Fix.** Set `predel` to the model's window; it will be marked "платформой не подтверждена" (not confirmed by the platform).

## «предел в настройке … РАСХОДИТСЯ с окном» · "configured limit DIFFERS from the window"

**Причина.** `predel` описывает прежнюю модель. Счёт уже идёт по окну платформы; строка напоминает, что число в настройке ни на что не влияет.

**Cause.** `predel` describes a previous model. Counting already follows the platform window; the line reminds that the configured number affects nothing.

**Лечение.** Уберите `predel` или поставьте в него объявленное окно.

**Fix.** Remove `predel` or set it to the announced window.

## Тревога ступени повторяется после каждого перезапуска · The stage alarm repeats after every restart

**Причина.** Отданные ступени не сохраняются: в строке подъёма «отданные ступени: только память» (`DSH_HOME` не задан), «⚠️ … не прочитан» (файл испорчен) или в журнале «⚠️ отданные ступени НЕ сохранены» (нет прав или каталога `storages`).

**Cause.** Reported stages are not saved: the start-up line says "отданные ступени: только память" (memory only — `DSH_HOME` unset), "⚠️ … не прочитан" (file corrupted), or the log has "⚠️ отданные ступени НЕ сохранены" (no permission or no `storages` directory).

**Лечение.** Задайте `DSH_HOME`, создайте `$DSH_HOME/storages` с правом записи для пользователя агента. Испорченный файл можно удалить — сторож начнёт с пустого (возможен один повтор).

**Fix.** Set `DSH_HOME`, create `$DSH_HOME/storages` writable by the agent user. A corrupted file can be deleted — the guard starts empty (one repeat is possible).

## Тревоги ступени нет, хотя заполнение высокое · No stage alarm although the fill is high

**Причина.** (1) Ступень уже отдана в этой сессии и сжатия с тех пор не было — смотрите `otdany` в файле ступеней. (2) В ответах модели нет `usage` или `inputTokens` — замер пропускается. (3) Числитель — по последнему ответу модели и отстаёт от текущего заполнения на прирост между ответами. (4) Ступени считаются от порога сжатия, а не от окна: 85% порога меньше, чем 85% окна.

**Cause.** (1) The stage was already reported in this session and there was no compaction since — see `otdany` in the stage file. (2) Model responses have no `usage` or `inputTokens` — the measurement is skipped. (3) The numerator follows the last model response and lags the current fill by the growth between responses. (4) Stages are counted from the compaction threshold, not the window: 85% of the threshold is less than 85% of the window.

## «расход НЕ СООБЩЁН В СОБЫТИИ ПЛАТФОРМЫ» в каждой строке · in every line

**Причина.** Это норма для нашей сводки: платформа не кладёт расход вызова сводки в событие `compaction/summary`. Расход печатает сам пакет сводки (`dsh-pamyat-kompakt`) своей строкой рядом.

**Cause.** This is normal for our summary: the platform does not put the summary call's spend into the `compaction/summary` event. The summary package (`dsh-pamyat-kompakt`) prints the spend in its own line nearby.

## «длительность не измерима» · "duration not measurable"

**Причина.** Сторож не видел `compaction/start` этого сжатия (оно началось до монтажа) или у событий нет поля `time`. Время неожиданной формы (раньше 2020 года) тоже даёт «не измерима», а не число.

**Cause.** The guard did not see this compaction's `compaction/start` (it began before mounting) or events have no `time` field. A time of unexpected form (before 2020) also gives "не измерима" rather than a number.

## «🔴 сток не сработал» · "sink failed"

**Причина.** Команда `komandaStoka` вернула ненулевой код или не уложилась в 5 секунд. Строка в журнале при этом есть.

**Cause.** The `komandaStoka` command returned a non-zero code or exceeded 5 seconds. The log line is still there.

**Лечение.** Запустите команду руками от пользователя агента, подав текст на stdin: `echo test | /bin/sh -c '<komandaStoka>'`.

**Fix.** Run the command by hand as the agent user, feeding text on stdin: `echo test | /bin/sh -c '<komandaStoka>'`.

## Сводка не появляется · The summary never appears

**Причина.** Нет событий `turn/end` и сжатий: агент простаивает. Если нет и строки подъёма — плагин не смонтирован. Сторожа молчания в пакете нет: полная тишина снаружи неотличима от мёртвого сторожа.

**Cause.** No `turn/end` events and no compactions: the agent is idle. If there is no start-up line either — the plugin is not mounted. The package has no silence watcher: total silence is indistinguishable from a dead guard from the outside.

## «МОЛЧИТ N мин» у сессии · A session marked "silent N min"

**Причина.** От сессии больше часа нет событий. Сессия прежнего разговора (после `/new`, в архиве платформы) так не помечается — у неё «прежний разговор /new».

**Cause.** The session has sent no events for over an hour. A previous-conversation session (after `/new`, archived by the platform) is not marked so — it gets "прежний разговор /new".

## Строки сторожа печатаются дважды · Guard lines are printed twice

**Причина.** У старого кода возврат undefined из logger.info включал второй вывод console.log. В 3.1.1 выбирается один путь по наличию функции; при повторе проверьте версию в живой строке и два монтажа/два процесса.

**Cause.** Older code printed again to console when logger.info returned undefined. Version 3.1.1 chooses one path by function availability. If duplication remains, check the live line's version and duplicate mounts/processes.

## `npm test` изменил файл ступеней агента · `npm test` changed the agent's stage file

**Причина.** Стенд `stend-istochnika-rashoda.mjs` не снимает `DSH_HOME` и пишет ключ `'?'` в `$DSH_HOME/storages/storozha-stupeni.json`.

**Cause.** The stand `stend-istochnika-rashoda.mjs` does not unset `DSH_HOME` and writes a `'?'` key into `$DSH_HOME/storages/storozha-stupeni.json`.

**Лечение.** Гоняйте стенды без `DSH_HOME`: `env -u DSH_HOME npm test`. Лишний ключ `'?'` из файла можно удалить.

**Fix.** Run the stands without `DSH_HOME`: `env -u DSH_HOME npm test`. The extra `'?'` key can be removed from the file.

## `stend-opisaniya` покраснел после правки README · `stend-opisaniya` turned red after a README edit

**Причина.** Заголовок раздела сторожа изменён (уровни заголовков 2–4; сравнение без учёта регистра, лишних пробелов и вида тире), или колонка «🔴 ЧЕГО НЕ ЛОВИТ» появилась в другом разделе README — тогда он считается заявкой на сторожа, которого нет в коде.

**Cause.** A guard section heading was changed (levels 2–4 are compared ignoring case, extra whitespace and dash style), or the "🔴 ЧЕГО НЕ ЛОВИТ" column appeared in another README section — then it counts as a claim of a guard that is not in the code.

**Лечение.** Приведите заголовки трёх разделов к нормализованным именам из `STOROZHA` (`src/index.js`), английский — отдельной строкой ниже; колонку держите только в трёх разделах сторожей.

**Fix.** Match the three normalized section headings from `STOROZHA` (`src/index.js`), English on a separate line below; keep the column only in the three guard sections.
