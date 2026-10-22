## 3.1.8 — 2026-10-18 · журнал 2G: omega-kopiya-watch и два его стенда (Заря; ворота Вениамина: замысел 08:32, сторож r3 08:38 МСК)

- `bin/omega-kopiya-watch` `c309c59b` → `1d22ca06` (= бою `/usr/local/sbin/omega-kopiya-watch`, монтаж Забавы 18.10 05:38Z): признак вектора OMEGA снимается по базе, а не по журналу службы — с 17.10 журнал 2G держит ≈ 1,5 сут.
- `test/stend-modeli-omega.sh` `9da6fd2e` → `6545da2b` (r3), `test/stend-svodki-doveriya.sh` `4216a8be` → `da032fe7` — под тот же признак (стенды 3 и 4 ночи 18.10).
- README (RU/EN): номер версии приведён к выпуску (стоял 3.1.6 при пакете 3.1.7).

## 3.1.7 — 2026-10-17 · шапки двух стендов omega-kopiya-watch: ночной обход вместо «не ставить» (находка Авроры, решение Искры)

- `test/stend-pravki-postavki-omega.sh` (признак 6) и `test/stend-svodki-doveriya.sh` (признак 5б): шапка «в суточный обход не ставить» (26.09) противоречила перечню ночного обхода, куда оба вписаны с переноса пакета 04.10, а доводы им даёт A-N-1711 (07.10). Ночной обход 17.10 их исполнил: 19 с и 10 с, пакет зелёных 21 из 21. Шапка теперь называет обоих зовущих и говорит, что красное в последнем такте ночью — живое состояние боевой поставки OMEGA, а не дефект стенда. Код стендов не менялся.
- README (RU/EN): строка «нельзя запускать без подмен» для этих двух стендов — то же.
- Headers of `stend-pravki-postavki-omega.sh` and `stend-svodki-doveriya.sh` no longer say "not for the daily round": both run nightly (A-N-1711), 19 s and 10 s; red in the last step at night is live production state, not a stand defect. README lines updated. No code change.

## 3.1.6 — 2026-10-15 · TEAM-003: новые агенты до первого запуска

- Отсутствующий session-root не тревожит только при доказанном ещё не состоявшемся запуске по текущим systemd-свойствам и сохранённому журналу; waiting считаются отдельно, не включаются в inspected.
- Запускавшаяся/неизвестная служба без каталога остаётся слепотой с тревогой. Metadata/journal queries ограничены5с в общем60с, работают отroot, MESSAGE не читают. Права и уведомления не перенастроены.
- Добавлен @root fixture-стенд12методов с подставными systemd/journal/alert; порядок Z5→первый старт описан без blanket-исключения. Production не менялся автором.

## 3.1.5 — 2026-10-15 · версия при подъёме видна квитанции

- Стартовая строка идёт прямо в stdout, а не только в logger Cordis, который без exporter хранит её в памяти. Прочие сообщения не менялись, двойного startup-вывода нет.
- Реальный Cordis без exporter и повторный mount проверяются новым stend-startup-journal; ожидание startup в audit-plugin перенесено с logger на stdout. Читатели pered-podyomom/kvitanciya-podyoma остаются строгими и неизменными; список исключений не вводился.
- Startup now prints once to process stdout instead of depending on a Cordis exporter. Other event messages keep the existing logger. Actual Cordis/remount tests added; strict version/receipt readers unchanged. No deployment or live restart performed by author.

## 3.1.4 — 14.10.2026 · npm 12: имя архива через `npm-sostav` (B-N-2048)

- `test/stend-audit-install.mjs`: имя архива `npm pack --json` разбирает помощник `npm-sostav --filename` (`dsh-pribory` 3.1.2) —
  одним правилом для npm 11 (массив) и npm 12 (объект); прежний `JSON.parse(…)[0].filename` под npm 12 слеп (код 2).
- Нет `npm-sostav` в PATH или он отказал — СЛЕПОТА, код 2, с причиной («нужен dsh-pribory ≥ 3.1.2»); не красное и не зелёное.
- `package.json`: необязательный peer `dsh-pribory ^3.1.2` (`peerDependenciesMeta.optional`) — объявляет требование стенда, ничего не ставит.
- Код пакета не менялся. В дереве стенд по-прежнему слеп под любым npm: рядом нет `dsh-pamyat-kompakt` (это не npm).

## 3.1.3 — 14.10.2026 · документация: актуальные номера

- README/доки: номера приведены к выпуску (Аврора, ветка nomera-v-dokah, fd070a17); номер пакета +1.
- Код пакета не менялся.

## 3.1.2 — 14.10.2026 · подготовка к публикации: оформление

- номер версии в README приведён к выпуску.
- добавлен `README.en.md` — перевод `README.md` без изменения содержания.
- `package.json`: `engines.node >=22` (как у dsh-pamyat-omega).
- Код пакета не менялся.

## 3.1.1 — 13.10.2026 · A-N-1948 №17

RU: Прыжок 1.1.51 → 3.1.1 по прямому наряду владельца на выпуск модулей аудита. Обязательный peer dsh-pamyat-kompakt, одна печать, готовый D без окна, асинхронный сток и отмена ожидания при выгрузке, ограниченный охват 128 сессий. CLI: большой журнал без spread, полный список членов, безопасный контроль путей, именованная слепота, один возврат файла, общая read-only проверка источников. Стенды и RU/EN-договоры согласованы; живой монтаж не выполнялся.

EN: The version jumps from 1.1.51 to 3.1.1 by the owner's audit-release instruction. Mandatory sibling peer, single printing, ready D without a window, asynchronous sink, unload timer cleanup and bounded session state. CLI guards and bilingual contracts are corrected and tested on copies; no live deployment.

## 1.1.51 — пределы памяти и времени root-сторожам, читающим дома агентов (A-N-1963 №11, Заря) · memory/time limits for root watchers reading agent homes

- Новые drop-in `systemd/<юнит>.service.d/70-predely.conf` (1):
  `session-writer-watch`: пик 74.9 МБ → MemoryMax=320M, MemorySwapMax=0
- Зачем: сторож от root читает файлы из домов агентов целиком; подменённый файл без пределов съедал память машины
  (MemoryMax=infinity) или вешал такт (нет таймаута). Предел памяти = max(128M, суточный пик×4); `MemorySwapMax=0` — без него
  сверх предела процесс уходит в своп и доживает (проба: 320M без MemorySwapMax — успех за 3,7 с вместо убийства).
  Время у Type=oneshot держит `TimeoutStartSec` (RuntimeMaxSec на oneshot не действует); добавлен только там, где его не было.
- Убит пределом → юнит failed (oom-kill / timeout); читатель — sadik-watch (is-failed по перечню storozha-sutochnye.txt).
- Монтаж: положить файлы, `systemctl daemon-reload`; перезапуск не нужен (oneshot по таймеру, следующий такт возьмёт пределы).
- New drop-ins cap memory (`MemoryMax`, `MemorySwapMax=0`) and, where missing, start time (`TimeoutStartSec`) of root watchers that read files from agent homes.
- Дом юнита (B-N-1968, A-N-1948 модуль №3): `systemd/session-writer-watch.service` (9bf2df81) и `systemd/session-writer-watch.timer` (bf4fc026) — побайтно с боя /etc/systemd/system на 10.10.2026; до того юнит и таймер жили только на машине. Drop-in `60-python-padenie-70.conf` дома в дереве по-прежнему не имеет. Зонтик dsh-pamyat переведён на 1.1.51.
- Unit home (B-N-1968): the session-writer-watch service and timer files are now in the package, byte-identical to production; the umbrella dsh-pamyat now pins 1.1.51.

## 1.1.50 — 2026-10-08 · стенд описания проверяет смысл, а не буквы (A-N-1871) · description stand checks meaning, not wording

`test/stend-opisaniya.mjs` (Аврора; ворота Вениамина). Раздел сторожа засчитывается под заголовком уровня 2–4, а сравнение имени — по смыслу, а не дословно: прежде искался только `## Сторож N…` буква в букву, и описание сторожа подразделом внутри общей формы README краснело. Граница: стенд проверяет, что раздел каждого сторожа есть и несёт обе обязательные колонки описания из кода, а не верность их текста. Число проб не менялось. Код пакета не менялся.

`test/stend-opisaniya.mjs`. A guard's section counts under a level 2–4 heading, and its name is compared by meaning rather than verbatim: before only an exact `## Сторож N…` was accepted, so a guard described as a subsection inside the common README form failed. Limit: the stand checks that each guard's section exists and carries both required description columns from the code, not that their text is accurate. The probe count is unchanged. Package code is unchanged.

## 1.1.49 — 2026-10-08 · строки владельцу короче (слово владельца 07.10 23:34/23:51, 08.10 00:08 МСК) · shorter owner lines

Номер выпуска — 1.1.49 (у автора — «1.1.49-tekst1»: по semver он МЛАДШЕ 1.1.49, замечание Вениамина 21:46Z; номер дала Искра при метке). Код тот же.

Владельцу в сток — одна короткая строка, полная остаётся в журнале (Аврора, наряд Забавы 08.10 00:26 МСК). Заполнение: «🟠 Заря: контекст 93% порога (742 тыс. из 800 тыс.)» (85 и 90 разом — одна строка старшей ступени, как прежде). Сжатие: «🗜 Заря: сжатие 742 → 27 тыс. · сводка 9 тыс. зн. · 20 с · deepseek-flash» — «до» на compaction/start, «после» — первый замер usage сессии после сжатия, нет за 10 мин (STOROZHA_ZHDAT_POSLE_MS) — «сжатие с 742 тыс.». Новая настройка `trevogaSzhatiya` (по умолчанию true): строка о завершённом сжатии владельцу; провал — всегда. Решения владельца (85% и судьба строки сжатия) — строки `stupeni` и `trevogaSzhatiya` в шаблонах реестра. Пороги и решающая логика не менялись. Новый стенд test/stend-tekstov-vladelcu.mjs; stend-poroga-i-hraneniya читает подробную строку из журнала (+1 проба на короткую в стоке).

Owner sink gets one short line, the full line stays in the log. New setting `trevogaSzhatiya` (default true). Thresholds and deciding logic unchanged.

## 1.1.48 — 2026-10-05 · герметичная проба proverka-opory по правилам B-N-1563 · hermetic proverka-opory probe for the B-N-1563 rules

