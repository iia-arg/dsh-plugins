#!/usr/bin/python3
# RU: Внешний heartbeat ночного обслуживания памяти: по состоянию таймера и файлу latest.json отвечает,
# RU: прошёл ли плановый прогон, идёт ли он, просрочен ли, или таймер замаскирован слишком долго.
# EN: External heartbeat of the nightly memory maintenance: from the timer state and latest.json it answers
# EN: whether the scheduled run completed, is in progress, is overdue, or the timer has been masked too long.
#
# RU: Кто зовёт: (1) внешний root-сторож машины (по README — раз в 10 минут; сам сторож вне этого пакета),
# RU: запуская отдельную root-копию этого файла системным /usr/bin/python3 -I -S -B — поэтому только
# RU: стандартная библиотека; (2) runner.py --heartbeat импортирует отсюда heartbeat, timer_state и masked;
# RU: (3) runner.py использует timer_state и masked для проверки маски во время прогона.
# EN: Callers: (1) the machine's external root watcher (per README every 10 minutes; the watcher lives outside
# EN: this package), running a separate root copy of this file with the system /usr/bin/python3 -I -S -B —
# EN: hence standard library only; (2) runner.py --heartbeat imports heartbeat, timer_state and masked from here;
# EN: (3) runner.py uses timer_state and masked to check the mask during a run.
#
# RU: Читает: вывод systemctl is-enabled о таймере; mtime ссылки маски таймера; STATE/latest.json
# RU: (пишет его runner.py под учётной записью omega). Пишет: ничего, только одну строку в stdout.
# EN: Reads: systemctl is-enabled output for the timer; mtime of the timer's mask link; STATE/latest.json
# EN: (written by runner.py under the omega account). Writes: nothing, only one stdout line.
#
# RU: Коды возврата: 0 — прогон выполнен и доставлен / идёт в срок / таймер замаскирован меньше
# RU: MASK_LIMIT_DAYS суток; 1 — красное: маска дольше предела, прогон просрочен, планового прогона нет,
# RU: прогон закончился не ok/finding или доставка итога не accepted; 2 — не измерено (таймер или
# RU: состояние недоступны, схема испорчена, дата маски неизвестна или из будущего).
# EN: Exit codes: 0 — run completed and delivered / in progress within limits / timer masked for less than
# EN: MASK_LIMIT_DAYS days; 1 — red: mask older than the limit, run overdue, scheduled run missing,
# EN: run ended other than ok/finding or summary delivery not accepted; 2 — not measured (timer or state
# EN: unavailable, corrupt schema, mask date unknown or in the future).
#
# RU: Чего НЕ делает: не запускает и не размаскирует таймер, не шлёт тревоги сам (это делает зовущий),
# RU: не проверяет содержимое отчёта прогона сверх схемы и статусов.
# RU: НЕ ловит: отказ самого зовущего сторожа и его канала; расписание таймера, отличное от зашитого здесь
# RU: окна 01:00/02:05 UTC (окно задано числами в коде, а не читается из юнита таймера).
# EN: Does NOT: start or unmask the timer, send alerts itself (the caller does), or inspect the run report
# EN: beyond schema and statuses.
# EN: Does NOT catch: failure of the calling watcher or its channel; a timer schedule different from the
# EN: 01:00/02:05 UTC window hard-coded here (the window is numbers in code, not read from the timer unit).
"""Root heartbeat: stdlib only. Invoke with /usr/bin/python3 -I -S -B."""
# RU: Строка документации модуля выше выводится в --help (argparse description=__doc__),
# RU: поэтому описание вынесено в комментарии, а она оставлена как есть.
# EN: The module docstring above is shown by --help (argparse description=__doc__),
# EN: so the description lives in comments and the docstring is left unchanged.
import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import os
import stat
import re

TIMER = 'dsh-pamyat-obsluzhivanie.timer'
# RU: Каталог состояния службы (StateDirectory юнита); владелец — учётная запись omega.
# EN: Service state directory (the unit's StateDirectory); owned by the omega account.
STATE = Path('/var/lib/dsh-pamyat-obsluzhivanie')
UTC = dt.timezone.utc
# RU: Известные НЕзамаскированные состояния systemctl is-enabled. Всё вне этого перечня и маски — отказ.
# EN: Known NON-masked systemctl is-enabled states. Anything outside this set and the mask states is refused.
ALLOWED = {'enabled', 'enabled-runtime', 'disabled', 'static', 'linked', 'linked-runtime'}
# RU: Сколько суток маска считается законной остановкой; дольше — красное (rc 1).
# EN: How many days a mask counts as a legitimate stop; longer — red (rc 1).
MASK_LIMIT_DAYS = 3
# RU: B-N-2028: запись решения «выключено владельцем» (кладёт root по слову владельца; поля kto=, kogda=, slovo=).
# RU: Маска + годная запись — rc 0 громкой строкой при любом сроке; маска без записи — прежний предел MASK_LIMIT_DAYS;
# RU: запись без маски или негодная запись — rc 1. Годна только запись root, которую пишет только root (и каталог тоже):
# RU: иначе любой, кто пишет в каталог, гасил бы тревогу. НЕ ловит: решение, отменённое владельцем словом, а запись
# RU: оставлена (судья видит файл, не слово); маску, снятую и поставленную заново при живой записи.
# EN: B-N-2028: "disabled by the owner" decision record (root places it on the owner's word; fields kto=, kogda=, slovo=).
# EN: Mask + valid record — rc 0 with a loud line at any age; mask without record — the old MASK_LIMIT_DAYS limit;
# EN: record without mask or invalid record — rc 1. Valid only if root owns it and only root can write it (directory too).
DECISION = Path('/etc/dsh-pamyat-obsluzhivanie/vyklyucheno')

