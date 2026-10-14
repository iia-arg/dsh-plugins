#!/usr/bin/env bash
# RU: Сторож движков: доживший ход при загруженном юните платформы; иначе прежнее правило «больше одного».
# EN: Engine watchdog: surviving turns with a loaded platform unit; otherwise the legacy more-than-one rule.
#
# RU: 🔴 ЗАЧЕМ. Однажды прошлый ход агента прожил после смерти своей платформы не меньше пятнадцати минут и за
# RU: это время ОПУБЛИКОВАЛ пакет в npm. Публикация необратима. Замер причины: движки (процессы `claude`) живут в
# RU: cgroup ШЛЮЗА, а не платформы, поэтому перезапуск службы платформы их не трогает ПО ПОСТРОЕНИЮ — они доживают
# RU: свой ход сами.
# EN: 🔴 WHY. Once a previous agent turn outlived its platform's death by at least fifteen minutes and in that
# EN: time PUBLISHED a package to npm. Publishing is irreversible. Root cause measured: engines (`claude`
# EN: processes) live in the GATEWAY's cgroup, not the platform's, so restarting the platform service does not
# EN: touch them BY DESIGN — they finish their turn on their own.
#
# RU: 🔴 ПОЧЕМУ ПОРОГ ПЯТЬ МИНУТ, А НЕ МГНОВЕННО. Два хода на несколько секунд перекрываются честно: старый
# RU: доигрывает шаг, новый уже поднят. Мгновенный порог дал бы ложные тревоги, а ложные через неделю глушат —
# RU: и вместе с ними глушат настоящие. Пять минут — время, за которое честное перекрытие заведомо кончается.
# EN: 🔴 WHY A FIVE-MINUTE THRESHOLD, NOT INSTANT. Two turns legitimately overlap for a few seconds: the old one
# EN: finishes its step while the new one is already up. An instant threshold would give false alerts, and false
# EN: alerts get muted within a week — together with the real ones. Five minutes is enough for an honest overlap
# EN: to be over for sure.
#
# RU: ГДЕ НЕ ПРИМЕНЯЕТСЯ: только выбранный шлюз; несколько совпадений без SD_SHLYUZ_SLUZHBA — слепота, код 2.
# RU: Движки — claude в cgroup шлюза и его прямые дети; вложенную cgroup, другие шлюзы и машины не обходит.
# RU: Наблюдает дожившие ходы, а не публикацию; в режиме загруженного юнита число законных ходов не ограничено.
# EN: WHERE IT DOES NOT APPLY: the selected gateway only; multiple matches without SD_SHLYUZ_SLUZHBA — blindness, exit 2.
# EN: Engines are claude in the gateway cgroup and its direct children; nested cgroups, other gateways/machines are not scanned.
# EN: It observes survivors, not publishing; legitimate turn counts are unlimited with a loaded platform unit.
#
# RU: НАСТРОЙКИ (окружение → файл пакета → умолчание):
# RU:   SD_SHLYUZ            — путь скрипта шлюза в командной строке node (без него — «НЕ НАСТРОЕНО», код 2);
# RU:   SD_SHLYUZ_SLUZHBA    — 1.0.1: юнит конкретного шлюза (берётся его MainPID); обязателен, если шлюзов с этим скриптом больше одного;
# RU:   SD_SOSTOYANIE        — файл отметки начала перекрытия (умолчание /var/lib/storozh-dvizhkov/sostoyanie);
# RU:   SD_MASHINA           — имя машины в тексте тревоги (умолчание `hostname -s`);
# RU:   SD_SLUZHBA_PLATFORMY — юнит платформы: loaded включает правило доживших, иначе «больше одного» (умолчание «службы платформы»);
# RU:   SD_PRIPISKA          — приписка к тексту тревоги (последствия на этой машине; «\n» — перевод строки).
# RU: Канал тревоги — команда agent-alert из PATH.
# EN: SETTINGS (environment → package file → default):
# EN:   SD_SHLYUZ            — gateway script path in the node command line (without it — "НЕ НАСТРОЕНО", exit 2);
# EN:   SD_SHLYUZ_SLUZHBA    — gateway unit (MainPID); required for multiple gateways sharing one script;
# EN:   SD_SOSTOYANIE        — overlap-start mark file (default /var/lib/storozh-dvizhkov/sostoyanie);
# EN:   SD_MASHINA           — machine name in the alert text (default `hostname -s`);
# EN:   SD_SLUZHBA_PLATFORMY — platform unit: loaded enables survivor checks, otherwise more-than-one (default "службы платформы");
# EN:   SD_PRIPISKA          — appendix to the alert text (consequences on this machine; "\n" = newline).
# EN: Alert channel — the agent-alert command from PATH.
#
# RU: КОДЫ: 0 — беды нет или меньше 300 с; 1 — беда не меньше 300 с (доставка — в выводе);
# RU: 2 — слепота источника/состояния, не настроено или настройки не прочитаны.
# EN: EXIT: 0 — no trouble or less than 300 s; 1 — trouble at least 300 s (delivery in output);
# EN: 2 — source/state blindness, not configured, or settings unreadable.
set -u

