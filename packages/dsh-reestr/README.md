# dsh-reestr — реестр вмешательств машины с агентами DSH и приборы, которые держат его честным

Версия · Version: 3.1.3

*English version — [below](#english).*

> Пакет вырос из машинной редакции одной машины (sadik). В 3.1.1 (аудит 16) перечни учётов, мест монтажа, плагинов, пресета и внешних проверок вынесены в настройку; прочие умолчания перечислены в SETTINGS: перечни и внешние команды задаются переменными окружения (`docs/SETTINGS.md`), без них команда отвечает СЛЕПОТОЙ «не задан» или пропускает блок с явной строкой. Пути вида `/opt/iskra/…` в таблице «Что ставится и куда» — раскладка sadik, пример, а не требование.

## Назначение

На машине с несколькими агентами поверх платформы копятся плагины, скрипты, юниты и правки чужих пакетов. Пакет держит одно правило: всё поставленное записано в реестр (`/etc/agent-registry/plugins.yaml`) с командой проверки версии и, при желании, отпечатка; расхождение записанного с машиной — тревога, а не находка через неделю.

Работа с реестром идёт через `agent-plugins`: `list`, `check`, `verify`, `diff` только читают, `pravka` — единственная подкоманда, которая пишет, и пишет она только сам реестр. `verify` сверяет каждую запись по её `installed_check`/`fingerprint_check`; запись, у которой своего `installed_check` нет, может быть учтена пакетной записью через поле `uchteno_v` (с 2.0.10, см. «Проверка»); затем идёт обратная сверка: места агентов из реестра агентов → записи. Раз в сутки `registry-watchdog` зовёт `agent-plugins verify` (через `sudo -n`), проверку реестра агентов, учёт доработок и `agent-plugins list --health` и отдаёт расхождение или слепоту в канал тревог. `nezafiksirovano-watch` по своему таймеру ищет незакоммиченное в git-учётах машины. Остальные приборы (`sverka-montazha`, `priznak-oblasti-podklyucheniya`, `srez-obshchego-kataloga`, `sverka-zavisimostej`, `agent-plugins-lock-check`, `preset-sverka`, `shvy-mezhdu-paketami-watch`) закрывают слепые места самого реестра; их зовут руками, а `preset-sverka` и `shvy-mezhdu-paketami-watch` ещё и через `healthcheck` своих записей, то есть из ночного прогона сторожа.

Читают результат люди и агенты машины: коды возврата, вывод в журнал и тревоги в канал (`/usr/local/bin/agent-alert` по умолчанию). Сам пакет на sadik учтён записью `dsh-reestr` в `/etc/agent-registry/plugins.yaml` (`derevo.ref: dsh-reestr-v<версия>`, 11 мест в `derevo.files`); пять пофайловых записей его команд учтены через неё (`uchteno_v: dsh-reestr`).

## Что ставится и куда

Пакет содержит шаблон `systemd/registry-watchdog.service` и установленную вставку `systemd/registry-watchdog.service.d/60-bash-padenie-70.conf`, сохраняющую `--avto-montazh`. Сам шаблон на sadik не монтируется; вставка входит в `derevo.files`. Места, режимы и владельцы — из `derevo.files` записи `dsh-reestr`; байты каждого места равны файлу метки.

| файл в пакете | место на sadik | режим / владелец | кто исполняет / читает |
|---|---|---|---|
| `bin/agent-plugins` | `/usr/local/bin/agent-plugins` | 0755 root:root | люди, агенты, ворота и монтаж; `registry-watchdog` (`VERIFY_CMD`, `HEALTH_CMD`) |
| `bin/agent-plugins-lock-check` | `/usr/local/sbin/agent-plugins-lock-check` | 0755 root:root | рука |
| `bin/registry-watchdog.sh` | `/usr/local/sbin/registry-watchdog.sh` | 0755 root:root | `registry-watchdog.timer` (юнит — вне пакета) |
| `bin/nezafiksirovano-watch` | `/usr/local/sbin/nezafiksirovano-watch` | 0755 root:root | `nezafiksirovano-watch.timer` (юнит — вне пакета) |
| `bin/shvy-mezhdu-paketami-watch` | `/usr/local/sbin/shvy-mezhdu-paketami-watch` | 0755 root:root | `healthcheck` своей записи (через `sudo -n`), рука |
| `bin/preset-sverka` | `/usr/local/bin/preset-sverka` | 0755 root:root | `healthcheck` своей записи, рука |
| `bin/sverka-montazha.sh` | `/opt/iskra/workspace/dorabotki/sverka-montazha.sh` | 0755 iskra:iskra | рука |
| `bin/sverka-zavisimostej.sh` | `/opt/iskra/workspace/dorabotki/sverka-zavisimostej.sh` | 0755 iskra:iskra | рука |
| `bin/priznak-oblasti-podklyucheniya.sh` | `/opt/iskra/workspace/dorabotki/priznak-oblasti-podklyucheniya.sh` | 0755 iskra:iskra | рука |
| `bin/srez-obshchego-kataloga.sh` | `/opt/iskra/workspace/dorabotki/srez-obshchego-kataloga.sh` | 0755 iskra:iskra | рука, своей учёткой на каждом узле |
| — (рука, затем `pravka`) | `/etc/agent-registry/plugins.yaml` — реестр | 0664 root:agent-registry | `agent-plugins`, `sverka-montazha`, стенды |
| — (создаёт `pravka`) | `/var/backups/montazh/<пункт>/plugins.yaml.bak-pre-pravka-ГГГГММДД-ЧЧММСС` — копии до правки | владелец и группа реестра | `agent-plugins pravka`, её ротация |

Четыре места в `dorabotki` ещё учитывает `nashi-dorabotki.sh` (учёт доработок Искры, вне пакета). Имена команд в `package.json` (`bin`) — для npm; на sadik пакет через npm не ставится, команды лежат под именами файлов (`registry-watchdog.sh`, `sverka-montazha.sh` и т. д.). Вставка registry-watchdog также учитывается пакетом и сохраняется при выпуске 3.1.1.

В бой не ставятся (`not_installed` записи): `test/`, `docs/` (`ARCHITECTURE.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`), `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. На 09.10 три стенда лежат побайтно равными копиями в `/opt/iskra/workspace/dorabotki/` (`stend-pravki-reestra.sh`, `stend-priznaka-oblasti.sh`, `stend-storozha-reestrov.sh`); `stend-krug-samoproverki.sh`, `stend-uchteno-v.sh` и `stend-nahodok-audita-16.sh` там нет — их гоняют из дерева.

## Установка

Нужны Linux с systemd (`systemctl`, `journalctl`), Python 3 не ниже 3.9 с PyYAML (`agent-plugins`, `preset-sverka`, шебанг `/usr/bin/env python3`), Bash, git, `logger`, Node.js (`sverka-zavisimostej.sh`, `priznak-oblasti-podklyucheniya.sh`, `srez-obshchego-kataloga.sh`), `curl`, `npm` и `tar` для `agent-plugins diff`, `sudo -n` для приборов, которые читают закрытые каталоги. Снаружи пакета — команда тревоги (на sadik `agent-alert`; договор — `docs/SETTINGS.md`, «Команда тревоги») и, если заданы, внешние проверки сторожа `AGENTS_VERIFY_CMD` (на sadik `agent-registry verify`) и `DORABOTKI_CMD` (на sadik `nashi-dorabotki.sh --check`). Текущая версия пакета — `package.json` и `CHANGELOG.md`.

**На sadik.** Пакет не ставится целиком: каждое из мест из `derevo.files` меняется своим порядком — новый номер в дереве, ворота, пофайловый монтаж с метки, затем запись реестра (порядок из CHANGELOG 2.0.10: метка → инструмент → реестр). Правка боя мимо дерева запрещена (B-N-1922).

```bash
sudo smontirovat-fajly --punkt <пункт> --progon <каталог кандидата> /usr/local/bin agent-plugins   # план, без записи (умолчание — прогон)
sudo smontirovat-fajly --punkt <пункт> --v-boj  <каталог кандидата> /usr/local/bin agent-plugins   # в бой, со страховкой
```

После монтажа — новое значение `version` записи `dsh-reestr` (сумма по мест из `derevo.files`ам, форма `sha256:<16 знаков>`; команда — её `installed_check`) и `ref` метки через `agent-plugins pravka`, затем `agent-plugins verify`.

**На другой машине.** Команды ставятся по `PATH` (`npm install -g` — десять ссылок из `bin`). Реестр — `/etc/agent-registry/plugins.yaml` (другой путь — `PLUGINS_REGISTRY`, о подмене каждый вызов предупреждает в stderr); пакет его не создаёт: нет файла — `agent-plugins` выходит кодом 2 «реестр не прочитан». Первую редакцию кладёт рука, дальнейшие — только `agent-plugins pravka`. `verify` требует и реестр агентов (`/etc/agent-registry/agents.yaml` или `AGENTS_REGISTRY`; форма — `agenty[].imya`, `agenty[].namerenie.dom`): без него код 2 при любом реестре вмешательств. Записи без `healthcheck` сторож считает против `HEALTH_UNCHECKED_MAX` (умолчание 0): либо давайте каждой записи `healthcheck`, либо поднимите порог. Перечни сторожей и приборов задаются переменными — `docs/SETTINGS.md`.

Таймеры и остальная машинная настройка сторожей вне пакета; шаблон service и вставка registry-watchdog входят в пакет. На sadik они устроены так (`systemctl cat registry-watchdog.service nezafiksirovano-watch.service`):

- `registry-watchdog.service`: `Type=oneshot`, `User=iskra`, `Group=iskra`, `StateDirectory=registry-watchdog`, drop-in `10-nahodka-ne-otkaz.conf` (`SuccessExitStatus=1`) и `60-bash-padenie-70.conf` (запуск через `/usr/local/bin/bash-padenie-70`); таймер `OnCalendar=*-*-* 07:30:00 UTC`, `Persistent=true`, `AccuracySec=1min`. Свой файл настройки `/etc/registry-watchdog/registry-watchdog.conf` (вне пакета) задаёт там `VERIFY_CMD`, `AGENTS_VERIFY_CMD="sudo -n /usr/local/bin/agent-registry verify"`, `DORABOTKI_CMD`, `HEALTH_CMD` и пороги.
- `nezafiksirovano-watch.service`: `Type=oneshot`, `User=root`, `SuccessExitStatus=1 2`, `TimeoutStartSec=10min`, drop-in `60-python-padenie-70.conf`; таймер `OnCalendar=*-*-* 00/6:15:00 UTC`, `Persistent=true`.

## Настройка

Файла настройки у пакета нет: каждая команда читает свои переменные окружения; полная таблица переменных, умолчаний и исходов при пустом значении — `docs/SETTINGS.md`. Для перечисленных перенесённых настроек машинного умолчания нет: без переменной команда отвечает СЛЕПОТОЙ «не задан» или пропускает блок с явной строкой. Исключение — `registry-watchdog.sh`: он подключает свой файл `REGWD_CONF` после умолчаний, и значения файла сильнее окружения; файл принимается, только если он root или учётки сторожа и не доступен на запись группе и всем — иначе не читается, и это СЛЕПОТА с причиной.

Доводы команд:

| команда | доводы |
|---|---|
| `agent-plugins` | `list [--health [--avto-montazh]]` · `check` · `verify [--avto-montazh]` · `diff [--full] [<id> …]` · `pravka <новый-файл> [--osnova <sha256, 16–64 знака>] [--ustanovit --punkt <пункт>] [--tekushchij-sloman] [--razreshit-ubyl]` · `-h`/`--help`/`help`. Незнакомый довод — отказ 3 (до чтения реестра), незнакомая подкоманда — справка и код 2. Реестр задаётся `PLUGINS_REGISTRY`, довода `--reestr` нет. При установке `--punkt` (латиница, цифры, `. _ -`) и `--osnova` обязательны |
| `agent-plugins-lock-check` | `[root]` (по умолчанию `/opt/agent-plugins`), `--shelf <каталог архивов>` (по умолчанию `<root>/../agent-plugins-tarbally`); ошибка вызова — код 2 |
| `srez-obshchego-kataloga.sh` | `[каталог]` (по умолчанию `/opt/agent-plugins`); `--help` — справка, код 0; иной ключ или лишний довод — отказ, код 2 |
| `registry-watchdog.sh` | `[--avto-montazh]`; `--help` — справка, код 0; любой иной довод — отказ, код 2, ничего не запущено (ни состояния, ни тревоги) |
| `nezafiksirovano-watch`, `preset-sverka` | без доводов; любой довод — «ОТКАЗ», код 2, без тревоги |
| `shvy-mezhdu-paketami-watch`, `sverka-montazha.sh`, `sverka-zavisimostej.sh`, `priznak-oblasti-podklyucheniya.sh` | без доводов; доводов не читают |

## Проверка

Одной командой: `npm test` (то же — `bash test/progon-na-podstave.sh`) от учётки с `sudo -n`, не от root: временный корень с образцом реестра, затем шесть стендов на инструментах этого пакета — итог «зелёных 6 из 6», код 0. Каждый стенд, его переменные и ожидаемый исход — `docs/GUARDS.md`, «Стенды»; `stend-krug-samoproverki` трогает живые таймеры и гоняется только вручную.

Записи реестра sadik. Пакет учтён записью `dsh-reestr`: `version` — `sha256:<16 знаков>` от сумм мест из `derevo.files` (`installed_check`: `sha256sum` файлов из `derevo.files`, сортировка по пути, сумма от этого перечня), `healthcheck` — `test -x` для `agent-plugins` и `registry-watchdog.sh`, `derevo` — дерево `/opt/iskra/workspace/dsh-plugins`, `ref: dsh-reestr-v<версия>`, `subdir: packages/dsh-reestr`, `files` с режимом и владельцем и перечень `not_installed`. Пять пофайловых записей — `agent-plugins`, `registry-watchdog`, `preset-sverka`, `shvy-mezhdu-paketami-watch`, `nezafiksirovano-watch` — своей `version` не несут и учтены полем `uchteno_v: dsh-reestr`; свои проверки у них остались: `registry-watchdog` — `fingerprint` файла `/etc/registry-watchdog/registry-watchdog.conf` и `healthcheck` (таймер активен, прогон моложе 48 ч); `agent-plugins` — `agent-plugins list`; `nezafiksirovano-watch` — `systemctl is-active nezafiksirovano-watch.timer`; `preset-sverka` — сам прибор; `shvy-mezhdu-paketami-watch` — прибор через `sudo -n`, код 3 переводится в 1. У `agent-plugins-lock-check` и четырёх мест `dorabotki` отдельных записей нет. Свести всё разом: `agent-plugins verify` (0 — записанное совпадает с машиной).

Поле `uchteno_v: <id пакетной записи>` (`verify`, с 2.0.10). Действует у записи без своего `installed_check`. Запись годна, если: в ней нет `version` (иначе «двойной учёт»); пакетная запись есть, это не она сама, и у пакетной есть `installed_check`; файл записи — **первый абсолютный путь её `path`** (`source.address` не берётся) — стоит в `derevo.files[].local` пакетной записи и целым токеном в её `installed_check`. Годная печатается строкой `учтено <id>: через запись <пакет> …`, в итоге — «учтено через пакетные записи: N»; свой `fingerprint`, если задан, сверяется как прежде. Негодная — `РАСХОЖДЕНИЕ <id> uchteno_v: <причина>`, код 1.

Коды самих команд — `docs/GUARDS.md`, «Коды по командам».

## Окно монтажа · Deployment window

Сохранён договор B-N-2025/B-N-2032: `verify --avto-montazh`, `list --health --avto-montazh` и `registry-watchdog --avto-montazh` возвращают 4 («ОТЛОЖЕНО»), когда расхождение покрыто живым адресным окном. Без ключа сверка строгая. Слепота и расхождение вне состава окна не откладываются; при совместных исходах слепота 2 сильнее расхождения 1, а 4 возвращается только при одной отсрочке. Окно максимум 1800 секунд; перед итогом срок и поколение сверяются повторно, разрешён один свежий прогон, повторная смена — 2. Это временная отсрочка проверки состава, не проверка живости службы. Машинный `REGWD_CONF` сильнее окружения: `VERIFY_CMD`, `HEALTH_CMD` и непустой `DORABOTKI_CMD` должны передавать ключ тем читателям, которым разрешён автоматический монтаж.

The B-N-2025/B-N-2032 contract is preserved: the three automatic calls above return 4 (DEFERRED) for drift covered by a live scoped window. Manual calls remain strict. Blind checks and out-of-scope drift are never deferred; 2 outranks 1, and 4 is returned only for deferral alone. The window lasts at most 1800 seconds; expiry and generation are checked again, with at most one fresh scan, then blindness 2. This defers consistency checks, not service liveness. Since host `REGWD_CONF` overrides the environment, its check commands must pass the automatic flag to the eligible readers.

## Ограничения

- Реестр слеп к тому, чего в нём нет. `sverka-montazha` обходит только места из `SVERKA_MESTA` (отсутствующее место — предупреждение и пропуск) и печатает одну сторону — смонтированное без записи; «записано, но не смонтировано» он не показывает. `priznak-oblasti-podklyucheniya` печатает обе стороны, но судит по имени и цели ссылки: «одно имя — два предмета» не ловит; расхождение (код 1) перекрывает неполную область — при непрочитанном узле и найденном расхождении код 1, а не 2.
- `verify` проверяет только то, что умеет команда записи: нет `installed_check` и `uchteno_v` — запись «НЕ ПРОВЕРЕНО», код 2; слабая команда — слабая гарантия. `uchteno_v` сверяет только первый абсолютный путь `path`: прочие файлы и пути записи (юниты, состояние) не сверяются, а `path`, где первым стоит не файл записи, даёт ложное «не в derevo.files»; верность самой пакетной записи — её собственная строка `verify`. Обратная сверка видит профиль A и `<дом>/plugins/*` агентов из реестра агентов; прочие профили, пресеты, агентов вне реестра и каталог плагина, покрытый записью одного файла внутри, — нет. Нет реестра агентов — слепота, код 2, пока `AGENTS_REGISTRY` не указывает на файл.
- `verify` исполняет `installed_check`/`fingerprint_check` из реестра как команды, а сторож зовёт его от root (`sudo -n`): запись в `plugins.yaml` равна исполнению от root. Права записи группы `agent-registry` держать равными sudo её членов.
- `pravka` судит форму и состав новой редакции (разбор, повтор ключей, пропавшие разделы, убыль записей, прежние комментарии при новых значениях, сумма основы), но не правдивость записанного — это `verify` после установки. Блокировки у реестра нет: запись, вклинившаяся между перепроверкой основы и заменой файла, не ловится. Коммит учёта — только если `.git` корня принадлежит root.
- `check` и `diff` требуют сети; без неё — «источник недоступен», а не «свежее».
- `registry-watchdog` не замечает собственной смерти: выключенный таймер — молчание. Изнутри — «жив» раз в `HEARTBEAT_DAYS` и отдельная весть о перерыве больше `GAP_DAYS`; снаружи — сторож машины; одновременную смерть обоих не видит никто. Он не чинит и не судит, законно ли расхождение. Не отличает «объект мёртв» от «спрашивающий не вправе проверить» — смотрите строку «рукой:». Не проверяет чужие дома, секреты и побайтную целость дерева платформы (только mtime). `AGENTS_VERIFY_CMD` и `DORABOTKI_CMD` — внешние команды без умолчания: пустая — блок пропущен и назван в итоге «НЕ проверялось», а не «сошлось». Запись из `VERIFY_IZVESTNAYA_SLEPOTA` слепа и для расхождения — перечень держать коротким.
- `nezafiksirovano-watch` не видит учёт, которого нет в `NEZAF_UCHYOTY` (умолчания нет; новый учёт вписывается рукой); учёт, чей корень не под root, читает от владельца корня. Возраст — mtime файла: `cp -p`, `rsync -a`, `tar x` дают ложное «старше предела» на свежем монтаже, `touch` молодит висящий файл. «Закоммичено, но не то» — дело ворот.
- `shvy-mezhdu-paketami-watch` ищет признаки по тексту: цитата кода в комментарии даёт ложное срабатывание; не ловит швы поведения, динамические импорты, договор в `Environment=` юнита, некоторые формы экспорта (деструктуризация, `export default` под другим именем, `export *` глубже трёх уровней) и не говорит, какая сторона права.
- `preset-sverka` сравнивает только список строк верхнего уровня нашего пресета (`PRESET_SVERKA_NASH_ID` против `preset-standard`), не содержимое и не то, подхвачен ли пресет живой сессией. Слепота — код 2, расхождение — код 1.
- `srez-obshchego-kataloga` — срез диска на следующий подъём, а не того, что загружено сейчас; обходит только свой профиль, чужие — их владелец этим же прибором; знаменатель агентов берётся из служб systemd с `WorkingDirectory=/opt/*/workspace`.
- `sverka-zavisimostej` проверяет разрешимость имён из `src/index.js` плагинов `SVERKA_PLAGINY`, а не совместимость версий. `agent-plugins-lock-check` не спрашивает скрытый lock npm и сеть.
- `sverka-montazha` читает реестр напрямую, `sudo -n` — только запасной путь; отказ обоих или ноль прочитанных путей — СЛЕПОТА, код 2, а не «вне реестра».
- Умолчаний одной машины в коде нет, кроме соглашений пакета: реестры `/etc/agent-registry/…`, общий каталог `/opt/agent-plugins` (`agent-plugins-lock-check`, `srez`, `priznak`, `shvy`) и узлы `OBLAST_UZLY` у `priznak` (`/opt/iskra/.dsh/profiles /opt/petrovich/.dsh/profiles` — раскладка sadik, задавайте свои).
- Пакет ничего не ставит, не обновляет и не перезапускает, кроме записи самого реестра через `pravka`.
---

<a id="english"></a>

# dsh-reestr — intervention registry for a DSH agent host and the tools that keep it honest

> The package grew out of a single-host production edition (sadik). In 3.1.1 (audit 16), tracked trees, install locations, plugins, presets and external checks are configured; other defaults are listed in SETTINGS: lists and external commands are set by environment variables (`docs/SETTINGS.md`); without them a command reports BLIND "not set" or skips the block with an explicit line. Paths like `/opt/iskra/…` in "What gets installed and where" are the sadik layout — an example, not a requirement.

## Purpose

A host running several agents on top of the platform accumulates plugins, scripts, units and patches to third-party packages. The package enforces one rule: everything installed is recorded in the registry (`/etc/agent-registry/plugins.yaml`) with a command that checks its version and, optionally, its fingerprint; drift between the record and the host is an alert, not something found a week later.

The registry is handled through `agent-plugins`: `list`, `check`, `verify`, `diff` only read; `pravka` is the only subcommand that writes, and it writes only the registry itself. `verify` checks each entry by its `installed_check`/`fingerprint_check`; an entry without its own `installed_check` can be covered by a package entry via the `uchteno_v` field (since 2.0.10, see "Verification"); then comes the reverse check: agents' locations from the agent registry → entries. Once a day `registry-watchdog` calls `agent-plugins verify` (via `sudo -n`), the agent-registry check, the local-changes ledger and `agent-plugins list --health`, and sends drift or blindness to the alert channel. `nezafiksirovano-watch` runs on its own timer and looks for uncommitted changes in the host's git ledgers. The other tools (`sverka-montazha`, `priznak-oblasti-podklyucheniya`, `srez-obshchego-kataloga`, `sverka-zavisimostej`, `agent-plugins-lock-check`, `preset-sverka`, `shvy-mezhdu-paketami-watch`) cover the registry's own blind spots; they are run by hand, and `preset-sverka` and `shvy-mezhdu-paketami-watch` are also called through the `healthcheck` of their entries, i.e. from the watchdog's nightly run.

The results are read by people and agents on the host: exit codes, journal output and alerts to the channel (`/usr/local/bin/agent-alert` by default). On sadik the package itself is recorded by the `dsh-reestr` entry in `/etc/agent-registry/plugins.yaml` (`derevo.ref: dsh-reestr-v<version>`, 10 locations in `derevo.files`); five per-file entries of its commands are covered through it (`uchteno_v: dsh-reestr`).

## What gets installed and where

The package includes a registry-watchdog service template and the installed crash-wrapper drop-in preserving `--avto-montazh`; the template is not installed on sadik, while the drop-in is in `derevo.files`. Locations, modes and owners come from `derevo.files` of the `dsh-reestr` entry; the bytes at each location equal the file in the tag.

| file in the package | location on sadik | mode / owner | who runs / reads it |
|---|---|---|---|
| `bin/agent-plugins` | `/usr/local/bin/agent-plugins` | 0755 root:root | people, agents, gate and deployment; `registry-watchdog` (`VERIFY_CMD`, `HEALTH_CMD`) |
| `bin/agent-plugins-lock-check` | `/usr/local/sbin/agent-plugins-lock-check` | 0755 root:root | by hand |
| `bin/registry-watchdog.sh` | `/usr/local/sbin/registry-watchdog.sh` | 0755 root:root | `registry-watchdog.timer` (unit outside the package) |
| `bin/nezafiksirovano-watch` | `/usr/local/sbin/nezafiksirovano-watch` | 0755 root:root | `nezafiksirovano-watch.timer` (unit outside the package) |
| `bin/shvy-mezhdu-paketami-watch` | `/usr/local/sbin/shvy-mezhdu-paketami-watch` | 0755 root:root | the `healthcheck` of its entry (via `sudo -n`), by hand |
| `bin/preset-sverka` | `/usr/local/bin/preset-sverka` | 0755 root:root | the `healthcheck` of its entry, by hand |
| `bin/sverka-montazha.sh` | `/opt/iskra/workspace/dorabotki/sverka-montazha.sh` | 0755 iskra:iskra | by hand |
| `bin/sverka-zavisimostej.sh` | `/opt/iskra/workspace/dorabotki/sverka-zavisimostej.sh` | 0755 iskra:iskra | by hand |
| `bin/priznak-oblasti-podklyucheniya.sh` | `/opt/iskra/workspace/dorabotki/priznak-oblasti-podklyucheniya.sh` | 0755 iskra:iskra | by hand |
| `bin/srez-obshchego-kataloga.sh` | `/opt/iskra/workspace/dorabotki/srez-obshchego-kataloga.sh` | 0755 iskra:iskra | by hand, under one's own account on each node |
| — (by hand, then `pravka`) | `/etc/agent-registry/plugins.yaml` — the registry | 0664 root:agent-registry | `agent-plugins`, `sverka-montazha`, stands |
| — (created by `pravka`) | `/var/backups/montazh/<label>/plugins.yaml.bak-pre-pravka-YYYYMMDD-HHMMSS` — pre-edit copies | the registry's owner and group | `agent-plugins pravka`, its rotation |

The four locations in `dorabotki` are also tracked by `nashi-dorabotki.sh` (Iskra's local-changes ledger, outside the package). The command names in `package.json` (`bin`) are for npm; on sadik the package is not installed through npm, and the commands live under their file names (`registry-watchdog.sh`, `sverka-montazha.sh` and so on).

Not installed (`not_installed` of the entry): `test/`, `docs/` (`ARCHITECTURE.md`, `GUARDS.md`, `SETTINGS.md`, `TROUBLESHOOTING.md`), `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. As of 09.10 three stands have byte-identical copies in `/opt/iskra/workspace/dorabotki/` (`stend-pravki-reestra.sh`, `stend-priznaka-oblasti.sh`, `stend-storozha-reestrov.sh`); `stend-krug-samoproverki.sh`, `stend-uchteno-v.sh` and `stend-nahodok-audita-16.sh` are not there — they are run from the tree.

## Installation

Requires Linux with systemd (`systemctl`, `journalctl`), Python 3.9 or newer with PyYAML (`agent-plugins`, `preset-sverka`, shebang `/usr/bin/env python3`), Bash, git, `logger`, Node.js (`sverka-zavisimostej.sh`, `priznak-oblasti-podklyucheniya.sh`, `srez-obshchego-kataloga.sh`), `curl`, `npm` and `tar` for `agent-plugins diff`, and `sudo -n` for the tools that read closed directories. Outside the package: the alert command (on sadik `agent-alert`; contract — `docs/SETTINGS.md`, "Alert command") and, when set, the watchdog's external checks `AGENTS_VERIFY_CMD` (on sadik `agent-registry verify`) and `DORABOTKI_CMD` (on sadik `nashi-dorabotki.sh --check`). Current package version — see `package.json` and `CHANGELOG.md`.

**On sadik.** The package is not installed as a whole: each of the locations in `derevo.files` changes through its own procedure — a new version number in the tree, the gate, per-file deployment from the tag, then the registry entry (order from CHANGELOG 2.0.10: tag → tool → registry). Editing production past the tree is forbidden (B-N-1922).

```bash
sudo smontirovat-fajly --punkt <label> --progon <candidate dir> /usr/local/bin agent-plugins   # plan, no writes (the default is a dry run)
sudo smontirovat-fajly --punkt <label> --v-boj  <candidate dir> /usr/local/bin agent-plugins   # to production, with a safeguard copy
```

After deployment — the new `version` of the `dsh-reestr` entry (a checksum over the locations in `derevo.files`, form `sha256:<16 chars>`; the command is its `installed_check`) and the tag `ref` via `agent-plugins pravka`, then `agent-plugins verify`.

**On another host.** The commands go onto `PATH` (`npm install -g` — ten links from `bin`). The registry is `/etc/agent-registry/plugins.yaml` (another path — `PLUGINS_REGISTRY`; every call warns about the substitution on stderr); the package does not create it: no file — `agent-plugins` exits 2 "registry not read". The first revision is laid by hand, later ones only via `agent-plugins pravka`. `verify` also requires the agent registry (`/etc/agent-registry/agents.yaml` or `AGENTS_REGISTRY`; form — `agenty[].imya`, `agenty[].namerenie.dom`): without it the exit is 2 whatever the intervention registry says. Entries without `healthcheck` count against the watchdog's `HEALTH_UNCHECKED_MAX` (default 0): either give every entry a `healthcheck` or raise the limit. The watchdogs' and tools' lists are set by variables — `docs/SETTINGS.md`.

The watchdog units are not part of the package. On sadik they look like this (`systemctl cat registry-watchdog.service nezafiksirovano-watch.service`):

- `registry-watchdog.service`: `Type=oneshot`, `User=iskra`, `Group=iskra`, `StateDirectory=registry-watchdog`, drop-ins `10-nahodka-ne-otkaz.conf` (`SuccessExitStatus=1`) and `60-bash-padenie-70.conf` (start via `/usr/local/bin/bash-padenie-70`); timer `OnCalendar=*-*-* 07:30:00 UTC`, `Persistent=true`, `AccuracySec=1min`. Its own settings file `/etc/registry-watchdog/registry-watchdog.conf` (outside the package) sets `VERIFY_CMD`, `AGENTS_VERIFY_CMD="sudo -n /usr/local/bin/agent-registry verify"`, `DORABOTKI_CMD`, `HEALTH_CMD` and thresholds there.
- `nezafiksirovano-watch.service`: `Type=oneshot`, `User=root`, `SuccessExitStatus=1 2`, `TimeoutStartSec=10min`, drop-in `60-python-padenie-70.conf`; timer `OnCalendar=*-*-* 00/6:15:00 UTC`, `Persistent=true`.

## Settings

The package has no settings file: every command reads its own environment variables; the full table of variables, defaults and outcomes when empty is `docs/SETTINGS.md`. The code carries no single-host defaults: where the list is host-specific, without the variable the command reports BLIND "not set" or skips the block with an explicit line. The exception is `registry-watchdog.sh`: it sources its own `REGWD_CONF` file after the defaults, and the file's values beat the environment; the file is accepted only if owned by root or by the watchdog's account and not writable by group or others — otherwise it is not read, and that is BLIND with the reason.

Command arguments:

| command | arguments |
|---|---|
| `agent-plugins` | `list [--health [--avto-montazh]]` · `check` · `verify [--avto-montazh]` · `diff [--full] [<id> …]` · `pravka <new-file> [--osnova <sha256, 16–64 chars>] [--ustanovit --punkt <label>] [--tekushchij-sloman] [--razreshit-ubyl]` · `-h`/`--help`/`help`. An unknown argument — refusal 3 (before reading the registry), an unknown subcommand — help and exit 2. The registry is set by `PLUGINS_REGISTRY`; there is no `--reestr` argument. On install `--punkt` (Latin letters, digits, `. _ -`) and `--osnova` are required |
| `agent-plugins-lock-check` | `[root]` (default `/opt/agent-plugins`), `--shelf <archive dir>` (default `<root>/../agent-plugins-tarbally`); a call error — exit 2 |
| `srez-obshchego-kataloga.sh` | `[directory]` (default `/opt/agent-plugins`); `--help` — help, exit 0; any other flag or an extra argument — refusal, exit 2 |
| `registry-watchdog.sh` | `[--avto-montazh]`; `--help` — help, exit 0; any other argument — refusal, exit 2, nothing run (no state, no alert) |
| `nezafiksirovano-watch`, `preset-sverka` | no arguments; any argument — "ОТКАЗ" (refusal), exit 2, no alert |
| `shvy-mezhdu-paketami-watch`, `sverka-montazha.sh`, `sverka-zavisimostej.sh`, `priznak-oblasti-podklyucheniya.sh` | no arguments; they read none |

## Verification

One command: `npm test` (same as `bash test/progon-na-podstave.sh`) from an account with `sudo -n`, not root: a temporary root with a sample registry, then six stands on this package's tools — "green 6 of 6", exit 0. Each stand, its variables and the expected outcome — `docs/GUARDS.md`, "Stands"; `stend-krug-samoproverki` touches live timers and is run by hand only.

sadik registry entries. The package is recorded by the `dsh-reestr` entry: `version` — `sha256:<16 chars>` over the checksums of the locations in `derevo.files` (`installed_check`: `sha256sum` of the files in `derevo.files`, sorted by path, then a checksum of that list), `healthcheck` — `test -x` for `agent-plugins` and `registry-watchdog.sh`, `derevo` — tree `/opt/iskra/workspace/dsh-plugins`, `ref: dsh-reestr-v<version>`, `subdir: packages/dsh-reestr`, `files` with mode and owner, and the `not_installed` list. Five per-file entries — `agent-plugins`, `registry-watchdog`, `preset-sverka`, `shvy-mezhdu-paketami-watch`, `nezafiksirovano-watch` — carry no `version` of their own and are covered by `uchteno_v: dsh-reestr`; their own checks remain: `registry-watchdog` — a `fingerprint` of `/etc/registry-watchdog/registry-watchdog.conf` and a `healthcheck` (timer active, last run younger than 48 h); `agent-plugins` — `agent-plugins list`; `nezafiksirovano-watch` — `systemctl is-active nezafiksirovano-watch.timer`; `preset-sverka` — the tool itself; `shvy-mezhdu-paketami-watch` — the tool via `sudo -n`, exit 3 mapped to 1. `agent-plugins-lock-check` and the four `dorabotki` locations have no entries of their own. To check everything at once: `agent-plugins verify` (0 — the record matches the host).

The `uchteno_v: <package entry id>` field (`verify`, since 2.0.10). It applies to an entry without its own `installed_check`. The entry is valid if: it has no `version` (otherwise "двойной учёт", double accounting); the package entry exists, is not the entry itself, and has an `installed_check`; the entry's file — **the first absolute path in its `path`** (`source.address` is not used) — is listed in the package entry's `derevo.files[].local` and appears as a whole token in its `installed_check`. A valid entry prints `учтено <id>: через запись <package> …` (covered via entry), and the summary says "учтено через пакетные записи: N"; its own `fingerprint`, if set, is checked as before. An invalid one — `РАСХОЖДЕНИЕ <id> uchteno_v: <reason>`, exit 1.

Exit codes of the commands themselves — `docs/GUARDS.md`, "Exit codes per command".

## Limitations

- The registry is blind to what it does not contain. `sverka-montazha` walks only the locations in `SVERKA_MESTA` (a missing location — a warning and a skip) and prints one side — installed but unrecorded; it does not show "recorded but not installed". `priznak-oblasti-podklyucheniya` prints both sides but judges by name and link target: it does not catch "one name — two packages"; drift (exit 1) overrides an incomplete area — with an unread node and a found drift the code is 1, not 2.
- `verify` checks only what the entry's command can check: neither `installed_check` nor `uchteno_v` — the entry is "НЕ ПРОВЕРЕНО" (not checked), exit 2; a weak command — a weak guarantee. `uchteno_v` checks only the first absolute path in `path`: other files and paths of the entry (units, state) are not checked, and a `path` whose first item is not the entry's file gives a false "не в derevo.files"; the correctness of the package entry itself is its own `verify` line. The reverse check sees profile A and `<home>/plugins/*` of agents in the agent registry; other profiles, presets, agents outside the registry, and a plugin directory covered by an entry for one file inside it, it does not see. No agent registry — blindness, exit 2, until `AGENTS_REGISTRY` points to a file.
- `verify` runs `installed_check`/`fingerprint_check` from the registry as commands, and the watchdog calls it as root (`sudo -n`): writing to `plugins.yaml` equals executing as root. Keep the write permission of the `agent-registry` group equal to its members' sudo rights.
- `pravka` judges the form and composition of a new revision (parsing, repeated keys, lost sections, fewer entries, old comments on new values, the base checksum), not whether the record is true — that is `verify` after the install. The registry has no lock: a write that slips in between the final base check and the file replacement is not caught. The ledger commit happens only if the root's `.git` is owned by root.
- `check` and `diff` need the network; without it — "source unreachable", not "up to date".
- `registry-watchdog` cannot notice its own death: a disabled timer is silence. From inside — "alive" every `HEARTBEAT_DAYS` and a separate notice of a gap longer than `GAP_DAYS`; from outside — the host watchdog; simultaneous death of both is seen by nobody. It neither fixes nor judges whether a drift is legitimate. It cannot tell "the object is dead" from "the caller may not check it" — look at the "рукой:" (run by) line. It does not check other users' homes, secrets or byte-level integrity of the platform tree (mtime only). `AGENTS_VERIFY_CMD` and `DORABOTKI_CMD` are external commands with no default: an empty one skips the block and names it "NOT checked" in the summary, not "matched". An entry in `VERIFY_IZVESTNAYA_SLEPOTA` is blind to drift as well — keep the list short.
- `nezafiksirovano-watch` does not see a ledger missing from `NEZAF_UCHYOTY` (no default; a new ledger is added by hand); a ledger whose root is not owned by root is read as the root's owner. The age is the file mtime: `cp -p`, `rsync -a`, `tar x` produce a false "older than the limit" on a fresh install, `touch` makes a pending file look young. "Committed, but the wrong thing" is the gate's job.
- `shvy-mezhdu-paketami-watch` searches for signs in text: a code quotation in a comment gives a false positive; it does not catch seams of behaviour, dynamic imports, a contract living in a unit's `Environment=`, some export forms (destructuring, `export default` under another name, `export *` deeper than three levels), and it does not say which side is right.
- `preset-sverka` compares only the list of top-level entries of our preset (`PRESET_SVERKA_NASH_ID` against `preset-standard`), not their contents, and not whether a live session picked the preset up. Blindness is exit 2, drift is exit 1.
- `srez-obshchego-kataloga` is a disk snapshot for the next start, not what is loaded now; it walks only one's own profile, others are walked by their owners with the same tool; the agent denominator comes from systemd services with `WorkingDirectory=/opt/*/workspace`.
- `sverka-zavisimostej` checks resolvability of names imported by `src/index.js` of the `SVERKA_PLAGINY` plugins, not version compatibility. `agent-plugins-lock-check` never consults the hidden npm lock or the network.
- `sverka-montazha` reads the registry directly, `sudo -n` only as a fallback; both refusing or zero paths read is BLIND, exit 2, not "outside the registry".
- The code carries no single-host defaults except the package conventions: the registries `/etc/agent-registry/…`, the shared directory `/opt/agent-plugins` (`agent-plugins-lock-check`, `srez`, `priznak`, `shvy`) and `priznak`'s `OBLAST_UZLY` nodes (`/opt/iskra/.dsh/profiles /opt/petrovich/.dsh/profiles` — the sadik layout, set your own).
- The package installs, updates and restarts nothing except the registry itself, via `pravka`.


B-N-2032: systemd/registry-watchdog.service.d/60-bash-padenie-70.conf учтена в пакете и сохраняет --avto-montazh. Боевая правильная вставка не изменялась. Corrected crash-wrapper drop-in is tracked and preserves the automatic deployment flag.