def timer_state(command=None):
    """RU: Возвращает состояние таймера по systemctl is-enabled.
    Вход: необязательная команда вместо /usr/bin/systemctl (для проб). Выход: строка состояния.
    Предел 10 секунд (TimeoutExpired уходит вызывающему). Код возврата systemctl не используется —
    смотрится только stdout. Отказ: RuntimeError('timer_state_unknown') — значение вне известных.

    EN: Returns the timer state from systemctl is-enabled.
    Input: optional command instead of /usr/bin/systemctl (for tests). Output: state string.
    10-second limit (TimeoutExpired propagates to the caller). systemctl's exit code is not used —
    only stdout is inspected. Refusal: RuntimeError('timer_state_unknown') — value outside the known set.
    """
    p = subprocess.run([*(command or ['/usr/bin/systemctl']), 'is-enabled', TIMER],
                       capture_output=True, text=True, timeout=10)
    value = p.stdout.strip()
    if value in ALLOWED | {'masked', 'masked-runtime'}:
        return value
    raise RuntimeError('timer_state_unknown')


def masked(value):
    """RU: True, если состояние — постоянная или временная (runtime) маска.
    EN: True if the state is a persistent or runtime mask.
    """
    return value in {'masked', 'masked-runtime'}


def mask_timestamp(roots=None):
    """RU: Дата установки маски таймера — mtime ссылки TIMER → /dev/null.
    Вход: необязательный перечень каталогов юнитов (для проб); по умолчанию постоянный и runtime каталоги
    systemd. Выход: datetime в UTC. Отказ: RuntimeError('mask_date_unknown') — нигде нет ссылки на /dev/null.
    НЕ ловит: маску, поставленную в другом каталоге юнитов; ссылку, у которой mtime изменили вручную.

    EN: Mask installation date — mtime of the TIMER → /dev/null link.
    Input: optional list of unit directories (for tests); defaults to systemd's persistent and runtime
    directories. Output: UTC datetime. Refusal: RuntimeError('mask_date_unknown') — no /dev/null link anywhere.
    Does NOT catch: a mask placed in another unit directory; a link whose mtime was changed by hand.
    """
    # RU: Дата — настоящий mtime ссылки, а не «момент, когда этот наблюдатель впервые случайно запустился».
    # RU: Снять и поставить маску заново — значит получить новую дату.
    # EN: Date is the actual symlink mtime, not "first time this observer happened to run".
    # EN: Removing and re-adding the mask yields a new date.
    for root in roots or (Path('/etc/systemd/system'), Path('/run/systemd/system')):
        path = root/TIMER
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) and path.resolve() == Path('/dev/null'):
            return dt.datetime.fromtimestamp(info.st_mtime, UTC)
    raise RuntimeError('mask_date_unknown')


