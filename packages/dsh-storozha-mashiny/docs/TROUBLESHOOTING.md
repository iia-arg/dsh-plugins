# Частые поломки · Troubleshooting

Каждая строка — признак → причина → лечение. Всё здесь случалось на настоящих машинах; имена и пути заменены на нейтральные.

Each entry is symptom → cause → fix. All of it happened on real machines; names and paths are replaced with neutral ones.

## Общее · General

**Сторож молчит, а беда есть.** Причина чаще всего — сторож не запускался или ослеп, а не «всё чисто»: таймер не включён, юнит падает до замера, или код 2 никто не читает. Лечение: `systemctl list-timers '<модуль>*'` (время последнего запуска), `journalctl -u <модуль>.service -n 50` (последний вывод и код), затем проба «исправное → порча → исправное» из раздела модуля.

**The watchdog is silent although there is trouble.** Most often the watchdog did not run or went blind rather than "all clean": the timer is not enabled, the unit fails before measuring, or nobody reads exit 2. Fix: `systemctl list-timers '<module>*'` (last run time), `journalctl -u <module>.service -n 50` (last output and exit code), then the "healthy → fault → healthy" probe from the module section.

**Одна и та же тревога приходит каждый прогон.** Причина: каталог состояния не пишется учёткой юнита (сторож не может запомнить, что уже сказал). Лечение: проверить путь из настройки `*_STATE*`/`*_SOST*` и права (`sudo -u <учётка> touch <каталог>/proba`); у `predel-dliny-watch` — код доставки владельцу и письма агенту. Если ящика нет в `PREDEL_YASHCHIKI`, успешная доставка владельцу даёт код 2 и маркер, без повторов.

**The same alert arrives on every run.** Cause: the state directory is not writable by the unit's account (the watchdog cannot remember what it already said). Fix: check the path from the `*_STATE*`/`*_SOST*` setting and permissions (`sudo -u <account> touch <dir>/probe`); for `predel-dliny-watch`, also check owner and agent-letter delivery. If the mailbox is absent from `PREDEL_YASHCHIKI`, successful owner delivery gives exit 2 and a marker, without repeats.

**В журнале «НЕ НАСТРОЕНО», код 2.** Причина: обязательная настройка не задана — модуль честно отказывается работать вслепую. Лечение: задать её drop-in'ом юнита (модули с юнитом) или строкой в `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` (модули без юнита); проверить `systemctl cat <юнит>`.

**"НЕ НАСТРОЕНО" in the journal, exit 2.** Cause: a required setting is missing — the module honestly refuses to work blind. Fix: set it in a unit drop-in (modules with a unit) or as a line in `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf` (modules without a unit); check `systemctl cat <unit>`.

**Тревога не доходит, хотя сторож говорит «отправлено».** Причина: учётка юнита не имеет доступа к токену канала (например, `User=nobody`), или в `PATH` юнита нет `agent-alert`. Лечение: от той же учётки и с тем же `PATH` выполнить `agent-alert "проба"`; задать `User=`/`Group=` drop-in'ом.

**The alert does not arrive although the watchdog says "sent".** Cause: the unit's account has no access to the channel token (e.g. `User=nobody`), or `agent-alert` is not in the unit's `PATH`. Fix: run `agent-alert "probe"` as the same account with the same `PATH`; set `User=`/`Group=` in a drop-in.

**После проверки стенда владельцу пришла ложная тревога.** Причина: стенд запущен без заглушек — проба позвала настоящий `logger` с боевым тегом или настоящий канал. Лечение: заглушки `agent-alert`, `logger`, `systemctl`, `journalctl` первыми в `PATH`; модули с зашитым абсолютным путём к каналу не запускать вне частного пространства монтирования.

**A false alarm reached the owner after a stand run.** Cause: the stand ran without stubs — the probe called the real `logger` with the production tag or the real channel. Fix: `agent-alert`, `logger`, `systemctl`, `journalctl` stubs first in `PATH`; do not run modules with a hard-coded absolute channel path outside a private mount namespace.

## Настройки модулей без юнита · Settings of modules without a unit

**Под `sudo` или из другой службы модуль видит не то, что у вас в оболочке.** Причина: `sudo` сбрасывает окружение, чужая служба его не наследует — ваша переменная туда не доехала. Лечение: значение — строкой в `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf`; проверка: `sudo /usr/local/lib/dsh-storozha-mashiny/lib/nastrojka <КЛЮЧ>` печатает то же, что без `sudo`.