Новый `test/stend-opory-1563.mjs` (A-N-1589, Аврора), код не менялся. Прежний стенд не различал правки B-N-1563/b/d: на приборе до них и после — один исход. Новый строит подставу с известным ответом (журналы сессий, сжатые внешним zstd в форме v4, файл уроков с заголовками в ограде и вне её, файл для sha256, SDK-журнал, настройка через `DSH_PAMYAT_STOROZHA_CONF`) и зовёт `bin/proverka-opory.mjs` подпроцессом. 17 проб: 12 различающих (хвост `#oknoN`, «сессия#N», только v4, v4 после перехода, урок ×2, файл+sha256 ×3, SDK ×2, строка покрытия) и 5 контрольных; счёт раздельный. Прибор 1.1.46 (до B-N-1563): различающих 0 из 12, контрольных 5 из 5. Здоровая и утраченная опора с одним исходом — слепота, код 2.

New `test/stend-opory-1563.mjs` (A-N-1589), code unchanged. The old harness could not tell the B-N-1563/b/d changes apart. The new one builds a known-answer stand-in and runs `bin/proverka-opory.mjs` as a subprocess: 17 probes, 12 distinguishing and 5 control, counted separately. The pre-B-N-1563 tool (1.1.46) scores 0 of 12 distinguishing, 5 of 5 control.

## 1.1.47 — 2026-10-05 · proverka-opory: перенос боевых правок B-N-1563/b/d · proverka-opory: production fixes B-N-1563/b/d ported

- `bin/proverka-opory.mjs` (B-N-1582) = боевая копия dorabotki/proverka-opory.mjs (473ae4e8) с путями из ключей настройки: журнал сессии v4 и форма источника «сессия#от-до#oknoN» (B-N-1563), строка покрытия «проверено N из M», код 1 не вечный при «не журнал сессии»/«битая форма» (B-N-1563b), три свидетеля вне журнала сессии — sha256 файла, файл уроков, SDK-журнал Claude (B-N-1563d). База, каталог сессий и ядро — ключи PAMYAT_BAZA, DSH_SESSII, PAMYAT_CORE, как в прежней пакетной версии; пустой ключ — СЛЕПОТА, код 2. Прежняя пакетная версия на живой базе давала «негодная форма» для записей #oknoN (302 на месте из 5537, код 1); новая — 5536 из 5537, код 0.
- `bin/proverka-opory.mjs` (B-N-1582) = the production dorabotki copy (473ae4e8) with paths from settings keys: session log v4 and the «session#from-to#oknoN» source form, the coverage line, code 1 no longer permanent, three witnesses outside the session log. Base, sessions and core come from PAMYAT_BAZA, DSH_SESSII, PAMYAT_CORE; an empty key is BLINDNESS, code 2.

## 1.1.46 — перенумерация (A-N-1562): прежний 0.1.0-alpha.46, код не менялся · renumbering, code unchanged

## 0.1.0-alpha.46 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · sostav-nabora: вердикт в обеих формах номера

- `sostav-nabora.mjs` (A-N-1562, перенумерация 0.1.0-alpha.N → 1.1.N): вердикт члена набора читается в формах «alpha.N», «aN», «0.1.0-alpha.N» и «1.1.N». Прежде полная форма «0.1.0-alpha.N» и новая «1.1.N» не читались — «вердикта нет» / прежний номер (живой пример: «dsh-pamyat-secretary 0.1.0-alpha.105 … принят Вениамином» читался как alpha.23). Новая форма — узко «1.1.N»: шире («X.Y.N») подхватило бы чужие номера (вендорская omega 1.5.19). Строка печати «принято №N» вместо «alpha.N». Номер N — последнее число в обеих формах, поэтому выбор «БЕРЁМ» против реестра npm не менялся.

## 0.1.0-alpha.45 — 2026-10-04 · метка проб omega-kopiya-watch

- Пять стендов omega-kopiya-watch передают DSH_PROBA=1 после env-i, сохраняя подставной OKW_ALERT. Пробная тревога не отправляется действующим agent-alert. Сохранена принятая защита alpha.44: нет sudo — СЛЕПОТА, код 2 в stend-pravki-postavki-omega.sh и stend-svodki-doveriya.sh.

## 0.1.0-alpha.44 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · стенды OMEGA без sudo — слепота · OMEGA stands without sudo — blindness

- `stend-pravki-postavki-omega.sh`, `stend-svodki-doveriya.sh`: до первого `sudo` — проверка `sudo -n true`; нет sudo (оболочка агента в bwrap с NoNewPrivs, нет прав) — «СЛЕПОТА: нет sudo (NoNewPrivs N)», код 2. Прежде в песочнице агента оба давали ложный красный, код 1 (образец — B-N-1541(1)).
- `stend-pravki-postavki-omega.sh`, `stend-svodki-doveriya.sh`: a `sudo -n true` check before the first `sudo`; no sudo (an agent shell in bwrap with NoNewPrivs, no rights) — "СЛЕПОТА: нет sudo (NoNewPrivs N)", exit 2. Before, both gave a false red, exit 1, in the agent sandbox (pattern — B-N-1541(1)).

## 0.1.0-alpha.43 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · метка пробы в proba-sleda-podyoma · probe mark in proba-sleda-podyoma

- `proba-sleda-podyoma`: каждый подъём пакета идёт с `DSH_PROBA=1` в окружении — метка пробы dsh-trevogi: `agent-alert` отвечает «проба, не отправлено», токен не читает, в журнале «исход=проба». Прежде пакеты поднимались с боевой настройкой из профиля, секретарь при подъёме звал живой канал, и прогоны пробы слали владельцу ЛОЖНЫЕ тревоги (6 за 04.10.2026).
- `proba-sleda-podyoma`: every package startup runs with `DSH_PROBA=1` in the environment — the dsh-trevogi probe mark: `agent-alert` answers "probe, not sent", does not read the token, logs "исход=проба". Before, packages started with production settings from the profile, the secretary called the live channel at startup, and probe runs sent FALSE alerts to the owner (6 on 04.10.2026).
- Из каталога кандидата убран `package-lock.json` (в архив он и прежде не входил).
- `package-lock.json` removed from the candidate directory (it never went into the archive).

## 0.1.0-alpha.42 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · « #» в значении настройки — отказ · " #" in a settings value is a refusal

- Разборщик файла настройки (bash `konf`, Python `_konf`, Node `konf`, все 14 копий): комментарий — только строка, начинающаяся с `#`. Значение, в котором есть « #» (пробел или таб перед `#`), — громкий отказ с названием ключа и файла. Прежде «KEY=знач # пояснение» отдавал «знач # пояснение» во всех трёх языках. `#` без пробела перед ним — часть значения, как прежде.
- Settings file parser (bash `konf`, Python `_konf`, Node `konf`, all 14 copies): a comment is only a line starting with `#`. A value containing " #" (a space or tab before `#`) is a loud refusal naming the key and the file. Before, "KEY=val # note" returned "val # note" in all three languages. `#` without a space before it is part of the value, as before.
- Коды отказа: Node — `2`; bash — функция возвращает `2` с текстом в stderr, зовущие выходят (`|| exit 2`), `rubezh-otnoshenij-watch` шлёт его в канал, как прочие слепоты; Python — `3`: юниты `omega-kopiya-watch` и `session-writer-watch` считают `1`/`2` и `1` успехом, отказ кодом `2` был бы немым.
- Refusal codes: Node — `2`; bash — the function returns `2` with the text on stderr, callers exit (`|| exit 2`), `rubezh-otnoshenij-watch` sends it to the channel like other blindnesses; Python — `3`: the `omega-kopiya-watch` and `session-writer-watch` units count `1`/`2` and `1` as success, a refusal with code `2` would be silent.
- `stend-nastrojki.sh`, раздел Г: отказ у разборщика каждого языка, «#» без пробела, семь модулей целиком (ключ и код), канал `rubezh`. 34 пробы вместо 21.
- `stend-nastrojki.sh`, section D: refusal in each language's parser, "#" without a space, seven whole modules (key and code), the `rubezh` channel. 34 probes instead of 21.

## 0.1.0-alpha.41 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · сведение двух веток, проба следа подъёма от ядра · two branches merged, start-up trace probe from the core

- Сведение: поверх `alpha.38` шли две ветки под одним номером `alpha.39` — правки опоры и стенда OMEGA (ниже, `alpha.39`) и параллельная ветка «перевод комментариев» + «слепота настройки говорит в канал», сданная как `alpha.39`/`alpha.40`. Эта редакция стоит на первой и несёт пункты второй (перечислены ниже); номер `alpha.40` в выпуске не используется.
- Merge: two branches went on top of `alpha.38` under the same number `alpha.39` — the anchor and OMEGA stand fixes (below, `alpha.39`) and a parallel branch "comment translation" + "settings blindness speaks to the channel", handed in as `alpha.39`/`alpha.40`. This edition stands on the first and carries the items of the second (listed below); the number `alpha.40` is not used in the release.
- `proba-sleda-podyoma`: корень пакетов и cordis выводятся из ключа `PAMYAT_CORE` (пакеты — рядом с ядром, cordis — тот, что разрешает ядро); ключи `SLED_KOREN` и `SLED_CORDIS` сняты. Прежде они указывали на снятый каталог плагинов, и проба не находила ни одного пакета. Довод командной строки по-прежнему заменяет корень.
- `proba-sleda-podyoma`: the package root and cordis are derived from the `PAMYAT_CORE` key (packages next to the core, cordis is the one the core resolves); the `SLED_KOREN` and `SLED_CORDIS` keys are removed. Before, they pointed at a removed plugins directory, and the probe found no package. A command-line argument still replaces the root.
- `proba-sleda-podyoma`: теги `!!js` в профиле платформы читаются строкой, а не роняют разбор; любой сбой разбора профиля — СЛЕПОТА с причиной, код `2`. Прежде `yaml.safe_load` падал на `!!js` трассировкой, и проба выходила кодом `1` — тем же, что «кто-то молчит».
- `proba-sleda-podyoma`: `!!js` tags in the platform profile are read as strings instead of breaking the parse; any profile parse failure is BLINDNESS with the cause, code `2`. Before, `yaml.safe_load` died on `!!js` with a stack trace, and the probe exited with code `1` — the same as "someone is silent".
- `stend-nastrojki.sh`: проба отказа `proba-sleda-podyoma` ждёт ключ `PAMYAT_CORE`.
- `stend-nastrojki.sh`: the `proba-sleda-podyoma` refusal probe expects the `PAMYAT_CORE` key.
- `omega-kopiya-watch`: не задан `OKW_STATE` — тревога в канал (`OKW_ALERT`) с причиной и код `3` вместо немого кода `2` (коды 1 и 2 юнит считает успехом). Тревога повторяется каждый такт до исправления: памяти отданного без файла состояния нет.
- `omega-kopiya-watch`: no `OKW_STATE` — an alarm to the channel (`OKW_ALERT`) with the cause and code `3` instead of a silent code `2` (the unit counts codes 1 and 2 as success). The alarm repeats every cycle until fixed: without the state file there is no memory of what was sent.
- `session-agent-preset-watch --watch`: не задан реестр — тревога в канал один раз на текст (подпись в `last.json`), код `2`; без `--watch` — как прежде, только строка.
- `session-agent-preset-watch --watch`: no registry — an alarm to the channel once per text (signature in `last.json`), code `2`; without `--watch` — as before, a line only.
- Причина в тексте у обоих: файла настройки нет / есть, но не читается (с ошибкой) / читается, ключа нет. Общий разборщик `_konf` не менялся (его копии сверяет `stend-nastrojki.sh`).
- The cause in the text for both: no settings file / it exists but is unreadable (with the error) / readable, no key. The shared `_konf` parser is unchanged (`stend-nastrojki.sh` compares its copies).
- Новый стенд `stend-slepoty-nastrojki.sh` (9 проб, канал подменяется переменной модуля); `stend-nastrojki.sh` ждёт от `omega-kopiya-watch` код `3`.
- New stand `stend-slepoty-nastrojki.sh` (9 probes, the channel is substituted by the module's variable); `stend-nastrojki.sh` expects code `3` from `omega-kopiya-watch`.
- Комментарии 14 программ `bin/` и пяти стендов, приехавших с ними (`stend-proverki-opory.mjs`, три стенда OMEGA, `stend-nastrojki.sh`), дополнены английским: строки `EN:` стоят сразу за русским блоком, русский текст не тронут (якоря стендов целы). Русские docstring Python — код, их текст не менялся; английский — комментарием сразу после них. Код по токенам равен прежнему в 19 файлах из 19.
- Comments of the 14 `bin/` programs and of the five stands that came with them (`stend-proverki-opory.mjs`, three OMEGA stands, `stend-nastrojki.sh`) are extended with English: `EN:` lines follow each Russian block right away, the Russian text is untouched (stand anchors intact). Russian Python docstrings are code and their text is unchanged; the English follows them as a comment. The code is token-equal to the previous edition in 19 files of 19.

## 0.1.0-alpha.39 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · живая запись проверки опоры, версия OMEGA в стенде правок · live anchor-check write, OMEGA version in the patch test

- `proverka-opory --zapisat` берёт ядро из ключа `PAMYAT_CORE` — того же, что у стенда и соседних модулей; отдельный ключ `OPORA_CORE` снят. Прежде два ключа под один предмет разошлись: в файле монтажа `OPORA_CORE` указывал на снятое ядро, ветка записи падала на импорте, а стенд, подававший ядро через `PAMYAT_CORE`, был зелёным. Нет файла ядра — СЛЕПОТА с путём, код 2, вместо трассировки импорта.
- `proverka-opory --zapisat` takes the core from the `PAMYAT_CORE` key — the same one the test and sibling modules use; the separate `OPORA_CORE` key is removed. Before, two keys for one subject drifted apart: in the deployment file `OPORA_CORE` pointed at a removed core, the write branch died on import, and the test, which passed the core through `PAMYAT_CORE`, stayed green. A missing core file is a BLINDNESS naming the path, code 2, instead of an import stack trace.
- `stend-proverki-opory.mjs`: две новые пробы — при живом ядре `--zapisat` кладёт отметку «опора есть» (подставной журнал сессии, `zstd`), и без ядра — названная слепота с нетронутой базой. Прежние пробы проверяли только, что лишнее не легло, и были зелёными на мёртвой ветке. 7 проб вместо 5.
- `stend-proverki-opory.mjs`: two new probes — with a live core `--zapisat` stores an "anchor present" mark (a stub session journal, `zstd`), and without a core — a named blindness with the database untouched. The earlier probes only checked that nothing extra was written and stayed green on a dead branch. 7 probes instead of 5.
- `stend-pravki-postavki-omega.sh`: версия поставки берётся с живой поставки (`omega_memory-*.dist-info`), а не числом в стенде; порча Б меняет её на `0.0.0-stend`. Зашитая 1.5.13 после обновления OMEGA до 1.5.19 давала «СВЕРИТЬ ПРАВКУ» на исправном стороже в каждом такте (24 расхождения из 27). Пункты перечня по-прежнему подаются переменными `STEND_PUNKT_*`.
- `stend-pravki-postavki-omega.sh`: the distribution version comes from the live install (`omega_memory-*.dist-info`), not a number in the test; corruption B changes it to `0.0.0-stend`. The hard-coded 1.5.13, after OMEGA moved to 1.5.19, produced "СВЕРИТЬ ПРАВКУ" on a healthy watch in every step (24 mismatches of 27). List items are still passed via `STEND_PUNKT_*` variables.

## 0.1.0-alpha.38 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · разборщик настройки bash · bash settings parser

- Разборщик файла настройки в bash (`rubezh-otnoshenij-watch`, `stendy-vseh-paketov.sh`) теперь обрезает пробелы в конце значения, как Python и Node; прежде `KEY=v  ` давало в bash `v  `. В бою не влияет: в файле монтажа хвостовых пробелов нет.
- The bash settings parser (`rubezh-otnoshenij-watch`, `stendy-vseh-paketov.sh`) now trims trailing spaces of a value, like Python and Node; before, `KEY=v  ` gave `v  ` in bash. No runtime effect: the deployment file has no trailing spaces.
- `stend-nastrojki.sh`: строка фикстуры с хвостовыми пробелами и табом пишется `printf` (редактор срезал хвост — проба пробелов была слепа); добавлен контроль внесения — фикстура обязана нести хвост.
- `stend-nastrojki.sh`: the fixture line with trailing spaces and a tab is written by `printf` (an editor had stripped the tail — the whitespace probe was blind); an insertion check is added — the fixture must carry the tail.

## 0.1.0-alpha.37 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · приборы и сторожа памяти в bin/ · memory tools and watchers in bin/

- В пакет перенесены 14 программ обслуживания памяти (`bin/`), код — боевой с машины: сверка с источником, проверка опоры и цепи, проба следа подъёма, состав набора, возврат повтора, читатель отклонённых, сторожа рубежа отношений, заголовков сессий, писателя сессии, расщепления отмены и копирования в OMEGA, приёмка сжатия, прогон стендов всех пакетов. Плагин `src/` не изменён.
- 14 memory maintenance programs moved into the package (`bin/`), code taken live from the machine: source check, anchor and chain checks, start-up trace probe, set composition, repeat return, rejected-summary reader, watchers for the relations boundary, session headers, the session writer, the supersede split and copying into OMEGA, compaction acceptance, a run of all package stands. The `src/` plugin is unchanged.
- Частные значения вынесены в файл настройки `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf` (23 ключа, путь меняет `DSH_PAMYAT_STOROZHA_CONF`); порядок — переменная → файл → нейтральное умолчание, нет ничего — СЛЕПОТА, код 2. Имя узла в текстах тревог берётся из `os.uname().nodename`. Номера задач и имена убраны из комментариев и строк.
- Private values moved into the settings file `/etc/dsh-pamyat-storozha/dsh-pamyat-storozha.conf` (23 keys, `DSH_PAMYAT_STOROZHA_CONF` changes the path); order — variable → file → neutral default, nothing — BLINDNESS, code 2. The node name in alarm texts comes from `os.uname().nodename`. Task ids and names removed from comments and strings.
- Строка журнала признака 7 `omega-kopiya-watch`: «модель эмбеддинга OMEGA (признак 7)» вместо номера задачи; якорь стенда `stend-modeli-omega.sh` переведён вместе с ней.
- Sign 7 log line of `omega-kopiya-watch`: "модель эмбеддинга OMEGA (признак 7)" instead of a task id; the `stend-modeli-omega.sh` anchor moved with it.
- Стенды модулей едут с ними: `stend-proverki-opory.mjs` (ядро — `STEND_CORE` или ключ `PAMYAT_CORE`), три стенда OMEGA (`.sh`), новый `stend-nastrojki.sh` — разборщик настройки на трёх языках и отказ с кодом 2 при пустой настройке.
- Module stands ship with them: `stend-proverki-opory.mjs` (core — `STEND_CORE` or the `PAMYAT_CORE` key), three OMEGA stands (`.sh`), a new `stend-nastrojki.sh` — the settings parser in three languages and the code-2 refusal on empty settings.
- package.json: `bin` и `LICENSE` в files, автор, лицензия MIT; файл LICENSE. Команды в `PATH` не регистрируются.
- package.json: `bin` and `LICENSE` in files, author, MIT license; LICENSE file. No commands are registered in `PATH`.

## 0.1.0-alpha.36 — 2026-10-04 (кандидат исполнителя; внешняя приёмка впереди) · документация и обезличивание строк кода · documentation and anonymised code strings

- Из строк кода убраны номера внутренних задач (4 места). Боевое: строка подъёма в журнале теперь «ОТ ПОРОГА СЖАТИЯ (доля — на каждом замере; сейчас …)» — без ссылки на номер правила; логика не менялась (цепочки лексем совпадают, кроме этих строк). Стенды: текст ошибки обёртки в stend-odinochnogo-montazha, имя пробы totalTokens в stend-vidov, итоговая строка stend-primenimosti-prune — теперь «итог: N из 6» вместо «<номер задачи>: N/6».
- Internal task ids removed from code strings (4 places). Runtime: the start-up log line now reads "ОТ ПОРОГА СЖАТИЯ (доля — на каждом замере; сейчас …)" without a rule id; logic unchanged (token streams match except these strings). Stands: the wrapper error text in stend-odinochnogo-montazha, the totalTokens probe name in stend-vidov, and the final line of stend-primenimosti-prune — now "итог: N из 6" instead of "<task id>: N/6".
- Добавлены docs/ (ARCHITECTURE, SETTINGS, GUARDS, TROUBLESHOOTING); README переписан по разделам стандарта документации. Всё на двух языках: назначение, место в системе, схемы, каждая настройка и переменная окружения, формат файлов, сторожа и стенды, частые поломки. Три раздела сторожей сохранили заголовки дословно (их сверяет stend-opisaniya), английский заголовок — строкой ниже.
- Added docs/ (ARCHITECTURE, SETTINGS, GUARDS, TROUBLESHOOTING); the README is rewritten to the documentation standard outline. Everything in two languages: purpose, place in the system, diagrams, every setting and environment variable, file formats, guards and stands, common failures. The three guard sections keep their headings verbatim (stend-opisaniya checks them), with the English heading on the line below.
- Комментарии в src/index.js, src/vidy-szhatiya.js и всех test/stend-*.mjs переписаны и дополнены на двух языках (RU/EN) и обезличены; устаревшие комментарии (умолчание komandaStoka, правило доли порога, граница печати сводки, подпись над dolyaPoroga) приведены к нынешнему коду. Код не изменён: цепочка лексем без комментариев совпадает с прежней во всех 11 файлах.
- Comments in src/index.js, src/vidy-szhatiya.js and all test/stend-*.mjs rewritten and extended in two languages (RU/EN) and anonymised; outdated comments (the komandaStoka default, the threshold ratio rule, the summary printing boundary, the doc comment above dolyaPoroga) brought in line with the current code. Code unchanged: the comment-free token stream matches the previous one in all 11 files.
- package.json: двуязычные description и keywords; в files добавлен docs/.
- package.json: bilingual description and keywords; docs/ added to files.
- Прежние записи этого файла обезличены: имена агентов и людей, реальные пути и номера внутренних задач заменены ролями («координатор», «приёмщик», «исполнитель», «сопровождающий пакета», «агент-2») и обозначениями. Смысл, числа и даты сохранены.
- Earlier entries of this file are anonymised: agent and person names, real paths and internal task ids are replaced with roles (coordinator, reviewer, implementer, package maintainer, agent-2) and placeholders. Meaning, numbers and dates are kept.

## 0.1.0-alpha.35 — 2026-10-02 (кандидат исполнителя; внешняя приёмка впереди)

Прежние разговоры после committed /new названы отдельно в охвате; МОЛЧИТ к ним не применяется. Читатель persistent channel service.

## 0.1.0-alpha.34 — 2026-10-01

- `test/stend-opoveshcheniya.mjs`: до импорта предмета задаёт собственное пробное имя, временные пути D/отказов/успехов; не наследует DSH_HOME и STOROZHA_STUPENI_FAJL. Боевые пороги и состояние ступеней больше не меняют исход стенда. Временный каталог удаляется при выходе.
- Runtime-код не менялся. Изоляция относится к этому стенду, не ко всему набору тестов. Список `files` прежний: изменённый стенд уже входит через `test`.
- Выпуск (сопровождающий пакета): снимает исключение `stend-opoveshcheniya` для a33 в перечне исключений ночного обхода стендов (запись 8fdbeee7, срок 2026-10-04T09:00:00Z) — с a34 стенд обязан быть зелёным в ночном обходе.

## 0.1.0-alpha.33 — 2026-10-01 (переход на готовый порог D, шаги Ш3+Ш2 — код исполнителя, кандидат 6817e81 r2, принят приёмщиком 01.10; номер и выпуск — сопровождающий пакета; монтаж одним окном с kompakt a36, реестром и D)

- `src/index.js`: доля и порог — из готового блока `porogi` в D через `chitatPorogD` (`dsh-pamyat-kompakt/porogi.mjs`); свой разбор пресета A снят. Пара provider/model — из requestHeader/requestContext при наличии, иначе подписанный defaultRoute D.
- `package.json`: `"dsh-pamyat-kompakt": "file:../dsh-pamyat-kompakt"` — в `devDependencies`, как у kompakt-dsh (выпуск, сопровождающий пакета: в `dependencies` у кандидата исполнителя общий `npm ci` падал «Cannot read properties of null (reading 'name')» на ссылке внутри node_modules/dsh-pamyat-storozha). В рантайме `porogi.mjs` берётся через общий `node_modules/dsh-pamyat-kompakt`. `test/stend-poroga-i-hraneniya.mjs` переведён на D.
- kompakt — РАНТАЙМ-зависимость (import porogi.mjs), объявлена devDependency; держится общим каталогом плагинов, как у kompakt-dsh (замечание приёмщика).
- НЕ ДЕЛАЕТ / ГРАНИЦА: номинальный порог, не effective; негодный D — названный отказ без чисел (A не подставляется).
- ⚠️ Без kompakt a36 (нет `porogi.mjs`) импорт падает: ставить строго не раньше kompakt a36.

## 0.1.0-alpha.32 — 2026-09-30 (переход на готовый порог, шаг Ш4 — снятие пути раскладки 0.1, слово владельца 30.09 03:28 МСК; код и стенд — исполнитель, номер и вливание — сопровождающий пакета; принято приёмщиком)

- `src/index.js` `dolyaPoroga()`: путь 0.1 снят тем же правилом, что kompakt a34: лежащий `.agent-presets` (каталог или файл) — названный отказ «раскладка 0.1 не поддерживается»; ENOENT — доля из вложенного пресета; иная ошибка — «не проверен». Импорт `readdirSync` → `lstatSync`.
- `test/stend-poroga-i-hraneniya.mjs`: подставы 0.1 → вложенный пресет; проба 13 — подложенный `.agent-presets` → отказ.
- ⚠️ Односторонне: откат на 0.1 требует вернуть a31 (`src/index.js` e479aa8a).
- Поле totalTokens (исполнитель; одним выпуском с Ш4 по условию приёмщика): `src/vidy-szhatiya.js` 53a7e935 → 599a2eda — `totalTokens` в перечне объявленных полей usage (dsh-llm 0.2 TokenUsage объявляет его: итог вызова вход+кэш+выход); слагаемым давления и расхода НЕ берётся — удвоил бы вход. Прежде у агента-2 (агент на родной платформе) на 0.2: «⚠️ в usage поля, не объявленные платформой: totalTokens». `test/stend-vidov.mjs` 58c5ec08 → da70cfb8 — проба на числах живого хода deepseek-v4-pro (11615 + 9472 + 21 = 21108 = totalTokens): не «незнакомое», давление 21087, расход 21108.

## 0.1.0-alpha.31 — 2026-09-29 (окно перехода на DSH 0.2, находка 11 репетиции — исполнитель; номер и вливание — сопровождающий пакета; принято приёмщиком 30.09)

- `src/index.js` `dolyaPoroga()`: на DSH 0.2 каталога `.agent-presets` нет (ENOENT) — доля из вложенного пресета профиля A (ровно один блок preset-<имя>, `thresholdRatio` ровно раз, (0,1)); иная ошибка чтения — названный отказ. Окно профиля сторож не читает (берёт у платформы `session.requestContext`) — правило окна 11б его не касается.

## 0.1.0-alpha.30 — 2026-09-26 (обёртка проб и доля из пресета — исполнитель; КОД: доля только из пресета)

- `src/index.js` `dolyaPoroga()` (решение координатора): доля порога — ТОЛЬКО из пресета, правилом `porogIzPreseta`
  (dsh-pamyat-kompakt, шаг Ш2): ровно один пресет, `thresholdRatio` в нём ровно раз (строка может нести «# …»), доля в (0,1).
  Строку профиля A больше не требует и не читает — для платформы она мертва. Своя реализация, не импорт: у kompakt/index.mjs
  побочное действие на загрузке, а окно сторожу даёт платформа на каждом замере. Стенд `stend-poroga-i-hraneniya`: проба
  «профиль ≠ пресет ⇒ от окна» заменена тремя — профиль без строки / с другой долей ⇒ порог из пресета; пресет без строки ⇒
  от окна с причиной (10 → 12 проб).

- `test/stend-odinochnogo-montazha.mjs`: обёртка пробы судит ВОЗВРАТ тела (исполнитель): вернуло не `undefined` и не `true` → провал «тело пробы ВЕРНУЛО «…»».
  Было: `try { f(); console.log(✅) } catch { bed++ }` — проба, вернувшая отказ (`false`/`{ok:false}`) без исключения, считалась пройденной (замер 26.09: подставная `() => false`
  засчитана ✅; настоящих тел с возвратом 0 — ловушка спящая). Образец — как в 37 стендах пакетов.

## 0.1.0-alpha.29 — 2026-09-26 (снятие ключа стража при выгрузке; исполнитель по находке сопровождающего)

Страж одиночного монтажа снимал ключ на ctx.on('dispose') — события, которого в cordis 4.0.1 нет (_unload зовёт только
_disposables волокна). Следствие: после выгрузки волокна в том же процессе повторный монтаж шёл в «второй монтаж пропущен»,
живых сторожей 0 (опыт на настоящем cordis). В бою 26.09 не проявлялось: три apply на одну ссылку идут БЕЗ выгрузки первого
(его тревоги заполнения и сводки после подъёма есть у трёх агентов). Лечение: снятие ключа — ctx.effect(() => очистка).
«Вернуть функцию из apply» не годится: apply объявлен function, cordis зовёт его через new и возвращённое выбрасывает.
Новый стенд test/stend-vygruzki.mjs (6 проб, НАСТОЯЩИЙ cordis из devDependencies): посылки о платформе (нет 'dispose';
effect зовётся; функция из apply-конструктора — нет), apply ×3 с выгрузкой между → живой один, apply ×3 без выгрузки →
живой один и двое пропущены, после выгрузки ключ снят. stend-opoveshcheniya.mjs: подставной ctx больше не шлёт 'dispose'
(стерёг выдуманное событие), очистку берёт из effect.

## 0.1.0-alpha.28 — 2026-09-25 (уборка временного в stend-poroga-i-hraneniya; код не менялся)

- уборка временного в stend-poroga-i-hraneniya; код не менялся

## 0.1.0-alpha.27 — 2026-09-25

Ступени от порога сжатия, исполнитель (слово владельца 25.09 11:37 МСК, решение координатора — вариант B). Сторож 2 — ступени ОТ ПОРОГА СЖАТИЯ, не от окна:
доля — правило «доля из пресета» (один пресет, thresholdRatio профиль = пресет, в (0,1)) на КАЖДОМ замере; не прочитана — от окна с пометкой
в тексте. Текст в единицах владельца, как у dsh-compact-watch: «🟡 ЗАПОЛНЕНИЕ 93,0% порога 890 000 (82,8% окна; по ответу модели) —
перешагнул 85% (756 500)», 🟠 на 90%. Отданные ступени — на диске по сессиям ($DSH_HOME/storages/storozha-stupeni.json, временный+rename),
сброс на compaction/summary|prune своей сессии; запасной сброс — доля ниже отданной ступени на 0,10. Граница: между правкой пресета и
подъёмом — порог, который вот-вот начнёт действовать. Новый стенд test/stend-poroga-i-hraneniya.mjs (10/10, каждый сценарий — свой
процесс); stend-opoveshcheniya.mjs — 5 проверок переведены на новый формат строки (поведение прежнее).

## 0.1.0-alpha.26 — 2026-09-23

Применимость обрезки, исполнитель: сводка различает исполнитель инструментов из настройки ispolnenieInstrumentov: sdk → «обрезка: неприменимо (инструменты в SDK)», dsh → прежний счёт, неизвестный/отсутствующий → «не установлено». Объяснение нуля только для dsh. Счёт событий и канал не изменены. Добавлен стенд четырёх режимов и неизвестного значения; npm test подхватывает его glob. Восстановлена запись a24 по коммиту 36db438.

## 0.1.0-alpha.25 — 2026-09-23

Исполнитель. README различает строку завершения и сводку незавершённых сжатий (a14/a15), называет потерю счёта при гибели процесса. Код не менялся.

## 0.1.0-alpha.24 — 2026-09-22

Восстановлено по истории 36db438 (сопровождающий пакета, 22.09): объяснение нуля compaction/prune ограничено наблюдаемым; при нуле сжатий явно сказано, что наблюдать было нечего. Снято неверное утверждение об отсутствии подключённого pruner. Это запись прежнего изменения, не новый код a26.

## 0.1.0-alpha.23 — отрицание называет ИСТОЧНИК, в котором искали

ЗАЧЕМ. 14.09.2026, бой: об ОДНОМ сжатии в журнале стояли две строки, утверждающие
противоположное.
    [kompakt-nash 0.1.0-alpha.11] расход, ТОКЕНЫ (из ответа провайдера): всего 33801
    [dsh-pamyat-storozha 0.1.0-alpha.22] ... расход НЕ СООБЩЁН (это не ноль)
ОБА ПРИБОРА ЧЕСТНЫ, и это главное: сторож читает usage СОБЫТИЯ ПЛАТФОРМЫ (src/index.js:308
-> vidy-szhatiya.js:91-95), kompakt берёт usage ИЗ ОТВЕТА ПРОВАЙДЕРА, и в событие тот не
попадает. Величина, ИЗМЕРЕННАЯ одним, объявлена НЕИЗМЕРЕННОЙ другим.

ЧЕМ ЭТО ХУЖЕ ПРОСТОГО РАСХОЖДЕНИЯ. kompakt источник НАЗЫВАЕТ, сторож — нет. Наш класс
«число без способа» здесь в зеркальном виде, для ОТРИЦАНИЯ: положительное число без области
заставляет спросить «откуда», отрицание без области вопроса НЕ вызывает вовсе — оно выглядит
закрытым ответом и ГАСИТ поиск. В том журнале искомая величина лежала ТРЕМЯ СТРОКАМИ ВЫШЕ.

ЧТО СДЕЛАНО. Две строки названы полностью, поведение и код возврата не тронуты:
    тревога: «расход НЕ СООБЩЁН В СОБЫТИИ ПЛАТФОРМЫ (поле usage; это не ноль)
              — расход своего вызова печатает сам kompakt»
    сводка:  «без расхода в событии платформы N (не сообщён != ноль; у kompakt своя строка)»
Назван не только ИСТОЧНИК, где искали, но и АДРЕС, по которому величина есть: без второго
поиск гаснет так же, просто на шаг позже.

ОСНОВАНИЕ ПРАВКИ: постоянная санкция владельца 06.09.2026 — улучшать сообщение сработавшего
сторожа сразу, чтобы оно было честнее и правдивее. Отдельного поручения не требовалось.

ПРОБЫ (test/stend-istochnika-rashoda.mjs, 5 из 5): судят ПОВЕДЕНИЕ — событие подаётся
настоящему apply(), текст берётся из перехваченного logger, а не читается из исходника.
Три исхода, каждая порча вносится с контролем числа замен:
    целое                                 5 из 5, код 0
    порча строки тревоги (вернуть голое)  3 из 5, код 1
    порча строки сводки                   4 из 5, код 1
    снятие порч                           5 из 5, сумма файла вернулась
Весь набор пакета после правки: 6 стендов, красных 0.

ДВЕ ОШИБКИ СТЕНДА, ПОЙМАННЫЕ ПОРЧЕЙ, А НЕ ЧТЕНИЕМ — обе оставлены в комментариях стенда:
 1. первая редакция давала всем прогонам ОДИН config.agent, и страж одиночного монтажа молча
    пропускал второй apply: проба мерила тишину стража, а не строку тревоги (1 из 5 при
    верном коде). Лечение: свой agent на каждый прогон;
 2. две пробы искали слово по ВСЕМУ выводу и оставались зелёными при порче, потому что то же
    слово стоит в строке СВОДКИ. Проба, зелёная при обоих исходах, не стережёт ничего.
    Лечение: искать в строке ТРЕВОГИ.

ГРАНИЦА: правка про СТРОКУ, а не про величину. Верен ли расход, который печатает kompakt, —
другой вопрос; числа взяты у провайдера как есть, и ни один прибор их не сверяет.

## 0.1.0-alpha.22 — печать журнальных строк сведена в одну точку (лечим класс, а не экземпляр)

ЗАЧЕМ. 06.09.2026 замером установили: строка без номера версии выпадает из чужого разбора
по образцу «[имя версия]», и пустая клетка читается как «пакета нет». Тогда вылечили
ЭКЗЕМПЛЯР — переписали все существовавшие вызовы. 12.09 замер боем (журнал службы одного из агентов,
04:08:30Z) показал рецидив: строка «второй монтаж пропущен», добавленная позже в a16,
родилась БЕЗ версии заново — в двадцати строках под собственным предупреждением в шапке
того же файла. Строк пакета без версии: 1 из 1.

⇒ Вывод, который и правится этим выпуском: правило «каждая строка называет версию»
держится, только если печать идёт через ОДНУ функцию. Пока вызовы рассыпаны, каждый новый
рождается дефектным заново — и комментарий этому не мешает. Предупреждение в тексте не
удерживает руку того, кто правит предмет.

ЧТО СДЕЛАНО
  · заведена pechat(ctx, s) на уровне модуля — имя и версию приставляет она;
  · ветка пропуска зовёт её вместо собственного литерала без номера;
  · krik() внутри apply стал алиасом к ней — все 6 прежних вызовов не тронуты.
  Мест печати в пакете было 2, стало 1. Мимо неё в журнал не пишет никто.

ЧТО ПРИ ЭТОМ ИЗМЕНИЛОСЬ СВЕРХ СТРОКИ, НАЗЫВАЮ САМА. Две ветки были РАЗНОЙ СТОЙКОСТИ: у
пропуска двойной catch, у подъёма ни одного. Сведя их в одну, пришлось выбрать одну, и
выбрана стойкая — монтаж сторожа важнее строки о монтаже. Значит строка подъёма теперь не
уронит apply при сломанном логгере. Цена названа в коде: сломанный логгер даёт ТИШИНУ, а
тишина у нас неотличима от «не звали».

ГРАНИЦА: это лечение ОДНОГО пакета. Соседние печатают своими руками, общего правила для
фермы тут нет.

ПРОВЕРЕНО (стенд одиночного монтажа, 8 проб, было 6)
  ЭКЗЕМПЛЯР: строка пропуска называет имя и версию.
  КЛАСС:     ВСЕ строки монтажа идут по образцу, знаменатель печатается.
  ПОРЧА 1 (вернуть литерал без версии) → 5 из 8.
  🔴 ПОРЧА 2, ГЛАВНАЯ (добавить НОВУЮ строку мимо pechat — ту, которой ещё не писали)
     → 7 из 8. То есть проба ловит ИМЕННО рецидив, а не только вылеченный экземпляр.
     Без неё выпуск стерёг бы прошлую беду и пропустил следующую — как 06.09.
  Снятие обеих порч → 8 из 8. Набор пакета: 5 приборов, 80 проб, красных 0.

НЕ ЗАКРЫТО ЭТИМ ВЫПУСКОМ: a15 (сводка по такту) и a18 (три исхода стока) остаются
открытыми признаками — их нельзя закрыть без срабатывания, порчей боевого набора.

## 0.1.0-alpha.21 — строка пропуска перестала молчать (и комментарий перестал обещать лишнее)

- ЗАМЕР БОЕМ на a20: подъёмов сторожа стало ОДИН вместо трёх — страж отсёк два вызова apply.
  А строк «второй монтаж пропущен» НОЛЬ, хотя признак закрытия требовал две.
- ПРИЧИНА не в механизме, а в двух соседних строках этого файла: строка пропуска шла через
  `ctx.logger?.info?.(…)` БЕЗ фоллбэка, а строка подъёма ниже — с фоллбэком (`?? console.log`).
  У второго и третьего ctx логгера нет: `?.` даёт undefined, исключения не возникает, `catch`
  не срабатывает, строка не печатается НИКУДА и молча.
- 🔴 КОММЕНТАРИЙ НАД НЕЙ ГОВОРИЛ «Говорим вслух: молчаливый пропуск неотличим от „пакет не
  смонтирован"» — а пропуск и БЫЛ молчаливым. Код обещал ровно то, чего не делал. Правится
  тем же выпуском: оставь его — следующий поверит комментарию, как мы верили зелёному стенду.
- 🔴 И ЭТА СТРОКА — РАЗЛИЧИТЕЛЬ ДВУХ ГИПОТЕЗ, неразличимых по журналу до неё:
  (а) apply позван трижды, два отсечены стражем → после подъёма на a21 строк «пропущен» ДВЕ;
  (б) apply позван однажды, страж ни при чём → строк «пропущен» НОЛЬ.
  Счёт подъёмов 3→1 согласуется с ОБЕИМИ. Значит «страж работает» на a20 — вывод, а не замер,
  и a21 его либо подтвердит, либо снимет.
- Проба держит ПУТЬ НАРУЖУ, а не наличие логгера: ctx БЕЗ логгера, console.log перехвачен,
  строка обязана быть поймана. Порча (снять фоллбэк) роняет ровно её: 5 из 6. Снятие → 6 из 6.
- 📌 Урок приёмки, названный приёмщиком против себя: признак «появится строка» НЕ МОГ сработать
  даже при исправном механизме — сработай он, доказал бы наличие логгера, а не работу стража.
  Годным оказался счёт подъёмов: он мерит СЛЕДСТВИЕ, а не сообщение о работе.
- Набор пакета: 5 приборов, 78 проб, красных 0, слепых 0 (по кодам возврата).

## 0.1.0-alpha.20 — страж одиночного монтажа заработал впервые (ключ был взят неверно)

- БЫЛО: страж ключевал по самому `ctx` (`WeakSet`), с доводом «повторный монтаж в одном
  процессе даёт тот же объект». Довод неверен. Замер боем 12.09.2026, подъём 03:33:59
  (pid 1037952): ТРИ строки подъёма, агент один и тот же, ступени те же — значит платформа
  даёт КАЖДОМУ монтажу СВОЙ `ctx` внутри ОДНОГО процесса.
- ⇒ `smontirovano.has(ctx)` было ложно ВСЕГДА, строк «второй монтаж пропущен» в бою НОЛЬ,
  и подъём на a14 давал ровно те же три голоса, что подъём на a19. Механизм числился
  работающим с 09.09 и не работал ни разу.
- СТАЛО: ключ — ИМЯ АГЕНТА из набора. Оно одинаково у всех ссылок одного профиля и живёт
  там же, где модуль, а не в переданном объекте.
- 🔴 КЛЮЧ СНИМАЕТСЯ ПРИ `dispose`. Ключ по имени живёт до конца процесса, а прежний
  ctx-ключ умирал вместе с ctx. Без снятия переподнятие плагина в том же процессе было бы
  МОЛЧА пропущено и сторож не встал бы вовсе — защита произвела бы ровно тот вред, от
  которого бережёт.
- ⚠️ ЦЕНА КЛЮЧА, названа вслух и в коде: два БЕЗЫМЯННЫХ агента в одном процессе схлопнутся
  в один. У нас имя задано («агент <agent>» в строке подъёма), но если однажды не будет —
  вот место, где это проявится.
- ГРАНИЦА ВЫШЕ ПРАВИТСЯ ТЕМ ЖЕ ВЫПУСКОМ: комментарий говорил «не спасает от двух РАЗНЫХ
  процессов», а беда была в ОДНОМ. Ошибка в тексте пережила бы ошибку в коде.
- 🔴 СТЕНД ПЕРЕПИСАН, И ЭТО ГЛАВНОЕ. Прежний звал `apply` дважды С ОДНИМ И ТЕМ ЖЕ `ctx` —
  то есть воспроизводил не боевой способ вызова, а наше представление о нём, и покраснеть
  не мог НИ ПРИ КАКОМ дефекте этого рода. Его последняя проба прямо ТРЕБОВАЛА, чтобы разные
  `ctx` не глушили друг друга, то есть стерегла чинимый дефект. Снята намеренно.
- Признак годности стенда снят порчей: новый стенд на ПРЕЖНЕМ ключе даёт 2 из 5.
  Порча нового ключа (уникальное значение при каждом вызове) — тоже 2 из 5. Снятие любой
  порчи возвращает 5 из 5. Порча снятия при `dispose` роняет 11 проб стенда оповещения —
  значит новая ветка действительно зовётся, а не числится.
- Стенд оповещения теперь РАЗМОНТИРУЕТ предыдущий подставной монтаж вместо подмены имени
  агента. Первая попытка чинилась подменой имени и снесла пробу «агент не назван» — стенд
  её поймал сам, и это записано здесь, чтобы следующий не чинил тем же способом.
- Набор пакета: 5 приборов, 77 проб, красных 0, слепых 0 (по кодам возврата).

## 0.1.0-alpha.19 — сводка «вышло» и честная строка о дистилляции (Х7.2)

- Запись сделана задним числом выпуском a20: при выпуске a19 её не было вовсе, долг назван
  мной самой в строке ворот 12.09.2026. Дописана здесь, а не правкой a19 — правка развела
  бы дерево с тегом.
- Строка сжатия получила ДЛИНУ СВОДКИ на выходе: «сводка вышло N зн.». Единицы разведены
  намеренно — вход меряется токенами (`shadowedTokenCount`), выход знаками текста.
- Добавлена честная строка «дистилляция: сторож её НЕ наблюдает (асинхронный процесс
  секретаря, не событие платформы) — позвана/итог печатает сам секретарь». Сторож говорит
  не только что измерил, но и чего НЕ измерял: молчание про дистилляцию иначе читалось бы
  как «дистилляции не было».
- Проба с порчей: 42 → 41 → 42.

## 0.1.0-alpha.18 — «не задано» и «задано пустым» перестали выглядеть одинаково

- Было ДВА состояния стока в строке подъёма, а на деле их ТРИ. `komandaStoka` объявлялся
  `Schema.string().default('')`, поэтому «ключа в наборе нет» и «`komandaStoka: ''` написано
  НАМЕРЕННО» приходили в пакет одинаковой пустой строкой — различить нельзя по построению.
- ЗАЧЕМ: эти два случая означают ПРОТИВОПОЛОЖНОЕ. Первое — упущение (сток забыли настроить),
  второе — решение (сток выключен сознательно). a17 честно сказал «не знаю, который из двух»;
  a18 делает так, что знать МОЖНО.
- ЗАМЕР СХЕМЫ ЖИВЬЁМ (не по доке): без умолчания «ключа нет» → `undefined`, «ключ пустой» → `''`.
  Различение стоит ровно снятия одного `.default('')`.
- СТАЛО, три исхода разными словами: «сток задан» · «сток ВЫКЛЮЧЕН намеренно (komandaStoka
  пуст) — тревога только в журнал» · «сток НЕ ЗАДАН — ключа нет в наборе (похоже на упущение)».
- ⚠️ ГРАНИЦА: различение держится, пока пустую строку пишут НАМЕРЕННО. Опечатка `komandaStoka: ''`
  будет названа решением — пакет читает набор, а не мысли того, кто его писал. Лучше прежнего
  (там решение читалось упущением), но не истина.
- 🔴 ПРОБА ВТОРОЙ РАЗ ПОДРЯД ЧУТЬ НЕ СТАЛА ЗАМКОМ: после a17 она стерегла `/сток (задан|ПУСТ)/`
  и покраснела на ВЕРНОЙ правке, потому что исходов стало три, а в перечне было два. Тот же
  класс, что чинили в a17, на том же файле, через один выпуск. Теперь перечень полный.
- Приёмка: стенд `stend-opoveshcheniya.mjs` 41 из 41; различение трёх состояний 3 из 3
  (ключа нет → НЕ ЗАДАН · пустой → ВЫКЛЮЧЕН · командой → задан). Порча (вернуть `.default('')`)
  схлопывает первые два в одно значение — различение пропадает, как было до a18.

## 0.1.0-alpha.17 — строка подъёма не называет упущением то, что может быть решением

- Печаталось «сток НЕ задан» при пустом `komandaStoka`. Схема ставит умолчанием пустую строку
  (`Schema.string().default('')`), поэтому «ключа нет вовсе» и «`komandaStoka: ''` написано
  НАМЕРЕННО» приходят в пакет ОДИНАКОВО — различить их внутри пакета нельзя ПО ПОСТРОЕНИЮ.
- ЗАЧЕМ (случай приёмщика, 09.09.2026): слово «НЕ задан» называло УПУЩЕНИЕ там, где стояло
  РЕШЕНИЕ. Аудитор прочёл намеренно выключенный сток соседа как расхождение и завёл тревогу.
- СТАЛО: «сток ПУСТ — тревога только в журнал (упущение это или решение, знает набор)».
  Говорим то, что знаем: сток пуст ⇒ тревога никуда не уйдёт. Почему пуст — знает набор.
- 🔴 ПОПУТНЫЙ КЛАСС, РАДИ КОТОРОГО СТОИТ ЧИТАТЬ ЭТУ ЗАПИСЬ: ПРОБА ЗАЩИЩАЛА ДЕФЕКТ. Стенд стерёг
  ДОСЛОВНОЕ «сток НЕ задан», поэтому лечение строки роняло стенд — исправление лжи выглядело
  как поломка. Теперь стережётся СМЫСЛ (`/сток (задан|ПУСТ)/`): что подъём назвался и сказал
  о судьбе тревоги, а не выбранные для этого слова. Проба, стерегущая дословный текст, —
  замок на двери, которую нужно открыть.
- Стенд `stend-opoveshcheniya.mjs`: 41 из 41. Контроль зрячести: порча (возврат прежней
  формулировки) роняет РОВНО одну пробу — 40 из 41.

## 0.1.0-alpha.16 — страж одиночного монтажа

- При повторном `apply` в ТОМ ЖЕ процессе регистрация обработчиков пропускается,
  в журнал идёт строка «сторож уже смонтирован — второй монтаж пропущен».
- ЗАЧЕМ (замер, а не догадка): пакет лежит в общем каталоге, на него ссылаются несколько
  профилей одного процесса. В журнале агента-2 ДВА голоса подъёма на один подъём,
  у меня ТРИ (09.09 01:22:41, :42, :42). Обработчиков в файле два, значит при трёх монтажах
  выходило шесть регистраций — тревога печаталась бы шестикратно. Счёт внутри сообщения
  верен, дублируется САМО сообщение.
- УСТРОЙСТВО взято у секретаря (`distill-shov.js`, `zahody_po_srezu`): счётчик по ключу,
  повторный заход пропускается. Не выдумано заново.
- ГРАНИЦА: страж живёт в ПАМЯТИ ПРОЦЕССА. Он не спасает от двух РАЗНЫХ процессов,
  смонтировавших пакет, — там и голоса законны, и события у каждого свои. На это есть
  отдельная проба, чтобы область не расползлась.
- Стенд `stend-odinochnogo-montazha.mjs`: 4 из 4. Проба гонит ДВА `apply` подряд —
  на одном она зелена по построению. Контроль зрячести: без стража 2 из 4, падают ровно
  «два apply» и «второй монтаж не молчит», прочие устояли.

## 0.1.0-alpha.15 — сводка сторожа по такту ходов (такт ходов)

- Сводка печатается по ТАКТУ ХОДОВ, а не по времени: N=10 ходов без сжатия и первая —
  на первом `turn/end` после подъёма, чтобы молчание не длилось до десятого хода
  у свежеподнятого агента.
- ЗАЧЕМ: при нуле сжатий сторож молчал, и молчание было неотличимо от «сторож не работает».
  Счёт по событию завершения хода, а не по часам: сторож меряет работу, а не время.
- ГРАНИЦА: N=10 назначено числом и на нашем корпусе не проверялось — это порог по замыслу,
  а не по ряду. Переснять, когда наберётся статистика ходов между сжатиями.
- Стенд `stend-svodki-po-taktu.mjs`: 6 из 6, канарейка своего числа (ZHDYOM) проверена порчей.

## 0.1.0-alpha.14 — начатое и НЕ завершённое сжатие не попадало НИ В ОДИН разряд

🔴 Счёт сжатий идёт по событию `compaction/end`; вид (естественное / принудительное / провал)
тоже решается по КОНЦУ — провал по полю `error` в нём. Сжатие, начатое и оборванное
(перезапуск службы, падение процесса), конца не имеет вовсе — и потому не попадало ни в
«сжатий N», ни в «провалов». Знаменатель, который сторож печатает как основание для чтения
своих чисел, занижался МОЛЧА.

ЗАМЕР ПО ЖУРНАЛУ СЕССИИ НА ДИСКЕ (не по стенду): записей 100494, событий
compaction/start 38 · /summary 37 · /end 37. Разница ровно одна:
    id 1b1b054b-… начато 05.09 14:00:44Z, конца нет
    причина УСТАНОВЛЕНА по журналу службы, а не выведена: в 14:02:58Z службу перезапустили,
    следующее сжатие началось в 14:05:08Z уже под новым процессом.

✅ Добавлен разряд «начато и НЕ завершено: N». Ноль печатается ТОЖЕ — иначе «незавершённых не
было» станет неотличимо от «их не считали», а это ровно та беда, которую сторож и стережёт.
Крик «не вошли в „сжатий N"» — только при N > 0: постоянный крик научил бы не смотреть.

Пробы ПАРОЙ: start без конца → «1» и крик; start+end → «0» и БЕЗ крика. Первая помечена
«[с живого: 05.09 14:00:44, оборвано перезапуском]», вторая — предусмотрительность.
Порча «всегда ноль» роняет ровно первую (40 из 41), откат сверен побайтно. Стенд 39 → 41.

⚠️ ЧЕГО ЭТО НЕ ЗАКРЫВАЕТ: сторож видит только события СВОЕГО процесса. Сжатие, оборванное
перезапуском, в новом процессе не досчитается никогда — счёт обнуляется подъёмом, и это
сказано в первой строке сводки. Разряд ловит обрыв ВНУТРИ жизни процесса, а не через неё.

## 0.1.0-alpha.13 — убраны мёртвые проверки под sud()

После перевода обёрток на проверку по устройству (предыдущий выпуск) три ветки разбора
возвращённого значения стали недостижимы: `sud()` бросает на ЛЮБОМ возврате, кроме
`undefined` и `true`, и до них дело не доходит. Недостижимый код читается как действующая
проверка — убран. Поведение пакета не менялось.

## 0.1.0-alpha.12 — обёртки стендов краснеют от ЛЮБОГО возврата тела, а не от перечня значений

Приёмка насчитала слепых обёрток вдвое больше, чем прибор, и потребовала сперва объяснить
расхождение. Причина найдена замером: прибор вписывал РОВНО ОДНУ форму порчи — возврат строки.
Обёртка вида `if (typeof vernulos === 'string') throw` на неё честно краснела, и прибор объявлял
её здоровой — при том что `0`, `null`, объект и число проходили сквозь неё ЗЕЛЁНЫМИ.

⇒ Не «чужой способ строже», а **порча одной формы отвечает про одну форму**.

Проверка возврата переведена с перечня значений на устройство: тело пробы обязано бросить ошибку
либо промолчать, всякий иной возврат — красное. Прибор гоняет теперь пять форм и называет, какие
именно прошли. По флоту: глухих было 19 из 58, стало 0. Поведение пакета не менялось ни на знак.

## 0.1.0-alpha.11

**КАЖДАЯ СТРОКА ЖУРНАЛА НАЗЫВАЕТ ВЕРСИЮ** — условие видимости для чужих приборов, а не оформление.

**Было.** Сторож печатал `[dsh-pamyat-storozha]` без номера, тогда как все соседи печатают
`[имя версия]`. Цена реализовалась ДВАЖДЫ за сутки, и оба раза молча:
· срез «три столбца» на соседней машине разбирает строки по образцу «[имя версия]» — кто
  печатает иначе, выпадает из столбца «БОЙ», и пустая клетка читается как «предмета нет»;
· мой собственный замер «у кого в журнале только отказы» искал тот же образец и насчитал
  сторожу НОЛЬ строк при четырёх настоящих.

🔴 **Предмет, не называющий версию, невидим не для человека, а для ПРИБОРОВ,** и его молчание
неотличимо от отсутствия. Это долг 108 семейства; здесь он закрыт.

⚠️ **Номер не выдумывается:** не прочиталось — «версия неизвестна», а не последняя известная.
Подставленный номер утверждал бы то, чему предмет уже может не соответствовать.

Пара проб (версия в строке · это НОМЕР ИЗ МАНИФЕСТА, а не любая непустая строка); порча
«убрать версию из krik» роняет обе.

## 0.1.0-alpha.10

**СВЕРКА ОПИСАНИЯ С ПЕРЕЧНЕМ СТОРОЖЕЙ — ПРОБОЙ, А НЕ ГЛАЗОМ** (ворота приёмки).

**Было.** Ворота требуют у каждого сторожа две обязательные колонки — «чего не ловит» и «что
значит его молчание». Они стояли у всех трёх, и сверка делалась рукой. Рука отвечает про тот
час, когда сверяла: заведи четвёртого сторожа и забудь описать — описание останется полным
НА ВИД, потому что о недостающем оно молчит. Наш класс: проверка перечня ловит лишнее и слепа
к недостающему.

**Стало.** Перечень сторожей объявлен ОДНИМ местом в коде (`STOROZHA`), обязательные колонки
тоже (`KOLONKI_OPISANIYA`), и стенд сверяет их с README **в обе стороны**:
объявлен в коде, не описан → красное; описан колонками, нет в коде → красное.

🔴 **Вторая сторона пары нужна не для симметрии.** Без неё можно описать сторожа, которого
нет, и описание будет выглядеть богаче предмета. Признак авторства прямой: колонку «чего не
ловит» ставят только там, где описывают сторожа, — значит раздел с ней есть заявка и обязан
иметь предмет в коде.

🔴 **Нет README — СЛЕПОТА (код 2), а не «сошлось».** Отсутствие сверяемого не есть успешный
исход сверки; предмет этой проверки — само описание.

⚠️ **Чего связка не ловит:** правдивость текста колонок. Держится наличие и охват, а не
соответствие слов поведению — это предмет проб самих сторожей.
⚠️ **Перечень всё-таки ведётся рукой:** «сторож» есть понятие замысла, из кода его не извлечь.
Выигрыш в том, что рука теперь в ОДНОМ месте и её забывчивость краснеет.

Стенд `test/stend-opisaniya.mjs` — 12 проб. Четыре порчи, каждая со своим исходом: четвёртый
сторож без описания → красное · снятая колонка → красное · описан несуществующий → красное ·
README убран → слепота с кодом 2.

## 0.1.0-alpha.9

🔴 **СВОДКУ СТОРОЖА В БОЮ НЕ ЗВАЛ НИКТО.** Найдено замером боевого журнала через час после
монтажа: за это время сторож сказал ровно одну строку — о подъёме.

**Что было.** `svodkaStorozha()` объявлена, отдана наружу — и единственные её вызовы жили
в стенде. Значит ворота **В10** (область и «чего не проверял» печатаются всегда, даже нулём)
и **В11** (знаменатель рядом с числителем) числились закрытыми и в бою не исполнялись ни
разу. Стенд при этом был зелёным, потому что звал метод напрямую — то есть проверял то,
чего в бою не происходит.
Класс третий за двое суток в этом же семействе памяти: **механизм есть, вызывающего нет**
(до того — счётчик касаний и уровень происхождения: поля мигрировали, писателя никто не звал).

**Что стало.** Сводка печатается после КАЖДОГО завершённого сжатия — успешного, провального
и обрезки. Событие редкое (замер: 14 сжатий за 36 ч), шума не даёт, а числа нужны ровно в тот
миг, когда есть о чём говорить.
⚠️ **Граница:** при полном молчании событий сводка не печатается вовсе, и сторож снаружи
неотличим от мёртвого. Это отдельный предмет («сторож молчания»), он в хвостах, а не здесь.

🔴 **Объявление ссылки стоит выше обоих обработчиков намеренно.** `let` не поднимается: вызов
из обработчика, зарегистрированного раньше объявления, упал бы по временной мёртвой зоне —
ровно та авария, что уронила сторож флота 06.09 (переменная использована выше строки
объявления при строгом режиме, и грамматика была чиста).

🔴 **13 проб покраснели разом на исправном предмете** — и это находка о стенде, а не о коде.
Пробы брали `stroki.at(-1)`, то есть признак по ПОЗИЦИИ; сводка добавила строк, и «последняя»
стала её хвостом. Признак заменён на признак по ПРЕДМЕТУ: `sobytie(t)` — последняя строка,
не принадлежащая сводке. 16 вхождений.

**Стенд** 35 → 37. Пара новых проб держит обе стороны: сводка печатается после сжатия
(с проверкой области, знаменателя и «НЕ проверял») и НЕ печатается на каждом ходе — иначе
журнал зальётся. Две порчи роняют ровно свои половины: снятие вызовов — первую, вызов на
каждом событии — вторую (55 сводок без единого сжатия).

## 0.1.0-alpha.8

**Только стенд.** Кода не касается: `src` не тронут.

🔴 **Четыре частных имени в подставных данных стенда.** Имя агента этой машины стояло
и во входных данных проб, и в ожидании строки тревоги. Уехало бы на публичный репозиторий
при первом же теге. Заменено подставным именем — и заменять пришлось ОБЕ стороны разом:
поменяй только вход, проба покраснела бы на исправном предмете.

⚠️ Это двадцать первая утечка за трое суток, и снова через прозу и подставные данные,
не через код. Пакет заводился до того, как ворота частных имён встали на путь тегом, —
и через них не проходил ни разу.
## 0.1.0-alpha.7 — 06.09.2026

🔴 ДЛИТЕЛЬНОСТЬ НЕ ИЗМЕРЯЛАСЬ НИКОГДА. Поле времени у события платформы называется `time`
(SessionEvent: { type, seq, time, data } — «Unix epoch milliseconds», dsh-session types.d.ts
425-431), а сторож читал `timestamp` — имя, взятое ИЗ ГОЛОВЫ.

Стенд этого не ловил, потому что подставные события я писала ТЕМ ЖЕ выдуманным именем: проба
стерегла выдумку. Нашёл ПРОГОН НА ЖИВОМ ЖУРНАЛЕ (ворота приёмки «прогон за сутки»): 82 события,
27 сжатий — и у 27 из 27 «длительность не измерима». Число, одинаковое для всех, и есть признак
ответа про инструмент, а не про предмет.
После правки на тех же живых событиях: 128,1 · 131,6 · 144,9 · 165,9 с — настоящие числа.

⚠️ ГРАНИЦА РАЗУМНОСТИ, найденная порчей. `Date.parse('1000')` даёт ГОДНУЮ дату — год тысячный.
Без проверки строка неожиданной формы превращалась не в «не измерима», а в длительность
94 670 812 800 с, и строка тревоги выглядела осмысленной. Теперь время раньше 2020 года
отвергается: у нас таких событий нет и быть не может.

Стенд приведён к форме платформы: метки времени реалистичные (эпоха в миллисекундах), а не
условные 1000/4000 — иначе он снова проверял бы не то, что бывает в бою.

Пробы 33 → 35, две новые: «время берётся из объявленного поля» и «время неожиданной формы →
не измерима, а не мусорное число». Три порчи роняют каждая свою.

📌 ЭТО ВТОРОЙ РАЗ В ЭТОМ ЖЕ ПАКЕТЕ ЗА СУТКИ. Первый: `usage` писался выдуманными именами полей
(`input` вместо `inputTokens`), и стенд был зелёным по той же причине. Один корень: форму
подставных данных надо брать У ОБЪЯВЛЕНИЯ, а не из головы. Правило записано после первого
случая — и не сработало во втором, потому что я думала про время, а не про форму.

## 0.1.0-alpha.6 — 06.09.2026

Ворота В4 (охват) в исполнимой форме — по СЕССИЯМ процесса, а не по агентам машины.

Ворота просят: «сторож печатает, сколько агентов видел и сколько в прошлый раз; стало меньше
— тревога». Буквально это неисполнимо: сторож живёт ВНУТРИ процесса и чужих агентов не видит
ни одним событием. Исполнимая половина — сессии этого процесса: если сессия, от которой шли
события, замолчала, это ровно тот «ослеп», от которого ворота защищают.

Сводка печатает: сколько сессий видел, каждую поимённо с числом событий, и пометку «МОЛЧИТ N
мин» для тех, от кого час не было событий. И отдельной строкой — что это СЕССИИ, а не агенты
машины: без этой оговорки «видел 1» прочтётся как «на машине один агент».

⚠️ ЗАМЕР ДО КОДА, чтобы не выдать механизм за находку: за 6 часов журнал показывает ОДНУ
сессию (telegram-a2a). Сегодня разряд предмета не имеет и молчит по существу, а не по
исправности; заводится он по построению, на случай второй сессии.

🔴 ПОРЧА ПОКАЗАЛА ДЕФЕКТ В МОЁМ ЖЕ КОДЕ. Первая редакция вела учёт в два шага — «нет ключа →
положить», следом «взять и поправить». Порча, выключившая запись, уронила ВЕСЬ СТЕНД на
undefined вместо того, чтобы уронить свою пробу: то есть сломала предмет, а не изменила
поведение, и выводить по ней было не по чему. Переписано в одно движение (`get ?? новый` →
правка → `set`), undefined невозможен по построению. Точная порча теперь роняет ровно одну
пробу.

Пробы 30 → 33.

## 0.1.0-alpha.6 — 06.09.2026

Ворота В4 в исполнимой форме: охват по сессиям.

Ворота просят «сторож печатает, сколько агентов видел и сколько в прошлый раз; стало меньше —
тревога „ослеп на такого-то"». Буквально это неисполнимо: сторож живёт ВНУТРИ процесса и
чужих агентов машины не видит ни одним событием. Исполнимая половина — сессии ЭТОГО процесса:
если сессия, от которой события шли, замолчала, это ровно тот «ослеп», от которого ворота
защищают.

Сводка печатает «ОХВАТ ПО СЕССИЯМ: видел N — имя (событий K, МОЛЧИТ M мин)» всегда, даже при
нуле, и тут же оговаривает: это СЕССИИ, а не агенты машины. Без оговорки «видел 1» прочтётся
как «на машине один агент» — то есть разряд соврал бы областью, а не числом.

⚠️ ЗАМЕР ДО КОДА, чтобы не выдать механизм за находку: за 6 часов журнал показывает ОДНУ
сессию. Сегодня у разряда предмета нет, и он молчит по существу, а не по исправности;
заводится по построению, на случай второй сессии.

Пробы 30 → 33. Порча «счёт событий сессии не растёт» роняет ровно пробу поштучного счёта;
порча «область не оговаривается» — ровно пробу оговорки.

🔴 И урок о самой порче: первая была грубой — снимала создание записи о сессии, и следующая
строка падала на undefined. Стенд валился ЦЕЛИКОМ, красных не было вовсе. Это не «поймали», а
«сломали»: точная порча меняет ОДНО и оставляет остальное рабочим.

## 0.1.0-alpha.5 — 06.09.2026

Арифметика расхода взята у платформы. Два дефекта: один нашла приёмка (Д1), второй нашёлся
рядом и в её замечании его не было.

**Д1 — reasoning считался дважды.** `rashod` складывал ВСЕ числовые поля usage подряд.
Приёмка поймала на живых числах: 35 вместо 30. Основание правки — не её слова и не память,
а объявления платформы: `TokenUsage` объявлен с непересекающимися вёдрами
(dsh-llm/lib/types/types.d.ts:115-129), а её собственная сумма `usageTokens` помечена в коде
дословно «Sum disjoint provider usage buckets WITHOUT DOUBLE-COUNTING REASONING OUTPUT»
(dsh-token-meter/lib/index.js:455-458). То есть `reasoningTokens` лежит ВНУТРИ
`outputTokens`, и слагаемым быть не может.

**Второй дефект, свой: ступени считались не от той величины.** Заполнение контекста — это
то, что уходит В ЗАПРОС: вход плюс кэш, БЕЗ выхода (`pressureFrom`, там же, строки 265-266:
«Prompt-side pressure of one request: input plus cache traffic, no output»). Ответ модели
попадёт в контекст только следующим вызовом. Считая долю от полного расхода, мы завышали её
на весь выход — ступень кричала раньше срока, и объяснить это было бы нечем. Заведена
отдельная `davlenie()`; в строке тревоги величина названа: «вход+кэш, БЕЗ выхода».

**Считаются только объявленные поля.** Прежняя редакция брала любое число и тем молча
включила бы в счёт поле, которого мы не знаем. Теперь незнакомые поля не складываются и
называются вслух один раз: молчаливый учёт неизвестного хуже пропуска — он даёт число, за
которое никто не отвечает.

🔴 **И находка в собственном стенде, вскрытая правкой.** Все подставные `usage` были формы
`{ input: N }`, `{ input_tokens: N }` — имён, которых у платформы НЕТ вовсе. Стенд зеленел
потому, что старая функция складывала любое число, а не потому, что считала верно: проба
отвечала на свой вопрос и читалась как ответ на наш. Формы взяты у объявления; заведена
проба-сторож «чужая форма usage → не сообщён, и поля названы», чтобы это больше не проходило
молча.

Пробы: 26 → 30 в стенде оповещения, 8 → 12 в стенде видов. Три порчи, каждая роняет ровно
свои: reasoning снова прибавляется → падает проба удвоения; ступени считают полный расход →
падает проба «выход в заполнение не входит»; незнакомые поля молчат → падают обе пробы
про них.

## 0.1.0-alpha.4 — 06.09.2026

Ворота В5 и В1 приёмки.

**В5 — окно контекста берётся у платформы, а не числом в настройке.** Было: `predel` в
профиле, и ступень 85% считалась от него. Число описывает модель НА МОМЕНТ ЗАПИСИ: сменят
модель — окно станет другим, а число останется, и ступень будет то ранней, то поздней, ничего
об этом не сказав. Стало: `session.requestContext().contextWindow` — платформа объявляет окно
вместе с маршрутом. Настройка осталась ЗАПАСНОЙ и в строке тревоги помечается «платформой не
подтверждена».

Расхождение настройки с объявленным окном называется вслух один раз. Молча предпочесть
платформу было бы хуже: в профиле осталась бы цифра, которая выглядит действующей и ни на что
не влияет — тот же класс, что метка, пережившая свою правду.

Нет ни окна, ни настройки — печатается СЛЕПОТА с причиной. Прежде здесь стоял тихий возврат,
и молчание ступеней было неотличимо от «занято мало». Причины разведены: «у сессии нет
requestContext()» — про нас, «модель окна не объявила» — про модель; поле необязательное по
объявлению платформы, поэтому второе законно, а чинить их надо разное.

**В1 — состав строки тревоги.** Агент (из настройки; умолчания нет намеренно — подставленное
имя уверенно отвечало бы не про тот узел, пусто даёт «агент НЕ НАЗВАН»), идентификатор сжатия,
маршрут. Агент подставляется ОДНИМ местом в `otdat`, а не собирается в каждой строке: собирать
по строкам — значит однажды забыть его ровно в той, которую будут читать.

Маршрут помечен как «на момент чтения, не обязательно тот, которым сжимали»: сжатие могло идти
другим маршрутом, если его между делом сменили, а замера этого у нас нет.

Пробы: 17 → 26. Четыре порчи, каждая роняет ровно свои: окно всегда из настройки → падает
проба про платформу; строка слепоты выключена → падают обе пробы слепоты; агент выпал из
`otdat` → падают обе пробы В1; причины слепоты слиты в одну → падает проба различения.

⚠️ Порча «окно всегда из настройки» показала попутно: строка при этом продолжала печатать
«окно — платформа», то есть ярлык врал бы, а число было чужим. Проба ловит по ЧИСЛУ, не по
ярлыку — иначе она проверяла бы подпись, а не предмет.

## 0.1.0-alpha.3

**Ворота В0 и В2 (настоящие В0–В6 пришли поправкой приёмки: прежняя вырезка взяла чужой абзац).**

**В2 — одно сообщение на все перейдённые ступени.** Один скачок расхода перешагивает обе
ступени разом (800 000 → 950 000), и прежняя редакция кричала дважды об ОДНОМ событии — ровно
та беда, ради которой сторож делался «одним оповещением поверх».

**В0 — счёт обнуляет ЛЮБОЕ сжатие, не только сводочное.** Было: сброс только на
`compaction/summary`. Обрезка без модели урезает контекст так же, а фронт ступеней после неё
оставался поднятым.
Сами ворота писались про другой источник (`tokenMeter.measure()` завышен после сжатия, дефект
#5632). У нас measure() не берётся ВОВСЕ — считаем по `usage` событий, — поэтому тот дефект нас
не касается по построению, и это проверено грепом: упоминаний measure в пакете 0. А его
близнец по prune был.

🔴 **Первая редакция пробы на В0 была СЛЕПА, и поймала это порча, а не чтение.** Я ждала, что
несброс даёт ЛОЖНУЮ тревогу, и проверяла «криков 0». Но `usage` события несёт ПОЛНОЕ текущее
заполнение: `vzyato = r.vsego` — замена, а не накопление, и после обрезки число само
становится малым. Ложной тревоги не бывает по построению, поэтому проба зеленела и с порчей,
и без.
Настоящая цена несброса обратная: перейдённая ступень остаётся в «уже отданных», и при
ПОВТОРНОМ наборе того же объёма тревоги НЕ БУДЕТ. Теряется не ложный крик, а нужный. Проба
переписана под это; порча теперь роняет ровно её.

**В3 закрыт замером, без правки:** упоминаний `api.telegram.org|bot-token|chat_id` в пакете 0.

Заодно исправлена опечатка в самой строке тревоги («ступеньи» → «ступени/ступень»).
Стенд 15 → 17 проб.

## 0.1.0-alpha.2

**Ворота В9–В11 приёмки: что решает исход, охват и знаменатель.**

**В9 — что решает исход, названо в коде.** У каждой тревоги в шапке `apply` написано, какие
именно величины входят в решение, а какие печатаются справочно. Повод: за сутки класс «данные
собраны и не участвуют в вердикте» нашёлся у двух приборов сразу — курьер подъёма координатора
печатал PID до/после и решал по коду конвейера; мой `podyom-uzla` печатал PID и число
назвавшихся пакетов, а в код возврата их не брал.
Следствие названо вслух: расход «не сообщён» тревоги НЕ поднимает и поднимать не должен — это
свойство данных провайдера, а не беда памяти. Захотим кричать — это будет НОВАЯ тревога со
своим решающим признаком, а не тихое расширение этой.

**В10 — охват и «не проверял» печатаются ВСЕГДА, даже нулём.** Иначе «тревог 0» читается как
«всё хорошо», а означать может «туда не смотрели». Названы три случая, которые молчание
сторожа НЕ различает: сжатия других агентов машины · события до подъёма · то, что не дошло до
слушателя.

**В11 — знаменатель рядом с числителем.** «Сжатий N» печатается вместе с «ходов M». Повод из
того же дня: вывод о лечении связи держался на «0 отказов в окне», пока не выяснилось, сколько
было попыток. У ступеней заполнения знаменателя НЕТ — они про состояние, а не про поток, и это
сказано в самой сводке, а не подразумевается.

⚠️ **Сводка не выдаёт себя за суточную.** Счёт живёт в памяти процесса и обнуляется подъёмом;
в первой же строке стоит «с подъёма процесса (НЕ за сутки)». Суточный счёт потребовал бы
своего хранилища — второго места правды рядом с журналом.

Виды считаются раздельно: естественные · принудительные · обрезки без модели · провалы.
Стенд 10 → 15 проб. Три порчи, каждая роняет свою: ходы не считаются → падает знаменатель;
убрать строку «не проверял» → падает охват; обрезка в естественные → падает разделение видов.

🔴 И свой промах при этом: пять новых проб я написала в идиоме ядра («вернуть строку при
беде»), а обёртка ЭТОГО стенда ждёт строго `true` — все пять покраснели на исправном предмете.
Перенос идиомы между пакетами, третий раз за сутки. Обёртка при этом сработала верно: она
краснеет на неизвестном возврате, а не глотает его молча.

# Изменения

## 0.1.0-alpha.1

Первый выпуск. Два сторожа в одном пакете.

**Оповещение о сжатии.** Одно поверх, а не по слушателю на событие: событий сжатия
на живом узле слушают уже четыре пакета, и пятый кричащий дал бы пять сообщений на
одно сжатие.

**Три вида, а не два.** В задании названы естественное и принудительное; замер по
объявлениям платформы дал третий — обрезка без модели (`compaction/prune`). У неё
нет ни модели, ни расхода: замена идёт без вызова.

**Что снято с платформы, а не по памяти:** поля длительности у событий НЕТ вовсе;
расход (`usage`) объявлен необязательным; `error` у конца помечает НЕУДАВШУЮСЯ
попытку — считающий все концы посчитает и провалы.

**Вторая ступень заполнения** (85% и 90%) ведёт СВОЙ счёт и говорит об этом в самой
строке: нудж держит свою долю независимо, и числа могут разойтись.
