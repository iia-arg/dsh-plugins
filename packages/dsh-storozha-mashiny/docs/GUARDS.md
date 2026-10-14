# Сторожа и проверки · Guards and checks

Указатель по всем 16 модулям: что ловит, чего НЕ ловит, куда кричит, коды выхода. Полный текст — в разделе модуля (ссылка в заголовке). Раздел «чего НЕ ловит» — не мелкий шрифт: сторож, который выглядит полной защитой, гасит вопрос обо всём классе бед, поэтому читайте его первым.

An index of all 16 modules: what it catches, what it does NOT catch, where it reports, exit codes. Full text — in the module section (linked in the heading). The "does NOT catch" part is not fine print: a watchdog that looks like complete protection stops people asking about the whole class of failures, so read it first.

## Общие правила чтения · How to read any of them

Код 2 почти у всех значит «слепота или не настроено»: сторож НЕ смог проверить и говорит об этом, а не молчит «чисто». Тишина сторожа значит «чисто» только при коде 0 и только в пределах того, что он ловит. Где модуль считает «успехом» юнита и находки (`SuccessExitStatus=`), это сказано ниже, — тогда юнит в состоянии `failed` не появится, и исход надо читать в журнале или в файле итога.

Exit 2 almost everywhere means "blindness or not configured": the watchdog could NOT check and says so instead of a silent "clean". A silent watchdog means "clean" only with exit 0 and only within what it catches. Where a module counts findings as unit success (`SuccessExitStatus=`), it is said below — then the unit never shows `failed`, and the outcome must be read in the journal or the result file.

## agent-watchdog.sh · [moduli/agent-watchdog](moduli/agent-watchdog.md)

- Ловит · Catches: службу не `active`; разовую службу с последним запуском не `done` («ПАДАЕТ»); разовую службу без успешного запуска дольше срока («НЕ СРАБАТЫВАЛ»); неответ сервиса памяти; нехватку места; свою слепоту. · a unit not `active`; a oneshot whose last run did not end `done`; a oneshot with no success within the limit; memory service not answering; low disk space; its own blindness.
- НЕ ловит · Does NOT catch: успешный по коду запуск, который ничего не проверил; `юнит:часы` для `simple`/`forking`; собственную смерть; без файла настройки — службы и память вовсе. · a run that succeeded by code but checked nothing; `unit:hours` for `simple`/`forking`; its own death; without a settings file — units and memory at all.
- Кричит · Reports: `WATCHDOG_ALERT` (HTML); слепота — ещё и `logger -t agent-watchdog`. · `WATCHDOG_ALERT` (HTML); blindness also to `logger -t agent-watchdog`.
- Коды · Exit: 0 проверено · checked; 2 слепота · blindness; 3 (с 1.0.1) тревога не доставлена или помощника нет · (since 1.0.1) alert not delivered or helper missing.

## apt-updates-notify.sh · [moduli/apt-updates-notify](moduli/apt-updates-notify.md)

- Ловит · Catches: ожидающие обновления, включая security среди отложенных; протухшие списки; свою слепоту и перерыв; недоставку тревоги. · pending updates incl. security among phased ones; stale lists; its own blindness and gaps; failed alert delivery.
- НЕ ловит · Does NOT catch: уязвимости без выпущенного пакета; обновления вне apt; ESM без подписки; свою смерть (таймер сторожит `agent-watchdog.sh`); не отличает важное от пустяка. · vulnerabilities without a released package; non-apt updates; ESM without a subscription; its own death (`agent-watchdog.sh` watches the timer); does not tell important from trivial.
- Кричит · Reports: `APTUN_ALERT`; вердикт и сырьё — stdout. · `APTUN_ALERT`; verdict and raw data — stdout.
- Коды · Exit: 0 измерено · measured; 1 списки протухли · lists stale; 2 слепота или человеку не сказано · blindness or human not told.

