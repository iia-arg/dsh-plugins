# CHANGELOG · dsh-reestr

## 3.1.10 — 20.10.2026 · текст тревоги сравнителя: порядок по важности, «ТОЛЬКО НА» хвостом, урезание update (код Михалыча r3, ворота Вениамина 23:50:42 МСК; в дерево — Искра, наряд Забавы 20:50Z)

- Меняется только `bin/sverka-paketov` (a1f80fa7 → 5a06f308); `agent-plugins` и юниты — как в 3.1.9.
- Тревога: строка счёта; затем НОВОЕ/ИЗМЕНИЛОСЬ по важности — СЛЕПОТА, ЛИШНИЙ СНИМОК, РАЗОШЛОСЬ, ОТСТАЁТ, НЕЛЬЗЯ СРАВНИТЬ, НЕГОДНАЯ СТРОКА; затем закрытое; блок «ТОЛЬКО НА» — хвостом, сводкой по составу машин.
- Предел тревоги 3800 знаков, хвосту оставляется 500. Текст `update` в находке ОТСТАЁТ урезается до самого длинного из 300/120/80/40/0 знаков, при котором важное укладывается; полный текст — только в `nahodki.json`. Не влезло и важное — «… обрезано (важное не влезло целиком)» с отсылкой к `nahodki.json`.
- НЕ МЕНЯЕТСЯ: сравнение, исходы, коды, `nahodki.json` и состояние — урезается только текст тревоги.
- Alert text of the comparator: findings ordered by severity, "only on" summary last, `update` text shortened to fit the 3800-char limit; full text stays in `nahodki.json`.

## 3.1.9 — 20.10.2026 · сверка пакетов между машинами: `agent-plugins snimok` и сравнитель `sverka-paketov` (код Михалыча r2, ворота Вениамина 23:17:50 МСК; в дерево — Искра, наряд Забавы 20:21Z)

- `agent-plugins snimok [--stdout]`: снимок реестра машины для межмашинной сверки. Прямо перед снимком гоняет `verify` тем же кодом и кладёт итог в снимок (`verify_kod`, `verify_itog`); отпечаток — фактический (`fingerprint_check` исполняется сейчас). Поля — белым списком (`id, version, origin, fingerprint_fakt, fingerprint_sost, derevo_ref, derevo_commit, update`). Запись атомарная в `/var/lib/sverka-paketov/snimok.json` (0644). Ничего не правит. Коды: 0 — снимок записан, 2 — не записан.
- `bin/sverka-paketov` — сравнитель, ставится ТОЛЬКО на bclaude (на sadik — `not_installed`). Машины — из `/etc/sverka-paketov/mashiny.conf`, чужие снимки — по ssh учётки `sverka` с `restrict,command=`. Исходы: РАЗОШЛОСЬ, ОТСТАЁТ, НЕЛЬЗЯ СРАВНИТЬ, ТОЛЬКО НА, СЛЕПОТА, ЛИШНИЙ СНИМОК; покрытие числом; `update` с признаками секрета — «скрыто». Недоставка тревоги — код 4.
- `systemd/sverka-snimok.{service,timer}` — снимок 05:30 UTC на каждой машине сверки; `systemd/sverka-paketov.{service,timer}` — сравнитель 06:00 UTC, ставится только на bclaude (на sadik — `not_installed`). Таймеры не включать до первого ручного прогона (лист монтажа, шаг 4).
- НЕ ЛОВИТ: содержимое записей без `fingerprint_check` (между машинами сравниваются номера метки/версии); commit — только где есть дерево меток.
- Cross-machine package reconciliation: `agent-plugins snimok` writes a per-host registry snapshot (verify inside); `sverka-paketov` (bclaude only) compares snapshots from all hosts.

## 3.1.8 — 17.10.2026 · покрытие installed_check: каждый local из derevo.files назван в проверке записи (Искра; правило Вениамина 20:10 МСК, наряд Забавы 17:10Z/17:20Z)

