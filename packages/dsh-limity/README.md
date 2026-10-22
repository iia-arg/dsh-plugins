# dsh-limity — служба лимитов подписок sadik

**Версия:** 3.1.5

[English](README.en.md). Локальные служебные исходники sadik; публикация наружу требует отдельного решения владельца.


B-N-1776 · замысел Зари (PLAN c9e3535f, ГОДЕН Вениамина 07.10 19:24 МСК) · слово владельца 07.10 19:04, 19:14, 19:24 МСК.

Служба на sadik ведёт одну таблицу замеров лимитов всех подписок (Claude, Codex) и выдаёт из неё `limity.json`. Его забирает страница `lim.insmat.ru`, она же vps-ru. Сторож и переключатели подписок читают ту же таблицу (такт 4).

🔴 **Служба не ходит к провайдерам и не читает токены.** Она только собирает замеры, которые делают штатные клиенты:
- Codex — `codex app-server account/rateLimits/read` через `codex-limit-watch`;
- Claude — событие SDK `rate_limit_event` из шлюзов (такт 2) и штатный опрос простаивающих (такт Б).

Прямые запросы к API Anthropic запрещены владельцем (19:04 МСК).

## Состав

| в пакете | на диске | режим | кто зовёт |
|---|---|---|---|
| `sbin/dsh-limity` | `/usr/local/sbin/dsh-limity` | 0755 root:root | `dsh-limity.service` ← `dsh-limity.timer` (раз в минуту) |
| `sbin/dsh-limity-podpiski` | `/usr/local/sbin/dsh-limity-podpiski` | 0755 root:root | рука root: управление конфигом подписок (`proverit`, `spisok`, `vojti`, `klyuch`, `snyat`), каждая правка — коммит в git `/etc/dsh-limity` |
| `lib/dsh_limity_konfig.py` | `/usr/local/lib/dsh-limity/dsh_limity_konfig.py` | 0644 root:root | общий модуль всех программ пакета: чтение и проверка `podpiski.json`, поля и умолчания, последняя годная редакция |
| `libexec/dsh-limity-vydat` | `/usr/local/libexec/dsh-limity-vydat` | 0755 root:root | sshd, принудительная команда учётки `limity-vydacha` (vps-ru забирает выдачу) |
| `systemd/dsh-limity.service` | `/etc/systemd/system/dsh-limity.service` | 0644 root:root | таймер |
| `systemd/dsh-limity.timer` | `/etc/systemd/system/dsh-limity.timer` | 0644 root:root | systemd (`timers.target`) |
| `libexec/dsh-limity-zamer` | `/usr/local/libexec/dsh-limity-zamer` | 0755 root:root | `dsh-limity-zamer.service` ← `.timer` (10 мин): замер usage Claude (сам замер — от учётки замера через setpriv) и тревоги сторожа |
| `libexec/dsh-limity-zamer.mjs` | `/usr/local/libexec/dsh-limity-zamer.mjs` | 0644 root:root | `dsh-limity-zamer`: один замер штатным usage SDK без запроса к модели |
| `systemd/dsh-limity-zamer.service` / `.timer` | `/etc/systemd/system/` | 0644 root:root | systemd; таймер через 5 мин после загрузки, затем раз в 10 мин |
| `libexec/dsh-limity-deepseek` | `/usr/local/libexec/dsh-limity-deepseek` | 0755 root:root | `dsh-limity-deepseek.service` (`User=limity-ds`) ← `.timer` (10 мин): баланс DeepSeek, ключ только из `$CREDENTIALS_DIRECTORY` |
| `systemd/dsh-limity-deepseek.service` / `.timer` | `/etc/systemd/system/` | 0644 root:root | systemd; таймер через 5 мин после загрузки, затем раз в 10 мин |
| `libexec/dsh-limity-avtoperekl` (1.0.8) | `/usr/local/libexec/dsh-limity-avtoperekl` | 0755 root:root | `dsh-limity-avtoperekl.service` ← `.timer` (10 мин); зовёт `pereklyuchatel-podpiski <N> tiho` (dsh-podpiski ≥ 1.0.6) |
| `systemd/dsh-limity-avtoperekl.service` / `.timer` (1.0.8) | `/etc/systemd/system/` | 0644 root:root | systemd; строка в `storozha-sutochnye.txt` — вне пакета |
| `etc/sysusers.d/dsh-limity.conf` | `/etc/sysusers.d/dsh-limity.conf` | 0644 root:root | `systemd-sysusers`: группа `limity-vhod`, членство `limity-zamer-p1..p3`, учётка `limity-ds` (nologin) |
| `etc/tmpfiles.d/dsh-limity.conf` | `/etc/tmpfiles.d/dsh-limity.conf` | 0644 root:root | `systemd-tmpfiles`: `/var/spool/dsh-limity` 0711 root:root, приёмная `vhod` 1730 root:claudeoauth и ACL `group:limity-vhod:-wx` |
| `etc/dsh-limity.gitignore` | `/etc/dsh-limity/.gitignore` | 0644 root:root | git учёта `/etc/dsh-limity`: исключает `*.bak` и временные файлы команды |