PREDEL_DVIZHKOV=1        # RU: 🔴 числом: норма — один ход под шлюзом  EN: as a number: normal is one turn per gateway
PORog_SEKUND=300         # RU: 🔴 числом: 5 минут терпимого перекрытия  EN: as a number: 5 minutes of tolerated overlap
# RU: Настройки SD_* — через lib/nastrojka пакета: окружение → файл настроек → умолчание (порядок и формат — в её
# RU: шапке). Ищется рядом с НАСТОЯЩИМ путём этого файла (установка: bin/ и lib/ бок о бок; символическая ссылка
# RU: раскрывается), запасной путь — /usr/local/lib/dsh-storozha-mashiny/lib/nastrojka. Нет ни там, ни там — громкий
# RU: отказ, код 2. Умолчания те же, что были: пустой SD_SHLYUZ по-прежнему даёт «НЕ НАСТРОЕНО» ниже.
# EN: SD_* settings come through the package's lib/nastrojka: environment → settings file → default (order and
# EN: format are in its header). Looked up next to the REAL path of this file (install layout: bin/ and lib/ side by
# EN: side; a symlink is resolved), fallback path — /usr/local/lib/dsh-storozha-mashiny/lib/nastrojka. Found in neither
# EN: place — a loud refusal, exit 2. Defaults are unchanged: an empty SD_SHLYUZ still yields "НЕ НАСТРОЕНО" below.
NASTROJKA=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../lib/nastrojka
[ -x "$NASTROJKA" ] || NASTROJKA=/usr/local/lib/dsh-storozha-mashiny/lib/nastrojka
if [ ! -x "$NASTROJKA" ]; then
  echo "ОТКАЗ · REFUSED: нет lib/nastrojka пакета (рядом с bin/ и в /usr/local/lib/dsh-storozha-mashiny/lib) · package lib/nastrojka not found" >&2
  exit 2
