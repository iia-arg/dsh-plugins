# Частые поломки · Troubleshooting

Каждый случай — признак → причина → лечение. Случаи сняты с кода приборов и с прогонов стендов, догадок о причинах здесь нет.

Each case is symptom → cause → fix. The cases come from the tools' code and stand runs; there are no guessed causes here.

## 1. «СЛЕПОТА … ключ X в /etc/dsh-pribory/dsh-pribory.conf», код 2

**Признак.** Прибор сразу отвечает строкой со словом «СЛЕПОТА» или «ОТКАЗ», называет ключ и путь файла, код `2`, ничего не делает.
**Причина.** Значения нет ни в доводе, ни в переменной, ни в файле настройки, а нейтрального умолчания у этого ключа нет.
**Лечение.** Завести ключ в файле (`КЛЮЧ=значение`, перечень — [SETTINGS.md](SETTINGS.md)) или указать другой файл переменной `DSH_PRIBORY_CONF`.

**Symptom.** The tool answers at once with "СЛЕПОТА" or "ОТКАЗ", names the key and the file path, code `2`, does nothing.
**Cause.** The value is in neither the argument, the variable nor the settings file, and the key has no neutral default.
**Fix.** Add the key to the file (`KEY=value`, list in [SETTINGS.md](SETTINGS.md)) or point `DSH_PRIBORY_CONF` at another file.

## 2. Значение с пояснением в конце строки · A value with a trailing note

**Признак.** Модуль отказывает кодом `2`: «ОТКАЗ: значение ключа UBRAT_KUDA … содержит « #»», хотя в файле стоит `UBRAT_KUDA=/srv/x # куда уходить`.
**Причина.** Комментарием считается только строка, которая начинается с `#`. Пояснение после значения прежде молча входило в значение; теперь все три разборщика (bash, Python, Node) отказывают громко и называют ключ (с 1.0.3), проверено пробой.
**Лечение.** Пояснение — отдельной строкой над ключом.

**Symptom.** A module refuses with code `2`: "ОТКАЗ: значение ключа UBRAT_KUDA … содержит « #»", while the file has `UBRAT_KUDA=/srv/x # where to go`.
**Cause.** Only a line starting with `#` is a comment. A note after the value used to slip silently into the value; now all three parsers (bash, Python, Node) refuse loudly and name the key (since 1.0.3), verified by a probe.
**Fix.** Put the note on its own line above the key.

## 3. Файл поправлен, а прибор берёт другое · File edited, tool uses something else

**Признак.** Ключ в файле изменён, а прибор работает со старым значением.
**Причина.** Переменная окружения стоит выше файла: `DVOJNIKI_DEREVYA`, `ZHURNAL_VOROT`, `IDIOMY`, `OBLAST`, `MANIFEST_FAJL`, `ISKL`, `PROBA_BEZOPASNYJ`, `SKILL_LINKS_SOURCES`, `PS_KATALOG`, `FILTR_PUT`, `DSH_HOME`. У модулей на Node (`sekrety-po-znacheniyu`) даже ПУСТАЯ переменная `PS_KATALOG` или `FILTR_PUT` остаётся значением и до файла не доходит; у модулей на bash пустая переменная проваливается в файл.
**Лечение.** `env | grep` по имени ключа; снять переменную (`unset`), если она не нужна.

**Symptom.** The key was changed in the file, but the tool works with the old value.
**Cause.** The environment variable ranks above the file. For Node modules (`sekrety-po-znacheniyu`) even an EMPTY `PS_KATALOG` or `FILTR_PUT` stays the value and the file is never read; for bash modules an empty variable falls through to the file.
**Fix.** `env | grep` for the key name; `unset` the variable if it is not needed.

## 4. Третья проба `stend-kontrakt-kodov.sh` красная · Third probe of the code-contract stand is red

**Признак.** Пробы 1 и 2 зелёные, третья: «все подъёмы в журнале ворот → обходов нет — код 1, строки «сверено с журналом ворот» нет».
**Причина.** Стенд строит «чистый» журнал ворот из боевого журнала службы через `sudo -n journalctl`. Где `sudo` не работает, журнал выходит пустым, и прибор честно находит обход. Так бывает в песочнице с флагом no_new_privs (`bwrap` и подобные): `sudo` отвечает «The "no new privileges" flag is set», а сам прибор журнал читает и без `sudo`.
**Лечение.** Проверить `grep NoNewPrivs /proc/self/status` — нужно `0`; гнать стенд вне песочницы. На том же модуле вне песочницы стенд даёт «итог: 6 из 6».

**Symptom.** Probes 1 and 2 are green, the third: "all starts in the gate log → no bypass — code 1, no line «сверено с журналом ворот»".
**Cause.** The stand builds the "clean" gate log from the service's real journal via `sudo -n journalctl`. Where `sudo` does not work, the log comes out empty and the tool honestly finds a bypass. This happens in a sandbox with the no_new_privs flag (`bwrap` and the like): `sudo` says "The "no new privileges" flag is set", while the tool itself reads the journal without `sudo`.
**Fix.** Check `grep NoNewPrivs /proc/self/status` — it must be `0`; run the stand outside the sandbox. On the same module outside the sandbox the stand gives "итог: 6 из 6".