Не ставятся (`not_installed` записи реестра): `etc/podpiski.json` — это образец конфига, а живой `/etc/dsh-limity/podpiski.json`
ведётся командой `dsh-limity-podpiski` и с образцом не совпадает; `test/`, `README.md`, `CHANGELOG.md`, `LICENSE`.

Каталоги:
- `/var/lib/dsh-limity` — база `limity.db`, SQLite WAL, root 0755;
- `/var/lib/dsh-limity/vydacha` — выдача `limity.json`, 0644;
- `/var/spool/dsh-limity/vhod` — приёмная, `1730 root:claudeoauth` (`etc/tmpfiles.d/dsh-limity.conf`, с 1.0.2): шлюзы Claude (группа `claudeoauth`) кладут файлы, но не читают и не удаляют чужие; разбирает и удаляет служба (root). Родитель `/var/spool/dsh-limity` — `0711 root:root`. Шлюз Варвары в группу не входит — его замеры не пишутся (строка журнала шлюза).
- **Доверие приёмной (1.0.3):** служба не верит содержимому. `otkuda` — по владельцу файла (`gateway@<учётка>`); `podpiska` обязана совпасть с подпиской этой учётки по `/etc/claude-oauth/instance-<учётка>.env` (`GATEWAY_TOKEN_FILE …token-podpiska-N`; `DSH_LIMITY_INSTANCE_DIR`); из приёмной — только `claude`/`sdk_event` (Codex служба берёт сама); файл открывается `O_NOFOLLOW|O_NONBLOCK`, тип/размер/владелец — `fstat` открытого дескриптора: ссылка, FIFO, устройство — отказ без ожидания. Отказ — в `otkaz/` с причиной и учёткой в журнале. ЧЕГО НЕ ЛОВИТ: учётка, пишущая ПРАВДОПОДОБНУЮ долю своей же подписки (её bash и её шлюз — одна учётка).

## Зависимости и порядок установки

Состав выше покрывает 19 устанавливаемых файлов текущей основы. `etc/podpiski.json` — образец данных, а не файл для безусловной замены живого конфига. `test/` и документацию читают из исходникового дерева; они не копируются в /usr/local как команды службы.

| Зависимость | Источник/назначение |
|---|---|
| Python 3 с sqlite3 и PyYAML (`python3-yaml`), systemd, `setpriv`/`runuser`, git, `useradd`/`usermod` | ОС; БД, реестр, запуск замера под отдельной учёткой и управляемый конфиг/вход |
| `/usr/local/bin/node` и Anthropic SDK `/opt/subscription-gateway-guest/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs` | Установленный SDK/runtime, вне пакета; источник usage |
| `/opt/subscription-gateway-guest/sdk-runtime/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` (`DSH_LIMITY_CLI`) | Отдельный native CLI того же runtime; интерактивный вход командой vojti |
| `/usr/local/bin/agent-alert` | dsh-trevogi; тревоги по переходам; состояние «сказано» зависит от доставки |
| `/usr/local/bin/agent-registry` и `/etc/agent-registry/agents.yaml` | a2a-bus; автопереключатель зовёт agent-registry pole, замер читает YAML для связки учётки и подписки |
| `codex-limit-watch` и `/var/lib/codex-limit-watch/sostoyanie.json` | dsh-podpiski; источник Codex, без модели |
| `pereklyuchatel-podpiski`, `pereklyuchatel-podpiski-limity.py` и его `/etc/default` | dsh-podpiski; решение/действие автопереключателя Claude |
| Группа `claudeoauth`, входы замеров и instance-env шлюзов | Раскладка dsh-subscription-gateway и машины; приёмная и привязка входов |
| `getfacl`/`setfacl`, `systemd-sysusers`, `systemd-tmpfiles` | ОС; группа limity-vhod, лимитная учётка DeepSeek и ACL приёмной |
| Принудительная SSH-команда, ключ забора, страница | Внешнее развёртывание; требуется только для выдачи на другую машину |

