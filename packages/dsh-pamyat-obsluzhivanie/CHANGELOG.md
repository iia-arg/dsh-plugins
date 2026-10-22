## 3.1.5 — 17.10.2026 · токен бота тревог службе не выдаётся (B-N-2055, хвост; наряд Забавы 20:46Z; Искра)

- `systemd/dsh-pamyat-obsluzhivanie.service`: сняты `Environment=AGENT_ALERT_TOKEN_FILE=%d/alert-token` и `AGENT_ALERT_CHAT_FILE=%d/alert-chat`; комментарий о данных машины — без `LoadCredential`, с доступом к спулу тревог. Прежде через эти переменные `agent-alert` (env главнее config, `/usr/local/lib/dsh-trevogi/nastrojki.py:61`) брал токен из credential службы и слал прямым путём. Теперь берёт путь из `/etc/dsh-trevogi/dsh-trevogi.conf`, учётке `omega` он не читается → клиентский путь через спул root-отправителя (`agent-alert:151`). Вставка sadik уже без `LoadCredential` (`20-ferma.conf` cdeeb29f, 17.10 20:34Z).
- README RU/EN (шаг 3 установки, описание юнита, «кто читает переменные»), `docs/SETTINGS.md` (`LoadCredential` — не задаётся; строка вставки — доступ к спулу; `AGENT_ALERT_*_FILE` — юнитом не задаются), `docs/TROUBLESHOOTING.md` (лечение «delivery: unknown» — спул и его отправитель вместо credential). Номер 3.1.5.
- Код пакета не менялся: credential он не читает (grep `src/` и `/usr/local/lib/dsh-pamyat-obsluzhivanie`, 17.10).

## 3.1.4 — 14.10.2026 · документация: актуальные номера

- README/доки: номера приведены к выпуску (Аврора, ветка nomera-v-dokah, fd070a17); номер пакета +1.
- Код пакета не менялся.

## 3.1.3 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- добавлен `README.en.md` — перевод `README.md` без изменения содержания.
- `package.json`: `engines.node >=22` (как у dsh-pamyat-omega).
- `package.json`: `author` — Aleksandr Argelander.
- Код пакета не менялся.

## 3.1.2 — 14.10.2026 · B-N-2028: запись решения «выключено владельцем» · owner's "disabled" decision record

RU: `src/heartbeat.py`: судья читает `/etc/dsh-pamyat-obsluzhivanie/vyklyucheno` (root, пишет только root, файл и каталог; поля `kto=`, `kogda=` ISO с поясом, `slovo=`). Маска + годная запись — rc 0 строкой «выключено владельцем: … с …» при любом сроке маски; маска без записи — прежний предел `MASK_LIMIT_DAYS` 3; запись без маски или негодная — rc 1. Повод: маска с 09.10 20:56Z по слову владельца, а sadik-watch тревожил владельца раз в 6 ч с 12.10 21:02Z (5 тревог до 14.10 03:00Z). Новый `test/test_reshenie_vyklyucheniya.py` (7). Условие Вениамина 06:05Z: `heartbeat(decision=None)` — `read_decision` берётся при вызове; `test_runner` и `test_credentials` подменяют его в `setUp` («записи нет», `create=True` — на прежнем коде безвредно), иначе оба читали живой `/etc/dsh-pamyat-obsluzhivanie/vyklyucheno` и краснели. НЕ ЛОВИТ: решение, отменённое словом, при оставленной записи; root-копию в /usr/local/lib кладёт монтаж, не пакет.

EN: `src/heartbeat.py` reads the owner's decision record; mask + valid record is rc 0 with a loud line at any age; mask without record keeps the 3-day limit; record without mask or an invalid record is rc 1.

## 3.1.1 — 13.10.2026 · A-N-1948 №14А

RU: Номер поднят с 1.1.20 на 3.1.1 по правилу владельца: каждый принятый модуль аудита получает 3.1.1. MIT в README/manifest/LICENSE; Python 3.12+ явно назван. Закреплённая fixture OMEGA соответствует REVIEW_STORE_SHA; отдельный тест проверяет её и отказ Writer при иной сумме. Документы отражают полный текущий набор тестов, внешний журнал V1, ручную связку и приватные пути состояния/ключа.

EN: The version jumps from 1.1.20 to 3.1.1 by the owner's audit-release rule. README/manifest/LICENSE agree on MIT; Python 3.12+ is explicit. The frozen store matches REVIEW_STORE_SHA and a dedicated test covers identity/hash refusal. Docs name the complete current suite, external V1 journal, manual link workflow and private state/key paths.

## 1.1.20 — B-N-1832 и B-N-1831: уроки без связи, повтор при занятой базе, предел 400 · unlinked lessons, busy-database retry, limit 400

