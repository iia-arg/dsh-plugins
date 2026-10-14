#!/opt/omega/venv/bin/python3 -B
# RU: Единственный плановый вызов ночного обслуживания памяти: по очереди запускает ступени
# RU: «счёт памяти» → «уроки» → «чистка» → «судья» (каждую в изолированном дочернем процессе с пределом
# RU: времени), сводит их исходы в один отчёт и шлёт одну итоговую строку владельцу.
# EN: The single scheduled entry point of nightly memory maintenance: runs the stages
# EN: "memory count" → "lessons" → "cleanup" → "judge" in turn (each in an isolated child process with a
# EN: time limit), merges their outcomes into one report and sends one summary line to the owner.
#
# RU: Кто зовёт: юнит systemd/dsh-pamyat-obsluzhivanie.service (ExecStart=… runner.py --run), который
# RU: поднимает таймер systemd/dsh-pamyat-obsluzhivanie.timer в 04:00 по Москве; ручной запуск — тем же
# RU: юнитом. Учётная запись — omega (User=/Group= в юните), интерпретатор — venv OMEGA с -B.
# RU: Ключ модели-судьи готовит до старта и убирает после prepare_key.py (от root, ExecStartPre/ExecStopPost).
# RU: Режим --heartbeat — только чтение таймера и состояния (см. heartbeat.py).
# EN: Caller: the systemd/dsh-pamyat-obsluzhivanie.service unit (ExecStart=… runner.py --run), started by
# EN: the systemd/dsh-pamyat-obsluzhivanie.timer at 04:00 Moscow time; a manual run uses the same unit.
# EN: Account — omega (User=/Group= in the unit), interpreter — the OMEGA venv with -B.
# EN: The judge model key is prepared before start and removed after by prepare_key.py (as root,
# EN: ExecStartPre/ExecStopPost). The --heartbeat mode only reads the timer and state (see heartbeat.py).
#
# RU: Читает: состояние таймера (systemctl is-enabled); реестр агентов (через lessons.load_agents);
# RU: базу OMEGA DB и журнал-источник JOURNAL (через ступени); STATE/judge/state.json (сверка очереди).
# RU: Пишет: STATE/run.lock (замок); STATE/runs/<run_id>.json и файлы ступеней <run_id>.<ступень>.json;
# RU: STATE/latest.json (его читает heartbeat). Ступени пишут своё сами: уроки — в локальную память
# RU: и OMEGA, чистка — в локальную память только в боевом режиме, судья — своё состояние в STATE/judge.
# RU: Шлёт: одну строку итога через agent-alert --plain.
# EN: Reads: timer state (systemctl is-enabled); agent registry (via lessons.load_agents);
# EN: the OMEGA database DB and the source journal JOURNAL (through stages); STATE/judge/state.json (queue audit).
# EN: Writes: STATE/run.lock (lock); STATE/runs/<run_id>.json and stage files <run_id>.<stage>.json;
# EN: STATE/latest.json (read by heartbeat). Stages write their own data: lessons — to local memory
# EN: and OMEGA, cleanup — to local memory only in apply mode, judge — its state under STATE/judge.
# EN: Sends: one summary line via agent-alert --plain.
#
# RU: Коды возврата: 0 — ok / finding / disabled (маска); 1 — error или timeout; 2 — доставка итога
# RU: неизвестна (перекрывает 0 и 1); 3 — busy, замок держит другой прогон (отчёт и письмо не делаются).
# EN: Exit codes: 0 — ok / finding / disabled (mask); 1 — error or timeout; 2 — summary delivery unknown
# EN: (overrides 0 and 1); 3 — busy, another run holds the lock (no report, no message).
#
# RU: Чего НЕ делает: не повторяет доставку итога при неясном исходе; не размаскирует таймер;
# RU: не шлёт отдельных уведомлений судьи (их признаки входят в общий итог).
# RU: НЕ ловит: прогон с другим --state-dir (у него свой замок); посторонних писателей OMEGA, не берущих
# RU: этот замок; прочтение итога владельцем (accepted значит лишь, что agent-alert завершился с кодом 0).
# EN: Does NOT: retry summary delivery after an ambiguous outcome; unmask the timer;
# EN: send separate judge notifications (their signals go into the common summary).
# EN: Does NOT catch: a run with another --state-dir (it has its own lock); other OMEGA writers that do not
# EN: take this lock; the owner actually reading the summary (accepted only means agent-alert exited 0).
"""One scheduled caller, isolated read-only judge, one summary."""
# RU: Строка документации модуля выше выводится в --help (argparse description=__doc__), поэтому
# RU: оставлена побайтно как в исходнике, вместе с внутренним номером пункта.
# EN: The module docstring above is shown by --help (argparse description=__doc__), so it is kept
# EN: byte-for-byte as in the source, internal item number included.
import argparse
import datetime as dt
import fcntl
import json
import multiprocessing as mp
import os
from pathlib import Path
import signal
import subprocess
import time
import uuid
import judge
import lessons
import chistka
import memory_count
from lessons_store import Refused, integrity
from heartbeat import heartbeat, timer_state, masked
# RU: Имя узла для текстов тревог и отчёта — из системы, а не зашитое в код: на машине авторов совпадает с прежним.
# EN: Node name for alert and report texts — from the system, not hard-coded: on the authors' machine it equals the old one.
UZEL = os.uname().nodename

