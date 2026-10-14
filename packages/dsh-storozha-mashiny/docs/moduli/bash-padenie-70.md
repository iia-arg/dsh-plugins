# bash-padenie-70

Запускатель bash-сторожа: ошибка самого bash не выглядит успехом. Пара к `python-padenie-70`. · A bash watchdog launcher: an error of bash itself does not look like success. The counterpart of `python-padenie-70`.

## Зачем · Why

У сторожей код 1 значит «нашёл беду», и юнит считает его успехом (`SuccessExitStatus=1`), нередко и 2. Но bash тем же кодом 1 выходит, когда скрипт с `set -u` наткнулся на неопределённую переменную, а кодом 2 — на синтаксической ошибке (например, после неудачной правки). Такой сторож числится успешным и ничего не проверяет. Проверено: скрипт-файл с `set -u` и неопределённой переменной под `SuccessExitStatus=1` — `ExecMainStatus=1`, `Result=success`. (Через `bash -c` тот же случай даёт 127 — поэтому пробовать надо файлом, как его зовёт юнит.)

For watchdogs exit 1 means "found a problem" and is a success for the unit, often 2 as well. But bash also exits 1 on a `set -u` unbound variable and 2 on a syntax error. Verified with a script file under `SuccessExitStatus=1`: `Result=success`.

## Почему не ловушка ERR · Why not an ERR trap

Ловушка ERR не срабатывает ни на `unbound variable`, ни на синтаксическую ошибку — то есть мимо обоих настоящих случаев, — зато сработала бы на каждой штатно падающей команде: у сторожей нет `set -e`, и `grep` без совпадения для них норма. · An ERR trap fires on neither real case but would fire on every normally failing command.

## Как работает · How it works

1. `bash -n` до запуска: синтаксическая ошибка или `bad substitution` — строка bash в stderr и код 70; скрипт не начинает работу.
2. Запуск; stderr пишется во временный файл и передаётся в журнал после завершения дочернего процесса: строка самого bash с путём ЭТОГО скрипта «<путь>: line N: … unbound variable» или «… bad substitution» — код 70. Иначе — код скрипта как есть.

Путь скрипта — первым доводом; без доводов — из переменной `BASH_PADENIE_SKRIPT`. Это нужно для цепочки «обёртка делает `exec bash "$OBERTKA"`»: в `OBERTKA` кладут сам запускатель, в `BASH_PADENIE_SKRIPT` — дочерний скрипт, и его ошибки тоже ловятся.

1. `bash -n` first. 2. Run with stderr captured in a temporary file, replayed after the child exits, and checked for bash's own fatal line with THIS script's path. The script path is the first argument, or `BASH_PADENIE_SKRIPT` when there are none (for an `exec bash "$OBERTKA"` chain).

## Подключение · Use

```ini
# /etc/systemd/system/<юнит>.service.d/60-bash-padenie-70.conf
[Service]
ExecStart=
ExecStart=/usr/local/bin/bash-padenie-70 /путь/к/сторожу
# если сторож делает exec bash "$OBERTKA" в дочерний скрипт:
# Environment=OBERTKA=/usr/local/bin/bash-padenie-70
# Environment=BASH_PADENIE_SKRIPT=/путь/к/дочернему
```
Затем `systemctl daemon-reload`. Откат — удалить файл и снова `daemon-reload`.

## Коды выхода · Exit codes

| Код · Code | Смысл · Meaning |
|---|---|
| как у скрипта · the script's own | обычный выход · normal exit |
| 70 | ошибка самого bash в скрипте · a bash error in the script |
| 71 | скрипта не дали, его нет или нет временного файла · no script, missing, or no temp file |

## Границы · Limits

НЕ ловит: ошибку дочернего скрипта, запущенного без запускателя (её строка несёт другой путь); упавшую команду без `set -e` — скрипт идёт дальше, это другой класс; смерть от сигнала. stdout передаётся сразу; stderr задерживается до конца дочернего процесса, поэтому порядок stdout/stderr в журнале меняется. Ожидания process substitution нет; старый Bash 5.0 отдельно не проверялся.

Does NOT catch: a child script's error without the launcher; a failed command without `set -e`; death by signal. stdout streams immediately; stderr is delayed until the child exits, changing their order in the journal. No process substitution is awaited; Bash 5.0 was not tested separately.

## Стенд · Test stand

`test/stend-bash-padenie-70.sh` — 15 проб на подставных скриптах во временном каталоге, systemd не зовётся. · 15 probes on fake scripts; systemd is not called.