## dkms-kernel-coverage-check.sh · [moduli/dkms-kernel-coverage-check](moduli/dkms-kernel-coverage-check.md)

- Ловит · Catches: установленное ядро, для которого модуль не `installed`; чинит и сообщает; не смог — тревога «НЕ ПЕРЕЗАГРУЖАТЬ». · an installed kernel without the module `installed`; repairs and reports; failed — "DO NOT REBOOT" alert.
- НЕ ловит · Does NOT catch: загрузку модуля на деле (это `yadro-predohranitel`); ядра не из `linux-image-<цифра>…`. · actual module loading (that is `yadro-predohranitel`); kernels not from `linux-image-<digit>…`.
- Кричит · Reports: `agent-alert` (или запасное имя) и `logger -t dkms-coverage`. · `agent-alert` (or the fallback name) and `logger -t dkms-coverage`.
- Коды · Exit: 0 покрыто или починено · covered or repaired; 1 не починено — НЕ ПЕРЕЗАГРУЖАТЬ · not repaired — DO NOT REBOOT; 2 не настроено или слепота (с 1.0.1: пустой ответ `dpkg-query`/`dkms status`) · not configured or blindness (since 1.0.1: empty `dpkg-query`/`dkms status`).

## dsh-upstream-watch.sh · [moduli/dsh-upstream-watch](moduli/dsh-upstream-watch.md)

- Ловит · Catches: новую, не виденную версию под любой меткой npm. · a new, unseen version under any npm tag.
- НЕ ловит · Does NOT catch: годность версии; переименование пакета; беты отдельно. · whether the version suits you; a renamed package; betas separately.
- Кричит · Reports: `DSH_ALERT`; альфы без признака безопасности — только журнал `dsh-upstream-watch`. · `DSH_ALERT`; alphas without a security marker — journal only.
- Коды · Exit: 0 нового нет · nothing new; 1 есть новое · something new; 2 реестр молчит или (с 1.0.1) источник не дал объект релиза точного тега — альфа не записана, повторится · registry silent or (since 1.0.1) exact-tag release object not obtained — the alpha is not recorded and retried. 3 (с 1.0.2) тревога не доставлена — версия не записана, повтор, юнит failed · (since 1.0.2) alert not delivered — not recorded, retried, unit failed. Юнит: `SuccessExitStatus=0 1 2` (слепота юнит не роняет · blindness does not fail the unit).

## dve-kopii-watch · [moduli/dve-kopii-watch](moduli/dve-kopii-watch.md)

- Ловит · Catches: расхождение кода 9 пакетов между общим деревом и каждой установкой из `DKW_APPS`. · code divergence of 9 packages between the shared tree and each `DKW_APPS` installation.
- НЕ ловит · Does NOT catch: вложенные `node_modules`; пакеты вне списка; установки вне `DKW_APPS`; то, что загружено в живом процессе; расхождение, спрятанное в `package.json`. · nested `node_modules`; packages outside the list; installations outside `DKW_APPS`; what is loaded in a live process; divergence hidden in `package.json`.
- Кричит · Reports: `DKW_ALERT --plain --`; итог — `logger -t dve-kopii-watch`. · `DKW_ALERT --plain --`; summary — `logger -t dve-kopii-watch`.
- Коды · Exit: 0 совпало · matched; 1 разошлось, тревога ушла · diverged, alert sent; 2 слепота или не настроено · blindness or not configured. 4 адресная отсрочка по `--avto-montazh`, состояние не меняется и отбоя нет · scoped deferral with `--avto-montazh`, state unchanged and no recovery alert. Юнит включает ключ, `SuccessExitStatus=1` не включает 4 → failed · unit enables the flag; 4 is not successful → failed.

## hvosty-vartmp-watch · [moduli/hvosty-vartmp-watch](moduli/hvosty-vartmp-watch.md)

