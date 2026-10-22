# dsh-trevogi — общий канал тревог в Telegram, обрезка его хвоста и суточный читатель отказов «ключа»

Версия · Version: 3.1.8

*English version — [below](#english).*

## Назначение

Пакет даёт машине одну точку, через которую сторожа и службы докрикиваются до человека: `agent-alert` берёт текст из аргументов или stdin, шлёт его в Telegram (HTML по умолчанию, `--plain` — обычным текстом) и отвечает кодом, который различает «доставлено», «Telegram отказал» и «сеть не пустила». Повторяет сетевые сбои, не-JSON и временные ответы 5xx/429, с ограниченным числом попыток. Каждый исход пишется в системный журнал (тег `agent-alert`, первые 120 знаков текста) и полным текстом в закрытый хвост тревог. Токен и chat-id лежат в отдельных файлах; в командную строку `curl` токен не попадает, адрес подаётся через stdin (`curl --config -`).

На sadik его зовут многие: сторожа по таймерам, обработчики `OnFailure=`, вставки юнитов шлюзов, агенты (запись `agent-alert` в `/etc/agent-registry/plugins.yaml`, поле `used_by`). Результат читает владелец канала тревог в Telegram; исходы в журнале — тот, кто разбирает отказ. Каждый такт `sadik-watch` зовёт `agent-alert --proverit-nastrojku` (блок A-N-1549) и шлёт свою тревогу, если настройка негодна или проверка не состоялась.

Два сторожа обслуживают сам канал. `agent-alert-hvost-obrezka` зовёт часовой таймер: он держит в хвосте последние N строк, не меняя inode и прав файла. `otkaz-klyuch-watch` зовёт суточный таймер: он читает журнал `agent-alert` после своего курсора, считает отказы вида `исход=отказ-ключ` (кто-то подал текст на «-» без `--`, и тревога не ушла) и сообщает о них тем же `agent-alert`. Что таймеры вообще срабатывают, проверяет `sadik-watch` по списку `/etc/agent-registry/storozha-sutochnye.txt`: `otkaz-klyuch-watch.service` со сроком 26 ч, `agent-alert-hvost-obrezka.service` со сроком 3 ч.

## Что ставится и куда

Записи с `subdir: packages/dsh-trevogi` и блока `derevo` в `/etc/agent-registry/plugins.yaml` нет. Там есть только запись `id: agent-alert`, и она описывает один файл, `/usr/local/bin/agent-alert`. Таблица ниже собрана по `ExecStart=` боевых юнитов, по тому, как скрипты ищут библиотеку (`../lib/dsh-trevogi` от настоящего пути скрипта), и по умолчанию `DSH_TREVOGI_CONFIG`. Режимы и владельцы сняты на sadik через `sudo stat` 08.10.2026 18:52Z.

| Файл в пакете | Путь на машине | Режим / владелец | Кто исполняет / читает |
|---|---|---|---|
| `bin/agent-alert` | `/usr/local/bin/agent-alert` | 755 root:root | сторожа, службы, `OnFailure=`, агенты; `otkaz-klyuch-watch` как канал; `sadik-watch` (`--proverit-nastrojku`) |
| `bin/agent-alert-hvost-obrezka` | `/usr/local/sbin/agent-alert-hvost-obrezka` | 755 root:root | `agent-alert-hvost-obrezka.service` (root) |
| `bin/otkaz-klyuch-watch` | `/usr/local/sbin/otkaz-klyuch-watch` | 755 root:root | `otkaz-klyuch-watch.service` (root) |
| `lib/dsh-trevogi/nastrojki.py` | `/usr/local/lib/dsh-trevogi/nastrojki.py` | 644 root:root | все три утилиты: bash-скрипты запускают его через `python3`, сторож импортирует |
| `systemd/agent-alert-hvost-obrezka.service` | `/etc/systemd/system/agent-alert-hvost-obrezka.service` | 644 root:root | systemd |
| `systemd/agent-alert-hvost-obrezka.timer` | `/etc/systemd/system/agent-alert-hvost-obrezka.timer` | 644 root:root | systemd, `OnCalendar=hourly` |
| `systemd/otkaz-klyuch-watch.service` | `/etc/systemd/system/otkaz-klyuch-watch.service` | 644 root:root | systemd |
| `bin/agent-alert-otpravitel` | `/usr/local/sbin/agent-alert-otpravitel` | 755 root:root | `agent-alert-otpravitel.service` (root, разбор спула) и `agent-alert-storozh-ocheredi.service` (`--storozh`) |
| `lib/dsh-trevogi/klient.py` | `/usr/local/lib/dsh-trevogi/klient.py` | 644 root:root | `agent-alert`: клиентский путь (спул) и его `--proverit-nastrojku` |
| `systemd/agent-alert-otpravitel.path` | `/etc/systemd/system/agent-alert-otpravitel.path` | 644 root:root | systemd, `DirectoryNotEmpty=` спула; включается |
| `systemd/agent-alert-otpravitel.service` | `/etc/systemd/system/agent-alert-otpravitel.service` | 644 root:root | path-юнит выше; предел запусков 100 за 10 с (`[Unit]`) — умолчание 5 за 10 с всплеск писем пробивал и гасил path-юнит до `reset-failed` (окно 15.10); живой стенд `test/stend-vsplesk.py` (root, вручную, вне `vse-stendy.sh`; маркер `ZHIVAYA-MASHINA`, запуск только с первым доводом `--zhivaya-mashina`, иначе «ОТКАЗ-ZHIVAYA-MASHINA», код 2) |
| `systemd/agent-alert-storozh-ocheredi.service` | `/etc/systemd/system/agent-alert-storozh-ocheredi.service` | 644 root:root | таймер ниже |
| `systemd/agent-alert-storozh-ocheredi.timer` | `/etc/systemd/system/agent-alert-storozh-ocheredi.timer` | 644 root:root | systemd, каждые 5 мин |
| `systemd/dsh-trevogi-spul.tmpfiles` | `/etc/tmpfiles.d/dsh-trevogi-spul.conf` | 644 root:root | `systemd-tmpfiles --create` при монтаже и загрузке |
| `systemd/otkaz-klyuch-watch.timer` | `/etc/systemd/system/otkaz-klyuch-watch.timer` | 644 root:root | systemd, ежедневно в 06:53 плюс до 300 с случайной задержки |
| `dsh-trevogi.conf.example` | `/etc/dsh-trevogi/dsh-trevogi.conf` (образец; на sadik своя редакция с путями прежней установки) | 644 root:root | `nastrojki.py` |

Пакет этого не ставит, но без этого канал не работает:

| Предмет | Путь на sadik (из `/etc/dsh-trevogi/dsh-trevogi.conf`) | Режим / владелец | Кто пишет / читает |
|---|---|---|---|
| файл токена бота | `/etc/agent-alert/token` | 640 root:agent-button + ACL | читает `agent-alert` под учёткой вызывающего |
| файл chat-id | `/etc/agent-alert/chat-id` | 640 root:agent-button + ACL | то же |
| каталог хвоста | `/var/log/agent-alert` | 2730 root:agent-button | создаёт root при монтаже |
| хвост тревог | `/var/log/agent-alert/poslednie.log` | 620 root:agent-button | `agent-alert` дописывает, обрезка переписывает, читает root |
| спул: `tmp/`, `vhod/` | `/var/spool/dsh-trevogi/{tmp,vhod}` | 1730 root:agent-button + ACL `u:varvara:wx` (машинный `/etc/tmpfiles.d/dsh-trevogi-spul-acl.conf`) | пишут отправители без токена; разбирает root |
| спул: `itog/`, `work/` | `/var/spool/dsh-trevogi/{itog,work}` | 0711 / 0700 root:root | итог — файл учётки 0600; `work/` — разбор, квоты, курсор сторожа |
| курсор сторожа | `/var/lib/otkaz-klyuch-watch/kursor` | 644 root:root | создаёт и двигает `otkaz-klyuch-watch` |

В бой не ставятся `test/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.

## Способ 2: тревога без доступа к токену (B-N-2055)

`agent-alert` выбирает путь сам. Root без ключа — прямой путь, как прежде. Учётка не-root, которой файл токена не читается, — **клиентский путь**: текст кладётся в спул (`tmp/` с `O_EXCL`, готовым — `rename` в `vhod/`), root-отправитель `agent-alert-otpravitel` (его зовёт `agent-alert-otpravitel.path`) берёт учётку по `fstat` открытого файла, проверяет квоту (`AGENT_ALERT_KVOTA_10MIN`/`_SUTKI`, root без квоты), у учётки не-root оставляет в HTML только `b strong i em u ins s strike del code pre blockquote` без атрибутов, ставит первую строку «✉ <учётка> (со слов: <источник>)» и шлёт прямым путём; итог — `itog/<имя>`. Клиент ждёт итог до `AGENT_ALERT_ITOG_ZHDAT` с и выходит его кодом: 0 доставлено · 1 отказ Telegram/сети · 65 негодный файл · 66 больше 64 КиБ · 69 квота · 75 итога нет (🔴 `исход=нет-итога` в журнале) · 1 и 🔴 `исход=нет-пути` — спул не пишется.
Ключ пробы `AGENT_ALERT_CHEREZ_SPUL=1` — клиентский путь даже при читаемом токене (проверка пути до переключения прав); иное значение — отказ 2. `--proverit-nastrojku` у учётки без токена (или с ключом) проверяет спул НАСТОЯЩЕЙ записью и path-юнит: «КЛИЕНТСКИЙ ПУТЬ ГОДЕН» — 0, иначе 2; свою пробу `.chk` клиент убирает из `vhod/` сам. «Не взведён» (2) — только если `systemctl is-active` назвал состояние и оно не `active`; пустой ответ (из песочницы `DynamicUser` — «Transport endpoint is not connected») — «ОТСЮДА НЕ ВИДНО», код 0, с причиной и подсказкой проверить от root. Превью ссылок выключено всегда (`disable_web_page_preview=true`), на обоих путях.
Сторож `agent-alert-storozh-ocheredi.timer` (5 мин): файл во `vhod/` старше 3 мин, path-юнит не active или строки `нет-пути`/`нет-итога` в журнале → тревога прямым путём, код 1. Новый набор бед — сразу; тот же — не чаще раза в 6 ч; беды ушли — одно «✅ восстановлено». Отметка — `work/storozh.otmetka.json`, ставится только при доставке (недоставленная тревога повторится следующим прогоном). Из журнала берутся только строки самого клиента (`🔴 исход=нет-пути|нет-итога учётка=…` с начала сообщения), ключ беды — по учётке (`zhurnal:<учётка>`): второй отказавший отправитель не скрыт повтором первого, а доставка самой тревоги сторожа (её начало `agent-alert` пишет в тот же журнал) не читается как отказ. Строке верится, только если `_UID` записи журнала (его ставит journald, `-o json`) равен uid названной учётки; имя не разрешается (`DynamicUser=` вне работы службы) — только если `_UID` из диапазона динамических учёток systemd 61184–65519. Иначе строка не считается, а сторож пишет «чужой uid».
Разбор, оборванный по `TimeoutStartSec`, оставляет `work/*.msg`: в начале следующего разбора такие файлы старше 1 ч получают итог 75 «прерван» и удаляются.
Юнитам с `ProtectSystem=strict` нужен `ReadWritePaths=/var/spool/dsh-trevogi`.

## Установка

Ставят у нас пофайловым монтажом `/usr/local/sbin/smontirovat-fajly`, отдельным вызовом на каждый боевой каталог. `smontirovat-vypusk` здесь не подходит: по своей шапке он раскладывает состав публикации метки в ОДИН боевой каталог, а файлы пакета разъезжаются по четырём (`/usr/local/bin`, `/usr/local/sbin`, `/usr/local/lib/dsh-trevogi`, `/etc/systemd/system`). Поле `update` записи `agent-alert` в реестре — `sudo -e /usr/local/bin/agent-alert && обновить отпечаток в этом файле`, то есть прямая правка боевого файла мимо дерева. Пакетного пути это поле не описывает.

Монтирует назначенная рука после ворот. По умолчанию инструмент делает прогон, в бой пишет только с `--v-boj`. Код 3 означает, что все файлы кандидата уже равны бою.

```bash
K=<каталог кандидата — копия пакета>      # раскладка как в пакете: bin/, lib/dsh-trevogi/, systemd/
P=<пункт монтажа>

# 1. прогон (без --v-boj ничего не пишется)
sudo smontirovat-fajly --punkt "$P" "$K/bin" /usr/local/bin agent-alert
sudo smontirovat-fajly --punkt "$P" "$K/bin" /usr/local/sbin agent-alert-hvost-obrezka otkaz-klyuch-watch
sudo smontirovat-fajly --punkt "$P" "$K/lib/dsh-trevogi" /usr/local/lib/dsh-trevogi nastrojki.py
sudo smontirovat-fajly --punkt "$P" "$K/systemd" /etc/systemd/system \
  agent-alert-hvost-obrezka.service agent-alert-hvost-obrezka.timer otkaz-klyuch-watch.service otkaz-klyuch-watch.timer

# 2. те же строки с --v-boj — в бой
sudo smontirovat-fajly --punkt "$P" --v-boj "$K/bin" /usr/local/bin agent-alert
# … и так для остальных каталогов

# 3. только если менялись юниты
sudo systemctl daemon-reload
```

Скрипты одноразовые, их запускает таймер или вызывающий, поэтому после замены файлов ничего перезапускать не нужно: новая редакция работает со следующего вызова. После монтажа `agent-alert` значение `installed_check` сверяют с полем `version` записи `agent-alert` и правят отпечаток в реестре его рукой.

Первая установка на чистую машину требует ещё нескольких шагов. Они делаются один раз, на sadik уже сделаны:

```bash
# библиотека и настройка: каталог назначения должен существовать до smontirovat-fajly
sudo install -d -m 755 -o root -g root /usr/local/lib/dsh-trevogi /etc/dsh-trevogi
# новый файл — только с --novyj; в каталоге кандидата файл должен называться dsh-trevogi.conf
sudo smontirovat-fajly --punkt "$P" --v-boj --novyj --mode=644 --owner=0:0 <каталог с dsh-trevogi.conf> /etc/dsh-trevogi dsh-trevogi.conf

# хвост создаёт root заранее: отправитель его не создаёт (образец режимов — из старого README пакета)
getent group agent-button >/dev/null || sudo groupadd --system agent-button
sudo install -d -m 2710 -o root -g agent-button /var/log/dsh-trevogi
sudo install -m 620 -o root -g agent-button /dev/null /var/log/dsh-trevogi/poslednie.log
sudo install -d -m 755 -o root -g root /var/lib/dsh-trevogi/otkaz-klyuch

# таймеры
sudo systemctl daemon-reload
sudo systemctl enable --now agent-alert-hvost-obrezka.timer otkaz-klyuch-watch.timer
```

Новым файлам в `/usr/local/bin` и `/usr/local/sbin` тоже нужен `--novyj`: без него инструмент откажет на имени, которого нет в бою. Файлы токена и chat-id кладёт хозяин секретов, с правами только для разрешённых отправителей. Значения в настройку не пишутся, только пути.

## Настройка

Все три утилиты читают настройку одним читателем, `lib/dsh-trevogi/nastrojki.py`. Значение берётся из переменной окружения, если её нет — из файла настройки, если нет и там — по умолчанию. Файл не исполняется оболочкой. Формат файла: строка `KEY=value`; комментарий — только `#` в нулевой колонке; пустые строки допустимы. Неизвестный или повторный ключ, пустое значение, табуляция, перевод строки или NUL в значении, относительный путь, число вне предела — отказ: код 2 у `agent-alert` и обрезки, код 2 у сторожа.

| Переменная / ключ / довод | Умолчание в коде | На sadik | Смысл |
|---|---|---|---|
| `DSH_TREVOGI_CONFIG` (только env) | `/etc/dsh-trevogi/dsh-trevogi.conf` | не задана | путь к файлу настройки, абсолютный; если файла по умолчанию нет — работают env и умолчания, если явно заданного нет — отказ |
| `AGENT_ALERT_TOKEN_FILE` | `/etc/dsh-trevogi/token` | `/etc/agent-alert/token` | файл токена; берётся первая строка без пробельных знаков |
| `AGENT_ALERT_CHAT_FILE` | `/etc/dsh-trevogi/chat-id` | `/etc/agent-alert/chat-id` | файл chat-id, так же |
| `AGENT_ALERT_HVOST` | `/var/log/dsh-trevogi/poslednie.log` | `/var/log/agent-alert/poslednie.log` | хвост тревог; создаётся заранее |
| `AGENT_ALERT_POPYTOK` | `3` | `3` | всего попыток сети/временного HTTP, целое 1..10 |
| `AGENT_ALERT_PAUZY` | `5 15` | `5 15` | паузы между попытками в секундах, 0..300, через одиночный пробел; поля нет — 15 с; одно число — одна и та же пауза каждый раз |
| `AGENT_ALERT_TAJMAUT` | `20` | `20` | предел одного вызова `curl` (`-m`), секунды, 1..300 |
| `AGENT_ALERT_HVOST_PREDEL` | `20000000` | `20000000` | предел размера хвоста в байтах, 1..1000000000; больше — строка не дописывается, отказ пишется в журнал |
| `AGENT_ALERT_HVOST_STROK` | `200` | `200` | сколько последних строк оставляет обрезка, 1..1000000 |
| `OTKAZ_KLYUCH_KURSOR` | `/var/lib/dsh-trevogi/otkaz-klyuch/kursor` | `/var/lib/otkaz-klyuch-watch/kursor` | файл курсора сторожа |
| `OTKAZ_KLYUCH_KANAL` | `/usr/local/bin/agent-alert` | `/usr/local/bin/agent-alert` | исполняемый канал сторожа; вызывается как `<канал> -- <текст>` |
| `OTKAZ_KLYUCH_HOST` | короткое имя машины (`socket.gethostname()` до первой точки) | `sadik` | префикс тревоги сторожа |
| `AGENT_ALERT_PREDEL` (только env, в файле — отказ «неизвестный ключ») | `3900` | не задана | порог обрезки текста в знаках, положительное целое; сверху всё равно 4096 единиц UTF-16 вместе с префиксом и подписью; негодное значение ломает HTML и plain, код 1 |
| `DSH_PROBA` (только env) | `0` | — | `1` — проба: в журнал строка `исход=проба, не отправлено текст[0:120]=…`, код 0; токен, хвост и сеть не трогаются; иное значение — код 2 |
| `MONITOR_UNIT` (env; systemd выставляет его обработчикам `OnFailure=`) | — | — | метка источника `ПО ОТКАЗУ СЛУЖБЫ <юнит>`; задана — главнее метки по cgroup (см. ниже) |
| `agent-alert --plain` | HTML | — | отправить обычным текстом; ключ только первым |
| `agent-alert -- <текст>` | — | — | текст, который начинается с «-» |
| `agent-alert --proverit-nastrojku` | — | — | проверить настройку без отправки (см. «Проверка»); других доводов не принимает |
| `agent-alert -h`, `--help`, любой другой `-…` | — | — | help: код 0 и `исход=справка`; неизвестный ключ: 2 и `исход=отказ-ключ`; не отправляет |
| `otkaz-klyuch-watch --kursor <путь>` | из настройки | — | файл курсора, перекрывает настройку |
| `otkaz-klyuch-watch --kanal <путь>` | из настройки | — | канал, перекрывает настройку |
| `otkaz-klyuch-watch --tolko-pechat` | выкл. | — | только напечатать окно: не слать, курсор не сохранять |
| `agent-alert-hvost-obrezka` | — | — | доводов нет; любой довод — код 2, хвост не тронут |

Зашито в коде, настройкой не меняется: журнал видит 120 знаков; `flock` ждёт 5 с у отправщика и 30 с у обрезки; сторож ждёт канал не больше 120 с и кладёт в тревогу не больше 8 примеров. `Environment=` в юнитах пакета нет, вставок (drop-in) у боевых юнитов тоже нет (`systemctl cat`, 09.10.2026).

Префикс тревоги тоже собирается в коде: `[<короткое имя машины>] ⚠️ <метка источника> · <текст>`; если метка пуста, остаётся `[<машина>] <текст>`. Метку `agent-alert` ставит по положительному признаку (с 2.0.2, B-N-1830): юнит берётся из своей cgroup (`/proc/self/cgroup`, последнее имя `*.service` или `*.scope`).

| Кто позвал | Метка |
|---|---|
| задана `MONITOR_UNIT` (обработчик `OnFailure=`) | `ПО ОТКАЗУ СЛУЖБЫ <юнит>` — проверяется первой |
| служба, у которой есть таймер (`TriggeredBy` не пуст) | без метки |
| служба без таймера: агент, шлюз, демон | `служба <юнит>` |
| `cron.service` или `crond.service` | `по cron (<юнит>)` |
| `session-*.scope`: ssh, sudo, вход в консоль | `ПОЗВАНО РУКОЙ (<scope>)` — только этот случай |
| всё прочее: вне юнита, чужой `.scope` | `источник не установлен (<хвост cgroup: длиннее 64 знаков — «…» и последние 63>)`; cgroup не прочитан — `источник не установлен (cgroup не прочитан)` |

## Проверка

Стенды лежат в `test/` и гоняются на копии пакета. Сеть, журнал, канал и `systemctl` у них подставные, состояние во временных каталогах `/tmp`. Боевой хвост и курсор стенды не трогают.

| Стенд | Как запускать | Чего ждать |
|---|---|---|
| `test/vse-stendy.sh` | `bash test/vse-stendy.sh` или `npm test` из корня пакета | по строке `STEND <имя> <код>` на каждый стенд; итоговый код — наибольший из кодов стендов: 0 всё зелёное, 1 есть красное, 2 слепота |
| `test/stend-agent-alert.sh` | через `vse-stendy.sh`; отдельно: `AGENT_ALERT_BIN=<пакет>/bin/agent-alert bash test/stend-agent-alert.sh` | 45 проверок (под root 44: проверку нечитаемости пропускает и говорит об этом), из них 9 — строка журнала у шести немых прежде выходов, 3 — номер в строках журнала, 2 — нет pyc при ручном запуске; 0 — все ok, 1 — есть FAIL, 2 — проведено не столько проверок, сколько ждали, или стенд не собрался |
| `test/stend-nastroek-proby.py` | `python3 test/stend-nastroek-proby.py` (корень — `TREVOGI_TEST_ROOT` или родитель `test/`) | 15 тестов unittest: проба, приоритет env/config, отказ неизвестного ввода, токен не в argv и не в `/proc/self/cmdline`, вычистка токена из ответа, обрезка сохраняет inode и права, настройка сторожа; 0 / 1 |
| `test/stend-watch-hvost.py` | `python3 test/stend-watch-hvost.py` | 8 тестов курсора и обрезки: пустое окно, первый вызов, отказ канала и возврат, слепота журнала, `--tolko-pechat`, отказ неизвестных ключей; 0 / 1 |
| `test/stend-porchi.py` | `python3 test/stend-porchi.py` | 4 порчи на временной копии (`DSH_PROBA`, `PROBA_TEXT`, `TOKEN_ARGV`, `TOKEN_LOG`): у каждой исход 0 → 1 → 0, внесение подтверждено `grep -cF` и сменой sha256; 0 — все прошли, 1 — нет |
| `test/stend-audit-kraev.py` | `python3 test/stend-audit-kraev.py` | 32 краевых методов без пропусков; реальные никто/group fixtures, внешние IO подставные · 32 edge methods without skips |
| `test/stend-audit-deadline.py` | `python3 test/stend-audit-deadline.py` | реальный helper timeout с отделившимся pipe-holder, short deadline0.1с; не живой120с-прогон · real helper with a scaled deadline and detached pipe holder |
| `test/stend-audit-yunits.py` | `python3 test/stend-audit-yunits.py` | systemd offline читает два unit, protection fault/return; не start/reload · two offline unit consumers, no host unit starts |
| `test/stend-audit-porchi.py` | `python3 test/stend-audit-porchi.py` | 19 источниковых порч0→1→0, точные числа замен/grep-F/SHA · 19 real source mutations with recovery |

Проверки записи `agent-alert` в `/etc/agent-registry/plugins.yaml`, дословно:

```bash
# installed_check — значение должно совпасть с полем version записи
sha256sum /usr/local/bin/agent-alert | cut -c1-16 | sed 's/^/sha256:/'
# healthcheck — печатает «скрипт и секрет на месте», код 0
test -x /usr/local/bin/agent-alert && test -s /etc/agent-alert/token && echo 'скрипт и секрет на месте'
```

Остальные файлы пакета реестр не проверяет. Их сверяют суммой с кандидатом: `sudo sha256sum` по путям из таблицы «Что ставится и куда».

Живые проверки без отправки:

```bash
# настройка: 0 и «НАСТРОЙКА ГОДНА…» — годна; 2 и строки «ОТКАЗ НАСТРОЙКИ: …» — нет. Telegram не спрашивается
/usr/local/bin/agent-alert --proverit-nastrojku
# проба отправщика: код 0, «проба, не отправлено»; в журнале — исход и первые 120 знаков текста
DSH_PROBA=1 /usr/local/bin/agent-alert -- 'проверка'
journalctl -t agent-alert -n 5 --no-pager
# окно сторожа без отправки и без сдвига курсора (нужно чтение журнала и курсора)
sudo /usr/local/sbin/otkaz-klyuch-watch --tolko-pechat
# расписание и исходы таймеров
systemctl list-timers otkaz-klyuch-watch.timer agent-alert-hvost-obrezka.timer
journalctl -t otkaz-klyuch-watch -t otkaz-klyuch-watch-vyvod --since -3d --no-pager
journalctl -u agent-alert-hvost-obrezka.service --since -3h --no-pager
```

Коды утилит. `agent-alert`: 0 — Telegram ответил `"ok":true`, проба или годная настройка; 1 — пустой текст, нет токена или чата, отказ Telegram, сеть не пустила после всех попыток, текст не подготовлен; 2 — отказ ключа, негодная `DSH_PROBA`, негодная настройка. Каждый отказ, после которого тревога не ушла, оставляет строку журнала `agent-alert` «`исход=<причина> учётка=… ЮНИТ=… звал=…(PPID) <причина словами>`»: `пустое-сообщение`, `отказ-DSH_PROBA`, `отказ-настроек`, `нет-токена-или-чата`, `формат-не-подготовлен` (с 3.1.5, B-N-2064; прежде эти шесть выходов были немыми) — рядом с прежними `отказ-ключ`, `нет-пути`, `нет-итога`. С 3.1.6 так же пишет клиентский путь: `итог-не-читается` и `отказ-отправителя` (код отправителя спула 65/66/69/1, прежде видный лишь под тегом `agent-alert-otpravitel`) — с `путь=спул файл=<имя>.msg`, без 🔴, поэтому сторож очереди их не берёт. Номер в строках журнала (`версия=`) — константа `VERSIYA` в `lib/dsh-trevogi/nastrojki.py`, равная `package.json` (с 3.1.6; был литерал 3.1.1). Python-утилиты (`agent-alert-otpravitel`, `otkaz-klyuch-watch`) не пишут байт-код (`sys.dont_write_bytecode`, с 3.1.7): ручной запуск от root по шебангу оставлял `__pycache__` в `/usr/local/lib/dsh-trevogi/`. Текст тревоги в такую строку не кладётся. Код и поток сообщения прежние. `otkaz-klyuch-watch`: 0 — окно прочитано, тревога ушла или была не нужна (сюда же первый вызов и `--tolko-pechat`); 2 — слепота журнала или канал не принял тревогу, курсор прежний; 2 — также негодный довод/настройка/курсор; справка даёт 0. `agent-alert-hvost-obrezka`: 0 — обрезано или нечего обрезать; 2 — довод, настройка, нет хвоста, `flock` занят дольше 30 с.

## Ограничения

- Код 0 у `--proverit-nastrojku` ≠ «path-юнит проверен»: при «ОТСЮДА НЕ ВИДНО» (пустой ответ `systemctl`, песочница `DynamicUser`) код тоже 0. Кто читает только код, path-юнит не проверил — смотреть строку вывода или звать от root (LOW Вениамина к 3.1.4, 15.10).
- Строку `исход=<причина>` пишет `logger`; если его нет или он отказал, отказ остаётся только в коде и выводе. Вызов, которого не было вовсе, строки не оставляет, а зовущий, гасящий вывод в `/dev/null`, теряет и сообщение — видна лишь строка журнала.
- Метка `DSH_PROBA=1` защищает от отправки только `agent-alert`. Обрезку хвоста и запись курсора сторожа она не останавливает, их пробуют только на временных файлах. Пробу, которая забыла метку, ничто не ловит.
- `--proverit-nastrojku` не знает, примет ли Telegram токен и существует ли чат: это знает только отправка. `sadik-watch` зовёт проверку от root, а root читает любой файл, поэтому «токен не читается учёткой агента» оттуда не видно.
- Повторяются сеть, не-JSON и 5xx/429; постоянный отказ вроде 400 завершает вызов с первой попытки. retry_after — целое 0..300 с, больше или неверный формат — отказ без раннего повтора. Общего предела времени на вызов нет: по умолчанию до 80 с сетевого ожидания (с retry_after до 660 с) (3×20 + 5 + 15), при предельных настройках до 5700 с.
- Из ответа `curl` вычищается только точный прочитанный токен. Других секретов в тексте вызывающего и закодированных форм фильтр не видит.
- Метка источника судит по юниту, а не по запуску. Ручной `systemctl start` службы, у которой есть таймер, неотличим от срабатывания по расписанию (метки нет). Руку, запустившую команду через `systemd-run`, метка не ловит: это уже служба или чужой scope. Служба пользовательского менеджера systemd назовётся «служба». Метка не доказывает, что вызов был пробой.
- Если упал сам Python, не прошёл предел или кодировка, ломаются обе ветки, HTML и запасной plain: код 1, ничего не отправлено.
- Хвост отправщик не создаёт. Если файла нет, он закрыт, `flock` занят дольше 5 с или превышен предел размера, строка пишется только в журнал: тревога может уйти, а хвост остаться без неё. Рост хвоста виден только строкой журнала `хвост НЕ записан … обрезка … не работает?`, тревоги на это нет.
- Клиентский путь (спул) с 3.1.8 пишет хвост учётки, только если он задан окружением процесса (drop-in службы), и после итога отправителя: `исход=доставлено(спул)` или `не-доставлено(спул,код-N)`. Хвост из config там не пишется — его пишет root-отправитель. Если зовущий оборвал клиента раньше итога (сток сторожа памяти ждёт 5 с), строки в хвосте нет, а тревога из спула всё равно уходит.
- Обрезка не замечает, что её не вызвали, и не видит подмены файла мимо замка. Жизнь таймеров на sadik проверяет `sadik-watch`, в самом пакете такого сторожа нет.
- Сторож отказов «ключа» начинает первое окно с текущего конца журнала: отказы до первого вызова он не посчитает. Строки, ушедшие при ротации journald, выпадают из окна. Другие виды отказов и отправщик, которого не позвали вовсе, он не видит. Слепота журнала при рабочем вызове (без --tolko-pechat) даёт2 и одну попытку сигнала о слепоте; курсор прежний.
- Сторож считает любую строку журнала `agent-alert`, в которой есть `исход=отказ-ключ`, в том числе пробную или доставленную тревогу, если эти слова попали в её первые 120 знаков.
- Живая доставка, timer liveness и ротация вне проверки; новые пробы проверяют nobody-права, группы процесса и отдельного владельца cursor lock. Если AGENT_ALERT_BIN не задан, стенд проверяет bin/agent-alert своего пакета; копирует только lib/dsh-trevogi.
- Реестр видит только один файл пакета, `/usr/local/bin/agent-alert`, и в записи стоит прямая правка (`sudo -e`). Поэтому боевая редакция может уйти от дерева без следа в пакете. Так было с меткой источника B-N-1830 (бой с 08.10.2026); в 2.0.2 она перенесена в дерево побайтно (B-N-1872). На 09.10.2026 сумма каждого из 8 ставимых файлов пакета равна боевой, `installed_check` записи `agent-alert` — `sha256:49d6644a81f0ca46`.
---

<a id="english"></a>

# dsh-trevogi — shared Telegram alert channel, its tail trimming and a daily reader of option refusals

## Purpose

The package gives the machine one point through which watchers and services reach a human. `agent-alert` takes text from arguments or stdin, sends it to Telegram (HTML by default, `--plain` for plain text) and returns an exit code that tells "delivered", "Telegram refused" and "network blocked" apart. Network failures, non-JSON and temporary5xx/429 responses retry within the attempt limit. Every outcome is written to the system journal (tag `agent-alert`, first 120 characters of the text) and, as full text, to a restricted alert tail. The token and chat-id live in separate files. The token never reaches the `curl` command line: the URL is fed through stdin (`curl --config -`).

On sadik it has many callers: timer-driven watchers, `OnFailure=` handlers, gateway unit drop-ins, agents (record `agent-alert` in `/etc/agent-registry/plugins.yaml`, field `used_by`). The owner of the alert channel reads the result in Telegram; whoever investigates a failure reads the journal outcomes. On every cycle `sadik-watch` calls `agent-alert --proverit-nastrojku` (block A-N-1549) and raises its own alert if the configuration is unusable or the check did not run.

Two watchers maintain the channel itself. An hourly timer calls `agent-alert-hvost-obrezka`, which keeps the last N lines of the tail without changing the file's inode or permissions. A daily timer calls `otkaz-klyuch-watch`, which reads the `agent-alert` journal after its cursor, counts refusals of the form `исход=отказ-ключ` (someone passed text starting with "-" without `--`, so the alert was not sent) and reports them through the same `agent-alert`. Whether the timers fire at all is checked by `sadik-watch` from the list `/etc/agent-registry/storozha-sutochnye.txt`: `otkaz-klyuch-watch.service` with a 26 h limit, `agent-alert-hvost-obrezka.service` with a 3 h limit.

## What gets installed and where

`/etc/agent-registry/plugins.yaml` has no record with `subdir: packages/dsh-trevogi` and no `derevo` block. The only record there is `id: agent-alert`, and it describes one file, `/usr/local/bin/agent-alert`. The table below is built from the `ExecStart=` lines of the live units, from how the scripts locate their library (`../lib/dsh-trevogi` relative to the script's real path) and from the `DSH_TREVOGI_CONFIG` default. Modes and owners were taken on sadik with `sudo stat` on 2026-10-08 18:52Z.

| Package file | Path on the machine | Mode / owner | Executed / read by |
|---|---|---|---|
| `bin/agent-alert` | `/usr/local/bin/agent-alert` | 755 root:root | watchers, services, `OnFailure=`, agents; `otkaz-klyuch-watch` as its channel; `sadik-watch` (`--proverit-nastrojku`) |
| `bin/agent-alert-hvost-obrezka` | `/usr/local/sbin/agent-alert-hvost-obrezka` | 755 root:root | `agent-alert-hvost-obrezka.service` (root) |
| `bin/otkaz-klyuch-watch` | `/usr/local/sbin/otkaz-klyuch-watch` | 755 root:root | `otkaz-klyuch-watch.service` (root) |
| `lib/dsh-trevogi/nastrojki.py` | `/usr/local/lib/dsh-trevogi/nastrojki.py` | 644 root:root | all three utilities: the bash scripts run it with `python3`, the watcher imports it |
| `systemd/agent-alert-hvost-obrezka.service` | `/etc/systemd/system/agent-alert-hvost-obrezka.service` | 644 root:root | systemd |
| `systemd/agent-alert-hvost-obrezka.timer` | `/etc/systemd/system/agent-alert-hvost-obrezka.timer` | 644 root:root | systemd, `OnCalendar=hourly` |
| `systemd/otkaz-klyuch-watch.service` | `/etc/systemd/system/otkaz-klyuch-watch.service` | 644 root:root | systemd |
| `bin/agent-alert-otpravitel` | `/usr/local/sbin/agent-alert-otpravitel` | 755 root:root | `agent-alert-otpravitel.service` (root, spool drain) and `agent-alert-storozh-ocheredi.service` (`--storozh`) |
| `lib/dsh-trevogi/klient.py` | `/usr/local/lib/dsh-trevogi/klient.py` | 644 root:root | `agent-alert`: client path (spool) and its `--proverit-nastrojku` |
| `systemd/agent-alert-otpravitel.path` | `/etc/systemd/system/agent-alert-otpravitel.path` | 644 root:root | systemd, `DirectoryNotEmpty=` of the spool; enabled |
| `systemd/agent-alert-otpravitel.service` | `/etc/systemd/system/agent-alert-otpravitel.service` | 644 root:root | the path unit above; start limit 100 per 10 s in `[Unit]` (the default 5 per 10 s let a burst kill the path unit); live stand `test/stend-vsplesk.py` (root, manual; `ZHIVAYA-MASHINA` marker, runs only with `--zhivaya-mashina` as the first argument, otherwise code 2) |
| `systemd/agent-alert-storozh-ocheredi.service` | `/etc/systemd/system/agent-alert-storozh-ocheredi.service` | 644 root:root | the timer below |
| `systemd/agent-alert-storozh-ocheredi.timer` | `/etc/systemd/system/agent-alert-storozh-ocheredi.timer` | 644 root:root | systemd, every 5 min |
| `systemd/dsh-trevogi-spul.tmpfiles` | `/etc/tmpfiles.d/dsh-trevogi-spul.conf` | 644 root:root | `systemd-tmpfiles --create` at deployment and boot |
| `systemd/otkaz-klyuch-watch.timer` | `/etc/systemd/system/otkaz-klyuch-watch.timer` | 644 root:root | systemd, daily at 06:53 plus up to 300 s random delay |
| `dsh-trevogi.conf.example` | `/etc/dsh-trevogi/dsh-trevogi.conf` (a sample; sadik has its own edition with the previous installation's paths) | 644 root:root | `nastrojki.py` |

The package does not install these, but the channel cannot work without them:

| Item | Path on sadik (from `/etc/dsh-trevogi/dsh-trevogi.conf`) | Mode / owner | Written / read by |
|---|---|---|---|
| bot token file | `/etc/agent-alert/token` | 640 root:agent-button + ACL | read by `agent-alert` as the caller's account |
| chat-id file | `/etc/agent-alert/chat-id` | 640 root:agent-button + ACL | same |
| tail directory | `/var/log/agent-alert` | 2730 root:agent-button | created by root at deployment |
| alert tail | `/var/log/agent-alert/poslednie.log` | 620 root:agent-button | `agent-alert` appends, trimming rewrites, root reads |
| spool: `tmp/`, `vhod/` | `/var/spool/dsh-trevogi/{tmp,vhod}` | 1730 root:agent-button + ACL `u:varvara:wx` (machine file `/etc/tmpfiles.d/dsh-trevogi-spul-acl.conf`) | written by senders without the token; drained by root |
| spool: `itog/`, `work/` | `/var/spool/dsh-trevogi/{itog,work}` | 0711 / 0700 root:root | result — the account's 0600 file; `work/` — drain, quotas, watcher cursor |
| watcher cursor | `/var/lib/otkaz-klyuch-watch/kursor` | 644 root:root | created and advanced by `otkaz-klyuch-watch` |

Not deployed: `test/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.

## Method 2: alerts without token access (B-N-2055)

`agent-alert` picks the path itself. Root without the key keeps the direct path. A non-root account that cannot read the token file takes the **client path**: the text goes into the spool (`tmp/` with `O_EXCL`, then `rename` into `vhod/`); the root sender `agent-alert-otpravitel` (triggered by `agent-alert-otpravitel.path`) takes the account from `fstat`, applies the per-account quota, keeps only allowlisted HTML tags without attributes for non-root, prefixes «✉ <account>» and delivers via the direct path; the result goes to `itog/<name>`. The client waits up to `AGENT_ALERT_ITOG_ZHDAT` s and exits with that code (0, 1, 65, 66, 69; 75 and a 🔴 journal line without a result; 1 and 🔴 when the spool is not writable).
Probe key `AGENT_ALERT_CHEREZ_SPUL=1` forces the client path; any other value is refused (2). `--proverit-nastrojku` checks the spool with a real write plus the path unit; an empty `systemctl` answer (DynamicUser sandbox) is reported as «not visible from here», code 0, not as «not armed». Link previews are always disabled. The watcher timer alerts directly when the queue is stuck: a new set of problems at once, the same set at most every 6 h, one «recovered» when they clear; the mark (`work/storozh.otmetka.json`) is set only after delivery. Only the client's own failure lines (from the start of the message) are read, keyed per account (`zhurnal:<account>`), so a second failing sender is not hidden and the watcher's own delivery log line is not mistaken for a failure; a line counts only if the journal record's `_UID` equals the named account's uid (or, for a name that does not resolve, lies in the systemd DynamicUser range 61184–65519); otherwise the watcher logs «чужой uid». Leftover `work/*.msg` older than 1 h (drain killed by `TimeoutStartSec`) get result 75 «interrupted» and are removed at the next drain. `ProtectSystem=strict` units need `ReadWritePaths=/var/spool/dsh-trevogi`.

## Installation

Here the package is deployed file by file with `/usr/local/sbin/smontirovat-fajly`, one call per target directory. `smontirovat-vypusk` does not fit: according to its header it lays a tag's publication contents into ONE target directory, while this package's files go to four (`/usr/local/bin`, `/usr/local/sbin`, `/usr/local/lib/dsh-trevogi`, `/etc/systemd/system`). The `update` field of the `agent-alert` registry record is `sudo -e /usr/local/bin/agent-alert && обновить отпечаток в этом файле`, i.e. a direct edit of the live file that bypasses the tree. That field does not describe a package route.

The designated hand deploys after the gate. By default the tool does a dry pass; it writes to production only with `--v-boj`. Exit 3 means every candidate file already equals production.

```bash
K=<candidate directory — a copy of the package>      # same layout as the package: bin/, lib/dsh-trevogi/, systemd/
P=<deployment item>

# 1. dry pass (nothing is written without --v-boj)
sudo smontirovat-fajly --punkt "$P" "$K/bin" /usr/local/bin agent-alert
sudo smontirovat-fajly --punkt "$P" "$K/bin" /usr/local/sbin agent-alert-hvost-obrezka otkaz-klyuch-watch
sudo smontirovat-fajly --punkt "$P" "$K/lib/dsh-trevogi" /usr/local/lib/dsh-trevogi nastrojki.py
sudo smontirovat-fajly --punkt "$P" "$K/systemd" /etc/systemd/system \
  agent-alert-hvost-obrezka.service agent-alert-hvost-obrezka.timer otkaz-klyuch-watch.service otkaz-klyuch-watch.timer

# 2. the same lines with --v-boj go to production
sudo smontirovat-fajly --punkt "$P" --v-boj "$K/bin" /usr/local/bin agent-alert
# … and likewise for the other directories

# 3. only if units changed
sudo systemctl daemon-reload
```

The scripts are one-shot: a timer or a caller starts them. After replacing files nothing needs restarting, because the new edition takes effect on the next call. After deploying `agent-alert`, compare the `installed_check` value with the `version` field of the `agent-alert` record; the registry hand updates the fingerprint in the registry.

A first installation on a clean machine needs a few more steps. They are done once; on sadik they are already done:

```bash
# library and configuration: the target directory must exist before smontirovat-fajly
sudo install -d -m 755 -o root -g root /usr/local/lib/dsh-trevogi /etc/dsh-trevogi
# a new file needs --novyj; in the candidate directory the file must be named dsh-trevogi.conf
sudo smontirovat-fajly --punkt "$P" --v-boj --novyj --mode=644 --owner=0:0 <directory with dsh-trevogi.conf> /etc/dsh-trevogi dsh-trevogi.conf

# root creates the tail in advance: the sender does not create it (mode sample from the package's old README)
getent group agent-button >/dev/null || sudo groupadd --system agent-button
sudo install -d -m 2710 -o root -g agent-button /var/log/dsh-trevogi
sudo install -m 620 -o root -g agent-button /dev/null /var/log/dsh-trevogi/poslednie.log
sudo install -d -m 755 -o root -g root /var/lib/dsh-trevogi/otkaz-klyuch

# timers
sudo systemctl daemon-reload
sudo systemctl enable --now agent-alert-hvost-obrezka.timer otkaz-klyuch-watch.timer
```

New files in `/usr/local/bin` and `/usr/local/sbin` also need `--novyj`: without it the tool refuses a name that does not exist in production. The owner of the secrets places the token and chat-id files, readable only by authorized senders. Values never go into the configuration, only paths.

## Configuration

All three utilities read settings through one reader, `lib/dsh-trevogi/nastrojki.py`. A value comes from the environment variable; failing that, from the configuration file; failing that, from the default. The shell never evaluates the file. File format: one `KEY=value` per line; a comment is only `#` in column zero; blank lines are allowed. An unknown or duplicate key, an empty value, a tab, line break or NUL in a value, a relative path, or a number out of range is a refusal: exit 2 for `agent-alert` and trimming, exit 2 for the watcher.

| Variable / key / argument | Default in code | On sadik | Meaning |
|---|---|---|---|
| `DSH_TREVOGI_CONFIG` (env only) | `/etc/dsh-trevogi/dsh-trevogi.conf` | not set | configuration file path, absolute; if the default file is missing, environment and defaults apply; if an explicitly set file is missing, refusal |
| `AGENT_ALERT_TOKEN_FILE` | `/etc/dsh-trevogi/token` | `/etc/agent-alert/token` | token file; first line with whitespace removed |
| `AGENT_ALERT_CHAT_FILE` | `/etc/dsh-trevogi/chat-id` | `/etc/agent-alert/chat-id` | chat-id file, same rule |
| `AGENT_ALERT_HVOST` | `/var/log/dsh-trevogi/poslednie.log` | `/var/log/agent-alert/poslednie.log` | alert tail; provisioned in advance |
| `AGENT_ALERT_POPYTOK` | `3` | `3` | total network attempts, integer 1..10 |
| `AGENT_ALERT_PAUZY` | `5 15` | `5 15` | delays between attempts in seconds, 0..300, single-space separated; a missing field means 15 s; a single number means the same delay every time |
| `AGENT_ALERT_TAJMAUT` | `20` | `20` | limit of one `curl` call (`-m`), seconds, 1..300 |
| `AGENT_ALERT_HVOST_PREDEL` | `20000000` | `20000000` | tail size limit in bytes, 1..1000000000; above it the line is not appended and the refusal goes to the journal |
| `AGENT_ALERT_HVOST_STROK` | `200` | `200` | number of last lines trimming keeps, 1..1000000 |
| `OTKAZ_KLYUCH_KURSOR` | `/var/lib/dsh-trevogi/otkaz-klyuch/kursor` | `/var/lib/otkaz-klyuch-watch/kursor` | watcher cursor file |
| `OTKAZ_KLYUCH_KANAL` | `/usr/local/bin/agent-alert` | `/usr/local/bin/agent-alert` | watcher's executable channel; invoked as `<channel> -- <text>` |
| `OTKAZ_KLYUCH_HOST` | short machine name (`socket.gethostname()` up to the first dot) | `sadik` | prefix of the watcher's alert |
| `AGENT_ALERT_PREDEL` (env only; in the file it is refused as an unknown key) | `3900` | not set | text truncation threshold in characters, positive integer; the ceiling is still 4096 UTF-16 units including prefix and footer; an invalid value breaks both HTML and plain, exit 1 |
| `DSH_PROBA` (env only) | `0` | — | `1` — probe: journal line `исход=проба, не отправлено текст[0:120]=…`, exit 0; token, tail and network are untouched; any other value — exit 2 |
| `MONITOR_UNIT` (env; systemd sets it for `OnFailure=` handlers) | — | — | source tag `ПО ОТКАЗУ СЛУЖБЫ <unit>`; when set, it wins over the cgroup tag (see below) |
| `agent-alert --plain` | HTML | — | send as plain text; must be the first argument |
| `agent-alert -- <text>` | — | — | text that starts with "-" |
| `agent-alert --proverit-nastrojku` | — | — | check the configuration without sending (see "Verification"); takes no other arguments |
| `agent-alert -h`, `--help`, any other `-…` | — | — | refusal, exit 2, journal entry `исход=отказ-ключ`; nothing is sent |
| `otkaz-klyuch-watch --kursor <path>` | from settings | — | cursor file, overrides settings |
| `otkaz-klyuch-watch --kanal <path>` | from settings | — | channel, overrides settings |
| `otkaz-klyuch-watch --tolko-pechat` | off | — | only print the window: no sending, the cursor is not saved |
| `agent-alert-hvost-obrezka` | — | — | no arguments; any argument — exit 2, the tail is untouched |

Fixed in code, not configurable: the journal sees 120 characters; `flock` waits 5 s in the sender and 30 s in trimming; the watcher waits at most 120 s for the channel and puts at most 8 examples into an alert. The package units have no `Environment=`, and the live units have no drop-ins (`systemctl cat`, 2026-10-09).

The alert prefix is built in code as well: `[<short host name>] ⚠️ <source tag> · <text>`; with an empty tag it is `[<host>] <text>`. Since 2.0.2 (B-N-1830) `agent-alert` sets the tag by a positive sign: the unit is taken from its own cgroup (`/proc/self/cgroup`, the last `*.service` or `*.scope` name).

| Caller | Tag |
|---|---|
| `MONITOR_UNIT` is set (`OnFailure=` handler) | `ПО ОТКАЗУ СЛУЖБЫ <unit>` — checked first |
| a service that has a timer (`TriggeredBy` not empty) | no tag |
| a service without a timer: agent, gateway, daemon | `служба <unit>` |
| `cron.service` or `crond.service` | `по cron (<unit>)` |
| `session-*.scope`: ssh, sudo, console login | `ПОЗВАНО РУКОЙ (<scope>)` ("called by hand") — only this case |
| anything else: outside a unit, another `.scope` | `источник не установлен (<cgroup tail: over 64 characters — "…" and the last 63>)` ("source not established"); cgroup not read — `источник не установлен (cgroup не прочитан)` |

## Verification

The stands live in `test/` and run against a copy of the package. Network, journal, channel and `systemctl` are doubles, and state lives in temporary directories under `/tmp`. The stands do not touch the live tail or cursor.

| Stand | How to run | What to expect |
|---|---|---|
| `test/vse-stendy.sh` | `bash test/vse-stendy.sh` or `npm test` from the package root | one `STEND <name> <code>` line per stand; final exit code is the highest stand code: 0 all green, 1 some red, 2 blindness |
| `test/stend-agent-alert.sh` | through `vse-stendy.sh`; standalone: `AGENT_ALERT_BIN=<package>/bin/agent-alert bash test/stend-agent-alert.sh` | 45 checks (44 as root: the unreadability check is skipped and reported), 9 of them for the journal line of six formerly silent exits, 3 for the version in journal lines, 2 for no pyc on a manual run; 0 — all ok, 1 — some FAIL, 2 — the number of checks run differs from the expected one, or the stand failed to set up |
| `test/stend-nastroek-proby.py` | `python3 test/stend-nastroek-proby.py` (root is `TREVOGI_TEST_ROOT` or the parent of `test/`) | 15 unittest tests: probe, env/config precedence, refusal of unknown input, token not in argv or `/proc/self/cmdline`, token redaction from the response, trimming keeps inode and permissions, watcher settings; 0 / 1 |
| `test/stend-watch-hvost.py` | `python3 test/stend-watch-hvost.py` | 8 cursor and trimming tests: empty window, first call, channel failure and recovery, journal blindness, `--tolko-pechat`, refusal of unknown options; 0 / 1 |
| `test/stend-porchi.py` | `python3 test/stend-porchi.py` | 4 mutations on a temporary copy (`DSH_PROBA`, `PROBA_TEXT`, `TOKEN_ARGV`, `TOKEN_LOG`): each yields 0 → 1 → 0, insertion confirmed with `grep -cF` and a sha256 change; 0 — all passed, 1 — not |
| `test/stend-audit-kraev.py` | `python3 test/stend-audit-kraev.py` | 32 краевых методов без пропусков; реальные никто/group fixtures, внешние IO подставные · 32 edge methods without skips |
| `test/stend-audit-deadline.py` | `python3 test/stend-audit-deadline.py` | реальный helper timeout с отделившимся pipe-holder, short deadline0.1с; не живой120с-прогон · real helper with a scaled deadline and detached pipe holder |
| `test/stend-audit-yunits.py` | `python3 test/stend-audit-yunits.py` | systemd offline читает два unit, protection fault/return; не start/reload · two offline unit consumers, no host unit starts |
| `test/stend-audit-porchi.py` | `python3 test/stend-audit-porchi.py` | 19 источниковых порч0→1→0, точные числа замен/grep-F/SHA · 19 real source mutations with recovery |

The checks of the `agent-alert` record in `/etc/agent-registry/plugins.yaml`, verbatim:

```bash
# installed_check — the value must match the record's version field
sha256sum /usr/local/bin/agent-alert | cut -c1-16 | sed 's/^/sha256:/'
# healthcheck — prints «скрипт и секрет на месте», exit 0
test -x /usr/local/bin/agent-alert && test -s /etc/agent-alert/token && echo 'скрипт и секрет на месте'
```

The registry does not check the package's other files. Compare them with the candidate by checksum: `sudo sha256sum` on the paths from the "What gets installed and where" table.

Live checks without sending:

```bash
# configuration: 0 and «НАСТРОЙКА ГОДНА…» — usable; 2 and «ОТКАЗ НАСТРОЙКИ: …» lines — not. Telegram is not contacted
/usr/local/bin/agent-alert --proverit-nastrojku
# sender probe: exit 0, «проба, не отправлено»; the journal gets the outcome and the first 120 characters of the text
DSH_PROBA=1 /usr/local/bin/agent-alert -- 'проверка'
journalctl -t agent-alert -n 5 --no-pager
# watcher window without sending and without moving the cursor (needs journal and cursor read access)
sudo /usr/local/sbin/otkaz-klyuch-watch --tolko-pechat
# timer schedule and outcomes
systemctl list-timers otkaz-klyuch-watch.timer agent-alert-hvost-obrezka.timer
journalctl -t otkaz-klyuch-watch -t otkaz-klyuch-watch-vyvod --since -3d --no-pager
journalctl -u agent-alert-hvost-obrezka.service --since -3h --no-pager
```

Exit codes. `agent-alert`: 0 — Telegram answered `"ok":true`, a probe, or a usable configuration; 1 — empty text, no token or chat, Telegram refusal, network blocked after all attempts, text could not be prepared; 2 — option refusal, invalid `DSH_PROBA`, invalid configuration. Every refusal after which the alert was not sent leaves an `agent-alert` journal line «`исход=<reason> учётка=… ЮНИТ=… звал=…(PPID) <reason text>`»: `пустое-сообщение`, `отказ-DSH_PROBA`, `отказ-настроек`, `нет-токена-или-чата`, `формат-не-подготовлен` (since 3.1.5, B-N-2064; these six exits used to be silent), alongside the existing `отказ-ключ`, `нет-пути`, `нет-итога`. Since 3.1.6 the client path does the same: `итог-не-читается` and `отказ-отправителя` (spool sender code 65/66/69/1, formerly visible only under the `agent-alert-otpravitel` tag), with `путь=спул файл=<name>.msg` and no 🔴, so the queue watcher ignores them. The version in journal lines (`версия=`) is the `VERSIYA` constant in `lib/dsh-trevogi/nastrojki.py`, equal to `package.json` (since 3.1.6; formerly a 3.1.1 literal). The Python utilities (`agent-alert-otpravitel`, `otkaz-klyuch-watch`) never write bytecode (`sys.dont_write_bytecode`, since 3.1.7): a manual root run via the shebang used to leave `__pycache__` in `/usr/local/lib/dsh-trevogi/`. The alert text is not written to that line. Exit codes and output streams are unchanged. `otkaz-klyuch-watch`: 0 — window read, alert sent or not needed (this includes the first call and `--tolko-pechat`); 2 — journal blindness or the channel did not accept the alert, cursor unchanged; 2 — invalid argument/configuration/cursor; help exits0. `agent-alert-hvost-obrezka`: 0 — trimmed or nothing to trim; 2 — argument, configuration, missing tail, `flock` busy longer than 30 s.

## Limitations

- Exit 0 from `--proverit-nastrojku` ≠ «path unit verified»: «not visible from here» (empty `systemctl` answer, `DynamicUser` sandbox) also exits 0. A reader of the code alone has not checked the path unit — read the output line or call it as root (Veniamin LOW to 3.1.4, 15.10).
- The `исход=<reason>` line is written by `logger`; if it is missing or fails, the refusal is only in the exit code and output. A call that never happened leaves no line, and a caller that sends output to `/dev/null` loses the message — only the journal line remains.
- The `DSH_PROBA=1` mark protects only `agent-alert` from sending. It does not stop tail trimming or watcher cursor writes; test those only on temporary files. Nothing catches a probe that forgot the mark.
- `--proverit-nastrojku` cannot tell whether Telegram accepts the token or whether the chat exists: only a send can. `sadik-watch` calls the check as root, and root reads any file, so "the token is unreadable for the agent's account" is invisible from there.
- Network failures, non-JSON and temporary5xx/429 responses retry within the attempt limit. A permanent Telegram refusal ends the call on the first attempt. There is no overall time limit per call: by default up to 80 s of network waiting (3×20 + 5 + 15), with maximum settings up to 5700 s.
- Only the exact loaded token is redacted from the `curl` response. The filter does not see other secrets in the caller's text or encoded forms.
- The source tag judges the unit, not the run. A manual `systemctl start` of a service that has a timer cannot be distinguished from a scheduled run (no tag). A human who started a command through `systemd-run` is not caught: that is already a service or another scope. A service of the systemd user manager is named "служба". The tag does not prove that a call was a probe.
- If Python itself fails, or the limit or the encoding is invalid, both branches break, HTML and the plain fallback: exit 1, nothing sent.
- The sender does not create the tail. If the file is missing or not writable, `flock` is busy longer than 5 s, or the size limit is exceeded, the line goes to the journal only: the alert may be sent while the tail misses it. Tail growth shows up only as the journal line `хвост НЕ записан … обрезка … не работает?`; there is no alert for it.
- Since 3.1.8 the client (spool) path appends to the account tail only when it is set by the process environment (unit drop-in), after the sender result: `исход=доставлено(спул)` or `не-доставлено(спул,код-N)`. A config-set tail is written by the root sender instead. If the caller kills the client before the result (the memory guard sink waits 5 s), the tail misses the line while the spooled alert is still sent.
- Trimming does not notice that it was not called and does not see the file being replaced outside the lock. On sadik `sadik-watch` checks timer liveness; the package itself has no such watcher.
- The option-refusal watcher starts its first window at the current journal end, so refusals before the first call are not counted. Lines lost to journald rotation drop out of the window. It does not see other kinds of refusal or a sender that was never called. Journal blindness in a working call (without --tolko-pechat), including the first call, exits2 and attempts one blindness notice without changing the cursor.
- The watcher counts every `agent-alert` journal line that contains `исход=отказ-ключ`, including a probe or a delivered alert if those words fall within its first 120 characters.
- The stands do not test live delivery, timer liveness or journal rotation. New edge probes cover actual nobody permissions, primary groups and a held cursor lock. Without AGENT_ALERT_BIN, the sender stand tests its own package binary; it copies only lib/dsh-trevogi, never the whole /usr/local/lib.
- The registry sees only one package file, `/usr/local/bin/agent-alert`, and its record prescribes a direct edit (`sudo -e`). So the live edition can drift from the tree with no trace in the package. That happened with the B-N-1830 source tag (live since 2026-10-08); in 2.0.2 it was moved into the tree byte for byte (B-N-1872). As of 2026-10-09 every one of the package's 8 installed files has the same checksum as the live one; the `installed_check` of the `agent-alert` record is `sha256:49d6644a81f0ca46`.

## 3.1.1: уточнённый договор · Updated contract

Ключ здесь — CLI-опция, не токен бота. `-h/--help` — справка0, неизвестная опция — отказ2 без отправки. Все утилиты используют 0/1/2; сторож: 0 — прочитано/справка/восстановлен курсор, 2 — негодный ввод или слепота/доставка не подтверждена; 1 у сторожа штатно не используется. Отправщик: 0 — точный JSON ok:true, проба, help или годная настройка; 1 — отправка не состоялась/не подтверждена, постоянный отказ или исчерпаны попытки; 2 — ввод/настройка. Обрезка: 0 — обрезано/не нужно, 2 — ввод/настройка/IO/замок. Журналы: agent-alert; otkaz-klyuch-watch; stdout/stderr юнита сторожа — otkaz-klyuch-watch-vyvod; обрезка — журнал agent-alert-hvost-obrezka.service.

An option here means a CLI flag, not the bot token. Help exits0, unknown flags exit2 without sending. All utilities use0/1/2. Watcher:0 for a read/help/cursor recovery,2 for input, blindness or unconfirmed delivery;1 is not a normal watcher result. Sender:0 for exact JSON ok:true/probe/help/valid settings,1 for delivery failure/refusal/exhausted attempts,2 for input/settings. Trimmer:0 for success/no trim,2 for input/settings/IO/lock. Journal identifiers: agent-alert; otkaz-klyuch-watch; watcher unit output:otkaz-klyuch-watch-vyvod; trimmer unit journal:agent-alert-hvost-obrezka.service.

Требования: bash, python3 (stdlib), curl, flock, logger, ps, hostname, sed, grep, stat, tail, head, wc, tr, cut, date, readlink, mktemp, cat, rm; systemctl для метки источника, journalctl для сторожа. На Debian/Ubuntu logger — bsdutils. Root-таймеры не нуждаются в группе отправителей: root читает хвост и журнал. Права группы отправителей только на дописывание — обрезать такой хвост без чтения нельзя. Юниты явно User=root, NoNewPrivileges=true, ProtectSystem=full, ProtectHome=read-only, PrivateTmp=true; настройки/код в /etc и /usr защищены от записи процессом. Нестандартные cursor/tail под /home требуют отдельного согласованного исключения юнита; PrivateTmp не предназначен для постоянного state. Вне юнита сторожу нужны root/adm/systemd-journal: без положительного признака доступа он возвращает2 до чтения, не выдаёт пустое окно за ноль.

Requirements: bash, Python3 standard library, curl, flock, logger, ps, hostname, sed, grep, stat, tail, head, wc, tr, cut, date, readlink, mktemp, cat, rm; systemctl for source labels and journalctl for the watcher. Debian/Ubuntu provide logger in bsdutils. Timer units explicitly run as root with NoNewPrivileges, ProtectSystem=full, ProtectHome=read-only and PrivateTmp. Custom persistent paths under home require an approved unit exception; private temporary storage is not persistent state. Manual watcher calls require root/adm/systemd-journal; lack of this positive access marker exits2 before reading, rather than counting an inaccessible journal as an empty window.

До сводки отказов ключей сторож атомарно пишет `<курсор>.pending` (before/after/sent:false). При подтверждённой отправке сохраняет sent:true, затем новый курсор и снимает pending. Если тревога ушла, а курсор не записан —2 и именованный исход; следующий прогон только сохраняет курсор, повторно не шлёт. Если канал не ответил/вернул ошибку/процесс оборвался до sent:true — доставка неизвестна: pending остаётся, автоматических повторов этого окна нет. Гарантия — отсутствие автоматического повторного вызова окна, не доставка ровно один раз: внутренние повторы Telegram могут дать дубликат при потерянном ответе. Поддерживаются один nonblocking lock и атомарная первая запись. Сам journalctl ограничен30с, logger5с, канал120с; исходы не дают трассировок.

Before calling the channel for a refusal summary, the watcher atomically writes `<cursor>.pending` with before/after/sent:false. A confirmed send records sent:true, commits the cursor and removes pending. If sending succeeded but cursor commit failed, exit2 names it; the next invocation commits only and never resends. An error, timeout or crash before sent:true leaves delivery unknown: automatic replay of that window stops. This prevents repeated window calls, not exactly-once delivery: internal Telegram retries can duplicate a message after a lost response. The first cursor write is atomic; a nonblocking lock serializes writers. journalctl30s/logger5s/channel120s; failures have named results and no tracebacks.

Оператор разбирает pending по хвосту/каналу, сохранив его копию. Доказано доставлено — поставить sent:true в сохранённой записи и запустить для commit-only. Доказано НЕ отправлено — удалить pending после страховки, затем один осознанный повтор. Исход неизвестен — не удалять pending ради зелёного цвета: это сняло бы защиту от дубля. Read-only `--tolko-pechat` не меняет pending/курсор. Непрочитанное окно/порча журналов — СЛЕПОТА, не ноль событий. Подтверждение успеха канала равно его code0, не независимо доказанной Telegram-доставке.

An operator reconciles pending against the tail/channel, keeping a backup. Proven delivered: set sent:true in the saved record and invoke commit-only recovery. Proven not sent: remove pending after backup, then make one deliberate retry. Unknown: retain pending; deleting it only to get green removes duplicate protection. Print-only changes neither cursor nor pending. An unreadable/malformed journal is blindness, not zero events. Channel success means its code0; it is not independently verified Telegram delivery.

Дополнительный стенд `test/stend-audit-kraev.py`: 32 именованных тестов (включая реальные проверки nobody без пропусков). Для nonroot запусков watcher fixtures дают только процессу группу systemd-journal через sudo/setpriv, не меняя учётки и права. Требуются sudo/setpriv; внешние каналы/журнал подставные. Перечень `test/stend-audit-porchi.py` задаёт отдельные порчи. Живая модель, Telegram и таймеры не проверяются стендами.

Additional stand `test/stend-audit-kraev.py`:32 named tests, including actual nobody permissions without skips. Non-root watcher fixtures grant systemd-journal to the test process only via sudo/setpriv, never changing accounts or ACLs. The stand needs sudo/setpriv; external channels/journals are doubles. `stend-audit-porchi.py` provides source mutations. Tests do not validate live models, Telegram or timers.

На чистой Linux-машине без smontirovat-fajly установка выполняется назначенной рукой после проб на копии: install755 трёх bin в /usr/local/bin или sbin по таблице, install644 библиотеки и юнитов, заранее создать root-каталоги state/config и подготовить токен/chat-id через хозяина секретов. Группа из примера должна существовать (`getent group agent-button || sudo groupadd --system agent-button`). На нашей машине проверяльщик есть — применять команды smontirovat-fajly выше; группа/конфиги/службы автором не меняются. Файл курсора создаётся самим сторожем атомарно, родитель по default — /var/lib/dsh-trevogi/otkaz-klyuch.

On a clean Linux host without smontirovat-fajly, the assigned operator installs the executables755, library/units644, creates root-owned state/config directories and obtains token/chat-id from the secret owner. The example sender group must exist (`getent group agent-button || sudo groupadd --system agent-button`). Our host has the deployment checker: use the commands above. The author changes no groups/settings/services. The watcher creates its cursor atomically under the default /var/lib/dsh-trevogi/otkaz-klyuch parent.

Предупреждение о слепоте журнала — отдельный сигнал: один вызов канала за такт, может повторяться следующие сутки при продолжающейся слепоте. Pending защищает только прочитанное окно отказов. Дедлайн120с/30с/5с после timeout убивает группу и закрывает pipe, без бесконечного drain; ожидание прямого потомка после kill не более5с. Отделившийся собственным setsid потомок может продолжить работу: исход доставки остаётся неизвестным, это не доказательство отсутствия отправки.

Journal-blindness notices are a separate signal: one channel call per tick, repeated on later days while blindness continues. Pending protects only a read refusal window. Channel120s/journal30s/logger5s deadlines kill the process group and close pipes without an unbounded drain; direct-child wait after kill is bounded by5s. A descendant that creates another session may continue: delivery remains unknown, not proven absent.

## Хозяева и гости (3.1.10)

`agent-alert` всегда отправляет настроенным хозяевам: `AGENT_ALERT_CHAT_FILE` и второму `AGENT_ALERT_OWNER_CHAT_ID`. `/var/lib/alert-privratnik/spisok` добавляет только гостей. Весь файл проверяется строго; его отказ не отменяет основную тревогу хозяевам и вызывает отдельное уведомление им. Отказ гостя не меняет итог доставки хозяевам. Квота спула считает исходные тревоги. Формат, владельцы и настройка — [SETTINGS](docs/SETTINGS.md). Службу/список обслуживает Михалыч; выпуск sender ставится раньше службы.

Плохой список чинить сразу — каждая тревога приходит хозяевам дважды (основная + отказ списка).

Больше 50 валидных гостевых строк отвергают весь список; лимит считается до дедупа. Повтор номера гостя даёт одну отправку, порядок первого появления сохраняется.