**Under `sudo` or from another service the module sees something other than your shell.** Cause: `sudo` resets the environment and another service does not inherit it — your variable did not arrive. Fix: put the value as a line in `/etc/dsh-storozha-mashiny/dsh-storozha-mashiny.conf`; check: `sudo /usr/local/lib/dsh-storozha-mashiny/lib/nastrojka <KEY>` prints the same as without `sudo`.

**`nastrojka: ОТКАЗ · REFUSED: файл настроек … есть, но не читается`.** Причина: у файла права `0600` или чужой владелец, а модуль зовёт не root. Лечение: `chmod 644` — секретов в файле быть не должно.

**`nastrojka: ОТКАЗ · REFUSED: файл настроек … есть, но не читается` (settings file exists but is not readable).** Cause: the file is `0600` or owned by someone else, and the module is not run by root. Fix: `chmod 644` — the file must hold no secrets.

**`ОТКАЗ · REFUSED: нет lib/nastrojka пакета`.** Причина: исполняемый файл скопирован отдельно от пакета, и ни рядом, ни по запасному пути `/usr/local/lib/dsh-storozha-mashiny/lib/nastrojka` функции нет. Лечение: ставить пакет целиком и класть в `PATH` символическую ссылку, а не копию.

**`ОТКАЗ · REFUSED: нет lib/nastrojka пакета` (package lib/nastrojka not found).** Cause: the executable was copied apart from the package, and the function is neither next to it nor at the fallback path `/usr/local/lib/dsh-storozha-mashiny/lib/nastrojka`. Fix: install the whole package and put a symlink, not a copy, into `PATH`.

**Значение в файле есть, а модуль берёт умолчание.** Причина: опечатка в имени ключа, строка закомментирована, пустое значение `КЛЮЧ=` или в окружении задана та же переменная (она главнее). Лечение: `env -u <КЛЮЧ> lib/nastrojka <КЛЮЧ>` — что напечатает, то и увидит модуль.

**The value is in the file but the module takes the default.** Cause: a key-name typo, a commented-out line, an empty `KEY=` value, or the same variable set in the environment (it wins). Fix: `env -u <KEY> lib/nastrojka <KEY>` — what it prints is what the module sees.

## По модулям · Per module

**`storozh-dvizhkov.sh`: слепота при нескольких шлюзах с одним скриптом.** Причина: без `SD_SHLYUZ_SLUZHBA` выбрать шлюз нельзя, код 2. Лечение: задать юнит нужного шлюза в `SD_SHLYUZ_SLUZHBA`; его `MainPID` должен совпасть с найденным `node` и путём `SD_SHLYUZ`.

**`storozh-dvizhkov.sh`: blindness with several gateways sharing a script.** Cause: without `SD_SHLYUZ_SLUZHBA` the gateway cannot be selected, exit 2. Fix: set the intended gateway unit in `SD_SHLYUZ_SLUZHBA`; its `MainPID` must match a discovered `node` and `SD_SHLYUZ` path.

**`dkms-kernel-coverage-check.sh`: код 2 и «СЛЕПОТА».** Причина: `dpkg-query` не назвал установленных ядер или `dkms status` не знает `DKMS_COVERAGE_MODULE`. Лечение: проверить установленные ядра, наличие DKMS-модуля и точное имя настройки; пустой ответ не означает покрытие.

**`dkms-kernel-coverage-check.sh`: exit 2 and "СЛЕПОТА".** Cause: `dpkg-query` found no installed kernels, or `dkms status` does not know `DKMS_COVERAGE_MODULE`. Fix: check installed kernels, the DKMS module, and the exact setting name; an empty response does not mean coverage.

**`yadro-predohranitel`: «не моё» на каждой загрузке.** Причина: в метке взвода пустое или чужое ядро. Лечение: снять метку руками (`/var/lib/yadro-predohranitel/armed`) и взвести заново под нужное ядро.

**`yadro-predohranitel`: "not mine" on every boot.** Cause: the arming marker holds an empty or foreign kernel. Fix: remove the marker by hand (`/var/lib/yadro-predohranitel/armed`) and re-arm for the right kernel.

**`yadro-predohranitel`: откат в исправном ядре.** Причина: `YP_TARGET_IP` недостижим и в рабочем ядре. Лечение: выбирать адрес, который отвечает сразу после подъёма туннеля, и проверять его ДО взвода; первый раз — с `YP_DRY=1`.

**`yadro-predohranitel`: fallback in a healthy kernel.** Cause: `YP_TARGET_IP` is unreachable even in the working kernel. Fix: pick an address that answers right after the tunnel comes up and check it BEFORE arming; the first time — with `YP_DRY=1`.

