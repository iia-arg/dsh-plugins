# Настройки · Settings

Файла настройки у пакета нет: каждая команда читает только свои переменные окружения. Для учётов, мест монтажа, плагинов, пресета, потребителей и учёта доработок умолчания в коде нет — команда отвечает СЛЕПОТОЙ «не задан» или пропускает блок с явной строкой, а не смотрит в пути чужой машины.
The package has no settings file: every command reads only its own environment variables. For tracked trees, install locations, plugins, presets, consumers and the external ledger, the code has no default — the command reports BLIND "not set" or skips the block with an explicit line instead of looking at another host's paths.

## Сторож: файл настройки и старшинство · Watchdog: settings file and precedence

`registry-watchdog` дополнительно подключает свой файл `REGWD_CONF` (синтаксис оболочки). Старшинство: **файл > окружение > умолчание в коде** — файл подключается после умолчаний и перебивает переменные окружения. Стенды, которые подают значения окружением, задают `REGWD_CONF=/dev/null` («настройки нет»).
`registry-watchdog` also sources its own `REGWD_CONF` file (shell syntax). Precedence: **file > environment > code default** — the file is sourced after the defaults and overrides environment variables. Stands that pass values through the environment set `REGWD_CONF=/dev/null` ("no settings").

Файл исполняется, поэтому принимается только файл root или учётки сторожа, не доступный на запись группе и всем; иной файл НЕ читается, и это СЛЕПОТА с причиной в выводе и тревоге. Не ловится: права каталога выше файла и подмена самой учётки-хозяина.
The file is executed, so only a file owned by root or by the watchdog's own account and not writable by group or others is accepted; any other file is NOT read, and that is BLIND with the reason in the output and the alert. Not caught: permissions of the directory above the file and a compromised owner account.

## Переменные · Variables