Порядок окна: (1) библиотеки, исполняемые файлы и конфигурации sysusers/tmpfiles по полной описи; (2) группа limity-vhod и учётка limity-ds через sysusers, каталоги/ACL через tmpfiles; (3) git-учёт /etc/dsh-limity и валидный конфиг; (4) входы через `dsh-limity-podpiski vojti`, проверка членства созданных учёток в limity-vhod; (5) DeepSeek LoadCredential через команду `klyuch`; (6) unit-файлы, daemon-reload, проверка и включение нужных таймеров. Учётки p1..p3 в шаблоне sysusers — данные раскладки: при новой установке их наличие сверяют, не принимают за уже созданное.

На машине, где есть действующий конфиг/входы, их сохраняют и сверяют; etc/podpiski.json теперь обезличенный образец, его не монтируют поверх действующего /etc/dsh-limity/podpiski.json. Значения секретов в argv и журнал не передаются. Служба не работает без источников только потому, что установлены её файлы.

| Настройка замера | Умолчание программы | В поставляемом юните | Единица |
|---|---:|---:|---|
| `DSH_LIMITY_ZAMER_SVEZHO_MIN` | 30 | 0 | минуты; 0 отключает пропуск по свежему замеру окна |
| `DSH_LIMITY_ZAMER_RAZ_V_MIN` | 60 | умолчание | минуты между попытками по подписке |
| `DSH_LIMITY_ZAMER_POTOLOK_SUTKI` | `24*60/RAZ_V_MIN` | умолчание | попытки за сутки по подписке |

Ручной запуск обёртки без окружения юнита снова получает SVEZHO_MIN=30. Для планового замера не ставить `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`; юнит задаёт `ENABLE_CLAUDEAI_MCP_SERVERS=false`.

## Как работает один проход

1. **Codex.** Ключ `zamer` из `/var/lib/codex-limit-watch/sostoyanie.json`: `{N: {at, dolya, okno: [limitId, primary|secondary, минут, resetsAt]}}`. Новый момент замера даёт строку `istochnik=codex_app_server`, повтор того же момента отбрасывается. Состояние не разобрано — СЛЕПОТА, код 2, выдача всё равно строится из базы.
2. **Приёмная.** Один JSON-замер на файл, поля строго:
   - `moment_utc`, `provajder`, `podpiska`, `okno`, `dolya`, `sbros_utc`, `status`, `izmereno`, `prichina`, `istochnik`, `otkuda`;
   - годная строка попадает в таблицу, файл удаляется;
   - негодная (чужое поле, значение, похожее на токен, доля при `izmereno=0`, не JSON, больше 4 КБ) уходит в `otkaz/` с причиной в журнале.
3. **Таблица `zamer`** и виды `poslednee` и `otpustilo`. Хранение 30 суток.
4. **Выдача** `limity.json` прежнего формата:
   - Claude-подписка 3 лежит под ключом `podpiska-5`;
   - окно без замера, а также окно, чей сброс прошёл после замера, — `null`, а не 0;
   - у каждой записи `snyato_unix` — её замер; вверху — **самый старый** из выданных, чтобы свежий Codex не освежил старый Claude. Это никогда не момент выдачи;
   - Непредставленные поля прежнего сборщика остаются null (например premium; прямой запрос за ним не разрешён). При наличии сырого Codex account/rateLimits/read добавляются пришедшие кредиты и длительность/сброс окон; без этих полей не придумываются значения. tarif/organizaciya берутся из конфига; plan — из пришедшего planType.

## Признак работы

В журнале юнита: `dsh-limity: codex новых N · приёмная принято P, отказано O · выдача снято HH:MM:SSZ`. Код 0, а при слепоте источника — код 2 со строкой `СЛЕПОТА: …`. Признак годен только от прогона, начатого **после** монтажа: `ExecMainStartTimestamp` позже ctime файлов.

## Выдача на vps-ru