TIMER = 'dsh-pamyat-obsluzhivanie.timer'
# RU: Каталог состояния (StateDirectory юнита, режим 0700).
# EN: State directory (the unit's StateDirectory, mode 0700).
STATE = Path('/var/lib/dsh-pamyat-obsluzhivanie')
# RU: Боевая база OMEGA и журнал кандидатов на вытеснение рядом с ней — источники для судьи.
# EN: Production OMEGA database and the eviction-candidates journal next to it — judge sources.
DB = Path('/var/lib/omega/.omega/omega.db')
JOURNAL = DB.with_name('kandidaty-vytesneniya.jsonl')
# RU: Известные незамаскированные состояния таймера (тот же перечень, что в heartbeat.py).
# EN: Known non-masked timer states (same set as in heartbeat.py).
ALLOWED = {'enabled', 'enabled-runtime', 'disabled', 'static', 'linked', 'linked-runtime'}
UTC = dt.timezone.utc


def atomic(path, value):
    """RU: Атомарная запись JSON через judge.atomic_json: временный файл рядом → fsync → os.replace
    → fsync каталога. Читатель видит прежний или новый файл целиком, но не половину.
    EN: Atomic JSON write via judge.atomic_json: temp file alongside → fsync → os.replace
    → fsync of the directory. A reader sees the old or the new file in full, never half.
    """
    judge.atomic_json(path, value)


def queue_audit(state):
    """RU: Независимая сверка остатка очереди судьи по сохранённому state/judge/state.json.
    Выход: {'status': 'ok', 'pending': N} — версия 1 и словарь queue; 'not_measured' — файла нет;
    'error' — файл не читается или не та схема. Исключения не выпускает. Побочных эффектов нет.
    EN: Independent audit of the judge queue remainder from the saved state/judge/state.json.
    Output: {'status': 'ok', 'pending': N} — version 1 and a queue dict; 'not_measured' — no file;
    'error' — unreadable file or wrong schema. Raises nothing. No side effects.
    """
    try:
        d = json.loads((state/'judge/state.json').read_text())
        if d.get('version') != 1 or not isinstance(d.get('queue'), dict):
            raise ValueError('schema')
        return {'status': 'ok', 'pending': len(d['queue'])}
    except FileNotFoundError:
        return {'status': 'not_measured', 'pending': None, 'reason': 'judge_state_absent'}
    except Exception:
        return {'status': 'error', 'pending': None, 'reason': 'judge_state_unreadable'}


def child(step, target):
    """RU: Тело дочернего процесса ступени. Выполняет step() и атомарно пишет в target
    {'status': 'ok', 'result': …} либо {'status': 'error', 'reason': …}.
    Причина ошибки — текст исключения только для Refused (именованный отказ), иначе лишь имя класса:
    текст прочих исключений может нести данные. Перехватывается и BaseException (в т.ч. SystemExit).
    EN: Body of a stage child process. Runs step() and atomically writes to target
    {'status': 'ok', 'result': …} or {'status': 'error', 'reason': …}.
    The error reason is the exception text only for Refused (a named refusal), otherwise just the class
    name: other exception texts may carry data. BaseException (incl. SystemExit) is caught too.
    """
    # RU: Своя сессия и группа процессов: родитель потом гасит всю группу по p.pid (см. terminate).
    # EN: Own session and process group: the parent later kills the whole group by p.pid (see terminate).
    os.setsid()
    # RU: stdout и stderr работника уводятся в /dev/null: его вывод не попадает в журнал службы.
    # EN: The worker's stdout and stderr go to /dev/null: its output does not reach the service journal.
    with open(os.devnull, 'w') as sink:
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        try:
            result = {'status': 'ok', 'result': step()}
        except BaseException as e:
            result = {'status': 'error', 'reason': str(e) if isinstance(e, Refused) else type(e).__name__}
        atomic(target, result)