- Ловит · Catches: записи верхнего уровня `/var/tmp` без изменений дольше 72 ч; истёкшие исключения; негодные строки перечня. · top-level `/var/tmp` entries unchanged for over 72 h; expired exemptions; invalid list lines.
- НЕ ловит · Does NOT catch: хвосты глубже и вне `/var/tmp`; подделанный mtime; цели ссылок. Живую запись, которую только читают, назовёт хвостом (ложно, но громко). · leftovers deeper or outside `/var/tmp`; a forged mtime; link targets. A live entry that is only read will be called a leftover (false but loud).
- Кричит · Reports: `agent-alert --plain --`; итог — stdout. · `agent-alert --plain --`; summary — stdout.
- Коды · Exit: 0 нет · none; 1 есть, тревога ушла · found, alert sent; 2 слепота · blindness; 3 есть, тревога НЕ ушла · found, alert NOT sent. Юнит: `SuccessExitStatus=1`.

## inet6-poyavlenie-watch · [moduli/inet6-poyavlenie-watch](moduli/inet6-poyavlenie-watch.md)

- Ловит · Catches: появление глобального inet6 или маршрута v6 по умолчанию; исчезновение обоих. · a global inet6 or default v6 route appearing; both disappearing.
- НЕ ловит · Does NOT catch: адрес, мелькнувший между прогонами (30 мин); отказы приложений по IPv6. · an address that flashed between runs (30 min); applications' IPv6 failures.
- Кричит · Reports: `agent-alert` (или `claudeclaw-alert`), один вызов на смену состояния; журнал `inet6-poyavlenie-watch`. · one call per state change; journal tag `inet6-poyavlenie-watch`.
- Коды · Exit: 0 прогон состоялся · run happened; 1 (с 1.0.1) тревога не доставлена — состояние не тронуто, повтор · (since 1.0.1) alert not delivered — state untouched, retry; 2 слепота `ip` · `ip` blindness.

## kontekst-zamer · [moduli/kontekst-zamer](moduli/kontekst-zamer.md)

- Ловит · Catches: заполненность окна по формуле платформы; негодный файл порогов D; незнакомую форму кэша; сессии без отчёта поставщика. · window fill by the platform's formula; an invalid threshold file D; an unknown cache form; sessions with no provider report.
- НЕ ловит · Does NOT catch: effective-порог запроса; модель сессии из старого кэша; дома вне шаблонов (о них молчит). · the effective per-request threshold; session model from an old cache; homes outside the patterns (silent about them).
- Кричит · Reports: никуда — прибор; вывод читает человек или сторож компакта (`--mashinno`). · nowhere — an instrument; a human or the compaction watcher (`--mashinno`) reads the output.
- Коды · Exit: 0 величина есть · value obtained; 1 сессии есть, величин нет · sessions, no value; 2 слепота (или файл настроек не читается) · blindness (or settings file unreadable).

## podyom-mimo-vorot-watch · [moduli/podyom-mimo-vorot-watch](moduli/podyom-mimo-vorot-watch.md)

- Ловит · Catches: старт службы из области ворот без квитанции за сутки; слепоту ворот, прибора, журнала, состояния. · an in-scope service start without a gate receipt within a day; blindness of the gate, probe, journal, state.
- НЕ ловит · Does NOT catch: службы вне области ворот; ручной старт до `multi-user.target` в первые 60 с; обходы старше окна; чья рука. · out-of-scope services; a manual start before `multi-user.target` in the first 60 s; bypasses older than the window; whose hand.
- Кричит · Reports: `PMV_ALERT`; итог — `last.json` и stdout. · `PMV_ALERT`; result — `last.json` and stdout.
- Коды · Exit: 0 чисто · clean; 2 слепота · blindness; 3 новый обход · new bypass. Юнит: `SuccessExitStatus=2 3`.

## predel-dliny-watch · [moduli/predel-dliny-watch](moduli/predel-dliny-watch.md)