| переменная · variable | команда · command | умолчание · default | смысл · meaning | пусто или неверно → · empty or wrong → |
|---|---|---|---|---|
| `PLUGINS_REGISTRY` | `agent-plugins`, `sverka-montazha` | `/etc/agent-registry/plugins.yaml` | реестр вмешательств; иной путь печатает предупреждение в stderr · the intervention registry; another path prints a warning to stderr | нет файла, не YAML, пуст, не словарь, запись без `id` — СЛЕПОТА «реестр не прочитан», код 2 · missing, not YAML, empty, not a mapping, an entry without `id` — BLIND "registry not read", exit 2 |
| `AGENTS_REGISTRY` | `agent-plugins verify` | `/etc/agent-registry/agents.yaml` | реестр агентов, **обязателен** для `verify`: обратная сверка ждёт `agenty[].imya` и `agenty[].namerenie.dom`; профиль A и `<дом>/plugins/*` каждого агента должны быть покрыты записью · the agent registry, **required** by `verify`: the reverse check expects `agenty[].imya` and `agenty[].namerenie.dom`; each agent's profile A and `<home>/plugins/*` must be covered by an entry | нет файла — `verify` код 2 при любом реестре вмешательств · missing — `verify` exits 2 whatever the intervention registry says |
| `AGENT_PLUGINS_STRAHOVKI` | `agent-plugins pravka` | `/var/backups/montazh` | корень копий до правки (`<корень>/<пункт>/`) · root of pre-edit backups (`<root>/<label>/`) | копии лягут в другой корень · backups land under another root |
| `AGENT_PLUGINS_RUKA` | `agent-plugins pravka` | — | «Имя <почта>» автора коммита учёта; сильнее таблицы · «Name <email>» of the ledger commit author; beats the table | иная форма — отказ 3 · other form — refusal 3 |
| `AGENT_PLUGINS_RUKI` | `agent-plugins pravka` | `ruki.tsv` рядом с реестром · next to the registry | файл таблицы рук: строка `учётка<TAB>Имя <почта>`, `#` — комментарий; рука ищется по `SUDO_USER`, затем `USER` · hands table file: `account<TAB>Name <email>` per line, `#` comments; looked up by `SUDO_USER`, then `USER` | нет файла — рука «учётка <учётка@узел>» с ⚠️; кривые строки названы в ⚠️ · no file — author "account <account@host>" with ⚠️; bad lines named in the ⚠️ |
| `REGWD_CONF`, `REGWD_STATE`, `REGWD_ALERT` | `registry-watchdog` | `/etc/registry-watchdog/registry-watchdog.conf`, `/var/lib/registry-watchdog`, `/usr/local/bin/agent-alert` | свой файл настройки, состояние (отметки прогона и голоса), команда тревоги · own settings file, state (run and voice stamps), alert command | состояние без записи — СЛЕПОТА; нет команды тревоги — код 2 · unwritable state — BLIND; no alert command — exit 2 |
| `VERIFY_CMD` | `registry-watchdog` | `sudo -n agent-plugins verify` (с `--avto-montazh` при ключе сторожа · with the flag in automatic mode) | сверка реестра машины, по `PATH` (у `sudo` — `secure_path`) · host registry check, via `PATH` (`secure_path` under `sudo`) | не запустилась (127) — СЛЕПОТА · did not start (127) — BLIND |
| `VERIFY_IZVESTNAYA_SLEPOTA` | `registry-watchdog` | пусто · empty | id записей через пробел с известной слепотой `verify`: строка в журнал без тревоги · space-separated ids with a known `verify` blindness: a journal line, no alert | — |
| `AGENTS_VERIFY_CMD` | `registry-watchdog` | пусто · empty | сверка реестра агентов (внешняя команда, например `agent-registry verify`) · agent registry check (an external command, e.g. `agent-registry verify`) | пусто — блок пропущен строкой «не задан», в итоге «НЕ проверялось» · empty — block skipped with a "not set" line, "NOT checked" in the summary |
| `DORABOTKI_CMD` | `registry-watchdog` | пусто · empty | учёт доработок вне пакетов (внешняя команда) · out-of-package ledger (an external command) | пусто — блок пропущен строкой «не задан» · empty — block skipped with a "not set" line |
| `HEALTH_CMD`, `HEALTH_ENABLED`, `HEALTH_UNCHECKED_MAX` | `registry-watchdog` | `agent-plugins list --health` (с ключом в автоматическом режиме · with the flag in automatic mode), `1`, `0` | живость записей; спрашивать ли её; сколько записей без `healthcheck` считать нормой · entry liveness; whether to ask; how many entries without `healthcheck` count as normal | записей без `healthcheck` больше порога — РАСХОЖДЕНИЕ каждый прогон · more entries without `healthcheck` than the limit — DRIFT on every run |
| `HEARTBEAT_DAYS`, `GAP_DAYS` | `registry-watchdog` | `7`, `2` | молчал столько суток — сказать «жив»; перерыв больше — сказать, что сторож не работал · silent this long — say "alive"; a longer gap — say the watchdog did not run | — |
| `RAW_LINES`, `RAW_CHARS`, `DPKG_LOG` | `registry-watchdog` | `14`, `200`, `/var/log/dpkg.log` | сколько сырья класть в тревогу; откуда «что ставил apt» · how much raw output goes into an alert; where "what apt installed" comes from | — |
| `PEER_ENABLED`, `PEER_TIMER`, `PEER_UNIT`, `PEER_FRESH_MIN`, `PEER_MIN_PER_DAY`, `PEER_DONE_MSGID` | `registry-watchdog` | `1`, `agent-watchdog.timer`, `agent-watchdog.service`, `15`, `250`, событие systemd «заход завершён» · systemd "run finished" event | наблюдение за соседним сторожем машины · watching the neighbouring host watchdog | `PEER_ENABLED=0` — не наблюдать · `PEER_ENABLED=0` — do not watch |
| `NEZAF_UCHYOTY` | `nezafiksirovano-watch` | нет · none | git-учёты через «:» · tracked git trees separated by «:» | не задан или пуст — СЛЕПОТА, код 2, тревога · unset or empty — BLIND, exit 2, alert |
| `NEZAF_PREDEL_CH`, `NEZAF_ALERT` | `nezafiksirovano-watch` | `6`, `/usr/local/bin/agent-alert` | предел возраста в часах; команда тревоги · age limit in hours; alert command | не положительное число — СЛЕПОТА · not a positive number — BLIND |
| `PRESET_SVERKA_NASH`, `PRESET_SVERKA_ZAVOD`, `PRESET_SVERKA_NASH_ID` | `preset-sverka` | нет · none | профиль A с нашим пресетом; заводской `standard.patch.yml`; id строки нашего пресета · profile A carrying our preset; the factory `standard.patch.yml`; id of our preset entry | не задано — СЛЕПОТА с именем переменной, код 2 · unset — BLIND naming the variable, exit 2 |
| `SHVY_KOREN` | `shvy-mezhdu-paketami-watch` | `/opt/agent-plugins/node_modules` и каталоги `/opt/agent-plugins/dsh-*` без `.bak` · and `/opt/agent-plugins/dsh-*` directories without `.bak` | корни области через «:» · area roots separated by «:» | корня нет — СЛЕПОТА · a missing root — BLIND |
| `SHVY_POTREBITELI` | `shvy-mezhdu-paketami-watch` | пусто · empty | каталоги кода вне области, импортирующего пакеты по абсолютному пути (Ш3), через «:» · code directories outside the area importing packages by absolute path (Ш3), separated by «:» | пусто — Ш3 не проверяется, это сказано в строке покрытия · empty — Ш3 is not checked, said in the coverage line |
| `OBLAST_OBSHCHIJ`, `OBLAST_UZLY` | `priznak-oblasti-podklyucheniya` | `/opt/agent-plugins`; `/opt/iskra/.dsh/profiles /opt/petrovich/.dsh/profiles` | общий каталог; каталоги профилей узлов через пробел · shared directory; node profile directories, space-separated | ни один узел не прочитан — СЛЕПОТА · no node read — BLIND |
| `SVERKA_MESTA` | `sverka-montazha` | нет · none | места монтажа через пробел · install locations, space-separated | не задано — СЛЕПОТА, код 2 · unset — BLIND, exit 2 |
| `SVERKA_PLAGINY` | `sverka-zavisimostej` | нет · none | каталоги плагинов через пробел (точка входа — `src/index.js`) · plugin directories, space-separated (entry point `src/index.js`) | не задано — СЛЕПОТА, код 2 · unset — BLIND, exit 2 |
| `SREZ_JA`, `SREZ_PROFILI` | `srez-obshchego-kataloga` | `id -un`, `/opt/$SREZ_JA/.dsh/profiles` | чей профиль обходить · whose profile to walk | — |