Страница забирает выдачу по SSH без удалённой команды. Пользователь/host alias/порт и проверенный ключ хоста задаются вне пакета в конфигурации монтажного окна; пример: `ssh <алиас-выдачи>`.
- Принудительная команда `dsh-limity-vydat` отдаёт ровно `limity.json`.
- Команду клиента не принимает (код 3), ссылку и файл больше 1 МБ не отдаёт.
- Проверенный fingerprint ключа хоста хранится в документе монтажа/known_hosts машины забора; пакет его не задаёт.

## Монтаж — шаги вне пакета

Эти части ставит рука координатора при монтаже; в пакет они не входят (в `files` записи реестра их нет):
- учётка `limity-vydacha` — системная, без дома и пароля: `useradd --system --no-create-home --home-dir /nonexistent --shell /bin/sh limity-vydacha` (в бою 07.10: uid 979, gid 971, оболочка `/bin/sh` — через неё sshd зовёт принудительную команду);
- `/etc/ssh/sshd_config.d/60-limity-vydacha.conf` (root 0644) — принудительная команда `dsh-limity-vydat` для этой учётки;
- `/etc/ssh/authorized_keys.d/limity-vydacha` (root 0644) — ключ забора с vps-ru.

Публикация наружу не поручена. Пакет описывает роли и принудительную команду; адрес/порт и fingerprint SSH-хоста сервера выдачи хранятся вне пакета в монтажной настройке машины забора.

**Временное правило (Вениамин, 07.10.2026):** пока у пакета нет читателя «бой ↔ метка», любой файл пакета ставится только через назначенную руку монтажа, со страховкой и отдельной сверкой суммы кандидата и назначения; наличие исходника само по себе не доказывает монтаж.

## Источник Б (1.0.4): usage раз в час через вход владельца