- Ловит · Catches: отказ по длине промпта с известными формулировками; два и более в окне — громче. · prompt-length refusals with known wording; two or more in the window — louder.
- НЕ ловит · Does NOT catch: новую формулировку; два отказа в одну секунду; шлюз не на `node`; близость к пределу до отказа; (с 1.0.2 успех отправки владельцу проверяется) · new wording; two refusals in one second; a non-`node` gateway; nearing the limit before a refusal; (since 1.0.2 owner delivery is checked).
- Кричит · Reports: `ALERT` (HTML) и письмо агенту; журнал `predel-dliny-watch`. · `ALERT` (HTML) and a letter to the agent; journal tag `predel-dliny-watch`.
- Коды · Exit: 0 чисто или сообщено · clean or reported; 2 слепота или не настроено (с 1.0.1 — и ящика агента нет в `PREDEL_YASHCHIKI`: владельцу сказано, метка записана, повтора нет) · blindness or not configured (since 1.0.1 also no agent mailbox: owner told, marker written, no repeat); 3 письмо агенту или (с 1.0.2) тревога владельцу не доставлены — маркер не записан, повтор · agent letter or (since 1.0.2) owner alert not delivered — no marker, retry.

## storozh-dvizhkov.sh · [moduli/storozh-dvizhkov](moduli/storozh-dvizhkov.md)

- Ловит · Catches: доживший движок `claude` в cgroup и среди прямых детей выбранного шлюза при загруженном юните платформы; иначе больше одного движка; беда держится не меньше 300 с. Пропажу или неоднозначность шлюза — как слепоту. · surviving `claude` engines from the selected gateway cgroup and direct children with a loaded platform unit; otherwise more than one engine; trouble lasts at least 300 s. A missing or ambiguous gateway is blindness.
- НЕ ловит · Does NOT catch: другие машины/шлюзы; вложенную cgroup, если движок не прямой ребёнок шлюза; в режиме юнита — два законных главных хода и помощников дожившего, рождённых после старта платформы; агента без своего таймера. Несколько шлюзов с одним путём без `SD_SHLYUZ_SLUZHBA` → код 2. · other machines/gateways; a nested cgroup unless its engine is a direct gateway child; in unit mode, two legitimate main turns and a survivor's helpers born after platform start; an agent without its own timer. Several gateways on one path without `SD_SHLYUZ_SLUZHBA` → exit 2.
- Кричит · Reports: `agent-alert` на каждом прогоне, пока перекрытие дольше порога. · `agent-alert` on every run while the overlap exceeds the threshold.
- Коды · Exit: 0 беды нет или ещё меньше 300 с · no trouble or less than 300 s; 1 беда не меньше 300 с, доставка — в выводе · trouble at least 300 s, delivery in output; 2 слепота источника/состояния, не настроено или настройки не прочитаны · source/state blindness, not configured or settings unreadable.

## yadro-predohranitel · [moduli/yadro-predohranitel](moduli/yadro-predohranitel.md)

- Ловит · Catches: новое ядро без модуля туннелей или без сети до контрольного адреса — откат в рабочее ядро. · a new kernel without the tunnel module or network to the probe address — fallback to the working kernel.
- НЕ ловит · Does NOT catch: зависание до userspace без паники; порчу служб при живой сети; загрузку не по схеме `saved_entry`. · a hang before userspace without a panic; broken services with a working network; boots not using `saved_entry`.
- Кричит · Reports: только stdout (журнал юнита). · stdout only (unit journal).
- Коды · Exit: 0 не взведён, не то ядро, зелено или перезагрузка запущена · not armed, other kernel, green or reboot started; 1 красно при `YP_DRY` · red with `YP_DRY`; 2 не настроен, или (с 1.0.1) метка пуста или протухла — снята · not configured, or (since 1.0.1) the marker was empty or stale — removed.

## zadaniya-prervany-watch · [moduli/zadaniya-prervany-watch](moduli/zadaniya-prervany-watch.md)