fi
SOSTOYANIE=$("$NASTROJKA" SD_SOSTOYANIE /var/lib/storozh-dvizhkov/sostoyanie) || exit 2
SHLYUZ_PUT=$("$NASTROJKA" SD_SHLYUZ "") || exit 2
# RU: 1.0.1: SD_SHLYUZ_SLUZHBA — юнит КОНКРЕТНОГО шлюза (его MainPID). Нужен, когда шлюзов с одним скриптом
# RU: несколько: прежде брался ПЕРВЫЙ процесс из списка — на машине с несколькими шлюзами это чужой шлюз.
# EN: 1.0.1: SD_SHLYUZ_SLUZHBA — the unit of a SPECIFIC gateway (its MainPID). Needed when several gateways share one
# EN: script: before, the FIRST process in the list was taken — on a multi-gateway machine that is someone else's.
SHLYUZ_SLUZHBA=$("$NASTROJKA" SD_SHLYUZ_SLUZHBA "") || exit 2
MASHINA=$("$NASTROJKA" SD_MASHINA "") || exit 2
MASHINA=${MASHINA:-$(hostname -s)}
SLUZHBA_PLATFORMY=$("$NASTROJKA" SD_SLUZHBA_PLATFORMY "службы платформы") || exit 2
PRIPISKA=$("$NASTROJKA" SD_PRIPISKA "") || exit 2
PRIPISKA=${PRIPISKA//\\n/$'\n'}

# RU: Нейтральное умолчание: без пути шлюза искать нечего — сказать об этом, а не молчать «чисто».
# EN: Neutral default: without the gateway path there is nothing to look for — say so, never a silent "clean".
if [ -z "$SHLYUZ_PUT" ]; then
  echo "НЕ НАСТРОЕНО: нет SD_SHLYUZ (путь скрипта шлюза) — считать движки не от чего. Это не «всё чисто»."
  exit 2
fi

# RU: 🔴 ИСКАТЬ ТОЧНО, ИНАЧЕ ПРОБНИК НАХОДИТ СЕБЯ. Первая редакция звала `pgrep -f '<строка шлюза>'` — и первым
# RU: в выдаче шёл СОБСТВЕННЫЙ bash, потому что строка поиска попала в его командную строку. `head -1` взял его,
# RU: «движков под шлюзом» вышло 0 при живом ходе, и ноль прочитался как норма. Ложное зелёное, добытое
# RU: собственным именем. Поэтому: только процессы, чей исполняемый файл — node, и только с этим аргументом
# RU: (сравнение — по точному окончанию строки, не по регулярному выражению).
# EN: 🔴 SEARCH EXACTLY, OR THE PROBE FINDS ITSELF. The first version called `pgrep -f '<gateway string>'` — and
# EN: the first hit was ITS OWN bash, because the search string was in its command line. `head -1` took it,
# EN: "engines under the gateway" came out 0 with a live turn, and the zero read as normal. A false green obtained
# EN: by its own name. Hence: only processes whose executable is node, and only with this argument
# EN: (compared by exact string ending, not by a regular expression).
SHLYUZY=$(ps -eo pid=,comm=,args= 2>/dev/null | awk -v p="$SHLYUZ_PUT" '$2=="MainThread" || $2=="node" {
           n = length(p)
           for (i=3; i<=NF; i++) if (length($i) >= n && substr($i, length($i) - n + 1) == p) { print $1; next }
         }')
if [ -z "${SHLYUZY:-}" ]; then
  echo "СЛЕПОТА: шлюз не найден — считать движки не от чего. Это не «всё чисто»."
  exit 2
fi
if [ -n "$SHLYUZ_SLUZHBA" ]; then
  SHLYUZ=$(systemctl show -p MainPID --value "$SHLYUZ_SLUZHBA" 2>/dev/null)
  if [ -z "$SHLYUZ" ] || [ "$SHLYUZ" = 0 ]; then
    echo "СЛЕПОТА: у службы $SHLYUZ_SLUZHBA нет главного процесса (не работает?) — считать движки не от чего."; exit 2
  fi
  grep -qx "$SHLYUZ" <<<"$SHLYUZY" || { echo "СЛЕПОТА: главный процесс $SHLYUZ службы $SHLYUZ_SLUZHBA — не node с $SHLYUZ_PUT ($(echo $SHLYUZY))."; exit 2; }
else
  n_shl=$(grep -c . <<<"$SHLYUZY")
  if [ "$n_shl" -gt 1 ]; then
    echo "СЛЕПОТА: шлюзов с $SHLYUZ_PUT — $n_shl ($(echo $SHLYUZY)); чей ход считать — задайте SD_SHLYUZ_SLUZHBA (юнит шлюза)."; exit 2
  fi
  SHLYUZ=$SHLYUZY
fi

# RU: 1.1 (B-N-1866, Михалыч 08.10.2026): ЗАКОННЫЕ ПОМОЩНИКИ ≠ ДОЖИВШИЕ. Прежде считались ВСЕ дети шлюза, норма 1 — и
# RU: помощники живого хода (их тоже рождает шлюз) давали красное: 08.10 18:50Z «движков 9» на avrora при её шаге A-N-1865.
# RU: Признак «родитель — живой шлюз» доживших НЕ отличает: переживший перезапуск ПЛАТФОРМЫ остаётся ребёнком того же шлюза.
# RU: Различает МОМЕНТ СТАРТА: законный движок (главный ход и его помощники) рождён ПОСЛЕ старта текущей платформы
# RU: (SD_SLUZHBA_PLATFORMY — юнит; ExecMainStartTimestampMonotonic против starttime из /proc/<pid>/stat).
# RU: ДОЖИВШИЙ = старт раньше старта платформы ИЛИ платформа не работает ИЛИ цепочка родителей не доходит до текущего шлюза (движок в cgroup шлюза
# RU: после перезапуска шлюза — при KillMode=control-group такого не бывает, ловится на случай иной настройки).
# RU: Тревога — доживший держится дольше порога. Число законных не ограничено.
# RU: Шум гонки: звено цепочки ушло посреди подъёма — разовое «ДОЖИЛ» в списке, но только отметка; тревога — лишь после 300 с.
# RU: SD_SLUZHBA_PLATFORMY не юнит (LoadState≠loaded) — ПРЕЖНЕЕ правило «движков больше одного».
# RU: Вложенный движок (шлюз → … → claude) законен, если цепочка родителей доходит до шлюза и он рождён после старта платформы.
# RU: НЕ ЛОВИТ: два главных хода внутри ОДНОЙ живой платформы (оба рождены после её старта); помощников, рождённых
# RU: ДОЖИВШИМ ходом уже после перезапуска (сам доживший при этом красный).
CG=$(sed -n 's/^0:://p' "/proc/$SHLYUZ/cgroup" 2>/dev/null)
TIK=$(getconf CLK_TCK)
PLAT_ZAGRUZKA=$(systemctl show -p LoadState --value "$SLUZHBA_PLATFORMY" 2>/dev/null)
PLAT_PID=$(systemctl show -p MainPID --value "$SLUZHBA_PLATFORMY" 2>/dev/null)
PLAT_START=$(systemctl show -p ExecMainStartTimestampMonotonic --value "$SLUZHBA_PLATFORMY" 2>/dev/null)
if [ "$PLAT_ZAGRUZKA" != loaded ]; then REZHIM=prezhnij
elif [ -z "$PLAT_PID" ] || [ "$PLAT_PID" = 0 ]; then REZHIM=platforma-ne-rabotaet
else REZHIM=po-startu; fi
spisok=""; zakonnyh=0; dozhivshih=0
for pid in $( { [ -n "$CG" ] && cat "/sys/fs/cgroup$CG/cgroup.procs" 2>/dev/null; pgrep -P "$SHLYUZ" 2>/dev/null; } | sort -un); do
  [ "$(ps -o comm= -p "$pid" 2>/dev/null | tr -d ' ')" = "claude" ] || continue
  ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' '); et=$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ')
  st=$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null); st_us=$(( ${st:-0} * 1000000 / TIK ))
  prichina=""
  # 2.0.10 (B-N-1866 хвост, Михалыч 09.10): законный движок бывает и ВЛОЖЕННЫМ — шлюз → движок → оболочка инструмента → claude
  # (09.10 00:46:58Z у iskra: 953267/953268 родились в секунду вызова Bash живым ходом 758045, через 4 мин ушли сами).
  # Поэтому «родитель не шлюз» больше не приговор: поднимаемся по цепочке родителей (не больше 32 шагов). Дошли до ТЕКУЩЕГО
  # шлюза — дальше судит момент старта, как у прямых детей. Не дошли (сирота после перезапуска шлюза: родитель 1, или
  # цепочка оборвалась) — дожил.
  up=$ppid; shagov=0
  while [ -n "$up" ] && [ "$up" != "$SHLYUZ" ] && [ "$up" -gt 1 ] 2>/dev/null && [ "$shagov" -lt 32 ]; do
    up=$(ps -o ppid= -p "$up" 2>/dev/null | tr -d ' '); shagov=$((shagov+1))
  done
  [ "$up" = "$SHLYUZ" ] || prichina="цепочка родителей от $ppid не доходит до шлюза $SHLYUZ"
  if [ -z "$prichina" ]; then case $REZHIM in
    platforma-ne-rabotaet) prichina="$SLUZHBA_PLATFORMY не работает";;
    po-startu) [ "$st_us" -lt "$PLAT_START" ] && prichina="рождён раньше старта $SLUZHBA_PLATFORMY";;
  esac; fi
  if [ -n "$prichina" ]; then dozhivshih=$((dozhivshih+1)); else zakonnyh=$((zakonnyh+1)); fi
  spisok+="$pid $et${prichina:+ — ДОЖИЛ: $prichina}"$'\n'
