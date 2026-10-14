# Сторожа и проверки · Guards and checks

Общее правило кодов: 0 — чисто, 1 — найдено расхождение, 2 — слепота (измерить не удалось). Исключения названы в таблице кодов ниже. «Не смог измерить» никогда не печатается как «сошлось».
General exit-code rule: 0 clean, 1 drift found, 2 blind (could not measure). Exceptions are listed in the exit-code table below. "Could not measure" is never printed as "matched".

| команда · command | ловит · catches | НЕ ловит · misses | куда кричит · alerts to |
|---|---|---|---|
| `agent-plugins verify` | версия или отпечаток записи ≠ машине; места агентов без записи · entry version or fingerprint ≠ host; agent places without an entry | то, чего нет в реестре; слабую `installed_check` · anything not in the registry; a weak `installed_check` | код возврата · exit code |
| `registry-watchdog` | расхождение реестров раз в сутки, свою слепоту, недоставленную тревогу · daily registry drift, its own blindness, an undelivered alert | собственную смерть (выключенный таймер — молчание); блоки с пустой командой — пропущены и названы · its own death (a disabled timer is silence); blocks with an empty command — skipped and named | `REGWD_ALERT` |
| `nezafiksirovano-watch` | изменения в git-учётах старше предела · uncommitted changes older than the limit | учёт, которого нет в перечне `NEZAF_UCHYOTY` · a tracked tree missing from `NEZAF_UCHYOTY` | `NEZAF_ALERT` |
| `shvy-mezhdu-paketami-watch` | поле без второй стороны, импорт по абсолютному пути вместо имени · a field with no writer, an absolute-path import instead of a package name | Ш3 при пустом `SHVY_POTREBITELI` (сказано в покрытии) · Ш3 with an empty `SHVY_POTREBITELI` (said in the coverage line) | код 3 · exit 3 |
| `sverka-montazha` | смонтировано без записи · installed but unrecorded | записано без монтажа; плагин в необъявленном месте; подмену содержимого · recorded but not installed; a plugin in an undeclared place; content substitution | вывод · output |
| `priznak-oblasti-podklyucheniya` | подключённое к агентам без объявления и наоборот · attached to agents but undeclared, and vice versa | «одно имя — два предмета»: судит по имени и цели ссылки · "one name, two packages": judges by name and link target | вывод · output |
| `srez-obshchego-kataloga` | что реально загрузится; копию пакета под другим именем · what will actually load; a package copy under another name | совместимость версий · version compatibility | вывод с машиной и временем · output stamped with host and time |
| `sverka-zavisimostej` | незаявленные зависимости плагина от дерева платформы · undeclared plugin dependencies on the platform tree | другое поведение пакета при той же разрешимости · changed behaviour with the same resolvability | вывод · output |
| `agent-plugins-lock-check` | lock-файл ≠ архивам ≠ диску · lock file ≠ archives ≠ disk | скрытый lock npm и сеть — не спрашивает · the hidden npm lock and the network — never consulted | код возврата · exit code |
| `preset-sverka` | пропавшие намеренные отличия пресета и новые строки заводского · lost intentional preset differences and new factory entries | содержимое строк, подхват пресета живой сессией · entry contents, whether a live session picked the preset up | код возврата · exit code |

В тревогу сторожей уходит сырьё — строки stdout/stderr проверок (`RAW_LINES` × `RAW_CHARS`). Это не фильтр секретов: проверки в реестре не должны печатать значения.
The watchdogs' alerts carry raw output — stdout/stderr lines of the checks (`RAW_LINES` × `RAW_CHARS`). This is not a secret filter: registry checks must not print secret values.

## Коды по командам · Exit codes per command