`dsh-limity-zamer.timer` будит обёртку раз в 10 мин. У поставляемого юнита `DSH_LIMITY_ZAMER_SVEZHO_MIN=0`: свежий замер шлюза не пропускает подписку, usage запрашивается у **всех включённых Claude-подписок с входом замера**, в том числе с трафиком. Собственный интервал попыток — 60 мин, потолок — `24*60/60 = 24` попытки за сутки на подписку; неудачная попытка тоже учитывается. Одна попытка — ОДИН штатный usage SDK (`/usr/local/libexec/dsh-limity-zamer.mjs`) от учётки
замера подписки (`zamer` в `/etc/dsh-limity/podpiski.json`, каталог входа — её домашний `/var/lib/dsh-limity-zamer/pN`, 0700).
Запросов к модели — 0; цена — ~6 соединений и 3 DNS `api.anthropic.com`, ~1,5 с (живой замер 07.10 19:25Z). ≤ 24 замера/сутки.
Кредиты (`extra_usage`) видит ТОЛЬКО этот источник: в выдаче — `pererashod` подписки. Состояние —
`/var/lib/dsh-limity/zamer-sostoyanie.json`; журнал — `journalctl -u dsh-limity-zamer`.
Вход отозван / чужая организация / токен не из каталога / usage без окон ⇒ «не измерено: <причина>» и одна тревога по переходу.
Тревоги сторожа (agent-alert): кредиты ≥50/80/95 % месячного предела — по переходу вверх; срок входа — за 7 дней до
`refreshTokenExpiresAt` (у p1 — 05.11.2026). Коннекторы claude.ai — `Environment=ENABLE_CLAUDEAI_MCP_SERVERS=false` юнита; без неё замеров нет.
🔴 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` замеру не ставить — режет сам usage (такт 5, r1–r4).

Поле выдачи `podpiski.<ключ>.usage` (r3; нет снимка ⇒ null) — всё, что отдаёт usage, как на странице usage клиента:
- `snyato_unix`, `tip_podpiski`;
- `okna[]`: {imya — ИМЯ КАК ПРИШЛО (five_hour, seven_day, iguana_necktie, любое новое), dolya 0..1, sbros_unix, limit_usd, potracheno_usd,
  ostatok_usd, blokirovka, prochee — неизвестные подполя};
- `limits[]`: {vid (session/weekly_all/weekly_scoped/…), gruppa, procent, uroven (normal/…/critical), sbros_unix, aktiven, model, poverhnost, prochee};
- `po_modelyam[]`: {model, dolya, sbros_unix}; `razbivka_nedeli`: {na_moment_unix, nachalo_okna_unix, stroki[{kluch, imya, procent}]};
- `kredity`: {vklyucheny, mesyachnyj_predel, potracheno (USD, уже из центов), dolya, valyuta, predel_dostignut, …};
- `spend`: {potracheno, predel, valyuta, procent, uroven, vklyucheno, balans, avtopopolnenie, …};
- `prochee`: всё нераспознанное — сырым (ничего не выбрасывается молча).
Страница lim.insmat.ru (vps-ru) рисует пока только pyat_chasov/nedelya/pererashod — показ `usage` на ней — правка страницы, не службы.

## Конфиг подписок (r4): добавлять, менять, выключать — без перевыпуска

Единственный источник — `/etc/dsh-limity/podpiski.json` (поля и умолчания — в `/usr/local/lib/dsh-limity/dsh_limity_konfig.py`).
Проверить: `dsh-limity-podpiski proverit`; посмотреть: `dsh-limity-podpiski spisok`.
- **Добавить подписку Claude:** строка `{"provajder":"claude","nomer":N,"kluch":"podpiska-X","podpis":"Клод-N (…)","poryadok":K,
  "email":"…","token_shlyuza":"/etc/claude-oauth/token-podpiska-N"}` → `dsh-limity-podpiski vojti podpiska-X` (ссылка, код в терминал;
  организации в конфиге нет — команда покажет организацию входа и спросит «вписать? [y/N]»; нужна --prichina, кто подтвердил — в коммит). Codex — строка с `"provajder":"codex"` (меряет codex-limit-watch).
- **Сменить вход/токен замера:** `vojti <kluch>` ещё раз. **Выключить:** `snyat <kluch> --prichina "…"` (вход снят, vkl=false) или `"vkl": false`.
  **Удалить совсем:** `snyat <kluch> --udalit-uchetku` (только учётки `limity-zamer-*`, с вводом ключа) и убрать строку.
- Служба и исполнитель читают конфиг на каждом проходе: правка действует со следующего прохода (≤ 1 мин / ≤ 10 мин), без перезапуска.
- **Негодный конфиг (r7, Вениамин 19:13Z):** служба и замер работают на ПОСЛЕДНЕЙ ГОДНОЙ редакции (`/var/lib/dsh-limity/podpiski.goden.json` — рядом
  с базой; туда пишется только прошедшее проверку), в журнале «ВНИМАНИЕ: конфиг … НЕГОДЕН»; тревога «НЕГОДЕН» / «снова годен» — по переходу,
  шлёт замер (≤ 10 мин). Годной копии ещё нет (первый запуск) — СЛЕПОТА, как раньше.
- **Учёт git (r7):** `/etc/dsh-limity` — репозиторий (как `/etc/agent-registry`; `.gitignore` из пакета: `*.bak`, временные). Каждая правка командой —
  коммит «dsh-limity-podpiski <действие> <ключ>: <причина> · <поля> · подтвердил <SUDO_USER>», автор — он же. Нет репозитория или незафиксированная
  ручная правка — ОТКАЗ до любых действий. Ручную правку фиксировать руками (`git -C /etc/dsh-limity commit`); `proverit` пишет «учёт git: чисто / 🔴 …».
  Признак: `git -C /etc/dsh-limity status --porcelain -uall` → 0 строк.
- Выдача: у каждой подписки `podpis`, `poryadok`, `vyklyuchena`; сверху — `poryadok` (ключи по порядку). 🔴 Страница lim.insmat.ru держит
  ключи и подписи В СВОЁМ КОДЕ (const CHEI / const PORYADOK) — чтобы новая подписка появилась на ней, страница должна брать их из выдачи.

## Codex (r5)

Меряет codex-limit-watch (пакет dsh-podpiski) — раз в 10 мин, без хода к модели; с правкой B-N-1776 он кладёт в своё состояние сырой ответ
(`zamer.<N>.syroe`), служба берёт его и выдаёт: на странице сразу (её нынешний код) — длина окна, предел, кредиты (остаток / без предела /
исчерпаны), досрочные сбросы; полностью — в поле `usage` (как у Claude). Нет сырого ответа — выдача как до r5.

## DeepSeek: баланс и отдельная служба

Баланс читает `dsh-limity-deepseek.service` под `limity-ds`, со своим таймером (10 мин). Каждый ключ ограничен интервалом 60 мин и потолком `24*60/60 = 24` попытки/сутки. Прямой `GET https://api.deepseek.com/user/balance` пишет строку журнала на каждый вызов; запросов к модели нет.