def terminate(p):
    """RU: Гасит процесс ступени и всю его группу: SIGTERM → ожидание до 3 с → SIGKILL → ожидание до 3 с.
    Если группы уже нет — бьёт по самому процессу, если он ещё жив. Вызывается всегда, в finally ступени.
    EN: Stops the stage process and its whole group: SIGTERM → wait up to 3 s → SIGKILL → wait up to 3 s.
    If the group is already gone, signals the process itself if still alive. Always called, in the stage's finally.
    """
    # RU: Работник может выйти раньше своих потомков, игнорирующих TERM: поэтому гасим и группу.
    # EN: The worker may exit before its TERM-ignoring descendants: reap the group too.
    try:
        os.killpg(p.pid, signal.SIGTERM)
    except ProcessLookupError:
        if p.is_alive():
            p.terminate()
    p.join(3)
    try:
        os.killpg(p.pid, signal.SIGKILL)
    except ProcessLookupError:
        if p.is_alive():
            p.kill()
    p.join(3)


# RU: B-N-1667 r3: доля сбоев модели среди вызовов прогона, с которой прогон — error (ниже — finding, пары ждут в очереди).
# EN: B-N-1667 r3: share of failed model calls per run at which the run is an error (below it — a finding).
OSHIBOK_MODELI_DOLYA = 0.10


def stage(step, target, timeout, timer):
    """RU: Запускает одну ступень в дочернем процессе и возвращает её исход словарём.
    Вход: step — функция ступени; target — файл результата; timeout — предел в секундах; timer — состояние таймера.
    Выход: 'disabled' (маска до старта или во время работы), 'timeout' (предел вышел),
    'error' с reason 'worker_no_result' (процесс вышел с ненулевым кодом или без файла результата),
    исход child при отказе ступени, либо словарь результата ступени; его status заменяется на 'error',
    если в результате есть непустое поле error или доля сбоев модели ≥ OSHIBOK_MODELI_DOLYA (B-N-1667 r3; меньше — finding).
    Побочные эффекты: процесс-ступень и файл target; по выходу ступень и её группа всегда гасятся.
    Отказы: ValueError('worker_result_schema') — результат не словарь; исключения timer() (в т.ч.
    неизвестное состояние таймера, превышение 10 с) уходят вызывающему.
    EN: Runs one stage in a child process and returns its outcome as a dict.
    Input: step — stage function; target — result file; timeout — limit in seconds; timer — timer state.
    Output: 'disabled' (mask before start or during the run), 'timeout' (limit reached),
    'error' with reason 'worker_no_result' (non-zero exit or no result file),
    the child's outcome on stage refusal, or the stage result dict; its status becomes 'error'
    if the result has a non-empty error field or the failed model call share reaches OSHIBOK_MODELI_DOLYA (B-N-1667 r3; fewer failures — finding).
    Side effects: the stage process and target file; on exit the stage and its group are always stopped.
    Refusals: ValueError('worker_result_schema') — result is not a dict; timer() exceptions (incl. an
    unknown timer state or exceeding 10 s) propagate to the caller.
    """
    value = timer()
    if masked(value):
        return {'status':'disabled','reason':value,'pending':None}
    # RU: Контекст fork: функция ступени (часто лямбда) передаётся без сериализации.
    # EN: fork context: the stage function (often a lambda) is passed without pickling.
    p = mp.get_context('fork').Process(target=child, args=(step, target))
    p.start()
    deadline = time.monotonic() + timeout
    try:
        # RU: Ожидание шагами не дольше 1 секунды; после каждого шага, если работник жив,
        # RU: заново спрашиваем таймер: маска, поставленная во время ступени, прерывает её.
        # RU: monotonic — чтобы перевод системных часов не сдвигал предел.
        # EN: Wait in steps of at most 1 second; after each step, if the worker is alive,
        # EN: re-check the timer: a mask set during the stage interrupts it.
        # EN: monotonic so that system clock changes do not shift the limit.
        while p.is_alive():
            left = deadline - time.monotonic()
            if left <= 0:
                return {'status': 'timeout', 'pending': None}
            p.join(min(1, left))
            if p.is_alive():
                value = timer()
                if masked(value):
                    return {'status': 'disabled', 'reason': value, 'pending': None}
        if p.exitcode != 0 or not target.exists():
            return {'status': 'error', 'reason': 'worker_no_result', 'pending': None}
        d = json.loads(target.read_text())
        if d['status'] != 'ok':
            return {**d, 'pending': None}
        result = d['result']
        if not isinstance(result, dict):
            raise ValueError('worker_result_schema')
        # RU: B-N-1667 r3: сбой модели на отдельных парах (негодный ответ, сеть) — пары остаются в очереди и пробуются следующей ночью;
        # RU: прогон из-за них — finding, а не error. error — ошибка самого прогона (journal и т. п.) или сбоем кончилась доля
        # RU: вызовов ≥ OSHIBOK_MODELI_DOLYA (модель/ключ/сеть недоступны массово). Было с 0.1.0-alpha.2: любой failures → error
        # RU: (при 40 вызовах в сутки не всплывало; при 460 — 1 негодный JSON красил весь прогон, 05.10 14:42Z).
        # EN: B-N-1667 r3: per-pair model failures leave pairs queued and make the run a finding; error only for run errors or when
        # EN: the failed share of calls is >= OSHIBOK_MODELI_DOLYA.
        failures = result.get('failures') or []
        calls = result.get('calls') or 0
        massovo = bool(failures) and (not calls or len(failures) >= calls * OSHIBOK_MODELI_DOLYA)
        # RU: B-N-1667 r4: sboi_trevoga — судья видит сбои SBOI_NOCHEJ ночей подряд (один раз на цепочку) → error.
        # EN: B-N-1667 r4: sboi_trevoga — failures on SBOI_NOCHEJ consecutive nights (once per chain) -> error.
        status = 'error' if result.get('error') or massovo or result.get('sboi_trevoga') else ('finding' if failures else result.get('status', 'ok'))
        return {**result, 'status': status}
    finally:
        terminate(p)