`src/lessons.py`, `src/runner.py` (B-N-1832): признак «урок без связи с OMEGA» жил только в стенде — сломайся связывание в бою, проход сказал бы «ok». Теперь в конце ступени уроков, ещё под замком писателя, `lessons.bez_svyazi()` считает квитанции агента без связи ТЕМ ЖЕ определением, что `svyazat_zadnim --suho` (`perechen`: квитанции `omega_verified` с `local_id` и `omega_id`, базы `mode=ro`; без связи — всё, что не `uzhe`, с разбивкой по причинам). В отчёте: у агента `svyaz` {`kvitancij`, `bez_svyazi`, `itog`}, у ступени `bez_svyazi` и `bez_svyazi_ne_izmereno`; отказ чтения — «не измерено» (None), не 0; N > 0 или «не измерено» — `finding`. В итоге — «без связи=N». Отдельной строкой тревоги через `agent-alert` — «🔴 память <узел> <run_id>: уроки без связи с OMEGA: N (агент=n, …); не измерено: …»: `finding` у пакета обычен (4 ночи из 8 на 01.10–08.10: 02, 05, 06 и 08.10), в итоговой строке число утонуло бы; при N = 0 строки нет; исход — `svyaz_delivery`, неизвестный — код 2, как у итога. На живых данных 08.10 — 0 из 1997.

`src/lessons.py`, `src/local_lessons.mjs` (B-N-1831): ночью 08.10 два урока Гаммы не доставлены (`ERR_SQLITE_ERROR`) — база агента была занята его секретарём памяти, а ядро открывает её без ожидания занятости («database is locked»; проба на копии базы — SHARED, RESERVED и EXCLUSIVE чужого процесса дают ровно этот отказ). Мост теперь для кодов `ERR_SQLITE_*` отдаёт и `detail` — текст ошибки до 300 знаков (прочим кодам — только код, как было); ступень повторяет `get`/`save` только при «database is locked» в `detail`: `LOCK_POPYTOK` = 3 попытки, паузы `LOCK_PAUZY` = 0,5 и 1,0 с (запись секретаря держит базу 20–40 мс, между записями ≥ 10 с). Фактический предел — около 1,7 с с тремя запусками node; худшее — около 1,7 с на блок (200 блоков ≈ 340 с из 900 с ступени). Отказ после последней попытки — квитанция с `reason_detail` и `issues[].detail`, текст снимается после доставки; число повторов прохода — `zamok_povtorov`. `link` не повторяется (его отказ доставку не отменяет и виден как «без связи»). Ядро `hranilishche.js` не тронуто (общее для движков всех агентов).

`src/lessons.py`, `docs/SETTINGS.md`, `README.md`: `MAX_NEW` 200 → 400. Приход 01.10–08.10 — около 183 уроков в сутки при пределе 200 (на 08.10 в `pending` ушло 72, оценка на 09.10 — около 340); время предел не держит: 0,6–0,7 с на урок ⇒ 400 ≈ 5 мин из 900 с ступени.

Чего не ловит: больше 400 уроков в сутки — остаток снова уходит в `pending` до следующей ночи; замок дольше ~1,7 с — честный отказ с текстом, повтор следующей ночью; «database table is locked» (SQLITE_LOCKED) не повторяется; секретари агентов по-прежнему открывают базу без ожидания (ядро не правилось); связь к узлу с тем же текстом, но чужая по смыслу, считается `uzhe`; уроки без квитанции `omega_verified` не видны (граница `svyazat_zadnim`); что сообщения SQLite не несут значений записи — принято по устройству SQLite, перебором кодов не проверено.

Стенды: `test/test_bez_svyazi.py` (3: исправное → порча — связь снята у одной квитанции → возврат командой `--v-boj`, со следом в заглушке канала; «не измерено» — не 0 и отдельная строка; канал отказал на строке тревоги — код 2), `test/test_zamok_povtor.py` (4: без замка; замок 0,7 с — доставлено после повтора; замок 9,5 с — отказ с текстом ровно после 2 повторов; квитанция с `reason_detail` и снятие после доставки). Набор пакета — 133 из 133.

`src/lessons.py`, `src/runner.py`, `src/local_lessons.mjs`: receipts without an OMEGA link are counted per agent by the `svyazat_zadnim --suho` definition, reported (`bez_svyazi`, not-measured is never 0) and raised as a separate alert line when N > 0 or not measured (unknown delivery — exit 2). Local get/save is retried on "database is locked" (3 attempts, 0.5/1.0 s pauses, ~1.7 s effective limit); the SQLite error text goes into the receipt (`reason_detail`). `MAX_NEW` 200 → 400. Does not catch: more than 400 lessons a day (pending again), locks longer than ~1.7 s, SQLITE_LOCKED, agent secretaries opening without a busy wait. Harnesses `test/test_bez_svyazi.py`, `test/test_zamok_povtor.py`.

## 1.1.19 — A-N-1732, проход задним числом: живая служба и стенд · backfill: live service and harness