done
spisok=${spisok%$'\n'}
skolko=$((zakonnyh+dozhivshih))

if [ "$REZHIM" = prezhnij ]; then
  echo "движков под шлюзом $SHLYUZ: $skolko (норма $PREDEL_DVIZHKOV, порог тревоги ${PORog_SEKUND} с; $SLUZHBA_PLATFORMY не юнит — прежнее правило)"
  beda=$(( skolko > PREDEL_DVIZHKOV ))
else
  echo "движков под шлюзом $SHLYUZ: $skolko (законных $zakonnyh, доживших $dozhivshih; норма — доживших 0, порог тревоги ${PORog_SEKUND} с)"
  beda=$(( dozhivshih > 0 ))
fi
[ -n "$spisok" ] && printf '%s\n' "$spisok" | sed 's/^/  /'

# A private directory and a regular, caller-owned mark are required before any state operation.
state_dir=$(dirname -- "$SOSTOYANIE")
if [ ! -e "$state_dir" ]; then
  (umask 077; mkdir -p -- "$state_dir") || { echo "СЛЕПОТА: каталог состояния $state_dir не создан"; exit 2; }
fi
if [ -L "$state_dir" ] || [ ! -d "$state_dir" ]; then
  echo "СЛЕПОТА: каталог состояния $state_dir не обычный каталог"; exit 2