def send(message):
    """RU: Шлёт итоговую строку владельцу через agent-alert --plain (текст — через stdin, не через argv).
    Предел 90 секунд; ненулевой код или превышение предела — исключение (check=True).
    Вывод agent-alert отбрасывается. НЕ доказывает прочтение: код 0 значит лишь, что канал принял вызов.
    EN: Sends the summary line to the owner via agent-alert --plain (text via stdin, not argv).
    90-second limit; non-zero exit or timeout raises (check=True).
    agent-alert output is discarded. Does NOT prove reading: exit 0 only means the channel accepted the call.
    """
    subprocess.run(['/usr/local/bin/agent-alert', '--plain'], input=message, text=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90, check=True)


def vydat_nedelyu(fajl, notify):
    """RU: B-N-1667: шлёт части недельной выдачи судьи (файл vydacha-<день>.json, его пишет judge.run) тем же notify, что итог,
    по одной, по порядку. Все приняты — файл удаляется (тексты памяти не копятся на диске); отказ — файл остаётся для ручного
    разбора, остальные части не шлются. Выход: строка исхода для отчёта. НЕ доказывает прочтение (как и итог).
    EN: B-N-1667: sends the judge weekly listing parts through the same notify as the summary, one by one; all accepted —
    the file is removed; a failure keeps the file and stops sending. Returns an outcome string for the report."""
    try:
        chasti = json.loads(fajl.read_text())['chasti']
    except (OSError, ValueError, KeyError):
        return 'unreadable'
    for i, chast in enumerate(chasti, 1):
        try:
            notify(chast)
        except Exception:
            return f'unknown {i}/{len(chasti)}'
    fajl.unlink()
    return f'accepted {len(chasti)}'