Ключ доступен только через LoadCredential: исходный `klyuch_fajl` задаётся в конфиге, команда `dsh-limity-podpiski klyuch <ключ>` создаёт drop-in. Сам collector читает `/run/credentials/...` из `CREDENTIALS_DIRECTORY`, передаёт значение только в заголовок, не в argv/журнал. Снимок пишет **limity-ds**, служба принимает его только от этой учётки (`DSH_LIMITY_DS_UCH`), для включённой deepseek-подписки. Прежний root-collector r6 заменён r10; root-обёртка dsh-limity-zamer читает последний снимок DeepSeek из SQLite-таблицы usage_snimok для тревог, сеть за балансом не вызывает. JSON-выдачу она читает отдельно для порогов Claude.

- Строка: `{"provajder":"deepseek","nomer":N,"kluch":"deepseek-X","podpis":"DeepSeek (…)","klyuch_fajl":"/etc/dsh-klyuchi/…"}`;
  порог — `"porog_ostatka": 50, "valyuta_poroga": "CNY"` (только вместе: порядок валют в ответе меняется от вызова к вызову).
  Ключ на другой машине — `"mashina":"aclaude"` без `klyuch_fajl`: в выдаче «ключ на машине aclaude — sadik его не видит, не измеряется».
- Выдача: `postavshchik: deepseek`, `balansy[{valyuta, ostatok, podareno, popolneno}]`, `dostupen`, `porog_ostatka`, `valyuta_poroga`,
  `nizhe_poroga`, `oshibka` (последняя попытка не удалась — видна, даже если ниже показан прежний баланс со своим `snyato_unix`), `usage` (сырой
  ответ). Общий `snyato_unix` вверху выдачи DeepSeek НЕ включает. Страница lim.insmat.ru их пока не рисует (её ключи — в её коде).
- Тревоги: «остаток НЕ ИЗМЕРЕН — <причина>» и «снова измеряется» — по переходу; «ниже порога» — по переходу вниз через порог.

## Кредиты и вход (r8–r9, Заря)

- Валюта кредитов — из ответа usage (`extra_usage.currency`), не константой «USD»; нет в ответе — `null`. Имена полей `potracheno_usd` не меняются (их читает страница), единица — та, что в `valyuta`.
- Нет `decimal_places` (или `exponent`) — единица сумм НЕИЗВЕСТНА: суммы `null`, причина «единица сумм неизвестна» (`usage.kredity.edinica_neizvestna`), а не деление на 100 наугад.
- Каталог входа (`vojti`, `konfig.py`): после resolve родитель обязан быть корнем `DSH_LIMITY_ZAMER_KOREN` (по умолчанию `/var/lib/dsh-limity-zamer/`); «…/../..» или сам корень — ошибка конфига (LOW Вениамина 19:52Z).

## Кредиты: какое поле читать (Вениамин 20:33:35Z)

- **Договор — верхний `podpiski.<ключ>.kredity`.** Только его читают страница, сторож и любой потребитель. `usage.kredity` — разбор ответа
  usage «как есть» для диагностики; потребителям его НЕ читать (дубль оставлен намеренно, формы у них разные).
- Claude: `{vklyucheny, predel_dostignut, dolya, predel_usd, potracheno_usd, valyuta, snyato_unix}`. Суммы — уже в единицах валюты (не центы);
  `valyuta` — из ответа, может быть `null`. Имена `predel_usd`/`potracheno_usd` не менять — на них страница.
- Codex: у того же поля СВОЙ набор — `{est, bezlimit, ostatok, pererashod_ischerpan}`; ключи Claude там не искать.
- `null` никогда не значит 0: `predel_usd = null` — у аккаунта кредитов нет или единица сумм неизвестна, и тогда `dolya` (0.0) НЕ читать.
  Пример — подписка 3 Claude (`podpiska-5`): все суммы и `valyuta` — `null`, `vklyucheny = false`; набор ключей у неё тот же, не урезать.
- Нет `kredity` у подписки вовсе — её ещё не мерили: показывать «не измерено».

## Пороги окон Claude (1.0.7, Аврора)

