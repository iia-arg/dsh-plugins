# python-padenie-70

Запускатель Python-сторожа: падение не выглядит успехом. · A Python watchdog launcher: a crash does not look like success.

## Зачем · Why

У многих сторожей код 1 значит «нашёл беду, тревога ушла», и юнит считает его успехом (`SuccessExitStatus=1`) — иначе общий сторож упавших служб дублировал бы каждую тревогу. Но тем же кодом 1 Python выходит, когда скрипт падает с непойманным исключением, в том числе до `main()`: модуль не импортировался, синтаксическая ошибка после правки, отказ при чтении настроек. Такой сторож числится успешным и ничего не проверяет. Проверено: юнит с `SuccessExitStatus=1` и `python3 -c "import <нет такого>"` — `Result=success`.

For many watchdogs exit 1 means "found a problem, alert sent", and the unit counts it as success (`SuccessExitStatus=1`). But Python also exits 1 when the script dies of an uncaught exception, including before `main()`. Such a watchdog is listed as successful and checks nothing.

## Как работает · How it works

Скрипт исполняется как `__main__` через `runpy.run_path`; `sys.argv` и `sys.path[0]` (каталог скрипта) — как при обычном запуске, поэтому соседние модули импортируются. Намеренный выход (`sys.exit(N)`, `SystemExit`) проходит как есть. Любое другое исключение — traceback в stderr, строка `python-padenie-70: … код 70` и код 70: он не входит ни в один `SuccessExitStatus`, юнит падает, беду видит сторож упавших служб.

The script runs as `__main__` via `runpy.run_path`; `sys.argv` and `sys.path[0]` are as in a normal run. A deliberate exit passes as is. Any other exception — traceback, a `… exit 70` line and exit 70.

## Подключение · Use

```ini
# /etc/systemd/system/<юнит>.service.d/60-python-padenie-70.conf
[Service]
ExecStart=
ExecStart=/usr/local/bin/python-padenie-70 /путь/к/сторожу
```
Затем `systemctl daemon-reload`. Откат — удалить файл и снова `daemon-reload`. · Then `daemon-reload`; to roll back, delete the file and reload.

## Коды выхода · Exit codes

| Код · Code | Смысл · Meaning |
|---|---|
| как у скрипта · the script's own | намеренный выход · deliberate exit |
| 70 | скрипт упал с исключением · the script crashed |
| 71 | скрипта не дали или его нет (с 1.0.4; было 2 — у части юнитов это успех) · no script given or missing (since 1.0.4; was 2, a success for some units) |

## Границы · Limits

НЕ ловит: скрипт, который сам перехватывает всё и выходит кодом 1 — запускатель видит намеренный выход; исключение, проглоченное внутри скрипта (`except …:` и дальше по коду); смерть процесса от сигнала. Интерпретатор — `/usr/bin/python3`: скрипту с другим интерпретатором в первой строке (venv) запускатель его подменит.

Does NOT catch: a script that catches everything and exits 1 itself; an exception swallowed inside the script; death by signal. The interpreter is `/usr/bin/python3`: for a script whose first line names another interpreter (a venv) the launcher replaces it.

## Стенд · Test stand

`test/stend-python-padenie-70.sh` — 11 проб на подставных скриптах во временном каталоге, systemd не зовётся. · 11 probes on fake scripts in a temp dir; systemd is not called.