| команда · command | 0 | 1 | 2 | иное · other |
|---|---|---|---|---|
| `agent-plugins verify` | совпадает · matches | расхождение · drift | слепота, сильнее расхождения: запись не проверена, реестр или реестр агентов не прочитаны · blind, beats drift: an entry unchecked, the registry or agent registry not read | 3 — незнакомый довод · unknown argument; 4 — только адресная отсрочка с --avto-montazh · scoped automatic deferral only |
| `agent-plugins list`, `check`, `diff` | напечатано, сверено · printed, compared | `list --health`: запись не «живой»; `diff`: файл не сверен · `list --health`: an entry not "alive"; `diff`: a file not compared | реестр не прочитан; `diff` — нет записи с `published` · registry not read; `diff` — no entry with `published` | 3 — незнакомый довод · unknown argument; `list --health --avto-montazh`: 4 — отложено · deferred |
| `agent-plugins pravka` | сухой прогон или установка прошли · dry run or install passed | отказ по содержанию (в т. ч. запись `plugins`/`services` без `id`) · refusal on content (incl. a `plugins`/`services` entry without `id`) | слепота: нет редакции, текущий реестр сломан, нет права записи · blind: no revision, current registry broken, no write permission | 3 — неверный вызов · bad call; 5 — коммит учёта не сделан, установка в силе · ledger commit failed, install stands |
| `registry-watchdog` | ЗЕЛЕНО · GREEN | РАСХОЖДЕНИЕ или СЛЕПОТА ПРОВЕРОК живости · DRIFT or liveness CHECK BLINDNESS | СЛЕПОТА; тревога не доставлена; довод · BLIND; alert not delivered; an argument | `--help` — 0; 4 — отложено с --avto-montazh · automatic deferral |
| `nezafiksirovano-watch` | чисто · clean | просрочено, тревога ушла · overdue, alert sent | слепота (тревога ушла); довод · blind (alert sent); an argument | 3 — тревога не ушла · alert not delivered |
| `shvy-mezhdu-paketami-watch` | чисто · clean | — | слепота · blind | 3 — найден шов · seam found |
| `preset-sverka` | совпадает · matches | расхождение · drift | слепота; довод · blind; an argument | — |
| `sverka-montazha` | всё смонтированное записано · everything installed is recorded | вне реестра · outside the registry | слепота: реестр не прочитан, 0 путей, `SVERKA_MESTA` пуст, «РАЗЛИЧЕНИЯ НЕТ» · blind: registry not read, 0 paths, empty `SVERKA_MESTA`, "NO DISCRIMINATION" | — |
| `priznak-oblasti-podklyucheniya` | расхождений нет · no drift | расхождение · drift | слепота · blind | — |
| `sverka-zavisimostej`, `agent-plugins-lock-check` | чисто · clean | расхождение · drift | слепота (у `sverka-zavisimostej` — и пустой `SVERKA_PLAGINY`) · blind (for `sverka-zavisimostej` also an empty `SVERKA_PLAGINY`) | — |
| `srez-obshchego-kataloga` | срез напечатан, вердикта нет · snapshot printed, no verdict | — | нет каталога; ключ или лишний довод · no directory; a flag or extra argument | `--help` — 0 |

## Стенды · Stands (`test/`)

Все стенды: 0 — сошлось, 1 — красное, 2 — стенд не смог проверить. Подставные данные — во временных каталогах; исключение — `stend-krug-samoproverki`.
All stands: 0 passed, 1 red, 2 the stand could not check. Substitute data lives in temporary directories; the exception is `stend-krug-samoproverki`.