`src/svyazat_zadnim.py`: `--v-boj` до копии базы и замка читает у службы агента из реестра (`namerenie.sluzhba`) `LoadState` и `MainPID` (`systemctl show`). Служба неизвестна или не читается — отказ (`sluzhba_neizvestna`, `sluzhba_ne_chitaetsya`, `sluzhba_ne_v_reestre`, `registry_not_set`); `MainPID ≠ 0` — отказ `sluzhba_zhiva`, код 2, до любого действия. Осознанный обход — `--pri-zhivoj-sluzhbe ПРИЧИНА` (только с `--v-boj`, причина непустая, до 200 знаков, одной строкой): проход A-N-1731 по 6 агентам шёл именно при живой службе в пустом ходе по решению (а) ворот. Служба, MainPID и причина пишутся в шапку списка отката и в итог. Граница: проверка разовая, до прохода — подъём службы во время прохода не виден. Дефект 1.1.18, найден стендом: два `--v-boj` в одну секунду получали один путь копии и списка — список второго падал, а `backup` второго перезаписывал копию «до» первого; теперь метка с микросекундами, копия создаётся только новым файлом (`O_EXCL`), занятый путь — отказ `kopiya_uzhe_est` до действия. `test/test_svyazat_zadnim.py` (8, новый): стенд команды в пакете — `--suho` без записи; `--v-boj` (связь, копия, шапка, повтор без второй связи); `--otkat` (связь и отметка сняты); живая служба без ключа — отказ до копии; с ключом — проход и причина в списке; ключ без причины и не с `--v-boj` — отказ; несошедшийся текст узла — пропуск без связи; неизвестный довод; разбор `systemctl show`. Подставная база создаётся настоящим ядром, урок — настоящей ступенью; OMEGA и MainPID подменены.

`src/svyazat_zadnim.py`: `--v-boj` refuses when the agent's service (registry `namerenie.sluzhba`) has `MainPID ≠ 0` (`sluzhba_zhiva`) or is unknown; a conscious override `--pri-zhivoj-sluzhbe REASON` records the reason and MainPID in the rollback list header. `test/test_svyazat_zadnim.py` (8, new): package harness for the command.

## 1.1.18 — A-N-1731, связь уроков задним числом · lesson link backfill

`src/svyazat_zadnim.py` (новый): разовый проход для уроков, доставленных в OMEGA до 1.1.17 без строки `svyaz_omega` (на 07.10 — 1678 у 9 агентов). Зовущий — человек под учёткой omega, по одному агенту. Пары берутся из квитанций `lessons.json` (`omega_verified`), но квитанция — лишь подсказка: связь ставится только если чтением сошлось всё — локальная запись (агент, `urok`, источник, связи нет) и узел OMEGA по SQL `mode=ro` (без сервера: его запрос меняет `access_count`) — `lessons_store.verify` (корень, состояние, текст, источник, `source_key`) и единственность узла по ключу. Связь — операция `link` 1.1.17 (`dostavka` / `vosstanovleno-tekstom` у legacy), отметка `dostavleno / podtverzhdeno-chteniem`. Режимы: `--suho` (перечень и причины пропуска, без записи), `--v-boj` (копия `pamyat.db` sqlite backup + `integrity_check`, замок писателя уроков, список отката: намерение до связи, подтверждение после, fsync), `--otkat СПИСОК` (снять ровно вставленные связи и отметки). Неизвестный или сокращённый довод — отказ, код 2. Не ловит запись агента в свою базу между сверкой и связью: проход по бою — при остановленном агенте.

`src/svyazat_zadnim.py` (new): one-off backfill of `svyaz_omega` links for lessons delivered before 1.1.17, verified by read-only SQL against OMEGA; modes `--suho`, `--v-boj` (backup, writer lock, rollback list), `--otkat`.

## 1.1.17 — A-N-1705, связь уроков с OMEGA · lesson↔OMEGA link

`src/lessons.py`, `src/local_lessons.mjs`: урок, перенесённый ступенью уроков в OMEGA, не получал строки `svyaz_omega` в базе агента — выдача Б метила его «корень не проверен (записи ядра нет)», выдача А отбрасывала, а журнал ядра заканчивался ложным `ne-udalos-proverit / dolgovremennyj-sloj-ne-smontirovan` (за 48 ч на 05–07.10 — 680 строк, все класса `urok`). Теперь после подтверждения OMEGA (`lessons_store`: корень, точный текст, ключ источника) ступень зовёт новую операцию `link` моста: сверка, что локальная запись — тот самый урок (номер, агент, класс, источник); связь штатным `hranilishche.svyazat` ядра (`dostavka`, у legacy-записи без `source_key` — `vosstanovleno-tekstom`); исход в журнал ядра — `dostavleno / dolgovremennyj-sloj` (записан этим проходом) или `dostavleno / podtverzhdeno-chteniem` (найден в OMEGA). Связь с другим узлом не меняется: `ne-udalos-proverit / svyaz-omega-konflikt` и находка `link:link_conflict`; отказ связи доставку не отменяет (квитанция `omega_verified`). Строка «не смонтирован» при `save` остаётся — её пишет ядро, в процессе службы слоя OMEGA нет; за ней теперь закрывающий исход. Уже записанные уроки (на 07.10 — 1678 без связи) этим выпуском не связываются: отдельный разовый проход. Стенд `test/test_svyaz_omega.py` (4).