fi
read -r state_uid state_mode < <(stat -c '%u %a' -- "$state_dir")
if [ "$state_uid" != "$EUID" ] || [ $(( 8#$state_mode & 022 )) -ne 0 ]; then
  echo "СЛЕПОТА: каталог состояния $state_dir принадлежит другой учётке или доступен для чужой записи"; exit 2
fi
if [ -e "$SOSTOYANIE" ] || [ -L "$SOSTOYANIE" ]; then
  if [ -L "$SOSTOYANIE" ] || [ ! -f "$SOSTOYANIE" ]; then
    echo "СЛЕПОТА: отметка $SOSTOYANIE не обычный файл"; exit 2
  fi
  read -r state_uid state_mode < <(stat -c '%u %a' -- "$SOSTOYANIE")
  if [ "$state_uid" != "$EUID" ] || [ $(( 8#$state_mode & 022 )) -ne 0 ]; then
    echo "СЛЕПОТА: отметка $SOSTOYANIE имеет чужого владельца или права записи"; exit 2
  fi
fi

if [ "$beda" -eq 0 ]; then
  # RU: 🔴 Отметка снимается: состояние вернулось в норму. Метка, пережившая свою причину, врёт в другую
  # RU: сторону — сообщает о беде, которой уже нет.
  # EN: 🔴 The mark is removed: the state is back to normal. A mark that outlives its cause lies the other
  # EN: way — it reports a trouble that is gone.
  if [ -f "$SOSTOYANIE" ]; then
    rm -f -- "$SOSTOYANIE" || { echo "СЛЕПОТА: отметка $SOSTOYANIE не снята"; exit 2; }
    echo "перекрытие кончилось — отметка снята"
  fi
  echo "ok: доживших ходов нет"
  exit 0
fi

teper=$(date +%s)
s_kakih=$(cat "$SOSTOYANIE" 2>/dev/null || echo "")
if [[ ! "$s_kakih" =~ ^[0-9]{1,10}$ ]] || [ $((10#${s_kakih:-0})) -gt "$teper" ]; then
  [ -z "$s_kakih" ] || echo "НЕГОДНАЯ отметка $SOSTOYANIE: не десятичная дата или дата из будущего — начало сброшено"
  tmp_state=$(mktemp "$state_dir/.sostoyanie.XXXXXX") || { echo "СЛЕПОТА: временная отметка не создана"; exit 2; }
  if ! printf '%s' "$teper" > "$tmp_state" || ! mv -f -- "$tmp_state" "$SOSTOYANIE"; then
    rm -f -- "$tmp_state"; echo "СЛЕПОТА: отметка $SOSTOYANIE не записана"; exit 2
  fi
  echo "перекрытие замечено сейчас — жду ${PORog_SEKUND} с, прежде чем звать: короткое перекрытие законно"
  exit 0
fi

dlitsya=$(( teper - 10#$s_kakih ))
if [ "$dlitsya" -lt "$PORog_SEKUND" ]; then
  echo "перекрытие длится ${dlitsya} с из ${PORog_SEKUND} — молчу, это ещё законно"
  exit 0
fi

if [ "$REZHIM" = prezhnij ]; then zagolovok="ходов агента больше одного"; stroka="движков под шлюзом: ${skolko} при норме ${PREDEL_DVIZHKOV}"
else zagolovok="ход агента пережил свою платформу"; stroka="доживших движков: ${dozhivshih} (законных ${zakonnyh}) · шлюз ${SHLYUZ_SLUZHBA:-$SHLYUZ_PUT}, pid ${SHLYUZ}"; fi
soobshchenie="🔴 <b>${MASHINA}: ${zagolovok}</b>
${stroka}
длится: ${dlitsya} с (порог ${PORog_SEKUND})
$(printf '%s' "$spisok" | sed 's/^/• /')

Лишний ход доживает после перезапуска платформы: движки живут в cgroup ШЛЮЗА,
перезапуск ${SLUZHBA_PLATFORMY} их не трогает. Такой ход способен на НЕОБРАТИМОЕ${PRIPISKA:+ —
$PRIPISKA}"
if agent-alert "$soobshchenie" >/dev/null 2>&1; then
  echo "🔴 ТРЕВОГА ОТПРАВЛЕНА: движков $skolko, длится ${dlitsya} с"
else
  echo "🔴 движков $skolko, длится ${dlitsya} с — И ТРЕВОГА НЕ ДОСТАВЛЕНА (agent-alert отказал)"
  exit 1
fi
exit 1