def execute(state=STATE, *, db=DB, journal=JOURNAL, timer=timer_state, step=None,
            notify=send, timeout=1800, now=None, lesson_step=None, chistka_step=None, count_step=None):
    """RU: Один прогон обслуживания. Выход: (отчёт, код возврата); коды — в шапке файла.
    Вход: state — каталог состояния; db, journal — источники судьи; timer, notify, now — подмены для проб;
    step, lesson_step, chistka_step, count_step — подмены ступеней. Штатный режим (production) — когда
    step не задан: тогда запускаются все ступени боевыми функциями. Если step задан, запускаются только
    явно переданные ступени и судья.
    Порядок: счёт памяти (60 с) → уроки (900 с) → чистка (900 с) → судья (min(timeout, 1800) с) →
    сверка очереди → целостность уроков (только штатно) → сведение статуса → итог и доставка.
    Сумма пределов ступеней (60 + 900 + 900 + 1800 = 3660 с) больше deadline отчёта (3600 с);
    общий предел службы держит systemd (TimeoutStartSec юнита).
    Отказы до замка: ValueError('state_contains_source') — каталог состояния — корень или содержит DB/JOURNAL.
    Все исключения внутри прогона (включая KeyboardInterrupt от SIGTERM, см. main) превращаются
    в status=error с именем класса; итог при этом всё равно сохраняется и отправляется.
    EN: One maintenance run. Output: (report, exit code); codes are in the file header.
    Input: state — state directory; db, journal — judge sources; timer, notify, now — test overrides;
    step, lesson_step, chistka_step, count_step — stage overrides. Production mode is when step is not given:
    then all stages run with production functions. If step is given, only explicitly passed stages and the judge run.
    Order: memory count (60 s) → lessons (900 s) → cleanup (900 s) → judge (min(timeout, 1800) s) →
    queue audit → lesson integrity (production only) → status merge → summary and delivery.
    The sum of stage limits (60 + 900 + 900 + 1800 = 3660 s) exceeds the report deadline (3600 s);
    the overall service limit is enforced by systemd (the unit's TimeoutStartSec).
    Refusal before the lock: ValueError('state_contains_source') — state dir is root or contains DB/JOURNAL.
    All exceptions inside a run (including KeyboardInterrupt from SIGTERM, see main) become
    status=error with the class name; the summary is still saved and sent.
    """
    # RU: Каталог состояния не может быть корнем и не может содержать базу или журнал-источник.
    # EN: The state directory may not be root and may not contain the source database or journal.
    state = Path(state).resolve()
    if state == Path('/') or any(Path(p).resolve().is_relative_to(state) for p in (db, journal)):
        raise ValueError('state_contains_source')
    # RU: Всё создаваемое прогоном закрыто для группы и прочих (как и UMask=0077 в юните).
    # EN: Everything the run creates is closed to group and others (like UMask=0077 in the unit).
    os.umask(0o077)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    # RU: Замок прогона: неблокирующий flock на STATE/run.lock (как flock -n). Второй одновременный
    # RU: прогон с тем же каталогом состояния сразу получает busy и код 3 — без судьи и без письма.
    # RU: Замок снимается при закрытии файла, т.е. по выходу из блока with (и при гибели процесса).
    # EN: Run lock: non-blocking flock on STATE/run.lock (like flock -n). A second concurrent run
    # EN: with the same state directory gets busy and exit 3 at once — no judge, no message.
    # EN: The lock is released when the file closes, i.e. on leaving the with block (and if the process dies).
    with (state/'run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            report = {'status': 'busy', 'reason': 'another_run_holds_flock'}
            print(json.dumps(report), flush=True)
            return report, 3
        # RU: run_id = время старта UTC + 12 шестнадцатеричных знаков случайного uuid; формат проверяет heartbeat.
        # RU: deadline = старт + 3600 с; heartbeat требует ровно это значение.
        # EN: run_id = UTC start time + 12 hex chars of a random uuid; heartbeat checks the format.
        # EN: deadline = start + 3600 s; heartbeat requires exactly this value.
        started = now or dt.datetime.now(UTC)
        run_id = started.strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12]
        runs = state/'runs'
        runs.mkdir(mode=0o700, exist_ok=True)
        path = runs/(run_id+'.json')
        report = {'version': 1, 'run_id': run_id, 'started': started.isoformat(),
                  'deadline': (started+dt.timedelta(seconds=3600)).isoformat(),
                  'status': 'running', 'delivery': 'not_attempted',
                  'lessons': {'status': 'not_run', 'reason': 'not_started'}}
        # RU: Сохраняет отчёт дважды атомарно: в файл прогона и в latest.json (его читает heartbeat).
        # RU: Первое сохранение — со статусом running, до любой работы: гибель процесса видна как просрочка.
        # EN: Saves the report twice atomically: to the run file and to latest.json (read by heartbeat).
        # EN: The first save is status running, before any work: a dead process shows up as overdue.
        def save():
            atomic(path, report)
            atomic(state/'latest.json', report)
        save()
        try:
            # RU: Неизвестное состояние таймера — ошибка, а не «можно работать».
            # EN: An unknown timer state is an error, not "go ahead".
            value = timer()
            if value not in ALLOWED and not masked(value):
                raise RuntimeError('timer_state_unknown')
            if masked(value):
                report.update(status='disabled', reason=value)
            else:
                production = step is None
                # RU: Счёт памяти — до любых записей обслуживания, тем же счётчиком ядра, без сброса отсечки.
                # EN: Memory count — before any maintenance writes, same core counter, no cutoff reset.
                if production or count_step is not None:
                    if count_step is None:
                        agents = lessons.load_agents(lessons.REGISTRY)
                        report['memory_count'] = {'status': 'running', 'expected': len(agents),
                                                  'expected_agents': [a['agent'] for a in agents]}
                        # RU: Знаменатель (поимённо) сохраняется до запуска ступени — даже если она не уложится в предел.
                        # EN: Keep the denominator (by name) before the stage runs — even if the worker times out.
                        save()
                        count_step = lambda: memory_count.run_stage(agents)
                    report['memory_count'] = {**report.get('memory_count', {}),
                        **stage(count_step, runs/(run_id+'.count.json'), 60, timer)}
                # RU: Уроки: перенос уроков из файлов агентов в локальную память и OMEGA, предел 900 с.
                # EN: Lessons: transfer of lessons from agent files into local memory and OMEGA, 900 s limit.
                if production or lesson_step is not None:
                    lesson_step = lesson_step or (lambda: lessons.run_stage(state,omega_db=db))
                    report['lessons'] = stage(lesson_step,runs/(run_id+'.lessons.json'),900,timer)
                # RU: Маска, замеченная на ступени уроков, останавливает весь прогон: чистка и судья не идут.
                # EN: A mask seen during the lessons stage stops the whole run: cleanup and judge do not run.
                if report['lessons']['status'] == 'disabled':
                    report.update(status='disabled',reason=report['lessons']['reason'])
                else:
                    # RU: Чистка локальной памяти (ступень-заглушка: стирает текст старых записей, уже лежащих в OMEGA;
                    # RU: см. chistka.py) — после уроков (они пишут новое локально), до судьи.
                    # RU: По умолчанию СУХАЯ (только перечень); боевая — только при chistka.json {"primenyat": true}
                    # RU: в каталоге состояния.
                    # EN: Local memory cleanup (a stub stage: erases text of old records already stored in OMEGA;
                    # EN: see chistka.py) — after lessons (they write new local data), before the judge. DRY by default (list only); apply mode only with chistka.json
                    # EN: {"primenyat": true} in the state directory.
                    if production or chistka_step is not None:
                        chistka_step = chistka_step or (lambda: chistka.run_stage(state, lessons.load_agents(lessons.REGISTRY), db))
                        report['chistka'] = stage(chistka_step, runs/(run_id+'.chistka.json'), 900, timer)
                    # RU: Судья: разбор кандидатов моделью; источник открывается только на чтение (по README),
                    # RU: собственные уведомления судьи заглушены (lambda message: None) — всё идёт в общий итог.
                    # EN: Judge: model review of candidates; the source is opened read-only (per README),
                    # EN: the judge's own notifications are muted (lambda message: None) — all goes to the summary.
                    if step is None:
                        step = lambda: judge.run(Path(db), Path(journal), state/'judge',
                                                 judge.DeepSeek(), lambda message: None)
                    report['judge'] = stage(step, runs/(run_id+'.worker.json'), min(timeout, 1800), timer)
                    report['queue_audit'] = queue_audit(state)
                    # RU: Сведение статуса. Основа — статус судьи; ok судьи с ростом очереди, секретными
                    # RU: или длинными парами либо записями без векторов становится finding.
                    # EN: Status merge. The base is the judge status; judge ok with queue growth, secret
                    # EN: or oversize pairs, or records without vectors becomes finding.
                    report['status'] = report['judge']['status']
                    j = report['judge']
                    if report['status'] == 'ok' and (j.get('growth') or j.get('secret_pairs') or j.get('oversize') or j.get('coverage', {}).get('without_vectors')):
                        report['status'] = 'finding'
                    # RU: Целостность уроков — отдельный читатель OMEGA и локальных записей, только в штатном режиме.
                    # EN: Lesson integrity — a separate reader of OMEGA and local records, production mode only.
                    if production:
                        report['lesson_integrity'] = integrity(db,state)
                    # RU: Ошибка или таймаут любой прочей проверки делает весь прогон error; иначе их finding
                    # RU: поднимает ok до finding. Статус disabled от судьи не перекрывается.
                    # RU: Сам статус судьи timeout в этот перечень не входит и остаётся итоговым как есть.
                    # EN: An error or timeout in any other check makes the whole run error; otherwise their finding
                    # EN: raises ok to finding. A disabled status from the judge is not overridden.
                    # EN: The judge's own timeout status is not in this list and stays as the result as is.
                    checks=[report['lessons'],report['queue_audit'],report.get('lesson_integrity',{}),report.get('chistka',{}),report.get('memory_count',{})]
                    if report['status'] != 'disabled':
                        if any(x.get('status') in {'error','timeout'} for x in checks):report['status']='error'
                        elif report['status']=='ok' and any(x.get('status')=='finding' for x in checks):report['status']='finding'
                    else:
                        report['reason'] = report['judge']['reason']
        # RU: Перехват BaseException — включая KeyboardInterrupt, в который main превращает SIGTERM:
        # RU: при остановке службы отчёт всё равно закрывается статусом error.
        # EN: BaseException is caught — including the KeyboardInterrupt that main turns SIGTERM into:
        # EN: when the service is stopped the report is still closed with status error.
        # RU: Причина — текст для Refused (именованный отказ: registry_not_set и т.п.), как в child; иначе лишь имя класса.
        # EN: Reason — the text for Refused (a named refusal: registry_not_set etc.), as in child; otherwise just the class name.
        except BaseException as e:
            report.update(status='error', reason=str(e) if isinstance(e, Refused) else type(e).__name__)
            report['queue_audit'] = queue_audit(state)
        report['finished'] = (now or dt.datetime.now(UTC)).isoformat()
        save()
        # RU: Итог шлётся при любом статусе, кроме disabled (маска — без письма владельцу).
        # RU: Отсутствующие значения печатаются словами «не измерено», а не нулём. Текст памяти в итог не входит.
        # EN: The summary is sent for any status except disabled (mask — no message to the owner).
        # EN: Missing values are printed as "not measured", never as zero. Memory text is not included.
        if report['status'] != 'disabled':
            j = report.get('judge', {})
            q = report.get('queue_audit', {})
            pending = j.get('pending')
            summary = (f'память {UZEL} {run_id}: {report["status"]}; судья разобрано '
                       f'{j.get("reviewed", "не измерено")}, противоречий новых {j.get("protivorechij_novyh", "не измерено")}, очередь '
                       f'{pending if pending is not None else "не измерено"} (сохранённый остаток={q.get("pending") if q.get("pending") is not None else "не измерено"}), вызовов '
                       f'{j.get("daily_calls", "не измерено")}/{judge.MAX_CALLS}; '
                       f'ошибок модели {len(j["failures"]) if isinstance(j.get("failures"), list) else "не измерено"} из {j.get("calls", "не измерено")}, '
                       f'ночей подряд со сбоями {j.get("sboi_nochej_podryad", "не измерено")}, отложено пар {j.get("otlozheno_vsego", "не измерено")}; '
                       f'рост очереди={j.get("growth", "не измерено")}, секретных={j.get("secret_pairs", "не измерено")}, '
                       f'длинных={j.get("oversize", "не измерено")}, просмотрено={j.get("prosmotreno", "не измерено")}, без векторов={j.get("coverage", {}).get("without_vectors", "не измерено")}; '
                       f'уроки={report["lessons"].get("status")}, локально новых={report["lessons"].get("new_local","не измерено")}, '
                       f'OMEGA подтверждено={report["lessons"].get("omega_verified","не измерено")}, ранее={report["lessons"].get("cached_verified",0)}, '
                       f'отказов={report["lessons"].get("refused","не измерено")}, без связи={report["lessons"].get("bez_svyazi","не измерено")}'
                       f'{" (не измерено: "+", ".join(report["lessons"]["bez_svyazi_ne_izmereno"])+")" if report["lessons"].get("bez_svyazi_ne_izmereno") else ""}, причина={report["lessons"].get("reason",report["lessons"].get("reasons",{}))}; '
                       f'дубли source_key={report.get("lesson_integrity",{}).get("duplicate_source_keys","не измерено")}, '
                       f'ошибки квитанций={len(report.get("lesson_integrity",{}).get("receipt_issues",[]))}; '
                       f'чистка={report.get("chistka",{}).get("rezhim","не запускалась")}: снял бы '
                       f'{sum(a.get("snyal_by",0) for a in report.get("chistka",{}).get("agents",[]))}, стёрто '
                       f'{sum(a.get("sterto",0) for a in report.get("chistka",{}).get("agents",[]))}, слепота '
                       f'{sum(1 for a in report.get("chistka",{}).get("agents",[]) if a.get("status")=="slepota")}; '
                       f'{memory_count.summary(report.get("memory_count", {"status": "not_run"}))}; '
                       f'{"недельная выдача судьи: пар " + str(j["nedelya"]["par"]) + ", сообщений " + str(j["nedelya"]["chastej"]) + "; " if j.get("nedelya") else ""}отчёт {path}')
            report['summary'] = summary
            # RU: Сначала на диск ложится delivery=attempted, потом идёт попытка: если процесс погибнет посреди
            # RU: отправки, на диске останется attempted, а не not_attempted — и повтор вслепую не делается.
            # EN: delivery=attempted is saved to disk first, then the attempt: if the process dies mid-send,
            # EN: the disk shows attempted rather than not_attempted — and no blind retry is made.
            report['delivery'] = 'attempted'
            save()
            try:
                notify(summary)
                report['delivery'] = 'accepted'
            except Exception:
                report['delivery'] = 'unknown'
            save()
            # RU: B-N-1667: недельная выдача — после итога, отдельными сообщениями; неизвестный исход — код 2, как у итога.
            # EN: B-N-1667: weekly listing after the summary as separate messages; an unknown outcome gives exit code 2.
            if (j.get('nedelya') or {}).get('fajl'):
                report['nedelya_delivery'] = vydat_nedelyu(Path(j['nedelya']['fajl']), notify)
                save()
            # RU: B-N-1832: уроки без связи с OMEGA или «не измерено» — ОТДЕЛЬНОЙ строкой тревоги: finding у пакета обычен
            # RU: (pending, отказы блоков), в итоговой строке число утонет. Исход доставки — svyaz_delivery; неизвестный — код 2.
            # EN: B-N-1832: lessons without an OMEGA link, or not measured, get a SEPARATE alert line; unknown delivery — exit 2.
            les = report.get('lessons', {})
            if les.get('bez_svyazi') or les.get('bez_svyazi_ne_izmereno'):
                kto = [f"{a['agent']}={a['svyaz']['bez_svyazi']}" for a in les.get('agents', [])
                       if (a.get('svyaz') or {}).get('bez_svyazi')]
                stroka = (f'🔴 память {UZEL} {run_id}: уроки без связи с OMEGA: {les.get("bez_svyazi")}'
                          + (f' ({", ".join(kto)})' if kto else '')
                          + (f'; не измерено: {", ".join(les["bez_svyazi_ne_izmereno"])}' if les.get('bez_svyazi_ne_izmereno') else '')
                          + '; проверка: svyazat_zadnim --suho --agent <имя>')
                report['svyaz_delivery'] = 'attempted'
                save()
                try:
                    notify(stroka)
                    report['svyaz_delivery'] = 'accepted'
                except Exception:
                    report['svyaz_delivery'] = 'unknown'
                save()
        print(json.dumps(report, ensure_ascii=False), flush=True)
        code = 0 if report['status'] in {'ok', 'finding', 'disabled'} else 1
        if report['delivery'] == 'unknown' or not str(report.get('nedelya_delivery', 'accepted')).startswith('accepted') \
                or report.get('svyaz_delivery') == 'unknown':
            code = 2
        return report, code


def main():
    """RU: Точка входа: ровно один из режимов --run или --heartbeat, плюс --state-dir.
    --heartbeat: вердикт heartbeat.py (только чтение), печать сообщения, его код.
    --run: SIGTERM превращается в KeyboardInterrupt, чтобы execute успел закрыть отчёт; возвращает код execute.
    Неизвестные аргументы отвергает argparse.
    EN: Entry point: exactly one of --run or --heartbeat, plus --state-dir.
    --heartbeat: heartbeat.py verdict (read-only), prints the message, returns its code.
    --run: SIGTERM is turned into KeyboardInterrupt so execute can close the report; returns execute's code.
    Unknown arguments are rejected by argparse.
    """
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--run', action='store_true')
    g.add_argument('--heartbeat', action='store_true')
    p.add_argument('--state-dir', type=Path, default=STATE)
    args = p.parse_args()
    if args.heartbeat:
        code, message = heartbeat(args.state_dir)
        print(message)
        return code
    def interrupted(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    return execute(args.state_dir)[1]


if __name__ == '__main__':
    raise SystemExit(main())