`src/lessons.py`, `src/local_lessons.mjs`: lessons moved to OMEGA got no `svyaz_omega` link, so retrieval marked them root-unverified and the core journal ended with a false "layer not mounted". After OMEGA confirmation the stage now calls the bridge `link` operation: it checks the local record, writes the link via the core storage API and journals `dostavleno`; a link to another node is never overwritten (`link_conflict`); a link refusal does not undo delivery. Existing lessons are not backfilled by this release. Harness `test/test_svyaz_omega.py`.

## 1.1.16 — B-N-1667 r4, память сбоев модели · model-failure memory

`src/judge.py`, `src/runner.py` (У1 Вениамина): порог доли на прогон (1.1.15) не видит пару, падающую каждую ночь, и устойчивую низкую долю. Теперь в `state.json` судьи: `sboi` — ночей подряд со сбоями (ночь — UTC-день прогона; повторный прогон дня не считается; ночь без сбоев или пропуск дня рвёт цепочку); на `SBOI_NOCHEJ` = 3 — `sboi_trevoga`, `runner` даёт `error` один раз на цепочку. `sboi.po_klyuchu` — ночи сбоя каждой пары; на 3-й пара уходит из очереди в `otlozheno` (судье больше не отдаётся, при повторном нахождении не возвращается; снять — `prosmotreno.py`, правка текста даёт новый ключ) и называется в недельной выдаче: id, корень, класс ошибки, без текстов. В строке итога — «ночей подряд со сбоями N, отложено пар M». r5: счёт сбоев пары — подряд по этой паре (вердикт сбрасывает запись ключа), записи `po_klyuchu` для ключей вне очереди (разобраны, отложены, отсечены, сняты) удаляются — `state.json` их не копит. Стенд `test/test_sboi_nochej.py` (9, приток пар каждую ночь).

`src/judge.py`, `src/runner.py`: failure memory in the judge state — three consecutive nights with model failures raise one error per chain; a pair failing on three nights is moved to `otlozheno`, no longer sent to the model, and listed weekly with ids, root and error class only. Harness `test/test_sboi_nochej.py`.

## 1.1.15 — B-N-1667 r3, сбой модели на отдельной паре — finding, а не error · per-pair model failure is a finding

`src/runner.py`: с 0.1.0-alpha.2 любой непустой `failures` судьи делал прогон `error` (юнит failed, код 1). При 40 вызовах за ночь не всплывало; после B-N-1618 (до 500) один негодный JSON модели из 460 вызовов покрасил ручной прогон 05.10 14:42Z, хотя пара осталась в очереди и будет спрошена следующей ночью. Теперь: сбои отдельных пар — `finding` (код 0); `error` — ошибка самого прогона (`error`, напр. journal) или доля сбоев ≥ `OSHIBOK_MODELI_DOLYA` = 0,10 (модель/ключ/сеть недоступны массово). В строке итога — «ошибок модели N из M;» отдельным куском после «вызовов …/500;» (прежний формат цел). Стенд `test/test_oshibki_modeli.py` (5).

`src/runner.py`: per-pair judge model failures no longer make the run an error; they give a finding, and the pairs stay queued. The run is an error only for run errors or when the failed share of calls reaches `OSHIBOK_MODELI_DOLYA` = 0.10. The summary names the model failure count. Harness `test/test_oshibki_modeli.py`.

## 1.1.14 — B-N-1667, читатель вердиктов судьи · judge verdict reader

`src/judge.py`, `src/runner.py`: вердикты `contradiction` лежали в `state.json → done` без читателя (на 05.10 — 12; комментарий B-N-1618 о «недельном читателе» был без кода), а пара с признаком секрета красила итог каждую ночь без адреса. Теперь: в итоге прогона — «противоречий новых N» (`protivorechij_novyh`); раз в 7 суток (`NEDELYA_DNEJ`) судья кладёт `vydacha-<день>.json` (0600) — все противоречия из `done`, не отмеченные `prosmotreno.py`, с id, корнем, днём, причиной и текстами обеих записей (до 300 знаков), и пары очереди с признаком секрета (только id, корень и вид совпадения); `runner` шлёт её частями до 3500 знаков тем же `agent-alert` после итога, удаляет файл при приёме всех частей, неизвестный исход — код 2 и `nedelya_delivery` в отчёте. Пара повторяется каждую неделю, пока человек её не снимет. r2 (У1 Вениамина): только для выдачи — ещё 4 образца `SECRET_VYDACHI` (токен бота Telegram, JWT, AWS `AKIA…`, `token|токен|api_key|secret|секрет` = значение ≥16): такая пара уходит id и видом; в политику судьи не входят, 64-hex/sha намеренно нет. Стенд `test/test_nedelya.py` (15).

