#!/bin/bash
# RU: Стенд доводов сторожа выпуска (с 0.1.0-alpha.5). Зовущий — обходчик стендов (vse-stendy-boevye, строка перечня).
# EN: Argument test bench for the release watcher (since 0.1.0-alpha.5). Caller — the bench runner (vse-stendy-boevye, list entry).
# RU: Предмет: vypusk-okno-watch.sh не имеет доводов; любой довод → ОТКАЗ код 3 ДО чтения дерева и боя,
#     без канала тревог и без отметки состояния. Без доводов — прежний путь.
# EN: Subject: vypusk-okno-watch.sh takes no arguments; any argument → REFUSAL exit 3 BEFORE reading the tree or installed copies,
#     without the alert channel and without a state mark. No arguments — the usual path.
# RU: Среда изолирована: дерево — несуществующий путь (прежний путь кончается «слепотой», код 2), канал тревог —
#     подставной, считающий вызовы; состояние — во временном каталоге. Бой и живое состояние не трогаются.
# EN: The environment is isolated: the tree is a nonexistent path (the usual path ends in "blindness", exit 2), the alert
#     channel is a fake that counts calls; state lives in a temp directory. Installed copies and live state are untouched.
# RU: VYPUSK_TEST_WATCH — подмена предмета (порча/основа). Код: 0 — все пробы, 1 — есть красная, 2 — стенд слеп.
# EN: VYPUSK_TEST_WATCH — substitute subject (corrupted/base). Exit: 0 — all probes pass, 1 — a red probe, 2 — bench is blind.
# RU: ЧЕГО НЕ ПРОВЕРЯЕТ: сверку дерева с боем (до неё прогон не доходит), неверное значение или опечатку в имени
#     переменной окружения, запуск под root.
# EN: WHAT IT DOES NOT CHECK: tree-vs-installed comparison (runs never get that far), a wrong value or a misspelled name
#     of an environment variable, running as root.
set -u
W=${VYPUSK_TEST_WATCH:-$(dirname "$0")/../src/vypusk-okno-watch.sh}
[ -r "$W" ] || { echo "СЛЕПОТА: предмет не читается: $W"; exit 2; }
T=$(mktemp -d /tmp/stend-dovodov.XXXXXX) || { echo "СЛЕПОТА: нет временного места"; exit 2; }
trap 'rm -rf "$T"' EXIT
# RU: Подставной канал тревоги: каждый вызов дописывает строку в $T/vyzovy.
# EN: Fake alert channel: each call appends a line to $T/vyzovy.
printf '#!/bin/bash\necho x >> "%s/vyzovy"\n' "$T" > "$T/alert"; chmod +x "$T/alert"
# RU: zapusk — один прогон сторожа в пустом окружении (env -i) с подставными деревом, каналом и состоянием;
#     $@ — доводы сторожу; печатает код выхода; вывод (stdout+stderr) — в $T/out.
# EN: zapusk — one watcher run in an empty environment (env -i) with fake tree, channel and state;
#     $@ — arguments for the watcher; prints the exit code; output (stdout+stderr) goes to $T/out.
zapusk() {  # $@ — доводы сторожу; печатает код; вывод — в $T/out
  rm -f "$T/vyzovy" "$T/sost"*
  env -i PATH="$PATH" HOME="$T" VYPUSK_REPO="$T/net-dereva" VYPUSK_ALERT="$T/alert" \
    VYPUSK_SOSTOYANIE="$T/sost" VYPUSK_TIHO=0 bash "$W" "$@" > "$T/out" 2>&1
  echo $?
}
# RU: vyzovov — число вызовов подставного канала за последний прогон (0, если файла нет).
# EN: vyzovov — number of fake channel calls in the last run (0 if the file is absent).
vyzovov() { [ -f "$T/vyzovy" ] && wc -l < "$T/vyzovy" || echo 0; }
vsego=0; proshlo=0
# RU: proba — $1 имя, $2 условие (выражение bash); на провале печатает код, число вызовов канала и начало вывода.
# EN: proba — $1 name, $2 condition (a bash expression); on failure prints exit code, channel call count and output head.
proba() {  # $1 имя, $2 условие (выражение bash)
  vsego=$((vsego+1))
  if eval "$2"; then proshlo=$((proshlo+1)); echo "  ✅ $1"; else echo "  ❌ $1 — код $k, вызовов канала $(vyzovov), вывод: $(head -c 160 "$T/out" | tr '\n' ' ')"; fi
}
# RU: Контроль зрячести: подставной канал ДОЛЖЕН засчитать вызов на прежнем пути — иначе «0 вызовов» ниже ничего не значит.
# EN: Sightedness control: the fake channel MUST register a call on the usual path — otherwise "0 calls" below means nothing.
k=$(zapusk)
proba "без доводов — прежний путь: слепота (код 2), канал позван 1 раз" '[ "$k" = 2 ] && [ "$(vyzovov)" = 1 ] && grep -q "СЛЕПОТА" "$T/out"'
# RU: Довод --bez-trevogi → код 3, канал не позван, файл состояния не создан, вывод начинается с «ОТКАЗ».
#     Ловит довод, молча принятый за режим или исполненный после начала работы.
# EN: Argument --bez-trevogi → exit 3, channel not called, no state file created, output starts with "ОТКАЗ".
#     Catches an argument silently taken as a mode or acted on after work has started.
k=$(zapusk --bez-trevogi)
proba "--bez-trevogi → ОТКАЗ код 3, канал 0, состояние не создано" '[ "$k" = 3 ] && [ "$(vyzovov)" = 0 ] && ! ls "$T"/sost* >/dev/null 2>&1 && grep -q "^ОТКАЗ" "$T/out"'
# RU: Привычный по другим инструментам --dry-run → тоже отказ (код 3, канал 0), а не боевой прогон.
# EN: --dry-run, habitual from other tools → also a refusal (exit 3, channel 0), not a live run.
k=$(zapusk --dry-run)
proba "--dry-run (чужая привычка) → ОТКАЗ код 3" '[ "$k" = 3 ] && [ "$(vyzovov)" = 0 ]'
# RU: Позиционный довод (имя пакета) → отказ (код 3, канал 0): сторож не сужает область по доводу.
# EN: A positional argument (package name) → refusal (exit 3, channel 0): the watcher does not narrow its scope by argument.
k=$(zapusk kakoj-to-paket)
proba "позиционный довод → ОТКАЗ код 3" '[ "$k" = 3 ] && [ "$(vyzovov)" = 0 ]'
# RU: Текст отказа называет правильный способ — переменную VYPUSK_TIHO=1. Ловит отказ без подсказки пути.
# EN: The refusal text names the correct way — the VYPUSK_TIHO=1 variable. Catches a refusal that gives no way forward.
k=$(zapusk --bez-trevogi)
proba "отказ называет правильный путь (VYPUSK_TIHO=1)" 'grep -qF "VYPUSK_TIHO=1" "$T/out"'
# RU: Отказ перечисляет и настройки корней копий агентов — иначе читатель отказа не узнает о VYPUSK_AGENT_POISK.
# EN: The refusal also lists the agent copy root settings — otherwise its reader never learns about VYPUSK_AGENT_POISK.
proba "отказ перечисляет VYPUSK_AGENT_KORNI и VYPUSK_AGENT_POISK" 'grep -qF "VYPUSK_AGENT_KORNI" "$T/out" && grep -qF "VYPUSK_AGENT_POISK" "$T/out"'
echo "итог: $proshlo из $vsego"
[ "$proshlo" = "$vsego" ] && exit 0 || exit 1