В каждом проходе замера (`dsh-limity-zamer`, таймер) по включённым Claude-подпискам из выдачи `limity.json`: ступени 5 ч ≥ 0.85 ⚠️; неделя ≥ 0.80 ⚠️ и ≥ 0.90 🔴. Тревога — только по ПЕРЕХОДУ ступени (та же — молча); сброс окна — «✅ снова ниже»; замер старше 130 мин — «⚠️ нет свежего замера»; нет поля доли — СЛЕПОТА (код 2). Канал — `agent-alert`; «сказано» запоминается только по доставке (состояние замера). Стенд — `test/stend-porogi.py` (без root; число исполненных проб печатает сам стенд).
Не ловит: подписки Codex и выключенные; окна вне pyat_chasov/nedelya; расход между замерами.

## DeepSeek r10: своя учётка и LoadCredential

Сеть за балансом ходит `dsh-limity-deepseek` (юнит `dsh-limity-deepseek.service`, учётка `limity-ds` без шелла, ProtectSystem=strict), ключ —
только через LoadCredential. Добавить ключ: строка `deepseek` в конфиге → `dsh-limity-podpiski klyuch <ключ>` (drop-in
`/etc/systemd/system/dsh-limity-deepseek.service.d/klyuch-<ключ>.conf` + daemon-reload). Тревоги — у `dsh-limity-zamer` (root) по таблице.

## Служба молчит (r20)

- Служба кладёт в корень выдачи `vydano_unix` — момент сборки (`snyato_unix` в корне — самый старый замер, не момент выдачи).
- Замер в `porogi_prohod` раз в 10 мин: выдача старше 40 мин → «⚠️ dsh-limity: выдача не обновлялась N мин → sudo systemctl status dsh-limity»,
  отбой «✅ dsh-limity: выдача снова обновляется»; по переходу, «сказано» — по доставке. Выдачи нет вовсе — только СЛЕПОТА в журнале.

## Чего не ловит

- расход вне источников (владелец в claude.ai, сторонние клиенты) — виден только ростом доли у следующего замера;
- простаивающие подписки Claude до такта Б; если Б не пройдёт пробу scope — «не измерено» как норма;
- Claude вовсе до такта 2: шлюзы ещё не пишут;
- точные остатки в токенах — сервер даёт доли;
- исправность страницы `lim.insmat.ru` и забора на vps-ru;
- поля Codex, которых нет в полученном состоянии codex-limit-watch; поддержанные credits/окна доступны при наличии сырого ответа, отсутствие остальных полей остаётся неизвестным;
- изменение формата состояния `codex-limit-watch` — оно станет СЛЕПОТОЙ, но не молчанием;
- DeepSeek: ключи других машин (aclaude, bclaude) — «не измеряется»; два ключа ОДНОГО аккаунта DeepSeek дают один и тот же баланс
  (живой 20:12Z: ключи sadik и Варвары — 373.53 CNY / −0.03 USD); баланс без хода к модели не говорит, сколько осталось «ходов»;
- DeepSeek-замер отдельный: нет LoadCredential — снимок «не измерено» с причиной, проход может завершиться кодом 0; отсутствующий state-файл начинает новое состояние. Нечитаемый/негодный state или негодный конфиг без годной копии — слепота кодом 2. Тревоги по снимкам в таблице отправляет dsh-limity-zamer; остановка этой обёртки оставит отдельный баланс без её тревог.

## Стенд

`test/stend-dsh-limity.sh` — 19 проб, **от root** (с 1.0.3: файлы приёмной раскладываются по учёткам daemon/bin/sys через chown, иначе подлог «чужой подписки» не создать; без root — СЛЕПОТА код 2; в обход — строкой `@root`). Совместимость выдачи проверяют настоящий читатель переключателя (`pereklyuchatel-podpiski-limity.py <номер> --baza <limity.db> --nastrojka <файл>`) и настоящий скрипт страницы `lim.insmat.ru` (снимок `test/stranica-lim-insmat.html` от 07.10 16:40Z, гонится под `node`). Снимок страницы — не живая страница: правку страницы на vps-ru стенд не увидит, снимок надо обновлять.