`src/judge.py`, `src/runner.py`: contradiction verdicts had no reader. The run summary now carries the new-contradiction count; every 7 days the judge writes a weekly listing (contradictions with ids, root, reason and both texts; secret-sign queue pairs with ids and match kind only) that the runner sends in parts through `agent-alert` after the summary. Harness `test/test_nedelya.py`.

## 1.1.13 — B-N-1618, политика очереди судьи · judge queue policy

`src/judge.py`: очередь судьи росла без предела — приток (журнал V1 240–600 строк в сутки, соседи по векторам при сходстве ≥ 0,80 — до ~1000 пар в сутки) на порядки больше разбора (40 вызовов в сутки). Теперь пары отбираются по политике: строки журнала V1 — с расстоянием ≤ `V1_MAX_DIST` = 0,10, соседи — со сходством ≥ `SOSED_MIN_SIM` = 0,92 (было 0,80). Пара вне политики, принятая раньше, снимается из очереди при прогоне (`otsecheno` в итоге судьи), в `seen` остаётся; строки журнала вне политики считаются в `coverage.journal_out_of_policy_rows`. Пороги выбраны так, чтобы сохранить противоречия, которые недельный читатель вердиктов разбирает первыми: из 12 разобранных противоречий в политике остаются 10 (при 0,08/0,95 было бы 2). Замер на копии живого состояния sadik 05.10: очередь 11 001 → 525, отсечено 10 481. 🔴 Срез дальних пар — ВСЛЕПУЮ: судья разбирает ближайшие пары первыми, среди 320 разобранных нет ни одной со сходством ниже 0,90, поэтому доля противоречий среди отсечённых дальних пар не измерена. `MAX_CALLS` 40 → 500: приток при новой политике ≈ 110 пар в сутки, очередь 525 разбирается за две ночи; 500 вызовов ≈ 1300 с из 1800 с предела ступени, цена ночи до $0,13–0,36. `src/runner.py`: строка сводки владельцу показывает предел вызовов из `judge.MAX_CALLS`, а не постоянное «/40». Пороги — оценка по одной неделе замеров; рост очереди трое суток подряд по-прежнему даёт 🔴 — знак пересмотреть. Тесты: предел вызовов и размер фикстуры берутся из `MAX_CALLS`; добавлены 4 теста политики (границы, V1 по расстоянию, соседи по настоящим векторам 0,93/0,91, снятие старой очереди).

`src/judge.py`: the judge queue grew without bound (inflow far above 40 calls/day). Pairs are now selected by policy: V1 journal rows with distance ≤ `V1_MAX_DIST` = 0.10, vector neighbours with similarity ≥ `SOSED_MIN_SIM` = 0.92 (was 0.80); earlier-accepted out-of-policy pairs are dropped from the queue on a run (`otsecheno`). The thresholds keep 10 of 12 judged contradictions. Measured on a copy of the live sadik state: queue 11,001 → 525. The cut of far pairs is BLIND: judged pairs are biased to close ones. `MAX_CALLS` 40 → 500 (inflow ~110 pairs/day; ~1300 s of the 1800 s stage limit). `src/runner.py`: the owner summary shows the call cap from `judge.MAX_CALLS`. Thresholds are an estimate from one week of measurements.

## 1.1.12 — B-N-1598, текст отказа в отчёте прогона

`src/runner.py`: отказ `Refused`, поднятый в самом раннере до ступеней (например `registry_not_set` из `lessons.load_agents`, когда не задана `AGENTS_REGISTRY`), пишется в `reason` отчёта своим текстом — как уже делалось в дочерней ступени (`child`). Прочие исключения по-прежнему дают только имя класса. Раньше ночной отказ 05.10 01:00Z лёг в отчёт словом `Refused` без причины. Тест `test_refusal_reason_text_kept_in_runner`.

`src/runner.py`: a `Refused` raised in the runner itself before the stages (e.g. `registry_not_set` from `lessons.load_agents` when `AGENTS_REGISTRY` is unset) is written to the report `reason` with its text — as the child stage already did. Other exceptions still give only the class name. Test `test_refusal_reason_text_kept_in_runner`.

## 1.1.11 — перенумерация (A-N-1562): прежний 0.1.0-alpha.11, код не менялся · renumbering, code unchanged

## 0.1.0-alpha.11 — 2026-10-04 (не выпущено · unreleased)

Данные машины вынесены из кода и юнита пакета · Machine data moved out of the package code and unit:

- `src/judge.py`, `src/runner.py`: имя узла в тревогах, отчёте и строке итога берётся из системы (`os.uname().nodename`), а не строкой в коде; на прежней машине текст тот же. · The node name in alerts, the report and the summary line comes from the system (`os.uname().nodename`) instead of a string in the code; on the previous machine the text is the same.
- `src/lessons.py`: путь реестра агентов — настройка `AGENTS_REGISTRY`; не задана — отказ `registry_not_set`. · The agent registry path is the `AGENTS_REGISTRY` setting; unset — the `registry_not_set` refusal.
- `src/prepare_key.py`: дом учётки хранилища ключа и каталог `pass` — настройки `OBSL_KLYUCH_HOME` и `OBSL_KLYUCH_HRANILISHCHE`; не заданы — отказ `credential_source_not_set` до запуска `pass`. · The key store account home and the `pass` directory are the `OBSL_KLYUCH_HOME` and `OBSL_KLYUCH_HRANILISHCHE` settings; unset — the `credential_source_not_set` refusal before `pass` starts.
- `systemd/dsh-pamyat-obsluzhivanie.service`: `LoadCredential` канала тревог и путь установленного `runner.py` (`OBSL_RUNNER`) перенесены во вставку юнита машины; без вставки служба не стартует. Юнит пакета вместе со вставкой прежней машины построчно равен прежнему юниту. · The alert channel `LoadCredential` lines and the installed `runner.py` path (`OBSL_RUNNER`) moved to the machine unit drop-in; without it the service does not start. The package unit together with the previous machine's drop-in equals the previous unit line by line.
- `test/`: имена людей и агентов в данных тестов заменены нейтральными; новый `test_nastrojki_mashiny.py` (5 тестов: отказы без настроек, имя узла из системы). Тест вызывающего heartbeat в стороже машины вынесен из пакета: он проверяет машину, а не пакет. · Names of people and agents in test data replaced with neutral ones; new `test_nastrojki_mashiny.py` (5 tests: refusals without settings, node name from the system). The test of the heartbeat caller in the machine watchdog moved out of the package: it checks the machine, not the package.
- `test/proba-root-paths.sh`, `test/security-root.py`: ловушка «старый runner» лежит в подменённом `/run/plugins-proba`, владелец ловушек — `nobody:nogroup` (прежняя учётка `dsh` есть не на всякой машине), источник ключа — пробные пути; проба «вывод больше 65536» требует именно отказа `credential_reader_failed`. · The "old runner" trap lives in the substituted `/run/plugins-proba`, the traps are owned by `nobody:nogroup` (the former `dsh` account does not exist on every machine), the key source is probe paths; the "output over 65536" probe requires exactly the `credential_reader_failed` refusal.

Исправлено: `src/local_lessons.mjs` читает stdin как UTF-8 (`setEncoding`), и кириллический знак на границе куска (~64 КиБ) больше не становится U+FFFD — у уроков больше 64 КиБ `prepare` и `save` получают один и тот же текст. Превышение предела входа теперь доходит до вызывающего отказом `input_limit`, а не общим `local_protocol_unknown`. Новый тест `test/test_local_lessons.py` (3 пробы, настоящий путь через `lessons.local`); всего 76 тестов. Поведение службы и юнитов не менялось.

Fixed: `src/local_lessons.mjs` reads stdin as UTF-8 (`setEncoding`), so a Cyrillic character on a chunk boundary (~64 KiB) no longer becomes U+FFFD — for lessons larger than 64 KiB `prepare` and `save` get the same text. Exceeding the input limit now reaches the caller as the `input_limit` refusal rather than a generic `local_protocol_unknown`. New test `test/test_local_lessons.py` (3 probes, the real path through `lessons.local`); 76 tests in total. Service and unit behaviour is unchanged.

Документация и комментарии · Documentation and comments — сами эти правки код, директивы юнита, прочие поля `package.json` и строки `--help` не меняли; изменения кода и юнита — пункты выше, номер версии — 0.1.0-alpha.11, строка документации `runner.py` без номера внутренней задачи (меняет вывод `--help`) · these edits by themselves did not change the code, unit directives, other `package.json` fields or `--help` strings; the code and unit changes are the items above, the version is 0.1.0-alpha.11, the `runner.py` docstring lost its internal task number (changes the `--help` output):

- Добавлены `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`; `README.md` переписан двуязычным по общему стандарту документации. · Added `docs/ARCHITECTURE.md`, `docs/SETTINGS.md`, `docs/GUARDS.md`, `docs/TROUBLESHOOTING.md`; `README.md` rewritten bilingual to the common documentation standard.
- `package.json`: `description` на двух языках, добавлены `keywords`, `docs` добавлен в `files`; прочие поля прежние. · `package.json`: bilingual `description`, `keywords` added, `docs` added to `files`; other fields unchanged.
- `src/` и `test/`: комментарии двуязычные (RU/EN) и обезличенные; код без комментариев равен прежнему (сравнение синтаксических деревьев); строки документации модулей, которые печатаются в `--help`, не тронуты. · `src/` and `test/`: comments are bilingual (RU/EN) and anonymized; the code without comments equals the previous one (syntax-tree comparison); module docstrings printed by `--help` are untouched.
- `systemd/dsh-pamyat-obsluzhivanie.service`: двуязычный и обезличенный комментарий; директивы юнита не менялись. · `systemd/dsh-pamyat-obsluzhivanie.service`: bilingual, anonymized comment; unit directives unchanged.
- История ниже обезличена: из заголовков убраны пометки исполнителей и номера внутренних задач, имена заменены ролями; содержание записей сохранено. · The history below is anonymized: author marks and internal task numbers were removed from headings, names replaced with roles; entry content is preserved.