- Новый стенд `test/stend-pokrytiya-installed-check.py` (без аргументов; `PLUGINS_REGISTRY`, по умолчанию живой реестр; `POKRYTIE_ISKL`, по умолчанию файл рядом): у каждой записи с `derevo.files` каждый `local` обязан стоять в `installed_check` ОТДЕЛЬНЫМ СЛОВОМ (подстрока не годится: `montazh-okno` совпал бы внутри `montazh-okno-watch`). Иначе verify подмену файла не видит — 17.10 dsh-montazh `montazh-okno` 0ea088d7 → bdd9e3ca прошёл «совпадает».
- Исключение — ДАННЫМИ, двумя признаками: строка «id<TAB>признак<TAB>причина» в `test/pokrytie-installed-check.isklyucheniya.tsv` И признак стоит в `installed_check` записи; иначе «исключение не действует». Сейчас одна строка: dsh-autopilot · `--manifest` (layout-check.py, 160 файлов по манифесту). Исключение без записи с derevo — красное «снять строку».
- Коды: 0 — покрыто всё; 1 — поимённо «запись: путь»; 2 — слепота (реестр/исключения не прочитаны или кривые; нет файла исключений; аргументы — отказ).
- НЕ ЛОВИТ: слово в installed_check, не входящее в сумму (echo/комментарий); `derevo.links`; сам манифест dsh-autopilot не открывает.
- Номер 3.1.8: 3.1.7 оставлен очереди (по слову Забавы — Гамма); кандидата 3.1.7 на диске нет (17.10 17:2xZ) — если не появится, перенумеровать до окна.
- New stand: every derevo.files local must be a separate word in the entry's installed_check; manifest-checked entries are exempted by data (id + marker present in the check).

## 3.1.6 — 17.10.2026 · B-N-2104(2): владелец тревог читается рукой сверки

- При PermissionError JSON доставки читается существующим `_prochest`: прямое чтение, затем `sudo -n cat` с пределом15с. Весь verify и стенд остаются под iskra; ACL/группы/JSON не меняются. Это несекретные настройки доставки, не tokenFile.
- При отказе sudo остаётся СЛЕПОТА; отсутствующий, битый/необъектный JSON и owner вне allowedUsers остаются красными. Приоритет JSON над config (включая null) сохранён.
- Новый стенд с настоящим UIDiskra/root:coders0640 и фактическимsudo проверяет чтение, порчу/возврат и отказ привилегированного чтения. V11 старого стенда явно отказывает sudo, вместо предположения, что chmod000 ослепляет и root-reader.

## 3.1.5 — 16.10.2026 · соцприём Анны в сборке A (Искра; B-N-2027, наряд Забавы 13:03:36Z, контракт Беты b5672a5d)