`test/stend-konfig.py` — стенд управления конфигом подписок (`proverit`, слепота при негодном конфиге, добавление и выключение
подписки, `vojti`, `snyat`; суммы кода пакета сверяются до и после). 🔴 Он работает на живой машине: запускается только от root
и только с единственным доводом `--zhivaya-mashina` — без него или с любым другим доводом печатает `ОТКАЗ-ZHIVAYA-MASHINA` и
выходит кодом 2, ничего не тронув. Подставные учётки и группу (`limity-zamer-st<pid>-p1…p4`, `-v5`, `-g1`, `-g2`, группа `-gr`)
стенд заводит сам через `useradd`/`groupadd`, то есть пишет живые `/etc/passwd`, `group`, `shadow`, `gshadow`, и снимает их на
выходе (`finally`, `atexit`, SIGTERM/SIGINT/SIGHUP). После SIGKILL они остаются: найти — `getent passwd | grep '^limity-zamer-st'`,
снять `userdel`/`groupdel` по имени. Живые `nobody`, `daemon`, `bin`, `sys`, `lp`, `mail` и группу `limity-vhod` стенд не меняет, только
сверяет. Путь к проверяемым файлам доводом он не принимает: службу и обёртку замера можно подменить переменными `DSH_LIMITY_TEST`
и `DSH_LIMITY_ZAMER_TEST`, а `dsh-limity-podpiski`, `dsh-limity-zamer.mjs` и `dsh_limity_konfig.py` берутся из дерева рядом со стендом.
Коды: 0 — все пробы прошли, 1 — хоть одна не прошла, 2 — отказ или слепота (не root, нет файла кода, учётка не заведена);
прерванный сигналом стенд выходит кодом 128+номер сигнала.

## Ledger и отказы №11

Состояния zamer, avtoperekl и deepseek пишутся атомарно общей библиотекой: временный JSON рядом, fsync файла, replace и fsync каталога. Негодный JSON или тип потребляемого поля — код 2, без сброса выдержки/суточного потолка. Оператор восстанавливает ledger из собственной годной страховки и сверяет счётчики; пустой файл не считается безопасным восстановлением. Отказ записи перед внешним действием блокирует запрос/переключение. Ошибка после replace может означать уже состоявшуюся запись — нужна отдельная сверка.

Root callers именуют отправку/недоставку тревоги. DeepSeek передаёт ошибочный снимок в существующую приёмную; цепочка dsh-limity → root dsh-limity-zamer читает его для тревоги и отбоя. Три collector/auto-unit теперь считают код 2 отказом (SuccessExitStatus=0); основной unit dsh-limity.service сохраняет прежнюю политику.

`DSH_LIMITY_DEEPSEEK_URL` разрешён только при `DSH_LIMITY_DEEPSEEK_STEND=1`: без ключа подмена игнорируется с именем, неизвестное значение ключа — код 3. Это защита конкретного URL, не всего окружения: PATH, DSH_LIMITY_LIB и штатные пути/настройки DSH_LIMITY_* сохранены.

Автопереключатель при MainPID=0 пишет строку с именем шлюза и продолжает живые; нечисловой PID или неизвестная подписка живого процесса остаются слепотой кодом 2. Выдержка 30 мин, цели 1–3 и общая политика выбора сохранены. Пакетный стенд состояния — test/stend-audit-sostoyanie.py; --zhivaya-mashina этим окном не требуется и не запускается.

## Команды и исходы

- `dsh-limity-podpiski proverit` / `spisok` — проверка конфига и список. Недоступный каталог в spisok печатается как «вход ? — не проверить без root», а не отсутствующий вход; подробную проверку делай от root.
- `vojti <ключ> [--prichina <текст>]` — интерактивный вход; `snyat <ключ> --prichina <текст>` — выключение; `klyuch <ключ>` — установка DeepSeek LoadCredential. Эти команды меняют учётки/конфиг/входы, их не запускают как «проверку».
- `dsh-limity`, `dsh-limity-zamer`, `dsh-limity-deepseek`, `dsh-limity-avtoperekl` — без доводов: 0 проход состоялся, 2 слепота, 3 неверный вызов. У zamer/deepseek/avtoperekl SuccessExitStatus=0: код 2 теперь означает failure юнита. У основной dsh-limity.service прежний SuccessExitStatus=0 2; он не доказывает успешный замер источника.
- `dsh-limity-vydat` — без доводов и SSH_ORIGINAL_COMMAND: 0 файл отдан; 2 файл не прочитан; 3 команда запрещена. Он не удостоверяет свежесть выдачи.
- Читатель заслона: `python3 /usr/local/libexec/pereklyuchatel-podpiski-limity.py <номер> --baza <limity.db> --nastrojka <файл>`; 0 free, 10 blocked, 20 unknown. Ключа --file у него нет.

[Схема двух пакетов и ссылки RU/EN](../../docs/SUBSCRIPTIONS-AND-LIMITS.ru.md).
