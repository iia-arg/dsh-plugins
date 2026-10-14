# Сторожа и проверки omega-memory · omega-memory guards and checks

**Своего сторожа у пакета нет.** Ни таймера, ни скрипта наблюдения, ни канала тревоги пакет не ставит. Единственный автоматический механизм пакета — `Restart=on-failure` в юните. Сторожами служат пять проверок приёмки ниже: их запускает человек или агент-исполнитель после установки и после любых изменений; сами по себе они не повторяются и никуда не кричат.

**The package has no watchdog of its own.** It installs no timer, no monitoring script and no alert channel. The only automatic mechanism in the package is `Restart=on-failure` in the unit. The five acceptance checks below act as guards: a person or an executor agent runs them after install and after any change; they do not repeat on their own and alert no one.

Если нужно постоянное наблюдение, заведите его отдельно и сразу решите три вещи: кто его вызывает, кто читает исход и когда оно останавливается. Проверка, которую никто не вызывает, защитой не является.

If you need continuous monitoring, set it up separately and decide three things up front: who calls it, who reads the outcome and when it stops. A check nobody calls is not a guard.

## Автоматическое: `Restart=on-failure` · Automatic: `Restart=on-failure`

**Ловит:** падение процесса с ненулевым кодом, гибель от сигнала, таймаут — служба перезапускается через 5 секунд.

**Catches:** a process crash with a non-zero code, death by signal, timeout — the service restarts after 5 seconds.

**Не ловит:** чистый выход с кодом 0 (в проверенной версии движка так выходит его сторож памяти при превышении `OMEGA_RSS_LIMIT_MB`, а при включённом простое — и сторож простоя); автоматический предел числа попыток здесь не задан: с RestartSec=5 обычный StartLimit5/10с недостижим и постоянная ошибка может повторяться без конца; работу на псевдо-эмбеддингах; ошибки ключа доступа.

**Does not catch:** a clean exit with code 0 (in the engine version we checked, its memory watchdog exits that way when `OMEGA_RSS_LIMIT_MB` is exceeded, and so does the idle watchdog when enabled); no retry-count bound is configured: RestartSec=5 does not reach an ordinary5/10s StartLimit, so persistent errors may retry indefinitely; running on pseudo-embeddings; access key errors.

## Ожидания готовности нет · No readiness wait

В юните нет `ExecStartPost=`: ни ожидания `/health` после старта, ни правки прав базы. При `Type=simple` `systemctl start` и `is-active` возвращают успех сразу после запуска процесса — это не значит, что порт уже слушается. Готовность проверяет только проверка 2 ниже, и её запускает человек.

The unit has no `ExecStartPost=`: no wait for `/health` after start and no fix of database permissions. With `Type=simple`, `systemctl start` and `is-active` succeed right after the process is launched — that does not mean the port is listening yet. Readiness is checked only by check 2 below, run by a person.

## Проверки приёмки · Acceptance checks

