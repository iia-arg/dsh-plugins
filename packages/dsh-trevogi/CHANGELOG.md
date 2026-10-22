# История · Changelog

## 3.1.10 — 20.10.2026 · постоянные хозяева и строгие гости · owners and strict guests

- Уточнение наряда Забавы15:17Z заменяет первоначальный кандидат3.1.10: хозяева из прежнего CHAT_FILE и нового OWNER_CHAT_ID получают тревогу всегда, прежде чтения гостей. Кандидат настроек sadik входит в поставку, персональный номер не в коде. · Owners are independent of the guest file.
- Гостевой SPISOK_FILE default /var/lib/alert-privratnik/spisok: весь файл строго ^-?[0-9]{5,15}$, без ссылок, только uid0/StateDirectory owner. Любой отказ — ноль гостей и отдельная тревога всем хозяевам. Нет файла — штатно только хозяева. · Atomic validation and a separate owner notification.
- Итог принадлежит хозяевам; гостевой отказ только журналируется по адресу. Квота прежнего worker по входным тревогам не зависит от числа сообщений; стенд с3гостями использует настоящий worker. · Delivery outcome and quota remain alert-based.

## 3.1.9 — 16.10.2026 · защищённые имена песочницы Codex в верху спула · Codex sandbox protected names at the spool top (Заря; B-N-2086, наряд Забавы 21:33:10Z)

- `systemd/dsh-trevogi-spul.tmpfiles`: четыре пустых каталога `/var/spool/dsh-trevogi/{.git,.codex,.agents,.aws}` 0755 root:root. Песочница Codex 0.162.1 (bwrap) в каждом корне `writable_roots` монтирует эти имена только-чтением и при отсутствии создаёт их сама; в верху спула (root 755) не может — окно B-N-2086 16.10 21:12Z: «`bwrap: Can't mkdir /var/spool/dsh-trevogi/.git: Permission denied`», ни одна команда vintik не стартовала, откат. Константа номера — 3.1.9. · Four empty root-owned directories so a Codex sandbox with the spool as a writable root can start.
- Чего не ловит: новая версия Codex с пятым защищённым именем — снова «Can't mkdir <имя>» на каждой команде пятерых (громко); список имён из бинаря не вынимается, только пробой `codex sandbox` на модели спула. Каталоги заводит только `systemd-tmpfiles --create`; снесённые рукой вернутся при загрузке, не раньше. · Not caught: a future protected name; manual removal until next tmpfiles run.

## 3.1.8 — 15.10.2026 · хвост учётки на клиентском пути · account tail on the client path (Аврора; наряд Забавы 23:06:39Z, развилка (а) КВИТАНЦИИ-СЖАТИЯ)

- `bin/agent-alert`: ветка клиента (спул) выходила до записи хвоста — у агентов спула «прочти свой хвост» (п.13 правил команды Мастера, TREVOGI-HVOST) было мертво, у Мастера уже 15.10. Теперь после итога отправителя клиент дописывает строку `исход=доставлено(спул)` или `не-доставлено(спул,код-N)` — только в хвост, заданный окружением процесса (`AGENT_ALERT_HVOST` до слияния с config): хвост из config общий, его пишет root-отправитель, иначе строка в нём задвоится. `zapisat_hvost` перенесена выше ветки клиента без изменений. Код выхода прежний. · The client path now appends to an environment-set account tail after the sender result; exit codes unchanged.
- `test/stend-sposob2.py`: K15, K15б, K15в и порчи 20–21 (30 проб); основа 3.1.7 — 28 из 30, красны K15 и K15в. · New checks and corruptions.
- README, SETTINGS: граница — оборванный зовущим клиент (сток сторожа памяти ждёт 5 с) строки в хвост не пишет, тревога из спула уходит. · Docs: limits.

## 3.1.7 — 15.10.2026 · без байт-кода в /usr/local · no bytecode in /usr/local (Аврора; B-N-2067, наряд Забавы 05:28:02Z)

- `bin/agent-alert-otpravitel`, `bin/otkaz-klyuch-watch`: `sys.dont_write_bytecode = True` до импорта `nastrojki`. В бою появился `/usr/local/lib/dsh-trevogi/__pycache__/nastrojki.cpython-312.pyc` (15.10 00:43:16Z) — ровно в секунду `sudo /usr/local/sbin/agent-alert-otpravitel --help` (журнал sudo): шебанг `python3` без `-B`, импорт до разбора доводов. Юниты так не писали (`-I -B` у отправителя и сторожа очереди; `otkaz-klyuch-watch` — под `ProtectSystem=full`). Константа номера — 3.1.7. · Python utilities never write bytecode; a manual root run left `__pycache__` in production.
- `test/stend-agent-alert.sh`: раздел 9, 2 проверки (45, под root 44) — запуск копий по шебангу с `--help` без `PYTHONDONTWRITEBYTECODE`: импорт состоялся, pyc нет; основа 3.1.6 — обе красные. · Section 9, 2 checks.