- `agent-registry`: признак `namerenie.raskladka.socpriyom` {`serviceUrl` http://127.0.0.1:<1024..65535>/, `keyFile` абсолютный, `channelId`/`discussionId` разные целые < 0} — ровно ключи `config.social` канала (`dsh-telegram-multiagent` src/social-ingress.js). Параметры `SOCPRIYOM`, `SOC_URL`, `SOC_KLYUCH`, `SOC_KANAL`, `SOC_OBSUZHDENIE` выводятся ПОСЛЕ цикла отличий. `agentName` = имя записи латиницей строчными («anna»: канал 3.1.11 требует ровно его; слово владельца 16.10 13:10Z — технические имена строчными). Отказ: не у записи anna; вместе с `autopilot_pochta`; негодная форма.
- Параметр прежней строки agentName переименован `BEZ_AP_POCHTA` → `IMYA_KANALA_RU` (= ни почты AP, ни соцприёма): прежний код на новых шаблонах и новый на прежних отказывают, а не теряют блок молча.
- Шаблоны `codex/A.tmpl`, `sdk-claude/A.tmpl`: блок `SOCPRIYOM` — `agentName: "<IMYA>"` + `social`.
- `test/stend-soc-anna.py`: кандидат 3/3 (без признака — прежнее; с признаком — блок; 21 порча — отказ), бой 3.1.4 — 0/3.
- ЧЕГО НЕ ЛОВИТ: точные channelId/discussionId (их сверяет канал при запуске), наличие/права keyFile, живость socseti, draft/publish и карточки socseti — не в этом выпуске.
- Social intake for Anna in the A profile: `raskladka.socpriyom` gives `agentName: "anna"` + `social`; no TG change needed.

## 3.1.4 — 16.10.2026 · реестр агентов: agent-registry из a2a-bus, init, zavesti, владелец-тревог по TG 3.1.11 (Искра; B-N-2071, наряд Забавы 11:11:23Z, ворота Вениамина 11:27:47Z)

- Перенос из `a2a-bus` без правки содержимого (отдельный коммит, 11 переименований 100%): `bin/agent-registry`, 7 шаблонов `share/agent-registry/shablony-raskladki/`, стенды `stend-ap-pochta.py`, `stend-obratno-granica.py`, `stend-yashchik-rezhim.py`. Пути на машине те же — условие (1): один монтаж, `/usr/local/bin/agent-registry` не меняется.
- `agent-registry init --mashina <имя> [--iz <образец>] [--kuda <путь>]` — минимальный `agents.yaml` (O_EXCL: существующий не перезаписывается; нет каталога — отказ).
- `agent-registry zavesti <агент> --po-obrazcu <образец> [--iz …] [--pole путь=знач]… --kuda <кандидат>` — условие (2): отказ на совпадение полей-тождеств с образцом/другим агентом, на неизвестное поле, на `--kuda` = живой реестр; кандидат сверяется «прежний + ровно одна запись» до записи.
- `verify` «владелец-тревог» — условие (3): правило TG 3.1.11 (`ownerChatId` JSON доставки → конфиг, ∈ `allowedUsers`) вместо `mergeChatIntoA2A`. Прежняя проверка была ложно красной у агента без почты и ложно зелёной у агента с `mergeChatIntoA2A` без `ownerChatId` (стенд V1/V2 на боевом коде).
- Граница шапки уточнена: инструмент не правит СУЩЕСТВУЮЩИХ файлов; пишут только `init` (новый реестр), `zavesti`/`sobrat --kuda` (новые кандидаты).
- `test/stend-init-zavesti.py` (30 проб): кандидат 30/30; боевой код 3.1.6 — 6/30 (нет init/zavesti; V1 ложно красная, V2 ложно зелёная).
- Дельта (находка Альфы 16.10 11:43Z, наряд Забавы 11:43:28Z): `zavesti --iz` с ДРУГОЙ машины (`mashina.imya` образца ≠ целевому) — тождества сверяются только с агентами целевого реестра; совпадение с образцом печатается, не отказ (на bclaude команда — те же имена и порты). Своя машина или имя машины не установлено — строго, как было. Стенд +4 (Z9–Z12): 34/34; код до дельты (3f4805e9) — 31/34. Живые данные: клон master из копии реестра sadik в пустой «bclaude» — 0 (5 полей названы); повтор в реестр с master — отказ; второй агент с тождествами master — отказ.
- `package.json`: `bin.agent-registry`, `files` += `share`. Agent registry moved here from a2a-bus; new init/zavesti; alarm-owner rule follows TG 3.1.11.

## 3.1.3 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `engines.node` ">=18" — кода на Node в пакете нет (bash/python), это граница установки через npm, а не проверенная среда кода · `engines.node` ">=18" — no Node code in the package (bash/python); the bound is for npm installation, not a tested code runtime
- README: строка «Версия · Version: 3.1.3» под заголовком. · README: version line under the heading.
- Код не менялся; номер 3.1.2 → 3.1.3 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.2 — 14.10.2026 · стенд сторожа реестров: «Причина:» не пустая

- `test/stend-storozha-reestrov.sh`: предварительная проба (машина не зелёная) брала причину образцом `^  (РАСХОЖДЕНИЕ|СЛЕПОТА):`, а сторож при слепоте живости пишет «  СЛЕПОТА ПРОВЕРОК: …» — 0 совпадений, «Причина:» печаталась пустой (живой прогон Забавы 05:07Z). Теперь образец `(РАСХОЖДЕНИЕ|СЛЕПОТА)( ПРОВЕРОК)?:`; ничего не распознано — строка итога «сторож реестров:» и хвост вывода, не пустота. Та же правка — в боевой копии `dsh-obhod-stendov` 3.1.44 (файл побайтно один).
- НЕ ЛОВИТ: причину вне первых трёх распознанных строк (печатаются первые 3, каждая до 400 знаков).

## 3.1.1 — 14.10.2026 · A-N-1948 №16, перенос парковки

- Запаркованные код и документация a1bf6439/af332f4f перенесены с 4fd984d8 на master 062d7132. Номер 3.1.1 назначен координатором для очереди аудита; скачок с установленной 2.0.13 не означает удаление её изменений.
- Сохранены адресные окна B-N-2025, код «ОТЛОЖЕНО» 4, один пересъём и вставка registry-watchdog с --avto-montazh B-N-2032. Пустые внешние проверки имеют явный пропуск; --help и неизвестный ввод отрабатываются до состояния и канала.
- Монтаж: сначала настройка машины (NEZAF_UCHYOTY, healthcheck preset/shvy, настоящие TAB в ruki.tsv, DORABOTKI_CMD недельного обхода), затем файлы пакетным составом, обновление копий стендов и учёт их новых сумм. Подробный план с читателями передан отдельно, бой автором не менялся.
- Parked audit code/docs rebased onto 062d7132; deployment-window behaviour and the effective crash-wrapper flag are preserved. Version 3.1.1 is the coordinator's audit queue number. Host settings must precede deployment; tests use substitute state and alert channels.

## 2.0.13 — 13.10.2026 · B-N-2032

- В дерево сведена исправленная Забавой вставка registry-watchdog.service.d/60-bash-padenie-70.conf: обнуляющая ExecStart вставка сохраняет --avto-montazh и прежний SyslogIdentifier. Боевая копия уже правильна; runtime не меняется.
- Track the corrected crash-wrapper drop-in, preserving the automatic deployment flag.

## 2.0.12 — 13.10.2026 · B-N-2025: адресное окно монтажа

`verify`, consistency-health и registry-watchdog понимают адресную отсрочку только с явным `--avto-montazh`. Код 4 требует валидный marker и живое окно; он не означает зелёное или слепоту. Перед итогом выполняется повторная проверка срока, максимум один пересъём; повторная смена — слепота 2.

## Запаркованная редакция 2.0.12 — аудит 16 (A-N-1948): находки облачного аудита — код и документация; умолчаний одной машины в коде нет (Заря; ворота Вениамина)

Рабочий номер; выпуск 3.1.1 — отдельным шагом (слово владельца 10.10 01:38 МСК). Основа — master 4fd984d8.
- `bin/agent-plugins` 9fe7b486 → 3e8ead64: реестр не прочитан (нет, не YAML, пуст, не словарь, запись без `id`) — СЛЕПОТА, код 2, с причиной
  и номером записи, без трассы Python (№6, №7, №8); `pravka` отказывает кандидату с записью `plugins`/`services` без `id` (№7); `diff` —
  пара `published.files` без `local`/`remote` «НЕ СВЕРЕНО» (№39); таблица рук коммита — файл `AGENT_PLUGINS_RUKI` (умолчание `ruki.tsv`
  рядом с реестром), не код (№30); справка без ссылок на одну машину (№29); правило старшинства кодов verify названо (№38).
- `bin/registry-watchdog.sh` 88397327 → 3811e8cb: доводов не принимает, `--help` — справка, иное — отказ 2 до любого действия (№9);
  `DORABOTKI_CMD` и `AGENTS_VERIFY_CMD` без умолчаний — блок пропущен и назван (№3, №11); `VERIFY_CMD`/`HEALTH_CMD` по `PATH` (№11);
  файл `REGWD_CONF` читается, только если root/свой и без записи группе/всем, иначе СЛЕПОТА (№31; `/dev/null` — «настройки нет»);
  «вывод verify не узнан» не прячется за прежней слепотой (№34); порог заходов соседа в минуту 0 после загрузки (№35).
- `bin/nezafiksirovano-watch` c6a945bb → 47f35484: перечня учётов по умолчанию нет — СЛЕПОТА «не задан» (№13); учётку меняет только
  root (№12); `NEZAF_PREDEL_CH` разбирается под обёрткой (№37).
- `bin/sverka-montazha.sh` c71ab743 → d5326ddf (№14: `PLUGINS_REGISTRY`, `SVERKA_MESTA`, прямое чтение, отказ sudo — СЛЕПОТА);
  `bin/sverka-zavisimostej.sh` 415871e5 → ff3df8ad (№15: `SVERKA_PLAGINY`); `bin/preset-sverka` 94e889f6 → c228e21b (№16: слепота — код 2,
  `PRESET_SVERKA_*` без умолчаний одной машины, env-shebang, доводы — отказ); `bin/shvy-mezhdu-paketami-watch` 819d1c46 → 0b68cc70
  (№17: `SHVY_POTREBITELI` пуст — Ш3 пропущен и назван); `bin/srez-obshchego-kataloga.sh` 27bd1cc4 → 6e2883b2 (№33: путь в node через argv;
  №9: ключи — отказ, `--help`); `bin/priznak-oblasti-podklyucheniya.sh` d66027f0 → 953e33db (№36: `LC_ALL=C.UTF-8`).
- Стенды: `stend-storozha-reestrov` 39aa509b → 42dad518 (№5: `REESTR` из `PLUGINS_REGISTRY`; №21: случай 13 — пропуск с именем);
  `stend-priznaka-oblasti` be3c2e50 → 0493e4d7 (№20: прибор из `../bin`, иначе сосед); `progon-na-podstave` aa2904ab → f3c5acfb (№5, №26:
  + `stend-uchteno-v` и новый `stend-nahodok-audita-16` fadb0bdb — 22 пробы к находкам кода); `package.json` — `scripts.test` (№28).
- Документы: `docs/SETTINGS.md` переписан по коду (№4, №10, №13, №17, №18, №22, №23, №24, №31, №32); `docs/GUARDS.md` — коды по командам
  и стенды по `test/` (№19, №21, №25, №26, №32); `docs/TROUBLESHOOTING.md` — снят раздел о коде 4 (№27); `docs/ARCHITECTURE.md` — потоки
  данных (№40); `README.md` RU и EN — баннер без номера, требования, «на другой машине», доводы, ссылки на SETTINGS/GUARDS (№1, №2, №22, №23, №40).
- Пробы: `stend-nahodok-audita-16` на `bin/` основы — 0 из 22 (все красные), на кандидате — 22 из 22; `progon-na-podstave` основа —
  зелёных 2 из 3 (стенд сторожа брал боевой реестр), кандидат — 5 из 5.
- 🔴 МЕНЯЕТ БОЙ (монтаж отдельным окном, СНАЧАЛА настройка машины, ПОТОМ файлы): `nezafiksirovano-watch` — нужен drop-in
  `Environment=NEZAF_UCHYOTY=…` (иначе СЛЕПОТА «не задан»); `preset-sverka` и `shvy-mezhdu-paketami-watch` — строки `healthcheck`
  их записей с переменными (`sudo -n env …` для shvy); `pravka` — `ruki.tsv` в `/etc/agent-registry`; `agent-plugins` — нечитаемый реестр
  теперь код 2 (сторож и прежде звал это слепотой — читатели проверены). Сторожу реестров настройка не нужна: его файл задаёт все команды.


## 2.0.11 — stend-krug-samoproverki: единое имя ключа живой машины (B-N-1929, Заря; выпуск Искра; ГОДНО Вениамина 11:3xZ)

- `test/stend-krug-samoproverki.sh` b690c91e → e7e5d166 (+3/−2, коммит Зари): `--zhivaya-mashina` — синоним `--zhivye-tajmery` (единое имя ключа фермы), отказ без ключа помечен `ОТКАЗ-ZHIVAYA-MASHINA`, шапка — маркер `# ZHIVAYA-MASHINA` с перечнем живого. Ключ у стенда был и до (--zhivye-tajmery, B-N-1859): защита не меняется, меняется имя.
- Стенд в бой не ставится (not_installed); инструмент и прочие файлы пакета не менялись — version записи реестра та же.
- Проба: без ключа основа — «ОТКАЗ: без ключа --zhivye-tajmery…», код 2; кандидат — «ОТКАЗ-ZHIVAYA-MASHINA…», код 2. С ключом не гоняла: живые registry-watchdog/apt-updates-notify/apt-daily таймеры — ручной стенд.

## 2.0.10 — uchteno_v: место записи из её path, а не из source.address (B-N-1931, Аврора; повод — Вениамин при B-N-1922; КОД ГОДЕН Вениамина 10:4xZ)

- ЗАЧЕМ: `uchteno_v_prichina` брала файл записи из `source.address`. source говорит, откуда ставится (дерево, кандидат,
  «/usr/local (git-учёт …)»), а не что стоит на машине: shvy-mezhdu-paketami-watch и nezafiksirovano-watch проходили только после
  переписывания source под проверку.
- `bin/agent-plugins` 78488493 → 9fe7b486 (+9/−5): файл записи — ПЕРВЫЙ абсолютный путь её `path`; нет пути в path — отказ с причиной,
  отката на source нет. Прежние записи с uchteno_v (первый путь path = source.address) — исход тот же.
- `test/stend-uchteno-v.sh` 499d1ae0 → 774c4829 (+9/−3): запись стенда несёт path и source; случаи 10–13 — место только в path при
  чужом source (0), нет пути в path (1), «файл, юниты …» (0), первым в path не файл (1, граница). Кандидат 13/13, 2.0.9 — 10/13
  (FAIL 10, 11, 13). Прежний стенд с новым кодом не совместим (у его записей нет path) — ставить вместе.
- Чего не ловит: у записи с несколькими файлами сверяется только первый путь path; путь, стоящий первым не файлом записи, даёт
  ложную тревогу «не в derevo.files».
- Реестр: запись dsh-reestr version 1dbc20bf → be315dcc (agent-plugins — член пакета); пять записей мест — uchteno_v: dsh-reestr
  (кандидат plugins.yaml B-N-1931 r2). Порядок монтажа: метка → инструмент → реестр.
- Остальные файлы пакета не менялись.

## 2.0.9 — дерево := бой: пакет сведён с боевой редакцией sadik, lib снят (B-N-1922, Михалыч; замысел ГОДЕН Вениамина 08:1xZ)

- ЗАЧЕМ: дерево dsh-reestr никогда не было копией боя — метка v1.0.0 несла переносимую редакцию с `lib/dsh_reestr_nastrojka.py`,
  а бой правился через smontirovat-fajly мимо дерева (B-N-1592, 1765, 1773, 1776, 1803b, 1819, 1821, 1853, 1918). Метки v2.0.3–v2.0.7
  стояли на редакции, которой в бою нет; признак «метка = бой» у пакета не выполнялся ни разу. Номер 2.0.8 занят веткой b1918-uchteno-v (не вливается).
- `bin/` = байты боя, 10 мест (sha256[:8] дерево → бой): agent-plugins 4327efa4 → 78488493 (+339/−654; B-N-1918, смонтирован 10:00Z),
  agent-plugins-lock-check 57847fbd → e6c3b928 (+24/−25), nezafiksirovano-watch 31bb0f0b → c6a945bb (+26/−90), preset-sverka 4eef8725 → 94e889f6 (+24/−76),
  registry-watchdog.sh 375444bf → 88397327 (+317/−622), shvy-mezhdu-paketami-watch 8acd2a00 → 819d1c46 (+70/−194) — из /usr/local;
  priznak-oblasti-podklyucheniya.sh a394392c → d66027f0 (+34/−82), srez-obshchego-kataloga.sh 845a9706 → 27bd1cc4 (+69/−156),
  sverka-montazha.sh fb6636f3 → c71ab743 (+21/−51), sverka-zavisimostej.sh 3c34a98f → 415871e5 (+17/−43) — из /opt/iskra/workspace/dorabotki
  (их боевое место там; перенос в /usr/local — отдельная правка боя, не этот выпуск).
- `lib/dsh_reestr_nastrojka.py` снят (−122; бой его не грузит) и `files` package.json без lib; `test/stend-nastrojki.sh` снят вместе с ним (−94).
- `test/`: stend-pravki-reestra c7949553 → e03fadf4 (+88/−186), stend-storozha-reestrov 7bd49ffd → 39aa509b (+46/−152),
  stend-priznaka-oblasti 60d32f53 → be3c2e50 (+13/−26) — боевые двойники из dorabotki;
  stend-krug-samoproverki 3d16fe43 → b690c91e (+3/−10) — НЕ боевой двойник: редакция дерева (B-N-1859 Зари: без --zhivye-tajmery отказ код 2,
  ловушка возврата таймеров) минус обращения к lib; REESTR/STARYJ — умолчания боя. Боевой 0b479496 СТАРЕЕ дерева, ключа нет (инцидент
  10:14Z: ворота на кандидате прогнали его и тронули живые таймеры; последствий нет — сверено Забавой и Вениамином).
  НАПРАВЛЕНИЕ (какая редакция новее поведением): storozha — бой (B-N-1819/1874 после v1.0.2); krug — дерево (B-N-1859); pravki — бой,
  кроме проверки «нет sudo → СЛЕПОТА» из v1.0.2 дерева (потеряна, назван находкой); priznak — дерево только перенос v1.0.0, бой не старее.
  `progon-na-podstave.sh` deca6c62 → aa2904ab (+11/−13): без lib, реестры подаются PLUGINS_REGISTRY/AGENTS_REGISTRY, priznak — с PRIBOR из bin/ пакета,
  stend-nastrojki из прогона снят.
- НОВЫЙ `test/stend-uchteno-v.sh` 499d1ae0 (Искра, B-N-1918; из её ветки b1918-uchteno-v 8ce59c9e): 9 случаев учёта через пакетную запись
  (uchteno_v), включая «путь лишь префиксом в installed_check» (целый токен). Из дерева (AP = ../bin/agent-plugins пакета) — ok=9, код 0;
  контроль на прежнем bin/agent-plugins дерева 4327efa4 — ok=0, код 1 (стенд видит предмет).
- README, docs/SETTINGS.md, docs/TROUBLESHOOTING.md — пометка сверху (+3 каждый): «2.0.9 = боевая редакция, файла настройки нет; разделы о нём —
  переносимая редакция ≤ 2.0.7». Переносимость возвращается отдельным пунктом перед публикацией, выводя её ИЗ боя.
- Признак закрытия (условие Вениамина): sha256 каждого из 10 мест боя = файлу дерева метки — 10 из 10; ворота «по местам» — выпуск = бой; verify rc 0.
- Чего не ловит: правку боя мимо дерева после метки (запрет «мимо дерева» в smontirovat-fajly — отдельный пункт (д)); метку, поставленную не воротами
  (B-N-1923); 4 места dorabotki учитывает nashi-dorabotki, а не учёт /usr/local.

## 2.0.7 — stend-krug-samoproverki: без ключа — отказ, живые таймеры возвращаются ловушкой (B-N-1859, Заря)

- `test/stend-krug-samoproverki.sh` b4a8a294 → 3d16fe43 (+62/−1): доводы `--zhivye-tajmery` (обязателен) и `--okno`; без ключа —
  ОТКАЗ код 2, первой строкой перечень того, что стенд тронул бы (stop/start registry-watchdog.timer, apt-updates-notify.timer,
  apt-daily.timer; unmask→start→stop apt-daily-upgrade.timer; с `--okno` — drop-in registry-watchdog.timer.d/99-VREMENNO-stend.conf
  и daemon-reload). Незнакомый довод — отказ. Ловушка на ЛЮБОМ выходе: таймер был active и стал нет → start; drop-in `--okno` убирается.
- Пробы (Заря, подложные sudo/systemctl): настоящих `sudo … systemctl` от zarya за прогон — 0. Ворота Вениамина — ГОДНО 15:3xZ.
  Проверка Искры 08.10 ~16:0xZ: без ключа — отказ, код 2, перечень первой строкой; `progon-na-podstave` — 4 из 4 (krug вне счёта).
- 🔴 Граница (Вениамин): ветка ловушки для `--okno` пробой НЕ пройдена — без `--okno` drop-in нет, а с ним стенд пишет в настоящий /etc
  (подложный sudo отказывает); проверено только чтением кода. Первый живой прогон с `--okno` — с проверкой «drop-in нет» после выхода:
  `test ! -e /etc/systemd/system/registry-watchdog.timer.d/99-VREMENNO-stend.conf`.
- Чего не ловит: SIGKILL (ловушки не бывает) — таймеры разделов B/C/E и drop-in тогда возвращают строки «вернуть» в выводе, рукой;
  `is-enabled` — только сверка, не возврат.

## 2.0.6 — прогон стендов на подставной настройке (B-N-1856, Заря)

- НОВЫЙ `test/progon-na-podstave.sh` deca6c62 (0755, +79): строит временный корень (реестр-образец, реестр агентов без мест,
  dsh-reestr.conf) и зовёт стенды на инструментах ЭТОГО пакета через переменные, которые пакет уже читает. Зачем: там, где пакет
  не установлен (sadik), 3 из 5 стендов на v2.0.5 не судили (krug 0/11, pravki и storozha — СЛЕПОТА «нет /etc/dsh-reestr/plugins.yaml»).
  Прогон: `bash test/progon-na-podstave.sh` из каталога пакета → «зелёных 4 из 4» (Искра 08.10 ~15:4xZ, код 0; подстава убрана).
- Код стендов и инструментов не менялся. `stend-krug-samoproverki` в прогон не входит (трогает живые таймеры и маску
  apt-daily-upgrade — ручной, вне счёта); отказ его кода — отдельный пункт B-N-1859.
- Чего не ловит: поведение инструментов на настоящем реестре машины (образец — одна запись); учёт (DORABOTKI_CMD) — storozha
  сам называет пропуск случая 13; `agent-registry verify` подменён `true`; сосед сторожа выключен (PEER_ENABLED=0).

## 2.0.5 — agent-plugins verify: обратная сверка мест агентов → записи (B-N-1853, Аврора)

- `bin/agent-plugins` ecb24cdd → 4327efa4 (+93/−0): обратная сверка — места агентов из реестра агентов против записей plugins;
  путь реестра агентов — окружение `AGENTS_REGISTRY`, иначе `_konf("AGENTS_REGISTRY", /etc/agent-registry/agents.yaml)`
  (переносимая редакция: путей машины в коде нет). Нет реестра агентов — «НЕ ПРОВЕРЕНО», код 1, как прочие слепоты дерева.
- `docs/SETTINGS.md` +1 строка: ключ `AGENTS_REGISTRY`.
- Машинная редакция `/usr/local/bin/agent-plugins` (27379304) выпускается отдельно; дерево и бой этого файла различаются намеренно (_konf).
- `package.json` 2.0.2 → 2.0.5: номер в package.json отставал от CHANGELOG/меток (2.0.3, 2.0.4) — выровнен этим выпуском.

## 2.0.4 — agent-plugins: путь с описанием не «отсутствует» (B-N-1821); nezafiksirovano-watch: git от владельца, пустой перечень — слепота (B-N-1803)

- `bin/agent-plugins` (+30/−11): функция nalichie_puti — побайтно с боевой sadik 52b162d4 (B-N-1821 r1+r2, Заря; ворота Вениамина 05:34Z/05:40Z):
  path «путь; описание» / «путь — описание» больше не даёт ложного «ПАКЕТ ОТСУТСТВУЕТ» (healthcheck не звался вовсе). Сначала вся строка, затем
  префиксы до пробелов; нет прав — «не знаю»; ENAMETOOLONG/ENOTDIR — «нет». Проба на подставном реестре (3 записи: «; », « — », несуществующий):
  2.0.3 — 3 «отсутствует», 2.0.4 — 1 (верное).
- `bin/nezafiksirovano-watch` (+19/−2): поведение боевой r2 c6a945bb (принята 08.10) в переносимой редакции, перечень учётов — по-прежнему из
  настройки пакета: git учёта, чей корень не root, — от владельца корня (без safe.directory; не узнать владельца — слепота учёта); пустой перечень
  (NEZAF_UCHYOTY="") — СЛЕПОТА код 2. Пробы (root без SUDO_*, копия учёта владельца iskra с core.fsmonitor «id -u»): 2.0.3 — слепота «не
  git-учёт» (dubious ownership), пустой перечень — «чисто 0 из 0» код 0; 2.0.4 — код 0, git от uid 996; пустой перечень — код 2.
  Расхождение дерево ≠ бой остаётся НАМЕРЕННЫМ в одном: боевая редакция держит перечень учётов sadik в коде, переносимая — в настройке.

## 2.0.3 — nezafiksirovano-watch: описание перечня учётов приведено к коду (B-N-1803, Заря) · description matches the code

- `bin/nezafiksirovano-watch` 97613f03 → d654260e (4 строки описания RU+EN, код побайтно тот же): «по умолчанию четыре учёта машины» —
  неверно для пакета; верно: NEZAF_UCHYOTY — окружение, иначе настройка пакета, иначе три обобщённых (/usr/local, /etc/dsh-reestr, /etc/systemd/system).
- Бой sadik (`/usr/local/sbin/nezafiksirovano-watch` 2e2a830f, перечень пяти учётов в коде) — машинная редакция, не этот пакет; монтажа нет.
  Запись реестра (source/channel) — правка Зари 6eb0ccc7. Находка класса (не правится здесь): так же расходятся все 6 команд dsh-reestr на sadik.

## 2.0.2 — перенумерация (A-N-1562): прежний 1.0.2, код не менялся · renumbering, code unchanged

## 1.0.2 — 2026-10-04

- Стенды `stend-pravki-reestra` и `stend-storozha-reestrov` берут путь реестра правилом пакета `dsh_reestr_nastrojka.py --reestr`, а не ключевым режимом: прежде они не видели `PLUGINS_REGISTRY` и были слепы там, где инструменты пакета реестр видят. Код команд не менялся. · Both registry stands take the registry path from the package rule `--reestr`; they used to ignore `PLUGINS_REGISTRY`. Command code unchanged.

## 1.0.1 — 2026-10-04

Стенды, которые меряют через `sudo`, без него говорят «СЛЕПОТА: нет sudo» с кодом 2, а не дают ложное красное.
Stands that measure through `sudo` now say "BLIND: no sudo" with exit 2 without it, instead of a false red.

- `test/stend-krug-samoproverki.sh`, `test/stend-pravki-reestra.sh` — проверка `sudo -n true` первой исполняемой строкой; в оболочке агента (bwrap, NoNewPrivs) `sudo` отказывает, и первый стенд давал 11 ложных FAIL, второй — слепоту без названной причины · a `sudo -n true` check as the first executable line; in an agent shell (bwrap, NoNewPrivs) `sudo` refuses, and the first stand gave 11 false FAILs, the second a blindness with no named cause.
- Код команд не менялся · Command code is unchanged.

## 1.0.0 — 2026-10-04

Первый выпуск пакетом. Десять команд реестра вмешательств и пять стендов перенесены с работающей машины, где они служили отдельными скриптами; код — как в работе, комментарии переписаны парами RU/EN и обезличены, частные пути вынесены в файл настройки с нейтральными умолчаниями.
First release as a package. Ten registry commands and five stands were moved from a production host where they ran as standalone scripts; the code is as in production, comments were rewritten as RU/EN pairs and anonymized, private paths moved to a settings file with neutral defaults.

- `agent-plugins` — list · check · verify · diff · pravka; `--help` теперь двуязычный (печатает докстринг модуля) · `--help` is now bilingual (prints the module docstring).
- `agent-plugins-lock-check` — справка `--help` двуязычная по той же причине · `--help` is bilingual for the same reason.
- Настройка — одним правилом `lib/dsh_reestr_nastrojka.py` (файл `/etc/dsh-reestr/dsh-reestr.conf`, действует под `sudo`); нет реестра — отказ, код 2, с причиной; пустой реестр не создаётся · Settings come from one rule, `lib/dsh_reestr_nastrojka.py` (file `/etc/dsh-reestr/dsh-reestr.conf`, works under `sudo`); no registry — refusal, exit 2, with the reason; no empty registry is created.
- `registry-watchdog`, `nezafiksirovano-watch`, `shvy-mezhdu-paketami-watch`, `preset-sverka`, `sverka-montazha`, `sverka-zavisimostej`, `priznak-oblasti-podklyucheniya`, `srez-obshchego-kataloga`.
- Файл настройки: комментарий — только с начала строки. Значение с « #» (`KEY=знач # пояснение`) — громкий отказ с ключом, код 2, во всех командах; Bash-скрипты проверяют весь файл до работы (`--proverit`), а не получают пустое значение из `$(konf)` · Settings file: a comment only at the start of a line. A value containing " #" (`KEY=value # note`) is a loud refusal naming the key, exit 2, in every command; Bash scripts check the whole file before work (`--proverit`) instead of getting an empty `$(konf)` value.
- `nezafiksirovano-watch`: если общего файла настройки пакета нет, сторож говорит это в канал (как `trevoga()`) и выходит кодом 4 (канал не принял — 3), а не 2: юнит считает 1 и 2 успехом, и слепота прошла бы молча · if the package's shared settings file is missing, the watchdog says so to the channel (like `trevoga()`) and exits with 4 (channel refused — 3) instead of 2: the unit treats 1 and 2 as success, so the blindness would have passed silently.
