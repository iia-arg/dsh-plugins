# dsh-pribory 3.1.1 — девятнадцать приборов оболочки против самообмана агента

*English version — [below](#english).*

## Назначение

Агент знает правила «не меряй код возврата через конвейер», «выйди из каталога перед удалением», «не гаси процесс по маске» — и всё равно их нарушает: это попутные действия в конце команды, о них не думают. Записанное правило не держит, держит инструмент. Пакет собирает девятнадцать маленьких программ, каждая закрывает один такой класс: код, потерянный в конвейере (`progon`); гашение по маске, задевающей чужое (`pogasit`); удаление каталога, в котором стоишь (`ubrat`, `proba-v-katalog`); файл, пойманный таймером наполовину записанным (`polozhit`); тёзка в `PATH`, исполняемый вместо правленого (`dvojniki`); «кто перезапускал службу» по памяти, а не по следу `sudo` (`kto-podnimal`), и другие. Общее у всех — честный ноль: «не нашёл» и «не смог посмотреть» дают разные коды. У читающих приборов контракт один: `0` — сошлось, `1` — найдено расхождение, `2` — проверять нечем (слепота).

Пакет не плагин платформы и ничего не делает сам: каждую программу зовёт рука агента или человека, юнит, сторож или ворота. На боевой машине постоянные вызывающие такие: `skill-links.service` (по `skill-links.path`) зовёт `refresh-skill-links`; `istoriya-profilya.service` и `istoriya-profilya@<агент>.service` (по своим `.path`) зовут `istoriya-profilya`; сторож `podyom-mimo-vorot-watch` (таймер раз в 15 минут) зовёт `kto-podnimal`; `vypusk-tegom` зовёт `obyortka-krasneet`; `/usr/local/libexec/svodka/svodka-sostoyaniya.sh` зовёт `priznak-vzyatiya.mjs`; проверки живости реестра (`dsh-profile-patch-*`, `dsh-home-patch-*` дома главного агента, `dsh-schedule-guard`) зовут `dsh-dump-kopiya`. Остальные — ручные приборы агентов.

Друг от друга приборы не зависят. Пять из них опираются на соседей по машине: `sekrety-po-znacheniyu` грузит фильтр секретов ядра памяти (`FILTR_PUT`); `pokrytie-ozhidaniem-prob.mjs` и `obyortka-krasneet` обходят стенды пакетов; `dsh-dump-kopiya` зовёт платформу DSH на копии дома; `refresh-skill-links` спрашивает реестр агентов (`agent-registry pole <агент> navyki --json`), какие скиллы агенту разрешены. Поля `navyki` в реестре нет — ставится полный набор. Реестр не ответил или список `tolko` негоден — отказ, код `2`, ссылки не трогаются.

Ответ прибора — строки вывода и код возврата; читает их тот, кто позвал. Строки вывода на русском и служат интерфейсом: сторожа и стенды разбирают их как текст («СЛЕПОТА», «ИТОГ: …», «сверено с журналом ворот»), поэтому они не переводятся. Своих каналов тревоги у пакета нет.

## Что ставится и куда

На машине стоят все девятнадцать файлов `bin/`, но в три разных места. Пары «исходник в дереве ↔ боевой файл» для шестнадцати из них записаны в учёте Искры `/opt/<главный агент>/workspace/dorabotki/pary-boj.txt` (его сверяет `nashi-dorabotki.sh --check`). Три прибора (`iskat-miny-oblasti.mjs`, `pokrytie-ozhidaniem-prob.mjs`, `proba-obrezki.sh`) живут только в каталоге доработок Искры. Отдельной записи пакета в `/etc/agent-registry/plugins.yaml` нет; свои записи в разделе `services` есть у трёх приборов: `refresh-skill-links`, `agent-wake-cost`, `istoriya-profilya`.

| Файл в пакете | Путь на машине | Режим, владелец | Кто исполняет или читает |
|---|---|---|---|
| `bin/progon` | `/usr/local/bin/progon` | `0755 root:root` | рука агента; учёт применений пишет в `$HOME/workspace/.progon-primeneniya` |
| `bin/pogasit` | `/usr/local/bin/pogasit` | `0755 root:root` | рука агента |
| `bin/proba-v-katalog` | `/usr/local/bin/proba-v-katalog` | `0755 root:root` | рука агента |
| `bin/ubrat` | `/usr/local/bin/ubrat` | `0755 root:root` | рука агента |
| `bin/polozhit` | `/usr/local/bin/polozhit` | `0755 root:root` | рука агента и монтажа |
| `bin/dvojniki` | `/usr/local/bin/dvojniki` | `0755 root:root` | рука агента |
| `bin/kto-podnimal` | `/usr/local/bin/kto-podnimal` | `0755 root:root` | `podyom-mimo-vorot-watch.service` (таймер, 15 мин) и рука |
| `bin/kto-pravil-fajl` | `/usr/local/bin/kto-pravil-fajl` | `0755 root:root` | рука агента |
| `bin/obeimi-rukami` | `/usr/local/bin/obeimi-rukami` | `0755 root:root` | рука агента |
| `bin/obyortka-krasneet` | `/usr/local/bin/obyortka-krasneet` | `0755 root:root` | `vypusk-tegom` (ворота выпуска) и рука |
| `bin/sekrety-po-znacheniyu` | `/usr/local/bin/sekrety-po-znacheniyu` | `0755 root:root` | рука (читает хранилище `pass`) |
| `bin/istoriya-profilya` | `/usr/local/bin/istoriya-profilya` | `0755 root:root` | `istoriya-profilya.service` (`User=<главный агент>`) и `istoriya-profilya@<агент>` у четырёх агентов (`User=%i`) |
| `bin/dsh-dump-kopiya` | `/usr/local/bin/dsh-dump-kopiya` | `0755 root:root` | `healthcheck` записей `dsh-profile-patch-*`, `dsh-home-patch-*` дома главного агента, `dsh-schedule-guard` (от учётки агента) |
| `bin/agent-wake-cost` | `/usr/local/bin/agent-wake-cost` | `0755 root:root` | люди; `healthcheck` записи `agent-wake-cost` |
| `bin/refresh-skill-links` | `/usr/local/bin/refresh-skill-links` | `0755 root:root` | `skill-links.service` (`User=<главный агент>`), пишет ссылки в `/opt/<главный агент>/.claude/skills` |
| `bin/priznak-vzyatiya.mjs` | `/usr/local/libexec/svodka/priznak-vzyatiya.mjs` | `0755 root:root` | `/usr/local/libexec/svodka/svodka-sostoyaniya.sh` (`sudo -n node …`) |
| `bin/pokrytie-ozhidaniem-prob.mjs` | `/opt/<главный агент>/workspace/dorabotki/pokrytie-ozhidaniem-prob.mjs` | `0755 <главный агент>:<главный агент>` | рука |
| `bin/proba-obrezki.sh` | `/opt/<главный агент>/workspace/dorabotki/proba-obrezki.sh` | `0755 <главный агент>:<главный агент>` | рука |
| `bin/iskat-miny-oblasti.mjs` | `/opt/<главный агент>/workspace/dorabotki/iskat-miny-oblasti.mjs` | `0644 <главный агент>:<главный агент>` | рука: `node <файл> <проверяемый.js>` (строки `#!` нет) |

Файл настройки не входит в пакет, но нужен приборам: `/etc/dsh-pribory/dsh-pribory.conf` (`0644 root:root`, 22 ключа). Юниты `skill-links.{path,service}`, `istoriya-profilya.{path,service}`, `istoriya-profilya@.{path,service}`, `podyom-mimo-vorot-watch.{timer,service}` лежат в `/etc/systemd/system` и пакету не принадлежат. В бой не ставятся: `test/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. Поля `bin` в `package.json` нет намеренно: `npm install` не должен молча положить тёзок к уже стоящим в `/usr/local/bin`.

Что нужно на машине: bash 4+ (`declare -A` в `refresh-skill-links`, `mapfile` в `proba-obrezki.sh`); Node.js — для `.mjs` и `sekrety-po-znacheniyu` (на боевой машине 24.19.0); `python3` — `agent-wake-cost`, а также разбор журнала в `kto-podnimal`, JSON реестра в `refresh-skill-links`, грамматика Python в `polozhit`; Linux с systemd и journald — `kto-podnimal`, `kto-pravil-fajl`, `pogasit --unit`.

Дополнительные зависимости: agent-registry из a2a-bus с python3-yaml для refresh-skill-links; sudo -n для obeimi-rukami/kto-pravil-fajl и привилегированных вызовов; ss (iproute2), только TCP, для pogasit; zstd для .zstd журналов agent-wake-cost; pgrep/setsid (procps/util-linux) для obyortka-krasneet; pass/gpg и заданный фильтр для sekrety-po-znacheniyu. Последнему нужен Node ≥22.7 с обычным определением модулей; остальные .mjs тоже запускаются Node. Сам пакет ничего из этого не устанавливает.

## Установка

Ставит координатор по воротам, пофайлово, инструментом `smontirovat-fajly` — по одному вызову на каталог назначения. Источник — дерево `/opt/<главный агент>/workspace/dsh-plugins/packages/dsh-pribory`; для файлов из учёта пар инструмент сам требует, чтобы кандидат побайтно равнялся исходнику пары.

1. Прогон без записи (по умолчанию `smontirovat-fajly` ничего не пишет):

   ```bash
   sudo smontirovat-fajly --punkt <пункт> --progon <кандидат>/bin /usr/local/bin progon pogasit ubrat …
   sudo smontirovat-fajly --punkt <пункт> --progon <кандидат>/bin /usr/local/libexec/svodka priznak-vzyatiya.mjs
   sudo smontirovat-fajly --punkt <пункт> --progon <кандидат>/bin /opt/<главный агент>/workspace/dorabotki proba-obrezki.sh pokrytie-ozhidaniem-prob.mjs iskat-miny-oblasti.mjs
   ```

2. Те же строки с `--v-boj` вместо `--progon`. Страховка ложится в `/var/backups/montazh/<пункт>/`, файлы кладутся атомарно, суммы, режим и владелец сверяются; режим и владелец остаются как у боевого файла. Коды: `0` положено и сверено, `3` всё уже равно бою, `1` отказ на записи с откатом, `2` отказ до записи, `4` положено, но письмо хозяйке доработок не легло (монтаж в `/opt/<главный агент>/workspace/dorabotki` шлёт его Искре сам).
3. Новый прибор (имени ещё нет в бою) — с `--novyj`; добавить пару в `pary-boj.txt` — дело Искры.
4. Обновить отпечатки в записях `refresh-skill-links`, `agent-wake-cost`, `istoriya-profilya`, если менялись их файлы (`installed_check` — `sha256:` первых 16 знаков суммы).
5. Перезапускать нечего: приборы зовутся заново при каждом запуске. `daemon-reload` нужен только при правке юнитов, а они вне пакета.

Файл настройки `/etc/dsh-pribory/dsh-pribory.conf` монтаж пакета не трогает — его ставит и правит отдельная рука.

## Настройка

Файл `/etc/dsh-pribory/dsh-pribory.conf`, путь меняет `DSH_PRIBORY_CONF`. Формат: строки `КЛЮЧ=значение`; комментарий — только строка, начинающаяся с `#`; значение с « #» (пробел или таб перед `#`) — громкий отказ с именем ключа, код `2`; при повторе ключа берётся последнее. Порядок значения: довод или переменная прибора → файл → нейтральное умолчание; нет ничего — `СЛЕПОТА` или `ОТКАЗ` с именем ключа, код `2`, прибор ничего не делает.

| Ключ файла | Переменная выше файла | Прибор | Нет значения | Смысл |
|---|---|---|---|---|
| `WAKE_HOME` | `--home`, затем `DSH_HOME` | `agent-wake-cost` | СЛЕПОТА, `2` | дом DSH |
| `DVOJNIKI_DEREVYA` | `DVOJNIKI_DEREVYA` | `dvojniki` | СЛЕПОТА, `2` | деревья поиска тёзок через пробел |
| `ISTORIYA_AGENT` | первый довод | `istoriya-profilya` | ОТКАЗ, `2` | агент |
| `ISTORIYA_KATALOG` | — | `istoriya-profilya` | `$HOME/.dsh/profiles` | каталог профилей, шаблон с `{agent}` |
| `KTO_SLUZHBA` | первый довод | `kto-podnimal` | ОТКАЗ, `2` | служба |
| `KTO_OTKUDA` | — | `kto-podnimal` | разряд по виду юнита | «откуда» по юниту: `юнит[\|юнит]=текст;…` |
| `KTO_ZHURNAL_VOROT` | `ZHURNAL_VOROT` | `kto-podnimal` | сверки нет — СЛЕПОТА, `2` | журнал ворот подъёма |
| `KTO_PRAVIL_FAJL` | первый довод | `kto-pravil-fajl` | ОТКАЗ, `2` | проверяемый файл |
| `OBEIMI_RUKI` | — | `obeimi-rukami` | подсказка без перечня | известные руки для подсказки в отказе |
| `OBYORTKA_KATALOG` | первый довод | `obyortka-krasneet` | СЛЕПОТА, `2` | корень обхода стендов |
| `POKRYTIE_KOREN` | первый довод | `pokrytie-ozhidaniem-prob.mjs` | СЛЕПОТА, `2` | корень обхода стендов |
| `OBREZKA_IDIOMY`, `OBREZKA_OBLAST` | `IDIOMY`, `OBLAST` | `proba-obrezki.sh` | СЛЕПОТА, `2` | перечень идиом; перечень каталогов обхода |
| `OBREZKA_MANIFEST` | `MANIFEST_FAJL` | `proba-obrezki.sh` | ОСЛАБЛЕНИЕ: все находки — свои | учёт своих файлов |
| `OBREZKA_ISKL` | `ISKL` | `proba-obrezki.sh` | исключений нет | известные исключения |
| `PROBA_BEZOPASNYJ` | `PROBA_BEZOPASNYJ` | `proba-v-katalog` | `/` | куда выйти перед удалением |
| `SKILL_LINKS_SOURCES` | `SKILL_LINKS_SOURCES` | `refresh-skill-links` | СЛЕПОТА, `2`, ссылки не трогаются | источники скиллов через `:`, порядок — приоритет |
| `PS_KATALOG` | `PS_KATALOG` | `sekrety-po-znacheniyu` | хранилище не обойдено — СЛЕПОТА | хранилище `pass` |
| `SEKRETY_FAJLY` | — | `sekrety-po-znacheniyu` | только хранилище | файлы с секретами через пробел |
| `FILTR_PUT` | `FILTR_PUT` | `sekrety-po-znacheniyu` | СЛЕПОТА, `2` | модуль фильтра секретов ядра памяти |
| `UBRAT_KORNI` | — | `ubrat` | СЛЕПОТА, `2` | разрешённые корни уборки через пробел |
| `UBRAT_KUDA` | — | `ubrat` | `~` | куда советовать уйти, если стоял в удалённом |

У `sekrety-po-znacheniyu` (Node, `??`) пустая переменная `PS_KATALOG` или `FILTR_PUT` остаётся значением; у приборов на bash (`${X:-…}`) пустая проваливается в файл.

Переменные без ключа в файле (только окружение, из кода):

| Переменная | Прибор | Умолчание | Смысл |
|---|---|---|---|
| `DSH_PRIBORY_CONF` | все, кроме `progon`, `pogasit`, `polozhit`, `priznak-vzyatiya.mjs`, `iskat-miny-oblasti.mjs`, `dsh-dump-kopiya` | `/etc/dsh-pribory/dsh-pribory.conf` | путь файла настройки |
| `PROGON_UCHYOT` | `progon` | `$HOME/workspace/.progon-primeneniya` | файл учёта применений |
| `DVOJNIKI_PATH_KAT` | `dvojniki` | `/usr/local/bin /usr/local/sbin` | каталоги, чьих жителей ищут |
| `DVOJNIKI_GLUBINA` | `dvojniki` | `4` | глубина `find` по деревьям |
| `SVOYA_UCHYOTKA` | `kto-pravil-fajl` | `id -un` | своя учётка, отсеиваемая из следа `sudo` |
| `OBEIMI_KTO` | `obeimi-rukami` | нет — отказ | вторая рука |
| `POLOZHIT_PROGON` | `polozhit` | нет — прогона нет, предупреждение | команда прогона черновика до подмены; черновик — в `POLOZHIT_CHERNOVIK` |
| `POLOZHIT_SUMMA_PRI_SYOME` | `polozhit` | нет — цель не сверяется, предупреждение | сумма цели в момент съёма |
| `SKILL_LINKS_TARGET` | `refresh-skill-links` | `$HOME/.claude/skills` | каталог ссылок движка |
| `SKILL_LINKS_AGENT` | `refresh-skill-links` | `id -un` | чей набор брать из реестра агентов |

Доводы командной строки: `progon [-k N] [-g N] [-t] <команда…>`; `pogasit --port N | --unit ИМЯ [--sudo]`; `polozhit <файл> [--esli-summa X] < новое`; `kto-podnimal [служба] [окно, умолчание today]`; `kto-pravil-fajl [файл] [с-даты, умолчание — два дня назад]`; `istoriya-profilya [агент [--zavesti "строка первого коммита"]]` (`--zavesti` — только вторым доводом, после имени агента); `dsh-dump-kopiya <DSH_HOME> <каталог платформы>`; `agent-wake-cost [--home D] [--session S] [--details]`; `priznak-vzyatiya.mjs <корень> <имя…>`; `iskat-miny-oblasti.mjs <файл>`. Полная таблица вызовов и кодов — [docs/BIN.md](docs/BIN.md), ключи — [docs/SETTINGS.md](docs/SETTINGS.md), устройство и порядок поиска значения — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Проверка

Записей реестра у пакета целиком нет; у трёх приборов (`/etc/agent-registry/plugins.yaml`, раздел `services`):

- `refresh-skill-links`, `agent-wake-cost`, `istoriya-profilya` — `installed_check`: `sha256sum /usr/local/bin/<прибор> | cut -c1-16 | sed 's/^/sha256:/'`, должно совпасть с `version` записи.
- `healthcheck` `refresh-skill-links`: `/opt/<главный агент>/.claude/skills` — настоящий каталог, а не ссылка; оба источника (`/opt/agent-skills-local`, `/opt/agent-skills`) на месте; на полке больше нуля скиллов; одного имени в двух источниках нет.
- `healthcheck` `agent-wake-cost`: `agent-wake-cost --home /opt/<главный агент>/.dsh` отрабатывает без ошибки.
- `healthcheck` `istoriya-profilya`: `.path` Искры и четыре экземпляра `@<агент>` активны, последний `Result` каждой `.service` — `success`; иначе код `3`.
- Всё разом: `agent-plugins verify` и `agent-plugins list --health`. Пары «дерево ↔ бой» сверяет `nashi-dorabotki.sh --check` Искры.

Стенды `test/` зовутся по одному: `bash test/<стенд>`. Другой каталог приборов — `STEND_BIN` (настройка) или `STEND_PRIBOR` (один прибор). Боевые журналы и каталоги стенды не трогают — всё во временном каталоге. Читает боевое один стенд: `stend-kontrakt-kodov.sh` — журнал службы через `sudo -n journalctl`, `stend-skill-links.sh` использует только подставной реестр.

| Стенд | Что проверяет | Коды | Что нужно |
|---|---|---|---|
| `stend-nastrojki.sh` | разборщик файла настройки на bash, Python и Node; отказ с кодом `2` и именем ключа при пустой настройке; ключ доходит до `dvojniki`, `ubrat`, `refresh-skill-links`; « #» в значении — отказ у разборщиков и у 13 модулей | `0` всё сошлось, `1` нет; последняя строка `ИТОГ: N из M` | `python3`, `node`; `STEND_BIN` по желанию |
| `stend-kto-podnimal-bajty.sh` | `kto-podnimal` на записи `sudo` не в UTF-8; карта «откуда» из `KTO_OTKUDA`; учётка `agent-2_x` названа именем | `0` / `1`; последняя строка `итог: N из M` | `python3`: подставной `journalctl` стенд пишет сам и ставит первым в `PATH`; `STEND_PRIBOR`, `STEND_KONF` по желанию (`STEND_REZHIM`, `STEND_RUKA` — ручки подставы, стенд задаёт их сам) |
| `stend-kontrakt-kodov.sh` | ветка `exit 1` есть в строках кода; три исхода на подставном журнале ворот: нет журнала → `2`, журнал пуст при подъёмах → `1`, все записаны → `0` со строкой «сверено с журналом ворот» | `0` / `1` / `2`; `итог: … (расхождений N, слепот M)` | обязательно `STEND_SLUZHBA` — служба с подъёмом в журнале (без неё — `2`); `sudo -n journalctl`; окно — от последнего подъёма службы; `STEND_PRIBOR`, `STEND_KONF` по желанию |
| `stend-skill-links.sh` | `refresh-skill-links` на подставных источниках: дубль имени, пропавший источник, настоящий каталог в цели, цель-ссылка, поле `name` в `SKILL.md` | `0` / `1` / `2` (в том числе если число проверок ≠ ожидаемому) | подставной agent-registry задаётся стендом первым в PATH; ACL машины не читается; `STEND_PRIBOR` по желанию |

Что каждый стенд не ловит и как читать ответ прибора — [docs/GUARDS.md](docs/GUARDS.md); частые поломки — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Ограничения

- Приборы закрывают ошибку руки, а не умысел: агент с `sudo` обойдёт любой прямой командой.
- Действующие приборы трогают только названное точно: `pogasit` — порт или юнит, по маске командной строки никогда, несколько процессов на порту — отказ; `ubrat` — только внутри `UBRAT_KORNI` и не может увести вызывающую оболочку из удалённого каталога, только предупреждает; `proba-v-katalog` удаляет каталог всегда, даже при отказе команды.
- `polozhit` проверяет грамматику (`bash -n`, `node --check`, разбор Python), а не смысл правки; работу — только прогоном через `POLOZHIT_PROGON`.
- `progon` печатает код и число строк вывода, но не толкует код: у чужой команды `0/1/2` могут значить иное.
- `kto-podnimal` видит только подъёмы через `sudo`: подъём от root напрямую, таймером или изнутри службы называется по юниту, а не по лицу; людей под одной учёткой не различает. Код `0` значит и «сверено с журналом ворот» (последняя строка `ИТОГ: 0 — …`), и «подъёмов в окне не было» (строка «подъёмов службы в окне НЕ БЫЛО», строки `ИТОГ` нет) — различать их надо по выводу.
- `kto-pravil-fajl` разбирает имя программы и флаги, тела `sh -c` не читает; «правок нет» верно только для окна.
- `obeimi-rukami` годится только для читающих команд: команда исполняется дважды.
- `dvojniki` сравнивает тёзок по содержимому; черновики `*/workspace/kandidaty/` и `*/workspace/kandidat-*` вне области.
- `obyortka-krasneet` не судит стенд, который красный или слепой ещё до порчи; потомков, ушедших в свою сессию (`setsid`), не ловит.
- `pokrytie-ozhidaniem-prob.mjs` меряет наличие защиты от пропажи пробы, а не её верность; `proba-obrezki.sh` видит только идиомы из перечня; `iskat-miny-oblasti.mjs` не понимает замыканий, `var` и теневых объявлений; `priznak-vzyatiya.mjs` резолвит главный вход, а не `package.json`.
- `sekrety-po-znacheniyu` печатает только исход по форме, значений не печатает; его ответ — «наши известные значения фильтр опознаёт», а не «секрет не утечёт».
- `istoriya-profilya` отвечает «что и когда», а не «кто»; не откатывает; запускается только от учётки самого агента.
- `dsh-dump-kopiya` не защищает от записи через ссылку в иные файлы дома; пути в его выводе — пути временной копии `/tmp/dsh-dump-kopiya.*`; платформу он зовёт через NODE или node из PATH.
- `agent-wake-cost` считает только записанное в журналы сессий платформы (`$DSH_HOME/sessions/**/session*.jsonl*`): ход, который шёл в момент снятия и ещё не сброшен на диск, не попадёт в счёт.
- `refresh-skill-links` трогает только символические ссылки в каталоге цели; набор агента из реестра — это набор, а не граница безопасности.
- Стенды проверяют код пакета, а не боевые значения `/etc/dsh-pribory/dsh-pribory.conf`.

## Лицензия и авторы

MIT · Aleksandr Argelander (файл `LICENSE`). Авторы — команда Iia-arg.
---

<a id="english"></a>

# dsh-pribory — nineteen shell tools against an agent's self-deception

## Purpose

An agent knows the rules "don't measure an exit code through a pipeline", "leave a directory before deleting it", "don't stop a process by pattern" — and still breaks them: these are side actions at the end of a command, nobody thinks about them. A written rule does not hold, a tool does. The package collects nineteen small programs, each closing one such class: an exit code lost in a pipeline (`progon`); stopping by a pattern that hits someone else's process (`pogasit`); deleting the directory you stand in (`ubrat`, `proba-v-katalog`); a file caught half-written by a timer (`polozhit`); a `PATH` namesake executed instead of the edited one (`dvojniki`); "who restarted the service" from memory rather than from the `sudo` trace (`kto-podnimal`), and others. What they share is an honest zero: "found nothing" and "could not look" give different codes. Reading tools share one contract: `0` — matches, `1` — a divergence found, `2` — nothing to check with (blindness).

The package is not a platform plugin and does nothing by itself: each program is called by an agent's or a person's hand, a unit, a watcher or a gate. On the production machine the permanent callers are: `skill-links.service` (via `skill-links.path`) calls `refresh-skill-links`; `istoriya-profilya.service` and `istoriya-profilya@<agent>.service` (via their `.path` units) call `istoriya-profilya`; the `podyom-mimo-vorot-watch` watcher (timer every 15 minutes) calls `kto-podnimal`; `vypusk-tegom` calls `obyortka-krasneet`; `/usr/local/libexec/svodka/svodka-sostoyaniya.sh` calls `priznak-vzyatiya.mjs`; registry liveness checks (`dsh-profile-patch-*`, `dsh-home-patch-*` for the main agent's home, `dsh-schedule-guard`) call `dsh-dump-kopiya`. The rest are the agents' manual tools.

The tools do not depend on each other. Five of them rely on neighbours on the machine: `sekrety-po-znacheniyu` loads the memory core's secret filter (`FILTR_PUT`); `pokrytie-ozhidaniem-prob.mjs` and `obyortka-krasneet` walk package stands; `dsh-dump-kopiya` calls the DSH platform on a copy of the home; `refresh-skill-links` asks the agent registry (`agent-registry pole <agent> navyki --json`) which skills the agent is allowed. No `navyki` field in the registry — the full set is linked. The registry did not answer or the `tolko` list is invalid — refusal, code `2`, links untouched.

A tool answers with output lines and an exit code; whoever called it reads them. Output lines are in Russian and serve as an interface: watchers and stands parse them as text ("СЛЕПОТА", "ИТОГ: …", "сверено с журналом ворот"), so they are not translated. The package has no alert channels of its own.

## What gets installed and where

All nineteen `bin/` files are installed on the machine, but in three different places. "Tree source ↔ production file" pairs for sixteen of them are recorded in the main agent's ledger `/opt/<main agent>/workspace/dorabotki/pary-boj.txt` (checked by `nashi-dorabotki.sh --check`). Three tools (`iskat-miny-oblasti.mjs`, `pokrytie-ozhidaniem-prob.mjs`, `proba-obrezki.sh`) live only in the main agent's development directory. There is no separate package entry in `/etc/agent-registry/plugins.yaml`; three tools have their own entries in the `services` section: `refresh-skill-links`, `agent-wake-cost`, `istoriya-profilya`.

| File in the package | Path on the machine | Mode, owner | Who executes or reads it |
|---|---|---|---|
| `bin/progon` | `/usr/local/bin/progon` | `0755 root:root` | an agent's hand; writes the usage ledger to `$HOME/workspace/.progon-primeneniya` |
| `bin/pogasit` | `/usr/local/bin/pogasit` | `0755 root:root` | an agent's hand |
| `bin/proba-v-katalog` | `/usr/local/bin/proba-v-katalog` | `0755 root:root` | an agent's hand |
| `bin/ubrat` | `/usr/local/bin/ubrat` | `0755 root:root` | an agent's hand |
| `bin/polozhit` | `/usr/local/bin/polozhit` | `0755 root:root` | an agent's and the deployment's hand |
| `bin/dvojniki` | `/usr/local/bin/dvojniki` | `0755 root:root` | an agent's hand |
| `bin/kto-podnimal` | `/usr/local/bin/kto-podnimal` | `0755 root:root` | `podyom-mimo-vorot-watch.service` (timer, 15 min) and a hand |
| `bin/kto-pravil-fajl` | `/usr/local/bin/kto-pravil-fajl` | `0755 root:root` | an agent's hand |
| `bin/obeimi-rukami` | `/usr/local/bin/obeimi-rukami` | `0755 root:root` | an agent's hand |
| `bin/obyortka-krasneet` | `/usr/local/bin/obyortka-krasneet` | `0755 root:root` | `vypusk-tegom` (release gate) and a hand |
| `bin/sekrety-po-znacheniyu` | `/usr/local/bin/sekrety-po-znacheniyu` | `0755 root:root` | a hand (reads the `pass` store) |
| `bin/istoriya-profilya` | `/usr/local/bin/istoriya-profilya` | `0755 root:root` | `istoriya-profilya.service` (`User=<main agent>`) and `istoriya-profilya@<agent>` for four agents (`User=%i`) |
| `bin/dsh-dump-kopiya` | `/usr/local/bin/dsh-dump-kopiya` | `0755 root:root` | `healthcheck` of the `dsh-profile-patch-*`, `dsh-home-patch-*` for the main agent's home, `dsh-schedule-guard` entries (as the agent's account) |
| `bin/agent-wake-cost` | `/usr/local/bin/agent-wake-cost` | `0755 root:root` | people; `healthcheck` of the `agent-wake-cost` entry |
| `bin/refresh-skill-links` | `/usr/local/bin/refresh-skill-links` | `0755 root:root` | `skill-links.service` (`User=<main agent>`), writes links into `/opt/<main agent>/.claude/skills` |
| `bin/priznak-vzyatiya.mjs` | `/usr/local/libexec/svodka/priznak-vzyatiya.mjs` | `0755 root:root` | `/usr/local/libexec/svodka/svodka-sostoyaniya.sh` (`sudo -n node …`) |
| `bin/pokrytie-ozhidaniem-prob.mjs` | `/opt/<main agent>/workspace/dorabotki/pokrytie-ozhidaniem-prob.mjs` | `0755 <main agent>:<main agent>` | a hand |
| `bin/proba-obrezki.sh` | `/opt/<main agent>/workspace/dorabotki/proba-obrezki.sh` | `0755 <main agent>:<main agent>` | a hand |
| `bin/iskat-miny-oblasti.mjs` | `/opt/<main agent>/workspace/dorabotki/iskat-miny-oblasti.mjs` | `0644 <main agent>:<main agent>` | a hand: `node <file> <checked.js>` (no `#!` line) |

The settings file is not part of the package, but the tools need it: `/etc/dsh-pribory/dsh-pribory.conf` (`0644 root:root`, 22 keys). The units `skill-links.{path,service}`, `istoriya-profilya.{path,service}`, `istoriya-profilya@.{path,service}`, `podyom-mimo-vorot-watch.{timer,service}` live in `/etc/systemd/system` and do not belong to the package. Not installed: `test/`, `docs/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. There is deliberately no `bin` field in `package.json`: `npm install` must not silently add namesakes to the tools already in `/usr/local/bin`.

What the machine needs: bash 4+ (`declare -A` in `refresh-skill-links`, `mapfile` in `proba-obrezki.sh`); Node.js — for the `.mjs` tools and `sekrety-po-znacheniyu` (24.19.0 on the production machine); `python3` — `agent-wake-cost`, plus journal parsing in `kto-podnimal`, registry JSON in `refresh-skill-links`, Python syntax in `polozhit`; Linux with systemd and journald — `kto-podnimal`, `kto-pravil-fajl`, `pogasit --unit`.

## Installation

The coordinator installs it through the gate, file by file, with `smontirovat-fajly` — one call per target directory. The source is the tree `/opt/<main agent>/workspace/dsh-plugins/packages/dsh-pribory`; for files in the pair ledger the tool itself requires the candidate to be byte-equal to the pair's source.

1. A run without writing (by default `smontirovat-fajly` writes nothing):

   ```bash
   sudo smontirovat-fajly --punkt <item> --progon <candidate>/bin /usr/local/bin progon pogasit ubrat …
   sudo smontirovat-fajly --punkt <item> --progon <candidate>/bin /usr/local/libexec/svodka priznak-vzyatiya.mjs
   sudo smontirovat-fajly --punkt <item> --progon <candidate>/bin /opt/<main agent>/workspace/dorabotki proba-obrezki.sh pokrytie-ozhidaniem-prob.mjs iskat-miny-oblasti.mjs
   ```

2. The same lines with `--v-boj` instead of `--progon`. The backup goes to `/var/backups/montazh/<item>/`, files are placed atomically, sums, mode and owner are checked; mode and owner stay as on the production file. Codes: `0` placed and checked, `3` everything already equals production, `1` refusal while writing with rollback, `2` refusal before writing, `4` placed, but the letter to the development directory's owner did not go out (deployment into `/opt/<main agent>/workspace/dorabotki` sends it to the main agent by itself).
3. A new tool (its name is not yet in production) — with `--novyj`; adding a pair to `pary-boj.txt` is the main agent's job.
4. Update the fingerprints in the `refresh-skill-links`, `agent-wake-cost`, `istoriya-profilya` entries if their files changed (`installed_check` — `sha256:` plus the first 16 characters of the sum).
5. Nothing to restart: the tools are called afresh on each run. `daemon-reload` is needed only when units change, and they are outside the package.

The settings file `/etc/dsh-pribory/dsh-pribory.conf` is not touched by the package deployment — a separate hand installs and edits it.

## Configuration

The file `/etc/dsh-pribory/dsh-pribory.conf`; `DSH_PRIBORY_CONF` changes the path. Format: `KEY=value` lines; a comment is only a line starting with `#`; a value containing " #" (a space or tab before `#`) is a loud refusal naming the key, code `2`; for a repeated key the last one wins. Value order: the tool's argument or variable → the file → a neutral default; nothing at all — `СЛЕПОТА` or `ОТКАЗ` with the key name, code `2`, and the tool does nothing.

| File key | Variable above the file | Tool | No value | Meaning |
|---|---|---|---|---|
| `WAKE_HOME` | `--home`, then `DSH_HOME` | `agent-wake-cost` | BLINDNESS, `2` | the DSH home |
| `DVOJNIKI_DEREVYA` | `DVOJNIKI_DEREVYA` | `dvojniki` | BLINDNESS, `2` | namesake search trees, space-separated |
| `ISTORIYA_AGENT` | first argument | `istoriya-profilya` | REFUSAL, `2` | the agent |
| `ISTORIYA_KATALOG` | — | `istoriya-profilya` | `$HOME/.dsh/profiles` | the profiles directory, a template with `{agent}` |
| `KTO_SLUZHBA` | first argument | `kto-podnimal` | REFUSAL, `2` | the service |
| `KTO_OTKUDA` | — | `kto-podnimal` | class by unit kind | "from where" per unit: `unit[\|unit]=text;…` |
| `KTO_ZHURNAL_VOROT` | `ZHURNAL_VOROT` | `kto-podnimal` | no check — BLINDNESS, `2` | the start gate log |
| `KTO_PRAVIL_FAJL` | first argument | `kto-pravil-fajl` | REFUSAL, `2` | the file to check |
| `OBEIMI_RUKI` | — | `obeimi-rukami` | hint without a list | known hands for the refusal hint |
| `OBYORTKA_KATALOG` | first argument | `obyortka-krasneet` | BLINDNESS, `2` | stand walk root |
| `POKRYTIE_KOREN` | first argument | `pokrytie-ozhidaniem-prob.mjs` | BLINDNESS, `2` | stand walk root |
| `OBREZKA_IDIOMY`, `OBREZKA_OBLAST` | `IDIOMY`, `OBLAST` | `proba-obrezki.sh` | BLINDNESS, `2` | idiom list; list of walk directories |
| `OBREZKA_MANIFEST` | `MANIFEST_FAJL` | `proba-obrezki.sh` | WEAKENING: all findings counted as own | own-file ledger |
| `OBREZKA_ISKL` | `ISKL` | `proba-obrezki.sh` | no exceptions | known exceptions |
| `PROBA_BEZOPASNYJ` | `PROBA_BEZOPASNYJ` | `proba-v-katalog` | `/` | where to step out before removal |
| `SKILL_LINKS_SOURCES` | `SKILL_LINKS_SOURCES` | `refresh-skill-links` | BLINDNESS, `2`, links untouched | skill sources, `:`-separated, order = priority |
| `PS_KATALOG` | `PS_KATALOG` | `sekrety-po-znacheniyu` | store not walked — BLINDNESS | the `pass` store |
| `SEKRETY_FAJLY` | — | `sekrety-po-znacheniyu` | store only | secret files, space-separated |
| `FILTR_PUT` | `FILTR_PUT` | `sekrety-po-znacheniyu` | BLINDNESS, `2` | the memory core's secret filter module |
| `UBRAT_KORNI` | — | `ubrat` | BLINDNESS, `2` | allowed cleanup roots, space-separated |
| `UBRAT_KUDA` | — | `ubrat` | `~` | where to advise going if the caller stood in the removed directory |

In `sekrety-po-znacheniyu` (Node, `??`) an empty `PS_KATALOG` or `FILTR_PUT` variable stays the value; in the bash tools (`${X:-…}`) an empty one falls through to the file.

Variables without a file key (environment only, from the code):

| Variable | Tool | Default | Meaning |
|---|---|---|---|
| `DSH_PRIBORY_CONF` | all except `progon`, `pogasit`, `polozhit`, `priznak-vzyatiya.mjs`, `iskat-miny-oblasti.mjs`, `dsh-dump-kopiya` | `/etc/dsh-pribory/dsh-pribory.conf` | settings file path |
| `PROGON_UCHYOT` | `progon` | `$HOME/workspace/.progon-primeneniya` | usage ledger file |
| `DVOJNIKI_PATH_KAT` | `dvojniki` | `/usr/local/bin /usr/local/sbin` | directories whose residents are searched for |
| `DVOJNIKI_GLUBINA` | `dvojniki` | `4` | `find` depth in the trees |
| `SVOYA_UCHYOTKA` | `kto-pravil-fajl` | `id -un` | own account, filtered out of the `sudo` trace |
| `OBEIMI_KTO` | `obeimi-rukami` | none — refusal | the second hand |
| `POLOZHIT_PROGON` | `polozhit` | none — no run, a warning | a command to run the draft before replacement; the draft is in `POLOZHIT_CHERNOVIK` |
| `POLOZHIT_SUMMA_PRI_SYOME` | `polozhit` | none — target not checked, a warning | the target's sum at the moment it was taken |
| `SKILL_LINKS_TARGET` | `refresh-skill-links` | `$HOME/.claude/skills` | the engine's link directory |
| `SKILL_LINKS_AGENT` | `refresh-skill-links` | `id -un` | whose set to take from the agent registry |

Command-line arguments: `progon [-k N] [-g N] [-t] <command…>`; `pogasit --port N | --unit NAME [--sudo]`; `polozhit <file> [--esli-summa X] < new`; `kto-podnimal [service] [window, default today]`; `kto-pravil-fajl [file] [since-date, default two days ago]`; `istoriya-profilya [agent [--zavesti "first commit line"]]` (`--zavesti` only as the second argument, after the agent name); `dsh-dump-kopiya <DSH_HOME> <platform directory>`; `agent-wake-cost [--home D] [--session S] [--details]`; `priznak-vzyatiya.mjs <root> <name…>`; `iskat-miny-oblasti.mjs <file>`. The full table of calls and codes — [docs/BIN.md](docs/BIN.md), keys — [docs/SETTINGS.md](docs/SETTINGS.md), structure and the value lookup order — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Verification

The package as a whole has no registry entries; three tools do (`/etc/agent-registry/plugins.yaml`, `services` section):

- `refresh-skill-links`, `agent-wake-cost`, `istoriya-profilya` — `installed_check`: `sha256sum /usr/local/bin/<tool> | cut -c1-16 | sed 's/^/sha256:/'`, must match the entry's `version`.
- `refresh-skill-links` `healthcheck`: `/opt/<main agent>/.claude/skills` is a real directory, not a link; both sources (`/opt/agent-skills-local`, `/opt/agent-skills`) are present; the shelf has more than zero skills; no name exists in both sources.
- `agent-wake-cost` `healthcheck`: `agent-wake-cost --home /opt/<main agent>/.dsh` runs without error.
- `istoriya-profilya` `healthcheck`: the main agent's `.path` and four `@<agent>` instances are active, the last `Result` of each `.service` is `success`; otherwise code `3`.
- Everything at once: `agent-plugins verify` and `agent-plugins list --health`. The main agent's `nashi-dorabotki.sh --check` checks the "tree ↔ production" pairs.

The `test/` stands are run one at a time: `bash test/<stand>`. Another tool directory — `STEND_BIN` (settings) or `STEND_PRIBOR` (a single tool). The stands do not touch production journals or directories — everything happens in a temporary directory. One stand reads production data: `stend-kontrakt-kodov.sh` reads the service journal via `sudo -n journalctl`, `stend-skill-links.sh` reads a private substitute registry.

| Stand | What it checks | Codes | What it needs |
|---|---|---|---|
| `stend-nastrojki.sh` | the settings parser in bash, Python and Node; refusal with code `2` naming the key on empty settings; a key reaches `dvojniki`, `ubrat`, `refresh-skill-links`; " #" in a value is refused by the parsers and by 13 modules | `0` all match, `1` not; last line `ИТОГ: N из M` | `python3`, `node`; optionally `STEND_BIN` |
| `stend-kto-podnimal-bajty.sh` | `kto-podnimal` on a non-UTF-8 `sudo` record; the "from where" map from `KTO_OTKUDA`; the `agent-2_x` account named by its name | `0` / `1`; last line `итог: N из M` | `python3`: the stand writes the stand-in `journalctl` itself and puts it first on `PATH`; optionally `STEND_PRIBOR`, `STEND_KONF` (`STEND_REZHIM`, `STEND_RUKA` are the stand-in's knobs, the stand sets them itself) |
| `stend-kontrakt-kodov.sh` | an `exit 1` branch exists in code lines; three outcomes on a stand-in gate log: no log → `2`, empty log with starts → `1`, all recorded → `0` with the line "сверено с журналом ворот" | `0` / `1` / `2`; `итог: … (расхождений N, слепот M)` | `STEND_SLUZHBA` is required — a service with a start in its journal (without it — `2`); `sudo -n journalctl`; the window starts at the service's last start; optionally `STEND_PRIBOR`, `STEND_KONF` |
| `stend-skill-links.sh` | `refresh-skill-links` on stand-in sources: duplicate name, missing source, real directory in the target, target as a link, the `name` field in `SKILL.md` | `0` / `1` / `2` (also when the number of checks ≠ expected) | the stand provides a private agent-registry first on PATH; host ACL is not read; optionally `STEND_PRIBOR` |

What each stand does not catch and how to read a tool's answer — [docs/GUARDS.md](docs/GUARDS.md); common failures — [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Limitations

- The tools close a hand's error, not intent: an agent with `sudo` bypasses any of them with a direct command.
- Acting tools touch only what is named exactly: `pogasit` — a port or a unit, never a command-line pattern, several processes on a port — refusal; `ubrat` — only inside `UBRAT_KORNI`, and it cannot move the calling shell out of the removed directory, only warn; `proba-v-katalog` always removes the directory, even if the command fails.
- `polozhit` checks syntax (`bash -n`, `node --check`, Python parsing), not the meaning of the edit; behaviour only by a run via `POLOZHIT_PROGON`.
- `progon` prints the code and the number of output lines, but does not interpret the code: for someone else's command `0/1/2` may mean something else.
- `kto-podnimal` sees only starts through `sudo`: a start by root directly, by a timer or from inside a service is named by unit, not by person; it does not tell apart people under one account. Code `0` means both "checked against the gate log" (last line `ИТОГ: 0 — …`) and "no starts in the window" (the line "подъёмов службы в окне НЕ БЫЛО", no `ИТОГ` line) — tell them apart by the output.
- `kto-pravil-fajl` parses the program name and flags, not `sh -c` bodies; "no edits" holds only for the window.
- `obeimi-rukami` is only for reading commands: the command runs twice.
- `dvojniki` compares namesakes by content; drafts in `*/workspace/kandidaty/` and `*/workspace/kandidat-*` are out of scope.
- `obyortka-krasneet` does not judge a stand that is red or blind before corruption; it does not catch children that went into their own session (`setsid`).
- `pokrytie-ozhidaniem-prob.mjs` measures the presence of a lost-probe guard, not its correctness; `proba-obrezki.sh` sees only idioms from its list; `iskat-miny-oblasti.mjs` does not understand closures, `var` or shadowing; `priznak-vzyatiya.mjs` resolves the main entry, not `package.json`.
- `sekrety-po-znacheniyu` prints only the form-based outcome, never values; its answer is "the filter recognises our known values", not "the secret will not leak".
- `istoriya-profilya` answers "what and when", not "who"; it does not roll back; it runs only as the agent's own account.
- `dsh-dump-kopiya` does not guard against writes through a link into other home files; the paths in its output are those of the temporary copy `/tmp/dsh-dump-kopiya.*`; it calls the platform through NODE or node from PATH.
- `agent-wake-cost` counts only what is written to the platform session logs (`$DSH_HOME/sessions/**/session*.jsonl*`): a turn running at the moment of the snapshot and not yet flushed to disk is not counted.
- `refresh-skill-links` touches only symbolic links in the target directory; the agent's set from the registry is a set, not a security boundary.
- The stands check the package code, not the production values of `/etc/dsh-pribory/dsh-pribory.conf`.

## License and authors

MIT · Aleksandr Argelander (the `LICENSE` file). Authors — the Iia-arg team.

## 3.1.1: уточнения · 3.1.1 clarifications

Additional dependencies: agent-registry from a2a-bus with python3-yaml for refresh-skill-links; noninteractive sudo for obeimi-rukami/kto-pravil-fajl and privileged calls; ss (iproute2), TCP only, for pogasit; zstd for compressed agent-wake-cost journals; pgrep/setsid (procps/util-linux) for obyortka-krasneet; pass/gpg and the configured filter for sekrety-po-znacheniyu. Node ≥22.7 with default module detection is required for the extensionless secret tool. The package does not install these dependencies itself.

Версия пакета 3.1.1. На этой машине приборы устанавливаются пофайлово по таблице выше, test/docs не монтируются в /usr/local/bin; установленной целой npm-копии пакет не требует. Для автономной локальной проверки можно получить архив командой npm pack --offline --ignore-scripts --pack-destination <каталог архивов>, затем npm install --offline --ignore-scripts <полный путь к полученному dsh-pribory-3.1.1.tgz> в отдельном каталоге. Это локальная установка для проверки, не публикация и не монтаж действующих приборов.

Package version is 3.1.1. This host deploys tools by individual file using the table above; test/docs are not installed in /usr/local/bin, and a whole npm package copy is not required in production. For an isolated local check use npm pack --offline --ignore-scripts --pack-destination <archive directory>, then npm install --offline --ignore-scripts <full path to the resulting dsh-pribory-3.1.1.tgz> in a separate directory. This is local test installation, not publication or deployment of running tools.

Проверка: добавлен python3 test/stend-audit-runtime.py — реальные приборы на временных файлах и подставных systemctl/journalctl/sudo/ss/сигналах, без живых сторожей и тревог. stend-skill-links теперь подставляет свой реестр и не читает ACL машины. stend-kontrakt-kodov без STEND_SLUZHBA или доступного журнала даёт честную слепоту2; для копийной приёмки ему даются подставные служба и journalctl. Список вариантов, исходов, ограничений и кодов — docs/BIN.md.

Checks: python3 test/stend-audit-runtime.py executes real tools on temporary files with substitute systemctl/journalctl/sudo/ss/signals, without live watchers or alerts. stend-skill-links now supplies its own registry and does not read the host ACL. stend-kontrakt-kodov without STEND_SLUZHBA or a readable journal honestly returns blindness2; isolated acceptance gives it a substitute service and journalctl. See docs/BIN.md for the call forms, outcomes and limits.

На свежем HOME без workspace вызов progon false сначала сообщает две строки stderr: «учёт применений НЕ записан…» и «замер идёт, но счёт применений занижается…», затем «progon: код=1». Задайте PROGON_UCHYOT доступным файлом, если нужен учёт; код проверяемой команды не меняется. Число инструментов остаётся19.

On a fresh HOME without workspace, progon false first prints two stderr accounting warnings (“not recorded”, then “measurement continues but usage is understated”), then “progon: код=1”. Set PROGON_UCHYOT to a writable file for accounting; the measured command’s exit code is unchanged. The tool inventory remains19.