**`inet6-poyavlenie-watch`: IPv6 появился, код 1, тревоги нет.** Причина: канал отказал или не найден. Состояние `est-inet6` не меняется. Лечение: восстановить канал под учёткой юнита; следующий прогон повторит доставку.

**`inet6-poyavlenie-watch`: IPv6 appeared, exit 1, no alert.** Cause: the channel failed or is missing. The `est-inet6` state stays unchanged. Fix: restore the channel for the unit account; the next run retries delivery.

**`agent-watchdog.sh`: код 3, тревоги нет.** Причина: помощник `WATCHDOG_ALERT` не найден или доставка отказала. Лечение: проверить путь и права помощника под учёткой юнита, затем строки «НЕ отправлена»/«НЕ доставлена» в `journalctl -u agent-watchdog.service`; следующий прогон повторит попытку без отметки окна тишины.

**`agent-watchdog.sh`: exit 3, no alert.** Cause: the `WATCHDOG_ALERT` helper is missing or delivery failed. Fix: check its path and permissions as the unit account, then the "НЕ отправлена"/"НЕ доставлена" lines in `journalctl -u agent-watchdog.service`; the next run retries without a quiet-window stamp.

**`predel-dliny-watch`: «чисто» при 0 строк журнала.** Причина: `UNIT` указывает не на тот юнит, или шлюз запущен не бинарём `node`. Лечение: смотреть знаменатель в выводе (строк в окне); 0 строк при живом агенте — неверный `UNIT`.

**`predel-dliny-watch`: "clean" with 0 journal lines.** Cause: `UNIT` points at the wrong unit, or the gateway is not run by a `node` binary. Fix: look at the denominator in the output (lines in the window); 0 lines with a live agent means a wrong `UNIT`.

**`dve-kopii-watch`: красное по установке, которую никто не запускает.** Причина: `DKW_APPS` собран по шаблону каталогов, а не по `ExecStart` служб. Лечение: брать пути из `systemctl cat <служба>`.

**`dve-kopii-watch`: red on an installation nobody runs.** Cause: `DKW_APPS` was built from a directory pattern instead of the services' `ExecStart`. Fix: take the paths from `systemctl cat <service>`.

**`hvosty-vartmp-watch`: живой каталог назван хвостом.** Причина: его только читают, и mtime не меняется дольше 72 ч. Лечение: строка в перечне долгожителей `HVT_PERECHEN`.

**`hvosty-vartmp-watch`: a live directory is called a leftover.** Cause: it is only read, and its mtime has not changed for over 72 h. Fix: a line in the long-lived list `HVT_PERECHEN`.

**`dsh-upstream-watch.sh`: новая альфа не объявлена, код 2.** Причина: объект релиза точного тега `v<версия>` или `<версия>` не добыт или негоден. Версия не записана. Лечение: восстановить источник описаний; следующий прогон повторит проверку.

**`dsh-upstream-watch.sh`: new alpha not announced, exit 2.** Cause: the exact `v<version>` or `<version>` release object was not obtained or is invalid. The version is not recorded. Fix: restore the release-notes source; the next run retries.

**`kontekst-zamer`: в выводе нет части агентов.** Причина: их дома вне `KONTEKST_ZAMER_SHABLONY`, или прибор зовётся не от root и не видит закрытые каталоги. Лечение: дописать шаблон в файл настроек пакета; звать от той учётки, которой каталоги открыты.

**`kontekst-zamer`: some agents are missing from the output.** Cause: their homes are outside `KONTEKST_ZAMER_SHABLONY`, or the instrument is not run as root and cannot see closed directories. Fix: add the pattern to the package settings file; run it as an account that can read those directories.

**`agent-limits`: «ключ не читает НИКТО», хотя потребитель есть.** Проверьте `proverka.korniPotrebitelej`: файл-потребитель должен читаться и содержать имя ключа вместе с фактическим путём каталога `AGENT_LIMITS_DIR` либо словом `agent-limits`. Проверка текстовая, исполнения потребителя не доказывает.

**`agent-limits`: "key read by NOBODY" although a consumer exists.** Check `proverka.korniPotrebitelej`: the consumer file must be readable and contain the key name together with the actual `AGENT_LIMITS_DIR` directory path or the word `agent-limits`. This is a text check and does not prove consumer execution.

**`zadaniya-prervany-watch`: наряд на повтор приходит, хотя повтор сделан.** Причина: файл задания не удалён после ручного повтора. Лечение: удалить файл `zadanie-prervan-*`.

**`zadaniya-prervany-watch`: retry orders keep coming although the retry was done.** Cause: the task file was not deleted after the manual retry. Fix: delete the `zadanie-prervan-*` file.