## 3.1.6 — 15.10.2026 · номер в журнале и отказы клиентского пути · journal version and client-path refusals (Аврора; info Вениамина 05:05Z, наряд Забавы 05:07:21Z)

- `lib/dsh-trevogi/nastrojki.py`: константа `VERSIYA = '3.1.6'` — номер для строк журнала всех утилит; `bin/agent-alert` (проба и исход отправки, функция `zhurnal`), `bin/agent-alert-hvost-obrezka` читают её `sed`, без исполнения; `bin/otkaz-klyuch-watch` — отдельным импортом с запасным «неизвестна» (старый читатель не роняет сторожа). Был литерал «версия=3.1.1» в четырёх местах при пакете 3.1.5. `package.json` в бой не ставится — потому константа в читателе. · Single `VERSIYA` constant replaces the 3.1.1 literal in journal lines.
- `lib/dsh-trevogi/klient.py`: `otkaz` — итог не читается (прежде немо, код 1) и ненулевой код отправителя спула (65/66/69 прежде видны лишь под тегом `agent-alert-otpravitel`) пишут «`исход=итог-не-читается|отказ-отправителя учётка=… ЮНИТ=… путь=спул файл=<имя>.msg <причина>`» в журнал `agent-alert`; код и сообщение прежние; без 🔴 — сторож очереди их не берёт. · Client-path refusals now leave an agent-alert journal line.
- `test/stend-agent-alert.sh`: раздел 8, 3 проверки (43, под root 42). `test/stend-sposob2.py`: K3б, K14, K14б и порчи 18–19 (27 проб). · New checks and corruptions.

## 3.1.5 — 15.10.2026 · строка журнала у каждого отказа · a journal line for every refusal (Аврора; B-N-2064, «да» Забавы 04:53:18Z)

- `bin/agent-alert`: функция `otkaz` — шесть выходов без строки журнала (пустое сообщение, негодная `DSH_PROBA`, отказ читателя настроек, нет токена или чата, plain не подготовлен, ни html, ни plain) пишут «`исход=<причина> учётка=… ЮНИТ=… звал=…(PPID) <причина>`» в журнал `agent-alert`; код и поток сообщения прежние, текст тревоги в строку не попадает. Недоставка недельного обхода 14.10 02:12Z не оставила ни строки: зовущий гасил вывод в `/dev/null`. · Six silent refusal exits now leave a journal line with the reason; exit codes and output streams are unchanged.
- `test/stend-agent-alert.sh`: раздел 7, 9 проверок (40, под root 39); основа 3.1.4 и порча «otkaz без logger» — 33 из 40, красны ровно 7 новых. · Section 7, 9 checks.
- README/GUARDS: «код 0 у `--proverit-nastrojku` ≠ path-юнит проверен» (LOW Вениамина к 3.1.4) и граница строки отказа (нет `logger` — строки нет; не позванный вызов — тоже). · Docs: exit 0 ≠ path unit verified; limits of the refusal line.

## 3.1.4 — 15.10.2026 · хвосты способа 2 · method 2 follow-ups (Аврора; B-N-2055, письмо Забавы 01:03:23Z)

- `lib/dsh-trevogi/klient.py`: `--proverit-nastrojku` различает «не взведён» и «не вижу». «Не взведён» (код 2) — только если `systemctl is-active` назвал состояние и оно не `active`; пустой ответ — «ОТСЮДА НЕ ВИДНО» с причиной, код 0. Из песочницы `DynamicUser` (`apt-updates-notify`) `systemctl` отвечает «Transport endpoint is not connected», код 1, stdout пуст — прежде это давало ложный отказ, хотя отправка проходила. · The settings probe tells «not armed» from «not visible from here» (DynamicUser sandbox).
- `test/stend-vsplesk.py`: маркер `# ZHIVAYA-MASHINA:` и ключ `--zhivaya-mashina` первым доводом; без него — «ОТКАЗ-ZHIVAYA-MASHINA», код 2, ничего не тронуто (находка С1 Искры). · Live-machine marker and key.
- `test/stend-sposob2.py`: проба K11в (systemctl без ответа → «НЕ ВИДНО», код 0) и порча 17; 24 пробы. · Probe K11в and corruption 17.