def read_decision(path=DECISION, owner=0):
    """RU: Читает запись решения. Возврат: None — записи нет; ('ok', поля, kogda — datetime) — годна;
    ('bad', причина) — запись есть, но ей нельзя верить. owner — подмена владельца для проб (по умолчанию root).
    EN: Reads the decision record. Returns None — no record; ('ok', fields with kogda as datetime) — valid;
    ('bad', reason) — a record exists but cannot be trusted. owner overrides the owner for tests (root by default).
    """
    path = Path(path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    except OSError as e:
        return 'bad', 'не открывается: '+(e.strerror or type(e).__name__)
    try:
        info, parent = os.fstat(fd), os.lstat(path.parent)
        if not stat.S_ISREG(info.st_mode):
            return 'bad', 'не обычный файл'
        for what, i in (('файл', info), ('каталог', parent)):
            if i.st_uid != owner or i.st_mode & 0o022:
                return 'bad', what+' не root или пишется не только root'
        if info.st_size > 4096:
            return 'bad', 'больше 4 КиБ'
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(4097)
    finally:
        os.close(fd)
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return 'bad', 'не UTF-8'
    fields = {}
    for line in text.splitlines():
        key, sep, value = line.strip().partition('=')
        if sep and not key.startswith('#'):
            fields[key.strip()] = value.strip()
    lack = [k for k in ('kto', 'kogda', 'slovo') if not fields.get(k)]
    if lack:
        return 'bad', 'нет полей: '+', '.join(lack)
    try:
        kogda = dt.datetime.fromisoformat(fields['kogda'])
    except ValueError:
        return 'bad', 'kogda не дата ISO'
    if kogda.tzinfo is None:
        return 'bad', 'kogda без пояса'
    return 'ok', {**fields, 'kogda': kogda}


def read_latest(state):
    """RU: Безопасно читает state/latest.json и возвращает разобранный JSON.
    Отказы: OSError (в т.ч. ELOOP, если файл — ссылка), ValueError('unsafe_state_file') — не обычный файл
    или больше 1 МиБ по fstat, ValueError('state_too_large') — вырос больше 1 МиБ во время чтения,
    JSONDecodeError — не JSON. Побочных эффектов нет.
    НЕ ловит: ссылки в родительских каталогах пути (O_NOFOLLOW защищает только последний компонент).

    EN: Safely reads state/latest.json and returns the parsed JSON.
    Refusals: OSError (incl. ELOOP if the file is a link), ValueError('unsafe_state_file') — not a regular file
    or over 1 MiB by fstat, ValueError('state_too_large') — grew past 1 MiB while reading,
    JSONDecodeError — not JSON. No side effects.
    Does NOT catch: links in parent directories of the path (O_NOFOLLOW guards only the last component).
    """
    # RU: Состоянием владеет omega; root не должен идти по ссылкам и читать неограниченный поток.
    # RU: O_NOFOLLOW — не открывать ссылку; O_NONBLOCK — не зависнуть на FIFO, подложенной вместо файла;
    # RU: тип и размер проверяются по уже открытому дескриптору (fstat), а не по имени.
    # EN: omega owns state; root must not follow links or read an unbounded stream.
    # EN: O_NOFOLLOW — do not open a link; O_NONBLOCK — do not hang on a FIFO planted instead of the file;
    # EN: type and size are checked on the already opened descriptor (fstat), not by name.
    maximum = 1024 * 1024
    fd = os.open(Path(state)/'latest.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > maximum:
            raise ValueError('unsafe_state_file')
        # RU: closefd=False — дескриптор закрывается один раз, в finally ниже.
        # RU: Читаем на байт больше предела, чтобы заметить рост файла после fstat.
        # EN: closefd=False — the descriptor is closed exactly once, in the finally below.
        # EN: Read one byte past the limit to notice the file growing after fstat.
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError('state_too_large')
        return json.loads(data)
    finally:
        os.close(fd)


def heartbeat(state=STATE, *, timer=timer_state, now=None, mask_seen=None, decision=None):
    """RU: Вердикт живости обслуживания: кортеж (код, сообщение); коды — в шапке файла.
    Вход: каталог состояния; подмены для проб — timer (состояние таймера), now (текущее время UTC),
    mask_seen (дата маски). Побочных эффектов нет. Любое исключение внутри превращается в код 2
    «не измерено» — отказ прибора не выдаётся за зелёное или красное.

    EN: Maintenance liveness verdict: a (code, message) tuple; codes are in the file header.
    Input: state directory; test overrides — timer (timer state), now (current UTC time),
    mask_seen (mask date). No side effects. Any exception inside becomes code 2
    "not measured" — an instrument failure is never reported as green or red.
    """
    try:
        value = timer()
        # RU: read_decision берётся при вызове (не при определении) — тесты подменяют его в setUp, а не читают живой /etc.
        # EN: read_decision is resolved at call time (not definition) — tests patch it in setUp instead of reading the live /etc.
        reshenie = (decision or read_decision)()
        # RU: Ветка маски: законная остановка до MASK_LIMIT_DAYS суток (rc 0), дольше — rc 1.
        # RU: Дата маски из будущего (с допуском 60 секунд) — испорченный прибор, rc 2.
        # EN: Mask branch: a legitimate stop for up to MASK_LIMIT_DAYS days (rc 0), longer — rc 1.
        # EN: A mask date in the future (60-second tolerance) means a broken instrument, rc 2.
        if masked(value):
            since = (mask_seen or mask_timestamp)()
            current = now or dt.datetime.now(UTC)
            if since > current+dt.timedelta(seconds=60):
                raise ValueError('mask_timestamp_future')
            if reshenie and reshenie[0] == 'ok':
                d = reshenie[1]
                if d['kogda'] > current+dt.timedelta(seconds=60):
                    return 1, f'запись решения {DECISION}: kogda из будущего; timer {value}; masked_since={since.isoformat()}'
                return 0, (f"выключено владельцем: {d['slovo'][:300]}; кто {d['kto'][:80]}; с {d['kogda'].isoformat()}; "
                           f'timer {value}; masked_since={since.isoformat()}')
            if reshenie:
                return 1, f'запись решения {DECISION} негодна ({reshenie[1]}); timer {value}; masked_since={since.isoformat()}'
            overdue = current-since >= dt.timedelta(days=MASK_LIMIT_DAYS)
            return (1 if overdue else 0), f'disabled: timer {value}; masked_since={since.isoformat()}; limit_days={MASK_LIMIT_DAYS}'
        if value not in ALLOWED:
            raise ValueError('timer_unknown')
        if reshenie is not None:
            return 1, f'запись решения {DECISION} есть, а таймер {value} не замаскирован — снять запись или вернуть маску'
        # RU: Окно ожидания в UTC: таймер стоит на 04:00 по Москве = 01:00 UTC. До 02:05 UTC текущих суток
        # RU: требуется прогон не раньше 01:00 UTC предыдущих суток, после 02:05 — не раньше 01:00 UTC текущих.
        # RU: Часы окна заданы числами и с юнитом таймера автоматически не сверяются.
        # EN: Expectation window in UTC: the timer fires at 04:00 Moscow = 01:00 UTC. Before 02:05 UTC today
        # EN: a run no earlier than 01:00 UTC yesterday is required; after 02:05 — no earlier than 01:00 UTC today.
        # EN: The window hours are literal numbers and are not checked against the timer unit automatically.
        now = now or dt.datetime.now(UTC)
        deadline = now.replace(hour=2, minute=5, second=0, microsecond=0)
        required = now.replace(hour=1, minute=0, second=0, microsecond=0)
        if now < deadline:
            required -= dt.timedelta(days=1)
        d = read_latest(state)
        # RU: Проверка схемы: формат run_id как у runner.py, статус и доставка — из закрытых перечней.
        # EN: Schema check: run_id format as produced by runner.py, status and delivery from closed sets.
        if (not isinstance(d, dict) or not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}', str(d.get('run_id', '')))
                or d.get('status') not in {'running', 'ok', 'finding', 'disabled', 'error', 'timeout'}
                or d.get('delivery') not in {'not_attempted', 'attempted', 'accepted', 'unknown'}):
            raise ValueError('invalid_state_schema')
        # RU: Старт не из будущего (допуск 60 секунд), версия 1, deadline ровно старт + 3600 секунд
        # RU: (то же число записывает runner.py; оно совпадает с TimeoutStartSec=60min юнита).
        # EN: Start not in the future (60-second tolerance), version 1, deadline exactly start + 3600 seconds
        # EN: (runner.py writes the same number; it matches the unit's TimeoutStartSec=60min).
        start = dt.datetime.fromisoformat(d['started'])
        if (start > now+dt.timedelta(seconds=60) or d.get('version') != 1
                or dt.datetime.fromisoformat(d['deadline']) != start+dt.timedelta(seconds=3600)):
            raise ValueError('invalid_state')
        # RU: Идущий прогон допустим до deadline + 90 секунд (то же число, что TimeoutStopSec=90s юнита);
        # RU: дальше «running» значит, что процесс погиб, не успев записать итог.
        # EN: A running run is allowed until deadline + 90 seconds (the same number as the unit's TimeoutStopSec=90s);
        # EN: beyond that "running" means the process died before writing its result.
        if d['status'] == 'running':
            if now > dt.datetime.fromisoformat(d['deadline'])+dt.timedelta(seconds=90):
                return 1, 'heartbeat: run overdue '+d['run_id']
            return 0, 'heartbeat: running '+d['run_id']
        if start < required:
            return 1, 'heartbeat: scheduled run missing since '+required.isoformat()
        # RU: Зелёное — только ok/finding И доставка итога accepted. disabled после снятия маски тоже красное,
        # RU: пока не пройдёт новый прогон.
        # EN: Green only for ok/finding AND summary delivery accepted. disabled after unmasking is red too
        # EN: until a new run completes.
        if d['status'] not in {'ok', 'finding'} or d.get('delivery') != 'accepted':
            return 1, 'heartbeat: '+d['status']+' delivery='+d.get('delivery', 'unknown')
        return 0, 'heartbeat: completed '+d['run_id']
    except Exception:
        return 2, 'heartbeat: not measured (timer/state unavailable)'


def main():
    """RU: Точка входа root-копии: --state-dir (по умолчанию STATE); печатает сообщение, возвращает код.
    EN: Root copy entry point: --state-dir (defaults to STATE); prints the message, returns the code.
    """
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir',type=Path,default=STATE)
    args=parser.parse_args()
    code,message=heartbeat(args.state_dir)
    print(message)
    return code

if __name__ == '__main__':
    raise SystemExit(main())
