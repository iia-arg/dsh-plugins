# Неисправности · Troubleshooting

Каждый случай — из реальной эксплуатации: признак → причина → лечение.
Every case comes from real operation: symptom → cause → fix.

### `verify` краснеет после обновления ОС или платформы · `verify` goes red after an OS or platform update
Причина: обновление затёрло доработку вне пакета; служба при этом может оставаться active. Лечение: вернуть предмет из источника записи (`source`), затем `verify` до зелёного. Если изменение намеренное — новая редакция реестра через `pravka`.
Cause: the update overwrote a change that lives outside any package; the service may still be active. Fix: restore the item from the entry's `source`, then `verify` until green. If the change is intended, write a new registry revision via `pravka`.

### `pravka` отказывает: «бой ≠ основе» · `pravka` refuses: "live ≠ base"
Причина: с момента сборки кандидата реестр поменяла другая рука. Лечение: пересобрать кандидат от текущего файла и передать новую сумму в `--osnova`. Не обходить: правка поверх чужой молча затрёт её.
Cause: another hand changed the registry after the candidate was built. Fix: rebuild the candidate from the current file and pass the new sum to `--osnova`. Do not bypass it: editing over someone else's change silently erases it.

### Сторож молчит неделю · The watchdog has been silent for a week
Причина: молчание неотличимо от «всё хорошо» — таймер мог быть выключен. Лечение: `systemctl list-timers` и журнал последнего прогона; держите внешнего наблюдателя, который проверяет, что сторож вообще ходил.
Cause: silence looks exactly like "all is well" — the timer may be disabled. Fix: check `systemctl list-timers` and the last run's journal; keep an external observer that checks the watchdog actually ran.

### Сторож пишет СЛЕПОТА, хотя всё работает · The watchdog reports BLIND although everything works
Причина: команда сверки не запустилась, сменилась форма её вывода или не ушла тревога. Это не «сошлось», а «не измерено». Лечение: прогнать команду из `VERIFY_CMD`/`AGENTS_VERIFY_CMD` руками от той же учётки, что и юнит.
Cause: the verification command did not start, its output format changed, or the alert was not delivered. That is "not measured", not "matched". Fix: run the `VERIFY_CMD`/`AGENTS_VERIFY_CMD` command by hand under the unit's own account.

### Проверка, запущенная от обычной учётки, видит расхождение, а от root — нет · A check sees drift as a normal user but not as root
Причина: часть файлов лежит в закрытых домах и читается только через `sudo`; запасное чтение, которое искажает содержимое (например, обрезает концевой перевод строки), даёт ложное «≠». Лечение: читать сырые байты; сравнивать вывод от обеих рук.
Cause: some files live in closed home directories and are only readable via `sudo`; a fallback read that alters the content (for example strips the trailing newline) produces a false "≠". Fix: read raw bytes; compare the output of both accounts.

### `srez-obshchego-kataloga` показывает «копия, имя пакета …» · `srez-obshchego-kataloga` shows "copy, package name …"
Причина: в области разрешения лежит копия боевого пакета под другим именем каталога; npm начнёт отвечать ELSPROBLEMS. Лечение: убрать копию из области разрешения или переименовать её так, чтобы она не дублировала боевое имя.
Cause: a copy of a live package sits in the resolution area under another directory name; npm will start answering ELSPROBLEMS. Fix: move the copy out of the resolution area or rename it so it no longer duplicates the live name.

### `sverka-zavisimostej` пишет СЛЕПОТА: «ни одного внешнего импорта» · `sverka-zavisimostej` reports BLIND: "no external imports"
Причина: образец поиска импортов не подходит к коду плагина — это ответ про прибор, а не про плагин. Лечение: проверить точку входа (`main`) плагина и форму импортов.
Cause: the import pattern does not fit the plugin's code — this is an answer about the tool, not about the plugin. Fix: check the plugin's entry point (`main`) and its import style.

### `nezafiksirovano-watch` молчит о каталоге с незакоммиченным · `nezafiksirovano-watch` is silent about a tree with uncommitted files
Причина: каталога нет в `NEZAF_UCHYOTY` — новый git-учёт вписывается в перечень руками. Лечение: перепись git-учётов машины (`find … -name .git`) и сверка с перечнем.
Cause: the tree is not in `NEZAF_UCHYOTY` — a new tracked tree must be added to the list by hand. Fix: re-inventory the host's git trees (`find … -name .git`) and compare with the list.

### Команда пишет СЛЕПОТА «не задан» или сторож — «блок пропущен» · A command reports BLIND "not set" or the watchdog says "block skipped"
Причина: у пакета нет умолчаний одной машины — перечни (`NEZAF_UCHYOTY`, `SVERKA_MESTA`, `SVERKA_PLAGINY`, `PRESET_SVERKA_*`, `SHVY_POTREBITELI`) и внешние команды сторожа (`AGENTS_VERIFY_CMD`, `DORABOTKI_CMD`) задаются на каждой машине своими. Лечение: задать переменную там, откуда команду зовут — `Environment=` юнита, файл `REGWD_CONF` сторожа, строка `healthcheck` записи (под `sudo -n` окружение сбрасывается: `sudo -n env ИМЯ=значение команда`). Пропущенный блок — не «сошлось»: в итоге сторожа он назван «НЕ проверялось».
Cause: the package has no single-host defaults — the lists (`NEZAF_UCHYOTY`, `SVERKA_MESTA`, `SVERKA_PLAGINY`, `PRESET_SVERKA_*`, `SHVY_POTREBITELI`) and the watchdog's external commands (`AGENTS_VERIFY_CMD`, `DORABOTKI_CMD`) are set per host. Fix: set the variable where the command is called from — the unit's `Environment=`, the watchdog's `REGWD_CONF` file, the entry's `healthcheck` line (`sudo -n` resets the environment: `sudo -n env NAME=value command`). A skipped block is not "matched": the watchdog summary names it "NOT checked".

### `agent-plugins` выходит кодом 2: «реестр не прочитан» · `agent-plugins` exits 2: "registry not read"
Причина: файла нет, он не разбирается как YAML, пуст, верхний уровень не словарь или у записи нет строкового `id` — причина и номер записи в строке отказа. Лечение: поправить реестр через `pravka` (при сломанном текущем — `--tekushchij-sloman`); для проб путь задаётся `PLUGINS_REGISTRY`.
Cause: the file is missing, not valid YAML, empty, its top level is not a mapping, or an entry has no string `id` — the reason and the entry number are in the refusal line. Fix: correct the registry via `pravka` (with a broken current one — `--tekushchij-sloman`); for tests the path is set by `PLUGINS_REGISTRY`.