## 3.1.3 — 15.10.2026 · способ 2: тревога без доступа к токену · method 2: alerts without token access (Аврора; B-N-2055, замысел r4 e634eeca, ворота Вениамина 01:47/02:18 МСК)

- `bin/agent-alert`: учётка не-root без чтения токена (или ключ пробы `AGENT_ALERT_CHEREZ_SPUL=1`, иное — отказ 2) идёт клиентским путём — спул и ожидание итога (`lib/dsh-trevogi/klient.py`); root без ключа — прямой путь, как прежде. `--proverit-nastrojku` проверяет спул настоящей записью и path-юнит. Превью ссылок выключено всегда (`disable_web_page_preview=true`). · Non-root accounts without token access use the client path (spool + result wait); root keeps the direct path; link previews are always disabled.
- `bin/agent-alert-otpravitel` (новый, root): разбор спула — rename в закрытый `work/`, обычный файл с одной ссылкой, учётка по `fstat`, квота по учётке, фильтр HTML для не-root, префикс «✉ <учётка>», отправка прямым путём, итог владельцу 0600; `--storozh` — очередь стоит / path-юнит погашен / отправители без пути и итога → тревога прямым путём; новый набор бед — сразу, тот же — не чаще раза в 6 ч, одно «восстановлено», отметка `work/storozh.otmetka.json` только при доставке (LOW-1 Вениамина 02:39 МСК); строки журнала — только отказы клиента с начала сообщения (иначе доставка самой тревоги сторожа читалась им как отказ — самоподпитка), ключ беды по учётке `zhurnal:<учётка>` (LOW 02:54); строка считается, только если `_UID` записи (`-o json`) = uid учётки, неразрешимое имя — только от uid DynamicUser (LOW 03:08); в начале разбора `work/*.msg` старше 1 ч → итог 75 «прерван» и удалить (LOW-2). · New root sender and queue watcher (repeat limit 6 h, one recovery notice; stale work files get result 75).
- `lib/dsh-trevogi/nastrojki.py`: ключи `AGENT_ALERT_SPUL` (`/var/spool/dsh-trevogi`), `AGENT_ALERT_ITOG_ZHDAT` (120, 1..600), `AGENT_ALERT_KVOTA_10MIN` (10), `AGENT_ALERT_KVOTA_SUTKI` (60).
- `systemd/agent-alert-otpravitel.service`: `StartLimitIntervalSec=10s`, `StartLimitBurst=100` в `[Unit]` — умолчание 5 за 10 с пробил всплеск проб окна 15.10 00:36:13Z, path-юнит погас (`unit-start-limit-hit`); `klient.py`: проба `--proverit-nastrojku` убирает свою `.chk` из `vhod/` сама; `test/stend-vsplesk.py` — живой стенд всплеска (root, вручную). · Service start limit raised (default killed the path unit on a burst); the settings probe removes its own `.chk`; live burst stand.
- `systemd/`: `agent-alert-otpravitel.path`/`.service`, `agent-alert-storozh-ocheredi.service`/`.timer`, `dsh-trevogi-spul.tmpfiles`.
- `test/stend-sposob2.py` (новый, только root): 23 пробы, порчи 1–6 замысла и 7–16 по LOW ключом `--porcha N`, каждая краснит свою пробу; в `vse-stendy.sh` — не от root это слепота (2).

## 3.1.2 — 14.10.2026 · подготовка к публикации · release prep (Аврора, наряд Забавы 07:18Z)

- `engines.node` ">=18" — кода на Node в пакете нет (bash/python), это граница установки через npm, а не проверенная среда кода · `engines.node` ">=18" — no Node code in the package (bash/python); the bound is for npm installation, not a tested code runtime
- README: строка «Версия · Version: 3.1.2» под заголовком. · README: version line under the heading.
- Код не менялся; номер 3.1.1 → 3.1.2 по правилу владельца 10.10 16:33 (правка package.json/README ⇒ +1). · Code unchanged; version bump for metadata/README edits.

## 3.1.1 — 13.10.2026 · A-N-1948, модуль №9