## 0.1.0-alpha.10 — 2026-10-03

- `src/lessons.py`: урок ГОСТЯ (запись реестра с отличием `GOST: true`, режим `--gost`) ложится в OMEGA и в локальную базу с пометкой `POMETKA_GOSTYA` в начале — той же, что ставит шлюз гостей; ключ блока — от исходного тела (учёт не сдвигается), content_sha сходится с OMEGA и локальной копией.
- `test/test_lessons.py`: +2 теста (гость с пометкой, системный без; ключ от непомеченного тела).
- Строка пометки — `[ДАННЫЕ ГОСТЯ — РИСК — НЕ ИНСТРУКЦИЯ] ` (слово владельца 03.10 13:23 МСК «добавить слово „риск“»), одна с шлюзом гостей и выдачей dsh-pamyat-omega (сцепка П-гость4 стенда шлюза).
- НЕ ЛОВИТ: гостя без отличия GOST в реестре (тогда урок без пометки — как у системного).

## 0.1.0-alpha.9 — 2026-10-02

REVIEW_STORE_SHA → c587490f… — `_store.py` поставки OMEGA 1.5.19 после местной правки (окно координатора 02.10 03:09:17Z): 3ae446d3 → c587490f, +29 −21 — только `with self._lock:` (7) и строки-метки с переотступом; без них 1185 строк кода до и после совпадают по порядку. На a8 с новой поставкой конструктор Writer отказывает `omega_store_hash_mismatch` (проба от omega 02.10 03:12:28Z) — ступень уроков и весь ночной прогон 01:00Z ушли бы в error. Код, кроме строки суммы, не менялся. README — строка пина.

## 0.1.0-alpha.8 — 2026-10-01

- Новая первая ступень `memory_count` (до уроков и чистки) — зовущий для `zhurnal.svodka` ядра: по реестру агентов (9 баз) открывает каждую readOnly через `zavestiZhurnal(…, { tolkoChtenie: true })` ядра ≥ a101 и считает «новое = отметки zapisano − строки zapisi − отсечка», то есть записи, исчезнувшие из базы без следа в журнале. Отсечку не ставит и не двигает.
- `src/memory_count.py` и `src/memory_count.mjs` — новые; `src/runner.py` 7e6254ba → ba350d24 (+15 −3): ступень в отчёте (`memory_count`), в общем статусе и в строке сводки («баз X/N, расхождений M/X»). Нет или порча отсечки, недоступная база, пустой охват — error; расхождение — finding. Пределы: 5 с на базу, 60 с на ступень, без повторов.
- Читатель — прежний общий итог прогона через `agent-alert --plain`; нового таймера нет, исправная проверка отдельной тревоги не создаёт.
- ⚠️ Выключателя у ступени нет: она исполняется в каждом боевом прогоне (таймер 01:00Z). Смонтировать — значит включить. Ожидаемая первая находка — <agent>, новое 215 (удаление 29.09 по слову владельца), пока отсечку не сдвинут.
- Тесты `test/test_memory_count.py`; README — раздел ступени.
- НЕ ЛОВИТ: удаление, при котором и запись, и отметка журнала стёрты вместе; доставку числовой тревоги, если общий прогон оборвался до итога.

## 0.1.0-alpha.7 — 2026-09-30

REVIEW_STORE_SHA → 3ae446d3… — `_store.py` поставки OMEGA 1.5.19 с нашими носителями (перенесён заново). Живой Writer на стенде от omega: с новой суммой урок записан и прочитан, с прежней 4ba0a9ae — отказ `omega_store_hash_mismatch` (контроль). Сигнатура `store` совместима (+allow_supersession). Монтируется ОДНИМ окном с переходом OMEGA на 1.5.19 (с прежней поставкой ступень уроков откажет — громко, прогон ночью 01:00Z). Код, кроме строки суммы, не менялся.

## 0.1.0-alpha.6 — 2026-09-30