| № | Проверка · Check | Команда · Command | Ловит · Catches | НЕ ловит · Does NOT catch |
|---|---|---|---|---|
| 1 | Служба активна и включена · Service active and enabled | `systemctl is-active omega-memory; systemctl is-enabled omega-memory` | служба не запущена; не переживёт перезагрузку (`is-enabled` ≠ `enabled`) · service not running; will not survive reboot (`is-enabled` ≠ `enabled`) | что порт слушается, что модель настоящая, что агент видит инструменты · port listening, model real, agent seeing the tools |
| 2 | Жив `/health` · `/health` answers | `curl -s http://127.0.0.1:8377/health` | процесс жив и слушает порт; ответ показывает `transport` · process alive and listening; reply shows `transport` | ключ (`/health` отвечает без ключа), модель, базу, строку набора агента — доказывает только, что процесс жив · the key (`/health` answers without a key), model, DB, the preset row — it only proves a process is alive |
| 3 | Круг «запись → поиск» из инструментов агента · Store → search round trip from agent tools | в новой сессии агента: записать пробную запись, найти её поиском другими словами · in a new agent session: store a test record, find it by a search in other words | строка не в том слое, сессия старше правки, внешний движок без подключения, 401 из-за ключа, не тот порт, неработающая база · row in the wrong layer, session older than the edit, external engine not wired, 401 due to key, wrong port, broken DB | права и учётку службы; при поиске теми же словами — псевдо-эмбеддинги (точное совпадение находится и без смысла) · service account and permissions; with a same-words search — pseudo-embeddings (an exact match is found without meaning) |
| 4 | Служба под служебной учёткой · Service runs as the service account | `systemctl show omega-memory -p User` → `User=omega` | служба под учёткой агента, база в его доме · service under an agent's account, DB in its home | права файлов базы, доступ других агентов по сети · DB file modes, other agents' network access |
| 4а | Группа на месте · Group in place | `getent group omega-users`; `systemctl show omega-memory -p SupplementaryGroups -p UMask` → `omega-users`, `0077` | группы нет (служба не стартует, `216/GROUP`); живая служба запущена без группы или маски из юнита (drop-in перебил, `daemon-reload` не сделан) · group missing (service fails, `216/GROUP`); live service runs without the unit's group or mask (overridden by a drop-in, no `daemon-reload`) | группу и setgid каталога данных; что база закрыта для группы (так и должно быть: `600`) · group owner and setgid of the data directory; that the DB is closed to the group (as it should be: `600`) |
| 4б | Группы юнита есть до запуска · Unit groups exist before start | до установки · before install: `sudo sh bin/proverit-ustanovku.sh /etc/systemd/system/omega-memory.service` (файл и вставки · file and drop-ins); после · after: `sh bin/proverit-ustanovku.sh omega-memory.service` (итог systemd · systemd's result) → код 0 · exit 0 | нет группы из `Group=`/`SupplementaryGroups=` — отказ с её именем, код 1, до `enable` · a missing `Group=`/`SupplementaryGroups=` group — refusal naming it, exit 1, before `enable` | учётку `User=`, каталог данных и setgid, членство агентов в группе · the `User=` account, data directory and setgid, agents' group membership |
| 5 | bge-m3/1024 без hash · bge-m3/1024 without hash | omega_store → omega_query другими словами, найденный ID и отсутствие degraded; при скрытом инструменте omega_call · store→other-words query, found ID and no degraded; use omega_call when tools/list hides query | деградация/неправильная модель · degraded or wrong model | размер вектора1024 сам по себе не отличает hash; doctor1.5.20 ищет штатную bge-small · dimension1024 alone cannot rule out hash; doctor1.5.20 inspects default bge-small |

Doctor штатной модели не принимает установленную bge-m3. Сверьте Environment=OMEGA_EMBEDDING_* из unit+drop-in и реальный семантический круг; изменение окружения без подъёма процесса не применяется.

Default-model doctor does not accept the installed bge-m3. Check the unit/drop-in OMEGA_EMBEDDING_* settings and actual semantic round trip; an environment change needs a process restart.

Стенд проверки 4б — `bash test/stend-gruppy.sh` (9 проб на подставных юнитах, root не нужен): юнит пакета разобран; группы есть → 0; нет группы → 1 с именем и `216/GROUP`; юнит не прочитан → 2; групп в юните нет → 2; группа только во вставке и её нет → 1; пустое `SupplementaryGroups=` во вставке сбрасывает список → 0; нечитаемая вставка → 2 (не под root); имя незагруженного юнита → 2.

The 4b check stand is `bash test/stend-gruppy.sh` (9 probes on fake units, no root needed): the package unit is parsed; groups exist → 0; missing group → 1 naming it and `216/GROUP`; unreadable unit → 2; no groups in the unit → 2; a group only in a drop-in and missing → 1; an empty `SupplementaryGroups=` in a drop-in resets the list → 0; an unreadable drop-in → 2 (not as root); the name of an unloaded unit → 2.

## Как читать исход · How to read the outcome

В проверке 3 пробная запись должна быть новым текстом: повтор прежней пробы склеится по `OMEGA_DEDUP_THRESHOLDS`, и вернётся id старой записи — круг покажет зелёное, хотя новая запись не сохранялась.

In check 3 the test record must be new text: a repeat of an earlier test collapses under `OMEGA_DEDUP_THRESHOLDS` and the old record's id comes back — the round trip shows green though no new record was saved.

Зелёные 1, 2 и 4 при красной 3 — служба жива, но до агента не доходит: смотрите [TROUBLESHOOTING.md](TROUBLESHOOTING.md), разделы про слой профиля, сессию, внешний движок и ключ. Зелёная 3 только «теми же словами» — не приёмка: повторите другими словами и пройдите 5.

Green 1, 2 and 4 with red 3 means the service is alive but does not reach the agent: see [TROUBLESHOOTING.md](TROUBLESHOOTING.md), sections on the profile layer, the session, the external engine and the key. A green 3 with "same words" only is not acceptance: repeat with different words and run 5.

Чтобы убедиться, что проверка 3 вообще способна покраснеть, один раз прогоните её на заведомо сломанном: например, временно уберите строку из набора агента и создайте новую сессию — инструментов памяти быть не должно; верните строку — снова зелёное.

To make sure check 3 can turn red at all, run it once against a known-broken setup: for example, temporarily remove the row from the preset and create a new session — there must be no memory tools; restore the row — green again.

## Внутренние механизмы движка · Engine-internal mechanisms

У движка свои механизмы (сторож памяти RSS, сторож простоя, проверка заголовков `Host`/`Origin`, ключ доступа). Это не сторожа пакета: пакет их не настраивает, кроме `OMEGA_IDLE_TIMEOUT=0` и порогов склейки `OMEGA_DEDUP_THRESHOLDS`, и тревог от них не получает — только строки в журнале службы (`journalctl -u omega-memory`).

The engine has its own mechanisms (RSS memory watchdog, idle watchdog, `Host`/`Origin` header checks, access key). They are not package guards: the package does not configure them except `OMEGA_IDLE_TIMEOUT=0` and the collapse thresholds `OMEGA_DEDUP_THRESHOLDS`, and gets no alerts from them — only lines in the service journal (`journalctl -u omega-memory`).

Проверка пути до enable также видит обязательные EnvironmentFile/WorkingDirectory и приватность HOME/.omega; имя юнита проверяет только группы. Два стенда: stend-gruppy.sh и stend-audit.py, только временные копии. Нет автоматического наблюдения за последующим исчезновением файлов.

File preflight also checks mandatory EnvironmentFile/WorkingDirectory and private HOME/.omega; unit-name mode checks groups only. Both stend-gruppy.sh and stend-audit.py use temporary copies. Later disappearance is not automatically monitored.