- Ловит · Catches: задание, пролежавшее больше часа, — раз в сутки; исчезновение — строкой «снято». · a task older than an hour — once a day; its disappearance — a "снято" line.
- НЕ ловит · Does NOT catch: «повтор сделан, файл забыли»; задания вне `profiles/web`; метку, не ставшую заданием. · "retry done, file forgotten"; tasks outside `profiles/web`; a marker that never became a task.
- Кричит · Reports: письмом координатору, не владельцу. · a letter to the coordinator, not the owner.
- Коды · Exit: 0 обход состоялся · pass done; 1 канал отказал · channel failed; 2 слепота или не настроено · blindness or not configured.

## agent-limits · [moduli/agent-limits](moduli/agent-limits.md)

- Ловит · Catches: битый YAML; предел без единицы в имени; токенный предел ниже двух квантов; ключ без читателя; незавершённый переход. · broken YAML; a limit without a unit; a token limit below two quanta; a key with no reader; an unfinished transition.
- НЕ ловит · Does NOT catch: действуют ли пределы на деле; верны ли значения. С 1.0.1 читатель — файл с путём каталога или вызовом `agent-limits` плюс имя ключа; упоминание в комментарии тоже считается. · whether limits are enforced; whether values make sense. Since 1.0.1 a reader is a file with the directory path or an `agent-limits` call plus the key name; a mention in a comment counts too.
- Кричит · Reports: никуда — утилита; отказы в stderr, stdout при отказе пуст. · nowhere — a tool; refusals to stderr, stdout empty on refusal.
- Коды · Exit: 0 показано · shown; 1 беды · problems; 2 файл не разбирается, нет каталога или файл настроек не читается · unparsable, no directory or settings file unreadable; 3 нет параметра или подкоманды · unknown key or subcommand.

## python-padenie-70 · [moduli/python-padenie-70](moduli/python-padenie-70.md)

- Ловит · Catches: непойманное исключение Python-сторожа — на импорте, синтаксисе или в `main` — код 70 вместо 1, юнит failed. · An uncaught exception of a Python watchdog — on import, syntax or in `main` — exit 70 instead of 1, the unit fails.
- НЕ ловит · Does NOT catch: скрипт, который сам перехватывает всё и выходит кодом 1 (это намеренный выход); исключение, проглоченное внутри скрипта (`except …:` и дальше по коду); смерть от сигнала. · A script that catches everything and exits 1 itself; an exception swallowed inside the script; death by signal.
- Кричит · Reports: traceback и строка `python-padenie-70: … код 70` в stderr (журнал юнита); тревогу шлёт соседний сторож упавших служб. · traceback and a `… exit 70` line to stderr; the alert comes from the failed-units watchdog.
- Коды · Exit: как у скрипта · the script's own; 70 скрипт упал · the script crashed; 71 скрипта не дали или его нет (с 1.0.4; было 2) · no script given or missing (since 1.0.4; was 2).

## bash-padenie-70 · [moduli/bash-padenie-70](moduli/bash-padenie-70.md)

- Ловит · Catches: синтаксическую ошибку и `bad substitution` до запуска (`bash -n`, скрипт не начинает работу) и `unbound variable` при `set -u` во время работы — код 70 вместо 2/1, юнит failed; через `BASH_PADENIE_SKRIPT` — и в дочернем скрипте цепочки `exec bash "$OBERTKA"`. · Syntax errors and `bad substitution` before the run, and `set -u` `unbound variable` during it — exit 70 instead of 2/1; also in a child of an `exec bash "$OBERTKA"` chain via `BASH_PADENIE_SKRIPT`.
- НЕ ловит · Does NOT catch: ошибку дочернего скрипта, запущенного без запускателя (у её строки другой путь); упавшую команду без `set -e` (скрипт идёт дальше — другой класс); смерть от сигнала. Ловушка ERR НЕ выбрана намеренно: она не видит ни `unbound variable`, ни синтаксис, но сработала бы на каждой штатно падающей команде. · A child script's error without the launcher; a failed command without `set -e`; death by signal. An ERR trap was rejected on purpose.
- Кричит · Reports: строка bash в stderr после завершения дочернего процесса и `bash-padenie-70: … код 70`; тревогу шлёт сторож упавших служб. · bash's line replayed to stderr after the child exits and `… exit 70`; the failed-units watchdog alerts.
- Коды · Exit: как у скрипта · the script's own; 70 ошибка bash · bash error; 71 скрипта нет / не дали / нет временного файла · no script / missing / no temp file.