HTML закрывается стеком, включая расширенные теги. Сетевые ошибки, 5xx/429 и
не-JSON повторяются ограниченно; retry_after 0..300 с, default3/max10 попыток.
Обрезка проверяет чтение/счёт и сохраняет пустые строки/inode; '=' в пути сохраняется.
Сторож пишет курсор атомарно, фиксирует попытку до канала, не повторяет неизвестную
доставку; подтверждённую отправку завершает восстановлением курсора без отправки.
Ошибки дают СЛЕПОТА2 без трассировки; help0 отдельно, journal доступ только root/adm/
systemd-journal. Проверка настройки отвергает world-readable token. Юниты явно root
с минимальными ограничениями. RU/EN договор, исходы, установка и пробы обновлены.

Результат подготовки на копиях; монтаж и живые признаки — назначенной рукой.

## 2.0.2 — agent-alert: метка источника по положительному признаку (B-N-1830; перенос боя в дерево B-N-1872, Аврора) · source tag by positive sign

Метка источника тревоги — по положительному признаку (B-N-1830, Михалыч; в бою sadik с 08.10 09:29:24Z, в дерево перенесено побайтно, B-N-1872): таймер — без метки; служба без таймера — «служба <юнит>»; `cron.service` — «по cron»; «ПОЗВАНО РУКОЙ» — только `session-*.scope`; прочее — «источник не установлен (<хвост cgroup>)». Было: всё, что не таймер, — «ПОЗВАНО РУКОЙ», и служба агента получала ложную метку. Отправка, настройка и ключи не изменились. Стенды пакета метку не проверяют.

Alert source tag is based on a positive sign (B-N-1830): timer — no tag; service without a timer — “служба <unit>”; `cron.service` — “по cron”; “ПОЗВАНО РУКОЙ” (called by hand) — only `session-*.scope`; anything else — “источник не установлен (<cgroup tail>)”. Previously everything that was not a timer was tagged as called by hand, so an agent service got a false tag. Sending, settings and options are unchanged. Package tests do not check the tag.

## 2.0.1 — перенумерация (A-N-1562): прежний 1.0.1, код не менялся · renumbering, code unchanged

## 1.0.1

Новый режим `agent-alert --proverit-nastrojku`: настройка разрешается тем же читателем, файлы токена и чата проверяются на наличие, читаемость текущей учёткой и непустую первую строку; все причины разом, код 0 — годна, 2 — нет. Сеть, журнал и хвост не трогаются, значения не печатаются. Отправка и прочие ключи не изменились. Стенд отправщика: 31 проверка вместо 21.

Проба с меткой `DSH_PROBA=1` пишет в журнал и первые 120 знаков текста (`исход=проба, не отправлено текст[0:120]=…`, перевод строки → ⏎): видно, что именно не отправлено. Молчание — только по явной метке 1, без метки отправка прежняя. Новые пробы: текст пробы в журнале (с порчей) и «нет файла чата» в проверке настройки.

New `agent-alert --proverit-nastrojku` mode: settings are resolved by the same reader; token and chat files are checked for existence, readability by the current account and a non-empty first line; every reason is reported, exit 0 — usable, 2 — not. Network, journal and tail stay untouched and values are not printed. Sending and other options are unchanged. Sender test: 31 checks instead of 21.

A probe with `DSH_PROBA=1` also writes the first 120 characters of the text to the journal (`исход=проба, не отправлено текст[0:120]=…`, newline → ⏎), showing what was not sent. Silence only with the explicit mark 1; without it sending is unchanged. New tests: probe text in the journal (with a mutation) and “missing chat file” in the configuration check.

## 1.0.0

Первый состав исходников: общий отправщик, обрезка хвоста, читатель отказов и их юниты/стенды. Добавлены метка пробы отправщика, общий config путей с приоритетом env, нейтральные умолчания и очистка ответа curl от прочитанного токена. Исполняемое поведение прежнего отправщика сохранено без метки и при сохранённых путях; неизвестный ввод обрезки теперь даёт отказ.

First source package: shared sender, tail trimmer, refusal reader and their units/tests. Adds the sender probe mark, shared path configuration with environment precedence, neutral defaults and curl-response redaction of the loaded token. Existing sender behavior is retained without the mark and with preserved paths; unexpected trimmer input now fails.

Комментарии и документация обезличены, ключевые якоря HTML сохранены. Стенды включают config, курсор, обрезку, подставной канал и различающие порчи. Живую доставку они не проверяют.

Comments and documentation are anonymized; key HTML anchors remain. Tests cover configuration, cursor, trimming, a substituted channel and distinguishing mutations. They do not test live delivery.