## 5. «СЛЕПОТА стенда: не задана STEND_SLUZHBA»

**Признак.** `stend-kontrakt-kodov.sh` сразу выходит с кодом `2`.
**Причина.** Стенду нужна настоящая служба с подъёмами в журнале; подставной службы у него нет.
**Лечение.** `STEND_SLUZHBA=<служба>.service bash test/stend-kontrakt-kodov.sh` — служба, у которой есть подъём со строкой `Started` в журнале (окно — от последнего подъёма). Нет подъёма или строки `Started` (oneshot-службы пишут `Finished`) — «СЛЕПОТА стенда: …» с причиной: взять другую службу.

**Symptom.** `stend-kontrakt-kodov.sh` exits at once with code `2`.
**Cause.** The stand needs a real service with starts in its journal; it has no stand-in service.
**Fix.** `STEND_SLUZHBA=<service>.service bash test/stend-kontrakt-kodov.sh` — a service with a start that has a `Started` line in the journal (the window begins at the last start). No start or no `Started` line (oneshot services log `Finished`) — "СЛЕПОТА стенда: …" with a cause: pick another service.

## 6. `kto-podnimal`: «СЛЕПОТА: журнал НЕ ЧИТАЕТСЯ вашей рукой»

**Признак.** Код `2` до всякого поиска подъёмов.
**Причина.** Учётка не входит в группы, которым `journalctl` отдаёт системный журнал (`adm`, `systemd-journal`): без них он отдаёт ноль записей. Прибор проверяет доступ отдельно, чтобы ноль про права не читался как «подъёмов не было».
**Лечение.** Звать прибор от учётки с доступом к журналу.

**Symptom.** Code `2` before any search for starts.
**Cause.** The account is not in the groups `journalctl` serves the system journal to (`adm`, `systemd-journal`): without them it returns zero records. The tool checks access separately so that a zero about rights is not read as "no starts".
**Fix.** Run the tool as an account with journal access.

## 7. `kto-podnimal` называет юнит, а не лицо · Names a unit, not a person

**Признак.** В разряде «кто» — имя юнита или «служба», руки нет.
**Причина.** Подъём сделан без `sudo` — изнутри службы, таймером, зависимостью. Следа `sudo` нет, и лицо прибору взять неоткуда.
**Лечение.** Для своих юнитов задать текст «откуда» ключом `KTO_OTKUDA` (`юнит[|юнит]=текст;…`).

**Symptom.** The "who" field holds a unit name or "service", no hand.
**Cause.** The start was made without `sudo` — from inside a service, by a timer, by a dependency. There is no `sudo` trace and nowhere to take a person from.
**Fix.** For own units set the "from where" text with `KTO_OTKUDA`.

## 8. После `npm install` команды не находятся · Commands not found after `npm install`

**Признак.** `dvojniki: command not found` после установки пакета.
**Причина.** Поля `bin` в `package.json` нет нарочно: на машине, где те же приборы уже лежат в `PATH`, установка не должна молча добавлять тёзок.
**Лечение.** Положить нужные приборы в `PATH` рукой развёртывания; после — `dvojniki` проверит, что тёзки совпадают.

**Symptom.** `dvojniki: command not found` after installing the package.
**Cause.** `package.json` has no `bin` field on purpose: on a machine where the same tools are already on `PATH`, installing must not silently add namesakes.
**Fix.** The deployment hand places the needed tools on `PATH`; then `dvojniki` checks that namesakes match.

## 9. `ubrat` отказывает · `ubrat` refuses

**Признак.** Код `2`, каталог не удалён.
**Причина.** Каталог вне разрешённых корней `UBRAT_KORNI`, либо ключ не задан.
**Лечение.** Убедиться, что удалять надо именно это; если да — добавить корень в `UBRAT_KORNI`. Если вызывающая оболочка стояла внутри удалённого каталога, прибор только советует `cd` (ключ `UBRAT_KUDA`): увести чужую оболочку он не может.

**Symptom.** Code `2`, the directory is not removed.
**Cause.** The directory is outside the allowed roots `UBRAT_KORNI`, or the key is unset.
**Fix.** Make sure this is what must be removed; if so, add the root to `UBRAT_KORNI`. If the calling shell stood inside the removed directory, the tool only advises `cd` (key `UBRAT_KUDA`): it cannot move someone else's shell.

## 10. `pogasit` отвечает кодом 3 · `pogasit` answers code 3

**Признак.** Порт назван, процесс не погашен, код `3`.
**Причина.** На порту несколько процессов — прибор не выбирает за руку. Гашения по маске командной строки у него нет нарочно: маска находит и чужие процессы.
**Лечение.** Гасить по юниту (`--unit ИМЯ`) или уточнить, какой процесс держит порт.

**Symptom.** A port is named, nothing is stopped, code `3`.
**Cause.** Several processes hold the port — the tool does not choose for the hand. It deliberately has no stopping by command-line pattern: a pattern also finds other people's processes.
**Fix.** Stop by unit (`--unit NAME`) or find out which process holds the port.
