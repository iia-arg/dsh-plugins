#!/usr/bin/env python3
"""B-N-2063: state of one private walker run; never discover or kill other units."""
import collections
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time


def rows(path):
    return path.read_text().splitlines() if path.exists() else []


def report(root):
    plan = rows(root / 'plan')
    known = (root / 'plan').exists()
    if not known:
        declared = Path(os.environ.get('PERECHEN_STENDOV') or
                        '/opt/iskra/workspace/dorabotki/perechen-boevyh-stendov.txt')
        plan = [p for p in rows(declared) if p and not p.startswith('#')]
        print('СЛЕПОТА: список области до обрыва не собран; ниже объявленный перечень, не план исполнения')
    started = rows(root / 'started')
    finished = rows(root / 'finished')
    remaining_started = collections.Counter(started)
    unstarted = []
    for path in plan:
        if remaining_started[path]:
            remaining_started[path] -= 1
        else:
            unstarted.append(path)
    remaining_finished = collections.Counter(finished)
    interrupted = []
    for path in started:
        if remaining_finished[path]:
            remaining_finished[path] -= 1
        else:
            interrupted.append(path)
    print(f'НЕПРОГНАННЫЕ СТЕНДЫ: не начаты {len(unstarted)} из {len(plan)}; '
          f'прерваны {len(interrupted)}; завершены {len(finished)}')
    for path in interrupted:
        print('ПРЕРВАН: ' + path)
    for path in unstarted:
        print('НЕ ПРОГНАН: ' + path)
    return 2 if not known else int(bool(unstarted or interrupted))


def cleanup(root):
    deadline = time.monotonic() + 9

    def run(args):
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError('scope cleanup deadline')
        return subprocess.run(args, capture_output=True, text=True, timeout=min(2, left))

    # Stop launchers BEFORE reading the final scope list: a registered unit may not exist yet.
    (root / 'cancelled').touch()
    launcher = rows(root / 'launcher')
    if launcher:
        pid, wrapper = map(int, launcher[0].split())
        if min(pid, wrapper) <= 1 or pid == wrapper:
            raise ValueError('invalid launcher identity')
        def leader():
            try:
                return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
            except FileNotFoundError:
                return None

        def members():
            found = []
            for proc in Path('/proc').glob('[0-9]*/stat'):
                try:
                    fields = proc.read_text().rsplit(')', 1)[1].split()
                except FileNotFoundError:
                    continue
                if int(fields[2]) == pid and int(fields[3]) == pid:
                    found.append(fields)
            return found

        def kill_group(sig):
            fields = leader()
            if (fields and int(fields[1]) != wrapper) or not members():
                print(f'ПРОПУСК ГРУППЫ {pid}: нет подтверждённой pgrp=session={pid} запускателя ({sig})')
                return False
            run(['sudo', '-n', '/bin/kill', sig, '--', f'-{pid}'])
            return True

        fields = leader()
        if fields and int(fields[1]) == wrapper and int(fields[3]) != pid:
            # Interrupted before setsid completed: stop it before it can create the session.
            os.kill(pid, signal.SIGKILL)
        if kill_group('-TERM'):
            time.sleep(.1)
            fields = leader()
            try:
                if fields and int(fields[1]) == wrapper and int(fields[3]) == pid:
                    os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            kill_group('-KILL')
            if any(fields[0] != 'Z' for fields in members()):
                raise RuntimeError('launcher group survived termination')
    units = rows(root / 'scopes')
    if not units:
        return 0
    owner = (root / 'scope-owner').read_text().strip()
    if not re.fullmatch('[1-9][0-9]*-[0-9a-f]{16}', owner):
        raise ValueError('invalid scope owner')
    if not all(re.fullmatch(r'obhod-stend-' + owner + r'-[0-9]+\.scope', u) for u in units):
        raise ValueError('scope outside this run')
    units = list(dict.fromkeys(units))
    def command(args, privileged=False):
        return run((['sudo', '-n'] if privileged else []) + ['systemctl', *args])

    def live():
        result = command(['show', '--property=Id,LoadState,ActiveState', '--', *units])
        if result.returncode:
            raise RuntimeError('scope state not read')
        active = []
        seen = set()
        for block in result.stdout.strip().split('\n\n'):
            fields = dict(line.split('=', 1) for line in block.splitlines() if '=' in line)
            unit = fields.get('Id')
            if unit not in units or fields.get('ActiveState') not in ('active', 'activating', 'deactivating', 'inactive', 'failed'):
                raise ValueError('scope state response')
            seen.add(unit)
            if fields['ActiveState'] != 'inactive' and fields.get('LoadState') != 'not-found':
                active.append(unit)
        if seen != set(units):
            raise ValueError('scope state response incomplete')
        return active

    active = live()
    if not active:
        return 0
    print('ОСТАНОВКА SCOPE (только этот прогон): ' + ' '.join(active), flush=True)
    command(['kill', '--kill-whom=all', '--signal=TERM', '--', *active], True)
    term_deadline = min(deadline - 2, time.monotonic() + 5)
    while active and time.monotonic() < term_deadline:
        time.sleep(.1)
        active = live()
    if active:
        command(['kill', '--kill-whom=all', '--signal=KILL', '--', *active], True)
    while active and time.monotonic() < deadline:
        time.sleep(.1)
        active = live()
    if active:
        raise RuntimeError('scope survived TERM/KILL: ' + ' '.join(active))
    print('ОСТАНОВКА SCOPE: живых scope этого прогона не осталось')
    return 0


def notify(alert, text):
    # Reserve 64 units for the part heading: the entire argument stays <=2000 UTF-16.
    chunks = []
    current = ''
    for line in text.splitlines(keepends=True):
        for char in line:
            if len((current + char).encode('utf-16-le')) // 2 > 1936:
                cut = current.rfind('\n') + 1
                if cut:
                    chunks.append(current[:cut]); current = current[cut:]
                else:
                    chunks.append(current); current = ''
            current += char
    if current:
        chunks.append(current)
    deadline = time.monotonic() + 20
    for number, chunk in enumerate(chunks, 1):
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError(f'alert deadline; unsent parts {number}–{len(chunks)}')
        message = f'обходчик стендов: часть {number}/{len(chunks)}\n' + chunk
        if len(message.encode('utf-16-le')) // 2 > 2000:
            raise ValueError('alert heading exceeds reserved space')
        # One file for both streams avoids pipe backpressure while keeping their write order.
        with tempfile.TemporaryFile() as output:
            p = subprocess.Popen([alert, message], stdout=output,
                                 stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = p.wait(timeout=left)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait(timeout=1)
                raise TimeoutError(f'alert part {number}/{len(chunks)} not confirmed')
            finally:
                print(f'канал тревог {alert}: код {p.returncode}', flush=True)
                output.seek(0)
                for _ in range(20):
                    line = output.readline()
                    if not line:
                        break
                    print('  канал: ' + line.decode('utf-8', errors='replace').rstrip('\r\n'), flush=True)
        if code:
            raise RuntimeError(f'alert part {number}/{len(chunks)} returned {code}')
    return 0


if __name__ == '__main__':
    try:
        action, directory, *args = sys.argv[1:]
        root = Path(directory)
        if action == 'report' and not args:
            code = report(root)
        elif action == 'cleanup' and not args:
            code = cleanup(root)
        elif action == 'notify' and len(args) == 1:
            code = notify(args[0], sys.stdin.read())
        else:
            raise ValueError('unknown action/arguments')
    except Exception as error:
        print('СЛЕПОТА B-N-2063: ' + str(error), file=sys.stderr)
        code = 2
    sys.exit(code)
