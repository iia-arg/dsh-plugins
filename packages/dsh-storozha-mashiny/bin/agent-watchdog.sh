#!/usr/bin/env bash
# RU: Сторож машины с агентами. Проверяет то, что ломается молча, и зовёт человека.
# EN: Watchdog for a machine that runs agents. Checks what breaks silently and calls a human.
# НЕ ловит: смену каталога писателя без правки конфига — если в юнит копии поставят BACKUP_LOCAL_DIR, TMPDIR или PrivateTmp, конфиг сторожа молча разойдётся с писателем.
#
# RU: ПРИНЦИП. Сторож не чинит — он сообщает. Починка требует решения, а решение
# RU: принимает человек или агент, но не таймер.
# EN: PRINCIPLE. The watchdog does not repair — it reports. A repair needs a decision,
# EN: and a decision is made by a human or an agent, never by a timer.
#
# RU: ГРАНИЦЫ (без них защита производит тот вред, от которого защищает):
# RU:   • у каждой проверки свой порог, и он в переменной, а не в коде;
# RU:   • на каждую беду — окно тишины (COOLDOWN), иначе тревога станет фоном и её
# RU:     перестанут читать;
# RU:   • сторож молчит, когда всё хорошо. «Ежечасное всё в порядке» — это не
# RU:     наблюдение, а шум.
# EN: LIMITS (without them a guard causes the very harm it guards against):
# EN:   • every check has its own threshold, kept in a variable, not in code;
# EN:   • every problem has a quiet window (COOLDOWN), otherwise the alert becomes
# EN:     background noise and people stop reading it;
# EN:   • the watchdog is silent when all is well. An hourly "all fine" is noise,
# EN:     not observation.
#
# RU: ПРОВЕРЯЕТ ЖИВОЙ ОБЪЕКТ, А НЕ ЗАПИСЬ О НЁМ: состояние службы у systemd, живой
# RU: ответ по сети, реальные байты на диске.
# EN: IT CHECKS THE LIVE OBJECT, NOT A RECORD ABOUT IT: unit state as systemd sees it,
# EN: a live network answer, real bytes on disk.
set -uo pipefail
if (( $# != 0 )); then
  printf "%s\n" "agent-watchdog: arguments are not accepted" >&2
  exit 2
fi

# RU: Отказ источника — не отсутствие предмета. Вызывающий проверяет код вне $(...).
# RU: Одна попытка добычи за проход; законный пустой результат разбирается отдельно.
# EN: A failed source is not an absent subject. The caller checks the exit code outside $(...).
# EN: One fetch attempt per pass; a legitimately empty result is handled separately.
net_dannyh() {
  local msg="СЛЕПОТА: не добыто $1; код $2; ${3:0:200}"
  printf '%s\n' "$msg" >&2
  logger -t "agent-watchdog" -- "$msg" 2>/dev/null || true
}


# RU: Пути — настройки. Файл настройки по умолчанию — в каталоге пакета /etc/dsh-storozha-mashiny/agent-watchdog.conf;
# RU: на машине с прежним местом путь задаётся переменной WATCHDOG_CONF (drop-in юнита), как каталог состояния и канал.
# EN: Paths are settings. The default settings file is in the package directory /etc/dsh-storozha-mashiny/agent-watchdog.conf;
# EN: a machine with an older location sets WATCHDOG_CONF (unit drop-in), like the state dir and the channel.
CONF="${WATCHDOG_CONF:-/etc/dsh-storozha-mashiny/agent-watchdog.conf}"
STATE="${WATCHDOG_STATE:-/var/lib/machine-watchdog}"
ALERT="${WATCHDOG_ALERT:-/usr/local/bin/agent-alert}"
mkdir -p "$STATE"

# RU: Умолчания; всё перекрывается файлом настройки.
# EN: Defaults; everything is overridden by the settings file.
SERVICES=""                 # RU: список служб через пробел · EN: space-separated unit list
MEMORY_HEALTH_URL=""        # RU: адрес проверки живости памяти, пусто — не проверять · EN: memory health URL, empty = skip
DISK_PATHS="/"              # RU: где смотреть место · EN: where to check free space
DISK_MIN_FREE_PCT=10        # RU: ниже этого — тревога · EN: below this — alert
DISK_KNOWN_WRITERS=""       # Required unit=/write/root entries, separated by spaces.
DISK_WARN_FREE_PCT=20
DISK_RATE_DROP_GIB=2
DISK_RATE_MAX_GAP_SEC=900
DISK_DU_TIMEOUT_SEC=8
DISK_DU_MAX_MIB=256
COOLDOWN_MIN=30             # RU: окно тишины на одну и ту же беду · EN: quiet window per problem, minutes
# RU: Нет файла настройки — сказать об этом И выйти кодом провала (2) в конце прохода: без него сторож
# RU: смотрит только место на «/», и удачный прогон юнита читался бы как «службы под наблюдением»
# RU: (немая слепота на таймере). Место на диске всё равно меряется — полезная часть не теряется.
# EN: No settings file — say so AND exit with a failure code (2) at the end of the pass: without it the
# EN: watchdog only checks free space on "/", and a successful unit run would read as "units are watched"
# EN: (silent blindness on a timer). Free space is still measured — the useful part is kept.
nastrojki_net=0
if [ -r "$CONF" ]; then . "$CONF"
else nastrojki_net=1
     printf '%s\n' "настройки нет ($CONF): службы и память не наблюдаются, только место на $DISK_PATHS (задайте WATCHDOG_CONF)" >&2
fi

# RU: Окно тишины: одна и та же беда не повторяется чаще, чем раз в COOLDOWN_MIN.
# EN: Quiet window: the same problem is not repeated more often than once per COOLDOWN_MIN.
should_alert() {
  # RU: 🔴 Ключ чистим от косых черт: в путях вида «disk-/var» они превращали имя
  # RU: файла отметки в несуществующий путь, отметка не писалась, и окно тишины для
  # RU: дисковых тревог не работало вовсе. Снаружи не видно: тревога-то уходит.
  # EN: 🔴 Slashes are stripped from the key: in paths like "disk-/var" they turned the
  # EN: stamp file name into a nonexistent path, the stamp was never written, and the
  # EN: quiet window for disk alerts never worked. Invisible from outside: the alert still goes out.
  local key="${1//\//_}" f now age
  f="$STATE/last-${key}.stamp"
  now=$(date +%s)
  if [ -f "$f" ]; then
    age=$(( now - $(cat "$f" 2>/dev/null || echo 0) ))
    [ "$age" -lt $(( COOLDOWN_MIN * 60 )) ] && return 1
  fi
  return 0
}

# RU: Отметка окна тишины ставится ТОЛЬКО после подтверждённой отправки. Раньше она
# RU: стояла в should_alert, то есть до отправки: недоставленная тревога глушила
# RU: себя на COOLDOWN_MIN минут. 🔴 ГРАНИЦА: если отправка падает раз за разом,
# RU: тревога будет повторяться каждый запуск сторожа — это намеренно. Не «чинить»
# RU: возвратом отметки вперёд: молчащая беда хуже повторяющейся.
# EN: The quiet-window stamp is set ONLY after a confirmed send. It used to be set in
# EN: should_alert, i.e. before sending: an undelivered alert muted itself for COOLDOWN_MIN
# EN: minutes. 🔴 LIMIT: if sending fails again and again, the alert repeats on every run —
# EN: on purpose. Do not "fix" it by moving the stamp back: a silent problem is worse than a repeating one.
mark_sent() {
  local key="${1//\//_}"
  date +%s > "$STATE/last-${key}.stamp"
}

# RU: Экранирование для parse_mode=HTML телеграма. Строка журнала с «<» или «&»
# RU: роняет отправку целиком: 400 «can't parse entities». Проверено живым
# RU: запросом к API. Порядок замен важен: «&» первым.
# RU: 🔴 Обратная косая перед «&» обязательна: в bash 5.2 «&» в ПРАВОЙ части
# RU: ${s//что/на_что} значит «всё совпадение», как в sed. Без неё «&lt;» станет
# RU: «<lt;» — текст выглядит почти верным, а телеграм отвечает 400. Поймано опытом.
# EN: Escaping for Telegram parse_mode=HTML. A journal line containing "<" or "&" makes
# EN: the whole send fail: 400 "can't parse entities". Verified with a live API request.
# EN: Replacement order matters: "&" first.
# EN: 🔴 The backslash before "&" is required: in bash 5.2 an "&" on the RIGHT side of
# EN: ${s//what/with} means "the whole match", as in sed. Without it "&lt;" becomes
# EN: "<lt;" — looks almost right, and Telegram answers 400. Learned the hard way.
esc() {
  local s="${1-}"
  s="${s//&/\&amp;}"; s="${s//</\&lt;}"; s="${s//>/\&gt;}"
  printf '%s' "$s"
}

# RU: Обрезка по ЗНАКАМ, построчно. `cut -c` в GNU coreutils режет по БАЙТАМ и
# RU: локаль игнорирует — на русском тексте обрыв приходился на середину буквы,
# RU: телеграм отвечал 400 «text must be encoded in UTF-8», тревога не уходила.
# RU: Подстановка ${s:0:N} считает знаки только при заданной локали — она задана
# RU: в юните (Environment=LC_ALL=C.UTF-8).
# EN: Trim by CHARACTERS, line by line. GNU coreutils `cut -c` cuts BYTES and ignores
# EN: the locale — on Cyrillic text the cut landed mid-letter, Telegram answered 400
# EN: "text must be encoded in UTF-8", and the alert never went out.
# EN: ${s:0:N} counts characters only with a locale set — the unit sets it
# EN: (Environment=LC_ALL=C.UTF-8).
#
# RU: 🔴 ИЗВЕСТНЫЙ СПЯЩИЙ ДЕФЕКТ (не чиним намеренно): `read` не отдаёт
# RU: последнюю строку, если во входе нет завершающего перевода строки. В бою не
# RU: проявляется — вход всегда от journalctl, там перевод есть. Проснётся, если
# RU: кто-то поменяет источник входа (например, подаст текст через printf '%s'):
# RU: тревога тогда молча станет пустой. Меняешь источник — проверь этот случай.
# EN: 🔴 KNOWN DORMANT DEFECT (deliberately not fixed): `read` drops the last line when
# EN: the input has no trailing newline. Never shows in production — input always comes
# EN: from journalctl, which ends with a newline. It wakes up if someone changes the input
# EN: source (e.g. feeds text via printf '%s'): the alert then silently becomes empty.
# EN: Changing the source — test this case.
cut_chars() {
  local n="$1" l
  while IFS= read -r l; do printf '%s\n' "${l:0:$n}"; done
}

alert() {
  local key="$1" text="$2"
  should_alert "$key" || { echo "тихо ($key): окно тишины ещё не вышло"; return 0; }
  if [ ! -x "$ALERT" ]; then
    echo "🔴 нет помощника $ALERT — тревога НЕ отправлена: $text"
    nedostavleno=$((nedostavleno+1))
    return 0
  fi
  local out rc
  out="$("$ALERT" "$text" 2>&1)"; rc=$?
  if [ "$rc" -eq 0 ]; then
    mark_sent "$key"
  else
    echo "🔴 тревога ($key) НЕ доставлена (код $rc): $out — окно тишины не ставлю, повторю в следующий заход"
    nedostavleno=$((nedostavleno+1))
  fi
}

problems=0
dobycha_failed=0
nedostavleno=0

# RU: ── 1. Службы. Проверяем состояние у systemd, а не наличие процесса: процесс
# RU: с похожим именем может принадлежать чужой службе.
# EN: ── 1. Units. We ask systemd for the state instead of looking for a process: a process
# EN: with a similar name may belong to a different unit.
# RU: 🔴 Элемент «юнит:часы» — СВЕЖЕСТЬ последнего успешного запуска разовой службы вместо
# RU: is-active (oneshot между тактами inactive). is-active таймера не видит «таймер active, запусков нет» и службу, падающую
# RU: при живом таймере. Успех и провал — из журнала systemd (сняты опытом на systemd-run -p Type=oneshot):
# RU:   успех  — JOB_TYPE=start JOB_RESULT=done  («Finished …»);
# RU:   провал — JOB_TYPE=start JOB_RESULT=failed/timeout/… («Failed to start …»), рядом UNIT_RESULT=exit-code.
# RU: Различитель: последнее ЗАВЕРШЕНИЕ запуска не done → «ПАДАЕТ»; иначе последний done старше срока (или его нет) → «НЕ
# RU: СРАБАТЫВАЛ». Журнал не добыт → СЛЕПОТА (код 2), не «чисто». Элементы без «:» — как прежде (is-active).
# RU: ⚠️ ГРАНИЦА: только для Type=oneshot. У simple/forking done ставится на СТАРТЕ — там «юнит:часы» мерит не то.
# RU: Не ловит: успешный по коду запуск, ничего не проверивший (сторож, который всегда кончается exit 0); журнал, обрезанный
# RU: ротацией до последнего запуска (даст громкое «не срабатывал», не тихое).
# EN: 🔴 An item "unit:hours" checks FRESHNESS of the last successful run of a oneshot unit instead of
# EN: is-active (a oneshot is inactive between runs). is-active on a timer misses "timer active, no runs" and a unit that
# EN: fails while its timer is alive. Success and failure come from the systemd journal (measured with systemd-run -p Type=oneshot):
# EN:   success — JOB_TYPE=start JOB_RESULT=done  ("Finished …");
# EN:   failure — JOB_TYPE=start JOB_RESULT=failed/timeout/… ("Failed to start …"), with UNIT_RESULT=exit-code nearby.
# EN: Rule: the last COMPLETED start is not done → "FAILING"; otherwise the last done is older than the limit (or absent) →
# EN: "NOT RUNNING". Journal not fetched → BLINDNESS (exit 2), not "clean". Items without ":" work as before (is-active).
# EN: ⚠️ LIMIT: Type=oneshot only. For simple/forking, done is recorded at START — there "unit:hours" measures the wrong thing.
# EN: Does not catch: a run that succeeded by exit code but checked nothing (a guard that always ends with exit 0); a journal
# EN: rotated past the last run (gives a loud "not running", not a silent pass).
svezhest() { # svezhest юнит часы · svezhest unit hours
  local u="$1" ch="$2" out kod posl posl_ok now vozr
  if ! [[ "$ch" =~ ^[1-9][0-9]*$ ]]; then
    problems=$((problems+1)); alert "fresh-$u-forma" "🔴 элемент SERVICES <b>$(esc "$u:$ch")</b> негоден: после «:» нужны часы (целое ≥1)"; return
  fi
  out=$(journalctl UNIT="$u" JOB_TYPE=start -o json -n 20 --no-pager -q 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "журнал запусков $u" "$kod" "$out"; dobycha_failed=1; return; fi
  posl=$(printf '%s\n' "$out" | jq -rs 'map(select(.JOB_RESULT)) | last | if . then "\(.__REALTIME_TIMESTAMP)|\(.JOB_RESULT)" else "" end' 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "разбор журнала запусков $u (jq)" "$kod" "$posl"; dobycha_failed=1; return; fi
  out=$(journalctl UNIT="$u" JOB_TYPE=start JOB_RESULT=done -o json -n 1 --no-pager -q 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "журнал успехов $u" "$kod" "$out"; dobycha_failed=1; return; fi
  posl_ok=$(printf '%s\n' "$out" | jq -rs 'last | if . then .__REALTIME_TIMESTAMP else "" end' 2>&1); kod=$?
  if [ "$kod" -ne 0 ]; then net_dannyh "разбор журнала успехов $u (jq)" "$kod" "$posl_ok"; dobycha_failed=1; return; fi
  now=$(date +%s)
  local ok_txt="в журнале нет"
  if [ -n "$posl_ok" ]; then
    vozr=$(( now - posl_ok / 1000000 ))
    if [ "$vozr" -lt 3600 ]; then ok_txt="$(( vozr / 60 )) мин"; else ok_txt="$(( vozr / 3600 )) ч"; fi
    ok_txt="$ok_txt назад ($(date -u -d "@$(( posl_ok / 1000000 ))" '+%d.%m %H:%MZ'))"
  fi
  if [ -n "$posl" ] && [ "${posl#*|}" != done ]; then
    problems=$((problems+1))
    alert "fresh-$u-padaet" "🔴 <b>$u</b> ПАДАЕТ: последний запуск ($(date -u -d "@$(( ${posl%%|*} / 1000000 ))" '+%d.%m %H:%MZ')) завершился <b>$(esc "${posl#*|}")</b>; последний успех: $ok_txt. Таймер зовёт, служба не доходит до конца."
    return
  fi
  vozr=$(( now - ${posl_ok:-0} / 1000000 ))
  if [ -z "$posl_ok" ] || [ "$vozr" -gt $(( ch * 3600 )) ]; then
    problems=$((problems+1))
    alert "fresh-$u-molchit" "🔴 <b>$u</b> НЕ СРАБАТЫВАЛ: последний успешный запуск — $ok_txt при сроке $ch ч; провалов после него нет — служба не запускается (таймер снят, «active без следующего запуска» или завис)."
  fi
}

for s in $SERVICES; do
  case "$s" in *:*) svezhest "${s%%:*}" "${s#*:}"; continue ;; esac
  st="$(systemctl is-active "$s" 2>/dev/null || true)"
  if [ "$st" != "active" ]; then
    problems=$((problems+1))
    alert "service-$s" "🔴 служба <b>$s</b> в состоянии <b>${st:-неизвестно}</b>. Последние строки журнала:
<code>$(esc "$(journalctl -u "$s" --no-pager -n 5 2>/dev/null | tail -5 | cut_chars 160)")</code>"
  fi
done

# RU: ── 2. Память: живой ответ по сети, а не «служба запущена».
# EN: ── 2. Memory service: a live network answer, not "the unit is running".
if [ -n "$MEMORY_HEALTH_URL" ]; then
  resp="$(curl -s -m 10 "$MEMORY_HEALTH_URL" 2>&1)"
  case "$resp" in
    *'"status":"ok"'*) : ;;
    *)
      problems=$((problems+1))
      alert "memory-health" "🔴 память не отвечает на проверку живости ($MEMORY_HEALTH_URL). Ответ: <code>$(esc "$(printf %s "$resp" | LC_ALL=C.utf8 sed -e 's/\(.\{0,160\}\).*/\1/')")</code>"
      ;;
  esac
fi

# RU: ── 3. Место на диске. Кончится — молча встанет всё: и записи памяти, и журналы.
# EN: ── 3. Disk space. When it runs out everything stops silently: memory writes and journals alike.
# One sample per filesystem; directory scans share one time budget for this pass.
read -r -a disk_paths <<< "$DISK_PATHS"
disk_result=$(python3 -I -B - "$STATE" "$(date +%s)" "$DISK_MIN_FREE_PCT" \
  "$DISK_WARN_FREE_PCT" "$DISK_RATE_DROP_GIB" "$DISK_RATE_MAX_GAP_SEC" \
  "$DISK_DU_TIMEOUT_SEC" "$DISK_DU_MAX_MIB" "$DISK_KNOWN_WRITERS" "${disk_paths[@]}" <<'PY_DISK'
import hashlib, json, os, re, resource, stat, subprocess, sys, tempfile, time
from pathlib import Path

LIMIT = 1024 * 1024
GIB = 1024 ** 3

def emit(kind, key, text):
    print('\t'.join((kind, key, text.replace('\t', ' ').replace('\n', ' '))))

def integer(value):
    if not re.fullmatch(r'[0-9]+', value):
        raise ValueError('expected unsigned integer')
    return int(value)

def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('duplicate state key')
        result[key] = value
    return result

def load_sample(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > LIMIT):
            raise ValueError('unsafe sample file')
        sample = json.loads(stream.read(LIMIT + 1), object_pairs_hook=pairs)
    if (set(sample) != {'version', 'dev', 'boot', 'size', 'at', 'avail', 'du'}
            or sample['version'] != 1 or not isinstance(sample['boot'], str)
            or any(type(sample[k]) is not int or sample[k] < 0
                   for k in ('dev', 'size', 'at', 'avail'))
            or not 0 <= sample['avail'] <= sample['size'] or sample['size'] == 0
            or not isinstance(sample['du'], dict)):
        raise ValueError('invalid sample schema')
    for root, rows in sample['du'].items():
        if (not isinstance(rows, dict) or any(not isinstance(k, str)
                or type(v) is not int or v < 0 for k, v in rows.items())):
            raise ValueError('invalid du sample')
    return sample

def save_sample(path, sample):
    data = json.dumps(sample, ensure_ascii=True, allow_nan=False).encode()
    if len(data) > LIMIT:
        raise ValueError('sample exceeds 1 MiB')
    fd, name = tempfile.mkstemp(prefix='.disk-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def du_limits():
    resource.setrlimit(resource.RLIMIT_AS, (memory * 1024 ** 2,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (LIMIT,) * 2)

def scan(root, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('DU_TIMEOUT shared budget exhausted')
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            proc = subprocess.run(['du', '-x', '-a', '-B1', '--max-depth=1', '--null', '--', root],
                stdout=out, stderr=err, timeout=remaining, preexec_fn=du_limits)
        except subprocess.TimeoutExpired:
            raise TimeoutError('DU_TIMEOUT') from None
        if proc.returncode:
            raise ValueError('DU_FAILED rc=' + str(proc.returncode))
        out.seek(0)
        raw = out.read(LIMIT + 1)
    if not raw or len(raw) > LIMIT or not raw.endswith(b'\0'):
        raise ValueError('DU_INCOMPLETE')
    rows = {}
    for entry in raw[:-1].split(b'\0'):
        count, name = entry.split(b'\t', 1)
        name = os.fsdecode(name)
        if not count.isdigit() or (name != root and str(Path(name).parent) != root) or name in rows:
            raise ValueError('DU_INVALID_ROW')
        rows[name] = int(count)
    if root not in rows:
        raise ValueError('DU_MISSING_ROOT')
    return rows

try:
    state = Path(sys.argv[1])
    now, critical, warning, drop_gib, gap, budget, memory = map(integer, sys.argv[2:9])
    writer_specs = sys.argv[9]
    paths = sys.argv[10:]
    if (not 0 < critical < warning <= 100 or not 1 <= drop_gib <= 1024
            or not 1 <= gap <= 3600 or not 1 <= budget <= 30
            or not 64 <= memory <= 1024 or not 1 <= len(paths) <= 16
            or any(not p.startswith('/') or any(c.isspace() for c in p) for p in paths)):
        raise ValueError('invalid disk settings (paths: 1..16 absolute, without whitespace)')
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
except Exception as exc:
    emit('error', 'disk-settings', str(exc))
    sys.exit(2)

# Names and write roots come from configuration, not service-specific code.
writers, writers_ok = [], True
try:
    entries = writer_specs.split()
    if not 1 <= len(entries) <= 16:
        raise ValueError('DISK_KNOWN_WRITERS must contain 1..16 unit=/write/root entries')
    for entry in entries:
        unit, root = entry.split('=', 1)
        if (not re.fullmatch(r'[A-Za-z0-9_@.:-]+\.service', unit)
                or not root.startswith('/') or root == '/' or any(c.isspace() for c in root)):
            raise ValueError('invalid known writer entry')
        root = os.path.realpath(root)
        if root == '/' or not os.path.isdir(root):
            raise ValueError('known writer root is not a directory: ' + root)
        try:
            result = subprocess.run(['systemctl', 'show', '--property=LoadState',
                                     '--property=ActiveState', '--', unit],
                                    capture_output=True, text=True, timeout=3)
            fields = pairs(line.split('=', 1) for line in result.stdout.splitlines())
            if (result.returncode or set(fields) != {'LoadState', 'ActiveState'}
                    or fields['LoadState'] != 'loaded'
                    or fields['ActiveState'] not in {'active', 'activating', 'inactive',
                                                     'failed', 'deactivating', 'reloading', 'maintenance'}):
                raise ValueError('unit missing or unknown state')
            if fields['ActiveState'] in {'active', 'activating'}:
                writers.append((unit, root, os.stat(root).st_dev))
        except Exception as exc:
            writers_ok = False
            emit('error', 'disk-writer-' + unit, str(exc))
except Exception as exc:
    writers_ok = False
    emit('error', 'disk-writers', str(exc))

groups = {}
for path in paths:
    try:
        path = os.path.normpath(path)
        groups.setdefault(os.stat(path).st_dev, []).append(path)
    except OSError as exc:
        emit('error', 'disk-path', str(exc))

# This deadline includes all scans, rather than granting each alias a fresh budget.
deadline = time.monotonic() + budget
for dev, aliases in groups.items():
    path = aliases[0]
    try:
        proc = subprocess.run(['df', '-B1', '--output=avail,size', '--', path],
                              capture_output=True, text=True, timeout=5)
        lines = proc.stdout.splitlines()
        if proc.returncode or len(lines) != 2 or len(lines[1].split()) != 2:
            raise ValueError('DF_FAILED or invalid two-line result')
        avail, size = map(integer, lines[1].split())
        if size == 0 or avail > size:
            raise ValueError('DF_INVALID_SIZE')
    except Exception as exc:
        emit('error', 'disk-' + path, str(exc))
        continue
    sample_path = state / ('disk-sample-' + hashlib.sha256(path.encode()).hexdigest() + '.json')
    previous = None
    writable = True
    try:
        previous = load_sample(sample_path)
    except Exception as exc:
        writable = False
        emit('error', 'disk-state-' + path, str(exc))
    comparable = (previous is not None and previous['dev'] == dev and previous['boot'] == boot
                  and previous['size'] == size and 0 < now - previous['at'] <= gap)
    dt = now - previous['at'] if comparable else 0
    drop = previous['avail'] - avail if comparable else 0
    rapid = drop >= drop_gib * GIB
    active = [(unit, root) for unit, root, device in writers if device == dev]
    scan_roots = list(dict.fromkeys(aliases + [str(Path(root).parent) for _, root in active
                                              if os.stat(Path(root).parent).st_dev == dev]))
    covers_fs = any(os.path.ismount(root) for root in scan_roots)
    du_rows, growth, notes = {}, [], []
    if not covers_fs:
        notes.append('DU_SCOPE_INCOMPLETE: filesystem root not observed')
    for root in sorted(scan_roots, key=lambda x: -len(Path(x).parts)):
        try:
            rows = scan(root, deadline)
            du_rows[root] = rows
            old = previous['du'].get(root, {}) if comparable else {}
            for name, value in rows.items():
                if old and name != root and value > old.get(name, 0):
                    growth.append((value - old.get(name, 0), name))
        except Exception as exc:
            notes.append(root + ': ' + str(exc))
    sample = dict(version=1, dev=dev, boot=boot, size=size,
                  at=now, avail=avail, du=du_rows)
    if len(json.dumps(sample, ensure_ascii=True).encode()) > LIMIT:
        # Diagnostic volume must never prevent the numeric baseline advancing.
        sample['du'] = {}
        notes.append('DU_SAMPLE_TOO_LARGE: attribution baseline omitted, df retained')
    # Do not call a merely large directory a growing directory.
    detail = '; '.join('растёт ' + repr(name)[:240] + f' +{delta / GIB:.2f} GiB за {dt} с'
                       for delta, name in sorted(growth, reverse=True)[:3])
    if not detail:
        detail = 'рост каталогов не установлен (нужны две полные сравнимые du-выборки)'
    if notes:
        detail += '; ' + '; '.join(notes)[:500]
    detail += '; du одного уровня; open-deleted/резерв/метаданные и процесс писателя не установлены'
    if writable:
        try:
            save_sample(sample_path, sample)
        except Exception as exc:
            emit('error', 'disk-state-' + path, str(exc))
    pct = avail * 100 // size
    subject = ', '.join(aliases)
    foreign, owned = [], []
    for delta, name in growth:
        if any(name == root or root in Path(name).parents for _, root in active):
            owned.append(name)
        elif name in du_rows and comparable and previous['du'].get(name) and any(
                child != name and value > previous['du'][name].get(child, 0)
                for child, value in du_rows[name].items()):
            # Refine a parent aggregate using the complete child-level scan.
            continue
        else:
            foreign.append(name)
    coverage = comparable and all(root in du_rows and previous['du'].get(root) for root in scan_roots)
    expected = bool(writers_ok and active and covers_fs and coverage and not foreign and (drop <= 0 or owned))
    eta_text = ('до 0 — ' + str((avail * dt + drop * 60 - 1) // (drop * 60))
                + ' мин при той же скорости') if drop > 0 else 'до 0 — не установлено (нет сравнимого падения)'
    if active and not expected:
        detail += '; ожидаемость не подтверждена'
        if foreign:
            detail += '; чужой рост: ' + ', '.join(repr(n)[:160] for n in foreign[:3])
    if expected and (pct < warning or rapid):
        emit('expected', 'disk-' + path, 'ожидаемо: идёт ' + ', '.join(unit for unit, _ in active)
             + f'; {subject}; свободно {pct}%; ' + eta_text + '; ' + detail)
    # A newly found foreign writer must not inherit the ordinary alarm's quiet window.
    warn_key = ('disk-foreign-warn-' if active and foreign else 'disk-warn-') + path
    rate_key = ('disk-foreign-rate-' if active and foreign else 'disk-rate-') + path
    if pct < warning and not expected:
        emit('alarm', warn_key, f'DISK_WARN{warning}: {subject}: свободно {pct}% < {warning}%; '
             + eta_text + '; ' + detail)
    if pct < critical:
        emit('alarm', 'disk-' + path, f'DISK_CRIT{critical}: {subject}: свободно {pct}% < {critical}%; '
             + eta_text + '; ' + detail)
    if rapid and not expected:
        emit('alarm', rate_key,
             f'DISK_RATE: {subject}: свободное упало на {drop / GIB:.2f} GiB за {dt} с '
             f'(порог {drop_gib} GiB); ' + eta_text + '; ' + detail)

PY_DISK
); kod=$?
if [ "$kod" -ne 0 ]; then
  net_dannyh "дисковая выборка" "$kod" "отказ обработчика"
  dobycha_failed=1
fi
while IFS=$'\t' read -r disk_kind disk_key disk_text; do
  case "$disk_kind" in
    alarm)
      problems=$((problems+1))
      alert "$disk_key" "🔴 $(esc "$disk_text")"
      ;;
    expected)
      problems=$((problems+1))
      printf '%s\n' "$disk_text"
      ;;
    error)
      net_dannyh "$disk_key" 2 "$disk_text"
      dobycha_failed=1
      ;;
    '') ;;
    *) net_dannyh "дисковый протокол" 2 "неизвестный ответ"; dobycha_failed=1 ;;
  esac
done <<< "$disk_result"

# RU: 1.0.1: недоставленная тревога — провал юнита кодом 3, а не 0: иначе беда, которую сторож увидел,
# RU: не дошла ни до человека, ни до соседнего сторожа служб. Проверяется ПЕРВОЙ — код 2 «неполна» её не перекроет.
# EN: 1.0.1: an undelivered alert fails the unit with exit 3, not 0 — otherwise a problem the watchdog saw reaches
# EN: neither a human nor the neighbouring service watchdog. Checked FIRST so exit 2 "incomplete" does not hide it.
if [ "$nedostavleno" -ne 0 ]; then
  echo "🔴 тревог НЕ доставлено: $nedostavleno (помощник $ALERT) — юнит failed (код 3); известных проблем: $problems"
  exit 3
fi
if [ "$dobycha_failed" -ne 0 ]; then
  echo "проверка неполна: часть предметов не измерена (место на диске и/или журнал запусков — строки СЛЕПОТА выше); известных проблем: $problems"
  exit 2
fi
# RU: Настройки нет — проход неполон: код 2 (юнит failed), причина названа. Проблемы места, если были, уже сказаны.
# EN: No settings — the pass is incomplete: exit 2 (unit failed), reason named. Disk problems, if any, were already reported.
if [ "$nastrojki_net" -ne 0 ]; then
  echo "проверка неполна: настройки нет ($CONF) — службы и память НЕ наблюдаются; известных проблем: $problems"
  exit 2
fi
if [ "$problems" -eq 0 ]; then
  echo "ok: всё проверенное в порядке ($(date -Iseconds))"
else
  echo "problems: $problems"
fi
exit 0