## lib/nastrojka

- Ловит · Catches: отсутствие значения без умолчания (код 2); файл настроек, который есть, но не читается (код 2, а не умолчание); ключ, не похожий на имя переменной. · a missing value with no default (exit 2); a settings file that exists but cannot be read (exit 2, not a default); a key that is not a variable name.
- НЕ ловит · Does NOT catch: опечатку в имени ключа внутри файла (сработает умолчание); неверное по смыслу значение; случайную переменную окружения — она всегда главнее файла. · a key-name typo inside the file (the default applies); a value wrong in meaning; a stray environment variable — it always beats the file.
- Кричит · Reports: одна строка `nastrojka: ОТКАЗ · REFUSED: …` в stderr. · one `nastrojka: ОТКАЗ · REFUSED: …` stderr line.
- Коды · Exit: 0 значение напечатано · value printed; 2 отказ · refusal.

## Стенды · Test stands

| Стенд · Stand | Модуль · Module |
|---|---|
| `test/stend-agent-limits.sh` | `agent-limits` |
| `test/stend-agent-watchdog.sh` | `agent-watchdog.sh` |
| `test/stend-apt-notify.sh` | `apt-updates-notify.sh` |
| `test/stend-dkms-kernel-coverage.sh` | `dkms-kernel-coverage-check.sh` |
| `test/stend-dsh-upstream-watch.sh` | `dsh-upstream-watch.sh` |
| `test/stend-dve-kopii.sh` | `dve-kopii-watch` |
| `test/stend-hvostov.sh` | `hvosty-vartmp-watch` |
| `test/stend-inet6-poyavlenie.sh` | `inet6-poyavlenie-watch` |
| `test/stend-doli-preseta.sh` | `kontekst-zamer` |
| `test/stend-podyom-mimo-vorot.sh` | `podyom-mimo-vorot-watch` |
| `test/stend-predel-dliny-watch.sh` | `predel-dliny-watch` |
| `test/stend-storozh-dvizhkov.sh` | `storozh-dvizhkov.sh` |
| `test/stend-yadro-predohranitel.sh` | `yadro-predohranitel` |
| `test/proba-prav-sostoyaniya-zadaniya-prervany.sh` | `zadaniya-prervany-watch` |
| `test/stend-audit.sh` | исправления аудита №20, подставные источники/каналы; нужна непривилегированная учётка, фикстуры `os.umask(0o077)` · audit 20 fixes, fixture sources/channels; non-root required, fixture `os.umask(0o077)` |
| `test/stend-bash-padenie-70.sh` | `bash-padenie-70` |
| `test/stend-dve-kopii-montazh.sh` | `dve-kopii-watch`, контракт монтажа · installation contract |
| `test/stend-klass-padenie.sh` | класс кодов падения при SuccessExitStatus; root и systemd · crash-code class; root and systemd |
| `test/stend-python-padenie-70.sh` | `python-padenie-70` |

Каждый стенд гоняет файл из `bin/` пакета на подставных входах; `agent-alert`, `logger`, `systemctl`, `journalctl` — заглушки первыми в `PATH`. Прежде чем верить зелёному стенду, проверьте его на заведомо испорченном предмете: стенд, который не краснеет на порче, ничего не доказывает.

Each stand runs the file from the package `bin/` on fake inputs; `agent-alert`, `logger`, `systemctl`, `journalctl` are stubs first in `PATH`. Before trusting a green stand, run it against a deliberately broken subject: a stand that does not turn red on a fault proves nothing.