Переменные стендов (`REESTR`, `INSTRUMENT`, `SUT`, `PRAVKA_INSTRUMENT`, `PRIBOR`, `MANIFEST_REAL`) — в `docs/GUARDS.md`.
Stand variables (`REESTR`, `INSTRUMENT`, `SUT`, `PRAVKA_INSTRUMENT`, `PRIBOR`, `MANIFEST_REAL`) — see `docs/GUARDS.md`.

## Команда тревоги · Alert command

`REGWD_ALERT` и `NEZAF_ALERT` — любая исполняемая команда с одним доводом: текст тревоги. `REGWD_ALERT` получает HTML телеграма (`<b>`, `<pre>`; данные экранированы); `NEZAF_ALERT` получает обычный текст без HTML-экранирования — канал отвечает за безопасное отображение. Код 0 — доставлено; иной код — не доставлено: сторож реестров выходит кодом 2 и не сдвигает отметку голоса, `nezafiksirovano-watch` выходит кодом 3. Заглушка, которой хватает для проб:
`REGWD_ALERT` and `NEZAF_ALERT` are any executable taking one argument: the alert text. `REGWD_ALERT` receives Telegram HTML with escaped data; `NEZAF_ALERT` receives plain text without HTML escaping, so the channel must render it safely. Exit 0 means delivered; any other code means not delivered: the registry watchdog exits 2 and does not move its voice stamp, `nezafiksirovano-watch` exits 3. A stub good enough for tests:

```sh
#!/bin/sh
printf '%s\n' "$1" >> /var/log/dsh-reestr-alerts.log
```

В тревогу уходит сырьё — до `RAW_LINES` строк stdout/stderr проверок по `RAW_CHARS` знаков. Это не фильтр секретов: команды проверок в реестре не должны печатать значения секретов, даже в отказах.
Raw output goes into the alert — up to `RAW_LINES` lines of the checks' stdout/stderr, `RAW_CHARS` characters each. This is not a secret filter: check commands in the registry must not print secret values, not even in failures.

## Реестр — исполняемая политика · The registry is executable policy

Каждая строка `installed_check`, `fingerprint_check`, `healthcheck` и `latest_check` исполняется через `bash -c`, а сторож по умолчанию зовёт `verify` от root (`sudo -n`). Право записи в реестр равно исполнению кода от root: владелец реестра — root, запись — только root или группа, чьи члены и без того имеют `sudo`. `pravka` переносит режим и владельца со старого файла, но не проверяет их. Отказа `verify` на реестр, доступный на запись не-root, нет — права остаются решением владельца машины.
Every `installed_check`, `fingerprint_check`, `healthcheck` and `latest_check` line is executed via `bash -c`, and the watchdog calls `verify` as root by default (`sudo -n`). Write access to the registry equals running code as root: the registry is owned by root and writable only by root or by a group whose members already have `sudo`. `pravka` carries mode and owner over from the old file but does not check them. `verify` does not refuse a registry writable by non-root — permissions stay the host owner's decision.

## Запись реестра · Registry entry

```yaml
plugins:
  - id: my-plugin                         # обязателен, строка · required, a string
    name: "что это одной строкой · one-line description"
    version: "1.2.3"
    origin: ours                          # ours | чужой · third-party
    path: /opt/<plugins-dir>/node_modules/my-plugin
    source: { type: npm, address: my-plugin }
    used_by: "кто зовёт · who calls it"
    breaks_if_gone: "что сломается · what breaks"
    installed_check: "node -p \"require('/opt/<plugins-dir>/node_modules/my-plugin/package.json').version\""
    fingerprint: "0123456789abcdef"       # необязательно · optional
    fingerprint_check: "…команда, печатающая отпечаток · command printing the fingerprint"
    healthcheck: "…команда живости · liveness command"   # без неё запись считается в HEALTH_UNCHECKED_MAX · without it the entry counts toward HEALTH_UNCHECKED_MAX
```

Автоматическое окно: см. README «Окно монтажа». Файл `REGWD_CONF` перебивает и команды с автоматически добавленным ключом: для машинной автоматической проверки ключ указывается в командах файла явно.
Automatic window: see README “Deployment window”. `REGWD_CONF` overrides even defaults with the automatic flag; host check commands must carry the flag explicitly.