| стенд · stand | запуск · how to run | что ждать · what to expect |
|---|---|---|
| `progon-na-podstave.sh` | `npm test` или · or `bash test/progon-na-podstave.sh`; от учётки с `sudo -n`, не от root · from an account with `sudo -n`, not root | временный корень с образцом реестра и реестром агентов; образец `verify` обязан дать 0; затем на инструментах пакета `stend-priznaka-oblasti`, `stend-pravki-reestra`, `stend-storozha-reestrov`, `stend-uchteno-v`, `stend-nahodok-audita-16`, `stend-svezhej-osnovy` — итог «зелёных 6 из 6», код 0. Под root печатает пометку: у `stend-pravki-reestra` 5 проб EPERM слепы, код 2 · a temp root with a sample registry and agent registry; the sample `verify` must give 0; then the package's tools run `stend-priznaka-oblasti`, `stend-pravki-reestra`, `stend-storozha-reestrov`, `stend-uchteno-v`, `stend-nahodok-audita-16`, `stend-svezhej-osnovy` — "green 6 of 6", exit 0. Under root it prints a note: 5 EPERM probes of `stend-pravki-reestra` are blind, exit 2 |
| `stend-uchteno-v.sh` | `bash test/stend-uchteno-v.sh` (`AP` — путь `agent-plugins`, умолчание `../bin`) · (`AP` — path to `agent-plugins`, default `../bin`) | 13 случаев поля `uchteno_v`; `sudo` не нужен · 13 cases of the `uchteno_v` field; no `sudo` needed |
| `stend-nahodok-audita-16.sh` | `bash test/stend-nahodok-audita-16.sh` (`BIN` — каталог команд, умолчание `../bin` · `BIN` — commands directory, default `../bin`) | 22 пробы к находкам кода аудита 16; на командах до правки краснеют все 22; `sudo` не нужен · 22 probes for audit-16 code findings; on the pre-fix commands all 22 go red; no `sudo` needed |
| `stend-pravki-reestra.sh` | `PRAVKA_INSTRUMENT=<путь · path> bash test/stend-pravki-reestra.sh` | все исходы `pravka` на подставном реестре; счёт 52. Нужен `sudo -n`; **зелёный только от не-root учётки**: под root 5 проб EPERM честно слепы (root их не воспроизводит), код 2 · every `pravka` outcome on a scratch registry; count 52. Needs `sudo -n`; **green only from a non-root account**: under root 5 EPERM probes are honestly blind (root cannot reproduce them), exit 2 |
| `stend-storozha-reestrov.sh` | `SUT=<сторож · watchdog> INSTRUMENT=<agent-plugins> REESTR=<реестр · registry> bash test/stend-storozha-reestrov.sh` (`REESTR` по умолчанию — `PLUGINS_REGISTRY`, затем `/etc/agent-registry/plugins.yaml` · defaults to `PLUGINS_REGISTRY`, then `/etc/agent-registry/plugins.yaml`) | «умеет ли сторож краснеть»: 14 проверок; случай 13 (учёт доработок) — только при заданных `DORABOTKI_CMD` и читаемом `MANIFEST_REAL`, иначе «ПРОПУСК 13» с именем и канарейка 13. Сначала один прогон сторожа: машина не зелёная — слепота 2 · "can the watchdog go red": 14 checks; case 13 (out-of-package ledger) — only with `DORABOTKI_CMD` set and a readable `MANIFEST_REAL`, otherwise a named "SKIP 13" and a canary of 13. First one watchdog run: host not green — blind 2 |
| `stend-priznaka-oblasti.sh` | `bash test/stend-priznaka-oblasti.sh` (`PRIBOR` — путь прибора; умолчание `../bin/…`, иначе соседний файл · `PRIBOR` — tool path; default `../bin/…`, else the neighbouring file) | 8 проб с порчами, каждая печатает факт внесения; прибор читает узлы через `sudo -n` · 8 probes with corruptions, each prints that it was applied; the tool reads nodes via `sudo -n` |
| `stend-krug-samoproverki.sh` | только вручную · manual only: `--zhivaya-mashina [--okno]` | 🔴 трогает живые таймеры и маску `apt-daily-upgrade`; без ключа — отказ 2 · 🔴 touches live timers and the `apt-daily-upgrade` mask; without the flag — refusal 2 |

| `stend-montazh-mode.sh`, `test_montazh_mode.py` | `sudo -n bash test/stend-montazh-mode.sh` | оболочка зовёт Python unittest; подставные окна, реестры и каналы, root для смены uid; без боевых юнитов · shell wrapper invokes Python unittest with substitute windows, registries and channels, root for uid mutation; no live units |
| `stend-svezhej-osnovy.py` | `python3 -B test/stend-svezhej-osnovy.py` (`BIN` — другая копия bin для красной основы) | края свежей основы: PATH, обязательный реестр агентов, конфигурация, raw-расхождение, минута 0, вызовы CLI и пресет с заданным id; только /tmp и заглушка · fresh-base edges in /tmp with a stub channel |

## Как читать тревогу · Reading an alert

Тревога всегда несёт предмет и сторону: какая запись, что записано, что на машине. Сначала ответьте, ваша ли это правка: своё несведённое лечится новой редакцией реестра через `pravka`, чужая порча — возвратом предмета. Сторож этого не различает и не должен.
An alert always carries the subject and the side: which entry, what is recorded, what is on the host. First decide whether it is your own change: your own unfinished change is fixed by a new registry revision via `pravka`, someone else's damage by restoring the item. The watchdog cannot tell them apart and is not meant to.

`agent-plugins list --health --avto-montazh` тоже допускает код 4 только для `montazh_consistency: true` и покрытого окном расхождения; без ключа или для обычной живости отсрочки нет. `test/stend-montazh-mode.sh` — сохранённые пробы этого договора на подставном состоянии (для смены uid нужен root); боевые юниты не запускает.
`list --health --avto-montazh` also permits 4 only for window-covered consistency drift, never ordinary liveness. `test/stend-montazh-mode.sh` preserves the fixture regression (root is needed for uid mutation); it does not start live units.