- Новая ступень `src/chistka.py` после уроков, до судьи: у записей сверх последних 1000 с текстом и старше срока брифинга (restore.ignoreAfterMs из профиля агента; не прочитан — слепота агента, не число) стирает текст, ставит `vychishcheno` (поле ядра ≥ a98; нет — отказ). Не трогает: сводки компакта, держателей и цели отношений, очередь в OMEGA, уроки из файлов (квитанции lessons.json), записи не в OMEGA (живая запись — active без ttl_seconds и без valid_until, условие приёмки 30.09; носитель A — узел своего корня, B — двойник sha1 NFC своего корня; неживые — числом отдельно).
- По умолчанию СУХАЯ: полный перечень «снял бы» и причины удержания в отчёте прогона. Боевая — только `chistka.json {"primenyat": true}` в каталоге состояния: страховка sqlite backup + проверка воспроизведением (integrity_check, счёт строк, текст каждого кандидата) → одна транзакция BEGIN IMMEDIATE (замок записи ядра/секретаря; занято — пропуск агента) → по каждой записи перепроверка, OMEGA — снимок после взятия замка. Предел 500 за проход (PREDEL); страховок KEEP = 3 на агента — старшие удаляются после успешного прохода, откат возможен не дальше трёх последних боевых проходов. Откат: `chistka.py vernut <база> <страховка>`.
- `runner.py`: ступень в отчёте (`chistka`), в общем статусе и в строке сводки («чистка=…: снял бы N, стёрто M, слепота K»).

## 0.1.0-alpha.5 — 2026-09-30

- Уроки не переносились в OMEGA (omega_store_hash_mismatch): после патча поставки OMEGA (29.09 14:22:29Z, _store.py 9f22f2d1 → 4ba0a9ae — дедуп store только внутри своего корня) закреплённая сумма писателя устарела. Правка поставки для писателя безвредна и безопаснее (чужой корень больше не возвращается как дубль).
- `src/lessons_store.py` 1763376c → 7f8ab420: `REVIEW_STORE_SHA` = 4ba0a9aeb7e1131eb8c2081ed12f173122e5e3a39f13aa2b42a1452e9463c59a (полная sha256 живого _store.py). `README.md` a5797b83 → d92963c4: строка пина (на прежних 9f22f2d1 и 75d477b8 запись ОТКАЗЫВАЕТ).

## 0.1.0-alpha.4 — 2026-09-29

- Текст сводки прогона называет «просмотрено=N» рядом с «секретных=» и «длинных=» — счёт отметок человека виден не только в JSON судьи.

## 0.1.0-alpha.3 — 2026-09-29

- Признак секрета: у `sk-` граница слова слева — хвосты путей «vypusk-…», «disk-…» больше не ловятся (на <host> 3 из 26 ложных совпадений). Прочие ветки шаблона — как у эталона <host> 0d685f81.
- Ручная отметка «просмотрено человеком»: `src/prosmotreno.py spisok | otmetit КЛЮЧ КТО ПОЧЕМУ | snyat КЛЮЧ КТО ПОЧЕМУ` (от omega). Хранится в `<state>/prosmotreno.json` рядом с state.json судьи. Отмеченная пара выходит из очереди, судье не отдаётся, в `secret_pairs`/`oversize` не считается и `finding` не даёт; счёт — поле `prosmotreno` итога судьи. Ключ пары зависит от текстов: правка записи — и отметка перестаёт действовать сама. Запись — под замком прогона (идёт прогон — отказ). Битый файл отметок — ValueError, прогон не угадывает.
- Тесты `test/test_prosmotreno.py` (6): граница sk-, отметка снимает счёт и не зовёт судью, правка записи снимает отметку, снятие возвращает в счёт, отказы, битый файл.

## 0.1.0-alpha.2 — 2026-09-28

- ступень append-only UROKI по реестру; native local core → точный OMEGA Store с отдельными квитанциями, без bridge/evolution.
- Только uid omega; pin кандидата _store 9f22f2d1, старый75d477b8 — отказ. Degraded/нет backend/нет vec → отказ до новых persistent записей; post-read и вектор обязательны.
- Отдельная целостность ловит duplicate source_key, локальные дубли источника, изменённые/исчезнувшие записи и векторы. Курсоры агентов/блоков не дают постоянным отказам занять весь бюджет.
- Адресные ACL идут отдельным монтажным составом. MemoryMax4G для embedding, настройки bge-m3 из действующего OMEGA; сборщик не исполняется от root.

## 0.1.0-alpha.1 — 2026-09-28

- Дельта v2 ворот: служба переведена в omega; root-heartbeat и подготовка credentials — отдельные root-owned копии под системным Python -I -S -B. Venv и node_modules больше не root-путь.
- Маска возрастом от 3 суток даёт heartbeat rc1 с датой; неизвестная дата rc2. Чтение omega-owned state от root ограничено 1 МиБ, без symlink/FIFO.

- первый выпуск runner + read-only судья; одна итоговая строка, persistent очередь и лимит 40 за UTC-день, nonblocking flock, отдельный heartbeat.
- Остановка одним systemctl mask таймера; runner проверяет маску до запуска и во время worker. Юниты в /usr/local/lib/systemd/system, без отдельного таймера судьи.
- Уроки exact-only и изменение памяти не входят в выпуск. Судья перенесён из кандидата исполнителя 6bcd5d9f19ed040b, прежний самостоятельный CLI снят; алгоритм, SECRET и очередь сохранены.
